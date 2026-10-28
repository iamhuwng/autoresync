import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { replaceListeningPublishedAudio, resolveListeningAudioReplacement, readListeningAudioReplacementWarning } from '../src/upload-worker/listening-authoring/audio-replacement.ts';
import { createListeningDeliveryWorkerHandlers, createOwnerListeningPreviewUrl } from '../src/upload-worker/listening-delivery.ts';

const fixture = () => {
  const objects = new Map<string, Uint8Array>();
  const asset = (id: string, number: number) => {
    const bytes = new Uint8Array([number, number + 1, number + 2, number + 3]);
    const durableKey = `assessment-assets/listening/teacher/${id}/part.mp3`;
    objects.set(durableKey, bytes);
    return { assetId: id, canonicalAssetId: id, ownerId: 'teacher', state: 'committed', uploadSessionId: 'session',
      durableKey, tempKey: `temp/listening/teacher/session/${id}-part.mp3`, sizeBytes: bytes.length,
      contentType: 'audio/mpeg', checksum: createHash('sha256').update(bytes).digest('hex'),
      references: { versions: { [`version-${number}`]: true } } };
  };
  const version = (id: string, number: number) => ({ recordType: 'published-version', versionId: `version-${number}`,
    versionNumber: number, testId: 'test', ownerId: 'teacher', assetIds: { [id]: true }, archive: { state: 'active' },
    document: { skill: 'Listening', isPublic: true, audioSections: [{ assetId: id, number: 1 }] } });
  const previous = version('old', 1);
  const current = version('new', 2);
  const versions = { 'version-1': previous, 'version-2': current } as Record<string, any>;
  const state: Record<string, any> = {
    media_assets: { old: asset('old', 1), new: asset('new', 2) },
    tests: { test: { id: 'test', ownerId: 'teacher', versionId: current.versionId, audioSections: current.document.audioSections } },
    listening_authoring: { versions },
  };
  const events: string[] = [];
  const read = async (path: string) => path.split('/').reduce((node, part) => node?.[part], state) ?? null;
  const rtdb = { readValue: vi.fn(read), patchAdminMultiLocation: vi.fn(async (updates: Record<string, unknown>) => {
    events.push('patch');
    for (const [path, value] of Object.entries(updates)) {
      const parts = path.split('/');
      const parent = parts.slice(0, -1).reduce((node, part) => node[part] ??= {}, state);
      parent[parts.at(-1)!] = value;
    }
  }) };
  const bucket = {
    head: vi.fn(async (key: string) => objects.has(key) ? { size: objects.get(key)!.length } : null),
    get: vi.fn(async (key: string, options?: { range?: { offset: number; length: number } }) => {
      const bytes = objects.get(key);
      if (!bytes) return null;
      const range = options?.range;
      const body = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
      return { size: bytes.length, httpMetadata: { contentType: 'audio/mpeg' },
        body, arrayBuffer: async () => body.slice().buffer };
    }),
    delete: vi.fn(async (key: string) => { events.push(`delete ${key}`); objects.delete(key); }),
    put: vi.fn(),
  };
  const verify = vi.fn(async (record: any) => {
    const bytes = objects.get(record.durableKey);
    if (!bytes || bytes.length !== record.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== record.checksum) throw new Error('corrupt target');
  });
  const replace = (from = previous, to = current) => replaceListeningPublishedAudio({ rtdb: rtdb as any,
    bucket, previous: from as any, current: to as any, versions, verify, now: 100 });
  const env = { R2_BUCKET: bucket, readDatabaseValue: read,
    LISTENING_DELIVERY_SECRET: 'replacement-tests-signing-secret-32-bytes' };
  return { state, objects, versions, previous, current, rtdb, bucket, verify, replace, read, events, env, asset, version };
};

describe('Listening recording replacement', () => {
  it('commits the resolver before deleting old objects, retains historical text and repairs a failed delete', async () => {
    const f = fixture();
    const historical = structuredClone(f.previous);
    f.bucket.delete.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(f.replace()).rejects.toThrow('storage unavailable');
    expect(f.state.media_assets.old.replacement).toMatchObject({ assetId: 'new', sourceVersionId: 'version-1', targetVersionId: 'version-2' });
    expect(f.state.media_assets.old.replacement.cleanupCompletedAt).toBeUndefined();
    expect(f.objects.has(f.state.media_assets.old.durableKey)).toBe(true);
    await f.replace();
    expect(f.events[0]).toBe('patch');
    expect(f.state.media_assets.old.replacement.cleanupCompletedAt).toBe(100);
    expect(f.objects.has(f.state.media_assets.old.durableKey)).toBe(false);
    expect(f.objects.has(f.state.media_assets.new.durableKey)).toBe(true);
    expect(f.previous).toEqual(historical);
    const deletes = f.bucket.delete.mock.calls.length;
    await f.replace();
    expect(f.bucket.delete).toHaveBeenCalledTimes(deletes);
  });

  it.each(['corrupt', 'uncommitted', 'wrong-owner', 'shared-test', 'shared-section', 'projection-pending'])('keeps old bytes when %s fails verification', async mode => {
    const f = fixture();
    if (mode === 'corrupt') f.objects.set(f.state.media_assets.new.durableKey, new Uint8Array([0, 0, 0, 0]));
    if (mode === 'uncommitted') f.state.media_assets.new.state = 'committing';
    if (mode === 'wrong-owner') f.state.media_assets.new.ownerId = 'other';
    if (mode === 'shared-test') f.versions.other = { ...f.previous, testId: 'other' };
    if (mode === 'shared-section') f.previous.document.audioSections.push({ number: 2, assetId: 'old' });
    if (mode === 'projection-pending') f.state.tests.test.versionId = 'version-1';
    await expect(f.replace()).rejects.toThrow();
    expect(f.bucket.delete).not.toHaveBeenCalled();
    expect(f.rtdb.patchAdminMultiLocation).not.toHaveBeenCalled();
  });

  it('resolves cached logical IDs through repeated replacements without chains or rewriting versions', async () => {
    const f = fixture();
    await f.replace();
    const third = f.version('third', 3);
    f.state.media_assets.third = f.asset('third', 3);
    f.versions['version-3'] = third;
    f.state.tests.test = { ...f.state.tests.test, versionId: third.versionId, audioSections: third.document.audioSections };
    await f.replace(f.current, third);
    await f.replace(f.previous, third);
    const resolved = await resolveListeningAudioReplacement(f.read, 'old');
    expect(resolved).toMatchObject({ original: { assetId: 'old' }, physical: { assetId: 'third' }, audioReplaced: true });
    expect(f.state.media_assets.old.replacement.assetId).toBe('new');
    expect(f.objects.has(f.state.media_assets.new.durableKey)).toBe(false);
    expect(f.previous.document.audioSections[0].assetId).toBe('old');
  });

  it.each(['source-test', 'source-section', 'target-owner', 'target-anchor', 'self-loop'])('rejects a forged %s binding', async mode => {
    const f = fixture();
    await f.replace();
    if (mode === 'source-test') f.previous.testId = 'other';
    if (mode === 'source-section') f.previous.document.audioSections[0].number = 2;
    if (mode === 'target-owner') f.state.media_assets.new.ownerId = 'other';
    if (mode === 'target-anchor') f.state.media_assets.old.replacement.assetId = 'unrelated';
    if (mode === 'self-loop') f.current.document.audioSections[0].assetId = 'old';
    await expect(resolveListeningAudioReplacement(f.read, 'old')).rejects.toThrow('listening_audio_replacement_invalid');
  });

  it('serves a previously signed URL from replacement bytes after old-byte deletion, including ranges', async () => {
    const f = fixture();
    const url = await createOwnerListeningPreviewUrl(f.env, { assetId: 'old', durableKey: f.state.media_assets.old.durableKey,
      contentType: 'audio/mpeg', expiresAt: 10000 }, 'https://worker.example');
    await f.replace();
    const handlers = createListeningDeliveryWorkerHandlers();
    const response = await handlers.content({ env: f.env, now: () => 101,
      request: new Request(url, { headers: { Range: 'bytes=1-2' } }) });
    expect(response.status).toBe(206);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([3, 4]));
    expect(response.headers.get('Content-Range')).toBe('bytes 1-2/4');
  });

  it('authorizes the original scope before probing replacement bytes and keeps the logical ID in issued URLs', async () => {
    const f = fixture();
    await f.replace();
    const handlers = createListeningDeliveryWorkerHandlers();
    const request = () => new Request('https://worker.example/listening-delivery/solo', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: 'old', testId: 'test', versionId: 'version-1', mode: 'self_study' }) });
    f.bucket.get.mockClear();
    f.previous.document.isPublic = false;
    const denied = await handlers.solo({ request: request(), env: f.env, uid: 'student', now: () => 101 });
    expect(denied.init?.status).toBe(403);
    expect(f.bucket.get).not.toHaveBeenCalled();
    f.previous.document.isPublic = true;
    const issued = await handlers.solo({ request: request(), env: f.env, uid: 'student', now: () => 101 });
    expect(issued.init?.status ?? 200).toBe(200);
    expect(issued.body).toMatchObject({ assetId: 'old', audioReplaced: true, audioReplacedAt: 100 });
    const content = await handlers.content({ request: new Request((issued.body as any).url), env: f.env, now: () => 101 });
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(new Uint8Array([2, 3, 4, 5]));
  });

  it('flags retained documents when only a later section recording was replaced', async () => {
    const f = fixture();
    await f.replace();
    f.state.media_assets.old.replacement.sectionNumber = 2;
    const version = { testId: 'test', document: { audioSections: [{ number: 1, assetId: 'untouched' }, { number: 2, assetId: 'old' }] } };
    expect(await readListeningAudioReplacementWarning(f.read, version)).toEqual({ audioReplaced: true, audioReplacedAt: 100 });
  });
});
