# Notification retry executor recovery

**Corrected source verification:** [CI 36265610109](https://github.com/iamhuwng/autoresync/actions/runs/36265610109) passed on `136634e919897a2529d74d3e1eb23a1856398e78`. The final eight-file affected Workerd run passes 38/38, including both fast backend failures reproduced red before the two-line fix. The scheduler reports AggregateError, preserves attempt-2 claims and still attempts its second RPC; later interruption recovery sends no third notice. Six runtime files are authorized after the planner's sibling-path correction. Deployment remains HELD; no live account-capacity or visible-admin proof is inferred.

**Corrected source artifacts:** after the class/homework backend-error correction, candidate/recovery dry runs pass at 367.50/367.65 KiB. Current hashes and live starting-state evidence are recorded in the [read-only preflight](notification-recovery-executor-preflight.md). Actual account plan/remaining DO capacity are unknown; deployment remains HELD. Earlier artifact hashes below are retained historical snapshots.

**Exact-source verification:** [CI 36264700700](https://github.com/iamhuwng/autoresync/actions/runs/36264700700) passed on `4b94ccb7d58422ad2ac2a19ec222af4ec1c5775b`: app notification services, RTDB/Firestore authority, atomic result/index deletion, Workerd actions, candidate bundle and same-class recovery generator/bundle. The final local focused run passed 36/36. Source review found no concrete defects; the production-exported singleton native RPC check closes the construction-only proof gap. **DEPLOYMENT HELD** pending the planner's consolidated decision. No DO provisioning, remote pause/deploy/resume or backlog seed has run for this candidate.

## Scope and status

Source preparation and local bundle verification only. **All remote pause,
forward-deploy, and resume commands below are HELD until explicitly authorized.**
No remote recovery has been exercised by preparing these files.

The first `v1-notification-retry-executor` SQLite migration creates
`NotificationRetryExecutor` on `luyentap-notification-command`. After this class
lifecycle change, direct rollback to the pre-DO version `be0c3e4e` is forbidden:
[Cloudflare rejects rollbacks across Durable Object class lifecycle changes](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/#bindings).

Recovery uses the same Worker, class export, binding, migration tag, and namespace.
It deletes no namespace or data and creates no parallel runtime. Immediate HTTP
actions continue through the original fetch handler; durable Firebase intents
remain available for later retries. This recovery disables the planner/retry
entrypoint and does not repair an unrelated HTTP regression.

## Prepare and verify locally

Run from the isolated checkout root in PowerShell:

```powershell
node scripts/prepare-notification-recovery.mjs

$notificationNode = 'C:\Users\The Lord\.codex\tools\windows-arm64\node\22-x64\node.exe'
$notificationWrangler = 'C:\Users\The Lord\repos\luyentap-prd0062\cloudflare\node_modules\wrangler\bin\wrangler.js'
$notificationRoot = (Resolve-Path cloudflare).Path
$notificationArtifacts = Join-Path $notificationRoot 'tmp/notification-recovery'

& $notificationNode $notificationWrangler deploy --dry-run --config "$notificationArtifacts/wrangler.notifications.paused.jsonc"
& $notificationNode $notificationWrangler deploy --dry-run --config "$notificationArtifacts/wrangler.notifications.recovery.jsonc"
& $notificationNode $notificationWrangler triggers deploy --dry-run --config "$notificationArtifacts/wrangler.notifications.paused.jsonc"
```

The generator uses Node's standard library and parses the currently valid JSON
inside `wrangler.notifications.jsonc`; JSON comments are not supported. It writes
three ignored artifacts under `cloudflare/tmp/notification-recovery/`:

- `wrangler.notifications.paused.jsonc`: the complete normal config with only
  `triggers.crons` changed to `[]` and `main` relocated to an absolute path.
- `notification-command-recovery.js`: imports the original Worker, re-exports
  the same `NotificationRetryExecutor`, delegates fetch, and makes scheduled
  events a no-op.
- `wrangler.notifications.recovery.jsonc`: the complete paused config pointing
  at the generated recovery entrypoint.

Runnable assertions check the expected Worker, binding, initial migration,
unchanged config keys, and complete generated config equality after the allowed
Cron/main changes. They read the saved configs back before succeeding. Config
`$schema` is editor metadata and remains unchanged. Regenerate and recheck after
source changes; these files reference the current original source and are not
immutable bundles. Do not stage generated artifacts.

Dry runs prove local bundling/config acceptance only; trigger dry run exits
before API calls and cannot prove remote schedules or bindings.

## Pause and forward recovery — HELD

Before mutation, record the actual active version, bindings, migration tag,
namespace identity, and schedules for this Worker. Confirm the initial migration
has completed and matches the retained config. Do not change migration tags,
binding/class names, storage backend, or add delete/rename/transfer migrations.
Keep the existing migration flow; do not switch to declarative `exports` during
recovery. [Updating existing class code requires no new migration](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/).

```powershell
# HELD: apply only after remote mutation authorization.
& $notificationNode $notificationWrangler triggers deploy --config "$notificationArtifacts/wrangler.notifications.paused.jsonc"
& $notificationNode $notificationWrangler deploy --config "$notificationArtifacts/wrangler.notifications.recovery.jsonc"
```

Installed Wrangler 4.103.0 exposes the documented experimental
[`triggers deploy`](https://developers.cloudflare.com/workers/wrangler/commands/workers/#triggers-deploy)
command. It updates triggers without uploading code or applying Durable Object
migrations/bindings. `crons: []` removes all Cron schedules on this notification
Worker; omitting `crons` leaves schedules unchanged. The complete config retains
workers.dev and other trigger settings because this command also reconciles
routes/domains and configured queue/workflow triggers.

[Cron changes can take up to 15 minutes to propagate](https://developers.cloudflare.com/workers/configuration/cron-triggers/#2-update-configuration).
The no-op scheduled recovery handler prevents late Cron arrivals from starting
new planner work after the recovery version becomes active. Existing invocations
may still finish. Cron removal does not cancel Durable Object alarms; this
procedure assumes retries are Cron-driven and the executor does not schedule
alarms. Verify remote schedules are empty, recovery is active, the binding and
namespace are unchanged, immediate HTTP still works, and Firebase intents remain.

## Resume — HELD

Deploy repaired planner source using the **paused** config first. Retain the
same binding and migration history. Verify immediate HTTP and focused retry
behavior before restoring schedules; enabling Cron while the no-op recovery
entrypoint is still active does not resume retries.

```powershell
# Local preparation/checks after repairing the original source.
node scripts/prepare-notification-recovery.mjs
& $notificationNode $notificationWrangler deploy --dry-run --config "$notificationArtifacts/wrangler.notifications.paused.jsonc"

# HELD: repaired original main, with Cron still paused.
& $notificationNode $notificationWrangler deploy --config "$notificationArtifacts/wrangler.notifications.paused.jsonc"

# HELD: restore approved normal schedules only after verification.
& $notificationNode $notificationWrangler triggers deploy --config "$notificationRoot/wrangler.notifications.jsonc"
```

The normal config currently specifies `*/2 * * * *`; restore the reviewed normal
config, not a guessed schedule. Record the actual repaired active version,
unchanged namespace/binding, restored schedules, and successful bounded retries
after propagation. Deployment, recovery, and resume remain unproven until those
remote checks run under authorization.

## Local artifact checkpoint — September 27

Wrangler 4.103.0 candidate/recovery dry runs pass at 367.39/367.54 KiB; pause
trigger dry run passes. The generated immutable local bundles are under
`cloudflare/tmp/notification-recovery/candidate-bundle/` and `recovery-bundle/`.
SHA-256 of their JavaScript entrypoints:

- Candidate: `141B922029E2C300CA9B6EE8E63B6F2E049F2213678957C44FFAFB38C8C7D47A`.
- Recovery: `D3E8EF2112FFB76566A21432DBE7133A7B0604F302630718CEC25D10601F2628`.

Both bundles retain the class export. A build-only canonical locked `jose`
alias resolves isolated dependencies; deleting that alias and normalizing the
relocated main path leaves source config equality intact. Bundle hashes are
local build evidence, not deployed version IDs or remote recovery proof.
