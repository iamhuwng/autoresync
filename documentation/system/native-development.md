# Native Windows x64 development

The root [AGENTS.md](../../AGENTS.md) is the single canonical instruction file for every agent.

Install the native x64 Node version pinned in [`.node-version`](../../.node-version)
with its bundled npm. Install dependencies from the checkout where you will work:

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd run dev
```

Open `http://localhost:5173/login` for the teacher flow. Use
`npm.cmd run dev -- --port 5174` for a student flow. Parallel worktrees use
`npm.cmd run dev -- --port auto`, which selects a dynamic localhost port. The spare
Firebase project is `luyentap-pdf-qa-20261021` and the designated spare Worker is
`luyentap-qualification-upload-signer`.

Build and preview the spare site with:

```powershell
npm.cmd run build:spare
npm.cmd run preview:spare -- --port auto
node scripts/release-spare-readback.mjs http://localhost:<port>
```

`npm.cmd run dev` exposes `/__spare-dev-identity.json` for live worktree, port, and
project inspection, while clean `npm.cmd run build:spare` plus `npm.cmd run preview:spare`
exposes `/__spare-preview-identity.json`. Verify the spare preview with
`node scripts/release-spare-readback.mjs http://localhost:<port>` at any valid
`http://localhost:<port>` origin. For release evidence, follow the
[spare preview checks](release-safety.md#agent-verification-handoff).

Refresh spare Firebase data explicitly with:

```powershell
npm.cmd run spare:sync-from-live -- [--dry-run | --confirm-spare-overwrite]
```

The command is dry-run by default. It may synchronize RTDB and Firestore and
optionally Auth from `temp-a1437` to the spare project. R2 and B2 object copy is
forbidden. Existing shared media URLs remain read-only references.

Use `npm.cmd run dev:emulators` for Firebase emulator work. Worker packages use their
own native dependencies and lockfiles. Production Hosting uses a separately approved
`dist/` artifact through the [routine Hosting release](release-safety.md#routine-hosting-release).
See the [qualification foundation runbook](qualification-foundation-runbook.md) for
spare isolation and cleanup.
