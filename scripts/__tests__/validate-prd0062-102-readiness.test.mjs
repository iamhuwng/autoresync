import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectReadiness } from '../validate-prd0062-102-readiness.mjs';

const sourceContract = JSON.parse(readFileSync(new URL('../../documentation/tasks/PRD0062/supporting/102-course-class-placement-contract.json', import.meta.url), 'utf8'));
const write = (root, relativePath, content) => { const target = path.join(root, relativePath); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, content); };
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
const createFixture = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'prd0062-102-readiness-'));
  git(root, ['init']); git(root, ['config', 'user.email', 'test@example.invalid']); git(root, ['config', 'user.name', 'Readiness Test']);
  for (const item of sourceContract.codeEvidence) write(root, item.path, `// ${item.symbol}\n`);
  for (const fixture of sourceContract.fixtures) write(root, fixture, '// fixture\n');
  write(root, 'baseline.txt', 'baseline\n'); git(root, ['add', '.']); git(root, ['commit', '-m', 'baseline']);
  const contract = structuredClone(sourceContract); contract.baselineHead = git(root, ['rev-parse', 'HEAD']);
  const contractPath = path.join(root, 'contract.json'); writeFileSync(contractPath, JSON.stringify(contract));
  return { root, contract, contractPath };
};

test('accepts a complete Git-object-backed readiness contract', () => {
  const fixture = createFixture();
  try { assert.deepEqual(inspectReadiness({ repo: fixture.root, contractPath: fixture.contractPath }).diagnostics, []); }
  finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('fails closed for duplicate ownership, missing symbol, and stale baseline successors', () => {
  const fixture = createFixture();
  try {
    fixture.contract.owners.push({ ticket: '#102', scope: 'duplicate' }); writeFileSync(fixture.contractPath, JSON.stringify(fixture.contract));
    assert.ok(inspectReadiness({ repo: fixture.root, contractPath: fixture.contractPath }).diagnostics.includes('ownership_missing_or_duplicate'));
    fixture.contract.owners.pop(); fixture.contract.codeEvidence[0].symbol = 'not-present'; writeFileSync(fixture.contractPath, JSON.stringify(fixture.contract));
    assert.ok(inspectReadiness({ repo: fixture.root, contractPath: fixture.contractPath }).diagnostics.some((item) => item.startsWith('symbol_missing:')));
    fixture.contract.codeEvidence[0].symbol = sourceContract.codeEvidence[0].symbol; writeFileSync(fixture.contractPath, JSON.stringify(fixture.contract));
    delete fixture.contract.courseAuthorityAdapter; writeFileSync(fixture.contractPath, JSON.stringify(fixture.contract));
    assert.ok(inspectReadiness({ repo: fixture.root, contractPath: fixture.contractPath }).diagnostics.includes('course_authority_adapter_incomplete'));
    fixture.contract.courseAuthorityAdapter = structuredClone(sourceContract.courseAuthorityAdapter); writeFileSync(fixture.contractPath, JSON.stringify(fixture.contract));
    fixture.contract.canonicalStorage = ['courses/{courseId}/modules/{moduleId}/materials/{courseMaterialId}']; writeFileSync(fixture.contractPath, JSON.stringify(fixture.contract));
    assert.ok(inspectReadiness({ repo: fixture.root, contractPath: fixture.contractPath }).diagnostics.includes('course_authority_adapter_incomplete'));
    fixture.contract.canonicalStorage = structuredClone(sourceContract.canonicalStorage); writeFileSync(fixture.contractPath, JSON.stringify(fixture.contract));
    write(fixture.root, 'unrelated.txt', 'stale\n'); git(fixture.root, ['add', '.']); git(fixture.root, ['commit', '-m', 'unrelated']);
    assert.ok(inspectReadiness({ repo: fixture.root, contractPath: fixture.contractPath }).diagnostics.some((item) => item.startsWith('baseline_head_stale:')));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
