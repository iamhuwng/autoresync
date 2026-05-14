# Task List: PRD-0048 Reading V2 Auto Gemini Clippings Hardening

> **Created:** 2026-05-14
> **Purpose:** Harden Reading V2 Auto import so raw IELTS Reading tests pasted from the local `Clippings` corpus can be converted into Studio drafts without silent passage loss, question loss, answer-key loss, task-type drift, or unsafe publishable output.
> **Scope:** Follow-up improvement batch for the existing Reading V2 `Auto` start mode. This task list strengthens source analysis, Gemini prompting, deterministic assembly, diagnostics, repair loops, live tests, and Clippings-scale verification.
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
Gemini = structure witness and extraction helper.
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
- `Auto` uses Gemini through Reading V2-owned service code.
- Studio remains the only long-lived review, repair, validation, preview, and publish surface.
- `Paste Text` remains the manual/external-AI fallback path.
- Student-safe and session-safe projections must not expose raw source, answer-key text, Gemini output, diagnostics, or import evidence.

## Non-Goals

- Do not copy V1 code into Reading V2.
- Do not replace the V2 canonical model with the V1 flat Reading model.
- Do not publish directly from Auto.
- Do not commit raw copyrighted Clippings content unless the repo already permits the exact fixture.
- Do not make Groq or Mistral providers part of this batch.
- Do not make Clippings harness reports expose full passage text or answer-key text in committed artifacts.

## Required Design From V1 Lessons

V1 worked because it separated source truth, AI extraction, rules classification, validation, and teacher review.

V2 should adopt the method, not the legacy model:

1. Build a raw-source ledger before Gemini.
2. Treat Gemini output as one witness.
3. Assemble canonical V2 data deterministically.
4. Compare generated structure back to the raw ledger.
5. Repair or fail by exact range and exact issue.
6. Send only reviewable, guarded data into Studio.

## Relevant Files

Expected primary files:

- `src/services/reading-v2/readingV2AutoImportSourceLedger.service.ts` - raw-source ledger, redacted topology summary, prompt ledger summary, and source-fidelity verifier.
- `src/services/reading-v2/readingV2AutoImport.service.ts` - Auto orchestration, chunking, Gemini calls, guardrails, candidate creation.
- `src/services/reading-v2/readingV2AutoImportPrompt.ts` - Gemini prompt contract.
- `src/services/reading-v2/readingV2ImportNormalization.service.ts` - import candidate normalization and answer-key binding.
- `src/services/reading-v2/readingV2StudioParsingDiagnostics.service.ts` - diagnostic report surface.
- `src/services/reading-v2/readingV2Validation.service.ts` - publish-blocking validation.
- `src/services/reading-v2/readingV2Projection.service.ts` - preview/student/session projection safety.
- `src/components/test-creation/TestCreationModal.tsx` - Auto entry UI and modal status.
- `src/components/reading-v2/studio/ReadingV2ImportReviewPanel.tsx` - Studio import diagnostics and teacher repair summary.
- `src/services/reading-v2/fixtures/readingV2PasteImportFixtures.ts` - in-repo synthetic fixtures.
- `scripts/reading-v2-clippings-harness.ts` - local-only redacted Clippings ledger scan harness.
- `documentation/architecture/reading-v2-auto-source-ledger-and-repair.md` - durable source-ledger, verifier, repair-loop, harness, and operational settings note.
- `package.json` - adds `reading-v2:clippings-ledger`.
- `.gitignore` - ignores local redacted Clippings harness reports.

Expected test files:

- `src/services/reading-v2/readingV2AutoImportSourceLedger.service.test.ts`
- `src/services/reading-v2/readingV2AutoImport.service.test.ts`
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

## Phase 2: Gemini Intermediate Contract

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

## Phase 3: Deterministic V2 Assembler And Binder

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

## Phase 5: Targeted Repair Loop

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

Blocked note: the remaining Phase 9 boxes require either real Clippings content sent to Google Gemini or a forced provider-failure run. They stay unchecked until the user explicitly approves those live/provider gates.

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
- [ ] Test a forced Gemini failure/key exhaustion path and confirm visible recoverable error.

Acceptance:

- [ ] Clean Clippings source reaches Studio complete and previewable.
- [ ] Bad Clippings source fails visibly and reproducibly.
- [ ] Repeated live runs are stable.

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
- [x] Rate-limit/high-demand failures are visible and recoverable.
- [x] Chunk wait and repair-attempt settings are documented.
- [x] Live Gemini probes are optional and never required for normal unit-test CI.
- [x] Reports are redacted and safe to keep local.

Verification note: runtime provider/key-rotation gate passed on 2026-05-14: `src/services/ai/gemini-key-rotation.service.test.ts`, `src/services/key-cooldown.service.test.ts`, and `src/services/ai/gemini.provider.test.ts`; 3 files, 28 tests. The pass includes benched-key skip, invalid/expired-key bench and rotation, rate-limit bench and recovery, high-demand rotation without benching, and a structured-JSON expired-key rotation regression. `gemini.provider.test.ts` now resets mocked key-cooldown state per test to prevent false benched-key leakage between rotation cases.

Clippings:

- [x] Ledger-only scan covers the whole Clippings folder.
- [x] Supported full-test Clippings files either import perfectly or fail with exact diagnostics.
- [ ] Representative live probe set passes stable repeated-run checks.
- [x] Any unsupported Clippings source is classified with reason.

## Phase 12: Documentation, Rollout, Commit, Deploy

Rollout note: local commit completed after successful staged diff check. Deploy waits until representative live Gemini Clippings probes are explicitly approved and pass.

- [x] Update `tasks-0048-reading-v2-auto-gemini-import.md` with implementation notes and link back to this hardening batch.
- [x] Update `reading-v2-test-making-pipeline.md` only if the frozen pipeline contract changes.
- [x] Update `teacher-test-creation-parsing-and-review.md` if failure-handling or provider behavior changes.
- [x] Add a concise architecture note if source-ledger and repair-loop concepts become durable services.
- [x] Mark obsolete any older wording that says answer-key binding alone solved Auto import fidelity.
- [x] Run UTF-8 checks for touched files.
- [x] Run focused Vitest.
- [x] Run Clippings harness.
- [x] Run live browser tests.
- [x] Commit with detailed notes.
- [x] Rebuild only if production code changed.
- [ ] Deploy only if app code, config, or hosted docs changed and verification passes.

Acceptance:

- [x] Docs match implementation.
- [x] No obsolete "Gemini output is Studio-ready" wording remains unqualified.
- [x] Commit message lists source-ledger, verifier, repair-loop, Clippings harness, tests, and deployment status.

## Final Acceptance Criteria

- [x] Auto uses local source topology as authority before trusting Gemini structure.
- [ ] Auto can process supported full-test Clippings files without silent passage/question/answer loss.
- [x] Any unsupported Clippings file fails closed with clear diagnostics.
- [x] Reported failure shape is covered by regression tests.
- [x] Clippings harness can scan the whole folder in redacted mode.
- [ ] Representative live Gemini probes are stable across repeated runs.
- [x] Studio opens only with reviewable guarded drafts.
- [x] Publish blocks every unresolved structural, scoring, source-fidelity, and projection-safety issue.
- [x] Student-safe/session-safe projections remain clean.
- [x] Existing `Paste Text` and `Create New Test` flows remain intact.

Final blocker note: non-live code, docs, harness, build, provider tests, and regression tests are complete and locally committed, but final acceptance remains unchecked until representative live Gemini probes prove real supported Clippings sources do not silently lose passages, questions, task groups, or answer rows.
