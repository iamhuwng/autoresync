/**
 * Writing Annotation Service
 * 
 * PRD-0030: IELTS Writing Test System
 * [GAP-02] Manages custom annotation categories per teacher.
 * Stored at: users/{teacherId}/settings/writingAnnotationCategories
 * 
 * @module services/writingAnnotationService
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
// @ts-ignore — JS service file
import { firestore as db } from './firebase';
import { deepRemoveUndefined } from './draftCloudService';
import { withRestoreGuard } from './restoreGuard';
import type { AnnotationCategory } from '../types/ielts-writing.types';

// ═══════════════════════════════════════════════════════════════
// DEFAULT ANNOTATION CATEGORIES
// IELTS official 4 criteria + common extras
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_ANNOTATION_CATEGORIES: AnnotationCategory[] = [
    { id: 'TA', label: 'Task Achievement', color: '#3b82f6', isDefault: true },
    { id: 'CC', label: 'Coherence & Cohesion', color: '#10b981', isDefault: true },
    { id: 'LR', label: 'Lexical Resource', color: '#f59e0b', isDefault: true },
    { id: 'GRA', label: 'Grammar', color: '#ef4444', isDefault: true },
];

// ═══════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Get annotation categories for a teacher.
 * Returns defaults if none have been saved yet.
 */
export async function getAnnotationCategories(
    teacherId: string
): Promise<AnnotationCategory[]> {
    try {
        const docRef = doc(db, 'users', teacherId, 'settings', 'writingAnnotationCategories');
        const snap = await getDoc(docRef);

        if (!snap.exists()) {
            return [...DEFAULT_ANNOTATION_CATEGORIES];
        }

        const data = snap.data();
        return (data.categories as AnnotationCategory[]) || [...DEFAULT_ANNOTATION_CATEGORIES];
    } catch (error) {
        console.error('❌ Failed to get annotation categories:', error);
        return [...DEFAULT_ANNOTATION_CATEGORIES];
    }
}

/**
 * Save annotation categories for a teacher.
 * Overwrites the entire categories array.
 */
export const saveAnnotationCategories = withRestoreGuard<void>(
    'AnnotationCategoriesSave',
    undefined as unknown as void
)(async (
    teacherId: string,
    categories: AnnotationCategory[]
): Promise<void> => {
    try {
        const docRef = doc(db, 'users', teacherId, 'settings', 'writingAnnotationCategories');
        const sanitized = deepRemoveUndefined({ categories, updatedAt: Date.now() });
        await setDoc(docRef, sanitized, { merge: true });
        console.log('✅ Annotation categories saved for teacher:', teacherId);
    } catch (error) {
        console.error('❌ Failed to save annotation categories:', error);
        throw error;
    }
});

/**
 * Add a custom annotation category.
 * Loads existing, appends, and saves back.
 */
export async function addAnnotationCategory(
    teacherId: string,
    category: AnnotationCategory
): Promise<AnnotationCategory[]> {
    const existing = await getAnnotationCategories(teacherId);

    // Prevent duplicate IDs
    if (existing.find(c => c.id === category.id)) {
        console.warn('Annotation category already exists:', category.id);
        return existing;
    }

    const updated = [...existing, category];
    await saveAnnotationCategories(teacherId, updated);
    return updated;
}

/**
 * Remove a custom annotation category.
 * Cannot remove default (IELTS criteria) categories.
 */
export async function removeAnnotationCategory(
    teacherId: string,
    categoryId: string
): Promise<AnnotationCategory[]> {
    const existing = await getAnnotationCategories(teacherId);
    const target = existing.find(c => c.id === categoryId);

    if (target?.isDefault) {
        console.warn('Cannot remove default annotation category:', categoryId);
        return existing;
    }

    const updated = existing.filter(c => c.id !== categoryId);
    await saveAnnotationCategories(teacherId, updated);
    return updated;
}

// Default export
const writingAnnotationService = {
    getAnnotationCategories,
    saveAnnotationCategories,
    addAnnotationCategory,
    removeAnnotationCategory,
    DEFAULT_ANNOTATION_CATEGORIES,
};

export default writingAnnotationService;
