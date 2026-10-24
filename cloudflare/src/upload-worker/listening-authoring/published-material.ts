import type { ListeningPublishedVersionRecord } from '../../../../functions/src/listening-authoring/repository.shared';
import { createLegacyTestMaterialSummary } from '../../../../src/services/materialCatalog/legacyTestMaterialSummary.service';
import {
  buildMaterialSummaryUpdatePayload,
  type MaterialSummary,
} from '../../../../src/services/materialCatalog/materialSummaryPort.service';
import { stripAnswerKeys } from '../../../../src/utils/answerKeyHelper';

export const buildListeningPublishedMaterialUpdates = (
  version: ListeningPublishedVersionRecord,
  previousSummary?: MaterialSummary | null,
  previousRuntime?: Record<string, unknown> | null,
): Record<string, unknown> => {
  if (previousRuntime?.ownerId != null && previousRuntime.ownerId !== version.ownerId) {
    throw new Error('Listening runtime owner does not match published version owner.');
  }
  const archived = version.archive.state === 'archived';
  const runtime: Record<string, unknown> = {
    ...version.document,
    id: version.testId,
    ownerId: version.ownerId,
    createdBy: previousRuntime?.createdBy ?? version.publishedBy,
    createdAt: previousRuntime?.createdAt ?? version.publishedAt,
    updatedAt: archived ? version.archive.archivedAt ?? version.publishedAt : version.publishedAt,
    isPublished: !archived,
    state: archived ? 'archived' : 'active',
    visibility: version.document.isPublic ? 'public' : 'private',
    versionId: version.versionId,
    publishedSnapshotVersionId: version.versionId,
    deliveryProjectionReady: !archived,
    hasStudentSafeProjection: !archived,
  };
  const summary = { ...createLegacyTestMaterialSummary(
    version.testId,
    runtime,
    archived ? 'archived' : 'active',
  ), deliveryProjectionReady: !archived, hasStudentSafeProjection: !archived };
  const { transcript, ...studentMetadata } = version.document.metadata;
  void transcript;
  const studentSafe = {
    ...runtime,
    metadata: studentMetadata,
    questions: stripAnswerKeys([...version.document.questions]).map((question) => {
      const { acceptableAnswers, explanation, ...studentQuestion } = question as Record<string, unknown>;
      void acceptableAnswers;
      void explanation;
      return studentQuestion;
    }),
  };
  const runtimePath = `tests/${version.testId}`;
  const runtimeUpdates = Object.fromEntries(Object.entries({
    // Legacy version pointers outrank versionId in delivery adapters.
    authoringVersioning: null,
    questionImages: null,
    missingAnswerCount: null,
    testType: null,
    primaryTestTypeId: null,
    testTypeIds: null,
    ...runtime,
  }).filter(([key]) => key !== 'statistics' &&
    !(previousRuntime && ['createdAt', 'createdBy'].includes(key)))
    .map(([key, value]) => [`${runtimePath}/${key}`, value]));
  return {
    ...runtimeUpdates,
    // Existing homework retains its delivery copy after the source is archived.
    ...(archived ? {} : { [`student_safe_tests/${version.testId}`]: studentSafe }),
    ...buildMaterialSummaryUpdatePayload(summary, previousSummary),
  };
};
