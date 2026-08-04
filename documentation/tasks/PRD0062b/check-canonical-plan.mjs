import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';

const repoRoot = process.cwd();
const docRoot = resolve(repoRoot, 'documentation/tasks/PRD0062b');
const taskOverrides = JSON.parse(readFileSync(resolve(docRoot, 'canonical-task-overrides.json'), 'utf8'));
const baseline = '9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd';
const amendment = '043a6d9b1f96a76f200ea753ca353e0376be65a7';
const additiveIds = new Set(['C04-A-TIMER']);
const requiredPacketContractSections = [
  'Storage',
  'Security/rules',
  'UI/accessibility/announcements',
  'Migration/compatibility',
  'Tests',
  'Browser/runtime proof',
  'Authority reconciliation',
  'Evidence classification',
  'Rollback/blockers',
];
const allowedComponentStatuses = new Set([
  'PLANNED',
  'IMPLEMENTING',
  'IMPLEMENTED_UNREVIEWED',
  'VERIFIED',
  'REVIEW_BLOCKED',
  'CLOSURE_BLOCKED',
]);
const componentFiles = [
  'tasks-book-activity-01-domain-security-foundation.md',
  'tasks-book-activity-02-source-pdf-delivery.md',
  'tasks-book-activity-03-book-assembly-workspace.md',
  'tasks-book-activity-04-activity-runtime.md',
  'tasks-book-activity-05-book-homework.md',
  'tasks-book-activity-06-updates-checkpoints-notifications.md',
  'tasks-book-activity-07-cross-feature-delivery-results.md',
  'tasks-book-activity-08-pilot-hardening-release.md',
];

const errors = [];
const seenWordingOverrides = new Set();
const seenCheckboxOverrides = new Set();
const gitBlob = (revision, file) => execFileSync('git', ['show', `${revision}:documentation/tasks/PRD0062/${file}`]);
const localText = (file) => readFileSync(resolve(docRoot, file), 'utf8');
const dormant = localText('DORMANT-STATUS-2026-07-18.md').includes('Status: DORMANT_AFTER_CODE_RESET');
const dormantExternalEvidenceLinks = new Set([
  '../PRD0062/contracts-book-activity-packet-2.md',
  '../PRD0062/findings-packet-2B-source-version-skeleton.md',
]);
const lineRows = (text) => text.split(/\r?\n/).map((line, index) => {
  const match = line.match(/^(\s*)-\s+\[([ xX])\]\s+(\S+)\s+(.*)/u);
  if (!match) return null;
  const id = match[3];
  if (!/^\d+\.\d+[a-z]?/u.test(id) && !/^T-/u.test(id) && !additiveIds.has(id)) return null;
  return {
    indent: match[1].length,
    checked: match[2].toLowerCase() === 'x',
    id,
    text: match[4],
    line: index + 1,
  };
}).filter(Boolean);

const recoveredBody = (fileBuffer) => {
  const marker = Buffer.from([10, 10, 35, 32]);
  const bodyStart = fileBuffer.indexOf(marker);
  return bodyStart < 0 ? null : fileBuffer.subarray(bodyStart + 2);
};

const sameRows = (expected, actual, label) => {
  let actualIndex = 0;
  for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex += 1) {
    while (actual[actualIndex] && additiveIds.has(actual[actualIndex].id)) {
      if (label !== 'tasks-book-activity-04-activity-runtime.md' || actual[actualIndex].id !== 'C04-A-TIMER') {
        errors.push(`${label}: unexpected additive row ${actual[actualIndex].id}`);
      }
      actualIndex += 1;
    }
    const left = expected[expectedIndex];
    const right = actual[actualIndex];
    const wordingKey = `${label}:${left.id}`;
    const wordingOverride = taskOverrides.wording?.[label]?.[left.id];
    const expectedText = wordingOverride ?? left.text;
    const checkboxOverride = taskOverrides.checkboxes?.[label]?.[left.id];
    if (!right || left.id !== right.id || expectedText !== right.text || left.indent !== right.indent) {
      errors.push(`${label}: task wording/order mismatch at row ${expectedIndex + 1} (${left.id})`);
      break;
    }
    if (wordingOverride !== undefined) seenWordingOverrides.add(wordingKey);
    if (checkboxOverride !== undefined) {
      seenCheckboxOverrides.add(wordingKey);
      if (right.checked !== checkboxOverride) {
        errors.push(`${label}:${right.line}: checkbox override mismatch for ${right.id}; expected ${checkboxOverride ? '[x]' : '[ ]'}`);
      }
    }
    actualIndex += 1;
  }
  while (actual[actualIndex]) {
    if (!additiveIds.has(actual[actualIndex].id)) errors.push(`${label}: unexpected task row ${actual[actualIndex].id}`);
    actualIndex += 1;
  }
};

const checkParentNesting = (rows, label) => {
  for (let index = 0; index < rows.length; index += 1) {
    const parent = rows[index];
    if (!parent.checked) continue;
    for (let childIndex = index + 1; childIndex < rows.length; childIndex += 1) {
      const child = rows[childIndex];
      if (child.indent <= parent.indent) break;
      if (!child.checked) {
        errors.push(`${label}:${parent.line}: checked parent ${parent.id} has open child ${child.id}`);
        break;
      }
    }
  }
};

const checkPacketContract = (text, label) => {
  for (const section of requiredPacketContractSections) {
    const pattern = new RegExp(`^### ${section.replaceAll('/', '\\/')}$`, 'imu');
    if (!pattern.test(text)) errors.push(`${label}: missing amendment packet-contract section ${section}`);
  }
};

for (const file of componentFiles) {
  const expectedText = gitBlob(baseline, file).toString('utf8');
  const expectedRows = lineRows(expectedText);
  const activeText = localText(file);
  const activeRows = lineRows(activeText);
  const recoveredBuffer = readFileSync(resolve(docRoot, 'recovered', file));
  if (!recoveredBody(recoveredBuffer)?.equals(gitBlob(baseline, file))) {
    errors.push(`recovered/${file}: body is not byte-equal to ${baseline}`);
  }
  sameRows(expectedRows, activeRows, file);
  checkParentNesting(activeRows, file);
  checkPacketContract(activeText, file);
  if (!/CANONICAL FULL-WORDING CHECKLIST/u.test(activeText)) {
    errors.push(`${file}: missing canonical full-wording banner`);
  }
  const status = activeText.match(/^Status: ([A-Z_]+)(?:\.|\s|$)/mu)?.[1];
  if (!status || !allowedComponentStatuses.has(status)) {
    errors.push(`${file}: missing governed component status`);
  }
}

for (const [file, rows] of Object.entries(taskOverrides.wording ?? {})) {
  for (const id of Object.keys(rows)) {
    const key = `${file}:${id}`;
    if (!seenWordingOverrides.has(key)) errors.push(`unused or missing wording override ${key}`);
  }
}
for (const [file, rows] of Object.entries(taskOverrides.checkboxes ?? {})) {
  for (const id of Object.keys(rows)) {
    const key = `${file}:${id}`;
    if (!seenCheckboxOverrides.has(key)) errors.push(`unused or missing checkbox override ${key}`);
  }
}

const expectedStatuses = {
  'tasks-book-activity-01-domain-security-foundation.md': 'VERIFIED',
  'tasks-book-activity-02-source-pdf-delivery.md': 'CLOSURE_BLOCKED',
  'tasks-book-activity-03-book-assembly-workspace.md': 'CLOSURE_BLOCKED',
  'tasks-book-activity-04-activity-runtime.md': 'IMPLEMENTING',
  'tasks-book-activity-05-book-homework.md': 'PLANNED',
  'tasks-book-activity-06-updates-checkpoints-notifications.md': 'PLANNED',
  'tasks-book-activity-07-cross-feature-delivery-results.md': 'IMPLEMENTING',
  'tasks-book-activity-08-pilot-hardening-release.md': 'IMPLEMENTING',
};
for (const [file, expectedStatus] of Object.entries(expectedStatuses)) {
  const status = localText(file).match(/^Status: ([A-Z_]+)(?:\.|\s|$)/mu)?.[1];
  if (status !== expectedStatus) errors.push(`${file}: status ${status ?? 'missing'} != ${expectedStatus}`);
}

for (const [file, revision, source] of [
  ['tasks-book-activity-master-orchestration.md', baseline, 'documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md'],
  ['prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md', amendment, 'documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md'],
]) {
  const localPath = file.startsWith('prd-book-based') ? resolve(docRoot, file) : resolve(docRoot, 'recovered', file);
  const local = readFileSync(localPath);
  const expected = execFileSync('git', ['show', `${revision}:${source}`]);
  if (!recoveredBody(local)?.equals(expected)) errors.push(`recovered/${file}: body is not byte-equal to ${revision}`);
}

const orchestrationFiles = [
  'tasks-book-activity-master-orchestration.md',
  'streamlined-prototype-orchestration.md',
];
for (const file of orchestrationFiles) {
  const text = localText(file);
  if (/^\s*[-*]\s+\[[ xX]\]/mu.test(text)) errors.push(`${file}: orchestration file owns execution checkbox`);
}

for (const file of [...componentFiles, ...orchestrationFiles]) {
  const full = resolve(docRoot, file);
  if (!existsSync(full)) errors.push(`missing active file ${file}`);
  const links = [...localText(file).matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/gu)].map((match) => match[1]);
  for (const link of links) {
    if (/^(?:https?:|mailto:)/u.test(link)) continue;
    const target = resolve(dirname(full), link);
    if (!existsSync(target) && !(dormant && dormantExternalEvidenceLinks.has(link))) {
      errors.push(`${file}: broken local link ${link}`);
    }
  }
}

const requireSnippets = (file, snippets) => {
  const text = localText(file);
  for (const snippet of snippets) {
    if (!text.includes(snippet)) errors.push(`${file}: missing required authority text: ${snippet}`);
  }
};

requireSnippets('prd-book-based-interactive-activity-runtime-and-assembly.md', [
  'The production runtime uses the original immutable student-safe PDF. It does not pre-render, split, rasterize, or generate a derived PDF for each page.',
  'An assigned student is allowed to view the complete student-safe Book PDF; page-level transport restriction is not a product requirement.',
  'If no secure, visually faithful, recoverable, and no-cost production streaming design is proven, Source Delivery and its packet remain `CLOSURE_BLOCKED`.',
  'The exact teacher correction mechanism for a wrongly generated or uncertain `presentationMode` is reopened and requires a separate explicit product decision.',
  'the workspace MUST expose `Copy Unit JSON Prompt`',
  'The revision workspace MUST expose `Copy Revision Prompt`',
  'the project MUST maintain a versioned IELTS Reading and Listening task-type coverage matrix',
  'Source labels MAY appear only as citations or response-control correspondence',
  'Full V1 includes an optional student-controlled personal SVG timer.',
]);
requireSnippets('README.md', [
  dormant
    ? 'restart at **P2 — Unit/page/source Assembly**'
    : 'Current packet pointer: **P2 — Unit/page/source Assembly**.',
  'an authorized student receives one governed stream for the complete pinned student-safe PDF',
  'Failure to prove the no-cost path keeps P2 `CLOSURE_BLOCKED`; it does not authorize Browser Run or a paid fallback.',
]);
requireSnippets('tasks-book-activity-master-orchestration.md', [
  'Status: CLOSURE_BLOCKED — current packet P2',
  'Page Groups remain Activity mapping metadata, not document transport authorization.',
  'Current packet is P2.',
]);
requireSnippets('tasks-book-activity-02-source-pdf-delivery.md', [
  'Implement student-safe source readiness and authenticated full-document streaming',
  'Stream the complete pinned student-safe PDF without buffering the whole file in Worker or application memory.',
  '20–500 page documents, 100–200 uploads per day, and bursts of 2–5 simultaneous uploads or deliveries',
]);
requireSnippets('tasks-book-activity-03-book-assembly-workspace.md', [
  'Implement required Copy Unit JSON Prompt and Copy Revision Prompt capabilities; teacher use remains optional',
  'A wrongly generated or uncertain `presentationMode` must remain a publish blocker',
]);
requireSnippets('tasks-book-activity-04-activity-runtime.md', [
  'retain the optional student-controlled personal timer for Full V1',
  'must not become competing Activity headings, navigator numbering, progress numbering, or a second ordering system',
]);
requireSnippets('tasks-book-activity-08-pilot-hardening-release.md', [
  'Measure 20–500-page PDFs, 100–200 PDF uploads per day, and bursts of 2–5 simultaneous uploads/deliveries.',
  'any billed usage blocks release',
  'Browser Run, page rendering, a paid tier, or copied targets cannot satisfy this row.',
  'Complete and verify the versioned IELTS Reading and Listening task-type coverage matrix',
  'required `Copy Unit JSON Prompt` and `Copy Revision Prompt` capabilities',
]);

const forbiddenActivePatterns = [
  /estimated backend cost/iu,
  /measured rendition cost/iu,
  /authorized Unit rendition <=25MiB/iu,
  /\$0\.05 per active student-hour/iu,
  /\$0\.25 per Unit/iu,
  /authorized Source Version and page slice/iu,
  /authorized Source page slice/iu,
  /createUnitRendition/iu,
  /authorizeSourceDelivery\(deliveryContext, requestedPages\)/iu,
  /authorized student receives exact Unit excerpt/iu,
  /Runtime authorizes a Unit page slice/iu,
  /V1 correction path for a wrongly generated presentation mode is JSON re-import only/iu,
  /workspace MAY offer `Copy Unit JSON Prompt`/iu,
  /### 13\.4 Optional Copy Revision Prompt/iu,
  /A personal timer is deferred to V1\.1/iu,
  /optional student personal timer, but only if pilot evidence/iu,
  /No enforced timer exists, and V1 behavior has no dependency on a personal timer/iu,
  /Generate exactly one sanitized read-only physical-page PDF artifact/iu,
  /transport\/cache returns exactly one sanitized physical-page PDF artifact/iu,
  /matching one-page rendition/iu,
  /one requested page artifact per transport\/cache request/iu,
  /must reauthorize each requested page before changing Activity state/iu,
];
for (const file of [...componentFiles, ...orchestrationFiles, 'README.md', 'prd-book-based-interactive-activity-runtime-and-assembly.md']) {
  const fullText = localText(file);
  const text = componentFiles.includes(file)
    ? lineRows(fullText).map((row) => row.text).join('\n')
    : fullText;
  for (const pattern of forbiddenActivePatterns) {
    if (pattern.test(text)) errors.push(`${file}: forbidden superseded product wording matches ${pattern}`);
  }
}

for (const file of [
  'approval-record-2026-07-17-student-safe-full-pdf-streaming.md',
  'authority-and-provenance.md',
  'reconciliation-ledger.md',
  'traceability-book-activity-v1.md',
]) {
  if (!existsSync(resolve(docRoot, file))) errors.push(`missing current authority file ${file}`);
}
requireSnippets('authority-and-provenance.md', [
  'Student-safe full-document authority — approved 2026-07-17',
  'Packet 1 remains `VERIFIED`',
]);
requireSnippets('traceability-book-activity-v1.md', [
  'Cross-component Source Delivery foundation — superseded and corrected 2026-07-17',
  'Page Groups and `physicalPageNumber` are mapping/navigation metadata, not transport objects',
]);

const totalRows = componentFiles.reduce((sum, file) => sum + lineRows(localText(file)).length, 0);
if (totalRows !== 748) errors.push(`canonical task total ${totalRows} != 748 (747 baseline + one explicit additive row)`);

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exitCode = 1;
} else {
  const label = dormant ? 'PRD0062b dormant archive' : 'PRD0062b canonical plan';
  console.log(`${label}: ${componentFiles.length} governed components, ${totalRows} task rows (747 baseline + C04-A-TIMER), ${seenWordingOverrides.size} approved wording overrides, ${seenCheckboxOverrides.size} checkbox overrides, recovery/amendment authority ${baseline}/${amendment}.`);
}
