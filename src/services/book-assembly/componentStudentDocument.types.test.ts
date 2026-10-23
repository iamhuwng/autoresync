import { describe, expect, it } from 'vitest';
import { createComponentStudentDocument, projectCombinedPageContext } from './componentStudentDocument.types';

const descriptor = () => createComponentStudentDocument({
  sourceVersionId: 'student-v1', descriptorRevision: 2, sha256Hex: 'a'.repeat(64), byteSize: 123,
  physicalPageCount: 5, compositionFingerprint: 'composition-1', components: [
    { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'u1', localPageCount: 2, combinedStartPage: 1, combinedEndPage: 2 },
    { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 2, ownerNodeKey: 'u2', localPageCount: 3, combinedStartPage: 3, combinedEndPage: 5 },
  ],
});

describe('projectCombinedPageContext', () => {
  it('converts configured component opening pages to authorized combined pages', () => {
    expect(projectCombinedPageContext(descriptor(), [{ pageGroupKey: 'g', sourceKey: 'b', pages: [1, 3], defaultPhysicalPageNumber: 3 }]))
      .toEqual([{ pageGroupKey: 'g', combinedPhysicalPages: [3, 5], defaultCombinedPhysicalPage: 5 }]);
    expect(() => projectCombinedPageContext(descriptor(), [{ pageGroupKey: 'g', sourceKey: 'b', pages: [1, 3], defaultPhysicalPageNumber: 2 }])).toThrow();
  });
  it('projects first, last, and cross-component pages without source identity', () => {
    const projected = projectCombinedPageContext(descriptor(), [
      { pageGroupKey: 'g1', sourceKey: 'a', pages: [1, 2] },
      { pageGroupKey: 'g2', sourceKey: 'b', pages: [1, 3] },
    ]);
    expect(projected).toEqual([
      { pageGroupKey: 'g1', combinedPhysicalPages: [1, 2] },
      { pageGroupKey: 'g2', combinedPhysicalPages: [3, 5] },
    ]);
    expect(JSON.stringify(projected)).not.toMatch(/source|descriptor|sha256/iu);
  });

  it.each([
    [{ pageGroupKey: 'missing', sourceKey: 'missing', pages: [1] }],
    [{ pageGroupKey: 'zero', sourceKey: 'a', pages: [0] }],
    [{ pageGroupKey: 'overflow', sourceKey: 'b', pages: [4] }],
    [{ pageGroupKey: 'duplicate', sourceKey: 'a', pages: [1] }, { pageGroupKey: 'duplicate', sourceKey: 'b', pages: [1] }],
  ].map(groups => ({ groups })))('fails closed for invalid component/page facts', ({ groups }) => {
    expect(() => projectCombinedPageContext(descriptor(), groups)).toThrow();
  });
});
