import { describe, expect, it, vi } from 'vitest';
import { buildTestMaterialListRow } from './materialListAdapter';

describe('materialListAdapter', () => {
  it('maps regular IELTS tests into compact list rows', () => {
    const row = buildTestMaterialListRow({
      id: 'ielts-1',
      title: 'IELTS Reading Practice',
      testType: 'IELTS',
      skill: 'Reading',
      questionCount: 40,
      duration: 60,
      updatedAt: '2026-05-12T10:15:00Z',
    }, {
      handlers: { onEdit: vi.fn(), onDelete: vi.fn(), onStartTest: vi.fn() },
    });

    expect(row).toMatchObject({
      id: 'ielts-1',
      title: 'IELTS Reading Practice',
      iconKind: 'test',
      itemLabel: '40 questions',
      durationLabel: '60 min',
      updatedLabel: 'May 12, 2026',
      statusKind: 'ready',
    });
    expect(row.badges.map((badge) => badge.label)).toEqual([
      '40 questions',
      'IELTS - Reading',
      '60 min',
    ]);
    expect(row.actions.map((item) => item.label)).toEqual(['Edit', 'Delete', 'Start Test']);
    expect(row.actions.map((item) => item.slot)).toEqual([1, 2, 3]);
  });

  it('maps THCS tests with assignment action and grade badges', () => {
    const row = buildTestMaterialListRow({
      id: 'thcs-1',
      testType: 'THCS-THPT',
      questionCount: 40,
      metadata: {
        title: 'Grade 10 Midterm',
        gradeLevel: '10',
        examType: 'Giữa Kì',
        duration: 45,
      },
    }, {
      handlers: { onEdit: vi.fn(), onDelete: vi.fn(), onStartTest: vi.fn(), onAssignHw: vi.fn() },
    });

    expect(row.title).toBe('Grade 10 Midterm');
    expect(row.iconKind).toBe('school');
    expect(row.itemLabel).toBe('40 questions');
    expect(row.badges.map((badge) => badge.label)).toContain('Grade 10');
    expect(row.badges.map((badge) => badge.label)).toContain('Giữa Kì');
    expect(row.actions.map((item) => item.label)).toEqual(['Edit', 'Delete', 'Start Test', 'Assign HW']);
    expect(row.actions.map((item) => item.slot)).toEqual([1, 2, 3, 4]);
  });

  it('maps Reading V2 rows without requiring canonical draft payload data', () => {
    const row = buildTestMaterialListRow({
      id: 'published-v2',
      materialId: 'published-v2',
      deliveryEngine: 'reading-v2',
      title: 'IELTS Reading V2',
      testType: 'IELTS',
      skill: 'Reading',
      questionCount: 3,
      metadata: { durationMinutes: 60 },
    });

    expect(row.iconKind).toBe('reading');
    expect(row.accentKind).toBe('rose');
    expect(row.badges.map((badge) => badge.label)).toContain('Reading V2');
    expect(row.durationLabel).toBe('60 min');
  });

  it('maps incomplete items to recovery actions without Start Test', () => {
    const row = buildTestMaterialListRow({
      id: 'incomplete-1',
      title: 'Listening Section 1',
      testType: 'IELTS',
      skill: 'Listening',
      questionCount: 8,
      duration: 10,
      isComplete: false,
      missingAnswerCount: 2,
    });

    expect(row.statusKind).toBe('incomplete');
    expect(row.iconKind).toBe('incomplete');
    expect(row.badges.map((badge) => badge.label)).toEqual([
      '8 questions',
      'IELTS - Listening',
      '10 min',
      'Incomplete',
      '2 missing answers',
    ]);
    expect(row.actions.map((item) => item.label)).toEqual(['Complete', 'Delete']);
    expect(row.actions.map((item) => item.slot)).toEqual([1, 2]);
  });

  it('maps public library rows without owner-only actions', () => {
    const row = buildTestMaterialListRow({
      id: 'public-regular',
      title: 'Public Reading',
      testType: 'IELTS',
      skill: 'Reading',
    }, {
      isPublicLibrary: true,
    });

    expect(row.actions.map((item) => item.label)).toEqual(['View', 'Start Test']);
    expect(row.actions.map((item) => item.slot)).toEqual([1, 3]);
    expect(row.actions.map((item) => item.label)).not.toContain('Delete');
  });

  it('uses neutral fallbacks for missing metadata', () => {
    const row = buildTestMaterialListRow({ id: 'unknown-1' });

    expect(row.title).toBe('Untitled Test');
    expect(row.itemLabel).toBe('0 questions');
    expect(row.durationLabel).toBe('--');
    expect(row.updatedLabel).toBe('--');
  });
});
