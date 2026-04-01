---
title: Student Shell Right Rail Architecture
description: Architecture contract for the shared student shell layout, right rail ownership, and dashboard supplemental rail pattern.
createdAt: '2026-03-30T03:14:40.723Z'
updatedAt: '2026-04-01T05:44:56.006Z'
tags:
  - architecture
  - student
  - layout
  - right-rail
---

# Student Shell Right Rail Architecture

## Overview

The student shell is a shared platform feature owned by `StudentLayout`, not by any individual page. Every page that uses the student shell gets the same desktop 3-column structure, the same mobile and tablet drawer pattern, and the same shell-owned right-rail data boundary.

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
- center canvas: `minmax(0, 1fr)` with page content capped by page-class width rules
- right rail: fixed-width contextual column rendered by the shell or by an approved page-specific override
- shell composition should feel like one workspace, not three hard boxed columns
- horizontal padding and gutters should support long-form reading rhythm rather than dashboard density

The center canvas is intentionally wider than the old `600px` cap so Academic Record and Dashboard can share the same editorial reading model.

### Tablet and Mobile

Tablet and mobile remain shell-first layouts. The left navigation and right rail move into off-canvas drawers owned by `StudentLayout`. Pages should rely on the shell toggle behavior instead of implementing their own mobile right-rail trigger unless they need a deliberate override.

## Right Rail Ownership

The global right rail is rendered by `StudentRightRail` and always appears on student shell pages unless a page-specific override is explicitly approved.

Shell-owned modules:
- live session summaries
- upcoming homework summaries
- enrolled-class summary groups

Page-owned modules are supplemental only unless a page has an approved full override contract.

Rules:
- pages should not render structural rail wrappers such as sticky containers, fixed widths, or empty placeholder columns
- shell-owned summaries remain shell-owned even when a page-specific rail restates them differently
- page surfaces may reshape shell summaries, but must not re-own or reacquire them

## Extension Pattern

Current page supplements and overrides:
- dashboard: shared shell rail plus `PendingReviewsWidget` appended through `rightPanel`
- homework: homework summary supplement
- records: overview and right-module selector
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

## Dashboard Rail Contract

Dashboard right rail on the live route is shared-shell-first.

Required rules:
- the shell renders `Live Now`, `Up Next`, and `My Classes`
- `PendingReviewsWidget` is appended as a page-owned supplemental module
- the shared shell modules must remain visible unless a future architecture revision explicitly approves a replacement
- `PendingReviewsWidget` may self-frame, but it must not duplicate shell module headings or replace shell-owned summaries
- `StudentDashboardRightRail.jsx` is not the active right-rail owner for the current dashboard route

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

- @doc/architecture/student-dashboard-architecture
- @doc/architecture/student-experience-architecture
- @doc/architecture/student-shell-data-loading-architecture
- @doc/design/student-view-design-standard
