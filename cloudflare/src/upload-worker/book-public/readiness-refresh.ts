import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import { FirebaseRestBookAssemblyPublicationRepository } from '../book-assembly/publication-repository.ts';
import { createPublicBookReadinessProducer, type PublicReadinessEnv } from './readiness-producer.ts';
import { isActiveBookSourceAuthorityProfile } from '../book-source/trusted-source-contract.ts';
import { publicBookReadinessPath } from '../../../../src/services/materialCatalog/publicBookCatalogReadiness.service.ts';

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const BOOK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;
/** Authenticated moderation write-side refresh; request fields cannot supply authority pins. */
export const createPublicBookReadinessRefreshHandlers = () => ({
  async refreshReadiness(input: { request: Request; env: PublicReadinessEnv; uid: string; bookId: string }) {
    try {
      if (!BOOK_ID.test(input.bookId) || !BOOK_ID.test(input.uid)) {
        return { body: { code: 'public_book_request_invalid' }, init: { status: 400 } };
      }
      const body = await input.request.text();
      if (body.trim() !== '' && body.trim() !== '{}') return { body: { code: 'public_book_request_invalid' }, init: { status: 400 } };
      const bearer = /^Bearer\s+(.+)$/iu.exec(input.request.headers.get('authorization') ?? '')?.[1];
      if (!bearer) return { body: { code: 'public_book_actor_required' }, init: { status: 401 } };
      const db = new FirebaseRtdbRestClient({ env: { ...input.env, GOOGLE_SA_KEY: undefined }, fetchImpl: globalThis.fetch,
        firebaseAuthToken: true, getFirebaseAuthToken: async () => bearer });
      const profile = await db.readValue(`users/${input.uid}`);
      const admin = isActiveBookSourceAuthorityProfile(profile, 'super_admin');
      if (!admin && !isActiveBookSourceAuthorityProfile(profile, 'teacher')) return { body: { code: 'public_book_actor_required' }, init: { status: 403 } };
      const book = record(await db.readValue(`material_catalog/books/${input.bookId}`));
      if (!book || book.bookId !== input.bookId || typeof book.ownerId !== 'string' || (!admin && book.ownerId !== input.uid)) return { body: { code: 'public_book_forbidden' }, init: { status: 403 } };
      if (book.visibility !== 'public-library-published' || book.status !== 'ready') return { body: { code: 'public_book_document_unavailable' }, init: { status: 409 } };
      const scope = await new FirebaseRestBookAssemblyPublicationRepository({ env: input.env, ownerId: book.ownerId }).readScope(input.bookId);
      if (!scope.current) return { body: { code: 'public_book_document_unavailable' }, init: { status: 409 } };
      await createPublicBookReadinessProducer(input.env, book.ownerId).refresh(input.bookId, scope);
      const ready = record(await db.readValue(publicBookReadinessPath(input.bookId)));
      if (!ready || ready.publicationId !== scope.current.publicationId || ready.publicationRevision !== scope.current.publicationRevision) return { body: { code: 'public_book_document_unavailable' }, init: { status: 409 } };
      return { body: { status: 'ready' }, init: { status: 200 } };
    } catch { return { body: { code: 'public_book_readiness_unavailable' }, init: { status: 503 } }; }
  },
});
