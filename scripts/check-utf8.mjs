#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.html',
  '.yml',
  '.yaml',
  '.svg',
  '.xml',
  '.ps1',
  '.sh',
  '.bat',
  '.cmd',
  '.editorconfig',
  '.gitattributes',
]);

const decoder = new TextDecoder('utf-8', { fatal: true });
const cwd = process.cwd();
const args = process.argv.slice(2);

function isTextFile(filePath) {
  const base = path.basename(filePath);
  if (TEXT_EXTENSIONS.has(base)) {
    return true;
  }

  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function listFromGit(command) {
  try {
    return execSync(command, { cwd, encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeCandidate(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

function getCandidates() {
  if (args.includes('--tracked')) {
    return listFromGit('git ls-files');
  }

  if (args.includes('--staged')) {
    return listFromGit('git diff --cached --name-only --diff-filter=ACMR');
  }

  return args.filter((arg) => !arg.startsWith('--'));
}

function checkUtf8(filePath) {
  const bytes = readFileSync(filePath);
  decoder.decode(bytes);
}

const candidates = getCandidates()
  .map(normalizeCandidate)
  .filter((filePath) => {
    try {
      return statSync(filePath).isFile() && isTextFile(filePath);
    } catch {
      return false;
    }
  });

if (candidates.length === 0) {
  console.log('No matching text files to check.');
  process.exit(0);
}

const failures = [];

for (const filePath of candidates) {
  try {
    checkUtf8(filePath);
  } catch (error) {
    failures.push({
      filePath: path.relative(cwd, filePath),
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

if (failures.length > 0) {
  console.error('UTF-8 check failed for:');
  for (const failure of failures) {
    console.error(`- ${failure.filePath}`);
  }
  console.error('');
  console.error('Convert these files to UTF-8 before further routine editing.');
  process.exit(1);
}

console.log(`UTF-8 check passed for ${candidates.length} text file(s).`);
