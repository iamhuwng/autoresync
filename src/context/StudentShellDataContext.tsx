import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useStudentShellData, type StudentShellData } from '../hooks/useStudentShellData';
import { useStudentHomeworkList, type UseStudentHomeworkListReturn } from '../hooks/useHomeworkSubmission';
import {
    prefetchStudentAcademicRecordRouteData,
    prefetchStudentCoursesRouteData,
    prefetchStudentLibraryRouteData,
} from './studentShellPrefetch';

const StudentShellDataContext = createContext<StudentShellData | null>(null);

interface StudentShellDataProviderProps {
    children: React.ReactNode;
}

export const StudentShellDataProvider: React.FC<StudentShellDataProviderProps> = ({ children }) => {
    const { user } = useAuth();
    const shellData = useStudentShellData();
    const prefetchedLibraryRef = useRef<Set<string>>(new Set());
    const prefetchedAcademicRecordRef = useRef<Set<string>>(new Set());
    const prefetchedCoursesRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (import.meta.env.MODE === 'test') {
            return;
        }

        if (!user?.uid) {
            return;
        }

        if (prefetchedLibraryRef.current.has(user.uid) && prefetchedAcademicRecordRef.current.has(user.uid)) {
            return;
        }

        const studentId = user.uid;
        const timer = setTimeout(() => {
            if (!prefetchedLibraryRef.current.has(studentId)) {
                prefetchedLibraryRef.current.add(studentId);
                void prefetchStudentLibraryRouteData(studentId).catch(() => {
                    prefetchedLibraryRef.current.delete(studentId);
                });
            }

            if (!prefetchedAcademicRecordRef.current.has(studentId)) {
                prefetchedAcademicRecordRef.current.add(studentId);
                void prefetchStudentAcademicRecordRouteData(studentId).catch(() => {
                    prefetchedAcademicRecordRef.current.delete(studentId);
                });
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [user?.uid]);

    useEffect(() => {
        if (import.meta.env.MODE === 'test') {
            return;
        }

        if (!user?.uid || shellData.isClassesLoading) {
            return;
        }

        if (prefetchedCoursesRef.current.has(user.uid)) {
            return;
        }

        prefetchedCoursesRef.current.add(user.uid);
        const studentId = user.uid;
        const studentClasses = shellData.enrolledClasses;
        const timer = setTimeout(() => {
            void prefetchStudentCoursesRouteData({
                studentId,
                studentClasses,
            }).catch(() => {
                prefetchedCoursesRef.current.delete(studentId);
            });
        }, 400);

        return () => clearTimeout(timer);
    }, [
        shellData.enrolledClasses,
        shellData.isClassesLoading,
        user?.uid,
    ]);

    return (
        <StudentShellDataContext.Provider value={shellData}>
            {children}
        </StudentShellDataContext.Provider>
    );
};

export function useStudentShellDataContext(): StudentShellData | null {
    return useContext(StudentShellDataContext);
}

export function useResolvedStudentShellData(): StudentShellData {
    const contextValue = useStudentShellDataContext();
    const fallbackValue = useStudentShellData({ enabled: contextValue === null });

    return contextValue ?? fallbackValue;
}

export function useResolvedStudentHomeworkList(studentId: string): UseStudentHomeworkListReturn {
    const contextValue = useStudentShellDataContext();
    const fallbackValue = useStudentHomeworkList(studentId, { enabled: contextValue === null });

    if (contextValue) {
        return {
            homeworkItems: contextValue.homeworkItems,
            isLoading: contextValue.isHomeworkLoading,
            error: contextValue.homeworkError,
            refreshData: contextValue.refreshHomeworkData,
            notStarted: contextValue.notStarted,
            inProgress: contextValue.inProgress,
            completed: contextValue.completed,
            overdue: contextValue.overdue,
        };
    }

    return fallbackValue;
}
