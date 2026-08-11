import { FirebaseRtdbRestClient, type RepositoryEnv } from '../../listening-authoring/rtdb.ts';
import type {
  ReplacementContextAuthority,
  ReplacementContextCommitInput,
  ReplacementContextCommitResult,
  ReplacementContextDecision,
  ReplacementContextOperationReceipt,
  ReplacementContextRepository,
} from './contract.ts';
import { REPLACEMENT_CONTEXT_ROOT } from './contract.ts';

const clone = <T>(value: T): T => structuredClone(value);
const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
};
const same = (left: unknown, right: unknown): boolean => stable(left) === stable(right);
const PATH_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;
const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/u;

interface ReplacementContextScope {
  readonly authority: ReplacementContextAuthority;
  readonly decision?: ReplacementContextDecision;
  readonly operations?: Readonly<Record<string, ReplacementContextOperationReceipt>>;
}

const keyFor = (ownerId: string, bookId: string, contextKey: string): string => (
  `${ownerId}/${bookId}/${contextKey}`
);

const pathFor = (ownerId: string, bookId: string, contextKey: string): string => (
  `${REPLACEMENT_CONTEXT_ROOT}/scopes/${ownerId}/${bookId}/${contextKey}`
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const readScope = (value: unknown): ReplacementContextScope | null => {
  if (!isRecord(value) || !isRecord(value.authority)) return null;
  return clone(value as unknown as ReplacementContextScope);
};

const nextAuthority = (input: ReplacementContextCommitInput): ReplacementContextAuthority => ({
  ...clone(input.authority),
  contextRevision: input.authority.contextRevision + 1,
  status: input.choice === 'adopt-current-replacement' ? 'adopted' : 'declined-unavailable',
  current: clone(input.nextCurrent),
  retiredDeliveries: input.authority.retiredDeliveries.map((delivery) => ({
    ...clone(delivery),
    status: 'revoked' as const,
  })),
  completedOperationId: input.operationId,
  completedChoice: input.choice,
  updatedAt: input.now,
});

const nextReceipt = (
  input: ReplacementContextCommitInput,
  authority: ReplacementContextAuthority,
): ReplacementContextOperationReceipt => ({
  operationId: input.operationId,
  requestFingerprint: input.requestFingerprint,
  choice: input.choice,
  outcome: input.choice === 'adopt-current-replacement' ? 'adopted' : 'declined-unavailable',
  contextRevision: authority.contextRevision,
  allRetiredDeliveriesRevoked: true,
  createdAt: input.now,
});

const replay = (
  operation: ReplacementContextOperationReceipt | undefined,
  requestFingerprint: string,
  authority: ReplacementContextAuthority,
): ReplacementContextCommitResult | null => {
  if (!operation) return null;
  if (operation.requestFingerprint !== requestFingerprint) return { status: 'conflict' };
  return { status: 'replayed', authority: clone(authority), receipt: clone(operation) };
};

const commitScope = (
  scope: ReplacementContextScope,
  input: ReplacementContextCommitInput,
): ReplacementContextCommitResult => {
  const operation = scope.operations?.[input.operationId];
  const replayed = replay(operation, input.requestFingerprint, scope.authority);
  if (replayed) return replayed;
  if (scope.authority.contextRevision !== input.expectedRevision
    || scope.authority.status !== 'pending'
    || scope.authority.immutableActivityWorkFingerprint !== input.immutableActivityWorkFingerprint
    || !same(
      [...input.revokedDeliveryIds].sort(),
      scope.authority.retiredDeliveries.map((delivery) => delivery.deliveryId).sort(),
    )) {
    return { status: 'conflict' };
  }
  const authority = nextAuthority(input);
  const receipt = nextReceipt(input, authority);
  return {
    status: 'advanced',
    authority,
    receipt,
  };
};

export class InMemoryReplacementContextRepository implements ReplacementContextRepository {
  private readonly scopes = new Map<string, ReplacementContextScope>();

  constructor(seed: readonly { readonly authority: ReplacementContextAuthority; readonly decision: ReplacementContextDecision }[] = []) {
    seed.forEach(({ authority, decision }) => {
      this.scopes.set(keyFor(authority.ownerId, authority.bookId, authority.contextKey), {
        authority: clone(authority),
        decision: clone(decision),
      });
    });
  }

  async readAuthority(input: { readonly ownerId: string; readonly bookId: string; readonly contextKey: string }) {
    return clone(this.scopes.get(keyFor(input.ownerId, input.bookId, input.contextKey))?.authority ?? null);
  }

  async readDecision(input: { readonly ownerId: string; readonly bookId: string; readonly planId: string; readonly reviewId: string; readonly contextKey: string }) {
    const scope = this.scopes.get(keyFor(input.ownerId, input.bookId, input.contextKey));
    if (!scope?.decision || scope.decision.planId !== input.planId || scope.decision.reviewId !== input.reviewId) return null;
    return clone(scope.decision);
  }

  async findOperation(input: { readonly ownerId: string; readonly bookId: string; readonly contextKey: string; readonly operationId: string }) {
    return clone(this.scopes.get(keyFor(input.ownerId, input.bookId, input.contextKey))?.operations?.[input.operationId] ?? null);
  }

  async commit(input: ReplacementContextCommitInput): Promise<ReplacementContextCommitResult> {
    const key = keyFor(input.authority.ownerId, input.authority.bookId, input.authority.contextKey);
    const scope = this.scopes.get(key);
    if (!scope) return { status: 'missing' };
    const result = commitScope(scope, input);
    if (result.status !== 'advanced') return result;
    this.scopes.set(key, {
      ...scope,
      authority: clone(result.authority),
      operations: { ...(scope.operations ?? {}), [input.operationId]: clone(result.receipt) },
    });
    return clone(result);
  }

  /** Test-only seed/update helper; production callers use the immutable plan choice. */
  setDecision(decision: ReplacementContextDecision): void {
    const key = keyFor(decision.ownerId, decision.bookId, decision.contextKey);
    const scope = this.scopes.get(key);
    if (!scope) throw new Error('replacement_context_authority_missing');
    this.scopes.set(key, { ...scope, decision: clone(decision) });
  }
}

export interface ReplacementContextRepositoryEnv extends RepositoryEnv {
  BOOK_REPLACEMENT_CONTEXT_SERVICE_IDENTITY?: string;
  BOOK_REPLACEMENT_CONTEXT_GOOGLE_SA_KEY?: string;
}

export class FirebaseRestReplacementContextRepository implements ReplacementContextRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: ReplacementContextRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    const identity = options.env.BOOK_REPLACEMENT_CONTEXT_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_replacement_context_service_identity');
    const keyJson = (options.env.BOOK_REPLACEMENT_CONTEXT_GOOGLE_SA_KEY ?? options.env.GOOGLE_SA_KEY)?.trim();
    if (!keyJson && !options.getAccessToken) throw new Error('missing_replacement_context_google_sa_key');
    if (keyJson) {
      let clientEmail: unknown;
      try { clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email; } catch { throw new Error('invalid_replacement_context_google_sa_key'); }
      if (clientEmail !== identity) throw new Error('replacement_context_service_identity_mismatch');
    }
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
    });
  }

  async readAuthority(input: { readonly ownerId: string; readonly bookId: string; readonly contextKey: string }) {
    this.assertPath(input.ownerId, input.bookId, input.contextKey);
    return readScope(await this.rtdb.readValue(pathFor(input.ownerId, input.bookId, input.contextKey)))?.authority ?? null;
  }

  async readDecision(input: { readonly ownerId: string; readonly bookId: string; readonly planId: string; readonly reviewId: string; readonly contextKey: string }) {
    this.assertPath(input.ownerId, input.bookId, input.contextKey);
    const scope = readScope(await this.rtdb.readValue(pathFor(input.ownerId, input.bookId, input.contextKey)));
    if (!scope?.decision || scope.decision.planId !== input.planId || scope.decision.reviewId !== input.reviewId) return null;
    return scope.decision;
  }

  async findOperation(input: { readonly ownerId: string; readonly bookId: string; readonly contextKey: string; readonly operationId: string }) {
    this.assertPath(input.ownerId, input.bookId, input.contextKey);
    if (!OPERATION_ID.test(input.operationId)) return null;
    return readScope(await this.rtdb.readValue(pathFor(input.ownerId, input.bookId, input.contextKey)))?.operations?.[input.operationId] ?? null;
  }

  async commit(input: ReplacementContextCommitInput): Promise<ReplacementContextCommitResult> {
    this.assertPath(input.authority.ownerId, input.authority.bookId, input.authority.contextKey);
    const path = pathFor(input.authority.ownerId, input.authority.bookId, input.authority.contextKey);
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      const scope = readScope(current.data);
      if (!scope) return { status: 'missing' };
      const result = commitScope(scope, input);
      if (result.status !== 'advanced') return result;
      const next: ReplacementContextScope = {
        ...scope,
        authority: result.authority,
        operations: { ...(scope.operations ?? {}), [input.operationId]: result.receipt },
      };
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) return result;
    }
    return { status: 'conflict' };
  }

  private assertPath(...values: readonly string[]): void {
    if (values.some((value) => !PATH_ID.test(value))) throw new Error('invalid_replacement_context_path');
  }
}
