import type {
  ReplacementSagaContextItem,
  ReplacementSagaRecord,
} from '../replacement-saga/contract.ts';
import {
  REPLACEMENT_CONTEXT_MAX_DELIVERIES,
  type ReplacementContextAuthority,
  type ReplacementContextChoice,
  type ReplacementContextDecision,
  type ReplacementContextFailureCode,
  type ReplacementContextOwner,
  type ReplacementContextOwnerDependencies,
  type ReplacementContextOwnerResult,
  type ReplacementContextRepository,
} from './contract.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const CONTEXT_KINDS = new Set(['solo', 'preview', 'homework', 'course', 'class', 'public-reference']);
const CHOICES = new Set<ReplacementContextChoice>([
  'adopt-current-replacement',
  'decline-retain-unavailable',
]);

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const same = (left: unknown, right: unknown): boolean => stable(left) === stable(right);
const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const validHash = (value: unknown): value is string => typeof value === 'string' && HASH.test(value);
const validRevision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const validTime = (value: unknown): value is string => (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
);

const pending = (code: ReplacementContextFailureCode): ReplacementContextOwnerResult => ({ status: 'pending', code });
const blocked = (code: ReplacementContextFailureCode): ReplacementContextOwnerResult => ({ status: 'blocked', code });

const oldSourceVersions = (saga: ReplacementSagaRecord): Map<string, string> => (
  new Map(saga.sourceSetDelta.old.sources.map((source) => [source.sourceKey, source.sourceVersionId]))
);

const nextSourceVersions = (saga: ReplacementSagaRecord): Map<string, string> => (
  new Map(saga.sourceSetDelta.next.sources.map((source) => [source.sourceKey, source.sourceVersionId]))
);

const contextSourceVersions = (
  saga: ReplacementSagaRecord,
  item: ReplacementSagaContextItem,
  sourceMap: Map<string, string>,
): readonly string[] | null => {
  if (!Array.isArray(item.sourceScopes) || item.sourceScopes.length === 0) return [];
  if (item.sourceScopes.some((scope) => !scope || typeof scope !== 'object')) return null;
  const keys = item.sourceScopes.map((scope) => scope.sourceKey);
  if (keys.some((key) => !validId(key)) || new Set(keys).size !== keys.length) return null;
  const versions = keys.map((key) => sourceMap.get(key));
  if (versions.some((version) => version === undefined)) return null;
  return versions as string[];
};

const validateSagaShape = (
  saga: ReplacementSagaRecord,
  item: ReplacementSagaContextItem,
  operationId: string,
): ReplacementContextFailureCode | null => {
  if (!saga || typeof saga !== 'object' || saga.state !== 'contexts-pending'
    || !validId(saga.sagaId) || !validId(saga.ownerId) || !validId(saga.bookId)
    || !validId(saga.planId) || !validId(saga.reviewId)
    || !validHash(saga.planFingerprint) || !validHash(saga.deltaFingerprint)
    || !validHash(saga.snapshotFingerprint) || !validHash(saga.adapterFingerprint)
    || !validTime(saga.acceptedAt) || !validTime(saga.updatedAt)
    || !saga.contexts || typeof saga.contexts !== 'object' || Array.isArray(saga.contexts)
    || !saga.audit || typeof saga.audit !== 'object' || !validRevision(saga.audit.itemCount)
    || !item || typeof item !== 'object') {
    return 'context-provenance-invalid';
  }
  const contextEntries = Object.entries(saga.contexts);
  if (contextEntries.length === 0 || contextEntries.length !== saga.audit.itemCount) return 'context-provenance-invalid';
  if (contextEntries.some(([key, context]) => !context || typeof context !== 'object'
    || key !== context.contextKey || !validId(context.contextKey))) {
    return 'context-provenance-invalid';
  }
  const recordedItem = validId(item.contextKey) ? saga.contexts[item.contextKey] : undefined;
  if (!recordedItem
    || recordedItem.contextKind !== item.contextKind
    || recordedItem.operationId !== item.operationId
    || recordedItem.state !== item.state
    || recordedItem.stateRevision !== item.stateRevision) {
    return 'context-provenance-invalid';
  }
  if (item.state !== 'pending' || item.operationId !== operationId
    || operationId !== `${saga.sagaId}:context:${item.contextKey}`) return 'context-operation-mismatch';
  if (!CONTEXT_KINDS.has(item.contextKind)) return 'context-kind-unsupported';
  const delta = saga.sourceSetDelta as unknown as {
    readonly old?: { readonly sources?: readonly { readonly sourceKey?: unknown; readonly sourceVersionId?: unknown }[] };
    readonly next?: { readonly sources?: readonly { readonly sourceKey?: unknown; readonly sourceVersionId?: unknown }[] };
  };
  if (!delta || !Array.isArray(delta.old?.sources) || !Array.isArray(delta.next?.sources)
    || delta.old.sources.some((source) => !validId(source.sourceKey) || !validId(source.sourceVersionId))
    || delta.next.sources.some((source) => !validId(source.sourceKey) || !validId(source.sourceVersionId))) {
    return 'context-version-pin-invalid';
  }
  const oldVersions = oldSourceVersions(saga);
  const nextVersions = nextSourceVersions(saga);
  if (oldVersions.size === 0 || nextVersions.size === 0
    || oldVersions.size !== delta.old.sources.length
    || nextVersions.size !== delta.next.sources.length) {
    return 'context-version-pin-invalid';
  }
  if (!validId(operationId)) return 'context-operation-mismatch';
  return null;
};

const validateAuthority = (
  saga: ReplacementSagaRecord,
  item: ReplacementSagaContextItem,
  authority: ReplacementContextAuthority,
  decision: ReplacementContextDecision,
  expectedOldVersions: readonly string[],
  expectedNextVersions: readonly string[],
  allowCompletedReplay: boolean,
): ReplacementContextFailureCode | null => {
  if (authority.schemaVersion !== 1 || decision.schemaVersion !== 1
    || authority.sagaId !== saga.sagaId || decision.sagaId !== saga.sagaId) return 'context-cross-saga';
  if (authority.ownerId !== saga.ownerId || decision.ownerId !== saga.ownerId) return 'context-cross-owner';
  if (authority.bookId !== saga.bookId || decision.bookId !== saga.bookId) return 'context-cross-book';
  if (authority.planId !== saga.planId || decision.planId !== saga.planId
    || authority.reviewId !== saga.reviewId || decision.reviewId !== saga.reviewId) return 'context-cross-plan';
  if (authority.contextKey !== item.contextKey || decision.contextKey !== item.contextKey
    || authority.contextKind !== item.contextKind || decision.contextKind !== item.contextKind) return 'context-provenance-invalid';
  if (!validId(authority.recipientId) || !validRevision(authority.contextRevision)
    || !validHash(authority.immutableActivityWorkFingerprint)
    || !validTime(authority.updatedAt)
    || (authority.status !== 'pending' && authority.status !== 'adopted' && authority.status !== 'declined-unavailable')
    || !Array.isArray(authority.retiredDeliveries)
    || authority.retiredDeliveries.length > REPLACEMENT_CONTEXT_MAX_DELIVERIES) return 'context-provenance-invalid';
  if (authority.status !== 'pending' && !allowCompletedReplay) return 'context-replay-conflict';
  if (!same(authority.revisionVector, saga.revisionVector)
    || !same(decision.revisionVector, saga.revisionVector)
    || !validRevision(decision.decisionRevision)
    || !validHash(decision.planFingerprint)
    || !validHash(decision.deltaFingerprint)
    || !validHash(decision.snapshotFingerprint)
    || decision.planFingerprint !== saga.planFingerprint
    || decision.deltaFingerprint !== saga.deltaFingerprint
    || decision.snapshotFingerprint !== saga.snapshotFingerprint) return 'context-revision-stale';
  if (!CHOICES.has(decision.choice)
    || !Array.isArray(decision.allowedChoices)
    || !Array.isArray(authority.allowedChoices)
    || decision.allowedChoices.some((choice) => !CHOICES.has(choice))
    || authority.allowedChoices.some((choice) => !CHOICES.has(choice))
    || !same([...decision.allowedChoices].sort(), [...authority.allowedChoices].sort())
    || !authority.allowedChoices.includes(decision.choice)) return 'context-choice-unsupported';

  const deliveryIds = new Set<string>();
  for (const delivery of authority.retiredDeliveries) {
    if (!delivery || typeof delivery !== 'object') return 'context-provenance-invalid';
    if (!validId(delivery.deliveryId) || deliveryIds.has(delivery.deliveryId)) return 'context-duplicate-delivery';
    deliveryIds.add(delivery.deliveryId);
    if (!validId(delivery.bindingId) || !validRevision(delivery.bindingRevision)
      || delivery.ownerId !== saga.ownerId || delivery.bookId !== saga.bookId
      || delivery.contextKey !== item.contextKey
      || !Array.isArray(delivery.sourceVersionIds)
      || (delivery.status !== 'active' && delivery.status !== 'revoked')
      || !same([...delivery.sourceVersionIds].sort(), [...expectedOldVersions].sort())) {
      return 'context-delivery-pin-stale';
    }
  }
  if (authority.status === 'pending') {
    const declineWithoutCurrent = decision.choice === 'decline-retain-unavailable'
      && authority.current === null;
    if ((!declineWithoutCurrent && !authority.current)
      || (authority.current && (!validId(authority.current.bindingId)
        || !validRevision(authority.current.bindingRevision)
        || !Array.isArray(authority.current.sourceVersionIds)
        || !same([...authority.current.sourceVersionIds].sort(), [...expectedOldVersions].sort())))) {
      return 'context-version-pin-stale';
    }
  } else if (authority.completedChoice === 'adopt-current-replacement'
    && (!authority.current || !Array.isArray(authority.current.sourceVersionIds)
      || !same([...authority.current.sourceVersionIds].sort(), [...expectedNextVersions].sort()))) {
    return 'context-version-pin-stale';
  } else if (authority.completedChoice === 'decline-retain-unavailable' && authority.current !== null) {
    return 'context-version-pin-stale';
  }
  if (decision.choice === 'adopt-current-replacement' && expectedNextVersions.length === 0) {
    return 'context-version-pin-invalid';
  }
  if (decision.choice === 'adopt-current-replacement'
    && authority.retiredDeliveries.length === 0) return 'context-delivery-pin-missing';
  return null;
};

const requestFingerprint = async (
  saga: ReplacementSagaRecord,
  item: ReplacementSagaContextItem,
  operationId: string,
): Promise<string> => sha256Hex(stable({
  sagaId: saga.sagaId,
  ownerId: saga.ownerId,
  bookId: saga.bookId,
  planId: saga.planId,
  reviewId: saga.reviewId,
  planFingerprint: saga.planFingerprint,
  deltaFingerprint: saga.deltaFingerprint,
  snapshotFingerprint: saga.snapshotFingerprint,
  revisionVector: saga.revisionVector,
  contextKey: item.contextKey,
  contextKind: item.contextKind,
  operationId,
}));

const success = (
  status: 'adopted' | 'replayed',
  authority: ReplacementContextAuthority,
  choice: ReplacementContextChoice,
): ReplacementContextOwnerResult => ({
  status,
  authority: clone(authority),
  contextStatus: authority.status === 'adopted' ? 'adopted' : 'declined-unavailable',
  choice,
  allRetiredDeliveriesRevoked: authority.retiredDeliveries.every((delivery) => delivery.status === 'revoked'),
});

export const createReplacementContextOwner = (
  dependencies: ReplacementContextOwnerDependencies,
): ReplacementContextOwner => {
  const resolveContext = async (input: {
    readonly saga: ReplacementSagaRecord;
    readonly item: ReplacementSagaContextItem;
    readonly operationId: string;
  }): Promise<ReplacementContextOwnerResult> => {
    if (dependencies.enabled !== true) return blocked('replacement_context_disabled');
    const shapeFailure = validateSagaShape(input.saga, input.item, input.operationId);
    if (shapeFailure) return blocked(shapeFailure);
    const now = (() => {
      try {
        const value = dependencies.now?.() ?? new Date();
        return Number.isFinite(value.getTime()) ? value.toISOString() : null;
      } catch {
        return null;
      }
    })();
    if (!now) return pending('context-clock-unavailable');
    const fingerprint = await requestFingerprint(input.saga, input.item, input.operationId);
    let existing;
    try {
      existing = await dependencies.repository.findOperation({
        ownerId: input.saga.ownerId,
        bookId: input.saga.bookId,
        contextKey: input.item.contextKey,
        operationId: input.operationId,
      });
    } catch {
      return pending('context-mutation-unavailable');
    }
    if (existing && existing.requestFingerprint !== fingerprint) return blocked('context-replay-conflict');

    let authority: ReplacementContextAuthority | null;
    let decision: ReplacementContextDecision | null;
    try {
      [authority, decision] = await Promise.all([
        dependencies.repository.readAuthority({ ownerId: input.saga.ownerId, bookId: input.saga.bookId, contextKey: input.item.contextKey }),
        dependencies.repository.readDecision({
          ownerId: input.saga.ownerId,
          bookId: input.saga.bookId,
          planId: input.saga.planId,
          reviewId: input.saga.reviewId,
          contextKey: input.item.contextKey,
        }),
      ]);
    } catch {
      return pending('context-mutation-unavailable');
    }
    if (!authority) return pending('context-authority-missing');
    if (!decision) return pending('context-choice-missing');

    const oldVersions = oldSourceVersions(input.saga);
    const nextVersions = nextSourceVersions(input.saga);
    const expectedOldVersions = contextSourceVersions(input.saga, input.item, oldVersions);
    const expectedNextVersions = contextSourceVersions(input.saga, input.item, nextVersions);
    if (!expectedOldVersions || !expectedNextVersions) return blocked('context-version-pin-invalid');
    const authorityFailure = validateAuthority(
      input.saga,
      input.item,
      authority,
      decision,
      expectedOldVersions,
      expectedNextVersions,
      Boolean(existing),
    );
    if (authorityFailure) {
      if (authorityFailure === 'context-replay-conflict' && existing) {
        return blocked('context-replay-conflict');
      }
      return blocked(authorityFailure);
    }
    if (authority.status !== 'pending') {
      if (existing
        && authority.completedOperationId === input.operationId
        && authority.completedChoice === decision.choice
        && existing.contextRevision === authority.contextRevision) {
        return success('replayed', authority, decision.choice);
      }
      return blocked('context-replay-conflict');
    }
    if (existing) {
      if (existing.choice !== decision.choice || existing.contextRevision !== authority.contextRevision + 1) {
        return blocked('context-replay-conflict');
      }
      return success('replayed', authority, decision.choice);
    }

    const nextCurrent = decision.choice === 'adopt-current-replacement'
      ? {
          bindingId: authority.current!.bindingId,
          bindingRevision: authority.current!.bindingRevision + 1,
          sourceVersionIds: [...expectedNextVersions],
        }
      : null;
    let committed;
    try {
      committed = await dependencies.repository.commit({
        saga: input.saga,
        item: input.item,
        operationId: input.operationId,
        requestFingerprint: fingerprint,
        authority,
        decision,
        choice: decision.choice,
        nextCurrent,
        expectedRevision: authority.contextRevision,
        revokedDeliveryIds: authority.retiredDeliveries.map((delivery) => delivery.deliveryId),
        immutableActivityWorkFingerprint: authority.immutableActivityWorkFingerprint,
        now,
      });
    } catch {
      return pending('context-mutation-unavailable');
    }
    if (committed.status === 'missing') return pending('context-authority-missing');
    if (committed.status === 'conflict') return pending('context-cas-conflict');
    if (!committed.receipt.allRetiredDeliveriesRevoked
      || !committed.authority.retiredDeliveries.every((delivery) => delivery.status === 'revoked')) {
      return pending('context-mutation-unavailable');
    }
    return success(committed.status === 'replayed' ? 'replayed' : 'adopted', committed.authority, decision.choice);
  };

  return Object.freeze({
    resolveContext,
    async adoptAndRevoke(input: {
      readonly saga: ReplacementSagaRecord;
      readonly item: ReplacementSagaContextItem;
      readonly operationId: string;
    }) {
      const result = await resolveContext(input);
      if (result.status === 'blocked' || result.status === 'pending') {
        return { status: 'pending' as const, allRetiredDeliveriesRevoked: false };
      }
      return {
        status: result.status,
        allRetiredDeliveriesRevoked: result.allRetiredDeliveriesRevoked,
      };
    },
  });
};

export type ReplacementContextOwnerFactory = typeof createReplacementContextOwner;
