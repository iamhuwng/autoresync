import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuth } from 'firebase/auth';
import {
  createBookHomeworkAssignmentViaWorker,
  HomeworkAssignmentWorkerError,
  createHomeworkAssignmentViaWorker,
} from './homeworkAssignmentClient';

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

const input = {
  materialId: 'ielts-reading-1',
  materialTitle: 'IELTS Reading',
  materialType: 'test' as const,
  materialSkill: 'reading' as const,
  teacherId: 'teacher-1',
  target: { type: 'class' as const, classId: 'class-1', className: 'Class 1' },
  config: {
    timerMinutes: null,
    maxAttempts: null,
    feedbackTiming: 'after_completion' as const,
    lateSubmissionAllowed: false,
  },
  availableFrom: new Date('2026-06-17T00:00:00.000Z'),
  dueDate: new Date('2026-06-18T00:00:00.000Z'),
  instructions: 'Practice.',
  tags: ['reading'],
  contentRef: {
    contentKind: 'ielts_reading' as const,
    contentId: 'ielts-reading-1',
    title: 'IELTS Reading',
  },
};

const bookCommand = {
  assignmentId: 'book-assignment-1',
  operationId: '00000000-0000-4000-8000-000000000086',
  idempotencyKey: 'book-idempotency-1',
  manifestVersionId: 'manifest-1',
  selectedRecipientIds: ['student-1'],
  expectedManifestFingerprint: 'manifest-fingerprint-1',
  expectedPublicationFingerprint: 'publication-fingerprint-1',
  expectedExposureApprovalFingerprint: 'exposure-fingerprint-1',
  expectedPolicyFingerprint: 'policy-fingerprint-1',
} as const;

const bookResponse = {
  status: 'committed',
  assignmentId: bookCommand.assignmentId,
  operationId: bookCommand.operationId,
  state: 'committed',
  visibility: 'committed',
  recipientCount: 1,
  committedRecipientCount: 1,
  revision: 5,
};

describe('homeworkAssignmentClient', () => {
  beforeEach(() => {
    vi.mocked(getAuth).mockReturnValue({
      currentUser: {
        getIdToken: vi.fn().mockResolvedValue('firebase-token'),
      },
    } as any);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts normalized homework assignment payload to the Worker', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      assignmentId: 'homework-1',
      contentRef: input.contentRef,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const assignmentId = await createHomeworkAssignmentViaWorker(input);

    expect(assignmentId).toBe('homework-1');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/homework\/assignments$/);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer firebase-token',
        'Content-Type': 'application/json',
      }),
    }));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({
      contentRef: input.contentRef,
      target: input.target,
      config: input.config,
      availableFrom: Date.parse('2026-06-17T00:00:00.000Z'),
      dueDate: Date.parse('2026-06-18T00:00:00.000Z'),
    });
  });

  it('throws Worker reason code on rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'Publish first',
      reasonCode: 'CONTENT_UNPUBLISHED',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })));

    await expect(createHomeworkAssignmentViaWorker(input)).rejects.toMatchObject({
      reasonCode: 'CONTENT_UNPUBLISHED',
      status: 400,
    });
    await expect(createHomeworkAssignmentViaWorker(input)).rejects.toBeInstanceOf(HomeworkAssignmentWorkerError);
  });

  it('routes Book commands to canonical Worker origin with matching idempotency header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(bookResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createBookHomeworkAssignmentViaWorker(bookCommand, {
      workerOrigin: 'https://book-worker.example.test/',
    });

    expect(result).toEqual(bookResponse);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://book-worker.example.test/book-homework/assignments/book-assignment-1/commands',
      expect.objectContaining({
        method: 'POST',
        signal: undefined,
        headers: expect.objectContaining({
          Authorization: 'Bearer firebase-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': bookCommand.idempotencyKey,
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual(bookCommand);
  });

  it('refreshes token once after an unauthorized canonical response', async () => {
    const getIdToken = vi.fn()
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'unauthorized' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(bookResponse), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, {
      workerOrigin: 'https://book-worker.example.test',
      getIdToken,
    })).resolves.toEqual(bookResponse);

    expect(getIdToken).toHaveBeenNthCalledWith(1, false);
    expect(getIdToken).toHaveBeenNthCalledWith(2, true);
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
    }));
  });

  it('fails without canonical configuration and never falls back to backup Worker', async () => {
    vi.stubEnv('VITE_BOOK_HOMEWORK_WORKER_URL', '');
    vi.stubEnv('VITE_BOOK_DELIVERY_WORKER_URL', '');
    vi.stubEnv('VITE_R2_UPLOAD_WORKER_URL', '');
    vi.stubEnv('VITE_BACKUP_WORKER_URL', 'https://backup-worker.example.test');

    await expect(createBookHomeworkAssignmentViaWorker(bookCommand)).rejects.toMatchObject({
      status: 500,
      reasonCode: 'INVALID_ASSIGNMENT_REQUEST',
    });
  });

  it('passes abort signal and rejects malformed canonical responses', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, {
      workerOrigin: 'https://book-worker.example.test',
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ signal: controller.signal }));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, {
      workerOrigin: 'https://book-worker.example.test',
    })).rejects.toMatchObject({
      status: 200,
      reasonCode: 'INVALID_ASSIGNMENT_REQUEST',
    });
  });
});
