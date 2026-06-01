import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const databaseRules = JSON.parse(readFileSync('database.rules.json', 'utf8')) as {
  rules: Record<string, unknown>;
};

describe('Material Catalog Firebase rule contract', () => {
  it('defines material_catalog Test Type and teacher preference nodes', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown> | undefined;

    expect(materialCatalog).toBeDefined();
    expect(materialCatalog?.test_types).toBeDefined();
    expect(materialCatalog?.teacher_test_type_preferences).toBeDefined();
    expect(materialCatalog?.books).toBeDefined();
    expect(materialCatalog?.book_nodes).toBeDefined();
    expect(materialCatalog?.book_indexes).toBeDefined();
  });

  it('lets authenticated users read Test Types and keeps writes super_admin-only', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const testTypes = materialCatalog.test_types as Record<string, unknown>;

    expect(testTypes['.read']).toBe('auth != null');
    expect(testTypes['.write']).toContain("root.child('users').child(auth.uid).child('role').val() === 'super_admin'");
  });

  it('indexes Test Types for active, teacherSelectable, and displayOrder queries', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const testTypes = materialCatalog.test_types as Record<string, unknown>;

    expect(testTypes['.indexOn']).toEqual(
      expect.arrayContaining(['active', 'teacherSelectable', 'displayOrder']),
    );
  });

  it('gates teacher Test Type preferences to owner or super_admin', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const preferences = materialCatalog.teacher_test_type_preferences as Record<string, unknown>;
    const teacherRule = preferences.$teacherId as Record<string, string>;

    expect(teacherRule['.read']).toContain('$teacherId === auth.uid');
    expect(teacherRule['.read']).toContain("root.child('users').child(auth.uid).child('role').val() === 'super_admin'");
    expect(teacherRule['.write']).toContain('$teacherId === auth.uid');
    expect(teacherRule['.write']).toContain("root.child('users').child(auth.uid).child('role').val() === 'super_admin'");
    expect(teacherRule['.validate']).toContain("newData.child('teacherId').val() === $teacherId");
    expect(teacherRule['.validate']).toContain('pinnedTestTypeIds');
  });

  it('gates Book metadata to owners and super_admin while exposing public Book rows to teachers only', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const books = materialCatalog.books as Record<string, unknown>;
    const bookRule = books.$bookId as Record<string, string>;

    expect(bookRule['.read']).toContain("data.child('ownerId').val() === auth.uid");
    expect(bookRule['.read']).toContain("data.child('visibility').val() === 'public-library-published'");
    expect(bookRule['.read']).toContain("root.child('users').child(auth.uid).child('role').val() === 'teacher'");
    expect(bookRule['.read']).not.toContain("role').val() === 'student'");
    expect(bookRule['.write']).toContain("newData.child('ownerId').val() === auth.uid");
    expect(bookRule['.write']).toContain("root.child('users').child(auth.uid).child('role').val() === 'super_admin'");
    expect(bookRule['.validate']).toContain('draft-empty');
    expect(bookRule['.validate']).toContain('public-library-published');
  });

  it('gates Book nodes to Book owners/super_admin and validates required node shape', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const bookNodes = materialCatalog.book_nodes as Record<string, unknown>;
    const bookRule = bookNodes.$bookId as Record<string, unknown>;
    const nodeRule = (bookRule.$nodeId as Record<string, string>);

    expect(bookRule['.read']).toContain("root.child('material_catalog').child('books').child($bookId).child('ownerId').val() === auth.uid");
    expect(bookRule['.write']).toContain("root.child('material_catalog').child('books').child($bookId).child('ownerId').val() === auth.uid");
    expect(nodeRule['.validate']).toContain('parentNodeId');
    expect(nodeRule['.validate']).toContain('materialRefs');
    expect(nodeRule['.validate']).toContain('$nodeId');
  });

  it('defines Book listing indexes by owner, visibility, and Test Type', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const indexes = materialCatalog.book_indexes as Record<string, unknown>;

    expect(indexes.by_owner).toBeDefined();
    expect(indexes.by_visibility).toBeDefined();
    expect(indexes.by_test_type).toBeDefined();
    expect(JSON.stringify(indexes)).toContain('bookId');
    expect(JSON.stringify(indexes)).toContain('ownerId');
    expect(JSON.stringify(indexes)).toContain('visibility');
  });
});
