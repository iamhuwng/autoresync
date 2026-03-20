import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requestIntegrityLogRefresh,
  requestTeacherForceSubmit,
  resetStudentSessionSubmission,
} from './sessionStudentControlService';
import {
  deleteStudentSessionResults,
  deleteTestResult,
} from './testResults.service';

const { refMock, updateMock } = vi.hoisted(() => ({
  refMock: vi.fn((_database, path: string) => path),
  updateMock: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  ref: refMock,
  update: updateMock,
}));

vi.mock('./firebase', () => ({
  database: {},
}));

vi.mock('./testResults.service', () => ({
  deleteStudentSessionResults: vi.fn(),
  deleteTestResult: vi.fn(),
}));

describe('sessionStudentControlService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes an explicit teacher force-submit request to the player record', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    await requestTeacherForceSubmit('ABC123', 'student-1');

    expect(refMock).toHaveBeenCalledWith({}, 'game_sessions/ABC123/players/student-1');
    expect(updateMock).toHaveBeenCalledWith(
      'game_sessions/ABC123/players/student-1',
      expect.objectContaining({
        hasCompletedTest: true,
        forceSubmittedBy: 'teacher',
        forceSubmitRequestedAt: 1_700_000_000_000,
        completedAt: 1_700_000_000_000,
      }),
    );
  });

  it('writes a session-level integrity refresh request for active student clients', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_250);

    await requestIntegrityLogRefresh('ABC123');

    expect(refMock).toHaveBeenCalledWith({}, 'game_sessions/ABC123');
    expect(updateMock).toHaveBeenCalledWith(
      'game_sessions/ABC123',
      {
        integrityRefreshRequestedAt: 1_700_000_000_250,
      },
    );
  });

  it('resets the live submission and deletes the linked permanent result when present', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_500);
    vi.mocked(deleteTestResult).mockResolvedValue(undefined);
    vi.mocked(deleteStudentSessionResults).mockResolvedValue(0);

    const result = await resetStudentSessionSubmission('ABC123', 'student-2', 'result-9');

    expect(deleteTestResult).toHaveBeenCalledWith('result-9');
    expect(deleteStudentSessionResults).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      'game_sessions/ABC123/players/student-2',
      expect.objectContaining({
        hasCompletedTest: false,
        isSubmitted: false,
        submittedAt: null,
        submittedBy: null,
        forceSubmittedBy: null,
        forceSubmitRequestedAt: null,
        latestResultId: null,
        submissionResetAt: 1_700_000_000_500,
      }),
    );
    expect(result).toEqual({
      resetAt: 1_700_000_000_500,
      deletedResultCount: 1,
    });
  });

  it('falls back to deleting session-scoped results when the direct result link is unavailable', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_001_000);
    vi.mocked(deleteStudentSessionResults).mockResolvedValue(2);

    const result = await resetStudentSessionSubmission('ABC123', 'student-3');

    expect(deleteTestResult).not.toHaveBeenCalled();
    expect(deleteStudentSessionResults).toHaveBeenCalledWith('student-3', 'ABC123');
    expect(result).toEqual({
      resetAt: 1_700_000_001_000,
      deletedResultCount: 2,
    });
  });
});
