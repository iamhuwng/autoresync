import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { getStudentClasses, subscribeToActiveSessions } from '../services/classManager';
import { getSession } from '../services/sessionManager';
import { useStudentHomeworkList, type StudentHomeworkItem } from './useHomeworkSubmission';
import type { ClassSummary } from '../types/class.types';

interface SessionPointerMeta {
    createdAt?: number;
}

export interface StudentShellLiveSession {
    code: string;
    classId: string;
    className: string;
    createdAt: number;
    mode: string;
    status: string;
    title: string;
}

export interface StudentShellData {
    enrolledClasses: ClassSummary[];
    classLiveSessions: StudentShellLiveSession[];
    notStarted: StudentHomeworkItem[];
    inProgress: StudentHomeworkItem[];
    overdue: StudentHomeworkItem[];
    sortedAssignments: StudentHomeworkItem[];
    isClassesLoading: boolean;
    refreshClasses: () => Promise<void>;
}

function getLiveSessionWeight(status: string): number {
    if (status === 'in-progress') return 0;
    if (status === 'waiting') return 1;
    return 2;
}

export function useStudentShellData(): StudentShellData {
    const { user } = useAuth();
    const [enrolledClasses, setEnrolledClasses] = useState<ClassSummary[]>([]);
    const [classLiveSessions, setClassLiveSessions] = useState<StudentShellLiveSession[]>([]);
    const [isClassesLoading, setIsClassesLoading] = useState(true);
    const { notStarted = [], inProgress = [], overdue = [] } = useStudentHomeworkList(user?.uid || '');

    const refreshClasses = useCallback(async () => {
        if (!user?.uid) {
            setEnrolledClasses([]);
            setIsClassesLoading(false);
            return;
        }

        setIsClassesLoading(true);
        try {
            const classes = await getStudentClasses(user.uid);
            setEnrolledClasses(classes || []);
        } catch (error) {
            console.error('Error loading student shell classes:', error);
            setEnrolledClasses([]);
        } finally {
            setIsClassesLoading(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        void refreshClasses();
    }, [refreshClasses]);

    useEffect(() => {
        if (!enrolledClasses.length) {
            setClassLiveSessions([]);
            return;
        }

        let isCancelled = false;
        const sessionsByClass = new Map<string, StudentShellLiveSession[]>();

        const syncSessions = () => {
            if (isCancelled) return;

            const nextSessions = Array.from(sessionsByClass.values())
                .flat()
                .sort((left, right) => {
                    const weightDelta = getLiveSessionWeight(left.status) - getLiveSessionWeight(right.status);
                    if (weightDelta !== 0) return weightDelta;
                    return right.createdAt - left.createdAt;
                });

            setClassLiveSessions(nextSessions);
        };

        const hydrateClassSessions = async (
            cls: ClassSummary,
            sessionPointers: Record<string, SessionPointerMeta | boolean>,
        ) => {
            if (isCancelled) return;

            const codes = Object.keys(sessionPointers || {});
            if (!codes.length) {
                sessionsByClass.set(cls.id, []);
                syncSessions();
                return;
            }

            const hydratedSessions = await Promise.all(
                codes.map(async (code) => {
                    try {
                        const sessionData = await getSession(code);
                        if (!sessionData || sessionData.status === 'completed' || sessionData.status === 'expired') {
                            return null;
                        }

                        const pointerMeta = sessionPointers[code];
                        const createdAt =
                            sessionData.createdAt
                            || (typeof pointerMeta === 'object' && pointerMeta?.createdAt)
                            || 0;

                        return {
                            code,
                            classId: cls.id,
                            className: cls.name || cls.classCode || 'Class',
                            createdAt,
                            mode: sessionData.mode || 'quiz',
                            status: sessionData.status || 'waiting',
                            title: sessionData.testTitle || sessionData.quizTitle || 'Live Session',
                        } satisfies StudentShellLiveSession;
                    } catch (error) {
                        console.warn(`Skipping invalid live session ${code}`, error);
                        return null;
                    }
                }),
            );

            sessionsByClass.set(
                cls.id,
                hydratedSessions.filter((session): session is StudentShellLiveSession => session !== null),
            );
            syncSessions();
        };

        const unsubscribers = enrolledClasses.map((cls) =>
            subscribeToActiveSessions(cls.id, (sessionPointers) => {
                void hydrateClassSessions(
                    cls,
                    (sessionPointers || {}) as Record<string, SessionPointerMeta | boolean>,
                );
            }),
        );

        return () => {
            isCancelled = true;
            unsubscribers.forEach((unsubscribe) => unsubscribe());
        };
    }, [enrolledClasses]);

    const sortedAssignments = useMemo(
        () =>
            [...notStarted, ...inProgress, ...overdue].sort(
                (left, right) =>
                    (left.homework?.scheduling?.dueDate || Number.POSITIVE_INFINITY)
                    - (right.homework?.scheduling?.dueDate || Number.POSITIVE_INFINITY),
            ),
        [inProgress, notStarted, overdue],
    );

    return {
        enrolledClasses,
        classLiveSessions,
        notStarted,
        inProgress,
        overdue,
        sortedAssignments,
        isClassesLoading,
        refreshClasses,
    };
}
