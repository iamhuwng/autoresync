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
    expect(materialCatalog?.material_indexes).toBeDefined();
    expect(materialCatalog?.books).toBeDefined();
    expect(materialCatalog?.book_nodes).toBeDefined();
    expect(materialCatalog?.public_book_projections).toBeDefined();
    expect(materialCatalog?.book_indexes).toBeDefined();
  });

  it('does not gate material_catalog at the root because child rules own scoped access', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;

    expect(materialCatalog['.read']).toBeUndefined();
    expect(materialCatalog['.write']).toBeUndefined();
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

  it('gates raw Book metadata to owners and super_admin without public-library leakage', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const books = materialCatalog.books as Record<string, unknown>;
    const bookRule = books.$bookId as Record<string, string>;

    expect(bookRule['.read']).toContain("data.child('ownerId').val() === auth.uid");
    expect(bookRule['.read']).not.toContain("data.child('visibility').val() === 'public-library-published'");
    expect(bookRule['.read']).not.toContain("data.child('visibility').val() === 'public-library-pending-review'");
    expect(bookRule['.read']).not.toContain("data.child('visibility').val() === 'public-library-rejected'");
    expect(bookRule['.read']).not.toContain("role').val() === 'student'");
    expect(bookRule['.write']).toContain("newData.child('ownerId').val() === auth.uid");
    expect(bookRule['.write']).toContain("root.child('users').child(auth.uid).child('role').val() === 'super_admin'");
    expect(bookRule['.validate']).toContain("newData.hasChildren(['bookId', 'ownerId', 'title', 'testTypeIds', 'visibility', 'status', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'])");
    expect(bookRule['.validate']).not.toContain("newData.hasChildren(['bookId', 'ownerId', 'title', 'authors'");
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
    expect(nodeRule['.validate']).toContain("newData.hasChildren(['nodeId', 'bookId', 'type', 'title', 'order', 'createdAt', 'updatedAt'])");
    expect(nodeRule['.validate']).toContain("!newData.child('parentNodeId').exists()");
    expect(nodeRule['.validate']).not.toContain("newData.hasChildren(['nodeId', 'bookId', 'parentNodeId'");
    expect(nodeRule['.validate']).not.toContain("'materialRefs', 'createdAt'");
    expect(nodeRule['.validate']).toContain('$nodeId');
  });

  it('defines public-safe Book projection read/write rules', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const projections = materialCatalog.public_book_projections as Record<string, unknown>;
    const projectionRule = projections.$bookId as Record<string, string>;
    const asText = JSON.stringify(projectionRule);

    expect(projectionRule['.read']).toContain("root.child('users').child(auth.uid).child('role').val() === 'teacher'");
    expect(projectionRule['.read']).toContain("root.child('users').child(auth.uid).child('role').val() === 'super_admin'");
    expect(projectionRule['.read']).not.toContain("role').val() === 'student'");
    expect(projectionRule['.write']).toContain("root.child('users').child(auth.uid).child('role').val() === 'super_admin'");
    expect(projectionRule['.validate']).toContain("newData.child('bookId').val() === $bookId");
    expect(projectionRule['.validate']).toContain("newData.hasChildren(['bookId', 'title', 'testTypeIds', 'visibility', 'status', 'updatedAt', 'approvedAt', 'approvedBy', 'nodes'])");
    expect(projectionRule['.validate']).not.toContain("'authors', 'testTypeIds', 'tags'");
    expect(projectionRule['.validate']).toContain('approvedBy');
    expect(projectionRule['.validate']).toContain('nodes');
    expect(asText).not.toContain('answerKey');
    expect(asText).not.toContain('hiddenProvenance');
    expect(asText).not.toContain('importEvidence');
    expect(asText).not.toContain('visibilitySnapshot');
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

  it('gates material summary indexes to teachers and super_admin while denying student browsing', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const indexes = materialCatalog.material_indexes as Record<string, unknown>;
    const ownerBucket = indexes.by_owner as Record<string, unknown>;
    const ownerListRule = ownerBucket.$ownerId as Record<string, unknown>;
    const ownerRule = ownerListRule.$materialId as Record<string, string>;
    const visibilityBucket = indexes.by_visibility as Record<string, unknown>;
    const visibilityListRule = visibilityBucket.$visibility as Record<string, unknown>;
    const visibilityRule = visibilityListRule.$materialId as Record<string, string>;

    expect(ownerListRule['.read']).toContain('$ownerId === auth.uid');
    expect(ownerListRule['.read']).toContain("root.child('users').child(auth.uid).child('role').val() === 'super_admin'");
    expect(ownerRule['.read']).toContain('$ownerId === auth.uid');
    expect(ownerRule['.read']).toContain("root.child('users').child(auth.uid).child('role').val() === 'super_admin'");
    expect(ownerRule['.read']).not.toContain("role').val() === 'student'");
    expect(ownerRule['.write']).toContain("newData.child('ownerId').val() === $ownerId");
    expect(ownerRule['.write']).toContain('$ownerId === auth.uid');
    expect(ownerRule['.validate']).toContain("newData.child('materialId').val() === $materialId");
    expect(ownerRule['.validate']).toContain("newData.child('ownerId').val() === $ownerId");

    expect(visibilityListRule['.read']).toContain("$visibility === 'public'");
    expect(visibilityListRule['.read']).toContain("root.child('users').child(auth.uid).child('role').val() === 'teacher'");
    expect(visibilityRule['.read']).toContain("$visibility === 'public'");
    expect(visibilityRule['.read']).toContain("root.child('users').child(auth.uid).child('role').val() === 'teacher'");
    expect(visibilityRule['.read']).not.toContain("role').val() === 'student'");
    expect(visibilityRule['.write']).toContain("newData.child('visibility').val() === $visibility");
    expect(visibilityRule['.validate']).toContain("newData.child('materialId').val() === $materialId");
  });

  it('validates material summary indexes as safe lightweight rows only', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const indexes = materialCatalog.material_indexes as Record<string, unknown>;
    const asText = JSON.stringify(indexes);

    expect(asText).toContain('materialId');
    expect(asText).toContain('ownerId');
    expect(asText).toContain('title');
    expect(asText).toContain('visibility');
    expect(asText).toContain('materialKind');
    expect(asText).toContain('testTypeIds');
    expect(asText).toContain('testTypeMembership');
    expect(asText).toContain('updatedAt');
    expect(asText).toContain("newData.child('title').isString()");
    expect(asText).toContain("newData.child('updatedAt').isString()");
    expect(asText).toContain("newData.child('visibility').val() === 'private'");
    expect(asText).toContain("newData.child('visibility').val() === 'public'");
    expect(asText).not.toContain('answerKey');
    expect(asText).not.toContain('hiddenProvenance');
    expect(asText).not.toContain('importEvidence');
    expect(asText).not.toContain('canonicalDraft');
  });

  it('does not require empty test-type children on broad material index buckets', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const indexes = materialCatalog.material_indexes as Record<string, unknown>;
    const ownerRule = ((indexes.by_owner as Record<string, unknown>).$ownerId as Record<string, unknown>)
      .$materialId as Record<string, string>;
    const visibilityRule = ((indexes.by_visibility as Record<string, unknown>).$visibility as Record<string, unknown>)
      .$materialId as Record<string, string>;
    const kindRule = ((indexes.by_material_kind as Record<string, unknown>).$materialKind as Record<string, unknown>)
      .$materialId as Record<string, string>;
    const sourceRule = ((indexes.by_source_full_test as Record<string, unknown>).$sourceFullTestId as Record<string, unknown>)
      .$materialId as Record<string, string>;
    const testTypeRule = ((indexes.by_test_type as Record<string, unknown>).$testTypeId as Record<string, unknown>)
      .$materialId as Record<string, string>;

    [
      ownerRule,
      visibilityRule,
      kindRule,
    ].forEach((rule) => {
      expect(rule['.validate']).toContain(
        "newData.hasChildren(['materialId', 'ownerId', 'title', 'visibility', 'materialKind', 'updatedAt'])",
      );
      expect(rule['.validate']).not.toContain(
        "testTypeIds', 'testTypeMembership'",
      );
    });
    expect(sourceRule['.validate']).toContain(
      "newData.hasChildren(['materialId', 'ownerId', 'title', 'visibility', 'materialKind', 'sourceFullTestId', 'updatedAt'])",
    );
    expect(sourceRule['.validate']).not.toContain(
      "testTypeIds', 'testTypeMembership'",
    );
    expect(testTypeRule['.validate']).toContain(
      "newData.hasChildren(['materialId', 'ownerId', 'title', 'visibility', 'materialKind', 'testTypeIds', 'testTypeMembership', 'updatedAt'])",
    );
    expect(testTypeRule['.validate']).toContain(
      "newData.child('testTypeMembership').child($testTypeId).val() === true",
    );
  });
});
