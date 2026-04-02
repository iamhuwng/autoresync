import { doc, getDoc, setDoc } from 'firebase/firestore';
// @ts-ignore - JS service file
import { firestore as db } from './firebase';
import { deepRemoveUndefined } from './draftCloudService';
import { withRestoreGuard } from './restoreGuard';
import { aiService } from './ai/router.service';
import { getAIAvailability } from './ai-status.service';
import type { Result } from '../types/result.types';
import type {
    WritingSubmission,
    WritingSubmissionTask,
    WritingSuggestionCacheDoc,
    WritingSuggestionFocus,
    WritingSuggestionItem,
    WritingSuggestionItemSet,
    WritingSuggestionTaskResult,
} from '../types/ielts-writing.types';

const WRITING_SUGGESTION_CACHE_COLLECTION = 'writing_grading_ai_cache';
const MAX_SUGGESTIONS_PER_TASK = 8;

const WRITING_SUGGESTION_SYSTEM_INSTRUCTION = [
    'You are a careful IELTS writing grading assistant.',
    'Return only valid JSON.',
    'Do not add markdown fences or explanatory prose.',
].join(' ');

const TASK_1_PROMPT = `You are an expert IELTS Writing Task 1 grading assistant helping a teacher review a student's response.

Your job is to identify only the most teacher-useful grammar and vocabulary/expression issues and return structured suggestions for a grading editor.

ASSESSMENT LENS
Assess only through IELTS Lexical Resource and Grammatical Range and Accuracy.
Prioritise issues that materially reduce:
- accuracy of wording
- appropriacy to the task type
- precision of meaning
- natural collocation and expression
- control of grammar and punctuation
- clarity at sentence level

TASK 1-SPECIFIC PRIORITIES
- Task 1 type will be exactly one of: "Academic" or "GeneralTraining".
- If the task type is Academic:
  - prefer neutral, factual reporting language
  - prioritise errors in describing trends, comparisons, quantities, dates, stages, locations, percentages, and proportions
  - flag vocabulary or grammar that makes reporting inaccurate, imprecise, or unnatural for chart, table, graph, map, or process descriptions
  - do not infer unseen data or visual details beyond the task prompt and the student's wording
- If the task type is GeneralTraining:
  - prioritise natural and appropriate language for purpose, requests, explanations, apologies, tone, and register in a letter
  - focus only when the issue is grammatical or lexical
- Do not comment on Task Achievement, overview quality, missing key features, missing bullet coverage, or organisation unless the problem is directly a grammar or vocabulary/expression issue.

SELECTION RULES
- Analyze the full response.
- Focus only on grammar and vocabulary/expression.
- Do not give band scores.
- Do not rewrite the whole response.
- Do not produce praise, summary feedback, or general observations.
- Prefer fewer strong suggestions over many weak ones.
- Return 0 to 8 total suggestions.
- The total number of items across all four output arrays must not exceed 8.
- Prioritise issues with the highest impact on accuracy, appropriacy, precision, naturalness, or clarity.
- Ignore tiny stylistic preferences.
- Do not replace a valid phrase with a merely more advanced one.
- If the same problem repeats, include only the clearest one or two examples.
- Prefer "correction" when a short local replacement cleanly fixes the issue.
- Use "comment" when explanation is useful but no single short replacement is clearly best.
- Do not output both a comment and a correction for the same anchor unless both are clearly justified.
- Do not create overlapping anchors.

ANCHORING AND CLASSIFICATION RULES
- Use the provided sentence list as the sole authority for sentenceIndex.
- sentenceIndex must be 0-based.
- anchorText must copy the exact problematic text from the student's response.
- Do not normalize, paraphrase, or clean up anchorText.
- Do not include surrounding text unless it is part of the problem.
- replacementText must contain only the improved span, not a full sentence.
- replacementText must preserve the student's intended meaning unless the original meaning is itself incorrect, misleading, or unclear.
- Do not change the student's meaning unless the original wording is clearly wrong or misleading.
- If an issue cannot be anchored exactly and uniquely to the provided sentence text, omit it.
- If anchorText appears multiple times in the same sentence and cannot be uniquely resolved, omit it.
- Grammar issues use categoryId "gra" and focus "grammar".
- Vocabulary/expression issues use categoryId "lr" and focus "vocabulary-expression".
- Choose one primary category only for each anchor.

COMMENT ITEM REQUIREMENTS
Each comment item must contain:
- kind = "comment"
- focus
- sentenceIndex
- anchorText
- title
- reason
- suggestedCommentText
- categoryId

CORRECTION ITEM REQUIREMENTS
Each correction item must contain:
- kind = "correction"
- focus
- sentenceIndex
- anchorText
- title
- reason
- replacementText
- categoryId

FIELD QUALITY RULES
- title must be short and specific.
- reason must briefly explain why this is inaccurate, inappropriate, imprecise, unnatural, or unclear.
- suggestedCommentText must be short, teacher-facing, and actionable.
- replacementText must be the minimal improved wording only.

OUTPUT RULES
- Return valid JSON only.
- Do not use markdown.
- Do not include any text before or after the JSON.
- Return exactly one task object inside "tasks".
- Return exactly this top-level shape:
{
  "tasks": [
    {
      "taskNumber": 1,
      "grammar": {
        "comments": [],
        "corrections": []
      },
      "vocabularyExpression": {
        "comments": [],
        "corrections": []
      }
    }
  ]
}
- If there are no worthwhile issues, return empty arrays.

RUNTIME PAYLOAD

Task 1 type: {{task1Type}}
Task prompt:
{{promptText}}

Sentences (0-based):
{{sentences}}

Student response:
{{essayText}}`;

const TASK_2_PROMPT = `You are an expert IELTS Writing Task 2 grading assistant helping a teacher review a student's essay.

Your job is to identify only the most teacher-useful grammar and vocabulary/expression issues and return structured suggestions for a grading editor.

ASSESSMENT LENS
Assess only through IELTS Lexical Resource and Grammatical Range and Accuracy.
Prioritise issues that materially reduce:
- precision and appropriacy of vocabulary
- control of collocation and natural written expression
- spelling and word formation
- range, accuracy, and control of sentence structures
- grammar and punctuation
- clarity of stance, claims, and support at sentence level

TASK 2-SPECIFIC PRIORITIES
- Prefer natural, precise, formal written English suitable for IELTS essays.
- Prioritise wording problems that weaken the clarity of the writer's position, reasoning, examples, or relationships between ideas, but only when the cause is grammatical or lexical.
- Prioritise vague word choice, faulty collocation, awkward phrasing, register mismatch, pronoun/reference ambiguity, sentence boundary problems, article/preposition/verb-form errors, and punctuation that affects clarity.
- Treat mild repetition as low priority unless it noticeably weakens lexical range or naturalness.
- Do not judge the truth of the writer's ideas.
- Do not comment on Task Response, idea quality, development, support, or organisation unless the problem is directly caused by grammar or vocabulary/expression.
- Do not force rare, flashy, or overly idiomatic vocabulary. Prefer the most natural accurate phrase for IELTS.

SELECTION RULES
- Analyze the full essay.
- Focus only on grammar and vocabulary/expression.
- Do not give band scores.
- Do not rewrite the whole essay.
- Do not produce praise, summary feedback, or general observations.
- Prefer fewer strong suggestions over many weak ones.
- Return 0 to 8 total suggestions.
- The total number of items across all four output arrays must not exceed 8.
- Prioritise issues with the highest impact on precision, appropriacy, naturalness, or clarity.
- Ignore tiny stylistic preferences.
- Do not replace a valid phrase with a merely more advanced one.
- If the same problem repeats, include only the clearest one or two examples.
- Prefer "correction" when a short local replacement cleanly fixes the issue.
- Use "comment" when explanation is useful but no single short replacement is clearly best.
- Do not output both a comment and a correction for the same anchor unless both are clearly justified.
- Do not create overlapping anchors.

ANCHORING AND CLASSIFICATION RULES
- Use the provided sentence list as the sole authority for sentenceIndex.
- sentenceIndex must be 0-based.
- anchorText must copy the exact problematic text from the student's essay.
- Do not normalize, paraphrase, or clean up anchorText.
- Do not include surrounding text unless it is part of the problem.
- replacementText must contain only the improved span, not a full sentence.
- replacementText must preserve the student's intended meaning unless the original meaning is itself incorrect, misleading, or unclear.
- Do not change the student's meaning unless the original wording is clearly wrong or misleading.
- If an issue cannot be anchored exactly and uniquely to the provided sentence text, omit it.
- If anchorText appears multiple times in the same sentence and cannot be uniquely resolved, omit it.
- Grammar issues use categoryId "gra" and focus "grammar".
- Vocabulary/expression issues use categoryId "lr" and focus "vocabulary-expression".
- Choose one primary category only for each anchor.

COMMENT ITEM REQUIREMENTS
Each comment item must contain:
- kind = "comment"
- focus
- sentenceIndex
- anchorText
- title
- reason
- suggestedCommentText
- categoryId

CORRECTION ITEM REQUIREMENTS
Each correction item must contain:
- kind = "correction"
- focus
- sentenceIndex
- anchorText
- title
- reason
- replacementText
- categoryId

FIELD QUALITY RULES
- title must be short and specific.
- reason must briefly explain why this is inaccurate, inappropriate, imprecise, unnatural, or unclear.
- suggestedCommentText must be short, teacher-facing, and actionable.
- replacementText must be the minimal improved wording only.

OUTPUT RULES
- Return valid JSON only.
- Do not use markdown.
- Do not include any text before or after the JSON.
- Return exactly one task object inside "tasks".
- Return exactly this top-level shape:
{
  "tasks": [
    {
      "taskNumber": 2,
      "grammar": {
        "comments": [],
        "corrections": []
      },
      "vocabularyExpression": {
        "comments": [],
        "corrections": []
      }
    }
  ]
}
- If there are no worthwhile issues, return empty arrays.

RUNTIME PAYLOAD

Task prompt:
{{promptText}}

Sentences (0-based):
{{sentences}}

Student essay:
{{essayText}}`;

interface SentenceSegment {
    index: number;
    text: string;
    start: number;
    end: number;
}

interface RawSuggestionItem {
    kind?: unknown;
    focus?: unknown;
    sentenceIndex?: unknown;
    anchorText?: unknown;
    title?: unknown;
    reason?: unknown;
    suggestedCommentText?: unknown;
    replacementText?: unknown;
    categoryId?: unknown;
}

interface RawSuggestionBucket {
    comments?: unknown;
    corrections?: unknown;
}

interface RawSuggestionTask {
    taskNumber?: unknown;
    grammar?: RawSuggestionBucket | null;
    vocabularyExpression?: RawSuggestionBucket | null;
}

interface RawSuggestionResponse {
    tasks?: RawSuggestionTask[] | null;
}

function getSuggestionCacheRef(submissionId: string) {
    return doc(db, WRITING_SUGGESTION_CACHE_COLLECTION, submissionId);
}

function createEmptyItemSet(): WritingSuggestionItemSet {
    return {
        comments: [],
        corrections: [],
    };
}

function createEmptyTaskResult(taskNumber: 1 | 2): WritingSuggestionTaskResult {
    return {
        taskNumber,
        grammar: createEmptyItemSet(),
        vocabularyExpression: createEmptyItemSet(),
    };
}

function createEssayHash(essayText: string): string {
    let hash = 5381;
    for (let index = 0; index < essayText.length; index += 1) {
        hash = ((hash << 5) + hash) + essayText.charCodeAt(index);
        hash &= hash;
    }

    return `essay_${(hash >>> 0).toString(36)}`;
}

export function segmentEssayIntoSentences(essayText: string): SentenceSegment[] {
    const segments: SentenceSegment[] = [];
    const length = essayText.length;
    const punctuation = new Set(['.', '!', '?']);
    const closers = new Set(['"', '\'', ')', ']', '}', '\u201d']);

    let sentenceStart = 0;
    while (sentenceStart < length && /\s/.test(essayText[sentenceStart] || '')) {
        sentenceStart += 1;
    }

    for (let index = sentenceStart; index < length; index += 1) {
        const current = essayText[index] || '';
        if (!punctuation.has(current)) {
            continue;
        }

        let sentenceEnd = index + 1;
        while (sentenceEnd < length && closers.has(essayText[sentenceEnd] || '')) {
            sentenceEnd += 1;
        }

        const nextChar = essayText[sentenceEnd];
        if (sentenceEnd < length && !/\s/.test(nextChar || '')) {
            continue;
        }

        const text = essayText.slice(sentenceStart, sentenceEnd);
        if (text.trim()) {
            segments.push({
                index: segments.length,
                text,
                start: sentenceStart,
                end: sentenceEnd,
            });
        }

        sentenceStart = sentenceEnd;
        while (sentenceStart < length && /\s/.test(essayText[sentenceStart] || '')) {
            sentenceStart += 1;
        }
        index = sentenceStart - 1;
    }

    if (sentenceStart < length) {
        const text = essayText.slice(sentenceStart);
        if (text.trim()) {
            segments.push({
                index: segments.length,
                text,
                start: sentenceStart,
                end: length,
            });
        }
    }

    return segments;
}

export function inferTask1SuggestionType(task: WritingSubmissionTask): 'Academic' | 'GeneralTraining' {
    const prompt = `${task.promptText}\n${task.essayText}`.toLowerCase();
    const generalTrainingSignals = [
        'write a letter',
        'you should write at least 150 words',
        'dear ',
        'formal letter',
        'informal letter',
        'semi-formal',
        'friend',
    ];

    return generalTrainingSignals.some((signal) => prompt.includes(signal))
        ? 'GeneralTraining'
        : 'Academic';
}

export function resolveSuggestionAnchor(
    sentences: SentenceSegment[],
    sentenceIndex: number,
    anchorText: string
): { from: number; to: number } | null {
    const sentence = sentences[sentenceIndex];
    if (!sentence || !anchorText) {
        return null;
    }

    const matches: number[] = [];
    let searchIndex = sentence.text.indexOf(anchorText);
    while (searchIndex !== -1) {
        matches.push(searchIndex);
        searchIndex = sentence.text.indexOf(anchorText, searchIndex + anchorText.length);
    }

    if (matches.length !== 1) {
        return null;
    }

    const matchIndex = matches[0];
    if (matchIndex === undefined) {
        return null;
    }

    return {
        from: sentence.start + matchIndex,
        to: sentence.start + matchIndex + anchorText.length,
    };
}

function formatSentencesForPrompt(sentences: SentenceSegment[]): string {
    return JSON.stringify(
        sentences.map((sentence) => ({
            sentenceIndex: sentence.index,
            text: sentence.text,
        })),
        null,
        2,
    );
}

function buildTaskPrompt(task: WritingSubmissionTask): string {
    const sentences = segmentEssayIntoSentences(task.essayText);
    const payload = {
        promptText: task.promptText,
        sentences: formatSentencesForPrompt(sentences),
        essayText: task.essayText,
        task1Type: task.taskNumber === 1 ? inferTask1SuggestionType(task) : undefined,
    };

    const template = task.taskNumber === 1 ? TASK_1_PROMPT : TASK_2_PROMPT;
    return template
        .replace('{{task1Type}}', payload.task1Type || 'Academic')
        .replace('{{promptText}}', payload.promptText)
        .replace('{{sentences}}', payload.sentences)
        .replace('{{essayText}}', payload.essayText);
}

function normalizeTextField(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function normalizeSentenceIndex(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        return value;
    }

    if (typeof value === 'string' && /^\d+$/.test(value)) {
        return Number(value);
    }

    return null;
}

function pushNormalizedItems(
    rawItems: unknown,
    taskNumber: 1 | 2,
    expectedFocus: WritingSuggestionFocus,
    expectedKind: 'comment' | 'correction',
    sentences: SentenceSegment[],
    sink: WritingSuggestionItem[],
) {
    if (!Array.isArray(rawItems)) {
        return;
    }

    for (const rawItem of rawItems as RawSuggestionItem[]) {
        const sentenceIndex = normalizeSentenceIndex(rawItem.sentenceIndex);
        const anchorText = normalizeTextField(rawItem.anchorText);
        const title = normalizeTextField(rawItem.title);
        const reason = normalizeTextField(rawItem.reason);
        const suggestedCommentText = normalizeTextField(rawItem.suggestedCommentText);
        const replacementText = normalizeTextField(rawItem.replacementText);

        if (sentenceIndex === null || !anchorText || !title || !reason) {
            continue;
        }

        if (expectedKind === 'comment' && !suggestedCommentText) {
            continue;
        }

        if (expectedKind === 'correction' && !replacementText) {
            continue;
        }

        const range = resolveSuggestionAnchor(sentences, sentenceIndex, anchorText);
        if (!range) {
            continue;
        }

        sink.push({
            id: `${taskNumber}-${expectedFocus}-${expectedKind}-${sentenceIndex}-${sink.length + 1}`,
            taskNumber,
            kind: expectedKind,
            focus: expectedFocus,
            sentenceIndex,
            anchorText,
            from: range.from,
            to: range.to,
            title,
            reason,
            suggestedCommentText: suggestedCommentText || undefined,
            replacementText: replacementText || undefined,
            categoryId: expectedFocus === 'grammar' ? 'gra' : 'lr',
        });
    }
}

function removeDuplicateAndOverlappingSuggestions(items: WritingSuggestionItem[]): WritingSuggestionItem[] {
    const dedupe = new Set<string>();
    const accepted: WritingSuggestionItem[] = [];

    for (const item of items) {
        const dedupeKey = [
            item.taskNumber,
            item.kind,
            item.focus,
            item.sentenceIndex,
            item.anchorText,
        ].join(':');

        if (dedupe.has(dedupeKey)) {
            continue;
        }

        const overlapsExisting = accepted.some((existing) =>
            existing.from < item.to && item.from < existing.to
        );
        if (overlapsExisting) {
            continue;
        }

        dedupe.add(dedupeKey);
        accepted.push(item);
        if (accepted.length >= MAX_SUGGESTIONS_PER_TASK) {
            break;
        }
    }

    return accepted;
}

export function normalizeSuggestionTaskResult(
    task: WritingSubmissionTask,
    rawResponse: unknown
): WritingSuggestionTaskResult {
    const sentences = segmentEssayIntoSentences(task.essayText);
    const result = createEmptyTaskResult(task.taskNumber);
    const taskResult = (rawResponse as RawSuggestionResponse | null)?.tasks?.find((entry) => {
        return normalizeSentenceIndex(entry?.taskNumber) === task.taskNumber;
    });

    if (!taskResult) {
        return result;
    }

    const allItems: WritingSuggestionItem[] = [];
    pushNormalizedItems(taskResult.grammar?.comments, task.taskNumber, 'grammar', 'comment', sentences, allItems);
    pushNormalizedItems(taskResult.grammar?.corrections, task.taskNumber, 'grammar', 'correction', sentences, allItems);
    pushNormalizedItems(taskResult.vocabularyExpression?.comments, task.taskNumber, 'vocabulary-expression', 'comment', sentences, allItems);
    pushNormalizedItems(taskResult.vocabularyExpression?.corrections, task.taskNumber, 'vocabulary-expression', 'correction', sentences, allItems);

    for (const item of removeDuplicateAndOverlappingSuggestions(allItems)) {
        const bucket = item.focus === 'grammar' ? result.grammar : result.vocabularyExpression;
        if (item.kind === 'comment') {
            bucket.comments.push(item);
        } else {
            bucket.corrections.push(item);
        }
    }

    return result;
}

function mapCacheDoc(submissionId: string, value: Record<string, any> | undefined): WritingSuggestionCacheDoc | null {
    if (!value) {
        return null;
    }

    return {
        submissionId,
        status: value.status || 'failed',
        generatedAt: typeof value.generatedAt === 'number' ? value.generatedAt : undefined,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
        error: typeof value.error === 'string' ? value.error : undefined,
        perTask: value.perTask || {},
        generatedFromEssayHashByTask: value.generatedFromEssayHashByTask || {},
    };
}

export async function getWritingSuggestionCache(submissionId: string): Promise<WritingSuggestionCacheDoc | null> {
    const snapshot = await getDoc(getSuggestionCacheRef(submissionId));
    if (!snapshot.exists()) {
        return null;
    }

    return mapCacheDoc(submissionId, snapshot.data() as Record<string, any>);
}

const generateWritingSuggestionCacheGuarded = withRestoreGuard<Result<WritingSuggestionCacheDoc>>(
    'WritingSuggestionGeneration',
    { success: false, error: 'Writing suggestions are unavailable during restore.' },
)(async (submission: WritingSubmission) => {
    const availability = await getAIAvailability();
    if (!availability.available) {
        const failedDoc: WritingSuggestionCacheDoc = {
            submissionId: submission.id,
            status: 'failed',
            updatedAt: Date.now(),
            error: availability.reason || 'AI suggestions are unavailable.',
            perTask: {},
            generatedFromEssayHashByTask: {},
        };

        await setDoc(getSuggestionCacheRef(submission.id), deepRemoveUndefined(failedDoc));
        return { success: true, data: failedDoc };
    }

    const generatedFromEssayHashByTask = submission.tasks.reduce((acc, task) => {
        acc[task.taskNumber] = createEssayHash(task.essayText);
        return acc;
    }, {} as Partial<Record<1 | 2, string>>);

    await setDoc(getSuggestionCacheRef(submission.id), deepRemoveUndefined({
        submissionId: submission.id,
        status: 'generating',
        updatedAt: Date.now(),
        perTask: {},
        generatedFromEssayHashByTask,
    }));

    try {
        const perTask: Partial<Record<1 | 2, WritingSuggestionTaskResult>> = {};

        for (const task of submission.tasks) {
            const generationResult = await aiService.generateStructuredJson(buildTaskPrompt(task), {
                systemInstruction: WRITING_SUGGESTION_SYSTEM_INSTRUCTION,
                temperature: 0.1,
                maxOutputTokens: 4096,
            });

            if (!generationResult.success) {
                throw new Error(generationResult.error);
            }

            perTask[task.taskNumber] = normalizeSuggestionTaskResult(task, generationResult.data);
        }

        const readyDoc: WritingSuggestionCacheDoc = {
            submissionId: submission.id,
            status: 'ready',
            generatedAt: Date.now(),
            updatedAt: Date.now(),
            perTask,
            generatedFromEssayHashByTask,
        };

        await setDoc(getSuggestionCacheRef(submission.id), deepRemoveUndefined(readyDoc));
        return { success: true, data: readyDoc };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate writing suggestions.';
        const failedDoc: WritingSuggestionCacheDoc = {
            submissionId: submission.id,
            status: 'failed',
            updatedAt: Date.now(),
            error: message,
            perTask: {},
            generatedFromEssayHashByTask,
        };

        await setDoc(getSuggestionCacheRef(submission.id), deepRemoveUndefined(failedDoc));
        return { success: true, data: failedDoc };
    }
});

export async function getOrCreateWritingSuggestionCache(
    submission: WritingSubmission,
    options: { force?: boolean } = {}
): Promise<Result<WritingSuggestionCacheDoc>> {
    if (!options.force) {
        const existing = await getWritingSuggestionCache(submission.id);
        if (existing) {
            return { success: true, data: existing };
        }
    }

    return generateWritingSuggestionCacheGuarded(submission);
}
