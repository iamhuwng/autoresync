---
title: Student Shell Data Loading Architecture
description: 'Canonical ownership and loading contract for student shell routes: one persistent shell data owner, shared consumers, and route-safe page loading boundaries.'
createdAt: '2026-03-31T02:54:47.750Z'
updatedAt: '2026-03-31T22:29:27.125Z'
tags:
  - architecture
  - student
  - data-loading
  - performance
  - governance
---

# Student Shell Data Loading Architecture

## Purpose

This document defines the canonical data-loading model for student shell pages.

It exists to keep student navigation fast, resource usage predictable, and future feature work composable.

The key rule is simple:
- shell-shared student data gets one persistent owner per student shell route tree
- shell consumers and page consumers reuse that owner instead of mounting overlapping loaders

## Problem This Solves

The student shell had drifted into duplicate ownership.

Symptoms before the 2026-03-31 repair:
- sibling tab changes remounted shell-level class, session, and homework loaders
- student shell pages paid repeated Firestore listen and hydration cost on left-column navigation
- helper services on page surfaces performed second membership reads even when the shell already had the same student class projection
- small datasets still felt slow because the architecture kept repeating the same work

This was not primarily a database-size problem. It was an ownership and read-path problem.

## Scope

This architecture applies to student shell routes rendered inside the shared student layout:
- `/student`
- `/student/dashboard`
- `/student/homework`
- `/student/courses`
- `/student/courses/:courseId`
- `/student/classes/:classId`
- `/student/library`
- `/student/academic-record`

Routes outside that shared shell host may use different owners because they are different host surfaces.

## Canonical Ownership Model

The owner lives above sibling shell pages, not inside individual pages.

Current repo shape:
- `StudentShellRoute` wraps the student shell route group
- `StudentShellDataProvider` owns shared shell data for that route tree
- `StudentLayout`, `StudentRightRail`, and shell pages consume resolved shell data from the provider
- fallback hook ownership is allowed only when a surface is truly outside the provider boundary

This means left-column navigation between shell pages preserves shell-owned data instead of recreating it.

## Shell-Owned Datasets

The shared shell owner is responsible for:
- enrolled class membership summaries
- active live-session summaries derived from enrolled classes
- homework summary groups used by shell widgets and page-level counters

Right-rail upcoming, live-session, and class summary projections remain shell-owned even when dashboard-specific components restate them in a page-shaped composition.

Current repo anchors:
- `src/App.jsx`
- `src/context/StudentShellDataContext.tsx`
- `src/hooks/useStudentShellData.ts`
- `src/hooks/useHomeworkSubmission.ts`
- `src/components/layout/StudentRightRail.tsx`

## Consumer Rules

### Shell Consumers

Shell consumers such as `StudentRightRail` must be pure readers of provider-owned shell data when they render inside the shell route tree.

They must not instantiate another shell owner on mount.

### Page Consumers

Student shell pages may consume shell-owned summaries when they need the same information for page behavior.

Allowed:
- deriving counters, filters, urgency groups, or CTA state from shell-owned summaries
- deriving dashboard metric-strip values, weekly-focus summaries, `Up Next`, public-session excerpts, and unread or feed filters from shell-owned summaries plus page-owned notification data
- passing shell-owned projections into helper services so those services do not reread the same source

Not allowed:
- calling another page-local loader for enrolled classes, active sessions, or homework summaries when the shell provider already owns them
- broadening a page helper into a second shell owner
- turning tab switches into new shell ownership boundaries
- introducing page-local widget loaders for rail summaries that the shell already owns

## Service Integration Rule

Service helpers that enrich page data from student class membership must accept shell-owned membership projections when available.

Current repo anchor:
- `getEnrollmentsByStudent(studentId, { studentClasses })`

This prevents enrollment surfaces from rereading `getStudentClasses(studentId)` after the shell already resolved the same membership set.

## Academic Record Boundary

Academic Record is page-owned for its center-column record dataset.

It is not shell-owned for result history.

However, Academic Record still lives inside the persistent student shell provider, so route entry into Academic Record must not recreate shell-owned class, live-session, or homework loaders.

The ownership split is therefore:
- shell provider owns shell-global summaries
- `AcademicRecordPage` owns record-history data
- both owners coexist without duplicating each other

## Dashboard-Owned Dataset Boundary

Dashboard is inside the persistent student shell, but it still owns page-primary datasets that are not part of the shell provider.

Dashboard-owned datasets:
- paginated student notifications
- unread and search interaction state
- public-session discovery rows and expansion state
- join-class modal state
- selected result panel state

Dashboard must consume shell-owned summaries instead of recreating them:
- enrolled class membership summaries
- class live-session summaries
- homework summary groups used for dashboard metrics and urgency queues

Derived view models should be assembled in the page host before being passed down.

This yields the intended split:
- shell provider owns reusable student shell summaries
- `StudentDashboardPage.jsx` owns dashboard-primary activity and public-session data
- `StudentDashboardFeedView.jsx` and `StudentDashboardRightRail.jsx` stay presentational and receive derived view models from the page host

## Future Growth Rules

For future student shell work:
- add new shell-global student summaries to the provider, not to arbitrary pages
- keep page hosts responsible only for page-primary datasets
- prefer stale-while-revalidate for page hosts after the first successful load
- do not backfill, repair, or persist data during page mount or tab switch
- do not let convenience helpers hide duplicate reads of shell-owned data

## Related Docs

- @doc/architecture/student-shell-right-rail-architecture
- @doc/architecture/student-dashboard-architecture
- @doc/architecture/student-experience-architecture
- @doc/patterns/pattern-student-shell-single-data-owner
- @doc/patterns/pattern-summary-first-detail-on-demand
- @doc/patterns/pattern-bulk-enrichment-from-shared-student-history

## First-Entry Warmup

The student shell now uses route-owned warmup in addition to the persistent shell data owner.

Rules:
- the shell provider may prefetch selected student shell routes after login
- prefetch may warm route chunks and page-owned caches, but it must not create a second owner for shell-shared data
- Library and Academic Record can warm immediately after shell entry
- Courses warms after shell-owned class membership is ready so it can reuse the student-safe class projection instead of a broader fallback read

Verification contract:
- revisits stay stale-while-revalidate
- after fresh login plus the warmup window, first entry into warmed student shell pages should avoid blocking loaders

## Startup Bundle Boundary

Student shell data-loading and student startup segmentation are separate but adjacent contracts.

Rules:
- shell-owned data preload may warm shared student summaries
- route-module warmup may preload selected shell pages and page-owned caches
- startup optimization must not reintroduce a second owner for shell-shared data
- startup-sensitive changes should also satisfy the bundle guardrails in @doc/architecture/student-startup-bundle-segmentation

## Verification Standard

When student shell loading changes, verify with a live browser run.

The minimum pass condition for sibling shell navigation is:
- no repeated shell membership scan on left-column tab changes
- no repeated expired-session hydration noise from tab changes
- no new shell-level listeners started by pages that only consume shell-owned summaries
- dashboard parity refactors do not reintroduce duplicate reads for the right rail or metric strip
