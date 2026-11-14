import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertVerificationReady, candidateTests, cardDigest, cardBytes, configurationDigest, createPromotionCard, createQualificationBinding, createVerificationPlan, promotionEnvironment, validatePromotionCard, validateTrackedPath } from '../release-promotion.mjs';

const revision = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const baseRevision = 'c'.repeat(40);
const baselineTree = 'd'.repeat(40);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

async function fixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'release-promotion-card-'));
  await writeFile(path.join(cwd, 'firebase.json'), '{"hosting":{"public":"dist"}}\n');
  await writeFile(path.join(cwd, '.firebaserc'), '{"projects":{"default":"temp-a1437"}}\n');
  await mkdir(path.join(cwd, 'dist/.well-known'), { recursive: true });
  await mkdir(path.join(cwd, 'tmp/release-receipts'), { recursive: true });
  await writeFile(path.join(cwd, 'tmp/release-receipts/plan.json'), '{}\n');
  const environmentFingerprint = digest('e');
  const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision, tree, envFingerprint: environmentFingerprint, files: [{ path: '/index.html', sha256: digest('index') }] };
  await writeFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), JSON.stringify(manifest));
  const assessment = {
    decision: 'PASS', target: 'hosting',
    productionEnvFingerprint: environmentFingerprint,
    source: { revision, tree, baseRevision, fingerprint: digest('f'), dirty: false },
    observed: { revision: baseRevision, tree: baselineTree, fingerprint: digest('o') },
  };
  const verification = { schemaVersion: 1, decision: 'PASS', source: { revision, tree, baseRevision, fingerprint: digest('f'), dirty: false }, envFingerprint: environmentFingerprint, planSha256: digest('p'), startedAt: '2026-11-12T00:00:00.000Z', completedAt: '2026-11-12T00:01:00.000Z', suites: [{ runner: 'node', files: ['scripts/example.test.mjs'], counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, outputSha256: digest('output') }] };
  const verificationEvidence = { schemaVersion: 1, requirement: 'not-required', decision: 'not-required', observedAt: new Date().toISOString(), method: 'path classifier', scenario: 'No application runtime paths changed.', sourceRevision: revision, sourceFingerprint: digest('f'), checks: [], evidenceRefs: [], summary: 'No application runtime paths changed.' };
  return { cwd, assessment, environmentFingerprint, manifest, verification, verificationEvidence };
}

test('promotion card binds protected source, baseline, plan, review, artifact and configuration', async () => {
  const { cwd, assessment, environmentFingerprint, manifest, verification, verificationEvidence } = await fixture();
  try {
    const card = createPromotionCard({ cwd, assessment, assessmentSha256: digest('a'),
      sourceRef: 'refs/heads/main', eventRef: 'refs/heads/main', eventName: 'workflow_dispatch', eventSha: revision,
      planFile: 'tmp/release-receipts/plan.json', planSha256: digest('p'), compatibilityReviewFile: 'docs/review.json', compatibilityReviewSha256: digest('r'),
      artifactSha256: digest(JSON.stringify(manifest)), environmentFingerprint,
      verification, verificationEvidence, impact: 'Static Hosting presentation only; backend services are excluded.', missingProof: 'No application runtime paths changed.',
      includedScope: 'Hosting UI correction',
      excludedScope: 'Workers, rules, storage and data', recoveryTarget: 'previous verified Hosting version',
      recoveryLimits: 'Hosting recovery does not revert backend or data state' });
    assert.equal(card.source.ref, 'refs/heads/main');
    assert.equal(card.event.sha, revision);
    assert.equal(card.source.baseRevision, baseRevision);
    assert.equal(card.baseline.revision, baseRevision);
    assert.equal(card.baseline.tree, baselineTree);
    assert.equal(card.verification.compatibilityReview.sha256, digest('r'));
    assert.equal(card.verification.actual.suites[0].counts.passed, 1);
    assert.equal(card.verificationEvidence.record.decision, 'not-required');
    assert.doesNotThrow(() => assertVerificationReady(card));
    const verified = structuredClone(card);
    verified.verificationEvidence.record = { ...verified.verificationEvidence.record, decision: 'verified', checks: [{ name: 'agent-selected check', result: 'passed' }], evidenceRefs: ['evidence://verification-proof'], summary: 'Agent-selected verification passed.' };
    assert.equal(assertVerificationReady(verified).verificationEvidence.record.decision, 'verified');
    assert.equal(card.configuration.firebaseSha256.length, 64);
    assert.equal(cardDigest(card), cardDigest(JSON.parse(cardBytes(card).toString('utf8'))));
    assert.deepEqual(promotionEnvironment(card), {
      LUYENTAP_RELEASE_SOURCE_REF: 'refs/heads/main', LUYENTAP_RELEASE_BASE: baseRevision,
      LUYENTAP_RELEASE_FINGERPRINT: digest('f'), LUYENTAP_RELEASE_ENV_FINGERPRINT: environmentFingerprint,
      LUYENTAP_RELEASE_OBSERVED_FINGERPRINT: digest('o'), LUYENTAP_RELEASE_TEST_PLAN_FILE: 'tmp/release-receipts/plan.json',
      LUYENTAP_RELEASE_TEST_PLAN_SHA256: digest('p'), LUYENTAP_RELEASE_ARTIFACT_SHA256: digest(JSON.stringify(manifest)),
      LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_FILE: 'docs/review.json', LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_SHA256: digest('r'),
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('qualification binding preserves the exact retained artifact and source without requiring a publishable card', async () => {
  const { cwd, environmentFingerprint, manifest } = await fixture();
  try {
    const binding = createQualificationBinding({
      inputs: { schemaVersion: 1, eventName: 'workflow_dispatch', eventRef: 'refs/heads/main', eventSha: revision, sourceRevision: revision, sourceTree: tree, baseRevision, sourceFingerprint: digest('f'), environmentFingerprint, objective: 'qualification smoke' },
      artifactManifest: manifest,
      configurationFingerprint: configurationDigest(cwd),
    });
    assert.equal(binding.source.revision, revision);
    assert.equal(binding.source.baseRevision, baseRevision);
    assert.equal(binding.artifact.manifestSha256, digest(JSON.stringify(manifest)));
    assert.throws(() => createQualificationBinding({ inputs: { ...binding, sourceRevision: baseRevision }, artifactManifest: manifest, configurationFingerprint: configurationDigest(cwd) }), /qualification event SHA/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('promotion card rejects source, review, path and credential drift', async () => {
  const { cwd, assessment, environmentFingerprint, manifest, verification, verificationEvidence } = await fixture();
  try {
    const makeCard = artifactSha256 => createPromotionCard({ cwd, assessment, assessmentSha256: digest('a'), sourceRef: 'refs/heads/main', eventRef: 'refs/heads/main', eventName: 'workflow_dispatch', eventSha: revision, planFile: 'tmp/release-receipts/plan.json', planSha256: digest('p'), artifactSha256, environmentFingerprint, verification, verificationEvidence, impact: 'scope impact', missingProof: 'No application runtime paths changed.', includedScope: 'scope', excludedScope: 'excluded', recoveryTarget: 'version', recoveryLimits: 'hosting only' });
    const valid = makeCard(digest(JSON.stringify(manifest)));
    for (const mutate of [
      card => { card.event.ref = 'refs/heads/codex/untrusted'; },
      card => { card.event.sha = baseRevision; },
      card => { card.source.baseRevision = revision; },
      card => { card.verification.actual.source.baseRevision = revision; },
      card => { card.source.fingerprint = 'changed'; },
      card => { card.verification.planFile = '../plan.json'; },
      card => { card.scope.included = 'https://user:password@example.invalid'; },
      card => { card.artifact.environmentFingerprint = digest('changed-environment'); },
      card => { card.verificationEvidence.record = { ...card.verificationEvidence.record, evidenceRefs: ['https://user:password@example.invalid'] }; },
    ]) {
      const changed = structuredClone(valid);
      mutate(changed);
      assert.throws(() => validatePromotionCard(changed));
    }
    assert.throws(() => makeCard(digest('wrong-artifact')), /artifact manifest digest/u);
    const mismatchedAssessment = structuredClone(assessment);
    mismatchedAssessment.source.baseRevision = revision;
    assert.throws(() => createPromotionCard({ cwd, assessment: mismatchedAssessment, assessmentSha256: digest('a'), sourceRef: 'refs/heads/main', eventRef: 'refs/heads/main', eventName: 'workflow_dispatch', eventSha: revision, planFile: 'tmp/release-receipts/plan.json', planSha256: digest('p'), artifactSha256: digest(JSON.stringify(manifest)), environmentFingerprint, verification, verificationEvidence, impact: 'scope', missingProof: 'missing', includedScope: 'scope', excludedScope: 'excluded', recoveryTarget: 'version', recoveryLimits: 'hosting only' }), /assessment source base revision/u);
    const mismatchedVerification = structuredClone(verification);
    mismatchedVerification.source.baseRevision = revision;
    assert.throws(() => createPromotionCard({ cwd, assessment, assessmentSha256: digest('a'), sourceRef: 'refs/heads/main', eventRef: 'refs/heads/main', eventName: 'workflow_dispatch', eventSha: revision, planFile: 'tmp/release-receipts/plan.json', planSha256: digest('p'), artifactSha256: digest(JSON.stringify(manifest)), environmentFingerprint, verification: mismatchedVerification, verificationEvidence, impact: 'scope', missingProof: 'missing', includedScope: 'scope', excludedScope: 'excluded', recoveryTarget: 'version', recoveryLimits: 'hosting only' }), /verification source base revision/u);
    const mismatchedManifest = { ...manifest, tree: baseRevision };
    await writeFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), JSON.stringify(mismatchedManifest));
    assert.throws(() => makeCard(digest(JSON.stringify(mismatchedManifest))), /artifact manifest does not match/u);
    await writeFile(path.join(cwd, 'dist/.well-known/luyentap-release.json'), JSON.stringify(manifest));
    assert.throws(() => createPromotionCard({ cwd, assessment, assessmentSha256: digest('a'), sourceRef: 'refs/heads/main', eventRef: 'refs/heads/main', eventName: 'workflow_dispatch', eventSha: undefined, planFile: 'tmp/release-receipts/plan.json', planSha256: digest('p'), artifactSha256: digest(JSON.stringify(manifest)), environmentFingerprint, verification, verificationEvidence, impact: 'scope', missingProof: 'missing', compatibilityReviewFile: 'docs/review.json', includedScope: 'scope', excludedScope: 'excluded', recoveryTarget: 'version', recoveryLimits: 'hosting only' }), /event SHA/u);
    assert.throws(() => createPromotionCard({ cwd, assessment, assessmentSha256: digest('a'), sourceRef: undefined, eventRef: 'refs/heads/main', eventName: 'workflow_dispatch', eventSha: revision, planFile: 'tmp/release-receipts/plan.json', planSha256: digest('p'), artifactSha256: digest(JSON.stringify(manifest)), environmentFingerprint, verification, verificationEvidence, impact: 'scope', missingProof: 'missing', includedScope: 'scope', excludedScope: 'excluded', recoveryTarget: 'version', recoveryLimits: 'hosting only' }), /explicit workflow_dispatch context/u);
    assert.throws(() => validateTrackedPath('a/../b', 'plan'), /explicit tracked relative path/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('automatic verification selection routes frontend tests to Vitest', () => {
  const plan = createVerificationPlan(['scripts/__tests__/release-promotion.test.mjs', 'src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx']);
  assert.deepEqual(plan.suites, [
    { runner: 'node', files: ['scripts/__tests__/release-promotion.test.mjs'] },
    { runner: 'vitest', config: 'vitest.config.ts', files: ['src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx'] },
  ]);
});

test('automatic test discovery excludes changed non-test files', () => {
  const files = candidateTests(process.cwd(), ['scripts/release-promotion.mjs', 'scripts/release-browser-gate.mjs', 'src/services/firebaseRuntimeConfig.js', 'src/services/firebaseRuntimeConfig.test.js', 'e2e/release-promotion-browser.spec.ts']);
  assert.deepEqual(files, ['scripts/__tests__/release-browser-gate.test.mjs', 'scripts/__tests__/release-promotion.test.mjs', 'src/services/firebaseRuntimeConfig.test.js']);
});

test('application paths require agent-selected source-bound verification', async () => {
  const { cwd, assessment, environmentFingerprint, manifest, verification, verificationEvidence } = await fixture();
  try {
    const applicationAssessment = structuredClone(assessment);
    applicationAssessment.source.files = ['src/App.jsx'];
    assert.throws(() => createPromotionCard({ cwd, assessment: applicationAssessment, assessmentSha256: digest('a'), sourceRef: 'refs/heads/main', eventRef: 'refs/heads/main', eventName: 'workflow_dispatch', eventSha: revision, planFile: 'tmp/release-receipts/plan.json', planSha256: digest('p'), artifactSha256: digest(JSON.stringify(manifest)), environmentFingerprint, verification, verificationEvidence, impact: 'application change', missingProof: 'application evidence missing', includedScope: 'application', excludedScope: 'excluded', recoveryTarget: 'version', recoveryLimits: 'hosting only' }), /verification evidence requirement is invalid/u);
    const verified = { ...verificationEvidence, requirement: 'required', decision: 'verified', method: 'Codex-selected browser', scenario: 'login journey', checks: [{ name: 'login journey', result: 'passed' }], evidenceRefs: ['evidence://login'], summary: 'Selected application journey passed.' };
    assert.doesNotThrow(() => createPromotionCard({ cwd, assessment: applicationAssessment, assessmentSha256: digest('a'), sourceRef: 'refs/heads/main', eventRef: 'refs/heads/main', eventName: 'workflow_dispatch', eventSha: revision, planFile: 'tmp/release-receipts/plan.json', planSha256: digest('p'), artifactSha256: digest(JSON.stringify(manifest)), environmentFingerprint, verification, verificationEvidence: verified, impact: 'application change', missingProof: 'none', includedScope: 'application', excludedScope: 'excluded', recoveryTarget: 'version', recoveryLimits: 'hosting only' }));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('promotion evidence expires before it can authorize publication', async () => {
  const { cwd, assessment, environmentFingerprint, manifest, verification, verificationEvidence } = await fixture();
  try {
    const card = createPromotionCard({ cwd, assessment, assessmentSha256: digest('a'), sourceRef: 'refs/heads/main', eventRef: 'refs/heads/main', eventName: 'workflow_dispatch', eventSha: revision, planFile: 'tmp/release-receipts/plan.json', planSha256: digest('p'), artifactSha256: digest(JSON.stringify(manifest)), environmentFingerprint, verification, verificationEvidence, impact: 'scope', missingProof: 'missing', includedScope: 'scope', excludedScope: 'excluded', recoveryTarget: 'version', recoveryLimits: 'hosting only' });
    const stale = structuredClone(card);
    stale.generatedAt = '2020-01-01T00:00:00.000Z';
    assert.throws(() => validatePromotionCard(stale), /card is stale/u);
    const staleEvidence = structuredClone(card);
    staleEvidence.verificationEvidence.record = { ...staleEvidence.verificationEvidence.record, decision: 'verified', checks: [{ name: 'agent-selected check', result: 'passed' }], evidenceRefs: ['evidence://verification-proof'], observedAt: '2020-01-01T00:00:00.000Z' };
    assert.throws(() => validatePromotionCard(staleEvidence), /verification evidence is stale/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
