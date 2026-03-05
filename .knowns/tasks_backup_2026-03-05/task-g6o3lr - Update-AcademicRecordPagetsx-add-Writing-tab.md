---
id: g6o3lr
title: Update AcademicRecordPage.tsx — add Writing tab
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-8
  - page
  - student
  - academic-record
  - modify-file
  - safety-rule-8
  - gap-13
createdAt: '2026-02-27T20:04:12.428Z'
updatedAt: '2026-02-28T03:13:15.335Z'
timeSpent: 95
parent: ekte9h
---
# Update AcademicRecordPage.tsx — add Writing tab

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update AcademicRecordPage.tsx  add Writing tab alongside existing tabs. Renders WritingProgressSection when active. Lazy import with Suspense CSS spinner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Writing tab added
- [x] #2 WritingProgressSection rendered when active
- [x] #3 Existing tabs preserved
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add Writing tab definition 2. Lazy import WritingProgressSection 3. Add conditional rendering 4. Wrap in Suspense with CSS spinner
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow existing tab pattern. GAP-13: no Mantine in Suspense. Safety Rule 8: must be rendered.

Implemented 2026-02-28: Added Writing tab to AcademicRecordPage TABS array. Lazy-imported WritingProgressSection with Suspense CSS spinner fallback. Switch case renders component when tab active. All existing tabs preserved.
<!-- SECTION:NOTES:END -->

