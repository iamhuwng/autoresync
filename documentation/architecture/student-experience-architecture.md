# Student Experience Architecture

## Purpose

This document defines the architectural contract for the student-facing workspace after the 2026-03-31 overhaul and dashboard parity follow-up.

It exists to keep implementation, review, and future UI work aligned to the approved Stitch direction instead of drifting back toward older social-feed, boxed-dashboard, or generic-widget patterns.

## Scope

This architecture applies to student shell pages rendered inside the shared student layout:
- `/student`
- `/student/dashboard`
- `/student/homework`
- `/student/courses`
- `/student/courses/:courseId`
- `/student/classes/:classId`
- `/student/library`
- `/student/academic-record`
- `/student/profile`

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

### Tablet and Mobile
- Preserve the existing mutual-exclusion drawer behavior for the left and right rails
- Preserve the mobile page host and navigation contract
- Carry the same tonal and editorial language into smaller breakpoints instead of reverting to legacy feed styling

## Workspace Chrome And Browser Title Contract

For shared student shell pages, `StudentLayout` owns both:
- the mobile visible workspace title
- the browser tab title

The shell title source is the `mobileTitle` prop, which now feeds the browser document-title hook through the shared platform layer.

Required behavior:
- shell pages should render `{mobileTitle} | MySTUdent Workspace` in the browser tab
- routes that bypass `StudentLayout` should not hand-roll title behavior unless they intentionally own their own standalone route chrome
- future student shell APIs should expand at the layout boundary if visible and browser titles need to diverge

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

Dashboard, Homework, Courses, Library, Course Detail, Class Detail, and Profile should inherit this tone while preserving their own information architecture.

## Implementation Anchors

Key implementation files:
- `src/components/layout/StudentLayout.tsx`
- `src/components/layout/StudentSidebar.tsx`
- `src/components/layout/StudentRightRail.tsx`
- `src/components/layout/studentLayoutStyles.ts`
- `src/pages/AcademicRecordPage.tsx`
- `src/pages/StudentDashboardPage.jsx`
- `src/components/dashboard/StudentDashboardFeedView.jsx`
- `src/components/dashboard/StudentDashboardRightRail.jsx`

## Related Docs

- `documentation/design/student-view-design-standard.md`
- `documentation/architecture/student-dashboard-architecture.md`
- `documentation/architecture/student-shell-right-rail-architecture.md`
- `documentation/architecture/student-shell-data-loading.md`
- `documentation/architecture/browser-document-title-architecture.md`
- `documentation/rules/student-data-loading.md`
