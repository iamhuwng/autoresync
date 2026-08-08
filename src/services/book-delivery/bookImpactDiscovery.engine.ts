import type { BookImpactClassification } from './bookImpactClassification.service';
import {
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
  BOOK_IMPACT_DISCOVERY_MAX_REASON_LENGTH,
  BOOK_IMPACT_DISCOVERY_MAX_REPLACEMENTS_PER_CONTEXT,
  BOOK_IMPACT_DISCOVERY_MAX_SOURCE_REFS_PER_CONTEXT,
  BOOK_IMPACT_DISCOVERY_MAX_SOURCE_REFS_PER_PLACEMENT,
  BOOK_IMPACT_DISCOVERY_MAX_SOURCES_PER_CONTEXT,
  BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
  BOOK_IMPACT_DISCOVERY_PRIMARY_EFFECT_PRECEDENCE,
  containsBookImpactSensitiveKey,
  freezeBookImpactValue,
  isBookImpactDiscoverySafeId,
  isBookImpactDiscoveryTimestamp,
  type BookImpactAttemptSummary,
  type BookImpactContextInput,
  type BookImpactDiscoveryAuthorizationResult,
  type BookImpactDiscoveryBlocked,
  type BookImpactDiscoveryContextKind,
  type BookImpactDiscoveryQuery,
  type BookImpactDiscoveryReadPage,
  type BookImpactDiscoveryResult,
  type BookImpactDiscoverySuccess,
  type BookImpactEffectiveWindow,
  type BookImpactPlacementInput,
  type BookImpactProducerIdentity,
  type BookImpactReplacementInput,
  type BookImpactSourceReference,
  type BookImpactSourceScopeSummary,
  type BookImpactSummary,
} from './bookImpactDiscovery.types';

export interface BookImpactDiscoveryEngineReader {
  authorize(input: { readonly actorId: string }): Promise<BookImpactDiscoveryAuthorizationResult>;
  readOwnedContexts(input: {
    readonly actorId: string;
    readonly limit: number;
  }): Promise<BookImpactDiscoveryReadPage>;
}

/**
 * The adapters differ only at these explicit policy callbacks. All
 * authorization ordering, validation, materialization, and bounds remain in
 * this one security-relevant engine.
 */
export interface BookImpactDiscoveryPolicy {
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly contextKind: BookImpactDiscoveryContextKind;
  readonly ownerScope:
    | 'actor-owned-solo'
    | 'uploader-owned-homework'
    | 'teacher-owned-course'
    | 'teacher-owned-class'
    | 'downstream-owner-public-reference';
  readonly contextOwnedByActor: (
    value: Record<string, unknown>,
    actorId: string,
  ) => boolean;
  readonly validateContextWindow: (value: unknown) => boolean;
  readonly validatePlacementWindow: (value: unknown) => boolean;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const EFFECTS = new Set<string>(BOOK_IMPACT_DISCOVERY_EFFECTS);
const ACTIVITY_DIFF_CLASSIFICATIONS = new Set<string>(
  BOOK_IMPACT_DISCOVERY_ACTIVITY_DIFF_CLASSIFICATIONS,
);
const CONTEXT_KEYS = [
  'attempts', 'bindingId', 'bindingRevision', 'bookId', 'bookRevision', 'classification',
  'contextId', 'effectiveWindow', 'kind', 'lifecycle', 'observedAt', 'ownerId', 'placements',
  'publicationId', 'publicationRevision', 'recipientId', 'replacement', 'sources', 'status',
] as const;
const CONTEXT_KEYS_WITH_IDENTITY = [...CONTEXT_KEYS, 'identity'] as const;
const WINDOW_KEYS = [
  'authorityRevision', 'availableFrom', 'deadline', 'dueAt', 'extensionDueAt',
  'extensionRevision', 'policyRevision', 'release', 'winner',
] as const;
const RESOLUTION_KEYS = ['at', 'nodeKey', 'source'] as const;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  && Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && descriptor !== undefined && 'value' in descriptor;
  })
);

const hasExactKeys = (
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> => (
  isPlainRecord(value)
  && Reflect.ownKeys(value).every((key) => typeof key === 'string' && keys.includes(key))
  && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  && Reflect.ownKeys(value).length === keys.length
);

const isPositive = (value: unknown): value is number => (
  Number.isSafeInteger(value) && (value as number) > 0
);
const isNonnegative = (value: unknown): value is number => (
  Number.isSafeInteger(value) && (value as number) >= 0
);
const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const isTime = (value: unknown): value is string => isBookImpactDiscoveryTimestamp(value);
const isBefore = (value: string, evaluatedAt: string): boolean => (
  Date.parse(value) <= Date.parse(evaluatedAt)
);
const isStrictlyBefore = (value: string, evaluatedAt: string): boolean => (
  Date.parse(value) < Date.parse(evaluatedAt)
);
const isDenseArray = (value: unknown): value is readonly unknown[] => (
  Array.isArray(value)
  && Object.keys(value).length === value.length
  && Object.keys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor;
  })
);
const sourceIdentity = (
  source: { readonly sourceKey: string; readonly sourceVersionId: string },
): string => source.sourceKey + '\u0000' + source.sourceVersionId;

const isCompleteReadPage = (value: unknown): value is BookImpactDiscoveryReadPage => (
  hasExactKeys(value, ['complete', 'contexts'])
  && value.complete === true
  && isDenseArray(value.contexts)
);

const isSortedPages = (value: unknown): value is readonly number[] => (
  isDenseArray(value)
  && value.length > 0
  && value.length <= BOOK_IMPACT_DISCOVERY_MAX_PAGES_PER_SOURCE
  && value.every((page) => isPositive(page))
  && value.every((page, index) => index === 0 || (value[index - 1] as number) < (page as number))
);

const isBoundedReasons = (value: unknown): value is readonly string[] => (
  isDenseArray(value)
  && value.length <= BOOK_IMPACT_DISCOVERY_MAX_CLASSIFICATION_REASONS
  && value.every((reason) => (
    typeof reason === 'string' && reason.length <= BOOK_IMPACT_DISCOVERY_MAX_REASON_LENGTH
  ))
);

const isSource = (value: unknown): value is BookImpactSourceReference => {
  if (!isPlainRecord(value)
    || !Reflect.ownKeys(value).every((key) => (
      typeof key === 'string'
      && ['availability', 'pages', 'sourceKey', 'sourceOrder', 'sourceVersionId'].includes(key)
    ))
    || !['availability', 'pages', 'sourceKey', 'sourceVersionId'].every((key) => (
      Object.prototype.hasOwnProperty.call(value, key)
    ))) {
    return false;
  }
  return isId(value.sourceKey)
    && isId(value.sourceVersionId)
    && (value.availability === 'available' || value.availability === 'invalidated')
    && isSortedPages(value.pages)
    && (value.sourceOrder === undefined || isNonnegative(value.sourceOrder));
};

const isResolution = (value: unknown): boolean => {
  if (!hasExactKeys(value, RESOLUTION_KEYS)) return false;
  const record = value;
  return ['open-access', 'assignment', 'ancestor', 'student-extension'].includes(
    record.source as string,
  )
    && (record.nodeKey === null || isId(record.nodeKey))
    && (record.at === null || isTime(record.at));
};

/** Shared validation for both context and placement schedule authority. */
export const isBookImpactEffectiveWindow = (
  value: unknown,
): value is BookImpactEffectiveWindow => {
  if (!hasExactKeys(value, WINDOW_KEYS)) return false;
  const record = value;
  if ((record.availableFrom !== null && !isTime(record.availableFrom))
    || (record.dueAt !== null && !isTime(record.dueAt))
    || (record.extensionDueAt !== null && !isTime(record.extensionDueAt))
    || !['none', 'assignment', 'node', 'student-extension'].includes(record.winner as string)
    || !isResolution(record.release)
    || !isResolution(record.deadline)
    || !isPositive(record.policyRevision)
    || !isPositive(record.authorityRevision)
    || (record.extensionRevision !== null && !isPositive(record.extensionRevision))) {
    return false;
  }
  const release = record.release as Record<string, unknown>;
  const deadline = record.deadline as Record<string, unknown>;
  if (release.at !== record.availableFrom
    || (release.source === 'open-access'
      ? release.at !== null
      : release.at === null)) return false;
  if (deadline.at !== record.dueAt) return false;
  const expectedWinner = {
    'open-access': 'none',
    assignment: 'assignment',
    ancestor: 'node',
    'student-extension': 'student-extension',
  }[deadline.source as 'open-access' | 'assignment' | 'ancestor' | 'student-extension'];
  if (record.winner !== expectedWinner) return false;
  if (deadline.source === 'student-extension') {
    if (record.dueAt === null || record.extensionDueAt === null
      || record.extensionRevision === null
      || record.dueAt !== record.extensionDueAt
      || record.extensionDueAt !== deadline.at) return false;
  } else if (record.extensionDueAt !== null || record.extensionRevision !== null) {
    return false;
  }
  return true;
};

const isAttempt = (
  value: unknown,
  evaluatedAt: string,
): value is BookImpactAttemptSummary => {
  if (!hasExactKeys(value, [
    'activityId', 'activityVersionId', 'attemptId', 'attemptNumber', 'completedAt',
    'createdAt', 'lifecycle', 'placementId',
  ])) return false;
  const record = value;
  return isId(record.attemptId)
    && isPositive(record.attemptNumber)
    && isId(record.placementId)
    && isId(record.activityId)
    && isId(record.activityVersionId)
    && ['in-progress', 'submitted', 'completed'].includes(record.lifecycle as string)
    && isTime(record.createdAt)
    && isBefore(record.createdAt, evaluatedAt)
    && (record.completedAt === null
      || (isTime(record.completedAt) && isBefore(record.completedAt, evaluatedAt)))
    && (record.lifecycle === 'completed' ? record.completedAt !== null : record.completedAt === null);
};

const isPlacement = (
  value: unknown,
  policy: BookImpactDiscoveryPolicy,
): value is BookImpactPlacementInput => {
  if (!hasExactKeys(value, [
    'activityId', 'activityVersion', 'activityVersionId', 'effectiveWindow', 'nodeKey',
    'order', 'placementId', 'sourceRefs',
  ])) return false;
  const record = value;
  return isId(record.placementId)
    && isId(record.activityId)
    && isId(record.activityVersionId)
    && isPositive(record.activityVersion)
    && isId(record.nodeKey)
    && isNonnegative(record.order)
    && policy.validatePlacementWindow(record.effectiveWindow)
    && isDenseArray(record.sourceRefs)
    && record.sourceRefs.length <= BOOK_IMPACT_DISCOVERY_MAX_SOURCE_REFS_PER_PLACEMENT
    && record.sourceRefs.every(isSource)
    && new Set(record.sourceRefs.map((source) => sourceIdentity(source))).size
      === record.sourceRefs.length;
};

const isBoundedPlacements = (
  value: unknown,
  policy: BookImpactDiscoveryPolicy,
): value is readonly BookImpactPlacementInput[] => {
  if (!isDenseArray(value) || value.length === 0
    || value.length > BOOK_IMPACT_DISCOVERY_MAX_PLACEMENTS_PER_CONTEXT) return false;
  let sourceRefCount = 0;
  let pageNumberCount = 0;
  for (const candidate of value) {
    if (!isPlacement(candidate, policy)) return false;
    sourceRefCount += candidate.sourceRefs.length;
    pageNumberCount += candidate.sourceRefs.reduce((total, source) => total + source.pages.length, 0);
    if (sourceRefCount > BOOK_IMPACT_DISCOVERY_MAX_SOURCE_REFS_PER_CONTEXT
      || pageNumberCount > BOOK_IMPACT_DISCOVERY_MAX_PAGE_NUMBERS_PER_CONTEXT) return false;
  }
  return true;
};

const isBoundedSources = (value: unknown): value is readonly BookImpactSourceReference[] => {
  if (!isDenseArray(value) || value.length === 0
    || value.length > BOOK_IMPACT_DISCOVERY_MAX_SOURCES_PER_CONTEXT) return false;
  let pageNumberCount = 0;
  for (const candidate of value) {
    if (!isSource(candidate)) return false;
    pageNumberCount += candidate.pages.length;
    if (pageNumberCount > BOOK_IMPACT_DISCOVERY_MAX_PAGE_NUMBERS_PER_CONTEXT) return false;
  }
  return true;
};

const isClassification = (value: unknown): value is BookImpactClassification => {
  if (!hasExactKeys(value, [
    'activityDiff', 'effects', 'primaryEffect', 'reasons',
    'requiresExplicitContextResolution', 'requiresRedo', 'requiresRegrade', 'requiresSuccessor',
  ]) || !hasExactKeys(value.activityDiff, ['classification', 'reasons', 'requiresRedo'])) {
    return false;
  }
  const record = value;
  const activityDiff = record.activityDiff as Record<string, unknown>;
  if (typeof activityDiff.classification !== 'string'
    || !ACTIVITY_DIFF_CLASSIFICATIONS.has(activityDiff.classification)
    || !isBoundedReasons(activityDiff.reasons)
    || typeof activityDiff.requiresRedo !== 'boolean'
    || typeof record.primaryEffect !== 'string'
    || !EFFECTS.has(record.primaryEffect)
    || !isDenseArray(record.effects)
    || !isBoundedReasons(record.reasons)
    || typeof record.requiresRedo !== 'boolean'
    || typeof record.requiresRegrade !== 'boolean'
    || typeof record.requiresExplicitContextResolution !== 'boolean'
    || typeof record.requiresSuccessor !== 'boolean') return false;
  const effectList = record.effects as readonly string[];
  const effectSet = new Set(effectList);
  if (effectList.length === 0
    || effectList.length > BOOK_IMPACT_DISCOVERY_EFFECTS.length
    || effectSet.size !== effectList.length
    || !effectList.every((effect) => EFFECTS.has(effect))) return false;
  const expectedPrimary = BOOK_IMPACT_DISCOVERY_PRIMARY_EFFECT_PRECEDENCE.find(
    (effect) => effectSet.has(effect),
  );
  const activityEffect = activityDiff.classification === 'presentation-context'
    ? 'mapping-source-context'
    : activityDiff.classification;
  const activityRequiresRedo = activityDiff.classification === 'redo-required'
    || activityDiff.classification === 'reordered'
    || activityDiff.classification === 'unsupported';
  return record.primaryEffect === expectedPrimary
    && effectSet.has(activityEffect)
    && activityDiff.requiresRedo === activityRequiresRedo
    && record.requiresRedo === (activityRequiresRedo || effectSet.has('unsupported'))
    && record.requiresRegrade === effectSet.has('regrade')
    && record.requiresExplicitContextResolution === (
      effectSet.has('mapping-source-context') || effectSet.has('invalidation')
    )
    && record.requiresSuccessor === effectSet.has('successor');
};

const isReplacement = (
  value: unknown,
  placements: readonly BookImpactPlacementInput[],
  sources: ReadonlyMap<string, BookImpactSourceReference>,
): value is BookImpactReplacementInput => {
  if (!hasExactKeys(value, [
    'fromSourceVersionId', 'mode', 'ownerChoice', 'placementIds', 'sourceKey', 'toSourceVersionId',
  ])) return false;
  const record = value;
  const oldKey = String(record.sourceKey) + '\u0000' + String(record.fromSourceVersionId);
  const expected = new Set(
    placements
      .filter((placement) => placement.sourceRefs.some((source) => sourceIdentity(source) === oldKey))
      .map((placement) => placement.placementId),
  );
  if (!isId(record.sourceKey)
    || !isId(record.fromSourceVersionId)
    || (record.toSourceVersionId !== null && !isId(record.toSourceVersionId))
    || !['invalidation-only', 'owner-adopts-replacement'].includes(record.mode as string)
    || !['retain-owner', 'owner-adopts-replacement', 'invalidate-context'].includes(
      record.ownerChoice as string,
    )
    || !isDenseArray(record.placementIds)
    || record.placementIds.length === 0
    || record.placementIds.length > BOOK_IMPACT_DISCOVERY_MAX_PLACEMENTS_PER_CONTEXT
    || new Set(record.placementIds).size !== record.placementIds.length
    || expected.size === 0
    || record.placementIds.length !== expected.size
    || !record.placementIds.every((placementId) => isId(placementId) && expected.has(placementId))
    || !sources.has(oldKey)) return false;
  if (record.mode === 'owner-adopts-replacement'
    && (record.toSourceVersionId === null || record.toSourceVersionId === record.fromSourceVersionId)) {
    return false;
  }
  if (record.mode === 'invalidation-only'
    && (record.ownerChoice === 'owner-adopts-replacement' || record.toSourceVersionId !== null)) {
    return false;
  }
  return true;
};

const hasIds = (value: Record<string, unknown>, keys: readonly string[]): boolean => (
  keys.every((key) => isId(value[key]))
);

const hasPositiveRevisions = (value: Record<string, unknown>, keys: readonly string[]): boolean => (
  keys.every((key) => isPositive(value[key]))
);

const isProducerIdentity = (
  value: unknown,
  context: Record<string, unknown>,
): value is BookImpactProducerIdentity => {
  if (!isPlainRecord(value)) return false;
  if (value.kind === 'course') {
    if (!hasExactKeys(value, [
      'bindingId', 'bindingRevision', 'bookId', 'bookRevision', 'courseId', 'courseMaterialId',
      'kind', 'manifestVersionId', 'moduleId', 'placementRevision', 'publicationId',
      'publicationRevision', 'sourceVersionId', 'unitStableKey', 'unitVersionId',
    ]) || !hasIds(value, [
      'bindingId', 'bookId', 'courseId', 'courseMaterialId', 'manifestVersionId', 'moduleId',
      'publicationId', 'sourceVersionId', 'unitStableKey', 'unitVersionId',
    ]) || !hasPositiveRevisions(value, [
      'bindingRevision', 'bookRevision', 'placementRevision', 'publicationRevision',
    ])) return false;
    return value.bindingId === context.bindingId
      && value.bindingRevision === context.bindingRevision
      && value.bookId === context.bookId
      && value.bookRevision === context.bookRevision
      && value.publicationId === context.publicationId
      && value.publicationRevision === context.publicationRevision;
  }
  if (value.kind === 'class') {
    if (!hasExactKeys(value, [
      'bindingId', 'bookId', 'bookRevision', 'classCourseMaterialId', 'classId',
      'classPlacementId', 'copyId', 'deliveryBindingRevision', 'kind', 'manifestVersionId',
      'publicationId', 'publicationRevision', 'sourceCourseMaterialId', 'sourcePlacementRevision',
      'sourceVersionId', 'unitStableKey', 'unitVersionId',
    ]) || !hasIds(value, [
      'bindingId', 'bookId', 'classCourseMaterialId', 'classId', 'classPlacementId', 'copyId',
      'manifestVersionId', 'publicationId', 'sourceCourseMaterialId', 'sourceVersionId',
      'unitStableKey', 'unitVersionId',
    ]) || !hasPositiveRevisions(value, [
      'bookRevision', 'deliveryBindingRevision', 'publicationRevision', 'sourcePlacementRevision',
    ])) return false;
    return value.bindingId === context.bindingId
      && value.deliveryBindingRevision === context.bindingRevision
      && value.bookId === context.bookId
      && value.bookRevision === context.bookRevision
      && value.publicationId === context.publicationId
      && value.publicationRevision === context.publicationRevision;
  }
  if (value.kind === 'public-reference') {
    if (!hasExactKeys(value, [
      'bindingId', 'bindingRevision', 'downstreamOwnerId', 'kind', 'provenanceId',
      'provenanceRevision', 'referenceId', 'referenceKind', 'referenceRevision', 'sourceBookId',
      'sourceBookRevision', 'sourcePublicationId', 'sourcePublicationRevision', 'targetBookId',
      'targetBookRevision', 'targetPlacementId', 'targetPlacementRevision', 'targetPublicationId',
      'targetPublicationRevision', 'sourceOwnerId',
    ]) || !hasIds(value, [
      'bindingId', 'downstreamOwnerId', 'provenanceId', 'referenceId', 'sourceBookId',
      'sourcePublicationId', 'targetBookId', 'targetPlacementId', 'targetPublicationId',
      'sourceOwnerId',
    ]) || !hasPositiveRevisions(value, [
      'bindingRevision', 'provenanceRevision', 'referenceRevision', 'sourceBookRevision',
      'sourcePublicationRevision', 'targetBookRevision', 'targetPlacementRevision',
      'targetPublicationRevision',
    ]) || !['reference', 'fork'].includes(value.referenceKind as string)) return false;
    return value.bindingId === context.bindingId
      && value.bindingRevision === context.bindingRevision
      && value.downstreamOwnerId === context.ownerId
      && value.targetBookId === context.bookId
      && value.targetBookRevision === context.bookRevision
      && value.targetPublicationId === context.publicationId
      && value.targetPublicationRevision === context.publicationRevision;
  }
  return false;
};

const validateContext = (
  value: unknown,
  actorId: string,
  evaluatedAt: string,
  policy: BookImpactDiscoveryPolicy,
): value is BookImpactContextInput => {
  if (!isPlainRecord(value)) return false;
  const record = value;
  const requiresIdentity = ['course', 'class', 'public-reference'].includes(record.kind as string);
  if (!hasExactKeys(record, requiresIdentity ? CONTEXT_KEYS_WITH_IDENTITY : CONTEXT_KEYS)
    || (requiresIdentity && (!isPlainRecord(record.identity)
      || record.identity.kind !== record.kind
      || !isProducerIdentity(record.identity, record)))) return false;
  if (record.kind !== policy.contextKind
    || !isId(record.contextId)
    || !isId(record.ownerId)
    || !isId(record.recipientId)
    || !policy.contextOwnedByActor(record, actorId)
    || !isId(record.bindingId)
    || !isPositive(record.bindingRevision)
    || !['active', 'closed', 'archived'].includes(record.status as string)
    || !['not-started', 'in-progress', 'submitted', 'completed'].includes(record.lifecycle as string)
    || !isId(record.bookId)
    || !isPositive(record.bookRevision)
    || !isId(record.publicationId)
    || !isPositive(record.publicationRevision)
    || !policy.validateContextWindow(record.effectiveWindow)
    || !isBoundedPlacements(record.placements, policy)
    || !isDenseArray(record.attempts)
    || record.attempts.length > BOOK_IMPACT_DISCOVERY_MAX_ATTEMPTS_PER_CONTEXT
    || !record.attempts.every((attempt) => isAttempt(attempt, evaluatedAt))
    || !isBoundedSources(record.sources)
    || !isClassification(record.classification)
    || !isDenseArray(record.replacement)
    || record.replacement.length > BOOK_IMPACT_DISCOVERY_MAX_REPLACEMENTS_PER_CONTEXT
    || !isTime(record.observedAt)
    || !isStrictlyBefore(record.observedAt, evaluatedAt)
    || containsBookImpactSensitiveKey(value)) return false;

  const placements = record.placements as readonly BookImpactPlacementInput[];
  const attempts = record.attempts as readonly BookImpactAttemptSummary[];
  const sources = record.sources as readonly BookImpactSourceReference[];
  const replacements = record.replacement as readonly BookImpactReplacementInput[];
  const placementIds = new Set(placements.map((placement) => placement.placementId));
  const sourceMap = new Map<string, BookImpactSourceReference>();
  const sourceVersions = new Map<string, string>();
  if (placementIds.size !== placements.length
    || new Set(placements.map((placement) => placement.order)).size !== placements.length
    || new Set(attempts.map((attempt) => attempt.attemptId)).size !== attempts.length
    || new Set(attempts.map((attempt) => (
      attempt.placementId + '\u0000' + attempt.activityId + '\u0000' + attempt.attemptNumber
    ))).size !== attempts.length) return false;
  const identity = record.identity as BookImpactProducerIdentity | undefined;
  if ((identity?.kind === 'course' || identity?.kind === 'class')
    && (!sources.some((source) => source.sourceVersionId === identity.sourceVersionId)
      || !placements.some((placement) => placement.sourceRefs.some(
        (source) => source.sourceVersionId === identity.sourceVersionId,
      )))) return false;
  if (identity?.kind === 'public-reference'
    && !placements.some((placement) => placement.placementId === identity.targetPlacementId)) {
    return false;
  }
  for (const source of sources) {
    const key = sourceIdentity(source);
    if (sourceMap.has(key)
      || (sourceVersions.has(source.sourceKey)
        && sourceVersions.get(source.sourceKey) !== source.sourceVersionId)) return false;
    sourceVersions.set(source.sourceKey, source.sourceVersionId);
    sourceMap.set(key, source);
  }
  const placementSourceKeys = new Set<string>();
  for (const placement of placements) {
    for (const source of placement.sourceRefs) {
      const known = sourceMap.get(sourceIdentity(source));
      if (!known || known.availability !== source.availability
        || known.pages.join(',') !== source.pages.join(',')
        || (known.sourceOrder ?? null) !== (source.sourceOrder ?? null)) return false;
      placementSourceKeys.add(sourceIdentity(source));
    }
  }
  if (placementSourceKeys.size !== sourceMap.size
    || attempts.some((attempt) => !placements.some((placement) => (
      placement.placementId === attempt.placementId
      && placement.activityId === attempt.activityId
      && placement.activityVersionId === attempt.activityVersionId
    )))) return false;
  const invalidated = sources.some((source) => source.availability === 'invalidated');
  if (!isClassification(record.classification)
    || invalidated !== record.classification.effects.includes('invalidation')) return false;
  if (record.lifecycle === 'not-started' && attempts.length !== 0) return false;
  if (record.lifecycle !== 'not-started' && attempts.length === 0) return false;
  if (record.lifecycle === 'completed'
    && !attempts.some((attempt) => attempt.lifecycle === 'completed')) return false;
  if (record.lifecycle === 'submitted'
    && !attempts.some((attempt) => (
      attempt.lifecycle === 'submitted' || attempt.lifecycle === 'completed'
    ))) return false;
  const replacementKeys = new Set<string>();
  for (const replacement of replacements) {
    if (!isReplacement(replacement, placements, sourceMap)) return false;
    const candidate = replacement as BookImpactReplacementInput;
    const identity = [
      candidate.sourceKey,
      candidate.fromSourceVersionId,
      candidate.toSourceVersionId ?? '',
      candidate.mode,
    ].join('\u0000');
    if (replacementKeys.has(identity)) return false;
    replacementKeys.add(identity);
  }
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
      .filter((placement) => placement.sourceRefs.some(
        (ref) => sourceIdentity(ref) === sourceIdentity(source),
      ))
      .map((placement) => placement.placementId)
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
  effectiveWindow: context.effectiveWindow === null ? null : {
    ...context.effectiveWindow,
    release: { ...context.effectiveWindow.release },
    deadline: { ...context.effectiveWindow.deadline },
  },
  placements: context.placements.map((placement) => ({
    ...placement,
    effectiveWindow: placement.effectiveWindow === null ? null : {
      ...placement.effectiveWindow,
      release: { ...placement.effectiveWindow.release },
      deadline: { ...placement.effectiveWindow.deadline },
    },
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
  ...(context.identity === undefined ? {} : { identity: structuredClone(context.identity) }),
}) as BookImpactSummary;

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

const blocked = (
  query: BookImpactDiscoveryQuery | null | undefined,
  policy: BookImpactDiscoveryPolicy,
  code: BookImpactDiscoveryBlocked['code'],
): BookImpactDiscoveryBlocked => ({
  status: 'blocked',
  contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
  inputVersion: BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
  outputVersion: BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
  adapterId: policy.adapterId,
  adapterVersion: policy.adapterVersion,
  contextKind: policy.contextKind,
  evaluatedAt: typeof query?.evaluatedAt === 'string' ? query.evaluatedAt : '',
  code,
});

const discover = async (
  reader: BookImpactDiscoveryEngineReader,
  policy: BookImpactDiscoveryPolicy,
  query: BookImpactDiscoveryQuery,
): Promise<BookImpactDiscoveryResult> => {
  if (!query || !isBookImpactDiscoverySafeId(query.actorId)) {
    return blocked(query, policy, 'invalid-actor');
  }
  if (!isTime(query.evaluatedAt)) return blocked(query, policy, 'malformed');
  const limit = query.limit ?? BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS) {
    return blocked(query, policy, 'unbounded');
  }
  let authorization: BookImpactDiscoveryAuthorizationResult;
  try {
    authorization = await reader.authorize({ actorId: query.actorId });
  } catch {
    return blocked(query, policy, 'uncertain');
  }
  if (!authorization.authorized) return blocked(query, policy, authorization.code);
  if (authorization.actorId !== query.actorId
    || authorization.contextKind !== policy.contextKind
    || authorization.ownerScope !== policy.ownerScope
    || !isPositive(authorization.maxContexts)
    || authorization.maxContexts > BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS) {
    return blocked(query, policy, 'unauthorized');
  }
  const readLimit = Math.min(limit, authorization.maxContexts);
  let records: readonly unknown[];
  try {
    const page = await reader.readOwnedContexts({ actorId: query.actorId, limit: readLimit });
    if (!isCompleteReadPage(page) || page.contexts.length > readLimit) {
      return blocked(query, policy, 'unbounded');
    }
    records = page.contexts;
  } catch {
    return blocked(query, policy, 'missing');
  }
  const contexts: BookImpactContextInput[] = [];
  const contextIds = new Set<string>();
  const bindingIds = new Set<string>();
  for (const record of records) {
    if (isPlainRecord(record)) {
      if (typeof record.ownerId === 'string' && record.ownerId !== query.actorId) {
        return blocked(query, policy, 'cross-owner');
      }
      if (policy.contextKind === 'solo'
        && typeof record.recipientId === 'string'
        && record.recipientId !== query.actorId) {
        return blocked(query, policy, 'cross-owner');
      }
      if (isTime(record.observedAt) && !isStrictlyBefore(record.observedAt, query.evaluatedAt)) {
        return blocked(query, policy, 'stale');
      }
    }
    let valid = false;
    try {
      valid = validateContext(record, query.actorId, query.evaluatedAt, policy);
    } catch {
      return blocked(query, policy, 'malformed');
    }
    if (!valid) return blocked(query, policy, 'malformed');
    const context = record as BookImpactContextInput;
    if (contextIds.has(context.contextId) || bindingIds.has(context.bindingId)) {
      return blocked(query, policy, 'ambiguous');
    }
    contextIds.add(context.contextId);
    bindingIds.add(context.bindingId);
    if (context.status === 'active') contexts.push(context);
  }
  const resultBase = {
    status: 'ok' as const,
    contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    inputVersion: BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
    outputVersion: BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
    adapterId: policy.adapterId,
    adapterVersion: policy.adapterVersion,
    contextKind: policy.contextKind,
    evaluatedAt: query.evaluatedAt,
    replacementScopes: replacementScopes(contexts),
  };
  const impacts = contexts.map(toSummary).sort((left, right) => (
    left.contextId.localeCompare(right.contextId)
  ));
  const resultForContextKind = <TContextKind extends BookImpactDiscoveryContextKind>(
    contextKind: TContextKind,
    scopedImpacts: readonly Extract<BookImpactSummary, { readonly contextKind: TContextKind }>[],
  ): BookImpactDiscoverySuccess => ({
    ...resultBase,
    contextKind,
    impacts: scopedImpacts,
  } as BookImpactDiscoverySuccess);
  switch (policy.contextKind) {
    case 'solo':
      return freezeBookImpactValue(resultForContextKind('solo', impacts as readonly Extract<
        BookImpactSummary, { readonly contextKind: 'solo' }
      >[]));
    case 'homework':
      return freezeBookImpactValue(resultForContextKind('homework', impacts as readonly Extract<
        BookImpactSummary, { readonly contextKind: 'homework' }
      >[]));
    case 'course':
      return freezeBookImpactValue(resultForContextKind('course', impacts as readonly Extract<
        BookImpactSummary, { readonly contextKind: 'course' }
      >[]));
    case 'class':
      return freezeBookImpactValue(resultForContextKind('class', impacts as readonly Extract<
        BookImpactSummary, { readonly contextKind: 'class' }
      >[]));
    case 'public-reference':
      return freezeBookImpactValue(resultForContextKind('public-reference', impacts as readonly Extract<
        BookImpactSummary, { readonly contextKind: 'public-reference' }
      >[]));
  }
};

export const createBookImpactDiscoveryAdapter = (input: {
  readonly reader: BookImpactDiscoveryEngineReader;
  readonly policy: BookImpactDiscoveryPolicy;
}): {
  readonly discover: (query: BookImpactDiscoveryQuery) => Promise<BookImpactDiscoveryResult>;
} => Object.freeze({
  discover: (query: BookImpactDiscoveryQuery) => discover(input.reader, input.policy, query),
});
