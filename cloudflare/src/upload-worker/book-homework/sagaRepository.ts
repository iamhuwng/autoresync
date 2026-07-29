import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import {
  BOOK_HOMEWORK_SAGA_RECIPIENT_STATES,
  BOOK_HOMEWORK_SAGA_SCHEMA_VERSION,
  BOOK_HOMEWORK_SAGA_STATES,
  type BookHomeworkSagaRecord,
} from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_RECIPIENTS = 30;
const MAX_BYTES = 512 * 1024;

export interface BookHomeworkSagaRepository {
  read(assignmentId: string): Promise<BookHomeworkSagaRecord | null>;
  create(record: BookHomeworkSagaRecord): Promise<boolean>;
  compareAndSet(record: BookHomeworkSagaRecord, expectedRevision: number): Promise<boolean>;
}

const clone = <T>(value: T): T => structuredClone(value);
const sagaPath = (assignmentId: string): string => `book_homework/operations/${assignmentId}`;
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const toStored = (record: BookHomeworkSagaRecord): Record<string, unknown> => ({
  ...record,
  recipients: Object.fromEntries(record.recipients.map((entry) => [entry.recipientId, entry])),
});
const fromStored = (value: unknown): unknown => {
  if (!isRecord(value) || !isRecord(value.recipients)) return value;
  const recipients = Object.entries(value.recipients)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([recipientId, entry]) => {
      if (!isRecord(entry) || entry.recipientId !== recipientId) {
        throw new Error('invalid_book_homework_saga_recipient_key');
      }
      return entry;
    });
  return { ...value, recipients };
};
function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(`invalid_book_homework_saga_${label}`);
}
function assertIso(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) {
    throw new Error(`invalid_book_homework_saga_${label}`);
  }
}

export function assertValidBookHomeworkSagaRecord(
  value: unknown,
): asserts value is BookHomeworkSagaRecord {
  if (!isRecord(value)) throw new Error('invalid_book_homework_saga_record');
  const record = value as Record<string, any>;
  const required = [
    'schemaVersion', 'assignmentId', 'operationId', 'idempotencyKey', 'ownerId', 'manifestVersionId',
    'publicationId', 'publicationRevision', 'contextId', 'fingerprint', 'requestFingerprint', 'state', 'visibility',
    'recipients', 'recipientCount', 'committedRecipientCount', 'revision', 'createdAt', 'updatedAt',
  ];
  if (Object.keys(record).some((key) => !required.includes(key) && key !== 'lastError')
    || required.some((key) => !Object.hasOwn(record, key))) {
    throw new Error('invalid_book_homework_saga_fields');
  }
  if (record.schemaVersion !== BOOK_HOMEWORK_SAGA_SCHEMA_VERSION
    || !BOOK_HOMEWORK_SAGA_STATES.includes(record.state)
    || (record.visibility !== 'hidden' && record.visibility !== 'committed')
    || !Number.isSafeInteger(record.publicationRevision) || record.publicationRevision < 1
    || !Number.isSafeInteger(record.recipientCount) || record.recipientCount < 1 || record.recipientCount > MAX_RECIPIENTS
    || !Number.isSafeInteger(record.committedRecipientCount) || record.committedRecipientCount < 0
    || record.committedRecipientCount > record.recipientCount
    || !Number.isSafeInteger(record.revision) || record.revision < 1
     || typeof record.fingerprint !== 'string' || record.fingerprint.length === 0 || record.fingerprint.length > 8192
     || typeof record.requestFingerprint !== 'string' || record.requestFingerprint.length === 0 || record.requestFingerprint.length > 4096
    || (record.lastError !== undefined && (typeof record.lastError !== 'string' || record.lastError.length > 512))) {
    throw new Error('invalid_book_homework_saga_values');
  }
  assertId(record.assignmentId, 'assignment_id');
  if (!UUID.test(String(record.operationId))) throw new Error('invalid_book_homework_saga_operation_id');
  assertId(record.idempotencyKey, 'idempotency_key');
  assertId(record.ownerId, 'owner_id');
  assertId(record.manifestVersionId, 'manifest_version_id');
  assertId(record.publicationId, 'publication_id');
  assertId(record.contextId, 'context_id');
  assertIso(record.createdAt, 'created_at');
  assertIso(record.updatedAt, 'updated_at');
  if (!Array.isArray(record.recipients) || record.recipients.length === 0 || record.recipients.length > MAX_RECIPIENTS) {
    throw new Error('invalid_book_homework_saga_recipients');
  }
  if (record.recipientCount !== record.recipients.length) throw new Error('invalid_book_homework_saga_recipient_count');
  const seen = new Set<string>();
  record.recipients.forEach((rawEntry: unknown) => {
    const entry = rawEntry as Record<string, any>;
    if (!isRecord(entry)) throw new Error('invalid_book_homework_saga_recipient');
    const keys = ['recipientId', 'authorityId', 'bindingId', 'state'];
    if (Object.keys(entry).some((key) => ![...keys, 'authorityRevision', 'bindingRevision', 'tombstonedAt'].includes(key))
      || keys.some((key) => !Object.hasOwn(entry, key))) throw new Error('invalid_book_homework_saga_recipient_fields');
    assertId(entry.recipientId, 'recipient_id');
    assertId(entry.authorityId, 'authority_id');
    assertId(entry.bindingId, 'binding_id');
    if (entry.authorityId !== `${record.assignmentId}--${entry.recipientId}--authority`
      || entry.bindingId !== `${record.assignmentId}--${entry.recipientId}--delivery`) {
      throw new Error('invalid_book_homework_saga_deterministic_id');
    }
    if (!BOOK_HOMEWORK_SAGA_RECIPIENT_STATES.includes(entry.state as never) || seen.has(entry.recipientId)) {
      throw new Error('invalid_book_homework_saga_recipient_state');
    }
    seen.add(entry.recipientId);
    for (const key of ['authorityRevision', 'bindingRevision'] as const) {
      const revision = entry[key];
      if (revision !== undefined && (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)) {
        throw new Error('invalid_book_homework_saga_revision');
      }
    }
    if (entry.tombstonedAt !== undefined) assertIso(entry.tombstonedAt, 'tombstoned_at');
    if (entry.tombstonedAt !== undefined && entry.state !== 'compensated') {
      throw new Error('invalid_book_homework_saga_tombstone');
    }
  });
  const committedCount = record.recipients.filter((entry) => entry.state === 'committed').length;
  if (record.committedRecipientCount !== committedCount) throw new Error('invalid_book_homework_saga_committed_count');
  if (record.state === 'committed' && (record.visibility !== 'committed' || record.committedRecipientCount !== record.recipientCount)) {
    throw new Error('invalid_book_homework_saga_visibility');
  }
  if (record.state !== 'committed' && record.visibility !== 'hidden') {
    throw new Error('invalid_book_homework_saga_visibility');
  }
}

export class InMemoryBookHomeworkSagaRepository implements BookHomeworkSagaRepository {
  private readonly records = new Map<string, BookHomeworkSagaRecord>();

  async read(assignmentId: string): Promise<BookHomeworkSagaRecord | null> {
    return clone(this.records.get(assignmentId) ?? null);
  }

  async create(record: BookHomeworkSagaRecord): Promise<boolean> {
    assertValidBookHomeworkSagaRecord(record);
    if (this.records.has(record.assignmentId)) return false;
    this.records.set(record.assignmentId, clone(record));
    return true;
  }

  async compareAndSet(record: BookHomeworkSagaRecord, expectedRevision: number): Promise<boolean> {
    assertValidBookHomeworkSagaRecord(record);
    const current = this.records.get(record.assignmentId);
    if (!current || current.revision !== expectedRevision) return false;
    this.records.set(record.assignmentId, clone(record));
    return true;
  }
}

export interface BookHomeworkSagaRepositoryEnv extends RepositoryEnv {
  BOOK_HOMEWORK_SERVICE_IDENTITY?: string;
  BOOK_HOMEWORK_GOOGLE_SA_KEY?: string;
}

export class FirebaseRestBookHomeworkSagaRepository implements BookHomeworkSagaRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(options: {
    readonly env: BookHomeworkSagaRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
  }) {
    const identity = options.env.BOOK_HOMEWORK_SERVICE_IDENTITY?.trim();
    const keyJson = options.env.BOOK_HOMEWORK_GOOGLE_SA_KEY?.trim();
    if (!identity) throw new Error('missing_book_homework_saga_service_identity');
    if (!options.getAccessToken) throw new Error('missing_book_homework_saga_scoped_access_token');
    if (keyJson) {
      let clientEmail: unknown;
      try { clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email; } catch {
        throw new Error('invalid_book_homework_saga_google_sa_key');
      }
      if (clientEmail !== identity) throw new Error('book_homework_saga_service_identity_mismatch');
    }
    this.rtdb = new FirebaseRtdbRestClient({
      // Do not fall back to a Google OAuth service-account token here. The
      // Worker must supply a Firebase Auth token carrying the rule-bound
      // service/owner claims; server-side CAS remains the second boundary.
      env: { ...options.env, GOOGLE_SA_KEY: undefined },
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      getAccessToken: options.getAccessToken,
      firebaseAuthToken: true,
    });
  }

  async read(assignmentId: string): Promise<BookHomeworkSagaRecord | null> {
    assertId(assignmentId, 'assignment_id');
    const value = fromStored(await this.rtdb.readValue(sagaPath(assignmentId)));
    if (value === null) return null;
    assertValidBookHomeworkSagaRecord(value);
    return clone(value);
  }

  async create(record: BookHomeworkSagaRecord): Promise<boolean> {
    assertValidBookHomeworkSagaRecord(record);
    const { data, etag } = await this.rtdb.readWithEtag<unknown>(sagaPath(record.assignmentId));
    if (data !== null) return false;
    return this.rtdb.writeIfMatch(sagaPath(record.assignmentId), toStored(record), etag);
  }

  async compareAndSet(record: BookHomeworkSagaRecord, expectedRevision: number): Promise<boolean> {
    assertValidBookHomeworkSagaRecord(record);
    const response = await this.rtdb.readWithEtag<unknown>(sagaPath(record.assignmentId));
    const data = fromStored(response.data);
    if (data === null) return false;
    assertValidBookHomeworkSagaRecord(data);
    if (data.revision !== expectedRevision) return false;
    return this.rtdb.writeIfMatch(sagaPath(record.assignmentId), toStored(record), response.etag);
  }
}
