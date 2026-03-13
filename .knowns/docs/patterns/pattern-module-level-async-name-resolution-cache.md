---
title: 'Pattern: Module-Level Async Name Resolution Cache'
createdAt: '2026-03-13T19:19:32.264Z'
updatedAt: '2026-03-13T19:20:20.647Z'
description: >-
  Pattern for resolving Firebase UIDs to human-readable display names using a
  module-level Map cache, looksLikeRawId() heuristic detection,
  Promise.allSettled for parallelism, and useEffect cancellation.
tags:
  - pattern
  - firebase
  - cache
  - async
  - hooks
---
# Pattern: Module-Level Async Name Resolution Cache

## Problem

Firebase UIDs (e.g., `a1b2c3d4e5f6g7h8i9j0k1l2m3n4`) are stored in documents but need to be displayed as human-readable names. Fetching names inside `useMemo` or `useEffect` on every render is wasteful.

## Solution

```typescript
// Module-level cache — survives re-renders AND unmount/remount
const classNameCache = new Map<string, string>();
const studentNameCache = new Map<string, string>();

function looksLikeRawId(name: string): boolean {
    return /^[A-Za-z0-9]{20,}$/.test(name);  // Firebase UIDs are 28+ alphanumeric
}

function useTargetGrid(homework: HomeworkAssignment[]) {
    const [resolvedNames, setResolvedNames] = useState(new Map<string, string>());

    // Step 1: Build raw cards synchronously (fast render)
    const rawCards = useMemo(() => buildCards(homework), [homework]);

    // Step 2: Resolve missing names asynchronously
    useEffect(() => {
        let cancelled = false;  // Cancellation flag for cleanup

        async function resolveNames() {
            const toResolve = rawCards
                .filter(card => looksLikeRawId(card.targetName))
                .filter(card => !classNameCache.has(card.targetId));

            if (toResolve.length === 0) return;

            const results = await Promise.allSettled(
                toResolve.map(card => fetchClassName(card.targetId))
            );

            if (cancelled) return;  // Don't setState after unmount

            const newNames = new Map<string, string>();
            results.forEach((result, i) => {
                if (result.status === 'fulfilled' && result.value) {
                    classNameCache.set(toResolve[i].targetId, result.value);
                    newNames.set(toResolve[i].targetId, result.value);
                }
            });
            setResolvedNames(prev => new Map([...prev, ...newNames]));
        }

        resolveNames();
        return () => { cancelled = true; };
    }, [rawCards]);

    // Step 3: Apply resolved names + filter + urgency sort
    const targetCards = useMemo(() => {
        return rawCards.map(card => ({
            ...card,
            targetName: classNameCache.get(card.targetId) 
                || resolvedNames.get(card.targetId) 
                || card.targetName,
        }));
    }, [rawCards, resolvedNames]);

    return targetCards;
}
```

## Key Design Decisions

| Decision | Why |
|----------|-----|
| Module-level `Map` (not `useRef`) | Survives component unmount/remount — cached names persist across navigation |
| `looksLikeRawId()` heuristic | Avoids unnecessary API calls for already-resolved names |
| `Promise.allSettled` | One failed lookup doesn't block others |
| Cancellation flag | Prevents `setState` after unmount — avoids React warning |
| Three-step pipeline | Synchronous render first (fast), async resolution second (progressive) |

## Anti-Patterns

```typescript
// ❌ BAD: Fetching inside useMemo (side effect in pure computation)
const cards = useMemo(() => {
    homework.forEach(h => fetchName(h.classId));  // Side effect!
}, [homework]);

// ❌ BAD: useRef cache (lost on unmount)
const cache = useRef(new Map());  // Cache cleared when user navigates away

// ❌ BAD: Promise.all (one failure kills all)
await Promise.all(ids.map(fetchName));  // One 404 → entire batch fails
```

## Source

- `useTargetGrid.ts` — homework target grid name resolution
- PRD-0035 Homework Target Grid Redesign
