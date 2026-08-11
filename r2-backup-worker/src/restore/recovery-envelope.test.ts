import { describe, expect, it } from 'vitest';

import { BOOK_METADATA_CANONICAL_ROOTS } from './book-source-restore';
import {
  assertRecoveryEnvelope,
  issueRecoveryEnvelope,
  RECOVERY_ENVELOPE_MAX_TTL_MS,
  type RecoveryEnvelope,
} from './recovery-envelope';

const now = '2026-08-11T00:00:00.000Z';
const runtime = { kind: 'deployment-service' as const, identity: 'dr-deployer' };
const snapshot = {
  backupId: 'BK-121',
  snapshotId: 'BK-121',
  firebaseProject: 'project-121',
  tenantId: 'tenant-1',
  ownerId: 'teacher-1',
  inventoryVersion: 'prd0062-48b-v1',
  inventoryFingerprint: 'fnv1a64:inventory',
  allowedRoots: [BOOK_METADATA_CANONICAL_ROOTS[0], BOOK_METADATA_CANONICAL_ROOTS[1]],
};

const verifier = {
  verify: (payload: string, integrity: { value: string }) => payload.length > 0 && integrity.value === 'signed',
};

const makeEnvelope = async (overrides: Partial<RecoveryEnvelope> = {}): Promise<RecoveryEnvelope> => issueRecoveryEnvelope({
  snapshot,
  phase: 'dry-run',
  idempotencyKey: 'idempotency-121',
  issuedAt: now,
  expiresAt: new Date(Date.parse(now) + RECOVERY_ENVELOPE_MAX_TTL_MS).toISOString(),
  authorized: runtime,
  runtime,
}, { sign: () => 'signed' }, new Date(now)).then((envelope) => ({ ...envelope, ...overrides }));

describe('PRD0062 49A recovery envelope', () => {
  it('binds exact snapshot, ordered root scope, deployment identity, expiry, and injected integrity', async () => {
    const envelope = await makeEnvelope();
    await expect(assertRecoveryEnvelope(envelope, { runtime, verifier, now })).resolves.toMatchObject({
      phase: 'dry-run',
      snapshot: { backupId: 'BK-121', snapshotId: 'BK-121', ownerId: 'teacher-1', tenantId: 'tenant-1' },
      integrity: { value: 'signed' },
    });
  });

  it('denies tampered, wrong-phase, and expired envelopes with explicit diagnostics', async () => {
    const tampered = await makeEnvelope({ integrity: { algorithm: 'injected-signature', value: 'nope' } });
    await expect(assertRecoveryEnvelope(tampered, { runtime, verifier, now })).rejects.toMatchObject({ code: 'integrity-mismatch' });

    const wrongPhase = await makeEnvelope({ phase: 'execute' });
    await expect(assertRecoveryEnvelope(wrongPhase, { runtime, verifier, expectedPhase: 'dry-run', now })).rejects.toMatchObject({ code: 'phase-mismatch' });

    const expired = await makeEnvelope({ issuedAt: '2026-08-10T23:50:00.000Z', expiresAt: '2026-08-10T23:59:59.000Z' });
    await expect(assertRecoveryEnvelope(expired, { runtime, verifier, now })).rejects.toMatchObject({ code: 'expired' });

    const wrongSnapshot = await makeEnvelope({ snapshot: { ...snapshot, backupId: 'BK-other', snapshotId: 'BK-other' } });
    await expect(assertRecoveryEnvelope(wrongSnapshot, {
      runtime,
      verifier,
      expectedSnapshot: snapshot,
      now,
    })).rejects.toMatchObject({ code: 'snapshot-mismatch' });

    const wrongOwner = await makeEnvelope({ snapshot: { ...snapshot, ownerId: 'teacher-other' } });
    await expect(assertRecoveryEnvelope(wrongOwner, {
      runtime,
      verifier,
      expectedSnapshot: snapshot,
      now,
    })).rejects.toMatchObject({ code: 'snapshot-mismatch' });

    const wrongRoot = await makeEnvelope({ snapshot: { ...snapshot, allowedRoots: ['not-a-canonical-root'] } });
    await expect(assertRecoveryEnvelope(wrongRoot, { runtime, verifier, now }))
      .rejects.toMatchObject({ code: 'root-scope-broadened' });

    const wrongOperator = await makeEnvelope();
    await expect(assertRecoveryEnvelope(wrongOperator, {
      runtime: { kind: 'deployment-service', identity: 'other-deployer' },
      verifier,
      now,
    })).rejects.toMatchObject({ code: 'operator-mismatch' });
  });

  it('does not allow browser or ordinary service identities to mint or use envelopes', async () => {
    await expect(issueRecoveryEnvelope({
      snapshot,
      phase: 'dry-run',
      idempotencyKey: 'key',
      issuedAt: now,
      authorized: runtime,
      runtime: { kind: 'browser', identity: 'teacher-1' },
    }, { sign: () => 'signed' }, new Date(now))).rejects.toMatchObject({ code: 'ordinary-identity-denied' });

    const envelope = await makeEnvelope();
    await expect(assertRecoveryEnvelope(envelope, {
      runtime: { kind: 'ordinary-service', identity: 'dr-deployer' },
      verifier,
      now,
    })).rejects.toMatchObject({ code: 'ordinary-identity-denied' });
  });
});
