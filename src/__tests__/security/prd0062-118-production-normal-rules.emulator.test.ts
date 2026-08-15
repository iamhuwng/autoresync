import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
const describeEmulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;

let testEnv: RulesTestEnvironment;

const materialBook = () => ({
  bookId: 'book-1', bookMode: 'pdf', ownerId: 'teacher-1', title: 'Production PDF Book',
  testTypeIds: ['ielts'], visibility: 'private', status: 'ready',
  createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
  createdBy: 'teacher-1', updatedBy: 'teacher-1', bookRevision: 3, sourceSetRevision: 2,
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'source-1', sourceVersionId: 'version-1', sourceOrder: 1 }],
  },
});

const sourceProjection = (overrides: Record<string, unknown> = {}) => ({
  ownerId: 'teacher-1', bookId: 'book-1', sourceKey: 'source-1', sourceVersionId: 'version-1',
  physicalPageCount: 8, verifiedUsable: true, ...overrides,
});

const binding = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1, ownerId: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1', activityKey: 'activity-1',
  activityId: 'authoring-activity-1', candidateId: 'candidate-1', candidateRevision: 1,
  candidateLifecycle: 'validated', ...overrides,
});

const approval = (overrides: Record<string, unknown> = {}) => ({
  approvalId: 'approval-1', approvalRevision: 1, actorId: 'teacher-1', bookId: 'book-1',
  bookRevision: 3, unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: 1,
  sourceSetRevision: 2, registryVersion: 'registry-1', inputFingerprint: 'fingerprint-1',
  canonicalActivityFingerprintsByKey: { 'activity-1': 'fingerprint-activity-1' },
  approvedAt: '2026-08-13T00:00:00.000Z', expiresAt: '2026-08-14T00:00:00.000Z', ...overrides,
});

const revocation = (overrides: Record<string, unknown> = {}) => ({
  approvalId: 'approval-1', bookId: 'book-1', unitKey: 'unit-1', actorId: 'teacher-1',
  revokedAt: '2026-08-13T01:00:00.000Z', ...overrides,
});

const assemblyClaims = (overrides: Record<string, unknown> = {}) => ({
  book_assembly_service: true,
  book_assembly_ownerId: 'teacher-1',
  book_assembly_bookId: 'book-1',
  book_assembly_unitKey: 'unit-1',
  ...overrides,
});

const bindingClaims = (overrides: Record<string, unknown> = {}) => ({
  book_assembly_activity_binding_service: true,
  book_assembly_activity_binding_ownerId: 'teacher-1',
  book_assembly_activity_binding_bookId: 'book-1',
  book_assembly_activity_binding_unitKey: 'unit-1',
  book_assembly_activity_binding_activityKey: 'activity-1',
  ...overrides,
});

const assemblyAggregate = () => ({
  current: {
    candidateId: 'candidate-1', candidateRevision: 1, bookRevision: 3,
    sourceSetRevision: 2, updatedAt: '2026-08-13T00:00:00.000Z',
  },
  candidates: {
    'candidate-1': {
      candidateId: 'candidate-1', ownerId: 'teacher-1', bookId: 'book-1',
      unitKey: 'unit-1', bookRevision: 3, sourceSetRevision: 2, revision: 1,
      lifecycle: 'draft',
      manifest: {
        bookId: 'book-1', sourceSet: materialBook().sourceSet,
        nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
        units: [{ unitKey: 'unit-1', activitySlots: [], pageGroups: [] }],
      },
      validation: { valid: true, errors: [] }, updatedAt: '2026-08-13T00:00:00.000Z',
    },
  },
  operations: {
    '123e4567-e89b-42d3-a456-426614174001': {
      ownerId: 'teacher-1', fingerprint: 'fnv1a64:candidate-create',
      result: { status: 'created' }, createdAt: '2026-08-13T00:00:00.000Z',
    },
  },
});

const previewClaims = (overrides: Record<string, unknown> = {}) => ({
  book_assembly_preview_approval_service: true,
  book_assembly_preview_approval_ownerId: 'teacher-1',
  book_assembly_preview_approval_bookId: 'book-1',
  book_assembly_preview_approval_unitKey: 'unit-1',
  book_assembly_preview_approval_approvalId: 'approval-1',
  ...overrides,
});

const publicationClaims = (overrides: Record<string, unknown> = {}) => ({
  book_assembly_publication_approval_service: true,
  book_assembly_publication_approval_ownerId: 'teacher-1',
  book_assembly_publication_approval_bookId: 'book-1',
  book_assembly_publication_approval_unitKey: 'unit-1',
  book_assembly_publication_approval_approvalId: 'approval-1',
  ...overrides,
});

describeEmulator('PRD0062 #118 assembled production-normal RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-prd0062-118-production-normal',
      database: { rules: DATABASE_RULES },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('users/teacher-1/role').set('teacher');
      await context.database().ref('users/teacher-2/role').set('teacher');
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('permits the normal Material Book, verified source, binding, and approval/revocation paths while rejecting stale or broadened access', async () => {
    const teacher = testEnv.authenticatedContext('teacher-1').database();
    const assembly = testEnv.authenticatedContext('assembly-1', assemblyClaims()).database();
    const bindingService = testEnv.authenticatedContext('binding-1', bindingClaims()).database();
    const wrongAssembly = testEnv.authenticatedContext('assembly-2', assemblyClaims({ book_assembly_unitKey: 'unit-2' })).database();
    const preview = testEnv.authenticatedContext('teacher-1', previewClaims()).database();
    const publication = testEnv.authenticatedContext('teacher-1', publicationClaims()).database();

    await assertSucceeds(teacher.ref('material_catalog/books/book-1').set(materialBook()));
    await assertSucceeds(teacher.ref('material_catalog/books/book-1').once('value'));
    await assertSucceeds(assembly.ref('material_catalog/books/book-1').once('value'));
    await assertFails(testEnv.authenticatedContext('wrong-material-owner', assemblyClaims({ book_assembly_ownerId: 'teacher-2' })).database()
      .ref('material_catalog/books/book-1').once('value'));
    await assertFails(testEnv.authenticatedContext('wrong-material-book', assemblyClaims({ book_assembly_bookId: 'book-2' })).database()
      .ref('material_catalog/books/book-1').once('value'));
    await assertFails(testEnv.authenticatedContext('wrong-material-claim', { book_assembly_preview_service: true }).database()
      .ref('material_catalog/books/book-1').once('value'));
    await assertFails(assembly.ref('material_catalog/books').once('value'));
    await assertFails(teacher.ref('material_catalog/books/book-1').update({ unexpectedAuthority: true }));
    await assertFails(teacher.ref('material_catalog/books/book-1').update({ sourceSet: {
      sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'source-1', sourceVersionId: 'version-1', sourceOrder: 1, providerUrl: 'private' }],
    } }));

    const sourcePath = 'book_source_upload_accounts/account-1/assemblyBooks/book-1/source-1';
    await assertSucceeds(assembly.ref(sourcePath).set(sourceProjection()));
    await assertSucceeds(assembly.ref(sourcePath).once('value'));
    await assertFails(assembly.ref('book_source_upload_accounts/account-1/assemblyBooks/book-1').set({ 'source-1': sourceProjection() }));
    await assertFails(assembly.ref('book_source_upload_accounts/account-1/assemblyBooks/book-1/source-2').set(sourceProjection({ sourceKey: 'source-1' })));
    await assertFails(testEnv.authenticatedContext('wrong-book', assemblyClaims({ book_assembly_bookId: 'book-2' })).database()
      .ref(sourcePath).once('value'));
    await assertFails(assembly.ref('book_source_upload_accounts/account-1/assemblyBooks/book-1/source-secret').set(sourceProjection({ sourceKey: 'source-secret', privateObjectKey: 'secret' })));

    const bindingPath = 'book_assembly_activity_bindings/owners/teacher-1/books/book-1/units/unit-1/activities/activity-1';
    await assertSucceeds(bindingService.ref(bindingPath).set(binding()));
    await assertSucceeds(bindingService.ref(bindingPath).update({ candidateId: 'candidate-2', candidateRevision: 2, candidateLifecycle: 'saved' }));
    await assertFails(bindingService.ref(bindingPath).update({ candidateId: 'candidate-old', candidateRevision: 1 }));
    await assertFails(assembly.ref(bindingPath).once('value'));
    await assertFails(wrongAssembly.ref(bindingPath).set(binding()));
    await assertFails(bindingService.ref('book_assembly_activity_bindings/owners/teacher-1/books/book-1/units/unit-1').set({ activities: { 'activity-1': binding() } }));
    await assertFails(bindingService.ref(bindingPath).update({ privateObjectKey: 'secret' }));

    const approvalPath = 'book_assembly_preview_approvals/books/book-1/units/unit-1/approvals/approval-1';
    const revocationPath = 'book_assembly_preview_approvals/books/book-1/units/unit-1/revocations/approval-1';
    await assertSucceeds(preview.ref(approvalPath).once('value'));
    await assertSucceeds(preview.ref(revocationPath).once('value'));
    await assertFails(testEnv.authenticatedContext('preview-wrong-owner', previewClaims({ book_assembly_preview_approval_ownerId: 'teacher-2' })).database()
      .ref(approvalPath).once('value'));
    await assertFails(testEnv.authenticatedContext('preview-wrong-book', previewClaims({ book_assembly_preview_approval_bookId: 'book-2' })).database()
      .ref(approvalPath).once('value'));
    await assertFails(testEnv.authenticatedContext('preview-wrong-unit', previewClaims({ book_assembly_preview_approval_unitKey: 'unit-2' })).database()
      .ref(approvalPath).once('value'));
    await assertFails(testEnv.authenticatedContext('preview-wrong-approval', previewClaims({ book_assembly_preview_approval_approvalId: 'approval-2' })).database()
      .ref(approvalPath).once('value'));
    await assertFails(preview.ref('book_assembly_preview_approvals/books/book-1/units/unit-1/approvals/approval-sibling').once('value'));
    await assertFails(preview.ref('book_assembly_preview_approvals/books/book-1/units/unit-1/approvals').once('value'));
    await assertFails(preview.ref('book_assembly_preview_approvals/books/book-1/units/unit-1').once('value'));
    await assertFails(teacher.ref(approvalPath).once('value'));
    await assertSucceeds(preview.ref(approvalPath).set(approval()));
    await assertSucceeds(publication.ref(approvalPath).once('value'));
    await assertSucceeds(publication.ref(revocationPath).once('value'));
    await assertSucceeds(preview.ref(revocationPath).set(revocation()));
    await assertSucceeds(publication.ref(revocationPath).once('value'));
    await assertFails(preview.ref('book_assembly_preview_approvals/books/book-1/units/unit-1').set({ approvals: { 'approval-1': approval() } }));
    await assertFails(preview.ref('book_assembly_preview_approvals/books/book-1/units/unit-1/approvals/approval-2').set(approval({ approvalId: 'approval-2', answerKey: 'secret' })));
    await assertFails(testEnv.authenticatedContext('wrong-preview', previewClaims({ book_assembly_preview_approval_bookId: 'book-2' })).database()
      .ref(approvalPath).set(approval()));
    await assertFails(testEnv.authenticatedContext('publication-wrong-owner', publicationClaims({ book_assembly_publication_approval_ownerId: 'teacher-2' })).database()
      .ref(approvalPath).once('value'));
    await assertFails(testEnv.authenticatedContext('publication-wrong-book', publicationClaims({ book_assembly_publication_approval_bookId: 'book-2' })).database()
      .ref(approvalPath).once('value'));
    await assertFails(testEnv.authenticatedContext('publication-wrong-unit', publicationClaims({ book_assembly_publication_approval_unitKey: 'unit-2' })).database()
      .ref(approvalPath).once('value'));
    await assertFails(testEnv.authenticatedContext('publication-wrong-approval', publicationClaims({ book_assembly_publication_approval_approvalId: 'approval-2' })).database()
      .ref(approvalPath).once('value'));
    await assertFails(publication.ref('book_assembly_preview_approvals/books/book-1/units/unit-1/approvals/approval-sibling').once('value'));
    await assertFails(publication.ref('book_assembly_preview_approvals/books/book-1/units/unit-1/approvals').once('value'));

    const approvalSnapshot = await publication.ref(approvalPath).once('value');
    const revocationSnapshot = await publication.ref(revocationPath).once('value');
    expect(approvalSnapshot.val().approvalId).toBe('approval-1');
    expect(revocationSnapshot.val().revokedAt).toBe('2026-08-13T01:00:00.000Z');
  });

  it('permits an exact binding claim at an absent leaf but denies sibling, parent, wrong-scope, and browser access', async () => {
    const bindingPath = 'book_assembly_activity_bindings/owners/teacher-1/books/book-1/units/unit-1/activities/activity-absent';
    const siblingPath = 'book_assembly_activity_bindings/owners/teacher-1/books/book-1/units/unit-1/activities/activity-sibling';
    const exact = testEnv.authenticatedContext('binding-absent', bindingClaims({
      book_assembly_activity_binding_activityKey: 'activity-absent',
    })).database();
    const wrongOwner = testEnv.authenticatedContext('binding-wrong-owner', bindingClaims({
      book_assembly_activity_binding_ownerId: 'teacher-2',
    })).database();
    const wrongBook = testEnv.authenticatedContext('binding-wrong-book', bindingClaims({
      book_assembly_activity_binding_bookId: 'book-2',
    })).database();
    const wrongUnit = testEnv.authenticatedContext('binding-wrong-unit', bindingClaims({
      book_assembly_activity_binding_unitKey: 'unit-2',
    })).database();
    const generalAssembly = testEnv.authenticatedContext('assembly-absent', assemblyClaims()).database();
    const browser = testEnv.authenticatedContext('teacher-1').database();

    const absentSnapshot = await assertSucceeds(exact.ref(bindingPath).once('value'));
    expect(absentSnapshot.exists()).toBe(false);
    await assertFails(wrongOwner.ref(bindingPath).once('value'));
    await assertFails(wrongBook.ref(bindingPath).once('value'));
    await assertFails(wrongUnit.ref(bindingPath).once('value'));
    await assertFails(generalAssembly.ref(bindingPath).once('value'));
    await assertFails(browser.ref(bindingPath).once('value'));
    await assertFails(exact.ref(siblingPath).once('value'));
    await assertFails(exact.ref(siblingPath).set(binding({ activityKey: 'activity-sibling' })));
    await assertFails(exact.ref('book_assembly_activity_bindings/owners/teacher-1/books/book-1/units/unit-1').once('value'));
    await assertFails(exact.ref('book_assembly_activity_bindings/owners/teacher-1/books/book-1/units/unit-1/activities').once('value'));

    await assertSucceeds(exact.ref(bindingPath).set(binding({ activityKey: 'activity-absent' })));
    const snapshot = await exact.ref(bindingPath).once('value');
    expect(snapshot.val()).toMatchObject({ activityKey: 'activity-absent' });
  });

  it('permits the exact Assembly aggregate write and denies wrong Book or unit claims', async () => {
    const aggregatePath = 'book_assembly/books/book-1/units/unit-1';
    const assembly = testEnv.authenticatedContext('assembly-1', assemblyClaims()).database();
    const wrongBook = testEnv.authenticatedContext('assembly-wrong-book', assemblyClaims({
      book_assembly_bookId: 'book-2',
    })).database();
    const wrongUnit = testEnv.authenticatedContext('assembly-wrong-unit', assemblyClaims({
      book_assembly_unitKey: 'unit-2',
    })).database();

    await assertSucceeds(assembly.ref(aggregatePath).set(assemblyAggregate()));
    await assertFails(wrongBook.ref(aggregatePath).set(assemblyAggregate()));
    await assertFails(wrongUnit.ref(aggregatePath).set(assemblyAggregate()));
  });

  it('permits the exact Assembly aggregate write when all #102 protected roots are non-null', async () => {
    const aggregatePath = 'book_assembly/books/book-1/units/unit-1';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().update({
        'course_enrollments/legacy-enrollment-1': {
          enrollmentId: 'legacy-enrollment-1', courseId: 'course-1', studentId: 'student-1',
          status: 'active', revision: 7, updatedAt: '2026-08-13T00:00:00.000Z',
        },
        'course_book_authority/enrollments/course-1/student-1': {
          legacyEnrollmentId: 'legacy-enrollment-1', revision: 7,
        },
        'course_book_authority/releases/course-1/module-1/student-1': {
          released: true, revision: 4,
        },
        'course_book_authority/operations/existing-102-receipt': {
          operationId: 'existing-102-receipt', fingerprint: 'immutable',
        },
      });
    });

    const assembly = testEnv.authenticatedContext('assembly-1', assemblyClaims()).database();
    await assertSucceeds(assembly.ref(aggregatePath).set(assemblyAggregate()));
  });
});
