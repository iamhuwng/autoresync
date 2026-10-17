export const NOTIFICATION_MIGRATION_ID = 'prd0062-38b4-legacy-notifications-v1';
export const CHECKPOINT_SCHEMA_VERSION = 1;
export const NOTIFICATION_ROOT_PATH = 'notifications';
export const CHECKPOINT_PATH = `notification_migrations/${NOTIFICATION_MIGRATION_ID}/checkpoint`;
export const MAX_BATCH_SIZE = 500;
// RTDB removes object children whose value is null. Persist the initial cursor
// as an empty string so a signed checkpoint round-trips without losing a field.
// Firebase keys are never empty, so this cannot collide with a real cursor.
export const CHECKPOINT_START_CURSOR = '';

// RTDB keys may contain spaces and punctuation beyond the restricted IDs used
// by supported notification rows. Keep the cursor broad enough to checkpoint
// malformed-but-readable source keys while still rejecting path separators and
// Firebase-reserved characters.
export const RTDB_KEY = /^(?!\.{1,2}$)[^.#$[\]/\u0000-\u001f\u007f]{1,768}$/u;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,29}$/u;
const STATUSES = new Set(['active', 'complete', 'paused']);
const COUNT_KEYS = [
  'scanned',
  'migrated',
  'replayed',
  'untouched',
  'malformed',
  'conflicts',
  'sourceRetained',
  'errors',
];

export class NotificationMigrationCheckpointError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NotificationMigrationCheckpointError';
    this.code = code;
  }
}

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const assert = (condition, code) => {
  if (!condition) throw new NotificationMigrationCheckpointError(code);
};

const assertExactKeys = (value, keys, code) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), code);
};

const assertCount = (value, code) => {
  assert(Number.isSafeInteger(value) && value >= 0, code);
};

export const canonicalCheckpointPayload = (checkpoint) => {
  const counts = checkpoint.counts;
  return JSON.stringify({
    schemaVersion: checkpoint.schemaVersion,
    migrationId: checkpoint.migrationId,
    projectId: checkpoint.projectId,
    notificationRootPath: checkpoint.notificationRootPath,
    checkpointPath: checkpoint.checkpointPath,
    operatorFingerprint: checkpoint.operatorFingerprint,
    status: checkpoint.status,
    batchSize: checkpoint.batchSize,
    lastKey: checkpoint.lastKey,
    batchNumber: checkpoint.batchNumber,
    counts: {
      scanned: counts.scanned,
      migrated: counts.migrated,
      replayed: counts.replayed,
      untouched: counts.untouched,
      malformed: counts.malformed,
      conflicts: counts.conflicts,
      sourceRetained: counts.sourceRetained,
      errors: counts.errors,
    },
    updatedAt: checkpoint.updatedAt,
  });
};

export const zeroCounts = () => Object.fromEntries(COUNT_KEYS.map((key) => [key, 0]));

export const createCheckpoint = ({
  projectId,
  operatorFingerprint,
  batchSize,
  status = 'active',
  lastKey = CHECKPOINT_START_CURSOR,
  batchNumber = 0,
  counts = zeroCounts(),
  updatedAt,
}) => {
  const checkpoint = {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    migrationId: NOTIFICATION_MIGRATION_ID,
    projectId,
    notificationRootPath: NOTIFICATION_ROOT_PATH,
    checkpointPath: CHECKPOINT_PATH,
    operatorFingerprint,
    status,
    batchSize,
    lastKey,
    batchNumber,
    counts: { ...counts },
    updatedAt,
  };
  validateCheckpoint(checkpoint, { allowUnsigned: true });
  return checkpoint;
};

export const validateCheckpoint = (value, { allowUnsigned = false } = {}) => {
  assert(isRecord(value), 'checkpoint_not_object');
  const keys = [
    'schemaVersion',
    'migrationId',
    'projectId',
    'notificationRootPath',
    'checkpointPath',
    'operatorFingerprint',
    'status',
    'batchSize',
    'lastKey',
    'batchNumber',
    'counts',
    'updatedAt',
    ...(allowUnsigned ? [] : ['signature']),
  ];
  assertExactKeys(value, keys, 'checkpoint_unknown_field');
  assert(value.schemaVersion === CHECKPOINT_SCHEMA_VERSION, 'checkpoint_schema_unsupported');
  assert(value.migrationId === NOTIFICATION_MIGRATION_ID, 'checkpoint_migration_mismatch');
  assert(typeof value.projectId === 'string' && PROJECT_ID.test(value.projectId), 'checkpoint_project_invalid');
  assert(value.notificationRootPath === NOTIFICATION_ROOT_PATH, 'checkpoint_notification_path_invalid');
  assert(value.checkpointPath === CHECKPOINT_PATH, 'checkpoint_path_invalid');
  assert(typeof value.operatorFingerprint === 'string' && /^[0-9a-f]{64}$/u.test(value.operatorFingerprint), 'checkpoint_operator_invalid');
  assert(typeof value.status === 'string' && STATUSES.has(value.status), 'checkpoint_status_invalid');
  assert(Number.isSafeInteger(value.batchSize) && value.batchSize > 0 && value.batchSize <= MAX_BATCH_SIZE, 'checkpoint_batch_size_invalid');
  assert(
    typeof value.lastKey === 'string'
      && (value.lastKey === CHECKPOINT_START_CURSOR || RTDB_KEY.test(value.lastKey)),
    'checkpoint_cursor_invalid',
  );
  assertCount(value.batchNumber, 'checkpoint_batch_number_invalid');
  assert(isRecord(value.counts), 'checkpoint_counts_invalid');
  assertExactKeys(value.counts, COUNT_KEYS, 'checkpoint_counts_unknown_field');
  for (const key of COUNT_KEYS) assertCount(value.counts[key], 'checkpoint_count_invalid');
  assert(typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt)), 'checkpoint_time_invalid');
  if (!allowUnsigned) {
    assert(typeof value.signature === 'string' && /^[0-9a-f]{64}$/u.test(value.signature), 'checkpoint_signature_invalid');
  }
  return structuredClone(value);
};

export const addCounts = (base, delta) => {
  const next = { ...base };
  for (const key of COUNT_KEYS) next[key] = (base[key] ?? 0) + (delta[key] ?? 0);
  return next;
};

export const countKeys = Object.freeze([...COUNT_KEYS]);
