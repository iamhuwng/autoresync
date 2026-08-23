# #126 production-normal local reproduction — 2026-08-23

Status: `LOCAL_RULE_ENFORCED_PASS_REMOTE_PROOF_BLOCKED`

## Source and invariant

- Tested source: `36ce82eb784c02d35e1b499e182e2ebcaca92d9f` on the unchanged PRD0062 lineage.
- The committed assignment and recipient row were preserved.
- No assignment command was replayed and no remote Firebase, R2, Cloudflare, or deployment state was mutated.

## Production-shaped command

```text
node scripts/harness/run-tool.mjs firebase . emulators:exec --only database,firestore "node node_modules/vitest/vitest.mjs run --config cloudflare/vitest.prd0062-m1-rule-enforced-composition.config.mjs --reporter=verbose --passWithNoTests=false --maxWorkers=1 cloudflare/test/prd0062-m1-rule-enforced-composition.emulator.test.ts"
```

The repository Windows ARM64 harness ran the command with x64 Node.js and x64 Java. Three bounded host adaptations were required without changing source or product semantics: restore the normal Windows `PATHEXT` for the child process, use an x64 Microsoft JDK with a short writable Java temp directory, and use the short harness cache root `C:\ch126` so x64 Node could consume the staged source.

## Result

- Harness run: `95025ad4-a995-4a37-a50c-6b22f8b34818`
- Sidecar: `C:\ch126\evidence\95025ad4-a995-4a37-a50c-6b22f8b34818.json`
- Classification: `completed`; exit code `0`; source remained clean at the tested commit; protected package hashes were unchanged.
- Vitest: 1 file passed, 4/4 tests passed, zero skipped, 57.04 seconds.
- The red-capable regression `retains committed recipient row when only derived completion is unavailable` passed under the real RTDB and Firestore rules engines.

## Durable count/assertion companion

The exact composition was rerun from clean docs-only descendant `2c77efff`.
The test and config Git blobs are identical to `36ce82eb`. Captured output and
validated machine-readable evidence are committed at:

- `126-production-normal-rule-enforced-rerun-output-2026-08-23.txt`
- `126-production-normal-rule-enforced-rerun-2026-08-23.json`

Harness run `46150346-22d6-40f4-9c3c-726589af7bc0` completed with exit code 0:
1/1 test files and 4/4 tests passed, with zero failed and zero skipped. The
named committed-recipient-row assertion passed. The raw captured output and
sidecar are also retained in the checksummed consolidation archive.

## Disposition

The unchanged local production-shaped composition does not reproduce the trusted teacher-projection failure. There is no evidence for a local causal-source change. Under the accepted amendment, the remaining discrepancy is therefore at the deployed artifact/configuration/claims/rules/durable-state boundary.

The next gate requires Cloudflare Wrangler OAuth reauthorization plus an authorized exact-artifact deployment/readback and real browser verification. That remote mutation is outside this consolidation mission. Preserve the existing assignment; do not replay it.
