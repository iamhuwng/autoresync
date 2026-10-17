#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import {
  FirebaseNotificationOperatorClient,
  createNotificationMigrationRunner,
  redactError,
  reportForOperator,
} from './lib/notificationMigration.mjs';
import {
  assertNoUserTokenEnvironment,
  createGcloudAccessTokenProvider,
  loadOperatorCredential,
  prepareFirebaseCliCredential,
  runFirebaseCliPreflight,
} from './lib/firebaseCliAuth.mjs';
import {
  NotificationMigrationCheckpointRepository,
  assertOperatorConfiguration,
  sha256Hex,
} from '../cloudflare/src/upload-worker/notifications/migration/checkpoint-repository.mjs';
import { CHECKPOINT_PATH } from '../cloudflare/src/upload-worker/notifications/migration/checkpoint-schema.mjs';

const usage = `Usage: node scripts/migrate-notifications.mjs [mode] [options]

Modes (default is --dry-run):
  --dry-run                 Read-only bounded preview (safe default)
  --execute                 Execute one bounded batch and persist its checkpoint
  --reconcile               Read-only full reconciliation in bounded pages
  --rollback                Pause future batches; retain checkpoint and destinations

Options:
  --batch-size <1..500>     Page size (default: 100)
  --replay                  Replay from the beginning using idempotent destination checks
  --help                    Show this help

Required deployment-only environment (never pass secrets on argv):
  FIREBASE_PROJECT_ID, FIREBASE_DB_URL
  NOTIFICATION_MIGRATION_SERVICE_IDENTITY
  NOTIFICATION_MIGRATION_CHECKPOINT_SECRET (32+ bytes)

Authentication (default: gcloud-impersonation):
  gcloud auth print-access-token --impersonate-service-account=<operator>
  or set NOTIFICATION_MIGRATION_AUTH_MODE=firebase-cli with
  GOOGLE_APPLICATION_CREDENTIALS (service-account JSON file; preferred)
  or NOTIFICATION_MIGRATION_GOOGLE_SA_KEY (ephemeral compatibility fallback)

The gcloud mode uses the local gcloud caller only to mint a short-lived token
for the deployment operator identity; that caller token is never sent to
Firebase, logged, or placed in an environment variable. The runner performs a
read-only checkpoint-path REST preflight and rejects browser/user token
environments.
`;

const parseBatchSize = (value) => {
  if (value === undefined) return 100;
  if (!/^\d+$/u.test(value)) throw new Error('migration_batch_size_invalid');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 500) throw new Error('migration_batch_size_invalid');
  return parsed;
};

export const parseArgs = (argv) => {
  const options = { mode: 'dry-run', batchSize: 100, replay: false, help: false };
  const modes = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dry-run' || arg === '--execute' || arg === '--reconcile' || arg === '--rollback') {
      modes.add(arg.slice(2));
    } else if (arg === '--replay') {
      options.replay = true;
    } else if (arg === '--batch-size') {
      const value = argv[++index];
      if (value === undefined || value.startsWith('--')) throw new Error('migration_batch_size_invalid');
      options.batchSize = parseBatchSize(value);
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseBatchSize(arg.slice('--batch-size='.length));
    } else {
      throw new Error('migration_argument_invalid');
    }
  }
  if (modes.size > 1) throw new Error('migration_mode_conflict');
  if (modes.size === 1) options.mode = [...modes][0];
  if (options.mode !== 'execute' && options.replay) throw new Error('migration_replay_requires_execute');
  return options;
};

export const createOperatorRunner = async ({
  env = process.env,
  fetchImpl = globalThis.fetch,
  firebaseCliPreflight = runFirebaseCliPreflight,
  gcloudAccessTokenProviderFactory = createGcloudAccessTokenProvider,
} = {}) => {
  const projectId = requiredEnvValue(env, 'FIREBASE_PROJECT_ID');
  const databaseUrl = requiredEnvValue(env, 'FIREBASE_DB_URL');
  const operatorIdentity = requiredEnvValue(env, 'NOTIFICATION_MIGRATION_SERVICE_IDENTITY');
  const checkpointSecret = requiredEnvValue(env, 'NOTIFICATION_MIGRATION_CHECKPOINT_SECRET');
  const authMode = env.NOTIFICATION_MIGRATION_AUTH_MODE?.trim() || 'gcloud-impersonation';
  if (!['firebase-cli', 'gcloud-impersonation'].includes(authMode)) {
    throw new Error('operator_auth_mode_invalid');
  }

  let serviceAccountKey = null;
  let accessTokenProvider = null;
  let config;
  if (authMode === 'firebase-cli') {
    const operatorCredential = await loadOperatorCredential({ env });
    serviceAccountKey = operatorCredential.serviceAccountKey;
    config = assertOperatorConfiguration({
      projectId,
      operatorIdentity,
      databaseUrl,
      serviceAccountKey,
      checkpointSecret,
    });
    const cliCredential = await prepareFirebaseCliCredential({
      serviceAccountKey,
      credentialPath: operatorCredential.credentialPath,
    });
    try {
      await firebaseCliPreflight({
        projectId,
        credentialPath: cliCredential.credentialPath,
        cliBinary: env.FIREBASE_CLI_BIN?.trim() || 'firebase',
        env,
      });
    } finally {
      await cliCredential.cleanup();
    }
  } else {
    assertNoUserTokenEnvironment(env);
    config = assertOperatorConfiguration({
      projectId,
      databaseUrl,
      operatorIdentity,
      checkpointSecret,
      requireServiceAccount: false,
    });
    accessTokenProvider = gcloudAccessTokenProviderFactory({
      projectId,
      serviceAccount: operatorIdentity,
      env,
      cliBinary: env.GCLOUD_CLI_BIN?.trim() || 'gcloud',
    });
  }
  const operatorFingerprint = await sha256Hex(operatorIdentity);
  const store = new FirebaseNotificationOperatorClient({
    databaseUrl: config.normalizedDatabaseUrl,
    projectId,
    serviceAccount: config.serviceAccount,
    accessTokenProvider,
    fetchImpl,
  });
  if (authMode === 'gcloud-impersonation') await store.readWithEtag(CHECKPOINT_PATH);
  const checkpointRepository = new NotificationMigrationCheckpointRepository({
    rtdb: store,
    projectId,
    databaseUrl: config.normalizedDatabaseUrl,
    operatorIdentity,
    serviceAccountKey,
    checkpointSecret,
    operatorFingerprint,
    requireServiceAccount: authMode === 'firebase-cli',
  });
  return createNotificationMigrationRunner({ store, checkpointRepository });
};

const requiredEnvValue = (env, name) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

export const main = async (argv = process.argv.slice(2), dependencies = {}) => {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(usage);
    return { status: 'help' };
  }
  const runner = dependencies.runner ?? await createOperatorRunner(dependencies);
  let result;
  if (options.mode === 'dry-run') result = await runner.dryRun({ batchSize: options.batchSize });
  else if (options.mode === 'execute') result = await runner.execute({ batchSize: options.batchSize, replay: options.replay });
  else if (options.mode === 'reconcile') result = await runner.reconcile({ batchSize: options.batchSize });
  else result = await runner.rollback();
  const report = await reportForOperator(result);
  if (!dependencies.quiet) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
};

const isDirectRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'error', ...redactError(error) })}\n`);
    process.exitCode = 1;
  });
}
