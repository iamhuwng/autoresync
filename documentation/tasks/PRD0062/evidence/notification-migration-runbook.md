# PRD0062 38B4 notification migration runbook and evidence template

This runbook is for the deployment-only operator runner in
`scripts/migrate-notifications.mjs`. It is not a browser flow and must not be
run with a Firebase browser SDK, a user ID token, or credentials on argv.

## Authority and safety gate

Provide the following through the deployment secret store only:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_DB_URL`
- `NOTIFICATION_MIGRATION_SERVICE_IDENTITY`
- `NOTIFICATION_MIGRATION_CHECKPOINT_SECRET` (at least 32 bytes)

By default the runner invokes `gcloud auth print-access-token
--impersonate-service-account=<operator>` and uses the resulting short-lived
operator token only in memory for the checkpoint-path REST preflight and
migration. The active gcloud caller is never sent to Firebase. Do not set
`FIREBASE_TOKEN`, `FIREBASE_AUTH_TOKEN`, `GOOGLE_OAUTH_ACCESS_TOKEN`,
`GCLOUD_ACCESS_TOKEN`, `CLOUDSDK_AUTH_ACCESS_TOKEN`,
`CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE`, or `GOOGLE_GHA_CREDS_PATH`; the
runner rejects those ambiguous token/credential paths.

For the compatibility Firebase CLI mode, set
`NOTIFICATION_MIGRATION_AUTH_MODE=firebase-cli` and provide
`GOOGLE_APPLICATION_CREDENTIALS` (or the ephemeral
`NOTIFICATION_MIGRATION_GOOGLE_SA_KEY` fallback). The runner then performs a
read-only `firebase database:get` against only the checkpoint path.

On Windows, set the path without copying the JSON into a command argument:

```powershell
gcloud --version
$env:FIREBASE_PROJECT_ID = '<project-id>'
$env:FIREBASE_DB_URL = 'https://<project-id>-default-rtdb.firebaseio.com'
$env:NOTIFICATION_MIGRATION_SERVICE_IDENTITY = '<operator>@<project>.iam.gserviceaccount.com'
$env:NOTIFICATION_MIGRATION_CHECKPOINT_SECRET = '<secret-from-deployment-store>'
gcloud auth print-access-token --impersonate-service-account=$env:NOTIFICATION_MIGRATION_SERVICE_IDENTITY --quiet | Out-Null
```

The runner rejects a service-account/client-email mismatch, a service-account
project mismatch, a database URL for another project, an invalid checkpoint
signature, and any path outside `notifications/**` or the dedicated checkpoint
path. Do not activate notification rules in this ticket; retain the existing
rules and record their pre-activation hash.

## Bounded execution

Run a read-only preview first, then one bounded batch at a time. The checkpoint
is updated with an ETag/CAS after each processed source row. A destination write
is verified before the unchanged source row is conditionally removed. A retry
after an interruption compares the destination semantically and reuses it; it
never creates a duplicate. Malformed or conflicting rows are reported and are
not deleted or overwritten.

Establish a notification-writer maintenance window (or an equivalent source
snapshot/freeze) before the first execute and keep it through the final
reconciliation. Completion is cursor-based and does not coordinate concurrent
application writers; a row inserted behind an already-completed cursor requires
another run. The source-delete guard and destination guard are separate REST
ETag checks rather than one cross-path transaction, so a guard failure retains
the source and must be reconciled before closure.

```text
node scripts/migrate-notifications.mjs --dry-run --batch-size 100
node scripts/migrate-notifications.mjs --execute --batch-size 100
node scripts/migrate-notifications.mjs --execute --batch-size 100
node scripts/migrate-notifications.mjs --reconcile --batch-size 100
```

Use `--replay` only when intentionally replaying a completed checkpoint. It is
still destination-idempotent. `--rollback` marks the checkpoint paused; later
`--execute` invocations stop without deleting destinations or checkpoints.

## Compatibility contract

Supported flat rows move from `notifications/{notificationId}` to
`notifications/{userId}/{notificationId}` with only the legacy `userId` body
field removed. Title, message, type, link, opaque legacy metadata, timestamp,
notification ID, and the exact boolean `read` state are retained. Existing
per-user rows are untouched. A malformed flat row with a trustworthy recipient
and safe ID receives the same body projection at the per-user path, while its
original source remains in place and the row is reported as malformed. This
keeps the 38A reader/read-state path usable without silently repairing data.
Malformed rows without a trustworthy recipient, or with an unsafe key, remain
only at their source path and are reported; the recipient must never be guessed
or reassigned. Those rows are retained for operator/super-admin compatibility
inspection rather than claiming a browser recipient journey.

## Redacted evidence template

Record one JSON object per run. Replace every placeholder with a non-secret
value or a count; never include notification bodies, user IDs, service-account
JSON, private keys, bearer tokens, Firebase auth tokens, or raw checkpoint
payloads.

```json
{
  "ticket": "98",
  "runId": "<non-secret-operator-run-id>",
  "mode": "dry-run|execute|replay|reconcile|rollback",
  "projectId": "<project-name-only>",
  "databaseOrigin": "<https-origin-only>",
  "serviceIdentityFingerprint": "<sha256>",
  "notificationRulesHashBeforeActivation": "<sha256>",
  "checkpointPath": "notification_migrations/prd0062-38b4-legacy-notifications-v1/checkpoint",
  "batchSize": 100,
  "cursorDigest": "<sha256-or-null>",
  "counts": {
    "scanned": 0,
    "migrated": 0,
    "replayed": 0,
    "untouched": 0,
    "malformed": 0,
    "conflicts": 0,
    "sourceRetained": 0,
    "errors": 0
  },
  "checkpointReadback": "verified|tampered|unavailable",
  "compatibilityRead": "verified|blocked|not-run",
  "readStateParity": "verified|blocked|not-run",
  "browserProof": "destination-owned|not-run",
  "deploymentProof": "local|staging-readback|blocked",
  "rollbackProof": "verified|not-run",
  "rulesActivation": "unchanged",
  "completion": "active|complete|paused|blocked",
  "notes": "<redacted diagnostic summary>"
}
```

Classify local tests, staging readback, browser behavior, rollback, and any
remote/deployed claim separately. A local test or dry-run is not deployed
proof. If staging credentials or browser fixtures are unavailable, record the
corresponding proof as `blocked` rather than substituting local evidence.
