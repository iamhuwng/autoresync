import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readListeningProvider } from '../release-listening-evidence.mjs';
import { describeGoogleToken, readProviderJson } from '../release-provider-diagnostics.mjs';

test('error diagnostics report fixed provider fields without leaking echoed credentials or URLs', async () => {
  const url = 'https://firebaserules.googleapis.com/v1/projects/temp-a1437/releases/cloud.firestore?sensitive=query';
  await assert.rejects(readProviderJson(url, 'credential-fixture', { fetchImpl: async () => Response.json({
    error: { status: 'PERMISSION_DENIED', message: 'credential-fixture',
      details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', metadata: { token: 'credential-fixture' } },
        { reason: 'untrusted-value' }] },
  }, { status: 403 }) }), error => {
    assert.match(error.message, /HTTP 403 \(PERMISSION_DENIED, ACCESS_TOKEN_SCOPE_INSUFFICIENT\)/u);
    assert.doesNotMatch(error.message, /credential-fixture|untrusted-value|sensitive=query/u);
    return true;
  });
});

test('token inspection uses a fixed HTTPS endpoint and exposes only known scopes and remaining lifetime', async () => {
  const description = await describeGoogleToken('fixture-bearer', async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/tokeninfo');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer fixture-bearer');
    assert.equal(options.redirect, 'error');
    return Response.json({ expires_in: '120', scope: 'https://www.googleapis.com/auth/firebase.database arbitrary-scope',
      email: 'private@example.invalid', access_token: 'fixture-bearer' });
  });
  assert.match(description, /120s remaining \(expires soon\); granted release scopes: firebase.database/u);
  assert.match(description, /missing release scopes: cloud-platform, userinfo.email/u);
  assert.doesNotMatch(description, /arbitrary-scope|private@example|fixture-bearer/u);
});

test('native federated reader reports independent RTDB, Firestore and Cloudflare failures together', async t => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'release-provider-read-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd });
  const cli = path.join(cwd, 'node_modules/firebase-tools/lib/bin');
  await mkdir(cli, { recursive: true });
  await writeFile(path.join(cli, 'firebase.js'), 'console.log(JSON.stringify({ status: "success", result: [] }));');
  const credentialFile = path.join(cwd, 'adc.json');
  const project = 'temp-a1437';
  const account = 'fixture@temp-a1437.iam.gserviceaccount.com';
  const provider = 'projects/123/locations/global/workloadIdentityPools/test/providers/main';
  await writeFile(credentialFile, JSON.stringify({ type: 'external_account', audience: '//iam.googleapis.com/' + provider,
    service_account_impersonation_url: 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + account + ':generateAccessToken' }));
  const env = { GITHUB_ACTIONS: 'true', GOOGLE_APPLICATION_CREDENTIALS: credentialFile,
    CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: credentialFile, GOOGLE_OAUTH_ACCESS_TOKEN: 'google-fixture',
    LUYENTAP_HOSTING_READBACK_GOOGLE_ACCOUNT: account, LUYENTAP_HOSTING_READBACK_GOOGLE_PROVIDER: provider,
    LUYENTAP_RELEASE_CLOUDFLARE_READ_TOKEN: 'cf-fixture' };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(url);
    if (url === 'https://oauth2.googleapis.com/tokeninfo') return Response.json({ expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/cloud-platform' });
    if (url.startsWith('https://api.cloudflare.com/')) {
      assert.equal(options.headers.Authorization, 'Bearer cf-fixture');
      const code = url.endsWith('/settings') ? 9109 : 10000;
      return Response.json({ errors: [{ code, message: 'cf-fixture' }] }, { status: 403 });
    }
    assert.equal(options.headers.Authorization, 'Bearer google-fixture');
    if (url.includes('/.settings/rules.json')) return Response.json({ error: 'insufficient scopes' }, { status: 401 });
    if (url.startsWith('https://firebaserules.googleapis.com/')) {
      assert.equal(options.headers['x-goog-user-project'], project);
      return Response.json({ error: { status: 'PERMISSION_DENIED', message: 'google-fixture' } }, { status: 403 });
    }
    return Response.json(url.includes('/indexes') ? {} : false);
  });
  await assert.rejects(readListeningProvider(cwd, { hosting: true, firestore: true, firestoreIndexes: true, privateAudio: true }), error => {
    assert.match(error.message, /rulesSha256: .*HTTP 401.*ACCESS_TOKEN_SCOPE_INSUFFICIENT/u);
    assert.match(error.message, /firestoreRules: .*HTTP 403.*PERMISSION_DENIED/u);
    assert.match(error.message, /r2-upload-signer: active: [^;]*\/deployments: HTTP 403 \(Cloudflare code 10000\); settings: [^;]*\/settings: HTTP 403 \(Cloudflare code 9109\)/u);
    assert.match(error.message, /privateAudioBucket: .*Cloudflare code 10000/u);
    assert.match(error.message, /missing release scopes: firebase.database, userinfo.email/u);
    assert.doesNotMatch(error.message, /google-fixture|cf-fixture/u);
    return true;
  });
  assert(requests.some(url => url.includes('/indexes')));
  assert.equal(requests.filter(url => url === 'https://oauth2.googleapis.com/tokeninfo').length, 1);
});
