#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CURRENT_REF = 'HEAD';
const LOCAL_MAIN_REF = 'refs/heads/main';
const ORIGIN_MAIN_REF = 'refs/remotes/origin/main';

function runGit(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(cwd, args) {
  try {
    return runGit(cwd, args);
  } catch {
    return null;
  }
}

function splitCountOutput(output) {
  if (!output) {
    return { leftAhead: null, rightAhead: null };
  }
  const [leftRaw, rightRaw] = output.trim().split(/\s+/);
  return {
    leftAhead: Number.parseInt(leftRaw, 10),
    rightAhead: Number.parseInt(rightRaw, 10),
  };
}

export function parseAheadBehind(output) {
  const counts = splitCountOutput(output);
  return {
    leftAhead: Number.isFinite(counts.leftAhead) ? counts.leftAhead : null,
    rightAhead: Number.isFinite(counts.rightAhead) ? counts.rightAhead : null,
  };
}

function getAheadBehind(cwd, leftRef, rightRef) {
  return parseAheadBehind(tryGit(cwd, ['rev-list', '--left-right', '--count', `${leftRef}...${rightRef}`]));
}

function refInfo(cwd, ref) {
  const sha = tryGit(cwd, ['rev-parse', '--verify', ref]);
  return {
    exists: Boolean(sha),
    sha,
  };
}

function isAncestor(cwd, ancestor, descendant) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
    cwd,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function readFileIfExists(filePath) {
  if (!existsSync(filePath)) {
    return '';
  }
  return readFileSync(filePath, 'utf8');
}

export function parseFirebaseHostingTargets(firebasercText, firebaseJsonText) {
  let firebaserc = {};
  let firebaseJson = {};
  try {
    firebaserc = firebasercText ? JSON.parse(firebasercText) : {};
  } catch {
    firebaserc = {};
  }
  try {
    firebaseJson = firebaseJsonText ? JSON.parse(firebaseJsonText) : {};
  } catch {
    firebaseJson = {};
  }

  const project = firebaserc?.projects?.default ?? null;
  const hostingTargets = project ? firebaserc?.targets?.[project]?.hosting ?? {} : {};
  const targets = Object.entries(hostingTargets).map(([target, sites]) => ({
    target,
    sites: Array.isArray(sites) ? sites : [String(sites)],
  }));
  const hostingConfig = Array.isArray(firebaseJson.hosting) ? firebaseJson.hosting[0] : firebaseJson.hosting;

  return {
    project,
    targets,
    publicDir: hostingConfig?.public ?? null,
  };
}

export function buildWarnings(state) {
  const warnings = [];
  const { currentBranch, dirtyCount, localMainVsOriginMain, ancestry } = state;

  if (localMainVsOriginMain.leftAhead > 0 || localMainVsOriginMain.rightAhead > 0) {
    warnings.push(
      `local main and origin/main differ: local +${localMainVsOriginMain.leftAhead}, origin +${localMainVsOriginMain.rightAhead}`,
    );
  }

  if (ancestry.currentContainsOriginMain && !ancestry.currentContainsLocalMain && localMainVsOriginMain.leftAhead > 0) {
    warnings.push('current branch appears based on stale origin/main while local main has live-parity commits');
  }

  if (currentBranch.startsWith('backup/') || currentBranch.startsWith('wip/')) {
    warnings.push(`current branch ${currentBranch} is archive/WIP scoped, not a base for new feature work`);
  }

  if (dirtyCount > 0) {
    warnings.push(`worktree is dirty: ${dirtyCount} status entries`);
  }

  return warnings;
}

export function buildSafeWorktreeCommand({ hasSourceDrift }) {
  if (hasSourceDrift) {
    return 'resolve main drift first; temporary pre-reconcile base: git worktree add -b codex/<task-slug> ..\\luyentap-<task-slug> main';
  }
  return 'git fetch origin main && git worktree add -b codex/<task-slug> ..\\luyentap-<task-slug> origin/main';
}

function shortSha(sha) {
  return sha ? sha.slice(0, 12) : 'missing';
}

function formatAheadBehind(label, counts, leftLabel, rightLabel) {
  if (counts.leftAhead === null || counts.rightAhead === null) {
    return `${label}: unavailable`;
  }
  return `${label}: ${leftLabel} +${counts.leftAhead}, ${rightLabel} +${counts.rightAhead}`;
}

export function formatReport(state) {
  const hostingTargets = state.hosting.targets.length
    ? state.hosting.targets.map((entry) => `${entry.target} -> ${entry.sites.join(', ')}`).join('; ')
    : 'none';
  const dirtyLine = state.dirtyCount > 0 ? `dirty (${state.dirtyCount} status entries)` : 'clean';
  const warningLines = state.warnings.length
    ? state.warnings.map((warning) => `- ${warning}`).join('\n')
    : '- none';

  return [
    'Branch Doctor',
    `Worktree: ${state.worktree}`,
    `Current branch: ${state.currentBranch} @ ${shortSha(state.refs.current.sha)}`,
    `Local main: ${shortSha(state.refs.localMain.sha)}`,
    `Origin main: ${shortSha(state.refs.originMain.sha)}`,
    formatAheadBehind('Local main vs origin/main', state.localMainVsOriginMain, 'local', 'origin'),
    formatAheadBehind('Current vs local main', state.currentVsLocalMain, 'current', 'local'),
    formatAheadBehind('Current vs origin/main', state.currentVsOriginMain, 'current', 'origin'),
    `Dirty status: ${dirtyLine}`,
    `Firebase project: ${state.hosting.project ?? 'unknown'}`,
    `Hosting targets: ${hostingTargets}`,
    `Hosting public dir: ${state.hosting.publicDir ?? 'unknown'}`,
    'Warnings:',
    warningLines,
    `Recommended safe worktree command: ${state.recommendedCommand}`,
  ].join('\n');
}

export function collectState(cwd = process.cwd()) {
  const worktree = tryGit(cwd, ['rev-parse', '--show-toplevel']) ?? cwd;
  const currentBranch = tryGit(worktree, ['branch', '--show-current']) || 'HEAD';
  const statusOutput = tryGit(worktree, ['status', '--short']) ?? '';
  const dirtyCount = statusOutput ? statusOutput.split(/\r?\n/).filter(Boolean).length : 0;
  const refs = {
    current: refInfo(worktree, CURRENT_REF),
    localMain: refInfo(worktree, LOCAL_MAIN_REF),
    originMain: refInfo(worktree, ORIGIN_MAIN_REF),
  };
  const localMainVsOriginMain = getAheadBehind(worktree, LOCAL_MAIN_REF, ORIGIN_MAIN_REF);
  const currentVsLocalMain = getAheadBehind(worktree, CURRENT_REF, LOCAL_MAIN_REF);
  const currentVsOriginMain = getAheadBehind(worktree, CURRENT_REF, ORIGIN_MAIN_REF);
  const ancestry = {
    currentContainsLocalMain: refs.localMain.exists ? isAncestor(worktree, LOCAL_MAIN_REF, CURRENT_REF) : false,
    currentContainsOriginMain: refs.originMain.exists ? isAncestor(worktree, ORIGIN_MAIN_REF, CURRENT_REF) : false,
  };
  const hosting = parseFirebaseHostingTargets(
    readFileIfExists(path.join(worktree, '.firebaserc')),
    readFileIfExists(path.join(worktree, 'firebase.json')),
  );
  const sourceDrift =
    (localMainVsOriginMain.leftAhead ?? 0) > 0 || (localMainVsOriginMain.rightAhead ?? 0) > 0;
  const state = {
    worktree,
    currentBranch,
    dirtyCount,
    refs,
    localMainVsOriginMain,
    currentVsLocalMain,
    currentVsOriginMain,
    ancestry,
    hosting,
    recommendedCommand: buildSafeWorktreeCommand({ hasSourceDrift: sourceDrift }),
  };

  return {
    ...state,
    warnings: buildWarnings(state),
  };
}

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const strict = argv.includes('--strict');
  const state = collectState(cwd);
  console.log(formatReport(state));
  return strict && state.warnings.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
