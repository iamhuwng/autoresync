# Student Mobile Responsiveness Architecture

## Purpose

This document captures the durable architecture contract that came out of PRD-0044.

It exists so future student-shell work does not have to reconstruct mobile behavior from the PRD, task list, and findings log every time a responsive regression appears.

This is an architecture document, not a task log. It records the released shell, routing, layout, drawer, overlay, and verification contracts for student mobile behavior.

## Scope

This contract applies to student-facing pages that either:
- render inside the shared student shell route tree, or
- render inside `StudentLayout` while preserving the same student shell language on mobile

Current covered surfaces:
- `/student`
- `/student/dashboard`
- `/student/homework`
- `/student/homework/:homeworkId`
- `/student/courses`
- `/student/library`
- `/student/academic-record`
- `/student/results/:sessionCode`
- `/student-test-results/:sessionCode`

This contract does not automatically apply to standalone student delivery surfaces such as IELTS Reading live-test or practice routes, which keep their own delivery architecture.

## Responsive Model

Student mobile is a supplement to the desktop workspace, not a separate product.

Required rules:
- desktop at `>=1025px` remains the reference composition unless a PRD explicitly changes desktop
- the shell's collapsed mobile behavior is the source of truth for phones and the current tablet-collapsed range
- mobile changes may stack, collapse, truncate, drawerize, or convert overlays, but they must preserve the same route semantics, page purpose, and data owner as desktop
- the student right rail remains structurally present on shell pages even when moved into a drawer

Current breakpoint model in practice:
- `<=768px`: phone/mobile treatment
- `769px-1024px`: collapsed shell treatment where the current shell already behaves like mobile/tablet
- `>=1025px`: desktop reference layout

## Shared Shell Primitives

`StudentLayout` is the mobile shell owner for student surfaces that use the shared workspace language.

It owns these shared mobile primitives:
- `mobileTitle` as the visible mobile workspace title and browser-title source for shell pages
- shared feed padding of `16px 12px 24px` on collapsed widths
- mutually exclusive left and right drawers
- the scoped hidden-scrollbar helper for intentional horizontal rows
- the shared shell control sizing that keeps visible header buttons at `44px x 44px`
- the mobile right-rail drawer sizing contract

`studentLayoutStyles.ts` exports `mobileStyles` as the shared responsive helper set.

Approved helpers:
- `mobileStyles.feedPadding`
- `mobileStyles.fullWidthButton`
- `mobileStyles.singleColumnGrid`
- `mobileStyles.stackVertical`
- `mobileStyles.touchTarget`
- `mobileStyles.hiddenScrollbar`
- `mobileStyles.feedSubtitleHidden`

Rule:
- repeated student mobile behavior should reuse these shared primitives before introducing page-local responsive constants

## Route And Hosting Contract

PRD-0044 clarified that student mobile work depends on route hosting, not only on CSS.

### Shell-hosted routes

These student routes now live inside `StudentShellRoute` and consume the shared shell data owner while preserving their public URLs:
- `/student/homework/:homeworkId`
- `/student/results/:sessionCode`

Implications:
- the shell provider owns shell-global summaries for these routes
- the page still owns its page-primary dataset
- route-path preservation is mandatory even when route nesting changes internally

### Layout-hosted but not shell-routed

The canonical student results route remains:
- `/student-test-results/:sessionCode`

It intentionally stays top-level, but still renders `StudentLayout` so it preserves the same student shell language on desktop and mobile.

Implications:
- this route keeps the student shell composition without being nested under `StudentShellRoute`
- shell-like chrome may self-provide layout dependencies where needed
- the route contract must stay aligned with the legacy alias `/student/results/:sessionCode`

### Standalone student routes

Standalone student delivery surfaces may bypass `StudentLayout` entirely when they intentionally own delivery chrome.

Current example:
- mobile IELTS Reading delivery, which is governed by its own architecture doc

### Registry synchronization rule

If a public student path changes, the same change must keep these files synchronized in the same edit set:
- `src/constants/routes.ts`
- `src/config/routeSecurity.ts`
- `src/config/featureRegistry.ts`
- focused route-mount or route-contract tests

## Mobile Layout Contract

The mobile shell compresses the same desktop workspace with predictable transformations.

Required transformations:
- page headers keep the same title as desktop
- secondary subtitles may hide on phone widths before title semantics change
- grid, card, metric, and detail surfaces collapse to a single-column reading flow unless a PRD explicitly preserves a multi-column mobile layout
- tab and filter rows may scroll horizontally, but only as intentional rows with hidden scrollbars and touch-safe items
- primary narrow-screen actions should become full-width when stacking improves tap accuracy
- mobile surfaces must remain free of unintended horizontal overflow

Current shared measurements proven by PRD-0044:
- feed/content inset: `16px 12px 24px`
- visible interactive floor: `44px x 44px`
- right-rail drawer width: `min(320px, 85vw)` with `minWidth: 0` and `maxWidth: 85vw`

## Drawer And Right-Rail Contract

The student right rail remains shell-owned on mobile even when it moves off canvas.

Required rules:
- the mobile right rail drawer must stay within `width: min(320px, 85vw)`, `minWidth: 0`, `maxWidth: 85vw`
- opening a drawer must not create horizontal page overflow
- closed drawers must not intercept taps or pointer events
- shell-owned and page-owned supplemental rail content must remain readable and tappable at `375px` and `320px`
- page supplements may extend the rail, but must not replace shell ownership or duplicate shell wrappers

This contract applies to shell-owned modules and page supplements such as `PendingReviewsWidget`.

## Overlay Contract

Student mobile overlays are workflow-preserving adaptations of desktop overlays.

Required rules:
- long-content or confirmation-heavy overlays should use full-viewport or bottom-sheet mobile presentations
- scrollable overlay bodies must scroll internally with touch-safe scrolling
- sticky bottom action bars are the default when the body scrolls
- every visible modal action must satisfy the shared `44px` target floor
- `100dvh` with `100vh` fallback is the approved pattern when viewport-height stability matters

Validated PRD-0044 examples:
- homework start-attempt confirmation uses a full-viewport mobile overlay with sticky actions
- course unenroll confirmation uses a bottom-sheet mobile presentation
- dashboard Join a Class modal remains scroll-safe on narrow viewports

## Page-Family Implications

PRD-0044 locked in the following page-family rules.

Dashboard:
- uses the shared mobile feed inset and hidden-scrollbar filter treatment
- keeps the dashboard feed inside the same editorial timeline contract on mobile
- keeps `PendingReviewsWidget` supplemental in the mobile right-rail drawer rather than moving that function into the center column

Courses, Library, Academic Record, Homework List:
- preserve the same page identity as desktop
- collapse cards, filters, and summaries into single-column or stacked flows
- reuse shared shell header and touch-target behavior instead of re-inventing per-page mobile shells

Homework Detail and Test Results:
- now participate in the shared student shell language on mobile instead of shipping legacy standalone styling
- preserve their public route contracts while using shell-consistent mobile spacing, actions, and overlays

## Verification Standard

Responsive student-shell work is not complete without live verification.

Minimum verification widths:
- `1440px` when the task changes shared shell composition, routed page placement, or title alignment relative to desktop
- `375px` for baseline phone verification
- `320px` when drawers, headers, overlays, or dense controls are touched

Required checks:
- no unintended horizontal overflow
- visible controls satisfy the `44px` floor
- drawers remain mutually exclusive and readable
- overlays keep explicit dismiss behavior and usable actions
- direct-load and refresh behavior remain stable for canonical and supported legacy routes

Useful overflow assertion:
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`

## Related Docs

- `documentation/design/student-view-design-standard.md`
- `documentation/rules/student-mobile-design.md`
- `documentation/architecture/student-experience-architecture.md`
- `documentation/architecture/student-shell-right-rail-architecture.md`
- `documentation/architecture/student-shell-data-loading.md`
- `documentation/architecture/student-dashboard-architecture.md`
- `documentation/architecture/mobile-ielts-reading-test-taking-architecture.md`
