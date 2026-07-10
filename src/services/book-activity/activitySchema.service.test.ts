import { describe, expect, it } from 'vitest';
import type { BookActivityEditableJson } from '../../types/bookActivity.types';
import {
  BookActivitySchemaError,
  createActivityMaterialIdentity,
  normalizeActivityRevision,
  validateEditableActivityJson,
} from './activitySchema.service';

const ids = (values: readonly string[]) => {
  let index = 0;
  return () => values[index++] ?? `id-${index}`;
};

const baseActivity = (overrides: Partial<BookActivityEditableJson> = {}): BookActivityEditableJson => ({
  schemaVersion: 1,
  title: 'Vocabulary in context',
  presentationMode: 'structured',
  contextRequirement: 'none',
  instructions: 'Choose the best answer.',
  interactions: [
    {
      family: 'choice',
      prompt: 'Choose A.',
      choices: ['A', 'B'],
    },
  ],
  answerRule: {
    type: 'single-choice',
    correctChoiceIndexes: [0],
  },
  scoring: { points: 1 },
  ...overrides,
});

describe('activitySchema.service', () => {
  it('generates internal Activity identity outside editable JSON', () => {
    const identity = createActivityMaterialIdentity({
      ownerId: 'teacher-1',
      now: '2026-07-09T00:00:00.000Z',
      idFactory: () => 'activity-1',
    });

    expect(identity).toMatchObject({
      activityId: 'activity-1',
      materialId: 'activity-1',
      materialKind: 'interactive-activity',
      ownerId: 'teacher-1',
    });
    expect(() => validateEditableActivityJson({
      ...baseActivity(),
      activityId: 'teacher-supplied',
    })).toThrow(BookActivitySchemaError);
  });

  it('rejects mixed interaction families and multiple answer rules', () => {
    expect(() => validateEditableActivityJson(baseActivity({
      interactions: [
        baseActivity().interactions[0],
        {
          family: 'text-entry',
          prompt: 'Type answer.',
          answerRule: { type: 'text-exact' },
        } as never,
      ],
    }))).toThrow(/one interaction family|own answer rules/);
  });

  it('accepts embedded stimuli and rejects first-class Resource payloads', () => {
    expect(validateEditableActivityJson(baseActivity({
      stimulus: {
        kind: 'text',
        content: 'Read this sentence.',
      },
    })).stimulus).toMatchObject({ kind: 'text' });

    expect(() => validateEditableActivityJson({
      ...baseActivity(),
      resource: { resourceId: 'resource-1' },
    })).toThrow(/forbidden fields/);
  });

  it('validates optional namespaced Task Profile without making taxonomy identity authoritative', () => {
    expect(validateEditableActivityJson(baseActivity({
      taskProfile: {
        taxonomyId: 'ielts',
        typeId: 'matching-headings',
        taxonomyVersion: 'reading-v1',
      },
    })).taskProfile).toMatchObject({ taxonomyId: 'ielts' });

    expect(() => validateEditableActivityJson(baseActivity({
      taskProfile: {
        taxonomyId: 'unknown',
        typeId: 'x',
        taxonomyVersion: 'v1',
      },
    }))).toThrow(/Unsupported taskProfile taxonomy/);
  });

  it('rejects unsupported context requirement values', () => {
    expect(() => validateEditableActivityJson({
      ...baseActivity(),
      contextRequirement: 'always' as never,
    })).toThrow(/Unsupported contextRequirement/);
  });

  it('rejects incomplete or malformed objective answer keys before scoring', () => {
    expect(() => validateEditableActivityJson(baseActivity({
      answerRule: { type: 'single-choice' },
    }))).toThrow(/one correct choice index/);

    expect(() => validateEditableActivityJson(baseActivity({
      answerRule: { type: 'single-choice', correctChoiceIndexes: [2] },
    }))).toThrow(/in-range choice index/);

    expect(() => validateEditableActivityJson(baseActivity({
      answerRule: { type: 'text-exact' },
      interactions: [{ family: 'text-entry', prompt: 'Type answer.' }],
    }))).toThrow(/acceptable answer/);
  });

  it('rejects hidden Interaction IDs in editable JSON and preserves IDs only for exact-structure-safe revisions', () => {
    const first = normalizeActivityRevision(baseActivity(), {
      idFactory: ids(['hidden-1']),
    });
    const safe = normalizeActivityRevision(baseActivity({ title: 'Renamed' }), {
      previousContent: first,
      idFactory: ids(['hidden-2']),
    });
    const changed = normalizeActivityRevision(baseActivity({
      interactions: [
        {
          family: 'choice',
          prompt: 'Choose B.',
          choices: ['A', 'B'],
        },
      ],
    }), {
      previousContent: first,
      idFactory: ids(['hidden-3']),
    });

    expect(first.interactions[0].hiddenInteractionId).toBe('hidden-1');
    expect(safe.interactions[0].hiddenInteractionId).toBe('hidden-1');
    expect(changed.interactions[0].hiddenInteractionId).toBe('hidden-3');
    expect(() => validateEditableActivityJson(baseActivity({
      interactions: [
        {
          ...baseActivity().interactions[0],
          hiddenInteractionId: 'teacher-id',
        } as never,
      ],
    }))).toThrow(/hiddenInteractionId/);
  });
});
