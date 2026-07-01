const fs = require('fs');
const path = require('path');

const root = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const linesOf = (relativePath) => read(relativePath).split(/\r?\n/);

function findEvidence(relativePath, pattern, label) {
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  const lines = linesOf(relativePath);
  const index = lines.findIndex((line) => regex.test(line));
  if (index === -1) {
    return { label, file: relativePath, found: false };
  }
  return {
    label,
    file: relativePath,
    line: index + 1,
    excerpt: lines[index].trim(),
    found: true,
  };
}

const traceability = 'tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md';
const taskList = 'tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md';
const architecture = 'documentation/architecture/ielts-reading-v2-listening-unification.md';
const uploadAuthority = 'documentation/architecture/upload-storage-authority.md';

const deferrals = [
  {
    id: 'DEF-GDRIVE',
    classification: 'approved_deferral',
    closureImpact: 'separate cleanup/deletion task required; no PRD-0055 cleanup/delete claimed',
    evidence: [
      findEvidence(traceability, /`DEF-GDRIVE`/, 'deferral registry'),
      findEvidence(traceability, /FR-020A .*Google Drive/, 'traceability row'),
      findEvidence(uploadAuthority, /Google Drive is obsolete/, 'upload authority'),
    ],
  },
  {
    id: 'DEF-READ-RUNTIME',
    classification: 'approved_deferral',
    closureImpact: 'PRD-0061 remains required before Reading V2 runtime visual alignment can close',
    evidence: [
      findEvidence(traceability, /`DEF-READ-RUNTIME`/, 'deferral registry'),
      findEvidence(traceability, /FR-027 .*Runtime visual alignment/, 'traceability row'),
      findEvidence(traceability, /`DAG-90` \| PRD-0061 Reading V2 runtime/, 'dependency DAG'),
    ],
  },
  {
    id: 'DEF-R2-MIGRATION',
    classification: 'approved_deferral',
    closureImpact: 'future migration PRD required; on-read migration remains prohibited',
    evidence: [
      findEvidence(traceability, /`DEF-R2-MIGRATION`/, 'deferral registry'),
      findEvidence(traceability, /FR-023K .*Legacy R2 Listening records/, 'legacy R2 row'),
    ],
  },
  {
    id: 'DEF-R2-MIGRATION-PARTIAL',
    classification: 'approved_partial_deferral',
    closureImpact: 'legacy read adapter is local compatibility only; broad migration remains future',
    evidence: [
      findEvidence(traceability, /`DEF-R2-MIGRATION-PARTIAL`/, 'deferral registry'),
      findEvidence(traceability, /FR-023K .*Legacy R2 Listening records/, 'legacy R2 row'),
    ],
  },
  {
    id: 'DEF-DEDUP',
    classification: 'approved_conditional_deferral',
    closureImpact: 'checksum metadata exists; content dedup waits for future product/privacy review',
    evidence: [
      findEvidence(traceability, /`DEF-DEDUP`/, 'deferral registry'),
      findEvidence(traceability, /DATA-31 .*checksum metadata/, 'traceability row'),
    ],
  },
  {
    id: 'DEF-CROSS-TEST-REUSE',
    classification: 'approved_deferral',
    closureImpact: 'implicit reuse remains forbidden; future trusted registry-reference operation required',
    evidence: [
      findEvidence(traceability, /`DEF-CROSS-TEST-REUSE`/, 'deferral registry'),
      findEvidence(traceability, /DATA-34 .*Cross-test reuse/, 'traceability row'),
    ],
  },
  {
    id: 'DEF-MALWARE',
    classification: 'approved_conditional_deferral',
    closureImpact: 'strict audio validation remains in scope; general malware scanning waits for risk review',
    evidence: [
      findEvidence(traceability, /`DEF-MALWARE`/, 'deferral registry'),
      findEvidence(traceability, /DATA-92 .*malware scanning/, 'traceability row'),
    ],
  },
  {
    id: 'DEF-SHARED-ANSWER',
    classification: 'approved_conditional_deferral',
    closureImpact: 'shared answer-input extraction waits for two identical neutral consumers',
    evidence: [
      findEvidence(traceability, /`DEF-SHARED-ANSWER`/, 'deferral registry'),
      findEvidence(traceability, /Task 3\.13 confirms shared answer inputs remain deferred/, 'current evidence registry'),
    ],
  },
  {
    id: 'DEP-BUCKET-C',
    classification: 'unimplemented_bucket_residue',
    closureImpact: 'Bucket C N1/N2/N3/N4 remain unimplemented and cannot be counted as parent completion',
    evidence: [
      findEvidence(traceability, /Bucket C N1-N4 remain unimplemented/, 'coverage contract'),
      findEvidence(traceability, /`DEP-BUCKET-C`/, 'dependency registry'),
    ],
  },
];

const task914Evidence = [
  findEvidence(taskList, /Google Drive cleanup\/deletion remains a separate named task/, 'Task 9.14 Google Drive bullet'),
  findEvidence(taskList, /deep runtime abstraction remains a separate named PRD/, 'Task 9.14 runtime abstraction bullet'),
  findEvidence(taskList, /Reading V2 runtime visual alignment remains explicitly deferred/, 'Task 9.14 Reading V2 runtime bullet'),
  findEvidence(taskList, /deferred question-card\/mobile shared primitives/, 'Task 9.14 primitive bullet'),
  findEvidence(taskList, /large-file comprehension maps list future decomposition seams/, 'Task 9.14 large-file map bullet'),
  findEvidence(taskList, /no deferred requirement may be omitted/, 'Task 9.14 traceability bullet'),
  findEvidence(architecture, /question-card, and mobile-layout primitives remain deferred/, 'architecture primitive deferral'),
  findEvidence(architecture, /Google Drive upload\/playback\/validation references remain/, 'architecture Google Drive residue'),
];

const largeMapDir = path.join(root, 'tasks/large-file-maps-0055');
const largeMaps = fs.existsSync(largeMapDir)
  ? fs.readdirSync(largeMapDir)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => {
        const relativePath = `tasks/large-file-maps-0055/${name}`;
        const content = read(relativePath);
        const lines = content.split(/\r?\n/).length;
        return {
          file: relativePath,
          lines,
          hasLineCount: /line count|Current:|Current line count|HEAD/.test(content),
          hasResponsibilityBoundary: /responsibility|boundary|protected region|No .*authority|No .*runtime|No .*Task/i.test(content),
          hasFutureSeam: /future seam|future seams|future decomposition|seam/i.test(content),
        };
      })
  : [];

const missingEvidence = [
  ...deferrals.flatMap((entry) => entry.evidence.filter((item) => !item.found).map((item) => `${entry.id}:${item.label}`)),
  ...task914Evidence.filter((item) => !item.found).map((item) => `task9.14:${item.label}`),
  ...largeMaps
    .filter((entry) => !entry.hasLineCount || !entry.hasResponsibilityBoundary || !entry.hasFutureSeam)
    .map((entry) => `large-map:${entry.file}`),
];

const report = {
  generatedAt: new Date().toISOString(),
  verdict: missingEvidence.length === 0 ? 'LOCAL_DEFERRED_RESIDUE_REVIEW_PASS_NOT_CLOSURE' : 'LOCAL_DEFERRED_RESIDUE_REVIEW_PARTIAL',
  scope: 'PRD-0055 Task 9.14 local deferred-residue classification only',
  closureBoundary: [
    'Task 9.14 remains unchecked until final dirty-tree, deployed/live/private proof, rollout, and parent acceptance gates are complete.',
    'No cleanup/delete, deploy, selected-user rollout, percentage rollout, commit, push, or production mutation is claimed.',
  ],
  counts: {
    deferralsReviewed: deferrals.length,
    task914EvidenceItems: task914Evidence.length,
    largeFileMaps: largeMaps.length,
    largeFileMapsWithLineCounts: largeMaps.filter((entry) => entry.hasLineCount).length,
    largeFileMapsWithResponsibilityBoundaries: largeMaps.filter((entry) => entry.hasResponsibilityBoundary).length,
    largeFileMapsWithFutureSeams: largeMaps.filter((entry) => entry.hasFutureSeam).length,
    missingEvidence: missingEvidence.length,
  },
  task914Evidence,
  deferrals,
  largeMaps,
  missingEvidence,
};

const outputPath = path.join(root, 'output/prd0055-task9-local-readiness/task9-deferred-residue-review-report.json');
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  report: path.relative(root, outputPath).replace(/\\/g, '/'),
  verdict: report.verdict,
  counts: report.counts,
}, null, 2));

if (missingEvidence.length > 0) {
  process.exitCode = 1;
}
