import { lazy, ComponentType } from 'react';

/**
 * lazyWithRetry — Drop-in replacement for React.lazy()
 * 
 * Handles the "Unexpected token '<'" error that occurs when:
 * 1. A new deployment creates JS chunks with new content hashes
 * 2. The browser has a stale index.html referencing old chunk filenames
 * 3. The server returns index.html (HTML) instead of the expected JS chunk
 * 4. The browser fails to parse HTML as JavaScript
 * 
 * Recovery strategy:
 * - On chunk load failure, force a full page reload to fetch the new index.html
 * - Use sessionStorage to prevent infinite reload loops (max 1 retry)
 */

const RETRY_KEY = 'chunk-reload-retry';
function getRetryScope(): string {
    if (typeof window === 'undefined') {
        return 'server';
    }

    return window.location.pathname || window.location.href;
}
const RETRY_EXPIRY_MS = 30_000; // 30 seconds — prevents stale retry flags

function isChunkLoadError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return (
        msg.includes('failed to fetch dynamically imported module') ||
        msg.includes('unexpected token') ||
        msg.includes('loading chunk') ||
        msg.includes('loading css chunk') ||
        msg.includes('dynamically imported module') ||
        error.name === 'ChunkLoadError'
    );
}

export function lazyWithRetry<T extends ComponentType<any>>(
    importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
    return lazy(() =>
        importFn().catch((error: unknown) => {
            // Only handle chunk load errors, re-throw everything else
            if (!isChunkLoadError(error)) {
                throw error;
            }

            console.warn('[lazyWithRetry] Chunk load failed, checking retry status...', error);

            // Check if we already retried recently (prevent infinite reload loop)
            const retryData = sessionStorage.getItem(RETRY_KEY);
            const retryScope = getRetryScope();
            if (retryData) {
                const { timestamp, scope } = JSON.parse(retryData);
                if (scope === retryScope && Date.now() - timestamp < RETRY_EXPIRY_MS) {
                    console.error('[lazyWithRetry] Already retried recently. Showing error instead of reloading.');
                    throw error; // Let the ErrorBoundary handle it
                }
            }

            // Mark that we're retrying, then force reload
            sessionStorage.setItem(RETRY_KEY, JSON.stringify({
                timestamp: Date.now(),
                scope: retryScope,
                url: window.location.href,
            }));

            console.log('[lazyWithRetry] 🔄 Reloading page to fetch updated chunks...');
            window.location.reload();

            // This return never executes, but TypeScript needs it
            return new Promise<{ default: T }>(() => { });
        })
    );
}

export default lazyWithRetry;
