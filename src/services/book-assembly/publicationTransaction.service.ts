import type {
  BookAssemblyActivitySafeProjectionRecord,
  BookAssemblyActivityVersionReference,
  BookAssemblyActivityVersionRecord,
  BookAssemblyDeliveryPublicationPlan,
  BookAssemblyImmutableManifestVersion,
  BookAssemblyPlacementRecord,
  BookAssemblyPublicationAdapterPlan,
  BookAssemblyPublicationAuditRecord,
  BookAssemblyPublicationFailureCode,
  BookAssemblyPublicationPointer,
  BookAssemblyPublishedUnitProjectionRecord,
  SourceSetCandidate,
} from '../../types/bookAssembly.types';
import {
  assertBookAssemblyAuditIsBounded,
  createBookAssemblyPublicationAuditRecord,
} from './publicationAudit.service';
import { createBookAssemblyPublicationPointer, pointerMatchesExpected } from './publicationPointer.service';
import type {
  BookAssemblyPublicationOperationRecord,
  BookAssemblyPublicationRepository,
  BookAssemblyPublicationScope,
} from './publicationRepository';

export type BookAssemblyPublicationStatus =
  | 'published'
  | 'rolled-back'
  | 'replayed'
  | 'conflict'
  | 'invalid'
  | 'idempotency-conflict'
  | 'not-found'
  | 'forbidden';

export interface BookAssemblyPublicationResult {
  readonly status: BookAssemblyPublicationStatus;
  readonly pointer?: BookAssemblyPublicationPointer;
  readonly version?: BookAssemblyImmutableManifestVersion;
  readonly audit?: BookAssemblyPublicationAuditRecord;
  readonly failureCode?: BookAssemblyPublicationFailureCode;
}

export interface PublishBookAssemblyInput {
  readonly operationId: string;
  readonly expectedCurrentPublicationId: string | null;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly plan: BookAssemblyPublicationAdapterPlan;
  readonly now: string;
  /** Optional trusted command fingerprint for durable idempotent replay. */
  readonly operationFingerprint?: string;
}

export interface RollbackBookAssemblyPublicationInput {
  readonly operationId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly expectedCurrentPublicationId: string;
  readonly targetPublicationId: string;
  readonly now: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SENSITIVE_KEYS = [
  'answer',
  'answerKey',
  'answers',
  'credential',
  'credentials',
  'firebaseToken',
  'fullDiff',
  'pdfBytes',
  'privateKey',
  'providerAuthority',
  'secret',
  'sourceBytes',
] as const;

const clone = <T>(value: T): T => structuredClone(value);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const fingerprintOf = (value: unknown): string => {
  const encoded = stable(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const char of encoded) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
};

/** Stable trusted-command fingerprint shared by route coordinators. */
export const fingerprintBookAssemblyOperation = (value: unknown): string => fingerprintOf(value);
const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const validOperationId = (value: unknown): value is string =>
  typeof value === 'string' && OPERATION_ID.test(value);
const hasSensitiveKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    SENSITIVE_KEYS.some((candidate) => candidate.toLowerCase() === key.toLowerCase())
    || hasSensitiveKey(child));
};
const sourceSetsEqual = (a: SourceSetCandidate, b: SourceSetCandidate): boolean => stable(a) === stable(b);
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;
const allIds = (values: readonly string[]): boolean => values.every(validId) && unique(values);
export const bookAssemblyActivityVersionScopeKey = (
  manifestVersionId: string,
  activityVersionId: string,
): string => `m${manifestVersionId.length}:${manifestVersionId}a${activityVersionId.length}:${activityVersionId}`;

export const fingerprintBookAssemblyPublishOperation = (
  input: Pick<
    PublishBookAssemblyInput,
    'expectedCurrentPublicationId'
      | 'manifestVersionId'
      | 'publicationId'
      | 'publicationRevision'
      | 'plan'
  >,
): string => fingerprintOf({
  action: 'publish',
  expectedCurrentPublicationId: input.expectedCurrentPublicationId,
  manifestVersionId: input.manifestVersionId,
  publicationId: input.publicationId,
  publicationRevision: input.publicationRevision,
  plan: input.plan,
});

export const fingerprintBookAssemblyRollbackOperation = (
  input: Omit<RollbackBookAssemblyPublicationInput, 'now'>,
): string => fingerprintOf({
  action: 'rollback',
  operationId: input.operationId,
  ownerId: input.ownerId,
  bookId: input.bookId,
  expectedCurrentPublicationId: input.expectedCurrentPublicationId,
  targetPublicationId: input.targetPublicationId,
});

const invalid = (
  failureCode: BookAssemblyPublicationFailureCode,
): BookAssemblyPublicationResult => ({ status: 'invalid', failureCode });

const assertCommonPublicationWriteSet = (
  input: PublishBookAssemblyInput,
): BookAssemblyPublicationResult | null => {
  const { atomicWrites } = input.plan;
  const activityVersionRefs: readonly BookAssemblyActivityVersionReference[] = atomicWrites.activityVersionRefs ?? [];
  if (!atomicWrites
    || (atomicWrites.activityVersions.length === 0 && activityVersionRefs.length === 0)
    || atomicWrites.activitySafeProjections.length === 0
    || atomicWrites.placements.length === 0
    || atomicWrites.unitProjections.length === 0
    || atomicWrites.deliveryPlans.length === 0) {
    return invalid('invalid-publication-plan');
  }

  const activityVersionIds = atomicWrites.activityVersions.map((record) => record.activityVersionId);
  const activityVersionReferenceIds = activityVersionRefs.map((record) => record.activityVersionId);
  const projectionIds = atomicWrites.activitySafeProjections.map((record) => record.projectionId);
  const placementIds = atomicWrites.placements.map((record) => record.placementId);
  const unitProjectionIds = atomicWrites.unitProjections.map((record) => record.unitProjectionId);
  const deliveryPlanIds = atomicWrites.deliveryPlans.map((record) => record.deliveryPlanId);
  if (!allIds(activityVersionIds)
    || !allIds(projectionIds)
    || !allIds(placementIds)
    || !allIds(unitProjectionIds)
    || !allIds(deliveryPlanIds)
    || new Set([...activityVersionIds, ...activityVersionReferenceIds]).size
      !== activityVersionIds.length + activityVersionReferenceIds.length) {
    return invalid('invalid-publication-plan');
  }

  if (activityVersionRefs.some((record) => !validId(record.activityVersionId)
    || !validId(record.activityId)
    || !Number.isSafeInteger(record.activityVersion)
    || record.activityVersion <= 0
    || !validId(record.canonicalPayloadFingerprint)
    || !unique(activityVersionReferenceIds))) {
    return invalid('invalid-publication-plan');
  }
  const activityVersionSet = new Set([...activityVersionIds, ...activityVersionReferenceIds]);
  const placementSet = new Set(placementIds);
  const unitProjectionSet = new Set(unitProjectionIds);
  const common = {
    ownerId: input.plan.ownerId,
    bookId: input.plan.bookId,
    manifestVersionId: input.manifestVersionId,
    publicationId: input.publicationId,
    publicationRevision: input.publicationRevision,
  } as const;
  const matchesCommon = (
    record: Pick<BookAssemblyActivityVersionRecord, keyof typeof common>,
  ): boolean => Object.entries(common).every(([key, value]) =>
    record[key as keyof typeof common] === value);
  const hasPages = (record: { readonly sourcePages: readonly unknown[] }): boolean =>
    Array.isArray(record.sourcePages) && record.sourcePages.length > 0;

  if (atomicWrites.activityVersions.some((record) =>
    record.schemaVersion !== 1
    || !matchesCommon(record)
    || record.createdByCommandId !== input.operationId
    || !validId(record.activityId)
    || !validId(record.activityKey)
    || !validId(record.unitKey)
    || !Number.isSafeInteger(record.activityVersion)
    || record.activityVersion <= 0
    || !validId(record.payloadFingerprint)
    || !hasPages(record))) {
    return invalid('invalid-publication-plan');
  }

  if (atomicWrites.activitySafeProjections.some((record) =>
    record.schemaVersion !== 1
    || !matchesCommon(record)
    || !validId(record.activityId)
    || !activityVersionSet.has(record.activityVersionId)
    || !validId(record.payloadFingerprint)
    || !record.placementIds.every((placementId) => placementSet.has(placementId))
    || !hasPages(record))) {
    return invalid('invalid-publication-plan');
  }

  if (atomicWrites.placements.some((record) =>
    record.schemaVersion !== 1
    || !matchesCommon(record)
    || !validId(record.unitKey)
    || !validId(record.nodeKey)
    || !validId(record.activityKey)
    || !validId(record.activityId)
    || !activityVersionSet.has(record.activityVersionId)
    || !Number.isSafeInteger(record.order)
    || record.order <= 0
    || !allIds(record.pageGroupKeys)
    || !hasPages(record))) {
    return invalid('invalid-publication-plan');
  }

  if (atomicWrites.unitProjections.some((record) =>
    record.schemaVersion !== 1
    || !matchesCommon(record)
    || record.createdByCommandId !== input.operationId
    || !validId(record.unitKey)
    || !record.placementIds.every((placementId) => placementSet.has(placementId))
    || !hasPages(record))) {
    return invalid('invalid-publication-plan');
  }

  if (atomicWrites.deliveryPlans.some((record) =>
    record.schemaVersion !== 1
    || !matchesCommon(record)
    || record.createdByCommandId !== input.operationId
    || record.sourceStrategy !== input.plan.strategy
    || !sourceSetsEqual(record.sourceSet, input.plan.sourceSet)
    || !record.placementIds.every((placementId) => placementSet.has(placementId))
    || !record.unitProjectionIds.every((unitProjectionId) => unitProjectionSet.has(unitProjectionId)))) {
    return invalid('invalid-publication-plan');
  }

  return null;
};

const remember = (
  scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>,
  operationId: string,
  record: BookAssemblyPublicationOperationRecord<BookAssemblyPublicationResult>,
): void => {
  (scope as { operations?: Record<string, BookAssemblyPublicationOperationRecord<BookAssemblyPublicationResult>> }).operations = {
    ...(scope.operations ?? {}),
    [operationId]: record,
  };
};

const publicationIdentityMatches = (
  record: {
    readonly manifestVersionId?: string;
    readonly publicationId?: string;
    readonly publicationRevision?: number;
  } | undefined,
  version: BookAssemblyImmutableManifestVersion,
): boolean => Boolean(record
  && record.manifestVersionId === version.manifestVersionId
  && record.publicationId === version.publicationId
  && record.publicationRevision === version.publicationRevision);

const hasCommittedOriginatingPublicationOperation = (
  scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>,
  version: BookAssemblyImmutableManifestVersion,
  ownerId: string,
): boolean => {
  const operation = scope.operations?.[version.createdByCommandId];
  const result = operation?.result;
  return Boolean(operation
    && operation.ownerId === ownerId
    && result
    && (result.status === 'published' || result.status === 'replayed')
    && result.audit?.action === 'publish'
    && result.audit.status === 'committed'
    && result.audit.operationId === version.createdByCommandId
    && publicationIdentityMatches(result.pointer, version)
    && publicationIdentityMatches(result.version, version)
    && publicationIdentityMatches(result.audit, version));
};

const replay = (
  scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>,
  ownerId: string,
  operationId: string,
  fingerprint: string,
): BookAssemblyPublicationResult | null => {
  const stored = scope.operations?.[operationId];
  if (!stored) return null;
  if (stored.ownerId !== ownerId || stored.fingerprint !== fingerprint) {
    return { status: 'idempotency-conflict', failureCode: 'idempotency-conflict' };
  }
  return { ...clone(stored.result), status: 'replayed' };
};

export const validateBookAssemblyPublicationInput = (
  input: PublishBookAssemblyInput,
): BookAssemblyPublicationResult | null => {
  const { plan } = input;
  if (!validOperationId(input.operationId)
    || !validId(input.manifestVersionId)
    || !validId(input.publicationId)
    || !validId(plan.planId)
    || !validId(plan.ownerId)
    || !validId(plan.bookId)
    || !validId(plan.candidateId)
    || !Number.isSafeInteger(input.publicationRevision)
    || input.publicationRevision <= 0
    || !Number.isSafeInteger(plan.candidateRevision)
    || plan.candidateRevision <= 0
    || !Number.isSafeInteger(plan.bookRevision)
    || plan.bookRevision < 0
    || !Number.isSafeInteger(plan.sourceSetRevision)
    || plan.sourceSetRevision < 0) {
    return invalid('invalid-publication-plan');
  }
  if (plan.bookId !== plan.manifest.bookId
    || plan.studentSafeProjection.bookId !== plan.bookId
    || plan.studentSafeProjection.publicationId !== input.publicationId
    || plan.studentSafeProjection.publicationRevision !== input.publicationRevision
    || plan.studentSafeProjection.sourceStrategy !== plan.strategy
    || plan.studentSafeProjection.sourceStrategy !== plan.sourceSet.sourceStrategy
    || !sourceSetsEqual(plan.sourceSet, plan.manifest.sourceSet)
    || !sourceSetsEqual(plan.sourceSet, plan.studentSafeProjection.sourceSet)) {
    return invalid('invalid-publication-plan');
  }
  if (hasSensitiveKey(plan) || hasSensitiveKey(plan.studentSafeProjection)) {
    return invalid('sensitive-payload');
  }
  return assertCommonPublicationWriteSet(input);
};

export const createBookAssemblyPublicationService = (
  repository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult>,
) => ({
  publish: async (input: PublishBookAssemblyInput): Promise<BookAssemblyPublicationResult> => {
    const rejected = validateBookAssemblyPublicationInput(input);
    if (rejected) return rejected;
    const fingerprint = input.operationFingerprint ?? fingerprintBookAssemblyPublishOperation(input);
    return repository.transaction(input.plan.bookId, (scope) => {
      const replayed = replay(scope, input.plan.ownerId, input.operationId, fingerprint);
      if (replayed) return { outcome: replayed, write: false };
      if (!pointerMatchesExpected(scope.current, input.expectedCurrentPublicationId)) {
        const output: BookAssemblyPublicationResult = { status: 'conflict', failureCode: 'stale-current-pointer' };
        remember(scope, input.operationId, {
          ownerId: input.plan.ownerId, fingerprint, result: output, createdAt: input.now,
        });
        return { outcome: output, next: scope, write: true };
      }
      if (scope.versions?.[input.manifestVersionId]) {
        const output: BookAssemblyPublicationResult = { status: 'conflict', failureCode: 'duplicate-version' };
        remember(scope, input.operationId, {
          ownerId: input.plan.ownerId, fingerprint, result: output, createdAt: input.now,
        });
        return { outcome: output, next: scope, write: true };
      }
      const invalidActivityReference = (input.plan.atomicWrites.activityVersionRefs ?? []).some((reference) => {
        const existing = Object.values(scope.activityVersions ?? {}).find((candidate) =>
          candidate.activityId === reference.activityId
          && candidate.activityVersionId === reference.activityVersionId
          && candidate.activityVersion === reference.activityVersion
          && candidate.canonicalPayloadFingerprint === reference.canonicalPayloadFingerprint);
        return !existing
          || existing.ownerId !== input.plan.ownerId
          || existing.bookId !== input.plan.bookId;
      });
      if (invalidActivityReference) {
        const output: BookAssemblyPublicationResult = { status: 'invalid', failureCode: 'invalid-publication-plan' };
        remember(scope, input.operationId, {
          ownerId: input.plan.ownerId, fingerprint, result: output, createdAt: input.now,
        });
        return { outcome: output, next: scope, write: true };
      }
      const activityVersionKeys = [
        ...input.plan.atomicWrites.activityVersions.map((record) =>
          bookAssemblyActivityVersionScopeKey(input.manifestVersionId, record.activityVersionId)),
        ...(input.plan.atomicWrites.activityVersionRefs ?? []).map((record) =>
          bookAssemblyActivityVersionScopeKey(input.manifestVersionId, record.activityVersionId)),
      ];
      if (activityVersionKeys.some((key) => scope.activityVersions?.[key])
        || input.plan.atomicWrites.activitySafeProjections.some((record) =>
          scope.activitySafeProjections?.[record.projectionId])
        || input.plan.atomicWrites.placements.some((record) => scope.placements?.[record.placementId])
        || input.plan.atomicWrites.unitProjections.some((record) =>
          scope.unitProjections?.[record.unitProjectionId])
        || input.plan.atomicWrites.deliveryPlans.some((record) => scope.deliveryPlans?.[record.deliveryPlanId])) {
        const output: BookAssemblyPublicationResult = { status: 'conflict', failureCode: 'duplicate-version' };
        remember(scope, input.operationId, {
          ownerId: input.plan.ownerId, fingerprint, result: output, createdAt: input.now,
        });
        return { outcome: output, next: scope, write: true };
      }
      const version: BookAssemblyImmutableManifestVersion = {
        schemaVersion: 1,
        manifestVersionId: input.manifestVersionId,
        publicationId: input.publicationId,
        publicationRevision: input.publicationRevision,
        lifecycle: 'published',
        ownerId: input.plan.ownerId,
        bookId: input.plan.bookId,
        bookRevision: input.plan.bookRevision,
        sourceSetRevision: input.plan.sourceSetRevision,
        candidateId: input.plan.candidateId,
        candidateRevision: input.plan.candidateRevision,
        strategy: input.plan.strategy,
        adapterTicket: input.plan.adapterTicket,
        inputFingerprint: fingerprint,
        createdByCommandId: input.operationId,
        createdAt: input.now,
        manifest: clone(input.plan.manifest),
        studentSafeProjection: clone(input.plan.studentSafeProjection),
        ...(input.plan.successorLineage
          ? { successorLineage: clone(input.plan.successorLineage) }
          : {}),
        ...(input.plan.mappingRevisionLineage
          ? { mappingRevisionLineage: clone(input.plan.mappingRevisionLineage) }
          : {}),
      };
      const pointer = createBookAssemblyPublicationPointer({
        version,
        operationId: input.operationId,
        operationFingerprint: fingerprint,
        now: input.now,
      });
      const audit = createBookAssemblyPublicationAuditRecord({
        action: 'publish',
        operationId: input.operationId,
        ownerId: input.plan.ownerId,
        bookId: input.plan.bookId,
        pointer,
        status: 'committed',
        now: input.now,
      });
      assertBookAssemblyAuditIsBounded(audit);
      const output: BookAssemblyPublicationResult = { status: 'published', pointer, version, audit };
      (scope as { versions?: Record<string, BookAssemblyImmutableManifestVersion> }).versions = {
        ...(scope.versions ?? {}),
        [version.manifestVersionId]: version,
      };
      const safeProjectionFor = (activityId: string, activityVersionId: string) =>
        input.plan.atomicWrites.activitySafeProjections.find((candidate) =>
          candidate.activityId === activityId
          && candidate.activityVersionId === activityVersionId);
      const reusableRecords = (input.plan.atomicWrites.activityVersionRefs ?? []).map((reference) => {
        const previous = Object.values(scope.activityVersions ?? {}).find((candidate) =>
          candidate.activityId === reference.activityId
          && candidate.activityVersionId === reference.activityVersionId
          && candidate.activityVersion === reference.activityVersion
          && candidate.canonicalPayloadFingerprint === reference.canonicalPayloadFingerprint)!;
        const projection = safeProjectionFor(reference.activityId, reference.activityVersionId)!;
        const placements = input.plan.atomicWrites.placements.filter((candidate) =>
          candidate.activityId === reference.activityId
          && candidate.activityVersionId === reference.activityVersionId);
        const firstPlacement = placements[0]!;
        return {
          ...clone(previous),
          manifestVersionId: input.manifestVersionId,
          publicationId: input.publicationId,
          publicationRevision: input.publicationRevision,
          unitKey: firstPlacement.unitKey,
          activityKey: firstPlacement.activityKey,
          createdByCommandId: input.operationId,
          createdAt: input.now,
          sourcePages: clone(projection.sourcePages),
          safeProjectionId: projection.projectionId,
          payloadFingerprint: fingerprintOf({
            activityId: reference.activityId,
            activityVersionId: reference.activityVersionId,
            manifestVersionId: input.manifestVersionId,
            placementIds: projection.placementIds,
            sourcePages: projection.sourcePages,
          }),
        } satisfies BookAssemblyActivityVersionRecord;
      });
      const freshRecords = input.plan.atomicWrites.activityVersions.map((record) => {
        const projection = safeProjectionFor(record.activityId, record.activityVersionId)!;
        return {
          ...clone(record),
          safeProjectionId: projection.projectionId,
          canonicalOriginManifestVersionId: record.manifestVersionId,
          canonicalOriginPublicationId: record.publicationId,
          canonicalOriginOperationId: record.createdByCommandId,
        } satisfies BookAssemblyActivityVersionRecord;
      });
      (scope as { activityVersions?: Record<string, BookAssemblyActivityVersionRecord> }).activityVersions = {
        ...(scope.activityVersions ?? {}),
        ...Object.fromEntries([...freshRecords, ...reusableRecords].map((record) => [
          bookAssemblyActivityVersionScopeKey(record.manifestVersionId, record.activityVersionId),
          clone(record),
        ])),
      };
      (scope as { activitySafeProjections?: Record<string, BookAssemblyActivitySafeProjectionRecord> }).activitySafeProjections = {
        ...(scope.activitySafeProjections ?? {}),
        ...Object.fromEntries(input.plan.atomicWrites.activitySafeProjections.map((record) => [
          record.projectionId,
          clone(record),
        ])),
      };
      (scope as { placements?: Record<string, BookAssemblyPlacementRecord> }).placements = {
        ...(scope.placements ?? {}),
        ...Object.fromEntries(input.plan.atomicWrites.placements.map((record) => [
          record.placementId,
          clone(record),
        ])),
      };
      (scope as { unitProjections?: Record<string, BookAssemblyPublishedUnitProjectionRecord> }).unitProjections = {
        ...(scope.unitProjections ?? {}),
        ...Object.fromEntries(input.plan.atomicWrites.unitProjections.map((record) => [
          record.unitProjectionId,
          clone(record),
        ])),
      };
      (scope as { deliveryPlans?: Record<string, BookAssemblyDeliveryPublicationPlan> }).deliveryPlans = {
        ...(scope.deliveryPlans ?? {}),
        ...Object.fromEntries(input.plan.atomicWrites.deliveryPlans.map((record) => [
          record.deliveryPlanId,
          clone(record),
        ])),
      };
      (scope as { current?: BookAssemblyPublicationPointer }).current = pointer;
      (scope as { audits?: Record<string, BookAssemblyPublicationAuditRecord> }).audits = {
        ...(scope.audits ?? {}),
        [audit.auditId]: audit,
      };
      remember(scope, input.operationId, {
        ownerId: input.plan.ownerId,
        fingerprint,
        result: output,
        createdAt: input.now,
      });
      return { outcome: output, next: scope, write: true };
    }, input.operationId, fingerprint);
  },

  rollback: async (input: RollbackBookAssemblyPublicationInput): Promise<BookAssemblyPublicationResult> => {
    if (!validOperationId(input.operationId)
      || !validId(input.ownerId)
      || !validId(input.bookId)
      || !validId(input.expectedCurrentPublicationId)
      || !validId(input.targetPublicationId)) {
      return invalid('invalid-publication-plan');
    }
    const fingerprint = fingerprintBookAssemblyRollbackOperation(input);
    return repository.transaction(input.bookId, (scope) => {
      const replayed = replay(scope, input.ownerId, input.operationId, fingerprint);
      if (replayed) return { outcome: replayed, write: false };
      if (scope.current?.publicationId !== input.expectedCurrentPublicationId) {
        const output: BookAssemblyPublicationResult = { status: 'conflict', failureCode: 'stale-current-pointer' };
        remember(scope, input.operationId, {
          ownerId: input.ownerId, fingerprint, result: output, createdAt: input.now,
        });
        return { outcome: output, next: scope, write: true };
      }
      const target = Object.values(scope.versions ?? {})
        .find((version) => version.publicationId === input.targetPublicationId);
      if (!target
        || target.ownerId !== input.ownerId
        || target.bookId !== input.bookId
        || !hasCommittedOriginatingPublicationOperation(scope, target, input.ownerId)) {
        const output: BookAssemblyPublicationResult = { status: 'not-found', failureCode: 'unknown-version' };
        remember(scope, input.operationId, {
          ownerId: input.ownerId, fingerprint, result: output, createdAt: input.now,
        });
        return { outcome: output, next: scope, write: true };
      }
      const pointer = createBookAssemblyPublicationPointer({
        version: target,
        operationId: input.operationId,
        operationFingerprint: fingerprint,
        now: input.now,
      });
      const audit = createBookAssemblyPublicationAuditRecord({
        action: 'rollback',
        operationId: input.operationId,
        ownerId: input.ownerId,
        bookId: input.bookId,
        pointer,
        status: 'committed',
        now: input.now,
      });
      assertBookAssemblyAuditIsBounded(audit);
      const output: BookAssemblyPublicationResult = { status: 'rolled-back', pointer, version: clone(target), audit };
      (scope as { current?: BookAssemblyPublicationPointer }).current = pointer;
      (scope as { audits?: Record<string, BookAssemblyPublicationAuditRecord> }).audits = {
        ...(scope.audits ?? {}),
        [audit.auditId]: audit,
      };
      remember(scope, input.operationId, {
        ownerId: input.ownerId,
        fingerprint,
        result: output,
        createdAt: input.now,
      });
      return { outcome: output, next: scope, write: true };
    }, input.operationId, fingerprint);
  },
});
