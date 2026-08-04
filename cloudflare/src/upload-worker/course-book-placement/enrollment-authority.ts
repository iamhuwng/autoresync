import {
  createCourseBookAuthority102TokenProvider,
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/u;
const OPERATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const clone = <T>(value: T): T => structuredClone(value);
const stable = (value: unknown): string => JSON.stringify(value, Object.keys(value as object).sort());

export interface CourseEnrollmentAuthorityTransition {
  readonly actorUid: string;
  readonly courseId: string;
  readonly studentId: string;
  readonly legacyEnrollmentId: string;
  readonly operationId: string;
  readonly status: 'active' | 'revoked' | 'expired';
  readonly expiresAt?: string;
}

export interface CourseEnrollmentAuthorityResult {
  readonly status: 'transitioned' | 'replayed' | 'conflict';
  readonly legacyEnrollment?: Record<string, unknown>;
  readonly authorityEnrollment?: Record<string, unknown>;
}

/** Direct-Course-only producer for the exact 42A coupled write. */
export class FirebaseCourseEnrollmentAuthorityPort {
  private readonly read: FirebaseRtdbRestClient;
  private readonly tokenFor: ReturnType<typeof createCourseBookAuthority102TokenProvider>;
  constructor(private readonly options: { readonly env: RepositoryEnv; readonly fetchImpl?: typeof fetch; readonly now?: () => string }) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.read = new FirebaseRtdbRestClient({ env: options.env, fetchImpl });
    this.tokenFor = createCourseBookAuthority102TokenProvider({ env: options.env, fetchImpl });
  }

  async transitionDirectCourseEnrollment(input: CourseEnrollmentAuthorityTransition): Promise<CourseEnrollmentAuthorityResult> {
    if (![input.actorUid, input.courseId, input.studentId, input.legacyEnrollmentId].every((value) => ID.test(value))
      || !OPERATION.test(input.operationId)) throw new Error('invalid_course_enrollment_transition');
    const [legacyRaw, authorityRaw, receiptRaw] = await Promise.all([
      this.read.readValue(`course_enrollments/${input.legacyEnrollmentId}`),
      this.read.readValue(`course_book_authority/enrollments/${input.courseId}/${input.studentId}`),
      this.read.readValue(`course_book_authority/operations/${input.operationId}`),
    ]);
    if (!legacyRaw || typeof legacyRaw !== 'object' || Array.isArray(legacyRaw)) throw new Error('course_enrollment_not_found');
    const legacy = legacyRaw as Record<string, unknown>;
    if (legacy.courseId !== input.courseId || legacy.studentId !== input.studentId || legacy.enrollmentType === 'class-based') {
      throw new Error('course_enrollment_not_direct_course');
    }
    const previousAuthority = authorityRaw && typeof authorityRaw === 'object' && !Array.isArray(authorityRaw)
      ? authorityRaw as Record<string, unknown> : null;
    const legacyRevision = Number.isSafeInteger(legacy.revision) ? Number(legacy.revision) : 0;
    const authorityRevision = previousAuthority && Number.isSafeInteger(previousAuthority.revision)
      ? Number(previousAuthority.revision) : 0;
    const fingerprint = stable({ ...input, expiresAt: input.expiresAt ?? null });
    if (receiptRaw !== null && receiptRaw !== undefined) {
      const receipt = receiptRaw as Record<string, unknown>;
      if (receipt.fingerprint !== fingerprint) return { status: 'conflict' };
      return { status: 'replayed' };
    }
    const now = this.options.now?.() ?? new Date().toISOString();
    const nextLegacy = { ...clone(legacy), status: input.status, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}), revision: legacyRevision + 1, operationId: input.operationId };
    const nextAuthority = {
      legacyEnrollmentId: input.legacyEnrollmentId, courseId: input.courseId, studentId: input.studentId,
      status: input.status, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      revision: authorityRevision + 1, operationId: input.operationId, updatedAt: now,
    };
    const receipt = { operationId: input.operationId, courseId: input.courseId, studentId: input.studentId, legacyEnrollmentId: input.legacyEnrollmentId, fingerprint, createdAt: now };
    const token = await this.tokenFor({ operation: 'enrollment-transition', actorUid: input.actorUid, courseId: input.courseId, studentId: input.studentId, legacyEnrollmentId: input.legacyEnrollmentId, expectedLegacyRevision: legacyRevision, expectedAuthorityRevision: authorityRevision, operationId: input.operationId });
    const patch = new FirebaseRtdbRestClient({ env: this.options.env, fetchImpl: this.options.fetchImpl ?? globalThis.fetch, firebaseAuthToken: true, getAccessToken: async () => { throw new Error('course_book_authority_oauth_forbidden'); }, getFirebaseAuthToken: async () => token });
    await patch.patchMultiLocation([
      { path: `course_enrollments/${input.legacyEnrollmentId}`, value: nextLegacy },
      { path: `course_book_authority/enrollments/${input.courseId}/${input.studentId}`, value: nextAuthority },
      { path: `course_book_authority/operations/${input.operationId}`, value: receipt },
    ]);
    return { status: 'transitioned', legacyEnrollment: nextLegacy, authorityEnrollment: nextAuthority };
  }
}
