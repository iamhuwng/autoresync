import type {
  BookDeliveryBinding,
  BookDeliveryPlacement,
} from './bookDelivery.types';
import type { BookDeliveryRepository } from './bookDelivery.entitlement';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export interface BookRedoBindingProjectionInput {
  readonly actionId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
  readonly current: BookDeliveryBinding;
  readonly next: BookDeliveryBinding;
  readonly selectedPlacementIds: readonly string[];
  readonly now: string;
}

export interface BookRedoBindingPlacementReplacement {
  readonly placementId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly pageGroupKeys?: readonly string[];
  readonly sourcePageScopes?: readonly BookDeliveryPlacement['sourcePageScopes'][number][];
}

export type BookRedoBindingProjectionResult =
  | { readonly status: 'projected'; readonly binding: BookDeliveryBinding }
  | { readonly status: 'invalid'; readonly code: string };

export type BookRedoBindingMutationResult =
  | { readonly status: 'applied' | 'replayed'; readonly binding: BookDeliveryBinding }
  | { readonly status: 'conflict'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
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

const bindingIdentity = (binding: BookDeliveryBinding): string => stable({
  recipient: binding.recipient,
  issuer: binding.issuer,
  book: binding.book,
  scope: binding.scope,
  outline: binding.outline,
  context: binding.context,
  sourceSet: binding.sourceSet,
  schedulePolicy: binding.schedulePolicy,
});

const placementKey = (placement: BookDeliveryPlacement): string => placement.placementId;

export const bookRedoBindingId = (
  actionId: string,
  contextKey: string,
  studentId: string,
): string => `redo:${actionId}:${contextKey}:${studentId}`;

const selectedSet = (ids: readonly string[]): Set<string> => new Set(ids);

const validPlacementSet = (
  current: BookDeliveryBinding,
  next: BookDeliveryBinding,
  selectedPlacementIds: readonly string[],
): boolean => {
  const oldById = new Map(current.placements.map((placement) => [placementKey(placement), placement]));
  const nextById = new Map(next.placements.map((placement) => [placementKey(placement), placement]));
  const selected = selectedSet(selectedPlacementIds);
  if (selected.size === 0
    || selected.size !== selectedPlacementIds.length
    || selectedPlacementIds.some((placementId) => !oldById.has(placementId) || !nextById.has(placementId))
    || oldById.size !== current.placements.length
    || nextById.size !== next.placements.length
    || oldById.size !== nextById.size) return false;
  for (const [placementId, oldPlacement] of oldById) {
    const nextPlacement = nextById.get(placementId);
    if (!nextPlacement) return false;
    if (!selected.has(placementId)) {
      if (stable(oldPlacement) !== stable(nextPlacement)) return false;
      continue;
    }
    if (oldPlacement.activityId !== nextPlacement.activityId
      || oldPlacement.nodeKey !== nextPlacement.nodeKey
      || oldPlacement.order !== nextPlacement.order
      || oldPlacement.contextMode !== nextPlacement.contextMode
      || nextPlacement.activityVersionId === oldPlacement.activityVersionId
      || nextPlacement.activityVersion <= oldPlacement.activityVersion) return false;
  }
  return true;
};

export const projectBookRedoBinding = (
  input: BookRedoBindingProjectionInput,
): BookRedoBindingProjectionResult => {
  const { current, next } = input;
  if (!validId(input.actionId)
    || !validId(input.contextKey)
    || !validId(input.contextId)
    || !validId(input.studentId)
    || !validIso(input.now)
    || current.status !== 'active'
    || next.status !== 'active'
    || !validId(current.bindingId)
    || !validId(next.bindingId)
    || !Number.isSafeInteger(current.revision)
    || current.revision < 1
    || !Number.isSafeInteger(next.revision)
    || next.revision < 1
    || current.recipient.recipientId !== input.studentId
    || next.recipient.recipientId !== input.studentId
    || current.context.contextId !== input.contextId
    || next.context.contextId !== input.contextId
    || current.context.ownerId !== current.issuer.ownerId
    || next.context.ownerId !== next.issuer.ownerId
    || bindingIdentity(current) !== bindingIdentity(next)
    || next.bindingId !== bookRedoBindingId(input.actionId, input.contextKey, input.studentId)
    || next.revision !== current.revision + 1
    || next.createdAt !== input.now
    || !validPlacementSet(current, next, input.selectedPlacementIds)) {
    return { status: 'invalid', code: 'binding-projection-invalid' };
  }
  return { status: 'projected', binding: clone(next) };
};

export const createBookRedoBindingProjection = projectBookRedoBinding;

export const buildBookRedoBinding = (input: {
  readonly actionId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
  readonly current: BookDeliveryBinding;
  readonly replacements: readonly BookRedoBindingPlacementReplacement[];
  readonly now: string;
}): BookRedoBindingProjectionResult => {
  if (!validId(input.actionId)
    || !validId(input.contextKey)
    || !validId(input.contextId)
    || !validId(input.studentId)
    || !validIso(input.now)) {
    return { status: 'invalid', code: 'binding-input-invalid' };
  }
  const replacements = new Map(input.replacements.map((replacement) => [replacement.placementId, replacement]));
  if (replacements.size !== input.replacements.length || replacements.size === 0) {
    return { status: 'invalid', code: 'binding-replacement-invalid' };
  }
  const placements = input.current.placements.map((placement) => {
    const replacement = replacements.get(placement.placementId);
    if (!replacement) return clone(placement);
    return {
      ...clone(placement),
      activityVersionId: replacement.activityVersionId,
      activityVersion: replacement.activityVersion,
      ...(replacement.pageGroupKeys ? { pageGroupKeys: [...replacement.pageGroupKeys] } : {}),
      ...(replacement.sourcePageScopes ? { sourcePageScopes: [...replacement.sourcePageScopes] } : {}),
    };
  });
  if (placements.filter((placement) => replacements.has(placement.placementId)).length !== replacements.size) {
    return { status: 'invalid', code: 'binding-replacement-target-missing' };
  }
  const next: BookDeliveryBinding = {
    ...clone(input.current),
    bindingId: bookRedoBindingId(input.actionId, input.contextKey, input.studentId),
    revision: input.current.revision + 1,
    status: 'active',
    placements,
    createdAt: input.now,
  };
  return projectBookRedoBinding({
    actionId: input.actionId,
    contextKey: input.contextKey,
    contextId: input.contextId,
    studentId: input.studentId,
    current: input.current,
    next,
    selectedPlacementIds: [...replacements.keys()],
    now: input.now,
  });
};

export const assertBookRedoBindingRevision = (input: {
  readonly binding: Pick<BookDeliveryBinding, 'bindingId' | 'revision' | 'status'>;
  readonly expectedBindingId: string;
  readonly expectedBindingRevision: number;
}): { readonly status: 'accepted' } | { readonly status: 'conflict'; readonly code: 'binding-revision-stale' } => (
  input.binding.status === 'active'
    && input.binding.bindingId === input.expectedBindingId
    && input.binding.revision === input.expectedBindingRevision
    ? { status: 'accepted' }
    : { status: 'conflict', code: 'binding-revision-stale' }
);

export const createBookRedoBindingProjectionAdapter = (
  repository: BookDeliveryRepository,
) => Object.freeze({
  async apply(input: BookRedoBindingProjectionInput & { readonly operationId: string }): Promise<BookRedoBindingMutationResult> {
    const projected = projectBookRedoBinding(input);
    if (projected.status !== 'projected') return { status: 'conflict', code: projected.code };
    const current = await repository.readCurrent(input.studentId, input.contextId);
    if (current?.bindingId === projected.binding.bindingId
      && current.bindingRevision === projected.binding.revision) {
      const record = await repository.readBinding(projected.binding.bindingId);
      if (record?.binding && stable(record.binding) === stable(projected.binding)) {
        return { status: 'replayed', binding: clone(projected.binding) };
      }
      return { status: 'conflict', code: 'binding-replay-mismatch' };
    }
    if (!current
      || current.bindingId !== input.current.bindingId
      || current.bindingRevision !== input.current.revision) {
      return { status: 'conflict', code: 'binding-revision-stale' };
    }
    const result = await repository.supersede({
      binding: projected.binding,
      expectedCurrentBindingId: input.current.bindingId,
      operationId: input.operationId,
      now: input.now,
    });
    if (result.status === 'superseded' || result.status === 'replayed') {
      const resolved = result.record ?? await repository.readBinding(projected.binding.bindingId);
      if (!resolved || stable(resolved.binding) !== stable(projected.binding)) {
        return { status: 'conflict', code: 'binding-readback-mismatch' };
      }
      return { status: result.status === 'superseded' ? 'applied' : 'replayed', binding: clone(resolved.binding) };
    }
    return { status: 'conflict', code: `binding-${result.status}` };
  },
});
