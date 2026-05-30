import { describe, expect, it } from 'vitest';
import { getMaterialVisuals, resolveMaterialVisualKind } from './materialVisualTaxonomy';

describe('materialVisualTaxonomy', () => {
  it.each([
    [{ testType: 'THCS-THPT' }, 'thcs', { iconKind: 'school', accentKind: 'sky' }],
    [{ deliveryEngine: 'reading-v2', testType: 'IELTS', skill: 'Reading' }, 'readingV2', { iconKind: 'reading', accentKind: 'rose' }],
    [{ testType: 'IELTS', skill: 'Reading' }, 'ieltsReading', { iconKind: 'reading', accentKind: 'rose' }],
    [{ testType: 'IELTS', skill: 'Writing' }, 'ieltsWriting', { iconKind: 'writing', accentKind: 'lavender' }],
    [{ status: 'draft' }, 'draft', { iconKind: 'draft', accentKind: 'peach' }],
    [{ testType: 'IELTS', skill: 'Listening' }, 'genericTest', { iconKind: 'test', accentKind: 'indigo' }],
    [{ isComplete: false, testType: 'THCS-THPT' }, 'incomplete', { iconKind: 'incomplete', accentKind: 'incomplete' }],
  ])('maps material visuals semantically for %s', (item, kind, visuals) => {
    expect(resolveMaterialVisualKind(item)).toBe(kind);
    expect(getMaterialVisuals(item)).toEqual(visuals);
  });
});
