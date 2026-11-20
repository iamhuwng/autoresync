import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { digest, hashWorkerVersionModules, readProviderState, validateFirestoreRulesReadback } from '../release-provider-readback.mjs';

function withEnv(t, overrides) {
  const keys = ['GITHUB_ACTIONS', 'GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
    'GOOGLE_OAUTH_ACCESS_TOKEN', 'LUYENTAP_HOSTING_READBACK_GOOGLE_ACCOUNT', 'LUYENTAP_HOSTING_READBACK_GOOGLE_PROVIDER',
    'LUYENTAP_RELEASE_CLOUDFLARE_READ_TOKEN', ...Object.keys(overrides)];
  const previous = Object.fromEntries([...new Set(keys)].map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, overrides);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('Worker module evidence is bound to the active version endpoint', () => {
  const version = { id: 'active-version', modules: [{ name: 'index.js', content_base64: Buffer.from('export default 1;').toString('base64') }] };
  const modules = hashWorkerVersionModules(version, 'active-version');
  assert.equal(modules['index.js'], createHash('sha256').update('export default 1;').digest('hex'));
  assert.throws(() => hashWorkerVersionModules({ ...version, id: 'latest-upload' }, 'active-version'), /different Worker version/u);
  assert.throws(() => hashWorkerVersionModules({ ...version, modules: [{ ...version.modules[0], name: 'index.js' }, version.modules[0]] }, 'active-version'), /Duplicate/u);
  assert.throws(() => hashWorkerVersionModules({ ...version, modules: [{ name: 'index.js' }] }, 'active-version'), /incomplete/u);
});

test('Firestore readback hashes exact source bytes and rejects changed release or source inventory', () => {
  const release = { name: 'projects/temp-a1437/releases/cloud.firestore', rulesetName: 'projects/temp-a1437/rulesets/reviewed-id', updateTime: '2026-10-27T00:00:00Z' };
  const ruleset = { name: release.rulesetName, metadata: { services: ['cloud.firestore'] }, source: { files: [{ name: 'firestore.rules', content: 'rules_version = "2";\r\nservice cloud.firestore {}\n' }] } };
  const expectedHash = createHash('sha256').update(ruleset.source.files[0].content).digest('hex');
  assert.equal(validateFirestoreRulesReadback(release, ruleset, structuredClone(release)).sourceSha256, expectedHash);
  const alteredLineEndings = structuredClone(ruleset);
  alteredLineEndings.source.files[0].content = alteredLineEndings.source.files[0].content.replace('\r\n', '\n');
  assert.notEqual(validateFirestoreRulesReadback(release, alteredLineEndings, release).sourceSha256, expectedHash);
  for (const mutate of [
    value => { value.releaseAfter.updateTime = 'later'; },
    value => { value.release.name = 'projects/other/releases/cloud.firestore'; },
    value => { value.release.rulesetName = 'projects/other/rulesets/id'; },
    value => { value.ruleset.name = 'projects/temp-a1437/rulesets/other'; },
    value => { value.ruleset.metadata.services = ['firebase.storage']; },
    value => { value.ruleset.source.files.push({ name: 'other.rules', content: '' }); },
    value => { value.ruleset.source.files[0].name = 'other.rules'; },
    value => { delete value.ruleset.source.files[0].content; },
  ]) {
    const value = structuredClone({ release, ruleset, releaseAfter: structuredClone(release) });
    mutate(value);
    assert.throws(() => validateFirestoreRulesReadback(value.release, value.ruleset, value.releaseAfter));
  }
});

test('unrequested provider probes skip credentials, network and CLI work', async t => {
  let fetches = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetches += 1; throw new Error('network should be skipped'); });
  assert.deepEqual(await readProviderState('unused-cwd'), {});
  assert.equal(fetches, 0);
});

test('provider readback keeps pure digest stable for equivalent object key order', () => {
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }));
});

test('firestoreIndexes scope skips RTDB rules, Firestore rules and Cloudflare credentials/calls', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'readback-indexes-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const adc = path.join(dir, 'adc.json');
  const account = 'reader@temp-a1437.iam.gserviceaccount.com';
  const provider = 'projects/123/locations/global/workloadIdentityPools/test/providers/main';
  await writeFile(adc, JSON.stringify({
    type: 'external_account',
    audience: `//iam.googleapis.com/${provider}`,
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`,
  }));
  withEnv(t, {
    GITHUB_ACTIONS: 'true',
    GOOGLE_APPLICATION_CREDENTIALS: adc,
    CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: adc,
    GOOGLE_OAUTH_ACCESS_TOKEN: 'google-token',
    LUYENTAP_HOSTING_READBACK_GOOGLE_ACCOUNT: account,
    LUYENTAP_HOSTING_READBACK_GOOGLE_PROVIDER: provider,
  });
  const requested = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requested.push(url);
    assert.match(url, /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/temp-a1437\/databases\/\(default\)\/collectionGroups\/-\/indexes$/u);
    return Response.json({ indexes: [{ name: 'projects/temp-a1437/databases/(default)/collectionGroups/c/indexes/1', state: 'READY' }] });
  });
  const state = await readProviderState(dir, { hosting: true, firestoreIndexes: true });
  assert.equal(state.firestoreIndexes.length, 1);
  assert.equal(requested.length, 1);
});

test('single-Worker scope skips Google, RTDB, Firestore, R2 and other Workers', async t => {
  withEnv(t, {
    GITHUB_ACTIONS: 'true',
    LUYENTAP_RELEASE_CLOUDFLARE_READ_TOKEN: 'cf-token',
  });
  const versionId = '11111111-1111-4111-8111-111111111111';
  const requested = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requested.push(url);
    assert(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'), `unexpected host: ${url}`);
    assert(url.includes('/r2-backup-worker/'), `unexpected resource: ${url}`);
    assert(!url.includes('/r2/buckets/'), `unexpected R2 probe: ${url}`);
    if (url.endsWith('/deployments')) return Response.json({ success: true, result: { deployments: [{ versions: [{ version_id: versionId, percentage: 100 }] }] } });
    if (url.endsWith(`/scripts/r2-backup-worker/versions/${versionId}`)) return Response.json({ success: true, result: { resources: { bindings: [], script_runtime: {}, script: { handlers: ['fetch'] } } } });
    if (url.includes('?include=modules')) return Response.json({ success: true, result: { id: versionId, modules: [{ name: 'index.js', content_base64: Buffer.from('export default {};').toString('base64') }] } });
    if (url.endsWith('/settings')) return Response.json({ success: true, result: { bindings: [] } });
    if (url.endsWith('/schedules')) return Response.json({ success: true, result: { schedules: [] } });
    if (url.endsWith('/subdomain')) return Response.json({ success: true, result: { enabled: true } });
    throw new Error(`Unexpected Worker URL: ${url}`);
  });
  const state = await readProviderState(process.cwd(), { hosting: true, workers: ['r2-backup-worker'] });
  assert.deepEqual(Object.keys(state), ['workers']);
  assert.deepEqual(Object.keys(state.workers), ['r2-backup-worker']);
  assert.equal(state.workers['r2-backup-worker'].versionId, versionId);
  assert.equal(requested.length, 7);
});
