import { getAuth } from 'firebase/auth';
import { DEFAULT_NOTIFICATION_WORKER_ORIGIN } from './notificationCommandClient';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface ManualThcsGradeInput {
  readonly sessionCode: string;
  readonly studentId: string;
  readonly questionNumber: number;
  readonly pointsEarned: number;
  readonly feedback: string;
  readonly eventId?: string;
}

export const submitManualThcsGrade = async (
  input: ManualThcsGradeInput,
  options: { readonly workerOrigin?: string; readonly getIdToken?: () => Promise<string>; readonly fetchImpl?: typeof fetch } = {},
): Promise<{ readonly eventId: string; readonly notificationStatus: string }> => {
  const eventId = input.eventId ?? crypto.randomUUID();
  if (!ID.test(input.sessionCode) || !ID.test(input.studentId) || !UUID.test(eventId)
    || !Number.isSafeInteger(input.questionNumber) || input.questionNumber < 1 || input.questionNumber > 500
    || !Number.isFinite(input.pointsEarned) || input.pointsEarned < 0 || input.pointsEarned > 100
    || input.feedback.length > 2000) throw new Error('manual_thcs_grade_invalid');
  const user = getAuth().currentUser;
  const token = (await (options.getIdToken ?? (() => user?.getIdToken() ?? Promise.resolve('')))()).trim();
  if (!token) throw new Error('manual_thcs_grade_unauthenticated');
  const origin = (options.workerOrigin?.trim()
    || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
    || DEFAULT_NOTIFICATION_WORKER_ORIGIN).replace(/\/+$/u, '');
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new Error('manual_thcs_grade_origin_invalid'); }
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === 'localhost'))
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('manual_thcs_grade_origin_invalid');
  }
  const response = await (options.fetchImpl ?? globalThis.fetch)(`${parsed.origin}/grading-notifications/manual`, {
    method: 'POST', credentials: 'omit', redirect: 'error',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': eventId,
    },
    body: JSON.stringify({
      schemaVersion: 1, actionType: 'manual-question-grade', eventId,
      sessionCode: input.sessionCode, studentId: input.studentId,
      questionNumber: input.questionNumber, pointsEarned: input.pointsEarned, feedback: input.feedback,
    }),
  });
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > 4096) throw new Error('manual_thcs_grade_response_too_large');
  let body: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    body = value as Record<string, unknown>;
  } catch { throw new Error('manual_thcs_grade_response_invalid'); }
  if (!response.ok) throw new Error(typeof body.code === 'string' ? body.code : `manual_thcs_grade_http_${response.status}`);
  if ((body.status !== 'committed' && body.status !== 'replayed') || body.eventId !== eventId
    || typeof body.notificationStatus !== 'string') throw new Error('manual_thcs_grade_response_invalid');
  return { eventId, notificationStatus: body.notificationStatus };
};
