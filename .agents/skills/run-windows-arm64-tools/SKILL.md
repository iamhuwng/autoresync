---
name: run-windows-arm64-tools
description: Run, diagnose, and resolve this repository's test, build, dev, browser, Firebase emulator, and Worker tooling failures on Windows ARM64.
---

# Run Windows ARM64 Tools

Use the repository-versioned harness contract. Contract version `3.1.0`, this
skill, and `scripts/harness/` must land in the same commit lineage.

## Fail-closed lineage preflight

Resolve the requested checkout with `git rev-parse --show-toplevel`. In that
exact root, require all of:

- this repository-local skill;
- `scripts/harness/contract.mjs`;
- `scripts/harness/run-tool.mjs`;
- `scripts/harness/run-isolated.mjs`;
- `scripts/harness/run-x64.ps1`;
- `scripts/harness/run-wsl-wrangler.mjs`.

Run `node scripts/harness/run-tool.mjs --contract` and require name
`luyentap-windows-arm64-harness`, version `3.1.0`, protocol `1`, and grammar
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

1. Read `failureCode`, `message`, and `remediation` from the evidence sidecar. If
   x64 Node failed before a sidecar could start, read `HARNESS_FAILURE <code>` and
   look up that code under `remediations` in `--contract`.
2. Follow the remediation actions in order. Inspect before changing state. Keep
   repository dependency repair explicit and limited to the selected project.
3. Obtain user authorization before machine-wide Node, Java, or WSL installation.
   Announce Playwright's user-cache browser download before running it. For cache
   corruption, prove the diagnosis with a fresh `CODEX_HARNESS_ROOT` before
   removing the exact validated cache entry.
4. Run the remediation's `verify` command, then rerun the original command. A
   successful doctor alone does not prove the requested product command passed.
5. Report the resolved requirement and both verification results. If external
   authority is still required, report the exact install/change, why it is needed,
   and the command that will verify it afterward.

Common recovery paths are executable contract data rather than duplicated prose:

- `BROWSER_RUNTIME_MISSING` routes through isolated `playwright install chromium`;
- `JAVA_PREREQUISITE_MISSING` requires JDK 21+ only for emulator commands;
- `WSL_PREREQUISITE_MISSING` requires an authorized WSL installation and WSL Node;
- native/cache failures first retry with a fresh isolated cache and never borrow
  repository `node_modules`;
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
- Immutable dependency caches may be shared only when the complete cache
  identity matches. Each invocation receives a unique writable source mirror
  and project-local dependency junction.
- Never install into, link from, or change repository `node_modules` or
  lockfiles to repair a harness failure.
- Prefer package scripts after confirming they route through `run-tool.mjs`.

## Evidence and result truth

Harness diagnostics use stderr. Tool stdout is preserved. Every started invocation
writes a JSON evidence sidecar and prints its `HARNESS_EVIDENCE <path>` locator
with concise diagnostics to stderr. The record identifies contract/protocol, command/cwd/project,
source commit and dirty fingerprint, Node architecture/version/ABI, immutable
dependency cache, unique execution workspace, exit code, and classification.

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
