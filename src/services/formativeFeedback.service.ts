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
    StudyRecommendation,
} from '../types/thcs-test.types';
import { INTENT_SKILL_MAP } from '../types/thcs-test.types';
import {
    findApprovedStudyBook,
    formatApprovedStudyBooksForPrompt,
} from '../config/studyResources.config';
import { executeGeminiWithKeyRotation } from './ai/gemini-key-rotation.service';
import { extractJSON } from './test-creation/ai-json-repair';

// ═══════════════════════════════════════════════════════════════
// Threshold Constants
// ═══════════════════════════════════════════════════════════════

/** Minimum percentage to be classified as a strength */
const STRENGTH_THRESHOLD = 80;
/** Minimum percentage to be classified as revision (below this = critical) */
const REVISION_THRESHOLD = 50;
const NO_ANSWER_LABEL = 'No answer provided';
const BLANK_ANSWER_MARKERS = new Set([
    '',
    '-',
    '—',
    '(blank)',
    '(no answer)',
    '(no answer submitted)',
    'blank',
    'no answer provided',
    'no answer submitted',
    'unanswered',
]);

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
    studyRecommendations: StudyRecommendation[];
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

function isBlankAnswerString(value: string): boolean {
    return BLANK_ANSWER_MARKERS.has(value.trim().toLowerCase());
}

function isBlankAnswerValue(value: unknown): boolean {
    if (value === undefined || value === null) {
        return true;
    }

    if (typeof value === 'string') {
        return isBlankAnswerString(value);
    }

    if (Array.isArray(value)) {
        return value.length === 0 || value.every((entry) => isBlankAnswerValue(entry));
    }

    if (typeof value === 'object') {
        const entries = Object.values(value as Record<string, unknown>);
        return entries.length === 0 || entries.every((entry) => isBlankAnswerValue(entry));
    }

    return false;
}

function formatAnswerValue(value: unknown): string {
    if (isBlankAnswerValue(value)) {
        return NO_ANSWER_LABEL;
    }

    if (Array.isArray(value)) {
        const parts = value
            .map((entry) => String(entry ?? '').trim())
            .filter((entry) => entry.length > 0 && !isBlankAnswerString(entry));
        return parts.length > 0 ? parts.join(', ') : NO_ANSWER_LABEL;
    }
    if (value && typeof value === 'object') {
        const parts = Object.entries(value as Record<string, unknown>)
            .map(([key, entryValue]) => `${key}: ${String(entryValue ?? '').trim()}`)
            .filter((entry) => !entry.endsWith(':') && !entry.endsWith(`: ${NO_ANSWER_LABEL}`));
        return parts.length > 0 ? parts.join('; ') : NO_ANSWER_LABEL;
    }
    return String(value);
}

export interface FallbackQuestionContext {
    text?: string;
    options?: string[];
    intent?: string;
    teacherExplanation?: string;
    sectionName?: string;
    passageTitle?: string;
    passageContent?: string;
    originalSentence?: string;
    sentenceTemplate?: string;
    underlinedParts?: string;
}

const ANALYSIS_STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'but', 'by', 'for', 'from', 'had', 'has', 'have',
    'he', 'her', 'his', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'she', 'that', 'the', 'their',
    'there', 'they', 'this', 'to', 'was', 'were', 'which', 'with', 'would', 'you', 'your',
]);

function normalizeExplanationText(text: string | undefined): string {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function shortenText(text: string | undefined, maxLength = 160): string {
    const normalized = normalizeExplanationText(text);
    if (!normalized) {
        return '';
    }

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function humanizeIntent(intent: string | undefined): string {
    const raw = String(intent || '').trim();
    if (!raw) {
        return 'language analysis';
    }

    const skillInfo = INTENT_SKILL_MAP[raw];
    if (skillInfo?.name) {
        return skillInfo.name;
    }

    return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeIntentKey(intent: string | undefined): string {
    return String(intent || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
}

function buildQuestionContextMap(sections?: THCSSection[]): Record<number, FallbackQuestionContext> {
    const questionDataMap: Record<number, FallbackQuestionContext> = {};

    if (!sections) {
        return questionDataMap;
    }

    for (const section of sections) {
        const questions = Array.isArray((section as any).questions) ? (section as any).questions : [];
        const sectionName = (section as any).name || (section as any).sectionName;
        const passageTitle = (section as any).passage?.title || undefined;
        const passageContent = (section as any).passage?.content || undefined;

        for (const question of questions) {
            const explanationText = typeof question.explanation?.text === 'string'
                ? question.explanation.text
                : '';

            questionDataMap[question.questionNumber] = {
                text: question.questionText,
                options: Array.isArray(question.options) ? question.options : undefined,
                intent: question.intent || question.type,
                teacherExplanation: explanationText,
                sectionName,
                passageTitle,
                passageContent,
                originalSentence: (question as any).originalSentence,
                sentenceTemplate: (question as any).sentenceTemplate,
                underlinedParts: (question as any).underlinedParts,
            };
        }
    }

    return questionDataMap;
}

function formatLabeledAnswer(answer: unknown, options?: string[]): string {
    const baseAnswer = formatAnswerValue(answer);
    if (!options || options.length === 0 || baseAnswer === NO_ANSWER_LABEL) {
        return `"${baseAnswer}"`;
    }

    const normalized = baseAnswer.trim().toUpperCase();
    if (/^[A-D]$/.test(normalized)) {
        const optionIndex = normalized.charCodeAt(0) - 65;
        const optionText = options[optionIndex];
        if (optionText) {
            return `"${normalized}" (${optionText})`;
        }
    }

    return `"${baseAnswer}"`;
}

function buildPromptReference(context: FallbackQuestionContext): string {
    const candidate = context.originalSentence
        || context.sentenceTemplate
        || context.underlinedParts
        || context.text
        || context.passageTitle
        || context.sectionName
        || '';

    const promptReference = shortenText(candidate, 180);
    if (!promptReference || /^Question \d+$/i.test(promptReference)) {
        return 'the original prompt';
    }

    return `"${promptReference}"`;
}

function splitIntoAnalysisSentences(text: string | undefined): string[] {
    return normalizeExplanationText(text)
        .split(/(?<=[.!?])\s+|\n+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function tokenizeForAnalysis(text: string | undefined): string[] {
    const tokens = normalizeExplanationText(text)
        .toLowerCase()
        .match(/[a-z][a-z'-]{2,}/g);

    if (!tokens) {
        return [];
    }

    return tokens.filter((token) => !ANALYSIS_STOPWORDS.has(token));
}

function getComparableAnswerText(answer: unknown, options?: string[]): string {
    const rawAnswer = formatAnswerValue(answer).trim();
    if (options && /^[A-D]$/i.test(rawAnswer)) {
        const optionIndex = rawAnswer.toUpperCase().charCodeAt(0) - 65;
        return String(options[optionIndex] || rawAnswer).trim();
    }

    return rawAnswer;
}

function buildPromptAnswerStateLine(answer: unknown): string {
    return isBlankAnswerValue(answer) ? 'UNANSWERED' : 'ANSWERED';
}

function buildPromptAnswerLabel(answer: unknown, options?: string[]): string {
    return formatLabeledAnswer(answer, options);
}

type QuestionResultCollection = Record<number, QuestionResult> | QuestionResult[] | null | undefined;

function getQuestionResultEntries(questionResults: QuestionResultCollection): Array<{ key: string; questionResult: QuestionResult }> {
    if (!questionResults) {
        return [];
    }

    if (Array.isArray(questionResults)) {
        return questionResults
            .filter((questionResult): questionResult is QuestionResult => Boolean(questionResult))
            .map((questionResult) => ({
                key: normalizeQuestionMappingKey(String(questionResult.questionNumber)),
                questionResult,
            }))
            .filter((entry) => entry.key.length > 0);
    }

    return Object.entries(questionResults)
        .map(([rawKey, questionResult]) => ({
            key: normalizeQuestionMappingKey(String(questionResult?.questionNumber ?? rawKey)),
            questionResult,
        }))
        .filter((entry): entry is { key: string; questionResult: QuestionResult } => Boolean(entry.key && entry.questionResult));
}

function findBestContextExcerpt(
    sources: Array<string | undefined>,
    targets: Array<string | undefined>,
    fallback: string,
): string {
    const targetTokens = Array.from(new Set(targets.flatMap((target) => tokenizeForAnalysis(target))));
    if (targetTokens.length === 0) {
        return fallback;
    }

    let bestSentence = '';
    let bestScore = -1;

    for (const source of sources) {
        for (const sentence of splitIntoAnalysisSentences(source)) {
            const sentenceTokens = new Set(tokenizeForAnalysis(sentence));
            if (sentenceTokens.size === 0) {
                continue;
            }

            const overlap = targetTokens.filter((token) => sentenceTokens.has(token)).length;
            if (overlap > bestScore) {
                bestScore = overlap;
                bestSentence = sentence;
            }
        }
    }

    return bestScore > 0 ? shortenText(bestSentence, 180) : fallback;
}

function parseSentenceArrangementItems(text: string | undefined): Array<{ key: string; text: string }> {
    const promptText = String(text || '');
    if (!promptText) {
        return [];
    }

    return promptText
        .split(/(?=\b[a-e]\.\s)/i)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => {
            const match = chunk.match(/^([a-e])\.\s([\s\S]+)$/i);
            if (!match) {
                return null;
            }

            return {
                key: match[1].toLowerCase(),
                text: normalizeExplanationText(match[2]),
            };
        })
        .filter((item): item is { key: string; text: string } => Boolean(item));
}

function parseArrangementSequence(answer: unknown, options?: string[]): string[] {
    const rawAnswer = formatAnswerValue(answer).trim();
    const answerText = /^[A-D]$/i.test(rawAnswer)
        ? String(options?.[rawAnswer.toUpperCase().charCodeAt(0) - 65] || rawAnswer)
        : rawAnswer;
    const normalized = answerText.toLowerCase().replace(/\s+/g, '');

    if (/^[a-e](?:[-,>][a-e]){2,7}$/.test(normalized)) {
        return normalized.split(/[-,>]/).filter(Boolean);
    }

    const compact = normalized.replace(/[^a-e]/g, '');
    return compact.length >= 3 && compact.length <= 8 ? compact.split('') : [];
}

function looksLikeDependentSentence(text: string): boolean {
    return /^(he|she|they|it|this|that|these|those|their|his|her|however|but|so|then|therefore|instead|meanwhile|afterwards|finally|also)\b/i
        .test(text.trim());
}

function describeSentenceLink(previousKey: string, previousText: string, nextKey: string, nextText: string): string {
    const previous = normalizeExplanationText(previousText);
    const next = normalizeExplanationText(nextText);
    const nextLower = next.toLowerCase();

    if (previous.endsWith('?')) {
        return `Sentence ${nextKey} follows sentence ${previousKey} because it reads like the response to the question or problem raised just before it.`;
    }

    const connectorMatch = nextLower.match(/^(however|but|so|then|therefore|instead|meanwhile|finally|afterwards|for example|as a result|because)\b/);
    if (connectorMatch) {
        return `Sentence ${nextKey} must come after sentence ${previousKey} because the connector "${connectorMatch[1]}" signals a follow-up, contrast, result, or example rather than a new opening.`;
    }

    if (looksLikeDependentSentence(next)) {
        return `Sentence ${nextKey} belongs after sentence ${previousKey} because it begins with a pronoun or follow-up cue that needs an earlier sentence to establish the reference.`;
    }

    const sharedTokens = tokenizeForAnalysis(previous)
        .filter((token, index, arr) => arr.indexOf(token) === index)
        .filter((token) => tokenizeForAnalysis(next).includes(token))
        .slice(0, 2);

    if (sharedTokens.length > 0) {
        return `Sentence ${nextKey} fits after sentence ${previousKey} because both sentences develop the idea of ${sharedTokens.join(' and ')}, so the second one continues the first naturally.`;
    }

    return `Sentence ${nextKey} works after sentence ${previousKey} because it develops the same situation instead of starting a completely new one.`;
}

function buildSentenceArrangementExplanation(
    questionResult: QuestionResult,
    context: FallbackQuestionContext,
    studentAnswerLabel: string,
    correctAnswerLabel: string,
): string | null {
    const items = parseSentenceArrangementItems(context.text);
    const correctSequence = parseArrangementSequence(questionResult.correctAnswer, context.options);

    if (items.length < 3 || correctSequence.length < 3) {
        return null;
    }

    const itemMap = Object.fromEntries(items.map((item) => [item.key, item.text]));
    const chosenSequence = parseArrangementSequence(questionResult.studentAnswer, context.options);
    const openingKey = correctSequence[0];
    const openingText = itemMap[openingKey] || '';
    const remainingTexts = correctSequence.slice(1).map((key) => itemMap[key]).filter(Boolean);
    const openingReason = looksLikeDependentSentence(openingText)
        ? `it still makes the most sense once you compare the other choices, because the other sentences depend even more heavily on earlier context.`
        : `it introduces the main situation before the later sentences react to it or add consequences.`;

    const parts: string[] = [
        `This is an ordering question, so the key is to find the sentence that can open the paragraph without depending on anything earlier. Sentence ${openingKey} has to come first because ${openingReason}`,
    ];

    if (questionResult.studentAnswer && chosenSequence.length > 0) {
        const mismatchIndex = chosenSequence.findIndex((key, index) => key !== correctSequence[index]);
        if (mismatchIndex === 0) {
            parts.push(`Your chosen order starts with sentence ${chosenSequence[0]}, but that sentence reads like a reaction or continuation instead of a clean introduction.`);
        } else if (mismatchIndex > 0) {
            const previousCorrectKey = correctSequence[mismatchIndex - 1];
            const chosenKey = chosenSequence[mismatchIndex];
            parts.push(`Your order first breaks down after sentence ${previousCorrectKey}: sentence ${chosenKey} does not follow it as naturally as sentence ${correctSequence[mismatchIndex]}.`);
        }
    } else {
        parts.push(`A common trap here is that several orders look possible at first, but only one sequence lets every sentence connect smoothly to the one before it.`);
    }

    const linkReasons = correctSequence
        .slice(1, 4)
        .map((key, index) => describeSentenceLink(correctSequence[index], itemMap[correctSequence[index]] || '', key, itemMap[key] || ''));
    parts.push(...linkReasons);

    const closingKey = correctSequence[correctSequence.length - 1];
    if (closingKey && itemMap[closingKey]) {
        parts.push(`That is why the correct arrangement is ${correctAnswerLabel}: it creates a paragraph that moves logically from "${shortenText(openingText, 80)}" to "${shortenText(itemMap[closingKey], 80)}".`);
    }

    parts.push(`When you solve these questions, lock the opening sentence first, then use pronouns, connectors, and repeated ideas to test each next link instead of guessing the whole order at once.`);

    return parts.join(' ');
}

function detectGrammarSignal(text: string | undefined): { marker: string; rule: string; why: string } | null {
    const normalized = String(text || '').toLowerCase();
    if (!normalized) {
        return null;
    }

    const detectors = [
        {
            pattern: /\b(since|for|already|yet|just|ever|never)\b/,
            rule: 'a tense that connects past action to the present, usually the present perfect',
            why: 'that time marker points to an unfinished time frame rather than a completed past event',
        },
        {
            pattern: /\b(yesterday|last|ago|in \d{4})\b/,
            rule: 'the past simple',
            why: 'the time expression fixes the action at a completed moment in the past',
        },
        {
            pattern: /\b(tomorrow|next week|next month|soon)\b/,
            rule: 'a future form',
            why: 'the time expression points forward rather than backward',
        },
        {
            pattern: /\b(if)\b[\s\S]{0,40}\b(would|could|might)\b/,
            rule: 'a conditional pattern',
            why: 'the sentence is linking a condition with its imagined result',
        },
        {
            pattern: /\b(than|as .* as)\b/,
            rule: 'a comparative structure',
            why: 'the sentence is explicitly comparing two things',
        },
        {
            pattern: /\b(look forward to|interested in|good at|used to|prefer|enjoy|avoid|suggest)\b/,
            rule: 'the verb or structure required by that fixed expression',
            why: 'the key phrase controls the form that can follow it',
        },
    ];

    for (const detector of detectors) {
        const match = normalized.match(detector.pattern);
        if (match) {
            return {
                marker: match[1],
                rule: detector.rule,
                why: detector.why,
            };
        }
    }

    return null;
}

function buildReadingOrContextExplanation(
    questionResult: QuestionResult,
    context: FallbackQuestionContext,
    studentAnswerLabel: string,
    correctAnswerLabel: string,
): string {
    const correctOptionText = getComparableAnswerText(questionResult.correctAnswer, context.options);
    const chosenOptionText = getComparableAnswerText(questionResult.studentAnswer, context.options);
    const clueExcerpt = findBestContextExcerpt(
        [context.passageContent, context.text],
        [correctOptionText, chosenOptionText, context.text],
        buildPromptReference(context),
    );

    const parts = [
        `The strongest clue for this question is ${clueExcerpt.startsWith('"') ? clueExcerpt : `"${clueExcerpt}"`}.`,
    ];

    if (chosenOptionText && chosenOptionText !== NO_ANSWER_LABEL) {
        parts.push(`You chose ${studentAnswerLabel}, which can look plausible if you focus on one repeated word or one surface detail, but it does not match the full meaning of that clue.`);
    } else {
        parts.push(`Because you left it blank, the fastest way in is to anchor your answer to that exact clue instead of trying to remember the whole passage at once.`);
    }

    if (context.teacherExplanation) {
        parts.push(`The correct answer is ${correctAnswerLabel} because ${normalizeExplanationText(context.teacherExplanation).replace(/\.$/, '')}.`);
    } else {
        parts.push(`The correct answer is ${correctAnswerLabel} because it is the option that preserves the full meaning of the relevant line, not just part of the topic.`);
    }

    parts.push(`A good method is to find the key line first, paraphrase it in simple words, and then choose the option that says the same thing without adding or changing information.`);
    return parts.join(' ');
}

function buildGrammarOrVocabularyExplanation(
    questionResult: QuestionResult,
    context: FallbackQuestionContext,
    studentAnswerLabel: string,
    correctAnswerLabel: string,
): string {
    const clueExcerpt = findBestContextExcerpt(
        [context.text, context.sentenceTemplate, context.originalSentence, context.underlinedParts],
        [getComparableAnswerText(questionResult.correctAnswer, context.options), getComparableAnswerText(questionResult.studentAnswer, context.options)],
        buildPromptReference(context),
    );
    const signal = detectGrammarSignal(context.originalSentence || context.sentenceTemplate || context.underlinedParts || context.text);
    const parts: string[] = [];

    if (signal) {
        parts.push(`The clue "${signal.marker}" in ${clueExcerpt.startsWith('"') ? clueExcerpt : `"${clueExcerpt}"`} controls the answer here. It tells you that the sentence needs ${signal.rule} because ${signal.why}.`);
    } else {
        parts.push(`Read the sentence as a whole: ${clueExcerpt.startsWith('"') ? clueExcerpt : `"${clueExcerpt}"`}. The answer has to fit that exact grammar or meaning environment, not just look familiar by itself.`);
    }

    if (!isBlankAnswerValue(questionResult.studentAnswer)) {
        parts.push(`You chose ${studentAnswerLabel}. That choice is tempting if you focus only on the general topic, but it does not fit the structure or meaning of this specific sentence as well as the correct option does.`);
    } else {
        parts.push(`Because you left it blank, the best starting point is to identify the controlling clue in the sentence first, then test each option against that clue.`);
    }

    if (context.teacherExplanation) {
        parts.push(`The correct answer is ${correctAnswerLabel} because ${normalizeExplanationText(context.teacherExplanation).replace(/\.$/, '')}.`);
    } else {
        parts.push(`The correct answer is ${correctAnswerLabel} because it keeps the sentence grammatical, logical, and natural from beginning to end.`);
    }

    parts.push(`To solve similar questions, underline the key signal in the sentence, eliminate any option that breaks that signal, and only then choose the option that still sounds fully correct in context.`);
    return parts.join(' ');
}

function getReasoningGuidance(intent: string | undefined): {
    temptingReason: string;
    correctReason: string;
    solvingSteps: string;
} {
    const normalizedIntent = normalizeIntentKey(intent);

    if (normalizedIntent.includes('pronunciation')) {
        return {
            temptingReason: 'spelling can make two words look similar even when their underlined sounds are pronounced differently.',
            correctReason: 'the correct option is the only one whose underlined sound breaks the common pronunciation pattern shared by the other three choices.',
            solvingSteps: 'say each underlined part aloud, group the words with the same sound, and then choose the odd one out instead of trusting spelling alone.',
        };
    }

    if (normalizedIntent.includes('stress')) {
        return {
            temptingReason: 'words with similar endings often look alike, but their stressed syllables may fall in different positions.',
            correctReason: 'the right answer is the option whose primary stress pattern differs from the other choices.',
            solvingSteps: 'mark the stressed syllable in every option, compare the patterns side by side, and eliminate the three words that share the same stress placement.',
        };
    }

    if (
        normalizedIntent.includes('reading')
        || normalizedIntent.includes('matching')
        || normalizedIntent.includes('notice')
        || normalizedIntent.includes('announcement')
        || normalizedIntent.includes('reference')
        || normalizedIntent.includes('dialogue')
        || normalizedIntent.includes('true_false')
        || normalizedIntent.includes('yes_no')
    ) {
        return {
            temptingReason: 'a distractor often repeats a keyword from the text, but it does not match the full meaning, reference, or detail required by the question.',
            correctReason: 'the right answer is the one supported by the actual clue in the text or dialogue after you check the full idea rather than one isolated word.',
            solvingSteps: 'locate the exact line or idea in the text, paraphrase it in your own words, eliminate options that distort the meaning, and then choose the option that matches the context completely.',
        };
    }

    if (
        normalizedIntent.includes('grammar')
        || normalizedIntent.includes('verb_form')
        || normalizedIntent.includes('word_form')
        || normalizedIntent.includes('rewrite')
        || normalizedIntent.includes('error_identification')
        || normalizedIntent.includes('sentence_arrangement')
    ) {
        return {
            temptingReason: 'the wrong option may look possible in isolation, but it breaks the sentence structure, tense logic, agreement, or transformation pattern once you read the whole sentence.',
            correctReason: 'the correct answer is the one that keeps the sentence grammatical, logical, and natural from start to finish.',
            solvingSteps: 'read the whole sentence first, identify the grammar signal or transformation requirement, test each option against that rule, and keep only the answer that preserves both form and meaning.',
        };
    }

    if (
        normalizedIntent.includes('vocabulary')
        || normalizedIntent.includes('synonym')
        || normalizedIntent.includes('antonym')
        || normalizedIntent.includes('cloze')
    ) {
        return {
            temptingReason: 'a distractor may be related to the topic or share the same root word, but it does not fit the exact meaning or collocation required in context.',
            correctReason: 'the correct answer is the option whose meaning and word partnership fit the sentence or passage most precisely.',
            solvingSteps: 'check the words before and after the gap, decide what meaning the sentence really needs, eliminate any option with the wrong collocation or nuance, and then choose the best semantic fit.',
        };
    }

    return {
        temptingReason: 'the wrong answer can look reasonable at first glance, but it does not satisfy the full logic of the question once every clue is considered.',
        correctReason: 'the correct answer is the option that works with both the language pattern and the overall meaning of the prompt.',
        solvingSteps: 'read the whole prompt carefully, identify the key clue that controls the answer, remove options that only partially fit, and then select the answer that remains correct in full context.',
    };
}

export function isWeakQuestionExplanation(text: string | null | undefined): boolean {
    const normalized = normalizeExplanationText(text || '');
    if (!normalized) {
        return true;
    }

    if (
        normalized.toLowerCase().includes('review the grammar rule or vocabulary pattern behind this question')
        || normalized.toLowerCase().includes('try again with similar exercises')
    ) {
        return true;
    }

    const scaffoldMarkers = [
        'this question tests',
        'missing a response here usually means',
        'when you review it, go back to',
        'a reliable way to solve questions like this is to',
        'the correct answer works because the correct answer is',
        'the strongest clue for this question is',
        'the fastest way in is to anchor your answer to that exact clue',
        'a good method is to find the key line first',
        'this is an ordering question, so the key is to find the sentence that can open the paragraph',
        'a common trap here is that several orders look possible at first',
        'when you solve these questions, lock the opening sentence first',
    ];
    const scaffoldHits = scaffoldMarkers.filter((marker) => normalized.toLowerCase().includes(marker)).length;
    if (scaffoldHits >= 2) {
        return true;
    }

    const sentenceCount = normalized
        .split(/[.!?]+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .length;

    return normalized.length < 110 || sentenceCount < 2;
}

function explanationMentionsUnansweredState(text: string | null | undefined): boolean {
    const normalized = normalizeExplanationText(text || '').toLowerCase();
    return normalized.includes('left it blank')
        || normalized.includes('left this question unanswered')
        || normalized.includes('did not answer')
        || normalized.includes("didn't answer")
        || normalized.includes('no answer provided')
        || normalized.includes('no answer submitted')
        || normalized.includes('unanswered');
}

function explanationMentionsChosenState(text: string | null | undefined): boolean {
    const normalized = normalizeExplanationText(text || '').toLowerCase();
    return normalized.includes('you chose')
        || normalized.includes('student chose')
        || normalized.includes('you selected')
        || normalized.includes('student selected')
        || normalized.includes('you picked')
        || normalized.includes('student picked');
}

function hasExplanationAnswerStateMismatch(
    explanations: Record<string, string> | null | undefined,
    questionResults: QuestionResultCollection,
): boolean {
    if (!explanations) {
        return false;
    }

    return getQuestionResultEntries(questionResults).some(({ key, questionResult }) => {
        if (questionResult.isCorrect) {
            return false;
        }

        const explanation = getExplanationForQuestion(explanations, key);
        if (!explanation) {
            return false;
        }

        const mentionsUnanswered = explanationMentionsUnansweredState(explanation);
        const mentionsChosen = explanationMentionsChosenState(explanation);
        if (!mentionsUnanswered && !mentionsChosen) {
            return false;
        }

        const unanswered = isBlankAnswerValue(questionResult.studentAnswer);
        return unanswered
            ? mentionsChosen && !mentionsUnanswered
            : mentionsUnanswered && !mentionsChosen;
    });
}

function hasFallbackAnswerStateMismatch(feedback: FormativeFeedback): boolean {
    return Object.entries(feedback.fallbackQuestionExplanations || {}).some(([key, fallbackExplanation]) => {
        const explanation = getExplanationForQuestion(feedback.questionExplanations || {}, key);
        if (!explanation) {
            return false;
        }

        const fallbackMentionsUnanswered = explanationMentionsUnansweredState(fallbackExplanation);
        const fallbackMentionsChosen = explanationMentionsChosenState(fallbackExplanation);
        const explanationMentionsUnanswered = explanationMentionsUnansweredState(explanation);
        const explanationMentionsChosen = explanationMentionsChosenState(explanation);

        if (fallbackMentionsUnanswered) {
            return explanationMentionsChosen && !explanationMentionsUnanswered;
        }

        if (fallbackMentionsChosen) {
            return explanationMentionsUnanswered && !explanationMentionsChosen;
        }

        return false;
    });
}

export function buildFallbackQuestionExplanation(
    questionNumber: number,
    questionResult: QuestionResult,
    context?: FallbackQuestionContext
): string {
    const qData = context || {};
    const skillLabel = humanizeIntent(qData.intent);
    const promptReference = buildPromptReference(qData);
    const studentAnswer = formatAnswerValue(questionResult.studentAnswer);
    const studentAnswerLabel = formatLabeledAnswer(questionResult.studentAnswer, qData.options);
    const correctAnswerLabel = questionResult.correctAnswer !== undefined
        ? formatLabeledAnswer(questionResult.correctAnswer, qData.options)
        : '"(see correct answer above)"';
    const intent = normalizeIntentKey(qData.intent);

    if (intent.includes('sentence_arrangement')) {
        const sentenceArrangementExplanation = buildSentenceArrangementExplanation(
            questionResult,
            qData,
            studentAnswerLabel,
            correctAnswerLabel,
        );
        if (sentenceArrangementExplanation) {
            return sentenceArrangementExplanation;
        }
    }

    if (
        intent.includes('reading')
        || intent.includes('matching')
        || intent.includes('notice')
        || intent.includes('announcement')
        || intent.includes('reference')
        || intent.includes('dialogue')
        || intent.includes('true_false')
        || intent.includes('yes_no')
    ) {
        return buildReadingOrContextExplanation(questionResult, qData, studentAnswerLabel, correctAnswerLabel);
    }

    if (
        intent.includes('grammar')
        || intent.includes('verb_form')
        || intent.includes('word_form')
        || intent.includes('rewrite')
        || intent.includes('error_identification')
        || intent.includes('vocabulary')
        || intent.includes('synonym')
        || intent.includes('antonym')
        || intent.includes('cloze')
        || intent.includes('closest_meaning')
    ) {
        return buildGrammarOrVocabularyExplanation(questionResult, qData, studentAnswerLabel, correctAnswerLabel);
    }

    const passageReference = shortenText(qData.passageTitle || qData.sectionName, 80);
    const guidance = getReasoningGuidance(qData.intent);
    const parts: string[] = [
        `This question tests ${skillLabel.toLowerCase()} in the context of ${promptReference}.`,
    ];

    if (studentAnswer !== NO_ANSWER_LABEL) {
        parts.push(`You chose ${studentAnswerLabel}, but the correct answer is ${correctAnswerLabel}. ${guidance.temptingReason}`);
    } else {
        parts.push(`You left this question unanswered, but the correct answer is ${correctAnswerLabel}. Missing a response here usually means the key grammar or meaning clue in the prompt was not fully tracked.`);
    }

    if (qData.teacherExplanation) {
        parts.push(`The correct answer works because ${normalizeExplanationText(qData.teacherExplanation).replace(/\.$/, '')}.`);
    } else {
        parts.push(`The correct answer works because ${guidance.correctReason}`);
    }

    if (passageReference) {
        parts.push(`When you review it, go back to ${passageReference} and trace the exact clue before choosing again.`);
    }

    parts.push(`A reliable way to solve questions like this is to ${guidance.solvingSteps}`);

    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function buildFallbackQuestionExplanations(
    questionResults: Record<number, QuestionResult>,
    sections?: THCSSection[]
): Record<string, string> {
    const explanations: Record<string, string> = {};
    const questionDataMap = buildQuestionContextMap(sections);

    for (const [rawQuestionNumber, questionResult] of Object.entries(questionResults || {})) {
        if (questionResult.isCorrect) continue;

        const questionNumber = Number(rawQuestionNumber);
        explanations[String(questionNumber)] = buildFallbackQuestionExplanation(
            questionNumber,
            questionResult,
            questionDataMap[questionNumber],
        );
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
export interface FeedbackPromptMetadata {
    title: string;
    gradeLevel: number;
    type?: string;
    skill?: string;
    family?: 'thcs' | 'ielts' | 'generic';
    bandScore?: number;
    passageResults?: Array<{
        passageName: string;
        questionRange: [number, number];
        correct: number;
        total: number;
        percentage: number;
    }>;
    timeSpent?: number;
    totalQuestions?: number;
}

export interface FormativeFeedbackGenerationResult {
    saved: boolean;
    aiApplied: boolean;
    mode: 'ai' | 'deterministic' | 'failed';
    error?: string;
    reusedExisting?: boolean;
    upgradeAttempted?: boolean;
    upgradeApplied?: boolean;
}

export interface GenerateFormativeFeedbackOptions {
    forceAiUpgrade?: boolean;
}

const feedbackGenerationInFlight = new Map<string, Promise<FormativeFeedbackGenerationResult>>();

function isStoredFormativeFeedback(value: unknown): value is FormativeFeedback {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const feedback = value as FormativeFeedback;
    return typeof feedback.generatedAt === 'number'
        && typeof feedback.deterministicFeedback === 'string'
        && typeof feedback.totalQuestions === 'number';
}

function buildStoredFeedbackResult(feedback: FormativeFeedback): FormativeFeedbackGenerationResult {
    return {
        saved: true,
        aiApplied: Boolean(feedback.aiFeedback),
        mode: feedback.aiFeedback ? 'ai' : 'deterministic',
        reusedExisting: true,
    };
}

function belongsToResultId(feedback: FormativeFeedback, resultId: string): boolean {
    return !feedback.resultId || feedback.resultId === resultId;
}

function normalizeQuestionMappingKey(key: string): string {
    return key.trim().replace(/^q/i, '');
}

function getExplanationForQuestion(
    explanations: Record<string, string>,
    questionKey: string,
): string | undefined {
    return explanations[questionKey] || explanations[`Q${questionKey}`];
}

type ResultQuestionLike = {
    questionNumber: number;
    isCorrect?: boolean;
    studentAnswer?: unknown;
    correctAnswer?: unknown;
    score?: number;
    maxScore?: number;
    pointsEarned?: number;
    pointsMax?: number;
};

function toQuestionResultLike(question: ResultQuestionLike): QuestionResult {
    return {
        questionNumber: question.questionNumber,
        isCorrect: Boolean(question.isCorrect),
        studentAnswer: question.studentAnswer as any,
        correctAnswer: question.correctAnswer as any,
        pointsEarned: Number(question.pointsEarned ?? question.score ?? 0),
        pointsMax: Number(question.pointsMax ?? question.maxScore ?? 0),
    };
}

export function getRenderableQuestionExplanations(
    explanations: Record<string, string> | null | undefined,
): Record<string, string> {
    if (!explanations || typeof explanations !== 'object') {
        return {};
    }

    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(explanations)) {
        if (typeof value !== 'string') {
            continue;
        }

        const normalizedValue = value.trim();
        if (!normalizedValue || isWeakQuestionExplanation(normalizedValue)) {
            continue;
        }

        filtered[normalizeQuestionMappingKey(key)] = normalizedValue;
    }

    return filtered;
}

export function getPreferredQuestionExplanation(
    feedback: FormativeFeedback | null | undefined,
    question: ResultQuestionLike,
): { text: string; source: 'ai' | 'fallback' } | null {
    if (!feedback || question.isCorrect) {
        return null;
    }

    const questionKey = normalizeQuestionMappingKey(String(question.questionNumber));
    const normalizedAiExplanations = getRenderableQuestionExplanations(feedback.questionExplanations);
    const aiExplanation = getExplanationForQuestion(normalizedAiExplanations, questionKey);
    const questionResult = toQuestionResultLike(question);

    if (aiExplanation) {
        const mismatch = hasExplanationAnswerStateMismatch(
            { [questionKey]: aiExplanation },
            [questionResult],
        );

        if (!mismatch) {
            return { text: aiExplanation, source: 'ai' };
        }

        const storedFallback = getExplanationForQuestion(feedback.fallbackQuestionExplanations || {}, questionKey);
        if (storedFallback && normalizeExplanationText(storedFallback)) {
            return { text: storedFallback.trim(), source: 'fallback' };
        }

        return {
            text: buildFallbackQuestionExplanation(question.questionNumber, questionResult),
            source: 'fallback',
        };
    }

    return null;
}

function hasMeaningfulAIFeedback(feedback: FormativeFeedback | null | undefined): boolean {
    const aiFeedback = feedback?.aiFeedback;
    if (!aiFeedback) {
        return false;
    }

    return [aiFeedback.summary, aiFeedback.strengths, aiFeedback.revision, aiFeedback.critical]
        .some((value) => normalizeExplanationText(value).length > 0);
}

export function needsAiFeedbackUpgrade(
    feedback: FormativeFeedback | null | undefined,
    questionResults?: QuestionResultCollection,
): boolean {
    if (!feedback) {
        return false;
    }

    if (!hasMeaningfulAIFeedback(feedback) || feedback.generationMode === 'deterministic') {
        return true;
    }

    const hasWrongAnswers = feedback.totalCorrect < feedback.totalQuestions;
    const explanationValues = Object.values(feedback.questionExplanations || {});
    if (hasWrongAnswers && explanationValues.length === 0) {
        return true;
    }

    if (hasExplanationAnswerStateMismatch(feedback.questionExplanations, questionResults)) {
        return true;
    }

    if (hasFallbackAnswerStateMismatch(feedback)) {
        return true;
    }

    return hasWrongAnswers && explanationValues.some((value) => isWeakQuestionExplanation(value));
}

function isIeltsPromptMetadata(testMetadata: FeedbackPromptMetadata): boolean {
    if (testMetadata.family === 'ielts') {
        return true;
    }

    const type = String(testMetadata.type || '').toLowerCase();
    return type.includes('ielts');
}

function formatDuration(seconds: number | undefined): string {
    if (!seconds || seconds <= 0) {
        return 'Not available';
    }

    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;
        return `${minutes}m ${remainder}s`;
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

export function buildFeedbackPrompt(
    gradingResult: THCSGradingResult,
    sections: THCSSection[],
    testMetadata: FeedbackPromptMetadata,
): { systemPrompt: string; userPrompt: string } {
    const approvedBooks = formatApprovedStudyBooksForPrompt();

    if (isIeltsPromptMetadata(testMetadata)) {
        const questionLines: string[] = [];

        for (const section of sections) {
            const sectionTitle = section.name || 'Passage';
            questionLines.push(`--- Passage: ${sectionTitle} ---`);

            for (const question of section.questions) {
                const questionResult = gradingResult.questionResults[question.questionNumber] as QuestionResult | undefined;
                const status = questionResult?.isCorrect ? 'CORRECT' : 'WRONG';
                const questionType = (question.type || question.intent || 'question').toString();
                const studentAnswer = buildPromptAnswerLabel(questionResult?.studentAnswer, question.options);
                const correctAnswer = buildPromptAnswerLabel(question.correctAnswer || questionResult?.correctAnswer || '', question.options);

                questionLines.push(
                    [
                        `Q${question.questionNumber} [${questionType}] ${status}`,
                        `  Text: ${question.questionText || `Question ${question.questionNumber}`}`,
                        `  Answer status: ${buildPromptAnswerStateLine(questionResult?.studentAnswer)}`,
                        `  Student answer: ${studentAnswer}`,
                        `  Correct answer: ${correctAnswer}`,
                    ].join('\n'),
                );
            }
        }

        const passageLines = (testMetadata.passageResults || []).map((passage) =>
            `${passage.passageName}: ${passage.correct}/${passage.total} (${Math.round(passage.percentage)}%)`,
        );

        const mergedQuestionTypes = gradingResult.sectionResults.reduce<Record<string, { correct: number; total: number }>>(
            (acc, sectionResult) => {
                for (const [questionType, counts] of Object.entries(sectionResult.intentBreakdown || {})) {
                    if (!acc[questionType]) {
                        acc[questionType] = { correct: 0, total: 0 };
                    }

                    acc[questionType].correct += counts.correct;
                    acc[questionType].total += counts.total;
                }

                return acc;
            },
            {},
        );

        const questionTypeBreakdown = Object.entries(mergedQuestionTypes)
            .map(([questionType, counts]) => `${questionType}: ${counts.correct}/${counts.total}`)
            .join('\n');

        const systemPrompt = `You are an expert IELTS tutor providing precise formative feedback for a student.
Your response must interpret IELTS band performance, identify the weakest passage, analyse IELTS-specific question types, and give time-management advice.
For each wrong answer, explain the passage clue or language feature that makes the correct answer right. If Answer status is UNANSWERED, say the student left it blank or did not answer; never say the student chose an option.
You must also recommend specific chapters, units, sections, or practice-test parts from the approved study books only.
Return ONLY valid JSON matching the requested schema.`;

        const userPrompt = `IELTS Test: "${testMetadata.title}"
Band score: ${testMetadata.bandScore?.toFixed(1) || gradingResult.scaledScore.toFixed(1)}
Raw score: ${gradingResult.totalPoints}/${gradingResult.maxPoints}
Time spent: ${formatDuration(testMetadata.timeSpent)}
Question count: ${testMetadata.totalQuestions || gradingResult.maxPoints}

Passage performance:
${passageLines.length > 0 ? passageLines.join('\n') : 'No passage breakdown available'}

Question-type analysis:
${questionTypeBreakdown || 'No question-type breakdown available'}

Approved study books (choose ONLY from this exact list):
${approvedBooks}

Questions:
${questionLines.join('\n\n')}

Return JSON with this EXACT schema:
{
  "questionTopics": {
    "<questionNumber>": { "topic": "<IELTS skill or topic>", "category": "<Reading|Listening|Vocabulary|Grammar|Time Management>" }
  },
  "questionExplanations": {
    "<questionNumber>": "<3-5 sentence explanation naming the IELTS question type, the passage clue or listening cue, why the student's answer is wrong or what clue they missed if they left it blank, why the correct answer is right, and a short tip>"
  },
  "feedback": {
    "summary": "<2-3 sentences with band-score interpretation and the main IELTS skill pattern>",
    "strengths": "<2-3 sentences referencing the strongest passage/question types>",
    "revision": "<2-3 sentences on areas for improvement, naming the weakest passage/question types>",
    "critical": "<2-3 sentences with time-management advice and the most urgent IELTS practice areas, or empty string if there are no critical gaps>"
  },
  "studyRecommendations": [
    {
      "skillTag": "<short label such as 'True / False / Not Given' or 'Reading Strategy'>",
      "questionNumbers": [<wrong question numbers tied to this recommendation, or [] for advanced stretch work>],
      "guidance": "<1-2 sentences connecting the student's mistake pattern to the recommended study target>",
      "resources": [
        {
          "bookTitle": "<must exactly match one approved title>",
          "author": "<must exactly match the approved author>",
          "sectionTitle": "<specific chapter, unit, section, or practice-test part>",
          "reason": "<why this exact section helps with those mistakes>"
        }
      ]
    }
  }
}

RULES:
1. Include band-score interpretation in feedback.summary
2. Identify the weakest passage explicitly in feedback.revision
3. Analyse IELTS-specific question types (for example true/false/not given, matching, completion) in feedback.revision or feedback.critical
4. Give time-management advice based on time spent versus total question count in feedback.critical
5. questionTopics must cover all questions
6. questionExplanations should only cover wrong answers
7. Return 1-3 studyRecommendations and keep them tied to the student's actual wrong questions unless this is a perfect score
8. Use ONLY the approved books listed above; never invent another title or author
9. Each resource must name a specific chapter, unit, section, or practice-test part. If you are unsure about exact page numbers, omit pages entirely
10. If Answer status is UNANSWERED, explicitly say the student left it blank or did not answer instead of saying they chose an option
11. Use encouraging but precise tutor language`;

        return { systemPrompt, userPrompt };
    }

    const systemPrompt = `You are an expert English teacher providing deep, contextual formative feedback to a Vietnamese student (Grade ${testMetadata.gradeLevel}).
Your explanations must analyse the SPECIFIC grammar rule, vocabulary usage, or reading context that each question tests.
For each wrong answer, you MUST:
1. Identify the exact grammar rule or language skill being tested (e.g., "present perfect vs past simple", "relative pronoun 'whose' vs 'who'", "phrasal verb 'look forward to + V-ing'")
2. Explain WHY the student's chosen answer is wrong in THIS specific sentence/context — reference the actual words from the question
3. Explain WHY the correct answer fits — cite the grammar rule or contextual clue that makes it correct
4. Give a brief, memorable learning tip the student can use to avoid this mistake in the future
5. Recommend specific chapters, units, or sections from the approved study books only
Return ONLY valid JSON matching the schema below. No markdown, no commentary.`;

    // Build question list with rich context
    const questionLines: string[] = [];
    for (const section of sections) {
        // Include section context (passage, reading text) if available
        const sectionContext = (section as any).passage?.content || (section as any).passageContent || '';
        const sectionTitle = section.name || '';

        if (sectionContext && sectionTitle) {
            questionLines.push(`--- Section: ${sectionTitle} ---\n  Passage/Context: ${sectionContext.substring(0, 500)}${sectionContext.length > 500 ? '...' : ''}`);
        }

        for (const q of section.questions) {
            const qResult = gradingResult.questionResults[q.questionNumber] as QuestionResult | undefined;
            const isCorrect = qResult?.isCorrect ?? false;
            const status = isCorrect ? 'CORRECT' : 'WRONG';
            const intent = q.intent || q.type;

            let line = `Q${q.questionNumber} [${intent}] ${status}`;
            line += `\n  Text: ${q.questionText}`;

            // Include ALL options for MCQ so AI can analyse each choice
            if (q.options && q.options.length > 0) {
                const labels = ['A', 'B', 'C', 'D'];
                const optStr = q.options.map((opt, i) => `${labels[i]}. ${opt}`).join(' | ');
                line += `\n  Options: ${optStr}`;
            }

            // Student answer + correct answer
            const studentAns = buildPromptAnswerLabel(qResult?.studentAnswer, q.options);
            const correctAns = buildPromptAnswerLabel(q.correctAnswer || (qResult?.correctAnswer ?? ''), q.options);
            line += `\n  Answer status: ${buildPromptAnswerStateLine(qResult?.studentAnswer)}`;
            line += `\n  Student answer: ${studentAns}`;
            line += `\n  Correct answer: ${correctAns}`;

            // Include original sentence for sentence-rewrite type
            if ((q as any).originalSentence) {
                line += `\n  Original sentence: ${(q as any).originalSentence}`;
            }

            // Teacher explanation (so AI doesn't duplicate)
            if (q.explanation?.text) {
                line += `\n  Teacher explanation (DO NOT repeat): ${q.explanation.text}`;
            }

            questionLines.push(line);
        }
    }

    const percentage = gradingResult.maxPoints > 0
        ? ((gradingResult.totalPoints / gradingResult.maxPoints) * 100).toFixed(1)
        : '0';

    const userPrompt = `Test: "${testMetadata.title}" (Grade ${testMetadata.gradeLevel})
Score: ${gradingResult.totalPoints}/${gradingResult.maxPoints} (${percentage}%, ${gradingResult.scaledScore.toFixed(1)}/10)

Approved study books (choose ONLY from this exact list):
${approvedBooks}

Questions:
${questionLines.join('\n\n')}

Return JSON with this EXACT schema:
{
  "questionTopics": {
    "<questionNumber>": { "topic": "<specific grammar/vocabulary topic, e.g. 'present perfect with since/for', 'conditional type 2', 'word form: adjective vs adverb'>", "category": "<Phonetics|Grammar|Vocabulary|Reading|Writing|Communication>" }
  },
  "questionExplanations": {
    "<questionNumber>": "<3-5 sentence DEEP explanation. Structure: (1) Name the specific grammar rule or skill tested. (2) Quote the relevant part of the question and explain why the student's answer does not work in this context. (3) Explain why the correct answer works, citing the rule. (4) One-line tip to remember the rule.>"
  },
  "feedback": {
    "summary": "<2-3 sentences summarizing overall performance with specific skill areas mentioned>",
    "strengths": "<2-3 sentences about what the student did well, referencing question numbers and naming the skills>",
    "revision": "<2-3 sentences about areas needing practice, with specific grammar/vocabulary topics and question refs>",
    "critical": "<2-3 sentences about critical gaps with exact rule names, or empty string if student scored above 70%>"
  },
  "studyRecommendations": [
    {
      "skillTag": "<short label such as 'Grammar', 'Vocabulary', or 'Reading Comprehension'>",
      "questionNumbers": [<wrong question numbers tied to this recommendation, or [] for advanced stretch work>],
      "guidance": "<1-2 sentences connecting the specific mistakes to what the student should review>",
      "resources": [
        {
          "bookTitle": "<must exactly match one approved title>",
          "author": "<must exactly match the approved author>",
          "sectionTitle": "<specific chapter, unit, section, or practice-test part>",
          "reason": "<why this section is the right next study target>"
        }
      ]
    }
  }
}

RULES:
1. questionTopics: provide for ALL questions (correct and wrong)
2. questionExplanations: provide ONLY for WRONG answers — but make each explanation THOROUGH and CONTEXTUAL
3. Be VERY specific about grammar topics (e.g., "present perfect continuous vs present perfect simple", "subject-verb agreement with collective nouns", "comparative form of multi-syllable adjectives using 'more'")
4. Each questionExplanation MUST:
   a. Name the grammar rule or vocabulary pattern (e.g., "This tests the passive voice with modal verbs")
   b. Explain why the student's specific choice fails IN THIS sentence (e.g., "You chose 'has went' but 'went' is the past simple form — after 'has', we need the past participle 'gone'")
   c. Explain why the correct answer works (e.g., "'has gone' is correct because present perfect = has/have + past participle (V3)")
   d. Give a short memorable tip (e.g., "Remember: has/have + V3, never V2")
5. For vocabulary questions: explain the meaning difference between the student's choice and the correct answer, with usage context
6. For reading comprehension: reference the specific passage clue that supports the correct answer
7. Reference question numbers in feedback sections (e.g., "Q3, Q7")
8. If teacher explanation exists, complement it — don't repeat it
9. feedback.critical should be empty string "" if student scored above 70%
10. Return 1-3 studyRecommendations and tie each one to the wrong questions it helps fix unless this is a perfect score
11. Use ONLY the approved books listed above; never invent another title or author
12. Each resource must include a specific chapter, unit, section, or practice-test part. If you are unsure about exact page numbers, omit pages entirely
13. Use encouraging, student-friendly language — be a supportive tutor, not a judge`;

    const normalizedSystemPrompt = systemPrompt.replace(
        /2\. Explain WHY the student's chosen answer is wrong in THIS specific sentence\/context [^\n]+/,
        "2. Explain WHY the student's chosen answer is wrong in THIS specific sentence/context — or, if the answer is blank, explain which clue they needed to use and clearly say they left it unanswered",
    );

    const normalizedUserPrompt = userPrompt
        .replace(
            /"questionExplanations": \{\n    "<questionNumber>": "<3-5 sentence DEEP explanation\.[^"]+"/,
            `"questionExplanations": {
    "<questionNumber>": "<3-5 sentence DEEP explanation. Structure: (1) Name the specific grammar rule or skill tested. (2) Quote the relevant part of the question and explain why the student's answer does not work in this context, or what clue they missed if they left it blank. (3) Explain why the correct answer works, citing the rule. (4) One-line tip to remember the rule.>"`,
        )
        .replace(
            /   b\. Explain why the student's specific choice fails IN THIS sentence \([^\n]+/,
            "   b. If Answer status is ANSWERED, explain why the student's specific choice fails IN THIS sentence. If Answer status is UNANSWERED, say the student left it blank and explain the missed clue instead",
        )
        .replace(
            /13\. Use encouraging, student-friendly language [^\n]+$/,
            `13. Never say the student chose an option when Answer status is UNANSWERED
14. Use encouraging, student-friendly language — be a supportive tutor, not a judge`,
        );

    return { systemPrompt: normalizedSystemPrompt, userPrompt: normalizedUserPrompt };
}

// ═══════════════════════════════════════════════════════════════
// AI Response Validation
// ═══════════════════════════════════════════════════════════════

/**
 * Validate and sanitize the AI response against expected schema.
 * Returns null if the response is invalid.
 */
export function validateAIFeedbackResponse(
    raw: unknown,
    requiredExplanationKeys: string[] = [],
): AIFeedbackResponse | null {
    if (!raw || typeof raw !== 'object') return null;

    const obj = raw as Record<string, unknown>;

    // Validate questionTopics
    if (!obj.questionTopics || typeof obj.questionTopics !== 'object') return null;
    const topics: Record<string, { topic: string; category: string }> = {};
    for (const [key, val] of Object.entries(obj.questionTopics as Record<string, unknown>)) {
        const normalizedKey = normalizeQuestionMappingKey(key);
        if (val && typeof val === 'object') {
            const v = val as Record<string, unknown>;
            if (typeof v.topic === 'string' && typeof v.category === 'string') {
                topics[normalizedKey] = { topic: v.topic, category: v.category };
            }
        }
    }

    // Validate questionExplanations
    const explanations: Record<string, string> = {};
    if (obj.questionExplanations && typeof obj.questionExplanations === 'object') {
        for (const [key, val] of Object.entries(obj.questionExplanations as Record<string, unknown>)) {
            const normalizedKey = normalizeQuestionMappingKey(key);
            if (typeof val === 'string' && val.trim().length > 0) {
                explanations[normalizedKey] = val.trim();
            }
        }
    }

    const normalizedRequiredKeys = Array.from(
        new Set(
            requiredExplanationKeys
                .map((key) => normalizeQuestionMappingKey(key))
                .filter(Boolean),
        ),
    );
    for (const requiredKey of normalizedRequiredKeys) {
        const explanation = getExplanationForQuestion(explanations, requiredKey);
        if (!explanation || isWeakQuestionExplanation(explanation)) {
            return null;
        }
    }

    const studyRecommendations: StudyRecommendation[] = [];
    if (Array.isArray(obj.studyRecommendations)) {
        for (const entry of obj.studyRecommendations) {
            if (!entry || typeof entry !== 'object') {
                continue;
            }

            const recommendation = entry as Record<string, unknown>;
            const skillTag = typeof recommendation.skillTag === 'string' ? recommendation.skillTag.trim() : '';
            const guidance = typeof recommendation.guidance === 'string' ? recommendation.guidance.trim() : '';
            const questionNumbers = Array.isArray(recommendation.questionNumbers)
                ? recommendation.questionNumbers
                    .map((value) => Number(value))
                    .filter((value) => Number.isInteger(value) && value > 0)
                : [];

            const resources = Array.isArray(recommendation.resources)
                ? recommendation.resources
                    .map((resource) => {
                        if (!resource || typeof resource !== 'object') {
                            return null;
                        }

                        const rawResource = resource as Record<string, unknown>;
                        const bookTitle = typeof rawResource.bookTitle === 'string' ? rawResource.bookTitle.trim() : '';
                        const author = typeof rawResource.author === 'string' ? rawResource.author.trim() : '';
                        const sectionTitle = typeof rawResource.sectionTitle === 'string' ? rawResource.sectionTitle.trim() : '';
                        const reason = typeof rawResource.reason === 'string' ? rawResource.reason.trim() : '';

                        if (!bookTitle || !author || !sectionTitle || !reason) {
                            return null;
                        }

                        const approvedBook = findApprovedStudyBook(bookTitle, author);
                        if (!approvedBook) {
                            return null;
                        }

                        return {
                            bookTitle: approvedBook.title,
                            author: approvedBook.author,
                            sectionTitle,
                            reason,
                        };
                    })
                    .filter((resource): resource is StudyRecommendation['resources'][number] => Boolean(resource))
                : [];

            if (!skillTag || !guidance || resources.length === 0) {
                continue;
            }

            studyRecommendations.push({
                skillTag,
                guidance,
                questionNumbers: Array.from(new Set(questionNumbers)).sort((a, b) => a - b),
                resources,
            });
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
        studyRecommendations: studyRecommendations.slice(0, 3),
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
    requiredExplanationKeys: string[],
): Promise<AICallResult> {
    try {
        const rotationResult = await executeGeminiWithKeyRotation<{
            data: NonNullable<AICallResult['data']>;
            model: string;
        }>({
            callerName: 'FormativeFeedback',
            benchedKeysError: ({ totalConfiguredKeys }) =>
                `All ${totalConfiguredKeys} Gemini keys are benched (cooling down)`,
            exhaustedError: 'All Gemini keys exhausted',
            attempt: async ({ key, attemptNumber, GoogleGenerativeAI }) => {
                const client = new GoogleGenerativeAI(key);
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
                    console.warn(`⚠️ [FormativeFeedback/Gemini] Empty response from key ${attemptNumber}`);
                    return { status: 'continue' };
                }

                const parsed = extractJSON(text);
                const validated = validateAIFeedbackResponse(parsed, requiredExplanationKeys);

                if (!validated) {
                    console.warn(`⚠️ [FormativeFeedback/Gemini] Validation failed for key ${attemptNumber}`);
                    return { status: 'continue' };
                }

                return {
                    status: 'success',
                    value: {
                        data: validated,
                        model: 'gemini-2.5-flash',
                    },
                };
            },
        });

        if (rotationResult.success && rotationResult.value) {
            return {
                success: true,
                data: rotationResult.value.data,
                model: rotationResult.value.model,
            };
        }

        return {
            success: false,
            error: rotationResult.error,
            allKeysExhausted: rotationResult.allKeysExhausted,
        };
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
    requiredExplanationKeys: string[],
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
                const validated = validateAIFeedbackResponse(parsed, requiredExplanationKeys);

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
    testMetadata: FeedbackPromptMetadata,
): Promise<{ data: AIFeedbackResponse; model: string } | null> {
    const { systemPrompt, userPrompt } = buildFeedbackPrompt(
        gradingResult, sections, testMetadata
    );
    const requiredExplanationKeys = Object.values(gradingResult.questionResults || {})
        .filter((question) => !question.isCorrect)
        .map((question) => String(question.questionNumber));

    // Step 1: Try Gemini first
    console.log('🤖 [FormativeFeedback] Attempting Gemini...');
    const geminiResult = await callGeminiForFeedback(systemPrompt, userPrompt, requiredExplanationKeys);

    if (geminiResult.success && geminiResult.data) {
        if (hasExplanationAnswerStateMismatch(geminiResult.data.questionExplanations, gradingResult.questionResults)) {
            console.warn('⚠️ [FormativeFeedback] Gemini explanations contradicted unanswered question state.');
        } else {
            console.log('✅ [FormativeFeedback] Gemini succeeded');
            return { data: geminiResult.data, model: geminiResult.model! };
        }
    }

    console.warn(`⚠️ [FormativeFeedback] Gemini failed: ${geminiResult.error}`);

    // Step 2: Fall back to Groq
    console.log('🔄 [FormativeFeedback] Falling back to Groq...');
    const groqResult = await callGroqForFeedback(systemPrompt, userPrompt, requiredExplanationKeys);

    if (groqResult.success && groqResult.data) {
        if (hasExplanationAnswerStateMismatch(groqResult.data.questionExplanations, gradingResult.questionResults)) {
            console.warn('⚠️ [FormativeFeedback] Groq explanations contradicted unanswered question state.');
        } else {
            console.log('✅ [FormativeFeedback] Groq fallback succeeded');
            return { data: groqResult.data, model: groqResult.model! };
        }
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
    testMetadata: FeedbackPromptMetadata,
    resultId: string,
    options?: GenerateFormativeFeedbackOptions,
): Promise<FormativeFeedbackGenerationResult> {
    const inFlightTask = feedbackGenerationInFlight.get(resultId);
    if (inFlightTask) {
        return inFlightTask;
    }

    const task = (async (): Promise<FormativeFeedbackGenerationResult> => {
        let storedFeedback: FormativeFeedback | null = null;
        let forceAiUpgrade = false;
        try {
            const { ref, update, get } = await import('firebase/database');
            const { database } = await import('./firebase');
            const storedFeedbackRef = ref(database, `test_results/${resultId}/formativeFeedback`);
            const storedFeedbackSnapshot = await get(storedFeedbackRef);

            if (storedFeedbackSnapshot.exists()) {
                const rawStoredFeedback = storedFeedbackSnapshot.val();
                if (isStoredFormativeFeedback(rawStoredFeedback)) {
                    if (belongsToResultId(rawStoredFeedback, resultId)) {
                        console.log(`↩️ [FormativeFeedback] Reusing stored feedback for result ${resultId}.`);
                        storedFeedback = rawStoredFeedback;
                        const hasAnswerStateMismatch = hasExplanationAnswerStateMismatch(
                            storedFeedback.questionExplanations,
                            gradingResult.questionResults,
                        );
                        forceAiUpgrade = needsAiFeedbackUpgrade(
                            storedFeedback,
                            gradingResult.questionResults,
                        ) && Boolean(options?.forceAiUpgrade || hasAnswerStateMismatch);
                        if (!forceAiUpgrade) {
                            console.log(`[FormativeFeedback] Reusing stored feedback for result ${resultId}.`);
                            return buildStoredFeedbackResult(storedFeedback);
                        }
                        console.log(`[FormativeFeedback] Attempting AI upgrade for stored feedback on result ${resultId}.`);
                    }

                    console.warn(`⚠️ [FormativeFeedback] Ignoring mismatched stored feedback for result ${resultId}.`);
                }
            }

            console.log(`🧠 [FormativeFeedback] Generating feedback for result ${resultId}...`);

            // Step 1: Generate deterministic baseline (sync, always works)
            const feedback = generateDeterministicFeedback(gradingResult, sections);

            // Step 2: Attempt AI enhancement (async, may fail gracefully)
            const aiResult = await generateAIFeedback(gradingResult, sections, testMetadata);

            if (aiResult) {
                // Merge AI data into deterministic baseline
                feedback.questionTopics = aiResult.data.questionTopics;
                feedback.questionExplanations = getRenderableQuestionExplanations(aiResult.data.questionExplanations);
                feedback.aiFeedback = aiResult.data.feedback;
                feedback.studyRecommendations = aiResult.data.studyRecommendations;
                feedback.aiModel = aiResult.model;
                console.log(`🤖 [FormativeFeedback] AI enrichment applied (${aiResult.model})`);
            } else {
                if (storedFeedback && forceAiUpgrade) {
                    console.log(`[FormativeFeedback] AI upgrade unavailable for result ${resultId}; keeping stored feedback.`);
                    return {
                        ...buildStoredFeedbackResult(storedFeedback),
                        error: 'AI upgrade did not complete. The existing feedback is still being shown.',
                        upgradeAttempted: true,
                        upgradeApplied: false,
                    };
                }
                console.log('📊 [FormativeFeedback] Using deterministic-only feedback');
            }

            const fallbackExplanations = buildFallbackQuestionExplanations(gradingResult.questionResults || {}, sections);
            feedback.fallbackQuestionExplanations = fallbackExplanations;

            feedback.resultId = resultId;
            feedback.generationMode = aiResult ? 'ai' : 'deterministic';

            // Step 3: Save feedback to RTDB
            await update(ref(database, `test_results/${resultId}`), {
                formativeFeedback: feedback,
            });

            const mode = aiResult ? `AI (${aiResult.model})` : 'deterministic-only';
            console.log(`✅ [FormativeFeedback] Saved feedback for result ${resultId} (${mode})`);
            return {
                saved: true,
                aiApplied: Boolean(aiResult),
                mode: aiResult ? 'ai' : 'deterministic',
                upgradeAttempted: forceAiUpgrade,
                upgradeApplied: forceAiUpgrade ? Boolean(aiResult) : undefined,
            };
        } catch (error) {
            // Non-blocking: log and swallow — test result is already saved
            console.error(`❌ [FormativeFeedback] Failed for result ${resultId}:`, error);
            return {
                saved: false,
                aiApplied: false,
                mode: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        } finally {
            feedbackGenerationInFlight.delete(resultId);
        }
    })();

    feedbackGenerationInFlight.set(resultId, task);
    return task;
}
