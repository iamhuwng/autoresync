import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { assess } from '../release-check.mjs';
import {
  assertReadingV2WorkerSource,
  isReadingV2WorkerObserved,
  observeReadingV2Worker,
  reviewedReadingV2WorkerRelease as pins,
  validateReadingV2WorkerEvidence,
} from '../release-reading-v2-worker-evidence.mjs';

const source = () => ({ revision: pins.revision, tree: pins.tree, baseRevision: pins.baseRevision, dirty: false, files: [...pins.sourceFiles] });
const local = () => ({
  source: source(),
  sourceConfigSha256: pins.sourceConfigSha256,
  bundleSha256: pins.bundleSha256,
  deployConfigSha256: pins.deployConfigSha256,
  deployConfig: {
    main: pins.moduleName,
    name: 'r2-backup-worker',
    compatibility_date: '2024-01-01',
    triggers: { crons: ['0 3 * * 1'] },
    r2_buckets: [{ binding: 'PRIMARY_R2', bucket_name: 'kahoot-media' }],
    vars: {
      ADMIN_UID: 'ADMIN_UID', BACKUP_RETENTION_COUNT: '10',
      FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com',
      FIREBASE_PROJECT_ID: 'temp-a1437', MEDIA_CHECKPOINT_INTERVAL: '6',
    },
  },
});
const hash = value => createHash('sha256').update(value).digest('hex');
const provider = () => {
  const deployment = { versions: [{ version_id: pins.baselineVersionId, percentage: 100 }] };
  const bindings = [
    ...Object.entries(local().deployConfig.vars).map(([name, value]) => ({ name, type: 'plain_text', valueSha256: hash(value) })),
    ...['BACKUP_R2_ACCESS_KEY_ID', 'BACKUP_R2_BUCKET_NAME', 'BACKUP_R2_ENDPOINT', 'BACKUP_R2_SECRET_ACCESS_KEY', 'GOOGLE_SA_KEY'].map(name => ({ name, type: 'secret_text' })),
    { name: 'PRIMARY_R2', type: 'r2_bucket', bucket_name: 'kahoot-media' },
  ].sort((a, b) => a.name.localeCompare(b.name));
  return {
    versionId: pins.baselineVersionId, deployment, deploymentAfter: structuredClone(deployment),
    moduleName: pins.moduleName, sha256: pins.baselineBundleSha256, bindings, effectiveBindings: structuredClone(bindings),
    settings: { placement: {}, compatibility_date: '2024-01-01', compatibility_flags: [], usage_model: 'standard', tags: [], tail_consumers: [], logpush: false, annotations: { 'workers/message': 'Homework recipient canonicalization; isolated reviewed bundle', 'workers/triggered_by': 'version_upload' } },
    script: { handlers: ['fetch', 'scheduled'], last_deployed_from: 'wrangler' },
    schedules: { schedules: [{ cron: '0 3 * * 1' }] }, subdomain: { enabled: true, previews_enabled: true },
    accountSubdomain: { subdomain: 'iamhuwng' }, domains: [], zones: ['1aae6fb9889672cf695927eb575a5bbe'], routes: [],
  };
};

test('exact predeploy and new-version postdeploy validate; drift fails closed', () => {
  validateReadingV2WorkerEvidence(local(), provider(), 'predeploy');
  const deployed = provider();
  deployed.versionId = '12345678-1234-1234-1234-123456789abc';
  deployed.deployment.versions[0].version_id = deployed.versionId;
  deployed.deploymentAfter = structuredClone(deployed.deployment);
  deployed.sha256 = pins.bundleSha256;
  deployed.settings.annotations['workers/message'] = pins.message;
  validateReadingV2WorkerEvidence(local(), deployed, 'postdeploy');
  assert.equal(isReadingV2WorkerObserved(deployed), false);
  for (const mutate of [
    value => { value.sha256 = hash('other code'); },
    value => { value.effectiveBindings.pop(); },
    value => { value.deployment.versions[0].percentage = 50; },
    value => { value.settings.compatibility_date = '2026-01-01'; },
    value => { value.routes.push({ pattern: 'hocthem.net/*' }); },
    value => { value.schedules.schedules[0].cron = '* * * * *'; },
  ]) {
    const changed = provider();
    mutate(changed);
    assert.throws(() => validateReadingV2WorkerEvidence(local(), changed, 'predeploy'));
  }
});

test('Reading V2 Worker observation pins the clean Worker-only source and exact phase', async t => {
  assertReadingV2WorkerSource(source());
  for (const [name, mutate, reason] of [
    ['revision', value => { value.revision = 'c'.repeat(40); }, /revision changed/u],
    ['tree', value => { value.tree = 'c'.repeat(40); }, /tree changed/u],
    ['base', value => { value.baseRevision = 'c'.repeat(40); }, /base changed/u],
    ['dirty worktree', value => { value.dirty = true; }, /worktree is dirty/u],
    ['changed-file scope', value => { value.files.push('database.rules.json'); }, /source scope changed/u],
  ]) await t.test(name, () => {
    const candidate = source();
    mutate(candidate);
    assert.throws(() => assertReadingV2WorkerSource(candidate), reason);
  });
  assert.throws(() => validateReadingV2WorkerEvidence(local(), {}, 'deploying'), /phase is invalid/u);
  assert.equal(isReadingV2WorkerObserved({ readOnly: true, source: source() }), false);
});

test('Reading V2 Worker observer requires exact local artifacts before provider access', async () => {
  await assert.rejects(() => observeReadingV2Worker({ cwd: process.cwd() }), /bundle and deploy config paths are required/u);
});

test('shared release checker keeps the Reading V2 observer isolated', async () => {
  await assert.rejects(() => assess({ observeReadingV2Worker: true }), /requires --worker-bundle and --worker-config/u);
  await assert.rejects(() => assess({ observeReadingV2Worker: true, observeHomework: true }), /only one fixed Worker/u);
  await assert.rejects(() => assess({ observeReadingV2Worker: true, mode: 'hotfix' }), /cannot be combined/u);
  await assert.rejects(() => assess({ workerBundlePath: 'candidate.mjs' }), /--observe-reading-v2-worker/u);
});
