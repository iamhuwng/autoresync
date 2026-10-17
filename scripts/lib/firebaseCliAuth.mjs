import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';

import { CHECKPOINT_PATH } from '../../cloudflare/src/upload-worker/notifications/migration/checkpoint-schema.mjs';

const USER_TOKEN_ENV_NAMES = Object.freeze([
  'FIREBASE_TOKEN',
  'FIREBASE_AUTH_TOKEN',
  'GOOGLE_OAUTH_ACCESS_TOKEN',
  'GCLOUD_ACCESS_TOKEN',
  'CLOUDSDK_AUTH_ACCESS_TOKEN',
  'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
  'GOOGLE_GHA_CREDS_PATH',
]);
const SAFE_PROJECT_ID = /^[a-z][a-z0-9-]{4,29}$/u;
const SERVICE_ACCOUNT_IDENTITY = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/u;

const operatorError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

const present = (value) => typeof value === 'string' && value.trim() !== '';

const safeCliBinary = (value) => present(value) && /^[A-Za-z0-9_+.:\\/ -]+$/u.test(value);

const shellSafeCommandPart = (value) => {
  const text = String(value);
  // Keep gcloud's `--impersonate-service-account=<email>` flag unquoted on
  // Windows. cmd.exe otherwise forwards the quotes as part of the positional
  // account argument when invoked through `/c`, causing gcloud to ignore the
  // flag. The remaining metacharacters stay quoted and caret-escaped.
  if (/^[A-Za-z0-9_+.:\\/@=\-]+$/u.test(text)) return text;
  return `"${text.replace(/["^&|<>%!]/gu, (character) => `^${character}`)}"`;
};

export const assertNoUserTokenEnvironment = (env = process.env) => {
  if (USER_TOKEN_ENV_NAMES.some((name) => present(env[name]))) {
    throw operatorError('operator_user_token_forbidden');
  }
};

export const loadOperatorCredential = async ({ env = process.env, readFileImpl = readFile } = {}) => {
  assertNoUserTokenEnvironment(env);
  const credentialPath = present(env.GOOGLE_APPLICATION_CREDENTIALS)
    ? env.GOOGLE_APPLICATION_CREDENTIALS.trim()
    : null;
  if (credentialPath) {
    let serviceAccountKey;
    try {
      serviceAccountKey = await readFileImpl(credentialPath, 'utf8');
    } catch {
      throw operatorError('operator_credentials_file_unreadable');
    }
    if (!present(serviceAccountKey)) throw operatorError('operator_credentials_file_empty');
    return { serviceAccountKey, credentialPath, source: 'adc-file' };
  }
  const serviceAccountKey = present(env.NOTIFICATION_MIGRATION_GOOGLE_SA_KEY)
    ? env.NOTIFICATION_MIGRATION_GOOGLE_SA_KEY.trim()
    : null;
  if (!serviceAccountKey) throw operatorError('operator_credentials_missing');
  return { serviceAccountKey, credentialPath: null, source: 'secret-env' };
};

export const prepareFirebaseCliCredential = async ({
  serviceAccountKey,
  credentialPath = null,
  mkdtempImpl = mkdtemp,
  writeFileImpl = writeFile,
  rmImpl = rm,
  tempRoot = tmpdir(),
} = {}) => {
  if (present(credentialPath)) {
    return { credentialPath, cleanup: async () => {} };
  }
  if (!present(serviceAccountKey)) throw operatorError('operator_credentials_missing');
  const directory = await mkdtempImpl(join(tempRoot, 'prd0062-38b4-firebase-cli-'));
  const filePath = join(directory, 'operator-service-account.json');
  try {
    await writeFileImpl(filePath, serviceAccountKey, { encoding: 'utf8', mode: 0o600 });
  } catch {
    try {
      await rmImpl(directory, { recursive: true, force: true });
    } catch {
      throw operatorError('operator_credentials_cleanup_failed');
    }
    throw operatorError('operator_credentials_file_unwritable');
  }
  let cleaned = false;
  return {
    credentialPath: filePath,
    cleanup: async () => {
      if (cleaned) return;
      try {
        await rmImpl(directory, { recursive: true, force: true });
      } catch {
        throw operatorError('operator_credentials_cleanup_failed');
      }
      cleaned = true;
    },
  };
};

const runChild = ({ spawnImpl, command, args, options }) => new Promise((resolve, reject) => {
  let child;
  try {
    child = spawnImpl(command, args, options);
  } catch {
    reject(operatorError('firebase_cli_unavailable'));
    return;
  }
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  child.once('error', () => reject(operatorError('firebase_cli_unavailable')));
  child.once('close', (code, signal) => resolve({ code, signal }));
});

const runChildOutput = ({ spawnImpl, command, args, options, maxOutput = 4096 }) => new Promise((resolve, reject) => {
  let child;
  try {
    child = spawnImpl(command, args, options);
  } catch {
    reject(operatorError('operator_cli_unavailable'));
    return;
  }
  let stdout = '';
  let overflow = false;
  child.stdout?.on('data', (chunk) => {
    if (overflow) return;
    stdout += Buffer.from(chunk).toString('utf8');
    if (stdout.length > maxOutput) overflow = true;
  });
  child.stderr?.on('data', () => {});
  child.once('error', () => reject(operatorError('operator_cli_unavailable')));
  child.once('close', (code, signal) => resolve({ code, signal, stdout: overflow ? null : stdout }));
});

const buildCliInvocation = ({ cliBinary, cliArgs, childEnv }) => {
  if (process.platform !== 'win32') return { command: cliBinary, args: cliArgs, shell: false };
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const expectedComSpec = normalize(join(systemRoot, 'System32', 'cmd.exe'));
  const configuredComSpec = normalize(process.env.ComSpec || expectedComSpec);
  if (configuredComSpec.toLowerCase() !== expectedComSpec.toLowerCase()) {
    throw operatorError('firebase_cli_shell_invalid');
  }
  childEnv.ComSpec = configuredComSpec;
  return {
    command: configuredComSpec,
    args: ['/d', '/s', '/c', [cliBinary, ...cliArgs].map(shellSafeCommandPart).join(' ')],
    shell: false,
  };
};

export const runFirebaseCliPreflight = async ({
  projectId,
  credentialPath,
  cliBinary = 'firebase',
  env = process.env,
  spawnImpl = nodeSpawn,
  mkdtempImpl = mkdtemp,
  rmImpl = rm,
  tempRoot = tmpdir(),
  cwd = process.cwd(),
} = {}) => {
  assertNoUserTokenEnvironment(env);
  if (!SAFE_PROJECT_ID.test(projectId)) throw operatorError('operator_project_invalid');
  if (!present(credentialPath)) throw operatorError('operator_credentials_missing');
  if (!safeCliBinary(cliBinary)) throw operatorError('firebase_cli_binary_invalid');

  const isolatedConfig = await mkdtempImpl(join(tempRoot, 'prd0062-38b4-firebase-cli-config-'));
  const childEnv = { ...env, GOOGLE_APPLICATION_CREDENTIALS: credentialPath };
  for (const name of USER_TOKEN_ENV_NAMES) delete childEnv[name];
  for (const name of Object.keys(childEnv)) {
    if (name.startsWith('NOTIFICATION_MIGRATION_')) delete childEnv[name];
  }
  delete childEnv.FIREBASE_CONFIG;
  delete childEnv.FIREBASE_DB_URL;
  delete childEnv.FIREBASE_PROJECT_ID;
  delete childEnv.FIREBASE_CLI_BIN;
  childEnv.GOOGLE_APPLICATION_CREDENTIALS = credentialPath;
  // Firebase CLI otherwise reads a persisted interactive login from its
  // configstore. Isolate that store so only the deployment service account can
  // authenticate this preflight.
  childEnv.APPDATA = isolatedConfig;
  childEnv.LOCALAPPDATA = isolatedConfig;
  childEnv.XDG_CONFIG_HOME = isolatedConfig;
  childEnv.HOME = isolatedConfig;

  try {
    const cliArgs = [
      '--project', projectId,
      '--json',
      '--non-interactive',
      'database:get', `/${CHECKPOINT_PATH}`,
    ];
    const invocation = buildCliInvocation({ cliBinary, cliArgs, childEnv });
    const result = await runChild({
      spawnImpl,
      command: invocation.command,
      args: invocation.args,
      options: {
        cwd,
        env: childEnv,
        shell: invocation.shell,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    });
    if (result.code !== 0) throw operatorError('firebase_cli_operator_auth_failed');
    return { authenticated: true, source: 'firebase-cli-adc', checkpointPath: CHECKPOINT_PATH };
  } finally {
    await rmImpl(isolatedConfig, { recursive: true, force: true }).catch(() => {});
  }
};

export const createGcloudAccessTokenProvider = ({
  projectId,
  serviceAccount,
  cliBinary = 'gcloud',
  env = process.env,
  spawnImpl = nodeSpawn,
  cwd = process.cwd(),
  tokenLifetimeMs = 3_600_000,
} = {}) => {
  assertNoUserTokenEnvironment(env);
  if (!SAFE_PROJECT_ID.test(projectId)) throw operatorError('operator_project_invalid');
  if (!SERVICE_ACCOUNT_IDENTITY.test(serviceAccount)) throw operatorError('operator_identity_invalid');
  if (!safeCliBinary(cliBinary)) throw operatorError('gcloud_cli_binary_invalid');
  if (!Number.isSafeInteger(tokenLifetimeMs) || tokenLifetimeMs < 60_000) {
    throw operatorError('gcloud_token_lifetime_invalid');
  }

  let cachedToken = null;
  let tokenExpiresAt = 0;
  return async () => {
    if (cachedToken && Date.now() < tokenExpiresAt - 300_000) {
      return { token: cachedToken, expiresIn: Math.max(60_000, tokenExpiresAt - Date.now()) / 1000 };
    }
    const childEnv = { ...env };
    for (const name of USER_TOKEN_ENV_NAMES) delete childEnv[name];
    for (const name of Object.keys(childEnv)) {
      if (name.startsWith('NOTIFICATION_MIGRATION_')) delete childEnv[name];
    }
    delete childEnv.GOOGLE_APPLICATION_CREDENTIALS;
    delete childEnv.FIREBASE_CONFIG;
    delete childEnv.FIREBASE_DB_URL;
    delete childEnv.FIREBASE_PROJECT_ID;
    delete childEnv.CLOUDSDK_AUTH_ACCESS_TOKEN_FILE;
    delete childEnv.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE;
    delete childEnv.CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT;
    childEnv.CLOUDSDK_CORE_DISABLE_PROMPTS = '1';
    childEnv.CLOUDSDK_CORE_PROJECT = projectId;
    const cliArgs = [
      'auth',
      'print-access-token',
      `--impersonate-service-account=${serviceAccount}`,
      '--quiet',
    ];
    const invocation = buildCliInvocation({ cliBinary, cliArgs, childEnv });
    const result = await runChildOutput({
      spawnImpl,
      command: invocation.command,
      args: invocation.args,
      options: {
        cwd,
        env: childEnv,
        shell: invocation.shell,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    });
    const token = result.code === 0 && typeof result.stdout === 'string' ? result.stdout.trim() : '';
    if (result.code !== 0 || token.length < 20 || /\s/u.test(token)) {
      throw operatorError('gcloud_operator_auth_failed');
    }
    cachedToken = token;
    tokenExpiresAt = Date.now() + tokenLifetimeMs;
    return { token, expiresIn: tokenLifetimeMs / 1000 };
  };
};

export { USER_TOKEN_ENV_NAMES };
