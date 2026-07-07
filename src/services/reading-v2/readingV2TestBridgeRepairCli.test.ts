import { describe, expect, it } from 'vitest';
import {
  parseReadingV2TestBridgeRepairCliArgs,
} from '../../../scripts/reading-v2-test-bridge-repair';

describe('reading-v2-test-bridge-repair CLI', () => {
  it('parses read-only dry-run options', () => {
    expect(parseReadingV2TestBridgeRepairCliArgs([
      '--dry-run',
      '--project',
      'temp-a1437',
      '--report',
      'output/bridge-repair.json',
    ], {})).toEqual({
      projectId: 'temp-a1437',
      write: false,
      approvedBy: undefined,
      fromReportPath: undefined,
      reportPath: 'output/bridge-repair.json',
      help: false,
    });
  });

  it('requires reviewed approval inputs for write mode', () => {
    expect(() => parseReadingV2TestBridgeRepairCliArgs([
      '--project',
      'temp-a1437',
      '--write',
    ], {})).toThrow(/approved/i);
    expect(() => parseReadingV2TestBridgeRepairCliArgs([
      '--write',
      '--approved',
      'lead-1',
    ], {})).toThrow(/from-report/i);
    expect(() => parseReadingV2TestBridgeRepairCliArgs([
      '--apply',
    ], {})).toThrow(/--write/i);
    expect(parseReadingV2TestBridgeRepairCliArgs([
      '--write',
      '--project=temp-a1437',
      '--approved=user-approved-live-backfill-2026-07-07',
      '--from-report=output/bridge-dry-run.json',
      '--report',
      'output/bridge-write.json',
    ], {})).toEqual({
      projectId: 'temp-a1437',
      write: true,
      approvedBy: 'user-approved-live-backfill-2026-07-07',
      fromReportPath: 'output/bridge-dry-run.json',
      reportPath: 'output/bridge-write.json',
      help: false,
    });
  });

  it('rejects blank project and report values', () => {
    expect(() => parseReadingV2TestBridgeRepairCliArgs([
      '--project=',
    ], {})).toThrow(/non-empty/i);
    expect(() => parseReadingV2TestBridgeRepairCliArgs([
      '--report=',
    ], {})).toThrow(/non-empty/i);
  });
});
