---
title: Teacher Route Runtime Resilience
description: Runtime contract for teacher-route provider boundaries, lazy modal loading, and error-boundary fallbacks that prevent blank screens.
createdAt: '2026-04-02T10:42:35.277Z'
updatedAt: '2026-04-05T19:33:46.657Z'
tags:
  - architecture
  - teacher
  - routing
  - runtime
  - mantine
---

# Teacher Route Runtime Resilience

## Purpose

This note captures the runtime contract that keeps teacher routes from failing blank when a secondary modal, provider dependency, or lazy route import breaks.

## Core Contract

### Provider Boundary

Teacher route trees still depend on Mantine primitives such as `AppShell`, `Modal`, and `Select`. While those dependencies remain, the authenticated theme boundary must keep one global `MantineProvider` mounted.

Current repo anchors:
- `src/context/ThemeContext.jsx`
- `src/pages/TeacherLobbyPage.jsx`

### Heavy Modal Loading

Optional dialogs that open from secondary actions should not be part of the initial teacher route bundle when the route can render without them.

Current example:
- `TeacherLobbyPage` lazy-loads `THCSHomeworkAssignDialog` and only renders it after the assign-homework action opens the dialog state.

Current repo anchor:
- `src/pages/TeacherLobbyPage.jsx`

### Route-Level Fallback

Teacher profile-gated routes must render inside `ErrorBoundary` so a lazy-route failure or provider crash degrades to a controlled fallback instead of a blank page.

Current repo anchor:
- `src/routes/teacherRoutes.tsx`

## Working Rules

- If a route still uses Mantine components, do not remove the global provider until that route tree is fully migrated.
- If a dialog is opened from a button or card action rather than page mount, prefer lazy-loading the dialog component.
- If `lazyWithRetry` exhausts its retry path, the user should still see an error fallback rather than a blank screen.
- Validate runtime fixes in a real browser session, not only with unit tests.

## Verification Checklist

- Teacher quick-login reaches `/lobby` without a blank page.
- The lobby route does not require loading the THCS homework assignment dialog during first paint.
- Profile-guarded teacher routes surface failures through `ErrorBoundary`.
- Class homework tab still loads class-scoped homework and opens a class-targeted create modal.

## Related Docs

- @doc/architecture/routing-navigation
- @doc/patterns/prd-0033-teacher-lobby-refactor-session-extraction

## 2026-04-06 Runtime Hardening

- `AuroraThemeProvider` is a native token wrapper only. The authenticated app shell keeps the single global `MantineProvider` in `ThemeContext`; Aurora must not mount a nested Mantine provider inside a new file.
- `TeacherLobbyPage` now lazy-loads `TestEditor`, `TestCreationModal`, `THCSTestEditorModal`, and `WritingTestEditModal`. These action-gated editors must not sit in the initial teacher-lobby route chunk.
- Browser verification on localhost confirmed `/lobby` loads without the previous `TeacherLobbyPage.jsx` dynamic-import crash, and the `@dnd-kit/*` optimize-dep requests return `200` only when the THCS editor is opened on demand.
