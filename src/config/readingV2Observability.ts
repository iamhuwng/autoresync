import { FEATURE_IDS, FEATURE_REGISTRY } from './featureRegistry';

export type ReadingV2ObservabilityOutcome =
  | 'requested'
  | 'success'
  | 'blocked'
  | 'failure';

export type ReadingV2ObservabilityOwner =
  | typeof FEATURE_IDS.readingV2Studio
  | typeof FEATURE_IDS.testTaking
  | typeof FEATURE_IDS.results;

export interface ReadingV2ObservabilityEvent {
  readonly eventName: string;
  readonly featureId: ReadingV2ObservabilityOwner;
  readonly actionName: string;
  readonly owner: 'studio' | 'runtime' | 'result-shell';
  readonly requiredProperties: readonly string[];
  readonly allowedOutcomes: readonly ReadingV2ObservabilityOutcome[];
  readonly privacySafeIdentifiers: readonly string[];
}

export const READING_V2_OBSERVABILITY_EVENTS: readonly ReadingV2ObservabilityEvent[] = [
  {
    eventName: 'reading_v2_studio_create',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'startBlankMaterial',
    owner: 'studio',
    requiredProperties: ['mode', 'host', 'outcome'],
    allowedOutcomes: ['requested', 'success', 'failure'],
    privacySafeIdentifiers: ['draftId', 'materialId'],
  },
  {
    eventName: 'reading_v2_studio_import',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'importMaterial',
    owner: 'studio',
    requiredProperties: ['mode', 'host', 'outcome'],
    allowedOutcomes: ['requested', 'success', 'blocked', 'failure'],
    privacySafeIdentifiers: ['draftId', 'materialId'],
  },
  {
    eventName: 'reading_v2_studio_metadata_edit',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'metadataEdit',
    owner: 'studio',
    requiredProperties: ['mode', 'host', 'outcome'],
    allowedOutcomes: ['requested', 'success', 'failure'],
    privacySafeIdentifiers: ['draftId', 'materialId'],
  },
  {
    eventName: 'reading_v2_studio_save',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'saveDraft',
    owner: 'studio',
    requiredProperties: ['mode', 'host', 'revisionToken', 'outcome'],
    allowedOutcomes: ['requested', 'success', 'blocked', 'failure'],
    privacySafeIdentifiers: ['draftId', 'materialId', 'revisionToken'],
  },
  {
    eventName: 'reading_v2_studio_validate',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'validate',
    owner: 'studio',
    requiredProperties: ['mode', 'host', 'outcome'],
    allowedOutcomes: ['requested', 'success', 'blocked', 'failure'],
    privacySafeIdentifiers: ['draftId', 'materialId'],
  },
  {
    eventName: 'reading_v2_studio_preview',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'preview',
    owner: 'studio',
    requiredProperties: ['mode', 'host', 'outcome'],
    allowedOutcomes: ['requested', 'success', 'blocked', 'failure'],
    privacySafeIdentifiers: ['draftId', 'materialId'],
  },
  {
    eventName: 'reading_v2_studio_publish',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'publish',
    owner: 'studio',
    requiredProperties: ['mode', 'host', 'outcome'],
    allowedOutcomes: ['requested', 'success', 'blocked', 'failure'],
    privacySafeIdentifiers: ['draftId', 'materialId'],
  },
  {
    eventName: 'reading_v2_studio_extract',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'extract',
    owner: 'studio',
    requiredProperties: ['mode', 'host', 'outcome'],
    allowedOutcomes: ['requested', 'success', 'blocked', 'failure'],
    privacySafeIdentifiers: ['draftId', 'materialId', 'taskGroupId'],
  },
  {
    eventName: 'reading_v2_runtime_launch',
    featureId: FEATURE_IDS.testTaking,
    actionName: 'launchReadingV2Runtime',
    owner: 'runtime',
    requiredProperties: ['surface', 'materialId', 'projectionKind', 'outcome'],
    allowedOutcomes: ['success', 'blocked', 'failure'],
    privacySafeIdentifiers: ['materialId', 'projectionId', 'sourceSnapshotVersionId'],
  },
  {
    eventName: 'reading_v2_runtime_submit',
    featureId: FEATURE_IDS.testTaking,
    actionName: 'submitReadingV2Attempt',
    owner: 'runtime',
    requiredProperties: ['materialId', 'projectionId', 'sourceSnapshotVersionId', 'outcome'],
    allowedOutcomes: ['requested', 'success', 'blocked', 'failure'],
    privacySafeIdentifiers: ['materialId', 'projectionId', 'sourceSnapshotVersionId', 'attemptId'],
  },
  {
    eventName: 'reading_v2_result_review',
    featureId: FEATURE_IDS.results,
    actionName: 'openReadingV2Review',
    owner: 'result-shell',
    requiredProperties: ['resultId', 'sourceSnapshotVersionId', 'viewerRole', 'outcome'],
    allowedOutcomes: ['success', 'blocked', 'failure'],
    privacySafeIdentifiers: ['resultId', 'sourceSnapshotVersionId'],
  },
  {
    eventName: 'reading_v2_result_feedback',
    featureId: FEATURE_IDS.results,
    actionName: 'submitReadingV2Feedback',
    owner: 'result-shell',
    requiredProperties: ['resultId', 'viewerRole', 'outcome'],
    allowedOutcomes: ['requested', 'success', 'blocked', 'failure'],
    privacySafeIdentifiers: ['resultId'],
  },
  {
    eventName: 'reading_v2_result_regrade',
    featureId: FEATURE_IDS.results,
    actionName: 'createReadingV2Regrade',
    owner: 'result-shell',
    requiredProperties: ['resultId', 'regradeId', 'outcome'],
    allowedOutcomes: ['requested', 'success', 'blocked', 'failure'],
    privacySafeIdentifiers: ['resultId', 'regradeId'],
  },
  {
    eventName: 'reading_v2_operational_error',
    featureId: FEATURE_IDS.results,
    actionName: 'readingV2OperationalError',
    owner: 'result-shell',
    requiredProperties: ['surface', 'state', 'outcome'],
    allowedOutcomes: ['blocked', 'failure'],
    privacySafeIdentifiers: ['materialId', 'resultId', 'projectionId'],
  },
  {
    eventName: 'canonical_anchor_guard_failed',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'canonicalAnchorGuardFailed',
    owner: 'studio',
    requiredProperties: ['outcome', 'issueCode'],
    allowedOutcomes: ['blocked', 'failure'],
    privacySafeIdentifiers: ['importAttemptId', 'sourceTitleSlug', 'stimulusId'],
  },
  {
    eventName: 'duplicate_structured_layout_question',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'duplicateStructuredLayoutQuestion',
    owner: 'studio',
    requiredProperties: ['outcome', 'issueCode', 'layoutKind', 'questionNumber'],
    allowedOutcomes: ['blocked'],
    privacySafeIdentifiers: ['importAttemptId', 'sourceTitleSlug', 'passageNumber', 'instructionIndex', 'stimulusId'],
  },
  {
    eventName: 'structured_layout_anchor_cardinality_mismatch',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'structuredLayoutAnchorCardinalityMismatch',
    owner: 'studio',
    requiredProperties: ['outcome', 'issueCode', 'layoutKind'],
    allowedOutcomes: ['blocked'],
    privacySafeIdentifiers: ['importAttemptId', 'sourceTitleSlug', 'passageNumber', 'instructionIndex', 'stimulusId'],
  },
  {
    eventName: 'studio_import_candidate_rejected',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'studioImportCandidateRejected',
    owner: 'studio',
    requiredProperties: ['outcome', 'issueCode'],
    allowedOutcomes: ['blocked', 'failure'],
    privacySafeIdentifiers: ['importAttemptId', 'sourceTitleSlug', 'materialId', 'draftId', 'stimulusId'],
  },
  {
    eventName: 'publish_canonical_validation_blocked',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'publishCanonicalValidationBlocked',
    owner: 'studio',
    requiredProperties: ['outcome', 'issueCode'],
    allowedOutcomes: ['blocked'],
    privacySafeIdentifiers: ['materialId', 'sourceTitleSlug', 'stimulusId'],
  },
  {
    eventName: 'passage_extraction_canonical_validation_blocked',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'passageExtractionCanonicalValidationBlocked',
    owner: 'studio',
    requiredProperties: ['outcome', 'issueCode'],
    allowedOutcomes: ['blocked'],
    privacySafeIdentifiers: ['materialId', 'sourceTitleSlug', 'passageNumber', 'stimulusId'],
  },
  {
    eventName: 'backfill_canonical_validation_blocked',
    featureId: FEATURE_IDS.readingV2Studio,
    actionName: 'backfillCanonicalValidationBlocked',
    owner: 'studio',
    requiredProperties: ['outcome', 'issueCode'],
    allowedOutcomes: ['blocked'],
    privacySafeIdentifiers: ['materialId', 'sourceTitleSlug', 'stimulusId'],
  },
] as const;

const registeredActionsByFeature = new Map(
  FEATURE_REGISTRY.map((feature) => [feature.id, new Set(feature.actions)]),
);

export const assertReadingV2ObservabilityCatalogRegistered = (): void => {
  const missing = READING_V2_OBSERVABILITY_EVENTS.filter((event) => {
    const actions = registeredActionsByFeature.get(event.featureId);
    return !actions?.has(event.actionName);
  });

  if (missing.length > 0) {
    throw new Error(
      `Reading V2 observability catalog has unregistered actions: ${missing
        .map((event) => `${event.featureId}.${event.actionName}`)
        .join(', ')}`,
    );
  }
};
