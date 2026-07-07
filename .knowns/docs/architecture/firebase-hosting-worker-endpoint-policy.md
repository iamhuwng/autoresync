---
title: Firebase Hosting Worker Endpoint Policy
createdAt: '2026-07-07T16:20:00.000Z'
updatedAt: '2026-07-07T16:20:00.000Z'
description: Firebase Hosting serves the app; Cloudflare Worker owns upload and Listening media endpoints.
tags:
  - architecture
  - firebase
  - hosting
  - cloudflare
  - r2
  - listening
---
# Firebase Hosting And Worker Endpoint Policy

## Decision

Firebase Hosting serves the React app only. Cloudflare Workers own trusted upload and Listening media backend calls.

```text
Frontend host: https://kahut1.web.app
Firebase project: temp-a1437
Firebase Hosting target: kahut1
Upload/listening Worker: https://r2-upload-signer.iamhuwng.workers.dev
```

The browser app must use the deployed Worker URL for local dev and hosted builds. Do not use `http://localhost:8787` as an app/runtime fallback.

## Why

`localhost` always means the current user's own computer. If a Firebase Hosting bundle points upload traffic to `http://localhost:8787`, every teacher or student tries to reach a Worker on their own laptop. They do not have that Worker, so upload, authoring, and delivery calls fail.

The 2026-07-07 teacher-lobby incident proved this exact path. The Audio upload step showed `Failed to upload audio file. Please try again.` because local config and app fallback targeted `http://localhost:8787`, no process listened there, and local Wrangler/workerd could not run on the current Windows ARM64 machine (`Unsupported platform: win32 arm64 LE`). The deployed Worker accepted CORS from `http://localhost:5173`, so the repair is deployed Worker by default.

## Current Browser Env Contract

Set these to `https://r2-upload-signer.iamhuwng.workers.dev` for local Vite and Firebase Hosting builds:

```env
VITE_R2_UPLOAD_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
VITE_LISTENING_AUTHORING_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
VITE_LISTENING_UPLOAD_SESSION_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
VITE_LISTENING_LIVE_DELIVERY_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
VITE_LISTENING_SOLO_DELIVERY_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
VITE_LISTENING_RESULT_REVIEW_DELIVERY_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
```

## Allowed Local Worker Use

`http://localhost:8787` is allowed only for Worker-local contract tests, e2e fixtures, or manual Worker development where the local Worker is intentionally started and the scope is clearly local.

It is not allowed as default browser app configuration, Firebase Hosting build configuration, fallback behavior when a browser env var is absent, or documentation advice for real teacher/student usage.

## Deploy Note

Changing local `.env` or app code does not update Firebase Hosting by itself. A hosting release still requires a verified build and `npm run deploy:hosting` or an equivalent `firebase deploy --only hosting:kahut1 --project temp-a1437`.
