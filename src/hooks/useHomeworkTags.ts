import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore as db } from '../services/firebase';
import type { HomeworkTagConfig } from '../types/homework.types';

export type HomeworkTag = HomeworkTagConfig['tags'][number];

export const DEFAULT_HOMEWORK_TAGS: HomeworkTag[] = [
    { id: 'practice', label: 'Luyện tập', color: '#3b82f6' },
    { id: 'midterm', label: 'Giữa kỳ', color: '#8b5cf6' },
    { id: 'final', label: 'Cuối kỳ', color: '#ef4444' },
    { id: 'revision', label: 'Ôn tập', color: '#10b981' },
    { id: 'extra', label: 'Bổ sung', color: '#f59e0b' },
    { id: 'homework', label: 'Bài tập về nhà', color: '#64748b' },
    { id: 'test-prep', label: 'Ôn thi', color: '#6366f1' },
];

const HOMEWORK_TAGS_DOC = 'app_config/homework_tags';

function buildDefaultHomeworkTagConfig(updatedBy = 'system'): HomeworkTagConfig {
    return {
        tags: DEFAULT_HOMEWORK_TAGS,
        updatedAt: Date.now(),
        updatedBy,
    };
}

export async function ensureHomeworkTagsConfig(updatedBy = 'system'): Promise<HomeworkTagConfig> {
    const docRef = doc(db, HOMEWORK_TAGS_DOC);
    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {
        const data = snapshot.data() as HomeworkTagConfig;
        return {
            tags: Array.isArray(data.tags) && data.tags.length > 0 ? data.tags : DEFAULT_HOMEWORK_TAGS,
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
            updatedBy: typeof data.updatedBy === 'string' && data.updatedBy.length > 0 ? data.updatedBy : updatedBy,
        };
    }

    const defaultConfig = buildDefaultHomeworkTagConfig(updatedBy);
    await setDoc(docRef, defaultConfig, { merge: true });
    return defaultConfig;
}

export async function saveHomeworkTagsConfig(tags: HomeworkTag[], updatedBy: string): Promise<void> {
    const docRef = doc(db, HOMEWORK_TAGS_DOC);
    await setDoc(docRef, {
        tags,
        updatedAt: Date.now(),
        updatedBy,
    }, { merge: true });
}

export function useHomeworkTags(): { tags: HomeworkTag[]; loading: boolean } {
    const [tags, setTags] = useState<HomeworkTag[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const docRef = doc(db, HOMEWORK_TAGS_DOC);
        let active = true;
        let unsubscribe: (() => void) | undefined;

        const initialize = async () => {
            try {
                const config = await ensureHomeworkTagsConfig();
                if (active) {
                    setTags(config.tags);
                }

                unsubscribe = onSnapshot(docRef, (snapshot) => {
                    if (!active) {
                        return;
                    }

                    if (!snapshot.exists()) {
                        setTags(DEFAULT_HOMEWORK_TAGS);
                        setLoading(false);
                        return;
                    }

                    const data = snapshot.data() as Partial<HomeworkTagConfig>;
                    setTags(Array.isArray(data.tags) && data.tags.length > 0 ? data.tags : DEFAULT_HOMEWORK_TAGS);
                    setLoading(false);
                }, (error) => {
                    console.error('[HomeworkTags] Snapshot failed:', error);
                    if (active) {
                        setTags(DEFAULT_HOMEWORK_TAGS);
                        setLoading(false);
                    }
                });
            } catch (error) {
                console.error('[HomeworkTags] Failed to load config:', error);
                if (active) {
                    setTags(DEFAULT_HOMEWORK_TAGS);
                    setLoading(false);
                }
            }
        };

        void initialize();

        return () => {
            active = false;
            unsubscribe?.();
        };
    }, []);

    return {
        tags,
        loading,
    };
}

export default useHomeworkTags;
