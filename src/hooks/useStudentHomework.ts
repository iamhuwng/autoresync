/**
 * useStudentHomework – PRD-0034 Task 13.3
 *
 * Fetches all homework submissions for a given student,
 * groups them by homeworkId, and batch-loads the associated
 * HomeworkAssignment docs to avoid N+1 queries.
 *
 * Returns: groups (homework + submissions), loading, error.
 * Paginated at 25 submissions with loadMore support (AC-9.7).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    startAfter,
    where,
    type DocumentData,
    type QueryDocumentSnapshot,
    type QueryConstraint,
} from 'firebase/firestore';
import { firestore as db } from '../services/firebase';
import type { HomeworkAssignment, HomeworkSubmission } from '../types/homework.types';

const SUBMISSION_COLLECTION = 'homework_submissions';
const HOMEWORK_COLLECTION = 'homework_assignments';
const PAGE_SIZE = 25;

export interface StudentHomeworkGroup {
    homework: HomeworkAssignment;
    submissions: HomeworkSubmission[];
}

interface UseStudentHomeworkReturn {
    groups: StudentHomeworkGroup[];
    loading: boolean;
    error: string | null;
    loadMore: () => void;
    hasMore: boolean;
    /** Flattened summary stats */
    summary: {
        totalHomework: number;
        completedCount: number;
        completionRate: number;
        avgScore: number;
        lateCount: number;
    };
}

/** Lightweight cache for homework docs to avoid re-fetching across pagination */
const homeworkCache = new Map<string, HomeworkAssignment>();

export function useStudentHomework(studentId: string): UseStudentHomeworkReturn {
    const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
    const [homeworkMap, setHomeworkMap] = useState<Map<string, HomeworkAssignment>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

    const fetchPage = useCallback(
        async (isInitial: boolean) => {
            if (!studentId) return;

            try {
                setLoading(true);
                setError(null);

                const constraints: QueryConstraint[] = [
                    where('studentId', '==', studentId),
                    orderBy('submittedAt', 'desc'),
                ];
                if (!isInitial && lastDoc) {
                    constraints.push(startAfter(lastDoc));
                }
                constraints.push(limit(PAGE_SIZE + 1));

                const q = query(collection(db, SUBMISSION_COLLECTION), ...constraints);
                const snap = await getDocs(q);

                const docs = snap.docs;
                const fetchedMore = docs.length > PAGE_SIZE;
                const pageDocs = fetchedMore ? docs.slice(0, PAGE_SIZE) : docs;

                const newSubs: HomeworkSubmission[] = pageDocs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                } as HomeworkSubmission));

                // Collect unique homework IDs that we haven't cached yet
                const newHomeworkIds = new Set<string>();
                newSubs.forEach((s) => {
                    if (!homeworkCache.has(s.homeworkId)) {
                        newHomeworkIds.add(s.homeworkId);
                    }
                });

                // Batch-load homework docs
                if (newHomeworkIds.size > 0) {
                    const hwPromises = Array.from(newHomeworkIds).map(async (hwId) => {
                        try {
                            const hwDoc = await getDoc(doc(db, HOMEWORK_COLLECTION, hwId));
                            if (hwDoc.exists()) {
                                const hw = { id: hwDoc.id, ...hwDoc.data() } as HomeworkAssignment;
                                homeworkCache.set(hwId, hw);
                                return hw;
                            }
                        } catch {
                            // Ignore individual fetch failures
                        }
                        return null;
                    });
                    await Promise.all(hwPromises);
                }

                // Update state
                setSubmissions((prev) => (isInitial ? newSubs : [...prev, ...newSubs]));
                setHomeworkMap(new Map(homeworkCache));
                setHasMore(fetchedMore);
                setLastDoc(pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] ?? null : null);
            } catch (err) {
                console.error('[useStudentHomework] fetch error:', err);
                setError(err instanceof Error ? err.message : 'Failed to load submissions');
            } finally {
                setLoading(false);
            }
        },
        [studentId, lastDoc]
    );

    // Initial fetch
    useEffect(() => {
        homeworkCache.clear();
        setSubmissions([]);
        setLastDoc(null);
        setHasMore(false);
        fetchPage(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId]);

    const loadMore = useCallback(() => {
        if (!loading && hasMore) {
            fetchPage(false);
        }
    }, [loading, hasMore, fetchPage]);

    // Group submissions by homeworkId
    const groups = useMemo(() => {
        const map = new Map<string, HomeworkSubmission[]>();
        submissions.forEach((s) => {
            const list = map.get(s.homeworkId) ?? [];
            list.push(s);
            map.set(s.homeworkId, list);
        });

        const result: StudentHomeworkGroup[] = [];
        map.forEach((subs, hwId) => {
            const hw = homeworkMap.get(hwId);
            if (hw) {
                result.push({ homework: hw, submissions: subs });
            }
        });

        return result;
    }, [submissions, homeworkMap]);

    // Summary stats
    const summary = useMemo(() => {
        const totalHomework = groups.length;
        let completedCount = 0;
        let scoreSum = 0;
        let scoreCount = 0;
        let lateCount = 0;

        groups.forEach(({ submissions: subs }) => {
            const hasSubmitted = subs.some(
                (s) => s.status === 'submitted' || s.status === 'graded'
            );
            if (hasSubmitted) completedCount++;

            const lateSub = subs.some((s) => s.isLate);
            if (lateSub) lateCount++;

            // Best score for this homework
            const scores = subs
                .map((s) => s.percentage ?? s.score)
                .filter((v): v is number => typeof v === 'number');
            if (scores.length > 0) {
                scoreSum += Math.max(...scores);
                scoreCount++;
            }
        });

        return {
            totalHomework,
            completedCount,
            completionRate: totalHomework > 0
                ? Math.round((completedCount / totalHomework) * 100)
                : 0,
            avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
            lateCount,
        };
    }, [groups]);

    return { groups, loading, error, loadMore, hasMore, summary };
}
