import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildPrd0062SecurityPhases,
  collectExistingPaths,
  parseSecurityMode,
  summarizeCommandOutput,
} from '../run-security-tests.js';

test('collectExistingPaths fails closed when a required security test is missing', () => {
  const missingPath = 'scripts/__tests__/definitely-missing-required-security-test.mjs';

  assert.throws(
    () => collectExistingPaths([missingPath], new Set([missingPath])),
    /Required security test path not found/,
  );
  assert.deepEqual(collectExistingPaths([missingPath]), []);
});

test('a failed phase cannot be reported as all-passed when assertions passed before a suite error', () => {
  assert.deepEqual(summarizeCommandOutput('Tests  56 passed (56)', 1), {
    passed: 56,
    failed: 1,
    skipped: 0,
  });
});

test('PRD0062 mode is explicit and rejects adaptation collisions', () => {
  assert.equal(parseSecurityMode([]), 'default');
  assert.equal(parseSecurityMode(['--prd0062']), 'prd0062');
  assert.throws(() => parseSecurityMode(['--prd0062', '--watch']), /Unknown security test arguments/);
});

test('PRD0062 security phases use the repository harness and current production-normal suites', () => {
  const phases = buildPrd0062SecurityPhases();
  assert.equal(phases.length, 2);
  for (const phase of phases) {
    assert.match(phase.args[0].replaceAll('\\', '/'), /scripts\/harness\/run-tool\.mjs$/u);
    assert.equal(phase.args[1], '--audit');
    assert.equal(phase.args[2], 'firebase');
    assert.equal(phase.args[3], '.');
    assert.ok(phase.testPaths.length > 0);
    assert.equal(phase.environment.VITE_FIREBASE_DATABASE_URL, 'https://demo.firebaseio.com');
    assert.equal(phase.environment.CODEX_HARNESS_TIMEOUT_MS, '600000');
  }
  const selected = phases.flatMap(({ testPaths }) => testPaths);
  assert.ok(selected.includes('src/__tests__/security/prd0062-118-production-normal-rules.emulator.test.ts'));
  assert.ok(selected.includes('cloudflare/test/prd0062-m1-rule-enforced-composition.emulator.test.ts'));
  assert.ok(!selected.includes('src/__tests__/security/prd0062RetiredDataQuarantineFirebaseRules.emulator.test.ts'));
  assert.match(phases[1].args.at(-1), /cloudflare\/vitest\.prd0062-m1-rule-enforced-composition\.config\.mjs/u);
});

test('the aggregate test gate uses the active PRD0062 security matrix', () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(packageJson.scripts['test:all'], /^npm run test:security -- --prd0062(?: |$)/u);
  assert.equal(packageJson.scripts['test:prd0062-retirement'], undefined);
  assert.match(
    packageJson.scripts['test:prd0062:historical-retirement'],
    /prd0062RetiredDataQuarantineFirebaseRules/u,
  );
});
