import {
  advanceBookUpdateAction,
  type BookUpdateActionRepository,
} from './update-action.ts';
import {
  createBookUpdateFinalizer,
  type BookUpdateFinalizationResult,
} from './update-finalizer.ts';
import type { BookRedoCheckpointInput } from '../../../../src/services/book-activity/bookRedoCheckpointProjection.service.ts';
import {
  bookRedoBindingId,
  projectBookRedoBinding,
  type BookRedoBindingMutationResult,
  type BookRedoBindingProjectionInput,
} from '../../../../src/services/book-delivery/bookRedoBindingProjection.adapter.ts';
import type {
  BookRedoAuditPort,
  BookRedoCurrentProjectionPort,
  BookRedoStudentPlan,
  BookRedoUpdateResolver,
  BookRedoUpdateResult,
} from '../../../../src/services/book-delivery/bookRedoUpdate.types.ts';
import type { BookUpdateActionRecord } from '../../../../src/services/book-delivery/bookUpdateAction.types.ts';
import {
  BOOK_REDO_PHASES,
  bookRedoPhaseFingerprint,
  recordBookRedoPhaseSuccess,
  type BookRedoPhase,
  type BookRedoPhaseReceiptRepository,
  type BookRedoPhaseReference,
  type BookRedoReceiptIdentity,
} from './redo-receipt-repository.ts';
import type {
  BookRedoCheckpointApplier,
  BookRedoCheckpointApplyResult,
} from './redo-checkpoint-apply.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export interface BookRedoBindingPort {
  apply(input: BookRedoBindingProjectionInput & { readonly operationId: string }): Promise<BookRedoBindingMutationResult>;
}

export type BookRedoUpdateFinalizer = ReturnType<typeof createBookUpdateFinalizer>;

export interface BookRedoUpdateExecutorOptions {
  readonly actions: BookUpdateActionRepository;
  readonly resolver: BookRedoUpdateResolver;
  readonly receipts: BookRedoPhaseReceiptRepository;
  readonly checkpoints: BookRedoCheckpointApplier;
  readonly bindings: BookRedoBindingPort;
  readonly current: BookRedoCurrentProjectionPort;
  readonly audit: BookRedoAuditPort;
  readonly finalizer: BookRedoUpdateFinalizer;
  readonly now?: () => Date;
}

type PhaseEffect = () => Promise<{
  readonly status: 'success' | 'conflict';
  readonly code?: string;
  readonly reference?: BookRedoPhaseReference;
}>;

type PhaseResult =
  | { readonly status: 'ok'; readonly reference?: BookRedoPhaseReference }
  | { readonly status: 'conflict'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);

const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const validIso = (value: unknown): value is string => (
  typeof value === 'string'
  && ISO.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
);

const selectionKey = (contextKey: string, placementId: string): string => (
  `${contextKey}\u0000${placementId}`
);

const operationId = (
  actionId: string,
  contextKey: string,
  contextId: string,
  studentId: string,
  phase: string,
): string => `${actionId}:redo:${contextKey}:${contextId}:${studentId}:${phase}`;

const receiptIdentity = (plan: BookRedoStudentPlan): BookRedoReceiptIdentity => ({
  ownerId: plan.ownerId,
  actionId: plan.actionId,
  bookId: plan.bookId,
  contextKey: plan.contextKey,
  contextId: plan.contextId,
  studentId: plan.studentId,
});

const checkpointInput = (plan: BookRedoStudentPlan): BookRedoCheckpointInput => ({
  actionId: plan.actionId,
  ownerId: plan.ownerId,
  bookId: plan.bookId,
  contextKey: plan.contextKey,
  contextId: plan.contextId,
  studentId: plan.studentId,
  oldBindingId: plan.currentBinding.bindingId,
  oldBindingRevision: plan.currentBinding.revision,
  reason: plan.reason,
  createdAt: plan.createdAt,
  activities: plan.activities.map((activity) => ({
    contextKey: activity.contextKey,
    placementId: activity.placementId,
    activityId: activity.activityId,
    oldActivityVersionId: activity.oldActivityVersionId,
    oldSourceVersionIds: [...activity.oldSourceVersionIds],
    lifecycle: activity.lifecycle,
    priorAnswer: clone(activity.priorAnswer),
    ...(activity.priorResult !== undefined ? { priorResult: clone(activity.priorResult) } : {}),
    feedbackRelease: activity.feedbackRelease,
    changed: activity.changed,
    ...(activity.removalOnly !== undefined ? { removalOnly: activity.removalOnly } : {}),
  })),
});

const nextActivityVersionIds = (plan: BookRedoStudentPlan): Readonly<Record<string, string>> => (
  Object.freeze(Object.fromEntries(plan.activities.map((activity) => {
    const placement = plan.nextBinding.placements.find((candidate) => candidate.placementId === activity.placementId);
    return [activity.placementId, placement?.activityVersionId ?? ''];
  })))
);

const selectedPlacementIds = (plan: BookRedoStudentPlan): readonly string[] => (
  [...new Set(plan.activities.map((activity) => activity.placementId))].sort()
);

const validatePlan = (action: BookUpdateActionRecord, plan: BookRedoStudentPlan): boolean => {
  if (plan.schemaVersion !== 1
    || !validId(plan.actionId)
    || !validId(plan.ownerId)
    || !validId(plan.bookId)
    || plan.actionId !== action.actionId
    || plan.ownerId !== action.ownerId
    || plan.bookId !== action.bookId
    || !validId(plan.contextKey)
    || !validId(plan.contextId)
    || !validId(plan.studentId)
    || typeof plan.reason !== 'string'
    || plan.reason.trim() !== plan.reason
    || plan.reason.length === 0
    || plan.reason.length > 500
    || !validIso(plan.createdAt)
    || plan.contextKey !== plan.activities[0]?.contextKey
    || plan.contextKind !== plan.currentBinding.context.kind
    || plan.contextId !== plan.currentBinding.context.contextId
    || plan.currentBinding.status !== 'active'
    || plan.nextBinding.status !== 'active'
    || plan.currentBinding.recipient.recipientId !== plan.studentId
    || plan.nextBinding.recipient.recipientId !== plan.studentId
    || plan.currentBinding.context.ownerId !== plan.ownerId
    || plan.nextBinding.context.ownerId !== plan.ownerId
    || !Array.isArray(plan.activities)
    || plan.activities.length === 0) return false;
  const selected = new Set(action.selections
    .filter((selection) => selection.contextKey === plan.contextKey)
    .map((selection) => selectionKey(selection.contextKey, selection.placementId)));
  const activities = new Set<string>();
  const currentById = new Map(plan.currentBinding.placements.map((placement) => [placement.placementId, placement]));
  const nextById = new Map(plan.nextBinding.placements.map((placement) => [placement.placementId, placement]));
  for (const activity of plan.activities) {
    const key = selectionKey(activity.contextKey, activity.placementId);
    const current = currentById.get(activity.placementId);
    const next = nextById.get(activity.placementId);
    if (activity.contextKey !== plan.contextKey
      || activity.contextId !== plan.contextId
      || !validId(activity.placementId)
      || !validId(activity.activityId)
      || !validId(activity.oldActivityVersionId)
      || !Number.isSafeInteger(activity.newActivityVersion)
      || activity.newActivityVersion < 1
      || activity.changed !== true
      || activity.removalOnly === true
      || activities.has(activity.placementId)
      || !selected.has(key)
      || !current
      || !next
      || current.activityId !== activity.activityId
      || current.activityVersionId !== activity.oldActivityVersionId
      || next.activityVersion !== activity.newActivityVersion
      || next.activityVersionId === current.activityVersionId) return false;
    activities.add(activity.placementId);
  }
  return action.selections
    .filter((selection) => selection.contextKey === plan.contextKey)
    .every((selection) => activities.has(selection.placementId))
    && plan.nextBinding.bindingId === bookRedoBindingId(action.actionId, plan.contextKey, plan.studentId)
    && plan.nextBinding.revision === plan.currentBinding.revision + 1
    && projectBookRedoBinding({
      actionId: action.actionId,
      contextKey: plan.contextKey,
      contextId: plan.contextId,
      studentId: plan.studentId,
      current: plan.currentBinding,
      next: plan.nextBinding,
      selectedPlacementIds: selectedPlacementIds(plan),
      now: plan.createdAt,
    }).status === 'projected';
};

const planFingerprint = (plan: BookRedoStudentPlan): string => bookRedoPhaseFingerprint({
  actionId: plan.actionId,
  ownerId: plan.ownerId,
  bookId: plan.bookId,
  contextKey: plan.contextKey,
  contextId: plan.contextId,
  studentId: plan.studentId,
  oldBindingId: plan.currentBinding.bindingId,
  oldBindingRevision: plan.currentBinding.revision,
  newBindingId: plan.nextBinding.bindingId,
  newBindingRevision: plan.nextBinding.revision,
  selectedPlacementIds: selectedPlacementIds(plan),
  nextActivityVersionIds: nextActivityVersionIds(plan),
});

const applyPhase = async (input: {
  readonly repository: BookRedoPhaseReceiptRepository;
  readonly identity: BookRedoReceiptIdentity;
  readonly phase: BookRedoPhase;
  readonly fingerprint: string;
  readonly at: string;
  readonly effect: PhaseEffect;
}): Promise<PhaseResult> => {
  const current = await input.repository.read(input.identity);
  const savedPhase = current?.phases[input.phase];
  if (savedPhase?.status === 'succeeded') {
    return savedPhase.fingerprint === input.fingerprint
      ? { status: 'ok', reference: savedPhase.reference }
      : { status: 'conflict', code: `${input.phase}-receipt-fingerprint-conflict` };
  }
  const effect = await input.effect();
  if (effect.status !== 'success') return { status: 'conflict', code: effect.code ?? `${input.phase}-failed` };
  const receipt = await recordBookRedoPhaseSuccess({
    repository: input.repository,
    identity: input.identity,
    phase: input.phase,
    fingerprint: input.fingerprint,
    reference: effect.reference,
    at: input.at,
  });
  if ('code' in receipt) return { status: 'conflict', code: receipt.code };
  return { status: 'ok', reference: receipt.receipt.phases[input.phase].reference };
};

const phaseReference = (
  result: PhaseResult,
): BookRedoPhaseReference | undefined => result.status === 'ok' ? result.reference : undefined;

const processPlan = async (options: BookRedoUpdateExecutorOptions, plan: BookRedoStudentPlan, at: string): Promise<PhaseResult> => {
  const identity = receiptIdentity(plan);
  const base = planFingerprint(plan);
  const checkpoint = await applyPhase({
    repository: options.receipts,
    identity,
    phase: 'checkpoint',
    // Recovery receipts carry only structural facts. Student answers and
    // released feedback remain in the immutable checkpoint, never in the
    // phase-ledger fingerprint.
    fingerprint: bookRedoPhaseFingerprint({
      base,
      checkpointId: `${plan.actionId}:${plan.contextKey}:${plan.studentId}`,
      activities: plan.activities.map((activity) => ({
        placementId: activity.placementId,
        activityId: activity.activityId,
        oldActivityVersionId: activity.oldActivityVersionId,
        oldSourceVersionIds: [...activity.oldSourceVersionIds].sort(),
        lifecycle: activity.lifecycle,
        feedbackRelease: activity.feedbackRelease,
        changed: activity.changed,
        removalOnly: activity.removalOnly === true,
      })).sort((left, right) => left.placementId.localeCompare(right.placementId)),
    }),
    at,
    effect: async () => {
      let result: BookRedoCheckpointApplyResult;
      try {
        result = await options.checkpoints.apply(checkpointInput(plan));
      } catch {
        return { status: 'conflict' as const, code: 'checkpoint-apply-failed' };
      }
      if (result.status === 'conflict') return result;
      return result.status === 'skipped'
        ? { status: 'success' as const }
        : result.checkpoint.checkpointId !== `${plan.actionId}:${plan.contextKey}:${plan.studentId}`
          ? { status: 'conflict' as const, code: 'checkpoint-identity-conflict' }
          : {
            status: 'success' as const,
            reference: { checkpointId: result.checkpoint.checkpointId },
          };
    },
  });
  if (checkpoint.status !== 'ok') return checkpoint;
  const checkpointId = phaseReference(checkpoint)?.checkpointId ?? null;

  const binding = await applyPhase({
    repository: options.receipts,
    identity,
    phase: 'binding',
    fingerprint: bookRedoPhaseFingerprint({ base, binding: plan.nextBinding, selectedPlacementIds: selectedPlacementIds(plan) }),
    at,
    effect: async () => {
      let result: BookRedoBindingMutationResult;
      try {
        result = await options.bindings.apply({
          actionId: plan.actionId,
          contextKey: plan.contextKey,
          contextId: plan.contextId,
          studentId: plan.studentId,
          current: plan.currentBinding,
          next: plan.nextBinding,
          selectedPlacementIds: selectedPlacementIds(plan),
          now: plan.createdAt,
          operationId: operationId(plan.actionId, plan.contextKey, plan.contextId, plan.studentId, 'binding'),
        });
      } catch {
        return { status: 'conflict' as const, code: 'binding-apply-failed' };
      }
      if (result.status === 'conflict') return { status: 'conflict' as const, code: 'binding-conflict' };
      return {
        status: 'success' as const,
        reference: {
          bindingId: result.binding.bindingId,
          bindingRevision: result.binding.revision,
        },
      };
    },
  });
  if (binding.status !== 'ok') return binding;

  const nextIds = nextActivityVersionIds(plan);
  const exclusion = await applyPhase({
    repository: options.receipts,
    identity,
    phase: 'redo-exclusion',
    fingerprint: bookRedoPhaseFingerprint({ base, nextIds, bindingId: plan.nextBinding.bindingId, bindingRevision: plan.nextBinding.revision }),
    at,
    effect: async () => {
      let result: Awaited<ReturnType<BookRedoCurrentProjectionPort['apply']>>;
      try {
        result = await options.current.apply({
          operationId: operationId(plan.actionId, plan.contextKey, plan.contextId, plan.studentId, 'redo-exclusion'),
          actionId: plan.actionId,
          ownerId: plan.ownerId,
          bookId: plan.bookId,
          contextKey: plan.contextKey,
          contextId: plan.contextId,
          studentId: plan.studentId,
          bindingId: plan.nextBinding.bindingId,
          bindingRevision: plan.nextBinding.revision,
          previousBindingId: plan.currentBinding.bindingId,
          previousBindingRevision: plan.currentBinding.revision,
          selectedPlacementIds: selectedPlacementIds(plan),
          nextActivityVersionIds: nextIds,
        });
      } catch {
        return { status: 'conflict' as const, code: 'redo-exclusion-apply-failed' };
      }
      if (result.status === 'conflict') return { status: 'conflict' as const, code: 'redo-exclusion-conflict' };
      if (result.visibility !== 'new' || !result.completionStatus) {
        return { status: 'conflict' as const, code: 'redo-exclusion-visibility-invalid' };
      }
      return {
        status: 'success' as const,
        reference: {
          bindingId: plan.nextBinding.bindingId,
          bindingRevision: plan.nextBinding.revision,
          visibility: 'new' as const,
          completionStatus: result.completionStatus,
        },
      };
    },
  });
  if (exclusion.status !== 'ok') return exclusion;
  const completionStatus = phaseReference(exclusion)?.completionStatus;
  if (!completionStatus) return { status: 'conflict', code: 'completion-status-missing' };

  const completion = await applyPhase({
    repository: options.receipts,
    identity,
    phase: 'completion',
    fingerprint: bookRedoPhaseFingerprint({ base, bindingId: plan.nextBinding.bindingId, bindingRevision: plan.nextBinding.revision, completionStatus }),
    at,
    effect: async () => ({
      status: 'success' as const,
      reference: {
        bindingId: plan.nextBinding.bindingId,
        bindingRevision: plan.nextBinding.revision,
        completionStatus,
      },
    }),
  });
  if (completion.status !== 'ok') return completion;

  const audit = await applyPhase({
    repository: options.receipts,
    identity,
    phase: 'audit',
    fingerprint: bookRedoPhaseFingerprint({
      base,
      checkpointId,
      bindingId: plan.nextBinding.bindingId,
      bindingRevision: plan.nextBinding.revision,
      reopenedPlacementIds: plan.activities
        .filter((activity) => activity.required && activity.changed)
        .map((activity) => activity.placementId)
        .sort(),
      reason: plan.reason,
    }),
    at,
    effect: async () => {
      let result: Awaited<ReturnType<BookRedoAuditPort['record']>>;
      try {
        result = await options.audit.record({
          operationId: operationId(plan.actionId, plan.contextKey, plan.contextId, plan.studentId, 'audit'),
          actionId: plan.actionId,
          ownerId: plan.ownerId,
          bookId: plan.bookId,
          contextKey: plan.contextKey,
          contextId: plan.contextId,
          studentId: plan.studentId,
          checkpointId,
          bindingId: plan.nextBinding.bindingId,
          bindingRevision: plan.nextBinding.revision,
          reopenedPlacementIds: plan.activities
            .filter((activity) => activity.required && activity.changed)
            .map((activity) => activity.placementId)
            .sort(),
          reason: plan.reason,
        });
      } catch {
        return { status: 'conflict' as const, code: 'audit-apply-failed' };
      }
      return result.status === 'recorded' || result.status === 'replayed'
        ? { status: 'success' as const }
        : { status: 'conflict' as const, code: 'audit-conflict' };
    },
  });
  return audit;
};

const applyingAction = async (
  options: BookRedoUpdateExecutorOptions,
  action: BookUpdateActionRecord,
  at: string,
): Promise<{ readonly status: 'ready'; readonly action: BookUpdateActionRecord } | { readonly status: 'pending'; readonly action: BookUpdateActionRecord; readonly code: string } | { readonly status: 'replayed'; readonly action: BookUpdateActionRecord }> => {
  if (action.state !== 'accepted') return { status: 'ready', action };
  const applying = await advanceBookUpdateAction({
    repository: options.actions,
    ownerId: action.ownerId,
    actionId: action.actionId,
    expectedState: 'accepted',
    expectedRevision: action.stateRevision,
    nextState: 'applying',
    at,
  });
  if (applying.status === 'advanced' && applying.action) return { status: 'ready', action: applying.action };
  const fresh = await options.actions.read(action.ownerId, action.actionId);
  if (!fresh) return { status: 'pending', action, code: 'action-transition-conflict' };
  if (fresh.state === 'committed' || fresh.state === 'notification-pending' || fresh.state === 'completed') {
    return { status: 'replayed', action: fresh };
  }
  return fresh.state === 'applying'
    ? { status: 'ready', action: fresh }
    : { status: 'pending', action: fresh, code: 'action-transition-conflict' };
};

export const createBookRedoUpdateExecutor = (options: BookRedoUpdateExecutorOptions) => Object.freeze({
  async execute(input: { readonly ownerId: string; readonly actionId: string }): Promise<BookRedoUpdateResult> {
    let action: BookUpdateActionRecord | null;
    try {
      action = await options.actions.read(input.ownerId, input.actionId);
    } catch {
      return { status: 'blocked', code: 'action-unavailable' };
    }
    if (!action || action.ownerId !== input.ownerId) return { status: 'blocked', code: 'action-missing' };
    if (action.state === 'committed' || action.state === 'notification-pending' || action.state === 'completed') {
      return { status: 'replayed', action };
    }
    let at: string;
    try {
      at = (options.now?.() ?? new Date()).toISOString();
    } catch {
      return { status: 'blocked', code: 'clock-invalid' };
    }
    let applying: Awaited<ReturnType<typeof applyingAction>>;
    try {
      applying = await applyingAction(options, action, at);
    } catch {
      return { status: 'pending', action, code: 'action-transition-unavailable', completedStudentCount: 0 };
    }
    if (applying.status === 'replayed') return applying;
    if (applying.status === 'pending') return { ...applying, completedStudentCount: 0 };
    action = applying.action;
    if (action.state !== 'applying') return { status: 'blocked', code: 'action-not-applicable' };
    if (action.selections.length === 0 || action.selections.some((selection) => selection.choice !== 'apply-with-redo')) {
      return { status: 'pending', action, code: 'delegate-other-update-case', completedStudentCount: 0 };
    }
    let resolved: Awaited<ReturnType<BookRedoUpdateResolver['resolve']>>;
    try {
      resolved = await options.resolver.resolve(action);
    } catch {
      return { status: 'pending', action, code: 'case-resolution-unavailable', completedStudentCount: 0 };
    }
    if (resolved.status !== 'ready') {
      return { status: 'pending', action, code: `case-resolution-${resolved.status}`, completedStudentCount: 0 };
    }
    const planKeys = resolved.students.map((plan) => `${plan.contextKey}\u0000${plan.studentId}`);
    const selectedKeys = action.selections.map((selection) => selectionKey(selection.contextKey, selection.placementId));
    if (resolved.students.length === 0
      || new Set(planKeys).size !== planKeys.length
      || new Set(selectedKeys).size !== selectedKeys.length
      || resolved.students.some((plan) => !validatePlan(action, plan))
      || action.selections.some((selection) => !resolved.students.some((plan) => (
        plan.contextKey === selection.contextKey
        && plan.activities.some((activity) => activity.placementId === selection.placementId)
      )))) {
      return { status: 'pending', action, code: 'case-plan-invalid', completedStudentCount: 0 };
    }
    const students = [...resolved.students].sort((left, right) => (
      `${left.contextKey}\u0000${left.studentId}`.localeCompare(`${right.contextKey}\u0000${right.studentId}`)
    ));
    let completedStudentCount = 0;
    for (const plan of students) {
      let result: PhaseResult;
      try {
        result = await processPlan(options, plan, at);
      } catch {
        return { status: 'pending', action, code: 'redo-phase-unavailable', completedStudentCount };
      }
      if (result.status !== 'ok') {
        return { status: 'pending', action, code: result.code, completedStudentCount };
      }
      completedStudentCount += 1;
    }
    const committed = await advanceBookUpdateAction({
      repository: options.actions,
      ownerId: action.ownerId,
      actionId: action.actionId,
      expectedState: 'applying',
      expectedRevision: action.stateRevision,
      nextState: 'committed',
      at,
    });
    if (committed.status === 'advanced' && committed.action) return { status: 'committed', action: committed.action };
    const fresh = await options.actions.read(action.ownerId, action.actionId);
    return fresh && (fresh.state === 'committed' || fresh.state === 'notification-pending' || fresh.state === 'completed')
      ? { status: 'replayed', action: fresh }
      : { status: 'pending', action: fresh ?? action, code: 'commit-transition-conflict', completedStudentCount };
  },

  /**
   * The notification finalizer is intentionally reachable only after the
   * redo executor has committed every recipient receipt.
   */
  async finalize(input: { readonly ownerId: string; readonly actionId: string }): Promise<BookUpdateFinalizationResult> {
    const action = await options.actions.read(input.ownerId, input.actionId);
    if (!action || action.ownerId !== input.ownerId) return { status: 'blocked', code: 'action-missing' };
    if (action.state !== 'committed' && action.state !== 'notification-pending' && action.state !== 'completed') {
      return { status: 'blocked', code: 'action-not-committed' };
    }
    return options.finalizer.finalize(input);
  },
});

export const createBookRedoFinalizer = (
  options: Parameters<typeof createBookUpdateFinalizer>[0],
): BookRedoUpdateFinalizer => createBookUpdateFinalizer(options);

export { BOOK_REDO_PHASES };
