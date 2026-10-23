import { describe, expect, it } from 'vitest';
import { resolveBookScheduleWindow } from '../book-delivery/bookScheduleWindow.service';
import {
  assertBookRuntimeWindowForTarget,
  createBookRuntimeScheduleAuthority,
  activitySubmissionFromRuntimeResponses,
  activityDraftFromRuntimeResponses,
  runtimeResponsesFromActivityDraft,
  normalizeSavedActivityResponse,
  sameBookRuntimeScheduleAuthority,
} from './activityRuntimeAttempt.service';

const windowDecision = (operation: 'state' | 'autosave' | 'submit' = 'autosave') =>
  resolveBookScheduleWindow({
    assignmentId: 'homework-1',
    recipientId: 'student-1',
    bindingId: 'binding-1',
    bindingRevision: 1,
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    operation,
    schedule: {
      schemaVersion: 1,
      resolverVersion: 1,
      availableFrom: '2026-08-01T00:00:00.000Z',
      finalDueAt: '2026-08-10T00:00:00.000Z',
      scheduleRules: [],
    },
    outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
    studentExtensions: {},
    lateSubmissionAllowed: false,
    policyRevision: 1,
    authorityRevision: 2,
    evaluatedAt: '2026-08-05T00:00:00.000Z',
    maxAttempts: 2,
    attemptsUsed: 0,
  });

describe('Book runtime effective-window adapter', () => {
  it('round-trips partial Activity drafts without turning untouched questions into blank answers', () => {
    const ids = ['question-1', 'question-2'];
    const draft = activityDraftFromRuntimeResponses(ids, { 'question-1': { text: '' } });
    expect(draft).toEqual([{ interactionId: 'question-1', answer: '' }, { interactionId: 'question-2' }]);
    const restored = runtimeResponsesFromActivityDraft(ids, draft)!;
    expect(restored).toEqual({ 'question-1': [{ interactionId: 'question-1', answer: '' }] });
    expect(() => activitySubmissionFromRuntimeResponses(ids, restored)).toThrow('runtime_activity_submission_incomplete');
    expect(runtimeResponsesFromActivityDraft(ids, [...draft].reverse())).toBeNull();
    expect(runtimeResponsesFromActivityDraft(ids, [{ interactionId: 'question-1', answer: 'old per-question draft' }])).toBeNull();
  });

  it('accepts only the exact actor, binding, context, target, and operation', () => {
    const authority = createBookRuntimeScheduleAuthority(windowDecision());
    expect(assertBookRuntimeWindowForTarget({
      authority,
      actorUid: 'student-1',
      bindingId: 'binding-1',
      bindingRevision: 1,
      contextId: 'homework-1',
      target: {
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
      },
      operation: 'autosave',
    })).toEqual(windowDecision());
    expect(() => assertBookRuntimeWindowForTarget({
      authority,
      actorUid: 'attacker',
      bindingId: 'binding-1',
      bindingRevision: 1,
      contextId: 'homework-1',
      target: {
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
      },
      operation: 'autosave',
    })).toThrow('runtime_schedule_window_stale');
  });

  it('compares authority versions and target identity without browser timestamps', () => {
    const first = createBookRuntimeScheduleAuthority(windowDecision());
    const second = createBookRuntimeScheduleAuthority({
      ...windowDecision(),
      evaluatedAt: '2026-08-05T00:00:01.000Z',
    });
    expect(sameBookRuntimeScheduleAuthority(first, second)).toBe(true);
    const changed = createBookRuntimeScheduleAuthority({
      ...windowDecision(),
      authorityRevision: 3,
    });
    expect(sameBookRuntimeScheduleAuthority(first, changed)).toBe(false);
  });

  it('reads legacy saved submission rows without changing their stored shape', () => {
    const legacy = [{ interactionId: 'interaction-1', answer: ['option-a'] }];
    expect(normalizeSavedActivityResponse('interaction-1', legacy, 'choice-single-v1')).toEqual({
      interactionId: 'interaction-1',
      selectedOptionId: 'option-a',
    });
    expect(activitySubmissionFromRuntimeResponses(['interaction-1'], {
      'interaction-1': legacy,
    })).toEqual(legacy);
    expect(legacy).toEqual([{ interactionId: 'interaction-1', answer: ['option-a'] }]);
    const malformed = [{ interactionId: 'interaction-1', answer: 42 }];
    expect(normalizeSavedActivityResponse('interaction-1', malformed, 'choice-single-v1')).toBe(malformed);
    expect(() => activitySubmissionFromRuntimeResponses(['interaction-1'], {
      'interaction-1': malformed,
    })).toThrow('runtime_activity_response_invalid');
  });
});
