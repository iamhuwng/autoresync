export const MATERIAL_CATALOG_STORAGE_NAMESPACE = 'material_catalog';

export type MaterialCatalogPathClass =
  | 'testTypes'
  | 'teacherTestTypePreferences'
  | 'books'
  | 'bookNodes'
  | 'publicBookProjections'
  | 'bookIndexesByOwner'
  | 'bookIndexesByVisibility'
  | 'bookIndexesByTestType';

const namespaced = (path: string): string => `${MATERIAL_CATALOG_STORAGE_NAMESPACE}/${path}`;

export const materialCatalogPaths = {
  testTypes: (testTypeId: string): string => namespaced(`test_types/${testTypeId}`),
  teacherTestTypePreferences: (teacherId: string): string =>
    namespaced(`teacher_test_type_preferences/${teacherId}`),
  books: (bookId: string): string => namespaced(`books/${bookId}`),
  bookNodes: (bookId: string, nodeId: string): string =>
    namespaced(`book_nodes/${bookId}/${nodeId}`),
  publicBookProjections: (bookId: string): string =>
    namespaced(`public_book_projections/${bookId}`),
  bookIndexesByOwner: (ownerId: string, bookId: string): string =>
    namespaced(`book_indexes/by_owner/${ownerId}/${bookId}`),
  bookIndexesByVisibility: (visibility: string, bookId: string): string =>
    namespaced(`book_indexes/by_visibility/${visibility}/${bookId}`),
  bookIndexesByTestType: (testTypeId: string, bookId: string): string =>
    namespaced(`book_indexes/by_test_type/${testTypeId}/${bookId}`),
} as const;

export const MATERIAL_CATALOG_PATH_BUILDERS = materialCatalogPaths;

export const assertMaterialCatalogPath = (path: string): void => {
  if (!path.startsWith(`${MATERIAL_CATALOG_STORAGE_NAMESPACE}/`)) {
    throw new Error(
      `Material Catalog storage path must live under ${MATERIAL_CATALOG_STORAGE_NAMESPACE}: ${path}`,
    );
  }
};

export const listMaterialCatalogPathClasses = (): MaterialCatalogPathClass[] =>
  Object.keys(MATERIAL_CATALOG_PATH_BUILDERS) as MaterialCatalogPathClass[];
