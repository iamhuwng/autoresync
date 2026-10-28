import { describe, expect, it } from 'vitest';
import { FirebaseRestListeningAuthoringRepository } from '../src/upload-worker/listening-authoring/repository.ts';
import type { ListeningDraftRecord, PublishDraftTransactionInput } from '../../functions/src/listening-authoring/repository.shared.ts';
import type { ListeningAssetBucket } from '../src/upload-worker/listening-authoring/assets.ts';
import type { ListeningUploadSessionRecord } from '../src/upload-worker/listening-upload-session-types.ts';
import { createListeningMediaAssetRecord } from '../../src/features/assessment/listening/storage/listeningAssetRegistry.ts';
import { requestHash } from '../../functions/src/listening-authoring/canonical.ts';
import { parseDocument } from '../../functions/src/listening-authoring/validation.document.ts';

if (!('DurableObject' in globalThis)) Object.assign(globalThis, { DurableObject: class {} });
const { createUploadWorker } = await import('../worker.js');

const publicUrl = 'https://audio.example.test';
const tempKey = 'temp/listening/teacher-1/session-1/asset-1-part.mp3';
const durableKey = 'assessment-assets/listening/teacher-1/asset-1/part.mp3';
const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

const makeDatabase = (omitEmptyCollections = false) => {
  const firebaseValue = (value: unknown) => omitEmptyCollections ? JSON.parse(JSON.stringify(value), (_key, entry) =>
    entry && typeof entry === 'object' && Object.keys(entry).length === 0 ? undefined : entry) ?? null : value;
  const objects = new Map([[tempKey, { bytes: audioBytes.slice(), contentType: 'audio/mpeg' }]]);
  let copies = 0;
  let durableReads = 0;
  let beforeTempRead: (() => Promise<void>) | undefined;
  const bucket: ListeningAssetBucket & { head(key: string): Promise<{ size: number } | null> } = {
    head: async key => {
      const object = objects.get(key);
      return object ? { size: object.bytes.byteLength } : null;
    },
    get: async (key: string, options?: { range?: { offset: number; length: number } }) => {
      if (key === durableKey) durableReads++;
      const object = objects.get(key);
      const range = options?.range;
      return object ? { size: object.bytes.byteLength, httpMetadata: { contentType: object.contentType },
        body: range ? object.bytes.slice(range.offset, range.offset + range.length) : object.bytes.slice(),
        arrayBuffer: async () => {
          if (key === tempKey && beforeTempRead) {
            const action = beforeTempRead;
            beforeTempRead = undefined;
            await action();
          }
          return (range ? object.bytes.slice(range.offset, range.offset + range.length) : object.bytes.slice()).buffer;
        } } : null;
    },
    put: async (key, bytes, options) => {
      copies++;
      objects.set(key, { bytes: bytes.slice(), contentType: options.httpMetadata.contentType });
    },
    delete: async key => { objects.delete(key); },
  };
  const state: Record<string, any> = {
    media_asset_upload_sessions: { 'teacher-1': { 'session-1': {
      schemaVersion: 1, ownerId: 'teacher-1', createdBy: 'teacher-1', uploadSessionId: 'session-1',
      purpose: 'listening-authoring', status: 'active', creationRequestIdHash: 'creation-1',
      createdAt: 1, expiresAt: 10000, maxEligibilityExpiresAt: 10000, bridgeVersion: '0056A-v1',
      assetIds: { 'asset-1': true }, assetRequests: { 'request-1': {
        assetId: 'asset-1', fileName: 'part.mp3', sanitizedFileName: 'part.mp3', declaredMimeType: 'audio/mpeg',
        sizeBytes: audioBytes.byteLength, tempKey, issuedAt: 1, grantExpiresAt: 10000,
      } },
    } satisfies ListeningUploadSessionRecord } },
    listening_authoring: { drafts: { 'draft-1': {
      schemaVersion: 1, recordType: 'draft', draftId: 'draft-1', testId: 'test-1',
      ownerId: 'teacher-1', state: 'active', conflictToken: 1, assetIds: { 'asset-1': true },
      createdAt: 1, createdBy: 'teacher-1', updatedAt: 1, updatedBy: 'teacher-1', lastOperationId: 'save-1',
      document: {
        title: 'IELTS Cambridge 21: Test 1 - Listening', type: 'IELTS', skill: 'Listening',
        duration: 40, difficulty: 'Intermediate', questionCount: 1, isPublic: true,
        isComplete: true, displayMode: 'text', metadata: { description: '', instructions: '', tags: [] },
        audioSections: [{ number: 1, name: 'Part 1', assetId: 'asset-1', audioUrl: `${publicUrl}/${tempKey}`, startQuestion: 1, endQuestion: 1 }],
        questions: [{ number: 1, type: 'short-answer', question: 'Name?', answer: 'Alex', sectionNumber: 1, points: 1 }],
        settings: { allowPause: true, showTimer: true, shuffleQuestions: false, showResults: 'immediate', allowReview: true, passingScore: 60, allowReplay: true },
      },
    } satisfies ListeningDraftRecord } },
  };
  const read = (path: string) => path.split('/').filter(Boolean).reduce((value, key) => value?.[key], state) ?? null;
  const write = (path: string, value: any) => {
    const keys = path.split('/');
    const parent = keys.slice(0, -1).reduce((node, key) => node[key] ??= {}, state);
    if (value === null) delete parent[keys.at(-1)!];
    else parent[keys.at(-1)!] = value;
  };
  let failPatch = false;
  let failCanonical = false;
  let failCommit = false;
  let conflictCanonical = false;
  const writes: string[] = [];
  let beforePatch: (() => void) | undefined;
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname.replace(/^\//, '').replace(/\.json$/, '');
    requests.push(`${init?.method} ${path}`);
    if (init?.method === 'PATCH') {
      if (failPatch) return new Response('{}', { status: 503 });
      beforePatch?.();
      beforePatch = undefined;
      for (const [key, value] of Object.entries(JSON.parse(String(init.body)))) write(key, value);
    } else if (init?.method === 'PUT') {
      if (conflictCanonical && path === 'listening_authoring') {
        conflictCanonical = false;
        return new Response('{}', { status: 412 });
      }
      if (failCanonical && path === 'listening_authoring') return new Response('{}', { status: 503 });
      if (failCommit && path === 'media_assets/asset-1' && JSON.parse(String(init.body)).state === 'committed') {
        return new Response('{}', { status: 503 });
      }
      writes.push(path);
      write(path, firebaseValue(JSON.parse(String(init.body))));
    }
    return new Response(JSON.stringify(firebaseValue(read(path))), { headers: { etag: '"etag-1"' } });
  };
  const env = { FIREBASE_DB_URL: 'https://database.example.test', R2_BUCKET: bucket, PUBLIC_URL: publicUrl };
  const createRepository = () => new FirebaseRestListeningAuthoringRepository({ env, fetchImpl,
    getAccessToken: async () => 'test-token', now: () => 1000 });
  const repository = createRepository();
  const publish: PublishDraftTransactionInput = {
    ownerId: 'teacher-1', draftId: 'draft-1', operationId: 'publish-1', versionId: 'version-1',
    idempotencyKeyHash: 'key-1', requestHash: 'request-1', expectedConflictToken: 1, publishedAt: 1000,
  };
  const save = { ownerId: 'teacher-1', draftId: 'draft-1', operationId: 'save-2', idempotencyKeyHash: 'save-key',
    requestHash: 'save-request', document: state.listening_authoring.drafts['draft-1'].document,
    allowCreate: false, expectedConflictToken: 1 };
  return { state, read, repository, publish, save, objects, writes, requests, env, createRepository, copies: () => copies,
    durableReads: () => durableReads,
    failCanonical: () => { failCanonical = true; }, allowCanonical: () => { failCanonical = false; },
    failCommit: () => { failCommit = true; }, allowCommit: () => { failCommit = false; },
    conflictNextCanonical: () => { conflictCanonical = true; },
    beforeNextTempRead: (action: () => Promise<void>) => { beforeTempRead = action; },
    failNextPatch: () => { failPatch = true; },
    allowPatch: () => { failPatch = false; }, beforeNextPatch: (action: () => void) => { beforePatch = action; } };
};

describe('Listening published material discovery', () => {
  it('round-trips RTDB-omitted empty arrays through draft blockers, later save, and stable publication hashing', async () => {
    const db = makeDatabase(true);
    const emptyDocument = { ...db.save.document, audioSections: [], questions: [], questionCount: 0 };
    expect((await db.repository.saveDraftTransaction({ ...db.save, document: emptyDocument })).kind).toBe('saved');
    expect(db.read('listening_authoring/drafts/draft-1').document).not.toHaveProperty('questions');
    expect((await db.repository.getDraft('draft-1'))?.document).toMatchObject({
      audioSections: [], questions: [], metadata: { tags: [] },
    });
    expect(await db.repository.publishDraftTransaction({ ...db.publish, expectedConflictToken: 2 })).toMatchObject({
      kind: 'blocked', blockers: expect.arrayContaining([
        expect.objectContaining({ field: 'audioSections' }), expect.objectContaining({ field: 'questions' }),
      ]),
    });
    const document = { ...db.save.document, questionImages: [], questions: db.save.document.questions.map((question: any) => ({
      ...question, options: [], acceptableAnswers: [], context: { contextLines: [] },
    })) };
    expect((await db.repository.saveDraftTransaction({ ...db.save, document, expectedConflictToken: 2,
      operationId: 'save-3', idempotencyKeyHash: 'save-key-3', requestHash: 'save-request-3' })).kind).toBe('saved');
    const publish = { ...db.publish, expectedConflictToken: 3, operationId: 'publish-2',
      idempotencyKeyHash: 'publish-key-2', requestHash: 'publish-request-2' };
    expect((await db.repository.publishDraftTransaction(publish)).kind).toBe('published');
    const stored = db.read('listening_authoring/versions/version-1');
    const restored = parseDocument({ ...stored.document, metadata: { ...stored.document.metadata, tags: [] } });
    expect(stored.documentHash).toBe(requestHash(restored));
    expect((await db.createRepository().publishDraftTransaction(publish)).kind).toBe('replayed');
  });

  it.each([[], {}])('keeps an RTDB-omitted empty answer blocked for %j', async answer => {
    const db = makeDatabase(true);
    const document = { ...db.save.document, questions: db.save.document.questions.map((question: any) => ({ ...question, answer })) };
    expect((await db.repository.saveDraftTransaction({ ...db.save, document })).kind).toBe('saved');
    expect((await db.repository.getDraft('draft-1'))?.document.questions[0].answer).toBe('');
    expect(await db.repository.publishDraftTransaction({ ...db.publish, expectedConflictToken: 2 })).toMatchObject({
      kind: 'blocked', blockers: expect.arrayContaining([expect.objectContaining({ field: 'questions[0].answer' })]),
    });
  });

  it.each(['invalid', null])('rejects malformed persisted arrays (%j) instead of replacing them with empty collections', async questions => {
    const db = makeDatabase(true);
    db.state.listening_authoring.drafts['draft-1'].document.questions = questions;
    await expect(db.repository.publishDraftTransaction(db.publish)).rejects.toThrow('document.questions must be an array');
  });

  it('publishes the owned draft without parsing an unrelated malformed draft', async () => {
    const db = makeDatabase(true);
    db.state.listening_authoring.drafts['unrelated-draft'] = {
      ...db.state.listening_authoring.drafts['draft-1'],
      draftId: 'unrelated-draft', ownerId: 'other-teacher', document: { questions: 'invalid' },
    };
    expect((await db.repository.publishDraftTransaction(db.publish)).kind).toBe('published');
    expect(db.read('listening_authoring/drafts/unrelated-draft').document).toEqual({ questions: 'invalid' });
  });

  it('delivers freshly published audio through authenticated solo signing and byte-range playback', async () => {
    const db = makeDatabase();
    expect((await db.repository.publishDraftTransaction(db.publish)).kind).toBe('published');
    expect(db.read('tests/test-1')).toMatchObject({ versionId: 'version-1', isPublished: true });
    const worker = createUploadWorker({ now: () => 1000,
      firebaseVerifier: { async verifyAuthorizationHeader(header: string | null) {
        return header === 'Bearer independent-student-token' ? { valid: true, uid: 'student-2' } : { valid: false };
      } },
    });
    const env = { ...db.env, LISTENING_DELIVERY_SECRET: 'local-listening-delivery-secret-32-bytes-minimum',
      UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
      readDatabaseValue: async (path: string) => db.read(path),
    };
    const response = await worker.fetch(new Request('https://upload.example/listening-delivery/solo', {
      method: 'POST', headers: { Authorization: 'Bearer independent-student-token',
        Origin: 'http://localhost:5174', 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: 'asset-1', testId: 'test-1', versionId: 'version-1', mode: 'self_study' }),
    }), env);
    expect(response.status).toBe(200);
    const issued = await response.json() as { url: string; deliveryReady: boolean };
    expect(issued.deliveryReady).toBe(true);
    expect(new URL(issued.url).pathname).toBe('/listening-delivery/content');
    expect(new URL(issued.url).searchParams.get('token')).toBeTruthy();
    const audio = await worker.fetch(new Request(issued.url, { headers: { Range: 'bytes=1-4' } }), env);
    expect(audio.status).toBe(206);
    expect(audio.headers.get('Content-Range')).toBe(`bytes 1-4/${audioBytes.byteLength}`);
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(audioBytes.slice(1, 5));
  });

  it('saves durable audio before committing the canonical draft reference and registry', async () => {
    const db = makeDatabase();
    expect((await db.repository.saveDraftTransaction(db.save)).kind).toBe('saved');
    expect(db.read('listening_authoring/drafts/draft-1').document.audioSections[0]).toMatchObject({
      audioUrl: `${publicUrl}/${durableKey}`, streamUrl: `${publicUrl}/${durableKey}`,
    });
    expect(db.objects.get(durableKey)?.bytes).toEqual(audioBytes);
    expect(db.objects.has(tempKey)).toBe(false);
    expect(db.read('media_assets/asset-1')).toMatchObject({ state: 'committed', durableKey,
      checksum: 'b6d37b6c13d6828125cb0c675165a1e19bb38f61f1f320aeb643f2999040cbfa', references: { drafts: { 'draft-1': true } } });
    const canonicalWrite = db.writes.indexOf('listening_authoring');
    expect(db.writes.slice(canonicalWrite + 1)).toEqual(['media_assets/asset-1', 'media_assets/asset-1']);
  });

  it('retains the temp and verified durable copy after canonical failure and retries without another copy', async () => {
    const db = makeDatabase();
    db.failCanonical();
    await expect(db.repository.saveDraftTransaction(db.save)).rejects.toThrow();
    expect(db.read('media_assets/asset-1')).toMatchObject({ state: 'committing', references: {} });
    expect(db.read('listening_authoring/drafts/draft-1').conflictToken).toBe(1);
    expect(db.objects.has(tempKey)).toBe(true);
    expect(db.objects.get(durableKey)?.bytes).toEqual(audioBytes);
    db.allowCanonical();
    expect((await db.repository.saveDraftTransaction(db.save)).kind).toBe('saved');
    expect(db.copies()).toBe(1);
    expect(db.objects.has(tempKey)).toBe(false);
  });

  it('preserves a concurrent asset commit when a stale save retries its canonical transaction', async () => {
    const db = makeDatabase();
    db.state.media_assets = { 'asset-1': createListeningMediaAssetRecord({
      assetId: 'asset-1', ownerId: 'teacher-1', uploadSessionId: 'session-1', tempKey,
      contentType: 'audio/mpeg', sizeBytes: audioBytes.byteLength,
      checksum: 'b6d37b6c13d6828125cb0c675165a1e19bb38f61f1f320aeb643f2999040cbfa',
      createdAt: 1, createdBy: 'teacher-1',
    }) };
    db.beforeNextTempRead(async () => {
      expect((await db.createRepository().saveDraftTransaction(db.save)).kind).toBe('saved');
      expect(db.read('media_assets/asset-1').state).toBe('committed');
      expect(db.objects.has(tempKey)).toBe(false);
      db.conflictNextCanonical();
    });
    expect((await db.repository.saveDraftTransaction(db.save)).kind).toBe('replayed');
    expect(db.read('media_assets/asset-1').state).toBe('committed');
    expect(db.objects.has(tempKey)).toBe(false);
    expect(db.objects.get(durableKey)?.bytes).toEqual(audioBytes);
    expect(db.copies()).toBe(1);
  });

  it.each(['missing', 'corrupt'])('blocks publication when committed durable audio is %s', async mode => {
    const db = makeDatabase();
    await db.repository.saveDraftTransaction(db.save);
    if (mode === 'missing') db.objects.delete(durableKey);
    else {
      const corrupt = audioBytes.slice();
      corrupt[corrupt.length - 1] ^= 1;
      db.objects.set(durableKey, { bytes: corrupt, contentType: 'audio/mpeg' });
    }
    expect((await db.createRepository().publishDraftTransaction({ ...db.publish, expectedConflictToken: 2 })).kind).toBe('blocked');
    expect(db.read('listening_authoring/versions')).toEqual({});
    expect(db.read('tests/test-1')).toBeNull();
    expect(db.read('material_catalog')).toBeNull();
  });

  it('hashes immutable durable audio once across publish and projection within a request', async () => {
    const db = makeDatabase();
    await db.repository.saveDraftTransaction(db.save);
    const priorReads = db.durableReads();
    expect((await db.createRepository().publishDraftTransaction({ ...db.publish, expectedConflictToken: 2 })).kind).toBe('published');
    expect(db.durableReads() - priorReads).toBe(1);
    expect(db.read('tests/test-1')).toMatchObject({ versionId: 'version-1', isPublished: true });
  });

  it('publishes four saved audio sections without repeating asset finalization before the student projection', async () => {
    const db = makeDatabase();
    await db.repository.saveDraftTransaction(db.save);
    const draft = db.read('listening_authoring/drafts/draft-1');
    const original = db.read('media_assets/asset-1');
    for (let number = 2; number <= 4; number++) {
      const assetId = `asset-${number}`;
      const key = durableKey.replace('asset-1', assetId);
      db.state.media_assets[assetId] = { ...structuredClone(original), assetId, canonicalAssetId: assetId,
        durableKey: key, tempKey: tempKey.replace('asset-1', assetId), publicUrl: `${publicUrl}/${key}` };
      db.objects.set(key, { bytes: audioBytes.slice(), contentType: 'audio/mpeg' });
      draft.assetIds[assetId] = true;
      draft.document.audioSections.push({ ...draft.document.audioSections[0], number, name: `Part ${number}`,
        assetId, audioUrl: `${publicUrl}/${key}`, streamUrl: `${publicUrl}/${key}`, startQuestion: number, endQuestion: number });
      draft.document.questions.push({ ...draft.document.questions[0], number, sectionNumber: number });
    }
    draft.document.questionCount = 4;
    const before = db.requests.length;
    expect((await db.createRepository().publishDraftTransaction({ ...db.publish, expectedConflictToken: 2 })).kind).toBe('published');
    const requests = db.requests.slice(before);
    expect(requests.length, requests.join('\n')).toBeLessThanOrEqual(40);
    expect(db.read('student_safe_tests/test-1').audioSections.map((section: any) => section.assetId))
      .toEqual(['asset-1', 'asset-2', 'asset-3', 'asset-4']);
    for (let number = 1; number <= 4; number++) {
      expect(requests.filter(request => request === `PUT media_assets/asset-${number}`)).toHaveLength(1);
    }
    const saved = db.read('listening_authoring/drafts/draft-1');
    const oldKeys = saved.document.audioSections.map((audio: any) => db.read(`media_assets/${audio.assetId}`).durableKey);
    saved.document.audioSections = saved.document.audioSections.map((audio: any, index: number) => {
      const assetId = `replacement-${index + 1}`;
      const key = durableKey.replace('asset-1', assetId);
      db.state.media_assets[assetId] = { ...structuredClone(original), assetId, canonicalAssetId: assetId,
        durableKey: key, tempKey: tempKey.replace('asset-1', assetId), publicUrl: `${publicUrl}/${key}`, references: {} };
      db.objects.set(key, { bytes: audioBytes.slice(), contentType: 'audio/mpeg' });
      return { ...audio, assetId, audioUrl: `${publicUrl}/${key}`, streamUrl: `${publicUrl}/${key}` };
    });
    saved.assetIds = Object.fromEntries(saved.document.audioSections.map((audio: any) => [audio.assetId, true]));
    const beforeReplacement = db.requests.length;
    expect((await db.createRepository().publishDraftTransaction({ ...db.publish, expectedConflictToken: saved.conflictToken,
      versionId: 'version-2', operationId: 'publish-2', idempotencyKeyHash: 'publish-key-2', requestHash: 'publish-request-2' })).kind).toBe('published');
    const replacementRequests = db.requests.slice(beforeReplacement);
    expect(replacementRequests.length, replacementRequests.join('\n')).toBeLessThanOrEqual(45);
    expect(db.read('student_safe_tests/test-1').versionId).toBe('version-2');
    expect(oldKeys.every((key: string) => !db.objects.has(key))).toBe(true);
    for (let number = 1; number <= 4; number++) {
      expect(db.read(`media_assets/asset-${number}`).replacement).toMatchObject({ assetId: `replacement-${number}`, cleanupCompletedAt: 1000 });
    }
  });

  it('rejects untrusted uploads and missing public URL configuration before publication', async () => {
    const db = makeDatabase();
    delete db.state.media_asset_upload_sessions['teacher-1']['session-1'];
    expect((await db.repository.publishDraftTransaction(db.publish)).kind).toBe('blocked');
    expect(db.read('media_assets')).toBeNull();
    const unconfigured = makeDatabase();
    unconfigured.env.PUBLIC_URL = '';
    expect((await unconfigured.createRepository().publishDraftTransaction(unconfigured.publish)).kind).toBe('blocked');
    expect(unconfigured.read('tests/test-1')).toBeNull();
    expect(unconfigured.read('media_assets')).toBeNull();
  });

  it('repairs registry finalization on publish replay before exposing a launchable test', async () => {
    const db = makeDatabase();
    db.failCommit();
    await expect(db.repository.publishDraftTransaction(db.publish)).rejects.toThrow();
    expect(db.read('listening_authoring/versions/version-1').document.audioSections[0].audioUrl).toBe(`${publicUrl}/${durableKey}`);
    expect(db.read('media_assets/asset-1').state).toBe('committing');
    expect(db.objects.has(tempKey)).toBe(true);
    expect(db.read('tests/test-1')).toBeNull();
    expect(db.read('material_catalog')).toBeNull();
    db.allowCommit();
    expect((await db.repository.publishDraftTransaction(db.publish)).kind).toBe('replayed');
    expect(db.read('media_assets/asset-1')).toMatchObject({ state: 'committed', references: { versions: { 'version-1': true } } });
    expect(db.objects.has(tempKey)).toBe(false);
    expect(db.copies()).toBe(1);
    expect(db.read('tests/test-1')).toMatchObject({ versionId: 'version-1', isPublished: true });
    expect(Object.keys(db.read('listening_authoring/versions'))).toEqual(['version-1']);
  });

  it('publishes a launchable test and its owner/public lobby indexes', async () => {
    const { repository, publish, read } = makeDatabase();
    expect((await repository.publishDraftTransaction(publish)).kind).toBe('published');
    expect(read('tests/test-1')).toMatchObject({ id: 'test-1', versionId: 'version-1', isPublished: true });
    const summary = read('material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment/test-1');
    expect(summary).toMatchObject({ title: 'IELTS Cambridge 21: Test 1 - Listening', sourceSnapshotVersionId: 'version-1' });
    expect(read('material_catalog/material_summary_indexes/v1/by_visibility_family/public/assessment/test-1')).toEqual(summary);
    expect(summary).not.toHaveProperty('questions');
  });

  it('surfaces projection failure and repairs it on idempotent retry without another version', async () => {
    const db = makeDatabase();
    db.failNextPatch();
    await expect(db.repository.publishDraftTransaction(db.publish)).rejects.toThrow();
    expect(db.read('tests/test-1')).toBeNull();
    db.allowPatch();
    expect((await db.repository.publishDraftTransaction(db.publish)).kind).toBe('replayed');
    expect(db.read('tests/test-1')).toMatchObject({ versionId: 'version-1' });
    expect(Object.keys(db.read('listening_authoring/versions'))).toEqual(['version-1']);
    expect(db.copies()).toBe(1);
  });

  it('converges to a newer publication when another writer races the projection', async () => {
    const db = makeDatabase();
    db.beforeNextPatch(() => {
      const first = db.read('listening_authoring/versions/version-1');
      db.state.listening_authoring.versions['version-2'] = { ...first, versionId: 'version-2', versionNumber: 2, publishedAt: 2000 };
    });
    await db.repository.publishDraftTransaction(db.publish);
    expect(db.read('tests/test-1')).toMatchObject({ versionId: 'version-2' });
    expect(db.read('material_catalog/material_summary_indexes/v1/by_id/test-1')).toMatchObject({ sourceSnapshotVersionId: 'version-2' });
  });

  it('archives the exposed version and does not resurrect it on publish replay', async () => {
    const db = makeDatabase();
    await db.repository.publishDraftTransaction(db.publish);
    const archived = await db.repository.lifecycleTransaction({
      ownerId: 'teacher-1', operationId: 'archive-1', operationType: 'archive',
      targetId: 'version-1', idempotencyKeyHash: 'archive-key', requestHash: 'archive-request',
      expectedConflictToken: 1, completedAt: 2000,
    });
    expect(archived.kind).toBe('archived');
    await db.repository.publishDraftTransaction(db.publish);
    expect(db.read('tests/test-1')).toMatchObject({ versionId: 'version-1', isPublished: false });
    expect(db.read('material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment/test-1')).toBeNull();
  });

  it('converges when the same version is archived during its publication projection', async () => {
    const db = makeDatabase();
    db.beforeNextPatch(() => {
      db.state.listening_authoring.versions['version-1'].archive = { state: 'archived', archivedAt: 2000 };
    });
    await db.repository.publishDraftTransaction(db.publish);
    expect(db.read('tests/test-1')).toMatchObject({ isPublished: false });
    expect(db.read('material_catalog/material_summary_indexes/v1/by_visibility_family/public/assessment/test-1')).toBeNull();
  });
});
