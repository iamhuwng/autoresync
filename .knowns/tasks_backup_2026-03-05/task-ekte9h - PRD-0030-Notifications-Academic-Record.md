---
id: ekte9h
title: 'PRD-0030: Notifications & Academic Record'
status: done
priority: high
labels:
  - prd-0030
  - ielts-writing
  - phase-8
  - epic
  - student
  - notifications
  - academic-record
  - dashboard
createdAt: '2026-02-27T20:04:07.921Z'
updatedAt: '2026-02-28T03:18:04.072Z'
timeSpent: 0
---
# PRD-0030: Notifications & Academic Record

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 8 epic for IELTS Writing Test System (PRD-0030). Covers writing-specific notification functions, academic record writing progress section with criteria trend charts, and student dashboard pending reviews widget. Implements 5 notification triggers (submitted, graded, partially graded, reopened, re-graded) wrapped in withRestoreGuard(), a WritingProgressSection with CSS line chart for graded results and per-criteria averages, AcademicRecordPage updates with new Writing tab, PendingReviewsWidget showing max 5 pending items, and StudentDashboardPage integration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 5 subtasks completed
- [ ] #2 5 notification functions with withRestoreGuard
- [ ] #3 Writing progress chart in academic record
- [ ] #4 PendingReviewsWidget on dashboard
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Notification functions (8.1) 2. WritingProgressSection (8.2) 3. AcademicRecordPage tab (8.3) 4. PendingReviewsWidget (8.4) 5. Dashboard integration (8.5)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Notifications wrapped in withRestoreGuard. Band trend: CSS-only chart. Per-criteria averages from graded submissions. PendingReviewsWidget: pending-review submissions.
<!-- SECTION:NOTES:END -->

