import {
  createBookRedoCheckpointProjection,
  isBookRedoCheckpoint,
  type BookRedoCheckpoint,
  type BookRedoCheckpointInput,
} from '../../../../src/services/book-activity/bookRedoCheckpointProjection.service.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';

export const BOOK_REDO_CHECKPOINT_ROOT = 'book_update_checkpoints';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;

export interface BookRedoCheckpointRepository {
  read(input: { readonly ownerId: string; readonly checkpointId: string }): Promise<BookRedoCheckpoint | null>;
  create(checkpoint: BookRedoCheckpoint): Promise<{
    readonly status: 'created' | 'replayed' | 'conflict';
    readonly checkpoint?: BookRedoCheckpoint;
  }>;
}

export type BookRedoCheckpointApplyResult =
  | { readonly status: 'created' | 'replayed'; readonly checkpoint: BookRedoCheckpoint }
  | { readonly status: 'skipped' }
  | { readonly status: 'conflict'; readonly code: string };

export interface BookRedoCheckpointApplier {
  apply(input: BookRedoCheckpointInput): Promise<BookRedoCheckpointApplyResult>;
}

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(',')}}`;
};

export const createBookRedoCheckpointApplier = (options: {
  readonly repository: BookRedoCheckpointRepository;
}) => Object.freeze({
  async apply(input: BookRedoCheckpointInput): Promise<BookRedoCheckpointApplyResult> {
    const projected = createBookRedoCheckpointProjection(input);
    if (projected.status === 'none') return { status: 'skipped' };
    if (projected.status !== 'checkpoint') return { status: 'conflict', code: projected.code };
    const checkpoint = projected.checkpoint;
    const existing = await options.repository.read({
      ownerId: checkpoint.ownerId,
      checkpointId: checkpoint.checkpointId,
    });
    if (existing) {
      return stable(existing) === stable(checkpoint)
        ? { status: 'replayed', checkpoint: clone(existing) }
        : { status: 'conflict', code: 'checkpoint-identity-conflict' };
    }
    const saved = await options.repository.create(checkpoint);
    if ((saved.status === 'created' || saved.status === 'replayed') && saved.checkpoint) {
      return { status: saved.status, checkpoint: clone(saved.checkpoint) };
    }
    return { status: 'conflict', code: 'checkpoint-persistence-conflict' };
  },
});

export interface BookRedoCheckpointRepositoryEnv extends RepositoryEnv {
  BOOK_REDO_SERVICE_IDENTITY?: string;
  BOOK_REDO_GOOGLE_SA_KEY?: string;
}

interface CheckpointRoot {
  records?: Record<string, Record<string, BookRedoCheckpoint>>;
  by_student?: Record<string, Record<string, Record<string, Record<string, {
    readonly checkpointId: string;
    readonly createdAt: string;
  }>>>>;
  readonly [key: string]: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const rootFrom = (value: unknown): CheckpointRoot => {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) throw new Error('invalid_book_redo_checkpoint_root');
  return structuredClone(value) as CheckpointRoot;
};

const keyPart = (value: string): string => encodeURIComponent(value);

export class FirebaseRestBookRedoCheckpointRepository implements BookRedoCheckpointRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: BookRedoCheckpointRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    const identity = options.env.BOOK_REDO_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_redo_service_identity');
    const keyJson = (options.env.BOOK_REDO_GOOGLE_SA_KEY ?? options.env.GOOGLE_SA_KEY)?.trim();
    if (!keyJson) throw new Error('missing_book_redo_google_sa_key');
    let clientEmail: unknown;
    try {
      clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
    } catch {
      throw new Error('invalid_book_redo_google_sa_key');
    }
    if (clientEmail !== identity) throw new Error('book_redo_service_identity_mismatch');
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
    });
  }

  async read(input: { readonly ownerId: string; readonly checkpointId: string }): Promise<BookRedoCheckpoint | null> {
    if (!ID.test(input.ownerId) || !ID.test(input.checkpointId)) return null;
    const value = await this.rtdb.readValue(
      `${BOOK_REDO_CHECKPOINT_ROOT}/records/${keyPart(input.ownerId)}/${keyPart(input.checkpointId)}`,
    );
    return isBookRedoCheckpoint(value)
      && value.ownerId === input.ownerId
      && value.checkpointId === input.checkpointId
      ? clone(value)
      : null;
  }

  async create(checkpoint: BookRedoCheckpoint): Promise<{
    readonly status: 'created' | 'replayed' | 'conflict';
    readonly checkpoint?: BookRedoCheckpoint;
  }> {
    if (!isBookRedoCheckpoint(checkpoint)) return { status: 'conflict' };
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(BOOK_REDO_CHECKPOINT_ROOT);
      const root = rootFrom(current.data);
      const ownerKey = keyPart(checkpoint.ownerId);
      const checkpointKey = keyPart(checkpoint.checkpointId);
      const existing = root.records?.[ownerKey]?.[checkpointKey];
      if (existing) {
        return stable(existing) === stable(checkpoint)
          ? { status: 'replayed', checkpoint: clone(existing) }
          : { status: 'conflict' };
      }
      root.records ??= {};
      root.records[ownerKey] ??= {};
      root.records[ownerKey]![checkpointKey] = clone(checkpoint);
      root.by_student ??= {};
      root.by_student[ownerKey] ??= {};
      root.by_student[ownerKey]![keyPart(checkpoint.contextKey)] ??= {};
      root.by_student[ownerKey]![keyPart(checkpoint.contextKey)]![keyPart(checkpoint.studentId)] ??= {};
      root.by_student[ownerKey]![keyPart(checkpoint.contextKey)]![keyPart(checkpoint.studentId)]![checkpointKey] = {
        checkpointId: checkpoint.checkpointId,
        createdAt: checkpoint.createdAt,
      };
      if (await this.rtdb.writeIfMatch(BOOK_REDO_CHECKPOINT_ROOT, root, current.etag)) {
        return { status: 'created', checkpoint: clone(checkpoint) };
      }
    }
    return { status: 'conflict' };
  }
}
