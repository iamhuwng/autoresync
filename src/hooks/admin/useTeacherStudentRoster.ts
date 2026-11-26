/**
 * useTeacherStudentRoster
 *
 * Loads the roster and teacher-scoped context for `/teacher/students` in the
 * minimum number of round-trips:
 *   1. one indexed query for this teacher's active assignments
 *   2. all assigned student profiles fetched in parallel
 *   3. teacher's classes (with active student memberships), courses, and own
 *      student requests fetched in parallel without blocking student cards
 *
 * Previously the page downloaded the whole `student_teacher_assignments` node
 * three times (`useSecureService`, `getTeacherStudents`, `getAllAssignments`),
 * fetched each student profile sequentially, and ran courses/classes serially.
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
import { getCoursesByOwner } from '../../services/courseManager';
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
    courses: SelectOptionItem[];
    requests: AssignmentRequest[];
    pendingRequestCount: number;
    /** True only until the first roster load settles (success or failure). */
    loading: boolean;
    /** True while a manual refresh runs after the first load. */
    refreshing: boolean;
    error: string | null;
    reload: () => Promise<void>;
    reloadClasses: () => Promise<void>;
    reloadRequests: () => Promise<void>;
}

const byNewestFirst = (a: UserProfile, b: UserProfile) => (b.createdAt || 0) - (a.createdAt || 0);

export function useTeacherStudentRoster(teacherId: string | null | undefined): TeacherStudentRoster {
    const [students, setStudents] = useState<UserProfile[]>([]);
    const [assignments, setAssignments] = useState<StudentTeacherAssignment[]>([]);
    const [classes, setClasses] = useState<TeacherClassWithMembers[]>([]);
    const [courses, setCourses] = useState<SelectOptionItem[]>([]);
    const [requests, setRequests] = useState<AssignmentRequest[]>([]);
    const [loading, setLoading] = useState<boolean>(Boolean(teacherId));
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const requestIdRef = useRef(0);
    const auxRequestIdRef = useRef(0);
    const hasLoadedRef = useRef(false);

    const reloadClasses = useCallback(async () => {
        if (!teacherId) {
            setClasses([]);
            return;
        }
        try {
            const fetchedClasses = await getTeacherClassesWithMembers(teacherId);
            setClasses(fetchedClasses);
        } catch (err) {
            console.error('[useTeacherStudentRoster] Failed to load classes:', err);
        }
    }, [teacherId]);

    const reloadRequests = useCallback(async () => {
        if (!teacherId) {
            setRequests([]);
            return;
        }
        try {
            const fetchedRequests = await getAssignmentRequestsByTeacher(teacherId);
            setRequests(fetchedRequests);
        } catch (err) {
            console.error('[useTeacherStudentRoster] Failed to load requests:', err);
        }
    }, [teacherId]);

    const loadAuxiliaryContext = useCallback(async (activeTeacherId: string) => {
        const auxId = ++auxRequestIdRef.current;
        const [classesResult, coursesResult, requestsResult] = await Promise.allSettled([
            getTeacherClassesWithMembers(activeTeacherId),
            getCoursesByOwner(activeTeacherId),
            getAssignmentRequestsByTeacher(activeTeacherId),
        ]);

        if (auxId !== auxRequestIdRef.current) return;

        if (classesResult.status === 'fulfilled') {
            setClasses(classesResult.value);
        } else {
            console.error('[useTeacherStudentRoster] Failed to load classes:', classesResult.reason);
        }

        if (coursesResult.status === 'fulfilled') {
            setCourses(
                coursesResult.value.map((course) => ({
                    value: course.id,
                    label: `${course.name} (${course.code})`,
                }))
            );
        } else {
            console.error('[useTeacherStudentRoster] Failed to load courses:', coursesResult.reason);
        }

        if (requestsResult.status === 'fulfilled') {
            setRequests(requestsResult.value);
        } else {
            console.error('[useTeacherStudentRoster] Failed to load requests:', requestsResult.reason);
        }
    }, []);

    const reload = useCallback(async () => {
        const requestId = ++requestIdRef.current;

        if (!teacherId) {
            // Resolve the loading state for the "no teacher" branch too.
            setStudents([]);
            setAssignments([]);
            setClasses([]);
            setCourses([]);
            setRequests([]);
            setLoading(false);
            setRefreshing(false);
            return;
        }

        if (hasLoadedRef.current) setRefreshing(true);
        setError(null);

        // Fire auxiliary fetches immediately in parallel; do not block rendering
        // student cards if courses or requests take longer.
        const auxPromise = loadAuxiliaryContext(teacherId);

        try {
            const teacherAssignments = await getAssignmentsByTeacher(teacherId);
            const studentIds = Array.from(new Set(
                teacherAssignments.map(a => a.studentId).filter(Boolean)
            ));

            const profiles = await Promise.all(studentIds.map(async (studentId) => {
                try {
                    return await getUserById(studentId);
                } catch (profileError) {
                    console.error(`[useTeacherStudentRoster] Failed to load profile ${studentId}:`, profileError);
                    return null;
                }
            }));

            if (requestId !== requestIdRef.current) return;

            setAssignments(teacherAssignments);
            setStudents(
                profiles
                    .filter((profile): profile is UserProfile => profile !== null)
                    .sort(byNewestFirst)
            );
            hasLoadedRef.current = true;
        } catch (loadError) {
            console.error('[useTeacherStudentRoster] Failed to load roster:', loadError);
            if (requestId !== requestIdRef.current) return;
            setError('Could not load your students. Try Sync again.');
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }

        await auxPromise;
    }, [teacherId, loadAuxiliaryContext]);

    useEffect(() => {
        hasLoadedRef.current = false;
        setLoading(Boolean(teacherId));
        void reload();
        return () => {
            requestIdRef.current += 1;
            auxRequestIdRef.current += 1;
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
        courses,
        requests,
        pendingRequestCount,
        loading,
        refreshing,
        error,
        reload,
        reloadClasses,
        reloadRequests,
    };
}
