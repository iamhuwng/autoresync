import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { HARNESS_CONTRACT } from './contract.mjs';

const CLASSIFICATIONS = new Set(HARNESS_CONTRACT.classifications);
const PHASES = new Set(['doctor', 'collection', 'execution']);
const PRODUCT_COUNT_NAMES = ['executed', 'passed', 'failed', 'skipped'];
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const isFullSha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/iu.test(value);
const isHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value);

function parseArguments(argv) {
  const result = { expectCommit: null, expectClean: false, sidecars: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--expect-clean') result.expectClean = true;
    else if (value === '--expect-commit') {
      result.expectCommit = argv[index + 1] ?? null;
      index += 1;
    } else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`);
    else result.sidecars.push(path.resolve(value));
  }
  if (!isFullSha(result.expectCommit)) throw new Error('--expect-commit requires one full 40-character commit SHA');
  if (!result.sidecars.length) throw new Error('at least one evidence sidecar is required');
  return result;
}

function collectionInvocation(invocation) {
  const [command, ...rest] = invocation.arguments;
  return invocation.tool === 'playwright' && command === 'test' && rest.includes('--list');
}

function canonicalInvocationCommand(invocation) {
  if (invocation.tool === 'doctor') return ['node', 'scripts/harness/run-tool.mjs', '--doctor', invocation.project, ...invocation.arguments];
  return ['node', 'scripts/harness/run-tool.mjs', invocation.tool, invocation.project, ...invocation.arguments];
}

function protectedPathValid(state, label, errors) {
  if (!state || typeof state !== 'object') {
    errors.push(`${label} is missing`);
    return;
  }
  if (!['absent', 'file', 'directory', 'link', 'other'].includes(state.kind)) errors.push(`${label}.kind is invalid`);
  if (state.kind === 'file' && !isHash(state.sha256)) errors.push(`${label}.sha256 is invalid`);
  if (state.kind === 'link' && (typeof state.target !== 'string' || typeof state.resolvedTarget !== 'string')) errors.push(`${label} link target is incomplete`);
}

function validateSidecar(sidecar, options) {
  const errors = [];
  let raw;
  let evidence;
  try {
    raw = fs.readFileSync(sidecar);
    evidence = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    return { path: sidecar, sha256: null, authoritative: null, errors: [`unreadable JSON: ${error.message}`] };
  }
  if (evidence?.harness?.name !== HARNESS_CONTRACT.name || evidence.harness.version !== HARNESS_CONTRACT.version || evidence.harness.protocolVersion !== HARNESS_CONTRACT.protocolVersion) errors.push('harness version/protocol mismatch');
  if (!evidence.invocation || typeof evidence.invocation.cwd !== 'string' || typeof evidence.invocation.project !== 'string' || typeof evidence.invocation.tool !== 'string' || !Array.isArray(evidence.invocation.command) || !Array.isArray(evidence.invocation.arguments)) errors.push('invocation provenance is incomplete');
  else if (JSON.stringify(evidence.invocation.command) !== JSON.stringify(canonicalInvocationCommand(evidence.invocation))) errors.push('invocation command is not canonical');
  if (!evidence.source || !isFullSha(evidence.source.commit) || typeof evidence.source.dirty !== 'boolean' || !isHash(evidence.source.dirtyFingerprint)) errors.push('source provenance is incomplete');
  else {
    if (evidence.source.commit !== options.expectCommit) errors.push('source commit does not match --expect-commit');
    if (options.expectClean && evidence.source.dirty) errors.push('source is dirty but --expect-clean was required');
  }
  if (!CLASSIFICATIONS.has(evidence.classification)) errors.push('classification is not stable');
  if (!Number.isInteger(evidence.exitCode) || evidence.exitCode < 0) errors.push('exitCode is invalid');
  if (evidence.classification === 'completed' && (evidence.exitCode !== 0 || evidence.failureCode !== null)) errors.push('completed evidence must have exitCode 0 and no failureCode');
  if (evidence.classification === 'product_failure' && (evidence.exitCode === 0 || evidence.failureCode !== null)) errors.push('product_failure evidence must have a nonzero exitCode and no failureCode');
  if (evidence.classification === 'zero_tests_collected' && (evidence.exitCode === 0 || evidence.failureCode !== 'ZERO_TESTS_COLLECTED')) errors.push('zero_tests_collected evidence must have a nonzero exitCode and ZERO_TESTS_COLLECTED failureCode');
  if (evidence.classification.startsWith('harness_') && (evidence.exitCode === 0 || typeof evidence.failureCode !== 'string' || !evidence.failureCode)) errors.push('harness failure evidence must have a nonzero exitCode and failureCode');
  if (!evidence.proof || !PHASES.has(evidence.proof.phase) || !evidence.proof.counts || typeof evidence.proof.counts !== 'object') errors.push('proof is incomplete');
  else {
    for (const name of ['collected', ...PRODUCT_COUNT_NAMES]) {
      const value = evidence.proof.counts[name];
      if (value !== null && (!Number.isInteger(value) || value < 0)) errors.push(`proof.counts.${name} is invalid`);
    }
    if (evidence.proof.phase === 'doctor' && evidence.invocation?.tool !== 'doctor') errors.push('doctor proof does not match invocation');
    if (evidence.proof.phase === 'collection') {
      if (!collectionInvocation(evidence.invocation)) errors.push('collection proof does not match an explicit list-only invocation');
      if (evidence.classification === 'completed' && (!Number.isInteger(evidence.proof.counts.collected) || evidence.proof.counts.collected < 0)) errors.push('completed collection proof requires a collected count');
      for (const name of PRODUCT_COUNT_NAMES) if (evidence.proof.counts[name] !== null && evidence.proof.counts[name] !== 0) errors.push(`collection proof must not report ${name} product count`);
    }
    if (evidence.proof.phase === 'execution' && collectionInvocation(evidence.invocation)) errors.push('list-only invocation cannot claim execution proof');
    if (evidence.proof.phase === 'execution') {
      const executionCounts = ['executed', ...PRODUCT_COUNT_NAMES].map((name) => evidence.proof.counts[name]);
      if (executionCounts.some((value) => value !== null)) {
        if (executionCounts.some((value) => !Number.isInteger(value) || value < 0)) errors.push('execution proof counts must be complete nonnegative integers');
        else if (evidence.proof.counts.executed !== evidence.proof.counts.passed + evidence.proof.counts.failed + evidence.proof.counts.skipped) errors.push('execution proof counts are internally inconsistent');
        else if (evidence.proof.counts.collected !== null && evidence.proof.counts.collected < evidence.proof.counts.executed) errors.push('execution proof collected count is smaller than executed count');
      }
    }
  }
  const protectedState = evidence.protectedState;
  if (!protectedState || typeof protectedState !== 'object') errors.push('protected state is missing');
  else {
    for (const point of ['before', 'after']) {
      const state = protectedState[point];
      if (!state || typeof state !== 'object') errors.push(`protected state ${point} is missing`);
      else {
        protectedPathValid(state.packageJson, `protectedState.${point}.packageJson`, errors);
        protectedPathValid(state.packageLock, `protectedState.${point}.packageLock`, errors);
        protectedPathValid(state.nodeModules, `protectedState.${point}.nodeModules`, errors);
      }
    }
    const unchanged = JSON.stringify(protectedState.before) === JSON.stringify(protectedState.after);
    const mutationObserved = !unchanged;
    const protectedStateFailure = evidence.classification === 'harness_transport_failure' && evidence.failureCode === 'PROTECTED_STATE_CHANGED';
    if (mutationObserved && !protectedStateFailure) errors.push('protected state mutation was observed without the stable harness failure classification');
    if (!mutationObserved && evidence.failureCode === 'PROTECTED_STATE_CHANGED') errors.push('protected-state failure code requires observed mutation');
  }
  return {
    path: sidecar,
    sha256: sha256(raw),
    authoritative: {
      harness: evidence.harness,
      invocation: evidence.invocation,
      source: evidence.source,
      proof: evidence.proof,
      protectedState: evidence.protectedState,
      classification: evidence.classification,
      failureCode: evidence.failureCode,
      exitCode: evidence.exitCode,
    },
    errors,
  };
}

let options;
let argumentError = null;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  argumentError = error.message;
  options = { expectCommit: null, expectClean: false, sidecars: [] };
}
const sidecars = options.sidecars.map((sidecar) => validateSidecar(sidecar, options));
const errors = [...(argumentError ? [argumentError] : []), ...sidecars.flatMap((sidecar) => sidecar.errors.map((error) => `${sidecar.path}: ${error}`))];
const receipt = {
  verification: 'harness-evidence-v1',
  valid: errors.length === 0,
  expected: { commit: options.expectCommit, clean: options.expectClean },
  sidecars: sidecars.map(({ errors: _errors, ...sidecar }) => sidecar),
};
process.stdout.write(`${JSON.stringify(receipt)}\n`);
for (const error of errors) process.stderr.write(`evidence validation: ${error}\n`);
process.exitCode = errors.length ? 1 : 0;
