# Notification executor deployment preflight — DEPLOYMENT HELD

Read-only receipt, September 27 local / September 26 UTC. No Worker, namespace,
schedule, Firebase, or product mutation occurred. Routine Wrangler OAuth refresh
restored the existing account session; no credential values were printed or saved.

## Live starting state

Cloudflare REST readback at **19:13:38–19:15:04 UTC** for account
`e41db829dabe9993f03674afdfd56510`, Worker `luyentap-notification-command`:

| Surface | Live readback |
|---|---|
| Active deployment | `58201e9f-93e0-46f6-b138-11bc6fe3e33b`, created 18:09:22.597163 UTC |
| Active version | `be0c3e4e-338e-4771-b06a-368b5306b4f6`, version 18, 100% traffic |
| Migration starting state | `migration_tag: null` in settings and script metadata |
| Executor binding | No live `NOTIFICATION_RETRY_EXECUTOR` binding |
| Namespace starting state | Three existing SQLite namespaces; none for this notification Worker |
| Cron | One `*/2 * * * *`, modified 18:09:24.751708 UTC |
| workers.dev / preview URLs | Enabled / disabled |
| Handlers / compatibility | fetch + scheduled; 2026-09-19; nodejs_compat |
| Observability / rate limiter | Enabled; NOTIFICATION_RATE_LIMITER, namespace 205512, 30 per 60 seconds |
| Vars | Existing temp-a1437 project, DB URL/service identity and class-homework batch |
| Secret names only | FIREBASE_WEB_API_KEY; NOTIFICATION_COMMAND_GOOGLE_SA_KEY |

Existing namespace inventory:

- `b3165d7ae6984eaba10ad32bc1b9813d`: internal-ai-ds2api / Ds2ApiContainer.
- `bea9a2921503419cae45222576464679`: r2-upload-signer-s0-canary / UploadGrantReplayLedger.
- `6653df5f663d4648992dc26bd099b489`: r2-upload-signer / UploadGrantReplayLedger.

Successful account REST reads covered account-settings, Worker deployments,
settings, secrets, schedules, Durable Object namespaces, scripts, versions and
subdomain. This is remote starting-state evidence, not candidate deployment proof.

## Account plan and remaining capacity — UNKNOWN

Account settings returned `default_usage_model: standard` and
`green_compute: false`; neither establishes Free versus Paid. Billing
`GET /accounts/{account}/subscriptions` at 19:13:38.8832502 UTC returned
**HTTP 403**, code **10000**, `Authentication error`.

GraphQL schema introspection succeeded. The account-wide query at
19:14:17.9795074 UTC, using `date_gt: "2026-09-25"`, returned
`durableObjectsInvocationsAdaptiveGroups: []`, `durableObjectsPeriodicGroups: []`
and `errors: null`. Empty datasets do not establish zero consumption.

**Actual plan, measured account-wide DO requests/duration, billing period and
remaining capacity are unknown.** Conditional [pricing allowances](https://developers.cloudflare.com/durable-objects/platform/pricing/)
and source arithmetic are not account readback. The queried datasets are the
documented [DO metrics surface](https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/).
No unchanged capacity requests were repeated and no paid upgrade was requested.

The first attempt at 19:10:36 UTC returned HTTP 401, followed by HTTP 429.
Local credential metadata showed expiry at 18:39:18.410 UTC. The installed x64
Wrangler 4.103.0 `whoami` then succeeded for the existing account; refreshed
credential expiry was 20:12:44.360 UTC. The second receipt above uses that changed
authentication state. The first attempt is authentication-harness evidence,
not a Worker runtime failure.

## Local corrected artifacts and retained trigger surfaces

After the class/homework backend-error correction, generator assertions and
Wrangler dry runs pass: candidate **367.50 KiB**, recovery **367.65 KiB**.
SHA-256 for the generated JavaScript entrypoints:

- Candidate: `63D3AC4E9B0FD240BD2067C160EFF2A66EAB7B0967DEDD541A4EEDB449192432`.
- Recovery: `0437D746BF3EDD45ECD334E1C4A91C336B2CA36260626A74E4143B2F00F1D430`.

Bundles are under `cloudflare/tmp/notification-recovery/{candidate-bundle,recovery-bundle}`.
All source/generated configs retain the account, Worker, workers.dev=true,
preview_urls=false, binding/class and v1-notification-retry-executor migration.
Normal Cron is `*/2 * * * *`; paused/recovery configs use `[]`. There are no
configured routes, custom-domain routes, queues or workflows in these local
configs. Live routes/domains/queue/workflow inventory was not established by
these requests; do not infer absence from source configuration.

The pause config changes only Cron plus main-path relocation; recovery additionally
selects the generated entrypoint. Its class export and immediate HTTP handler
are retained. Local artifact/config proof does not establish remote recovery.
Actual account plan/capacity, fresh visible admin recovery and candidate live
CPU/duration/backlog remain open. Deployment, initial migration, pause/resume
and backlog seeding remain **HELD** pending planner review.
