import { useMemo, useCallback } from 'react';

interface FilterParams {
  userId: string;
  userRole: string;
  contentFilter: 'my' | 'public' | 'drafts' | 'reading-passage' | 'book';
  searchTerm: string;
  testTypeFilter: string;
  thcsGradeFilter: string;
  thcsExamTypeFilter: string;
}

const ownedContentFilters = new Set(['my', 'reading-passage', 'book']);
const readingPassageKinds = new Set(['passage-asset', 'reading-passage', 'reading-passage-asset']);
const bookKinds = new Set(['book', 'material-book']);

const getMaterialKinds = (item: any): string[] => [
  item?.materialKind,
  item?.itemKind,
  item?.contentKind,
  item?.type,
  item?.metadata?.materialKind,
  item?.metadata?.itemKind,
  item?.metadata?.contentKind,
  item?.metadata?.type,
]
  .filter(Boolean)
  .map((value) => String(value).toLowerCase());

const matchesMaterialTab = (item: any, contentFilter: FilterParams['contentFilter']): boolean => {
  if (contentFilter === 'reading-passage') {
    return getMaterialKinds(item).some((kind) => readingPassageKinds.has(kind));
  }

  if (contentFilter === 'book') {
    return getMaterialKinds(item).some((kind) => bookKinds.has(kind));
  }

  return true;
};

const materialTimestamp = (item: any): number => {
  const value = item.updatedAt || item.publishedAt || item.createdAt || 0;
  if (typeof value === 'number') {
    return value;
  }
  return Date.parse(value) || 0;
};

export function useTestFilters(tests: any[], filters: FilterParams) {
  const { userId, contentFilter, searchTerm, testTypeFilter, thcsGradeFilter, thcsExamTypeFilter } = filters;

  const filterByOwnership = useCallback((items: any[]) => {
    if (!userId) return items;

    if (ownedContentFilters.has(contentFilter)) {
      return items.filter(item => {
        const hasOwnership = item.ownerId || item.createdBy;
        const isOwned = item.ownerId === userId || item.createdBy === userId;
        return isOwned || !hasOwnership;
      });
    }

    if (contentFilter === 'drafts') {
      return [];
    }

    // Public Library includes every public active summary, including owned rows.
    return items.filter(item => item.isPublic === true);
  }, [userId, contentFilter]);

  const filteredTests = useMemo(() => {
    const ownershipFiltered = filterByOwnership(tests);

    // Search filter
    let searchFiltered = ownershipFiltered.filter(test => {
      const title = test.metadata?.title || test.title;
      return (title || '').toLowerCase().includes(searchTerm.toLowerCase());
    });

    searchFiltered = searchFiltered.filter((test) => matchesMaterialTab(test, contentFilter));

    // Type filter — only in public library mode
    if (contentFilter === 'public' && testTypeFilter !== 'all') {
      if (testTypeFilter === 'THCS-THPT') {
        searchFiltered = searchFiltered.filter((t: any) => t.testType === 'THCS-THPT');
        if (thcsGradeFilter !== 'all') {
          const grade = parseInt(thcsGradeFilter, 10);
          searchFiltered = searchFiltered.filter((t: any) => t.metadata?.gradeLevel === grade);
        }
        if (thcsExamTypeFilter !== 'all') {
          searchFiltered = searchFiltered.filter((t: any) => t.metadata?.examType === thcsExamTypeFilter);
        }
      } else if (testTypeFilter === 'IELTS') {
        searchFiltered = searchFiltered.filter((t: any) => t.testType !== 'THCS-THPT');
      }
    }

    // Sort by publishedAt (newest first) in public library
    if (contentFilter === 'public') {
      searchFiltered.sort((a: any, b: any) => {
        const aDate = materialTimestamp(a);
        const bDate = materialTimestamp(b);
        return bDate - aDate;
      });
    }

    return searchFiltered;
  }, [tests, filterByOwnership, searchTerm, contentFilter, testTypeFilter, thcsGradeFilter, thcsExamTypeFilter]);

  return { filteredTests };
}
