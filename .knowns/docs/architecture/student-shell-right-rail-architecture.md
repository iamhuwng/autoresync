---
title: Student Shell Right Rail Architecture
description: Architecture contract for the shared student shell layout, global right rail, shared data hook, and page-level extension pattern.
createdAt: '2026-03-30T03:14:40.723Z'
updatedAt: '2026-03-31T00:26:19.014Z'
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

The shared student desktop shell uses a fixed 3-column grid:
- left rail: `220px`
- center feed: `minmax(0, 1fr)` with page content capped at `860px`
- right rail: `280px`
- shell max width: `1440px`
- column gap: `24px`
- horizontal padding: `24px`

The center feed is allowed to expand beyond the older `600px` cap so feed pages can use the available viewport more effectively.

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

`useStudentShellData` centralizes shell data that used to be duplicated in page components.

Shared sources:
- enrolled classes from `getStudentClasses`
- live class sessions from `subscribeToActiveSessions` plus `getSession`
- homework summary groups from `useStudentHomeworkList`

The shell data hook exposes:
- `enrolledClasses`
- `classLiveSessions`
- `notStarted`
- `inProgress`
- `overdue`
- `sortedAssignments`
- `isClassesLoading`
- `refreshClasses()`

Pages may consume the hook when they need the same shared data for first-class page behavior, but the shell owns the global presentation.

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
- `src/components/layout/StudentLayout.tsx`
- `src/components/layout/studentLayoutStyles.ts`
- `src/components/layout/StudentRightRail.tsx`
- `src/hooks/useStudentShellData.ts`

Related docs:
- @doc/architecture/student-experience-architecture
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
- @doc/patterns/pattern-student-shell-single-data-owner
- @doc/patterns/pattern-summary-first-detail-on-demand
- @doc/patterns/pattern-bulk-enrichment-from-shared-student-history


## Current Implementation Status

As of 2026-03-31, the dashboard/right-rail duplication path is removed.

Current implementation anchor:
- `StudentDashboardPage` owns the shared shell dataset for that surface through one `useStudentShellData()` call
- `StudentLayout` accepts an optional `shellData` prop so a page owner can pass shell-owned data downward
- `StudentRightRail` now supports a pure-consumer mode via `shellData` and keeps a connected fallback only for pages that have not been migrated yet

This means the dashboard and the right rail no longer instantiate overlapping shell loaders for classes, live sessions, and upcoming homework on the same page.

Follow-up note:
- other student shell pages still rely on the connected fallback until they are migrated to an explicit shared owner or provider
