import { useMemo, useCallback } from 'react';

interface FilterParams {
  userId: string;
  userRole: string;
  contentFilter: 'my' | 'public' | 'drafts';
  searchTerm: string;
  testTypeFilter: string;
  thcsGradeFilter: string;
  thcsExamTypeFilter: string;
}

export function useTestFilters(tests: any[], filters: FilterParams) {
  const { userId, userRole, contentFilter, searchTerm, testTypeFilter, thcsGradeFilter, thcsExamTypeFilter } = filters;

  const filterByOwnership = useCallback((items: any[]) => {
    if (!userId) return items;

    // Super admins see ALL content when "My Content" is selected
    if (userRole === 'super_admin' && contentFilter === 'my') {
      return items;
    }

    if (contentFilter === 'my') {
      return items.filter(item => {
        const hasOwnership = item.ownerId || item.createdBy;
        const isOwned = item.ownerId === userId || item.createdBy === userId;
        return isOwned || !hasOwnership;
      });
    } else {
      // Public: only public content not owned by current user
      return items.filter(item => item.isPublic === true && item.ownerId !== userId);
    }
  }, [userId, userRole, contentFilter]);

  const filteredTests = useMemo(() => {
    const ownershipFiltered = filterByOwnership(tests);

    // Search filter
    let searchFiltered = ownershipFiltered.filter(test => {
      const title = test.testType === 'THCS-THPT' ? test.metadata?.title : test.title;
      return (title || '').toLowerCase().includes(searchTerm.toLowerCase());
    });

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
        const aDate = a.publishedAt || a.createdAt || 0;
        const bDate = b.publishedAt || b.createdAt || 0;
        return bDate - aDate;
      });
    }

    return searchFiltered;
  }, [tests, filterByOwnership, searchTerm, contentFilter, testTypeFilter, thcsGradeFilter, thcsExamTypeFilter]);

  return { filteredTests };
}
