import { describe, expect, it } from 'vitest';
import {
  mapReadingV2BuildValidationMessagesToReviewIssues,
  type ReadingV2ReviewIssue,
} from './readingV2ReviewIssueMapping.service';

describe('readingV2ReviewIssueMapping.service', () => {
  it('maps a single-question judgement vocabulary validation into a teacher-facing issue', () => {
    const [issue] = mapReadingV2BuildValidationMessagesToReviewIssues([
      {
        key: 'sample-import-q12-vocabulary',
        message: 'Interaction sample-import-q12 uses the wrong judgement vocabulary.',
        questionRange: { start: 12, end: 12 },
        source: 'validation',
      },
    ]);

    expect(issue).toMatchObject<Partial<ReadingV2ReviewIssue>>({
      id: 'sample-import-q12-vocabulary',
      severity: 'publish-blocker',
      source: 'validation',
      type: 'wrong-judgement-vocabulary',
      label: 'Q12',
      detail: 'Wrong judgement vocabulary',
      target: { questionRange: { start: 12, end: 12 } },
      originalMessage: 'Interaction sample-import-q12 uses the wrong judgement vocabulary.',
    });
  });

  it('maps group source verifier warnings as needs-review issues', () => {
    const [issue] = mapReadingV2BuildValidationMessagesToReviewIssues([
      {
        key: 'group-38-40-text',
        message: 'Group 38-40 is weak: question-text-changed.',
        reviewDetail: 'Question text changed.',
        questionRange: { start: 38, end: 40 },
        source: 'import-review',
      },
    ]);

    expect(issue).toMatchObject<Partial<ReadingV2ReviewIssue>>({
      severity: 'needs-review',
      source: 'source-comparison',
      type: 'question-text-changed',
      label: 'Questions 38-40',
      detail: 'Question text changed',
      target: { questionRange: { start: 38, end: 40 } },
    });
  });

  it('infers question targets from teacher-readable validation text', () => {
    const [textIssue, answerIssue, blankIssue] = mapReadingV2BuildValidationMessagesToReviewIssues([
      {
        key: 'q1-text',
        message: 'Question 1 needs question text.',
        source: 'validation',
      },
      {
        key: 'q1-answer',
        message: 'Question 1 has no answer key.',
        source: 'validation',
      },
      {
        key: 'q2-blank',
        message: 'Question 2 needs a visible blank marker such as [blank] or ___.',
        source: 'validation',
      },
    ]);

    expect(textIssue).toMatchObject<Partial<ReadingV2ReviewIssue>>({
      severity: 'publish-blocker',
      source: 'question-text',
      type: 'missing-question-text',
      label: 'Q1',
      detail: 'Missing question text',
      target: { questionRange: { start: 1, end: 1 } },
    });
    expect(answerIssue).toMatchObject<Partial<ReadingV2ReviewIssue>>({
      severity: 'publish-blocker',
      source: 'answer-key',
      type: 'missing-answer-key',
      label: 'Q1',
      detail: 'Missing answer key',
      target: { questionRange: { start: 1, end: 1 } },
    });
    expect(blankIssue).toMatchObject<Partial<ReadingV2ReviewIssue>>({
      severity: 'publish-blocker',
      source: 'validation',
      type: 'missing-blank-marker',
      label: 'Q2',
      detail: 'Missing blank marker',
      target: { questionRange: { start: 2, end: 2 } },
    });
  });

  it('keeps unknown messages actionable without exposing empty labels', () => {
    const [issue] = mapReadingV2BuildValidationMessagesToReviewIssues([
      {
        key: 'unknown-review',
        message: 'Provider returned an unusual warning shape.',
        source: 'import-review',
      },
    ]);

    expect(issue).toMatchObject<Partial<ReadingV2ReviewIssue>>({
      severity: 'needs-review',
      source: 'import-review',
      type: 'review-required',
      label: 'Review item',
      detail: 'Provider returned an unusual warning shape',
      originalMessage: 'Provider returned an unusual warning shape.',
    });
  });
});
