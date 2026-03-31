---
title: Student Shell Right Rail Architecture
description: Architecture contract for the shared student shell layout, global right rail, shared data hook, and page-level extension pattern.
createdAt: '2026-03-30T03:14:40.723Z'
updatedAt: '2026-03-31T20:43:48.723Z'
tags:
  - architecture
  - student
  - layout
  - right-rail
---

# Student Shell Right Rail Architecture

## Overview

The student shell is a shared platform feature owned by `StudentLayout`, not by any individual page. Every page that uses the student shell gets the same desktop 3-column structure, the same mobile/tablet drawer pattern, and the same shell-owned global right rail.

This architecture applies to:
- `StudentDashboardPage`
- `StudentHomeworkListPage`
- `AcademicRecordPage`
- `StudentCoursesPage`
- `StudentCourseDetailPage`
- `StudentClassDetailPage`
- `StudentLibraryPage`
- `ProfilePage`

## Layout Contract

### Desktop

The shared student desktop shell uses a fixed left rail with an editorial center canvas and a contextual right rail:
- left rail: fixed visual anchor owned by `StudentLayout`
- center canvas: `minmax(0, 1fr)` with page content capped around `960px`
- right rail: fixed-width contextual column rendered by the shell
- shell composition should feel like one workspace, not three hard boxed columns
- horizontal padding and gutters should support long-form reading rhythm rather than dashboard density

The center canvas is intentionally wider than the old `600px` cap so Academic Record and Dashboard can share the same editorial reading model.

The dashboard feed must preserve the same center-column language as the approved Stitch dashboard export:
- sticky workspace masthead
- frameless metric strip using typographic columns instead of KPI cards
- slim editorial tab row
- timeline-style activity rows with a left icon rail and quiet dividers
- no nested CTA cards inside feed rows

### Tablet and Mobile

Tablet and mobile remain feed-first layouts. The left navigation and right rail move into off-canvas drawers owned by `StudentLayout`. Pages should rely on the shell toggle behavior instead of implementing their own mobile right-rail trigger unless they need a deliberate override.
## Right Rail Ownership

The global right rail is rendered by `StudentRightRail` and always appears on student shell pages.

Shell-owned modules:
- `Live Now`: active class sessions with the existing waiting-room join flow
- `Up Next`: upcoming homework deadlines using the shared homework data source
- `My Classes`: enrolled-class summary and fallback content when there are no live sessions

Page-owned modules are supplemental only. Pages keep the `rightPanel` prop name for compatibility, but the meaning changed:
- before: page-owned full right column
- after: page-owned supplemental modules rendered underneath the shell-owned modules

Pages should not render structural rail wrappers such as sticky containers, fixed widths, or empty placeholder `<div />` panels.

## Shared Data Contract

`useStudentShellData` remains the canonical shell data model, but the ownership boundary is now route-scoped rather than page-scoped.

Shared sources:
- enrolled classes from `getStudentClasses`
- live class sessions from `subscribeToActiveSessions` plus `getSession`
- homework summary groups from `useStudentHomeworkList`

The canonical shell owner now lives in `StudentShellDataProvider`, mounted above the student shell route tree.

Consumers use resolver hooks:
- `useResolvedStudentShellData()`
- `useResolvedStudentHomeworkList()`

These hooks consume provider-owned data inside the student shell route tree and only fall back to direct hook ownership outside that boundary.

## Extension Pattern

Current page supplements:
- dashboard: public sessions and pending writing reviews
- homework: homework summary widget
- records: overview and right-module selector
- profile: teacher invitation card

Current shell-only pages:
- courses
- course detail
- class detail
- library

If a future page needs additional right-rail UI, append page-specific modules through `rightPanel` instead of rebuilding the rail.

## Navigation and Tracking

The shell live-session CTA must keep the existing student waiting-room flow:
- call `sessionService.setPlayerData(...)`
- navigate to `STUDENT_WAITING`

Shell-level tracking should use direct action tracking rather than page-view tracking hooks because the rail is shared across multiple pages.

## Implementation Notes

Key files:
- `src/App.jsx`
- `src/context/StudentShellDataContext.tsx`
- `src/components/layout/StudentLayout.tsx`
- `src/components/layout/studentLayoutStyles.ts`
- `src/components/layout/StudentRightRail.tsx`
- `src/hooks/useStudentShellData.ts`

Related docs:
- @doc/architecture/student-experience-architecture
- @doc/architecture/student-shell-data-loading-architecture
- @doc/design/student-view-design-standard

## Data-Loading Governance

The shell data contract is intentionally stricter than the visual layout contract.

Required rules:
- shell-shared student datasets have exactly one owner
- that owner lives in `StudentLayout` or a dedicated shell provider consumed by `StudentLayout`
- `StudentRightRail` and shell pages consume the same owner; they must not instantiate overlapping loaders for enrolled classes, live sessions, homework summaries, or future shell-global student data
- page-specific widgets may derive selectors from shell-owned data, but they must not broaden the read scope or create page-local copies of the same loading pipeline
- shell refresh policy belongs to the owner, including stale-while-revalidate, retry, and cache invalidation behavior

Future student shell work must explicitly state:
- whether the surface consumes summary/read-model data or full detail
- why the chosen owner is the canonical one
- which governance rule and pattern doc the change follows

Required companion docs for student shell data-loading work:
- @doc/architecture/student-experience-architecture
- @doc/architecture/student-shell-right-rail-architecture
- @doc/architecture/student-shell-data-loading-architecture
- @doc/patterns/pattern-student-shell-single-data-owner
- @doc/patterns/pattern-summary-first-detail-on-demand
- @doc/patterns/pattern-bulk-enrichment-from-shared-student-history

## Current Implementation Status

As of 2026-03-31, the shared student shell uses one persistent shell-data owner across sibling student shell routes.

Current implementation anchor:
- `StudentShellRoute` wraps the main student shell route group
- `StudentShellDataProvider` owns shared shell data above dashboard, homework, courses, course detail, class detail, library, and academic-record routes
- `StudentRightRail` consumes resolved shell data instead of creating a second owner on those routes
- shell pages that only need homework counters or shell summaries now consume resolver hooks instead of instantiating duplicate loaders
- enrollment-oriented course surfaces reuse shell-owned class membership summaries when enriching enrollments

This means sibling left-column navigation no longer replays the shell-level class scan and live-session hydration path on every tab change.

## Student Class Membership Read Path

Canonical membership path for shell-owned enrolled classes:
- `getStudentClasses()` reads `student_classes/{studentId}/{classId}` first
- each index entry identifies a bounded set of class ids for that student shell surface
- top-level `classes` scans remain legacy fallback only for records that predate the projection

Ownership rules:
- class enrollment, approval, removal, and delete flows maintain `student_classes`
- the shell consumes that projection through `useStudentShellData`
- shell pages must not repair or backfill missing student membership rows during page load

## Warmup Boundary

Right-rail performance work must preserve the distinction between shell-owned summaries and page-owned route caches.

Rules:
- right-rail data stays owned by the persistent shell provider
- route warmup may prepare page-owned caches for shell pages, but it must not re-own right-rail summaries
- first-entry warmup should reduce page cold starts without adding another right-rail loader

## Framing Responsibility

Right-rail supplements may be self-framed widgets.

Required rule:
- if a page-owned module already includes its own card, border, radius, title row, or progress shell, `StudentLayout` and the page host must provide placement and spacing only
- do not wrap a self-framed widget in a second bordered section shell
- do not repeat the same heading in both the host page and the child widget

Use one framing owner per surface: either the host page frames plain content, or the child widget renders as a visually complete module.
