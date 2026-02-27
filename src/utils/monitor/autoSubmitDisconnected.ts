/**
 * Auto-Submit Utility for Disconnected & Unsubmitted Students
 * 
 * Handles automatic submission of answers for students who disconnect
 * during a test session or haven't submitted when teacher ends the test.
 * 
 * @see PRD-0018: Unified Audio Architecture - Task 9.2
 * @see BUG-FIX: Teacher ends test before timer - all students auto-submitted
 */

import { ref, update } from 'firebase/database';
// @ts-ignore - firebase.js is a JS file without type declarations
import { database } from '../../services/firebase';
import { saveTestResult } from '../../services/testResults.service';
import { markTest } from '../../services/autoMarking.service';
import type { StudentAnswer } from '../../services/autoMarking.service';

// ============================================================
// TYPES
// ============================================================

export interface DisconnectedStudentData {
    studentId: string;
    name: string;
    answers: Record<string, any>;
    lastActivity: number;
    disconnectedAt?: number;
}

export interface AutoSubmitResult {
    success: boolean;
    studentId: string;
    studentName: string;
    submittedCount: number;
    error?: string;
}

// ============================================================
// COMPLETENESS CHECK (PRD-0019 Task 5.2)
// ============================================================

/**
 * Checks if a submission is complete by comparing answered count to total questions.
 * 
 * @param answers - The student's answers object
 * @param totalQuestions - Total number of questions in the test
 * @returns Object with answeredCount, isComplete flag, and incompleteCount
 */
export function checkSubmissionCompleteness(
    answers: Record<string, any> | undefined,
    totalQuestions: number
): { answeredCount: number; isComplete: boolean; incompleteCount: number } {
    if (!answers) {
        return { answeredCount: 0, isComplete: totalQuestions === 0, incompleteCount: totalQuestions };
    }

    // Count valid answers (non-null, non-undefined)
    const answeredCount = Object.values(answers).filter(val =>
        val !== null &&
        val !== undefined &&
        (Array.isArray(val) ? val.length > 0 : val !== '')
    ).length;

    return {
        answeredCount,
        isComplete: answeredCount >= totalQuestions,
        incompleteCount: Math.max(0, totalQuestions - answeredCount)
    };
}

// ============================================================
// AUTO-SUBMIT FUNCTION
// ============================================================

/**
 * Auto-submits answers for disconnected students when test ends.
 * Preserves all answers collected before disconnect.
 * 
 * @param sessionCode - The session code
 * @param testId - The test ID
 * @param disconnectedStudents - Array of disconnected student data
 * @param totalQuestions - Total number of questions in the test (PRD-0019)
 * @returns Array of submit results
 */
export async function autoSubmitDisconnectedStudents(
    sessionCode: string,
    testId: string,
    disconnectedStudents: DisconnectedStudentData[],
    totalQuestions: number = 0 // Default to 0 if not provided
): Promise<AutoSubmitResult[]> {
    const results: AutoSubmitResult[] = [];

    console.log(`🔄 [AutoSubmit] Processing ${disconnectedStudents.length} disconnected students...`);

    for (const student of disconnectedStudents) {
        try {
            // Skip if no answers to submit
            if (!student.answers || Object.keys(student.answers).length === 0) {
                console.log(`⏭️ [AutoSubmit] Skipping ${student.name} - no answers to submit`);
                results.push({
                    success: true,
                    studentId: student.studentId,
                    studentName: student.name,
                    submittedCount: 0,
                });
                continue;
            }

            // Check completeness (PRD-0019)
            const { answeredCount, isComplete } = checkSubmissionCompleteness(student.answers, totalQuestions);

            // Create test result entry
            const resultId = `${testId}_${student.studentId}_${Date.now()}`;

            const testResult = {
                testId,
                sessionCode,
                studentId: student.studentId,
                studentName: student.name,
                answers: student.answers,
                submittedAt: Date.now(),
                isIncomplete: !isComplete, // PRD-0019 flag
                submittedBy: 'system-timeout', // PRD-0019 unified value
                disconnectedAt: student.disconnectedAt || student.lastActivity,
                lastActivityAt: student.lastActivity,
                answeredCount: answeredCount,
                totalQuestions: totalQuestions, // Store total questions for reference
                // Mark as needing review
                needsReview: true,
                reviewReason: 'Student disconnected during test',
            };

            await update(ref(database), {
                [`test_results/${resultId}`]: testResult,
            });

            console.log(`✅ [AutoSubmit] Submitted ${answeredCount} answers for ${student.name} (Complete: ${isComplete})`);

            results.push({
                success: true,
                studentId: student.studentId,
                studentName: student.name,
                submittedCount: answeredCount,
            });
        } catch (error) {
            console.error(`❌ [AutoSubmit] Failed to submit for ${student.name}:`, error);
            results.push({
                success: false,
                studentId: student.studentId,
                studentName: student.name,
                submittedCount: 0,
                error: String(error),
            });
        }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`📊 [AutoSubmit] Complete: ${successCount}/${disconnectedStudents.length} successful`);

    return results;
}

/**
 * Identifies disconnected students from session players.
 * A student is considered disconnected if:
 * - lastActivity is more than 60 seconds ago
 * - AND they haven't submitted their test
 * 
 * @param players - The session players object
 * @returns Array of disconnected student data
 */
export function identifyDisconnectedStudents(
    players: Record<string, any> | undefined
): DisconnectedStudentData[] {
    if (!players) return [];

    const disconnected: DisconnectedStudentData[] = [];
    const now = Date.now();
    const DISCONNECT_THRESHOLD_MS = 60000; // 60 seconds

    Object.entries(players).forEach(([playerId, player]) => {
        // Skip if already submitted
        if (player.isSubmitted || player.submittedAt || player.hasSubmitted) {
            return;
        }

        // Check if disconnected (no activity for 60+ seconds)
        const lastActivity = player.lastActivity || 0;
        const timeSinceLastActivity = now - lastActivity;

        if (timeSinceLastActivity > DISCONNECT_THRESHOLD_MS) {
            disconnected.push({
                studentId: playerId,
                name: player.name || player.playerName || `Student ${playerId.slice(0, 6)}`,
                answers: player.answers || {},
                lastActivity: lastActivity,
                disconnectedAt: lastActivity + DISCONNECT_THRESHOLD_MS, // Estimated disconnect time
            });
        }
    });

    console.log(`🔍 [AutoSubmit] Found ${disconnected.length} disconnected students`);
    return disconnected;
}

// ============================================================
// TYPES FOR FULL AUTO-SUBMIT
// ============================================================

export interface UnsubmittedStudentData {
    studentId: string;
    name: string;
    answers: Record<string, any>;
    isConnected: boolean;
    lastActivity: number;
}

export interface FullAutoSubmitResult {
    success: boolean;
    studentId: string;
    studentName: string;
    resultId?: string;
    answeredCount: number;
    error?: string;
}

// ============================================================
// AUTO-SUBMIT ALL UNSUBMITTED STUDENTS (BUG FIX)
// ============================================================

/**
 * Identifies ALL unsubmitted students from session players.
 * Unlike identifyDisconnectedStudents, this includes ALL students
 * who haven't submitted, regardless of connection status.
 * 
 * @param players - The session players object
 * @returns Array of unsubmitted student data
 */
export function identifyUnsubmittedStudents(
    players: Record<string, any> | undefined
): UnsubmittedStudentData[] {
    if (!players) return [];

    const unsubmitted: UnsubmittedStudentData[] = [];

    Object.entries(players).forEach(([playerId, player]) => {
        // Skip if already submitted by the student themselves
        if (player.isSubmitted || player.submittedAt || player.hasSubmitted || player.hasCompletedTest) {
            return;
        }

        unsubmitted.push({
            studentId: playerId,
            name: player.name || player.playerName || `Student ${playerId.slice(0, 6)}`,
            answers: player.answers || {},
            isConnected: player.isConnected !== false, // Default to true if not set
            lastActivity: player.lastActivity || 0,
        });
    });

    console.log(`🔍 [AutoSubmit] Found ${unsubmitted.length} unsubmitted students (connected + disconnected)`);
    return unsubmitted;
}

/**
 * Auto-submits and properly records results for ALL unsubmitted students 
 * when a teacher ends the test early.
 * 
 * This function:
 * 1. Extracts each student's auto-saved answers from the session
 * 2. Marks the answers against the test questions
 * 3. Saves results via saveTestResult (creates ALL Firebase indexes)
 * 4. Results appear in Student History AND Teacher Analytics
 * 
 * @param sessionCode - The session code
 * @param testId - The test ID
 * @param unsubmittedStudents - Array of unsubmitted student data
 * @param testQuestions - The test questions for marking
 * @param testMetadata - Test metadata (title, type, skill, duration)
 * @param teacherId - The teacher ID for indexing
 * @param testDuration - Test duration in minutes
 * @param sessionStartTime - When the test started (for time elapsed calculation)
 * @param academicContext - Optional academic context (courseId, classId, etc.)
 * @returns Array of submit results
 */
export async function autoSubmitAllUnsubmittedStudents(
    sessionCode: string,
    testId: string,
    unsubmittedStudents: UnsubmittedStudentData[],
    testQuestions: any[],
    testMetadata: {
        title: string;
        type: string;
        skill: string;
        duration: number;
    },
    teacherId: string,
    sessionStartTime: number | null,
    academicContext?: {
        courseId?: string;
        courseName?: string;
        classId?: string;
        className?: string;
        moduleId?: string;
        moduleName?: string;
    }
): Promise<FullAutoSubmitResult[]> {
    const results: FullAutoSubmitResult[] = [];

    console.log(`🔄 [AutoSubmit] Processing ${unsubmittedStudents.length} unsubmitted students for proper result recording...`);

    for (const student of unsubmittedStudents) {
        try {
            // 1. Extract student's answers from auto-saved format
            // Firebase auto-save format: { questionNum: { answer: value, timestamp: ... } }
            // We need to convert to StudentAnswer format for markTest
            const studentAnswers: Record<number, StudentAnswer> = {};
            let answeredCount = 0;

            if (student.answers && Object.keys(student.answers).length > 0) {
                Object.entries(student.answers).forEach(([questionNum, answerData]) => {
                    const qNum = parseInt(questionNum);
                    if (isNaN(qNum)) return;

                    // Handle both formats: { answer: value } and direct value
                    const rawAnswer = typeof answerData === 'object' && answerData !== null && 'answer' in answerData
                        ? answerData.answer
                        : answerData;

                    if (rawAnswer !== null && rawAnswer !== undefined && rawAnswer !== '') {
                        studentAnswers[qNum] = {
                            questionId: String(qNum),
                            questionNumber: qNum,
                            answer: rawAnswer,
                        };
                        answeredCount++;
                    }
                });
            }

            // 2. Mark the test using the auto-marking service
            const markingResult = markTest(testQuestions, studentAnswers);

            // 3. Calculate time elapsed
            const now = Date.now();
            const timeElapsed = sessionStartTime ? Math.floor((now - sessionStartTime) / 1000) : testMetadata.duration * 60;

            // 4. Check if student is a guest
            // Only guest_ prefix indicates a guest. Firebase Auth UIDs (e.g., G5yDXmkDfsVhoKYTp7xTwbbggtB2)
            // do NOT contain underscores but are authenticated users, NOT guests.
            const isGuest = student.studentId.startsWith('guest_');

            // 5. Save via saveTestResult (creates ALL Firebase indexes!)
            const resultId = await saveTestResult(
                sessionCode,
                testId,
                student.studentId,
                student.name,
                markingResult,
                testMetadata,
                timeElapsed,
                teacherId,
                isGuest,
                undefined, // submissionContent
                academicContext ? {
                    courseId: academicContext.courseId,
                    courseName: academicContext.courseName,
                    classId: academicContext.classId,
                    className: academicContext.className,
                    moduleId: academicContext.moduleId,
                    moduleName: academicContext.moduleName,
                } : undefined,
                // ResultContext for teacher-ended auto-submissions
                {
                    type: 'class_session' as const,
                    source: { type: 'class' as const },
                    configApplied: {
                        timerMinutes: testMetadata.duration,
                        feedbackTiming: 'after_completion' as const,
                        source: 'teacher_override' as const,
                    },
                }
            );

            console.log(`✅ [AutoSubmit] Saved result for ${student.name}: ${answeredCount} answers, score=${markingResult.percentage}%, resultId=${resultId}`);

            results.push({
                success: true,
                studentId: student.studentId,
                studentName: student.name,
                resultId,
                answeredCount,
            });
        } catch (error) {
            console.error(`❌ [AutoSubmit] Failed to save result for ${student.name}:`, error);
            results.push({
                success: false,
                studentId: student.studentId,
                studentName: student.name,
                answeredCount: 0,
                error: String(error),
            });
        }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`📊 [AutoSubmit] Complete: ${successCount}/${unsubmittedStudents.length} students' results saved with proper indexes`);

    return results;
}
