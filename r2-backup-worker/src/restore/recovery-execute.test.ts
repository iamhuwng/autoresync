import { describe, expect, it } from 'vitest';

import { BOOK_METADATA_CANONICAL_ROOTS } from './book-source-restore';
import { issueRecoveryEnvelope } from './recovery-envelope';
import { InMemoryRecoveryOperationStore, RecoveryOperationLedger } from './recovery-operation-ledger';
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
  inventoryVersion: 'prd0062-48b-v1',
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
});
