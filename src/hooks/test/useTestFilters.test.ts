import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTestFilters } from './useTestFilters';

const baseFilters = {
  userId: 'teacher-1',
  userRole: 'teacher',
  contentFilter: 'my' as const,
  searchTerm: '',
  testTypeFilter: 'all',
  thcsGradeFilter: 'all',
  thcsExamTypeFilter: 'all',
};

const tests = [
  {
    id: 'legacy-reading',
    ownerId: 'teacher-1',
    title: 'Legacy Reading',
    testType: 'IELTS',
    skill: 'Reading',
  },
  {
    id: 'reading-passage',
    ownerId: 'teacher-1',
    title: 'Passage 1',
    materialKind: 'reading-passage',
  },
  {
    id: 'book-1',
    ownerId: 'teacher-1',
    title: 'Book 1',
    materialKind: 'book',
  },
  {
    id: 'public-passage',
    ownerId: 'teacher-2',
    title: 'Public Passage',
    materialKind: 'reading-passage',
    isPublic: true,
  },
  {
    id: 'public-book',
    ownerId: 'teacher-2',
    title: 'Public Book',
    materialKind: 'book',
    isPublic: true,
  },
];

describe('useTestFilters', () => {
  it('includes every owned material kind in My Content', () => {
    const { result } = renderHook(() => useTestFilters(tests, baseFilters));

    expect(result.current.filteredTests.map((test) => test.id)).toEqual([
      'legacy-reading',
      'reading-passage',
      'book-1',
    ]);
  });

  it('keeps Reading Passage and Book content inside their dedicated tabs', () => {
    const reading = renderHook(() =>
      useTestFilters(tests, { ...baseFilters, contentFilter: 'reading-passage' }),
    );
    const books = renderHook(() =>
      useTestFilters(tests, { ...baseFilters, contentFilter: 'book' }),
    );

    expect(reading.result.current.filteredTests.map((test) => test.id)).toEqual(['reading-passage']);
    expect(books.result.current.filteredTests.map((test) => test.id)).toEqual(['book-1']);
  });

  it('includes public Reading Passage and Book rows in Public Library', () => {
    const { result } = renderHook(() =>
      useTestFilters(tests, { ...baseFilters, contentFilter: 'public' }),
    );

    expect(result.current.filteredTests.map((test) => test.id)).toEqual([
      'public-passage',
      'public-book',
    ]);
  });
});
