import type {
  RecoveryEnvelope,
  RecoveryOperationAuditEvent,
  RecoveryOperationError,
  RecoveryOperationRecord,
  RecoveryOperationState,
  RecoverySnapshotIdentity,
  RecoverySuppressionFamily,
  RecoveryWorkPhase,
} from '../types';
import {
  assertRecoveryEnvelopeScope,
  RECOVERY_CANONICAL_ROOTS,
  type RecoveryEnvelopeIntegrityVerifier,
  type RecoveryRuntimeIdentity,
} from './recovery-envelope';
import { BOOK_METADATA_INVENTORY_VERSION } from './book-source-restore';

export type { RecoveryOperationRecord } from '../types';

export const RECOVERY_OPERATION_ROOT = 'book_recovery/operations' as const;
export const RECOVERY_IDEMPOTENCY_INDEX_ROOT = 'book_recovery/indexes/by_snapshot_idempotency' as const;
export const RECOVERY_OPERATION_SERVICE_IDENTITY = 'book_recovery_service' as const;

export const RECOVERY_SUPPRESSION_FAMILIES: readonly RecoverySuppressionFamily[] = Object.freeze([
  'source-cleanup-provider-delete',
  'submission-result-scoring',
  'completion',
  'checkpoint',
  'notification',
  'update-replacement-revocation',
  'audit-fan-out',
]);

export const RECOVERY_WORK_PHASES: readonly RecoveryWorkPhase[] = Object.freeze([
  'restoring_canonical_authority',
  'rebuilding',
  'reconciling',
]);

const TERMINAL_STATES = new Set<RecoveryOperationState>(['completed', 'failed_terminal']);
const OPERATION_STATES = new Set<RecoveryOperationState>([
  'previewed',
  'authorized',
  'restoring_canonical_authority',
  'rebuilding',
  'reconciling',
  'completed',
  'failed_retryable',
  'failed_terminal',
]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const MAX_ERRORS = 16;
const MAX_AUDIT_EVENTS = 32;
const MAX_ATTEMPTS = 1000;
const MAX_DIAGNOSTIC_CODE = 96;
const MAX_DIAGNOSTIC_MESSAGE = 500;

export interface RecoveryOperationStore {
  get(operationId: string): Promise<RecoveryOperationRecord | null>;
  putIfAbsent(record: RecoveryOperationRecord): Promise<{ readonly created: boolean; readonly record: RecoveryOperationRecord }>;
  compareAndSet(input: {
    readonly operationId: string;
    readonly expectedRevision: number;
    readonly next: RecoveryOperationRecord;
  }): Promise<RecoveryOperationRecord>;
}

export class RecoveryLedgerError extends Error {
  readonly name = 'RecoveryLedgerError';

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const clone = <T>(value: T): T => structuredClone(value);

const stableSerialize = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (!isPlainRecord(value)) throw new RecoveryLedgerError('invalid-operation-identity', 'Operation identity is not deterministic JSON.');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
};

const fnv1a64 = (value: string): string => {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
};

export const recoveryOperationFingerprint = (
  snapshot: RecoverySnapshotIdentity,
  idempotencyKey: string,
): string => `fnv1a64:${fnv1a64(stableSerialize({ snapshot, idempotencyKey }))}`;

/** The operation ID is stable before the first write and is never regenerated. */
export const buildRecoveryOperationId = (input: {
  readonly snapshot: RecoverySnapshotIdentity;
  readonly idempotencyKey: string;
}): string => `rec-${fnv1a64(stableSerialize({
  backupId: input.snapshot.backupId,
  snapshotId: input.snapshot.snapshotId,
  firebaseProject: input.snapshot.firebaseProject,
  idempotencyKey: input.idempotencyKey,
}))}`;

export const deriveRecoveryOperationId = buildRecoveryOperationId;

const initialAttempts = (): Readonly<Record<RecoveryWorkPhase, number>> => ({
  restoring_canonical_authority: 0,
  rebuilding: 0,
  reconciling: 0,
});

const makeAudit = (code: string, at: string, phase: RecoveryWorkPhase | null): RecoveryOperationAuditEvent => ({ code, at, phase });

const makeRecord = (input: {
  readonly operationId: string;
  readonly snapshot: RecoverySnapshotIdentity;
  readonly idempotencyKey: string;
  readonly now: string;
}): RecoveryOperationRecord => ({
  kind: 'book-recovery-operation',
  schemaVersion: 'prd0062-49a-v1',
  operationId: input.operationId,
  snapshot: clone(input.snapshot),
  idempotencyKey: input.idempotencyKey,
  requestFingerprint: recoveryOperationFingerprint(input.snapshot, input.idempotencyKey),
  state: 'previewed',
  stateRevision: 0,
  resumePhase: null,
  attempts: initialAttempts(),
  errors: [],
  audit: [makeAudit('previewed', input.now, null)],
  suppression: {
    mode: 'fail-closed',
    families: [...RECOVERY_SUPPRESSION_FAMILIES],
    releasedFamilies: [],
    finalReconciliation: 'pending',
  },
  createdAt: input.now,
  updatedAt: input.now,
});

const assertSafeOperationId = (operationId: string): void => {
  if (!SAFE_IDENTIFIER.test(operationId)) throw new RecoveryLedgerError('invalid-operation-id', 'Operation ID is unsafe.');
};

const assertSafeSnapshotIdentity = (snapshot: RecoverySnapshotIdentity): void => {
  if (!isPlainRecord(snapshot)) throw new RecoveryLedgerError('invalid-operation-identity', 'Recovery snapshot identity is not a plain record.');
  for (const field of ['backupId', 'snapshotId', 'firebaseProject', 'tenantId', 'ownerId', 'inventoryVersion', 'inventoryFingerprint'] as const) {
    const value = snapshot[field];
    if (typeof value !== 'string' || value.length === 0 || value.length > 512 || !SAFE_IDENTIFIER.test(value)) {
      throw new RecoveryLedgerError('invalid-operation-identity', `Recovery snapshot ${field} is unsafe or unbounded.`);
    }
  }
  if (snapshot.backupId !== snapshot.snapshotId) throw new RecoveryLedgerError('invalid-operation-identity', 'Recovery snapshot backupId and snapshotId must match.');
  if (snapshot.inventoryVersion !== BOOK_METADATA_INVENTORY_VERSION) throw new RecoveryLedgerError('invalid-operation-identity', 'Recovery snapshot inventory version is incomplete for #121.');
  if (!Array.isArray(snapshot.allowedRoots) || snapshot.allowedRoots.length === 0 || new Set(snapshot.allowedRoots).size !== snapshot.allowedRoots.length) {
    throw new RecoveryLedgerError('invalid-operation-identity', 'Recovery snapshot root scope is missing or duplicated.');
  }
  const rootIndexes = snapshot.allowedRoots.map((root) => RECOVERY_CANONICAL_ROOTS.indexOf(root));
  if (rootIndexes.some((index, position) => index < 0 || (position > 0 && index <= rootIndexes[position - 1]))) {
    throw new RecoveryLedgerError('invalid-operation-identity', 'Recovery snapshot root scope is not canonical and ordered.');
  }
};

const isKnownPhase = (phase: unknown): phase is RecoveryWorkPhase => (
  typeof phase === 'string' && RECOVERY_WORK_PHASES.includes(phase as RecoveryWorkPhase)
);

const boundedErrorMessage = (message: string): string => (
  message
    .replace(/(Bearer\s+|access_token=)[^\s&]+/giu, '$1[redacted]')
    .slice(0, MAX_DIAGNOSTIC_MESSAGE)
);

const assertRecord = (record: RecoveryOperationRecord): void => {
  if (!isPlainRecord(record) || record.kind !== 'book-recovery-operation' || record.schemaVersion !== 'prd0062-49a-v1') throw new RecoveryLedgerError('invalid-operation-record', 'Recovery operation record schema is invalid.');
  assertSafeOperationId(record.operationId);
  assertSafeSnapshotIdentity(record.snapshot);
  if (typeof record.idempotencyKey !== 'string' || !SAFE_IDENTIFIER.test(record.idempotencyKey)) throw new RecoveryLedgerError('invalid-operation-identity', 'Recovery idempotency key is unsafe or unbounded.');
  if (record.operationId !== buildRecoveryOperationId({ snapshot: record.snapshot, idempotencyKey: record.idempotencyKey })) throw new RecoveryLedgerError('invalid-operation-identity', 'Recovery operation ID is not bound to its snapshot and idempotency identity.');
  if (record.requestFingerprint !== recoveryOperationFingerprint(record.snapshot, record.idempotencyKey)) throw new RecoveryLedgerError('invalid-operation-identity', 'Recovery operation fingerprint is not bound to its snapshot and idempotency identity.');
  if (!OPERATION_STATES.has(record.state)) throw new RecoveryLedgerError('invalid-operation-record', 'Recovery operation state is invalid.');
  if (!Number.isSafeInteger(record.stateRevision) || record.stateRevision < 0) throw new RecoveryLedgerError('invalid-operation-record', 'Recovery operation revision is invalid.');
  if (!isPlainRecord(record.suppression) || record.suppression.mode !== 'fail-closed' || !Array.isArray(record.suppression.families) || !Array.isArray(record.suppression.releasedFamilies)) throw new RecoveryLedgerError('suppression-fail-closed', 'Recovery operation suppression state is invalid.');
  if (record.suppression.families.length !== RECOVERY_SUPPRESSION_FAMILIES.length || record.suppression.families.some((family, index) => family !== RECOVERY_SUPPRESSION_FAMILIES[index]) || new Set(record.suppression.families).size !== record.suppression.families.length) throw new RecoveryLedgerError('suppression-fail-closed', 'Recovery operation suppression family inventory is incomplete or duplicated.');
  if (record.suppression.families.some((family) => !RECOVERY_SUPPRESSION_FAMILIES.includes(family))) throw new RecoveryLedgerError('suppression-fail-closed', 'Unknown suppression family cannot be inventoried.');
  if (new Set(record.suppression.releasedFamilies).size !== record.suppression.releasedFamilies.length || record.suppression.releasedFamilies.some((family) => !RECOVERY_SUPPRESSION_FAMILIES.includes(family))) throw new RecoveryLedgerError('suppression-fail-closed', 'Unknown or duplicated suppression family cannot be released.');
  if (record.suppression.finalReconciliation !== 'approved' && record.suppression.releasedFamilies.length > 0) throw new RecoveryLedgerError('suppression-fail-closed', 'Side effects cannot release before final reconciliation.');
  if (!Array.isArray(record.errors) || !Array.isArray(record.audit) || record.errors.length > MAX_ERRORS || record.audit.length > MAX_AUDIT_EVENTS) throw new RecoveryLedgerError('invalid-operation-record', 'Recovery operation metadata exceeds its bound.');
  const statePhase = RECOVERY_WORK_PHASES.includes(record.state as RecoveryWorkPhase) ? record.state as RecoveryWorkPhase : null;
  if (statePhase !== null && record.resumePhase !== statePhase) throw new RecoveryLedgerError('invalid-operation-record', 'Work state must resume its own phase.');
  if (record.state === 'failed_retryable' && !isKnownPhase(record.resumePhase)) throw new RecoveryLedgerError('invalid-operation-record', 'Retryable failure must name an unfinished work phase.');
  if (record.state !== 'failed_retryable' && statePhase === null && record.resumePhase !== null) throw new RecoveryLedgerError('invalid-operation-record', 'Non-work operation states cannot carry a resume phase.');
  for (const phase of RECOVERY_WORK_PHASES) {
    const attempt = (record.attempts as Partial<Record<RecoveryWorkPhase, unknown>> | undefined)?.[phase];
    if (!Number.isSafeInteger(attempt) || (attempt as number) < 0 || (attempt as number) > MAX_ATTEMPTS) throw new RecoveryLedgerError('invalid-operation-record', 'Recovery operation attempt metadata is invalid.');
  }
  for (const error of record.errors) {
    if (!isPlainRecord(error) || typeof error.code !== 'string' || error.code.length > MAX_DIAGNOSTIC_CODE || typeof error.message !== 'string' || error.message.length > MAX_DIAGNOSTIC_MESSAGE || typeof error.at !== 'string' || error.at.length > 64 || !isKnownPhase(error.phase) && error.phase !== null) throw new RecoveryLedgerError('invalid-operation-record', 'Recovery operation error metadata is invalid.');
  }
  for (const event of record.audit) {
    if (!isPlainRecord(event) || typeof event.code !== 'string' || event.code.length > MAX_DIAGNOSTIC_CODE || typeof event.at !== 'string' || event.at.length > 64 || !isKnownPhase(event.phase) && event.phase !== null) throw new RecoveryLedgerError('invalid-operation-record', 'Recovery operation audit metadata is invalid.');
  }
};

const stateForPhase = (phase: RecoveryWorkPhase): RecoveryOperationState => phase;

const nextStateFor = (state: RecoveryOperationState): RecoveryOperationState | null => {
  if (state === 'authorized') return 'restoring_canonical_authority';
  if (state === 'restoring_canonical_authority') return 'rebuilding';
  if (state === 'rebuilding') return 'reconciling';
  if (state === 'reconciling') return 'completed';
  return null;
};

const phaseForState = (state: RecoveryOperationState): RecoveryWorkPhase | null => (
  RECOVERY_WORK_PHASES.includes(state as RecoveryWorkPhase) ? state as RecoveryWorkPhase : null
);

const transitionAllowed = (from: RecoveryOperationState, to: RecoveryOperationState): boolean => (
  (from === 'previewed' && to === 'authorized')
  ||
  nextStateFor(from) === to
  || (to === 'failed_retryable' && phaseForState(from) !== null)
  || (from === 'failed_retryable' && phaseForState(to) !== null)
  || (to === 'failed_terminal' && !TERMINAL_STATES.has(from))
);

export class InMemoryRecoveryOperationStore implements RecoveryOperationStore {
  private readonly records = new Map<string, RecoveryOperationRecord>();

  async get(operationId: string): Promise<RecoveryOperationRecord | null> {
    return clone(this.records.get(operationId) ?? null);
  }

  async putIfAbsent(record: RecoveryOperationRecord): Promise<{ readonly created: boolean; readonly record: RecoveryOperationRecord }> {
    const existing = this.records.get(record.operationId);
    if (existing) return { created: false, record: clone(existing) };
    this.records.set(record.operationId, clone(record));
    return { created: true, record: clone(record) };
  }

  async compareAndSet(input: { operationId: string; expectedRevision: number; next: RecoveryOperationRecord }): Promise<RecoveryOperationRecord> {
    const current = this.records.get(input.operationId);
    if (!current || current.stateRevision !== input.expectedRevision) throw new RecoveryLedgerError('revision-conflict', 'Recovery operation revision fence changed.');
    assertRecord(input.next);
    this.records.set(input.operationId, clone(input.next));
    return clone(input.next);
  }
}

export interface FirebaseRecoveryOperationStoreOptions {
  readonly databaseUrl: string;
  readonly accessToken: string;
  readonly fetchImpl?: typeof fetch;
}

/** REST/ETag adapter for the deployment-only RTDB ledger. */
export class FirebaseRecoveryOperationStore implements RecoveryOperationStore {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: FirebaseRecoveryOperationStoreOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private url(path: string): string {
    return `${this.options.databaseUrl.replace(/\/+$/u, '')}/${path.split('/').map(encodeURIComponent).join('/')}.json?access_token=${encodeURIComponent(this.options.accessToken)}`;
  }

  private async ensureIdempotencyIndex(record: RecoveryOperationRecord): Promise<void> {
    assertSafeOperationId(record.snapshot.snapshotId);
    assertSafeOperationId(record.idempotencyKey);
    const path = `${RECOVERY_IDEMPOTENCY_INDEX_ROOT}/${record.snapshot.snapshotId}/${record.idempotencyKey}`;
    const index = {
      kind: 'book-recovery-operation-index',
      schemaVersion: record.schemaVersion,
      operationId: record.operationId,
      snapshotId: record.snapshot.snapshotId,
      idempotencyKey: record.idempotencyKey,
      requestFingerprint: record.requestFingerprint,
      createdAt: record.createdAt,
    };
    const response = await this.fetchImpl(this.url(path), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${this.options.accessToken}`, 'Content-Type': 'application/json', 'If-Match': 'null_etag' },
      body: JSON.stringify(index),
    });
    if (response.status === 412) {
      const existingResponse = await this.fetchImpl(this.url(path), {
        headers: { Authorization: `Bearer ${this.options.accessToken}` },
      });
      if (!existingResponse.ok) throw new RecoveryLedgerError('idempotency-index-read-failed', `Recovery idempotency index read failed with HTTP ${existingResponse.status}.`);
      const existing = await existingResponse.json() as Partial<typeof index> | null;
      if (!existing || existing.operationId !== index.operationId || existing.snapshotId !== index.snapshotId || existing.idempotencyKey !== index.idempotencyKey || existing.requestFingerprint !== index.requestFingerprint) {
        throw new RecoveryLedgerError('idempotency-index-conflict', 'Recovery idempotency index is bound to a different operation.');
      }
      return;
    }
    if (!response.ok) throw new RecoveryLedgerError('idempotency-index-write-failed', `Recovery idempotency index write failed with HTTP ${response.status}.`);
  }

  async get(operationId: string): Promise<RecoveryOperationRecord | null> {
    assertSafeOperationId(operationId);
    const response = await this.fetchImpl(this.url(`${RECOVERY_OPERATION_ROOT}/${operationId}`), { headers: { Authorization: `Bearer ${this.options.accessToken}`, 'X-Firebase-ETag': 'true' } });
    if (response.status === 404) return null;
    if (!response.ok) throw new RecoveryLedgerError('ledger-read-failed', `Recovery ledger read failed with HTTP ${response.status}.`);
    const value = await response.json() as RecoveryOperationRecord | null;
    if (value === null) return null;
    assertRecord(value);
    return value;
  }

  async putIfAbsent(record: RecoveryOperationRecord): Promise<{ readonly created: boolean; readonly record: RecoveryOperationRecord }> {
    assertRecord(record);
    const current = await this.get(record.operationId);
    if (current) {
      await this.ensureIdempotencyIndex(current);
      return { created: false, record: current };
    }
    const response = await this.fetchImpl(this.url(`${RECOVERY_OPERATION_ROOT}/${record.operationId}`), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${this.options.accessToken}`, 'Content-Type': 'application/json', 'If-Match': 'null_etag' },
      body: JSON.stringify(record),
    });
    if (response.status === 412) {
      const winner = await this.get(record.operationId);
      if (!winner) throw new RecoveryLedgerError('ledger-create-conflict', 'Recovery ledger winner disappeared after a create race.');
      await this.ensureIdempotencyIndex(winner);
      return { created: false, record: winner };
    }
    if (!response.ok) throw new RecoveryLedgerError('ledger-create-failed', `Recovery ledger create failed with HTTP ${response.status}.`);
    await this.ensureIdempotencyIndex(record);
    return { created: true, record };
  }

  async compareAndSet(input: { operationId: string; expectedRevision: number; next: RecoveryOperationRecord }): Promise<RecoveryOperationRecord> {
    assertRecord(input.next);
    const currentResponse = await this.fetchImpl(this.url(`${RECOVERY_OPERATION_ROOT}/${input.operationId}`), { headers: { Authorization: `Bearer ${this.options.accessToken}`, 'X-Firebase-ETag': 'true' } });
    if (!currentResponse.ok) throw new RecoveryLedgerError('ledger-read-failed', `Recovery ledger read failed with HTTP ${currentResponse.status}.`);
    const current = await currentResponse.json() as RecoveryOperationRecord;
    const etag = currentResponse.headers.get('ETag') ?? currentResponse.headers.get('etag') ?? currentResponse.headers.get('X-Firebase-ETag');
    if (!etag || current.stateRevision !== input.expectedRevision) throw new RecoveryLedgerError('revision-conflict', 'Recovery operation revision fence changed.');
    const response = await this.fetchImpl(this.url(`${RECOVERY_OPERATION_ROOT}/${input.operationId}`), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${this.options.accessToken}`, 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify(input.next),
    });
    if (response.status === 412) throw new RecoveryLedgerError('revision-conflict', 'Recovery operation revision fence changed.');
    if (!response.ok) throw new RecoveryLedgerError('ledger-write-failed', `Recovery ledger write failed with HTTP ${response.status}.`);
    return input.next;
  }
}

export interface RecoveryOperationPreviewInput {
  readonly snapshot: RecoverySnapshotIdentity;
  readonly idempotencyKey: string;
  readonly now?: string;
}

export class RecoveryOperationLedger {
  constructor(
    private readonly store: RecoveryOperationStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async get(operationId: string): Promise<RecoveryOperationRecord | null> {
    assertSafeOperationId(operationId);
    const record = await this.store.get(operationId);
    if (record) assertRecord(record);
    return record;
  }

  async preview(input: RecoveryOperationPreviewInput): Promise<{ readonly status: 'created' | 'replayed'; readonly operation: RecoveryOperationRecord }> {
    if (!SAFE_IDENTIFIER.test(input.idempotencyKey)) throw new RecoveryLedgerError('invalid-idempotency-key', 'Idempotency key is unsafe.');
    const operationId = buildRecoveryOperationId(input);
    const now = input.now ?? this.clock().toISOString();
    const candidate = makeRecord({ operationId, snapshot: input.snapshot, idempotencyKey: input.idempotencyKey, now });
    const result = await this.store.putIfAbsent(candidate);
    assertRecord(result.record);
    if (result.record.requestFingerprint !== candidate.requestFingerprint) throw new RecoveryLedgerError('idempotency-conflict', 'Idempotency identity was reused for a different snapshot or scope.');
    return { status: result.created ? 'created' : 'replayed', operation: result.record };
  }

  async authorizeExecute(input: {
    readonly envelope: RecoveryEnvelope;
    readonly runtime: RecoveryRuntimeIdentity;
    readonly verifier: RecoveryEnvelopeIntegrityVerifier;
    readonly now?: string | number | Date;
  }): Promise<{ readonly status: 'authorized' | 'replayed'; readonly operation: RecoveryOperationRecord }> {
    const envelope = await assertRecoveryEnvelopeScope(input.envelope, {
      phase: 'execute',
      snapshot: input.envelope.snapshot,
      runtime: input.runtime,
      verifier: input.verifier,
      now: input.now,
    });
    const operationId = buildRecoveryOperationId({ snapshot: envelope.snapshot, idempotencyKey: envelope.idempotencyKey });
    const current = await this.store.get(operationId);
    if (!current) throw new RecoveryLedgerError('preview-required', 'Execute requires the durable preview operation.');
    assertRecord(current);
    if (current.requestFingerprint !== recoveryOperationFingerprint(envelope.snapshot, envelope.idempotencyKey)) throw new RecoveryLedgerError('idempotency-conflict', 'Execute envelope does not match the preview operation.');
    if (TERMINAL_STATES.has(current.state)) throw new RecoveryLedgerError('terminal-rerun-denied', 'Completed or terminal-failed recovery operations cannot rerun.');
    if (current.state !== 'previewed') return { status: 'replayed', operation: current };
    const authorizationAt = typeof input.now === 'string' ? input.now : this.clock().toISOString();
    const next = this.transitionRecord(current, 'authorized', null, authorizationAt, 'authorized');
    return { status: 'authorized', operation: await this.store.compareAndSet({ operationId, expectedRevision: current.stateRevision, next }) };
  }

  async beginNextPhase(operationId: string, now = this.clock().toISOString()): Promise<RecoveryOperationRecord> {
    const current = await this.require(operationId);
    if (TERMINAL_STATES.has(current.state)) throw new RecoveryLedgerError('terminal-rerun-denied', 'Terminal recovery operation cannot rerun.');
    // A completed phase advances the record into the next work state. That
    // state is already the exact unfinished phase and must be resumed without
    // an extra transition (or a phase could be skipped after a crash).
    if (phaseForState(current.state)) return current;
    const target = current.state === 'failed_retryable' ? current.resumePhase : nextStateFor(current.state);
    if (!target || !RECOVERY_WORK_PHASES.includes(target as RecoveryWorkPhase)) throw new RecoveryLedgerError('invalid-phase-transition', 'No unfinished recovery phase is available.');
    const phase = target as RecoveryWorkPhase;
    const next = this.transitionRecord(current, phase, phase, now, `phase-started:${phase}`);
    const attempts = { ...next.attempts, [phase]: Math.min(MAX_ATTEMPTS, next.attempts[phase] + 1) };
    return this.save(current, { ...next, attempts });
  }

  async completePhase(input: { readonly operationId: string; readonly expectedState: RecoveryOperationState; readonly expectedRevision: number; readonly phase: RecoveryWorkPhase; readonly now?: string }): Promise<RecoveryOperationRecord> {
    const current = await this.require(input.operationId);
    if (current.state !== input.expectedState || current.stateRevision !== input.expectedRevision) throw new RecoveryLedgerError('revision-conflict', 'Phase completion fence does not match the durable operation.');
    if (current.state !== input.phase) throw new RecoveryLedgerError('invalid-phase-transition', 'Phase completion must name the current unfinished phase.');
    const nextState = nextStateFor(input.phase);
    if (!nextState) throw new RecoveryLedgerError('invalid-phase-transition', 'Recovery phase has no successor.');
    const next = this.transitionRecord(current, nextState, nextState === 'completed' ? null : nextState as RecoveryWorkPhase, input.now ?? this.clock().toISOString(), `phase-completed:${input.phase}`);
    return this.save(current, next);
  }

  async failRetryable(input: { readonly operationId: string; readonly expectedState: RecoveryOperationState; readonly expectedRevision: number; readonly code: string; readonly message: string; readonly now?: string }): Promise<RecoveryOperationRecord> {
    const current = await this.require(input.operationId);
    const phase = phaseForState(current.state);
    if (current.state !== input.expectedState || current.stateRevision !== input.expectedRevision || !phase) throw new RecoveryLedgerError('revision-conflict', 'Retryable failure fence does not match an unfinished phase.');
    const next = this.transitionRecord(current, 'failed_retryable', phase, input.now ?? this.clock().toISOString(), 'failed-retryable');
    const error: RecoveryOperationError = { code: input.code.slice(0, MAX_DIAGNOSTIC_CODE), message: boundedErrorMessage(input.message), phase, at: input.now ?? this.clock().toISOString() };
    return this.save(current, { ...next, errors: [...current.errors, error].slice(-MAX_ERRORS) });
  }

  async failTerminal(input: { readonly operationId: string; readonly expectedRevision: number; readonly code: string; readonly message: string; readonly now?: string }): Promise<RecoveryOperationRecord> {
    const current = await this.require(input.operationId);
    if (current.stateRevision !== input.expectedRevision || TERMINAL_STATES.has(current.state)) throw new RecoveryLedgerError('terminal-rerun-denied', 'Terminal recovery operation cannot be changed.');
    const now = input.now ?? this.clock().toISOString();
    const next = this.transitionRecord(current, 'failed_terminal', null, now, 'failed-terminal');
    const error: RecoveryOperationError = { code: input.code.slice(0, MAX_DIAGNOSTIC_CODE), message: boundedErrorMessage(input.message), phase: phaseForState(current.state), at: now };
    return this.save(current, { ...next, errors: [...current.errors, error].slice(-MAX_ERRORS) });
  }

  async releaseSuppressedFamilies(input: { readonly operationId: string; readonly expectedRevision: number; readonly families: readonly RecoverySuppressionFamily[]; readonly now?: string }): Promise<RecoveryOperationRecord> {
    const current = await this.require(input.operationId);
    if (current.state !== 'completed' || current.stateRevision !== input.expectedRevision || current.suppression.finalReconciliation !== 'pending') throw new RecoveryLedgerError('release-denied', 'Suppressed effects require completed recovery and an unreleased final reconciliation gate.');
    if (input.families.length === 0 || input.families.some((family) => !RECOVERY_SUPPRESSION_FAMILIES.includes(family))) throw new RecoveryLedgerError('suppression-fail-closed', 'Unknown or empty suppression family release is denied.');
    const released = [...new Set([...current.suppression.releasedFamilies, ...input.families])];
    const now = input.now ?? this.clock().toISOString();
    const next: RecoveryOperationRecord = {
      ...current,
      stateRevision: current.stateRevision + 1,
      updatedAt: now,
      audit: [...current.audit, makeAudit('final-reconciliation-approved', now, null)].slice(-MAX_AUDIT_EVENTS),
    };
    return this.save(current, { ...next, suppression: { ...current.suppression, releasedFamilies: released, finalReconciliation: 'approved' } });
  }

  private async require(operationId: string): Promise<RecoveryOperationRecord> {
    const record = await this.get(operationId);
    if (!record) throw new RecoveryLedgerError('operation-not-found', 'Recovery operation does not exist.');
    return record;
  }

  private transitionRecord(current: RecoveryOperationRecord, nextState: RecoveryOperationState, resumePhase: RecoveryWorkPhase | null, now: string, code: string): RecoveryOperationRecord {
    if (TERMINAL_STATES.has(current.state)) throw new RecoveryLedgerError('terminal-rerun-denied', 'Terminal recovery operation cannot rerun.');
    if (!transitionAllowed(current.state, nextState)) throw new RecoveryLedgerError('invalid-phase-transition', `Transition ${current.state} -> ${nextState} is not allowed.`);
    return {
      ...current,
      state: nextState,
      stateRevision: current.stateRevision + 1,
      resumePhase,
      updatedAt: now,
      audit: [...current.audit, makeAudit(code, now, phaseForState(nextState))].slice(-MAX_AUDIT_EVENTS),
    };
  }

  private async save(current: RecoveryOperationRecord, next: RecoveryOperationRecord): Promise<RecoveryOperationRecord> {
    assertRecord(next);
    return this.store.compareAndSet({ operationId: current.operationId, expectedRevision: current.stateRevision, next });
  }
}

export const isRecoveryOperationTerminal = (state: RecoveryOperationState): boolean => TERMINAL_STATES.has(state);
export const recoveryPhaseForState = phaseForState;
export const recoveryNextStateFor = nextStateFor;
