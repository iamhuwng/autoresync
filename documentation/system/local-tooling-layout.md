# Local Tooling Layout

This repository uses one predictable placement model so DevSpace, Codex, and
human shells do not create a new toolchain or dependency cache for every task.

## Placement contract

Repository-owned JavaScript dependencies live with the package whose lockfile
owns them:

- `node_modules/` — app, Vite, Vitest, Playwright package, and Firebase CLI.
- `cloudflare/node_modules/` — Cloudflare Worker test/runtime dependencies and
  the locked Wrangler version for that package.
- `r2-backup-worker/node_modules/` — backup Worker dependencies and its locked
  Wrangler version.
- `functions/node_modules/` — deprecated Firebase Functions package
  dependencies. Only exercise this package when the task actually touches it.

These directories are generated and ignored by Git. Their source of truth is
the matching `package.json` + `package-lock.json`, not an arbitrary global
installation.

Machine-level runtimes and reusable downloads stay outside the repo in one
shared location:

- Native Node: the machine installation selected by `PATH`.
- Windows ARM64 compatibility Node x64:
  `%CODEX_WINDOWS_TOOLS_ROOT%` when set, otherwise
  `%USERPROFILE%\.codex\tools\windows-arm64`.
- npm content cache: npm's normal user cache (currently
  `%LOCALAPPDATA%\npm-cache` on Windows).
- Firebase emulator JARs: `%USERPROFILE%\.cache\firebase\emulators`.
- Codex managed runtime: `%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime`.

Do not copy those shared runtimes into the repository or a worktree.

## DevSpace / ChatGPT agent access

When ChatGPT is working through the DevSpace plugin, the opened workspace is the
source checkout, but the DevSpace shell can also invoke approved machine-level
tools by absolute path. Do not make the agent guess those paths or use `npx` as
a discovery mechanism.

Call DevSpace `open_workspace` with `mode="checkout"` and reuse its returned
`workspaceId` for the conversation. `mode="worktree"` creates a fresh detached
checkout each time and is reserved for explicit parallel isolation.

From the opened repo workspace, use:

```text
npm run tooling:where -- node-x64
npm run tooling:where -- vite
npm run tooling:where -- vitest
npm run tooling:where -- cloudflare-vitest
npm run tooling:where -- cloudflare-wrangler
npm run tooling:where -- r2-vitest
npm run tooling:where -- r2-wrangler
npm run tooling:where -- firebase
```

`tooling:where` reports the owner, exact absolute path, expected runtime, whether
the target exists, and an invocation prefix. The agent should execute that path
through the DevSpace shell. DevSpace file `read` is for repository files and
advertised skill files; it is not the mechanism for locating arbitrary machine
binaries.

Repository scripts use the same stateless resolver in execution mode:

```text
node scripts/tooling-where.mjs --exec vitest run
node scripts/tooling-where.mjs --exec cloudflare-vitest run
```

Execution mode only launches an existing declared tool. It never installs a
runtime, creates a dependency cache, writes evidence, or copies source into a
harness run. The historical `scripts/harness/run-tool.mjs` is stateful and is
reserved for explicit audit/deployment/security workflows that require its
evidence machinery; it is not part of ordinary resolver execution.

Guarded Hosting deployment uses this same stateless Firebase CLI route after
its source, environment, bundle and remote-state checks. It must not install a
second dependency tree merely to publish the checked build.

If a tool is not listed, inspect the owning package manifest/lockfile and extend
`tooling:where` rather than installing a one-off global copy or creating a new
cache root.

## Before installing anything

Run:

```text
npm run tooling:doctor
```

The doctor is read-only. It reports missing repo-owned dependencies and flags
known duplicate/stale locations.

`npm ci --no-audit --no-fund` is approved provisioning, not ordinary tool
resolution. Run it only after explicit approval, from this canonical
Windows-authoritative checkout, for a missing dependency tree whose selected
runtime supports the package. Do not run it from a managed worktree or from a
WSL copy of the checkout.

On this Windows ARM64 project, Cloudflare/workerd packages require the approved
Windows x64 Node helper. Put that helper directory first on `PATH` and invoke
its npm CLI when materializing `cloudflare/node_modules` or
`r2-backup-worker/node_modules`. Do not create a second x64 Node distribution
or a new per-run dependency cache. A legacy `CODEX_X64_NODE` override that
points elsewhere should be repointed to the canonical helper or removed before
that older directory is deleted.

This route is version-bound: the Cloudflare lockfile pins workerd 1.20260617.1
and the R2 lockfile pins 1.20260302.0; the inspected Cloudflare loader for the
locked package does not select a Windows ARM64 binary. Reassess this exception
when either lockfile changes, using a representative Worker test before
retiring the x64 route.

WSL may map this checkout for inspection, but it is only an execution adapter.
Cloudflare Worker/Vitest/Wrangler commands must execute from the Windows shell
with the approved Windows x64 Node helper against this Windows-authoritative
checkout. Do not install Linux dependencies or run those Worker commands from
WSL; the stateless resolver refuses that boundary instead of inventing a
`/home/...` runtime.

For ordinary local execution, do not use a package script merely because it
routes through the historical `scripts/harness/run-tool.mjs` cache layer.
Resolve the tool with `npm run tooling:where -- <tool>` and invoke the declared
local entry directly (or with the canonical x64 Node path reported by the
locator when this repository declares that route). Load the user-scoped
`run-windows-arm64-tools` skill only for an actual architecture boundary: a
repository-declared architecture-specific route or an architecture/native-
binding/loader failure. The historical harness can recreate
`%LOCALAPPDATA%\\codex-harness-v3` dependency copies.

Ordinary package scripts use `tooling-where.mjs --exec`. The evidence dispatcher
requires an explicit `--audit` for execution; contract inspection and doctor
remain available without running a product command. Generic skill revisions
are informational and do not gate repository evidence.

Copied checkouts and older worktrees can retain the retired dispatcher even
after the canonical checkout is updated. Inspect the actual package script
before execution there. Reuse the canonical resolver with the selected
checkout's cwd/configuration and compatible lockfile; do not assume that an
`npm test` script is stateless. If a failed command starts installing a harness
dependency tree, stop that route and classify the failure before retrying.

For a nested source checkout without its own root dependencies, the stateless
resolver can use Node's installed ancestor packages only when the lockfile is
byte-identical and dependency declarations match. This preserves the selected
source/configuration/cwd without installing or linking another dependency tree.
Different locks or declarations remain missing-tool errors.

Retained Wrangler audits run Windows x64 against the live checkout and the
selected package's existing dependencies. They create evidence/run receipts,
but no source snapshot, dependency installation, or WSL environment. Other
explicit audit tools retain their declared snapshot/cache requirements.

Audit evidence fingerprints source before execution and checks protected
package/lockfile/dependency-path state afterward. It does not compare all source
again afterward or recursively hash live Wrangler dependencies. Keep the
forwarded command output with its sidecar; validated failure evidence is not a
successful command outcome. This establishes local proof, not remote state.

The legacy `functions/package.json` still declares Node 18. Treat that as a
legacy package constraint; do not silently change its engine or provision a
new runtime unless work on that package requires it.

## Worktrees

A worktree is source isolation, not a reason to retain another permanent
toolchain.

- Remove task worktrees when the task is finished.
- Prefer Codex Local for ordinary implementation and verification. Use a
  worktree only when concurrent source isolation is required.
- Do not install dependencies into a managed worktree just to make an ordinary
  check runnable. If the task must run in an isolated worktree and its
  manifests/lockfiles differ from the canonical checkout, keep its dependency
  tree isolated and provision it only when applicable repository or user
  authorization explicitly covers that installation; otherwise use Local when
  its dependencies are valid or report the missing prerequisite.
- Prefer a junction/symlink to an existing dependency tree only when the
  relevant `package.json` and `package-lock.json` are byte-for-byte
  compatible.
- Remove any authorized isolated dependency tree with its worktree when the
  task is finished.
- Retire task-owned release/verification copies and their generated caches
  after the owning task preserves its source and unique evidence. Dependency
  junctions save package space, but retained source/build copies still occupy
  disk. Keep candidates belonging to active tasks.
- Never borrow a global Wrangler/Firebase binary to make a worktree pass.
  Resolve the locked repo dependency instead.

## Cleanup policy

For unexplained disk, memory/process, WSL, crash-dump, or cross-tool cache pressure,
use the user-scoped `recover-windows-dev-resources` skill to attribute the host
pressure before deleting anything. This section remains the repository-specific
placement/cleanup policy.

High-confidence cleanup candidates are generated locations, not source:

- Legacy `%LOCALAPPDATA%\codex-harness-v3` dependency caches after confirming
  there is no active harness owner.
- Leftover
  `%USERPROFILE%\.cache\codex-runtimes\codex-runtime-install-*` directories
  after closing Codex/DevSpace sessions that could still be installing.
- Inactive Codex/DevSpace worktrees, especially those containing real
  `node_modules` trees instead of links.
- Global `wrangler` and `firebase-tools` installations when this repository
  is the only reason they were installed; the repo already pins local versions.

Keep the npm cache and Firebase emulator cache unless disk pressure is severe:
they are shared caches that prevent repeated downloads. Keep
`codex-primary-runtime`, the Windows x64 compatibility Node helper, and the
global Codex installation.
