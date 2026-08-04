import type { BookAssemblyBookAuthority } from './unitAssembly.types';
import type { BookAssemblyPublicationScope } from './publicationRepository';
import {
  analyzeBookAssemblyReconciliation,
} from './reconciliation.service';
import { resolveSourceQualifiedPage } from './sourcePageAuthority.service';
import { validateBookAssemblyManifestCandidate } from './manifestCandidate.service';
import type {
  BookAssemblyActivitySafeProjectionRecord,
  BookAssemblyActivityVersionReference,
  BookAssemblyDeliveryPublicationPlan,
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookAssemblyMappingRevisionImpact,
  BookAssemblyMappingRevisionLineage,
  BookAssemblyPlacementRecord,
  BookAssemblyPublicationAdapterPlan,
  BookAssemblyPublicationAtomicWriteSet,
  BookAssemblyPublishedUnitProjectionRecord,
  BookAssemblyPreviewApprovalReference,
  SourceQualifiedPageIdentity,
} from '../../types/bookAssembly.types';

export type MappingRevisionErrorCode =
  | 'predecessor-not-published'
  | 'predecessor-authority-mismatch'
  | 'source-set-changed'
  | 'structural-change'
  | 'activity-change'
  | 'mapping-unchanged'
  | 'preview-required'
  | 'preview-stale'
  | 'reconciliation-blocked'
  | 'activity-reference-missing'
  | 'successor-id-missing'
  | 'successor-id-duplicate'
  | 'mapping-plan-invalid';

export class MappingRevisionError extends Error {
  constructor(readonly code: MappingRevisionErrorCode, readonly path = '$') {
    super(`${code}:${path}`);
    this.name = 'MappingRevisionError';
  }
}

export interface MappingRevisionPublicationIds {
  readonly planId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly unitProjectionIds: Readonly<Record<string, string>>;
  readonly deliveryPlanIds: Readonly<Record<string, string>>;
  readonly activitiesByKey: Readonly<Record<string, {
    readonly projectionId: string;
    readonly placementId: string;
  }>>;
}

export interface CreateMappingRevisionPlanInput {
  readonly operationId: string;
  readonly now: string;
  readonly ownerId: string;
  readonly authority: BookAssemblyBookAuthority;
  readonly predecessor: BookAssemblyImmutableManifestVersion;
  readonly predecessorScope: BookAssemblyPublicationScope;
  readonly targetManifest: BookAssemblyManifestCandidate;
  readonly ids: MappingRevisionPublicationIds;
  readonly previewApproval?: BookAssemblyPreviewApprovalReference;
}

export interface MappingRevisionPlan {
  readonly plan: BookAssemblyPublicationAdapterPlan;
  readonly impact: BookAssemblyMappingRevisionImpact;
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

export const fingerprintMappingRevisionInput = (input: {
  readonly predecessorManifestVersionId: string;
  readonly targetManifest: BookAssemblyManifestCandidate;
}): string => fingerprint(input);

const assertId = (value: unknown, path: string): asserts value is string => {
  if (typeof value !== 'string' || !ID.test(value)) throw new MappingRevisionError('successor-id-missing', path);
};

const assertUniqueIds = (values: readonly string[], path: string): void => {
  values.forEach((value, index) => assertId(value, `${path}[${index}]`));
  if (new Set(values).size !== values.length) throw new MappingRevisionError('successor-id-duplicate', path);
};

const groupPath = (unitKey: string, pageGroupKey: string): string => `${unitKey}:${pageGroupKey}`;

const groupsByPath = (manifest: BookAssemblyManifestCandidate): Map<string, BookAssemblyManifestCandidate['units'][number]['pageGroups'][number]> => {
  const groups = new Map<string, BookAssemblyManifestCandidate['units'][number]['pageGroups'][number]>();
  manifest.units.forEach((unit) => unit.pageGroups.forEach((group) => groups.set(groupPath(unit.unitKey, group.pageGroupKey), group)));
  return groups;
};

const slotsByPath = (manifest: BookAssemblyManifestCandidate): Map<string, BookAssemblyManifestCandidate['units'][number]['activitySlots'][number]> => {
  const slots = new Map<string, BookAssemblyManifestCandidate['units'][number]['activitySlots'][number]>();
  manifest.units.forEach((unit) => unit.activitySlots.forEach((slot) => slots.set(`${unit.unitKey}:${slot.activityKey}`, slot)));
  return slots;
};

const changedPageGroupKeys = (
  predecessor: BookAssemblyManifestCandidate,
  target: BookAssemblyManifestCandidate,
): string[] => {
  const before = groupsByPath(predecessor);
  const after = groupsByPath(target);
  const changed = new Set<string>();
  new Set([...before.keys(), ...after.keys()]).forEach((key) => {
    if (stable(before.get(key)) !== stable(after.get(key))) changed.add(key);
  });
  predecessor.units.forEach((unit) => {
    const targetUnit = target.units.find((candidate) => candidate.unitKey === unit.unitKey);
    if (stable(unit.pageGroups.map((group) => group.pageGroupKey))
      !== stable(targetUnit?.pageGroups.map((group) => group.pageGroupKey))) {
      unit.pageGroups.forEach((group) => changed.add(groupPath(unit.unitKey, group.pageGroupKey)));
      targetUnit?.pageGroups.forEach((group) => changed.add(groupPath(unit.unitKey, group.pageGroupKey)));
    }
  });
  const beforeSlots = slotsByPath(predecessor);
  const afterSlots = slotsByPath(target);
  new Set([...beforeSlots.keys(), ...afterSlots.keys()]).forEach((key) => {
    if (stable(beforeSlots.get(key)?.pageGroupKeys) !== stable(afterSlots.get(key)?.pageGroupKeys)) {
      const [unitKey, activityKey] = key.split(':');
      const slot = afterSlots.get(key) ?? beforeSlots.get(key);
      slot?.pageGroupKeys.forEach((pageGroupKey) => changed.add(groupPath(unitKey ?? '', pageGroupKey)));
      if (!activityKey) changed.add(key);
    }
  });
  return [...changed].sort();
};

const sourceAssistedChange = (
  predecessor: BookAssemblyManifestCandidate,
  target: BookAssemblyManifestCandidate,
): boolean => {
  const before = groupsByPath(predecessor);
  const after = groupsByPath(target);
  return [...new Set([...before.keys(), ...after.keys()])].some((key) => {
    const left = before.get(key);
    const right = after.get(key);
    return left?.sourceKey !== right?.sourceKey
      || stable(left?.pages) !== stable(right?.pages);
  });
};

const assertPreview = (
  input: CreateMappingRevisionPlanInput,
  target: BookAssemblyManifestCandidate,
  required: boolean,
): void => {
  if (!required && !input.previewApproval) return;
  const approval = input.previewApproval;
  if (!approval || !ID.test(approval.approvalId) || !Number.isSafeInteger(approval.approvalRevision)
    || approval.approvalRevision < 1 || !approval.approvedInputFingerprint) {
    throw new MappingRevisionError('preview-required', '$.previewApproval');
  }
  const now = Date.parse(input.now);
  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(approvedAt) || !Number.isFinite(expiresAt)
    || approvedAt > now || now >= expiresAt
    || approval.approvedInputFingerprint !== fingerprintMappingRevisionInput({
      predecessorManifestVersionId: input.predecessor.manifestVersionId,
      targetManifest: target,
    })) {
    throw new MappingRevisionError('preview-stale', '$.previewApproval');
  }
};

const assertManifestBoundary = (input: CreateMappingRevisionPlanInput): string[] => {
  const { authority, predecessor, targetManifest } = input;
  if (predecessor.lifecycle !== 'published') throw new MappingRevisionError('predecessor-not-published');
  if (input.ownerId !== authority.ownerId || predecessor.ownerId !== input.ownerId
    || predecessor.bookId !== authority.bookId || targetManifest.bookId !== authority.bookId) {
    throw new MappingRevisionError('predecessor-authority-mismatch');
  }
  if (predecessor.bookRevision !== authority.bookRevision
    || predecessor.sourceSetRevision !== authority.sourceSetRevision) {
    throw new MappingRevisionError('predecessor-authority-mismatch', '$.authority');
  }
  if (stable(predecessor.manifest.sourceSet) !== stable(authority.sourceSet)
    || stable(targetManifest.sourceSet) !== stable(predecessor.manifest.sourceSet)) {
    throw new MappingRevisionError('source-set-changed', '$.targetManifest.sourceSet');
  }
  if (stable(predecessor.manifest.nodes) !== stable(targetManifest.nodes)) {
    throw new MappingRevisionError('structural-change', '$.targetManifest.nodes');
  }
  if (predecessor.manifest.units.map((unit) => unit.unitKey).join('|')
    !== targetManifest.units.map((unit) => unit.unitKey).join('|')) {
    throw new MappingRevisionError('structural-change', '$.targetManifest.units');
  }
  predecessor.manifest.units.forEach((unit) => {
    const targetUnit = targetManifest.units.find((candidate) => candidate.unitKey === unit.unitKey);
    if (!targetUnit) throw new MappingRevisionError('structural-change', `$.targetManifest.units.${unit.unitKey}`);
    const activityShape = (value: typeof unit) => value.activitySlots.map((slot) => ({
      activityKey: slot.activityKey,
      order: slot.order,
      contextRequirement: slot.contextRequirement,
    }));
    if (stable(activityShape(unit)) !== stable(activityShape(targetUnit))) {
      throw new MappingRevisionError('activity-change', `$.targetManifest.units.${unit.unitKey}.activitySlots`);
    }
  });
  const changed = changedPageGroupKeys(predecessor.manifest, targetManifest);
  if (changed.length === 0) throw new MappingRevisionError('mapping-unchanged');
  const validation = validateBookAssemblyManifestCandidate(targetManifest, authority.sourceVersionAuthority);
  if (validation.errors.length > 0) throw new MappingRevisionError('mapping-plan-invalid', validation.errors[0]?.path ?? '$');
  const report = analyzeBookAssemblyReconciliation({
    manifest: targetManifest,
    sourceVersionAuthority: authority.sourceVersionAuthority,
    expectedBookRevision: authority.bookRevision,
    bookRevision: authority.bookRevision,
    expectedSourceSetRevision: authority.sourceSetRevision,
    sourceSetRevision: authority.sourceSetRevision,
  });
  if (report.releaseBlocking || report.requiresTeacherChoice || report.issues.length > 0) {
    throw new MappingRevisionError('reconciliation-blocked', report.issues[0]?.path ?? '$');
  }
  return changed;
};

const predecessorActivity = (
  scope: BookAssemblyPublicationScope,
  predecessor: BookAssemblyImmutableManifestVersion,
  unitKey: string,
  activityKey: string,
) => Object.values(scope.activityVersions ?? {})
  .filter((record) => record.manifestVersionId === predecessor.manifestVersionId
    && record.unitKey === unitKey && record.activityKey === activityKey)
  .sort((left, right) => right.activityVersion - left.activityVersion)[0];

const predecessorPlacement = (
  scope: BookAssemblyPublicationScope,
  predecessor: BookAssemblyImmutableManifestVersion,
  unitKey: string,
  activityKey: string,
) => Object.values(scope.placements ?? {}).find((record) => record.manifestVersionId === predecessor.manifestVersionId
  && record.unitKey === unitKey && record.activityKey === activityKey);

const pagesForActivity = (
  manifest: BookAssemblyManifestCandidate,
  unitKey: string,
  activityKey: string,
  sourceVersionAuthority: BookAssemblyBookAuthority['sourceVersionAuthority'],
): SourceQualifiedPageIdentity[] => {
  const unit = manifest.units.find((candidate) => candidate.unitKey === unitKey);
  const slot = unit?.activitySlots.find((candidate) => candidate.activityKey === activityKey);
  if (!unit || !slot) throw new MappingRevisionError('mapping-plan-invalid', `$.targetManifest.units.${unitKey}.${activityKey}`);
  const pages = new Map<string, SourceQualifiedPageIdentity>();
  slot.pageGroupKeys.forEach((pageGroupKey) => {
    const group = unit.pageGroups.find((candidate) => candidate.pageGroupKey === pageGroupKey);
    if (!group || group.mode !== 'activity' || !group.activityKeys.includes(activityKey)) {
      throw new MappingRevisionError('mapping-plan-invalid', `$.targetManifest.units.${unitKey}.${activityKey}`);
    }
    group.pages.forEach((physicalPageNumber) => {
      const page = resolveSourceQualifiedPage(
        manifest.sourceSet,
        { bookId: manifest.bookId, sourceVersionAuthority },
        { sourceKey: group.sourceKey, physicalPageNumber },
        `$.targetManifest.units.${unitKey}.${pageGroupKey}`,
      );
      pages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page);
    });
  });
  if (pages.size === 0) throw new MappingRevisionError('mapping-plan-invalid', `$.targetManifest.units.${unitKey}.${activityKey}`);
  return [...pages.values()].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)
    || left.physicalPageNumber - right.physicalPageNumber);
};

const pagesForUnit = (
  manifest: BookAssemblyManifestCandidate,
  unitKey: string,
  sourceVersionAuthority: BookAssemblyBookAuthority['sourceVersionAuthority'],
): SourceQualifiedPageIdentity[] => {
  const unit = manifest.units.find((candidate) => candidate.unitKey === unitKey);
  if (!unit) throw new MappingRevisionError('mapping-plan-invalid', `$.targetManifest.units.${unitKey}`);
  const pages = new Map<string, SourceQualifiedPageIdentity>();
  unit.activitySlots.forEach((slot) => pagesForActivity(manifest, unitKey, slot.activityKey, sourceVersionAuthority)
    .forEach((page) => pages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page)));
  unit.pageGroups.filter((group) => group.mode === 'reference_only').forEach((group) => group.pages.forEach((physicalPageNumber) => {
    const page = resolveSourceQualifiedPage(
      manifest.sourceSet,
      { bookId: manifest.bookId, sourceVersionAuthority },
      { sourceKey: group.sourceKey, physicalPageNumber },
      `$.targetManifest.units.${unitKey}.${group.pageGroupKey}`,
    );
    pages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page);
  }));
  return [...pages.values()].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)
    || left.physicalPageNumber - right.physicalPageNumber);
};

const createAtomicWrites = (
  input: CreateMappingRevisionPlanInput,
): BookAssemblyPublicationAtomicWriteSet => {
  const activityVersionRefs: BookAssemblyActivityVersionReference[] = [];
  const activitySafeProjections: BookAssemblyActivitySafeProjectionRecord[] = [];
  const placements: BookAssemblyPlacementRecord[] = [];
  const unitProjections: BookAssemblyPublishedUnitProjectionRecord[] = [];
  const deliveryPlans: BookAssemblyDeliveryPublicationPlan[] = [];
  const newIds: string[] = [input.ids.planId, input.ids.manifestVersionId, input.ids.publicationId];

  input.targetManifest.units.forEach((unit) => {
    const unitProjectionId = input.ids.unitProjectionIds[unit.unitKey];
    const deliveryPlanId = input.ids.deliveryPlanIds[unit.unitKey];
    assertId(unitProjectionId, `$.ids.unitProjectionIds.${unit.unitKey}`);
    assertId(deliveryPlanId, `$.ids.deliveryPlanIds.${unit.unitKey}`);
    newIds.push(unitProjectionId, deliveryPlanId);
    const placementIds: string[] = [];
    const unitPages = pagesForUnit(input.targetManifest, unit.unitKey, input.authority.sourceVersionAuthority);
    const common = {
      schemaVersion: 1 as const,
      ownerId: input.ownerId,
      bookId: input.authority.bookId,
      manifestVersionId: input.ids.manifestVersionId,
      publicationId: input.ids.publicationId,
      publicationRevision: input.ids.publicationRevision,
    };
    unit.activitySlots.forEach((slot) => {
      const key = `${unit.unitKey}:${slot.activityKey}`;
      const ids = input.ids.activitiesByKey[key];
      if (!ids) throw new MappingRevisionError('successor-id-missing', `$.ids.activitiesByKey.${key}`);
      assertUniqueIds([ids.projectionId, ids.placementId], `$.ids.activitiesByKey.${key}`);
      newIds.push(ids.projectionId, ids.placementId);
      const activity = predecessorActivity(input.predecessorScope, input.predecessor, unit.unitKey, slot.activityKey);
      if (!activity) throw new MappingRevisionError('activity-reference-missing', `$.predecessorScope.activityVersions.${key}`);
      const oldPlacement = predecessorPlacement(input.predecessorScope, input.predecessor, unit.unitKey, slot.activityKey);
      const sourcePages = pagesForActivity(input.targetManifest, unit.unitKey, slot.activityKey, input.authority.sourceVersionAuthority);
      activityVersionRefs.push({
        activityVersionId: activity.activityVersionId,
        activityId: activity.activityId,
        activityVersion: activity.activityVersion,
      });
      placementIds.push(ids.placementId);
      activitySafeProjections.push({
        ...common,
        projectionId: ids.projectionId,
        activityId: activity.activityId,
        activityVersionId: activity.activityVersionId,
        placementIds: [ids.placementId],
        sourcePages,
        payloadFingerprint: fingerprint({ activityId: activity.activityId, activityVersionId: activity.activityVersionId, sourcePages }),
      });
      placements.push({
        ...common,
        placementId: ids.placementId,
        unitKey: unit.unitKey,
        nodeKey: unit.unitKey,
        activityKey: slot.activityKey,
        activityId: activity.activityId,
        activityVersionId: activity.activityVersionId,
        order: slot.order,
        pageGroupKeys: [...slot.pageGroupKeys],
        sourcePages,
        ...(oldPlacement ? { predecessorPlacementId: oldPlacement.placementId } : {}),
      });
    });
    unitProjections.push({
      ...common,
      unitProjectionId,
      unitKey: unit.unitKey,
      placementIds,
      sourcePages: unitPages,
      createdByCommandId: input.operationId,
      createdAt: input.now,
    });
    deliveryPlans.push({
      ...common,
      deliveryPlanId,
      sourceStrategy: input.targetManifest.sourceSet.sourceStrategy,
      sourceSet: clone(input.targetManifest.sourceSet),
      placementIds,
      unitProjectionIds: [unitProjectionId],
      createdByCommandId: input.operationId,
      createdAt: input.now,
    });
  });

  assertUniqueIds(newIds, '$.ids');
  if (new Set(activityVersionRefs.map((reference) => reference.activityVersionId)).size !== activityVersionRefs.length) {
    throw new MappingRevisionError('successor-id-duplicate', '$.activityVersionRefs');
  }
  return {
    activityVersions: [],
    activityVersionRefs,
    activitySafeProjections,
    placements,
    unitProjections,
    deliveryPlans,
  };
};

export const createMappingRevisionPublicationPlan = (
  input: CreateMappingRevisionPlanInput,
): MappingRevisionPlan => {
  const changedPageGroups = assertManifestBoundary(input);
  assertPreview(input, input.targetManifest, sourceAssistedChange(input.predecessor.manifest, input.targetManifest));
  assertId(input.ids.planId, '$.ids.planId');
  assertId(input.ids.manifestVersionId, '$.ids.manifestVersionId');
  assertId(input.ids.publicationId, '$.ids.publicationId');
  if (!Number.isSafeInteger(input.ids.publicationRevision)
    || input.ids.publicationRevision <= input.predecessor.publicationRevision) {
    throw new MappingRevisionError('mapping-plan-invalid', '$.ids.publicationRevision');
  }
  const atomicWrites = createAtomicWrites(input);
  const preservedActivities = input.targetManifest.units.flatMap((unit) => unit.activitySlots.map((slot) => {
    const activity = predecessorActivity(input.predecessorScope, input.predecessor, unit.unitKey, slot.activityKey);
    return activity;
  }).filter((activity): activity is NonNullable<typeof activity> => Boolean(activity)));
  const lineage: BookAssemblyMappingRevisionLineage = {
    kind: 'mapping-revision',
    predecessorPublicationId: input.predecessor.publicationId,
    predecessorManifestVersionId: input.predecessor.manifestVersionId,
    predecessorPublicationRevision: input.predecessor.publicationRevision,
    sourceSetRevision: input.predecessor.sourceSetRevision,
    createdByCommandId: input.operationId,
    createdAt: input.now,
    changedPageGroupKeys: changedPageGroups,
    preservedActivityIds: preservedActivities.map((activity) => activity.activityId),
    preservedActivityVersionIds: preservedActivities.map((activity) => activity.activityVersionId),
  };
  const impact: BookAssemblyMappingRevisionImpact = {
    changedPageGroupKeys: changedPageGroups,
    preservedActivityIds: lineage.preservedActivityIds,
    preservedActivityVersionIds: lineage.preservedActivityVersionIds,
    affectedUnitKeys: input.targetManifest.units
      .filter((unit) => changedPageGroups.some((key) => key.startsWith(`${unit.unitKey}:`)))
      .map((unit) => unit.unitKey),
    contextAdapterInput: {
      predecessorPublicationId: input.predecessor.publicationId,
      successorPublicationId: input.ids.publicationId,
      changedPageGroupKeys: changedPageGroups,
    },
  };
  const plan: BookAssemblyPublicationAdapterPlan = {
    strategy: input.predecessor.strategy,
    planId: input.ids.planId,
    adapterTicket: '18',
    ownerId: input.ownerId,
    bookId: input.authority.bookId,
    candidateId: input.predecessor.candidateId,
    candidateRevision: input.predecessor.candidateRevision,
    bookRevision: input.authority.bookRevision,
    sourceSetRevision: input.predecessor.sourceSetRevision,
    sourceSet: clone(input.targetManifest.sourceSet),
    manifest: clone(input.targetManifest),
    studentSafeProjection: {
      schemaVersion: 1,
      bookId: input.authority.bookId,
      publicationId: input.ids.publicationId,
      publicationRevision: input.ids.publicationRevision,
      sourceStrategy: input.predecessor.strategy,
      sourceSet: clone(input.targetManifest.sourceSet),
      units: clone(input.targetManifest.units),
    },
    atomicWrites,
    ...(input.previewApproval ? { previewApproval: clone(input.previewApproval) } : {}),
    mappingRevisionLineage: lineage,
  };
  return { plan, impact };
};
