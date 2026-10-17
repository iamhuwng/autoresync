import {
  createCourseBookAuthority102TokenProvider,
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/u;
const PATH_ID = /^[A-Za-z0-9._:@-]{1,160}$/u;
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
  async approveCourseRequest(input: { actorUid: string; requestId: string; operationId: string }): Promise<'transitioned' | 'replayed' | 'conflict'> {
    const requestIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;
    if (!ID.test(input.actorUid) || !requestIdPattern.test(input.requestId) || !OPERATION.test(input.operationId)) {
      throw new Error('invalid_course_request_transition');
    }
    const requestPath = `course_requests/${input.requestId}`;
    const [requestRaw, userRaw, initialReceipt] = await Promise.all([
      this.read.readValue(requestPath), this.read.readValue(`users/${input.actorUid}`),
      this.read.readValue(`course_book_authority/operations/${input.operationId}`),
    ]);
    if (initialReceipt !== null && initialReceipt !== undefined) {
      const receipt = initialReceipt as Record<string, unknown>;
      return receipt.requestId === input.requestId && receipt.actorUid === input.actorUid
        ? 'replayed' : 'conflict';
    }
    if (!requestRaw || typeof requestRaw !== 'object' || Array.isArray(requestRaw)
      || !userRaw || typeof userRaw !== 'object' || Array.isArray(userRaw)) throw new Error('course_request_not_found');
    const request = requestRaw as Record<string, unknown>;
    const user = userRaw as Record<string, unknown>;
    const courseId = String(request.courseId ?? '');
    const studentId = String(request.studentId ?? '');
    const requestType = request.type;
    if (!PATH_ID.test(courseId) || !PATH_ID.test(studentId) || request.id !== input.requestId
      || user.role !== 'teacher' || request.teacherId !== input.actorUid
      || request.status !== 'pending' || typeof request.expiresAt !== 'number'
      || !Number.isSafeInteger(request.requestedAt) || Number(request.requestedAt) <= 0
      || request.expiresAt <= Date.now() || (requestType !== 'join' && requestType !== 'unenroll')) {
      throw new Error('course_request_denied');
    }
    const processedAt = Math.max(Date.now(), Number(request.requestedAt) + 1);
    const [courseRaw, enrollmentsRaw, authorityRaw] = await Promise.all([
      this.read.readValue(`courses/${courseId}`),
      this.read.readValue('course_enrollments', { orderBy: 'studentId', equalTo: studentId }),
      this.read.readValue(`course_book_authority/enrollments/${courseId}/${studentId}`),
    ]);
    if (!courseRaw || typeof courseRaw !== 'object' || Array.isArray(courseRaw)
      || (courseRaw as Record<string, unknown>).ownerId !== input.actorUid
      || (courseRaw as Record<string, unknown>).isClassInstance === true
      || (courseRaw as Record<string, unknown>).archivedAt) throw new Error('course_request_owner_denied');
    const rows = enrollmentsRaw && typeof enrollmentsRaw === 'object' && !Array.isArray(enrollmentsRaw)
      ? Object.values(enrollmentsRaw as Record<string, unknown>).filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
      : [];
    const exactRows = rows.filter((row) => row.courseId === courseId && row.studentId === studentId);
    const activeRows = exactRows.filter((row) => row.status === 'active');
    const directRows = activeRows.filter((row) => row.enrollmentType !== 'class-based');
    const authority = authorityRaw && typeof authorityRaw === 'object' && !Array.isArray(authorityRaw)
      ? authorityRaw as Record<string, unknown> : null;
    let legacyEnrollmentId: string;
    let nextLegacy: Record<string, unknown>;
    let nextAuthorityStatus: 'active' | 'revoked';
    if (requestType === 'join') {
      if (activeRows.length || (authority?.status === 'active')) throw new Error('course_request_enrollment_conflict');
      legacyEnrollmentId = `course-request-${input.requestId}`;
      if (rows.some((row) => row.id === legacyEnrollmentId)) throw new Error('course_request_enrollment_conflict');
      nextLegacy = {
        id: legacyEnrollmentId, courseId, studentId, enrollmentType: 'individual',
        enrolledAt: processedAt, expiresAt: 0, status: 'active', revision: 1, operationId: input.operationId,
      };
      nextAuthorityStatus = 'active';
    } else {
      if (activeRows.length !== 1 || directRows.length !== 1) throw new Error('course_request_enrollment_conflict');
      const row = directRows[0]!;
      legacyEnrollmentId = String(row.id ?? '');
      if (!PATH_ID.test(legacyEnrollmentId)) throw new Error('course_request_enrollment_conflict');
      if (authority && authority.legacyEnrollmentId !== legacyEnrollmentId) throw new Error('course_request_enrollment_conflict');
      const revision = Number.isSafeInteger(row.revision) ? Number(row.revision) : 0;
      nextLegacy = { ...clone(row), status: 'expired', revision: revision + 1, operationId: input.operationId };
      nextAuthorityStatus = 'revoked';
    }
    const authorityRevision = authority && Number.isSafeInteger(authority.revision) ? Number(authority.revision) : 0;
    const fingerprint = stable({ requestId: input.requestId, actorUid: input.actorUid, courseId, studentId, requestType, legacyEnrollmentId });
    const nextAuthority = {
      legacyEnrollmentId, courseId, studentId, status: nextAuthorityStatus,
      revision: authorityRevision + 1, operationId: input.operationId, updatedAt: new Date(processedAt).toISOString(),
    };
    const receipt = {
      operation: 'enrollment-request-transition', operationId: input.operationId, requestId: input.requestId,
      actorUid: input.actorUid, courseId, studentId, requestType, legacyEnrollmentId, fingerprint,
      revision: nextAuthority.revision, createdAt: new Date(processedAt).toISOString(),
    };
    const claims = {
      operation: 'enrollment-request-transition' as const, actorUid: input.actorUid, courseId, studentId,
      legacyEnrollmentId, requestId: input.requestId, requestType, expectedLegacyRevision: requestType === 'join' ? 0 : Number.isSafeInteger(directRows[0]?.revision) ? Number(directRows[0]!.revision) : 0,
      expectedAuthorityRevision: authorityRevision, operationId: input.operationId,
    };
    const token = await this.tokenFor(claims);
    const patch = new FirebaseRtdbRestClient({ env: this.options.env, fetchImpl: this.options.fetchImpl ?? globalThis.fetch, firebaseAuthToken: true, getAccessToken: async () => { throw new Error('course_book_authority_oauth_forbidden'); }, getFirebaseAuthToken: async () => token });
    await patch.patchMultiLocation([
      { path: `course_enrollments/${legacyEnrollmentId}`, value: nextLegacy },
      { path: `course_book_authority/enrollments/${courseId}/${studentId}`, value: nextAuthority },
      { path: `course_book_authority/operations/${input.operationId}`, value: receipt },
      { path: requestPath, value: { ...request, status: 'approved', processedBy: input.actorUid, processedAt } },
    ]);
    return 'transitioned';
  }
}
