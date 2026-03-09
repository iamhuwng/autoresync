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

/**
 * Get materials for the student library with filters
 * 
 * @param filters - Filter criteria
 * @returns Array of library materials
 */
export async function getLibraryMaterials(
    filters: LibraryFilters
): Promise<LibraryMaterial[]> {
    try {
        console.log('📚 Fetching library materials with filters:', filters);

        // Get all tests from Firebase
        const testsRef = ref(database, 'tests');
        const snapshot = await get(testsRef);

        if (!snapshot.exists()) {
            return [];
        }

        const testsData = snapshot.val();
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

        console.log(`✅ Found ${libraryMaterials.length} materials`);
        return libraryMaterials;

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
        console.log(`📚 Fetching course materials for course: ${courseId}, student: ${studentId}`);

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

        console.log(`✅ Found ${libraryMaterials.length} course materials`);
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
    try {
        const studentResultsRef = ref(database, `test_results_by_student/${studentId}`);
        const studentResultsSnapshot = await get(studentResultsRef);

        if (!studentResultsSnapshot.exists()) {
            return undefined;
        }

        const resultIndex = studentResultsSnapshot.val() as Record<string, any>;
        const resultIds = Object.keys(resultIndex);

        const resolvedResults = await Promise.all(
            resultIds.map(async (resultId) => {
                try {
                    const resultRef = ref(database, `test_results/${resultId}`);
                    const resultSnapshot = await get(resultRef);
                    return resultSnapshot.exists() ? resultSnapshot.val() : null;
                } catch {
                    return null;
                }
            })
        );

        const allResults = resolvedResults.filter(Boolean) as any[];

        // Filter results for this student and material
        const materialResults = allResults.filter(result =>
            result.studentId === studentId &&
            result.testId === materialId &&
            result.context?.type === 'self_study' // Only self-study attempts
        );

        if (materialResults.length === 0) {
            return undefined;
        }

        // Calculate statistics
        const scores = materialResults.map(r => r.percentage || 0);
        const bestScore = Math.max(...scores);
        const lastScore = scores[scores.length - 1];
        const lastPracticed = Math.max(...materialResults.map(r => r.submittedAt || 0));

        return {
            attemptCount: materialResults.length,
            bestScore,
            lastScore,
            lastPracticed
        };

    } catch (error) {
        console.error('❌ Error fetching student material history:', error);
        return undefined;
    }
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
        const enrichedMaterials = await Promise.all(
            materials.map(async (material) => {
                const history = await getStudentMaterialHistory(studentId, material.id);
                return {
                    ...material,
                    studentHistory: history
                };
            })
        );

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
        console.log(`🎯 Fetching recommended materials for student: ${studentId}`);

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

        console.log(`✅ Found ${limitedRecommendations.length} recommended materials`);
        return limitedRecommendations;

    } catch (error) {
        console.error('❌ Error fetching recommended materials:', error);
        return [];
    }
}
