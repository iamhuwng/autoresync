# Teacher Route Runtime Resilience

## Purpose

This note documents the runtime guards that keep teacher routes from failing blank when a secondary modal, provider dependency, or lazy route import breaks during development or deployment transitions.

## Failure Modes Addressed

- a teacher route lazy import fails because the browser fetches a stale or outdated optimized dependency bundle
- a heavy modal import pulls extra runtime dependencies into the initial route bundle and causes the route to fail before the user even opens that modal
- a teacher page still renders Mantine components after the app theme boundary stops providing `MantineProvider`

## Current Contract

### 1. Provider Boundary

The authenticated app theme boundary must continue to provide one global Mantine provider as long as teacher surfaces still render Mantine primitives such as `AppShell`, `Modal`, `Select`, or related editor components.

Current repo anchor:
- `src/context/ThemeContext.jsx`

### 2. Heavy Modal Loading

Teacher pages should not eagerly import optional heavy dialogs into the initial route bundle when those dialogs are only opened from secondary actions.

Current example:
- `TeacherLobbyPage` lazy-loads `THCSHomeworkAssignDialog` and renders it behind `Suspense` only when the homework dialog state is open
- `TeacherLobbyPage` keeps `WritingTestEditModal` as a direct import because Writing edit and resume are primary materials-edit actions, not optional secondary utilities

Implication:
- primary editor surfaces may stay directly imported when they are part of the main page contract
- secondary dialogs such as homework assignment should remain lazy-loaded

Current repo anchor:
- `src/pages/TeacherLobbyPage.jsx`

### 3. Route-Level Error Fallback

Teacher profile-gated routes must render inside an error boundary so a route or provider failure degrades to a controlled fallback instead of a blank page.

Current repo anchor:
- `src/routes/teacherRoutes.tsx`

## Working Rules

- if a route still depends on Mantine, do not remove the global provider until all Mantine usage on that route tree is gone
- if a modal is opened from a button or card action rather than page mount, prefer lazy-loading the modal component
- if `lazyWithRetry` exhausts its retry path, the route wrapper must still show an error boundary fallback instead of collapsing the screen
- route hardening fixes should be verified in a real browser session, not only through unit tests

## Verification Checklist

- teacher quick-login reaches `/lobby` without a blank page
- opening the route does not require loading optional homework-assignment dialog code up front
- runtime crashes in profile-guarded teacher routes surface through `ErrorBoundary`
- class homework tab still loads class-scoped homework and opens the class-targeted create modal

## Related Files

- `src/context/ThemeContext.jsx`
- `src/routes/teacherRoutes.tsx`
- `src/pages/TeacherLobbyPage.jsx`
- `src/pages/TeacherClassDetailPage.tsx`
## 2026-04-06 Runtime Hardening

- `AuroraThemeProvider` is now a native token wrapper only. The authenticated app shell keeps the single global `MantineProvider` in `ThemeContext`; Aurora must not mount a nested Mantine provider inside a new file.
- `TeacherLobbyPage` now lazy-loads `TestEditor`, `TestCreationModal`, `THCSTestEditorModal`, and `WritingTestEditModal` behind `Suspense`. These action-gated editors must not sit in the initial teacher-lobby route chunk.
- Localhost browser verification confirmed `/lobby` loads without the previous `TeacherLobbyPage.jsx` dynamic-import crash, and the `@dnd-kit/*` optimize-dep requests return `200` only when the THCS editor is opened on demand.

## Updated Implications

- primary edit actions on the lobby may still exist on the page contract, but the editor implementation should be lazy-mounted when it is not required for first paint
- nested Mantine providers are not an acceptable workaround for theme-specific styling while the app still depends on one shared authenticated provider boundary
