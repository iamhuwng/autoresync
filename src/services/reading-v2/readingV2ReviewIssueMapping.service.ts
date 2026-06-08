export type ReadingV2ReviewIssueSeverity = 'publish-blocker' | 'needs-review' | 'info';

export type ReadingV2ReviewIssueSource =
  | 'answer-key'
  | 'question-text'
  | 'source-comparison'
  | 'layout'
  | 'validation'
  | 'import-review';

export interface ReadingV2ReviewIssueTarget {
  readonly questionRange?: { readonly start: number; readonly end: number };
  readonly passageNumber?: number;
  readonly taskGroupId?: string;
  readonly interactionId?: string;
  readonly anchorId?: string;
}

export interface ReadingV2ReviewIssue {
  readonly id: string;
  readonly severity: ReadingV2ReviewIssueSeverity;
  readonly source: ReadingV2ReviewIssueSource;
  readonly type: string;
  readonly label: string;
  readonly detail: string;
  readonly target: ReadingV2ReviewIssueTarget;
  readonly originalMessage: string;
}

export interface ReadingV2ReviewIssueInput {
  readonly key: string;
  readonly message: string;
  readonly reviewLabel?: string;
  readonly reviewDetail?: string;
  readonly questionRange?: {
    readonly start: number;
    readonly end: number;
  };
  readonly source?: 'import-review' | 'validation';
}

const normalizeSentence = (value: string): string => {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
};

const extractQuestionRange = (
  ...values: Array<string | undefined>
): ReadingV2ReviewIssueInput['questionRange'] | undefined => {
  const joined = values.filter(Boolean).join(' ');
  const match = joined.match(/Questions?\s+(\d+)(?:\s*-\s*(\d+))?/i);
  if (!match) {
    return undefined;
  }

  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return undefined;
  }

  return { start: Math.min(start, end), end: Math.max(start, end) };
};

export const formatReadingV2ReviewIssueQuestionLabel = (
  range: ReadingV2ReviewIssueInput['questionRange'],
  fallback?: string,
): string => {
  if (range) {
    return range.start === range.end ? `Q${range.start}` : `Questions ${range.start}-${range.end}`;
  }

  const fallbackRange = extractQuestionRange(fallback);
  if (fallbackRange) {
    return fallbackRange.start === fallbackRange.end
      ? `Q${fallbackRange.start}`
      : `Questions ${fallbackRange.start}-${fallbackRange.end}`;
  }

  const match = fallback?.match(/Questions?\s+(\d+)(?:\s*[-–—]\s*(\d+))?/i);
  if (match) {
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return start === end ? `Q${start}` : `Questions ${Math.min(start, end)}-${Math.max(start, end)}`;
    }
  }

  return fallback?.trim() || 'Review item';
};

const classifyIssue = (message: string, detail: string): Pick<ReadingV2ReviewIssue, 'type' | 'detail' | 'severity' | 'source'> => {
  const haystack = `${message} ${detail}`.toLowerCase();

  if (haystack.includes('wrong judgement vocabulary')) {
    return {
      type: 'wrong-judgement-vocabulary',
      detail: 'Wrong judgement vocabulary',
      severity: 'publish-blocker',
      source: 'validation',
    };
  }

  if (haystack.includes('missing answer') || haystack.includes('needs an answer')) {
    return {
      type: 'missing-answer',
      detail: 'Missing answer',
      severity: 'publish-blocker',
      source: 'answer-key',
    };
  }

  if (haystack.includes('no answer key')) {
    return {
      type: 'missing-answer-key',
      detail: 'Missing answer key',
      severity: 'publish-blocker',
      source: 'answer-key',
    };
  }

  if (haystack.includes('needs question text') || haystack.includes('has no question text')) {
    return {
      type: 'missing-question-text',
      detail: 'Missing question text',
      severity: 'publish-blocker',
      source: 'question-text',
    };
  }

  if (haystack.includes('visible blank marker')) {
    return {
      type: 'missing-blank-marker',
      detail: 'Missing blank marker',
      severity: 'publish-blocker',
      source: 'validation',
    };
  }

  if (haystack.includes('duplicate structured layout question')) {
    return {
      type: 'duplicate-structured-layout-question',
      detail: 'Duplicate structured layout question',
      severity: 'publish-blocker',
      source: 'layout',
    };
  }

  if (haystack.includes('table cell missing') || haystack.includes('table-cell-missing')) {
    return {
      type: 'table-cell-missing',
      detail: 'Table cell missing',
      severity: 'needs-review',
      source: 'layout',
    };
  }

  if (haystack.includes('question-text-changed') || haystack.includes('question text changed')) {
    return {
      type: 'question-text-changed',
      detail: 'Question text changed',
      severity: 'needs-review',
      source: 'source-comparison',
    };
  }

  if (haystack.includes('high-risk-token-changed') || haystack.includes('high risk token')) {
    return {
      type: 'high-risk-token-changed',
      detail: 'High-risk token changed',
      severity: 'needs-review',
      source: 'source-comparison',
    };
  }

  if (haystack.includes('group-source-underrepresented') || haystack.includes('source coverage')) {
    return {
      type: 'source-coverage-weak',
      detail: 'Source coverage needs review',
      severity: 'needs-review',
      source: 'source-comparison',
    };
  }

  if (haystack.includes('source-question-range-missing') || haystack.includes('source range missing')) {
    return {
      type: 'source-range-missing',
      detail: 'Source range missing',
      severity: 'needs-review',
      source: 'source-comparison',
    };
  }

  return {
    type: 'review-required',
    detail: normalizeSentence(detail || message),
    severity: 'needs-review',
    source: 'import-review',
  };
};

export const mapReadingV2BuildValidationMessagesToReviewIssues = (
  messages: readonly ReadingV2ReviewIssueInput[],
): readonly ReadingV2ReviewIssue[] =>
  messages.map((message) => {
    const rawDetail = message.reviewDetail ?? message.message;
    const questionRange = message.questionRange ?? extractQuestionRange(
      message.reviewLabel,
      message.reviewDetail,
      message.message,
    );
    const classified = classifyIssue(message.message, rawDetail);
    const source = message.source === 'validation' && classified.source === 'import-review'
      ? 'validation'
      : classified.source;

    return {
      id: message.key,
      severity: classified.severity,
      source,
      type: classified.type,
      label: formatReadingV2ReviewIssueQuestionLabel(questionRange, message.reviewLabel),
      detail: classified.detail,
      target: {
        questionRange,
      },
      originalMessage: message.message,
    };
  });
