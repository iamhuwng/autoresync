import { describe, expect, it } from 'vitest';
import type { RecoveryOperationRecord, RecoveryWorkPhase } from '../types';

import { BOOK_METADATA_CANONICAL_ROOTS } from './book-source-restore';
import { issueRecoveryEnvelope } from './recovery-envelope';
import {
  buildRecoveryOperationId,
  FirebaseRecoveryOperationStore,
  InMemoryRecoveryOperationStore,
  RecoveryLedgerError,
  RecoveryOperationLedger,
  type RecoveryOperationStore,
} from './recovery-operation-ledger';
import { isRecoveryEffectSuppressed } from './recovery-suppression';

const now = '2026-08-11T00:00:00.000Z';
const runtime = { kind: 'deployment-service' as const, identity: 'dr-deployer' };
const snapshot = {
  backupId: 'BK-121-ledger',
  snapshotId: 'BK-121-ledger',
  firebaseProject: 'project-121',
  tenantId: 'tenant-1',
  ownerId: 'teacher-1',
  inventoryVersion: 'prd0062-48b-v2',
  inventoryFingerprint: 'fnv1a64:inventory',
  allowedRoots: [BOOK_METADATA_CANONICAL_ROOTS[0], BOOK_METADATA_CANONICAL_ROOTS[1]],
};

const makeEnvelope = async (phase: 'dry-run' | 'execute', idempotencyKey = 'ledger-key') => issueRecoveryEnvelope({
  snapshot,
  phase,
  idempotencyKey,
  issuedAt: now,
  expiresAt: '2026-08-11T00:10:00.000Z',
  authorized: runtime,
  runtime,
}, { sign: () => 'signed' }, new Date(now));

const verifier = { verify: (_payload: string, integrity: { value: string }) => integrity.value === 'signed' };

class FixedRecordStore implements RecoveryOperationStore {
  constructor(private readonly record: RecoveryOperationRecord) {}

  async get(): Promise<RecoveryOperationRecord> {
    return structuredClone(this.record);
  }

  async putIfAbsent(): Promise<{ readonly created: boolean; readonly record: RecoveryOperationRecord }> {
    return { created: false, record: structuredClone(this.record) };
  }

  async compareAndSet(input: { readonly operationId: string; readonly expectedRevision: number; readonly next: RecoveryOperationRecord }): Promise<RecoveryOperationRecord> {
    return structuredClone(input.next);
  }
}

describe('PRD0062 49A recovery operation ledger', () => {
  it('uses one deterministic operation for duplicate snapshot and idempotency identity', async () => {
    const store = new InMemoryRecoveryOperationStore();
    const ledger = new RecoveryOperationLedger(store, () => new Date(now));
    const first = await ledger.preview({ snapshot, idempotencyKey: 'same-key', now });
    const second = await ledger.preview({ snapshot, idempotencyKey: 'same-key', now: '2026-08-11T00:00:01.000Z' });
    expect(first.status).toBe('created');
    expect(second.status).toBe('replayed');
    expect(second.operation.operationId).toBe(first.operation.operationId);
    expect(second.operation).toEqual(first.operation);
    expect(buildRecoveryOperationId({ snapshot, idempotencyKey: 'same-key' })).toBe(first.operation.operationId);
  });

  it('persists the snapshot/idempotency index beside a newly created durable operation', async () => {
    const sourceLedger = new RecoveryOperationLedger(new InMemoryRecoveryOperationStore(), () => new Date(now));
    const operation = (await sourceLedger.preview({ snapshot, idempotencyKey: 'firebase-index-key', now })).operation;
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/book_recovery/operations/') && (init?.method ?? 'GET') === 'GET') {
        return new Response('null', { status: 404 });
      }
      return new Response('{}', { status: 200 });
    };
    const store = new FirebaseRecoveryOperationStore({
      databaseUrl: 'https://database.example.test',
      accessToken: 'deployment-token',
      fetchImpl,
    });

    await expect(store.putIfAbsent(operation)).resolves.toMatchObject({ created: true });
    expect(calls.some((call) => call.includes('/book_recovery/operations/') && call.startsWith('PUT '))).toBe(true);
    expect(calls.some((call) => call.includes('/book_recovery/indexes/by_snapshot_idempotency/') && call.startsWith('PUT '))).toBe(true);
  });

  it('keeps scope changes on the same identity from becoming a second operation', async () => {
    const ledger = new RecoveryOperationLedger(new InMemoryRecoveryOperationStore(), () => new Date(now));
    await ledger.preview({ snapshot, idempotencyKey: 'scope-key', now });
    await expect(ledger.preview({
      snapshot: { ...snapshot, ownerId: 'teacher-other' },
      idempotencyKey: 'scope-key',
      now,
    })).rejects.toMatchObject({ code: 'idempotency-conflict' });
  });

  it('rejects malformed durable identity, suppression, and resume records before CAS', async () => {
    const sourceLedger = new RecoveryOperationLedger(new InMemoryRecoveryOperationStore(), () => new Date(now));
    const valid = (await sourceLedger.preview({ snapshot, idempotencyKey: 'malformed-key', now })).operation;

    const tamperedSnapshot = {
      ...valid,
      snapshot: { ...valid.snapshot, ownerId: 'teacher-other' },
    } as RecoveryOperationRecord;
    await expect(new RecoveryOperationLedger(new FixedRecordStore(tamperedSnapshot)).get(valid.operationId))
      .rejects.toMatchObject({ code: 'invalid-operation-identity' });

    const tamperedFingerprint = {
      ...valid,
      requestFingerprint: 'fnv1a64:tampered',
    } as RecoveryOperationRecord;
    await expect(new RecoveryOperationLedger(new FixedRecordStore(tamperedFingerprint)).get(valid.operationId))
      .rejects.toMatchObject({ code: 'invalid-operation-identity' });

    const duplicateFamilies = {
      ...valid,
      suppression: {
        ...valid.suppression,
        families: [...valid.suppression.families, valid.suppression.families[0]],
      },
    } as RecoveryOperationRecord;
    await expect(new RecoveryOperationLedger(new FixedRecordStore(duplicateFamilies)).get(valid.operationId))
      .rejects.toMatchObject({ code: 'suppression-fail-closed' });

    const workWithoutResume = {
      ...valid,
      state: 'restoring_canonical_authority',
      resumePhase: null,
    } as RecoveryOperationRecord;
    await expect(new RecoveryOperationLedger(new FixedRecordStore(workWithoutResume)).get(valid.operationId))
      .rejects.toMatchObject({ code: 'invalid-operation-record' });

    const retryWithoutResume = {
      ...valid,
      state: 'failed_retryable',
      resumePhase: null,
    } as RecoveryOperationRecord;
    await expect(new RecoveryOperationLedger(new FixedRecordStore(retryWithoutResume)).get(valid.operationId))
      .rejects.toMatchObject({ code: 'invalid-operation-record' });
  });

  it('requires the preview before execute, fences concurrent CAS, resumes the exact crashed phase, and denies terminal rerun', async () => {
    const ledger = new RecoveryOperationLedger(new InMemoryRecoveryOperationStore(), () => new Date(now));
    const dryRun = await makeEnvelope('dry-run', 'resume-key');
    const execute = await makeEnvelope('execute', 'resume-key');
    await expect(ledger.authorizeExecute({ envelope: execute, runtime, verifier, now })).rejects.toMatchObject({ code: 'preview-required' });
    const preview = await ledger.preview({ snapshot, idempotencyKey: 'resume-key', now });
    const authorized = await ledger.authorizeExecute({ envelope: execute, runtime, verifier, now });
    expect(authorized.operation.state).toBe('authorized');
    expect(authorized.operation.stateRevision).toBe(preview.operation.stateRevision + 1);
    const [started, raced] = await Promise.allSettled([
      ledger.beginNextPhase(authorized.operation.operationId, now),
      ledger.beginNextPhase(authorized.operation.operationId, now),
    ]);
    expect(started.status).toBe('fulfilled');
    expect(raced.status).toBe('rejected');
    const phase = (started as PromiseFulfilledResult<typeof authorized.operation>).value;
    expect(phase.state).toBe('restoring_canonical_authority');
    const retryable = await ledger.failRetryable({
      operationId: phase.operationId,
      expectedState: phase.state,
      expectedRevision: phase.stateRevision,
      code: 'crash',
      message: 'Bearer secret-token access_token=secret-value bounded failure detail',
      now,
    });
    expect(retryable.state).toBe('failed_retryable');
    expect(retryable.resumePhase).toBe('restoring_canonical_authority');
    expect(retryable.errors[0]?.message).toBe('Bearer [redacted] access_token=[redacted] bounded failure detail');
    const resumed = await ledger.beginNextPhase(phase.operationId, now);
    expect(resumed.state).toBe('restoring_canonical_authority');
    const rebuilding = await ledger.completePhase({ operationId: phase.operationId, expectedState: resumed.state, expectedRevision: resumed.stateRevision, phase: resumed.state as RecoveryWorkPhase, now });
    const reconcilingReady = await ledger.beginNextPhase(phase.operationId, now);
    const reconciling = await ledger.completePhase({ operationId: phase.operationId, expectedState: reconcilingReady.state, expectedRevision: reconcilingReady.stateRevision, phase: reconcilingReady.state as RecoveryWorkPhase, now });
    const finalReady = await ledger.beginNextPhase(phase.operationId, now);
    const completed = await ledger.completePhase({ operationId: phase.operationId, expectedState: finalReady.state, expectedRevision: finalReady.stateRevision, phase: finalReady.state as RecoveryWorkPhase, now });
    expect(rebuilding.state).toBe('rebuilding');
    expect(completed.state).toBe('completed');
    await expect(ledger.beginNextPhase(phase.operationId, now)).rejects.toMatchObject({ code: 'terminal-rerun-denied' });
    await expect(ledger.authorizeExecute({ envelope: execute, runtime, verifier, now })).rejects.toMatchObject({ code: 'terminal-rerun-denied' });
    void dryRun;
  });

  it('does not release any side-effect family until completed final reconciliation explicitly releases it', async () => {
    const ledger = new RecoveryOperationLedger(new InMemoryRecoveryOperationStore(), () => new Date(now));
    await ledger.preview({ snapshot, idempotencyKey: 'suppression-key', now });
    const execute = await makeEnvelope('execute', 'suppression-key');
    let operation = (await ledger.authorizeExecute({ envelope: execute, runtime, verifier, now })).operation;
    expect(isRecoveryEffectSuppressed('notification', { recoveryOperationId: operation.operationId, operation })).toMatchObject({ suppressed: true, code: 'operation-not-completed' });
    operation = await ledger.beginNextPhase(operation.operationId, now);
    operation = await ledger.completePhase({ operationId: operation.operationId, expectedState: operation.state, expectedRevision: operation.stateRevision, phase: operation.state as RecoveryWorkPhase, now });
    operation = await ledger.beginNextPhase(operation.operationId, now);
    operation = await ledger.completePhase({ operationId: operation.operationId, expectedState: operation.state, expectedRevision: operation.stateRevision, phase: operation.state as RecoveryWorkPhase, now });
    operation = await ledger.beginNextPhase(operation.operationId, now);
    operation = await ledger.completePhase({ operationId: operation.operationId, expectedState: operation.state, expectedRevision: operation.stateRevision, phase: operation.state as RecoveryWorkPhase, now });
    await expect(ledger.releaseSuppressedFamilies({ operationId: operation.operationId, expectedRevision: operation.stateRevision, families: ['notification'], now })).resolves.toMatchObject({ state: 'completed' });
    const released = await ledger.get(operation.operationId);
    expect(isRecoveryEffectSuppressed('notification', { recoveryOperationId: operation.operationId, operation: released })).toMatchObject({ suppressed: false, code: 'released' });
    expect(isRecoveryEffectSuppressed('unknown-family', { recoveryOperationId: operation.operationId, operation: released })).toMatchObject({ suppressed: true, code: 'unknown-family' });
    expect(isRecoveryEffectSuppressed('notification', { recoveryOperationId: operation.operationId })).toMatchObject({ suppressed: true, code: 'missing-operation-state' });
  });
});
