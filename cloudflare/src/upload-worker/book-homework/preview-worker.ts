import { createBookRouteHandlers } from '../book-route-handlers.ts';
import { createBookRouter, type BookRouterEnv } from '../book-router.ts';
import { FirebaseRestBookDeliveryRepository } from '../book-delivery/repository.ts';
import type { BookDeliveryPublishedPublicationReference } from '../../../../src/services/book-delivery/bookDelivery.publication.ts';
import type { BookHomeworkSagaCanonicalState } from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';
import type { BookHomeworkAuthorityRecord } from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import type { BookHomeworkManifest } from '../../../../src/types/homework.types.ts';
import { createBookHomeworkWorkerHandlers } from './worker.ts';
import { BookHomeworkAssignmentSaga } from './saga.ts';
import { FirebaseRestBookHomeworkSagaRepository } from './sagaRepository.ts';
import { createFirebaseRestBookHomeworkRepository } from './repository.ts';

interface Ticket86PreviewEnv extends BookRouterEnv {
  readonly FIREBASE_PROJECT_ID: string;
  readonly TICKET86_DATA_PROJECT_ID: string;
  readonly FIREBASE_DB_URL: string;
  readonly BOOK_HOMEWORK_SERVICE_IDENTITY: string;
  readonly BOOK_HOMEWORK_GOOGLE_SA_KEY: string;
  readonly BOOK_DELIVERY_SERVICE_IDENTITY: string;
  readonly BOOK_DELIVERY_GOOGLE_SA_KEY: string;
  readonly TICKET86_HOMEWORK_RTDB_TOKEN: string;
  readonly TICKET86_DELIVERY_RTDB_TOKEN: string;
  readonly TICKET86_TEACHER_UID: string;
  readonly TICKET86_STUDENT_UID: string;
  readonly TICKET86_ASSIGNMENT_ID: string;
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const required = (value: string | undefined, label: string): string => {
  const result = value?.trim();
  if (!result) throw new Error(`missing_ticket86_${label}`);
  return result;
};

const previewCanonical = (
  env: Ticket86PreviewEnv,
  assignmentId: string,
  ownerId: string,
): BookHomeworkSagaCanonicalState => {
  const teacherUid = required(env.TICKET86_TEACHER_UID, 'teacher_uid');
  const studentUid = required(env.TICKET86_STUDENT_UID, 'student_uid');
  if (assignmentId !== required(env.TICKET86_ASSIGNMENT_ID, 'assignment_id')
    || ownerId !== teacherUid) {
    throw new Error('ticket86_preview_scope_denied');
  }
  const createdAt = '2026-07-29T00:00:00.000Z';
  const manifest: BookHomeworkManifest = {
    schemaVersion: 1,
    assignmentKind: 'book_activity_bundle',
    manifestVersionId: 'ticket86-manifest-v1',
    ownerId: teacherUid,
    createdByCommandId: 'ticket86-preview-command',
    createdAt,
    bindingRevision: 1,
    book: {
      bookId: 'ticket86-book',
      bookMode: 'pdf',
      bookRevision: 1,
      publicationId: 'ticket86-publication',
      publicationRevision: 1,
      publicationStatus: 'published',
    },
    context: {
      contextId: assignmentId,
      recipientId: studentUid,
      kind: 'homework',
      entitlementBasis: 'assignment',
    },
    selectedTarget: { kind: 'unit', bookId: 'ticket86-book', nodeKey: 'ticket86-unit' },
    outline: [{
      nodeKey: 'ticket86-unit',
      parentNodeKey: null,
      nodeType: 'unit',
      order: 1,
      titleSnapshot: 'Ticket 86 disposable Unit',
    }],
    scheduleRules: [{ nodeKey: 'ticket86-unit', dueAt: '2026-08-20T00:00:00.000Z' }],
    bindings: [{
      bindingId: 'ticket86-activity-binding',
      placementId: 'ticket86-placement',
      activityId: 'ticket86-activity',
      nodeKey: 'ticket86-unit',
      order: 1,
      contextMode: 'required',
      pageGroupKeys: ['ticket86-page-group'],
      sourceReadiness: 'ready',
      state: 'required',
      activityVersion: 1,
      activityVersionId: 'ticket86-activity-version',
      sourceContext: [{
        sourceKey: 'ticket86-source',
        sourceVersionId: 'ticket86-source-version',
        physicalPageNumbers: [1],
      }],
    }],
    completion: {
      aggregation: 'required-activities-submitted-over-required-activities',
      requiredBindingCount: 1,
      excludedBindingCount: 0,
      legacyScoreFields: 'untouched',
    },
  };
  const deliveryPublication: BookDeliveryPublishedPublicationReference = {
    bookId: 'ticket86-book',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'ticket86-publication',
    publicationRevision: 1,
    publicationStatus: 'published',
    ownerId: teacherUid,
    scope: {
      kind: 'subtree',
      nodeKeys: ['ticket86-unit'],
      placementIds: [],
    },
    outline: manifest.outline,
    sourceSet: {
      strategy: 'full_pdf',
      sources: [{
        sourceKey: 'ticket86-source',
        sourceVersionId: 'ticket86-source-version',
        lifecycle: 'verified-usable',
        localPageScope: { kind: 'all', pages: [] },
      }],
    },
    placements: [{
      placementId: 'ticket86-placement',
      activityId: 'ticket86-activity',
      activityVersionId: 'ticket86-activity-version',
      activityVersion: 1,
      nodeKey: 'ticket86-unit',
      order: 1,
      contextMode: 'required',
      pageGroupKeys: ['ticket86-page-group'],
      sourcePageScopes: [{ sourceKey: 'ticket86-source', pages: [1] }],
    }],
    schedulePolicy: {
      policyId: 'ticket86-policy',
      policyRevision: 1,
      basis: 'immutable-reference',
    },
  };
  return {
    ownerId: teacherUid,
    manifest,
    schedule: {
      schemaVersion: 1,
      resolverVersion: 1,
      finalDueAt: '2026-08-20T00:00:00.000Z',
      scheduleRules: manifest.scheduleRules,
    },
    recipientIds: [studentUid],
    studentExtensions: {},
    publication: {
      bookId: 'ticket86-book',
      publicationId: 'ticket86-publication',
      publicationRevision: 1,
      manifestVersionId: manifest.manifestVersionId,
      fingerprint: 'ticket86-publication-fingerprint-v1',
    },
    deliveryPublication,
    sourceReadiness: 'ready',
    exposureApproval: {
      approved: true,
      fingerprint: 'ticket86-exposure-fingerprint-v1',
    },
    capabilities: { canAssignBookHomework: true },
    frozenPolicy: {
      policyId: 'ticket86-policy',
      policyRevision: 1,
      fingerprint: 'ticket86-policy-fingerprint-v1',
      activityPolicies: {
        'ticket86-placement': {
          lateSubmissionAllowed: false,
          maxAttempts: 2,
        },
      },
    },
  };
};

export const ticket86PreviewCommandContract = (env: Ticket86PreviewEnv) => {
  const canonical = previewCanonical(
    env,
    required(env.TICKET86_ASSIGNMENT_ID, 'assignment_id'),
    required(env.TICKET86_TEACHER_UID, 'teacher_uid'),
  );
  return {
    assignmentId: env.TICKET86_ASSIGNMENT_ID,
    manifestVersionId: canonical.manifest.manifestVersionId,
    selectedRecipientIds: canonical.recipientIds,
  };
};

const createPreviewSaga = (env: Ticket86PreviewEnv): BookHomeworkAssignmentSaga => {
  const sagaRepository = new FirebaseRestBookHomeworkSagaRepository({
    env,
    getAccessToken: async () => required(
      env.TICKET86_HOMEWORK_RTDB_TOKEN,
      'homework_rtdb_token',
    ),
  });
  const authorityRepository = createFirebaseRestBookHomeworkRepository({
    env: {
      ...env,
      FIREBASE_PROJECT_ID: required(env.TICKET86_DATA_PROJECT_ID, 'data_project_id'),
    },
    resolveAffectedStudentStates: async () => ['unknown'],
    resolveCommittedRoot: async (record: BookHomeworkAuthorityRecord) => {
      const root = await sagaRepository.read(record.saga.sagaId);
      return root?.state === 'committed'
        && root.visibility === 'committed'
        && root.recipients.some((recipient) =>
          recipient.authorityId === record.assignmentId
          && recipient.recipientId === record.bookManifest.context.recipientId
          && recipient.state === 'committed');
    },
  });
  const deliveryRepository = new FirebaseRestBookDeliveryRepository({
    env,
    getAccessToken: async () => required(
      env.TICKET86_DELIVERY_RTDB_TOKEN,
      'delivery_rtdb_token',
    ),
  });
  return new BookHomeworkAssignmentSaga({
    sagaRepository,
    authorityRepository,
    deliveryRepository,
    resolveCanonical: async ({ assignmentId, ownerId }) =>
      previewCanonical(env, assignmentId, ownerId),
    maxRecipients: 1,
  });
};

export default {
  async fetch(request: Request, env: Ticket86PreviewEnv): Promise<Response> {
    const saga = createPreviewSaga(env);
    const teacherUid = required(env.TICKET86_TEACHER_UID, 'teacher_uid');
    const runtimeEnv: Ticket86PreviewEnv & {
      readonly readDatabaseValue: (path: string) => Promise<unknown>;
    } = {
      ...env,
      readDatabaseValue: async (path) => (
        path === `users/${teacherUid}`
          ? { role: 'teacher', status: 'active', forceReauth: false }
          : null
      ),
    };
    const router = createBookRouter({
      handlers: createBookRouteHandlers({
        homeworkHandlers: createBookHomeworkWorkerHandlers({ saga }),
      }),
    });
    return await router.fetch(request, runtimeEnv)
      ?? new Response(JSON.stringify({ code: 'book_route_not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
  },
} satisfies ExportedHandler<Ticket86PreviewEnv>;
