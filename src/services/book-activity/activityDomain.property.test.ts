import { describe, expect, it } from 'vitest';
import type {
  ActivitySubmissionAnswer,
  EditableActivity,
  NormalizedActivity,
} from '../../types/bookActivity.types';
import { normalizeActivity } from './activityCanonical.service';
import { diffActivities } from './activityDiff.service';
import { scoreActivity } from './activityScoring.service';
import { validateEditableActivity } from './activitySchema.service';

let sequence = 0;
const provider = { createId: () => `cryptographic-test-id-${++sequence}` };
const mappedContext = { mappedBookPageRefs: ['source-1:page-1'] };
const submission = (
  value: NormalizedActivity,
  answers: ActivitySubmissionAnswer[],
) =>
  value.interactions.map((interaction, index) => ({
    interactionId: interaction.interactionId,
    answer: answers[index] ?? null,
  }));

const candidate = (
  family: EditableActivity['interaction']['family'],
  index = 0,
): EditableActivity => {
  const root = {
    schemaVersion: 1 as const,
    title: `T${index}`,
    taskProfile: null,
    presentationMode: 'structured' as const,
    contextRequirement: { mode: 'none' as const, acceptedKinds: [] },
    instructions: [{ text: 'Do it' }],
    interaction: { family, variant: 'bounded' },
    answerRule: {
      defaultPoints: 1,
      normalization: 'trim-case-and-spacing' as const,
    },
    stimulus: null,
    assetRefs: [],
    scoring: {
      mode:
        family === 'long-response'
          ? 'review-required' as const
          : 'auto-where-possible' as const,
    },
  };
  if (family === 'choice') {
    return {
      ...root,
      interactions: [
        {
          prompt: `P${index}`,
          options: [`a${index}`, `b${index}`],
          acceptedOptionIndexes: [0],
        },
      ],
    };
  }
  if (family === 'text-entry') {
    return {
      ...root,
      interactions: [
        { prompt: `P${index}`, acceptedAnswers: [`answer ${index}`] },
      ],
    };
  }
  if (family === 'matching') {
    return {
      ...root,
      answerRule: { ...root.answerRule, allowOptionReuse: false },
      interactions: [
        {
          prompt: `P${index}`,
          leftItems: [`left ${index}`],
          rightItems: [`right ${index}`],
          acceptedPairs: [
            { left: `left ${index}`, right: `right ${index}` },
          ],
        },
      ],
    };
  }
  if (family === 'ordering') {
    return {
      ...root,
      interactions: [
        {
          prompt: `P${index}`,
          orderingItems: [`one ${index}`, `two ${index}`],
          acceptedOrder: [1, 0],
        },
      ],
    };
  }
  return {
    ...root,
    interactions: [
      { prompt: `P${index}`, rubric: { criteria: [`criterion ${index}`] } },
    ],
  };
};

describe('Book Activity bounded property fixtures', () => {
  it('accepts every family across bounded variants and rejects nested unknowns', () => {
    const families = [
      'choice',
      'text-entry',
      'matching',
      'ordering',
      'long-response',
    ] as const;
    for (let index = 0; index < 50; index += 1) {
      const value = candidate(families[index % families.length]!, index);
      expect(validateEditableActivity(value, mappedContext).valid).toBe(true);
      expect(
        validateEditableActivity(
          {
            ...value,
            interactions: [
              { ...value.interactions[0], unknownNested: true },
            ],
          },
          mappedContext,
        ).valid,
      ).toBe(false);
    }
  });

  it('rejects malformed, over-limit, sparse, symbol-keyed, and inaccessible fixtures', () => {
    expect(
      validateEditableActivity({
        ...candidate('choice'),
        title: 'x'.repeat(4_001),
      }).valid,
    ).toBe(false);
    expect(
      validateEditableActivity({
        ...candidate('choice'),
        interactions: Array.from({ length: 51 }, () => ({
          prompt: 'x',
          options: ['a'],
          acceptedOptionIndexes: [0],
        })),
      }).valid,
    ).toBe(false);

    const sparseInstructions = Array<{ text: string }>(1);
    expect(
      validateEditableActivity({
        ...candidate('choice'),
        instructions: sparseInstructions,
      }).valid,
    ).toBe(false);

    const optionArray = ['a', 'b'];
    Object.defineProperty(optionArray, Symbol('hidden'), {
      value: 'secret',
      enumerable: true,
    });
    const hidden = candidate('choice');
    hidden.interactions[0]!.options = optionArray;
    expect(validateEditableActivity(hidden).valid).toBe(false);

    const source = candidate('choice');
    source.presentationMode = 'source-assisted';
    source.contextRequirement = {
      mode: 'optional',
      acceptedKinds: ['book-pages'],
    };
    expect(validateEditableActivity(source, mappedContext).valid).toBe(false);
    source.contextRequirement.mode = 'required';
    source.interactions[0]!.sourceAssisted = {
      questionLabel: '1',
      accessiblePrompt: 'Answer one',
      responseShape: 'single-choice',
      sourceExerciseLabel: 'E',
      sourcePartLabel: 'A',
    };
    expect(validateEditableActivity(source).valid).toBe(false);
    expect(validateEditableActivity(source, mappedContext).valid).toBe(true);
  });

  it('remints all topology identities and keeps diff/scoring deterministic', () => {
    const firstCandidate = candidate('choice');
    firstCandidate.interactions.push({
      prompt: 'P2',
      options: ['c', 'd'],
      acceptedOptionIndexes: [1],
    });
    const first = normalizeActivity(
      firstCandidate,
      provider,
      undefined,
      mappedContext,
    );
    const retained = normalizeActivity(
      { ...firstCandidate, title: 'display' },
      provider,
      first,
      mappedContext,
    );
    expect(retained.interactions.map((item) => item.interactionId)).toEqual(
      first.interactions.map((item) => item.interactionId),
    );

    const reorderedCandidate = structuredClone(firstCandidate);
    reorderedCandidate.interactions.reverse();
    const reordered = normalizeActivity(
      reorderedCandidate,
      provider,
      first,
      mappedContext,
    );
    reordered.interactions.forEach((item) => {
      expect(
        first.interactions.some(
          (previous) => previous.interactionId === item.interactionId,
        ),
      ).toBe(false);
    });

    const semanticReorder = diffActivities(first, reordered);
    expect(semanticReorder).toEqual(diffActivities(first, reordered));
    expect(semanticReorder).toMatchObject({
      classification: 'reordered',
      requiresRedo: true,
    });

    if (first.interactions[0]!.itemIdentities.family !== 'choice') throw new Error();
    const correctId = first.interactions[0]!.itemIdentities.optionIds[0]!;
    const boundSubmission = submission(first, [[correctId], null]);
    const reversedSubmission = [...boundSubmission].reverse();
    expect(
      scoreActivity(first, boundSubmission),
    ).toEqual(
      scoreActivity(first, reversedSubmission),
    );
    expect(
      scoreActivity(first, reversedSubmission),
    ).toMatchObject({
      status: 'scored',
      earnedScore: 1,
      maximumScore: 2,
    });
    expect(
      scoreActivity(first, [
        ...boundSubmission.slice(0, 1),
        { interactionId: 'stale-interaction', answer: null },
      ]),
    ).toMatchObject({ status: 'invalid' });
  });
});
