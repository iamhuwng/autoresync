import { describe, expect, it, vi } from 'vitest';
import { createActivityAuthoringService } from './activityAuthoring.service';
import type {
  ActivityDiscardResult,
  ActivityLoadCandidateResult,
  ActivityStageResult,
} from './activityAuthoring.repository';
import { ActivityAuthoringAmbiguousTransportError } from './activityStorage.service';

const activity = {
  schemaVersion: 1,
  title: 'Candidate',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] },
  instructions: [{ text: 'Choose.' }],
  interaction: { family: 'choice', variant: 'single-choice' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{ prompt: 'Pick one', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
  scoring: { mode: 'auto-where-possible' },
} as const;
const stageResult: ActivityStageResult = {
  status: 'staged',
  candidateId: 'candidate-1',
  targetActivityId: 'activity-1',
  revision: 1,
  lifecycle: 'staged',
  validation: { valid: true, errors: [] },
  diff: { classification: 'added', reasons: ['activity-added'], requiresRedo: false },
  evidenceRefs: [],
  sourceEvidenceRefs: [],
  answerEvidenceRefs: [],
};

describe('Activity authoring client facade', () => {
  it('validates before dispatch and never accepts caller-supplied operation identity', async () => {
    const repository = {
      stage: vi.fn(async () => stageResult),
      validate: vi.fn(), saveDraft: vi.fn(), discard: vi.fn(), loadCandidate: vi.fn(),
    };
    const service = createActivityAuthoringService(repository);
    const result = await service.stage({ content: activity, expectedRevision: 0, evidenceRefs: ['import:1'] });
    expect(result).toEqual(stageResult);
    expect(repository.stage).toHaveBeenCalledWith(expect.objectContaining({
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      expectedRevision: 0,
    }));
    await expect(service.stage({ content: { ...activity, ownerId: 'forged' }, expectedRevision: 0 }))
      .rejects.toThrow('schema validation');
    expect(repository.stage).toHaveBeenCalledTimes(1);
  });

  it('sends an owner-scoped discard command with a fresh operation ID', async () => {
    const discardResult: ActivityDiscardResult = {
      status: 'discarded',
      candidateId: 'candidate-1',
      revision: 3,
      lifecycle: 'discarded',
    };
    const loadResult: ActivityLoadCandidateResult = {
      status: 'loaded',
      candidate: {
        candidateId: 'candidate-1',
        targetActivityId: 'activity-1',
        ownerId: 'teacher-1',
        targetRevision: 0,
        revision: 3,
        lifecycle: 'discarded',
        content: null,
        validation: { valid: true, errors: [] },
        diff: { classification: 'added', reasons: ['activity-added'], requiresRedo: false },
        evidenceRefs: [],
        sourceEvidenceRefs: [],
        answerEvidenceRefs: [],
        updatedAt: 1,
      },
    };
    const repository = {
      stage: vi.fn(),
      validate: vi.fn(),
      saveDraft: vi.fn(),
      discard: vi.fn(async () => discardResult),
      loadCandidate: vi.fn(async () => loadResult),
    };
    const service = createActivityAuthoringService(repository);
    const result = await service.discard({ candidateId: 'candidate-1', expectedRevision: 2 });
    expect(result).toEqual(discardResult);
    expect(repository.discard).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: 'candidate-1',
      expectedRevision: 2,
      operationId: expect.any(String),
    }));
    await expect(service.loadCandidate('candidate-1')).resolves.toEqual(loadResult);
  });

  it('retries an ambiguous post-commit stage with exactly same operation ID', async () => {
    const repository = {
      stage: vi.fn()
        .mockRejectedValueOnce(new ActivityAuthoringAmbiguousTransportError())
        .mockResolvedValueOnce({ ...stageResult, replayed: true }),
      validate: vi.fn(), saveDraft: vi.fn(), discard: vi.fn(), loadCandidate: vi.fn(),
    };
    const service = createActivityAuthoringService(repository);
    await expect(service.stage({ content: activity, expectedRevision: 0 }))
      .resolves.toEqual({ ...stageResult, replayed: true });
    expect(repository.stage).toHaveBeenCalledTimes(2);
    expect(repository.stage.mock.calls[0][0].operationId).toBe(repository.stage.mock.calls[1][0].operationId);
  });
});
