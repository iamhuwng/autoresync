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
// @ts-ignore Existing Worker verifier is JavaScript without declarations.
import { createFirebaseVerifier } from '../firebase-verification.js';
import {
  createBookHistoricalAttemptDocumentDeliveryHandler,
  type BookSourceDocumentRuntime,
} from '../book-source/document.ts';
import { canonicalBookRouteManifest } from '../book-routes/manifest.ts';
import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookResultDetail } from './types.ts';
import type {
  BookAttemptSourceContextProjection,
} from '../../../../src/services/book-delivery/attemptSourceContextProjection.types.ts';
import type {
  BookDocumentAuthorizedSource,
} from '../book-delivery/documentAuthorization.ts';

const STUDENT_UID = 'x3hDfjYVN7cJtSbwq0ChIjl1Bk62';
const TEACHER_UID = 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2';
const BOOK_ID = 'book-browser-proof';
const ACTIVITY_ID = 'activity-browser-proof';
const HOMEWORK_ID = 'homework-browser-proof';

export interface Ticket77PreviewEnv extends BookRouterEnv {
  readonly TICKET77_STUDENT_UID: string;
  readonly TICKET77_TEACHER_UID: string;
  readonly TICKET77_HOMEWORK_ID: string;
  readonly BOOK_HISTORICAL_DOCUMENT_ROUTES_ENABLED?: string;
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
  readonly availability: 'available' | 'deleted' | 'replaced';
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
    attemptSourceContext: {
      schemaVersion: 1,
      state: 'historical_source_unavailable',
      reason: input.availability === 'available' ? 'authorization_unavailable' : input.availability,
      metadata: {
        attemptId: input.attemptId,
        resultId: input.resultId,
        bookId: BOOK_ID,
        studentId: STUDENT_UID,
        surface: input.surface,
        contextId: input.contextId,
        ownerId: input.surface === 'homework' ? TEACHER_UID : STUDENT_UID,
        componentId: input.sourceKey,
        sourceKey: input.sourceKey,
        sourceVersionId: input.sourceVersionId,
        physicalPageNumber: 3,
        pageGroupId: `page-group-${input.surface}`,
        placementId: input.placementId,
        activityId: ACTIVITY_ID,
        activityVersionId: 'activity-browser-proof@7',
        activityVersion: 7,
        interactionFocusId: `interaction-browser-proof-${input.surface}`,
        correspondence: input.surface === 'homework' ? 'source-assisted' : 'reference-only',
      },
      documentResource: null,
    },
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

const historicalSource: BookDocumentAuthorizedSource = {
  bookId: BOOK_ID,
  sourceVersionId: 'source-version-historical',
  storageLocationId: 'ticket80-preview-location',
  providerKind: 'backblaze-b2-s3',
  privateBucketId: 'ticket80-preview-private',
  providerObjectKey: 'private/ticket80/source-version-historical.pdf',
  providerFileId: 'ticket80-preview-file',
  providerFileVersionId: 'ticket80-preview-file-version',
  checksum: {
    algorithm: 'sha-256',
    value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  },
  byteSize: 1024,
  provider: 'b2',
  bucket: 'book-source',
  objectKey: 'private/ticket80/source-version-historical.pdf',
};

const proofProjection = (
  surface: 'solo' | 'homework',
  state: 'available' | 'deleted' = 'available',
  current = false,
): BookAttemptSourceContextProjection => {
  const suffix = current ? 'current' : 'historical';
  const metadata = {
    attemptId: `attempt-${suffix}`,
    resultId: `result-${suffix}`,
    bookId: BOOK_ID,
    studentId: STUDENT_UID,
    surface,
    contextId: surface === 'homework' ? HOMEWORK_ID : 'solo-browser-proof',
    ownerId: surface === 'homework' ? TEACHER_UID : STUDENT_UID,
    componentId: `component-${suffix}`,
    sourceKey: `component-${suffix}`,
    sourceVersionId: `source-version-${suffix}`,
    physicalPageNumber: 3,
    pageGroupId: `page-group-${suffix}`,
    placementId: `placement-${suffix}`,
    activityId: ACTIVITY_ID,
    activityVersionId: 'activity-browser-proof@7',
    activityVersion: 7,
    interactionFocusId: `interaction-${suffix}`,
    correspondence: 'source-assisted' as const,
  };
  return state === 'deleted'
    ? {
      schemaVersion: 1,
      state: 'historical_source_unavailable',
      reason: 'deleted',
      metadata,
      documentResource: null,
    }
    : {
      schemaVersion: 1,
      state: 'available',
      metadata,
      documentResource: {
        sourceKey: metadata.sourceKey,
        sourceVersionId: metadata.sourceVersionId,
        opaqueRouteKey: `opaque-${suffix}`,
        localPageScope: { kind: 'pages', pages: [3] },
      },
    };
};

const HISTORICAL_BINDING_ID = `bd_${'8'.repeat(40)}`;
const historicalPdfBytes = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
);
const historicalRouteKey = (suffix: 'historical' | 'current'): string => (
  `${HISTORICAL_BINDING_ID}-4-component-${suffix}-source-version-${suffix}`
);
const historicalBinding: BookDeliveryBinding = {
  schemaVersion: 3,
  bindingId: HISTORICAL_BINDING_ID,
  revision: 4,
  status: 'active',
  recipient: { recipientId: STUDENT_UID, recipientKind: 'student' },
  issuer: { ownerId: TEACHER_UID, authorityBoundary: 'book-owner' },
  book: {
    bookId: BOOK_ID,
    bookMode: 'pdf',
    bookRevision: 4,
    publicationId: 'publication-ticket80-preview',
    publicationRevision: 4,
    publicationStatus: 'published',
  },
  scope: {
    kind: 'placements',
    nodeKeys: ['node-ticket80-preview'],
    placementIds: ['placement-historical', 'placement-current'],
  },
  outline: [],
  context: {
    kind: 'homework',
    contextId: HOMEWORK_ID,
    recipientId: STUDENT_UID,
    ownerId: TEACHER_UID,
    entitlementBasis: 'assignment',
  },
  sourceSet: {
    strategy: 'component_pdfs',
    sources: ['historical', 'current'].map((suffix) => ({
      sourceKey: `component-${suffix}`,
      sourceVersionId: `source-version-${suffix}`,
      lifecycle: 'verified-usable' as const,
      localPageScope: { kind: 'pages' as const, pages: [3] },
    })),
  },
  placements: ['historical', 'current'].map((suffix, index) => ({
    placementId: `placement-${suffix}`,
    activityId: ACTIVITY_ID,
    activityVersionId: 'activity-browser-proof@7',
    activityVersion: 7,
    nodeKey: 'node-ticket80-preview',
    order: index + 1,
    contextMode: 'required' as const,
    pageGroupKeys: [`page-group-${suffix}`],
    sourcePageScopes: [{ sourceKey: `component-${suffix}`, pages: [3] }],
  })),
  schedulePolicy: {
    policyId: 'policy-ticket80-preview',
    policyRevision: 1,
    basis: 'immutable-reference',
  },
  createdAt: '2026-07-31T00:00:00.000Z',
};

const actualProofDetail = (
  resultId: string,
  surface: 'solo' | 'homework',
  state: 'available' | 'deleted' = 'available',
  current = false,
): BookResultDetail => {
  const projection = proofProjection(surface, state, current);
  const suffix = current ? 'current' : 'historical';
  const attemptSourceContext = projection.state === 'available'
    ? {
      ...projection,
      metadata: { ...projection.metadata, resultId },
      documentResource: {
        ...projection.documentResource,
        opaqueRouteKey: historicalRouteKey(suffix),
      },
    }
    : {
      ...projection,
      metadata: { ...projection.metadata, resultId },
    };
  return {
    ...HOMEWORK.detail,
    bookId: BOOK_ID,
    studentId: STUDENT_UID,
    resultId,
    attemptId: attemptSourceContext.metadata.attemptId,
    bindingId: HISTORICAL_BINDING_ID,
    bindingRevision: 4,
    surface,
    contextId: attemptSourceContext.metadata.contextId,
    ownerId: attemptSourceContext.metadata.ownerId,
    attemptSourceContext,
  } as BookResultDetail;
};

const copiedProofDetail = actualProofDetail('result-copied-resource', 'homework');
const actualProofDetails = new Map<string, BookResultDetail>([
  ['result-exact-historical', actualProofDetail('result-exact-historical', 'homework')],
  ['result-exact-current', actualProofDetail('result-exact-current', 'homework', 'available', true)],
  ['result-deleted', actualProofDetail('result-deleted', 'homework', 'deleted')],
  ['result-copied-resource', {
    ...copiedProofDetail,
    attemptSourceContext: {
      ...copiedProofDetail.attemptSourceContext,
      metadata: {
        ...copiedProofDetail.attemptSourceContext.metadata,
        bookId: 'book-copied',
      },
    },
  } as BookResultDetail],
  ['result-private-solo', actualProofDetail('result-private-solo', 'solo')],
]);

const actualHistoricalRuntime = (env: Ticket77PreviewEnv): BookSourceDocumentRuntime => ({
  repository: {
    readBinding: async (bindingId) => bindingId === HISTORICAL_BINDING_ID
      ? {
        binding: historicalBinding,
        recordRevision: 1,
        status: 'active',
        createdAt: historicalBinding.createdAt,
        updatedAt: historicalBinding.createdAt,
      }
      : null,
    resolveCurrent: async () => {
      throw new Error('ticket80_preview_must_not_resolve_current');
    },
  } as BookSourceDocumentRuntime['repository'],
  provider: {
    readObjectMetadata: async ({ identity }) => ({
      identity,
      contentType: 'application/pdf' as const,
    }),
    readBounded: async ({ range }) => {
      const offset = range.offset
        ?? Math.max(0, historicalPdfBytes.byteLength - range.suffixLength);
      const end = range.length === undefined
        ? historicalPdfBytes.byteLength
        : offset + range.length;
      return {
        bytes: historicalPdfBytes.slice(offset, end),
        totalByteSize: historicalPdfBytes.byteLength,
        offset,
      };
    },
  },
  readProfile: async (uid) => uid === env.TICKET77_STUDENT_UID
    ? { role: 'student', status: 'active' }
    : uid === env.TICKET77_TEACHER_UID
      ? { role: 'teacher', status: 'active' }
      : null,
  readCurrentAuthority: async () => {
    throw new Error('ticket80_preview_must_not_read_current_authority');
  },
  readResultDetail: async ({ resultId }) => actualProofDetails.get(resultId) ?? null,
  readHomeworkAuthority: async (homeworkId) => homeworkId === env.TICKET77_HOMEWORK_ID
    ? {
      homeworkId,
      ownerId: env.TICKET77_TEACHER_UID,
      studentIds: [env.TICKET77_STUDENT_UID],
      status: 'current',
    }
    : null,
  readHistoricalSource: async ({ sourceVersionId }) => ({
    availability: 'available',
    source: {
      ...historicalSource,
      bookId: sourceVersionId === 'source-version-historical-copied'
        ? 'book-copied'
        : BOOK_ID,
      sourceVersionId,
      byteSize: historicalPdfBytes.byteLength,
    },
  }),
});

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
    serveHistoricalAttemptDocument: createBookHistoricalAttemptDocumentDeliveryHandler({
      runtimeFactory: () => actualHistoricalRuntime(env),
    }),
  };
};

export const createTicket77PreviewWorker = (
  options: Ticket77PreviewWorkerOptions = {},
): ExportedHandler<Ticket77PreviewEnv> => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier() as FirebaseVerifier;
  return {
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
    const historicalRoute = canonicalBookRouteManifest.find(
      (route) => route.id === 'book.document-delivery.serve-historical-attempt-document',
    );
    if (!historicalRoute) throw new Error('ticket80_historical_route_missing');
    const router = createBookRouter({
      manifest: [...bookResultReadRouteDescriptors, historicalRoute],
      handlers: routeHandlers(env),
      firebaseVerifier: verifier,
    });
    return await router.fetch(request, env)
      ?? new Response(JSON.stringify({ code: 'book_route_not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
  },
  };
};

export const ticket77PreviewFixture = Object.freeze({
  bookId: BOOK_ID,
  studentId: STUDENT_UID,
  teacherId: TEACHER_UID,
  homeworkId: HOMEWORK_ID,
  activityId: ACTIVITY_ID,
  groupKey: bookResultGroupKey(STUDENT_UID, ACTIVITY_ID),
  soloResultId: SOLO.summary.resultId,
  homeworkResultId: HOMEWORK.summary.resultId,
  historicalRouteKey: historicalRouteKey('historical'),
  currentRouteKey: historicalRouteKey('current'),
});

export default createTicket77PreviewWorker();
