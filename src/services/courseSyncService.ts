/**
 * Course Sync Service
 * 
 * Detects and applies structural sync between original course templates
 * and their class-instance copies. Handles:
 * - Detecting new materials added to original modules after copy
 * - Detecting new modules added to original course after copy
 * - Applying selected sync items (cherry-pick)
 * - Dismissing sync notifications (timestamp-based)
 */

import { ref, get, update } from 'firebase/database';
// @ts-ignore - firebase.js doesn't have type declarations
import { database } from './firebase';
import { getCourse, getModulesByCourse, createModule, updateModule } from './courseManager';
import { getMaterialsByModule, linkMaterialToModule } from './materialLinkManager';
import type { Module, ClassCourseLink } from '../types/course.types';

// ============================================================================
// TYPES
// ============================================================================

/** A single pending material that can be synced */
export interface PendingSyncMaterial {
    materialId: string;
    title: string;        // Resolved test title for display
    linkedAt: number;     // When it was added to the original module
}

/** Sync status for a single copied module */
export interface ModuleSyncStatus {
    copyModuleId: string;
    copyModuleName: string;
    originalModuleId: string;
    pendingMaterials: PendingSyncMaterial[];
}

/** A new module in the original course that doesn't exist in the copy */
export interface NewModuleInfo {
    originalModuleId: string;
    name: string;
    materialCount: number;
    materials: PendingSyncMaterial[];
    createdOrder: number;
}

/** Full sync status for a class-instance course */
export interface CourseSyncStatus {
    copyCourseId: string;
    originalCourseId: string;
    moduleUpdates: ModuleSyncStatus[];   // Existing modules with new materials
    newModules: NewModuleInfo[];          // Entirely new modules
    hasUpdates: boolean;
}

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Get the ClassCourseLink for a given class-instance course
 */
async function getClassCourseLinkByCopyCourseId(copyCourseId: string): Promise<ClassCourseLink | null> {
    try {
        const linksRef = ref(database, 'class_course_links');
        const snapshot = await get(linksRef);
        if (!snapshot.exists()) return null;

        const links = snapshot.val() as Record<string, ClassCourseLink>;
        const match = Object.values(links).find(link => link.courseId === copyCourseId);
        return match || null;
    } catch (error) {
        console.error('Error fetching class course link:', error);
        return null;
    }
}

/**
 * Resolve test titles for a list of material IDs
 */
async function resolveTestTitles(materialIds: string[]): Promise<Record<string, string>> {
    const titles: Record<string, string> = {};
    await Promise.all(materialIds.map(async (id) => {
        try {
            const snap = await get(ref(database, `tests/${id}`));
            if (snap.exists()) {
                const data = snap.val();
                // Handle THCS tests with nested metadata
                titles[id] = data.testType === 'THCS-THPT'
                    ? (data.metadata?.title || 'Untitled THCS Test')
                    : (data.title || 'Untitled');
            } else {
                titles[id] = 'Untitled';
            }
        } catch {
            titles[id] = 'Untitled';
        }
    }));
    return titles;
}

/**
 * Detect all pending sync updates for a class-instance course.
 * 
 * This compares the original course's current modules/materials
 * with the copy's modules/materials, using timestamps to filter
 * only genuinely new additions.
 * 
 * @param copyCourseId - The class-instance course ID
 * @returns CourseSyncStatus with all pending updates
 */
export async function detectSyncUpdates(copyCourseId: string): Promise<CourseSyncStatus | null> {
    try {
        // 1. Verify this is a class instance and get the link
        const course = await getCourse(copyCourseId);
        if (!course || !course.isClassInstance) {
            return null; // Not a class instance — sync not applicable
        }

        const link = await getClassCourseLinkByCopyCourseId(copyCourseId);
        if (!link) {
            return null; // No link found — orphan copy
        }

        // 2. Fetch original course — if deleted, sync is disabled
        const originalCourse = await getCourse(link.originalCourseId);
        if (!originalCourse) {
            return null; // Original deleted — no sync available
        }

        // 3. Fetch modules from both courses
        const [originalModules, copyModules] = await Promise.all([
            getModulesByCourse(link.originalCourseId),
            getModulesByCourse(copyCourseId),
        ]);

        // 4. Build lookup: originalModuleId → copy module
        const copyModuleByOriginalId = new Map<string, Module>();
        for (const copyMod of copyModules) {
            if (copyMod.originalModuleId) {
                copyModuleByOriginalId.set(copyMod.originalModuleId, copyMod);
            }
        }

        // 5. Detect new materials in existing modules
        const moduleUpdates: ModuleSyncStatus[] = [];
        const allNewMaterialIds: string[] = [];

        for (const origModule of originalModules) {
            const copyModule = copyModuleByOriginalId.get(origModule.id);
            if (!copyModule) continue; // This is a new module, handled below

            // Get materials from both modules
            const [origMaterials, copyMaterials] = await Promise.all([
                getMaterialsByModule(origModule.id),
                getMaterialsByModule(copyModule.id),
            ]);

            // Find materials in original that are:
            // 1. Added AFTER the copy's lastSyncedAt timestamp
            // 2. Not already present in the copy (by materialId)
            const copyMaterialIds = new Set(copyMaterials.map(m => m.materialId));
            const lastSynced = copyModule.lastSyncedAt || 0;

            const newMaterials = origMaterials.filter(m => {
                const materialLinkedAt = m.linkedAt || 0;
                return materialLinkedAt > lastSynced && !copyMaterialIds.has(m.materialId);
            });

            if (newMaterials.length > 0) {
                allNewMaterialIds.push(...newMaterials.map(m => m.materialId));
                moduleUpdates.push({
                    copyModuleId: copyModule.id,
                    copyModuleName: copyModule.name,
                    originalModuleId: origModule.id,
                    pendingMaterials: newMaterials.map(m => ({
                        materialId: m.materialId,
                        title: '', // Will be resolved below
                        linkedAt: m.linkedAt || 0,
                    })),
                });
            }
        }

        // 6. Detect entirely new modules (in original but not copied)
        const copiedOriginalIds = new Set(
            copyModules
                .map(m => m.originalModuleId)
                .filter(Boolean) as string[]
        );

        const newModules: NewModuleInfo[] = [];
        for (const origModule of originalModules) {
            if (!copiedOriginalIds.has(origModule.id)) {
                // This module doesn't exist in the copy
                const origMaterials = await getMaterialsByModule(origModule.id);
                allNewMaterialIds.push(...origMaterials.map(m => m.materialId));

                newModules.push({
                    originalModuleId: origModule.id,
                    name: origModule.name,
                    materialCount: origMaterials.length,
                    materials: origMaterials.map(m => ({
                        materialId: m.materialId,
                        title: '', // Will be resolved below
                        linkedAt: m.linkedAt || 0,
                    })),
                    createdOrder: origModule.order,
                });
            }
        }

        // 7. Resolve all test titles in batch
        if (allNewMaterialIds.length > 0) {
            const titles = await resolveTestTitles([...new Set(allNewMaterialIds)]);

            // Apply titles to module updates
            for (const update of moduleUpdates) {
                for (const mat of update.pendingMaterials) {
                    mat.title = titles[mat.materialId] || 'Untitled';
                }
            }

            // Apply titles to new modules
            for (const newMod of newModules) {
                for (const mat of newMod.materials) {
                    mat.title = titles[mat.materialId] || 'Untitled';
                }
            }
        }

        return {
            copyCourseId,
            originalCourseId: link.originalCourseId,
            moduleUpdates,
            newModules,
            hasUpdates: moduleUpdates.length > 0 || newModules.length > 0,
        };

    } catch (error) {
        console.error('Error detecting sync updates:', error);
        return null;
    }
}

// ============================================================================
// APPLY
// ============================================================================

/**
 * Apply selected materials from the original to a copy module.
 * 
 * @param copyCourseId - The class instance course ID
 * @param copyModuleId - The copy module to add materials to
 * @param materialIds - Array of materialIds to sync (cherry-picked by teacher)
 */
export async function applySyncMaterials(
    copyCourseId: string,
    copyModuleId: string,
    materialIds: string[]
): Promise<{ success: boolean; addedCount: number; error?: string }> {
    try {
        // Verify the copy module exists
        const moduleRef = ref(database, `course_modules/${copyModuleId}`);
        const moduleSnap = await get(moduleRef);
        if (!moduleSnap.exists()) {
            return { success: false, addedCount: 0, error: 'Copy module not found' };
        }

        // Get existing materials to prevent duplicates
        const existingMaterials = await getMaterialsByModule(copyModuleId);
        const existingMaterialIds = new Set(existingMaterials.map(m => m.materialId));

        let addedCount = 0;
        for (const materialId of materialIds) {
            if (!existingMaterialIds.has(materialId)) {
                await linkMaterialToModule(copyCourseId, copyModuleId, materialId);
                addedCount++;
            }
        }

        // Update lastSyncedAt on the copy module
        await updateModule(copyModuleId, { lastSyncedAt: Date.now() });

        return { success: true, addedCount };
    } catch (error) {
        console.error('Error applying sync materials:', error);
        return { success: false, addedCount: 0, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Apply a new module from the original course to the class copy.
 * Copies the module and all its materials.
 * 
 * @param copyCourseId - The class instance course ID
 * @param originalModuleId - The original module to copy
 */
export async function applySyncNewModule(
    copyCourseId: string,
    originalModuleId: string
): Promise<{ success: boolean; newModuleId?: string; error?: string }> {
    try {
        // Fetch original module
        const moduleRef = ref(database, `course_modules/${originalModuleId}`);
        const moduleSnap = await get(moduleRef);
        if (!moduleSnap.exists()) {
            return { success: false, error: 'Original module not found' };
        }

        const originalModule = moduleSnap.val() as Module;

        // Create copy module with lineage tracking
        const result = await createModule(copyCourseId, {
            name: originalModule.name,
            accessType: originalModule.accessType,
            originalModuleId: originalModule.id,
            lastSyncedAt: Date.now(),
        });

        if (!result.success || !result.moduleId) {
            return { success: false, error: result.error || 'Failed to create module copy' };
        }

        // Copy all materials from original module
        const originalMaterials = await getMaterialsByModule(originalModuleId);
        for (const material of originalMaterials) {
            await linkMaterialToModule(copyCourseId, result.moduleId, material.materialId);
        }

        return { success: true, newModuleId: result.moduleId };
    } catch (error) {
        console.error('Error applying new module sync:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// DISMISS
// ============================================================================

/**
 * Dismiss sync notifications for a specific copy module.
 * Updates lastSyncedAt to current time, preventing dismissed items from reappearing.
 * New items added AFTER this timestamp will still trigger new notifications.
 * 
 * @param copyModuleId - The copy module to dismiss notifications for
 */
export async function dismissModuleSync(copyModuleId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await updateModule(copyModuleId, { lastSyncedAt: Date.now() });
        return { success: true };
    } catch (error) {
        console.error('Error dismissing sync:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Dismiss sync notifications for all new modules in a course.
 * This is used when the teacher dismisses the "new modules available" banner.
 * We don't need to track per-module state for new modules since they don't have
 * a copy module yet. Instead, we update the course's copy record to track
 * the last time new modules were checked.
 */
export async function dismissNewModulesSync(copyCourseId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const courseRef = ref(database, `courses/${copyCourseId}`);
        await update(courseRef, { lastModuleSyncAt: Date.now() });
        return { success: true };
    } catch (error) {
        console.error('Error dismissing new modules sync:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
