import type { BookAssemblyBookAuthority } from './unitAssembly.types';
import type { BookAssemblyPublicationScope } from './publicationRepository';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookAssemblyPublicationAdapterPlan,
  BookAssemblyPublicationAtomicWriteSet,
  BookAssemblyPreviewApprovalReference,
  BookAssemblySourceStrategySuccessorImpact,
  BookAssemblySourceStrategySuccessorLineage,
  BookSourceStrategy,
  BookSourceVersionAuthority,
  SourceQualifiedPageIdentity,
  SourceSetCandidate,
} from '../../types/bookAssembly.types';
import type { SourceStrategyMigrationRemap } from './sourceStrategyMigration.service';
import { planSourceStrategyMigration } from './sourceStrategyMigration.service';
import { resolveSourceQualifiedPage } from './sourcePageAuthority.service';
import type {
  BookAssemblyActivitySafeProjectionRecord,
  BookAssemblyActivityVersionRecord,
  BookAssemblyDeliveryPublicationPlan,
  BookAssemblyPlacementRecord,
  BookAssemblyPublishedUnitProjectionRecord,
} from '../../types/bookAssembly.types';

export type SourceStrategySuccessorErrorCode =
  | 'predecessor-not-published'
  | 'predecessor-authority-mismatch'
  | 'strategy-unchanged'
  | 'target-revision-stale'
  | 'successor-id-missing'
  | 'successor-id-duplicate'
  | 'successor-plan-invalid';

export class SourceStrategySuccessorError extends Error {
  constructor(readonly code: SourceStrategySuccessorErrorCode, readonly path = '$') {
    super(`${code}:${path}`);
    this.name = 'SourceStrategySuccessorError';
  }
}

export interface SourceStrategySuccessorActivityIds {
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly projectionId: string;
  readonly placementId: string;
}

export interface SourceStrategySuccessorPublicationIds {
  readonly planId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly unitProjectionIds: Readonly<Record<string, string>>;
  readonly deliveryPlanIds: Readonly<Record<string, string>>;
  readonly activitiesByKey: Readonly<Record<string, SourceStrategySuccessorActivityIds>>;
}

export interface CreateSourceStrategySuccessorPlanInput {
  readonly operationId: string;
  readonly now: string;
  readonly ownerId: string;
  readonly authority: BookAssemblyBookAuthority;
  readonly predecessor: BookAssemblyImmutableManifestVersion;
  readonly predecessorScope: BookAssemblyPublicationScope;
  readonly target: {
    readonly sourceSetRevision: number;
    readonly sourceSet: SourceSetCandidate;
  };
  readonly remaps?: readonly SourceStrategyMigrationRemap[];
  readonly ids: SourceStrategySuccessorPublicationIds;
  readonly previewApproval?: BookAssemblyPreviewApprovalReference;
}

export interface SourceStrategySuccessorPlan {
  readonly plan: BookAssemblyPublicationAdapterPlan;
  readonly impact: BookAssemblySourceStrategySuccessorImpact;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

const fingerprint = (value: unknown): string => {
  let hash = 0xcbf29ce484222325n;
  for (const character of stable(value)) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
};

function assertId(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new SourceStrategySuccessorError('successor-id-missing', path);
  }
}

const assertUniqueIds = (values: readonly string[], path: string): void => {
  values.forEach((value, index) => assertId(value, `${path}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new SourceStrategySuccessorError('successor-id-duplicate', path);
  }
};

const activityKey = (unitKey: string, key: string): string => `${unitKey}:${key}`;

const pagesForActivity = (
  manifest: BookAssemblyManifestCandidate,
  unitKey: string,
  key: string,
  sourceVersionAuthority: BookSourceVersionAuthority,
): SourceQualifiedPageIdentity[] => {
  const unit = manifest.units.find((candidate) => candidate.unitKey === unitKey);
  const slot = unit?.activitySlots.find((candidate) => candidate.activityKey === key);
  if (!unit || !slot) throw new SourceStrategySuccessorError('successor-plan-invalid', `$.manifest.units.${unitKey}`);
  const pages = new Map<string, SourceQualifiedPageIdentity>();
  for (const groupKey of slot.pageGroupKeys) {
    const group = unit.pageGroups.find((candidate) => candidate.pageGroupKey === groupKey);
    if (!group || group.mode !== 'activity' || !group.activityKeys.includes(key)) {
      throw new SourceStrategySuccessorError('successor-plan-invalid', `$.manifest.units.${unitKey}.${key}`);
    }
    for (const physicalPageNumber of group.pages) {
      const page = resolveSourceQualifiedPage(
        manifest.sourceSet,
        { bookId: manifest.bookId, sourceVersionAuthority },
        { sourceKey: group.sourceKey, physicalPageNumber },
        `$.manifest.units.${unitKey}.${key}`,
      );
      pages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page);
    }
  }
  if (pages.size === 0) throw new SourceStrategySuccessorError('successor-plan-invalid', `$.manifest.units.${unitKey}.${key}`);
  return [...pages.values()].sort((left, right) =>
    left.sourceKey.localeCompare(right.sourceKey) || left.physicalPageNumber - right.physicalPageNumber);
};

const pagesForUnit = (
  manifest: BookAssemblyManifestCandidate,
  unitKey: string,
  sourceVersionAuthority: BookSourceVersionAuthority,
): SourceQualifiedPageIdentity[] => {
  const unit = manifest.units.find((candidate) => candidate.unitKey === unitKey);
  if (!unit) throw new SourceStrategySuccessorError('successor-plan-invalid', `$.manifest.units.${unitKey}`);
  const pages = new Map<string, SourceQualifiedPageIdentity>();
  for (const slot of unit.activitySlots) {
    for (const page of pagesForActivity(manifest, unitKey, slot.activityKey, sourceVersionAuthority)) {
      pages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page);
    }
  }
  for (const group of unit.pageGroups) {
    if (group.mode !== 'reference_only') continue;
    for (const physicalPageNumber of group.pages) {
      const page = resolveSourceQualifiedPage(
        manifest.sourceSet,
        { bookId: manifest.bookId, sourceVersionAuthority },
        { sourceKey: group.sourceKey, physicalPageNumber },
        `$.manifest.units.${unitKey}.${group.pageGroupKey}`,
      );
      pages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page);
    }
  }
  return [...pages.values()].sort((left, right) =>
    left.sourceKey.localeCompare(right.sourceKey) || left.physicalPageNumber - right.physicalPageNumber);
};

const predecessorActivity = (
  scope: BookAssemblyPublicationScope,
  predecessor: BookAssemblyImmutableManifestVersion,
  unitKey: string,
  key: string,
): BookAssemblyActivityVersionRecord | undefined => Object.values(scope.activityVersions ?? {})
  .filter((record) => record.manifestVersionId === predecessor.manifestVersionId
    && record.unitKey === unitKey
    && record.activityKey === key)
  .sort((left, right) => right.activityVersion - left.activityVersion)[0];

const assertPredecessor = (input: CreateSourceStrategySuccessorPlanInput): void => {
  const { authority, predecessor, target } = input;
  if (predecessor.lifecycle !== 'published') {
    throw new SourceStrategySuccessorError('predecessor-not-published');
  }
  if (input.ownerId !== authority.ownerId
    || predecessor.ownerId !== input.ownerId
    || predecessor.bookId !== authority.bookId
    || predecessor.manifest.bookId !== authority.bookId
    || stable(predecessor.manifest.sourceSet) !== stable(authority.sourceSet)) {
    throw new SourceStrategySuccessorError('predecessor-authority-mismatch');
  }
  if (predecessor.strategy === target.sourceSet.sourceStrategy) {
    throw new SourceStrategySuccessorError('strategy-unchanged', '$.target.sourceSet.sourceStrategy');
  }
  if (target.sourceSetRevision <= predecessor.sourceSetRevision
    || authority.sourceSetRevision !== predecessor.sourceSetRevision) {
    throw new SourceStrategySuccessorError('target-revision-stale', '$.target.sourceSetRevision');
  }
  if (predecessor.bookRevision !== authority.bookRevision) {
    throw new SourceStrategySuccessorError('predecessor-authority-mismatch', '$.bookRevision');
  }
}

const createAtomicWrites = (
  input: CreateSourceStrategySuccessorPlanInput,
  manifest: BookAssemblyManifestCandidate,
): BookAssemblyPublicationAtomicWriteSet => {
  const { ids, authority, predecessor, predecessorScope } = input;
  const activityVersions: BookAssemblyActivityVersionRecord[] = [];
  const activitySafeProjections: BookAssemblyActivitySafeProjectionRecord[] = [];
  const placements: BookAssemblyPlacementRecord[] = [];
  const unitProjections: BookAssemblyPublishedUnitProjectionRecord[] = [];
  const deliveryPlans: BookAssemblyDeliveryPublicationPlan[] = [];
  const activityVersionIds: string[] = [];
  const projectionIds: string[] = [];
  const placementIds: string[] = [];
  const unitProjectionIds = Object.values(ids.unitProjectionIds);
  const deliveryPlanIds = Object.values(ids.deliveryPlanIds);

  for (const unit of manifest.units) {
    const unitProjectionId = ids.unitProjectionIds[unit.unitKey];
    const deliveryPlanId = ids.deliveryPlanIds[unit.unitKey];
    assertId(unitProjectionId, `$.ids.unitProjectionIds.${unit.unitKey}`);
    assertId(deliveryPlanId, `$.ids.deliveryPlanIds.${unit.unitKey}`);
    const unitPlacementIds: string[] = [];
    const unitPages = pagesForUnit(manifest, unit.unitKey, authority.sourceVersionAuthority);
    const common = {
      schemaVersion: 1 as const,
      ownerId: input.ownerId,
      bookId: authority.bookId,
      manifestVersionId: ids.manifestVersionId,
      publicationId: ids.publicationId,
      publicationRevision: ids.publicationRevision,
    };
    for (const slot of unit.activitySlots) {
      const key = activityKey(unit.unitKey, slot.activityKey);
      const currentIds = ids.activitiesByKey[key];
      if (!currentIds) throw new SourceStrategySuccessorError('successor-id-missing', `$.ids.activitiesByKey.${key}`);
      assertUniqueIds([
        currentIds.activityId,
        currentIds.activityVersionId,
        currentIds.projectionId,
        currentIds.placementId,
      ], `$.ids.activitiesByKey.${key}`);
      if (!Number.isSafeInteger(currentIds.activityVersion) || currentIds.activityVersion < 1) {
        throw new SourceStrategySuccessorError('successor-id-missing', `$.ids.activitiesByKey.${key}.activityVersion`);
      }
      const sourcePages = pagesForActivity(manifest, unit.unitKey, slot.activityKey, authority.sourceVersionAuthority);
      const current = predecessorActivity(predecessorScope, predecessor, unit.unitKey, slot.activityKey);
      const predecessorPlacement = Object.values(predecessorScope.placements ?? {})
        .find((placement) => placement.manifestVersionId === predecessor.manifestVersionId
          && placement.unitKey === unit.unitKey
          && placement.activityKey === slot.activityKey);
      if (current && current.activityId !== currentIds.activityId) {
        throw new SourceStrategySuccessorError('successor-plan-invalid', `$.ids.activitiesByKey.${key}.activityId`);
      }
      activityVersionIds.push(currentIds.activityVersionId);
      projectionIds.push(currentIds.projectionId);
      placementIds.push(currentIds.placementId);
      unitPlacementIds.push(currentIds.placementId);
      activityVersions.push({
        ...common,
        activityId: currentIds.activityId,
        activityVersionId: currentIds.activityVersionId,
        activityVersion: currentIds.activityVersion,
        unitKey: unit.unitKey,
        activityKey: slot.activityKey,
        createdByCommandId: input.operationId,
        createdAt: input.now,
        sourcePages,
        payloadFingerprint: fingerprint({ unitKey: unit.unitKey, activityKey: slot.activityKey, sourcePages }),
        ...(current ? { predecessorActivityVersionId: current.activityVersionId } : {}),
      });
      activitySafeProjections.push({
        ...common,
        projectionId: currentIds.projectionId,
        activityId: currentIds.activityId,
        activityVersionId: currentIds.activityVersionId,
        placementIds: [currentIds.placementId],
        sourcePages,
        payloadFingerprint: fingerprint({ activityVersionId: currentIds.activityVersionId, sourcePages }),
      });
      placements.push({
        ...common,
        placementId: currentIds.placementId,
        unitKey: unit.unitKey,
        nodeKey: unit.unitKey,
        activityKey: slot.activityKey,
        activityId: currentIds.activityId,
        activityVersionId: currentIds.activityVersionId,
        order: slot.order,
        pageGroupKeys: slot.pageGroupKeys,
        sourcePages,
        ...(predecessorPlacement ? { predecessorPlacementId: predecessorPlacement.placementId } : {}),
      });
    }
    unitProjections.push({
      ...common,
      unitProjectionId,
      unitKey: unit.unitKey,
      placementIds: unitPlacementIds,
      sourcePages: unitPages,
      createdByCommandId: input.operationId,
      createdAt: input.now,
    });
    deliveryPlans.push({
      ...common,
      deliveryPlanId,
      sourceStrategy: manifest.sourceSet.sourceStrategy,
      sourceSet: clone(manifest.sourceSet),
      placementIds: unitPlacementIds,
      unitProjectionIds: [unitProjectionId],
      createdByCommandId: input.operationId,
      createdAt: input.now,
    });
  }

  assertUniqueIds([
    ids.planId,
    ids.manifestVersionId,
    ids.publicationId,
    ...activityVersionIds,
    ...projectionIds,
    ...placementIds,
    ...unitProjectionIds,
    ...deliveryPlanIds,
  ], '$.ids');
  return { activityVersions, activitySafeProjections, placements, unitProjections, deliveryPlans };
};

export const createSourceStrategySuccessorPublicationPlan = (
  input: CreateSourceStrategySuccessorPlanInput,
): SourceStrategySuccessorPlan => {
  assertPredecessor(input);
  assertId(input.ids.planId, '$.ids.planId');
  assertId(input.ids.manifestVersionId, '$.ids.manifestVersionId');
  assertId(input.ids.publicationId, '$.ids.publicationId');
  if (!Number.isSafeInteger(input.ids.publicationRevision) || input.ids.publicationRevision <= predecessorRevision(input.predecessor)) {
    throw new SourceStrategySuccessorError('successor-plan-invalid', '$.ids.publicationRevision');
  }
  const candidate = {
    candidateId: input.predecessor.candidateId,
    ownerId: input.ownerId,
    bookId: input.predecessor.bookId,
    bookRevision: input.predecessor.bookRevision,
    sourceSetRevision: input.predecessor.sourceSetRevision,
    unitKey: input.predecessor.manifest.units[0]?.unitKey ?? 'book',
    revision: input.predecessor.candidateRevision,
    lifecycle: 'validated' as const,
    manifest: input.predecessor.manifest,
    validation: { valid: true, errors: [] },
    updatedAt: input.predecessor.createdAt,
  };
  const migration = planSourceStrategyMigration({
    bookId: input.authority.bookId,
    bookMode: 'pdf',
    bookRevision: input.authority.bookRevision,
    sourceSetRevision: input.predecessor.sourceSetRevision,
    sourceSet: input.predecessor.manifest.sourceSet,
    candidate,
    target: input.target,
    remaps: input.remaps,
    sourceVersionAuthority: input.authority.sourceVersionAuthority,
    expectedBookRevision: input.authority.bookRevision,
    expectedSourceSetRevision: input.predecessor.sourceSetRevision,
    expectedCandidateRevision: input.predecessor.candidateRevision,
    published: false,
    hasPublication: false,
  });
  if (!migration.valid) throw new SourceStrategySuccessorError('successor-plan-invalid', migration.errors[0]?.path ?? '$');
  const atomicWrites = createAtomicWrites(input, migration.targetManifest);
  const lineage: BookAssemblySourceStrategySuccessorLineage = {
    kind: 'source-strategy-successor',
    predecessorPublicationId: input.predecessor.publicationId,
    predecessorManifestVersionId: input.predecessor.manifestVersionId,
    predecessorPublicationRevision: input.predecessor.publicationRevision,
    predecessorStrategy: input.predecessor.strategy,
    successorStrategy: migration.targetManifest.sourceSet.sourceStrategy,
    predecessorSourceSetRevision: input.predecessor.sourceSetRevision,
    successorSourceSetRevision: input.target.sourceSetRevision,
    createdByCommandId: input.operationId,
    createdAt: input.now,
  };
  const impact: BookAssemblySourceStrategySuccessorImpact = {
    fromStrategy: input.predecessor.strategy,
    toStrategy: migration.targetManifest.sourceSet.sourceStrategy,
    preservedNodeKeys: migration.targetManifest.nodes.map((node) => node.nodeKey),
    preservedUnitKeys: migration.targetManifest.units.map((unit) => unit.unitKey),
    preservedActivityKeys: migration.targetManifest.units.flatMap((unit) =>
      unit.activitySlots.map((slot) => activityKey(unit.unitKey, slot.activityKey))),
    remappedPageGroupKeys: (input.remaps ?? []).map((remap) => remap.pageGroupKey),
    affectedPageGroupKeys: migration.targetManifest.units.flatMap((unit) => unit.pageGroups
      .filter((group) => input.predecessor.strategy !== migration.targetManifest.sourceSet.sourceStrategy
        || (input.remaps ?? []).some((remap) => remap.pageGroupKey === group.pageGroupKey))
      .map((group) => group.pageGroupKey)),
    contextAdapterInput: {
      predecessorPublicationId: input.predecessor.publicationId,
      successorPublicationId: input.ids.publicationId,
      affectedUnitKeys: migration.targetManifest.units.map((unit) => unit.unitKey),
    },
  };
  const plan: BookAssemblyPublicationAdapterPlan = {
    strategy: migration.targetManifest.sourceSet.sourceStrategy,
    planId: input.ids.planId,
    adapterTicket: '20C',
    ownerId: input.ownerId,
    bookId: input.authority.bookId,
    candidateId: input.predecessor.candidateId,
    candidateRevision: input.predecessor.candidateRevision,
    bookRevision: input.authority.bookRevision,
    sourceSetRevision: input.target.sourceSetRevision,
    sourceSet: clone(migration.targetManifest.sourceSet),
    manifest: clone(migration.targetManifest),
    studentSafeProjection: {
      schemaVersion: 1,
      bookId: input.authority.bookId,
      publicationId: input.ids.publicationId,
      publicationRevision: input.ids.publicationRevision,
      sourceStrategy: migration.targetManifest.sourceSet.sourceStrategy,
      sourceSet: clone(migration.targetManifest.sourceSet),
      units: clone(migration.targetManifest.units),
    },
    atomicWrites,
    ...(input.previewApproval ? { previewApproval: clone(input.previewApproval) } : {}),
    successorLineage: lineage,
  };
  return { plan, impact };
};

const predecessorRevision = (predecessor: BookAssemblyImmutableManifestVersion): number =>
  predecessor.publicationRevision;
