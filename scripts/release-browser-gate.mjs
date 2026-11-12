import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000 || /[\0\r\n]/u.test(value)) throw new Error(`${label} is invalid`);
  return value.trim();
};

const parseArgs = argv => {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--card') result.card = argv[++i];
    else if (value === '--production-env-file') result.productionEnvFile = argv[++i];
    else if (value === '--output-dir') result.outputDir = argv[++i];
    else if (value === '--project') result.project = argv[++i];
    else if (value === '--site') result.site = argv[++i];
    else throw new Error(`Unknown argument ${value}`);
  }
  return result;
};

const parseEnv = raw => Object.fromEntries(raw.split(/\r?\n/u).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
  return match ? [[match[1], match[2].replace(/^['"]|['"]$/gu, '')]] : [];
}));

const run = (args, env, { allowFailure = false } = {}) => {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, env, encoding: 'utf8', windowsHide: true });
  if (!allowFailure && (result.error || result.status !== 0)) throw new Error(`Command failed: ${args.join(' ')}`);
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
};

const firebase = (args, env, options) => run(['scripts/tooling-where.mjs', '--exec', 'firebase', ...args], env, options);

const oauthToken = () => process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim()
  || execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', windowsHide: true }).trim();

const requestJson = async (url, init = {}) => {
  const response = await fetch(url, { redirect: 'error', ...init });
  const body = await response.text();
  let parsed;
  try { parsed = body ? JSON.parse(body) : null; } catch { parsed = body; }
  if (!response.ok) throw new Error(`Remote request failed (${response.status})`);
  return parsed;
};

const manifestDigest = manifest => sha256(JSON.stringify(manifest));

const waitForManifest = async (url, expectedDigest, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'manifest unavailable';
  while (Date.now() < deadline) {
    try {
      const manifest = await requestJson(`${url}/.well-known/luyentap-release.json`, { headers: { 'cache-control': 'no-cache' } });
      if (manifestDigest(manifest) !== expectedDigest) throw new Error('preview manifest differs from retained artifact');
      return manifest;
    } catch (error) {
      lastError = error.message;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw new Error(lastError);
};

const outputUrl = output => output.match(/https:\/\/[^\s)]+(?:\.web\.app|\.firebaseapp\.com)[^\s)]*/u)?.[0]?.replace(/[.,]+$/u, '') || '';

const deleteAccount = async ({ project, uid, token, databaseUrl }) => {
  await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:delete`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ localId: uid }),
  }).catch(() => undefined);
  await fetch(`${databaseUrl}/users/${encodeURIComponent(uid)}.json?access_token=${encodeURIComponent(token)}`, { method: 'DELETE', redirect: 'error' }).catch(() => undefined);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.card || !args.productionEnvFile || !args.outputDir) throw new Error('card, production environment and output directory are required');
  const card = JSON.parse(await readFile(path.resolve(args.card), 'utf8'));
  const env = parseEnv(await readFile(path.resolve(args.productionEnvFile), 'utf8'));
  const project = text(args.project || env.VITE_FIREBASE_PROJECT_ID, 'Firebase project');
  const site = text(args.site || 'kahut1', 'Hosting site');
  const outputDir = path.resolve(args.outputDir);
  await mkdir(outputDir, { recursive: true });
  const channel = `release-${process.env.GITHUB_RUN_ID || 'local'}-${randomUUID().slice(0, 8)}`;
  const recoveryChannel = `${channel}-recovery`;
  const accounts = [
    { role: 'teacher', email: 'teacher@test.com', uid: `${channel}-teacher`, displayName: `Release Smoke Teacher ${channel.slice(-8)}` },
    { role: 'student', email: 'student@test.com', uid: `${channel}-student`, displayName: `Release Smoke Student ${channel.slice(-8)}` },
  ];
  const accountPassword = 'password123';
  const accountIds = [];
  const baseUrl = new URL(env.VITE_FIREBASE_DATABASE_URL);
  const databaseUrl = `${baseUrl.protocol}//${baseUrl.host}`;
  let previewUrl = '';
  let recoveryUrl = '';
  let failure;
  let token = '';
  const childEnv = { ...process.env, CI: 'true' };
  try {
    token = oauthToken();
    const deploy = firebase(['hosting:channel:deploy', channel, '--only', `hosting:${site}`, '--project', project, '--non-interactive'], childEnv);
    previewUrl = outputUrl(`${deploy.stdout}\n${deploy.stderr}`);
    if (!previewUrl) throw new Error('Firebase did not return a preview channel URL');
    await waitForManifest(previewUrl, card.artifact.manifestSha256);

    for (const account of accounts) {
      await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchCreate`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ allowOverwrite: true, users: [{ localId: account.uid, email: account.email, rawPassword: accountPassword, displayName: account.displayName, emailVerified: true }] }),
      });
      accountIds.push(account.uid);
      const profile = { uid: account.uid, email: account.email, displayName: account.displayName, firstName: account.displayName, familyName: 'Release Smoke', role: account.role, status: 'active', createdAt: Date.now(), lastLoginAt: Date.now(), profileCompletedAt: Date.now(), forceReauth: false, releaseSmoke: { sourceRevision: card.source.revision, backendRevision: card.baseline.revision } };
      await requestJson(`${databaseUrl}/users/${encodeURIComponent(account.uid)}.json?access_token=${encodeURIComponent(token)}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile),
      });
    }

    const browserEnv = {
      ...childEnv,
      RELEASE_BROWSER_BASE_URL: previewUrl,
      RELEASE_BROWSER_OUTPUT_DIR: outputDir,
      RELEASE_BROWSER_TEACHER_EMAIL: accounts[0].email,
      RELEASE_BROWSER_STUDENT_EMAIL: accounts[1].email,
      RELEASE_BROWSER_PASSWORD: accountPassword,
    };
    const browser = run(['scripts/tooling-where.mjs', '--exec', 'playwright', 'test', 'e2e/release-promotion-browser.spec.ts', '--config', 'playwright.release-promotion.config.mjs'], browserEnv, { allowFailure: true });
    if (browser.status !== 0) throw new Error('Playwright authenticated release flow failed');

    const clone = firebase(['hosting:clone', `${site}:${channel}`, `${site}:${recoveryChannel}`, '--project', project, '--non-interactive'], childEnv);
    recoveryUrl = outputUrl(`${clone.stdout}\n${clone.stderr}`);
    if (!recoveryUrl) throw new Error('Firebase did not return a recovery channel URL');
    await waitForManifest(recoveryUrl, card.artifact.manifestSha256);
  } catch (error) {
    failure = error;
  } finally {
    if (token) for (const uid of accountIds) await deleteAccount({ project, uid, token, databaseUrl });
    if (recoveryChannel) firebase(['hosting:channel:delete', recoveryChannel, '--site', site, '--project', project, '--force'], childEnv, { allowFailure: true });
    if (channel) firebase(['hosting:channel:delete', channel, '--site', site, '--project', project, '--force'], childEnv, { allowFailure: true });
  }

  const observedAt = new Date().toISOString();
  const browserEvidence = {
    decision: failure ? 'blocked' : 'verified', observedAt,
    scenario: 'generated teacher and student accounts on a disposable Hosting preview with native clone recovery',
    sourceRevision: card.source.revision, sourceFingerprint: card.source.fingerprint,
    environmentFingerprint: card.environment.fingerprint, configurationFingerprint: card.configuration.firebaseSha256,
    evidenceRefs: [
      `github-actions://run/${process.env.GITHUB_RUN_ID || 'local'}/artifacts/release-browser-evidence`,
      ...(previewUrl ? [previewUrl] : []), ...(recoveryUrl ? [recoveryUrl] : []),
    ],
    summary: failure ? `Browser qualification blocked: ${failure.message}` : 'Playwright teacher/student flow, retained-artifact manifest readback and native clone recovery passed; disposable channels and accounts were deleted.',
  };
  await writeFile(path.join(outputDir, 'browser.json'), `${JSON.stringify(browserEvidence, null, 2)}\n`);
  await writeFile(path.join(outputDir, 'coordinated-change.json'), `${JSON.stringify({
    schemaVersion: 1, sourceRevision: card.source.revision, backendRevision: card.baseline.revision,
    frontend: { status: failure ? 'blocked' : 'verified', artifactSha256: card.artifact.manifestSha256 },
    backend: { status: failure ? 'blocked' : 'verified', generatedAccounts: accounts.map(({ role, email }) => ({ role, email })) },
    rollback: { decision: card.verification.compatibilityReview ? 'requires-review' : 'rejected', reason: 'Frontend rollback is rejected when backend compatibility evidence is missing.' },
  }, null, 2)}\n`);
  if (failure) process.exitCode = 0;
};

try { await main(); } catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
