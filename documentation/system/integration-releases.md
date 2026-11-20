# Integration and normal release selection

The three-PR architecture selects a release route from the changed files and the
observed live base. The root [AGENTS.md](../../AGENTS.md) is the single canonical
instruction file for every agent. Dated evidence remains in
[`documentation/release-audits/`](../release-audits/).

## Start with a release plan

Use a clean checkout and observe the current live Hosting manifest before assessing a
candidate. Protected `main` requires the **LuyenTap integration** check from
`.github/workflows/release-safety.yml`, and the Hosting workflow verifies that protected
`main`, `GITHUB_SHA`, the candidate tree, and remote `main` agree.
`scripts/release-check.mjs` compares the candidate with `live_sha..HEAD` and returns a
machine decision. The decision is preparation evidence, not production authorization.

Choose the smallest service route that protects the changed contract:

| Changed surface | Route |
| --- | --- |
| Frontend and static Hosting | Hosting release, production build, localhost readback, and proportionate browser or test evidence |
| Cloudflare Worker | `npm run deploy:worker -- <service>` (or `--list`) with Worker-specific tests, dry-run, version readback, and rollback state |
| RTDB rules | `npm run deploy:rules -- --only database` with RTDB `emulators:exec` security tests, zero-skip report validation, and RTDB hash readback |
| Firestore rules | `npm run deploy:rules -- --only firestore:rules` with Firestore `emulators:exec` `homeworkFirestoreRules.test.ts`, zero-skip report validation, and ruleset hash readback |
| Firestore indexes | `npm run deploy:rules -- --only firestore:indexes` with `READY` readback and `__name__` normalization |
| Coordinated frontend and backend | Backend readiness and compatibility evidence before activating the frontend consumer |

## Hosting publication scope

The Hosting publication workflow is `.github/workflows/release-promotion-phase3.yml`.
Manual dispatch on protected `refs/heads/main` uses read-only `health` and `plan`
preflight operations or the serialized `publish` operation. `publish` observes the
live manifest, runs:

```powershell
node scripts/release-check.mjs --mode release --target hosting --base <live_sha> --observe-hosting --env-fingerprint <production-env-sha256>
```

Running `scripts/release-check.mjs --mode release --target hosting --observe-hosting`
locally without `--env-fingerprint <sha256>` (and `~/.luyentap/env/.env.production` or
`--production-env-file` when backend dependency probes run) emits `UNVERIFIED` because no
production environment fingerprint is bound. Pass `--env-fingerprint <sha256>` locally or
dispatch read-only `operation=plan` on `.github/workflows/release-promotion-phase3.yml`.

The Hosting target probes only backend services whose files changed in `live_sha..HEAD`.
It builds once, reads the artifact over `http://localhost:5173`, asserts the Hosting
artifact, and publishes with:

```powershell
npm run deploy:hosting -- --deploy-built
```

Post-deploy readback uses bounded backoff for up to 90 seconds. The workflow summary
records the released URL, source SHA, manifest SHA-256, operation ID, prior version,
live version, and recovery commands. Use native Hosting clone for rollback and
`npm run release:verify-existing -- --operation-id <uuid>` for read-only recovery.

Routine frontend-only protected-main releases do not need a manual review-card JSON
file. `target: all`, changed hotfix paths, and coordinated backend changes retain
compatibility review and their service-specific release paths. `npm run
build:production -- --build-only` creates the first manifest-bearing artifact without
publishing it.

## Worker and rules ordering

Worker publication uses `scripts/deploy-worker.mjs` and the named Wrangler config for
the selected service. It pins `CLOUDFLARE_ACCOUNT_ID`, verifies the authenticated
Wrangler account, restricts `--skip-tests`/`--allow-dirty`/`--offline` to `--dry-run`,
verifies `HEAD` matches protected `origin/main` for live `production` deploys (with
`--allow-non-main` for intentional hotfixes, while keeping `--dry-run` and spare
`luyentap-qualification-upload-signer` allowed on feature branches),
captures and re-verifies prior live state before promotion, uploads a version, promotes
100% traffic, reads version-addressed module hashes, and runs a safe `OPTIONS` probe.
`luyentap-notification-firestore-qa` is a non-deployable external-DO public-entry
proxy and cannot be generically overwritten.

Rules and indexes publication uses `scripts/deploy-firebase-rules.mjs`. It validates
local schemas (rejecting non-empty `fieldOverrides`), runs `database` and `firestore:rules`
suites inside Firebase emulators (`emulators:exec`) with strict zero-skip Vitest report
validation, restricts `--skip-tests`/`--allow-dirty`/`--offline` to `--dry-run`,
verifies `HEAD` matches protected `origin/main` for live non-`--dry-run` deploys (with
`--allow-non-main` for intentional hotfixes, while keeping `--dry-run` allowed on feature
branches), captures and re-verifies prior state against concurrent drift, deploys to `temp-a1437`,
and polls native readback. Deploy additive rules or indexes before activating clients
that depend on them. A Worker or rules rollback does not reverse data writes or object
changes.

## Parallel local and spare work

Use `luyentap-pdf-qa-20261021` and `luyentap-qualification-upload-signer` for
non-production journeys. `npm.cmd run dev -- --port auto` and
`npm.cmd run preview:spare -- --port auto` support concurrent worktrees. `npm.cmd run dev`
serves `/__spare-dev-identity.json` for live worktree/port/project inspection, while clean
`npm.cmd run preview:spare` builds serve `/__spare-preview-identity.json` verified with
`node scripts/release-spare-readback.mjs http://localhost:<port>`.

Refresh spare data only when the journey requires it:

```powershell
npm.cmd run spare:sync-from-live -- [--dry-run | --confirm-spare-overwrite]
```

The command is dry-run by default, reads all selected scopes before writing, enforces
HTTP request timeouts, reports completed/remaining scopes on partial failure, syncs RTDB
and Firestore and optionally Auth from `temp-a1437`, forbids R2 and B2 object copy, and
preserves shared media URLs read-only. See the
[qualification foundation runbook](qualification-foundation-runbook.md) and
[native development guide](native-development.md).

## Evidence and recovery

A local test, build, dry-run, or screenshot establishes only its own proof class.
Current provider claims require direct Firebase or Cloudflare readback. Keep the
source revision, changed-service scope, prior version, deployment output, readback,
and rollback command together. Store dated records under
`documentation/release-audits/`.

See the [release safety workflow](release-safety.md#routine-hosting-release) for
operator commands and the [architecture plan](../architecture/luyentap-release-architecture-plan.md)
for boundaries.
