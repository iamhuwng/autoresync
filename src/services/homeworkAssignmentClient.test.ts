import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuth } from 'firebase/auth';
import {
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

describe('homeworkAssignmentClient', () => {
  beforeEach(() => {
    vi.mocked(getAuth).mockReturnValue({
      currentUser: {
        getIdToken: vi.fn().mockResolvedValue('firebase-token'),
      },
    } as any);
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
});
