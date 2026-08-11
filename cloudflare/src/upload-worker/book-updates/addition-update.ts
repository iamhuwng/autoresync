import {
  advanceBookUpdateAction,
  type BookUpdateActionRepository,
} from './update-action.ts';
import {
  createBookUpdateFinalizer,
  type BookUpdateFinalizationResult,
} from './update-finalizer.ts';
import type { BookUpdateActionRecord } from '../../../../src/services/book-delivery/bookUpdateAction.types.ts';
import type { BookAdditionDeadlineResolution } from '../../../../src/services/book-homework/bookAdditionDeadline.service.ts';
import {
  bookAdditionBindingId,
  type BookAdditionActivityInput,
  type BookAdditionProjectionInput,
  type BookAdditionProjectionMutationResult,
} from '../../../../src/services/book-delivery/bookAdditionProjection.service.ts';
import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookRedoCurrentProjection } from '../../../../src/services/book-delivery/bookRedoCurrentProjection.adapter.ts';
import {
  BOOK_ADDITION_PHASES,
  bookAdditionPhaseFingerprint,
  recordBookAdditionPhaseSuccess,
  type BookAdditionPhase,
  type BookAdditionPhaseReceiptRepository,
  type BookAdditionPhaseReference,
  type BookAdditionReceiptIdentity,
} from './addition-receipt-repository.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export interface BookAdditionStudentPlan {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextKind: 'homework';
  readonly contextId: string;
  readonly studentId: string;
  readonly currentBinding: BookDeliveryBinding;
  readonly nextBinding: BookDeliveryBinding;
  readonly currentProjection: BookRedoCurrentProjection;
  readonly additions: readonly (BookAdditionActivityInput & {
    readonly deadline: BookAdditionDeadlineResolution;
  })[];
  readonly reason: string;
  readonly createdAt: string;
}

export type BookAdditionPlanResolution =
  | { readonly status: 'ready'; readonly students: readonly BookAdditionStudentPlan[] }
  | { readonly status: 'stale' | 'denied' | 'unavailable' };

export interface BookAdditionUpdateResolver {
  resolve(action: BookUpdateActionRecord): Promise<BookAdditionPlanResolution>;
}

export interface BookAdditionProjectionPort {
  apply(input: BookAdditionProjectionInput & { readonly operationId: string }): Promise<BookAdditionProjectionMutationResult>;
}

export interface BookAdditionAuditPort {
  record(input: {
    readonly operationId: string;
    readonly actionId: string;
    readonly ownerId: string;
    readonly bookId: string;
    readonly contextKey: string;
    readonly contextId: string;
    readonly studentId: string;
    readonly bindingId: string;
    readonly bindingRevision: number;
    readonly addedPlacementIds: readonly string[];
    readonly deadlines: readonly {
      readonly placementId: string;
      readonly effectiveDeadlineAt: string;
      readonly replacementDeadlineAt: string | null;
      readonly scheduleRevision: number;
    }[];
    readonly reason: string;
  }): Promise<{ readonly status: 'recorded' | 'replayed' | 'conflict' }>;
}

export type BookAdditionUpdateResult =
  | { readonly status: 'committed' | 'replayed'; readonly action: BookUpdateActionRecord }
  | {
      readonly status: 'pending';
      readonly action: BookUpdateActionRecord;
      readonly code: string;
      readonly completedStudentCount: number;
    }
  | { readonly status: 'blocked'; readonly code: string };

export type BookAdditionUpdateFinalizer = ReturnType<typeof createBookUpdateFinalizer>;

export interface BookAdditionUpdateExecutorOptions {
  readonly actions: BookUpdateActionRepository;
  readonly resolver: BookAdditionUpdateResolver;
  readonly receipts: BookAdditionPhaseReceiptRepository;
  readonly projection: BookAdditionProjectionPort;
  readonly audit: BookAdditionAuditPort;
  readonly finalizer: BookAdditionUpdateFinalizer;
  readonly now?: () => Date;
}

type PhaseEffect = () => Promise<{
  readonly status: 'success' | 'conflict';
  readonly code?: string;
  readonly reference?: BookAdditionPhaseReference;
}>;

type PhaseResult =
  | { readonly status: 'ok'; readonly reference?: BookAdditionPhaseReference }
  | { readonly status: 'conflict'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);
const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const validIso = (value: unknown): value is string => (
  typeof value === 'string'
  && ISO.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
);

const operationId = (
  actionId: string,
  plan: Pick<BookAdditionStudentPlan, 'contextKey' | 'contextId' | 'studentId'>,
  phase: BookAdditionPhase,
): string => `${actionId}:addition:${plan.contextKey}:${plan.contextId}:${plan.studentId}:${phase}`;

const receiptIdentity = (plan: BookAdditionStudentPlan): BookAdditionReceiptIdentity => ({
  ownerId: plan.ownerId,
  actionId: plan.actionId,
  bookId: plan.bookId,
  contextKey: plan.contextKey,
  contextId: plan.contextId,
  studentId: plan.studentId,
});

const selectedPlacements = (plan: BookAdditionStudentPlan): readonly string[] => (
  [...new Set(plan.additions.map((addition) => addition.placement.placementId))].sort()
);

const planFingerprint = (plan: BookAdditionStudentPlan): string => bookAdditionPhaseFingerprint({
  actionId: plan.actionId,
  ownerId: plan.ownerId,
  bookId: plan.bookId,
  contextKey: plan.contextKey,
  contextId: plan.contextId,
  studentId: plan.studentId,
  currentBindingId: plan.currentBinding.bindingId,
  currentBindingRevision: plan.currentBinding.revision,
  nextBindingId: plan.nextBinding.bindingId,
  nextBindingRevision: plan.nextBinding.revision,
  selectedPlacements: selectedPlacements(plan),
  deadlines: plan.additions.map((addition) => ({
    placementId: addition.placement.placementId,
    effectiveDeadlineAt: addition.deadline.effectiveDeadlineAt,
    replacementDeadlineAt: addition.deadline.replacementDeadlineAt,
    scheduleRevision: addition.deadline.scheduleRevision,
  })).sort((left, right) => left.placementId.localeCompare(right.placementId)),
});

const actionSelection = (
  action: BookUpdateActionRecord,
  contextKey: string,
  placementId: string,
) => action.selections.find((selection) => selection.contextKey === contextKey && selection.placementId === placementId);

const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const validDeadlineWindow = (
  deadline: BookAdditionDeadlineResolution,
  plan: BookAdditionStudentPlan,
): boolean => {
  const windowValue = deadline.window as unknown;
  if (!record(windowValue)) return false;
  const window = windowValue;
  const identity = window.identity;
  const winner = window.deadline;
  if (!record(identity) || !record(winner)) return false;
  const effectiveAt = deadline.effectiveDeadlineAt;
  const evaluatedAt = window.evaluatedAt;
  const replacementAt = deadline.replacementDeadlineAt;
  const addition = plan.additions.find((candidate) => candidate.placement.placementId === deadline.placementId);
  if (!validIso(evaluatedAt)
    || !addition
    || winner.at !== effectiveAt
    || winner.at === null
    || window.operation !== 'launch'
    || identity.assignmentId !== plan.contextId
    || identity.recipientId !== plan.studentId
    || identity.bindingId !== plan.currentBinding.bindingId
    || identity.bindingRevision !== plan.currentBinding.revision
    || identity.placementId !== deadline.placementId
    || identity.activityId !== addition.placement.activityId
    || identity.activityVersion !== addition.placement.activityVersion
    || identity.nodeKey !== deadline.nodeKey
    || deadline.requiresReplacementDeadline !== (Date.parse(effectiveAt) <= Date.parse(evaluatedAt))) return false;
  if (replacementAt === null) return !deadline.requiresReplacementDeadline;
  return validIso(replacementAt)
    && Date.parse(replacementAt) > Date.parse(evaluatedAt)
    && Date.parse(replacementAt) >= Date.parse(effectiveAt);
};

const validatePlan = (action: BookUpdateActionRecord, plan: BookAdditionStudentPlan): boolean => {
  const raw = plan as unknown as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(raw, 'optional')
    || Object.prototype.hasOwnProperty.call(raw, 'applicabilityPolicy')
    || plan.schemaVersion !== 1
    || !validId(plan.actionId)
    || !validId(plan.ownerId)
    || !validId(plan.bookId)
    || plan.actionId !== action.actionId
    || plan.ownerId !== action.ownerId
    || plan.bookId !== action.bookId
    || plan.contextKind !== 'homework'
    || !validId(plan.contextKey)
    || !validId(plan.contextId)
    || plan.contextKey !== `homework:${plan.contextId}`
    || !validId(plan.studentId)
    || typeof plan.reason !== 'string'
    || plan.reason.trim() !== plan.reason
    || plan.reason.length === 0
    || plan.reason !== action.reason
    || !validIso(plan.createdAt)
    || !Array.isArray(plan.additions)
    || plan.additions.length === 0
    || plan.currentBinding.status !== 'active'
    || plan.nextBinding.status !== 'active'
    || plan.currentBinding.context.kind !== 'homework'
    || plan.nextBinding.context.kind !== 'homework'
    || plan.currentBinding.book.bookId !== plan.bookId
    || plan.nextBinding.book.bookId !== plan.bookId
    || plan.currentBinding.context.contextId !== plan.contextId
    || plan.nextBinding.context.contextId !== plan.contextId
    || plan.currentBinding.context.ownerId !== plan.ownerId
    || plan.nextBinding.context.ownerId !== plan.ownerId
    || plan.currentBinding.recipient.recipientId !== plan.studentId
    || plan.nextBinding.recipient.recipientId !== plan.studentId
    || plan.currentBinding.issuer.ownerId !== plan.ownerId
    || plan.nextBinding.issuer.ownerId !== plan.ownerId
    || plan.currentProjection.contextKey !== plan.contextKey
    || plan.currentProjection.contextId !== plan.contextId
    || plan.currentProjection.studentId !== plan.studentId) return false;
  const selected = new Set(action.selections
    .filter((selection) => selection.contextKey === plan.contextKey && selection.choice === 'include-required')
    .map((selection) => selection.placementId));
  const seen = new Set<string>();
  for (const addition of plan.additions) {
    const placementId = addition.placement.placementId;
    const selection = actionSelection(action, plan.contextKey, placementId);
    const deadline = addition.deadline;
    if (seen.has(placementId)
      || !selected.has(placementId)
      || !selection
      || addition.placement.contextMode !== 'required'
      || !validId(placementId)
      || deadline.assignmentId !== plan.contextId
      || deadline.contextKey !== plan.contextKey
      || deadline.studentId !== plan.studentId
      || deadline.recipientId !== plan.studentId
      || deadline.placementId !== placementId
      || deadline.bindingId !== plan.currentBinding.bindingId
      || !validIso(deadline.effectiveDeadlineAt)
      || !Number.isSafeInteger(deadline.scheduleRevision)
      || deadline.scheduleRevision <= 0
      || !validDeadlineWindow(deadline, plan)
      || (deadline.replacementDeadlineAt !== null && !validIso(deadline.replacementDeadlineAt))
      || (selection.replacementDeadline ?? null) !== deadline.replacementDeadlineAt
      || !validId(addition.placement.activityId)
      || !validId(addition.placement.activityVersionId)) return false;
    seen.add(placementId);
  }
  return selected.size === seen.size
    && selectedPlacements(plan).length === plan.additions.length
    && plan.nextBinding.bindingId === bookAdditionBindingId(action.actionId, plan.contextKey, plan.studentId);
};

const applyPhase = async (input: {
  readonly repository: BookAdditionPhaseReceiptRepository;
  readonly identity: BookAdditionReceiptIdentity;
  readonly phase: BookAdditionPhase;
  readonly fingerprint: string;
  readonly at: string;
  readonly effect: PhaseEffect;
}): Promise<PhaseResult> => {
  const current = await input.repository.read(input.identity);
  const saved = current?.phases[input.phase];
  if (saved?.status === 'succeeded') {
    return saved.fingerprint === input.fingerprint
      ? { status: 'ok', reference: saved.reference }
      : { status: 'conflict', code: `${input.phase}-receipt-fingerprint-conflict` };
  }
  const effect = await input.effect();
  if (effect.status !== 'success') return { status: 'conflict', code: effect.code ?? `${input.phase}-failed` };
  const receipt = await recordBookAdditionPhaseSuccess({
    repository: input.repository,
    identity: input.identity,
    phase: input.phase,
    fingerprint: input.fingerprint,
    reference: effect.reference,
    at: input.at,
  });
  if (receipt.status === 'conflict') return { status: 'conflict', code: receipt.code };
  return { status: 'ok', reference: receipt.receipt.phases[input.phase].reference };
};

const phaseReference = (result: PhaseResult): BookAdditionPhaseReference | undefined => (
  result.status === 'ok' ? result.reference : undefined
);

const processPlan = async (
  options: BookAdditionUpdateExecutorOptions,
  plan: BookAdditionStudentPlan,
  at: string,
): Promise<PhaseResult> => {
  const identity = receiptIdentity(plan);
  const base = planFingerprint(plan);
  const deadlines = plan.additions.map((addition) => ({
    placementId: addition.placement.placementId,
    effectiveDeadlineAt: addition.deadline.effectiveDeadlineAt,
    replacementDeadlineAt: addition.deadline.replacementDeadlineAt,
    scheduleRevision: addition.deadline.scheduleRevision,
  })).sort((left, right) => left.placementId.localeCompare(right.placementId));
  const deadline = await applyPhase({
    repository: options.receipts,
    identity,
    phase: 'deadline',
    fingerprint: bookAdditionPhaseFingerprint({ base, deadlines }),
    at,
    effect: async () => ({
      status: 'success' as const,
      reference: {
        deadlineAt: deadlines[deadlines.length - 1]?.replacementDeadlineAt
          ?? deadlines[deadlines.length - 1]?.effectiveDeadlineAt,
        requiresReplacementDeadline: plan.additions.some((addition) => addition.deadline.requiresReplacementDeadline),
      },
    }),
  });
  if (deadline.status !== 'ok') return deadline;

  const projection = await applyPhase({
    repository: options.receipts,
    identity,
    phase: 'projection',
    fingerprint: bookAdditionPhaseFingerprint({
      base,
      binding: plan.nextBinding,
      addedPlacementIds: selectedPlacements(plan),
    }),
    at,
    effect: async () => {
      let result: BookAdditionProjectionMutationResult;
      try {
        result = await options.projection.apply({
          operationId: operationId(plan.actionId, plan, 'projection'),
          actionId: plan.actionId,
          ownerId: plan.ownerId,
          bookId: plan.bookId,
          contextKey: plan.contextKey,
          contextId: plan.contextId,
          studentId: plan.studentId,
          currentBinding: plan.currentBinding,
          nextBinding: plan.nextBinding,
          currentProjection: plan.currentProjection,
          additions: plan.additions.map(({ placement, feedbackRelease }) => ({ placement, feedbackRelease })),
          now: plan.createdAt,
        });
      } catch {
        return { status: 'conflict' as const, code: 'projection-apply-failed' };
      }
      if (result.status === 'conflict') return { status: 'conflict' as const, code: result.code };
      return {
        status: 'success' as const,
        reference: {
          bindingId: result.binding.bindingId,
          bindingRevision: result.binding.revision,
          completionStatus: result.completionStatus,
        },
      };
    },
  });
  if (projection.status !== 'ok') return projection;
  const projectionReference = phaseReference(projection);
  if (!projectionReference?.bindingId || !projectionReference.bindingRevision || !projectionReference.completionStatus) {
    return { status: 'conflict', code: 'projection-reference-invalid' };
  }

  const completion = await applyPhase({
    repository: options.receipts,
    identity,
    phase: 'completion',
    fingerprint: bookAdditionPhaseFingerprint({
      base,
      bindingId: projectionReference.bindingId,
      bindingRevision: projectionReference.bindingRevision,
      completionStatus: projectionReference.completionStatus,
      addedPlacementIds: selectedPlacements(plan),
    }),
    at,
    effect: async () => ({
      status: 'success' as const,
      reference: projectionReference,
    }),
  });
  if (completion.status !== 'ok') return completion;

  const audit = await applyPhase({
    repository: options.receipts,
    identity,
    phase: 'audit',
    fingerprint: bookAdditionPhaseFingerprint({ base, deadlines, reason: plan.reason }),
    at,
    effect: async () => {
      let result: Awaited<ReturnType<BookAdditionAuditPort['record']>>;
      try {
        result = await options.audit.record({
          operationId: operationId(plan.actionId, plan, 'audit'),
          actionId: plan.actionId,
          ownerId: plan.ownerId,
          bookId: plan.bookId,
          contextKey: plan.contextKey,
          contextId: plan.contextId,
          studentId: plan.studentId,
          bindingId: projectionReference.bindingId!,
          bindingRevision: projectionReference.bindingRevision!,
          addedPlacementIds: selectedPlacements(plan),
          deadlines,
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
  options: BookAdditionUpdateExecutorOptions,
  action: BookUpdateActionRecord,
  at: string,
): Promise<
  | { readonly status: 'ready'; readonly action: BookUpdateActionRecord }
  | { readonly status: 'pending'; readonly action: BookUpdateActionRecord; readonly code: string }
  | { readonly status: 'replayed'; readonly action: BookUpdateActionRecord }
> => {
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

export const createBookAdditionUpdateExecutor = (options: BookAdditionUpdateExecutorOptions) => Object.freeze({
  async execute(input: { readonly ownerId: string; readonly actionId: string }): Promise<BookAdditionUpdateResult> {
    if (!validId(input.ownerId) || !validId(input.actionId)) {
      return { status: 'blocked', code: 'invalid-action-identity' };
    }
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
    if (action.selections.length === 0 || action.selections.some((selection) => selection.choice !== 'include-required')) {
      return { status: 'pending', action, code: 'delegate-other-update-case', completedStudentCount: 0 };
    }
    if (action.audit.classifications.length !== 1
      || action.audit.classifications[0] !== 'added'
      || action.audit.checkpointCount !== 0) {
      return { status: 'pending', action, code: 'addition-case-policy-invalid', completedStudentCount: 0 };
    }
    let at: string;
    try { at = (options.now?.() ?? new Date()).toISOString(); } catch { return { status: 'blocked', code: 'clock-invalid' }; }
    let applying: Awaited<ReturnType<typeof applyingAction>>;
    try { applying = await applyingAction(options, action, at); } catch { return { status: 'pending', action, code: 'action-transition-unavailable', completedStudentCount: 0 }; }
    if (applying.status === 'replayed') return applying;
    if (applying.status === 'pending') return { ...applying, completedStudentCount: 0 };
    action = applying.action;
    if (action.state !== 'applying') return { status: 'blocked', code: 'action-not-applicable' };
    let resolved: BookAdditionPlanResolution;
    try { resolved = await options.resolver.resolve(action); } catch { return { status: 'pending', action, code: 'case-resolution-unavailable', completedStudentCount: 0 }; }
    if (resolved.status !== 'ready') return { status: 'pending', action, code: `case-resolution-${resolved.status}`, completedStudentCount: 0 };
    const planKeys = resolved.students.map((plan) => `${plan.contextKey}\u0000${plan.studentId}`);
    const selectedKeys = action.selections.map((selection) => `${selection.contextKey}\u0000${selection.placementId}`);
    if (resolved.students.length === 0
      || new Set(planKeys).size !== planKeys.length
      || new Set(selectedKeys).size !== selectedKeys.length
      || resolved.students.some((plan) => !validatePlan(action!, plan))
      || action.selections.some((selection) => !resolved.students.some((plan) => (
        plan.contextKey === selection.contextKey
        && plan.additions.some((addition) => addition.placement.placementId === selection.placementId)
      )))) {
      return { status: 'pending', action, code: 'case-plan-invalid', completedStudentCount: 0 };
    }
    const students = [...resolved.students].sort((left, right) => (
      `${left.contextKey}\u0000${left.studentId}`.localeCompare(`${right.contextKey}\u0000${right.studentId}`)
    ));
    let completedStudentCount = 0;
    for (const plan of students) {
      let result: PhaseResult;
      try { result = await processPlan(options, plan, at); } catch { return { status: 'pending', action, code: 'addition-phase-unavailable', completedStudentCount }; }
      if (result.status !== 'ok') return { status: 'pending', action, code: result.code, completedStudentCount };
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

  /** Finalization is callable only after every recipient addition receipt converges. */
  async finalize(input: { readonly ownerId: string; readonly actionId: string }): Promise<BookUpdateFinalizationResult> {
    const action = await options.actions.read(input.ownerId, input.actionId);
    if (!action || action.ownerId !== input.ownerId) return { status: 'blocked', code: 'action-missing' };
    if (action.state !== 'committed' && action.state !== 'notification-pending' && action.state !== 'completed') {
      return { status: 'blocked', code: 'action-not-committed' };
    }
    return options.finalizer.finalize(input);
  },
});

export const createBookRequiredAdditionUpdateExecutor = createBookAdditionUpdateExecutor;
