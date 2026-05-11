import { describe, expect, it } from 'vitest';
import {
  getReadingV2TaskFamily,
  normalizeReadingV2TaskType,
  READING_V2_CANONICAL_TASK_TYPES,
  READING_V2_TASK_TAXONOMY,
} from './readingV2Taxonomy';

describe('readingV2Taxonomy', () => {
  it('keeps exactly the 16 canonical Reading V2 task slugs', () => {
    expect([...READING_V2_CANONICAL_TASK_TYPES].sort()).toEqual(
      [
        'sentence-completion',
        'summary-completion-text',
        'summary-completion-list',
        'note-completion',
        'table-completion',
        'flowchart-completion',
        'diagram-labeling',
        'true-false-not-given',
        'yes-no-not-given',
        'matching-headings',
        'matching-information',
        'matching-features',
        'matching-sentence-endings',
        'multiple-choice',
        'multiple-select',
        'short-answer',
      ].sort(),
    );
  });

  it('uses the frozen PRD0048 family overrides instead of older broad categories', () => {
    expect(getReadingV2TaskFamily('summary-completion-list')).toBe('choice');
    expect(getReadingV2TaskFamily('table-completion')).toBe('structured-layout');
    expect(getReadingV2TaskFamily('flowchart-completion')).toBe('structured-layout');
    expect(getReadingV2TaskFamily('diagram-labeling')).toBe('structured-layout');
    expect(getReadingV2TaskFamily('short-answer')).toBe('completion');
    expect(getReadingV2TaskFamily('true-false-not-given')).toBe('binary-judgement');
    expect(getReadingV2TaskFamily('yes-no-not-given')).toBe('binary-judgement');
  });

  it('normalizes explicit aliases without letting ambiguous labels guess', () => {
    expect(normalizeReadingV2TaskType('TFNG')).toBe('true-false-not-given');
    expect(normalizeReadingV2TaskType('Diagram labelling')).toBe('diagram-labeling');
    expect(normalizeReadingV2TaskType('Choose three letters')).toBe('multiple-select');
    expect(normalizeReadingV2TaskType('Summary completion')).toBeNull();
    expect(normalizeReadingV2TaskType('Summary completion', { summaryAnswerMode: 'list' })).toBe(
      'summary-completion-list',
    );
    expect(normalizeReadingV2TaskType('Summary completion', { summaryAnswerMode: 'text' })).toBe(
      'summary-completion-text',
    );
  });

  it('rejects legacy parser fallback labels as canonical V2 task types', () => {
    expect(normalizeReadingV2TaskType('completion')).toBeNull();
    expect(normalizeReadingV2TaskType('matching')).toBeNull();
    expect(Object.keys(READING_V2_TASK_TAXONOMY)).not.toContain('true-false');
  });
});
