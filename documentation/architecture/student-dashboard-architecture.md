# Student Dashboard Architecture

## Purpose

This document is the dashboard-specific source of truth for the student dashboard host, center canvas, right rail composition, and result-opening behavior.

It exists because dashboard now has a tighter structure than the rest of the student shell and has already regressed once when an experimental right-rail override drifted away from the approved layout.

## Approved Anchors

Dashboard follows three approved references:
- `.stitch/designs/student-overhaul-from-academic-record-20260331/dashboard.html`
- `.stitch/designs/student-overhaul-20260331/academic-record.html`
- the screenshot-era dashboard implementation restored from git commit `e5ba2064`

Rules:
- use the dashboard Stitch export for dashboard-specific anatomy
- use Academic Record as the tonal and spacing anchor for the wider student family
- use the `e5ba2064` structure as the implementation anchor for title position, summary-strip order, and dashboard-specific spacing
- preserve the real route structure, product information architecture, and live behaviors from the app
- do not literal-copy placeholder labels, routes, or fake content from Stitch

## Component Ownership

Dashboard is split into one host page, one center-canvas surface, and one page-owned supplemental widget.

Host:
- `src/pages/StudentDashboardPage.jsx`

Center-canvas surface:
- `src/components/dashboard/StudentDashboardFeedView.jsx`

Supplemental dashboard widget:
- `src/components/dashboard/PendingReviewsWidget.tsx`

Sidebar parity is also part of dashboard feel:
- `src/components/layout/StudentSidebar.tsx`

Historical note:
- `src/components/dashboard/StudentDashboardRightRail.jsx` remains in the repo as a prior dashboard-specific rail exploration, but the current dashboard route does not mount it

Ownership rules:
- `StudentDashboardPage.jsx` owns dashboard data loading, derived dashboard view models, and interaction state
- `StudentDashboardFeedView.jsx` renders the center canvas only
- `PendingReviewsWidget.tsx` owns only its narrow writing-queue query and renders as supplemental right-rail content
- presentational components must not reacquire shell-owned or page-owned data on their own

## Center-Canvas Contract

The required order for the center canvas is:
1. sticky masthead with light utilities
2. frameless metric strip
3. slim editorial tab row
4. vertical timeline feed

Interpretation rules:
- search, unread filter, and academic-history action stay visually light
- the metric strip must stay above the tabs
- the dashboard variant in `StudentLayout` owns the broader center-column placement and rail gutter
- `StudentDashboardFeedView.jsx` owns the internal header, metric-strip, and tabs spacing restored from `e5ba2064`
- the feed reads as a vertical timeline rather than a card grid
- spacing and typography do most of the structural work

Disallowed regressions:
- removing the metric strip from the center column
- tabs above the summary strip
- toolbar-heavy header rows
- boxed KPI cards above the feed
- nested CTA cards inside feed rows
- moving dashboard onto the generic shell page-header rhythm if that changes the screenshot-era title position

## Feed Row Variants

Dashboard feed rows intentionally use explicit event-row contracts.

### Result / Test Rows
- sparse and score-led
- quiet eyebrow and timeline date
- strong title
- restrained summary copy
- one clear result action
- result-style dashboard actions must open the local dashboard slide panel, not redirect students away from dashboard
- if a notification carries a canonical result route such as `/result/:resultId` or an academic-record result link, the dashboard host must resolve the `resultId` locally and open the slide panel from that ID

### Homework Rows
- one quiet inset excerpt or meta surface
- no chip stacks as the default metadata treatment
- support copy remains concise and derived from real assignment metadata

### Class Update Rows
- mostly textual update
- one restrained action
- no dashboard-card framing

Generic event-card rendering is not an acceptable fallback when parity work touches dashboard feed presentation.

## Right-Rail Contract

Dashboard uses the shared shell right rail on the live route.

Required composition:
- `Live Now`
- `Up Next`
- `My Classes`
- page-owned `Pending Reviews` appended through `rightPanel`

Rules:
- `Live Now`, `Up Next`, and `My Classes` stay shell-owned and come from `StudentRightRail`
- `PendingReviewsWidget` is supplemental only and must not replace or duplicate the shell-owned rail modules
- `Up Next` must not be recreated inside the center column
- do not reintroduce `Feed Snapshot`, `Weekly Focus`, or other dashboard-only override sections on the live route without a new approved architecture update
- keep the rail quieter than the center canvas

## Sidebar Constraints

Dashboard visual parity includes the sidebar tone, but not a rewrite of the product IA.

Rules:
- preserve the real student navigation structure and destinations
- use smaller uppercase editorial labels
- use a thin, quiet active treatment instead of a heavy pill
- keep `Join Class` as a utility action, not a dominant hero CTA

## State And Data Ownership

Dashboard-owned state:
- current feed filter tab
- search query
- unread-only filter state
- join-class modal state
- selected result panel state

Dashboard-owned datasets:
- paginated notifications
- notification subscriptions

Supplement-owned dataset:
- `PendingReviewsWidget.tsx` owns its narrow writing-submission queue query

Shell-owned summaries consumed by dashboard:
- enrolled class membership summaries
- live-session summaries
- homework summary groups used for the dashboard metric strip and `Up Next`

Derived view models for the center canvas must be assembled in `StudentDashboardPage.jsx` before being passed to `StudentDashboardFeedView.jsx`.

## Verification Boundary

Dashboard parity is considered correct only when both are true:
- the dashboard feels faithful to the approved anatomy
- the implementation stays connected to real product routes, data, and actions

Verification checklist:
- feed order matches the center-canvas contract
- metric strip remains above tabs
- feed rows use explicit row variants
- the live route uses the shared shell rail plus `Pending Reviews`
- result notifications open the local slide panel from dashboard
- no duplicate shell data ownership is introduced
- no placeholder Stitch IA replaces real app structure

## Related Docs

- `documentation/design/student-view-design-standard.md`
- `documentation/architecture/student-experience-architecture.md`
- `documentation/architecture/student-shell-right-rail-architecture.md`
- `documentation/architecture/student-shell-data-loading.md`
