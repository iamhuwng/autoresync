import { FirebaseCourseEnrollmentAuthorityPort } from './src/upload-worker/course-book-placement/enrollment-authority.ts';
import type { Env } from './notification-firestore-bridge.ts';

const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const SOURCE_ID = /^[A-Za-z0-9._:@-]{1,160}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DEADLINE_MS = 10_000;

type CourseRequestBody = { requestId: string; operationId: string };

const record = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const exactBody = (value: Record<string, unknown>): CourseRequestBody | null => (
  Object.keys(value).length === 2
  && Object.hasOwn(value, 'requestId') && Object.hasOwn(value, 'operationId')
  && typeof value.requestId === 'string' && REQUEST_ID.test(value.requestId)
  && typeof value.operationId === 'string' && OPERATION_ID.test(value.operationId)
    ? { requestId: value.requestId, operationId: value.operationId }
    : null
);

const scopedEnv = (env: Env) => {
  const serviceKey = env.NOTIFICATION_COMMAND_GOOGLE_SA_KEY?.trim();
  if (!serviceKey || !env.FIREBASE_WEB_API_KEY?.trim()) throw new Error('course_request_unavailable');
  return {
    FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
    FIREBASE_DB_URL: env.FIREBASE_DB_URL,
    FIREBASE_WEB_API_KEY: env.FIREBASE_WEB_API_KEY,
    GOOGLE_SA_KEY: serviceKey,
  };
};

type SourceReader = (path: string, fetchImpl: typeof fetch) => Promise<unknown>;

const currentOwnerState = async (
  input: CourseRequestBody,
  actorUid: string,
  readSource: SourceReader,
  fetchImpl: typeof fetch,
): Promise<'pending' | 'replay'> => {
  const [userValue, requestValue, receiptValue] = await Promise.all([
    readSource(`users/${actorUid}`, fetchImpl),
    readSource(`course_requests/${input.requestId}`, fetchImpl),
    readSource(`course_book_authority/operations/${input.operationId}`, fetchImpl),
  ]);
  const user = record(userValue);
  const courseRequest = record(requestValue);
  if (!user || user.role !== 'teacher' || !courseRequest || courseRequest.id !== input.requestId
    || courseRequest.teacherId !== actorUid || !SOURCE_ID.test(String(courseRequest.courseId ?? ''))
    || !SOURCE_ID.test(String(courseRequest.studentId ?? ''))
    || (courseRequest.type !== 'join' && courseRequest.type !== 'unenroll')) {
    throw new Error('course_request_denied');
  }
  const courseId = String(courseRequest.courseId);
  const course = record(await readSource(`courses/${courseId}`, fetchImpl));
  if (!course || course.ownerId !== actorUid || course.isClassInstance === true || Boolean(course.archivedAt)) {
    throw new Error('course_request_owner_denied');
  }
  if (courseRequest.status === 'pending') {
    if (!Number.isSafeInteger(courseRequest.requestedAt) || Number(courseRequest.requestedAt) <= 0
      || typeof courseRequest.expiresAt !== 'number' || courseRequest.expiresAt <= Date.now()) {
      throw new Error('course_request_denied');
    }
    if (receiptValue !== null && receiptValue !== undefined) throw new Error('course_request_conflict');
    return 'pending';
  }
  const receipt = record(receiptValue);
  if (courseRequest.status === 'approved' && courseRequest.processedBy === actorUid
    && Number.isSafeInteger(courseRequest.processedAt)
    && receipt?.operation === 'enrollment-request-transition'
    && receipt.operationId === input.operationId && receipt.requestId === input.requestId
    && receipt.actorUid === actorUid && receipt.courseId === courseId
    && receipt.studentId === courseRequest.studentId && receipt.requestType === courseRequest.type) {
    return 'replay';
  }
  throw new Error('course_request_conflict');
};

/** Exact teacher decision endpoint for the existing Direct-Course request contract. */
export const approveCourseEnrollmentRequest = async (args: {
  request: Request;
  env: Env;
  input: Record<string, unknown>;
  authorization: string;
  fetcher: typeof fetch;
  readSource: SourceReader;
}): Promise<'transitioned' | 'replayed'> => {
  const body = exactBody(args.input);
  if (!body) throw new Error('course_request_invalid');
  if (args.env.COURSE_ENROLLMENT_APPROVAL_ENABLED !== 'true') {
    throw new Error('course_request_denied');
  }

  const controller = new AbortController();
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => {
    controller.abort();
    rejectDeadline(new Error('course_request_timeout'));
  }, DEADLINE_MS);
  const boundedFetch: typeof fetch = (input, init = {}) => {
    const signal = init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
    return args.fetcher.call(globalThis, input, { ...init, signal });
  };

  const work = async (): Promise<'transitioned' | 'replayed'> => {
    const { createFirebaseVerifier } = await import('./src/upload-worker/firebase-verification.js');
    const identity = await createFirebaseVerifier().verifyAuthorizationHeader(args.authorization, args.env);
    if (controller.signal.aborted) throw new Error('course_request_timeout');
    if (!identity.valid || typeof identity.uid !== 'string' || !SOURCE_ID.test(identity.uid)) {
      throw new Error('course_request_unauthenticated');
    }
    const actorUid = identity.uid;
    if (!args.env.NOTIFICATION_RATE_LIMITER?.limit) throw new Error('course_request_unavailable');
    const limited = await args.env.NOTIFICATION_RATE_LIMITER.limit({ key: `course-enrollment-approval:${actorUid}` });
    if (!limited.success) {
      throw new Error('course_request_rate_limited');
    }
    if (controller.signal.aborted) throw new Error('course_request_timeout');

    const state = await currentOwnerState(body, actorUid, args.readSource, boundedFetch);
    if (controller.signal.aborted) throw new Error('course_request_timeout');
    if (state === 'replay') return 'replayed';
    const authority = new FirebaseCourseEnrollmentAuthorityPort({ env: scopedEnv(args.env), fetchImpl: boundedFetch });
    const result = await authority.approveCourseRequest({ actorUid, requestId: body.requestId, operationId: body.operationId });
    if (result === 'conflict') throw new Error('course_request_conflict');
    if (await currentOwnerState(body, actorUid, args.readSource, boundedFetch) !== 'replay') {
      throw new Error('course_request_conflict');
    }
    return result;
  };

  try {
    return await Promise.race([work(), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
};
