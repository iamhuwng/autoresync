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
];

const geminiKeys = [
  'VITE_GEMINI_API_KEY_1',
  'VITE_GEMINI_API_KEY_2',
  'VITE_GEMINI_API_KEY_3',
  'VITE_GEMINI_API_KEY_4',
  'VITE_GEMINI_API_KEY_5',
];

const sharedEnvDir = path.resolve(
  process.env.LUYENTAP_ENV_DIR || path.join(os.homedir(), '.luyentap', 'env'),
);
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

const getEffectiveValues = async (filePath, trackedKeys = []) => {
  const values = new Map();

  if (filePath && await fileExists(filePath)) {
    const fileValues = parseEnvKeys(await readFile(filePath, 'utf8'));
    for (const [key, value] of fileValues) values.set(key, value);
  }

  for (const key of new Set([...requiredKeys, ...geminiKeys, ...trackedKeys])) {
    if (process.env[key]) values.set(key, process.env[key]);
  }

  return values;
};

const validate = (values) => {
  const missing = requiredKeys.filter((key) => !values.get(key));
  const hasGeminiKey = geminiKeys.some((key) => Boolean(values.get(key)));
  if (!hasGeminiKey) missing.push('VITE_GEMINI_API_KEY_1..5 (at least one)');
  return missing;
};

const resolveActiveEnvFile = async () => {
  if (await fileExists(sharedEnvFile)) return sharedEnvFile;
  if (await fileExists(repoEnvFile)) return repoEnvFile;
  return null;
};

const printStatus = async () => {
  const activeEnvFile = await resolveActiveEnvFile();
  const templateValues = await fileExists(envTemplateFile)
    ? parseEnvKeys(await readFile(envTemplateFile, 'utf8'))
    : new Map();
  const templateKeys = [...templateValues.keys()];
  const values = await getEffectiveValues(activeEnvFile, templateKeys);
  const missing = validate(values);
  const templateMissing = templateKeys.filter((key) => !values.get(key));

  console.log(`LuyenTap shared env directory: ${sharedEnvDir}`);
  console.log(`Active env file: ${activeEnvFile || '(none; checking process environment only)'}`);
  console.log(`Configured required keys: ${requiredKeys.length - missing.filter((key) => key.startsWith('VITE_FIREBASE_')).length}/${requiredKeys.length} Firebase`);
  console.log(`Gemini key configured: ${geminiKeys.some((key) => Boolean(values.get(key))) ? 'yes' : 'no'}`);

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
  if (await fileExists(sharedEnvFile)) {
    console.log(`Shared env already exists: ${sharedEnvFile}`);
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
