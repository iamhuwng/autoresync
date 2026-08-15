import { describe, expect, it } from 'vitest';
import { normalizeActivity } from '../../src/services/book-activity/activityCanonical.service.ts';
import {
  FirebaseRestBookActivityAuthoringRepository,
  type BookActivityAuthoringRoot,
} from '../src/upload-worker/book-activity-authoring/repository.ts';

const content = {
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
  interactions: [{ prompt: 'Pick', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
  scoring: { mode: 'auto-where-possible' },
} as const;

const omitActivityDefaults = (value: Record<string, unknown>): Record<string, unknown> => {
  const { taskProfile: _taskProfile, stimulus: _stimulus, assetRefs: _assetRefs, ...rest } = value;
  return rest;
};

describe('Book Activity authoring Firebase repository', () => {
  it('hydrates RTDB-erased normal-path values before reads and CAS mutations', async () => {
    const normalized = normalizeActivity(content);
    const fullCandidate = {
      candidateId: 'candidate-1',
      targetActivityId: 'activity-1',
      ownerId: 'owner-1',
      bookId: 'book-1',
      targetRevision: 0,
      revision: 1,
      lifecycle: 'staged',
      content: { ...content },
      validation: { valid: true, errors: [] },
      diff: null,
      evidenceRefs: [],
      sourceEvidenceRefs: [],
      answerEvidenceRefs: [],
      updatedAt: 1_700_000_000_000,
    };
    const fullActivity = {
      activityId: 'activity-1',
      ownerId: 'owner-1',
      revision: 1,
      lifecycle: 'draft',
      editableDraft: { ...content },
      draft: normalized,
      updatedAt: 1_700_000_000_000,
    };
    const { evidenceRefs: _evidenceRefs, sourceEvidenceRefs: _sourceEvidenceRefs,
      answerEvidenceRefs: _answerEvidenceRefs, validation: fullValidation, content: fullContent,
      ...candidateWithoutErasedArrays
    } = fullCandidate;
    const { errors: _errors, ...validationWithoutErasedErrors } = fullValidation;
    const wireRoot = {
      candidates: {
        'candidate-1': {
          ...candidateWithoutErasedArrays,
          content: omitActivityDefaults(fullContent),
          validation: validationWithoutErasedErrors,
        },
      },
      activities: {
        'activity-1': {
          ...fullActivity,
          editableDraft: omitActivityDefaults(fullActivity.editableDraft),
          draft: omitActivityDefaults(fullActivity.draft as unknown as Record<string, unknown>),
        },
      },
      operations: {
        '123e4567-e89b-42d3-a456-426614174001': {
          ownerId: 'owner-1',
          fingerprint: 'stage-fingerprint',
          result: {
            status: 'staged',
            candidateId: 'candidate-1',
            validation: { valid: true },
          },
          createdAt: 1_700_000_000_000,
        },
      },
    };
    const requests: string[] = [];
    const writes: unknown[] = [];
    const repository = new FirebaseRestBookActivityAuthoringRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: 'authoring@test.example',
      },
      getAccessToken: async () => 'test-token',
      fetchImpl: async (input, init) => {
        requests.push(String(init?.method ?? 'GET'));
        if ((init?.method ?? 'GET') === 'PUT') {
          writes.push(JSON.parse(String(init?.body)));
          return new Response('{}', { status: 200 });
        }
        return new Response(JSON.stringify(wireRoot), {
          status: 200,
          headers: { etag: '"v1"' },
        });
      },
    });

    const expected: BookActivityAuthoringRoot = {
      candidates: { 'candidate-1': fullCandidate },
      activities: { 'activity-1': fullActivity },
      operations: {
        '123e4567-e89b-42d3-a456-426614174001': {
          ownerId: 'owner-1',
          fingerprint: 'stage-fingerprint',
          result: {
            status: 'staged',
            candidateId: 'candidate-1',
            evidenceRefs: [],
            sourceEvidenceRefs: [],
            answerEvidenceRefs: [],
            validation: { valid: true, errors: [] },
          },
          createdAt: 1_700_000_000_000,
        },
      },
    };
    await expect(repository.readOwnerRoot('owner-1')).resolves.toEqual(expected);

    await expect(repository.transaction('owner-1', (current) => {
      const next = structuredClone(current);
      (next.candidates!['candidate-1'] as Record<string, unknown>).revision = 2;
      return { outcome: 'advanced', next, write: true };
    })).resolves.toBe('advanced');
    expect(writes).toEqual([{ ...expected, candidates: {
      'candidate-1': { ...fullCandidate, revision: 2 },
    } }]);
    expect(requests).toEqual(['GET', 'GET', 'PUT']);
  });

  it('preserves rejected candidate content and exact discarded operation results', async () => {
    const rejectedContent = omitActivityDefaults({ ...content });
    const wireRoot = {
      candidates: {
        'candidate-rejected': {
          candidateId: 'candidate-rejected',
          targetActivityId: 'activity-rejected',
          ownerId: 'owner-1',
          targetRevision: 0,
          revision: 1,
          lifecycle: 'rejected',
          content: rejectedContent,
          validation: {
            valid: false,
            errors: [{ code: 'required', path: '$.stimulus', message: 'Stimulus is required.' }],
          },
          diff: null,
          evidenceRefs: ['source:rejected'],
          sourceEvidenceRefs: ['source:rejected'],
          answerEvidenceRefs: [],
          updatedAt: 1_700_000_000_000,
        },
      },
      operations: {
        '123e4567-e89b-42d3-a456-426614174002': {
          ownerId: 'owner-1',
          fingerprint: 'discard-fingerprint',
          result: {
            status: 'discarded',
            candidateId: 'candidate-rejected',
            revision: 2,
            lifecycle: 'discarded',
          },
          createdAt: 1_700_000_000_000,
        },
      },
    };
    const repository = new FirebaseRestBookActivityAuthoringRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: 'authoring@test.example',
      },
      getAccessToken: async () => 'test-token',
      fetchImpl: async () => new Response(JSON.stringify(wireRoot), {
        status: 200,
        headers: { etag: '"v1"' },
      }),
    });

    await expect(repository.readOwnerRoot('owner-1')).resolves.toEqual(wireRoot);
  });
});
