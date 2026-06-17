import { describe, expect, it } from 'vitest';
import {
  HOMEWORK_ASSIGNMENT_REASON_CODES,
  assertTeacherLobbyFamilyRegistered,
  resolveTeacherLobbyAssignability,
} from './teacherLobbyAssignability';

const publishedBase = {
  id: 'material-1',
  title: 'Material 1',
  testType: 'IELTS',
  isComplete: true,
  status: 'published',
  published: true,
};

describe('teacherLobbyAssignability', () => {
  it.each([
    [
      'THCS Test',
      { ...publishedBase, id: 'thcs-1', testType: 'THCS-THPT', metadata: { title: 'Grade 10' } },
      { contentKind: 'thcs_test', contentId: 'thcs-1', flow: 'thcs' },
    ],
    [
      'Reading Passage',
      {
        id: 'passage-1',
        materialId: 'passage-1',
        title: 'Passage 1',
        publishedSnapshotVersionId: 'snapshot-1',
        hasStudentSafeProjection: true,
        accessible: true,
        archived: false,
      },
      { family: 'reading_passage', contentKind: 'reading_passage', contentId: 'passage-1', version: 'snapshot-1', flow: 'standard' },
    ],
    [
      'IELTS Reading',
      { ...publishedBase, id: 'ielts-reading-1', skill: 'Reading' },
      { contentKind: 'ielts_reading', contentId: 'ielts-reading-1', flow: 'standard' },
    ],
    [
      'IELTS Listening',
      { ...publishedBase, id: 'ielts-listening-1', skill: 'Listening' },
      { contentKind: 'ielts_listening', contentId: 'ielts-listening-1', flow: 'standard' },
    ],
    [
      'IELTS Writing',
      { ...publishedBase, id: 'ielts-writing-1', skill: 'Writing', metadata: { title: 'Writing Task 1' } },
      { contentKind: 'ielts_writing', contentId: 'ielts-writing-1', flow: 'standard' },
    ],
  ])('returns assignable metadata for %s', (_label, item, expected) => {
    const family = expected.family || 'test';
    const result = resolveTeacherLobbyAssignability(item, { family });

    expect(result.assignable).toBe(true);
    expect(result.flow).toBe(expected.flow);
    expect(result.contentRef).toMatchObject({
      contentKind: expected.contentKind,
      contentId: expected.contentId,
      ...(expected.version ? { version: expected.version } : {}),
    });
  });

  it.each([
    ['Book', { id: 'book-1', title: 'Book 1' }, 'book', HOMEWORK_ASSIGNMENT_REASON_CODES.WHOLE_BOOK_ASSIGNMENT_NOT_SUPPORTED],
    ['Draft', { id: 'draft-1', status: 'draft', title: 'Draft 1' }, 'draft', HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_DRAFT],
    ['Incomplete item', { ...publishedBase, isComplete: false }, 'test', HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_ASSIGNABLE],
    ['Unpublished item', { ...publishedBase, published: false }, 'test', HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_UNPUBLISHED],
    ['Deleted item', { ...publishedBase, deleted: true }, 'test', HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_ASSIGNABLE],
    ['Archived item', { ...publishedBase, archived: true }, 'test', HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_ASSIGNABLE],
    ['Unknown family', { id: 'future-1', title: 'Future' }, 'future_family', HOMEWORK_ASSIGNMENT_REASON_CODES.UNSUPPORTED_CONTENT_KIND],
  ])('blocks %s with exact reason code', (_label, item, family, reasonCode) => {
    const result = resolveTeacherLobbyAssignability(item, { family, strict: false });

    expect(result).toMatchObject({
      assignable: false,
      reasonCode,
    });
    expect(result.contentRef).toBeUndefined();
  });

  it('fails visibly in test for unregistered Teacher Lobby item families', () => {
    expect(() => assertTeacherLobbyFamilyRegistered('future_family')).toThrow(/future_family/);
  });
});
