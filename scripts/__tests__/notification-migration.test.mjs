import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  classifyNotificationEntry,
  compareFirebaseKeys,
  createNotificationMigrationRunner,
  FirebaseNotificationOperatorClient,
  notificationSemantic,
  reportForOperator,
  redactText,
} from '../lib/notificationMigration.mjs';
import {
  assertNoUserTokenEnvironment,
  createGcloudAccessTokenProvider,
  loadOperatorCredential,
  runFirebaseCliPreflight,
} from '../lib/firebaseCliAuth.mjs';
import {
  NotificationMigrationCheckpointRepository,
  assertOperatorConfiguration,
  sha256Hex,
} from '../../cloudflare/src/upload-worker/notifications/migration/checkpoint-repository.mjs';
import {
  CHECKPOINT_START_CURSOR,
  canonicalCheckpointPayload,
} from '../../cloudflare/src/upload-worker/notifications/migration/checkpoint-schema.mjs';
import { createOperatorRunner, parseArgs } from '../migrate-notifications.mjs';

const identity = 'notification-migration@test-project.iam.gserviceaccount.com';
const projectId = 'test-project';
const databaseUrl = `https://${projectId}-default-rtdb.firebaseio.com`;
const serviceAccountKey = JSON.stringify({
  type: 'service_account',
  project_id: projectId,
  client_email: identity,
  private_key: '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----',
});
const checkpointSecret = 'test-only-checkpoint-secret-01234567890123456789';

const clone = (value) => structuredClone(value);
const pathParts = (path) => path.split('/').filter(Boolean);
const rtdbStoredValue = (value) => {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map(rtdbStoredValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, child]) => [key, rtdbStoredValue(child)])
      .filter(([, child]) => child !== undefined));
  }
  return clone(value);
};

const checkpointSignature = async (checkpoint) => {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(checkpointSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(canonicalCheckpointPayload(checkpoint)),
  );
  return [...new Uint8Array(signature)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};

class FakeNotificationStore {
  constructor(root) {
    this.root = clone(root);
    this.versions = new Map();
  }

  valueAt(path) {
    let value = this.root;
    for (const part of pathParts(path)) {
      if (!value || typeof value !== 'object') return null;
      value = value[part];
    }
    return value === undefined ? null : value;
  }

  etag(path) {
    return `${this.versions.get(path) ?? 0}:${path}`;
  }

  setAt(path, value) {
    const parts = pathParts(path);
    let target = this.root;
    for (const part of parts.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) target[part] = {};
      target = target[part];
    }
    const stored = rtdbStoredValue(value);
    if (stored === undefined) delete target[parts.at(-1)];
    else target[parts.at(-1)] = stored;
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
  }

  deleteAt(path) {
    const parts = pathParts(path);
    let target = this.root;
    for (const part of parts.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== 'object') return;
      target = target[part];
    }
    delete target[parts.at(-1)];
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
  }

  async readBatch({ after = null, limit }) {
    return Object.entries(this.root.notifications ?? {})
      .sort(([left], [right]) => compareFirebaseKeys(left, right))
      .filter(([key]) => after === null || compareFirebaseKeys(key, after) > 0)
      .slice(0, limit)
      .map(([key, value]) => ({ key, value: clone(value) }));
  }

  async readWithEtag(path) {
    return { data: clone(this.valueAt(path)), etag: this.etag(path) };
  }

  async writeIfMatch(path, value, etag) {
    if (this.beforeWrite) {
      const callback = this.beforeWrite;
      this.beforeWrite = null;
      await callback(path, value, this);
    }
    if (etag !== this.etag(path)) return false;
    this.setAt(path, value);
    return true;
  }

  async deleteIfMatch(path, etag, guard) {
    if (this.failDeleteOnce) {
      this.failDeleteOnce = false;
      const error = new Error('simulated_delete_interruption');
      error.code = 'simulated_delete_interruption';
      throw error;
    }
    if (this.beforeDelete) {
      const callback = this.beforeDelete;
      this.beforeDelete = null;
      await callback(path, guard, this);
    }
    if (guard?.path && this.etag(guard.path) !== guard.etag) return false;
    if (etag !== this.etag(path)) return false;
    this.deleteAt(path);
    return true;
  }
}

class InterruptibleCheckpointRepository extends NotificationMigrationCheckpointRepository {
  constructor(options) {
    super(options);
    this.failSaveAfter = null;
    this.saveCount = 0;
  }

  async save(...args) {
    this.saveCount += 1;
    if (this.failSaveAfter !== null && this.saveCount > this.failSaveAfter) {
      const error = new Error('simulated_interruption');
      error.code = 'simulated_interruption';
      throw error;
    }
    return super.save(...args);
  }
}

class ConflictOnceCheckpointRepository extends NotificationMigrationCheckpointRepository {
  constructor(options) {
    super(options);
    this.conflictOnce = false;
  }

  async save(...args) {
    if (this.conflictOnce) {
      this.conflictOnce = false;
      return { written: false, checkpoint: null, etag: args[1] };
    }
    return super.save(...args);
  }
}

const makeCheckpointRepository = async (Repository = NotificationMigrationCheckpointRepository) => {
  const rtdb = new FakeNotificationStore({ notifications: {} });
  const operatorFingerprint = await sha256Hex(identity);
  const repository = new Repository({
    rtdb,
    projectId,
    databaseUrl,
    operatorIdentity: identity,
    serviceAccountKey,
    checkpointSecret,
    operatorFingerprint,
  });
  return { repository, rtdb };
};

const validLegacy = (overrides = {}) => ({
  id: 'legacy-1',
  userId: 'student-1',
  type: 'feedback',
  title: 'Feedback ready',
  message: 'Your teacher left feedback.',
  read: true,
  createdAt: 123,
  link: '/results/legacy-1',
  metadata: { resultId: 'result-1', opaque: 'preserved' },
  ...overrides,
});

const runUntilComplete = async (runner, options) => {
  let result;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    result = await runner.execute(options);
    if (result.status === 'complete') return result;
  }
  throw new Error('test_migration_did_not_complete');
};

describe('38B4 notification migration', () => {
  it('accepts only deployment service-account credentials and rejects user tokens', async () => {
    const loaded = await loadOperatorCredential({
      env: { GOOGLE_APPLICATION_CREDENTIALS: 'C:\\secure\\operator.json' },
      readFileImpl: async () => serviceAccountKey,
    });
    assert.equal(loaded.source, 'adc-file');
    assert.equal(loaded.credentialPath, 'C:\\secure\\operator.json');
    assert.equal(loaded.serviceAccountKey, serviceAccountKey);
    assert.throws(
      () => assertNoUserTokenEnvironment({ FIREBASE_TOKEN: 'user-token' }),
      /operator_user_token_forbidden/u,
    );
    assert.throws(
      () => assertNoUserTokenEnvironment({ CLOUDSDK_AUTH_ACCESS_TOKEN: 'user-token' }),
      /operator_user_token_forbidden/u,
    );
    assert.throws(
      () => assertNoUserTokenEnvironment({ CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: 'user-credential.json' }),
      /operator_user_token_forbidden/u,
    );
    assert.throws(
      () => assertNoUserTokenEnvironment({ GOOGLE_GHA_CREDS_PATH: 'user-credential.json' }),
      /operator_user_token_forbidden/u,
    );
    await assert.rejects(
      () => loadOperatorCredential({
        env: { FIREBASE_TOKEN: 'user-token', NOTIFICATION_MIGRATION_GOOGLE_SA_KEY: serviceAccountKey },
      }),
      /operator_user_token_forbidden/u,
    );
  });

  it('runs Firebase CLI preflight with isolated ADC config and checkpoint-only read', async () => {
    let invocation;
    const result = await runFirebaseCliPreflight({
      projectId,
      credentialPath: 'C:\\secure\\operator.json',
      env: {
        PATH: 'test-path',
        NOTIFICATION_MIGRATION_GOOGLE_SA_KEY: serviceAccountKey,
        NOTIFICATION_MIGRATION_CHECKPOINT_SECRET: checkpointSecret,
        NOTIFICATION_MIGRATION_SERVICE_IDENTITY: identity,
        FIREBASE_DB_URL: databaseUrl,
      },
      spawnImpl: (command, args, options) => {
        invocation = { command, args, options };
        return {
          stdout: { on: () => {} },
          stderr: { on: () => {} },
          once: (event, callback) => {
            if (event === 'close') queueMicrotask(() => callback(0, null));
          },
        };
      },
    });
    assert.deepEqual(result, {
      authenticated: true,
      source: 'firebase-cli-adc',
      checkpointPath: 'notification_migrations/prd0062-38b4-legacy-notifications-v1/checkpoint',
    });
    if (process.platform === 'win32') {
      assert.equal(invocation.command, process.env.ComSpec || 'cmd.exe');
      assert.deepEqual(invocation.args.slice(0, 3), ['/d', '/s', '/c']);
      assert.match(invocation.args[3], /^firebase --project test-project --json --non-interactive database:get \/notification_migrations\//u);
      assert.equal(invocation.options.shell, false);
    } else {
      assert.equal(invocation.command, 'firebase');
      assert.deepEqual(invocation.args, [
        '--project', projectId,
        '--json',
        '--non-interactive',
        'database:get',
        '/notification_migrations/prd0062-38b4-legacy-notifications-v1/checkpoint',
      ]);
    }
    assert.equal(invocation.options.env.GOOGLE_APPLICATION_CREDENTIALS, 'C:\\secure\\operator.json');
    assert.equal(invocation.options.env.APPDATA.length > 0, true);
    assert.equal(invocation.options.env.FIREBASE_TOKEN, undefined);
    assert.equal(invocation.options.env.NOTIFICATION_MIGRATION_GOOGLE_SA_KEY, undefined);
    assert.equal(invocation.options.env.NOTIFICATION_MIGRATION_CHECKPOINT_SECRET, undefined);
    assert.equal(invocation.options.env.NOTIFICATION_MIGRATION_SERVICE_IDENTITY, undefined);
    assert.equal(invocation.options.env.FIREBASE_DB_URL, undefined);
    await assert.rejects(
      () => runFirebaseCliPreflight({
        projectId,
        credentialPath: 'C:\\secure\\operator.json',
        cliBinary: 'firebase & whoami',
        spawnImpl: () => { throw new Error('must-not-spawn'); },
      }),
      /firebase_cli_binary_invalid/u,
    );
  });

  it('requires Firebase CLI preflight before constructing the operator runner', async () => {
    let preflight;
    const env = {
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_DB_URL: databaseUrl,
      NOTIFICATION_MIGRATION_SERVICE_IDENTITY: identity,
      NOTIFICATION_MIGRATION_AUTH_MODE: 'firebase-cli',
      NOTIFICATION_MIGRATION_GOOGLE_SA_KEY: serviceAccountKey,
      NOTIFICATION_MIGRATION_CHECKPOINT_SECRET: checkpointSecret,
    };
    const runner = await createOperatorRunner({
      env,
      fetchImpl: async () => new Response(null, { status: 200 }),
      firebaseCliPreflight: async (options) => { preflight = options; },
    });
    assert.equal(typeof runner.dryRun, 'function');
    assert.equal(preflight.projectId, projectId);
    assert.equal(preflight.cliBinary, 'firebase');
    assert.match(preflight.credentialPath, /operator-service-account\.json$/u);
  });

  it('mints and caches a short-lived gcloud impersonation token without exporting it', async () => {
    const token = `ya29.${'x'.repeat(40)}`;
    let calls = 0;
    let invocation;
    const provider = createGcloudAccessTokenProvider({
      projectId,
      serviceAccount: identity,
      env: { PATH: 'test-path' },
      spawnImpl: (command, args, options) => {
        calls += 1;
        invocation = { command, args, options };
        return {
          stdout: { on: (event, callback) => { if (event === 'data') queueMicrotask(() => callback(token)); } },
          stderr: { on: () => {} },
          once: (event, callback) => { if (event === 'close') queueMicrotask(() => callback(0, null)); },
        };
      },
    });
    const first = await provider();
    const second = await provider();
    assert.equal(first.token, token);
    assert.equal(second.token, token);
    assert.equal(first.expiresIn, 3600);
    assert.ok(second.expiresIn > 3590 && second.expiresIn <= 3600);
    assert.equal(calls, 1);
    if (process.platform === 'win32') {
      assert.equal(invocation.options.shell, false);
      assert.match(invocation.args.at(-1), /^gcloud auth print-access-token /u);
      assert.match(
        invocation.args.at(-1),
        new RegExp(`--impersonate-service-account=${identity.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')} --quiet$`, 'u'),
      );
      assert.doesNotMatch(invocation.args.at(-1), /"--impersonate-service-account=/u);
    } else {
      assert.equal(invocation.command, 'gcloud');
      assert.deepEqual(invocation.args, [
        'auth',
        'print-access-token',
        `--impersonate-service-account=${identity}`,
        '--quiet',
      ]);
    }
    assert.equal(invocation.options.env.CLOUDSDK_AUTH_ACCESS_TOKEN, undefined);
    assert.equal(invocation.options.env.CLOUDSDK_AUTH_ACCESS_TOKEN_FILE, undefined);
    assert.equal(invocation.options.env.CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT, undefined);
  });

  it('uses gcloud impersonation by default when no key material is configured', async () => {
    const env = {
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_DB_URL: databaseUrl,
      NOTIFICATION_MIGRATION_SERVICE_IDENTITY: identity,
      NOTIFICATION_MIGRATION_CHECKPOINT_SECRET: checkpointSecret,
    };
    let preflightRequest;
    const runner = await createOperatorRunner({
      env,
      fetchImpl: async (url, options) => {
        preflightRequest = { url, options };
        return new Response('{}', { status: 200, headers: { etag: 'checkpoint-etag' } });
      },
      gcloudAccessTokenProviderFactory: (options) => {
        assert.equal(options.projectId, projectId);
        assert.equal(options.serviceAccount, identity);
        return async () => `gcloud-token-${'x'.repeat(24)}`;
      },
    });
    assert.equal(typeof runner.dryRun, 'function');
    assert.match(preflightRequest.options.headers.Authorization, /^Bearer gcloud-token-/u);
    assert.match(preflightRequest.url, /notification_migrations\/prd0062-38b4-legacy-notifications-v1\/checkpoint\.json$/u);
  });

  it('classifies flat, per-user, and malformed shapes without confusing nested IDs', () => {
    assert.equal(classifyNotificationEntry('legacy-1', validLegacy()).kind, 'legacy');
    assert.equal(classifyNotificationEntry('student-1', { 'legacy-1': validLegacy() }).kind, 'per-user-container');
    assert.equal(classifyNotificationEntry('broken-1', { title: 'missing recipient' }).kind, 'malformed');
    assert.equal(classifyNotificationEntry('student-2', { type: { id: 'nested-row' } }).kind, 'per-user-container');
    assert.equal(classifyNotificationEntry('student-3', { 'broken-row': null }).kind, 'malformed');
  });

  it('uses RTDB byte ordering and rejects broad operator path methods', async () => {
    assert.deepEqual(['a', '0', 'A'].sort(compareFirebaseKeys), ['0', 'A', 'a']);
    const client = new FirebaseNotificationOperatorClient({
      databaseUrl,
      projectId,
      serviceAccount: JSON.parse(serviceAccountKey),
      fetchImpl: async () => new Response(JSON.stringify({ '0': {}, A: {}, a: {} }), {
        status: 200,
        headers: { etag: 'root-etag' },
      }),
    });
    client.cachedToken = 'token-' + 'x'.repeat(24);
    client.tokenExpiresAt = Date.now() + 3600_000;
    assert.deepEqual((await client.readBatch({ limit: 2 })).map(({ key }) => key), ['0', 'A']);
    assert.deepEqual((await client.readBatch({ after: 'A', limit: 2 })).map(({ key }) => key), ['a']);
    assert.throws(() => client.assertPath('notifications', 'PUT'), /firebase_operator_path_forbidden/u);
    assert.throws(() => client.assertPath('notifications/legacy-1', 'PUT'), /firebase_operator_path_forbidden/u);
    assert.doesNotThrow(() => client.assertPath('notifications/student-1/legacy-1', 'DELETE'));
    assert.throws(() => client.assertPath('notifications/../legacy-1', 'GET'), /firebase_operator_path_forbidden/u);
    await assert.rejects(
      () => client.writeIfMatch('notifications/student-1/legacy-1', {}, undefined),
      /firebase_operator_cas_required/u,
    );
    const requests = [];
    client.fetchImpl = async (url, options) => {
      requests.push({ url, options });
      return new Response('{}', { status: 200, headers: { etag: 'same-etag' } });
    };
    assert.equal(await client.deleteIfMatch('notifications/student-1/legacy-1', 'same-etag', {
      path: 'notifications/student-1/legacy-1',
      etag: 'same-etag',
    }), true);
    assert.equal(requests.at(-1).options.method, 'DELETE');
    assert.equal(requests.at(-1).options.headers['if-match'], 'same-etag');
  });

  it('checkpoints malformed-but-readable RTDB keys and advances past them', async () => {
    const store = new FakeNotificationStore({
      notifications: {
        'bad key': { title: 'Keep this malformed row' },
        good: validLegacy({ id: 'good' }),
      },
    });
    const { repository } = await makeCheckpointRepository();
    const runner = createNotificationMigrationRunner({ store, checkpointRepository: repository, now: () => '2026-08-02T00:00:00.000Z' });
    const first = await runner.execute({ batchSize: 1 });
    assert.equal(first.checkpoint.lastKey, 'bad key');
    await runUntilComplete(runner, { batchSize: 1 });
    assert.deepEqual(store.valueAt('notifications/bad key'), { title: 'Keep this malformed row' });
    assert.equal(store.valueAt('notifications/student-1/good').read, true);
  });

  it('supports dry-run and bounded execution while preserving meaning and read state', async () => {
    const root = {
      notifications: {
        'a-legacy-1': validLegacy({ id: 'a-legacy-1' }),
        'b-legacy-2': validLegacy({ id: 'b-legacy-2', userId: 'student-2', read: false, metadata: { source: 'legacy' } }),
        'c-student-3': {
          'untouched-1': { id: 'untouched-1', type: 'info', title: 'Untouched', message: 'Still here', read: true, createdAt: 9 },
          'broken-child': { title: 'Malformed nested row' },
        },
        'd-broken-1': { title: 'No recipient', message: 'Keep me', read: false },
      },
    };
    const store = new FakeNotificationStore(root);
    const { repository } = await makeCheckpointRepository();
    const runner = createNotificationMigrationRunner({ store, checkpointRepository: repository, now: () => '2026-08-02T00:00:00.000Z' });

    const preview = await runner.dryRun({ batchSize: 2 });
    assert.equal(preview.status, 'dry-run');
    assert.equal(preview.counts.scanned, 2);
    const previewReport = await reportForOperator(preview);
    assert.equal(previewReport.plannedCount, 2);
    assert.equal(previewReport.planned.every(({ keyDigest }) => /^[0-9a-f]{64}$/u.test(keyDigest)), true);
    assert.equal((await repository.load()).data, null);

    const first = await runner.execute({ batchSize: 1 });
    assert.equal(first.status, 'active');
    const firstReport = await reportForOperator(first);
    assert.match(firstReport.cursorDigest, /^[0-9a-f]{64}$/u);
    assert.deepEqual(store.valueAt('notifications/student-1/a-legacy-1'), {
      id: 'a-legacy-1',
      type: 'feedback',
      title: 'Feedback ready',
      message: 'Your teacher left feedback.',
      read: true,
      createdAt: 123,
      link: '/results/legacy-1',
      metadata: { resultId: 'result-1', opaque: 'preserved' },
    });
    assert.equal(store.valueAt('notifications/a-legacy-1'), null);
    assert.equal(store.valueAt('notifications/student-1/a-legacy-1').read, true);

    const second = await runner.execute({ batchSize: 1 });
    assert.equal(second.status, 'active');
    const third = await runner.execute({ batchSize: 1 });
    assert.equal(third.status, 'active');
    const fourth = await runner.execute({ batchSize: 1 });
    assert.equal(fourth.status, 'active');
    const fifth = await runUntilComplete(runner, { batchSize: 1 });
    assert.deepEqual(store.valueAt('notifications/student-2/b-legacy-2').metadata, { source: 'legacy' });
    assert.equal(store.valueAt('notifications/student-2/b-legacy-2').read, false);
    assert.deepEqual(store.valueAt('notifications/d-broken-1'), { title: 'No recipient', message: 'Keep me', read: false });
    assert.equal(fifth.checkpoint.counts.malformed, 2);
    const reconciliation = await runner.reconcile({ batchSize: 2 });
    assert.equal(reconciliation.status, 'reconciled');
    assert.equal(reconciliation.counts.malformed, 2);
    assert.ok(reconciliation.counts.untouched >= 3);
  });

  it('recovers an interruption after destination write without duplicating or losing data', async () => {
    const store = new FakeNotificationStore({ notifications: { 'legacy-1': validLegacy() } });
    const checkpointRtdb = new FakeNotificationStore({ notifications: {} });
    const operatorFingerprint = await sha256Hex(identity);
    const repository = new InterruptibleCheckpointRepository({
      rtdb: checkpointRtdb,
      projectId,
      databaseUrl,
      operatorIdentity: identity,
      serviceAccountKey,
      checkpointSecret,
      operatorFingerprint,
    });
    const runner = createNotificationMigrationRunner({ store, checkpointRepository: repository, now: () => '2026-08-02T00:00:00.000Z' });
    store.failDeleteOnce = true;
    await assert.rejects(() => runner.execute({ batchSize: 1 }), /simulated_delete_interruption/u);
    assert.ok(store.valueAt('notifications/student-1/legacy-1'));
    assert.ok(store.valueAt('notifications/legacy-1'));
    repository.failSaveAfter = null;
    const resumed = await runner.execute({ batchSize: 1 });
    assert.equal(resumed.status, 'active');
    await runUntilComplete(runner, { batchSize: 1 });
    assert.equal(store.valueAt('notifications/legacy-1'), null);
    assert.equal(notificationSemantic(store.valueAt('notifications/student-1/legacy-1')), notificationSemantic(validLegacy({ userId: undefined })));
  });

  it('fails closed when a source changes during the destination write window', async () => {
    const source = validLegacy();
    const store = new FakeNotificationStore({ notifications: { 'legacy-1': source } });
    const { repository } = await makeCheckpointRepository();
    const runner = createNotificationMigrationRunner({ store, checkpointRepository: repository, now: () => '2026-08-02T00:00:00.000Z' });
    store.beforeWrite = async (path, _value, currentStore) => {
      if (path === 'notifications/student-1/legacy-1') {
        currentStore.setAt('notifications/legacy-1', { ...source, title: 'Changed concurrently' });
      }
    };
    await assert.rejects(() => runner.execute({ batchSize: 1 }), /notification_source_changed_during_migration/u);
    assert.equal(store.valueAt('notifications/student-1/legacy-1'), null);
    assert.equal(store.valueAt('notifications/legacy-1').title, 'Changed concurrently');
    assert.equal((await repository.load()).data.lastKey, CHECKPOINT_START_CURSOR);
  });

  it('retains destination-parent source collisions until the parent is clear', async () => {
    const sourceA = validLegacy({ id: 'a-legacy-1', userId: 'b-legacy-1' });
    const sourceB = validLegacy({ id: 'b-legacy-1', userId: 'student-2' });
    const store = new FakeNotificationStore({
      notifications: { 'a-legacy-1': sourceA, 'b-legacy-1': sourceB },
    });
    const { repository } = await makeCheckpointRepository();
    const runner = createNotificationMigrationRunner({ store, checkpointRepository: repository, now: () => '2026-08-02T00:00:00.000Z' });
    const first = await runner.execute({ batchSize: 2 });
    assert.equal(first.checkpoint.counts.conflicts, 1);
    assert.equal(first.checkpoint.counts.sourceRetained, 1);
    assert.deepEqual(store.valueAt('notifications/a-legacy-1'), sourceA);
    assert.equal(store.valueAt('notifications/b-legacy-1'), null);
    assert.equal(store.valueAt('notifications/b-legacy-1/a-legacy-1'), null);
    assert.ok(store.valueAt('notifications/student-2/b-legacy-1'));

    await runner.execute({ batchSize: 2 });
    const replay = await runUntilComplete(runner, { batchSize: 2, replay: true });
    assert.equal(replay.status, 'complete');
    assert.equal(store.valueAt('notifications/a-legacy-1'), null);
    assert.equal(store.valueAt('notifications/b-legacy-1/a-legacy-1').userId, undefined);
  });

  it('does not replace a malformed or scalar recipient parent', async () => {
    const malformed = { userId: 'student-1', title: 'Malformed but readable' };
    const store = new FakeNotificationStore({
      notifications: { 'bad-row': malformed, 'student-1': 'occupied-parent' },
    });
    const { repository } = await makeCheckpointRepository();
    const runner = createNotificationMigrationRunner({ store, checkpointRepository: repository, now: () => '2026-08-02T00:00:00.000Z' });
    const result = await runUntilComplete(runner, { batchSize: 2 });
    assert.equal(result.checkpoint.counts.malformed, 2);
    assert.equal(result.checkpoint.counts.conflicts, 1);
    assert.equal(result.checkpoint.counts.sourceRetained, 2);
    assert.deepEqual(store.valueAt('notifications/bad-row'), malformed);
    assert.equal(store.valueAt('notifications/student-1'), 'occupied-parent');
  });

  it('fails closed on checkpoint CAS conflict and resumes from the durable cursor', async () => {
    const store = new FakeNotificationStore({
      notifications: {
        'a-legacy-1': validLegacy({ id: 'a-legacy-1' }),
        'b-legacy-2': validLegacy({ id: 'b-legacy-2', userId: 'student-2' }),
      },
    });
    const checkpointRtdb = new FakeNotificationStore({ notifications: {} });
    const operatorFingerprint = await sha256Hex(identity);
    const repository = new ConflictOnceCheckpointRepository({
      rtdb: checkpointRtdb,
      projectId,
      databaseUrl,
      operatorIdentity: identity,
      serviceAccountKey,
      checkpointSecret,
      operatorFingerprint,
    });
    const runner = createNotificationMigrationRunner({ store, checkpointRepository: repository, now: () => '2026-08-02T00:00:00.000Z' });
    const first = await runner.execute({ batchSize: 1 });
    assert.equal(first.status, 'active');
    repository.conflictOnce = true;
    await assert.rejects(() => runner.execute({ batchSize: 1 }), /checkpoint_cas_conflict/u);
    assert.ok(store.valueAt('notifications/student-2/b-legacy-2'));
    await runUntilComplete(runner, { batchSize: 1 });
    assert.equal(store.valueAt('notifications/b-legacy-2'), null);
  });

  it('recovers when source deletion succeeds before checkpoint persistence', async () => {
    const store = new FakeNotificationStore({ notifications: { 'legacy-1': validLegacy() } });
    const checkpointRtdb = new FakeNotificationStore({ notifications: {} });
    const operatorFingerprint = await sha256Hex(identity);
    const repository = new InterruptibleCheckpointRepository({
      rtdb: checkpointRtdb,
      projectId,
      databaseUrl,
      operatorIdentity: identity,
      serviceAccountKey,
      checkpointSecret,
      operatorFingerprint,
    });
    const runner = createNotificationMigrationRunner({ store, checkpointRepository: repository, now: () => '2026-08-02T00:00:00.000Z' });
    repository.failSaveAfter = 1; // initial checkpoint writes; row checkpoint fails after delete
    await assert.rejects(() => runner.execute({ batchSize: 1 }), /simulated_interruption/u);
    assert.equal(store.valueAt('notifications/legacy-1'), null);
    assert.ok(store.valueAt('notifications/student-1/legacy-1'));
    repository.failSaveAfter = null;
    await runUntilComplete(runner, { batchSize: 1 });
    assert.equal(notificationSemantic(store.valueAt('notifications/student-1/legacy-1')), notificationSemantic(validLegacy({ userId: undefined })));
  });

  it('never deletes malformed rows or overwrites a conflicting destination', async () => {
    const source = validLegacy();
    const store = new FakeNotificationStore({
      notifications: {
        'legacy-1': source,
        'broken-1': { userId: 'student-1', title: 'missing required fields' },
        'student-1': { 'legacy-1': { id: 'legacy-1', type: 'error', title: 'Different', message: 'Conflict', read: false, createdAt: 4 } },
      },
    });
    const { repository } = await makeCheckpointRepository();
    const runner = createNotificationMigrationRunner({ store, checkpointRepository: repository, now: () => '2026-08-02T00:00:00.000Z' });
    const result = await runner.execute({ batchSize: 3 });
    assert.equal(result.status, 'active');
    const completed = await runUntilComplete(runner, { batchSize: 3 });
    assert.deepEqual(store.valueAt('notifications/legacy-1'), source);
    assert.deepEqual(store.valueAt('notifications/broken-1'), { userId: 'student-1', title: 'missing required fields' });
    assert.deepEqual(store.valueAt('notifications/student-1/broken-1'), { title: 'missing required fields' });
    assert.equal(completed.checkpoint.counts.conflicts, 1);
    assert.equal(completed.checkpoint.counts.malformed, 1);
    assert.equal(completed.checkpoint.counts.sourceRetained, 2);
    const reconciliation = await runner.reconcile({ batchSize: 3 });
    assert.equal(reconciliation.counts.malformed, 1);
    assert.equal(reconciliation.counts.sourceRetained, 2);
    assert.equal(reconciliation.counts.conflicts, 1);
    store.deleteAt('notifications/student-1/broken-1');
    const missingProjection = await runner.reconcile({ batchSize: 3 });
    assert.equal(missingProjection.counts.errors, 1);
  });

  it('retains the source when the destination changes during the delete guard', async () => {
    const source = validLegacy();
    const store = new FakeNotificationStore({ notifications: { 'legacy-1': source } });
    const { repository } = await makeCheckpointRepository();
    const runner = createNotificationMigrationRunner({ store, checkpointRepository: repository, now: () => '2026-08-02T00:00:00.000Z' });
    store.beforeDelete = async (_path, _guard, currentStore) => {
      currentStore.setAt('notifications/student-1/legacy-1', {
        ...validLegacy({ userId: undefined }),
        read: false,
      });
    };
    const result = await runner.execute({ batchSize: 1 });
    assert.equal(result.status, 'active');
    await runUntilComplete(runner, { batchSize: 1 });
    assert.deepEqual(store.valueAt('notifications/legacy-1'), source);
    assert.equal(store.valueAt('notifications/student-1/legacy-1').read, false);
    const checkpoint = (await repository.load()).data;
    assert.ok(checkpoint.counts.conflicts >= 1);
    assert.ok(checkpoint.counts.sourceRetained >= 1);
  });

  it('replay is idempotent and rollback stops future batches without deleting destinations', async () => {
    const untouched = validLegacy({
      id: 'per-user-legacy-1',
      userId: undefined,
      title: 'Original per-user notice',
      message: 'This compatibility row was not migrated.',
      read: false,
    });
    const store = new FakeNotificationStore({
      notifications: {
        'legacy-1': validLegacy(),
        'student-2': { 'per-user-legacy-1': untouched },
      },
    });
    const { repository } = await makeCheckpointRepository();
    const runner = createNotificationMigrationRunner({ store, checkpointRepository: repository, now: () => '2026-08-02T00:00:00.000Z' });
    const first = await runner.execute({ batchSize: 1 });
    assert.equal(first.status, 'active');
    await runUntilComplete(runner, { batchSize: 1 });
    const replay = await runner.execute({ batchSize: 1, replay: true });
    assert.equal(replay.status, 'active');
    await runUntilComplete(runner, { batchSize: 1, replay: true });
    assert.equal(store.valueAt('notifications/student-1/legacy-1').read, true);
    const rollback = await runner.rollback();
    assert.equal(rollback.status, 'paused');
    const stopped = await runner.execute({ batchSize: 1 });
    assert.equal(stopped.status, 'paused');
    const { userId: _omittedRecipient, ...migratedDestination } = validLegacy();
    assert.deepEqual(store.valueAt('notifications/student-1/legacy-1'), migratedDestination);
    assert.deepEqual(store.valueAt('notifications/student-2/per-user-legacy-1'), untouched);
  });

  it('rejects wrong identity/project and detects checkpoint tampering', async () => {
    assert.throws(() => assertOperatorConfiguration({
      projectId,
      databaseUrl,
      operatorIdentity: 'wrong@test-project.iam.gserviceaccount.com',
      serviceAccountKey,
      checkpointSecret,
    }), /operator_service_identity_mismatch/u);
    assert.throws(() => assertOperatorConfiguration({
      projectId,
      databaseUrl,
      operatorIdentity: 'operator@other-project.iam.gserviceaccount.com',
      checkpointSecret,
      requireServiceAccount: false,
    }), /operator_service_project_mismatch/u);
    assert.throws(() => assertOperatorConfiguration({
      projectId: 'other-project',
      databaseUrl,
      operatorIdentity: identity,
      serviceAccountKey,
      checkpointSecret,
    }), /operator_database_project_mismatch/u);
    assert.throws(() => assertOperatorConfiguration({
      projectId,
      databaseUrl: `${databaseUrl}:444`,
      operatorIdentity: identity,
      serviceAccountKey,
      checkpointSecret,
    }), /operator_database_url_invalid/u);

    const { repository, rtdb } = await makeCheckpointRepository();
    const checkpoint = {
      schemaVersion: 1,
      migrationId: 'prd0062-38b4-legacy-notifications-v1',
      projectId,
      notificationRootPath: 'notifications',
      checkpointPath: 'notification_migrations/prd0062-38b4-legacy-notifications-v1/checkpoint',
      operatorFingerprint: await sha256Hex(identity),
      status: 'active',
      batchSize: 1,
      lastKey: CHECKPOINT_START_CURSOR,
      batchNumber: 0,
      counts: { scanned: 0, migrated: 0, replayed: 0, untouched: 0, malformed: 0, conflicts: 0, sourceRetained: 0, errors: 0 },
      updatedAt: '2026-08-02T00:00:00.000Z',
    };
    const saved = await repository.save(checkpoint, (await repository.load()).etag);
    assert.equal(saved.written, true);
    const tampered = clone(rtdb.valueAt('notification_migrations/prd0062-38b4-legacy-notifications-v1/checkpoint'));
    tampered.counts.migrated = 99;
    rtdb.setAt('notification_migrations/prd0062-38b4-legacy-notifications-v1/checkpoint', tampered);
    await assert.rejects(() => repository.load(), /checkpoint_tampered/u);
    const wrongFingerprintRepository = new NotificationMigrationCheckpointRepository({
      rtdb,
      projectId,
      databaseUrl,
      operatorIdentity: identity,
      serviceAccountKey,
      checkpointSecret,
      operatorFingerprint: '0'.repeat(64),
    });
    await assert.rejects(() => wrongFingerprintRepository.load(), /operator_fingerprint_mismatch/u);
    await assert.rejects(() => repository.save(checkpoint, undefined), /checkpoint_etag_missing/u);
  });

  it('recovers only an HMAC-valid initial checkpoint whose null cursor RTDB removed', async () => {
    const { repository, rtdb } = await makeCheckpointRepository();
    const legacyCheckpoint = {
      schemaVersion: 1,
      migrationId: 'prd0062-38b4-legacy-notifications-v1',
      projectId,
      notificationRootPath: 'notifications',
      checkpointPath: 'notification_migrations/prd0062-38b4-legacy-notifications-v1/checkpoint',
      operatorFingerprint: await sha256Hex(identity),
      status: 'active',
      batchSize: 1,
      lastKey: null,
      batchNumber: 0,
      counts: { scanned: 0, migrated: 0, replayed: 0, untouched: 0, malformed: 0, conflicts: 0, sourceRetained: 0, errors: 0 },
      updatedAt: '2026-08-02T00:00:00.000Z',
    };
    const signature = await checkpointSignature(legacyCheckpoint);
    const stored = { ...legacyCheckpoint, signature };
    delete stored.lastKey;
    rtdb.setAt('notification_migrations/prd0062-38b4-legacy-notifications-v1/checkpoint', stored);

    const recovered = await repository.load();
    assert.equal(recovered.data.lastKey, CHECKPOINT_START_CURSOR);
    rtdb.setAt('notification_migrations/prd0062-38b4-legacy-notifications-v1/checkpoint', {
      ...stored,
      counts: { ...stored.counts, scanned: 1 },
    });
    await assert.rejects(() => repository.load(), /checkpoint_tampered/u);
  });

  it('redacts credentials and refuses user-token/browser migration paths', async () => {
    const secret = 'Bearer eyJ' + 'A'.repeat(90);
    const redacted = redactText(`failed ${secret} auth=AIzaSy` + 'B'.repeat(40));
    assert.ok(!redacted.includes(secret));
    assert.match(redacted, /\[redacted\]/u);
    assert.deepEqual(parseArgs(['--execute', '--batch-size', '25', '--replay']), {
      mode: 'execute', batchSize: 25, replay: true, help: false,
    });
    assert.throws(() => parseArgs(['--execute', '--batch-size']), /migration_batch_size_invalid/u);
    const source = await readFile(new URL('../migrate-notifications.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /firebase\/database|src\/services\/firebase|\bgetIdToken\b/u);
  });
});
