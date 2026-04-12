# Student Experience Architecture

## Purpose

This document defines the architectural contract for the student-facing workspace after the 2026-03-31 overhaul, dashboard parity follow-up, and PRD-0044 mobile-responsiveness completion.

It exists to keep implementation, review, and future UI work aligned to the approved Stitch direction instead of drifting back toward older social-feed, boxed-dashboard, generic-widget, or mobile-only product patterns.

## Scope

This architecture applies to student shell pages rendered inside the shared student layout:
- `/student`
- `/student/dashboard`
- `/student/homework`
- `/student/homework/:homeworkId`
- `/student/courses`
- `/student/courses/:courseId`
- `/student/classes/:classId`
- `/student/library`
- `/student/academic-record`
- `/student/profile`
- `/student/results/:sessionCode`

It also applies to student pages that intentionally stay outside `StudentShellRoute` but still render the same student shell language through `StudentLayout`, such as:
- `/student-test-results/:sessionCode`

It supplements, but does not replace, the student shell data-loading contract.

## Workspace Model

The student UI is a calm editorial academic workspace.

The shell preserves three structural regions:
- left navigation rail
- center editorial work canvas
- right contextual rail

The key rule is that these regions must read as one composed workspace rather than three hard boxed columns.

## Shell Layout Contract

### Desktop
- The left rail remains persistent and navigational
- The center canvas is the primary reading and task surface
- The right rail remains present for contextual summaries, queues, and page-adjacent support
- Tonal separation, spacing, and quiet dividers should define regions more than visible border boxes
- Desktop at `>=1025px` remains the reference composition unless a PRD explicitly changes desktop

### Tablet and Mobile
- Preserve the existing mutual-exclusion drawer behavior for the left and right rails
- Preserve the mobile page host and navigation contract
- Carry the same tonal and editorial language into smaller breakpoints instead of reverting to legacy feed styling
- Treat mobile as a compressed presentation of the same student workspace, not a separate product with its own IA
- Preserve the same page purpose, route semantics, and right-rail presence while stacking or collapsing layout for narrower widths

See `documentation/architecture/student-mobile-responsiveness-architecture.md` for the responsive shell contract, route-hosting exceptions, shared mobile primitives, and verification requirements.

## Workspace Chrome And Browser Title Contract

For shared student shell pages, `StudentLayout` owns both:
- the mobile visible workspace title
- the browser tab title

The shell title source is the `mobileTitle` prop, which now feeds the browser document-title hook through the shared platform layer.

Required behavior:
- shell pages should render `{mobileTitle} | MySTUdent Workspace` in the browser tab
- routes that bypass `StudentLayout` should not hand-roll title behavior unless they intentionally own their own standalone route chrome
- future student shell APIs should expand at the layout boundary if visible and browser titles need to diverge

## Responsive Supplement Contract

Student responsive work preserves the desktop workspace and compresses it through shared shell primitives.

Required rules:
- shared shell pages should reuse `StudentLayout` mobile behavior and `mobileStyles` before inventing page-local responsive systems
- shared feed/content inset on collapsed widths is `16px 12px 24px`
- visible mobile shell controls and repeated page actions must meet the `44px x 44px` minimum target
- only intentional tab or filter rows may scroll horizontally, and those rows must hide scrollbars and remain fully reachable
- mobile overlays should preserve the same workflow meaning as desktop while using full-viewport or bottom-sheet presentations when space is constrained
- student mobile layouts must remain free of unintended horizontal overflow at phone widths

## Shell-Hosted Versus Layout-Hosted Routes

Student shell behavior is no longer defined only by public URL shape.

### Shell-hosted pages

These routes live inside `StudentShellRoute` and consume the shared shell data owner while preserving their existing public URLs:
- `/student/homework/:homeworkId`
- `/student/results/:sessionCode`

### Layout-hosted pages outside the shell route tree

Some routes intentionally remain top-level but still render the shared student shell language through `StudentLayout`.

Current example:
- `/student-test-results/:sessionCode`

Rule:
- route placement may change internally when needed, but public student URLs and their semantics remain part of the product contract unless a PRD explicitly approves a path change

## Dashboard Feed Contract

Dashboard is not treated as a social feed clone.

It must use the approved Stitch dashboard anchor in `.stitch/designs/student-overhaul-from-academic-record-20260331/dashboard.html` as the feed-specific reference, while preserving the real student route structure and information architecture.

Required center-canvas order:
- sticky workspace masthead with light utilities
- frameless metric strip using typographic columns rather than boxed KPI cards
- slim editorial tab row
- vertical academic timeline feed

Required feel:
- lighter masthead utilities such as search, unread filter, and academic-history action
- whitespace-led grouping instead of nested cards
- concise metadata-derived body copy instead of raw notification dumps
- restrained inline actions instead of nested CTA blocks

Disallowed feel:
- toolbar-heavy mastheads
- stacked card dashboards
- nested widget boxes inside each feed item
- generic event-card rendering that erases event-specific row anatomy
- heavy column borders that make the shell feel boxed

## Dashboard Right Rail Contract

Dashboard uses the shared shell right rail on the live route and appends only one page-specific supplement.

Rules:
- the shell renders `Live Now`, `Up Next`, and `My Classes`
- dashboard appends `Pending Reviews` as a quieter page-specific supplement
- the sidebar and route structure must preserve the real app IA even when the visual tone follows Stitch
- dashboard must not diverge into a separate page-owned rail composition unless the architecture contract is explicitly revised

## Dashboard Variant Mapping

Dashboard feed rows are intentionally composed from explicit row variants instead of one generic renderer.

Expected variants:
- result/test rows: sparse, score-led, timeline-first composition
- homework rows: one quiet inset excerpt or meta surface with restrained support text
- class-update rows: mostly textual update with one restrained action

This protects parity with the approved dashboard anchor while staying connected to real product data.

## Academic Record Contract

Academic Record remains the primary visual anchor for the student system.

It governs:
- tonal layering
- section hierarchy
- metric treatment
- flatter record rows and quieter dividers
- the overall pace and density for the student workspace

Dashboard, Homework, Courses, Library, Course Detail, Class Detail, Profile, Homework Detail, and Test Results should inherit this tone while preserving their own information architecture.

## Implementation Anchors

Key implementation files:
- `src/components/layout/StudentLayout.tsx`
- `src/components/layout/StudentSidebar.tsx`
- `src/components/layout/StudentRightRail.tsx`
- `src/components/layout/studentLayoutStyles.ts`
- `src/pages/AcademicRecordPage.tsx`
- `src/pages/StudentDashboardPage.jsx`
- `src/components/dashboard/StudentDashboardFeedView.jsx`
- `src/components/dashboard/PendingReviewsWidget.tsx`
- `src/pages/StudentHomeworkDetailPage.tsx`
- `src/pages/StudentTestResultsPage.tsx`

## Standalone Student Test Delivery Surfaces

Some student routes intentionally bypass `StudentLayout` and own their own standalone delivery chrome.

Required rules:
- IELTS Reading live-test and practice routes are standalone student-facing pages and must not inherit shell rail chrome
- when those routes classify as phone Reading, they must hand off to the shared mobile Reading scaffold contract documented in `documentation/architecture/mobile-ielts-reading-test-taking-architecture.md`
- student shell entry points such as Library and Homework remain responsible for passing launch context intact into those standalone test routes

## Related Docs

- `documentation/design/student-view-design-standard.md`
- `documentation/architecture/student-mobile-responsiveness-architecture.md`
- `documentation/architecture/student-dashboard-architecture.md`
- `documentation/architecture/student-shell-right-rail-architecture.md`
- `documentation/architecture/student-shell-data-loading.md`
- `documentation/architecture/browser-document-title-architecture.md`
- `documentation/architecture/mobile-ielts-reading-test-taking-architecture.md`
- `documentation/rules/student-data-loading.md`
