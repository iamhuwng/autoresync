---
name: luyentap-windows-arm64-harness-contract
description: Maintain or validate this repository's versioned Windows ARM64 harness contract, dispatcher, adapters, evidence, and regression suite. Use for changes under scripts/harness or its focused tests; ordinary tool execution uses the user-scoped run-windows-arm64-tools skill.
metadata:
  harness-name: "luyentap-windows-arm64-harness"
---

# Luyentap Windows ARM64 Harness Contract

This repository guidance has a distinct identity from the generic model-invoked
`run-windows-arm64-tools` skill. Executable authority lives in
`scripts/harness/contract.mjs`; do not copy its version or protocol into this
adapter.

Before changing or invoking the harness:

1. Run `node scripts/harness/run-tool.mjs --contract` and require a successful
   fail-closed repository authority check.
2. Run `node scripts/harness/skill-authority.mjs --tool <tool>` when actual Codex
   skill discovery and the selected execution boundary need proof.
3. Keep dispatcher, runner, WSL adapter, evidence validator, contract, and tests
   in one coherent generation. Bump the executable contract when semantics
   change; bump the dependency-cache protocol only when cache compatibility
   changes.
4. Use package scripts or `node scripts/harness/run-tool.mjs <tool> <project>
   [...args]`. Preflight only the requested capability and verify the original
   command after any repair.
5. Run focused tests plus `npm run test:harness`; zero collection, skipped proof,
   preflight success, or an earlier readiness layer is not product proof.

Windows checkout identity is authoritative for this repository. A declared WSL
runtime is an execution substrate for that same checkout, never an alternate
Git source.
