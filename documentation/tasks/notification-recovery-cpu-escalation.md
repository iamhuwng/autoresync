# Notification retry CPU escalation

Recorded 2026-09-26 02:17 UTC; updated for the 04:49 UTC [implementer rotation](notification-recovery-rotation-handoff-2026-09-26.md). First-batch delivery works, but cold retry CPU and realistic queue progress remain open. The first two corrections below exhausted their escalation; the planner subsequently authorized the native `null_etag` create correction. The separate cached homework token change was deployed, but its populated CPU result was not recorded before rotation. No additional family or second Cron is approved.

## September 27 investigation checkpoint (September 26 UTC)

Source `7fdfb636` passed exact-source CI and deployed as `be0c3e4e-338e-4771-b06a-368b5306b4f6` at 18:09:22 UTC. The failure-ordering correction preserves a newer terminal failure against an older delayed success. No CPU correction or schedule change is implied by that release.

A diagnostic profile executed the real class retry handler against fake provider I/O, using the installed x64 workerd and its supported `2026-06-24` compatibility date instead of the deployed `2026-09-19` date. Across 100 fresh-token runs, native RSA signing accounted for 431.937 ms of sampled time (about 4.319 ms per run), and key import for 193.491 ms (about 1.935 ms per run). Cold paths made ten provider requests including one OAuth exchange; 100 cached-token runs made nine each and no OAuth exchange. These are local sampled stack costs, including harness/fake-provider work, **not Cloudflare CPU or a release pass**. The scripts and profiles remain local under `output/notification-recovery-profile/`; no real service-account key was written there.

Two isolated synthetic class delivery intents were created at 18:12:43 UTC for existing QA class `YB3LP7`, student `x3hDfjYVN7cJtSbwq0ChIjl1Bk62` and its recorded teacher, without changing class membership. Intent `9550d48d-2b35-45f6-b8a5-54a7b6fddcc3` completed the 18:16:29 UTC slot at **10.646 ms CPU / nine subrequests**; `585f9497-3d17-43d1-9745-f601eebe4107` completed the 18:24:29 slot at **7.319 ms / nine**. Both read back done/attempts 2, and all four deterministic inbox rows preserve occurrence time, expected links and initially false read flags. GraphQL reports successful invocations with zero errors. Nine requests identify cached OAuth. The first warm sample still exceeds the 10 ms target. The active version throughout this interval is directly read back as `be0c3e4e`; the 18:24 tail independently identifies that version and outcome `ok`. No independent 18:16 tail capture, fresh browser class action or historical backfill is claimed.

A real QA homework attempt saved at 18:24 UTC while only its browser tab's notification endpoint was deliberately blocked. Submission `VFDPyjnvbhe8TBNWpq3l_x3hDfjYVN7cJtSbwq0ChIjl1Bk62_1790447025532` saved canonical result `reading-v2-result-9df3859c-fe22-44b0-805f-bc42a05c8b7b` and retry_due/attempts 1. The expected teacher inbox row was absent. The network block was removed, the student tab closed, and only that submission's dueAt was advanced with its exact Firestore updateTime precondition at 18:25:49 UTC; original event identity, source, occurrence and attempt count stayed intact. The 18:26:29 retry read back done/attempts 2 and delivered `b1fca3ed-2dc1-5c87-87d9-d971302e3387` to Teacher Test with the correct homework link and original time. Teacher Test saw it in the real localhost:5173 bell and Open changed read=false to true. GraphQL reports **8.573 ms CPU / seven subrequests**, zero errors; tail independently confirms `be0c3e4e` and outcome `ok`. This controlled, due-time-advanced case proves closed-tab retry and warm cached-token cost, not the unmodified one-hour delay or cold capacity.

The 18:10 cold **empty** homework slot used 6.861 ms CPU and two subrequests; empty manual-reminder/reset slots used 2.110/1.815 ms and one subrequest each. Empty results and two warm passes cannot close populated cold CPU or sustained capacity. The planner's one-pass direction pauses further local tuning/deployment and requests the [small internal DO proposal](notification-recovery-executor-proposal.md), now **UNDER REVIEW**. No runtime/binding/migration change has occurred. Fresh live admin visibility and suppression/recovery remain open: the available in-app browser rendered only a blank background on both hocthem.net/admin/reports and /login, with no captured console error. Local teacher/student flows work. This is a browser/served-app proof blocker with an undetermined cause, not proof of an admin product defect or a failed backend recovery.

### Earlier baseline

| Path / Worker | CPU | Subrequests | Meaning |
|---|---:|---:|---|
| Native create, fresh two-recipient class retry, cold / `5daa8079` | 14.735 ms | 10 | Delivered; exceeds 10 ms target. |
| Same normal class path, warm / `5daa8079` | 8.110 ms | 9 | Delivered; one sample within target. |
| Same path with prior issue, warm / `5daa8079` | 9.550 ms | 12 | Delivered and saved recovery evidence; one sample within target. |
| Earlier real closed-app homework retry / `741a9945` | 14.212 ms | 9 | Teacher notice delivered; exceeds target. |

Warm passes do not close cold or sustained capacity. Version `2a1df6dc-0772-49ed-9edc-36b7e0572ef6` contains the later cached homework token change; no populated retry measurement is recorded for it. One class event every eight minutes implies about four hours to drain thirty simultaneously due actions, plus the initial one-hour wait. A measured realistic backlog result and cost of one-time recovery reporting remain required.

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

## Planner-authorized native create correction (2026-09-26)

After the two-attempt escalation, the planner explicitly approved the existing Firebase `if-match: null_etag` create-if-absent pattern. The shared inbox repository now first attempts that protected PUT; on 412 it retains stored schema/semantic validation and the existing bounded conditional race fallback. It never confirms an unknown transport outcome. Product owners, gate concurrency, actor/recipient/content proof, retry claims/final state, schedule and other services are unchanged. `print=silent` remains absent.

Direct live provider proof on isolated QA identity `e7ec646f-84d6-4be6-b61e-49655702e90c` returned 200 for absent creation and 412 for both an existing replay and conflicting content. Readback preserved `read=true`, original content and creation time. The exact QA row was conditionally removed with 200.

Focused repository/class checks pass 19 tests, including overlapping creates, partial existing recipients, replay/schema/content conflicts and unknown transport. Budget and shared Book runtime checks pass 24 tests; one Book filesystem source test is excluded because Windows workerd cannot enumerate its encoded file URL. Its equivalent case-sensitive source/name checks were run in PowerShell and pass. The initial changed THCS budget assertion was corrected and rerun: ten absent inbox writes now total 13 requests instead of 23. Fresh two-recipient class retry now accounts for 10 cold / 9 warm requests; replay adds one failed PUT per existing row before the prior validation read. Success with an existing issue accounts for 13 cold / 12 warm. These counts are source/local proof only. Wrangler dry-run passes at 392.08 KiB; deployment and matching normal/recovery CPU measurements remain pending.

## Read-only necessity comparison after escalation

The updated governing rule was read on 2026-09-26: app/Firebase by default, Worker only for concrete authority or closed-app requirements. No implementation change follows from this comparison.

| Current first-batch work | Necessity / removable-work assessment |
|---|---|
| Ordinary homework save, atomic source intent, start/submit orchestration, statistics, toast and admin display | Already app/Firebase owned. Keep them there; the observed statistics permission error does not justify migrating that save. |
| Class membership mutation and durable evidence | Existing reviewed exception for rejection's deleted evidence. No new product ownership is approved by this CPU report. |
| Due scan and conditional attempt/final-state writes | Needed for the agreed closed-app retry and concurrent invocation safety. App polling cannot replace them. |
| Suppression read and latest success-state read | Needed to hold globally suppressed backlog and reset a concurrently changed failure streak correctly. Removing the second read based on an earlier healthy read would need concurrency proof. |
| Inbox read, deterministic identity/content check and conditional create | Protect recipient/content authority, duplicate delivery and read flags. An unverified client success claim is insufficient. |
| Healthy-success gate PUT | Removed in `7604a853` when no failure or issue needs updating. Required recovery writes remain. |
| Homework retry's private `tokenFor` signer/exchange | It is separate from the existing RTDB client's cached token path, whose scopes already include Firestore. Manual reminder/reset stores already reuse that client. Reuse is a candidate for planner review; privileged token creation stays outside the browser. This would concern homework, not resolve the measured class overage by itself. |
| Notice presentation strings | App can own presentation of verified structured event data, but current stored inbox content and conflict checks use canonical strings. Moving formatting needs an explicit coordinated contract/caller review; it cannot simply accept arbitrary browser content. No CPU saving is measured or claimed. |

The measured class path has no identified ordinary product work that can simply be moved to the app while preserving its existing authority, one retry, and concurrent writes. Further decisions must weigh the necessary path against both CPU and queue capacity; placement in a Worker alone is not a justification.

## Product proof and remaining work

Edge was recovered through a fresh tab with the existing Super Admin session. Student Test's real Reading V2 submission saved a submitted record and atomic notification intent at 02:07:48 UTC, while the incompatible version caused immediate notification failure. Delivery remains `retry_due`, attempts 1, naturally due at 03:07:48 UTC. A separate existing homework statistics update was denied by Firestore rules; the app caught it and the submission stayed committed. No stats or product-action owner migration was introduced.

First-batch homework delivery/failure recovery, realistic queue progress, success-with-prior-issue cost, later event families, Book verification, and historical recovery remain open. Await the planner's CPU/capacity decision; continue independent authorized first-batch verification without inventing another architecture.

Provider limit: [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time). Transport reference: [Firebase REST conditional requests](https://firebase.google.com/docs/reference/rest/database#conditional_requests); the incompatible combination was directly verified against the authorized QA intent.
