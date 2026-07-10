import { describe, expect, it } from 'vitest';
import {
  BookActivityCandidateError,
  saveActivityDraft,
  stageActivityCandidate,
  validateActivityCandidate,
} from './activityCandidate.service';

const validContent = {
  schemaVersion: 1,
  title: 'Declared Activity',
  presentationMode: 'structured',
  contextRequirement: 'none',
  interactions: [
    { family: 'text-entry', prompt: 'Type the word.' },
  ],
  answerRule: { type: 'text-exact', acceptableAnswers: ['word'] },
};

describe('activityCandidate.service', () => {
  it('validates declared Activity schema without semantic guessing or silent generation', () => {
    const invalid = stageActivityCandidate({
      candidateId: 'candidate-1',
      ownerId: 'teacher-1',
      targetActivityId: 'activity-1',
      replacementContent: {
        title: 'No declarations',
        prompt: 'Guess my schema',
      },
      now: '2026-07-09T00:00:00.000Z',
    });

    expect(invalid.status).toBe('invalid');
    expect(validateActivityCandidate(invalid).status).toBe('invalid');
    expect(() => saveActivityDraft({
      candidate: invalid,
      draftId: 'draft-1',
      now: '2026-07-09T00:01:00.000Z',
    })).toThrow(BookActivityCandidateError);

    const valid = stageActivityCandidate({
      candidateId: 'candidate-2',
      ownerId: 'teacher-1',
      targetActivityId: 'activity-1',
      replacementContent: validContent,
      now: '2026-07-09T00:00:00.000Z',
    });
    const draft = saveActivityDraft({
      candidate: valid,
      draftId: 'draft-1',
      now: '2026-07-09T00:01:00.000Z',
      idFactory: () => 'hidden-1',
    });

    expect(valid.status).toBe('valid');
    expect(draft.normalizedContent.title).toBe('Declared Activity');
    expect(draft.normalizedContent.interactions[0].hiddenInteractionId).toBe('hidden-1');

    const revisionDraft = saveActivityDraft({
      candidate: valid,
      draftId: 'draft-2',
      previousPublishedContent: draft.normalizedContent,
      previousPublishedVersionId: 'version-1',
      now: '2026-07-09T00:02:00.000Z',
      idFactory: () => 'hidden-2',
    });

    expect(revisionDraft.baseVersionId).toBe('version-1');
  });
});
