/**
 * Solo Session Manager
 * PRD-0016: Solo Study & Homework System
 * 
 * Manages solo study sessions - creating, updating, and completing sessions.
 * Handles session state, progress tracking, and result saving.
 */

import { ref, set, get, update, push } from 'firebase/database';
// @ts-ignore - firebase.js doesn't have type declarations
import { database } from './firebase';
import { saveTestResult } from './testResults.service';
import type { SoloSession, SoloSessionStatus, ResultContext } from '../types/solo.types';
import type { TestData } from './testStorage';

/**
 * Create a new solo session
 * 
 * @param studentId - Student ID
 * @param materialId - Material/test ID to practice
 * @param context - Result context (self_study, homework, course_material)
 * @returns Created session
 */
export async function createSoloSession(
    studentId: string,
    materialId: string,
    context: Omit<ResultContext, 'configApplied'>
): Promise<SoloSession> {
    try {
        console.log('📝 Creating solo session:', { studentId, materialId, context });

        // Fetch material data
        const materialRef = ref(database, `tests/${materialId}`);
        const materialSnapshot = await get(materialRef);

        if (!materialSnapshot.exists()) {
            throw new Error('Material not found');
        }

        const material: TestData = materialSnapshot.val();

        // Check if solo mode is enabled
        if (!material.soloConfig?.soloEnabled) {
            throw new Error('Solo mode is not enabled for this material');
        }

        // Get configuration from material
        const soloConfig = material.soloConfig;
        const appliedConfig = {
            timerMinutes: soloConfig.defaults.timerMinutes || undefined,
            feedbackTiming: soloConfig.defaults.feedbackTiming,
            source: 'material_default' as const
        };

        // Create session ID
        const sessionsRef = ref(database, 'solo_sessions');
        const newSessionRef = push(sessionsRef);
        const sessionId = newSessionRef.key!;

        // Build complete context with applied config
        const completeContext: ResultContext = {
            ...context,
            configApplied: appliedConfig
        };

        // Create session object
        const session: SoloSession = {
            id: sessionId,
            studentId,
            materialId,
            materialTitle: material.title,
            materialType: material.type === 'Custom' ? 'quiz' : 'test',
            materialSkill: material.skillType || 'reading',
            context: completeContext,
            config: appliedConfig,
            startedAt: Date.now(),
            timeSpent: 0,
            timeRemaining: appliedConfig.timerMinutes ? appliedConfig.timerMinutes * 60 : undefined,
            currentQuestion: 0,
            totalQuestions: material.questionCount,
            answers: {},
            status: 'active'
        };

        // Save to Firebase
        await set(newSessionRef, session);

        console.log('✅ Solo session created:', sessionId);
        return session;

    } catch (error) {
        console.error('❌ Error creating solo session:', error);
        throw error;
    }
}

/**
 * Get a solo session by ID
 * 
 * @param sessionId - Session ID
 * @returns Session data or null
 */
export async function getSoloSession(sessionId: string): Promise<SoloSession | null> {
    try {
        const sessionRef = ref(database, `solo_sessions/${sessionId}`);
        const snapshot = await get(sessionRef);

        if (!snapshot.exists()) {
            return null;
        }

        return snapshot.val() as SoloSession;

    } catch (error) {
        console.error('❌ Error getting solo session:', error);
        return null;
    }
}

/**
 * Update session progress (save answers, update time)
 * 
 * @param sessionId - Session ID
 * @param updates - Partial session updates
 */
export async function updateSoloSession(
    sessionId: string,
    updates: {
        answers?: Record<string, any>;
        currentQuestion?: number;
        timeSpent?: number;
        timeRemaining?: number;
        status?: SoloSessionStatus;
    }
): Promise<void> {
    try {
        const sessionRef = ref(database, `solo_sessions/${sessionId}`);
        await update(sessionRef, updates);

        console.log('✅ Solo session updated:', sessionId);

    } catch (error) {
        console.error('❌ Error updating solo session:', error);
        throw error;
    }
}

/**
 * Complete a solo session and save results
 * 
 * @param sessionId - Session ID
 * @param finalAnswers - Final answers submitted
 * @returns Result ID
 */
export async function completeSoloSession(
    sessionId: string,
    finalAnswers: Record<string, any>
): Promise<string> {
    try {
        console.log('🏁 Completing solo session:', sessionId);

        // Get session data
        const session = await getSoloSession(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        // Get material data for grading
        const materialRef = ref(database, `tests/${session.materialId}`);
        const materialSnapshot = await get(materialRef);

        if (!materialSnapshot.exists()) {
            throw new Error('Material not found');
        }

        const material: TestData = materialSnapshot.val();

        // Grade the test
        const gradingResult = gradeTest(material, finalAnswers);

        // Calculate time spent
        const timeSpent = Math.floor((Date.now() - session.startedAt) / 1000);

        // Fetch actual student name from user profile
        let studentName = 'Student';
        try {
            const userRef = ref(database, `users/${session.studentId}`);
            const userSnapshot = await get(userRef);
            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                studentName = userData.displayName || userData.name || userData.email || 'Student';
            }
        } catch (nameErr) {
            console.warn('⚠️ Could not fetch student name, using fallback:', nameErr);
        }

        // Save result using testResults service
        const resultId = await saveTestResult(
            sessionId, // Use session ID as session code
            material.id,
            session.studentId,
            studentName,
            gradingResult,
            {
                title: material.title,
                type: material.type,
                skill: material.skillType || 'reading',
                duration: material.duration
            },
            timeSpent,
            undefined, // No teacher for solo sessions
            false, // Not a guest
            undefined, // No submission content for auto-marked
            undefined, // No academic context for solo
            session.context // Pass the result context
        );

        // Update session status
        await update(ref(database, `solo_sessions/${sessionId}`), {
            status: 'completed',
            endedAt: Date.now(),
            timeSpent,
            answers: finalAnswers,
            resultId
        });

        console.log('✅ Solo session completed, result ID:', resultId);
        return resultId;

    } catch (error) {
        console.error('❌ Error completing solo session:', error);
        throw error;
    }
}

/**
 * Abandon a solo session (timeout, navigation away, etc.)
 * 
 * @param sessionId - Session ID
 */
export async function abandonSoloSession(sessionId: string): Promise<void> {
    try {
        await update(ref(database, `solo_sessions/${sessionId}`), {
            status: 'abandoned',
            endedAt: Date.now()
        });

        console.log('⚠️ Solo session abandoned:', sessionId);

    } catch (error) {
        console.error('❌ Error abandoning solo session:', error);
        throw error;
    }
}

/**
 * Pause a solo session (if allowed by config)
 * 
 * @param sessionId - Session ID
 */
export async function pauseSoloSession(sessionId: string): Promise<void> {
    try {
        const session = await getSoloSession(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        // Check if pausing is allowed
        // For now, we'll allow pausing for all sessions
        // TODO: Check material settings for allowPause

        await update(ref(database, `solo_sessions/${sessionId}`), {
            status: 'paused'
        });

        console.log('⏸️ Solo session paused:', sessionId);

    } catch (error) {
        console.error('❌ Error pausing solo session:', error);
        throw error;
    }
}

/**
 * Resume a paused solo session
 * 
 * @param sessionId - Session ID
 */
export async function resumeSoloSession(sessionId: string): Promise<void> {
    try {
        await update(ref(database, `solo_sessions/${sessionId}`), {
            status: 'active'
        });

        console.log('▶️ Solo session resumed:', sessionId);

    } catch (error) {
        console.error('❌ Error resuming solo session:', error);
        throw error;
    }
}

/**
 * Get all sessions for a student
 * 
 * @param studentId - Student ID
 * @param status - Optional status filter
 * @returns Array of sessions
 */
export async function getStudentSessions(
    studentId: string,
    status?: SoloSessionStatus
): Promise<SoloSession[]> {
    try {
        const sessionsRef = ref(database, 'solo_sessions');
        const snapshot = await get(sessionsRef);

        if (!snapshot.exists()) {
            return [];
        }

        const allSessions: SoloSession[] = Object.values(snapshot.val());

        // Filter by student ID
        let sessions = allSessions.filter(s => s.studentId === studentId);

        // Filter by status if provided
        if (status) {
            sessions = sessions.filter(s => s.status === status);
        }

        // Sort by start time (most recent first)
        sessions.sort((a, b) => b.startedAt - a.startedAt);

        return sessions;

    } catch (error) {
        console.error('❌ Error getting student sessions:', error);
        return [];
    }
}

/**
 * Grade a test (simplified version)
 * 
 * @param material - Test material
 * @param answers - Student answers
 * @returns Grading result
 */
function gradeTest(material: TestData, answers: Record<string, any>) {
    let correctCount = 0;
    const questionResults: any[] = [];

    material.questions.forEach((question) => {
        const studentAnswer = answers[question.number];
        let isCorrect = false;

        if (studentAnswer !== undefined && studentAnswer !== null && studentAnswer !== '') {
            // Simple comparison (can be enhanced)
            if (Array.isArray(question.answer) && Array.isArray(studentAnswer)) {
                isCorrect = JSON.stringify(question.answer.sort()) === JSON.stringify(studentAnswer.sort());
            } else {
                isCorrect = String(studentAnswer).toLowerCase() === String(question.answer).toLowerCase();
            }
        }

        if (isCorrect) correctCount++;

        questionResults.push({
            questionId: String(question.number),
            questionNumber: question.number,
            questionType: question.type,
            studentAnswer: studentAnswer || '',
            correctAnswer: question.answer,
            isCorrect,
            score: isCorrect ? 1 : 0,
            maxScore: 1,
            feedback: isCorrect ? 'Correct' : 'Incorrect',
            partialCredit: false
        });
    });

    const percentage = Math.round((correctCount / material.questions.length) * 100);

    return {
        totalScore: correctCount,
        maxScore: material.questions.length,
        percentage,
        questionResults,
        summary: {
            correct: correctCount,
            incorrect: material.questions.length - correctCount,
            partialCredit: 0,
            totalQuestions: material.questions.length
        },
        correct: correctCount,
        incorrect: material.questions.length - correctCount,
        partialCredit: 0,
        totalQuestions: material.questions.length,
        completedAt: Date.now()
    };
}
