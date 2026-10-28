import { get, ref, update } from 'firebase/database';
// @ts-ignore - firebase.js is a JS file
import { database } from './firebase';
import { submitListeningLiveTest } from '../features/assessment/listening/runtime/listeningSubmissionClient';
import {
  deleteStudentSessionResults,
  deleteTestResult,
} from './testResults.service';

export async function requestTeacherForceSubmit(
  sessionCode: string,
  studentId: string
): Promise<number> {
  const requestedAt = Date.now();
  const pin = (await get(ref(database, `game_sessions/${sessionCode}/listeningTestPin`))).val();
  if (pin) {
    await submitListeningLiveTest({ sessionCode, testId: pin.testId, studentId });
    return requestedAt;
  }
  const playerRef = ref(database, `game_sessions/${sessionCode}/players/${studentId}`);

  await update(playerRef, {
    hasCompletedTest: true,
    forceSubmittedBy: 'teacher',
    forceSubmitRequestedAt: requestedAt,
    completedAt: requestedAt,
  });

  return requestedAt;
}

export async function requestIntegrityLogRefresh(
  sessionCode: string,
): Promise<number> {
  const requestedAt = Date.now();
  const sessionRef = ref(database, `game_sessions/${sessionCode}`);

  await update(sessionRef, {
    integrityRefreshRequestedAt: requestedAt,
  });

  return requestedAt;
}

export async function resetStudentSessionSubmission(
  sessionCode: string,
  studentId: string,
  latestResultId?: string | null
): Promise<{ resetAt: number; deletedResultCount: number }> {
  let deletedResultCount = 0;

  if (latestResultId) {
    try {
      await deleteTestResult(latestResultId);
      deletedResultCount = 1;
    } catch (error) {
      console.warn(
        `[SessionStudentControl] Failed to delete direct result ${latestResultId}, falling back to session scan:`,
        error
      );
    }
  }

  if (deletedResultCount === 0) {
    deletedResultCount = await deleteStudentSessionResults(studentId, sessionCode);
  }

  const resetAt = Date.now();
  const playerRef = ref(database, `game_sessions/${sessionCode}/players/${studentId}`);

  await update(playerRef, {
    hasCompletedTest: false,
    isSubmitted: false,
    submittedAt: null,
    submittedBy: null,
    forceSubmittedBy: null,
    forceSubmitRequestedAt: null,
    completedAt: null,
    correctCount: null,
    totalQuestions: null,
    percentage: null,
    bandScore: null,
    score: null,
    maxScore: null,
    latestResultId: null,
    resultId: null,
    submissionResetAt: resetAt,
  });

  return { resetAt, deletedResultCount };
}
