import { describe, expect, it } from 'vitest';
import {
  createReadingPassageHomeworkSnapshot,
  createReadingPassageSetHomework,
} from './readingV2PassageHomework.service';

const candidate = (overrides: Record<string, unknown> = {}) => ({
  materialId: 'passage-1',
  title: 'Making Time for Science',
  questionCount: 13,
  testTypeIds: ['ielts'],
  sourceOrderDisplay: 'Passage 1',
  sourceFullTestTitle: 'British Council Practice Test 01',
  publishedSnapshotVersionId: 'snapshot-1',
  hasStudentSafeProjection: true,
  accessible: true,
  archived: false,
  ...overrides,
});

describe('readingV2PassageHomework.service', () => {
  it('freezes a single Reading Passage to assignment-time snapshot metadata', () => {
    expect(createReadingPassageHomeworkSnapshot(candidate())).toEqual({
      passageMaterialId: 'passage-1',
      snapshotVersionId: 'snapshot-1',
      titleSnapshot: 'Making Time for Science',
      questionCount: 13,
      testTypeIds: ['ielts'],
      sourceOrderDisplay: 'Passage 1',
      sourceFullTestTitle: 'British Council Practice Test 01',
    });
  });

  it('freezes selected Reading Passages as an ordered homework set', () => {
    expect(createReadingPassageSetHomework([
      candidate({ materialId: 'passage-2', title: 'Second Passage', publishedSnapshotVersionId: 'snapshot-2' }),
      candidate({ materialId: 'passage-1', title: 'First Passage', publishedSnapshotVersionId: 'snapshot-1' }),
    ], 'Custom passage set')).toEqual({
      titleSnapshot: 'Custom passage set',
      items: [
        expect.objectContaining({
          order: 1,
          passageMaterialId: 'passage-2',
          snapshotVersionId: 'snapshot-2',
          titleSnapshot: 'Second Passage',
        }),
        expect.objectContaining({
          order: 2,
          passageMaterialId: 'passage-1',
          snapshotVersionId: 'snapshot-1',
          titleSnapshot: 'First Passage',
        }),
      ],
    });
  });

  it('rejects unpublished, archived, inaccessible, or projection-missing Reading Passages', () => {
    expect(() => createReadingPassageHomeworkSnapshot(candidate({ publishedSnapshotVersionId: '' })))
      .toThrow('published snapshot');
    expect(() => createReadingPassageHomeworkSnapshot(candidate({ archived: true })))
      .toThrow('archived');
    expect(() => createReadingPassageHomeworkSnapshot(candidate({ accessible: false })))
      .toThrow('inaccessible');
    expect(() => createReadingPassageHomeworkSnapshot(candidate({ hasStudentSafeProjection: false })))
      .toThrow('student-safe projection');
  });
});
