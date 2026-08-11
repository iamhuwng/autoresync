import type {
  BookDeliveryBinding,
  BookDeliveryPlacement,
  BookDeliveryStructuralNodeProjection,
} from './bookDelivery.types';
import type {
  BookRedoCurrentActivityProjection,
  BookRedoCurrentProjection,
} from './bookRedoCurrentProjection.adapter';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export interface BookAdditionActivityInput {
  readonly placement: BookDeliveryPlacement;
  /** Frozen Homework policy fact. V1 never infers optional applicability. */
  readonly feedbackRelease: 'hidden' | 'released';
}

export interface BookAdditionProjectionInput {
  readonly operationId?: string;
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
  readonly currentBinding: BookDeliveryBinding;
  readonly nextBinding: BookDeliveryBinding;
  readonly currentProjection: BookRedoCurrentProjection;
  readonly additions: readonly BookAdditionActivityInput[];
  readonly now: string;
  readonly optional?: never;
  readonly applicabilityPolicy?: never;
}

export interface BookAdditionProjection {
  readonly binding: BookDeliveryBinding;
  readonly projection: BookRedoCurrentProjection;
  readonly addedPlacementIds: readonly string[];
  readonly reopened: boolean;
}

export type BookAdditionProjectionResult =
  | { readonly status: 'projected'; readonly result: BookAdditionProjection }
  | { readonly status: 'invalid'; readonly code: string };

export interface BookAdditionProjectionRepository {
  read(input: {
    readonly ownerId: string;
    readonly contextKey: string;
    readonly studentId: string;
  }): Promise<{ readonly binding: BookDeliveryBinding; readonly projection: BookRedoCurrentProjection } | null>;
  commit(input: {
    readonly operationId: string;
    readonly expectedBindingId: string;
    readonly expectedBindingRevision: number;
    readonly binding: BookDeliveryBinding;
    readonly projection: BookRedoCurrentProjection;
  }): Promise<{ readonly status: 'applied' | 'replayed' | 'conflict' }>;
}

export type BookAdditionProjectionMutationResult =
  | {
      readonly status: 'applied' | 'replayed';
      readonly binding: BookDeliveryBinding;
      readonly projection: BookRedoCurrentProjection;
      readonly completionStatus: 'in-progress' | 'completed';
    }
  | { readonly status: 'conflict'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(',')}}`;
};

const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const validIso = (value: unknown): value is string => (
  typeof value === 'string'
  && ISO.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
);

export const bookAdditionBindingId = (
  actionId: string,
  contextKey: string,
  studentId: string,
): string => `addition:${actionId}:${contextKey}:${studentId}`;

const invalid = (code: string): BookAdditionProjectionResult => ({ status: 'invalid', code });

const sameIdentity = (
  current: BookDeliveryBinding,
  next: BookDeliveryBinding,
  input: Pick<BookAdditionProjectionInput, 'ownerId' | 'bookId' | 'contextId' | 'studentId'>,
): boolean => current.status === 'active'
  && next.status === 'active'
  && current.context.kind === 'homework'
  && next.context.kind === 'homework'
  && current.issuer.ownerId === input.ownerId
  && next.issuer.ownerId === input.ownerId
  && current.context.ownerId === input.ownerId
  && next.context.ownerId === input.ownerId
  && current.book.bookId === input.bookId
  && next.book.bookId === input.bookId
  && current.context.contextId === input.contextId
  && next.context.contextId === input.contextId
  && current.recipient.recipientId === input.studentId
  && next.recipient.recipientId === input.studentId
  && current.context.recipientId === input.studentId
  && next.context.recipientId === input.studentId;

const bindingInvariant = (
  current: BookDeliveryBinding,
  next: BookDeliveryBinding,
): boolean => stable({
  schemaVersion: current.schemaVersion,
  recipient: current.recipient,
  issuer: current.issuer,
  book: current.book,
  context: current.context,
  sourceSet: current.sourceSet,
  schedulePolicy: current.schedulePolicy,
}) === stable({
  schemaVersion: next.schemaVersion,
  recipient: next.recipient,
  issuer: next.issuer,
  book: next.book,
  context: next.context,
  sourceSet: next.sourceSet,
  schedulePolicy: next.schedulePolicy,
});

const validOutlineExtension = (
  current: readonly BookDeliveryStructuralNodeProjection[],
  next: readonly BookDeliveryStructuralNodeProjection[],
): boolean => {
  const currentById = new Map(current.map((node) => [node.nodeKey, node]));
  const nextById = new Map(next.map((node) => [node.nodeKey, node]));
  if (currentById.size !== current.length || nextById.size !== next.length) return false;
  for (const [nodeKey, node] of currentById) {
    if (!nextById.has(nodeKey) || stable(nextById.get(nodeKey)) !== stable(node)) return false;
  }
  for (const node of next) {
    if (!validId(node.nodeKey)
      || (node.parentNodeKey !== null && !validId(node.parentNodeKey))
      || !Number.isSafeInteger(node.order)
      || node.order <= 0) return false;
    if (node.parentNodeKey !== null && !nextById.has(node.parentNodeKey)) return false;
  }
  return true;
};

const validScopeExtension = (
  current: BookDeliveryBinding['scope'],
  next: BookDeliveryBinding['scope'],
): boolean => current.kind === next.kind
  && current.placementIds.every((id) => next.placementIds.includes(id))
  && current.nodeKeys.every((id) => next.nodeKeys.includes(id))
  && new Set(next.placementIds).size === next.placementIds.length
  && new Set(next.nodeKeys).size === next.nodeKeys.length
  && next.placementIds.every(validId)
  && next.nodeKeys.every(validId);

const requiredRow = (
  placement: BookDeliveryPlacement,
  feedbackRelease: 'hidden' | 'released',
): BookRedoCurrentActivityProjection => ({
  placementId: placement.placementId,
  activityVersionId: placement.activityVersionId,
  required: true,
  completionStatus: 'not-started',
  answerState: null,
  attemptCount: 0,
  attemptEligibility: 'eligible',
  evaluationRevision: 0,
  earnedScore: null,
  maximumScore: null,
  correctionNote: null,
  feedbackRelease,
});

const completion = (
  input: BookAdditionProjectionInput,
  activities: readonly BookRedoCurrentActivityProjection[],
): BookRedoCurrentProjection['completion'] => {
  const completionActivities = activities
    .map((activity) => ({
      placementId: activity.placementId,
      required: activity.required,
      completionStatus: activity.completionStatus === 'submitted'
        ? 'in-progress' as const
        : activity.completionStatus,
      reopenedByAction: input.additions.some((addition) => addition.placement.placementId === activity.placementId),
    }))
    .sort((left, right) => left.placementId.localeCompare(right.placementId));
  const requiredPlacementIds = completionActivities.filter((activity) => activity.required).map((activity) => activity.placementId);
  const completedPlacementIds = completionActivities
    .filter((activity) => activity.required && activity.completionStatus === 'completed')
    .map((activity) => activity.placementId);
  return {
    schemaVersion: 1,
    actionId: input.actionId,
    ownerId: input.ownerId,
    bookId: input.bookId,
    contextKey: input.contextKey,
    contextId: input.contextId,
    studentId: input.studentId,
    bindingId: input.nextBinding.bindingId,
    bindingRevision: input.nextBinding.revision,
    requiredPlacementIds,
    completedPlacementIds,
    requiredCount: requiredPlacementIds.length,
    completedCount: completedPlacementIds.length,
    status: requiredPlacementIds.length === completedPlacementIds.length ? 'completed' : 'in-progress',
    activities: completionActivities,
  };
};

const validateInput = (input: BookAdditionProjectionInput): string | null => {
  const raw = input as unknown as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(raw, 'optional')
    || Object.prototype.hasOwnProperty.call(raw, 'applicabilityPolicy')) return 'applicability-policy-unsupported';
  if (![input.actionId, input.ownerId, input.bookId, input.contextKey, input.contextId, input.studentId]
    .every(validId)) return 'projection-input-invalid';
  if (input.contextKey !== `homework:${input.contextId}`) return 'context-selection-mismatch';
  if (!validIso(input.now) || !Number.isSafeInteger(input.currentBinding.revision)
    || input.currentBinding.revision < 1
    || input.currentBinding.schemaVersion !== 3
    || !validId(input.currentBinding.bindingId)
    || input.nextBinding.schemaVersion !== 3
    || !Number.isSafeInteger(input.nextBinding.revision)
    || input.nextBinding.revision !== input.currentBinding.revision + 1
    || input.nextBinding.bindingId !== bookAdditionBindingId(input.actionId, input.contextKey, input.studentId)
    || !validId(input.nextBinding.bindingId)
    || input.nextBinding.createdAt !== input.now
    || !sameIdentity(input.currentBinding, input.nextBinding, input)
    || !bindingInvariant(input.currentBinding, input.nextBinding)
    || !validOutlineExtension(input.currentBinding.outline, input.nextBinding.outline)
    || !validScopeExtension(input.currentBinding.scope, input.nextBinding.scope)
    || input.currentProjection.ownerId !== input.ownerId
    || input.currentProjection.bookId !== input.bookId
    || input.currentProjection.contextKey !== input.contextKey
    || input.currentProjection.contextId !== input.contextId
    || input.currentProjection.studentId !== input.studentId
    || input.currentProjection.bindingId !== input.currentBinding.bindingId
    || input.currentProjection.bindingRevision !== input.currentBinding.revision
    || !Array.isArray(input.additions)
    || input.additions.length === 0) return 'projection-input-invalid';
  return null;
};

/**
 * Build the addition projection without touching answers, attempts, scores,
 * or historical rows. The only new current rows are required, not-started
 * rows for the explicitly selected placements.
 */
export const projectBookAddition = (
  input: BookAdditionProjectionInput,
): BookAdditionProjectionResult => {
  const inputError = validateInput(input);
  if (inputError) return invalid(inputError);
  const currentById = new Map(input.currentBinding.placements.map((placement) => [placement.placementId, placement]));
  const nextById = new Map(input.nextBinding.placements.map((placement) => [placement.placementId, placement]));
  const currentRows = new Map(input.currentProjection.activities.map((activity) => [activity.placementId, activity]));
  if (currentById.size !== input.currentBinding.placements.length
    || nextById.size !== input.nextBinding.placements.length
    || currentRows.size !== input.currentProjection.activities.length
    || currentRows.size !== currentById.size) return invalid('placement-identity-invalid');
  for (const [placementId, placement] of currentById) {
    const next = nextById.get(placementId);
    const row = currentRows.get(placementId);
    if (!next || stable(next) !== stable(placement) || !row) return invalid('existing-placement-mutated');
  }
  const additions = new Map<string, BookAdditionActivityInput>();
  for (const addition of input.additions) {
    const placement = addition.placement;
    if (!validId(placement.placementId)
      || !validId(placement.activityId)
      || !validId(placement.activityVersionId)
      || !validId(placement.nodeKey)
      || !Number.isSafeInteger(placement.activityVersion)
      || placement.activityVersion < 1
      || placement.contextMode !== 'required'
      || (addition.feedbackRelease !== 'hidden' && addition.feedbackRelease !== 'released')
      || currentById.has(placement.placementId)
      || additions.has(placement.placementId)
      || stable(nextById.get(placement.placementId)) !== stable(placement)) {
      return invalid(placement.contextMode === 'optional' ? 'optional-context-unsupported' : 'addition-placement-invalid');
    }
    if (!input.nextBinding.outline.some((node) => node.nodeKey === placement.nodeKey)
      || !input.nextBinding.scope.nodeKeys.includes(placement.nodeKey)
      || !input.nextBinding.scope.placementIds.includes(placement.placementId)) {
      return invalid('addition-scope-missing');
    }
    additions.set(placement.placementId, addition);
  }
  const nextOnly = [...nextById.keys()].filter((placementId) => !currentById.has(placementId));
  if (nextOnly.length !== additions.size || nextOnly.some((placementId) => !additions.has(placementId))) {
    return invalid('addition-set-mismatch');
  }
  if (input.nextBinding.scope.placementIds.some((placementId) => !nextById.has(placementId))) {
    return invalid('scope-placement-missing');
  }
  const activities = [
    ...input.currentProjection.activities.map((activity) => clone(activity)),
    ...[...additions.values()]
      .sort((left, right) => left.placement.order - right.placement.order || left.placement.placementId.localeCompare(right.placement.placementId))
      .map((addition) => requiredRow(addition.placement, addition.feedbackRelease)),
  ];
  const projection: BookRedoCurrentProjection = {
    ...clone(input.currentProjection),
    actionId: input.actionId,
    bindingId: input.nextBinding.bindingId,
    bindingRevision: input.nextBinding.revision,
    activities,
    completion: completion(input, activities),
  };
  return {
    status: 'projected',
    result: Object.freeze({
      binding: clone(input.nextBinding),
      projection: clone(projection),
      addedPlacementIds: Object.freeze([...additions.keys()].sort()),
      reopened: input.currentProjection.completion.status === 'completed'
        && projection.completion.status === 'in-progress',
    }),
  };
};

export const createBookAdditionProjectionAdapter = (
  repository: BookAdditionProjectionRepository,
) => Object.freeze({
  project: projectBookAddition,
  async apply(input: BookAdditionProjectionInput & { readonly operationId: string }): Promise<BookAdditionProjectionMutationResult> {
    const inputError = validateInput(input);
    if (inputError) return { status: 'conflict', code: inputError };
    if (!validId(input.operationId)) return { status: 'conflict', code: 'operation-id-invalid' };
    const current = await repository.read({
      ownerId: input.ownerId,
      contextKey: input.contextKey,
      studentId: input.studentId,
    });
    if (!current) return { status: 'conflict', code: 'projection-current-missing' };
    if (current.binding.bindingId === input.nextBinding.bindingId
      && current.binding.revision === input.nextBinding.revision) {
      return stable(current.binding) === stable(input.nextBinding)
        && current.projection.actionId === input.actionId
        && current.projection.bindingId === input.nextBinding.bindingId
        && current.projection.bindingRevision === input.nextBinding.revision
        ? {
            status: 'replayed',
            binding: clone(current.binding),
            projection: clone(current.projection),
            completionStatus: current.projection.completion.status,
          }
        : { status: 'conflict', code: 'projection-replay-mismatch' };
    }
    if (current.binding.bindingId !== input.currentBinding.bindingId
      || current.binding.revision !== input.currentBinding.revision) {
      return { status: 'conflict', code: 'binding-revision-stale' };
    }
    const projected = projectBookAddition({ ...input, currentBinding: current.binding, currentProjection: current.projection });
    if (projected.status !== 'projected') return { status: 'conflict', code: projected.code };
    const result = await repository.commit({
      operationId: input.operationId,
      expectedBindingId: current.binding.bindingId,
      expectedBindingRevision: current.binding.revision,
      binding: projected.result.binding,
      projection: projected.result.projection,
    });
    if (result.status === 'conflict') return { status: 'conflict', code: 'projection-commit-conflict' };
    return {
      status: result.status,
      binding: clone(projected.result.binding),
      projection: clone(projected.result.projection),
      completionStatus: projected.result.projection.completion.status,
    };
  },
});
