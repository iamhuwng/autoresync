/**
 * THCS-THPT Draft Service
 * Firestore CRUD for THCS-THPT drafts (thcs_drafts/ collection)
 * Follows the EXACT same patterns as testDraftService in draftCloudService.ts
 *
 * Backup: thcs_drafts auto-discovered by dynamic backup (PRD-0026). Verified 2026-02-26.
 */

import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    Timestamp,
    getFirestore,
} from 'firebase/firestore';
import { deepRemoveUndefined, convertTimestamps } from './draftCloudService';
import type { ServiceResponse } from '../types/draft.types';
import type { THCSDraft, THCSTestMetadata, THCSSection } from '../types/thcs-test.types';

/**
 * Firestore instance
 */
const db = getFirestore();

/**
 * Collection path for THCS drafts
 */
const THCS_DRAFTS_COLLECTION = 'thcs_drafts';

/**
 * Create a new THCS-THPT draft document
 * Creates doc in thcs_drafts/{auto-id} with initial empty state
 */
export async function createThcsDraft(
    userId: string,
    metadata: THCSTestMetadata
): Promise<ServiceResponse<{ draftId: string }>> {
    try {
        const draftData = deepRemoveUndefined({
            userId,
            testType: 'THCS-THPT',
            metadata,
            sections: [] as THCSSection[],
            questionCount: 0,
            totalPoints: 0,
            status: 'editing',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });

        const docRef = await addDoc(collection(db, THCS_DRAFTS_COLLECTION), draftData);
        const draftId = docRef.id;

        console.log('✅ THCS draft created:', draftId);
        return { success: true, data: { draftId } };
    } catch (error) {
        console.error('❌ [thcsDraftService] Failed to create THCS draft:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create draft',
        };
    }
}

/**
 * Load a THCS-THPT draft by ID
 * Reads from thcs_drafts/{draftId}, converts Timestamps to Date
 */
export async function loadThcsDraft(
    draftId: string
): Promise<ServiceResponse<THCSDraft>> {
    try {
        const draftRef = doc(db, THCS_DRAFTS_COLLECTION, draftId);
        const draftSnap = await getDoc(draftRef);

        if (!draftSnap.exists()) {
            return { success: false, error: 'THCS draft not found' };
        }

        const data = draftSnap.data();
        const draft = convertTimestamps<THCSDraft>({
            ...data,
            id: draftSnap.id,
        });

        console.log('✅ THCS draft loaded:', draftId);
        return { success: true, data: draft };
    } catch (error) {
        console.error('❌ [thcsDraftService] Failed to load THCS draft:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to load draft',
        };
    }
}

/**
 * Update a THCS-THPT draft with partial data
 * Always sets updatedAt to current timestamp
 */
export async function updateThcsDraft(
    draftId: string,
    updates: Partial<THCSDraft>
): Promise<ServiceResponse> {
    try {
        const draftRef = doc(db, THCS_DRAFTS_COLLECTION, draftId);

        const updateData = deepRemoveUndefined({
            ...updates,
            updatedAt: Timestamp.now(),
        });

        await updateDoc(draftRef, updateData);

        console.log('✅ THCS draft updated:', draftId);
        return { success: true };
    } catch (error) {
        console.error('❌ [thcsDraftService] Failed to update THCS draft:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update draft',
        };
    }
}

/**
 * Delete a THCS-THPT draft permanently
 */
export async function deleteThcsDraft(
    draftId: string
): Promise<ServiceResponse> {
    try {
        const draftRef = doc(db, THCS_DRAFTS_COLLECTION, draftId);
        await deleteDoc(draftRef);

        console.log('✅ THCS draft deleted:', draftId);
        return { success: true };
    } catch (error) {
        console.error('❌ [thcsDraftService] Failed to delete THCS draft:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete draft',
        };
    }
}

/**
 * Get all THCS-THPT drafts for a user
 * Queries thcs_drafts where userId == userId, ordered by updatedAt desc
 */
export async function getUserThcsDrafts(
    userId: string
): Promise<ServiceResponse<THCSDraft[]>> {
    try {
        const draftsRef = collection(db, THCS_DRAFTS_COLLECTION);
        const q = query(
            draftsRef,
            where('userId', '==', userId),
            orderBy('updatedAt', 'desc')
        );

        const querySnapshot = await getDocs(q);
        const drafts: THCSDraft[] = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const draft = convertTimestamps<THCSDraft>({
                ...data,
                id: docSnap.id,
            });
            drafts.push(draft);
        });

        console.log(`✅ Loaded ${drafts.length} THCS drafts for user:`, userId);
        return { success: true, data: drafts };
    } catch (error) {
        console.error('❌ [thcsDraftService] Failed to get user THCS drafts:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch drafts',
        };
    }
}

/**
 * Task 4.5: Clone a public test into a new draft for customization
 * Fetches published test from RTDB, creates new draft with full content
 */
export async function cloneFromPublicTest(
    originalTestId: string,
    userId: string
): Promise<ServiceResponse<{ draftId: string }>> {
    try {
        // Dynamic import for RTDB
        const firebaseDb = await import('firebase/database');
        const firebaseApp = await import('./firebase');

        // Fetch the published test from RTDB
        const testRef = firebaseDb.ref(firebaseApp.database, `tests/${originalTestId}`);
        const testSnap = await firebaseDb.get(testRef);

        if (!testSnap.exists()) {
            return { success: false, error: 'Original test not found' };
        }

        const testData = testSnap.val();

        // Create draft metadata with "Copy of" prefix
        const metadata = {
            ...testData.metadata,
            title: `Copy of ${testData.metadata?.title || 'Untitled'}`,
        };

        // Create the draft
        const createResult = await createThcsDraft(userId, metadata);
        if (!createResult.success || !createResult.data) {
            return { success: false, error: createResult.error || 'Failed to create draft' };
        }

        const draftId = createResult.data.draftId;

        // Clone sections with new unique question IDs
        const sections = (testData.sections || []).map((s: any) => ({
            ...s,
            questions: (s.questions || []).map((q: any) => ({
                ...q,
                id: crypto.randomUUID(), // New unique IDs for cloned questions
            })),
        }));

        await updateThcsDraft(draftId, {
            sections,
            questionCount: testData.questionCount || 0,
            totalPoints: testData.totalPoints || 0,
            clonedFrom: originalTestId,
        } as any);

        console.log(`✅ [thcsDraftService] Cloned test ${originalTestId} → draft ${draftId}`);
        return { success: true, data: { draftId } };
    } catch (error) {
        console.error('❌ [thcsDraftService] Failed to clone test:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to clone test',
        };
    }
}
