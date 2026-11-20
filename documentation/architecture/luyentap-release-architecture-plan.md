# LuyenTap release architecture plan

This plan is the concise source of truth for the three-PR deployment architecture.
Executable workflows and scripts define behavior. The root [AGENTS.md](../../AGENTS.md)
is the single canonical instruction file for every agent. Dated measurements and
release records remain in [`documentation/release-audits/`](../release-audits/).

## Objectives

- Keep source, build input, artifact, provider state, authorization, and recovery
  boundaries explicit.
- Select checks from the changed service instead of replaying a universal ceremony.
- Keep Hosting publication serialized and independently readable after mutation.
- Give Worker and Firebase rules/index releases their own native lifecycle and
  rollback evidence.
- Keep local and spare qualification isolated from production data and objects.

## Three-PR architecture

### Hosting publication

`.github/workflows/release-promotion-phase3.yml` is a manual dispatch on protected
`refs/heads/main`. `health` and `plan` use the read-only `preflight` job and
`luyentap-hosting-read-only`. `publish` is the only serialized Hosting writer under
`luyentap-hosting-production`. It federates through OIDC, observes the live manifest,
runs the scoped Hosting release check, builds once, reads the artifact over localhost,
publishes with `npm run deploy:hosting -- --deploy-built`, and polls readback for up to
90 seconds. `verify-existing` performs read-only recovery and never rebuilds or
redeploys.

The production summary reports the site URL, source SHA, manifest SHA-256, operation,
prior and live versions, and verified files. It includes native Hosting clone rollback
and `npm run release:verify-existing -- --operation-id <uuid>` recovery commands.

Routine frontend-only `target: hosting` changes on protected `main` use the scoped
checker without a manual review-card JSON file. `target: all`, changed backend paths,
and hotfixes retain compatibility review and service-specific gates. The first
manifest-bearing release uses `npm run build:production -- --build-only`.

### Worker publication

`npm run deploy:worker -- <service>` calls `scripts/deploy-worker.mjs` (`--list` lists registered services). Deployable services are
`r2-upload-signer`, `r2-backup-worker`, `luyentap-notification-command`, `thcs-gemma`,
and the spare `luyentap-qualification-upload-signer`. Their configs are respectively
`cloudflare/wrangler.jsonc`, `r2-backup-worker/wrangler.toml`,
`cloudflare/wrangler.notifications.jsonc`, `cloudflare/wrangler.thcs-gemma.jsonc`,
and `cloudflare/wrangler.qualification.jsonc`.

`luyentap-notification-firestore-qa` is marked `deployable: false`. It is an
external-DO public-entry proxy and cannot be generically overwritten. Worker release
restricts `--skip-tests`, `--allow-dirty`, and `--offline` to `--dry-run`, pins
`CLOUDFLARE_ACCOUNT_ID`, verifies the authenticated Wrangler account via `whoami`, runs
clean-tree checks, targeted Vitest, Wrangler dry-run, prior-version capture, version
upload, pre-promotion drift re-check, 100% promotion, version-addressed module hash
readback, and a safe `OPTIONS` probe. The exact prior-version rollback is
`node scripts/tooling-where.mjs --exec <wrangler-tool> versions deploy <priorVersion>@100% --config <package>/<config> --message rollback:<priorVersion> --yes`.

### Firebase rules and indexes

`npm run deploy:rules` calls `scripts/deploy-firebase-rules.mjs`. It accepts
`--only database`, `--only firestore:rules`, `--only firestore:indexes`, or `--all`,
with `--dry-run` (restricting `--skip-tests`, `--allow-dirty`, and `--offline` to
`--dry-run`). The script validates local schemas (rejecting non-empty `fieldOverrides`),
runs both `database` and `firestore:rules` suites inside Firebase emulators (`emulators:exec`)
with strict zero-skip Vitest JSON report validation, captures and re-verifies live state
against concurrent drift before deploy, deploys to `temp-a1437`, and polls readback.
RTDB and Firestore rules use SHA-256 comparison. Composite indexes require `READY` state
with `__name__` normalization.

## Local and spare qualification

Use the spare Firebase project `luyentap-pdf-qa-20261021`, the spare Worker
`luyentap-qualification-upload-signer`, and the localhost commands in the
[qualification foundation runbook](../system/qualification-foundation-runbook.md).
Parallel worktrees use `npm.cmd run dev -- --port auto` and
`npm.cmd run preview:spare -- --port auto`. `npm.cmd run dev` serves
`/__spare-dev-identity.json` for live worktree/port/project inspection, while clean
`npm.cmd run preview:spare` builds serve `/__spare-preview-identity.json` verified with
`scripts/release-spare-readback.mjs`.

`npm.cmd run spare:sync-from-live -- [--dry-run | --confirm-spare-overwrite]` is the
explicit RTDB, Firestore, and optional Auth refresh from `temp-a1437` to the spare.
It is dry-run by default, reads and validates all selected scopes before any spare write,
enforces HTTP request timeouts, reports completed/remaining scopes on partial write
failure, forbids R2 and B2 object copy, and keeps existing shared media URLs read-only.
See the [native development guide](../system/native-development.md).

## Boundaries and evidence

Hosting checks probe only backend services whose files changed in `live_sha..HEAD`.
A local test, build, screenshot, or dry-run cannot establish deployed state. Each
mutating service release records its prior state and independently reads back the
published version. Production authorization remains the repository owner's boundary.
Dated evidence belongs in `documentation/release-audits/`, not in this active plan.

For the operating recipes, see [release safety](../system/release-safety.md) and
[integration and normal release selection](../system/integration-releases.md).
