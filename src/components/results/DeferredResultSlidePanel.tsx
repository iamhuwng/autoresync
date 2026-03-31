import React, { Suspense } from 'react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import type { ResultSlidePanelProps } from './ResultSlidePanel';

const LazyResultSlidePanel = lazyWithRetry(async () => {
  const module = await import('./ResultSlidePanel');
  return { default: module.ResultSlidePanel };
});

const fallbackStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.35)',
    zIndex: 999,
  },
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    height: '100vh',
    width: 'min(100vw, 860px)',
    background: '#ffffff',
    boxShadow: '-16px 0 40px rgba(15, 23, 42, 0.12)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e5e7eb',
    borderTopColor: '#4f46e5',
    borderRadius: '50%',
    animation: 'deferred-result-panel-spin 0.8s linear infinite',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    color: '#374151',
    fontSize: '0.95rem',
    fontWeight: 600,
  },
};

function DeferredResultSlidePanelFallback() {
  return (
    <>
      <style>
        {'@keyframes deferred-result-panel-spin { to { transform: rotate(360deg); } }'}
      </style>
      <div style={fallbackStyles.backdrop} />
      <div style={fallbackStyles.panel} role="dialog" aria-modal="true" aria-label="Loading test result details">
        <div style={fallbackStyles.content}>
          <div style={fallbackStyles.spinner} />
          <span>Loading result details…</span>
        </div>
      </div>
    </>
  );
}

export function DeferredResultSlidePanel(props: ResultSlidePanelProps) {
  return (
    <Suspense fallback={<DeferredResultSlidePanelFallback />}>
      <LazyResultSlidePanel {...props} />
    </Suspense>
  );
}

export default DeferredResultSlidePanel;
