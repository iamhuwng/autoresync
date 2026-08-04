# PRD0062 Full-V1 Acceptance Matrix

Matrix version: `2026-07-22.1`
State: `SOURCE_CONFORMANT_DEFINED_NOT_EXECUTED`

Current machine candidate: [prd0062-v1-acceptance-matrix.json](prd0062-v1-acceptance-matrix.json). Validator: `node scripts/validate-prd0062-acceptance-matrix.mjs`.

`prd0062-v1-acceptance-matrix.json` is the sole authoritative Full-V1
definition. It supersedes the absent closure-referenced
`51a-acceptance.matrix.json`; no second authority is created. #127/51A's
semantic checks read accepted Git object `a7522986` and confirm the 16 Reading
and 12 Listening researched types against registered runtime profiles. The
accepted UI-only PersonalTimer from `ba8b2d59` is explicitly traced with no
teacher enforcement or visibility and no effect on telemetry, grades,
deadlines, submission, attempts, autosave, integrity, or completion.

This record reports no browser journey, deployment, canary, secret, remote
mutation, or pass result. #128–#134 must not consume it as frozen authority
until #127's correction is reviewed and accepted.

That historical caveat is superseded by the deterministic #127 source
conformance record: it is `PASS` for accepted-source definition conformance,
while browser, deployment, and product execution remain
`DEFINED_NOT_EXECUTED`.

| Matrix lane | Cases | Consumer ticket |
| --- | --- | --- |
| Teacher authoring and assignment | `AC-TA-001`, `AC-TA-002` | `51B1` |
| Teacher updates, replacement, results | `AC-TU-001`, `AC-TR-001` | `51B2` |
| Student runtime and persistence | `AC-SR-001` | `51C1` |
| Student accessibility and device behavior | `AC-AD-001` | `51C2` |
| Contract and security negatives | `AC-SC-001` | `51D1` |
| Legacy, backup, recovery | `AC-LR-001` | `51D2` |
| Canary/deployed decision prerequisites | `AC-RO-001` | `51E` |

Canonical source evidence preserves all three named sources. It explicitly
records Listening note-completion plus Reading matching and Yes/No/Not Given
inspection. `taskTypeProfiles` inventories all 16 researched Reading and 12
researched Listening types. The current candidate's Listening release-blocker
classification is stale artifact data, not evidence that accepted Listening
support is missing.

Fixtures use deterministic IDs/checksums from a seed and may clean only under `prd0062_acceptance/`. Artifacts use `<timestamp>` placeholders until a consumer ticket executes a case. Names-only canary validation checks required configuration/secret names and scoped identity; it performs no remote action.
