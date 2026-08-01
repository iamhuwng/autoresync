import { describe, expect, it } from 'vitest';
import preview from '../src/upload-worker/book-homework/ticket88-preview-worker';
import rollback from '../src/upload-worker/book-homework/ticket88-preview-rollback-worker';

describe('Ticket 88 production-equivalent preview contract', () => {
  it('proves exact aggregation, duplicate stability, readback, manifest projection, and isolation', async () => {
    const response = await preview.fetch(new Request('https://preview.test/proof'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      proofKind: 'prd0062-ticket88-production-equivalent',
      pass: true,
      indexedScope: 'ticket88-student/ticket88-homework',
      first: {
        completion: { submittedCount: 1, requiredCount: 2, isComplete: false },
        grading: { pendingReviewCount: 1, scoredCount: 0 },
      },
      duplicate: { status: 'replayed', factCount: 2 },
      second: {
        completion: { submittedCount: 2, requiredCount: 2, isComplete: true },
        grading: { pendingReviewCount: 1, scoredCount: 1 },
        legacyAggregateFieldsPresent: false,
      },
      manifestChange: {
        completion: { submittedCount: 1, requiredCount: 2, isComplete: false },
        historicalReasons: expect.arrayContaining(['removed-binding']),
        factsPreserved: true,
      },
      crossContext: { code: 'homework_completion_manifest_context_mismatch' },
    });
  });

  it('fails closed outside proof and under the rollback Worker', async () => {
    const nonProof = await preview.fetch(new Request('https://preview.test/other'));
    expect(nonProof.status).toBe(503);
    const response = await rollback.fetch();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: 'ticket88_preview_rollback_fail_closed',
      writable: false,
    });
  });
});
