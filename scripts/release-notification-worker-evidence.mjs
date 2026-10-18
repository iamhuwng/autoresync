import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const accountId = 'e41db829dabe9993f03674afdfd56510';
const account = `/accounts/${accountId}`;
const commandName = 'luyentap-notification-command';
const publicName = 'luyentap-notification-firestore-qa';
const activePath = 'cloudflare/notification-release/notification-command-active.mjs';
const entryPath = 'cloudflare/notification-release/notification-command-entry.js';
const configPath = 'tmp/notification-qa-release.wrangler.json';
const observations = new WeakSet();
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

// Filled only after independent review of the exact clean product candidate.
export const reviewedNotificationRelease = Object.freeze({
  revision: '3b682ffa371fc549486d72c4d3125f3c8651a124',
  tree: '4f0b28d08d19d1c331bca037e437e80a95d5091f',
  files: Object.freeze([
    'cloudflare/homework-notification.ts',
    'cloudflare/notification-firestore-bridge.ts',
    'cloudflare/notification-release/notification-command-active.mjs',
    'cloudflare/test/homework-notification.test.ts',
    'cloudflare/test/notification-firestore-bridge.test.ts',
    'cloudflare/test/notification-release-homework.test.ts',
    'cloudflare/vitest.notifications.config.mjs',
    'database.rules.json',
    'documentation/release-audits/2026-10-18-homework-production-qa.md',
    'documentation/release-audits/2026-10-18-homework-worker-release.md',
    'documentation/system/maintenance-baseline-20261017.md',
    'src/__tests__/security/student-private-thcs-homework-current-rules.emulator.test.ts',
    'vitest.security-emulator.config.ts',
  ]),
  baseRevision: 'e04022e4564a530e44cd951551bf49dead63118a',
  activeSha256: '9734197c765b06de9d746e68fea9a4912780447e05ddb12057e1ac3c6e2f9ed7',
  configSha256: 'bd4391b72d20c696b55f625888d0fadea100e1703cc14921cb7b0989f7aaaafa',
  outsideTargetSha256: 'd08ff8f2acda3d4d7b7c8ec4fd5d3ae43ee0ad308df526a8aaa30f8892d909e2',
  rulesSha256: '29ca193601d36d8e99e714bd11c53fb31aea764338e87f4dd639c39b06b55e1f',
  baseRulesSha256: '37b717fc3d12c8e1c5803653489d60e21a74b90df96a6386383d33b68bd16a6d',
  providerSha256: 'f0472a0e467e093328a4061fa48b047d7c1427518aefc48d3be85a27d26db349',
  baseReadSha256: 'a7e547de5ccb3162fb91b1c3865b30e2316e08364c357edbc550c4356311d3fb',
  entrySha256: '72a358e0f7313fd37e89f7bf1d85cd1337c199192dc6c297881bf1b71258d270',
});

export const isNotificationWorkerObserved = value => observations.has(value);

export function assertNotificationWorkerSource(source, pins = reviewedNotificationRelease) {
  assert(/^[a-f0-9]{40}$/.test(pins.revision || '') && /^[a-f0-9]{40}$/.test(pins.tree || '') && Array.isArray(pins.files), 'Notification release candidate pins are not reviewed');
  assert.equal(source.revision, pins.revision, 'Notification candidate revision changed');
  assert.equal(source.tree, pins.tree, 'Notification candidate tree changed');
  assert.equal(source.baseRevision, pins.baseRevision, 'Notification reviewed base changed');
  assert.equal(source.dirty, false, 'Notification candidate worktree is dirty');
  assert.deepEqual(source.files, pins.files, 'Notification reviewed changed-file list changed');
}

// These two exact function regions contain the reviewed Homework changes.
export function normalizeNotificationOutsideTarget(raw) {
  let text = raw;
  for (const [start, end] of [
    ['async function deliverHomeworkNotice(input) {', '\nvar ID, row, deny, time, HOMEWORK_KINDS;'],
    ['    createNotificationFirestoreBridge = /* @__PURE__ */ __name((fetcher = fetch) => ({', '    }), "createNotificationFirestoreBridge");'],
  ]) {
    const first = text.indexOf(start), last = text.indexOf(end, first + start.length);
    assert(first >= 0 && last > first && text.indexOf(start, first + start.length) === -1, 'Notification target delimiters changed');
    text = text.slice(0, first) + 'REVIEWED_HOMEWORK_FUNCTION\n' + text.slice(last);
  }
  return text;
}

export function validateNotificationWorkerEvidence(local, provider, pins = reviewedNotificationRelease) {
  assertNotificationWorkerSource(local.source, pins);
  for (const key of ['activeSha256', 'configSha256', 'outsideTargetSha256', 'rulesSha256', 'baseRulesSha256', 'providerSha256']) assert(/^[a-f0-9]{64}$/.test(pins[key] || ''), `Notification ${key} is not reviewed`);
  for (const key of ['activeSha256', 'configSha256', 'outsideTargetSha256', 'rulesSha256', 'baseRulesSha256', 'entrySha256']) assert.equal(local[key], pins[key], `Notification candidate ${key} changed`);
  assert.equal(hash(local.baseRules.rules.test_results.$resultId['.read']), pins.baseReadSha256, 'Notification base result read rule changed');
  const remaining = structuredClone(local.rules);
  assert.notEqual(remaining.rules.test_results.$resultId['.read'], local.baseRules.rules.test_results.$resultId['.read'], 'Notification result read rule was not changed');
  remaining.rules.test_results.$resultId['.read'] = local.baseRules.rules.test_results.$resultId['.read'];
  assert.equal(canonical(remaining), canonical(local.baseRules), 'Notification rules changed outside the result read branch');
  assert.equal(provider.rules.treeSha256, pins.baseRulesSha256, 'Notification live RTDB rules changed');
  assert.equal(hash(canonical(provider)), pins.providerSha256, 'Notification current provider configuration or code changed');
  const command = provider.workers.find(worker => worker.name === commandName);
  assert.equal(command.modules.find(module => module.name === 'notification-command-active.mjs').outsideTargetSha256, local.outsideTargetSha256, 'Notification live outside-target code changed');
  const config = local.deployment, settings = command.settings;
  assert.deepEqual(config.vars, Object.fromEntries(settings.bindings.filter(binding => binding.type === 'plain_text').map(binding => [binding.name, binding.text])), 'Notification deploy variables differ from live settings');
  assert.deepEqual([...config.secrets.required].sort(), settings.bindings.filter(binding => binding.type === 'secret_text').map(binding => binding.name).sort(), 'Notification deploy secret names differ from live settings');
  assert.deepEqual(config.durable_objects.bindings, settings.bindings.filter(binding => binding.type === 'durable_object_namespace').map(({ name, class_name, script_name }) => ({ name, class_name, ...(script_name ? { script_name } : {}) })), 'Notification deploy Durable Object binding changed');
  assert.deepEqual(config.ratelimits, settings.bindings.filter(binding => binding.type === 'ratelimit').map(({ name, namespace_id, simple }) => ({ name, namespace_id, simple })), 'Notification deploy rate limiter changed');
  assert.equal(config.compatibility_date, settings.compatibility_date, 'Notification deploy compatibility date changed');
  assert.deepEqual(config.compatibility_flags, settings.compatibility_flags, 'Notification deploy compatibility flags changed');
  assert.deepEqual(config.triggers.crons, command.schedules.schedules.map(item => item.cron), 'Notification deploy schedules changed');
  assert.equal(config.workers_dev, command.subdomain.enabled, 'Notification deploy workers.dev changed');
  assert.equal(config.preview_urls, command.subdomain.previews_enabled, 'Notification deploy previews changed');
  assert.equal(config.keep_vars, true, 'Notification deploy must preserve existing variables');
  assert.deepEqual(config.migrations, [{ tag: command.runtime.migration_tag, new_sqlite_classes: ['NotificationBridgeObject'] }], 'Notification existing Durable Object migration changed');
  const observability = { ...settings.observability };
  assert.equal(observability.redact_query_string, false, 'Notification query-string logging setting changed');
  delete observability.redact_query_string;
  assert.deepEqual(config.observability, observability, 'Notification deploy observability changed');
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  // Never include command output: authentication failures can contain credentials.
  assert(!result.error && result.status === 0, `Notification read-only command failed: ${command} ${args[0] || ''}`);
  return result.stdout.trim();
}

function gcloud(args) {
  return process.platform === 'win32'
    ? run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `& gcloud ${args.map(arg => `'${arg}'`).join(' ')}`])
    : run('gcloud', args);
}

async function readCandidate(cwd, bundle, config) {
  assert.equal(bundle, path.resolve(cwd, activePath), 'Notification bundle must be the retained active module');
  assert.equal(config, path.resolve(cwd, configPath), 'Notification deploy configuration path changed');
  const git = (...args) => run('git', args, cwd);
  const source = {
    revision: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), baseRevision: git('rev-parse', '--verify', `${reviewedNotificationRelease.baseRevision}^{commit}`),
    dirty: Boolean(git('status', '--porcelain=v1', '--untracked-files=all')),
    files: git('diff-tree', '--no-commit-id', '--name-only', '-r', reviewedNotificationRelease.baseRevision, 'HEAD').split(/\r?\n/).filter(Boolean).sort(),
  };
  assertNotificationWorkerSource(source);
  const [active, entry, configBytes, rulesBytes] = await Promise.all([readFile(bundle), readFile(path.resolve(cwd, entryPath)), readFile(config), readFile(path.resolve(cwd, 'database.rules.json'))]);
  const deployment = JSON.parse(configBytes);
  assert.equal(deployment.name, commandName, 'Notification deploy service changed');
  assert.equal(deployment.account_id, accountId, 'Notification deploy account changed');
  assert.equal(path.resolve(path.dirname(config), deployment.main), path.resolve(cwd, entryPath), 'Notification deploy entry changed');
  assert.equal(deployment.no_bundle, true, 'Notification deploy must retain the reviewed modules');
  assert.equal(deployment.minify, false, 'Notification deploy must not minify');
  assert.equal(deployment.find_additional_modules, true, 'Notification additional module discovery changed');
  assert.equal(path.resolve(path.dirname(config), deployment.base_dir), path.dirname(bundle), 'Notification module directory changed');
  assert.deepEqual(deployment.rules, [{ fallthrough: true, globs: ['notification-command-active.mjs'], type: 'ESModule' }], 'Notification deploy module inventory changed');
  const baseRules = JSON.parse(git('show', `${reviewedNotificationRelease.baseRevision}:database.rules.json`));
  return { source, activeSha256: hash(active), entrySha256: hash(entry), configSha256: hash(configBytes), outsideTargetSha256: hash(normalizeNotificationOutsideTarget(active.toString('utf8'))), rulesSha256: hash(rulesBytes), baseRulesSha256: hash(canonical(baseRules)), rules: JSON.parse(rulesBytes), baseRules, deployment };
}

function sanitizeBindings(bindings) {
  assert(Array.isArray(bindings), 'Notification provider bindings unavailable');
  return bindings.map(binding => {
    if (binding.type === 'secret_text') return { name: binding.name, type: binding.type };
    assert(['plain_text', 'durable_object_namespace', 'ratelimit'].includes(binding.type), 'Notification unreviewed binding type');
    return binding;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// This collector has fixed native GETs and no caller transport/evidence inputs.
// Its return value is untrusted until observeNotificationWorker validates it.
export async function readNotificationProvider() {
  const authRoot = process.platform === 'win32' ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'xdg.config') : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const credentials = await readFile(path.join(authRoot, '.wrangler', 'config', 'default.toml'), 'utf8');
  const token = credentials.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/mu)?.[1];
  assert(token, 'Existing Cloudflare OAuth session unavailable');
  const auth = JSON.parse(gcloud(['auth', 'list', '--format=json']));
  assert.deepEqual(auth.filter(item => item.status === 'ACTIVE').map(item => item.account), ['iamhuwng@gmail.com'], 'Notification Google active account changed');
  assert.equal(gcloud(['config', 'get-value', 'project']), 'temp-a1437', 'Notification Google project changed');
  const googleToken = gcloud(['auth', 'print-access-token', '--account=iamhuwng@gmail.com', '--project=temp-a1437']);
  assert(googleToken, 'Existing Google authentication unavailable');
  async function get(route, multipart = false) {
    const url = `https://api.cloudflare.com/client/v4${route}`;
    const response = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    assert(response.ok && (!response.url || response.url === url), `Notification provider GET failed or redirected: ${response.status}`);
    if (multipart) return response.formData();
    const data = await response.json();
    assert(data.success, 'Notification provider GET unsuccessful');
    if (!route.endsWith('/deployments') && data.result_info?.total_pages) assert(data.result_info.total_pages <= 1, 'Notification provider pagination requires review');
    return data.result;
  }
  const workers = [];
  for (const [name, versionId, expectedModules] of [
    [commandName, '541166ae-93db-4d92-8eda-5fb291325b42', ['notification-command-active.mjs', 'notification-command-entry.js']],
    [publicName, '5696e963-c5ed-463d-a495-30db3c07bc98', ['notification-firestore-do.js']],
  ]) {
    const script = `${account}/workers/scripts/${name}`;
    const deployment = (await get(`${script}/deployments`)).deployments[0];
    assert.deepEqual(deployment.versions, [{ version_id: versionId, percentage: 100 }], `Notification ${name} active version or traffic changed`);
    const version = await get(`${script}/versions/${versionId}`);
    const settings = await get(`${script}/settings`);
    settings.bindings = sanitizeBindings(settings.bindings);
    const modules = [];
    for (const [part, value] of await get(script, true)) {
      const moduleName = typeof value === 'string' ? part : value.name;
      assert(expectedModules.includes(moduleName), 'Notification unexpected live module');
      const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(await value.arrayBuffer());
      modules.push({ name: moduleName, sha256: hash(bytes), ...(moduleName === 'notification-command-active.mjs' ? { outsideTargetSha256: hash(normalizeNotificationOutsideTarget(bytes.toString('utf8'))) } : {}) });
    }
    modules.sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(modules.map(module => module.name), expectedModules.sort(), 'Notification live module inventory changed');
    const schedules = await get(`${script}/schedules`), subdomain = await get(`${script}/subdomain`);
    const deploymentAfter = (await get(`${script}/deployments`)).deployments[0];
    assert.deepEqual(deploymentAfter, deployment, 'Notification deployment changed during observation');
    workers.push({ name, deployment, script: version.resources.script, runtime: version.resources.script_runtime, bindings: sanitizeBindings(version.resources.bindings), settings, modules, schedules, subdomain });
  }
  const accountSubdomain = await get(`${account}/workers/subdomain`), domains = await get(`${account}/workers/domains`);
  const zones = (await get(`/zones?account.id=${accountId}&per_page=50`)).map(zone => zone.id).sort();
  assert.deepEqual(zones, ['1aae6fb9889672cf695927eb575a5bbe'], 'Notification zone inventory changed');
  const routes = await get('/zones/1aae6fb9889672cf695927eb575a5bbe/workers/routes');
  const url = 'https://temp-a1437-default-rtdb.firebaseio.com/.settings/rules.json';
  const response = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${googleToken}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  assert(response.ok && (!response.url || response.url === url), `Notification RTDB rules GET failed or redirected: ${response.status}`);
  const rawRules = await response.text(), rules = JSON.parse(rawRules);
  assert(rules.rules && typeof rules.rules === 'object', 'Notification RTDB rule tree unavailable');
  return { workers, accountSubdomain, domains, zones, routes, rules: { identity: 'temp-a1437/temp-a1437-default-rtdb', sha256: hash(rawRules), treeSha256: hash(canonical(rules)), readSha256: hash(rules.rules.test_results.$resultId['.read']) } };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export async function observeNotificationWorker({ cwd, bundlePath, configPath: selectedConfig } = {}) {
  assert(cwd && bundlePath && selectedConfig, 'Notification cwd, bundle and deploy config paths are required');
  cwd = path.resolve(cwd);
  const bundle = path.resolve(cwd, bundlePath), config = path.resolve(cwd, selectedConfig);
  const local = await readCandidate(cwd, bundle, config);
  const provider = await readNotificationProvider();
  validateNotificationWorkerEvidence(local, provider);
  assert.deepEqual(await readNotificationProvider(), provider, 'Notification Cloudflare or RTDB state changed during observation');
  assert.deepEqual(await readCandidate(cwd, bundle, config), local, 'Notification local inputs changed during observation');
  const observation = deepFreeze({ service: 'worker+firebase-rules', scope: 'isolated-notification-homework-qa', identity: `${accountId}/${commandName}+temp-a1437/database`, source: local.source, candidate: { bundlePath: bundle, configPath: config, ...Object.fromEntries(Object.entries(local).filter(([key]) => key.endsWith('Sha256'))) }, provider, observedAt: new Date().toISOString(), fingerprint: hash(canonical({ local, provider })), readOnly: true, sourceKnown: false, provenance: 'Exact reviewed candidate and live module/configuration/rules fingerprints; historical deployed Git source is unknown.' });
  observations.add(observation);
  return observation;
}
