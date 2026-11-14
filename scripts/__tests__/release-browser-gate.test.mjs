import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import path from 'node:path';
import { accountState, outputUrl, profileState, qualificationHostingConfig, waitForManifest } from '../release-browser-gate.mjs';

test('selects the channel URL when Firebase reports both site and channel URLs', () => {
  assert.equal(outputUrl('Hosting URL: https://qa-site.web.app\nChannel URL: https://qa-site--release-123.web.app'), 'https://qa-site--release-123.web.app');
});

const digest = value => createHash('sha256').update(value).digest('hex');

test('cleanup verification fails closed on Auth and RTDB lookup errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('denied', { status: 403 });
    await assert.rejects(() => accountState({ project: 'qualification', uid: 'uid', token: 'token' }), /Remote request failed \(403\)/u);
    await assert.rejects(() => profileState({ databaseUrl: 'https://qualification.invalid', uid: 'uid', token: 'token' }), /RTDB profile lookup failed \(403\)/u);
  } finally { globalThis.fetch = originalFetch; }
});

test('cleanup verification accepts only an explicit Auth account absence', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'USER_NOT_FOUND' } }), { status: 400 });
    await assert.doesNotReject(() => accountState({ project: 'qualification', uid: 'uid', token: 'token' }));
  } finally { globalThis.fetch = originalFetch; }
});

test('browser preview readback verifies every manifest-listed asset', async () => {
  const originalFetch = globalThis.fetch;
  const assets = { '/index.html': Buffer.from('index'), '/assets/app.js': Buffer.from('app') };
  const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: Object.entries(assets).map(([path, bytes]) => ({ path, sha256: digest(bytes) })) };
  const expected = digest(JSON.stringify(manifest));
  try {
    globalThis.fetch = async url => {
      const parsed = new URL(url);
      if (parsed.pathname === '/.well-known/luyentap-release.json') return new Response(JSON.stringify(manifest), { status: 200 });
      const bytes = assets[parsed.pathname];
      return bytes ? new Response(bytes, { status: 200 }) : new Response('missing', { status: 404 });
    };
    await assert.doesNotReject(() => waitForManifest('https://preview.invalid', expected, 100));
    assets['/assets/app.js'] = Buffer.from('tampered');
    await assert.rejects(() => waitForManifest('https://preview.invalid', expected, 100), /preview asset differs/u);
  } finally { globalThis.fetch = originalFetch; }
});

test('qualification Hosting config points at the retained checkout artifact', () => {
  const config = qualificationHostingConfig({ site: 'qualification-site', publicDir: 'dist' });
  assert.equal(config.hosting.site, 'qualification-site');
  assert.equal(config.hosting.public, path.resolve('dist'));
});
