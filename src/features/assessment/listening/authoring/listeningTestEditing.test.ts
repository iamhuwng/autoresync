import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSaveDraftRequest } from '../../../../../functions/src/listening-authoring/validation';
import { adaptTestToResources } from '../../../../components/test/editor/resourceAdapters';
import { createListeningTestEditSession, loadListeningTestForEditing, uploadListeningEditorAudio } from './listeningTestEditing';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(), probe: vi.fn(), uid: 'owner', records: {} as Record<string, any>, get: vi.fn(), save: vi.fn(), publish: vi.fn(),
}));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: mocks.uid } }) }));
vi.mock('firebase/database', () => ({ ref: (_db: unknown, path: string) => path, get: mocks.get }));
vi.mock('../../../../services/firebase', () => ({ database: {} }));
vi.mock('../storage/listeningUploadSessionApi', () => ({
  WorkerListeningUploadSessionApi: class { probeAsset = mocks.probe; },
}));
vi.mock('./listeningAuthoringWorkflow', () => ({
  createListeningAuthoringWorkflow: () => ({ saveDraft: mocks.save, publishDraft: mocks.publish }),
}));

const document = {
  title: 'Listening', type: 'IELTS', skill: 'Listening', duration: 30,
  difficulty: 'Intermediate', questionCount: 2, isPublic: true, isComplete: true, displayMode: 'image',
  metadata: { description: '', instructions: 'Listen.', tags: [], transcript: 'Preserved transcript' },
  audioSections: [{
    number: 1, name: 'Section 1', audioUrl: 'https://audio.example/temp/original.mp3',
    streamUrl: 'https://audio.example/stream/original', assetId: 'asset-original',
    startQuestion: 1, endQuestion: 2, waitTimeBefore: 15, playLimit: 1,
  }],
  questionImages: [{ sectionNumber: 1, imageUrl: 'https://images.example/questions.png', imageCaption: 'Keep caption', questionRange: { start: 1, end: 2 } }],
  questions: [1, 2].map(number => ({ number, type: 'short-answer', question: '', answer: 'answer', sectionNumber: 1, points: 1,
    explanation: 'Preserved explanation', acceptableAnswers: ['variant'], context: { sectionHeading: 'Section 1', contextLines: ['Keep context'] } })),
  settings: { allowPause: true, showTimer: true, shuffleQuestions: false, showResults: 'after-submission', allowReview: true, passingScore: 60, allowReplay: false, audioControls: { showPlayPause: false, showProgressBar: true, showSeekControl: false, showSpeedControl: false, showSkipSection: false, showVolumeControl: true } },
};
const test = { ...document, id: 'test-1', ownerId: 'owner', versionId: 'version-1' } as any;
const saved = { status: 'saved', draftId: 'draft-1', conflictToken: 9 };
const published = { status: 'published', draftId: 'draft-1', versionId: 'version-2', conflictToken: 10, versionNumber: 2 };
const edits = (editable: any) => ({ title: 'Edited title', duration: editable.duration, isPublic: editable.isPublic, questions: editable.questions, resources: adaptTestToResources(editable) });

describe('Listening published-test editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uid = 'owner';
    mocks.probe.mockResolvedValue({ previewUrl: 'https://worker.example/listening-content?token=owner-preview' });
    mocks.records = {
      'listening_authoring/versions/version-1': { ownerId: 'owner', testId: test.id, sourceDraftPath: 'drafts', sourceDraftId: 'draft-1', document: structuredClone(document) },
      'listening_authoring/drafts/draft-1': { ownerId: 'owner', testId: test.id, state: 'active', conflictToken: 8, document: structuredClone(document) },
      'tests/test-1/versionId': 'version-1',
    };
    mocks.get.mockImplementation(async path => ({ val: () => mocks.records[path] ?? null }));
    mocks.save.mockResolvedValue(saved);
    mocks.publish.mockResolvedValue(published);
  });

  it('loads the working draft, preserves native fields, replaces deleted questions, and publishes through strict authoring validation', async () => {
    mocks.records['listening_authoring/drafts/draft-1'].document.title = 'Unpublished title';
    const editable = await loadListeningTestForEditing(test);
    expect(editable.title).toBe('Unpublished title');
    expect((editable as any).listeningAudioPreviewUrls).toEqual({ 'asset-original': 'https://worker.example/listening-content?token=owner-preview' });
    expect(mocks.probe).toHaveBeenCalledWith({ assetId: 'asset-original' });
    const input = edits(editable);
    input.questions = [{ ...input.questions[0], answer: 'changed', resourceId: 'editor-only' }];
    await createListeningTestEditSession(editable)(input);
    const request = mocks.save.mock.calls[0][0];
    expect(() => parseSaveDraftRequest(request)).not.toThrow();
    expect(request).toMatchObject({ draftId: 'draft-1', expectedConflictToken: 8 });
    expect(request.document).toMatchObject({ title: 'Edited title', questionCount: 1, settings: document.settings, metadata: document.metadata, audioSections: document.audioSections, questionImages: document.questionImages });
    expect(request.document.questions).toHaveLength(1);
    expect(request.document.questions[0]).not.toHaveProperty('resourceId');
    expect(request.document.questions[0]).toMatchObject({ explanation: 'Preserved explanation', acceptableAnswers: ['variant'], context: document.questions[0].context });
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ draftId: 'draft-1', expectedConflictToken: 9 }));
    expect(mocks.records['listening_authoring/versions/version-1'].document).toEqual(document);
  });

  it('replays a lost publication response with the same key and does not save the draft twice', async () => {
    const editable = await loadListeningTestForEditing(test);
    const save = createListeningTestEditSession(editable);
    mocks.publish.mockRejectedValueOnce(new Error('network response lost')).mockResolvedValue(published);
    await expect(save(edits(editable))).rejects.toThrow('network response lost');
    await expect(save(edits(editable))).resolves.toEqual(published);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.publish.mock.calls[0][0]).toEqual(mocks.publish.mock.calls[1][0]);
  });

  it.each(['text', 'image'])('preserves %s mode and question context while saving audio metadata edits', async displayMode => {
    mocks.records['listening_authoring/drafts/draft-1'].document.displayMode = displayMode;
    const editable = await loadListeningTestForEditing(test);
    const input = edits(editable);
    input.resources[0] = { ...input.resources[0], title: 'Renamed section', questionStart: 1, questionEnd: 2, duration: 42 };
    input.questions[0] = { ...input.questions[0], question: 'Updated text question', answer: 'updated answer', timer: 25, optionLabelFormat: 'roman' };
    await createListeningTestEditSession(editable)(input);
    const request = mocks.save.mock.calls[0][0];
    expect(parseSaveDraftRequest(request).document).toMatchObject({ displayMode, audioSections: [{ name: 'Renamed section', duration: 42 }], questions: [{ question: 'Updated text question', context: document.questions[0].context, timer: 25, optionLabelFormat: 'roman' }, {}] });
    expect(mocks.records['listening_authoring/versions/version-1'].document).toEqual(document);
  });

  it('uploads a new authorized asset and preserves the old publication through replacement and failed save', async () => {
    const editable = await loadListeningTestForEditing(test);
    const uploaded = { url: 'https://audio.example/temp/new.wav', assetId: 'asset-new', uploadSessionId: 'session-new' };
    mocks.upload.mockResolvedValue(uploaded);
    mocks.probe.mockResolvedValue({ status: 'ready', assetId: 'asset-new' });
    const file = new File(['audio'], 'replacement.wav', { type: 'audio/wav' });
    const replacement = await uploadListeningEditorAudio(editable, file, vi.fn(), mocks.upload);
    expect(mocks.upload).toHaveBeenCalledWith(file, expect.objectContaining({ draftId: 'draft-1' }), expect.any(Function));
    const input = edits(editable);
    input.resources[0] = { ...input.resources[0], ...replacement.resource };
    expect(replacement.previewUrl).toBe(uploaded.url);
    mocks.save.mockRejectedValue(new Error('save unavailable'));
    await expect(createListeningTestEditSession(editable)(input)).rejects.toThrow('save unavailable');
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.records['listening_authoring/versions/version-1'].document).toEqual(document);
    const request = mocks.save.mock.calls[0][0];
    expect(parseSaveDraftRequest(request).document.audioSections[0]).toMatchObject({ assetId: 'asset-new', audioUrl: uploaded.url });
    expect(request.document.audioSections[0]).not.toHaveProperty('uploadSessionId');
  });

  it('rejects an arbitrary replacement URL without upload-session metadata', async () => {
    const editable = await loadListeningTestForEditing(test);
    const input = edits(editable);
    input.resources[0] = { ...input.resources[0], audioUrl: 'https://untrusted.example/audio.mp3' };
    await expect(createListeningTestEditSession(editable)(input)).rejects.toThrow(/upload workflow/);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('allows the owner to replace missing original audio without changing the old version', async () => {
    mocks.probe.mockRejectedValueOnce(new Error('asset_not_found'));
    const editable = await loadListeningTestForEditing(test);
    expect((editable as any).listeningAudioPreviewWarnings).toEqual(['Section 1']);
    expect((editable as any).listeningAudioPreviewUrls).toEqual({});
    expect(editable.audioSections).toEqual(document.audioSections);
    mocks.upload.mockResolvedValue({ url: 'https://audio.example/temp/new.wav', assetId: 'new', uploadSessionId: 'session' });
    mocks.probe.mockResolvedValue({ status: 'ready', assetId: 'new' });
    const replacement = await uploadListeningEditorAudio(editable, new File(['audio'], 'new.wav', { type: 'audio/wav' }), vi.fn(), mocks.upload);
    const input = edits(editable);
    input.resources[0] = { ...input.resources[0], ...replacement.resource };
    await createListeningTestEditSession(editable)(input);
    expect(parseSaveDraftRequest(mocks.save.mock.calls[0][0]).document.audioSections[0].assetId).toBe('new');
    expect(mocks.records['listening_authoring/versions/version-1'].document).toEqual(document);
  });

  it('does not replace saved audio when the uploaded asset is not ready', async () => {
    const editable = await loadListeningTestForEditing(test);
    mocks.upload.mockResolvedValue({ url: 'https://audio.example/temp/new.wav', assetId: 'new', uploadSessionId: 'session' });
    mocks.probe.mockResolvedValue({});
    await expect(uploadListeningEditorAudio(editable, new File(['audio'], 'new.wav', { type: 'audio/wav' }), vi.fn(), mocks.upload))
      .rejects.toThrow(/not ready/);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.records['listening_authoring/versions/version-1'].document).toEqual(document);
  });

  it('does not publish after a stale draft conflict, or accept a stale runtime version on load', async () => {
    const editable = await loadListeningTestForEditing(test);
    mocks.save.mockResolvedValue({ status: 'conflict' });
    await expect(createListeningTestEditSession(editable)(edits(editable))).rejects.toThrow(/newer or unpublished/);
    expect(mocks.publish).not.toHaveBeenCalled();
    mocks.records['tests/test-1/versionId'] = 'version-newer';
    await expect(loadListeningTestForEditing(test)).rejects.toThrow(/newer or unpublished/);
  });

  it('keeps public non-owners read-only without querying owner-only authoring nodes', async () => {
    mocks.uid = 'another-teacher';
    expect(await loadListeningTestForEditing(test)).toBe(test);
    expect(mocks.get).not.toHaveBeenCalled();
    await expect(createListeningTestEditSession(test)(edits(test))).rejects.toThrow(/Edit in Materials/);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each([{ items: [{ id: 'a', text: 'Match item' }], answers: { a: 'B' } }, { answer: { a: 'B' } }])('does not freeze or rewrite a legacy interactive structure the editor cannot preserve: %j', async structure => {
    const legacy = { ...test, versionId: undefined, displayMode: 'text', questions: [{ ...test.questions[0], ...structure }] };
    await expect(loadListeningTestForEditing(legacy)).rejects.toThrow(/under construction/);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('reports blocked publication and leaves the saved draft available on reopen', async () => {
    const editable = await loadListeningTestForEditing(test);
    mocks.publish.mockResolvedValue({ status: 'blocked' });
    await expect(createListeningTestEditSession(editable)(edits(editable))).rejects.toThrow(/saved as a draft.*blocked/);
    mocks.records['listening_authoring/drafts/draft-1'].document.title = 'Edited title';
    expect((await loadListeningTestForEditing(test)).title).toBe('Edited title');
  });

  it('uses the first-edit freeze only for a legacy record', async () => {
    mocks.publish.mockResolvedValue({ ...published, versionId: 'version-legacy', draftId: 'revision-1' });
    mocks.records['listening_authoring/revision_drafts/revision-1'] = { ownerId: 'owner', testId: test.id, state: 'active', conflictToken: 1, document };
    const editable = await loadListeningTestForEditing({ ...test, versionId: undefined });
    expect(editable.questions).toEqual(document.questions);
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ legacyTestId: test.id }));
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('rejects malformed authoring questions before mounting the editor', async () => {
    mocks.records['listening_authoring/drafts/draft-1'].document.questions = [null];
    await expect(loadListeningTestForEditing(test)).rejects.toThrow(/newer or unpublished/);
    mocks.records['listening_authoring/drafts/draft-1'].document = { ...document, skill: 'Reading' };
    await expect(loadListeningTestForEditing(test)).rejects.toThrow(/newer or unpublished/);
  });
});
