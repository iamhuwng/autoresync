import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportPKCS8, generateKeyPair } from 'jose';
import { createPublicBookReadinessProducer } from '../src/upload-worker/book-public/readiness-producer.ts';
import { createComponentStudentDocument } from '../../src/services/book-assembly/componentStudentDocument.types.ts';
import { createComponentPdfActivationReceipt, fingerprintComponentPdfActivationValue } from '../../src/services/book-assembly/componentPdfActivation.service.ts';

const now = '2026-10-03T00:00:00.000Z';
const document = createComponentStudentDocument({ sourceVersionId: 'combined-1', descriptorRevision: 2, sha256Hex: 'a'.repeat(64),
  byteSize: 1024, physicalPageCount: 2, compositionFingerprint: 'composition-1', components: [
    { sourceKey: 'one', sourceVersionId: 'one-v1', sourceOrder: 1, ownerNodeKey: 'unit-1', localPageCount: 1, combinedStartPage: 1, combinedEndPage: 1 },
    { sourceKey: 'two', sourceVersionId: 'two-v1', sourceOrder: 2, ownerNodeKey: 'unit-1', localPageCount: 1, combinedStartPage: 2, combinedEndPage: 2 },
  ] });
const sourceSet = { sourceStrategy: 'component_pdfs' as const, sources: document.components.map(({ sourceKey, sourceVersionId, sourceOrder, ownerNodeKey }) => ({ sourceKey, sourceVersionId, sourceOrder, ownerNodeKey })) };
const activation = createComponentPdfActivationReceipt({ operationId: 'activation-1', ownerId: 'teacher-1', bookId: 'book-1',
  expectedBookRevision: 3, expectedSourceSetRevision: 1, activatedAt: now, sourceSet,
  unitCandidates: [{ unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: 1, manifestFingerprint: 'b'.repeat(64) }],
  activities: [], studentDocument: { sourceVersionId: document.sourceVersionId, descriptorRevision: document.descriptorRevision, descriptorFingerprint: fingerprintComponentPdfActivationValue(document) } });
const metadata = { bookId: 'book-1', ownerId: 'teacher-1', title: 'Public Book', visibility: 'public-library-published', status: 'ready', bookMode: 'pdf',
  bookRevision: 4, sourceSetRevision: 2, sourceSet, setupActivations: [activation] };
const pointer = { publicationId: 'publication-1', publicationRevision: 1, manifestVersionId: 'manifest-1', bookRevision: 4,
  sourceSetRevision: 2, updatedAt: now, updatedByCommandId: 'command-1', inputFingerprint: 'input-1' };
const scope = { current: pointer, versions: { 'manifest-1': { publicationId: pointer.publicationId, publicationRevision: 1,
  strategy: 'component_pdfs', manifest: { sourceSet } } }, studentDocuments: { [document.sourceVersionId]: document } } as Parameters<ReturnType<typeof createPublicBookReadinessProducer>['refresh']>[1];

afterEach(() => vi.unstubAllGlobals());
describe('trusted Public readiness production writes', () => {
  it('projects the trusted original full PDF without inventing a descriptor or byte size', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const fullSourceSet = { sourceStrategy: 'full_pdf' as const, sources: [{ sourceKey: 'original', sourceVersionId: 'original-1', sourceOrder: 1 }] };
    const fullMetadata = { ...metadata, sourceSet: fullSourceSet, setupActivations: undefined };
    const source = { ownerId: 'teacher-1', bookId: 'book-1', sourceKey: 'original', sourceVersionId: 'original-1',
      checksum: { algorithm: 'sha-256', value: 'c'.repeat(64) }, physicalPageCount: 8, verifiedUsable: true,
      purpose: 'book-source', studentSafeStatus: 'ready', studentSafeDecision: { decidedBy: 'teacher-1', decidedAt: now,
        sourceVersionId: 'original-1', sha256Hex: 'c'.repeat(64), reasonCode: 'teacher-reviewed' } };
    let ready: unknown;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('identitytoolkit.googleapis.com')) return Response.json({ idToken: 'scoped-readiness', expiresIn: '3600' });
      if (url.includes('/material_catalog/books/book-1.json')) return Response.json(fullMetadata);
      if (url.includes('/assemblyBooks/book-1/original-1.json')) return Response.json(source);
      if (url.includes('/material_catalog/public_book_readiness/book-1.json')) {
        if (init?.method === 'PUT') { ready = JSON.parse(String(init.body)); return Response.json(ready); }
        return Response.json(null, { headers: { etag: '"empty"' } });
      }
      throw new Error(`unexpected_readiness_boundary:${url}`);
    });
    const producer = createPublicBookReadinessProducer({ FIREBASE_DB_URL: 'https://database.test', FIREBASE_PROJECT_ID: 'project-1', FIREBASE_WEB_API_KEY: 'key',
      BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'account-1', BOOK_ASSEMBLY_PUBLICATION_SERVICE_IDENTITY: 'readiness@project-1.iam.gserviceaccount.com',
      BOOK_ASSEMBLY_PUBLICATION_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'readiness@project-1.iam.gserviceaccount.com', private_key: await exportPKCS8(privateKey) }),
    }, 'teacher-1');
    await producer.refresh('book-1', { ...scope, versions: { 'manifest-1': { ...scope.versions['manifest-1'], strategy: 'full_pdf', manifest: { sourceSet: fullSourceSet } } } } as typeof scope);
    expect(ready).toMatchObject({ sourceStrategy: 'full_pdf', sourceVersionId: 'original-1', physicalPageCount: 8, sha256Hex: 'c'.repeat(64) });
    expect(ready).not.toHaveProperty('descriptorRevision');
    expect(ready).not.toHaveProperty('byteSize');
  });
  it('refreshes the active exact descriptor despite another matching document and fences preclear by generation and ETag', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    let ready: Record<string, unknown> | null = null;
    const writes: Array<{ value: unknown; etag: string | null }> = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('identitytoolkit.googleapis.com')) return Response.json({ idToken: 'scoped-readiness', expiresIn: '3600' });
      if (url.includes('/material_catalog/books/book-1.json')) return Response.json(metadata);
      if (url.includes('/material_catalog/public_book_readiness/book-1.json')) {
        if (init?.method === 'PUT') {
          ready = JSON.parse(String(init.body));
          writes.push({ value: ready, etag: new Headers(init.headers).get('if-match') });
          return Response.json(ready);
        }
        return Response.json(ready, { headers: { etag: '"readiness-1"' } });
      }
      throw new Error(`unexpected_readiness_boundary:${url}`);
    });
    const producer = createPublicBookReadinessProducer({ FIREBASE_DB_URL: 'https://database.test', FIREBASE_PROJECT_ID: 'project-1', FIREBASE_WEB_API_KEY: 'key',
      BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'account-1', BOOK_ASSEMBLY_PUBLICATION_SERVICE_IDENTITY: 'readiness@project-1.iam.gserviceaccount.com',
      BOOK_ASSEMBLY_PUBLICATION_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'readiness@project-1.iam.gserviceaccount.com', private_key: await exportPKCS8(privateKey) }),
    }, 'teacher-1');
    const successor = createComponentStudentDocument({ ...document, sourceVersionId: 'combined-2', descriptorRevision: 3 });
    await producer.refresh('book-1', { ...scope, studentDocuments: { ...scope.studentDocuments, [successor.sourceVersionId]: successor } });
    expect(ready).toMatchObject({ sourceVersionId: document.sourceVersionId, descriptorRevision: 2 });
    expect(ready).not.toHaveProperty('components');
    expect(writes[0].etag).toBe('"readiness-1"');
    await expect(producer.clear('book-1', { ...scope, current: { ...pointer, publicationRevision: 2 } })).rejects.toThrow('public_readiness_clear_conflict');
    expect(writes).toHaveLength(1);
    await producer.clear('book-1', scope);
    expect(ready).toBeNull();
    await producer.refresh('book-1', scope);
    expect(ready).toMatchObject({ publicationId: 'publication-1', sourceVersionId: document.sourceVersionId });
  });
});
