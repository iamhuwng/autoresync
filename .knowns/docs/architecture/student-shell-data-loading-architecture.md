---
title: Student Shell Data Loading Architecture
description: 'Canonical ownership and loading contract for student shell routes: one persistent shell data owner, shared consumers, and route-safe page loading boundaries.'
createdAt: '2026-03-31T02:54:47.750Z'
updatedAt: '2026-03-31T22:26:32.147Z'
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

This architecture does not automatically apply to routes outside the shared shell host, such as:
- course catalog
- homework detail and test-taking flows
- practice and session routes

Those routes may use different loading owners because they are different host surfaces.

## Canonical Ownership Model

The owner lives above sibling shell pages, not inside individual pages.

Current repo shape:
- `StudentShellRoute` wraps the student shell route group
- `StudentShellDataProvider` owns shared shell data for that route tree
- `StudentLayout`, `StudentRightRail`, and shell pages consume resolved shell data from the provider
- fallback hook ownership is allowed only when a surface is truly outside the provider boundary

This means left-column navigation between shell pages should preserve shell-owned data instead of recreating it.

## Shell-Owned Datasets

The shared shell owner is responsible for:
- enrolled class membership summaries
- active live-session summaries derived from enrolled classes
- homework summary groups used by shell widgets and badge-like page widgets
- right-rail ready upcoming, live-session, and enrolled-class summary projections even when a page-specific rail restates them differently

Current implementation anchors:
- `src/context/StudentShellDataContext.tsx`
- `src/hooks/useStudentShellData.ts`
- `src/hooks/useHomeworkSubmission.ts`
- `src/components/layout/StudentRightRail.tsx`
- `src/App.jsx`

## Consumer Rules

### Shell Consumers

Shell consumers such as `StudentRightRail` must be pure readers of provider-owned shell data when they render inside the shell route tree.

They must not instantiate another shell owner on mount.

### Page Consumers

Student shell pages may consume shell-owned summaries when they need the same information for page behavior.

Allowed:
- deriving counters, filters, urgency groups, or CTA state from shell-owned summaries
- passing shell-owned projections into helper services so those services do not reread the same source
- deriving dashboard metric-strip values, weekly-focus summaries, `Up Next`, public-session excerpts, and unread or feed filter presentation from shell-owned summaries plus page-owned notification data

Not allowed:
- calling another page-local loader for enrolled classes, active sessions, or homework summaries when the shell provider already owns them
- creating page-local widget loaders for right-rail summaries that already belong to the shell owner
- broadening a page helper into a second shell owner
- turning tab switches into new shell ownership boundaries

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

## Homework Boundary

Homework list and related shell pages may read homework summaries from the shared shell owner for:
- upcoming work modules
- sidebar counters
- urgency selectors used outside the dedicated homework center-column host

The detailed homework page host may still own additional page-specific detail loads that the shell does not need.

## Future Growth Rules

For future student shell work:
- add new shell-global student summaries to the provider, not to arbitrary pages
- keep page hosts responsible only for page-primary datasets
- prefer stale-while-revalidate for page hosts after the first successful load
- keep student shell warmup split between shell-owned data preload and page-owned route/cache preload
- do not backfill, repair, or persist data during page mount or tab switch
- do not let convenience helpers hide duplicate reads of shell-owned data

## Verification Standard

When student shell loading changes, verify with a live browser run.

The minimum pass condition for sibling shell navigation is:
- no repeated shell membership scan on left-column tab changes
- no repeated expired-session hydration noise from tab changes
- no new shell-level listeners started by pages that only consume shell-owned summaries
- dashboard parity refactors do not reintroduce duplicate reads for the metric strip or right-rail summaries

For startup-sensitive changes on the student path, also verify:
- first authenticated student entry does not fetch optional heavy bundles before explicit navigation
- warmed student shell routes avoid blocking loaders after the warmup window

## Related Docs

- @doc/architecture/student-dashboard-architecture
- @doc/architecture/student-experience-architecture
- @doc/architecture/student-shell-right-rail-architecture
- @doc/architecture/student-startup-bundle-segmentation
- @doc/design/student-view-design-standard
