---
title: Teacher History Dev Login Firebase Referrer Runtime State
description: Dated incident record for the teacher history, dev quick-login, Firebase referrer, and hosted verification repairs completed in March 2026.
createdAt: '2026-03-27T22:23:12.344Z'
updatedAt: '2026-03-27T22:23:40.441Z'
tags:
  - sop
  - runtime-state
  - incident
  - firebase
  - results
---

# Teacher History Dev Login Firebase Referrer Runtime State

## Scope

This document records the concrete event trail, live repairs, and current runtime state for the March 2026 teacher-history investigation and hosted verification work.

This is intentionally not a reusable pattern doc. It is the operational closeout for this specific repair cycle.

## Initial Report

Primary user-visible failures:

- Teacher could open `Students` and click `Analytics`, but the student history page failed to load.
- For the known teacher/student pair, the teacher history page showed only `1` test even though the student had completed many tests.
- Hosted dev quick-login later failed even though the app rendered, which initially looked like an auth/account problem.

Reference dev accounts used during verification:

- teacher: `teacher@test.com`
- student: `student@test.com`

## Live Data Findings

For teacher `glMHCrzMnyS6AqFcb9I0nlOqQ6X2` and student `x3hDfjYVN7cJtSbwq0ChIjl1Bk62`:

- student index contained `29` result rows
- resolved teacher-owned results for this teacher: `3`
- solo-practice results: `6`
- results owned by another teacher: `5`
- unresolved results: `15`

Observed defect at investigation time:

- teacher-visible history was undercounting because valid teacher-owned rows were missing from `test_results_by_teacher/{teacherId}`
- two known missing teacher-owned rows were `-OmclHzRoBBi5vZb5dz9` and `-OoaEcztH5QEDfBJqyYK`

## Root Causes

### 1. Incomplete teacher index

The teacher-history reader depended on `test_results_by_teacher/{teacherId}`. Missing fan-out rows made valid teacher-owned results invisible.

### 2. Solo-practice visibility path not fully live

The teacher-history merge path added dedicated solo-practice loading, but that path depended on RTDB rules and dedicated index availability.

### 3. Noisy bulk permission handling

Bulk teacher-result loading emitted repeated per-result `Permission denied` console errors for inaccessible stale IDs instead of a summary-only signal.

### 4. Hosted quick-login blocked by API key referrer restrictions

Hosted login failure was not caused by broken dev accounts. The Firebase browser API key allowed-referrer list was missing active verification origins, including the hosted app origin.

## Code Repairs Applied

Key code repairs completed:

- teacher history now reads through the teacher-student merged path instead of failing the page when one branch is denied
- solo-practice teacher read degrades to `[]` when its dedicated index path is unavailable instead of killing the whole history page
- bulk teacher-result loading suppresses duplicate per-result permission-denied console errors and keeps the final skipped-summary log
- native mobile drawer replacements removed the new-file Mantine rule violations previously shown in console output
- restore-flag listeners suppress `permission_denied` warnings so they do not leak non-actionable console noise
- `AGENTS.md` now records the built-in teacher/student quick-login rule so future Codex runs use it by default

Primary touched files:

- `src/services/testResults.service.ts`
- `src/pages/TeacherStudentHistoryPage.tsx`
- `src/components/navigation/MobileMenu.tsx`
- `src/components/navigation/AdminLayout.tsx`
- `src/components/RestoreBanner.tsx`
- `src/services/restoreGuard.ts`
- `database.rules.json`
- `AGENTS.md`

## Live Data / Config Repairs Applied

Direct runtime repairs completed against project `temp-a1437`:

- created or confirmed `student_teacher_links/glMHCrzMnyS6AqFcb9I0nlOqQ6X2/x3hDfjYVN7cJtSbwq0ChIjl1Bk62 = true`
- restored missing teacher-owned teacher-index rows
- backfilled the dedicated solo-practice student index for the target student with `6` rows
- removed `10` stale/inaccessible rows from `test_results_by_teacher/glMHCrzMnyS6AqFcb9I0nlOqQ6X2`
- deployed RTDB rules so the dedicated visibility/index paths were live
- updated the Firebase browser API key allow-referrer list to include active verification origins, including the hosted origin
- rebuilt and redeployed hosting to `https://kahut1.web.app`

## Hosted Verification Result

End-to-end hosted verification was completed using the built-in quick-login flow:

1. Open hosted app.
2. Use `Teacher` quick-login button.
3. Open `Students`.
4. Click `Analytics` on the target student.
5. Confirm history page loads.
6. Inspect browser console at the target page.

Verified hosted result:

- route loaded: `/teacher/student/x3hDfjYVN7cJtSbwq0ChIjl1Bk62/history`
- visible count on page: `History (9)`
- browser console at target page: `0 errors, 0 warnings`

## Current State

Current expected runtime state after the repair cycle:

- hosted teacher quick-login works
- hosted student quick-login is available for browser verification
- teacher `Students -> Analytics -> Student History` loads successfully for the target pair
- teacher history for the target pair shows the intended `9` visible rows (`3` teacher-owned + `6` solo practice)
- stale teacher-index noise previously causing repeated permission-denied console spam has been cleaned up
- the previously observed restore-flag warning path no longer surfaces browser warnings in the verified teacher flow

## Follow-Up Watchpoints

If the same symptom returns, check these in order:

1. hosted Firebase browser API key allowed-referrer list
2. `test_results_by_teacher/{teacherId}` for stale or missing rows
3. dedicated solo-practice index/rules deployment state
4. teacher-student link presence
5. browser-console summary logs from `testResults.service.ts`

## Related Docs

- @doc/guides/guide-dev-quick-login-and-hosted-firebase-referrer-troubleshooting
