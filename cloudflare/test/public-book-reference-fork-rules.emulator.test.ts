import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import fragment16A from '../src/upload-worker/book-rules/fragments/16A.json';
import fragment20A from '../src/upload-worker/book-rules/fragments/20A.json';
import fragment44 from '../src/upload-worker/book-rules/fragments/44.json';

type RuleOperation = {
  readonly path: string;
  readonly rule: string;
  readonly expression: string | boolean;
  readonly merge?: string;
};

const PROJECT_ID = 'demo-prd-0062-canonical-fork-rules';
const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;
const NOW = '2026-08-09T00:00:00.000Z';
const BOOK_REVISION = '2026-08-09T00:00:30.000Z';
const NEXT = '2026-08-09T00:01:00.000Z';
const CAPABILITY_ISSUED_AT_MS = Date.now();

// #44 owns the fork-specific Book replacement. #20A is applied after it so
// its conjoin-existing-authorization merge preserves the ordinary grant for
// non-fork tokens while the pbcf exclusion remains in that ordinary branch.
const fragments = [fragment16A, fragment44, fragment20A];

const mergeRule = (
  existing: string | boolean | undefined,
  operation: RuleOperation,
): string | boolean => {
  if (existing === undefined) return operation.expression;
  if (operation.merge?.startsWith('conjoin-existing-authorization')) {
    return `(${String(existing)}) || (${String(operation.expression)})`;
  }
  if (operation.merge?.startsWith('conjoin-existing-validation')) {
    return `(${String(existing)}) && (${String(operation.expression)})`;
  }
  return operation.expression;
};

const rulesFromFragments = (): string => {
  const root: Record<string, any> = { rules: {} };
  for (const fragment of fragments) {
    for (const operation of fragment.operations as RuleOperation[]) {
      const segments = operation.path.split('/');
      const ruleKey = segments.pop()!;
      let cursor = root.rules;
      for (const segment of segments) cursor = cursor[segment] ??= {};
      cursor[ruleKey] = {
        ...(cursor[ruleKey] ?? {}),
        [operation.rule]: mergeRule(cursor[ruleKey]?.[operation.rule], operation),
      };
    }
  }
  return JSON.stringify(root);
};

const book = () => ({
  bookId: 'target-book',
  bookMode: 'materials',
  ownerId: 'teacher-target',
  title: 'Target Book',
  authors: ['Teacher'],
  primaryTestTypeId: 'ielts',
  testTypeIds: ['ielts'],
  tags: ['reading'],
  visibility: 'private',
  status: 'draft-empty',
  createdAt: NOW,
  updatedAt: BOOK_REVISION,
  createdBy: 'teacher-target',
  updatedBy: 'teacher-target',
});

const ref = (refId = 'existing-ref') => ({
  refId,
  materialId: 'existing-activity',
  materialKind: 'interactive-activity',
  snapshotVersionId: 'existing-version',
  titleSnapshot: 'Existing activity',
  testTypeIdsSnapshot: ['ielts'],
  visibilitySnapshot: 'private',
  availability: 'available',
  updateState: 'current',
  ownerIdSnapshot: 'teacher-target',
  order: 1,
  addedAt: NOW,
  addedBy: 'teacher-target',
});

const node = (
  materialRefs: readonly Record<string, unknown>[] = [],
  updatedAt = NOW,
) => ({
  bookId: 'target-book',
  nodeId: 'target-node',
  parentNodeId: null,
  type: 'section',
  title: 'Section 1',
  order: 0,
  materialRefs,
  createdAt: NOW,
  updatedAt,
});

const summary = (updatedAt = BOOK_REVISION) => ({
  schemaVersion: 1,
  materialId: 'target-book',
  producerId: 'material-book',
  materialKind: 'book',
  surfaceFamily: 'book',
  ownerId: 'teacher-target',
  title: 'Target Book',
  visibility: 'private',
  lifecycleState: 'active',
  testTypeIds: ['ielts'],
  tags: ['reading'],
  updatedAt,
});

const bookIndexRow = (overrides: Record<string, unknown> = {}) => ({
  bookId: 'target-book',
  bookMode: 'materials',
  ownerId: 'teacher-target',
  title: 'Target Book',
  visibility: 'private',
  status: 'draft-empty',
  testTypeIds: ['ielts'],
  testTypeMembership: { ielts: true },
  tags: ['reading'],
  updatedAt: BOOK_REVISION,
  ...overrides,
});

const claims = {
  iat: Math.floor(CAPABILITY_ISSUED_AT_MS / 1000),
  pbcf: {
    s: true,
    a: 'teacher-target',
    o: '00000000-0000-4000-8000-000000000106',
    sv: 'source-pdf-1',
    sa: 'source-activity',
    svi: 'source-version-1',
    spi: 'source-placement',
    sps: 'fnv1a64:0123456789abcdef',
    sn: 'unit-1',
    sel: 0,
    tb: 'target-book',
    tn: 'target-node',
    tp: 'placement-target',
    ia: 'fork-activity',
    iv: 'fork-version',
    eu: BOOK_REVISION,
    fp: 'sha256:plan',
    ct: NEXT,
    ao: 2,
    ri: 1,
    bs: 'draft-in-progress',
    dl: CAPABILITY_ISSUED_AT_MS + 300_000,
    cx: null,
    if: 'sha256:intent',
    df: 'fnv1a64:fedcba9876543210',
    cf: 'sha256:canonical',
    sf: 'sha256:safe',
  },
};

const appendedRef = (
  placementId = 'placement-target',
  testTypeIdsSnapshot: readonly string[] = [],
) => ({
  refId: placementId,
  materialId: 'fork-activity',
  materialKind: 'interactive-activity',
  snapshotVersionId: 'fork-version',
  titleSnapshot: 'Forked activity',
  testTypeIdsSnapshot,
  visibilitySnapshot: 'private',
  availability: 'available',
  updateState: 'current',
  ownerIdSnapshot: 'teacher-target',
  order: 2,
  addedAt: NEXT,
  addedBy: 'teacher-target',
});

const sourceCanonical = () => ({
  schemaVersion: 1,
  lifecycle: 'published',
  activityId: 'source-activity',
  activityVersionId: 'source-version-1',
  activityVersion: 1,
  ownerId: 'source-owner',
  activity: { title: 'Forked activity', answerKey: { correct: 'A' } },
  projection: { prompt: 'Student-safe projection' },
  payloadFingerprint: 'fnv1a64:0123456789abcdef',
  placementIds: ['source-placement'],
  evidenceRefs: ['source'],
  sourceContextFingerprint: null,
  createdByOperationId: 'source-operation',
  publishedAt: NOW,
  provenance: {
    kind: 'initial-book-publication',
    bookId: 'source-book',
    manifestVersionId: 'manifest-source',
    publicationId: 'publication-source',
    publicationRevision: 2,
    unitKey: 'unit-1',
    activityKey: 'activity-1',
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-pdf-1', physicalPageNumber: 4 }],
  },
});

const sourceSafeProjection = () => {
  const canonical = sourceCanonical();
  return {
    schemaVersion: 1,
    projectionKind: 'student-safe',
    activityId: canonical.activityId,
    activityVersionId: canonical.activityVersionId,
    ownerId: canonical.ownerId,
    content: canonical.projection,
    payloadFingerprint: canonical.payloadFingerprint,
    createdByOperationId: canonical.createdByOperationId,
    publishedAt: canonical.publishedAt,
  };
};

const forkCanonical = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  lifecycle: 'published',
  activityId: 'fork-activity',
  activityVersionId: 'fork-version',
  activityVersion: 1,
  ownerId: 'teacher-target',
  activity: sourceCanonical().activity,
  projection: sourceCanonical().projection,
  payloadFingerprint: claims.pbcf.df,
  placementIds: ['placement-target'],
  evidenceRefs: ['public-book-fork'],
  sourceContextFingerprint: claims.pbcf.cx,
  createdByOperationId: claims.pbcf.o,
  publishedAt: claims.pbcf.ct,
  provenance: {
    kind: 'public-book-fork',
    sourceBookId: 'source-book',
    sourceOwnerId: 'source-owner',
    sourceManifestVersionId: 'manifest-source',
    sourcePublicationId: 'publication-source',
    sourcePublicationRevision: 2,
    sourceVersionId: 'source-pdf-1',
    sourcePublicationBinding: {
      manifestVersionId: 'manifest-source',
      publicationId: 'publication-source',
      publicationRevision: 2,
    },
    sourceActivityId: 'source-activity',
    sourceActivityVersionId: 'source-version-1',
    sourceActivityVersion: 1,
    sourcePayloadFingerprint: 'fnv1a64:0123456789abcdef',
    sourcePlacementIds: ['source-placement'],
    sourcePlacementSetFingerprint: claims.pbcf.sps,
    sourceNodeKey: 'unit-1',
    sourcePlacementId: 'source-placement',
    sourceUnitKey: 'unit-1',
    sourceActivityKey: 'activity-1',
    selectionKind: 'activity',
    selectionPath: ['unit-1'],
    selectionOrder: 0,
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-pdf-1', physicalPageNumber: 4 }],
    sourcePageGroupKeys: ['group-1'],
    sourceContextFingerprint: claims.pbcf.cx,
    targetBookId: 'target-book',
    targetOwnerId: 'teacher-target',
    targetOriginalNodeId: 'target-node',
    targetPlacementId: 'placement-target',
    targetAppendOrder: 2,
    targetBookUpdatedAt: claims.pbcf.eu,
  },
  ...overrides,
});

const forkSafeProjection = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  projectionKind: 'student-safe',
  activityId: 'fork-activity',
  activityVersionId: 'fork-version',
  ownerId: 'teacher-target',
  content: sourceCanonical().projection,
  payloadFingerprint: claims.pbcf.df,
  createdByOperationId: claims.pbcf.o,
  publishedAt: claims.pbcf.ct,
  ...overrides,
});

const forkReceipt = () => ({
  schemaVersion: 1,
  recordKind: 'public-book-canonical-fork-operation',
  actorId: claims.pbcf.a,
  operationId: claims.pbcf.o,
  status: 'committed',
  intentFingerprint: claims.pbcf.if,
  planFingerprint: claims.pbcf.fp,
  activityId: claims.pbcf.ia,
  activityVersionId: claims.pbcf.iv,
  canonicalFingerprint: claims.pbcf.cf,
  safeProjectionFingerprint: claims.pbcf.sf,
  target: {
    bookId: 'target-book',
    originalNodeId: 'target-node',
    placementId: 'placement-target',
    appendOrder: 2,
    expectedUpdatedAt: BOOK_REVISION,
  },
  source: {
    bookId: 'source-book',
    ownerId: 'source-owner',
    manifestVersionId: 'manifest-source',
    publicationId: 'publication-source',
    publicationRevision: 2,
    sourceVersionId: 'source-pdf-1',
    activityId: 'source-activity',
    activityVersionId: 'source-version-1',
    activityVersion: 1,
    payloadFingerprint: 'fnv1a64:0123456789abcdef',
    placementIds: ['source-placement'],
    placementSetFingerprint: claims.pbcf.sps,
    nodeKey: 'unit-1',
    placementId: 'source-placement',
    unitKey: 'unit-1',
    activityKey: 'activity-1',
    selectionPath: ['unit-1'],
    selectionOrder: 0,
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-pdf-1', physicalPageNumber: 4 }],
    pageGroupKeys: ['group-1'],
    contextFingerprint: claims.pbcf.cx,
  },
  createdAt: NEXT,
});

let testEnv: RulesTestEnvironment;

const seed = async (materialRefs: readonly Record<string, unknown>[] = []): Promise<void> => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await db.ref('material_catalog/books/target-book').set(book());
    await db.ref('material_catalog/book_nodes/target-book/target-node').set(node(materialRefs));
    await db.ref('book_activity/versions/source-activity/source-version-1').set(sourceCanonical());
    await db.ref('book_activity/student_safe_projections/source-activity/source-version-1')
      .set(sourceSafeProjection());
    const row = bookIndexRow();
    await db.ref('material_catalog/book_indexes/by_owner/teacher-target/target-book').set(row);
    await db.ref('material_catalog/book_indexes/by_visibility/private/target-book').set(row);
    await db.ref('material_catalog/book_indexes/by_test_type/ielts/target-book').set(row);
    await db.ref('material_catalog/material_summary_indexes/v1/by_id/target-book').set(summary());
    await db.ref('material_catalog/material_summary_indexes/v1/by_owner/teacher-target/target-book').set(summary());
    await db.ref('material_catalog/material_summary_indexes/v1/by_visibility/private/target-book').set(summary());
    await db.ref('material_catalog/material_summary_indexes/v1/by_material_kind/book/target-book').set(summary());
    await db.ref('material_catalog/material_summary_indexes/v1/by_test_type/ielts/target-book').set(summary());
  });
};

describeEmulator('canonical fork inactive-fragment RTDB negatives', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      database: { rules: rulesFromFragments() },
    });
    await testEnv.clearDatabase();
    await seed();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('allows only the claimed target append and Book summary shape', async () => {
    await seed([ref()]);
    const service = testEnv.authenticatedContext('fork-service', claims);
    await assertSucceeds(service.database()
      .ref('material_catalog/book_nodes/target-book/target-node')
      .set(node([ref(), appendedRef('placement-target', ['ielts'])], NEXT)));
    await assertSucceeds(service.database()
      .ref('material_catalog/material_summary_indexes/v1/by_id/target-book')
      .set(summary(NEXT)));
  });

  it('allows the complete production-shaped root multi-location fork PATCH', async () => {
    await seed([ref()]);
    const service = testEnv.authenticatedContext('fork-service', claims);
    const updatedBook = {
      ...book(),
      status: 'draft-in-progress',
      updatedAt: NEXT,
      updatedBy: 'teacher-target',
    };
    const updatedIndex = (overrides: Record<string, unknown> = {}) => bookIndexRow({
      status: 'draft-in-progress',
      updatedAt: NEXT,
      ...overrides,
    });
    const patch: Record<string, unknown> = {
      'book_activity/versions/fork-activity/fork-version': forkCanonical(),
      'book_activity/student_safe_projections/fork-activity/fork-version': forkSafeProjection(),
      'book_activity/canonical_fork_operations/teacher-target/00000000-0000-4000-8000-000000000106': forkReceipt(),
      'material_catalog/books/target-book': updatedBook,
      'material_catalog/book_nodes/target-book/target-node': node([ref(), appendedRef()], NEXT),
      'material_catalog/book_indexes/by_owner/teacher-target/target-book': updatedIndex(),
      'material_catalog/book_indexes/by_visibility/private/target-book': updatedIndex(),
      'material_catalog/book_indexes/by_test_type/ielts/target-book': updatedIndex(),
      'material_catalog/material_summary_indexes/v1/by_id/target-book': summary(NEXT),
      'material_catalog/material_summary_indexes/v1/by_owner/teacher-target/target-book': summary(NEXT),
      'material_catalog/material_summary_indexes/v1/by_visibility/private/target-book': summary(NEXT),
      'material_catalog/material_summary_indexes/v1/by_material_kind/book/target-book': summary(NEXT),
      'material_catalog/material_summary_indexes/v1/by_test_type/ielts/target-book': summary(NEXT),
    };

    expect(Object.keys(patch)).toHaveLength(13);
    await assertSucceeds(service.database().ref().update(patch));
  });

  it('allows source-derived canonical and student-safe products', async () => {
    const service = testEnv.authenticatedContext('fork-service', claims);
    await assertSucceeds(service.database()
      .ref('book_activity/versions/fork-activity/fork-version')
      .set(forkCanonical()));
    await assertSucceeds(service.database()
      .ref('book_activity/student_safe_projections/fork-activity/fork-version')
      .set(forkSafeProjection()));
  });

  it('denies canonical source/activity/provenance and unsafe student-safe content', async () => {
    const service = testEnv.authenticatedContext('fork-service', claims);
    const canonical = forkCanonical();
    await assertFails(service.database()
      .ref('book_activity/versions/fork-activity/fork-version')
      .set({ ...canonical, activity: { tampered: true } }));
    await assertFails(service.database()
      .ref('book_activity/versions/fork-activity/fork-version')
      .set({ ...canonical, projection: { tampered: true } }));
    await assertFails(service.database()
      .ref('book_activity/versions/fork-activity/fork-version')
      .set({
        ...canonical,
        provenance: { ...canonical.provenance, sourceBookId: 'wrong-book' },
      }));

    await assertFails(service.database()
      .ref('book_activity/student_safe_projections/fork-activity/fork-version')
      .set(forkSafeProjection({ content: { tampered: true } })));
    await assertFails(service.database()
      .ref('book_activity/student_safe_projections/fork-activity/fork-version')
      .set(forkSafeProjection({
        content: { prompt: 'Student-safe prompt', answer: 'private answer' },
      })));
    await assertFails(service.database()
      .ref('book_activity/student_safe_projections/fork-activity/fork-version')
      .set(forkSafeProjection({
        content: { prompt: 'Student-safe prompt', providerAuthority: 'private authority' },
      })));
    await assertFails(service.database()
      .ref('book_activity/student_safe_projections/fork-activity/fork-version')
      .set(forkSafeProjection({ publishedAt: NOW })));
  });

  it('server-held capability trust-boundary characterization: permits nested answer-key composite alteration', async () => {
    const service = testEnv.authenticatedContext('fork-service', claims);
    await assertSucceeds(service.database()
      .ref('book_activity/versions/fork-activity/fork-version')
      .set(forkCanonical({
        activity: {
          title: 'Forked activity',
          answerKey: { correct: { answer: 'B', hiddenInteractionIds: ['forged-interaction'] } },
        },
      })));
  });

  it('server-held capability trust-boundary characterization: permits nested student-safe composite alteration', async () => {
    const service = testEnv.authenticatedContext('fork-service', claims);
    await assertSucceeds(service.database()
      .ref('book_activity/student_safe_projections/fork-activity/fork-version')
      .set(forkSafeProjection({
        content: { prompt: { text: 'forged student-safe content', visible: false } },
      })));
  });

  it('server-held capability trust-boundary characterization: permits provenance composite alteration', async () => {
    const service = testEnv.authenticatedContext('fork-service', claims);
    const canonical = forkCanonical();
    await assertSucceeds(service.database()
      .ref('book_activity/versions/fork-activity/fork-version')
      .set({
        ...canonical,
        provenance: {
          ...canonical.provenance,
          sourcePlacementIds: ['source-placement', 'forged-placement'],
          selectionPath: ['unit-1', 'forged-unit'],
          sourcePages: [
            { sourceKey: 'full', sourceVersionId: 'source-pdf-1', physicalPageNumber: 4 },
            { sourceKey: 'forged', sourceVersionId: 'forged-pdf', physicalPageNumber: 99 },
          ],
          sourcePageGroupKeys: ['group-1', 'forged-group'],
        },
      }));
  });

  it('server-held capability trust-boundary characterization: permits Book composite metadata alteration', async () => {
    const service = testEnv.authenticatedContext('fork-service', claims);
    await assertSucceeds(service.database()
      .ref('material_catalog/books/target-book')
      .set({
        ...book(),
        authors: ['forged-author'],
        testTypeIds: ['ielts', 'forged-test-type'],
        tags: ['reading', 'forged-tag'],
        status: 'draft-in-progress',
        updatedAt: NEXT,
        updatedBy: 'teacher-target',
      }));
  });

  it('server-held capability trust-boundary characterization: permits existing-ref snapshot composite alteration', async () => {
    await seed([ref()]);
    const service = testEnv.authenticatedContext('fork-service', claims);
    await assertSucceeds(service.database()
      .ref('material_catalog/book_nodes/target-book/target-node')
      .set(node([
        { ...ref(), testTypeIdsSnapshot: ['ielts', 'forged-test-type'] },
        appendedRef(),
      ], NEXT)));
  });

  it('server-held capability trust-boundary characterization: permits Book-index composite alteration', async () => {
    const service = testEnv.authenticatedContext('fork-service', claims);
    await assertSucceeds(service.database()
      .ref('material_catalog/book_indexes/by_owner/teacher-target/target-book')
      .set(bookIndexRow({
        status: 'draft-in-progress',
        updatedAt: NEXT,
        testTypeIds: ['ielts', 'forged-test-type'],
        testTypeMembership: { ielts: true, 'forged-test-type': true },
        tags: ['reading', 'forged-tag'],
      })));
  });

  it('server-held capability trust-boundary characterization: permits summary composite alteration', async () => {
    const service = testEnv.authenticatedContext('fork-service', claims);
    await assertSucceeds(service.database()
      .ref('material_catalog/material_summary_indexes/v1/by_id/target-book')
      .set({
        ...summary(NEXT),
        testTypeIds: ['ielts', 'forged-test-type'],
        tags: ['reading', 'forged-tag'],
      }));
  });

  it('denies an expired server-held capability deadline', async () => {
    const expired = testEnv.authenticatedContext('fork-service', {
      ...claims,
      pbcf: { ...claims.pbcf, dl: Date.now() - 1 },
    });
    const nextBook = {
      ...book(),
      status: 'draft-in-progress',
      updatedAt: NEXT,
      updatedBy: 'teacher-target',
    };

    await assertFails(expired.database().ref('material_catalog/books/target-book').set(nextBook));
  });

  it('denies sibling writes, whole-node replacement, existing-ref retarget, delete, and claim mismatch', async () => {
    const service = testEnv.authenticatedContext('fork-service', claims);
    await assertFails(service.database()
      .ref('material_catalog/books/target-book')
      .set({ ...book(), status: 'ready', updatedAt: NEXT, updatedBy: 'teacher-target' }));
    await assertFails(service.database()
      .ref('material_catalog/books/target-book')
      .set({ ...book(), updatedAt: NEXT, updatedBy: 'teacher-target' }));
    await assertFails(service.database()
      .ref('material_catalog/book_nodes/target-book/sibling-node')
      .set({ ...node(), nodeId: 'sibling-node' }));
    await assertFails(service.database()
      .ref('material_catalog/book_nodes/target-book/target-node')
      .set({ ...node([appendedRef()]), title: 'retargeted whole node', updatedAt: NEXT }));
    await seed([ref()]);
    const wrongRefIndex = testEnv.authenticatedContext('fork-service', {
      ...claims,
      pbcf: { ...claims.pbcf, ri: 0 },
    });
    await assertFails(wrongRefIndex.database()
      .ref('material_catalog/book_nodes/target-book/target-node')
      .set(node([ref(), appendedRef()], NEXT)));
    await assertFails(service.database()
      .ref('material_catalog/book_nodes/target-book/target-node')
      .set(node([{ ...ref(), titleSnapshot: 'changed existing ref' }, appendedRef()], NEXT)));
    await assertFails(service.database()
      .ref('material_catalog/book_nodes/target-book/target-node')
      .set(node([ref(), { ...appendedRef(), addedBy: 'other-owner' }], NEXT)));
    await assertFails(service.database()
      .ref('material_catalog/book_nodes/target-book/target-node')
      .remove());
    await assertFails(service.database()
      .ref('material_catalog/book_nodes/target-book/target-node')
      .set(node([appendedRef('wrong-placement')], NEXT)));
    await assertFails(service.database()
      .ref('material_catalog/book_indexes/by_test_type/toefl/target-book')
      .set({
        bookId: 'target-book',
        ownerId: 'teacher-target',
        testTypeMembership: { toefl: true },
        updatedAt: NEXT,
      }));
    await assertFails(service.database()
      .ref('material_catalog/book_indexes/by_owner/teacher-target/target-book')
      .remove());
    await assertFails(service.database()
      .ref('material_catalog/book_indexes/by_owner/teacher-target/target-book')
      .set(bookIndexRow({ ownerId: 'other-owner', updatedAt: NEXT })));
    await assertFails(service.database()
      .ref('material_catalog/material_summary_indexes/v1/by_id/target-book')
      .remove());
    await assertFails(service.database()
      .ref('material_catalog/material_summary_indexes/v1/by_id/target-book')
      .set({ ...summary(NEXT), title: 'tampered summary' }));
    await assertFails(service.database()
      .ref('book_activity/canonical_fork_operations/teacher-target/00000000-0000-4000-8000-000000000106')
      .set({ schemaVersion: 1 }));
  });

  it('denies ancestor-shaped writes and arbitrary Book metadata changes', async () => {
    const service = testEnv.authenticatedContext('fork-service', claims);
    await assertFails(service.database().ref('material_catalog/books').set({ 'target-book': book() }));
    await assertFails(service.database().ref('material_catalog/book_nodes/target-book').set({ 'target-node': node() }));
    await assertFails(service.database()
      .ref('material_catalog/books/target-book')
      .set({ ...book(), title: 'changed title', updatedAt: NEXT, updatedBy: 'teacher-target' }));
  });
});
