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
  assert.match(prepare, /card_sha256/u);
  assert.match(prepare, /contents: read/u);
  assert.doesNotMatch(prepare, /environment:\s*name: production/u);
});

test('promote verifies the source-bound card and retains guarded publication/recovery', () => {
  const promote = workflow.slice(workflow.indexOf('  promote:'), workflow.indexOf('  recover:'));
  assert.match(promote, /needs: \[prepare\]/u);
  assert.match(promote, /--check-card/u);
  assert.match(promote, /--require-verification/u);
  assert.match(promote, /Re-observe the exact Hosting baseline immediately before mutation/u);
  assert.match(promote, /Require protected main to remain the approved source/u);
  assert.match(promote, /--deploy-retained/u);
  assert.match(promote, /environment:\s*name: production/u);
  assert.match(promote, /luyentap-release-result-/u);
});

test('recovery validates an operation UUID and never rebuilds or redeploys', () => {
  const recovery = workflow.slice(workflow.indexOf('  recover:'));
  assert.match(recovery, /\[\[ "\$OPERATION_ID" =~ \^\[0-9a-f\]/u);
  assert.match(recovery, /release:verify-existing/u);
  assert.doesNotMatch(recovery, /build:production|deploy:hosting|firebase deploy/u);
});
