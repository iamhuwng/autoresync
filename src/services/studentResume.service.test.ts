import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageHarness = vi.hoisted(() => {
  const data = new Map<string, unknown>();

  return {
    data,
    reset: () => data.clear(),
  };
});

const getMock = vi.hoisted(() => vi.fn());
const refMock = vi.hoisted(() => vi.fn((_database: unknown, path: string) => ({ path })));
const getSubmissionByIdMock = vi.hoisted(() => vi.fn());
const setPlayerDataMock = vi.hoisted(() => vi.fn());

vi.mock('../core/platform/storage', () => ({
  storage: {
    get: vi.fn(async (key: string) => storageHarness.data.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      storageHarness.data.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      storageHarness.data.delete(key);
    }),
    has: vi.fn(async (key: string) => storageHarness.data.has(key)),
  },
}));

vi.mock('firebase/database', () => ({
  get: getMock,
  ref: refMock,
}));

vi.mock('./firebase', () => ({
  database: {},
}));

vi.mock('./homeworkSubmissionService', () => ({
  getSubmissionById: getSubmissionByIdMock,
}));

vi.mock('./sessionService', () => ({
  sessionService: {
    setPlayerData: setPlayerDataMock,
  },
}));

describe('studentResumeService', () => {
  beforeEach(() => {
    storageHarness.reset();
    vi.clearAllMocks();
  });

  it('resolves an active live session and restores session identity', async () => {
    const { studentResumeService } = await import('./studentResume.service');

    await studentResumeService.saveLiveSessionResume({
      studentId: 'student-1',
      playerId: 'student-1',
      playerName: 'Student One',
      sessionCode: 'LIVE123',
    });

    getMock.mockResolvedValue({
      val: () => ({ status: 'in-progress' }),
    });

    const result = await studentResumeService.resolveResume('student-1');

    expect(refMock).toHaveBeenCalledWith({}, 'game_sessions/LIVE123');
    expect(setPlayerDataMock).toHaveBeenCalledWith('student-1', 'Student One', 'LIVE123');
    expect(result).toEqual({
      route: 'STUDENT_WAITING',
      params: { gameSessionId: 'LIVE123' },
      state: { autoResume: true },
    });
  });

  it('resolves an in-progress homework practice attempt', async () => {
    const { studentResumeService } = await import('./studentResume.service');

    await studentResumeService.savePracticeResume({
      studentId: 'student-1',
      materialId: 'material-1',
      locationState: {
        isHomework: true,
        homeworkId: 'hw-1',
        submissionId: 'sub-1',
        teacherId: 'teacher-1',
      },
    });

    getSubmissionByIdMock.mockResolvedValue({
      id: 'sub-1',
      studentId: 'student-1',
      homeworkId: 'hw-1',
      status: 'in_progress',
    });

    const result = await studentResumeService.resolveResume('student-1');

    expect(result).toEqual({
      route: 'STUDENT_PRACTICE',
      params: { materialId: 'material-1' },
      state: {
        isHomework: true,
        homeworkId: 'hw-1',
        submissionId: 'sub-1',
        teacherId: 'teacher-1',
        autoResume: true,
      },
    });
  });

  it('rejects stale solo practice resume records without local progress', async () => {
    const { studentResumeService } = await import('./studentResume.service');

    storageHarness.data.set('student_activity_resume_v1', {
      kind: 'practice',
      studentId: 'student-1',
      materialId: 'material-1',
      locationState: {
        courseId: 'course-1',
      },
      updatedAt: Date.now() - (8 * 24 * 60 * 60 * 1000),
    });

    const result = await studentResumeService.resolveResume('student-1');

    expect(result).toBeNull();
    expect(storageHarness.data.has('student_activity_resume_v1')).toBe(false);
  });

  it('rejects recent solo practice pointers that are not marked as auto-resume capable', async () => {
    const { studentResumeService } = await import('./studentResume.service');

    await studentResumeService.savePracticeResume({
      studentId: 'student-1',
      materialId: 'material-1',
      locationState: {
        courseId: 'course-1',
        moduleId: 'module-1',
      },
    });

    const result = await studentResumeService.resolveResume('student-1');

    expect(result).toBeNull();
  });

  it('allows a recent supported solo practice pointer without saved answers yet', async () => {
    const { studentResumeService } = await import('./studentResume.service');

    await studentResumeService.savePracticeResume({
      studentId: 'student-1',
      materialId: 'material-1',
      locationState: {
        courseId: 'course-1',
        moduleId: 'module-1',
        supportsAutoResume: true,
      },
    });

    const result = await studentResumeService.resolveResume('student-1');

    expect(result).toEqual({
      route: 'STUDENT_PRACTICE',
      params: { materialId: 'material-1' },
      state: {
        courseId: 'course-1',
        moduleId: 'module-1',
        supportsAutoResume: true,
        autoResume: true,
      },
    });
  });
});
