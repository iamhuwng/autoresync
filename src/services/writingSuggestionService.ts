import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
// @ts-ignore - JS service file
import { firestore as db } from './firebase';
import { deepRemoveUndefined } from './draftCloudService';
import { withRestoreGuard } from './restoreGuard';
import { aiService } from './ai/router.service';
import { getAIAvailability } from './ai-status.service';
import {
    acquireGeminiSuggestionKeyLeases,
    getUsableGeminiSuggestionKeyCount,
    releaseGeminiSuggestionKeyLeases,
} from './ai/writingSuggestionKeyLease.service';
import type { Result } from '../types/result.types';
import type {
    CommentCategoryId,
    WritingSubmission,
    WritingSubmissionTask,
    WritingSuggestionBucketDiagnostic,
    WritingSuggestionBucketId,
    WritingSuggestionCacheDoc,
    WritingSuggestionDiagnosticsByTask,
    WritingSuggestionDropReason,
    WritingSuggestionFocus,
    WritingSuggestionGenerationLease,
    WritingSuggestionGenerationSource,
    WritingSuggestionIssueFamily,
    WritingSuggestionItem,
    WritingSuggestionItemSet,
    WritingSuggestionKind,
    WritingSuggestionReviewStateByTask,
    WritingSuggestionReviewStatus,
    WritingSuggestionRunArtifact,
    WritingSuggestionRunScope,
    WritingSuggestionRunStateByTask,
    WritingSuggestionTaskResult,
    WritingSuggestionTaskRunState,
} from '../types/ielts-writing.types';
import type {
    WritingSuggestionBatchRequest,
    WritingSuggestionBatchResponse,
    WritingSuggestionFinding,
    WritingSuggestionLedgerItem,
    WritingSuggestionParagraphInput,
    WritingSuggestionScope,
} from './ai/ai.service';

const WRITING_SUGGESTION_CACHE_COLLECTION = 'writing_grading_ai_cache';
const WRITING_SUGGESTION_ARTIFACTS_SUBCOLLECTION = 'generation_runs';
const WRITING_SUGGESTION_PROMPT_VERSION = 'v5';
const WRITING_SUGGESTION_RUN_CAP = 64;
const WRITING_SUGGESTION_SPLIT_SCOPE_CAP = 16;
const WRITING_SUGGESTION_STALE_LEASE_MS = 2 * 60 * 1000;
const WRITING_SUGGESTION_ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000;
const WRITING_SUGGESTION_COMBINED_TOKEN_BUDGET = 16_384;
const WRITING_SUGGESTION_SPLIT_TOKEN_BUDGET = 8_192;

const VALID_GRAMMAR_FAMILIES = new Set<WritingSuggestionIssueFamily>([
    'tense',
    'agreement',
    'article',
    'plural',
    'preposition',
    'punctuation',
    'sentence-structure',
    'capitalization',
    'pronoun',
]);

const VALID_VOCABULARY_FAMILIES = new Set<WritingSuggestionIssueFamily>([
    'word-choice',
    'collocation',
    'word-form',
    'spelling',
    'register',
    'awkward-phrase',
    'task1-reporting',
]);

interface SentenceSegment {
    index: number;
    text: string;
    start: number;
    end: number;
    paragraphIndex: number;
}

interface NormalizedSuggestionTaskResult {
    taskResult: WritingSuggestionTaskResult;
    diagnosticsByBucket: Partial<Record<WritingSuggestionBucketId, WritingSuggestionBucketDiagnostic>>;
}

interface NormalizationContext {
    task: WritingSubmissionTask;
    sentences: SentenceSegment[];
    currentTaskResult?: WritingSuggestionTaskResult;
    currentReviewState?: Record<string, WritingSuggestionReviewStatus>;
}

interface NormalizationResult {
    taskResult: WritingSuggestionTaskResult;
    diagnosticsByBucket: Partial<Record<WritingSuggestionBucketId, WritingSuggestionBucketDiagnostic>>;
    acceptedCount: number;
    droppedByReason: Partial<Record<WritingSuggestionDropReason, number>>;
}

interface GenerateTaskSuggestionsOptions {
    taskNumber: 1 | 2;
    force?: boolean;
    source?: WritingSuggestionGenerationSource;
    sessionId?: string;
}

interface WritingSuggestionAttemptPlan {
    scope: WritingSuggestionScope;
    maxFindings: number;
    preferredKeyIndex?: number;
    keyLeaseId?: string | null;
    tokenBudget: number;
}

function createRunId() {
    return `wsr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createAttemptId(scope: WritingSuggestionScope) {
    return `${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSuggestionCacheRef(submissionId: string) {
    return doc(db, WRITING_SUGGESTION_CACHE_COLLECTION, submissionId);
}

function getSuggestionArtifactRef(submissionId: string, runId: string, attemptId: string) {
    return doc(collection(getSuggestionCacheRef(submissionId), WRITING_SUGGESTION_ARTIFACTS_SUBCOLLECTION), `${runId}__${attemptId}`);
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

function createEmptyBucketDiagnostic(): WritingSuggestionBucketDiagnostic {
    return {
        rawItemCount: 0,
        acceptedItemCount: 0,
        droppedItemCount: 0,
        droppedByReason: {},
    };
}

function incrementDroppedReason(
    diagnostics: WritingSuggestionBucketDiagnostic,
    droppedByReason: Partial<Record<WritingSuggestionDropReason, number>>,
    reason: WritingSuggestionDropReason,
) {
    diagnostics.droppedItemCount += 1;
    diagnostics.droppedByReason[reason] = (diagnostics.droppedByReason[reason] || 0) + 1;
    droppedByReason[reason] = (droppedByReason[reason] || 0) + 1;
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
    const paragraphs = essayText.split(/\n{2,}/);
    const segments: SentenceSegment[] = [];
    let cursor = 0;

    paragraphs.forEach((paragraph, paragraphIndex) => {
        const paragraphStart = essayText.indexOf(paragraph, cursor);
        cursor = paragraphStart + paragraph.length;

        const punctuation = new Set(['.', '!', '?']);
        const closers = new Set(['"', '\'', ')', ']', '}', '\u201d']);
        let sentenceStart = paragraphStart;
        const paragraphEnd = paragraphStart + paragraph.length;

        while (sentenceStart < paragraphEnd && /\s/.test(essayText[sentenceStart] || '')) {
            sentenceStart += 1;
        }

        for (let index = sentenceStart; index < paragraphEnd; index += 1) {
            const current = essayText[index] || '';
            if (!punctuation.has(current)) {
                continue;
            }

            let sentenceEnd = index + 1;
            while (sentenceEnd < paragraphEnd && closers.has(essayText[sentenceEnd] || '')) {
                sentenceEnd += 1;
            }

            const nextChar = essayText[sentenceEnd];
            if (sentenceEnd < paragraphEnd && nextChar && !/\s/.test(nextChar)) {
                continue;
            }

            const text = essayText.slice(sentenceStart, sentenceEnd);
            if (text.trim()) {
                segments.push({
                    index: segments.length,
                    text,
                    start: sentenceStart,
                    end: sentenceEnd,
                    paragraphIndex,
                });
            }

            sentenceStart = sentenceEnd;
            while (sentenceStart < paragraphEnd && /\s/.test(essayText[sentenceStart] || '')) {
                sentenceStart += 1;
            }
            index = sentenceStart - 1;
        }

        if (sentenceStart < paragraphEnd) {
            const text = essayText.slice(sentenceStart, paragraphEnd);
            if (text.trim()) {
                segments.push({
                    index: segments.length,
                    text,
                    start: sentenceStart,
                    end: paragraphEnd,
                    paragraphIndex,
                });
            }
        }
    });

    return segments;
}

function buildEssayParagraphs(sentences: SentenceSegment[]): WritingSuggestionParagraphInput[] {
    const grouped = new Map<number, WritingSuggestionParagraphInput>();
    for (const sentence of sentences) {
        const paragraph = grouped.get(sentence.paragraphIndex) || {
            paragraphIndex: sentence.paragraphIndex,
            sentences: [],
        };
        paragraph.sentences.push({
            sentenceIndex: sentence.index,
            text: sentence.text,
        });
        grouped.set(sentence.paragraphIndex, paragraph);
    }

    return [...grouped.values()].sort((left, right) => left.paragraphIndex - right.paragraphIndex);
}

export function inferTask1SuggestionType(task: WritingSubmissionTask): 'Academic' | 'GeneralTraining' {
    const prompt = `${task.promptText}\n${task.essayText}`.toLowerCase();
    const generalTrainingSignals = [
        'write a letter',
        'formal letter',
        'informal letter',
        'semi-formal',
        'dear ',
        'friend',
    ];

    return generalTrainingSignals.some((signal) => prompt.includes(signal))
        ? 'GeneralTraining'
        : 'Academic';
}

export function resolveSuggestionAnchor(
    sentences: SentenceSegment[],
    sentenceIndex: number,
    anchorText: string,
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

    const offset = matches[0];
    if (offset === undefined) {
        return null;
    }

    return {
        from: sentence.start + offset,
        to: sentence.start + offset + anchorText.length,
    };
}

function resolveAnchorStatus(
    sentences: SentenceSegment[],
    sentenceIndex: number,
    anchorText: string,
): 'resolved' | 'not-found' | 'ambiguous' {
    const sentence = sentences[sentenceIndex];
    if (!sentence || !anchorText) {
        return 'not-found';
    }

    let matches = 0;
    let searchIndex = sentence.text.indexOf(anchorText);
    while (searchIndex !== -1) {
        matches += 1;
        searchIndex = sentence.text.indexOf(anchorText, searchIndex + anchorText.length);
    }

    if (matches === 1) {
        return 'resolved';
    }

    return matches === 0 ? 'not-found' : 'ambiguous';
}

function getSuggestionBucketId(focus: WritingSuggestionFocus, kind: WritingSuggestionKind): WritingSuggestionBucketId {
    if (focus === 'grammar') {
        return kind === 'comment' ? 'grammar-comments' : 'grammar-corrections';
    }

    return kind === 'comment' ? 'vocabulary-comments' : 'vocabulary-corrections';
}

function getSuggestionCategoryId(focus: WritingSuggestionFocus): CommentCategoryId {
    return focus === 'grammar' ? 'gra' : 'lr';
}

function normalizeIssueFamily(value: unknown): WritingSuggestionIssueFamily | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim() as WritingSuggestionIssueFamily;
    return [...VALID_GRAMMAR_FAMILIES, ...VALID_VOCABULARY_FAMILIES].includes(normalized)
        ? normalized
        : null;
}

function isIssueFamilyValidForFocus(focus: WritingSuggestionFocus, family: WritingSuggestionIssueFamily) {
    return focus === 'grammar'
        ? VALID_GRAMMAR_FAMILIES.has(family)
        : VALID_VOCABULARY_FAMILIES.has(family);
}

function shouldKeepCorrection(anchorText: string, replacementText?: string) {
    if (!replacementText) {
        return false;
    }

    const trimmed = replacementText.trim();
    if (!trimmed || trimmed === anchorText.trim()) {
        return false;
    }

    return trimmed.split(/\s+/).length <= 4;
}

function buildSuggestedCommentText(
    finding: WritingSuggestionFinding,
    kind: WritingSuggestionKind,
): string | undefined {
    if (kind !== 'comment') {
        return undefined;
    }

    if (finding.replacementText && shouldKeepCorrection(finding.anchorText, finding.replacementText)) {
        return `Consider revising this to "${finding.replacementText.trim()}" here.`;
    }

    return finding.reason.trim() || `Review this ${finding.focus === 'grammar' ? 'grammar' : 'wording'} issue.`;
}

function createReviewKey(item: Pick<
    WritingSuggestionItem,
    'taskNumber' | 'focus' | 'kind' | 'sentenceIndex' | 'anchorText' | 'issueFamily' | 'title'
> & { proposal?: string }) {
    return [
        item.taskNumber,
        item.focus,
        item.kind,
        item.sentenceIndex,
        item.anchorText,
        item.issueFamily,
        item.title,
        item.proposal || '',
    ].join('::');
}

function createSuggestionItem(
    taskNumber: 1 | 2,
    finding: WritingSuggestionFinding,
    range: { from: number; to: number },
): WritingSuggestionItem {
    const kind: WritingSuggestionKind = shouldKeepCorrection(finding.anchorText, finding.replacementText)
        ? finding.kind
        : 'comment';
    const suggestedCommentText = buildSuggestedCommentText(finding, kind);
    const proposal = kind === 'correction'
        ? finding.replacementText?.trim()
        : suggestedCommentText;
    const reviewKey = createReviewKey({
        taskNumber,
        focus: finding.focus,
        kind,
        sentenceIndex: finding.sentenceIndex,
        anchorText: finding.anchorText,
        issueFamily: finding.issueFamily,
        title: finding.title,
        proposal,
    });

    return {
        id: reviewKey,
        reviewKey,
        reviewStatus: 'pending',
        taskNumber,
        kind,
        focus: finding.focus,
        issueFamily: finding.issueFamily,
        confidence: Math.max(0, Math.min(100, Number.isFinite(finding.confidence) ? Math.round(finding.confidence) : 50)),
        sentenceIndex: finding.sentenceIndex,
        anchorText: finding.anchorText,
        from: range.from,
        to: range.to,
        title: finding.title.trim(),
        reason: finding.reason.trim(),
        suggestedCommentText,
        replacementText: kind === 'correction' ? finding.replacementText?.trim() : undefined,
        categoryId: getSuggestionCategoryId(finding.focus),
    };
}

function collectTaskSuggestions(taskResult?: WritingSuggestionTaskResult | null): WritingSuggestionItem[] {
    if (!taskResult) {
        return [];
    }

    return [
        ...taskResult.grammar.comments,
        ...taskResult.grammar.corrections,
        ...taskResult.vocabularyExpression.comments,
        ...taskResult.vocabularyExpression.corrections,
    ];
}

function sortSuggestions(items: WritingSuggestionItem[]) {
    return [...items].sort((left, right) => {
        if (left.sentenceIndex !== right.sentenceIndex) {
            return left.sentenceIndex - right.sentenceIndex;
        }
        if (left.from !== right.from) {
            return left.from - right.from;
        }
        return left.title.localeCompare(right.title);
    });
}

function buildTaskResultFromSuggestions(taskNumber: 1 | 2, items: WritingSuggestionItem[]): WritingSuggestionTaskResult {
    const result = createEmptyTaskResult(taskNumber);
    for (const item of items) {
        if (item.focus === 'grammar') {
            if (item.kind === 'comment') {
                result.grammar.comments.push(item);
            } else {
                result.grammar.corrections.push(item);
            }
        } else if (item.kind === 'comment') {
            result.vocabularyExpression.comments.push(item);
        } else {
            result.vocabularyExpression.corrections.push(item);
        }
    }

    result.grammar.comments = sortSuggestions(result.grammar.comments);
    result.grammar.corrections = sortSuggestions(result.grammar.corrections);
    result.vocabularyExpression.comments = sortSuggestions(result.vocabularyExpression.comments);
    result.vocabularyExpression.corrections = sortSuggestions(result.vocabularyExpression.corrections);
    return result;
}

function applyReviewStateToTaskResult(
    taskResult: WritingSuggestionTaskResult,
    reviewState: Record<string, WritingSuggestionReviewStatus> | undefined,
): WritingSuggestionTaskResult {
    const apply = (items: WritingSuggestionItem[]) => items.map((item) => ({
        ...item,
        reviewStatus: reviewState?.[item.reviewKey] || 'pending',
    }));

    return {
        taskNumber: taskResult.taskNumber,
        grammar: {
            comments: apply(taskResult.grammar.comments),
            corrections: apply(taskResult.grammar.corrections),
        },
        vocabularyExpression: {
            comments: apply(taskResult.vocabularyExpression.comments),
            corrections: apply(taskResult.vocabularyExpression.corrections),
        },
    };
}

function mergeReviewStateForTask(
    items: WritingSuggestionItem[],
    existingState?: Record<string, WritingSuggestionReviewStatus>,
): Record<string, WritingSuggestionReviewStatus> {
    const nextState: Record<string, WritingSuggestionReviewStatus> = {};
    for (const item of items) {
        nextState[item.reviewKey] = existingState?.[item.reviewKey] || item.reviewStatus || 'pending';
    }
    return nextState;
}

function createRunState(
    status: WritingSuggestionTaskRunState['status'],
    updatedAt: number,
    overrides: Partial<WritingSuggestionTaskRunState> = {},
): WritingSuggestionTaskRunState {
    return {
        status,
        updatedAt,
        acceptedCount: overrides.acceptedCount ?? 0,
        ...overrides,
    };
}

function createGeneratingLease(runId: string, sessionId: string, phase: string, now: number): WritingSuggestionGenerationLease {
    return {
        runId,
        ownerSessionId: sessionId,
        startedAt: now,
        heartbeatAt: now,
        phase,
    };
}

function isRunStateStale(runState?: WritingSuggestionTaskRunState | null) {
    if (!runState?.lease || runState.status !== 'generating') {
        return false;
    }

    return Date.now() - runState.lease.heartbeatAt > WRITING_SUGGESTION_STALE_LEASE_MS;
}

function deriveCacheStatus(runState?: WritingSuggestionTaskRunState): WritingSuggestionCacheDoc['status'] {
    switch (runState?.status) {
        case 'generating':
            return 'generating';
        case 'failed':
            return 'failed';
        case 'incomplete':
            return 'incomplete';
        case 'interrupted':
            return 'interrupted';
        default:
            return 'ready';
    }
}

function normalizeRawReviewStateByTask(
    value: unknown,
): WritingSuggestionReviewStateByTask {
    if (!value || typeof value !== 'object') {
        return {};
    }

    const next: WritingSuggestionReviewStateByTask = {};
    for (const [taskKey, rawState] of Object.entries(value as Record<string, unknown>)) {
        const taskNumber = Number(taskKey);
        if ((taskNumber !== 1 && taskNumber !== 2) || !rawState || typeof rawState !== 'object') {
            continue;
        }

        next[taskNumber as 1 | 2] = Object.entries(rawState as Record<string, unknown>).reduce((acc, [reviewKey, status]) => {
            if (status === 'pending' || status === 'approved' || status === 'dismissed') {
                acc[reviewKey] = status;
            }
            return acc;
        }, {} as Record<string, WritingSuggestionReviewStatus>);
    }

    return next;
}

function normalizeDiagnosticsByTask(value: unknown): WritingSuggestionDiagnosticsByTask {
    if (!value || typeof value !== 'object') {
        return {};
    }

    return value as WritingSuggestionDiagnosticsByTask;
}

function normalizeRunStateByTask(value: unknown): WritingSuggestionRunStateByTask {
    if (!value || typeof value !== 'object') {
        return {};
    }

    return value as WritingSuggestionRunStateByTask;
}

function mapCacheDoc(submissionId: string, value: Record<string, unknown>): WritingSuggestionCacheDoc {
    return {
        submissionId,
        status: (value.status as WritingSuggestionCacheDoc['status']) || 'ready',
        generatedAt: typeof value.generatedAt === 'number' ? value.generatedAt : undefined,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
        error: typeof value.error === 'string' ? value.error : undefined,
        perTask: (value.perTask as WritingSuggestionCacheDoc['perTask']) || {},
        generatedFromEssayHashByTask: (value.generatedFromEssayHashByTask as WritingSuggestionCacheDoc['generatedFromEssayHashByTask']) || {},
        reviewStateByTask: normalizeRawReviewStateByTask(value.reviewStateByTask),
        diagnosticsByTask: normalizeDiagnosticsByTask(value.diagnosticsByTask),
        runStateByTask: normalizeRunStateByTask(value.runStateByTask),
    };
}

async function persistSuggestionArtifact(
    submissionId: string,
    artifact: WritingSuggestionRunArtifact,
): Promise<void> {
    await setDoc(getSuggestionArtifactRef(submissionId, artifact.runId, artifact.attemptId), deepRemoveUndefined(artifact));
}

async function persistCacheDoc(cache: WritingSuggestionCacheDoc): Promise<void> {
    await setDoc(getSuggestionCacheRef(cache.submissionId), deepRemoveUndefined(cache));
}

function createSuggestionLedger(taskResult?: WritingSuggestionTaskResult): WritingSuggestionLedgerItem[] {
    return collectTaskSuggestions(taskResult).map((item) => ({
        focus: item.focus,
        kind: item.kind,
        sentenceIndex: item.sentenceIndex,
        anchorText: item.anchorText,
        issueFamily: item.issueFamily,
        title: item.title,
        replacementText: item.replacementText,
    }));
}

function buildSuggestionRequest(
    task: WritingSubmissionTask,
    scope: WritingSuggestionScope,
    maxFindings: number,
    priorFindingsLedger: WritingSuggestionLedgerItem[],
    sentences: SentenceSegment[],
): WritingSuggestionBatchRequest {
    return {
        taskPrompt: task.promptText,
        essay: {
            taskNumber: task.taskNumber,
            paragraphs: buildEssayParagraphs(sentences),
        },
        scope,
        maxFindings,
        priorFindingsLedger,
    };
}

function parseScopeFocus(scope: WritingSuggestionScope): WritingSuggestionFocus | null {
    if (scope.startsWith('grammar')) {
        return 'grammar';
    }
    if (scope.startsWith('vocabulary')) {
        return 'vocabulary-expression';
    }
    return null;
}

function parseScopeKind(scope: WritingSuggestionScope): WritingSuggestionKind | null {
    if (scope.endsWith('correction')) {
        return 'correction';
    }
    if (scope.endsWith('improvement')) {
        return 'comment';
    }
    return null;
}

function normalizeFindingsForTask(
    findings: unknown[],
    context: NormalizationContext,
): NormalizationResult {
    const existingSuggestions = collectTaskSuggestions(context.currentTaskResult);
    const suggestionMap = new Map(existingSuggestions.map((item) => [item.reviewKey, item]));
    const droppedByReason: Partial<Record<WritingSuggestionDropReason, number>> = {};
    const diagnosticsByBucket: Partial<Record<WritingSuggestionBucketId, WritingSuggestionBucketDiagnostic>> = {
        'grammar-comments': createEmptyBucketDiagnostic(),
        'grammar-corrections': createEmptyBucketDiagnostic(),
        'vocabulary-comments': createEmptyBucketDiagnostic(),
        'vocabulary-corrections': createEmptyBucketDiagnostic(),
    };
    let acceptedCount = 0;

    for (const rawFinding of findings) {
        const candidate = rawFinding as Partial<WritingSuggestionFinding>;
        const focus = candidate.focus;
        const kind = candidate.kind;
        const issueFamily = normalizeIssueFamily(candidate.issueFamily);

        if (focus !== 'grammar' && focus !== 'vocabulary-expression') {
            incrementDroppedReason(diagnosticsByBucket['grammar-comments']!, droppedByReason, 'invalid-focus');
            continue;
        }

        if (kind !== 'comment' && kind !== 'correction') {
            incrementDroppedReason(diagnosticsByBucket[getSuggestionBucketId(focus, 'comment')]!, droppedByReason, 'invalid-kind');
            continue;
        }

        if (!issueFamily || !isIssueFamilyValidForFocus(focus, issueFamily)) {
            incrementDroppedReason(diagnosticsByBucket[getSuggestionBucketId(focus, kind)]!, droppedByReason, 'invalid-issue-family');
            continue;
        }

        const bucketId = getSuggestionBucketId(focus, kind);
        const bucketDiagnostics = diagnosticsByBucket[bucketId]!;
        bucketDiagnostics.rawItemCount += 1;

        if (
            typeof candidate.sentenceIndex !== 'number'
            || typeof candidate.anchorText !== 'string'
            || typeof candidate.title !== 'string'
            || typeof candidate.reason !== 'string'
        ) {
            incrementDroppedReason(bucketDiagnostics, droppedByReason, 'missing-required-fields');
            continue;
        }

        const anchorStatus = resolveAnchorStatus(context.sentences, candidate.sentenceIndex, candidate.anchorText);
        if (anchorStatus === 'not-found') {
            incrementDroppedReason(bucketDiagnostics, droppedByReason, 'anchor-not-found');
            continue;
        }
        if (anchorStatus === 'ambiguous') {
            incrementDroppedReason(bucketDiagnostics, droppedByReason, 'anchor-ambiguous');
            continue;
        }

        const range = resolveSuggestionAnchor(context.sentences, candidate.sentenceIndex, candidate.anchorText);
        if (!range) {
            incrementDroppedReason(bucketDiagnostics, droppedByReason, 'anchor-not-found');
            continue;
        }

        const suggestion = createSuggestionItem(context.task.taskNumber, {
            focus,
            kind,
            sentenceIndex: candidate.sentenceIndex,
            anchorText: candidate.anchorText,
            issueFamily,
            title: candidate.title,
            reason: candidate.reason,
            replacementText: typeof candidate.replacementText === 'string' ? candidate.replacementText : undefined,
            confidence: typeof candidate.confidence === 'number' ? candidate.confidence : 50,
        }, range);

        if (suggestionMap.has(suggestion.reviewKey)) {
            incrementDroppedReason(bucketDiagnostics, droppedByReason, 'duplicate');
            continue;
        }

        suggestion.reviewStatus = context.currentReviewState?.[suggestion.reviewKey] || 'pending';
        suggestionMap.set(suggestion.reviewKey, suggestion);
        bucketDiagnostics.acceptedItemCount += 1;
        acceptedCount += 1;
    }

    return {
        taskResult: applyReviewStateToTaskResult(
            buildTaskResultFromSuggestions(context.task.taskNumber, [...suggestionMap.values()]),
            mergeReviewStateForTask([...suggestionMap.values()], context.currentReviewState),
        ),
        diagnosticsByBucket,
        acceptedCount,
        droppedByReason,
    };
}

export function normalizeSuggestionTaskResult(
    task: WritingSubmissionTask,
    rawResults: Partial<Record<WritingSuggestionRunScope | WritingSuggestionFocus, unknown>>,
): NormalizedSuggestionTaskResult {
    const findings = Object.entries(rawResults).flatMap(([key, value]) => {
        if (!Array.isArray(value)) {
            return [];
        }

        return value.map((entry) => {
            const candidate = entry as Partial<WritingSuggestionFinding> & Record<string, unknown>;
            const inferredFocus: WritingSuggestionFocus =
                key.startsWith('vocabulary')
                || key === 'vocabulary-expression'
                    ? 'vocabulary-expression'
                    : 'grammar';
            const inferredKind: WritingSuggestionKind =
                key.endsWith('corrections') || key.endsWith('correction')
                    ? 'correction'
                    : key.endsWith('comments') || key.endsWith('improvement')
                        ? 'comment'
                        : typeof candidate.replacementText === 'string' && candidate.replacementText.trim()
                            ? 'correction'
                            : 'comment';

            return {
                ...candidate,
                focus: candidate.focus || inferredFocus,
                kind: candidate.kind || inferredKind,
                issueFamily: candidate.issueFamily || (inferredFocus === 'grammar' ? 'agreement' : 'word-choice'),
                confidence: typeof candidate.confidence === 'number' ? candidate.confidence : 80,
            };
        });
    });
    const normalized = normalizeFindingsForTask(findings, {
        task,
        sentences: segmentEssayIntoSentences(task.essayText),
    });

    return {
        taskResult: normalized.taskResult,
        diagnosticsByBucket: normalized.diagnosticsByBucket,
    };
}

export async function getWritingSuggestionCache(submissionId: string): Promise<WritingSuggestionCacheDoc | null> {
    const snapshot = await getDoc(getSuggestionCacheRef(submissionId));
    if (!snapshot.exists()) {
        return null;
    }

    return mapCacheDoc(submissionId, snapshot.data() as Record<string, unknown>);
}

async function recoverStaleRunIfNeeded(
    cache: WritingSuggestionCacheDoc,
    taskNumber: 1 | 2,
): Promise<WritingSuggestionCacheDoc> {
    const runState = cache.runStateByTask?.[taskNumber];
    if (!isRunStateStale(runState)) {
        return cache;
    }

    const nextRunStateByTask: WritingSuggestionRunStateByTask = {
        ...(cache.runStateByTask || {}),
        [taskNumber]: createRunState('interrupted', Date.now(), {
            runId: runState?.runId,
            phase: runState?.phase,
            acceptedCount: runState?.acceptedCount || 0,
            lastRunAcceptedCount: runState?.lastRunAcceptedCount,
            lastRunHasMorePotential: runState?.lastRunHasMorePotential ?? null,
            lastRunSource: runState?.lastRunSource,
            error: 'Suggestion generation was interrupted before completion.',
            lease: null,
        }),
    };

    const next: WritingSuggestionCacheDoc = {
        ...cache,
        status: 'interrupted',
        updatedAt: Date.now(),
        runStateByTask: nextRunStateByTask,
        error: 'Suggestion generation was interrupted before completion.',
    };

    await persistCacheDoc(next);
    return next;
}

async function writeGeneratingState(
    cache: WritingSuggestionCacheDoc,
    taskNumber: 1 | 2,
    runId: string,
    source: WritingSuggestionGenerationSource,
    sessionId: string,
    phase: string,
): Promise<WritingSuggestionCacheDoc> {
    const now = Date.now();
    const next: WritingSuggestionCacheDoc = {
        ...cache,
        status: 'generating',
        updatedAt: now,
        error: undefined,
        runStateByTask: {
            ...(cache.runStateByTask || {}),
            [taskNumber]: createRunState('generating', now, {
                runId,
                phase,
                acceptedCount: 0,
                lastRunSource: source,
                lastRunHasMorePotential: null,
                lease: createGeneratingLease(runId, sessionId, phase, now),
            }),
        },
    };

    await persistCacheDoc(next);
    return next;
}

async function updateRunHeartbeat(
    cache: WritingSuggestionCacheDoc,
    taskNumber: 1 | 2,
    phase: string,
    acceptedCount: number,
): Promise<WritingSuggestionCacheDoc> {
    const runState = cache.runStateByTask?.[taskNumber];
    if (!runState?.lease) {
        return cache;
    }

    const now = Date.now();
    const next: WritingSuggestionCacheDoc = {
        ...cache,
        updatedAt: now,
        runStateByTask: {
            ...(cache.runStateByTask || {}),
            [taskNumber]: {
                ...runState,
                updatedAt: now,
                phase,
                acceptedCount,
                lease: {
                    ...runState.lease,
                    heartbeatAt: now,
                    phase,
                },
            },
        },
    };

    await persistCacheDoc(next);
    return next;
}

async function finalizeRunState(
    cache: WritingSuggestionCacheDoc,
    taskNumber: 1 | 2,
    status: WritingSuggestionTaskRunState['status'],
    acceptedCount: number,
    hasMorePotential: boolean | null,
    error?: string,
): Promise<WritingSuggestionCacheDoc> {
    const now = Date.now();
    const previous = cache.runStateByTask?.[taskNumber];
    const nextRunState = createRunState(status, now, {
        runId: previous?.runId,
        phase: previous?.phase,
        acceptedCount,
        lastRunAcceptedCount: acceptedCount,
        lastRunHasMorePotential: hasMorePotential,
        lastRunSource: previous?.lastRunSource,
        error,
        lease: null,
    });

    const next: WritingSuggestionCacheDoc = {
        ...cache,
        status: deriveCacheStatus(nextRunState),
        updatedAt: now,
        error,
        generatedAt: status === 'complete' || status === 'incomplete' ? now : cache.generatedAt,
        runStateByTask: {
            ...(cache.runStateByTask || {}),
            [taskNumber]: nextRunState,
        },
    };

    await persistCacheDoc(next);
    return next;
}

function appendTaskResult(
    task: WritingSubmissionTask,
    current: WritingSuggestionTaskResult | undefined,
    normalized: NormalizationResult,
    currentReviewState?: Record<string, WritingSuggestionReviewStatus>,
): { taskResult: WritingSuggestionTaskResult; reviewState: Record<string, WritingSuggestionReviewStatus> } {
    const mergedSuggestions = collectTaskSuggestions(current);
    const newSuggestions = collectTaskSuggestions(normalized.taskResult);
    const map = new Map<string, WritingSuggestionItem>();
    for (const suggestion of [...mergedSuggestions, ...newSuggestions]) {
        map.set(suggestion.reviewKey, suggestion);
    }

    const mergedItems = [...map.values()];
    const reviewState = mergeReviewStateForTask(mergedItems, currentReviewState);
    return {
        taskResult: applyReviewStateToTaskResult(buildTaskResultFromSuggestions(task.taskNumber, mergedItems), reviewState),
        reviewState,
    };
}

function createBaseCacheDoc(submission: WritingSubmission, existing?: WritingSuggestionCacheDoc | null): WritingSuggestionCacheDoc {
    return {
        submissionId: submission.id,
        status: existing?.status || 'ready',
        generatedAt: existing?.generatedAt,
        updatedAt: Date.now(),
        error: existing?.error,
        perTask: existing?.perTask || {},
        generatedFromEssayHashByTask: existing?.generatedFromEssayHashByTask || {},
        reviewStateByTask: existing?.reviewStateByTask || {},
        diagnosticsByTask: existing?.diagnosticsByTask || {},
        runStateByTask: existing?.runStateByTask || {},
    };
}

function buildCombinedAttemptPlan(): WritingSuggestionAttemptPlan {
    return {
        scope: 'combined',
        maxFindings: WRITING_SUGGESTION_RUN_CAP,
        tokenBudget: WRITING_SUGGESTION_COMBINED_TOKEN_BUDGET,
    };
}

async function buildSplitAttemptPlans(): Promise<WritingSuggestionAttemptPlan[]> {
    const leases = await acquireGeminiSuggestionKeyLeases(4);
    const scopes: WritingSuggestionScope[] = [
        'grammar-correction',
        'grammar-improvement',
        'vocabulary-correction',
        'vocabulary-improvement',
    ];

    if (leases.length === 4) {
        return scopes.map((scope, index) => ({
            scope,
            maxFindings: WRITING_SUGGESTION_SPLIT_SCOPE_CAP,
            preferredKeyIndex: leases[index]?.preferredKeyIndex,
            keyLeaseId: leases[index]?.leaseId || null,
            tokenBudget: WRITING_SUGGESTION_SPLIT_TOKEN_BUDGET,
        }));
    }

    return scopes.map((scope) => ({
        scope,
        maxFindings: WRITING_SUGGESTION_SPLIT_SCOPE_CAP,
        tokenBudget: WRITING_SUGGESTION_SPLIT_TOKEN_BUDGET,
    }));
}

async function runSuggestionAttempt(
    submissionId: string,
    task: WritingSubmissionTask,
    source: WritingSuggestionGenerationSource,
    runId: string,
    priorFindingsLedger: WritingSuggestionLedgerItem[],
    sentences: SentenceSegment[],
    plan: WritingSuggestionAttemptPlan,
): Promise<Result<WritingSuggestionBatchResponse & { scope: WritingSuggestionScope; attemptId: string }>> {
    const request = buildSuggestionRequest(task, plan.scope, plan.maxFindings, priorFindingsLedger, sentences);
    const attemptId = createAttemptId(plan.scope);
    const result = await aiService.generateWritingSuggestionBatch(request, {
        maxOutputTokens: plan.tokenBudget,
        preferredKeyIndex: plan.preferredKeyIndex,
        keyLeaseId: plan.keyLeaseId,
    });

    if (!result.success || !result.data) {
        await persistSuggestionArtifact(submissionId, {
            taskNumber: task.taskNumber,
            runId,
            attemptId,
            source,
            scope: plan.scope,
            provider: undefined,
            model: undefined,
            keyLeaseId: plan.keyLeaseId ?? null,
            promptVersion: WRITING_SUGGESTION_PROMPT_VERSION,
            tokenBudget: plan.tokenBudget,
            rawPrompt: JSON.stringify(request),
            rawResponse: result.error || '',
            acceptedFindingsCount: 0,
            createdAt: Date.now(),
            expiresAt: Date.now() + WRITING_SUGGESTION_ARTIFACT_TTL_MS,
            hasMorePotential: null,
        });
        return { success: false, error: result.error || 'Suggestion attempt failed.' };
    }

    const scopeFocus = parseScopeFocus(plan.scope);
    const scopeKind = parseScopeKind(plan.scope);
    const findings = (result.data.findings || []).map((finding) => ({
        ...finding,
        focus: scopeFocus || finding.focus,
        kind: scopeKind || finding.kind,
    }));

    return {
        success: true,
        data: {
            ...result.data,
            findings,
            scope: plan.scope,
            attemptId,
        },
    };
}

const generateWritingSuggestionCacheGuarded = withRestoreGuard<Result<WritingSuggestionCacheDoc>>(
    'WritingSuggestionGeneration',
    { success: false, error: 'Writing suggestions are unavailable during restore.' },
)(async (
    submission: WritingSubmission,
    existingCache: WritingSuggestionCacheDoc | null = null,
    options: Required<GenerateTaskSuggestionsOptions>,
) => {
    const task = submission.tasks.find((entry) => entry.taskNumber === options.taskNumber);
    if (!task) {
        return { success: false, error: `Task ${options.taskNumber} not found.` };
    }

    const availability = await getAIAvailability();
    if (!availability.available) {
        const failed = createBaseCacheDoc(submission, existingCache);
        failed.status = 'failed';
        failed.updatedAt = Date.now();
        failed.error = availability.reason || 'AI suggestions are unavailable.';
        failed.runStateByTask = {
            ...(failed.runStateByTask || {}),
            [task.taskNumber]: createRunState('failed', Date.now(), {
                acceptedCount: 0,
                lastRunAcceptedCount: 0,
                lastRunHasMorePotential: null,
                lastRunSource: options.source,
                error: failed.error,
            }),
        };
        await persistCacheDoc(failed);
        return { success: true, data: failed };
    }

    const runId = createRunId();
    let cache = createBaseCacheDoc(submission, existingCache);
    cache.generatedFromEssayHashByTask = {
        ...cache.generatedFromEssayHashByTask,
        [task.taskNumber]: createEssayHash(task.essayText),
    };
    cache = await writeGeneratingState(cache, task.taskNumber, runId, options.source, options.sessionId, 'combined-scan');

    const sentences = segmentEssayIntoSentences(task.essayText);
    const currentTaskResult = cache.perTask[task.taskNumber];
    const currentReviewState = cache.reviewStateByTask[task.taskNumber];
    const priorFindingsLedger = createSuggestionLedger(currentTaskResult);
    let acceptedCount = 0;
    let hasMorePotential: boolean | null = null;
    let diagnosticsByBucket = cache.diagnosticsByTask?.[task.taskNumber] || {};
    let latestTaskResult = currentTaskResult;
    let latestReviewState = currentReviewState || {};

    const combinedAttempt = await runSuggestionAttempt(
        submission.id,
        task,
        options.source,
        runId,
        priorFindingsLedger,
        sentences,
        buildCombinedAttemptPlan(),
    );

    if (combinedAttempt.success && combinedAttempt.data) {
        const normalized = normalizeFindingsForTask(combinedAttempt.data.findings as unknown[], {
            task,
            sentences,
            currentTaskResult,
            currentReviewState,
        });
        acceptedCount = normalized.acceptedCount;
        diagnosticsByBucket = normalized.diagnosticsByBucket;
        const appended = appendTaskResult(task, currentTaskResult, normalized, currentReviewState);
        latestTaskResult = appended.taskResult;
        latestReviewState = appended.reviewState;
        hasMorePotential = combinedAttempt.data.hasMorePotential;

        await persistSuggestionArtifact(submission.id, {
            taskNumber: task.taskNumber,
            runId,
            attemptId: combinedAttempt.data.attemptId,
            source: options.source,
            scope: combinedAttempt.data.scope,
            provider: combinedAttempt.data.provider,
            model: combinedAttempt.data.model,
            keyLeaseId: combinedAttempt.data.keyLeaseId ?? null,
            promptVersion: WRITING_SUGGESTION_PROMPT_VERSION,
            tokenBudget: WRITING_SUGGESTION_COMBINED_TOKEN_BUDGET,
            rawPrompt: combinedAttempt.data.rawPrompt,
            rawResponse: combinedAttempt.data.rawResponse,
            repairedParsedJson: combinedAttempt.data.repairedParsedJson,
            acceptedFindingsCount: normalized.acceptedCount,
            droppedByReason: normalized.droppedByReason,
            finishReason: combinedAttempt.data.finishReason,
            usageMetadata: combinedAttempt.data.usageMetadata,
            hasMorePotential,
            createdAt: Date.now(),
            expiresAt: Date.now() + WRITING_SUGGESTION_ARTIFACT_TTL_MS,
        });

        cache.perTask = {
            ...cache.perTask,
            [task.taskNumber]: latestTaskResult,
        };
        cache.reviewStateByTask = {
            ...cache.reviewStateByTask,
            [task.taskNumber]: latestReviewState,
        };
        cache.diagnosticsByTask = {
            ...(cache.diagnosticsByTask || {}),
            [task.taskNumber]: diagnosticsByBucket,
        };
        cache = await updateRunHeartbeat(cache, task.taskNumber, 'combined-complete', acceptedCount);
        cache = await finalizeRunState(cache, task.taskNumber, 'complete', acceptedCount, hasMorePotential);
        cache.perTask = {
            ...cache.perTask,
            [task.taskNumber]: latestTaskResult,
        };
        cache.reviewStateByTask = {
            ...cache.reviewStateByTask,
            [task.taskNumber]: latestReviewState,
        };
        cache.diagnosticsByTask = {
            ...(cache.diagnosticsByTask || {}),
            [task.taskNumber]: diagnosticsByBucket,
        };
        await persistCacheDoc(cache);
        return { success: true, data: cache };
    }

    cache = await updateRunHeartbeat(cache, task.taskNumber, 'split-retry', acceptedCount);
    const splitPlans = await buildSplitAttemptPlans();
    const usableGeminiKeyCount = await getUsableGeminiSuggestionKeyCount();
    const runSplitInParallel = usableGeminiKeyCount >= 4 && splitPlans.some((plan) => typeof plan.preferredKeyIndex === 'number');
    const splitResults = runSplitInParallel
        ? await Promise.allSettled(splitPlans.map((plan) => runSuggestionAttempt(
            submission.id,
            task,
            options.source,
            runId,
            createSuggestionLedger(latestTaskResult),
            sentences,
            plan,
        )))
        : await (async () => {
            const settled: PromiseSettledResult<Result<WritingSuggestionBatchResponse & { scope: WritingSuggestionScope; attemptId: string }>>[] = [];
            for (const plan of splitPlans) {
                try {
                    const result = await runSuggestionAttempt(
                        submission.id,
                        task,
                        options.source,
                        runId,
                        createSuggestionLedger(latestTaskResult),
                        sentences,
                        plan,
                    );
                    settled.push({ status: 'fulfilled', value: result });
                } catch (error) {
                    settled.push({ status: 'rejected', reason: error });
                }
            }
            return settled;
        })();

    releaseGeminiSuggestionKeyLeases(
        splitPlans
            .filter((plan): plan is WritingSuggestionAttemptPlan & { preferredKeyIndex: number; keyLeaseId: string } =>
                typeof plan.preferredKeyIndex === 'number' && typeof plan.keyLeaseId === 'string')
            .map((plan) => ({
                preferredKeyIndex: plan.preferredKeyIndex,
                leaseId: plan.keyLeaseId,
            })),
    );

    let incomplete = false;
    let hasTrustworthyContinuationSignal = false;
    let aggregatedHasMorePotential = false;

    for (const settled of splitResults) {
        if (settled.status !== 'fulfilled' || !settled.value.success || !settled.value.data) {
            incomplete = true;
            continue;
        }

        const attempt = settled.value.data;
        const normalized = normalizeFindingsForTask(attempt.findings as unknown[], {
            task,
            sentences,
            currentTaskResult: latestTaskResult,
            currentReviewState: latestReviewState,
        });
        acceptedCount += normalized.acceptedCount;
        diagnosticsByBucket = {
            ...diagnosticsByBucket,
            ...normalized.diagnosticsByBucket,
        };
        const appended = appendTaskResult(task, latestTaskResult, normalized, latestReviewState);
        latestTaskResult = appended.taskResult;
        latestReviewState = appended.reviewState;
        if (typeof attempt.hasMorePotential === 'boolean') {
            hasTrustworthyContinuationSignal = true;
            aggregatedHasMorePotential = aggregatedHasMorePotential || attempt.hasMorePotential;
        }

        await persistSuggestionArtifact(submission.id, {
            taskNumber: task.taskNumber,
            runId,
            attemptId: attempt.attemptId,
            source: options.source,
            scope: attempt.scope,
            provider: attempt.provider,
            model: attempt.model,
            keyLeaseId: attempt.keyLeaseId ?? null,
            promptVersion: WRITING_SUGGESTION_PROMPT_VERSION,
            tokenBudget: WRITING_SUGGESTION_SPLIT_TOKEN_BUDGET,
            rawPrompt: attempt.rawPrompt,
            rawResponse: attempt.rawResponse,
            repairedParsedJson: attempt.repairedParsedJson,
            acceptedFindingsCount: normalized.acceptedCount,
            droppedByReason: normalized.droppedByReason,
            finishReason: attempt.finishReason,
            usageMetadata: attempt.usageMetadata,
            hasMorePotential: attempt.hasMorePotential,
            createdAt: Date.now(),
            expiresAt: Date.now() + WRITING_SUGGESTION_ARTIFACT_TTL_MS,
        });
    }

    hasMorePotential = hasTrustworthyContinuationSignal ? aggregatedHasMorePotential : null;
    cache.perTask = {
        ...cache.perTask,
        [task.taskNumber]: latestTaskResult || createEmptyTaskResult(task.taskNumber),
    };
    cache.reviewStateByTask = {
        ...cache.reviewStateByTask,
        [task.taskNumber]: latestReviewState,
    };
    cache.diagnosticsByTask = {
        ...(cache.diagnosticsByTask || {}),
        [task.taskNumber]: diagnosticsByBucket,
    };

    cache = await finalizeRunState(
        cache,
        task.taskNumber,
        incomplete ? 'incomplete' : 'complete',
        acceptedCount,
        hasMorePotential,
        incomplete ? 'Suggestion generation completed with partial quadrant failures.' : undefined,
    );
    cache.perTask = {
        ...cache.perTask,
        [task.taskNumber]: latestTaskResult || createEmptyTaskResult(task.taskNumber),
    };
    cache.reviewStateByTask = {
        ...cache.reviewStateByTask,
        [task.taskNumber]: latestReviewState,
    };
    cache.diagnosticsByTask = {
        ...(cache.diagnosticsByTask || {}),
        [task.taskNumber]: diagnosticsByBucket,
    };
    cache.error = incomplete ? 'Suggestion generation completed with partial quadrant failures.' : undefined;
    await persistCacheDoc(cache);
    return { success: true, data: cache };
});

export async function getOrCreateWritingSuggestionCache(
    submission: WritingSubmission,
    options: GenerateTaskSuggestionsOptions = { taskNumber: submission.tasks[0]?.taskNumber || 1 },
): Promise<Result<WritingSuggestionCacheDoc>> {
    const source = options.source || (options.force ? 'force' : 'open');
    const sessionId = options.sessionId || `ws-session-${Math.random().toString(36).slice(2, 10)}`;
    let existing = await getWritingSuggestionCache(submission.id);
    if (existing) {
        existing = await recoverStaleRunIfNeeded(existing, options.taskNumber);
    }

    const task = submission.tasks.find((entry) => entry.taskNumber === options.taskNumber);
    const currentEssayHash = createEssayHash(task?.essayText || '');

    if (!options.force && existing) {
        const cachedEssayHash = existing.generatedFromEssayHashByTask?.[options.taskNumber];
        const hasTaskData = Boolean(existing.perTask?.[options.taskNumber]);
        const runState = existing.runStateByTask?.[options.taskNumber];
        if (cachedEssayHash === currentEssayHash && hasTaskData && runState?.status !== 'generating') {
            return { success: true, data: existing };
        }
    }

    return generateWritingSuggestionCacheGuarded(submission, existing, {
        taskNumber: options.taskNumber,
        force: options.force ?? false,
        source,
        sessionId,
    });
}

export async function updateWritingSuggestionReviewStatus(
    submissionId: string,
    taskNumber: 1 | 2,
    reviewKey: string,
    status: WritingSuggestionReviewStatus,
): Promise<Result<WritingSuggestionCacheDoc>> {
    const existing = await getWritingSuggestionCache(submissionId);
    if (!existing) {
        return { success: false, error: 'Suggestion cache not found.' };
    }

    const nextReviewStateByTask: WritingSuggestionReviewStateByTask = {
        ...existing.reviewStateByTask,
        [taskNumber]: {
            ...(existing.reviewStateByTask?.[taskNumber] || {}),
            [reviewKey]: status,
        },
    };

    const taskResult = existing.perTask[taskNumber];
    const nextTaskResult = taskResult
        ? applyReviewStateToTaskResult(taskResult, nextReviewStateByTask[taskNumber])
        : taskResult;

    const next: WritingSuggestionCacheDoc = {
        ...existing,
        updatedAt: Date.now(),
        reviewStateByTask: nextReviewStateByTask,
        perTask: nextTaskResult
            ? {
                ...existing.perTask,
                [taskNumber]: nextTaskResult,
            }
            : existing.perTask,
    };

    await persistCacheDoc(next);
    return { success: true, data: next };
}
