import { describe, expect, it, vi } from 'vitest';
import { createActivityAuthoringRepository } from './activityAuthoring.repository';

const stageResponse = {
  status: 'staged',
  candidateId: 'candidate-1',
  targetActivityId: 'activity-1',
  revision: 1,
  lifecycle: 'staged',
  validation: { valid: true, errors: [] },
  diff: {
    classification: 'added',
    reasons: ['activity-added'],
    requiresRedo: false,
  },
  evidenceRefs: ['source:1'],
};

describe('Activity authoring repository response boundary', () => {
  it('returns a decoded discriminated result and strips no required state', async () => {
    const transport = {
      mutate: vi.fn(async () => ({ ...stageResponse, replayed: true })),
      read: vi.fn(),
    };
    const repository = createActivityAuthoringRepository(transport);
    await expect(repository.stage({
      operationId: '123e4567-e89b-42d3-a456-426614174001',
      expectedRevision: 0,
      content: {},
    })).resolves.toEqual({ ...stageResponse, replayed: true });
  });

  it('fails closed on unknown fields, invalid diff invariants, or arbitrary status', async () => {
    const responses = [
      { ...stageResponse, privateAnswer: 'leak' },
      {
        ...stageResponse,
        diff: { ...stageResponse.diff, requiresRedo: true },
      },
      { ...stageResponse, status: 'published' },
    ];
    for (const response of responses) {
      const repository = createActivityAuthoringRepository({
        mutate: async () => response,
        read: vi.fn(),
      });
      await expect(repository.stage({
        operationId: '123e4567-e89b-42d3-a456-426614174002',
        expectedRevision: 0,
        content: {},
      })).rejects.toThrow('malformed response');
    }
  });
});
