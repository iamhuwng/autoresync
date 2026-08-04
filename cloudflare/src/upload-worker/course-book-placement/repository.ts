import {
  createCourseBookAuthority102TokenProvider,
  FirebaseRtdbRestClient,
  type CourseBookAuthority102TokenProvider,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import type { CourseBookPlacement } from '../../../../src/services/book-delivery/courseBookPlacement.service.ts';

const clone = <T>(value: T): T => structuredClone(value);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => (
      `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};
const equal = (left: unknown, right: unknown): boolean => stable(left) === stable(right);
const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/u;
const OPERATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface CourseModuleRelease {
  readonly courseId: string;
  readonly moduleId: string;
  readonly studentId: string;
  readonly released: boolean;
  readonly revision: number;
  readonly operationId: string;
}

export interface CourseModuleReleaseTransition extends CourseModuleRelease {
  readonly actorUid: string;
}

interface CourseModuleReleaseReceipt {
  readonly operation: 'release-transition';
  readonly operationId: string;
  readonly actorUid: string;
  readonly courseId: string;
  readonly moduleId: string;
  readonly studentId: string;
  readonly released: boolean;
  readonly revision: number;
  readonly fingerprint: string;
}

const assertReleaseInput = (input: CourseModuleReleaseTransition): void => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![input.actorUid, input.courseId, input.moduleId, input.studentId]
    .every((value) => typeof value === 'string' && ID.test(value))
    || typeof input.released !== 'boolean'
    || !Number.isSafeInteger(input.revision)
    || input.revision < 1
    || !OPERATION.test(input.operationId)) {
    throw new Error('invalid_course_release');
  }
};

const releaseRecord = (input: CourseModuleReleaseTransition): CourseModuleRelease => ({
  courseId: input.courseId,
  moduleId: input.moduleId,
  studentId: input.studentId,
  released: input.released,
  revision: input.revision,
  operationId: input.operationId,
});

const receiptFor = (
  input: CourseModuleReleaseTransition,
  expectedReleaseRevision: number,
): CourseModuleReleaseReceipt => {
  const fingerprint = stable({
    operation: 'release-transition',
    actorUid: input.actorUid,
    courseId: input.courseId,
    moduleId: input.moduleId,
    studentId: input.studentId,
    released: input.released,
    expectedReleaseRevision,
    revision: input.revision,
    operationId: input.operationId,
  });
  return {
    operation: 'release-transition',
    operationId: input.operationId,
    actorUid: input.actorUid,
    courseId: input.courseId,
    moduleId: input.moduleId,
    studentId: input.studentId,
    released: input.released,
    revision: input.revision,
    fingerprint,
  };
};

const recordOrNull = (value: unknown): Record<string, unknown> | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_course_release_record');
  }
  return value as Record<string, unknown>;
};

/** Durable #102 Course authority storage; activation is owned by #118 rules composition. */
export class FirebaseCourseBookPlacementRepository {
  private readonly env: RepositoryEnv;
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly fetchImpl: typeof fetch;
  private readonly tokenProvider: CourseBookAuthority102TokenProvider;

  constructor(options: {
    readonly env: RepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly tokenProvider?: CourseBookAuthority102TokenProvider;
  }) {
    this.env = options.env;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.tokenProvider = options.tokenProvider ?? createCourseBookAuthority102TokenProvider({
      env: options.env,
      fetchImpl: this.fetchImpl,
    });
    this.rtdb = new FirebaseRtdbRestClient({
      env: options.env,
      fetchImpl: this.fetchImpl,
      getAccessToken: options.getAccessToken,
    });
  }

  async read(courseMaterialId: string): Promise<CourseBookPlacement | null> {
    if (!ID.test(courseMaterialId)) throw new Error('invalid_course_material_id');
    const value = await this.rtdb.readValue(`course_materials/${courseMaterialId}`);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const placement = record.bookDeliveryPlacement;
    return placement && typeof placement === 'object' && !Array.isArray(placement)
      ? clone(placement as CourseBookPlacement) : null;
  }

  async create(placement: CourseBookPlacement): Promise<'created' | 'replayed' | 'conflict'> {
    if (![placement.courseMaterialId, placement.courseId, placement.moduleId, placement.ownerId]
      .every((value) => ID.test(value))) {
      throw new Error('invalid_course_placement');
    }
    const path = `course_materials/${placement.courseMaterialId}`;
    const current = await this.rtdb.readWithEtag<Record<string, unknown> | null>(path);
    const existing = current.data?.bookDeliveryPlacement;
    if (existing) return equal(existing, placement) ? 'replayed' : 'conflict';
    const next = {
      ...(current.data ?? {}),
      id: placement.courseMaterialId,
      courseId: placement.courseId,
      moduleId: placement.moduleId,
      materialId: placement.pins.bookId,
      isCopy: false,
      materialKind: 'book-delivery',
      bookDeliveryPlacement: clone(placement),
    };
    return await this.rtdb.writeIfMatch(path, next, current.etag) ? 'created' : 'conflict';
  }

  async revoke(input: {
    readonly courseMaterialId: string;
    readonly actorUid: string;
    readonly operationId: string;
  }): Promise<'revoked' | 'replayed' | 'conflict'> {
    if (![input.courseMaterialId, input.actorUid].every((value) => ID.test(value))
      || !OPERATION.test(input.operationId)) throw new Error('invalid_course_placement_revoke');
    const path = `course_materials/${input.courseMaterialId}`;
    const current = await this.rtdb.readWithEtag<Record<string, unknown> | null>(path);
    const raw = current.data?.bookDeliveryPlacement;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'conflict';
    const placement = raw as CourseBookPlacement;
    if (placement.ownerId !== input.actorUid) return 'conflict';
    if (placement.status === 'revoked') return 'replayed';
    if (placement.status !== 'active' || !Number.isSafeInteger(placement.placementRevision)) return 'conflict';
    const nextPlacement: CourseBookPlacement = {
      ...clone(placement), status: 'revoked', placementRevision: placement.placementRevision + 1,
    };
    const next = { ...current.data, bookDeliveryPlacement: nextPlacement };
    return await this.rtdb.writeIfMatch(path, next, current.etag) ? 'revoked' : 'conflict';
  }

  async readRelease(courseId: string, moduleId: string, studentId: string): Promise<CourseModuleRelease | null> {
    if (![courseId, moduleId, studentId].every((value) => ID.test(value))) {
      throw new Error('invalid_course_release');
    }
    const value = await this.rtdb.readValue(
      `course_book_authority/releases/${courseId}/${moduleId}/${studentId}`,
    );
    return value && typeof value === 'object' && !Array.isArray(value)
      ? clone(value as CourseModuleRelease) : null;
  }

  async transitionRelease(input: CourseModuleReleaseTransition): Promise<'transitioned' | 'replayed' | 'conflict'> {
    assertReleaseInput(input);
    const releasePath = `course_book_authority/releases/${input.courseId}/${input.moduleId}/${input.studentId}`;
    const operationPath = `course_book_authority/operations/${input.operationId}`;
    const [releaseRaw, receiptRaw] = await Promise.all([
      this.rtdb.readValue(releasePath),
      this.rtdb.readValue(operationPath),
    ]);
    const current = recordOrNull(releaseRaw);
    const receipt = recordOrNull(receiptRaw);
    const next = releaseRecord(input);

    // A receipt is immutable. Replay is valid only when both protected records
    // are the exact records produced by the original transition.
    if (receiptRaw !== null && receiptRaw !== undefined) {
      const expectedReceipt = receiptFor(input, input.revision - 1);
      return current && equal(current, next) && equal(receipt, expectedReceipt)
        ? 'replayed'
        : 'conflict';
    }

    const currentRevision = current === null
      ? 0
      : typeof current.revision === 'number' ? current.revision : Number.NaN;
    if (!Number.isSafeInteger(currentRevision) || (current !== null && currentRevision < 1)) {
      throw new Error('invalid_course_release_record');
    }
    if (input.revision !== currentRevision + 1) return 'conflict';
    if (current?.operationId === input.operationId) return 'conflict';

    const expectedReleaseRevision = currentRevision;
    const claims = {
      operation: 'release-transition' as const,
      actorUid: input.actorUid,
      courseId: input.courseId,
      moduleId: input.moduleId,
      studentId: input.studentId,
      expectedReleaseRevision,
      operationId: input.operationId,
    };
    const token = await this.tokenProvider(claims);
    if (typeof token !== 'string' || !token.trim()) {
      throw new Error('course_book_authority_token_invalid');
    }
    const scopedPatch = new FirebaseRtdbRestClient({
      env: this.rtdbEnv(),
      fetchImpl: this.fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: async () => token,
    });
    await scopedPatch.patchMultiLocation([
      { path: releasePath, value: clone(next) },
      { path: operationPath, value: receiptFor(input, expectedReleaseRevision) },
    ]);
    return 'transitioned';
  }

  private rtdbEnv(): RepositoryEnv {
    // FirebaseRtdbRestClient deliberately keeps its environment private. The
    // client used for the scoped PATCH only needs the same database endpoint.
    return this.env;
  }
}
