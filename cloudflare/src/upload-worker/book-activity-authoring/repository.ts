import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import {
  createFirebaseClaimTokenProvider,
  type BookFirebaseClaimTuple,
} from './firebase-token.ts';
import type { BookRolloutWorkerEnvironment } from '../../book-rollout-gate.ts';

export const BOOK_ACTIVITY_AUTHORING_ROOT = 'book_activity_authoring/owners';
const MAX_RETRIES = 5;
const MAX_ACTIVITIES_PER_OWNER = 128;
const MAX_CANDIDATES_PER_OWNER = 128;
const MAX_OPERATIONS_PER_OWNER = 256;
const MAX_OWNER_ROOT_BYTES = 64 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/u;

export interface BookActivityAuthoringRepositoryEnv extends RepositoryEnv, BookRolloutWorkerEnvironment {
  BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY?: string;
  /** Dedicated secret. Generic GOOGLE_SA_KEY is intentionally never used here. */
  BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY?: string;
}

export interface BookActivityAuthoringRoot {
  activities?: Record<string, unknown>;
  candidates?: Record<string, unknown>;
  operations?: Record<string, unknown>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const plainRecord = (value: unknown): Record<string, unknown> | undefined => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);
/**
 * RTDB drops null and empty-array object children on writes. These are the
 * normal-path fields whose absence has a defined domain value. This codec is
 * deliberately read-side only; mutation.next still goes through root() as
 * supplied by the caller and is never repaired here.
 */
const hydrateActivity = (value: unknown): unknown => {
  const record = plainRecord(value);
  if (!record) return value;
  const contextRequirement = plainRecord(record.contextRequirement);
  return {
    ...record,
    ...(contextRequirement
      ? {
        contextRequirement: {
          ...contextRequirement,
          ...(contextRequirement.acceptedKinds === undefined ? { acceptedKinds: [] } : {}),
        },
      }
      : {}),
    ...(record.taskProfile === undefined ? { taskProfile: null } : {}),
    ...(record.stimulus === undefined ? { stimulus: null } : {}),
    ...(record.assetRefs === undefined ? { assetRefs: [] } : {}),
  };
};
const hydrateCandidate = (value: unknown): unknown => {
  const record = plainRecord(value);
  if (!record) return value;
  const validation = plainRecord(record.validation);
  const isValid = validation?.valid === true;
  return {
    ...record,
    ...(record.diff === undefined ? { diff: null } : {}),
    ...(isValid && record.evidenceRefs === undefined ? { evidenceRefs: [] } : {}),
    ...(isValid && record.sourceEvidenceRefs === undefined ? { sourceEvidenceRefs: [] } : {}),
    ...(isValid && record.answerEvidenceRefs === undefined ? { answerEvidenceRefs: [] } : {}),
    ...(isValid && validation
      ? {
        validation: {
          ...validation,
          ...(validation.errors === undefined ? { errors: [] } : {}),
        },
      }
      : {}),
    ...(isValid && record.content !== undefined ? { content: hydrateActivity(record.content) } : {}),
  };
};
const hydrateOperationResult = (value: unknown): unknown => {
  const record = plainRecord(value);
  if (!record) return value;
  const status = record.status;
  const isSuccessfulProjection = status === 'staged' || status === 'validated' || status === 'saved';
  const validation = plainRecord(record.validation);
  return {
    ...record,
    ...(isSuccessfulProjection && record.evidenceRefs === undefined ? { evidenceRefs: [] } : {}),
    ...(isSuccessfulProjection && record.sourceEvidenceRefs === undefined ? { sourceEvidenceRefs: [] } : {}),
    ...(isSuccessfulProjection && record.answerEvidenceRefs === undefined ? { answerEvidenceRefs: [] } : {}),
    ...(isSuccessfulProjection && validation && validation.valid === true && validation.errors === undefined
      ? { validation: { ...validation, errors: [] } }
      : {}),
  };
};
const hydrateRoot = (value: unknown): unknown => {
  const source = plainRecord(value);
  if (!source) return value;
  const hydrateMap = (
    map: unknown,
    hydrate: (entry: unknown) => unknown,
  ): unknown => {
    const records = plainRecord(map);
    if (!records) return map;
    return Object.fromEntries(Object.entries(records).map(([key, entry]) => [key, hydrate(entry)]));
  };
  const activities = hydrateMap(source.activities, (entry) => {
    const record = plainRecord(entry);
    if (!record) return entry;
    return {
      ...record,
      ...(record.editableDraft !== undefined ? { editableDraft: hydrateActivity(record.editableDraft) } : {}),
      ...(record.draft !== undefined ? { draft: hydrateActivity(record.draft) } : {}),
    };
  });
  const candidates = hydrateMap(source.candidates, hydrateCandidate);
  const operations = hydrateMap(source.operations, (entry) => {
    const record = plainRecord(entry);
    if (!record || record.result === undefined) return entry;
    return { ...record, result: hydrateOperationResult(record.result) };
  });
  return { ...source, ...(activities !== undefined ? { activities } : {}),
    ...(candidates !== undefined ? { candidates } : {}),
    ...(operations !== undefined ? { operations } : {}) };
};
const recordMap = (
  value: unknown,
  maximum: number,
  label: string,
): Record<string, unknown> | undefined => {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid_book_activity_authoring_${label}`);
  }
  const entries = Object.entries(value);
  if (entries.length > maximum) {
    throw new Error(`book_activity_authoring_${label}_capacity_exceeded`);
  }
  if (entries.some(([key, entry]) =>
    !key || entry === null || typeof entry !== 'object' || Array.isArray(entry))) {
    throw new Error(`invalid_book_activity_authoring_${label}`);
  }
  return clone(Object.fromEntries(entries));
};
const root = (value: unknown): BookActivityAuthoringRoot => {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_book_activity_authoring_root');
  }
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) =>
    !['activities', 'candidates', 'operations'].includes(key))) {
    throw new Error('invalid_book_activity_authoring_root');
  }
  if (new TextEncoder().encode(JSON.stringify(source)).byteLength > MAX_OWNER_ROOT_BYTES) {
    throw new Error('book_activity_authoring_root_too_large');
  }
  return {
    activities: recordMap(source.activities, MAX_ACTIVITIES_PER_OWNER, 'activities'),
    candidates: recordMap(source.candidates, MAX_CANDIDATES_PER_OWNER, 'candidates'),
    operations: recordMap(source.operations, MAX_OPERATIONS_PER_OWNER, 'operations'),
  };
};
// FirebaseRtdbRestClient encodes each segment exactly once.
const ownerPath = (ownerId: string): string => `${BOOK_ACTIVITY_AUTHORING_ROOT}/${ownerId}`;
const assertOwnerId = (ownerId: string): void => {
  if (!SAFE_ID.test(ownerId)) throw new Error('invalid_book_activity_authoring_owner_id');
};
const assertAllowedReadPath = (path: string): void => {
  if (/^users\/[A-Za-z0-9_-]{1,160}$/u.test(path)) return;
  const ownerPrefix = `${BOOK_ACTIVITY_AUTHORING_ROOT}/`;
  if (path.startsWith(ownerPrefix) && SAFE_ID.test(path.slice(ownerPrefix.length))) return;
  throw new Error('book_activity_authoring_path_forbidden');
};

/** Scoped repository. Each owner CASes only their bounded authoring subtree. */
export class FirebaseRestBookActivityAuthoringRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    env: BookActivityAuthoringRepositoryEnv;
    fetchImpl?: typeof fetch;
    /** Test-only injected principal/token provider; production always uses dedicated secret. */
    getAccessToken?: () => Promise<string>;
    maxRetries?: number;
  }) {
    const identity = options.env.BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_activity_authoring_service_identity');
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (options.getAccessToken) {
      this.rtdb = new FirebaseRtdbRestClient({
        env: options.env,
        fetchImpl,
        getAccessToken: options.getAccessToken,
      });
      return;
    }
    const keyJson = options.env.BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY?.trim();
    if (!keyJson) throw new Error('missing_book_activity_authoring_google_sa_key');
    let clientEmail: unknown;
    try {
      clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
    } catch {
      throw new Error('invalid_book_activity_authoring_google_sa_key');
    }
    if (clientEmail !== identity) {
      throw new Error('book_activity_authoring_service_identity_mismatch');
    }
    const getFirebaseAuthToken = createFirebaseClaimTokenProvider({
      serviceAccountJson: keyJson,
      serviceIdentity: identity,
      firebaseProjectId: options.env.FIREBASE_PROJECT_ID?.trim() ?? '',
      firebaseWebApiKey: options.env.FIREBASE_WEB_API_KEY?.trim() ?? '',
      fetchImpl,
    });
    this.rtdb = new FirebaseRtdbRestClient({
      env: options.env,
      fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: async ({ path } = { path: '' }) => {
        const userMatch = /^users\/([A-Za-z0-9_-]{1,160})$/u.exec(path);
        const ownerMatch = /^book_activity_authoring\/owners\/([A-Za-z0-9_-]{1,160})(?:\/|$)/u.exec(path);
        const ownerId = userMatch?.[1] ?? ownerMatch?.[1];
        if (!ownerId) throw new Error('book_activity_authoring_owner_unavailable');
        const claims: BookFirebaseClaimTuple = {
          service: 'book_activity_authoring',
          ownerId,
        };
        return getFirebaseAuthToken(claims);
      },
    });
  }

  async readValue(path: string): Promise<unknown> {
    assertAllowedReadPath(path);
    return this.rtdb.readValue(path);
  }

  async readOwnerRoot(ownerId: string): Promise<BookActivityAuthoringRoot> {
    assertOwnerId(ownerId);
    const current = await this.rtdb.readWithEtag<BookActivityAuthoringRoot | null>(ownerPath(ownerId));
    return root(hydrateRoot(current.data));
  }

  async transaction<T>(ownerId: string, mutate: (current: BookActivityAuthoringRoot) => {
    outcome: T; next?: BookActivityAuthoringRoot; write: boolean;
  }, options: { beforeWrite?: (next: BookActivityAuthoringRoot) => Promise<void> } = {}): Promise<T> {
    assertOwnerId(ownerId);
    const path = ownerPath(ownerId);
    const retries = this.options.maxRetries ?? MAX_RETRIES;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<BookActivityAuthoringRoot | null>(path);
      const mutation = mutate(root(hydrateRoot(current.data)));
      if (!mutation.write) return mutation.outcome;
      const next = root(mutation.next ?? {});
      await options.beforeWrite?.(next);
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) return mutation.outcome;
    }
    throw new Error('book_activity_authoring_cas_retries_exhausted');
  }
}
