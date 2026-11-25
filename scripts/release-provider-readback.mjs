import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectProviderReads, describeGoogleToken, hasGoogleAuthFailure, providerErrorDetails, ProviderReadError, readProviderJson } from './release-provider-diagnostics.mjs';

export const CLOUDFLARE_ACCOUNT_ID = 'e41db829dabe9993f03674afdfd56510';
export const CLOUDFLARE_ZONE_ID = '1aae6fb9889672cf695927eb575a5bbe';
export const FIREBASE_PROJECT_ID = 'temp-a1437';
export const FIREBASE_DATABASE_URL = 'https://temp-a1437-default-rtdb.firebaseio.com';
export const PRIVATE_AUDIO_BUCKET_NAME = 'luyentap-listening-audio-private';
export const PRODUCTION_WORKER_NAMES = Object.freeze([
  'luyentap-book-pdf-prod',
  'luyentap-notification-command',
  'luyentap-notification-firestore-qa',
  'r2-backup-worker',
  'r2-upload-signer',
  'thcs-gemma',
]);

const account = `/accounts/${CLOUDFLARE_ACCOUNT_ID}`;
const hash = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const digest = value => hash(canonical(value));
const exec = promisify(execFile);

export function hashWorkerVersionModules(version, versionId) {
  assert.equal(version.id, versionId, 'Cloudflare returned a different Worker version');
  assert(Array.isArray(version.modules) && version.modules.length > 0, 'Cloudflare omitted Worker version modules');
  const modules = Object.create(null);
  for (const module of version.modules) {
    assert(typeof module.name === 'string' && typeof module.content_base64 === 'string', 'Cloudflare returned an incomplete Worker version module');
    assert(!Object.hasOwn(modules, module.name), 'Duplicate Worker version module name');
    modules[module.name] = hash(Buffer.from(module.content_base64, 'base64'));
  }
  return modules;
}

export function workerInvariants(worker) {
  const settings = structuredClone(worker.settings);
  delete settings.annotations;
  return { settings, bindings: worker.bindings, runtime: worker.runtime,
    handlers: worker.handlers, namedHandlers: worker.namedHandlers,
    schedules: worker.schedules, subdomain: worker.subdomain };
}

export function validateFirestoreRulesReadback(release, ruleset, releaseAfter) {
  assert.equal(release.name, `projects/${FIREBASE_PROJECT_ID}/releases/cloud.firestore`, 'Firestore release changed');
  assert.match(release.rulesetName ?? '', new RegExp(`^projects/${FIREBASE_PROJECT_ID}/rulesets/[a-zA-Z0-9-]+$`, 'u'), 'Firestore ruleset is unavailable');
  assert.deepEqual(releaseAfter, release, 'Firestore release changed during observation');
  assert.equal(ruleset.name, release.rulesetName, 'Firestore ruleset changed');
  assert.deepEqual(ruleset.metadata?.services, ['cloud.firestore'], 'Firestore service changed');
  assert.equal(ruleset.source?.files?.length, 1, 'Firestore source inventory changed');
  const [file] = ruleset.source.files;
  assert.equal(file.name, 'firestore.rules', 'Firestore source name changed');
  assert.equal(typeof file.content, 'string', 'Firestore source content is unavailable');
  return { release, sourceName: file.name, sourceSha256: hash(file.content) };
}

export function formatCommandFailure(executable, args = [], result = {}) {
  const commandArgs = args.slice(0, 6).join(' ');
  const summary = commandArgs ? `${executable} ${commandArgs}` : executable;
  const statusDetail = `${result.error?.code ?? `exit ${result.status}`}; signal ${result.signal ?? 'none'}`;
  const stderr = typeof result.stderr === 'string'
    ? result.stderr.replace(/\s+/gu, ' ').trim().slice(0, 400)
    : '';
  return `Provider command failed: ${summary} (${statusDetail})${stderr ? `: ${stderr}` : ''}`;
}

export async function assertProtectedMain({ runGit, revision, label = 'Production deploy' }) {
  let remoteOutput;
  try {
    remoteOutput = String(await runGit(['ls-remote', 'origin', 'refs/heads/main']) ?? '').trim();
  } catch (error) {
    throw new Error(`Unable to verify protected origin/main before ${label.toLowerCase()} (pass --allow-non-main for an intentional hotfix): ${error.message}`, { cause: error });
  }
  const line = remoteOutput.split(/\r?\n/u).find(entry => /\srefs\/heads\/main$/u.test(entry.trim()));
  const remoteSha = line?.trim().split(/\s+/u)[0] || '';
  assert(/^[0-9a-f]{40}$/u.test(remoteSha), 'Protected origin/main revision could not be resolved from origin; verify your remote or pass --allow-non-main for an intentional hotfix.');
  assert.equal(
    revision,
    remoteSha,
    `${label} requires HEAD (${revision}) to match protected origin/main (${remoteSha}); merge to main first or pass --allow-non-main for an intentional hotfix.`,
  );
  return remoteSha;
}

function command(executable, args, cwd, env = process.env) {
  const result = spawnSync(executable, args, { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  assert(!result.error && result.status === 0, formatCommandFailure(executable, args, result));
  return result.stdout.trim();
}

function gcloud(args) {
  const env = { ...process.env, CLOUDSDK_CORE_CHECK_GCE_METADATA: 'false' };
  try {
    return process.platform === 'win32'
      ? command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `& gcloud.cmd ${args.map(arg => `'${arg}'`).join(' ')}`], undefined, env)
      : command('gcloud', args, undefined, env);
  } catch (error) { throw new Error(`Google CLI ${args.slice(0, 2).join(' ')}: ${error.message}`); }
}

export function assertHostingFederation(config, expectedAccount, expectedProvider) {
  assert(/^[a-z0-9-]+@temp-a1437\.iam\.gserviceaccount\.com$/u.test(expectedAccount || ''), 'Hosting readback service account is missing or targets another project');
  assert(/^projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/u.test(expectedProvider || ''), 'Hosting readback workload identity provider is missing or invalid');
  assert(config?.type === 'external_account', 'Hosting readback requires Google workload identity federation');
  assert(config.audience === `//iam.googleapis.com/${expectedProvider}`, 'Hosting readback workload identity provider changed');
  assert(config.service_account_impersonation_url === `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${expectedAccount}:generateAccessToken`, 'Hosting readback service account changed');
}

export async function readGoogleToken({ hosting = false, firebaseCli, runGcloud = gcloud } = {}) {
  if (hosting && process.env.GITHUB_ACTIONS === 'true') {
    const authFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    assert(authFile && process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE === authFile, 'Hosting readback Google credential file is unavailable or differs from the CLI credential');
    const config = JSON.parse(await readFile(authFile, 'utf8'));
    assertHostingFederation(config, process.env.LUYENTAP_HOSTING_READBACK_GOOGLE_ACCOUNT, process.env.LUYENTAP_HOSTING_READBACK_GOOGLE_PROVIDER);
    const scopedToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim();
    assert(scopedToken, 'Hosting readback scoped Google access token is unavailable');
    return scopedToken;
  }
  const auth = JSON.parse(runGcloud(['auth', 'list', '--format=json']));
  const active = auth.filter(item => item.status === 'ACTIVE').map(item => item.account);
  if (hosting && active.length === 0) {
    const cli = typeof firebaseCli === 'function' ? firebaseCli() : firebaseCli;
    assert(cli, 'Hosting readback requires the configured Google operator in gcloud or Firebase CLI');
    const firebaseAuth = createRequire(cli)('../auth.js');
    const accountInfo = firebaseAuth.getGlobalDefaultAccount();
    assert(accountInfo?.user?.email === 'iamhuwng@gmail.com' && accountInfo.tokens?.refresh_token, 'Hosting readback requires the configured Google operator in gcloud or Firebase CLI');
    const token = await firebaseAuth.getAccessToken(accountInfo.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
    assert(token?.access_token, 'Hosting readback Firebase CLI authentication is unavailable');
    return token.access_token;
  }
  assert.deepEqual(active, ['iamhuwng@gmail.com'], 'Google account changed');
  const configuredProject = runGcloud(['config', 'get-value', 'project']).trim();
  if (configuredProject && configuredProject !== '(unset)') {
    assert.equal(configuredProject, FIREBASE_PROJECT_ID, 'Google project changed');
  }
  return runGcloud(['auth', 'print-access-token', '--account=iamhuwng@gmail.com', `--project=${FIREBASE_PROJECT_ID}`]);
}

export async function readCloudflareToken(cwd, { hosting = false } = {}) {
  const scopedToken = hosting ? process.env.LUYENTAP_RELEASE_CLOUDFLARE_READ_TOKEN?.trim() : '';
  if (hosting && process.env.GITHUB_ACTIONS === 'true') assert(scopedToken, 'Hosting readback requires the LUYENTAP_RELEASE_CLOUDFLARE_READ_TOKEN secret');
  if (scopedToken) return scopedToken;
  if (!hosting) {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (apiToken) return apiToken;
  }
  const credentialOutput = command(process.execPath, [fileURLToPath(new URL('./tooling-where.mjs', import.meta.url)), '--exec', 'cloudflare-wrangler', 'auth', 'token', '--json'], cwd);
  let credentials;
  try { credentials = JSON.parse(credentialOutput); } catch { throw new Error('Wrangler returned an invalid authentication response.'); }
  assert(credentials?.type === 'oauth' && typeof credentials.token === 'string' && credentials.token, 'Existing Cloudflare OAuth session unavailable');
  return credentials.token;
}

export async function readWorkerState(name, cf) {
  const script = `${account}/workers/scripts/${name}`;
  const { active, settings, schedules, subdomain } = await collectProviderReads({
    active: async () => {
      const deployment = (await cf(`${script}/deployments`)).deployments?.[0];
      assert.equal(deployment?.versions?.length, 1, 'Active Worker is unavailable or split');
      const versionId = deployment.versions[0].version_id;
      assert.match(versionId ?? '', /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu, 'Worker version identity is invalid');
      const [version, versionWithModules] = await Promise.all([
        cf(`${script}/versions/${versionId}`),
        cf(`${account}/workers/workers/${name}/versions/${versionId}?include=modules`),
      ]);
      return { deployment, versionId, version, versionModules: hashWorkerVersionModules(versionWithModules, versionId) };
    },
    settings: () => cf(`${script}/settings`),
    schedules: () => cf(`${script}/schedules`),
    subdomain: () => cf(`${script}/subdomain`),
  });
  const sortBindings = values => values.map(value => value.type === 'secret_text' ? { name: value.name, type: value.type } : value).sort((a, b) => a.name.localeCompare(b.name));
  settings.bindings = sortBindings(settings.bindings || []);
  const { deployment, versionId, version, versionModules } = active;
  const modules = Object.entries(versionModules).map(([moduleName, sha256]) => ({ name: moduleName, sha256 })).sort((a, b) => a.name.localeCompare(b.name));
  return { versionId, deployment, deploymentAfter: (await cf(`${script}/deployments`)).deployments?.[0], settings,
    bindings: sortBindings(version.resources?.bindings || []), runtime: version.resources?.script_runtime,
    handlers: version.resources?.script?.handlers, namedHandlers: version.resources?.script?.named_handlers ?? [],
    schedules: (schedules.schedules || []).map(item => item.cron).sort(), subdomain, modules };
}

function findFirebaseCli(cwd) {
  const localCli = path.join(cwd, 'node_modules/firebase-tools/lib/bin/firebase.js');
  if (existsSync(localCli)) return localCli;
  const worktrees = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8', windowsHide: true });
  if (!worktrees.error && worktrees.status === 0) {
    const found = worktrees.stdout.split(/\r?\n/u)
      .filter(line => line.startsWith('worktree ')).map(line => line.slice(9))
      .map(root => path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js')).find(existsSync);
    if (found) return found;
  }
  const scriptRootCli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules/firebase-tools/lib/bin/firebase.js');
  return existsSync(scriptRootCli) ? scriptRootCli : undefined;
}

export async function readProviderState(cwd, options = {}) {
  const { hosting = false, rtdbRules = false, rtdbFlags = false, firestoreRules = false, firestoreIndexes = false,
    functions = false, workers = [], cloudflareCommon = false, privateAudio = false, onDiagnostic } = options;
  const needsGoogle = Boolean(rtdbRules || rtdbFlags || firestoreRules || firestoreIndexes);
  const needsCloudflare = Boolean((Array.isArray(workers) && workers.length > 0) || cloudflareCommon || privateAudio);
  if (!needsGoogle && !needsCloudflare && !functions) return {};
  const resolveFirebaseCli = () => findFirebaseCli(cwd);
  const acquireGoogle = async () => {
    try {
      const token = await readGoogleToken({ hosting, firebaseCli: resolveFirebaseCli });
      assert(token, 'Google provider access token unavailable');
      return token;
    } catch (error) {
      if (error.code === 'ERR_ASSERTION' && error.generatedMessage === false) throw error;
      throw new ProviderReadError('Google authentication unavailable; check gcloud or the repository Firebase CLI account');
    }
  };
  const [google, cloudflare] = await Promise.all([
    needsGoogle ? acquireGoogle().then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason })) : Promise.resolve(null),
    needsCloudflare ? readCloudflareToken(cwd, { hosting }).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason })) : Promise.resolve(null),
  ]);
  const readSettled = result => { if (result?.status === 'rejected') throw result.reason; return result?.value; };
  const getGoogle = url => readProviderJson(url, readSettled(google));
  const cf = async (route, multipart = false) => {
    const data = await readProviderJson(`https://api.cloudflare.com/client/v4${route}`, readSettled(cloudflare), { multipart });
    if (multipart) return data;
    if (!data.success) { const details = providerErrorDetails(data); throw new ProviderReadError(`Cloudflare GET unsuccessful${details ? ` (${details})` : ''}`); }
    assert(!data.result_info?.total_pages || data.result_info.total_pages <= 1 || route.endsWith('/deployments'), 'Provider pagination requires review');
    return data.result;
  };
  const probes = {};
  if (functions) probes.functions = async () => {
    const firebaseCli = resolveFirebaseCli();
    assert(firebaseCli, 'Repository-owned Firebase CLI unavailable');
    let output;
    try { output = await exec(process.execPath, [firebaseCli, 'functions:list', '--project', FIREBASE_PROJECT_ID, '--json', '--non-interactive'], { cwd, windowsHide: true, timeout: 25000 }); }
    catch { throw new ProviderReadError('Firebase CLI Functions inventory failed; check cloudfunctions.functions.list and run.services.list'); }
    const result = JSON.parse(output.stdout); assert.equal(result.status, 'success', 'Firebase Functions inventory unavailable'); return result.result;
  };
  if (needsGoogle) {
    if (google.status === 'rejected') probes['Google credential'] = () => readSettled(google);
    else {
      if (rtdbRules) probes.rulesSha256 = async () => digest(await getGoogle(`${FIREBASE_DATABASE_URL}/.settings/rules.json`));
      if (rtdbFlags) {
        probes.writesEnabled = () => getGoogle(`${FIREBASE_DATABASE_URL}/system_flags/listening_authoring_writes_enabled.json`);
        probes.restore = () => getGoogle(`${FIREBASE_DATABASE_URL}/system_flags/restore_in_progress.json`);
      }
      if (firestoreRules) probes.firestoreRules = async () => {
        const releaseUrl = `https://firebaserules.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/releases/cloud.firestore`;
        const release = await getGoogle(releaseUrl);
        assert.match(release.rulesetName ?? '', new RegExp(`^projects/${FIREBASE_PROJECT_ID}/rulesets/[a-zA-Z0-9-]+$`, 'u'), 'Firestore ruleset is unavailable');
        const ruleset = await getGoogle(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
        return validateFirestoreRulesReadback(release, ruleset, await getGoogle(releaseUrl));
      };
      if (firestoreIndexes) probes.firestoreIndexes = async () => {
        const result = await getGoogle(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/collectionGroups/-/indexes`);
        assert(!result.nextPageToken, 'Firestore index pagination requires review'); return (result.indexes || []).sort((a, b) => a.name.localeCompare(b.name));
      };
    }
  }
  if (needsCloudflare) {
    if (cloudflare.status === 'rejected') probes['Cloudflare credential'] = () => readSettled(cloudflare);
    else {
      if (Array.isArray(workers) && workers.length) probes.workers = () => collectProviderReads(Object.fromEntries([...new Set(workers)].map(name => [name, () => readWorkerState(name, cf)])));
      if (cloudflareCommon) probes.common = () => collectProviderReads({
        accountSubdomain: () => cf(`${account}/workers/subdomain`), domains: () => cf(`${account}/workers/domains`),
        zones: async () => { const zones = (await cf(`/zones?account.id=${CLOUDFLARE_ACCOUNT_ID}&per_page=50`)).map(entry => entry.id).sort(); assert.deepEqual(zones, [CLOUDFLARE_ZONE_ID], 'Cloudflare zone inventory changed'); return zones; },
        routes: () => cf(`/zones/${CLOUDFLARE_ZONE_ID}/workers/routes`),
      });
      if (privateAudio) { const bucket = `${account}/r2/buckets/${PRIVATE_AUDIO_BUCKET_NAME}`; probes.privateAudioBucket = async () => ({ bucketName: PRIVATE_AUDIO_BUCKET_NAME, ...await collectProviderReads({ managedDomain: () => cf(`${bucket}/domains/managed`), customDomains: () => cf(`${bucket}/domains/custom`), lifecycle: () => cf(`${bucket}/lifecycle`) }) }); }
    }
  }
  try {
    const provider = await collectProviderReads(probes);
    if (onDiagnostic && google?.status === 'fulfilled') onDiagnostic(await describeGoogleToken(google.value));
    return provider;
  } catch (error) {
    if (google?.status === 'fulfilled' && (onDiagnostic || hasGoogleAuthFailure(error))) throw new ProviderReadError(`${error.message}; ${await describeGoogleToken(google.value)}`);
    throw error;
  }
}
