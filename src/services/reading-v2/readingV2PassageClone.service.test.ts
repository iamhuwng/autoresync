import { describe, expect, it, vi } from 'vitest';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { cloneReadingV2PublicPassageToTeacherLibrary } from './readingV2PassageClone.service';
import { getReadingV2DuplicateIndexPath } from './readingV2PassageDuplicateGuard.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import type {
  ReadingV2PublishedSnapshot,
  ReadingV2ReadingPassageMaterial,
} from '../../types/readingV2.types';

describe('readingV2PassageClone.service', () => {
  const sourceDocument = createReadingV2CanonicalFixture('sentence-completion');
  const sourceMaterial: ReadingV2ReadingPassageMaterial = {
    deliveryEngine: 'reading-v2',
    plane: 'canonical',
    schemaVersion: 1,
    passageMaterialId: 'public-passage-1' as ReadingV2ReadingPassageMaterial['passageMaterialId'],
    ownerId: 'teacher-source',
    visibility: 'public',
    state: 'published',
    currentSnapshotVersionId: 'snapshot-source-1' as ReadingV2ReadingPassageMaterial['currentSnapshotVersionId'],
    title: 'Public Passage',
    primaryTestTypeId: 'ielts',
    testTypeIds: ['ielts'],
    stimulusId: Object.keys(sourceDocument.stimuli)[0] as ReadingV2ReadingPassageMaterial['stimulusId'],
    taskGroupIds: Object.keys(sourceDocument.taskGroups) as ReadingV2ReadingPassageMaterial['taskGroupIds'],
    interactionIds: Object.keys(sourceDocument.interactions) as ReadingV2ReadingPassageMaterial['interactionIds'],
    answerKeyLocation: 'published-snapshot',
    scoringRuleLocation: 'published-snapshot',
    sourceOrder: {
      kind: 'numeric',
      value: 2,
      labelSnapshot: 'Passage',
      displaySnapshot: 'Passage 2',
    },
    sourceQuestionRange: '14-26',
    sourceTitleSnapshot: 'Cambridge IELTS 18',
    durationMinutes: 20,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
  const sourceSnapshot: ReadingV2PublishedSnapshot = {
    materialId: 'public-passage-1' as ReadingV2PublishedSnapshot['materialId'],
    snapshotVersionId: 'snapshot-source-1' as ReadingV2PublishedSnapshot['snapshotVersionId'],
    ownerId: 'teacher-source',
    document: sourceDocument,
    publishedAt: '2026-06-01T00:00:00.000Z',
    publishedBy: 'teacher-source',
  };

  it('clones a readable public passage into a private teacher-owned passage and writes safe projections', async () => {
    const updates: Record<string, unknown> = {};
    const repository = {
      read: vi.fn(async (path: string) => {
        if (path === readingV2StoragePaths.readingPassageMaterials('public-passage-1')) {
          return sourceMaterial;
        }
        if (path === readingV2StoragePaths.publishedSnapshots('public-passage-1', 'snapshot-source-1')) {
          return sourceSnapshot;
        }
        return null;
      }),
      update: vi.fn(async (nextUpdates: Record<string, unknown>) => {
        Object.assign(updates, nextUpdates);
      }),
    };

    const result = await cloneReadingV2PublicPassageToTeacherLibrary({
      sourceMaterialId: 'public-passage-1',
      sourceSnapshotVersionId: 'snapshot-source-1',
      actorTeacherId: 'teacher-target',
      repository,
      now: '2026-06-16T00:00:00.000Z',
    });

    expect(result.passageRef).toMatchObject({
      ownerId: 'teacher-target',
      visibility: 'private',
      title: 'Public Passage',
      titleSnapshot: 'Public Passage',
      sourceOrderDisplaySnapshot: 'Passage 2',
      questionRangeSnapshot: '14-26',
    });
    expect(result.passageRef.passageMaterialId).not.toBe('public-passage-1');
    expect(result.passageRef.snapshotVersionId).not.toBe('snapshot-source-1');
    expect(repository.update).toHaveBeenCalledTimes(1);

    expect(updates[readingV2StoragePaths.readingPassageMaterials(result.material.passageMaterialId)])
      .toMatchObject({
        passageMaterialId: result.material.passageMaterialId,
        ownerId: 'teacher-target',
        visibility: 'private',
        state: 'published',
        currentSnapshotVersionId: result.material.currentSnapshotVersionId,
        clonedFromMaterialId: 'public-passage-1',
        clonedFromSnapshotVersionId: 'snapshot-source-1',
        clonedFromOwnerId: 'teacher-source',
        clonedFromVisibilitySnapshot: 'public',
        cloneReason: 'teacher-template-clone',
      });
    expect(updates[readingV2StoragePaths.publishedSnapshots(
      result.material.passageMaterialId,
      result.material.currentSnapshotVersionId,
    )]).toMatchObject({
      materialId: result.material.passageMaterialId,
      ownerId: 'teacher-target',
      document: expect.objectContaining({ title: 'Public Passage' }),
    });
    expect(updates[readingV2StoragePaths.readingPassageMaterialVersions(
      result.material.passageMaterialId,
      result.material.currentSnapshotVersionId,
    )]).toMatchObject({
      passageMaterialId: result.material.passageMaterialId,
      currentSnapshotVersionId: result.material.currentSnapshotVersionId,
      ownerId: 'teacher-target',
      document: expect.objectContaining({ title: 'Public Passage' }),
      publishedAt: '2026-06-16T00:00:00.000Z',
      publishedBy: 'teacher-target',
    });
    expect(updates[readingV2StoragePaths.studentSafeTests(
      result.material.passageMaterialId,
      result.material.currentSnapshotVersionId,
    )]).toMatchObject({
      materialId: result.material.passageMaterialId,
      projectionKind: 'student-safe',
    });
    expect(updates[readingV2StoragePaths.reviewProjections(
      result.material.passageMaterialId,
      result.material.currentSnapshotVersionId,
    )]).toMatchObject({
      materialId: result.material.passageMaterialId,
      projectionKind: 'review',
    });
    expect(JSON.stringify(updates[readingV2StoragePaths.studentSafeTests(
      result.material.passageMaterialId,
      result.material.currentSnapshotVersionId,
    )])).not.toContain('clonedFrom');
    expect(updates[`material_catalog/material_indexes/by_owner/teacher-target/${result.material.passageMaterialId}`])
      .toMatchObject({
        ownerId: 'teacher-target',
        visibility: 'private',
        materialKind: 'reading-passage',
      });
    expect(updates[getReadingV2DuplicateIndexPath('teacher-target', result.material.passageMaterialId)])
      .toMatchObject({
        schemaVersion: 1,
        ownerId: 'teacher-target',
        passageMaterialId: result.material.passageMaterialId,
        currentVersionId: result.material.currentSnapshotVersionId,
        title: 'Public Passage',
        state: 'published',
        visibility: 'private',
        questionCount: result.material.interactionIds.length,
        updatedAt: '2026-06-16T00:00:00.000Z',
        bodyShingleSize: 5,
        questionShingleSize: 3,
      });
    expect(JSON.stringify(updates[getReadingV2DuplicateIndexPath(
      'teacher-target',
      result.material.passageMaterialId,
    )])).not.toContain('document');
  });

  it('rejects private, owned, archived, or missing-source clone attempts', async () => {
    const repository = {
      read: vi.fn(async (path: string) => {
        if (path === readingV2StoragePaths.readingPassageMaterials('private-passage')) {
          return { ...sourceMaterial, passageMaterialId: 'private-passage', visibility: 'private' };
        }
        if (path === readingV2StoragePaths.readingPassageMaterials('owned-passage')) {
          return { ...sourceMaterial, passageMaterialId: 'owned-passage', ownerId: 'teacher-target' };
        }
        if (path === readingV2StoragePaths.readingPassageMaterials('archived-passage')) {
          return { ...sourceMaterial, passageMaterialId: 'archived-passage', state: 'archived' };
        }
        return null;
      }),
      update: vi.fn(),
    };

    await expect(cloneReadingV2PublicPassageToTeacherLibrary({
      sourceMaterialId: 'private-passage',
      sourceSnapshotVersionId: 'snapshot-source-1',
      actorTeacherId: 'teacher-target',
      repository,
    })).rejects.toThrow('readable public');

    await expect(cloneReadingV2PublicPassageToTeacherLibrary({
      sourceMaterialId: 'owned-passage',
      sourceSnapshotVersionId: 'snapshot-source-1',
      actorTeacherId: 'teacher-target',
      repository,
    })).rejects.toThrow('non-owned');

    await expect(cloneReadingV2PublicPassageToTeacherLibrary({
      sourceMaterialId: 'archived-passage',
      sourceSnapshotVersionId: 'snapshot-source-1',
      actorTeacherId: 'teacher-target',
      repository,
    })).rejects.toThrow('published source');

    await expect(cloneReadingV2PublicPassageToTeacherLibrary({
      sourceMaterialId: 'missing-passage',
      sourceSnapshotVersionId: 'snapshot-source-1',
      actorTeacherId: 'teacher-target',
      repository,
    })).rejects.toThrow('source material was not found');
  });
});
