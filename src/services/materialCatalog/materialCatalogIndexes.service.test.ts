import { describe, expect, it } from 'vitest';

import { materialCatalogIds } from '../../types/materialCatalog.types';
import {
  buildMaterialCatalogIndexCleanup,
  buildMaterialCatalogIndexWrites,
  type MaterialCatalogIndexSummary,
} from './materialCatalogIndexes.service';

const summary = (overrides: Partial<MaterialCatalogIndexSummary> = {}): MaterialCatalogIndexSummary => ({
  materialId: 'passage-1',
  ownerId: 'teacher-1',
  title: 'Reading passage',
  visibility: 'private',
  materialKind: 'reading-passage',
  testTypeIds: [materialCatalogIds.testTypeId('ielts'), materialCatalogIds.testTypeId('toeic')],
  sourceFullTestId: 'full-test-1',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

describe('materialCatalogIndexes.service', () => {
  it('fans material summaries out by owner, visibility, material kind, Test Type, and source full test', () => {
    const writes = buildMaterialCatalogIndexWrites(summary());
    const byPath = Object.fromEntries(writes.map((write) => [write.path, write.value]));

    expect(Object.keys(byPath)).toEqual(
      expect.arrayContaining([
        'material_catalog/material_indexes/by_owner/teacher-1/passage-1',
        'material_catalog/material_indexes/by_visibility/private/passage-1',
        'material_catalog/material_indexes/by_material_kind/reading-passage/passage-1',
        'material_catalog/material_indexes/by_test_type/ielts/passage-1',
        'material_catalog/material_indexes/by_test_type/toeic/passage-1',
        'material_catalog/material_indexes/by_source_full_test/full-test-1/passage-1',
      ]),
    );
    expect(byPath['material_catalog/material_indexes/by_owner/teacher-1/passage-1']).toMatchObject({
      materialId: 'passage-1',
      testTypeMembership: {
        ielts: true,
        toeic: true,
      },
    });
  });

  it('returns cleanup writes for stale owner, visibility, material kind, Test Type, and source indexes', () => {
    const cleanup = buildMaterialCatalogIndexCleanup(
      summary({
        ownerId: 'old-teacher',
        visibility: 'public',
        materialKind: 'full-test',
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        sourceFullTestId: 'old-full-test',
      }),
      summary({
        ownerId: 'teacher-1',
        visibility: 'private',
        materialKind: 'reading-passage',
        testTypeIds: [materialCatalogIds.testTypeId('toeic')],
        sourceFullTestId: 'full-test-1',
      }),
    );

    expect(cleanup).toEqual(
      expect.arrayContaining([
        { path: 'material_catalog/material_indexes/by_owner/old-teacher/passage-1', value: null },
        { path: 'material_catalog/material_indexes/by_visibility/public/passage-1', value: null },
        { path: 'material_catalog/material_indexes/by_material_kind/full-test/passage-1', value: null },
        { path: 'material_catalog/material_indexes/by_test_type/ielts/passage-1', value: null },
        {
          path: 'material_catalog/material_indexes/by_source_full_test/old-full-test/passage-1',
          value: null,
        },
      ]),
    );
  });
});
