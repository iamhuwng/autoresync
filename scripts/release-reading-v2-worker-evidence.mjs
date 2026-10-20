import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const account = '/accounts/e41db829dabe9993f03674afdfd56510';
const script = account + '/workers/scripts/r2-backup-worker';
export const reviewedReadingV2WorkerRelease = Object.freeze({
  revision: '10786002eb459a1b54025a23590cda8a6f610112',
  tree: 'fa589d21617ce5b277b2c778c2031253c7dc3037',
  baseRevision: '99bb3f073319c57f62b0889d7c0a98b054e06e95',
  sourceConfigSha256: '48b097a0a77dcf86d9a41062e520fc3896c7963891dad9159d8700742ad829b9',
  bundleSha256: 'e7649edece98e3935adf49227dffc3ca019a4cda276578de4f51a45d5c3aec66',
  deployConfigSha256: 'd2570c96dcbc8ef084253b143ae80cdc216a0c95a982d9db0cdf6bd7766b0b92',
  baselineVersionId: '6aa7ac0f-7ccb-4c37-a20c-e6788bd6dd25',
  baselineBundleSha256: '6e4bb95e53191b1a32e361e044765c4d6da7d39764d0e904abcf8ddd82e4f7ed',
  moduleName: 'index.js',
  message: 'Reading V2 multiple-answer slots; isolated reviewed bundle',
  sourceFiles: [
    'functions/src/readingV2SubmitCore.test.ts',
    'functions/src/readingV2SubmitCore.ts',
    'src/services/reading-v2/readingV2AnswerScoring.ts',
    'src/types/readingV2.types.ts',
  ],
});
const release = reviewedReadingV2WorkerRelease;
const hash = value => createHash('sha256').update(value).digest('hex');
const observations = new WeakSet();
const expectedBindings = [
  ...Object.entries({ ADMIN_UID: 'ADMIN_UID', BACKUP_RETENTION_COUNT: '10', FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com', FIREBASE_PROJECT_ID: 'temp-a1437', MEDIA_CHECKPOINT_INTERVAL: '6' }).map(([name, value]) => ({ name, type: 'plain_text', valueSha256: hash(value) })),
  ...['BACKUP_R2_ACCESS_KEY_ID', 'BACKUP_R2_BUCKET_NAME', 'BACKUP_R2_ENDPOINT', 'BACKUP_R2_SECRET_ACCESS_KEY', 'GOOGLE_SA_KEY'].map(name => ({ name, type: 'secret_text' })),
  { name: 'PRIMARY_R2', type: 'r2_bucket', bucket_name: 'kahoot-media' },
].sort((a, b) => a.name.localeCompare(b.name));
const expectedSettings = { placement: {}, compatibility_date: '2024-01-01', compatibility_flags: [], usage_model: 'standard', tags: [], tail_consumers: [], logpush: false, annotations: { 'workers/message': 'Homework recipient canonicalization; isolated reviewed bundle', 'workers/triggered_by': 'version_upload' } };
const expectedConfig = {
  main: 'index.js',
  name: 'r2-backup-worker',
  compatibility_date: '2024-01-01',
  triggers: { crons: ['0 3 * * 1'] },
  r2_buckets: [{ binding: 'PRIMARY_R2', bucket_name: 'kahoot-media' }],
  vars: {
    ADMIN_UID: 'ADMIN_UID',
    BACKUP_RETENTION_COUNT: '10',
    FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com',
    FIREBASE_PROJECT_ID: 'temp-a1437',
    MEDIA_CHECKPOINT_INTERVAL: '6',
  },
};

export const isReadingV2WorkerObserved = value => observations.has(value);

export function assertReadingV2WorkerSource(source) {
  assert.equal(source.revision, release.revision, 'Reading V2 Worker candidate revision changed');
  assert.equal(source.tree, release.tree, 'Reading V2 Worker candidate tree changed');
  assert.equal(source.baseRevision, release.baseRevision, 'Reading V2 Worker reviewed base changed');
  assert.equal(source.dirty, false, 'Reading V2 Worker candidate worktree is dirty');
  assert.deepEqual(source.files, release.sourceFiles, 'Reading V2 Worker source scope changed');
}

function assertCandidate(local) {
  assertReadingV2WorkerSource(local.source);
  assert.equal(local.sourceConfigSha256, release.sourceConfigSha256, 'Reading V2 Worker source config changed');
  assert.equal(local.bundleSha256, release.bundleSha256, 'Reading V2 Worker bundle changed');
  assert.equal(local.deployConfigSha256, release.deployConfigSha256, 'Reading V2 Worker deploy config changed');
  assert.deepEqual(local.deployConfig, expectedConfig, 'Reading V2 Worker deploy config content changed');
}

function sanitizeBindings(bindings) {
  assert(Array.isArray(bindings), 'Reading V2 Worker provider bindings unavailable');
  return bindings.map(binding => {
    if (binding.type === 'plain_text') return { name: binding.name, type: binding.type, valueSha256: hash(binding.text) };
    if (binding.type === 'secret_text') return { name: binding.name, type: binding.type };
    assert.equal(binding.type, 'r2_bucket', 'Reading V2 Worker has an unreviewed binding type');
    return binding;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function validateReadingV2WorkerEvidence(local, provider, phase) {
  assertCandidate(local);
  assert(['predeploy', 'postdeploy'].includes(phase), 'Reading V2 Worker phase is invalid');
  const expectedVersion = phase === 'predeploy' ? release.baselineVersionId : provider.versionId;
  assert.equal(provider.versionId, expectedVersion, 'Reading V2 Worker version does not match its release phase');
  if (phase === 'postdeploy') assert.notEqual(provider.versionId, release.baselineVersionId, 'Reading V2 Worker deployment did not create a new active version');
  assert.deepEqual(provider.deployment.versions, [{ version_id: expectedVersion, percentage: 100 }], 'Reading V2 Worker traffic split changed');
  assert.deepEqual(provider.deployment, provider.deploymentAfter, 'Reading V2 Worker deployment changed during observation');
  assert.equal(provider.moduleName, release.moduleName, 'Reading V2 Worker module name changed');
  assert.equal(provider.sha256, phase === 'predeploy' ? release.baselineBundleSha256 : release.bundleSha256, 'Reading V2 Worker live module does not match its release phase');
  assert.deepEqual(provider.bindings, expectedBindings, 'Reading V2 Worker bindings or variables changed');
  assert.deepEqual(provider.effectiveBindings, expectedBindings, 'Reading V2 Worker effective bindings or variables changed');
  assert.deepEqual(provider.settings, phase === 'predeploy' ? expectedSettings : {
    ...expectedSettings,
    annotations: { ...expectedSettings.annotations, 'workers/message': release.message },
  }, 'Reading V2 Worker settings changed');
  assert.deepEqual(provider.script.handlers, ['fetch', 'scheduled'], 'Reading V2 Worker handlers changed');
  assert.equal(provider.script.last_deployed_from, 'wrangler', 'Reading V2 Worker deployment source changed');
  assert.deepEqual(provider.schedules.schedules.map(item => item.cron), ['0 3 * * 1'], 'Reading V2 Worker schedule changed');
  assert.deepEqual(provider.subdomain, { enabled: true, previews_enabled: true }, 'Reading V2 Worker workers.dev or previews changed');
  assert.deepEqual(provider.accountSubdomain, { subdomain: 'iamhuwng' }, 'Reading V2 Worker account subdomain changed');
  assert.deepEqual(provider.domains, [], 'Reading V2 Worker custom domains changed');
  assert.deepEqual(provider.zones, ['1aae6fb9889672cf695927eb575a5bbe'], 'Reading V2 Worker zone inventory changed');
  assert.deepEqual(provider.routes, [], 'Reading V2 Worker routes changed');
}

async function readCandidate(cwd, bundlePath, configPath) {
  assert(cwd && bundlePath && configPath, 'Reading V2 Worker cwd, reviewed bundle and deploy config paths are required');
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
    assert(!result.error && result.status === 0, 'Reading V2 Worker source inspection failed: git ' + args.join(' '));
    return result.stdout.trim();
  };
  const changed = git('diff-tree', '--no-commit-id', '--name-only', '-r', release.baseRevision, 'HEAD').split(/\r?\n/u).filter(Boolean).sort();
  const status = git('status', '--porcelain=v1', '--untracked-files=all');
  const source = {
    revision: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    baseRevision: git('rev-parse', '--verify', release.baseRevision + '^{commit}'),
    dirty: Boolean(status),
    files: changed,
  };
  assertReadingV2WorkerSource(source);
  const bundle = await readFile(bundlePath);
  const configBytes = await readFile(configPath);
  const deployConfig = JSON.parse(configBytes.toString('utf8'));
  assert.deepEqual(deployConfig, expectedConfig, 'Reading V2 Worker deploy config content changed');
  assert.equal(path.resolve(path.dirname(configPath), deployConfig.main), bundlePath, 'Reading V2 Worker deploy config does not select the reviewed bundle');
  const sourceConfigSha256 = hash(await readFile(path.join(cwd, 'r2-backup-worker', 'wrangler.toml')));
  const local = { source, sourceConfigSha256, bundleSha256: hash(bundle), deployConfigSha256: hash(configBytes), deployConfig };
  assertCandidate(local);
  return local;
}

export async function readReadingV2WorkerProvider() {
  const authRoot = process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'xdg.config')
    : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const credentials = await readFile(path.join(authRoot, '.wrangler', 'config', 'default.toml'), 'utf8');
  const token = credentials.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/mu)?.[1];
  assert(token, 'Existing Cloudflare OAuth session unavailable');
  async function get(route, multipart = false) {
    const url = 'https://api.cloudflare.com/client/v4' + route;
    const response = await fetch(url, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    assert(response.ok && (!response.url || response.url === url), 'Reading V2 Worker provider GET failed or redirected: ' + response.status);
    if (multipart) return response.formData();
    const data = await response.json();
    assert(data.success, 'Reading V2 Worker provider GET unsuccessful');
    if (!route.endsWith('/deployments') && data.result_info?.total_pages) assert(data.result_info.total_pages <= 1, 'Reading V2 Worker provider pagination requires review');
    return data.result;
  }
  const deployment = (await get(script + '/deployments')).deployments[0];
  assert(deployment?.versions?.length === 1, 'Reading V2 Worker deployment is unavailable or split');
  const versionId = deployment.versions[0].version_id;
  const info = await get(script + '/versions/' + versionId);
  const settings = await get(script + '/settings');
  const effectiveBindings = sanitizeBindings(settings.bindings);
  delete settings.bindings;
  const schedules = await get(script + '/schedules');
  const modules = [];
  for (const [name, value] of await get(script, true)) {
    const moduleName = typeof value === 'string' ? name : value.name;
    assert(/\.(m?js)$/u.test(moduleName), 'Reading V2 Worker provider returned an unexpected module');
    const module = typeof value === 'string' ? value : Buffer.from(await value.arrayBuffer());
    modules.push({ moduleName, sha256: hash(module) });
  }
  assert.equal(modules.length, 1, 'Reading V2 Worker provider module count changed');
  const subdomain = await get(script + '/subdomain');
  const accountSubdomain = await get(account + '/workers/subdomain');
  const domains = await get(account + '/workers/domains');
  const zones = (await get('/zones?account.id=e41db829dabe9993f03674afdfd56510&per_page=50')).map(zone => zone.id).sort();
  const routes = await get('/zones/1aae6fb9889672cf695927eb575a5bbe/workers/routes');
  const deploymentAfter = (await get(script + '/deployments')).deployments[0];
  return {
    versionId, deployment, deploymentAfter,
    script: info.resources.script,
    settings,
    bindings: sanitizeBindings(info.resources.bindings),
    effectiveBindings,
    schedules, subdomain, accountSubdomain, domains, zones, routes,
    ...modules[0],
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

async function observeReadingV2Worker({ cwd, bundlePath, configPath, phase } = {}) {
  cwd = path.resolve(cwd || '.');
  bundlePath = bundlePath && path.resolve(cwd, bundlePath);
  configPath = configPath && path.resolve(cwd, configPath);
  const local = await readCandidate(cwd, bundlePath, configPath);
  const provider = await readReadingV2WorkerProvider();
  validateReadingV2WorkerEvidence(local, provider, phase);
  assert.deepEqual(await readReadingV2WorkerProvider(), provider, 'Reading V2 Worker provider changed during observation');
  assert.deepEqual(await readCandidate(cwd, bundlePath, configPath), local, 'Reading V2 Worker local inputs changed during provider observation');
  const observation = deepFreeze({
    service: 'backup-worker', identity: 'e41db829dabe9993f03674afdfd56510/r2-backup-worker',
    scope: 'reading-v2-multi-slot-submit-worker', phase, source: local.source,
    candidate: { bundleSha256: local.bundleSha256, deployConfigSha256: local.deployConfigSha256, sourceConfigSha256: local.sourceConfigSha256 },
    provider, fingerprint: hash(JSON.stringify({ phase, source: local.source, candidate: local, provider })),
    observedAt: new Date().toISOString(), readOnly: true, sourceKnown: false,
    provenance: 'Exact reviewed Worker source/artifact and fresh provider configuration readback; historical deployed Git provenance remains unknown.',
  });
  observations.add(observation);
  return observation;
}

export { observeReadingV2Worker };
