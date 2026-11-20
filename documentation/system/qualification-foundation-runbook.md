# Persistent qualification foundation

The qualification foundation is isolated from production. It uses Firebase project
`luyentap-pdf-qa-20261021`, its Hosting site, and the spare Worker
`luyentap-qualification-upload-signer`. Shared public media URLs are read-only
references to existing R2 or B2 objects. A refresh may copy RTDB, Firestore, and
optionally Auth records, but it must never copy R2 or B2 objects.

The root [AGENTS.md](../../AGENTS.md) is the single canonical instruction file for
every agent. Keep dated setup and verification evidence in
[`documentation/release-audits/`](../release-audits/).

## Routine localhost qualification

Run the spare-service teacher site at `http://localhost:5173/login`:

```powershell
npm.cmd run dev
```

Run an independent student session on port 5174:

```powershell
npm.cmd run dev -- --port 5174
```

For parallel worktrees, use a dynamic localhost port:

```powershell
npm.cmd run dev -- --port auto
```

Build and preview the spare artifact with:

```powershell
npm.cmd run build:spare
npm.cmd run preview:spare -- --port auto
```

The launcher verifies the spare Firebase project and backend identity. `npm.cmd run dev`
exposes `/__spare-dev-identity.json` for live worktree, port, and project inspection,
while a clean `npm.cmd run build:spare` plus `npm.cmd run preview:spare` exposes
`/__spare-preview-identity.json`. Verify the spare preview on any localhost port with:

```powershell
node scripts/release-spare-readback.mjs http://localhost:<port>
```

Use approved spare accounts and start authenticated checks at `/login`. Keep Firebase
Auth, RTDB, Firestore, and Worker traffic in the spare environment. Existing shared
media URLs may be read for fixtures. Do not use production endpoints as a fallback.

See the [native development guide](native-development.md) and the [release safety
workflow](release-safety.md#adaptive-verification-and-self-judgment).

## Deployed-origin checks on the spare project

Use the stable spare Hosting origin when the journey depends on deployed rewrites,
headers, redirects, or hosted callbacks. For an isolated candidate origin, create a
uniquely named disposable Hosting channel, record its project, site, and channel ID, and
read back its deployed `dist/.well-known/luyentap-release.json` manifest (from a clean
`npm.cmd run build:production`) and listed files via
`scripts/release-spare-readback.mjs` before the journey (`dist-spare/` is reserved for
localhost `preview:spare`). Delete that exact channel and verify its absence after the
run.

A Hosting preview isolates frontend bytes only. Serialize changes to shared spare
rules and Worker versions. Add only the exact temporary localhost or channel origin
to the spare Worker allowlist, then remove it during cleanup. Retain the cleanup
ledger through failures.

## Spare data refresh

Use this explicit command when a scenario needs current live data:

```powershell
npm.cmd run spare:sync-from-live -- [--dry-run | --confirm-spare-overwrite]
```

The default is dry-run. The confirmed operation refreshes RTDB and Firestore. Auth is
opt-in with `--only auth` and exports records only for a confirmed sync using
`--confirm-spare-overwrite`. RTDB synchronization runs through the repository
Firebase CLI with `database:get` and `database:set`. Auth synchronization strips
`passwordHash` and `salt` before importing into the spare project, and preserves
Google, UID, email, and profile parity without exposing live password hashes.
Firestore synchronization uses upsert-only writes, preserving existing spare-only
documents. The operation does not copy R2 or B2 objects and preserves existing shared
media URLs as read-only references. Verify project identity, affected records, and
Auth profiles before the journey.

`npm.cmd run build:spare` and `npm.cmd run preview:spare -- --port auto` are local
qualification tools. Production publication follows the [routine Hosting release](release-safety.md#routine-hosting-release).
