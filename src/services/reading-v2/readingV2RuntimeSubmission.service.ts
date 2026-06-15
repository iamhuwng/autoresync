// Reading V2 runtime submission client: sends projection-bound answers to a trusted endpoint only.
// The browser must not fetch canonical snapshots, answer keys, or write scored results directly.
import { auth } from '../firebase';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import type { ReadingV2LaunchSurface } from './readingV2LaunchIntegration.service';
import type { IntegrityReport } from '../../types/integrity.types';

export type ReadingV2ClientAnswerValue = string | readonly string[];

export interface ReadingV2RuntimeSubmissionAnswer {
  readonly interactionId: string;
  readonly taskGroupId: string;
  readonly visibleNumber: number;
  readonly value: ReadingV2ClientAnswerValue;
}

export interface ReadingV2RuntimeSubmissionPayload {
  readonly projectionId: string;
  readonly sourceSnapshotVersionId: string;
  readonly materialId?: string;
  readonly answers: readonly ReadingV2RuntimeSubmissionAnswer[];
  readonly integrityReport?: IntegrityReport | null;
}

export interface ReadingV2RuntimeSubmissionContext {
  readonly surface: ReadingV2LaunchSurface;
  readonly sessionCode?: string;
  readonly homeworkId?: string;
  readonly courseId?: string;
  readonly classId?: string;
  readonly moduleId?: string;
  readonly assignmentId?: string;
  readonly sourceName?: string;
}

export interface ReadingV2TrustedSubmissionRequest {
  readonly deliveryEngine: typeof READING_V2_ENGINE;
  readonly projectionId: string;
  readonly sourceSnapshotVersionId: string;
  readonly materialId?: string;
  readonly answers: readonly {
    readonly interactionId: string;
    readonly taskGroupId: string;
    readonly displayNumber: number;
    readonly value: ReadingV2ClientAnswerValue;
  }[];
  readonly integrityReport?: IntegrityReport | null;
  readonly context: ReadingV2RuntimeSubmissionContext;
}

export interface ReadingV2RuntimeSubmissionResult {
  readonly resultId: string;
  readonly attemptId?: string;
  readonly totalScore?: number;
  readonly maxScore?: number;
  readonly percentage?: number;
}

export class ReadingV2TrustedSubmissionUnavailableError extends Error {
  constructor() {
    super('Trusted Reading V2 submission endpoint is not configured.');
    this.name = 'ReadingV2TrustedSubmissionUnavailableError';
  }
}

export class ReadingV2TrustedSubmissionAuthError extends Error {
  constructor() {
    super('Sign in is required before submitting Reading V2 answers.');
    this.name = 'ReadingV2TrustedSubmissionAuthError';
  }
}

export const buildDefaultReadingV2SubmissionEndpoint = (input: {
  readonly projectId?: string;
  readonly region?: string;
  readonly useLocalEmulator?: boolean;
  readonly emulatorOrigin?: string;
}): string => {
  const projectId = input.projectId?.trim();
  const region = input.region?.trim() || 'us-central1';

  if (!projectId || !input.useLocalEmulator) {
    return '';
  }

  const emulatorOrigin = input.emulatorOrigin?.trim() || 'http://127.0.0.1:5001';
  return `${emulatorOrigin}/${projectId}/${region}/readingV2Submit`;
};

export const READING_V2_SUBMISSION_ENDPOINT =
  typeof import.meta.env.VITE_READING_V2_SUBMISSION_ENDPOINT === 'string'
    && import.meta.env.VITE_READING_V2_SUBMISSION_ENDPOINT.trim().length > 0
    ? import.meta.env.VITE_READING_V2_SUBMISSION_ENDPOINT.trim()
    : buildDefaultReadingV2SubmissionEndpoint({
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      useLocalEmulator: import.meta.env.DEV,
      emulatorOrigin: import.meta.env.VITE_READING_V2_SUBMISSION_EMULATOR_ORIGIN,
    });

export const isReadingV2RuntimeSubmissionConfigured = (
  endpoint = READING_V2_SUBMISSION_ENDPOINT,
): boolean => endpoint.trim().length > 0;

export const buildReadingV2TrustedSubmissionRequest = (input: {
  readonly payload: ReadingV2RuntimeSubmissionPayload;
  readonly context: ReadingV2RuntimeSubmissionContext;
}): ReadingV2TrustedSubmissionRequest => ({
  deliveryEngine: READING_V2_ENGINE,
  projectionId: input.payload.projectionId,
  sourceSnapshotVersionId: input.payload.sourceSnapshotVersionId,
  materialId: input.payload.materialId,
  answers: input.payload.answers.map((answer) => ({
    interactionId: answer.interactionId,
    taskGroupId: answer.taskGroupId,
    displayNumber: answer.visibleNumber,
    value: answer.value,
  })),
  integrityReport: input.payload.integrityReport ?? null,
  context: input.context,
});

const readResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const parseSubmissionResponse = (body: unknown): ReadingV2RuntimeSubmissionResult => {
  const record = body && typeof body === 'object'
    ? body as {
      resultId?: unknown;
      attemptId?: unknown;
      totalScore?: unknown;
      maxScore?: unknown;
      percentage?: unknown;
    }
    : {};

  if (typeof record.resultId !== 'string' || record.resultId.trim().length === 0) {
    throw new Error('Trusted Reading V2 submission endpoint returned no result id.');
  }

  return {
    resultId: record.resultId,
    attemptId: typeof record.attemptId === 'string' ? record.attemptId : undefined,
    totalScore: typeof record.totalScore === 'number' ? record.totalScore : undefined,
    maxScore: typeof record.maxScore === 'number' ? record.maxScore : undefined,
    percentage: typeof record.percentage === 'number' ? record.percentage : undefined,
  };
};

export const submitReadingV2RuntimeAttempt = async (input: {
  readonly payload: ReadingV2RuntimeSubmissionPayload;
  readonly context: ReadingV2RuntimeSubmissionContext;
  readonly endpoint?: string;
  readonly fetchImpl?: typeof fetch;
  readonly getIdToken?: () => Promise<string | null | undefined>;
}): Promise<ReadingV2RuntimeSubmissionResult> => {
  const endpoint = input.endpoint ?? READING_V2_SUBMISSION_ENDPOINT;

  if (!isReadingV2RuntimeSubmissionConfigured(endpoint)) {
    throw new ReadingV2TrustedSubmissionUnavailableError();
  }

  const token = await (
    input.getIdToken
      ? input.getIdToken()
      : auth.currentUser?.getIdToken()
  );

  if (!token) {
    throw new ReadingV2TrustedSubmissionAuthError();
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildReadingV2TrustedSubmissionRequest(input)),
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body
      ? String((body as { message?: unknown }).message)
      : 'Trusted Reading V2 submission failed.';
    throw new Error(message);
  }

  return parseSubmissionResponse(body);
};
