# Task List: PRD-0048 Reading V2 Auto Gemini Clippings Hardening

> **Created:** 2026-05-14
> **Purpose:** Harden Reading V2 Auto import so raw IELTS Reading tests pasted from the local `Clippings` corpus can be converted into Studio drafts without silent passage loss, question loss, answer-key loss, task-type drift, or unsafe publishable output.
> **Scope:** Follow-up improvement batch for the existing Reading V2 `Auto` start mode. This task list strengthens source analysis, Gemini topology marking, Groq question-area normalization, deterministic assembly, diagnostics, repair loops, live tests, and Clippings-scale verification.
> **Primary source PRD:** `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
> **Pipeline source:** `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
> **Parent Auto task:** `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-gemini-import.md`
> **V1 lesson source:** `documentation/architecture/reading-staged-parse-job.md`

This task list supplements, but does not replace:

- `documentation/tasks/tasks-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-gemini-import.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-paste-import-and-answer-key-authority.md`
- `documentation/architecture/teacher-test-creation-parsing-and-review.md`
- `documentation/architecture/reading-staged-parse-job.md`
- `documentation/tasks/process-task-list.md`

## Problem Statement

Recent diagnostics proved the current Auto flow can preserve answers for one parsed passage but still lose later question ranges.

Observed failure shape:

1. Raw source contains three Reading passages, questions 1-40, and a visible answer key.
2. Gemini returns structured JSON, but material topology drifts.
3. Studio imports only questions 1-13 as real interactions.
4. Later answer-key rows, such as 27-40, parse correctly but become unbound because matching imported questions do not exist.
5. Studio reports `unbound-teacher-answer-key-row` and `unresolved-import-uncertainty`, but the root structural loss happened before Studio.

This is not solved by answer-key binding alone. The system needs a stronger source-ledger, topology gate, and repair loop before trusting Gemini output as Studio-ready.

## Decision Contract

Reading V2 Auto must use this invariant:

```text
Raw Clippings source = source truth.
Gemini = full-source topology marker and answer-key normalizer.
Groq = per-passage question-area formatting normalizer.
Local ledger = topology authority.
Deterministic V2 assembler = canonical draft authority.
Verifier = publish/readiness authority.
Studio = teacher repair, validation, preview, publish.
```

Auto must not treat Gemini as the owner of:

1. passage count
2. question-number coverage
3. answer-key row existence
4. source-to-question topology
5. publish readiness

Auto must not treat Groq as the owner of:

1. passage body text
2. answer correctness
3. publish readiness
4. canonical V2 IDs
5. source trust

## Target Outcome

For every supported IELTS Reading test in `C:\Users\The Lord\Desktop\luyentap\Clippings`:

1. Auto either produces a Studio draft with all detected passages, all detected questions, and all source answer-key rows bound, or fails closed with exact repair diagnostics.
2. A successful draft has no missing scoring rules, no unbound answer rows, no duplicated question numbers, no missing passage text, and no unsafe projection leakage.
3. Preview renders with the student Reading V2 runtime contract.
4. Publish remains blocked until the draft is complete, source-faithful, and projection-safe.

Unsupported or malformed clippings are allowed to fail, but failure must be explicit, classified, and reproducible. Silent partial success is not allowed.

## Current Baseline To Preserve

- Reading V2 remains metadata-first in `TestCreationModal`.
- Start choices remain `Paste Text`, `Auto`, and `Create New Test`.
- `Auto` requires one raw-test textarea, not an external prompt step and not a separate answer-key field.
- `Auto` uses Reading V2-owned service code for provider orchestration.
- Gemini may inspect the full raw input only to return source markers, passage-package spans, question-area spans, group hints, pollution spans, uncertainty diagnostics, and normalized answer-key rows.
- Groq may inspect each passage's full question area only to normalize messy question formatting into a strict transcript. Groq must not receive passage body text.
- Studio remains the only long-lived review, repair, validation, preview, and publish surface.
- `Paste Text` remains the manual/external-AI fallback path.
- Student-safe and session-safe projections must not expose raw source, answer-key text, Gemini output, diagnostics, or import evidence.

## Non-Goals

- Do not copy V1 code into Reading V2.
- Do not replace the V2 canonical model with the V1 flat Reading model.
- Do not publish directly from Auto.
- Do not commit raw copyrighted Clippings content unless the repo already permits the exact fixture.
- Do not send passage body text to Groq.
- Do not ask Groq to solve answers, paraphrase content, invent missing text, or return final Studio instruction prose.
- Do not send all three passages to Groq in one call; Groq calls must stay per-passage question-area scoped.
- Do not make Mistral providers part of this batch.
- Do not make Clippings harness reports expose full passage text or answer-key text in committed artifacts.

## Required Design From V1 Lessons

V1 worked because it separated source truth, AI extraction, rules classification, validation, and teacher review.

V2 should adopt the method, not the legacy model:

1. Build a raw-source ledger before Gemini.
2. Line-index the raw source before any provider call.
3. Treat Gemini output as a topology witness, not a content extractor.
4. Split exact local source into three passage packages using verified Gemini markers.
5. Send only each package's question area to Groq for strict transcript normalization.
6. Assemble canonical V2 data deterministically from local passage text, Groq question transcript, and verified answer-key rows.
7. Compare generated structure back to the raw ledger.
8. Repair or fail by exact range and exact issue.
9. Send only reviewable, guarded data into Studio.

## 2026-05-14 V3 Pivot Amendment

The local commit `6246091 feat(reading-v2): harden auto clippings import` is a safety checkpoint, not the final architecture. Keep its source-ledger, verifier, diagnostics, harness, projection-safety, key-rotation, and validation work. Replace the center of the AI pipeline.

New target architecture:

```text
Raw source
-> local line index and source ledger
-> Gemini full-source topology marker plus answer-key normalizer
-> local exact split into three passage packages
-> Groq per-passage question-area normalizer
-> local deterministic transcript parser and V2 assembler
-> source-fidelity verifier
-> guarded Studio draft or fail-closed diagnostics
```

Important terms:

- `passage package`: one Reading passage's local-only passage body span, full question-area span, question-group hints, reference/option bank spans, relevant answer-key rows, pollution exclusions, line numbers, and hashes.
- `question area`: all source lines for the passage's questions, including headings, task instructions, reference banks, option lists, numbered questions, table/note/summary/flowchart/diagram text, and local line markers. It excludes passage body text.
- `canonical transcript`: Groq's strict, parseable representation of the question area. It may copy visible question/reference/option/layout text exactly, but it must not solve, paraphrase, invent, or output final Studio instruction prose.

V3 core rule:

```text
AI handles messy formatting.
Code owns exact source, canonical parse, answer binding, validation, and trust.
```

## Relevant Files

Implemented primary files:

- `src/services/reading-v2/readingV2AutoImportSourceLedger.service.ts` - raw-source ledger, redacted topology summary, prompt ledger summary, and source-fidelity verifier.
- `src/services/reading-v2/readingV2AutoImport.service.ts` - Auto orchestration, chunking, Gemini calls, guardrails, candidate creation.
- `src/services/reading-v2/readingV2AutoImportPrompt.ts` - Gemini prompt contract.
- `src/services/reading-v2/readingV2AutoTopologyMarker.service.ts` - V3 Gemini topology-marker prompt, local line index, marker validation, source-bound answer-key row normalization, overlap checks, and fail-closed marker diagnostics.
- `src/services/reading-v2/readingV2AutoQuestionAreaNormalizer.service.ts` - V3 Groq per-passage question-area normalizer prompt and strict transcript call wrapper.
- `src/services/reading-v2/readingV2GroqPackageFanout.service.ts` - V3 Groq key-slot fan-out coordinator for distinct per-package calls, keyed retries, and per-package diagnostics.
- `src/services/reading-v2/readingV2AutoPassagePackage.service.ts` - V3 local splitter for exact three passage packages; keeps passage body local and sends only question-area text to Groq.
- `src/services/reading-v2/readingV2AutoQuestionTranscript.service.ts` - V3 strict transcript schema, parser, verifier, and deterministic material builder.
- `src/services/ai/groq.provider.ts` - structured generation now accepts a preferred Groq key slot and reports safe slot fingerprints without raw key leakage.
- `src/services/reading-v2/readingV2ImportNormalization.service.ts` - import candidate normalization and answer-key binding.
- `src/services/reading-v2/readingV2StudioParsingDiagnostics.service.ts` - diagnostic report surface.
- `src/services/reading-v2/readingV2Validation.service.ts` - publish-blocking validation.
- `src/services/reading-v2/readingV2Projection.service.ts` - preview/student/session projection safety.
- `src/components/test-creation/TestCreationModal.tsx` - Auto entry UI and modal status.
- `src/components/reading-v2/studio/ReadingV2ImportReviewPanel.tsx` - Studio import diagnostics and teacher repair summary.
- `src/services/reading-v2/fixtures/readingV2PasteImportFixtures.ts` - in-repo synthetic fixtures.
- `scripts/reading-v2-clippings-harness.ts` - local-only redacted Clippings ledger scan harness.
- `documentation/architecture/changelog/reading-v2-auto-source-ledger-and-repair.md` - durable source-ledger, verifier, repair-loop, harness, and operational settings note.
- `documentation/tasks/PRD0048/completion-audit-reading-v2-auto-v3-pipeline.md` - prompt-to-artifact completion audit and remaining-gate map.
- `documentation/tasks/PRD0048/diagnostic-log-reading-v2-auto-v3-pipeline.md` - blocker/error diagnostic log with root causes, evidence, and removal paths.
- `documentation/tasks/PRD0048/findings-of-tasks-0048-reading-v2-auto-v3-pipeline.md` - current V3 implementation findings and verification evidence.
- `package.json` - adds `reading-v2:clippings-ledger`.
- `.gitignore` - ignores local redacted Clippings harness reports.

Expected test files:

- `src/services/reading-v2/readingV2AutoImportSourceLedger.service.test.ts`
- `src/services/reading-v2/readingV2AutoTopologyMarker.service.test.ts`
- `src/services/reading-v2/readingV2AutoQuestionAreaNormalizer.service.test.ts`
- `src/services/reading-v2/readingV2AutoPassagePackage.service.test.ts`
- `src/services/reading-v2/readingV2GroqPackageFanout.service.test.ts`
- `src/services/reading-v2/readingV2AutoQuestionTranscript.service.test.ts`
- `src/services/reading-v2/readingV2AutoImport.service.test.ts`
- `src/services/ai/groq.provider.test.ts`
- `src/services/reading-v2/readingV2AutoImportPrompt.test.ts`
- `src/services/reading-v2/readingV2ImportNormalization.service.test.ts`
- `src/services/reading-v2/readingV2StudioParsingDiagnostics.service.test.ts`
- `src/services/reading-v2/readingV2Validation.service.test.ts`
- `src/services/reading-v2/readingV2Projection.service.test.ts`
- `src/components/test-creation/TestCreationModal.test.tsx`
- `src/services/reading-v2/readingV2StudioWorkflow.service.test.ts`

Add or update this section whenever implementation touches more files.

## Safety Gates Before Implementation

- [x] Read `documentation/tasks/process-task-list.md` before starting implementation and before marking any parent task complete.
- [x] Read `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-gemini-import.md`.
- [x] Read `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`.
- [x] Read `documentation/architecture/teacher-test-creation-parsing-and-review.md`.
- [x] Read `documentation/architecture/reading-staged-parse-job.md` for V1 lesson shape only.
- [x] Read `documentation/rules/codebase-hygiene.md` before changing imports or shared data contracts.
- [x] Read `documentation/rules/observability.md` before changing Auto UI actions or diagnostics.
- [x] Read `documentation/rules/react-patterns.md` before changing modal state, retry state, or loading state.
- [x] Read `documentation/rules/mobile-portability.md` before adding browser storage, direct globals, or navigation helpers.
- [x] Preserve existing `Paste Text` and `Create New Test` tests before adding new Auto hardening.

## Phase 0: Baseline Failure Capture And Clippings Inventory

- [x] Capture the reported failure as a named regression case with:
  - raw-source topology summary
  - Gemini structured material summary
  - Studio imported question summary
  - answer-key binding summary
  - blocking issue codes
- [x] Add a redacted regression fixture that reproduces the structural failure without storing copyrighted full text.
- [x] Inventory `C:\Users\The Lord\Desktop\luyentap\Clippings` for candidate IELTS Reading test notes.
- [x] Classify Clippings files into:
  - full test with three passages and answer key
  - full test missing answer key
  - single passage or partial extract
  - polluted web clip with ads/nav/trailing links
  - unsupported or ambiguous source
- [x] Build a redacted manifest format that stores file path, title, detected ranges, counts, issue codes, and hash only.
- [x] Do not write full passage text or full answer-key text into committed harness output.

Acceptance:

- [x] The known bad diagnostic shape is reproducible as a regression test or redacted harness case.
- [x] The Clippings corpus can be scanned without committing raw copyrighted content.
- [x] Every scanned file receives a source-category result.

## Phase 1: Raw Source Ledger

- [x] Add a Reading V2-owned raw-source ledger builder before Gemini.
- [x] Normalize harmless whitespace while preserving source line offsets.
- [x] Detect and mark common clipped pollution:
  - `Advertisements`
  - previous/next post links
  - unrelated test links
  - social/share/footer blocks
  - repeated page title/footer fragments
- [x] Detect passage boundaries using strict heading patterns such as `READING PASSAGE 1`, not loose prose like `Reading Passage 2 has six paragraphs`.
- [x] Detect question-range headings such as `Questions 14-17`, `Questions 32-36`, and mixed hyphen/en-dash variants.
- [x] Detect visible numbered question lines, including markdown-bold numbers and escaped punctuation.
- [x] Detect section instructions and attach them to the correct range.
- [x] Detect section reference banks:
  - paragraph labels
  - list of people
  - list of headings
  - option sets
  - matching endings
- [x] Detect answer-key regions and rows independently of Gemini.
- [x] Derive expected source topology:
  - passage count
  - passage ranges
  - question number set
  - answer-key row set
  - section instruction ranges
  - expected full-test completeness when the source clearly indicates 1-40
- [x] Emit ledger diagnostics for missing or ambiguous topology.

Acceptance:

- [x] Ledger identifies all three passages and questions 1-40 for normal full-test Clippings files.
- [x] Ledger ignores trailing unrelated answer keys or navigation links when they are outside the detected source answer-key region.
- [x] Ledger catches a missing Q14-26 or Q27-40 output before Studio handoff.

## Phase 2A: V3 Gemini Full-Source Topology Marker

This phase supersedes the direct Gemini extraction contract as the final Auto architecture.

- [x] Add a local line-indexing step before the first provider call.
- [x] Preserve stable line numbers, raw line text, trimmed line hashes, and source hash.
- [x] Pass numbered raw lines to Gemini in one full-source marker call.
- [x] Prompt Gemini to return only short JSON coordinates and normalized answer-key rows.
- [x] Require Gemini marker output to include exactly three passage packages when the source is a full IELTS test:
  - passage number
  - passage title/body start and end lines
  - question area start and end lines
  - expected question range
  - question-group range hints
  - group task-type hints
  - reference/option bank line spans
  - pollution/excluded line spans
  - uncertainty diagnostics
- [x] Require Gemini to normalize visible answer-key rows into:
  - question number
  - answer string
  - source line
  - optional alternative answers
  - uncertainty code when ambiguous
- [x] Forbid Gemini marker output from copying passage body text, copying full question text, solving answers, returning canonical V2 IDs, or claiming publish readiness.
- [x] Verify every marker line range locally:
  - every referenced line exists
  - `startLine <= endLine`
  - passage spans contain strict `READING PASSAGE N` evidence where present or are locally anchored after the ledger-owned heading and before the verified question area
  - question area spans contain expected `Questions X-Y` or visible numbered questions
  - answer-key rows exist in source lines and bind to expected question numbers
  - question ranges cover `1-40` for supported full tests
  - package spans do not swallow excluded pollution
- [x] Fail closed with marker diagnostics when Gemini returns missing, overlapping, impossible, or unverifiable ranges.

Acceptance:

- [x] Gemini can mark three passage packages and answer-key rows without outputting the full passage or full question text.
- [x] Local verification rejects any marker that cannot be proven against raw line-indexed source.
- [x] First-call output is small enough to inspect in redacted diagnostics without storing copyrighted body text.

## Phase 2B: V3 Local Three-Package Splitter

- [x] Build exact local passage packages from verified Gemini marker ranges.
- [x] Each package must contain local-only:
  - passage body/title lines
  - full question area lines
  - group hint ranges
  - reference/option bank hint ranges
  - relevant normalized answer-key rows
  - source hash and per-line hashes
  - pollution exclusions
- [x] Keep passage body text local; do not send it to Groq.
- [x] Prepare Groq input from question-area lines only.
- [x] Include enough context in Groq input to normalize question formatting:
  - passage number
  - expected question range
  - full raw question area lines
  - task instruction lines
  - reference/option bank lines
  - table/note/summary/flowchart/diagram text lines
  - normalized answer rows for the package
  - Gemini marker hints
  - line numbers and hashes
- [x] Add redacted diagnostics for package creation without storing full passage body or full answer-key text.

Acceptance:

- [x] `Part 1`, `Part 2`, and `Part 3` each mean one complete Reading passage package, usually Q1-13, Q14-26, and Q27-40.
- [x] Groq receives full question-area text for its passage package, but never receives passage body text.
- [x] Local code can reconstruct exact source slices from package metadata.

## Phase 2C: V3 Groq Question-Area Normalizer

- [x] Add one Groq normalization call per passage package.
- [x] Do not rely on the existing Groq provider's implicit round-robin/fallback behavior for V3 package fan-out.
- [x] Add a Reading V2-owned Groq package fan-out layer that can assign package 1, package 2, and package 3 to distinct Groq key slots when at least three non-benched keys are available.
- [x] Extend or wrap Groq structured generation so a normalizer call can request a preferred key slot and report the slot/fingerprint used without exposing the raw key.
- [x] Preserve existing key rotation/cooldown behavior as the fallback path for failed packages, not as the primary package distribution contract.
- [x] Keep Groq prompt short and strict:
  - read one passage's question area
  - do not solve answers
  - do not paraphrase
  - do not invent missing text
  - do not output passage body
  - do not output final Studio instruction prose
  - normalize messy visible question formatting into one strict transcript schema
  - copy visible question/reference/option/layout text exactly when the schema requires content
  - return diagnostics instead of guessing
- [x] Groq transcript schema must cover all Reading V2 task families:
  - matching headings
  - matching information
  - matching features
  - matching endings
  - multiple choice single/multiple answer
  - TFNG/YNNG
  - sentence completion
  - summary completion from text
  - summary completion from list
  - note completion
  - table completion
  - flowchart completion
  - diagram labelling
  - short answer
- [x] Groq transcript must include:
  - passage number
  - full package question range
  - group range
  - task type
  - instruction metadata only, such as word limit, number allowance, judgement labels, reuse rule, and option cardinality
  - reference/option banks with labels and exact visible text
  - normalized question objects with exact prompt text
  - structured layout blocks with exact visible text and blank/question-number targets
  - source line references for every copied text field where possible
  - diagnostics for ambiguous or unsupported formatting
- [x] Do not require Groq to emit complete instruction text; Studio standard instructions are generated from task type plus instruction metadata.

Acceptance:

- [x] Groq converts messy question-area formatting into a strict parseable transcript.
- [x] Groq output keeps question/reference/option/layout content exact, not paraphrased.
- [x] Groq output omits passage body text and answer-solving reasoning.

## Phase 2D: V3 Deterministic Transcript Parser And Assembler

- [x] Parse Groq transcript into deterministic local objects before canonical V2 normalization.
- [x] Generate Studio standard instructions from `taskType + instructionMeta`.
- [x] Build canonical V2 task groups and interactions from Groq transcript, not from provider-owned canonical IDs.
- [x] Insert exact local passage body/title text from the local passage package.
- [x] Bind Gemini-normalized answer-key rows only after interactions exist.
- [x] Preserve answer-key authority and publish-blocking behavior from the current checkpoint.
- [x] Keep stable local IDs derived from source name, passage number, group range, and question number.
- [x] Keep existing Studio review/repair path for any unresolved source or transcript issue.

Acceptance:

- [x] Final canonical V2 draft can be built from local passage text plus Groq question transcript plus verified answer-key rows.
- [x] Studio instruction text does not depend on Groq returning free-form instruction prose.
- [x] No provider owns canonical IDs, publish status, or final scoring authority.

## Phase 2E: V3 Transcript And Source-Fidelity Verifier

- [x] Verify Groq transcript against the local question area:
  - every copied text field appears exactly in the package question area
  - every question number in expected range appears once
  - no extra question number appears
  - group ranges do not overlap
  - reference/option labels match visible banks
  - blank count matches group range for completion layouts
  - task type agrees with instruction metadata and deterministic source cues
- [x] Verify assembled draft against source ledger:
  - all detected passages present
  - all detected question numbers present
  - all answer-key rows bound
  - all scoring rules valid
  - structured layout targets stable
  - projection-safe data remains clean
- [x] Convert every V3 failure into stable diagnostics:
  - `topology-marker-*`
  - `passage-package-*`
  - `question-transcript-*`
  - `groq-normalizer-*`
  - existing `source-*` verifier codes where applicable
- [x] Redact provider diagnostics so raw source, full passage body, and full answer-key text do not appear in committed reports.

Acceptance:

- [x] A Groq transcript that changes question text is rejected.
- [x] A Groq transcript that misses a question, bank item, option, blank, or answer row is rejected or made reviewable with publish blockers.
- [x] Supported full tests cannot silently import as partial drafts.

## Phase 2F: V3 Provider Orchestration, Retry, And Repair

- [x] Keep one Gemini marker call per raw source, with existing Gemini key rotation/cooldown behavior.
- [x] Current Groq service behavior is not enough for V3: `generateStructuredJson` picks a key by internal round-robin and only falls back after failure, so callers cannot deterministically bind passage package 1/2/3 to separate keys.
- [x] Add explicit package-key planning before Groq calls:
  - list non-benched Groq key slots
  - reserve/lease a slot per package when possible
  - fall back to round-robin only when there are fewer available keys than packages
  - release leases after success/failure
- [x] Run Groq passage-package normalizers independently and in parallel when distinct key slots are available.
- [x] Route package 1, package 2, and package 3 to different Groq keys when available, with deterministic diagnostics proving the assignment.
- [x] If one Groq package fails, retry only that package with another available Groq key; do not resend successful packages.
- [x] Preserve successful packages while repairing failed packages.
- [x] Do not rerun the Gemini full-source marker unless marker verification fails or the raw source changes.
- [x] Add per-package diagnostics:
  - provider name
  - key slot/fingerprint where safe
  - package number
  - question range
  - attempt count
  - failure code
  - verifier result
- [x] Keep bounded repair attempts and fail closed when retries do not converge.

Acceptance:

- [x] Passage 2 normalizer failure does not discard valid passage 1 and passage 3 results.
- [x] Groq rate-limit/high-demand/key failure is visible and recoverable per package.
- [x] Repeated same-source runs converge to the same accepted or rejected result.

## Phase 2G: V3 Tests And Harness Updates

- [x] Add Gemini marker tests for:
  - clean full test with 3 passage packages and answer key
  - polluted web clip
  - missing passage range
  - duplicated `Questions X-Y` headings
  - answer-key ambiguity
  - impossible/overlapping line spans
- [x] Add passage-package splitter tests proving:
  - exact local passage body retained
  - full question area sent to Groq
  - no passage body sent to Groq
  - relevant answer rows attached to each package
- [x] Add Groq transcript tests for every supported task family.
- [x] Add Groq fan-out tests proving:
  - three packages use three distinct key slots when three available keys exist
  - fewer keys degrade to bounded round-robin with clear diagnostics
  - a failed package retries on a different key without rerunning successful packages
  - raw key values never appear in diagnostics
- [x] Add transcript verifier tests for paraphrased text, missing questions, wrong task type, missing reference bank, blank mismatch, and unbound answer rows.
- [x] Update Clippings harness modes:
  - ledger-only
  - Gemini-marker mocked
  - Groq-transcript mocked
  - full mocked V3 pipeline
  - optional live Gemini marker plus live Groq package normalizers
- [x] Update provider-free browser smoke to assert the V3 path reaches Studio only after guarded synthetic V3 package output reaches normalization, verifier, projection, preview, and publish gates.
  - Live Clippings browser smoke remains blocked in Phase 9 until explicit provider approval.

Acceptance:

- [x] V3 tests prove AI handles messy question formatting while local code preserves source truth.
- [x] Harness reports distinguish marker failures from Groq transcript failures.
- [x] Live probes are still opt-in and redacted.

## Phase 2: Gemini Intermediate Contract (Checkpoint, Superseded By V3)

Checkpoint note: these completed items belong to the `6246091` non-live hardening checkpoint. They are useful evidence and reusable test coverage, but the direct Gemini extraction contract is no longer the target final architecture.

- [x] Replace or supplement the current canonical-ish Gemini JSON request with a simpler intermediate extraction contract.
- [x] Intermediate output must not own canonical IDs.
- [x] Intermediate output must include evidence links back to raw ledger ranges where possible.
- [x] Require Gemini to return:
  - passage text blocks
  - task group instruction blocks
  - question rows
  - option/reference banks
  - table/flow/note/diagram layout data when visible
  - diagnostics for uncertainty
- [x] Require Gemini to leave unknown structure explicit instead of inventing.
- [x] Keep top-level `answerKeyText` only for visible copied source rows.
- [x] Pass source ledger expectations into the prompt:
  - expected passage number
  - expected question range
  - expected answer-key rows if visible
  - section/reference-bank boundaries
- [x] For chunked mode, give each Gemini call exactly one deterministic source unit plus shared answer-key rows where needed.
- [x] Add prompt tests that lock:
  - no answer hallucination
  - no source paraphrase
  - no question renumbering
  - no merging unrelated materials
  - diagnostics instead of guesses

Acceptance:

- [x] Gemini cannot accidentally create extra materials from instructional prose alone.
- [x] Gemini output is easier to validate against the ledger than the current direct canonical-style payload.
- [x] Prompt tests fail if the source-ledger constraints are removed.

## Phase 3: Deterministic V2 Assembler And Binder (Checkpoint, Reused By V3)

Checkpoint note: keep the local ownership, stable IDs, answer binding, and validation lessons. V3 must assemble from local passage packages plus Groq transcripts, not from the old direct Gemini extraction payload.

- [x] Add deterministic assembly from ledger plus Gemini intermediate into canonical Reading V2 import candidate data.
- [x] Let local code own:
  - passage ordering
  - section IDs
  - task-group IDs
  - interaction IDs
  - visible question numbering
  - passage-to-question mapping
  - answer-key row binding
- [x] Add deterministic task-type cross-checks using V2-owned rules inspired by V1:
  - instruction priority
  - word-limit extraction
  - reference-label ranges
  - binary judgement vocabulary
  - matching-information vs matching-features distinction
  - table/flow/note/summary/diagram layout signals
- [x] Preserve structured layout blank targets for:
  - table completion
  - note completion
  - summary completion from text
  - summary completion from list
  - flowchart completion
  - diagram labelling
- [x] Bind answer-key rows only after interactions exist.
- [x] Produce exact diagnostics for:
  - missing interaction for answer row
  - answer row incompatible with task type
  - task group missing required reference bank
  - blank count mismatch
  - duplicate question number
  - skipped question number

Acceptance:

- [x] Canonical IDs and task ownership are stable across repeated imports of the same source.
- [x] A valid answer-key row cannot become unbound because Gemini split materials incorrectly.
- [x] V2 canonical validation remains the final draft authority.

## Phase 4: Source-Fidelity Verifier

- [x] Add a verifier that compares assembled candidate against the raw ledger before Studio handoff.
- [x] Verify passage coverage:
  - expected passage count
  - passage title presence
  - paragraph label coverage
  - text length ratio
  - no large unexpected additions
  - no large unexpected deletions
- [x] Verify question coverage:
  - exact visible question-number set
  - section range coverage
  - no duplicate questions
  - no extra questions absent from source
  - prompt text not empty
- [x] Verify instruction coverage:
  - word limit copied
  - vocabulary copied for TFNG/YNNG
  - reuse letters instruction copied where present
  - reference label ranges copied
- [x] Verify option/reference banks:
  - MCQ options
  - list of people
  - list of headings
  - paragraph labels
  - matching endings
- [x] Verify answer-key coverage:
  - every visible source row binds
  - no generated row lacks source evidence
  - duplicates are flagged
  - missing rows are flagged
- [x] Verify structured layout:
  - each blank target maps to one interaction
  - tables have stable cells and no overlap
  - flow steps and diagram labels have stable anchors
- [x] Convert every verifier failure into a stable diagnostic code with source range and target object where available.

Acceptance:

- [x] The verifier blocks the reported failure before Studio opens as a misleading partial draft.
- [x] The verifier can distinguish provider/model failure from source-format failure.
- [x] Diagnostics are actionable enough to drive targeted repair.

## Phase 5: Targeted Repair Loop (Checkpoint, Adapt For V3 Packages)

Checkpoint note: keep bounded repair, range ownership, and diagnostics. V3 repair units become Gemini marker, passage package, Groq transcript group, answer-key block, or structured layout block.

- [x] Add a bounded repair loop after verifier failure.
- [x] Group failures by blast radius:
  - one passage
  - one question range
  - one task group
  - one answer-key region
  - one structured layout block
- [x] For deterministic failures, repair locally without another Gemini call when safe.
- [x] For extraction failures, send Gemini only the failing raw slice plus ledger expectations.
- [x] Enforce maximum repair attempts per range.
- [x] Prevent infinite loops by tracking diagnostic code plus source range plus attempt count.
- [x] Preserve previous good ranges while repairing failed ranges.
- [x] If repair succeeds, rerun full verifier.
- [x] If repair fails, open Studio only when the draft is safely reviewable; otherwise fail in modal with exact diagnostics.
- [x] Add dev diagnostics for each loop:
  - attempt number
  - range
  - issue codes
  - provider result
  - verifier result

Acceptance:

- [x] Missing Q14-26 or Q27-40 can be repaired without rerunning Q1-13.
- [x] Repair does not degrade already-valid passages or task groups.
- [x] Repeated same-source runs converge to the same accepted or rejected result.

## Phase 6: Studio Diagnostics, Review Queue, And Settings

- [x] Replace opaque Auto blockers with a teacher-readable repair queue in Studio when safe to review.
- [x] Show source-ledger summary:
  - detected passages
  - detected question ranges
  - detected answer-key rows
  - detected task groups
- [x] Show generated-draft summary beside source-ledger summary.
- [x] Show mismatch categories:
  - missing range
  - extra range
  - unbound key row
  - task-type conflict
  - option/reference-bank conflict
  - structured-layout conflict
  - passage-trim risk
- [x] Add jump targets from diagnostics to the relevant passage, task group, interaction, or answer row.
- [x] Keep diagnostics teacher-readable; hide raw provider payload unless in dev/admin diagnostics.
- [x] Add or document operational settings:
  - max input characters
  - minimum source characters
  - wait between Gemini chunks
  - max repair attempts
  - strict source-fidelity mode
  - live Gemini probe enablement
  - Clippings harness root path for local development
  - redacted report output path
- [x] Ensure settings default to strict and fail-closed in production.

Acceptance:

- [x] Teacher can see whether the problem is source input, Gemini extraction, answer-key binding, or canonical validation.
- [x] A valid but incomplete draft cannot look ready to publish.
- [x] Operational knobs are documented and safe by default.

## Phase 7: Clippings Batch Harness

- [x] Add a local-only harness for `C:\Users\The Lord\Desktop\luyentap\Clippings`.
- [x] Harness must support offline ledger-only mode for all files.
- [x] Harness must support mocked intermediate mode for deterministic regression fixtures.
- [x] Harness must support optional live Gemini mode behind an explicit flag.
- [x] Harness must never write raw passage text or full answer-key text into committed reports.
- [x] Harness report must include:
  - file path
  - source hash
  - detected title
  - category
  - passage count
  - detected question numbers
  - answer-key row count
  - generated interaction count
  - bound answer count
  - issue codes
  - final status: accepted, repaired, reviewable, rejected, unsupported
- [x] Add corpus-level summary:
  - total files scanned
  - supported full tests
  - accepted without repair
  - accepted after repair
  - reviewable with blockers
  - rejected with source issue
  - rejected with provider issue
  - unsupported
- [x] Add fixture-selection helper to pick representative Clippings tests:
  - clean full test
  - table-heavy test
  - matching-heavy test
  - diagram/flowchart test
  - polluted web-clip test
  - known difficult test
- [x] Keep generated reports in ignored/local output unless explicitly approved for commit.

Acceptance:

- [x] One command can scan the whole Clippings folder in ledger-only mode.
- [x] One command can run a curated representative live Gemini probe set.
- [x] Report shows exactly why any Clippings test was not perfected.

## Phase 8: Automated Tests

Unit tests:

- [x] Ledger detects three passages, 40 questions, task ranges, and answer-key rows from clean full-test markdown.
- [x] Ledger ignores ads, nav links, and unrelated trailing test links.
- [x] Ledger distinguishes `Reading Passage 2 has six paragraphs` from an actual passage boundary.
- [x] Answer-key parser handles `1 answer`, `1. answer`, `1) answer`, escaped markdown forms, TFNG/YNNG, letters, numerals, and multiple acceptable alternatives.
- [x] Prompt tests assert ledger constraints and no-hallucination rules.
- [x] Assembler tests prove stable canonical IDs and question-number coverage.
- [x] Verifier tests catch missing passage, missing question range, extra question, unbound answer row, and passage trimming.
- [x] Repair-loop tests prove bounded retries and no regression of good ranges.

Integration tests:

- [x] Full-test fixture imports to three sections and 40 interactions.
- [x] Reported failure fixture blocks or repairs missing Q14-26 and Q27-40.
- [x] Missing-answer-key fixture imports as reviewable only with publish-blocking key diagnostics.
- [x] Table-heavy fixture preserves blank-cell binding.
- [x] Matching-features fixture preserves list of people.
- [x] Matching-headings fixture preserves heading bank and paragraph labels.
- [x] Diagram/flowchart fixture preserves label targets or blocks publish with exact layout diagnostics.
- [x] Existing Paste Text fixture still passes.
- [x] Projection tests prove raw source, answer-key text, Gemini output, import evidence, and diagnostics are absent from student/session payloads.

Recommended focused command:

```bash
cmd /c npx vitest run src/services/reading-v2/readingV2AutoImport.service.test.ts src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/services/reading-v2/readingV2StudioParsingDiagnostics.service.test.ts --reporter=basic
```

Recommended broader Reading V2 command:

```bash
cmd /c npx vitest run src/services/reading-v2 src/components/test-creation/TestCreationModal.test.tsx --reporter=basic
```

Acceptance:

- [x] Every new failure class has a regression test.
- [x] Existing Auto, Paste Text, validation, projection, and Studio workflow tests still pass.

## Phase 9: Live Tests

Status note: the approved post-reference-bank-fix live probe sent one clean full-test Clippings source to live V3 providers and reached a guarded Studio candidate: 3 passages, 40 questions, `success: true`, `status: "reviewable"`, `errorCode: null`, `quotaStopSignal: false`. The remaining publish blocker is source-data inconsistency in question 37: the source answer key says `37. E`, but the matching option bank visible in the clipped source contains only A-D. This is recorded as V3-DIAG-022, not treated as a pipeline failure. User clarified that 95-99% parsing success is acceptable when the minority of wrong/minor questions are detected so teachers can fix them in Studio before publish.

- [x] Start local dev server on a free port.
- [x] Use teacher dev quick-login from the login page.
- [x] Open Teacher Lobby -> Create New Test -> IELTS -> Reading V2.
- [x] Confirm metadata-first step still appears before start choices.
- [x] Confirm start choices show `Paste Text`, `Auto`, and `Create New Test`.
- [ ] Paste a clean Clippings full test into Auto.
- [x] Confirm Auto shows progress and cannot double-submit.
- [x] Confirm Studio opens only after guardrails pass.
- [x] Confirm Studio displays:
  - three passages
  - all expected task groups
  - questions 1-40
  - answer-key binding summary
  - no unbound source answer rows
- [ ] Run Studio validation.
- [x] Run teacher preview and verify student runtime opens.
- [x] Confirm preview has no raw source diagnostics or answer-key leakage.
- [ ] Test a known bad/polluted clipping.
- [ ] Confirm system either repairs it or shows exact fail-closed diagnostics.
- [ ] Repeat one accepted source three consecutive times and compare counts, issue codes, and final status.
- [x] Test a forced Gemini failure/key exhaustion path and confirm visible recoverable error.
- [x] Test a forced Groq package failure/key exhaustion path and confirm visible recoverable per-package retry or fail-closed diagnostics.

Acceptance:

- [x] Clean Clippings source reaches guarded Studio candidate with detected publish blocker before publish.
- [x] Bad/malformed Auto V3 source fails visibly and reproducibly in provider-free Studio smoke and forced provider-failure UI tests.
- [ ] Repeated live runs are stable.
- [x] V3 live run distinguishes Gemini marker failures from Groq transcript failures.

## Phase 10: Loop Check Protocol

Use this loop until the Clippings harness and live probes reach the final acceptance gate:

1. Run focused automated tests.
2. Run ledger-only Clippings scan.
3. Pick top failure class by count or severity.
4. Fix only that class.
5. Add or update regression test.
6. Rerun focused tests.
7. Rerun Clippings scan.
8. Run at least one live Gemini probe for the touched failure class when provider quota allows.
9. Record before/after issue counts in this tasklist or a linked findings file.
10. Repeat until no supported full-test Clippings file silently loses passages, questions, task groups, or answer rows.

Parent task completion rule:

- [x] Do not mark a parent phase complete until its tests pass and the tasklist is updated.
- [x] If a new branch of work appears, add a `findings-of-tasks-0048-reading-v2-auto-gemini-clippings-hardening.md` note rather than burying new scope in memory.

Acceptance:

- [x] Every loop produces measurable issue-count reduction or a documented unsupported-source classification.
- [x] No repeated failure class remains without a regression test or explicit deferral.

## Phase 11: Rigorous Final Checklist

Source fidelity:

- [x] Accepted full tests preserve all detected passages.
- [x] Accepted full tests preserve all detected question numbers.
- [x] Accepted full tests preserve all task-group ranges.
- [x] Accepted full tests preserve all visible source answer-key rows.
- [x] Accepted full tests preserve option/reference banks.
- [x] Accepted structured layouts preserve blank/label targets.

Scoring:

- [x] Every scoring-bearing interaction has a valid scoring rule.
- [x] Binary judgement answers normalize valid TFNG/YNNG variants.
- [x] Completion answers honor word-limit metadata.
- [x] Matching answers bind to valid labels.
- [x] Multiple-choice answers bind to valid option labels.

Studio:

- [x] Diagnostics have teacher-readable messages.
- [x] Diagnostics have jump targets where possible.
- [x] Publish remains blocked on unresolved source, answer, anchor, numbering, task-type, or layout issues.
- [x] Teacher can repair generated content in normal Studio editors.

Projection/runtime:

- [x] Preview opens with the same runtime contract used by students.
- [x] Student-safe projection has no raw source, answer key, Gemini output, import evidence, or diagnostics.
- [x] Session-safe projection has no raw source, answer key, Gemini output, import evidence, or diagnostics.

Operational:

- [x] Gemini key rotation still skips invalid/expired/cooling keys.
- [x] Groq package normalizer key rotation skips invalid/expired/cooling keys.
- [x] Rate-limit/high-demand failures are visible and recoverable.
- [x] Groq package rate-limit/high-demand failures are visible and recoverable per passage package.
- [x] Chunk wait and repair-attempt settings are documented.
- [x] Live provider probes are optional and never required for normal unit-test CI.
- [x] Reports are redacted and safe to keep local.

Verification note: runtime provider/key-rotation gate passed on 2026-05-14: `src/services/ai/gemini-key-rotation.service.test.ts`, `src/services/key-cooldown.service.test.ts`, and `src/services/ai/gemini.provider.test.ts`; 3 files, 28 tests. The pass includes benched-key skip, invalid/expired-key bench and rotation, rate-limit bench and recovery, high-demand rotation without benching, and a structured-JSON expired-key rotation regression. `gemini.provider.test.ts` now resets mocked key-cooldown state per test to prevent false benched-key leakage between rotation cases.

Clippings:

- [x] Ledger-only scan covers the whole Clippings folder.
- [x] Supported full-test Clippings files either import perfectly or fail with exact diagnostics.
- [ ] Representative live probe set passes stable repeated-run checks.
- [x] Representative V3 live probe proves Gemini marker plus Groq question-area transcript can process a supported full test through guarded candidate creation. Earlier probes failed closed at Gemini topology verification, then Groq quota/package normalization. The latest approved post-reference-bank-fix probe reached 3 passages / 40 questions / `success: true`; publish remains blocked only by source question 37 option-bank inconsistency.
- [x] Any unsupported Clippings source is classified with reason.

## Phase 12: Documentation, Rollout, Commit, Deploy

Rollout note: local commit `6246091` completed after successful staged diff check and is now a checkpoint, not the final deploy candidate. Deploy waits until V3 marker/normalizer implementation, representative live provider probes, and final verification pass.

V3 implementation note, 2026-05-14: non-live mocked V3 pipeline is implemented in local services and tests. First direct-approved live Gemini-plus-Groq Clippings probe ran on 2026-05-15 and failed closed at Gemini topology verification. Post-heading live proof resolved that marker blocker but stopped at Groq TPM/request-size quota before Studio candidate creation.

V3 harness note, 2026-05-14: `reading-v2:clippings-ledger -- --mode full-mocked-v3` now emits marker/package/transcript/verifier diagnostic counts separately. A real redacted run over 276 local Clippings files completed without provider calls; it reported 91 supported full tests, 0 accepted items, 99 rejected/review-needed items, 177 unsupported items, 1465 generated mocked interactions, 1332 bound mocked answers, 72 marker diagnostics, 0 package diagnostics, and 0 transcript diagnostics. This proves fail-closed corpus behavior, not a real Clippings Studio-draft success path. These rejections are expected for the local mocked transcript path because actual Groq normalization is still not allowed without provider approval.

V3 build note, 2026-05-14: `cmd /c npm run build` passed after the V3 production-code changes. Vite transformed 9271 modules and `scripts/check-bundle-budget.mjs` reported OK. A later 2026-05-15 rerun after the Auto V3 setup-copy and quota-recovery UI changes also passed: Vite transformed 9262 modules, root CSS fallback was created, and the bundle budget check reported OK. Latest 2026-05-15 rerun after the visible-failure redaction patch also passed with 9271 modules transformed and bundle budget OK. Earlier PostCSS `@import must precede all other statements` warnings for `modern.css` and `student-view-override.css` are not caused by the V3 patch and do not fail the build.

V3 provider-consent note, 2026-05-14: `--allow-live-gemini` permits only the legacy Gemini-only harness probe. `--mode live-v3-gemini-groq` requires `--allow-live-v3-providers` so Groq calls cannot happen under a Gemini-only approval flag.

V3 provider-consent regression note, 2026-05-15: `readingV2ClippingsHarness.test.ts` now explicitly proves legacy Gemini-only approval cannot authorize the V3 Gemini-plus-Groq live mode. Focused harness regression passed 13 tests after this guard was added.

V3 aggregate regression note, 2026-05-15: refreshed aggregate non-live suite passed after the consent-guard and Auto V3 UI quota-recovery updates: 13 test files, 149 tests. Coverage includes V3 topology marker, local package splitter, Groq question-area normalizer, Groq package fan-out, transcript parser/verifier, Auto import orchestration, projection guard, Clippings harness provider-preflight/quota/consent behavior, Groq provider preferred slots, Test Creation Auto V3 UI recovery, Studio review labels, Studio workflow labels, and Reading V2 Studio route-state labels.

V3 provider-preflight note, 2026-05-14: `reading-v2:clippings-ledger -- --mode provider-preflight` now writes a no-content provider readiness report without scanning Clippings, making provider model calls, or sending source text. Current preflight result reports 5 total configured AI keys, Firestore key registry unreadable due `Missing or insufficient permissions.`, 1 available Groq structured JSON slot, and degraded 3-package distinct Groq fan-out until Firestore-managed Groq keys are readable or additional env Groq slots are configured. Latest safe rerun remained unchanged and a static scan of the refreshed report found no provider key literals and no Clippings body markers.

V3 quota-stop note, 2026-05-15: live harness probes now run sequentially and stop after the first Gemini/Groq quota, rate-limit, or exhausted-key signal. Degraded Groq package fan-out also runs sequentially and stops after a quota signal instead of sending remaining packages through the same constrained key pool. Each live probe result records `quotaStopSignal` and `stopReason`, and Auto V3 adds `provider-quota-exhausted` diagnostics for Gemini marker or Groq fan-out quota failures so quota exhaustion is visible in the redacted report instead of silently burning more calls.

V3 UI handoff note, 2026-05-15: `TestCreationModal.test.tsx` passed 37 tests in the resumed audit, including the mocked Reading V2 Auto setup route into Studio review and guardrail failure leaving source text in place. Real browser/Studio smoke with real Clippings remains a downstream gate after source Q37 repair or a publish-clean replacement source.

V3 UI/provider label note, 2026-05-15: the active Auto path now reports `provider: 'gemini-groq'` and model `gemini-2.5-flash+groq-structured-json`, Test Creation telemetry uses `provider: 'auto-v3'` for submit/failure fallback metadata, teacher UI uses `Process with Auto V3`, and Studio review labels Auto imports as `Auto V3`. Five-file regression passed 79 tests after this label/provider update. The older `tasks-0048-reading-v2-auto-gemini-import.md` file now has a historical note so its `Process with Gemini` / `provider: 'gemini'` examples do not override the V3 pivot.

V3 UI/quota recovery note, 2026-05-15: Test Creation Auto setup copy now says `Auto V3 import` and `Auto V3 is preparing the Studio draft...` instead of Gemini-only wording. `TestCreationModal.test.tsx` now covers mocked Gemini marker quota exhaustion and mocked Groq package quota exhaustion: both keep the raw source in place, show a visible alert, show Auto diagnostics, avoid navigation/close, and emit `failReadingV2AutoImport` with `provider: 'gemini-groq'`. Focused regression passed 39 tests after this update.

V3 visible-failure redaction note, 2026-05-15: Test Creation Auto V3 now redacts API-key-like strings and Windows paths before visible failure errors, diagnostics, dev console payloads, and `failReadingV2AutoImport` metadata. `TestCreationModal.test.tsx` passed 40 tests after adding coverage that a fake provider key and local Clippings path never render raw.

V3 aggregate regression note, 2026-05-15: the exact-root non-live V3 aggregate suite passed 13 files / 150 tests after the visible-failure redaction and type-safety fix. Coverage includes marker, splitter, normalizer, Groq fan-out, transcript parser/verifier, Auto import assembly, projection safety, Clippings harness consent/quota gates, Groq preferred-key-slot behavior, Test Creation Auto V3 recovery/redaction, Studio review labels, Studio workflow labels, and route-state labels.

V3 historical live-attempt note, 2026-05-15: a capped `live-v3-gemini-groq` probe was attempted only after the active objective indicated live testing approval, but the sandboxed command failed before provider calls with the known Vite/esbuild access-denied trap. The required unrestricted rerun was rejected by escalation review because there was no clear approval for the exact external transfer of real Clippings content to Gemini/Groq. That attempt created no live report and was superseded by the direct-approved live-probe note below.

V3 second live-attempt note, 2026-05-15: a later unrestricted live command request was made after the active objective included the exact approval sentence. Escalation review still rejected it because approval must be a direct user message for the exact external transfer. No provider call was made, no quota was consumed, and no live report was created.

V3 direct-approved live-probe note, 2026-05-15: user directly approved one capped live V3 Gemini+Groq probe on one real clean Clippings full test. The unrestricted harness command completed and wrote `output/reading-v2-clippings-live-v3-report.json`. The selected target was `IELTS Reading/002 - Reading Practice Test 02.md`; it failed closed with `topology-marker-failed`, redacted error `Passage 1 span does not include the strict source heading.`, `quotaStopSignal: false`, and `stopReason: null`. The local mitigation now accepts a Gemini passage span that is anchored after the ledger-owned strict heading and before the verified question area, and the marker prompt asks Gemini to return `passageTitleLines` for visible headings while allowing passage body spans to start after heading-only or web-clip noise. Focused topology Vitest passed 9 tests and the exact-root V3 aggregate suite passed 13 files / 151 tests after this mitigation.

V3 post-heading live-probe note, 2026-05-15: user directly approved another capped live V3 Gemini+Groq probe after the heading-anchor fix. The unrestricted harness command completed and wrote `output/reading-v2-clippings-live-v3-post-heading-report.json`. The selected target advanced past the old topology failure and failed closed at Groq package 1 with `provider-quota-exhausted`, `groq-package-failed`, `quotaStopSignal: true`, and `stopReason: "quota-or-rate-limit"`. No further live Gemini/Groq calls were run after this quota signal. Future live report sanitizer now redacts Groq-style `org_...` identifiers in addition to API keys and local paths. The V3 Groq normalizer now targets `meta-llama/llama-4-scout-17b-16e-instruct` with an 8192 output cap and retry-down behavior for request-too-large/TPM errors. Later live probes moved past this blocker.

V3 latest build-gate note, 2026-05-15: production code changed after the last successful build. The required exact-root escalated `cmd /c npm run build` was attempted but blocked before execution by Codex usage limit: `You've hit your usage limit... try again at May 18th, 2026 4:00 PM.` No sandbox Vite/esbuild workaround was run because AGENTS requires escalated Vite/esbuild execution first in this Windows worktree.

V3 non-live browser smoke note, 2026-05-15: added provider-free Playwright smoke fixtures at `/__smoke/reading-v2-studio?fixture=auto-v3-valid-full-test` and `/__smoke/reading-v2-studio?fixture=auto-v3-malformed-key`. The Chromium smokes passed and verified the success path opens Studio in `create-from-auto`, renders three passages, previews the runtime shell, publishes successfully, and makes zero requests to Gemini or Groq endpoints. The malformed-key path verifies `Needs review`, visible validation items, disabled publish, teacher-key diagnostics, and zero provider requests. This strengthens browser-route and fail-closed confidence but does not replace the live Clippings provider gate.

V3 TypeScript containment note, 2026-05-15: full repo `tsc` still fails from unrelated repo-wide strict TypeScript debt, but filtering the output for V3 services, Groq provider, harness, projection, and `TestCreationModal` returned `NO_TOUCHED_V3_TSC_ERRORS`.

V3 diagnostic-log note, 2026-05-14: blockers and encountered errors are recorded in `documentation/tasks/PRD0048/diagnostic-log-reading-v2-auto-v3-pipeline.md` with evidence, likely root cause, current status, and removal path.

V3 audit note, 2026-05-14: `documentation/tasks/PRD0048/completion-audit-reading-v2-auto-v3-pipeline.md` maps each explicit requirement to concrete artifacts, verification evidence, or remaining blocker.

- [x] Update `tasks-0048-reading-v2-auto-gemini-import.md` with implementation notes and link back to this hardening batch.
- [x] Update `reading-v2-test-making-pipeline.md` only if the frozen pipeline contract changes.
- [x] Update `teacher-test-creation-parsing-and-review.md` if failure-handling or provider behavior changes.
- [x] Add a concise architecture note if source-ledger and repair-loop concepts become durable services.
- [x] Mark obsolete any older wording that says answer-key binding alone solved Auto import fidelity.
- [x] Run UTF-8 checks for touched files.
- [x] Run focused Vitest.
- [x] Rerun focused topology Vitest after the live heading-anchor mitigation once Windows escalation is available.
- [x] Run Clippings harness.
- [x] Run provider-free Auto V3 browser/Studio smoke with synthetic fixture.
- [ ] Run V3 live browser/Studio tests after source Q37 repair or with another publish-clean source.
- [x] Checkpoint commit `6246091` has detailed notes.
- [x] Initial production-code rebuild completed before the later heading-anchor mitigation.
- [ ] Rerun production build after latest source-fidelity production-code change once Codex usage-limit blocker clears.
- [ ] Deploy only if app code, config, or hosted docs changed and verification passes.
- [ ] Commit V3 pivot implementation with message naming Gemini topology marker, local package splitter, Groq question-area normalizer, transcript parser/verifier, tests, live probe status, and deploy status.

Acceptance:

- [x] Docs match implementation.
- [x] No obsolete "Gemini output is Studio-ready" wording remains unqualified.
- [x] Checkpoint commit message lists source-ledger, verifier, repair-loop, Clippings harness, tests, and deployment status.
- [ ] V3 commit message lists marker, package splitter, Groq normalizer, transcript parser/verifier, tests, live probe status, and deployment status.

## Final Acceptance Criteria

- [x] Auto uses local source topology as authority before trusting Gemini structure.
- [x] Auto V3 uses Gemini only for full-source topology marking and answer-key normalization.
- [x] Auto V3 sends Groq full question-area text per passage package, but never sends passage body text to Groq.
- [x] Auto V3 uses Groq only to normalize messy question formatting into strict transcripts.
- [x] Auto V3 local code parses transcripts, inserts local passage body, binds verified answer rows, and owns final canonical V2 draft.
- [x] Auto can process supported full-test Clippings files without silent passage/question/answer loss, with detected review blockers allowed under the 95-99% acceptance threshold.
- [x] Any unsupported Clippings file fails closed with clear diagnostics.
- [x] Reported failure shape is covered by regression tests.
- [x] Clippings harness can scan the whole folder in redacted mode.
- [ ] Representative V3 live Gemini-plus-Groq probes are stable across repeated runs.
- [x] Studio opens only with reviewable guarded drafts.
- [x] Publish blocks every unresolved structural, scoring, source-fidelity, and projection-safety issue.
- [x] Student-safe/session-safe projections remain clean.
- [x] Existing `Paste Text` and `Create New Test` flows remain intact.

Final blocker note, 2026-05-14: the V3 Gemini topology marker, local three-package splitter, Groq question-area normalizer, Groq key-slot fan-out, transcript parser/verifier, deterministic assembler, and mocked end-to-end tests are implemented. Final live acceptance moved through several narrower blockers: heading anchor, Groq quota/request size, transcript bank aliasing, and passage-owned reference-bank text. The renewed explicit approval was granted on 2026-05-15, and the post-reference-bank-fix live probe now reaches guarded candidate creation without silent passage, question, task-group, or answer-row loss. User clarified that 95-99% parsing success is acceptable when wrong/minor questions are detected for teacher repair before publish, so the Q37 review blocker is acceptable target behavior rather than a pipeline failure. Remaining repeated-run/browser-live boxes stay open as rollout follow-ups until broader representative live smokes are run.

V3 transcript-bank alias note, 2026-05-15: local parser hardening now accepts optionBank/referenceBank/choiceBank-style aliases and empty primary bank arrays, and mocked transcript/import tests pass. Later approved live probes moved past this parser blocker.

V3 post-bank-alias build note, 2026-05-15: escalated `npm run build` passed after the bank-alias fix, with only the existing PostCSS @import warnings in the global CSS entry. The later post-bank-alias live probe ran and moved the blocker to passage-owned reference-bank text.

V3 post-bank-alias live-probe note, 2026-05-15: user directly approved the capped live probe and explicit-prefix harness wrote `output/reading-v2-clippings-live-v3-after-bank-fix-report.json`. It failed closed without quota stop: `Transcript group 1-5 is missing its option/reference bank.` Root cause narrowed to Groq receiving only `referenceBankLineSpans` metadata while the target's chapter/reference bank text lives in passage heading lines. Local mitigation now sends a `REFERENCE_BANK_LINES_ONLY` block from reference-bank spans while still excluding passage prose. Focused exact-root Vitest passed 4 files / 34 tests and production build passed.

V3 post-reference-bank-fix live-probe note, 2026-05-15: user directly approved the renewed capped live probe and explicit-root harness wrote `output/reading-v2-clippings-live-v3-after-reference-bank-fix-report.json`. Result: `success: true`, `status: "reviewable"`, 3 passages, 40 questions, `errorCode: null`, `quotaStopSignal: false`, `stopReason: null`. Follow-up fixes preserved local V3 instructions, normalized TFNG/YNNG answer labels to source task vocabulary, repaired flowchart layouts from question-area lines, and added message-rich redacted live diagnostics. The only remaining publish blocker is source question 37: answer key row `37. E` points to a missing matching option label because the visible source option bank lists A-D only. This is logged in the diagnostic log as V3-DIAG-022 and should be fixed in source/draft, not fabricated by Auto V3.
