import { useState, useEffect, useCallback } from 'react';
import {
    getHomeworkByTeacher,
    getHomeworkByClass,
    getHomeworkForStudent,
    updateHomeworkStatus
} from '../services/homeworkManager';
import type { HomeworkAssignment, HomeworkStatus } from '../types/homework.types';

interface UseHomeworkListOptions {
    teacherId?: string;
    classId?: string;
    studentId?: string;
    statusFilter?: HomeworkStatus[];
    autoRefresh?: boolean;
}

interface UseHomeworkListReturn {
    homework: HomeworkAssignment[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    filterByStatus: (status: HomeworkStatus | null) => void;
    filteredHomework: HomeworkAssignment[];
    statusCounts: Record<HomeworkStatus, number>;
}

/**
 * Hook to fetch and manage homework assignments
 */
export function useHomeworkList(options: UseHomeworkListOptions): UseHomeworkListReturn {
    const { teacherId, classId, studentId, statusFilter, autoRefresh = false } = options;

    const [homework, setHomework] = useState<HomeworkAssignment[]>([]);
    const [filteredHomework, setFilteredHomework] = useState<HomeworkAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentStatusFilter, setCurrentStatusFilter] = useState<HomeworkStatus | null>(null);

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
            }

            // Update statuses for all homework
            await Promise.all(
                data.map(hw => updateHomeworkStatus(hw.id).catch(err => {
                    console.warn(`Failed to update status for homework ${hw.id}:`, err);
                }))
            );

            // Refetch to get updated statuses
            if (teacherId) {
                data = await getHomeworkByTeacher(teacherId);
            } else if (classId) {
                data = await getHomeworkByClass(classId);
            } else if (studentId) {
                data = await getHomeworkForStudent(studentId);
            }

            // Apply status filter if provided
            if (statusFilter && statusFilter.length > 0) {
                data = data.filter(hw => statusFilter.includes(hw.status));
            }

            setHomework(data);
            setFilteredHomework(data);
        } catch (err) {
            console.error('Error fetching homework:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch homework');
        } finally {
            setLoading(false);
        }
    }, [teacherId, classId, studentId, statusFilter]);

    useEffect(() => {
        fetchHomework();
    }, [fetchHomework]);

    // Auto-refresh every 5 minutes if enabled
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchHomework();
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearInterval(interval);
    }, [autoRefresh, fetchHomework]);

    const filterByStatus = useCallback((status: HomeworkStatus | null) => {
        setCurrentStatusFilter(status);

        if (status === null) {
            setFilteredHomework(homework);
        } else {
            setFilteredHomework(homework.filter(hw => hw.status === status));
        }
    }, [homework]);

    // Calculate status counts
    const statusCounts = homework.reduce((acc, hw) => {
        acc[hw.status] = (acc[hw.status] || 0) + 1;
        return acc;
    }, {} as Record<HomeworkStatus, number>);

    // Ensure all statuses have a count (even if 0)
    const allStatusCounts: Record<HomeworkStatus, number> = {
        draft: statusCounts.draft || 0,
        scheduled: statusCounts.scheduled || 0,
        active: statusCounts.active || 0,
        past_due: statusCounts.past_due || 0,
        closed: statusCounts.closed || 0,
    };

    return {
        homework,
        loading,
        error,
        refetch: fetchHomework,
        filterByStatus,
        filteredHomework,
        statusCounts: allStatusCounts,
    };
}
