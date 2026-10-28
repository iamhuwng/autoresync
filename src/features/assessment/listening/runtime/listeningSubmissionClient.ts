import { getAuth } from 'firebase/auth';
import { get, ref } from 'firebase/database';
import { database } from '../../../../services/firebase';
import { notifyCommittedEvent } from '../../../../services/notificationProducerClient';
import { toast } from '../../../../components/modern/ToastNotification';
import { resolveListeningSoloDeliveryEndpoint } from './solo/listeningSoloDeliveryClient';
import type { HomeworkSubmission } from '../../../../types/homework.types';

export type ListeningAnswer = string | string[] | Record<string, string>;

export interface ListeningSubmission {
  mode: 'homework' | 'self_study' | 'course_material' | 'live';
  testId: string;
  versionId: string;
  operationId: string;
  answers: Record<number, ListeningAnswer>;
  homeworkId?: string;
  submissionId?: string;
  courseId?: string;
  moduleId?: string;
  sessionCode?: string;
  studentId?: string;
  assignmentId?: string;
  timeElapsed?: number;
  integrity?: unknown;
  attemptsNullified?: boolean;
}

export interface ListeningSubmissionResult {
  resultId: string;
  correctAnswers: number;
  totalQuestions: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
  bandScore: number;
  questionResults: Record<number, boolean>;
}

interface Dependencies {
  endpoint?: string;
  getIdToken?: () => Promise<string | null | undefined>;
  fetchImpl?: typeof fetch;
}

async function post(path: string, body: unknown, dependencies: Dependencies) {
  const token = await (dependencies.getIdToken ?? (() => getAuth().currentUser?.getIdToken()))();
  if (!token) throw new Error('Sign in before submitting this Listening test.');
  const endpoint = (dependencies.endpoint ?? resolveListeningSoloDeliveryEndpoint()).replace(/\/+$/u, '');
  const response = await (dependencies.fetchImpl ?? fetch)(`${endpoint}/listening-delivery/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message ?? result?.code ?? 'Listening submission failed. Please retry.');
  return result;
}

export async function submitListeningTest(input: ListeningSubmission, dependencies: Dependencies = {}): Promise<ListeningSubmissionResult> {
  const result = await post('submit', input, dependencies);
  if (!result || typeof result.resultId !== 'string' || !result.resultId
    || !['correctAnswers', 'totalQuestions', 'totalScore', 'maxScore', 'percentage', 'bandScore']
      .every(field => typeof result[field] === 'number' && Number.isFinite(result[field]))
    || !result.questionResults || typeof result.questionResults !== 'object') {
    throw new Error('The Listening submission service returned an invalid result.');
  }
  // A teacher cannot produce a student's result-completed event on their behalf.
  const events = input.studentId ? [] : [notifyCommittedEvent({ eventKind: 'result-completed', resultId: result.resultId })];
  if (input.mode === 'homework' && input.submissionId) {
    events.push(notifyCommittedEvent({ eventKind: 'homework-submitted', submissionId: input.submissionId }));
  }
  const notices = await Promise.allSettled(events);
  if (notices.some(notice => notice.status === 'rejected' || notice.value.status === 'failed' || notice.value.status === 'unknown')) {
    toast.warning('Your Listening result was saved, but notification delivery could not be confirmed.');
  }
  return result as ListeningSubmissionResult;
}

export async function startListeningHomework(input: { homeworkId: string; operationId: string }, dependencies: Dependencies = {}): Promise<HomeworkSubmission> {
  const result = await post('homework-start', input, dependencies);
  const submission = result?.submission;
  if (!submission || typeof submission.id !== 'string' || !submission.id || submission.homeworkId !== input.homeworkId
    || !['in_progress', 'submitted', 'graded'].includes(submission.status) || !Number.isSafeInteger(submission.startedAt)) {
    throw new Error('The Listening homework service returned an invalid attempt.');
  }
  return submission as HomeworkSubmission;
}

export async function pinListeningLiveTest(input: { sessionCode: string; testId: string; versionId: string }, dependencies: Dependencies = {}): Promise<{ startTime: number; runId: string }> {
  const pin = await post('live-pin', { ...input, operationId: crypto.randomUUID() }, dependencies);
  if (!pin || !Number.isSafeInteger(pin.startTime) || typeof pin.runId !== 'string') throw new Error('The Listening test could not be prepared.');
  return pin;
}

export async function submitListeningLiveTest(input: {
  sessionCode: string; testId: string; answers?: Record<number, ListeningAnswer>;
  studentId?: string; assignmentId?: string; timeElapsed?: number; integrity?: unknown;
}): Promise<ListeningSubmissionResult> {
  const snapshot = await get(ref(database, `game_sessions/${input.sessionCode}/listeningTestPin`));
  const pin = snapshot.val();
  if (!pin || pin.testId !== input.testId || typeof pin.versionId !== 'string' || typeof pin.runId !== 'string') {
    throw new Error('The Listening test has no verified published version. Ask the teacher to restart it.');
  }
  return submitListeningTest({
    mode: 'live', testId: input.testId, versionId: pin.versionId,
    operationId: `live__${pin.runId}__${input.studentId ?? getAuth().currentUser?.uid ?? ''}`,
    ...input, answers: input.answers ?? {},
  });
}
