# Student Shell Right Rail Architecture

## Overview

The student shell is a shared platform feature owned by `StudentLayout`, not by any individual page. Every page that uses the student shell gets the same desktop 3-column structure, the same mobile and tablet drawer pattern, and the same shell-owned right-rail data boundary.

This architecture applies to:
- `StudentDashboardPage`
- `StudentHomeworkListPage`
- `StudentHomeworkDetailPage`
- `AcademicRecordPage`
- `StudentCoursesPage`
- `StudentCourseDetailPage`
- `StudentClassDetailPage`
- `StudentLibraryPage`
- `StudentTestResultsPage`
- `ProfilePage`

## Layout Contract

### Desktop

The shared student desktop shell uses a fixed left rail with an editorial center canvas and a contextual right rail:
- left rail: fixed visual anchor owned by `StudentLayout`
- center canvas: `minmax(0, 1fr)` with page content capped by page-class width rules
- right rail: fixed-width contextual column rendered by the shell or by an approved page-specific override
- shell composition should feel like one workspace, not three hard boxed columns
- horizontal padding and gutters should support long-form reading rhythm rather than dashboard density

The center canvas is intentionally wider than the old `600px` cap so Academic Record and Dashboard can share the same editorial reading model.

### Tablet and Mobile

Tablet and mobile remain shell-first layouts. The left navigation and right rail move into off-canvas drawers owned by `StudentLayout`. Pages should rely on the shell toggle behavior instead of implementing their own mobile right-rail trigger unless they need a deliberate override.

Required mobile drawer rules:
- left and right drawers remain mutually exclusive
- the right-rail drawer width stays within `width: min(320px, 85vw)`, `minWidth: 0`, and `maxWidth: 85vw`
- opening a drawer must not create horizontal page overflow
- closed drawers must not intercept taps or pointer events
- shell header controls and visible rail CTAs must stay at or above the shared `44px` target floor

## Right Rail Ownership

The global right rail is rendered by `StudentRightRail` and always appears on student shell pages unless a page-specific override is explicitly approved.

Shell-owned modules:
- `Live Now` — live session thumbnail rows (conditionally rendered)
- `Up Next` — upcoming homework dot-list inside a flat white card
- `My Classes` — enrolled-class thumbnail rows

Page-owned modules are supplemental only unless a page has an approved full override contract.

Rules:
- pages should not render structural rail wrappers such as sticky containers, fixed widths, or empty placeholder columns
- shell-owned summaries remain shell-owned even when a page-specific rail restates them differently
- page surfaces may reshape shell summaries, but must not re-own or reacquire them
- all variants (dashboard, default, academic-record) must use the unified v2 editorial token system — no variant may fall back to legacy CSS-in-JS styling
- supplemental modules must remain readable and tappable at `375px` and `320px`

## Extension Pattern

Current page supplements and overrides:
- dashboard: shared shell rail plus `PendingReviewsWidget` appended through `rightPanel`
- homework: homework summary supplement
- records: overview and right-module selector (academic-advisor and integrity-guide flat cards use v2 tokens)
- profile: teacher invitation card

Current shell-only pages:
- courses
- course detail
- class detail
- library

Rules:
- if a page only needs a small supplement, append it through `rightPanel`
- if a page has an approved page-specific rail contract, pass a full page-owned rail override through `rightPanel` instead of rebuilding shell data ownership
- dashboard currently does not use a full right-rail override on the live route
- dashboard variant in `StudentLayout` may still tune spacing or width without changing right-rail ownership
- a page supplement may not force the shell to violate the shared mobile drawer width or touch-target contract

## v2 Visual Token System

As of 2026-04-02 all three right-rail variants (dashboard, default, academic-record) share the same `v2` inline token object. Legacy `localStyles` CSS-in-JS, `CLASS_COLORS`, `getLiveBadgeStyles`, and `formatDueDateBadge` have been removed.

v2 design tokens define:
- section headers: 10px / 800wt / uppercase / `#2b3437` / 0.12em letter-spacing
- flat white cards: `#ffffff` background, 1px `#eceef0` border, 2px radius
- dot-list rows: 6px `#b9c4ca` dot + truncated title + right-aligned time label
- thumbnail-list rows: 36x36 gradient square (grayscale filter, color on hover) + name + meta
- CTA buttons: `#dce4e8` background / `#cdd6da` hover / 12px font
- empty states: 11px / `#737c7f`

Banned patterns:
- bordered cards around individual items
- pill rows with uppercase labels
- date-badge squares
- emoji thumbnails
- shadow effects on rail items

## Dashboard Rail Contract

Dashboard right rail on the live route is shared-shell-first.

Required rules:
- the shell renders `Live Now`, `Up Next`, and `My Classes`
- `PendingReviewsWidget` is appended as a page-owned supplemental module
- the shared shell modules must remain visible unless a future architecture revision explicitly approves a replacement
- `PendingReviewsWidget` may self-frame, but it must not duplicate shell module headings or replace shell-owned summaries
- `StudentDashboardRightRail.jsx` is not the active right-rail owner for the current dashboard route
- dashboard mobile behavior keeps `PendingReviewsWidget` inside the same shared rail drawer instead of moving it into dashboard-center layout

## Shared Data Contract

`useStudentShellData` remains the canonical shell data model, but the ownership boundary is route-scoped rather than page-scoped.

Shared sources:
- enrolled classes from `getStudentClasses`
- live class sessions from `subscribeToActiveSessions` plus `getSession`
- homework summary groups from the shared student homework pipeline

The canonical shell owner lives in `StudentShellDataProvider`, mounted above the student shell route tree.

Consumers use resolver hooks when they are inside the shell route tree:
- `useResolvedStudentShellData()`
- `useResolvedStudentHomeworkList()`

## Navigation And Tracking

The shell live-session CTA must keep the existing student waiting-room flow:
- call `sessionService.setPlayerData(...)`
- navigate to `STUDENT_WAITING`

Shell-level tracking should use direct action tracking rather than page-view tracking hooks because the rail is shared across multiple pages.

## Framing Responsibility

Right-rail supplements may be self-framed or host-framed, but not both.

Required rule:
- if a page-owned module already includes its own card, border, radius, title row, or progress shell, `StudentLayout` and the page host must provide placement and spacing only
- do not wrap a self-framed widget in a second bordered section shell
- do not repeat the same heading in both the host page and the child widget

Use one framing owner per surface: either the host page frames plain content, or the child widget renders as a visually complete module.

## PendingReviewsWidget Design Contract

As of 2026-04-02 the widget uses the open-section editorial layout — the same structural pattern as `UP NEXT`, `MY CLASSES`, and `LIVE NOW` sections rendered by `StudentRightRail`.

Visual structure:
- section header: uses shared `S.widgetTitle` token (no count badge — matches sibling sections)
- item rows: left date badge (42x42 rounded, white bg, whisper border, month+day from `submittedAt`) + title + pill row
- title: `0.875rem / 400wt` with `rail-title-marquee` class for overflow scroll-on-hover
- pill row: lowercase source pill with SVG icon (homework / live / solo practice) + amber `Awaiting review` status pill
- hover: rows highlight to `bgSurfaceAlt`
- see-all: accent uppercase link shown when total > 5

Design rules:
- no bordered card, no amber background — the widget is an open section inside `sectionStack`
- typography, spacing, and color tokens must use `studentTokens` from `studentLayoutStyles.ts`
- the section header must use the shared `S.widgetTitle` token, not a custom heading style
- item rows must not introduce card wrappers or shadow effects
- date badges must match the Up Next date badge pattern (month abbreviated uppercase in accent, day bold)
- source pills must be lowercase with SVG prefix icons — no emojis, no uppercase labels
- the amber `Awaiting review` pill provides semantic differentiation from Up Next items
- visible item rows and `See all` must remain at or above the shared mobile touch-target floor after responsive adjustments

Note: `PendingReviewsWidget` is the only rail module that still uses date badges. The shell-owned sections (Up Next, Live Now, My Classes) all use the v2 dot-list and thumbnail-list patterns instead.

## Implementation Notes

Key files:
- `src/App.jsx`
- `src/context/StudentShellDataContext.tsx`
- `src/components/layout/StudentLayout.tsx`
- `src/components/layout/studentLayoutStyles.ts`
- `src/components/layout/StudentRightRail.tsx`
- `src/components/dashboard/PendingReviewsWidget.tsx`
- `src/hooks/useStudentShellData.ts`

## Related Docs

- `documentation/architecture/student-mobile-responsiveness-architecture.md`
- `documentation/architecture/student-dashboard-architecture.md`
- `documentation/architecture/student-experience-architecture.md`
- `documentation/architecture/student-shell-data-loading.md`
- `documentation/design/student-view-design-standard.md`
