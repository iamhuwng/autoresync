import { describe, expect, it } from 'vitest';
import {
  resolveBookAdditionDeadline,
  tryResolveBookAdditionDeadline,
  type BookAdditionDeadlineInput,
} from './bookAdditionDeadline.service';

const outline = [
  { nodeKey: 'book', parentNodeKey: null, nodeType: 'section', order: 1 },
  { nodeKey: 'unit', parentNodeKey: 'book', nodeType: 'unit', order: 1 },
  { nodeKey: 'activity-node', parentNodeKey: 'unit', nodeType: 'test', order: 1 },
] as const;

const schedule = {
  schemaVersion: 1,
  resolverVersion: 1,
  availableFrom: '2026-08-01T00:00:00.000Z',
  finalDueAt: '2026-08-10T00:00:00.000Z',
  scheduleRules: [
    { nodeKey: 'unit', dueAt: '2026-08-05T00:00:00.000Z' },
  ],
} as const;

const input = (overrides: Partial<BookAdditionDeadlineInput> = {}): BookAdditionDeadlineInput => ({
  assignmentId: 'hw-1',
  contextKey: 'homework:hw-1',
  recipientId: 'student-1',
  studentId: 'student-1',
  bindingId: 'binding-1',
  bindingRevision: 4,
  placementId: 'placement-new',
  activityId: 'activity-new',
  activityVersion: 1,
  nodeKey: 'activity-node',
  contextMode: 'required',
  schedule,
  outline,
  studentExtensions: {},
  lateSubmissionAllowed: false,
  policyRevision: 1,
  authorityRevision: 2,
  scheduleRevision: 7,
  expectedScheduleRevision: 7,
  evaluatedAt: '2026-08-04T23:59:59.999Z',
  maxAttempts: null,
  attemptsUsed: 0,
  ...overrides,
});
describe('Book required-addition deadline resolver', () => {
  it('uses inherited deadlines and preserves a future window', () => {
    expect(resolveBookAdditionDeadline(input())).toMatchObject({
      effectiveDeadlineAt: '2026-08-05T00:00:00.000Z',
      effectiveDeadlineSource: 'ancestor',
      replacementDeadlineAt: null,
      requiresReplacementDeadline: false,
    });
  });

  it('requires an explicit future replacement at the inclusive expiry edge', () => {
    expect(tryResolveBookAdditionDeadline(input({
      evaluatedAt: '2026-08-05T00:00:00.000Z',
    }))).toEqual({ status: 'rejected', code: 'replacement-deadline-required' });
    expect(resolveBookAdditionDeadline(input({
      evaluatedAt: '2026-08-05T00:00:00.000Z',
      replacementDeadline: '2026-08-06T00:00:00.000Z',
    })).replacementDeadlineAt).toBe('2026-08-06T00:00:00.000Z');
  });

  it('honors the nearest individual extension and rejects shortening it', () => {
    const extended = input({
      evaluatedAt: '2026-08-06T00:00:00.000Z',
      studentExtensions: {
        unit: {
          nodeKey: 'unit',
          dueAt: '2026-08-12T00:00:00.000Z',
          grantedBy: 'teacher-1',
          commandId: 'extension-1',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      },
    });
    expect(resolveBookAdditionDeadline(extended)).toMatchObject({
      effectiveDeadlineAt: '2026-08-12T00:00:00.000Z',
      effectiveDeadlineSource: 'student-extension',
      requiresReplacementDeadline: false,
    });
    expect(tryResolveBookAdditionDeadline({
      ...extended,
      replacementDeadline: '2026-08-11T00:00:00.000Z',
    })).toEqual({ status: 'rejected', code: 'replacement-deadline-shortened' });
  });

  it('rejects stale schedules, slash IDs, optional contexts, and policy invention', () => {
    expect(tryResolveBookAdditionDeadline(input({ expectedScheduleRevision: 6 })).code).toBe('schedule-revision-stale');
    expect(tryResolveBookAdditionDeadline(input({ placementId: 'unsafe/id' })).code).toBe('invalid-input');
    expect(tryResolveBookAdditionDeadline(input({ contextMode: 'optional' as never })).code).toBe('optional-context-unsupported');
    expect(tryResolveBookAdditionDeadline({
      ...input(),
      applicabilityPolicy: { mode: 'all' },
    } as unknown as BookAdditionDeadlineInput).code).toBe('applicability-policy-unsupported');
  });
});
