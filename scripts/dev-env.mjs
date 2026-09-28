import { constants as fsConstants } from 'node:fs';
import { access, chmod, copyFile, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_THCS_GEMMA_WORKER_URL',
];

const sharedEnvDir = path.resolve(
  process.env.LUYENTAP_ENV_DIR || path.join(os.homedir(), '.luyentap', 'env'),
);
const envFileNames = ['.env', '.env.local', '.env.development', '.env.development.local'];
const sharedEnvFile = path.join(sharedEnvDir, '.env');
const repoEnvFile = path.join(repoRoot, '.env');
const envTemplateFile = path.join(repoRoot, 'env.example.txt');
const legacyDesktopEnvFile = path.join(os.homedir(), 'Desktop', 'luyentap', '.env');

const fileExists = async (filePath) => {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const parseEnvKeys = (text) => {
  const values = new Map();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');
    values.set(key, value);
  }

  return values;
};

const getEffectiveValues = async (filePaths, trackedKeys = []) => {
  const values = new Map();

  for (const filePath of filePaths) {
    if (await fileExists(filePath)) {
      const fileValues = parseEnvKeys(await readFile(filePath, 'utf8'));
      for (const [key, value] of fileValues) values.set(key, value);
    }
  }

  for (const key of new Set([...requiredKeys, ...trackedKeys])) {
    if (process.env[key]) values.set(key, process.env[key]);
  }

  return values;
};

const validate = (values) => {
  const missing = requiredKeys.filter((key) => !values.get(key));
  const databaseUrl = values.get('VITE_FIREBASE_DATABASE_URL');
  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      const hostname = parsed.hostname.toLowerCase();
      const isFirebaseHost = hostname.endsWith('.firebaseio.com')
        || hostname.endsWith('.firebasedatabase.app');
      const isLocalEmulator = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
      if (!((parsed.protocol === 'https:' && isFirebaseHost)
        || (parsed.protocol === 'http:' && isLocalEmulator))) {
        missing.push('VITE_FIREBASE_DATABASE_URL (Firebase RTDB URL or local emulator URL required)');
      }
    } catch {
      missing.push('VITE_FIREBASE_DATABASE_URL (Firebase RTDB URL or local emulator URL required)');
    }
  }

  const workerUrl = values.get('VITE_THCS_GEMMA_WORKER_URL');
  if (workerUrl) {
    try {
      const parsed = new URL(workerUrl);
      if (
        parsed.protocol !== 'https:'
        || parsed.username
        || parsed.password
        || parsed.pathname !== '/'
        || parsed.search
        || parsed.hash
      ) {
        missing.push('VITE_THCS_GEMMA_WORKER_URL (exact HTTPS origin required)');
      }
    } catch {
      missing.push('VITE_THCS_GEMMA_WORKER_URL (exact HTTPS origin required)');
    }
  }
  return missing;
};

const resolveActiveEnvFiles = async () => {
  const sharedFiles = envFileNames.map((name) => path.join(sharedEnvDir, name));
  const repoFiles = envFileNames.map((name) => path.join(repoRoot, name));
  const sharedDirIsActive = (await Promise.all(sharedFiles.map(fileExists))).some(Boolean);
  const candidateFiles = sharedDirIsActive ? sharedFiles : repoFiles;
  return (await Promise.all(candidateFiles.map(async (filePath) => (
    await fileExists(filePath) ? filePath : null
  )))).filter(Boolean);
};

const printStatus = async () => {
  const activeEnvFiles = await resolveActiveEnvFiles();
  const templateValues = await fileExists(envTemplateFile)
    ? parseEnvKeys(await readFile(envTemplateFile, 'utf8'))
    : new Map();
  const templateKeys = [...templateValues.keys()];
  const values = await getEffectiveValues(activeEnvFiles, templateKeys);
  const missing = validate(values);
  const templateMissing = templateKeys.filter((key) => !values.get(key));

  console.log(`LuyenTap shared env directory: ${sharedEnvDir}`);
  console.log(`Active env file(s): ${activeEnvFiles.length > 0 ? activeEnvFiles.join(', ') : '(none; checking process environment only)'}`);
  console.log(`Configured required keys: ${requiredKeys.length - missing.length}/${requiredKeys.length}`);

  if (templateMissing.length > 0) {
    console.warn('Current env template keys not configured (feature-specific functionality may be unavailable):');
    for (const key of templateMissing) console.warn(`  - ${key}`);
  }

  if (missing.length > 0) {
    console.error('Missing required configuration keys:');
    for (const key of missing) console.error(`  - ${key}`);
    return false;
  }

  return true;
};

const bootstrap = async () => {
  if ((await Promise.all(envFileNames.map((name) => fileExists(path.join(sharedEnvDir, name))))).some(Boolean)) {
    console.log(`Shared env already exists in ${sharedEnvDir}`);
    return printStatus();
  }

  const fromIndex = process.argv.indexOf('--from');
  const explicitSource = fromIndex >= 0 ? process.argv[fromIndex + 1] : null;
  const candidates = [
    explicitSource ? path.resolve(explicitSource) : null,
    repoEnvFile,
    legacyDesktopEnvFile,
  ].filter(Boolean);

  let source = null;
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      source = candidate;
      break;
    }
  }

  if (!source) {
    console.error('No existing LuyenTap .env file was found to migrate.');
    console.error(`Create ${sharedEnvFile} from env.example.txt, or run:`);
    console.error('  npm run env:bootstrap -- --from C:\\path\\to\\existing\\.env');
    return false;
  }

  await mkdir(sharedEnvDir, { recursive: true, mode: 0o700 });
  await copyFile(source, sharedEnvFile, fsConstants.COPYFILE_EXCL);

  try {
    await chmod(sharedEnvFile, 0o600);
  } catch {
    // Windows ACLs are authoritative; chmod may be a no-op there.
  }

  const migratedValues = parseEnvKeys(await readFile(sharedEnvFile, 'utf8'));
  console.log(`Migrated ${migratedValues.size} environment keys to ${sharedEnvFile}.`);
  console.log(`Source retained unchanged: ${source}`);
  return printStatus();
};

const command = process.argv[2] || 'check';
let ok;

switch (command) {
  case 'bootstrap':
    ok = await bootstrap();
    break;
  case 'check':
  case 'ensure':
    ok = await printStatus();
    if (!ok && command === 'ensure') {
      console.error('\nRun `npm run env:bootstrap` once, then retry `npm run dev`.');
    }
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Usage: node scripts/dev-env.mjs <bootstrap|check|ensure> [--from <path>]');
    ok = false;
}

if (!ok) process.exitCode = 1;
