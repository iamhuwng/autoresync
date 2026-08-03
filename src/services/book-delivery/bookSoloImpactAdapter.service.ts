import type {
  BookImpactClassification,
} from './bookImpactClassification.service';
import {
  BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION,
  BOOK_IMPACT_DISCOVERY_ACTIVITY_DIFF_CLASSIFICATIONS,
  BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
  BOOK_IMPACT_DISCOVERY_EFFECTS,
  BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
  BOOK_IMPACT_DISCOVERY_MAX_ATTEMPTS_PER_CONTEXT,
  BOOK_IMPACT_DISCOVERY_MAX_CLASSIFICATION_REASONS,
  BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS,
  BOOK_IMPACT_DISCOVERY_MAX_PAGES_PER_SOURCE,
  BOOK_IMPACT_DISCOVERY_MAX_PAGE_NUMBERS_PER_CONTEXT,
  BOOK_IMPACT_DISCOVERY_MAX_PLACEMENTS_PER_CONTEXT,
  BOOK_IMPACT_DISCOVERY_MAX_REPLACEMENTS_PER_CONTEXT,
  BOOK_IMPACT_DISCOVERY_MAX_REASON_LENGTH,
  BOOK_IMPACT_DISCOVERY_MAX_SOURCE_REFS_PER_PLACEMENT,
  BOOK_IMPACT_DISCOVERY_MAX_SOURCE_REFS_PER_CONTEXT,
  BOOK_IMPACT_DISCOVERY_PRIMARY_EFFECT_PRECEDENCE,
  BOOK_IMPACT_DISCOVERY_MAX_SOURCES_PER_CONTEXT,
  BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
  containsBookImpactSensitiveKey,
  freezeBookImpactValue,
  isBookImpactDiscoverySafeId,
  isBookImpactDiscoveryTimestamp,
  type BookImpactAttemptSummary,
  type BookImpactContextInput,
  type BookImpactDiscoveryBlocked,
  type BookImpactDiscoveryAuthorizationResult,
  type BookImpactDiscoveryQuery,
  type BookImpactDiscoveryReadPage,
  type BookImpactDiscoveryResult,
  type BookImpactDiscoverySuccess,
  type BookImpactEffectiveWindow,
  type BookImpactPlacementInput,
  type BookImpactReplacementInput,
  type BookImpactSourceReference,
  type BookImpactSourceScopeSummary,
  type BookImpactSummary,
  type BookSoloImpactReader,
} from './bookImpactDiscovery.types';

export const BOOK_SOLO_IMPACT_ADAPTER_ID = 'book-solo-impact-v1' as const;
export const BOOK_SOLO_IMPACT_ADAPTER_VERSION = BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION;

export const BOOK_SOLO_IMPACT_ADAPTER_DECLARATION = Object.freeze({
  adapterId: BOOK_SOLO_IMPACT_ADAPTER_ID,
  adapterVersion: BOOK_SOLO_IMPACT_ADAPTER_VERSION,
  contextKind: 'solo' as const,
  contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
  input: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
    immutable: true as const,
    requiredFields: Object.freeze([
      'frozen-placement-binding',
      'book-impact-classification',
    ]) as readonly ['frozen-placement-binding', 'book-impact-classification'],
  }),
  classification: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    supportedEffects: BOOK_IMPACT_DISCOVERY_EFFECTS,
  }),
  sourceReplacement: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    mode: 'owner-adopts-replacement' as const,
    automaticUpdate: false as const,
  }),
  output: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
    fields: Object.freeze(['impact-summary']) as readonly ['impact-summary'],
  }),
  conformance: Object.freeze({
    status: 'verified' as const,
    contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    verifiedAdapterVersion: BOOK_SOLO_IMPACT_ADAPTER_VERSION,
  }),
});

export interface BookSoloImpactAdapter {
  readonly adapterId: typeof BOOK_SOLO_IMPACT_ADAPTER_ID;
  readonly adapterVersion: typeof BOOK_SOLO_IMPACT_ADAPTER_VERSION;
  readonly discover: (query: BookImpactDiscoveryQuery) => Promise<BookImpactDiscoveryResult>;
}

export interface BookSoloImpactAdapterOptions {
  readonly reader: BookSoloImpactReader;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const effects = new Set<string>(BOOK_IMPACT_DISCOVERY_EFFECTS);
const activityDiffClassifications = new Set<string>(BOOK_IMPACT_DISCOVERY_ACTIVITY_DIFF_CLASSIFICATIONS);
const contextKeys = [
  'attempts',
  'bindingId',
  'bindingRevision',
  'bookId',
  'bookRevision',
  'classification',
  'contextId',
  'effectiveWindow',
  'kind',
  'lifecycle',
  'observedAt',
  'ownerId',
  'placements',
  'publicationId',
  'publicationRevision',
  'recipientId',
  'replacement',
  'sources',
  'status',
] as const;

const blocked = (
  query: BookImpactDiscoveryQuery,
  code: BookImpactDiscoveryBlocked['code'],
): BookImpactDiscoveryBlocked => ({
  status: 'blocked',
  contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
  inputVersion: BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
  outputVersion: BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
  adapterId: BOOK_SOLO_IMPACT_ADAPTER_ID,
  adapterVersion: BOOK_SOLO_IMPACT_ADAPTER_VERSION,
  contextKind: 'solo',
  evaluatedAt: typeof query?.evaluatedAt === 'string' ? query.evaluatedAt : '',
  code,
});

const plainRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  && Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && descriptor !== undefined && 'value' in descriptor;
  })
);

const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => (
  plainRecord(value)
  && Reflect.ownKeys(value).every((key) => typeof key === 'string' && keys.includes(key))
  && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  && Reflect.ownKeys(value).length === keys.length
);

const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const canonicalId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const canonicalTime = (value: unknown): value is string => isBookImpactDiscoveryTimestamp(value);
const atOrBefore = (value: string, evaluatedAt: string): boolean => Date.parse(value) <= Date.parse(evaluatedAt);

const denseArray = (value: unknown): value is readonly unknown[] => (
  Array.isArray(value)
  && Object.keys(value).length === value.length
  && Object.keys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor;
  })
);

const completeReadPage = (value: unknown): value is BookImpactDiscoveryReadPage => (
  exactKeys(value, ['complete', 'contexts'])
  && value.complete === true
  && denseArray(value.contexts)
);

const sortedUniquePositivePages = (value: unknown): value is readonly number[] => (
  denseArray(value)
  && value.length > 0
  && value.length <= BOOK_IMPACT_DISCOVERY_MAX_PAGES_PER_SOURCE
  && value.every((page) => positive(page))
  && value.every((page, index) => index === 0 || (value[index - 1] as number) < (page as number))
);

const sourceKey = (source: Pick<BookImpactSourceReference, 'sourceKey' | 'sourceVersionId'>): string => (
  `${source.sourceKey}\u0000${source.sourceVersionId}`
);

const boundedReasons = (value: unknown): value is readonly string[] => (
  denseArray(value)
  && value.length <= BOOK_IMPACT_DISCOVERY_MAX_CLASSIFICATION_REASONS
  && value.every((reason) => typeof reason === 'string' && reason.length <= BOOK_IMPACT_DISCOVERY_MAX_REASON_LENGTH)
);

const validateSource = (value: unknown): value is BookImpactSourceReference => (
  plainRecord(value)
  && Reflect.ownKeys(value).every((key) => typeof key === 'string'
    && ['availability', 'pages', 'sourceKey', 'sourceVersionId', 'sourceOrder'].includes(key))
  && ['availability', 'pages', 'sourceKey', 'sourceVersionId'].every((key) => (
    Object.prototype.hasOwnProperty.call(value, key)
  ))
  && canonicalId(value.sourceKey)
  && canonicalId(value.sourceVersionId)
  && (value.availability === 'available' || value.availability === 'invalidated')
  && sortedUniquePositivePages(value.pages)
  && (value.sourceOrder === undefined || nonnegative(value.sourceOrder))
);

const validateEffectiveWindow = (value: unknown): value is BookImpactEffectiveWindow => (
  exactKeys(value, [
    'authorityRevision',
    'availableFrom',
    'dueAt',
    'extensionDueAt',
    'policyRevision',
    'winner',
  ])
  && (value.availableFrom === null || canonicalTime(value.availableFrom))
  && (value.dueAt === null || canonicalTime(value.dueAt))
  && (value.extensionDueAt === null || canonicalTime(value.extensionDueAt))
  && ['none', 'assignment', 'node', 'student-extension'].includes(value.winner as string)
  && positive(value.policyRevision)
  && positive(value.authorityRevision)
  && (value.winner !== 'student-extension' || value.extensionDueAt !== null)
  && (value.dueAt === null || value.extensionDueAt === null
    || Date.parse(value.extensionDueAt) >= Date.parse(value.dueAt))
);

const validateAttempt = (value: unknown, evaluatedAt: string): value is BookImpactAttemptSummary => (
  exactKeys(value, [
    'activityId', 'activityVersionId', 'attemptId', 'attemptNumber', 'completedAt',
    'createdAt', 'lifecycle', 'placementId',
  ])
  && canonicalId(value.attemptId)
  && positive(value.attemptNumber)
  && canonicalId(value.placementId)
  && canonicalId(value.activityId)
  && canonicalId(value.activityVersionId)
  && ['in-progress', 'submitted', 'completed'].includes(value.lifecycle as string)
  && canonicalTime(value.createdAt)
  && atOrBefore(value.createdAt, evaluatedAt)
  && (value.completedAt === null || (canonicalTime(value.completedAt) && atOrBefore(value.completedAt, evaluatedAt)))
  && (value.lifecycle === 'completed' ? value.completedAt !== null : value.completedAt === null)
);

const validatePlacement = (value: unknown): value is BookImpactPlacementInput => (
  exactKeys(value, [
    'activityId',
    'activityVersion',
    'activityVersionId',
    'nodeKey',
    'order',
    'placementId',
    'sourceRefs',
  ])
  && canonicalId(value.placementId)
  && canonicalId(value.activityId)
  && canonicalId(value.activityVersionId)
  && positive(value.activityVersion)
  && canonicalId(value.nodeKey)
  && nonnegative(value.order)
  && Array.isArray(value.sourceRefs)
  && Object.keys(value.sourceRefs).length === value.sourceRefs.length
  && value.sourceRefs.length <= BOOK_IMPACT_DISCOVERY_MAX_SOURCE_REFS_PER_PLACEMENT
  && value.sourceRefs.every(validateSource)
  && new Set(value.sourceRefs.map(sourceKey)).size === value.sourceRefs.length
);

const boundedPlacements = (value: unknown): value is readonly BookImpactPlacementInput[] => {
  if (!denseArray(value) || value.length === 0
    || value.length > BOOK_IMPACT_DISCOVERY_MAX_PLACEMENTS_PER_CONTEXT) return false;
  let sourceRefCount = 0;
  let pageNumberCount = 0;
  for (const candidate of value) {
    if (!validatePlacement(candidate)) return false;
    sourceRefCount += candidate.sourceRefs.length;
    pageNumberCount += candidate.sourceRefs.reduce((total, source) => total + source.pages.length, 0);
    if (sourceRefCount > BOOK_IMPACT_DISCOVERY_MAX_SOURCE_REFS_PER_CONTEXT
      || pageNumberCount > BOOK_IMPACT_DISCOVERY_MAX_PAGE_NUMBERS_PER_CONTEXT) return false;
  }
  return true;
};

const boundedSources = (value: unknown): value is readonly BookImpactSourceReference[] => {
  if (!denseArray(value) || value.length === 0
    || value.length > BOOK_IMPACT_DISCOVERY_MAX_SOURCES_PER_CONTEXT) return false;
  let pageNumberCount = 0;
  for (const candidate of value) {
    if (!validateSource(candidate)) return false;
    pageNumberCount += candidate.pages.length;
    if (pageNumberCount > BOOK_IMPACT_DISCOVERY_MAX_PAGE_NUMBERS_PER_CONTEXT) return false;
  }
  return true;
};

const validateClassification = (value: unknown): value is BookImpactClassification => {
  if (!exactKeys(value, [
    'activityDiff',
    'effects',
    'primaryEffect',
    'reasons',
    'requiresExplicitContextResolution',
    'requiresRedo',
    'requiresRegrade',
    'requiresSuccessor',
  ]) || !plainRecord(value.activityDiff)) return false;
  if (!exactKeys(value.activityDiff, ['classification', 'reasons', 'requiresRedo'])) return false;
  if (typeof value.activityDiff.classification !== 'string'
    || !activityDiffClassifications.has(value.activityDiff.classification)
    || !boundedReasons(value.activityDiff.reasons)
    || typeof value.activityDiff.requiresRedo !== 'boolean') return false;
  if (typeof value.primaryEffect !== 'string' || !effects.has(value.primaryEffect)
    || !denseArray(value.effects)) return false;
  const effectList = value.effects as readonly string[];
  const effectSet = new Set(effectList);
  if (effectList.length === 0
    || effectList.length > BOOK_IMPACT_DISCOVERY_EFFECTS.length
    || effectSet.size !== effectList.length
    || !effectList.every((effect) => effects.has(effect))
    || !boundedReasons(value.reasons)
    || typeof value.requiresRedo !== 'boolean'
    || typeof value.requiresRegrade !== 'boolean'
    || typeof value.requiresExplicitContextResolution !== 'boolean'
    || typeof value.requiresSuccessor !== 'boolean') return false;
  const expectedPrimary = BOOK_IMPACT_DISCOVERY_PRIMARY_EFFECT_PRECEDENCE.find((effect) => effectSet.has(effect));
  const activityEffect = value.activityDiff.classification === 'presentation-context'
    ? 'mapping-source-context'
    : value.activityDiff.classification;
  const activityRequiresRedo = value.activityDiff.classification === 'redo-required'
    || value.activityDiff.classification === 'reordered'
    || value.activityDiff.classification === 'unsupported';
  return value.primaryEffect === expectedPrimary
    && effectSet.has(activityEffect)
    && value.activityDiff.requiresRedo === activityRequiresRedo
    && value.requiresRedo === (activityRequiresRedo || effectSet.has('unsupported'))
    && value.requiresRegrade === effectSet.has('regrade')
    && value.requiresExplicitContextResolution === (
      effectSet.has('mapping-source-context') || effectSet.has('invalidation')
    )
    && value.requiresSuccessor === effectSet.has('successor');
};

const validateReplacement = (
  value: unknown,
  placements: ReadonlySet<string>,
  sources: ReadonlyMap<string, BookImpactSourceReference>,
): value is BookImpactReplacementInput => {
  if (!exactKeys(value, [
    'fromSourceVersionId',
    'mode',
    'ownerChoice',
    'placementIds',
    'sourceKey',
    'toSourceVersionId',
  ])
    || !canonicalId(value.sourceKey)
    || !canonicalId(value.fromSourceVersionId)
    || (value.toSourceVersionId !== null && !canonicalId(value.toSourceVersionId))
    || !['invalidation-only', 'owner-adopts-replacement'].includes(value.mode as string)
    || !['retain-owner', 'owner-adopts-replacement', 'invalidate-context'].includes(value.ownerChoice as string)
    || !denseArray(value.placementIds)
    || value.placementIds.length === 0
    || value.placementIds.length > BOOK_IMPACT_DISCOVERY_MAX_PLACEMENTS_PER_CONTEXT
    || new Set(value.placementIds).size !== value.placementIds.length
    || !value.placementIds.every((placementId) => canonicalId(placementId) && placements.has(placementId))) return false;
  const old = sources.get(`${value.sourceKey}\u0000${value.fromSourceVersionId}`);
  if (!old) return false;
  if (value.mode === 'owner-adopts-replacement'
    && (value.toSourceVersionId === null || value.toSourceVersionId === value.fromSourceVersionId)) return false;
  if (value.mode === 'invalidation-only'
    && (value.ownerChoice === 'owner-adopts-replacement' || value.toSourceVersionId !== null)) return false;
  return true;
};

const validateContext = (
  value: unknown,
  actorId: string,
  evaluatedAt: string,
): value is BookImpactContextInput => {
  if (!exactKeys(value, contextKeys)
    || value.kind !== 'solo'
    || !canonicalId(value.contextId)
    || value.ownerId !== actorId
    || value.recipientId !== actorId
    || !canonicalId(value.ownerId)
    || !canonicalId(value.recipientId)
    || !canonicalId(value.bindingId)
    || !positive(value.bindingRevision)
    || !['active', 'closed', 'archived'].includes(value.status as string)
    || !['not-started', 'in-progress', 'submitted', 'completed'].includes(value.lifecycle as string)
    || !canonicalId(value.bookId)
    || !positive(value.bookRevision)
    || !canonicalId(value.publicationId)
    || !positive(value.publicationRevision)
    || (value.effectiveWindow !== null && !validateEffectiveWindow(value.effectiveWindow))
    || !boundedPlacements(value.placements)
    || !denseArray(value.attempts)
    || value.attempts.length > BOOK_IMPACT_DISCOVERY_MAX_ATTEMPTS_PER_CONTEXT
    || !value.attempts.every((attempt) => validateAttempt(attempt, evaluatedAt))
    || !boundedSources(value.sources)
    || !validateClassification(value.classification)
    || !denseArray(value.replacement)
    || value.replacement.length > BOOK_IMPACT_DISCOVERY_MAX_REPLACEMENTS_PER_CONTEXT
    || !value.replacement.every((replacement) => validateReplacement(
      replacement,
      new Set(value.placements.map((placement) => placement.placementId)),
      new Map(value.sources.map((source) => [sourceKey(source), source])),
    ))
    || !canonicalTime(value.observedAt)
    || !atOrBefore(value.observedAt, evaluatedAt)) return false;
  if (containsBookImpactSensitiveKey(value)) return false;

  const placements = value.placements as readonly BookImpactPlacementInput[];
  const attempts = value.attempts as readonly BookImpactAttemptSummary[];
  const sourceRecords = value.sources as readonly BookImpactSourceReference[];
  const invalidatedSource = sourceRecords.some((source) => source.availability === 'invalidated');
  const classifiedInvalidation = value.classification.effects.includes('invalidation');
  if (invalidatedSource !== classifiedInvalidation) return false;
  if (new Set(placements.map((placement) => placement.placementId)).size !== placements.length
    || new Set(placements.map((placement) => placement.order)).size !== placements.length
    || new Set(attempts.map((attempt) => attempt.attemptId)).size !== attempts.length
    || new Set(attempts.map((attempt) => (
      `${attempt.placementId}\u0000${attempt.activityId}\u0000${attempt.attemptNumber}`
    ))).size !== attempts.length) return false;
  const sourceMap = new Map<string, BookImpactSourceReference>();
  const sourceVersions = new Map<string, string>();
  for (const source of sourceRecords) {
    const key = sourceKey(source);
    if (sourceMap.has(key)
      || (sourceVersions.has(source.sourceKey) && sourceVersions.get(source.sourceKey) !== source.sourceVersionId)) return false;
    sourceVersions.set(source.sourceKey, source.sourceVersionId);
    sourceMap.set(key, source);
  }
  const placementSourceKeys = new Set<string>();
  for (const placement of placements) {
    for (const source of placement.sourceRefs) {
      const key = sourceKey(source);
      const contextSource = sourceMap.get(key);
      if (!contextSource || contextSource.availability !== source.availability
        || contextSource.pages.join(',') !== source.pages.join(',')
        || (contextSource.sourceOrder ?? null) !== (source.sourceOrder ?? null)) return false;
      placementSourceKeys.add(key);
    }
  }
  if (placementSourceKeys.size !== sourceMap.size) return false;
  if (attempts.some((attempt) => !placements.some((placement) => (
    placement.placementId === attempt.placementId
    && placement.activityId === attempt.activityId
    && placement.activityVersionId === attempt.activityVersionId
  )))) return false;
  if (value.lifecycle === 'not-started' && attempts.length !== 0) return false;
  if (value.lifecycle !== 'not-started' && attempts.length === 0) return false;
  if (value.lifecycle === 'completed'
    && !attempts.some((attempt) => attempt.lifecycle === 'completed')) return false;
  if (value.lifecycle === 'submitted'
    && !attempts.some((attempt) => attempt.lifecycle === 'submitted' || attempt.lifecycle === 'completed')) return false;
  return true;
};

const sourceSummaries = (
  context: BookImpactContextInput,
): readonly BookImpactSourceScopeSummary[] => context.sources
  .map((source) => ({
    sourceKey: source.sourceKey,
    sourceVersionId: source.sourceVersionId,
    availability: source.availability,
    pages: [...source.pages],
    ...(source.sourceOrder === undefined ? {} : { sourceOrder: source.sourceOrder }),
    placementIds: context.placements
      .filter((placement) => placement.sourceRefs.some((ref) => sourceKey(ref) === sourceKey(source)))
      .map((placement) => placement.placementId)
      .sort(),
  }))
  .sort((left, right) => sourceKey(left).localeCompare(sourceKey(right)));

const summary = (context: BookImpactContextInput): BookImpactSummary => ({
  contextId: context.contextId,
  contextKind: context.kind,
  ownerId: context.ownerId,
  recipientId: context.recipientId,
  bindingId: context.bindingId,
  bindingRevision: context.bindingRevision,
  status: context.status,
  lifecycle: context.lifecycle,
  bookId: context.bookId,
  bookRevision: context.bookRevision,
  publicationId: context.publicationId,
  publicationRevision: context.publicationRevision,
  effectiveWindow: context.effectiveWindow === null ? null : {
    ...context.effectiveWindow,
  },
  placements: context.placements.map((placement) => ({
    ...placement,
    sourceRefs: placement.sourceRefs.map((source) => ({ ...source, pages: [...source.pages] })),
  })),
  attempts: context.attempts.map((attempt) => ({ ...attempt })),
  sources: sourceSummaries(context),
  classification: {
    primaryEffect: context.classification.primaryEffect,
    effects: [...context.classification.effects],
    reasons: [...context.classification.reasons],
    requiresRedo: context.classification.requiresRedo,
    requiresRegrade: context.classification.requiresRegrade,
  },
  replacement: context.replacement.map((replacement) => ({
    ...replacement,
    placementIds: [...replacement.placementIds],
  })),
});

const replacementScopes = (contexts: readonly BookImpactContextInput[]) => {
  const groups = new Map<string, {
    sourceKey: string;
    fromSourceVersionId: string;
    toSourceVersionId: string | null;
    contextIds: Set<string>;
    ownerIds: Set<string>;
    placementIds: Set<string>;
    mode: BookImpactReplacementInput['mode'];
    ownerChoices: Set<BookImpactReplacementInput['ownerChoice']>;
  }>();
  contexts.forEach((context) => context.replacement.forEach((replacement) => {
    const key = [
      replacement.sourceKey,
      replacement.fromSourceVersionId,
      replacement.toSourceVersionId ?? '',
      replacement.mode,
    ].join('\u0000');
    const group = groups.get(key) ?? {
      sourceKey: replacement.sourceKey,
      fromSourceVersionId: replacement.fromSourceVersionId,
      toSourceVersionId: replacement.toSourceVersionId,
      contextIds: new Set<string>(),
      ownerIds: new Set<string>(),
      placementIds: new Set<string>(),
      mode: replacement.mode,
      ownerChoices: new Set<BookImpactReplacementInput['ownerChoice']>(),
    };
    group.contextIds.add(context.contextId);
    group.ownerIds.add(context.ownerId);
    replacement.placementIds.forEach((placementId) => group.placementIds.add(placementId));
    group.ownerChoices.add(replacement.ownerChoice);
    groups.set(key, group);
  }));
  return [...groups.values()]
    .sort((left, right) => [left.sourceKey, left.fromSourceVersionId].join('\u0000')
      .localeCompare([right.sourceKey, right.fromSourceVersionId].join('\u0000')))
    .map((group) => ({
      sourceKey: group.sourceKey,
      fromSourceVersionId: group.fromSourceVersionId,
      toSourceVersionId: group.toSourceVersionId,
      contextIds: [...group.contextIds].sort(),
      ownerIds: [...group.ownerIds].sort(),
      placementIds: [...group.placementIds].sort(),
      mode: group.mode,
      ownerChoices: [...group.ownerChoices].sort(),
      automaticUpdate: false as const,
    }));
};

const discover = async (
  reader: BookSoloImpactReader,
  query: BookImpactDiscoveryQuery,
): Promise<BookImpactDiscoveryResult> => {
  if (!query || !isBookImpactDiscoverySafeId(query.actorId)) return blocked(query, 'invalid-actor');
  if (!canonicalTime(query.evaluatedAt)) return blocked(query, 'malformed');
  const limit = query.limit ?? BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS) {
    return blocked(query, 'unbounded');
  }
  let authorization: BookImpactDiscoveryAuthorizationResult;
  try {
    authorization = await reader.authorize({ actorId: query.actorId });
  } catch {
    return blocked(query, 'uncertain');
  }
  if (!authorization.authorized) return blocked(query, authorization.code);
  if (authorization.actorId !== query.actorId
    || authorization.contextKind !== 'solo'
    || authorization.ownerScope !== 'actor-owned-solo'
    || !positive(authorization.maxContexts)
    || authorization.maxContexts > BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS) {
    return blocked(query, 'unauthorized');
  }
  const readLimit = Math.min(limit, authorization.maxContexts);
  let rawContexts: readonly unknown[];
  try {
    const page = await reader.readOwnedContexts({ actorId: query.actorId, limit: readLimit });
    if (!completeReadPage(page) || page.contexts.length > readLimit) return blocked(query, 'unbounded');
    rawContexts = page.contexts;
  } catch {
    return blocked(query, 'missing');
  }
  const contexts: BookImpactContextInput[] = [];
  const ids = new Set<string>();
  const bindings = new Set<string>();
  for (const raw of rawContexts) {
    try {
      if (plainRecord(raw)
        && ((typeof raw.ownerId === 'string' && raw.ownerId !== query.actorId)
          || (typeof raw.recipientId === 'string' && raw.recipientId !== query.actorId))) {
        return blocked(query, 'cross-owner');
      }
      if (plainRecord(raw) && canonicalTime(raw.observedAt)
        && !atOrBefore(raw.observedAt, query.evaluatedAt)) return blocked(query, 'stale');
    } catch {
      return blocked(query, 'malformed');
    }
    let valid = false;
    try {
      valid = validateContext(raw, query.actorId, query.evaluatedAt);
    } catch {
      return blocked(query, 'malformed');
    }
    if (!valid) return blocked(query, 'malformed');
    if (ids.has(raw.contextId) || bindings.has(raw.bindingId)) return blocked(query, 'ambiguous');
    ids.add(raw.contextId);
    bindings.add(raw.bindingId);
    if (raw.status === 'active') contexts.push(raw);
  }
  const result: BookImpactDiscoverySuccess = {
    status: 'ok',
    contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    inputVersion: BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
    outputVersion: BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
    adapterId: BOOK_SOLO_IMPACT_ADAPTER_ID,
    adapterVersion: BOOK_SOLO_IMPACT_ADAPTER_VERSION,
    contextKind: 'solo',
    evaluatedAt: query.evaluatedAt,
    impacts: contexts
      .map(summary)
      .sort((left, right) => left.contextId.localeCompare(right.contextId)),
    replacementScopes: replacementScopes(contexts),
  };
  return freezeBookImpactValue(result);
};

export const createBookSoloImpactAdapter = (
  options: BookSoloImpactAdapterOptions,
): BookSoloImpactAdapter => {
  if (!options || !options.reader
    || typeof options.reader.authorize !== 'function'
    || typeof options.reader.readOwnedContexts !== 'function') {
    throw new TypeError('book_solo_impact_reader_invalid');
  }
  return Object.freeze({
    adapterId: BOOK_SOLO_IMPACT_ADAPTER_ID,
    adapterVersion: BOOK_SOLO_IMPACT_ADAPTER_VERSION,
    discover: (query: BookImpactDiscoveryQuery) => discover(options.reader, query),
  });
};

export const discoverBookSoloImpacts = async (input: {
  readonly reader: BookSoloImpactReader;
  readonly query: BookImpactDiscoveryQuery;
}): Promise<BookImpactDiscoveryResult> => createBookSoloImpactAdapter({ reader: input.reader }).discover(input.query);

export const discoverSoloBookImpacts = discoverBookSoloImpacts;
