import { describe, expect, it } from 'vitest';
import {
  requireBookScheduleWindowDecision,
  resolveBookScheduleWindow,
  type BookScheduleWindowOperation,
} from './bookScheduleWindow.service';

const outline = [
  { nodeKey: 'book', parentNodeKey: null, nodeType: 'section', order: 1 },
  { nodeKey: 'unit', parentNodeKey: 'book', nodeType: 'unit', order: 1 },
  { nodeKey: 'activity-node', parentNodeKey: 'unit', nodeType: 'test', order: 1 },
] as const;

const schedule = {
  schemaVersion: 1,
  resolverVersion: 1,
  availableFrom: '2026-08-01T00:00:00.000Z',
  finalDueAt: '2026-08-31T00:00:00.000Z',
  scheduleRules: [
    { nodeKey: 'unit', availableFrom: '2026-08-05T00:00:00.000Z' },
    { nodeKey: 'activity-node', dueAt: '2026-08-10T00:00:00.000Z' },
  ],
} as const;

const resolve = (
  operation: BookScheduleWindowOperation,
  evaluatedAt: string,
  override: Partial<Parameters<typeof resolveBookScheduleWindow>[0]> = {},
) => resolveBookScheduleWindow({
  assignmentId: 'homework-1',
  recipientId: 'student-1',
  bindingId: 'binding-1',
  bindingRevision: 3,
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 2,
  nodeKey: 'activity-node',
  operation,
  schedule,
  outline,
  studentExtensions: {},
  lateSubmissionAllowed: false,
  policyRevision: 4,
  authorityRevision: 7,
  evaluatedAt,
  ...override,
});

describe('trusted Book schedule-window decision', () => {
  it.each([
    ['2026-08-04T23:59:59.999Z', 'unreleased', false],
    ['2026-08-05T00:00:00.000Z', 'available', true],
    ['2026-08-10T00:00:00.000Z', 'available', true],
    ['2026-08-10T00:00:00.001Z', 'overdue', true],
  ] as const)('uses inclusive release/deadline edges at %s', (evaluatedAt, phase, canAutosave) => {
    expect(resolve('autosave', evaluatedAt)).toMatchObject({
      phase,
      permissions: { canAutosave },
      outcome: canAutosave ? 'allowed' : 'denied',
    });
  });

  it('uses the nearest applicable student extension and preserves provenance', () => {
    const decision = resolve('submit', '2026-08-20T00:00:00.000Z', {
      studentExtensions: {
        unit: {
          nodeKey: 'unit',
          dueAt: '2026-08-25T00:00:00.000Z',
          grantedBy: 'teacher-1',
          commandId: 'extension-1',
          updatedAt: '2026-08-02T00:00:00.000Z',
        },
      },
    });
    expect(decision).toMatchObject({
      phase: 'available',
      deadline: {
        source: 'student-extension',
        nodeKey: 'unit',
        at: '2026-08-25T00:00:00.000Z',
      },
      permissions: { canSubmit: true },
    });
  });

  it('keeps overdue work accessible while late policy alone controls submit', () => {
    const denied = resolve('submit', '2026-08-11T00:00:00.000Z');
    const allowed = resolve('submit', '2026-08-11T00:00:00.000Z', {
      lateSubmissionAllowed: true,
    });
    expect(denied).toMatchObject({
      phase: 'overdue',
      permissions: { canLaunch: true, canReadState: true, canAutosave: true, canSubmit: false },
      code: 'book_activity_late_submission_denied',
    });
    expect(allowed).toMatchObject({
      phase: 'overdue',
      permissions: { canSubmit: true },
      code: 'book_window_allowed',
    });
  });

  it('gates documents only on assignment start and never on a nested release', () => {
    expect(resolve('document', '2026-07-31T23:59:59.999Z')).toMatchObject({
      outcome: 'denied',
      code: 'book_assignment_unreleased',
    });
    expect(resolve('document', '2026-08-01T00:00:00.000Z')).toMatchObject({
      phase: 'unreleased',
      permissions: { canAccessDocument: true, canLaunch: false },
      outcome: 'allowed',
    });
  });

  it('keeps completed review accessible after a schedule moves into the future', () => {
    expect(resolve('review', '2026-08-02T00:00:00.000Z', {
      completed: true,
      schedule: {
        ...schedule,
        availableFrom: '2026-08-20T00:00:00.000Z',
        scheduleRules: [],
      },
    })).toMatchObject({
      phase: 'unreleased',
      completed: true,
      permissions: { canReview: true, canAutosave: false, canSubmit: false },
      outcome: 'allowed',
    });
  });

  it('round-trips only a coherent typed decision and rejects crafted payloads', () => {
    const decision = resolve('launch', '2026-08-06T00:00:00.000Z');
    expect(requireBookScheduleWindowDecision(decision)).toEqual(decision);
    expect(() => requireBookScheduleWindowDecision({
      ...decision,
      evaluatedAt: 'client time',
    })).toThrow('book_schedule_window_decision_invalid');
    expect(() => requireBookScheduleWindowDecision({
      ...decision,
      outcome: 'allowed',
      permissions: { ...decision.permissions, canLaunch: false },
    })).toThrow('book_schedule_window_decision_invalid');
  });
});
