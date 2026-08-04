import { describe, expect, it } from 'vitest';
import type {
  ActivitySubmission,
  NormalizedActivity,
} from '../../src/types/bookActivity.types';
import type { BookRuntimeAttemptRecord } from '../../src/services/book-activity/activityRuntimeAttempt.types';
import {
  createTrustedBookActivityEvaluationService,
} from '../../src/services/book-activity/activityEvaluation.service';
import {
  ACTIVITY_EVALUATION_SCHEMA_VERSION,
  ACTIVITY_EVALUATION_SCORER_VERSION,
  type BookActivityEvaluationActor,
  type BookActivityEvaluationAuthority,
  type BookActivityEvaluationCommand,
  type BookActivityEvaluationTarget,
  type ResolvedBookActivityEvaluationAttempt,
} from '../../src/services/book-activity/activityEvaluation.types';
import {
  FirebaseRestBookActivityEvaluationRepository,
  InMemoryBookActivityEvaluationRepository,
  bookActivityEvaluationScopePath,
} from '../src/upload-worker/book-activity-grading/repository';
import {
  readImmutableBookActivityEvaluationHistory,
} from '../src/upload-worker/book-activity-grading/immutable-history';
import {
  bookActivityEvaluationRouteDescriptors,
} from '../src/upload-worker/book-activity-grading/route';

const TIME = '2026-08-01T14:00:00.000Z';

const choiceActivity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Objective',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
  instructions: [{ text: 'Choose.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'choice', variant: 'single' },
  answerRule: {
    defaultPoints: 1,
    normalization: 'exact',
    requiredSelectionCount: 1,
  },
  interactions: [{
    family: 'choice',
    interactionId: 'interaction-1',
    prompt: 'Pick A',
    options: ['A', 'B'],
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: ['option-a'] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const textEntryActivity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Text entry',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
  instructions: [{ text: 'Type.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'text-entry', variant: 'short-answer' },
  answerRule: { defaultPoints: 2, normalization: 'trim-case-and-spacing' },
  interactions: [{
    family: 'text-entry',
    interactionId: 'interaction-1',
    prompt: 'Type A',
    itemIdentities: { family: 'text-entry', itemIds: [] },
    answerKey: { family: 'text-entry', acceptedAnswers: ['Answer'] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const matchingActivity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Matching',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
  instructions: [{ text: 'Match.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'matching', variant: 'pairs' },
  answerRule: { defaultPoints: 3, normalization: 'exact' },
  interactions: [{
    family: 'matching',
    interactionId: 'interaction-1',
    prompt: 'Match A',
    itemIdentities: {
      family: 'matching',
      leftItemIds: ['left-a'],
      rightItemIds: ['right-a'],
    },
    answerKey: {
      family: 'matching',
      acceptedPairs: [{ leftItemId: 'left-a', rightItemId: 'right-a' }],
    },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const orderingActivity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Ordering',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
  instructions: [{ text: 'Order.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'ordering', variant: 'sequence' },
  answerRule: { defaultPoints: 4, normalization: 'exact' },
  interactions: [{
    family: 'ordering',
    interactionId: 'interaction-1',
    prompt: 'Order A',
    itemIdentities: { family: 'ordering', itemIds: ['item-a', 'item-b'] },
    answerKey: { family: 'ordering', acceptedOrderItemIds: ['item-a', 'item-b'] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const longResponseActivity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Subjective',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
  instructions: [{ text: 'Write.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'long-response', variant: 'essay' },
  answerRule: { defaultPoints: 10, normalization: 'exact' },
  interactions: [{
    family: 'long-response',
    interactionId: 'interaction-1',
    prompt: 'Explain',
    itemIdentities: { family: 'long-response', itemIds: [] },
    answerKey: { family: 'long-response', rubric: { criteria: ['Relevant'] } },
  }],
  scoring: { mode: 'review-required' },
});

const attempt = (): BookRuntimeAttemptRecord => ({
  schemaVersion: 1,
  attemptId: 'attempt-1',
  bindingId: 'binding-1',
  bindingRevision: 4,
  recipientId: 'student-1',
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 3,
  interactionId: 'interaction-1',
  activityVersionId: 'activity-version-3',
  acknowledgedDraftRevision: 2,
  attemptNumber: 1,
  pageGroupKeys: ['page-group-1'],
  sourceProvenance: [{
    sourceKey: 'source-1',
    sourceVersionId: 'source-version-7',
    pages: [4, 5],
  }],
  feedbackRelease: 'pending',
  response: { selectedOptionIds: ['option-a'] },
  createdByOperationId: 'submit-operation-1',
  createdAt: '2026-08-01T13:00:00.000Z',
  submissionScope: 'activity',
  requiredInteractionIds: ['interaction-1'],
  submittedInteractionIds: ['interaction-1'],
});

const target = (kind: BookActivityEvaluationTarget['contextKind'] = 'homework'): BookActivityEvaluationTarget => {
  const value = attempt();
  return {
    attemptId: value.attemptId,
    resultId: `${value.attemptId}:result`,
    recipientId: value.recipientId,
    bindingId: value.bindingId,
    bindingRevision: value.bindingRevision,
    contextKind: kind,
    contextId: value.contextId,
    placementId: value.placementId,
    activityId: value.activityId,
    activityVersion: value.activityVersion,
    interactionId: value.interactionId,
    activityVersionId: value.activityVersionId,
    attemptNumber: value.attemptNumber,
    pageGroupKeys: [...value.pageGroupKeys],
    sourceProvenance: structuredClone(value.sourceProvenance),
  };
};

const objectiveCommand = (
  overrides: Partial<BookActivityEvaluationCommand> = {},
): BookActivityEvaluationCommand => ({
  schemaVersion: ACTIVITY_EVALUATION_SCHEMA_VERSION,
  scorerVersion: ACTIVITY_EVALUATION_SCORER_VERSION,
  operationId: 'evaluation-operation-1',
  kind: 'evaluate_objective',
  expectedEvaluationRevision: 0,
  target: target(),
  ...overrides,
} as BookActivityEvaluationCommand);

const scorer: BookActivityEvaluationActor = {
  kind: 'trusted_scorer',
  serviceIdentity: 'ticket89-scorer',
};

const resolved = (
  activity: NormalizedActivity = choiceActivity(),
  contextKind: BookActivityEvaluationTarget['contextKind'] = 'homework',
): ResolvedBookActivityEvaluationAttempt => {
  const answerValue = activity.interaction.family === 'long-response'
    ? 'Essay'
    : activity.interaction.family === 'choice'
      ? ['option-a']
      : activity.interaction.family === 'text-entry'
        ? 'Answer'
        : activity.interaction.family === 'matching'
          ? [{ leftItemId: 'left-a', rightItemId: 'right-a' }]
          : ['item-a', 'item-b'];
  const answer: ActivitySubmission = [{
    interactionId: 'interaction-1',
    answer: answerValue,
  }];
  return { attempt: attempt(), contextKind, activity, submission: answer };
};

const authority = (
  inputTarget: BookActivityEvaluationTarget,
  ownerId = 'teacher-1',
): BookActivityEvaluationAuthority => ({
  ownerId,
  recipientId: inputTarget.recipientId,
  bindingId: inputTarget.bindingId,
  bindingRevision: inputTarget.bindingRevision,
  contextKind: inputTarget.contextKind,
  contextId: inputTarget.contextId,
  placementId: inputTarget.placementId,
  activityId: inputTarget.activityId,
  activityVersion: inputTarget.activityVersion,
  activityVersionId: inputTarget.activityVersionId,
});

const harness = (
  resolvedAttempt: ResolvedBookActivityEvaluationAttempt = resolved(),
  ownerId = 'teacher-1',
  authorityMutator?: (value: BookActivityEvaluationAuthority) => BookActivityEvaluationAuthority,
) => {
  const repository = new InMemoryBookActivityEvaluationRepository();
  const service = createTrustedBookActivityEvaluationService({
    repository,
    trustedScorerIdentity: 'ticket89-scorer',
    now: () => TIME,
    resolveAttempt: async () => resolvedAttempt,
    resolveTeacherAuthority: async ({ target: requested }) => {
      const resolvedAuthority = authority(requested, ownerId);
      return authorityMutator ? authorityMutator(resolvedAuthority) : resolvedAuthority;
    },
  });
  return { repository, service };
};

describe('trusted Book Activity evaluation command', () => {
  it('scores objective work only through the canonical scorer and persists versioned visibility-neutral facts', async () => {
    const { repository, service } = harness();
    const result = await service.applyEvaluationCommand(objectiveCommand(), scorer);
    expect(result).toMatchObject({
      status: 'accepted',
      revision: {
        schemaVersion: 1,
        revision: 1,
        previousRevision: 0,
        scorerVersion: 1,
        activitySchemaVersion: 1,
        facts: {
          status: 'scored',
          earnedScore: 1,
          maximumScore: 1,
          displayScore: '1.00 / 1.00',
          correctionFacts: [],
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/visibility|releasePolicy|feedbackRelease/u);
    const scope = repository.snapshot().scopes[bookActivityEvaluationScopePath(target())]!;
    expect(scope.current).toEqual(scope.history?.r000001);
    expect(scope.aggregateScores?.r000001).toMatchObject({ earnedScore: 1, maximumScore: 1 });
  });

  it.each([
    ['choice', choiceActivity, 1],
    ['text-entry', textEntryActivity, 2],
    ['matching', matchingActivity, 3],
    ['ordering', orderingActivity, 4],
  ] as const)('uses the canonical scorer for supported objective family %s', async (_family, makeActivity, score) => {
    const { repository, service } = harness(resolved(makeActivity()));
    const result = await service.applyEvaluationCommand(objectiveCommand(), scorer);
    expect(result).toMatchObject({
      status: 'accepted',
      revision: { facts: { status: 'scored', earnedScore: score, maximumScore: score } },
    });
    expect(repository.snapshot().scopes[bookActivityEvaluationScopePath(target())]!.current?.scorerVersion)
      .toBe(ACTIVITY_EVALUATION_SCORER_VERSION);
  });

  it('returns the same canonical revision for duplicate commands and rejects conflicting replay', async () => {
    const { repository, service } = harness();
    const command = objectiveCommand();
    const first = await service.applyEvaluationCommand(command, scorer);
    const duplicate = await service.applyEvaluationCommand(command, scorer);
    const conflict = await service.applyEvaluationCommand({
      ...command,
      expectedEvaluationRevision: 1,
    }, scorer);
    expect(first.status).toBe('accepted');
    expect(duplicate).toEqual({
      status: 'replayed',
      revision: first.status === 'accepted' ? first.revision : undefined,
    });
    expect(conflict).toEqual({
      status: 'rejected',
      code: 'evaluation_replay_conflict',
      currentRevision: 1,
    });
    expect(Object.keys(repository.snapshot().scopes[
      bookActivityEvaluationScopePath(target())
    ]!.history ?? {})).toHaveLength(1);
  });

  it('keeps subjective work review-required until an authorized teacher evaluation, then appends regrades', async () => {
    const subjective = resolved(longResponseActivity());
    const originalAttempt = structuredClone(subjective.attempt);
    const { repository, service } = harness(subjective);
    const pending = await service.applyEvaluationCommand(objectiveCommand(), scorer);
    expect(pending).toEqual({
      status: 'rejected',
      code: 'evaluation_subjective_teacher_required',
    });
    expect(repository.snapshot()).toEqual({ scopes: {} });
    const teacherCommand: BookActivityEvaluationCommand = {
      ...objectiveCommand(),
      operationId: 'teacher-evaluation-1',
      kind: 'teacher_evaluation',
      expectedEvaluationRevision: 0,
      evaluation: {
        earnedScore: 8.5,
        maximumScore: 10,
        feedback: 'Clear reasoning.',
        correctionFacts: [{
          interactionId: 'interaction-1',
          outcome: 'partial',
          note: 'Add one supporting detail.',
        }],
      },
    };
    const teacher = { kind: 'teacher', uid: 'teacher-1' } as const;
    const evaluated = await service.applyEvaluationCommand(teacherCommand, teacher);
    expect(evaluated).toMatchObject({
      status: 'accepted',
      revision: { revision: 1, previousRevision: 0, facts: { earnedScore: 8.5 } },
    });
    const regraded = await service.applyEvaluationCommand({
      ...teacherCommand,
      operationId: 'teacher-regrade-1',
      kind: 'regrade',
      expectedEvaluationRevision: 1,
      evaluation: { earnedScore: 9, maximumScore: 10, feedback: 'Rechecked.' },
    }, teacher);
    expect(regraded).toMatchObject({
      status: 'accepted',
      revision: { revision: 2, previousRevision: 1, facts: { earnedScore: 9 } },
    });
    const history = await readImmutableBookActivityEvaluationHistory(repository, {
      target: target(),
    });
    expect(history.map((entry) => entry.revision)).toEqual([1, 2]);
    expect(history[0]!.facts).toMatchObject({ earnedScore: 8.5, maximumScore: 10 });
    expect(history[1]!.facts).toMatchObject({ earnedScore: 9, maximumScore: 10 });
    expect(history[0]!.facts.correctionFacts).toEqual(teacherCommand.evaluation.correctionFacts);
    expect(subjective.attempt).toEqual(originalAttempt);
  });

  it('fails stale revisions without partial history', async () => {
    const { repository, service } = harness();
    await service.applyEvaluationCommand(objectiveCommand(), scorer);
    const stale = await service.applyEvaluationCommand({
      ...objectiveCommand(),
      operationId: 'evaluation-operation-stale',
      expectedEvaluationRevision: 0,
    }, scorer);
    expect(stale).toEqual({
      status: 'rejected',
      code: 'evaluation_stale_revision',
      currentRevision: 1,
    });
    const snapshot = repository.snapshot().scopes[bookActivityEvaluationScopePath(target())]!;
    expect(Object.keys(snapshot.history ?? {})).toEqual(['r000001']);
    expect(Object.keys(snapshot.operations ?? {})).toEqual(['evaluation-operation-1']);
  });

  it('rejects malformed stored history whose immutable target changes', async () => {
    const { repository, service } = harness();
    await service.applyEvaluationCommand(objectiveCommand(), scorer);
    const snapshot = repository.snapshot();
    const scope = snapshot.scopes[bookActivityEvaluationScopePath(target())]!;
    (scope.history!.r000001!.target as { contextId: string }).contextId = 'homework-forged';
    const malformed = new InMemoryBookActivityEvaluationRepository(snapshot);
    await expect(readImmutableBookActivityEvaluationHistory(malformed, {
      target: target(),
    })).rejects.toThrow(/evaluation_(?:current|history)_invalid/u);
  });

  it.each([
    ['schemaVersion', 99],
    ['scorerVersion', 99],
  ] as const)('rejects unsupported evaluation %s versions before persistence', async (field, value) => {
    const { repository, service } = harness();
    const result = await service.applyEvaluationCommand({
      ...objectiveCommand(),
      [field]: value,
    } as BookActivityEvaluationCommand, scorer);
    expect(result).toEqual({ status: 'rejected', code: 'evaluation_command_malformed' });
    expect(repository.snapshot()).toEqual({ scopes: {} });
  });

  it.each([
    ['attemptId', 'attempt-other'],
    ['resultId', 'result-other'],
    ['recipientId', 'student-other'],
    ['bindingId', 'binding-other'],
    ['bindingRevision', 5],
    ['placementId', 'placement-other'],
    ['activityId', 'activity-other'],
    ['activityVersion', 4],
    ['activityVersionId', 'activity-version-other'],
    ['interactionId', 'interaction-other'],
    ['attemptNumber', 2],
    ['pageGroupKeys', ['page-group-other']],
    ['contextId', 'homework-other'],
    ['contextKind', 'course'],
    ['sourceProvenance', [{ sourceKey: 'source-other', sourceVersionId: 'source-version-7', pages: [4, 5] }]],
    ['sourceProvenance', [{ sourceKey: 'source-1', sourceVersionId: 'source-version-8', pages: [4, 5] }]],
    ['sourceProvenance', [{ sourceKey: 'source-1', sourceVersionId: 'source-version-7', pages: [4, 6] }]],
  ] as const)('rejects stale exact target field %s', async (field, value) => {
    const { service } = harness();
    const staleTarget = { ...target(), [field]: value };
    await expect(service.applyEvaluationCommand(
      objectiveCommand({ target: staleTarget }),
      scorer,
    )).resolves.toMatchObject({
      status: 'rejected',
      code: 'evaluation_attempt_mismatch',
    });
  });

  it.each(['homework', 'course', 'class'] as const)(
    'requires exact %s ownership authority for teacher regrade',
    async (contextKind) => {
      const activity = resolved(longResponseActivity(), contextKind);
      const { service } = harness(activity);
      const command = {
        ...objectiveCommand({ target: target(contextKind) }),
        operationId: `teacher-${contextKind}`,
        kind: 'teacher_evaluation',
        evaluation: { earnedScore: 7, maximumScore: 10 },
      } as BookActivityEvaluationCommand;
      await expect(service.applyEvaluationCommand(
        command,
        { kind: 'teacher', uid: 'teacher-1' },
      )).resolves.toMatchObject({ status: 'accepted' });
    },
  );

  it.each(['homework', 'course', 'class'] as const)(
    'rejects %s teacher authority when its context binding is not exact',
    async (contextKind) => {
      const activity = resolved(longResponseActivity(), contextKind);
      const { service } = harness(activity, 'teacher-1', (value) => ({
        ...value,
        contextKind: contextKind === 'homework' ? 'course' : 'homework',
      }));
      await expect(service.applyEvaluationCommand({
        ...objectiveCommand({ target: target(contextKind) }),
        operationId: `authority-mismatch-${contextKind}`,
        kind: 'teacher_evaluation',
        evaluation: { earnedScore: 7, maximumScore: 10 },
      } as BookActivityEvaluationCommand, { kind: 'teacher', uid: 'teacher-1' })).resolves.toEqual({
        status: 'rejected',
        code: 'evaluation_actor_unauthorized',
      });
    },
  );

  it('denies cross-owner and non-scorer objective commands', async () => {
    const subjective = resolved(longResponseActivity());
    const crossOwner = harness(subjective, 'teacher-1');
    await expect(crossOwner.service.applyEvaluationCommand({
      ...objectiveCommand(),
      operationId: 'cross-owner',
      kind: 'teacher_evaluation',
      evaluation: { earnedScore: 5, maximumScore: 10 },
    }, { kind: 'teacher', uid: 'teacher-2' })).resolves.toEqual({
      status: 'rejected',
      code: 'evaluation_actor_unauthorized',
    });
    const objective = harness();
    await expect(objective.service.applyEvaluationCommand(
      objectiveCommand(),
      { kind: 'teacher', uid: 'teacher-1' },
    )).resolves.toEqual({
      status: 'rejected',
      code: 'evaluation_objective_scorer_required',
    });
  });

  it('requires a teacher for review-required work and rejects teacher scoring of objective work', async () => {
    const objective = harness();
    await expect(objective.service.applyEvaluationCommand({
      ...objectiveCommand(),
      operationId: 'objective-teacher',
      kind: 'teacher_evaluation',
      evaluation: { earnedScore: 1, maximumScore: 1 },
    }, { kind: 'teacher', uid: 'teacher-1' })).resolves.toEqual({
      status: 'rejected',
      code: 'evaluation_subjective_teacher_required',
    });
    const subjective = harness(resolved(longResponseActivity()));
    await expect(subjective.service.applyEvaluationCommand({
      ...objectiveCommand(),
      operationId: 'subjective-scorer',
    }, scorer)).resolves.toMatchObject({
      status: 'rejected',
      code: 'evaluation_subjective_teacher_required',
    });
  });

  it('rejects version drift in the resolved activity without writing history', async () => {
    const activity = { ...choiceActivity(), schemaVersion: 99 } as unknown as NormalizedActivity;
    const { repository, service } = harness(resolved(activity));
    await expect(service.applyEvaluationCommand(objectiveCommand(), scorer)).resolves.toEqual({
      status: 'rejected',
      code: 'evaluation_version_mismatch',
    });
    expect(repository.snapshot()).toEqual({ scopes: {} });
  });

  it('rejects version drift in the resolved attempt without writing history', async () => {
    const drifted = resolved();
    (drifted.attempt as { schemaVersion: number }).schemaVersion = 99;
    const { repository, service } = harness(drifted);
    await expect(service.applyEvaluationCommand(objectiveCommand(), scorer)).resolves.toEqual({
      status: 'rejected',
      code: 'evaluation_version_mismatch',
    });
    expect(repository.snapshot()).toEqual({ scopes: {} });
  });

  it('fails malformed, unsupported, and invalid teacher payloads closed', async () => {
    const malformed = harness();
    await expect(malformed.service.applyEvaluationCommand({
      ...objectiveCommand(),
      expectedEvaluationRevision: -1,
    }, scorer)).resolves.toEqual({
      status: 'rejected',
      code: 'evaluation_command_malformed',
    });
    const unsupported = harness({
      ...resolved(),
      submission: [{ interactionId: 'interaction-1', answer: ['unknown'] }],
    });
    await expect(unsupported.service.applyEvaluationCommand(
      objectiveCommand(),
      scorer,
    )).resolves.toEqual({
      status: 'rejected',
      code: 'evaluation_command_unsupported',
    });
    const subjective = harness(resolved(longResponseActivity()));
    await expect(subjective.service.applyEvaluationCommand({
      ...objectiveCommand(),
      kind: 'teacher_evaluation',
      evaluation: { earnedScore: Number.NaN, maximumScore: 10 },
    }, { kind: 'teacher', uid: 'teacher-1' })).resolves.toEqual({
      status: 'rejected',
      code: 'evaluation_teacher_payload_invalid',
    });
  });

  it('fails accessor-shaped commands and malformed actors closed without throwing', async () => {
    const { service } = harness();
    const accessorCommand = Object.defineProperty({}, 'schemaVersion', {
      enumerable: true,
      get: () => {
        throw new Error('must not escape');
      },
    }) as BookActivityEvaluationCommand;
    await expect(service.applyEvaluationCommand(accessorCommand, scorer)).resolves.toEqual({
      status: 'rejected',
      code: 'evaluation_command_malformed',
    });
    await expect(service.applyEvaluationCommand(
      objectiveCommand(),
      { kind: 'teacher', uid: '' } as BookActivityEvaluationActor,
    )).resolves.toEqual({
      status: 'rejected',
      code: 'evaluation_actor_unauthorized',
    });
  });

  it('accepts finite scores rounded to two decimal places despite binary floating point', async () => {
    const { service } = harness(resolved(longResponseActivity()));
    await expect(service.applyEvaluationCommand({
      ...objectiveCommand(),
      operationId: 'teacher-decimal-score',
      kind: 'teacher_evaluation',
      evaluation: { earnedScore: 1.15, maximumScore: 10 },
    }, { kind: 'teacher', uid: 'teacher-1' })).resolves.toMatchObject({
      status: 'accepted',
      revision: { facts: { earnedScore: 1.15, displayScore: '1.15 / 10.00' } },
    });
  });

  it.each([
    ['infinite', { earnedScore: Number.POSITIVE_INFINITY, maximumScore: 10 }],
    ['negative', { earnedScore: -0.01, maximumScore: 10 }],
    ['over-maximum', { earnedScore: 11, maximumScore: 10 }],
    ['maximum-bound', { earnedScore: 1, maximumScore: 10001 }],
    ['fractional-cent', { earnedScore: 1.001, maximumScore: 10 }],
    ['feedback-bound', { earnedScore: 1, maximumScore: 10, feedback: 'x'.repeat(4001) }],
    ['unknown-correction', {
      earnedScore: 1,
      maximumScore: 10,
      correctionFacts: [{ interactionId: 'interaction-other', outcome: 'incorrect' }],
    }],
    ['duplicate-correction', {
      earnedScore: 1,
      maximumScore: 10,
      correctionFacts: [
        { interactionId: 'interaction-1', outcome: 'correct' },
        { interactionId: 'interaction-1', outcome: 'partial' },
      ],
    }],
  ] as const)('rejects teacher payload outside finite bounds or correction identities (%s)', async (_label, evaluation) => {
    const { service } = harness(resolved(longResponseActivity()));
    await expect(service.applyEvaluationCommand({
      ...objectiveCommand(),
      operationId: `invalid-${_label}`,
      kind: 'teacher_evaluation',
      evaluation,
    }, { kind: 'teacher', uid: 'teacher-1' })).resolves.toEqual({
      status: 'rejected',
      code: 'evaluation_teacher_payload_invalid',
    });
  });
});

describe('ticket #89 route contribution', () => {
  it('contributes only the fixed command and history seams, disabled by default', () => {
    expect(bookActivityEvaluationRouteDescriptors).toHaveLength(2);
    expect(bookActivityEvaluationRouteDescriptors.map((route) => route.pathTemplate)).toEqual([
      '/book-evaluation/commands',
      '/book-evaluation/history/:bookId/:studentId',
    ]);
    for (const route of bookActivityEvaluationRouteDescriptors) {
      expect(route).toMatchObject({
        owner: '#89',
        contributorTicket: '#89',
        domain: 'evaluation-history',
        gateDefault: 'disabled',
        source: 'contributor',
      });
    }
  });

  it('requires a stable scoped repository identity and matching service-account email', () => {
    expect(() => new FirebaseRestBookActivityEvaluationRepository({
      env: { FIREBASE_DB_URL: 'https://example.firebaseio.test' },
      getAccessToken: async () => 'token',
    })).toThrow('missing_evaluation_service_identity');
    expect(() => new FirebaseRestBookActivityEvaluationRepository({
      env: {
        FIREBASE_DB_URL: 'https://example.firebaseio.test',
        BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY: 'evaluation@example.test',
        BOOK_ACTIVITY_EVALUATION_GOOGLE_SA_KEY: JSON.stringify({
          client_email: 'other@example.test',
        }),
      },
    })).toThrow('evaluation_service_identity_mismatch');
  });
});
