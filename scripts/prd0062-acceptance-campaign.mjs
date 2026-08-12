#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPrd0062AcceptanceMatrix } from './lib/prd0062-acceptance-matrix.mjs';

export const CAMPAIGN_ID = 'prd0062-acceptance';
export const CLEANUP_ROOT = 'prd0062_acceptance/';
export const ARTIFACT_ROOT = 'artifacts/prd0062-acceptance/';
export const SEED = 'prd0062-acceptance-seed-v1';
export const ACCEPTED_127_COMMIT = '66b63ba733e8532ed6e4c9aa284cef27d00a4fb9';
export const ACCEPTED_126_COMMIT = '2b60ead5ad8cf9e75f291cf4453b2f791dd5c5a2';
export const ACCEPTED_127_MATRIX_SHA256 = '58a05195419ee7f2df7626b24376615395539bedf6a93a2d05ea733bf7ddfea4';
export const ACCEPTED_127_FIXTURE_MANIFEST_PATH = 'scripts/fixtures/prd0062-51a-acceptance-fixture-manifest.json';
export const ACCEPTED_127_FIXTURE_MANIFEST_SHA256 = 'dad602b1d2558a9c4a54bc7ee1cf40e8df54d1e38c38e8d8c8843b0fdbbfb9b0';
export const FEATURE_GATE_TEMPLATE_PATH = 'documentation/tasks/PRD0062/evidence/126-bounded-pilot-scope.template.json';
export const FEATURE_GATE_TEMPLATE_SHA256 = 'bb7ee79cb3b71e19b381dea843a5d78457a28677b386c7529b667bebe3a65406';

export const TRUSTED_WORKER_CONFIG_PATHS = Object.freeze([
  'cloudflare/src/upload-worker/book-activity-authoring/worker.ts',
  'cloudflare/src/upload-worker/book-source/worker.ts',
  'cloudflare/src/book-source-worker/control-host.ts',
  'cloudflare/src/book-source-worker/control-worker.ts',
  'cloudflare/src/book-source-worker/reconciliation-worker.ts',
  'cloudflare/src/upload-worker/book-assembly/worker.ts',
  'cloudflare/src/upload-worker/book-assembly/publication-route-handlers.ts',
  'cloudflare/src/upload-worker/book-delivery/worker.ts',
  'cloudflare/src/upload-worker/book-homework/worker.ts',
  'cloudflare/src/upload-worker/book-runtime/worker.ts',
  'cloudflare/src/upload-worker/book-runtime-launch/worker.ts',
  'cloudflare/src/upload-worker/book-router.ts',
  'cloudflare/src/upload-worker/book-route-handlers.ts',
  'cloudflare/src/book-pilot-scope.ts',
  'src/config/bookActivityRolloutGates.ts',
]);

export const ACCOUNTS = Object.freeze({
  teacher: Object.freeze({
    email: 'teacher@test.com',
    login: 'built-in dev quick-login: Teacher',
    port: 5173,
  }),
  student: Object.freeze({
    email: 'student@test.com',
    login: 'built-in dev quick-login: Student',
    port: 5174,
  }),
});

const CASE_IDS = Object.freeze([
  'AC-TA-001',
  'AC-TA-002',
  'AC-TU-001',
  'AC-TR-001',
  'AC-SR-001',
  'AC-AD-001',
  'AC-SC-001',
  'AC-LR-001',
]);

const hash = (value) => createHash('sha256').update(value).digest('hex');
const stableSeed = (caseId, fixtureId) => `${SEED}|${caseId}|${fixtureId}`;
const casePath = (caseId) => caseId.toLowerCase().replaceAll('_', '-');

const git = (repoRoot, args) => execFileSync('git', ['-C', repoRoot, ...args], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

const fileSha256 = (repoRoot, relativePath) => hash(readFileSync(path.join(repoRoot, relativePath)));

export const buildTrustedWorkerConfigManifest = (repoRoot = process.cwd()) => {
  const files = TRUSTED_WORKER_CONFIG_PATHS.map((relativePath) => Object.freeze({
    path: relativePath,
    sha256: fileSha256(repoRoot, relativePath),
  }));
  return Object.freeze({
    algorithm: 'sha256(JSON.stringify(ordered [{path, sha256}] entries))',
    paths: Object.freeze(files),
    sha256: hash(JSON.stringify(files)),
  });
};

export const buildFixture = (matrix, caseId) => {
  const row = matrix.cases.find((candidate) => candidate.id === caseId);
  if (!row) throw new Error(`prd0062_acceptance_case_unknown:${caseId}`);
  const fixture = matrix.fixtures.find((candidate) => candidate.id === row.fixtureId);
  if (!fixture) throw new Error(`prd0062_acceptance_fixture_unknown:${row.fixtureId}`);
  const digest = hash(stableSeed(caseId, row.fixtureId));
  const root = `${CLEANUP_ROOT}${casePath(caseId)}`;
  const artifactRoot = `${ARTIFACT_ROOT}${caseId}/<execution-id>`;
  return Object.freeze({
    caseId,
    ownerTicket: row.ownerTicket,
    fixtureId: row.fixtureId,
    sourceId: fixture.sourceId,
    sourceTitle: fixture.sourceTitle,
    seed: stableSeed(caseId, row.fixtureId),
    checksum: digest,
    ids: Object.freeze({
      cleanupRoot: root,
      artifactRoot,
      bookId: `book-${digest.slice(0, 12)}`,
      unitId: `unit-${digest.slice(12, 24)}`,
      activityId: `activity-${digest.slice(24, 36)}`,
      activityVersionId: `activity-${digest.slice(24, 36)}-v1`,
      sourceVersionId: `source-${digest.slice(36, 48)}`,
      assignmentId: `assignment-${digest.slice(0, 12)}`,
      entitlementId: `entitlement-${digest.slice(12, 24)}`,
      operationId: `operation-${digest.slice(24, 36)}`,
    }),
    cleanupTargets: Object.freeze([
      `${root}/book`,
      `${root}/source`,
      `${root}/assignment`,
      `${root}/runtime`,
      `${root}/recovery`,
    ]),
  });
};

export const assertScopedCleanup = (target, cleanupRoot = CLEANUP_ROOT) => {
  const normalizedTarget = String(target).replaceAll('\\', '/');
  const normalizedRoot = String(cleanupRoot).replaceAll('\\', '/').replace(/\/+$/u, '');
  if (!normalizedTarget || normalizedTarget.includes('..')
    || !normalizedTarget.startsWith(`${normalizedRoot}/`)) {
    throw new Error(`prd0062_acceptance_cleanup_scope_denied:${target}`);
  }
  return normalizedTarget;
};

export const buildSetupPlan = (repoRoot = process.cwd()) => {
  const matrix = loadPrd0062AcceptanceMatrix(repoRoot);
  const fixtures = CASE_IDS.map((caseId) => buildFixture(matrix, caseId));
  const fixtureManifest = JSON.parse(readFileSync(path.join(repoRoot, ACCEPTED_127_FIXTURE_MANIFEST_PATH), 'utf8'));
  return Object.freeze({
    schemaVersion: 1,
    campaign: CAMPAIGN_ID,
    seed: SEED,
    repository: {
      root: repoRoot,
      head: git(repoRoot, ['rev-parse', 'HEAD']),
      branch: (() => {
        try { return git(repoRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']); } catch { return 'DETACHED'; }
      })(),
    },
    tuple: {
      appCommit: git(repoRoot, ['rev-parse', 'HEAD']),
      applicationBaselineBefore126: 'f710653948462bcd948d59a7db007bc2a870e987',
      generatedRules: {
        path: 'database.rules.json',
        sha256: fileSha256(repoRoot, 'database.rules.json'),
      },
      assembledRulesSuite: {
        path: 'scripts/prd0062-118-assembled-rules-matrix.mjs',
        sha256: fileSha256(repoRoot, 'scripts/prd0062-118-assembled-rules-matrix.mjs'),
        version: 'prd0062-118-assembled-rules-matrix-v4',
      },
      activation126: {
        status: 'ENGINEERING_PROOF_ONLY_NOT_APPROVED_OR_ACTIVE',
        commit: ACCEPTED_126_COMMIT,
        activationIdentitySha256: null,
      },
      featureGateTemplate: {
        path: FEATURE_GATE_TEMPLATE_PATH,
        sha256: fileSha256(repoRoot, FEATURE_GATE_TEMPLATE_PATH),
        expectedSha256: FEATURE_GATE_TEMPLATE_SHA256,
      },
      trustedWorkerConfigManifest: buildTrustedWorkerConfigManifest(repoRoot),
      acceptance127: {
        status: 'PRIMARY_ACCEPTED_DEFINITION_ONLY',
        commit: ACCEPTED_127_COMMIT,
        matrixSha256: ACCEPTED_127_MATRIX_SHA256,
        fixtureManifestPath: ACCEPTED_127_FIXTURE_MANIFEST_PATH,
        fixtureManifestSha256: ACCEPTED_127_FIXTURE_MANIFEST_SHA256,
      },
    },
    roles: {
      teacher: { ...ACCOUNTS.teacher, origin: 'http://localhost:5173' },
      student: { ...ACCOUNTS.student, origin: 'http://localhost:5174' },
    },
    fixtures,
    acceptedFixtureManifest: {
      path: ACCEPTED_127_FIXTURE_MANIFEST_PATH,
      sha256: fileSha256(repoRoot, ACCEPTED_127_FIXTURE_MANIFEST_PATH),
      manifestVersion: fixtureManifest.manifestVersion,
      entryCount: fixtureManifest.entries.length,
    },
    cleanup: {
      root: CLEANUP_ROOT,
      policy: 'plan-only until an owned execution writes disposable fixture state',
      targets: fixtures.flatMap(({ caseId, cleanupTargets }) => cleanupTargets.map((target) => ({
        caseId,
        target: assertScopedCleanup(target),
      }))),
    },
    executionPolicy: {
      mode2PositiveActivation: 'HOLD_UNTIL_126_APPROVED_AND_ACTIVE',
      acceptanceCases: 'PROVISIONAL_UNTIL_126_APPROVED_AND_ACTIVE',
      remoteMutation: 'FORBIDDEN',
      deployment: 'FORBIDDEN',
      push: 'FORBIDDEN',
      pullOrFetch: 'NOT_RUN',
      ticket134: 'OUT_OF_SCOPE',
    },
    harness: {
      arm64Status: 'AVAILABLE_IN_BRANCH',
      missingPaths: [],
      presentPaths: [
        'scripts/harness/run-tool.mjs',
        'scripts/harness/run-x64.ps1',
        'scripts/validate-prd0062-acceptance-matrix.mjs',
        'scripts/fixtures/prd0062-51a-acceptance-fixture-manifest.json',
        'scripts/fixtures/prd0062-51a-acceptance-fixtures.mjs',
        'scripts/cleanup-prd0062-acceptance-fixtures.mjs',
        'e2e/prd0062-acceptance-fixtures.mjs',
        'e2e/prd0062-teacher-authoring-assignment.fixture.mjs',
        'e2e/prd0062-teacher-updates-replacement-results.fixture.mjs',
        'e2e/prd0062-student-runtime-persistence.fixture.mjs',
        'e2e/prd0062-student-accessibility-device.fixture.mjs',
        'e2e/prd0062-student-runtime-persistence.spec.ts',
        'playwright.prd0062-acceptance.config.mjs',
        'e2e/prd0062-teacher-authoring-assignment.spec.ts',
        'e2e/prd0062-teacher-updates-replacement-results.spec.ts',
        'e2e/prd0062-student-accessibility-device.spec.ts',
        'src/__tests__/prd0062-legacy-backup-recovery.test.ts',
        'package.json#scripts.test:prd0062:legacy-backup-recovery',
      ],
      dependencyStatus: {
        nodeModules: existsSync(path.join(repoRoot, 'node_modules')),
        firebaseCli: existsSync(path.join(repoRoot, 'node_modules/firebase-tools/lib/bin/firebase.js')),
        vitestCli: existsSync(path.join(repoRoot, 'node_modules/vitest/vitest.mjs')),
      },
      acceptanceCli: 'PRESENT: scripts/validate-prd0062-acceptance-matrix.mjs',
      downstreamFixtureModules: 'PRESENT: accepted #127 fixture modules and campaign consumer specs',
    },
  });
};

const printUsage = () => {
  console.error('Usage: node scripts/prd0062-acceptance-campaign.mjs --setup-plan|--cleanup-plan|--manifest');
};

const main = (argv) => {
  const plan = buildSetupPlan();
  if (argv.length !== 1 || !['--setup-plan', '--cleanup-plan', '--manifest'].includes(argv[0])) {
    printUsage();
    return 2;
  }
  if (argv[0] === '--cleanup-plan') {
    console.log(JSON.stringify(plan.cleanup, null, 2));
  } else {
    console.log(JSON.stringify(plan, null, 2));
  }
  return 0;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
