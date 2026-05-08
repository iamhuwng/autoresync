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

This architecture applies to student shell routes rendered inside the shared shell owner:
- `/student`
- `/student/dashboard`
- `/student/homework`
- `/student/homework/:homeworkId`
- `/student/courses`
- `/student/courses/:courseId`
- `/student/classes/:classId`
- `/student/library`
- `/student/academic-record`
- `/student/results/:sessionCode`

This architecture also informs layout-hosted student routes that preserve the shell language without living inside `StudentShellRoute`, such as:
- `/student-test-results/:sessionCode`

Standalone delivery routes still sit outside this contract unless they explicitly adopt the shared shell owner.

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

Visibility rule:
- shell-owned enrolled class membership summaries must include only student-visible memberships
- `pending_approval` and `removed` membership states must stay out of shell-owned class summaries even if the raw roster or projection record already exists

Right-rail upcoming, live-session, and class summary projections remain shell-owned even when dashboard-specific components restate them in a page-shaped composition.

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
- deriving dashboard metric-strip values, `Up Next`, and unread or feed filters from shell-owned summaries plus page-owned notification data
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

Class-approval rule:
- helper services receiving shell-owned class summaries must treat them as already approval-filtered
- self-service join requests must not trigger downstream coursework visibility before teacher approval

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
- join-class modal state
- selected result panel state

Dashboard supplemental widget-owned dataset:
- pending writing-review summaries loaded by `PendingReviewsWidget.tsx`

Dashboard must consume shell-owned summaries instead of recreating them:
- enrolled class membership summaries
- class live-session summaries
- homework summary groups used for dashboard metrics and urgency queues

Join-class approval rule:
- a successful class-code submission may update dashboard-local join request state, but it must not be treated as active shell membership
- dashboard should not force homework refresh or equivalent coursework refresh while the join remains `pending_approval`

Derived view models should be assembled in the page host before being passed down.

This yields the intended split:
- shell provider owns reusable student shell summaries
- `StudentDashboardPage.jsx` owns dashboard-primary activity data and the derived center-column view models
- `PendingReviewsWidget.tsx` owns its narrow supplemental query
- `StudentDashboardFeedView.jsx` stays presentational and receives derived view models from the page host

## Homework Boundary

Homework list and related shell pages may read homework summaries from the shared shell owner for:
- upcoming work modules
- sidebar counters
- urgency selectors used outside the dedicated homework center-column host

`/student/homework/:homeworkId` now lives inside the shell route tree, so the homework detail page consumes the shared shell owner for shell chrome and shared summaries while still owning its page-specific homework-detail dataset and start/resume workflow state.

## Results Boundary

Student results now use two hosting shapes with one user-facing contract.

### Shell-hosted legacy alias

The compatibility alias `/student/results/:sessionCode` lives inside `StudentShellRoute`.

Implications:
- it consumes the shared shell provider for shell summaries and right-rail composition
- it still owns the page-primary result/session dataset locally
- it must preserve the same semantics as the canonical results route when given a real session code

### Layout-hosted canonical route

The canonical route `/student-test-results/:sessionCode` remains outside the shared shell route tree.

Implications:
- it may render `StudentLayout` while self-providing shell-like dependencies at the layout boundary
- it must not turn itself into a second long-lived shell owner
- its page-primary results/session dataset remains page-owned

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
- dashboard parity refactors do not reintroduce duplicate reads for the right rail or metric strip
- route-hosting changes for homework detail or results do not accidentally create a second shell owner

For startup-sensitive changes on the student path, also verify:
- first authenticated student entry does not fetch optional heavy bundles before explicit navigation
- warmed student shell routes avoid blocking loaders after the warmup window

## Related Docs

- `documentation/architecture/student-mobile-responsiveness-architecture.md`
- `documentation/architecture/student-dashboard-architecture.md`
- `documentation/architecture/student-shell-right-rail-architecture.md`
- `documentation/architecture/student-startup-bundle-segmentation.md`
- `documentation/architecture/academic-record/page-architecture.md`
- `documentation/architecture/class-code-join-approval-gating.md`
- `documentation/architecture/course-class-management.md`
- `documentation/architecture/homework-solo-practice-architecture.md`
- `documentation/rules/student-data-loading.md`
- `documentation/architecture/student-experience-architecture.md`
