import { describe, expect, it } from 'vitest';
import {
  MATERIAL_CATALOG_STORAGE_NAMESPACE,
  assertMaterialCatalogPath,
  listMaterialCatalogPathClasses,
  materialCatalogPaths,
} from './materialCatalogPaths';

const samplePathByClass = {
  testTypes: materialCatalogPaths.testTypes('ielts'),
  teacherTestTypePreferences: materialCatalogPaths.teacherTestTypePreferences('teacher-1'),
  books: materialCatalogPaths.books('book-1'),
  bookNodes: materialCatalogPaths.bookNodes('book-1', 'node-1'),
  publicBookProjections: materialCatalogPaths.publicBookProjections('book-1'),
  bookIndexesByOwner: materialCatalogPaths.bookIndexesByOwner('teacher-1', 'book-1'),
  bookIndexesByVisibility: materialCatalogPaths.bookIndexesByVisibility('private', 'book-1'),
  bookIndexesByTestType: materialCatalogPaths.bookIndexesByTestType('ielts', 'book-1'),
} as const;

describe('materialCatalogPaths', () => {
  it('declares PRD-0052 material catalog paths under one namespace', () => {
    expect(listMaterialCatalogPathClasses().sort()).toEqual(
      Object.keys(samplePathByClass).sort(),
    );

    Object.values(samplePathByClass).forEach((path) => {
      expect(path.startsWith(`${MATERIAL_CATALOG_STORAGE_NAMESPACE}/`)).toBe(true);
      expect(() => assertMaterialCatalogPath(path)).not.toThrow();
    });
  });

  it('returns the exact RTDB path family required by PRD-0052', () => {
    expect(samplePathByClass).toEqual({
      testTypes: 'material_catalog/test_types/ielts',
      teacherTestTypePreferences:
        'material_catalog/teacher_test_type_preferences/teacher-1',
      books: 'material_catalog/books/book-1',
      bookNodes: 'material_catalog/book_nodes/book-1/node-1',
      publicBookProjections: 'material_catalog/public_book_projections/book-1',
      bookIndexesByOwner: 'material_catalog/book_indexes/by_owner/teacher-1/book-1',
      bookIndexesByVisibility: 'material_catalog/book_indexes/by_visibility/private/book-1',
      bookIndexesByTestType: 'material_catalog/book_indexes/by_test_type/ielts/book-1',
    });
  });

  it('rejects paths outside material_catalog', () => {
    expect(() => assertMaterialCatalogPath('reading_v2/books/book-1')).toThrow(/material_catalog/);
    expect(() => assertMaterialCatalogPath('books/book-1')).toThrow(/material_catalog/);
  });
});
