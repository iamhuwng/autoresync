import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookRuntimeViewerAdapterView, createBookRuntimeViewerAdapter } from './BookRuntimeViewerAdapter';

const hostProps = vi.hoisted(() => vi.fn());

afterEach(cleanup);

vi.mock('./BookPdfViewerHost', () => ({
  BookPdfViewerHost: (props: { title: string; route: { opaqueRouteKey: string; sourceVersionId: string; physicalPageNumber?: number } }) => {
    hostProps(props);
    return <div data-testid="pdf-host">{props.title}:{props.route.opaqueRouteKey}:{props.route.sourceVersionId}:{props.route.physicalPageNumber}</div>;
  },
}));

describe('BookRuntimeViewerAdapter', () => {
  it('renders a clear unavailable state when the Delivery request is null', () => {
    render(<BookRuntimeViewerAdapterView title="Book" request={null} physicalPageNumber={3} />);
    expect(screen.getByRole('status')).toHaveTextContent('Book reference unavailable');
    expect(screen.queryByTestId('pdf-host')).toBeNull();
  });

  it('maps the exact Delivery route and physical page to BookPdfViewerHost', () => {
    const adapter = createBookRuntimeViewerAdapter({ title: 'Reference' });
    render(adapter.render({
      activeActivityId: 'activity-1', pageGroupKey: 'page-group-1', componentId: 'component-1',
      componentOrder: 0, componentCount: 1, physicalPageNumber: 7,
      request: {
        sourceKey: 'source-1', sourceVersionId: 'version-1', opaqueRouteKey: 'opaque-1',
        localPageScope: { kind: 'pages', pages: [7] },
      }, view: 'split',
    }));
    expect(screen.getByTestId('pdf-host')).toHaveTextContent('Reference:opaque-1:version-1:7');
  });

  it('keeps the semantic PDF route stable across unrelated rerenders', () => {
    const request = {
      sourceKey: 'source-1', sourceVersionId: 'version-1', opaqueRouteKey: 'opaque-1',
      localPageScope: { kind: 'pages' as const, pages: [7] },
    };
    const view = render(
      <BookRuntimeViewerAdapterView title="First" request={request} physicalPageNumber={7} />,
    );
    const firstRoute = hostProps.mock.calls.at(-1)?.[0].route;
    view.rerender(
      <BookRuntimeViewerAdapterView title="Second" request={{ ...request }} physicalPageNumber={7} />,
    );
    expect(hostProps.mock.calls.at(-1)?.[0].route).toBe(firstRoute);
  });
});
