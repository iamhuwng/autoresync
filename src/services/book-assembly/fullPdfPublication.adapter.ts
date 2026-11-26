import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from './unitAssembly.types';
import type {
  BookAssemblyManifestCandidate,
  BookAssemblyActivityVersionReference,
  BookAssemblyActivityVersionRecord,
  BookAssemblyActivitySafeProjectionRecord,
  BookAssemblyDeliveryPublicationPlan,
  BookAssemblyImmutableManifestVersion,
  BookAssemblyPlacementRecord,
  BookAssemblyPreviewApprovalReference,
  BookAssemblyPublicationAdapterPlan,
  BookAssemblyPublicationAtomicWriteSet,
  BookAssemblyPublishedUnitProjectionRecord,
  BookSourceVersionAuthority,
  BookUnitCandidate,
  SourceQualifiedPageIdentity,
} from '../../types/bookAssembly.types';
import type { BookAssemblyPublicationScope } from './publicationRepository';
import type { NormalizedActivity } from '../../types/bookActivity.types';
import { projectStudentActivity } from '../book-activity/activityProjection.service';
import {
  assertCanonicalPublishedActivityVersion,
  createCanonicalActivityVersionFingerprint,
  type CanonicalPublishedActivityVersionRecord,
  type CanonicalPublishedActivityVersionRecordWithoutPayloadFingerprint,
} from './canonicalActivityVersion.service';
import { validateBookAssemblyManifestCandidate } from './manifestCandidate.service';
import { resolveSourceQualifiedPage } from './sourcePageAuthority.service';

export class FullPdfPublicationAdapterError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'FullPdfPublicationAdapterError';
  }
}

export interface FullPdfActivityPublicationIds {
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly projectionId: string;
  readonly placementId: string;
}

export interface FullPdfCarriedUnitIds {
  readonly unitProjectionId: string;
  readonly deliveryPlanId: string;
  readonly activitiesByKey: Readonly<Record<string, {
    readonly projectionId: string;
    readonly placementId: string;
  }>>;
}

export interface FullPdfPublicationIds {
  readonly planId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly unitProjectionId: string;
  readonly deliveryPlanId: string;
  readonly activitiesByKey: Readonly<Record<string, FullPdfActivityPublicationIds>>;
  readonly carriedUnitsByKey?: Readonly<Record<string, FullPdfCarriedUnitIds>>;
}

export interface FullPdfActivityLineage {
  readonly activityId: string;
  readonly lastActivityVersionId?: string;
  readonly lastActivityVersion?: number;
}

export interface FullPdfValidatedActivityPayload {
  readonly activityKey: string;
  readonly ownerId: string;
  readonly revision: number;
  readonly lifecycle: 'draft';
  readonly activity: NormalizedActivity;
}

export interface FullPdfPublicationAdapterOutput {
  readonly plan: BookAssemblyPublicationAdapterPlan;
  readonly canonicalActivityVersions: readonly CanonicalPublishedActivityVersionRecord[];
}

export interface CreateFullPdfPublicationAdapterPlanInput {
  readonly operationId: string;
  readonly now: string;
  readonly ownerId: string;
  readonly unitKey: string;
  readonly candidate: BookAssemblyCandidateRecord;
  readonly authority: BookAssemblyBookAuthority;
  readonly expectedCandidateRevision: number;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly ids: FullPdfPublicationIds;
  readonly previewApproval: BookAssemblyPreviewApprovalReference;
  readonly activitiesByKey: Readonly<Record<string, FullPdfValidatedActivityPayload>>;
  readonly existingLineageByActivityKey?: Readonly<Record<string, FullPdfActivityLineage>>;
  /** Optional current publication for incremental multi-unit Full-PDF publishing. */
  readonly predecessorScope?: BookAssemblyPublicationScope<unknown> | null;
  readonly predecessor?: BookAssemblyImmutableManifestVersion | null;
}

export interface FullPdfPublicationCommandInput extends Omit<CreateFullPdfPublicationAdapterPlanInput, 'ids'> {
  readonly allocateId: (kind: string, key: string) => string;
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const fingerprint = (value: unknown): string => {
  const encoded = stable(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const char of encoded) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
};

const assertCurrentAuthority = (
  input: CreateFullPdfPublicationAdapterPlanInput,
): BookAssemblyManifestCandidate => {
  const { candidate, authority } = input;
  if (input.ownerId !== authority.ownerId || candidate.ownerId !== input.ownerId) {
    throw new FullPdfPublicationAdapterError('full_pdf_owner_mismatch');
  }
  if (authority.bookMode !== 'pdf'
    || candidate.bookId !== authority.bookId
    || candidate.bookId !== input.authority.bookId
    || candidate.bookRevision !== input.expectedBookRevision
    || authority.bookRevision !== input.expectedBookRevision
    || candidate.sourceSetRevision !== input.expectedSourceSetRevision
    || authority.sourceSetRevision !== input.expectedSourceSetRevision
    || candidate.revision !== input.expectedCandidateRevision) {
    throw new FullPdfPublicationAdapterError('full_pdf_revision_conflict');
  }
  if (candidate.lifecycle !== 'validated' || !candidate.validation.valid || candidate.manifest === null) {
    throw new FullPdfPublicationAdapterError('full_pdf_candidate_not_validated');
  }
  if (candidate.unitKey !== input.unitKey) {
    throw new FullPdfPublicationAdapterError('full_pdf_unit_mismatch');
  }
  if (candidate.manifest.bookId !== authority.bookId
    || stable(candidate.manifest.sourceSet) !== stable(authority.sourceSet)) {
    throw new FullPdfPublicationAdapterError('full_pdf_source_set_mismatch');
  }
  const validation = validateBookAssemblyManifestCandidate(
    candidate.manifest,
    authority.sourceVersionAuthority,
  );
  if (!validation.valid) {
    throw new FullPdfPublicationAdapterError('full_pdf_manifest_invalid');
  }
  return candidate.manifest;
};

const assertFullPdfSource = (
  manifest: BookAssemblyManifestCandidate,
  authority: BookSourceVersionAuthority,
): void => {
  if (manifest.sourceSet.sourceStrategy !== 'full_pdf' || manifest.sourceSet.sources.length !== 1) {
    throw new FullPdfPublicationAdapterError('full_pdf_requires_one_source');
  }
  const [source] = manifest.sourceSet.sources;
  if (!source || 'ownerNodeKey' in source || source.sourceOrder !== 1) {
    throw new FullPdfPublicationAdapterError('full_pdf_component_fields_forbidden');
  }
  const trusted = authority.getSourceVersion(source.sourceVersionId);
  if (!trusted || !trusted.verifiedUsable || trusted.bookId !== manifest.bookId) {
    throw new FullPdfPublicationAdapterError('full_pdf_source_not_ready');
  }
};

const assertPreviewApproval = (
  approval: BookAssemblyPreviewApprovalReference,
  now: string,
): void => {
  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  const current = Date.parse(now);
  if (!Number.isFinite(approvedAt)
    || !Number.isFinite(expiresAt)
    || !Number.isFinite(current)
    || approvedAt > current
    || expiresAt <= current) {
    throw new FullPdfPublicationAdapterError('full_pdf_preview_approval_expired');
  }
};

const pagesForActivity = (
  manifest: BookAssemblyManifestCandidate,
  unit: BookAssemblyManifestCandidate['units'][number],
  activityKey: string,
  sourceVersionAuthority: BookSourceVersionAuthority,
): SourceQualifiedPageIdentity[] => {
  const pages = new Map<string, SourceQualifiedPageIdentity>();
  const slot = unit.activitySlots.find((candidate) => candidate.activityKey === activityKey);
  if (!slot) throw new FullPdfPublicationAdapterError('full_pdf_activity_slot_missing');
  for (const groupKey of slot.pageGroupKeys) {
    const group = unit.pageGroups.find((candidate) => candidate.pageGroupKey === groupKey);
    if (!group || group.mode !== 'activity' || !group.activityKeys.includes(activityKey)) {
      throw new FullPdfPublicationAdapterError('full_pdf_mapping_invalid');
    }
    for (const physicalPageNumber of group.pages) {
      const page = resolveSourceQualifiedPage(
        manifest.sourceSet,
        { bookId: manifest.bookId, sourceVersionAuthority },
        { sourceKey: group.sourceKey, physicalPageNumber },
        `units.${unit.unitKey}.${activityKey}`,
      );
      pages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page);
    }
  }
  if (pages.size === 0) throw new FullPdfPublicationAdapterError('full_pdf_mapping_invalid');
  return [...pages.values()].sort((left, right) =>
    left.sourceKey.localeCompare(right.sourceKey) || left.physicalPageNumber - right.physicalPageNumber);
};

const resolveCarriedForwardUnits = (
  manifest: BookAssemblyManifestCandidate,
  unitKey: string,
  predecessor: BookAssemblyImmutableManifestVersion | null | undefined,
): readonly BookUnitCandidate[] => {
  if (!predecessor || predecessor.strategy !== 'full_pdf') {
    return [];
  }
  const otherPredecessorUnits = predecessor.studentSafeProjection.units.filter((entry) => entry.unitKey !== unitKey);
  if (otherPredecessorUnits.length === 0) {
    return [];
  }
  if (stable(predecessor.manifest.sourceSet) !== stable(manifest.sourceSet)) {
    throw new FullPdfPublicationAdapterError('full_pdf_source_set_changed_with_other_published_units');
  }
  const manifestUnitNodeKeys = new Set(
    manifest.nodes
      .filter((node) => node.nodeType === 'unit')
      .map((node) => node.nodeKey),
  );
  const manifestUnitByKey = new Map(manifest.units.map((entry) => [entry.unitKey, entry]));
  const carried: BookUnitCandidate[] = [];
  for (const prevUnit of otherPredecessorUnits) {
    const incomingUnit = manifestUnitByKey.get(prevUnit.unitKey);
    if (!incomingUnit || !manifestUnitNodeKeys.has(prevUnit.unitKey)) {
      // Unit was explicitly removed from the Book outline; do not carry orphaned placements.
      continue;
    }
    if (stable(incomingUnit.activitySlots) !== stable(prevUnit.activitySlots)
      || stable(incomingUnit.pageGroups) !== stable(prevUnit.pageGroups)) {
      throw new FullPdfPublicationAdapterError('full_pdf_predecessor_unit_topology_changed');
    }
    carried.push(prevUnit);
  }
  return carried;
};

const orderPublishedUnits = (
  manifest: BookAssemblyManifestCandidate,
  targetUnit: BookUnitCandidate,
  carriedUnits: readonly BookUnitCandidate[],
): readonly BookUnitCandidate[] => {
  if (carriedUnits.length === 0) return [targetUnit];
  const byKey = new Map<string, BookUnitCandidate>([
    ...carriedUnits.map((entry) => [entry.unitKey, entry] as const),
    [targetUnit.unitKey, targetUnit],
  ]);
  const ordered: BookUnitCandidate[] = [];
  for (const entry of manifest.units) {
    const match = byKey.get(entry.unitKey);
    if (match) {
      ordered.push(match);
      byKey.delete(entry.unitKey);
    }
  }
  for (const remaining of byKey.values()) ordered.push(remaining);
  return ordered;
};

const predecessorActivityVersion = (
  scope: BookAssemblyPublicationScope<unknown>,
  predecessor: BookAssemblyImmutableManifestVersion,
  unitKey: string,
  activityKey: string,
): BookAssemblyActivityVersionRecord | undefined => Object.values(scope.activityVersions ?? {})
  .filter((record) => record.manifestVersionId === predecessor.manifestVersionId
    && record.unitKey === unitKey
    && record.activityKey === activityKey)
  .sort((left, right) => right.activityVersion - left.activityVersion)[0];

const referencePagesForUnit = (
  manifest: BookAssemblyManifestCandidate,
  unit: BookUnitCandidate,
  sourceVersionAuthority: BookSourceVersionAuthority,
): SourceQualifiedPageIdentity[] => {
  const pages = new Map<string, SourceQualifiedPageIdentity>();
  for (const group of unit.pageGroups) {
    if (group.mode !== 'reference_only') continue;
    for (const physicalPageNumber of group.pages) {
      const page = resolveSourceQualifiedPage(
        manifest.sourceSet,
        { bookId: manifest.bookId, sourceVersionAuthority },
        { sourceKey: group.sourceKey, physicalPageNumber },
        `units.${unit.unitKey}.${group.pageGroupKey}`,
      );
      pages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page);
    }
  }
  return [...pages.values()];
};

const createPublicationRecords = (
  input: CreateFullPdfPublicationAdapterPlanInput,
  manifest: BookAssemblyManifestCandidate,
  carriedUnits: readonly BookUnitCandidate[],
): {
  readonly atomicWrites: BookAssemblyPublicationAtomicWriteSet;
  readonly canonicalActivityVersions: readonly CanonicalPublishedActivityVersionRecord[];
} => {
  const unit = manifest.units.find((candidate) => candidate.unitKey === input.unitKey);
  if (!unit) throw new FullPdfPublicationAdapterError('full_pdf_unit_missing');
  const expectedActivityKeys = new Set(unit.activitySlots.map((slot) => slot.activityKey));
  if (Object.keys(input.activitiesByKey).some((key) => !expectedActivityKeys.has(key))) {
    throw new FullPdfPublicationAdapterError('full_pdf_activity_payload_mismatch');
  }
  const placementIds: string[] = [];
  const allPages = new Map<string, SourceQualifiedPageIdentity>();
  const activityVersions: BookAssemblyActivityVersionRecord[] = [];
  const activityVersionRefs: BookAssemblyActivityVersionReference[] = [];
  const activitySafeProjections: BookAssemblyActivitySafeProjectionRecord[] = [];
  const placements: BookAssemblyPlacementRecord[] = [];
  const unitProjections: BookAssemblyPublishedUnitProjectionRecord[] = [];
  const deliveryPlans: BookAssemblyDeliveryPublicationPlan[] = [];
  const canonicalActivityVersions: CanonicalPublishedActivityVersionRecord[] = [];
  for (const slot of unit.activitySlots) {
    const ids = input.ids.activitiesByKey[slot.activityKey];
    if (!ids) throw new FullPdfPublicationAdapterError('full_pdf_trusted_ids_missing');
    const payload = input.activitiesByKey[slot.activityKey];
    if (!payload) throw new FullPdfPublicationAdapterError('full_pdf_activity_payload_missing');
    if (payload.activityKey !== slot.activityKey
      || payload.ownerId !== input.ownerId
      || payload.lifecycle !== 'draft'
      || !Number.isSafeInteger(payload.revision)
      || payload.revision < 1) {
      throw new FullPdfPublicationAdapterError('full_pdf_activity_payload_mismatch');
    }
    const lineage = input.existingLineageByActivityKey?.[slot.activityKey];
    if (lineage && lineage.activityId !== ids.activityId) {
      throw new FullPdfPublicationAdapterError('full_pdf_activity_lineage_mismatch');
    }
    const sourcePages = pagesForActivity(
      manifest,
      unit,
      slot.activityKey,
      input.authority.sourceVersionAuthority,
    );
    for (const page of sourcePages) allPages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page);
    placementIds.push(ids.placementId);
    let canonical: CanonicalPublishedActivityVersionRecord;
    try {
      const prevActivity = input.predecessor && input.predecessorScope
        ? predecessorActivityVersion(input.predecessorScope, input.predecessor, unit.unitKey, slot.activityKey)
        : undefined;
      const predecessorActivityVersionId = lineage?.lastActivityVersionId ?? prevActivity?.activityVersionId;
      const isRevision = Boolean(input.predecessor)
        && ids.activityVersion > 1
        && predecessorActivityVersionId !== undefined;
      const sourceContextFingerprint = fingerprint(sourcePages);
      const canonicalWithoutFingerprint: CanonicalPublishedActivityVersionRecordWithoutPayloadFingerprint = {
        schemaVersion: 1,
        lifecycle: 'published',
        activityId: ids.activityId,
        activityVersionId: ids.activityVersionId,
        activityVersion: ids.activityVersion,
        ownerId: input.ownerId,
        activity: payload.activity,
        projection: projectStudentActivity(payload.activity),
        ...(isRevision
          ? { predecessorActivityVersionId }
          : {}),
        placementIds: [ids.placementId],
        evidenceRefs: [],
        sourceContextFingerprint,
        createdByOperationId: input.operationId,
        publishedAt: input.now,
        provenance: isRevision
          ? {
            kind: 'activity-revision',
            candidateId: input.candidate.candidateId,
            candidateRevision: input.candidate.revision,
            evidenceRefs: [],
            sourceContext: { fingerprint: sourceContextFingerprint },
          }
          : {
            kind: 'initial-book-publication',
            bookId: input.authority.bookId,
            manifestVersionId: input.ids.manifestVersionId,
            publicationId: input.ids.publicationId,
            publicationRevision: input.ids.publicationRevision,
            unitKey: unit.unitKey,
            activityKey: slot.activityKey,
            sourcePages,
          },
      };
      canonical = assertCanonicalPublishedActivityVersion({
        ...canonicalWithoutFingerprint,
        payloadFingerprint: createCanonicalActivityVersionFingerprint(canonicalWithoutFingerprint),
      });
    } catch {
      throw new FullPdfPublicationAdapterError('full_pdf_activity_payload_invalid');
    }
    canonicalActivityVersions.push(canonical);
    activityVersions.push({
      schemaVersion: 1 as const,
      activityId: ids.activityId,
      activityVersionId: ids.activityVersionId,
      activityVersion: ids.activityVersion,
      ownerId: input.ownerId,
      bookId: input.authority.bookId,
      manifestVersionId: input.ids.manifestVersionId,
      publicationId: input.ids.publicationId,
      publicationRevision: input.ids.publicationRevision,
      unitKey: unit.unitKey,
      activityKey: slot.activityKey,
      createdByCommandId: input.operationId,
      createdAt: input.now,
      sourcePages,
      canonicalPayloadFingerprint: canonical.payloadFingerprint,
      safeProjectionId: ids.projectionId,
      canonicalOriginManifestVersionId: input.ids.manifestVersionId,
      canonicalOriginPublicationId: input.ids.publicationId,
      canonicalOriginOperationId: input.operationId,
      payloadFingerprint: fingerprint({
        activityKey: slot.activityKey,
        pageGroupKeys: slot.pageGroupKeys,
        sourcePages,
      }),
    });
    activitySafeProjections.push({
      schemaVersion: 1 as const,
      projectionId: ids.projectionId,
      activityId: ids.activityId,
      activityVersionId: ids.activityVersionId,
      ownerId: input.ownerId,
      bookId: input.authority.bookId,
      manifestVersionId: input.ids.manifestVersionId,
      publicationId: input.ids.publicationId,
      publicationRevision: input.ids.publicationRevision,
      placementIds: [ids.placementId],
      sourcePages,
      payloadFingerprint: fingerprint({
        activityVersionId: ids.activityVersionId,
        contextRequirement: slot.contextRequirement,
        sourcePages,
      }),
    });
    placements.push({
      schemaVersion: 1 as const,
      placementId: ids.placementId,
      ownerId: input.ownerId,
      bookId: input.authority.bookId,
      manifestVersionId: input.ids.manifestVersionId,
      publicationId: input.ids.publicationId,
      publicationRevision: input.ids.publicationRevision,
      unitKey: unit.unitKey,
      nodeKey: unit.unitKey,
      activityKey: slot.activityKey,
      activityId: ids.activityId,
      activityVersionId: ids.activityVersionId,
      order: slot.order,
      pageGroupKeys: slot.pageGroupKeys,
      sourcePages,
    });
  }
  for (const page of referencePagesForUnit(manifest, unit, input.authority.sourceVersionAuthority)) {
    allPages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page);
  }
  const sourcePages = [...allPages.values()].sort((left, right) =>
    left.sourceKey.localeCompare(right.sourceKey) || left.physicalPageNumber - right.physicalPageNumber);
  unitProjections.push({
    schemaVersion: 1,
    unitProjectionId: input.ids.unitProjectionId,
    ownerId: input.ownerId,
    bookId: input.authority.bookId,
    manifestVersionId: input.ids.manifestVersionId,
    publicationId: input.ids.publicationId,
    publicationRevision: input.ids.publicationRevision,
    unitKey: unit.unitKey,
    placementIds,
    sourcePages,
    createdByCommandId: input.operationId,
    createdAt: input.now,
  });
  deliveryPlans.push({
    schemaVersion: 1,
    deliveryPlanId: input.ids.deliveryPlanId,
    ownerId: input.ownerId,
    bookId: input.authority.bookId,
    manifestVersionId: input.ids.manifestVersionId,
    publicationId: input.ids.publicationId,
    publicationRevision: input.ids.publicationRevision,
    sourceStrategy: 'full_pdf',
    sourceSet: manifest.sourceSet,
    placementIds,
    unitProjectionIds: [input.ids.unitProjectionId],
    createdByCommandId: input.operationId,
    createdAt: input.now,
  });

  if (carriedUnits.length > 0 && input.predecessor && input.predecessorScope) {
    for (const carriedUnit of carriedUnits) {
      const carriedIds = input.ids.carriedUnitsByKey?.[carriedUnit.unitKey];
      if (!carriedIds) throw new FullPdfPublicationAdapterError('full_pdf_trusted_ids_missing');
      const carriedPlacementIds: string[] = [];
      const carriedPages = new Map<string, SourceQualifiedPageIdentity>();
      for (const slot of carriedUnit.activitySlots) {
        const slotIds = carriedIds.activitiesByKey[slot.activityKey];
        if (!slotIds) throw new FullPdfPublicationAdapterError('full_pdf_trusted_ids_missing');
        const prev = predecessorActivityVersion(
          input.predecessorScope,
          input.predecessor,
          carriedUnit.unitKey,
          slot.activityKey,
        );
        if (!prev || !prev.canonicalPayloadFingerprint) {
          throw new FullPdfPublicationAdapterError('full_pdf_activity_payload_missing');
        }
        const slotPages = pagesForActivity(
          manifest,
          carriedUnit,
          slot.activityKey,
          input.authority.sourceVersionAuthority,
        );
        for (const page of slotPages) carriedPages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page);
        activityVersionRefs.push({
          activityVersionId: prev.activityVersionId,
          activityId: prev.activityId,
          activityVersion: prev.activityVersion,
          canonicalPayloadFingerprint: prev.canonicalPayloadFingerprint,
        });
        carriedPlacementIds.push(slotIds.placementId);
        activitySafeProjections.push({
          schemaVersion: 1,
          projectionId: slotIds.projectionId,
          activityId: prev.activityId,
          activityVersionId: prev.activityVersionId,
          ownerId: input.ownerId,
          bookId: input.authority.bookId,
          manifestVersionId: input.ids.manifestVersionId,
          publicationId: input.ids.publicationId,
          publicationRevision: input.ids.publicationRevision,
          placementIds: [slotIds.placementId],
          sourcePages: slotPages,
          payloadFingerprint: fingerprint({
            activityVersionId: prev.activityVersionId,
            contextRequirement: slot.contextRequirement,
            sourcePages: slotPages,
          }),
        });
        placements.push({
          schemaVersion: 1,
          placementId: slotIds.placementId,
          ownerId: input.ownerId,
          bookId: input.authority.bookId,
          manifestVersionId: input.ids.manifestVersionId,
          publicationId: input.ids.publicationId,
          publicationRevision: input.ids.publicationRevision,
          unitKey: carriedUnit.unitKey,
          nodeKey: carriedUnit.unitKey,
          activityKey: slot.activityKey,
          activityId: prev.activityId,
          activityVersionId: prev.activityVersionId,
          order: slot.order,
          pageGroupKeys: slot.pageGroupKeys,
          sourcePages: slotPages,
        });
      }
      for (const page of referencePagesForUnit(manifest, carriedUnit, input.authority.sourceVersionAuthority)) {
        carriedPages.set(`${page.sourceKey}:${page.physicalPageNumber}`, page);
      }
      const carriedUnitSourcePages = [...carriedPages.values()].sort((left, right) =>
        left.sourceKey.localeCompare(right.sourceKey) || left.physicalPageNumber - right.physicalPageNumber);
      unitProjections.push({
        schemaVersion: 1,
        unitProjectionId: carriedIds.unitProjectionId,
        ownerId: input.ownerId,
        bookId: input.authority.bookId,
        manifestVersionId: input.ids.manifestVersionId,
        publicationId: input.ids.publicationId,
        publicationRevision: input.ids.publicationRevision,
        unitKey: carriedUnit.unitKey,
        placementIds: carriedPlacementIds,
        sourcePages: carriedUnitSourcePages,
        createdByCommandId: input.operationId,
        createdAt: input.now,
      });
      deliveryPlans.push({
        schemaVersion: 1,
        deliveryPlanId: carriedIds.deliveryPlanId,
        ownerId: input.ownerId,
        bookId: input.authority.bookId,
        manifestVersionId: input.ids.manifestVersionId,
        publicationId: input.ids.publicationId,
        publicationRevision: input.ids.publicationRevision,
        sourceStrategy: 'full_pdf',
        sourceSet: manifest.sourceSet,
        placementIds: carriedPlacementIds,
        unitProjectionIds: [carriedIds.unitProjectionId],
        createdByCommandId: input.operationId,
        createdAt: input.now,
      });
    }
  }

  return {
    canonicalActivityVersions,
    atomicWrites: {
      activityVersions,
      ...(activityVersionRefs.length > 0 ? { activityVersionRefs } : {}),
      activitySafeProjections,
      placements,
      unitProjections,
      deliveryPlans,
    },
  };
};

export const createFullPdfPublicationAdapter = (
  input: CreateFullPdfPublicationAdapterPlanInput,
): FullPdfPublicationAdapterOutput => {
  const manifest = assertCurrentAuthority(input);
  assertFullPdfSource(manifest, input.authority.sourceVersionAuthority);
  assertPreviewApproval(input.previewApproval, input.now);
  const unit = manifest.units.find((candidate) => candidate.unitKey === input.unitKey);
  if (!unit) throw new FullPdfPublicationAdapterError('full_pdf_unit_missing');
  const carriedUnits = resolveCarriedForwardUnits(manifest, input.unitKey, input.predecessor);
  const publishedUnits = orderPublishedUnits(manifest, unit, carriedUnits);
  const selectedManifest: BookAssemblyManifestCandidate = {
    ...manifest,
    units: publishedUnits,
  };
  const records = createPublicationRecords(input, manifest, carriedUnits);
  return {
    canonicalActivityVersions: records.canonicalActivityVersions,
    plan: {
      strategy: 'full_pdf',
      planId: input.ids.planId,
      adapterTicket: '16',
      ownerId: input.ownerId,
      bookId: input.authority.bookId,
      candidateId: input.candidate.candidateId,
      candidateRevision: input.candidate.revision,
      bookRevision: input.authority.bookRevision,
      sourceSetRevision: input.authority.sourceSetRevision,
      sourceSet: manifest.sourceSet,
      manifest: selectedManifest,
      studentSafeProjection: {
        schemaVersion: 1,
        bookId: input.authority.bookId,
        publicationId: input.ids.publicationId,
        publicationRevision: input.ids.publicationRevision,
        sourceStrategy: 'full_pdf',
        sourceSet: manifest.sourceSet,
        units: publishedUnits,
      },
      atomicWrites: records.atomicWrites,
      previewApproval: input.previewApproval,
    },
  };
};

export const createFullPdfPublicationAdapterPlan = (
  input: CreateFullPdfPublicationAdapterPlanInput,
): BookAssemblyPublicationAdapterPlan => createFullPdfPublicationAdapter(input).plan;

export const createFullPdfPublicationCommandOutput = (
  input: FullPdfPublicationCommandInput,
): FullPdfPublicationAdapterOutput => {
  const manifest = input.candidate.manifest;
  if (manifest === null) throw new FullPdfPublicationAdapterError('full_pdf_candidate_not_validated');
  const unit = manifest.units.find((candidate) => candidate.unitKey === input.unitKey);
  if (!unit) throw new FullPdfPublicationAdapterError('full_pdf_unit_missing');
  const carriedUnits = resolveCarriedForwardUnits(manifest, input.unitKey, input.predecessor);
  const publicationId = input.allocateId('publication', input.candidate.candidateId);
  const publicationRevision = (input.predecessor?.publicationRevision ?? 0) + 1;
  return createFullPdfPublicationAdapter({
    ...input,
    ids: {
      planId: input.allocateId('plan', input.candidate.candidateId),
      manifestVersionId: input.allocateId('manifest-version', input.candidate.candidateId),
      publicationId,
      publicationRevision,
      unitProjectionId: input.allocateId('unit-projection', input.unitKey),
      deliveryPlanId: input.allocateId('delivery-plan', input.unitKey),
      activitiesByKey: Object.fromEntries(unit.activitySlots.map((slot) => {
        const lineage = input.existingLineageByActivityKey?.[slot.activityKey];
        const prev = input.predecessor && input.predecessorScope
          ? predecessorActivityVersion(input.predecessorScope, input.predecessor, input.unitKey, slot.activityKey)
          : undefined;
        const activityId = lineage?.activityId ?? prev?.activityId ?? input.allocateId('activity', slot.activityKey);
        const lastVersion = lineage?.lastActivityVersion ?? prev?.activityVersion ?? 0;
        return [slot.activityKey, {
          activityId,
          activityVersionId: input.allocateId('activity-version', slot.activityKey),
          activityVersion: lastVersion + 1,
          projectionId: input.allocateId('activity-projection', slot.activityKey),
          placementId: input.allocateId('placement', slot.activityKey),
        }];
      })),
      ...(carriedUnits.length > 0 ? {
        carriedUnitsByKey: Object.fromEntries(carriedUnits.map((carriedUnit) => [
          carriedUnit.unitKey,
          {
            unitProjectionId: input.allocateId('unit-projection', carriedUnit.unitKey),
            deliveryPlanId: input.allocateId('delivery-plan', carriedUnit.unitKey),
            activitiesByKey: Object.fromEntries(carriedUnit.activitySlots.map((slot) => [
              slot.activityKey,
              {
                projectionId: input.allocateId('activity-projection', `${carriedUnit.unitKey}:${slot.activityKey}`),
                placementId: input.allocateId('placement', `${carriedUnit.unitKey}:${slot.activityKey}`),
              },
            ])),
          },
        ])),
      } : {}),
    },
  });
};

export const createFullPdfPublicationCommandPlan = (
  input: FullPdfPublicationCommandInput,
): BookAssemblyPublicationAdapterPlan => createFullPdfPublicationCommandOutput(input).plan;
