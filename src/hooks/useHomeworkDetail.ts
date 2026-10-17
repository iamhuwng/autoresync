import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { firestore as db } from '../services/firebase';
import { isBookHomeworkCompatibilityProjection } from '../services/book-homework/bookHomeworkCompatibilityProjection.service';
import type { HomeworkAssignment, HomeworkSubmission } from '../types/homework.types';

export interface UseHomeworkDetailReturn {
    homework: HomeworkAssignment | null;
    submissions: HomeworkSubmission[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

function sortSubmissions(submissions: HomeworkSubmission[]): HomeworkSubmission[] {
    return [...submissions].sort(
        (a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0) || (b.startedAt ?? 0) - (a.startedAt ?? 0)
    );
}

const HOMEWORK_COLLECTION = 'homework_assignments';
const SUBMISSION_COLLECTION = 'homework_submissions';
type HomeworkReadMode = 'compatibility' | 'ordinary' | null;

export function useHomeworkDetail(homeworkId?: string): UseHomeworkDetailReturn {
    const [homework, setHomework] = useState<HomeworkAssignment | null>(null);
    const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
    const [homeworkLoading, setHomeworkLoading] = useState(true);
    const [submissionsLoading, setSubmissionsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [homeworkReadId, setHomeworkReadId] = useState<string | null>(null);
    const [homeworkReadMode, setHomeworkReadMode] = useState<HomeworkReadMode>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadHomework = useCallback(async () => {
        const normalizedHomeworkId = homeworkId?.trim();

        if (!normalizedHomeworkId) {
            setHomework(null);
            setSubmissions([]);
            setError(null);
            setHomeworkLoading(false);
            setSubmissionsLoading(false);
            setHomeworkReadId(null);
            setHomeworkReadMode(null);
            return;
        }

        setHomeworkLoading(true);
        setError(null);

        try {
            const homeworkRef = doc(db, HOMEWORK_COLLECTION, normalizedHomeworkId);
            const homeworkSnapshot = await getDoc(homeworkRef);

            if (!homeworkSnapshot.exists()) {
                setHomework(null);
                setError('Homework not found');
                setHomeworkReadMode('ordinary');
            } else {
                const nextHomework = {
                    id: homeworkSnapshot.id,
                    ...(homeworkSnapshot.data() as Omit<HomeworkAssignment, 'id'>),
                };
                setHomework(nextHomework);
                setHomeworkReadMode(
                    isBookHomeworkCompatibilityProjection(nextHomework) ? 'compatibility' : 'ordinary'
                );
            }
        } catch (err) {
            console.error('Error loading homework detail:', err);
            setError(err instanceof Error ? err.message : 'Failed to load homework');
            setHomeworkReadMode('ordinary');
        } finally {
            setHomeworkLoading(false);
            setHomeworkReadId(normalizedHomeworkId);
        }
    }, [homeworkId]);

    useEffect(() => {
        loadHomework();
    }, [loadHomework]);

    useEffect(() => {
        const normalizedHomeworkId = homeworkId?.trim();

        if (!normalizedHomeworkId) {
            setSubmissions([]);
            setSubmissionsLoading(false);
            return;
        }

        // Wait for the assignment detail read before deciding whether this is
        // the compatibility projection. Missing/ordinary assignments still
        // fall through to the existing submissions subscription once read.
        if (homeworkReadId !== normalizedHomeworkId || homeworkReadMode === null) {
            setSubmissionsLoading(true);
            return;
        }

        if (homeworkReadMode === 'compatibility') {
            setSubmissions([]);
            setSubmissionsLoading(false);
            return;
        }

        setSubmissionsLoading(true);

        const submissionsQuery = query(
            collection(db, SUBMISSION_COLLECTION),
            where('homeworkId', '==', normalizedHomeworkId)
        );

        const unsubscribe = onSnapshot(
            submissionsQuery,
            (snapshot) => {
                if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                }

                debounceTimerRef.current = setTimeout(() => {
                    const nextSubmissions = snapshot.docs.map((submissionDoc) => ({
                        id: submissionDoc.id,
                        ...(submissionDoc.data() as Omit<HomeworkSubmission, 'id'>),
                    } as HomeworkSubmission));
                    setSubmissions(sortSubmissions(nextSubmissions));
                    setSubmissionsLoading(false);
                }, 500);
            },
            (snapshotError) => {
                console.error('Error subscribing to homework submissions:', snapshotError);
                setError(snapshotError.message || 'Failed to subscribe to homework submissions');
                setSubmissionsLoading(false);
            }
        );

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            unsubscribe();
        };
    }, [homeworkId, homeworkReadId, homeworkReadMode]);

    const refetch = useCallback(async () => {
        await loadHomework();
    }, [loadHomework]);

    return {
        homework,
        submissions,
        loading: homeworkLoading || submissionsLoading,
        error,
        refetch,
    };
}

export default useHomeworkDetail;
