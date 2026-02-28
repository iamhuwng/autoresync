---
title: 'Pattern: Multi-Hop Navigation State Propagation'
createdAt: '2026-02-28T03:53:29.466Z'
updatedAt: '2026-02-28T03:53:57.897Z'
description: >-
  How to correctly propagate location.state data through multi-hop navigation
  chains (source page → router page → leaf component) without data loss
tags:
  - pattern
  - navigation
  - react-router
  - location-state
---
# Pattern: Multi-Hop Navigation State Propagation

## Problem

When navigation state (`location.state`) passes through multiple layers — Source Page → Router Page → Leaf Component — data fields can silently drop if any layer in the chain forgets to:
1. **Declare** the field in its state type/interface
2. **Forward** the field to the next consumer

This is especially dangerous because there are no build errors — the field simply arrives as `undefined` at the leaf, causing silent feature breakage.

### Bug Class: "Placeholder Ternary"
A common symptom is code like:
```typescript
dueDate: locationState.context?.source?.id ? undefined : undefined,
```
This looks like a "TODO" placeholder but compiles cleanly, always returns `undefined`, and is never caught by TypeScript.

## Solution

### 1. Define a Complete State Interface at Each Hop

```typescript
// In the ROUTER page (the middle hop)
interface PracticeLocationState {
    isHomework?: boolean;
    homeworkId?: string;
    submissionId?: string;
    dueDate?: number;              // ← MUST be declared here
    lateSubmissionAllowed?: boolean; // ← even if only used by leaf
}
```

### 2. Pass All Fields from Source

```typescript
// Source page (e.g., StudentHomeworkDetailPage)
navigate(`/student/practice/${homework.materialId}`, {
    state: {
        isHomework: true,
        homeworkId,
        submissionId: submission.id,
        dueDate: homework.scheduling?.dueDate,           // ← Pass it
        lateSubmissionAllowed: homework.config?.lateSubmissionAllowed ?? false,
    },
});
```

### 3. Forward to Leaf Component

```typescript
// Router page → Leaf component
<WritingPracticeView
    homeworkContext={locationState.isHomework ? {
        homeworkId: locationState.homeworkId || '',
        dueDate: locationState.dueDate,                   // ← Forward it
        lateSubmissionAllowed: locationState.lateSubmissionAllowed ?? false,
    } : undefined}
/>
```

## Self-Check

When adding a new field to `location.state`:

| Step | Check |
|------|-------|
| 1 | Field is in source page's `navigate()` `state` object |
| 2 | Field is in the router/intermediate page's state interface |
| 3 | Field is forwarded to the leaf component's props |
| 4 | Leaf component reads and uses the field |
| 5 | **ALL call-sites** that navigate to this route include the field |

### Gotcha: Multiple Source Pages

A single route often has multiple source pages. **Every source must pass the field:**
```
StudentHomeworkDetailPage → /student/practice/:id  ← passes dueDate ✅
StudentHomeworkListPage   → /student/practice/:id  ← passes dueDate ✅
UpcomingHomeworkWidget    → /student/practice/:id  ← passes dueDate ✅
StudentCourseDetailPage   → /student/practice/:id  ← passes dueDate ❓ (check!)
```

Use grep to find all sources:
```bash
grep -r "/student/practice/" src/ --include="*.tsx" --include="*.jsx"
```

## Anti-Pattern: Tab-Switch State

A related pattern is passing `tab` as state to auto-switch a tab:
```typescript
// Source: PendingReviewsWidget "See all" button
navigate('/student/academic-record', { state: { tab: 'writing' } });

// Target: AcademicRecordPage — MUST read it
useEffect(() => {
    if (location.state?.tab) {
        setActiveTab(location.state.tab);  // ← Without this, users land on default tab
    }
}, [location.state]);
```

## Source

Discovered during IELTS Writing bug fix session:
- `StudentPracticePage` had `dueDate: undefined : undefined` placeholder
- `AcademicRecordPage` ignored `location.state?.tab` from PendingReviewsWidget
- Multiple source pages (`StudentHomeworkDetailPage`, `StudentHomeworkListPage`) were not passing `dueDate` in navigate state

## Related

- @doc/integration-safety-rules — Rule 2 (Page-Entry Prerequisite Handshake)
- @doc/patterns/pattern-prd-integration-audit-checklist — Section 4 (Navigation State Handoff)
