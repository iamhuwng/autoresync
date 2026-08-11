import { describe, expect, it } from 'vitest';

import { BOOK_METADATA_CANONICAL_ROOTS } from './book-source-restore';
import { issueRecoveryEnvelope } from './recovery-envelope';
import type { RecoveryOperationRecord } from '../types';
import {
  InMemoryRecoveryOperationStore,
  RecoveryOperationLedger,
  type RecoveryOperationStore,
} from './recovery-operation-ledger';
import { isRecoveryEffectSuppressed } from './recovery-suppression';
import { executeRecovery } from './restore-execute';

const now = '2026-08-11T00:00:00.000Z';
const runtime = { kind: 'deployment-service' as const, identity: 'dr-deployer' };
const snapshot = {
  backupId: 'BK-121-execute',
  snapshotId: 'BK-121-execute',
  firebaseProject: 'project-121',
  tenantId: 'tenant-1',
  ownerId: 'teacher-1',
  inventoryVersion: 'prd0062-48b-v2',
  inventoryFingerprint: 'fnv1a64:execute',
  allowedRoots: [BOOK_METADATA_CANONICAL_ROOTS[0]],
};

const makeEnvelope = async () => issueRecoveryEnvelope({
  snapshot,
  phase: 'execute',
  idempotencyKey: 'execute-key',
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

describe('PRD0062 49A recovery execute', () => {
  it('runs each unfinished phase once in order and keeps all effects suppressed', async () => {
    const store = new InMemoryRecoveryOperationStore();
    const ledger = new RecoveryOperationLedger(store, () => new Date(now));
    await ledger.preview({ snapshot, idempotencyKey: 'execute-key', now });
    const phases: string[] = [];

    const result = await executeRecovery({
      envelope: await makeEnvelope(),
      runtime,
      verifier,
      ledger,
      now,
      runners: {
        restoring_canonical_authority: async ({ phase, suppression }) => {
          phases.push(phase);
          expect(isRecoveryEffectSuppressed('notification', suppression)).toMatchObject({ suppressed: true });
        },
        rebuilding: async ({ phase, suppression }) => {
          phases.push(phase);
          expect(isRecoveryEffectSuppressed('submission-result-scoring', suppression)).toMatchObject({ suppressed: true });
        },
        reconciling: async ({ phase, suppression }) => {
          phases.push(phase);
          expect(isRecoveryEffectSuppressed('audit-fan-out', suppression)).toMatchObject({ suppressed: true });
        },
      },
    });

    expect(phases).toEqual(['restoring_canonical_authority', 'rebuilding', 'reconciling']);
    expect(result.state).toBe('completed');
    expect(isRecoveryEffectSuppressed('notification', {
      recoveryOperationId: result.operationId,
      operation: result,
    })).toMatchObject({ suppressed: true, code: 'reconciliation-pending' });
  });

  it('does not invoke a runner when a durable operation identity is tampered', async () => {
    const sourceLedger = new RecoveryOperationLedger(new InMemoryRecoveryOperationStore(), () => new Date(now));
    const preview = await sourceLedger.preview({ snapshot, idempotencyKey: 'tampered-execute-key', now });
    const tampered = {
      ...preview.operation,
      snapshot: { ...preview.operation.snapshot, ownerId: 'teacher-other' },
    } as RecoveryOperationRecord;
    const phases: string[] = [];

    await expect(executeRecovery({
      envelope: await issueRecoveryEnvelope({
        snapshot,
        phase: 'execute',
        idempotencyKey: 'tampered-execute-key',
        issuedAt: now,
        expiresAt: '2026-08-11T00:10:00.000Z',
        authorized: runtime,
        runtime,
      }, { sign: () => 'signed' }, new Date(now)),
      runtime,
      verifier,
      ledger: new RecoveryOperationLedger(new FixedRecordStore(tampered), () => new Date(now)),
      now,
      runners: {
        restoring_canonical_authority: async () => { phases.push('restoring_canonical_authority'); },
      },
    })).rejects.toMatchObject({ code: 'invalid-operation-identity' });
    expect(phases).toEqual([]);
  });
});
