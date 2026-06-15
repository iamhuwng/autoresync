import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isTeacherMaterialsVisualFixturesEnabled,
  listTeacherMaterialsFixtureBooks,
  listTeacherMaterialsFixtureReadingPassages,
} from './teacherMaterialsVisualFixtures';

describe('teacherMaterialsVisualFixtures', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires the explicit PRD0052 visual fixture flag', () => {
    vi.stubEnv('VITE_PRD0052_TEACHER_MATERIALS_VISUAL_FIXTURES', '');
    expect(isTeacherMaterialsVisualFixturesEnabled()).toBe(false);

    vi.stubEnv('VITE_PRD0052_TEACHER_MATERIALS_VISUAL_FIXTURES', 'true');
    expect(isTeacherMaterialsVisualFixturesEnabled()).toBe(true);
  });

  it('filters Reading Passage fixtures by scope, search, and Test Type', () => {
    const rows = listTeacherMaterialsFixtureReadingPassages({
      scope: 'private',
      searchTerm: 'urban',
      testTypeId: 'ielts',
      teacherId: 'teacher-1',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerId: 'teacher-1',
      materialId: 'prd0052-fixture-reading-ielts-urban-light',
      visibility: 'private',
      sourceOrderDisplay: 'Passage 1',
    });
    expect(rows[0].testTypeIds).toEqual(['ielts']);
  });

  it('filters Book fixtures by scope, search, and Test Type', () => {
    const rows = listTeacherMaterialsFixtureBooks({
      scope: 'private',
      searchTerm: 'builder',
      testTypeId: 'ielts',
      teacherId: 'teacher-1',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerId: 'teacher-1',
      bookId: 'prd0052-fixture-book-ielts-builder',
      visibility: 'private',
      status: 'draft',
    });
    expect(rows[0].testTypeIds).toEqual(['ielts']);
  });

  it('keeps public fixtures out of the private scope', () => {
    expect(listTeacherMaterialsFixtureBooks({ scope: 'private', testTypeId: 'toeic' })).toHaveLength(0);
    expect(listTeacherMaterialsFixtureBooks({ scope: 'public', testTypeId: 'toeic' })).toHaveLength(1);
    expect(listTeacherMaterialsFixtureReadingPassages({ scope: 'private', testTypeId: 'toeic' })).toHaveLength(0);
    expect(listTeacherMaterialsFixtureReadingPassages({ scope: 'public', testTypeId: 'toeic' })).toHaveLength(1);
  });
});
