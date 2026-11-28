import {
  FirebaseRtdbRestClient,
  type FirebaseRtdbAuthRequest,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import {
  createFirebaseClaimTokenProvider,
  type BookFirebaseClaimTuple,
} from '../book-activity-authoring/firebase-token.ts';
import type {
  UnitActivityBinding,
  UnitActivityBindingKey,
  UnitActivityBindingRepository,
  UnitActivityBindingWriteStatus,
} from '../../../../src/services/book-assembly/unitActivityBinding.repository.ts';

/** #118 rules can grant one exact leaf beneath this owner/book/unit tree. */
export const BOOK_ASSEMBLY_ACTIVITY_BINDING_ROOT = 'book_assembly_activity_bindings/owners';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const MAX_RETRIES = 5;

export interface UnitActivityBindingRepositoryEnv extends RepositoryEnv {
  readonly BOOK_ASSEMBLY_SERVICE_IDENTITY?: string;
  readonly BOOK_ASSEMBLY_GOOGLE_SA_KEY?: string;
}

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);
const clone = <T>(value: T): T => structuredClone(value);
const id = (value: unknown, code = 'invalid_book_assembly_activity_binding_id'): string => {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(code);
  return value;
};
const revision = (value: unknown, code = 'invalid_book_assembly_activity_binding_revision'): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(code);
  return value as number;
};
const keyPath = (key: UnitActivityBindingKey): string => (
  `${BOOK_ASSEMBLY_ACTIVITY_BINDING_ROOT}/${id(key.ownerId)}/books/${id(key.bookId)}`
  + `/units/${id(key.unitKey)}/activities/${id(key.activityKey)}`
);
const bookBindingsPath = (ownerId: string, bookId: string): string => (
  `${BOOK_ASSEMBLY_ACTIVITY_BINDING_ROOT}/${id(ownerId)}/books/${id(bookId)}`
);

export const assertUnitActivityBinding = (value: unknown): UnitActivityBinding => {
  const source = record(value);
  if (!source) throw new Error('invalid_book_assembly_activity_binding');
  const withVersion = source.activityVersionId !== undefined || source.activityVersion !== undefined;
  const keys = Object.keys(source).sort();
  const expected = [
    'schemaVersion', 'ownerId', 'bookId', 'unitKey', 'activityKey', 'activityId',
    'candidateId', 'candidateRevision', 'candidateLifecycle',
    ...(withVersion ? ['activityVersionId', 'activityVersion'] : []),
  ].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])
    || source.schemaVersion !== 1
    || !['staged', 'validated', 'saved'].includes(String(source.candidateLifecycle))) {
    throw new Error('invalid_book_assembly_activity_binding');
  }
  const result: UnitActivityBinding = {
    schemaVersion: 1,
    ownerId: id(source.ownerId), bookId: id(source.bookId), unitKey: id(source.unitKey), activityKey: id(source.activityKey),
    activityId: id(source.activityId), candidateId: id(source.candidateId),
    candidateRevision: revision(source.candidateRevision),
    candidateLifecycle: source.candidateLifecycle as UnitActivityBinding['candidateLifecycle'],
    ...(withVersion ? { activityVersionId: id(source.activityVersionId), activityVersion: revision(source.activityVersion) } : {}),
  };
  return clone(result);
};

const sameKey = (binding: UnitActivityBinding, key: UnitActivityBindingKey): boolean => (
  binding.ownerId === key.ownerId && binding.bookId === key.bookId
  && binding.unitKey === key.unitKey && binding.activityKey === key.activityKey
);

export class FirebaseRestUnitActivityBindingRepository implements UnitActivityBindingRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly maxRetries: number;

  constructor(options: {
    readonly env: UnitActivityBindingRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getFirebaseAuthToken?: (request?: FirebaseRtdbAuthRequest) => Promise<string>;
    readonly maxRetries?: number;
  }) {
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const injected = options.getFirebaseAuthToken;
    if (injected) {
      this.rtdb = new FirebaseRtdbRestClient({ env: { ...options.env, GOOGLE_SA_KEY: undefined }, fetchImpl,
        firebaseAuthToken: true, getFirebaseAuthToken: injected });
      return;
    }
    const identity = options.env.BOOK_ASSEMBLY_SERVICE_IDENTITY?.trim();
    const key = options.env.BOOK_ASSEMBLY_GOOGLE_SA_KEY?.trim();
    if (!identity || !key) throw new Error('missing_book_assembly_activity_binding_identity');
    const provider = createFirebaseClaimTokenProvider({
      serviceAccountJson: key, serviceIdentity: identity,
      firebaseProjectId: options.env.FIREBASE_PROJECT_ID?.trim() ?? '',
      firebaseWebApiKey: options.env.FIREBASE_WEB_API_KEY?.trim() ?? '', fetchImpl,
    });
    this.rtdb = new FirebaseRtdbRestClient({ env: { ...options.env, GOOGLE_SA_KEY: undefined }, fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: (request: FirebaseRtdbAuthRequest = { path: '' }) => {
        const leafMatch = new RegExp(`^${BOOK_ASSEMBLY_ACTIVITY_BINDING_ROOT}/([^/]+)/books/([^/]+)/units/([^/]+)/activities/([^/]+)$`).exec(request.path);
        if (leafMatch) {
          const claims: BookFirebaseClaimTuple = {
            service: 'book_assembly_activity_binding',
            ownerId: id(leafMatch[1]),
            bookId: id(leafMatch[2]),
            unitKey: id(leafMatch[3]),
            activityKey: id(leafMatch[4]),
          };
          return provider(claims);
        }
        const bookMatch = new RegExp(`^${BOOK_ASSEMBLY_ACTIVITY_BINDING_ROOT}/([^/]+)/books/([^/]+)$`).exec(request.path);
        if (bookMatch) {
          const claims: BookFirebaseClaimTuple = {
            service: 'book_assembly_draft_discovery',
            ownerId: id(bookMatch[1]),
            bookId: id(bookMatch[2]),
          };
          return provider(claims);
        }
        throw new Error('book_assembly_activity_binding_scope_required');
      },
    });
  }

  async read(key: UnitActivityBindingKey): Promise<UnitActivityBinding | null> {
    const value = await this.rtdb.readValue(keyPath(key));
    if (value === null || value === undefined) return null;
    const binding = assertUnitActivityBinding(value);
    if (!sameKey(binding, key)) throw new Error('book_assembly_activity_binding_scope_mismatch');
    return binding;
  }

  async readBookBindings(
    ownerId: string,
    bookId: string,
    options?: { readonly strict?: boolean },
  ): Promise<Readonly<Record<string, Readonly<Record<string, UnitActivityBinding>>>>> {
    const strict = options?.strict === true;
    const safeOwnerId = id(ownerId);
    const safeBookId = id(bookId);
    const raw = await this.rtdb.readValue(bookBindingsPath(safeOwnerId, safeBookId));
    if (raw === null || raw === undefined) return {};
    const root = record(raw);
    if (!root) {
      if (strict) throw new Error('book_assembly_activity_binding_snapshot_malformed');
      return {};
    }
    if (root.units === null || root.units === undefined) return {};
    const rawUnits = record(root.units);
    if (!rawUnits) {
      if (strict) throw new Error('book_assembly_activity_binding_snapshot_malformed');
      return {};
    }
    const byUnit: Record<string, Record<string, UnitActivityBinding>> = {};
    for (const [unitKey, unitNode] of Object.entries(rawUnits)) {
      if (unitNode === null || unitNode === undefined) continue;
      const unitRecord = record(unitNode);
      if (!unitRecord) {
        if (strict) throw new Error('book_assembly_activity_binding_snapshot_malformed');
        continue;
      }
      if (unitRecord.activities === null || unitRecord.activities === undefined) continue;
      const activitiesNode = record(unitRecord.activities);
      if (!activitiesNode) {
        if (strict) throw new Error('book_assembly_activity_binding_snapshot_malformed');
        continue;
      }
      const byActivity: Record<string, UnitActivityBinding> = {};
      for (const [activityKey, value] of Object.entries(activitiesNode)) {
        if (value === null || value === undefined) continue;
        try {
          const binding = assertUnitActivityBinding(value);
          if (!sameKey(binding, { ownerId: safeOwnerId, bookId: safeBookId, unitKey, activityKey })) {
            if (strict) throw new Error('book_assembly_activity_binding_snapshot_malformed');
            continue;
          }
          byActivity[activityKey] = binding;
        } catch {
          if (strict) throw new Error('book_assembly_activity_binding_snapshot_malformed');
          // Ignore malformed individual leaf in non-strict discovery so discovery stays fail-closed per slot.
        }
      }
      if (Object.keys(byActivity).length > 0) {
        byUnit[unitKey] = byActivity;
      }
    }
    return byUnit;
  }

  async bindCandidate(input: UnitActivityBinding, options?: { expectedCandidateId: string | null }): Promise<UnitActivityBindingWriteStatus> {
    const next = assertUnitActivityBinding(input);
    const path = keyPath(next);
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      if (current.data === null || current.data === undefined) {
        if (options?.expectedCandidateId) return 'conflict';
        if (await this.rtdb.writeIfMatch(path, next, current.etag)) return 'created';
        continue;
      }
      const existing = assertUnitActivityBinding(current.data);
      if (!sameKey(existing, next) || existing.activityId !== next.activityId) return 'conflict';
      if (options && existing.candidateId !== next.candidateId
        && (existing.candidateId !== options.expectedCandidateId || existing.activityVersionId)) return 'conflict';
      if (existing.activityVersionId !== undefined) {
        if (existing.candidateId === next.candidateId
          && next.candidateRevision === existing.candidateRevision
          && next.candidateLifecycle === existing.candidateLifecycle) return 'replayed';
        if (next.candidateRevision <= existing.candidateRevision) return 'conflict';
        const merged: UnitActivityBinding = {
          ...next,
          activityVersionId: existing.activityVersionId,
          activityVersion: existing.activityVersion,
        };
        if (await this.rtdb.writeIfMatch(path, merged, current.etag)) return 'updated';
        continue;
      }
      if (existing.candidateId === next.candidateId) {
        if (next.candidateRevision < existing.candidateRevision) return 'stale';
        if (next.candidateRevision === existing.candidateRevision
          && next.candidateLifecycle === existing.candidateLifecycle) return 'replayed';
      }
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) return 'updated';
    }
    throw new Error('book_assembly_activity_binding_cas_retries_exhausted');
  }

  async recordPublication(input: UnitActivityBindingKey & {
    readonly activityId: string; readonly candidateId: string; readonly candidateRevision: number;
    readonly activityVersionId: string; readonly activityVersion: number;
  }): Promise<UnitActivityBindingWriteStatus> {
    const key: UnitActivityBindingKey = { ownerId: id(input.ownerId), bookId: id(input.bookId), unitKey: id(input.unitKey), activityKey: id(input.activityKey) };
    const path = keyPath(key);
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      if (current.data === null || current.data === undefined) return 'conflict';
      const existing = assertUnitActivityBinding(current.data);
      if (!sameKey(existing, key) || existing.activityId !== id(input.activityId)
        || existing.candidateId !== id(input.candidateId) || existing.candidateRevision !== revision(input.candidateRevision)) return 'conflict';
      const next: UnitActivityBinding = { ...existing, activityVersionId: id(input.activityVersionId), activityVersion: revision(input.activityVersion) };
      if (existing.activityVersionId !== undefined) {
        if (existing.activityVersionId === next.activityVersionId && existing.activityVersion === next.activityVersion) {
          return 'replayed';
        }
        if (existing.activityVersion === undefined
          || next.activityVersion! <= existing.activityVersion
          || next.activityVersionId === existing.activityVersionId) {
          return 'conflict';
        }
      }
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) return 'updated';
    }
    throw new Error('book_assembly_activity_binding_cas_retries_exhausted');
  }
}
