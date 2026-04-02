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
updatedAt: '2026-04-02T10:35:04.349Z'
timeSpent: 5400
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
2026-04-02 follow-up: added a teacher-only AI Suggestions tab to the IELTS Writing grading editor. The feature generates grammar and vocabulary-expression suggestions on first teacher open, persists them in private Firestore cache `writing_grading_ai_cache/{submissionId}`, and reuses existing comment/correction tools for injection instead of creating a second grading artifact. Added prompt split for Task 1 vs Task 2, observability actions, security-rule coverage, and focused unit/UI tests.
<!-- SECTION:NOTES:END -->

