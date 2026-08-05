import {
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import type {
  ClassBookCopyIdentity,
  ClassBookDeliveryBinding,
  ClassBookLockAuthority,
  ClassBookPlacement,
} from '../../../../src/services/book-delivery/classBookPlacement.types.ts';
import type {
  ClassBookProgressRecord,
  ClassBookResultRecord,
} from '../../../../src/services/book-delivery/classBookResults.service.ts';

const clone = <T>(value: T): T => structuredClone(value);
const equal = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const PATH_ID = /^[A-Za-z0-9_-]{1,200}$/u;

const pathId = (value: string, code = 'class_book_storage_id_invalid'): string => {
  if (typeof value !== 'string' || !PATH_ID.test(value)) throw new Error(code);
  return value;
};

const operationId = (value: string): string => pathId(value, 'class_book_storage_operation_invalid');

export const classBookDurablePaths = {
  copy: (classId: string, copyId: string): string => `class_book_authority/copies/${pathId(classId)}/${pathId(copyId)}`,
  placementCurrent: (contextId: string): string => `class_book_authority/placements/current/${pathId(contextId)}`,
  placementVersion: (contextId: string, revision: number): string => {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('class_book_storage_revision_invalid');
    return `class_book_authority/placements/versions/${pathId(contextId)}/${revision}`;
  },
  binding: (bindingId: string): string => `book_delivery/bindings/class-course/${pathId(bindingId)}`,
  lock: (classId: string, classPlacementId: string): string =>
    `class_book_authority/locks/${pathId(classId)}/${pathId(classPlacementId)}`,
  progress: (key: string): string => `class_book_authority/progress/${pathId(key.replaceAll('/', '_'))}`,
  result: (key: string): string => `class_book_authority/results/${pathId(key.replaceAll('/', '_'))}`,
  operation: (operation: string): string => `class_book_authority/operations/${operationId(operation)}`,
} as const;

export interface ClassBookDurableRepositoryOptions {
  readonly env: RepositoryEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
  /** Firebase custom token for the server-only multi-location write. */
  readonly getFirebaseAuthToken?: () => Promise<string>;
}

/**
 * Durable #103 projection storage. Reads are point reads; immutable versions,
 * current pointers, operations, and bindings never use a broad scan.
 */
export class FirebaseClassBookPlacementRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly scopedRtdb: FirebaseRtdbRestClient | null;

  constructor(options: ClassBookDurableRepositoryOptions) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.rtdb = new FirebaseRtdbRestClient({
      env: options.env,
      fetchImpl,
      getAccessToken: options.getAccessToken,
    });
    this.scopedRtdb = options.getFirebaseAuthToken
      ? new FirebaseRtdbRestClient({
          env: options.env,
          fetchImpl,
          firebaseAuthToken: true,
          getFirebaseAuthToken: options.getFirebaseAuthToken,
        })
      : null;
  }

  async readCopy(classId: string, copyId: string): Promise<ClassBookCopyIdentity | null> {
    const value = await this.rtdb.readValue(classBookDurablePaths.copy(classId, copyId));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? clone(value as ClassBookCopyIdentity)
      : null;
  }

  async readCurrent(contextId: string): Promise<ClassBookPlacement | null> {
    const value = await this.rtdb.readValue(classBookDurablePaths.placementCurrent(contextId));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? clone(value as ClassBookPlacement)
      : null;
  }

  async readVersion(contextId: string, revision: number): Promise<ClassBookPlacement | null> {
    const value = await this.rtdb.readValue(classBookDurablePaths.placementVersion(contextId, revision));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? clone(value as ClassBookPlacement)
      : null;
  }

  async createCopy(copy: ClassBookCopyIdentity): Promise<'created' | 'replayed' | 'conflict'> {
    const path = classBookDurablePaths.copy(copy.classId, copy.copyId);
    const current = await this.rtdb.readWithEtag<ClassBookCopyIdentity | null>(path);
    if (current.data) return equal(current.data, copy) ? 'replayed' : 'conflict';
    return await this.rtdb.writeIfMatch(path, clone(copy), current.etag) ? 'created' : 'conflict';
  }

  async createPlacement(placement: ClassBookPlacement, operation: string): Promise<'created' | 'replayed' | 'conflict'> {
    const contextId = `class-${placement.classId}-copy-${placement.copyId}-material-${placement.courseMaterialId}`;
    const currentPath = classBookDurablePaths.placementCurrent(contextId);
    const versionPath = classBookDurablePaths.placementVersion(contextId, placement.placementRevision);
    const operationPath = classBookDurablePaths.operation(operation);
    const [current, receipt] = await Promise.all([
      this.rtdb.readWithEtag<ClassBookPlacement | null>(currentPath),
      this.rtdb.readValue(operationPath),
    ]);
    if (receipt) return equal(receipt, placement) && equal(current.data, placement) ? 'replayed' : 'conflict';
    if (current.data) return equal(current.data, placement) ? 'replayed' : 'conflict';
    await this.atomicPatch([
      { path: versionPath, value: clone(placement) },
      { path: currentPath, value: clone(placement) },
      { path: operationPath, value: clone(placement) },
    ]);
    return 'created';
  }

  async appendPlacement(placement: ClassBookPlacement, operation: string): Promise<'created' | 'replayed' | 'conflict'> {
    const contextId = `class-${placement.classId}-copy-${placement.copyId}-material-${placement.courseMaterialId}`;
    const currentPath = classBookDurablePaths.placementCurrent(contextId);
    const versionPath = classBookDurablePaths.placementVersion(contextId, placement.placementRevision);
    const operationPath = classBookDurablePaths.operation(operation);
    const [current, receipt] = await Promise.all([
      this.rtdb.readWithEtag<ClassBookPlacement | null>(currentPath),
      this.rtdb.readValue(operationPath),
    ]);
    if (receipt) return equal(receipt, placement) && equal(current.data, placement) ? 'replayed' : 'conflict';
    if (!current.data || current.data.placementRevision + 1 !== placement.placementRevision) return 'conflict';
    await this.atomicPatch([
      { path: versionPath, value: clone(placement) },
      { path: currentPath, value: clone(placement) },
      { path: operationPath, value: clone(placement) },
    ]);
    return 'created';
  }

  async writeBinding(binding: ClassBookDeliveryBinding, operation: string): Promise<'created' | 'replayed' | 'conflict'> {
    const bindingPath = classBookDurablePaths.binding(binding.bindingId);
    const operationPath = classBookDurablePaths.operation(operation);
    const [current, receipt] = await Promise.all([
      this.rtdb.readValue(bindingPath),
      this.rtdb.readValue(operationPath),
    ]);
    if (receipt) return equal(receipt, binding) && equal(current, binding) ? 'replayed' : 'conflict';
    if (current) return equal(current, binding) ? 'replayed' : 'conflict';
    await this.atomicPatch([
      { path: bindingPath, value: clone(binding) },
      { path: operationPath, value: clone(binding) },
    ]);
    return 'created';
  }

  async readBinding(bindingId: string): Promise<ClassBookDeliveryBinding | null> {
    const value = await this.rtdb.readValue(classBookDurablePaths.binding(bindingId));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? clone(value as ClassBookDeliveryBinding)
      : null;
  }

  async readLock(classId: string, classPlacementId: string): Promise<ClassBookLockAuthority | null> {
    const value = await this.rtdb.readValue(classBookDurablePaths.lock(classId, classPlacementId));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? clone(value as ClassBookLockAuthority)
      : null;
  }

  async transitionLock(value: ClassBookLockAuthority, expectedRevision: number): Promise<'written' | 'replayed' | 'conflict'> {
    const path = classBookDurablePaths.lock(value.classId, value.classPlacementId);
    const current = await this.rtdb.readWithEtag<ClassBookLockAuthority | null>(path);
    if (current.data?.operationId === value.operationId) {
      return equal(current.data, value) ? 'replayed' : 'conflict';
    }
    if ((current.data?.revision ?? 0) !== expectedRevision) return 'conflict';
    return await this.rtdb.writeIfMatch(path, clone(value), current.etag) ? 'written' : 'conflict';
  }

  async readProgress(key: string): Promise<ClassBookProgressRecord | null> {
    const value = await this.rtdb.readValue(classBookDurablePaths.progress(key));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? clone(value as ClassBookProgressRecord)
      : null;
  }

  async writeProgress(record: ClassBookProgressRecord): Promise<'created' | 'updated' | 'replayed' | 'conflict'> {
    const path = classBookDurablePaths.progress(record.key);
    const current = await this.rtdb.readWithEtag<ClassBookProgressRecord | null>(path);
    if (current.data && equal(current.data, record)) return 'replayed';
    if (current.data && current.data.revision + 1 !== record.revision) return 'conflict';
    const written = await this.rtdb.writeIfMatch(path, clone(record), current.etag);
    return written ? (current.data ? 'updated' : 'created') : 'conflict';
  }

  async readResult(key: string): Promise<ClassBookResultRecord | null> {
    const value = await this.rtdb.readValue(classBookDurablePaths.result(key));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? clone(value as ClassBookResultRecord)
      : null;
  }

  async appendResult(record: ClassBookResultRecord): Promise<'created' | 'replayed' | 'conflict'> {
    const path = classBookDurablePaths.result(record.key);
    const current = await this.rtdb.readWithEtag<ClassBookResultRecord | null>(path);
    if (current.data) return equal(current.data, record) ? 'replayed' : 'conflict';
    return await this.rtdb.writeIfMatch(path, clone(record), current.etag) ? 'created' : 'conflict';
  }

  private async atomicPatch(updates: readonly { readonly path: string; readonly value: unknown }[]): Promise<void> {
    if (!this.scopedRtdb) throw new Error('class_book_authority_scoped_token_required');
    await this.scopedRtdb.patchMultiLocation(updates);
  }
}

export const createFirebaseClassBookPlacementRepository = (
  options: ClassBookDurableRepositoryOptions,
): FirebaseClassBookPlacementRepository => new FirebaseClassBookPlacementRepository(options);
