import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readNotificationWorkers, readWritingHomeworkRules } from './release-writing-homework-evidence.mjs';
import { entries } from './tooling-where.mjs';

const command = 'luyentap-notification-command';
const bundle = 'notification-command-active.mjs';
const entry = 'notification-command-entry.js';
const moduleDir = 'cloudflare/notification-release';
const config = 'documentation/release-audits/notification-writing-homework-release.wrangler.json';
const pins = {
  source: {
    revision: '977471487c042cd152967c90da99149cd83006cf',
    tree: '546c17d9f6e0ec5db1c16053763bfcbb17d2af2e',
    baseRevision: '69629ba3ecd5deff9b230be253866594cd030b23',
    dirty: false,
    files: [
      'cloudflare/homework-notification.ts',
      'cloudflare/notification-release/notification-command-active.mjs',
      'cloudflare/test/homework-notification.test.ts',
      'cloudflare/test/notification-release-homework.test.ts',
      'documentation/tasks/teacher-homework-notification-investigation-2026-11-19.md',
    ],
  },
  artifact: {
    bundleSha256: 'fc1ebdfddeb84b849c4393af050bf8bc082de04d1e4220f9a1f728022221146e',
    entrySha256: '72a358e0f7313fd37e89f7bf1d85cd1337c199192dc6c297881bf1b71258d270',
    configSha256: '593146eabea52d672fbb74da446d16241f3ed58b9f66232a6479ab5d801b3591',
  },
  priorVersion: '7f4edb63-4727-4d0c-9e46-ade6dd51a602',
  priorBundle: 'ff2f130d7d33d1b32f2cde3e6c9bd9bee833a03d6484b2fa031bf95970cf709c',
  workersSha256: 'c1404be52812515c4af865f0eef382479d7ece98cdbbd075335da460c312390d',
  rules: {
    rtdbRulesSha256: '98436fd7f6528718e9fc4cacd4da8b2226feb27dc8bc52b25e38cd06d6162223',
    firestore: {
      rulesetName: 'projects/temp-a1437/rulesets/fbd67e85-0ea9-4e86-a351-df53fb6ca796',
      sourceSha256: 'b02c642769937926ee4b879357a7d16fb2ca4665b382f935117dca93ec0fae82',
    },
  },
};
const observations = new WeakSet();
const sha256 = data => createHash('sha256').update(data).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

export const isTeacherHomeworkNotificationObserved = observation => observations.has(observation);

export function validateTeacherHomeworkNotificationProvider({ workers, rules }, vars, phase, expected = pins) {
  assert(['predeploy', 'postdeploy'].includes(phase), 'Unknown teacher homework notification phase');
  assert.deepEqual(rules, expected.rules, 'Production Firebase rules drifted');
  const liveVars = Object.fromEntries(workers.command.settings.bindings.filter(binding => binding.type === 'plain_text')
    .map(binding => [binding.name, binding.text]));
  assert.deepEqual(vars, liveVars, 'Candidate variables differ from production');
  const baseline = structuredClone(workers);
  if (phase === 'postdeploy') {
    assert.match(workers.command.versionId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u, 'Missing deployed Worker version');
    assert.notEqual(workers.command.versionId, expected.priorVersion, 'The prior Worker is still active');
    assert.equal(workers.command.modules[bundle], expected.artifact.bundleSha256, 'The active module differs from the candidate');
    baseline.command.versionId = expected.priorVersion;
    baseline.command.modules[bundle] = expected.priorBundle;
  }
  assert.equal(sha256(canonical(baseline)), expected.workersSha256, 'Production Worker versions, modules, bindings or routing drifted');
}

export async function observeTeacherHomeworkNotification({ cwd, source, phase }) {
  for (const [key, value] of Object.entries(pins.source)) {
    assert.deepEqual(source[key], value, `Teacher homework notification source differs in ${key}`);
  }
  const [bundleBytes, entryBytes, configBytes] = await Promise.all(
    [path.join(moduleDir, bundle), path.join(moduleDir, entry), config].map(file => readFile(path.join(cwd, file))),
  );
  const artifact = { bundleSha256: sha256(bundleBytes), entrySha256: sha256(entryBytes), configSha256: sha256(configBytes) };
  assert.deepEqual(artifact, pins.artifact, 'Teacher homework notification artifact differs from the reviewed bytes');
  const configuration = JSON.parse(configBytes.toString('utf8'));
  assert.equal(configuration.name, command);
  const wrangler = entries['cloudflare-wrangler'];
  const result = spawnSync(wrangler.command, [wrangler.path, 'auth', 'token', '--json'],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, 'Wrangler Cloudflare operator session unavailable');
  let token;
  try { ({ token } = JSON.parse(result.stdout)); }
  catch { throw new Error('Wrangler could not provide a Cloudflare bearer token'); }
  assert(typeof token === 'string' && token, 'Wrangler Cloudflare bearer token unavailable');

  async function readProvider() {
    const [workers, rules] = await Promise.all([
      readNotificationWorkers(token, { versionedModules: true }),
      readWritingHomeworkRules({ useFirebaseDatabaseToken: true }),
    ]);
    return { workers, rules };
  }
  const provider = await readProvider();
  validateTeacherHomeworkNotificationProvider(provider, configuration.vars, phase);
  assert.deepEqual(await readProvider(), provider, 'Provider state changed between notification readbacks');
  const observation = Object.freeze({ scope: 'isolated-teacher-homework-notification', phase, source, artifact, provider,
    observedAt: new Date().toISOString(), fingerprint: sha256(canonical({ source, artifact, provider, phase })), readOnly: true });
  observations.add(observation);
  return observation;
}
