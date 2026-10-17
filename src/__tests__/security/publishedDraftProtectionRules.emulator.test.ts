import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
let testEnv: RulesTestEnvironment;

describeEmulator('published test draft protection', () => {
  afterAll(async () => { await testEnv?.cleanup(); });

  it('allows unpublished cleanup and publishing, but prevents either owner from deleting or unlinking published authoring data', async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-published-draft-protection',
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    });
    const owner = testEnv.authenticatedContext('teacher-1').firestore();
    const otherTeacher = testEnv.authenticatedContext('teacher-2').firestore();

    for (const collection of ['thcs_drafts', 'writing_drafts']) {
      await assertSucceeds(owner.doc(`${collection}/missing`).get());
      await assertFails(testEnv.unauthenticatedContext().firestore().doc(`${collection}/missing`).get());
      const disposable = owner.doc(`${collection}/disposable`);
      await assertSucceeds(disposable.set({ userId: 'teacher-1', status: 'editing' }));
      await assertSucceeds(disposable.delete());

      const linked = owner.doc(`${collection}/linked`);
      await assertSucceeds(linked.set({ userId: 'teacher-1', status: 'editing' }));
      await assertSucceeds(linked.update({ status: 'published', publishedTestId: 'test-1' }));
      await assertSucceeds(linked.update({ title: 'Updated title' }));
      await assertFails(linked.delete());
      await assertFails(linked.update({ status: 'editing' }));
      await assertFails(linked.update({ publishedTestId: null }));
      await assertFails(otherTeacher.doc(`${collection}/linked`).delete());
      await assertFails(otherTeacher.doc(`${collection}/linked`).get());
      expect((await linked.get()).data()?.publishedTestId).toBe('test-1');
    }
  });
});
