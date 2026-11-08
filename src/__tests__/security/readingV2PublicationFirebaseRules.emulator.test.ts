import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readingV2Ids, type ReadingV2Document } from '../../types/readingV2.types';
import { createReadingV2CanonicalFixture } from '../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import { createReadingV2Repository } from '../../services/reading-v2/readingV2Repository.service';
import { publishReadingV2Material } from '../../services/reading-v2/readingV2PublishPipeline.service';
import { buildReadingV2FirebasePublishUpdates } from '../../services/reading-v2/readingV2FirebasePublishAdapter.service';
import { prepareReadingV2PublicationUpdates } from '../../services/reading-v2/readingV2PublicationGuard.service';
import { createReadingV2ManualAuthoringContext } from '../../services/reading-v2/readingV2AuthoringQuality.service';
import { removeReadingV2MasterComposition } from '../../services/reading-v2/readingV2TeacherComposition.service';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../../services/materialCatalog/testTypeConfig.service';

const ownerId = 'teacher-1';
const materialId = readingV2Ids.materialId('parent');
const at = '2026-11-06T00:00:00.000Z';
const document = (): ReadingV2Document => {
  const parts = ['sentence-completion', 'matching-headings', 'multiple-choice'].map((task) => createReadingV2CanonicalFixture(task as never));
  return {
    ...parts[0], title: 'Publication concurrency', sectionIds: parts.flatMap((part) => part.sectionIds),
    sections: Object.assign({}, ...parts.map((part) => part.sections)),
    stimuli: Object.assign({}, ...parts.map((part) => part.stimuli)),
    anchors: Object.assign({}, ...parts.map((part) => part.anchors)),
    taskGroups: Object.assign({}, ...parts.map((part) => part.taskGroups)),
    interactions: Object.assign({}, ...parts.map((part) => part.interactions)),
    optionSets: Object.assign({}, ...parts.map((part) => part.optionSets)),
  };
};
const plan = (version: string, base?: ReturnType<typeof publishReadingV2Material>, untyped = false) => publishReadingV2Material({
  repository: createReadingV2Repository(), materialId, ownerId, document: document(), publishedBy: ownerId,
  snapshotVersionId: readingV2Ids.snapshotVersionId(version), publishedAt: at, operationId: `operation-${version}`,
  authoringContext: createReadingV2ManualAuthoringContext(),
  expectedMaterialRevision: base?.metadata.materialRevision,
  expectedBases: base ? { generatedPassages: base.readingPassageExtraction!.passages.map((child) => ({
    sectionId: child.sectionId, materialId: child.material.passageMaterialId,
    materialRevision: child.material.materialRevision, snapshotVersionId: child.material.currentSnapshotVersionId,
  })) } : undefined,
  metadata: { title: 'Publication concurrency', materialKind: 'full-test',
    ...(untyped ? {} : { primaryTestTypeId: 'ielts' as never }),
    testTypeIds: untyped ? [] : ['ielts' as never], testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES, visibility: 'private' },
});
let env: RulesTestEnvironment;
const db = () => env.authenticatedContext(ownerId).database();
const read = async (path: string) => (await db().ref(path).once('value')).val();
const capture = async (result: ReturnType<typeof plan>) => prepareReadingV2PublicationUpdates(
  buildReadingV2FirebasePublishUpdates(result.commitPlan, at).updates, read,
);
const commit = async (result: ReturnType<typeof plan>) => db().ref().update(await capture(result));

describe('Reading V2 conditional publication with full application rules', () => {
  beforeAll(async () => {
    if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('A real RTDB emulator is required.');
    env = await initializeTestEnvironment({ projectId: 'demo-prd0048-publication-security', database: { rules: readFileSync('database.rules.json', 'utf8') } });
  });
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled((context) => context.database().ref('users').set({
      [ownerId]: { role: 'teacher' }, 'teacher-2': { role: 'teacher' }, 'student-1': { role: 'student' },
    }));
  });
  afterAll(async () => { await env?.cleanup(); });

  it('commits initial fanout and permits one of two publications from the same captured revision', async () => {
    const first = plan('v1');
    await commit(first);
    const [left, right] = [plan('v2-left', first), plan('v2-right', first)];
    const updates = await Promise.all([capture(left), capture(right)]);
    const outcomes = await Promise.allSettled(updates.map((request) => db().ref().update(request)));
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    const metadata = await read('reading_v2/material_metadata/parent');
    const composition = await read(`reading_v2/full_test_compositions/${metadata.compositionId}`);
    expect(metadata.materialRevision).toBe(2);
    expect(composition.materialRevision).toBe(2);
    expect(composition.publishedVersionId).toBe(metadata.publishedSnapshotVersionId);
    const losingVersion = metadata.publishedSnapshotVersionId === 'v2-left' ? 'v2-right' : 'v2-left';
    expect(await read(`reading_v2/full_test_composition_versions/${metadata.compositionId}/${losingVersion}`)).toBeNull();
  });

  it('commits a private custom-type publication with empty generated passage test types', async () => {
    const publication = plan('custom', undefined, true);
    const updates = await capture(publication);
    const duplicatePaths = Object.keys(updates).filter((path) => path.startsWith('reading_v2/duplicate_indexes/'));
    expect(duplicatePaths.length).toBeGreaterThan(0);
    expect(duplicatePaths.every((path) => JSON.stringify(updates[path]).includes('"testTypeIds":[]'))).toBe(true);
    await db().ref().update(updates);
    expect((await read(duplicatePaths[0]))?.state).toBe('published');
  });

  it('rejects metadata-only, row-only, same-head content and ancestor bypasses', async () => {
    const first = plan('v1');
    await commit(first);
    const metadata = await read('reading_v2/material_metadata/parent');
    const rowPath = `reading_v2/full_test_compositions/${metadata.compositionId}`;
    const row = await read(rowPath);
    const next = await capture(plan('v2', first));
    await assertFails(db().ref().update({ 'reading_v2/material_metadata/parent': next['reading_v2/material_metadata/parent'] }));
    await assertFails(db().ref().update({ [rowPath]: next[rowPath] }));
    await assertFails(db().ref('reading_v2/material_metadata/parent').set({ ...metadata, title: 'Forged same head' }));
    await assertFails(db().ref(rowPath).set({ ...row, title: 'Forged same head' }));
    await assertFails(db().ref(`${rowPath}/passageRefs`).set([]));
    await assertFails(db().ref('reading_v2/material_metadata').set({ parent: { ...metadata, ownerId: 'teacher-2' } }));
    await assertFails(db().ref('reading_v2').remove());
    await assertFails(env.authenticatedContext('teacher-2').database().ref('reading_v2/material_metadata/parent/ownerId').set('teacher-2'));
    await assertFails(env.authenticatedContext('student-1').database().ref('reading_v2/material_metadata/parent').set(metadata));
  });

  it('rejects publication versus actual master-removal fanout in both write orders', async () => {
    const first = plan('v1');
    await commit(first);
    const publication = await capture(plan('v2', first));
    let removal: Readonly<Record<string, unknown | null>> = {};
    await removeReadingV2MasterComposition({
      actorUserId: ownerId, actorRole: 'teacher', composition: first.readingPassageExtraction!.composition,
      repository: { read, write: async () => { throw new Error('Sequential writes are forbidden.'); },
        remove: async () => { throw new Error('Sequential deletes are forbidden.'); }, update: async (request) => { removal = request; } },
      now: at, correlationId: 'remove-parent', sourceFeatureId: 'readingV2Studio', sourceRoute: '/teacher/reading-v2',
    });
    await db().ref().update(publication);
    await assertFails(db().ref().update(removal));
    expect((await read('reading_v2/material_metadata/parent')).state).toBe('published');
    await env.clearDatabase();
    await env.withSecurityRulesDisabled((context) => context.database().ref(`users/${ownerId}`).set({ role: 'teacher' }));
    await commit(first);
    await db().ref().update(removal);
    await assertFails(db().ref().update(publication));
    expect((await read('reading_v2/material_metadata/parent')).state).toBe('removed');
  });

  it('rejects an extracting parent after an independent generated-passage publication', async () => {
    const first = plan('v1');
    await commit(first);
    const staleParent = await capture(plan('v2', first));
    const child = first.readingPassageExtraction!.passages[0];
    const revisedChild = publishReadingV2Material({
      repository: createReadingV2Repository(), materialId: readingV2Ids.materialId(child.material.passageMaterialId),
      ownerId, document: child.document, publishedBy: ownerId,
      snapshotVersionId: readingV2Ids.snapshotVersionId('child-independent'), publishedAt: at,
      expectedMaterialRevision: child.material.materialRevision, operationId: 'child-independent-operation',
      authoringContext: createReadingV2ManualAuthoringContext(),
      metadata: { materialKind: 'reading-passage', title: child.material.title, visibility: 'private',
        primaryTestTypeId: 'ielts' as never, testTypeIds: ['ielts' as never], testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES },
    });
    await commit(revisedChild);
    await assertFails(db().ref().update(staleParent));
    expect((await read('reading_v2/material_metadata/parent')).publishedSnapshotVersionId).toBe('v1');
    expect((await read(`reading_v2/material_metadata/${child.material.passageMaterialId}`)).publishedSnapshotVersionId).toBe('child-independent');
  });
});
