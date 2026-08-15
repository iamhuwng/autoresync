import { describe, expect, it, vi } from 'vitest';
import {
  classBookBindingContextId,
} from './classBookPlacement.types';
import type { BookRuntimeDeliveryProjection } from './bookDelivery.types';
import {
  parseBookPlacementLaunchQuery,
  resolveBookPlacementLaunch,
  createBookHomeworkPlacementBrowserClient,
} from './bookPlacementLaunch.browser';

const courseQuery = '?bookSurface=course&courseMaterialId=course-material-1&bindingId=binding-1';
const classQuery = '?bookSurface=class&classId=class-1&copyId=copy-1&classPlacementId=placement-1&classCourseMaterialId=course-material-1&bindingId=binding-1';
const homeworkQuery = '?bookSurface=homework&homeworkId=homework-1';

const projection = (kind: 'course' | 'class' | 'homework', contextId: string, overrides: Partial<BookRuntimeDeliveryProjection> = {}): BookRuntimeDeliveryProjection => ({
  schemaVersion: 1,
  projectionKind: 'book-runtime-delivery',
  bindingId: 'binding-1',
  bindingRevision: 2,
  recipientId: 'student-1',
  context: {
    contextId,
    kind,
    entitlementBasis: kind === 'course' ? 'enrollment' : kind === 'class' ? 'membership' : 'assignment',
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
  it.each([
    [courseQuery, 'course'],
    [classQuery, 'class'],
    [homeworkQuery, 'homework'],
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
});
