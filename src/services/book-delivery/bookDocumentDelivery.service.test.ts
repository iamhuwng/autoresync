import { describe, expect, it, vi } from 'vitest';
import {
  createBookDeliveryComponentDocumentTransport,
  selectBookDeliveryComponent,
} from './bookDocumentDelivery.service';
import type { BookDeliveryComponentProjection } from './bookDeliveryComponentProjection.types';

const component = {
  componentId: 'component-a',
  sourceKey: 'component-a',
  sourceVersionId: 'source-a-v1',
  sourceOrder: 1,
  ownerNodeKey: 'node-a',
  localPageScope: { kind: 'pages' as const, pages: [1, 2] },
  documentRequest: {
    sourceKey: 'component-a',
    sourceVersionId: 'source-a-v1',
    opaqueRouteKey: 'opaque-component-a',
    localPageScope: { kind: 'pages' as const, pages: [1, 2] },
  },
  placementIds: ['placement-a'],
  activityIds: ['activity-a'],
};

const projection: BookDeliveryComponentProjection = {
  strategy: 'component_pdfs',
  components: [component],
  fullPdfRequest: null,
};

describe('bookDocumentDelivery', () => {
  it('selects one authorized component and maps only its opaque route metadata', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('http://localhost/v1/book-delivery/document/opaque-component-a');
      expect(init).toMatchObject({ method: 'HEAD', credentials: 'omit' });
      return new Response(null, {
        status: 200,
        headers: {
          'accept-ranges': 'bytes',
          'content-length': '2',
          'content-type': 'application/pdf',
          etag: `"${'a'.repeat(64)}"`,
        },
      });
    });
    const selected = selectBookDeliveryComponent(projection, 'component-a');
    expect(selected).toBe(component);
    expect(selectBookDeliveryComponent(projection, 'component-secret')).toBeNull();

    const transport = createBookDeliveryComponentDocumentTransport({
      component: selected!,
      workerOrigin: 'http://localhost',
      getIdToken: async () => 'student-token',
      fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(transport.head()).resolves.toMatchObject({ sourceVersionId: 'source-a-v1' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
