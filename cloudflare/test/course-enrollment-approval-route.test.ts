import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  events: [] as string[],
  verify: vi.fn(async () => { state.events.push('verify'); return { valid: true, uid: 'teacher1' }; }),
  approve: vi.fn(async () => 'transitioned' as 'transitioned' | 'replayed' | 'conflict'),
  construct: vi.fn(),
  token: vi.fn(async (..._args: Parameters<typeof import('../notification-firestore-auth').token>) => 'source-oauth-token'),
}));
vi.mock('../notification-firestore-auth.ts', () => ({ token: state.token }));

vi.mock('../src/upload-worker/firebase-verification.js', () => ({
  createFirebaseVerifier: () => ({ verifyAuthorizationHeader: state.verify }),
}));
vi.mock('../src/upload-worker/course-book-placement/enrollment-authority.ts', () => ({
  FirebaseCourseEnrollmentAuthorityPort: class {
    constructor() { state.construct(); }
    approveCourseRequest = state.approve;
  },
}));

import { approveCourseEnrollmentRequest } from '../course-enrollment-approval-route';
import { handleCourseEnrollmentApproval } from '../course-enrollment-approval-handler';

const request = new Request('https://bridge.example/course-enrollment-approval', { method: 'POST' });
const args = () => ({
  request,
  authorization: 'Bearer firebase-id-token',
  input: { requestId: 'request_1', operationId: 'a1b2c3d4-1234-4123-8123-a1b2c3d4e5f6' },
  fetcher: vi.fn(async () => Response.json({})),
  readSource: vi.fn(async (path: string) => { state.events.push(`read:${path}`); return state.values.get(path) ?? null; }),
  env: {
    FIREBASE_PROJECT_ID: 'project1', FIREBASE_DB_URL: 'https://project1.firebaseio.com',
    FIREBASE_WEB_API_KEY: 'web-key',
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: 'notification@example.test',
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: '{"client_email":"notification@example.test","private_key":"private"}',
    COURSE_ENROLLMENT_APPROVAL_ENABLED: 'true',
    NOTIFICATION_RATE_LIMITER: { limit: vi.fn(async () => { state.events.push('limit'); return { success: true }; }) },
  },
});

const pendingRequest = () => ({
  id: 'request_1', teacherId: 'teacher1', courseId: 'course1', studentId: 'student1',
  type: 'join', status: 'pending', requestedAt: 1, expiresAt: Date.now() + 60_000,
});

describe('Direct-Course enrollment approval bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.events.length = 0;
    state.verify.mockImplementation(async () => { state.events.push('verify'); return { valid: true, uid: 'teacher1' }; });
    state.approve.mockResolvedValue('transitioned');
    state.token.mockResolvedValue('source-oauth-token');
    state.values.clear();
    state.values.set('users/teacher1', { role: 'teacher' });
    state.values.set('course_requests/request_1', pendingRequest());
    state.values.set('courses/course1', { ownerId: 'teacher1' });
  });

  it('fails closed before authentication or source access when activation is absent', async () => {
    const call = args();
    call.env.COURSE_ENROLLMENT_APPROVAL_ENABLED = '';
    await expect(approveCourseEnrollmentRequest(call)).rejects.toThrow('course_request_denied');
    expect(state.verify).not.toHaveBeenCalled();
    expect(call.readSource).not.toHaveBeenCalled();
    expect(state.construct).not.toHaveBeenCalled();
  });
  it('authenticates, meters, invokes the exact request command, and confirms canonical approval readback', async () => {
    state.values.set('course_requests/request_1', pendingRequest());
    state.values.set('course_book_authority/operations/a1b2c3d4-1234-4123-8123-a1b2c3d4e5f6', null);
    state.approve.mockImplementationOnce(async () => {
      state.values.set('course_requests/request_1', { ...pendingRequest(), status: 'approved', processedBy: 'teacher1', processedAt: Date.now() });
      state.values.set('course_book_authority/operations/a1b2c3d4-1234-4123-8123-a1b2c3d4e5f6', {
        operation: 'enrollment-request-transition', operationId: 'a1b2c3d4-1234-4123-8123-a1b2c3d4e5f6',
        requestId: 'request_1', actorUid: 'teacher1', courseId: 'course1', studentId: 'student1', requestType: 'join',
      });
      return 'transitioned';
    });
    const call = args();
    const fetcher = vi.fn(async function (this: typeof globalThis, url: string | URL | Request) {
      expect(this).toBe(globalThis);
      const path = decodeURIComponent(new URL(String(url)).pathname.slice(1).replace(/\.json$/u, ''));
      state.events.push(`read:${path}`);
      return Response.json(state.values.get(path) ?? null);
    });
    const response = await handleCourseEnrollmentApproval(new Request(request.url, {
      method: 'POST', headers: { Authorization: call.authorization, 'Content-Type': 'application/json' },
    }), call.env, fetcher, call.input);
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(fetcher.mock.contexts.every((receiver) => receiver === globalThis)).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'transitioned' });
    expect(call.env.NOTIFICATION_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: 'course-enrollment-approval:teacher1' });
    expect(state.approve).toHaveBeenCalledWith({ actorUid: 'teacher1', requestId: 'request_1', operationId: call.input.operationId });
    expect(state.events.slice(0, 3)).toEqual([
      'verify', 'limit', 'read:users/teacher1',
    ]);
  });

  it('revalidates current teacher role and course ownership before accepting a matching replay', async () => {
    const call = args();
    state.values.set('course_requests/request_1', { ...pendingRequest(), status: 'approved', processedBy: 'teacher1', processedAt: Date.now() });
    state.values.set('course_book_authority/operations/a1b2c3d4-1234-4123-8123-a1b2c3d4e5f6', {
      operation: 'enrollment-request-transition', operationId: call.input.operationId, requestId: 'request_1',
      actorUid: 'teacher1', courseId: 'course1', studentId: 'student1', requestType: 'join',
    });
    state.values.set('users/teacher1', { role: 'student' });
    await expect(approveCourseEnrollmentRequest(call)).rejects.toThrow('course_request_denied');
    expect(state.approve).not.toHaveBeenCalled();
    state.values.set('users/teacher1', { role: 'teacher' });
    state.values.set('courses/course1', { ownerId: 'another_teacher' });
    await expect(approveCourseEnrollmentRequest(call)).rejects.toThrow('course_request_owner_denied');
    expect(state.approve).not.toHaveBeenCalled();
  });

  it('fails closed for a different request, actor, class course, or expired pending request', async () => {
    await expect(approveCourseEnrollmentRequest({ ...args(), input: { requestId: 'other_1', operationId: args().input.operationId } }))
      .rejects.toThrow('course_request_denied');
    const wrongActor = args();
    state.verify.mockResolvedValueOnce({ valid: true, uid: 'student1' });
    await expect(approveCourseEnrollmentRequest(wrongActor)).rejects.toThrow('course_request_denied');
    const classCourse = args();
    state.values.set('courses/course1', { ownerId: 'teacher1', isClassInstance: true });
    await expect(approveCourseEnrollmentRequest(classCourse)).rejects.toThrow('course_request_owner_denied');
    const expired = args();
    state.values.set('courses/course1', { ownerId: 'teacher1' });
    state.values.set('course_requests/request_1', { ...pendingRequest(), expiresAt: Date.now() - 1 });
    await expect(approveCourseEnrollmentRequest(expired)).rejects.toThrow('course_request_denied');
    expect(state.approve).not.toHaveBeenCalled();
    expect(state.construct).not.toHaveBeenCalled();
  });

  it('hides private OAuth failures and denies source reads before authority construction', async () => {
    const call = args();
    state.token.mockRejectedValueOnce(new Error('private JWT assertion secret'));
    const makeRequest = () => new Request(request.url, {
      method: 'POST', headers: { Authorization: call.authorization, 'Content-Type': 'application/json' },
    });
    const response = await handleCourseEnrollmentApproval(makeRequest(), call.env, call.fetcher, call.input);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'course_request_unavailable' });
    expect(state.construct).not.toHaveBeenCalled();
    expect(call.fetcher).not.toHaveBeenCalled();
    const deniedRead = vi.fn(async () => new Response(null, { status: 403 }));
    const denied = await handleCourseEnrollmentApproval(makeRequest(), call.env, deniedRead, call.input);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ status: 'course_request_denied' });
    expect(state.construct).not.toHaveBeenCalled();
    const invalid = await handleCourseEnrollmentApproval(makeRequest(), call.env, call.fetcher, {
      requestId: '../private-request-secret', operationId: 'private-operation-secret',
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ status: 'course_request_invalid' });
    expect(state.construct).not.toHaveBeenCalled();
  });
});
