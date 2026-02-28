---
id: q3fvh1
title: Create CriteriaScoringPanel.tsx — 0-9 criteria scoring buttons
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-5
  - component
  - teacher
  - grading
  - scoring
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:03:32.098Z'
updatedAt: '2026-02-27T22:30:06.035Z'
timeSpent: 0
parent: jtjism
---
# Create CriteriaScoringPanel.tsx — 0-9 criteria scoring buttons

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create CriteriaScoringPanel.tsx  per-task scoring with 10 buttons (0-9) per criterion. Task 1: TA,CC,LR,GRA. Task 2: TR,CC,LR,GRA. Live band calculation display. Voided state disables all buttons with VOIDED overlay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Correct criteria per task (TA vs TR)
- [ ] #2 10 buttons per criterion with highlighting
- [ ] #3 Live band calculation shown
- [ ] #4 Voided state with overlay
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-grading/CriteriaScoringPanel.tsx + CSS 2. Define criteria per task number 3. Render 10 buttons per criterion 4. Wire active highlighting 5. Calculate and display band 6. Handle void state 7. Include VoidTaskButton
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TA for Task 1, TR for Task 2  different names. Scores WHOLE NUMBERS 0-9. Band updates live. VoidTaskButton at bottom.
<!-- SECTION:NOTES:END -->

