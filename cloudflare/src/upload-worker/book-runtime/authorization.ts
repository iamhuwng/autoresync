import type {
  BookRuntimeCommandKind,
  BookRuntimeCommandPayload,
  BookRuntimeScheduleAuthority,
  BookRuntimeScheduleOperationKind,
  BookRuntimeScheduleTarget,
  BookRuntimeTrustedCommandContext,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import {
  BOOK_DELIVERY_SCHEMA_VERSION,
  type BookDeliveryBinding,
  type BookDeliveryPlacement,
} from '../../../../src/services/book-delivery/bookDelivery.types.ts';
/*
 * Schema v2 remains readable for legacy drafts, but mutations require the
 * current Delivery contract because v3 carries immutable Activity Version and
 * Page Group pins.
 */
const LEGACY_BOOK_DELIVERY_SCHEMA_VERSION = 2;
const isSupportedDraftReadSchema = (schemaVersion: number): boolean => (
  schemaVersion === LEGACY_BOOK_DELIVERY_SCHEMA_VERSION
  || schemaVersion === BOOK_DELIVERY_SCHEMA_VERSION
);

export interface BookRuntimeActor {
  readonly uid: string;
  readonly disabled?: boolean;
}

export type BookRuntimeScheduleDecision =
  | {
      readonly outcome: 'allowed';
      readonly authority?: BookRuntimeScheduleAuthority;
    }
  | {
      readonly outcome: 'denied' | 'conflict' | 'unavailable';
      readonly code: string;
      readonly authority?: BookRuntimeScheduleAuthority;
    };

export interface BookRuntimeSchedulePolicyInput {
  readonly operation: BookRuntimeScheduleOperationKind;
  readonly actorUid: string;
  readonly binding: BookDeliveryBinding;
  readonly target: BookRuntimeScheduleTarget;
  readonly now: string;
}

export interface BookRuntimeSchedulePolicy {
  authorize(
    input: BookRuntimeSchedulePolicyInput,
  ): BookRuntimeScheduleDecision | Promise<BookRuntimeScheduleDecision>;
  revalidate?(
    input: BookRuntimeSchedulePolicyInput & {
      readonly previousAuthority: BookRuntimeScheduleAuthority;
    },
  ): BookRuntimeScheduleDecision | Promise<BookRuntimeScheduleDecision>;
}

export type BookRuntimeTargetResolver = (input: {
  readonly actorUid: string;
  readonly binding: BookDeliveryBinding;
  readonly target: BookRuntimeScheduleTarget;
}) => boolean | Promise<boolean>;

export interface BookRuntimeDraftReadInput {
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
}

export class BookRuntimeAuthorizationError extends Error {
  constructor(
    readonly code: string,
    readonly status = 403,
    readonly currentScheduleAuthority?: BookRuntimeScheduleAuthority,
  ) {
    super(code);
    this.name = 'BookRuntimeAuthorizationError';
  }
}

const deny = (
  code: string,
  status = 403,
  currentScheduleAuthority?: BookRuntimeScheduleAuthority,
): never => {
  throw new BookRuntimeAuthorizationError(code, status, currentScheduleAuthority);
};

const hasUsableSourceState = (binding: BookDeliveryBinding): boolean =>
  binding.sourceSet.sources.length > 0
  && binding.sourceSet.sources.every((source) => source.lifecycle === 'verified-usable');

const placementMatches = (
  command: BookRuntimeCommandPayload,
  placement: BookDeliveryPlacement,
): boolean => (
  placement.placementId === command.placementId
  && placement.activityId === command.activityId
  && placement.activityVersion === command.activityVersion
);

const scheduleCode = /^[a-z0-9][a-z0-9_-]{0,95}$/u;

const projectAuthority = (
  value: BookRuntimeScheduleAuthority | undefined,
): BookRuntimeScheduleAuthority | undefined => {
  if (value === undefined
    || !Number.isSafeInteger(value.scheduleSchemaVersion)
    || value.scheduleSchemaVersion <= 0
    || !Number.isSafeInteger(value.resolverVersion)
    || value.resolverVersion <= 0
    || !Number.isSafeInteger(value.policyRevision)
    || value.policyRevision <= 0
    || !Number.isSafeInteger(value.authorityRevision)
    || value.authorityRevision <= 0) {
    return undefined;
  }
  const evaluatedAt = Date.parse(value.evaluatedAt);
  if (!Number.isFinite(evaluatedAt)
    || new Date(evaluatedAt).toISOString() !== value.evaluatedAt) {
    return undefined;
  }
  return {
    scheduleSchemaVersion: value.scheduleSchemaVersion,
    resolverVersion: value.resolverVersion,
    policyRevision: value.policyRevision,
    authorityRevision: value.authorityRevision,
    evaluatedAt: value.evaluatedAt,
  };
};

const scheduleStatus = (
  outcome: Exclude<BookRuntimeScheduleDecision['outcome'], 'allowed'>,
): number => {
  if (outcome === 'conflict') return 409;
  if (outcome === 'unavailable') return 503;
  return 403;
};

const applyScheduleDecision = (
  decision: BookRuntimeScheduleDecision,
  binding: BookDeliveryBinding,
  policy: BookRuntimeSchedulePolicy,
): BookRuntimeScheduleAuthority | undefined => {
  const authority = projectAuthority(decision.authority);
  if (decision.authority !== undefined && !authority) {
    deny('runtime_schedule_authority_invalid', 503);
  }
  if (authority
    && authority.policyRevision !== binding.schedulePolicy.policyRevision) {
    deny('runtime_schedule_policy_stale', 409, authority);
  }
  if (decision.outcome !== 'allowed') {
    if (!scheduleCode.test(decision.code)) deny('runtime_schedule_decision_invalid', 503);
    deny(decision.code, scheduleStatus(decision.outcome), authority);
  }
  if (binding.context.kind === 'homework'
    && (!authority || typeof policy.revalidate !== 'function')) {
    deny('runtime_schedule_authority_unavailable', 503);
  }
  return authority;
};

const scheduleTarget = (
  input: BookRuntimeDraftReadInput | BookRuntimeCommandPayload,
): BookRuntimeScheduleTarget => ({
  placementId: input.placementId,
  activityId: input.activityId,
  activityVersion: input.activityVersion,
  interactionId: input.interactionId,
});

const requireResolvedTarget = async (
  actorUid: string,
  binding: BookDeliveryBinding,
  target: BookRuntimeScheduleTarget,
  resolveTarget: BookRuntimeTargetResolver | undefined,
): Promise<void> => {
  if (!resolveTarget) deny('runtime_target_resolver_unavailable', 503);
  let resolved = false;
  try {
    resolved = await resolveTarget({ actorUid, binding, target });
  } catch {
    deny('runtime_target_resolver_unavailable', 503);
  }
  if (!resolved) deny('runtime_interaction_not_found', 404);
};

const authorizeDraftReadBinding = async (
  actor: BookRuntimeActor,
  input: BookRuntimeDraftReadInput,
  binding: BookDeliveryBinding | null,
  schedulePolicy: BookRuntimeSchedulePolicy,
  now: string,
  resolveTarget: BookRuntimeTargetResolver | undefined,
): Promise<BookRuntimeTrustedCommandContext> => {
  if (!actor.uid || actor.disabled) deny('runtime_actor_denied', 401);
  if (!binding) deny('runtime_binding_not_found', 404);
  if (!isSupportedDraftReadSchema(binding.schemaVersion)) deny('runtime_binding_unsupported', 409);
  if (binding.status !== 'active') deny('runtime_binding_not_active', 409);
  if (binding.bindingId !== input.bindingId
    || binding.revision !== input.bindingRevision
    || binding.context.contextId !== input.contextId) {
    deny('runtime_binding_stale', 409);
  }
  if (binding.recipient.recipientKind !== 'student'
    || binding.recipient.recipientId !== actor.uid
    || binding.context.recipientId !== actor.uid) {
    deny('runtime_recipient_forbidden', 403);
  }
  if (binding.book.bookMode !== 'pdf'
    || binding.book.publicationStatus !== 'published'
    || !Number.isSafeInteger(binding.book.publicationRevision)
    || binding.book.publicationRevision <= 0) {
    deny('runtime_publication_invalid', 409);
  }
  if (!hasUsableSourceState(binding)) deny('runtime_source_state_invalid', 409);
  if (binding.context.kind === 'preview') deny('runtime_preview_read_only', 403);
  if (binding.context.kind === 'future_live') deny('runtime_future_live_denied', 409);
  if (binding.context.kind === 'course' || binding.context.kind === 'class') {
    deny('runtime_context_unimplemented', 409);
  }
  const placement = binding.placements.find((candidate) => (
    candidate.placementId === input.placementId
    && candidate.activityId === input.activityId
    && candidate.activityVersion === input.activityVersion
  ));
  if (!placement) deny('runtime_placement_not_found', 404);
  if (binding.scope.kind === 'placements' && !binding.scope.placementIds.includes(input.placementId)) {
    deny('runtime_placement_out_of_scope', 403);
  }
  const target = scheduleTarget(input);
  await requireResolvedTarget(actor.uid, binding, target, resolveTarget);
  const scheduleAuthority = applyScheduleDecision(await schedulePolicy.authorize({
    operation: 'state',
    actorUid: actor.uid,
    binding,
    target,
    now,
  }), binding, schedulePolicy);
  return {
    actorUid: actor.uid,
    operationKind: 'state',
    binding,
    placementId: input.placementId,
    activityId: input.activityId,
    activityVersion: input.activityVersion,
    interactionId: input.interactionId,
    now,
    ...(scheduleAuthority ? { scheduleAuthority } : {}),
  };
};

export const authorizeRuntimeDraftRead = async (
  actor: BookRuntimeActor,
  input: BookRuntimeDraftReadInput,
  binding: BookDeliveryBinding | null,
  schedulePolicy: BookRuntimeSchedulePolicy = soloOnlyBookRuntimeSchedulePolicy,
  now: string = new Date().toISOString(),
  resolveTarget?: BookRuntimeTargetResolver,
): Promise<BookRuntimeTrustedCommandContext> => authorizeDraftReadBinding(
  actor,
  input,
  binding,
  schedulePolicy,
  now,
  resolveTarget,
);

export const soloOnlyBookRuntimeSchedulePolicy: BookRuntimeSchedulePolicy = {
  authorize(input) {
    if (input.binding.context.kind !== 'solo') {
      return { outcome: 'unavailable', code: 'runtime_schedule_policy_missing' };
    }
    return { outcome: 'allowed' };
  },
};

export const denyAllBookRuntimeSchedulePolicy: BookRuntimeSchedulePolicy = {
  authorize() {
    return { outcome: 'unavailable', code: 'runtime_schedule_policy_missing' };
  },
};

export const authorizeRuntimeCommand = async (
  actor: BookRuntimeActor,
  command: BookRuntimeCommandPayload,
  binding: BookDeliveryBinding | null,
  schedulePolicy: BookRuntimeSchedulePolicy = soloOnlyBookRuntimeSchedulePolicy,
  now: string = new Date().toISOString(),
  resolveTarget?: BookRuntimeTargetResolver,
): Promise<BookRuntimeTrustedCommandContext> => {
  if (!actor.uid || actor.disabled) deny('runtime_actor_denied', 401);
  if (!binding) deny('runtime_binding_not_found', 404);
  if (binding.schemaVersion !== BOOK_DELIVERY_SCHEMA_VERSION) deny('runtime_binding_unsupported', 409);
  if (binding.status !== 'active') deny('runtime_binding_not_active', 409);
  if (binding.bindingId !== command.bindingId
    || binding.revision !== command.bindingRevision
    || binding.context.contextId !== command.contextId) {
    deny('runtime_binding_stale', 409);
  }
  if (binding.recipient.recipientKind !== 'student'
    || binding.recipient.recipientId !== actor.uid
    || binding.context.recipientId !== actor.uid) {
    deny('runtime_recipient_forbidden', 403);
  }
  if (binding.book.bookMode !== 'pdf'
    || binding.book.publicationStatus !== 'published'
    || !Number.isSafeInteger(binding.book.publicationRevision)
    || binding.book.publicationRevision <= 0) {
    deny('runtime_publication_invalid', 409);
  }
  if (!hasUsableSourceState(binding)) deny('runtime_source_state_invalid', 409);
  if (binding.context.kind === 'preview') deny('runtime_preview_read_only', 403);
  if (binding.context.kind === 'future_live') deny('runtime_future_live_denied', 409);
  if (binding.context.kind === 'course' || binding.context.kind === 'class') {
    deny('runtime_context_unimplemented', 409);
  }
  const placement = binding.placements.find((candidate) => placementMatches(command, candidate));
  if (!placement) deny('runtime_placement_not_found', 404);
  if (binding.scope.kind === 'placements' && !binding.scope.placementIds.includes(command.placementId)) {
    deny('runtime_placement_out_of_scope', 403);
  }
  if (command.commandKind === 'submit' && placement.contextMode === 'required'
    && (command.response === null || command.response === '')) {
    deny('runtime_submit_missing_response', 422);
  }
  const target = scheduleTarget(command);
  await requireResolvedTarget(actor.uid, binding, target, resolveTarget);
  const scheduleAuthority = applyScheduleDecision(await schedulePolicy.authorize({
    operation: command.commandKind as BookRuntimeCommandKind,
    actorUid: actor.uid,
    binding,
    target,
    now,
  }), binding, schedulePolicy);
  return {
    actorUid: actor.uid,
    operationKind: command.commandKind,
    binding,
    placementId: command.placementId,
    activityId: command.activityId,
    activityVersion: command.activityVersion,
    interactionId: command.interactionId,
    now,
    ...(scheduleAuthority ? { scheduleAuthority } : {}),
  };
};

const sameScheduleAuthority = (
  left: BookRuntimeScheduleAuthority,
  right: BookRuntimeScheduleAuthority,
): boolean => (
  left.scheduleSchemaVersion === right.scheduleSchemaVersion
  && left.resolverVersion === right.resolverVersion
  && left.policyRevision === right.policyRevision
  && left.authorityRevision === right.authorityRevision
);

export const revalidateRuntimeScheduleAuthorization = async (
  context: BookRuntimeTrustedCommandContext,
  schedulePolicy: BookRuntimeSchedulePolicy,
  now: string = new Date().toISOString(),
): Promise<BookRuntimeTrustedCommandContext> => {
  if (!context.scheduleAuthority) {
    if (context.binding.context.kind === 'homework') {
      deny('runtime_schedule_authority_unavailable', 503);
    }
    return context;
  }
  if (!schedulePolicy.revalidate) {
    deny('runtime_schedule_authority_unavailable', 503);
  }
  const current = applyScheduleDecision(await schedulePolicy.revalidate({
    operation: context.operationKind,
    actorUid: context.actorUid,
    binding: context.binding,
    target: {
      placementId: context.placementId,
      activityId: context.activityId,
      activityVersion: context.activityVersion,
      interactionId: context.interactionId,
    },
    now,
    previousAuthority: context.scheduleAuthority,
  }), context.binding, schedulePolicy);
  if (!current || !sameScheduleAuthority(context.scheduleAuthority, current)) {
    deny('runtime_schedule_authority_stale', 409, current);
  }
  return { ...context, scheduleAuthority: current };
};
