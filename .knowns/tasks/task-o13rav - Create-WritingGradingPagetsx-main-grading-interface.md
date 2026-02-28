---
id: o13rav
title: Create WritingGradingPage.tsx — main grading interface
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-5
  - page
  - teacher
  - grading
  - new-file
  - gap-15
  - gap-16
  - safety-rule-6
createdAt: '2026-02-27T20:03:42.208Z'
updatedAt: '2026-02-27T22:31:06.261Z'
timeSpent: 0
parent: jtjism
---
# Create WritingGradingPage.tsx — main grading interface

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingGradingPage.tsx  main grading interface. Side-by-side: essay 60% left with annotations, grading tools 40% right with tabs+scoring+feedback. GAP-15: beforeunload warning. GAP-16: localStorage draft auto-save. Re-grading detection with reason input.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Side-by-side layout 60/40
- [ ] #2 Loads submission by URL param
- [ ] #3 beforeunload warning (GAP-15)
- [ ] #4 localStorage draft auto-save (GAP-16)
- [ ] #5 Re-grading detection with reason input
- [ ] #6 CategoryManager accessible via gear icon
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/pages/WritingGradingPage.tsx + CSS 2. Get submissionId from URL 3. Load submission from Firestore 4. Initialize grading state 5. Check localStorage for draft 6. Build side-by-side layout 7. Wire AnnotatedEssayRenderer + Toolbar 8. Wire CriteriaScoringPanel + FeedbackPanel 9. Submit button 10. beforeunload 11. localStorage auto-save 12. CategoryManager modal 13. Re-grading detection
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-15: beforeunload when state changed. GAP-16: localStorage cleared after submit. Re-grading: grading field exists. Safety Rule 6: auto-save timer in useRef.
<!-- SECTION:NOTES:END -->

