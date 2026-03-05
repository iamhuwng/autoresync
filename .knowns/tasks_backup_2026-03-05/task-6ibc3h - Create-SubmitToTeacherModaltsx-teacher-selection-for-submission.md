---
id: 6ibc3h
title: Create SubmitToTeacherModal.tsx — teacher selection for submission
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-7
  - component
  - student
  - solo-practice
  - modal
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:04:00.088Z'
updatedAt: '2026-02-28T02:50:12.918Z'
timeSpent: 0
parent: 6emz0n
---
# Create SubmitToTeacherModal.tsx — teacher selection for submission

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create SubmitToTeacherModal.tsx  native HTML/CSS modal (NO Mantine). Props: isOpen, onClose, onSubmit, studentTeachers: Array<{ id: string; name: string }>, tasks: Array<{ taskNumber: number; wordCount: number }>. Contains: <select> dropdown of enrolled teachers (auto-selected if only 1 teacher, still shown disabled), optional note textarea for student message to teacher, word count summary per task, Submit and Cancel buttons. On submit: parent component saves to Firestore as context.type 'solo-practice' with selectedTeacherId, creates RTDB result index, sends notification to teacher via writingSubmissionService, clears localStorage practice data, shows success toast. No-teacher case: save without selectedTeacherId, show 'saved for self-review' message instead of teacher selection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Native HTML/CSS modal
- [x] #2 Teacher select dropdown
- [x] #3 Auto-selects single teacher
- [x] #4 Optional note textarea
- [x] #5 Word count summary per task
- [x] #6 Submit returns teacherId and note to parent
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-practice/SubmitToTeacherModal.tsx + CSS 2. Render native HTML modal 3. Teacher select dropdown 4. Auto-select single teacher 5. Optional note textarea 6. Word count summary 7. Wire buttons
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Native HTML/CSS  NO Mantine. Submit callback: { teacherId, note }. Parent handles Firestore/RTDB/notification. After submit: parent clears localStorage.

Implemented 2026-02-28: Created SubmitToTeacherModal.tsx + CSS in src/components/writing-practice/. Native HTML/CSS (NO Mantine). Teacher select, auto-select single teacher, optional note textarea, word count summary per task, no-teacher self-review fallback. Returns {teacherId, note} to parent. Zero TS errors.
<!-- SECTION:NOTES:END -->

