---
title: 'Pattern: Stale Chunk Auto-Recovery (lazyWithRetry)'
createdAt: '2026-03-05T08:23:54.285Z'
updatedAt: '2026-03-05T08:24:34.168Z'
description: >-
  Prevents "Unexpected token '<'" crashes after new deployments by wrapping
  React.lazy() with automatic page reload on chunk load failure
tags:
  - pattern
  - deployment
  - react
  - frontend
  - resilience
---
# Pattern: Stale Chunk Auto-Recovery (`lazyWithRetry`)

## Problem

After a new Vite/webpack production deployment, users who have the old `index.html`
cached in their browser experience **silent failures** when navigating to any page
that wasn't already loaded:

- Vite generates JS chunks with **content-hash filenames** (e.g., `AcademicRecordPage-KeT8e8gY.js`)
- Each new build creates **new hashes** (e.g., `AcademicRecordPage-BJ693HWr.js`)
- Old chunks no longer exist on the server
- Firebase Hosting (and most SPA hosts) return `index.html` for any missing file via catch-all rewrite
- The browser receives `<!DOCTYPE html>` when it expected JavaScript
- Result: **`Uncaught SyntaxError: Unexpected token '<'`** — link/tab clicks do nothing

**Why intermittent:** Chunks already loaded in memory work. Only freshly navigated pages trigger the stale fetch.

**Diagnosis signal in console:**
```
SomePage-OldHash.js:1 Uncaught SyntaxError: Unexpected token '<'
```
While the entry bundle (`index-NewHash.js`) is different from what's cached.

## Solution

Wrap `React.lazy()` with a `lazyWithRetry()` utility that:
1. Catches chunk load errors (detects "unexpected token", "failed to fetch dynamically imported module")
2. Forces a **single page reload** to fetch the new `index.html` with correct chunk references
3. Uses `sessionStorage` with a time-expiry guard to **prevent infinite reload loops**

## Implementation

**`src/utils/lazyWithRetry.ts`**

```typescript
import { lazy, ComponentType } from 'react';

const RETRY_KEY = 'chunk-reload-retry';
const RETRY_EXPIRY_MS = 30_000; // 30 seconds

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
      if (!isChunkLoadError(error)) throw error;

      // Prevent infinite reload loop — only retry once per 30s
      const retryData = sessionStorage.getItem(RETRY_KEY);
      if (retryData) {
        const { timestamp } = JSON.parse(retryData);
        if (Date.now() - timestamp < RETRY_EXPIRY_MS) {
          throw error; // Let ErrorBoundary handle it
        }
      }

      sessionStorage.setItem(RETRY_KEY, JSON.stringify({
        timestamp: Date.now(),
        url: window.location.href,
      }));

      window.location.reload();
      return new Promise<{ default: T }>(() => {}); // never resolves
    })
  );
}
```

**Usage in `App.jsx` / `App.tsx`** — replace ALL `lazy()` calls:

```typescript
// ❌ Before
import { lazy } from 'react';
const AcademicRecordPage = lazy(() => import('./pages/AcademicRecordPage.tsx'));

// ✅ After
import { lazyWithRetry } from './utils/lazyWithRetry.ts';
const AcademicRecordPage = lazyWithRetry(() => import('./pages/AcademicRecordPage.tsx'));
```

## Firebase Hosting Config

Ensure `index.html` is **never cached** by the browser:

```json
{
  "headers": [
    {
      "source": "/index.html",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
      ]
    },
    {
      "source": "**/*.@(js|mjs)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=300, must-revalidate" }
      ]
    }
  ],
  "rewrites": [
    { "source": "**", "destination": "/index.html" }
  ]
}
```

> **Note:** The `**` catch-all rewrite is what causes the HTML-instead-of-JS problem.
> The `lazyWithRetry` pattern is the **client-side defense** against it.

## Checklist

When deploying a new build of a React SPA with lazy-loaded routes:

- [ ] `lazyWithRetry` wraps ALL `lazy()` calls in `App.jsx`
- [ ] `index.html` has `no-cache, no-store` headers on the hosting provider
- [ ] JS chunks have short `max-age` (≤ 5 min) — NOT `immutable`, since they're not truly permanent in Firebase Hosting's short-expiry window
- [ ] An `ErrorBoundary` wraps the `<Suspense>` to catch any failures that slip through after the retry limit

## Anti-Patterns

```typescript
// ❌ Using sessionStorage flag without expiry — blocks retry permanently after one failure
sessionStorage.setItem('reloaded', 'true');

// ❌ Using localStorage — persists across sessions, user can never recover
localStorage.setItem('chunk-reloaded', 'true');

// ❌ Reload without guard — causes infinite reload loop on genuine errors
window.location.reload();
```

## Source

Applied during debugging of intermittent "nothing happens on link click" issue.
Root cause: `AcademicRecordPage-KeT8e8gY.js` (old hash) requested by stale browser,
but only `AcademicRecordPage-BJ693HWr.js` (new hash) existed on server.
