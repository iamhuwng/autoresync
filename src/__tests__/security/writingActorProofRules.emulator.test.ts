import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const eventId = 'writing-solo1-submitted-student';
let testEnv: RulesTestEnvironment;

describeEmulator('Writing actor-only notification proof', () => {
  afterAll(async () => { await testEnv?.cleanup(); });

  it('allows only the saved actor to get an immutable keyed intent', async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-writing-actor-proof',
      firestore: { rules: readFileSync(process.env.BRIDGE_FIRESTORE_RULES ?? 'firestore.rules', 'utf8') },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`writing_notification_intents/${eventId}`).set({
        eventId, kind: 'writing-submitted-student', actorUid: 'student1', authorityRecordId: 'solo1',
      });
    });
    const actor = testEnv.authenticatedContext('student1').firestore();
    const stranger = testEnv.authenticatedContext('student2').firestore();
    const path = `writing_notification_intents/${eventId}`;
    expect((await assertSucceeds(actor.doc(path).get())).data()?.actorUid).toBe('student1');
    await assertFails(stranger.doc(path).get());
    await assertFails(actor.collection('writing_notification_intents').get());
    await assertFails(actor.doc(path).update({ actorUid: 'student2' }));
    await assertFails(actor.doc(path).delete());
  });
});
