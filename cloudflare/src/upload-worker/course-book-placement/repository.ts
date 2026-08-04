import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import type { CourseBookPlacement } from '../../../../src/services/book-delivery/courseBookPlacement.service.ts';

const clone = <T>(value: T): T => structuredClone(value);
const equal = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/u;

export interface CourseModuleRelease {
  readonly courseId: string;
  readonly moduleId: string;
  readonly studentId: string;
  readonly released: boolean;
  readonly revision: number;
  readonly operationId: string;
}

/** Durable #102 Course authority storage; activation is owned by #118 rules composition. */
export class FirebaseCourseBookPlacementRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  constructor(options: { readonly env: RepositoryEnv; readonly fetchImpl?: typeof fetch; readonly getAccessToken?: () => Promise<string> }) {
    this.rtdb = new FirebaseRtdbRestClient({ env: options.env, fetchImpl: options.fetchImpl ?? globalThis.fetch, getAccessToken: options.getAccessToken });
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
    if (![placement.courseMaterialId, placement.courseId, placement.moduleId, placement.ownerId].every((value) => ID.test(value))) throw new Error('invalid_course_placement');
    const path = `course_materials/${placement.courseMaterialId}`;
    const current = await this.rtdb.readWithEtag<Record<string, unknown> | null>(path);
    const existing = current.data?.bookDeliveryPlacement;
    if (existing) return equal(existing, placement) ? 'replayed' : 'conflict';
    const next = { ...(current.data ?? {}), id: placement.courseMaterialId, courseId: placement.courseId, moduleId: placement.moduleId, materialId: placement.pins.bookId, isCopy: false, materialKind: 'book-delivery', bookDeliveryPlacement: clone(placement) };
    return await this.rtdb.writeIfMatch(path, next, current.etag) ? 'created' : 'conflict';
  }

  async readRelease(courseId: string, moduleId: string, studentId: string): Promise<CourseModuleRelease | null> {
    if (![courseId, moduleId, studentId].every((value) => ID.test(value))) throw new Error('invalid_course_release');
    const value = await this.rtdb.readValue(`course_book_authority/releases/${courseId}/${moduleId}/${studentId}`);
    return value && typeof value === 'object' && !Array.isArray(value) ? clone(value as CourseModuleRelease) : null;
  }

  async transitionRelease(input: CourseModuleRelease): Promise<'transitioned' | 'replayed' | 'conflict'> {
    if (![input.courseId, input.moduleId, input.studentId, input.operationId].every((value) => ID.test(value)) || input.revision < 1 || !Number.isSafeInteger(input.revision)) throw new Error('invalid_course_release');
    const path = `course_book_authority/releases/${input.courseId}/${input.moduleId}/${input.studentId}`;
    const current = await this.rtdb.readWithEtag<CourseModuleRelease | null>(path);
    if (current.data && equal(current.data, input)) return 'replayed';
    if (current.data && current.data.revision + 1 !== input.revision) return 'conflict';
    return await this.rtdb.writeIfMatch(path, clone(input), current.etag) ? 'transitioned' : 'conflict';
  }
}
