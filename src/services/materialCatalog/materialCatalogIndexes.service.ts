import {
  type MaterialCatalogMaterialKind,
  type MaterialTestTypeId,
} from '../../types/materialCatalog.types';

export interface MaterialCatalogIndexSummary {
  readonly materialId: string;
  readonly ownerId: string;
  readonly title: string;
  readonly visibility: string;
  readonly materialKind: MaterialCatalogMaterialKind;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly sourceFullTestId?: string;
  readonly updatedAt: string;
}

export interface MaterialCatalogIndexRow {
  readonly materialId: string;
  readonly ownerId: string;
  readonly title: string;
  readonly visibility: string;
  readonly materialKind: MaterialCatalogMaterialKind;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly testTypeMembership: Record<string, true>;
  readonly sourceFullTestId?: string;
  readonly updatedAt: string;
}

export interface MaterialCatalogIndexWrite {
  readonly path: string;
  readonly value: MaterialCatalogIndexRow | null;
}

const materialIndexPath = (
  bucket: 'by_owner' | 'by_visibility' | 'by_material_kind' | 'by_test_type' | 'by_source_full_test',
  key: string,
  materialId: string,
): string => `material_catalog/material_indexes/${bucket}/${key}/${materialId}`;

const uniqueTestTypeIds = (testTypeIds: readonly MaterialTestTypeId[]): MaterialTestTypeId[] => {
  const seen = new Set<string>();
  const result: MaterialTestTypeId[] = [];

  testTypeIds.forEach((testTypeId) => {
    if (!seen.has(testTypeId)) {
      seen.add(testTypeId);
      result.push(testTypeId);
    }
  });

  return result;
};

const toIndexRow = (summary: MaterialCatalogIndexSummary): MaterialCatalogIndexRow => {
  const testTypeIds = uniqueTestTypeIds(summary.testTypeIds);

  return {
    materialId: summary.materialId,
    ownerId: summary.ownerId,
    title: summary.title,
    visibility: summary.visibility,
    materialKind: summary.materialKind,
    testTypeIds,
    testTypeMembership: Object.fromEntries(testTypeIds.map((testTypeId) => [testTypeId, true])),
    sourceFullTestId: summary.sourceFullTestId,
    updatedAt: summary.updatedAt,
  };
};

export const listMaterialCatalogIndexPaths = (
  summary: MaterialCatalogIndexSummary,
): string[] => {
  const basePaths = [
    materialIndexPath('by_owner', summary.ownerId, summary.materialId),
    materialIndexPath('by_visibility', summary.visibility, summary.materialId),
    materialIndexPath('by_material_kind', summary.materialKind, summary.materialId),
    ...uniqueTestTypeIds(summary.testTypeIds).map((testTypeId) =>
      materialIndexPath('by_test_type', testTypeId, summary.materialId),
    ),
  ];

  if (summary.sourceFullTestId) {
    basePaths.push(
      materialIndexPath('by_source_full_test', summary.sourceFullTestId, summary.materialId),
    );
  }

  return basePaths;
};

export const buildMaterialCatalogIndexWrites = (
  summary: MaterialCatalogIndexSummary,
): MaterialCatalogIndexWrite[] => {
  const row = toIndexRow(summary);

  return listMaterialCatalogIndexPaths(summary).map((path) => ({
    path,
    value: row,
  }));
};

export const buildMaterialCatalogIndexCleanup = (
  previous: MaterialCatalogIndexSummary | null | undefined,
  next: MaterialCatalogIndexSummary,
): MaterialCatalogIndexWrite[] => {
  if (!previous) {
    return [];
  }

  const nextPaths = new Set(listMaterialCatalogIndexPaths(next));

  return listMaterialCatalogIndexPaths(previous)
    .filter((path) => !nextPaths.has(path))
    .map((path) => ({
      path,
      value: null,
    }));
};
