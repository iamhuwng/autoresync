---
name: release-safety
description: Use this skill when preparing, assessing, deploying, recovering, or verifying a LuyenTap release across Hosting, Cloudflare Workers, Firebase rules, indexes, or the spare project.
---

# LuyenTap release safety

Use the executable workflows and scripts as the authority. The root
[AGENTS.md](../../../AGENTS.md) is the single canonical instruction file for every
agent. Read [release-safety.md](../../../documentation/system/release-safety.md),
[local-live-deployment.md](../../../documentation/system/local-live-deployment.md),
and the infrastructure rules before making deployed-state claims.

## Hosting

Start with a clean checkout and current live observation:

```powershell
git status --short --branch
npm run tooling:doctor
node scripts/release-check.mjs --mode release --target hosting --base <live_sha> --observe-hosting --env-fingerprint <production-env-sha256> --json
```

Running `scripts/release-check.mjs --mode release --target hosting --observe-hosting`
locally without `--env-fingerprint <sha256>` (and `~/.luyentap/env/.env.production` or
`--production-env-file` when backend dependency probes run) emits `UNVERIFIED` because no
production environment fingerprint is bound. Pass `--env-fingerprint <sha256>` locally or
use the CI `operation=plan` dispatch in `.github/workflows/release-promotion-phase3.yml`.

Routine protected-main publication is the manual `publish` operation in
`.github/workflows/release-promotion-phase3.yml`. It observes the manifest, runs the
scoped check, builds once, reads back `http://localhost:5173`, asserts the artifact,
and publishes with:

```powershell
npm run build:production
npm run deploy:hosting -- --deploy-built
```

The bounded Hosting readback polls for up to 90 seconds. Roll back with:

```powershell
firebase hosting:clone temp-a1437:kahut1@<prior-version-id> temp-a1437:kahut1:live --project temp-a1437
```

Resume an interrupted readback without redeploying:

```powershell
npm run release:verify-existing -- --operation-id <uuid> --expected-revision <40-hex-sha>
```

The first manifest-bearing bootstrap is build-only:

```powershell
npm run build:production -- --build-only
```

Local mutating `npm run deploy:hosting` runs require protected `origin/main`.
Intentional hotfix checkouts must pass `--allow-non-main`.

Use `scripts/hotfix-prepare.mjs` for a clean live-based hotfix checkout.

Hosting preflight runs one live manifest observation during `publish`, then uses
lightweight provider-version and manifest-fingerprint checks before mutation. RTDB
rules readback (`/.settings/rules.json`) is decoupled from Hosting `publish`, `plan`,
and `health`, and is owned by `npm run deploy:rules`.

`LUYENTAP_RELEASE_CLOUDFLARE_READ_TOKEN` uses the minimum read-only Cloudflare Custom
API Token scopes and manual 90–365 day rotation documented in
[release safety](../../../documentation/system/release-safety.md#cloudflare-read-only-token-luyentap_release_cloudflare_read_token).

## Workers

Use the service-specific entry point:

```powershell
npm run deploy:worker -- --list
npm run deploy:worker -- <service> --dry-run
npm run deploy:worker -- <service>
```

The lifecycle restricts `--skip-tests`, `--allow-dirty`, and `--offline` to `--dry-run`.
Live production deploys (`environment: production`) verify that `HEAD` matches protected
`origin/main` (pass `--allow-non-main` only for intentional hotfixes), while `--dry-run`
and the spare Worker (`luyentap-qualification-upload-signer`) remain allowed on feature
branches. Live deploys require a clean tree, targeted Vitest, `wrangler deploy --dry-run` with
`CLOUDFLARE_ACCOUNT_ID` pinned, `wrangler whoami --json` account verification,
prior-version capture with `readProviderState`, `wrangler versions upload`,
pre-promotion live-drift re-check, `wrangler versions deploy <id>@100%`,
version-addressed module hash readback, and a safe no-write `OPTIONS` probe. Roll back
from the repository root with:

```powershell
node scripts/tooling-where.mjs --exec <wrangler-tool> versions deploy <priorVersion>@100% --config <package>/<config> --message rollback:<priorVersion> --yes
```

The deployable services are `luyentap-book-pdf-prod`, `r2-upload-signer`, `r2-backup-worker`,
`luyentap-notification-command`, `thcs-gemma`, and
`luyentap-qualification-upload-signer`. `luyentap-notification-firestore-qa` is a
`deployable: false` external-DO public-entry proxy and is blocked from generic
overwrite. `luyentap-notification-command` uses `notification-command-entry.js`,
and its `OPTIONS` probe targets `/session-notifications/action`.

## Firebase rules and indexes

Use the scoped entry point:

```powershell
npm run deploy:rules -- --dry-run --only database
npm run deploy:rules -- --only firestore:rules
npm run deploy:rules -- --only firestore:indexes
npm run deploy:rules -- --all
```

The lifecycle restricts `--skip-tests`, `--allow-dirty`, and `--offline` to `--dry-run`,
requires `HEAD` to match protected `origin/main` on live non-`--dry-run` deploys (pass
`--allow-non-main` only for intentional hotfixes; `--dry-run` stays allowed on feature
branches), validates local schemas (rejecting non-empty `fieldOverrides`), runs both `database` and
`firestore:rules` suites inside `firebase emulators:exec` with zero-skip Vitest report
validation, captures and re-verifies prior state against concurrent drift, deploys with
the repository Firebase CLI to `temp-a1437`, and polls readback. Compare RTDB and
Firestore rulesets by SHA-256. Require composite indexes to be `READY`, normalizing
`__name__` before comparison.

To restore a known-good checked-out rules revision, pass the explicit non-main opt-in
because the guard otherwise requires protected `origin/main`:

```powershell
git checkout <known-good-revision>
node scripts/deploy-firebase-rules.mjs --only <target> --allow-non-main
```

## Spare and parallel worktrees

Use the spare project `luyentap-pdf-qa-20261021` and Worker
`luyentap-qualification-upload-signer`:

```powershell
npm.cmd run dev
npm.cmd run dev -- --port 5174
npm.cmd run dev -- --port auto
npm.cmd run build:spare
npm.cmd run preview:spare -- --port auto
node scripts/release-spare-readback.mjs http://localhost:<port>
npm.cmd run spare:sync-from-live -- [--dry-run | --confirm-spare-overwrite]
npm.cmd run spare:provision-dev-accounts
```

`--port auto` selects the first free port from the whitelisted `5173–5182` localhost
pool. The spare `luyentap-qualification-upload-signer` CORS policy supports that pool
without loosening production `r2-upload-signer`.

Spare sync is dry-run by default, reads selected RTDB and Firestore scopes before any
spare write, uses bounded timeouts for Firestore HTTP requests, reports
completed/remaining scopes on partial failure, and refreshes RTDB and Firestore from
`temp-a1437`. Auth is opt-in with `--only auth` and exports only for a confirmed sync
using `--confirm-spare-overwrite`. The command forbids R2 or B2 object copy and
preserves shared media URLs as read-only references. `spare:sync-from-live` uses
Firebase CLI `database:get` and `database:set` for RTDB, strips `passwordHash` and
`salt` before `auth:import`, and performs upsert-only Firestore writes that preserve
existing spare-only documents. After a confirmed RTDB sync, run
`npm.cmd run spare:provision-dev-accounts` to restore the disposable spare Dev Quick
Login Auth credentials and `/users/{uid}` profiles. The helper hard-refuses
`temp-a1437`. `npm.cmd run dev` exposes
`/__spare-dev-identity.json` for live inspection, while `release-spare-readback.mjs`
verifies `/__spare-preview-identity.json` on clean `preview:spare` builds across any
valid localhost port.

## Adaptive verification and self-judgment

Select tests proportionate to the changed surface and choose the appropriate spare
localhost path. Verify a development server with `/__spare-dev-identity.json` from
`npm.cmd run dev`, or verify a `preview:spare` build with
`node scripts/release-spare-readback.mjs http://localhost:<port>`. Capture a screenshot
or short video for UI, layout, or transition flows when browser automation can drive
them. When third-party OAuth such as Google Sign-In blocks a headless browser, record
an explicit operator-confirmed verification note. Make an explicit self-judgment or
peer-agent judgment pass against user expectations and presentation. If behavior or
presentation differs, fix it and re-verify before deployment.

## Stop conditions

Treat `BLOCKED`, `UNVERIFIED`, and `REVIEW_REQUIRED` as preparation states. Report
the missing evidence, affected service, prior provider version, deployment order, and
recovery command. Local tests and dry-runs do not establish deployed state. Store
dated evidence in `documentation/release-audits/`.
