# Local tooling layout

The [native development guide](native-development.md) covers first-time setup
and running the spare site. This reference explains where tools and settings
live, how to diagnose a worktree, and what the cleanup commands do.

## Package ownership

Each package installs dependencies from its own `package-lock.json`. Git ignores
the resulting `node_modules` directories.

| Package directory | Installed tools and dependencies |
| --- | --- |
| Repository root | Web app, Vite, Vitest, Playwright CLI, and Firebase CLI |
| `cloudflare/` | Upload Worker, Wrangler, and its Worker tests |
| `r2-backup-worker/` | Backup Worker, its Wrangler version, and its tests |
| `functions/` | Legacy Firebase Functions. This package declares Node 18 and is used for work on those Functions. |

From the repository root, install the root package for web app work. Install
the relevant nested package for Worker work.

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd --prefix cloudflare ci --no-audit --no-fund
npm.cmd --prefix r2-backup-worker ci --no-audit --no-fund
```

## Native runtime and worktree identity

The pinned Node version is recorded in .node-version and used by GitHub Actions.
Confirm the active checkout and runtime before provisioning or testing.

    git rev-parse --show-toplevel
    git status --short --branch
    git worktree list --porcelain
    node -p "process.execPath + ' ' + process.version + ' ' + process.arch"
    npm.cmd --version
    npm.cmd run tooling:doctor

A worktree owns its source, manifests, lockfiles, and generated package
directories. It can share the native runtime and npm download cache. Install a
package in a worktree only when that isolated dependency tree is required and
authorized. Preserve source changes and evidence before removing the worktree
through Git.

## Tool lookup and execution

`tooling:where` prints the owning package, absolute path, and whether the tool
exists. With `--exec` it launches the installed tool with native Node and passes
through the arguments and exit code. It preserves the calling directory.

```powershell
npm.cmd run tooling:where -- node-native vite vitest firebase
npm.cmd run tooling:where -- cloudflare-wrangler cloudflare-vitest
npm.cmd run tooling:where -- r2-wrangler r2-vitest
node scripts/tooling-where.mjs --exec vitest run
npm.cmd --prefix cloudflare test
npm.cmd --prefix r2-backup-worker test
```

For tests limited to a particular package, its own npm script supplies the
working directory and picks up its own test configuration. For a running
local app, check the actual HTTP route as well as whether a port is listening.

```powershell
(Invoke-WebRequest http://localhost:5173/login).StatusCode
```

## Settings, builds, and shared downloads

- `npm run dev` loads public settings for the configured spare Firebase
  project. `npm run build:spare` writes `dist-spare/` for local previews.
  Production Hosting uses `dist/` through the release workflow.
- The optional emulator-based app uses native Java 21, the checkout's Firebase
  CLI, and the ignored `cloudflare/tmp/.dev.vars` for its local Workers.
  Local Firebase snapshots live under `tmp/local-firebase/` in the checkout.
- Shared app environment files default to `%USERPROFILE%\.luyentap\env`, with
  `LUYENTAP_ENV_DIR` available to select another directory. The spare
  launcher uses an isolated configuration. The guarded production build reads
  its own `.env.production` or the file designated by
  `LUYENTAP_PRODUCTION_ENV_FILE`. Keep private configuration out of Git.
- npm's reusable download cache is shown by `npm.cmd config get cache`.
  Firebase emulator downloads use `%USERPROFILE%\.cache\firebase\emulators`.
  Playwright downloads browsers into its user cache by default and supports
  `PLAYWRIGHT_BROWSERS_PATH` for a separate location. These are shared
  downloads, separate from each checkout's installed packages.

## Operational ownership and agent access

The package layout is also the toolchain boundary. An agent or shell working through Codex or DevSpace must open the checkout that owns the source being tested. Checkout mode is the normal mode. Worktree mode is reserved for parallel source isolation.

The active checkout must own the package manifest, lockfile, and installed package directory used by the command. Do not make an agent guess a machine binary path, use npx as discovery, or borrow a global CLI. Use tooling:where to report the package-owned absolute entry point.

## Provisioning boundary

The tooling doctor is read-only. It reports missing tools and does not install anything. npm ci is provisioning. Run it only for the package that needs the dependency tree and only after reviewing the manifest and lockfile.

A fresh checkout may have no node_modules. That is a missing dependency tree, not permission to install a global replacement. A nested package has its own provisioning command and its own lockfile. Do not use a root package to satisfy a Cloudflare or R2 package.

The legacy Functions package remains a separate Node 18 boundary. Do not change its engine or install it as part of frontend or Worker work.

## Worktree safety

Before a command in a worktree, record:

    git rev-parse --show-toplevel
    git status --short --branch
    git worktree list --porcelain

Do not install a dependency tree into a worktree merely to make an ordinary check runnable. If the worktree is the selected source for an isolated audit, the package and lockfile must be checked there and its generated dependency tree must remain inside that package. Preserve source changes and evidence before removing the worktree through Git.

## Audit boundary

Ordinary commands use the stateless resolver. Audit commands use the evidence dispatcher. The audit runner can snapshot source for tools that require a snapshot and can retain a live source path for Wrangler audits. It records the source revision, dirty state, runtime, package state, execution workspace, proof counts, exit code, classification, and sidecar path.

An audit sidecar is local proof. It does not prove a deployed Worker, Firebase project, R2 object, or Hosting state. Provider readback and the release workflow supply those claims. Validate a retained sidecar with:

    node scripts/harness/validate-evidence.mjs evidence-sidecar.json

Do not treat a successful command with zero collected tests, a startup failure, or a stale sidecar as product proof. Keep command output and the sidecar together when the evidence is used in a review.

## Audit invocation

Inspect the audit contract before using the evidence dispatcher.

    npm.cmd run harness:contract
    node scripts/harness/run-tool.mjs --audit --doctor cloudflare wrangler
    node scripts/harness/run-tool.mjs --audit wrangler cloudflare --version
    node scripts/harness/validate-evidence.mjs evidence-sidecar.json

Ordinary commands use tooling-where --exec. Audit commands record source
identity, runtime, package state, execution workspace, proof counts, exit code,
classification, and a sidecar. Wrangler audits use the active checkout and its
Cloudflare package. A sidecar is local evidence. Provider readback and the
release workflow are required for deployed-state claims.

## Configuration and shared downloads

The spare launcher obtains the public Firebase configuration from the isolated spare site and rejects a different project. It discards inherited VITE values. The emulator launcher uses the ignored Worker secret file and local Firebase snapshots. Production configuration remains in the separate production environment file.

The npm cache, Firebase emulator downloads, Playwright browser downloads, and Codex runtime are shared machine resources. They are not package dependencies and must not be copied into a checkout.

## Cleanup

Cleanup is for generated audit runs, dependency caches, timeout artifacts, build output, emulator snapshots, and inactive worktrees. It is not for source, manifests, lockfiles, secrets, or evidence still needed by an active release.

The cleanup command defaults to a dry run and uses a 48-hour age threshold:

    npm.cmd run harness:cleanup
    npm.cmd run harness:cleanup -- --runs-only

Review the dry-run report before applying cleanup. The default age threshold is 48 hours. Active or locked dependency caches are protected.

    npm.cmd run harness:cleanup:apply

Keep operation records, release receipts, verification bundles, and sidecars until their owning review or release is complete.
