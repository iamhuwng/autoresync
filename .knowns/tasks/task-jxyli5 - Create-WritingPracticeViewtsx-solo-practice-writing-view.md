---
id: jxyli5
title: Create WritingPracticeView.tsx — solo practice writing view
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-7
  - component
  - student
  - solo-practice
  - new-file
  - no-mantine
  - safety-rule-11
createdAt: '2026-02-27T20:03:58.649Z'
updatedAt: '2026-02-28T02:55:52.839Z'
timeSpent: 307
parent: 6emz0n
---
# Create WritingPracticeView.tsx — solo practice writing view

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingPracticeView.tsx  same layout as WritingTestPage (split panel: prompt left 40%, editor right 60%). Differences from live session: timer optional (from testData.soloConfig?.defaults?.timerMinutes), word minimum enforcement on submit (warning only in solo), auto-save to localStorage key writing_practice_{materialId}_{studentUid}, resume via SoloResumeModal (import from src/components/test/SoloResumeModal.tsx), submit button opens SubmitToTeacherModal. External paste prevention + active time tracking: same hooks as live session. Unlimited submissions  never check for existing ones. Fetch enrolled teachers: before rendering SubmitToTeacherModal, load the student's enrolled classes by explicitly importing getStudentClasses from src/services/classManager.ts and calling getStudentClasses(user.uid). Map the results to extract the teacherId and teacherName from each class document. Create an Array<{ id: string; name: string }> and pass as studentTeachers prop to SubmitToTeacherModal. No-teacher case: save without selectedTeacherId, show saved for self-review message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Same 40/60 layout as WritingTestPage
- [x] #2 Optional timer from soloConfig
- [x] #3 localStorage auto-save with materialId+uid key
- [x] #4 SoloResumeModal for session recovery
- [x] #5 Enrolled teachers from getStudentClasses
- [x] #6 Unlimited submissions  no dedup
- [x] #7 No-teacher fallback saves for self-review
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-practice/WritingPracticeView.tsx + CSS 2. Build 40/60 split layout 3. Setup optional timer from soloConfig 4. Wire localStorage auto-save 5. Integrate SoloResumeModal 6. Wire paste prevention + time tracking hooks 7. Fetch teachers via getStudentClasses 8. Wire submit to SubmitToTeacherModal 9. Handle no-teacher case
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
localStorage not RTDB. SoloResumeModal from src/components/test/SoloResumeModal.tsx. Teachers from getStudentClasses in classManager.ts. context.type=solo-practice. Safety Rule 11: withRestoreGuard.

Implemented 2026-02-28: Created WritingPracticeView.tsx + CSS in src/components/writing-practice/. 40/60 split layout reusing WritingPromptPanel + WritingEditor. localStorage auto-save (2s debounce, 72h expiry). Native resume modal (no Mantine). Teacher fetch via getStudentClassesgetClass chain. createSubmission with context.type=solo-practice (already wrapped with withRestoreGuard). RTDB result index for Academic Record. Zero TS errors.
<!-- SECTION:NOTES:END -->

