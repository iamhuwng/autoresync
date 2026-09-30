import { get, ref, update } from 'firebase/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readingV2Ids, type ReadingV2Document } from '../../types/readingV2.types';
import { materialCatalogIds } from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../materialCatalog/testTypeConfig.service';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { createReadingV2PassageLibraryFirebaseReader, listTeacherReadingPassages } from './readingV2PassageLibrary.service';
import {
  buildReadingV2FirebasePublishUpdates,
  commitReadingV2PublishPlanToFirebase,
} from './readingV2FirebasePublishAdapter.service';
import { publishReadingV2Material } from './readingV2PublishPipeline.service';
import { createReadingV2Repository } from './readingV2Repository.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

const firebaseDatabaseMocks = vi.hoisted(() => ({
  get: vi.fn(),
  ref: vi.fn((_database: unknown, path?: string) => ({ path: path ?? '' })),
  update: vi.fn(),
}));

vi.mock('firebase/database', () => firebaseDatabaseMocks);
vi.mock('../firebase', () => ({
  database: { name: 'mock-database' },
}));

const fixtureDocument = (): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES['sentence-completion']) as ReadingV2Document;

const createPublishPlan = () => {
  const repository = createReadingV2Repository();
  const materialId = readingV2Ids.materialId('material-firebase');
  const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-firebase');

  return publishReadingV2Material({
    repository,
    materialId,
    ownerId: 'teacher-1',
    document: fixtureDocument(),
    publishedBy: 'teacher-1',
    snapshotVersionId,
    publishedAt: '2026-04-25T00:00:00.000Z',
    sessionCodeForProjection: 'LIVE123',
    passageAssetUses: [
      {
        passageAssetId: readingV2Ids.passageAssetId('asset-firebase'),
        consumerKind: 'task-group-material',
      },
    ],
    returnContext: 'teacher-lobby',
  }).commitPlan;
};

const createPassagePublishPlan = () => {
  const repository = createReadingV2Repository();
  const document = fixtureDocument();
  const sectionId = document.sectionIds[0];
  const materialId = readingV2Ids.materialId('material-firebase-passages');
  const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-firebase-passages');

  return publishReadingV2Material({
    repository,
    materialId,
    ownerId: 'teacher-1',
    document: {
      ...document,
      title: 'Firebase Passage Publish',
      sections: {
        ...document.sections,
        [sectionId]: {
          ...document.sections[sectionId],
          title: 'Reading Passage 1',
        },
      },
      interactions: Object.fromEntries(
        Object.entries(document.interactions).map(([interactionId, interaction], index) => [
          interactionId,
          {
            ...interaction,
            reviewLabel: {
              ...interaction.reviewLabel,
              displayNumber: index === 0 ? 1 : 13,
            },
          },
        ]),
      ),
    },
    publishedBy: 'teacher-1',
    snapshotVersionId,
    publishedAt: '2026-06-01T00:00:00.000Z',
    metadata: {
      title: 'Firebase Passage Publish',
      materialKind: 'reading-v2-full-test-composition',
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      visibility: 'public' as any,
    },
    readingPassageExtraction: {
      sourceFullTestId: readingV2Ids.fullTestId('full-test-firebase-passages'),
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      visibility: 'public',
    },
  }).commitPlan;
};

const createThreePassagePublishPlan = () => {
  const documents = [
    createReadingV2CanonicalFixture('sentence-completion'),
    createReadingV2CanonicalFixture('true-false-not-given'),
    createReadingV2CanonicalFixture('table-completion'),
  ].map((document, index) => ({
    ...document,
    sections: Object.fromEntries(Object.entries(document.sections).map(([id, section]) => [
      id, { ...section, title: `Reading Passage ${index + 1}` },
    ])),
  }));
  const first = documents[0];
  const document: ReadingV2Document = {
    ...first,
    title: 'Three Passage Full Test',
    sectionIds: documents.flatMap((entry) => entry.sectionIds),
    sections: Object.assign({}, ...documents.map((entry) => entry.sections)),
    stimuli: Object.assign({}, ...documents.map((entry) => entry.stimuli)),
    anchors: Object.assign({}, ...documents.map((entry) => entry.anchors)),
    taskGroups: Object.assign({}, ...documents.map((entry) => entry.taskGroups)),
    interactions: Object.assign({}, ...documents.map((entry) => entry.interactions)),
    optionSets: Object.assign({}, ...documents.map((entry) => entry.optionSets)),
    validationState: { issues: [] },
  };
  return publishReadingV2Material({
    repository: createReadingV2Repository(),
    materialId: readingV2Ids.materialId('three-passage-master'),
    ownerId: 'teacher-1',
    document,
    publishedBy: 'teacher-1',
    snapshotVersionId: readingV2Ids.snapshotVersionId('three-passage-snapshot'),
    publishedAt: '2026-06-01T00:00:00.000Z',
    metadata: {
      title: document.title,
      materialKind: 'reading-v2-full-test-composition',
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      visibility: 'public' as any,
    },
    readingPassageExtraction: {
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      visibility: 'public',
    },
  }).commitPlan;
};

const databaseSnapshot = (
  exists: boolean,
  value: unknown,
): Awaited<ReturnType<typeof get>> => ({
  exists: () => exists,
  val: () => value,
}) as Awaited<ReturnType<typeof get>>;

const containsUndefined = (value: unknown): boolean => {
  if (value === undefined) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(containsUndefined);
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(containsUndefined);
  }

  return false;
};

describe('readingV2FirebasePublishAdapter.service', () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
    vi.mocked(ref).mockClear();
    vi.mocked(update).mockReset();
  });

  it('maps a publish commit plan into one namespaced RTDB multi-location update', () => {
    const commitPlan = createPublishPlan();
    const firebaseUpdates = buildReadingV2FirebasePublishUpdates(
      commitPlan,
      '2026-04-25T01:00:00.000Z',
    );
    const updatePaths = Object.keys(firebaseUpdates.updates);

    expect(firebaseUpdates.commitPath).toBe(
      readingV2StoragePaths.publishCommits('material-firebase', 'snapshot-firebase'),
    );
    expect(updatePaths.filter((path) => !path.startsWith('reading_v2/'))).toEqual(
      expect.arrayContaining([
        'tests/material-firebase',
        'material_catalog/material_summary_indexes/v1/by_id/material-firebase',
        'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/material-firebase',
        'material_catalog/material_summary_indexes/v1/by_visibility/private/material-firebase',
        'material_catalog/material_summary_indexes/v1/by_material_kind/full-test/material-firebase',
      ]),
    );
    expect(updatePaths).toEqual(
      expect.arrayContaining([
        'tests/material-firebase',
        readingV2StoragePaths.publishedSnapshots('material-firebase', 'snapshot-firebase'),
        readingV2StoragePaths.studentSafeTests('material-firebase', 'snapshot-firebase'),
        readingV2StoragePaths.sessionSafePayloads('LIVE123', 'snapshot-firebase'),
        readingV2StoragePaths.reviewProjections('material-firebase', 'snapshot-firebase'),
        readingV2StoragePaths.analyticsOutputs('material-firebase', 'snapshot-firebase'),
        readingV2StoragePaths.materialMetadata('material-firebase'),
        readingV2StoragePaths.relationshipIndexes('teacher-lobby', 'material-firebase'),
        readingV2StoragePaths.whereUsedGraph('asset-firebase'),
        readingV2StoragePaths.publishCommits('material-firebase', 'snapshot-firebase'),
      ]),
    );
    expect(updatePaths.some((path) => path.includes('/attempts/'))).toBe(false);
    expect(updatePaths.some((path) => path.includes('/results/'))).toBe(false);
    expect(firebaseUpdates.updates['tests/material-firebase']).toMatchObject({
      id: 'material-firebase',
      materialId: 'material-firebase',
      ownerId: 'teacher-1',
      deliveryEngine: 'reading-v2',
      runtimeEngine: 'reading-v2',
      title: 'Canonical fixture sentence-completion',
      testType: 'IELTS',
      skill: 'Reading',
      skillType: 'reading-v2',
      questionCount: 2,
      hasStudentSafeProjection: true,
      deliveryProjectionReady: true,
      studentSafeProjectionReady: true,
      passageRefCount: 1,
    });
    expect(firebaseUpdates.updates['tests/material-firebase']).toMatchObject({
      testTypeIds: [],
      metadata: expect.objectContaining({
        testTypeIds: [],
        hasStudentSafeProjection: true,
        deliveryProjectionReady: true,
        studentSafeProjectionReady: true,
        passageRefCount: 1,
      }),
    });
    expect(
      firebaseUpdates.updates[
        'material_catalog/material_summary_indexes/v1/by_id/material-firebase'
      ],
    ).toMatchObject({
      materialId: 'material-firebase',
      producerId: 'reading-v2-full-test',
      questionCount: 2,
      sourceSnapshotVersionId: 'snapshot-firebase',
      hasStudentSafeProjection: true,
      deliveryProjectionReady: true,
      studentSafeProjectionReady: true,
      passageRefCount: 1,
    });
    expect(firebaseUpdates.updates[readingV2StoragePaths.relationshipIndexes('solo-launch', 'material-firebase')])
      .toMatchObject({
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        materialId: 'material-firebase',
        source: 'student-safe-projection',
        surface: 'solo-launch',
      });
    expect(firebaseUpdates.updates[readingV2StoragePaths.whereUsedGraph('asset-firebase')]).toMatchObject({
      ownerId: 'teacher-1',
      passageAssetId: 'asset-firebase',
      entries: {
        'task-group-material:material-firebase': expect.objectContaining({
          consumerId: 'material-firebase',
          consumerKind: 'task-group-material',
        }),
      },
    });
    expect(firebaseUpdates.updates[firebaseUpdates.commitPath]).toMatchObject({
      commitKey: 'material-firebase/snapshot-firebase',
      ownerId: 'teacher-1',
      operationKeys: commitPlan.operations.map((operation) => operation.operationKey),
    });
    expect(containsUndefined(firebaseUpdates.updates)).toBe(false);
  });

  it('commits the whole publish plan with one root update when no marker exists', async () => {
    const commitPlan = createPublishPlan();

    const result = await commitReadingV2PublishPlanToFirebase(commitPlan, {
      committedAt: '2026-04-25T01:00:00.000Z',
    });

    expect(result.status).toBe('committed');
    expect(ref).toHaveBeenCalledWith(expect.anything());
    expect(get).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      { path: '' },
      expect.objectContaining({
        [readingV2StoragePaths.publishCommits('material-firebase', 'snapshot-firebase')]: expect.objectContaining({
          ownerId: 'teacher-1',
        }),
      }),
    );
  });

  it('maps Reading Passage publish operations to canonical, projection, composition, and listing-index paths', () => {
    const commitPlan = createPassagePublishPlan();
    const firebaseUpdates = buildReadingV2FirebasePublishUpdates(
      commitPlan,
      '2026-06-01T01:00:00.000Z',
    );
    const updatePaths = Object.keys(firebaseUpdates.updates);
    const passageId = 'material-firebase-passages-passage-1';
    const compositionOperation = commitPlan.operations.find(
      (operation) =>
        operation.kind === 'storage-write' &&
        operation.writeKind === 'full-test-composition',
    );

    expect(compositionOperation).toBeTruthy();
    expect(firebaseUpdates.updates['tests/material-firebase-passages']).toMatchObject({
      compositionId: 'composition-material-firebase-passages-snapshot-firebase-passages',
      testType: 'IELTS',
      type: 'IELTS',
      primaryTestTypeId: 'ielts',
      testTypeIds: ['ielts'],
      isPublic: true,
      metadata: expect.objectContaining({
        compositionId: 'composition-material-firebase-passages-snapshot-firebase-passages',
        primaryTestTypeId: 'ielts',
        testTypeIds: ['ielts'],
        visibility: 'public',
      }),
    });
    expect(updatePaths).toEqual(
      expect.arrayContaining([
        readingV2StoragePaths.readingPassageMaterials(passageId),
        readingV2StoragePaths.readingPassageMaterialVersions(passageId, 'snapshot-firebase-passages'),
        readingV2StoragePaths.studentSafeTests(passageId, 'snapshot-firebase-passages'),
        readingV2StoragePaths.reviewProjections(passageId, 'snapshot-firebase-passages'),
        readingV2StoragePaths.materialMetadata(passageId),
        readingV2StoragePaths.studentSafeTests('material-firebase-passages', 'snapshot-firebase-passages'),
        readingV2StoragePaths.sessionSafePayloads('publish-template', 'snapshot-firebase-passages'),
        readingV2StoragePaths.reviewProjections('material-firebase-passages', 'snapshot-firebase-passages'),
        'reading_v2/duplicate_indexes/passages_by_owner/teacher-1/material-firebase-passages-passage-1',
        'material_catalog/material_indexes/by_owner/teacher-1/material-firebase-passages-passage-1',
        'material_catalog/material_indexes/by_visibility/public/material-firebase-passages-passage-1',
        'material_catalog/material_indexes/by_material_kind/reading-passage/material-firebase-passages-passage-1',
        'material_catalog/material_indexes/by_test_type/ielts/material-firebase-passages-passage-1',
      ]),
    );
    expect(updatePaths).not.toContain(
      readingV2StoragePaths.publishedSnapshots('material-firebase-passages', 'snapshot-firebase-passages'),
    );
    expect(updatePaths).toContain(compositionOperation!.path);
    expect(firebaseUpdates.updates[readingV2StoragePaths.readingPassageMaterials(passageId)]).toMatchObject({
      passageMaterialId: passageId,
      sourceQuestionRange: '1-13',
      sourceOrder: {
        displaySnapshot: 'Passage 1',
      },
    });
    expect(firebaseUpdates.updates[
      `material_catalog/material_summary_indexes/v1/by_id/${passageId}`
    ]).toMatchObject({
      materialId: passageId,
      producerId: 'reading-v2-passage',
      materialKind: 'reading-passage',
      visibility: 'public',
    });
    expect(JSON.stringify(firebaseUpdates.updates[readingV2StoragePaths.studentSafeTests(passageId, 'snapshot-firebase-passages')]))
      .not.toMatch(/acceptableAnswers|scoringRule|hiddenProvenance|teacherAdminProvenance/);
    expect(JSON.stringify(firebaseUpdates.updates[readingV2StoragePaths.studentSafeTests('material-firebase-passages', 'snapshot-firebase-passages')]))
      .not.toMatch(/acceptableAnswers|scoringRule|hiddenProvenance|teacherAdminProvenance/);
    expect(JSON.stringify(firebaseUpdates.updates['reading_v2/duplicate_indexes/passages_by_owner/teacher-1/material-firebase-passages-passage-1']))
      .not.toMatch(/bodyText|questionText|document|answerKey|scoringRule|hiddenProvenance/);
    expect(JSON.stringify(firebaseUpdates.updates['material_catalog/material_indexes/by_owner/teacher-1/material-firebase-passages-passage-1']))
      .not.toMatch(/acceptableAnswers|scoringRule|document|provenance/);
    expect(containsUndefined(firebaseUpdates.updates)).toBe(false);
  });

  it('mirrors legacy material-index cleanup into universal summary cleanup', () => {
    const commitPlan = createPassagePublishPlan();
    const firebaseUpdates = buildReadingV2FirebasePublishUpdates({
      ...commitPlan,
      operations: [
        ...commitPlan.operations,
        {
          kind: 'storage-write',
          operationKey: 'material-firebase-passages/cleanup/owner',
          path: 'material_catalog/material_indexes/by_owner/old-teacher/material-firebase-passages-passage-1',
          value: null,
          writeKind: 'reading-passage-listing-index',
        },
        {
          kind: 'storage-write',
          operationKey: 'material-firebase-passages/cleanup/source',
          path: 'material_catalog/material_indexes/by_source_full_test/old-full-test/material-firebase-passages-passage-1',
          value: null,
          writeKind: 'reading-passage-listing-index',
        },
      ],
    }, '2026-06-01T01:00:00.000Z');

    expect(firebaseUpdates.updates[
      'material_catalog/material_summary_indexes/v1/by_owner/old-teacher/material-firebase-passages-passage-1'
    ]).toBeNull();
    expect(firebaseUpdates.updates[
      'material_catalog/material_summary_indexes/v1/by_source_full_test/old-full-test/material-firebase-passages-passage-1'
    ]).toBeUndefined();
  });

  it('publishes three child summaries that the Reading Passage library discovers', async () => {
    const plan = createThreePassagePublishPlan();
    const updates = buildReadingV2FirebasePublishUpdates(plan).updates;
    const childIds = [1, 2, 3].map((number) => `three-passage-master-passage-${number}`);
    const summaryRoot = 'material_catalog/material_summary_indexes/v1';
    expect(updates[`${summaryRoot}/by_id/three-passage-master`]).toMatchObject({
      producerId: 'reading-v2-full-test', materialKind: 'full-test', passageRefCount: 3,
    });
    for (const id of childIds) {
      expect(updates[readingV2StoragePaths.readingPassageMaterials(id)]).toMatchObject({ passageMaterialId: id });
      const summary = updates[`${summaryRoot}/by_id/${id}`];
      expect(summary).toMatchObject({
        schemaVersion: 1, materialId: id, producerId: 'reading-v2-passage',
        materialKind: 'reading-passage', ownerId: 'teacher-1', visibility: 'public',
        lifecycleState: 'active', testTypeMembership: { ielts: true },
        sourceSnapshotVersionId: 'three-passage-snapshot', questionCount: 2,
      });
      expect(updates[`${summaryRoot}/by_owner/teacher-1/${id}`]).toEqual(summary);
      expect(updates[`${summaryRoot}/by_visibility/public/${id}`]).toEqual(summary);
      expect(updates[`${summaryRoot}/by_material_kind/reading-passage/${id}`]).toEqual(summary);
      expect(updates[`${summaryRoot}/by_test_type/ielts/${id}`]).toEqual(summary);
      expect(updates[readingV2StoragePaths.materialMetadata(id)]).toMatchObject({ materialId: id });
      expect(updates[readingV2StoragePaths.studentSafeTests(id, 'three-passage-snapshot')]).toBeTruthy();
    }
    vi.mocked(get).mockImplementation(async (reference: any) => {
      const path = reference.path as string;
      const value = updates[path] ?? Object.fromEntries(
        Object.entries(updates)
          .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
          .map(([key, entry]) => [key.slice(path.length + 1), entry]),
      );
      return databaseSnapshot(value !== null && Object.keys(value as object).length > 0, value);
    });
    const rows = await listTeacherReadingPassages({
      teacherId: 'teacher-1', scope: 'public',
      reader: createReadingV2PassageLibraryFirebaseReader(),
    });
    expect(rows.map((row) => row.materialId).sort()).toEqual(childIds);
    vi.mocked(update).mockReset();
    await commitReadingV2PublishPlanToFirebase(plan);
    expect(update).toHaveBeenCalledOnce();
    expect(ref).toHaveBeenCalledWith(expect.anything());
  });

  it('treats an existing matching commit marker as an idempotent retry', async () => {
    const commitPlan = createPublishPlan();
    const operationKeys = commitPlan.operations.map((operation) => operation.operationKey);
    vi.mocked(update).mockRejectedValue(new Error('permission_denied'));
    vi.mocked(get).mockResolvedValue(databaseSnapshot(true, { operationKeys }));

    const result = await commitReadingV2PublishPlanToFirebase(commitPlan);

    expect(result.status).toBe('already-committed');
    expect(update).toHaveBeenCalledTimes(1);
    expect(ref).toHaveBeenCalledWith(expect.anything(), result.commitPath);
  });

  it('rejects failed Reading Passage storage writes when no matching commit marker exists', async () => {
    const commitPlan = createPassagePublishPlan();
    const firebaseUpdates = buildReadingV2FirebasePublishUpdates(commitPlan);
    vi.mocked(update).mockRejectedValue(new Error('permission_denied'));
    vi.mocked(get).mockResolvedValue(databaseSnapshot(false, null));

    await expect(commitReadingV2PublishPlanToFirebase(commitPlan)).rejects.toThrow(/permission_denied/);

    expect(update).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledOnce();
    expect(ref).toHaveBeenCalledWith(expect.anything(), firebaseUpdates.commitPath);
  });

  it('rejects a conflicting commit marker after a failed retry write', async () => {
    const commitPlan = createPublishPlan();
    vi.mocked(update).mockRejectedValue(new Error('permission_denied'));
    vi.mocked(get).mockResolvedValue(databaseSnapshot(true, { operationKeys: ['different-operation'] }));

    await expect(commitReadingV2PublishPlanToFirebase(commitPlan)).rejects.toThrow(/commit marker conflicts/);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
