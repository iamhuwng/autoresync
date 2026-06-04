import { describe, expect, it, vi } from 'vitest';
import {
  buildReadingV2TeacherSelectedPassageComposition,
  createReadingV2TeacherSelectedPassageComposition,
} from './readingV2TeacherComposition.service';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import type { ReadingV2Document, ReadingV2PublishedSnapshot } from '../../types/readingV2.types';

describe('readingV2TeacherComposition.service', () => {
  const passages = [
    {
      materialId: 'passage-a',
      title: 'Passage A',
      questionCount: 10,
      durationMinutes: 15,
      publishedSnapshotVersionId: 'snapshot-a',
      sourceOrderDisplay: 'Passage 1',
      sourceQuestionRange: '1-10',
      primaryTestTypeId: 'ielts',
      testTypeIds: ['ielts'],
      visibility: 'private',
    },
    {
      materialId: 'passage-b',
      title: 'Passage B',
      questionCount: 11,
      durationMinutes: 18,
      publishedSnapshotVersionId: 'snapshot-b',
      sourceOrderDisplay: 'Passage 2',
      sourceQuestionRange: '11-21',
      testTypeIds: ['ielts'],
      visibility: 'private',
    },
  ];

  it('builds a reusable full-test composition from selected Reading Passage rows', () => {
    const composition = buildReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages,
      now: '2026-06-02T00:00:00.000Z',
    });

    expect(composition).toMatchObject({
      title: 'Selected Reading Passages',
      ownerId: 'teacher-1',
      questionCount: 21,
      durationMinutes: 33,
      visibility: 'private',
      testTypeIds: ['ielts'],
      passageRefs: [
        expect.objectContaining({
          passageMaterialId: 'passage-a',
          snapshotVersionId: 'snapshot-a',
          order: 1,
          sourceOrderDisplaySnapshot: 'Passage 1',
          questionRangeSnapshot: '1-10',
          questionCountSnapshot: 10,
        }),
        expect.objectContaining({
          passageMaterialId: 'passage-b',
          snapshotVersionId: 'snapshot-b',
          order: 2,
          sourceOrderDisplaySnapshot: 'Passage 2',
          questionRangeSnapshot: '11-21',
          questionCountSnapshot: 11,
        }),
      ],
    });
  });

  it('does not reuse material ids for repeated creations from the same first passage', () => {
    const first = buildReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages,
      now: '2026-06-02T00:00:00.000Z',
    });
    const second = buildReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages,
      now: '2026-06-02T00:01:00.000Z',
    });

    expect(second.compositionId).not.toBe(first.compositionId);
    expect(second.testMaterialId).not.toBe(first.testMaterialId);
  });

  const snapshotFor = (
    materialId: string,
    snapshotVersionId: string,
    taskType: Parameters<typeof createReadingV2CanonicalFixture>[0] = 'sentence-completion',
    mutateDocument?: (document: ReadingV2Document) => void,
  ): ReadingV2PublishedSnapshot => {
    const document = createReadingV2CanonicalFixture(taskType);
    mutateDocument?.(document);
    if (Object.keys(document.optionSets).length === 0) {
      delete (document as unknown as { optionSets?: unknown }).optionSets;
    }

    return {
      snapshotVersionId: snapshotVersionId as ReadingV2PublishedSnapshot['snapshotVersionId'],
      materialId: materialId as ReadingV2PublishedSnapshot['materialId'],
      ownerId: 'teacher-1',
      document,
      publishedAt: '2026-06-01T00:00:00.000Z',
      publishedBy: 'teacher-1',
    };
  };

  const snapshotWithOptionIdAnswer = (
    materialId: string,
    snapshotVersionId: string,
  ): ReadingV2PublishedSnapshot => snapshotFor(
    materialId,
    snapshotVersionId,
    'multiple-choice',
    (document) => {
      const [interactionId] = Object.keys(document.interactions);
      const interaction = document.interactions[interactionId]!;
      const optionSetId = interaction.responseShape.kind === 'single-choice'
        ? interaction.responseShape.optionSetId
        : '';
      const optionId = document.optionSets[optionSetId]!.options[0]!.optionId;
      document.interactions = {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          scoringRule: {
            ...interaction.scoringRule,
            acceptableAnswers: [optionId],
          },
        },
      };
    },
  );

  it('writes a teacher-visible, launchable full-test material from selected passage snapshots', async () => {
    const updates: Record<string, unknown> = {};
    const sourceSnapshots = {
      [readingV2StoragePaths.publishedSnapshots('passage-a', 'snapshot-a')]:
        snapshotFor('passage-a', 'snapshot-a'),
      [readingV2StoragePaths.publishedSnapshots('passage-b', 'snapshot-b')]:
        snapshotFor('passage-b', 'snapshot-b'),
    };
    const repository = {
      read: vi.fn(async (path: string) => sourceSnapshots[path]),
      write: vi.fn(async (path: string, value: unknown) => {
        updates[path] = value;
      }),
      update: vi.fn(async (nextUpdates: Record<string, unknown>) => {
        Object.assign(updates, nextUpdates);
      }),
    };

    const result = await createReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages,
      repository,
      now: '2026-06-02T00:00:00.000Z',
    });

    expect(repository.read).toHaveBeenCalledWith(
      readingV2StoragePaths.publishedSnapshots('passage-a', 'snapshot-a'),
    );
    expect(repository.read).toHaveBeenCalledWith(
      readingV2StoragePaths.publishedSnapshots('passage-b', 'snapshot-b'),
    );
    expect(repository.update).toHaveBeenCalledTimes(1);

    expect(updates[result.paths.composition]).toMatchObject({
      title: 'Selected Reading Passages',
      questionCount: 21,
      passageRefs: [
        expect.objectContaining({ passageMaterialId: 'passage-a' }),
        expect.objectContaining({ passageMaterialId: 'passage-b' }),
      ],
    });
    expect(updates[result.paths.version]).toMatchObject({
      compositionId: result.composition.compositionId,
      publishedAt: '2026-06-02T00:00:00.000Z',
      publishedBy: 'teacher-1',
    });

    const materialId = result.composition.testMaterialId;
    const snapshotVersionId = result.composition.publishedVersionId;
    expect(updates[`tests/${materialId}`]).toMatchObject({
      id: materialId,
      materialId,
      ownerId: 'teacher-1',
      deliveryEngine: 'reading-v2',
      title: 'Selected Reading Passages',
      materialKind: 'full-test',
      questionCount: 4,
      publishedSnapshotVersionId: snapshotVersionId,
    });
    expect(updates[readingV2StoragePaths.materialMetadata(materialId)]).toMatchObject({
      materialId,
      ownerId: 'teacher-1',
      title: 'Selected Reading Passages',
      materialKind: 'full-test',
      publishedSnapshotVersionId: snapshotVersionId,
    });
    expect(updates[`material_catalog/material_indexes/by_owner/teacher-1/${materialId}`])
      .toMatchObject({
        materialId,
        ownerId: 'teacher-1',
        title: 'Selected Reading Passages',
        materialKind: 'full-test',
        testTypeIds: ['ielts'],
      });
    expect(updates[readingV2StoragePaths.publishedSnapshots(materialId, snapshotVersionId)])
      .toMatchObject({
        materialId,
        snapshotVersionId,
        document: expect.objectContaining({
          title: 'Selected Reading Passages',
          sectionIds: expect.arrayContaining([
            'passage-1:section-sentence-completion',
            'passage-2:section-sentence-completion',
          ]),
        }),
      });
    expect(updates[readingV2StoragePaths.studentSafeTests(materialId, snapshotVersionId)])
      .toMatchObject({
        materialId,
        projectionKind: 'student-safe',
        content: expect.objectContaining({
          title: 'Selected Reading Passages',
        }),
      });
    expect(updates[readingV2StoragePaths.sessionSafePayloads('publish-template', snapshotVersionId)])
      .toMatchObject({
        materialId,
        projectionKind: 'session-safe',
      });
    expect(Object.keys(updates).some((path) => path.includes('reading_passage_materials/'))).toBe(false);
  });

  it('prefixes option-id answer keys when selected passage snapshots are merged', async () => {
    const updates: Record<string, unknown> = {};
    const sourceSnapshots = {
      [readingV2StoragePaths.publishedSnapshots('passage-a', 'snapshot-a')]:
        snapshotWithOptionIdAnswer('passage-a', 'snapshot-a'),
      [readingV2StoragePaths.publishedSnapshots('passage-b', 'snapshot-b')]:
        snapshotWithOptionIdAnswer('passage-b', 'snapshot-b'),
    };
    const repository = {
      read: vi.fn(async (path: string) => sourceSnapshots[path]),
      write: vi.fn(async (path: string, value: unknown) => {
        updates[path] = value;
      }),
      update: vi.fn(async (nextUpdates: Record<string, unknown>) => {
        Object.assign(updates, nextUpdates);
      }),
    };

    const result = await createReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages,
      repository,
      now: '2026-06-02T00:00:00.000Z',
    });
    const snapshot = updates[
      readingV2StoragePaths.publishedSnapshots(
        result.composition.testMaterialId,
        result.composition.publishedVersionId,
      )
    ] as ReadingV2PublishedSnapshot;
    const firstInteraction = snapshot.document.interactions['passage-1:interaction-multiple-choice-1']!;
    const firstOptionSet = snapshot.document.optionSets['passage-1:option-set-multiple-choice']!;

    expect(firstOptionSet.options[0]?.optionId).toBe('passage-1:multiple-choice-option-a');
    expect(firstInteraction.responseShape).toMatchObject({
      kind: 'single-choice',
      optionSetId: 'passage-1:option-set-multiple-choice',
    });
    expect(firstInteraction.scoringRule.acceptableAnswers).toEqual(['passage-1:multiple-choice-option-a']);
  });

  it('rejects selected rows that are missing frozen published snapshots', () => {
    expect(() => buildReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages: [{ materialId: 'passage-without-snapshot', title: 'Missing Snapshot' }],
      now: '2026-06-02T00:00:00.000Z',
    })).toThrow('missing a published snapshot version');
  });
});
