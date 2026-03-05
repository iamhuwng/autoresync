---
id: jtjism
title: 'PRD-0030: Grading System'
status: done
priority: high
labels:
  - prd-0030
  - ielts-writing
  - phase-5
  - epic
  - teacher
  - grading
createdAt: '2026-02-27T20:03:27.527Z'
updatedAt: '2026-02-27T22:29:29.554Z'
timeSpent: 0
---
# PRD-0030: Grading System

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 5 epic. Teacher grading system: TipTap feedback editor, grading queue with filters, side-by-side grading interface, annotation toolbar (5 types + custom), criteria scoring (0-9), category manager, void/unvoid, audit trail, submit with band calculation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 13 subtasks completed
- [ ] #2 TipTap for feedback only
- [ ] #3 5 annotation types + custom categories
- [ ] #4 IELTS band scoring with validation
- [ ] #5 Audit trail for re-grading
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TipTap install (5.0.1) 2. Queue page (5.1) 3. Scoring (5.2) + Toolbar (5.3) + Renderer (5.4) 4. Feedback (5.5) + Categories (5.6) 5. Void (5.7) + Audit (5.8) 6. Grading page (5.9) 7. Submit grading (5.10) 8. Routes (5.11) + Nav (5.12)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TipTap only for teacher feedback. Annotations as character offsets. Band calc from Phase 1. Re-grading requires reason. Safety Rule 11: withRestoreGuard on writes.
<!-- SECTION:NOTES:END -->

