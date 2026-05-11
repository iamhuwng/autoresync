import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ReadingV2RuntimeShell } from '../components/reading-v2/runtime/ReadingV2RuntimeShell';
import type { ReadingV2RuntimeSubmitPayload } from '../components/reading-v2/runtime/ReadingV2RuntimeShell';
import { ReadingV2ReviewContentAdapter } from '../components/results/ReadingV2ReviewContentAdapter';
import {
  clearReadingV2VerticalLoopImportEvidence,
  createReadingV2MixedStructuredVerticalLoopDocument,
} from '../services/reading-v2/fixtures/readingV2VerticalLoopFixtures';
import { READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE } from '../services/reading-v2/fixtures/readingV2PasteImportFixtures';
import {
  deserializeReadingV2CanonicalToEditorDocument,
  serializeReadingV2EditorDocumentToCanonical,
  validateReadingV2EditorDocument,
} from '../services/reading-v2/readingV2EditorDocument.service';
import {
  createReadingV2ImportCandidateFromText,
  normalizeReadingV2ImportCandidate,
} from '../services/reading-v2/readingV2ImportNormalization.service';
import { resolveReadingV2LaunchDecision } from '../services/reading-v2/readingV2LaunchIntegration.service';
import { generateReadingV2PreviewOnly, publishReadingV2Material } from '../services/reading-v2/readingV2PublishPipeline.service';
import type { ReadingV2DerivedProjection } from '../services/reading-v2/readingV2Projection.service';
import { createReadingV2Repository } from '../services/reading-v2/readingV2Repository.service';
import {
  buildReadingV2GroupedReviewPayload,
  buildReadingV2SavedResultRecord,
  captureReadingV2Attempt,
  scoreReadingV2Attempt,
  type ReadingV2GroupedReviewPayload,
} from '../services/reading-v2/readingV2ResultAdapter.service';
import { readingV2Ids, type ReadingV2PublishedSnapshot } from '../types/readingV2.types';

const DIAG_PREFIX = '[Diag][ReadingV2VerticalLoopSmoke]';

const logSmokeDiagnostic = (event: string, payload: Record<string, unknown>) => {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return;
  }

  console.log(`${DIAG_PREFIX} ${event}`, payload);
};

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

const forbiddenProjectionTokens = [
  'acceptableAnswers',
  'answerKeyText',
  'authorOnly',
  'diagnostic',
  'editorDocument',
  'importEvidence',
  'importEvidenceRefs',
  'parsedAnswerValues',
  'rawAnswerText',
  'reading-v2-editor-block',
  'scoringRule',
  'teacherAnswerKey',
  'validationState',
] as const;

const auditProjectionSafety = (projection: ReadingV2DerivedProjection): Record<string, boolean> => {
  const serialized = JSON.stringify(projection);

  return Object.fromEntries(
    forbiddenProjectionTokens.map((token) => [token, serialized.includes(token)]),
  );
};

const createFullTestDocument = () => {
  const candidate = createReadingV2ImportCandidateFromText({
    text: READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.rawText,
    answerKeyText: READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.answerKeyText,
    fileName: `${READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.name}.txt`,
  });

  return normalizeReadingV2ImportCandidate(candidate).document;
};

const createVerticalLoop = (fixtureName: string | null = null) => {
  const repository = createReadingV2Repository();
  const sourceDocument = fixtureName === 'valid-full-test'
    ? createFullTestDocument()
    : createReadingV2MixedStructuredVerticalLoopDocument();
  const editorDocument = deserializeReadingV2CanonicalToEditorDocument(sourceDocument);
  const editorIssues = validateReadingV2EditorDocument(editorDocument);
  const serializedDocument = serializeReadingV2EditorDocumentToCanonical(editorDocument);
  const document = clearReadingV2VerticalLoopImportEvidence(serializedDocument);
  const draftId = readingV2Ids.draftId('smoke-mixed-loop-draft');
  const materialId = readingV2Ids.materialId('smoke-mixed-loop-material');
  const snapshotVersionId = readingV2Ids.snapshotVersionId('smoke-mixed-loop-snapshot');
  const createdDraft = repository.createDraft({
    draftId,
    ownerId: 'smoke-teacher',
    materialId,
    document,
    now: '2026-05-07T00:00:00.000Z',
  });
  const savedDraft = repository.saveDraft({
    draftId,
    baseRevisionToken: createdDraft.revisionToken,
    document,
    studioMetadata: { source: 'phase-6-browser-gate' },
    state: 'ready-to-publish',
    now: '2026-05-07T00:01:00.000Z',
  });
  const preview = generateReadingV2PreviewOnly({
    draftId,
    ownerId: 'smoke-teacher',
    document: savedDraft.document,
    generatedAt: '2026-05-07T00:02:00.000Z',
  });
  const publishResult = publishReadingV2Material({
    repository,
    materialId,
    ownerId: 'smoke-teacher',
    document: savedDraft.document,
    publishedBy: 'smoke-teacher',
    snapshotVersionId,
    publishedAt: '2026-05-07T00:03:00.000Z',
    returnContext: 'phase-6-browser-gate',
  });
  const studentSafeProjection = projectionByKind(publishResult.projections, 'student-safe');
  const sessionSafeProjection = projectionByKind(publishResult.projections, 'session-safe');
  const reviewProjection = projectionByKind(publishResult.projections, 'review');
  const launchDecision = resolveReadingV2LaunchDecision({
    surface: 'solo-practice',
    metadata: publishResult.metadata,
    projection: studentSafeProjection,
    rolloutMode: 'public',
  });

  if (launchDecision.status !== 'runtime') {
    throw new Error('Reading V2 vertical loop smoke failed to reach runtime projection.');
  }

  const snapshot = repository.loadPublishedSnapshot(materialId, snapshotVersionId);

  if (!snapshot) {
    throw new Error('Reading V2 vertical loop smoke did not persist the published snapshot.');
  }

  return {
    sourceHadImportEvidence: JSON.stringify(sourceDocument).includes('importEvidenceRefs'),
    editorIssueCount: editorIssues.length,
    documentHasEditorInternals: JSON.stringify(document).includes('reading-v2-editor-block'),
    previewCanPublish: preview.validation.canPublish,
    previewStimulusKinds: preview.projection.content.stimuli.map((stimulus) => stimulus.content.kind),
    projectionSafetyAudit: {
      studentSafe: auditProjectionSafety(studentSafeProjection),
      sessionSafe: auditProjectionSafety(sessionSafeProjection),
    },
    repository,
    materialId,
    snapshot,
    metadataTitle: publishResult.metadata.title,
    runtimeProjection: launchDecision.projection,
    reviewProjection,
  };
};

export default function ReadingV2VerticalLoopSmokePage() {
  const [searchParams] = useSearchParams();
  const fixtureName = searchParams.get('fixture');
  const loop = useMemo(() => createVerticalLoop(fixtureName), [fixtureName]);
  const [reviewPayload, setReviewPayload] = useState<ReadingV2GroupedReviewPayload | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (payload: ReadingV2RuntimeSubmitPayload) => {
    const attempt = captureReadingV2Attempt({
      attemptId: 'smoke-mixed-loop-attempt',
      studentId: 'smoke-student',
      submitPayload: {
        projectionId: payload.projectionId,
        sourceSnapshotVersionId: payload.sourceSnapshotVersionId,
        materialId: payload.materialId,
        answers: payload.answers.map((answer) => ({
          interactionId: answer.interactionId,
          taskGroupId: answer.taskGroupId,
          displayNumber: answer.visibleNumber,
          value: answer.value,
        })),
      },
      context: {
        mode: 'solo-practice',
        materialId: loop.materialId,
        sourceName: loop.metadataTitle,
      },
    });
    const result = scoreReadingV2Attempt({
      resultId: 'smoke-mixed-loop-result',
      testId: loop.materialId,
      studentId: 'smoke-student',
      ownerId: 'smoke-teacher',
      attempt,
      snapshot: loop.snapshot as ReadingV2PublishedSnapshot,
      projection: loop.reviewProjection,
      submittedAt: '2026-05-07T00:10:00.000Z',
    });
    const nextReviewPayload = buildReadingV2GroupedReviewPayload({
      result,
      projection: loop.reviewProjection,
    });
    buildReadingV2SavedResultRecord({
      result,
      reviewPayload: nextReviewPayload,
      studentName: 'Smoke Student',
      testTitle: loop.metadataTitle,
    });

    setSubmitted(true);
    setReviewPayload(nextReviewPayload);
    logSmokeDiagnostic('vertical_loop_submitted', {
      answerCount: payload.answers.length,
      score: result.interactions.reduce((total, interaction) => total + interaction.score, 0),
      maxScore: result.interactions.reduce((total, interaction) => total + interaction.maxScore, 0),
    });
  };

  const projectionSafety = JSON.stringify(loop.runtimeProjection);

  return (
    <main aria-label="Reading V2 vertical loop smoke" style={{ display: 'grid', gap: 16 }}>
      <section
        aria-label="Reading V2 vertical loop status"
        data-testid="reading-v2-vertical-loop-status"
        style={{ padding: '12px 16px', borderBottom: '1px solid #dbe3ef', background: '#f8fafc' }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>Reading V2 Vertical Loop</h1>
        <p style={{ margin: '6px 0 0', color: '#475569' }}>
          Preview {loop.previewCanPublish ? 'ready' : 'blocked'} · Runtime {loop.runtimeProjection.projectionKind} ·
          Review {reviewPayload ? 'ready' : 'waiting'}
        </p>
        <dl style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '8px 0 0', fontSize: 12 }}>
          <div>editor issues: {loop.editorIssueCount}</div>
          <div>source import evidence: {String(loop.sourceHadImportEvidence)}</div>
          <div>editor internals leaked: {String(loop.documentHasEditorInternals)}</div>
          <div>answers leaked: {String(projectionSafety.includes('acceptableAnswers'))}</div>
        </dl>
        <pre
          data-testid="reading-v2-projection-safety-audit"
          style={{ position: 'absolute', left: -10000, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
        >
          {JSON.stringify(loop.projectionSafetyAudit)}
        </pre>
      </section>

      <ReadingV2RuntimeShell
        projection={loop.runtimeProjection}
        onSubmit={handleSubmit}
      />

      {submitted && reviewPayload ? (
        <section aria-label="Reading V2 vertical loop review" style={{ padding: 16 }}>
          <ReadingV2ReviewContentAdapter
            resultId="smoke-mixed-loop-result"
            variant="teacher"
            reviewPayload={reviewPayload}
          />
        </section>
      ) : null}
    </main>
  );
}
