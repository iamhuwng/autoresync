import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const REQUIRED_FIREBASE_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const REQUIRED_BUILD_KEYS = [
  ...REQUIRED_FIREBASE_KEYS,
  'VITE_GOOGLE_DRIVE_CLIENT_ID',
];

const GEMINI_KEY_CANDIDATES = [
  'VITE_GOOGLE_API_KEY',
  'VITE_GEMINI_API_KEY_1',
  'VITE_GEMINI_API_KEY_2',
  'VITE_GEMINI_API_KEY_3',
  'VITE_GEMINI_API_KEY_4',
  'VITE_GEMINI_API_KEY_5',
];

export function getRepoRoot() {
  return repoRoot;
}

function parseWorktreeList(output) {
  const worktrees = [];
  let currentWorktree = null;

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      currentWorktree = null;
      continue;
    }

    if (line.startsWith('worktree ')) {
      currentWorktree = { path: line.slice('worktree '.length).trim() };
      worktrees.push(currentWorktree);
      continue;
    }

    if (currentWorktree && line.startsWith('branch ')) {
      currentWorktree.branch = line.slice('branch '.length).trim();
    }
  }

  return worktrees;
}

function getPrimaryWorktreeRoot() {
  try {
    const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const worktrees = parseWorktreeList(output);
    return worktrees.find((entry) => entry.branch === 'refs/heads/main')?.path
      ?? worktrees[0]?.path
      ?? repoRoot;
  } catch {
    return repoRoot;
  }
}

function getEnvFileCandidates(mode) {
  return [
    '.env',
    '.env.local',
    `.env.${mode}`,
    `.env.${mode}.local`,
  ];
}

function loadEnvFile(filePath, protectedKeys) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const parsed = parseDotenv(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(parsed)) {
    if (protectedKeys.has(key)) {
      continue;
    }
    process.env[key] = value;
  }

  return true;
}

function validateLoadedBuildEnv(loadedFiles) {
  const missingKeys = REQUIRED_BUILD_KEYS.filter((key) => {
    const value = process.env[key];
    return !value || !String(value).trim();
  });

  const hasGeminiKey = GEMINI_KEY_CANDIDATES.some((key) => {
    const value = process.env[key];
    return Boolean(value && String(value).trim());
  });

  const databaseUrl = process.env.VITE_FIREBASE_DATABASE_URL;
  let hasValidDatabaseUrl = false;
  if (databaseUrl) {
    try {
      // Throws when the value is not a valid absolute URL.
      new URL(databaseUrl);
      hasValidDatabaseUrl = true;
    } catch {
      hasValidDatabaseUrl = false;
    }
  }

  const issues = [];

  if (missingKeys.length > 0) {
    issues.push(`Missing required env vars: ${missingKeys.join(', ')}`);
  }

  if (!hasValidDatabaseUrl) {
    issues.push('VITE_FIREBASE_DATABASE_URL must be a valid absolute URL');
  }

  if (!hasGeminiKey) {
    issues.push('At least one Gemini API key must be present (VITE_GOOGLE_API_KEY or VITE_GEMINI_API_KEY_1-5)');
  }

  if (issues.length > 0) {
    const loadedFrom = loadedFiles.length > 0
      ? loadedFiles.map((filePath) => `  - ${path.relative(repoRoot, filePath) || path.basename(filePath)}`).join('\n')
      : '  - no env files found';

    throw new Error(
      `[build-env] Environment validation failed.\n`
      + `${issues.map((issue) => `- ${issue}`).join('\n')}\n\n`
      + `Loaded env files:\n${loadedFrom}\n\n`
      + `Expected one of these sources to exist before build/deploy:\n`
      + `- current worktree .env / .env.local / .env.production / .env.production.local\n`
      + `- main worktree env files discovered through git worktree metadata\n`
      + `- explicitly exported shell env vars\n`
    );
  }
}

export function prepareBuildEnvironment({ mode = 'production' } = {}) {
  const primaryWorktreeRoot = path.resolve(getPrimaryWorktreeRoot());
  const roots = Array.from(new Set([primaryWorktreeRoot, repoRoot]));
  const loadedFiles = [];
  const protectedKeys = new Set(Object.keys(process.env));

  for (const root of roots) {
    for (const fileName of getEnvFileCandidates(mode)) {
      const filePath = path.join(root, fileName);
      if (loadEnvFile(filePath, protectedKeys)) {
        loadedFiles.push(filePath);
      }
    }
  }

  validateLoadedBuildEnv(loadedFiles);

  if (loadedFiles.length > 0) {
    const relativeFiles = loadedFiles.map((filePath) => path.relative(repoRoot, filePath) || path.basename(filePath));
    console.log(`[build-env] Loaded env from ${relativeFiles.join(', ')}`);
  } else {
    console.log('[build-env] Using shell-provided env only');
  }

  return {
    loadedFiles,
    primaryWorktreeRoot,
    repoRoot,
  };
}

export function runNodeProgram(programPath, args = []) {
  execFileSync(process.execPath, [programPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
}
