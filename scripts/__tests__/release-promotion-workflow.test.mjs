import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowFile = ['release-promotion.yml', 'release-promotion-v2.yml']
  .map(name => path.join(root, '.github/workflows', name))
  .find(file => existsSync(file));
const workflow = readFileSync(workflowFile, 'utf8');
const browserGate = readFileSync(path.join(root, 'scripts/release-browser-gate.mjs'), 'utf8');

test('promotion workflow is manual, protected-main-only and serialized', () => {
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /objective:/u);
  assert.doesNotMatch(workflow, /base_revision:|environment_fingerprint:|verification_plan_file:|browser_evidence_file:/u);
  assert.match(workflow, /github\.repository == 'iamhuwng\/autoresync'/u);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/u);
  assert.ok(workflow.includes('test "$GITHUB_REF" = refs/heads/main'));
  assert.doesNotMatch(workflow, /inputs\.(source_ref|base_revision|environment_fingerprint|verification_plan_file|verification_plan_sha256|compatibility_review_file|browser_evidence_file)/u);
  assert.match(workflow, /group: luyentap-hosting-production/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(workflow, /persist-credentials: false/u);
});
test('promotion workflow separates card, browser gate, authorization, publication and recovery', () => {
  assert.match(workflow, /LUYENTAP_RELEASE_ENV/u);
  assert.doesNotMatch(workflow.slice(workflow.indexOf('  prepare:'), workflow.indexOf('  browser-gate:')), /environment:\s*name: production/u);
  assert.match(workflow, /name: production/u);
  assert.match(workflow, /--run-verification --output/u);
  assert.match(workflow, /--prepare --objective/u);
  assert.match(workflow, /--export-inputs/u);
  assert.ok(workflow.includes('--require-browser "$card"'));
  assert.match(workflow, /release-browser-gate\.mjs/u);
  assert.match(workflow, /--qualification-env-file/u);
  assert.match(workflow, /name: qualification/u);
  const browserGateWorkflow = workflow.slice(workflow.indexOf('  browser-gate:'), workflow.indexOf('  promote:'));
  assert.doesNotMatch(browserGateWorkflow, /LUYENTAP_PRODUCTION_ENV|LUYENTAP_PRODUCTION_GOOGLE_/u);
  assert.match(browserGate, /hosting:channel:deploy/u);
  assert.match(browserGate, /hosting:clone/u);
  assert.match(browserGate, /hosting:channel:delete/u);
  assert.doesNotMatch(browserGate, /teacher@test\.com|student@test\.com/u);
  assert.match(browserGate, /allowOverwrite: false/u);
  assert.match(browserGate, /identitytoolkit\.googleapis\.com[^`]+accounts:batchCreate/u);
  assert.doesNotMatch(browserGate, /access_token=/u);
  assert.match(browserGate, /cleanupErrors/u);
  assert.match(browserGate, /decision: !failure && cleanupErrors\.length === 0/u);
  assert.match(workflow, /playwright install --with-deps chromium/u);
  assert.match(workflow, /luyentap-release-browser-evidence-\$\{\{ github\.run_id \}\}/u);
  assert.match(workflow, /LUYENTAP_RELEASE_BROWSER_EVIDENCE_FILE/u);
  assert.match(workflow, /Open the protected-main Changelog integration PR/u);
  assert.match(workflow, /Publication\/live verification status is/u);
  assert.match(workflow, /published-verified\|changelog-pending\|changelog-pending-integration/u);
  assert.match(workflow, /pull-requests: write/u);
  assert.match(workflow, /--deploy-retained/u);
  assert.match(workflow, /include-hidden-files: true/u);
  assert.match(workflow, /Validate the exact public artifact before upload/u);
  assert.match(workflow, /assertHostingArtifact/u);
  assert.match(workflow, /Re-observe the exact Hosting baseline immediately before mutation/u);
  assert.match(workflow, /pre-publish-baseline\.json/u);
  assert.match(workflow, /Require protected main to remain the approved source/u);
  assert.match(workflow, /git ls-remote origin refs\/heads\/main/u);
  assert.match(workflow, /release:verify-existing/u);
  assert.match(workflow, /actions\/upload-artifact@v4/u);
  assert.match(workflow, /mkdir -p tmp\/release-card tmp\/release-plan/u);
  assert.match(workflow, /path: tmp\/release-card/u);
  assert.match(workflow, /path: tmp\/release-plan/u);
  assert.match(workflow, /rm -rf tmp\/release-result/u);
  assert.match(workflow, /path: tmp\/release-result/u);
  assert.doesNotMatch(workflow, /path:\s*\|[\s\S]*runner\.temp\/release-card\.json/u);
  for (const upload of workflow.match(/- uses: actions\/upload-artifact@v4[\s\S]*?(?=\n      - uses: actions\/upload-artifact@v4|\n\n  browser-gate:|\n\n  promote:|\n\n  recover:)/gu) || []) {
    if (upload.includes('luyentap-release-browser-evidence-') || upload.includes('luyentap-approved-release-card-')) continue;
    assert.doesNotMatch(upload, /runner\.temp/u);
  }
  assert.match(workflow, /luyentap-verification-plan-\$\{\{ github\.run_id \}\}/u);
  assert.match(workflow, /name: luyentap-verification-plan-\$\{\{ github\.run_id \}\}[\s\S]*path: tmp\/release-plan/u);
  assert.match(workflow, /name: luyentap-verification-plan-\$\{\{ github\.run_id \}\}[\s\S]*path: \$\{\{ runner\.temp \}\}\/release-plan/u);
  assert.ok(workflow.includes('--compatibility-review "$LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_FILE"'));
  assert.match(workflow, /LUYENTAP_RELEASE_GOOGLE_WORKLOAD_IDENTITY_PROVIDER/u);
  assert.match(workflow, /LUYENTAP_QUALIFICATION_GOOGLE_WORKLOAD_IDENTITY_PROVIDER/u);
  assert.match(workflow, /LUYENTAP_QUALIFICATION_ENV/u);
  assert.equal((workflow.match(/VITE_FIREBASE_QUALIFICATION_API_KEY=/gu) || []).length, 2);
  assert.equal((workflow.match(/VITE_FIREBASE_QUALIFICATION_PROJECT_ID=/gu) || []).length, 2);
  assert.doesNotMatch(workflow, /GOOGLE_GHA_CREDS_PATH: \$\{\{ runner\.temp \}\}\/gha-creds\.json/u);
  assert.equal((workflow.match(/relocate-oidc-credentials\.mjs/gu) || []).length, 4);
  assert.equal((workflow.match(/assert-oidc-cleanup/gu) || []).length, 4);
  assert.equal((workflow.match(/Verify relocated federation with Google and Firebase CLIs/gu) || []).length, 1);
  assert.equal((workflow.match(/Keep federation credentials outside the checkout/gu) || []).length, 4);
  assert.match(workflow, /LUYENTAP_RELEASE_OPERATION_FILE/u);
  assert.match(workflow, /changelog-reconciliation\.patch/u);
  assert.ok(workflow.includes('gh release upload "hosting-operation-$operation"'));
  assert.match(workflow, /PIPESTATUS\[0\]/u);
  assert.match(workflow, /Changelog/u);
  assert.match(workflow, /operation-id/u);
  assert.ok(workflow.includes('OPERATION_FILE="$RUNNER_TEMP/operation.json" node --input-type=module'));
  assert.match(workflow, /pending-protected-main-integration/u);
  assert.match(workflow, /changelog-integration-request\.json/u);
  assert.doesNotMatch(workflow, /gh release upload[^\n]*\|\|/u);
  assert.match(workflow, /Release \(\[0-9a-f-\]\{36\}\)/u);
  const prepare = workflow.slice(workflow.indexOf('  prepare:'), workflow.indexOf('  browser-gate:'));
  const promote = workflow.slice(workflow.indexOf('  promote:'), workflow.indexOf('  recover:'));
  assert.match(prepare, /contents: read/u);
  assert.doesNotMatch(prepare, /contents: write/u);
  assert.match(promote, /contents: write/u);
  assert.match(promote, /environment:\s*name: production/u);
  assert.doesNotMatch(workflow, /firebase deploy/u);
});

test('recovery path validates an operation UUID and has no build or deploy command', () => {
  const recovery = workflow.slice(workflow.indexOf('  recover:'));
  assert.ok(recovery.includes('[[ "$OPERATION_ID" =~ ^[0-9a-f]'));
  assert.match(recovery, /release:verify-existing/u);
  assert.match(recovery, /Open the protected-main Changelog integration PR after recovery/u);
  assert.match(recovery, /changelog-recovery-/u);
  assert.match(recovery, /changelog-pending/u);
  assert.match(recovery, /pull-requests: write/u);
  assert.doesNotMatch(recovery, /build:production|deploy:hosting|firebase deploy/u);
});

