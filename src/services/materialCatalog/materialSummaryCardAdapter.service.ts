import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import type { MaterialSummary } from './materialSummaryPort.service';

const displaySkill = (skillId: string | undefined): string =>
  skillId
    ? `${skillId.charAt(0).toUpperCase()}${skillId.slice(1)}`
    : 'General';

const displayTestType = (summary: MaterialSummary): string =>
  String(summary.primaryTestTypeId ?? summary.testTypeIds[0] ?? 'Custom')
    .toUpperCase();

export const adaptMaterialSummaryToTeacherCard = (
  summary: MaterialSummary,
): Record<string, unknown> => {
  const testType = displayTestType(summary);
  const readingV2 = summary.producerId.startsWith('reading-v2-');

  return {
    id: summary.materialId,
    materialId: summary.materialId,
    producerId: summary.producerId,
    schemaVersion: summary.schemaVersion,
    ownerId: summary.ownerId,
    title: summary.title,
    description: summary.description ?? '',
    type: testType,
    testType,
    testTypeIds: summary.testTypeIds,
    primaryTestTypeId: summary.primaryTestTypeId,
    skill: displaySkill(summary.skillId),
    skillId: summary.skillId,
    skillType: readingV2 ? 'reading-v2' : summary.skillId,
    duration: summary.durationMinutes ?? 0,
    durationMinutes: summary.durationMinutes,
    questionCount: summary.questionCount ?? 0,
    isPublic: summary.visibility === 'public',
    visibility: summary.visibility,
    lifecycleState: summary.lifecycleState,
    materialKind: summary.materialKind,
    surfaceFamily: summary.surfaceFamily,
    updatedAt: summary.updatedAt,
    createdAt: summary.updatedAt,
    publishedSnapshotVersionId: summary.sourceSnapshotVersionId,
    sourceSnapshotVersionId: summary.sourceSnapshotVersionId,
    sourceFullTestId: summary.sourceFullTestId,
    hasBrokenRefs: summary.hasBrokenRefs,
    brokenRefCount: summary.brokenRefCount,
    hasStudentSafeProjection: summary.hasStudentSafeProjection,
    deliveryProjectionReady: summary.deliveryProjectionReady,
    studentSafeProjectionReady: summary.studentSafeProjectionReady,
    passageRefCount: summary.passageRefCount,
    tags: summary.tags,
    ...(readingV2
      ? {
          deliveryEngine: READING_V2_ENGINE,
          productLabel: 'Reading V2',
        }
      : {}),
    metadata: {
      title: summary.title,
      description: summary.description ?? '',
      duration: summary.durationMinutes ?? 0,
      tags: summary.tags,
      visibility: summary.visibility,
      materialKind: summary.materialKind,
      producerId: summary.producerId,
      publishedSnapshotVersionId: summary.sourceSnapshotVersionId,
      hasBrokenRefs: summary.hasBrokenRefs,
      brokenRefCount: summary.brokenRefCount,
      hasStudentSafeProjection: summary.hasStudentSafeProjection,
      deliveryProjectionReady: summary.deliveryProjectionReady,
      studentSafeProjectionReady: summary.studentSafeProjectionReady,
      passageRefCount: summary.passageRefCount,
    },
  };
};

export const adaptMaterialSummariesToTeacherCards = (
  summaries: readonly MaterialSummary[],
): Record<string, unknown>[] =>
  summaries.map(adaptMaterialSummaryToTeacherCard);
