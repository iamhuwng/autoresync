import { useCallback, useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '../services/firebase';
import type { ClassStudent } from '../types/class.types';

export interface ClassRosterStudent {
    uid: string;
    name: string;
    email?: string;
}

export interface UseClassRosterReturn {
    students: ClassRosterStudent[];
    roster: ClassStudent[];
    rosterMap: Record<string, ClassStudent>;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

function normalizeRoster(students: Record<string, any> = {}): ClassStudent[] {
    return Object.entries(students)
        .map(([studentKey, student]) => ({
            id: student.id || student.uid || studentKey,
            uid: student.uid || student.id || studentKey,
            name: student.name || student.displayName || 'Unknown',
            email: student.email,
            joinedAt: student.joinedAt || 0,
            lastActiveAt: student.lastActiveAt || 0,
            isOnline: Boolean(student.isOnline),
            deviceInfo: student.deviceInfo,
            ipAddress: student.ipAddress,
            assignments: student.assignments || {},
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));
}

export function useClassRoster(classId?: string): UseClassRosterReturn {
    const [roster, setRoster] = useState<ClassStudent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (!classId) {
            setRoster([]);
            setError(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const snapshot = await get(ref(database, `classes/${classId}/students`));

            if (!snapshot.exists()) {
                setRoster([]);
                setLoading(false);
                return;
            }

            setRoster(normalizeRoster(snapshot.val()));
        } catch (err) {
            console.error('Error loading class roster:', err);
            setRoster([]);
            setError(err instanceof Error ? err.message : 'Failed to load class roster');
        } finally {
            setLoading(false);
        }
    }, [classId]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    useEffect(() => {
        if (!classId) {
            setRoster([]);
            setError(null);
            setLoading(false);
        }
    }, [classId]);

    const students = useMemo(
        () =>
            roster.map((student) => ({
                uid: student.uid || student.id,
                name: student.name,
                email: student.email,
            })),
        [roster]
    );

    const rosterMap = useMemo(
        () => roster.reduce<Record<string, ClassStudent>>((acc, student) => {
            acc[student.uid || student.id] = student;
            return acc;
        }, {}),
        [roster]
    );

    return {
        students,
        roster,
        rosterMap,
        loading,
        error,
        refetch,
    };
}

export default useClassRoster;
