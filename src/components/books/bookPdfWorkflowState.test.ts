import { describe, expect, it } from 'vitest';
import type { BookUnitCandidate } from '../../types/bookAssembly.types';
import {
  formatUnitLabel,
  getUnitProgressList,
  hasExactUnitActivities,
  pickInitialPdfWorkspaceTab,
  resolveSelectedUnitKey,
} from './bookPdfWorkflowState';

const sampleUnits: readonly BookUnitCandidate[] = [
  {
    unitKey: 'unit-01-listening',
    activitySlots: [
      { activityKey: 'u1-a1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pg-9'] },
      { activityKey: 'u1-a2', order: 2, contextRequirement: 'required', pageGroupKeys: ['pg-9'] },
    ],
    pageGroups: [
      { pageGroupKey: 'pg-9', sourceKey: 'full', pages: [9], activityKeys: ['u1-a1', 'u1-a2'], mode: 'activity', defaultPhysicalPageNumber: 9 },
    ],
  },
  {
    unitKey: 'unit-02-listening',
    activitySlots: [
      { activityKey: 'u2-a1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pg-14'] },
    ],
    pageGroups: [
      { pageGroupKey: 'pg-14', sourceKey: 'full', pages: [14], activityKeys: ['u2-a1'], mode: 'activity', defaultPhysicalPageNumber: 14 },
    ],
  },
];

describe('bookPdfWorkflowState', () => {
  it('picks the next incomplete stage when opening a PDF Book draft or partially published book', () => {
    expect(pickInitialPdfWorkspaceTab({
      hasMode: false, sourceReady: false, hasStructure: false, totalUnits: 0, readyUnits: 0, publishedUnits: 0,
    })).toBe('pdf-files');

    expect(pickInitialPdfWorkspaceTab({
      hasMode: true, sourceReady: true, hasStructure: false, totalUnits: 0, readyUnits: 0, publishedUnits: 0,
    })).toBe('content-tree');

    expect(pickInitialPdfWorkspaceTab({
      hasMode: true, sourceReady: true, hasStructure: true, totalUnits: 20, readyUnits: 0, publishedUnits: 0,
    })).toBe('activity-json');

    expect(pickInitialPdfWorkspaceTab({
      hasMode: true, sourceReady: true, hasStructure: true, totalUnits: 20, readyUnits: 1, publishedUnits: 0,
    })).toBe('preview');

    expect(pickInitialPdfWorkspaceTab({
      hasMode: true, sourceReady: true, hasStructure: true, totalUnits: 20, readyUnits: 1, publishedUnits: 1,
    })).toBe('activity-json');

    expect(pickInitialPdfWorkspaceTab({
      hasMode: true, sourceReady: true, hasStructure: true, totalUnits: 2, readyUnits: 2, publishedUnits: 2,
    })).toBe('preview');
  });

  it('tracks per-unit progress without assuming hardcoded unit-1 keys', () => {
    const progress = getUnitProgressList(
      sampleUnits,
      { 'unit-01-listening': ['u1-a1', 'u1-a2'] },
      ['unit-01-listening'],
    );

    expect(progress).toEqual([
      {
        unitKey: 'unit-01-listening',
        label: 'Unit 1',
        totalSlots: 2,
        savedSlots: 2,
        mappedSlots: 2,
        hasAllActivities: true,
        hasAllPagesMapped: true,
        isPublished: true,
      },
      {
        unitKey: 'unit-02-listening',
        label: 'Unit 2',
        totalSlots: 1,
        savedSlots: 0,
        mappedSlots: 1,
        hasAllActivities: false,
        hasAllPagesMapped: true,
        isPublished: false,
      },
    ]);
    expect(hasExactUnitActivities(sampleUnits[0]!, { 'unit-01-listening': ['u1-a1', 'u1-a2'] })).toBe(true);
    expect(resolveSelectedUnitKey(sampleUnits, 'missing')).toBe('unit-01-listening');
    expect(formatUnitLabel(sampleUnits, 'unit-02-listening')).toBe('Unit 2');
  });
});
