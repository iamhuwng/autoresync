import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const account = '/accounts/e41db829dabe9993f03674afdfd56510';
const script = `${account}/workers/scripts/r2-backup-worker`;
const revision = '99bb3f073319c57f62b0889d7c0a98b054e06e95';
const tree = '6cebb25691f322fd811c0ab5dd6ccf113e71dfe5';
const baseRevision = '422b7323f85a5b235d387cd18b25a1b9f63df46a';
const bundleSha256 = '6e4bb95e53191b1a32e361e044765c4d6da7d39764d0e904abcf8ddd82e4f7ed';
const configSha256 = 'b699855244b5004f0f45316b6efb0cf487dc7a86fb68f14a5cf0aa4cec580983';
const liveSha256 = 'c789454458790c5fb0893952043a150b34cefa345c5b02b06c1f04edddad112b';
const outsideTargetSha256 = 'ff00c8cd6e85798880f2e2542c43174e7ef9f4d84ff098562df1600b57d9c7e1';
const versionId = 'f37869c0-c597-41cc-893b-7f7652d80e41';
const observations = new WeakSet();
const hash = value => createHash('sha256').update(value).digest('hex');
export const isHomeworkWorkerObserved = value => observations.has(value);

export function assertHomeworkWorkerSource(source) {
  assert.equal(source.revision, revision, 'Homework candidate revision changed');
  assert.equal(source.tree, tree, 'Homework candidate tree changed');
  assert.equal(source.baseRevision, baseRevision, 'Homework reviewed base changed');
  assert.equal(source.dirty, false, 'Homework candidate worktree is dirty');
}

// The reviewed build moves this unchanged declaration block across resolveTarget.
export function normalizeHomeworkOutsideTarget(raw) {
  const text = raw.replaceAll('../../../../../repos/luyentap-prd0062/node_modules/', '../node_modules/').replace(/^\/\/# sourceMappingURL=.*$/gm, '').replace(/\r\n/g, '\n').trim();
  const start = text.indexOf('async function resolveTarget(');
  const end = text.indexOf('__name(resolveTarget, "resolveTarget");', start);
  assert(start > 0 && end > start, 'Homework target delimiters changed');
  const other = text.slice(0, start) + 'REVIEWED_RESOLVE_TARGET\n' + text.slice(end);
  const blockStart = other.indexOf('// ../functions/src/readingV2SubmitCore.ts\nvar READING_V2_ENGINE');
  const last = other.indexOf('var getMaterialIdFromRequest =', blockStart);
  const blockEnd = other.indexOf('\n', last) + 1;
  assert(blockStart > 0 && last > blockStart && blockEnd > last, 'Homework declaration block changed');
  const block = other.slice(blockStart, blockEnd);
  assert.equal(block.split('\n').length - 1, 98, 'Homework declaration move must be exactly 98 lines');
  return other.slice(0, blockStart) + other.slice(blockEnd) + block;
}

const expectedBindings = [
  ...Object.entries({ ADMIN_UID: 'ADMIN_UID', BACKUP_RETENTION_COUNT: '10', FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com', FIREBASE_PROJECT_ID: 'temp-a1437', MEDIA_CHECKPOINT_INTERVAL: '6' }).map(([name, value]) => ({ name, type: 'plain_text', valueSha256: hash(value) })),
  ...['BACKUP_R2_ACCESS_KEY_ID', 'BACKUP_R2_BUCKET_NAME', 'BACKUP_R2_ENDPOINT', 'BACKUP_R2_SECRET_ACCESS_KEY', 'GOOGLE_SA_KEY'].map(name => ({ name, type: 'secret_text' })),
  { name: 'PRIMARY_R2', type: 'r2_bucket', bucket_name: 'kahoot-media' },
].sort((a, b) => a.name.localeCompare(b.name));
const expectedSettings = { placement: {}, compatibility_date: '2024-01-01', compatibility_flags: [], usage_model: 'standard', tags: [], tail_consumers: [], logpush: false, annotations: { 'workers/triggered_by': 'version_upload' } };
const expectedScript = { etag: 'bb7b7c749c706ce95e7cc440606740590aaac8c60d73622cf3ac6921705c9295', handlers: ['fetch', 'scheduled'], last_deployed_from: 'wrangler' };

function assertCandidate(local) {
  assertHomeworkWorkerSource(local.source);
  assert.equal(local.sourceConfigSha256, '48b097a0a77dcf86d9a41062e520fc3896c7963891dad9159d8700742ad829b9', 'Homework source config changed');
  assert.equal(local.candidate.sha256, bundleSha256, 'Homework reviewed bundle changed');
  assert.equal(local.candidate.configSha256, configSha256, 'Homework deploy config changed');
  assert.equal(local.outsideTargetSha256, outsideTargetSha256, 'Homework candidate outside-target code changed');
}

// Pure validation never creates a trusted observation; only the provider observer does.
export function validateHomeworkWorkerEvidence(local, provider) {
  assertCandidate(local);
  assert.equal(provider.versionId, versionId, 'Homework active version changed');
  assert.deepEqual(provider.deployment.versions, [{ version_id: versionId, percentage: 100 }], 'Homework traffic split changed');
  assert.deepEqual(provider.deployment, provider.deploymentAfter, 'Homework deployment changed during observation');
  assert.equal(provider.moduleName, 'reading-release-candidate.mjs', 'Homework live module name changed');
  assert.equal(provider.sha256, liveSha256, 'Homework live code changed');
  assert.equal(provider.outsideTargetSha256, outsideTargetSha256, 'Homework live outside-target code changed');
  assert.deepEqual(provider.bindings, expectedBindings, 'Homework bindings or variables changed');
  assert.deepEqual(provider.effectiveBindings, expectedBindings, 'Homework effective bindings or variables changed');
  assert.deepEqual(provider.settings, expectedSettings, 'Homework Worker settings changed');
  assert.deepEqual(provider.script, expectedScript, 'Homework Worker script metadata changed');
  assert.deepEqual(provider.schedules.schedules.map(item => item.cron), ['0 3 * * 1'], 'Homework schedule changed');
  assert.deepEqual(provider.subdomain, { enabled: true, previews_enabled: true }, 'Homework workers.dev or previews changed');
  assert.deepEqual(provider.accountSubdomain, { subdomain: 'iamhuwng' }, 'Homework account subdomain changed');
  assert.deepEqual(provider.domains, [], 'Homework custom domains changed');
  assert.deepEqual(provider.zones, ['1aae6fb9889672cf695927eb575a5bbe'], 'Homework zone inventory changed');
  assert.deepEqual(provider.routes, [], 'Homework routes changed');
}

async function readCandidate(cwd, bundlePath, configPath) {
  assert(cwd && bundlePath && configPath, 'Homework cwd, reviewed bundle and deploy config paths are required');
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
    assert(!result.error && result.status === 0, `Homework source inspection failed: git ${args.join(' ')}`);
    return result.stdout.trim();
  };
  const source = { revision: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), baseRevision: git('rev-parse', '--verify', `${baseRevision}^{commit}`), dirty: Boolean(git('status', '--porcelain=v1', '--untracked-files=all')) };
  assertHomeworkWorkerSource(source);
  const bundle = await readFile(bundlePath), config = await readFile(configPath);
  const candidate = { sha256: hash(bundle), configSha256: hash(config), bundlePath, configPath };
  const local = { source, candidate, sourceConfigSha256: hash(await readFile(path.join(cwd, 'r2-backup-worker', 'wrangler.toml'))), outsideTargetSha256: hash(normalizeHomeworkOutsideTarget(bundle.toString('utf8'))) };
  assertCandidate(local);
  assert.equal(path.resolve(path.dirname(configPath), JSON.parse(config).main), bundlePath, 'Homework deploy config does not select the reviewed bundle path');
  return local;
}

function sanitizeBindings(bindings) {
  assert(Array.isArray(bindings), 'Homework provider bindings unavailable');
  return bindings.map(binding => {
    if (binding.type === 'plain_text') return { name: binding.name, type: binding.type, valueSha256: hash(binding.text) };
    if (binding.type === 'secret_text') return { name: binding.name, type: binding.type };
    assert.equal(binding.type, 'r2_bucket', 'Homework provider has an unreviewed binding type');
    return binding;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// Fixed production GETs only: no receipt, arbitrary URL, login, refresh or deployment input.
export async function observeHomeworkWorker({ cwd, bundlePath, configPath, fetchImpl = fetch } = {}) {
  cwd = path.resolve(cwd || '.');
  bundlePath = bundlePath && path.resolve(cwd, bundlePath);
  configPath = configPath && path.resolve(cwd, configPath);
  const local = await readCandidate(cwd, bundlePath, configPath);
  const authRoot = process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'xdg.config')
    : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const credentials = await readFile(path.join(authRoot, '.wrangler', 'config', 'default.toml'), 'utf8');
  const token = credentials.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/mu)?.[1];
  assert(token, 'Existing Cloudflare OAuth session unavailable');
  const requests = [];
  async function get(route, multipart = false) {
    requests.push({ method: 'GET', route });
    const url = `https://api.cloudflare.com/client/v4${route}`;
    const response = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    assert(response.ok && (!response.url || response.url === url), `Homework provider GET failed or redirected: ${response.status}`);
    if (multipart) return response.formData();
    const data = await response.json();
    assert(data.success, 'Homework provider GET unsuccessful');
    if (!route.endsWith('/deployments') && data.result_info?.total_pages) assert(data.result_info.total_pages <= 1, 'Homework provider pagination requires review');
    return data.result;
  }
  const deployment = (await get(`${script}/deployments`)).deployments[0];
  assert.deepEqual(deployment.versions, [{ version_id: versionId, percentage: 100 }], 'Homework active version or traffic changed');
  const info = await get(`${script}/versions/${versionId}`);
  const settings = await get(`${script}/settings`);
  const effectiveBindings = sanitizeBindings(settings.bindings);
  delete settings.bindings;
  const schedules = await get(`${script}/schedules`);
  const modules = [];
  for (const [name, value] of await get(script, true)) {
    const moduleName = typeof value === 'string' ? name : value.name;
    assert(/\.(m?js)$/.test(moduleName), 'Homework provider has an unexpected multipart part');
    const module = typeof value === 'string' ? value : await value.text();
    modules.push({ moduleName, sha256: hash(module), outsideTargetSha256: hash(normalizeHomeworkOutsideTarget(module)) });
  }
  assert.equal(modules.length, 1, 'Homework live module count changed');
  const subdomain = await get(`${script}/subdomain`);
  const accountSubdomain = await get(`${account}/workers/subdomain`);
  const domains = await get(`${account}/workers/domains`);
  const zones = (await get('/zones?account.id=e41db829dabe9993f03674afdfd56510&per_page=50')).map(zone => zone.id).sort();
  assert.deepEqual(zones, ['1aae6fb9889672cf695927eb575a5bbe'], 'Homework zone scope changed');
  const routes = await get('/zones/1aae6fb9889672cf695927eb575a5bbe/workers/routes');
  const deploymentAfter = (await get(`${script}/deployments`)).deployments[0];
  const provider = { versionId, deployment, deploymentAfter, script: info.resources.script, settings, bindings: sanitizeBindings(info.resources.bindings), effectiveBindings, schedules, subdomain, accountSubdomain, domains, zones, routes, ...modules[0], requests };
  validateHomeworkWorkerEvidence(local, provider);
  assert.deepEqual(await readCandidate(cwd, bundlePath, configPath), local, 'Homework local inputs changed during provider observation');
  const observation = deepFreeze({ service: 'backup-worker', identity: 'e41db829dabe9993f03674afdfd56510/r2-backup-worker', scope: 'isolated-homework-worker', source: local.source, candidate: local.candidate, provider, fingerprint: hash(JSON.stringify({ source: local.source, candidate: local.candidate, provider })), observedAt: new Date().toISOString(), readOnly: true, sourceKnown: false, provenance: 'Exact reviewed candidate and live code/configuration fingerprints; historical deployed Git source is unknown.' });
  observations.add(observation);
  return observation;
}
