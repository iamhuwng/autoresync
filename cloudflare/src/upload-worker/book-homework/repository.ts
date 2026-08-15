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
  BookHomeworkAuthorityScope,
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
  assertIso as assertAuthorityIso,
  assertValidBookHomeworkAuthorityRecord as assertValidAuthorityRecord,
  assertValidBookHomeworkSchedule as assertValidAuthoritySchedule,
  BookHomeworkAuthorityError,
  cloneAuthorityRecord,
  fingerprint,
  inheritedBookHomeworkDueAt,
} from './authority.ts';
import {
  createFirebaseClaimTokenProvider,
  type BookFirebaseClaimTuple,
} from '../book-activity-authoring/firebase-token.ts';
import { BookHomeworkProjectionDiagnosticError } from './projection-diagnostics.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const ASSIGNMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_:@-]{0,127}$/u;
const MAX_RETRIES = 5;

const assertIso: (value: unknown, label: string) => asserts value is string = assertAuthorityIso;
const assertValidBookHomeworkAuthorityRecord: (
  value: unknown,
) => asserts value is BookHomeworkAuthorityRecord = assertValidAuthorityRecord;
const assertValidBookHomeworkSchedule: (
  value: unknown,
  outline: BookHomeworkAuthorityRecord['bookManifest']['outline'],
) => asserts value is BookHomeworkAuthorityRecord['schedule'] = assertValidAuthoritySchedule;

export interface BookHomeworkStoredDocument {
  readonly value: unknown;
  readonly updateTime: string;
}

export interface BookHomeworkDocumentStore {
  read(scope: BookHomeworkAuthorityScope): Promise<BookHomeworkStoredDocument | null>;
  write(scope: BookHomeworkAuthorityScope, value: BookHomeworkAuthorityRecord, updateTime?: string): Promise<boolean>;
}

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const assertCommandId: (value: unknown, label: string) => asserts value is string = (value, label) => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new BookHomeworkAuthorityError('invalid-command', `${label} is invalid.`);
  }
};

const assertScope: (scope: BookHomeworkAuthorityScope) => void = (scope) => {
  if (!scope || typeof scope !== 'object') {
    throw new BookHomeworkAuthorityError('invalid-command', 'Book Homework authority scope is required.');
  }
  assertCommandId(scope.authorityId, 'authorityId');
  if (!ASSIGNMENT_ID.test(scope.assignmentId)) {
    throw new BookHomeworkAuthorityError('invalid-command', 'assignmentId is invalid.');
  }
  assertCommandId(scope.ownerId, 'ownerId');
};

const assertScopedRecord = (
  scope: BookHomeworkAuthorityScope,
  value: BookHomeworkAuthorityRecord,
): void => {
  if (value.ownerId !== scope.ownerId || value.bookManifest.ownerId !== scope.ownerId) {
    throw new BookHomeworkAuthorityError('owner-mismatch', 'Book Homework authority owner does not match its scope.');
  }
  if (value.assignmentId !== scope.authorityId
    || value.bookManifest.context.contextId !== scope.assignmentId
    || value.saga.sagaId !== scope.assignmentId) {
    throw new BookHomeworkAuthorityError('invalid-record', 'Book Homework authority does not match its scope.');
  }
};

const assertRevision: (value: unknown) => asserts value is number = (value) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
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
  readonly scope: BookHomeworkAuthorityScope;
  readonly assignmentId: string;
  readonly ownerId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
  readonly updatedAt?: string;
  readonly createdAt?: string;
}): void => {
  assertScope(input.scope);
  assertCommandId(input.assignmentId, 'assignmentId');
  assertCommandId(input.ownerId, 'ownerId');
  if (input.ownerId !== input.scope.ownerId
    || (input.assignmentId !== input.scope.authorityId && input.assignmentId !== input.scope.assignmentId)) {
    throw new BookHomeworkAuthorityError('invalid-command', 'Book Homework command scope does not match its command identity.');
  }
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

  async read(scope: BookHomeworkAuthorityScope): Promise<BookHomeworkAuthorityRecord | null> {
    assertScope(scope);
    const stored = await this.store.read(scope);
    if (!stored) return null;
    assertValidBookHomeworkAuthorityRecord(stored.value);
    if (stored.value.assignmentId !== scope.authorityId) {
      throw new BookHomeworkAuthorityError(
        'invalid-record',
        'Book Homework authority identity does not match its document path.',
      );
    }
    assertScopedRecord(scope, stored.value);
    return cloneAuthorityRecord(stored.value);
  }

  async readStudentProjection(
    scope: BookHomeworkAuthorityScope,
    studentId: string,
  ): Promise<BookHomeworkStudentProjection | null> {
    assertCommandId(studentId, 'studentId');
    const record = await this.read(scope);
    if (!record || record.bookManifest.context.recipientId !== studentId
      || record.visibility.status !== 'committed'
      || !await this.options.resolveCommittedRoot(record)) return null;
    return clone({
      assignmentId: record.bookManifest.context.contextId,
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
    const scope = input.scope;
    assertScope(scope);
    if ((input.ownerId !== undefined && input.ownerId !== scope.ownerId)
      || (input.assignmentId !== undefined
        && input.assignmentId !== scope.authorityId
        && input.assignmentId !== scope.assignmentId)) {
      throw new BookHomeworkAuthorityError('invalid-command', 'Book Homework command scope does not match its command identity.');
    }
    if (!input.activityPolicies || Object.keys(input.activityPolicies).length === 0) {
      throw new BookHomeworkAuthorityError('invalid-command', 'Create requires frozen Activity policies.');
    }
    if (input.expectedRevision !== 0) throw new BookHomeworkAuthorityError('invalid-command', 'Create expected revision must be zero.');
    if (input.manifest.ownerId !== scope.ownerId) throw new BookHomeworkAuthorityError('owner-mismatch', 'Manifest owner does not match create owner.');
    if (input.manifest.context.contextId !== scope.assignmentId
      || (input.sagaId !== undefined && input.sagaId !== scope.assignmentId)) {
      throw new BookHomeworkAuthorityError('invalid-command', 'Create root assignment identity does not match its scope.');
    }
    assertValidBookHomeworkSchedule(input.schedule, input.manifest.outline);
    if (fingerprint(input.schedule.scheduleRules) !== fingerprint(input.manifest.scheduleRules)) {
      throw new BookHomeworkAuthorityError('immutable-manifest', 'Initial authority schedule must match the frozen manifest schedule rules.');
    }
    assertValidBookHomeworkAuthorityRecord({
      assignmentId: scope.authorityId,
      assignmentKind: 'book_activity_bundle',
      schemaVersion: 1,
      ownerId: scope.ownerId,
      bookManifest: input.manifest,
      schedule: input.schedule,
      activityPolicies: input.activityPolicies,
      studentExtensions: {},
      saga: { sagaId: scope.assignmentId, state: 'prepared', lastCommandId: input.commandId },
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

    return this.mutate(scope, input.expectedRevision, input.idempotencyKey, fingerprint(input), input.createdAt, (current) => {
      if (current) throw new BookHomeworkAuthorityError('revision-conflict', 'Book Homework assignment already exists.');
      const record: BookHomeworkAuthorityRecord = {
        assignmentId: scope.authorityId,
        assignmentKind: 'book_activity_bundle',
        schemaVersion: 1,
        ownerId: scope.ownerId,
        bookManifest: clone(input.manifest),
        schedule: clone(input.schedule),
        activityPolicies: clone(input.activityPolicies),
        studentExtensions: {},
        saga: { sagaId: scope.assignmentId, state: 'prepared', lastCommandId: input.commandId },
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
    const scope = input.scope;
    assertScope(scope);
    if (input.changedNodeKey !== '$assignment' && input.changedNodeKey !== '$availability') {
      assertCommandId(input.changedNodeKey, 'changedNodeKey');
    }
    const operationFingerprint = fingerprint(input);
    return this.mutate(scope, input.expectedRevision, input.idempotencyKey, operationFingerprint, input.updatedAt, async (current) => {
      const record = this.requireOwner(current, scope.ownerId);
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
    const scope = input.scope;
    assertScope(scope);
    assertCommandId(input.studentId, 'studentId');
    assertCommandId(input.nodeKey, 'nodeKey');
    assertIso(input.dueAt, 'dueAt');
    const operationFingerprint = fingerprint(input);
    return this.mutate(scope, input.expectedRevision, input.idempotencyKey, operationFingerprint, input.updatedAt, async (current) => {
      const record = this.requireOwner(current, scope.ownerId);
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
              grantedBy: scope.ownerId,
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
    const scope = input.scope;
    assertScope(scope);
    const operationFingerprint = fingerprint({ kind, ...input });
    return this.mutate(scope, input.expectedRevision, input.idempotencyKey, operationFingerprint, input.updatedAt, async (current) => {
      const record = this.requireOwner(current, scope.ownerId);
      if (kind === 'set' && record.visibility.status !== 'prepared') {
        throw new BookHomeworkAuthorityError('visibility-conflict', 'Only prepared Book Homework can change visibility.');
      }
      if (kind === 'recover' && record.visibility.status === 'committed' && input.state !== 'committed'
        && await this.options.resolveCommittedRoot(record)) {
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
    scope: BookHomeworkAuthorityScope,
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
    assertScope(scope);
    const retries = this.options.maxRetries ?? MAX_RETRIES;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const stored = await this.store.read(scope);
      let current: BookHomeworkAuthorityRecord | null = null;
      if (stored) {
        assertValidBookHomeworkAuthorityRecord(stored.value);
        current = stored.value;
        assertScopedRecord(scope, current);
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
      assertScopedRecord(scope, mutation.record);
      if (await this.store.write(scope, mutation.record, stored?.updateTime)) return mutation.operationResult;
    }
    throw new BookHomeworkAuthorityError('revision-conflict', 'Book Homework CAS retries exhausted.');
  }
}

/** Small local store for unit tests and emulator-free command proof. */
export class InMemoryBookHomeworkDocumentStore implements BookHomeworkDocumentStore {
  private readonly documents = new Map<string, BookHomeworkStoredDocument>();
  private clock = 0;

  async read(scope: BookHomeworkAuthorityScope): Promise<BookHomeworkStoredDocument | null> {
    assertScope(scope);
    const value = this.documents.get(scope.authorityId);
    return value ? { value: clone(value.value), updateTime: value.updateTime } : null;
  }

  async write(
    scope: BookHomeworkAuthorityScope,
    value: BookHomeworkAuthorityRecord,
    updateTime?: string,
  ): Promise<boolean> {
    assertScope(scope);
    assertScopedRecord(scope, value);
    const current = this.documents.get(scope.authorityId);
    if (updateTime === undefined ? current !== undefined : current?.updateTime !== updateTime) return false;
    const next = { value: clone(value), updateTime: `memory-${++this.clock}` };
    this.documents.set(scope.authorityId, next);
    return true;
  }
}

export interface BookHomeworkRepositoryEnv {
  readonly FIREBASE_PROJECT_ID?: string;
  readonly FIREBASE_WEB_API_KEY?: string;
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

export class FirebaseRestBookHomeworkDocumentStore implements BookHomeworkDocumentStore {
  private readonly projectId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getFirebaseIdToken: (claims: Extract<BookFirebaseClaimTuple, { service: 'book_homework_authority' }>) => Promise<string>;

  constructor(options: {
    readonly env: BookHomeworkRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getFirebaseIdToken?: (claims: Extract<BookFirebaseClaimTuple, { service: 'book_homework_authority' }>) => Promise<string>;
  }) {
    this.projectId = options.env.FIREBASE_PROJECT_ID?.trim() ?? '';
    const identity = options.env.BOOK_HOMEWORK_SERVICE_IDENTITY?.trim() ?? '';
    const key = options.env.BOOK_HOMEWORK_GOOGLE_SA_KEY?.trim();
    if (!this.projectId || !identity) throw new Error('missing_book_homework_firestore_identity');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (options.getFirebaseIdToken) {
      this.getFirebaseIdToken = options.getFirebaseIdToken;
    } else {
      if (!key) throw new Error('missing_book_homework_google_sa_key');
      let serviceEmail: unknown;
      try {
        serviceEmail = (JSON.parse(key) as Record<string, unknown>).client_email;
      } catch {
        throw new Error('invalid_book_homework_google_sa_key');
      }
      if (serviceEmail !== identity) throw new Error('book_homework_service_identity_mismatch');
      const getFirebaseAuthToken = createFirebaseClaimTokenProvider({
        serviceAccountJson: key,
        serviceIdentity: identity,
        firebaseProjectId: this.projectId,
        firebaseWebApiKey: options.env.FIREBASE_WEB_API_KEY?.trim() ?? '',
        fetchImpl: this.fetchImpl,
      });
      this.getFirebaseIdToken = getFirebaseAuthToken;
    }
  }

  async read(scope: BookHomeworkAuthorityScope): Promise<BookHomeworkStoredDocument | null> {
    assertScope(scope);
    let token: string;
    try {
      token = await this.tokenFor(scope);
    } catch {
      throw new BookHomeworkProjectionDiagnosticError({
        stage: 'token_exchange',
        errorClass: 'token-authentication',
      });
    }
    let response: Response;
    try {
      response = await this.fetchImpl.call(globalThis, this.url(scope.authorityId), {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new BookHomeworkProjectionDiagnosticError({
        stage: 'firestore_get',
        errorClass: 'firestore-read',
      });
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new BookHomeworkProjectionDiagnosticError({
        stage: 'firestore_get',
        errorClass: response.status === 401 || response.status === 403
          ? 'token-authentication' : 'firestore-read',
      });
    }
    try {
      const body = await response.text();
      const document = JSON.parse(body) as { readonly fields?: Record<string, FirestoreValue>; readonly updateTime?: string };
      if (!document.updateTime) throw new Error('missing_update_time');
      return { value: decodeMap(document.fields), updateTime: document.updateTime };
    } catch {
      throw new BookHomeworkProjectionDiagnosticError({
        stage: 'firestore_get',
        errorClass: 'firestore-read',
      });
    }
  }

  async write(
    scope: BookHomeworkAuthorityScope,
    value: BookHomeworkAuthorityRecord,
    updateTime?: string,
  ): Promise<boolean> {
    assertValidBookHomeworkAuthorityRecord(value);
    assertScope(scope);
    assertScopedRecord(scope, value);
    if (value.assignmentId !== scope.authorityId) {
      throw new BookHomeworkAuthorityError(
        'invalid-record',
        'Book Homework authority identity does not match its document path.',
      );
    }
    const query = updateTime === undefined
      ? '?currentDocument.exists=false'
      : `?currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
    const firebaseIdToken = await this.tokenFor(scope);
    const response = await this.fetchImpl.call(globalThis, `${this.url(scope.authorityId)}${query}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${firebaseIdToken}`,
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
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/(default)/documents/${encodePath(`book_homework_authorities/${assignmentId}`)}`;
  }

  private async tokenFor(scope: BookHomeworkAuthorityScope): Promise<string> {
    assertScope(scope);
    return this.getFirebaseIdToken({
      service: 'book_homework_authority',
      authorityId: scope.authorityId,
      assignmentId: scope.assignmentId,
      ownerId: scope.ownerId,
    });
  }
}

export const createFirebaseRestBookHomeworkRepository = (options: {
  readonly env: BookHomeworkRepositoryEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getFirebaseIdToken?: (claims: Extract<BookFirebaseClaimTuple, { service: 'book_homework_authority' }>) => Promise<string>;
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
