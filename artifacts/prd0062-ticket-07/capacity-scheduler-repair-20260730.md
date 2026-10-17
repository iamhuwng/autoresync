# Ticket 07 capacity-scheduler closure repair — 2026-07-30

## Historical provenance

- `d9392d00` introduced the account-capacity contract.
- `8aac1324` introduced the bounded provider snapshot producer.
- `41949316` correctly made a current healthy snapshot (maximum age 15 minutes)
  mandatory before upload reservation.
- The deployed reconciliation Worker exposed the producer only through an
  authenticated fetch route. Its `*/15` scheduled handler ran cleanup only, so
  the snapshot inevitably became stale after rollback disabled manual probing.

## Repair

- The scheduled handler runs cleanup first and then a separately isolated
  capacity producer. Failure or missing credentials in either authority family
  cannot starve the other.
- Each event performs at most one cleanup operation and four bounded provider
  page units.
- Multi-page progress is stored as an opaque sealed continuation on the
  service-only upload-account aggregate. Cursor updates and clears compare the
  prior token as well as the domain revision. Any domain mutation clears scan
  progress.
- Deployment limits a scan to eight 1,000-version pages. Four pages per
  five-minute tick completes every supported scan within ten minutes. More
  fragmented accounts fail closed without writing a healthy snapshot.
- At the worst configured cadence, four page units × two B2 Class-C calls
  (authorize plus list) × 288 ticks/day = 2,304 calls/day. The exact
  `[listFiles]` capacity identity remains separate from metadata
  `[readFiles,listFiles]` and cleanup `[deleteFiles]`.

## Local verification

- Root repository/source lifecycle/capacity: 29 tests passed.
- Cloudflare scheduler/probe/provider reconciliation/provider adapter:
  38 tests passed.
- Scoped ESLint, UTF-8, `git diff --check`, and Wrangler dry-run passed.
- Repository-wide TypeScript remains blocked only by pre-existing shared
  Book Assembly/runtime diagnostics; no diagnostic named a Ticket 07 path.
- Independent review initially failed four races/bounds. After correction it
  passed: cleanup ordering, ten-minute supported freshness, authority
  isolation, and cursor-level CAS were all resolved, with no new P1/P2 finding.

## Deployed readback

- Worker: `luyentap-book-source-reconciliation-preview`
- URL: `https://luyentap-book-source-reconciliation-preview.iamhuwng.workers.dev`
- Active version: `1a974801-06fa-4758-9b66-925aaa29c708` at 100%
- Main: `src/book-source-worker/reconciliation-worker.ts`
- Cron: `*/5 * * * *`
- Account/path: `book_source_upload_accounts/book_b2_primary`
- Deployment read back `BOOK_SOURCE_CAPACITY_MAX_PROVIDER_PAGES=8` and the
  expected separately named capacity, metadata, cleanup, Firebase, cursor, and
  rollout secret bindings. No secret value was recorded.
- Healthy provider snapshots completed at:
  - `2026-07-30T17:30:38.292Z`
  - `2026-07-30T17:35:38.519Z`
  - `2026-07-30T17:40:38.538Z`
- Each snapshot reported zero provider versions and zero bytes, matching the
  protected aggregate. No continuation remained.

## Canonical consumer and rollback

- The teacher UI addressed the canonical #49 Worker and retried after freshness
  recovered. Its first retry was denied before reservation because the
  disposable #49 preview gate had expired at
  `2026-07-30T17:30:00.000Z`; this is not capacity-producer failure.
- Rollback order was exercised against preview only:
  1. set the exact teacher/Book #49 preview gate to `emergencyState=disabled`;
  2. confirm the protected aggregate contained only released operations;
  3. set only `BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE=disabled`, preserving
     Worker deployment, account records, status/completion/cleanup code, and all
     exact identities.
- With schedule version `aecc1933-afed-4af3-bf31-8189648b753a` disabled, the
  next `17:45` cron did not advance the last completed snapshot:
  `providerReconciliation.completedAt` remained
  `2026-07-30T17:40:38.538Z` through `2026-07-30T17:46:09Z`.
- Re-enabling only the schedule created version
  `51f1acbf-8c56-4675-8e4d-b0a1963ef4e3` at 100%. The next scheduled run
  completed a fresh healthy snapshot at `2026-07-30T17:50:38.619Z`.
- The #49 canonical preview gate remained disabled after the drill. Its
  deployed configuration and the reconciliation deployment both address
  `book_source_upload_accounts/book_b2_primary`; the shared repository rejects
  missing, non-healthy, future-dated, or older-than-15-minute snapshots before
  reservation.
- Private B2/#03B remains disabled; #50A and unrelated trusted actions remain
  default-deny.
