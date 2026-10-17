import { describe, expect, it } from 'vitest';
import type { BookActivityVersionRecord } from '../../types/bookActivity.types';
import {
  BookActivityScoringError,
  scoreActivityAttempt,
} from './activityScoring.service';

const version = (
  content: BookActivityVersionRecord['content'],
): BookActivityVersionRecord => ({
  activityId: 'activity-1',
  versionId: 'version-1',
  ownerId: 'teacher-1',
  materialKind: 'interactive-activity',
  content,
  publishedAt: '2026-07-09T00:00:00.000Z',
  publishedBy: 'teacher-1',
});

const baseContent = {
  schemaVersion: 1,
  title: 'Activity',
  presentationMode: 'structured',
  contextRequirement: 'none',
  scoring: { points: 4 },
} satisfies Pick<
  BookActivityVersionRecord['content'],
  'schemaVersion' | 'title' | 'presentationMode' | 'contextRequirement' | 'scoring'
>;

describe('activityScoring.service', () => {
  it('scores supported objective Activity families and requires review for long-response rubric scoring', () => {
    expect(scoreActivityAttempt(version({
      ...baseContent,
      interactions: [
        { family: 'choice', prompt: 'Pick all.', choices: ['A', 'B', 'C'], hiddenInteractionId: 'hidden-1' },
      ],
      answerRule: { type: 'multiple-choice', correctChoiceIndexes: [0, 2] },
    }), { i1: [2, 0] })).toMatchObject({ score: 4, requiresTeacherReview: false });

    expect(scoreActivityAttempt(version({
      ...baseContent,
      interactions: [
        { family: 'matching', prompt: 'Match.', pairs: [{ left: 'A', right: '1' }], hiddenInteractionId: 'hidden-1' },
      ],
      answerRule: { type: 'matching', matchingPairs: [{ left: 'A', right: '1' }] },
    }), { i1: { A: '1' } })).toMatchObject({ score: 4, requiresTeacherReview: false });

    expect(scoreActivityAttempt(version({
      ...baseContent,
      interactions: [
        { family: 'ordering', prompt: 'Order.', orderingItems: ['first', 'second'], hiddenInteractionId: 'hidden-1' },
      ],
      answerRule: { type: 'ordering', ordering: ['first', 'second'] },
    }), { i1: ['first', 'second'] })).toMatchObject({ score: 4, requiresTeacherReview: false });

    expect(scoreActivityAttempt(version({
      ...baseContent,
      interactions: [
        { family: 'long-response', prompt: 'Explain.', responseShape: 'paragraph', hiddenInteractionId: 'hidden-1' },
      ],
      answerRule: { type: 'rubric', rubric: 'Teacher scored.' },
    }), { i1: 'Because...' })).toMatchObject({ score: 0, maxScore: 4, requiresTeacherReview: true });
  });

  it('rejects malformed objective versions instead of silently returning zero', () => {
    expect(() => scoreActivityAttempt(version({
      ...baseContent,
      interactions: [
        { family: 'choice', prompt: 'Pick one.', choices: ['A', 'B'], hiddenInteractionId: 'hidden-1' },
      ],
      answerRule: { type: 'single-choice' },
    }), { i1: 0 })).toThrow(BookActivityScoringError);
  });
});
