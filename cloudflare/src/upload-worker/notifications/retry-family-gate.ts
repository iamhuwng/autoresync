import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';

export type RetryFamilyState = {
  consecutiveFailures: number;
  lastFailedActionId?: string;
  retrySuppressed: boolean;
  lastSuccessAt?: number;
};
const initialState: RetryFamilyState = { consecutiveFailures: 0, retrySuppressed: false };
const validState = (value: unknown): value is RetryFamilyState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Number.isSafeInteger(row.consecutiveFailures)
    && Number(row.consecutiveFailures) >= 0 && Number(row.consecutiveFailures) <= 3
    && typeof row.retrySuppressed === 'boolean'
    && (row.lastFailedActionId === undefined || typeof row.lastFailedActionId === 'string')
    && (row.lastSuccessAt === undefined || Number.isSafeInteger(row.lastSuccessAt));
};

export const afterTerminalFailure = (state: RetryFamilyState, actionId: string): RetryFamilyState =>
  state.lastFailedActionId === actionId ? state : {
    ...state,
    consecutiveFailures: Math.min(3, state.consecutiveFailures + 1),
    lastFailedActionId: actionId,
    retrySuppressed: state.retrySuppressed || state.consecutiveFailures + 1 >= 3,
  };

export const afterSuccess = (state: RetryFamilyState, at: number): RetryFamilyState => ({
  ...state,
  consecutiveFailures: state.retrySuppressed ? state.consecutiveFailures : 0,
  lastFailedActionId: state.retrySuppressed ? state.lastFailedActionId : undefined,
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

  async recordTerminalFailure(family: string, actionId: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(actionId)) throw new Error('notification_action_id_invalid');
    await this.change(family, (state) => afterTerminalFailure(state, actionId));
  }

  async recordSuccess(family: string, at: number): Promise<void> {
    await this.change(family, (state) => afterSuccess(state, at));
  }

  private async change(family: string, next: (state: RetryFamilyState) => RetryFamilyState): Promise<void> {
    const path = this.path(family);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.client.readWithEtag<RetryFamilyState | null>(path);
      if (current.data !== null && !validState(current.data)) throw new Error('notification_family_gate_invalid');
      const state = current.data ?? initialState;
      const updated = next(state);
      if (updated === state || await this.client.writeIfMatch(path, updated, current.etag)) return;
    }
    throw new Error('notification_family_gate_cas_failed');
  }
}
