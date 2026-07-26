import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadAndValidateCoverageMatrix,
  validateCoverageMatrix,
} from '../lib/prd0062-activity-coverage/validator.mjs';
import { readCanonicalTaxonomyEvidence } from '../lib/prd0062-activity-coverage/canonical-taxonomy.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const matrixPath = path.join(rootDir, 'documentation/architecture/data/prd0062-activity-coverage.matrix.json');
const emptyRegistryPath = path.join(rootDir, 'scripts/__tests__/fixtures/prd0062-activity-coverage/empty-runtime-registration-manifest.json');

const matrix = async () => JSON.parse(await readFile(matrixPath, 'utf8'));
const registry = async () => JSON.parse(await readFile(emptyRegistryPath, 'utf8'));
const codes = (result) => new Set(result.issues.map((entry) => entry.code));

test('base matrix classifies every current researched type and accepts planned runtime rows', async () => {
  const result = await loadAndValidateCoverageMatrix({ rootDir });
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  const authority = await readCanonicalTaxonomyEvidence(rootDir);
  const matrixProfiles = new Set(result.rows.map((row) => `${row.profile.taxonomyId}/${row.profile.typeId}`));
  assert.equal(matrixProfiles.size, authority.reading.length + authority.listening.length);
  assert.ok(result.rows.length >= matrixProfiles.size);
});

test('validator rejects missing and invalid coverage fields', async () => {
  const base = await matrix();
  delete base.rows[0].accessibility;
  base.rows[1].support.state = 'supported-ish';
  base.rows[2].responseCodec = 'invented-codec';
  base.rows[3].interaction.variant = 'invented-variant';
  base.rows[4].profile.typeId = 'invented-profile';
  const result = await validateCoverageMatrix(base, { rootDir, registryManifest: await registry() });
  const found = codes(result);
  assert.ok(found.has('missing-field'));
  assert.ok(found.has('invalid-support-state'));
  assert.ok(found.has('unknown-codec'));
  assert.ok(found.has('unknown-variant'));
  assert.ok(found.has('unknown-profile'));
});

test('validator rejects removal of a researched answer-mode row', async () => {
  const base = await matrix();
  base.rows.splice(6, 1);
  const result = await validateCoverageMatrix(base, { rootDir, registryManifest: await registry() });
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('incomplete-canonical-row-set'));
});

test('validator rejects exact Activity schema source drift', async () => {
  const base = await matrix();
  base.canonicalSchema.source = 'src/types/other.ts';
  const result = await validateCoverageMatrix(base, { rootDir, registryManifest: await registry() });
  assert.ok(codes(result).has('schema-source-mismatch'));
});

test('validator rejects registry redirection before reading another manifest', async () => {
  const base = await matrix();
  base.registryManifest =
    'scripts/__tests__/fixtures/prd0062-activity-coverage/empty-runtime-registration-manifest.json';
  const direct = await validateCoverageMatrix(base, {
    rootDir,
    registryManifest: await registry(),
  });
  assert.ok(codes(direct).has('invalid-registry-path'));

  const redirected = await loadAndValidateCoverageMatrix({
    rootDir,
    registryPath: emptyRegistryPath,
  });
  assert.equal(redirected.ok, false);
  assert.ok(codes(redirected).has('invalid-registry-path'));
});

test('validator returns deterministic issues for malformed root and row shapes', async () => {
  const invalidRoot = await validateCoverageMatrix(null, {
    rootDir,
    registryManifest: await registry(),
  });
  assert.equal(invalidRoot.ok, false);
  assert.ok(codes(invalidRoot).has('invalid-record'));

  const base = await matrix();
  base.rows[0] = null;
  const invalidRow = await validateCoverageMatrix(base, {
    rootDir,
    registryManifest: await registry(),
  });
  assert.equal(invalidRow.ok, false);
  assert.ok(codes(invalidRow).has('invalid-record'));

  const invalidContext = await matrix();
  invalidContext.rows.find((row) => row.presentationMode === 'source-assisted')
    .contextRequirement.acceptedKinds = null;
  const contextResult = await validateCoverageMatrix(invalidContext, {
    rootDir,
    registryManifest: await registry(),
  });
  assert.equal(contextResult.ok, false);
  assert.ok(codes(contextResult).has('invalid-context'));
});

test('matrix keeps researched diagram, map-plan, and summary answer-mode variants distinct', async () => {
  const rows = (await matrix()).rows;
  const variantsFor = (taxonomyId, typeId) => rows
    .filter((row) => row.profile.taxonomyId === taxonomyId && row.profile.typeId === typeId)
    .map((row) => `${row.interaction.family}:${row.interaction.variant}`)
    .sort();
  assert.deepEqual(variantsFor('ielts-reading', 'diagram-labeling'), [
    'choice:diagram-label-choice',
    'text-entry:diagram-label-text',
  ]);
  assert.deepEqual(variantsFor('ielts-listening', 'listening-map-plan-labelling'), [
    'choice:map-plan-letter-choice',
    'text-entry:map-plan-typed',
  ]);
  assert.deepEqual(variantsFor('ielts-listening', 'listening-diagram-labelling'), [
    'choice:diagram-label-letter-choice',
    'text-entry:diagram-label-text',
  ]);
  assert.deepEqual(variantsFor('ielts-listening', 'listening-summary-completion'), [
    'choice:summary-dropdown-list',
    'text-entry:summary-blank',
  ]);
});

test('validator rejects duplicate profile variants, false presentation, missing approval, and evidence', async () => {
  const base = await matrix();
  base.rows[1].profile = structuredClone(base.rows[0].profile);
  base.rows[1].interaction = structuredClone(base.rows[0].interaction);
  base.rows[3].support.state = 'structurally-supported';
  base.rows[3].presentationMode = 'source-assisted';
  base.rows[4].support.state = 'approved-deferral';
  delete base.rows[4].support.approvalReference;
  base.rows[5].evidenceRefs = [];
  const result = await validateCoverageMatrix(base, { rootDir, registryManifest: await registry() });
  const found = codes(result);
  assert.ok(found.has('duplicate-profile-variant'));
  assert.ok(found.has('false-approximation'));
  assert.ok(found.has('missing-approval-reference'));
  assert.ok(found.has('missing-evidence'));
});

test('registration cross-check rejects unmatched renderers and missing registered rows', async () => {
  const base = await matrix();
  base.rows[0].runtimeImplementationState = 'registered';
  const manifest = await registry();
  manifest.registrations.push({
    profile: { taxonomyId: 'ielts-reading', typeId: 'invented-type', taxonomyVersion: 1 },
    family: 'choice', variant: 'single-choice', presentationMode: 'structured',
    responseCodec: 'choice-single-v1', rendererId: 'invented', codecId: 'choice-single-v1',
  });
  const result = await validateCoverageMatrix(base, { rootDir, registryManifest: manifest });
  const found = codes(result);
  assert.ok(found.has('registration-mismatch'));
  assert.ok(found.has('registration-without-supported-row'));
});

test('release mode refuses planned supported rows even with an empty valid manifest', async () => {
  const result = await loadAndValidateCoverageMatrix({ rootDir, release: true });
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('release-planned-row'));
});

test('generic manifest registrations satisfy matching profiled rows without IELTS branching', async () => {
  const base = await matrix();
  base.rows.forEach((row) => {
    row.runtimeImplementationState = 'registered';
  });
  const registrations = new Map();
  base.rows.forEach((row) => {
    const selectorKey = [row.interaction.family, row.interaction.variant].join(':');
    const existing = registrations.get(selectorKey);
    const genericCompatible = !existing || (
      existing.presentationMode === row.presentationMode
      && existing.responseCodec === row.responseCodec
    );
    const profile = genericCompatible ? null : row.profile;
    const key = [
      profile === null
        ? '*'
        : `${profile.taxonomyId}/${profile.typeId}@${profile.taxonomyVersion}`,
      selectorKey,
    ].join(':');
    registrations.set(key, {
      profile,
      family: row.interaction.family,
      variant: row.interaction.variant,
      presentationMode: row.presentationMode,
      responseCodec: row.responseCodec,
      rendererId: `renderer:${key}`,
      codecId: `codec:${row.responseCodec}`,
    });
  });
  const result = await validateCoverageMatrix(base, {
    rootDir,
    release: true,
    registryManifest: {
      schemaVersion: 1,
      kind: 'prd0062-activity-runtime-registration-manifest',
      registrations: [...registrations.values()],
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('manifest rejects overlapping generic selectors even when mode or codec differs', async () => {
  const base = await matrix();
  const manifest = await registry();
  manifest.registrations.push(
    {
      profile: null,
      family: 'text-entry',
      variant: 'short-answer',
      presentationMode: 'structured',
      responseCodec: 'text-entry-v1',
      rendererId: 'short-answer-structured',
      codecId: 'text-entry-v1',
    },
    {
      profile: null,
      family: 'text-entry',
      variant: 'short-answer',
      presentationMode: 'source-assisted',
      responseCodec: 'text-entry-v1',
      rendererId: 'short-answer-source',
      codecId: 'text-entry-v1',
    },
  );
  const result = await validateCoverageMatrix(base, {
    rootDir,
    registryManifest: manifest,
  });
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('duplicate-registration'));
});

test('manifest rejects overlap between generic and exact profile selectors', async () => {
  const base = await matrix();
  const manifest = await registry();
  manifest.registrations.push(
    {
      profile: null,
      family: 'text-entry',
      variant: 'short-answer',
      presentationMode: 'structured',
      responseCodec: 'text-entry-v1',
      rendererId: 'short-answer-generic',
      codecId: 'text-entry-v1',
    },
    {
      profile: {
        taxonomyId: 'ielts-reading',
        typeId: 'sentence-completion',
        taxonomyVersion: 1,
      },
      family: 'text-entry',
      variant: 'short-answer',
      presentationMode: 'structured',
      responseCodec: 'text-entry-v1',
      rendererId: 'short-answer-exact',
      codecId: 'text-entry-v1',
    },
  );
  const result = await validateCoverageMatrix(base, {
    rootDir,
    registryManifest: manifest,
  });
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('duplicate-registration'));
});

test('fixture checker emits one machine-readable failure result', async () => {
  const base = await matrix();
  base.rows[0].fixtureId = 'missing-independent-fixture';
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'prd0062-coverage-'));
  const tempMatrixPath = path.join(tempRoot, 'matrix.json');
  await writeFile(tempMatrixPath, JSON.stringify(base), 'utf8');
  const fixtureChecker = path.join(
    rootDir,
    'scripts/lib/prd0062-activity-coverage/validate-matrix-fixtures.ts',
  );
  const run = spawnSync(
    process.execPath,
    [path.join(rootDir, 'node_modules/vite-node/vite-node.mjs'), fixtureChecker, tempMatrixPath],
    { cwd: rootDir, encoding: 'utf8' },
  );
  assert.equal(run.status, 1);
  const output = JSON.parse(run.stdout);
  assert.equal(output.ok, false);
  assert.ok(output.issues.some((entry) => entry.code === 'invalid-schema-fixture'));
  assert.equal(run.stderr, '');
});

test('fixture checker rejects scoring-mode drift', async () => {
  const base = await matrix();
  base.rows[0].scoringReview.mode = 'review-required';
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'prd0062-coverage-'));
  const tempMatrixPath = path.join(tempRoot, 'matrix.json');
  await writeFile(tempMatrixPath, JSON.stringify(base), 'utf8');
  const fixtureChecker = path.join(
    rootDir,
    'scripts/lib/prd0062-activity-coverage/validate-matrix-fixtures.ts',
  );
  const run = spawnSync(
    process.execPath,
    [path.join(rootDir, 'node_modules/vite-node/vite-node.mjs'), fixtureChecker, tempMatrixPath],
    { cwd: rootDir, encoding: 'utf8' },
  );
  assert.equal(run.status, 1);
  const output = JSON.parse(run.stdout);
  assert.ok(output.issues.some((entry) => entry.message.includes('scoring mode differs')));
  assert.equal(run.stderr, '');
});

test('CLI reads Ticket 22A manifest by default and release fails until rows register', () => {
  execFileSync(process.execPath, ['scripts/check-prd0062-activity-coverage.mjs'], {
    cwd: rootDir,
    stdio: 'pipe',
  });
  const release = spawnSync(process.execPath, ['scripts/check-prd0062-activity-coverage.mjs', '--release'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  assert.notEqual(release.status, 0);
  assert.match(release.stderr, /release-planned-row/);
});

test('CLI rejects duplicate and malformed flags', () => {
  for (const args of [['--release', '--release'], ['--registry'], ['--registry', emptyRegistryPath], ['--wat']]) {
    const result = spawnSync(process.execPath, ['scripts/check-prd0062-activity-coverage.mjs', ...args], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    assert.equal(result.status, 2, `${args.join(' ')}\n${result.stderr}`);
    assert.match(result.stderr, /Usage:/);
  }
});
