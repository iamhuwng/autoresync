import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, ref } from 'firebase/database';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { readingV2Ids } from '../../types/readingV2.types';
import { createReadingV2Repository } from './readingV2Repository.service';
import { publishReadingV2Material } from './readingV2PublishPipeline.service';
import { readingV2AuthoringRecoveryRecordId } from './readingV2PublicationRecovery.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import {
  createReadingV2TeacherSelectedPassageComposition,
  publishReadingV2TeacherSelectedPassageCompositionEdit,
} from './readingV2TeacherComposition.service';
import { loadReadingV2PublishedRevisionSource } from './readingV2StudioFirebaseHydration.service';

vi.mock('firebase/database', () => ({
  get: vi.fn(),
  ref: vi.fn((_database, path) => path),
}));

vi.mock('../firebase', () => ({
  database: {},
}));

describe('readingV2StudioFirebaseHydration.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses unambiguous, path-safe recovery keys', () => {
    const key = (material: string, version: string) => readingV2AuthoringRecoveryRecordId(
      readingV2Ids.materialId(material), readingV2Ids.snapshotVersionId(version),
    );
    expect(key('a-b', 'c')).not.toBe(key('a', 'b-c'));
    expect(() => key('a.b', 'v/1')).toThrow(/key components/);
    expect(() => key('a:b', 'v1')).toThrow(/key components/);
  });

  it('loads material metadata and the referenced canonical published snapshot', async () => {
    const document = {
      ...createReadingV2CanonicalFixture('sentence-completion'),
      title: 'Live published title',
    } as any;
    delete document.validationState;
    Object.values(document.taskGroups).forEach((taskGroup: any) => {
      delete taskGroup.optionSetRefs;
      delete taskGroup.validationState;
    });

    vi.mocked(get).mockImplementation(async (target: any) => {
      const valueByPath: Record<string, unknown> = {
        'reading_v2/material_metadata/material-v2': {
          materialId: 'material-v2',
          ownerId: 'teacher-1',
          deliveryEngine: READING_V2_ENGINE,
          productLabel: 'Reading V2',
          title: 'Live published title',
          materialKind: 'full-test',
          durationMinutes: 60,
          difficulty: 'intermediate',
          targetBand: 'Band 6-7',
          description: '',
          tags: [],
          visibility: 'private',
          publishedSnapshotVersionId: 'snapshot-live',
          updatedAt: '2026-04-29T00:00:00.000Z',
          relationshipSurfaces: ['teacher-lobby'],
        },
        'reading_v2/published_snapshots/material-v2/snapshot-live': {
          snapshotVersionId: 'snapshot-live',
          materialId: 'material-v2',
          ownerId: 'teacher-1',
          document,
          publishedAt: '2026-04-29T00:00:00.000Z',
          publishedBy: 'teacher-1',
        },
      };
      const value = valueByPath[target];

      return {
        exists: () => value !== undefined,
        val: () => value,
      } as any;
    });

    const source = await loadReadingV2PublishedRevisionSource('material-v2');

    expect(source.status).toBe('loaded');
    expect(source.snapshot?.document.title).toBe('Live published title');
    expect(source.snapshot?.document.validationState.issues).toEqual([]);
    expect(Object.values(source.snapshot?.document.taskGroups ?? {})[0]?.optionSetRefs).toEqual([]);
    expect(ref).toHaveBeenCalledWith({}, 'reading_v2/material_metadata/material-v2');
    expect(ref).toHaveBeenCalledWith({}, 'reading_v2/published_snapshots/material-v2/snapshot-live');
  });

  it('restores an omitted interaction review label from a Firebase-loaded published snapshot', async () => {
    const document = createReadingV2CanonicalFixture('sentence-completion') as any;
    const [interactionId, interaction] = Object.entries(document.interactions)[0] as [string, any];
    delete interaction.reviewLabel;

    vi.mocked(get).mockImplementation(async (target: string) => {
      const value = target === 'reading_v2/material_metadata/material-v2'
        ? { materialId: 'material-v2', ownerId: 'teacher-1', title: 'Published title', publishedSnapshotVersionId: 'snapshot-live' }
        : {
            snapshotVersionId: 'snapshot-live',
            materialId: 'material-v2',
            ownerId: 'teacher-1',
            document,
            publishedAt: '2026-04-29T00:00:00.000Z',
            publishedBy: 'teacher-1',
          };

      return { exists: () => true, val: () => value } as any;
    });

    const source = await loadReadingV2PublishedRevisionSource('material-v2');

    expect(source.status).toBe('loaded');
    expect(source.snapshot?.document.interactions[interactionId].reviewLabel).toEqual({});
  });

  it('fails closed when metadata does not point to a published snapshot version', async () => {
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        materialId: 'material-v2',
        ownerId: 'teacher-1',
        title: 'Missing version',
      }),
    } as any);

    const source = await loadReadingV2PublishedRevisionSource('material-v2');

    expect(source.status).toBe('missing-snapshot-version');
  });

  it.each([
    ['composition-first full test', 'full-test', true],
    ['standalone passage', 'reading-passage', false],
    ['direct full-test snapshot', 'full-test', false],
  ] as const)('reopens exact v1/v2 planner writes for %s', async (_label, materialKind, extract) => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId(`material-${materialKind}-${extract}`);
    const records: Record<string, unknown> = {};
    const generatedPassageIds: string[] = [];
    const documents = ['First version', 'Second version'].map((title) => ({
      ...createReadingV2CanonicalFixture('sentence-completion'), title,
    }));
    for (const [index, document] of documents.entries()) {
      const snapshotVersionId = readingV2Ids.snapshotVersionId(`snapshot-v${index + 1}`);
      const result = publishReadingV2Material({
        repository, materialId, ownerId: 'teacher-1', document, publishedBy: 'teacher-1',
        snapshotVersionId, publishedAt: `2026-06-0${index + 1}T00:00:00.000Z`,
        ...(extract ? {} : { skipReadingPassageExtraction: true }),
        metadata: { title: document.title, materialKind, visibility: 'private' },
        authoringMetadata: { title: document.title, materialKind, visibility: 'private', provenanceSummary: 'teacher source' },
        authoringContext: {
          origin: { kind: 'import', sourceId: 'source-once' },
          scope: { kind: 'supplied', requirementIds: [] },
          requirements: [], interpretations: [], unboundTargets: [],
        },
        workflowOrigin: { mode: 'revise-published', sourceMaterialId: materialId, sourceSnapshotVersionId: snapshotVersionId },
      });
      generatedPassageIds.push(result.readingPassageExtraction?.passages[0]?.material.passageMaterialId ?? '');
      for (const operation of result.commitPlan.operations) {
        if (operation.kind === 'storage-write') records[operation.path] = operation.value;
        if (operation.kind === 'published-snapshot') {
          records[`reading_v2/published_snapshots/${materialId}/${snapshotVersionId}`] = operation.snapshot;
        }
        if (operation.kind === 'material-metadata') records[`reading_v2/material_metadata/${materialId}`] = operation.metadata;
      }
    }
    let denyMissingParentSnapshot = extract;
    vi.mocked(get).mockImplementation(async (path: string) => {
      if (denyMissingParentSnapshot && path.startsWith(`reading_v2/published_snapshots/${materialId}/`)) {
        throw new Error('Permission denied');
      }
      return { exists: () => records[path] !== undefined, val: () => records[path] } as any;
    });

    for (const [index, document] of documents.entries()) {
      const source = await loadReadingV2PublishedRevisionSource(materialId, {
        ownerId: 'teacher-1', role: 'teacher', snapshotVersionId: `snapshot-v${index + 1}`,
      });
      expect(source.status).toBe('loaded');
      expect(source.snapshot?.document).toEqual(document);
      expect(source.snapshot?.snapshotVersionId).toBe(`snapshot-v${index + 1}`);
      expect(source.authoringMetadata).toMatchObject({ title: document.title, provenanceSummary: 'teacher source' });
      expect(source.authoringContext?.origin).toEqual({ kind: 'import', sourceId: 'source-once' });
      expect(source.recovery?.authoring.sourceRefs).toEqual([{ sourceId: 'source-once' }]);
      expect(source.workflowOrigin).toMatchObject({ mode: 'revise-published', sourceSnapshotVersionId: `snapshot-v${index + 1}` });
      expect(source.workflowOrigin?.publicationBase).toMatchObject({ snapshotVersionId: 'snapshot-v2' });
      expect(source.workflowOrigin?.publicationBase?.materialRevision).toBeGreaterThanOrEqual(1);
      if (extract) {
        expect(source.workflowOrigin?.publicationBase?.generatedPassages).toEqual([
          expect.objectContaining({
            sectionId: document.sectionIds[0], snapshotVersionId: 'snapshot-v2',
            materialId: generatedPassageIds[1],
          }),
        ]);
      }
      expect(source.recovery?.locator.kind).toBe(extract ? 'inline' : 'published-snapshot');
    }
    if (extract) {
      expect(records[`reading_v2/published_snapshots/${materialId}/snapshot-v1`]).toBeUndefined();
      expect(records[`reading_v2/published_snapshots/${materialId}/snapshot-v2`]).toBeUndefined();
      expect(vi.mocked(get).mock.calls.some(([path]) => String(path).startsWith(`reading_v2/published_snapshots/${materialId}/`))).toBe(false);
      denyMissingParentSnapshot = false;
      vi.mocked(get).mockClear();
      expect((await loadReadingV2PublishedRevisionSource(materialId)).status).toBe('missing-snapshot');
      expect(vi.mocked(get).mock.calls.some(([path]) => String(path).includes('/provenance/'))).toBe(false);
    }
    if (extract) {
      for (const [index, passageId] of generatedPassageIds.entries()) {
        const passage = await loadReadingV2PublishedRevisionSource(passageId, {
          ownerId: 'teacher-1', role: 'teacher', snapshotVersionId: `snapshot-v${index + 1}`,
        });
        expect(passage.status).toBe('loaded');
        expect(passage.snapshot?.materialId).toBe(passageId);
        expect(passage.recovery?.locator.kind).toBe('published-snapshot');
      }
    }
  });

  it('reopens pinned v1/v2 assembled snapshots from the selected-passage publisher', async () => {
    const sourceSnapshot = {
      materialId: readingV2Ids.materialId('passage-source'),
      snapshotVersionId: readingV2Ids.snapshotVersionId('passage-v1'),
      ownerId: 'teacher-1', document: createReadingV2CanonicalFixture('sentence-completion'),
      publishedAt: '2026-06-01T00:00:00.000Z', publishedBy: 'teacher-1',
    };
    const records: Record<string, unknown> = {
      'reading_v2/published_snapshots/passage-source/passage-v1': sourceSnapshot,
    };
    const repository = {
      read: async (path: string) => records[path],
      update: async (updates: Record<string, unknown>) => { Object.assign(records, updates); },
    };
    const passages = [{
      materialId: 'passage-source', title: 'Source passage', questionCount: 2,
      durationMinutes: 15, publishedSnapshotVersionId: 'passage-v1',
      testTypeIds: ['ielts'], visibility: 'private',
    }];
    const first = await createReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1', passages, repository, now: '2026-06-02T00:00:00.000Z',
    });
    const second = await publishReadingV2TeacherSelectedPassageCompositionEdit({
      teacherId: 'teacher-1', composition: first.composition, passages, repository,
      now: '2026-06-03T00:00:00.000Z', metadata: { title: 'Edited selected passages' },
    });
    vi.mocked(get).mockImplementation(async (path: string) => ({
      exists: () => records[path] !== undefined, val: () => records[path],
    } as any));
    for (const composition of [first.composition, second.composition]) {
      const source = await loadReadingV2PublishedRevisionSource(composition.testMaterialId, {
        ownerId: 'teacher-1', role: 'teacher', snapshotVersionId: composition.publishedVersionId,
      });
      expect(source.status).toBe('loaded');
      expect(source.snapshot?.snapshotVersionId).toBe(composition.publishedVersionId);
      expect(source.snapshot?.document.sectionIds).toContain('passage-1:section-sentence-completion');
      expect(source.recovery?.locator.kind).toBe('published-snapshot');
      expect(source.workflowOrigin?.publicationBase?.snapshotVersionId).toBe(second.composition.publishedVersionId);
    }
  });

  it('rejects composition-first recovery bases that point at a different current child ref', async () => {
    const materialId = readingV2Ids.materialId('material-ref-integrity');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-ref-integrity');
    const result = publishReadingV2Material({
      repository: createReadingV2Repository(), materialId, ownerId: 'teacher-1',
      document: createReadingV2CanonicalFixture('sentence-completion'), publishedBy: 'teacher-1',
      snapshotVersionId, publishedAt: '2026-06-01T00:00:00.000Z',
      metadata: { title: 'Ref integrity', materialKind: 'full-test', visibility: 'private' },
    });
    const records: Record<string, unknown> = {};
    for (const operation of result.commitPlan.operations) {
      if (operation.kind === 'storage-write') records[operation.path] = structuredClone(operation.value);
      if (operation.kind === 'published-snapshot') {
        records[readingV2StoragePaths.publishedSnapshots(operation.snapshot.materialId, operation.snapshot.snapshotVersionId)] = operation.snapshot;
      }
      if (operation.kind === 'material-metadata') records[readingV2StoragePaths.materialMetadata(operation.metadata.materialId)] = operation.metadata;
    }
    const composition = result.readingPassageExtraction!.composition;
    records[readingV2StoragePaths.fullTestCompositions(composition.compositionId)] = composition;
    const recoveryPath = `reading_v2/provenance/${readingV2AuthoringRecoveryRecordId(materialId, snapshotVersionId)}`;
    const recovery = records[recoveryPath] as any;
    recovery.authoring.expectedBases.generatedPassages[0].snapshotVersionId = 'snapshot-other';
    vi.mocked(get).mockImplementation(async (path: string) => ({
      exists: () => records[path] !== undefined, val: () => records[path],
    } as any));

    const source = await loadReadingV2PublishedRevisionSource(materialId, {
      ownerId: 'teacher-1', role: 'teacher',
    });

    expect(source.status).toBe('invalid-snapshot');
    expect(source.message).toMatch(/do not match the current composition refs/);
  });

  it('rejects a recovery locator that points at a different version', async () => {
    const document = createReadingV2CanonicalFixture('sentence-completion');
    const records: Record<string, unknown> = {
      'reading_v2/material_metadata/material-v2': {
        materialId: 'material-v2', ownerId: 'teacher-1', title: 'Published', publishedSnapshotVersionId: 'snapshot-v2',
      },
      [`reading_v2/provenance/${readingV2AuthoringRecoveryRecordId(
        readingV2Ids.materialId('material-v2'), readingV2Ids.snapshotVersionId('snapshot-v2'),
      )}`]: {
        kind: 'authoring-recovery', schemaVersion: document.schemaVersion,
        recordId: readingV2AuthoringRecoveryRecordId(
          readingV2Ids.materialId('material-v2'), readingV2Ids.snapshotVersionId('snapshot-v2'),
        ), ownerId: 'teacher-1',
        materialId: 'material-v2', snapshotVersionId: 'snapshot-v2',
        createdAt: '2026-06-02', createdBy: 'teacher-1',
        authoring: { workflowOrigin: { mode: 'revise-published' }, metadata: {} },
        locator: { kind: 'published-snapshot', materialId: 'material-v2', snapshotVersionId: 'snapshot-v1' },
      },
    };
    vi.mocked(get).mockImplementation(async (path: string) => ({
      exists: () => records[path] !== undefined, val: () => records[path],
    } as any));
    const source = await loadReadingV2PublishedRevisionSource('material-v2', { ownerId: 'teacher-1', role: 'teacher' });
    expect(source.status).toBe('invalid-snapshot');
  });

  it('restores empty private authoring collections omitted by Firebase', async () => {
    const materialId = readingV2Ids.materialId('material-empty-context');
    const result = publishReadingV2Material({
      repository: createReadingV2Repository(), materialId, ownerId: 'teacher-1',
      document: createReadingV2CanonicalFixture('sentence-completion'), publishedBy: 'teacher-1',
      snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-v1'),
      skipReadingPassageExtraction: true,
      metadata: { title: 'Manual content', materialKind: 'full-test' },
      authoringContext: {
        origin: { kind: 'manual' }, scope: { kind: 'supplied', requirementIds: [] },
        requirements: [], interpretations: [], unboundTargets: [],
      },
    });
    const records: Record<string, unknown> = {};
    for (const operation of result.commitPlan.operations) {
      if (operation.kind === 'storage-write') records[operation.path] = structuredClone(operation.value);
      if (operation.kind === 'published-snapshot') {
        records[`reading_v2/published_snapshots/${materialId}/snapshot-v1`] = operation.snapshot;
      }
      if (operation.kind === 'material-metadata') records[`reading_v2/material_metadata/${materialId}`] = operation.metadata;
    }
    const recoveryPath = `reading_v2/provenance/${readingV2AuthoringRecoveryRecordId(materialId, readingV2Ids.snapshotVersionId('snapshot-v1'))}`;
    const recovery = records[recoveryPath] as any;
    delete recovery.authoring.sourceRefs;
    delete recovery.authoring.authoringContext.requirements;
    delete recovery.authoring.authoringContext.interpretations;
    delete recovery.authoring.authoringContext.unboundTargets;
    delete recovery.authoring.authoringContext.scope.requirementIds;
    vi.mocked(get).mockImplementation(async (path: string) => ({
      exists: () => records[path] !== undefined, val: () => records[path],
    } as any));
    const source = await loadReadingV2PublishedRevisionSource(materialId, { ownerId: 'teacher-1', role: 'teacher' });
    expect(source.status).toBe('loaded');
    expect(source.authoringContext).toMatchObject({
      requirements: [], interpretations: [], unboundTargets: [], scope: { requirementIds: [] },
    });
    expect(source.recovery?.authoring.sourceRefs).toEqual([]);
  });
});
