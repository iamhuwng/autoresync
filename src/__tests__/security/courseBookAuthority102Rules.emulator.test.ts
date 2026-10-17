import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
const describeEmulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
const courseId = 'course-102';
const moduleId = 'module-102';
const studentId = 'student-102';
const legacyEnrollmentId = 'legacy-102';
const enrollmentOperationId = '00000000-0000-4000-8000-000000000102';
const releaseOperationId = '00000000-0000-4000-8000-000000000103';

let testEnv: RulesTestEnvironment;

const enrollmentClaims = (overrides: Record<string, unknown> = {}) => ({
  courseBookAuthority102: true,
  operation: 'enrollment-transition',
  actorUid: 'teacher-102',
  courseId,
  studentId,
  legacyEnrollmentId,
  expectedLegacyRevision: 4,
  expectedAuthorityRevision: 2,
  operationId: enrollmentOperationId,
  ...overrides,
});

const releaseClaims = (overrides: Record<string, unknown> = {}) => ({
  courseBookAuthority102: true,
  operation: 'release-transition',
  actorUid: 'teacher-102',
  courseId,
  moduleId,
  studentId,
  expectedReleaseRevision: 5,
  operationId: releaseOperationId,
  ...overrides,
});

const legacyEnrollment = (overrides: Record<string, unknown> = {}) => ({
  courseId,
  studentId,
  enrollmentType: 'individual',
  status: 'active',
  revision: 4,
  ...overrides,
});

const authorityEnrollment = (overrides: Record<string, unknown> = {}) => ({
  legacyEnrollmentId,
  courseId,
  studentId,
  status: 'active',
  revision: 2,
  operationId: 'prior-enrollment-operation',
  ...overrides,
});

const release = (overrides: Record<string, unknown> = {}) => ({
  courseId,
  moduleId,
  studentId,
  released: false,
  revision: 5,
  operationId: 'prior-release-operation',
  ...overrides,
});

const enrollmentPatch = (overrides: Record<string, unknown> = {}) => ({
  [`course_enrollments/${legacyEnrollmentId}`]: legacyEnrollment({
    status: 'revoked', revision: 5, operationId: enrollmentOperationId,
  }),
  [`course_book_authority/enrollments/${courseId}/${studentId}`]: authorityEnrollment({
    status: 'revoked', revision: 3, operationId: enrollmentOperationId,
  }),
  [`course_book_authority/operations/${enrollmentOperationId}`]: {
    operationId: enrollmentOperationId,
    courseId,
    studentId,
    legacyEnrollmentId,
    fingerprint: 'enrollment-fingerprint',
  },
  ...overrides,
});

const releasePatch = (overrides: Record<string, unknown> = {}) => ({
  [`course_book_authority/releases/${courseId}/${moduleId}/${studentId}`]: release({
    released: true, revision: 6, operationId: releaseOperationId,
  }),
  [`course_book_authority/operations/${releaseOperationId}`]: {
    operation: 'release-transition',
    operationId: releaseOperationId,
    actorUid: 'teacher-102',
    courseId,
    moduleId,
    studentId,
    released: true,
    revision: 6,
    fingerprint: 'release-fingerprint',
  },
  ...overrides,
});

describeEmulator('#102 Course Book authority RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-course-book-authority-102',
      database: { rules: DATABASE_RULES },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const root = context.database().ref();
      await root.set({
        users: { 'teacher-102': { role: 'teacher' }, 'admin-102': { role: 'super_admin' } },
        course_enrollments: { [legacyEnrollmentId]: legacyEnrollment() },
        course_book_authority: {
          enrollments: { [courseId]: { [studentId]: authorityEnrollment() } },
          releases: { [courseId]: { [moduleId]: { [studentId]: release() } } },
        },
      });
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('permits only the exact coupled enrollment and release transition patches', async () => {
    const enrollmentService = testEnv.authenticatedContext('course-book-service-102', enrollmentClaims()).database();
    await assertSucceeds(enrollmentService.ref().update(enrollmentPatch()));

    const releaseService = testEnv.authenticatedContext('course-book-service-102', releaseClaims()).database();
    await assertSucceeds(releaseService.ref().update(releasePatch()));

    let enrollmentValue: unknown;
    let releaseValue: unknown;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      enrollmentValue = (await context.database().ref(`course_book_authority/enrollments/${courseId}/${studentId}`).once('value')).val();
      releaseValue = (await context.database().ref(`course_book_authority/releases/${courseId}/${moduleId}/${studentId}`).once('value')).val();
    });
    expect(enrollmentValue).toMatchObject({ legacyEnrollmentId, revision: 3, operationId: enrollmentOperationId });
    expect(releaseValue).toMatchObject({ released: true, revision: 6, operationId: releaseOperationId });
  });

  it('denies partial, stale, wrong-key, existing-receipt, and extra-protected enrollment patches', async () => {
    const service = testEnv.authenticatedContext('course-book-service-102', enrollmentClaims()).database();
    await assertFails(service.ref().update(enrollmentPatch({
      [`course_book_authority/operations/${enrollmentOperationId}`]: null,
    })));
    await assertFails(service.ref().update(enrollmentPatch({
      [`course_enrollments/${legacyEnrollmentId}`]: null,
    })));
    await assertFails(service.ref().update(enrollmentPatch({
      [`course_book_authority/enrollments/${courseId}/${studentId}`]: null,
    })));
    await assertFails(testEnv.authenticatedContext('course-book-service-102', enrollmentClaims({ expectedLegacyRevision: 3 })).database()
      .ref().update(enrollmentPatch()));
    await assertFails(testEnv.authenticatedContext('course-book-service-102', enrollmentClaims({ courseId: 'course-wrong' })).database()
      .ref().update(enrollmentPatch()));
    await assertFails(service.ref().update(enrollmentPatch({
      [`course_enrollments/${legacyEnrollmentId}`]: legacyEnrollment({ revision: 6, operationId: enrollmentOperationId }),
    })));
    await assertFails(service.ref().update(enrollmentPatch({
      [`course_book_authority/releases/${courseId}/${moduleId}/${studentId}`]: release({ revision: 6 }),
    })));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref(`course_book_authority/operations/${enrollmentOperationId}`).set({
        operationId: enrollmentOperationId, courseId, studentId, legacyEnrollmentId, fingerprint: 'existing',
      });
    });
    await assertFails(service.ref().update(enrollmentPatch()));
  });

  it('denies partial, stale, wrong-key, existing-receipt, and extra-protected release patches', async () => {
    const service = testEnv.authenticatedContext('course-book-service-102', releaseClaims()).database();
    await assertFails(service.ref().update(releasePatch({
      [`course_book_authority/operations/${releaseOperationId}`]: null,
    })));
    await assertFails(service.ref().update(releasePatch({
      [`course_book_authority/releases/${courseId}/${moduleId}/${studentId}`]: null,
    })));
    await assertFails(testEnv.authenticatedContext('course-book-service-102', releaseClaims({ expectedReleaseRevision: 4 })).database()
      .ref().update(releasePatch()));
    await assertFails(testEnv.authenticatedContext('course-book-service-102', releaseClaims({ moduleId: 'module-wrong' })).database()
      .ref().update(releasePatch()));
    await assertFails(service.ref().update(releasePatch({
      [`course_book_authority/releases/${courseId}/${moduleId}/${studentId}`]: release({
        released: true, revision: 7, operationId: releaseOperationId,
      }),
    })));
    await assertFails(service.ref().update(releasePatch({
      'course_book_authority/operations/00000000-0000-4000-8000-000000000104': {
        operation: 'release-transition', operationId: '00000000-0000-4000-8000-000000000104',
      },
    })));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref(`course_book_authority/operations/${releaseOperationId}`).set({
        operation: 'release-transition', operationId: releaseOperationId, actorUid: 'teacher-102',
      });
    });
    await assertFails(service.ref().update(releasePatch()));
  });

  it('denies a #102 token on unrelated writes, browser/teacher authority writes, deletes, and restore-in-progress transitions', async () => {
    const enrollmentService = testEnv.authenticatedContext('course-book-service-102', enrollmentClaims()).database();
    await assertFails(enrollmentService.ref('course_requests/request-102').set({ studentId, courseId }));
    await assertFails(testEnv.authenticatedContext('teacher-102').database()
      .ref(`course_book_authority/enrollments/${courseId}/${studentId}`).set(authorityEnrollment()));
    await assertFails(testEnv.unauthenticatedContext().database()
      .ref(`course_book_authority/releases/${courseId}/${moduleId}/${studentId}`).set(release()));
    await assertFails(enrollmentService.ref(`course_enrollments/${legacyEnrollmentId}`).remove());
    await assertFails(enrollmentService.ref(`course_book_authority/operations/${enrollmentOperationId}`).remove());
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('system_flags/restore_in_progress').set(true);
    });
    await assertFails(enrollmentService.ref().update(enrollmentPatch()));
  });

  it('characterizes the inherited root super-admin grant without redesigning it', async () => {
    const superAdmin = testEnv.authenticatedContext('admin-102').database();
    const path = `course_book_authority/operations/admin-direct-102`;
    await assertSucceeds(superAdmin.ref(path).set({ direct: true }));
    let value: unknown;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      value = (await context.database().ref(path).once('value')).val();
    });
    expect(value).toEqual({ direct: true });
  });
});
