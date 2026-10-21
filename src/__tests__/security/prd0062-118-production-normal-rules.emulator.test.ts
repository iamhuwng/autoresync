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
const EMULATOR_PROJECT = 'demo-prd0062-118-production-normal';
const jwtSegment = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const emulatorIdToken = (uid: string, claims: Record<string, unknown>): string => {
  const now = Math.floor(Date.now() / 1000);
  return `${jwtSegment({ alg: 'none', typ: 'JWT' })}.${jwtSegment({
    iss: `https://securetoken.google.com/${EMULATOR_PROJECT}`, aud: EMULATOR_PROJECT,
    auth_time: now, iat: now, exp: now + 3600, sub: uid, user_id: uid,
    firebase: { identities: {}, sign_in_provider: 'custom' }, ...claims,
  })}.`;
};

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
  checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  physicalPageCount: 8, verifiedUsable: true, purpose: 'book-source', studentSafeStatus: 'unreviewed',
  ...overrides,
});

const sourceDecision = (sourceVersionId: string, decidedBy = 'teacher-1', sha256Hex = 'a'.repeat(64)) => ({
  decidedBy, decidedAt: '2026-08-13T00:00:00.000Z', sourceVersionId, sha256Hex, reasonCode: 'teacher-reviewed',
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
  wholeActivationFingerprint: 'fnv1a64:aaaaaaaaaaaaaaaa',
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

const publicationServiceClaims = (overrides: Record<string, unknown> = {}) => ({
  book_assembly_publication_service: true,
  book_assembly_publication_ownerId: 'teacher-1',
  book_assembly_publication_bookId: 'book-1',
  ...overrides,
});

const studentDocument = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1, logicalSourceKey: 'student-document', sourceVersionId: 'student-v1',
  descriptorRevision: 3, descriptorCasOwner: 'assembly-publication', sha256Hex: 'a'.repeat(64),
  byteSize: 100, physicalPageCount: 2, studentSafeStatus: 'ready', compositionFingerprint: 'composition-1',
  components: [
    { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-a', localPageCount: 1, combinedStartPage: 1, combinedEndPage: 1 },
    { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 2, ownerNodeKey: 'unit-b', localPageCount: 1, combinedStartPage: 2, combinedEndPage: 2 },
  ],
  ...overrides,
});

const resultReadClaims = (overrides: Record<string, unknown> = {}) => ({
  book_result_read_service: true,
  book_result_read_studentId: 'student-1',
  book_result_read_bookId: 'book-1',
  book_result_read_groupKey: 'g-result-activity',
  ...overrides,
});

describeEmulator('PRD0062 #118 assembled production-normal RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: EMULATOR_PROJECT,
      database: { rules: DATABASE_RULES },
    });
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('users/teacher-1').set({ role: 'teacher', status: 'active' });
      await context.database().ref('users/teacher-2').set({ role: 'teacher', status: 'active' });
      await context.database().ref('users/admin-1').set({ role: 'super_admin', status: 'active' });
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('keeps setupActivations ordinary-write immutable and descriptors create-once without publication pointer writes', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('material_catalog/books/book-1').set({
        ...materialBook(),
        setupActivations: [
          { operationId: 'activation-1', marker: 'exact' },
          { operationId: 'activation-2', marker: 'exact' },
        ],
      });
      await context.database().ref('book_assembly_publications/books/book-1').set({
        current: { marker: 'current' }, versions: { v1: { marker: 'version' } }, audits: { a1: { marker: 'audit' } },
      });
    });
    const teacher = testEnv.authenticatedContext('teacher-1').database();
    const admin = testEnv.authenticatedContext('admin-1').database();
    const service = testEnv.authenticatedContext('publication-service', publicationServiceClaims()).database();
    const descriptorPath = 'book_assembly_publications/books/book-1/student_documents/student-v1';
    await assertFails(teacher.ref('material_catalog/books/book-1/setupActivations').set([]));
    await assertFails(admin.ref('material_catalog/books/book-1/setupActivations').remove());
    await assertFails(teacher.ref('material_catalog/books/book-1/setupActivations/0/operationId').set('altered'));
    await assertFails(admin.ref('material_catalog/books/book-1/setupActivations/2').set({ operationId: 'activation-3' }));
    await assertFails(teacher.ref('material_catalog/books/book-1/setupActivations').set([
      { operationId: 'activation-1', marker: 'exact' },
    ]));
    await assertSucceeds(teacher.ref('material_catalog/books/book-1').update({ title: 'Updated title' }));
    expect((await teacher.ref('material_catalog/books/book-1/setupActivations').once('value')).val())
      .toEqual([
        { operationId: 'activation-1', marker: 'exact' },
        { operationId: 'activation-2', marker: 'exact' },
      ]);
    await assertSucceeds(service.ref(descriptorPath).set(studentDocument()));
    await assertSucceeds(service.ref(descriptorPath).set(studentDocument()));
    await assertFails(service.ref(descriptorPath).set(studentDocument({ byteSize: 101 })));
    await assertFails(service.ref(descriptorPath).remove());
    const sparseDescriptor = studentDocument({ sourceVersionId: 'student-v2' });
    await assertFails(service.ref('book_assembly_publications/books/book-1/student_documents/student-v2').set({
      ...sparseDescriptor,
      components: {
        0: sparseDescriptor.components[0],
        1: sparseDescriptor.components[1],
        21: { ...sparseDescriptor.components[0], sourceOrder: 22 },
      },
    }));
    await assertFails(testEnv.authenticatedContext('wrong-publication-owner', publicationServiceClaims({
      book_assembly_publication_ownerId: 'teacher-2',
    })).database().ref(descriptorPath).once('value'));
    expect((await service.ref('book_assembly_publications/books/book-1/current').once('value')).val()).toEqual({ marker: 'current' });
    expect((await service.ref('book_assembly_publications/books/book-1/versions').once('value')).val()).toEqual({ v1: { marker: 'version' } });
    expect((await service.ref('book_assembly_publications/books/book-1/audits').once('value')).val()).toEqual({ a1: { marker: 'audit' } });
  });

  it('persists the whole-activation digest only at the exact approval leaf', async () => {
    const preview = testEnv.authenticatedContext('teacher-1', previewClaims()).database();
    const publication = testEnv.authenticatedContext('teacher-1', publicationClaims()).database();
    const approvalPath = 'book_assembly_preview_approvals/books/book-1/units/unit-1/approvals/approval-1';

    await assertSucceeds(preview.ref(approvalPath).set(approval()));
    expect((await assertSucceeds(publication.ref(approvalPath).once('value'))).val())
      .toMatchObject({ wholeActivationFingerprint: 'fnv1a64:aaaaaaaaaaaaaaaa' });
    const referenceApproval: Record<string, unknown> = approval({ approvalId: 'reference-approval' });
    delete referenceApproval.wholeActivationFingerprint;
    const referencePreview = testEnv.authenticatedContext('teacher-1', previewClaims({
      book_assembly_preview_approval_approvalId: 'reference-approval',
    })).database();
    await assertSucceeds(referencePreview.ref(approvalPath.replace('approval-1', 'reference-approval')).set(referenceApproval));
    const malformedPreview = testEnv.authenticatedContext('teacher-1', previewClaims({
      book_assembly_preview_approval_approvalId: 'malformed-approval',
    })).database();
    await assertFails(malformedPreview.ref(approvalPath.replace('approval-1', 'malformed-approval'))
      .set(approval({ approvalId: 'malformed-approval', wholeActivationFingerprint: 42 })));
    await assertFails(preview.ref('book_assembly_preview_approvals/books/book-1/units/unit-1').set({
      approvals: { 'approval-1': approval() },
    }));
  });

  it('permits the normal Material Book, verified source, binding, and approval/revocation paths while rejecting stale or broadened access', async () => {
    const teacher = testEnv.authenticatedContext('teacher-1').database();
    const admin = testEnv.authenticatedContext('admin-1').database();
    const assembly = testEnv.authenticatedContext('assembly-1', assemblyClaims()).database();
    const bindingService = testEnv.authenticatedContext('binding-1', bindingClaims()).database();
    const wrongAssembly = testEnv.authenticatedContext('assembly-2', assemblyClaims({ book_assembly_unitKey: 'unit-2' })).database();
    const preview = testEnv.authenticatedContext('teacher-1', previewClaims()).database();
    const publication = testEnv.authenticatedContext('teacher-1', publicationClaims()).database();

    await assertSucceeds(teacher.ref('material_catalog/books/book-1').set(materialBook()));
    await assertSucceeds(teacher.ref('material_catalog/books/book-1').once('value'));
    await assertSucceeds(testEnv.authenticatedContext('admin-1').database()
      .ref('material_catalog/books/book-1').once('value'));
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

    const sourceParentPath = 'book_source_upload_accounts/account-1/assemblyBooks/book-1';
    const sourcePath = `${sourceParentPath}/version-1`;
    await assertSucceeds(assembly.ref(sourcePath).set(sourceProjection()));
    await assertSucceeds(assembly.ref(sourcePath).once('value'));
    await assertSucceeds(teacher.ref(sourcePath).once('value'));
    await assertFails(testEnv.authenticatedContext('teacher-2').database().ref(sourcePath).once('value'));
    await assertFails(testEnv.authenticatedContext('student-1').database().ref(sourcePath).once('value'));
    await assertSucceeds(assembly.ref(sourcePath).update({
      studentSafeStatus: 'ready',
      studentSafeDecision: sourceDecision('version-1'),
    }));
    await assertSucceeds(assembly.ref(sourcePath).once('value'));

    const reviewRequiredPath = `${sourceParentPath}/version-review-required`;
    await assertSucceeds(assembly.ref(reviewRequiredPath).set(sourceProjection({
      sourceVersionId: 'version-review-required',
    })));
    await assertSucceeds(assembly.ref(reviewRequiredPath).update({
      studentSafeStatus: 'review-required',
      studentSafeDecision: sourceDecision('version-review-required'),
    }));
    await assertSucceeds(assembly.ref(reviewRequiredPath).once('value'));
    await assertSucceeds(teacher.ref(reviewRequiredPath).once('value'));
    // The root super_admin grant also covers this leaf.
    await assertSucceeds(admin.ref(reviewRequiredPath).once('value'));

    const adminDecisionPath = `${sourceParentPath}/version-admin-decision`;
    await assertSucceeds(assembly.ref(adminDecisionPath).set(sourceProjection({
      sourceVersionId: 'version-admin-decision',
    })));
    await assertSucceeds(assembly.ref(adminDecisionPath).update({
      studentSafeStatus: 'ready',
      studentSafeDecision: sourceDecision('version-admin-decision', 'admin-1'),
    }));
    await assertSucceeds(assembly.ref(adminDecisionPath).once('value'));

    const wrongTeacherDecisionPath = `${sourceParentPath}/version-wrong-teacher-decision`;
    await assertSucceeds(assembly.ref(wrongTeacherDecisionPath).set(sourceProjection({
      sourceVersionId: 'version-wrong-teacher-decision',
    })));
    await assertFails(assembly.ref(wrongTeacherDecisionPath).update({
      studentSafeStatus: 'ready',
      studentSafeDecision: sourceDecision('version-wrong-teacher-decision', 'teacher-2'),
    }));

    const directDecidedPath = `${sourceParentPath}/version-direct-decided`;
    await assertFails(assembly.ref(directDecidedPath).set(sourceProjection({
      sourceVersionId: 'version-direct-decided', studentSafeStatus: 'ready',
      studentSafeDecision: sourceDecision('version-direct-decided'),
    })));
    const missingChecksum = sourceProjection({ sourceVersionId: 'version-missing-checksum' }) as Record<string, unknown>;
    delete missingChecksum.checksum;
    await assertFails(assembly.ref(`${sourceParentPath}/version-missing-checksum`).set(missingChecksum));
    await assertFails(assembly.ref(`${sourceParentPath}/version-malformed-checksum`).set(sourceProjection({
      sourceVersionId: 'version-malformed-checksum',
      checksum: { algorithm: 'md5', value: 'a'.repeat(64) },
    })));
    const malformedHashPath = `${sourceParentPath}/version-malformed-hash`;
    await assertSucceeds(assembly.ref(malformedHashPath).set(sourceProjection({
      sourceVersionId: 'version-malformed-hash',
    })));
    await assertFails(assembly.ref(malformedHashPath).update({
      studentSafeStatus: 'ready',
      studentSafeDecision: sourceDecision('version-malformed-hash', 'teacher-1', 'z'.repeat(64)),
    }));
    await assertFails(assembly.ref(`${sourceParentPath}/version-wrong-owner`).set(sourceProjection({
      sourceVersionId: 'version-wrong-owner', ownerId: 'teacher-2',
    })));
    await assertFails(assembly.ref(`${sourceParentPath}/version-mismatched-version`).set(sourceProjection({
      sourceVersionId: 'payload-version',
    })));

    const foreignVersionPath = `${sourceParentPath}/version-foreign`;
    await assertSucceeds(assembly.ref(foreignVersionPath).set(sourceProjection({ sourceVersionId: 'version-foreign' })));
    await assertFails(assembly.ref(foreignVersionPath).update({
      studentSafeStatus: 'ready', studentSafeDecision: sourceDecision('version-other'),
    }));
    const staleHashPath = `${sourceParentPath}/version-stale-hash`;
    await assertSucceeds(assembly.ref(staleHashPath).set(sourceProjection({ sourceVersionId: 'version-stale-hash' })));
    await assertFails(assembly.ref(staleHashPath).update({
      studentSafeStatus: 'ready', studentSafeDecision: sourceDecision('version-stale-hash', 'teacher-1', 'b'.repeat(64)),
    }));
    await assertFails(assembly.ref(sourcePath).update({ physicalPageCount: 9 }));
    await assertFails(assembly.ref(sourceParentPath).once('value'));
    await assertFails(assembly.ref(sourceParentPath).set({ 'version-1': sourceProjection() }));
    await assertFails(assembly.ref(sourceParentPath).update({ 'version-1/physicalPageCount': 9 }));
    await assertFails(assembly.ref(sourcePath).update({ studentSafeStatus: 'rejected' }));
    await assertFails(assembly.ref(sourcePath).remove());
    await assertFails(testEnv.authenticatedContext('wrong-book', assemblyClaims({ book_assembly_bookId: 'book-2' })).database()
      .ref(sourcePath).once('value'));
    await assertFails(assembly.ref('book_source_upload_accounts/account-1/assemblyBooks/book-1/version-secret').set(sourceProjection({ sourceKey: 'source-secret', sourceVersionId: 'version-secret', privateObjectKey: 'secret' })));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('book_source_upload_accounts/account-1/assemblyBooks/book-1/student-document-1')
        .set(sourceProjection({ sourceVersionId: 'student-document-1', purpose: 'student-document' }));
      await context.database().ref('book_source_upload_accounts/account-1/assemblyBooks/book-1/version-rejected')
        .set(sourceProjection({ sourceVersionId: 'version-rejected', studentSafeStatus: 'rejected', studentSafeDecision: sourceDecision('version-rejected') }));
    });
    await assertFails(assembly.ref('book_source_upload_accounts/account-1/assemblyBooks/book-1/student-document-1').once('value'));
    await assertFails(assembly.ref('book_source_upload_accounts/account-1/assemblyBooks/book-1/version-rejected').once('value'));

    for (const [label, fence] of [
      ['blocked', { status: 'blocked' }],
      ['inactive', { status: 'inactive' }],
      ['suspended', { status: 'suspended' }],
      ['disabled', { disabled: true }],
      ['force-reauth', { forceReauth: true }],
      ['revoked', { privilegedAuthorityRevokedAt: '2026-08-13T02:00:00.000Z' }],
    ] as const) {
      const path = `${sourceParentPath}/owner-fence-${label}`;
      await assertSucceeds(assembly.ref(path).set(sourceProjection({ sourceVersionId: `owner-fence-${label}` })));
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('users/teacher-1').update(fence);
      });
      await assertFails(teacher.ref(path).once('value'));
      await assertFails(assembly.ref(path).update({
        studentSafeStatus: 'ready', studentSafeDecision: sourceDecision(`owner-fence-${label}`),
      }));
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('users/teacher-1').set({ role: 'teacher', status: 'active' });
      });
    }

    for (const [label, fence] of [
      ['blocked', { status: 'blocked' }],
      ['inactive', { status: 'inactive' }],
      ['suspended', { status: 'suspended' }],
      ['disabled', { disabled: true }],
      ['force-reauth', { forceReauth: true }],
      ['revoked', { privilegedAuthorityRevokedAt: '2026-08-13T02:00:00.000Z' }],
    ] as const) {
      const versionId = `admin-fence-${label}`;
      const path = `${sourceParentPath}/${versionId}`;
      await assertSucceeds(assembly.ref(path).set(sourceProjection({ sourceVersionId: versionId })));
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('users/admin-1').update(fence);
      });
      await assertSucceeds(admin.ref(path).once('value'));
      await assertFails(assembly.ref(path).update({
        studentSafeStatus: 'ready', studentSafeDecision: sourceDecision(versionId, 'admin-1'),
      }));
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('users/admin-1').set({ role: 'super_admin', status: 'active' });
      });
    }

    const bindingPath = 'book_assembly_activity_bindings/owners/teacher-1/books/book-1/units/unit-1/activities/activity-1';
    await assertSucceeds(bindingService.ref(bindingPath).set(binding()));
    await assertSucceeds(bindingService.ref(bindingPath).update({ candidateId: 'candidate-2', candidateRevision: 2, candidateLifecycle: 'saved' }));
    await assertFails(bindingService.ref(bindingPath).update({ candidateId: 'candidate-stale', candidateRevision: 2 }));
    await assertFails(bindingService.ref(bindingPath).update({ activityId: 'activity-remapped', candidateRevision: 3 }));
    await assertFails(bindingService.ref(bindingPath).update({ candidateRevision: 3, activityVersionId: 'published-version', activityVersion: 1 }));
    await assertFails(teacher.ref(bindingPath).update({ candidateId: 'browser-candidate', candidateRevision: 3 }));
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
    expect(approvalSnapshot.val().wholeActivationFingerprint).toBe('fnv1a64:aaaaaaaaaaaaaaaa');
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
    await assertSucceeds(exact.ref(bindingPath).update({ candidateId: 'candidate-2', candidateRevision: 3 }));
    await assertFails(wrongOwner.ref(bindingPath).update({ candidateId: 'candidate-3', candidateRevision: 4 }));
    await assertFails(wrongBook.ref(bindingPath).update({ candidateId: 'candidate-3', candidateRevision: 4 }));
    await assertFails(wrongUnit.ref(bindingPath).update({ candidateId: 'candidate-3', candidateRevision: 4 }));
    const snapshot = await exact.ref(bindingPath).once('value');
    expect(snapshot.val()).toMatchObject({ activityKey: 'activity-absent', candidateId: 'candidate-2', candidateRevision: 3 });
  });

  it('permits exact result group-summary child reads in both scopes while denying broader or browser access', async () => {
    const groupKey = 'g-result-activity';
    const studentParentPath = 'book_result_read_models/students/student-1/books/book-1/group_summaries';
    const studentChildPath = `${studentParentPath}/${groupKey}`;
    const homeworkParentPath = 'book_result_read_models/homework/homework-1/students/student-1/books/book-1/group_summaries';
    const homeworkChildPath = `${homeworkParentPath}/${groupKey}`;
    const summary = {
      schemaVersion: 1, groupKey, studentId: 'student-1', recipientId: 'student-1',
      activityId: 'activity-1', bookId: 'book-1', attemptCount: 1,
      latestAttemptId: 'attempt-1', latestResultId: 'result-1', latestAttemptNumber: 1,
      latestSubmittedAt: '2026-08-13T00:00:00.000Z', latestCreatedAt: '2026-08-13T00:00:00.000Z',
      latestEvaluationStatus: 'submitted', latestFeedbackRelease: 'pending', contexts: [],
    };
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().update({
        [studentChildPath]: summary,
        [homeworkChildPath]: { ...summary, homeworkId: 'homework-1' },
      });
    });

    const exactStudent = testEnv.authenticatedContext('result-reader-student', resultReadClaims()).database();
    const exactHomework = testEnv.authenticatedContext('result-reader-homework', resultReadClaims({
      book_result_read_homeworkId: 'homework-1',
    })).database();
    const browser = testEnv.authenticatedContext('student-1').database();
    const unauthenticated = testEnv.unauthenticatedContext().database();

    await assertSucceeds(exactStudent.ref(studentChildPath).once('value'));
    await assertSucceeds(exactHomework.ref(homeworkChildPath).once('value'));
    await assertFails(testEnv.authenticatedContext('wrong-result-group', resultReadClaims({
      book_result_read_groupKey: 'g-other-activity',
    })).database().ref(studentChildPath).once('value'));
    await assertFails(testEnv.authenticatedContext('wrong-result-book', resultReadClaims({
      book_result_read_bookId: 'book-2',
    })).database().ref(studentChildPath).once('value'));
    await assertFails(testEnv.authenticatedContext('wrong-result-homework', resultReadClaims({
      book_result_read_homeworkId: 'homework-2',
    })).database().ref(homeworkChildPath).once('value'));

    await assertFails(exactStudent.ref(studentParentPath).once('value'));
    await assertSucceeds(exactStudent.ref(studentParentPath).orderByChild('latestSubmittedAt').limitToLast(1).once('value'));
    await assertFails(exactHomework.ref(homeworkParentPath).once('value'));
    await assertSucceeds(exactHomework.ref(homeworkParentPath).orderByChild('latestSubmittedAt').limitToLast(1).once('value'));
    await assertFails(browser.ref(studentChildPath).once('value'));
    await assertFails(browser.ref(studentParentPath).orderByChild('latestSubmittedAt').limitToLast(1).once('value'));
    await assertFails(unauthenticated.ref(studentChildPath).once('value'));
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

  it('limits Assembly draft Unit discovery to one owned Book and denies parent writes', async () => {
    const parent = 'book_assembly/books/book-1/units';
    const scope = `${parent}/unit-1`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('material_catalog/books/book-1').set(materialBook());
      await context.database().ref(scope).set(assemblyAggregate());
    });
    const exact = testEnv.authenticatedContext('assembly-discovery', {
      book_assembly_draft_discovery_service: true,
      book_assembly_draft_discovery_bookId: 'book-1',
      book_assembly_draft_discovery_ownerId: 'teacher-1',
    }).database();
    const wrongOwner = testEnv.authenticatedContext('assembly-discovery-wrong-owner', {
      book_assembly_draft_discovery_service: true,
      book_assembly_draft_discovery_bookId: 'book-1',
      book_assembly_draft_discovery_ownerId: 'teacher-2',
    }).database();
    const wrongBook = testEnv.authenticatedContext('assembly-discovery-wrong-book', {
      book_assembly_draft_discovery_service: true,
      book_assembly_draft_discovery_bookId: 'book-2',
      book_assembly_draft_discovery_ownerId: 'teacher-1',
    }).database();
    const browser = testEnv.authenticatedContext('teacher-1').database();
    await assertSucceeds(exact.ref(parent).once('value'));
    const shallow = async (uid: string, claims: Record<string, unknown>) => {
      const url = new URL(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/${parent}.json`);
      url.searchParams.set('ns', EMULATOR_PROJECT);
      url.searchParams.set('shallow', 'true');
      url.searchParams.set('auth', emulatorIdToken(uid, claims));
      const response = await fetch(url);
      return { status: response.status, body: await response.json() as unknown };
    };
    const discoveryClaims = {
      book_assembly_draft_discovery_service: true,
      book_assembly_draft_discovery_bookId: 'book-1',
      book_assembly_draft_discovery_ownerId: 'teacher-1',
    };
    expect(await shallow('assembly-discovery', discoveryClaims)).toEqual({ status: 200, body: { 'unit-1': true } });
    expect((await shallow('assembly-discovery-wrong-owner', { ...discoveryClaims,
      book_assembly_draft_discovery_ownerId: 'teacher-2' })).status).not.toBe(200);
    expect((await shallow('teacher-1', {})).status).not.toBe(200);
    await assertFails(exact.ref(parent).set({ 'unit-2': assemblyAggregate() }));
    await assertFails(exact.ref(scope).set(assemblyAggregate()));
    await assertFails(wrongOwner.ref(parent).once('value'));
    await assertFails(wrongBook.ref(parent).once('value'));
    await assertFails(browser.ref(parent).once('value'));
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
