// Reading V2 result boundary: creates version-bound result artifacts for existing result/feedback shells.
export {
  buildReadingV2GroupedReviewPayload,
  buildReadingV2RegradePersistencePlan,
  buildReadingV2ResultPersistencePlan,
  buildReadingV2SavedResultRecord,
  captureReadingV2Attempt,
  createReadingV2RegradeArtifact,
  isReadingV2SavedResult,
  sanitizeReadingV2ResultForReleasePolicy,
  READING_V2_RESULT_OPERATIONAL_STATES,
  type ReadingV2GroupedReviewPayload,
  type ReadingV2ReleasePolicy,
  type ReadingV2RegradePersistencePlan,
  type ReadingV2ResultOperationalState,
  type ReadingV2ResultPersistencePlan,
  type ReadingV2ReviewInteraction,
  type ReadingV2ReviewTaskGroup,
} from './readingV2ResultAdapter.service';

export {
  persistReadingV2ResultPlanCanonicalFirst,
  processReadingV2TrustedSubmission,
  type ReadingV2TrustedRuntimeSubmitAnswer,
  type ReadingV2TrustedPlanPersistenceWriter,
  type ReadingV2TrustedRuntimeSubmitPayload,
  type ReadingV2TrustedSubmissionContext,
  type ReadingV2TrustedSubmissionDependencies,
  type ReadingV2TrustedSubmissionResult,
} from './readingV2TrustedSubmissionProcessor.service';
