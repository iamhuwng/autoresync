import type { NotificationFailureReport } from '../../../../src/services/reportingService.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';

/** Uses the existing admin report schema and the authenticated actor's permissions. */
export const reportBookNotificationFailure = async (input: {
  readonly env: RepositoryEnv;
  readonly actorId: string;
  readonly token: string;
  readonly report: NotificationFailureReport;
  readonly fetchImpl?: typeof fetch;
}): Promise<void> => {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const signal = AbortSignal.timeout(15_000);
  const rtdb = new FirebaseRtdbRestClient({ env: input.env,
    fetchImpl: (url, init) => fetchImpl.call(globalThis, url, { ...init, signal }), firebaseAuthToken: true,
    getFirebaseAuthToken: async () => input.token });
  const config = await rtdb.readValue('reports/config') as {
    mode?: unknown; categories?: { errors?: unknown };
  } | null;
  if (config?.mode === 'off' || config?.categories?.errors === false) return;
  const timestamp = Date.now();
  const id = crypto.randomUUID();
  const report = input.report;
  const created = await rtdb.writeIfMatch(`reports/errors/${new Date(timestamp).toISOString().slice(0, 10)}/${id}`, {
    id, timestamp, feature: report.feature, severity: 'warning',
    message: `notification_failure:${report.feature}:${report.action}:${report.code}`,
    stack: '', page: '/book-homework/assignments', userId: input.actorId,
    userName: 'Book actor', userRole: 'teacher', browser: 'worker', screenSize: 'unknown',
    isBoundary: false, contextData: report, breadcrumbs: [], diagnosticUrl: null,
    componentStack: null, duplicateCount: 1,
  }, 'null_etag');
  if (!created) throw new Error('book_notification_report_conflict');
};
