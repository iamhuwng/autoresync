import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { assertHomeworkWorkerSource, isHomeworkWorkerObserved, normalizeHomeworkOutsideTarget, observeHomeworkWorker, validateHomeworkWorkerEvidence } from '../release-homework-worker-evidence.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const source = { revision: '99bb3f073319c57f62b0889d7c0a98b054e06e95', tree: '6cebb25691f322fd811c0ab5dd6ccf113e71dfe5', baseRevision: '422b7323f85a5b235d387cd18b25a1b9f63df46a', dirty: false };
const normalizedSha = 'ff00c8cd6e85798880f2e2542c43174e7ef9f4d84ff098562df1600b57d9c7e1';
const local = { source, candidate: { sha256: '6e4bb95e53191b1a32e361e044765c4d6da7d39764d0e904abcf8ddd82e4f7ed', configSha256: 'b699855244b5004f0f45316b6efb0cf487dc7a86fb68f14a5cf0aa4cec580983' }, sourceConfigSha256: '48b097a0a77dcf86d9a41062e520fc3896c7963891dad9159d8700742ad829b9', outsideTargetSha256: normalizedSha };
const bindings = [
  ...Object.entries({ ADMIN_UID: 'ADMIN_UID', BACKUP_RETENTION_COUNT: '10', FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com', FIREBASE_PROJECT_ID: 'temp-a1437', MEDIA_CHECKPOINT_INTERVAL: '6' }).map(([name, value]) => ({ name, type: 'plain_text', valueSha256: hash(value) })),
  ...['BACKUP_R2_ACCESS_KEY_ID', 'BACKUP_R2_BUCKET_NAME', 'BACKUP_R2_ENDPOINT', 'BACKUP_R2_SECRET_ACCESS_KEY', 'GOOGLE_SA_KEY'].map(name => ({ name, type: 'secret_text' })),
  { name: 'PRIMARY_R2', type: 'r2_bucket', bucket_name: 'kahoot-media' },
].sort((a, b) => a.name.localeCompare(b.name));
const versionId = 'f37869c0-c597-41cc-893b-7f7652d80e41';
const deployment = { id: 'reviewed-deployment', versions: [{ version_id: versionId, percentage: 100 }] };
const provider = { versionId, deployment, deploymentAfter: structuredClone(deployment), moduleName: 'reading-release-candidate.mjs', sha256: 'c789454458790c5fb0893952043a150b34cefa345c5b02b06c1f04edddad112b', outsideTargetSha256: normalizedSha, bindings, effectiveBindings: structuredClone(bindings),
  settings: { placement: {}, compatibility_date: '2024-01-01', compatibility_flags: [], usage_model: 'standard', tags: [], tail_consumers: [], logpush: false, annotations: { 'workers/triggered_by': 'version_upload' } },
  script: { etag: 'bb7b7c749c706ce95e7cc440606740590aaac8c60d73622cf3ac6921705c9295', handlers: ['fetch', 'scheduled'], last_deployed_from: 'wrangler' },
  schedules: { schedules: [{ cron: '0 3 * * 1' }] }, subdomain: { enabled: true, previews_enabled: true }, accountSubdomain: { subdomain: 'iamhuwng' }, domains: [], zones: ['1aae6fb9889672cf695927eb575a5bbe'], routes: [] };

test('reviewed source and baseline validate without becoming a trusted observation', () => {
  assertHomeworkWorkerSource(source);
  validateHomeworkWorkerEvidence(local, provider);
  assert.equal(isHomeworkWorkerObserved(provider), false);
  assert.equal(isHomeworkWorkerObserved(JSON.parse(JSON.stringify({ ...provider, readOnly: true }))), false);
});

test('changed source, artifact, live code and effective configuration fail closed', async t => {
  const mutations = [
    ['source revision', a => { a.source.revision = 'different'; }, /revision changed/],
    ['reviewed base', a => { a.source.baseRevision = 'different'; }, /reviewed base changed/],
    ['dirty candidate', a => { a.source.dirty = true; }, /worktree is dirty/],
    ['source config', a => { a.sourceConfigSha256 = 'different'; }, /source config changed/],
    ['bundle', a => { a.candidate.sha256 = 'different'; }, /reviewed bundle changed/],
    ['deploy config', a => { a.candidate.configSha256 = 'different'; }, /deploy config changed/],
    ['outside target', (_, b) => { b.outsideTargetSha256 = 'different'; }, /outside-target code changed/],
    ['live code', (_, b) => { b.sha256 = 'different'; }, /live code changed/],
    ['version', (_, b) => { b.versionId = 'different'; }, /active version changed/],
    ['traffic split', (_, b) => { b.deployment.versions[0].percentage = 50; }, /traffic split changed/],
    ['deployment race', (_, b) => { b.deploymentAfter.id = 'different'; }, /during observation/],
    ['R2 binding', (_, b) => { b.bindings.find(item => item.type === 'r2_bucket').bucket_name = 'different'; }, /bindings or variables changed/],
    ['effective variable', (_, b) => { b.effectiveBindings[0].valueSha256 = 'different'; }, /effective bindings or variables changed/],
    ['settings', (_, b) => { b.settings.compatibility_date = '2026-01-01'; }, /settings changed/],
    ['schedule', (_, b) => { b.schedules.schedules[0].cron = '* * * * *'; }, /schedule changed/],
    ['workers.dev', (_, b) => { b.subdomain.enabled = false; }, /workers.dev or previews changed/],
    ['route', (_, b) => { b.routes.push({ pattern: '*example.invalid/*' }); }, /routes changed/],
  ];
  for (const [name, mutate, reason] of mutations) await t.test(name, () => {
    const a = structuredClone(local), b = structuredClone(provider);
    mutate(a, b);
    assert.throws(() => validateHomeworkWorkerEvidence(a, b), reason);
  });
});

test('normalization allows only the target replacement and exact declaration move', () => {
  const block = ['// ../functions/src/readingV2SubmitCore.ts', 'var READING_V2_ENGINE = 1;', ...Array.from({ length: 95 }, (_, index) => `var declaration${index} = ${index};`), 'var getMaterialIdFromRequest = x;'].join('\n') + '\n';
  const target = body => `async function resolveTarget() { ${body} }\n__name(resolveTarget, "resolveTarget");\n`;
  const before = `// first\n${block}${target('old()')}// end\n`;
  const after = `// first\n${target('reviewed()')}${block}// end\n`;
  assert.equal(normalizeHomeworkOutsideTarget(before), normalizeHomeworkOutsideTarget(after));
  assert.notEqual(normalizeHomeworkOutsideTarget(before), normalizeHomeworkOutsideTarget(after.replace('declaration0 = 0', 'declaration0 = 1')));
  assert.throws(() => normalizeHomeworkOutsideTarget(before.replace('var READING_V2_ENGINE', 'var extra = 1;\nvar READING_V2_ENGINE')), /declaration block changed/);
  assert.throws(() => normalizeHomeworkOutsideTarget(before.replace('var declaration0', 'var extra = 1;\nvar declaration0')), /exactly 98 lines/);
});

test('observer requires real local artifacts before contacting the provider', async () => {
  let requests = 0;
  await assert.rejects(() => observeHomeworkWorker({ fetchImpl: async () => { requests += 1; } }), /paths are required/);
  assert.equal(requests, 0);
});
