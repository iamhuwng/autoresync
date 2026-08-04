import { describe, expect, it } from 'vitest';
import {
  createBookIntegrityCaptureClient,
} from '../../src/services/book-activity/bookIntegrityCapture.service';
import {
  BOOK_INTEGRITY_SCHEMA_VERSION,
  type BookIntegritySignalRequest,
} from '../../src/services/book-activity/bookIntegrityCapture.types';
import preview from '../src/upload-worker/book-activity-integrity/ticket91-preview-worker';
import rollback from '../src/upload-worker/book-activity-integrity/ticket91-preview-rollback-worker';

const request: BookIntegritySignalRequest = {
  schemaVersion: BOOK_INTEGRITY_SCHEMA_VERSION,
  target: {
    bookId: 'book-1',
    bindingId: 'binding-1',
    bindingRevision: 1,
    contextKind: 'homework',
    contextId: 'homework-1',
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 1,
  },
  policyId: 'ticket91-accountable',
  policyRevision: 1,
  clientSessionId: 'ticket91-browser-session',
  sequence: 1,
  signal: 'paste',
};

const workerFetch: typeof fetch = async (input, init) => preview.fetch(
  input instanceof Request ? new Request(input, init) : new Request(input, init),
);

describe('Ticket #91 production-equivalent preview contract', () => {
  it('proves trusted bounded writes, dedupe/rate, policy-off silence, and access denials', async () => {
    const response = await preview.fetch(new Request('https://preview.test/proof'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      proofKind: 'prd0062-ticket91-production-equivalent',
      pass: true,
      trustedBoundedWrites: {
        first: { status: 'recorded' },
        replay: { status: 'deduplicated' },
        limited: { status: 'rate_limited' },
        immutableEventCount: 8,
        maxEventsPerAttempt: 64,
        maxEventsPerMinute: 8,
      },
      policyOffSilence: {
        result: { status: 'ignored', reason: 'policy_off' },
      },
      accessDenials: {
        inactive: { status: 'ignored', reason: 'inactive_attempt' },
        wrongStudent: { status: 'ignored', reason: 'inactive_attempt' },
        mismatchedTarget: { status: 'ignored', reason: 'attempt_mismatch' },
        canonicalBrowserRead: 'denied',
        canonicalBrowserWrite: 'denied',
        crossStudentRead: 'denied',
      },
      productionRepository: {
        kind: 'firebase-rtdb-rest-cas-ledger-with-immutable-event-put',
        protectedRoot: 'book_activity_integrity',
        browserCanonicalReads: false,
        immutableEvents: true,
        parentReplacementDenied: true,
        rulesEquivalentTransport: true,
        repositoryMetrics: {
          ledgerWrites: 8,
          immutableEventWrites: 8,
          immutableEventConflicts: 1,
          deniedParentWrites: 1,
        },
      },
      privacySafe: true,
      noPunitiveBehavior: true,
      completionAvailable: true,
      submissionAvailable: true,
    });
  });

  it('exercises the bounded browser adapter and denies another browser identity', async () => {
    const client = createBookIntegrityCaptureClient({
      baseUrl: 'https://preview.test',
      getIdToken: async () => 'student-1-token',
      fetchImpl: workerFetch,
    });
    await expect(client.recordSignal(request)).resolves.toMatchObject({
      status: 'recorded',
      signal: 'paste',
    });

    const denied = createBookIntegrityCaptureClient({
      baseUrl: 'https://preview.test',
      getIdToken: async () => 'student-2-token',
      fetchImpl: workerFetch,
    });
    await expect(denied.recordSignal(request)).rejects.toMatchObject({
      code: 'integrity_unauthorized',
      status: 403,
    });
    const canonicalRead = await preview.fetch(new Request(
      'https://preview.test/book-integrity/books/book-1/events',
    ));
    expect(canonicalRead.status).toBe(403);
  });

  it('keeps completion and submission available during rollback while preserving prior signals', async () => {
    const response = await rollback.fetch(new Request('https://preview.test/proof'));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: 'ticket91_preview_capture_disabled',
      capture: 'disabled',
      completionAvailable: true,
      submissionAvailable: true,
      recordedSignals: 'preserved',
      canonicalLogsWritable: false,
      boundDataStores: 0,
    });
  });

  it('supports credential-free preflight and fails closed outside owned routes', async () => {
    const preflight = await preview.fetch(new Request(
      'https://preview.test/book-integrity/books/book-1/signals',
      { method: 'OPTIONS' },
    ));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toBe(
      'GET, POST, OPTIONS',
    );
    expect((await preview.fetch(new Request('https://preview.test/other'))).status).toBe(503);
  });
});
