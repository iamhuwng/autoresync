import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookPdfViewerHost } from './BookPdfViewerHost';

const viewer = vi.fn(({ documentTitle }: { readonly documentTitle: string }) => (
  <div data-testid="book-pdf-viewer">{documentTitle}</div>
));

vi.mock('./BookPdfViewer', () => ({
  BookPdfViewer: (props: { readonly documentTitle: string }) => viewer(props),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BookPdfViewerHost', () => {
  it('builds the transport from the route and tears it down on unmount', async () => {
    const destroy = vi.fn();
    const getIdToken = vi.fn(async () => 'viewer-token');
    const transportFactory = vi.fn(() => ({
      head: vi.fn(),
      get: vi.fn(),
      switchRoute: vi.fn(),
      destroy,
      activeRequestCount: 0,
    }));

    const { unmount } = render(
      <BookPdfViewerHost
        route={{
          workerOrigin: 'https://worker.example/',
          opaqueRouteKey: 'opaque-1',
          sourceVersionId: 'source-v1',
        }}
        title="Smoke PDF"
        getIdToken={getIdToken}
        transportFactory={transportFactory as never}
      />,
    );

    expect(transportFactory).toHaveBeenCalledWith(expect.objectContaining({
      route: expect.objectContaining({
        opaqueRouteKey: 'opaque-1',
        sourceVersionId: 'source-v1',
      }),
      getIdToken: expect.any(Function),
    }));
    const factoryOptions = transportFactory.mock.calls[0]?.[0] as {
      readonly getIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
    };
    await expect(factoryOptions.getIdToken?.(true)).resolves.toBe('viewer-token');
    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('book-pdf-viewer')).toHaveTextContent('Smoke PDF');

    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
