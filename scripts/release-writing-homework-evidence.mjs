import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { reviewedWritingHomeworkRelease as pins } from './release-writing-homework-pins.mjs';

const account = '/accounts/e41db829dabe9993f03674afdfd56510';
const commandName = 'luyentap-notification-command';
const publicName = 'luyentap-notification-firestore-qa';
const bundlePath = 'cloudflare/notification-release/notification-command-active.mjs';
const entryPath = 'cloudflare/notification-release/notification-command-entry.js';
const configPath = 'documentation/release-audits/notification-writing-homework-release.wrangler.json';
const observations = new WeakSet();
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert(result.status === 0, 'Cannot inspect Writing Homework candidate Git state');
  return result.stdout.trim();
};

export function normalizeWritingHomeworkOutsideTarget(text) {
  for (const [start, end] of [
    ['async function verifyHomeworkResultAuthority(input) {', '\nvar ID2, record, timestamp'],
    ['    createNotificationFirestoreBridge = /* @__PURE__ */ __name((fetcher = fetch) => ({', '    }), "createNotificationFirestoreBridge");'],
  ]) {
    const first = text.indexOf(start), last = text.indexOf(end, first + start.length);
    assert(first >= 0 && last > first && text.indexOf(start, first + start.length) === -1, 'Writing Homework artifact delimiters changed');
    text = text.slice(0, first) + 'REVIEWED_WRITING_HOMEWORK_FUNCTION\n' + text.slice(last);
  }
  return text;
}

export const isWritingHomeworkObserved = value => observations.has(value);

export function validateWritingHomeworkEvidence(local, provider, phase, expected = pins) {
  assert(['predeploy', 'postdeploy'].includes(phase), 'Unknown Writing Homework observation phase');
  assert.equal(local.source.revision, expected.revision, 'Writing Homework source revision changed');
  assert.equal(local.source.tree, expected.tree, 'Writing Homework source tree changed');
  assert.equal(local.source.baseRevision, expected.baseRevision, 'Writing Homework reviewed base changed');
  assert.equal(local.source.dirty, false, 'Writing Homework candidate must be clean');
  assert.deepEqual(local.source.files, expected.files, 'Writing Homework source scope changed');
  assert.equal(local.bundleSha256, expected.bundleSha256, 'Writing Homework artifact changed');
  assert.equal(local.entrySha256, expected.entrySha256, 'Notification entry module changed');
  assert.equal(local.configSha256, expected.configSha256, 'Writing Homework configuration changed');
  assert.equal(local.outsideTargetSha256, expected.outsideTargetSha256, 'Code outside the reviewed authority functions changed');
  const wanted = structuredClone(expected.provider);
  if (phase === 'postdeploy') {
    wanted.command.versionId = provider.command.versionId;
    assert(provider.command.versionId !== expected.provider.command.versionId, 'New Writing Homework version is not active');
    wanted.command.modules['notification-command-active.mjs'] = expected.bundleSha256;
    const bindings = wanted.command.settings.bindings.filter(item => item.type !== 'plain_text');
    bindings.push(...Object.entries(local.deployment.vars).map(([name, text]) => ({ name, type: 'plain_text', text })));
    wanted.command.settings.bindings = bindings.sort((a, b) => a.name.localeCompare(b.name));
  }
  assert.deepEqual(provider, wanted, 'Writing Homework provider code, settings, rules or public adapter drifted');
  assert.equal(provider.command.outsideTargetSha256, local.outsideTargetSha256, 'Live code outside authority functions changed');
  assert.equal(local.deployment.name, commandName);
  assert.equal(local.deployment.account_id, account.slice('/accounts/'.length));
  assert.equal(local.deployment.no_bundle, true);
  assert.equal(local.deployment.minify, false);
  assert.equal(local.deployment.keep_vars, false);
  assert.equal(local.deployment.vars.HOMEWORK_RESULT_AUTHORITY_ENABLED, 'true');
  assert.equal(local.deployment.vars.RESULT_NOTIFICATION_AUTHORITY_RULESET_NAME, provider.firestore.rulesetName);
  assert.equal(local.deployment.vars.RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF, '2026-10-02T02:22:09.862Z');
}

// Native provider GETs only: no supplied JSON, caller fetch implementation or alternate service.
export async function readWritingHomeworkProvider() {
  const authRoot = process.platform === 'win32' ? path.join(process.env.APPDATA, 'xdg.config')
    : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const credentials = await readFile(path.join(authRoot, '.wrangler/config/default.toml'), 'utf8');
  const token = credentials.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/mu)?.[1];
  assert(token, 'Cloudflare operator session unavailable');
  async function get(route, multipart = false) {
    const response = await fetch(`https://api.cloudflare.com/client/v4${route}`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    assert(response.ok, `Writing Homework Cloudflare readback failed: ${response.status}`);
    if (multipart) return response.formData();
    const data = await response.json();
    assert(data.success && (route.endsWith('/deployments') || !(data.result_info?.total_pages > 1)), 'Cloudflare provider result requires review');
    return data.result;
  }
  async function worker(name) {
    const root = `${account}/workers/scripts/${name}`;
    const deployments = (await get(`${root}/deployments`)).deployments;
    assert(deployments[0].versions.length === 1 && deployments[0].versions[0].percentage === 100, 'Worker traffic must be one full version');
    const settings = await get(`${root}/settings`);
    delete settings.annotations;
    settings.bindings = settings.bindings.map(item => {
      if (item.type === 'secret_text') return { name: item.name, type: item.type };
      assert(['plain_text', 'durable_object_namespace', 'ratelimit'].includes(item.type), 'Unreviewed Worker binding');
      return item;
    }).sort((a, b) => a.name.localeCompare(b.name));
    const modules = {};
    let outsideTargetSha256;
    for (const [part, value] of await get(root, true)) {
      const name = typeof value === 'string' ? part : value.name;
      const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(await value.arrayBuffer());
      modules[name] = hash(bytes);
      if (name === 'notification-command-active.mjs') outsideTargetSha256 = hash(normalizeWritingHomeworkOutsideTarget(bytes.toString('utf8')));
    }
    assert.deepEqual((await get(`${root}/deployments`)).deployments[0], deployments[0], 'Worker changed during provider readback');
    return { versionId: deployments[0].versions[0].version_id, settings, modules,
      ...(outsideTargetSha256 ? { outsideTargetSha256 } : {}), schedules: await get(`${root}/schedules`), subdomain: await get(`${root}/subdomain`) };
  }
  const require = createRequire(import.meta.url);
  const auth = require('../node_modules/firebase-tools/lib/auth.js');
  const accountIdentity = auth.getGlobalDefaultAccount();
  assert.equal(accountIdentity?.user.email, 'iamhuwng@gmail.com', 'Unexpected Firebase operator');
  const google = await auth.getAccessToken(accountIdentity.tokens.refresh_token,
    ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']);
  const command = process.env.LUYENTAP_RELEASE_GOOGLE_TOKEN ? null : spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'gcloud auth print-access-token --account=iamhuwng@gmail.com --project=temp-a1437 --quiet'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  const databaseToken = process.env.LUYENTAP_RELEASE_GOOGLE_TOKEN || (command.status === 0 && command.stdout.trim());
  assert(databaseToken, 'Google database operator session unavailable');
  async function googleGet(url, database = false) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${database ? databaseToken : google.access_token}` },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    assert(response.ok, `Writing Homework Firebase readback failed: ${response.status}`);
    return response.json();
  }
  const rules = await googleGet('https://temp-a1437-default-rtdb.firebaseio.com/.settings/rules.json', true);
  const release = await googleGet('https://firebaserules.googleapis.com/v1/projects/temp-a1437/releases/cloud.firestore');
  const firestore = await googleGet(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  return { command: await worker(commandName), public: await worker(publicName), rtdbRulesSha256: hash(canonical(rules)),
    firestore: { rulesetName: release.rulesetName, sourceSha256: hash(canonical(firestore.source)) },
    domains: await get(`${account}/workers/domains`), routes: await get('/zones/1aae6fb9889672cf695927eb575a5bbe/workers/routes') };
}

export async function observeWritingHomework({ cwd, source, phase }) {
  const local = { source,
    bundleSha256: hash(await readFile(path.join(cwd, bundlePath))), entrySha256: hash(await readFile(path.join(cwd, entryPath))),
    configSha256: hash(await readFile(path.join(cwd, configPath))),
    outsideTargetSha256: hash(normalizeWritingHomeworkOutsideTarget(await readFile(path.join(cwd, bundlePath), 'utf8'))),
    deployment: JSON.parse(await readFile(path.join(cwd, configPath), 'utf8')) };
  validateWritingHomeworkEvidence(local, pins.provider, 'predeploy');
  const provider = await readWritingHomeworkProvider();
  validateWritingHomeworkEvidence(local, provider, phase);
  assert.deepEqual(await readWritingHomeworkProvider(), provider, 'Provider changed between independent readbacks');
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), source.revision);
  assert.equal(git(cwd, 'status', '--porcelain=v1', '--untracked-files=all'), '', 'Candidate became dirty');
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const observation = freeze({ service: 'worker', scope: 'isolated-writing-homework', phase,
    identity: `${account}/${commandName}`, source, candidate: local, provider,
    observedAt: new Date().toISOString(), fingerprint: hash(canonical({ local, provider, phase })), readOnly: true });
  observations.add(observation);
  return observation;
}
