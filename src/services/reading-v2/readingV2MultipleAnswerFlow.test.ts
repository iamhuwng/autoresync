import { expect, it, vi } from 'vitest';
import { buildReadingV2TrustedSubmissionPlan, parseReadingV2TrustedSubmissionRequest } from '../../../functions/src/readingV2SubmitCore';
import { readingV2Ids } from '../../types/readingV2.types';
import { createReadingV2ImportCandidateFromText, normalizeReadingV2ImportCandidate } from './readingV2ImportNormalization.service';
import { publishReadingV2Material } from './readingV2PublishPipeline.service';
import { createReadingV2Repository } from './readingV2Repository.service';
import { buildReadingV2FirebasePublishUpdates } from './readingV2FirebasePublishAdapter.service';
import { validateReadingV2Draft } from './readingV2Validation.service';
import { READING_V2_STRUCTURED_MATERIALS_START, READING_V2_STRUCTURED_MATERIALS_END } from './readingV2ExternalAiPrompt.service';

vi.mock('../firebase', () => ({ database: {} }));

it('imports, saves, publishes and grades one choose-two prompt as two order-independent marks', () => {
  const imported = normalizeReadingV2ImportCandidate(createReadingV2ImportCandidateFromText({
    text: [READING_V2_STRUCTURED_MATERIALS_START, '```json', JSON.stringify({ materials: [{
      passageNumber: 1, title: 'The garden experiment',
      passages: [{ title: 'The garden experiment', content: 'Researchers compared five options in a garden experiment. The third and fourth options succeeded.' }],
      sectionInstructions: [{ id: 'choose-two', text: 'Choose TWO letters, A-E. Write the correct letters in boxes 25 and 26.',
        taskType: 'multiple-select', questionRange: { start: 25, end: 26 }, selectionLimit: 2,
        labeledOptions: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Option ${label}` })) }],
      questions: [
        { questionNumber: 25, type: 'multiple-select', sectionInstructionId: 'choose-two', questionText: 'Which TWO options are correct?', answer: 'C' },
        { questionNumber: 26, type: 'multiple-select', sectionInstructionId: 'choose-two', questionText: '', answer: 'D' },
      ],
    }] }), '```', READING_V2_STRUCTURED_MATERIALS_END].join('\n'),
    answerKeyText: '25 C\n26 D',
  }));
  const repository = createReadingV2Repository();
  expect(validateReadingV2Draft(imported.document).blockingIssues).toEqual([]);
  const draft = repository.createDraft({ ownerId: 'teacher-1', document: imported.document });
  const saved = repository.saveDraft({ draftId: draft.draftId, baseRevisionToken: draft.revisionToken, document: draft.document });
  const materialId = readingV2Ids.materialId('choose-two-flow');
  const published = publishReadingV2Material({ repository, materialId, ownerId: 'teacher-1',
    document: saved.document, publishedBy: 'teacher-1', skipReadingPassageExtraction: true,
    metadata: { title: 'Choose two flow', materialKind: 'reading-passage', visibility: 'private' } });
  const updates = buildReadingV2FirebasePublishUpdates(published.commitPlan).updates;
  expect(Object.keys(updates).some((path) => path.includes('by_visibility/public/'))).toBe(false);
  const safe = published.projections.find((projection) => projection.projectionKind === 'student-safe')!;
  const review = published.projections.find((projection) => projection.projectionKind === 'review')!;
  const interactions = safe.content.taskGroups.flatMap((group) => group.interactions);
  expect(interactions).toHaveLength(1);
  expect(interactions[0]).toMatchObject({ displayNumber: 1, displayNumberEnd: 2,
    responseShape: { kind: 'multi-select', selectionLimit: 2 }, promptText: 'Which TWO options are correct?' });
  expect(JSON.stringify(safe)).not.toContain('acceptableAnswers');
  const snapshot = repository.loadPublishedSnapshot(materialId, published.snapshotVersionId)!;
  expect(Object.values(snapshot.document.interactions)[0].reviewLabel).toEqual({ displayNumber: 25, answerSlotCount: 2 });
  for (const [value, score] of [[['C', 'D'], 2], [['D', 'C'], 2], [['C', 'A'], 1]] as const) {
    const request = parseReadingV2TrustedSubmissionRequest({
      deliveryEngine: 'reading-v2', projectionId: safe.projectionId,
      sourceSnapshotVersionId: published.snapshotVersionId, materialId,
      answers: [{ interactionId: interactions[0].interactionId, taskGroupId: interactions[0].taskGroupId,
        displayNumber: interactions[0].displayNumber, value }],
      context: { surface: 'solo-practice' },
    });
    const plan = buildReadingV2TrustedSubmissionPlan({ request, auth: { uid: 'student-1' },
      records: { snapshot, reviewProjection: review, metadata: published.metadata },
      identity: { resultId: 'flow-result', attemptId: 'flow-attempt', submittedAtIso: '2026-10-20T00:00:00.000Z', submittedAtMs: 1792454400000 } });
    expect(plan.savedResult).toMatchObject({ totalScore: score, maxScore: 2, totalQuestions: 2 });
    expect(plan.savedResult.questionResults).toHaveLength(2);
  }
});
