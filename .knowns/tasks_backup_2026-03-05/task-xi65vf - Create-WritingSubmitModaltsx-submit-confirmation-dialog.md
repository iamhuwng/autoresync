---
id: xi65vf
title: Create WritingSubmitModal.tsx — submit confirmation dialog
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-3
  - component
  - student
  - modal
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:03:15.694Z'
updatedAt: '2026-02-27T23:15:01.678Z'
timeSpent: 40
parent: fbtwz4
---
# Create WritingSubmitModal.tsx — submit confirmation dialog

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingSubmitModal.tsx  native HTML/CSS confirmation dialog. Shows word counts per task. Cancel and Submit buttons. No word count warnings in live session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Native HTML/CSS modal
- [x] #2 Word count per task displayed
- [x] #3 Submit and Cancel buttons work
- [x] #4 No submit blocking on word count
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-student/WritingSubmitModal.tsx 2. Render modal with backdrop 3. Display confirmation and word counts 4. Cancel and Submit buttons 5. Style with CSS
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
In live session word count displayed but NOT enforced. Auto-submit on timer skips this modal. Keep simple  just confirmation.

All ACs verified. WritingSubmitModal.tsx fully implemented: native HTML/CSS modal (no Mantine), word count per task displayed with color coding, Cancel/Submit buttons wired to onClose/onConfirm, no submit blocking on word count. CSS in WritingTestPage.css.
<!-- SECTION:NOTES:END -->

