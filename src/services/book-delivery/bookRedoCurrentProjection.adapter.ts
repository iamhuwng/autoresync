import {
  projectBookRedoCompletion,
  type BookRedoCompletionActivityInput,
  type BookRedoCompletionProjection,
} from './bookRedoCompletionProjection.service';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;

export interface BookRedoCurrentActivityProjection {
  readonly placementId: string;
  readonly activityVersionId: string;
  readonly required: boolean;
  readonly completionStatus: 'not-started' | 'in-progress' | 'submitted' | 'completed';
  readonly answerState: unknown;
  readonly attemptCount: number;
  readonly attemptEligibility: 'eligible' | 'exhausted' | 'closed';
  readonly evaluationRevision: number;
  readonly earnedScore: number | null;
  readonly maximumScore: number | null;
  readonly correctionNote: string | null;
  readonly feedbackRelease: 'hidden' | 'released';
}

export interface BookRedoCurrentProjection {
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly activities: readonly BookRedoCurrentActivityProjection[];
  readonly completion: BookRedoCompletionProjection;
}

export interface BookRedoCurrentProjectionRepository {
  read(input: {
    readonly ownerId: string;
    readonly contextKey: string;
    readonly studentId: string;
  }): Promise<BookRedoCurrentProjection | null>;
  commit(input: {
    readonly operationId: string;
    readonly expectedBindingId: string;
    readonly expectedBindingRevision: number;
    readonly projection: BookRedoCurrentProjection;
  }): Promise<{ readonly status: 'applied' | 'replayed' | 'conflict' }>;
}

export type BookRedoCurrentProjectionResult =
  | {
      readonly status: 'applied' | 'replayed';
      readonly projection: BookRedoCurrentProjection;
      readonly visibility: 'new';
      readonly completionStatus: 'in-progress' | 'completed';
    }
  | { readonly status: 'conflict'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);

const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(',')}}`;
};

const completionInputs = (
  activities: readonly BookRedoCurrentActivityProjection[],
  selected: ReadonlySet<string>,
): readonly BookRedoCompletionActivityInput[] => activities.map((activity) => ({
  placementId: activity.placementId,
  required: activity.required,
  lifecycle: activity.completionStatus,
  changed: selected.has(activity.placementId),
}));

const resetActivity = (
  activity: BookRedoCurrentActivityProjection,
  nextActivityVersionId: string,
): BookRedoCurrentActivityProjection => ({
  ...clone(activity),
  activityVersionId: nextActivityVersionId,
  completionStatus: 'not-started',
  answerState: null,
  attemptCount: 0,
  attemptEligibility: 'eligible',
  evaluationRevision: 0,
  earnedScore: null,
  maximumScore: null,
  correctionNote: null,
  // The old release policy is carried into the new current row. It is not
  // inferred from the checkpoint and never reveals hidden feedback.
  feedbackRelease: activity.feedbackRelease,
});

export const createBookRedoCurrentProjectionAdapter = (
  repository: BookRedoCurrentProjectionRepository,
) => Object.freeze({
  async apply(input: {
    readonly operationId: string;
    readonly actionId: string;
    readonly ownerId: string;
    readonly bookId: string;
    readonly contextKey: string;
    readonly contextId: string;
    readonly studentId: string;
    readonly bindingId: string;
    readonly bindingRevision: number;
    readonly previousBindingId: string;
    readonly previousBindingRevision: number;
    readonly selectedPlacementIds: readonly string[];
    readonly nextActivityVersionIds: Readonly<Record<string, string>>;
  }): Promise<BookRedoCurrentProjectionResult> {
    if (!validId(input.operationId)
      || !validId(input.actionId)
      || !validId(input.ownerId)
      || !validId(input.bookId)
      || !validId(input.contextKey)
      || !validId(input.contextId)
      || !validId(input.studentId)
      || !validId(input.bindingId)
      || !validId(input.previousBindingId)
      || !Number.isSafeInteger(input.bindingRevision)
      || input.bindingRevision < 1
      || !Number.isSafeInteger(input.previousBindingRevision)
      || input.previousBindingRevision < 1
      || input.bindingId === input.previousBindingId
      || input.bindingRevision !== input.previousBindingRevision + 1
      || input.selectedPlacementIds.length === 0
      || new Set(input.selectedPlacementIds).size !== input.selectedPlacementIds.length) {
      return { status: 'conflict', code: 'current-projection-input-invalid' };
    }
    const current = await repository.read({
      ownerId: input.ownerId,
      contextKey: input.contextKey,
      studentId: input.studentId,
    });
    if (!current
      || current.ownerId !== input.ownerId
      || current.bookId !== input.bookId
      || current.contextKey !== input.contextKey
      || current.contextId !== input.contextId
      || current.studentId !== input.studentId) {
      return { status: 'conflict', code: 'binding-revision-stale' };
    }
    const currentIsOld = current.bindingId === input.previousBindingId
      && current.bindingRevision === input.previousBindingRevision;
    const currentIsNew = current.bindingId === input.bindingId
      && current.bindingRevision === input.bindingRevision;
    if (!currentIsOld && !currentIsNew) return { status: 'conflict', code: 'binding-revision-stale' };
    if (currentIsNew) {
      if (current.actionId !== input.actionId
        || current.completion.bindingId !== input.bindingId
        || current.completion.bindingRevision !== input.bindingRevision) {
        return { status: 'conflict', code: 'current-projection-replay-mismatch' };
      }
      return {
        status: 'replayed',
        projection: clone(current),
        visibility: 'new',
        completionStatus: current.completion.status,
      };
    }
    const selected = new Set(input.selectedPlacementIds);
    const byId = new Map(current.activities.map((activity) => [activity.placementId, activity]));
    if (byId.size !== current.activities.length
      || [...selected].some((id) => !byId.has(id)
        || !validId(input.nextActivityVersionIds[id]))) {
      return { status: 'conflict', code: 'current-projection-placement-missing' };
    }
    const activities = current.activities.map((activity) => selected.has(activity.placementId)
      ? resetActivity(activity, input.nextActivityVersionIds[activity.placementId]!)
      : clone(activity));
    const completion = projectBookRedoCompletion({
      actionId: input.actionId,
      ownerId: input.ownerId,
      bookId: input.bookId,
      contextKey: input.contextKey,
      contextId: input.contextId,
      studentId: input.studentId,
      bindingId: input.bindingId,
      bindingRevision: input.bindingRevision,
      activities: completionInputs(current.activities, selected),
    });
    if (completion.status !== 'projected') return { status: 'conflict', code: completion.code };
    const projection: BookRedoCurrentProjection = {
      ...clone(current),
      actionId: input.actionId,
      bindingId: input.bindingId,
      bindingRevision: input.bindingRevision,
      activities,
      completion: completion.projection,
    };
    const result = await repository.commit({
      operationId: input.operationId,
      expectedBindingId: current.bindingId,
      expectedBindingRevision: current.bindingRevision,
      projection,
    });
    if (result.status !== 'applied' && result.status !== 'replayed') {
      return { status: 'conflict', code: 'current-projection-commit-conflict' };
    }
    return {
      status: result.status,
      projection: clone(projection),
      visibility: 'new',
      completionStatus: completion.projection.status,
    };
  },
});

export const bookRedoCurrentProjectionFingerprint = (projection: BookRedoCurrentProjection): string => stable(projection);
