import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { spareFirebaseProject } from '../spare-dev-config.mjs';
import {
  DEFAULT_FIRESTORE_READ_CONCURRENCY,
  FIRESTORE_SYNC_SEMANTICS,
  LIVE_FIREBASE_PROJECT,
  defaultGoogleAccessToken,
  main,
  sanitizeAuthExportForSpare,
  syncLiveToSpare,
} from '../spare-sync-from-live.mjs';
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

test('Auth export sanitization removes credentials without mutating the source payload', () => {
  const payload = {
    kind: 'identitytoolkit#DownloadAccountResponse',
    users: [{ localId: 'one', email: 'one@example.com', passwordHash: 'secret', salt: 'salt', displayName: 'One', providerUserInfo: [{ providerId: 'google.com' }] }],
  };
  const sanitized = sanitizeAuthExportForSpare(payload);
  assert.deepEqual(sanitized.payload.users[0], { localId: 'one', email: 'one@example.com', displayName: 'One', providerUserInfo: [{ providerId: 'google.com' }] });
  assert.equal(sanitized.totalUsers, 1);
  assert.equal(sanitized.strippedPasswordHashes, 1);
  assert.equal(payload.users[0].passwordHash, 'secret');
  assert.throws(() => sanitizeAuthExportForSpare({}), /users array/u);
});

function mockFirebase({ firestoreDocument = true, writeStatus = [{}], rtdbRaw = JSON.stringify({ mediaUrl: 'https://luyentap-qualification-media.r2.dev/shared.pdf' }) } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('firestore.googleapis.com')) {
      if (parsed.pathname.endsWith(':batchWrite')) return new Response(JSON.stringify({ status: writeStatus }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (parsed.pathname.endsWith(':listCollectionIds')) return new Response(JSON.stringify({ collectionIds: parsed.pathname.includes('/documents:') ? ['profiles'] : [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (parsed.pathname.endsWith('/profiles')) {
        const name = firestoreDocument ? `projects/${LIVE_FIREBASE_PROJECT}/databases/(default)/documents/profiles/one` : 'projects/other/databases/(default)/documents/profiles/one';
        return new Response(JSON.stringify({ documents: [{ name, createTime: '2026-01-01T00:00:00Z', fields: { mediaUrl: { stringValue: 'https://luyentap-qualification-media.r2.dev/shared.pdf' } } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
    throw new Error(`Unexpected request ${url}`);
  };
  return { calls, fetchImpl, rtdbRaw };
}

function mockFirebaseCli({ calls, imports = [], rtdbSets = [], rtdbRaw = JSON.stringify({ mediaUrl: 'https://luyentap-qualification-media.r2.dev/shared.pdf' }), authPayload = { users: [] } } = {}) {
  return async args => {
    calls.push(args);
    if (args[0] === 'database:get') {
      const output = args[args.indexOf('--output') + 1];
      await writeFile(output, rtdbRaw, 'utf8');
    } else if (args[0] === 'database:set') {
      rtdbSets.push(JSON.parse(await readFile(args[2], 'utf8')));
    } else if (args[0] === 'auth:export') {
      await writeFile(args[1], JSON.stringify(authPayload), 'utf8');
    } else if (args[0] === 'auth:import') {
      imports.push(JSON.parse(await readFile(args[1], 'utf8')));
    }
  };
}

test('spare sync dry-run exports RTDB, performs no writes, and preserves media URLs in read counts', async () => {
  const mock = mockFirebase();
  const cliCalls = [];
  const result = await syncLiveToSpare({ scopes: ['rtdb', 'firestore', 'auth'], dryRun: true, confirmSpareOverwrite: true }, {
    fetchImpl: mock.fetchImpl,
    getAccessToken: async () => 'token',
    execFirebase: mockFirebaseCli({ calls: cliCalls }),
  });
  assert.equal(result.status, 'DRY_RUN');
  assert.equal(result.written, false);
  assert.equal(result.authSynced, false);
  assert.equal(result.authUsersSanitized, 0);
  assert.equal(result.firestoreSemantics, FIRESTORE_SYNC_SEMANTICS);
  assert.deepEqual(cliCalls[0], ['database:get', '/', '--export', '--project', LIVE_FIREBASE_PROJECT, '--output', cliCalls[0][6], '--non-interactive']);
  assert.equal(cliCalls.some(args => args[0] === 'database:set' || args[0] === 'auth:import'), false);
  assert.equal(mock.calls.some(call => call.url.includes(':batchWrite')), false);
});

test('spare sync writes CLI-exported RTDB, Firestore, and sanitized Auth to the spare project', async () => {
  const mock = mockFirebase();
  const cliCalls = [];
  const rtdbSets = [];
  const imports = [];
  const authPayload = { users: [{ localId: 'one', email: 'one@example.com', passwordHash: 'secret', salt: 'salt', displayName: 'One', providerUserInfo: [{ providerId: 'google.com' }] }] };
  const result = await syncLiveToSpare({ scopes: ['rtdb', 'firestore', 'auth'], dryRun: false, confirmSpareOverwrite: true }, {
    fetchImpl: mock.fetchImpl,
    getAccessToken: async () => 'token',
    execFirebase: mockFirebaseCli({ calls: cliCalls, imports, rtdbSets, authPayload }),
  });
  assert.equal(result.status, 'SYNCED');
  assert.deepEqual(result.completedScopes, ['rtdb', 'firestore', 'auth']);
  assert.equal(result.authSynced, true);
  assert.equal(result.authUsersSanitized, 1);
  assert.equal(result.firestoreSemantics, FIRESTORE_SYNC_SEMANTICS);
  assert.deepEqual(cliCalls[0], ['database:get', '/', '--export', '--project', LIVE_FIREBASE_PROJECT, '--output', cliCalls[0][6], '--non-interactive']);
  const setCall = cliCalls.find(args => args[0] === 'database:set');
  assert.deepEqual(setCall, ['database:set', '/', setCall[2], '--force', '--project', spareFirebaseProject, '--non-interactive']);
  assert.deepEqual(rtdbSets, [{ mediaUrl: 'https://luyentap-qualification-media.r2.dev/shared.pdf' }]);
  const exportCall = cliCalls.find(args => args[0] === 'auth:export');
  const importCall = cliCalls.find(args => args[0] === 'auth:import');
  assert.equal(exportCall.includes(LIVE_FIREBASE_PROJECT), true);
  assert.equal(importCall.includes(spareFirebaseProject), true);
  const imported = imports[0];
  assert.deepEqual(imported.users[0], { localId: 'one', email: 'one@example.com', displayName: 'One', providerUserInfo: [{ providerId: 'google.com' }] });
  const batch = mock.calls.find(call => call.url.includes(':batchWrite'));
  assert.match(JSON.parse(batch.options.body).writes[0].update.name, new RegExp(`^projects/${spareFirebaseProject}/`));
});

test('auth-only spare sync imports a credential-free export while preserving user profile fields', async () => {
  const cliCalls = [];
  const imports = [];
  const authPayload = { users: [{ localId: 'student', email: 'student@example.com', emailVerified: true, passwordHash: 'hash', salt: 'salt', displayName: 'Student', providerUserInfo: [{ providerId: 'password' }] }] };
  const result = await syncLiveToSpare({ scopes: ['auth'], confirmSpareOverwrite: true }, {
    execFirebase: mockFirebaseCli({ calls: cliCalls, imports, authPayload }),
  });
  assert.equal(result.authSynced, true);
  assert.equal(result.authUsersSanitized, 1);
  assert.deepEqual(imports[0].users[0], { localId: 'student', email: 'student@example.com', emailVerified: true, displayName: 'Student', providerUserInfo: [{ providerId: 'password' }] });
  assert.equal(cliCalls.find(args => args[0] === 'auth:import')[3], spareFirebaseProject);
});

test('spare sync validates RTDB and Firestore reads before any write', async () => {
  const invalidRtdb = mockFirebase({ rtdbRaw: '{invalid' });
  const invalidCliCalls = [];
  await assert.rejects(syncLiveToSpare({ scopes: ['rtdb', 'firestore'], dryRun: false, confirmSpareOverwrite: true }, {
    fetchImpl: invalidRtdb.fetchImpl,
    getAccessToken: async () => 'token',
    execFirebase: mockFirebaseCli({ calls: invalidCliCalls, rtdbRaw: invalidRtdb.rtdbRaw }),
  }), /RTDB export was not valid JSON/u);
  assert.equal(invalidCliCalls.some(args => args[0] === 'database:set'), false);
  assert.equal(invalidRtdb.calls.some(call => call.url.includes(':batchWrite')), false);

  const mismatched = mockFirebase({ firestoreDocument: false });
  const mismatchedCliCalls = [];
  await assert.rejects(syncLiveToSpare({ scopes: ['rtdb', 'firestore'], dryRun: false, confirmSpareOverwrite: true }, {
    fetchImpl: mismatched.fetchImpl,
    getAccessToken: async () => 'token',
    execFirebase: mockFirebaseCli({ calls: mismatchedCliCalls }),
  }), /live source project/u);
  assert.equal(mismatchedCliCalls.some(args => args[0] === 'database:set'), false);
  assert.equal(mismatched.calls.some(call => call.url.includes(':batchWrite')), false);
});

test('spare sync reports partial failure after RTDB succeeds and Firestore fails', async () => {
  const mock = mockFirebase({ writeStatus: [{ code: 7, message: 'denied' }] });
  const cliCalls = [];
  await assert.rejects(syncLiveToSpare({ scopes: ['rtdb', 'firestore'], dryRun: false, confirmSpareOverwrite: true }, {
    fetchImpl: mock.fetchImpl,
    getAccessToken: async () => 'secret-token',
    execFirebase: mockFirebaseCli({ calls: cliCalls }),
  }), error => /batch write failed/u.test(error.message)
    && JSON.stringify(error.completedScopes) === JSON.stringify(['rtdb'])
    && error.failedScope === 'firestore'
    && JSON.stringify(error.remainingScopes) === JSON.stringify(['firestore']));
  assert.equal(cliCalls.some(args => args[0] === 'database:set'), true);
});

test('spare sync timeout is reported without exposing the access token', async () => {
  await assert.rejects(syncLiveToSpare({ scopes: ['firestore'], dryRun: true, timeoutMs: 25 }, {
    fetchImpl: async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); },
    getAccessToken: async () => 'secret-token',
  }), error => /timed out after 25ms/u.test(error.message) && !error.message.includes('secret-token'));
});

test('human-readable CLI output includes Firestore semantics', async () => {
  const mock = mockFirebase();
  const output = [];
  const originalLog = console.log;
  console.log = value => output.push(value);
  try {
    await main(['--only', 'firestore', '--dry-run'], { fetchImpl: mock.fetchImpl, getAccessToken: async () => 'token' });
  } finally {
    console.log = originalLog;
  }
  assert.match(output[0], /Firestore semantics: upsert-only \(existing spare-only documents are preserved\)/u);
});

test('readFirestore traverses subcollections with bounded concurrency and defaultGoogleAccessToken avoids shell:true', async () => {
  assert.equal(DEFAULT_FIRESTORE_READ_CONCURRENCY, 12);
  let inFlight = 0;
  let maxInFlight = 0;
  const batchedNames = [];
  const docIds = Array.from({ length: 10 }, (_, idx) => `doc-${idx}`);
  const result = await syncLiveToSpare({ scopes: ['firestore'], dryRun: false, confirmSpareOverwrite: true, firestoreReadConcurrency: 3 }, {
    getAccessToken: async () => 'token',
    fetchImpl: async (url, options = {}) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 10));
      try {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('/documents:listCollectionIds')) {
          return new Response(JSON.stringify({ collectionIds: ['courses'] }), { status: 200 });
        }
        if (parsed.pathname.endsWith('/documents/courses')) {
          return new Response(JSON.stringify({
            documents: docIds.map(id => ({
              name: `projects/${LIVE_FIREBASE_PROJECT}/databases/(default)/documents/courses/${id}`,
              createTime: '2026-01-01T00:00:00Z',
              fields: {},
            })),
          }), { status: 200 });
        }
        if (parsed.pathname.endsWith(':listCollectionIds')) {
          const match = /\/courses\/(doc-\d+):listCollectionIds$/u.exec(parsed.pathname);
          return new Response(JSON.stringify({
            collectionIds: match && (match[1] === 'doc-0' || match[1] === 'doc-5') ? ['lessons'] : [],
          }), { status: 200 });
        }
        if (parsed.pathname.endsWith('/lessons')) {
          const docId = parsed.pathname.split('/').slice(-2, -1)[0];
          return new Response(JSON.stringify({
            documents: [{
              name: `projects/${LIVE_FIREBASE_PROJECT}/databases/(default)/documents/courses/${docId}/lessons/l1`,
              createTime: '2026-01-01T00:00:00Z',
              fields: {},
            }],
          }), { status: 200 });
        }
        if (parsed.pathname.endsWith(':batchWrite')) {
          const writes = JSON.parse(options.body).writes;
          batchedNames.push(...writes.map(entry => entry.update.name));
          return new Response(JSON.stringify({ status: writes.map(() => ({})) }), { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      } finally {
        inFlight -= 1;
      }
    },
  });
  assert.equal(result.firestoreDocuments, 12);
  assert.ok(maxInFlight > 1 && maxInFlight <= 3, `expected bounded concurrency 2..3, got ${maxInFlight}`);
  assert.ok(batchedNames.includes(`projects/${spareFirebaseProject}/databases/(default)/documents/courses/doc-0/lessons/l1`));
  assert.ok(batchedNames.includes(`projects/${spareFirebaseProject}/databases/(default)/documents/courses/doc-5/lessons/l1`));

  const invocations = [];
  const winToken = defaultGoogleAccessToken((cmd, args, opts) => {
    invocations.push({ cmd, args, opts });
    return 'win-token\n';
  }, 'win32');
  assert.equal(winToken, 'win-token');
  assert.equal(invocations[0].cmd, 'powershell.exe');
  assert.equal(invocations[0].opts.shell, undefined);

  const linuxToken = defaultGoogleAccessToken((cmd, args, opts) => {
    invocations.push({ cmd, args, opts });
    return 'linux-token\n';
  }, 'linux');
  assert.equal(linuxToken, 'linux-token');
  assert.equal(invocations[1].cmd, 'gcloud');
  assert.equal(invocations[1].opts.shell, undefined);
});
