import { describe, expect, it } from 'vitest';
import {
  ActivityCandidateError,
  validateActivityCandidate,
} from './activityCandidate.service';

const activity = {
  schemaVersion: 1,
  title: 'Candidate',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] },
  instructions: [{ text: 'Choose.' }],
  interaction: { family: 'choice', variant: 'single-choice' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{ prompt: 'Pick one', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
  scoring: { mode: 'auto-where-possible' },
} as const;

describe('activityCandidate.service', () => {
  it('rejects undeclared or malformed Activity content before authoring', () => {
    expect(() => validateActivityCandidate({
      targetActivityId: 'activity-1',
      content: { title: 'Guess my schema' },
    }, undefined)).toThrow(ActivityCandidateError);
    expect(() => validateActivityCandidate({
      targetActivityId: 'activity/invalid',
      content: activity,
    }, undefined)).toThrow(ActivityCandidateError);
  });

  it('normalizes a declared Activity and preserves evidence references', () => {
    const candidate = validateActivityCandidate({
      targetActivityId: 'activity-1',
      content: activity,
      evidenceRefs: ['import:1'],
      sourceEvidenceRefs: ['source:1'],
      answerEvidenceRefs: ['answer:1'],
    }, undefined);

    expect(candidate.validation.valid).toBe(true);
    expect(candidate.normalized.title).toBe('Candidate');
    expect(candidate.normalized.interactions[0].prompt).toBe('Pick one');
    expect(candidate.diff).toEqual({
      classification: 'added',
      reasons: ['activity-added'],
      requiresRedo: false,
    });
    expect(candidate.evidenceRefs).toEqual(['import:1']);
    expect(candidate.sourceEvidenceRefs).toEqual(['source:1']);
    expect(candidate.answerEvidenceRefs).toEqual(['answer:1']);
  });
});
