---
title: Session Lifecycle Authority
createdAt: '2026-07-06T00:00:00.000Z'
updatedAt: '2026-07-07T15:12:12.695Z'
description: >-
  Current authority for Spark-compatible live-session expiration, owner-scoped
  active-session discovery, RTDB server-time enforcement, and obsolete cleanup
  designs.
tags:
  - architecture
  - session
  - lifecycle
  - firebase
  - rtdb
---

# Session Lifecycle Authority

Canonical source: `documentation/architecture/session-lifecycle-authority.md`.

## Current Contract

- Canonical session data: `game_sessions/{sessionCode}`.
- Active-list discovery: `owner_session_index/{ownerId}/{sessionCode}`.
- Migration cursor state: `owner_session_migrations/{ownerId}/{field}`.
- Effective status is derived:
  - terminal stored status wins;
  - active stored status plus `expiresAt <= effectiveNow` is `expired`;
  - otherwise stored status remains.
- RTDB rules use server `now` to reject student joins, player creation,
  answers, submissions, progress, and related session mutations after expiry.
- UI uses `/.info/serverTimeOffset` for display and filtering only.
- Missing or malformed `expiresAt` is legacy-readable and owner/admin
  repairable, but fails closed for student actions and is excluded from the
  active owner index.
- If the owner index is temporarily unavailable during rollout or repair,
  teacher clients may use bounded owner-field fallback queries on
  `game_sessions`; this is not a global scan and canonical lifecycle filtering
  still applies.
- Class management may create legacy class-backed shadows at
  `game_sessions/{classId}`. Those rows are not class lifecycle authority.
  Class delete state comes from `classes/{classId}.status`, and delete flows
  must not update class-backed `game_sessions/{classId}` rows.

## Free-Tier Boundary

Firebase Spark remains direct RTDB/Auth/Rules. Cloudflare consumes zero
lifecycle cron/CPU/subrequests for expiration correctness. `r2-backup-worker`
remains backup/trusted-storage scoped and must not be expanded into session
lifecycle reconciliation.

Spark quota reality still applies: 100 simultaneous RTDB connections, 1 GB
stored, and 10 GB downloaded/month. Owner indexing reduces downloads and avoids
global scans; it does not bypass those quotas.

## Obsolete Designs

Treat older notes that mention these designs as historical only:

- browser cleanup loops from teacher/admin pages;
- `cleanupExpiredSessions`, `getActiveSessions`, `getAllActiveSessions` as
  active-list authority;
- Firebase scheduled Functions for expiration mutation;
- Cloudflare lifecycle cron or full active-session scans;
- mixing lifecycle reconciliation into `r2-backup-worker`;
- deleting or mutating history automatically on expiration.
- using class-backed `game_sessions/{classId}` updates as proof or mechanism of
  class deletion.

## Deployment / Migration

Deploy the client that reads `owner_session_index` together with the RTDB rules
that deny unbounded owner scans of `game_sessions`. Legacy sessions are indexed
through owner-scoped, idempotent migration pages. Do not ordinary-client
global-scan historical sessions.

## Verification

Required proof lives in the canonical architecture doc and in
`.github/workflows/session-lifecycle.yml`. Core local commands:

```powershell
rtk npx vitest run src/services/sessionLifecycle.test.ts src/services/serverClock.test.ts src/services/sessionOwnerIndex.test.ts src/services/sessionOwnerIndexMigration.test.ts src/services/sessionQuery.test.ts src/services/sessionActionError.test.ts src/services/sessionManager.lifecycle.test.ts
rtk npx firebase-tools emulators:exec --only database "rtk npx vitest run src/__tests__/security/prd0055-live-session-rules.emulator.test.ts"
```
