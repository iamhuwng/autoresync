/**
 * useResultsByContext Hook
 * PRD-0016: Solo Study & Homework System - Phase 5
 * 
 * Fetches results filtered by context type (class_session, homework, self_study).
 * Supports teacher visibility with proper access control.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    getStudentAllResults,
    getResultsForAssignedStudents,
    getHomeworkResults,
    type StudentResult
} from '../services/resultsService';

// ============================================================================
// TYPES
// ============================================================================

export type ResultContextType = 'class_session' | 'homework' | 'self_study' | 'all';

interface UseResultsByContextOptions {
    /** Teacher ID for access verification */
    teacherId?: string;
    /** Student ID to filter by (for viewing individual student) */
    studentId?: string;
    /** Homework ID to filter by (for viewing homework submissions) */
    homeworkId?: string;
    /** Context type filter */
    contextType?: ResultContextType;
    /** Enable auto-refresh */
    autoRefresh?: boolean;
    /** Refresh interval in ms (default: 30000) */
    refreshInterval?: number;
}

interface UseResultsByContextReturn {
    /** Filtered results */
    results: StudentResult[];
    /** Loading state */
    isLoading: boolean;
    /** Error message if any */
    error: string | null;
    /** Refresh results manually */
    refresh: () => Promise<void>;
    /** Filter by context type */
    filterByContext: (context: ResultContextType) => void;
    /** Current context filter */
    currentContext: ResultContextType;
    /** Results grouped by context */
    resultsByContext: {
        class_session: StudentResult[];
        homework: StudentResult[];
        self_study: StudentResult[];
    };
    /** Statistics */
    stats: {
        total: number;
        byContext: Record<ResultContextType | 'all', number>;
    };
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for fetching and filtering results by context
 */
export function useResultsByContext({
    teacherId,
    studentId,
    homeworkId,
    contextType = 'all',
    autoRefresh = false,
    refreshInterval = 30000
}: UseResultsByContextOptions): UseResultsByContextReturn {
    const [allResults, setAllResults] = useState<StudentResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentContext, setCurrentContext] = useState<ResultContextType>(contextType);

    /**
     * Fetch results based on the configured filters
     */
    const fetchResults = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            let fetchedResults: StudentResult[] = [];

            // Priority: homeworkId > studentId > teacherId
            if (homeworkId) {
                // Fetch results for a specific homework
                fetchedResults = await getHomeworkResults(homeworkId);
            } else if (studentId && teacherId) {
                // Fetch results for a specific student (with teacher access verification)
                fetchedResults = await getStudentAllResults(studentId, teacherId);
            } else if (teacherId) {
                // Fetch all results for assigned students
                fetchedResults = await getResultsForAssignedStudents(teacherId);
            } else if (studentId) {
                // Student viewing their own results (no teacher verification)
                fetchedResults = await getStudentAllResults(studentId);
            } else {
                // No filter provided
                console.warn('useResultsByContext: No teacherId, studentId, or homeworkId provided');
                fetchedResults = [];
            }

            setAllResults(fetchedResults);
        } catch (err) {
            console.error('Error fetching results:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch results');
        } finally {
            setIsLoading(false);
        }
    }, [teacherId, studentId, homeworkId]);

    /**
     * Initial fetch and auto-refresh
     */
    useEffect(() => {
        fetchResults();

        if (autoRefresh && refreshInterval > 0) {
            const interval = setInterval(fetchResults, refreshInterval);
            return () => clearInterval(interval);
        }
        return undefined;
    }, [fetchResults, autoRefresh, refreshInterval]);

    /**
     * Filter results by context type
     */
    const filteredResults = useMemo(() => {
        if (currentContext === 'all') {
            return allResults;
        }

        return allResults.filter(result => {
            const resultContext = result.context?.type || 'class_session';
            return resultContext === currentContext;
        });
    }, [allResults, currentContext]);

    /**
     * Group results by context type
     */
    const resultsByContext = useMemo(() => {
        const groups = {
            class_session: [] as StudentResult[],
            homework: [] as StudentResult[],
            self_study: [] as StudentResult[]
        };

        allResults.forEach(result => {
            const ctxType = result.context?.type || 'class_session';
            if (ctxType in groups) {
                groups[ctxType as keyof typeof groups].push(result);
            }
        });

        return groups;
    }, [allResults]);

    /**
     * Calculate statistics
     */
    const stats = useMemo(() => ({
        total: allResults.length,
        byContext: {
            all: allResults.length,
            class_session: resultsByContext.class_session.length,
            homework: resultsByContext.homework.length,
            self_study: resultsByContext.self_study.length
        }
    }), [allResults, resultsByContext]);

    /**
     * Filter by context type
     */
    const filterByContext = useCallback((context: ResultContextType) => {
        setCurrentContext(context);
    }, []);

    /**
     * Manual refresh
     */
    const refresh = useCallback(async () => {
        await fetchResults();
    }, [fetchResults]);

    return {
        results: filteredResults,
        isLoading,
        error,
        refresh,
        filterByContext,
        currentContext,
        resultsByContext,
        stats
    };
}

export default useResultsByContext;
