# Student Experience Architecture

## Purpose

This document defines the architectural contract for the student-facing workspace after the 2026-03-31 overhaul.

It exists to keep implementation, review, and future UI work aligned to the approved Stitch direction instead of drifting back toward the older social-feed or boxed-dashboard patterns.

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

## Dashboard Feed Contract

Dashboard is no longer treated as a social feed clone.

It must use the approved Stitch dashboard anchor in `.stitch/designs/student-overhaul-from-academic-record-20260331/dashboard.html` as the feed-specific reference.

Required anatomy:
- sticky workspace masthead
- frameless metric strip using typographic columns rather than boxed KPI cards
- slim editorial tab row
- vertical activity timeline with a left icon or node rail and quiet separators
- inline actions rather than nested CTA cards

Disallowed anatomy:
- stacked card dashboards
- nested widget boxes inside each feed item
- heavy column borders that make the shell feel boxed

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

## Related Docs

- `documentation/design/student-view-design-standard.md`
- `documentation/architecture/student-shell-data-loading.md`
- `documentation/rules/student-data-loading.md`
