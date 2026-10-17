import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookRuntimeViewerAdapterView, createBookRuntimeViewerAdapter } from './BookRuntimeViewerAdapter';

const hostProps = vi.hoisted(() => vi.fn());

afterEach(cleanup);

vi.mock('./BookPdfViewerHost', () => ({
  BookPdfViewerHost: (props: {
    title: string;
    route: { opaqueRouteKey: string; sourceVersionId?: string; expectedByteLength?: number; expectedEtag?: string };
    initialPage?: number;
  }) => {
    hostProps(props);
    return <div data-testid="pdf-host">{props.title}:{props.route.opaqueRouteKey}:{props.route.expectedByteLength}:{props.initialPage}</div>;
  },
}));

describe('BookRuntimeViewerAdapter', () => {
  it('renders a clear unavailable state when the Delivery request is null', () => {
    render(<BookRuntimeViewerAdapterView title="Book" request={null} combinedPhysicalPage={3} />);
    expect(screen.getByRole('status')).toHaveTextContent('Book reference unavailable');
    expect(screen.queryByTestId('pdf-host')).toBeNull();
  });

  it('maps the source-free document request and combined page to BookPdfViewerHost', () => {
    const onRouteExpired = vi.fn();
    const adapter = createBookRuntimeViewerAdapter({ title: 'Reference', onRouteExpired });
    render(adapter.render({
      activeActivityId: 'activity-1', pageGroupKey: 'page-group-1', combinedPhysicalPage: 7,
      request: {
        opaqueRouteKey: 'book--delivery-1-student-document', expectedByteLength: 1024,
        expectedEtag: '"student-document"',
      }, view: 'split',
    }));
    expect(screen.getByTestId('pdf-host')).toHaveTextContent('Reference:book--delivery-1-student-document:1024:7');
    expect(hostProps.mock.calls.at(-1)?.[0].onRouteExpired).toBe(onRouteExpired);
  });

  it('keeps the existing single-source full-PDF request for BookPdfViewerHost', () => {
    render(<BookRuntimeViewerAdapterView
      title="Book"
      combinedPhysicalPage={3}
      request={{
        sourceKey: 'full', sourceVersionId: 'version-1', opaqueRouteKey: 'full',
        localPageScope: { kind: 'all', pages: [] },
      }}
    />);
    expect(hostProps.mock.calls.at(-1)?.[0].route).toEqual({
      opaqueRouteKey: 'full', sourceVersionId: 'version-1',
      expectedByteLength: undefined, expectedEtag: undefined,
    });
    expect(hostProps.mock.calls.at(-1)?.[0].initialPage).toBe(3);
  });

  it('keeps the semantic PDF route stable across unrelated rerenders', () => {
    const request = {
      opaqueRouteKey: 'book--delivery-1-student-document', expectedByteLength: 1024,
      expectedEtag: '"student-document"',
    };
    const view = render(
      <BookRuntimeViewerAdapterView title="First" request={request} combinedPhysicalPage={7} />,
    );
    const firstRoute = hostProps.mock.calls.at(-1)?.[0].route;
    view.rerender(
      <BookRuntimeViewerAdapterView title="Second" request={{ ...request }} combinedPhysicalPage={7} />,
    );
    expect(hostProps.mock.calls.at(-1)?.[0].route).toBe(firstRoute);
  });

  it('keeps the document route stable when the selected physical page changes', () => {
    const request = {
      opaqueRouteKey: 'book--delivery-1-student-document', expectedByteLength: 1024,
    };
    const view = render(
      <BookRuntimeViewerAdapterView title="Book" request={request} combinedPhysicalPage={7} />,
    );
    const firstRoute = hostProps.mock.calls.at(-1)?.[0].route;
    view.rerender(
      <BookRuntimeViewerAdapterView title="Book" request={request} combinedPhysicalPage={9} />,
    );
    expect(hostProps.mock.calls.at(-1)?.[0].route).toBe(firstRoute);
    expect(hostProps.mock.calls.at(-1)?.[0].initialPage).toBe(9);
  });
});
