import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from './unitAssembly.types';
import type {
  BookAssemblyManifestCandidate,
  BookAssemblyPreviewApprovalReference,
  BookAssemblyPublicationAdapterPlan,
  BookAssemblyPublicationAtomicWriteSet,
  BookSourceVersionAuthority,
  SourceQualifiedPageIdentity,
} from '../../types/bookAssembly.types';
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

export interface FullPdfPublicationIds {
  readonly planId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly unitProjectionId: string;
  readonly deliveryPlanId: string;
  readonly activitiesByKey: Readonly<Record<string, FullPdfActivityPublicationIds>>;
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

const createPublicationRecords = (
  input: CreateFullPdfPublicationAdapterPlanInput,
  manifest: BookAssemblyManifestCandidate,
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
  const activityVersions = [];
  const activitySafeProjections = [];
  const placements = [];
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
      const canonicalWithoutFingerprint: CanonicalPublishedActivityVersionRecordWithoutPayloadFingerprint = {
        schemaVersion: 1,
        lifecycle: 'published',
        activityId: ids.activityId,
        activityVersionId: ids.activityVersionId,
        activityVersion: ids.activityVersion,
        ownerId: input.ownerId,
        activity: payload.activity,
        projection: projectStudentActivity(payload.activity),
        ...(lineage?.lastActivityVersionId === undefined
          ? {}
          : { predecessorActivityVersionId: lineage.lastActivityVersionId }),
        placementIds: [ids.placementId],
        evidenceRefs: [],
        sourceContextFingerprint: fingerprint(sourcePages),
        createdByOperationId: input.operationId,
        publishedAt: input.now,
        provenance: {
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
  const sourcePages = [...allPages.values()].sort((left, right) =>
    left.sourceKey.localeCompare(right.sourceKey) || left.physicalPageNumber - right.physicalPageNumber);
  return {
    canonicalActivityVersions,
    atomicWrites: {
      activityVersions,
      activitySafeProjections,
      placements,
      unitProjections: [{
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
      }],
      deliveryPlans: [{
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
      }],
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
  const selectedManifest: BookAssemblyManifestCandidate = {
    ...manifest,
    units: [unit],
  };
  const records = createPublicationRecords(input, manifest);
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
        units: [unit],
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
  const publicationId = input.allocateId('publication', input.candidate.candidateId);
  const publicationRevision = 1;
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
        const activityId = lineage?.activityId ?? input.allocateId('activity', slot.activityKey);
        return [slot.activityKey, {
          activityId,
          activityVersionId: input.allocateId('activity-version', slot.activityKey),
          activityVersion: (lineage?.lastActivityVersion ?? 0) + 1,
          projectionId: input.allocateId('activity-projection', slot.activityKey),
          placementId: input.allocateId('placement', slot.activityKey),
        }];
      })),
    },
  });
};

export const createFullPdfPublicationCommandPlan = (
  input: FullPdfPublicationCommandInput,
): BookAssemblyPublicationAdapterPlan => createFullPdfPublicationCommandOutput(input).plan;
