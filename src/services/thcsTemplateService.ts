/**
 * THCS Test Template Service (Phase 3, Task 7.2)
 *
 * CRUD operations for test templates.
 * Templates store structure only (section names, point distribution, question types)
 * but NOT question content.
 */

import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    getFirestore,
} from 'firebase/firestore';
import type { THCSTest, THCSQuestionType } from '../types/thcs-test.types';

const db = getFirestore();

// ── Types ──

export interface THCSTestTemplate {
    id: string;
    name: string;
    description: string;
    ownerId: string;
    ownerName?: string;
    isPublic: boolean;
    sections: TemplateSectionSpec[];
    totalDuration: number;
    gradeLevel: number;
    createdAt: number;
    updatedAt: number;
}

export interface TemplateSectionSpec {
    name: string;
    questionCount: number;
    defaultQuestionType: THCSQuestionType;
    points: number;
    layout: 'single-column' | 'two-column';
    instructionText?: string;
}

// ── Collection reference ──
const COLLECTION = 'thcs_templates';

// ── CRUD Functions ──

/**
 * Save the current test as a template (extracts structure only)
 */
export async function saveTestAsTemplate(
    test: THCSTest,
    name: string,
    description: string,
    isPublic: boolean
): Promise<{ templateId: string }> {
    const templateRef = doc(collection(db, COLLECTION));
    const templateId = templateRef.id;

    const sections: TemplateSectionSpec[] = (test.sections || []).map(s => ({
        name: s.name,
        questionCount: s.questions.length,
        defaultQuestionType: s.questions[0]?.type || 'mcq-grammar',
        points: s.totalPoints,
        layout: s.layout,
        instructionText: s.instructionText,
    }));

    const template: THCSTestTemplate = {
        id: templateId,
        name,
        description,
        ownerId: test.createdBy,
        isPublic,
        sections,
        totalDuration: test.metadata.duration,
        gradeLevel: test.metadata.gradeLevel,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    await setDoc(templateRef, {
        ...template,
        _serverTimestamp: serverTimestamp(),
    });

    console.log(`✅ [TemplateService] Template saved: ${templateId}`);
    return { templateId };
}

/**
 * Get templates owned by the current user
 */
export async function getMyTemplates(userId: string): Promise<THCSTestTemplate[]> {
    const q = query(
        collection(db, COLLECTION),
        where('ownerId', '==', userId),
        orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as THCSTestTemplate);
}

/**
 * Get all public templates
 */
export async function getPublicTemplates(): Promise<THCSTestTemplate[]> {
    const q = query(
        collection(db, COLLECTION),
        where('isPublic', '==', true),
        orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as THCSTestTemplate);
}

/**
 * Get a template by ID
 */
export async function getTemplateById(templateId: string): Promise<THCSTestTemplate | null> {
    const docRef = doc(db, COLLECTION, templateId);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? (snapshot.data() as THCSTestTemplate) : null;
}

/**
 * Delete a template (owner only — enforced by Firestore rules)
 */
export async function deleteTemplate(templateId: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, templateId));
    console.log(`✅ [TemplateService] Template deleted: ${templateId}`);
}
