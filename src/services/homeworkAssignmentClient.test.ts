import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuth } from 'firebase/auth';
import {
    createBookHomeworkAssignmentViaWorker,
  createBookHomeworkPreviewSource as createPreview,
    HomeworkAssignmentWorkerError,
  createHomeworkAssignmentViaWorker,
} from './homeworkAssignmentClient';

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

const input = {
  materialId: 'ielts-reading-1',
  materialTitle: 'IELTS Reading',
  materialType: 'test' as const,
  materialSkill: 'reading' as const,
  teacherId: 'teacher-1',
  target: { type: 'class' as const, classId: 'class-1', className: 'Class 1' },
  config: {
    timerMinutes: null,
    maxAttempts: null,
    feedbackTiming: 'after_completion' as const,
    lateSubmissionAllowed: false,
  },
  availableFrom: new Date('2026-06-17T00:00:00.000Z'),
  dueDate: new Date('2026-06-18T00:00:00.000Z'),
  instructions: 'Practice.',
  tags: ['reading'],
  contentRef: {
    contentKind: 'ielts_reading' as const,
    contentId: 'ielts-reading-1',
    title: 'IELTS Reading',
  },
};

const bookCommand = {
  assignmentId: 'book-assignment-1',
  operationId: '00000000-0000-4000-8000-000000000086',
  idempotencyKey: 'book-idempotency-1',
  manifestVersionId: 'manifest-1',
  intent: {
    bookId: 'book-1',
    presentation: { title: 'Book Homework' },
    target: { kind: 'book' as const, bookId: 'book-1', classId: 'class-1' },
    schedule: {
      finalDueAt: '2026-06-18T00:00:00.000Z',
      nodeOverrides: [],
    },
    policy: {
      intent: 'accountable' as const,
      integrityCapture: true,
      integrityOverride: false,
      activityPolicies: [],
    },
    expectedPublication: {
      publicationId: 'publication-1',
      publicationRevision: 1,
      manifestVersionId: 'manifest-1',
    },
  },
  selectedRecipientIds: ['student-1'],
} as const;

const bookResponse = {
  status: 'committed',
  assignmentId: bookCommand.assignmentId,
  operationId: bookCommand.operationId,
  state: 'committed',
  visibility: 'committed',
  recipientCount: 1,
  committedRecipientCount: 1,
  revision: 5,
};

const previewRequest = {
  bookId: 'book-1',
  unitKey: 'unit-1',
  classId: 'class-1',
  selectedRecipientIds: ['student-1', 'student-2'],
  title: 'Book preview',
} as const;

const previewSourceResponse = () => ({
  delivery: {
    schemaVersion: 1,
    projectionKind: 'book-runtime-delivery',
    bindingId: 'binding-1',
    bindingRevision: 1,
    recipientId: 'student-1',
    context: { contextId: 'context-1', kind: 'homework', entitlementBasis: 'assignment' },
    book: {
      bookId: 'book-1', bookMode: 'pdf', bookRevision: 1,
      manifestVersionId: 'manifest-1', publicationId: 'publication-1',
      publicationRevision: 1, publicationStatus: 'published',
    },
    scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
    outline: [{ nodeKey: 'unit-1' }],
    sourceSet: {
      strategy: 'full_pdf',
      sources: [{ sourceKey: 'pdf-1', sourceVersionId: 'pdf-version-1', lifecycle: 'verified-usable', localPageScope: { kind: 'all', pages: [] } }],
    },
    documentRequests: [{ sourceKey: 'pdf-1' }],
    activities: [{ placementId: 'placement-1' }],
    actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
    provenance: { publicationId: 'publication-1', publicationRevision: 1, bindingId: 'binding-1', bindingRevision: 1 },
  },
  identity: {
    manifestVersionId: 'manifest-1', ownerId: 'teacher-1', createdByCommandId: 'command-1',
    createdAt: '2026-06-17T00:00:00.000Z', bindingRevision: 1,
  },
  initialTarget: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1' },
  targetPreview: {
    fingerprint: 'preview-fingerprint',
    rows: [{ placementId: 'placement-1', activityId: 'activity-1', nodeKey: 'unit-1', state: 'included' }],
    includedCount: 1,
    excludedCount: 0,
    excludedReasonCounts: {},
  },
  classId: 'class-1',
  selectedRecipientIds: ['student-1', 'student-2'],
});

describe('homeworkAssignmentClient', () => {
  beforeEach(() => {
    vi.mocked(getAuth).mockReturnValue({
      currentUser: {
        getIdToken: vi.fn().mockResolvedValue('firebase-token'),
      },
    } as any);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts normalized homework assignment payload to the Worker', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      assignmentId: 'homework-1',
      contentRef: input.contentRef,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const assignmentId = await createHomeworkAssignmentViaWorker(input);

    expect(assignmentId).toBe('homework-1');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/homework\/assignments$/);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer firebase-token',
        'Content-Type': 'application/json',
      }),
    }));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({
      contentRef: input.contentRef,
      target: input.target,
      config: input.config,
      availableFrom: Date.parse('2026-06-17T00:00:00.000Z'),
      dueDate: Date.parse('2026-06-18T00:00:00.000Z'),
    });
  });

  it('throws Worker reason code on rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'Publish first',
      reasonCode: 'CONTENT_UNPUBLISHED',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })));

    await expect(createHomeworkAssignmentViaWorker(input)).rejects.toMatchObject({
      reasonCode: 'CONTENT_UNPUBLISHED',
      status: 400,
    });
    await expect(createHomeworkAssignmentViaWorker(input)).rejects.toBeInstanceOf(HomeworkAssignmentWorkerError);
  });

  it('routes Book commands to canonical Worker origin with matching idempotency header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(bookResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createBookHomeworkAssignmentViaWorker(bookCommand, {
      workerOrigin: 'https://book-worker.example.test/',
    });

    expect(result).toEqual(bookResponse);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://book-worker.example.test/book-homework/assignments/book-assignment-1/commands',
      expect.objectContaining({
        method: 'POST',
        signal: undefined,
        headers: expect.objectContaining({
          Authorization: 'Bearer firebase-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': bookCommand.idempotencyKey,
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual(bookCommand);
  });

  it('accepts a 202 committed projection pending response without dropping its contract fields', async () => {
    const pendingResponse = { ...bookResponse, status: 'committed_projection_pending' };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(pendingResponse), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, {
      workerOrigin: 'https://book-worker.example.test',
    })).resolves.toEqual(pendingResponse);
  });

  it('retains bounded notification progress and rejects a count outside the frozen recipients', async () => {
    const response = { ...bookResponse, status: 'committed_notifications_pending', notifiedRecipientCount: 0 };
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(response, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ ...response, notifiedRecipientCount: bookResponse.recipientCount + 1 }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ ...response, notifiedRecipientCount: -1 }, { status: 202 }));
    const options = { workerOrigin: 'https://book-worker.example.test', fetchImpl };
    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, options)).resolves.toEqual(response);
    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, options)).rejects.toMatchObject({ reasonCode: 'INVALID_ASSIGNMENT_REQUEST' });
    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, options)).rejects.toMatchObject({ reasonCode: 'INVALID_ASSIGNMENT_REQUEST' });
  });

  it('rejects a pending response whose state is not committed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...bookResponse,
      status: 'committed_projection_pending',
      state: 'fanout_pending',
    }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, {
      workerOrigin: 'https://book-worker.example.test',
    })).rejects.toMatchObject({
      status: 202,
      reasonCode: 'INVALID_ASSIGNMENT_REQUEST',
    });
  });

  it('rejects pending status unless it is the exact committed 202 contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...bookResponse,
      status: 'committed_projection_pending',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, {
      workerOrigin: 'https://book-worker.example.test',
    })).rejects.toMatchObject({
      status: 200,
      reasonCode: 'INVALID_ASSIGNMENT_REQUEST',
    });
  });

  it('refreshes token once after an unauthorized canonical response', async () => {
    const getIdToken = vi.fn()
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'unauthorized' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(bookResponse), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, {
      workerOrigin: 'https://book-worker.example.test',
      getIdToken,
    })).resolves.toEqual(bookResponse);

    expect(getIdToken).toHaveBeenNthCalledWith(1, false);
    expect(getIdToken).toHaveBeenNthCalledWith(2, true);
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
    }));
  });

  it('fails without canonical configuration and never falls back to backup Worker', async () => {
    vi.stubEnv('VITE_BOOK_HOMEWORK_WORKER_URL', '');
    vi.stubEnv('VITE_BOOK_DELIVERY_WORKER_URL', '');
    vi.stubEnv('VITE_R2_UPLOAD_WORKER_URL', '');
    vi.stubEnv('VITE_BACKUP_WORKER_URL', 'https://backup-worker.example.test');

    await expect(createBookHomeworkAssignmentViaWorker(bookCommand)).rejects.toMatchObject({
      status: 500,
      reasonCode: 'INVALID_ASSIGNMENT_REQUEST',
    });
  });

  it('passes abort signal and rejects malformed canonical responses', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, {
      workerOrigin: 'https://book-worker.example.test',
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ signal: controller.signal }));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(createBookHomeworkAssignmentViaWorker(bookCommand, {
      workerOrigin: 'https://book-worker.example.test',
    })).rejects.toMatchObject({
      status: 200,
      reasonCode: 'INVALID_ASSIGNMENT_REQUEST',
    });
  });

  it('accepts a valid preview source response', async () => {
    const fetchMock = vi.fn();
    const body = previewSourceResponse();
    body.initialTarget = { nodeKey: 'unit-1', bookId: 'book-1', kind: 'unit' };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    const options = { workerOrigin: ['https:', '', 'book-worker.example.test'].join('/'), fetchImpl: fetchMock };
    const result = await createPreview(previewRequest, options);
    expect(result).not.toHaveProperty('studentDocument');
  });

  it('accepts a component preview with a real combined document pin', async () => {
    const body = previewSourceResponse();
    const component = { ...body, delivery: { ...body.delivery,
      sourceSet: { strategy: 'component_pdfs', sources: [...body.delivery.sourceSet.sources,
        { ...body.delivery.sourceSet.sources[0], sourceKey: 'pdf-2', sourceVersionId: 'pdf-version-2' }] } },
      studentDocument: { sourceVersionId: 'combined-v1', descriptorRevision: 1, sha256Hex: 'a'.repeat(64),
        components: [{ sourceKey: 'pdf-1', combinedStartPage: 1, localPageCount: 1 },
          { sourceKey: 'pdf-2', combinedStartPage: 2, localPageCount: 1 }] } };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(component), { status: 200 }));
    await expect(createPreview(previewRequest, { workerOrigin: 'https://book-worker.example.test', fetchImpl }))
      .resolves.toMatchObject({ studentDocument: component.studentDocument });
  });

  it('rejects mismatched and malformed preview source responses', async () => {
    const body = previewSourceResponse();
    body.delivery.book.bookId = 'book-2';
    const fetchMock = vi.fn();
    const options = { workerOrigin: ['https:', '', 'book-worker.example.test'].join('/'), fetchImpl: fetchMock };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(createPreview(previewRequest, options)).rejects.toMatchObject({ status: 502, reasonCode: 'INVALID_ASSIGNMENT_REQUEST' });

    const synthetic = previewSourceResponse() as any;
    synthetic.delivery.sourceSet.strategy = 'component_pdfs';
    synthetic.delivery.sourceSet.sources.push({
      sourceKey: 'pdf-2', sourceVersionId: 'pdf-version-2', lifecycle: 'verified-usable', localPageScope: { kind: 'all', pages: [] },
    });
    synthetic.studentDocument = { sourceVersionId: 'pdf-version-1', descriptorRevision: 0, sha256Hex: '0'.repeat(64) };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(synthetic), { status: 200 }));
    await expect(createPreview(previewRequest, options)).rejects.toMatchObject({ status: 502, reasonCode: 'INVALID_ASSIGNMENT_REQUEST' });

    for (const body of [
      { ...previewSourceResponse(), studentDocument: { sha256Hex: 'invalid' } },
      { ...previewSourceResponse(), initialTarget: { ...previewSourceResponse().initialTarget, extra: 'untrusted' } },
      { ...synthetic, studentDocument: undefined },
    ]) {
      fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
      await expect(createPreview(previewRequest, options)).rejects.toMatchObject({ status: 502, reasonCode: 'INVALID_ASSIGNMENT_REQUEST' });
    }

    const malformed = previewSourceResponse();
    malformed.delivery.sourceSet.sources = {} as never;
    fetchMock.mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 }));
    await expect(createPreview(previewRequest, options)).rejects.toMatchObject({ status: 502, reasonCode: 'INVALID_ASSIGNMENT_REQUEST' });
  });
});
