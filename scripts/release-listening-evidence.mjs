import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const accountId = 'e41db829dabe9993f03674afdfd56510';
const account = `/accounts/${accountId}`;
const database = 'https://temp-a1437-default-rtdb.firebaseio.com';
const observations = new WeakSet();
const hash = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const digest = value => hash(canonical(value));
const phases = ['predeploy', 'rules', 'upload', 'homework'];
const deepFreeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
};

// Final source, artifacts and provider pins require independent review before use.
export const reviewedListeningRelease = deepFreeze({
  revision: '797f6284206f0fbc8eb45305f01997cc8831dec5', tree: '5279211c19196a1e34ec1b4338aeb4913772aa79', baseRevision: '03089c913ecd81201759181328f991a78bea21d3',
  priorRulesRevision: '87adebb81e8c7896103803c2807b8ab76d95897a',
  filesSha256: '913828f60cf4eb1289f112b59ee18ad2cd6718d0b748a1f86318d72abcf94049',
  priorRulesSha256: '1fdd6321aad54e7a7bca84b51836601d5dacf8491587dca6274247bbc194a4cb',
  rulesSha256: '0310f19cc07a8970ce2b12672e60fe6389acaf255910319a4286058e39fbdbc3',
  commonSha256: '5b7c5cc18708132a4f54e450349c3c1a0bca2f48f4747a22f0de6109e39c9588',
  envSha256: '8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57',
  workers: {
    'r2-upload-signer': { baselineVersion: 'c6bc690e-4636-4ea6-8098-35f5370cce9d', baselineModules: [{ name: 'worker.js', sha256: '5b652dbafb15e3c4b17d83ac23c0eb4e577e29f62ffbfbdc5e98d62a553e20d3' }], invariantSha256: '0d6807ba1a9ecff8ff79d9a17aa773a9c57f94388ae6767a8ac9f571b7d087b0', bundleSha256: '21a423c4bf42320ed5411e493e1ef8c24bf7ccea4d0ee4da40f310f583d6fd3b', configSha256: '27bb66e621d2404f472f52fab9da9407ec61248f72c90c66a6884796d106172e', sourceConfigSha256: 'fcac57397e7b6ee7604d1e1cffb56a7176cdc1556a71483ad115898c941540ec' },
    'r2-backup-worker': { baselineVersion: 'bb4fc431-e84d-4b50-8c11-9f9c0ddecd4f', baselineModules: [{ name: 'index.js', sha256: '341d0bb25ffd992da94a9b67d086a8a1edce99a49ef4260b7c595d891e2fc4f8' }], invariantSha256: 'c984cf3a91e222ad339732c343bfb896846eef13d75cb66fe55afd6760b5d708', bundleSha256: '64e0e529f924805ec7983986206b51775ed5710837a370bfb45ae1f78206aec1', configSha256: 'd9ca0a1f2e3ad1cae5306abb6c369e375354197f581370bfb28ce3cc54c2ff95', sourceConfigSha256: '48b097a0a77dcf86d9a41062e520fc3896c7963891dad9159d8700742ad829b9' },
  },
  unchangedWorkers: {
    'luyentap-notification-command': { baselineVersion: 'a184d75b-8823-485a-885d-e23354646f45', baselineModules: [{ name: 'notification-command-active.mjs', sha256: '9734197c765b06de9d746e68fea9a4912780447e05ddb12057e1ac3c6e2f9ed7' }, { name: 'notification-command-entry.js', sha256: '72a358e0f7313fd37e89f7bf1d85cd1337c199192dc6c297881bf1b71258d270' }], invariantSha256: '2607c64ddaafc5bb3ddcea24223b52e73bd3763271bfa10f469893c97e43a87e' },
    'luyentap-notification-firestore-qa': { baselineVersion: '5696e963-c5ed-463d-a495-30db3c07bc98', baselineModules: [{ name: 'notification-firestore-do.js', sha256: 'fa9ba9fe7df75fb940aeec73372d214a0ceab8fdc363b2f909fdaba9a4c7a7cf' }], invariantSha256: 'f8258abd467010f11cb559ca6987b7b2837c1854983a40b8d68203ac24a98355' },
  },
});
export const isListeningReleaseObserved = value => observations.has(value);

export function assertListeningSource(source, pins = reviewedListeningRelease) {
  for (const field of ['revision', 'tree', 'baseRevision']) {
    assert.match(pins[field] ?? '', /^[a-f0-9]{40}$/, `Listening ${field} is not reviewed`);
    assert.equal(source[field], pins[field], `Listening ${field} changed`);
  }
  assert.equal(source.dirty, false, 'Listening candidate worktree is dirty');
  assert.equal(digest(source.files), pins.filesSha256, 'Listening source scope changed');
}

export function workerInvariants(worker) {
  const settings = structuredClone(worker.settings);
  // Deployment annotations describe the new upload, not runtime configuration.
  delete settings.annotations;
  return { settings, bindings: worker.bindings, runtime: worker.runtime,
    handlers: worker.handlers, namedHandlers: worker.namedHandlers,
    schedules: worker.schedules, subdomain: worker.subdomain };
}

export function validateListeningEvidence(local, provider, phase, pins = reviewedListeningRelease) {
  assertListeningSource(local.source, pins);
  assert(phases.includes(phase), 'Listening phase is invalid');
  assert.equal(digest(local.rules), pins.rulesSha256, 'Listening candidate rules changed');
  assert.equal(digest(local.priorRules), pins.priorRulesSha256, 'Listening prior rules changed');
  const remaining = structuredClone(local.rules);
  const node = tree => tree.rules.homework_test_access.$testId.$studentId.$homeworkId;
  assert.notEqual(node(remaining)['.validate'], node(local.priorRules)['.validate'], 'Listening grant validation did not change');
  node(remaining)['.validate'] = node(local.priorRules)['.validate'];
  assert.equal(canonical(remaining), canonical(local.priorRules), 'Listening rules changed outside grant validation');
  assert.equal(provider.rulesSha256, phase === 'predeploy' ? pins.priorRulesSha256 : pins.rulesSha256, 'Listening live rules changed');
  assert.equal(provider.writesEnabled, true, 'Listening authoring writes are not enabled');
  assert(provider.restore === null || provider.restore === false || (provider.restore && provider.restore.active === false), 'Listening restore state is active or ambiguous');
  assert.equal(digest(provider.common), pins.commonSha256, 'Listening provider routes or account changed');
  assert.deepEqual(provider.functions, [], 'Listening release excludes deployed Firebase Functions');
  assert.match(pins.envSha256 ?? '', /^[a-f0-9]{64}$/, 'Listening production environment is not reviewed');
  assert.equal(local.envSha256, pins.envSha256, 'Listening production environment changed');
  assert.equal(local.submitEndpoint, 'https://r2-backup-worker.iamhuwng.workers.dev/api/reading-v2/submit', 'Listening production submit does not use the reviewed Worker');
  for (const [name, expected] of Object.entries(pins.workers)) {
    const candidate = local.workers[name], worker = provider.workers[name];
    for (const key of ['bundleSha256', 'configSha256', 'sourceConfigSha256']) {
      assert.match(expected[key] ?? '', /^[a-f0-9]{64}$/, `Listening ${name} ${key} is not reviewed`);
      assert.equal(candidate[key], expected[key], `Listening ${name} ${key} changed`);
    }
    assert.equal(digest(workerInvariants(worker)), expected.invariantSha256, `Listening ${name} runtime configuration changed`);
    assert.deepEqual(worker.deployment, worker.deploymentAfter, `Listening ${name} changed during observation`);
    assert.deepEqual(worker.deployment.versions, [{ version_id: worker.versionId, percentage: 100 }], `Listening ${name} traffic is split`);
    const deployed = phases.indexOf(phase) >= (name === 'r2-upload-signer' ? 2 : 3);
    if (!deployed) assert.equal(worker.versionId, expected.baselineVersion, `Listening ${name} baseline version changed`);
    else assert.notEqual(worker.versionId, expected.baselineVersion, `Listening ${name} candidate is not deployed`);
    assert.deepEqual(worker.modules, deployed ? [{ name: candidate.moduleName, sha256: expected.bundleSha256 }] : expected.baselineModules, `Listening ${name} module changed`);
  }
  for (const [name, expected] of Object.entries(pins.unchangedWorkers)) {
    assert(expected, `Listening unchanged service ${name} is not reviewed`);
    const worker = provider.workers[name];
    assert.equal(worker.versionId, expected.baselineVersion, `Listening unchanged service ${name} version changed`);
    assert.deepEqual(worker.deployment, worker.deploymentAfter, `Listening unchanged service ${name} changed during observation`);
    assert.deepEqual(worker.deployment.versions, [{ version_id: expected.baselineVersion, percentage: 100 }], `Listening unchanged service ${name} traffic changed`);
    assert.deepEqual(worker.modules, expected.baselineModules, `Listening unchanged service ${name} modules changed`);
    assert.equal(digest(workerInvariants(worker)), expected.invariantSha256, `Listening unchanged service ${name} configuration changed`);
  }
}

function command(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  assert(!result.error && result.status === 0, `Listening command failed: ${executable} ${args.slice(0, 2).join(' ')} (${result.error?.code ?? `exit ${result.status}`}; signal ${result.signal ?? 'none'})`);
  return result.stdout.trim();
}

async function readCandidate({ cwd, uploadBundle, uploadConfig, homeworkBundle, homeworkConfig }) {
  const git = (...args) => command('git', args, cwd);
  const source = { revision: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
    baseRevision: git('rev-parse', '--verify', `${reviewedListeningRelease.baseRevision}^{commit}`),
    dirty: Boolean(git('status', '--porcelain=v1', '--untracked-files=all')),
    files: git('diff', '--name-only', reviewedListeningRelease.baseRevision, 'HEAD').split(/\r?\n/).filter(Boolean).sort() };
  assertListeningSource(source);
  const workers = {};
  for (const [name, bundle, config, sourceConfig] of [
    ['r2-upload-signer', uploadBundle, uploadConfig, 'cloudflare/wrangler.jsonc'],
    ['r2-backup-worker', homeworkBundle, homeworkConfig, 'r2-backup-worker/wrangler.toml'],
  ]) {
    assert(bundle && config, 'Both Listening Worker bundle/config paths are required');
    const bundlePath = path.resolve(cwd, bundle), configPath = path.resolve(cwd, config);
    const configBytes = await readFile(configPath), deployment = JSON.parse(configBytes);
    assert.equal(deployment.name, name, 'Listening deploy service changed');
    assert.equal(path.resolve(path.dirname(configPath), deployment.main), bundlePath, 'Listening deploy config does not select reviewed bundle');
    assert.equal(deployment.no_bundle, true, 'Listening deployment must retain reviewed bytes');
    workers[name] = { bundleSha256: hash(await readFile(bundlePath)), configSha256: hash(configBytes),
      sourceConfigSha256: hash(await readFile(path.join(cwd, sourceConfig))), moduleName: path.basename(bundlePath) };
  }
  const envBytes = await readFile(path.join(os.homedir(), '.luyentap', 'env', '.env.production'));
  const endpoint = envBytes.toString('utf8').match(/^VITE_READING_V2_SUBMISSION_ENDPOINT\s*=\s*(.*?)\s*$/m)?.[1]?.replace(/^(['"])(.*)\1$/, '$2');
  return { source, workers, envSha256: hash(envBytes), submitEndpoint: endpoint,
    rules: JSON.parse(await readFile(path.join(cwd, 'database.rules.json'), 'utf8')),
    priorRules: JSON.parse(command('git', ['show', `${reviewedListeningRelease.priorRulesRevision ?? reviewedListeningRelease.baseRevision}:database.rules.json`], cwd)) };
}

// Fixed native provider GETs only; no caller transport or evidence injection.
export async function readListeningProvider(cwd) {
  const authRoot = process.platform === 'win32' ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'xdg.config') : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const credentials = await readFile(path.join(authRoot, '.wrangler/config/default.toml'), 'utf8');
  const token = credentials.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/mu)?.[1];
  assert(token, 'Existing Cloudflare authentication unavailable');
  const gcloud = args => {
    try {
      return process.platform === 'win32'
        ? command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `& gcloud ${args.map(arg => `'${arg}'`).join(' ')}`])
        : command('gcloud', args);
    } catch (error) { throw new Error(`Google CLI ${args.slice(0, 2).join(' ')}: ${error.message}`); }
  };
  const auth = JSON.parse(gcloud(['auth', 'list', '--format=json']));
  assert.deepEqual(auth.filter(item => item.status === 'ACTIVE').map(item => item.account), ['iamhuwng@gmail.com'], 'Listening Google account changed');
  assert.equal(gcloud(['config', 'get-value', 'project']), 'temp-a1437', 'Listening Google project changed');
  const googleToken = gcloud(['auth', 'print-access-token', '--account=iamhuwng@gmail.com', '--project=temp-a1437']);
  async function get(url, bearer, multipart = false) {
    const response = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${bearer}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    assert(response.ok && (!response.url || response.url === url), `Listening provider GET failed: ${response.status}`);
    if (multipart) return response.formData();
    return response.json();
  }
  const cf = async (route, multipart = false) => {
    const data = await get(`https://api.cloudflare.com/client/v4${route}`, token, multipart);
    if (multipart) return data;
    assert(data.success, 'Listening Cloudflare GET unsuccessful');
    assert(!data.result_info?.total_pages || data.result_info.total_pages <= 1 || route.endsWith('/deployments'), 'Listening provider pagination requires review');
    return data.result;
  };
  const workers = {};
  for (const name of [...Object.keys(reviewedListeningRelease.workers), ...Object.keys(reviewedListeningRelease.unchangedWorkers)]) {
    const script = `${account}/workers/scripts/${name}`;
    const deployment = (await cf(`${script}/deployments`)).deployments[0];
    assert.equal(deployment?.versions?.length, 1, 'Listening active Worker is unavailable or split');
    const versionId = deployment.versions[0].version_id;
    const version = await cf(`${script}/versions/${versionId}`), settings = await cf(`${script}/settings`);
    const sortBindings = values => values.map(value => value.type === 'secret_text' ? { name: value.name, type: value.type } : value).sort((a, b) => a.name.localeCompare(b.name));
    settings.bindings = sortBindings(settings.bindings);
    const modules = [];
    for (const [part, value] of await cf(script, true)) {
      const moduleName = typeof value === 'string' ? part : value.name;
      assert(/\.(m?js)$/.test(moduleName), 'Listening module type changed');
      modules.push({ name: moduleName, sha256: hash(typeof value === 'string' ? value : Buffer.from(await value.arrayBuffer())) });
    }
    workers[name] = { versionId, deployment, deploymentAfter: (await cf(`${script}/deployments`)).deployments[0],
      settings, bindings: sortBindings(version.resources.bindings), runtime: version.resources.script_runtime,
      handlers: version.resources.script.handlers, namedHandlers: version.resources.script.named_handlers ?? [],
      schedules: (await cf(`${script}/schedules`)).schedules.map(item => item.cron).sort(),
      subdomain: await cf(`${script}/subdomain`), modules: modules.sort((a, b) => a.name.localeCompare(b.name)) };
  }
  const zones = (await cf(`/zones?account.id=${accountId}&per_page=50`)).map(zone => zone.id).sort();
  assert.deepEqual(zones, ['1aae6fb9889672cf695927eb575a5bbe'], 'Listening zone inventory changed');
  const common = { accountSubdomain: await cf(`${account}/workers/subdomain`), domains: await cf(`${account}/workers/domains`), zones,
    routes: await cf('/zones/1aae6fb9889672cf695927eb575a5bbe/workers/routes') };
  const worktrees = command('git', ['worktree', 'list', '--porcelain'], cwd).split(/\r?\n/).filter(line => line.startsWith('worktree ')).map(line => line.slice(9));
  const firebaseCli = worktrees.map(root => path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js')).find(existsSync);
  assert(firebaseCli, 'Repository-owned Firebase CLI unavailable');
  const functions = JSON.parse(command(process.execPath, [firebaseCli, 'functions:list', '--project', 'temp-a1437', '--json', '--non-interactive'], cwd));
  assert.equal(functions.status, 'success', 'Listening Firebase Functions inventory unavailable');
  return { workers, common, functions: functions.result,
    rulesSha256: digest(await get(`${database}/.settings/rules.json`, googleToken)),
    writesEnabled: await get(`${database}/system_flags/listening_authoring_writes_enabled.json`, googleToken),
    restore: await get(`${database}/system_flags/restore_in_progress.json`, googleToken) };
}

export async function observeListeningRelease(options) {
  const local = await readCandidate(options), provider = await readListeningProvider(options.cwd);
  validateListeningEvidence(local, provider, options.phase);
  assert.deepEqual(await readListeningProvider(options.cwd), provider, 'Listening provider changed during observation');
  assert.deepEqual(await readCandidate(options), local, 'Listening local inputs changed during observation');
  const observation = { service: 'listening-release', source: local.source, phase: options.phase, local, provider,
    observedAt: new Date().toISOString(), fingerprint: digest({ local, provider, phase: options.phase }), readOnly: true,
    sourceKnown: false, provenance: 'Exact reviewed candidate artifacts and independently observed provider modules/configuration; historical live Git provenance is unknown.' };
  deepFreeze(observation);
  observations.add(observation);
  return observation;
}
