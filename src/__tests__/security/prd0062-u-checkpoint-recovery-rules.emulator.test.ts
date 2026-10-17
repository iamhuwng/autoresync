import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const DATABASE_RULES = readFileSync(process.env.PRD0062_U_RULES_PATH ?? 'database.rules.json', 'utf8');
const describeEmulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
const PROJECT_ID = 'demo-prd0062-u-rules';
let testEnv: RulesTestEnvironment;

const checkpoint = {
  schemaVersion: 1, checkpointId: 'action-1:homework-1:student-1', actionId: 'action-1',
  ownerId: 'teacher-1', bookId: 'book-1', contextKey: 'homework:homework-1',
  contextId: 'homework-1', studentId: 'student-1', oldBindingId: 'binding-1', oldBindingRevision: 1,
  status: 'review-only', reason: 'review', activities: [],
  auditContext: {
    actionId: 'action-1', contextKey: 'homework:homework-1', contextId: 'homework-1',
    studentId: 'student-1', oldBindingId: 'binding-1', oldBindingRevision: 1, reason: 'review',
  },
  createdAt: '2026-08-10T00:00:00.000Z',
};

const hold = {
  kind: 'book-update-recovery-hold', schemaVersion: 1, recoveryOperationId: 'recovery-1',
  scopeKey: 'scope-1', recipientId: 'student-1', deliveryState: 'unavailable', readDenied: true,
  activation: 'held-for-reconciliation',
};

const projection = {
  kind: 'book-update-recovery-projection', schemaVersion: 1, projectionKey: 'recovery-1~notification~notification-1',
  recoveryOperationId: 'recovery-1', recordKind: 'notification', recordId: 'notification-1',
  idempotencyKey: 'notification-1', ownerId: 'teacher-1', bookId: 'book-1', scopeKey: 'scope-1',
  recipientId: 'student-1', contextId: 'homework-1', state: 'held', deliveryState: 'unavailable',
  readDenied: true, activation: 'held-for-reconciliation', metadata: { case: 'review' },
  canonicalFingerprint: 'fingerprint-1',
};

describeEmulator('PRD0062 U checkpoint/recovery Rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, database: { rules: DATABASE_RULES } });
    await testEnv.clearDatabase();
  });
  afterAll(async () => { await testEnv?.cleanup(); });

  it('enforces 40B create-once equality and denies ancestor/deletion writes', async () => {
    const claims = { brd: { s: true, o: 'teacher-1', a: 'action-1', c: checkpoint.checkpointId, dl: Date.now() + 60_000, r: true } };
    const service = testEnv.authenticatedContext('redo-service', claims).database();
    const path = `book_update_checkpoints/records/teacher-1/${checkpoint.checkpointId}`;
    await expect(assertSucceeds(service.ref(path).set(checkpoint)), '40B create').resolves.toBeUndefined();
    await expect(assertFails(service.ref(path).set(checkpoint)), '40B replay write denied').resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(assertFails(service.ref(path).set({ ...checkpoint, reason: 'drift' })), '40B drift').resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(assertFails(service.ref(path).remove()), '40B deletion').resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(assertFails(service.ref('book_update_checkpoints').set({ forged: true })), '40B ancestor').resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('enforces 49D held recovery equality and denies deletion/ancestor writes', async () => {
    const claims = { bkr: { s: true, si: 'book_recovery_service', o: 'recovery-1', r: 'student-1', dl: Date.now() + 60_000 } };
    const service = testEnv.authenticatedContext('recovery-service', claims).database();
    const holdPath = 'book_update_action_recovery/49d/holds/scope-1';
    const projectionPath = 'book_update_action_recovery/49d/notifications/student-1/recovery-1~notification~notification-1';
    await expect(assertSucceeds(service.ref(holdPath).set(hold)), '49D hold create').resolves.toBeUndefined();
    await expect(assertFails(service.ref(holdPath).set(hold)), '49D hold replay write denied').resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(assertFails(service.ref(holdPath).set({ ...hold, deliveryState: 'available' })), '49D hold drift').resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(assertFails(service.ref(holdPath).remove()), '49D hold deletion').resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(assertSucceeds(service.ref(projectionPath).set(projection)), '49D projection create').resolves.toBeUndefined();
    await expect(assertFails(service.ref(projectionPath).set(projection)), '49D projection replay write denied').resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(assertFails(service.ref(projectionPath).set({ ...projection, canonicalFingerprint: 'drift' })), '49D projection drift').resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(assertFails(service.ref('book_update_action_recovery/49d').set({ forged: true })), '49D ancestor').resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
