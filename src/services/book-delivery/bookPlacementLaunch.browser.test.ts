import { describe, expect, it, vi } from 'vitest';
import {
  classBookBindingContextId,
} from './classBookPlacement.types';
import type { BookRuntimeDeliveryProjection } from './bookDelivery.types';
import {
  parseBookPlacementLaunchQuery,
  resolveBookPlacementLaunch,
  createBookHomeworkPlacementBrowserClient,
  createPublicBookPlacementBrowserClient,
} from './bookPlacementLaunch.browser';

const courseQuery = '?bookSurface=course&courseMaterialId=course-material-1&bindingId=binding-1';
const classQuery = '?bookSurface=class&classId=class-1&copyId=copy-1&classPlacementId=placement-1&classCourseMaterialId=course-material-1&bindingId=binding-1';
const homeworkQuery = '?bookSurface=homework&homeworkId=homework-1';
const soloQuery = '?bookSurface=solo&contextId=solo-1';
const publicQuery = '?bookSurface=public&bookId=book-1';

const projection = (kind: 'solo' | 'course' | 'class' | 'homework' | 'public', contextId: string, overrides: Partial<BookRuntimeDeliveryProjection> = {}): BookRuntimeDeliveryProjection => ({
  schemaVersion: 1,
  projectionKind: 'book-runtime-delivery',
  bindingId: 'binding-1',
  bindingRevision: 2,
  recipientId: 'student-1',
  context: {
    contextId,
    kind,
    entitlementBasis: kind === 'solo' ? 'solo' : kind === 'course' ? 'enrollment' : kind === 'class' ? 'membership' : kind === 'homework' ? 'assignment' : 'public-library',
  },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: ['placement-1'] },
  outline: [],
  sourceSet: { strategy: 'full_pdf', sources: [] },
  documentRequests: [],
  activities: [],
  actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
  provenance: {
    publicationId: 'publication-1', publicationRevision: 1,
    bindingId: 'binding-1', bindingRevision: 2,
  },
  ...overrides,
});

describe('Book placement launch boundary', () => {
  it('accepts one source-free component document but still rejects malformed activity identity', async () => {
    const launch = parseBookPlacementLaunchQuery(courseQuery);
    if (launch.kind !== 'course') throw new Error('fixture parse failed');
    const combined = projection('course', 'course-material-1', {
      sourceSet: { strategy: 'component_pdfs', sources: [] },
      documentRequests: [{ opaqueRouteKey: 'opaque-student-document', expectedByteLength: 578 }],
    });
    const resolve = (value: unknown) => resolveBookPlacementLaunch({
      launch, studentId: 'student-1', clients: { course: { current: vi.fn(async () => value) } },
    });
    await expect(resolve(combined)).resolves.toMatchObject({ status: 'resolved' });
    await expect(resolve({ ...combined, activities: [{ placementId: 'bad' }] }))
      .resolves.toMatchObject({ status: 'blocked', reason: 'projection-kind-mismatch' });
  });

  it.each([
    [courseQuery, 'course'],
    [classQuery, 'class'],
    [homeworkQuery, 'homework'],
    [soloQuery, 'solo'],
  ])('parses exact valid %s launch identity', (query, kind) => {
    expect(parseBookPlacementLaunchQuery(query)).toMatchObject({ kind, explicit: true });
  });

  it.each([
    '',
    '?materialId=book-1',
    '?courseMaterialId=course-material-1&bindingId=binding-1',
  ])('does not authorize a legacy or bare-material query: %s', (query) => {
    expect(parseBookPlacementLaunchQuery(query)).toEqual({ kind: 'none', explicit: false });
  });

  it.each([
    '?bookSurface=course&bindingId=binding-1',
    '?bookSurface=class&classId=class-1&copyId=copy-1&classPlacementId=placement-1&bindingId=binding-1',
    `${courseQuery}&materialId=forged`,
    `${courseQuery}&bindingId=other`,
    '?bookSurface=course&courseMaterialId=course-material-1&bindingId=binding-1&bindingId=binding-2',
    '?bookSurface=other&courseMaterialId=course-material-1&bindingId=binding-1',
  ])('rejects malformed or extra stable identity: %s', (query) => {
    expect(parseBookPlacementLaunchQuery(query)).toMatchObject({ kind: 'invalid', explicit: true });
  });

  it('resolves Course only when canonical context, binding, and recipient match', async () => {
    const current = vi.fn(async () => projection('course', 'course-material-1'));
    const launch = parseBookPlacementLaunchQuery(courseQuery);
    if (launch.kind !== 'course') throw new Error('fixture parse failed');

    await expect(resolveBookPlacementLaunch({
      launch,
      studentId: 'student-1',
      clients: { course: { current } },
    })).resolves.toMatchObject({ status: 'resolved', projection: { bindingId: 'binding-1' } });

    await expect(resolveBookPlacementLaunch({
      launch,
      studentId: 'student-1',
      clients: { course: { current: vi.fn(async () => projection('course', 'other-material')) } },
    })).resolves.toMatchObject({ status: 'blocked', reason: 'context-mismatch' });

    await expect(resolveBookPlacementLaunch({
      launch,
      studentId: 'student-1',
      clients: { course: { current: vi.fn(async () => projection('course', 'course-material-1', {
        bindingId: 'other-binding',
        provenance: {
          publicationId: 'publication-1', publicationRevision: 1,
          bindingId: 'other-binding', bindingRevision: 2,
        },
      })) } },
    })).resolves.toMatchObject({ status: 'blocked', reason: 'binding-mismatch' });

    await expect(resolveBookPlacementLaunch({
      launch,
      studentId: 'other-student',
      clients: { course: { current } },
    })).resolves.toMatchObject({ status: 'blocked', reason: 'recipient-mismatch' });

    const malformed = projection('course', 'course-material-1') as unknown as Record<string, unknown>;
    delete malformed.activities;
    await expect(resolveBookPlacementLaunch({
      launch,
      studentId: 'student-1',
      clients: { course: { current: vi.fn(async () => malformed) } },
    })).resolves.toMatchObject({ status: 'blocked', reason: 'projection-kind-mismatch' });
  });

  it('resolves Class only from the canonical class context and rejects legacy class delivery', async () => {
    const launch = parseBookPlacementLaunchQuery(classQuery);
    if (launch.kind !== 'class') throw new Error('fixture parse failed');
    const contextId = classBookBindingContextId('class-1', 'copy-1', 'course-material-1', 'placement-1');
    const resolveCurrent = vi.fn(async () => projection('class', contextId));

    await expect(resolveBookPlacementLaunch({
      launch,
      studentId: 'student-1',
      clients: { class: { resolveCurrent } },
    })).resolves.toMatchObject({ status: 'resolved' });
    expect(resolveCurrent).toHaveBeenCalledWith({
      classId: 'class-1', copyId: 'copy-1', classPlacementId: 'placement-1',
      classCourseMaterialId: 'course-material-1', bindingId: 'binding-1',
    });

    await expect(resolveBookPlacementLaunch({
      launch,
      studentId: 'student-1',
      clients: { class: { resolveCurrent: vi.fn(async () => ({ projectionKind: 'class-book-delivery-v1' })) } },
    })).resolves.toMatchObject({ status: 'blocked', reason: 'legacy-projection' });
  });

  it('resolves Homework only from the exact canonical assignment context', async () => {
    const launch = parseBookPlacementLaunchQuery(homeworkQuery);
    if (launch.kind !== 'homework') throw new Error('fixture parse failed');
    const current = vi.fn(async () => projection('homework', 'homework-1'));

    await expect(resolveBookPlacementLaunch({
      launch,
      studentId: 'student-1',
      clients: { homework: { current } },
    })).resolves.toMatchObject({ status: 'resolved', projection: { context: { kind: 'homework' } } });
    expect(current).toHaveBeenCalledWith('homework-1');

    await expect(resolveBookPlacementLaunch({
      launch,
      studentId: 'student-1',
      clients: { homework: { current: vi.fn(async () => projection('course', 'homework-1')) } },
    })).resolves.toMatchObject({ status: 'blocked', reason: 'context-mismatch' });

    await expect(resolveBookPlacementLaunch({
        launch,
        studentId: 'other-student',
        clients: { homework: { current } },
    })).resolves.toMatchObject({ status: 'blocked', reason: 'recipient-mismatch' });

    await expect(resolveBookPlacementLaunch({
        launch,
        studentId: 'student-1',
        clients: {
            homework: {
                current: vi.fn(async () => ({ projectionKind: 'book-homework-delivery-v1' })),
            },
        },
    })).resolves.toMatchObject({ status: 'blocked', reason: 'legacy-projection' });

    await expect(resolveBookPlacementLaunch({
        launch,
        studentId: 'student-1',
        clients: {
            homework: {
                current: vi.fn(async () => ({ projectionKind: 'book-runtime-delivery' } as unknown as BookRuntimeDeliveryProjection)),
            },
        },
    })).resolves.toMatchObject({ status: 'blocked', reason: 'projection-kind-mismatch' });
});

  it('reads the exact Homework Delivery route with the authenticated recipient', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(projection('homework', 'homework-1')), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const client = createBookHomeworkPlacementBrowserClient({
      baseUrl: 'https://worker.example.test',
      fetchImpl,
      getIdToken: async () => 'token-1',
      getCurrentUserId: () => 'student-1',
    });

    await expect(client.current('homework-1')).resolves.toMatchObject({
      context: { contextId: 'homework-1', kind: 'homework' },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example.test/book-delivery/current/student-1/homework-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
  });


  it('launches Public Library through the stable operation endpoint and validates the projection', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.operationId).toMatch(/^[0-9a-f-]{36}$/u);
      return new Response(JSON.stringify({ title: 'Public Book', projection: projection('public', 'public_c68cda6320e85f57ab1a8bcfa27b8a0a') }), { status: 200 });
    });
    const client = createPublicBookPlacementBrowserClient({ baseUrl: 'https://worker.example.test', fetchImpl, getIdToken: async () => 'token-1', getCurrentUserId: () => 'student-1' });
    await expect(client.launch('book-1')).resolves.toMatchObject({ title: 'Public Book', projection: { context: { kind: 'public', entitlementBasis: 'public-library' } } });
    expect(fetchImpl).toHaveBeenCalledWith('https://worker.example.test/v1/book-public/books/book-1/launch', expect.objectContaining({ method: 'POST' }));
    const retryIds: string[] = []; let retry = 0; const retryClient = createPublicBookPlacementBrowserClient({ baseUrl: 'https://worker.example.test', fetchImpl: vi.fn(async (_url: string, init: RequestInit) => { retryIds.push(JSON.parse(String(init.body)).operationId); retry += 1; return retry === 1 ? new Response('{}', { status: 401 }) : new Response(JSON.stringify({ title: 'Public Book', projection: projection('public', 'public_c68cda6320e85f57ab1a8bcfa27b8a0a') }), { status: 200 }); }), getIdToken: vi.fn(async (force) => force ? 'token-2' : 'token-1'), getCurrentUserId: () => 'student-1' }); await expect(retryClient.launch('book-1')).resolves.toMatchObject({ title: 'Public Book' }); expect(retryIds[0]).toBe(retryIds[1]);
    const launch = parseBookPlacementLaunchQuery(publicQuery);
    if (launch.kind !== 'public') throw new Error('fixture parse failed');
    await expect(resolveBookPlacementLaunch({ launch, studentId: 'student-1', clients: { public: { launch: vi.fn(async () => ({ title: 'Public Book', projection: projection('public', 'public_c68cda6320e85f57ab1a8bcfa27b8a0a') })) } } })).resolves.toMatchObject({ status: 'resolved' });
    await expect(resolveBookPlacementLaunch({ launch, studentId: 'other-student', clients: { public: { launch: vi.fn(async () => ({ title: 'Public Book', projection: projection('public', 'public_c68cda6320e85f57ab1a8bcfa27b8a0a') })) } } })).resolves.toMatchObject({ status: 'blocked', reason: 'context-mismatch' });
    await expect(resolveBookPlacementLaunch({ launch, studentId: 'student-1', clients: { public: { launch: vi.fn(async () => ({ title: 'Public Book', projection: projection('solo', 'public_c68cda6320e85f57ab1a8bcfa27b8a0a') })) } } })).resolves.toMatchObject({ status: 'blocked', reason: 'context-mismatch' });
  });

  it('resolves Solo only from the exact current context and recipient', async () => {
    const launch = parseBookPlacementLaunchQuery(soloQuery);
    if (launch.kind !== 'solo') throw new Error('fixture parse failed');
    const current = vi.fn(async () => projection('solo', 'solo-1'));

    await expect(resolveBookPlacementLaunch({
      launch, studentId: 'student-1', clients: { solo: { current } },
    })).resolves.toMatchObject({ status: 'resolved', projection: { context: { kind: 'solo' } } });
    expect(current).toHaveBeenCalledWith('solo-1');
    await expect(resolveBookPlacementLaunch({
      launch,
      studentId: 'student-1',
      clients: { solo: { current: vi.fn(async () => projection('solo', 'other-solo')) } },
    })).resolves.toMatchObject({ status: 'blocked', reason: 'context-mismatch' });
  });
});
