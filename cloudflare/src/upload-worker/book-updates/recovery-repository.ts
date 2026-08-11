import {
  createBookUpdateRecoveryHold,
  isBookUpdateRecoveryHold,
  isBookUpdateRecoveryProjection,
  type BookUpdateRecoveryHold,
  type BookUpdateRecoveryProjection,
  type BookUpdateRecoveryProjectionStore,
} from '../../../../src/services/book-delivery/bookUpdate.recovery.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';

export const BOOK_UPDATE_RECOVERY_ROOT = 'book_update_action_recovery/49d';
const MAX_RETRIES = 5;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:@~\-]{0,511}$/u;

export interface BookUpdateRecoveryRepositoryEnv extends RepositoryEnv {
  BOOK_RECOVERY_SERVICE_IDENTITY?: string;
  BOOK_RECOVERY_GOOGLE_SA_KEY?: string;
  BOOK_UPDATE_RECOVERY_GOOGLE_SA_KEY?: string;
}

const clone = <T>(value: T): T => structuredClone(value);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  return JSON.stringify(value);
};
const encoded = (value: string): string => encodeURIComponent(value);
const holdPath = (scopeKey: string): string => `${BOOK_UPDATE_RECOVERY_ROOT}/holds/${encoded(scopeKey)}`;
const projectionPath = (projection: BookUpdateRecoveryProjection): string => {
  const prefix = projection.recordKind === 'notification' && projection.recipientId !== null
    ? `notifications/${encoded(projection.recipientId)}`
    : 'projections';
  return `${BOOK_UPDATE_RECOVERY_ROOT}/${prefix}/${encoded(projection.projectionKey)}`;
};

const rtdb = (options: {
  readonly env: BookUpdateRecoveryRepositoryEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
}): FirebaseRtdbRestClient => {
  const identity = options.env.BOOK_RECOVERY_SERVICE_IDENTITY?.trim();
  if (!identity) throw new Error('missing_book_update_recovery_service_identity');
  const keyJson = (options.env.BOOK_UPDATE_RECOVERY_GOOGLE_SA_KEY ?? options.env.BOOK_RECOVERY_GOOGLE_SA_KEY ?? options.env.GOOGLE_SA_KEY)?.trim();
  if (!keyJson && !options.getAccessToken) throw new Error('missing_book_update_recovery_google_sa_key');
  if (keyJson) {
    let clientEmail: unknown;
    try { clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email; } catch { throw new Error('invalid_book_update_recovery_google_sa_key'); }
    if (clientEmail !== identity) throw new Error('book_update_recovery_service_identity_mismatch');
  }
  return new FirebaseRtdbRestClient({ env: { ...options.env, GOOGLE_SA_KEY: keyJson }, fetchImpl: options.fetchImpl ?? globalThis.fetch, getAccessToken: options.getAccessToken, firebaseAuthToken: Boolean(options.getAccessToken) });
};

/** Durable metadata-only store. It never reads or writes a production Book root. */
export class FirebaseRestBookUpdateRecoveryProjectionStore implements BookUpdateRecoveryProjectionStore {
  private readonly client: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: BookUpdateRecoveryRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    this.client = rtdb(options);
  }

  async readHold(input: { readonly scopeKey: string }): Promise<BookUpdateRecoveryHold | null> {
    if (!ID.test(input.scopeKey)) throw new Error('invalid_book_update_recovery_scope');
    const value = await this.client.readValue(holdPath(input.scopeKey));
    if (value === null) return null;
    if (!isBookUpdateRecoveryHold(value) || value.scopeKey !== input.scopeKey) throw new Error('invalid_book_update_recovery_hold');
    return clone(value);
  }

  async putIfAbsent(input: { readonly projectionKey: string; readonly projection: BookUpdateRecoveryProjection }): Promise<'created' | 'replayed' | 'conflict'> {
    if (!KEY.test(input.projectionKey) || !isBookUpdateRecoveryProjection(input.projection) || input.projection.projectionKey !== input.projectionKey) throw new Error('invalid_book_update_recovery_projection');
    const hold = createBookUpdateRecoveryHold({ recoveryOperationId: input.projection.recoveryOperationId, scopeKey: input.projection.scopeKey, recipientId: input.projection.recipientId });
    for (let attempt = 0; attempt < (this.options.maxRetries ?? MAX_RETRIES); attempt += 1) {
      const existingProjection = await this.client.readWithEtag<unknown>(projectionPath(input.projection));
      if (existingProjection.data !== null) {
        if (!isBookUpdateRecoveryProjection(existingProjection.data)) throw new Error('invalid_book_update_recovery_projection');
        if (stable(existingProjection.data) !== stable(input.projection)) return 'conflict';
        const holdResult = await this.putChildIfAbsent(holdPath(input.projection.scopeKey), hold, isBookUpdateRecoveryHold);
        return holdResult === 'conflict' ? 'conflict' : 'replayed';
      }
      const holdResult = await this.putChildIfAbsent(holdPath(input.projection.scopeKey), hold, isBookUpdateRecoveryHold);
      if (holdResult === 'conflict') return 'conflict';
      const projectionResult = await this.putChildIfAbsent(projectionPath(input.projection), input.projection, isBookUpdateRecoveryProjection);
      if (projectionResult === 'conflict') return 'conflict';
      return projectionResult;
    }
    throw new Error('book_update_recovery_projection_cas_retries_exhausted');
  }

  private async putChildIfAbsent<T>(path: string, expected: T, validate: (value: unknown) => boolean): Promise<'created' | 'replayed' | 'conflict'> {
    for (let attempt = 0; attempt < (this.options.maxRetries ?? MAX_RETRIES); attempt += 1) {
      const current = await this.client.readWithEtag<unknown>(path);
      if (current.data !== null) {
        if (!validate(current.data)) throw new Error('invalid_book_update_recovery_child');
        return stable(current.data) === stable(expected) ? 'replayed' : 'conflict';
      }
      if (await this.client.writeIfMatch(path, expected, current.etag)) return 'created';
    }
    throw new Error('book_update_recovery_child_cas_retries_exhausted');
  }
}
