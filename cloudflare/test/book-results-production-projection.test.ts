import { decodeJwt, exportPKCS8, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  InMemoryBookRuntimeRepository,
  type BookRuntimeTerminalTuple,
} from '../src/upload-worker/book-runtime/repository.ts';
import {
  createFirebaseBookResultProjectionWriter,
  buildBookResultGroupSummary,
  projectCommittedBookResult,
  type BookResultProjectionWriter,
} from '../src/upload-worker/book-results/production-projection.ts';
import { FirebaseBookResultReadRepository, InMemoryBookResultReadRepository } from '../src/upload-worker/book-results/repository.ts';
import { createBookResultReadProductionHandlers } from '../src/upload-worker/book-results/production-composition.ts';
import { createBookResultReadWorkerHandlers } from '../src/upload-worker/book-results/worker.ts';
import { bookResultGroupKey } from '../src/upload-worker/book-results/types.ts';
import type {
  BookRuntimeCommandPayload,
  BookRuntimeCommandResult,
  BookRuntimeTrustedCommandContext,
  BookRuntimeScheduleAuthority,
} from '../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import {
  validateBookResultAttemptDetail,
  validateBookResultGroupSummary,
} from '../../src/services/book-activity/results/bookResultProjection.service.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';
import { classBookBindingContextId } from '../../src/services/book-delivery/classBookPlacement.types.ts';
import { createBookRuntimeScheduleAuthority } from '../../src/services/book-activity/activityRuntimeAttempt.service.ts';
import { resolveBookScheduleWindow } from '../../src/services/book-delivery/bookScheduleWindow.service.ts';

const binding = (): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId: 'binding-1',
  revision: 1,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'placements', nodeKeys: ['unit-1'], placementIds: ['placement-1'] },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  context: {
    kind: 'homework',
    contextId: 'homework-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    entitlementBasis: 'assignment',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'full',
      sourceVersionId: 'source-v1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'pages', pages: [1] },
    }],
  },
  placements: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-version-1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['page-group-1'],
    sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'homework', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-07-27T00:00:00.000Z',
});

const command = (overrides: Partial<BookRuntimeCommandPayload> = {}): BookRuntimeCommandPayload => ({
  operationId: '00000000-0000-4000-8000-000000000101',
  commandKind: 'autosave',
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  clientRevision: 0,
  response: { choice: 'A' },
  ...overrides,
});

const scheduleAuthority = (): BookRuntimeScheduleAuthority => ({
  ...createBookRuntimeScheduleAuthority(resolveBookScheduleWindow({
    assignmentId: 'homework-1', recipientId: 'student-1', bindingId: 'binding-1', bindingRevision: 1,
    placementId: 'placement-1', activityId: 'activity-1', activityVersion: 1, nodeKey: 'unit-1', operation: 'submit',
    schedule: { schemaVersion: 1, resolverVersion: 1, finalDueAt: '2026-07-28T00:00:00.000Z', scheduleRules: [] },
    outline: binding().outline, studentExtensions: {}, lateSubmissionAllowed: false, maxAttempts: null,
    attemptsUsed: 0, policyRevision: 1, authorityRevision: 1, evaluatedAt: '2026-07-27T00:01:00.000Z',
  })),
});
const context = (operationKind: BookRuntimeTrustedCommandContext['operationKind']): BookRuntimeTrustedCommandContext => ({
  actorUid: 'student-1',
  operationKind,
  binding: binding(),
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  now: '2026-07-27T00:01:00.000Z',
  scheduleAuthority: scheduleAuthority(),
});

const acceptedTerminal = async (): Promise<BookRuntimeTerminalTuple> => {
  const repository = new InMemoryBookRuntimeRepository();
  await repository.applyCommand({
    command: command(),
    context: context('autosave'),
    attemptId: 'unused',
  });
  const result = await repository.applyCommand({
    command: command({
      commandKind: 'submit',
      operationId: '00000000-0000-4000-8000-000000000102',
      clientRevision: 1,
    }),
    context: context('submit'),
    attemptId: 'attempt-1',
    attemptPolicy: { maxAttempts: null, feedbackPolicy: 'immediate' },
    score: { status: 'review_required' },
  });
  if (!result.attempt || !result.result || !result.completion || !result.index) {
    throw new Error('fixture_terminal_missing');
  }
  return {
    attempt: result.attempt,
    result: result.result,
    completion: result.completion,
    index: result.index,
  };
};

class IdempotentWriter implements BookResultProjectionWriter {
  projection: unknown;

  async write(input: Parameters<BookResultProjectionWriter['write']>[0]): Promise<void> {
    if (this.projection !== undefined && JSON.stringify(this.projection) !== JSON.stringify(input.projection)) {
      throw new Error('projection_conflict');
    }
    this.projection = structuredClone(input.projection);
  }
}

describe('production Book result projection seam', () => {
  it.each(['course', 'class'] as const)('projects and reads %s only behind current exact delivery and owner authority', async (kind) => {
    const contextId = kind === 'class' ? classBookBindingContextId('class-1', 'copy-1', 'material-1', 'placement-1') : 'course-material-1';
    const original = binding();
    const current: BookDeliveryBinding = { ...original, context: { ...original.context, kind, contextId, entitlementBasis: kind === 'course' ? 'enrollment' : 'membership',
      ...(kind === 'class' ? { classLocator: { classId: 'class-1', copyId: 'copy-1', courseMaterialId: 'material-1', classPlacementId: 'placement-1' } } : {}),
    } as BookDeliveryBinding['context'] };
    const terminal = await acceptedTerminal();
    for (const row of [terminal.attempt, terminal.result, terminal.completion, terminal.index]) {
      (row as { contextId: string }).contextId = contextId;
      delete (row as { feedbackPolicy?: unknown }).feedbackPolicy;
      delete (row as { terminalLate?: unknown }).terminalLate;
    }
    const projection = await projectCommittedBookResult({ binding: current, terminal, writer: new IdempotentWriter() });
    expect(projection.summary.surface).toBe(kind);
    const summary = { ...projection.summary, bookId: 'book-1' };
    const repository = new InMemoryBookResultReadRepository({ attempts: { [summary.resultId]: summary },
      details: { [summary.resultId]: { ...projection.detail, bookId: 'book-1' } },
      groups: { current: buildBookResultGroupSummary(bookResultGroupKey('student-1', 'activity-1'), [summary]) },
    });
    let authorized = true;
    const resolve = async () => {
      if (!authorized) throw new Error(kind === 'course' ? 'course_book_resolution_denied' : 'class_book_enrollment_denied');
      return { bindingId: current.bindingId, bindingRevision: current.revision, recipientId: 'student-1', context: current.context, book: current.book } as never;
    };
    const handlers = createBookResultReadProductionHandlers({
      createDeliveryRepository: () => ({ resolveCurrent: async () => ({ pointer: { bindingId: current.bindingId,
        bindingRevision: current.revision, contextId, recipientId: 'student-1' }, record: { status: 'active', binding: current } }) as never,
        readBinding: async () => null }),
      resolveCourseDelivery: resolve, resolveClassDelivery: resolve,
      readUser: async (_, uid) => ({ role: uid.startsWith('teacher') ? 'teacher' : 'student' }),
      createResultRepository: () => repository, createEvaluationRepository: () => ({ listHistory: async () => [] }),
    });
    const input = { request: new Request('https://worker.test/'), env: {}, uid: 'student-1', studentId: 'student-1',
      bookId: 'book-1', contextKind: kind, contextId, resultId: summary.resultId };
    expect(await handlers.resultDetail(input)).toMatchObject({ body: { detail: { surface: kind, studentFeedbackRelease: 'withheld' } } });
    expect(await handlers.resultDetail({ ...input, uid: 'teacher-1' })).toMatchObject({ body: { detail: { surface: kind } } });
    expect(await handlers.resultDetail({ ...input, uid: 'teacher-other' })).toMatchObject({ init: { status: 403 } });
    expect(await handlers.resultDetail({ ...input, contextId: 'wrong-context' })).toMatchObject({ init: { status: 403 } });
    authorized = false;
    expect(await handlers.resultDetail(input)).toMatchObject({ init: { status: 403 } });
  });
  it('projects one committed terminal tuple and replays it idempotently', async () => {
    const terminal = await acceptedTerminal();
    const writer = new IdempotentWriter();
    const first = await projectCommittedBookResult({ binding: binding(), terminal, writer });
    const second = await projectCommittedBookResult({ binding: binding(), terminal, writer });

    expect(second).toEqual(first);
    expect((writer.projection as { detail: { response: unknown } }).detail.response).toEqual({ choice: 'A' });
    expect(first.summary.surface).toBe('homework');
    expect(first.summary.homeworkId).toBe('homework-1');
  });

  it.each(['homework', 'course', 'class'] as const)('replays %s after RTDB omits nullable object properties with exact credentials', async (kind) => {
    const terminal = await acceptedTerminal();
    let current = binding();
    if (kind !== 'homework') {
      current = { ...current, context: { ...current.context, kind, contextId: `${kind}:placement-1`,
        entitlementBasis: kind === 'course' ? 'enrollment' : 'membership' } as BookDeliveryBinding['context'] };
      for (const row of [terminal.attempt, terminal.result, terminal.completion, terminal.index]) {
        (row as { contextId: string }).contextId = current.context.contextId;
        delete (row as { feedbackPolicy?: unknown }).feedbackPolicy;
        delete (row as { terminalLate?: unknown }).terminalLate;
      }
    }
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const serviceIdentity = 'book-result-replay@synthetic.iam.gserviceaccount.com';
    const claims: Record<string, unknown>[] = [];
    const values = new Map<string, unknown>();
    const versions = new Map<string, number>();
    const omitRtdbLossyValues = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.length === 0 ? null : value.map(omitRtdbLossyValues);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value)
        .filter(([, entry]) => entry !== null && !(Array.isArray(entry) && entry.length === 0))
        .map(([key, entry]) => [key, omitRtdbLossyValues(entry)]));
    };
    const valueAt = (path: string): unknown => {
      const direct = values.get(path);
      if (direct !== undefined) return structuredClone(direct);
      const prefix = `${path}/`;
      const children = [...values.entries()]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map(([key, value]) => [key.slice(prefix.length), structuredClone(value)] as const);
      return children.length > 0 ? Object.fromEntries(children) : null;
    };
    const pathFromRequest = (input: RequestInfo | URL): string => new URL(String(input)).pathname
      .replace(/^\//u, '').replace(/\.json$/u, '').split('/').filter(Boolean)
      .map(decodeURIComponent).join('/');
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('identitytoolkit.googleapis.com')) {
        claims.push(decodeJwt(JSON.parse(String(init?.body)).token).claims as Record<string, unknown>);
        return new Response(JSON.stringify({ idToken: 'synthetic-firebase-id-token', expiresIn: '3600' }), { status: 200 });
      }
      const path = pathFromRequest(input);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      if (method === 'GET') {
        return new Response(JSON.stringify(valueAt(path)), {
          status: 200,
          headers: { etag: `\"v${versions.get(path) ?? 0}\"` },
        });
      }
      if (method !== 'PUT') return new Response('', { status: 405 });
      if (headers.get('if-match') !== `\"v${versions.get(path) ?? 0}\"`) {
        return new Response('', { status: 412 });
      }
      values.set(path, omitRtdbLossyValues(JSON.parse(String(init?.body ?? 'null'))));
      versions.set(path, (versions.get(path) ?? 0) + 1);
      return new Response('null', { status: 200 });
    };
    const writer = createFirebaseBookResultProjectionWriter({
      FIREBASE_DB_URL: 'https://synthetic-firebase.test',
      FIREBASE_PROJECT_ID: 'synthetic-project',
      FIREBASE_WEB_API_KEY: 'synthetic-web-key',
      BOOK_RESULT_READ_SERVICE_IDENTITY: serviceIdentity,
      BOOK_RESULT_READ_GOOGLE_SA_KEY: JSON.stringify({
        client_email: serviceIdentity,
        private_key: await exportPKCS8(privateKey),
      }),
    }, fetchImpl);

    const first = await projectCommittedBookResult({ binding: current, terminal, writer });
    await expect(projectCommittedBookResult({ binding: current, terminal, writer })).resolves.toEqual(first);
    if (kind !== 'homework') {
      const contextRoot = `book_result_read_models/contexts/${kind}/${current.context.contextId}/students/student-1/books/book-1/`;
      expect([...values.keys()].filter((path) => !path.startsWith('book_result_read_models/details/')))
        .toEqual(expect.arrayContaining([`${contextRoot}group_summaries/${bookResultGroupKey('student-1', 'activity-1')}`]));
      expect([...values.keys()].every((path) => path.startsWith(contextRoot) || path.startsWith('book_result_read_models/details/'))).toBe(true);
      for (const claim of claims) expect(claim).toMatchObject({ book_result_read_service: true,
        book_result_read_contextKind: kind, book_result_read_contextId: current.context.contextId,
        book_result_read_studentId: 'student-1', book_result_read_bookId: 'book-1' });
      expect(claims.some((claim) => claim.book_result_read_resultId === terminal.result.resultId)).toBe(true);
      return;
    }

    const repository = new FirebaseBookResultReadRepository({
      env: {
        FIREBASE_DB_URL: 'https://synthetic-firebase.test',
        FIREBASE_PROJECT_ID: 'synthetic-project',
        FIREBASE_WEB_API_KEY: 'synthetic-web-key',
        BOOK_RESULT_READ_SERVICE_IDENTITY: serviceIdentity,
        BOOK_RESULT_READ_GOOGLE_SA_KEY: JSON.stringify({
          client_email: serviceIdentity,
          private_key: await exportPKCS8(privateKey),
        }),
      },
      fetchImpl,
    });
    const handlers = createBookResultReadWorkerHandlers({
      repository,
      resolveViewerRole: () => 'student',
      resolveHomeworkAuthorities: async () => ({}),
    });
    const detailResponse = await handlers.resultDetail({
      request: new Request('https://worker.test/results'),
      env: {},
      uid: 'student-1',
      bookId: 'book-1',
      studentId: 'student-1',
      resultId: terminal.result.resultId,
    });
    expect(detailResponse.init.status).toBe(200);
    expect(validateBookResultAttemptDetail(
      (detailResponse.body as { detail: unknown }).detail,
    )).toMatchObject({ valid: true, errors: [] });

    const groupResponse = await handlers.groupedAttempt({
      request: new Request('https://worker.test/results'),
      env: {},
      uid: 'student-1',
      bookId: 'book-1',
      studentId: 'student-1',
      groupKey: bookResultGroupKey('student-1', 'activity-1'),
    });
    expect(groupResponse.init.status).toBe(200);
    expect(validateBookResultGroupSummary(
      (groupResponse.body as { group: unknown }).group,
    )).toMatchObject({ valid: true, errors: [] });
  });

  it('rejects an orphan terminal tuple before invoking the writer', async () => {
    const terminal = await acceptedTerminal();
    const writer = new IdempotentWriter();
    const orphan = {
      ...terminal,
      result: { ...terminal.result, attemptId: 'orphan-attempt' },
    };

    await expect(projectCommittedBookResult({
      binding: binding(),
      terminal: orphan,
      writer,
    })).rejects.toMatchObject({ code: 'book_result_terminal_context_invalid' });
    expect(writer.projection).toBeUndefined();
  });

  it('preserves the committed tuple when projection storage fails', async () => {
    const terminal = await acceptedTerminal();
    const writer: BookResultProjectionWriter = {
      write: async () => { throw new Error('writer-unavailable'); },
    };

    await expect(projectCommittedBookResult({ binding: binding(), terminal, writer }))
      .rejects.toThrow('writer-unavailable');
    expect(terminal.attempt.attemptId).toBe('attempt-1');
    expect(terminal.completion.status).toBe('completed');
  });

  it('combines bounded attempts across contexts and rejects the 51st attempt', async () => {
    const terminal = await acceptedTerminal();
    const first = await projectCommittedBookResult({ binding: binding(), terminal, writer: new IdempotentWriter() });
    const attempts = Array.from({ length: 50 }, (_, index) => ({
      ...first.summary,
      bookId: 'book-1',
      attemptId: `attempt-${index + 1}`,
      resultId: `attempt-${index + 1}:result`,
      attemptNumber: index + 1,
      deliveryContextId: index % 2 === 0 ? 'homework-1' : 'solo-1',
      deliveryId: index % 2 === 0 ? 'homework-delivery' : 'solo-delivery',
      submittedAt: `2026-07-27T00:${String(index).padStart(2, '0')}:00.000Z`,
    }));

    expect(buildBookResultGroupSummary('g_activity-1', attempts)).toMatchObject({
      attemptCount: 50,
      contexts: [
        { contextId: 'homework-1', deliveryId: 'homework-delivery', attemptCount: 25 },
        { contextId: 'solo-1', deliveryId: 'solo-delivery', attemptCount: 25 },
      ],
    });
    expect(() => buildBookResultGroupSummary('g_activity-1', [
      ...attempts,
      { ...attempts[0]!, attemptId: 'attempt-51', resultId: 'attempt-51:result', attemptNumber: 51 },
    ])).toThrowError('book_result_attempts_query_unbounded');
  });
});
