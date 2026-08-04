import { describe, expect, it } from 'vitest';
import type { BookHomeworkStructuralOutlineNode } from '../../types/homework.types';
import {
  classifyBookHomeworkDeadlineMutation,
  compileBookHomeworkScheduleDraft,
  resolveEffectiveBookHomeworkWindow,
  validateBookHomeworkSchedule,
} from './bookHomeworkSchedule.service';

const outline: readonly BookHomeworkStructuralOutlineNode[] = [
  { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1 },
  { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1 },
  { nodeKey: 'test-1', parentNodeKey: 'unit-1', nodeType: 'test', order: 1 },
];

const schedule = {
  availableFrom: '2026-08-01T00:00:00.000Z',
  finalDueAt: '2026-08-30T00:00:00.000Z',
  scheduleRules: [
    { nodeKey: 'section-1', dueAt: '2026-08-20T00:00:00.000Z' },
    { nodeKey: 'unit-1', availableFrom: '2026-08-05T00:00:00.000Z' },
    { nodeKey: 'test-1', dueAt: '2026-08-10T00:00:00.000Z' },
  ],
} as const;

describe('Book Homework schedules', () => {
  it('resolves nearest deadline/release independently and keeps overdue content accessible', () => {
    const resolved = resolveEffectiveBookHomeworkWindow({
      schedule,
      outline,
      nodeKey: 'test-1',
      now: '2026-08-25T00:00:00.000Z',
    });

    expect(resolved.deadline).toMatchObject({ source: 'ancestor', nodeKey: 'test-1', value: '2026-08-10T00:00:00.000Z' });
    expect(resolved.release).toMatchObject({ source: 'ancestor', nodeKey: 'unit-1', value: '2026-08-05T00:00:00.000Z' });
    expect(resolved).toMatchObject({ isReleased: true, isOverdue: true, isAccessible: true });
  });

  it('falls back to assignment dates and defaults to open access', () => {
    const resolved = resolveEffectiveBookHomeworkWindow({
      schedule: { finalDueAt: schedule.finalDueAt, scheduleRules: [] },
      outline,
      nodeKey: 'unit-1',
      now: '2026-08-01T00:00:00.000Z',
    });

    expect(resolved.deadline.source).toBe('assignment');
    expect(resolved.release.source).toBe('open-access');
    expect(resolved.release.value).toBeUndefined();
    expect(resolved.isAccessible).toBe(true);
  });

  it('accepts equal boundaries but rejects a child deadline later than its parent', () => {
    expect(() => validateBookHomeworkSchedule({
      finalDueAt: schedule.finalDueAt,
      scheduleRules: [
        { nodeKey: 'section-1', dueAt: '2026-08-20T00:00:00.000Z' },
        { nodeKey: 'unit-1', dueAt: '2026-08-20T00:00:00.000Z' },
      ],
    }, outline)).not.toThrow();

    expect(() => validateBookHomeworkSchedule({
      finalDueAt: schedule.finalDueAt,
      scheduleRules: [
        { nodeKey: 'section-1', dueAt: '2026-08-20T00:00:00.000Z' },
        { nodeKey: 'unit-1', dueAt: '2026-08-21T00:00:00.000Z' },
      ],
    }, outline)).toThrow(/cannot be later than its parent/i);
  });

  it('preserves a later per-student deadline extension with an auditable explanation', () => {
    const resolved = resolveEffectiveBookHomeworkWindow({
      schedule,
      outline,
      nodeKey: 'test-1',
      studentOverride: { dueDate: Date.parse('2026-09-02T00:00:00.000Z') },
    });

    expect(resolved.deadline.source).toBe('student-extension');
    expect(resolved.deadline.value).toBe('2026-09-02T00:00:00.000Z');
    expect(resolved.deadline.explanation).toContain('overrides 2026-08-10T00:00:00.000Z');
  });

  it('compiles local and offset timestamps into immutable manifest-ready ISO rules', () => {
    const compiled = compileBookHomeworkScheduleDraft({
      availableFrom: '2026-08-01T07:00:00+07:00',
      dueDate: '2026-08-30T07:00:00+07:00',
      scheduleRules: [
        { nodeKey: 'unit-1', availableFrom: '', dueAt: '2026-08-20T07:00:00+07:00' },
        { nodeKey: 'test-1', availableFrom: '', dueAt: '' },
      ],
    }, outline);

    expect(compiled).toEqual({
      availableFrom: '2026-08-01T00:00:00.000Z',
      finalDueAt: '2026-08-30T00:00:00.000Z',
      scheduleRules: [{ nodeKey: 'unit-1', dueAt: '2026-08-20T00:00:00.000Z' }],
    });
  });

  it('classifies extension and mixed-start unsafe shortening without claiming browser authority', () => {
    expect(classifyBookHomeworkDeadlineMutation({
      nodeKey: 'unit-1',
      previousDueAt: '2026-08-20T00:00:00.000Z',
      nextDueAt: '2026-08-21T00:00:00.000Z',
      affectedStudentStates: ['in-progress'],
    })).toMatchObject({
      kind: 'extend',
      affectedStudentStateKnown: true,
      requiresTrustedDenial: false,
    });

    expect(classifyBookHomeworkDeadlineMutation({
      nodeKey: 'unit-1',
      previousDueAt: '2026-08-20T00:00:00.000Z',
      nextDueAt: '2026-08-19T00:00:00.000Z',
      affectedStudentStates: ['not-started', 'submitted'],
    })).toMatchObject({ kind: 'shorten', requiresTrustedDenial: true });

    expect(classifyBookHomeworkDeadlineMutation({
      nodeKey: 'unit-1',
      nextDueAt: '2026-08-19T00:00:00.000Z',
    })).toMatchObject({
      kind: 'add',
      affectedStudentStateKnown: false,
      requiresTrustedDenial: true,
    });
  });
});
