import {
  createBookRouter,
  type BookRouteHandlerMap,
  type BookRouterEnv,
  type FirebaseVerifier,
} from '../book-router.ts';
import {
  FirebaseBookResultReadRepository,
  type BookResultReadRepository,
} from './repository.ts';
import { bookResultReadRouteDescriptors } from './route.ts';
import {
  bookResultGroupKey,
  type BookResultAttemptSummary,
  type BookResultReadProjection,
} from './types.ts';
import { createBookResultReadWorkerHandlers } from './worker.ts';

const STUDENT_UID = 'x3hDfjYVN7cJtSbwq0ChIjl1Bk62';
const TEACHER_UID = 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2';
const BOOK_ID = 'book-browser-proof';
const ACTIVITY_ID = 'activity-browser-proof';
const HOMEWORK_ID = 'homework-browser-proof';

export interface Ticket77PreviewEnv extends BookRouterEnv {
  readonly TICKET77_STUDENT_UID: string;
  readonly TICKET77_TEACHER_UID: string;
  readonly TICKET77_HOMEWORK_ID: string;
}

export interface Ticket77PreviewWorkerOptions {
  readonly firebaseVerifier?: FirebaseVerifier;
}

const attempt = (input: {
  readonly attemptId: string;
  readonly resultId: string;
  readonly completionId: string;
  readonly attemptNumber: number;
  readonly contextId: string;
  readonly placementId: string;
  readonly surface: 'solo' | 'homework';
  readonly deliveryId: string;
  readonly submittedAt: string;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly availability: 'deleted' | 'replaced';
  readonly evaluation: BookResultAttemptSummary['evaluation'];
  readonly feedback: BookResultAttemptSummary['feedback'];
  readonly response: unknown;
}): BookResultReadProjection => {
  const summary: BookResultAttemptSummary = {
    schemaVersion: 1,
    attemptId: input.attemptId,
    resultId: input.resultId,
    completionId: input.completionId,
    recipientId: STUDENT_UID,
    studentId: STUDENT_UID,
    activityId: ACTIVITY_ID,
    contextId: input.contextId,
    placementId: input.placementId,
    bindingId: `binding-browser-proof-${input.surface}`,
    bindingRevision: input.attemptNumber + 2,
    activityVersionId: 'activity-browser-proof@7',
    activityVersion: 7,
    interactionId: `interaction-browser-proof-${input.surface}`,
    attemptNumber: input.attemptNumber,
    surface: input.surface,
    deliveryContextId: input.contextId,
    deliveryId: input.deliveryId,
    ownerId: input.surface === 'homework' ? TEACHER_UID : STUDENT_UID,
    homeworkId: input.surface === 'homework' ? HOMEWORK_ID : null,
    pageGroupKeys: [`page-group-${input.surface}`],
    sourceProvenance: [{
      sourceKey: input.sourceKey,
      sourceVersionId: input.sourceVersionId,
      pages: [3, 4],
    }],
    sources: [{
      sourceKey: input.sourceKey,
      componentId: input.sourceKey,
      sourceVersionId: input.sourceVersionId,
      pages: [3, 4],
      availability: input.availability,
      available: false,
      displayOnly: true,
    }],
    sourceAvailability: input.availability,
    sourceAvailable: false,
    createdAt: input.submittedAt,
    submittedAt: input.submittedAt,
    completedAt: input.submittedAt,
    resultStatus: 'submitted',
    evaluationStatus: input.evaluation.status,
    completionStatus: 'completed',
    completion: {
      completionId: input.completionId,
      attemptId: input.attemptId,
      resultId: input.resultId,
      status: 'completed',
      contextId: input.contextId,
      placementId: input.placementId,
      activityVersionId: 'activity-browser-proof@7',
      activityVersion: 7,
      createdAt: input.submittedAt,
    },
    evaluation: input.evaluation,
    feedback: input.feedback,
    attemptLimit: input.surface === 'homework' ? 2 : 3,
    attemptsUsed: 1,
    attemptsRemaining: input.surface === 'homework' ? 1 : 2,
    bookId: BOOK_ID,
  };
  return {
    schemaVersion: 1,
    bookId: BOOK_ID,
    summary,
    detail: { ...summary, response: input.response },
  };
};

const SOLO = attempt({
  attemptId: 'attempt-solo-1',
  resultId: 'result-solo-1',
  completionId: 'completion-solo-1',
  attemptNumber: 1,
  contextId: 'solo-browser-proof',
  placementId: 'placement-solo-browser-proof',
  surface: 'solo',
  deliveryId: 'delivery-solo-browser-proof',
  submittedAt: '2026-07-30T08:30:00.000Z',
  sourceKey: 'component-solo-browser-proof',
  sourceVersionId: 'source-version-deleted',
  availability: 'deleted',
  evaluation: { status: 'pending_review' },
  feedback: { release: 'withheld', available: false },
  response: { choice: 'Solo response retained after source deletion' },
});

const HOMEWORK = attempt({
  attemptId: 'attempt-homework-1',
  resultId: 'result-homework-1',
  completionId: 'completion-homework-1',
  attemptNumber: 2,
  contextId: HOMEWORK_ID,
  placementId: 'placement-homework-browser-proof',
  surface: 'homework',
  deliveryId: 'delivery-homework-browser-proof',
  submittedAt: '2026-07-31T09:45:00.000Z',
  sourceKey: 'component-homework-browser-proof',
  sourceVersionId: 'source-version-replaced',
  availability: 'replaced',
  evaluation: {
    status: 'graded',
    score: { earnedScore: 8, maximumScore: 10, displayScore: '8 / 10' },
  },
  feedback: {
    release: 'released',
    available: true,
    text: 'Your explanation used the evidence well.',
    releasedAt: '2026-07-31T10:00:00.000Z',
  },
  response: { choice: 'Homework response visible to its current teacher' },
});

const previewRows = new Map<string, unknown>();

const writePreviewValue = async (path: string, value: unknown): Promise<void> => {
  previewRows.set(path, structuredClone(value));
};

const readPreviewValue = async (path: string): Promise<unknown> => {
  const direct = previewRows.get(path);
  if (direct !== undefined) return structuredClone(direct);
  const prefix = `${path}/`;
  const descendants = [...previewRows.entries()]
    .filter(([candidate]) => candidate.startsWith(prefix));
  if (descendants.length === 0) return null;
  const root: Record<string, unknown> = {};
  for (const [candidate, value] of descendants) {
    const parts = candidate.slice(prefix.length).split('/');
    let cursor = root;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        cursor[part] = structuredClone(value);
      } else {
        const existing = cursor[part];
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
          cursor[part] = {};
        }
        cursor = cursor[part] as Record<string, unknown>;
      }
    });
  }
  return root;
};

const firebaseRepository = new FirebaseBookResultReadRepository({
  env: {
    FIREBASE_DB_URL: 'https://ticket77-preview.invalid',
    readDatabaseValue: readPreviewValue,
    writeDatabaseValue: writePreviewValue,
  },
  getAccessToken: async () => 'ticket77-preview-local-adapter',
});
const seeded = (async () => {
  await firebaseRepository.persistProjection({ projection: SOLO });
  await firebaseRepository.persistProjection({ projection: HOMEWORK });
})();

const repository: BookResultReadRepository = {
  async listGroupSummaries(input) {
    await seeded;
    return firebaseRepository.listGroupSummaries(input);
  },
  async listAttemptSummaries(input) {
    await seeded;
    return firebaseRepository.listAttemptSummaries(input);
  },
  async readResultDetail(input) {
    await seeded;
    return firebaseRepository.readResultDetail(input);
  },
};

const routeHandlers = (env: Ticket77PreviewEnv): BookRouteHandlerMap => {
  const handlers = createBookResultReadWorkerHandlers({
    repository,
    resolveViewerRole: ({ uid }) => {
      if (uid === env.TICKET77_STUDENT_UID) return 'student';
      if (uid === env.TICKET77_TEACHER_UID) return 'teacher';
      return null;
    },
    resolveHomeworkAuthorities: ({ viewerUid, homeworkIds }) => (
      Object.fromEntries(homeworkIds.map((homeworkId) => [
        homeworkId,
        homeworkId === env.TICKET77_HOMEWORK_ID
          && viewerUid === env.TICKET77_TEACHER_UID
          ? {
            homeworkId,
            ownerId: env.TICKET77_TEACHER_UID,
            studentIds: [env.TICKET77_STUDENT_UID],
            status: 'current' as const,
          }
          : null,
      ]))
    ),
  });

  const adapt = (
    handler: (input: Record<string, unknown>) => unknown,
  ) => async (input: {
    request: Request;
    env: BookRouterEnv;
    uid: string;
    params: Readonly<Record<string, string>>;
  }) => handler({
    request: input.request,
    env: input.env,
    uid: input.uid,
    ...input.params,
    ...(input.params.homeworkId ? { contextKind: 'homework' } : {}),
  });

  return {
    'bookResultRead.resultSummary': adapt(handlers.resultSummary),
    'bookResultRead.groupedAttempt': adapt(handlers.groupedAttempt),
    'bookResultRead.resultDetail': adapt(handlers.resultDetail),
  };
};

export const createTicket77PreviewWorker = (
  options: Ticket77PreviewWorkerOptions = {},
): ExportedHandler<Ticket77PreviewEnv> => ({
  async fetch(request, env) {
    const expected = {
      student: env.TICKET77_STUDENT_UID,
      teacher: env.TICKET77_TEACHER_UID,
      homework: env.TICKET77_HOMEWORK_ID,
    };
    if (expected.student !== STUDENT_UID
      || expected.teacher !== TEACHER_UID
      || expected.homework !== HOMEWORK_ID) {
      return new Response(JSON.stringify({ code: 'ticket77_preview_scope_invalid' }), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    const router = createBookRouter({
      manifest: bookResultReadRouteDescriptors,
      handlers: routeHandlers(env),
      ...(options.firebaseVerifier ? { firebaseVerifier: options.firebaseVerifier } : {}),
    });
    return await router.fetch(request, env)
      ?? new Response(JSON.stringify({ code: 'book_route_not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
  },
});

export const ticket77PreviewFixture = Object.freeze({
  bookId: BOOK_ID,
  studentId: STUDENT_UID,
  teacherId: TEACHER_UID,
  homeworkId: HOMEWORK_ID,
  activityId: ACTIVITY_ID,
  groupKey: bookResultGroupKey(STUDENT_UID, ACTIVITY_ID),
  soloResultId: SOLO.summary.resultId,
  homeworkResultId: HOMEWORK.summary.resultId,
});

export default createTicket77PreviewWorker();
