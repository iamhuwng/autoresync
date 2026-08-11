# PRD0062 Full-V1 Acceptance Matrix

Matrix version: `2026-08-12.1`
State: `SOURCE_CONFORMANT_DEFINED_NOT_EXECUTED`

The machine-readable [acceptance authority](prd0062-v1-acceptance-matrix.json)
is the sole Full-V1 definition. It supersedes the absent closure-referenced
`51a-acceptance.matrix.json`; no second acceptance matrix is created.

The authority reconciles 32 profiled registrations from accepted Listening and
Reading source lineage, the canonical 32-row Activity coverage matrix, the
material capability and feature registries, and 33 deterministic fixture
entries (32 activity fixtures plus the accepted UI-only PersonalTimer).
Listening rows use their accepted registered/source-assisted states; the old
unregistered Listening classification is stale artifact data.

Semantic validation executes the accepted adapters against deterministic
inputs, checks source registration keys and source hashes, verifies registry
and Activity coverage correspondence, validates fixture schemas and scoped
cleanup commands, rejects direct `npx`, `vite`, `vitest`, and `wrangler`
command drift, and checks the PersonalTimer UI-only invariants. Every
Playwright execution and metric command uses the repository harness prefix
`node scripts/harness/run-tool.mjs playwright . test`:

```text
node scripts/validate-prd0062-acceptance-matrix.mjs
node scripts/validate-prd0062-acceptance-matrix.mjs --schema
node scripts/validate-prd0062-acceptance-matrix.mjs --semantic
```

The frozen deterministic fixture manifest SHA-256 is recorded in the JSON
authority and the #127 evidence record. The matrix SHA-256 and source hashes
are recorded in
`documentation/tasks/PRD0062/evidence/51A-acceptance-authority-2026-08-12.json`.

This is a definition and source-conformance artifact only. It reports no
browser journey, deployment, canary, secret, remote mutation, or product
execution result. Consumer tickets #128–#134 execute the named cases after
this authority is accepted.

| Matrix lane | Cases | Consumer ticket |
| --- | --- | --- |
| Teacher authoring and assignment | `AC-TA-001`, `AC-TA-002` | `51B1` |
| Teacher updates, replacement, results | `AC-TU-001`, `AC-TR-001` | `51B2` |
| Student runtime and persistence | `AC-SR-001` | `51C1` |
| Student accessibility and device behavior | `AC-AD-001` | `51C2` |
| Contract and security negatives | `AC-SC-001` | `51D1` |
| Legacy, backup, recovery | `AC-LR-001` | `51D2` |
| Canary/deployed decision prerequisites | `AC-RO-001` | `51E` |

Fixtures use deterministic IDs/checksums from a seed and may clean only under
`prd0062_acceptance/`. Artifacts use `<timestamp>` placeholders until a
consumer ticket executes a case. Names-only canary validation checks required
configuration/secret names and scoped identity; it performs no remote action.
