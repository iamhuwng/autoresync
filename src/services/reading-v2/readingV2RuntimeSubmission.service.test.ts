import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ReadingV2TrustedSubmissionAuthError,
  ReadingV2TrustedSubmissionUnavailableError,
  buildDefaultReadingV2SubmissionEndpoint,
  buildReadingV2TrustedSubmissionRequest,
  isReadingV2RuntimeSubmissionConfigured,
  submitReadingV2RuntimeAttempt,
} from './readingV2RuntimeSubmission.service';

const authMock = vi.hoisted(() => ({
  currentUser: {
    getIdToken: vi.fn(),
  },
}));

vi.mock('../firebase', () => ({
  auth: authMock,
}));

const payload = {
  projectionId: 'student-safe:material-1:snapshot-1',
  sourceSnapshotVersionId: 'snapshot-1',
  materialId: 'material-1',
  answers: [{
    interactionId: 'interaction-1',
    taskGroupId: 'task-group-1',
    visibleNumber: 7,
    value: 'answer one',
  }],
};

describe('readingV2RuntimeSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.currentUser.getIdToken.mockResolvedValue('token-1');
  });

  it('builds a client-safe trusted request with visible numbers mapped to display numbers', () => {
    expect(isReadingV2RuntimeSubmissionConfigured('https://example.test/reading-v2-submit')).toBe(true);
    expect(isReadingV2RuntimeSubmissionConfigured('')).toBe(false);
    expect(buildDefaultReadingV2SubmissionEndpoint({ projectId: 'temp-a1437' }))
      .toBe('');
    expect(buildDefaultReadingV2SubmissionEndpoint({
      projectId: 'temp-a1437',
      useLocalEmulator: true,
    })).toBe('http://127.0.0.1:5001/temp-a1437/us-central1/readingV2Submit');

    expect(buildReadingV2TrustedSubmissionRequest({
      payload,
      context: {
        surface: 'solo-practice',
        sourceName: 'Reading fixture',
      },
    })).toEqual(expect.objectContaining({
      deliveryEngine: 'reading-v2',
      projectionId: 'student-safe:material-1:snapshot-1',
      sourceSnapshotVersionId: 'snapshot-1',
      materialId: 'material-1',
      answers: [{
        interactionId: 'interaction-1',
        taskGroupId: 'task-group-1',
        displayNumber: 7,
        value: 'answer one',
      }],
      context: {
        surface: 'solo-practice',
        sourceName: 'Reading fixture',
      },
    }));
  });

  it('posts the request with a Firebase ID token and returns the trusted result identity', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        resultId: 'result-1',
        attemptId: 'attempt-1',
        totalScore: 13,
        maxScore: 13,
        percentage: 100,
      }),
    });

    const result = await submitReadingV2RuntimeAttempt({
      payload,
      context: { surface: 'solo-practice' },
      endpoint: 'https://example.test/reading-v2-submit',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      resultId: 'result-1',
      attemptId: 'attempt-1',
      totalScore: 13,
      maxScore: 13,
      percentage: 100,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/reading-v2-submit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(requestBody.answers[0]).toEqual(expect.objectContaining({
      displayNumber: 7,
      value: 'answer one',
    }));
    expect(JSON.stringify(requestBody)).not.toContain('scoringRule');
  });

  it('fails closed when the endpoint or auth token is missing', async () => {
    await expect(submitReadingV2RuntimeAttempt({
      payload,
      context: { surface: 'solo-practice' },
      endpoint: '',
    })).rejects.toBeInstanceOf(ReadingV2TrustedSubmissionUnavailableError);

    authMock.currentUser.getIdToken.mockResolvedValue(null);

    await expect(submitReadingV2RuntimeAttempt({
      payload,
      context: { surface: 'solo-practice' },
      endpoint: 'https://example.test/reading-v2-submit',
    })).rejects.toBeInstanceOf(ReadingV2TrustedSubmissionAuthError);
  });

  it('surfaces trusted endpoint failures without writing results in the browser', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ message: 'Duplicate submission' }),
    });

    await expect(submitReadingV2RuntimeAttempt({
      payload,
      context: { surface: 'live-session', sessionCode: 'FMQYME' },
      endpoint: 'https://example.test/reading-v2-submit',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('Duplicate submission');
  });
});
