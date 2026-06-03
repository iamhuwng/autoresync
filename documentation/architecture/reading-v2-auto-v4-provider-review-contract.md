# Reading V2 Auto V4 Provider Review Contract

> **Created:** 2026-05-24
> **Scope:** Architecture contract for Reading V2 Auto V4 provider split, key inventory, source-proof audit, Groq self-repair, and Studio review handoff.

## Canonical Philosophy

Reading V2 Auto V4 is a safe assistant, not an autonomous judge.

- AI owns broad interpretation of messy real-world Reading source.
- Local code owns boundaries, evidence, validation, diagnostics, and Studio handoff.
- Local code must not grow into a brittle parallel parser through endless source-format exceptions.
- If provider output is incomplete but source evidence is recoverable, Studio may open an editable draft with review blockers.
- If output is unsafe or non-editable, Auto V4 fails closed.

This philosophy applies across passage boundaries, question areas, task groups, instruction text, reference banks, answer-key areas, clipped web pollution, and layout structures such as notes, tables, flowcharts, and diagrams.

## Provider Split

The intended V4 pipeline is:

```text
Raw source
-> local source ledger and line index
-> Gemini topology marker and answer-key witness
-> local passage packages
-> Groq per-passage question-area structured JSON normalizer
-> transcript verifier
-> Groq self-repair retry when coverage is low or unsafe
-> bounded local audit/repair
-> guarded Studio draft or fail-closed diagnostics
```

Gemini owns:

- full-source topology witness
- passage and group line coordinates
- visible answer-key row normalization
- source-coordinate evidence

Groq owns:

- per-passage question-area normalization
- strict JSON transcript shape
- task group/question coverage from `groupHints`
- source-proof fields such as `sourceTextExact`, `normalizedPromptText`, and source line anchors
- visible layout preservation for note/table/flowchart/diagram structures

Local code owns:

- source ledger and package construction
- provider key inventory and slot selection
- transcript parsing and verifier diagnostics
- source-proof equivalence for bounded blank/question-marker formatting
- deterministic assembly into canonical Reading V2 structures
- Studio review blockers and publish safety

## Groq Self-Repair Contract

Groq is mandatory in this pipeline because Gemini quota is not generous enough for the whole job and because question-area normalization is a separate task.

When Groq returns malformed JSON, low coverage, missing groups/questions, task-type conflict, missing bank evidence, blank mismatch, or source-proof drift, the app must feed Groq precise feedback and retry before local repair decides the final Studio handoff.

The retry feedback must include:

- expected group and question ranges
- missing groups and question numbers
- transcript verifier issue codes
- source-bounded evidence blocks already provided to Groq
- instruction to return strict JSON, not commentary

Local repair is allowed only after this AI self-repair attempt and must stay bounded by source-proof evidence. Repair diagnostics must be visible to Studio and must not silently mark the draft publishable.

## Key Inventory Contract

Reading V2 Auto V4 must use the shared provider inventory:

- `.env` keys
- numbered env keys, for example `VITE_GROQ_API_KEY_1` through `VITE_GROQ_API_KEY_5`
- admin-site key registry entries

The trusted Node harness may read the admin registry only when explicitly enabled with `READING_V2_TRUSTED_ADMIN_KEYS=true`. Browser code must not use this trusted Node fallback.

This is not a complete production secret boundary. Production secret-safe provider calls should use an approved trusted backend, currently Cloudflare Worker/small backend architecture, not Cloud Functions.

## Backend Boundary

Cloud Functions are off-limit for new Reading V2 work.

Approved trusted backend boundary:

- Cloudflare Worker, currently `r2-backup-worker`
- another explicitly approved small backend service

Historical Firebase Functions wrappers may exist in the repo while migration is pending, but they are deprecated and must not be expanded or treated as a release dependency.

## Studio Review Contract

Studio can open a draft when:

- passage count, task-group count, question count, and answer-key count are editable
- canonical validation has no structural blockers
- answer values are not silently mismatched
- incomplete provider coverage is visible as review/publish blockers

Studio must keep publish blocked when:

- provider output was incomplete before local source-proof repair
- reference/option bank ownership is missing or uncertain
- answer binding needs teacher review
- transcript verifier found source-proof gaps

This separates import success from publish readiness. A successful Auto V4 run may still be `needs_review`.

## Publish Handoff

Auto V4 hands an editable draft to Studio. It does not publish directly and does not get a separate material pipeline.

After teacher review, validation, and publish:

- full Reading V2 tests use the shared Reading V2 publish plan
- generated Reading Passage materials are extracted from the full-test source order
- each generated passage gets canonical material/version data, a published snapshot, student-safe/review projections, and Material Catalog summary rows
- the master full-test material keeps ordered references to the generated passage material ids and snapshot/version ids

This means normal test making, paste/import text, and Auto V4 all converge before publish. Do not add Auto V4-only publish shortcuts that bypass Reading Passage extraction, Material Catalog indexes, or student-safe projection checks.

Detailed reference: `documentation/architecture/reading-v2-material-publish-and-passage-library.md`.

## Current Evidence

The live Clippings gold E2E for `Practice Cam 10 Reading Test 04.md` recorded:

- provider path: `gemini-groq`
- model label: `gemini-2.5-flash+groq-structured-json`
- key inventory: 4 Gemini keys and 7 Groq keys loaded in the trusted harness
- output: 3 passages, 8 task groups, 40 questions, 40 answer rows
- answer comparison: 0 missing answer values and 0 mismatched answer values
- canonical validation blockers: 0
- Studio status: `needs_review` because provider output needed repair/review blockers

Detailed local artifact: `output/reading-v2-auto-v4-clippings-e2e/report.json` (not committed).

Committed task record: `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v4-clippings-gold-e2e.md`.
