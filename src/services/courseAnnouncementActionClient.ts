import { getAuth } from 'firebase/auth';
import { DEFAULT_NOTIFICATION_WORKER_ORIGIN, notificationWorkerOrigin } from './notificationCommandClient';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/iu;

export class CourseAnnouncementActionError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'CourseAnnouncementActionError';
  }
}

export async function createCourseAnnouncementAction(input: {
  readonly courseId: string;
  readonly targetClassIds: readonly string[];
  readonly title: string;
  readonly content: string;
  readonly attachments?: readonly { readonly name: string; readonly url: string; readonly type: string; readonly size: number }[];
}, options: {
  readonly actionId?: string;
  readonly workerOrigin?: string;
  readonly getIdToken?: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
} = {}): Promise<{ announcementId: string; notificationIds: string[] }> {
  const actionId = options.actionId ?? crypto.randomUUID();
  if (!UUID.test(actionId) || !ID.test(input.courseId)) throw new CourseAnnouncementActionError('course_announcement_invalid', 0);
  const user = getAuth().currentUser;
  const token = (await (options.getIdToken ?? (() => user?.getIdToken() ?? Promise.resolve('')))()).trim();
  if (!token) throw new CourseAnnouncementActionError('course_announcement_unauthenticated', 401);
  let origin: string;
  try {
    origin = notificationWorkerOrigin(options.workerOrigin?.trim()
      || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
      || DEFAULT_NOTIFICATION_WORKER_ORIGIN);
  } catch {
    throw new CourseAnnouncementActionError('course_announcement_origin_invalid', 0);
  }
  const command = {
    schemaVersion: 1,
    actionType: 'create-course-announcement',
    actionId,
    courseId: input.courseId,
    targetClassIds: [...input.targetClassIds],
    title: input.title,
    content: input.content,
    ...(input.attachments === undefined ? {} : { attachments: input.attachments.map((attachment) => ({ ...attachment })) }),
  };
  let response: Response;
  try {
    response = await (options.fetchImpl ?? globalThis.fetch)(`${origin}/course-announcements/actions`, {
      method: 'POST', credentials: 'omit', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': actionId },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new CourseAnnouncementActionError('course_announcement_action_unavailable', 0);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 65_536) throw new CourseAnnouncementActionError('course_announcement_response_too_large', 502);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    body = parsed as Record<string, unknown>;
  } catch {
    throw new CourseAnnouncementActionError('course_announcement_response_invalid', 502);
  }
  if (!response.ok) {
    throw new CourseAnnouncementActionError(typeof body.code === 'string' ? body.code : `http_${response.status}`, response.status);
  }
  if ((body.status !== 'committed' && body.status !== 'replayed') || body.announcementId !== actionId
    || !Array.isArray(body.notificationIds) || !body.notificationIds.every((id) => typeof id === 'string' && UUID.test(id))) {
    throw new CourseAnnouncementActionError('course_announcement_response_invalid', 502);
  }
  return { announcementId: actionId, notificationIds: body.notificationIds as string[] };
}
