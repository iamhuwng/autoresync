import { describe, expect, it } from 'vitest';
import type { NormalizedActivity } from '../../types/bookActivity.types';
import { diffActivities } from './activityDiff.service';

const activity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Activity', taskProfile: null, presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
  instructions: [{ text: 'Choose.' }], stimulus: null, assetRefs: [],
  interaction: { family: 'choice', variant: 'single' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  interactions: [{
    family: 'choice', interactionId: 'interaction-1', prompt: 'Pick one', options: ['A', 'B'],
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: ['option-a'] },
  }, {
    family: 'choice', interactionId: 'interaction-2', prompt: 'Pick another', options: ['C', 'D'],
    itemIdentities: { family: 'choice', optionIds: ['option-c', 'option-d'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: ['option-c'] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

describe('activityDiff.service', () => {
  it('classifies display, regrade, structural redo, and context changes', () => {
    const before = activity();
    expect(diffActivities(before, { ...activity(), title: 'Renamed' }))
      .toMatchObject({ classification: 'display-only', requiresRedo: false });
    const regraded = activity();
    regraded.answerRule.defaultPoints = 2;
    expect(diffActivities(before, regraded))
      .toMatchObject({ classification: 'regrade', requiresRedo: false });
    const changedPrompt = activity();
    changedPrompt.interactions[0]!.prompt = 'A structurally different prompt';
    expect(diffActivities(before, changedPrompt))
      .toMatchObject({ classification: 'redo-required', requiresRedo: true });
    expect(diffActivities(before, {
      ...activity(), contextRequirement: { mode: 'required', acceptedKinds: ['image'] },
    })).toMatchObject({ classification: 'presentation-context', requiresRedo: false });
  });

  it('treats pure stable-identity interaction reorder as explicit no-redo', () => {
    const before = activity();
    const after = activity();
    after.interactions.reverse();
    expect(diffActivities(before, after)).toEqual({
      classification: 'reordered', reasons: ['interaction-reordered'], requiresRedo: false,
    });
  });
});
