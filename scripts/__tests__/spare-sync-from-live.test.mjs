import assert from 'node:assert/strict';
import test from 'node:test';
import { spareFirebaseProject } from '../spare-dev-config.mjs';
import { LIVE_FIREBASE_PROJECT, syncLiveToSpare } from '../spare-sync-from-live.mjs';

// Keep the target assertion imported from the implementation while avoiding any live Firebase calls.
import { assertSpareSyncTarget as assertTarget, parseSpareSyncArgs as parseArgs } from '../spare-sync-from-live.mjs';

test('spare sync argument parsing defaults to dry-run and forbids storage copy flags', () => {
  assert.deepEqual(parseArgs([]), { scopes: ['rtdb', 'firestore'], targetProject: spareFirebaseProject, confirmSpareOverwrite: false, dryRun: true, json: false });
  assert.equal(parseArgs(['--confirm-spare-overwrite']).dryRun, false);
  assert.equal(parseArgs(['--confirm-spare-overwrite', '--dry-run']).dryRun, true);
  for (const args of [['--storage'], ['--include-storage'], ['--copy-storage'], ['--copy-r2'], ['--copy-b2'], ['--r2'], ['--b2'], ['--media'], ['--only', 'rtdb,media'], ['--only', 'bucket']]) {
    assert.throws(() => parseArgs(args), /R2\/B2 object copy is forbidden/u);
  }
  assert.deepEqual(parseArgs(['--only', 'rtdb,firestore,auth', '--target', spareFirebaseProject]).scopes, ['rtdb', 'firestore', 'auth']);
});

test('spare sync target assertion refuses live and unknown projects', () => {
  assert.throws(() => assertTarget(LIVE_FIREBASE_PROJECT), /unsafe spare sync target/u);
  assert.throws(() => assertTarget('unknown-project'), /unsafe spare sync target/u);
  assert.equal(assertTarget(spareFirebaseProject), spareFirebaseProject);
});

function mockFirebase({ firestoreDocument = true, writeStatus = [{}] } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const parsed = new URL(url);
    if (options.method === 'PUT') return new Response(options.body, { status: 200, headers: { 'content-type': 'application/json' } });
    if (parsed.hostname.endsWith('firestore.googleapis.com')) {
      if (parsed.pathname.endsWith(':batchWrite')) return new Response(JSON.stringify({ status: writeStatus }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (parsed.pathname.endsWith(':listCollectionIds')) return new Response(JSON.stringify({ collectionIds: parsed.pathname.includes('/documents:') ? ['profiles'] : [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (parsed.pathname.endsWith('/profiles')) {
        const name = firestoreDocument ? `projects/${LIVE_FIREBASE_PROJECT}/databases/(default)/documents/profiles/one` : 'projects/other/databases/(default)/documents/profiles/one';
        return new Response(JSON.stringify({ documents: [{ name, createTime: '2026-01-01T00:00:00Z', fields: { mediaUrl: { stringValue: 'https://luyentap-qualification-media.r2.dev/shared.pdf' } } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
    if (parsed.hostname === `${LIVE_FIREBASE_PROJECT}-default-rtdb.firebaseio.com`) return new Response(JSON.stringify({ mediaUrl: 'https://luyentap-qualification-media.r2.dev/shared.pdf' }), { status: 200, headers: { 'content-type': 'application/json' } });
    throw new Error(`Unexpected request ${url}`);
  };
  return { calls, fetchImpl };
}

test('spare sync dry-run performs no writes and preserves media URLs in read counts', async () => {
  const mock = mockFirebase();
  const result = await syncLiveToSpare({ scopes: ['rtdb', 'firestore', 'auth'], dryRun: true, confirmSpareOverwrite: true }, {
    fetchImpl: mock.fetchImpl, getAccessToken: async () => 'token', execFirebase: async () => { throw new Error('auth must not run'); },
  });
  assert.equal(result.status, 'DRY_RUN');
  assert.equal(result.written, false);
  assert.equal(result.authSynced, false);
  assert.equal(mock.calls.some(call => call.options.method === 'PUT' || call.url.includes(':batchWrite')), false);
});

test('spare sync writes RTDB and Firestore to the spare endpoints and optionally imports Auth', async () => {
  const mock = mockFirebase();
  const authCalls = [];
  const result = await syncLiveToSpare({ scopes: ['rtdb', 'firestore', 'auth'], dryRun: false, confirmSpareOverwrite: true }, {
    fetchImpl: mock.fetchImpl, getAccessToken: async () => 'token',
    execFirebase: async (args) => authCalls.push(args),
  });
  assert.equal(result.status, 'SYNCED');
  assert.deepEqual(result.completedScopes, ['rtdb', 'firestore', 'auth']);
  assert.equal(result.authSynced, true);
  assert.equal(mock.calls.every(call => call.options.signal instanceof AbortSignal), true);
  const getRtdb = mock.calls.find(call => call.url.includes(`${LIVE_FIREBASE_PROJECT}-default-rtdb.firebaseio.com`));
  assert.equal(getRtdb.options.headers.Authorization, 'Bearer token');
  assert.equal(getRtdb.url.includes('access_token'), false);
  const put = mock.calls.find(call => call.options.method === 'PUT');
  assert.match(put.url, new RegExp(`${spareFirebaseProject}-default-rtdb\\.asia-southeast1\\.firebasedatabase\\.app`));
  assert.equal(put.options.headers.Authorization, 'Bearer token');
  assert.equal(put.url.includes('access_token'), false);
  const batch = mock.calls.find(call => call.url.includes(':batchWrite'));
  const writes = JSON.parse(batch.options.body).writes;
  assert.match(writes[0].update.name, new RegExp(`^projects/${spareFirebaseProject}/`));
  assert.equal(writes[0].update.fields.mediaUrl.stringValue, 'https://luyentap-qualification-media.r2.dev/shared.pdf');
  assert.equal(authCalls.length, 2);
  assert.equal(authCalls[0][0], 'auth:export');
  assert.equal(authCalls[0].includes(LIVE_FIREBASE_PROJECT), true);
  assert.equal(authCalls[1][0], 'auth:import');
  assert.equal(authCalls[1].includes(spareFirebaseProject), true);
});

test('spare sync rejects mismatched document prefixes, programmatic storage/source errors, and Firestore write errors', async () => {
  await assert.rejects(syncLiveToSpare({ scopes: ['r2'], dryRun: true }, {}), /R2\/B2 object copy is forbidden/u);
  await assert.rejects(syncLiveToSpare({ sourceProject: 'other-project', dryRun: true }, {}), /live Firebase project/u);
  const mismatched = mockFirebase({ firestoreDocument: false });
  await assert.rejects(syncLiveToSpare({ scopes: ['firestore'], dryRun: true, confirmSpareOverwrite: true }, { fetchImpl: mismatched.fetchImpl, getAccessToken: async () => 'token' }), /live source project/u);
  const failed = mockFirebase({ writeStatus: [{ code: 7, message: 'denied' }] });
  await assert.rejects(syncLiveToSpare({ scopes: ['firestore'], dryRun: false, confirmSpareOverwrite: true }, { fetchImpl: failed.fetchImpl, getAccessToken: async () => 'token' }), /batch write failed/u);
});

test('spare sync reads and exports all scopes before any write, tracks partial failure recovery, and times out cleanly', async () => {
  const mock = mockFirebase({ firestoreDocument: false });
  await assert.rejects(syncLiveToSpare({ scopes: ['rtdb', 'firestore'], dryRun: false, confirmSpareOverwrite: true }, {
    fetchImpl: mock.fetchImpl, getAccessToken: async () => 'secret-token',
  }), /live source project/u);
  assert.equal(mock.calls.some(call => call.options.method === 'PUT' || call.url.includes(':batchWrite')), false);

  const partial = mockFirebase({ writeStatus: [{ code: 7, message: 'denied' }] });
  await assert.rejects(syncLiveToSpare({ scopes: ['rtdb', 'firestore'], dryRun: false, confirmSpareOverwrite: true }, {
    fetchImpl: partial.fetchImpl, getAccessToken: async () => 'secret-token',
  }), error => /batch write failed/u.test(error.message)
    && JSON.stringify(error.completedScopes) === JSON.stringify(['rtdb'])
    && error.failedScope === 'firestore'
    && JSON.stringify(error.remainingScopes) === JSON.stringify(['firestore']));

  await assert.rejects(syncLiveToSpare({ scopes: ['rtdb'], dryRun: true, timeoutMs: 25 }, {
    fetchImpl: async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); },
    getAccessToken: async () => 'secret-token',
  }), error => /timed out after 25ms/u.test(error.message) && !error.message.includes('secret-token'));
});
