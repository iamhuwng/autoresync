const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');

function readText(relativePath) {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  const text = (
    buffer[0] === 0xff && buffer[1] === 0xfe
      ? buffer.toString('utf16le')
      : buffer.includes(0)
        ? buffer.toString('utf16le')
        : buffer.toString('utf8')
  );
  return text.replace(/^\uFEFF/, '');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function tryReadJson(relativePath) {
  if (!exists(relativePath)) {
    return null;
  }

  try {
    return readJson(relativePath);
  } catch (error) {
    return { parseError: error.message };
  }
}

function parseTraceabilityRows() {
  const text = readText('tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md');
  return text
    .split(/\r?\n/)
    .filter((line) => /^\| REG-\d+ \|/.test(line))
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      return {
        id: cells[0],
        summary: cells[1],
        parentSource: cells[2],
        ownerTask: cells[3],
        ownerAuthority: cells[4],
        childRequirement: cells[5],
        implementationStatus: cells[6],
        verificationTechnique: cells[7],
        evidence: cells[8],
        deferral: cells[9],
        dependencies: cells[10],
      };
    });
}

function classify(row) {
  const text = [
    row.implementationStatus,
    row.verificationTechnique,
    row.evidence,
    row.deferral,
    row.dependencies,
  ].join(' ').toLowerCase();

  const hasCurrentLocalEvidence =
    /\bcurrent (local|evidence)\b/.test(text)
    || text.includes('localhost')
    || text.includes('ev-0060a')
    || text.includes('ev-0060b')
    || text.includes('ev-final-a')
    || text.includes('ev-final-b')
    || text.includes('ev-final-c')
    || text.includes('ev-final-d')
    || text.includes('ev-final-j')
    || text.includes('ev-final-r');

  const plannedOnly =
    text.includes('planned evidence only')
    || text.includes('implementation not started')
    || text.includes('planned/deferred evidence only');

  const explicitlyDeferred =
    !/^not deferred\.$/i.test(row.deferral)
    || text.includes('approved deferral')
    || text.includes('def-');

  const pendingLocalProof =
    text.includes('browser proof pending')
    || text.includes('browser/network proof pending')
    || text.includes('remote/browser load execution pending')
    || text.includes('full section 27 execution')
    || text.includes('final row execution')
    || text.includes('final acceptance')
    || text.includes('pending');

  const failedPartialLocalProof =
    text.includes('failed to prove')
    || text.includes('failed because')
    || text.includes('remains blocked after');

  const baselineOnly =
    !hasCurrentLocalEvidence
    && !plannedOnly
    && /existing baseline|baseline \+ planned|existing verified baseline|partially implemented baseline/.test(text);

  if (plannedOnly) return 'planned_or_not_started';
  if (hasCurrentLocalEvidence && failedPartialLocalProof) return 'partial_local_evidence_needs_row_recheck';
  if (explicitlyDeferred && !hasCurrentLocalEvidence) return 'approved_deferred_future';
  if (baselineOnly) return 'baseline_only_needs_current_local_recheck';
  if (hasCurrentLocalEvidence && pendingLocalProof) return 'partial_local_evidence_needs_row_recheck';
  if (hasCurrentLocalEvidence) return 'current_local_evidence_present';
  return 'needs_manual_review';
}

const boundaryStaticReportPath = 'output/prd0055-task9-local-readiness/boundary-static-readiness-report.json';
const assessmentGuardrailsReportPath = 'output/prd0055-task9-local-readiness/assessment-guardrails-shared-report.json';
const section27BaselineVitestReportPath = 'output/prd0055-task9-local-readiness/section27-baseline-current-vitest-report.json';
const section27ListeningUploadPreviewVitestReportPath = 'output/prd0055-task9-local-readiness/section27-listening-upload-preview-vitest-report.json';
const section27MonitorUiVitestReportPath = 'output/prd0055-task9-local-readiness/section27-monitor-ui-vitest-report.json';
const section27StorageGraceVitestReportPath = 'output/prd0055-task9-local-readiness/section27-storage-grace-vitest-report.json';
const section27LiveLoadDriftVitestReportPath = 'output/prd0055-task9-local-readiness/section27-live-load-drift-vitest-report.json';
const section27LiveDeliveryEndpointReportPath = 'output/prd0055-task9-local-readiness/section27-live-delivery-client-endpoint-report.json';
const section27Reg79LocalPrivateWebkitReportPath = 'output/prd0055-task9-local-readiness/section27-reg79-local-private-webkit-report.json';
const section27Reg79AudioProgressRefreshFallbackReportPath = 'output/prd0055-task9-local-readiness/reg79-audio-progress-panel-refresh-fallback-report.json';
const section27Reg79LocalPrivateWebkitProofPath = 'output/prd0055-task9-local-readiness/reg79-local-private-webkit/reg79-local-private-webkit-proof.json';
const task8ExpandedPlaywrightReportPath = 'output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json';
const task8LocalMatrixSupplementPath = 'output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json';
const boundaryStaticReport = tryReadJson(boundaryStaticReportPath);
const assessmentGuardrailsReport = tryReadJson(assessmentGuardrailsReportPath);
const section27BaselineVitestReport = tryReadJson(section27BaselineVitestReportPath);
const section27ListeningUploadPreviewVitestReport = tryReadJson(section27ListeningUploadPreviewVitestReportPath);
const section27MonitorUiVitestReport = tryReadJson(section27MonitorUiVitestReportPath);
const section27StorageGraceVitestReport = tryReadJson(section27StorageGraceVitestReportPath);
const section27LiveLoadDriftVitestReport = tryReadJson(section27LiveLoadDriftVitestReportPath);
const section27LiveDeliveryEndpointReport = tryReadJson(section27LiveDeliveryEndpointReportPath);
const section27Reg79LocalPrivateWebkitReport = tryReadJson(section27Reg79LocalPrivateWebkitReportPath);
const section27Reg79AudioProgressRefreshFallbackReport = tryReadJson(section27Reg79AudioProgressRefreshFallbackReportPath);
const section27Reg79LocalPrivateWebkitProof = tryReadJson(section27Reg79LocalPrivateWebkitProofPath);
const task8ExpandedPlaywrightReport = tryReadJson(task8ExpandedPlaywrightReportPath);
const task8LocalMatrixSupplement = tryReadJson(task8LocalMatrixSupplementPath);

const expectedSection27BaselineVitestFiles = [
  'src/config/readingV2FeatureFlags.test.ts',
  'src/routes/teacherRoutes.test.tsx',
  'src/pages/ReadingV2StudioPage.test.tsx',
  'src/pages/ReadingV2StudioSmokePage.test.tsx',
  'src/components/reading-v2/studio/ReadingV2MetadataPanel.test.tsx',
  'src/components/reading-v2/studio/ReadingV2PreviewOverlay.test.tsx',
  'src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx',
  'src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx',
  'src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx',
  'src/features/assessment/shared/components/AssessmentAuthoringHeader.test.tsx',
  'src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx',
  'src/features/assessment/shared/components/AssessmentStatusState.test.tsx',
  'src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx',
];
const expectedSection27ListeningUploadPreviewVitestFiles = [
  'src/services/r2Storage.test.ts',
  'src/services/r2UploadClient.test.ts',
  'src/skills/listening/builders/ListeningTestBuilder.test.tsx',
  'src/skills/listening/components/AudioPlayer.test.tsx',
];
const expectedSection27MonitorUiVitestFiles = [
  'src/pages/TeacherTestMonitorPage.test.tsx',
  'src/components/test/AudioProgressPanel.test.tsx',
  'src/components/test/HeadphoneRequestPanel.test.tsx',
  'src/components/test/StudentProgressCard.test.tsx',
  'src/components/test/TeacherTestControlBar.test.tsx',
  'src/hooks/audio/useAudioSync.test.tsx',
  'src/hooks/monitor/useMonitorControls.test.ts',
];
const expectedSection27StorageGraceVitestFiles = [
  'src/features/assessment/listening/storage/listeningAssetDeletionGovernance.test.ts',
  'src/features/assessment/listening/storage/listeningAssetLifecycle.test.ts',
];
const expectedSection27LiveLoadDriftVitestFiles = [
  'src/features/assessment/listening/live-session/authority/liveAudioAuthorityTransaction.test.ts',
  'src/features/assessment/listening/live-session/authority/liveAudioRuntimeHydration.test.ts',
  'src/features/assessment/listening/live-session/authority/liveAudioSyncPolicy.test.ts',
  'src/features/assessment/listening/live-session/tests/load/listening-live/loadTestHarness.test.ts',
];

function normalizeReportPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

const sharedBoundaryEvidenceIsCurrent =
  boundaryStaticReport
  && !boundaryStaticReport.parseError
  && assessmentGuardrailsReport
  && !assessmentGuardrailsReport.parseError
  && boundaryStaticReport.counts?.sharedFiles === 12
  && boundaryStaticReport.counts?.sharedAuthorityHits === 0
  && boundaryStaticReport.counts?.listeningImportsReading === 0
  && boundaryStaticReport.counts?.readingImportsListening === 0
  && Array.isArray(assessmentGuardrailsReport.violations)
  && assessmentGuardrailsReport.violations.length === 0;

const section27BaselineVitestFiles = Array.isArray(section27BaselineVitestReport?.testResults)
  ? section27BaselineVitestReport.testResults.map((result) => normalizeReportPath(result.name))
  : [];
const missingSection27BaselineVitestFiles = expectedSection27BaselineVitestFiles.filter(
  (expectedFile) => !section27BaselineVitestFiles.some((actualFile) => actualFile.endsWith(expectedFile)),
);
const section27BaselineVitestEvidenceIsCurrent =
  section27BaselineVitestReport
  && !section27BaselineVitestReport.parseError
  && section27BaselineVitestReport.success === true
  && section27BaselineVitestReport.numFailedTestSuites === 0
  && section27BaselineVitestReport.numFailedTests === 0
  && section27BaselineVitestReport.numPassedTestSuites >= 26
  && section27BaselineVitestReport.numPassedTests >= 86
  && missingSection27BaselineVitestFiles.length === 0;

const section27ListeningUploadPreviewVitestFiles = Array.isArray(section27ListeningUploadPreviewVitestReport?.testResults)
  ? section27ListeningUploadPreviewVitestReport.testResults.map((result) => normalizeReportPath(result.name))
  : [];
const missingSection27ListeningUploadPreviewVitestFiles = expectedSection27ListeningUploadPreviewVitestFiles.filter(
  (expectedFile) => !section27ListeningUploadPreviewVitestFiles.some((actualFile) => actualFile.endsWith(expectedFile)),
);
const section27ListeningUploadPreviewVitestEvidenceIsCurrent =
  section27ListeningUploadPreviewVitestReport
  && !section27ListeningUploadPreviewVitestReport.parseError
  && section27ListeningUploadPreviewVitestReport.success === true
  && section27ListeningUploadPreviewVitestReport.numFailedTestSuites === 0
  && section27ListeningUploadPreviewVitestReport.numFailedTests === 0
  && section27ListeningUploadPreviewVitestReport.numPassedTestSuites >= 9
  && section27ListeningUploadPreviewVitestReport.numPassedTests >= 71
  && missingSection27ListeningUploadPreviewVitestFiles.length === 0;

const section27MonitorUiVitestFiles = Array.isArray(section27MonitorUiVitestReport?.testResults)
  ? section27MonitorUiVitestReport.testResults.map((result) => normalizeReportPath(result.name))
  : [];
const missingSection27MonitorUiVitestFiles = expectedSection27MonitorUiVitestFiles.filter(
  (expectedFile) => !section27MonitorUiVitestFiles.some((actualFile) => actualFile.endsWith(expectedFile)),
);
const section27MonitorUiVitestEvidenceIsCurrent =
  section27MonitorUiVitestReport
  && !section27MonitorUiVitestReport.parseError
  && section27MonitorUiVitestReport.success === true
  && section27MonitorUiVitestReport.numFailedTestSuites === 0
  && section27MonitorUiVitestReport.numFailedTests === 0
  && section27MonitorUiVitestReport.numPassedTestSuites >= 14
  && section27MonitorUiVitestReport.numPassedTests >= 34
  && missingSection27MonitorUiVitestFiles.length === 0;

const section27StorageGraceVitestFiles = Array.isArray(section27StorageGraceVitestReport?.testResults)
  ? section27StorageGraceVitestReport.testResults.map((result) => normalizeReportPath(result.name))
  : [];
const missingSection27StorageGraceVitestFiles = expectedSection27StorageGraceVitestFiles.filter(
  (expectedFile) => !section27StorageGraceVitestFiles.some((actualFile) => actualFile.endsWith(expectedFile)),
);
const section27StorageGraceVitestEvidenceIsCurrent =
  section27StorageGraceVitestReport
  && !section27StorageGraceVitestReport.parseError
  && section27StorageGraceVitestReport.success === true
  && section27StorageGraceVitestReport.numFailedTestSuites === 0
  && section27StorageGraceVitestReport.numFailedTests === 0
  && section27StorageGraceVitestReport.numPassedTestSuites >= 4
  && section27StorageGraceVitestReport.numPassedTests >= 32
  && missingSection27StorageGraceVitestFiles.length === 0;

const section27LiveLoadDriftVitestFiles = Array.isArray(section27LiveLoadDriftVitestReport?.testResults)
  ? section27LiveLoadDriftVitestReport.testResults.map((result) => normalizeReportPath(result.name))
  : [];
const missingSection27LiveLoadDriftVitestFiles = expectedSection27LiveLoadDriftVitestFiles.filter(
  (expectedFile) => !section27LiveLoadDriftVitestFiles.some((actualFile) => actualFile.endsWith(expectedFile)),
);
const section27LiveLoadDriftVitestEvidenceIsCurrent =
  section27LiveLoadDriftVitestReport
  && !section27LiveLoadDriftVitestReport.parseError
  && section27LiveLoadDriftVitestReport.success === true
  && section27LiveLoadDriftVitestReport.numFailedTestSuites === 0
  && section27LiveLoadDriftVitestReport.numFailedTests === 0
  && section27LiveLoadDriftVitestReport.numPassedTestSuites >= 8
  && section27LiveLoadDriftVitestReport.numPassedTests >= 16
  && missingSection27LiveLoadDriftVitestFiles.length === 0;

const task8LocalSpecText = exists('e2e/prd0055-task8-live-local.spec.ts')
  ? readText('e2e/prd0055-task8-live-local.spec.ts')
  : '';
const task8LocalMatrixEvidenceIsCurrent =
  task8ExpandedPlaywrightReport
  && !task8ExpandedPlaywrightReport.parseError
  && task8ExpandedPlaywrightReport.stats?.expected === 1
  && task8ExpandedPlaywrightReport.stats?.unexpected === 0
  && task8ExpandedPlaywrightReport.stats?.skipped === 0
  && task8ExpandedPlaywrightReport.stats?.flaky === 0
  && task8LocalMatrixSupplement
  && !task8LocalMatrixSupplement.parseError
  && Array.isArray(task8LocalMatrixSupplement.covered)
  && task8LocalMatrixSupplement.covered.includes('student buffering/loading during teacher pause stays paused and pinned before resume')
  && task8LocalSpecText.includes("getByRole('button', { name: 'Resume All Audio' })")
  && task8LocalSpecText.includes("lastAction: 'resume'")
  && task8LocalSpecText.includes("getByRole('button', { name: 'Next Section' })")
  && task8LocalSpecText.includes("lastAction: 'section'");

const section27Reg79LocalPrivateWebkitEvidenceIsCurrent =
  section27LiveDeliveryEndpointReport
  && !section27LiveDeliveryEndpointReport.parseError
  && section27LiveDeliveryEndpointReport.success === true
  && section27LiveDeliveryEndpointReport.numFailedTestSuites === 0
  && section27LiveDeliveryEndpointReport.numFailedTests === 0
  && section27LiveDeliveryEndpointReport.numPassedTests >= 5
  && section27Reg79AudioProgressRefreshFallbackReport
  && !section27Reg79AudioProgressRefreshFallbackReport.parseError
  && section27Reg79AudioProgressRefreshFallbackReport.success === true
  && section27Reg79AudioProgressRefreshFallbackReport.numFailedTestSuites === 0
  && section27Reg79AudioProgressRefreshFallbackReport.numFailedTests === 0
  && section27Reg79AudioProgressRefreshFallbackReport.numPassedTests >= 12
  && section27Reg79LocalPrivateWebkitReport
  && !section27Reg79LocalPrivateWebkitReport.parseError
  && section27Reg79LocalPrivateWebkitReport.stats?.expected === 1
  && section27Reg79LocalPrivateWebkitReport.stats?.unexpected === 0
  && section27Reg79LocalPrivateWebkitReport.stats?.skipped === 0
  && section27Reg79LocalPrivateWebkitReport.stats?.flaky === 0
  && section27Reg79LocalPrivateWebkitProof
  && !section27Reg79LocalPrivateWebkitProof.parseError
  && section27Reg79LocalPrivateWebkitProof.rangeProbe?.status === 206
  && section27Reg79LocalPrivateWebkitProof.rangeProbe?.acceptRanges === 'bytes'
  && section27Reg79LocalPrivateWebkitProof.rangeProbe?.contentLength === '16'
  && section27Reg79LocalPrivateWebkitProof.rangeProbe?.riff === 'RIFF'
  && Array.isArray(section27Reg79LocalPrivateWebkitProof.deliveryEvents)
  && section27Reg79LocalPrivateWebkitProof.deliveryEvents.some((event) => (
    event.type === 'issue'
    && event.sectionNumber === 1
    && event.hasPrevious === true
  ))
  && section27Reg79LocalPrivateWebkitProof.finalSession?.masterAudioState?.lastAction === 'seek'
  && section27Reg79LocalPrivateWebkitProof.finalSession?.masterAudioState?.section === 1
  && section27Reg79LocalPrivateWebkitProof.finalSession?.masterAudioState?.position === 4;

function localSupplementForRow(rowId) {
  if (sharedBoundaryEvidenceIsCurrent && rowId === 'REG-02') {
    return {
      status: 'current_local_evidence_present',
      reason: 'Current local shared-boundary scan and assessment guardrail prove shared assessment files have no Listening imports.',
      artifacts: [boundaryStaticReportPath, assessmentGuardrailsReportPath],
    };
  }

  if (sharedBoundaryEvidenceIsCurrent && rowId === 'REG-03') {
    return {
      status: 'current_local_evidence_present',
      reason: 'Current local shared-boundary scan and assessment guardrail prove shared assessment files have no audio/passages/parser/storage/session authority hits.',
      artifacts: [boundaryStaticReportPath, assessmentGuardrailsReportPath],
    };
  }

  if (!section27BaselineVitestEvidenceIsCurrent) {
    return null;
  }

  const baselineVitestRows = {
    'REG-04': 'Current local focused Vitest suite proves shared component tests cover roles, headings, actions, status slots, validation states, and children.',
    'REG-06': 'Current local ReadingV2StudioPage and teacher route tests prove the create route still resolves into Studio.',
    'REG-07': 'Current local ReadingV2StudioPage tests prove import route hydration still opens Studio.',
    'REG-08': 'Current local ReadingV2StudioPage tests prove draft route resolution still opens Studio.',
    'REG-09': 'Current local ReadingV2StudioPage and modal adapter tests prove revision route/workflow still opens Studio.',
    'REG-10': 'Current local ReadingV2MetadataPanel and Studio shell tests prove metadata remains editable and publish-compatible.',
    'REG-11': 'Current local ReadingV2StudioShell tests prove passages remain editable across selector/add/remove/edit flows.',
    'REG-12': 'Current local ReadingV2StudioShell tests prove task groups remain editable and duplicable in the selected passage.',
    'REG-13': 'Current local ReadingV2SettingsPanel, metadata, and Studio shell tests prove validation remains Reading V2-owned.',
    'REG-14': 'Current local ReadingV2StudioShell tests prove incomplete drafts still save while publish stays blocked.',
    'REG-15': 'Current local ReadingV2StudioShell, metadata, and page tests prove publish gating and successful publish navigation.',
    'REG-16': 'Current local ReadingV2PreviewOverlay and Studio shell tests prove preview still opens from the current publishable draft.',
  };

  if (baselineVitestRows[rowId]) {
    return {
      status: 'current_local_evidence_present',
      reason: baselineVitestRows[rowId],
      artifacts: [section27BaselineVitestReportPath],
      stats: {
        numPassedTestSuites: section27BaselineVitestReport.numPassedTestSuites,
        numFailedTestSuites: section27BaselineVitestReport.numFailedTestSuites,
        numPassedTests: section27BaselineVitestReport.numPassedTests,
        numFailedTests: section27BaselineVitestReport.numFailedTests,
      },
    };
  }

  if (section27ListeningUploadPreviewVitestEvidenceIsCurrent && rowId === 'REG-25') {
    return {
      status: 'current_local_evidence_present',
      reason: 'Current local focused Vitest suite proves Listening builder upload uses canonical authority, R2 upload/storage mappings, progress callbacks, stale upload protection, and sanitized failure behavior.',
      artifacts: [section27ListeningUploadPreviewVitestReportPath],
      stats: {
        numPassedTestSuites: section27ListeningUploadPreviewVitestReport.numPassedTestSuites,
        numFailedTestSuites: section27ListeningUploadPreviewVitestReport.numFailedTestSuites,
        numPassedTests: section27ListeningUploadPreviewVitestReport.numPassedTests,
        numFailedTests: section27ListeningUploadPreviewVitestReport.numFailedTests,
      },
      limitation: 'Browser plugin did not expose setInputFiles in this runtime; this is current automated local proof, not a fresh browser file-picker proof.',
    };
  }

  if (section27ListeningUploadPreviewVitestEvidenceIsCurrent && rowId === 'REG-27') {
    return {
      status: 'current_local_evidence_present',
      reason: 'Current local focused Vitest suite proves Listening preview/player behavior, including progress UI, source changes, authorized URL refresh, mobile playback, and error/recovery controls.',
      artifacts: [section27ListeningUploadPreviewVitestReportPath],
      stats: {
        numPassedTestSuites: section27ListeningUploadPreviewVitestReport.numPassedTestSuites,
        numFailedTestSuites: section27ListeningUploadPreviewVitestReport.numFailedTestSuites,
        numPassedTests: section27ListeningUploadPreviewVitestReport.numPassedTests,
        numFailedTests: section27ListeningUploadPreviewVitestReport.numFailedTests,
      },
      limitation: 'Browser plugin did not expose setInputFiles in this runtime; this is current automated local proof, not a fresh browser file-picker proof.',
    };
  }

  if (section27MonitorUiVitestEvidenceIsCurrent) {
    const monitorUiRows = {
      'REG-71': 'Current local AudioProgressPanel tests prove progress display follows media time, loaded duration, canonical reload position, seek slider, and manual time edits.',
      'REG-72': 'Current local HeadphoneRequestPanel tests prove pending, approved, and denied headphone requests remain visible to the teacher.',
      'REG-76': 'Current local useAudioSync tests prove stale/interrupted authority does not override newer canonical authority.',
      'REG-78': 'Current local AudioProgressPanel and TeacherTestMonitorPage tests prove private audio refresh/range delivery preserves position, speed, play intent, and authorized source state.',
      'REG-80': 'Current local TeacherTestMonitorPage tests prove teacher monitor reload restores canonical section, play state, speed, and position without defaulting.',
      'REG-82': 'Current local TeacherTestMonitorPage tests prove AudioProgressPanel renders only for in-progress Listening sessions with audio sections and stays absent for non-Listening, completed Listening, and missing-audio-section cases.',
      'REG-83': 'Current local HeadphoneRequestPanel tests prove headphone request panel behavior for pending, approved, and denied states remains intact.',
      'REG-84': 'Current local TeacherTestControlBar tests prove named touch-sized live audio controls and resume gesture ordering before monitor callback writes.',
    };

    if (monitorUiRows[rowId]) {
      return {
        status: 'current_local_evidence_present',
        reason: monitorUiRows[rowId],
        artifacts: [section27MonitorUiVitestReportPath],
        stats: {
          numPassedTestSuites: section27MonitorUiVitestReport.numPassedTestSuites,
          numFailedTestSuites: section27MonitorUiVitestReport.numFailedTestSuites,
          numPassedTests: section27MonitorUiVitestReport.numPassedTests,
          numFailedTests: section27MonitorUiVitestReport.numFailedTests,
        },
      };
    }
  }

  if (section27StorageGraceVitestEvidenceIsCurrent && rowId === 'REG-55') {
    return {
      status: 'current_local_evidence_present',
      reason: 'Current local storage lifecycle/deletion governance tests prove zero-reference durable audio enters pending-delete only after retained references reach zero and deletion is denied until the seven-day grace plus immediate recheck succeeds.',
      artifacts: [section27StorageGraceVitestReportPath],
      stats: {
        numPassedTestSuites: section27StorageGraceVitestReport.numPassedTestSuites,
        numFailedTestSuites: section27StorageGraceVitestReport.numFailedTestSuites,
        numPassedTests: section27StorageGraceVitestReport.numPassedTests,
        numFailedTests: section27StorageGraceVitestReport.numFailedTests,
      },
    };
  }

  if (section27LiveLoadDriftVitestEvidenceIsCurrent) {
    const liveLoadDriftRows = {
      'REG-73': 'Current local live audio runtime hydration tests prove reload uses canonical section and position instead of local playback authority.',
      'REG-74': 'Current local live audio runtime hydration tests prove late joiners hydrate from canonical authority and account elapsed trusted time.',
      'REG-77': 'Current local live audio sync policy tests prove 500 ms soft correction and 2-second hard seek are named test baselines.',
      'REG-81': 'Current local load harness tests prove the 20-session / 2,000-student dry-run methodology, metrics thresholds, network conditions, and report output.',
    };

    if (liveLoadDriftRows[rowId]) {
      return {
        status: 'current_local_evidence_present',
        reason: liveLoadDriftRows[rowId],
        artifacts: [section27LiveLoadDriftVitestReportPath],
        stats: {
          numPassedTestSuites: section27LiveLoadDriftVitestReport.numPassedTestSuites,
          numFailedTestSuites: section27LiveLoadDriftVitestReport.numFailedTestSuites,
          numPassedTests: section27LiveLoadDriftVitestReport.numPassedTests,
          numFailedTests: section27LiveLoadDriftVitestReport.numFailedTests,
        },
      };
    }
  }

  if (task8LocalMatrixEvidenceIsCurrent) {
    const task8LocalMatrixRows = {
      'REG-65': 'Current local Task 8 Playwright matrix proves student buffering/loading during teacher pause stays paused and time-pinned before resume.',
      'REG-67': 'Current local Task 8 Playwright matrix source and green JSON prove Resume All Audio writes canonical resume state before continuing the matrix.',
      'REG-69': 'Current local Task 8 Playwright matrix source and green JSON prove Next Section writes canonical skipToSection state and the student remains on the canonical section after reload.',
    };

    if (task8LocalMatrixRows[rowId]) {
      return {
        status: 'current_local_evidence_present',
        reason: task8LocalMatrixRows[rowId],
        artifacts: [task8ExpandedPlaywrightReportPath, task8LocalMatrixSupplementPath, 'e2e/prd0055-task8-live-local.spec.ts'],
        stats: task8ExpandedPlaywrightReport.stats,
      };
    }
  }

  if (section27Reg79LocalPrivateWebkitEvidenceIsCurrent && rowId === 'REG-79') {
    return {
      status: 'current_local_evidence_present',
      reason: 'Current localhost iOS Safari/WebKit proof validates private live delivery refresh, explicit byte-range content fetch, and canonical seek authority after Safari preload refusal is treated as non-decisive.',
      artifacts: [
        section27LiveDeliveryEndpointReportPath,
        section27Reg79AudioProgressRefreshFallbackReportPath,
        section27Reg79LocalPrivateWebkitReportPath,
        section27Reg79LocalPrivateWebkitProofPath,
        'e2e/prd0055-task9-local-private-delivery-webkit.spec.ts',
        'src/components/test/AudioProgressPanel.tsx',
      ],
      stats: {
        endpointPassedTests: section27LiveDeliveryEndpointReport.numPassedTests,
        refreshFallbackPassedTests: section27Reg79AudioProgressRefreshFallbackReport.numPassedTests,
        webkit: section27Reg79LocalPrivateWebkitReport.stats,
        rangeProbe: section27Reg79LocalPrivateWebkitProof.rangeProbe,
        finalAuthority: section27Reg79LocalPrivateWebkitProof.finalSession.masterAudioState,
      },
    };
  }

  return null;
}

const section27Rows = parseTraceabilityRows();
const rowClassifications = section27Rows.map((row) => ({
  ...row,
  localAuditStatus: localSupplementForRow(row.id)?.status || classify(row),
  localAuditSupplement: localSupplementForRow(row.id),
}));

const statusCounts = rowClassifications.reduce((acc, row) => {
  acc[row.localAuditStatus] = (acc[row.localAuditStatus] || 0) + 1;
  return acc;
}, {});

const blockingStatuses = new Set([
  'planned_or_not_started',
  'baseline_only_needs_current_local_recheck',
  'partial_local_evidence_needs_row_recheck',
  'needs_manual_review',
]);

const localBlockingRows = rowClassifications.filter((row) => blockingStatuses.has(row.localAuditStatus));
const deferredFutureRows = rowClassifications.filter((row) => row.localAuditStatus === 'approved_deferred_future');
const localEvidenceRows = rowClassifications.filter((row) => row.localAuditStatus === 'current_local_evidence_present');

const localArtifacts = [
  'output/prd0055-task8-local-unblock/playwright-task8-final-rerun-report.json',
  'output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json',
  'output/prd0055-task8-local-unblock/playwright-artifacts/local-matrix-supplement.json',
  'output/prd0055-task8-local-unblock/browser-plugin-current-teacher-t8p9j2-human-audible-confirmed.json',
  'output/prd0055-task8-local-unblock/audio-progress-panel-duration-fix-report.json',
  'output/prd0055-task9-local-readiness/boundary-static-readiness-report.json',
  'output/prd0055-task9-local-readiness/task9-compatibility-readiness-report.json',
  'output/prd0055-task9-local-readiness/task9-worker-auth-negative-after-result-review-report.json',
  'output/prd0055-task9-local-readiness/task9-rtdb-rules-predeploy-report.json',
  'output/prd0055-task9-local-readiness/task9-observability-live-regression-report.json',
  'output/prd0055-task9-local-readiness/task9-deferred-residue-review-report.json',
  assessmentGuardrailsReportPath,
  section27BaselineVitestReportPath,
  section27ListeningUploadPreviewVitestReportPath,
  section27MonitorUiVitestReportPath,
  section27StorageGraceVitestReportPath,
  section27LiveLoadDriftVitestReportPath,
  section27LiveDeliveryEndpointReportPath,
  section27Reg79LocalPrivateWebkitReportPath,
  section27Reg79AudioProgressRefreshFallbackReportPath,
  section27Reg79LocalPrivateWebkitProofPath,
  task8ExpandedPlaywrightReportPath,
  task8LocalMatrixSupplementPath,
].map((artifactPath) => ({ path: artifactPath, exists: exists(artifactPath) }));

const playwrightFinal = exists('output/prd0055-task8-local-unblock/playwright-task8-final-rerun-report.json')
  ? readJson('output/prd0055-task8-local-unblock/playwright-task8-final-rerun-report.json').stats
  : null;
const playwrightExpanded = exists('output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json')
  ? readJson('output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json').stats
  : null;

const report = {
  createdAt: new Date().toISOString(),
  verdict: localBlockingRows.length === 0
    ? 'SECTION27_LOCALHOST_ROW_AUDIT_PASS'
    : 'SECTION27_LOCALHOST_ROW_AUDIT_BLOCKED_NOT_PASS',
  scope: 'PRD-0055 Section 27 REG-01..REG-85 localhost-only evidence audit',
  branchHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  operationalBoundary: {
    currentScope: 'localhost-only',
    teacherTarget: 'http://localhost:5173',
    studentTarget: 'http://localhost:5174',
    liveDomainProof: 'deferred; do not use as current unlock path',
  },
  totals: {
    expectedRows: 85,
    actualRows: section27Rows.length,
    statusCounts,
    localBlockingCount: localBlockingRows.length,
    deferredFutureCount: deferredFutureRows.length,
    currentLocalEvidenceCount: localEvidenceRows.length,
  },
  localArtifacts,
  localPlaywrightStats: {
    finalRerun: playwrightFinal,
    expanded: playwrightExpanded,
  },
  section27BaselineVitest: {
    reportPath: section27BaselineVitestReportPath,
    evidenceAccepted: Boolean(section27BaselineVitestEvidenceIsCurrent),
    expectedFiles: expectedSection27BaselineVitestFiles,
    missingFiles: missingSection27BaselineVitestFiles,
    stats: section27BaselineVitestReport && !section27BaselineVitestReport.parseError
      ? {
          numTotalTestSuites: section27BaselineVitestReport.numTotalTestSuites,
          numPassedTestSuites: section27BaselineVitestReport.numPassedTestSuites,
          numFailedTestSuites: section27BaselineVitestReport.numFailedTestSuites,
          numTotalTests: section27BaselineVitestReport.numTotalTests,
          numPassedTests: section27BaselineVitestReport.numPassedTests,
          numFailedTests: section27BaselineVitestReport.numFailedTests,
        }
      : null,
  },
  section27ListeningUploadPreviewVitest: {
    reportPath: section27ListeningUploadPreviewVitestReportPath,
    evidenceAccepted: Boolean(section27ListeningUploadPreviewVitestEvidenceIsCurrent),
    expectedFiles: expectedSection27ListeningUploadPreviewVitestFiles,
    missingFiles: missingSection27ListeningUploadPreviewVitestFiles,
    stats: section27ListeningUploadPreviewVitestReport && !section27ListeningUploadPreviewVitestReport.parseError
      ? {
          numTotalTestSuites: section27ListeningUploadPreviewVitestReport.numTotalTestSuites,
          numPassedTestSuites: section27ListeningUploadPreviewVitestReport.numPassedTestSuites,
          numFailedTestSuites: section27ListeningUploadPreviewVitestReport.numFailedTestSuites,
          numTotalTests: section27ListeningUploadPreviewVitestReport.numTotalTests,
          numPassedTests: section27ListeningUploadPreviewVitestReport.numPassedTests,
          numFailedTests: section27ListeningUploadPreviewVitestReport.numFailedTests,
        }
      : null,
  },
  section27MonitorUiVitest: {
    reportPath: section27MonitorUiVitestReportPath,
    evidenceAccepted: Boolean(section27MonitorUiVitestEvidenceIsCurrent),
    expectedFiles: expectedSection27MonitorUiVitestFiles,
    missingFiles: missingSection27MonitorUiVitestFiles,
    stats: section27MonitorUiVitestReport && !section27MonitorUiVitestReport.parseError
      ? {
          numTotalTestSuites: section27MonitorUiVitestReport.numTotalTestSuites,
          numPassedTestSuites: section27MonitorUiVitestReport.numPassedTestSuites,
          numFailedTestSuites: section27MonitorUiVitestReport.numFailedTestSuites,
          numTotalTests: section27MonitorUiVitestReport.numTotalTests,
          numPassedTests: section27MonitorUiVitestReport.numPassedTests,
          numFailedTests: section27MonitorUiVitestReport.numFailedTests,
        }
      : null,
  },
  section27StorageGraceVitest: {
    reportPath: section27StorageGraceVitestReportPath,
    evidenceAccepted: Boolean(section27StorageGraceVitestEvidenceIsCurrent),
    expectedFiles: expectedSection27StorageGraceVitestFiles,
    missingFiles: missingSection27StorageGraceVitestFiles,
    stats: section27StorageGraceVitestReport && !section27StorageGraceVitestReport.parseError
      ? {
          numTotalTestSuites: section27StorageGraceVitestReport.numTotalTestSuites,
          numPassedTestSuites: section27StorageGraceVitestReport.numPassedTestSuites,
          numFailedTestSuites: section27StorageGraceVitestReport.numFailedTestSuites,
          numTotalTests: section27StorageGraceVitestReport.numTotalTests,
          numPassedTests: section27StorageGraceVitestReport.numPassedTests,
          numFailedTests: section27StorageGraceVitestReport.numFailedTests,
        }
      : null,
  },
  section27LiveLoadDriftVitest: {
    reportPath: section27LiveLoadDriftVitestReportPath,
    evidenceAccepted: Boolean(section27LiveLoadDriftVitestEvidenceIsCurrent),
    expectedFiles: expectedSection27LiveLoadDriftVitestFiles,
    missingFiles: missingSection27LiveLoadDriftVitestFiles,
    stats: section27LiveLoadDriftVitestReport && !section27LiveLoadDriftVitestReport.parseError
      ? {
          numTotalTestSuites: section27LiveLoadDriftVitestReport.numTotalTestSuites,
          numPassedTestSuites: section27LiveLoadDriftVitestReport.numPassedTestSuites,
          numFailedTestSuites: section27LiveLoadDriftVitestReport.numFailedTestSuites,
          numTotalTests: section27LiveLoadDriftVitestReport.numTotalTests,
          numPassedTests: section27LiveLoadDriftVitestReport.numPassedTests,
          numFailedTests: section27LiveLoadDriftVitestReport.numFailedTests,
        }
      : null,
  },
  task8LocalMatrixEvidence: {
    reportPath: task8ExpandedPlaywrightReportPath,
    supplementPath: task8LocalMatrixSupplementPath,
    specPath: 'e2e/prd0055-task8-live-local.spec.ts',
    evidenceAccepted: Boolean(task8LocalMatrixEvidenceIsCurrent),
    stats: task8ExpandedPlaywrightReport && !task8ExpandedPlaywrightReport.parseError
      ? task8ExpandedPlaywrightReport.stats
      : null,
  },
  localBlockingRows: localBlockingRows.map(({ id, summary, localAuditStatus, implementationStatus, evidence }) => ({
    id,
    summary,
    localAuditStatus,
    implementationStatus,
    evidence,
  })),
  deferredFutureRows: deferredFutureRows.map(({ id, summary, deferral, evidence }) => ({
    id,
    summary,
    deferral,
    evidence,
  })),
  currentLocalEvidenceRows: localEvidenceRows.map(({ id, summary, evidence }) => ({
    id,
    summary,
    evidence,
    localAuditSupplement: localSupplementForRow(id),
  })),
  explicitNonActions: [
    'No live-domain browser proof.',
    'No production deploy.',
    'No selected-user rollout.',
    'No percentage rollout.',
    'No full rollout.',
    'No cleanup/delete.',
    'No commit/push/merge.',
    'No taskbox closure.',
  ],
};

fs.writeFileSync(
  path.join(root, 'output/prd0055-task9-local-readiness/prd0055-section27-localhost-audit-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify({
  verdict: report.verdict,
  rows: report.totals.actualRows,
  statusCounts: report.totals.statusCounts,
  localBlockingCount: report.totals.localBlockingCount,
  deferredFutureCount: report.totals.deferredFutureCount,
  currentLocalEvidenceCount: report.totals.currentLocalEvidenceCount,
}, null, 2));
