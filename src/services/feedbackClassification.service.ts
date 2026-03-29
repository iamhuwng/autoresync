import type { PassageResult, SavedResultFeedbackKind } from '../types/results.types';
import type { TestResultRecord } from './testResults.service';

export type IeltsFeedbackFormatKind = 'ielts-reading' | 'ielts-listening';
export type IeltsFeedbackSegmentLabel = 'Passage' | 'Part';

export interface NormalizedQuestionTypeBreakdown {
  questionType: string;
  correct: number;
  total: number;
  percentage: number;
}

export interface NormalizedIeltsSegmentBreakdown {
  segmentNumber: number;
  segmentName: string;
  sourceName?: string;
  questionRange: [number, number];
  correct: number;
  total: number;
  percentage: number;
}

export interface SavedResultFeedbackMetadataExtras {
  kind: SavedResultFeedbackKind;
  formatKind?: IeltsFeedbackFormatKind;
  segmentLabel?: IeltsFeedbackSegmentLabel;
  unansweredCount?: number;
  questionTypeBreakdown?: NormalizedQuestionTypeBreakdown[];
  segmentBreakdown?: NormalizedIeltsSegmentBreakdown[];
}

type FeedbackClassificationCandidate = Pick<
  Partial<TestResultRecord>,
  'testType' | 'testSkill' | 'testTitle' | 'bandScore' | 'thcsData' | 'ieltsData' | 'questionResults'
> & {
  title?: string | null;
};

type FeedbackQuestionResultLike = {
  questionType?: string | null;
  isCorrect?: boolean;
  studentAnswer?: unknown;
};

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeFeedbackQuestionType(questionType: string | undefined): string {
  const raw = normalizeText(questionType || 'question');
  if (!raw) {
    return 'question';
  }

  return raw.replace(/\s+/g, '_').replace(/-/g, '_');
}

function isBlankAnswerString(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === ''
    || normalized === '-'
    || normalized === '—'
    || normalized === '(blank)'
    || normalized === '(no answer)'
    || normalized === '(no answer submitted)'
    || normalized === 'blank'
    || normalized === 'no answer provided'
    || normalized === 'no answer submitted'
    || normalized === 'unanswered';
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

function isThcsFamily(testType: string): boolean {
  return testType.includes('thcs');
}

function isIeltsFamily(testType: string): boolean {
  return testType.includes('ielts');
}

function getIeltsFormatKind(testSkill: string): IeltsFeedbackFormatKind | null {
  if (testSkill.includes('reading')) {
    return 'ielts-reading';
  }

  if (testSkill.includes('listening')) {
    return 'ielts-listening';
  }

  return null;
}

export function classifySavedResultFeedbackKind(
  result: FeedbackClassificationCandidate,
): SavedResultFeedbackKind {
  const testType = normalizeText(result.testType);
  const testSkill = normalizeText(result.testSkill);
  const testTitle = normalizeText(result.testTitle ?? result.title);
  const hasIeltsBreakdown = Boolean(result.ieltsData?.passageResults?.length);
  const hasIeltsTitleSignal = testTitle.includes('ielts');

  if (isThcsFamily(testType) || Boolean(result.thcsData?.sectionResults?.length)) {
    return 'thcs';
  }

  const formatKind = getIeltsFormatKind(testSkill);
  if (!formatKind) {
    return null;
  }

  if (isIeltsFamily(testType) || hasIeltsBreakdown || hasIeltsTitleSignal) {
    return formatKind;
  }

  return null;
}

export function getIeltsFeedbackSegmentLabel(
  kind: SavedResultFeedbackKind | null | undefined,
): IeltsFeedbackSegmentLabel | undefined {
  if (kind === 'ielts-listening') {
    return 'Part';
  }

  if (kind === 'ielts-reading') {
    return 'Passage';
  }

  return undefined;
}

export function countUnansweredQuestionResults(
  questionResults: FeedbackQuestionResultLike[] | null | undefined,
): number {
  if (!Array.isArray(questionResults) || questionResults.length === 0) {
    return 0;
  }

  return questionResults.reduce((count, questionResult) => {
    return count + (isBlankAnswerValue(questionResult.studentAnswer) ? 1 : 0);
  }, 0);
}

export function buildNormalizedQuestionTypeBreakdown(
  questionResults: FeedbackQuestionResultLike[] | null | undefined,
): NormalizedQuestionTypeBreakdown[] {
  if (!Array.isArray(questionResults) || questionResults.length === 0) {
    return [];
  }

  const totals = questionResults.reduce<Record<string, { correct: number; total: number }>>((acc, result) => {
    const questionType = normalizeFeedbackQuestionType(result.questionType || 'question');
    if (!acc[questionType]) {
      acc[questionType] = { correct: 0, total: 0 };
    }

    acc[questionType].total += 1;
    if (result.isCorrect) {
      acc[questionType].correct += 1;
    }

    return acc;
  }, {});

  return Object.entries(totals)
    .map(([questionType, counts]) => ({
      questionType,
      correct: counts.correct,
      total: counts.total,
      percentage: counts.total > 0 ? Math.round((counts.correct / counts.total) * 100) : 0,
    }))
    .sort((left, right) => {
      if (left.percentage !== right.percentage) {
        return left.percentage - right.percentage;
      }

      if (left.total !== right.total) {
        return right.total - left.total;
      }

      return left.questionType.localeCompare(right.questionType);
    });
}

export function buildNormalizedIeltsSegmentBreakdown(
  passageResults: PassageResult[] | null | undefined,
  segmentLabel: IeltsFeedbackSegmentLabel,
): NormalizedIeltsSegmentBreakdown[] {
  if (!Array.isArray(passageResults) || passageResults.length === 0) {
    return [];
  }

  return passageResults.map((passage, index) => ({
    segmentNumber: index + 1,
    segmentName: `${segmentLabel} ${index + 1}`,
    sourceName: passage.passageName || undefined,
    questionRange: passage.questionRange,
    correct: passage.correct,
    total: passage.total,
    percentage: passage.percentage,
  }));
}

export function buildSavedResultFeedbackMetadata(
  result: FeedbackClassificationCandidate,
): SavedResultFeedbackMetadataExtras {
  const kind = classifySavedResultFeedbackKind(result);
  const questionResults = Array.isArray(result.questionResults) ? result.questionResults : [];
  const questionTypeBreakdown = buildNormalizedQuestionTypeBreakdown(questionResults);
  const unansweredCount = countUnansweredQuestionResults(questionResults);

  if (kind === 'ielts-reading' || kind === 'ielts-listening') {
    const segmentLabel = getIeltsFeedbackSegmentLabel(kind);
    return {
      kind,
      formatKind: kind,
      segmentLabel,
      unansweredCount,
      questionTypeBreakdown,
      segmentBreakdown: buildNormalizedIeltsSegmentBreakdown(
        result.ieltsData?.passageResults || [],
        segmentLabel || 'Passage',
      ),
    };
  }

  return {
    kind,
    unansweredCount,
    questionTypeBreakdown,
  };
}
