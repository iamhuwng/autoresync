import { describe, expect, it, vi } from 'vitest';
import {
  BookRuntimeClientError,
  createBookRuntimeClient,
} from './activityRuntime.browser';

const address = {
  bindingId: 'binding-1',
  bindingRevision: 3,
  contextId: 'context-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
} as const;

const operationId = '00000000-0000-4000-8000-000000000075';
const draftOperationId = '00000000-0000-4000-8000-000000000076';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});
describe('Book Runtime browser client', () => {
  it('posts one codec-only autosave command with Firebase authorization', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      status: 'accepted',
      receipt: {
        operationId,
        status: 'accepted',
        bindingId: 'binding-1',
        draftRevision: 1,
        createdAt: '2026-07-28T00:00:00.000Z',
      },
    }));
    const client = createBookRuntimeClient({
      baseUrl: 'https://runtime.example',
      getIdToken: async () => 'firebase-token',
      fetchImpl,
    });

    await expect(client.saveDraft({
      ...address,
      operationId,
      clientRevision: 0,
      response: { interactionId: 'interaction-1', text: 'draft' },
    })).resolves.toMatchObject({ status: 'accepted' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://runtime.example/book-runtime/commands',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        headers: expect.objectContaining({ Authorization: 'Bearer firebase-token' }),
      }),
    );
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      ...address,
      operationId,
      commandKind: 'autosave',
      clientRevision: 0,
      response: { interactionId: 'interaction-1', text: 'draft' },
    });
  });

  it('refreshes an expired token once and reads the exact scoped draft route', async () => {
    const getIdToken = vi.fn()
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({
        draft: {
          schemaVersion: 1,
          bindingId: 'binding-1',
          recipientId: 'student-1',
          contextId: 'context-1',
          placementId: 'placement-1',
          activityId: 'activity-1',
          activityVersion: 1,
          interactionId: 'interaction-1',
          revision: 2,
          response: { interactionId: 'interaction-1', text: 'saved' },
          updatedByOperationId: operationId,
          updatedAt: '2026-07-28T00:00:00.000Z',
        },
      }));
    const client = createBookRuntimeClient({
      baseUrl: 'https://runtime.example',
      getIdToken,
      fetchImpl,
    });

    await expect(client.readDraft(address)).resolves.toMatchObject({
      revision: 2,
      response: { text: 'saved' },
    });
    expect(getIdToken).toHaveBeenNthCalledWith(1, false);
    expect(getIdToken).toHaveBeenNthCalledWith(2, true);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'https://runtime.example/book-runtime/drafts/binding-1/3/context-1/placement-1/activity-1/1/interaction-1',
    );
  });

  it('flushes an acknowledged draft before terminal submit and exposes pending review', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        status: 'accepted',
        receipt: {
          operationId: draftOperationId,
          status: 'accepted',
          bindingId: 'binding-1',
          draftRevision: 4,
          createdAt: '2026-07-28T00:00:00.000Z',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'accepted',
        resultStatus: 'pending_review',
        completionStatus: 'completed',
        receipt: {
          operationId,
          status: 'accepted',
          bindingId: 'binding-1',
          attemptId: 'attempt-1',
          attemptNumber: 2,
          createdAt: '2026-07-28T00:00:01.000Z',
        },
      }));
    const client = createBookRuntimeClient({
      baseUrl: 'https://runtime.example',
      getIdToken: async () => 'firebase-token',
      fetchImpl,
    });

    await expect(client.submitActivity({
      ...address,
      operationId,
      draftOperationId,
      clientRevision: 3,
      response: { interactionId: 'interaction-1', text: 'final response' },
    })).resolves.toMatchObject({
      status: 'accepted',
      resultStatus: 'pending_review',
      completionStatus: 'completed',
      receipt: { attemptId: 'attempt-1', attemptNumber: 2 },
    });

    const draftRequest = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const submitRequest = fetchImpl.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(draftRequest.body))).toMatchObject({
      operationId: draftOperationId,
      commandKind: 'autosave',
      clientRevision: 3,
    });
    expect(JSON.parse(String(submitRequest.body))).toMatchObject({
      operationId,
      commandKind: 'submit',
      clientRevision: 4,
    });
  });

  it('rejects a terminal response without an immutable attempt receipt', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        status: 'accepted',
        receipt: {
          operationId: draftOperationId,
          status: 'accepted',
          bindingId: 'binding-1',
          draftRevision: 1,
          createdAt: '2026-07-28T00:00:00.000Z',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'accepted',
        resultStatus: 'pending_review',
        completionStatus: 'completed',
        receipt: {
          operationId,
          status: 'accepted',
          bindingId: 'binding-1',
          createdAt: '2026-07-28T00:00:01.000Z',
        },
      }));
    const client = createBookRuntimeClient({
      baseUrl: 'https://runtime.example',
      getIdToken: async () => 'firebase-token',
      fetchImpl,
    });

    await expect(client.submitActivity({
      ...address,
      operationId,
      draftOperationId,
      clientRevision: 0,
      response: { text: 'final response' },
    })).rejects.toMatchObject<BookRuntimeClientError>({ code: 'invalid_response' });
  });

  it('rejects a terminal response without a stable attempt number', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        status: 'accepted',
        receipt: {
          operationId: draftOperationId,
          status: 'accepted',
          bindingId: 'binding-1',
          draftRevision: 1,
          createdAt: '2026-07-28T00:00:00.000Z',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'accepted',
        resultStatus: 'pending_review',
        completionStatus: 'completed',
        receipt: {
          operationId,
          status: 'accepted',
          bindingId: 'binding-1',
          attemptId: 'attempt-1',
          createdAt: '2026-07-28T00:00:01.000Z',
        },
      }));
    const client = createBookRuntimeClient({
      baseUrl: 'https://runtime.example',
      getIdToken: async () => 'firebase-token',
      fetchImpl,
    });

    await expect(client.submitActivity({
      ...address,
      operationId,
      draftOperationId,
      clientRevision: 0,
      response: { text: 'final response' },
    })).rejects.toMatchObject<BookRuntimeClientError>({ code: 'invalid_response' });
  });

  it('rejects forbidden response fields before any network write', async () => {
    const fetchImpl = vi.fn();
    const client = createBookRuntimeClient({
      baseUrl: 'https://runtime.example',
      getIdToken: async () => 'token',
      fetchImpl,
    });

    await expect(client.saveDraft({
      ...address,
      operationId,
      clientRevision: 0,
      response: { timerState: 12 },
    })).rejects.toMatchObject<BookRuntimeClientError>({ code: 'invalid_response' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps CAS conflict typed and does not turn it into a successful save', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      code: 'runtime_cas_conflict',
      currentRevision: 4,
    }, 409));
    const client = createBookRuntimeClient({
      baseUrl: 'https://runtime.example',
      getIdToken: async () => 'token',
      fetchImpl,
    });

    await expect(client.saveDraft({
      ...address,
      operationId,
      clientRevision: 2,
      response: { text: 'draft' },
    })).rejects.toMatchObject({ code: 'conflict', status: 409, currentRevision: 4 });
  });
});
