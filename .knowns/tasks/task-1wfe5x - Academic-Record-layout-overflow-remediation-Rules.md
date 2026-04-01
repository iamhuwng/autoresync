---
id: 1wfe5x
title: Academic Record layout overflow remediation (Rules 17–19)
status: done
priority: high
labels:
  - bugfix
  - student-ui
  - academic-record
  - layout
createdAt: '2026-04-01T02:28:52.855Z'
updatedAt: '2026-04-01T02:29:32.759Z'
timeSpent: 0
---
# Academic Record layout overflow remediation (Rules 17–19)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fixed three layout overflow/clipping bugs on the Academic Record page where rigid CSS grids caused content to overflow into the right rail or misalign in narrow containers. Migrated ResultTimeline from grid-based AcademicRecordResultRow to flex-based AcademicRecordFlatRow. Added Rules 17–19 to the Student View Design Standard to prevent recurrence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ResultsBySkill summaryStack uses repeat(auto-fit, minmax(160px, 1fr)) instead of repeat(4, 1fr)
- [x] #2 ResultsByCourse summaryGrid uses repeat(auto-fit, minmax(160px, 1fr)) instead of repeat(4, 1fr)
- [x] #3 ResultTimeline renders AcademicRecordFlatRow instead of grid-based AcademicRecordResultRow
- [x] #4 Helper functions (buildMetaItems, getLeadingText/Tone, getScoreLabel/Tone) exported from AcademicRecordResultRow.tsx
- [x] #5 Rules 17-19 added to student-view-design SKILL.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Remediation completed 2026-04-01. All three overflow bugs fixed. Build passes. Deployed to production.
<!-- SECTION:NOTES:END -->

