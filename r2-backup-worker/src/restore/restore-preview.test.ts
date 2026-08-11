import { describe, expect, it } from 'vitest';

import {
  BOOK_METADATA_CANONICAL_ROOTS,
  createBookMetadataBackupInventory,
  fingerprintBookMetadata,
} from './book-source-restore';
import { issueRecoveryEnvelope } from './recovery-envelope';
import {
  buildRecoveryOperationId,
  InMemoryRecoveryOperationStore,
  RecoveryOperationLedger,
} from './recovery-operation-ledger';
import { generateRecoveryPreview, RecoveryPreviewValidationError } from './restore-preview';

const now = '2026-08-11T00:00:00.000Z';
const runtime = { kind: 'deployment-operator' as const, identity: 'dr-operator' };
const inventory = createBookMetadataBackupInventory({
  backupId: 'BK-121-preview',
  firebaseProject: 'project-121',
  generatedAt: now,
  roots: BOOK_METADATA_CANONICAL_ROOTS.map((path) => ({ path, present: false, data: {} })),
});

const snapshot = {
  backupId: 'BK-121-preview',
  snapshotId: 'BK-121-preview',
  firebaseProject: 'project-121',
  tenantId: 'tenant-1',
  ownerId: 'teacher-1',
  inventoryVersion: 'prd0062-48b-v1',
  inventoryFingerprint: fingerprintBookMetadata(inventory),
  allowedRoots: [...BOOK_METADATA_CANONICAL_ROOTS],
};

describe('PRD0062 49A recovery preview', () => {
  it('persists a deterministic dry-run operation and reports zero production writes', async () => {
    const envelope = await issueRecoveryEnvelope({
      snapshot,
      phase: 'dry-run',
      idempotencyKey: 'preview-key',
      issuedAt: now,
      expiresAt: '2026-08-11T00:10:00.000Z',
      authorized: runtime,
      runtime,
    }, { sign: () => 'signed' }, new Date(now));
    const result = await generateRecoveryPreview({
      envelope,
      runtime,
      verifier: { verify: (_payload, integrity) => integrity.value === 'signed' },
      ledger: new RecoveryOperationLedger(new InMemoryRecoveryOperationStore(), () => new Date(now)),
      inventory,
      now,
    });
    expect(result.dryRun).toBe(true);
    expect(result.productionWrites).toBe(0);
    expect(result.operation.state).toBe('previewed');
    expect(result.validation.valid).toBe(true);
  });

  it('refuses to persist an operation when #120 inventory validation or identity binding fails', async () => {
    const store = new InMemoryRecoveryOperationStore();
    const ledger = new RecoveryOperationLedger(store, () => new Date(now));
    const envelope = await issueRecoveryEnvelope({
      snapshot,
      phase: 'dry-run',
      idempotencyKey: 'invalid-preview-key',
      issuedAt: now,
      expiresAt: '2026-08-11T00:10:00.000Z',
      authorized: runtime,
      runtime,
    }, { sign: () => 'signed' }, new Date(now));
    const invalidInventory = { ...inventory, backupId: 'different-backup' };

    await expect(generateRecoveryPreview({
      envelope,
      runtime,
      verifier: { verify: (_payload, integrity) => integrity.value === 'signed' },
      ledger,
      inventory: invalidInventory,
      now,
    })).rejects.toBeInstanceOf(RecoveryPreviewValidationError);
    await expect(store.get(buildRecoveryOperationId({
      snapshot,
      idempotencyKey: 'invalid-preview-key',
    }))).resolves.toBeNull();
  });
});
