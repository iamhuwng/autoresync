import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CLOUDFLARE_ACCOUNT_ID, PRODUCTION_WORKER_NAMES } from '../release-provider-readback.mjs';
import {
  WORKER_REGISTRY,
  assertCloudflareAccount,
  buildWorkerRollbackCommand,
  deployWorker,
  parseDeployWorkerArgs,
  parseUploadedVersionId,
} from '../deploy-worker.mjs';

const uuid = '11111111-1111-4111-8111-111111111111';
const priorUuid = '22222222-2222-4222-8222-222222222222';
const otherUuid = '33333333-3333-4333-8333-333333333333';
const result = (stdout = '') => ({ stdout, stderr: '' });
const whoamiJson = (id = CLOUDFLARE_ACCOUNT_ID) => JSON.stringify({ accounts: [{ id, name: 'LuyenTap' }] });

test('worker registry covers production workers and qualification service', () => {
  for (const name of PRODUCTION_WORKER_NAMES) assert(Object.hasOwn(WORKER_REGISTRY, name));
  assert(Object.hasOwn(WORKER_REGISTRY, 'luyentap-qualification-upload-signer'));
});

test('notification Worker config and smoke probe match the live entrypoint', async () => {
  const source = await readFile(new URL('../../cloudflare/wrangler.notifications.jsonc', import.meta.url), 'utf8');
  const config = JSON.parse(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
  const notification = WORKER_REGISTRY['luyentap-notification-command'];
  assert.equal(config.main, 'notification-release/notification-command-entry.js');
  assert.equal(config.vars.HOMEWORK_RESULT_AUTHORITY_ENABLED, 'true');
  assert.equal(config.vars.RESULT_NOTIFICATION_AUTHORITY_RULESET_NAME, 'projects/temp-a1437/rulesets/fbd67e85-0ea9-4e86-a351-df53fb6ca796');
  assert.equal(config.vars.RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF, '2026-10-02T02:22:09.862Z');
  assert.equal(config.keep_vars, false);
  assert.equal(config.minify, false);
  assert.equal(config.base_dir, 'notification-release');
  assert.deepEqual(config.rules[0].globs, ['notification-command-active.mjs']);
  assert.equal(notification.smokeProbe.url, 'https://luyentap-notification-command.iamhuwng.workers.dev/session-notifications/action');
});

test('qualification config enables spare localhost ports without changing production configs', async () => {
  const qualificationSource = await readFile(new URL('../../cloudflare/wrangler.qualification.jsonc', import.meta.url), 'utf8');
  const qualification = JSON.parse(qualificationSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(qualification.vars.SPARE_ALLOWED_LOCALHOST_PORTS, '5173-5182');
  for (let port = 5173; port <= 5182; port += 1) {
    assert.match(qualification.vars.STUDENT_AUTH_ALLOWED_ORIGINS, new RegExp(`http://localhost:${port}`));
  }
  const productionFiles = [
    '../../cloudflare/wrangler.jsonc',
    '../../cloudflare/wrangler.thcs-gemma.jsonc',
    '../../cloudflare/wrangler.notifications.jsonc',
    '../../r2-backup-worker/wrangler.toml',
  ];
  for (const file of productionFiles) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.equal(source.includes('SPARE_ALLOWED_LOCALHOST_PORTS'), false, file);
    if (file === '../../cloudflare/wrangler.jsonc') {
      assert.equal(source.includes('luyentap-pdf-qa-20261021'), false, file);
    }
  }
});

test('worker arguments and uploaded version parsing are guarded', () => {
  assert.deepEqual(parseDeployWorkerArgs(['r2-upload-signer', '--dry-run']).service, 'r2-upload-signer');
  assert.equal(parseDeployWorkerArgs(['r2-upload-signer', '--allow-non-main']).allowNonMain, true);
  assert.throws(() => parseDeployWorkerArgs(['r2-upload-signer', '--unknown']), /Unknown flag/);
  assert.equal(parseUploadedVersionId(`Worker Version ID: ${uuid}`), uuid);
  assert.equal(parseUploadedVersionId(JSON.stringify({ id: uuid })), uuid);
  assert.equal(parseUploadedVersionId(JSON.stringify({ version_id: uuid })), uuid);
  assert.throws(() => parseUploadedVersionId('no version'), /valid Worker Version ID/);
});

test('non-deployable worker refuses dry-run with its reason', async () => {
  await assert.rejects(() => deployWorker({ service: 'luyentap-notification-firestore-qa', dryRun: true, deps: {} }), /external-DO public-entry proxy/);
});

test('worker dry-run runs checks and never uploads', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-worker-test-'));
  try {
    await mkdir(path.join(root, 'cloudflare'), { recursive: true });
    await writeFile(path.join(root, 'cloudflare', 'wrangler.jsonc'), '{}\n');
    const calls = [];
    const deps = { exec: async (command, args) => { calls.push([command, args]); if (args[0] === 'status') return result(''); if (args[0] === 'rev-parse') return result(args[1] === 'HEAD' ? 'a'.repeat(40) : 'b'.repeat(40)); return result(''); }, readState: async () => { throw new Error('offline state must not be read'); } };
    const outcome = await deployWorker({ service: 'r2-upload-signer', dryRun: true, allowDirty: true, offline: true, skipTests: true, cwd: root, deps });
    assert.equal(outcome.status, 'DRY_RUN');
    assert.equal(outcome.priorVersionId, undefined);
    assert.match(outcome.plannedCommands.upload, /versions upload/);
    assert.equal(calls.some(([, args]) => args.includes('upload')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rollback command targets the prior version with repo-root config path', () => {
  const command = buildWorkerRollbackCommand(WORKER_REGISTRY['r2-upload-signer'], priorUuid);
  assert.match(command, new RegExp(`${priorUuid}@100%`));
  assert.match(command, /--config cloudflare\/wrangler\.jsonc/);
});

test('worker happy path pins account, verifies whoami, uploads, activates, and probes the new version', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-worker-live-'));
  try {
    await mkdir(path.join(root, 'cloudflare'), { recursive: true });
    await writeFile(path.join(root, 'cloudflare', 'wrangler.jsonc'), '{}\n');
    const active = id => ({ workers: { 'r2-upload-signer': { versionId: id, deployment: { versions: [{ version_id: id, percentage: 100 }] }, modules: [{ name: 'index.js', sha256: 'a'.repeat(64) }] } } });
    const calls = [];
    const reads = [active(priorUuid), active(priorUuid), active(priorUuid), active(uuid)];
    const deps = {
      exec: async (command, args, options) => {
        calls.push({ args, env: options?.env });
        if (args[0] === 'status') return result('');
        if (args[0] === 'rev-parse') return result('a'.repeat(40));
        if (args[0] === 'ls-remote') return result(`${'a'.repeat(40)}\trefs/heads/main\n`);
        if (args.includes('whoami')) return result(whoamiJson());
        if (args.includes('upload')) return result(`Worker Version ID: ${uuid}`);
        return result('');
      },
      readState: async () => reads.shift() || active(uuid),
      fetchImpl: async () => ({ status: 204, redirected: false }),
      sleep: async () => {},
    };
    const outcome = await deployWorker({ service: 'r2-upload-signer', cwd: root, deps });
    assert.equal(outcome.status, 'VERIFIED');
    assert.equal(outcome.accountId, CLOUDFLARE_ACCOUNT_ID);
    assert.equal(outcome.deployedVersionId, uuid);
    assert.equal(outcome.priorVersionId, priorUuid);
    assert.match(outcome.rollbackCommand, new RegExp(`${priorUuid}@100%`));
    assert.equal(calls.some(call => call.args.includes('cloudflare-vitest')), true);
    const wranglerCalls = calls.filter(call => call.args.includes('cloudflare-wrangler'));
    assert.equal(wranglerCalls.length, 4);
    assert.equal(wranglerCalls.every(call => call.env?.CLOUDFLARE_ACCOUNT_ID === CLOUDFLARE_ACCOUNT_ID), true);
    assert.equal(calls.some(call => call.args.includes('versions') && call.args.includes('upload')), true);
    assert.equal(calls.some(call => call.args.includes('versions') && call.args.includes('deploy')), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('worker readback and smoke failures carry rollback context', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-worker-failure-'));
  try {
    await mkdir(path.join(root, 'cloudflare'), { recursive: true });
    await writeFile(path.join(root, 'cloudflare', 'wrangler.jsonc'), '{}\n');
    const prior = { workers: { 'r2-upload-signer': { versionId: priorUuid, deployment: { versions: [{ version_id: priorUuid, percentage: 100 }] } } } };
    const depsBase = {
      exec: async (command, args) => {
        if (args[0] === 'status') return result('');
        if (args[0] === 'rev-parse') return result('a'.repeat(40));
        if (args[0] === 'ls-remote') return result(`${'a'.repeat(40)}\trefs/heads/main\n`);
        if (args.includes('whoami')) return result(whoamiJson());
        if (args.includes('upload')) return result(`Worker Version ID: ${uuid}`);
        return result('');
      },
      readState: async () => prior,
      sleep: async () => {},
      now: (() => { let tick = 0; return () => (tick += 100000); })(),
    };
    await assert.rejects(() => deployWorker({ service: 'r2-upload-signer', cwd: root, deps: depsBase }), error => error.phase === 'readback' && error.priorVersionId === priorUuid && error.rollbackCommand.includes(priorUuid));
    const uploaded = { workers: { 'r2-upload-signer': { versionId: uuid, deployment: { versions: [{ version_id: uuid, percentage: 100 }] }, modules: [{ name: 'x', sha256: 'a'.repeat(64) }] } } };
    const smokeReads = [prior, prior, uploaded];
    await assert.rejects(() => deployWorker({ service: 'r2-upload-signer', cwd: root, deps: { ...depsBase, readState: async () => smokeReads.shift() || uploaded, fetchImpl: async () => ({ status: 302, redirected: false }), now: Date.now } }), error => error.phase === 'smoke' && error.uploadedVersionId === uuid && error.rollbackCommand.includes(priorUuid));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('worker guards reject unknown services, dirty trees, live bypass flags, wrong account, concurrent drift, and split traffic', async () => {
  assert.throws(() => parseDeployWorkerArgs(['r2-upload-signer', '--allow-dirty']), /require --dry-run/);
  assert.throws(() => parseDeployWorkerArgs(['r2-upload-signer', '--offline']), /require --dry-run/);
  assert.throws(() => parseDeployWorkerArgs(['r2-upload-signer', '--skip-tests']), /require --dry-run/);
  assert.equal(assertCloudflareAccount(whoamiJson()), CLOUDFLARE_ACCOUNT_ID);
  assert.equal(assertCloudflareAccount(`Account ID: ${CLOUDFLARE_ACCOUNT_ID}`), CLOUDFLARE_ACCOUNT_ID);
  assert.throws(() => assertCloudflareAccount(whoamiJson('0'.repeat(32))), /does not match pinned account/);
  await assert.rejects(() => deployWorker({ service: 'r2-upload-signer', skipTests: true, deps: {} }), /require --dry-run/);
  await assert.rejects(() => deployWorker({ service: 'non-existent-worker', dryRun: true, deps: {} }), /Unknown Worker service/);
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-worker-guards-'));
  try {
    await mkdir(path.join(root, 'cloudflare'), { recursive: true });
    await writeFile(path.join(root, 'cloudflare', 'wrangler.jsonc'), '{}\n');
    await assert.rejects(() => deployWorker({
      service: 'r2-upload-signer', cwd: root,
      deps: { exec: async (cmd, args) => args[0] === 'status' ? result(' M cloudflare/worker.js\n') : result('a'.repeat(40)) },
    }), /Git tree is dirty/);
    const splitPrior = { workers: { 'r2-upload-signer': { versionId: priorUuid, deployment: { versions: [{ version_id: priorUuid, percentage: 50 }, { version_id: uuid, percentage: 50 }] } } } };
    await assert.rejects(() => deployWorker({
      service: 'r2-upload-signer', cwd: root,
      deps: { exec: async (cmd, args) => args[0] === 'status' ? result('') : args[0] === 'ls-remote' ? result(`${'a'.repeat(40)}\trefs/heads/main\n`) : result('a'.repeat(40)), readState: async () => splitPrior },
    }), /split or unavailable/);

    const prior = { workers: { 'r2-upload-signer': { versionId: priorUuid, deployment: { versions: [{ version_id: priorUuid, percentage: 100 }] } } } };
    const drifted = { workers: { 'r2-upload-signer': { versionId: otherUuid, deployment: { versions: [{ version_id: otherUuid, percentage: 100 }] } } } };
    const wrongAccountCalls = [];
    await assert.rejects(() => deployWorker({
      service: 'r2-upload-signer', cwd: root,
      deps: {
        exec: async (cmd, args) => {
          wrongAccountCalls.push(args);
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result(`${'a'.repeat(40)}\trefs/heads/main\n`);
          if (args.includes('whoami')) return result(whoamiJson('0'.repeat(32)));
          return result('');
        },
        readState: async () => prior,
      },
    }), /does not match pinned account/);
    assert.equal(wrongAccountCalls.some(args => args.includes('upload')), false);

    let readCount = 0;
    const driftCalls = [];
    await assert.rejects(() => deployWorker({
      service: 'r2-upload-signer', cwd: root,
      deps: {
        exec: async (cmd, args) => {
          driftCalls.push(args);
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result(`${'a'.repeat(40)}\trefs/heads/main\n`);
          if (args.includes('whoami')) return result(whoamiJson());
          if (args.includes('upload')) return result(`Worker Version ID: ${uuid}`);
          return result('');
        },
        readState: async () => readCount++ === 0 ? prior : drifted,
      },
    }), error => error.phase === 'pre-deploy-drift' && error.priorVersionId === priorUuid && error.rollbackCommand === undefined);
    assert.equal(driftCalls.some(args => args.includes('versions') && args.includes('deploy')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('upload failures and ENOENT spawn errors do not claim a live rollback', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-worker-phases-'));
  try {
    await mkdir(path.join(root, 'cloudflare'), { recursive: true });
    await writeFile(path.join(root, 'cloudflare', 'wrangler.jsonc'), '{}\n');
    const prior = { workers: { 'r2-upload-signer': { versionId: priorUuid, deployment: { versions: [{ version_id: priorUuid, percentage: 100 }] } } } };
    await assert.rejects(() => deployWorker({
      service: 'r2-upload-signer', cwd: root,
      deps: {
        exec: async (cmd, args) => {
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result(`${'a'.repeat(40)}\trefs/heads/main\n`);
          if (args.includes('whoami')) return result(whoamiJson());
          if (args.includes('upload')) throw new Error('upload failed');
          return result('');
        },
        readState: async () => prior,
      },
    }), error => error.phase === 'upload' && error.priorVersionId === priorUuid && error.rollbackCommand === undefined);

    await assert.rejects(() => deployWorker({
      service: 'r2-upload-signer', cwd: root,
      deps: {
        exec: async (cmd, args) => {
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result(`${'a'.repeat(40)}\trefs/heads/main\n`);
          if (args.includes('whoami')) return result(whoamiJson());
          if (args.includes('upload')) return result(`Worker Version ID: ${uuid}`);
          if (args.includes('deploy') && args.includes('versions')) throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
          return result('');
        },
        readState: async () => prior,
      },
    }), error => error.phase === 'deploy' && error.rollbackCommand === undefined);

    await assert.rejects(() => deployWorker({
      service: 'r2-upload-signer', cwd: root,
      deps: {
        exec: async (cmd, args) => {
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result(`${'a'.repeat(40)}\trefs/heads/main\n`);
          if (args.includes('whoami')) return result(whoamiJson());
          if (args.includes('upload')) return result(`Worker Version ID: ${uuid}`);
          if (args.includes('deploy') && args.includes('versions')) throw new Error('promote failed mid-flight');
          return result('');
        },
        readState: async () => prior,
      },
    }), error => error.phase === 'deploy' && error.rollbackCommand?.includes(priorUuid));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('production Worker deploys enforce origin/main unless --allow-non-main is passed, while dry-run and spare stay feature-branch friendly', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-worker-main-'));
  try {
    await mkdir(path.join(root, 'cloudflare'), { recursive: true });
    await writeFile(path.join(root, 'cloudflare', 'wrangler.jsonc'), '{}\n');
    await writeFile(path.join(root, 'cloudflare', 'wrangler.qualification.jsonc'), '{}\n');
    const active = (serviceName, id) => ({
      workers: { [serviceName]: { versionId: id, deployment: { versions: [{ version_id: id, percentage: 100 }] }, modules: [{ name: 'index.js', sha256: 'a'.repeat(64) }] } },
    });

    const mismatchCalls = [];
    await assert.rejects(() => deployWorker({
      service: 'r2-upload-signer', cwd: root,
      deps: {
        exec: async (cmd, args) => {
          mismatchCalls.push(args);
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result(`${'b'.repeat(40)}\trefs/heads/main\n`);
          return result('');
        },
        readState: async () => { throw new Error('provider read must not run on non-main'); },
      },
    }), /match protected origin\/main/u);
    assert.equal(mismatchCalls.some(args => args.includes('cloudflare-vitest')), false);

    await assert.rejects(() => deployWorker({
      service: 'r2-upload-signer', cwd: root,
      deps: {
        exec: async (cmd, args) => {
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result('');
          return result('');
        },
        readState: async () => { throw new Error('provider read must not run'); },
      },
    }), /could not be resolved/u);

    const dryCalls = [];
    const dry = await deployWorker({
      service: 'r2-upload-signer', dryRun: true, offline: true, skipTests: true, cwd: root,
      deps: {
        exec: async (cmd, args) => {
          dryCalls.push(args);
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          return result('');
        },
      },
    });
    assert.equal(dry.status, 'DRY_RUN');
    assert.equal(dryCalls.some(args => args[0] === 'ls-remote'), false);

    const overrideReads = [active('r2-upload-signer', priorUuid), active('r2-upload-signer', priorUuid), active('r2-upload-signer', priorUuid), active('r2-upload-signer', uuid)];
    const overrideCalls = [];
    const overridden = await deployWorker({
      service: 'r2-upload-signer', allowNonMain: true, cwd: root,
      deps: {
        exec: async (cmd, args) => {
          overrideCalls.push(args);
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args.includes('whoami')) return result(whoamiJson());
          if (args.includes('upload')) return result(`Worker Version ID: ${uuid}`);
          return result('');
        },
        readState: async () => overrideReads.shift() || active('r2-upload-signer', uuid),
        fetchImpl: async () => ({ status: 204, redirected: false }),
        sleep: async () => {},
      },
    });
    assert.equal(overridden.status, 'VERIFIED');
    assert.equal(overrideCalls.some(args => args[0] === 'ls-remote'), false);

    const spareReads = [active('luyentap-qualification-upload-signer', priorUuid), active('luyentap-qualification-upload-signer', priorUuid), active('luyentap-qualification-upload-signer', priorUuid), active('luyentap-qualification-upload-signer', uuid)];
    const spareCalls = [];
    const spare = await deployWorker({
      service: 'luyentap-qualification-upload-signer', cwd: root,
      deps: {
        exec: async (cmd, args) => {
          spareCalls.push(args);
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args.includes('whoami')) return result(whoamiJson());
          if (args.includes('upload')) return result(`Worker Version ID: ${uuid}`);
          return result('');
        },
        readState: async () => spareReads.shift() || active('luyentap-qualification-upload-signer', uuid),
        fetchImpl: async () => ({ status: 204, redirected: false }),
        sleep: async () => {},
      },
    });
    assert.equal(spare.status, 'VERIFIED');
    assert.equal(spare.environment, 'spare');
    assert.equal(spareCalls.some(args => args[0] === 'ls-remote'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
