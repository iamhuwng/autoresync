import { get, ref } from 'firebase/database';
import type { RouteName, RouteParams } from '../constants/routes';
import { storage } from '../core/platform/storage';
import { database } from './firebase';
import { getSubmissionById } from './homeworkSubmissionService';

const STUDENT_RESUME_KEY = 'student_activity_resume_v1';
const LIVE_RESUME_TTL_MS = 12 * 60 * 60 * 1000;
const PRACTICE_RESUME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type PracticeLocationState = {
  isHomework?: boolean;
  courseId?: string;
  moduleId?: string;
  courseName?: string;
  homeworkId?: string;
  submissionId?: string;
  teacherId?: string;
  dueDate?: number;
  lateSubmissionAllowed?: boolean;
  timerMinutes?: number | null;
  maxAttempts?: number | null;
  startedAt?: number;
  resumeFrom?: unknown;
  autoResume?: boolean;
  supportsAutoResume?: boolean;
  context?: {
    type: string;
    source: { type: string; id: string; name: string };
  };
};

interface ResumeBase {
  studentId: string;
  updatedAt: number;
}

interface LiveSessionResume extends ResumeBase {
  kind: 'live_session';
  playerId: string;
  playerName: string;
  sessionCode: string;
}

interface PracticeResume extends ResumeBase {
  kind: 'practice';
  materialId: string;
  locationState: PracticeLocationState;
}

type StudentResumeRecord = LiveSessionResume | PracticeResume;

export interface ResolvedStudentResume {
  route: RouteName;
  params?: RouteParams;
  state?: Record<string, unknown>;
}

function isHomeworkPractice(
  locationState: PracticeLocationState,
): locationState is PracticeLocationState & { homeworkId: string; submissionId: string } {
  return Boolean(locationState.isHomework && locationState.homeworkId && locationState.submissionId);
}

function sanitizePracticeLocationState(locationState: PracticeLocationState): PracticeLocationState {
  return {
    ...locationState,
    autoResume: true,
  };
}

async function hasLocalPracticeProgress(materialId: string, studentId: string): Promise<boolean> {
  const soloProgressKey = `solo_progress_${materialId}_${studentId}`;
  const writingProgressKey = `writing_practice_${materialId}_${studentId}`;
  const [hasSoloProgress, hasWritingProgress] = await Promise.all([
    storage.has(soloProgressKey),
    storage.has(writingProgressKey),
  ]);

  return hasSoloProgress || hasWritingProgress;
}

async function readResumeRecord(): Promise<StudentResumeRecord | null> {
  const record = await storage.get<StudentResumeRecord>(STUDENT_RESUME_KEY);
  if (!record || typeof record !== 'object' || !('kind' in record)) {
    return null;
  }
  return record;
}

function isExpired(record: StudentResumeRecord): boolean {
  const ttl = record.kind === 'live_session' ? LIVE_RESUME_TTL_MS : PRACTICE_RESUME_TTL_MS;
  return Date.now() - record.updatedAt > ttl;
}

export const studentResumeService = {
  async saveLiveSessionResume(input: {
    studentId: string;
    playerId: string;
    playerName: string;
    sessionCode: string;
  }): Promise<void> {
    const record: LiveSessionResume = {
      kind: 'live_session',
      studentId: input.studentId,
      playerId: input.playerId,
      playerName: input.playerName,
      sessionCode: input.sessionCode,
      updatedAt: Date.now(),
    };

    await storage.set(STUDENT_RESUME_KEY, record);
  },

  async savePracticeResume(input: {
    studentId: string;
    materialId: string;
    locationState: PracticeLocationState;
  }): Promise<void> {
    const record: PracticeResume = {
      kind: 'practice',
      studentId: input.studentId,
      materialId: input.materialId,
      locationState: sanitizePracticeLocationState(input.locationState),
      updatedAt: Date.now(),
    };

    await storage.set(STUDENT_RESUME_KEY, record);
  },

  async clearResume(): Promise<void> {
    await storage.remove(STUDENT_RESUME_KEY);
  },

  async resolveResume(studentId: string): Promise<ResolvedStudentResume | null> {
    const record = await readResumeRecord();
    if (!record) {
      return null;
    }

    if (record.studentId !== studentId) {
      await this.clearResume();
      return null;
    }

    if (isExpired(record)) {
      await this.clearResume();
      return null;
    }

    if (record.kind === 'live_session') {
      const snapshot = await get(ref(database, `game_sessions/${record.sessionCode}`));
      const session = snapshot.val();
      const isActive = session && ['waiting', 'in-progress'].includes(session.status);

      if (!isActive) {
        await this.clearResume();
        return null;
      }

      const { sessionService } = await import('./sessionService');
      sessionService.setPlayerData(record.playerId, record.playerName, record.sessionCode);

      return {
        route: 'STUDENT_WAITING',
        params: { gameSessionId: record.sessionCode },
        state: { autoResume: true },
      };
    }

    if (isHomeworkPractice(record.locationState)) {
      const submission = await getSubmissionById(record.locationState.submissionId);
      const isValidSubmission = submission
        && submission.studentId === studentId
        && submission.homeworkId === record.locationState.homeworkId
        && submission.status === 'in_progress';

      if (!isValidSubmission) {
        await this.clearResume();
        return null;
      }
    } else {
      if (record.locationState.supportsAutoResume !== true) {
        await this.clearResume();
        return null;
      }

      const hasProgress = await hasLocalPracticeProgress(record.materialId, studentId);
      const isRecentPractice = Date.now() - record.updatedAt <= LIVE_RESUME_TTL_MS;
      if (!hasProgress && !isRecentPractice) {
        await this.clearResume();
        return null;
      }
    }

    return {
      route: 'STUDENT_PRACTICE',
      params: { materialId: record.materialId },
      state: sanitizePracticeLocationState(record.locationState),
    };
  },
};
