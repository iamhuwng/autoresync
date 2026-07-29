import { importPKCS8, SignJWT } from 'jose';
import {
  classifyBookHomeworkDeadlineMutation,
  type BookHomeworkSchedule,
} from '../../../../src/services/book-homework/bookHomeworkSchedule.service.ts';
import {
  toStudentSafeBookHomeworkProjection,
} from '../../../../src/services/book-homework/bookHomeworkManifest.service.ts';
import type {
  BookHomeworkAuthorityMutationResult,
  BookHomeworkAuthorityRecord,
  BookHomeworkCreateCommand,
  BookHomeworkRecoveryCommand,
  BookHomeworkSagaState,
  BookHomeworkScheduleCommand,
  BookHomeworkStudentState,
  BookHomeworkStudentExtensionCommand,
  BookHomeworkStudentProjection,
  BookHomeworkVisibilityCommand,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import {
  assertIso,
  assertValidBookHomeworkAuthorityRecord,
  assertValidBookHomeworkSchedule,
  BookHomeworkAuthorityError,
  cloneAuthorityRecord,
  fingerprint,
  inheritedBookHomeworkDueAt,
} from './authority.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const MAX_RETRIES = 5;
const OAUTH2_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_SCOPES = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/userinfo.email';

export interface BookHomeworkStoredDocument {
  readonly value: unknown;
  readonly updateTime: string;
}

export interface BookHomeworkDocumentStore {
  read(assignmentId: string): Promise<BookHomeworkStoredDocument | null>;
  write(assignmentId: string, value: BookHomeworkAuthorityRecord, updateTime?: string): Promise<boolean>;
}

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const assertCommandId = (value: unknown, label: string): asserts value is string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new BookHomeworkAuthorityError('invalid-command', `${label} is invalid.`);
  }
};

const assertRevision = (value: unknown): asserts value is number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BookHomeworkAuthorityError('invalid-command', 'Expected revision is invalid.');
  }
};

const assertOwner = (record: BookHomeworkAuthorityRecord, ownerId: string): void => {
  if (record.ownerId !== ownerId) {
    throw new BookHomeworkAuthorityError('owner-mismatch', 'Book Homework owner does not match the command.');
  }
};

const dueAtFor = (schedule: BookHomeworkSchedule, nodeKey: string): string | undefined => {
  if (nodeKey === '$assignment') return schedule.finalDueAt;
  return schedule.scheduleRules.find((rule) => rule.nodeKey === nodeKey)?.dueAt;
};

const changedScheduleKeys = (
  before: BookHomeworkSchedule,
  after: BookHomeworkSchedule,
): readonly string[] => {
  const changed = new Set<string>();
  if (before.finalDueAt !== after.finalDueAt) changed.add('$assignment');
  if (before.availableFrom !== after.availableFrom) changed.add('$availability');
  const keys = new Set([
    ...before.scheduleRules.map((rule) => rule.nodeKey),
    ...after.scheduleRules.map((rule) => rule.nodeKey),
  ]);
  keys.forEach((nodeKey) => {
    const beforeRule = before.scheduleRules.find((rule) => rule.nodeKey === nodeKey);
    const afterRule = after.scheduleRules.find((rule) => rule.nodeKey === nodeKey);
    if (fingerprint(beforeRule) !== fingerprint(afterRule)) changed.add(nodeKey);
  });
  return [...changed].sort();
};

const result = (
  status: BookHomeworkAuthorityMutationResult['status'],
  record: BookHomeworkAuthorityRecord,
): BookHomeworkAuthorityMutationResult => ({
  status,
  assignmentId: record.assignmentId,
  revision: record.revision,
  visibility: record.visibility.status,
});

const withOperation = (
  record: BookHomeworkAuthorityRecord,
  operationId: string,
  operationFingerprint: string,
  operationResult: BookHomeworkAuthorityMutationResult,
  createdAt: string,
): BookHomeworkAuthorityRecord => ({
  ...record,
  operations: {
    ...(record.operations ?? {}),
    [operationId]: {
      fingerprint: operationFingerprint,
      result: operationResult,
      createdAt,
    },
  },
});

const validateCommandCommon = (input: {
  readonly assignmentId: string;
  readonly ownerId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
  readonly updatedAt?: string;
  readonly createdAt?: string;
}): void => {
  assertCommandId(input.assignmentId, 'assignmentId');
  assertCommandId(input.ownerId, 'ownerId');
  assertCommandId(input.commandId, 'commandId');
  assertCommandId(input.idempotencyKey, 'idempotencyKey');
  assertRevision(input.expectedRevision);
  assertIso(input.updatedAt ?? input.createdAt, input.updatedAt === undefined ? 'createdAt' : 'updatedAt');
};

export class BookHomeworkAuthorityRepository {
  constructor(
    private readonly store: BookHomeworkDocumentStore,
    private readonly options: {
      readonly maxRetries?: number;
      readonly resolveAffectedStudentStates: (
        record: BookHomeworkAuthorityRecord,
        nodeKey: string,
      ) => Promise<readonly BookHomeworkStudentState[]>;
      readonly resolveCommittedRoot: (record: BookHomeworkAuthorityRecord) => Promise<boolean>;
    },
  ) {
    if (typeof options?.resolveAffectedStudentStates !== 'function') {
      throw new BookHomeworkAuthorityError('invalid-command', 'An authoritative student-state resolver is required.');
    }
    if (typeof options?.resolveCommittedRoot !== 'function') {
      throw new BookHomeworkAuthorityError('invalid-command', 'A root-saga visibility resolver is required.');
    }
  }

  async read(assignmentId: string): Promise<BookHomeworkAuthorityRecord | null> {
    assertCommandId(assignmentId, 'assignmentId');
    const stored = await this.store.read(assignmentId);
    if (!stored) return null;
    assertValidBookHomeworkAuthorityRecord(stored.value);
    return cloneAuthorityRecord(stored.value);
  }

  async readStudentProjection(
    assignmentId: string,
    studentId: string,
  ): Promise<BookHomeworkStudentProjection | null> {
    assertCommandId(studentId, 'studentId');
    const record = await this.read(assignmentId);
    if (!record || record.bookManifest.context.recipientId !== studentId
      || record.visibility.status !== 'committed'
      || !await this.options.resolveCommittedRoot(record)) return null;
    return clone({
      assignmentId: record.assignmentId,
      schemaVersion: record.schemaVersion,
      assignmentKind: record.assignmentKind,
      manifestVersionId: record.bookManifest.manifestVersionId,
      bookManifest: toStudentSafeBookHomeworkProjection(record.bookManifest),
      schedule: record.schedule,
      studentExtensions: record.studentExtensions[studentId] ?? {},
    });
  }

  async create(input: BookHomeworkCreateCommand): Promise<BookHomeworkAuthorityMutationResult> {
    validateCommandCommon(input);
    if (input.expectedRevision !== 0) throw new BookHomeworkAuthorityError('invalid-command', 'Create expected revision must be zero.');
    if (input.manifest.ownerId !== input.ownerId) throw new BookHomeworkAuthorityError('owner-mismatch', 'Manifest owner does not match create owner.');
    assertValidBookHomeworkSchedule(input.schedule, input.manifest.outline);
    if (fingerprint(input.schedule.scheduleRules) !== fingerprint(input.manifest.scheduleRules)) {
      throw new BookHomeworkAuthorityError('immutable-manifest', 'Initial authority schedule must match the frozen manifest schedule rules.');
    }
    assertValidBookHomeworkAuthorityRecord({
      assignmentId: input.assignmentId,
      assignmentKind: 'book_activity_bundle',
      schemaVersion: 1,
      ownerId: input.ownerId,
      bookManifest: input.manifest,
      schedule: input.schedule,
      studentExtensions: {},
      saga: { sagaId: input.sagaId, state: 'prepared', lastCommandId: input.commandId },
      visibility: {
        status: 'prepared',
        pointerId: input.manifest.manifestVersionId,
        manifestVersionId: input.manifest.manifestVersionId,
        revision: 1,
      },
      revision: 1,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });

    return this.mutate(input.assignmentId, input.expectedRevision, input.idempotencyKey, fingerprint(input), input.createdAt, (current) => {
      if (current) throw new BookHomeworkAuthorityError('revision-conflict', 'Book Homework assignment already exists.');
      const record: BookHomeworkAuthorityRecord = {
        assignmentId: input.assignmentId,
        assignmentKind: 'book_activity_bundle',
        schemaVersion: 1,
        ownerId: input.ownerId,
        bookManifest: clone(input.manifest),
        schedule: clone(input.schedule),
        studentExtensions: {},
        saga: { sagaId: input.sagaId, state: 'prepared', lastCommandId: input.commandId },
        visibility: {
          status: 'prepared',
          pointerId: input.manifest.manifestVersionId,
          manifestVersionId: input.manifest.manifestVersionId,
          revision: 1,
        },
        revision: 1,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      };
      const operationResult = result('created', record);
      return { record: withOperation(record, input.idempotencyKey, fingerprint(input), operationResult, input.createdAt), operationResult };
    });
  }

  async updateSchedule(input: BookHomeworkScheduleCommand): Promise<BookHomeworkAuthorityMutationResult> {
    validateCommandCommon(input);
    if (input.changedNodeKey !== '$assignment' && input.changedNodeKey !== '$availability') {
      assertCommandId(input.changedNodeKey, 'changedNodeKey');
    }
    const operationFingerprint = fingerprint(input);
    return this.mutate(input.assignmentId, input.expectedRevision, input.idempotencyKey, operationFingerprint, input.updatedAt, async (current) => {
      const record = this.requireOwner(current, input.ownerId);
      assertValidBookHomeworkSchedule(input.schedule, record.bookManifest.outline);
      const changedKeys = changedScheduleKeys(record.schedule as BookHomeworkSchedule, input.schedule as BookHomeworkSchedule);
      const availabilityChanged = record.schedule.availableFrom !== input.schedule.availableFrom
        || [...new Set([
          ...record.schedule.scheduleRules.map((rule) => rule.nodeKey),
          ...input.schedule.scheduleRules.map((rule) => rule.nodeKey),
        ])].some((nodeKey) => {
          const before = record.schedule.scheduleRules.find((rule) => rule.nodeKey === nodeKey)?.availableFrom;
          const after = input.schedule.scheduleRules.find((rule) => rule.nodeKey === nodeKey)?.availableFrom;
          return before !== after;
        });
      if (availabilityChanged) {
        throw new BookHomeworkAuthorityError('invalid-command', 'Availability changes require the canonical assignment command.');
      }
      if (changedKeys.length !== 1 || changedKeys[0] !== input.changedNodeKey) {
        throw new BookHomeworkAuthorityError('invalid-command', 'Schedule command must identify exactly one changed deadline node.');
      }
      if (input.changedNodeKey !== '$assignment'
        && !record.bookManifest.outline.some((node) => node.nodeKey === input.changedNodeKey)) {
        throw new BookHomeworkAuthorityError('invalid-command', 'Schedule command node is not in the frozen outline.');
      }
      const affectedStudentStates = await this.options.resolveAffectedStudentStates(record, input.changedNodeKey);
      const oldDueAt = dueAtFor(record.schedule as BookHomeworkSchedule, input.changedNodeKey);
      const nextDueAt = dueAtFor(input.schedule as BookHomeworkSchedule, input.changedNodeKey);
      const mutation = classifyBookHomeworkDeadlineMutation({
        nodeKey: input.changedNodeKey,
        previousDueAt: oldDueAt,
        nextDueAt,
        affectedStudentStates,
      });
      if ((mutation.kind === 'add' || mutation.kind === 'shorten' || mutation.kind === 'remove')
        && (!affectedStudentStates || affectedStudentStates.some((state) => state !== 'not-started'))) {
        throw new BookHomeworkAuthorityError('unsafe-deadline', 'Book Homework cannot add, remove, or shorten an affected deadline after start or without known student state.');
      }
      const next: BookHomeworkAuthorityRecord = {
        ...record,
        schedule: clone(input.schedule),
        revision: record.revision + 1,
        updatedAt: input.updatedAt,
        saga: { ...record.saga, lastCommandId: input.commandId },
      };
      const operationResult = result('updated', next);
      return { record: withOperation(next, input.idempotencyKey, operationFingerprint, operationResult, input.updatedAt), operationResult };
    });
  }

  async updateStudentExtension(input: BookHomeworkStudentExtensionCommand): Promise<BookHomeworkAuthorityMutationResult> {
    validateCommandCommon(input);
    assertCommandId(input.studentId, 'studentId');
    assertCommandId(input.nodeKey, 'nodeKey');
    assertIso(input.dueAt, 'dueAt');
    const operationFingerprint = fingerprint(input);
    return this.mutate(input.assignmentId, input.expectedRevision, input.idempotencyKey, operationFingerprint, input.updatedAt, (current) => {
      const record = this.requireOwner(current, input.ownerId);
      if (record.bookManifest.context.recipientId !== input.studentId) {
        throw new BookHomeworkAuthorityError('invalid-command', 'Student extension is outside the frozen recipient boundary.');
      }
      if (!record.bookManifest.outline.some((node) => node.nodeKey === input.nodeKey)) {
        throw new BookHomeworkAuthorityError('invalid-command', 'Student extension node is not in the frozen outline.');
      }
      const baseDueAt = inheritedBookHomeworkDueAt(record.schedule, record.bookManifest.outline, input.nodeKey);
      if (Date.parse(input.dueAt) <= Date.parse(baseDueAt)) {
        throw new BookHomeworkAuthorityError('unsafe-deadline', 'Student extension must be later than the assigned deadline.');
      }
      const currentExtension = record.studentExtensions[input.studentId]?.[input.nodeKey];
      if (currentExtension && Date.parse(input.dueAt) < Date.parse(currentExtension.dueAt)) {
        throw new BookHomeworkAuthorityError('unsafe-deadline', 'Student extension cannot be shortened.');
      }
      const next: BookHomeworkAuthorityRecord = {
        ...record,
        studentExtensions: {
          ...record.studentExtensions,
          [input.studentId]: {
            ...(record.studentExtensions[input.studentId] ?? {}),
            [input.nodeKey]: {
              nodeKey: input.nodeKey,
              dueAt: input.dueAt,
              grantedBy: input.ownerId,
              commandId: input.commandId,
              updatedAt: input.updatedAt,
            },
          },
        },
        revision: record.revision + 1,
        updatedAt: input.updatedAt,
        saga: { ...record.saga, lastCommandId: input.commandId },
      };
      const operationResult = result('updated', next);
      return { record: withOperation(next, input.idempotencyKey, operationFingerprint, operationResult, input.updatedAt), operationResult };
    });
  }

  async setVisibility(input: BookHomeworkVisibilityCommand): Promise<BookHomeworkAuthorityMutationResult> {
    return this.mutateVisibility(input, 'set');
  }

  async recover(input: BookHomeworkRecoveryCommand): Promise<BookHomeworkAuthorityMutationResult> {
    return this.mutateVisibility(input, 'recover');
  }

  private async mutateVisibility(
    input: BookHomeworkVisibilityCommand | BookHomeworkRecoveryCommand,
    kind: 'set' | 'recover',
  ): Promise<BookHomeworkAuthorityMutationResult> {
    validateCommandCommon(input);
    const operationFingerprint = fingerprint({ kind, ...input });
    return this.mutate(input.assignmentId, input.expectedRevision, input.idempotencyKey, operationFingerprint, input.updatedAt, (current) => {
      const record = this.requireOwner(current, input.ownerId);
      if (kind === 'set' && record.visibility.status !== 'prepared') {
        throw new BookHomeworkAuthorityError('visibility-conflict', 'Only prepared Book Homework can change visibility.');
      }
      if (kind === 'recover' && record.visibility.status === 'committed' && input.state !== 'committed') {
        throw new BookHomeworkAuthorityError('visibility-conflict', 'Committed Book Homework cannot be compensated by recovery.');
      }
      const next: BookHomeworkAuthorityRecord = {
        ...record,
        revision: record.revision + 1,
        updatedAt: input.updatedAt,
        saga: { ...record.saga, state: input.state, lastCommandId: input.commandId },
        visibility: { ...record.visibility, status: input.state, revision: record.revision + 1 },
      };
      const status: BookHomeworkAuthorityMutationResult['status'] = kind === 'recover'
        ? 'recovered'
        : input.state === 'committed' ? 'committed' : 'compensating';
      const operationResult = result(status, next);
      return { record: withOperation(next, input.idempotencyKey, operationFingerprint, operationResult, input.updatedAt), operationResult };
    });
  }

  private requireOwner(
    record: BookHomeworkAuthorityRecord | null,
    ownerId: string,
  ): BookHomeworkAuthorityRecord {
    if (!record) throw new BookHomeworkAuthorityError('not-found', 'Book Homework assignment was not found.');
    assertOwner(record, ownerId);
    return record;
  }

  private async mutate(
    assignmentId: string,
    expectedRevision: number,
    operationId: string,
    operationFingerprint: string,
    createdAt: string,
    operation: (current: BookHomeworkAuthorityRecord | null) => {
      readonly record: BookHomeworkAuthorityRecord;
      readonly operationResult: BookHomeworkAuthorityMutationResult;
    } | Promise<{
      readonly record: BookHomeworkAuthorityRecord;
      readonly operationResult: BookHomeworkAuthorityMutationResult;
    }>,
  ): Promise<BookHomeworkAuthorityMutationResult> {
    const retries = this.options.maxRetries ?? MAX_RETRIES;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const stored = await this.store.read(assignmentId);
      let current: BookHomeworkAuthorityRecord | null = null;
      if (stored) {
        assertValidBookHomeworkAuthorityRecord(stored.value);
        current = stored.value;
        const previous = current.operations?.[operationId];
        if (previous) {
          if (previous.fingerprint !== operationFingerprint) {
            throw new BookHomeworkAuthorityError('idempotency-conflict', 'Idempotency key was reused for a different command.');
          }
          return { ...previous.result, status: 'replayed' };
        }
        if (current.revision !== expectedRevision) {
          throw new BookHomeworkAuthorityError('revision-conflict', 'Book Homework revision is stale.');
        }
      } else if (expectedRevision !== 0) {
        throw new BookHomeworkAuthorityError('revision-conflict', 'Book Homework assignment is missing for the expected revision.');
      }

      const mutation = await operation(current);
      assertValidBookHomeworkAuthorityRecord(mutation.record);
      if (await this.store.write(assignmentId, mutation.record, stored?.updateTime)) return mutation.operationResult;
    }
    throw new BookHomeworkAuthorityError('revision-conflict', 'Book Homework CAS retries exhausted.');
  }
}

/** Small local store for unit tests and emulator-free command proof. */
export class InMemoryBookHomeworkDocumentStore implements BookHomeworkDocumentStore {
  private readonly documents = new Map<string, BookHomeworkStoredDocument>();
  private clock = 0;

  async read(assignmentId: string): Promise<BookHomeworkStoredDocument | null> {
    const value = this.documents.get(assignmentId);
    return value ? { value: clone(value.value), updateTime: value.updateTime } : null;
  }

  async write(assignmentId: string, value: BookHomeworkAuthorityRecord, updateTime?: string): Promise<boolean> {
    const current = this.documents.get(assignmentId);
    if (updateTime === undefined ? current !== undefined : current?.updateTime !== updateTime) return false;
    const next = { value: clone(value), updateTime: `memory-${++this.clock}` };
    this.documents.set(assignmentId, next);
    return true;
  }
}

interface ServiceAccountKey { readonly client_email: string; readonly private_key: string }
interface TokenResponse { readonly access_token?: string; readonly expires_in?: number }

export interface BookHomeworkRepositoryEnv {
  readonly FIREBASE_PROJECT_ID?: string;
  readonly BOOK_HOMEWORK_SERVICE_IDENTITY?: string;
  readonly BOOK_HOMEWORK_GOOGLE_SA_KEY?: string;
}

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

type FirestoreValue = {
  readonly nullValue?: 'NULL_VALUE';
  readonly booleanValue?: boolean;
  readonly integerValue?: string;
  readonly doubleValue?: number;
  readonly stringValue?: string;
  readonly mapValue?: { readonly fields: Record<string, FirestoreValue> };
  readonly arrayValue?: { readonly values: FirestoreValue[] };
};

const encodeValue = (value: unknown): FirestoreValue => {
  if (value === null) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object' && value !== null) {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeValue(entry)])) } };
  }
  throw new Error('book_homework_firestore_value_unsupported');
};

const decodeValue = (value: FirestoreValue): unknown => {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue?.values ?? []).map(decodeValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key, entry]) => [key, decodeValue(entry)]));
  throw new Error('book_homework_firestore_value_invalid');
};

const encodeMap = (value: Record<string, unknown>): Record<string, FirestoreValue> =>
  Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeValue(entry)]));

const decodeMap = (value: Record<string, FirestoreValue> | undefined): unknown =>
  Object.fromEntries(Object.entries(value ?? {}).map(([key, entry]) => [key, decodeValue(entry)]));

const tokenProvider = (keyJson: string, identity: string, fetchImpl: typeof fetch): (() => Promise<string>) => {
  let key: ServiceAccountKey;
  try { key = JSON.parse(keyJson) as ServiceAccountKey; } catch { throw new Error('invalid_book_homework_google_sa_key'); }
  if (!key.client_email || !key.private_key || key.client_email !== identity) throw new Error('book_homework_service_identity_mismatch');
  let cached = ''; let expiresAt = 0;
  return async () => {
    if (cached && Date.now() < expiresAt - 300_000) return cached;
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ iss: key.client_email, sub: key.client_email, aud: OAUTH2_TOKEN_URL, iat: now, exp: now + 3600, scope: FIREBASE_SCOPES })
      .setProtectedHeader({ alg: 'RS256' })
      .sign(await importPKCS8(key.private_key, 'RS256'));
    const response = await fetchImpl.call(globalThis, OAUTH2_TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
    });
    const body = JSON.parse(await response.text()) as TokenResponse;
    if (!response.ok || !body.access_token) throw new Error(`book_homework_google_oauth_failed:${response.status}`);
    cached = body.access_token; expiresAt = Date.now() + Math.max(0, (body.expires_in ?? 3600) * 1000);
    return cached;
  };
};

export class FirebaseRestBookHomeworkDocumentStore implements BookHomeworkDocumentStore {
  private readonly projectId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessToken: () => Promise<string>;

  constructor(options: {
    readonly env: BookHomeworkRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
  }) {
    this.projectId = options.env.FIREBASE_PROJECT_ID?.trim() ?? '';
    const identity = options.env.BOOK_HOMEWORK_SERVICE_IDENTITY?.trim() ?? '';
    const key = options.env.BOOK_HOMEWORK_GOOGLE_SA_KEY?.trim();
    if (!this.projectId || !identity) throw new Error('missing_book_homework_firestore_identity');
    if (!key && !options.getAccessToken) throw new Error('missing_book_homework_google_sa_key');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.getAccessToken = options.getAccessToken ?? tokenProvider(key!, identity, this.fetchImpl);
  }

  async read(assignmentId: string): Promise<BookHomeworkStoredDocument | null> {
    assertCommandId(assignmentId, 'assignmentId');
    const response = await this.fetchImpl.call(globalThis, this.url(assignmentId), {
      headers: { Authorization: `Bearer ${await this.getAccessToken()}` },
    });
    if (response.status === 404) return null;
    const body = await response.text();
    if (!response.ok) throw new Error(`book_homework_firestore_read_failed:${response.status}`);
    const document = JSON.parse(body) as { readonly fields?: Record<string, FirestoreValue>; readonly updateTime?: string };
    if (!document.updateTime) throw new Error('book_homework_firestore_missing_update_time');
    return { value: decodeMap(document.fields), updateTime: document.updateTime };
  }

  async write(assignmentId: string, value: BookHomeworkAuthorityRecord, updateTime?: string): Promise<boolean> {
    assertValidBookHomeworkAuthorityRecord(value);
    const query = updateTime === undefined
      ? '?currentDocument.exists=false'
      : `?currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
    const response = await this.fetchImpl.call(globalThis, `${this.url(assignmentId)}${query}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${await this.getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: encodeMap(value as unknown as Record<string, unknown>) }),
    });
    const body = await response.text();
    if (response.status === 409 || response.status === 412) return false;
    if (response.status === 400) {
      try {
        const parsed = JSON.parse(body) as { readonly error?: { readonly status?: string } };
        if (parsed.error?.status === 'FAILED_PRECONDITION') return false;
      } catch {
        // Fall through to the bounded error below.
      }
    }
    if (!response.ok) throw new Error(`book_homework_firestore_write_failed:${response.status}`);
    return true;
  }

  private url(assignmentId: string): string {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/(default)/documents/${encodePath(`homework_assignments/${assignmentId}`)}`;
  }
}

export const createFirebaseRestBookHomeworkRepository = (options: {
  readonly env: BookHomeworkRepositoryEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
  readonly resolveAffectedStudentStates: (
    record: BookHomeworkAuthorityRecord,
    nodeKey: string,
  ) => Promise<readonly BookHomeworkStudentState[]>;
  readonly resolveCommittedRoot: (record: BookHomeworkAuthorityRecord) => Promise<boolean>;
}): BookHomeworkAuthorityRepository => new BookHomeworkAuthorityRepository(
  new FirebaseRestBookHomeworkDocumentStore(options),
  {
    resolveAffectedStudentStates: options.resolveAffectedStudentStates,
    resolveCommittedRoot: options.resolveCommittedRoot,
  },
);
