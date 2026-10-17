import { describe, expect, it, vi } from 'vitest';
import { createActivityAuthoringRepository } from './activityAuthoring.repository';
import { ActivityAuthoringAmbiguousTransportError } from './activityStorage.service';

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

const savedResponse = {
  status: 'saved',
  activityId: 'activity-1',
  revision: 1,
  candidateId: 'candidate-1',
  candidateRevision: 3,
  lifecycle: 'saved',
  validation: { valid: true, errors: [] },
  diff: null,
  evidenceRefs: [],
  binding: {
    schemaVersion: 1,
    ownerId: 'owner-1',
    bookId: 'book-1',
    unitKey: 'unit-1',
    activityKey: 'activity-1',
    activityId: 'activity-1',
    candidateId: 'candidate-1',
    candidateRevision: 3,
    candidateLifecycle: 'saved',
    phase: 'complete',
  },
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

  it('decodes the server-owned Unit binding receipt on a saved Book Activity', async () => {
    const repository = createActivityAuthoringRepository({
      mutate: vi.fn(async () => savedResponse),
      read: vi.fn(),
    });
    await expect(repository.saveDraft({
      operationId: '123e4567-e89b-42d3-a456-426614174003',
      expectedRevision: 2,
      candidateId: 'candidate-1',
    })).resolves.toEqual(savedResponse);
  });

  it('restores RTDB-elided empty reasons only for an unchanged diff', async () => {
    const repository = createActivityAuthoringRepository({
      mutate: vi.fn(async () => ({
        ...savedResponse,
        diff: { classification: 'unchanged', requiresRedo: false },
      })),
      read: vi.fn(),
    });
    await expect(repository.saveDraft({
      operationId: '123e4567-e89b-42d3-a456-426614174005',
      expectedRevision: 2,
      candidateId: 'candidate-1',
    })).resolves.toMatchObject({
      diff: { classification: 'unchanged', reasons: [], requiresRedo: false },
    });

    const malformed = createActivityAuthoringRepository({
      mutate: vi.fn(async () => ({
        ...savedResponse,
        diff: { classification: 'display-only', requiresRedo: false },
      })),
      read: vi.fn(),
    });
    await expect(malformed.saveDraft({
      operationId: '123e4567-e89b-42d3-a456-426614174006',
      expectedRevision: 2,
      candidateId: 'candidate-1',
    })).rejects.toThrow('malformed response');
  });

  it('requests an exact-operation replay for a valid binding-pending receipt', async () => {
    const repository = createActivityAuthoringRepository({
      mutate: vi.fn(async () => ({
        ...savedResponse,
        status: 'binding-incomplete',
        retryable: true,
        binding: { ...savedResponse.binding, phase: 'binding-pending' },
      })),
      read: vi.fn(),
    });
    await expect(repository.saveDraft({
      operationId: '123e4567-e89b-42d3-a456-426614174004',
      expectedRevision: 2,
      candidateId: 'candidate-1',
    })).rejects.toBeInstanceOf(ActivityAuthoringAmbiguousTransportError);
  });
});
