# Session Lifecycle Authority

## Decision

Session expiration is derived from canonical session data. No browser cleanup,
Firebase scheduled Function, or Cloudflare lifecycle cron is required for
correctness.

Effective status:

```ts
if (stored status is terminal) return stored status;
if (stored status is active and expiresAt <= effectiveNow) return 'expired';
return stored status;
```

Canonical source of truth stays in `game_sessions/{sessionCode}`. The
expiration boundary is `expiresAt` plus Firebase RTDB server time (`now`) in
security rules. Client clocks are display hints only.

This fits Firebase Spark and Cloudflare Workers Free:

- Firebase direct RTDB/Auth/Rules only.
- No Firebase scheduled Functions.
- No Cloudflare lifecycle cron, CPU, or subrequests.
- No global active-session scan.
- No automatic destructive cleanup.
- The existing Cloudflare backup Worker remains backup-only.

## Current Data Paths

Canonical session records live at:

```text
game_sessions/{sessionCode}
```

Active-list discovery lives at:

```text
owner_session_index/{ownerId}/{sessionCode}
owner_session_migrations/{ownerId}/{field}
```

`owner_session_index` is query/discovery data only. It is never an
authorization boundary and it is never the canonical state. Student access and
session mutations must be rechecked against `game_sessions/{sessionCode}` and
RTDB security rules.

## Enforcement Boundary

RTDB rules are the security boundary. Student writes under session participation
paths are allowed only when all are true:

- the session exists;
- stored status is `waiting` or `in-progress`;
- `expiresAt` is a number;
- `expiresAt > now`;
- identity/class-membership checks still pass.

This is fail-closed: missing, malformed, non-number, or exact-boundary
`expiresAt` rejects student mutation. `expiresAt <= now` means expired.
Legacy sessions without `expiresAt` remain readable for owner/admin repair and
bounded migration, but they do not authorize student joins, answers, progress,
or submissions until an owner/admin repair or extension writes a bounded numeric
expiry.

Teacher owners and super-admins retain explicit authority after effective
expiry so they can extend, end, archive, or delete. Terminal stored statuses
(`completed`, `ended`, existing `expired`) win over time-derived active state.

## Owner-Scoped Active Index

Active teacher lists read from:

```text
owner_session_index/{ownerId}/{sessionCode}
```

Index rows contain discovery fields only:

- `sessionCode`
- `ownerId`
- `expiresAt`
- `status`
- `sourceUpdatedAt`
- optional `mode`
- optional `createdAt`

Rules require owner-only or super-admin access and index `expiresAt`.
Teacher clients query by `expiresAt` with `startAt(effectiveNow)` and bounded
`limitToFirst` pagination. Canonical session data is always re-read and
revalidated before display/use. Stale, tampered, foreign-owner, missing,
terminal, malformed, or differently-expiring canonical sessions are ignored and
can be repaired by the owner migration/update path; index data never authorizes
student action.

Owner precedence for legacy records is:

```text
createdByUserId > createdBy > teacherId
```

## Write Lifecycle

Creation, extension, terminal status updates, archive/delete actions, and
explicit owner repair update canonical session data plus the owner index in the
same multi-location RTDB update where possible.

Active future sessions get/keep an index row. Terminal, malformed, missing
expiry, non-number expiry, or effectively expired sessions have no active index
row. Expiry by time alone does not write and does not delete history.

Teacher extension can reactivate a stored `expired` session to `waiting` only
through owner/super-admin authorized code with bounded expiry validation.
Current client code caps extension size and future expiry window.

## Legacy Migration

Existing sessions use an owner-scoped, resumable fallback migration:

- no ordinary teacher client performs a global scan;
- each owner scans only legacy owner fields with bounded query limits;
- pages are small and resumable with `owner_session_migrations/{ownerId}/{field}`;
- repeated tabs/runs are idempotent;
- newer index rows are not overwritten by older canonical data;
- stale index rows are removed only when the canonical source version is not
  older than the index row.

Migration is a compatibility bridge. Steady-state correctness comes from the
canonical write/update pipeline and RTDB rules.

## Retired / Obsolete Lifecycle Designs

The following designs are obsolete for session expiration correctness:

- browser-driven cleanup loops from teacher/admin pages;
- `cleanupExpiredSessions`, `getActiveSessions`, and `getAllActiveSessions`
  as active-list authority;
- Firebase scheduled Functions for lifecycle mutation;
- Cloudflare lifecycle cron or full active-session scans;
- overloading `r2-backup-worker` with session lifecycle reconciliation;
- storing expiration correctness in a scheduled mutation instead of deriving it
  from canonical session data plus server-time rules.

Older notes or conversation logs may mention those approaches. Treat them as
historical only. This document is the current authority for live-session
expiration, active-list discovery, and Spark/Workers-Free lifecycle boundaries.

## Client Behavior

`src/services/sessionLifecycle.ts` owns pure lifecycle derivation:

- `isSessionTimeExpired(...)`
- `getEffectiveSessionStatus(...)`
- `isSessionActiveAt(...)`

`src/services/serverClock.ts` normalizes `/.info/serverTimeOffset` for display
and query windows. If offset is unavailable or wrong, UI may lag; server rules
still reject expired writes.

`src/services/sessionQuery.ts` owns teacher active-session subscriptions:

- regular teachers read owner index with bounded pagination;
- if the owner index is temporarily unavailable during rollout or repair, the
  client may use bounded owner-field fallback queries on `game_sessions`; this
  is not a global scan and must still filter through canonical lifecycle rules;
- canonical sessions are revalidated before emission;
- local timers refresh/remove sessions when they cross expiry;
- duplicate listeners are cleaned up on unsubscribe;
- super-admin global reads remain explicit with `canReadAll: true`.

`src/services/sessionActionError.ts` maps expired-rule
`PERMISSION_DENIED` failures to the shared user-facing announcement:

```text
Session expired. Ask your teacher to extend it.
```

## Free-Tier Boundary

This design minimizes download and CPU work. It cannot bypass Firebase Spark
database quotas:

- 100 simultaneous RTDB connections total across the database;
- 1 GB stored;
- 10 GB downloaded/month.

One browser tab/device is approximately one RTDB connection. Planning examples:

- 1 teacher + 30 students ≈ 31 connections.
- 2 such classes ≈ 62 connections.
- 3 such classes ≈ 93 connections, with almost no headroom.

Practical operating target on Spark is about 70-80 concurrent tabs/users,
because admins, other pages, duplicate tabs, reconnects, and multiple devices
also count.

## Deployment Sequencing

The final rules deny unbounded teacher owner scans of `game_sessions`. Deploy
rules together with a client build that uses `owner_session_index`. A
rules-only deploy can break an older deployed client that still uses unbounded
owner queries.

Recommended release order:

1. Run local unit, lint, type, build, and RTDB emulator gates.
2. Dry-run Firebase rules.
3. Deploy app client and database rules as one coordinated release.
4. Verify teacher active-session list, student join, expired write rejection,
   and teacher extension on the deployed environment.

## Verification Matrix

Common proof:

- create future-expiring session; index row is written; teacher sees it;
  student joins;
- countdown crosses expiry; active UI removes it without cleanup write;
- expired join/answer/progress rejected by emulator rules using `now`;
- teacher explicitly extends; session reappears and student actions work;
- terminal stored status wins over time-derived state;
- owner query returns only owner entries and canonical data is rechecked.

Edge proof:

- action exactly at expiry is rejected (`expiresAt <= now`);
- wrong or missing client offset cannot authorize action;
- offline queued write before expiry rejects after reconnect if server time is
  expired;
- extension racing with student action has deterministic server-rule outcome;
- stale/tampered index never authorizes;
- duplicate tabs/repeated migration remain idempotent;
- legacy owner fields normalize with explicit precedence;
- malformed/missing/non-number `expiresAt` fails closed for student actions and
  is excluded from active index;
- existing stored `expired` status remains compatible;
- atomic canonical/index writes prevent partial active discovery; repair path
  handles stale rows;
- delete/archive removes index row;
- reconnect and unsubscribe do not duplicate listeners;
- pagination avoids unbounded owner history download;
- admin/super-admin access remains explicit and does not weaken teacher rules.

## Verification Commands

```powershell
rtk npx vitest run src/services/sessionLifecycle.test.ts src/services/serverClock.test.ts src/services/sessionOwnerIndex.test.ts src/services/sessionOwnerIndexMigration.test.ts src/services/sessionQuery.test.ts src/services/sessionActionError.test.ts src/services/sessionManager.lifecycle.test.ts
rtk npx firebase-tools emulators:exec --only database "rtk npx vitest run src/__tests__/security/prd0055-live-session-rules.emulator.test.ts"
rtk node --test scripts/__tests__/check-mantine-boundary.test.mjs
rtk npm run lint
rtk npx tsc --noEmit
rtk npm run build
```

CI mirrors the lifecycle boundary in `.github/workflows/session-lifecycle.yml`.
