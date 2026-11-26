/**
 * useTeacherStudentRoster
 *
 * Loads the roster and teacher-scoped context for `/teacher/students` in the
 * minimum number of round-trips:
 *   1. one indexed query for this teacher's active assignments
 *   2. all assigned student profiles fetched in parallel
 *   3. teacher's classes (with active student memberships) and own student
 *      requests fetched in parallel without blocking student cards
 *
 * All slices share monotonic per-slice request generation guards so overlapping
 * refreshes, teacher switches, or unmounts can never overwrite newer state, and
 * failures retain previously loaded data while surfacing explicit retryable errors.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    getAssignmentsByTeacher,
    getAssignmentRequestsByTeacher,
} from '../../services/assignmentManager';
import {
    getTeacherClassesWithMembers,
    type TeacherClassWithMembers,
} from '../../services/classManager';
import { getUserById, type UserProfile } from '../../services/userService';
import type { AssignmentRequest, StudentTeacherAssignment } from '../../types/assignment.types';

export interface SelectOptionItem {
    value: string;
    label: string;
}

export interface StudentClassTag {
    id: string;
    name: string;
    classCode: string;
}

export interface TeacherStudentRoster {
    students: UserProfile[];
    assignments: StudentTeacherAssignment[];
    assignmentsByStudent: Record<string, StudentTeacherAssignment[]>;
    classes: TeacherClassWithMembers[];
    classOptions: SelectOptionItem[];
    classesByStudent: Record<string, StudentClassTag[]>;
    requests: AssignmentRequest[];
    pendingRequestCount: number;
    /** True only until the first roster load settles (success or failure). */
    loading: boolean;
    /** True while a manual refresh runs after the first load. */
    refreshing: boolean;
    error: string | null;
    classesError: string | null;
    requestsError: string | null;
    reload: () => Promise<void>;
    reloadClasses: () => Promise<void>;
    reloadRequests: () => Promise<void>;
}

const byNewestFirst = (a: UserProfile, b: UserProfile) => (b.createdAt || 0) - (a.createdAt || 0);

export function useTeacherStudentRoster(teacherId: string | null | undefined): TeacherStudentRoster {
    const [students, setStudents] = useState<UserProfile[]>([]);
    const [assignments, setAssignments] = useState<StudentTeacherAssignment[]>([]);
    const [classes, setClasses] = useState<TeacherClassWithMembers[]>([]);
    const [requests, setRequests] = useState<AssignmentRequest[]>([]);
    const [loading, setLoading] = useState<boolean>(Boolean(teacherId));
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [classesError, setClassesError] = useState<string | null>(null);
    const [requestsError, setRequestsError] = useState<string | null>(null);

    const rosterRequestIdRef = useRef(0);
    const classesRequestIdRef = useRef(0);
    const requestsRequestIdRef = useRef(0);
    const hasLoadedRef = useRef(false);

    const reloadClasses = useCallback(async () => {
        const requestId = ++classesRequestIdRef.current;

        if (!teacherId) {
            setClasses([]);
            setClassesError(null);
            return;
        }

        setClassesError(null);
        try {
            const fetchedClasses = await getTeacherClassesWithMembers(teacherId);
            if (requestId !== classesRequestIdRef.current) return;
            setClasses(fetchedClasses);
        } catch (err) {
            console.error('[useTeacherStudentRoster] Failed to load classes:', err);
            if (requestId !== classesRequestIdRef.current) return;
            setClassesError('Could not load your classes. Try again.');
        }
    }, [teacherId]);

    const reloadRequests = useCallback(async () => {
        const requestId = ++requestsRequestIdRef.current;

        if (!teacherId) {
            setRequests([]);
            setRequestsError(null);
            return;
        }

        setRequestsError(null);
        try {
            const fetchedRequests = await getAssignmentRequestsByTeacher(teacherId);
            if (requestId !== requestsRequestIdRef.current) return;
            setRequests(fetchedRequests);
        } catch (err) {
            console.error('[useTeacherStudentRoster] Failed to load requests:', err);
            if (requestId !== requestsRequestIdRef.current) return;
            setRequestsError('Could not load your student requests. Try again.');
        }
    }, [teacherId]);

    const reload = useCallback(async () => {
        const requestId = ++rosterRequestIdRef.current;

        if (!teacherId) {
            classesRequestIdRef.current += 1;
            requestsRequestIdRef.current += 1;
            setStudents([]);
            setAssignments([]);
            setClasses([]);
            setRequests([]);
            setError(null);
            setClassesError(null);
            setRequestsError(null);
            setLoading(false);
            setRefreshing(false);
            return;
        }

        if (hasLoadedRef.current) setRefreshing(true);
        setError(null);

        // Fire auxiliary fetches immediately in parallel via the shared guarded
        // refreshers so they do not block student cards or race standalone refreshes.
        const classesPromise = reloadClasses();
        const requestsPromise = reloadRequests();

        try {
            const teacherAssignments = await getAssignmentsByTeacher(teacherId);
            const studentIds = Array.from(new Set(
                teacherAssignments.map((a) => a.studentId).filter(Boolean)
            ));

            const profiles = await Promise.all(studentIds.map(async (studentId) => {
                try {
                    return await getUserById(studentId);
                } catch (profileError) {
                    console.error(`[useTeacherStudentRoster] Failed to load profile ${studentId}:`, profileError);
                    return null;
                }
            }));

            if (requestId !== rosterRequestIdRef.current) return;

            setAssignments(teacherAssignments);
            setStudents(
                profiles
                    .filter((profile): profile is UserProfile => profile !== null)
                    .sort(byNewestFirst)
            );
            hasLoadedRef.current = true;
        } catch (loadError) {
            console.error('[useTeacherStudentRoster] Failed to load roster:', loadError);
            if (requestId !== rosterRequestIdRef.current) return;
            setError('Could not load your students. Try Sync again.');
        } finally {
            if (requestId === rosterRequestIdRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }

        await Promise.all([classesPromise, requestsPromise]);
    }, [teacherId, reloadClasses, reloadRequests]);

    useEffect(() => {
        hasLoadedRef.current = false;
        setStudents([]);
        setAssignments([]);
        setClasses([]);
        setRequests([]);
        setError(null);
        setClassesError(null);
        setRequestsError(null);
        setLoading(Boolean(teacherId));
        void reload();

        return () => {
            rosterRequestIdRef.current += 1;
            classesRequestIdRef.current += 1;
            requestsRequestIdRef.current += 1;
        };
    }, [reload, teacherId]);

    const assignmentsByStudent = useMemo(() => {
        const grouped: Record<string, StudentTeacherAssignment[]> = {};
        assignments.forEach((assignment) => {
            (grouped[assignment.studentId] ||= []).push(assignment);
        });
        return grouped;
    }, [assignments]);

    const classesByStudent = useMemo(() => {
        const grouped: Record<string, StudentClassTag[]> = {};
        classes.forEach((cls) => {
            if (cls.status === 'archived') return;
            const tag: StudentClassTag = {
                id: cls.id,
                name: cls.name,
                classCode: cls.classCode,
            };
            cls.studentIds.forEach((studentId) => {
                (grouped[studentId] ||= []).push(tag);
            });
        });
        return grouped;
    }, [classes]);

    const classOptions = useMemo<SelectOptionItem[]>(() => (
        classes
            .filter((cls) => cls.status === 'active')
            .map((cls) => ({
                value: cls.id,
                label: `${cls.name} (${cls.classCode})`,
            }))
    ), [classes]);

    const pendingRequestCount = useMemo(
        () => requests.filter((req) => req.status === 'pending').length,
        [requests]
    );

    return {
        students,
        assignments,
        assignmentsByStudent,
        classes,
        classOptions,
        classesByStudent,
        requests,
        pendingRequestCount,
        loading,
        refreshing,
        error,
        classesError,
        requestsError,
        reload,
        reloadClasses,
        reloadRequests,
    };
}
