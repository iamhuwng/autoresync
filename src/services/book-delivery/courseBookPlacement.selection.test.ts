import { describe, expect, it } from 'vitest';
import type { CourseBookSelectionCatalog } from './courseBookPlacement.selection';
import { courseBookExposureWarning, courseBookSelectionCount } from './courseBookPlacement.selection';

const catalog = (sourceStrategy: 'full_pdf' | 'component_pdfs'): CourseBookSelectionCatalog => ({
  bookId: 'book-1', publicationId: 'publication-1', publicationRevision: 1,
  manifestVersionId: 'manifest-1', sourceStrategy,
  sources: sourceStrategy === 'full_pdf'
    ? [{ sourceKey: 'source-1' }]
    : [{ sourceKey: 'source-1', ownerNodeKey: 'unit-1' }],
  nodes: [
    { nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 },
    { nodeKey: 'test-1', parentNodeKey: 'unit-1', nodeType: 'test', order: 1 },
    { nodeKey: 'test-2', parentNodeKey: 'unit-1', nodeType: 'test', order: 2 },
  ],
  placements: [
    { placementId: 'placement-1', nodeKey: 'test-1', activityId: 'activity-1',
      activityVersionId: 'activity-version-1', sourceKeys: ['source-1'] },
    { placementId: 'placement-2', nodeKey: 'test-2', activityId: 'activity-2',
      activityVersionId: 'activity-version-2', sourceKeys: ['source-1'] },
  ],
});

describe('Course Book placement exposure warnings', () => {
  it('warns for a partial full-PDF scope but not the complete subtree', () => {
    expect(courseBookSelectionCount(catalog('full_pdf'), {
      kind: 'subtree', nodeKeys: ['test-1'], placementIds: [],
    })).toBe(1);
    expect(courseBookExposureWarning(catalog('full_pdf'), {
      kind: 'subtree', nodeKeys: ['test-1'], placementIds: [],
    })).toContain('complete Book PDF');
    expect(courseBookExposureWarning(catalog('full_pdf'), {
      kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [],
    })).toBeNull();
  });

  it('warns below a component owner and for an Activity-only selection', () => {
    expect(courseBookExposureWarning(catalog('component_pdfs'), {
      kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [],
    })).toBeNull();
    expect(courseBookExposureWarning(catalog('component_pdfs'), {
      kind: 'subtree', nodeKeys: ['test-1'], placementIds: [],
    })).toContain('complete Component PDF');
    expect(courseBookExposureWarning(catalog('component_pdfs'), {
      kind: 'placements', nodeKeys: [], placementIds: ['placement-1'],
    })).toContain('complete Component PDF');
  });
});
