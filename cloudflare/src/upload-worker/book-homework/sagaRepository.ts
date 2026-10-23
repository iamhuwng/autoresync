import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import { createFirebaseClaimTokenProvider } from '../book-activity-authoring/firebase-token.ts';
import {
  BOOK_HOMEWORK_SAGA_RECIPIENT_STATES,
  BOOK_HOMEWORK_SAGA_SCHEMA_VERSION,
  BOOK_HOMEWORK_SAGA_STATES,
  type BookHomeworkSagaRecord,
} from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';
import {
  bookHomeworkRecipientAuthorityId,
  bookHomeworkRecipientDeliveryBindingId,
} from './identity.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_RECIPIENTS = 30;
const MAX_BYTES = 512 * 1024;
const PRESENTATION_TEXT = /^.{1,512}$/su;

export interface BookHomeworkSagaRepository {
  read(assignmentId: string, ownerId?: string): Promise<BookHomeworkSagaRecord | null>;
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

function assertPresentation(value: unknown): void {
  if (!isRecord(value)
    || Object.keys(value).some((key) => !['title', 'description'].includes(key))
    || !Object.hasOwn(value, 'title')
    || typeof value.title !== 'string'
    || value.title.trim() !== value.title
    || !PRESENTATION_TEXT.test(value.title)) {
    throw new Error('invalid_book_homework_saga_presentation');
  }
  if (Object.hasOwn(value, 'description')
    && (typeof value.description !== 'string'
      || value.description.trim() !== value.description
      || !PRESENTATION_TEXT.test(value.description))) {
    throw new Error('invalid_book_homework_saga_presentation');
  }
}

export function assertValidBookHomeworkSagaRecord(
  value: unknown,
): asserts value is BookHomeworkSagaRecord {
  if (!isRecord(value)) throw new Error('invalid_book_homework_saga_record');
  const record = value as Record<string, any>;
  const required = [
    'schemaVersion', 'assignmentId', 'operationId', 'idempotencyKey', 'ownerId', 'manifestVersionId',
    'publicationId', 'publicationRevision', 'contextId', 'presentation', 'fingerprint', 'requestFingerprint', 'state', 'visibility',
    'recipients', 'recipientCount', 'committedRecipientCount', 'revision', 'createdAt', 'updatedAt',
  ];
  if (Object.keys(record).some((key) => !required.includes(key) && !['lastError', 'studentDocument', 'targetPreview', 'postCommit'].includes(key))
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
  if (record.contextId !== record.assignmentId) {
    throw new Error('invalid_book_homework_saga_context_identity');
  }
  assertPresentation(record.presentation);
  if (record.studentDocument !== undefined && !isRecord(record.studentDocument)) throw new Error('invalid_book_homework_saga_student_document');
  if (record.targetPreview !== undefined && !isRecord(record.targetPreview)) throw new Error('invalid_book_homework_saga_target_preview');
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
    if (entry.authorityId !== bookHomeworkRecipientAuthorityId(record.assignmentId, entry.recipientId)
      || entry.bindingId !== bookHomeworkRecipientDeliveryBindingId(record.assignmentId, entry.recipientId)) {
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
  if (record.postCommit !== undefined && (!isRecord(record.postCommit)
    || Object.keys(record.postCommit).some(key => !['revision', 'compatibilityReady', 'notifiedRecipientCount', 'checkedRecipientCount', 'source'].includes(key))
    || typeof record.postCommit.revision !== 'number' || !Number.isSafeInteger(record.postCommit.revision) || record.postCommit.revision < 1
    || record.state !== 'committed' || typeof record.postCommit.compatibilityReady !== 'boolean'
    || typeof record.postCommit.checkedRecipientCount !== 'number' || !Number.isSafeInteger(record.postCommit.checkedRecipientCount)
    || record.postCommit.checkedRecipientCount < 0 || record.postCommit.checkedRecipientCount > record.recipientCount
    || record.postCommit.compatibilityReady !== (record.postCommit.checkedRecipientCount === record.recipientCount)
    || typeof record.postCommit.notifiedRecipientCount !== 'number' || !Number.isSafeInteger(record.postCommit.notifiedRecipientCount)
    || record.postCommit.notifiedRecipientCount < 0 || record.postCommit.notifiedRecipientCount > record.recipientCount
    || (!record.postCommit.compatibilityReady && record.postCommit.notifiedRecipientCount !== 0))) {
    throw new Error('invalid_book_homework_saga_post_commit');
  }
  if (record.postCommit?.source !== undefined) {
    const source = record.postCommit.source;
    if (!isRecord(source) || Object.keys(source).some(key => !['bookId', 'finalDueAt', 'availableFrom', 'committedRevision'].includes(key))
      || !Number.isSafeInteger(source.committedRevision) || source.committedRevision !== record.revision) {
      throw new Error('invalid_book_homework_saga_projection_source');
    }
    assertId(source.bookId, 'projection_book');
    assertIso(source.finalDueAt, 'projection_due_at');
    if (source.availableFrom !== undefined) assertIso(source.availableFrom, 'projection_available_from');
  }
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
    if (current.state === 'committed' && (record.revision !== current.revision
      || record.postCommit?.revision !== (current.postCommit?.revision ?? 0) + 1)) return false;
    this.records.set(record.assignmentId, clone(current.state === 'committed'
      ? { ...current, postCommit: record.postCommit } : record));
    return true;
  }
}

export interface BookHomeworkSagaRepositoryEnv extends RepositoryEnv {
  BOOK_HOMEWORK_SERVICE_IDENTITY?: string;
  BOOK_HOMEWORK_GOOGLE_SA_KEY?: string;
}

export class FirebaseRestBookHomeworkSagaRepository implements BookHomeworkSagaRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly rtdbForOwner?: (ownerId: string) => FirebaseRtdbRestClient;

  constructor(options: {
    readonly env: BookHomeworkSagaRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
  }) {
    const identity = options.env.BOOK_HOMEWORK_SERVICE_IDENTITY?.trim();
    const keyJson = options.env.BOOK_HOMEWORK_GOOGLE_SA_KEY?.trim();
    if (!identity) throw new Error('missing_book_homework_saga_service_identity');
    if (keyJson) {
      let clientEmail: unknown;
      try { clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email; } catch {
        throw new Error('invalid_book_homework_saga_google_sa_key');
      }
      if (clientEmail !== identity) throw new Error('book_homework_saga_service_identity_mismatch');
    }
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (options.getAccessToken) {
      this.rtdb = new FirebaseRtdbRestClient({
        env: options.env,
        fetchImpl,
        getAccessToken: options.getAccessToken,
        firebaseAuthToken: true,
      });
      return;
    }
    if (!keyJson) throw new Error('missing_book_homework_google_sa_key');
    const getFirebaseAuthToken = createFirebaseClaimTokenProvider({
      serviceAccountJson: keyJson,
      serviceIdentity: identity,
      firebaseProjectId: options.env.FIREBASE_PROJECT_ID?.trim() ?? '',
      firebaseWebApiKey: options.env.FIREBASE_WEB_API_KEY?.trim() ?? '',
      fetchImpl,
    });
    this.rtdbForOwner = (ownerId: string) => new FirebaseRtdbRestClient({
      env: options.env,
      fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: async () => getFirebaseAuthToken({
        service: 'book_homework',
        ownerId,
      }),
    });
    this.rtdb = new FirebaseRtdbRestClient({
      env: options.env,
      fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: async () => { throw new Error('book_homework_owner_unavailable'); },
    });
  }

  private clientForOwner(ownerId?: string): FirebaseRtdbRestClient {
    if (!this.rtdbForOwner) return this.rtdb;
    if (!ownerId) throw new Error('book_homework_owner_unavailable');
    assertId(ownerId, 'owner_id');
    return this.rtdbForOwner(ownerId);
  }

  async read(assignmentId: string, ownerId?: string): Promise<BookHomeworkSagaRecord | null> {
    assertId(assignmentId, 'assignment_id');
    const value = fromStored(await this.clientForOwner(ownerId).readValue(sagaPath(assignmentId)));
    if (value === null) return null;
    assertValidBookHomeworkSagaRecord(value);
    return clone(value);
  }

  async create(record: BookHomeworkSagaRecord): Promise<boolean> {
    assertValidBookHomeworkSagaRecord(record);
    const rtdb = this.clientForOwner(record.ownerId);
    return rtdb.writeIfMatch(sagaPath(record.assignmentId), toStored(record), 'null_etag');
  }

  async compareAndSet(record: BookHomeworkSagaRecord, expectedRevision: number): Promise<boolean> {
    assertValidBookHomeworkSagaRecord(record);
    const rtdb = this.clientForOwner(record.ownerId);
    const response = await rtdb.readWithEtag<unknown>(sagaPath(record.assignmentId));
    const data = fromStored(response.data);
    if (data === null) return false;
    assertValidBookHomeworkSagaRecord(data);
    if (data.revision !== expectedRevision) return false;
    if (data.state === 'committed') {
      if (record.state !== 'committed' || record.revision !== data.revision || !record.postCommit) return false;
      const progressPath = `${sagaPath(record.assignmentId)}/postCommit`;
      const progress = await rtdb.readWithEtag<BookHomeworkSagaRecord['postCommit']>(progressPath);
      if (record.postCommit.revision !== (progress.data?.revision ?? 0) + 1) return false;
      return rtdb.writeIfMatch(progressPath, record.postCommit, progress.etag);
    }
    return rtdb.writeIfMatch(sagaPath(record.assignmentId), toStored(record), response.etag);
  }
}
