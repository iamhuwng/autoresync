/**
 * Material Discovery Service
 * PRD-0016: Solo Study & Homework System
 * 
 * Handles browsing and searching materials for solo practice.
 * Students can discover materials from:
 * - Their enrolled courses
 * - Public library
 * - Recommended materials
 */

import { ref, get } from 'firebase/database';
// @ts-ignore - firebase.js doesn't have type declarations
import { database } from './firebase';
import type { TestData } from './testStorage';
import type { LibraryFilters, LibraryMaterial } from '../types/solo.types';
import { getStudentResults as getCanonicalStudentResults } from './testResults.service';
import {
    READING_V2_ROLLOUT_MODE,
    isReadingV2PublicRollout,
    type ReadingV2RolloutMode,
} from '../config/readingV2FeatureFlags';
import {
    buildReadingV2LaunchReadPlan,
    createReadingV2LibraryMaterial,
    isReadingV2LaunchCandidate,
    resolveReadingV2LaunchDecision,
} from './reading-v2/readingV2LaunchIntegration.service';
import type { ReadingV2DerivedProjection } from './reading-v2/readingV2Projection.service';
import type { ReadingV2MaterialMetadata } from './reading-v2/readingV2MaterialMetadata.service';
import { readingV2StoragePaths } from './reading-v2/readingV2StoragePaths.service';

type StudentMaterialHistory = NonNullable<LibraryMaterial['studentHistory']>;

interface MaterialDiscoveryOptions {
    readonly readingV2RolloutMode?: ReadingV2RolloutMode;
}

const MATERIAL_LIBRARY_DIAGNOSTICS_ENABLED = import.meta.env.DEV
    && import.meta.env.VITE_LIBRARY_DIAGNOSTICS === 'true';

function logMaterialLibraryDiagnostic(event: string, payload: Record<string, unknown>): void {
    if (!MATERIAL_LIBRARY_DIAGNOSTICS_ENABLED) {
        return;
    }

    console.info(`[Diag][MaterialDiscovery] ${event}`, payload);
}

function matchesReadingV2LibraryFilters(material: LibraryMaterial, filters: LibraryFilters): boolean {
    if (filters.source && filters.source !== 'public') {
        return false;
    }

    if (filters.skill && filters.skill !== 'reading' && filters.skill !== 'reading-v2') {
        return false;
    }

    if (filters.type && material.type !== filters.type) {
        return false;
    }

    if (filters.difficulty && material.difficulty !== filters.difficulty) {
        return false;
    }

    if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const metadata = (material as any).metadata ?? {};
        const tags = (metadata.tags ?? []) as string[];
        const titleMatch = material.title.toLowerCase().includes(query);
        const descMatch = String(metadata.description ?? '').toLowerCase().includes(query);
        const tagsMatch = tags.some(tag => tag.toLowerCase().includes(query));

        if (!titleMatch && !descMatch && !tagsMatch) {
            return false;
        }
    }

    return true;
}

async function getReadingV2PublicLibraryMaterials(
    filters: LibraryFilters,
    options: MaterialDiscoveryOptions = {}
): Promise<LibraryMaterial[]> {
    if (filters.source && filters.source !== 'public') {
        return [];
    }

    const rolloutMode = options.readingV2RolloutMode ?? READING_V2_ROLLOUT_MODE;
    if (!isReadingV2PublicRollout(rolloutMode)) {
        return [];
    }

    const indexRootPath = readingV2StoragePaths.relationshipIndexes('library-listing', '');
    const indexSnapshot = await get(ref(database, indexRootPath));

    if (!indexSnapshot.exists()) {
        return [];
    }

    const indexEntries = Object.values(indexSnapshot.val() ?? {}) as Array<{
        materialId?: string;
        snapshotVersionId?: string;
        source?: string;
    }>;

    const materials = await Promise.all(indexEntries.map(async (entry) => {
        if (!entry.materialId || entry.source !== 'student-safe-projection') {
            return null;
        }

        const readPlan = buildReadingV2LaunchReadPlan({
            surface: 'public-library',
            materialId: entry.materialId,
            snapshotVersionId: entry.snapshotVersionId,
        });

        const metadataSnapshot = await get(ref(database, readPlan.metadataPath));
        const metadata = metadataSnapshot.exists()
            ? metadataSnapshot.val() as ReadingV2MaterialMetadata
            : null;

        if (
            !metadata ||
            !isReadingV2LaunchCandidate(metadata) ||
            metadata.visibility !== 'library-eligible'
        ) {
            return null;
        }

        const projectionSnapshot = await get(ref(database, readPlan.projectionPath));
        const projection = projectionSnapshot.exists()
            ? projectionSnapshot.val() as ReadingV2DerivedProjection
            : null;

        const launchDecision = resolveReadingV2LaunchDecision({
            surface: 'public-library',
            metadata,
            projection,
            rolloutMode,
        });

        if (launchDecision.status !== 'runtime') {
            return null;
        }

        const material = createReadingV2LibraryMaterial({
            metadata,
            projection: launchDecision.projection,
            source: { type: 'public' },
        });

        (material as any).metadata = {
            deliveryEngine: metadata.deliveryEngine,
            productLabel: metadata.productLabel,
            materialKind: metadata.materialKind,
            description: metadata.description,
            tags: metadata.tags,
            sourceSnapshotVersionId: entry.snapshotVersionId,
        };

        return matchesReadingV2LibraryFilters(material, filters) ? material : null;
    }));

    return materials.filter((material): material is LibraryMaterial => material !== null);
}

function buildStudentMaterialHistoryMap(results: Awaited<ReturnType<typeof getCanonicalStudentResults>>): Map<string, StudentMaterialHistory> {
    const historyByMaterialId = new Map<string, StudentMaterialHistory>();

    for (const result of results) {
        if (result.context?.type !== 'self_study' || !result.testId) {
            continue;
        }

        const materialId = result.testId;
        const percentage = result.percentage || 0;
        const submittedAt = result.submittedAt || 0;
        const existing = historyByMaterialId.get(materialId);

        if (!existing) {
            historyByMaterialId.set(materialId, {
                attemptCount: 1,
                bestScore: percentage,
                lastScore: percentage,
                lastPracticed: submittedAt,
            });
            continue;
        }

        existing.attemptCount += 1;
        existing.bestScore = Math.max(existing.bestScore ?? 0, percentage);

        if (submittedAt >= (existing.lastPracticed ?? 0)) {
            existing.lastPracticed = submittedAt;
            existing.lastScore = percentage;
        }
    }

    return historyByMaterialId;
}

async function getStudentMaterialHistoryMap(studentId: string): Promise<Map<string, StudentMaterialHistory>> {
    try {
        const allResults = await getCanonicalStudentResults(studentId);
        return buildStudentMaterialHistoryMap(allResults);
    } catch (error) {
        console.error('❌ Error fetching student material history map:', error);
        return new Map();
    }
}

/**
 * Get materials for the student library with filters
 * 
 * @param filters - Filter criteria
 * @returns Array of library materials
 */
export async function getLibraryMaterials(
    filters: LibraryFilters,
    options: MaterialDiscoveryOptions = {}
): Promise<LibraryMaterial[]> {
    try {
        logMaterialLibraryDiagnostic('getLibraryMaterials_requested', { filters });

        // Get all legacy tests from Firebase. Reading V2 public entries are
        // loaded separately from the approved library relationship index.
        const testsRef = ref(database, 'tests');
        const snapshot = await get(testsRef);

        const testsData = snapshot.exists() ? snapshot.val() : {};
        const allTests: TestData[] = Object.values(testsData);

        // Filter tests based on criteria
        let filteredTests = allTests.filter(test => {
            // Apply source filter
            if (filters.source === 'public') {
                // Public library: must have isPublic flag set by the teacher
                if (!test.isPublic) {
                    return false;
                }
            }

            // Apply skill filter
            if (filters.skill && test.skillType !== filters.skill) {
                return false;
            }

            // Apply type filter
            if (filters.type) {
                // Map test type to materialType
                const materialType = (test as any).testType === 'THCS-THPT' ? 'thcs-test'
                    : test.type === 'Custom' ? 'quiz' : 'test';
                if (materialType !== filters.type) {
                    return false;
                }
            }

            // Apply difficulty filter
            if (filters.difficulty && test.difficulty?.toLowerCase() !== filters.difficulty) {
                return false;
            }

            // Apply search query (search in title, description, tags)
            if (filters.searchQuery) {
                const query = filters.searchQuery.toLowerCase();
                const resolvedTitle = test.title || (test as any).metadata?.title || '';
                const titleMatch = resolvedTitle.toLowerCase().includes(query);
                const descMatch = test.metadata?.description?.toLowerCase().includes(query);
                const tagsMatch = test.metadata?.tags?.some(tag =>
                    tag.toLowerCase().includes(query)
                );

                if (!titleMatch && !descMatch && !tagsMatch) {
                    return false;
                }
            }

            return true;
        });

        // Convert to LibraryMaterial format
        const libraryMaterials: LibraryMaterial[] = filteredTests.map(test => ({
            id: test.id,
            title: test.title || (test as any).metadata?.title || 'Untitled Test',
            type: (test as any).testType === 'THCS-THPT' ? 'thcs-test'
                : test.type === 'Custom' ? 'quiz' : 'test',
            skill: test.skillType || 'reading',
            difficulty: test.difficulty?.toLowerCase() as 'easy' | 'medium' | 'hard' | undefined,
            estimatedDuration: test.duration || (test as any).metadata?.duration || undefined,
            questionCount: test.questionCount || (test as any).metadata?.questionCount || 0,
            source: {
                type: test.isPublic ? 'public' : 'course',
                courseName: undefined, // Will be populated if from course
                courseId: undefined
            },
            soloConfig: test.soloConfig!,
            // Student history will be populated separately if needed
            studentHistory: undefined
        }));

        const readingV2LibraryMaterials = await getReadingV2PublicLibraryMaterials(filters, options);
        const allLibraryMaterials = [...libraryMaterials, ...readingV2LibraryMaterials];

        logMaterialLibraryDiagnostic('getLibraryMaterials_resolved', {
            materialCount: allLibraryMaterials.length,
            readingV2Count: readingV2LibraryMaterials.length,
        });
        return allLibraryMaterials;

    } catch (error) {
        console.error('❌ Error fetching library materials:', error);
        return [];
    }
}

/**
 * Get materials from a specific course for enrolled students
 * 
 * @param courseId - Course ID
 * @param studentId - Student ID (to verify enrollment)
 * @returns Array of course materials
 */
export async function getCourseMaterials(
    courseId: string,
    studentId: string
): Promise<LibraryMaterial[]> {
    try {
        logMaterialLibraryDiagnostic('getCourseMaterials_requested', { courseId, studentId });

        // TODO: Verify student enrollment in course
        // For now, we'll fetch all materials linked to the course

        // Get all tests
        const testsRef = ref(database, 'tests');
        const snapshot = await get(testsRef);

        if (!snapshot.exists()) {
            return [];
        }

        const testsData = snapshot.val();
        const allTests: TestData[] = Object.values(testsData);

        // Filter tests that belong to this course and have solo enabled
        const courseMaterials = allTests.filter(test => {
            // Check if test has solo mode enabled
            if (!test.soloConfig?.soloEnabled) {
                return false;
            }

            // Check if test belongs to this course
            // This would require a courseId field in TestData or a separate mapping
            // For now, we'll use a placeholder logic
            // TODO: Implement proper course-material relationship
            return test.isPublic || test.ownerId === courseId;
        });

        // Convert to LibraryMaterial format
        const libraryMaterials: LibraryMaterial[] = courseMaterials.map(test => ({
            id: test.id,
            title: test.title,
            type: test.type === 'Custom' ? 'quiz' : 'test',
            skill: test.skillType || 'reading',
            difficulty: test.difficulty?.toLowerCase() as 'easy' | 'medium' | 'hard' | undefined,
            estimatedDuration: test.duration,
            questionCount: test.questionCount,
            source: {
                type: 'course',
                courseId: courseId,
                courseName: undefined // Will be populated from course data
            },
            soloConfig: test.soloConfig!,
            studentHistory: undefined
        }));

        logMaterialLibraryDiagnostic('getCourseMaterials_resolved', { materialCount: libraryMaterials.length });
        return libraryMaterials;

    } catch (error) {
        console.error('❌ Error fetching course materials:', error);
        return [];
    }
}

/**
 * Get all public library materials
 * 
 * @returns Array of public materials
 */
export async function getPublicMaterials(): Promise<LibraryMaterial[]> {
    return getLibraryMaterials({ source: 'public' });
}

/**
 * Search materials with text query and filters
 * 
 * @param query - Search query string
 * @param filters - Additional filters
 * @returns Array of matching materials
 */
export async function searchMaterials(
    query: string,
    filters?: Omit<LibraryFilters, 'searchQuery'>
): Promise<LibraryMaterial[]> {
    return getLibraryMaterials({
        ...filters,
        searchQuery: query
    });
}

/**
 * Get student's practice history for a specific material
 * 
 * @param studentId - Student ID
 * @param materialId - Material ID
 * @returns Student history or undefined
 */
export async function getStudentMaterialHistory(
    studentId: string,
    materialId: string
): Promise<LibraryMaterial['studentHistory']> {
    const historyByMaterialId = await getStudentMaterialHistoryMap(studentId);
    return historyByMaterialId.get(materialId);
}

/**
 * Enrich library materials with student history
 * 
 * @param materials - Array of materials
 * @param studentId - Student ID
 * @returns Materials with history populated
 */
export async function enrichWithStudentHistory(
    materials: LibraryMaterial[],
    studentId: string
): Promise<LibraryMaterial[]> {
    try {
        const historyByMaterialId = await getStudentMaterialHistoryMap(studentId);
        const enrichedMaterials = materials.map((material) => ({
            ...material,
            studentHistory: historyByMaterialId.get(material.id),
        }));

        return enrichedMaterials;
    } catch (error) {
        console.error('❌ Error enriching materials with history:', error);
        return materials;
    }
}

/**
 * Get recommended materials for a student based on their history
 * 
 * @param studentId - Student ID
 * @returns Array of recommended materials
 */
export async function getRecommendedMaterials(
    studentId: string
): Promise<LibraryMaterial[]> {
    try {
        logMaterialLibraryDiagnostic('getRecommendedMaterials_requested', { studentId });

        // Get all available materials
        const allMaterials = await getLibraryMaterials({});

        // Get student's history
        const materialsWithHistory = await enrichWithStudentHistory(allMaterials, studentId);

        // Simple recommendation logic:
        // 1. Materials not yet attempted
        // 2. Materials with low scores (< 70%)
        // 3. Materials practiced long ago (> 7 days)

        const now = Date.now();
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

        const recommended = materialsWithHistory.filter(material => {
            const history = material.studentHistory;

            // Not attempted yet - recommend
            if (!history) {
                return true;
            }

            // Low score - recommend for improvement
            if (history.bestScore && history.bestScore < 70) {
                return true;
            }

            // Practiced long ago - recommend for review
            if (history.lastPracticed && history.lastPracticed < sevenDaysAgo) {
                return true;
            }

            return false;
        });

        // Limit to 10 recommendations
        const limitedRecommendations = recommended.slice(0, 10);

        logMaterialLibraryDiagnostic('getRecommendedMaterials_resolved', {
            materialCount: limitedRecommendations.length,
        });
        return limitedRecommendations;

    } catch (error) {
        console.error('❌ Error fetching recommended materials:', error);
        return [];
    }
}
