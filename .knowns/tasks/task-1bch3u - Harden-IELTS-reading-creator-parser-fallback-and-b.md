---
id: 1bch3u
title: Harden IELTS reading creator parser fallback and blank-review handling
status: done
priority: high
labels:
  - bugfix
  - ielts-reading
  - test-creation
  - parsing
createdAt: '2026-04-09T08:33:20.217Z'
updatedAt: '2026-04-09T08:40:17.193Z'
timeSpent: 411
---
# Harden IELTS reading creator parser fallback and blank-review handling

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix the reading test creation regression where AI extraction failures could still advance to review with empty passages/questions. Update architecture docs, add regression coverage, verify build, and deploy the fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI extraction failures in teacher reading test creation must trigger offline/rules fallback instead of saving blank review content.
- [x] #2 Parsing must fail closed when no questions are produced, and draft save failures must block transition to review.
- [x] #3 Canonical docs and repo documentation must reflect the new parsing/review contract, and the change must be verified with targeted tests, build, and deploy.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented fail-closed handling for teacher IELTS Reading creation. `src/services/test-creation/index.ts` now treats non-success AI extraction as failure, routes into offline fallback, maps offline questions/passages into validator-ready review payloads, and throws when merged question count is zero. `src/components/test-creation/TestCreationModal.tsx` now checks `saveParsedContent()` and blocks review navigation when draft persistence fails. Added regression coverage in `src/services/test-creation/index.test.ts` and `src/components/test-creation/TestCreationModal.test.tsx`. Updated repo docs under `documentation/tasks`, `documentation/ai-system-research-report.md`, and added `documentation/architecture/teacher-test-creation-parsing-and-review.md`. Verified with targeted Vitest, `npm run build`, and `npm run deploy:hosting`.
<!-- SECTION:NOTES:END -->

