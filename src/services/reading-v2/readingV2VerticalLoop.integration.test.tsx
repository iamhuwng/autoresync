import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { readingV2Ids, type ReadingV2Document } from '../../types/readingV2.types';
import { ReadingV2ReviewContentAdapter } from '../../components/results/ReadingV2ReviewContentAdapter';
import {
  clearReadingV2VerticalLoopImportEvidence,
  createReadingV2MixedStructuredVerticalLoopDocument,
  readingV2VerticalLoopFixtureDocument,
} from './fixtures/readingV2VerticalLoopFixtures';
import { createReadingV2Repository } from './readingV2Repository.service';
import { validateReadingV2Draft } from './readingV2Validation.service';
import { generateReadingV2PreviewOnly, publishReadingV2Material } from './readingV2PublishPipeline.service';
import { resolveReadingV2LaunchDecision } from './readingV2LaunchIntegration.service';
import {
  buildReadingV2GroupedReviewPayload,
  buildReadingV2ResultPersistencePlan,
  buildReadingV2SavedResultRecord,
  captureReadingV2Attempt,
  scoreReadingV2Attempt,
} from './readingV2ResultAdapter.service';
import {
  assertReadingV2ProjectionIsStudentSanitized,
  type ReadingV2DerivedProjection,
} from './readingV2Projection.service';
import {
  deserializeReadingV2CanonicalToEditorDocument,
  serializeReadingV2EditorDocumentToCanonical,
  validateReadingV2EditorDocument,
} from './readingV2EditorDocument.service';

const sentenceCompletionDocument = (): ReadingV2Document =>
  readingV2VerticalLoopFixtureDocument('sentence-completion');

const projectionByKind = (
  projections: readonly ReadingV2DerivedProjection[],
  projectionKind: ReadingV2DerivedProjection['projectionKind'],
): ReadingV2DerivedProjection => {
  const projection = projections.find((candidate) => candidate.projectionKind === projectionKind);

  if (!projection) {
    throw new Error(`Expected Reading V2 ${projectionKind} projection.`);
  }

  return projection;
};

describe('Reading V2 gold vertical loop', () => {
  it('runs create draft -> validate -> publish -> launch -> submit -> existing result review without legacy interpretation', () => {
    const repository = createReadingV2Repository();
    const document = sentenceCompletionDocument();
    const materialId = readingV2Ids.materialId('gold-loop-material');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('gold-loop-snapshot');

    const draft = repository.createDraft({
      draftId: readingV2Ids.draftId('gold-loop-draft'),
      ownerId: 'teacher-1',
      materialId,
      document,
      now: '2026-04-28T00:00:00.000Z',
    });
    const validation = validateReadingV2Draft(draft.document);

    expect(validation.canPublish).toBe(true);

    const publishResult = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: draft.document,
      publishedBy: 'teacher-1',
      snapshotVersionId,
      publishedAt: '2026-04-28T00:01:00.000Z',
      returnContext: 'teacher-lobby',
    });
    const studentSafeProjection = publishResult.projections.find(
      (projection) => projection.projectionKind === 'student-safe',
    );
    const reviewProjection = publishResult.projections.find(
      (projection) => projection.projectionKind === 'review',
    );

    expect(studentSafeProjection).toBeDefined();
    expect(reviewProjection).toBeDefined();
    expect(JSON.stringify(studentSafeProjection)).not.toContain('scoringRule');

    const launchDecision = resolveReadingV2LaunchDecision({
      surface: 'solo-practice',
      metadata: publishResult.metadata,
      projection: studentSafeProjection,
      rolloutMode: 'public',
    });

    expect(launchDecision.status).toBe('runtime');
    if (launchDecision.status !== 'runtime' || !reviewProjection) {
      throw new Error('Gold vertical loop failed to reach the Reading V2 runtime projection.');
    }

    const answers = launchDecision.projection.content.taskGroups.flatMap((taskGroup) =>
      taskGroup.interactions.map((interaction, index) => ({
        interactionId: interaction.interactionId,
        taskGroupId: interaction.taskGroupId,
        displayNumber: interaction.displayNumber,
        value: index === 0 ? 'answer one' : 'answer two',
      })),
    );
    const attempt = captureReadingV2Attempt({
      attemptId: 'gold-loop-attempt',
      studentId: 'student-1',
      submitPayload: {
        projectionId: launchDecision.projection.projectionId,
        sourceSnapshotVersionId: launchDecision.projection.sourceSnapshotVersionId,
        materialId: launchDecision.projection.materialId,
        answers,
      },
      context: {
        mode: 'solo-practice',
        materialId,
        sourceName: publishResult.metadata.title,
      },
    });
    const snapshot = repository.loadPublishedSnapshot(materialId, snapshotVersionId);

    expect(snapshot).not.toBeNull();
    const result = scoreReadingV2Attempt({
      resultId: 'gold-loop-result',
      testId: materialId,
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt,
      snapshot: snapshot!,
      projection: reviewProjection,
      submittedAt: '2026-04-28T00:05:00.000Z',
    });
    const reviewPayload = buildReadingV2GroupedReviewPayload({
      result,
      projection: reviewProjection,
    });
    const savedResult = buildReadingV2SavedResultRecord({
      result,
      reviewPayload,
      studentName: 'Student One',
      testTitle: publishResult.metadata.title,
    });
    const persistencePlan = buildReadingV2ResultPersistencePlan({
      attempt,
      result,
      savedResult,
      reviewPayload,
    });

    expect(result.deliveryEngine).toBe(READING_V2_ENGINE);
    expect(result.publishedSnapshotVersion).toBe(snapshotVersionId);
    expect(savedResult.readingV2.reviewPayload.taskGroups[0].interactions).toHaveLength(2);
    expect(persistencePlan.operations.map((operation) => operation.path)).toEqual(
      expect.arrayContaining([
        'test_results/gold-loop-result',
        'test_results_by_student/student-1/gold-loop-result',
        'reading_v2/review_indexes/gold-loop-result',
      ]),
    );
    expect(JSON.stringify(persistencePlan)).not.toContain('IELTSQuestionsPanel');

    render(
      <ReadingV2ReviewContentAdapter
        resultId={savedResult.resultId}
        variant="teacher"
        reviewPayload={savedResult.readingV2.reviewPayload}
      />,
    );

    expect(screen.getByTestId('reading-v2-review-adapter')).toBeInTheDocument();
    expect(screen.getByText(/Complete the sentence-completion task/)).toBeInTheDocument();
  });

  it('keeps mixed editor-block content stable through save, projection, runtime submit, scoring, and review', () => {
    const repository = createReadingV2Repository();
    const sourceDocument = createReadingV2MixedStructuredVerticalLoopDocument();
    const editorDocument = deserializeReadingV2CanonicalToEditorDocument(sourceDocument);
    const editorIssues = validateReadingV2EditorDocument(editorDocument);
    const serializedDocument = serializeReadingV2EditorDocumentToCanonical(editorDocument);
    const document = clearReadingV2VerticalLoopImportEvidence(serializedDocument);
    const draftId = readingV2Ids.draftId('mixed-loop-draft');
    const materialId = readingV2Ids.materialId('mixed-loop-material');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('mixed-loop-snapshot');

    expect(editorIssues).toEqual([]);
    expect(JSON.stringify(sourceDocument)).toContain('importEvidenceRefs');
    expect(Object.keys(document.anchors).sort()).toEqual(Object.keys(sourceDocument.anchors).sort());
    expect(JSON.stringify(document)).not.toContain('reading-v2-editor-block');
    expect(JSON.stringify(document)).not.toContain('importEvidenceRefs');

    const createdDraft = repository.createDraft({
      draftId,
      ownerId: 'teacher-1',
      materialId,
      document,
      now: '2026-05-07T00:00:00.000Z',
    });
    const savedDraft = repository.saveDraft({
      draftId,
      baseRevisionToken: createdDraft.revisionToken,
      document,
      studioMetadata: { source: 'phase-6-vertical-loop' },
      state: 'ready-to-publish',
      now: '2026-05-07T00:01:00.000Z',
    });
    const resumedDraft = repository.loadDraft(draftId);

    expect(resumedDraft?.revisionToken).toBe(savedDraft.revisionToken);
    expect(resumedDraft?.document).toEqual(savedDraft.document);
    expect(resumedDraft?.studioMetadata).toEqual({ source: 'phase-6-vertical-loop' });

    const previewOnly = generateReadingV2PreviewOnly({
      draftId,
      ownerId: 'teacher-1',
      document: resumedDraft!.document,
      generatedAt: '2026-05-07T00:02:00.000Z',
    });
    const previewStimulusKinds = new Set(
      previewOnly.projection.content.stimuli.map((stimulus) => stimulus.content.kind),
    );

    expect(previewOnly.validation.canPublish).toBe(true);
    expect(previewOnly.permanentWrites).toEqual([]);
    expect(previewStimulusKinds).toEqual(
      new Set(['passage-content', 'media-content', 'table-content', 'flowchart-content', 'diagram-content']),
    );

    const publishResult = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: resumedDraft!.document,
      publishedBy: 'teacher-1',
      snapshotVersionId,
      publishedAt: '2026-05-07T00:03:00.000Z',
      returnContext: 'teacher-lobby',
    });
    const studentSafeProjection = projectionByKind(publishResult.projections, 'student-safe');
    const sessionSafeProjection = projectionByKind(publishResult.projections, 'session-safe');
    const reviewProjection = projectionByKind(publishResult.projections, 'review');

    assertReadingV2ProjectionIsStudentSanitized(studentSafeProjection);
    assertReadingV2ProjectionIsStudentSanitized(sessionSafeProjection);
    expect(JSON.stringify([studentSafeProjection, sessionSafeProjection])).not.toContain('importEvidenceRefs');

    const launchDecision = resolveReadingV2LaunchDecision({
      surface: 'solo-practice',
      metadata: publishResult.metadata,
      projection: studentSafeProjection,
      rolloutMode: 'public',
    });

    expect(launchDecision.status).toBe('runtime');
    if (launchDecision.status !== 'runtime') {
      throw new Error('Mixed Reading V2 vertical loop failed to reach runtime projection.');
    }

    const answers = launchDecision.projection.content.taskGroups.flatMap((taskGroup) =>
      taskGroup.interactions.map((interaction) => {
        const canonicalInteraction = resumedDraft!.document.interactions[interaction.interactionId];
        const value = canonicalInteraction?.scoringRule.acceptableAnswers?.[0] ?? '';

        return {
          interactionId: interaction.interactionId,
          taskGroupId: interaction.taskGroupId,
          displayNumber: interaction.displayNumber,
          value,
        };
      }),
    );

    expect(answers.map((answer) => answer.displayNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(answers.map((answer) => answer.interactionId))).toHaveProperty('size', 8);

    const attempt = captureReadingV2Attempt({
      attemptId: 'mixed-loop-attempt',
      studentId: 'student-1',
      submitPayload: {
        projectionId: launchDecision.projection.projectionId,
        sourceSnapshotVersionId: launchDecision.projection.sourceSnapshotVersionId,
        materialId: launchDecision.projection.materialId,
        answers,
      },
      context: {
        mode: 'solo-practice',
        materialId,
        sourceName: publishResult.metadata.title,
      },
    });
    const snapshot = repository.loadPublishedSnapshot(materialId, snapshotVersionId);

    expect(snapshot).not.toBeNull();
    const result = scoreReadingV2Attempt({
      resultId: 'mixed-loop-result',
      testId: materialId,
      studentId: 'student-1',
      ownerId: 'teacher-1',
      attempt,
      snapshot: snapshot!,
      projection: reviewProjection,
      submittedAt: '2026-05-07T00:10:00.000Z',
    });
    const reviewPayload = buildReadingV2GroupedReviewPayload({
      result,
      projection: reviewProjection,
    });
    const savedResult = buildReadingV2SavedResultRecord({
      result,
      reviewPayload,
      studentName: 'Student One',
      testTitle: publishResult.metadata.title,
    });
    const persistencePlan = buildReadingV2ResultPersistencePlan({
      attempt,
      result,
      savedResult,
      reviewPayload,
    });

    expect(result.interactions).toHaveLength(8);
    expect(result.interactions.every((interaction) => interaction.score === interaction.maxScore)).toBe(true);
    expect(reviewPayload.taskGroups.map((taskGroup) => taskGroup.officialTaskType)).toEqual([
      'sentence-completion',
      'table-completion',
      'flowchart-completion',
      'diagram-labeling',
    ]);
    expect(reviewPayload.taskGroups.find((taskGroup) => taskGroup.officialTaskType === 'table-completion')
      ?.stimulusContext[0]?.excerpt).toContain('_____');
    expect(reviewPayload.taskGroups.find((taskGroup) => taskGroup.officialTaskType === 'flowchart-completion')
      ?.stimulusContext[0]?.excerpt).toContain('First process step');
    expect(reviewPayload.taskGroups.find((taskGroup) => taskGroup.officialTaskType === 'diagram-labeling')
      ?.stimulusContext[0]?.excerpt).toContain('Diagram image provided');
    expect(JSON.stringify(persistencePlan)).toContain('reading_v2/review_indexes/mixed-loop-result');
    expect(JSON.stringify(persistencePlan)).not.toContain('importEvidenceRefs');

    render(
      <ReadingV2ReviewContentAdapter
        resultId={savedResult.resultId}
        variant="teacher"
        reviewPayload={savedResult.readingV2.reviewPayload}
      />,
    );

    expect(screen.getByText('Mixed structured Reading V2 vertical loop')).toBeInTheDocument();
    expect(screen.getByText(/Complete the table-completion task/)).toBeInTheDocument();
    expect(screen.getByText(/Complete the flowchart-completion task/)).toBeInTheDocument();
    expect(screen.getByText(/Complete the diagram-labeling task/)).toBeInTheDocument();
    expect(screen.getAllByText(/Correct answer:/)).toHaveLength(8);
  });
});
