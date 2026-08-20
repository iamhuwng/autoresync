---
name: run-windows-arm64-tools
description: Run, diagnose, and resolve this repository's test, build, dev, browser, Firebase emulator, and Worker tooling failures on Windows ARM64.
---

# Run Windows ARM64 Tools

Use the repository-versioned harness contract. Contract version `3.6.0`, this
skill, and `scripts/harness/` must land in the same commit lineage.

## Fail-closed lineage preflight

Resolve the requested checkout with `git rev-parse --show-toplevel`. In that
exact root, require all of:

- this repository-local skill;
- `scripts/harness/contract.mjs`;
- `scripts/harness/run-tool.mjs`;
- `scripts/harness/run-isolated.mjs`;
- `scripts/harness/validate-evidence.mjs`;
- `scripts/harness/live-vite-doctor.mjs`;
- `scripts/harness/run-x64.ps1`;
- `scripts/harness/run-wsl-wrangler.mjs`.

Run `node scripts/harness/run-tool.mjs --contract` and require name
`luyentap-windows-arm64-harness`, version `3.6.0`, protocol `4`, dependency
cache protocol `3`, and grammar
`<tool> <project> [...args]`. If any file or value differs, report
`HARNESS_CONTRACT_MISMATCH` with the checkout root. Do not borrow a runner or
skill from another checkout or fall back to repository `node_modules`.

## Explicit project and capability preflight

The selected project is always explicit and must contain its own `package.json`
and `package-lock.json`:

```text
node scripts/harness/run-tool.mjs --doctor <project> [tool ...]
node scripts/harness/run-tool.mjs <tool> <project> [...args]
```

Doctor only checks requested or project-declared capabilities. It does not make
Playwright browsers, Java, Firebase, WSL, or Worker binaries mandatory for
unrelated Vite/Vitest work. A missing project dependency, lock entry, CLI,
native binary, browser, Java 21 runtime, or WSL boundary is a preflight failure;
do not start the requested tool.

## Resolve preflight failures

Treat doctor as the start of repair, not the completion condition. Continue until
doctor and the original command pass, or until resolution requires user authority
or an unavailable external prerequisite.

1. Read `failureCode`, `message`, `discovery`, and `remediation` from the evidence sidecar. If
   x64 Node failed before a sidecar could start, read `HARNESS_FAILURE <code>` and
   look up that code under `remediations` in `--contract`.
2. Follow the contract's fixed `discover → reuse → adapt → install → verify`
   sequence. Finish discovery across the named environment variables, PATH,
   standard locations, and tool-managed caches before changing state.
3. Reuse a compatible discovered resource first. Adapt only the harness process
   environment or selected WSL boundary when possible. Treat installation as the
   final fallback only after evidence records no compatible candidate.
4. Obtain user authorization before machine-wide Node, Java, or WSL installation.
   Announce Playwright's user-cache browser download before running it. Keep
   repository dependency repair explicit and limited to the selected project. For
   Windows dependency-cache corruption, prove the diagnosis with a fresh
   `CODEX_HARNESS_ROOT`; for Wrangler's WSL cache, use a fresh absolute Linux
   `CODEX_HARNESS_WSL_ROOT` before removing any exact validated cache entry.
5. Run every command in the remediation's `verify` stage, then rerun the original command. A
   successful doctor alone does not prove the requested product command passed.
6. Report discovered candidates, the selected resource and adaptation, and both
   verification results. If external
   authority is still required, report the exact install/change, why it is needed,
   and the command that will verify it afterward.

Common recovery paths are executable contract data rather than duplicated prose:

- `BROWSER_RUNTIME_MISSING` routes through isolated `playwright install chromium`;
- `JAVA_PREREQUISITE_MISSING` requires JDK 21+ only for emulator commands;
- `WSL_PREREQUISITE_MISSING` requires an authorized WSL installation and WSL Node;
- native/cache failures first retry with a fresh isolated cache and never borrow
  repository `node_modules`; Wrangler cache recovery uses only an absolute Linux
  `CODEX_HARNESS_WSL_ROOT`, never the Windows `CODEX_HARNESS_ROOT`;
- project dependency/lock failures repair only the explicitly selected package;
- `LIVE_WORKLOAD_REQUIRES_CHECKOUT` moves the watcher to the active checkout.

## Isolation and routing

- Architecture workaround scope follows the demonstrated native capability,
  not the tool family. Long-running/watch workloads must observe live source.
- Root `npm run dev` and `npm run preview` use the repository's normal Vite
  installation against the active checkout. Do not route them through a copied
  workspace; the harness rejects Vite dev/serve/preview and Vitest watch mode.
- Vite, Vitest, Vite Node, Playwright, and Firebase run with Windows x64 Node
  and dependencies installed from the selected project's lockfile only for
  explicit one-shot build/test/script commands.
- Wrangler always runs through WSL using the selected project's pinned version
  and the selected live worktree, including `wrangler dev`.
- Wrangler's immutable WSL cache is built from the selected package manifest and
  lockfile, exposed only to the Wrangler process while live source remains the
  selected checkout and repository `node_modules` remains untouched.
- Immutable dependency caches may be shared only when the complete cache
  identity matches. Each invocation receives a unique writable source mirror
  and project-local dependency junction.
- Never install into, link from, or change repository `node_modules` or
  lockfiles to repair a harness failure.
- Prefer package scripts after confirming they route through `run-tool.mjs`.

## Evidence and result truth

Harness diagnostics use stderr. Tool stdout is preserved. Every started invocation
atomically publishes and announces an `in_progress` JSON evidence sidecar before
dependency preparation, source mirroring, or tool work, then atomically marks it
`final` at completion. An interrupted in-progress sidecar is diagnostic only and
cannot be accepted as evidence. The record identifies contract/protocol, command/cwd/project,
source commit and dirty fingerprint, Node architecture/version/ABI, immutable
dependency cache, unique execution workspace, exit code, and classification.
Every sidecar also records phase timestamps/durations for dependency preparation,
source mirroring, capability/tool work, and finalization; `proof.phase` as `doctor`, `collection`, or
`execution`, plus protected selected-project state before and after for
`package.json`, `package-lock.json`, and `node_modules`. Playwright `test
--list` is collection only: it is not product execution and its product counts
stay zero/null. If protected state changes, the sidecar is a harness failure
(`PROTECTED_STATE_CHANGED`) and cannot be accepted as product evidence.

Validate evidence only from the sidecars themselves; do not retype claims from
terminal output:

```text
node scripts/harness/validate-evidence.mjs --expect-commit <full-sha> [--expect-clean] <sidecar...>
```

For a normal active-checkout Vite readiness check that never starts or manages a
server, use:

```text
node scripts/harness/live-vite-doctor.mjs <project> [--script <name>] [--url <http://localhost:port/path>]
```

It requires direct Vite package-script routing and project-local dependency
context. A `node_modules` link resolving outside the selected project is an
invalid context, not a cleanup target. With a URL, TCP listener and HTTP
response readiness are separate observations.

For `TOOL_TIMEOUT`, the final sidecar references a hash-verified bounded tail
artifact containing forwarded child output. Its content is never repeated in the
sidecar because tool output can contain secrets.
Timeout artifacts and sidecars are written with owner-only intent where the
platform supports it. They are sensitive local diagnostics: retain them only as
long as the investigation needs them, then manually remove the exact validated
cache root. The harness never deletes artifacts automatically.

Stable classifications are:

- `harness_preflight_failure`: prerequisites failed before tool startup;
- `harness_startup_failure`: native/transport startup failed;
- `harness_transport_failure`: isolated execution or declared-output transfer failed;
- `zero_tests_collected`: a test runner explicitly reported no tests;
- `product_failure`: the tool started and returned a non-zero product/test result;
- `completed`: the tool exited zero.

Do not convert a definition-only check, skipped branch, zero collection, startup
failure, or harness failure into a product pass/fail claim. Record discovered,
executed, failed, and skipped counts from the actual tool output when available;
the harness does not infer arbitrary assertions.
