import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { HARNESS_CONTRACT } from './contract.mjs';

const CLASSIFICATIONS = new Set(HARNESS_CONTRACT.classifications);
const PHASES = new Set(['doctor', 'collection', 'execution']);
const PRODUCT_COUNT_NAMES = ['executed', 'passed', 'failed', 'skipped'];
const TIMING_PHASES = ['dependencyPreparation', 'capabilityPreparation', 'sourceMirror', 'toolExecution', 'finalization'];
const MAX_TIMEOUT_OUTPUT_TAIL_BYTES = 256 * 1024;
const TIMEOUT_ARTIFACT_ENVELOPE_BYTES = Buffer.byteLength('--- stdout tail ---\n') + Buffer.byteLength('\n--- stderr tail ---\n');
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const isFullSha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/iu.test(value);
const isHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value);
const isTimestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isInside = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

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

function lifecycleAndTimingValid(evidence, errors) {
  const lifecycle = evidence.lifecycle;
  if (!lifecycle || typeof lifecycle !== 'object') {
    errors.push('evidence lifecycle is missing');
  } else {
    if (lifecycle.status !== 'final') errors.push('evidence lifecycle is unfinished and cannot be accepted');
    if (!isTimestamp(lifecycle.startedAt) || !isTimestamp(lifecycle.updatedAt) || !isTimestamp(lifecycle.finalizedAt)) errors.push('evidence lifecycle timestamps are incomplete');
    else if (Date.parse(lifecycle.startedAt) > Date.parse(lifecycle.updatedAt) || lifecycle.updatedAt !== lifecycle.finalizedAt) errors.push('evidence lifecycle terminal timestamps are inconsistent');
  }
  const timings = evidence.phaseTimings;
  if (!timings || typeof timings !== 'object') {
    errors.push('phase timings are missing');
    return;
  }
  let previousEndedAt = null;
  for (const name of TIMING_PHASES) {
    const phase = timings[name];
    if (!phase || typeof phase !== 'object' || !['not_started', 'completed', 'aborted'].includes(phase.status)) {
      errors.push(`phase timing ${name} is incomplete`);
      continue;
    }
    if (phase.status === 'not_started') {
      if (phase.startedAt !== null || phase.endedAt !== null || phase.durationMs !== null) errors.push(`phase timing ${name} not_started state is inconsistent`);
      continue;
    }
    if (!isTimestamp(phase.startedAt) || !isTimestamp(phase.endedAt) || !Number.isInteger(phase.durationMs) || phase.durationMs < 0) {
      errors.push(`phase timing ${name} is invalid`);
      continue;
    }
    const startedAt = Date.parse(phase.startedAt);
    const endedAt = Date.parse(phase.endedAt);
    if (endedAt < startedAt || phase.durationMs !== endedAt - startedAt) errors.push(`phase timing ${name} duration is inconsistent`);
    if (lifecycle && isTimestamp(lifecycle.startedAt) && isTimestamp(lifecycle.finalizedAt) && (startedAt < Date.parse(lifecycle.startedAt) || endedAt > Date.parse(lifecycle.finalizedAt))) errors.push(`phase timing ${name} falls outside lifecycle bounds`);
    if (previousEndedAt !== null && startedAt < previousEndedAt) errors.push(`phase timing ${name} overlaps a prior phase`);
    previousEndedAt = endedAt;
  }
  if (timings.finalization?.status !== 'completed') errors.push('finalization timing is not completed');
  if (lifecycle && isTimestamp(lifecycle.startedAt) && isTimestamp(lifecycle.finalizedAt)) {
    if (Date.parse(lifecycle.finalizedAt) < Date.parse(lifecycle.startedAt)) errors.push('evidence lifecycle bounds are inconsistent');
    if (previousEndedAt !== null && Date.parse(lifecycle.finalizedAt) < previousEndedAt) errors.push('evidence lifecycle finalized before phase completion');
  }
}

function timeoutArtifactValid(evidence, errors) {
  const hasArtifact = evidence.timeoutOutputArtifact !== undefined && evidence.timeoutOutputArtifact !== null;
  const hasTimeoutOutputMaterial = hasArtifact || evidence.timeoutOutputArtifactFailure !== undefined;
  const timeoutSemantics = evidence.lifecycle?.status === 'final'
    && evidence.classification === 'harness_transport_failure'
    && evidence.exitCode === 124
    && evidence.failureCode === 'TOOL_TIMEOUT'
    && evidence.proof?.phase === 'execution';
  if (hasTimeoutOutputMaterial && !timeoutSemantics) errors.push('timeout output artifact is only valid for final TOOL_TIMEOUT transport evidence');
  if (evidence.failureCode !== 'TOOL_TIMEOUT') return;
  if (!timeoutSemantics) errors.push('TOOL_TIMEOUT evidence must be final harness_transport_failure exit 124 with execution proof');
  if (evidence.timeoutOutputArtifactFailure !== undefined && (!evidence.timeoutOutputArtifactFailure || evidence.timeoutOutputArtifactFailure.code !== 'TIMEOUT_OUTPUT_ARTIFACT_PUBLISH_FAILED' || !evidence.timeoutOutputArtifactFailure.systemError || typeof evidence.timeoutOutputArtifactFailure.systemError !== 'object')) errors.push('TOOL_TIMEOUT artifact publication failure facts are invalid');
  const artifact = evidence.timeoutOutputArtifact;
  if (!artifact || typeof artifact.path !== 'string' || !isHash(artifact.sha256) || !Number.isInteger(artifact.bytes) || artifact.bytes < 0) {
    errors.push('TOOL_TIMEOUT evidence lacks a valid output artifact reference');
    return;
  }
  if (!artifact.retainedTailBytes || !Number.isInteger(artifact.retainedTailBytes.stdout) || !Number.isInteger(artifact.retainedTailBytes.stderr) || artifact.retainedTailBytes.stdout < 0 || artifact.retainedTailBytes.stderr < 0 || artifact.retainedTailBytes.stdout > MAX_TIMEOUT_OUTPUT_TAIL_BYTES || artifact.retainedTailBytes.stderr > MAX_TIMEOUT_OUTPUT_TAIL_BYTES || artifact.bytes !== artifact.retainedTailBytes.stdout + artifact.retainedTailBytes.stderr + TIMEOUT_ARTIFACT_ENVELOPE_BYTES) errors.push('TOOL_TIMEOUT artifact retained-tail bounds are invalid');
  const storage = evidence.storage;
  if (!storage || !path.isAbsolute(storage.privateRoot || '') || !path.isAbsolute(storage.artifactRoot || '') || !path.isAbsolute(artifact.path)) {
    errors.push('TOOL_TIMEOUT artifact storage roots are invalid');
    return;
  }
  const privateRoot = path.resolve(storage.privateRoot);
  const artifactRoot = path.resolve(storage.artifactRoot);
  const artifactPath = path.resolve(artifact.path);
  if (!isInside(privateRoot, artifactRoot) || !isInside(artifactRoot, artifactPath)) {
    errors.push('TOOL_TIMEOUT artifact path escapes the recorded private harness root');
    return;
  }
  const runId = evidence.executionWorkspace?.identity;
  if (typeof runId !== 'string' || !runId || path.basename(artifactPath) !== `${runId}.tool-timeout.log`) errors.push('TOOL_TIMEOUT artifact filename is not bound to the execution workspace identity');
  try {
    const artifactRootMetadata = fs.lstatSync(artifactRoot);
    const artifactMetadata = fs.lstatSync(artifactPath);
    if (artifactRootMetadata.isSymbolicLink() || artifactMetadata.isSymbolicLink()) errors.push('TOOL_TIMEOUT artifact root or file is a symbolic-link/reparse path');
    if (!artifactMetadata.isFile()) errors.push('TOOL_TIMEOUT artifact is not a regular file');
    const realPrivateRoot = fs.realpathSync.native(privateRoot);
    const realArtifactRoot = fs.realpathSync.native(artifactRoot);
    const realArtifactPath = fs.realpathSync.native(artifactPath);
    if (!isInside(realPrivateRoot, realArtifactRoot) || !isInside(realArtifactRoot, realArtifactPath)) errors.push('TOOL_TIMEOUT artifact resolves outside the recorded private harness root');
    const raw = fs.readFileSync(realArtifactPath);
    if (raw.length !== artifact.bytes) errors.push('TOOL_TIMEOUT artifact byte length does not match evidence');
    if (sha256(raw) !== artifact.sha256) errors.push('TOOL_TIMEOUT artifact SHA-256 does not match evidence');
  } catch (error) {
    errors.push(`TOOL_TIMEOUT artifact is unreadable: ${error.message}`);
  }
}

function cachePublicationValid(evidence, errors) {
  const hasPublication = evidence.dependencyCachePublication !== undefined && evidence.dependencyCachePublication !== null;
  const publicationSemantics = evidence.lifecycle?.status === 'final'
    && evidence.classification === 'harness_preflight_failure'
    && evidence.failureCode === 'DEPENDENCY_CACHE_PUBLISH_FAILED'
    && Number.isInteger(evidence.exitCode)
    && evidence.exitCode !== 0;
  if (hasPublication && !publicationSemantics) errors.push('dependency cache publication facts are only valid for final dependency-cache preflight failure evidence');
  if (evidence.failureCode !== 'DEPENDENCY_CACHE_PUBLISH_FAILED') return;
  if (!publicationSemantics) errors.push('DEPENDENCY_CACHE_PUBLISH_FAILED evidence has invalid classification or exitCode');
  const publication = evidence.dependencyCachePublication;
  if (!publication || publication.operation !== 'staging_to_immutable_rename' || typeof publication.staging !== 'string' || !publication.staging || typeof publication.immutableRoot !== 'string' || !publication.immutableRoot || !publication.systemError || typeof publication.systemError !== 'object' || typeof publication.systemError.code !== 'string' || !publication.systemError.code || typeof publication.systemError.message !== 'string' || !publication.systemError.message || typeof publication.systemError.syscall !== 'string' || !publication.systemError.syscall) errors.push('dependency cache publication facts are incomplete');
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
  lifecycleAndTimingValid(evidence, errors);
  timeoutArtifactValid(evidence, errors);
  cachePublicationValid(evidence, errors);
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
      lifecycle: evidence.lifecycle,
      phaseTimings: evidence.phaseTimings,
      storage: evidence.storage,
      timeoutOutputArtifact: evidence.timeoutOutputArtifact ?? null,
      timeoutOutputArtifactFailure: evidence.timeoutOutputArtifactFailure ?? null,
      dependencyCachePublication: evidence.dependencyCachePublication ?? null,
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
