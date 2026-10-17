import { describe, expect, it } from 'vitest';
import preview from '../src/upload-worker/book-activity-grading/ticket89-preview-worker';
import rollback from '../src/upload-worker/book-activity-grading/ticket89-preview-rollback-worker';

describe('Ticket #89 production-equivalent preview contract', () => {
  it('proves trusted evaluation/regrade, indexed history, replay/stale safety, and cross-owner denial', async () => {
    const response = await preview.fetch(new Request('https://preview.test/proof'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      proofKind: 'prd0062-ticket89-production-equivalent',
      pass: true,
      productionRepository: {
        kind: 'firebase-rest-cas',
        protectedRoot: 'book_activity_evaluations',
        conditionalWrites: 2,
        historyQueries: 1,
      },
      objective: { status: 'accepted', revision: { revision: 1 } },
      replay: { status: 'replayed', revision: { revision: 1 } },
      stale: { status: 'rejected', code: 'evaluation_stale_revision' },
      regrade: { status: 'accepted', revision: { revision: 2 } },
      crossOwner: { status: 'rejected', code: 'evaluation_actor_unauthorized' },
      history: [
        { revision: 1, previousRevision: 0 },
        { revision: 2, previousRevision: 1 },
      ],
      submissionFactsPreserved: true,
      visibilityNeutral: true,
      visibilityPolicyPersisted: false,
    });
  });

  it('fails closed outside proof and after rollback', async () => {
    expect((await preview.fetch(new Request('https://preview.test/other'))).status).toBe(503);
    expect((await preview.fetch(new Request('https://preview.test/proof', { method: 'POST' }))).status).toBe(503);
    const response = await rollback.fetch(new Request('https://preview.test/proof'));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: 'ticket89_preview_rollback_fail_closed',
      commandAcceptance: 'disabled',
      writable: false,
      boundDataStores: 0,
    });
  });
});
