import { describe, expect, it, vi } from 'vitest';
import { InMemoryBookDeliveryRepository } from '../../src/services/book-delivery/bookDelivery.entitlementRepository';
import { makeBookDeliveryTestBinding } from './book-delivery-worker.test';
import {
  authorizeBookDocumentRequest,
  createBookDocumentAuthorizationHost,
} from '../src/upload-worker/book-delivery/documentAuthorization';

const operation = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const env = {
  FIREBASE_PROJECT_ID: 'project',
  BOOK_DELIVERY_SERVICE_IDENTITY: 'book-delivery@example.iam.gserviceaccount.com',
  readDatabaseValue: async () => ({ role: 'student', status: 'active' }),
} as const;

const verifier = {
  verifyAuthorizationHeader: vi.fn(async (header: string | null) =>
    header === 'Bearer student-token'
      ? { valid: true, uid: 'teacher-1' }
      : { valid: false }),
};

const studentBinding = () => {
  const binding = structuredClone(makeBookDeliveryTestBinding()) as any;
  binding.recipient = { ...binding.recipient, recipientKind: 'student' };
  binding.context = {
    ...binding.context,
    contextId: 'solo-1',
    kind: 'solo',
    entitlementBasis: 'solo',
  };
  return binding;
};

const readyRepository = async () => {
  const repository = new InMemoryBookDeliveryRepository();
  await repository.createDraft({
    binding: studentBinding(),
    operationId: operation(1),
    now: '2026-07-26T00:00:00.000Z',
  });
  await repository.activate({
    bindingId: 'binding-worker',
    expectedRecordRevision: 0,
    operationId: operation(2),
    now: '2026-07-26T00:01:00.000Z',
  });
  return repository;
};

describe('Ticket #51 Book document authorization', () => {
  const liveAuthority = (overrides: Partial<{
    publicationStatus: 'published' | 'unpublished';
    scheduleOpen: boolean;
    sourceVersionIds: string[];
    revokedSourceVersionIds: string[];
    sourceLocations: Array<{
      sourceVersionId: string;
      provider: 'b2';
      bucket: string;
      objectKey: string;
      providerFileId: string;
      providerFileVersionId: string;
    }>;
  }> = {}) => ({
    publicationStatus: 'published' as const,
    scheduleOpen: true,
    sourceVersionIds: ['source-v1'],
    revokedSourceVersionIds: [] as string[],
    sourceLocations: [{
      sourceVersionId: 'source-v1',
      provider: 'b2' as const,
      bucket: 'book-source',
      objectKey: 'private/book-source-1.pdf',
      providerFileId: 'file-1',
      providerFileVersionId: 'version-1',
    }],
    ...overrides,
  });

  it('returns only a server-only current pinned-source decision', async () => {
    const repository = await readyRepository();
    const result = await authorizeBookDocumentRequest({
      repository,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'solo-1',
      profile: { role: 'student', status: 'active' },
      readCurrentAuthority: async () => ({
        publicationStatus: 'published',
        scheduleOpen: true,
        sourceVersionIds: ['source-v1'],
        revokedSourceVersionIds: [],
        sourceLocations: [{
          sourceVersionId: 'source-v1',
          provider: 'b2',
          bucket: 'book-source',
          objectKey: 'private/book-source-1.pdf',
          providerFileId: 'file-1',
          providerFileVersionId: 'version-1',
        }],
      }),
    });
    expect(result).toMatchObject({
      ok: true,
      decision: {
        kind: 'book-document-authorized',
        uid: 'teacher-1',
        bindingId: 'binding-worker',
        bookId: 'book-pdf-1',
        publicationId: 'publication-1',
        sourceVersionIds: ['source-v1'],
          sourceLocations: [{ provider: 'b2', objectKey: 'private/book-source-1.pdf' }],
      },
    });
    if (!result.ok) return;
  });

  it('fails closed for wrong identity, inactive profile, future-live, and stale state', async () => {
    const repository = await readyRepository();
    await expect(authorizeBookDocumentRequest({
      repository,
      uid: 'other-user',
      recipientId: 'teacher-1',
      contextId: 'solo-1',
      profile: { role: 'student', status: 'active' },
      readCurrentAuthority: async () => {
        throw new Error('must not run');
      },
    })).resolves.toMatchObject({ ok: false, code: 'unauthorized' });
    await expect(authorizeBookDocumentRequest({
      repository,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'solo-1',
      profile: { role: 'student', status: 'disabled' },
      readCurrentAuthority: async () => {
        throw new Error('must not run');
      },
    })).resolves.toMatchObject({ ok: false, code: 'inactive-profile' });
    const preview = studentBinding();
    preview.recipient.recipientKind = 'preview-user';
    preview.status = 'active';
    const previewRepository = {
      resolveCurrent: async () => ({
        record: {
          binding: preview,
          recordRevision: 1,
          status: 'active',
          createdAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T00:01:00.000Z',
        },
        pointer: {
          bindingId: preview.bindingId,
          bindingRevision: preview.revision,
          recipientId: preview.recipient.recipientId,
          contextId: preview.context.contextId,
          contextKind: preview.context.kind,
          status: 'active',
          updatedAt: '2026-07-26T00:01:00.000Z',
        },
      }),
    } as any;
    await expect(authorizeBookDocumentRequest({
      repository: previewRepository,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'solo-1',
      profile: { role: 'student', status: 'active' },
      readCurrentAuthority: async () => {
        throw new Error('must not run');
      },
    })).resolves.toMatchObject({ ok: false, code: 'stale-binding' });
    const future = studentBinding();
    future.context = { ...future.context, kind: 'future_live', entitlementBasis: 'reserved' };
    future.status = 'active';
    const futureRepository = {
      resolveCurrent: async () => ({
        record: {
          binding: future,
          recordRevision: 1,
          status: 'active',
          createdAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T00:01:00.000Z',
        },
        pointer: {
          bindingId: future.bindingId,
          bindingRevision: future.revision,
          recipientId: future.recipient.recipientId,
          contextId: future.context.contextId,
          contextKind: 'future_live',
          status: 'active',
          updatedAt: '2026-07-26T00:01:00.000Z',
        },
      }),
    } as any;
    await expect(authorizeBookDocumentRequest({
      repository: futureRepository,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'solo-1',
      profile: { role: 'student', status: 'active' },
      readCurrentAuthority: async () => ({
        publicationStatus: 'published',
        scheduleOpen: true,
        sourceVersionIds: ['source-v1'],
        revokedSourceVersionIds: [],
        sourceLocations: [],
      }),
    })).resolves.toMatchObject({ ok: false, code: 'unsupported-context' });
  });

  it('fails closed for unpublished, closed-schedule, revoked, mismatched, and unsafe authority', async () => {
    const repository = await readyRepository();
    const base = {
      repository,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'solo-1',
      profile: { role: 'student', status: 'active' },
    } as const;
    await expect(authorizeBookDocumentRequest({
      ...base,
      readCurrentAuthority: async () => liveAuthority({ publicationStatus: 'unpublished' }),
    })).resolves.toMatchObject({ ok: false, code: 'unpublished' });
    await expect(authorizeBookDocumentRequest({
      ...base,
      readCurrentAuthority: async () => liveAuthority({ scheduleOpen: false }),
    })).resolves.toMatchObject({ ok: false, code: 'stale-binding' });
    await expect(authorizeBookDocumentRequest({
      ...base,
      readCurrentAuthority: async () => liveAuthority({
        revokedSourceVersionIds: ['source-v1'],
      }),
    })).resolves.toMatchObject({ ok: false, code: 'stale-binding' });
    await expect(authorizeBookDocumentRequest({
      ...base,
      readCurrentAuthority: async () => liveAuthority({
        sourceVersionIds: ['source-v2'],
      }),
    })).resolves.toMatchObject({ ok: false, code: 'stale-binding' });
    await expect(authorizeBookDocumentRequest({
      ...base,
      readCurrentAuthority: async () => liveAuthority({
        sourceLocations: [{
          ...liveAuthority().sourceLocations[0],
          sourceVersionId: 'source-v1',
          objectKey: 'private/../secret.pdf',
        }],
      }),
    })).resolves.toMatchObject({ ok: false, code: 'stale-binding' });
  });

  it('verifies Bearer auth before profile or repository access and denies query tokens', async () => {
    const repository = await readyRepository();
    const resolveCurrent = vi.spyOn(repository, 'resolveCurrent');
    const readDatabaseValue = vi.fn(async () => ({ role: 'student', status: 'active' }));
    const host = createBookDocumentAuthorizationHost({
      repository,
      verifier,
      resolveRouteKey: async (routeKey) =>
        routeKey === 'opaque-route-1'
          ? { recipientId: 'teacher-1', contextId: 'solo-1' }
          : null,
      readCurrentAuthority: async () => ({
        publicationStatus: 'published',
        scheduleOpen: true,
        sourceVersionIds: ['source-v1'],
        revokedSourceVersionIds: [],
        sourceLocations: [{
          sourceVersionId: 'source-v1',
          provider: 'b2',
          bucket: 'book-source',
          objectKey: 'private/book-source-1.pdf',
          providerFileId: 'file-1',
          providerFileVersionId: 'version-1',
        }],
      }),
    });
    const unauthorized = await host.fetch(
      new Request('https://worker.test/v1/book-delivery/document/opaque-route-1'),
      { ...env, readDatabaseValue },
    );
    expect(unauthorized.status).toBe(401);
    expect(readDatabaseValue).not.toHaveBeenCalled();
    expect(resolveCurrent).not.toHaveBeenCalled();

    const queryToken = await host.fetch(
      new Request('https://worker.test/v1/book-delivery/document/opaque-route-1?token=secret', {
        headers: { authorization: 'Bearer student-token' },
      }),
      { ...env, readDatabaseValue },
    );
    expect(queryToken.status).toBe(404);

    const authorized = await host.fetch(
      new Request('https://worker.test/v1/book-delivery/document/opaque-route-1', {
        headers: { authorization: 'Bearer student-token' },
      }),
      { ...env, readDatabaseValue },
    );
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual({ status: 'authorized' });
    expect(authorized.headers.get('cache-control')).toBe('no-store');
    expect(authorized.headers.get('x-book-server-only')).toBe('1');
    expect(resolveCurrent).toHaveBeenCalledTimes(1);
  });

  it('re-runs current authority for HEAD, range-shaped, refresh, and resume requests', async () => {
    const repository = await readyRepository();
    const resolveCurrent = vi.spyOn(repository, 'resolveCurrent');
    const readCurrentAuthority = vi.fn(async () => liveAuthority());
    const host = createBookDocumentAuthorizationHost({
      repository,
      verifier,
      resolveRouteKey: async () => ({ recipientId: 'teacher-1', contextId: 'solo-1' }),
      readCurrentAuthority,
    });
    const request = (url: string, init: RequestInit = {}) => new Request(
      `https://worker.test${url}`,
      {
        ...init,
        headers: {
          authorization: 'Bearer student-token',
          ...(init.headers ?? {}),
        },
      },
    );
    for (const [method, headers] of [
      ['HEAD', {}],
      ['GET', { range: 'bytes=0-10' }],
      ['GET', { 'x-book-refresh': '1' }],
      ['GET', { 'x-book-resume': '1' }],
    ] as const) {
      const response = await host.fetch(request('/v1/book-delivery/document/opaque-route-1', {
        method,
        headers,
      }), { ...env });
      expect(response.status).toBe(200);
    }
    expect(resolveCurrent).toHaveBeenCalledTimes(4);
    expect(readCurrentAuthority).toHaveBeenCalledTimes(4);
  });

  it('does not expose provider identity or token content on denial or host failure', async () => {
    const repository = await readyRepository();
    const host = createBookDocumentAuthorizationHost({
      repository,
      verifier,
      resolveRouteKey: async () => ({ recipientId: 'teacher-1', contextId: 'solo-1' }),
      readCurrentAuthority: async () => {
        throw new Error('secret-provider-file-id private/book-source-1.pdf Bearer student-token');
      },
    });
    const response = await host.fetch(
      new Request('https://worker.test/v1/book-delivery/document/opaque-route-1', {
        headers: { authorization: 'Bearer student-token' },
      }),
      { ...env },
    );
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toBe('{"code":"authorization_unavailable"}');
    expect(body).not.toContain('secret-provider-file-id');
    expect(body).not.toContain('student-token');
  });
});
