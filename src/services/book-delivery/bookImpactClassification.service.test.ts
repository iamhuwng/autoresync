import { describe, expect, it } from 'vitest';
import type { EditableActivity, NormalizedActivity } from '../../types/bookActivity.types';
import { normalizeActivity } from '../book-activity/activityCanonical.service';
import {
  classifyBookImpact,
  type BookImpactClassificationInput,
} from './bookImpactClassification.service';

let ids = 0;
const activity = (title = 'Activity', interactionCount = 1): NormalizedActivity => {
  const editable: EditableActivity = {
    schemaVersion: 1,
    title,
    taskProfile: null,
    presentationMode: 'structured',
    contextRequirement: { mode: 'none', acceptedKinds: [] },
    instructions: [{ text: 'Answer.' }],
    interaction: { family: 'choice', variant: 'v1' },
    answerRule: { defaultPoints: 1, normalization: 'trim-case-and-spacing' },
    stimulus: null,
    assetRefs: [],
    scoring: { mode: 'auto-where-possible' },
    interactions: Array.from({ length: interactionCount }, (_, index) => ({
      prompt: index === 0 ? 'Pick one' : `Pick one ${index + 1}`,
      options: ['A', 'B'],
      acceptedOptionIndexes: [0],
    })),
  };
  return normalizeActivity(editable, { createId: () => `impact-${++ids}` });
};

const input = (
  beforeActivity: NormalizedActivity | null,
  afterActivity: NormalizedActivity | null,
): BookImpactClassificationInput => ({
  before: {
    bookRef: 'book-1', bookMode: 'mode-2', successorBookRef: null,
    activity: beforeActivity,
    binding: { activityRef: 'activity-1', placementRef: 'placement-1', parentRef: 'unit-1', order: 1, mappingFingerprint: 'map-1' },
    source: { sourceVersionRef: 'source-1', availability: 'available' },
  },
  after: {
    bookRef: 'book-1', bookMode: 'mode-2', successorBookRef: null,
    activity: afterActivity,
    binding: { activityRef: 'activity-1', placementRef: 'placement-1', parentRef: 'unit-1', order: 1, mappingFingerprint: 'map-1' },
    source: { sourceVersionRef: 'source-1', availability: 'available' },
  },
});

const deepFreeze = (value: unknown): void => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  Object.values(value).forEach(deepFreeze);
  Object.freeze(value);
};

describe('Ticket 39A Book impact classification', () => {
  it('maps Ticket 12B semantic differences without mutating frozen old/new pairs', () => {
    const old = activity();
    const display = structuredClone(old);
    display.title = 'Display only';
    const regrade = structuredClone(old);
    if (regrade.answerRule.defaultPoints === undefined) throw new Error('fixture');
    regrade.answerRule.defaultPoints = 2;
    const redo = structuredClone(old);
    redo.interactions[0]!.prompt = 'Changed prompt';
    const two = activity('Activity', 2);
    const reordered = structuredClone(two);
    reordered.interactions.reverse();

    const cases = [
      [old, old, 'unchanged'],
      [old, display, 'display-only'],
      [old, regrade, 'regrade'],
      [old, redo, 'redo-required'],
      [null, old, 'added'],
      [old, null, 'removed'],
      [two, reordered, 'reordered'],
    ] as const;
    for (const [before, after, effect] of cases) {
      const pair = structuredClone(input(before, after));
      const beforeCall = structuredClone(pair);
      deepFreeze(pair);
      const result = classifyBookImpact(pair);
      expect(result.effects).toContain(effect);
      if (effect === 'reordered') {
        expect(result.requiresRedo).toBe(true);
        expect(result.activityDiff.requiresRedo).toBe(true);
      }
      expect(pair).toEqual(beforeCall);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.effects)).toBe(true);
    }
  });

  it('classifies move, mapping/source context, successor, and invalidation deterministically', () => {
    const current = activity();
    const moveBase = input(current, current);
    const moved = { ...moveBase, after: { ...moveBase.after, binding: { ...moveBase.after.binding, parentRef: 'unit-2' } } };
    expect(classifyBookImpact(moved).effects).toContain('moved');

    const mapBase = input(current, current);
    const mapped = { ...mapBase, after: { ...mapBase.after, binding: { ...mapBase.after.binding, mappingFingerprint: 'map-2' } } };
    expect(classifyBookImpact(mapped).effects).toContain('mapping-source-context');

    const successorBase = input(current, current);
    const successor = { ...successorBase, after: { ...successorBase.after, successorBookRef: 'book-2' } };
    expect(classifyBookImpact(successor)).toMatchObject({
      primaryEffect: 'successor', requiresSuccessor: true,
    });

    const invalidationBase = input(current, current);
    const invalidated = { ...invalidationBase, after: { ...invalidationBase.after, source: { ...invalidationBase.after.source, availability: 'invalidated' as const } } };
    expect(classifyBookImpact(invalidated)).toMatchObject({
      primaryEffect: 'invalidation', requiresExplicitContextResolution: true,
    });
  });

  it('fails closed when a mode change lacks an explicit successor', () => {
    const current = activity();
    const changedBase = input(current, current);
    const changed = { ...changedBase, after: { ...changedBase.after, bookMode: 'mode-1' as const } };
    expect(classifyBookImpact(changed)).toMatchObject({
      primaryEffect: 'unsupported', effects: expect.arrayContaining(['successor', 'unsupported']),
      requiresRedo: true,
    });
  });

  it('fails closed for cross-Book comparisons and self-referencing successors', () => {
    const current = activity();
    const crossBookBase = input(current, current);
    const crossBook = {
      ...crossBookBase,
      after: { ...crossBookBase.after, bookRef: 'book-2' },
    };
    expect(classifyBookImpact(crossBook)).toMatchObject({
      primaryEffect: 'unsupported',
      reasons: expect.arrayContaining(['book-ref-mismatch']),
      requiresRedo: true,
    });

    const selfSuccessorBase = input(current, current);
    const selfSuccessor = {
      ...selfSuccessorBase,
      after: { ...selfSuccessorBase.after, successorBookRef: 'book-1' },
    };
    expect(classifyBookImpact(selfSuccessor)).toMatchObject({
      primaryEffect: 'unsupported',
      reasons: expect.arrayContaining(['invalid-successor-book-ref']),
      requiresRedo: true,
      requiresSuccessor: false,
    });

    const malformedBeforeBase = input(current, current);
    const malformedBefore = {
      ...malformedBeforeBase,
      before: { ...malformedBeforeBase.before, successorBookRef: 'book-1' },
    };
    expect(classifyBookImpact(malformedBefore)).toMatchObject({
      primaryEffect: 'unsupported',
      reasons: expect.arrayContaining(['invalid-successor-book-ref']),
      requiresRedo: true,
    });
  });

  it('returns only answer-safe impact metadata', () => {
    const old = activity('Private title');
    const changed = structuredClone(old);
    const changedInteraction = changed.interactions[0];
    if (!changedInteraction || changedInteraction.family !== 'choice') {
      throw new Error('Expected choice fixture.');
    }
    changedInteraction.prompt = 'Secret prompt';
    changedInteraction.options = ['Secret option', 'Other'];
    changedInteraction.answerKey.acceptedOptionItemIds = [
      changedInteraction.itemIdentities.optionIds[1]!,
    ];

    const result = classifyBookImpact(input(old, changed));
    expect(Object.keys(result).sort()).toEqual([
      'activityDiff',
      'effects',
      'primaryEffect',
      'reasons',
      'requiresExplicitContextResolution',
      'requiresRedo',
      'requiresRegrade',
      'requiresSuccessor',
    ].sort());
    expect(JSON.stringify(result)).not.toMatch(
      /Private title|Secret prompt|Secret option|acceptedOptionIndexes|contextRecord|privateSolo|authorization|mutation|rollback/iu,
    );
  });
});
