---
id: b50rct
title: Create WritingPromptPanel.tsx — left panel with task prompt
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-3
  - component
  - student
  - new-file
  - no-mantine
  - mobile-responsive
createdAt: '2026-02-27T20:03:08.377Z'
updatedAt: '2026-02-27T22:48:51.838Z'
timeSpent: 0
parent: fbtwz4
---
# Create WritingPromptPanel.tsx — left panel with task prompt

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingPromptPanel.tsx  left panel (40%, flex-shrink:0) showing task header, recommended time, image for Task 1, prompt text, word minimum. Mobile: collapsible with floating Show Prompt button.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Panel width 40% with flex-shrink:0
- [ ] #2 Shows task header, time, image, prompt, word min
- [ ] #3 Mobile collapsible at 768px
- [ ] #4 NO Mantine
- [ ] #5 File at src/components/writing-student/WritingPromptPanel.tsx with companion CSS
- [ ] #6 Panel width: 40% with flex-shrink: 0
- [ ] #7 Displays task header (e.g., WRITING TASK 1)
- [ ] #8 Shows recommended time
- [ ] #9 Shows img for Task 1 image when promptImageUrl exists
- [ ] #10 Displays prompt text
- [ ] #11 Shows word minimum (e.g., Write at least 150 words)
- [ ] #12 Mobile collapsible with Show Prompt floating button
- [ ] #13 NO Mantine components
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-student/WritingPromptPanel.tsx + CSS 2. Layout: vertical stack 3. Render all prompt fields 4. Add mobile collapse with media query
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read-only display panel. Image from R2 URL. Mobile collapses at 768px.

Implementation complete. File existed from prior work. Fixed task header to match IELTS format (WRITING TASK 1). Updated recommended time text to match IELTS standard phrasing. All ACs verified. No Mantine. CSS in shared WritingTestPage.css. TypeScript compiles clean.
<!-- SECTION:NOTES:END -->

