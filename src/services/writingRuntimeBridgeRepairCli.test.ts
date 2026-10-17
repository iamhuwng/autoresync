import { describe, expect, it } from 'vitest';
import {
  parseWritingRuntimeBridgeRepairCliArgs,
  reviewedReportMatches,
} from '../../scripts/writing-runtime-bridge-repair';

describe('writing-runtime-bridge-repair CLI', () => {
  it('parses dry-run options', () => {
    expect(parseWritingRuntimeBridgeRepairCliArgs([
      '--dry-run',
      '--project',
      'temp-a1437',
      '--database-url',
      'https://temp-a1437-default-rtdb.firebaseio.com',
      '--report',
      'output/writing-runtime-bridge-repair/dry-run.json',
    ], {})).toEqual({
      projectId: 'temp-a1437',
      databaseUrl: 'https://temp-a1437-default-rtdb.firebaseio.com',
      write: false,
      approvedBy: undefined,
      fromReportPath: undefined,
      reportPath: 'output/writing-runtime-bridge-repair/dry-run.json',
      help: false,
    });
  });

  it('requires reviewed approval inputs for write mode', () => {
    expect(() => parseWritingRuntimeBridgeRepairCliArgs([
      '--project',
      'temp-a1437',
      '--write',
    ], {})).toThrow(/approved/i);
    expect(() => parseWritingRuntimeBridgeRepairCliArgs([
      '--write',
      '--approved',
      'user-approved-live-writing-repair-2026-07-08',
    ], {})).toThrow(/from-report/i);
    expect(() => parseWritingRuntimeBridgeRepairCliArgs([
      '--apply',
    ], {})).toThrow(/--write/i);
    expect(parseWritingRuntimeBridgeRepairCliArgs([
      '--write',
      '--project=temp-a1437',
      '--approved=user-approved-live-writing-repair-2026-07-08',
      '--from-report=output/writing-runtime-bridge-repair/dry-run.json',
      '--report',
      'output/writing-runtime-bridge-repair/write.json',
    ], {})).toEqual({
      projectId: 'temp-a1437',
      databaseUrl: undefined,
      write: true,
      approvedBy: 'user-approved-live-writing-repair-2026-07-08',
      fromReportPath: 'output/writing-runtime-bridge-repair/dry-run.json',
      reportPath: 'output/writing-runtime-bridge-repair/write.json',
      help: false,
    });
  });

  it('rejects blank project and report values', () => {
    expect(() => parseWritingRuntimeBridgeRepairCliArgs([
      '--project=',
    ], {})).toThrow(/non-empty/i);
    expect(() => parseWritingRuntimeBridgeRepairCliArgs([
      '--report=',
    ], {})).toThrow(/non-empty/i);
  });

  it('matches reviewed reports by stable operation content, not object key order', () => {
    const plan = {
      operations: [{
        kind: 'writing-runtime-write',
        path: 'tests/writing-1',
        testId: 'writing-1',
        value: { b: 2, a: { d: 4, c: 3 } },
      }],
    };
    const reviewed = {
      dryRun: true,
      projectId: 'temp-a1437',
      totals: { operations: 1, readFailures: 0 },
      readFailures: [],
      operations: [{
        kind: 'writing-runtime-write',
        path: 'tests/writing-1',
        testId: 'writing-1',
        value: { a: { c: 3, d: 4 }, b: 2 },
      }],
    };

    expect(reviewedReportMatches(reviewed, plan as any, 'temp-a1437')).toBe(true);
  });
});
