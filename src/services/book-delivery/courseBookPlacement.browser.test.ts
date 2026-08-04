import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_R2_UPLOAD_WORKER_URL } from '../r2WorkerEndpoint';
import {
  assertCourseBookPlacement,
  assertCourseBookRuntimeProjection,
  createCourseBookPlacementClient,
  isCourseBookPlacementPresentationEnabled,
  resolveCourseBookPlacementEndpoint,
} from './courseBookPlacement.browser';

const operationId = '11111111-1111-4111-8111-111111111111';
const selection = {
  bookId: 'book-1',
  scope: { kind: 'subtree' as const, nodeKeys: ['unit:1'], placementIds: [] as const },
};

const selectedPin = {
  placementId: 'placement-1',
  nodeKey: 'unit:1',
  unitStableKey: 'unit:1',
  unitVersionId: 'unit-version-1',
  activityId: 'activity-1',
  activityVersionId: 'activity-version-1',
  sourceVersionIds: ['source-version-1'],
};

const committedPlacement = () => ({
  courseMaterialId: 'course-material-1',
  courseId: 'course-1',
  moduleId: 'module-1',
  ownerId: 'teacher-1',
  displayTitle: 'Unit 1',
  selection: selection.scope,
  placementRevision: 1,
  completionAggregationPolicy: 'all-activities' as const,
  status: 'active' as const,
  pins: {
    bookId: 'book-1',
    publicationId: 'publication-1',
    publicationRevision: 4,
    manifestVersionId: 'manifest-1',
    bindingRevision: 1,
    selectedActivities: [selectedPin],
  },
});

const committedProjection = () => ({
  projectionKind: 'course-book-delivery-v1' as const,
  context: { kind: 'course' as const, contextId: 'course-material-1', courseId: 'course-1' },
  bindingId: 'bd-student-1',
  bindingRevision: 1,
  placementRevision: 1,
  completionAggregationPolicy: 'all-activities' as const,
  selection: selection.scope,
  pins: committedPlacement().pins,
  activityKeys: [{ placementId: 'placement-1', progressKey: 'bd-student-1:student-1:course-material-1:activity-version-1', resultKey: 'bd-student-1:student-1:course-material-1:activity-version-1' }],
});

const jsonResponse = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

const createClient = (fetchImpl: typeof fetch) => createCourseBookPlacementClient({
  env: { VITE_BOOK_DELIVERY_WORKER_URL: 'https://book-worker.example///' },
  getIdToken: async () => 'firebase-id-token',
  fetchImpl,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Course Book placement browser client', () => {
  it('uses the approved Worker fallback and requires an HTTPS base URL', () => {
    expect(isCourseBookPlacementPresentationEnabled({})).toBe(false);
    expect(isCourseBookPlacementPresentationEnabled({ VITE_BOOK_COURSE_PLACEMENT_PRESENTATION: ' enabled ' })).toBe(true);
    expect(resolveCourseBookPlacementEndpoint({})).toBe(DEFAULT_R2_UPLOAD_WORKER_URL);
    expect(resolveCourseBookPlacementEndpoint({
      VITE_R2_UPLOAD_WORKER_URL: 'https://fallback-worker.example///',
    })).toBe('https://fallback-worker.example');
    expect(() => resolveCourseBookPlacementEndpoint({
      VITE_BOOK_DELIVERY_WORKER_URL: 'http://book-worker.example',
    })).toThrow('unavailable');
  });

  it('reads and validates the owner selection catalog through the encoded route', async () => {
    const catalog = {
      bookId: 'book:1', publicationId: 'publication-1', publicationRevision: 1,
      manifestVersionId: 'manifest-1', sourceStrategy: 'component_pdfs',
      sources: [{ sourceKey: 'source-1', ownerNodeKey: 'unit-1' }],
      nodes: [
        { nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 },
        { nodeKey: 'test-1', parentNodeKey: 'unit-1', nodeType: 'test', order: 1 },
      ],
      placements: [{ placementId: 'placement-1', nodeKey: 'test-1', activityId: 'activity-1',
        activityVersionId: 'activity-version-1', sourceKeys: ['source-1'] }],
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(catalog));
    await expect(createClient(fetchImpl).catalog('book:1')).resolves.toEqual(catalog);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://book-worker.example/course-book-placement/catalog/book%3A1',
      expect.objectContaining({ method: 'GET', redirect: 'error', credentials: 'omit' }),
    );

    const mismatched = createClient(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ...catalog, bookId: 'book-2' })));
    await expect(mismatched.catalog('book:1')).rejects.toMatchObject({ code: 'response_binding_mismatch' });
  });

  it('sends an owner place command with only the committed fields and exact write headers', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      status: 'created', placement: committedPlacement(),
    }));
    const client = createClient(fetchImpl);
    const result = await client.place({
      operationId,
      courseId: 'course-1',
      moduleId: 'module-1',
      courseMaterialId: 'course-material-1',
      selection,
      pins: { forged: true },
      authority: { ownerId: 'forged-owner' },
    } as never);

    expect(result.status).toBe('created');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://book-worker.example/course-book-placement/place',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer firebase-id-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': operationId,
        },
      }),
    );
    const request = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      operationId,
      courseId: 'course-1',
      moduleId: 'module-1',
      courseMaterialId: 'course-material-1',
      selection,
    });
    expect(Object.keys(JSON.parse(String(request.body))).sort()).toEqual([
      'courseId', 'courseMaterialId', 'moduleId', 'operationId', 'selection',
    ]);
  });

  it('sends prepare, revoke, and current through exact routes with the caller identity only', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(committedProjection()))
      .mockResolvedValueOnce(jsonResponse({ status: 'revoked' }))
      .mockResolvedValueOnce(jsonResponse(committedProjection()));
    const client = createClient(fetchImpl);

    await client.prepare({ operationId, courseMaterialId: 'course-material-1', legacyEnrollmentId: 'legacy-1' });
    await client.revoke({ operationId, courseMaterialId: 'course-material-1' });
    await client.current('course:material-1');

    const [, prepareInit] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://book-worker.example/course-book-placement/prepare');
    expect(prepareInit.method).toBe('POST');
    expect(prepareInit.credentials).toBe('omit');
    expect(prepareInit.redirect).toBe('error');
    expect((prepareInit.headers as Record<string, string>)['Idempotency-Key']).toBe(operationId);
    expect(JSON.parse(String(prepareInit.body))).toEqual({
      operationId, courseMaterialId: 'course-material-1', legacyEnrollmentId: 'legacy-1',
    });

    const [, revokeInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(fetchImpl.mock.calls[1]![0]).toBe('https://book-worker.example/course-book-placement/revoke');
    expect(JSON.parse(String(revokeInit.body))).toEqual({ operationId, courseMaterialId: 'course-material-1' });
    expect((revokeInit.headers as Record<string, string>)['Idempotency-Key']).toBe(operationId);

    const [currentUrl, currentInit] = fetchImpl.mock.calls[2] as [string, RequestInit];
    expect(currentUrl).toBe('https://book-worker.example/course-book-placement/current/course%3Amaterial-1');
    expect(currentInit.method).toBe('GET');
    expect(currentInit.credentials).toBe('omit');
    expect(currentInit.redirect).toBe('error');
    expect(currentInit.body).toBeUndefined();
    expect(currentInit.headers).toEqual({ Authorization: 'Bearer firebase-id-token' });
  });

  it('rejects invalid IDs and operation IDs before issuing a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(committedProjection()));
    const client = createClient(fetchImpl);

    await expect(client.place({
      operationId: 'not-an-operation', courseId: 'course-1', moduleId: 'module-1',
      courseMaterialId: 'course-material-1', selection,
    })).rejects.toMatchObject({ code: 'invalid_operation_id' });
    await expect(client.place({
      operationId, courseId: 'course/forged', moduleId: 'module-1',
      courseMaterialId: 'course-material-1', selection,
    })).rejects.toMatchObject({ code: 'invalid_course_id' });
    await expect(client.prepare({ operationId, courseMaterialId: 'course-material-1', legacyEnrollmentId: '' }))
      .rejects.toMatchObject({ code: 'invalid_enrollment_id' });
    await expect(client.current('course material')).rejects.toMatchObject({ code: 'invalid_course_material_id' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed for empty tokens, redirects, non-2xx codes, and malformed or oversized JSON', async () => {
    const emptyToken = createCourseBookPlacementClient({
      env: { VITE_BOOK_DELIVERY_WORKER_URL: 'https://book-worker.example' },
      getIdToken: async () => '   ',
      fetchImpl: vi.fn(),
    });
    await expect(emptyToken.current('course-material-1')).rejects.toMatchObject({ code: 'unauthorized', status: 401 });

    const redirected = createClient(vi.fn<typeof fetch>().mockResolvedValue({
      redirected: true,
      url: 'https://evil.example/course-book-placement/current/course-material-1',
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(committedProjection()),
    } as Response));
    await expect(redirected.current('course-material-1')).rejects.toMatchObject({ code: 'response_binding_mismatch' });

    const denied = createClient(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ code: 'course_book_placement_denied' }, 403)));
    await expect(denied.current('course-material-1')).rejects.toMatchObject({ code: 'course_book_placement_denied', status: 403 });

    const malformed = createClient(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ projectionKind: 'book-runtime-delivery-v1' })));
    await expect(malformed.current('course-material-1')).rejects.toMatchObject({ code: 'invalid_response', status: 502 });

    const oversized = createClient(vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ payload: 'x'.repeat(1_200_001) }), { status: 200 }),
    ));
    await expect(oversized.current('course-material-1')).rejects.toMatchObject({ code: 'response_too_large', status: 502 });
  });

  it('validates placement and runtime projections without accepting storage paths or extra authority fields', () => {
    expect(() => assertCourseBookPlacement(committedPlacement())).not.toThrow();
    expect(() => assertCourseBookRuntimeProjection(committedProjection())).not.toThrow();

    expect(() => assertCourseBookPlacement({ ...committedPlacement(), storagePath: 'private/book.pdf' })).toThrow('invalid_response');
    expect(() => assertCourseBookRuntimeProjection({ ...committedProjection(), pins: { ...committedProjection().pins, storagePath: 'private/book.pdf' } })).toThrow('invalid_response');
    expect(() => assertCourseBookRuntimeProjection({ ...committedProjection(), authority: { ownerId: 'teacher-1' } })).toThrow('invalid_response');
  });
});
