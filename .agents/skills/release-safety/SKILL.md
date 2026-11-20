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
node scripts/release-check.mjs --mode release --target hosting --base <live_sha> --observe-hosting --json
```

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
npm run release:verify-existing -- --operation-id <uuid>
```

The first manifest-bearing bootstrap is build-only:

```powershell
npm run build:production -- --build-only
```

Use `scripts/hotfix-prepare.mjs` for a clean live-based hotfix checkout.

## Workers

Use the service-specific entry point:

```powershell
npm run deploy:worker -- --list
npm run deploy:worker -- <service> --dry-run
npm run deploy:worker -- <service>
```

The lifecycle restricts `--skip-tests`, `--allow-dirty`, and `--offline` to `--dry-run`.
Live deploys require a clean tree, targeted Vitest, `wrangler deploy --dry-run` with
`CLOUDFLARE_ACCOUNT_ID` pinned, `wrangler whoami --json` account verification,
prior-version capture with `readProviderState`, `wrangler versions upload`,
pre-promotion live-drift re-check, `wrangler versions deploy <id>@100%`,
version-addressed module hash readback, and a safe no-write `OPTIONS` probe. Roll back
from the repository root with:

```powershell
node scripts/tooling-where.mjs --exec <wrangler-tool> versions deploy <priorVersion>@100% --config <package>/<config> --message rollback:<priorVersion> --yes
```

The deployable services are `r2-upload-signer`, `r2-backup-worker`,
`luyentap-notification-command`, `thcs-gemma`, and
`luyentap-qualification-upload-signer`. `luyentap-notification-firestore-qa` is a
`deployable: false` external-DO public-entry proxy and is blocked from generic
overwrite.

## Firebase rules and indexes

Use the scoped entry point:

```powershell
npm run deploy:rules -- --dry-run --only database
npm run deploy:rules -- --only firestore:rules
npm run deploy:rules -- --only firestore:indexes
npm run deploy:rules -- --all
```

The lifecycle restricts `--skip-tests`, `--allow-dirty`, and `--offline` to `--dry-run`,
validates local schemas (rejecting non-empty `fieldOverrides`), runs both `database` and
`firestore:rules` suites inside `firebase emulators:exec` with zero-skip Vitest report
validation, captures and re-verifies prior state against concurrent drift, deploys with
the repository Firebase CLI to `temp-a1437`, and polls readback. Compare RTDB and
Firestore rulesets by SHA-256. Require composite indexes to be `READY`, normalizing
`__name__` before comparison.

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
```

Spare sync is dry-run by default, reads all selected scopes before any spare write,
enforces HTTP timeouts, reports completed/remaining scopes on partial failure, refreshes
RTDB and Firestore and optionally Auth from `temp-a1437`, forbids R2 or B2 object copy,
and preserves shared media URLs as read-only references. `npm.cmd run dev` exposes
`/__spare-dev-identity.json` for live inspection, while `release-spare-readback.mjs`
verifies `/__spare-preview-identity.json` on clean `preview:spare` builds across any
valid localhost port.

## Stop conditions

Treat `BLOCKED`, `UNVERIFIED`, and `REVIEW_REQUIRED` as preparation states. Report
the missing evidence, affected service, prior provider version, deployment order, and
recovery command. Local tests and dry-runs do not establish deployed state. Store
dated evidence in `documentation/release-audits/`.
