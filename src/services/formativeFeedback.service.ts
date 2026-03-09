/**
 * Formative Feedback Service
 * Generates AI-powered formative feedback for THCS test results.
 *
 * Architecture:
 * 1. Deterministic analysis: buckets intents by performance (always runs)
 * 2. AI enhancement: Gemini → Groq fallback → deterministic-only
 * 3. Integration (task ygx4vv): triggers from auto-marking flow
 *
 * Spec: specs/ai-formative-assessment-feedback
 */

import type {
    THCSGradingResult,
    THCSSection,
    THCSQuestionType,
    FormativeFeedback,
    SkillAnalysis,
    SectionResult,
    QuestionResult,
} from '../types/thcs-test.types';
import { INTENT_SKILL_MAP } from '../types/thcs-test.types';
import { extractJSON } from './test-creation/ai-json-repair';

// ═══════════════════════════════════════════════════════════════
// Threshold Constants
// ═══════════════════════════════════════════════════════════════

/** Minimum percentage to be classified as a strength */
const STRENGTH_THRESHOLD = 80;
/** Minimum percentage to be classified as revision (below this = critical) */
const REVISION_THRESHOLD = 50;

// ═══════════════════════════════════════════════════════════════
// AI Response Types
// ═══════════════════════════════════════════════════════════════

/** Expected JSON shape from AI provider */
interface AIFeedbackResponse {
    questionTopics: Record<string, { topic: string; category: string }>;
    questionExplanations: Record<string, string>;
    feedback: {
        summary: string;
        strengths: string;
        revision: string;
        critical: string;
    };
}

/** Result of an AI call attempt */
interface AICallResult {
    success: boolean;
    data?: AIFeedbackResponse;
    model?: string;
    error?: string;
    allKeysExhausted?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Core: Deterministic Analysis
// ═══════════════════════════════════════════════════════════════

/**
 * Merge intentBreakdown from all sections into a single aggregated map.
 * Each section has its own intentBreakdown; this combines them.
 */
function mergeIntentBreakdowns(
    sectionResults: SectionResult[]
): Record<string, { correct: number; total: number }> {
    const merged: Record<string, { correct: number; total: number }> = {};

    for (const section of sectionResults) {
        if (!section.intentBreakdown) continue;

        for (const [intent, counts] of Object.entries(section.intentBreakdown)) {
            if (!merged[intent]) {
                merged[intent] = { correct: 0, total: 0 };
            }
            merged[intent].correct += counts.correct;
            merged[intent].total += counts.total;
        }
    }

    return merged;
}

/**
 * Extract question numbers for a given intent from the test sections,
 * and determine which ones the student got wrong.
 */
function getQuestionNumbersByIntent(
    sections: THCSSection[],
    intent: string,
    questionResults: Record<number, { isCorrect: boolean }>
): { all: number[]; wrong: number[] } {
    const all: number[] = [];
    const wrong: number[] = [];

    for (const section of sections) {
        const questions = Array.isArray((section as any).questions) ? (section as any).questions : [];
        for (const q of questions) {
            // Match on either intent or type field
            const qIntent = q.intent || q.type;
            if (qIntent === intent) {
                all.push(q.questionNumber);
                // Check if student got this wrong
                const result = questionResults[q.questionNumber];
                if (result && !result.isCorrect) {
                    wrong.push(q.questionNumber);
                } else if (!result) {
                    // No result = not answered = wrong
                    wrong.push(q.questionNumber);
                }
            }
        }
    }

    return { all: all.sort((a, b) => a - b), wrong: wrong.sort((a, b) => a - b) };
}

/**
 * Build skill analysis entries from merged intent breakdown.
 * Returns all entries sorted by percentage (descending).
 */
function buildSkillAnalysisList(
    mergedBreakdown: Record<string, { correct: number; total: number }>,
    sections: THCSSection[],
    questionResults: Record<number, { isCorrect: boolean }>
): SkillAnalysis[] {
    const entries: SkillAnalysis[] = [];

    for (const [intent, counts] of Object.entries(mergedBreakdown)) {
        if (counts.total === 0) continue;

        const percentage = Math.round((counts.correct / counts.total) * 100);
        const skillInfo = INTENT_SKILL_MAP[intent] || { name: intent, category: 'Other' };
        const qNums = getQuestionNumbersByIntent(sections, intent, questionResults);

        entries.push({
            intent: intent as THCSQuestionType,
            skillName: skillInfo.name,
            correct: counts.correct,
            total: counts.total,
            percentage,
            questionNumbers: qNums.all,
            wrongQuestionNumbers: qNums.wrong,
        });
    }

    // Sort by percentage descending (strengths first)
    entries.sort((a, b) => b.percentage - a.percentage);

    return entries;
}

/**
 * Bucket skill analysis entries into strengths, revision, and critical tiers.
 */
function bucketByPerformance(entries: SkillAnalysis[]): {
    strengths: SkillAnalysis[];
    revision: SkillAnalysis[];
    critical: SkillAnalysis[];
} {
    const strengths: SkillAnalysis[] = [];
    const revision: SkillAnalysis[] = [];
    const critical: SkillAnalysis[] = [];

    for (const entry of entries) {
        if (entry.percentage >= STRENGTH_THRESHOLD) {
            strengths.push(entry);
        } else if (entry.percentage >= REVISION_THRESHOLD) {
            revision.push(entry);
        } else {
            critical.push(entry);
        }
    }

    return { strengths, revision, critical };
}

// ═══════════════════════════════════════════════════════════════
// Deterministic Text Generation
// ═══════════════════════════════════════════════════════════════

/**
 * Format a list of question numbers as a human-readable string.
 * e.g., [1, 3, 5] → "Q1, Q3, Q5"
 */
function formatQuestionList(nums: number[]): string {
    return nums.map(n => `Q${n}`).join(', ');
}

/**
 * Generate a single line describing a skill entry.
 * e.g., "Grammar (Q3, Q4, Q5) — 2/4 correct"
 */
function formatSkillLine(entry: SkillAnalysis): string {
    const qList = formatQuestionList(entry.questionNumbers);
    return `${entry.skillName} (${qList}) — ${entry.correct}/${entry.total} correct`;
}

function formatAnswerValue(value: unknown): string {
    if (Array.isArray(value)) {
        return value.map(v => String(v ?? '')).join(', ');
    }
    if (value === undefined || value === null || value === '') {
        return 'No answer provided';
    }
    return String(value);
}

function buildFallbackQuestionExplanations(
    questionResults: Record<number, QuestionResult>
): Record<string, string> {
    const explanations: Record<string, string> = {};

    for (const [rawQuestionNumber, questionResult] of Object.entries(questionResults || {})) {
        if (questionResult.isCorrect) continue;

        const questionNumber = Number(rawQuestionNumber);
        const studentAnswer = formatAnswerValue(questionResult.studentAnswer);
        const correctAnswer = questionResult.correctAnswer !== undefined
            ? formatAnswerValue(questionResult.correctAnswer)
            : 'This item requires a more complete model response.';

        explanations[`Q${questionNumber}`] = `For Q${questionNumber}, your answer was ${studentAnswer}. The expected answer is ${correctAnswer}. Recheck the core rule behind this item and practice the same pattern again to lock in the correction.`;
    }

    return explanations;
}

/**
 * Build the deterministic fallback text from the analysis buckets.
 * This text is always generated, even when AI succeeds (as a fallback).
 */
function buildDeterministicText(
    analysis: { strengths: SkillAnalysis[]; revision: SkillAnalysis[]; critical: SkillAnalysis[] },
    totalCorrect: number,
    totalQuestions: number,
    scaledScore: number
): string {
    const lines: string[] = [];

    // Summary line
    lines.push(`You achieved ${totalCorrect}/${totalQuestions} correct answers (${scaledScore.toFixed(1)}/10).`);

    // Strengths
    if (analysis.strengths.length > 0) {
        lines.push('');
        lines.push('✅ Strengths:');
        for (const entry of analysis.strengths) {
            lines.push(`  • ${formatSkillLine(entry)}`);
        }
    }

    // Revision
    if (analysis.revision.length > 0) {
        lines.push('');
        lines.push('⚠️ Needs revision:');
        for (const entry of analysis.revision) {
            const wrongList = entry.wrongQuestionNumbers.length > 0
                ? ` (wrong: ${formatQuestionList(entry.wrongQuestionNumbers)})`
                : '';
            lines.push(`  • ${formatSkillLine(entry)}${wrongList}`);
        }
    }

    // Critical
    if (analysis.critical.length > 0) {
        lines.push('');
        lines.push('🔴 Critical gaps:');
        for (const entry of analysis.critical) {
            const wrongList = entry.wrongQuestionNumbers.length > 0
                ? ` (wrong: ${formatQuestionList(entry.wrongQuestionNumbers)})`
                : '';
            lines.push(`  • ${formatSkillLine(entry)}${wrongList}`);
        }
    }

    // If no data at all
    if (analysis.strengths.length === 0 && analysis.revision.length === 0 && analysis.critical.length === 0) {
        lines.push('');
        lines.push('No detailed skill breakdown available for this test.');
    }

    return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// AI Prompt Construction
// ═══════════════════════════════════════════════════════════════

/**
 * Build the feedback prompt from test data.
 * Returns { systemPrompt, userPrompt } for both Gemini and Groq.
 */
function buildFeedbackPrompt(
    gradingResult: THCSGradingResult,
    sections: THCSSection[],
    testMetadata: { title: string; gradeLevel: number },
): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are an expert English teacher providing formative feedback to a Vietnamese student (Grade ${testMetadata.gradeLevel}).
Your feedback should be specific, encouraging, and actionable. Reference question numbers when discussing topics.
Return ONLY valid JSON matching the schema below. No markdown, no commentary.`;

    // Build question list
    const questionLines: string[] = [];
    for (const section of sections) {
        for (const q of section.questions) {
            const qResult = gradingResult.questionResults[q.questionNumber] as QuestionResult | undefined;
            const isCorrect = qResult?.isCorrect ?? false;
            const status = isCorrect ? 'CORRECT' : 'WRONG';
            const intent = q.intent || q.type;

            let line = `Q${q.questionNumber} [${intent}] ${status}`;
            line += `\n  Text: ${q.questionText}`;

            // Include options for MCQ
            if (q.options && q.options.length > 0) {
                const labels = ['A', 'B', 'C', 'D'];
                const optStr = q.options.map((opt, i) => `${labels[i]}. ${opt}`).join(' | ');
                line += `\n  Options: ${optStr}`;
            }

            // Student answer + correct answer
            const studentAns = qResult?.studentAnswer ?? '(no answer)';
            const correctAns = q.correctAnswer || (qResult?.correctAnswer ?? '');
            line += `\n  Student: ${Array.isArray(studentAns) ? studentAns.join(', ') : studentAns}`;
            line += `\n  Correct: ${Array.isArray(correctAns) ? correctAns.join(', ') : correctAns}`;

            // Teacher explanation (so AI doesn't duplicate)
            if (q.explanation?.text) {
                line += `\n  Teacher explanation: ${q.explanation.text}`;
            }

            questionLines.push(line);
        }
    }

    const percentage = gradingResult.maxPoints > 0
        ? ((gradingResult.totalPoints / gradingResult.maxPoints) * 100).toFixed(1)
        : '0';

    const userPrompt = `Test: "${testMetadata.title}" (Grade ${testMetadata.gradeLevel})
Score: ${gradingResult.totalPoints}/${gradingResult.maxPoints} (${percentage}%, ${gradingResult.scaledScore.toFixed(1)}/10)

Questions:
${questionLines.join('\n\n')}

Return JSON with this EXACT schema:
{
  "questionTopics": {
    "<questionNumber>": { "topic": "<specific grammar/vocabulary topic>", "category": "<Phonetics|Grammar|Vocabulary|Reading|Writing|Communication>" }
  },
  "questionExplanations": {
    "<questionNumber>": "<1-2 sentence explanation of WHY the student's answer is wrong and what the correct answer means>"
  },
  "feedback": {
    "summary": "<1-2 sentences summarizing overall performance>",
    "strengths": "<1-2 sentences about what the student did well, referencing question numbers>",
    "revision": "<1-2 sentences about areas needing practice, with specific topics>",
    "critical": "<1-2 sentences about critical gaps, if any, or empty string if none>"
  }
}

RULES:
1. questionTopics: provide for ALL questions (correct and wrong)
2. questionExplanations: provide ONLY for WRONG answers
3. Be specific about grammar topics (e.g., "past perfect tense", "subject-verb agreement", "comparative adjectives")
4. Keep each explanation to 1-2 sentences maximum
5. Reference question numbers in feedback sections (e.g., "Q3, Q7")
6. If teacher explanation exists, complement it — don't repeat it
7. feedback.critical should be empty string "" if student scored above 70%
8. Use encouraging, student-friendly language`;

    return { systemPrompt, userPrompt };
}

// ═══════════════════════════════════════════════════════════════
// AI Response Validation
// ═══════════════════════════════════════════════════════════════

/**
 * Validate and sanitize the AI response against expected schema.
 * Returns null if the response is invalid.
 */
function validateAIFeedbackResponse(raw: unknown): AIFeedbackResponse | null {
    if (!raw || typeof raw !== 'object') return null;

    const obj = raw as Record<string, unknown>;

    // Validate questionTopics
    if (!obj.questionTopics || typeof obj.questionTopics !== 'object') return null;
    const topics: Record<string, { topic: string; category: string }> = {};
    for (const [key, val] of Object.entries(obj.questionTopics as Record<string, unknown>)) {
        if (val && typeof val === 'object') {
            const v = val as Record<string, unknown>;
            if (typeof v.topic === 'string' && typeof v.category === 'string') {
                topics[key] = { topic: v.topic, category: v.category };
            }
        }
    }

    // Validate questionExplanations
    const explanations: Record<string, string> = {};
    if (obj.questionExplanations && typeof obj.questionExplanations === 'object') {
        for (const [key, val] of Object.entries(obj.questionExplanations as Record<string, unknown>)) {
            if (typeof val === 'string' && val.trim().length > 0) {
                explanations[key] = val.trim();
            }
        }
    }

    // Validate feedback narrative
    if (!obj.feedback || typeof obj.feedback !== 'object') return null;
    const fb = obj.feedback as Record<string, unknown>;
    const feedback = {
        summary: typeof fb.summary === 'string' ? fb.summary.trim() : '',
        strengths: typeof fb.strengths === 'string' ? fb.strengths.trim() : '',
        revision: typeof fb.revision === 'string' ? fb.revision.trim() : '',
        critical: typeof fb.critical === 'string' ? fb.critical.trim() : '',
    };

    // Must have at least a summary
    if (!feedback.summary) return null;

    return {
        questionTopics: topics,
        questionExplanations: explanations,
        feedback,
    };
}

// ═══════════════════════════════════════════════════════════════
// AI Provider Calls
// ═══════════════════════════════════════════════════════════════

/**
 * Call Gemini for feedback generation.
 * Mirrors GeminiProvider.gradeWritingAnswer() pattern.
 */
async function callGeminiForFeedback(
    systemPrompt: string,
    userPrompt: string,
): Promise<AICallResult> {
    try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const { loadAllGeminiApiKeys } = await import('../config/env.config');
        const { benchKey, filterBenchedKeys } = await import('./key-cooldown.service');

        const allKeys = await loadAllGeminiApiKeys();
        if (allKeys.length === 0) {
            return { success: false, error: 'No Gemini API keys configured', allKeysExhausted: true };
        }

        // Filter out benched keys
        const apiKeys = filterBenchedKeys(allKeys, 'gemini');
        if (apiKeys.length === 0) {
            return { success: false, error: `All ${allKeys.length} Gemini keys are benched (cooling down)`, allKeysExhausted: true };
        }

        // Try each key until one works
        for (let i = 0; i < apiKeys.length; i++) {
            try {
                const client = new GoogleGenerativeAI(apiKeys[i]!);
                const model = client.getGenerativeModel({
                    model: 'gemini-2.5-flash',
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 8192,
                        responseMimeType: 'application/json',
                    },
                });

                const result = await model.generateContent(
                    `${systemPrompt}\n\n${userPrompt}`
                );
                const text = result.response.text();

                if (!text) {
                    console.warn(`⚠️ [FormativeFeedback/Gemini] Empty response from key ${i + 1}`);
                    continue;
                }

                const parsed = extractJSON(text);
                const validated = validateAIFeedbackResponse(parsed);

                if (!validated) {
                    console.warn(`⚠️ [FormativeFeedback/Gemini] Validation failed for key ${i + 1}`);
                    continue;
                }

                return {
                    success: true,
                    data: validated,
                    model: 'gemini-2.5-flash',
                };
            } catch (keyError) {
                const msg = keyError instanceof Error ? keyError.message : 'Unknown error';
                const isRateLimit = msg.includes('429') || msg.includes('rate limit') || msg.includes('quota');

                if (isRateLimit) {
                    benchKey(apiKeys[i]!, 'gemini', msg);
                    continue;
                }

                // Non-rate-limit error — still try next key
                console.warn(`⚠️ [FormativeFeedback/Gemini] Key ${i + 1} failed: ${msg}`);
                continue;
            }
        }

        // All keys exhausted
        return { success: false, error: 'All Gemini keys exhausted', allKeysExhausted: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: `Gemini feedback failed: ${msg}` };
    }
}

/**
 * Call Groq for feedback generation (fallback).
 * Mirrors GroqProvider.gradeWritingAnswer() pattern.
 */
async function callGroqForFeedback(
    systemPrompt: string,
    userPrompt: string,
): Promise<AICallResult> {
    try {
        const { default: Groq } = await import('groq-sdk');
        const { getEnv } = await import('../config/env.config');
        const { getDecryptedKeys } = await import('./api-keys.service');
        const { benchKey, filterBenchedKeys } = await import('./key-cooldown.service');

        // Gather all Groq keys — Firestore (admin-managed) keys first
        const allKeys: string[] = [];
        try {
            const firestoreKeys = await getDecryptedKeys('groq');
            for (const key of firestoreKeys) {
                if (key && !allKeys.includes(key)) allKeys.push(key);
            }
        } catch { /* ignore Firestore key errors */ }
        // Then fallback to .env keys
        const env = getEnv();
        const legacyKey = env.VITE_GROQ_API_KEY;
        if (legacyKey && legacyKey.trim().length > 0 && !legacyKey.includes('your_') && !allKeys.includes(legacyKey)) {
            allKeys.push(legacyKey);
        }
        for (let i = 1; i <= 5; i++) {
            const key = (env as Record<string, string | undefined>)[`VITE_GROQ_API_KEY_${i}`];
            if (key && key.trim().length > 0 && !key.includes('your_') && !allKeys.includes(key)) {
                allKeys.push(key);
            }
        }

        if (allKeys.length === 0) {
            return { success: false, error: 'No Groq API keys configured' };
        }

        // Filter out benched keys
        const keys = filterBenchedKeys(allKeys, 'groq');
        if (keys.length === 0) {
            return { success: false, error: `All ${allKeys.length} Groq keys are benched (cooling down)` };
        }

        // Try each key
        for (let i = 0; i < keys.length; i++) {
            try {
                const client = new Groq({
                    apiKey: keys[i],
                    dangerouslyAllowBrowser: true,
                    maxRetries: 0, // Disable SDK internal retries — we handle key rotation ourselves
                });

                const completion = await client.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: 0.2,
                    max_tokens: 8192,
                });

                const text = completion.choices[0]?.message?.content;
                if (!text) {
                    console.warn(`⚠️ [FormativeFeedback/Groq] Empty response from key ${i + 1}`);
                    continue;
                }

                const parsed = extractJSON(text);
                const validated = validateAIFeedbackResponse(parsed);

                if (!validated) {
                    console.warn(`⚠️ [FormativeFeedback/Groq] Validation failed for key ${i + 1}`);
                    continue;
                }

                return {
                    success: true,
                    data: validated,
                    model: 'groq-llama-3.3-70b',
                };
            } catch (keyError) {
                const msg = keyError instanceof Error ? keyError.message : 'Unknown error';
                if (msg.includes('429') || msg.includes('rate limit')) {
                    benchKey(keys[i]!, 'groq', msg);
                    continue;
                }
                console.warn(`⚠️ [FormativeFeedback/Groq] Key ${i + 1} failed: ${msg}`);
                continue;
            }
        }

        return { success: false, error: 'All Groq keys failed' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: `Groq feedback failed: ${msg}` };
    }
}

// ═══════════════════════════════════════════════════════════════
// AI Feedback Pipeline (Gemini → Groq → deterministic)
// ═══════════════════════════════════════════════════════════════

/**
 * Attempt AI feedback generation with Gemini → Groq fallback chain.
 * Returns null if both providers fail (deterministic-only fallback).
 */
async function generateAIFeedback(
    gradingResult: THCSGradingResult,
    sections: THCSSection[],
    testMetadata: { title: string; gradeLevel: number },
): Promise<{ data: AIFeedbackResponse; model: string } | null> {
    const { systemPrompt, userPrompt } = buildFeedbackPrompt(
        gradingResult, sections, testMetadata
    );

    // Step 1: Try Gemini first
    console.log('🤖 [FormativeFeedback] Attempting Gemini...');
    const geminiResult = await callGeminiForFeedback(systemPrompt, userPrompt);

    if (geminiResult.success && geminiResult.data) {
        console.log('✅ [FormativeFeedback] Gemini succeeded');
        return { data: geminiResult.data, model: geminiResult.model! };
    }

    console.warn(`⚠️ [FormativeFeedback] Gemini failed: ${geminiResult.error}`);

    // Step 2: Fall back to Groq
    console.log('🔄 [FormativeFeedback] Falling back to Groq...');
    const groqResult = await callGroqForFeedback(systemPrompt, userPrompt);

    if (groqResult.success && groqResult.data) {
        console.log('✅ [FormativeFeedback] Groq fallback succeeded');
        return { data: groqResult.data, model: groqResult.model! };
    }

    console.warn(`⚠️ [FormativeFeedback] Groq also failed: ${groqResult.error}`);

    // Step 3: Both failed → return null (deterministic-only)
    console.warn('⚠️ [FormativeFeedback] Both AI providers failed. Using deterministic-only feedback.');
    return null;
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Generate deterministic-only formative feedback.
 * This is the baseline feedback that always works without AI.
 *
 * @param gradingResult - The THCS grading result from auto-marking
 * @param sections - The original test sections (for question number lookup)
 * @returns Complete FormativeFeedback with deterministic analysis
 */
export function generateDeterministicFeedback(
    gradingResult: THCSGradingResult,
    sections: THCSSection[],
): FormativeFeedback {
    // Handle edge case: no section results or no data
    if (!gradingResult.sectionResults || gradingResult.sectionResults.length === 0) {
        const totalCorrect = Object.values(gradingResult.questionResults || {})
            .filter(qr => qr.isCorrect).length;
        const totalQuestions = Object.keys(gradingResult.questionResults || {}).length;

        return {
            analysis: { strengths: [], revision: [], critical: [] },
            deterministicFeedback: `You achieved ${totalCorrect}/${totalQuestions} correct answers (${gradingResult.scaledScore.toFixed(1)}/10).\n\nNo detailed skill breakdown available for this test.`,
            generatedAt: Date.now(),
            totalCorrect,
            totalQuestions,
            scaledScore: gradingResult.scaledScore,
        };
    }

    // Step 1: Merge all section intent breakdowns
    const mergedBreakdown = mergeIntentBreakdowns(gradingResult.sectionResults);

    const hasFullQuestionData = sections.some(section => Array.isArray((section as any).questions) && (section as any).questions.length > 0);

    if (!hasFullQuestionData) {
        const totalCorrect = Object.values(gradingResult.questionResults || {})
            .filter(qr => qr.isCorrect).length;
        const totalQuestions = Object.keys(gradingResult.questionResults || {}).length;
        const analysis = bucketByPerformance(
            Object.entries(mergedBreakdown).map(([intent, counts]) => {
                const percentage = counts.total > 0 ? Math.round((counts.correct / counts.total) * 100) : 0;
                const skillInfo = INTENT_SKILL_MAP[intent] || { name: intent, category: 'Other' };
                return {
                    intent: intent as THCSQuestionType,
                    skillName: skillInfo.name,
                    correct: counts.correct,
                    total: counts.total,
                    percentage,
                    questionNumbers: [],
                    wrongQuestionNumbers: [],
                };
            }).sort((a, b) => b.percentage - a.percentage)
        );

        return {
            analysis,
            deterministicFeedback: buildDeterministicText(
                analysis,
                totalCorrect,
                totalQuestions,
                gradingResult.scaledScore
            ),
            generatedAt: Date.now(),
            totalCorrect,
            totalQuestions,
            scaledScore: gradingResult.scaledScore,
        };
    }

    // Step 2: Build skill analysis entries with question numbers
    const allEntries = buildSkillAnalysisList(
        mergedBreakdown,
        sections,
        gradingResult.questionResults
    );

    // Step 3: Bucket into performance tiers
    const analysis = bucketByPerformance(allEntries);

    // Step 4: Calculate summary stats
    const totalCorrect = Object.values(gradingResult.questionResults)
        .filter(qr => qr.isCorrect).length;
    const totalQuestions = Object.keys(gradingResult.questionResults).length;

    // Step 5: Generate deterministic text
    const deterministicText = buildDeterministicText(
        analysis,
        totalCorrect,
        totalQuestions,
        gradingResult.scaledScore
    );

    return {
        analysis,
        deterministicFeedback: deterministicText,
        generatedAt: Date.now(),
        totalCorrect,
        totalQuestions,
        scaledScore: gradingResult.scaledScore,
    };
}

/**
 * Generate full formative feedback with AI enhancement.
 * Pipeline: deterministic → AI (Gemini → Groq) → merge → save to RTDB.
 *
 * This is fire-and-forget: errors are caught and logged, never thrown.
 * The student always gets their test result regardless of feedback status.
 *
 * @param gradingResult - The THCS grading result from auto-marking
 * @param sections - The original test sections
 * @param testMetadata - Test title and grade level for AI prompt context
 * @param resultId - The result ID to write feedback back to RTDB
 */
export async function generateFormativeFeedback(
    gradingResult: THCSGradingResult,
    sections: THCSSection[],
    testMetadata: { title: string; gradeLevel: number },
    resultId: string,
): Promise<void> {
    try {
        console.log(`🧠 [FormativeFeedback] Generating feedback for result ${resultId}...`);

        // Step 1: Generate deterministic baseline (sync, always works)
        const feedback = generateDeterministicFeedback(gradingResult, sections);

        // Step 2: Attempt AI enhancement (async, may fail gracefully)
        const aiResult = await generateAIFeedback(gradingResult, sections, testMetadata);

        if (aiResult) {
            // Merge AI data into deterministic baseline
            feedback.questionTopics = aiResult.data.questionTopics;
            feedback.questionExplanations = aiResult.data.questionExplanations;
            feedback.aiFeedback = aiResult.data.feedback;
            feedback.aiModel = aiResult.model;
            console.log(`🤖 [FormativeFeedback] AI enrichment applied (${aiResult.model})`);
        } else {
            console.log('📊 [FormativeFeedback] Using deterministic-only feedback');
        }

        const fallbackExplanations = buildFallbackQuestionExplanations(gradingResult.questionResults || {});
        if (!feedback.questionExplanations || Object.keys(feedback.questionExplanations).length === 0) {
            feedback.questionExplanations = fallbackExplanations;
        } else {
            for (const [key, value] of Object.entries(fallbackExplanations)) {
                if (!feedback.questionExplanations[key]) {
                    feedback.questionExplanations[key] = value;
                }
            }
        }

        // Step 3: Save feedback to RTDB
        const { ref, update } = await import('firebase/database');
        const { database } = await import('./firebase');

        await update(ref(database, `test_results/${resultId}`), {
            formativeFeedback: feedback,
        });

        const mode = aiResult ? `AI (${aiResult.model})` : 'deterministic-only';
        console.log(`✅ [FormativeFeedback] Saved feedback for result ${resultId} (${mode})`);
    } catch (error) {
        // Non-blocking: log and swallow — test result is already saved
        console.error(`❌ [FormativeFeedback] Failed for result ${resultId}:`, error);
    }
}
