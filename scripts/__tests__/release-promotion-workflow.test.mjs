import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(root, '.github/workflows/release-promotion-phase3.yml'), 'utf8');

test('promotion workflow is manual, protected-main-only and serialized', () => {
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /repository_dispatch:/u);
  assert.match(workflow, /objective:/u);
  assert.match(workflow, /github\.repository == 'iamhuwng\/autoresync'/u);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /group: luyentap-hosting-production/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.doesNotMatch(workflow, /browser-gate:|release-browser-gate\.mjs|playwright install/u);
});

test('prepare binds the retained Codex verification bundle before production authorization', () => {
  const prepare = workflow.slice(workflow.indexOf('  prepare:'), workflow.indexOf('  promote:'));
  assert.match(prepare, /LUYENTAP_RELEASE_VERIFICATION_BUNDLE_TAG/u);
  assert.match(prepare, /LUYENTAP_RELEASE_VERIFICATION_BUNDLE_SHA256/u);
  assert.match(prepare, /GH_TOKEN:/u);
  assert.match(prepare, /--prepare --objective/u);
  assert.match(prepare, /--run-verification --output/u);
  assert.match(prepare, /Build the source-bound release card/u);
  assert.match(prepare, /luyentap-approved-release-card-/u);
  assert.match(prepare, /Require protected main before preparation/u);
  assert.match(prepare, /--restore-artifact "\$RUNNER_TEMP\/promotion-inputs\.json"/u);
  assert.match(prepare, /if: \$\{\{ inputs\.operation == 'publish' && steps\.tested-artifact\.outputs\.restored != 'true' \}\}/u);
  const readbackStep = prepare.slice(prepare.indexOf('Test the exact production artifact over localhost'), prepare.indexOf('Validate the exact public artifact'));
  assert.match(readbackStep, /id: artifact/u);
  assert.match(readbackStep, /if: \$\{\{ inputs\.operation == 'publish' \}\}/u);
  assert.doesNotMatch(readbackStep, /tested-artifact|outputs\.restored/u);
  assert.match(readbackStep, /release-local-readback\.mjs "\$preview_origin"/u);
  assert.match(readbackStep, /manifestSha256/u);
  assert.match(readbackStep, /manifestFileSha256/u);
  assert.match(prepare, /manifest_file_sha256: \$\{\{ steps\.artifact\.outputs\.manifest_file_sha256 \}\}/u);
  assert.match(prepare, /hosting-readback\.json" tmp\/release-card\/hosting-readback\.json/u);
  assert.doesNotMatch(prepare, /cat >> "\$RUNNER_TEMP\/\.env\.production"/u);
  assert.doesNotMatch(prepare, /QUALIFICATION_|\.env\.qualification/u);
  assert.match(prepare, /card_sha256/u);
  assert.match(prepare, /contents: read/u);
  assert.doesNotMatch(prepare, /environment:\s*name: production/u);
  assert.doesNotMatch(prepare, /cat "\$card" >> "\$GITHUB_STEP_SUMMARY"/u);
});

test('read-only plans use the federated preflight and cannot create a production approval job', () => {
  const prepare = workflow.slice(workflow.indexOf('  prepare:'), workflow.indexOf('  promote:'));
  const promote = workflow.slice(workflow.indexOf('  promote:'), workflow.indexOf('  recover:'));
  const plan = prepare.slice(prepare.indexOf('Observe protected main and its live Hosting dependencies'), prepare.indexOf('Derive release inputs'));
  assert.match(plan, /inputs\.operation == 'plan'/u);
  assert.match(plan, /release-plan\.mjs --json --env-file/u);
  assert.match(plan, /'BLOCKED', 'UNVERIFIED'/u);
  assert.match(plan, /hostingDependencies\?\.fingerprint/u);
  assert.match(plan, /LUYENTAP_HOSTING_READBACK_GOOGLE_ACCOUNT: .*vars\.LUYENTAP_RELEASE_GOOGLE_SERVICE_ACCOUNT/u);
  assert.match(plan, /LUYENTAP_RELEASE_CLOUDFLARE_READ_TOKEN: .*secrets\.LUYENTAP_RELEASE_CLOUDFLARE_READ_TOKEN/u);
  assert.doesNotMatch(plan, /deploy:hosting|build:production|PRODUCTION_GOOGLE_SERVICE_ACCOUNT/u);
  const publication = prepare.slice(prepare.indexOf('Derive release inputs'));
  for (const step of publication.split(/(?=^      - )/mu).filter(value => value.trim())) {
    assert.match(step, /if: \$\{\{ inputs\.operation == 'publish'/u);
  }
  assert.match(promote, /if: \$\{\{ inputs\.operation == 'publish' && needs\.prepare\.result == 'success'/u);
  assert.match(promote, /LUYENTAP_HOSTING_READBACK_GOOGLE_ACCOUNT: .*vars\.LUYENTAP_PRODUCTION_GOOGLE_SERVICE_ACCOUNT/u);
});

test('promote verifies the source-bound card and retains guarded publication/recovery', () => {
  const promote = workflow.slice(workflow.indexOf('  promote:'), workflow.indexOf('  recover:'));
  assert.match(promote, /needs: \[prepare\]/u);
  assert.match(promote, /--check-card/u);
  assert.match(promote, /--require-verification/u);
  assert.match(promote, /Verify the approved Hosting baseline immediately before mutation/u);
  assert.match(promote, /--verify-baseline --output/u);
  assert.doesNotMatch(promote, /release-check\.mjs .*--observe-hosting/u);
  assert.match(promote, /Require protected main to remain the approved source/u);
  assert.match(promote, /--deploy-retained/u);
  assert.match(promote, /EXPECTED_MANIFEST_FILE_SHA256: \$\{\{ needs\.prepare\.outputs\.manifest_file_sha256 \}\}/u);
  assert.match(promote, /sha256sum dist\/\.well-known\/luyentap-release\.json \| cut -d' ' -f1\)" = "\$EXPECTED_MANIFEST_FILE_SHA256"/u);
  assert.doesNotMatch(promote, /build:production/u);
  assert.match(promote, /if test "\$status" -eq 0; then\s+.*Live Hosting verified/u);
  assert.match(promote, /environment:\s*name: production/u);
  assert.doesNotMatch(promote, /QUALIFICATION_|\.env\.qualification/u);
  assert.match(promote, /luyentap-release-result-/u);
  assert.doesNotMatch(promote, /COMPATIBILITY_REVIEW_FILE|COMPATIBILITY_REVIEW_SHA256|compatibility-review\.json/u);
  assert.match(promote, /release-result\/operation\.json/u);
  assert.match(promote, /--export-env/u);
  assert.match(promote, /tmp\/release-receipts\/pre-publish-baseline\.json/u);
});

test('recovery validates an operation UUID and never rebuilds or redeploys', () => {
  const recovery = workflow.slice(workflow.indexOf('  recover:'));
  assert.match(recovery, /\[\[ "\$OPERATION_ID" =~ \^\[0-9a-f\]/u);
  assert.match(recovery, /release:verify-existing/u);
  assert.match(recovery, /Confirm recovery wrote the operation outcome/u);
  assert.match(recovery, /path: \|\s*\$\{\{ runner\.temp \}\}\/operation\.json/u);
  assert.doesNotMatch(recovery, /build:production|deploy:hosting|firebase deploy/u);
});

test('documentation follow-up is optional and retains required recovery evidence separately', () => {
  const steps = workflow.split(/(?=^      - (?:name|uses):)/mu);
  const namedStep = (name) => steps.find((step) => step.startsWith(`      - name: ${name}\n`));
  const operationEvidence = namedStep('Retain durable Hosting operation evidence');
  assert.match(operationEvidence, /gh release upload .*release-result\/operation\.json/u);
  assert.match(operationEvidence, /pre-publish-baseline\.json/u);
  assert.doesNotMatch(operationEvidence, /continue-on-error|changelog/iu);
  const optional = steps.filter((step) => /^        continue-on-error: true$/mu.test(step));
  assert.deepEqual(optional.map((step) => step.split('\n')[0].slice('      - name: '.length)), [
    'Capture optional Changelog follow-up files',
    'Open the protected-main Changelog integration PR',
    'Retain Changelog integration PR identity',
    'Open the protected-main Changelog integration PR after recovery',
  ]);
  const integration = namedStep('Open the protected-main Changelog integration PR');
  assert.match(integration, /^          OPERATION_FILE: .*\/release-result\/operation\.json$/mu);
  assert.match(integration, /published-verified\|changelog-pending\|changelog-pending-integration/u);
});
