import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('preserves PRD0062b as a dormant future plan without restoring product code', () => {
  const status = read('documentation/tasks/PRD0062b/DORMANT-STATUS-2026-07-18.md');
  const readme = read('documentation/tasks/PRD0062b/README.md');
  const authority = read('documentation/tasks/PRD0062b/authority-and-provenance.md');
  const postCleanupPlan = read(
    'documentation/tasks/PRD0062b/evidence/P2-post-cleanup-r2-proof-execution-plan-20260718.md',
  );
  const fullDocumentDecision = read(
    'documentation/tasks/PRD0062b/approval-record-2026-07-17-student-safe-full-pdf-streaming.md',
  );

  assert.match(status, /Status: DORMANT_AFTER_CODE_RESET/);
  assert.match(status, /a5059a7d4292062af8de82c5d0c04152645288fd/);
  assert.match(status, /d373e0d0ef01db0e2eb5bad29098750d4d9427e1/);
  assert.match(readme, /Status: DORMANT_AFTER_CODE_RESET/);
  assert.doesNotMatch(readme, /Status: APPROVED_ACTIVE/);
  assert.doesNotMatch(readme, /Active production direction/);
  assert.match(authority, /DORMANT_AFTER_CODE_RESET/);
  assert.doesNotMatch(postCleanupPlan, /— authorized now/);
  assert.match(fullDocumentDecision, /complete immutable student-safe PDF/);
  assert.match(fullDocumentDecision, /Browser Run, page rasterization, PDF splitting/);

  const checkerOutput = execFileSync(
    process.execPath,
    ['documentation/tasks/PRD0062b/check-canonical-plan.mjs'],
    { encoding: 'utf8' },
  );
  assert.match(checkerOutput, /PRD0062b dormant archive:/);

  for (const retiredProductPath of [
    'src/services/book-activity',
    'src/services/book-assembly',
    'src/services/book-delivery',
    'cloudflare/src/book-source-worker',
  ]) {
    assert.equal(existsSync(retiredProductPath), false, retiredProductPath);
  }
});
