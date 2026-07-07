import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTestFilters } from '../test/useTestFilters';

const mockTests = [
  { id: '1', title: 'IELTS Reading', ownerId: 'user-1', isPublic: false, testType: 'IELTS', createdAt: 1000 },
  { id: '2', title: 'IELTS Listening', ownerId: 'user-2', isPublic: true, testType: 'IELTS', publishedAt: 3000 },
  { id: '3', testType: 'THCS-THPT', ownerId: 'user-1', isPublic: true, metadata: { title: 'Grade 9 Test', gradeLevel: 9, examType: 'Giữa Kì' }, publishedAt: 2000 },
  { id: '4', testType: 'THCS-THPT', ownerId: 'user-2', isPublic: true, metadata: { title: 'Grade 7 Final', gradeLevel: 7, examType: 'Cuối Kì' }, publishedAt: 4000 },
  { id: '5', title: 'Legacy Test', isPublic: false }, // No owner
  { id: '6', title: 'Passage Asset', ownerId: 'user-1', isPublic: false, materialKind: 'passage-asset' },
  { id: '7', title: 'Book Package', ownerId: 'user-1', isPublic: false, materialKind: 'book' },
  { id: '8', title: 'Public Passage Asset', ownerId: 'user-2', isPublic: true, materialKind: 'passage-asset' },
];

const defaultFilters = {
  userId: 'user-1',
  userRole: 'teacher',
  contentFilter: 'my' as const,
  searchTerm: '',
  testTypeFilter: 'all',
  thcsGradeFilter: 'all',
  thcsExamTypeFilter: 'all',
};

describe('useTestFilters', () => {
  it('filters "my" content by ownership', () => {
    const { result } = renderHook(() => useTestFilters(mockTests, defaultFilters));
    const ids = result.current.filteredTests.map(t => t.id);

    expect(ids).toContain('1'); // owned
    expect(ids).not.toContain('2'); // not owned
    expect(ids).toContain('3'); // owned
    expect(ids).not.toContain('4'); // not owned
    expect(ids).toContain('5'); // no owner = legacy
  });

  it('filters public content while retaining owned public materials', () => {
    const { result } = renderHook(() => useTestFilters(mockTests, { ...defaultFilters, contentFilter: 'public' }));
    const ids = result.current.filteredTests.map(t => t.id);

    expect(ids).not.toContain('1'); // not public
    expect(ids).toContain('2'); // public + not owner
    expect(ids).toContain('3'); // public and owned remains visible
    expect(ids).toContain('4'); // public + not owner
  });

  it('applies search term filter', () => {
    const { result } = renderHook(() => useTestFilters(mockTests, { ...defaultFilters, searchTerm: 'listening' }));
    expect(result.current.filteredTests).toHaveLength(0); // "IELTS Listening" is owned by user-2
  });

  it('applies search on THCS metadata title', () => {
    const { result } = renderHook(() => useTestFilters(mockTests, { ...defaultFilters, searchTerm: 'Grade 9' }));
    expect(result.current.filteredTests.some(t => t.id === '3')).toBe(true);
  });

  it('filters the reading passage tab to owned passage assets only', () => {
    const { result } = renderHook(() => useTestFilters(mockTests, {
      ...defaultFilters,
      contentFilter: 'reading-passage',
    }));
    const ids = result.current.filteredTests.map(t => t.id);

    expect(ids).toEqual(['6']);
  });

  it('filters the book tab to owned book packages only', () => {
    const { result } = renderHook(() => useTestFilters(mockTests, {
      ...defaultFilters,
      contentFilter: 'book',
    }));
    const ids = result.current.filteredTests.map(t => t.id);

    expect(ids).toEqual(['7']);
  });

  it('filters by test type in public library', () => {
    const { result } = renderHook(() => useTestFilters(mockTests, {
      ...defaultFilters,
      contentFilter: 'public',
      testTypeFilter: 'THCS-THPT',
    }));

    result.current.filteredTests.forEach(t => {
      expect(t.testType).toBe('THCS-THPT');
    });
  });

  it('filters by grade in THCS-THPT public library', () => {
    const { result } = renderHook(() => useTestFilters(mockTests, {
      ...defaultFilters,
      contentFilter: 'public',
      testTypeFilter: 'THCS-THPT',
      thcsGradeFilter: '7',
    }));

    expect(result.current.filteredTests.every(t => t.metadata?.gradeLevel === 7)).toBe(true);
  });

  it('filters by exam type in THCS-THPT public library', () => {
    const { result } = renderHook(() => useTestFilters(mockTests, {
      ...defaultFilters,
      contentFilter: 'public',
      testTypeFilter: 'THCS-THPT',
      thcsExamTypeFilter: 'Cuối Kì',
    }));

    expect(result.current.filteredTests.every(t => t.metadata?.examType === 'Cuối Kì')).toBe(true);
  });

  it('sorts public library by newest first', () => {
    const { result } = renderHook(() => useTestFilters(mockTests, { ...defaultFilters, contentFilter: 'public' }));
    const dates = result.current.filteredTests.map(t => t.publishedAt || t.createdAt || 0);

    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }
  });

  it('super_admin My Content remains owner scoped', () => {
    const { result } = renderHook(() => useTestFilters(mockTests, {
      ...defaultFilters,
      userRole: 'super_admin',
    }));

    expect(result.current.filteredTests.map(t => t.id)).toEqual(['1', '3', '5', '6', '7']);
  });

  it('returns empty array when tests is empty', () => {
    const { result } = renderHook(() => useTestFilters([], defaultFilters));
    expect(result.current.filteredTests).toEqual([]);
  });
});
