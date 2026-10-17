import type { BookUpdateActionRecord } from '../../../../src/services/book-delivery/bookUpdateAction.types.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import {
  transitionBookUpdateActionRecord,
  type BookUpdateActionRepository,
} from './update-action.ts';

export const BOOK_UPDATE_ACTION_ROOT = 'book_update_actions';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;

interface ActionPointer {
  readonly actionId: string;
  readonly requestFingerprint: string;
  readonly bookId: string;
  readonly acceptedAt: string;
}

interface ActionRoot {
  records?: Record<string, Record<string, BookUpdateActionRecord>>;
  by_idempotency?: Record<string, Record<string, ActionPointer>>;
  by_book?: Record<string, Record<string, Record<string, ActionPointer>>>;
  readonly [key: string]: unknown;
}

export interface BookUpdateActionRepositoryEnv extends RepositoryEnv {
  BOOK_UPDATE_ACTION_SERVICE_IDENTITY?: string;
  BOOK_UPDATE_ACTION_GOOGLE_SA_KEY?: string;
}

const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const rootFrom = (value: unknown): ActionRoot => {
  if (value === null || value === undefined) return {};
  if (!record(value)) throw new Error('invalid_book_update_action_root');
  return structuredClone(value) as ActionRoot;
};

const pointerFor = (action: BookUpdateActionRecord): ActionPointer => ({
  actionId: action.actionId,
  requestFingerprint: action.requestFingerprint,
  bookId: action.bookId,
  acceptedAt: action.acceptedAt,
});

export class FirebaseRestBookUpdateActionRepository implements BookUpdateActionRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: BookUpdateActionRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    const identity = options.env.BOOK_UPDATE_ACTION_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_update_action_service_identity');
    const keyJson = (options.env.BOOK_UPDATE_ACTION_GOOGLE_SA_KEY ?? options.env.GOOGLE_SA_KEY)?.trim();
    if (!keyJson) throw new Error('missing_book_update_action_google_sa_key');
    let clientEmail: unknown;
    try {
      clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
    } catch {
      throw new Error('invalid_book_update_action_google_sa_key');
    }
    if (clientEmail !== identity) throw new Error('book_update_action_service_identity_mismatch');
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
    });
  }

  async accept(action: BookUpdateActionRecord): Promise<
    | { readonly status: 'accepted' | 'replayed'; readonly action: BookUpdateActionRecord }
    | { readonly status: 'conflict' }
  > {
    if (!ID.test(action.ownerId) || !ID.test(action.actionId) || !ID.test(action.bookId)
      || action.ownerId !== action.actorId || action.state !== 'accepted' || action.stateRevision !== 0) {
      throw new Error('invalid_book_update_action');
    }
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(BOOK_UPDATE_ACTION_ROOT);
      const root = rootFrom(current.data);
      const existingPointer = root.by_idempotency?.[action.ownerId]?.[action.idempotencyKey];
      if (existingPointer) {
        const existing = root.records?.[action.ownerId]?.[existingPointer.actionId];
        if (!existing) throw new Error('book_update_action_index_corrupt');
        return existing.requestFingerprint === action.requestFingerprint
          ? { status: 'replayed', action: structuredClone(existing) }
          : { status: 'conflict' };
      }
      if (root.records?.[action.ownerId]?.[action.actionId]) {
        throw new Error('book_update_action_id_collision');
      }
      const pointer = pointerFor(action);
      root.records ??= {};
      root.records[action.ownerId] ??= {};
      root.records[action.ownerId]![action.actionId] = structuredClone(action);
      root.by_idempotency ??= {};
      root.by_idempotency[action.ownerId] ??= {};
      root.by_idempotency[action.ownerId]![action.idempotencyKey] = pointer;
      root.by_book ??= {};
      root.by_book[action.ownerId] ??= {};
      root.by_book[action.ownerId]![action.bookId] ??= {};
      root.by_book[action.ownerId]![action.bookId]![action.actionId] = pointer;
      if (await this.rtdb.writeIfMatch(BOOK_UPDATE_ACTION_ROOT, root, current.etag)) {
        return { status: 'accepted', action };
      }
    }
    throw new Error('book_update_action_cas_retries_exhausted');
  }

  async read(ownerId: string, actionId: string): Promise<BookUpdateActionRecord | null> {
    if (!ID.test(ownerId) || !ID.test(actionId)) return null;
    const value = await this.rtdb.readValue(`${BOOK_UPDATE_ACTION_ROOT}/records/${ownerId}/${actionId}`);
    if (!record(value)) return null;
    const action = value as unknown as BookUpdateActionRecord;
    if (action.ownerId !== ownerId || action.actorId !== ownerId || action.actionId !== actionId) return null;
    return structuredClone(action);
  }

  async findByIdempotency(ownerId: string, idempotencyKey: string): Promise<BookUpdateActionRecord | null> {
    if (!ID.test(ownerId) || !ID.test(idempotencyKey)) return null;
    const pointerValue = await this.rtdb.readValue(
      `${BOOK_UPDATE_ACTION_ROOT}/by_idempotency/${ownerId}/${idempotencyKey}`,
    );
    if (!record(pointerValue) || typeof pointerValue.actionId !== 'string' || !ID.test(pointerValue.actionId)) {
      return null;
    }
    const action = await this.read(ownerId, pointerValue.actionId);
    if (!action || action.idempotencyKey !== idempotencyKey) {
      throw new Error('book_update_action_index_corrupt');
    }
    return action;
  }

  async transition(input: Parameters<BookUpdateActionRepository['transition']>[0]): Promise<{
    readonly status: 'advanced' | 'conflict' | 'missing';
    readonly action?: BookUpdateActionRecord;
  }> {
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(BOOK_UPDATE_ACTION_ROOT);
      const root = rootFrom(current.data);
      const existing = root.records?.[input.ownerId]?.[input.actionId];
      if (!existing) return { status: 'missing' };
      if (existing.ownerId !== input.ownerId
        || existing.state !== input.expectedState
        || existing.stateRevision !== input.expectedRevision) return { status: 'conflict' };
      const advanced = transitionBookUpdateActionRecord(
        existing,
        input.nextState,
        input.at,
        input.terminalFailureCode,
      );
      root.records![input.ownerId]![input.actionId] = advanced;
      if (await this.rtdb.writeIfMatch(BOOK_UPDATE_ACTION_ROOT, root, current.etag)) {
        return { status: 'advanced', action: structuredClone(advanced) };
      }
    }
    return { status: 'conflict' };
  }
}
