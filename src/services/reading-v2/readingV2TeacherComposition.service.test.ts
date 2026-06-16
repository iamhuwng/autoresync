import { describe, expect, it, vi } from 'vitest';
import {
  buildReadingV2TeacherSelectedPassageComposition,
  createReadingV2TeacherSelectedPassageDraft,
  createReadingV2TeacherSelectedPassageComposition,
  publishReadingV2TeacherSelectedPassageCompositionEdit,
  removeReadingV2MasterComposition,
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
      numbering: expect.objectContaining({
        totalQuestionCount: 21,
      }),
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

  const snapshotWithNoteLayoutNumbers = (
    materialId: string,
    snapshotVersionId: string,
    displayNumbers: readonly [number, number],
  ): ReadingV2PublishedSnapshot => snapshotFor(
    materialId,
    snapshotVersionId,
    'note-completion',
    (document) => {
      const [taskGroupId] = Object.keys(document.taskGroups);
      const taskGroup = document.taskGroups[taskGroupId]!;
      taskGroup.layoutHint = JSON.stringify({
        kind: 'note-completion-layout',
        sections: [
          {
            heading: 'Source note section',
            questionNumbers: displayNumbers,
          },
        ],
      });

      taskGroup.interactionIds.forEach((interactionId, index) => {
        document.interactions[interactionId] = {
          ...document.interactions[interactionId]!,
          reviewLabel: {
            ...document.interactions[interactionId]!.reviewLabel,
            displayNumber: displayNumbers[index],
          },
        };
      });
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
      compositionId: result.composition.compositionId,
      deliveryEngine: 'reading-v2',
      title: 'Selected Reading Passages',
      materialKind: 'full-test',
      questionCount: 4,
      publishedSnapshotVersionId: snapshotVersionId,
      metadata: expect.objectContaining({
        compositionId: result.composition.compositionId,
      }),
    });
    expect(updates[readingV2StoragePaths.materialMetadata(materialId)]).toMatchObject({
      materialId,
      ownerId: 'teacher-1',
      compositionId: result.composition.compositionId,
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

  it('creates an unpublished ref-only draft master from selected published passages', async () => {
    const updates: Record<string, unknown> = {};
    const repository = {
      update: vi.fn(async (nextUpdates: Record<string, unknown>) => {
        Object.assign(updates, nextUpdates);
      }),
    };

    const result = await createReadingV2TeacherSelectedPassageDraft({
      teacherId: 'teacher-1',
      passages,
      repository,
      metadata: {
        title: 'Existing Passage Draft',
        durationMinutes: 60,
        visibility: 'private',
      },
      now: '2026-06-02T00:00:00.000Z',
    });

    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(result.draft.mode).toBe('draft');
    expect(result.draft.title).toBe('Existing Passage Draft');
    expect(result.draft.passageRefs.map((ref) => ref.passageMaterialId)).toEqual(['passage-a', 'passage-b']);
    expect(updates[result.paths.composition]).toMatchObject({
      title: 'Existing Passage Draft',
      ownerId: 'teacher-1',
      mode: 'draft',
      passageRefs: [
        expect.objectContaining({ passageMaterialId: 'passage-a', snapshotVersionId: 'snapshot-a' }),
        expect.objectContaining({ passageMaterialId: 'passage-b', snapshotVersionId: 'snapshot-b' }),
      ],
    });
    expect(Object.keys(updates).some((path) => path.includes('/published_snapshots/'))).toBe(false);
    expect(Object.keys(updates).some((path) => path.includes('/projections/student_safe_tests/'))).toBe(false);
  });

  it('rejects draft master creation from draft, archived, inaccessible, or missing-projection passage rows', async () => {
    const repository = {
      update: vi.fn(),
    };

    await expect(createReadingV2TeacherSelectedPassageDraft({
      teacherId: 'teacher-1',
      passages: [
        { materialId: 'draft-passage', title: 'Draft', state: 'draft', publishedSnapshotVersionId: 'snapshot-draft' },
      ],
      repository,
    })).rejects.toThrow('published, unarchived');

    await expect(createReadingV2TeacherSelectedPassageDraft({
      teacherId: 'teacher-1',
      passages: [
        { materialId: 'archived-passage', title: 'Archived', state: 'archived', publishedSnapshotVersionId: 'snapshot-archived' },
      ],
      repository,
    })).rejects.toThrow('published, unarchived');

    await expect(createReadingV2TeacherSelectedPassageDraft({
      teacherId: 'teacher-1',
      passages: [
        { materialId: 'missing-projection', title: 'Missing Projection', state: 'published' },
      ],
      repository,
    })).rejects.toThrow('published snapshot version');
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

  it('remaps structured layout question numbers when selected passages are renumbered', async () => {
    const updates: Record<string, unknown> = {};
    const sourceSnapshots = {
      [readingV2StoragePaths.publishedSnapshots('passage-a', 'snapshot-a')]:
        snapshotFor('passage-a', 'snapshot-a'),
      [readingV2StoragePaths.publishedSnapshots('passage-b', 'snapshot-b')]:
        snapshotWithNoteLayoutNumbers('passage-b', 'snapshot-b', [8, 9]),
    };
    const repository = {
      read: vi.fn(async (path: string) => sourceSnapshots[path]),
      update: vi.fn(async (nextUpdates: Record<string, unknown>) => {
        Object.assign(updates, nextUpdates);
      }),
    };

    const result = await publishReadingV2TeacherSelectedPassageCompositionEdit({
      teacherId: 'teacher-1',
      composition: buildReadingV2TeacherSelectedPassageComposition({
        teacherId: 'teacher-1',
        passages,
        now: '2026-06-02T00:00:00.000Z',
      }),
      passages,
      repository,
      now: '2026-06-16T00:00:00.000Z',
    });

    const publishedSnapshot = updates[readingV2StoragePaths.publishedSnapshots(
      result.composition.testMaterialId,
      result.composition.publishedVersionId,
    )] as ReadingV2PublishedSnapshot;
    const noteTaskGroup = Object.values(publishedSnapshot.document.taskGroups)
      .find((taskGroup) => taskGroup.officialTaskType === 'note-completion')!;
    const layout = JSON.parse(noteTaskGroup.layoutHint ?? '{}');

    expect(layout.sections[0].questionNumbers).toEqual([3, 4]);
  });

  it('publishes master edits by writing a new composition version and fresh projections', async () => {
    const updates: Record<string, unknown> = {};
    const sourceSnapshots = {
      [readingV2StoragePaths.publishedSnapshots('passage-a', 'snapshot-a')]:
        snapshotFor('passage-a', 'snapshot-a'),
      [readingV2StoragePaths.publishedSnapshots('passage-b-clone', 'snapshot-b-clone')]:
        snapshotFor('passage-b-clone', 'snapshot-b-clone'),
    };
    const repository = {
      read: vi.fn(async (path: string) => sourceSnapshots[path]),
      update: vi.fn(async (nextUpdates: Record<string, unknown>) => {
        Object.assign(updates, nextUpdates);
      }),
    };
    const existing = buildReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages,
      now: '2026-06-02T00:00:00.000Z',
    });

    const result = await publishReadingV2TeacherSelectedPassageCompositionEdit({
      teacherId: 'teacher-1',
      composition: existing,
      passages: [
        passages[0],
        {
          ...passages[1],
          materialId: 'passage-b-clone',
          publishedSnapshotVersionId: 'snapshot-b-clone',
          ownerId: 'teacher-1',
          visibility: 'private',
        },
      ],
      repository,
      now: '2026-06-16T00:00:00.000Z',
      metadata: {
        title: 'Edited Master',
        visibility: 'private',
      },
    });

    expect(result.composition.compositionId).toBe(existing.compositionId);
    expect(result.composition.testMaterialId).toBe(existing.testMaterialId);
    expect(result.composition.publishedVersionId).not.toBe(existing.publishedVersionId);
    expect(result.composition.passageRefs.map((ref) => ref.passageMaterialId))
      .toEqual(['passage-a', 'passage-b-clone']);
    expect(repository.read).toHaveBeenCalledWith(
      readingV2StoragePaths.publishedSnapshots('passage-b-clone', 'snapshot-b-clone'),
    );
    expect(updates[readingV2StoragePaths.fullTestCompositions(existing.compositionId)])
      .toMatchObject({
        compositionId: existing.compositionId,
        testMaterialId: existing.testMaterialId,
        title: 'Edited Master',
        passageRefs: [
          expect.objectContaining({ passageMaterialId: 'passage-a' }),
          expect.objectContaining({ passageMaterialId: 'passage-b-clone' }),
        ],
      });
    expect(updates[readingV2StoragePaths.fullTestCompositionVersions(
      existing.compositionId,
      result.composition.publishedVersionId,
    )]).toMatchObject({
      compositionId: existing.compositionId,
      publishedVersionId: result.composition.publishedVersionId,
      publishedAt: '2026-06-16T00:00:00.000Z',
      publishedBy: 'teacher-1',
    });
    expect(updates[readingV2StoragePaths.publishedSnapshots(
      existing.testMaterialId,
      result.composition.publishedVersionId,
    )]).toMatchObject({
      materialId: existing.testMaterialId,
      snapshotVersionId: result.composition.publishedVersionId,
      ownerId: 'teacher-1',
    });
    expect(updates[readingV2StoragePaths.studentSafeTests(
      existing.testMaterialId,
      result.composition.publishedVersionId,
    )]).toMatchObject({
      materialId: existing.testMaterialId,
      projectionKind: 'student-safe',
    });
    expect(updates[readingV2StoragePaths.materialMetadata(existing.testMaterialId)])
      .toMatchObject({
        materialId: existing.testMaterialId,
        compositionId: existing.compositionId,
        title: 'Edited Master',
        publishedSnapshotVersionId: result.composition.publishedVersionId,
      });
    expect(updates[`tests/${existing.testMaterialId}`]).toMatchObject({
      compositionId: existing.compositionId,
      metadata: expect.objectContaining({
        compositionId: existing.compositionId,
      }),
    });
  });

  it('indexes public master edits as public catalog rows and stores canonical public visibility', async () => {
    const updates: Record<string, unknown> = {};
    const publicPassages = passages.map((passage) => ({
      ...passage,
      visibility: 'public',
    }));
    const sourceSnapshots = {
      [readingV2StoragePaths.publishedSnapshots('passage-a', 'snapshot-a')]:
        snapshotFor('passage-a', 'snapshot-a'),
      [readingV2StoragePaths.publishedSnapshots('passage-b', 'snapshot-b')]:
        snapshotFor('passage-b', 'snapshot-b'),
    };
    const repository = {
      read: vi.fn(async (path: string) => sourceSnapshots[path]),
      update: vi.fn(async (nextUpdates: Record<string, unknown>) => {
        Object.assign(updates, nextUpdates);
      }),
    };
    const existing = buildReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages: publicPassages,
      now: '2026-06-02T00:00:00.000Z',
    });

    await publishReadingV2TeacherSelectedPassageCompositionEdit({
      teacherId: 'teacher-1',
      composition: existing,
      passages: publicPassages,
      repository,
      now: '2026-06-16T00:00:00.000Z',
      metadata: {
        title: 'Public Master',
        visibility: 'public',
      },
    });

    expect(updates[readingV2StoragePaths.materialMetadata(existing.testMaterialId)])
      .toMatchObject({
        visibility: 'public',
      });
    expect(updates[`material_catalog/material_indexes/by_visibility/public/${existing.testMaterialId}`])
      .toMatchObject({
        materialId: existing.testMaterialId,
        visibility: 'public',
        materialKind: 'full-test',
      });
    expect(Object.keys(updates)).not.toContain(
      `material_catalog/material_indexes/by_visibility/library-eligible/${existing.testMaterialId}`,
    );
  });

  it('publishes master edits from already-published passages without inheriting stale child validation issues', async () => {
    const updates: Record<string, unknown> = {};
    const snapshotWithStaleIssue = snapshotFor(
      'passage-a',
      'snapshot-a',
      'sentence-completion',
      (document) => {
        const [taskGroupId] = Object.keys(document.taskGroups);
        document.taskGroups[taskGroupId] = {
          ...document.taskGroups[taskGroupId],
          validationState: {
            issues: [
              {
                code: 'stale-import-warning',
                severity: 'error',
                message: 'Old source import issue that should not block recomposed master publish.',
                objectId: taskGroupId,
              },
            ],
          },
        };
      },
    );
    const sourceSnapshots = {
      [readingV2StoragePaths.publishedSnapshots('passage-a', 'snapshot-a')]: snapshotWithStaleIssue,
      [readingV2StoragePaths.publishedSnapshots('passage-b', 'snapshot-b')]:
        snapshotFor('passage-b', 'snapshot-b'),
    };
    const repository = {
      read: vi.fn(async (path: string) => sourceSnapshots[path]),
      update: vi.fn(async (nextUpdates: Record<string, unknown>) => {
        Object.assign(updates, nextUpdates);
      }),
    };
    const existing = buildReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages,
      now: '2026-06-02T00:00:00.000Z',
    });

    const result = await publishReadingV2TeacherSelectedPassageCompositionEdit({
      teacherId: 'teacher-1',
      composition: existing,
      passages,
      repository,
      now: '2026-06-16T00:00:00.000Z',
    });

    const publishedSnapshot = updates[readingV2StoragePaths.publishedSnapshots(
      existing.testMaterialId,
      result.composition.publishedVersionId,
    )] as ReadingV2PublishedSnapshot;

    expect(JSON.stringify(publishedSnapshot.document.validationState?.issues ?? []))
      .not.toContain('stale-import-warning');
    expect(Object.values(publishedSnapshot.document.taskGroups).flatMap((taskGroup) =>
      taskGroup.validationState?.issues ?? [],
    )).toEqual([]);
  });

  it('rejects selected rows that are missing frozen published snapshots', () => {
    expect(() => buildReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages: [{ materialId: 'passage-without-snapshot', title: 'Missing Snapshot' }],
      now: '2026-06-02T00:00:00.000Z',
    })).toThrow('missing a published snapshot version');
  });

  it('soft-removes a master without deleting linked Reading Passage materials', async () => {
    const composition = buildReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages,
      now: '2026-06-02T00:00:00.000Z',
    });
    const writes: Array<{ path: string; value: unknown }> = [];
    const removes: string[] = [];

    const result = await removeReadingV2MasterComposition({
      actorUserId: 'teacher-1',
      actorRole: 'teacher',
      composition,
      repository: {
        write: async (path, value) => {
          writes.push({ path, value });
        },
        remove: async (path) => {
          removes.push(path);
        },
      },
      now: '2026-06-03T00:00:00.000Z',
      correlationId: 'corr-master-remove-1',
      sourceFeatureId: 'teacher_materials_reading_master_removed',
      sourceRoute: '/lobby',
    });

    expect(writes).toEqual(expect.arrayContaining([
      {
        path: `${readingV2StoragePaths.fullTestCompositions(composition.compositionId)}/state`,
        value: 'removed',
      },
      {
        path: `${readingV2StoragePaths.materialMetadata(composition.testMaterialId)}/state`,
        value: 'removed',
      },
      {
        path: `reading_v2/audit_events/corr-master-remove-1:reading_master_removed:${composition.compositionId}`,
        value: expect.objectContaining({
          action: 'reading_master_removed',
          entityType: 'reading-master',
          entityId: composition.compositionId,
        }),
      },
    ]));
    expect(removes).toEqual(expect.arrayContaining([
      `material_catalog/material_indexes/by_owner/teacher-1/${composition.testMaterialId}`,
      `material_catalog/material_indexes/by_visibility/private/${composition.testMaterialId}`,
      `material_catalog/material_indexes/by_material_kind/full-test/${composition.testMaterialId}`,
      `material_catalog/material_indexes/by_test_type/ielts/${composition.testMaterialId}`,
      `tests/${composition.testMaterialId}`,
    ]));
    expect([...writes.map((write) => write.path), ...removes].some((path) =>
      path.includes('reading_passage_materials/passage-a') ||
      path.includes('reading_passage_materials/passage-b') ||
      path.includes('published_snapshots'),
    )).toBe(false);
    expect(result.changedPaths).toEqual(expect.arrayContaining([
      `${readingV2StoragePaths.fullTestCompositions(composition.compositionId)}/state`,
      `material_catalog/material_indexes/by_owner/teacher-1/${composition.testMaterialId}`,
      `tests/${composition.testMaterialId}`,
    ]));
  });
});
