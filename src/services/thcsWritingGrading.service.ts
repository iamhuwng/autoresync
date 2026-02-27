/**
 * THCS Writing Grading Service (Phase 2 — Task 6.5)
 * Two-tier grading: Tier 1 (client-side string similarity) → Tier 2 (AI LLM)
 * 
 * Default behavior: writing questions go to 'teacher-review' UNLESS autoGradeWriting === true
 * Per PRD §4.3.5: Client-side execution, not a Cloud Function
 */

import type {
    THCSSection,
    THCSGradingResult,
    WritingGradingResult,
    WritingGradingTier,
} from '../types/thcs-test.types';
import { normalizeAnswer } from './thcsAutoMarking.service';
import { aiService } from './ai/router.service';
import { ref, update } from 'firebase/database';
import { database } from './firebase';
import { sendThcsGradeUpdatedNotification } from './notificationService';

// ═══════════════════════════════════════════════════════════════
// Levenshtein distance (in-house — per PRD §7.1, no external lib)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute Levenshtein edit distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    // Optimize for empty strings
    if (m === 0) return n;
    if (n === 0) return m;

    // Use single-row DP for O(n) space
    const prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
        let prevDiag = prev[0]!;
        prev[0] = i;
        for (let j = 1; j <= n; j++) {
            const temp = prev[j]!;
            if (a[i - 1] === b[j - 1]) {
                prev[j] = prevDiag;
            } else {
                prev[j] = 1 + Math.min(prevDiag, prev[j - 1]!, prev[j]!);
            }
            prevDiag = temp;
        }
    }

    return prev[n]!;
}

// ═══════════════════════════════════════════════════════════════
// String similarity metrics
// ═══════════════════════════════════════════════════════════════

/**
 * Jaccard similarity between two strings (token-level)
 */
function jaccardSimilarity(a: string, b: string): number {
    const tokensA = new Set(a.split(/\s+/));
    const tokensB = new Set(b.split(/\s+/));
    const intersection = new Set([...tokensA].filter(t => tokensB.has(t)));
    const union = new Set([...tokensA, ...tokensB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Word order similarity (positional comparison)
 */
function wordOrderSimilarity(a: string, b: string): number {
    const wordsA = a.split(/\s+/);
    const wordsB = b.split(/\s+/);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;

    let matches = 0;
    const minLen = Math.min(wordsA.length, wordsB.length);

    for (let i = 0; i < minLen; i++) {
        if (wordsA[i] === wordsB[i]) matches++;
    }

    return matches / Math.max(wordsA.length, wordsB.length);
}

/**
 * Compute Tier 1 confidence score using multiple similarity metrics
 * Returns 0-100
 */
function computeTier1Confidence(studentAnswer: string, modelAnswers: string[]): number {
    if (!studentAnswer.trim() || modelAnswers.length === 0) return 0;

    const normalizedStudent = normalizeAnswer(studentAnswer);
    let bestScore = 0;

    for (const model of modelAnswers) {
        const normalizedModel = normalizeAnswer(model);

        // Exact match after normalization
        if (normalizedStudent === normalizedModel) return 100;

        // Compute individual metrics
        const jaccard = jaccardSimilarity(normalizedStudent, normalizedModel);
        const maxLen = Math.max(normalizedStudent.length, normalizedModel.length);
        const lev = maxLen > 0 ? 1 - levenshteinDistance(normalizedStudent, normalizedModel) / maxLen : 0;
        const wordOrder = wordOrderSimilarity(normalizedStudent, normalizedModel);

        // Weighted average: Jaccard 40%, Levenshtein 35%, Word order 25%
        const score = (jaccard * 0.4 + lev * 0.35 + wordOrder * 0.25) * 100;
        bestScore = Math.max(bestScore, score);
    }

    return Math.round(bestScore);
}

// ═══════════════════════════════════════════════════════════════
// Token bucket rate limiter (max 10 LLM calls/min per session)
// ═══════════════════════════════════════════════════════════════

const TOKEN_BUCKET = {
    tokens: 10,
    maxTokens: 10,
    lastRefill: Date.now(),
    refillIntervalMs: 60000, // 1 minute
};

function acquireToken(): boolean {
    const now = Date.now();
    const elapsed = now - TOKEN_BUCKET.lastRefill;
    if (elapsed >= TOKEN_BUCKET.refillIntervalMs) {
        TOKEN_BUCKET.tokens = TOKEN_BUCKET.maxTokens;
        TOKEN_BUCKET.lastRefill = now;
    }
    if (TOKEN_BUCKET.tokens > 0) {
        TOKEN_BUCKET.tokens--;
        return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════
// Main grading function
// ═══════════════════════════════════════════════════════════════

/**
 * Grade a single writing answer using the two-tier system
 */
async function gradeOneWritingAnswer(
    studentAnswer: string,
    modelAnswers: string[],
    originalSentence: string,
    autoGradeWriting: boolean,
    questionType: 'sentence-rewrite' | 'sentence-rewrite-keyword',
    sentenceStarter?: string,
    keyword?: string,
): Promise<{ gradingTier: WritingGradingTier; aiScore?: number; aiFeedback?: string }> {
    // Default: skip auto-grading, go directly to teacher review
    if (!autoGradeWriting) {
        return { gradingTier: 'teacher-review' };
    }

    // PRD EC4: Strip sentence starter if student re-typed it (E1 only)
    let processedAnswer = studentAnswer;
    if (questionType === 'sentence-rewrite' && sentenceStarter) {
        const normalizedStarter = normalizeAnswer(sentenceStarter);
        const normalizedAnswer = normalizeAnswer(processedAnswer);
        if (normalizedAnswer.startsWith(normalizedStarter)) {
            processedAnswer = processedAnswer.trim().slice(sentenceStarter.trim().length).trim();
        }
    }

    // ─── Tier 1: Client-side string similarity ────────────────
    const confidence = computeTier1Confidence(processedAnswer, modelAnswers);

    if (confidence >= 80) {
        return { gradingTier: 'auto-correct', aiScore: confidence };
    }
    if (confidence < 30) {
        return { gradingTier: 'auto-incorrect', aiScore: confidence };
    }

    // ─── Tier 2: AI LLM grading (30% ≤ confidence < 80%) ────
    if (!acquireToken()) {
        // Rate limited — fall back to teacher review
        console.warn('[WritingGrading] Token bucket exhausted, falling back to teacher-review');
        return { gradingTier: 'teacher-review', aiScore: confidence };
    }

    const context = sentenceStarter ? { sentenceStarter } : keyword ? { keyword } : undefined;
    const aiResult = await aiService.gradeWritingAnswer(
        processedAnswer, modelAnswers, originalSentence, context
    );

    if (!aiResult.success || !aiResult.data) {
        // AI failed — fall back to teacher review
        console.warn('[WritingGrading] AI grading failed, falling back to teacher-review');
        return { gradingTier: 'teacher-review', aiScore: confidence, aiFeedback: 'AI Unavailable — Manual Review Required' };
    }

    const llmScore = aiResult.data.score;
    let tier: WritingGradingTier;

    if (llmScore >= 80) {
        tier = 'ai-correct';
    } else if (llmScore < 50) {
        tier = 'ai-incorrect';
    } else {
        tier = 'teacher-review';
    }

    return {
        gradingTier: tier,
        aiScore: llmScore,
        aiFeedback: aiResult.data.feedback,
    };
}

// ═══════════════════════════════════════════════════════════════
// Exported entry point (called fire-and-forget after submission)
// ═══════════════════════════════════════════════════════════════

/**
 * Process all pending writing questions after test submission.
 * Runs on the student's client — NOT a Cloud Function.
 * If the student closes the browser, remaining 'pending' questions
 * go to teacher manual grading via Task 7.0.
 */
export async function gradeWritingQuestions(
    gradingResult: THCSGradingResult,
    sections: THCSSection[],
    sessionCode: string,
    studentId: string,
): Promise<void> {
    // Build question lookup
    const questionMap = new Map(
        sections.flatMap(s => s.questions).map(q => [q.questionNumber, q])
    );

    // Find all pending writing questions
    const pendingEntries = Object.entries(gradingResult.questionResults)
        .filter(([, qr]) => qr.writingResult?.gradingTier === 'pending');

    if (pendingEntries.length === 0) return;

    console.info(`[WritingGrading] Processing ${pendingEntries.length} writing question(s)...`);

    for (const [qNumStr, qr] of pendingEntries) {
        const qNum = parseInt(qNumStr);
        const question = questionMap.get(qNum);
        if (!question) continue;

        // Skip if autoGradeWriting is not enabled
        if (question.autoGradeWriting !== true) {
            console.info(`[WritingGrading] Q${qNum}: autoGradeWriting disabled, leaving as pending`);
            continue;
        }

        try {
            const result = await gradeOneWritingAnswer(
                typeof qr.studentAnswer === 'string' ? qr.studentAnswer : '',
                question.modelAnswers || [],
                question.originalSentence || question.questionText,
                true,
                question.type as 'sentence-rewrite' | 'sentence-rewrite-keyword',
                question.sentenceStarter,
                question.keyword,
            );

            // Update the grading result in RTDB
            const writingResult: WritingGradingResult = {
                studentAnswer: typeof qr.studentAnswer === 'string' ? qr.studentAnswer : '',
                modelAnswers: question.modelAnswers || [],
                gradingTier: result.gradingTier,
                aiScore: result.aiScore,
                aiFeedback: result.aiFeedback,
            };

            // Compute points based on grading tier
            let pointsEarned = 0;
            if (result.gradingTier === 'auto-correct' || result.gradingTier === 'ai-correct') {
                pointsEarned = qr.pointsMax; // Full marks
            }

            // Write updated result to RTDB
            const updatePath = `game_sessions/${sessionCode}/results/${studentId}/questionResults/${qNum}`;
            await update(ref(database, updatePath), {
                writingResult,
                pointsEarned,
                isCorrect: pointsEarned > 0,
            });

            console.info(`[WritingGrading] Q${qNum}: graded as ${result.gradingTier} (score: ${result.aiScore})`);

            // Phase 3 Task 3.2: Send grade updated notification (debounced in notificationService)
            sendThcsGradeUpdatedNotification(
                studentId,
                'THCS Test', // Title not available here; service debounces by studentId+sessionCode
                qNum,
                pointsEarned,
                sessionCode
            ).catch(err => console.warn(`[WritingGrading] Grade notification failed for Q${qNum}:`, err));
        } catch (err) {
            console.warn(`[WritingGrading] Q${qNum}: grading failed`, err);
            // Leave as 'pending' — teacher will grade manually
        }
    }
}
