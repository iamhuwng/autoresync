---
title: PRD-0033 Teacher Lobby Refactor Session Extraction
createdAt: '2026-03-12T08:57:20.153Z'
updatedAt: '2026-03-12T09:05:28.463Z'
description: >-
  Comprehensive knowledge extraction from the Teacher Lobby refactor (PRD-0033).
  Covers events, features, issues, lessons learned from failures, patterns,
  working solutions, and forward-looking standards.
tags:
  - refactor
  - pattern
  - lessons-learned
  - teacher-lobby
  - hooks
  - testing
---
# PRD-0033: Teacher Lobby Refactor — Session Extraction

> **Source:** PRD-0033 task list, multiple Antigravity sessions (2026-03-12)
> **Scope:** 2035-line monolithic `TeacherLobbyPage.jsx` → 434-line composition layer (79% reduction)

---

## 1. Session Events Timeline

| Phase | Event | Outcome |
|-------|-------|---------|
| **Foundation** | Created shared icons (`icons.jsx`), `NativeSelect` component | ✅ Reusable design-system pieces |
| **Dead Code** | Deprecated quiz code → `src/deprecated/quiz/` | ✅ Clean separation, no deletions |
| **Hook Extraction** | 5 hooks: `useModalManager`, `useTestFilters`, `useTeacherTests`, `useTeacherDrafts`, `useSessionManager` | ✅ All compile, all tested |
| **Component Extraction** | 8 components + 6 CSS files | ✅ All render correctly |
| **Page Rewrite** | Full rewrite of `TeacherLobbyPage.jsx` | ✅ 434 lines, all features working |
| **Testing** | 31 tests across 4 files | ✅ All passing |
| **Post-Review Fixes** | User applied 12 follow-up patches | ✅ Quality improvements |

---

## 2. Features Implemented

### Hooks Architecture
- **`useModalManager`** — `useReducer`-based modal state for 5 modals (editTest, editThcsTest, testCreation, hwDialog, useAsIs). Returns convenience wrappers.
- **`useTestFilters`** — Pure computation hook. No side effects. Accepts tests + filters, returns `{ filteredTests }` via `useMemo`. Handles ownership, search (THCS `metadata.title` fallback), type/grade/exam filters, public library sort.
- **`useTeacherTests`** — Cache-first load via `queryOptimizer.getAllTests()`, real-time `onValue` with `skipFirstCall`. CRUD: `deleteTest` (THCS Firestore cleanup), `togglePublic`, `refresh`. Returns `{ tests, loading, error }`.
- **`useTeacherDrafts`** — Conditional loading (`enabled` flag). `deleteDraft` updates internal state optimistically.
- **`useSessionManager`** — Full session lifecycle: class loading, real-time session data, `startSession`, `confirmSession`. `localStorage` for `lastUsedAudioMode`.

### Components Extracted
- **`TestCard`**, **`ThcsTestCard`**, **`DraftCard`** — All wrapped in `React.memo()` for list render performance
- **`ContentTabs`**, **`SearchFilterBar`**, **`SessionBanner`** — Layout components
- **`ClassSelectionModal`**, **`UseAsIsModal`** — Modal dialogs (Mantine exception documented)

---

## 3. Issues Encountered & Fixes

### 3.1 SearchFilterBar Missing Glass Card Wrapper
- **Symptom:** Search area bare on gradient background
- **Root Cause:** Component renders inner content only; outer `<Card variant="glass">` wrapper was defined to stay at page level but was omitted during rewrite
- **Fix:** Wrapped `<SearchFilterBar>` in `<Card variant="glass"><CardBody>` at page level
- **Lesson:** Document which wrapping layers belong to page vs component. Verify visually.

### 3.2 Missing `await` on Firebase `remove()`
- **Symptom:** Potential race condition in `deleteTest`
- **Fix:** `await remove(testRef)`
- **Lesson:** Always `await` Firebase write operations in hooks that return promises.

### 3.3 Missing `error` State in Data Hook
- **Symptom:** When fetch failed, no error info to consumer
- **Fix:** Added `error` state, set in catch block, exposed in return
- **Lesson:** Every data hook MUST return `{ data, loading, error }`. No exceptions.

### 3.4 `useCallback` Dependency Anti-Pattern
- **Symptom:** Overly broad `[modals]` or `[session]` in deps triggers re-creation every render
- **Fix:** `[modals.openEditThcsTest, modals.openEditTest]` — specific function refs
- **Lesson:** In `useCallback` deps, always reference specific function properties.

### 3.5 QuizEditor Import (Dead Code)
- **Symptom:** QuizEditor import remained after all quiz items were removed
- **Fix:** Removed import, added comment `// NOTE: QuizEditor removed — no legacy quiz items remain`
- **Lesson:** When deprecating features, grep for all imports.

### 3.6 Clone Route Non-Existent
- **Symptom:** `onClone` navigated to `/teacher/thcs-test/clone/${t.id}` — no such route exists
- **Fix:** Replaced with dynamic import of `cloneFromPublicTest` service, then navigate to editor
- **Lesson:** Verify route exists BEFORE writing navigate calls (Rule 1).

---

## 4. Patterns & Working Solutions

### 4.1 Hook Confirm Dialog Ownership
```
// ❌ WRONG: confirm inside hook
deleteTest = async (test) => { if (!confirm('Delete?')) return; ... };

// ✅ CORRECT: hook unconditional, page owns UI
// Hook:
deleteTest = async (test) => { await remove(ref(db, `tests/${test.id}`)); };
// Page:
handleDeleteTest = (test) => { if (confirm('Delete?')) await deleteTest(test); };
```
**Rule:** Hooks perform operations unconditionally. UI decisions live at page level.

### 4.2 Skip-First-Call for Firebase `onValue`
```typescript
useEffect(() => {
  let skipFirstCall = true;
  const unsub = onValue(ref, (snap) => {
    if (skipFirstCall) { skipFirstCall = false; return; }
    setTests(parse(snap));
    queryOptimizer.invalidate('test', 'all');
  });
  return () => unsub();
}, []);
```
**Why:** `onValue` fires immediately. If initial data already loaded from cache, first callback is redundant.
**CRITICAL:** `skipFirstCall` MUST be a closure variable (`let` inside `useEffect`), NOT `useRef`.

### 4.3 Firebase Hook Test Mock Pattern
```typescript
const mockRemove = vi.fn().mockResolvedValue(undefined);
let onValueCallback = null;
const mockOnValue = vi.fn((ref, successCb) => {
  onValueCallback = successCb;
  return vi.fn(); // unsubscribe
});
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  onValue: (...args) => mockOnValue(...args),
  remove: (...args) => mockRemove(...args),
}));
// In test: act(() => { onValueCallback!(snapshot); });
```

### 4.4 Component Extraction Wrapper Rule
- **Component renders:** Inner content only (flex row, form fields)
- **Page renders:** Outer wrapper (Card, animation, margin) + data wiring
```jsx
<Card variant="glass" style={{ marginBottom: '2rem' }}>
  <CardBody><SearchFilterBar ... /></CardBody>
</Card>
```

### 4.5 CSS Badge De-duplication
One shared CSS file (`TestCard.css`) with badge classes, imported by all card components:
```css
.test-card-badge { display: inline-flex; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.8125rem; font-weight: 600; }
.test-card-badge--gray { background: rgba(255,255,255,0.5); color: #64748b; }
.test-card-badge--purple { background: rgba(139,92,246,0.1); color: #8b5cf6; }
.test-card-badge--green { background: rgba(34,197,94,0.1); color: #16a34a; }
```

### 4.6 React.memo for List Cards
All list-rendered cards wrapped in `React.memo()` to prevent re-renders during search typing.

---

## 5. Lessons Learned

### 5.1 Refactoring Strategy
- ✅ **Incremental extraction works:** foundation → dead code → hooks → components → page → tests
- ❌ **Don't write tests before hooks compile.** Follow dependency order.
- ✅ **Take baseline screenshots BEFORE starting.** Compare ALL tabs and modals after.

### 5.2 Line Count Reality
- **Target:** ≤200 lines. **Actual:** 434 lines (79% reduction from 2035)
- **Why:** Handler composition with `useCallback`, explicit modal wiring, inline loading/empty states
- **Lesson:** Set aggressive targets but composition layers will be larger than estimated.

### 5.3 Deprecated Code Protocol
1. Move to `src/deprecated/<feature>/` with header comment
2. Keep imports available but commented in new code
3. Delete only after 1 release cycle with zero references

---

## 6. Moving-Forward Standards

### 6.1 Data-Fetching Hook Contract
Every data hook MUST return: `{ data, loading, error }`. No exceptions.

### 6.2 Hook/Page/Component Ownership
| Layer | Owns |
|-------|------|
| **Hook** | Data fetching, side effects, unconditional operations |
| **Page** | UI decisions (confirms, alerts), handler composition, data wiring |
| **Component** | Rendering, receives callbacks, never imports services |

### 6.3 Component Extraction Checklist
- [ ] Identify wrapper vs inner content boundary
- [ ] Document which layer owns Card/animation wrapping
- [ ] Use `React.memo()` for list-rendered components
- [ ] Extract shared CSS into reusable classes
- [ ] Verify visual match with baseline screenshots

### 6.4 `useCallback` Deps
Always reference specific function properties in deps:
```jsx
✅ [modals.openEditTest, modals.closeEditTest]
❌ [modals] — new reference every render
```

### 6.5 Firebase Testing Template
1. Define mock functions → 2. `vi.mock` modules → 3. Import hook AFTER mocks → 4. Capture `onValue` callbacks via closure → 5. Trigger with `act()` → 6. Assert with `waitFor()`



---

## 7. Deep Patterns (Addendum — 2026-03-12)

### 7.1 Non-Mutually-Exclusive Render Conditions (Ghost Overlap Bug)

When multiple components render based on a type field, independent boolean conditions create invisible overlaps:

```jsx
// ❌ BUG: When testType is undefined, BOTH editors render
{!test.testType && <QuizEditor />}
{test.testType !== 'THCS-THPT' && <TestEditor />}
// undefined !== 'THCS-THPT' → true → BOTH show simultaneously

// ✅ FIX: Use explicit type dispatch
if (!test.testType) return <QuizEditor />;
if (test.testType === 'THCS-THPT') return <THCSEditor />;
return <TestEditor />;
```

**Rule:** When multiple components render based on a type/discriminator field, ALWAYS use `if/else if` or switch-case — never independent boolean conditions.

### 7.2 Dead Code = Latent Bug (Not Just Tech Debt)

QuizEditor was kept "just in case" despite full quiz deprecation. The overlapping render condition (7.1) proved dead code isn't safely inert — it can interact with live code paths. 

**Forward rule:** When deprecating, **fully delete** code. Git is the safety net, not commented imports.

### 7.3 Page Composition Template

```
src/
  pages/
    ${Page}.jsx              ← Composition layer (≤200 lines target)
  hooks/
    ${domain}/
      use${Domain}Data.ts    ← Data hook (RTDB/Firestore)
      use${Domain}Filters.ts ← Filtering/sorting hook
    use${Feature}Manager.ts  ← Multi-step flow hook
    useModalManager.ts       ← Modal state (shared, useReducer-based)
  components/
    modern/
      ${Card}.jsx + .css     ← Presentational, React.memo-wrapped
```

### 7.4 Metrics Baseline

| Metric | Before | After | Standard |
|--------|--------|-------|----------|
| Page LOC | 2035 | 439 | ≤200 (aspirational) |
| Hooks | 0 | 5 | All data behind hooks |
| Components | 0 | 8 JSX + 6 CSS | Pure, memo-wrapped |
| Tests | 0 | 32 (4 files) | Cover all hooks |
| Inline style violations | ~90 lines | 0 | Budget: 0 for patterns |
| Error states exposed | 1 | 2 | All data hooks |

### 7.5 Confirm Dialog Ownership Pattern (with code)

```jsx
// ✅ CORRECT: Page owns the user interaction decision
const handleDeleteTest = useCallback((test) => {
  if (!window.confirm(`Delete "${test.title}"?`)) return;
  tests.deleteTest(test);  // Hook performs unconditional operation
}, [tests.deleteTest]);

// ❌ WRONG: Hook should NOT ask for user confirmation
// Different consumers (page, admin panel, background job) want different UX
```

### 7.6 Shared CSS Classes > Inline Styles

```jsx
// ❌ Duplicated badge styles in 3 components (ThcsTestCard, DraftCard, TestCard)
<div style={{ display: 'inline-flex', padding: '0.25rem 0.75rem',
  background: 'rgba(139, 92, 246, 0.1)', borderRadius: '9999px',
  fontSize: '0.8125rem', fontWeight: '600', color: '#8b5cf6' }}>

// ✅ Single CSS class via BEM modifiers
<div className="test-card-badge test-card-badge--purple">
```

**Standard:** If a style pattern appears in 2+ components → extract to shared CSS. One occurrence is tolerable; two is a shared class.
