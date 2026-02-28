---
id: 99fj32
title: Create WritingResultView.tsx — student result display (3 states)
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-6
  - component
  - student
  - results
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:03:49.674Z'
updatedAt: '2026-02-27T22:32:15.823Z'
timeSpent: 0
parent: zrnpte
---
# Create WritingResultView.tsx — student result display (3 states)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingResultView.tsx  student result display with 3 states. Pending: being reviewed message. Graded: load full submission from Firestore, show band score hero, task tabs, AnnotatedEssayReadOnly, CriteriaScoreChart, feedback HTML, model answer. Error: retry button.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 3-state rendering: pending, graded, error
- [ ] #2 Graded state loads full submission from Firestore
- [ ] #3 Band score hero with color coding
- [ ] #4 Annotated essay with read-only annotations
- [ ] #5 Model answer shown if enabled
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-results/WritingResultView.tsx + CSS 2. Check markingStatus 3. Pending: render waiting message 4. Graded: fetch submission 5. Render band hero + tabs + essays + charts + feedback 6. Model answer conditionally 7. Error with retry
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fetch on mount when graded. HTML feedback via dangerouslySetInnerHTML. Student sees only latest grading. Band hero: green >=6.5, yellow 5-6, red <5.
<!-- SECTION:NOTES:END -->

