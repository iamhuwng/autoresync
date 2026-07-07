import { readFileSync } from 'node:fs';
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const databaseRules = JSON.parse(readFileSync('database.rules.json', 'utf8')) as {
  rules: Record<string, unknown>;
};
const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
const PROJECT_ID = 'demo-prd-0052-material-catalog-rules';
const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;

let testEnv: RulesTestEnvironment;

const seedMaterialCatalogUsers = async (): Promise<void> => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();

    await db.ref('users/student-1/role').set('student');
    await db.ref('users/teacher-1/role').set('teacher');
    await db.ref('users/teacher-2/role').set('teacher');
    await db.ref('users/admin-1/role').set('super_admin');
    await db.ref('material_catalog/books/book-1').set({
      bookId: 'book-1',
      ownerId: 'teacher-1',
      title: 'Owner Book',
      testTypeIds: ['ielts'],
      visibility: 'private',
      status: 'draft-in-progress',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
      createdBy: 'teacher-1',
      updatedBy: 'teacher-1',
    });
    await db.ref('material_catalog/material_indexes/by_owner/teacher-1/material-public').set(
      materialSummary('material-public', 'teacher-1', 'public', 'reading-passage'),
    );
    await db.ref('material_catalog/material_indexes/by_visibility/public/material-public').set(
      materialSummary('material-public', 'teacher-1', 'public', 'reading-passage'),
    );
    await db.ref('material_catalog/public_book_projections/book-public').set(publicBookProjection('book-public'));
  });
};

const makeMaterialCatalogRuleContexts = () => ({
  admin: testEnv.authenticatedContext('admin-1'),
  student: testEnv.authenticatedContext('student-1'),
  teacher: testEnv.authenticatedContext('teacher-1'),
  otherTeacher: testEnv.authenticatedContext('teacher-2'),
  unauthenticated: testEnv.unauthenticatedContext(),
});

const materialSummary = (
  materialId: string,
  ownerId = 'teacher-1',
  visibility: 'private' | 'public' = 'private',
  materialKind: 'reading-passage' | 'full-test' | 'book' = 'reading-passage',
) => ({
  materialId,
  ownerId,
  title: 'Reading Passage Summary',
  visibility,
  materialKind,
  updatedAt: '2026-06-04T00:00:00.000Z',
});

const universalMaterialSummary = (
  materialId: string,
  overrides: Record<string, unknown> = {},
) => ({
  schemaVersion: 1,
  materialId,
  producerId: 'generic-test',
  materialKind: 'full-test',
  surfaceFamily: 'assessment',
  ownerId: 'teacher-1',
  title: 'Universal Material',
  visibility: 'private',
  lifecycleState: 'active',
  skillId: 'reading',
  primaryTestTypeId: 'ielts',
  testTypeIds: ['ielts'],
  testTypeMembership: { ielts: true },
  tags: ['reading'],
  questionCount: 40,
  durationMinutes: 60,
  updatedAt: '2026-07-07T00:00:00.000Z',
  ...overrides,
});

const bookMetadata = (overrides: Record<string, unknown> = {}) => ({
  bookId: 'book-2',
  ownerId: 'teacher-1',
  title: 'Book Draft',
  testTypeIds: ['ielts'],
  visibility: 'private',
  status: 'draft-empty',
  createdAt: '2026-06-04T00:00:00.000Z',
  updatedAt: '2026-06-04T00:00:00.000Z',
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  ...overrides,
});

const bookNode = (overrides: Record<string, unknown> = {}) => ({
  nodeId: 'node-1',
  bookId: 'book-1',
  type: 'section',
  title: 'Section',
  order: 1,
  createdAt: '2026-06-04T00:00:00.000Z',
  updatedAt: '2026-06-04T00:00:00.000Z',
  ...overrides,
});

const publicBookProjection = (bookId: string, overrides: Record<string, unknown> = {}) => ({
  bookId,
  title: 'Public Book',
  testTypeIds: ['ielts'],
  visibility: 'public-library-published',
  status: 'ready',
  updatedAt: '2026-06-04T00:00:00.000Z',
  approvedAt: '2026-06-04T00:00:00.000Z',
  approvedBy: 'admin-1',
  nodes: {
    node1: {
      nodeId: 'node1',
      type: 'section',
      title: 'Public Section',
      order: 1,
    },
  },
  ...overrides,
});

describe('Material Catalog Firebase rule contract', () => {
  it('defines material_catalog Test Type and teacher preference nodes', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown> | undefined;

    expect(materialCatalog).toBeDefined();
    expect(materialCatalog?.test_types).toBeDefined();
    expect(materialCatalog?.teacher_test_type_preferences).toBeDefined();
    expect(materialCatalog?.material_indexes).toBeDefined();
    expect(materialCatalog?.material_summary_indexes).toBeDefined();
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
    expect(nodeRule['.validate']).toContain("!newData.child('hiddenProvenance').exists()");
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
    expect(asText).toContain("!newData.child('answerKey').exists()");
    expect(asText).toContain("!newData.child('answerKeys').exists()");
    expect(asText).toContain("!newData.child('hiddenProvenance').exists()");
    expect(asText).toContain("!newData.child('importEvidence').exists()");
    expect(asText).toContain("!newData.child('canonicalEditableDraft').exists()");
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

  it('allows owner cleanup of stale material summary indexes from canonical metadata ownership', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const indexes = materialCatalog.material_indexes as Record<string, unknown>;
    const ownerRule = ((indexes.by_owner as Record<string, unknown>).$ownerId as Record<string, unknown>)
      .$materialId as Record<string, string>;
    const visibilityRule = ((indexes.by_visibility as Record<string, unknown>).$visibility as Record<string, unknown>)
      .$materialId as Record<string, string>;
    const kindRule = ((indexes.by_material_kind as Record<string, unknown>).$materialKind as Record<string, unknown>)
      .$materialId as Record<string, string>;
    const testTypeRule = ((indexes.by_test_type as Record<string, unknown>).$testTypeId as Record<string, unknown>)
      .$materialId as Record<string, string>;
    const sourceRule = ((indexes.by_source_full_test as Record<string, unknown>).$sourceFullTestId as Record<string, unknown>)
      .$materialId as Record<string, string>;

    [
      ownerRule,
      visibilityRule,
      kindRule,
      testTypeRule,
      sourceRule,
    ].forEach((rule) => {
      expect(rule['.write']).toContain(
        "root.child('reading_v2').child('material_metadata').child($materialId).child('ownerId').val() === auth.uid",
      );
    });
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
    expect(asText).toContain("!newData.child('answerKey').exists()");
    expect(asText).toContain("!newData.child('answerKeys').exists()");
    expect(asText).toContain("!newData.child('hiddenProvenance').exists()");
    expect(asText).toContain("!newData.child('importEvidence').exists()");
    expect(asText).toContain("!newData.child('canonicalEditableDraft').exists()");
  });

  it('defines versioned universal summary ownership, public-read, and schema rules', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, any>;
    const indexes = materialCatalog.material_summary_indexes.v1;
    expect(indexes.by_source_full_test).toBeUndefined();

    const ownerBucket = indexes.by_owner.$ownerId;
    const publicBucket = indexes.by_visibility.$visibility;
    const byIdRule = indexes.by_id.$materialId;
    const universalRowRules = [
      byIdRule,
      ownerBucket.$materialId,
      publicBucket.$materialId,
      indexes.by_material_kind.$materialKind.$materialId,
      indexes.by_test_type.$testTypeId.$materialId,
    ];
    const asText = JSON.stringify(indexes);

    expect(ownerBucket['.read']).toContain('$ownerId === auth.uid');
    expect(ownerBucket['.indexOn']).toContain('updatedAt');
    expect(publicBucket['.read']).toContain("$visibility === 'public'");
    expect(publicBucket['.read']).toContain("role').val() === 'teacher'");
    expect(byIdRule['.read']).toContain("data.child('lifecycleState').val() === 'active'");
    expect(byIdRule['.validate']).toContain("newData.child('schemaVersion').val() === 1");
    expect(byIdRule['.validate']).toContain("newData.child('materialId').val() === $materialId");
    expect(byIdRule['.validate']).toContain('testTypeMembership');
    expect(byIdRule.$other['.validate']).toBe(false);
    universalRowRules.forEach((rule) => {
      expect(rule.$other['.validate']).toBe(false);
    });
    expect(byIdRule.description['.validate']).toBe('newData.isString()');
    expect(byIdRule.questionCount['.validate']).toBe('newData.isNumber() && newData.val() >= 0');
    expect(byIdRule.durationMinutes['.validate']).toBe('newData.isNumber() && newData.val() >= 0');
    expect(byIdRule.brokenRefCount['.validate']).toBe('newData.isNumber() && newData.val() >= 0');
    expect(byIdRule.testTypeMembership.$testTypeId['.validate']).toBe('newData.val() === true');
    expect(asText).toContain("newData.child('lifecycleState').val() === 'active'");
    expect(asText).toContain("newData.child('testTypeMembership').child($testTypeId).val() === true");
    expect(asText).toContain("!newData.child('document').exists()");
    expect(asText).toContain("!newData.child('questions').exists()");
    expect(asText).toContain("!newData.child('answerKey').exists()");
    expect(asText).toContain("!newData.child('studentAnswers').exists()");
    universalRowRules.forEach((rule) => {
      expect(rule['.write']).toContain("data.child('producerId').val() !== 'material-book'");
      expect(rule['.write']).toContain("data.child('visibility').val() !== 'public'");
    });
  });

  it('defines owner-scoped archive indexes as safe lightweight rows only', () => {
    const materialCatalog = databaseRules.rules.material_catalog as Record<string, unknown>;
    const archiveIndexes = materialCatalog.material_archive_indexes as Record<string, any>;
    const listRule = archiveIndexes.by_owner.$ownerId['reading-passage'] as Record<string, any>;
    const rowRule = archiveIndexes.by_owner.$ownerId['reading-passage'].$materialId as Record<string, string>;
    const asText = JSON.stringify(archiveIndexes);

    expect(listRule['.read']).toContain('$ownerId === auth.uid');
    expect(rowRule['.read']).toContain('$ownerId === auth.uid');
    expect(rowRule['.write']).toContain('$ownerId === auth.uid');
    expect(rowRule['.validate']).toContain("newData.child('materialId').val() === $materialId");
    expect(rowRule['.validate']).toContain("newData.child('ownerId').val() === $ownerId");
    expect(rowRule['.validate']).toContain("newData.child('currentVersionId').isString()");
    expect(rowRule['.validate']).toContain("newData.child('archivedAt').isString()");
    [
      'passageBody',
      'bodyText',
      'questionText',
      'reviewPayload',
      'document',
      'answerKey',
      'answerKeys',
      'scoringRule',
      'hiddenProvenance',
      'importEvidence',
    ].forEach((field) => {
      expect(asText).toContain(`!newData.child('${field}').exists()`);
    });
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

describeEmulator('Material Catalog Firebase rule emulator behavior', () => {
  beforeEach(async () => {
    if (!testEnv) {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        database: { rules: DATABASE_RULES },
      });
    }

    await testEnv.clearDatabase();
    await seedMaterialCatalogUsers();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('gates material index rows by owner, visibility, and student role', async () => {
    const {
      admin,
      otherTeacher,
      student,
      teacher,
      unauthenticated,
    } = makeMaterialCatalogRuleContexts();

    await assertSucceeds(
      teacher.database().ref('material_catalog/material_indexes/by_owner/teacher-1/material-1').set(
        materialSummary('material-1'),
      ),
    );
    await assertSucceeds(teacher.database().ref('material_catalog/material_indexes/by_owner/teacher-1/material-1').once('value'));
    await assertSucceeds(admin.database().ref('material_catalog/material_indexes/by_owner/teacher-1/material-1').once('value'));
    await assertFails(otherTeacher.database().ref('material_catalog/material_indexes/by_owner/teacher-1/material-1').once('value'));
    await assertFails(student.database().ref('material_catalog/material_indexes/by_owner/teacher-1/material-1').once('value'));
    await assertFails(unauthenticated.database().ref('material_catalog/material_indexes/by_owner/teacher-1/material-1').once('value'));

    await assertSucceeds(teacher.database().ref('material_catalog/material_indexes/by_visibility/public/material-public').once('value'));
    await assertFails(student.database().ref('material_catalog/material_indexes/by_visibility/public/material-public').once('value'));
  });

  it('rejects hidden/scoring fields in material summary indexes', async () => {
    const { teacher } = makeMaterialCatalogRuleContexts();

    await assertFails(
      teacher.database().ref('material_catalog/material_indexes/by_owner/teacher-1/material-unsafe').set({
        ...materialSummary('material-unsafe'),
        answerKey: { q1: 'A' },
      }),
    );
    await assertFails(
      teacher.database().ref('material_catalog/material_indexes/by_visibility/private/material-unsafe').set({
        ...materialSummary('material-unsafe'),
        hiddenProvenance: { source: 'draft-1' },
      }),
    );
  });

  it('enforces universal summary owner/public reads and rejects unsafe rows', async () => {
    const {
      admin,
      otherTeacher,
      student,
      teacher,
      unauthenticated,
    } = makeMaterialCatalogRuleContexts();
    const ownerPath =
      'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/material-1';
    const publicPath =
      'material_catalog/material_summary_indexes/v1/by_visibility/public/material-public';
    const byIdPrivatePath =
      'material_catalog/material_summary_indexes/v1/by_id/material-by-id-private';
    const byIdPublicPath =
      'material_catalog/material_summary_indexes/v1/by_id/material-by-id-public';
    const byIdArchivedPath =
      'material_catalog/material_summary_indexes/v1/by_id/material-by-id-archived';
    const byIdRemovedPath =
      'material_catalog/material_summary_indexes/v1/by_id/material-by-id-removed';
    const privateInPublicPath =
      'material_catalog/material_summary_indexes/v1/by_visibility/public/material-private-in-public';
    const kindPrivatePath =
      'material_catalog/material_summary_indexes/v1/by_material_kind/full-test/material-kind-private';
    const testTypePrivatePath =
      'material_catalog/material_summary_indexes/v1/by_test_type/ielts/material-test-type-private';

    await assertSucceeds(
      teacher.database().ref(ownerPath).set(
        universalMaterialSummary('material-1'),
      ),
    );
    await assertSucceeds(teacher.database().ref(ownerPath).once('value'));
    await assertSucceeds(admin.database().ref(ownerPath).once('value'));
    await assertFails(otherTeacher.database().ref(ownerPath).once('value'));
    await assertFails(student.database().ref(ownerPath).once('value'));
    await assertFails(unauthenticated.database().ref(ownerPath).once('value'));

    await assertSucceeds(
      teacher.database().ref(publicPath).set(
        universalMaterialSummary('material-public', {
          visibility: 'public',
        }),
      ),
    );
    await assertSucceeds(otherTeacher.database().ref(publicPath).once('value'));
    await assertFails(student.database().ref(publicPath).once('value'));
    await assertFails(unauthenticated.database().ref(publicPath).once('value'));
    await assertFails(
      teacher.database().ref(privateInPublicPath).set(
        universalMaterialSummary('material-private-in-public'),
      ),
    );

    await assertSucceeds(
      teacher.database().ref(byIdPrivatePath).set(
        universalMaterialSummary('material-by-id-private'),
      ),
    );
    await assertSucceeds(teacher.database().ref(byIdPrivatePath).once('value'));
    await assertFails(otherTeacher.database().ref(byIdPrivatePath).once('value'));
    await assertFails(student.database().ref(byIdPrivatePath).once('value'));

    await assertSucceeds(
      teacher.database().ref(byIdPublicPath).set(
        universalMaterialSummary('material-by-id-public', {
          visibility: 'public',
        }),
      ),
    );
    await assertSucceeds(otherTeacher.database().ref(byIdPublicPath).once('value'));
    await assertFails(student.database().ref(byIdPublicPath).once('value'));

    await assertSucceeds(
      admin.database().ref(byIdArchivedPath).set(
        universalMaterialSummary('material-by-id-archived', {
          lifecycleState: 'archived',
        }),
      ),
    );
    await assertFails(teacher.database().ref(byIdArchivedPath).once('value'));
    await assertSucceeds(admin.database().ref(byIdArchivedPath).once('value'));

    await assertSucceeds(
      teacher.database().ref(byIdRemovedPath).set(
        universalMaterialSummary('material-by-id-removed', {
          lifecycleState: 'removed',
        }),
      ),
    );
    await assertFails(teacher.database().ref(byIdRemovedPath).once('value'));
    await assertSucceeds(admin.database().ref(byIdRemovedPath).once('value'));

    await assertSucceeds(
      teacher.database().ref(kindPrivatePath).set(
        universalMaterialSummary('material-kind-private'),
      ),
    );
    await assertSucceeds(admin.database().ref(kindPrivatePath).once('value'));
    await assertFails(teacher.database().ref(kindPrivatePath).once('value'));
    await assertFails(otherTeacher.database().ref(kindPrivatePath).once('value'));
    await assertFails(student.database().ref(kindPrivatePath).once('value'));

    await assertSucceeds(
      teacher.database().ref(testTypePrivatePath).set(
        universalMaterialSummary('material-test-type-private'),
      ),
    );
    await assertSucceeds(admin.database().ref(testTypePrivatePath).once('value'));
    await assertFails(teacher.database().ref(testTypePrivatePath).once('value'));
    await assertFails(otherTeacher.database().ref(testTypePrivatePath).once('value'));
    await assertFails(student.database().ref(testTypePrivatePath).once('value'));

    await assertFails(
      teacher.database().ref(
        'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/unsafe',
      ).set(universalMaterialSummary('unsafe', {
        questions: [{ answer: 'A' }],
      })),
    );
    await assertFails(
      teacher.database().ref(
        'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/review-payload',
      ).set(universalMaterialSummary('review-payload', {
        reviewPayload: { private: true },
      })),
    );
    await assertFails(
      teacher.database().ref(
        'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/unknown-extra',
      ).set(universalMaterialSummary('unknown-extra', {
        content: 'private source text',
      })),
    );
    await assertFails(
      teacher.database().ref(
        'material_catalog/material_summary_indexes/v1/by_visibility/public/unknown-public-extra',
      ).set(universalMaterialSummary('unknown-public-extra', {
        visibility: 'public',
        content: 'private source text',
      })),
    );
    await assertFails(
      teacher.database().ref(
        'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/bad-description',
      ).set(universalMaterialSummary('bad-description', {
        description: { text: 'not allowed' },
      })),
    );
    await assertFails(
      teacher.database().ref(
        'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/negative-count',
      ).set(universalMaterialSummary('negative-count', {
        questionCount: -1,
      })),
    );
    await assertFails(
      teacher.database().ref(
        'material_catalog/material_summary_indexes/v1/by_test_type/toeic/material-1',
      ).set(universalMaterialSummary('material-1')),
    );
  });

  it('prevents teachers from publishing Book summaries without admin moderation', async () => {
    const { admin, teacher } = makeMaterialCatalogRuleContexts();
    const publicBookPaths = [
      'material_catalog/material_summary_indexes/v1/by_id/book-public',
      'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/book-public',
      'material_catalog/material_summary_indexes/v1/by_visibility/public/book-public',
      'material_catalog/material_summary_indexes/v1/by_material_kind/book/book-public',
      'material_catalog/material_summary_indexes/v1/by_test_type/ielts/book-public',
    ];
    const publicBookSummary = universalMaterialSummary('book-public', {
      producerId: 'material-book',
      materialKind: 'book',
      surfaceFamily: 'book',
      visibility: 'public',
      tags: ['book'],
    });
    const privateBookSummary = {
      ...publicBookSummary,
      visibility: 'private',
    };

    for (const path of publicBookPaths) {
      await assertFails(teacher.database().ref(path).set(publicBookSummary));
      await assertSucceeds(admin.database().ref(path).set(publicBookSummary));
      await assertFails(teacher.database().ref(path).set(privateBookSummary));
      await assertFails(teacher.database().ref(path).remove());
      await assertSucceeds(admin.database().ref(path).remove());
    }
  });

  it('allows only owners/super admins to write Books and keeps published public state admin-only', async () => {
    const {
      admin,
      otherTeacher,
      teacher,
    } = makeMaterialCatalogRuleContexts();

    await assertSucceeds(teacher.database().ref('material_catalog/books/book-2').set(bookMetadata()));
    await assertFails(otherTeacher.database().ref('material_catalog/books/book-3').set(bookMetadata({ bookId: 'book-3' })));
    await assertFails(
      teacher.database().ref('material_catalog/books/book-4').set(bookMetadata({
        bookId: 'book-4',
        visibility: 'public-library-published',
        status: 'ready',
      })),
    );
    await assertSucceeds(
      admin.database().ref('material_catalog/books/book-4').set(bookMetadata({
        bookId: 'book-4',
        visibility: 'public-library-published',
        status: 'ready',
      })),
    );
  });

  it('gates Book nodes and denies hidden fields inside node payloads', async () => {
    const {
      admin,
      otherTeacher,
      teacher,
    } = makeMaterialCatalogRuleContexts();

    await assertSucceeds(teacher.database().ref('material_catalog/book_nodes/book-1/node-1').set(bookNode()));
    await assertSucceeds(admin.database().ref('material_catalog/book_nodes/book-1/node-2').set(bookNode({ nodeId: 'node-2' })));
    await assertFails(otherTeacher.database().ref('material_catalog/book_nodes/book-1/node-3').set(bookNode({ nodeId: 'node-3' })));
    await assertFails(
      teacher.database().ref('material_catalog/book_nodes/book-1/node-unsafe').set(
        bookNode({
          nodeId: 'node-unsafe',
          hiddenProvenance: { source: 'private-draft' },
        }),
      ),
    );
  });

  it('keeps public Book projections teacher-readable and super-admin writable only', async () => {
    const {
      admin,
      otherTeacher,
      student,
      teacher,
    } = makeMaterialCatalogRuleContexts();

    await assertSucceeds(teacher.database().ref('material_catalog/public_book_projections/book-public').once('value'));
    await assertSucceeds(otherTeacher.database().ref('material_catalog/public_book_projections/book-public').once('value'));
    await assertFails(student.database().ref('material_catalog/public_book_projections/book-public').once('value'));
    await assertFails(teacher.database().ref('material_catalog/public_book_projections/book-public-2').set(publicBookProjection('book-public-2')));
    await assertSucceeds(admin.database().ref('material_catalog/public_book_projections/book-public-2').set(publicBookProjection('book-public-2')));
    await assertFails(
      admin.database().ref('material_catalog/public_book_projections/book-public-unsafe').set(
        publicBookProjection('book-public-unsafe', {
          answerKey: { q1: 'A' },
        }),
      ),
    );
  });

  it('keeps Test Type config super-admin-only while preferences stay owner/super-admin scoped', async () => {
    const {
      admin,
      otherTeacher,
      teacher,
    } = makeMaterialCatalogRuleContexts();
    const testTypePayload = {
      testTypeId: 'ielts',
      canonicalKey: 'ielts',
      label: 'IELTS',
      shortLabel: 'IELTS',
      aliases: ['IELTS'],
      active: true,
      teacherSelectable: true,
      displayOrder: 1,
      readingSourceOrderLabel: 'Passage',
      readingSourceOrderLabelPlural: 'Passages',
      logoAlt: 'IELTS',
      allowedMaterialKinds: ['full-test', 'reading-passage', 'book'],
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
      updatedBy: 'admin-1',
    };

    await assertFails(teacher.database().ref('material_catalog/test_types/ielts').set(testTypePayload));
    await assertSucceeds(admin.database().ref('material_catalog/test_types/ielts').set(testTypePayload));
    await assertSucceeds(
      teacher.database().ref('material_catalog/teacher_test_type_preferences/teacher-1').set({
        teacherId: 'teacher-1',
        pinnedTestTypeIds: ['ielts'],
        updatedAt: '2026-06-04T00:00:00.000Z',
        updatedBy: 'teacher-1',
      }),
    );
    await assertFails(
      otherTeacher.database().ref('material_catalog/teacher_test_type_preferences/teacher-1').set({
        teacherId: 'teacher-1',
        pinnedTestTypeIds: ['ielts'],
        updatedAt: '2026-06-04T00:00:00.000Z',
        updatedBy: 'teacher-2',
      }),
    );
  });
});
