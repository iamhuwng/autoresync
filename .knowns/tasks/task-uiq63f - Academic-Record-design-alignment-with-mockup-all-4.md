---
id: uiq63f
title: Academic Record design alignment with mockup (all 4 tabs unified)
status: done
priority: high
labels:
  - design
  - academic-record
  - student-view
createdAt: '2026-03-31T23:51:47.405Z'
updatedAt: '2026-03-31T23:51:47.405Z'
timeSpent: 0
---
# Academic Record design alignment with mockup (all 4 tabs unified)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Aligned all four Academic Record tabs (Overview, THCS, IELTS, Course) to share a unified design language matching the stitch mockup at `.stitch/designs/student-overhaul-20260331/academic-record.html`.

Changes:
- Overview: header uses items-end alignment, time range pill group positioned right (no flex-wrap), stat cards white/flat with 2.25rem values and inline hints, tab bar lighter borders
- THCS: stat cards match Overview (white, no border/radius, large values), section headers uppercase with wide tracking, skill rows flat white
- IELTS: 4-column summary grid with same card treatment, value+hint baseline layout, lighter group dividers
- Course: 4-column summary grid, group headers changed from bordered cards to flat bottom-border style
- Right rail Academic Advisor: shows deterministic random teacher name per user UID from ADVISOR_NAMES list
- Subtitle updated to match mockup: "Holistic performance tracking and feedback synthesis."

Files modified:
- src/pages/AcademicRecordPage.tsx
- src/components/academicRecord/THCSProgressTab.tsx
- src/components/academicRecord/ResultsBySkill.tsx
- src/components/academicRecord/ResultsByCourse.tsx
- src/components/layout/StudentRightRail.tsx
- documentation/architecture/academic-record/page-architecture.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

