import { describe, expect, it } from 'vitest';
import type { BookSourceVersionAuthority, SourceSetCandidate, TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';
import {
  buildBookStructurePrompt,
  parseAndNormalizeBookStructureJson,
} from './bookStructureImport.service';

const sourceVersion: TrustedBookSourceVersionProjection = {
  sourceKey: 'full',
  sourceVersionId: 'sv-1',
  bookId: 'book-1',
  checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  purpose: 'book-source',
  studentSafeStatus: 'unreviewed',
  physicalPageCount: 150,
  verifiedUsable: true,
};

const authority: BookSourceVersionAuthority = {
  getSourceVersion: (id) => (id === 'sv-1' ? sourceVersion : undefined),
};

const sourceSet: SourceSetCandidate = {
  sourceStrategy: 'full_pdf',
  sources: [{ sourceKey: 'full', sourceVersionId: 'sv-1', sourceOrder: 1 }],
};

describe('bookStructureImport.service', () => {
  it('builds a textbook-native prompt teaching shared-page groups and excluding answer keys', () => {
    const prompt = buildBookStructurePrompt({
      bookTitle: 'Collins Listening',
      sourceKey: 'full',
      physicalPageCount: 150,
    });

    expect(prompt).toContain('book-structure-json-v1');
    expect(prompt).toContain('Collins Listening');
    expect(prompt).toContain('same physical page');
    expect(prompt).toContain('teacher_only');
    expect(prompt).toContain('Never put Answer Key');
    expect(prompt).toContain('"activity-unit-1-1"');
    expect(prompt).toContain('"activity-unit-1-2"');
  });

  it('auto-merges duplicate same-page activity groups, strips harmless extra fields, and strips markdown fences', () => {
    const raw = [
      '```json',
      JSON.stringify({
        nodes: [
          { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1, title: 'Section 1' },
          { nodeKey: 'unit-01', parentNodeKey: 'section-1', nodeType: 'unit', order: 1, title: 'Unit 1: Family' },
        ],
        units: [
          {
            unitKey: 'unit-01',
            title: 'Unit 1: Family',
            activitySlots: [
              { activityKey: 'act-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pg-1'], title: 'Ex 1' },
              { activityKey: 'act-2', order: 2, contextRequirement: 'required', pageGroupKeys: ['pg-2'], description: 'Ex 2' },
            ],
            pageGroups: [
              { pageGroupKey: 'pg-1', sourceKey: 'full', pages: [9], activityKeys: ['act-1'], mode: 'activity', defaultPhysicalPageNumber: 9 },
              { pageGroupKey: 'pg-2', sourceKey: 'full', pages: [9], activityKeys: ['act-2'], mode: 'activity', defaultPhysicalPageNumber: 9 },
              { pageGroupKey: 'pg-transcript', sourceKey: 'full', pages: [104, 103], activityKeys: [], mode: 'reference_only' },
              { pageGroupKey: 'pg-answer-key', sourceKey: 'full', pages: [140], mode: 'teacher_only' },
            ],
          },
        ],
      }),
      '```',
    ].join('\n');

    const result = parseAndNormalizeBookStructureJson(raw, {
      bookId: 'book-1',
      sourceSet,
      sourceVersionAuthority: authority,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats).toEqual({
      nodeCount: 2,
      unitCount: 1,
      activityCount: 2,
      mergedPageGroupCount: 1,
      strippedExtraFieldCount: 5,
    });
    expect(result.units[0]?.pageGroups).toEqual([
      {
        pageGroupKey: 'pg-1',
        sourceKey: 'full',
        pages: [9],
        activityKeys: ['act-1', 'act-2'],
        mode: 'activity',
        defaultPhysicalPageNumber: 9,
      },
      {
        pageGroupKey: 'pg-transcript',
        sourceKey: 'full',
        pages: [103, 104],
        activityKeys: [],
        mode: 'reference_only',
        defaultPhysicalPageNumber: 103,
      },
      {
        pageGroupKey: 'pg-answer-key',
        sourceKey: 'full',
        pages: [140],
        activityKeys: [],
        mode: 'teacher_only',
        defaultPhysicalPageNumber: 140,
      },
    ]);
    expect(result.units[0]?.activitySlots.map((slot) => slot.pageGroupKeys)).toEqual([['pg-1'], ['pg-1']]);
  });

  it('gives an actionable hint when Unit Activity JSON is pasted into Book Structure import', () => {
    const result = parseAndNormalizeBookStructureJson(
      JSON.stringify({
        promptVersion: 'book-unit-json-v1',
        schemaVersion: 'prd0062.unit_activity_import.v1',
        bookId: 'book-1',
        unitKey: 'unit-1',
        slots: [],
      }),
      { bookId: 'book-1', sourceSet, sourceVersionAuthority: authority },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('Unit Activity JSON');
  });

  it('surfaces exact manifest validation errors immediately instead of accepting broken JSON', () => {
    const result = parseAndNormalizeBookStructureJson(
      JSON.stringify({
        nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
        units: [{
          unitKey: 'unit-1',
          activitySlots: [{ activityKey: 'a1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pg-1'] }],
          pageGroups: [{ pageGroupKey: 'pg-1', sourceKey: 'full', pages: [999], activityKeys: ['a1'], mode: 'activity', defaultPhysicalPageNumber: 999 }],
        }],
      }),
      { bookId: 'book-1', sourceSet, sourceVersionAuthority: authority },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === 'out-of-range-page')).toBe(true);
  });

  it('namespaces duplicate pageGroupKeys across units and rejects empty units', () => {
    const duplicateKeyResult = parseAndNormalizeBookStructureJson(
      JSON.stringify({
        nodes: [
          { nodeKey: 'unit-01', parentNodeKey: null, nodeType: 'unit', order: 1 },
          { nodeKey: 'unit-02', parentNodeKey: null, nodeType: 'unit', order: 2 },
        ],
        units: [
          {
            unitKey: 'unit-01',
            activitySlots: [{ activityKey: 'u1-a1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pg-1'] }],
            pageGroups: [{ pageGroupKey: 'pg-1', sourceKey: 'full', pages: [9], activityKeys: ['u1-a1'], mode: 'activity' }],
          },
          {
            unitKey: 'unit-02',
            activitySlots: [{ activityKey: 'u2-a1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pg-1'] }],
            pageGroups: [{ pageGroupKey: 'pg-1', sourceKey: 'full', pages: [13], activityKeys: ['u2-a1'], mode: 'activity' }],
          },
        ],
      }),
      { bookId: 'book-1', sourceSet, sourceVersionAuthority: authority },
    );
    expect(duplicateKeyResult.ok).toBe(true);
    if (!duplicateKeyResult.ok) return;
    expect(duplicateKeyResult.units[0]?.pageGroups[0]?.pageGroupKey).toBe('pg-1');
    expect(duplicateKeyResult.units[1]?.pageGroups[0]?.pageGroupKey).toBe('unit-02-pg-1');
    expect(duplicateKeyResult.units[1]?.activitySlots[0]?.pageGroupKeys).toEqual(['unit-02-pg-1']);

    const emptyUnitResult = parseAndNormalizeBookStructureJson(
      JSON.stringify({
        nodes: [{ nodeKey: 'unit-01', parentNodeKey: null, nodeType: 'unit', order: 1 }],
        units: [{ unitKey: 'unit-01', activitySlots: [], pageGroups: [] }],
      }),
      { bookId: 'book-1', sourceSet, sourceVersionAuthority: authority },
    );
    expect(emptyUnitResult.ok).toBe(false);
    if (emptyUnitResult.ok) return;
    expect(emptyUnitResult.message).toContain('no activity slots');
  });
});
