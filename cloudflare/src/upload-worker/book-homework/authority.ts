import {
  assertValidBookHomeworkManifest,
} from '../../../../src/services/book-homework/bookHomeworkManifest.service.ts';
import {
  validateBookHomeworkSchedule,
  type BookHomeworkSchedule,
} from '../../../../src/services/book-homework/bookHomeworkSchedule.service.ts';
import type {
  BookHomeworkAuthorityRecord,
  BookHomeworkAuthoritySchedule,
  BookHomeworkActivityPolicySnapshot,
  BookHomeworkOperationRecord,
  BookHomeworkSagaState,
  BookHomeworkStudentExtension,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import {
  BOOK_HOMEWORK_AUTHORITY_SCHEMA_VERSION,
  BOOK_HOMEWORK_SCHEDULE_RESOLVER_VERSION,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const OPERATION = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const STATES: readonly BookHomeworkSagaState[] = ['prepared', 'committed', 'compensating'];
const MAX_OPERATIONS = 64;
const MAX_EXTENSIONS = 512;
const MAX_ACTIVITY_POLICIES = 128;

export class BookHomeworkAuthorityError extends Error {
  constructor(
    readonly code:
      | 'invalid-record'
      | 'invalid-command'
      | 'not-found'
      | 'owner-mismatch'
      | 'revision-conflict'
      | 'idempotency-conflict'
      | 'immutable-manifest'
      | 'unsafe-deadline'
      | 'visibility-conflict',
    message: string,
  ) {
    super(message);
    this.name = 'BookHomeworkAuthorityError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const fail = (message: string): never => {
  throw new BookHomeworkAuthorityError('invalid-record', message);
};

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void => {
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key))) fail('Book Homework authority has an unknown field.');
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    fail('Book Homework authority is missing a required field.');
  }
};

const assertId = (value: unknown, label: string): asserts value is string => {
  if (typeof value !== 'string' || !ID.test(value)) fail(`${label} is not a bounded identifier.`);
};

export const assertIso = (value: unknown, label: string): asserts value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || new Date(value).toISOString() !== value) {
    fail(`${label} is not a canonical UTC timestamp.`);
  }
};

const assertScheduleRuleShape = (value: unknown): void => {
  if (!isRecord(value)) fail('Book Homework schedule rule is not an object.');
  exactKeys(value, ['nodeKey'], ['availableFrom', 'dueAt']);
  assertId(value.nodeKey, 'schedule rule nodeKey');
  if (value.availableFrom !== undefined) assertIso(value.availableFrom, 'schedule rule availableFrom');
  if (value.dueAt !== undefined) assertIso(value.dueAt, 'schedule rule dueAt');
  if (value.availableFrom === undefined && value.dueAt === undefined) fail('Schedule rule is empty.');
};

export const assertValidBookHomeworkSchedule = (
  value: unknown,
  outline: BookHomeworkAuthorityRecord['bookManifest']['outline'],
): asserts value is BookHomeworkAuthoritySchedule => {
  if (!isRecord(value)) fail('Book Homework schedule is not an object.');
  exactKeys(value, ['schemaVersion', 'resolverVersion', 'finalDueAt', 'scheduleRules'], ['availableFrom']);
  if (value.schemaVersion !== BOOK_HOMEWORK_AUTHORITY_SCHEMA_VERSION
    || value.resolverVersion !== BOOK_HOMEWORK_SCHEDULE_RESOLVER_VERSION) {
    fail('Unsupported Book Homework schedule schema or resolver version.');
  }
  assertIso(value.finalDueAt, 'schedule finalDueAt');
  if (value.availableFrom !== undefined) assertIso(value.availableFrom, 'schedule availableFrom');
  if (!Array.isArray(value.scheduleRules)) fail('Book Homework schedule rules are not an array.');
  value.scheduleRules.forEach(assertScheduleRuleShape);
  try {
    validateBookHomeworkSchedule(value as unknown as BookHomeworkSchedule, outline);
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Book Homework schedule is invalid.');
  }
};

export const inheritedBookHomeworkDueAt = (
  schedule: BookHomeworkAuthoritySchedule,
  outline: BookHomeworkAuthorityRecord['bookManifest']['outline'],
  nodeKey: string,
): string => {
  const rules = new Map(schedule.scheduleRules.map((rule) => [rule.nodeKey, rule]));
  const nodes = new Map(outline.map((node) => [node.nodeKey, node]));
  let current = nodes.get(nodeKey);
  while (current) {
    const dueAt = rules.get(current.nodeKey)?.dueAt;
    if (dueAt) return dueAt;
    current = current.parentNodeKey === null ? undefined : nodes.get(current.parentNodeKey);
  }
  return schedule.finalDueAt;
};

const assertExtension = (value: unknown): asserts value is BookHomeworkStudentExtension => {
  if (!isRecord(value)) fail('Student extension is not an object.');
  exactKeys(value, ['nodeKey', 'dueAt', 'grantedBy', 'commandId', 'updatedAt']);
  assertId(value.nodeKey, 'student extension nodeKey');
  assertId(value.grantedBy, 'student extension grantedBy');
  assertId(value.commandId, 'student extension commandId');
  assertIso(value.dueAt, 'student extension dueAt');
  assertIso(value.updatedAt, 'student extension updatedAt');
};

const assertActivityPolicy = (
  value: unknown,
  placementId: string,
): asserts value is BookHomeworkActivityPolicySnapshot => {
  if (!isRecord(value)) fail('Book Homework Activity policy is not an object.');
  exactKeys(value, [
    'schemaVersion', 'policyId', 'policyRevision', 'placementId', 'activityId',
    'activityVersionId', 'activityVersion', 'lateSubmissionAllowed', 'maxAttempts',
  ]);
  if (value.schemaVersion !== 1) fail('Book Homework Activity policy schema is unsupported.');
  assertId(value.policyId, 'Activity policy policyId');
  assertId(value.placementId, 'Activity policy placementId');
  assertId(value.activityId, 'Activity policy activityId');
  assertId(value.activityVersionId, 'Activity policy activityVersionId');
  if (value.placementId !== placementId
    || !Number.isSafeInteger(value.policyRevision) || value.policyRevision <= 0
    || !Number.isSafeInteger(value.activityVersion) || value.activityVersion <= 0
    || typeof value.lateSubmissionAllowed !== 'boolean'
    || (value.maxAttempts !== null
      && (!Number.isSafeInteger(value.maxAttempts)
        || value.maxAttempts <= 0
        || value.maxAttempts > 50))) {
    fail('Book Homework Activity policy is invalid.');
  }
};

const assertOperation = (value: unknown): asserts value is BookHomeworkOperationRecord => {
  if (!isRecord(value)) fail('Book Homework operation is not an object.');
  exactKeys(value, ['fingerprint', 'result', 'createdAt']);
  if (typeof value.fingerprint !== 'string' || value.fingerprint.length === 0 || value.fingerprint.length > 4096) {
    fail('Book Homework operation fingerprint is invalid.');
  }
  assertIso(value.createdAt, 'Book Homework operation createdAt');
  if (!isRecord(value.result)) fail('Book Homework operation result is invalid.');
  exactKeys(value.result, ['status', 'assignmentId', 'revision', 'visibility']);
  if (!['created', 'updated', 'replayed', 'committed', 'compensating', 'recovered'].includes(String(value.result.status))
    || typeof value.result.assignmentId !== 'string'
    || !Number.isSafeInteger(value.result.revision)
    || !STATES.includes(value.result.visibility as BookHomeworkSagaState)) {
    fail('Book Homework operation result is invalid.');
  }
};

const assertRecordMaps = (record: Record<string, unknown>): void => {
  if (record.activityPolicies !== undefined) {
    if (!isRecord(record.activityPolicies)
      || Object.keys(record.activityPolicies).length === 0
      || Object.keys(record.activityPolicies).length > MAX_ACTIVITY_POLICIES) {
      fail('Book Homework Activity policies are invalid.');
    }
    Object.entries(record.activityPolicies).forEach(([placementId, policy]) => {
      assertId(placementId, 'Activity policy placementId');
      assertActivityPolicy(policy, placementId);
    });
  }
  const extensions = record.studentExtensions;
  if (!isRecord(extensions) || Object.keys(extensions).length > MAX_EXTENSIONS) fail('Student extensions are invalid.');
  Object.entries(extensions).forEach(([studentId, studentExtensions]) => {
    assertId(studentId, 'student extension studentId');
    if (!isRecord(studentExtensions) || Object.keys(studentExtensions).length > MAX_EXTENSIONS) {
      fail('Student extensions for a student are invalid.');
    }
    Object.entries(studentExtensions).forEach(([nodeKey, extension]) => {
      assertId(nodeKey, 'student extension nodeKey');
      assertExtension(extension);
      if (extension.nodeKey !== nodeKey) fail('Student extension node key does not match its map key.');
    });
  });

  if (record.operations !== undefined) {
    if (!isRecord(record.operations) || Object.keys(record.operations).length > MAX_OPERATIONS) fail('Book Homework operations are invalid.');
    Object.entries(record.operations).forEach(([operationId, operation]) => {
      if (!OPERATION.test(operationId)) fail('Book Homework operation ID is invalid.');
      assertOperation(operation);
    });
  }
};

export const assertValidBookHomeworkAuthorityRecord = (
  value: unknown,
): asserts value is BookHomeworkAuthorityRecord => {
  if (!isRecord(value)) fail('Book Homework authority record is not an object.');
  exactKeys(value, [
    'assignmentId', 'assignmentKind', 'schemaVersion', 'ownerId', 'bookManifest', 'schedule',
    'studentExtensions', 'saga', 'visibility', 'revision', 'createdAt', 'updatedAt',
  ], ['activityPolicies', 'operations']);
  assertId(value.assignmentId, 'assignmentId');
  assertId(value.ownerId, 'ownerId');
  if (value.assignmentKind !== 'book_activity_bundle' || value.schemaVersion !== BOOK_HOMEWORK_AUTHORITY_SCHEMA_VERSION) {
    fail('Unsupported Book Homework authority discriminator or schema version.');
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) fail('Book Homework revision is invalid.');
  assertIso(value.createdAt, 'createdAt');
  assertIso(value.updatedAt, 'updatedAt');

  try {
    assertValidBookHomeworkManifest(value.bookManifest);
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Book Homework manifest is invalid.');
  }
  if (value.bookManifest.ownerId !== value.ownerId) fail('Manifest owner does not match authority owner.');
  assertValidBookHomeworkSchedule(value.schedule, value.bookManifest.outline);
  assertRecordMaps(value);
  if (value.activityPolicies) {
    const required = value.bookManifest.bindings.filter((binding) => binding.state === 'required');
    const policies = Object.values(value.activityPolicies);
    const policyIdentity = policies[0];
    if (Object.keys(value.activityPolicies).length !== required.length
      || !policyIdentity
      || policies.some((policy) => policy.policyId !== policyIdentity.policyId
        || policy.policyRevision !== policyIdentity.policyRevision)
      || required.some((binding) => {
        const policy = value.activityPolicies?.[binding.placementId];
        return !policy
          || policy.activityId !== binding.activityId
          || policy.activityVersionId !== binding.activityVersionId
          || policy.activityVersion !== binding.activityVersion;
      })) {
      fail('Book Homework Activity policies do not match the frozen manifest.');
    }
  }
  Object.keys(value.studentExtensions).forEach((studentId) => {
    if (studentId !== value.bookManifest.context.recipientId) {
      fail('Student extensions exceed the frozen recipient boundary.');
    }
  });
  Object.values(value.studentExtensions).forEach((extensions) => Object.values(extensions).forEach((extension) => {
    const baseDueAt = inheritedBookHomeworkDueAt(value.schedule, value.bookManifest.outline, extension.nodeKey);
    if (!value.bookManifest.outline.some((node) => node.nodeKey === extension.nodeKey)
      || Date.parse(extension.dueAt) <= Date.parse(baseDueAt)) {
      fail('Student extension is not a valid later deadline for the frozen outline.');
    }
  }));

  if (!isRecord(value.saga)) fail('Book Homework saga is invalid.');
  exactKeys(value.saga, ['sagaId', 'state', 'lastCommandId']);
  assertId(value.saga.sagaId, 'sagaId');
  assertId(value.saga.lastCommandId, 'lastCommandId');
  if (!STATES.includes(value.saga.state as BookHomeworkSagaState)) fail('Book Homework saga state is invalid.');

  if (!isRecord(value.visibility)) fail('Book Homework visibility is invalid.');
  exactKeys(value.visibility, ['status', 'pointerId', 'manifestVersionId', 'revision']);
  if (!STATES.includes(value.visibility.status as BookHomeworkSagaState)) fail('Book Homework visibility status is invalid.');
  assertId(value.visibility.pointerId, 'visibility pointerId');
  assertId(value.visibility.manifestVersionId, 'visibility manifestVersionId');
  if (value.visibility.manifestVersionId !== value.bookManifest.manifestVersionId
    || value.visibility.pointerId !== value.bookManifest.manifestVersionId
    || value.visibility.status !== value.saga.state
    || !Number.isSafeInteger(value.visibility.revision)
    || value.visibility.revision < 1
    || value.visibility.revision > value.revision) {
    fail('Book Homework visibility pointer is inconsistent.');
  }
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

export const fingerprint = (value: unknown): string => JSON.stringify(canonicalize(value)) ?? 'undefined';

export const cloneAuthorityRecord = (record: BookHomeworkAuthorityRecord): BookHomeworkAuthorityRecord => clone(record);
