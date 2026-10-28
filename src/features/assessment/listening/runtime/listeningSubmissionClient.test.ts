import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startListeningHomework, submitListeningTest } from './listeningSubmissionClient';

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../../../../services/firebase', () => ({ database: {} }));
vi.mock('../../../../services/notificationProducerClient', () => ({ notifyCommittedEvent: notify }));
vi.mock('../../../../components/modern/ToastNotification', () => ({ toast: { warning: vi.fn() } }));

const input = { mode: 'homework' as const, testId: 'test-1', versionId: 'version-1', operationId: 'attempt-1',
  homeworkId: 'hw-1', submissionId: 'sub-1', answers: { 1: ['A', 'B'], 2: { first: 'name' } } };
const result = { resultId: 'result-1', correctAnswers: 2, totalQuestions: 2, totalScore: 2, maxScore: 2,
  percentage: 100, bandScore: 9, questionResults: { 1: true, 2: true } };

describe('Listening trusted submission client', () => {
  beforeEach(() => { vi.clearAllMocks(); notify.mockResolvedValue({ status: 'written' }); });

  it('returns a server-pinned homework attempt without announcing a submission', async () => {
    const submission = { id: 'attempt-1', homeworkId: 'hw-1', startedAt: 1234, status: 'in_progress', listeningVersionId: 'version-2' };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ submission })));
    await expect(startListeningHomework({ homeworkId: 'hw-1', operationId: 'begin-1' },
      { endpoint: 'https://upload.example', getIdToken: async () => 'token', fetchImpl })).resolves.toEqual(submission);
    expect(notify).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledWith('https://upload.example/listening-delivery/homework-start', expect.objectContaining({
      body: JSON.stringify({ homeworkId: 'hw-1', operationId: 'begin-1' }),
    }));
  });

  it('preserves typed answers and announces only the committed result and submission', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    await expect(submitListeningTest(input, { endpoint: 'https://upload.example', getIdToken: async () => 'token', fetchImpl }))
      .resolves.toEqual(result);
    expect(fetchImpl).toHaveBeenCalledWith('https://upload.example/listening-delivery/submit', expect.objectContaining({
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    }));
    expect(notify.mock.calls).toEqual([[{ eventKind: 'result-completed', resultId: 'result-1' }],
      [{ eventKind: 'homework-submitted', submissionId: 'sub-1' }]]);
  });

  it('does not announce or report completion after a rejected or malformed response', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code: 'version_mismatch' }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ resultId: 'result-1' })));
    const dependencies = { endpoint: 'https://upload.example', getIdToken: async () => 'token', fetchImpl };
    await expect(submitListeningTest(input, dependencies)).rejects.toThrow('version_mismatch');
    await expect(submitListeningTest(input, dependencies)).rejects.toThrow('invalid result');
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not impersonate a student notification when a teacher submits saved live answers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    await submitListeningTest({ mode: 'live', testId: 'test-1', versionId: 'version-1', operationId: 'live-1',
      sessionCode: 'SESSION123', studentId: 'student-1', answers: {} },
    { endpoint: 'https://upload.example', getIdToken: async () => 'teacher-token', fetchImpl });
    expect(notify).not.toHaveBeenCalled();
  });
});
