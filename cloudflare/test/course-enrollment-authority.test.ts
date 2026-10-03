import { exportPKCS8, generateKeyPair } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { FirebaseCourseEnrollmentAuthorityPort } from '../src/upload-worker/course-book-placement/enrollment-authority.ts';

describe('direct Course enrollment authority', () => {
  it('approves a current direct request through one claim-scoped atomic patch and denies class ownership', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const privateKeyPem = await exportPKCS8(privateKey);
    const operationId = '00000000-0000-4000-8000-000000000103';
    const values: Record<string, unknown> = {
      'users/teacher-001': { role: 'teacher' },
      'course_requests/request-001': { id: 'request-001', teacherId: 'teacher-001', studentId: 'student-001',
        courseId: 'course-001', type: 'join', status: 'pending', requestedAt: Date.now() - 1000, expiresAt: Date.now() + 60000 },
      'courses/course-001': { ownerId: 'teacher-001' },
    };
    let patch: Record<string, any> | undefined;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === 'identitytoolkit.googleapis.com') return Response.json({ idToken: 'scoped-request-token', expiresIn: '300' });
      expect(url.searchParams.get('auth')).toBe('scoped-request-token');
      expect(init?.method).toBe('PATCH');
      patch = JSON.parse(String(init?.body));
      return Response.json({});
    });
    const port = new FirebaseCourseEnrollmentAuthorityPort({ env: {
      FIREBASE_DB_URL: 'https://database.example.test', FIREBASE_WEB_API_KEY: 'api-key',
      GOOGLE_SA_KEY: JSON.stringify({ client_email: 'course-request@example.test', private_key: privateKeyPem }),
      readDatabaseValue: async (path) => values[path] ?? null,
    }, fetchImpl: fetchImpl as typeof fetch });
    const command = { actorUid: 'teacher-001', requestId: 'request-001', operationId };
    values['courses/course-001'] = { ownerId: 'teacher-001', isClassInstance: true };
    await expect(port.approveCourseRequest(command)).rejects.toThrow('course_request_owner_denied');
    expect(fetchImpl).not.toHaveBeenCalled();
    values['courses/course-001'] = { ownerId: 'teacher-001' };
    await expect(port.approveCourseRequest(command)).resolves.toBe('transitioned');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(Object.keys(patch!)).toHaveLength(4);
    expect(patch!['course_requests/request-001']).toMatchObject({ status: 'approved', processedBy: 'teacher-001' });
    expect(patch!['course_enrollments/course-request-request-001']).toMatchObject({ enrollmentType: 'individual', status: 'active' });
    expect(patch!['course_book_authority/enrollments/course-001/student-001']).toMatchObject({ status: 'active', revision: 1 });
    expect(patch![`course_book_authority/operations/${operationId}`]).toMatchObject({ requestId: 'request-001', actorUid: 'teacher-001' });
  });

  it('uses one claim-scoped root PATCH and rejects class enrollment', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const privateKeyPem = await exportPKCS8(privateKey);
    const values: Record<string, unknown> = {
      'course_enrollments/legacy-001': { courseId: 'course-001', studentId: 'student-001', enrollmentType: 'individual', status: 'active', revision: 0 },
      'course_book_authority/enrollments/course-001/student-001': null,
      'course_book_authority/operations/00000000-0000-4000-8000-000000000102': null,
    };
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === 'identitytoolkit.googleapis.com') return Response.json({ idToken: 'scoped-course-authority-id-token', expiresIn: '300' });
      expect(url.searchParams.get('auth')).toBe('scoped-course-authority-id-token');
      expect(init?.method).toBe('PATCH');
      return Response.json({});
    });
    const port = new FirebaseCourseEnrollmentAuthorityPort({ env: { FIREBASE_DB_URL: 'https://database.example.test', FIREBASE_WEB_API_KEY: 'api-key', GOOGLE_SA_KEY: JSON.stringify({ client_email: 'course-102@example.test', private_key: privateKeyPem }), readDatabaseValue: async (path) => values[path] ?? null }, fetchImpl: fetchImpl as typeof fetch, now: () => '2026-08-05T00:00:00.000Z' });
    const result = await port.transitionDirectCourseEnrollment({ actorUid: 'teacher-001', courseId: 'course-001', studentId: 'student-001', legacyEnrollmentId: 'legacy-001', operationId: '00000000-0000-4000-8000-000000000102', status: 'revoked' });
    expect(result).toMatchObject({ status: 'transitioned', authorityEnrollment: { legacyEnrollmentId: 'legacy-001', revision: 1, status: 'revoked' } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
