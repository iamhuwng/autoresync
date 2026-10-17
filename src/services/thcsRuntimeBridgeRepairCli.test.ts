import { describe, expect, it } from 'vitest';
import {
  parseThcsRuntimeBridgeRepairCliArgs,
  reviewedReportMatches,
} from '../../scripts/thcs-runtime-bridge-repair';

describe('thcs-runtime-bridge-repair CLI', () => {
  it('parses dry-run options', () => {
    expect(parseThcsRuntimeBridgeRepairCliArgs([
      '--dry-run',
      '--project',
      'temp-a1437',
      '--report',
      'output/thcs-runtime-bridge-repair/dry-run.json',
    ], {})).toEqual({
      projectId: 'temp-a1437',
      write: false,
      approvedBy: undefined,
      fromReportPath: undefined,
      reportPath: 'output/thcs-runtime-bridge-repair/dry-run.json',
      help: false,
    });
  });

  it('requires reviewed approval inputs for write mode', () => {
    expect(() => parseThcsRuntimeBridgeRepairCliArgs([
      '--project',
      'temp-a1437',
      '--write',
    ], {})).toThrow(/approved/i);
    expect(() => parseThcsRuntimeBridgeRepairCliArgs([
      '--write',
      '--approved',
      'user-approved-live-thcs-repair-2026-07-08',
    ], {})).toThrow(/from-report/i);
    expect(() => parseThcsRuntimeBridgeRepairCliArgs([
      '--apply',
    ], {})).toThrow(/--write/i);
    expect(parseThcsRuntimeBridgeRepairCliArgs([
      '--write',
      '--project=temp-a1437',
      '--approved=user-approved-live-thcs-repair-2026-07-08',
      '--from-report=output/thcs-runtime-bridge-repair/dry-run.json',
      '--report',
      'output/thcs-runtime-bridge-repair/write.json',
    ], {})).toEqual({
      projectId: 'temp-a1437',
      write: true,
      approvedBy: 'user-approved-live-thcs-repair-2026-07-08',
      fromReportPath: 'output/thcs-runtime-bridge-repair/dry-run.json',
      reportPath: 'output/thcs-runtime-bridge-repair/write.json',
      help: false,
    });
  });

  it('rejects blank project and report values', () => {
    expect(() => parseThcsRuntimeBridgeRepairCliArgs([
      '--project=',
    ], {})).toThrow(/non-empty/i);
    expect(() => parseThcsRuntimeBridgeRepairCliArgs([
      '--report=',
    ], {})).toThrow(/non-empty/i);
  });

  it('matches reviewed reports by stable operation content, not object key order', () => {
    const plan = {
      operations: [{
        kind: 'thcs-runtime-write',
        path: 'tests/thcs-1',
        testId: 'thcs-1',
        value: { b: 2, a: { d: 4, c: 3 } },
      }],
    };
    const reviewed = {
      dryRun: true,
      projectId: 'temp-a1437',
      totals: { operations: 1, readFailures: 0 },
      readFailures: [],
      operations: [{
        kind: 'thcs-runtime-write',
        path: 'tests/thcs-1',
        testId: 'thcs-1',
        value: { a: { c: 3, d: 4 }, b: 2 },
      }],
    };

    expect(reviewedReportMatches(reviewed, plan as any, 'temp-a1437')).toBe(true);
  });
});
