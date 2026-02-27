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
import { ref, set, push } from 'firebase/database';
// @ts-ignore — JS service file
import { database, firestore as db } from './firebase';
import { deepRemoveUndefined } from './draftCloudService';
import { withRestoreGuard } from './restoreGuard';
import type { WritingTestDraft, IELTSWritingTest } from '../types/ielts-writing.types';

// ═══════════════════════════════════════════════════════════════
// DRAFT OPERATIONS (Firestore: writing_drafts/{draftId})
// ═══════════════════════════════════════════════════════════════

const WRITING_DRAFTS_COLLECTION = 'writing_drafts';

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
        // [GAP-03] Generate draftId if not set
        let draftId = draft.id;
        if (!draftId) {
            draftId = doc(collection(db, WRITING_DRAFTS_COLLECTION)).id;
        }

        const draftDoc: WritingTestDraft = {
            id: draftId,
            userId,
            testType: 'IELTS',
            skill: 'Writing',
            metadata: draft.metadata,
            tasks: draft.tasks,
            status: draft.status || 'editing',
            createdAt: draft.createdAt || new Date(),
            updatedAt: new Date(),
        };

        const sanitized = deepRemoveUndefined(draftDoc);
        await setDoc(doc(db, WRITING_DRAFTS_COLLECTION, draftId), sanitized);

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
export const publishWritingTest = withRestoreGuard<{ success: boolean; testId?: string; error?: string }>(
    'WritingTestPublish',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    draft: WritingTestDraft
): Promise<{ success: boolean; testId?: string; error?: string }> => {
    try {
        // [GAP-08] Generate test ID using push() for chronologically-sortable unique ID
        const testId = push(ref(database, 'tests')).key;
        if (!testId) {
            return { success: false, error: 'Failed to generate test ID' };
        }

        const testData: IELTSWritingTest = {
            id: testId,
            testType: 'IELTS',
            skill: 'Writing',
            metadata: draft.metadata,
            tasks: draft.tasks,
            createdBy: draft.userId,
            ownerId: draft.userId,
            isPublic: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            publishedAt: Date.now(),
        };

        // Deep-clean before writing to RTDB (undefined not allowed)
        const sanitized = deepRemoveUndefined(testData);
        await set(ref(database, 'tests/' + testId), sanitized);

        console.log('✅ Writing test published to RTDB:', testId);
        return { success: true, testId };
    } catch (error) {
        console.error('❌ Failed to publish writing test:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to publish writing test',
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
};

export default writingTestService;
