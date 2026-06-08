# Reading V2 Auto V4 Provider Review Contract

> **Created:** 2026-05-24
> **Scope:** Canonical architecture contract for Reading V2 Auto V4 provider ownership, source-proof audit, Studio review handoff, and publish safety.
> **Status:** Canonical decision record as of 2026-06-08. This doc supersedes diary-style rollout notes and stale provider-split text where they conflict.

## Decision Authority

Use this order when Reading V2 Auto V4 docs disagree:

1. This architecture contract.
2. Active tasklists that explicitly link back to this contract.
3. Current implementation tests and findings.
4. Historical rollout notes, conversation transcripts, and dated evidence reports.

The historical completion baseline is commit `f00fe351` (`feat(reading-v2): retire v3 auto lane`). That commit's tasklist records the final product direction: V4/Gemini is the only default Auto parser path, raw teacher input is source truth, whole-test V3/Groq fallback is retired, and Groq is reserved for future small group repair only. Its code still defaulted the V4 extractor through `aiService`, so provider-router access in that commit is treated as an implementation gap, not the target architecture.

## Active Contract

Reading V2 Auto V4 default parsing is Gemini-only staged extraction. It must not use the shared Gemini/Groq router as a whole-test fallback path.

Current ownership:

- V4/Gemini owns the main full-document structure extraction.
- Raw teacher input and the local source ledger own source truth.
- Local verifier/guardrails own readiness, diagnostics, publish blockers, and Studio handoff.
- Groq is reserved only for future teacher-triggered or verifier-triggered repair of one weak question group, using the smallest useful source slice.
- Groq must not receive full IELTS tests as a fallback replacement for Gemini.
- "Blocked" must be qualified. A diagnostic can block `Ready`, `Accept into Draft`, or publish without blocking Studio entry.

## Canonical Philosophy

Reading V2 Auto V4 is a safe assistant, not an autonomous judge.

- AI owns broad interpretation of messy real-world Reading source.
- Local code owns boundaries, evidence, validation, diagnostics, and Studio handoff.
- Local code must not grow into a brittle parallel parser through endless source-format exceptions.
- If provider output is incomplete but source evidence is recoverable, Studio may open an editable draft with review blockers.
- If output is unsafe or non-editable, Auto V4 fails closed.

This philosophy applies across passage boundaries, question areas, task groups, instruction text, reference banks, answer-key areas, clipped web pollution, and layout structures such as notes, tables, flowcharts, and diagrams.

## Studio Handoff Taxonomy

Auto V4 is an import assistant, not a publish bot. Less than perfect parsing is expected.

- `ready`: Studio opens. Required source checks pass, no publish blocker remains, and teacher can publish after normal review.
- `editable-needs-review`: Studio opens. Publish stays disabled or blocked until the teacher fixes or accepts review items. Use this for localized missing content, under-represented groups, uncertain task type, missing/flattened note/table/flowchart/diagram structure, source drift warnings, answer-binding uncertainty, and localized structured-layout conflicts where a canonical-safe degraded draft can be built.
- `blocked-before-studio`: Studio does not open a draft. Use only when no canonical-safe editable candidate can be built, when the failure is global or non-localizable, when normalization throws before a draft object exists, when raw source/artifact evidence is unavailable, or when opening Studio would persist an invalid canonical document.

Hard validation must never be weakened for publish or runtime. The importer must not hydrate malformed canonical data. But a publish blocker is not automatically a Studio blocker.

## Structured Layout Conflict Policy

Never create duplicate canonical anchors or repeated `stimulus.anchorIds`. If the provider assigns one question number to multiple table cells, flowchart steps, or diagram targets:

1. If all repeated positions are the same physical source position, collapse the duplicate anchor deterministically.
2. If positions differ but the affected group is localizable, build a canonical-safe degraded Studio group with explicit review diagnostics and raw layout evidence. Publish remains blocked until the teacher repairs it.
3. If a canonical-safe degraded group cannot be built, fail before Studio with a typed diagnostic.
4. Do not silently choose one cell or split one visible question into multiple answers.

This preserves the original Auto V4 philosophy: the teacher should fix bad-but-editable imports in Studio, while the repository guard still rejects malformed canonical documents.

## Historical Provider Split

The original May 24 V4 pipeline below is historical and no longer the active default:

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

## Historical Groq Self-Repair Contract

Groq was mandatory in this superseded pipeline because Gemini quota was not generous enough for the whole job and because question-area normalization was treated as a separate task. That design no longer authorizes whole-test Groq fallback in Auto V4.

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
- the candidate can hydrate into a canonical-safe draft without violating contract guards
- answer values are not silently mismatched
- incomplete provider coverage is visible as review/publish blockers

Studio must keep publish blocked when:

- provider output was incomplete before local source-proof repair
- reference/option bank ownership is missing or uncertain
- answer binding needs teacher review
- transcript verifier found source-proof gaps
- localized structured layout conflicts were degraded into teacher-visible repair items

This separates import success from publish readiness. A successful Auto V4 run may still be `needs_review`.

Teacher-facing review UI is owned by `documentation/architecture/reading-v2-studio-review-issues-contract.md`. Auto V4 diagnostics and publish blockers that are safe to edit in Studio must route through that normalized issue model instead of hover-only tooltip text.

## Publish Handoff

Auto V4 hands an editable draft to Studio. It does not publish directly and does not get a separate material pipeline.

After teacher review, validation, and publish:

- full Reading V2 tests use the shared Reading V2 publish plan
- generated Reading Passage materials are extracted from the full-test source order
- each generated passage gets canonical material/version data, a published snapshot, student-safe/review projections, and Material Catalog summary rows
- the master full-test material keeps ordered references to the generated passage material ids and snapshot/version ids

This means normal test making, paste/import text, and Auto V4 all converge before publish. Do not add Auto V4-only publish shortcuts that bypass Reading Passage extraction, Material Catalog indexes, or student-safe projection checks.

Detailed reference: `documentation/architecture/reading-v2-material-publish-and-passage-library.md`.

## Historical Evidence

Historical May 24 live Clippings gold E2E for `Practice Cam 10 Reading Test 04.md` recorded:

- historical provider path: `gemini-groq`
- model label: `gemini-2.5-flash+groq-structured-json`
- key inventory: 4 Gemini keys and 7 Groq keys loaded in the trusted harness
- output: 3 passages, 8 task groups, 40 questions, 40 answer rows
- answer comparison: 0 missing answer values and 0 mismatched answer values
- canonical validation blockers: 0
- Studio status: `needs_review` because provider output needed repair/review blockers

Detailed local artifact: `output/reading-v2-auto-v4-clippings-e2e/report.json` (not committed).

Committed task record: `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v4-clippings-gold-e2e.md`.

Historical May 25 completion evidence at `f00fe351` recorded:

- commit message: "Remove the whole-test V3/Groq package pipeline from active Auto parsing"
- tasklist direction: V4/Gemini main parser, raw source authority, Groq only for group-scoped repair
- canonical validation behavior: validation blockers are added to Studio diagnostics as publish blockers when normalization produces a candidate
- fail-closed behavior: reserved for guardrail errors or normalization failure before a safe draft can exist
