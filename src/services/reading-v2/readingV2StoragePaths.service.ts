import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';

export const READING_V2_STORAGE_NAMESPACE = 'reading_v2';

export type ReadingV2StoragePathClass =
  | 'drafts'
  | 'passageAssets'
  | 'passageAssetVersions'
  | 'taskGroupMaterials'
  | 'fullTests'
  | 'readingPassageMaterials'
  | 'readingPassageMaterialVersions'
  | 'fullTestCompositions'
  | 'fullTestCompositionVersions'
  | 'materialMetadata'
  | 'listingIndexes'
  | 'relationshipIndexes'
  | 'publishedSnapshots'
  | 'previewPayloads'
  | 'studentSafeTests'
  | 'sessionSafePayloads'
  | 'assignmentPayloads'
  | 'reviewProjections'
  | 'attempts'
  | 'results'
  | 'regradeArtifacts'
  | 'reviewIndexes'
  | 'analyticsOutputs'
  | 'provenance'
  | 'whereUsedGraph'
  | 'publishCommits';

const namespaced = (path: string): string => `${READING_V2_STORAGE_NAMESPACE}/${path}`;

export const readingV2StoragePaths = {
  drafts: (draftId: string): string => namespaced(`drafts/${draftId}`),
  passageAssets: (assetId: string): string => namespaced(`passage_assets/${assetId}`),
  passageAssetVersions: (assetId: string, versionId: string): string =>
    namespaced(`passage_assets/${assetId}/versions/${versionId}`),
  taskGroupMaterials: (materialId: string): string =>
    namespaced(`task_group_materials/${materialId}`),
  fullTests: (fullTestId: string): string => namespaced(`full_tests/${fullTestId}`),
  readingPassageMaterials: (materialId: string): string =>
    namespaced(`reading_passage_materials/${materialId}`),
  readingPassageMaterialVersions: (materialId: string, versionId: string): string =>
    namespaced(`reading_passage_material_versions/${materialId}/${versionId}`),
  fullTestCompositions: (compositionId: string): string =>
    namespaced(`full_test_compositions/${compositionId}`),
  fullTestCompositionVersions: (compositionId: string, versionId: string): string =>
    namespaced(`full_test_composition_versions/${compositionId}/${versionId}`),
  materialMetadata: (materialId: string): string => namespaced(`material_metadata/${materialId}`),
  listingIndexes: (surface: string, materialId: string): string =>
    namespaced(`listing_indexes/${surface}/${materialId}`),
  relationshipIndexes: (surface: string, materialId: string): string =>
    namespaced(`relationship_indexes/${surface}/${materialId}`),
  publishedSnapshots: (materialId: string, snapshotVersionId: string): string =>
    namespaced(`published_snapshots/${materialId}/${snapshotVersionId}`),
  previewPayloads: (draftId: string): string => namespaced(`projections/preview/${draftId}`),
  studentSafeTests: (materialId: string, snapshotVersionId = 'current'): string =>
    namespaced(`projections/student_safe_tests/${materialId}:${snapshotVersionId}`),
  sessionSafePayloads: (sessionCode: string, snapshotVersionId = 'current'): string =>
    namespaced(`projections/session_test_payloads/${sessionCode}:${snapshotVersionId}`),
  assignmentPayloads: (homeworkId: string, compositionVersionId: string): string =>
    namespaced(`projections/assignment_payloads/${homeworkId}:${compositionVersionId}`),
  reviewProjections: (materialId: string, snapshotVersionId: string): string =>
    namespaced(`projections/review/${materialId}:${snapshotVersionId}`),
  attempts: (attemptId: string): string => namespaced(`attempts/${attemptId}`),
  results: (resultId: string): string => namespaced(`results/${resultId}`),
  regradeArtifacts: (resultId: string, regradeId: string): string =>
    namespaced(`regrade_artifacts/${resultId}/${regradeId}`),
  reviewIndexes: (resultId: string): string => namespaced(`review_indexes/${resultId}`),
  analyticsOutputs: (outputId: string, snapshotVersionId = 'current'): string =>
    namespaced(`analytics_outputs/${outputId}:${snapshotVersionId}`),
  provenance: (recordId: string): string => namespaced(`provenance/${recordId}`),
  whereUsedGraph: (assetId: string): string => namespaced(`where_used/${assetId}`),
  publishCommits: (materialId: string, snapshotVersionId: string): string =>
    namespaced(`publish_commits/${materialId}:${snapshotVersionId}`),
} as const satisfies Record<ReadingV2StoragePathClass, (...parts: string[]) => string>;

export const READING_V2_STORAGE_PATH_BUILDERS =
  readingV2StoragePaths satisfies Record<ReadingV2StoragePathClass, (...parts: string[]) => string>;

export const READING_V2_LEGACY_STORAGE_PATH_PREFIXES = [
  'drafts/',
  'tests/',
  'student_safe_tests/',
  'session_test_payloads/',
  'test_results/',
] as const;

export const assertReadingV2StoragePath = (path: string): void => {
  if (!path.startsWith(`${READING_V2_STORAGE_NAMESPACE}/`)) {
    throw new Error(`Reading V2 storage path must live under ${READING_V2_STORAGE_NAMESPACE}: ${path}`);
  }

  if (!path.includes(READING_V2_STORAGE_NAMESPACE)) {
    throw new Error(`Reading V2 storage path must include an explicit ${READING_V2_ENGINE} namespace.`);
  }

  const overlapsLegacy = READING_V2_LEGACY_STORAGE_PATH_PREFIXES.some((prefix) =>
    path.startsWith(prefix),
  );

  if (overlapsLegacy) {
    throw new Error(`Reading V2 storage path overlaps a legacy Reading path: ${path}`);
  }
};

export const listReadingV2StoragePathClasses = (): ReadingV2StoragePathClass[] =>
  Object.keys(READING_V2_STORAGE_PATH_BUILDERS) as ReadingV2StoragePathClass[];
