---
title: 'Guide: Dev Quick Login and Hosted Firebase Referrer Troubleshooting'
description: Reusable guide for using built-in teacher/student dev login buttons and diagnosing hosted quick-login failures caused by Firebase browser API key referrer restrictions.
createdAt: '2026-03-27T21:44:28.019Z'
updatedAt: '2026-03-27T22:23:44.330Z'
tags:
  - guide
  - auth
  - firebase
  - testing
  - dev-login
---

# Guide: Dev Quick Login and Hosted Firebase Referrer Troubleshooting

## Problem

This repo includes built-in quick-login buttons for the teacher and student dev accounts. When those buttons fail on a hosted app, the immediate symptom can look like broken auth, a bad test account, or a general Firebase outage even though the underlying issue is usually browser API key referrer restrictions.

This matters because quick-login is the fastest way to verify teacher and student flows, including teacher-only result history paths.

## Default Verification Path

Use the built-in quick-login buttons on the login page before asking for credentials.

- `Teacher` button: logs into the teacher dev account (`teacher@test.com`)
- `Student` button: logs into the student dev account (`student@test.com`)

Use these buttons as the default path for browser verification unless the task explicitly requires manual credential entry or a different account.

## Failure Pattern

If hosted quick-login fails but the app otherwise loads, check for these browser-console/network symptoms:

- Firebase Auth error similar to `auth/requests-from-referer-<host>-are-blocked`
- Analytics config fetch returning `403`
- Firebase Installations create call returning `403`
- Login page renders, but clicking the quick-login buttons does not complete sign-in

When these show up together, treat the browser API key referrer allowlist as the primary suspect.

## Root Cause

Firebase browser API keys can be restricted by allowed HTTP referrers. If the hosted origin is missing from that allowlist, Firebase client flows can fail even when:

- the account exists
- Firebase Auth is configured correctly
- the domain is already present in Firebase Auth authorized domains
- the application code is otherwise healthy

## Diagnostic Sequence

1. Reproduce the failure on the actual hosted origin and inspect the browser console.
2. Compare hosted behavior against localhost behavior.
3. Confirm the app is using the expected Firebase API key from environment configuration.
4. Inspect that key's allowed referrers in Google Cloud.
5. If the hosted origin is missing, add it and retest the same quick-login flow.

## Repair Pattern

Add every real verification origin to the browser API key allowlist.

Typical examples:

- hosted production or preview origin, for example `https://kahut1.web.app/*`
- localhost preview origin, for example `http://localhost:4173/*`
- explicit loopback preview origin, for example `http://127.0.0.1:4173/*`
- existing dev-server ports already used by the repo

Do not assume that Firebase Auth authorized domains are enough. API key referrer restrictions are a separate control plane.

## Result-History Verification

Once quick-login is restored, verify the actual teacher flow end to end:

1. Open the app.
2. Click the `Teacher` quick-login button.
3. Navigate to `Students`.
4. Click `Analytics` on the target student card.
5. Confirm the history page loads instead of failing.
6. Confirm the visible result count matches the intended teacher-visible set.
7. Check the browser console at the target page, not just the initial login page.

## Related Result-Visibility Checks

If the history page still undercounts or logs permission errors after login succeeds, check these separately:

- `test_results_by_teacher/{teacherId}` for stale or foreign result IDs
- dedicated solo-practice visibility/index paths for missing data or missing rules deployment
- bulk result loaders for noisy per-row permission-denied logging instead of summary-only reporting

These are data/visibility issues, not login issues.

## Source

Extracted from the March 2026 teacher-history repair session involving:

- `src/pages/LoginPage.jsx`
- `src/services/testResults.service.ts`
- `src/pages/TeacherStudentHistoryPage.tsx`
- `database.rules.json`
- `AGENTS.md`


## Incident Closeout Reference

For the concrete March 2026 event trail, live repairs, and current deployed state, see @doc/sop/teacher-history-dev-login-firebase-referrer-runtime-state.
