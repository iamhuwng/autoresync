import { describe, expect, it } from 'vitest';

import { missingRequiredSourceContext } from './sourceContextRequirement.service';
import { parsePhysicalPageList, reorderActivitySlot, upsertPageGroupMapping } from './pageGroup.service';

describe('Page Group mapping helpers', () => {
  it('parses one-based local physical pages without duplicates', () => {
    expect(parsePhysicalPageList('1, 2, 3')).toEqual({ pages: [1, 2, 3], error: null });
    expect(parsePhysicalPageList('1, 2,2')).toEqual({
      pages: [],
      error: 'Physical page 2 is duplicated in this Page Group.',
    });
    expect(parsePhysicalPageList('1, nope, 3')).toEqual({
      pages: [],
      error: 'Invalid physical page "nope". Use one-based numbers only.',
    });
  });

  it('adds many-to-many mappings without duplicating Activity content', () => {
    const first = upsertPageGroupMapping({
      unit: undefined,
      unitKey: 'unit-1',
      pageGroupKey: 'pages-1',
      sourceKey: 'full',
      pages: [1],
      mode: 'activity',
      activityKey: 'activity-1',
      contextRequirement: 'required',
    });
    const second = upsertPageGroupMapping({
      unit: first,
      unitKey: 'unit-1',
      pageGroupKey: 'pages-2',
      sourceKey: 'full',
      pages: [2],
      mode: 'activity',
      activityKey: 'activity-1',
      contextRequirement: 'required',
    });

    expect(second.activitySlots).toEqual([expect.objectContaining({
      activityKey: 'activity-1',
      pageGroupKeys: ['pages-1', 'pages-2'],
    })]);
    expect(second.pageGroups).toHaveLength(2);
    expect(missingRequiredSourceContext(second)).toEqual([]);
  });

  it('keeps reference-only pages outside Activity slot order and reorders slots', () => {
    const withReference = upsertPageGroupMapping({
      unit: undefined,
      unitKey: 'unit-1',
      pageGroupKey: 'reference-1',
      sourceKey: 'full',
      pages: [3],
      mode: 'reference_only',
    });
    const firstActivity = upsertPageGroupMapping({
      unit: withReference,
      unitKey: 'unit-1',
      pageGroupKey: 'pages-activity-1',
      sourceKey: 'full',
      pages: [4],
      mode: 'activity',
      activityKey: 'activity-1',
      contextRequirement: 'required',
    });
    const secondActivity = upsertPageGroupMapping({
      unit: firstActivity,
      unitKey: 'unit-1',
      pageGroupKey: 'pages-activity-2',
      sourceKey: 'full',
      pages: [5],
      mode: 'activity',
      activityKey: 'activity-2',
      contextRequirement: 'optional',
    });

    expect(secondActivity.activitySlots.map((slot) => slot.activityKey)).toEqual(['activity-1', 'activity-2']);
    expect(secondActivity.pageGroups.find((group) => group.mode === 'reference_only')?.activityKeys).toEqual([]);

    const reordered = reorderActivitySlot(secondActivity, 'activity-2', -1);
    expect(reordered.activitySlots.map((slot) => `${slot.order}:${slot.activityKey}`)).toEqual([
      '1:activity-2',
      '2:activity-1',
    ]);
  });

  it('merges multiple ordered Activities onto one source page group', () => {
    const first = upsertPageGroupMapping({
      unit: undefined,
      unitKey: 'unit-1',
      pageGroupKey: 'pages-full-7',
      sourceKey: 'full',
      pages: [7],
      mode: 'activity',
      activityKey: 'activity-a',
      contextRequirement: 'required',
      defaultPhysicalPageNumber: 7,
    });
    const second = upsertPageGroupMapping({
      unit: first,
      unitKey: 'unit-1',
      pageGroupKey: 'pages-full-7',
      sourceKey: 'full',
      pages: [7],
      mode: 'activity',
      activityKey: 'activity-b',
      contextRequirement: 'optional',
      defaultPhysicalPageNumber: 7,
    });

    expect(second.pageGroups).toEqual([expect.objectContaining({
      pageGroupKey: 'pages-full-7',
      pages: [7],
      activityKeys: ['activity-a', 'activity-b'],
      defaultPhysicalPageNumber: 7,
    })]);
    expect(second.activitySlots.map((slot) => ({
      activityKey: slot.activityKey,
      pageGroupKeys: slot.pageGroupKeys,
    }))).toEqual([
      { activityKey: 'activity-a', pageGroupKeys: ['pages-full-7'] },
      { activityKey: 'activity-b', pageGroupKeys: ['pages-full-7'] },
    ]);
  });
});
