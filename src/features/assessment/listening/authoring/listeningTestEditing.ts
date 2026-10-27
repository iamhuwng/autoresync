import { getAuth } from 'firebase/auth';
import { get, ref } from 'firebase/database';
import { database } from '../../../../services/firebase';
import r2StorageService from '../../../../services/r2Storage';
import type { ContextResource, TestData } from '../../../../services/testStorage';
import type { ListeningAuthoringDocumentV1 } from '../types/listeningAuthoring.types';
import { createListeningAuthoringWorkflow } from './listeningAuthoringWorkflow';

interface ListeningEdits {
  title: string;
  duration: number;
  isPublic: boolean;
  questions: TestData['questions'];
  resources: ContextResource[];
}

interface EditSource {
  draftId: string;
  conflictToken: number;
  document: ListeningAuthoringDocumentV1;
}

type EditableTest = TestData & { listeningAudioPreviewUrls?: Record<string, string>; listeningEditSource?: EditSource; versionId?: string; publishedSnapshotVersionId?: string };

const read = async (path: string) => (await get(ref(database, path))).val();
const changed = () => new Error('This Listening test has newer or unpublished changes. Reopen it before saving.');

async function loadSource(test: TestData): Promise<EditSource> {
  const uid = getAuth().currentUser?.uid;
  if (!uid || test.ownerId !== uid) throw new Error('Only the owner can save this Listening test.');
  const workflow = createListeningAuthoringWorkflow();
  const versionId = (test as EditableTest).versionId ?? (test as EditableTest).publishedSnapshotVersionId;
  // Only genuinely legacy rows use the existing first-edit freeze transition.
  if (!versionId) {
    const result = await workflow.publishDraft({ legacyTestId: test.id, idempotencyKey: `edit-legacy-${test.id}` });
    if (result.status !== 'published') throw new Error('Could not prepare the Listening revision. Reopen the test.');
    const draft = await read(`listening_authoring/revision_drafts/${result.draftId}`);
    if (draft?.ownerId !== uid || draft.testId !== test.id || draft.state !== 'active'
      || !Number.isInteger(draft.conflictToken)) throw changed();
    return { draftId: result.draftId, conflictToken: draft.conflictToken, document: draft.document };
  }
  const version = await read(`listening_authoring/versions/${versionId}`);
  if (version?.ownerId !== uid || version.testId !== test.id
    || !['drafts', 'revision_drafts'].includes(version.sourceDraftPath) || !version.sourceDraftId) throw changed();
  const [draft, currentVersionId] = await Promise.all([
    read(`listening_authoring/${version.sourceDraftPath}/${version.sourceDraftId}`),
    read(`tests/${test.id}/versionId`),
  ]);
  if (currentVersionId !== versionId || draft?.ownerId !== uid || draft.testId !== test.id
    || draft.state !== 'active' || !Number.isInteger(draft.conflictToken)) throw changed();
  return { draftId: version.sourceDraftId, conflictToken: draft.conflictToken, document: draft.document };
}

export async function loadListeningTestForEditing(test: TestData): Promise<TestData> {
  if (test.skill !== 'Listening' || test.ownerId !== getAuth().currentUser?.uid) return test;
  const source = await loadSource(test);
  if (source.document?.skill !== 'Listening' || !Array.isArray(source.document.questions) || !Array.isArray(source.document.audioSections)
    || source.document.questions.some(question => !question || typeof question.question !== 'string')
    || source.document.audioSections.some(section => !section || typeof section.audioUrl !== 'string')) throw changed();
  const previews = await Promise.all(source.document.audioSections.filter(section => section.assetId).map(async section => {
    const result = await r2StorageService.probeListeningAuthoringAudio({ assetId: section.assetId!,
      ...(section.uploadSessionId ? { uploadSessionId: section.uploadSessionId } : {}) });
    if (!result.previewUrl) throw new Error('Audio preview is unavailable. Retry opening this Listening test.');
    return [`audio-${section.number}`, result.previewUrl];
  }));
  return { ...test, ...source.document, listeningEditSource: source,
    listeningAudioPreviewUrls: Object.fromEntries(previews) } as EditableTest;
}

function applyEdits(source: ListeningAuthoringDocumentV1, edits: ListeningEdits): ListeningAuthoringDocumentV1 {
  if (edits.resources.some(resource => resource.type === 'text')) {
    throw new Error('Listening context uses audio sections and question images. Text resources cannot be published here.');
  }
  const audioSections = edits.resources.filter(resource => resource.type === 'audio').map((resource, index) => {
    const original = source.audioSections.find(section => resource.id === `audio-${section.number}`);
    if (!original || original.audioUrl !== resource.audioUrl) {
      throw new Error('Audio replacement needs the Listening upload workflow. Existing audio references were kept.');
    }
    return {
      ...original,
      number: index + 1,
      name: resource.title,
      startQuestion: resource.questionStart ?? 0,
      endQuestion: resource.questionEnd ?? 0,
    };
  });
  const questions = edits.questions.map((question, index) => {
    const number = index + 1;
    const section = audioSections.find(audio => number >= audio.startQuestion && number <= audio.endQuestion);
    if (!section) throw new Error(`Question ${number} must belong to a Listening section.`);
    return {
      number, type: question.type, question: question.question, answer: question.answer,
      sectionNumber: section.number, points: question.points,
      ...Object.fromEntries(Object.entries(question).filter(([field]) =>
        ['options', 'explanation', 'acceptableAnswers', 'imageUrl', 'context'].includes(field))),
    };
  });
  const questionImages = edits.resources.filter(resource => resource.type === 'image').flatMap(resource => {
    const originalIndex = /^image-\d+-(\d+)$/u.exec(resource.id)?.[1];
    const original = originalIndex === undefined ? undefined : source.questionImages?.[Number(originalIndex)];
    const section = audioSections.find(audio => (resource.questionStart ?? 0) >= audio.startQuestion
      && (resource.questionEnd ?? 0) <= audio.endQuestion);
    if (!section) throw new Error('Each question image must belong to a Listening section.');
    return (resource.images ?? []).map(imageUrl => ({
      ...original, sectionNumber: section.number, imageUrl,
      questionRange: { start: resource.questionStart, end: resource.questionEnd },
    }));
  });
  return {
    ...source, title: edits.title, duration: edits.duration, isPublic: edits.isPublic,
    questions, questionCount: questions.length, audioSections, questionImages,
    isComplete: questions.length > 0 && questions.every(question => Boolean(question.answer)),
    missingAnswerCount: questions.filter(question => !question.answer).length,
  };
}

/** A session retains operation keys so a lost response can be retried without publishing twice. */
export function createListeningTestEditSession(test: TestData) {
  const workflow = createListeningAuthoringWorkflow();
  const source = (test as EditableTest).listeningEditSource;
  let attempt: { document: ListeningAuthoringDocumentV1; key: string; token?: number } | undefined;
  return async (edits: ListeningEdits) => {
    if (!source) throw new Error('Open this Listening test using Edit in Materials before saving.');
    const document = applyEdits(source.document, edits);
    if (attempt && JSON.stringify(attempt.document) !== JSON.stringify(document)) {
      throw new Error('Retry the pending save with the same edits, or reopen the Listening test.');
    }
    attempt ??= { document, key: crypto.randomUUID() };
    if (attempt.token === undefined) {
      const result = await workflow.saveDraft({
        draftId: source.draftId, expectedConflictToken: source.conflictToken,
        document, idempotencyKey: `${attempt.key}-save`, trigger: 'explicit',
      });
      if (result.status !== 'saved') throw changed();
      attempt.token = result.conflictToken;
    }
    const result = await workflow.publishDraft({
      draftId: source.draftId, expectedConflictToken: attempt.token, idempotencyKey: `${attempt.key}-publish`,
    });
    if (result.status !== 'published') {
      throw new Error(result.status === 'blocked'
        ? 'Changes were saved as a draft, but publication was blocked. Reopen Edit in Materials to review them.'
        : 'Changes were saved as a draft. Publication failed; retry the save or reopen the Listening test.');
    }
    return result;
  };
}
