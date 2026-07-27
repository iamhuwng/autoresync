import type {
  BookRuntimeCommandKind,
  BookRuntimeCommandPayload,
  BookRuntimeScheduleOperationKind,
  BookRuntimeTrustedCommandContext,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import type {
  BookDeliveryBinding,
  BookDeliveryPlacement,
} from '../../../../src/services/book-delivery/bookDelivery.types.ts';

export interface BookRuntimeActor {
  readonly uid: string;
  readonly disabled?: boolean;
}

export interface BookRuntimeScheduleDecision {
  readonly allowed: boolean;
  readonly code?: string;
}

export interface BookRuntimeSchedulePolicy {
  authorize(input: {
    readonly operation: BookRuntimeScheduleOperationKind;
    readonly binding: BookDeliveryBinding;
    readonly now: string;
  }): BookRuntimeScheduleDecision | Promise<BookRuntimeScheduleDecision>;
}

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
  constructor(readonly code: string, readonly status = 403) {
    super(code);
    this.name = 'BookRuntimeAuthorizationError';
  }
}

const deny = (code: string, status = 403): never => {
  throw new BookRuntimeAuthorizationError(code, status);
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

const authorizeDraftReadBinding = (
  actor: BookRuntimeActor,
  input: BookRuntimeDraftReadInput,
  binding: BookDeliveryBinding | null,
  now: string,
): BookRuntimeTrustedCommandContext => {
  if (!actor.uid || actor.disabled) deny('runtime_actor_denied', 401);
  if (!binding) deny('runtime_binding_not_found', 404);
  if (binding.schemaVersion !== 2) deny('runtime_binding_unsupported', 409);
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
  return {
    actorUid: actor.uid,
    operationKind: 'document',
    binding,
    placementId: input.placementId,
    activityId: input.activityId,
    activityVersion: input.activityVersion,
    interactionId: input.interactionId,
    now,
  };
};

export const authorizeRuntimeDraftRead = async (
  actor: BookRuntimeActor,
  input: BookRuntimeDraftReadInput,
  binding: BookDeliveryBinding | null,
  now: string = new Date().toISOString(),
): Promise<BookRuntimeTrustedCommandContext> => authorizeDraftReadBinding(actor, input, binding, now);

export const soloOnlyBookRuntimeSchedulePolicy: BookRuntimeSchedulePolicy = {
  authorize(input) {
    if (input.binding.context.kind !== 'solo') {
      return { allowed: false, code: 'runtime_schedule_policy_missing' };
    }
    return { allowed: true };
  },
};

export const denyAllBookRuntimeSchedulePolicy: BookRuntimeSchedulePolicy = {
  authorize() {
    return { allowed: false, code: 'runtime_schedule_policy_missing' };
  },
};

export const authorizeRuntimeCommand = async (
  actor: BookRuntimeActor,
  command: BookRuntimeCommandPayload,
  binding: BookDeliveryBinding | null,
  schedulePolicy: BookRuntimeSchedulePolicy = soloOnlyBookRuntimeSchedulePolicy,
  now: string = new Date().toISOString(),
): Promise<BookRuntimeTrustedCommandContext> => {
  if (!actor.uid || actor.disabled) deny('runtime_actor_denied', 401);
  if (!binding) deny('runtime_binding_not_found', 404);
  if (binding.schemaVersion !== 2) deny('runtime_binding_unsupported', 409);
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
  const decision = await schedulePolicy.authorize({
    operation: command.commandKind as BookRuntimeCommandKind,
    binding,
    now,
  });
  if (!decision.allowed) {
    deny(decision.code ?? 'runtime_schedule_denied', 403);
  }
  return {
    actorUid: actor.uid,
    operationKind: command.commandKind,
    binding,
    placementId: command.placementId,
    activityId: command.activityId,
    activityVersion: command.activityVersion,
    interactionId: command.interactionId,
    now,
  };
};
