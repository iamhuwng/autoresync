import { FirebaseRestExactPublishedActivityVersionReader } from '../src/upload-worker/book-assembly/canonical-activity-version-repository.ts';
import { FirebaseRestBookAssemblyPublicationRepository } from '../src/upload-worker/book-assembly/publication-repository.ts';
import { exportPKCS8, generateKeyPair } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createProductionBookSubmissionPublicationFinalizer,
  createProductionBookSubmissionCommitAdapter,
} from '../src/upload-worker/book-submission/production.ts';
import { computeBookSubmissionFingerprint, normalizeBookSubmissionMetadata } from '../../src/services/materialCatalog/bookSubmissionInput.service.ts';
import { validateEditableActivity } from '../../src/services/book-activity/activitySchema.service.ts';
import { activeComponentPdfActivation, fingerprintComponentPdfActivationValue, resolveMaterialQualifiedAssemblyCandidate } from '../../src/services/book-assembly/componentPdfActivation.service.ts';

import { fingerprint, operationId, ownerId, bookId, now, sourceReceipt, editableActivity, activity, manifest, verifiedSource, operation, env, request, componentArtifact } from './fixtures/book-submission-publication.ts';

const capturePatch = async (records: Record<string, unknown> = {}) => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  const serviceAccount = JSON.stringify({ client_email: env.BOOK_SUBMISSION_SERVICE_IDENTITY, private_key: await exportPKCS8(privateKey) });
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('identitytoolkit.googleapis.com')) {
      return new Response(JSON.stringify({ idToken: 'test-id-token', expiresIn: '3600' }), { status: 200 });
    }
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'test-access-token', expires_in: 3600 });
    if ((init?.method ?? 'GET') === 'GET') return Response.json(records[new URL(url).pathname] ?? null);
    return new Response('', { status: 200 });
  });
  return { calls, serviceAccount };
};

afterEach(() => vi.unstubAllGlobals());

describe('production Book submission publication finalizer', () => {
  it.each(['registry', 'source decision', 'foreign source', 'missing activity', 'extra activity', 'expired lease'] as const)(
    'rejects invalid %s during shared server qualification before any external call', async (kind) => {
      const sources = [verifiedSource(sourceReceipt('full', 'full-v1'))];
      const activitiesByKey = { 'unit-1:activity-1': activity } as Record<string, typeof activity>;
      const currentOperation = { ...operation };
      const configuration = { ...env };
      if (kind === 'registry') configuration.BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION = '';
      if (kind === 'source decision') sources[0].studentSafeDecision.sha256Hex = 'b'.repeat(64);
      if (kind === 'foreign source') sources[0].bookId = 'book-foreign';
      if (kind === 'missing activity') delete activitiesByKey['unit-1:activity-1'];
      if (kind === 'extra activity') activitiesByKey['unit-1:unplanned'] = activity;
      if (kind === 'expired lease') currentOperation.commitLeaseExpiresAt = Date.now() - 1;
      const external = vi.fn(); vi.stubGlobal('fetch', external);
      await expect(createProductionBookSubmissionPublicationFinalizer().commit({
        operation: currentOperation, uid: ownerId, operationId, finalBookId: bookId, fingerprint,
        metadata: { title: 'Book', testTypeIds: ['reading'] }, prepared: { strategy: 'full_pdf', manifest: manifest('full_pdf'), activitiesByKey },
        sources, env: configuration, request,
      })).rejects.toMatchObject({ code: 'book_submission_preview_invalid' });
      expect(external).not.toHaveBeenCalled();
    },
  );

  it('rejects a changed prepared component page map before publication', async () => {
    const artifact = componentArtifact();
    artifact.composition.mapping[0].endPage = 2;
    const external = vi.fn(); vi.stubGlobal('fetch', external);
    await expect(createProductionBookSubmissionPublicationFinalizer().commit({
      operation, uid: ownerId, operationId, finalBookId: bookId, fingerprint, metadata: { title: 'Book', testTypeIds: ['reading'] },
      prepared: { strategy: 'component_pdfs', manifest: manifest('component_pdfs'), activitiesByKey: { 'unit-1:activity-1': activity } },
      sources: [verifiedSource(sourceReceipt('part-a', 'part-a-v1')), verifiedSource(sourceReceipt('part-b', 'part-b-v1'))],
      studentDocumentSource: verifiedSource({ ...artifact.studentDocument, sourceKey: 'student-document', purpose: 'student-document' }, 'student-document'),
      env, request, componentArtifact: artifact,
    })).rejects.toMatchObject({ code: 'book_submission_preview_invalid' });
    expect(external).not.toHaveBeenCalled();
  });

  it.each(['full_pdf', 'component_pdfs'] as const)('qualifies %s through the production reader and rejects changed server source authority', async (strategy) => {
    const candidate = manifest(strategy);
    if (strategy === 'component_pdfs') candidate.units[0].pageGroups.push({
      pageGroupKey: 'reference-b', sourceKey: 'part-b', pages: [1], activityKeys: [], mode: 'reference_only',
    });
    const sourceReceipts = candidate.sourceSet.sources.map((source) => sourceReceipt(source.sourceKey, source.sourceVersionId));
    const { bookId: _bookId, sourceSet: _sourceSet, ...structure } = candidate;
    const metadata = normalizeBookSubmissionMetadata({ title: 'Production submission', testTypeIds: ['reading'] });
    const authoring = { strategy: strategy === 'full_pdf' ? 'full' : 'component',
      pdfs: sourceReceipts.map(({ sourceKey, sha256Hex, byteSize, physicalPageCount }) => ({ sourceKey, sha256Hex, byteSize, physicalPageCount, displayFilename: `${sourceKey}.pdf` })),
      structureJson: JSON.stringify(structure), unitsJson: JSON.stringify({ 'unit-1': { 'activity-1': editableActivity } }),
      pageMappingJson: JSON.stringify({ units: candidate.units }),
      pdfPageCounts: Object.fromEntries(sourceReceipts.map((receipt) => [receipt.sourceKey, receipt.physicalPageCount])),
    };
    const frozenFingerprint = await computeBookSubmissionFingerprint(metadata, authoring);
    const artifact = strategy === 'component_pdfs' ? { ...componentArtifact(), fingerprint: frozenFingerprint } : undefined;
    const all = [...sourceReceipts.map((receipt) => verifiedSource(receipt)), ...(artifact
      ? [verifiedSource({ ...artifact.studentDocument, sourceKey: 'student-document', purpose: 'student-document' }, 'student-document')] : [])];
    const account = { operations: Object.fromEntries(all.map((source) => [source.sourceVersionId, {
      ownerId, bookId, submissionOperationId: operationId, sourceKey: source.sourceKey, sourceVersionId: source.sourceVersionId,
      status: 'verified_completed', purpose: source.purpose, physicalPageCount: source.physicalPageCount,
      studentSafeStatus: source.studentSafeStatus, studentSafeDecision: source.studentSafeDecision, expectedChecksum: source.checksum,
      verifiedStorage: { bookId, sourceVersionId: source.sourceVersionId, checksum: source.checksum, byteSize: source.byteSize,
        storageLocationId: 'b2-primary', providerKind: 'backblaze-b2-s3', privateBucketId: 'bucket-1',
        providerObjectKey: `book-source/${bookId}/${source.sourceVersionId}`, providerFileId: 'file-1', providerFileVersionId: 'version-1' },
    }])), assemblyBooks: { [bookId]: Object.fromEntries(all.map(({ byteSize: _bytes, ...source }) => [source.sourceVersionId, { ...source, ownerId }])) } };
    const captured = await capturePatch({ '/book_source_upload_accounts/account-1.json': account });
    const publication = { commit: vi.fn(async (_input: unknown) => undefined) };
    const adapter = createProductionBookSubmissionCommitAdapter({ publication });
    const input = { operation: { ...operation, fingerprint: frozenFingerprint }, uid: ownerId,
      payload: { metadata, authoring, sourceReceipts }, request,
      env: { ...env, BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'account-1', BOOK_SUBMISSION_GOOGLE_SA_KEY: captured.serviceAccount },
      ...(artifact ? { preparedComponent: artifact } : {}),
    };
    await adapter(input);
    expect(publication.commit).toHaveBeenCalledOnce();
    expect(publication.commit.mock.calls[0][0]).toMatchObject({ sources: expect.arrayContaining([expect.objectContaining({ studentSafeDecision: expect.any(Object) })]) });
    const first = account.operations[all[0].sourceVersionId];
    for (const change of [
      { verifiedStorage: { ...first.verifiedStorage, sourceVersionId: 'wrong-source' } },
      { studentSafeStatus: 'rejected' }, { submissionOperationId: 'foreign-operation' },
    ]) {
      account.operations[all[0].sourceVersionId] = { ...first, ...change } as typeof first;
      await expect(adapter(input)).rejects.toMatchObject({ code: 'book_submission_source_receipt_invalid' });
      expect(publication.commit).toHaveBeenCalledOnce();
    }
    account.operations[all[0].sourceVersionId] = first;
    await expect(adapter({ ...input, payload: { ...input.payload, metadata: { ...metadata, title: 'Changed after freezing' } } }))
      .rejects.toMatchObject({ code: 'book_submission_fingerprint_mismatch' });
    expect(publication.commit).toHaveBeenCalledOnce();
    expect(captured.calls.some((call) => call.init?.method === 'PATCH')).toBe(false);
  });

  it.each([
    ['full_pdf', [sourceReceipt('full', 'full-v1')], undefined],
    ['component_pdfs', [sourceReceipt('part-a', 'part-a-v1'), sourceReceipt('part-b', 'part-b-v1')], componentArtifact()],
  ] as const)('publishes %s through one fenced patch', async (strategy, receipts, artifact) => {
    const candidate = manifest(strategy);
    if (strategy === 'component_pdfs') {
      candidate.units[0]!.activitySlots.push({ ...candidate.units[0]!.activitySlots[0]!, activityKey: 'Activity-1', order: 2 });
      candidate.units[0]!.pageGroups[0]!.activityKeys.push('Activity-1');
    }
    const captured = await capturePatch();
    const finalizer = createProductionBookSubmissionPublicationFinalizer();
    await finalizer.commit({
      operation, uid: ownerId, operationId, finalBookId: bookId, fingerprint,
      metadata: { title: 'Published book', authors: [], testTypeIds: ['reading'], tags: [] },
      prepared: { strategy, manifest: candidate, activitiesByKey: { 'unit-1:activity-1': activity, ...(strategy === 'component_pdfs' ? { 'unit-1:Activity-1': activity } : {}) } },
      sources: receipts.map((receipt) => verifiedSource(receipt)),
      ...(artifact ? { studentDocumentSource: verifiedSource({ ...artifact.studentDocument, sourceKey: 'student-document', purpose: 'student-document' }, 'student-document') } : {}),
      env: { ...env, BOOK_SUBMISSION_GOOGLE_SA_KEY: captured.serviceAccount }, request,
      ...(artifact ? { componentArtifact: artifact } : {}),
    });

    const patch = captured.calls.find((call) => call.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    const writes = JSON.parse(String(patch!.init?.body)) as Record<string, any>;
    const publicationRoot = `book_assembly_publications/books/${bookId}/`;
    const scope: Record<string, any> = {};
    for (const [path, value] of Object.entries(writes)) {
      if (!path.startsWith(publicationRoot)) continue;
      const [family, key] = path.slice(publicationRoot.length).split('/');
      if (key === undefined) scope[family!] = value;
      else (scope[family!] ??= {})[key] = value;
    }
    const repository = new FirebaseRestBookAssemblyPublicationRepository({
      env: { FIREBASE_DB_URL: 'https://firebase.test', BOOK_ASSEMBLY_SERVICE_IDENTITY: 'assembly@example.test' },
      fetchImpl: async () => Response.json(scope, { headers: { etag: '"scope"' } }),
      getAccessToken: async () => 'test-token',
    });
    const publication = await repository.readScope(bookId);
    if (artifact) {
      const committedDescriptor = { ...artifact.descriptor, descriptorRevision: 1 };
      expect(publication.versions![publication.current!.manifestVersionId]!.studentDocument).toEqual({
        sourceVersionId: committedDescriptor.sourceVersionId,
        descriptorRevision: committedDescriptor.descriptorRevision,
        sha256Hex: committedDescriptor.sha256Hex,
        descriptorFingerprint: fingerprintComponentPdfActivationValue(committedDescriptor),
      });
    }
    expect(publication.versions![publication.current!.manifestVersionId]!.manifest.nodes[0]!.title)
      .toBe('Vocabulary Unit');
    const canonicalPath = Object.keys(writes).find((path) => path.startsWith('book_activity/versions/'))!;
    const canonical = writes[canonicalPath];
    const safePath = `book_activity/student_safe_projections/${canonical.activityId}/${canonical.activityVersionId}`;
    expect(writes[safePath]).toMatchObject({
      projectionKind: 'student-safe', activityId: canonical.activityId,
      activityVersionId: canonical.activityVersionId, ownerId,
      content: canonical.projection, payloadFingerprint: canonical.payloadFingerprint,
      createdByOperationId: canonical.createdByOperationId, publishedAt: canonical.publishedAt,
    });
    const reader = new FirebaseRestExactPublishedActivityVersionReader({
      env: { FIREBASE_DB_URL: 'https://firebase.test', BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_SERVICE_IDENTITY: 'reader@example.test' },
      getAccessToken: async () => 'test-token',
      fetchImpl: async (url) => {
        const path = decodeURIComponent(new URL(String(url)).pathname.slice(1, -'.json'.length));
        return Response.json(writes[path] ?? null);
      },
    });
    expect(await reader.readExact({
      bookId, ownerId, manifestVersionId: publication.current!.manifestVersionId,
      publicationId: publication.current!.publicationId,
      activityId: canonical.activityId, activityVersionId: canonical.activityVersionId,
      activityVersion: canonical.activityVersion, payloadFingerprint: canonical.payloadFingerprint,
    })).toEqual(canonical);
    expect(writes[`material_catalog/books/${bookId}`]).toMatchObject({ bookId, ownerId, status: 'ready' });
    expect(writes[`material_catalog/book_nodes/${bookId}/unit-1`]).toMatchObject({ title: 'Vocabulary Unit' });
    expect(writes[`book_assembly/books/${bookId}/units/unit-1`]).toMatchObject({
      current: { candidateId: `submission-${bookId}`, candidateRevision: 1 },
      candidates: {
        [`submission-${bookId}`]: {
          manifest: {
            sourceSet: {
              sources: strategy === 'component_pdfs'
                ? [
                  { sourceKey: 'part-a', sourceVersionId: 'part-a-v1', ownerNodeKey: 'unit-1' },
                  { sourceKey: 'part-b', sourceVersionId: 'part-b-v1', ownerNodeKey: 'unit-1' },
                ]
                : [{ sourceKey: 'full', sourceVersionId: 'full-v1' }],
            },
          },
        },
      },
    });
    expect(writes[`book_assembly_publications/books/${bookId}/current`]).toMatchObject({ publicationRevision: 1, publicationId: expect.any(String), manifestVersionId: expect.any(String) });
    expect(writes[`book_submission_operations/${ownerId}/operations/${operationId}`]).toMatchObject({ state: 'committed', commitLeaseId: null });
    expect(writes[`book_submission_operations/${ownerId}`]).toBeUndefined();
    expect(writes[`book_submission_operations/${ownerId}/preparedComponents/${operationId}`]).toBeUndefined();
    const authoringPrefix = `book_activity_authoring/owners/${ownerId}/`;
    const seededActivities = Object.entries(writes).filter(([path]) => path.startsWith(`${authoringPrefix}activities/`));
    expect(seededActivities.length).toBeGreaterThan(0);
    for (const [path, value] of seededActivities) {
      const seeded = value as { activityId: string; editableDraft: unknown };
      expect(path).toBe(`${authoringPrefix}activities/${seeded.activityId}`);
      expect(validateEditableActivity(seeded.editableDraft).valid).toBe(true);
      const candidate = Object.entries(writes).find(([candidatePath, candidateValue]) =>
        candidatePath.startsWith(`${authoringPrefix}candidates/`)
        && (candidateValue as { targetActivityId?: string }).targetActivityId === seeded.activityId);
      expect(candidate).toBeDefined();
    }
    if (strategy === 'component_pdfs') {
      const committedBook = writes[`material_catalog/books/${bookId}`];
      expect(activeComponentPdfActivation(committedBook as never)).not.toBeNull();
      expect(committedBook.setupActivations[0].activities.map((item: { activityKey: string }) => item.activityKey)).toEqual(['Activity-1', 'activity-1']);
      const seededUnit = writes[`book_assembly/books/${bookId}/units/unit-1`] as { candidates: Record<string, unknown> };
      expect(resolveMaterialQualifiedAssemblyCandidate(committedBook as never, 'unit-1', seededUnit.candidates as never)).toMatchObject({ lifecycle: 'validated', revision: 1 });
      expect(writes[`material_catalog/books/${bookId}`]).toMatchObject({
        studentDocument: {
          descriptorRevision: 1,
          sourceVersionId: 'student-document-v1',
          compositionFingerprint: fingerprint,
          components: [
            { sourceKey: 'part-a', sourceVersionId: 'part-a-v1', combinedStartPage: 1, combinedEndPage: 1 },
            { sourceKey: 'part-b', sourceVersionId: 'part-b-v1', combinedStartPage: 2, combinedEndPage: 2 },
          ],
        },
      });
      expect(writes[`book_assembly_publications/books/${bookId}/student_documents/student-document-v1`]).toMatchObject({
        sourceVersionId: 'student-document-v1', descriptorCasOwner: 'assembly-publication',
        components: [
          { sourceKey: 'part-a', sourceVersionId: 'part-a-v1', combinedStartPage: 1, combinedEndPage: 1 },
          { sourceKey: 'part-b', sourceVersionId: 'part-b-v1', combinedStartPage: 2, combinedEndPage: 2 },
        ],
      });
    } else {
      expect(Object.keys(writes).some((path) => path.includes('/student_documents/'))).toBe(false);
    }
  });

  it.each([
    ['missing', undefined],
    ['malformed', { ...componentArtifact(), descriptor: { ...componentArtifact().descriptor, sha256Hex: 'b'.repeat(64) } }],
  ] as const)('rejects a %s component artifact before any write', async (_label, artifact) => {
    const captured = await capturePatch();
    const finalizer = createProductionBookSubmissionPublicationFinalizer();
    await expect(finalizer.commit({
      operation, uid: ownerId, operationId, finalBookId: bookId, fingerprint,
      metadata: { title: 'Published book', authors: [], testTypeIds: ['reading'], tags: [] },
      prepared: { strategy: 'component_pdfs', manifest: manifest('component_pdfs'), activitiesByKey: {} },
      sources: [verifiedSource(sourceReceipt('part-a', 'part-a-v1')), verifiedSource(sourceReceipt('part-b', 'part-b-v1'))],
      env: { ...env, BOOK_SUBMISSION_GOOGLE_SA_KEY: captured.serviceAccount }, request,
      ...(artifact ? { componentArtifact: artifact } : {}),
    })).rejects.toMatchObject({ code: 'book_submission_component_preparation_required' });
    expect(captured.calls).toHaveLength(0);
  });
});
