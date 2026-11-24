import { readFileSync } from 'node:fs';
import { request as nodeRequest } from 'node:http';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const rules = readFileSync('cloudflare/external-audio.database.rules.json', 'utf8');
const ownerPath = 'external_audio_connections/teacher-1';
const draftAssetPath = 'external_audio_draft_assets/teacher-1/63f947d9-2484-4e83-bc3a-6ec82e0e5c81';
let environment: RulesTestEnvironment;

beforeAll(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Start the dedicated RTDB emulator first');
  environment = await initializeTestEnvironment({ projectId: 'demo-luyentap-audio-rules', database: { rules } });
  await environment.withSecurityRulesDisabled(async (worker) => {
    await assertSucceeds(worker.database().ref(ownerPath).set({ generation: 1, connections: { sample: { state: 'revoked' } } }));
    await assertSucceeds(worker.database().ref(draftAssetPath).set({ sectionId: '1', asset: { objectKey: 'private/source.wav' } }));
  });
});

afterAll(async () => environment?.cleanup());

describe('dedicated external audio database rules', () => {
  it('denies client root reads and create, update, delete, and ancestor writes', async () => {
    const browsers = [
      environment.unauthenticatedContext(),
      environment.authenticatedContext('teacher-1', { role: 'teacher' }),
      environment.authenticatedContext('teacher-2', { role: 'teacher' }),
      environment.authenticatedContext('admin-1', { role: 'super_admin', admin: true }),
    ];
    for (const context of browsers) {
      const database = context.database();
      await assertFails(database.ref().get());
      await assertFails(database.ref(ownerPath).get());
      await assertFails(database.ref('external_audio_connections/teacher-2').set({ generation: 1 }));
      await assertFails(database.ref(ownerPath).update({ generation: 2 }));
      await assertFails(database.ref(ownerPath).remove());
      await assertFails(database.ref().update({ [ownerPath]: { generation: 7 } }));
      await assertFails(database.ref(draftAssetPath).get());
      await assertFails(database.ref(draftAssetPath).remove());
      await assertFails(database.ref().update({ [draftAssetPath]: { asset: { objectKey: 'forged.wav' } } }));
    }
    await environment.withSecurityRulesDisabled(async (worker) => {
      const snapshot = await assertSucceeds(worker.database().ref(ownerPath).get());
      expect(snapshot.val()).toEqual({ generation: 1, connections: { sample: { state: 'revoked' } } });
    });
  });

  it('accepts the initial ETag write and rejects a stale overwrite after revocation', async () => {
    const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    if (!host || !/^(?:localhost|127\.0\.0\.1):[0-9]+$/u.test(host)) throw new Error('Expected a local emulator');
    const url = `http://${host}/external_audio_connections/teacher-cas-${crypto.randomUUID()}.json?ns=demo-luyentap-audio-rules`;
    const rest = (update?: { etag: string; generation: number; state: string }) =>
      new Promise<{ status?: number; etag?: string; body: unknown }>((resolve, reject) => {
        const payload = update && JSON.stringify({ generation: update.generation, state: update.state });
        const request = nodeRequest(url, {
          method: update ? 'PUT' : 'GET',
          headers: {
            Authorization: 'Bearer owner',
            ...(update ? {
              'If-Match': update.etag, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload!),
            } : { 'X-Firebase-ETag': 'true' }),
          },
        }, (response) => {
          response.setEncoding('utf8');
          const chunks: string[] = [];
          response.on('data', (chunk: string) => chunks.push(chunk));
          response.on('error', reject);
          response.on('end', () => {
            try {
              resolve({ status: response.statusCode, etag: response.headers.etag, body: JSON.parse(chunks.join('')) });
            } catch (error) {
              reject(error);
            }
          });
        });
        request.on('error', reject);
        request.setTimeout(5000, () => request.destroy(new Error('Emulator REST request timed out')));
        request.end(payload);
      });
    const empty = await rest();
    expect(empty).toMatchObject({ status: 200, body: null });
    expect(empty.etag).toBeTruthy();
    const active = await rest({ etag: empty.etag!, generation: 1, state: 'active' });
    expect(active.status).toBe(200);
    expect(active.body).toMatchObject({ generation: 1 });
    const previous = await rest();
    expect(previous.etag).toBeTruthy();
    expect(previous.body).toMatchObject({ generation: 1 });
    const revoked = await rest({ etag: previous.etag!, generation: 2, state: 'revoked' });
    expect(revoked.status).toBe(200);
    expect(revoked.body).toMatchObject({ generation: 2 });
    const stale = await rest({ etag: previous.etag!, generation: 2, state: 'active' });
    expect(stale.status).toBe(412);
    expect((await rest()).body).toEqual({ generation: 2, state: 'revoked' });
  });
});
