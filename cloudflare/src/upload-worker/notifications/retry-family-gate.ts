import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';

export type NotificationFailureReason = 'source_unavailable' | 'inbox_conflict'
  | 'inbox_missing_after_claim' | 'delivery_backend_error' | 'delivery_unconfirmed';

export type RetryFamilyState = {
  consecutiveFailures: number;
  failedActionIds?: string[];
  retrySuppressed: boolean;
  lastSuccessAt?: number;
  lastIssuePath?: string;
};
const initialState: RetryFamilyState = { consecutiveFailures: 0, retrySuppressed: false };
const validState = (value: unknown): value is RetryFamilyState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Number.isSafeInteger(row.consecutiveFailures)
    && Number(row.consecutiveFailures) >= 0 && Number(row.consecutiveFailures) <= 3
    && typeof row.retrySuppressed === 'boolean'
    && (row.failedActionIds === undefined || (Array.isArray(row.failedActionIds)
      && row.failedActionIds.length <= 3 && row.failedActionIds.every((id) => typeof id === 'string')))
    && (row.lastSuccessAt === undefined || Number.isSafeInteger(row.lastSuccessAt))
    && (row.lastIssuePath === undefined || /^reports\/errors\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_:-]{1,256}$/u.test(String(row.lastIssuePath)));
};

export const notificationIssuePath = (issueId: string, occurredAt: number): string => {
  if (!/^[A-Za-z0-9_:-]{1,256}$/u.test(issueId) || !Number.isSafeInteger(occurredAt) || occurredAt <= 0) {
    throw new Error('notification_issue_identity_invalid');
  }
  return `reports/errors/${new Date(occurredAt).toISOString().slice(0, 10)}/${issueId}`;
};

export const afterTerminalFailure = (state: RetryFamilyState, actionId: string, issuePath?: string): RetryFamilyState =>
  state.failedActionIds?.includes(actionId) ? state : {
    ...state,
    consecutiveFailures: Math.min(3, state.consecutiveFailures + 1),
    failedActionIds: [...(state.failedActionIds ?? []), actionId].slice(-3),
    ...(issuePath ? { lastIssuePath: issuePath } : {}),
    retrySuppressed: state.retrySuppressed || state.consecutiveFailures + 1 >= 3,
  };

export const afterSuccess = (state: RetryFamilyState, at: number): RetryFamilyState => ({
  ...state,
  consecutiveFailures: state.retrySuppressed ? state.consecutiveFailures : 0,
  failedActionIds: state.retrySuppressed ? state.failedActionIds : [],
  lastSuccessAt: at,
});

export class RetryFamilyGate {
  constructor(private readonly client: FirebaseRtdbRestClient) {}

  private path(family: string): string {
    if (!/^[a-z][a-z0-9-]{0,63}$/u.test(family)) throw new Error('notification_family_invalid');
    return `notification_retry_families/${family}`;
  }

  async isSuppressed(family: string): Promise<boolean> {
    const state = await this.client.readValue(this.path(family));
    if (state !== null && !validState(state)) throw new Error('notification_family_gate_invalid');
    return state?.retrySuppressed === true;
  }

  async recordTerminalFailure(family: string, actionId: string, issuePath?: string): Promise<void> {
    if (!/^[A-Za-z0-9_:-]{1,256}$/u.test(actionId)) throw new Error('notification_action_id_invalid');
    if (issuePath && !/^reports\/errors\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_:-]{1,256}$/u.test(issuePath)) {
      throw new Error('notification_issue_path_invalid');
    }
    await this.change(family, (state) => afterTerminalFailure(state, actionId, issuePath));
  }

  async recordSuccess(family: string, at: number): Promise<void> {
    const state = await this.change(family, (current) =>
      (current.consecutiveFailures === 0 && !current.lastIssuePath)
        || (current.retrySuppressed && !current.lastIssuePath && current.lastSuccessAt !== undefined)
        ? current : afterSuccess(current, at));
    const issuePath = state.lastIssuePath;
    if (!issuePath) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const issue = await this.client.readWithEtag<Record<string, unknown> | null>(issuePath);
      const context = issue.data?.contextData && typeof issue.data.contextData === 'object'
        && !Array.isArray(issue.data.contextData) ? issue.data.contextData as Record<string, unknown> : {};
      if (!issue.data || Number.isSafeInteger(context.lastSuccessAt)
        || await this.client.writeIfMatch(issuePath,
          { ...issue.data, contextData: { ...context, lastSuccessAt: at } }, issue.etag)) {
        await this.change(family, (current) => current.lastIssuePath === issuePath
          ? { ...current, lastIssuePath: undefined } : current);
        return;
      }
    }
    throw new Error('notification_success_report_cas_failed');
  }

  private async change(family: string, next: (state: RetryFamilyState) => RetryFamilyState): Promise<RetryFamilyState> {
    const path = this.path(family);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.client.readWithEtag<RetryFamilyState | null>(path);
      if (current.data !== null && !validState(current.data)) throw new Error('notification_family_gate_invalid');
      const state = current.data ?? initialState;
      const updated = next(state);
      if (updated === state || await this.client.writeIfMatch(path, updated, current.etag)) return updated;
    }
    throw new Error('notification_family_gate_cas_failed');
  }
}
