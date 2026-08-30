import { projectStudentActivity } from '../book-activity/activityProjection.service';
import type {
  NormalizedActivity,
  StudentActivityProjection,
} from '../../types/bookActivity.types';
import type {
  BookAssemblyPreviewApprovalReference,
  BookUnitCandidate,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import type { BookAssemblyCandidateRecord } from './unitAssembly.types';
import type { BookRuntimeCandidatePreviewProjection } from '../book-delivery/bookDelivery.types';

export type UnitPreviewFailureCode =
  | 'candidate-not-previewable'
  | 'candidate-unit-mismatch'
  | 'source-not-previewable'
  | 'activity-missing'
  | 'activity-context-mismatch'
  | 'activity-projection-invalid'
  | 'approval-invalid';

export class UnitPreviewError extends Error {
  constructor(readonly code: UnitPreviewFailureCode, message: string) {
    super(message);
    this.name = 'UnitPreviewError';
  }
}

export interface UnitPreviewActivity {
  readonly activityKey: string;
  readonly projection: StudentActivityProjection;
  readonly sourceContext: {
    readonly available: boolean;
    readonly description: string;
  };
}

/** Candidate-scoped, answer-safe input for the shared runtime frame. */
export interface CandidateUnitPreviewProjection {
  readonly bookId: string;
  /** Current Book authority revision that was read when the candidate was previewed. */
  readonly bookRevision: number;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly sourceSetRevision: number;
  readonly unitKey: string;
  readonly registryVersion: string;
  readonly activities: readonly UnitPreviewActivity[];
  /** Absent only on stale pre-upgrade fixtures/responses; the UI fails closed. */
  readonly runtime?: BookRuntimeCandidatePreviewProjection;
}

/** Stored by the trusted preview boundary; never a student entitlement. */
export interface BookAssemblyPreviewApprovalRecord extends BookAssemblyPreviewApprovalReference {
  readonly actorId: string;
  readonly bookId: string;
  readonly bookRevision: number;
  readonly unitKey: string;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly sourceSetRevision: number;
  readonly registryVersion: string;
  readonly inputFingerprint: string;
  /** Trusted server-only fingerprints of the full answer-bearing Activity payloads. */
  readonly canonicalActivityFingerprintsByKey: Readonly<Record<string, string>>;
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
  let hash = 0xcbf29ce484222325n;
  for (const character of stable(value)) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
};

export const canonicalActivityPayloadFingerprint = (
  activity: NormalizedActivity,
): string => fingerprint(activity);

const nonEmpty = (value: string): boolean => value.trim().length > 0;

const selectedUnit = (candidate: BookAssemblyCandidateRecord): BookUnitCandidate => {
  if (
    candidate.lifecycle !== 'validated' ||
    !candidate.validation.valid ||
    !candidate.manifest
  ) {
    throw new UnitPreviewError('candidate-not-previewable', 'Candidate must be current and validated before preview.');
  }
  const unit = candidate.manifest.units.find((entry) => entry.unitKey === candidate.unitKey);
  if (!unit) {
    throw new UnitPreviewError('candidate-unit-mismatch', 'Candidate does not contain its selected Unit.');
  }
  return unit;
};

const sourceDescription = (unit: BookUnitCandidate, activityKey: string): string => {
  const sourcePages = unit.pageGroups
    .filter((group) => group.activityKeys.includes(activityKey))
    .flatMap((group) => group.pages.map((page) => `${group.sourceKey} page ${page}`));
  return sourcePages.length > 0
    ? `Candidate source context: ${sourcePages.join(', ')}.`
    : 'Candidate source context is not required for this Activity.';
};

const runtimeProjection = (
  candidate: BookAssemblyCandidateRecord,
  unit: BookUnitCandidate,
): BookRuntimeCandidatePreviewProjection => {
  const manifest = candidate.manifest!;
  const selectedSources = manifest.sourceSet.sources.filter((source) => (
    manifest.sourceSet.sourceStrategy === 'full_pdf'
    || unit.pageGroups.some((group) => group.sourceKey === source.sourceKey)
  ));
  const sourceScopes = new Map(selectedSources.map((source) => {
    const pages = unit.pageGroups
      .filter((group) => group.sourceKey === source.sourceKey)
      .flatMap((group) => group.pages);
    return [source.sourceKey, [...new Set(pages)].sort((left, right) => left - right)] as const;
  }));
  const sources = selectedSources
    .slice()
    .sort((left, right) => left.sourceOrder - right.sourceOrder || left.sourceKey.localeCompare(right.sourceKey))
    .map((source, index) => ({
      sourceKey: source.sourceKey,
      sourceVersionId: source.sourceVersionId,
      lifecycle: 'verified-usable' as const,
      sourceOrder: index + 1,
      ...('ownerNodeKey' in source ? { ownerNodeKey: source.ownerNodeKey } : {}),
      localPageScope: manifest.sourceSet.sourceStrategy === 'full_pdf'
        ? { kind: 'all' as const, pages: [] }
        : { kind: 'pages' as const, pages: sourceScopes.get(source.sourceKey) ?? [] },
    }));
  const requests = sources.map((source) => ({
    sourceKey: source.sourceKey,
    sourceVersionId: source.sourceVersionId,
    opaqueRouteKey: source.sourceKey,
    localPageScope: source.localPageScope,
  }));
  const placements = unit.activitySlots
    .slice()
    .sort((left, right) => left.order - right.order || left.activityKey.localeCompare(right.activityKey))
    .map((slot) => {
      const groups = slot.pageGroupKeys
        .map((key) => unit.pageGroups.find((group) => group.pageGroupKey === key))
        .filter((group): group is NonNullable<typeof group> => group !== undefined);
      return {
        placementId: `${candidate.candidateId}:${slot.activityKey}`,
        activityId: slot.activityKey,
        nodeKey: slot.pageGroupKeys[0] ?? unit.unitKey,
        order: slot.order,
        contextMode: slot.contextRequirement,
        sourceContext: {
          available: groups.length > 0,
          description: sourceDescription(unit, slot.activityKey),
          pageGroupKeys: slot.pageGroupKeys,
          sourcePageScopes: groups.map((group) => ({ sourceKey: group.sourceKey, pages: group.pages })),
        },
      };
    });
  return Object.freeze({
    schemaVersion: 1,
    projectionKind: 'book-runtime-candidate-preview',
    candidateId: candidate.candidateId,
    candidateRevision: candidate.revision,
    sourceSetRevision: candidate.sourceSetRevision,
    unitKey: unit.unitKey,
    book: { bookId: candidate.bookId, bookMode: 'pdf' as const, bookRevision: candidate.bookRevision },
    context: {
      contextId: candidate.candidateId,
      kind: 'preview' as const,
      entitlementBasis: 'candidate-preview' as const,
    },
    outline: Object.freeze(manifest.nodes.map((node) => ({ ...node }))),
    sourceSet: { strategy: manifest.sourceSet.sourceStrategy, sources: Object.freeze(sources) },
    documentRequests: Object.freeze(requests),
    activities: Object.freeze(placements),
    actionFlags: { canAutosave: false, canSubmit: false, canReview: false },
  });
};

export const createCandidateUnitPreview = (input: {
  readonly candidate: BookAssemblyCandidateRecord;
  readonly sourceVersions: readonly TrustedBookSourceVersionProjection[];
  /** Explicit student-safe/readiness decision from trusted caller; no default allow. */
  readonly sourceIsPreviewReady: (source: TrustedBookSourceVersionProjection) => boolean;
  readonly activitiesByKey: Readonly<Record<string, NormalizedActivity>>;
  readonly registryVersion: string;
}): CandidateUnitPreviewProjection => {
  if (!nonEmpty(input.registryVersion)) {
    throw new UnitPreviewError('activity-projection-invalid', 'Preview requires a renderer registry version.');
  }
  const unit = selectedUnit(input.candidate);
  const sourceById = new Map(input.sourceVersions.map((source) => [source.sourceVersionId, source]));
  for (const source of input.candidate.manifest!.sourceSet.sources) {
    const authority = sourceById.get(source.sourceVersionId);
    if (!authority || authority.bookId !== input.candidate.bookId || !authority.verifiedUsable || !input.sourceIsPreviewReady(authority)) {
      throw new UnitPreviewError('source-not-previewable', 'Candidate source is not ready for preview.');
    }
  }
  const activities = unit.activitySlots
    .slice()
    .sort((left, right) => left.order - right.order || left.activityKey.localeCompare(right.activityKey))
    .map((slot): UnitPreviewActivity => {
      const activity = input.activitiesByKey[slot.activityKey];
      if (!activity) {
        throw new UnitPreviewError('activity-missing', `Activity ${slot.activityKey} is unavailable for preview.`);
      }
      if (activity.contextRequirement.mode !== slot.contextRequirement) {
        throw new UnitPreviewError('activity-context-mismatch', `Activity ${slot.activityKey} context does not match its Unit slot.`);
      }
      try {
        return {
          activityKey: slot.activityKey,
          projection: projectStudentActivity(activity),
          sourceContext: {
            available: slot.contextRequirement !== 'required' || slot.pageGroupKeys.length > 0,
            description: sourceDescription(unit, slot.activityKey),
          },
        };
      } catch {
        throw new UnitPreviewError('activity-projection-invalid', `Activity ${slot.activityKey} could not form a safe preview.`);
      }
    });
  return Object.freeze({
    bookId: input.candidate.bookId,
    bookRevision: input.candidate.bookRevision,
    candidateId: input.candidate.candidateId,
    candidateRevision: input.candidate.revision,
    sourceSetRevision: input.candidate.sourceSetRevision,
    unitKey: unit.unitKey,
    registryVersion: input.registryVersion,
    activities: Object.freeze(activities),
    runtime: runtimeProjection(input.candidate, unit),
  });
};

export const previewInputFingerprint = (preview: CandidateUnitPreviewProjection): string => fingerprint(preview);

export const createPreviewApproval = (input: {
  readonly approvalId: string;
  readonly approvalRevision: number;
  readonly actorId: string;
  readonly approvedAt: string;
  readonly expiresAt: string;
  readonly preview: CandidateUnitPreviewProjection;
  readonly canonicalActivitiesByKey: Readonly<Record<string, NormalizedActivity>>;
}): BookAssemblyPreviewApprovalRecord => {
  const approvedAt = Date.parse(input.approvedAt);
  const expiresAt = Date.parse(input.expiresAt);
  const bookRevision = input.preview.bookRevision;
  const activityKeys = input.preview.activities.map((activity) => activity.activityKey);
  const canonicalActivityKeys = Object.keys(input.canonicalActivitiesByKey);
  if (
    !nonEmpty(input.approvalId) || !nonEmpty(input.actorId) ||
    !Number.isSafeInteger(input.approvalRevision) || input.approvalRevision < 1 ||
    typeof bookRevision !== 'number' || !Number.isSafeInteger(bookRevision) || bookRevision < 1 ||
    Number.isNaN(approvedAt) || Number.isNaN(expiresAt) || expiresAt <= approvedAt ||
    canonicalActivityKeys.length !== activityKeys.length ||
    activityKeys.some((activityKey) => input.canonicalActivitiesByKey[activityKey] === undefined) ||
    canonicalActivityKeys.some((activityKey) => !activityKeys.includes(activityKey))
  ) {
    throw new UnitPreviewError('approval-invalid', 'Preview approval identity, binding, fingerprint, or expiry is invalid.');
  }
  const canonicalActivityFingerprintsByKey = Object.freeze(Object.fromEntries(
    canonicalActivityKeys
      .sort()
      .map((activityKey) => [
        activityKey,
        canonicalActivityPayloadFingerprint(input.canonicalActivitiesByKey[activityKey]!),
      ]),
  ));
  return Object.freeze({
    approvalId: input.approvalId,
    approvalRevision: input.approvalRevision,
    actorId: input.actorId,
    approvedAt: input.approvedAt,
    expiresAt: input.expiresAt,
    bookId: input.preview.bookId,
    bookRevision,
    unitKey: input.preview.unitKey,
    candidateId: input.preview.candidateId,
    candidateRevision: input.preview.candidateRevision,
    sourceSetRevision: input.preview.sourceSetRevision,
    registryVersion: input.preview.registryVersion,
    inputFingerprint: previewInputFingerprint(input.preview),
    canonicalActivityFingerprintsByKey,
  });
};
