import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    query,
    where,
    Timestamp,
    serverTimestamp
} from 'firebase/firestore';
// @ts-ignore - JS service file
import { firestore as db } from './firebase';
import type { HomeworkTemplate } from '../types/solo.types';
import type { HomeworkConfig } from '../types/homework.types';

const TEMPLATES_COLLECTION = 'homework_templates';

/**
 * Create a new homework template
 */
export async function createTemplate(
    teacherId: string,
    name: string,
    config: HomeworkConfig,
    description?: string
): Promise<string> {
    try {
        const templateRef = doc(collection(db, TEMPLATES_COLLECTION));

        const template: HomeworkTemplate = {
            id: templateRef.id,
            teacherId,
            name,
            config,
            description,
            createdAt: serverTimestamp() as Timestamp,
            updatedAt: serverTimestamp() as Timestamp,
        };

        await setDoc(templateRef, template);
        return templateRef.id;
    } catch (error) {
        console.error('Error creating homework template:', error);
        throw new Error('Failed to create homework template');
    }
}

/**
 * Get all templates created by a teacher
 */
export async function getTemplatesByTeacher(teacherId: string): Promise<HomeworkTemplate[]> {
    try {
        const q = query(
            collection(db, TEMPLATES_COLLECTION),
            where('teacherId', '==', teacherId)
        );

        const snapshot = await getDocs(q);
        const templates = snapshot.docs.map(doc => doc.data() as HomeworkTemplate);

        // Sort by name ascending in application code to avoid composite index requirement
        return templates.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error('Error fetching homework templates:', error);
        throw new Error('Failed to fetch homework templates');
    }
}

/**
 * Get a single template by ID
 */
export async function getTemplateById(id: string): Promise<HomeworkTemplate | null> {
    try {
        const templateRef = doc(db, TEMPLATES_COLLECTION, id);
        const snapshot = await getDoc(templateRef);

        if (!snapshot.exists()) {
            return null;
        }

        return snapshot.data() as HomeworkTemplate;
    } catch (error) {
        console.error('Error fetching homework template:', error);
        throw new Error('Failed to fetch homework template');
    }
}

/**
 * Delete a homework template
 */
export async function deleteTemplate(id: string): Promise<void> {
    try {
        const templateRef = doc(db, TEMPLATES_COLLECTION, id);
        await deleteDoc(templateRef);
    } catch (error) {
        console.error('Error deleting homework template:', error);
        throw new Error('Failed to delete homework template');
    }
}

/**
 * Update a homework template
 */
export async function updateTemplate(
    id: string,
    updates: { name?: string; config?: HomeworkConfig; description?: string }
): Promise<void> {
    try {
        const templateRef = doc(db, TEMPLATES_COLLECTION, id);

        await setDoc(templateRef, {
            ...updates,
            updatedAt: serverTimestamp(),
        }, { merge: true });
    } catch (error) {
        console.error('Error updating homework template:', error);
        throw new Error('Failed to update homework template');
    }
}
