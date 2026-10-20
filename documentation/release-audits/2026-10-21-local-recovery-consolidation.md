# Local recovery consolidation — October 21, 2026

Status: source implementation and focused checks; fresh bootstrap/restore and signed-in browser acceptance remain unqualified. No production deployment, emulator mutation, dataset replacement or task registration occurred.

The isolated source branch `codex/local-recovery-consolidation-20261020` starts at current stable main `ccc0351eba078ef10bd5662a241b9d50e2bf5319`. The owner's pre-existing AGENTS.md changes are excluded from this task. Main's secret-first local-dev startup, local/live endpoints, empty local AI gateway override and guarded deployment scripts remain unchanged.

The existing donor generation/inventory/checkpoint implementation was selectively reconciled, including an explicit declared existing protobufjs dependency and the Node script test entry. Default recovery storage is relative to the module rather than shell cwd. Normal startup reads existing state; explicit disposable bootstrap rejects an already registered dataset and requires all emulator ports stopped. Restore selects one validated immutable generation. Adoption writes coherent selected-generation/status metadata. Saves use the existing exclusive writer lock, reject missing protected data and inconsistent exports, and atomically advance the selected generation only after validation. The independent Windows checkpoint task checks checkout ownership before reuse, stop or registration. No currently registered task was changed.

The custom Firestore export/REST codec rejects unsupported types, unsafe integers and non-finite values instead of silently substituting null. Parent inspection initially found that a strict allowlist rejected timestamp meaning 7 in the actual saved dataset. The pinned emulator JAR's OnestoreEntity.Property.Meaning constants established GD_WHEN=7; the implementation now preserves integer microseconds and a regression compares export and REST timestamp forms. Unknown meanings, references, bytes and geopoints remain fail-closed limitations requiring a faithful extension if used.

## Verification

- `node --test scripts/__tests__/local-firebase-recovery.test.mjs scripts/__tests__/deployment-safety.test.mjs`: 38 tests passed (36 top-level plus two nested), exit 0, after the timestamp correction. Writer exclusion, corruption/framing, missing protected records, initial registration/status, fresh-only empty export and invalid-publication pointer preservation are covered.
- Node syntax checks for both implementation modules, PowerShell AST parsing without execution, and diff whitespace checks passed.
- The parent independently loaded the donor's selected generation `a7ab63ce-6d71-489c-8bd8-b1ed4300e9cd`: 666 documents, six Auth identities, five pre-existing readiness issues. This was read-only; the original dataset pointer was unchanged.
- Parent read-only local Firestore batchGet comparison confirmed every decoded field of all 666 saved documents equals its current REST representation. Evidence: ignored `tmp/local-recovery-real-codec-proof-20261021.json`; no document data is embedded in this report.

Detailed bounded-source assessment and agent check records are in ignored `tmp/local-recovery-consolidation-20261020.md`.

## Remaining qualification

Actual fresh empty bootstrap, full stopped-stack restore, continuous checkpoint task operation and teacher/student startup need runtime acceptance. This checkout has not adopted or copied the original dataset. Transfer requires explicit reviewed ownership of the machine-wide tasks and the selected saved data; do not bootstrap over the partial existing stack. Ignored secrets, environment settings, exact emulator JARs and installed toolchains remain machine prerequisites.

Firestore export and the three stores do not share a transaction. Checks validate exported document identities/values and reject observed inconsistency, but a concurrent new document omitted by the export can await a later checkpoint. Quiescent transfer and actual restore verification remain necessary. The Java-emulator task launcher was not changed and its existing machine-wide ownership must be checked before use. These limits prevent this source check from being called complete fresh-clone or product acceptance.
