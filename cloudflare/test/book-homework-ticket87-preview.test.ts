import { describe, expect, it } from 'vitest';
import worker from '../src/upload-worker/book-homework/ticket87-preview-worker';

describe('Ticket 87 production-equivalent preview contract', () => {
  it('proves server time, document refresh, race-safe mutation, and forged input denial', async () => {
    const response = await worker.fetch(new Request(
      'https://preview.test/proof?clientNow=2099-01-01T00%3A00%3A00.000Z',
    ));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      proofKind: 'prd0062-ticket87-production-equivalent',
      pass: true,
      serverTime: {
        clientNowIgnored: '2099-01-01T00:00:00.000Z',
        phase: 'unreleased',
        outcome: 'denied',
      },
      document: {
        nestedActivityUnreleased: true,
        rangeStatus: 206,
        headStatus: 200,
        refreshAfterAssignmentMutationStatus: 403,
        authorizationCount: 3,
      },
      race: {
        status: 409,
        body: {
          code: 'runtime_schedule_authority_stale',
          currentScheduleAuthority: {
            authorityRevision: 2,
            window: { phase: 'unreleased', permissions: { canAutosave: false } },
          },
        },
        noWrite: true,
      },
      submit: {
        saveStatus: 200,
        submitStatus: 200,
        body: { status: 'accepted' },
        attemptCount: 1,
        completionCount: 1,
      },
      forgedBinding: {
        outcome: 'unavailable',
        code: 'runtime_schedule_authority_unavailable',
      },
    });
  });

  it('fails closed on every non-proof route and method', async () => {
    const response = await worker.fetch(new Request(
      'https://preview.test/rollback',
      { method: 'POST' },
    ));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: 'ticket87_preview_fail_closed',
      writable: false,
    });
  });
});
