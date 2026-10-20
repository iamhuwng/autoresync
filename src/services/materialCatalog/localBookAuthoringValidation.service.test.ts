import { describe, expect, it } from 'vitest';
import { validateLocalBookAuthoring } from './localBookAuthoringValidation.service';

const pdf = { id: 'pdf-1', sourceKey: 'full', name: 'book.pdf', size: 100, type: 'application/pdf', lastModified: 0, blobKey: 'blob-1' };
const componentPdfs = [
  { id: 'pdf-b', sourceKey: 'component-b', name: 'b.pdf', size: 100, type: 'application/pdf', lastModified: 0, blobKey: 'blob-b' },
  { id: 'pdf-a', sourceKey: 'component-a', name: 'a.pdf', size: 100, type: 'application/pdf', lastModified: 0, blobKey: 'blob-a' },
] as const;

describe('local Book authoring validation', () => {
  it('reports field-specific errors for malformed local input', () => {
    const result = validateLocalBookAuthoring({
      strategy: 'full',
      pdfs: [pdf],
      structureJson: '{"nodes":[],"units":[]}',
      unitsJson: 'not-json',
      pageMappingJson: '{"units":[]}',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.field === 'activities' && error.code === 'invalid-json')).toBe(true);
  });

  it('rejects unsafe authority fields with the imported field path', () => {
    const result = validateLocalBookAuthoring({
      strategy: 'full',
      pdfs: [pdf],
      structureJson: JSON.stringify({
        nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
        units: [{ unitKey: 'unit-1', activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'none', pageGroupKeys: ['group-1'] }], pageGroups: [{ pageGroupKey: 'group-1', sourceKey: 'full', pages: [1], activityKeys: ['activity-1'], mode: 'activity' }] }],
      }),
      unitsJson: JSON.stringify({ 'unit-1': { 'activity-1': { answerKey: 'secret' } } }),
      pageMappingJson: JSON.stringify({ units: [] }),
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'activities', code: 'forbidden-field', path: '$.unit-1.activity-1.answerKey' }),
    ]));
  });

  it('enforces full and component PDF cardinality', () => {
    expect(validateLocalBookAuthoring({ strategy: 'component', pdfs: [pdf], structureJson: '{"nodes":[],"units":[]}', unitsJson: '{}', pageMappingJson: '{"units":[]}' }).errors)
      .toEqual(expect.arrayContaining([expect.objectContaining({ field: 'files', code: 'invalid-cardinality' })]));
  });

  it('rejects mappings beyond the inspected local PDF page count', () => {
    const structure = {
      nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
      units: [{ unitKey: 'unit-1', activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'none', pageGroupKeys: ['group-1'] }], pageGroups: [{ pageGroupKey: 'group-1', sourceKey: 'full', pages: [2], activityKeys: ['activity-1'], mode: 'activity' }] }],
    };
    const result = validateLocalBookAuthoring({
      strategy: 'full', pdfs: [pdf], structureJson: JSON.stringify(structure), unitsJson: '{}', pageMappingJson: JSON.stringify({ units: [] }), pdfPageCounts: { full: 1 },
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'structure', code: 'out-of-range-page' }),
    ]));
  });

  it('does not allow an empty Unit to pass final local validation', () => {
    const result = validateLocalBookAuthoring({
      strategy: 'full',
      pdfs: [pdf],
      structureJson: JSON.stringify({
        nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
        units: [{ unitKey: 'unit-1', activitySlots: [], pageGroups: [] }],
      }),
      unitsJson: '{}',
      pageMappingJson: JSON.stringify({ units: [] }),
      pdfPageCounts: { full: 1 },
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'mapping', code: 'missing-content' }),
    ]));
  });

  it('requires imported content for every planned Activity slot', () => {
    const result = validateLocalBookAuthoring({
      strategy: 'full',
      pdfs: [pdf],
      structureJson: JSON.stringify({
        nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
        units: [{ unitKey: 'unit-1', activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'none', pageGroupKeys: ['group-1'] }], pageGroups: [{ pageGroupKey: 'group-1', sourceKey: 'full', pages: [1], activityKeys: ['activity-1'], mode: 'activity' }] }],
      }),
      unitsJson: '{}',
      pageMappingJson: JSON.stringify({ units: [] }),
      pdfPageCounts: { full: 1 },
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'activities', code: 'missing-content' }),
    ]));
  });

  it('returns the safe manifest contract before Activity content is imported', () => {
    const structure = {
        nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', title: 'Individuality, community', order: 1 }],
      units: [{ unitKey: 'unit-1', activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['group-1'] }], pageGroups: [{ pageGroupKey: 'group-1', sourceKey: 'full', pages: [1], activityKeys: ['activity-1'], mode: 'activity' }] }],
    };
    const result = validateLocalBookAuthoring({
      strategy: 'full',
      pdfs: [pdf],
      structureJson: JSON.stringify(structure),
      unitsJson: '{}',
      pageMappingJson: JSON.stringify({ units: [] }),
      pdfPageCounts: { full: 1 },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'activities', code: 'missing-content' }),
    ]));
    expect(result.manifest).toMatchObject({
      nodes: [{ nodeKey: 'unit-1', title: 'Individuality, community' }],
      sourceSet: { sourceStrategy: 'full_pdf' },
      units: [{ unitKey: 'unit-1', activitySlots: [{ activityKey: 'activity-1' }], pageGroups: [{ pageGroupKey: 'group-1', sourceKey: 'full', pages: [1] }] }],
    });
    expect(result.activitiesByKey).toBeUndefined();
  });

  it('rejects node titles outside the shared manifest contract', () => {
    for (const title of ['', '   ', 'a'.repeat(201), null, 123]) {
      const result = validateLocalBookAuthoring({
        strategy: 'full', pdfs: [pdf], unitsJson: '{}', pageMappingJson: '{"units":[]}',
        structureJson: JSON.stringify({ nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', title, order: 1 }], units: [] }),
      });
      expect(result.errors).toContainEqual(expect.objectContaining({ field: 'structure', path: '$.nodes[0].title', code: 'invalid-value' }));
      expect(result.manifest).toBeUndefined();
    }
  });

  it('rechecks component count and aggregate-size limits on restored drafts', () => {
    const result = validateLocalBookAuthoring({
      strategy: 'component',
      pdfs: Array.from({ length: 21 }, (_, index) => ({
        id: `component-${index + 1}`,
        sourceKey: `component-${index + 1}`,
        name: `${index + 1}.pdf`,
        size: 3 * 1024 * 1024,
        type: 'application/pdf',
        lastModified: 1,
        blobKey: `component-${index + 1}`,
      })),
      structureJson: '{"nodes":[],"units":[]}',
      unitsJson: '{}',
      pageMappingJson: '{"units":[]}',
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'files', code: 'invalid-cardinality' }),
      expect.objectContaining({ field: 'files', code: 'aggregate-size-exceeded' }),
    ]));
  });

  it('binds each component source to the Unit that owns its source-qualified Page Groups', () => {
    const structure = {
      nodes: [
        { nodeKey: 'unit-a', parentNodeKey: null, nodeType: 'unit', order: 1 },
        { nodeKey: 'unit-b', parentNodeKey: null, nodeType: 'unit', order: 2 },
      ],
      units: [
        { unitKey: 'unit-a', activitySlots: [], pageGroups: [] },
        { unitKey: 'unit-b', activitySlots: [], pageGroups: [] },
      ],
    };
    const pageMapping = {
      units: [
        { unitKey: 'unit-a', activitySlots: [], pageGroups: [{ pageGroupKey: 'group-a', sourceKey: 'component-a', pages: [1], activityKeys: [], mode: 'reference_only' }] },
        { unitKey: 'unit-b', activitySlots: [], pageGroups: [{ pageGroupKey: 'group-b', sourceKey: 'component-b', pages: [1], activityKeys: [], mode: 'reference_only' }] },
      ],
    };
    const result = validateLocalBookAuthoring({
      strategy: 'component',
      pdfs: componentPdfs,
      structureJson: JSON.stringify(structure),
      unitsJson: '{}',
      pageMappingJson: JSON.stringify(pageMapping),
      pdfPageCounts: { 'component-a': 1, 'component-b': 1 },
    });

    expect(result.valid).toBe(true);
    expect(result.manifest?.sourceSet).toEqual({
      sourceStrategy: 'component_pdfs',
      sources: [
        expect.objectContaining({ sourceKey: 'component-b', sourceOrder: 1, ownerNodeKey: 'unit-b' }),
        expect.objectContaining({ sourceKey: 'component-a', sourceOrder: 2, ownerNodeKey: 'unit-a' }),
      ],
    });
  });
});
