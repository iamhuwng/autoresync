import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { expect, it } from 'vitest';

it('blocks external audio in whole-test and section writes for public and private THCS tests', async () => {
  const environment = await initializeTestEnvironment({
    projectId: 'demo-external-audio-publish',
    database: { rules: readFileSync('database.rules.json', 'utf8') },
  });
  const audio = { assetId: '53f947d9-2484-4e83-bc3a-6ec82e0e5c81', scope: 'section' };
  try {
    await environment.clearDatabase();
    const graph = { assetId: audio.assetId, canonicalAssetId: audio.assetId, ownerId: 'teacher', storageProvider: 'b2',
      state: 'committed', sourceDraftId: 'draft', sectionNumber: 1, contentType: 'audio/wav', sizeBytes: 64,
      createdAt: 1, updatedAt: 1 };
    const graphPath = `media_assets/${audio.assetId}`;
    await environment.withSecurityRulesDisabled(async (worker) => {
      await worker.database().ref('users/teacher').set({ role: 'teacher' });
      await worker.database().ref(graphPath).set(graph);
      await worker.database().ref('thcs_published_versions/thcs-old/version-old').set({ ownerId: 'teacher', id: 'thcs-old' });
      await worker.database().ref('thcs_result_audio/result-old').set({ studentId: 'student', testId: 'thcs-old', versionId: 'version-old' });
    });
    const database = environment.authenticatedContext('teacher').database();
    await assertFails(database.ref().update({ [`${graphPath}/providerVersionId`]: 'browser-forgery' }));
    await assertFails(environment.authenticatedContext('student').database().ref(graphPath).get());
    for (const userId of ['teacher', 'student']) {
      const client = environment.authenticatedContext(userId).database();
      for (const path of ['thcs_published_versions/thcs-old/version-old', 'thcs_result_audio/result-old']) {
        await assertFails(client.ref(path).get());
        await assertFails(client.ref(path).set({ versionId: 'forged-version' }));
        await assertFails(client.ref(path).remove());
      }
    }
    const courseResult = {
      resultId: 'retained-course-result', studentId: 'student', testId: 'thcs-old', testType: 'THCS-THPT',
      deliveryEngine: 'thcs-course', courseId: 'course-one', materialVersionId: 'version-old',
      visibility: { ownershipResolved: true, visibilityOwnerTeacherId: 'course-teacher',
        contextType: 'course_material', sourceType: 'course', sourceId: 'course-one' },
    };
    await environment.withSecurityRulesDisabled(async (worker) => {
      await worker.database().ref().update({
        'users/course-teacher': { role: 'teacher' }, 'users/student': { role: 'student' },
        'users/other-student': { role: 'student' }, 'courses/course-one': { ownerId: 'course-teacher' },
        'test_results/retained-course-result': courseResult,
      });
    });
    const resultPath = 'test_results/retained-course-result';
    const courseTeacher = environment.authenticatedContext('course-teacher').database();
    const student = environment.authenticatedContext('student').database();
    await assertFails(courseTeacher.ref(resultPath).get());
    await environment.withSecurityRulesDisabled(async (worker) => {
      await worker.database().ref('thcs_result_audio/retained-course-result').set({
        studentId: 'student', testId: 'thcs-old', versionId: 'version-old', teacherId: 'course-teacher', courseId: 'course-one',
      });
    });
    await assertSucceeds(courseTeacher.ref(resultPath).get());
    await assertSucceeds(student.ref(resultPath).get());
    await assertFails(database.ref(resultPath).get());
    await assertFails(environment.authenticatedContext('other-student').database().ref(resultPath).get());
    for (const isPublic of [false, true]) {
      const path = `tests/thcs-${isPublic}`;
      const legacy = { ownerId: 'teacher', testType: 'THCS-THPT', isPublic, sections: [{ id: 'section-one' }] };
      await assertFails(database.ref().update({
        [path]: { ...legacy, sections: [{ ...legacy.sections[0], externalAudio: audio }] },
      }));
      await assertSucceeds(database.ref(path).set(legacy));
      await assertFails(database.ref(`${path}/sections/0/externalAudio`).set(audio));
      await assertFails(database.ref(`${path}/externalAudioVersionId`).set('forged-version'));
      expect((await database.ref(path).get()).val()).toEqual(legacy);
      await environment.withSecurityRulesDisabled(async (worker) => {
        await worker.database().ref(path).set({ ...legacy, externalAudioVersionId: 'trusted-version',
          sections: [{ ...legacy.sections[0], externalAudio: audio }] });
      });
      await assertFails(database.ref().update({ [path]: legacy }));
      await assertFails(database.ref(path).remove());
      await assertFails(database.ref(`${path}/externalAudioVersionId`).remove());
      await assertFails(database.ref(`${path}/sections/0/externalAudio`).remove());
      await assertFails(environment.authenticatedContext('other-teacher').database().ref(`${path}/sections/0`).set(legacy.sections[0]));
    }
  } finally {
    await environment.cleanup();
  }
});
