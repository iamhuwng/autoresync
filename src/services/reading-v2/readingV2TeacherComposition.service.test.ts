import { describe, expect, it, vi } from 'vitest';
import {
  buildReadingV2TeacherSelectedPassageComposition,
  createReadingV2TeacherSelectedPassageComposition,
} from './readingV2TeacherComposition.service';

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

  it('writes the composition and immutable composition version paths', async () => {
    const writes: Array<{ path: string; value: unknown }> = [];
    const repository = {
      write: vi.fn(async (path: string, value: unknown) => {
        writes.push({ path, value });
      }),
    };

    const result = await createReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages,
      repository,
      now: '2026-06-02T00:00:00.000Z',
    });

    expect(repository.write).toHaveBeenCalledTimes(2);
    expect(writes[0].path).toBe(result.paths.composition);
    expect(writes[0].path).toContain('reading_v2/full_test_compositions/');
    expect(writes[1].path).toBe(result.paths.version);
    expect(writes[1].path).toContain('reading_v2/full_test_composition_versions/');
    expect(writes[1].value).toMatchObject({
      compositionId: result.composition.compositionId,
      publishedAt: '2026-06-02T00:00:00.000Z',
      publishedBy: 'teacher-1',
    });
  });

  it('rejects selected rows that are missing frozen published snapshots', () => {
    expect(() => buildReadingV2TeacherSelectedPassageComposition({
      teacherId: 'teacher-1',
      passages: [{ materialId: 'passage-without-snapshot', title: 'Missing Snapshot' }],
      now: '2026-06-02T00:00:00.000Z',
    })).toThrow('missing a published snapshot version');
  });
});
