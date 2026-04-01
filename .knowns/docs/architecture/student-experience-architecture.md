---
title: Student Experience Architecture
description: Student-facing system overview with shell, dashboard, and academic-record architecture contracts.
createdAt: '2026-02-27T16:18:36.604Z'
updatedAt: '2026-04-01T01:40:48.999Z'
tags:
  - architecture
  - student
  - design
  - ux
  - core
---

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

Dashboard uses a page-shaped right rail rather than the generic shared shell widget stack.

Rules:
- the rail is an editorial aside, not a set of reusable dashboard widgets
- `Feed Snapshot` is the primary summary surface
- `Weekly Focus` and `Up Next` belong to the same narrative composition
- `Public Sessions` is a quieter supporting section
- the sidebar and route structure must preserve the real app IA even when the visual tone follows Stitch

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

- @doc/design/student-view-design-standard
- @doc/architecture/student-dashboard-architecture
- @doc/architecture/student-shell-right-rail-architecture
- @doc/architecture/student-shell-data-loading-architecture

## Vertical Alignment Contract

All student page titles must sit at the same vertical baseline as the sidebar brand block and right rail module headings. The combined top padding from `S.feed` (24px) plus `S.feedHeader` (8px) equals 32px, which matches the Dashboard's unified baseline.

This prevents stacked padding from pushing sub-page titles lower than the Dashboard title. Any change to student layout padding must be verified across all five shell pages (Dashboard, Homework, Academic Record, Library, Courses).

Key file: `src/components/layout/studentLayoutStyles.ts`
