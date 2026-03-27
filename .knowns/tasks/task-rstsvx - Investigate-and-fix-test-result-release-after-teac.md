---
id: rstsvx
title: Investigate and fix test result release after teacher ends test/session
status: done
priority: high
labels:
  - bugfix
  - results
  - session
  - student
  - documentation
createdAt: '2026-03-24T22:46:02.784Z'
updatedAt: '2026-03-24T23:24:40.540Z'
timeSpent: 2289
---
# Investigate and fix test result release after teacher ends test/session

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Root-cause investigation and robust fix for cases where teacher ends the test/session but student results remain unreleased. Update architecture/readme/prd docs after implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause for immediate-release flows was the handoff contract, not result persistence: `StudentWaitingRoomPage` depended too heavily on transient router state (`showResults`) and did not reliably reconstruct recent-result access from persisted player/session breadcrumbs after teacher-end. Added waiting-room recovery from `players/{uid}.lastTestId`, `lastTestSessionCode`, `lastTestEndedAt`, plus session release-state derivation from the full session snapshot; auto-open remains a recent-event convenience, not the only path. Hardened `useTeacherEndRedirect` to treat persisted `lastTestId` as valid handoff evidence and pass `testId` forward. Fixed a listening-specific race by preventing `ListeningTestPage` from leaving the active test surface on transient `waiting` status while canonical `testData` is still loaded. Added regression coverage in `StudentWaitingRoomPage.test.jsx`; focused vitest slice passed for waiting room, listening integration, monitor end flow, and academic record. Updated README plus architecture/PRD docs to document the breadcrumb-driven post-test recovery contract and clarify that writing remains teacher-graded rather than immediate-release.
<!-- SECTION:NOTES:END -->

