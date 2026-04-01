# Firebase Custom Domain Auth Security Closeout — 2026-03-31

## Scope

This document records the March 31, 2026 closeout for two related but distinct issues:

1. `https://mstu.work` failed Firebase login flows after the custom domain was added to Hosting.
2. The frontend still shipped a legacy client-side admin login path that trusted browser-controlled state.

The first issue was an availability/configuration failure. The second issue was a real security flaw.

## Issue 1: Firebase Auth Failed on `mstu.work`

### User-visible symptom

The app loaded on `https://mstu.work`, but login failed with browser-console errors such as:

- `auth/requests-from-referer-https://mstu.work-are-blocked`
- `API_KEY_HTTP_REFERRER_BLOCKED`
- `Firebase Installations ... 403 PERMISSION_DENIED`
- `Analytics ... Dynamic config fetch failed: [403] Requests from referer https://mstu.work/ are blocked`

### Root cause

The Firebase web app's browser API key in Google Cloud allowed subdomains under `*.mstu.work`, but did not explicitly allow the apex origin `mstu.work`.

Important nuance:

- `*.mstu.work` does not cover `mstu.work`
- Firebase Hosting custom-domain attachment does not fix browser API key referrer rules
- Firebase Auth authorized domains are a separate control plane and were not the blocking issue here

### Required console fix

Update the browser key in Google Cloud Console:

`Google Cloud Console -> APIs & Services -> Credentials -> Browser key (auto created by Firebase) -> Application restrictions -> Websites`

Add the apex origin explicitly:

- `mstu.work/*`

Recommended accompanying entries:

- `*.mstu.work/*`
- hosted Firebase origins already in use
- localhost and loopback verification origins actually used by the team

### Security assessment of the fix

This change is safe and expected. It restores access for a legitimate origin and does not create a new privilege boundary by itself.

The broader security consideration is whether wildcard subdomain trust is necessary. If the team fully controls all subdomains, `*.mstu.work/*` may be acceptable. If not, explicit host allowlists are safer.

## Issue 2: Legacy Client-Side Admin Auth

### Root cause

The shipped frontend still contained a legacy admin modal that:

- read `VITE_ADMIN_USERNAME` and `VITE_ADMIN_PASSWORD` in the browser
- compared credentials client-side
- wrote `sessionStorage.isAdmin = 'true'`
- relied on that browser state in parts of the app

This is not a valid security boundary. Any `VITE_*` value is embedded in the browser bundle, and browser storage is fully user-controlled.

### Remediation applied

The following changes were completed:

- removed `src/components/AdminLoginModal.jsx` from the app and deleted the file
- removed the modal import, state, and render path from `src/App.jsx`
- removed `VITE_ADMIN_USERNAME` and `VITE_ADMIN_PASSWORD` from `src/config/env.config.ts`
- removed the live `sessionStorage.isAdmin` gate from `src/pages/TeacherWaitingRoomPage.jsx`
- removed legacy admin helpers from `src/services/sessionService.ts`
- made the legacy `draftCloudService` fail closed instead of honoring browser-admin state
- deleted dead legacy files `src/pages/LoginPage.old.jsx` and `src/pages/QuizPage.jsx`

### Final cleanup status

The stale `sessionStorage.removeItem('isAdmin')` cleanup calls that remained after the first remediation pass were removed from active `src/` code during the follow-up cleanup.

Historical documentation and archived conversation logs may still mention the old client-side admin flow. Those references are retained as historical records, not as current implementation guidance.

## Verification

Code verification completed after the remediation:

- grep over active `src/` confirmed no remaining `VITE_ADMIN_*` or browser `isAdmin` storage references
- `npm run check:utf8 -- src/App.jsx src/config/env.config.ts src/pages/TeacherWaitingRoomPage.jsx src/services/sessionService.ts src/services/draftCloudService.ts`
- `npm run build`

The build passed after the security cleanup.

## Current Security Posture

Resolved in this closeout:

- apex custom-domain Firebase auth failure on `mstu.work`
- shipped browser-side admin credential path
- reachable `sessionStorage.isAdmin` trust path in the teacher waiting-room route

Still recommended:

- enable Firebase App Check for the client services in use
- add browser security headers in Hosting, especially `Content-Security-Policy`, `Referrer-Policy`, and `X-Content-Type-Options`
- review whether `*.mstu.work/*` can be narrowed to explicit hosts
- move remaining browser-exposed AI provider secrets behind a trusted backend boundary

## Operator Notes

When a newly added Firebase Hosting domain loads successfully but Firebase Auth, Installations, or Analytics fail with `403` referrer-blocked errors, check the Google Cloud browser API key referrer allowlist before changing app code.

When evaluating auth or admin behavior in this repo, treat Firebase Auth state and server-enforced roles as the only valid authorization boundary. Do not reintroduce browser env-secret checks or `sessionStorage` privilege flags.
