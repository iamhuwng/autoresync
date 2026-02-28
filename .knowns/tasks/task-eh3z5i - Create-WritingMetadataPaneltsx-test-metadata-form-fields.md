---
id: eh3z5i
title: Create WritingMetadataPanel.tsx — test metadata form fields
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-2
  - component
  - teacher
  - builder
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:02:57.489Z'
updatedAt: '2026-02-27T22:25:38.500Z'
timeSpent: 0
parent: hf16fy
---
# Create WritingMetadataPanel.tsx — test metadata form fields

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingMetadataPanel.tsx with native HTML form fields: title, description, duration (default 60), format (3 radio buttons), difficulty, target band (step 0.5), tags. NO Mantine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Native HTML form elements only
- [ ] #2 Format uses 3 radio buttons
- [ ] #3 Duration defaults to 60 minutes
- [ ] #4 Target band step 0.5
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-builder/WritingMetadataPanel.tsx 2. Define props with value/onChange 3. Render native HTML inputs 4. Create companion CSS
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
NO MANTINE. Duration default 60min. Target band step 0.5. Format values: task1-only, task2-only, full-test.
<!-- SECTION:NOTES:END -->

