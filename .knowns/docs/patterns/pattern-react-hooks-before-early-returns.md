---
title: 'Pattern: React Hooks Before Early Returns'
createdAt: '2026-03-12T09:51:05.267Z'
updatedAt: '2026-03-12T09:51:44.519Z'
description: >-
  Critical React pattern: all useState/useEffect hooks must be declared before
  any conditional early return statements to comply with Rules of Hooks
tags:
  - pattern
  - react
  - hooks
  - bug-fix
  - rules-of-hooks
---
# Pattern: React Hooks Before Early Returns

## Event (What Happened)

**Date:** 2026-03-12
**Component:** `THCSPracticeView.tsx`
**Error:** React error #310 — "Too many re-renders. React limits the number of renders to prevent an infinite loop."
**Trigger:** Student navigating to the practice page (`/student/practice/:materialId`)

The `StudentPracticePage` crashed on load for students enrolled in a class attempting THCS practice.

## Root Cause

Two `useState` calls (`initialElapsedSeconds`, `elapsedLoaded`) and one `useEffect` (homework submission loader) were declared **after** early-return guard clauses for loading/error states.

When `loadingTest === true`, the component returned JSX before reaching those hooks. On the next render (after loading finished), React suddenly saw *more hooks* than the previous render, violating the Rules of Hooks invariant.

```tsx
// ❌ BROKEN — hooks after early returns
const [testData, setTestData] = useState(null);
const [loadingTest, setLoadingTest] = useState(true);

useEffect(() => { load(); }, [materialId]); // Hook #3

if (loadingTest) return <Loading />;   // ← EARLY RETURN
if (loadError) return <Error />;       // ← EARLY RETURN

// These hooks are SKIPPED on first render (loadingTest=true)
const [initialElapsed, setInitialElapsed] = useState(0);    // Hook #4 — MISSING on first render!
const [elapsedLoaded, setElapsedLoaded] = useState(true);   // Hook #5 — MISSING on first render!
useEffect(() => { loadSubmission(); }, []);                  // Hook #6 — MISSING on first render!
```

## Solution

Move ALL hooks above ALL early returns:

```tsx
// ✅ CORRECT — all hooks before any return
const [testData, setTestData] = useState(null);
const [loadingTest, setLoadingTest] = useState(true);
const [initialElapsed, setInitialElapsed] = useState(0);     // Hook called on EVERY render
const [elapsedLoaded, setElapsedLoaded] = useState(true);    // Hook called on EVERY render

useEffect(() => { load(); }, [materialId]);
useEffect(() => { loadSubmission(); }, []);                  // Hook called on EVERY render

// NOW safe to early return — all hooks already registered
if (loadingTest) return <Loading />;
if (loadError) return <Error />;
if (!elapsedLoaded) return <Resuming />;
```

## Why This Is Subtle

1. **Works initially** — if the loading state is very fast (e.g., cached data), all hooks may run on first render before the early return triggers on subsequent renders
2. **Only crashes for some users** — depends on network latency; if Firebase responds before React commits the first render, hooks appear consistent
3. **Minified error is cryptic** — error #310 says "too many re-renders" which misleads toward infinite loops, not hook ordering
4. **Linting doesn't always catch it** — `eslint-plugin-react-hooks` detects hooks inside `if()` blocks but NOT hooks placed after early `if () return` patterns (it sometimes misses the conditional return form)

## Detection Checklist

When reviewing a React component, scan for:

- [ ] Any `useState` or `useEffect` below an `if (...) return` statement
- [ ] Any hook declared inside a conditional block
- [ ] Any hook declared after a ternary-driven early return
- [ ] Components that load data → show loading → then render more hooks

## Affected File Pattern

This bug is most likely in **"router" or "wrapper" components** that:
1. Load data asynchronously
2. Show a loading/error UI during fetch
3. Later added additional state (e.g., timer resume, homework context)

Components following this architecture in our codebase:
- `THCSPracticeView.tsx` ← **fixed 2026-03-12**
- `StudentPracticePage.tsx` (parent — currently clean)
- `IELTSPracticeView.tsx` (should audit)
- `TestPageRouter.tsx` (should audit)

## Moving Forward Standard

### Rule: ALL-HOOKS-FIRST

> **Every `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`, and custom hook call MUST appear before the first conditional `return` statement in a component.**

### Enforcement

1. **Code review gate**: Any PR with a `useState`/`useEffect` below an `if (...) return` is an automatic rejection
2. **When adding new state to existing components**: Always insert the new hooks in the hooks block at the top, never below guard clauses
3. **Refactor pattern for complex components**: If a component needs data-dependent hooks, extract the data-dependent part into a child component:

```tsx
// ✅ BEST PATTERN: Split into loader + renderer
const ParentComponent = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => { fetchData().then(setData); }, []);
    
    if (loading) return <Loading />;
    if (!data) return <Error />;
    
    // Child component can safely use all the hooks it wants
    return <ChildRenderer data={data} />;
};

const ChildRenderer = ({ data }) => {
    // These hooks always run because ChildRenderer 
    // only mounts AFTER data is available
    const [extraState, setExtraState] = useState(0);
    useEffect(() => { /* safe */ }, []);
    // ...
};
```

## Lessons Learned

1. **Incremental feature additions are the #1 cause** — The original component was clean. The `initialElapsedSeconds` state was added later (homework timer resume feature) and placed after existing early returns for convenience
2. **"Works on my machine" trap** — Fast connections may never trigger the race between loading state and hook registration
3. **Always audit hook order after modifications** — Any time you add a hook to an existing component, verify it's in the hooks block above all returns
4. **Minified React errors need lookup** — Always check https://react.dev/errors/{code} for the unminified message

## Source

Bug fix applied 2026-03-12 in `src/components/practice/THCSPracticeView.tsx`
