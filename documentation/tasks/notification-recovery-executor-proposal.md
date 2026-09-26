# Internal notification retry executor — SOURCE IMPLEMENTATION AUTHORIZED, DEPLOYMENT HELD

Prepared September 27, 2026 (September 26 UTC), against `7fdfb636`. The planner approved the five-file runtime implementation and focused verification after review of `7df467c2`. Binding provisioning, migration deployment and live rollout remain held for consolidated source/evidence review. The current Worker remains `be0c3e4e` with its existing single Cron. The approved one background retry requirement remains in force.

## Proposed replacement

Use one SQLite-backed `NotificationRetryExecutor extends DurableObject`, selected with `env.NOTIFICATION_RETRY_EXECUTOR.getByName('first-batch')`. Follow the repository's `UploadGrantReplayLedger` class export, binding and `new_sqlite_classes` configuration pattern. The new object has one internal RPC, `retry(family)`, accepting only class membership, homework submission, manual reminder and homework reset. It runs the existing handler for one due intent using the existing Firebase storage/repository. The caller supplies no actor, recipient, content, attempt or gate state.

Each existing `*/2 * * * *` tick makes two serial RPCs: one class pass, then one rotating homework/reminder/reset pass. A bounded two-call loop collects exceptions, continues the second family, then throws an `AggregateError` containing the failures, so one failed call neither starves the other nor disappears from diagnostics. Missing binding or an unknown batch fails closed. Delete the entry point's direct scheduled-handler dispatch and dormant full-stage/bulk scheduling arrays and their retry-only imports. Later-family handlers remain staged, but scheduled activation requires a new reviewed batch. There is one executor path; HTTP product/action routes retain their current owners and gating.

Class runs every two minutes; the other three families run every six minutes. With healthy providers/gates, no earlier class backlog, and each invocation finishing before its next visit, thirty simultaneously due class actions take at most sixty minutes after becoming due, versus about four hours today. The original one-hour due delay remains. This is a capacity calculation, not a measured drain or a latency guarantee. A suppressed family deliberately holds its backlog.

## Provider and plan applicability

Cloudflare documents SQLite-backed Durable Objects on Workers Free and a default 30-second CPU allowance per DO invocation. The retained retry work must execute inside that invocation; a call through an object does not change the outer Cron or immediate HTTP Worker limit. The Free external-subrequest limit remains 50, including redirect hops. [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [Worker limits](https://developers.cloudflare.com/workers/platform/limits/).

Free DO compute quotas are 100,000 requests/day and 13,000 GB-s/day; each RPC method call is a metered request, and allocated memory is 128 MB. Duration includes active wall time and idle time when the object cannot hibernate. Idle eligible objects do not consume duration. These are documented Free-plan terms, not proof of this account's remaining capacity or an existing notification namespace. No paid upgrade is proposed. [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Authority and bounded work

Firebase retains intents, claim CAS, attempt counts, family suppression, inboxes and admin issues. SQLite selects the required platform backend; the executor creates no tables and performs no storage I/O. It has no alarm, queue, token broker, public retry endpoint or per-student object. Each RPC has one native 20-second AbortController deadline; every scheduled provider fetch receives its signal, and a finally block clears its timer. An abort remains visible after handlers that swallow transport failures return. No detached provider work or retry confirmation is added. The existing claimed `retrying` interruption path checks delivery and reports missing recipients without a third send. Three distinct terminal failures still suppress later retries; new immediate attempts still run. Ordered success evidence and conditional issue-pointer clearing remain in the shared gate. Suppression is sticky after the threshold; fresh verified success records recovery evidence without itself authorizing resumed retries.

All four scheduled paths use one stable `fetch` adapter with `redirect: 'error'`. Provider redirects become a reported/diagnosable transport failure instead of consuming uncounted hops. The scheduled inbox repository uses its existing `maxRetries: 4` option. This bounds internal conditional-write contention; it does not change the immediate attempt plus one later notification attempt, source checks or read flags. Immediate HTTP repository behavior is unchanged.

The shared token cache now fixes the first-client transport seam: cache the service-account key/token/expiry, and pass the requesting client's `fetchImpl` to `getToken(fetchImpl)` on each refresh. Otherwise an earlier raw transport could bypass the executor's redirect policy. No invocation counter or request-budget framework is needed.

### Source-derived external-call ceiling per RPC

Database reads include Firestore POST queries. Writes count failed CAS attempts. Cold OAuth adds one POST. Numbers assume four repository CAS rounds, existing three-round gate/final-state loops, one due intent, and rejected redirects; they require a focused runtime check before release.

| Branch | Reads | Writes | OAuth | Total |
|---|---:|---:|---:|---:|
| Class join, healthy two-recipient delivery | 5 | 4 | 1 | 10 |
| Class success with prior issue, no contention | 7 | 7 | 1 | 15 |
| Class inbox/recovery/final-state maximum contention | 23 | 23 | 1 | **47** |
| Class second-recipient conflict after first create, maximum report/final contention | 18 | 17 | 1 | 36 |
| Interrupted class, missing inbox and report/final contention | 10 | 7 | 1 | 18 |
| Homework submission, healthy retry | 4 | 3 | 1 | 8 |
| Homework maximum success/recovery contention | 16 | 16 | 1 | 33 |
| Homework maximum content-conflict/report contention | 11 | 10 | 1 | 22 |
| Reminder/reset with class/course target, healthy retry | 5 | 3 | 1 | 9 |
| Reminder/reset maximum success/recovery contention | 17 | 16 | 1 | 34 |
| Reminder maximum conflict/report contention | 12 | 10 | 1 | 23 |
| Reset conflict/report plus existing notice check | 13 | 10 | 1 | 24 |
| Interrupted homework/reminder/reset, missing inbox and report contention | 6 | 5 | 1 | 12 |

The class ceiling is `1 OAuth + 1 query + 1 suppression read + 2 claim calls + 18 inbox calls + 18 recovery calls + 6 final-state calls = 47`. Existing default five repository rounds makes this branch 51, so merely moving unchanged code into a DO is insufficient. Direct student/group reminder/reset targets omit one source lookup. Concurrent incoming RPCs can interleave across I/O; Firebase CAS, rather than presumed DO serialization, remains the authority.

## Empty-day cost

| Dimension | Proposed daily count | Current first-batch count |
|---|---:|---:|
| Outer Cron invocations | 720 | 720 |
| Internal DO RPCs | 1,440 | 0 |
| Class RTDB due queries | 720 | 180 |
| Firestore due queries | 720: 240 each for homework/reminder/reset | 540: 180 each |
| DO storage reads/writes | 0 | 0 |

Empty scans do not read gates or mutate Firebase. Empty Firestore queries still incur the minimum document-read charge: 720/day is 1.44% of the published 50,000-read/day Spark allowance, before all other app use. RTDB adds 540 empty queries/day; actual downloaded bytes need measurement rather than a guessed payload. [Firestore pricing](https://firebase.google.com/docs/firestore/pricing#minimum_charge_for_queries), [Firebase pricing](https://firebase.google.com/pricing).

The candidate RPC count is 1.44% of the DO Free request quota. Empty active-duration estimate is `1,440 × 0.128 GB × mean RPC seconds = 184.32 × mean seconds GB-s/day`: a hypothetical 0.5–2 seconds gives about 92–369 GB-s/day. This is not a measured DO result. Cold eviction/refresh can add up to one OAuth exchange per RPC; token reuse is an optimization, not a cost assumption. With the deadline timer cleared and no pending work after completion, the object is eligible for idle hibernation. If all 1,440 daily calls consume the full 20-second deadline, the serial-call duration estimate is 3,686.4 GB-s/day, before account-wide activity. This deadline bounds provider waiting; it is not a measured duration or a guarantee against platform scheduling/CPU stalls. Account-wide usage and actual duration remain release checks. No quota increase is requested.

## Exact change and verification envelope

| Path | Proposed change |
|---|---|
| New `cloudflare/src/upload-worker/notifications/notification-retry-executor.js` | About 45–60 lines: native DO class, four-family dispatch, stable transport and existing stores/handlers |
| `cloudflare/notification-command-worker.js` | Export class; replace direct scheduler with two RPCs; delete dormant scheduled arrays/imports |
| `cloudflare/src/upload-worker/notifications/class-retry.ts` | About nine changed lines to accept optional existing repository/transport dependencies |
| `cloudflare/src/upload-worker/listening-authoring/rtdb.ts` | About eight changed lines for refresh transport ownership |
| `cloudflare/wrangler.notifications.jsonc` | About twelve lines for `NOTIFICATION_RETRY_EXECUTOR` binding and `v1-notification-retry-executor` SQLite migration; same Cron/batch |
| Focused existing Worker tests plus one executor check | Validate dispatch cap/failure continuation, the 47-call contention branch, redirect rejection including cached-token refresh, and retained interruption/suppression behavior |

Estimated runtime scope: five files, about 90–120 added/changed lines plus deletion of the old scheduler maps. No handler duplication, dependency installation, baseline database migration or product-owner change. Source implementation and exact-source Workerd/CI/dry-run are authorized. After the separate deployment decision, use selective deployment/readback, outer Cron CPU, DO cold/populated CPU and duration, one source-bound recovery case and the agreed bounded backlog check. Immediate HTTP CPU remains a separate gate. Do not deploy the candidate or seed a thirty-event backlog before that decision. The [supported recovery artifact/procedure](notification-recovery-executor-recovery.md) preserves the same class/binding/migration and can pause only notification Cron; pre-DO `be0c3e4e` is not a rollback target after the lifecycle migration.

## Source verification checkpoint — September 27

Five runtime files implement the candidate. The final eight-file focused Workerd run passed 36/36, including the production-exported singleton RPC binding and the aborted-write/recovery assertion. The composed native-DO case measures OAuth 1 + GET 23 + PUT 23 = 47, keeps the second due intent untouched, records verified recovery, and clears only its issue pointer. Every request carries the same live abort signal and rejects redirects. An aborted inbox write retains the claimed `retrying`/attempt 2 intent; its later interrupted pass reports missing inboxes without a third send. The native namespace check calls `getByName('first-batch').retry('class-membership')` through the exported class with a mocked handler; the 47-call provider path separately uses the real handler, store, gate and repository. The deadline check validates the 20,000 ms timeout and cleanup after success, provider error and swallowed abort. The token refresh regression failed before the fix and passed after it.

Wrangler 4.103.0 dry-run bundles the candidate at 367.39 KiB and same-class recovery at 367.54 KiB with the retained DO binding. Cron-pause trigger dry-run also exits successfully. Isolated local bundling uses only a temporary canonical locked `jose` alias, checked against the source config after removing that alias. Workerd uses its supported June 24 compatibility date; this is local logic proof, not proof of the September 19 deployed runtime, Cloudflare CPU or duration. Recovery generator equality assertions pass. Exact-source Linux CI is the next gate; no remote deployment/provisioning, Cron change, data mutation or thirty-event seed has run for this candidate.
