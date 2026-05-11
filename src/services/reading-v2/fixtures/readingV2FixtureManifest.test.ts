import { describe, expect, it } from 'vitest';
import {
  READING_V2_FIXTURE_FAMILY_COVERAGE,
  READING_V2_FIXTURE_MANIFEST,
  READING_V2_PROJECTION_FIXTURE_STRATEGY,
} from './readingV2FixtureManifest';

const OFFICIAL_TASK_TYPES = [
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
] as const;

describe('readingV2FixtureManifest', () => {
  it('tracks one fixture manifest entry for each official Reading V2 task type', () => {
    expect(Object.keys(READING_V2_FIXTURE_MANIFEST).sort()).toEqual(
      [...OFFICIAL_TASK_TYPES].sort(),
    );
  });

  it('keeps canonical and projection fixture IDs explicit for every task type', () => {
    OFFICIAL_TASK_TYPES.forEach((taskType) => {
      const entry = READING_V2_FIXTURE_MANIFEST[taskType];

      expect(entry.canonicalSlug).toBe(taskType);
      expect(entry.canonicalFixtureId).toBe(`canonical-${taskType}`);
      expect(entry.projectionFixtureId).toBe(`projection-${taskType}`);
    });
  });

  it('covers every Reading V2 engineering family before renderer work starts', () => {
    expect([...READING_V2_FIXTURE_FAMILY_COVERAGE].sort()).toEqual([
      'binary-judgement',
      'choice',
      'completion',
      'matching',
      'structured-layout',
    ]);
  });

  it('declares every required derived projection fixture class', () => {
    expect(READING_V2_PROJECTION_FIXTURE_STRATEGY).toEqual({
      preview: 'preview',
      studentSafe: 'student-safe',
      sessionSafe: 'session-safe',
      review: 'review',
      analytics: 'analytics',
    });
  });
});
