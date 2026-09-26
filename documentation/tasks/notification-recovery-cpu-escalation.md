# Notification retry CPU escalation

Recorded 2026-09-26 02:17 UTC. The two focused correction attempts are exhausted. First-batch delivery is restored, but the measured normal class retry still exceeds the Workers Free 10 ms CPU limit. No third optimization, new service, later-family activation, or second Cron is being implemented.

## Exact live evidence

| Source / deployed version | Invocation | Result | CPU | Subrequests |
|---|---|---|---:|---:|
| `a8c9e75f` / `f5f1448a-04e7-440a-99ef-5a1096271fb4` | 01:44:16 UTC, normal two-recipient class retry | Both inbox rows created; intent done, attempts 2 | 12.422 ms | 13 |
| `eab74994` / `6f98156e-3911-47b0-844c-2ae6c8205f43` | 02:00:39 UTC, first focused attempt | Firebase rejects conditional `print=silent`; intent remains retry_due, attempts 1 | 6.306 ms before exception; not delivery cost | 4 |
| `7604a853` / `741a9945-cf7b-4718-a8f6-228db440c034` | 02:16:11 UTC, second focused attempt | Both inbox rows created; retained intent done, attempts 2; zero errors | **11.627 ms** | **11** |

Cloudflare GraphQL `workersInvocationsAdaptive` records the last invocation as one successful request, zero errors, p50/p99 both 11,627 microseconds. Worker tail independently identifies version `741a9945`, the scheduled invocation, outcome `ok`, and no exception. Success does not establish compliance with the sustained CPU limit.

The retained canary is `cf0c5e13-e7fc-4f4a-b102-21ea0b6f7ccc`, a synthetic pending-join delivery intent for existing QA class `YB3LP7`, originally occurring at 01:59:19 UTC. Readback confirms student inbox `289c3996-e488-5ee6-84cf-d36e875ee086` links to `/student/dashboard` and teacher inbox `05a77fdd-8037-5e11-88d4-1c5133f28f05` links to `/teacher/classes/YB3LP7`. Both preserve original occurrence and initially have `read=false`. This proves scheduled delivery restoration, not a fresh browser class action.

## Changes and safeguards

1. Native `print=silent` was tried to suppress unused write response bodies. Direct REST reproduction returned HTTP 400 because Firebase cannot combine it with `if-match`. The option was removed; conditional writes were retained. Provider behavior differed from mocked 204 responses.
2. The second attempt avoids a healthy-success gate PUT only when the latest gate has no failure streak, suppression, or issue to update. It retains the gate read, source checks, conditional claims/writes, one retry, deterministic inbox identity, read flags, failure reset, and recovery evidence. A supported conditional same-value REST write returned HTTP 200. The failed version never claimed the retained intent.

The four-file focused x64 Workerd set passes 21 tests; Wrangler dry-run is 391.95 KiB. The deployed version was created at 02:08:42.882 UTC and retains fetch/scheduled handlers, both secret names, `NOTIFICATION_RETRY_BATCH=class-homework`, and only `*/2 * * * *`. CORS includes the existing `https://hocthem.net` domain. Local correctness and configuration checks do not replace live CPU evidence.

## Retained cost and queue limits

- Normal healthy two-recipient class retry accounts for seven RTDB reads and four conditional writes. Cold token exchange adds one request: **12** locally; live reports **11**. Token reuse explains the warm count, so before/after CPU samples are not a controlled benchmark of the removed write alone.
- Success with an existing failure issue needs an additional gate write and issue read/write: **15 cold / 14 warm** requests by source accounting. This branch is unmeasured live and can cost more CPU than the already failing healthy branch.
- One class intent per eight-minute family visit means thirty simultaneously due class actions need thirty visits, roughly four hours after due time, plus the initial one-hour delay. This is a calculated capacity concern; realistic populated backlog drain has not been measured or accepted.
- The older 7.424 ms interrupted-`retrying` report canary proves only readback/reporting. Empty Cron passes and mocked request budgets cannot close capacity.

## Product proof and remaining work

Edge was recovered through a fresh tab with the existing Super Admin session. Student Test's real Reading V2 submission saved a submitted record and atomic notification intent at 02:07:48 UTC, while the incompatible version caused immediate notification failure. Delivery remains `retry_due`, attempts 1, naturally due at 03:07:48 UTC. A separate existing homework statistics update was denied by Firestore rules; the app caught it and the submission stayed committed. No stats or product-action owner migration was introduced.

First-batch homework delivery/failure recovery, realistic queue progress, success-with-prior-issue cost, later event families, Book verification, and historical recovery remain open. Await the planner's CPU/capacity decision; continue independent authorized first-batch verification without inventing another architecture.

Provider limit: [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time). Transport reference: [Firebase REST conditional requests](https://firebase.google.com/docs/reference/rest/database#conditional_requests); the incompatible combination was directly verified against the authorized QA intent.
