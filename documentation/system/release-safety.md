# Release safety workflow

This document describes the active three-PR deployment architecture. The executable
scripts and workflows are authoritative. The root [AGENTS.md](../../AGENTS.md) is
the single canonical instruction file for every agent. Dated evidence and historical
measurements live in [`documentation/release-audits/`](../release-audits/), and do not
replace current provider readback.

## Operating rules

- Use a clean checkout and the exact protected `main` revision for production work.
- Observe the live provider state before selecting a release base. Local tests, builds,
  dry-runs, and screenshots do not prove deployed state.
- Keep production, qualification, and local credentials separate. OIDC credentials
  and temporary environment files stay outside the checkout.
- Record the prior provider version before every mutating deployment. A rollback is a
  provider operation and does not undo data migrations or object changes.
- Scope checks to the changed service. A Hosting observation does not qualify a Worker,
  Firebase rules, storage, Functions, or data migration change.

See [integration and normal release selection](integration-releases.md) for source
selection and change-impact routing.

The active implementation map is scripts/release-check.mjs for assessment,
scripts/release-plan.mjs for read-only planning, and
scripts/release-hosting-dependencies.mjs for changed-backend observations.
scripts/deploy-live.mjs owns Hosting build, publication, and recovery.
scripts/release-evidence.mjs and scripts/release-provider-readback.mjs own
artifact validation, manifest polling, and Firebase or Cloudflare readback.

### Provider checks and credentials

Use the repository-owned Firebase and Cloudflare readback tools with the scoped OIDC
identities. Keep tokens, service-account files, and generated environment files outside
the checkout. A provider readback is required before claiming current state, and a
local or dry-run result cannot substitute for it.

## Routine Hosting release

The manual `workflow_dispatch` entry point is
`.github/workflows/release-promotion-phase3.yml`. It accepts `publish`, `health`,
`plan`, and `verify-existing` operations and runs only for protected
`refs/heads/main`.

### Read-only preflight

`health` and `plan` run the read-only `preflight` job under concurrency group
`luyentap-hosting-read-only`. It uses read-only OIDC federation configured by
`LUYENTAP_RELEASE_GOOGLE_WORKLOAD_IDENTITY_PROVIDER` and
`LUYENTAP_RELEASE_GOOGLE_SERVICE_ACCOUNT`, plus
`LUYENTAP_RELEASE_CLOUDFLARE_READ_TOKEN`. The job verifies the exact remote `main`,
checks the Firebase identity, and observes Hosting and any dependencies without
mutation. `plan` writes a read-only release plan. `health` checks provider access.

### Serialized publish

`publish` runs `operation: publish` under `luyentap-hosting-production` with
`permissions: { contents: read, id-token: write }` and `environment: production`.
The workflow currently has no required reviewer during pre-launch. After launch, the
repository owner can re-attach a human-only required reviewer in GitHub Settings under
**Environments → production**, without changing this YAML.

The job performs these steps in order:

1. Verify `refs/heads/main`, `GITHUB_SHA`, and the remote protected `main` agree.
2. Federate to the production Firebase identity and keep credentials outside the
   checkout.
3. Observe the live Hosting manifest and retain `observation.fingerprint`.
4. Run the scoped assessment with the live revision as base.

   ```powershell
   node scripts/release-check.mjs --mode release --target hosting --base <live_sha> --observe-hosting --env-fingerprint <production-env-sha256>
   ```

   For this target, backend probes run only for backend files changed in
   `live_sha..HEAD`.
5. Build exactly once with `npm run build:production`.
6. Serve the resulting `dist/` on `http://localhost:5173`, run
   `node scripts/release-local-readback.mjs http://localhost:5173`, and run
   `assertHostingArtifact` against the same manifest and files.
7. Publish the checked artifact with
   `npm run deploy:hosting -- --deploy-built`. The deployment records the prior live
   version and polls Hosting with bounded exponential backoff for up to 90 seconds.
8. Append the released URL, source SHA, manifest SHA-256, operation ID, prior and live
   versions, and verified file count to `$GITHUB_STEP_SUMMARY`.

The summary includes this exact native rollback command:

```powershell
firebase hosting:clone temp-a1437:kahut1@<prior-version-id> temp-a1437:kahut1:live --project temp-a1437
```

If publication or readback is interrupted, resume the read-only verification with:

```powershell
npm run release:verify-existing -- --operation-id <uuid>
```

The recovery operation verifies the live version and manifest without rebuilding or
redeploying. It accepts optional `operation_id` and `expected_manifest_sha256` inputs
and validates their UUID and SHA-256 formats before readback.

For `target === 'hosting'` on protected `main`, a routine frontend-only release does
not require a manual review-card JSON file. `target === 'all'`, a changed backend
surface, or a hotfix path still requires the compatibility review and service-specific
evidence selected by the release checker.

The first manifest-bearing bootstrap is build-only:

```powershell
npm run build:production -- --build-only
```

For an independent live-based correction, prepare a clean checkout with
`scripts/hotfix-prepare.mjs`, then run the hotfix assessment against the observed live
revision. Do not substitute a local parent commit for an unverified live source.

## Agent verification handoff

The agent selects proportionate proof for the changed surface. Focused tests, emulator
checks, a browser journey, provider readback, and a spare deployed origin are all
available when their invariants apply. There is no mandatory browser framework or
fixed account journey.

For a built-site check, use a clean candidate, `npm run build:production`, and
`node scripts/release-local-readback.mjs http://localhost:<port>`. Retain the source,
manifest, environment fingerprint, test output, and any browser evidence with the
review record. Check the same candidate again if source, configuration, or live state
changes. Dated evidence belongs in `documentation/release-audits/`.

A release check can return `PASS`, `NOT_APPLICABLE`, `REVIEW_REQUIRED`, `UNVERIFIED`,
or `BLOCKED`. The latter three require the missing evidence or preparation to be
resolved before publication. Never replace provider readback with a caller-supplied
JSON assertion.

## Cloudflare Worker releases

Run `npm run deploy:worker -- <service>` (or `npm run deploy:worker -- --list` to list registered services), implemented by `scripts/deploy-worker.mjs`. The deployable services and their configs are:

| Service | Wrangler configuration |
| --- | --- |
| `r2-upload-signer` | `cloudflare/wrangler.jsonc` |
| `r2-backup-worker` | `r2-backup-worker/wrangler.toml` |
| `luyentap-notification-command` | `cloudflare/wrangler.notifications.jsonc` |
| `thcs-gemma` | `cloudflare/wrangler.thcs-gemma.jsonc` |
| `luyentap-qualification-upload-signer` | `cloudflare/wrangler.qualification.jsonc` |

`luyentap-notification-firestore-qa` has `deployable: false`. It is an external-DO
public-entry proxy and is intentionally blocked from generic overwrite.

The Worker lifecycle restricts `--skip-tests`, `--allow-dirty`, and `--offline` to
`--dry-run`. Live deploys require a clean Git tree, run targeted Vitest tests, run
`wrangler deploy --dry-run` with `CLOUDFLARE_ACCOUNT_ID` pinned, capture and re-verify
the prior live version with `readProviderState`, verify the authenticated Wrangler
account with `wrangler whoami --json`, upload with `wrangler versions upload`, re-check
live state for concurrent drift, and promote with `wrangler versions deploy <id>@100%`.
Read back the version-addressed `/versions/:id?include=modules` response and hash every
returned module. Run a safe no-write `OPTIONS` smoke probe after promotion. Roll back
from the repository root with:

```powershell
node scripts/tooling-where.mjs --exec <wrangler-tool> versions deploy <priorVersion>@100% --config <package>/<config> --message rollback:<priorVersion> --yes
```

Local Worker tests and a Wrangler dry-run are not deployed-state proof.

## Firebase rules and indexes releases

Run `npm run deploy:rules`, implemented by `scripts/deploy-firebase-rules.mjs`.
Choose one target, `--only database`, `--only firestore:rules`,
`--only firestore:indexes`, or `--all`. Every target supports `--dry-run`; `--skip-tests`,
`--allow-dirty`, and `--offline` are restricted to `--dry-run`.

The lifecycle checks for a clean tree, validates local JSON, rules, and index schemas
(rejecting non-empty `fieldOverrides` until automated readback supports them), captures
and re-verifies prior live state against concurrent drift, runs scoped emulator security
tests with strict Vitest JSON report validation (zero skipped tests allowed), and
publishes with the repository Firebase CLI:

```powershell
firebase deploy --only <target> --project temp-a1437 --non-interactive
```

`database` runs `vitest.security-emulator.config.ts` inside `firebase emulators:exec --only database`,
and `firestore:rules` runs `homeworkFirestoreRules.test.ts` inside `firebase emulators:exec --only firestore`.
Post-deploy readback is bounded and polled. RTDB rules and Firestore rulesets are
compared by SHA-256. Firestore composite indexes must be `READY`, with `__name__`
normalized before comparison. Record the prior ruleset or index state and use the
provider's native rollback or restore procedure if readback fails.

## Parallel-worktree localhost and spare workflow

The spare project is `luyentap-pdf-qa-20261021` and the spare upload Worker is
`luyentap-qualification-upload-signer`. Use the native commands below:

```powershell
npm.cmd run dev
npm.cmd run dev -- --port 5174
npm.cmd run dev -- --port auto
npm.cmd run build:spare
npm.cmd run preview:spare -- --port auto
node scripts/release-spare-readback.mjs http://localhost:<port>
```

Teacher checks conventionally use `http://localhost:5173/login` and student checks
use `http://localhost:5174/login`. `--port auto` chooses a dynamic ephemeral localhost
port for concurrent worktrees. `npm.cmd run dev` exposes `/__spare-dev-identity.json`
for live worktree/port/project inspection, while clean `npm.cmd run preview:spare` builds
expose `/__spare-preview-identity.json` verified by
`node scripts/release-spare-readback.mjs http://localhost:<port>` across any valid
`http://localhost:<port>` origin.

Use `npm.cmd run spare:sync-from-live -- [--dry-run | --confirm-spare-overwrite]` for
an explicit refresh from `temp-a1437` to the spare project. It is dry-run by default,
reads and validates all selected scopes (including Auth export) before any spare write,
synchronizes RTDB and Firestore and optionally Auth under bounded HTTP timeouts, reports
completed/remaining scopes on partial write failures, hard-forbids R2 or B2 object copy,
and preserves existing shared media URLs as read-only references.

Related procedures are in the [qualification foundation runbook](qualification-foundation-runbook.md)
and [native development guide](native-development.md).

## Recovery and escalation

A deployment failure must leave an operation record, prior provider version, exact
source revision, and the readback result. Verify live state before retrying. Use the
Hosting clone, Worker version promotion, or Firebase provider recovery appropriate to
the service. A recovery readback confirms provider state and does not authorize a new
release.
