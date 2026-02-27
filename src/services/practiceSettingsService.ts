// File: src/services/practiceSettingsService.ts
import { database } from './firebase';
import { ref, get, set } from 'firebase/database';
import type { PracticeSettings } from '../types/practice.types';

/**
 * Get practice settings at a specific level.
 * Returns null if no settings exist at that level.
 *
 * @param courseId - Required. The course ID.
 * @param moduleId - Optional. If provided, reads module-level settings.
 * @param materialId - Optional. If provided (along with moduleId), reads material-level settings.
 *
 * Firebase paths:
 *   Course:   courses/{courseId}/practiceSettings
 *   Module:   courses/{courseId}/modules/{moduleId}/practiceSettings
 *   Material: courses/{courseId}/modules/{moduleId}/materials/{materialId}/practiceSettings
 */
export async function getPracticeSettings(
    courseId: string,
    moduleId?: string,
    materialId?: string
): Promise<PracticeSettings | null> {
    const path = buildSettingsPath(courseId, moduleId, materialId);
    const snapshot = await get(ref(database, path));
    return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Save practice settings at a specific level.
 * Saves the entire PracticeSettings object (overwrites).
 */
export async function savePracticeSettings(
    courseId: string,
    settings: PracticeSettings,
    moduleId?: string,
    materialId?: string
): Promise<void> {
    const path = buildSettingsPath(courseId, moduleId, materialId);
    await set(ref(database, path), settings);
}

/**
 * Delete practice settings at a specific level (revert to inherited).
 */
export async function deletePracticeSettings(
    courseId: string,
    moduleId?: string,
    materialId?: string
): Promise<void> {
    const path = buildSettingsPath(courseId, moduleId, materialId);
    await set(ref(database, path), null);
}

function buildSettingsPath(courseId: string, moduleId?: string, materialId?: string): string {
    if (materialId && moduleId) {
        return `courses/${courseId}/modules/${moduleId}/materials/${materialId}/practiceSettings`;
    }
    if (moduleId) {
        return `courses/${courseId}/modules/${moduleId}/practiceSettings`;
    }
    return `courses/${courseId}/practiceSettings`;
}
