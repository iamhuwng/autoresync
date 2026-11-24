import type { ListeningPublishedVersionRecord } from '../../../../functions/src/listening-authoring/repository.shared';
import { createLegacyTestMaterialSummary } from '../../../../src/services/materialCatalog/legacyTestMaterialSummary.service';
import {
  buildMaterialSummaryUpdatePayload,
  type MaterialSummary,
} from '../../../../src/services/materialCatalog/materialSummaryPort.service';
import { stripAnswerKeys } from '../../../../src/utils/answerKeyHelper';

export const buildListeningStudentSafeDocument = (document: ListeningPublishedVersionRecord['document']) => {
  const { transcript, ...metadata } = document.metadata;
  void transcript;
  const audioSections = document.audioSections.map((section) => {
    if (!section.externalAudio) return section;
    const { externalAudio, streamUrl, ...studentAudio } = section;
    void streamUrl;
    return { ...studentAudio, assetId: externalAudio.assetId, audioUrl: '' };
  });
  return { ...document, metadata, audioSections, questions: stripAnswerKeys([...document.questions]).map(question => {
    const { acceptableAnswers, explanation, ...studentQuestion } = question;
    void acceptableAnswers;
    void explanation;
    return studentQuestion;
  }) };
};

export const buildListeningPublishedMaterialUpdates = (
  version: ListeningPublishedVersionRecord,
  previousSummary?: MaterialSummary | null,
  previousRuntime?: Record<string, unknown> | null,
): Record<string, unknown> => {
  if (previousRuntime?.ownerId != null && previousRuntime.ownerId !== version.ownerId) {
    throw new Error('Listening runtime owner does not match published version owner.');
  }
  const archived = version.archive.state === 'archived';
  const hasExternalAudio = version.document.audioSections.some((section) => section.externalAudio);
  const runtime: Record<string, unknown> = {
    ...buildListeningStudentSafeDocument(version.document),
    id: version.testId,
    ownerId: version.ownerId,
    createdBy: previousRuntime?.createdBy ?? version.publishedBy,
    createdAt: previousRuntime?.createdAt ?? version.publishedAt,
    updatedAt: archived ? version.archive.archivedAt ?? version.publishedAt : version.publishedAt,
    isPublished: !archived,
    isPublic: version.document.isPublic && !(archived && hasExternalAudio),
    state: archived ? 'archived' : 'active',
    visibility: version.document.isPublic ? 'public' : 'private',
    versionId: version.versionId,
    publishedSnapshotVersionId: version.versionId,
    deliveryProjectionReady: !archived,
    requiresAudioAttempt: hasExternalAudio || null,
    hasStudentSafeProjection: !archived,
  };
  const summary = { ...createLegacyTestMaterialSummary(
    version.testId,
    runtime,
    archived ? 'archived' : 'active',
  ), deliveryProjectionReady: !archived, hasStudentSafeProjection: !archived };
  const studentSafe = {
    ...runtime,
    ...buildListeningStudentSafeDocument(version.document),
  };
  const studentSafePath = `student_safe_tests/${version.testId}`;
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
    // External Homework uses its authorized immutable version rather than the public projection.
    ...(archived
      ? (hasExternalAudio && version.document.isPublic ? { [studentSafePath]: null } : {})
      : { [studentSafePath]: hasExternalAudio && !version.document.isPublic
        ? { id: version.testId, questionCount: version.document.questionCount, updatedAt: version.publishedAt }
        : studentSafe }),
    ...buildMaterialSummaryUpdatePayload(summary, previousSummary),
  };
};
