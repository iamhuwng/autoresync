import type {
  FeedbackTiming,
  BookHomeworkActivityBinding,
  BookHomeworkManifest,
} from '../../types/homework.types';
import type { BookRuntimeDeliveryProjection } from '../book-delivery/bookDelivery.types';
import {
  assertValidBookHomeworkManifest,
  type BookHomeworkExcludedActivityCandidate,
} from './bookHomeworkManifest.service';
export type { BookHomeworkScheduleDraft } from './bookHomeworkSchedule.service';
import type {
  BookHomeworkDeadlineMutationIntent,
  BookHomeworkScheduleDraft,
} from './bookHomeworkSchedule.service';

export type BookHomeworkIntent = 'accountable' | 'practice';
export type BookHomeworkFeedbackRelease = FeedbackTiming | 'manual';

export interface BookHomeworkManifestIdentity {
  readonly manifestVersionId: string;
  readonly ownerId: string;
  readonly createdByCommandId: string;
  readonly createdAt: string;
  readonly bindingRevision: number;
}

export interface BookHomeworkActivityPolicy {
  readonly placementId: string;
  readonly maxAttempts: number | null;
  readonly feedbackRelease: BookHomeworkFeedbackRelease;
  readonly lateSubmissionAllowed: boolean;
}

export interface BookHomeworkPolicyDraft {
  readonly intent: BookHomeworkIntent;
  readonly integrityCapture: boolean;
  readonly integrityOverride: boolean;
  readonly activityPolicies: readonly BookHomeworkActivityPolicy[];
}

export interface BookHomeworkPreviewSource {
  readonly delivery: BookRuntimeDeliveryProjection;
  readonly identity: BookHomeworkManifestIdentity;
  readonly initialSchedule?: BookHomeworkScheduleDraft;
  readonly bookTitle?: string;
  readonly initialTarget?: BookHomeworkManifest['selectedTarget'];
  readonly excludedActivities?: readonly BookHomeworkExcludedActivityCandidate[];
  readonly priorResultAccess?: boolean;
  readonly soloAccess?: boolean;
}

export type BookHomeworkPreviewWarningCode =
  | 'full-pdf-complete-exposure'
  | 'component-broader-than-scope'
  | 'unsupported-content'
  | 'missing-source-readiness'
  | 'prior-feedback-risk'
  | 'no-delivery-source';

export interface BookHomeworkPreviewWarning {
  readonly code: BookHomeworkPreviewWarningCode;
  readonly severity: 'warning' | 'blocker';
  readonly message: string;
}

export interface BookHomeworkSourceSummary {
  readonly strategy: BookRuntimeDeliveryProjection['sourceSet']['strategy'];
  readonly sources: readonly {
    readonly sourceKey: string;
    readonly sourceVersionId: string;
    readonly ownerNodeKey?: string;
  }[];
}

export interface BookHomeworkPreviewModel {
  readonly manifest: BookHomeworkManifest;
  readonly policy: BookHomeworkPolicyDraft;
  readonly sourceSummary: BookHomeworkSourceSummary;
  readonly warnings: readonly BookHomeworkPreviewWarning[];
  readonly canConfirm: boolean;
}

export interface BookHomeworkPreviewDraft {
  readonly manifest: BookHomeworkManifest;
  readonly policy: BookHomeworkPolicyDraft;
  readonly schedule: BookHomeworkScheduleDraft;
  readonly deadlineMutationIntents: readonly BookHomeworkDeadlineMutationIntent[];
  readonly warnings: readonly BookHomeworkPreviewWarning[];
}

const FEEDBACK_RELEASES: readonly BookHomeworkFeedbackRelease[] = [
  'immediate',
  'after_completion',
  'after_deadline',
  'never',
  'manual',
];

const freeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => freeze((value as Record<PropertyKey, unknown>)[key]));
  }
  return value;
};

const selectedNodeKeys = (manifest: BookHomeworkManifest): ReadonlySet<string> =>
  new Set(manifest.outline.map((node) => node.nodeKey));

export const createDefaultBookHomeworkPolicy = (
  manifest: BookHomeworkManifest,
  intent: BookHomeworkIntent = 'accountable',
): BookHomeworkPolicyDraft => freeze({
  intent,
  integrityCapture: intent === 'accountable',
  integrityOverride: false,
  activityPolicies: manifest.bindings
    .filter((binding): binding is Extract<BookHomeworkActivityBinding, { state: 'required' }> => binding.state === 'required')
    .sort((left, right) => left.order - right.order || left.placementId.localeCompare(right.placementId))
    .map((binding) => ({
      placementId: binding.placementId,
      maxAttempts: null,
      feedbackRelease: 'after_completion' as const,
      lateSubmissionAllowed: false,
    })),
});

const assertPolicy = (
  manifest: BookHomeworkManifest,
  policy: BookHomeworkPolicyDraft,
): void => {
  if (!['accountable', 'practice'].includes(policy.intent)) throw new Error('Book Homework intent is invalid.');
  if (typeof policy.integrityCapture !== 'boolean' || typeof policy.integrityOverride !== 'boolean') {
    throw new Error('Book Homework integrity policy is invalid.');
  }
  const required = manifest.bindings.filter((binding) => binding.state === 'required');
  const policies = new Map(policy.activityPolicies.map((entry) => [entry.placementId, entry]));
  if (policies.size !== policy.activityPolicies.length || policies.size !== required.length) {
    throw new Error('Book Homework requires exactly one policy per required Activity.');
  }
  required.forEach((binding) => {
    const entry = policies.get(binding.placementId);
    if (!entry || entry.placementId !== binding.placementId) throw new Error('Book Homework Activity policy is incomplete.');
    if (entry.maxAttempts !== null && (!Number.isSafeInteger(entry.maxAttempts) || entry.maxAttempts < 1)) {
      throw new Error('Book Homework Activity attempts must be positive or unlimited.');
    }
    if (!FEEDBACK_RELEASES.includes(entry.feedbackRelease)) throw new Error('Book Homework feedback policy is invalid.');
    if (typeof entry.lateSubmissionAllowed !== 'boolean') throw new Error('Book Homework late policy is invalid.');
  });
};

export const buildBookHomeworkPreview = (input: {
  readonly source: BookHomeworkPreviewSource;
  readonly manifest: BookHomeworkManifest;
  readonly policy: BookHomeworkPolicyDraft;
}): BookHomeworkPreviewModel => {
  const { delivery, priorResultAccess = false, soloAccess = false } = input.source;
  assertValidBookHomeworkManifest(input.manifest);
  assertPolicy(input.manifest, input.policy);
  if (input.manifest.book.bookId !== delivery.book.bookId
    || input.manifest.book.publicationId !== delivery.book.publicationId
    || input.manifest.book.publicationRevision !== delivery.book.publicationRevision) {
    throw new Error('Book Homework preview is not pinned to the current Delivery publication.');
  }

  const warnings: BookHomeworkPreviewWarning[] = [];
  const sourceSummary: BookHomeworkSourceSummary = {
    strategy: delivery.sourceSet.strategy,
    sources: delivery.sourceSet.sources.map((source) => ({
      sourceKey: source.sourceKey,
      sourceVersionId: source.sourceVersionId,
      ...(source.ownerNodeKey === undefined ? {} : { ownerNodeKey: source.ownerNodeKey }),
    })),
  };

  if (sourceSummary.sources.length === 0) {
    warnings.push({
      code: 'no-delivery-source',
      severity: 'blocker',
      message: 'No published Book source is available for this Delivery projection.',
    });
  } else if (sourceSummary.strategy === 'full_pdf') {
    warnings.push({
      code: 'full-pdf-complete-exposure',
      severity: 'warning',
      message: 'Full-PDF delivery exposes the complete published PDF, not only the selected Activity pages.',
    });
  }

  const nodes = selectedNodeKeys(input.manifest);
  if (sourceSummary.strategy === 'component_pdfs') {
    const target = input.manifest.selectedTarget;
    sourceSummary.sources.forEach((source) => {
      const broader = target.kind === 'activity'
        || source.ownerNodeKey === undefined
        || !nodes.has(source.ownerNodeKey);
      if (broader) {
        warnings.push({
          code: 'component-broader-than-scope',
          severity: 'warning',
          message: `Component ${source.sourceKey} is broader than the selected structural scope; students may receive the full delivered component.`,
        });
      }
    });
  }

  const excluded = input.manifest.bindings.filter((binding) => binding.state === 'excluded');
  if (excluded.length > 0) {
    warnings.push({
      code: 'unsupported-content',
      severity: 'blocker',
      message: `${excluded.length} selected Activity${excluded.length === 1 ? '' : 'ies'} cannot be delivered safely and will not be assignable.`,
    });
  }

  const unavailable = input.manifest.bindings.filter((binding) =>
    binding.state === 'required'
    && binding.contextMode !== 'none'
    && binding.sourceReadiness !== 'ready');
  if (unavailable.length > 0) {
    warnings.push({
      code: 'missing-source-readiness',
      severity: 'blocker',
      message: `${unavailable.length} required Activity${unavailable.length === 1 ? '' : 'ies'} lack ready student-safe source context.`,
    });
  }

  const delayedFeedback = input.policy.activityPolicies.some((entry) => entry.feedbackRelease !== 'immediate');
  if (delayedFeedback && (priorResultAccess || soloAccess)) {
    warnings.push({
      code: 'prior-feedback-risk',
      severity: 'warning',
      message: 'Delayed or manual feedback may reveal answers through Solo or prior-result access. Fork before assigning if the existing result must remain isolated.',
    });
  }

  return freeze({
    manifest: input.manifest,
    policy: input.policy,
    sourceSummary,
    warnings,
    canConfirm: warnings.every((warning) => warning.severity !== 'blocker'),
  });
};

export const findBookHomeworkActivityPolicy = (
  policy: BookHomeworkPolicyDraft,
  placementId: string,
): BookHomeworkActivityPolicy | undefined => policy.activityPolicies.find((entry) => entry.placementId === placementId);

export const updateBookHomeworkActivityPolicy = (
  policy: BookHomeworkPolicyDraft,
  placementId: string,
  update: Partial<Omit<BookHomeworkActivityPolicy, 'placementId'>>,
): BookHomeworkPolicyDraft => {
  if (!placementId) throw new Error('Book Homework Activity policy requires a placement ID.');
  return freeze({
    ...policy,
    activityPolicies: policy.activityPolicies.map((entry) =>
      entry.placementId === placementId ? { ...entry, ...update } : entry),
  });
};
