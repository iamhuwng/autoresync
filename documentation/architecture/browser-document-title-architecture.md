# Browser Document Title Architecture

## Purpose

This note defines how browser tab titles are owned in the web app after the `MySTUdent Workspace` branding update and the 2026-04-02 document-title wiring pass.

The goal is to prevent stale titles, duplicated page-specific logic, and shell pages silently drifting away from the visible page title shown inside the app chrome.

## Brand Contract

- App brand title: `MySTUdent Workspace`
- Page format: `{Page Title} | MySTUdent Workspace`
- Fallback format for routes without a page-specific title: `MySTUdent Workspace`

## Ownership Model

Browser tab titles are owned by the same shared surfaces that already own visible page titles.

Current ownership:
- teacher shell pages: `src/components/navigation/TeacherHeader.tsx`
- admin shell pages: `src/components/navigation/AdminTopBar.tsx`
- student shell pages: `src/components/layout/StudentLayout.tsx`

Shared implementation:
- formatter: `src/core/platform/documentTitle.ts`
- platform hook: `src/core/platform/hooks/useDocumentTitle.ts`
- app-level fallback reset: `src/App.jsx`

## Routing Contract

The app resets the document title to the brand fallback on route changes before route-specific shells or pages apply their own page title.

This prevents a route that does not explicitly set a title from inheriting the previous route's tab text.

Expected behavior:
- shell/page with explicit title mounts -> tab becomes `{Page Title} | MySTUdent Workspace`
- route without explicit title mounts -> tab remains `MySTUdent Workspace`

## Student Shell Contract

For the shared student workspace, `StudentLayout` is the browser-title owner for shell pages.

The `mobileTitle` prop is now both:
- the mobile visible header label
- the shell-level browser title source

If a future student shell page needs a different tab title from its mobile header, the shell API must be expanded deliberately instead of setting `document.title` ad hoc inside the page body.

## Implementation Rules

- New code should use `useDocumentTitle(...)` from the platform layer instead of writing `document.title` directly.
- Shared shells should own title updates when they already own the visible page title.
- Standalone routes that bypass the shared shells may keep the brand fallback until they get an explicit title owner.
- Do not introduce route-local title strings in multiple places for the same page.

## Related Files

- `index.html`
- `src/App.jsx`
- `src/core/platform/documentTitle.ts`
- `src/core/platform/hooks/useDocumentTitle.ts`
- `src/components/navigation/TeacherHeader.tsx`
- `src/components/navigation/AdminTopBar.tsx`
- `src/components/layout/StudentLayout.tsx`

## Related Docs

- `documentation/architecture/student-experience-architecture.md`
- `documentation/design/student-view-design-standard.md`
