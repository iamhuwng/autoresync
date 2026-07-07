/**
 * Writing Test Service
 * 
 * PRD-0030: IELTS Writing Test System
 * Handles CRUD for writing test drafts (Firestore) and publishing (RTDB).
 * Follows the testDraftService pattern from draftCloudService.ts.
 * 
 * @module services/writingTestService
 */

import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    updateDoc,
    query,
    where,
    orderBy,
    Timestamp,
} from 'firebase/firestore';
import { get, ref, set, push, update as dbUpdate } from 'firebase/database';
// @ts-ignore — JS service file
import { database, firestore as db } from './firebase';
import { deepRemoveUndefined } from './draftCloudService';
import { withRestoreGuard } from './restoreGuard';
import type { WritingTestDraft, IELTSWritingTest } from '../types/ielts-writing.types';
import { createLegacyTestMaterialSummary } from './materialCatalog/legacyTestMaterialSummary.service';
import { buildMaterialSummaryUpdatePayload } from './materialCatalog/materialSummaryPort.service';

// ═══════════════════════════════════════════════════════════════
// DRAFT OPERATIONS (Firestore: writing_drafts/{draftId})
// ═══════════════════════════════════════════════════════════════

const WRITING_DRAFTS_COLLECTION = 'writing_drafts';

function toDateOrFallback(value: unknown, fallback: Date): Date {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === 'number' || typeof value === 'string') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return fallback;
}

async function buildWritingDraftDocument(
    draftId: string,
    userId: string,
    draft: Partial<WritingTestDraft> & {
        metadata: WritingTestDraft['metadata'];
        tasks: WritingTestDraft['tasks'];
    },
    existingData: Record<string, any> | null = null,
): Promise<WritingTestDraft> {
    const fallbackCreatedAt = draft.createdAt instanceof Date ? draft.createdAt : new Date();

    return deepRemoveUndefined({
        id: draftId,
        userId: existingData?.userId || userId,
        testType: 'IELTS',
        skill: 'Writing',
        metadata: {
            title: draft.metadata?.title || '',
            description: draft.metadata?.description || '',
            duration: draft.metadata?.duration || 60,
            format: draft.metadata?.format || 'full-test',
            difficulty: draft.metadata?.difficulty,
            targetBand: draft.metadata?.targetBand,
            tags: Array.isArray(draft.metadata?.tags) ? draft.metadata.tags : [],
        },
        tasks: Array.isArray(draft.tasks) ? draft.tasks : [],
        isPublic: typeof draft.isPublic === 'boolean' ? draft.isPublic : Boolean(existingData?.isPublic),
        status: draft.status || existingData?.status || 'editing',
        publishedTestId: draft.publishedTestId || existingData?.publishedTestId,
        createdAt: toDateOrFallback(existingData?.createdAt, fallbackCreatedAt),
        updatedAt: new Date(),
    }) as WritingTestDraft;
}

/**
 * Save a writing test draft to Firestore.
 * [GAP-03] If draft.id is not set, generates a Firestore auto-ID.
 */
export const saveWritingDraft = withRestoreGuard<{ success: boolean; draftId?: string; error?: string }>(
    'WritingDraftSave',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    userId: string,
    draft: Partial<WritingTestDraft> & { metadata: WritingTestDraft['metadata']; tasks: WritingTestDraft['tasks'] }
): Promise<{ success: boolean; draftId?: string; error?: string }> => {
    try {
        let draftId = draft.id;
        let existingDraftData: Record<string, any> | null = null;

        if (!draftId) {
            draftId = doc(collection(db, WRITING_DRAFTS_COLLECTION)).id;
        } else {
            const existingSnap = await getDoc(doc(db, WRITING_DRAFTS_COLLECTION, draftId));
            existingDraftData = existingSnap.exists() ? existingSnap.data() : null;
        }

        const draftDoc = await buildWritingDraftDocument(draftId, userId, draft, existingDraftData);
        await setDoc(doc(db, WRITING_DRAFTS_COLLECTION, draftId), draftDoc);

        console.log('✅ Writing draft saved:', draftId);
        return { success: true, draftId };
    } catch (error) {
        console.error('❌ Failed to save writing draft:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save writing draft',
        };
    }
});

/**
 * Load a writing test draft by ID.
 */
export async function getWritingDraft(
    draftId: string
): Promise<{ success: boolean; data?: WritingTestDraft; error?: string }> {
    try {
        const draftRef = doc(db, WRITING_DRAFTS_COLLECTION, draftId);
        const snap = await getDoc(draftRef);

        if (!snap.exists()) {
            return { success: false, error: 'Writing draft not found' };
        }

        const data = snap.data();

        // Convert Firestore Timestamps to Date objects
        const draft: WritingTestDraft = {
            ...data,
            metadata: {
                title: data.metadata?.title || '',
                description: data.metadata?.description || '',
                duration: data.metadata?.duration || 60,
                format: data.metadata?.format || 'full-test',
                difficulty: data.metadata?.difficulty,
                targetBand: data.metadata?.targetBand,
                tags: Array.isArray(data.metadata?.tags) ? data.metadata.tags : [],
            },
            tasks: Array.isArray(data.tasks) ? data.tasks : [],
            isPublic: Boolean(data.isPublic),
            createdAt: data.createdAt instanceof Timestamp
                ? data.createdAt.toDate()
                : new Date(data.createdAt),
            updatedAt: data.updatedAt instanceof Timestamp
                ? data.updatedAt.toDate()
                : new Date(data.updatedAt),
        } as WritingTestDraft;

        return { success: true, data: draft };
    } catch (error) {
        console.error('❌ Failed to load writing draft:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to load writing draft',
        };
    }
}

/**
 * Update a writing test draft with partial data.
 */
export const updateWritingDraft = withRestoreGuard<{ success: boolean; error?: string }>(
    'WritingDraftUpdate',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    draftId: string,
    updates: Partial<Omit<WritingTestDraft, 'id' | 'userId' | 'createdAt'>>
): Promise<{ success: boolean; error?: string }> => {
    try {
        const draftRef = doc(db, WRITING_DRAFTS_COLLECTION, draftId);
        const sanitized = deepRemoveUndefined({
            ...updates,
            updatedAt: Timestamp.now(),
        });
        await updateDoc(draftRef, sanitized);

        console.log('✅ Writing draft updated:', draftId);
        return { success: true };
    } catch (error) {
        console.error('❌ Failed to update writing draft:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update writing draft',
        };
    }
});

/**
 * Delete a writing test draft permanently.
 */
export const deleteWritingDraft = withRestoreGuard<{ success: boolean; error?: string }>(
    'WritingDraftDelete',
    { success: false, error: 'Blocked by restore guard' }
)(async (draftId: string): Promise<{ success: boolean; error?: string }> => {
    try {
        await deleteDoc(doc(db, WRITING_DRAFTS_COLLECTION, draftId));
        console.log('✅ Writing draft deleted:', draftId);
        return { success: true };
    } catch (error) {
        console.error('❌ Failed to delete writing draft:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete writing draft',
        };
    }
});

/**
 * Get all writing drafts for a user, ordered by most recent.
 */
export async function getUserWritingDrafts(
    userId: string
): Promise<{ success: boolean; data?: WritingTestDraft[]; error?: string }> {
    try {
        const q = query(
            collection(db, WRITING_DRAFTS_COLLECTION),
            where('userId', '==', userId),
            orderBy('updatedAt', 'desc')
        );
        const snap = await getDocs(q);
        const drafts: WritingTestDraft[] = [];

        snap.forEach((docSnap) => {
            const data = docSnap.data();
            drafts.push({
                ...data,
                metadata: {
                    title: data.metadata?.title || '',
                    description: data.metadata?.description || '',
                    duration: data.metadata?.duration || 60,
                    format: data.metadata?.format || 'full-test',
                    difficulty: data.metadata?.difficulty,
                    targetBand: data.metadata?.targetBand,
                    tags: Array.isArray(data.metadata?.tags) ? data.metadata.tags : [],
                },
                tasks: Array.isArray(data.tasks) ? data.tasks : [],
                isPublic: Boolean(data.isPublic),
                createdAt: data.createdAt instanceof Timestamp
                    ? data.createdAt.toDate()
                    : new Date(data.createdAt),
                updatedAt: data.updatedAt instanceof Timestamp
                    ? data.updatedAt.toDate()
                    : new Date(data.updatedAt),
            } as WritingTestDraft);
        });

        return { success: true, data: drafts };
    } catch (error) {
        console.error('❌ Failed to get user writing drafts:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch writing drafts',
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// PUBLISH (RTDB: tests/{testId})
// ═══════════════════════════════════════════════════════════════

/**
 * Publish a writing test draft to RTDB.
 * [GAP-08] Generates test ID using Firebase push ID for chronological sorting.
 */
export const publishWritingTest = withRestoreGuard<{ success: boolean; testId?: string; draftId?: string; error?: string }>(
    'WritingTestPublish',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    draft: WritingTestDraft
): Promise<{ success: boolean; testId?: string; draftId?: string; error?: string }> => {
    try {
        const sourceDraftId = draft.id || doc(collection(db, WRITING_DRAFTS_COLLECTION)).id;
        const draftRef = doc(db, WRITING_DRAFTS_COLLECTION, sourceDraftId);
        const existingDraftData = draft.id
            ? await getDoc(draftRef).then((snap) => (snap.exists() ? snap.data() : null))
            : null;
        const testId = draft.publishedTestId || existingDraftData?.publishedTestId || push(ref(database, 'tests')).key;
        if (!testId) {
            return { success: false, error: 'Failed to generate test ID' };
        }

        const normalizedMetadata = {
            title: draft.metadata?.title || '',
            description: draft.metadata?.description || '',
            duration: draft.metadata?.duration || 60,
            format: draft.metadata?.format || 'full-test',
            difficulty: draft.metadata?.difficulty,
            targetBand: draft.metadata?.targetBand,
            tags: Array.isArray(draft.metadata?.tags) ? draft.metadata.tags : [],
        };
        const normalizedTasks = Array.isArray(draft.tasks) ? draft.tasks : [];
        const ownerId = existingDraftData?.userId || draft.userId;
        const isPublic = typeof draft.isPublic === 'boolean'
            ? draft.isPublic
            : Boolean(existingDraftData?.isPublic);
        const testData: IELTSWritingTest = {
            id: testId,
            type: 'IELTS',
            testType: 'IELTS',
            skill: 'Writing',
            title: normalizedMetadata.title || 'Untitled Writing Test',
            duration: normalizedMetadata.duration,
            questionCount: normalizedTasks.length,
            metadata: normalizedMetadata,
            tasks: normalizedTasks,
            createdBy: ownerId,
            ownerId,
            sourceDraftId,
            isPublic,
            createdAt: existingDraftData?.publishedTestId
                ? toDateOrFallback(existingDraftData?.createdAt, new Date()).getTime()
                : Date.now(),
            updatedAt: Date.now(),
            publishedAt: Date.now(),
        };

        // Deep-clean before writing to RTDB (undefined not allowed)
        const sanitized = deepRemoveUndefined(testData);
        const isRepublish = Boolean(
            draft.publishedTestId || existingDraftData?.publishedTestId,
        );
        const existingTestSnapshot = isRepublish
            ? await get(ref(database, `tests/${testId}`))
            : null;
        const existingTest = existingTestSnapshot?.exists()
            ? existingTestSnapshot.val() as Record<string, unknown>
            : null;
        const nextSummary = createLegacyTestMaterialSummary(testId, sanitized);
        const previousSummary = existingTest
            ? createLegacyTestMaterialSummary(testId, existingTest)
            : null;
        await dbUpdate(ref(database), {
            [`tests/${testId}`]: sanitized,
            ...buildMaterialSummaryUpdatePayload(nextSummary, previousSummary),
        });

        try {
            const draftDoc = await buildWritingDraftDocument(sourceDraftId, ownerId, {
                ...draft,
                id: sourceDraftId,
                isPublic,
                status: 'published',
                publishedTestId: testId,
            }, existingDraftData);
            await setDoc(draftRef, draftDoc);
        } catch (draftError) {
            console.error('⚠️ Published writing test without synced draft link:', draftError);
        }

        console.log('✅ Writing test published to RTDB:', testId);
        return { success: true, testId, draftId: sourceDraftId };
    } catch (error) {
        console.error('❌ Failed to publish writing test:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to publish writing test',
        };
    }
});

export const ensureWritingEditableDraft = withRestoreGuard<{ success: boolean; draftId?: string; error?: string }>(
    'WritingEditableDraftEnsure',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    test: IELTSWritingTest,
    userId: string
): Promise<{ success: boolean; draftId?: string; error?: string }> => {
    try {
        const draftId = test.sourceDraftId || doc(collection(db, WRITING_DRAFTS_COLLECTION)).id;
        const draftRef = doc(db, WRITING_DRAFTS_COLLECTION, draftId);
        const draftSnap = test.sourceDraftId ? await getDoc(draftRef) : null;

        if (!draftSnap || !draftSnap.exists()) {
            const draftDoc = deepRemoveUndefined({
                id: draftId,
                userId,
                testType: 'IELTS',
                skill: 'Writing',
                metadata: test.metadata,
                tasks: test.tasks,
                isPublic: Boolean(test.isPublic),
                status: 'published',
                publishedTestId: test.id,
                createdAt: toDateOrFallback(test.createdAt, new Date()),
                updatedAt: toDateOrFallback(test.updatedAt, new Date()),
            }) as WritingTestDraft;
            await setDoc(draftRef, draftDoc);
        }

        if (!test.sourceDraftId) {
            const updatedAt = Date.now();
            const nextTest = {
                ...test,
                sourceDraftId: draftId,
                updatedAt,
            };
            await dbUpdate(ref(database), {
                [`tests/${test.id}/sourceDraftId`]: draftId,
                [`tests/${test.id}/updatedAt`]: updatedAt,
                ...buildMaterialSummaryUpdatePayload(
                    createLegacyTestMaterialSummary(test.id, nextTest),
                    createLegacyTestMaterialSummary(test.id, test),
                ),
            });
        }

        return { success: true, draftId };
    } catch (error) {
        console.error('❌ Failed to ensure editable writing draft:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to prepare writing draft',
        };
    }
});

// Default export for convenience
const writingTestService = {
    saveWritingDraft,
    getWritingDraft,
    updateWritingDraft,
    deleteWritingDraft,
    getUserWritingDrafts,
    publishWritingTest,
    ensureWritingEditableDraft,
};

export default writingTestService;
