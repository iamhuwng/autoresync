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
updatedAt: '2026-04-09T17:41:18.759Z'
timeSpent: 7311
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
2026-04-10 follow-up: removed `VITE_GOOGLE_API_KEY` from Gemini env loading and admin Gemini diagnostics so the expired legacy browser key cannot contaminate Gemini round-robin selection on teacher IELTS Reading creation. Preserved the key only for `src/services/googleDrive.js`, where it still initializes the Drive browser client. Added focused env regression coverage in `src/config/env.config.test.ts`, and validated the numbered Gemini keys independently on `mstu.work` and `kahoot.mstu.work` via direct Gemini API probes.
2026-04-10 follow-up: removed legacy `VITE_GOOGLE_API_KEY` from Gemini env loading and admin Gemini env diagnostics while preserving it for `src/services/googleDrive.js`. Added runtime coverage in `src/config/env.config.test.ts` and refreshed Gemini-provider coverage so long-lived sessions pick up Firestore Gemini keys after first init. Updated architecture docs to record that numbered Gemini keys now succeed on both `mstu.work` and `kahoot.mstu.work`, and that the remaining legacy key issue is expiration rather than referrer blocking.

2026-04-10 follow-up: removed the legacy `VITE_GOOGLE_API_KEY` from Gemini runtime participation while preserving it for `src/services/googleDrive.js`. `src/config/env.config.ts` now validates and loads Gemini browser keys only from `VITE_GEMINI_API_KEY_1..5` plus Firestore Gemini keys, and `src/pages/AdminSettingsPage.tsx` no longer counts the legacy Google key as Gemini env capacity. Added `src/config/env.config.test.ts` to lock the contract. Updated repo architecture notes and Knowns architecture docs to record that the legacy key remains expired and must not contaminate teacher Reading parsing rotation.
<!-- SECTION:NOTES:END -->

