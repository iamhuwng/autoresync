import { describe, expect, it } from 'vitest';

import type { RecoveryEnvelope } from '../types';
import {
  BOOK_METADATA_CANONICAL_ROOTS,
  createBookMetadataBackupInventory,
  fingerprintBookMetadata,
} from './book-source-restore';
import {
  buildRecoveryOperationId,
  InMemoryRecoveryOperationStore,
  RecoveryOperationLedger,
} from './recovery-operation-ledger';
import { issueRecoveryEnvelope } from './recovery-envelope';
import {
  executeRecoveryReconciliation,
  reconcileRecoveryInventory,
} from './restore-reconcile';

const now = '2026-08-11T00:00:00.000Z';
const runtime = { kind: 'deployment-service' as const, identity: 'dr-deployer' };

const makeInventory = (present = false) => createBookMetadataBackupInventory({
  backupId: 'backup-125',
  firebaseProject: 'project-125',
  generatedAt: now,
  roots: BOOK_METADATA_CANONICAL_ROOTS.map((path) => ({
    path,
    // #122 intentionally denies legacy flat current/record roots when they
    // are present. Keep the resume fixture focused on one safe canonical
    // write unit.
    present: present && path === 'book_activity/materials',
    data: {},
  })),
});

const makeEnvelope = async (inventory: ReturnType<typeof makeInventory>, idempotencyKey: string): Promise<RecoveryEnvelope> => {
  const inventoryFingerprint = fingerprintBookMetadata(inventory);
  return issueRecoveryEnvelope({
    snapshot: {
      backupId: inventory.backupId,
      snapshotId: inventory.backupId,
      firebaseProject: inventory.firebaseProject,
      tenantId: 'tenant-125',
      ownerId: 'teacher-125',
      inventoryVersion: inventory.inventoryVersion,
      inventoryFingerprint,
      allowedRoots: [...BOOK_METADATA_CANONICAL_ROOTS],
    },
    phase: 'execute',
    idempotencyKey,
    issuedAt: now,
    expiresAt: '2026-08-11T00:10:00.000Z',
    authorized: runtime,
    runtime,
  }, { sign: () => 'signed' }, new Date(now));
};

const verifier = {
  verify: (_payload: string, integrity: { readonly value: string }) => integrity.value === 'signed',
};

describe('PRD0062 #125 deterministic recovery reconciliation', () => {
  it('produces identical phase hashes and counts when root enumeration changes', () => {
    const inventory = makeInventory();
    const input = {
      inventory,
      inventoryFingerprint: fingerprintBookMetadata(inventory),
      recoveryOperationId: 'recovery-125-order',
      expectedFirebaseProject: inventory.firebaseProject,
    };
    const first = reconcileRecoveryInventory(input);
    const second = reconcileRecoveryInventory({
      ...input,
      inventory: { ...inventory, roots: [...inventory.roots].reverse() },
    });

    expect(first.report.phaseOrder).toEqual([
      'canonical-authority',
      'source-delivery',
      'runtime-results-completion',
      'updates-checkpoints-notifications-replacement-audit',
      'reconciliation-ledger-completion',
    ]);
    expect(first.report.stableHash).toBe(second.report.stableHash);
    expect(first.report.phases).toEqual(second.report.phases);
    expect(first.report.sideEffects).toEqual(expect.objectContaining({
      productionWrites: 0,
      externalProviderOperations: 0,
      studentCommandExecutions: 0,
      scoringCalls: 0,
      notificationDuplicates: 0,
      checkpointDuplicates: 0,
      deletionOperations: 0,
      auditFanOut: 0,
      userVisibleSideEffects: 0,
    }));
  });

  it('fails closed for an envelope fingerprint mismatch and a missing root', () => {
    const inventory = makeInventory();
    const base = {
      inventory,
      inventoryFingerprint: fingerprintBookMetadata(inventory),
      recoveryOperationId: 'recovery-125-denial',
      expectedFirebaseProject: inventory.firebaseProject,
    };
    expect(() => reconcileRecoveryInventory({ ...base, inventoryFingerprint: 'fnv1a64:wrong' }))
      .toThrow('validated inventory fingerprint');
    const missingRoot = { ...inventory, roots: inventory.roots.slice(1) };
    expect(() => reconcileRecoveryInventory({ ...base, inventory: missingRoot }))
      .toThrow('Required canonical root');
  });

  it('resumes only unfinished canonical records and keeps the completed count stable', () => {
    const inventory = makeInventory(true);
    const fingerprint = fingerprintBookMetadata(inventory);
    const result = reconcileRecoveryInventory({
      inventory,
      inventoryFingerprint: fingerprint,
      recoveryOperationId: 'recovery-125-resume',
      expectedFirebaseProject: inventory.firebaseProject,
      completedProjectionKeys: new Set(['canonical:book_activity/materials']),
    });

    expect(result.firstPass.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'canonical:book_activity/materials', status: 'completed' }),
    ]));
    expect(result.firstPass.pendingRecordKeys).not.toContain('canonical:book_activity/materials');
    expect(result.report.phases[0].counts.completed).toBe(1);
    expect(result.report.phases[0]).toEqual(result.secondPass.phases[0]);
  });

  it('runs the exact logical phase order, completes only the recovery ledger, and leaves #126 absent', async () => {
    const inventory = makeInventory();
    const envelope = await makeEnvelope(inventory, 'recovery-125-execute');
    const ledger = new RecoveryOperationLedger(new InMemoryRecoveryOperationStore(), () => new Date(now));
    await ledger.preview({
      snapshot: envelope.snapshot,
      idempotencyKey: envelope.idempotencyKey,
      now,
    });
    const events: string[] = [];
    const result = await executeRecoveryReconciliation({
      inventory,
      inventoryFingerprint: fingerprintBookMetadata(inventory),
      recoveryOperationId: buildRecoveryOperationId({ snapshot: envelope.snapshot, idempotencyKey: envelope.idempotencyKey }),
      expectedFirebaseProject: inventory.firebaseProject,
      envelope,
      runtime,
      verifier,
      ledger,
      now,
      onPhase: ({ phase }) => { events.push(phase); },
    });

    expect(events).toEqual([
      'canonical-authority',
      'source-delivery',
      'runtime-results-completion',
      'updates-checkpoints-notifications-replacement-audit',
      'reconciliation-ledger-completion',
    ]);
    expect(result.operation.state).toBe('completed');
    expect(result.report.completion).toEqual({
      kind: 'recovery-ledger-only',
      state: 'completed',
      activation: 'absent',
      delivery: 'held-unavailable',
      finalReconciliation: 'pending',
      approvalRequired: true,
    });
    expect(result.operation.suppression.releasedFamilies).toEqual([]);
    expect(result.operation.suppression.finalReconciliation).toBe('pending');
  });

  it('fails before ledger mutation when a canonical record is pending, then succeeds with its exact completion key', async () => {
    const inventory = makeInventory(true);
    const inventoryFingerprint = fingerprintBookMetadata(inventory);
    const envelope = await makeEnvelope(inventory, 'recovery-125-pending-canonical');
    const operationId = buildRecoveryOperationId({ snapshot: envelope.snapshot, idempotencyKey: envelope.idempotencyKey });
    const ledger = new RecoveryOperationLedger(new InMemoryRecoveryOperationStore(), () => new Date(now));
    await ledger.preview({ snapshot: envelope.snapshot, idempotencyKey: envelope.idempotencyKey, now });

    const dryPlan = reconcileRecoveryInventory({
      inventory,
      inventoryFingerprint,
      recoveryOperationId: operationId,
      expectedFirebaseProject: inventory.firebaseProject,
    });
    expect(dryPlan.firstPass.pendingRecordKeys).toContain('canonical:book_activity/materials');
    expect(dryPlan.report.phases[0].counts.pending).toBe(1);

    await expect(executeRecoveryReconciliation({
      inventory,
      inventoryFingerprint,
      recoveryOperationId: operationId,
      expectedFirebaseProject: inventory.firebaseProject,
      envelope,
      runtime,
      verifier,
      ledger,
      now,
    })).rejects.toThrow('pending-records');
    const beforeCompletion = await ledger.get(operationId);
    expect(beforeCompletion?.state).toBe('previewed');
    expect(beforeCompletion?.stateRevision).toBe(0);

    const completed = await executeRecoveryReconciliation({
      inventory,
      inventoryFingerprint,
      recoveryOperationId: operationId,
      expectedFirebaseProject: inventory.firebaseProject,
      completedProjectionKeys: new Set(['canonical:book_activity/materials']),
      envelope,
      runtime,
      verifier,
      ledger,
      now,
    });
    expect(completed.operation.state).toBe('completed');
    expect(completed.firstPass.pendingRecordKeys).not.toContain('canonical:book_activity/materials');
    expect(completed.report.sideEffects.productionWrites).toBe(0);
    expect(completed.report.completion.activation).toBe('absent');
  });

  it('records a retryable crash without completing the recovery ledger', async () => {
    const inventory = makeInventory();
    const envelope = await makeEnvelope(inventory, 'recovery-125-crash');
    const ledger = new RecoveryOperationLedger(new InMemoryRecoveryOperationStore(), () => new Date(now));
    await ledger.preview({ snapshot: envelope.snapshot, idempotencyKey: envelope.idempotencyKey, now });
    const crashed = await executeRecoveryReconciliation({
      inventory,
      inventoryFingerprint: fingerprintBookMetadata(inventory),
      recoveryOperationId: buildRecoveryOperationId({ snapshot: envelope.snapshot, idempotencyKey: envelope.idempotencyKey }),
      expectedFirebaseProject: inventory.firebaseProject,
      envelope,
      runtime,
      verifier,
      ledger,
      now,
      onPhase: ({ phase }) => {
        if (phase === 'runtime-results-completion') throw new Error('simulated crash');
      },
    });
    expect(crashed.operation.state).toBe('failed_retryable');
    expect(crashed.report.completion.state).toBe('not-completed');
    expect(crashed.operation.suppression.finalReconciliation).toBe('pending');

    const resumed = await executeRecoveryReconciliation({
      inventory,
      inventoryFingerprint: fingerprintBookMetadata(inventory),
      recoveryOperationId: buildRecoveryOperationId({ snapshot: envelope.snapshot, idempotencyKey: envelope.idempotencyKey }),
      expectedFirebaseProject: inventory.firebaseProject,
      envelope,
      runtime,
      verifier,
      ledger,
      now,
    });
    expect(resumed.operation.state).toBe('completed');
    expect(resumed.report.completion.activation).toBe('absent');
  });
});
