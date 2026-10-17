import React, { useCallback, useEffect, useRef } from 'react';
import './MaterialPagination.css';

export default function MaterialPagination({ count, hasMore, loading, scopeKey, onLoadMore }) {
  const footerRef = useRef(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!loading) requested.current = false;
  }, [loading, count, scopeKey, hasMore]);

  const loadMore = useCallback((source) => {
    if (!hasMore || loading || requested.current) return;
    requested.current = true;
    onLoadMore(source);
  }, [hasMore, loading, onLoadMore]);

  useEffect(() => {
    const onWheel = (event) => {
      if (event.deltaY <= 0 || event.ctrlKey || Math.abs(event.deltaX) > event.deltaY) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      // A wheel gesture inside another scrollable surface belongs to that surface.
      for (let node = event.target; node instanceof Element && node !== document.body; node = node.parentElement) {
        if (node.matches('textarea, select') || (node.scrollHeight > node.clientHeight
          && /auto|scroll/.test(getComputedStyle(node).overflowY))) return;
      }
      const footer = footerRef.current?.getBoundingClientRect();
      const page = document.scrollingElement;
      if (footer && footer.top < window.innerHeight && footer.bottom > 0 && page
        && page.scrollTop + window.innerHeight >= page.scrollHeight - 2) loadMore('wheel');
    };
    const controller = new AbortController();
    window.addEventListener('wheel', onWheel, { passive: true, signal: controller.signal });
    return () => controller.abort();
  }, [loadMore]);

  return (
    <div ref={footerRef} className="material-pagination" aria-label="Material pagination">
      <span className="material-pagination__count">{count} loaded - Recent first</span>
      {hasMore && (
        <button type="button" className="material-pagination__button" disabled={loading}
          onClick={() => loadMore('button')}>
          {loading ? 'Loading more...' : 'Load more'}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}
    </div>
  );
}
