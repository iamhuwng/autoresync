---
id: hf16fy
title: 'PRD-0030: Writing Test Builder (Teacher)'
status: done
priority: high
labels:
  - prd-0030
  - ielts-writing
  - phase-2
  - epic
  - teacher
  - builder
createdAt: '2026-02-27T20:02:56.183Z'
updatedAt: '2026-02-27T22:25:15.918Z'
timeSpent: 0
---
# PRD-0030: Writing Test Builder (Teacher)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 2 epic. Teacher writing test builder with metadata panel, task panels (R2 image upload for Task 1), validation summary, auto-save drafts to Firestore with 2s debounce, and publish flow to RTDB. Format selection shows/hides panels via display:none.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 7 subtasks completed
- [ ] #2 R2 storage used for images  NOT Firebase Storage
- [ ] #3 Auto-save debounce uses useRef
- [ ] #4 Format toggle hides panels without unmounting
- [ ] #5 Publish validates then moves R2 temp images to permanent
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. MetadataPanel (2.1) 2. TaskPanel with R2 upload (2.2) 3. ValidationSummary (2.3) 4. TestBuilder assembly (2.4) 5. Publish flow (2.5) 6. App routes (2.6) 7. TestBuilderRouter (2.7)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
NEVER use Firebase Storage  all uploads via r2Storage.ts. GAP-06: useRef for debounce timer. GAP-07: URL param is draftId. Hidden panels use display:none not unmount. Route guard: PrivateRoute not TeacherGuard.
<!-- SECTION:NOTES:END -->

