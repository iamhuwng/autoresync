---
name: run-windows-arm64-tools
description: Run or diagnose this repository's test, build, dev, browser, Firebase emulator, and Worker tooling on Windows ARM64.
---

# Run Windows ARM64 Tools

Use the repository-versioned harness contract. Contract version `3.0.2`, this
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
`luyentap-windows-arm64-harness`, version `3.0.2`, protocol `1`, and grammar
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

Harness diagnostics use stderr. Tool stdout is preserved. Every invocation
writes a JSON evidence sidecar and prints only its `HARNESS_EVIDENCE <path>`
locator to stderr. The record identifies contract/protocol, command/cwd/project,
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
