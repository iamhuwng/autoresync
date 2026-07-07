import { describe, expect, it } from 'vitest';
import {
  assertMaterialSummaryPostWriteVerified,
  isMaterialSummaryReconciliationDirectRun,
  normalizeMaterialSummaryReconciliationCliArgs,
  parseMaterialSummaryReconciliationArgs,
  reviewedReportMatches,
} from '../../../scripts/material-summary-reconciliation';
import {
  buildMaterialSummaryReconciliationUpdatePayload,
  planMaterialSummaryReconciliation,
} from './materialSummaryReconciliation.service';

const legacyTest = {
  ownerId: 'teacher-1',
  title: 'CLI Test',
  type: 'IELTS',
  skill: 'Reading',
  updatedAt: 1_700_000_000_000,
};

const nestedSnapshotFromPayload = (
  payload: Readonly<Record<string, unknown>>,
) => {
  const root: Record<string, any> = {};
  Object.entries(payload).forEach(([path, value]) => {
    const relative = path.replace(
      'material_catalog/material_summary_indexes/v1/',
      '',
    );
    const parts = relative.split('/');
    let cursor = root;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        if (value !== null) {
          cursor[part] = value;
        }
      } else {
        cursor[part] ??= {};
        cursor = cursor[part];
      }
    });
  });
  return root;
};

describe('material summary reconciliation CLI', () => {
  it('defaults to dry-run and requires reviewed approval for writes', () => {
    expect(parseMaterialSummaryReconciliationArgs([], {
      VITE_FIREBASE_PROJECT_ID: 'demo-project',
    })).toMatchObject({
      projectId: 'demo-project',
      write: false,
    });
    expect(() => parseMaterialSummaryReconciliationArgs([
      '--write',
      '--project',
      'demo-project',
    ])).toThrow(/requires --approved/i);
    expect(parseMaterialSummaryReconciliationArgs([
      '--write',
      '--project',
      'demo-project',
      '--approved',
      'change-123',
      '--from-report',
      'dry-run.json',
    ])).toMatchObject({
      write: true,
      approvedBy: 'change-123',
      fromReportPath: 'dry-run.json',
    });
  });

  it('recognizes vite-node script execution without running during Vitest imports', () => {
    const scriptUrl = 'file:///C:/repo/scripts/material-summary-reconciliation.ts';

    expect(isMaterialSummaryReconciliationDirectRun(scriptUrl, [
      'node.exe',
      'C:/repo/node_modules/vite-node/vite-node.mjs',
      '--mode',
      'test',
      'scripts/material-summary-reconciliation.ts',
      '--dry-run',
    ], {})).toBe(true);

    expect(isMaterialSummaryReconciliationDirectRun(scriptUrl, [
      'node.exe',
      'vitest',
      'src/services/materialCatalog/materialSummaryReconciliationCli.test.ts',
    ], { VITEST_WORKER_ID: '1' })).toBe(false);
  });

  it('strips vite-node runner flags before parsing material-summary flags', () => {
    expect(normalizeMaterialSummaryReconciliationCliArgs([
      '--mode',
      'test',
      '--script',
      'scripts/material-summary-reconciliation.ts',
      '--',
      '--dry-run',
      '--project',
      'demo-project',
      '--report',
      'report.json',
    ])).toEqual([
      '--dry-run',
      '--project',
      'demo-project',
      '--report',
      'report.json',
    ]);
  });

  it('rejects reviewed dry-run reports that had read failures', () => {
    const current = planMaterialSummaryReconciliation({
      legacyTests: { 'test-1': legacyTest },
      currentIndex: null,
    });
    const reviewed = {
      dryRun: true,
      projectId: 'demo-project',
      mutation: { status: 'not-run' },
      totals: {
        operations: current.operationCount,
        operationDigest: current.operationDigest,
        readFailures: 0,
      },
      readFailures: [],
    };

    expect(reviewedReportMatches(reviewed, current, 'demo-project')).toBe(true);
    expect(reviewedReportMatches({
      ...reviewed,
      totals: { ...reviewed.totals, readFailures: 1 },
    }, current, 'demo-project')).toBe(false);
    expect(reviewedReportMatches({
      ...reviewed,
      readFailures: [{ path: 'tests', error: 'permission_denied' }],
    }, current, 'demo-project')).toBe(false);
    expect(reviewedReportMatches({
      ...reviewed,
      totals: { ...reviewed.totals, operationDigest: 'fnv1a-stale' },
    }, current, 'demo-project')).toBe(false);
  });

  it('requires post-write readback to be idempotent before accepting a write', () => {
    const initial = planMaterialSummaryReconciliation({
      legacyTests: { 'test-1': legacyTest },
      currentIndex: null,
    });
    const repairedIndex = nestedSnapshotFromPayload(
      buildMaterialSummaryReconciliationUpdatePayload(initial.operations),
    );

    expect(assertMaterialSummaryPostWriteVerified({
      legacyTests: { 'test-1': legacyTest },
      currentIndex: repairedIndex,
    })).toMatchObject({
      reconciliation: { operationCount: 0 },
      parity: { parity: true },
    });
    expect(() => assertMaterialSummaryPostWriteVerified({
      legacyTests: { 'test-1': legacyTest },
      currentIndex: null,
    })).toThrow(/post-write verification failed/i);
  });
});
