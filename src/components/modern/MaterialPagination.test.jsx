import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MaterialPagination from './MaterialPagination';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup() {
  const onLoadMore = vi.fn();
  const props = { count: 25, hasMore: true, loading: false, scopeKey: 'public', onLoadMore };
  const view = render(<MaterialPagination {...props} />);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 600, bottom: 700 });
  Object.defineProperty(document, 'scrollingElement', { configurable: true,
    value: { scrollTop: 1000, scrollHeight: 1000 + window.innerHeight } });
  return { props, ...view };
}

describe('MaterialPagination', () => {
  it('shows one compact count and keeps the button available', () => {
    const { props } = setup();
    expect(screen.getByText('25 loaded - Recent first')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    fireEvent.wheel(window, { deltaY: 100 });
    expect(props.onLoadMore).toHaveBeenCalledExactlyOnceWith('button');
  });

  it('requires a downward wheel at the bottom and locks until the page finishes', () => {
    const { props, rerender } = setup();
    expect(props.onLoadMore).not.toHaveBeenCalled();
    document.scrollingElement.scrollTop = 900;
    fireEvent.wheel(window, { deltaY: 100 });
    document.scrollingElement.scrollTop = 1000;
    fireEvent.wheel(window, { deltaY: -100 });
    fireEvent.wheel(window, { deltaY: 100, ctrlKey: true });
    expect(props.onLoadMore).not.toHaveBeenCalled();
    fireEvent.wheel(window, { deltaY: 100 });
    fireEvent.wheel(window, { deltaY: 100 });
    expect(props.onLoadMore).toHaveBeenCalledExactlyOnceWith('wheel');
    rerender(<MaterialPagination {...props} loading />);
    fireEvent.wheel(window, { deltaY: 100 });
    expect(props.onLoadMore).toHaveBeenCalledTimes(1);
    rerender(<MaterialPagination {...props} count={50} />);
    expect(props.onLoadMore).toHaveBeenCalledTimes(1);
    fireEvent.wheel(window, { deltaY: 100 });
    expect(props.onLoadMore).toHaveBeenCalledTimes(2);
    rerender(<MaterialPagination {...props} count={51} hasMore={false} />);
    fireEvent.wheel(window, { deltaY: 100 });
    expect(props.onLoadMore).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('ignores offscreen footers and wheel gestures in dialogs or scrollable panels', () => {
    const { props } = setup();
    Element.prototype.getBoundingClientRect.mockReturnValueOnce({ top: 2000, bottom: 2100 });
    fireEvent.wheel(window, { deltaY: 100 });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    fireEvent.wheel(window, { deltaY: 100 });
    dialog.remove();
    const panel = document.createElement('div');
    panel.style.overflowY = 'auto';
    Object.defineProperty(panel, 'scrollHeight', { value: 200 });
    Object.defineProperty(panel, 'clientHeight', { value: 100 });
    document.body.append(panel);
    fireEvent.wheel(panel, { deltaY: 100 });
    panel.remove();
    expect(props.onLoadMore).not.toHaveBeenCalled();
  });
});
