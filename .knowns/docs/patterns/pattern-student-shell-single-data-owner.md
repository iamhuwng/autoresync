---
title: 'Pattern: Student Shell Single Data Owner'
description: 'Canonical data-loading pattern for student shell pages: one owner for shared shell datasets, consumers reuse that owner, and page widgets stay presentational.'
createdAt: '2026-03-30T23:50:55.586Z'
updatedAt: '2026-03-31T04:02:24.319Z'
tags:
  - pattern
  - student
  - data-loading
  - architecture
  - governance
---

# Pattern: Student Shell Single Data Owner

## Purpose

Use this pattern when the same student-facing data appears in both shell-owned UI and page-owned UI.

The goal is simple: one shared dataset gets one owner.

If enrolled classes, live sessions, homework summaries, or similar shell-level data is rendered in multiple places, the shell loads it once and every consumer reuses that result.

## Problem This Prevents

Without a single owner, student pages drift into duplicated loaders:
- the shell reads classes and live sessions for the right rail
- the page reads the same classes and live sessions for local widgets
- both loaders refresh independently
- both surfaces show separate loading states and repay the same network cost

This is how small datasets start feeling slow.

## Canonical Rule

For shell-shared student data:
- `StudentLayout` or a dedicated shell provider owns the read
- shell widgets consume the owned data
- page widgets consume selectors or props derived from the same owner
- refresh behavior is centralized in the owner
- page code must not instantiate a second overlapping loader for the same dataset

## Good Shape

```tsx
function StudentShellDataProvider({ children }: Props) {
  const shellData = useStudentShellData();

  return (
    <StudentShellDataContext.Provider value={shellData}>
      {children}
    </StudentShellDataContext.Provider>
  );
}

function StudentShellRoute() {
  return (
    <StudentShellDataProvider>
      <Outlet />
    </StudentShellDataProvider>
  );
}

function StudentCoursesPage() {
  const { enrolledClasses } = useResolvedStudentShellData();
  return <CoursesContent classes={enrolledClasses} />;
}
```

Why this is correct:
- one fetch owner
- one refresh policy
- consumers only derive or present data
- sibling route changes preserve shell-owned data

## Bad Shape

```tsx
function StudentRightRail() {
  const shellData = useStudentShellData();
  return <RailContent {...shellData} />;
}

function StudentDashboardPage() {
  const shellData = useStudentShellData();
  return <DashboardContent {...shellData} />;
}
```

Or worse:

```tsx
useEffect(() => {
  getStudentClasses(studentId).then(setClasses);
  subscribeToActiveSessions(studentId, setSessions);
}, [studentId]);
```

inside both the shell and the page.

A subtler bad shape is service-level duplication:

```tsx
const enrollments = await getEnrollmentsByStudent(studentId);
```

when the page already has shell-owned `studentClasses` and the service could accept them.

That shape duplicates ownership, duplicates loading states, and makes later changes unsafe.

## Review Checklist

Block the change if any answer is `yes`:
- Does the page instantiate a loader for data already owned by the shell?
- Do two surfaces refresh the same shell dataset independently?
- Does a page widget broaden the read scope instead of reusing shell data?
- Is there no single place to define stale-while-revalidate or retry behavior?
- Does a helper service hide a second read of shell-owned membership or summary data?

## When To Use Another Pattern Instead

Use @doc/patterns/pattern-summary-first-detail-on-demand when the surface is a list/detail problem rather than a shell-ownership problem.

Use @doc/patterns/pattern-bulk-enrichment-from-shared-student-history when the issue is per-card enrichment over a shared base dataset.

## Related Docs

- @doc/architecture/student-shell-right-rail-architecture
- @doc/architecture/student-shell-data-loading-architecture
- @doc/architecture/student-experience-architecture
- @doc/patterns/pattern-summary-first-detail-on-demand

## Current Repo Anchor

As of 2026-03-31, the student shell route group is the primary implementation anchor for this pattern.

Current implementation shape:
- `StudentShellRoute` mounts a persistent `StudentShellDataProvider` above the main student shell routes
- `StudentRightRail` and student shell pages consume `useResolvedStudentShellData()` or `useResolvedStudentHomeworkList()`
- dashboard, homework, courses, course detail, class detail, library, and academic-record route changes reuse the same shell owner instead of remounting duplicate shell loaders
- enrollment enrichment on course surfaces accepts shell-owned `studentClasses` instead of rereading student membership

Use this anchor when reviewing future student shell pages for duplicate ownership drift.

## Extension: Single Owner Plus Route Warmup

A single owner does not forbid route warmup.

Allowed extension:
- the shell may prefetch a route chunk and the page-owned cache for a shell page
- warmup must stop at the ownership boundary
- shell-owned summaries stay in the shell provider, while page-owned center-column datasets stay in the page host

This pattern keeps ownership clean while removing first-entry cold starts.
