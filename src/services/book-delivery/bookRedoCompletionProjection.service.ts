export const BOOK_REDO_COMPLETION_SCHEMA_VERSION = 1 as const;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;

export type BookRedoCompletionLifecycle =
  | 'not-started'
  | 'in-progress'
  | 'submitted'
  | 'completed';

export interface BookRedoCompletionActivityInput {
  readonly placementId: string;
  readonly required: boolean;
  readonly lifecycle: BookRedoCompletionLifecycle;
  /** True only for a selected redo/new required placement. */
  readonly changed: boolean;
}

export interface BookRedoCompletionActivity {
  readonly placementId: string;
  readonly required: boolean;
  readonly completionStatus: Exclude<BookRedoCompletionLifecycle, 'submitted'>;
  readonly reopenedByAction: boolean;
}

export interface BookRedoCompletionProjection {
  readonly schemaVersion: typeof BOOK_REDO_COMPLETION_SCHEMA_VERSION;
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly requiredPlacementIds: readonly string[];
  readonly completedPlacementIds: readonly string[];
  readonly requiredCount: number;
  readonly completedCount: number;
  readonly status: 'in-progress' | 'completed';
  readonly activities: readonly BookRedoCompletionActivity[];
}

export interface BookRedoCompletionProjectionInput {
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly activities: readonly BookRedoCompletionActivityInput[];
}

export interface BookRedoCompletionProjectionRepository {
  read(input: {
    readonly ownerId: string;
    readonly contextKey: string;
    readonly studentId: string;
  }): Promise<BookRedoCompletionProjection | null>;
  commit(input: {
    readonly operationId: string;
    readonly expectedBindingId: string;
    readonly expectedBindingRevision: number;
    readonly projection: BookRedoCompletionProjection;
  }): Promise<{ readonly status: 'applied' | 'replayed' | 'conflict' }>;
}

export type BookRedoCompletionProjectionResult =
  | { readonly status: 'projected'; readonly projection: BookRedoCompletionProjection }
  | { readonly status: 'invalid'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    });
  }
  return value;
};

const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const validActivity = (value: BookRedoCompletionActivityInput): boolean => (
  value !== null
  && typeof value === 'object'
  && validId(value.placementId)
  && typeof value.required === 'boolean'
  && typeof value.changed === 'boolean'
  && ['not-started', 'in-progress', 'submitted', 'completed'].includes(value.lifecycle)
);

/**
 * Reopens only selected changed required placements. The function never
 * receives or rewrites attempts/results, so historical provenance remains in
 * its canonical repositories while the current aggregate is recalculated.
 */
export const projectBookRedoCompletion = (
  input: BookRedoCompletionProjectionInput,
): BookRedoCompletionProjectionResult => {
  if (!validId(input.actionId)
    || !validId(input.ownerId)
    || !validId(input.bookId)
    || !validId(input.contextKey)
    || !validId(input.contextId)
    || !validId(input.studentId)
    || !validId(input.bindingId)
    || !Number.isSafeInteger(input.bindingRevision)
    || input.bindingRevision < 1
    || !Array.isArray(input.activities)
    || input.activities.length === 0
    || input.activities.some((activity) => !validActivity(activity))) {
    return { status: 'invalid', code: 'completion-input-invalid' };
  }
  const placementIds = input.activities.map((activity) => activity.placementId);
  if (new Set(placementIds).size !== placementIds.length) {
    return { status: 'invalid', code: 'completion-duplicate-placement' };
  }
  const activities = input.activities
    .map((activity): BookRedoCompletionActivity => {
      const reopened = activity.required && activity.changed;
      const completionStatus: BookRedoCompletionActivity['completionStatus'] = reopened
        ? 'not-started'
        : activity.lifecycle === 'submitted'
          ? 'in-progress'
          : activity.lifecycle;
      return {
        placementId: activity.placementId,
        required: activity.required,
        completionStatus,
        reopenedByAction: reopened,
      };
    })
    .sort((left, right) => left.placementId.localeCompare(right.placementId));
  const requiredPlacementIds = activities
    .filter((activity) => activity.required)
    .map((activity) => activity.placementId);
  const completedPlacementIds = activities
    .filter((activity) => activity.required && activity.completionStatus === 'completed')
    .map((activity) => activity.placementId);
  const projection: BookRedoCompletionProjection = {
    schemaVersion: BOOK_REDO_COMPLETION_SCHEMA_VERSION,
    actionId: input.actionId,
    ownerId: input.ownerId,
    bookId: input.bookId,
    contextKey: input.contextKey,
    contextId: input.contextId,
    studentId: input.studentId,
    bindingId: input.bindingId,
    bindingRevision: input.bindingRevision,
    requiredPlacementIds,
    completedPlacementIds,
    requiredCount: requiredPlacementIds.length,
    completedCount: completedPlacementIds.length,
    status: requiredPlacementIds.length === completedPlacementIds.length
      ? 'completed'
      : 'in-progress',
    activities,
  };
  return { status: 'projected', projection: deepFreeze(clone(projection)) };
};

export const createBookRedoCompletionProjection = projectBookRedoCompletion;

export const createBookRedoCompletionProjectionAdapter = (
  repository: BookRedoCompletionProjectionRepository,
) => Object.freeze({
  project: projectBookRedoCompletion,
  async apply(input: BookRedoCompletionProjectionInput & { readonly operationId: string }) {
    const current = await repository.read({
      ownerId: input.ownerId,
      contextKey: input.contextKey,
      studentId: input.studentId,
    });
    if (!current
      || current.contextId !== input.contextId
      || current.ownerId !== input.ownerId
      || current.bookId !== input.bookId
      || current.studentId !== input.studentId
      || current.bindingId !== input.bindingId
      || current.bindingRevision !== input.bindingRevision) {
      return { status: 'conflict' as const };
    }
    const result = projectBookRedoCompletion(input);
    if (result.status !== 'projected') return { status: 'conflict' as const };
    if (result.projection.bindingRevision !== input.bindingRevision) {
      return { status: 'conflict' as const };
    }
    return repository.commit({
      operationId: input.operationId,
      expectedBindingId: input.bindingId,
      expectedBindingRevision: input.bindingRevision,
      projection: result.projection,
    });
  },
});
