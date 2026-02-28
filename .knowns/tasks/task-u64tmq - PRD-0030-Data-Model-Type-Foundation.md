---
id: u64tmq
title: 'PRD-0030: Data Model & Type Foundation'
status: done
priority: high
labels:
  - prd-0030
  - ielts-writing
  - phase-1
  - epic
  - data-model
createdAt: '2026-02-27T20:02:41.043Z'
updatedAt: '2026-02-27T22:23:40.479Z'
timeSpent: 0
---
# PRD-0030: Data Model & Type Foundation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 1 epic. Establishes all TypeScript types, band score calculator with tests, route/security configs, Firestore rules, and service layers for writing test CRUD, submission management, and annotation categories. Foundation for ALL subsequent phases.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 10 subtasks completed
- [ ] #2 Types match PRD 4.1.1 and 4.1.2 exactly
- [ ] #3 Band calculator implements IELTS rounding rules
- [ ] #4 Unit tests pass for all edge cases
- [ ] #5 4 routes in routes.ts and routeSecurity.ts
- [ ] #6 Services follow draftCloudService pattern
- [ ] #7 Firestore rules cover writing_submissions, writing_drafts, users/settings
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create types (1.1) 2. Band calculator + tests (1.2, 1.3) 3. Extend results types (1.4) 4. Routes + security (1.5, 1.6) 5. Services (1.7, 1.8, 1.10) 6. Firestore rules (1.9)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Safety Rule 11: withRestoreGuard on all writes. Safety Rule 12: verify backup coverage. Safety Rule 14: never regenerate shared IDs. GAP-03: draft ID via Firestore auto-ID. GAP-08: test ID via Firebase push ID. GAP-24: annotation categories at users/teacherId/settings.
<!-- SECTION:NOTES:END -->

