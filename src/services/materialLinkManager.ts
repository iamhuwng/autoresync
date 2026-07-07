import { database } from './firebase';
import { ref, set, get, remove, query, orderByChild, equalTo, update } from 'firebase/database';
import type { CourseMaterial } from '../types/course.types';
import { getTestFromFirebase, generateTestId } from './testStorage';
import { createLegacyTestMaterialSummary } from './materialCatalog/legacyTestMaterialSummary.service';
import { buildMaterialSummaryUpdatePayload } from './materialCatalog/materialSummaryPort.service';

const COURSE_MATERIALS_REF = 'course_materials';

// Helper to generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Link an existing material to a course module (Shared link)
 */
export async function linkMaterialToModule(
    courseId: string,
    moduleId: string,
    materialId: string
): Promise<CourseMaterial> {
    const id = generateId();
    const link: CourseMaterial = {
        id,
        courseId,
        moduleId,
        materialId,
        order: Date.now(), // Default order
        linkedAt: Date.now(),
        isCopy: false,
    };

    await set(ref(database, `${COURSE_MATERIALS_REF}/${id}`), link);
    return link;
}

/**
 * Copy a material and link the copy to a course module (Isolated copy)
 */
export async function copyMaterialToModule(
    courseId: string,
    moduleId: string,
    materialId: string,
    ownerId: string
): Promise<CourseMaterial> {
    // 1. Fetch original test
    const response = await getTestFromFirebase(materialId);
    if (!response.success || !response.data) {
        throw new Error('Original material not found');
    }

    const original = response.data;

    // 2. Create deep copy
    const copyId = generateTestId();
    const now = Date.now();

    const copyData = {
        ...original,
        id: copyId,
        title: `${original.title} (Copy)`,
        createdAt: now,
        updatedAt: now,
        ownerId: ownerId,
        isPublic: false, // Copies are private by default
        materialLink: {
            materialId: original.id,
            materialVersion: 1,
            linkedAt: now
        }
    };

    // 3. Save the copy
    await update(ref(database), {
        [`tests/${copyId}`]: copyData,
        ...buildMaterialSummaryUpdatePayload(
            createLegacyTestMaterialSummary(copyId, copyData),
        ),
    });

    // 4. Create the junction
    const id = generateId();
    const link: CourseMaterial = {
        id,
        courseId,
        moduleId,
        materialId: copyId,
        order: Date.now(),
        linkedAt: Date.now(),
        isCopy: true,
        originalMaterialId: materialId,
    };

    await set(ref(database, `${COURSE_MATERIALS_REF}/${id}`), link);
    return link;
}

/**
 * Remove a material from a module (Deletes the link)
 */
export async function unmountMaterialFromModule(linkId: string): Promise<void> {
    const linkRef = ref(database, `${COURSE_MATERIALS_REF}/${linkId}`);
    await remove(linkRef);
}

/**
 * Get all materials for a specific module
 */
export async function getMaterialsByModule(moduleId: string): Promise<CourseMaterial[]> {
    const materialsRef = ref(database, COURSE_MATERIALS_REF);
    const moduleQuery = query(materialsRef, orderByChild('moduleId'), equalTo(moduleId));
    const snapshot = await get(moduleQuery);

    if (snapshot.exists()) {
        const materialsMap = snapshot.val() as Record<string, CourseMaterial>;
        const materials = Object.values(materialsMap);
        return materials.sort((a, b) => a.order - b.order);
    }
    return [];
}

/**
 * Get all materials for a course, grouped by module
 */
export interface GroupedMaterials {
    moduleId: string;
    materials: CourseMaterial[];
}

export async function getMaterialsByCourse(courseId: string): Promise<GroupedMaterials[]> {
    const materialsRef = ref(database, COURSE_MATERIALS_REF);
    const courseQuery = query(materialsRef, orderByChild('courseId'), equalTo(courseId));
    const snapshot = await get(courseQuery);

    if (!snapshot.exists()) {
        return [];
    }

    const materialsMap = snapshot.val() as Record<string, CourseMaterial>;
    const allMaterials = Object.values(materialsMap);

    // Group by moduleId
    const grouped = allMaterials.reduce((acc, material) => {
        const arr = acc[material.moduleId] || [];
        arr.push(material);
        acc[material.moduleId] = arr;
        return acc;
    }, {} as Record<string, CourseMaterial[]>);

    // Convert to array and sort materials within each group
    return Object.entries(grouped).map(([moduleId, materials]) => ({
        moduleId,
        materials: materials.sort((a, b) => a.order - b.order)
    }));
}

/**
 * Synchronize a copied material's CONTENT with its original version
 * (Updates test questions/answers, not course structure)
 */
export async function syncMaterialContentWithOriginal(linkId: string): Promise<CourseMaterial> {
    // 1. Get the link record
    const linkRef = ref(database, `${COURSE_MATERIALS_REF}/${linkId}`);
    const linkSnapshot = await get(linkRef);
    if (!linkSnapshot.exists()) throw new Error('Link record not found');

    const link = linkSnapshot.val() as CourseMaterial;
    if (!link.isCopy || !link.originalMaterialId) {
        throw new Error('This material is a shared link (not a copy) and cannot be synced, or missing original reference');
    }

    // 2. Fetch original test
    const originalResponse = await getTestFromFirebase(link.originalMaterialId);
    if (!originalResponse.success || !originalResponse.data) {
        throw new Error('Original source material not found or deleted');
    }
    const original = originalResponse.data;

    // 3. Fetch current copy
    const copyResponse = await getTestFromFirebase(link.materialId);
    if (!copyResponse.success || !copyResponse.data) {
        throw new Error('Local copied material not found');
    }
    const currentCopy = copyResponse.data;

    // 4. Sync data
    // We overwrite questions, passages, and audio sections, but keep local identification
    const now = Date.now();
    const updatedTestData = {
        ...original,
        id: currentCopy.id,
        ownerId: currentCopy.ownerId, // Preserve owner
        isPublic: currentCopy.isPublic, // Keep private
        title: currentCopy.title, // Keep copy title
        updatedAt: now,
        // Update the materialLink metadata if it exists
        materialLink: {
            ...(currentCopy.materialLink || {}),
            materialId: link.originalMaterialId,
            linkedAt: currentCopy.materialLink?.linkedAt || now,
        }
    };

    // 5. Save updated test
    await update(ref(database), {
        [`tests/${currentCopy.id}`]: updatedTestData,
        ...buildMaterialSummaryUpdatePayload(
            createLegacyTestMaterialSummary(currentCopy.id, updatedTestData),
            createLegacyTestMaterialSummary(currentCopy.id, currentCopy),
        ),
    });

    // 6. Update junction record with syncedAt timestamp
    const updatedLink: CourseMaterial = {
        ...link,
        syncedAt: now
    };
    await set(linkRef, updatedLink);

    return updatedLink;
}

/**
 * Update the order of materials within a module
 */
export async function reorderMaterials(newLinkOrder: string[]): Promise<void> {
    const updates: Record<string, any> = {};

    newLinkOrder.forEach((linkId, index) => {
        updates[`${COURSE_MATERIALS_REF}/${linkId}/order`] = index;
    });

    await update(ref(database), updates);
}

/**
 * Get the number of times a material is used in courses (linked or copied)
 */
export async function getMaterialUsageCount(materialId: string): Promise<number> {
    const materialsRef = ref(database, COURSE_MATERIALS_REF);

    try {
        // 1. Direct usage (linked)
        const directQuery = query(materialsRef, orderByChild('materialId'), equalTo(materialId));
        const directSnapshot = await get(directQuery);
        let count = 0;

        if (directSnapshot.exists()) {
            count += Object.keys(directSnapshot.val()).length;
        }

        // 2. Copied usage (via originalMaterialId)
        const copyQuery = query(materialsRef, orderByChild('originalMaterialId'), equalTo(materialId));
        const copySnapshot = await get(copyQuery);

        if (copySnapshot.exists()) {
            count += Object.keys(copySnapshot.val()).length;
        }

        return count;
    } catch (error) {
        console.error('Error counting material usage:', error);
        return 0;
    }
}
