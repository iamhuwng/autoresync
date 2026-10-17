import { describe, expect, it } from 'vitest';
import type {
  ActivityIdProvider,
  ActivitySubmissionAnswer,
  EditableActivity,
  NormalizedActivity,
} from '../../types/bookActivity.types';
import { normalizeActivity } from './activityCanonical.service';
import { diffActivities } from './activityDiff.service';
import { projectStudentActivity } from './activityProjection.service';
import { scoreActivity } from './activityScoring.service';
import { validateEditableActivity } from './activitySchema.service';

const mappedContext = { mappedBookPageRefs: ['source-version-1:page-1'] };
const taskProfileRegistry = [
  {
    taxonomyId: 'ielts-reading',
    typeId: 'multiple-choice',
    taxonomyVersion: 1,
    interactionFamilies: ['choice'],
    variants: ['v1'],
    presentationModes: ['structured', 'source-assisted'],
    contextModes: ['required'],
  },
] as const;

const activity = (
  family: EditableActivity['interaction']['family'] = 'choice',
): EditableActivity => {
  const base = {
    schemaVersion: 1 as const,
    title: 'Activity',
    taskProfile: null,
    presentationMode: 'structured' as const,
    contextRequirement: { mode: 'none' as const, acceptedKinds: [] },
    instructions: [{ text: 'Answer.' }],
    interaction: { family, variant: 'v1' },
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
      ...base,
      interactions: [
        {
          prompt: 'Pick',
          options: ['A', 'B'],
          acceptedOptionIndexes: [0],
        },
      ],
    };
  }
  if (family === 'text-entry') {
    return {
      ...base,
      interactions: [{ prompt: 'Type', acceptedAnswers: ['Hello world'] }],
    };
  }
  if (family === 'matching') {
    return {
      ...base,
      answerRule: { ...base.answerRule, allowOptionReuse: false },
      interactions: [
        {
          prompt: 'Match',
          leftItems: ['A', 'B'],
          rightItems: ['1', '2'],
          acceptedPairs: [
            { left: 'A', right: '1' },
            { left: 'B', right: '2' },
          ],
        },
      ],
    };
  }
  if (family === 'ordering') {
    return {
      ...base,
      interactions: [
        {
          prompt: 'Order',
          orderingItems: ['A', 'B'],
          acceptedOrder: [1, 0],
        },
      ],
    };
  }
  return {
    ...base,
    interactions: [
      { prompt: 'Write', rubric: { criteria: ['Relevant'] } },
    ],
  };
};

const provider = (): ActivityIdProvider => {
  let count = 0;
  return { createId: () => `secure-test-id-${++count}` };
};

const normalized = (
  candidate: EditableActivity = activity(),
): NormalizedActivity =>
  normalizeActivity(candidate, provider(), undefined, mappedContext);

const submission = (
  value: NormalizedActivity,
  answers: ActivitySubmissionAnswer[],
) =>
  value.interactions.map((interaction, index) => ({
    interactionId: interaction.interactionId,
    answer: answers[index] ?? null,
  }));

describe('Book Activity domain', () => {
  it.each([
    'choice',
    'text-entry',
    'matching',
    'ordering',
    'long-response',
  ] as const)('validates every supported family: %s', (family) => {
    expect(validateEditableActivity(activity(family), mappedContext)).toEqual(
      expect.objectContaining({ valid: true, errors: [] }),
    );
  });

  it('accepts omitted optional Task Profile and rejects malformed scoring without throwing', () => {
    const withoutProfile = activity();
    delete withoutProfile.taskProfile;
    expect(validateEditableActivity(withoutProfile).valid).toBe(true);

    const missingScoring = { ...activity() } as Record<string, unknown>;
    delete missingScoring.scoring;
    expect(() => validateEditableActivity(missingScoring)).not.toThrow();
    expect(validateEditableActivity(missingScoring).errors).toContainEqual(
      expect.objectContaining({ path: '$.scoring' }),
    );
    expect(() =>
      validateEditableActivity({ ...activity(), scoring: null }),
    ).not.toThrow();
    expect(
      validateEditableActivity({ ...activity(), scoring: null }).valid,
    ).toBe(false);

    const registered = activity();
    registered.taskProfile = {
      taxonomyId: 'ielts-reading',
      typeId: 'multiple-choice',
      taxonomyVersion: 1,
    };
    registered.contextRequirement = {
      mode: 'required',
      acceptedKinds: ['book-pages'],
    };
    expect(
      validateEditableActivity(registered, { taskProfileRegistry }).valid,
    ).toBe(true);
    expect(validateEditableActivity(registered).errors).toContainEqual(
      expect.objectContaining({
        path: '$.taskProfile',
        code: 'unregistered-task-profile',
      }),
    );

    const contradictory = structuredClone(registered);
    contradictory.interaction.family = 'text-entry';
    expect(
      validateEditableActivity(contradictory, { taskProfileRegistry }).errors,
    ).toContainEqual(
      expect.objectContaining({
        path: '$.interaction.family',
        code: 'task-profile-contradiction',
      }),
    );

    const unnamespaced = structuredClone(registered);
    unnamespaced.taskProfile!.taxonomyId = 'ielts';
    expect(
      validateEditableActivity(unnamespaced, { taskProfileRegistry }).errors,
    ).toContainEqual(
      expect.objectContaining({
        path: '$.taskProfile.taxonomyId',
        code: 'invalid-task-profile',
      }),
    );
  });

  it('fails closed for unknown, forbidden, hidden, sparse, duplicate, and non-finite input', () => {
    const candidate = activity();
    expect(
      validateEditableActivity({ ...candidate, activityId: 'editable-forbidden' })
        .errors,
    ).toContainEqual(expect.objectContaining({ path: '$.activityId' }));
    expect(
      validateEditableActivity({
        ...candidate,
        answerRule: { ...candidate.answerRule, defaultPoints: Infinity },
      }).valid,
    ).toBe(false);
    expect(
      validateEditableActivity({
        ...activity('text-entry'),
        interactions: [
          { prompt: 'Type', acceptedAnswers: [' Hello ', 'hello'] },
        ],
      }).errors,
    ).toContainEqual(
      expect.objectContaining({ code: 'duplicate-semantic-item' }),
    );
    expect(
      validateEditableActivity({
        ...candidate,
        assetRefs: [
          { kind: 'audio', assetId: 'a' },
          { kind: 'audio', assetId: 'a' },
        ],
      }).valid,
    ).toBe(false);

    const options = ['A', 'B'];
    Object.defineProperty(options, 'secret', {
      value: 'hidden',
      enumerable: false,
    });
    expect(
      validateEditableActivity({
        ...candidate,
        interactions: [
          { ...candidate.interactions[0], options },
        ],
      }).valid,
    ).toBe(false);

    const sparse = Array<string>(2);
    expect(
      validateEditableActivity({
        ...candidate,
        interactions: [
          { ...candidate.interactions[0], options: sparse },
        ],
      }).valid,
    ).toBe(false);
  });

  it('enforces shared choice cardinality and matching option-reuse rules', () => {
    const choice = activity('choice');
    choice.answerRule.requiredSelectionCount = 2;
    expect(validateEditableActivity(choice).valid).toBe(false);

    const matching = activity('matching');
    matching.interactions[0]!.acceptedPairs = [
      { left: 'A', right: '1' },
      { left: 'A', right: '2' },
    ];
    expect(validateEditableActivity(matching).valid).toBe(false);

    matching.interactions[0]!.acceptedPairs = [
      { left: 'A', right: '1' },
      { left: 'B', right: '1' },
    ];
    expect(validateEditableActivity(matching).valid).toBe(false);
    matching.answerRule.allowOptionReuse = true;
    expect(validateEditableActivity(matching).valid).toBe(true);
  });

  it('requires trusted page refs and accessible source correspondence with compatible shape', () => {
    const candidate = activity();
    candidate.presentationMode = 'source-assisted';
    candidate.contextRequirement = {
      mode: 'required',
      acceptedKinds: ['book-pages'],
    };
    candidate.interactions[0]!.sourceAssisted = {
      questionLabel: '1',
      accessiblePrompt: 'Choose answer for question 1.',
      responseShape: 'single-choice',
      sourceExerciseLabel: 'Exercise 2',
      sourcePartLabel: 'A',
    };
    expect(validateEditableActivity(candidate).valid).toBe(false);
    expect(validateEditableActivity(candidate, mappedContext).valid).toBe(true);
    expect(
      validateEditableActivity(candidate, {
        mappedBookPageRefs: Array<string>(1),
      }).valid,
    ).toBe(false);

    candidate.interactions[0]!.sourceAssisted.responseShape = 'long-response';
    expect(validateEditableActivity(candidate, mappedContext).valid).toBe(false);
    candidate.interactions[0]!.sourceAssisted.responseShape = 'single-choice';
    candidate.contextRequirement.acceptedKinds = [];
    expect(validateEditableActivity(candidate, mappedContext).valid).toBe(false);

    candidate.contextRequirement.acceptedKinds = ['book-pages'];
    candidate.interactions[0]!.sourceAssisted.responseShape = 'single-choice';
    delete candidate.interactions[0]!.sourceAssisted.sourcePartLabel;
    candidate.answerRule.requiredSelectionCount = 2;
    candidate.interactions[0]!.acceptedOptionIndexes = [0, 1];
    expect(validateEditableActivity(candidate, mappedContext).valid).toBe(false);
    candidate.interactions[0]!.sourceAssisted.responseShape = 'multiple-choice';
    expect(validateEditableActivity(candidate, mappedContext).valid).toBe(true);
  });

  it('mints identities after validation and preserves all only for exact topology', () => {
    let calls = 0;
    const ids = { createId: () => `identity-${++calls}` };
    expect(() =>
      normalizeActivity({ ...activity(), activityId: 'bad' }, ids),
    ).toThrow();
    expect(calls).toBe(0);

    const first = normalizeActivity(activity(), ids);
    const display = normalizeActivity(
      { ...activity(), title: 'Display only' },
      ids,
      first,
    );
    expect(display.interactions[0]!.interactionId).toBe(
      first.interactions[0]!.interactionId,
    );
    expect(display.interactions[0]!.itemIdentities).toEqual(
      first.interactions[0]!.itemIdentities,
    );

    const withTwo = activity();
    withTwo.interactions.push({
      prompt: 'Pick two',
      options: ['C', 'D'],
      acceptedOptionIndexes: [1],
    });
    const replaced = normalizeActivity(withTwo, ids, first);
    expect(replaced.interactions[0]!.interactionId).not.toBe(
      first.interactions[0]!.interactionId,
    );
    expect(
      replaced.interactions[0]!.itemIdentities,
    ).not.toEqual(first.interactions[0]!.itemIdentities);

    const oneSelection = activity();
    oneSelection.answerRule.requiredSelectionCount = 1;
    const oneSelectionNormalized = normalizeActivity(oneSelection, ids);
    const twoSelections = structuredClone(oneSelection);
    twoSelections.answerRule.requiredSelectionCount = 2;
    twoSelections.interactions[0]!.acceptedOptionIndexes = [0, 1];
    const twoSelectionsNormalized = normalizeActivity(
      twoSelections,
      ids,
      oneSelectionNormalized,
    );
    expect(twoSelectionsNormalized.interactions[0]!.interactionId).not.toBe(
      oneSelectionNormalized.interactions[0]!.interactionId,
    );

    const source = activity();
    source.presentationMode = 'source-assisted';
    source.contextRequirement = {
      mode: 'required',
      acceptedKinds: ['book-pages'],
    };
    source.interactions[0]!.sourceAssisted = {
      questionLabel: '1',
      accessiblePrompt: 'Choose answer one.',
      responseShape: 'single-choice',
      sourceExerciseLabel: 'Exercise',
    };
    const sourceFirst = normalizeActivity(
      source,
      ids,
      undefined,
      mappedContext,
    );
    const sourceAccessibilityEdit = structuredClone(source);
    sourceAccessibilityEdit.interactions[0]!.sourceAssisted!.accessiblePrompt =
      'Choose the answer for question one.';
    const sourceSecond = normalizeActivity(
      sourceAccessibilityEdit,
      ids,
      sourceFirst,
      mappedContext,
    );
    expect(sourceSecond.interactions[0]!.interactionId).toBe(
      sourceFirst.interactions[0]!.interactionId,
    );
    expect(diffActivities(sourceFirst, sourceSecond).classification).toBe(
      'display-only',
    );

    const weak = { createId: () => 'duplicate' };
    expect(() => normalizeActivity(activity(), weak)).toThrow(
      'invalid or duplicate identity',
    );
  });

  it('classifies every semantic impact deterministically with redo precedence', () => {
    const old = normalized();
    expect(diffActivities(null, old)).toMatchObject({
      classification: 'added',
      requiresRedo: false,
    });
    expect(diffActivities(old, null)).toMatchObject({
      classification: 'removed',
      requiresRedo: false,
    });

    const display = structuredClone(old);
    display.title = 'new';
    expect(diffActivities(old, display).classification).toBe('display-only');

    const key = structuredClone(old);
    if (key.interactions[0]!.answerKey.family !== 'choice') throw new Error();
    const optionIds =
      key.interactions[0]!.itemIdentities.family === 'choice'
        ? key.interactions[0]!.itemIdentities.optionIds
        : [];
    key.interactions[0]!.answerKey.acceptedOptionItemIds = [optionIds[1]!];
    expect(diffActivities(old, key).classification).toBe('regrade');

    const responseRule = structuredClone(old);
    responseRule.answerRule.requiredSelectionCount = 2;
    expect(diffActivities(old, responseRule)).toMatchObject({
      classification: 'redo-required',
      requiresRedo: true,
    });

    const redo = structuredClone(old);
    redo.interactions[0]!.prompt = 'new prompt';
    expect(diffActivities(old, redo).classification).toBe('redo-required');

    const two = activity();
    two.interactions.push({
      prompt: 'Pick two',
      options: ['C', 'D'],
      acceptedOptionIndexes: [1],
    });
    const beforeReorder = normalized(two);
    const reordered = structuredClone(beforeReorder);
    reordered.interactions.reverse();
    expect(diffActivities(beforeReorder, reordered)).toEqual({
      classification: 'reordered',
      reasons: ['interaction-reordered'],
      requiresRedo: true,
    });
    reordered.interactions[0]!.prompt = 'changed too';
    expect(diffActivities(beforeReorder, reordered).classification).toBe(
      'redo-required',
    );

    const context = structuredClone(old);
    context.contextRequirement = {
      mode: 'optional',
      acceptedKinds: ['book-pages'],
    };
    expect(diffActivities(old, context).classification).toBe(
      'presentation-context',
    );
    if (context.interactions[0]!.answerKey.family !== 'choice') throw new Error();
    if (context.interactions[0]!.itemIdentities.family !== 'choice') {
      throw new Error();
    }
    context.interactions[0]!.answerKey.acceptedOptionItemIds = [
      context.interactions[0]!.itemIdentities.optionIds[1]!,
    ];
    expect(diffActivities(old, context).classification).toBe('regrade');

    const sourceAssisted = activity();
    sourceAssisted.presentationMode = 'source-assisted';
    sourceAssisted.contextRequirement = {
      mode: 'required',
      acceptedKinds: ['book-pages'],
    };
    sourceAssisted.interactions[0]!.sourceAssisted = {
      questionLabel: '1',
      accessiblePrompt: 'Choose answer one.',
      responseShape: 'single-choice',
      sourceExerciseLabel: 'Exercise',
    };
    sourceAssisted.interactions.push({
      prompt: 'Pick two',
      options: ['C', 'D'],
      acceptedOptionIndexes: [1],
      sourceAssisted: {
        questionLabel: '2',
        accessiblePrompt: 'Choose answer two.',
        responseShape: 'single-choice',
        sourceExerciseLabel: 'Exercise',
      },
    });
    const sourceBeforeReorder = normalized(sourceAssisted);
    const sourceAfterReorder = structuredClone(sourceBeforeReorder);
    sourceAfterReorder.interactions.reverse();
    expect(diffActivities(sourceBeforeReorder, sourceAfterReorder)).toEqual({
      classification: 'reordered',
      reasons: ['interaction-reordered'],
      requiresRedo: true,
    });

    const unsupported = structuredClone(old);
    unsupported.schemaVersion = 2 as 1;
    expect(diffActivities(old, unsupported).classification).toBe('unsupported');
  });

  it('projects only student-safe data plus opaque runtime-required identities', () => {
    for (const family of [
      'choice',
      'text-entry',
      'matching',
      'ordering',
      'long-response',
    ] as const) {
      const value = normalized(activity(family));
      (value as unknown as Record<string, unknown>).ownerId = 'teacher';
      for (const visibility of [
        'none',
        'after-submit',
        'after-review',
      ] as const) {
        const projection = projectStudentActivity(value, visibility);
        const serialized = JSON.stringify(projection);
        expect(projection.interactions[0]!.interactionId).toBe(
          value.interactions[0]!.interactionId,
        );
        expect(serialized).not.toContain('answerKey');
        expect(serialized).not.toContain('acceptedOption');
        expect(serialized).not.toContain('acceptedAnswers');
        expect(serialized).not.toContain('rubric');
        expect(serialized).not.toContain('ownerId');
        expect(serialized).not.toContain('provenance');
      }
    }
  });

  it('rebuilds nested student projection objects from explicit allowlists', () => {
    const value = normalized(activity('choice'));
    (value as any).taskProfile = {
      taxonomyId: 'ielts-reading',
      typeId: 'multiple-choice',
      taxonomyVersion: 1,
      ownerId: 'teacher-secret',
    };
    (value as any).stimulus = {
      kind: 'text',
      text: 'Visible stimulus',
      teacherNotes: 'hidden stimulus note',
    };
    (value.interactions[0] as any).sourceAssisted = {
      questionLabel: 'Question 1',
      accessiblePrompt: 'Choose one answer.',
      responseShape: 'single-choice',
      sourceExerciseLabel: 'Exercise A',
      provenance: 'hidden source authority',
    };

    const projection = projectStudentActivity(value);
    expect(projection.taskProfile).toEqual({
      taxonomyId: 'ielts-reading',
      typeId: 'multiple-choice',
      taxonomyVersion: 1,
    });
    expect(projection.stimulus).toEqual({
      kind: 'text',
      text: 'Visible stimulus',
    });
    expect(projection.interactions[0]!.sourceAssisted).toEqual({
      questionLabel: 'Question 1',
      accessiblePrompt: 'Choose one answer.',
      responseShape: 'single-choice',
      sourceExerciseLabel: 'Exercise A',
    });
    expect(JSON.stringify(projection)).not.toMatch(
      /teacherNotes|ownerId|provenance|teacher-secret|hidden source authority/,
    );
  });

  it('scores identity-based objective answers, partial work, and invalid shapes', () => {
    const choice = normalized(activity('choice'));
    if (choice.interactions[0]!.itemIdentities.family !== 'choice') throw new Error();
    const correctChoice = choice.interactions[0]!.itemIdentities.optionIds[0]!;
    expect(scoreActivity(choice, submission(choice, [[correctChoice]]))).toMatchObject({
      status: 'scored',
      earnedScore: 1,
      displayScore: '1.00 / 1.00',
    });
    expect(scoreActivity(choice, submission(choice, [[]]))).toMatchObject({
      status: 'scored',
      earnedScore: 0,
    });
    expect(scoreActivity(choice, submission(choice, [['unknown']]))).toMatchObject({
      status: 'invalid',
    });
    expect(
      scoreActivity(choice, [
        { interactionId: 'x'.repeat(161), answer: [correctChoice] },
      ]),
    ).toMatchObject({ status: 'invalid' });
    expect(
      scoreActivity(choice, submission(choice, [['x'.repeat(161)]])),
    ).toMatchObject({ status: 'invalid' });
    const accessorChoiceAnswer = Object.defineProperty([], '0', {
      enumerable: true,
      get: () => {
        throw new Error('must not execute choice answer accessor');
      },
    });
    accessorChoiceAnswer.length = 1;
    expect(
      scoreActivity(
        choice,
        submission(choice, [accessorChoiceAnswer]),
      ),
    ).toMatchObject({ status: 'invalid' });
    expect(
      scoreActivity(
        choice,
        submission(choice, [[correctChoice, correctChoice]]),
      ),
    ).toMatchObject({
      status: 'invalid',
    });

    const text = normalized(activity('text-entry'));
    expect(
      scoreActivity(text, submission(text, [' HELLO   WORLD '])),
    ).toMatchObject({
      status: 'scored',
      earnedScore: 1,
    });

    const matching = normalized(activity('matching'));
    if (matching.interactions[0]!.itemIdentities.family !== 'matching') {
      throw new Error();
    }
    const matchingIds = matching.interactions[0]!.itemIdentities;
    expect(
      scoreActivity(
        matching,
        submission(matching, [[
          {
            leftItemId: matchingIds.leftItemIds[0]!,
            rightItemId: matchingIds.rightItemIds[0]!,
          },
          {
            leftItemId: matchingIds.leftItemIds[1]!,
            rightItemId: matchingIds.rightItemIds[1]!,
          },
        ]]),
      ),
    ).toMatchObject({ status: 'scored', earnedScore: 1 });
    expect(
      scoreActivity(
        matching,
        submission(matching, [[
          {
            leftItemId: matchingIds.leftItemIds[0]!,
            rightItemId: 'unknown',
          },
        ]]),
      ),
    ).toMatchObject({ status: 'invalid' });
    expect(
      scoreActivity(
        matching,
        submission(matching, [[
          {
            leftItemId: 'x'.repeat(161),
            rightItemId: matchingIds.rightItemIds[0]!,
          },
        ]]),
      ),
    ).toMatchObject({ status: 'invalid' });
    const accessorPair = {
      leftItemId: matchingIds.leftItemIds[0]!,
      rightItemId: matchingIds.rightItemIds[0]!,
    };
    Object.defineProperty(accessorPair, 'leftItemId', {
      enumerable: true,
      get: () => {
        throw new Error('must not execute matching pair accessor');
      },
    });
    expect(
      scoreActivity(
        matching,
        submission(matching, [[accessorPair]]),
      ),
    ).toMatchObject({ status: 'invalid' });

    const ordering = normalized(activity('ordering'));
    if (ordering.interactions[0]!.answerKey.family !== 'ordering') throw new Error();
    expect(
      scoreActivity(
        ordering,
        submission(ordering, [
          ordering.interactions[0]!.answerKey.acceptedOrderItemIds,
        ]),
      ),
    ).toMatchObject({ status: 'scored', earnedScore: 1 });
    expect(
      scoreActivity(ordering, submission(ordering, [['unknown']])),
    ).toMatchObject({
      status: 'invalid',
    });
    expect(
      scoreActivity(ordering, submission(ordering, [['x'.repeat(161)]])),
    ).toMatchObject({ status: 'invalid' });

    const reviewedChoiceCandidate = activity('choice');
    reviewedChoiceCandidate.scoring.mode = 'review-required';
    expect(validateEditableActivity(reviewedChoiceCandidate).valid).toBe(true);
    const reviewedChoice = normalized(reviewedChoiceCandidate);
    if (
      reviewedChoice.interactions[0]!.itemIdentities.family !== 'choice'
    ) {
      throw new Error();
    }
    expect(
      scoreActivity(
        reviewedChoice,
        submission(reviewedChoice, [[
          reviewedChoice.interactions[0]!.itemIdentities.optionIds[0]!,
        ]]),
      ),
    ).toEqual({ status: 'review_required' });
  });

  it('bounds review-required submissions and never fabricates a score', () => {
    const longResponse = normalized(activity('long-response'));
    expect(
      scoreActivity(longResponse, submission(longResponse, ['essay'])),
    ).toEqual({
      status: 'review_required',
    });
    expect(
      scoreActivity(
        longResponse,
        submission(longResponse, ['x'.repeat(20_001)]),
      ),
    ).toMatchObject({ status: 'invalid' });
    expect(scoreActivity(longResponse, [])).toMatchObject({ status: 'invalid' });
  });
});
