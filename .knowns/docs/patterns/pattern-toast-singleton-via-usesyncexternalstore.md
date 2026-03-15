---
title: 'Pattern: Toast Singleton via useSyncExternalStore'
createdAt: '2026-03-13T19:19:36.309Z'
updatedAt: '2026-03-13T19:20:49.625Z'
description: >-
  Module-level toast notification system callable from non-React code (services,
  event handlers) without Context. Uses useSyncExternalStore for React binding.
tags:
  - pattern
  - react
  - toast
  - notifications
  - useSyncExternalStore
---
# Pattern: Toast Singleton via useSyncExternalStore

## Problem

Toast notifications need to be callable from:
- React components (`onClick` handlers)
- Service functions (`homeworkManager.ts`)
- Event handlers outside React
- Async callbacks (promise `.then()/.catch()`)

Traditional approaches fail:
- **Context:** Can't call from outside React tree
- **Redux:** Too heavy for simple toasts
- **Per-component `<Toast>`:** Requires prop-drilling, multiple instances

## Solution: Module-Level Singleton + useSyncExternalStore

```typescript
// ── Module-level state (outside React) ──
type Toast = { id: string; type: 'success' | 'error' | 'info'; message: string };
let toastQueue: Toast[] = [];
let listeners: Set<() => void> = new Set();

function notify() {
    listeners.forEach(fn => fn());
}

function addToast(type: Toast['type'], message: string) {
    toastQueue = [...toastQueue, { id: crypto.randomUUID(), type, message }];
    notify();
    setTimeout(() => removeToast(toastQueue[0]?.id), 4000); // Auto-dismiss
}

function removeToast(id: string) {
    toastQueue = toastQueue.filter(t => t.id !== id);
    notify();
}

// ── Public API (callable ANYWHERE) ──
export const toast = {
    success: (msg: string) => addToast('success', msg),
    error:   (msg: string) => addToast('error', msg),
    info:    (msg: string) => addToast('info', msg),
};

// ── React binding ──
function subscribe(callback: () => void) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

function getSnapshot() {
    return toastQueue;
}

export function ToastContainer() {
    const queue = useSyncExternalStore(subscribe, getSnapshot);
    return (
        <div className="toast-container">
            {queue.map(t => (
                <div key={t.id} className={`toast toast-${t.type}`}>
                    {t.message}
                    <button onClick={() => removeToast(t.id)}>×</button>
                </div>
            ))}
        </div>
    );
}
```

## Usage

```typescript
// From a service (non-React):
import { toast } from '../components/modern/ToastNotification';
toast.success('Homework created successfully!');

// From a React component:
const handleDelete = async () => {
    try {
        await deleteHomework(id);
        toast.success(`${succeeded} deleted, ${failed} failed`);
    } catch (e) {
        toast.error('Failed to delete homework.');
    }
};

// Mount once at app root:
// App.jsx: <ToastContainer />
```

## Why useSyncExternalStore?

| Feature | Context | Redux | useSyncExternalStore |
|---------|---------|-------|---------------------|
| Call from non-React | ❌ | ⚠️ verbose | ✅ |
| No provider wrapping | ❌ | ❌ | ✅ |
| Concurrent mode safe | ⚠️ | ✅ | ✅ |
| Bundle size | ~0 | ~5kb | ~0 |

## Lesson Learned

**Trial:** Initial implementation used per-component `<ToastNotification>` pattern requiring state prop-drilling. Every page had to manage its own toast state.

**Fix:** Replaced with this singleton pattern. Any module can call `toast.success()` without knowing about React.

## Standard

> **Global UI feedback** (toasts, alerts, connection status) → module-level singleton + `useSyncExternalStore`
> **Component-level UI feedback** (inline errors, field validation) → local `useState`

## Source

- `src/components/modern/ToastNotification.tsx`
- PRD-0034 Teacher Homework Management Overhaul
