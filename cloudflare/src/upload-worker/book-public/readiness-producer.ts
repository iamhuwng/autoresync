import { createFirebaseClaimTokenProvider, type BookFirebaseClaimTuple } from '../book-activity-authoring/firebase-token.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import type { BookAssemblyPublicationRepositoryEnv } from '../book-assembly/publication-repository.ts';
import { createFirebaseBookSourceAuthorityReader } from '../book-assembly/book-source-authority-reader.ts';
import type { BookAssemblyPublicationScope } from '../../../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyPublicationResult } from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import type { BookAssemblyPublicationPointer } from '../../../../src/types/bookAssembly.types.ts';
import { activeComponentPdfActivation, fingerprintComponentPdfActivationValue } from '../../../../src/services/book-assembly/componentPdfActivation.service.ts';
import { createPublicBookCatalogReadiness, publicBookReadinessPath } from '../../../../src/services/materialCatalog/publicBookCatalogReadiness.service.ts';
import type { MaterialBookMetadata } from '../../../../src/types/materialCatalog.types.ts';

export type PublicReadinessEnv = BookAssemblyPublicationRepositoryEnv & { readonly BOOK_SOURCE_UPLOAD_ACCOUNT_ID?: string };
type Scope = BookAssemblyPublicationScope<BookAssemblyPublicationResult>;

/** Publication/moderation write-side projection. Native Rules enforce the live pins at each commit. */
export const createPublicBookReadinessProducer = (env: PublicReadinessEnv, ownerId: string) => {
  const serviceIdentity = env.BOOK_ASSEMBLY_PUBLICATION_SERVICE_IDENTITY || env.BOOK_ASSEMBLY_SERVICE_IDENTITY || '';
  const serviceAccountJson = env.BOOK_ASSEMBLY_PUBLICATION_GOOGLE_SA_KEY || env.BOOK_ASSEMBLY_GOOGLE_SA_KEY || '';
  const accountId = env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID?.trim() || '';
  const provider = () => createFirebaseClaimTokenProvider({ serviceIdentity, serviceAccountJson,
    firebaseProjectId: env.FIREBASE_PROJECT_ID || '', firebaseWebApiKey: env.FIREBASE_WEB_API_KEY || '' });
  let tokens: ReturnType<typeof provider> | undefined;
  const token = (claims: BookFirebaseClaimTuple) => (tokens ??= provider())(claims);
  const client = (bookId: string, pointer: BookAssemblyPublicationPointer, setupActivationIndex?: string) => new FirebaseRtdbRestClient({
    env: { ...env, GOOGLE_SA_KEY: undefined }, firebaseAuthToken: true, fetchImpl: globalThis.fetch,
    getFirebaseAuthToken: async ({ path }) => {
      if (path !== publicBookReadinessPath(bookId) && path !== `material_catalog/books/${bookId}`) throw new Error('public_readiness_path_invalid');
      return token({ service: 'book_public_readiness', bookId, ownerId, publicationId: pointer.publicationId,
        publicationRevision: pointer.publicationRevision, accountId, ...(setupActivationIndex === undefined ? {} : { setupActivationIndex }) });
    },
  });
  return {
    async clear(bookId: string, scope: Scope): Promise<void> {
      if (!scope.current) return;
      const db = client(bookId, scope.current);
      const path = publicBookReadinessPath(bookId);
      const current = await db.readWithEtag<{ publicationId?: string; publicationRevision?: number }>(path);
      if (!current.data) return;
      if (current.data.publicationId !== scope.current.publicationId || current.data.publicationRevision !== scope.current.publicationRevision
        || !await db.writeIfMatch(path, null, current.etag)) throw new Error('public_readiness_clear_conflict');
    },
    async refresh(bookId: string, scope: Scope): Promise<void> {
      const pointer = scope.current;
      if (!pointer) return;
      const metadata = await client(bookId, pointer).readValue(`material_catalog/books/${bookId}`) as MaterialBookMetadata | null;
      if (!metadata || metadata.ownerId !== ownerId || metadata.visibility !== 'public-library-published' || metadata.status !== 'ready') return;
      if (!Number.isSafeInteger(metadata.bookRevision)) throw new Error('public_readiness_book_revision_unavailable');
      const book = { ...metadata, bookRevision: metadata.bookRevision! };
      const version = scope.versions?.[pointer.manifestVersionId];
      if (!version || version.publicationId !== pointer.publicationId || version.publicationRevision !== pointer.publicationRevision) throw new Error('public_readiness_publication_unavailable');
      let index: string | undefined;
      let readiness;
      if (version.strategy === 'component_pdfs') {
        const activation = activeComponentPdfActivation(metadata);
        const document = activation ? scope.studentDocuments?.[activation.studentDocument.sourceVersionId] : undefined;
        if (!activation || !document || document.descriptorRevision !== activation.studentDocument.descriptorRevision
          || fingerprintComponentPdfActivationValue(document) !== activation.studentDocument.descriptorFingerprint) throw new Error('public_readiness_document_unavailable');
        index = String(metadata.setupActivations!.length - 1);
        readiness = createPublicBookCatalogReadiness({ book, pointer, sourceStrategy: 'component_pdfs', document });
      } else {
        const sourceVersionId = version.manifest.sourceSet.sources[0]?.sourceVersionId;
        if (version.manifest.sourceSet.sources.length !== 1 || !sourceVersionId) throw new Error('public_readiness_document_unavailable');
        const authority = await createFirebaseBookSourceAuthorityReader({ ...env, BOOK_SOURCE_UPLOAD_ACCOUNT_ID: accountId,
          getFirebaseAuthToken: () => token({ service: 'book_assembly', ownerId, bookId, unitKey: 'public-readiness' }),
        }).read({ ownerId, bookId });
        const source = authority?.sourceVersionAuthority.getSourceVersion(sourceVersionId);
        if (!source) throw new Error('public_readiness_document_unavailable');
        readiness = createPublicBookCatalogReadiness({ book, pointer, sourceStrategy: 'full_pdf', source });
      }
      if (!readiness) throw new Error('public_readiness_document_unavailable');
      const db = client(bookId, pointer, index);
      const path = publicBookReadinessPath(bookId);
      const prior = await db.readWithEtag(path);
      if (!await db.writeIfMatch(path, readiness, prior.etag)) throw new Error('public_readiness_refresh_conflict');
    },
  };
};
