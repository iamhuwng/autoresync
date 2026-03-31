---
title: 'Pattern: Student Shell Single Data Owner'
description: 'Canonical data-loading pattern for student shell pages: one owner for shared shell datasets, consumers reuse that owner, and page widgets stay presentational.'
createdAt: '2026-03-30T23:50:55.586Z'
updatedAt: '2026-03-31T00:26:19.058Z'
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
function StudentShellDataProvider({ studentId, children }: Props) {
  const shellData = useStudentShellDataOwner(studentId);

  return (
    <StudentShellDataContext.Provider value={shellData}>
      {children}
    </StudentShellDataContext.Provider>
  );
}

function StudentLayout() {
  const shellData = useStudentShellData();

  return (
    <>
      <StudentRightRail data={shellData} />
      <PageContent />
    </>
  );
}

function StudentDashboardPage() {
  const { enrolledClasses, classLiveSessions } = useStudentShellData();
  const featuredClasses = enrolledClasses.slice(0, 3);

  return <DashboardWidgets classes={featuredClasses} sessions={classLiveSessions} />;
}
```

Why this is correct:
- one fetch owner
- one refresh policy
- consumers only derive or present data

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

That shape duplicates ownership, duplicates loading states, and makes later changes unsafe.

## Review Checklist

Block the change if any answer is "yes":
- Does the page instantiate a loader for data already owned by the shell?
- Do two surfaces refresh the same shell dataset independently?
- Does a page widget broaden the read scope instead of reusing shell data?
- Is there no single place to define stale-while-revalidate or retry behavior?

## When To Use Another Pattern Instead

Use @doc/patterns/pattern-summary-first-detail-on-demand when the surface is a list/detail problem rather than a shell-ownership problem.

Use @doc/patterns/pattern-bulk-enrichment-from-shared-student-history when the issue is per-card enrichment over a shared base dataset.

## Related Docs

- @doc/architecture/student-shell-right-rail-architecture
- @doc/architecture/student-experience-architecture
- @doc/patterns/pattern-summary-first-detail-on-demand


## Current Repo Anchor

As of 2026-03-31, the student dashboard is the primary implementation anchor for this pattern.

Current implementation shape:
- `StudentDashboardPage` owns one shell-data read
- `StudentLayout` receives that shared shell data through props
- `StudentRightRail` consumes the provided shell data instead of creating a second owner on the same page

Use this anchor when reviewing future student shell pages for duplicate ownership drift.
