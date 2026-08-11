import {
  BOOK_IMPACT_SNAPSHOT_CONTEXT_KINDS,
  isBookImpactSnapshotExpired,
  type BookImpactSnapshotContext,
} from '../book-delivery/bookImpactSnapshot.types';
import {
  planReplacementSourceSetDelta,
} from '../book-assembly/replacementSourceSetDelta.service';
import type { ReplacementSourceSetDeltaInput } from '../book-assembly/replacementSourceSetDelta.types';
import {
  REPLACEMENT_PLAN_CAPACITY_BYTES,
  REPLACEMENT_PLAN_DEFAULT_TTL_MS,
  REPLACEMENT_PLAN_MAX_CONTEXTS,
  REPLACEMENT_PLAN_MAX_SOURCE_SCOPES,
  REPLACEMENT_PLAN_MAX_TTL_MS,
  REPLACEMENT_PLAN_SCHEMA_VERSION,
  type ReplacementAdapterVersion,
  type ReplacementCurrentRevisions,
  type ReplacementPlanBuildInput,
  type ReplacementPlanCapacityFacts,
  type ReplacementPlanContextProjection,
  type ReplacementPlanRecord,
  type ReplacementSnapshotAuthority,
} from './replacementPlan.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;

export type ReplacementPlanBuildFailureCode =
  | 'invalid-request'
  | 'stale-snapshot'
  | 'expired-snapshot'
  | 'incomplete-snapshot'
  | 'adapter-mismatch'
  | 'stale-revision'
  | 'delta-invalid'
  | 'capacity-exceeded'
  | 'uncertain';

export type ReplacementPlanBuildResult =
  | { readonly status: 'ready'; readonly plan: ReplacementPlanRecord }
  | { readonly status: 'blocked'; readonly code: ReplacementPlanBuildFailureCode; readonly errors: readonly string[] };

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const clone = <T>(value: T): T => structuredClone(value);

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => deepFreeze((value as Record<PropertyKey, unknown>)[key]));
  }
  return value;
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const safeRevision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const safeVector = (value: unknown): value is Readonly<Record<string, number>> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length > 0
    && entries.length <= 128
    && entries.every(([key, revision]) => ID.test(key) && safeRevision(revision));
};

const same = (left: unknown, right: unknown): boolean => stable(left) === stable(right);

const validCurrentRevisions = (value: ReplacementCurrentRevisions): boolean =>
  safeRevision(value.bookRevision)
  && safeRevision(value.publicationRevision)
  && safeRevision(value.sourceSetRevision)
  && safeVector(value.sourceVersionRevisions);

const contextProjection = (context: BookImpactSnapshotContext): ReplacementPlanContextProjection => {
  const scopes = new Map<string, { pageCount: number; placementCount: number }>();
  context.impact.sources.forEach((source) => {
    scopes.set(source.sourceKey, {
      pageCount: source.pages.length,
      placementCount: source.placementIds.length,
    });
  });
  return {
    contextKey: context.contextKey,
    contextKind: context.impact.contextKind,
    classification: context.impact.classification.primaryEffect,
    effects: [...context.impact.classification.effects],
    reasons: [...context.impact.classification.reasons],
    lifecycle: context.impact.lifecycle,
    status: context.impact.status,
    sourceScopes: [...scopes.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourceKey, counts]) => ({ sourceKey, ...counts })),
    activityCount: context.activityChoices.length,
    placementCount: context.impact.placements.length,
    checkpointCount: context.estimatedCheckpointCount,
    notificationCount: context.estimatedNotificationCount,
  };
};

const validateSnapshot = (
  input: ReplacementPlanBuildInput,
  snapshotAuthority: ReplacementSnapshotAuthority,
): string[] => {
  const errors: string[] = [];
  const snapshot = snapshotAuthority.snapshot;
  if (!ID.test(input.ownerId) || !ID.test(input.bookId)
    || snapshot.ownerId !== input.ownerId
    || snapshot.actorId !== input.ownerId
    || snapshot.bookId !== input.bookId) {
    errors.push('snapshot-owner-or-book-mismatch');
  }
  if (!HASH.test(snapshot.inputFingerprint) || !ID.test(snapshot.snapshotId)) errors.push('snapshot-identity-invalid');
  if (!Number.isFinite(Date.parse(snapshot.expiresAt)) || isBookImpactSnapshotExpired(snapshot, input.now)) {
    errors.push('snapshot-expired');
  }
  if (!safeVector(snapshotAuthority.revisionVector.values)) errors.push('snapshot-revision-vector-invalid');
  if (!validCurrentRevisions(snapshotAuthority.currentRevisions)) errors.push('snapshot-current-revisions-invalid');
  if (!validCurrentRevisions(input.currentRevisions)
    || !same(input.currentRevisions, snapshotAuthority.currentRevisions)) {
    errors.push('stale-current-revisions');
  }
  const adapters = snapshot.adapters;
  const adapterKinds = new Set<string>();
  if (adapters.length !== BOOK_IMPACT_SNAPSHOT_CONTEXT_KINDS.length) errors.push('adapter-coverage-incomplete');
  adapters.forEach((adapter) => {
    if (!BOOK_IMPACT_SNAPSHOT_CONTEXT_KINDS.includes(adapter.contextKind)
      || adapterKinds.has(adapter.contextKind)
      || !ID.test(adapter.adapterId)
      || !safeRevision(adapter.adapterVersion)
      || !safeRevision(adapter.contractVersion)) {
      errors.push('adapter-evidence-invalid');
    }
    adapterKinds.add(adapter.contextKind);
  });
  if (adapterKinds.size !== BOOK_IMPACT_SNAPSHOT_CONTEXT_KINDS.length) errors.push('adapter-coverage-incomplete');
  const contextKeys = new Set<string>();
  if (snapshot.contexts.length > REPLACEMENT_PLAN_MAX_CONTEXTS) errors.push('context-limit-exceeded');
  snapshot.contexts.forEach((context) => {
    if (!ID.test(context.contextKey) || contextKeys.has(context.contextKey)) errors.push('duplicate-context');
    if (!BOOK_IMPACT_SNAPSHOT_CONTEXT_KINDS.includes(context.impact.contextKind)) errors.push('context-kind-invalid');
    contextKeys.add(context.contextKey);
    if (!Number.isSafeInteger(context.estimatedCheckpointCount) || context.estimatedCheckpointCount < 0
      || !Number.isSafeInteger(context.estimatedNotificationCount) || context.estimatedNotificationCount < 0) {
      errors.push('context-count-invalid');
    }
  });
  return errors;
};

const capacityFacts = (input: ReplacementPlanBuildInput): ReplacementPlanCapacityFacts | null => {
  const usage = input.capacity.current;
  const fields = [usage.trackedAccountBytes, usage.pendingUploadBytes, usage.replacementUploadBytes, usage.temporaryBytes];
  if (!fields.every((value) => Number.isSafeInteger(value) && value >= 0)
    || !Number.isSafeInteger(input.capacity.additionalBytes) || input.capacity.additionalBytes < 0) return null;
  const current = fields.reduce((total, value) => total + value, 0);
  const projected = current + input.capacity.additionalBytes;
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(projected)) return null;
  return {
    current: clone(usage),
    additionalBytes: input.capacity.additionalBytes,
    projected,
    limit: REPLACEMENT_PLAN_CAPACITY_BYTES,
    available: projected <= REPLACEMENT_PLAN_CAPACITY_BYTES,
  };
};

export const createReplacementPlan = async (
  input: ReplacementPlanBuildInput & { readonly planId?: string },
): Promise<ReplacementPlanBuildResult> => {
  const ttlMs = input.ttlMs ?? REPLACEMENT_PLAN_DEFAULT_TTL_MS;
  if (!ID.test(input.ownerId) || !ID.test(input.bookId)
    || !Number.isFinite(Date.parse(input.now))
    || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > REPLACEMENT_PLAN_MAX_TTL_MS
    || !safeRevision(input.targetSourceSetRevision)
    || input.targetSourceSetRevision <= input.currentRevisions.sourceSetRevision) {
    return { status: 'blocked', code: 'invalid-request', errors: ['invalid-plan-request'] };
  }
  if (input.sourceSetDelta.old.sourceSet !== undefined
    && input.sourceSetDelta.old.sourceSet.sources.length > REPLACEMENT_PLAN_MAX_SOURCE_SCOPES) {
    return { status: 'blocked', code: 'invalid-request', errors: ['source-set-limit-exceeded'] };
  }
  const snapshotErrors = validateSnapshot(input, input.impactSnapshot);
  if (snapshotErrors.includes('snapshot-expired')) {
    return { status: 'blocked', code: 'expired-snapshot', errors: snapshotErrors };
  }
  if (snapshotErrors.some((value) => value.startsWith('stale-'))
    || snapshotErrors.includes('snapshot-owner-or-book-mismatch')) {
    return { status: 'blocked', code: 'stale-snapshot', errors: snapshotErrors };
  }
  if (snapshotErrors.some((value) => value.startsWith('adapter-'))) {
    return { status: 'blocked', code: 'adapter-mismatch', errors: snapshotErrors };
  }
  if (snapshotErrors.length > 0) return { status: 'blocked', code: 'incomplete-snapshot', errors: snapshotErrors };

  const delta = await planReplacementSourceSetDelta(input.sourceSetDelta);
  if (!delta.delta) return { status: 'blocked', code: 'delta-invalid', errors: delta.errors.map((entry) => entry.message) };
  const capacity = capacityFacts(input);
  if (!capacity) return { status: 'blocked', code: 'invalid-request', errors: ['capacity-facts-invalid'] };
  if (!capacity.available) return { status: 'blocked', code: 'capacity-exceeded', errors: ['source-capacity-exceeded'] };

  const snapshot = input.impactSnapshot.snapshot;
  const contexts = snapshot.contexts.map(contextProjection);
  const expiresAt = new Date(Math.min(
    Date.parse(snapshot.expiresAt),
    Date.parse(input.now) + ttlMs,
  )).toISOString();
  const adapters: ReplacementAdapterVersion[] = snapshot.adapters.map((adapter) => ({
    contextKind: adapter.contextKind,
    adapterId: adapter.adapterId,
    adapterVersion: adapter.adapterVersion,
    contractVersion: adapter.contractVersion,
  })).sort((left, right) => left.contextKind.localeCompare(right.contextKind));
  const unsigned = {
    schemaVersion: REPLACEMENT_PLAN_SCHEMA_VERSION,
    planId: input.planId ?? crypto.randomUUID(),
    ownerId: input.ownerId,
    bookId: input.bookId,
    bookRevision: input.currentRevisions.bookRevision,
    publicationRevision: input.currentRevisions.publicationRevision,
    sourceSetRevision: input.currentRevisions.sourceSetRevision,
    targetSourceSetRevision: input.targetSourceSetRevision,
    sourceVersionRevisions: clone(input.currentRevisions.sourceVersionRevisions),
    sourceSetDelta: delta.delta,
    deltaFingerprint: delta.delta.fingerprint,
    impactSnapshotId: snapshot.snapshotId,
    impactSnapshotFingerprint: snapshot.inputFingerprint,
    impactSnapshotRevisionVector: clone(input.impactSnapshot.revisionVector.values),
    impactSnapshotExpiresAt: snapshot.expiresAt,
    adapters,
    contexts,
    selectedContextKeys: [] as const,
    capacity,
    reviewState: 'unreviewed' as const,
    createdAt: input.now,
    expiresAt,
  };
  const planFingerprint = await sha256Hex(stable(unsigned));
  if (!HASH.test(planFingerprint)) return { status: 'blocked', code: 'uncertain', errors: ['plan-fingerprint-failed'] };
  const plan = deepFreeze({ ...unsigned, planFingerprint }) as ReplacementPlanRecord;
  return { status: 'ready', plan };
};

export const isReplacementPlanExpired = (
  plan: Pick<ReplacementPlanRecord, 'expiresAt'>,
  now: string,
): boolean => {
  const expiresAt = Date.parse(plan.expiresAt);
  const currentTime = Date.parse(now);
  return !Number.isFinite(expiresAt) || !Number.isFinite(currentTime) || expiresAt <= currentTime;
};

export const isReplacementPlanSnapshotCurrent = (
  plan: Pick<ReplacementPlanRecord, 'impactSnapshotRevisionVector'>,
  current: Readonly<Record<string, number>>,
): boolean => same(plan.impactSnapshotRevisionVector, current);
