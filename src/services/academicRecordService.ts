/**
 * Academic Record Service
 * 
 * Handles querying and analysis of student academic records.
 * Provides functions for retrieving results by various contexts
 * (student, course, skill) and calculating academic summaries.
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 3
 */

import { ref, get, runTransaction } from 'firebase/database';
// @ts-ignore
import { database } from './firebase';
import { EnhancedTestResultRecord } from '../types/results.types';
import type { SectionResult as THCSSectionResult } from '../types/thcs-test.types';
import {
    AcademicSummary,
    CourseProgress,
    SkillBreakdown,
    ResultPreview,
    AcademicRecordFilters
} from '../types/academicRecord.types';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Filter results to only include completed marking
 * PRD-0015: Phase 7 & 8 - Exclude pending-review results from progress
 * 
 * Writing/Speaking tests that are pending teacher review should NOT
 * count toward academic progress until reviewed.
 * 
 * @param results Array of test results
 * @returns Filtered results (only auto-marked and reviewed)
 */
function filterCompletedResults(results: EnhancedTestResultRecord[]): EnhancedTestResultRecord[] {
    return results.filter(r => {
        const status = r.markingStatus;
        // Include if status is explicitly 'auto-marked' or 'reviewed'
        // Exclude if status is 'pending-review'
        // Also include if status is undefined (legacy results - assumed auto-marked)
        return !status || status === 'auto-marked' || status === 'reviewed';
    });
}

// ============================================
// RESULT RETRIEVAL FUNCTIONS
// ============================================

/**
 * Get all test results for a student
 * @param studentId Student's user ID
 * @returns Array of test results
 */
export async function getResultsByStudent(
    studentId: string
): Promise<EnhancedTestResultRecord[]> {
    try {
        const indexRef = ref(database, `test_results_by_student/${studentId}`);
        const indexSnapshot = await get(indexRef);

        if (!indexSnapshot.exists()) {
            return [];
        }

        const resultIds = Object.keys(indexSnapshot.val());

        // Fetch all results — gracefully skip any that throw Permission denied
        const results = await Promise.all(
            resultIds.map(async (resultId) => {
                try {
                    const resultRef = ref(database, `test_results/${resultId}`);
                    const snapshot = await get(resultRef);
                    return snapshot.exists() ? (snapshot.val() as EnhancedTestResultRecord) : null;
                } catch {
                    // Individual result may be inaccessible (e.g., missing studentId field)
                    console.warn(`[AcademicRecord] Skipping inaccessible result: ${resultId}`);
                    return null;
                }
            })
        );

        return results.filter((r): r is EnhancedTestResultRecord => r !== null);
    } catch (error) {
        console.error('Error fetching student results:', error);
        throw new Error('Failed to fetch student results');
    }
}

/**
 * Get test results for a student filtered by course
 * @param courseId Course ID
 * @param studentId Student's user ID
 * @returns Array of test results for the course
 */
export async function getResultsByCourse(
    courseId: string,
    studentId: string
): Promise<EnhancedTestResultRecord[]> {
    try {
        const allResults = await getResultsByStudent(studentId);

        // Filter by courseId
        return allResults.filter(result => result.courseId === courseId);
    } catch (error) {
        console.error('Error fetching course results:', error);
        throw new Error('Failed to fetch course results');
    }
}

/**
 * Get test results for a student filtered by skill
 * @param skill Skill type (reading, listening, writing, speaking)
 * @param studentId Student's user ID
 * @returns Array of test results for the skill
 */
export async function getResultsBySkill(
    skill: 'reading' | 'listening' | 'writing' | 'speaking',
    studentId: string
): Promise<EnhancedTestResultRecord[]> {
    try {
        const allResults = await getResultsByStudent(studentId);

        // Filter by skill
        return allResults.filter(result => result.testSkill === skill);
    } catch (error) {
        console.error('Error fetching skill results:', error);
        throw new Error('Failed to fetch skill results');
    }
}

/**
 * Get test results for a student filtered by class
 * @param classId Class ID
 * @param studentId Student's user ID
 * @returns Array of test results for the class
 */
export async function getResultsByClass(
    classId: string,
    studentId: string
): Promise<EnhancedTestResultRecord[]> {
    try {
        const allResults = await getResultsByStudent(studentId);

        // Filter by classId
        return allResults.filter(result => result.classId === classId);
    } catch (error) {
        console.error('Error fetching class results:', error);
        throw new Error('Failed to fetch class results');
    }
}

/**
 * Get test results with advanced filtering
 * @param studentId Student's user ID
 * @param filters Filter options
 * @returns Filtered array of test results
 */
export async function getFilteredResults(
    studentId: string,
    filters: AcademicRecordFilters
): Promise<EnhancedTestResultRecord[]> {
    try {
        let results = await getResultsByStudent(studentId);

        // Apply filters
        if (filters.courseId) {
            results = results.filter(r => r.courseId === filters.courseId);
        }

        if (filters.classId) {
            results = results.filter(r => r.classId === filters.classId);
        }

        if (filters.moduleId) {
            results = results.filter(r => r.moduleId === filters.moduleId);
        }

        if (filters.skill) {
            results = results.filter(r => r.testSkill === filters.skill);
        }

        if (filters.testType) {
            results = results.filter(r => r.testType === filters.testType);
        }

        if (filters.dateFrom) {
            results = results.filter(r => r.submittedAt >= filters.dateFrom!);
        }

        if (filters.dateTo) {
            results = results.filter(r => r.submittedAt <= filters.dateTo!);
        }

        if (filters.minScore !== undefined) {
            results = results.filter(r => r.percentage >= filters.minScore!);
        }

        if (filters.maxScore !== undefined) {
            results = results.filter(r => r.percentage <= filters.maxScore!);
        }

        // Apply sorting
        if (filters.sortBy) {
            results.sort((a, b) => {
                let comparison = 0;

                switch (filters.sortBy) {
                    case 'date':
                        comparison = a.submittedAt - b.submittedAt;
                        break;
                    case 'score':
                        comparison = a.percentage - b.percentage;
                        break;
                    case 'skill':
                        comparison = a.testSkill.localeCompare(b.testSkill);
                        break;
                    case 'course':
                        comparison = (a.courseName || '').localeCompare(b.courseName || '');
                        break;
                }

                return filters.sortOrder === 'desc' ? -comparison : comparison;
            });
        }

        // Apply pagination
        if (filters.offset !== undefined || filters.limit !== undefined) {
            const offset = filters.offset || 0;
            const limit = filters.limit || results.length;
            results = results.slice(offset, offset + limit);
        }

        return results;
    } catch (error) {
        console.error('Error fetching filtered results:', error);
        throw new Error('Failed to fetch filtered results');
    }
}

// ============================================
// ACADEMIC SUMMARY CALCULATION
// ============================================

/**
 * Generate comprehensive academic summary for a student
 * @param studentId Student's user ID
 * @param periodStart Optional start date for the period
 * @param periodEnd Optional end date for the period
 * @returns Academic summary with statistics and breakdowns
 */
export async function getAcademicSummary(
    studentId: string,
    periodStart?: number,
    periodEnd?: number
): Promise<AcademicSummary> {
    try {
        let results = await getResultsByStudent(studentId);

        // PRD-0015: Phase 7 & 8 - Filter out pending-review results
        // Only count auto-marked and reviewed results in academic progress
        results = filterCompletedResults(results);

        // Filter by period if specified
        if (periodStart) {
            results = results.filter(r => r.submittedAt >= periodStart);
        }
        if (periodEnd) {
            results = results.filter(r => r.submittedAt <= periodEnd);
        }

        if (results.length === 0) {
            // Return empty summary
            return {
                studentId,
                studentName: '',
                totalTests: 0,
                totalQuizzes: 0,
                averageScore: 0,
                averageBandScore: 0,
                bestScore: 0,
                bestBandScore: 0,
                bestTestId: null,
                lastTestDate: null,
                recentScores: [],
                skillBreakdown: [],
                courseProgress: [],
                periodStart: periodStart || 0,
                periodEnd: periodEnd || Date.now(),
                generatedAt: Date.now()
            };
        }

        // Calculate overall statistics
        const tests = results.filter(r => r.testType === 'test');
        const quizzes = results.filter(r => r.testType === 'quiz');

        const totalScore = results.reduce((sum, r) => sum + r.percentage, 0);
        const totalBandScore = results.reduce((sum, r) => sum + r.bandScore, 0);

        const bestResult = results.reduce((best, r) =>
            r.percentage > best.percentage ? r : best
        );

        // Get recent scores (last 10)
        const recentResults = [...results]
            .sort((a, b) => b.submittedAt - a.submittedAt)
            .slice(0, 10);

        const recentScores = recentResults.map(r => ({
            resultId: r.resultId,
            testTitle: r.testTitle,
            score: r.totalScore,
            percentage: r.percentage,
            submittedAt: r.submittedAt,
            skill: r.testSkill
        }));

        // Calculate skill breakdown
        const skillBreakdown = await calculateSkillBreakdown(results);

        // Calculate course progress
        const courseProgress = await calculateAllCourseProgress(studentId, results);

        return {
            studentId,
            studentName: results[0]?.studentName || '',
            totalTests: tests.length,
            totalQuizzes: quizzes.length,
            averageScore: totalScore / results.length,
            averageBandScore: totalBandScore / results.length,
            bestScore: bestResult.percentage,
            bestBandScore: bestResult.bandScore,
            bestTestId: bestResult.resultId,
            lastTestDate: Math.max(...results.map(r => r.submittedAt)),
            recentScores,
            skillBreakdown,
            courseProgress,
            periodStart: periodStart || Math.min(...results.map(r => r.submittedAt)),
            periodEnd: periodEnd || Date.now(),
            generatedAt: Date.now()
        };
    } catch (error) {
        console.error('Error generating academic summary:', error);
        throw new Error('Failed to generate academic summary');
    }
}

/**
 * Calculate skill breakdown from results
 * @param results Array of test results
 * @returns Skill breakdown array
 */
async function calculateSkillBreakdown(
    results: EnhancedTestResultRecord[]
): Promise<SkillBreakdown[]> {
    const skills: ('reading' | 'listening' | 'writing' | 'speaking')[] = [
        'reading', 'listening', 'writing', 'speaking'
    ];

    return skills.map(skill => {
        const skillResults = results.filter(r => r.testSkill === skill);

        if (skillResults.length === 0) {
            return {
                skill,
                totalTests: 0,
                totalQuizzes: 0,
                averageScore: 0,
                averageBandScore: 0,
                bestScore: 0,
                worstScore: 0,
                trend: 'insufficient-data' as const,
                trendPercentage: 0,
                recentTests: [],
                strongAreas: [],
                weakAreas: []
            };
        }

        const tests = skillResults.filter(r => r.testType === 'test');
        const quizzes = skillResults.filter(r => r.testType === 'quiz');

        const scores = skillResults.map(r => r.percentage);
        const bandScores = skillResults.map(r => r.bandScore);

        const averageScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        const averageBandScore = bandScores.reduce((sum, s) => sum + s, 0) / bandScores.length;

        // Calculate trend
        const recentResults = [...skillResults]
            .sort((a, b) => b.submittedAt - a.submittedAt)
            .slice(0, 5);

        const trend = calculateTrend(recentResults);

        // Get recent tests
        const recentTests = recentResults.slice(0, 3).map(r => ({
            resultId: r.resultId,
            testTitle: r.testTitle,
            score: r.percentage,
            bandScore: r.bandScore,
            submittedAt: r.submittedAt
        }));

        return {
            skill,
            totalTests: tests.length,
            totalQuizzes: quizzes.length,
            averageScore,
            averageBandScore,
            bestScore: Math.max(...scores),
            worstScore: Math.min(...scores),
            trend: trend.direction,
            trendPercentage: trend.percentage,
            recentTests,
            strongAreas: [],
            weakAreas: []
        };
    });
}

/**
 * Calculate trend from recent results
 * @param results Recent results (sorted newest first)
 * @returns Trend direction and percentage
 */
function calculateTrend(results: EnhancedTestResultRecord[]): {
    direction: 'improving' | 'stable' | 'declining' | 'insufficient-data';
    percentage: number;
} {
    if (results.length < 3) {
        return { direction: 'insufficient-data', percentage: 0 };
    }

    // Compare first half vs second half
    const mid = Math.floor(results.length / 2);
    const recentHalf = results.slice(0, mid);
    const olderHalf = results.slice(mid);

    const recentAvg = recentHalf.reduce((sum, r) => sum + r.percentage, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((sum, r) => sum + r.percentage, 0) / olderHalf.length;

    const diff = recentAvg - olderAvg;
    const percentageChange = (diff / olderAvg) * 100;

    if (Math.abs(percentageChange) < 5) {
        return { direction: 'stable', percentage: percentageChange };
    } else if (percentageChange > 0) {
        return { direction: 'improving', percentage: percentageChange };
    } else {
        return { direction: 'declining', percentage: percentageChange };
    }
}

/**
 * Calculate progress for all courses a student is enrolled in
 * @param studentId Student's user ID
 * @param results Student's test results
 * @returns Array of course progress
 */
async function calculateAllCourseProgress(
    studentId: string,
    results: EnhancedTestResultRecord[]
): Promise<CourseProgress[]> {
    // Get unique courses from results
    const courseMap = new Map<string, EnhancedTestResultRecord[]>();

    results.forEach(result => {
        if (result.courseId) {
            if (!courseMap.has(result.courseId)) {
                courseMap.set(result.courseId, []);
            }
            courseMap.get(result.courseId)!.push(result);
        }
    });

    return Array.from(courseMap.entries()).map(([courseId, courseResults]) => {
        const scores = courseResults.map(r => r.percentage);
        const moduleIds = [...new Set(courseResults.map(r => r.moduleId).filter(Boolean))];

        // Get module progress details
        const moduleProgress = moduleIds.map(moduleId => {
            const moduleResults = courseResults.filter(r => r.moduleId === moduleId);
            const moduleScores = moduleResults.map(r => r.percentage);

            return {
                moduleId: moduleId as string,
                moduleName: moduleResults[0]?.moduleName || '',
                isCompleted: moduleResults.length > 0,
                testCount: moduleResults.length,
                averageScore: moduleScores.reduce((sum, s) => sum + s, 0) / moduleScores.length,
                lastAttemptDate: Math.max(...moduleResults.map(r => r.submittedAt))
            };
        });

        return {
            courseId,
            courseName: courseResults[0]?.courseName || '',
            classId: courseResults[0]?.classId || null,
            className: courseResults[0]?.className || null,
            totalModules: moduleIds.length || 1,
            completedModules: moduleProgress.filter(m => m.isCompleted).length,
            progressPercentage: moduleIds.length > 0
                ? (moduleProgress.filter(m => m.isCompleted).length / moduleIds.length) * 100
                : 100,
            totalTests: courseResults.length,
            averageScore: scores.reduce((sum, s) => sum + s, 0) / scores.length,
            bestScore: Math.max(...scores),
            moduleProgress,
            enrolledAt: null,
            lastActivityAt: Math.max(...courseResults.map(r => r.submittedAt)),
            completedAt: null
        };
    });
}

/**
 * Calculate progress for a specific course
 * @param courseId Course ID
 * @param studentId Student's user ID
 * @param allResults Optional pre-fetched results (for performance)
 * @returns Course progress percentage (0-100)
 */
export async function calculateCourseProgress(
    courseId: string,
    studentId: string,
    allResults?: EnhancedTestResultRecord[]
): Promise<number> {
    try {
        let results = allResults || await getResultsByCourse(courseId, studentId);

        // PRD-0015: Phase 7 & 8 - Filter out pending-review results
        results = filterCompletedResults(results);

        if (results.length === 0) {
            return 0;
        }

        // Get unique modules
        const moduleIds = [...new Set(results.map(r => r.moduleId).filter(Boolean))];

        if (moduleIds.length === 0) {
            // No module tracking, use simple completion
            return results.length > 0 ? 100 : 0;
        }

        // Calculate progress based on module completion
        // This is a simplified version - actual implementation would check
        // module completion status from course data
        const completedModules = moduleIds.length;

        // For now, assume progress is based on modules with results
        // In a real implementation, we'd fetch total modules from course data
        const totalModules = completedModules; // Placeholder

        return (completedModules / totalModules) * 100;
    } catch (error) {
        console.error('Error calculating course progress:', error);
        return 0;
    }
}

// ============================================
// RESULT PREVIEW GENERATION
// ============================================

/**
 * Convert full result to lightweight preview
 * @param result Full test result record
 * @returns Result preview for index/list views
 */
export function createResultPreview(
    result: EnhancedTestResultRecord
): ResultPreview {
    return {
        resultId: result.resultId,
        testTitle: result.testTitle,
        testType: result.testType as 'quiz' | 'test',
        skill: result.testSkill as 'reading' | 'listening' | 'writing' | 'speaking',
        percentage: result.percentage,
        bandScore: result.bandScore,
        courseId: result.courseId || null,
        courseName: result.courseName || null,
        classId: result.classId || null,
        className: result.className || null,
        moduleId: result.moduleId || null,
        moduleName: result.moduleName || null,
        submittedAt: result.submittedAt,
        isGuest: result.isGuest || false,
        correct: result.correct,
        totalQuestions: result.totalQuestions
    };
}

/**
 * Get result previews for a student
 * @param studentId Student's user ID
 * @param filters Optional filters
 * @returns Array of result previews
 */
export async function getResultPreviews(
    studentId: string,
    filters?: AcademicRecordFilters
): Promise<ResultPreview[]> {
    try {
        const results = filters
            ? await getFilteredResults(studentId, filters)
            : await getResultsByStudent(studentId);

        return results.map(createResultPreview);
    } catch (error) {
        console.error('Error fetching result previews:', error);
        throw new Error('Failed to fetch result previews');
    }
}

// ============================================
// THCS ACADEMIC RECORD (Phase 3, Task 12.3)
// ============================================



// Skill area mapping from question types
// Keys MUST match THCSQuestionType enum values exactly
const QUESTION_TYPE_TO_SKILL: Record<string, string> = {
    // MCQIntent types
    'pronunciation': 'pronunciation',
    'word-stress': 'pronunciation',
    'mcq-grammar': 'grammar',
    'mcq-vocabulary': 'vocabulary',
    'mcq-sign-notice': 'vocabulary',
    'dialogue-response': 'vocabulary',
    'reading-cloze-mcq': 'reading',
    'reading-comprehension': 'reading',
    'reading-announcement': 'reading',
    'sentence-arrangement': 'grammar',
    'closest-meaning': 'grammar',
    'error-identification': 'grammar',
    'synonym-mcq': 'vocabulary',
    'antonym-mcq': 'vocabulary',
    'word-reference': 'reading',
    // Phase2QuestionType types
    'verb-form': 'grammar',
    'word-form': 'vocabulary',
    'reading-cloze-wordbank': 'reading',
    'sentence-rewrite': 'writing',
    'sentence-rewrite-keyword': 'writing',
};

/**
 * Task 12.3: Update THCS academic progress for a student
 * 
 * Uses runTransaction to prevent race conditions (same pattern as test stats in Phase 1).
 * Stored at: `academic_records/{studentId}/thcsProgress`
 */
export async function updateThcsProgress(
    studentId: string,
    testResult: {
        testId: string;
        testTitle: string;
        scaledScore: number;
        gradeLevel: number;
        examType: string;
        sectionResults: THCSSectionResult[];
    }
): Promise<void> {
    try {
        const thcsRef = ref(database, `academic_records/${studentId}/thcsProgress`);

        await runTransaction(thcsRef, (current: any) => {
            const now = Date.now();

            if (!current) {
                // First THCS test — initialize
                const skillBreakdown: Record<string, { correct: number; total: number }> = {};
                testResult.sectionResults.forEach(sr => {
                    // Use intentBreakdown to map question types to skill areas
                    if (sr.intentBreakdown) {
                        for (const [qType, data] of Object.entries(sr.intentBreakdown)) {
                            const skill = QUESTION_TYPE_TO_SKILL[qType] || 'other';
                            if (!skillBreakdown[skill]) skillBreakdown[skill] = { correct: 0, total: 0 };
                            skillBreakdown[skill].correct += data.correct;
                            skillBreakdown[skill].total += data.total;
                        }
                    }
                });

                return {
                    testsCompleted: 1,
                    averageScore: testResult.scaledScore,
                    scoreHistory: [{
                        testId: testResult.testId,
                        testTitle: testResult.testTitle,
                        scaledScore: testResult.scaledScore,
                        gradeLevel: testResult.gradeLevel,
                        examType: testResult.examType,
                        completedAt: now,
                    }],
                    skillBreakdown,
                    lastUpdated: now,
                };
            }

            // Update existing progress
            const newCount = (current.testsCompleted || 0) + 1;
            const oldAvg = current.averageScore || 0;
            const newAvg = ((oldAvg * (newCount - 1)) + testResult.scaledScore) / newCount;

            // Append to score history (keep last 100)
            const history = Array.isArray(current.scoreHistory) ? [...current.scoreHistory] : [];
            history.push({
                testId: testResult.testId,
                testTitle: testResult.testTitle,
                scaledScore: testResult.scaledScore,
                gradeLevel: testResult.gradeLevel,
                examType: testResult.examType,
                completedAt: now,
            });
            if (history.length > 100) history.shift();

            const skillBreakdown = current.skillBreakdown ? { ...current.skillBreakdown } : {};
            testResult.sectionResults.forEach(sr => {
                if (sr.intentBreakdown) {
                    for (const [qType, data] of Object.entries(sr.intentBreakdown)) {
                        const skill = QUESTION_TYPE_TO_SKILL[qType] || 'other';
                        if (!skillBreakdown[skill]) skillBreakdown[skill] = { correct: 0, total: 0 };
                        skillBreakdown[skill] = {
                            correct: (skillBreakdown[skill].correct || 0) + data.correct,
                            total: (skillBreakdown[skill].total || 0) + data.total,
                        };
                    }
                }
            });

            return {
                testsCompleted: newCount,
                averageScore: Math.round(newAvg * 100) / 100,
                scoreHistory: history,
                skillBreakdown,
                lastUpdated: now,
            };
        });

        console.log(`✅ [AcademicRecord] THCS progress updated for student ${studentId}`);
    } catch (error) {
        console.error('Error updating THCS progress:', error);
        // Non-blocking — don't throw, just log
    }
}
