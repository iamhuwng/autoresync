---
id: fbtwz4
title: 'PRD-0030: Student Writing Test Page (Live Session)'
status: done
priority: high
labels:
  - prd-0030
  - ielts-writing
  - phase-3
  - epic
  - student
  - live-session
createdAt: '2026-02-27T20:03:06.991Z'
updatedAt: '2026-02-27T23:26:01.671Z'
timeSpent: 0
---
# PRD-0030: Student Writing Test Page (Live Session)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 3 epic. Student live session writing test: split-panel layout (prompt 40%/editor 60%), plain textarea with word counter, external paste prevention, per-task active time tracking (5min gap), debounced RTDB auto-save, submit flow, timer auto-submit, reconnect/resume, teacher reopen.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All 9 subtasks completed
- [ ] #2 Split panel 40/60 layout
- [ ] #3 External paste blocked, internal allowed
- [ ] #4 RTDB auto-save debounced 3s
- [ ] #5 Timer expiry auto-submits
- [ ] #6 Reconnect resumes from saved state
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. PromptPanel (3.1) 2. Editor (3.2) 3. Paste prevention hook (3.3) 4. Time tracking hook (3.4) 5. Auto-save hook (3.5) 6. Submit modal (3.6) 7. Main page assembly (3.7) 8. Submit flow (3.8) 9. TestPageRouter (3.9)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-09: paste hook in useEffect. GAP-10: taskCount constant. GAP-11: props are testData+sessionCode. GAP-12: auth from useAuth. GAP-13: no Mantine in Suspense. GAP-14: submit via autoSubmitFromRTDB.

All 9 subtasks completed and verified: WritingPromptPanel, WritingEditor, useExternalPastePrevention, useActiveTimeTracking, useWritingAutoSave, WritingSubmitModal, WritingTestPage, submit flow, TestPageRouter.
<!-- SECTION:NOTES:END -->

