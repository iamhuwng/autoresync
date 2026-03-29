---
id: b5z1at
title: Fix IELTS Writing post-submit student flow
status: done
priority: high
labels:
  - ielts
  - writing
  - routing
  - docs
createdAt: '2026-03-29T07:46:42.620Z'
updatedAt: '2026-03-29T08:00:20.741Z'
timeSpent: 810
---
# Fix IELTS Writing post-submit student flow

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restore pure IELTS Writing post-submit behavior so live-session submit/auto-submit shows submission-complete messaging instead of opening the generic waiting-room results modal. Update architecture docs with the current-state contract and create a scheme record for Writing behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pure IELTS Writing submit and auto-submit routes to the submission-complete bridge instead of opening the waiting-room results modal.
- [x] #2 SubmissionCompletePage communicates manual teacher grading and no immediate result/AI feedback for IELTS Writing.
- [x] #3 Architecture docs capture the current-state IELTS Writing interaction contract, including a new scheme document for future cross-checking.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scoped implementation to WritingTestPage post-submit routing, SubmissionCompletePage messaging, and architecture/current-state documentation.
Implemented pure IELTS Writing post-submit routing through /submission-complete in WritingTestPage for manual submit, timer-expiry auto-submit, and teacher-ended auto-submit. Updated SubmissionCompletePage to communicate teacher hand-grading, no instant score/AI feedback, removed the immediate View Results action, and fixed Return to Dashboard to use /student/dashboard with results tracking. Added focused tests for WritingTestPage and SubmissionCompletePage. Appended current-state amendments to architecture/test-system-architecture and architecture/results-academic-record, and created architecture/scheme/ielts-writing-current-state-scheme. Verification: cmd /c npx vitest run src/components/writing-student/WritingTestPage.test.tsx src/pages/SubmissionCompletePage.test.tsx --reporter=basic; cmd /c npm run check:utf8 -- src/components/writing-student/WritingTestPage.tsx src/pages/SubmissionCompletePage.tsx src/constants/routes.ts src/config/featureRegistry.ts src/components/writing-student/WritingTestPage.test.tsx src/pages/SubmissionCompletePage.test.tsx; mcp__knowns__validate entity b5z1at; mcp__knowns__validate entity architecture/scheme/ielts-writing-current-state-scheme.
<!-- SECTION:NOTES:END -->

