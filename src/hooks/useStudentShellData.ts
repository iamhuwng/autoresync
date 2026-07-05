import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { getStudentClasses, subscribeToActiveSessions, subscribeToStudentClasses } from '../services/classManager';
import { subscribeToSession } from '../services/sessionManager';
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
    homeworkItems: StudentHomeworkItem[];
    notStarted: StudentHomeworkItem[];
    inProgress: StudentHomeworkItem[];
    completed: StudentHomeworkItem[];
    overdue: StudentHomeworkItem[];
    sortedAssignments: StudentHomeworkItem[];
    isHomeworkLoading: boolean;
    homeworkError: string | null;
    isClassesLoading: boolean;
    refreshClasses: () => Promise<void>;
    refreshHomeworkData: () => Promise<void>;
}

interface UseStudentShellDataOptions {
    enabled?: boolean;
}

function getLiveSessionWeight(status: string): number {
    if (status === 'in-progress') return 0;
    if (status === 'waiting') return 1;
    return 2;
}

export function useStudentShellData(options: UseStudentShellDataOptions = {}): StudentShellData {
    const enabled = options.enabled ?? true;
    const { user } = useAuth();
    const [enrolledClasses, setEnrolledClasses] = useState<ClassSummary[]>([]);
    const [classLiveSessions, setClassLiveSessions] = useState<StudentShellLiveSession[]>([]);
    const [isClassesLoading, setIsClassesLoading] = useState(enabled && Boolean(user?.uid));
    const membershipProjectionSignatureRef = useRef<string | null>(null);
    const previousMembershipSignatureRef = useRef<string | null>(null);
    const {
        homeworkItems = [],
        isLoading: isHomeworkLoading,
        error: homeworkError,
        refreshData: refreshHomeworkData,
        notStarted = [],
        inProgress = [],
        completed = [],
        overdue = [],
    } = useStudentHomeworkList(user?.uid || '', { enabled });

    const refreshClasses = useCallback(async () => {
        if (!enabled || !user?.uid) {
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
    }, [enabled, user?.uid]);

    useEffect(() => {
        if (enabled) {
            void refreshClasses();
            return;
        }

        setEnrolledClasses([]);
        setClassLiveSessions([]);
        setIsClassesLoading(false);
    }, [enabled, refreshClasses]);

    useEffect(() => {
        if (!enabled || !user?.uid) {
            membershipProjectionSignatureRef.current = null;
            return;
        }

        const unsubscribe = subscribeToStudentClasses(user.uid, (memberships) => {
            const nextSignature = Object.entries(memberships || {})
                .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
                .map(([classId, membership]) => {
                    const status =
                        typeof membership === 'object' && membership !== null && 'status' in membership
                            ? membership.status ?? 'unknown'
                            : 'unknown';
                    return `${classId}:${status}`;
                })
                .join('|');

            const previousSignature = membershipProjectionSignatureRef.current;
            membershipProjectionSignatureRef.current = nextSignature;

            if (previousSignature === null || previousSignature === nextSignature) {
                return;
            }

            void refreshClasses();
        });

        return () => {
            membershipProjectionSignatureRef.current = null;
            unsubscribe();
        };
    }, [enabled, refreshClasses, user?.uid]);

    const classMembershipSignature = useMemo(() => {
        if (!enabled || !user?.uid) {
            return null;
        }

        const sortedClassIds = enrolledClasses
            .map((cls) => cls.id)
            .sort((left, right) => left.localeCompare(right));

        return `${user.uid}:${sortedClassIds.join('|')}`;
    }, [enabled, enrolledClasses, user?.uid]);

    useEffect(() => {
        if (classMembershipSignature === null) {
            previousMembershipSignatureRef.current = null;
            return;
        }

        if (isClassesLoading) {
            return;
        }

        const previousSignature = previousMembershipSignatureRef.current;
        previousMembershipSignatureRef.current = classMembershipSignature;

        if (previousSignature === null || previousSignature === classMembershipSignature) {
            return;
        }

        void refreshHomeworkData();
    }, [classMembershipSignature, isClassesLoading, refreshHomeworkData]);

    useEffect(() => {
        if (!enabled || !enrolledClasses.length) {
            setClassLiveSessions([]);
            return;
        }

        let isCancelled = false;
        const sessionsByClass = new Map<string, Map<string, StudentShellLiveSession>>();
        const sessionPointersByClass = new Map<string, Record<string, SessionPointerMeta | boolean>>();
        const sessionSubscriptionsByClass = new Map<string, Map<string, () => void>>();

        const syncSessions = () => {
            if (isCancelled) return;

            const nextSessions = Array.from(sessionsByClass.values())
                .flatMap((sessions) => Array.from(sessions.values()))
                .sort((left, right) => {
                    const weightDelta = getLiveSessionWeight(left.status) - getLiveSessionWeight(right.status);
                    if (weightDelta !== 0) return weightDelta;
                    return right.createdAt - left.createdAt;
                });

            setClassLiveSessions(nextSessions);
        };

        const syncClassSession = (
            cls: ClassSummary,
            code: string,
            sessionData: Record<string, unknown> | null,
        ) => {
            if (isCancelled) return;

            const pointerMeta = sessionPointersByClass.get(cls.id)?.[code];
            const classSessions = sessionsByClass.get(cls.id) ?? new Map<string, StudentShellLiveSession>();

            if (!sessionData || sessionData.status === 'completed' || sessionData.status === 'expired') {
                classSessions.delete(code);
                sessionsByClass.set(cls.id, classSessions);
                syncSessions();
                return;
            }

            const createdAt =
                (typeof sessionData.createdAt === 'number' ? sessionData.createdAt : undefined)
                || (typeof pointerMeta === 'object' && pointerMeta?.createdAt)
                || 0;

            classSessions.set(code, {
                code,
                classId: cls.id,
                className: cls.name || cls.classCode || 'Class',
                createdAt,
                mode: typeof sessionData.mode === 'string' ? sessionData.mode : 'test',
                status: typeof sessionData.status === 'string' ? sessionData.status : 'waiting',
                title:
                    (typeof sessionData.testTitle === 'string' && sessionData.testTitle)
                    || 'Live Session',
            });

            sessionsByClass.set(cls.id, classSessions);
            syncSessions();
        };

        const reconcileClassSessions = (
            cls: ClassSummary,
            sessionPointers: Record<string, SessionPointerMeta | boolean>,
        ) => {
            if (isCancelled) return;

            const codes = Object.keys(sessionPointers || {});
            const nextCodeSet = new Set(codes);
            const activePointers = sessionPointers || {};
            sessionPointersByClass.set(cls.id, activePointers);

            let classSubscriptions = sessionSubscriptionsByClass.get(cls.id);
            if (!classSubscriptions) {
                classSubscriptions = new Map<string, () => void>();
                sessionSubscriptionsByClass.set(cls.id, classSubscriptions);
            }

            let classSessions = sessionsByClass.get(cls.id);
            if (!classSessions) {
                classSessions = new Map<string, StudentShellLiveSession>();
                sessionsByClass.set(cls.id, classSessions);
            }

            Array.from(classSubscriptions.entries()).forEach(([code, unsubscribe]) => {
                if (nextCodeSet.has(code)) {
                    return;
                }

                unsubscribe();
                classSubscriptions?.delete(code);
                classSessions?.delete(code);
            });

            if (!codes.length) {
                sessionsByClass.set(cls.id, new Map<string, StudentShellLiveSession>());
                syncSessions();
                return;
            }

            codes.forEach((code) => {
                if (classSubscriptions?.has(code)) {
                    return;
                }

                const unsubscribe = subscribeToSession(code, (sessionData) => {
                    try {
                        syncClassSession(
                            cls,
                            code,
                            sessionData && typeof sessionData === 'object'
                                ? (sessionData as Record<string, unknown>)
                                : null,
                        );
                    } catch (error) {
                        console.warn(`Skipping invalid live session ${code}`, error);
                    }
                });

                classSubscriptions?.set(code, unsubscribe);
            });
        };

        const unsubscribers = enrolledClasses.map((cls) =>
            subscribeToActiveSessions(cls.id, (sessionPointers) => {
                reconcileClassSessions(
                    cls,
                    (sessionPointers || {}) as Record<string, SessionPointerMeta | boolean>,
                );
            }),
        );

        return () => {
            isCancelled = true;
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            sessionSubscriptionsByClass.forEach((sessionSubscriptions) => {
                sessionSubscriptions.forEach((unsubscribe) => unsubscribe());
            });
        };
    }, [enabled, enrolledClasses]);

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
        homeworkItems,
        notStarted,
        inProgress,
        completed,
        overdue,
        sortedAssignments,
        isHomeworkLoading,
        homeworkError,
        isClassesLoading,
        refreshClasses,
        refreshHomeworkData,
    };
}
