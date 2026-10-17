import {
  createBookRuntimeRecoveryHold,
  isBookRuntimeRecoveryHold,
  isBookRuntimeRecoveryProjection,
  type BookRuntimeRecoveryHold,
  type BookRuntimeRecoveryProjection,
  type BookRuntimeRecoveryProjectionStore,
} from '../../../../src/services/book-activity/bookRuntime.recovery.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';

export const BOOK_RUNTIME_RECOVERY_ROOT = 'book_runtime/scopes';
const MAX_RETRIES = 5;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const PROJECTION_KEY = /^[A-Za-z0-9][A-Za-z0-9._:@~\-]{0,511}$/u;

export interface BookRuntimeRecoveryRepositoryEnv extends RepositoryEnv {
  BOOK_RECOVERY_SERVICE_IDENTITY?: string;
  BOOK_RECOVERY_GOOGLE_SA_KEY?: string;
}

const clone = <T>(value: T): T => structuredClone(value);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const equalDeterministic = (left: unknown, right: unknown): boolean => stable(left) === stable(right);
const assertId = (value: string, label: string): void => {
  if (!ID.test(value)) throw new Error(`invalid_book_runtime_recovery_${label}`);
};
const scopePath = (recipientId: string, contextId: string): string => (
  `${BOOK_RUNTIME_RECOVERY_ROOT}/${recipientId}/${contextId}`
);
const holdPath = (recipientId: string, contextId: string): string => `${scopePath(recipientId, contextId)}/recovery/hold`;
const projectionPath = (recipientId: string, contextId: string, key: string): string => `${scopePath(recipientId, contextId)}/recovery/projections/${key}`;

const createRtdb = (options: {
  readonly env: BookRuntimeRecoveryRepositoryEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
}): FirebaseRtdbRestClient => {
  const identity = options.env.BOOK_RECOVERY_SERVICE_IDENTITY?.trim();
  if (!identity) throw new Error('missing_book_runtime_recovery_service_identity');
  const keyJson = (options.env.BOOK_RECOVERY_GOOGLE_SA_KEY ?? options.env.GOOGLE_SA_KEY)?.trim();
  if (!keyJson && !options.getAccessToken) throw new Error('missing_book_runtime_recovery_google_sa_key');
  if (keyJson) {
    let clientEmail: unknown;
    try { clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email; } catch {
      throw new Error('invalid_book_runtime_recovery_google_sa_key');
    }
    if (clientEmail !== identity) throw new Error('book_runtime_recovery_service_identity_mismatch');
  }
  return new FirebaseRtdbRestClient({
    env: { ...options.env, GOOGLE_SA_KEY: keyJson },
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    getAccessToken: options.getAccessToken,
    firebaseAuthToken: Boolean(options.getAccessToken),
  });
};

/** Operator-only metadata staging; live runtime children are never rewritten. */
export class FirebaseRestBookRuntimeRecoveryProjectionStore implements BookRuntimeRecoveryProjectionStore {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: BookRuntimeRecoveryRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    this.rtdb = createRtdb(options);
  }

  async readHold(input: { readonly recipientId: string; readonly contextId: string }): Promise<BookRuntimeRecoveryHold | null> {
    assertId(input.recipientId, 'recipient_id');
    assertId(input.contextId, 'context_id');
    const value = await this.rtdb.readValue(holdPath(input.recipientId, input.contextId));
    if (value === null) return null;
    if (!isBookRuntimeRecoveryHold(value) || value.recipientId !== input.recipientId || value.contextId !== input.contextId) {
      throw new Error('invalid_book_runtime_recovery_hold');
    }
    return clone(value);
  }

  async putIfAbsent(input: { readonly projectionKey: string; readonly projection: BookRuntimeRecoveryProjection }): Promise<'created' | 'replayed' | 'conflict'> {
    if (!PROJECTION_KEY.test(input.projectionKey)
      || !isBookRuntimeRecoveryProjection(input.projection)
      || input.projection.projectionKey !== input.projectionKey) {
      throw new Error('invalid_book_runtime_recovery_projection');
    }
    const { recipientId, contextId } = input.projection;
    const hold = createBookRuntimeRecoveryHold({ recoveryOperationId: input.projection.recoveryOperationId, recipientId, contextId });
    const existingProjection = await this.rtdb.readWithEtag<unknown>(projectionPath(recipientId, contextId, input.projectionKey));
    if (existingProjection.data !== null) {
      if (!isBookRuntimeRecoveryProjection(existingProjection.data)) throw new Error('invalid_book_runtime_recovery_projection');
      if (!equalDeterministic(existingProjection.data, input.projection)) return 'conflict';
      const holdResult = await this.putChildIfAbsent(holdPath(recipientId, contextId), hold, isBookRuntimeRecoveryHold);
      return holdResult === 'conflict' ? 'conflict' : 'replayed';
    }
    const holdResult = await this.putChildIfAbsent(holdPath(recipientId, contextId), hold, isBookRuntimeRecoveryHold);
    if (holdResult === 'conflict') return 'conflict';
    const projectionResult = await this.putChildIfAbsent(projectionPath(recipientId, contextId, input.projectionKey), input.projection, isBookRuntimeRecoveryProjection);
    if (projectionResult === 'conflict') return 'conflict';
    return projectionResult === 'created' ? 'created' : 'replayed';
  }

  private async putChildIfAbsent<T>(path: string, expected: T, validate: (value: unknown) => boolean): Promise<'created' | 'replayed' | 'conflict'> {
    for (let attempt = 0; attempt < (this.options.maxRetries ?? MAX_RETRIES); attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      if (current.data !== null) {
        if (!validate(current.data)) throw new Error('invalid_book_runtime_recovery_child');
        return equalDeterministic(current.data, expected) ? 'replayed' : 'conflict';
      }
      if (await this.rtdb.writeIfMatch(path, expected, current.etag)) return 'created';
    }
    throw new Error('book_runtime_recovery_child_cas_retries_exhausted');
  }
}
