import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { resolveLegacyTestTypeLabelFromMaterialTestTypeIds } from '../materialCatalog/materialTestTypeMapping.service';
import {
  isReadingV2PublicVisibility,
  type ReadingV2MaterialMetadata,
} from './readingV2MaterialMetadata.service';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';

export interface ReadingV2TestBridgeBuildInput {
  readonly metadata: ReadingV2MaterialMetadata;
  readonly studentSafeProjection?: ReadingV2DerivedProjection | null;
  readonly updatedAt: string;
}

const countProjectionInteractions = (
  projection: ReadingV2DerivedProjection | null | undefined,
): number =>
  projection?.content?.taskGroups?.reduce(
    (total, taskGroup) => total + (taskGroup.interactions?.length ?? 0),
    0,
  ) ?? 0;

const countProjectionSections = (
  projection: ReadingV2DerivedProjection | null | undefined,
): number =>
  projection?.content?.sections?.length ?? 0;

const omitUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(omitUndefined);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, omitUndefined(entry)]),
    );
  }

  return value;
};

export const buildReadingV2TestBridgeRecord = ({
  metadata,
  studentSafeProjection,
  updatedAt,
}: ReadingV2TestBridgeBuildInput): Record<string, unknown> => {
  const legacyTestType = resolveLegacyTestTypeLabelFromMaterialTestTypeIds([
    metadata.primaryTestTypeId,
    ...metadata.testTypeIds,
  ]);
  const hasStudentSafeProjection = Boolean(studentSafeProjection);
  const passageRefCount = countProjectionSections(studentSafeProjection);

  return omitUndefined({
    id: metadata.materialId,
    materialId: metadata.materialId,
    ownerId: metadata.ownerId,
    compositionId: metadata.compositionId,
    deliveryEngine: READING_V2_ENGINE,
    contentEngine: READING_V2_ENGINE,
    runtimeEngine: READING_V2_ENGINE,
    title: metadata.title,
    testType: legacyTestType,
    type: legacyTestType,
    skill: 'Reading',
    skillType: 'reading-v2',
    duration: metadata.durationMinutes,
    questionCount: countProjectionInteractions(studentSafeProjection),
    isPublic: isReadingV2PublicVisibility(metadata.visibility),
    materialKind: metadata.materialKind,
    productLabel: metadata.productLabel,
    publishedSnapshotVersionId: metadata.publishedSnapshotVersionId,
    primaryTestTypeId: metadata.primaryTestTypeId,
    testTypeIds: metadata.testTypeIds,
    hasStudentSafeProjection,
    deliveryProjectionReady: hasStudentSafeProjection,
    studentSafeProjectionReady: hasStudentSafeProjection,
    passageRefCount,
    updatedAt,
    metadata: {
      compositionId: metadata.compositionId,
      title: metadata.title,
      duration: metadata.durationMinutes,
      difficulty: metadata.difficulty,
      targetBand: metadata.targetBand,
      description: metadata.description,
      tags: metadata.tags,
      visibility: metadata.visibility,
      productLabel: metadata.productLabel,
      materialKind: metadata.materialKind,
      deliveryEngine: READING_V2_ENGINE,
      publishedSnapshotVersionId: metadata.publishedSnapshotVersionId,
      primaryTestTypeId: metadata.primaryTestTypeId,
      testTypeIds: metadata.testTypeIds,
      hasStudentSafeProjection,
      deliveryProjectionReady: hasStudentSafeProjection,
      studentSafeProjectionReady: hasStudentSafeProjection,
      passageRefCount,
    },
  }) as Record<string, unknown>;
};
