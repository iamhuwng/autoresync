import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(root, '.github/workflows/release-promotion-phase3.yml'), 'utf8');
const safety = readFileSync(path.join(root, '.github/workflows/release-safety.yml'), 'utf8');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

function jobSection(name, nextName) {
  const marker = `\n  ${name}:`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing job ${name}`);
  const end = nextName ? workflow.indexOf(`\n  ${nextName}:`, start + marker.length) : workflow.length;
  return workflow.slice(start, end === -1 ? workflow.length : end);
}

test('promotion workflow is manual, protected-main-only, and serialized', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|pull_request_target|repository_dispatch|schedule|workflow_run):/mu);
  assert.match(workflow, /operation:\n\s+description:[\s\S]*required: true\n\s+default: publish\n\s+type: choice\n\s+options:\n\s+- publish\n\s+- health\n\s+- plan\n\s+- verify-existing/u);
  assert.match(workflow, /objective:\n\s+description:[\s\S]*required: false/u);
  assert.match(workflow, /operation_id:/u);
  assert.match(workflow, /expected_manifest_sha256:/u);
  assert.match(workflow, /group: \$\{\{ \(inputs\.operation == 'health' \|\| inputs\.operation == 'plan'\) && 'luyentap-hosting-read-only' \|\| 'luyentap-hosting-production' \}\}/u);
  assert.match(workflow, /cancel-in-progress: false/u);
});

test('workflow retires split release cards, changelog PRs, and write permissions', () => {
  for (const forbidden of [
    'release-promotion.mjs',
    'release-archive.mjs',
    'release-verification-bundle.mjs',
    'release-browser-gate.mjs',
    'release-changelog.mjs',
    'codex/changelog-',
    'gh release',
    'gh pr create',
    'contents: write',
    'pull-requests: write',
    'verification_tag',
    'verification_sha256',
    'approved-release-card',
    'playwright install',
    '\n  prepare:',
    '\n  promote:',
  ]) {
    assert.equal(workflow.includes(forbidden), false, `unexpected retired reference: ${forbidden}`);
  }
});

test('preflight job covers read-only health and plan with read-only federation', () => {
  const preflight = jobSection('preflight', 'publish');
  assert.match(preflight, /github\.repository == 'iamhuwng\/autoresync' && github\.ref == 'refs\/heads\/main' && \(inputs\.operation == 'health' \|\| inputs\.operation == 'plan'\)/u);
  assert.doesNotMatch(preflight, /environment:\s*\n\s+name: production/u);
  assert.doesNotMatch(preflight, /LUYENTAP_PRODUCTION_|deploy:hosting|build:production/u);
  assert.match(preflight, /LUYENTAP_RELEASE_GOOGLE_WORKLOAD_IDENTITY_PROVIDER/u);
  assert.match(preflight, /LUYENTAP_RELEASE_GOOGLE_SERVICE_ACCOUNT/u);
  assert.match(preflight, /release-plan\.mjs --dependency-health/u);
  assert.match(preflight, /firebase hosting:sites:list --project temp-a1437 --json/u);
  assert.match(preflight, /release-plan\.mjs --json --env-file/u);
});

test('publish is a single serialized job with preflight observation, localhost readback, single deploy, and rollback summary', () => {
  const publish = jobSection('publish', 'recover');
  assert.match(publish, /github\.repository == 'iamhuwng\/autoresync' && github\.ref == 'refs\/heads\/main' && inputs\.operation == 'publish'/u);
  assert.match(publish, /permissions:\n\s+contents: read\n\s+id-token: write/u);
  assert.match(publish, /# Post-launch, the repo owner can add a human-only required reviewer in GitHub Settings -> Environments -> production without modifying this workflow\.\n\s+environment:\n\s+name: production\n\s+url: https:\/\/kahut1\.web\.app/u);
  assert.match(publish, /live_fingerprint: observation\.fingerprint/u);
  assert.doesNotMatch(publish, /live_fingerprint: observation\.manifest\?\.envFingerprint/u);
  assert.match(publish, /release-check\.mjs[\s\S]*--target[\s\S]*hosting/u);
  assert.equal((publish.match(/npm run build:production/gu) || []).length, 1);
  assert.match(publish, /vite\.js preview --host localhost --port 5173 --strictPort/u);
  assert.match(publish, /release-local-readback\.mjs "\$preview_origin"/u);
  assert.match(publish, /assertHostingArtifact[\s\S]*scripts\/release-evidence\.mjs/u);
  assert.match(publish, /npm run deploy:hosting -- --deploy-built/u);
  assert.match(publish, /GITHUB_STEP_SUMMARY/u);
  assert.match(publish, /firebase hosting:clone temp-a1437:kahut1@/u);
  assert.match(publish, /retention-days: 14/u);
});

test('recover validates optional bindings and verifies live Hosting without rebuilding or redeploying', () => {
  const recover = jobSection('recover');
  assert.match(recover, /github\.repository == 'iamhuwng\/autoresync' && github\.ref == 'refs\/heads\/main' && inputs\.operation == 'verify-existing'/u);
  assert.match(recover, /environment:\n\s+name: production/u);
  assert.match(recover, /\[\[ "\$OPERATION_ID" =~ \^\[0-9a-f\]\{8\}-/u);
  assert.match(recover, /\[\[ "\$EXPECTED_MANIFEST" =~ \^\[0-9a-f\]\{64\}\$ \]\]/u);
  assert.match(recover, /npm run release:verify-existing --/u);
  assert.doesNotMatch(recover, /build:production|deploy:hosting|firebase deploy|LUYENTAP_PRODUCTION_ENV/u);
  assert.match(recover, /retention-days: 14/u);
});

test('release-safety CI and package scripts remove retired changelog and ceremonial tests', () => {
  for (const retired of [
    'release-changelog.mjs --check',
    'release-promotion.test.mjs',
    'release-verification-bundle.test.mjs',
    'release-archive.test.mjs',
    'release-changelog-recorder.test.mjs',
    'change-records.test.mjs',
  ]) {
    assert.equal(safety.includes(retired), false, `release-safety.yml still references ${retired}`);
  }
  assert.doesNotMatch(pkg.scripts['test:scripts:node'], /release-promotion\.test\.mjs|release-verification-bundle\.test\.mjs/u);
});
