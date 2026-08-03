import type { BookImpactClassification } from './bookImpactClassification.service';
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
  type BookHomeworkImpactReader,
  type BookImpactAttemptSummary,
  type BookImpactContextInput,
  type BookImpactDiscoveryAuthorizationResult,
  type BookImpactDiscoveryBlocked,
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
} from './bookImpactDiscovery.types';

export const BOOK_HOMEWORK_IMPACT_ADAPTER_ID = 'book-homework-impact-v1' as const;
export const BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION = BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION;

export const BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION = Object.freeze({
  adapterId: BOOK_HOMEWORK_IMPACT_ADAPTER_ID,
  adapterVersion: BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION,
  contextKind: 'homework' as const,
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
    verifiedAdapterVersion: BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION,
  }),
});

export interface BookHomeworkImpactAdapter {
  readonly adapterId: typeof BOOK_HOMEWORK_IMPACT_ADAPTER_ID;
  readonly adapterVersion: typeof BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION;
  readonly discover: (query: BookImpactDiscoveryQuery) => Promise<BookImpactDiscoveryResult>;
}

export interface BookHomeworkImpactAdapterOptions {
  readonly reader: BookHomeworkImpactReader;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const effects = new Set<string>(BOOK_IMPACT_DISCOVERY_EFFECTS);
const activityDiffClassifications = new Set<string>(BOOK_IMPACT_DISCOVERY_ACTIVITY_DIFF_CLASSIFICATIONS);
const contextKeys = [
  'attempts', 'bindingId', 'bindingRevision', 'bookId', 'bookRevision', 'classification',
  'contextId', 'effectiveWindow', 'kind', 'lifecycle', 'observedAt', 'ownerId', 'placements',
  'publicationId', 'publicationRevision', 'recipientId', 'replacement', 'sources', 'status',
] as const;

const blocked = (
  query: BookImpactDiscoveryQuery,
  code: BookImpactDiscoveryBlocked['code'],
): BookImpactDiscoveryBlocked => ({
  status: 'blocked',
  contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
  inputVersion: BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
  outputVersion: BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
  adapterId: BOOK_HOMEWORK_IMPACT_ADAPTER_ID,
  adapterVersion: BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION,
  contextKind: 'homework',
  evaluatedAt: typeof query?.evaluatedAt === 'string' ? query.evaluatedAt : '',
  code,
});

const plain = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  && Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && descriptor !== undefined && 'value' in descriptor;
  })
);

const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => (
  plain(value)
  && Reflect.ownKeys(value).every((key) => typeof key === 'string' && keys.includes(key))
  && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  && Reflect.ownKeys(value).length === keys.length
);

const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const id = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const time = (value: unknown): value is string => isBookImpactDiscoveryTimestamp(value);
const before = (value: string, at: string): boolean => Date.parse(value) <= Date.parse(at);
const denseArray = (value: unknown): value is readonly unknown[] => (
  Array.isArray(value)
  && Object.keys(value).length === value.length
  && Object.keys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor;
  })
);

const completeReadPage = (value: unknown): value is BookImpactDiscoveryReadPage => (
  exact(value, ['complete', 'contexts'])
  && value.complete === true
  && denseArray(value.contexts)
);
const pages = (value: unknown): value is readonly number[] => (
  denseArray(value)
  && value.length > 0
  && value.length <= BOOK_IMPACT_DISCOVERY_MAX_PAGES_PER_SOURCE
  && value.every((page) => positive(page))
  && value.every((page, index) => index === 0 || (value[index - 1] as number) < (page as number))
);
const sourceIdentity = (source: { readonly sourceKey: string; readonly sourceVersionId: string }): string => (
  `${source.sourceKey}\u0000${source.sourceVersionId}`
);

const boundedReasons = (value: unknown): value is readonly string[] => (
  denseArray(value)
  && value.length <= BOOK_IMPACT_DISCOVERY_MAX_CLASSIFICATION_REASONS
  && value.every((reason) => typeof reason === 'string' && reason.length <= BOOK_IMPACT_DISCOVERY_MAX_REASON_LENGTH)
);

const source = (value: unknown): value is BookImpactSourceReference => (
  plain(value)
  && Reflect.ownKeys(value).every((key) => typeof key === 'string'
    && ['availability', 'pages', 'sourceKey', 'sourceVersionId', 'sourceOrder'].includes(key))
  && ['availability', 'pages', 'sourceKey', 'sourceVersionId'].every((key) => (
    Object.prototype.hasOwnProperty.call(value, key)
  ))
  && id(value.sourceKey)
  && id(value.sourceVersionId)
  && (value.availability === 'available' || value.availability === 'invalidated')
  && pages(value.pages)
  && (value.sourceOrder === undefined || nonnegative(value.sourceOrder))
);

const window = (value: unknown): value is BookImpactEffectiveWindow => (
  exact(value, ['authorityRevision', 'availableFrom', 'dueAt', 'extensionDueAt', 'policyRevision', 'winner'])
  && (value.availableFrom === null || time(value.availableFrom))
  && (value.dueAt === null || time(value.dueAt))
  && (value.extensionDueAt === null || time(value.extensionDueAt))
  && ['none', 'assignment', 'node', 'student-extension'].includes(value.winner as string)
  && positive(value.policyRevision)
  && positive(value.authorityRevision)
  && value.dueAt !== null
  && (value.extensionDueAt === null || Date.parse(value.extensionDueAt) >= Date.parse(value.dueAt))
  && (value.winner !== 'student-extension' || value.extensionDueAt !== null)
);

const attempt = (value: unknown, evaluatedAt: string): value is BookImpactAttemptSummary => (
  exact(value, [
    'activityId', 'activityVersionId', 'attemptId', 'attemptNumber', 'completedAt',
    'createdAt', 'lifecycle', 'placementId',
  ])
  && id(value.attemptId)
  && positive(value.attemptNumber)
  && id(value.placementId)
  && id(value.activityId)
  && id(value.activityVersionId)
  && ['in-progress', 'submitted', 'completed'].includes(value.lifecycle as string)
  && time(value.createdAt)
  && before(value.createdAt, evaluatedAt)
  && (value.completedAt === null || (time(value.completedAt) && before(value.completedAt, evaluatedAt)))
  && (value.lifecycle === 'completed' ? value.completedAt !== null : value.completedAt === null)
);

const placement = (value: unknown): value is BookImpactPlacementInput => (
  exact(value, ['activityId', 'activityVersion', 'activityVersionId', 'nodeKey', 'order', 'placementId', 'sourceRefs'])
  && id(value.placementId)
  && id(value.activityId)
  && id(value.activityVersionId)
  && positive(value.activityVersion)
  && id(value.nodeKey)
  && nonnegative(value.order)
  && denseArray(value.sourceRefs)
  && value.sourceRefs.length <= BOOK_IMPACT_DISCOVERY_MAX_SOURCE_REFS_PER_PLACEMENT
  && value.sourceRefs.every(source)
  && new Set(value.sourceRefs.map(sourceIdentity)).size === value.sourceRefs.length
);

const boundedPlacements = (value: unknown): value is readonly BookImpactPlacementInput[] => {
  if (!denseArray(value) || value.length === 0
    || value.length > BOOK_IMPACT_DISCOVERY_MAX_PLACEMENTS_PER_CONTEXT) return false;
  let sourceRefCount = 0;
  let pageNumberCount = 0;
  for (const candidate of value) {
    if (!placement(candidate)) return false;
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
    if (!source(candidate)) return false;
    pageNumberCount += candidate.pages.length;
    if (pageNumberCount > BOOK_IMPACT_DISCOVERY_MAX_PAGE_NUMBERS_PER_CONTEXT) return false;
  }
  return true;
};

const classification = (value: unknown): value is BookImpactClassification => {
  if (!exact(value, [
    'activityDiff', 'effects', 'primaryEffect', 'reasons', 'requiresExplicitContextResolution',
    'requiresRedo', 'requiresRegrade', 'requiresSuccessor',
  ]) || !exact(value.activityDiff, ['classification', 'reasons', 'requiresRedo'])) return false;
  if (typeof value.activityDiff.classification !== 'string'
    || !activityDiffClassifications.has(value.activityDiff.classification)
    || !boundedReasons(value.activityDiff.reasons)
    || typeof value.activityDiff.requiresRedo !== 'boolean'
    || typeof value.primaryEffect !== 'string'
    || !effects.has(value.primaryEffect)
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

const replacement = (
  value: unknown,
  placementIds: ReadonlySet<string>,
  sources: ReadonlyMap<string, BookImpactSourceReference>,
): value is BookImpactReplacementInput => {
  if (!exact(value, [
    'fromSourceVersionId', 'mode', 'ownerChoice', 'placementIds', 'sourceKey', 'toSourceVersionId',
  ])
    || !id(value.sourceKey)
    || !id(value.fromSourceVersionId)
    || (value.toSourceVersionId !== null && !id(value.toSourceVersionId))
    || !['invalidation-only', 'owner-adopts-replacement'].includes(value.mode as string)
    || !['retain-owner', 'owner-adopts-replacement', 'invalidate-context'].includes(value.ownerChoice as string)
    || !denseArray(value.placementIds)
    || value.placementIds.length === 0
    || value.placementIds.length > BOOK_IMPACT_DISCOVERY_MAX_PLACEMENTS_PER_CONTEXT
    || new Set(value.placementIds).size !== value.placementIds.length
    || !value.placementIds.every((placementId) => id(placementId) && placementIds.has(placementId))) return false;
  if (!sources.has(`${value.sourceKey}\u0000${value.fromSourceVersionId}`)) return false;
  if (value.mode === 'owner-adopts-replacement'
    && (value.toSourceVersionId === null || value.toSourceVersionId === value.fromSourceVersionId)) return false;
  if (value.mode === 'invalidation-only'
    && (value.ownerChoice === 'owner-adopts-replacement' || value.toSourceVersionId !== null)) return false;
  return true;
};

const validateContext = (
  value: unknown,
  ownerId: string,
  evaluatedAt: string,
): value is BookImpactContextInput => {
  if (!exact(value, contextKeys)
    || value.kind !== 'homework'
    || !id(value.contextId)
    || !id(value.ownerId)
    || value.ownerId !== ownerId
    || !id(value.recipientId)
    || !id(value.bindingId)
    || !positive(value.bindingRevision)
    || !['active', 'closed', 'archived'].includes(value.status as string)
    || !['not-started', 'in-progress', 'submitted', 'completed'].includes(value.lifecycle as string)
    || !id(value.bookId)
    || !positive(value.bookRevision)
    || !id(value.publicationId)
    || !positive(value.publicationRevision)
    || !window(value.effectiveWindow)
    || !boundedPlacements(value.placements)
    || !denseArray(value.attempts)
    || value.attempts.length > BOOK_IMPACT_DISCOVERY_MAX_ATTEMPTS_PER_CONTEXT
    || !value.attempts.every((candidate) => attempt(candidate, evaluatedAt))
    || !boundedSources(value.sources)
    || !classification(value.classification)
    || !denseArray(value.replacement)
    || value.replacement.length > BOOK_IMPACT_DISCOVERY_MAX_REPLACEMENTS_PER_CONTEXT
    || !time(value.observedAt)
    || !before(value.observedAt, evaluatedAt)) return false;
  if (containsBookImpactSensitiveKey(value)) return false;

  const placementRecords = value.placements as readonly BookImpactPlacementInput[];
  const attemptRecords = value.attempts as readonly BookImpactAttemptSummary[];
  const sourceRecords = value.sources as readonly BookImpactSourceReference[];
  const replacementRecords = value.replacement as readonly BookImpactReplacementInput[];
  const invalidatedSource = sourceRecords.some((candidate) => candidate.availability === 'invalidated');
  const classifiedInvalidation = value.classification.effects.includes('invalidation');
  if (invalidatedSource !== classifiedInvalidation) return false;
  const placementIds = new Set(placementRecords.map((candidate) => candidate.placementId));
  const sourceMap = new Map<string, BookImpactSourceReference>();
  const sourceVersions = new Map<string, string>();
  if (placementIds.size !== placementRecords.length
    || new Set(placementRecords.map((candidate) => candidate.order)).size !== placementRecords.length
    || new Set(attemptRecords.map((candidate) => candidate.attemptId)).size !== attemptRecords.length
    || new Set(attemptRecords.map((candidate) => (
      `${candidate.placementId}\u0000${candidate.activityId}\u0000${candidate.attemptNumber}`
    ))).size !== attemptRecords.length) return false;
  for (const candidate of sourceRecords) {
    const key = sourceIdentity(candidate);
    if (sourceMap.has(key)
      || (sourceVersions.has(candidate.sourceKey)
        && sourceVersions.get(candidate.sourceKey) !== candidate.sourceVersionId)) return false;
    sourceVersions.set(candidate.sourceKey, candidate.sourceVersionId);
    sourceMap.set(key, candidate);
  }
  const placementSources = new Set<string>();
  for (const candidate of placementRecords) {
    for (const candidateSource of candidate.sourceRefs) {
      const known = sourceMap.get(sourceIdentity(candidateSource));
      if (!known || known.availability !== candidateSource.availability
        || known.pages.join(',') !== candidateSource.pages.join(',')
        || (known.sourceOrder ?? null) !== (candidateSource.sourceOrder ?? null)) return false;
      placementSources.add(sourceIdentity(candidateSource));
    }
  }
  if (placementSources.size !== sourceMap.size
    || attemptRecords.some((candidate) => !placementRecords.some((item) => (
      item.placementId === candidate.placementId
      && item.activityId === candidate.activityId
      && item.activityVersionId === candidate.activityVersionId
    )))) return false;
  if (value.lifecycle === 'not-started' && attemptRecords.length !== 0) return false;
  if (value.lifecycle !== 'not-started' && attemptRecords.length === 0) return false;
  if (value.lifecycle === 'completed'
    && !attemptRecords.some((candidate) => candidate.lifecycle === 'completed')) return false;
  if (value.lifecycle === 'submitted'
    && !attemptRecords.some((candidate) => candidate.lifecycle === 'submitted' || candidate.lifecycle === 'completed')) return false;
  return replacementRecords.every((candidate) => replacement(candidate, placementIds, sourceMap));
};

const sourceSummaries = (context: BookImpactContextInput): readonly BookImpactSourceScopeSummary[] => context.sources
  .map((candidate) => ({
    sourceKey: candidate.sourceKey,
    sourceVersionId: candidate.sourceVersionId,
    availability: candidate.availability,
    pages: [...candidate.pages],
    ...(candidate.sourceOrder === undefined ? {} : { sourceOrder: candidate.sourceOrder }),
    placementIds: context.placements
      .filter((item) => item.sourceRefs.some((ref) => sourceIdentity(ref) === sourceIdentity(candidate)))
      .map((item) => item.placementId)
      .sort(),
  }))
  .sort((left, right) => sourceIdentity(left).localeCompare(sourceIdentity(right)));

const toSummary = (context: BookImpactContextInput): BookImpactSummary => ({
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
  effectiveWindow: context.effectiveWindow === null ? null : { ...context.effectiveWindow },
  placements: context.placements.map((item) => ({
    ...item,
    sourceRefs: item.sourceRefs.map((ref) => ({ ...ref, pages: [...ref.pages] })),
  })),
  attempts: context.attempts.map((item) => ({ ...item })),
  sources: sourceSummaries(context),
  classification: {
    primaryEffect: context.classification.primaryEffect,
    effects: [...context.classification.effects],
    reasons: [...context.classification.reasons],
    requiresRedo: context.classification.requiresRedo,
    requiresRegrade: context.classification.requiresRegrade,
  },
  replacement: context.replacement.map((item) => ({ ...item, placementIds: [...item.placementIds] })),
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
  contexts.forEach((context) => context.replacement.forEach((item) => {
    const key = [item.sourceKey, item.fromSourceVersionId, item.toSourceVersionId ?? '', item.mode].join('\u0000');
    const group = groups.get(key) ?? {
      sourceKey: item.sourceKey,
      fromSourceVersionId: item.fromSourceVersionId,
      toSourceVersionId: item.toSourceVersionId,
      contextIds: new Set<string>(),
      ownerIds: new Set<string>(),
      placementIds: new Set<string>(),
      mode: item.mode,
      ownerChoices: new Set<BookImpactReplacementInput['ownerChoice']>(),
    };
    group.contextIds.add(context.contextId);
    group.ownerIds.add(context.ownerId);
    item.placementIds.forEach((placementId) => group.placementIds.add(placementId));
    group.ownerChoices.add(item.ownerChoice);
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
  reader: BookHomeworkImpactReader,
  query: BookImpactDiscoveryQuery,
): Promise<BookImpactDiscoveryResult> => {
  if (!query || !isBookImpactDiscoverySafeId(query.actorId)) return blocked(query, 'invalid-actor');
  if (!time(query.evaluatedAt)) return blocked(query, 'malformed');
  const limit = query.limit ?? BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS) return blocked(query, 'unbounded');
  let authorization: BookImpactDiscoveryAuthorizationResult;
  try {
    authorization = await reader.authorize({ actorId: query.actorId });
  } catch {
    return blocked(query, 'uncertain');
  }
  if (!authorization.authorized) return blocked(query, authorization.code);
  if (authorization.actorId !== query.actorId
    || authorization.contextKind !== 'homework'
    || authorization.ownerScope !== 'uploader-owned-homework'
    || !positive(authorization.maxContexts)
    || authorization.maxContexts > BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS) return blocked(query, 'unauthorized');
  const readLimit = Math.min(limit, authorization.maxContexts);
  let records: readonly unknown[];
  try {
    const page = await reader.readOwnedContexts({ actorId: query.actorId, limit: readLimit });
    if (!completeReadPage(page) || page.contexts.length > readLimit) return blocked(query, 'unbounded');
    records = page.contexts;
  } catch {
    return blocked(query, 'missing');
  }
  const contexts: BookImpactContextInput[] = [];
  const contextIds = new Set<string>();
  const bindings = new Set<string>();
  for (const record of records) {
    try {
      if (plain(record) && typeof record.ownerId === 'string' && record.ownerId !== query.actorId) {
        return blocked(query, 'cross-owner');
      }
      if (plain(record) && time(record.observedAt)
        && !before(record.observedAt, query.evaluatedAt)) return blocked(query, 'stale');
    } catch {
      return blocked(query, 'malformed');
    }
    let valid = false;
    try {
      valid = validateContext(record, query.actorId, query.evaluatedAt);
    } catch {
      return blocked(query, 'malformed');
    }
    if (!valid) return blocked(query, 'malformed');
    if (contextIds.has(record.contextId) || bindings.has(record.bindingId)) return blocked(query, 'ambiguous');
    contextIds.add(record.contextId);
    bindings.add(record.bindingId);
    if (record.status === 'active') contexts.push(record);
  }
  const result: BookImpactDiscoverySuccess = {
    status: 'ok',
    contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    inputVersion: BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
    outputVersion: BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
    adapterId: BOOK_HOMEWORK_IMPACT_ADAPTER_ID,
    adapterVersion: BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION,
    contextKind: 'homework',
    evaluatedAt: query.evaluatedAt,
    impacts: contexts.map(toSummary).sort((left, right) => left.contextId.localeCompare(right.contextId)),
    replacementScopes: replacementScopes(contexts),
  };
  return freezeBookImpactValue(result);
};

export const createBookHomeworkImpactAdapter = (
  options: BookHomeworkImpactAdapterOptions,
): BookHomeworkImpactAdapter => {
  if (!options || !options.reader
    || typeof options.reader.authorize !== 'function'
    || typeof options.reader.readOwnedContexts !== 'function') throw new TypeError('book_homework_impact_reader_invalid');
  return Object.freeze({
    adapterId: BOOK_HOMEWORK_IMPACT_ADAPTER_ID,
    adapterVersion: BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION,
    discover: (query: BookImpactDiscoveryQuery) => discover(options.reader, query),
  });
};

export const discoverBookHomeworkImpacts = async (input: {
  readonly reader: BookHomeworkImpactReader;
  readonly query: BookImpactDiscoveryQuery;
}): Promise<BookImpactDiscoveryResult> => createBookHomeworkImpactAdapter({ reader: input.reader }).discover(input.query);

export const discoverHomeworkBookImpacts = discoverBookHomeworkImpacts;
