import { exportPKCS8, generateKeyPair } from 'jose';
import { createProductionBookSubmissionPublicationFinalizer } from '../../src/upload-worker/book-submission/production.ts';
import {
  fingerprint, operationId, ownerId, bookId, sourceReceipt, activity, manifest,
  verifiedSource, operation, env, request, componentArtifact,
} from './book-submission-publication.ts';

/** Runs the real finalizer; only Firebase token exchange and the final network write are intercepted. */
export const captureSubmissionPublication = async (strategy: 'full_pdf' | 'component_pdfs') => {
  const receipts = strategy === 'full_pdf' ? [sourceReceipt('full', 'full-v1')]
    : [sourceReceipt('part-a', 'part-a-v1'), sourceReceipt('part-b', 'part-b-v1')];
  const sources = receipts.map((receipt) => verifiedSource(receipt));
  const artifact = strategy === 'component_pdfs' ? componentArtifact() : undefined;
  const currentOperation = { ...operation, commitLeaseExpiresAt: Date.now() + 120_000 };
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  const serviceAccount = JSON.stringify({ client_email: env.BOOK_SUBMISSION_SERVICE_IDENTITY, private_key: await exportPKCS8(privateKey) });
  const originalFetch = globalThis.fetch;
  let writes: Record<string, unknown> | undefined;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://identitytoolkit.googleapis.com/')) {
      return Response.json({ idToken: 'test-id-token', expiresIn: '3600' });
    }
    if (String(url).startsWith('https://firebase.test/') && init?.method === 'PATCH') {
      if (writes) throw new Error('duplicate_finalizer_patch');
      writes = JSON.parse(String(init.body));
      return Response.json(null);
    }
    throw new Error('unexpected_finalizer_network_request');
  };
  try {
    await createProductionBookSubmissionPublicationFinalizer().commit({
      operation: currentOperation, uid: ownerId, operationId, finalBookId: bookId, fingerprint,
      metadata: { title: 'Published book', authors: [], testTypeIds: ['reading'], tags: [] },
      prepared: { strategy, manifest: manifest(strategy), activitiesByKey: { 'unit-1:activity-1': activity } },
      sources, env: { ...env, BOOK_SUBMISSION_GOOGLE_SA_KEY: serviceAccount }, request,
      ...(artifact ? { componentArtifact: artifact, studentDocumentSource: verifiedSource({
        ...artifact.studentDocument, sourceKey: 'student-document', purpose: 'student-document',
      }, 'student-document') } : {}),
    });
  } finally { globalThis.fetch = originalFetch; }
  if (!writes) throw new Error('missing_finalizer_patch');
  return { operation: currentOperation, sources, artifact, writes };
};
