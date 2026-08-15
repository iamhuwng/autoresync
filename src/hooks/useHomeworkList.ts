import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    getHomeworkByTeacher,
    getHomeworkByClass,
    getHomeworkForStudent,
    permanentlyDeleteHomework,
} from '../services/homeworkManager';
import { isBookHomeworkCompatibilityProjection } from '../services/book-homework/bookHomeworkCompatibilityProjection.service';
import type { HomeworkAssignment, HomeworkStatus } from '../types/homework.types';

export type HomeworkListSort =
    | 'dueDate_desc'
    | 'dueDate_asc'
    | 'createdAt_desc'
    | 'updatedAt_desc'
    | 'completionRate_desc'
    | 'completionRate_asc'
    | 'title_asc';

interface UseHomeworkListOptions {
    teacherId?: string;
    classId?: string;
    studentId?: string;
    statusFilter?: HomeworkStatus[];
    autoRefresh?: boolean;
    excludeArchived?: boolean;
    excludeClosed?: boolean;
    sortBy?: HomeworkListSort;
    tagFilter?: string | null;
    pageSize?: number;
    includeArchived?: boolean;
    archivedOnly?: boolean;
    tag?: string;
    searchQuery?: string;
}

export interface UseHomeworkListReturn {
    homework: HomeworkAssignment[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    filterByStatus: (status: HomeworkStatus | null) => void;
    filteredHomework: HomeworkAssignment[];
    loadMore: () => Promise<void>;
    hasMore: boolean;
    sort: HomeworkListSort;
    setSort: (sort: HomeworkListSort) => void;
    tagFilter: string | null;
    setTagFilter: (tag: string | null) => void;
    totalLoaded: number;
    statusCounts: Record<string, number>;
}

function normalizeSearchValue(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isBookHomework(homework: HomeworkAssignment): boolean {
    return isBookHomeworkCompatibilityProjection(homework);
}

function getCompletionRate(homework: HomeworkAssignment): number {
    if (typeof homework.stats?.completionRate === 'number') {
        return homework.stats.completionRate;
    }

    return (homework.stats?.submitted ?? 0) / Math.max(homework.stats?.totalAssigned ?? 1, 1);
}

function sortHomework(items: HomeworkAssignment[], sort: HomeworkListSort): HomeworkAssignment[] {
    const nextItems = [...items];

    nextItems.sort((left, right) => {
        switch (sort) {
            case 'dueDate_asc':
                return left.scheduling.dueDate - right.scheduling.dueDate;
            case 'createdAt_desc':
                return right.createdAt - left.createdAt;
            case 'updatedAt_desc':
                return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
            case 'completionRate_desc':
                return getCompletionRate(right) - getCompletionRate(left);
            case 'completionRate_asc':
                return getCompletionRate(left) - getCompletionRate(right);
            case 'title_asc':
                return (left.title || left.materialTitle).localeCompare(
                    right.title || right.materialTitle,
                    'vi',
                    { sensitivity: 'base' }
                );
            case 'dueDate_desc':
            default:
                return right.scheduling.dueDate - left.scheduling.dueDate;
        }
    });

    return nextItems;
}

function buildStatusCounts(items: HomeworkAssignment[]): Record<string, number> {
    const counts = items.reduce((acc, homework) => {
        acc[homework.status] = (acc[homework.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return {
        draft: counts.draft || 0,
        scheduled: counts.scheduled || 0,
        active: counts.active || 0,
        past_due: counts.past_due || 0,
        closed: counts.closed || 0,
    };
}

export function useHomeworkList(options: UseHomeworkListOptions): UseHomeworkListReturn {
    const {
        teacherId,
        classId,
        studentId,
        statusFilter,
        autoRefresh = false,
        excludeArchived,
        excludeClosed = true,
        sortBy = 'dueDate_desc',
        tagFilter: initialTagFilter,
        pageSize = 25,
        includeArchived = false,
        archivedOnly = false,
        tag,
        searchQuery
    } = options;

    const [homework, setHomework] = useState<HomeworkAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentStatusFilter, setCurrentStatusFilter] = useState<HomeworkStatus | null>(null);
    const [sort, setSortState] = useState<HomeworkListSort>(sortBy);
    const [activeTagFilter, setActiveTagFilter] = useState<string | null>(initialTagFilter ?? tag ?? null);
    const [displayCount, setDisplayCount] = useState(pageSize);

    const shouldExcludeArchived = archivedOnly
        ? false
        : excludeArchived ?? !includeArchived;

    // PRD-0034: Auto-purge is intentionally a side-effect (AC-5.6). Only the creator triggers it.
    const purgeExpiredArchived = useCallback((items: HomeworkAssignment[]) => {
        const now = Date.now();

        return items.filter((currentHomework) => {
            const shouldAutoPurge = Boolean(
                teacherId &&
                currentHomework.createdBy === teacherId &&
                currentHomework.archived === true &&
                currentHomework.trashExpiresAt &&
                currentHomework.trashExpiresAt < now
            );

            if (!shouldAutoPurge) {
                return true;
            }

            void permanentlyDeleteHomework(currentHomework.id).catch((purgeError) => {
                console.warn('[AutoPurge] Failed to purge', currentHomework.id, purgeError);
            });

            return false;
        });
    }, [teacherId]);

    useEffect(() => {
        setSortState(sortBy);
    }, [sortBy]);

    useEffect(() => {
        setActiveTagFilter(initialTagFilter ?? tag ?? null);
    }, [initialTagFilter, tag]);

    const fetchHomework = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            let data: HomeworkAssignment[] = [];

            if (teacherId) {
                data = await getHomeworkByTeacher(teacherId);
            } else if (classId) {
                data = await getHomeworkByClass(classId);
            } else if (studentId) {
                data = await getHomeworkForStudent(studentId);
            } else {
                setHomework([]);
                setLoading(false);
                return;
            }

            setHomework(purgeExpiredArchived(data));
        } catch (err) {
            console.error('Error fetching homework:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch homework');
        } finally {
            setLoading(false);
        }
    }, [teacherId, classId, studentId, purgeExpiredArchived]);

    useEffect(() => {
        fetchHomework();
    }, [fetchHomework]);

    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            void fetchHomework();
        }, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, [autoRefresh, fetchHomework]);

    const filterByStatus = useCallback((status: HomeworkStatus | null) => {
        setCurrentStatusFilter(status);
    }, []);

    const filteredHomeworkPool = useMemo(() => {
        const legacyHomework = homework.filter((currentHomework) => !isBookHomework(currentHomework));
        const bookHomework = homework.filter((currentHomework) => isBookHomework(currentHomework));
        let nextItems = [...legacyHomework];

        if (archivedOnly) {
            nextItems = nextItems.filter((currentHomework) => currentHomework.archived === true);
        } else if (shouldExcludeArchived) {
            nextItems = nextItems.filter((currentHomework) => currentHomework.archived !== true);
        }

        if (excludeClosed) {
            nextItems = nextItems.filter((currentHomework) => currentHomework.status !== 'closed');
        }

        if (statusFilter && statusFilter.length > 0) {
            nextItems = nextItems.filter((currentHomework) => statusFilter.includes(currentHomework.status));
        }

        if (currentStatusFilter) {
            nextItems = nextItems.filter((currentHomework) => currentHomework.status === currentStatusFilter);
        }

        if (activeTagFilter) {
            nextItems = nextItems.filter((currentHomework) =>
                (currentHomework.tags ?? []).includes(activeTagFilter)
            );
        }

        if (searchQuery?.trim()) {
            const normalizedQuery = normalizeSearchValue(searchQuery.trim());

            nextItems = nextItems.filter((currentHomework) => {
                const targetDisplayName =
                    currentHomework.target.type === 'class'
                        ? currentHomework.target.className ?? 'Unknown Class'
                        : currentHomework.target.type === 'course'
                            ? currentHomework.target.courseName ?? ''
                            : currentHomework.target.type === 'group'
                                ? currentHomework.target.groupName ?? ''
                                : currentHomework.target.studentNames?.join(', ') ?? currentHomework.target.studentIds.join(', ');

                const searchableValues = [
                    currentHomework.title ?? '',
                    currentHomework.materialTitle ?? '',
                    currentHomework.description ?? '',
                    targetDisplayName,
                    ...(currentHomework.tags ?? []),
                ];

                return searchableValues.some((value) =>
                    normalizeSearchValue(value).includes(normalizedQuery)
                );
            });
        }

        const sortedLegacyHomework = sortHomework(nextItems, sort);
        const hasLegacyStatusFilter = (statusFilter?.length ?? 0) > 0 || currentStatusFilter !== null;
        const filteredBookHomework = hasLegacyStatusFilter
            ? []
            : bookHomework.filter((currentHomework) => {
                if (archivedOnly && currentHomework.archived !== true) return false;
                if (shouldExcludeArchived && currentHomework.archived === true) return false;
                if (activeTagFilter && !(currentHomework.tags ?? []).includes(activeTagFilter)) return false;
                if (!searchQuery?.trim()) return true;

                const normalizedQuery = normalizeSearchValue(searchQuery.trim());
                const searchableValues = [
                    currentHomework.title ?? '',
                    currentHomework.materialTitle ?? '',
                    currentHomework.description ?? '',
                    ...(currentHomework.tags ?? []),
                ];
                return searchableValues.some((value) => normalizeSearchValue(value).includes(normalizedQuery));
            });

        const bookSort = sort === 'completionRate_desc' || sort === 'completionRate_asc'
            ? 'dueDate_desc'
            : sort;
        return [...sortedLegacyHomework, ...sortHomework(filteredBookHomework, bookSort)];
    }, [
        homework,
        archivedOnly,
        shouldExcludeArchived,
        excludeClosed,
        statusFilter,
        currentStatusFilter,
        activeTagFilter,
        searchQuery,
        sort,
    ]);

    useEffect(() => {
        setDisplayCount(pageSize);
    }, [
        pageSize,
        currentStatusFilter,
        activeTagFilter,
        searchQuery,
        archivedOnly,
        shouldExcludeArchived,
        excludeClosed,
        sort,
        statusFilter,
    ]);

    const filteredHomework = useMemo(
        () => filteredHomeworkPool.slice(0, displayCount),
        [filteredHomeworkPool, displayCount]
    );

    const statusCounts = useMemo(
        () => buildStatusCounts(homework.filter((currentHomework) => !isBookHomework(currentHomework))),
        [homework],
    );

    const loadMore = useCallback(async () => {
        setDisplayCount((currentCount) => currentCount + pageSize);
    }, [pageSize]);

    const setSort = useCallback((nextSort: HomeworkListSort) => {
        setSortState(nextSort);
    }, []);

    const setTagFilter = useCallback((nextTag: string | null) => {
        setActiveTagFilter(nextTag);
    }, []);

    return {
        homework,
        loading,
        error,
        refetch: fetchHomework,
        filterByStatus,
        filteredHomework,
        loadMore,
        hasMore: displayCount < filteredHomeworkPool.length,
        sort,
        setSort,
        tagFilter: activeTagFilter,
        setTagFilter,
        totalLoaded: filteredHomework.length,
        statusCounts,
    };
}
