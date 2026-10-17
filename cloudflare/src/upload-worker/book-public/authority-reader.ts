import { createFirebaseClaimTokenProvider } from '../book-activity-authoring/firebase-token.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import type { BookDeliveryRepositoryEnv } from '../book-delivery/repository.ts';

/** Exact Public eligibility reads share the dedicated Delivery signer; no generic OAuth fallback. */
export const createPublicBookAuthorityReader = (env: BookDeliveryRepositoryEnv, bookId: string, studentId: string) => {
  const paths = new Set([`users/${studentId}`, `material_catalog/books/${bookId}`, `material_catalog/public_book_projections/${bookId}`]);
  const injected = env.readDatabaseValue;
  const tokenProvider = injected ? undefined : createFirebaseClaimTokenProvider({
    serviceIdentity: env.BOOK_DELIVERY_SERVICE_IDENTITY ?? '',
    serviceAccountJson: env.BOOK_DELIVERY_GOOGLE_SA_KEY ?? '',
    firebaseProjectId: env.FIREBASE_PROJECT_ID ?? '',
    firebaseWebApiKey: env.FIREBASE_WEB_API_KEY ?? '',
  });
  const client = injected ? undefined : new FirebaseRtdbRestClient({ env, firebaseAuthToken: true, fetchImpl: globalThis.fetch,
    getFirebaseAuthToken: () => tokenProvider!({ service: 'book_public_reader', bookId, studentId }),
  });
  return (path: string): Promise<unknown> => {
    if (!paths.has(path)) throw new Error('public_book_authority_read_scope_invalid');
    return injected ? injected(path) : client!.readValue(path);
  };
};
