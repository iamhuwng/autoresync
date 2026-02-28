---
id: vy4fb5
title: Create PendingReviewsWidget.tsx — dashboard pending reviews
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-8
  - component
  - student
  - dashboard
  - widget
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:04:13.997Z'
updatedAt: '2026-02-28T03:14:31.515Z'
timeSpent: 56
parent: ekte9h
---
# Create PendingReviewsWidget.tsx — dashboard pending reviews

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create PendingReviewsWidget.tsx  student dashboard widget showing pending writing submissions. Max 5 items. Each: test title, submitted date, source label. See all link if >5. Widget hidden when empty (returns null).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shows max 5 pending items
- [x] #2 Hidden when no pending submissions
- [x] #3 See all link shown if > 5
- [x] #4 Source labels: Live/Solo/Homework
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/dashboard/PendingReviewsWidget.tsx + CSS 2. Fetch submissions filtered to pending-review 3. Render up to 5 items 4. See all link if needed 5. Return null if empty
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Conditional widget  returns null when empty. Uses useAuth internally. See all links to academic record Writing tab.

Implemented 2026-02-28: Created PendingReviewsWidget. Fetches up to 6 items from Firestore (5 display + 1 overflow check). Returns null when empty. Source labels: Homework/Solo/Live. See all navigates to academic record Writing tab. No Mantine.
<!-- SECTION:NOTES:END -->

