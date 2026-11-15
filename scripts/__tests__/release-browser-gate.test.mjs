import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import path from 'node:path';
import { accountState, assertBrowserEvidenceVerified, outputUrl, parseJourneyCommand, qualificationDatabaseRules, qualificationHostingConfig, stagingScope, stagingWorkerBindings, waitForManifest } from '../release-browser-gate.mjs';

test('selects the channel URL when Firebase reports both site and channel URLs', () => {
  assert.equal(outputUrl('Hosting URL: https://qa-site.web.app\nChannel URL: https://qa-site--release-123.web.app'), 'https://qa-site--release-123.web.app');
});

test('blocked browser evidence fails the gate after evidence is written', () => {
  assert.throws(() => assertBrowserEvidenceVerified({ decision: 'blocked', summary: 'RTDB denied' }), /RTDB denied/u);
  assert.doesNotThrow(() => assertBrowserEvidenceVerified({ decision: 'verified', summary: 'passed' }));
});

test('staging accepts a bounded Codex-selected journey command without prescribing its runner', () => {
  assert.deepEqual(parseJourneyCommand({ command: ['node', 'scripts/custom-journey.mjs'], label: 'changed dashboard journey', services: ['hosting', 'workers'] }), { command: ['node', 'scripts/custom-journey.mjs'], label: 'changed dashboard journey', services: ['hosting', 'workers'] });
  assert.throws(() => parseJourneyCommand({ command: 'npx playwright test' }), /bounded argument array/u);
  assert.throws(() => parseJourneyCommand({ command: ['node'], extra: true }), /only command, label and services/u);
  assert.throws(() => parseJourneyCommand({ command: ['node'], services: ['backblaze'] }), /supported staging services/u);
});

test('staging declares excluded services instead of pretending to qualify them', () => {
  assert.ok(stagingScope.included.includes('hosting'));
  assert.ok(stagingScope.included.includes('firebase-rtdb'));
  assert.ok(stagingScope.included.includes('workers'));
  assert.ok(stagingScope.excluded.includes('backblaze'));
});

test('worker-scoped journeys require non-production HTTPS Worker bindings', () => {
  assert.deepEqual(stagingWorkerBindings({ VITE_BOOK_RUNTIME_WORKER_URL: 'https://worker.example', LOCAL_ONLY: 'http://localhost:8787' }, true), { VITE_BOOK_RUNTIME_WORKER_URL: 'https://worker.example' });
  assert.throws(() => stagingWorkerBindings({ VITE_BOOK_RUNTIME_WORKER_URL: 'http://localhost:8787' }, true), /non-production Worker endpoint bindings/u);
});

const digest = value => createHash('sha256').update(value).digest('hex');

test('cleanup verification fails closed on Auth lookup errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('denied', { status: 403 });
    await assert.rejects(() => accountState({ project: 'qualification', uid: 'uid', token: 'token' }), /Remote request failed \(403\)/u);
  } finally { globalThis.fetch = originalFetch; }
});

test('Auth cleanup binds qualification API-key context when supplied', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  try {
    globalThis.fetch = async url => { requestedUrl = String(url); return new Response(JSON.stringify({ error: { message: 'USER_NOT_FOUND' } }), { status: 400 }); };
    await accountState({ project: 'qualification', uid: 'uid', token: 'token', apiKey: 'qualification-key' });
    assert.match(requestedUrl, /accounts:lookup\?key=qualification-key/u);
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
  assert.equal(config.database.rules, 'qualification-database.rules.json');
  assert.deepEqual(config.hosting.rewrites, [
    { source: '/assets/*.@(js|mjs)', destination: '/__asset_missing__.js' },
    { source: '/assets/*.css', destination: '/__asset_missing__.css' },
    { source: '**', destination: '/index.html' },
  ]);
  assert.match(JSON.stringify(config.hosting.headers), /Cache-Control/u);
  assert.equal(config.hosting.ignore.includes('**/.*'), false);
});

test('qualification rules allow disposable self-cleanup without role escalation', () => {
  const write = qualificationDatabaseRules.rules.users.$uid['.write'];
  assert.match(write, /auth\.uid === \$uid/u);
  assert.match(qualificationDatabaseRules.rules.users.$uid.role['.validate'], /teacher/u);
  assert.match(qualificationDatabaseRules.rules.users.$uid.role['.validate'], /student/u);
  assert.match(qualificationDatabaseRules.rules.users.$uid.role['.validate'], /data\.exists\(\)/u);
  assert.match(qualificationDatabaseRules.rules.users.$uid.status['.validate'], /active/u);
  assert.match(qualificationDatabaseRules.rules.users.$uid.status['.validate'], /data\.exists\(\)/u);
});
