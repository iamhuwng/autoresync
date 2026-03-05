---
id: dlfg5s
title: Update HomeworkCreateModal.tsx — writing homework config
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-7
  - component
  - teacher
  - homework
  - modify-file
  - no-mantine
createdAt: '2026-02-27T20:04:03.101Z'
updatedAt: '2026-02-28T03:03:13.454Z'
timeSpent: 170
parent: 6emz0n
---
# Update HomeworkCreateModal.tsx — writing homework config

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update HomeworkCreateModal.tsx  when skill is Writing, show: due date (native datetime-local input), late policy radios (allow-late/hard-deadline), word minimum toggle, re-attempt config. NO Mantine DatePicker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Writing-specific config section appears
- [x] #2 Native datetime-local for due date
- [x] #3 Late policy radio buttons
- [x] #4 Re-attempt config
- [x] #5 Existing non-Writing behavior preserved
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add skill detection 2. Add writing config section 3. Due date: input type=datetime-local 4. Late policy radios 5. Word min toggle 6. Re-attempt select 7. Wire to homework creation
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
NO Mantine DatePicker  use native input. Late: allow-late marks as late, hard-deadline blocks. Re-attempts pre-load previous essay.

Implemented 2026-02-28: Added Writing-specific homework config to HomeworkCreateModal. When skill=writing, shows: native datetime-local due date, late policy radio buttons (allow-late vs hard-deadline), word minimum enforcement toggle, re-attempt select (1/2/3/unlimited), and Writing-specific timer. Non-Writing materials use existing HomeworkConfigPanel unchanged. Added CSS for .writing-config-section with purple accent, .radio-group, .radio-option, and datetime input styles. Zero TS errors.
<!-- SECTION:NOTES:END -->

