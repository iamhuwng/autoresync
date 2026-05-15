# Task List: PRD-0048 Reading V2 Auto Gemini Import

> **Created:** 2026-05-07
> **Purpose:** Add a third Reading V2 start option, `Auto`, that lets a teacher paste one raw reading-test text block, processes it through the internal Gemini AI service, then opens the generated draft in Studio for teacher review.
> **Scope:** Extend the existing Teacher Lobby -> TestCreationModal -> Reading V2 metadata -> Studio pipeline. Do not replace Paste Text or Create New Test.
> **Primary source PRD:** `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
> **Pipeline source:** `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
> **Implemented:** 2026-05-07 with mocked Gemini tests, Studio handoff tests, import/projection guard tests, UTF-8 check, and diff whitespace check.

This task list supplements, but does not replace:

- `documentation/tasks/tasks-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-paste-import-and-answer-key-authority.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-gemini-clippings-hardening.md`

## Follow-Up Hardening Batch

Historical status, 2026-05-15: this file records the original Gemini-only Auto import batch and its May 13/14 hardening lineage. Do not treat the unchecked Gemini-only items below as the active V3 backlog. The active V3 contract now lives in `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-gemini-clippings-hardening.md` and pivots the shipped Auto path to:

```text
Gemini topology marker + answer-key normalizer
-> local three-passage package splitter
-> Groq question-area transcript normalizer
-> local deterministic V2 assembler/verifier
```

Current UI/provider labels: teacher action is `Process with Auto V3`, action metadata uses `auto-v3`, and successful V3 service output reports provider `gemini-groq`. Legacy `Process with Gemini` and `provider: 'gemini'` examples below are historical Gemini-only contract notes unless explicitly scoped to the old path.

The May 13 answer-key hotfix solved the narrow case where Gemini returned visible source answer rows but Studio received none. It does not by itself prove full-source fidelity across bad Clippings structure, material splitting, missing question ranges, or repeated live Gemini runs.

Use `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-gemini-clippings-hardening.md` for the next improvement batch. That tasklist owns the source-ledger, deterministic assembler, verifier, targeted repair loop, Clippings harness, live tests, loop-check protocol, and final perfection checklist.

## Implementation Result

- [x] Added `Auto` beside `Paste Text` and `Create New Test` in the Reading V2 metadata-first start step.
- [x] Added an Auto modal step with one required raw-test textarea and no `Copy Prompt` or separate teacher-answer-key field.
- [x] Added a Reading V2-owned Gemini facade: `src/services/reading-v2/readingV2AutoImport.service.ts`.
- [x] Added a dedicated Auto prompt builder: `src/services/reading-v2/readingV2AutoImportPrompt.ts`.
- [x] Added chunked full-test handling by `READING PASSAGE` headings with a configurable wait between Gemini calls.
- [x] Added guardrails for empty/large input, malformed Gemini JSON, no passages, no questions, duplicate numbers, passage-count mismatch, likely trimmed passages, and failed normalization.
- [x] Added answer no-hallucination guardrail: when the raw source has no visible answer-key section, Gemini answers are stripped before Studio handoff.
- [x] Hotfix 2026-05-13: answer-key handoff now preserves trusted top-level `answerKeyText` rows returned by Gemini when they are copied from a visible raw-source answer-key section, even if the local row extractor missed the format.
- [x] Hotfix 2026-05-13: when raw source has a visible answer-key heading but neither local extraction nor Gemini `answerKeyText` yields rows, Auto may synthesize `answerKeyText` from Gemini `questions[].answer`; this fallback is disabled when no visible source answer-key heading exists.
- [x] Added `auto-gemini` import provenance and Studio labels.
- [x] Added `create-from-auto` Studio mode and route-state handoff through `/teacher/reading-v2/import`.
- [x] Added feature tracking actions for Auto submit/success/failure and Studio Auto import open.
- [x] Verified student-safe projection guards still pass.
- [x] Existing `Paste Text` and `Create New Test` routes remain intact in focused tests.
- [x] Hotfix 2026-05-13: `generateStructuredJson(...)` now rotates to the next Gemini key when the selected key returns `API_KEY_INVALID`, "API key expired", forbidden/blocked, quota, rate-limit, or transient availability errors.
- [x] Hotfix 2026-05-13: expired/invalid structured-generation keys are benched through `key-cooldown.service` so Reading V2 Auto does not keep retrying the same bad key in the same browser session.
- [x] Hotfix 2026-05-13: external and Auto prompt contracts now declare top-level `answerKeyText` as the answer-key carrier for Studio binding.
- [x] Hardening 2026-05-14: Auto now builds a redacted raw-source ledger before Gemini, passes ledger expectations into each Gemini prompt, and verifies Gemini output against passage/question/answer-key topology before Studio handoff.
- [x] Hardening 2026-05-14: Auto fails closed with `source-passage-missing`, `source-question-missing`, `source-question-extra`, `source-answer-row-unbound`, or `source-question-range-missing` diagnostics when source-ledger coverage is not preserved.
- [x] Hardening 2026-05-14: Auto retries only the failing source chunk(s) when ledger verification reports missing passage/question/answer coverage, preserves previously valid chunks, reruns the verifier, and emits `source-repair-attempted`, `source-repair-succeeded`, or `source-repair-failed` diagnostics.
- [x] Hardening 2026-05-14: partial single-passage sources with full answer-key sections now keep only answer-key rows that match detected source questions, preventing unrelated full-test key rows from creating unbound Studio rows.
- [x] Hardening 2026-05-14: added a local redacted Clippings harness via `npm run reading-v2:clippings-ledger -- --out output/reading-v2-clippings-ledger-report.json`; current ledger-only scan covered 276 files, found 91 supported full-test candidates, and produced 72 accepted / 20 reviewable / 7 rejected / 177 unsupported classifications without raw passage or answer-key text.
- [x] Hardening 2026-05-14: added mocked-intermediate harness mode via `npm run reading-v2:clippings-ledger -- --mode mocked-intermediate --out output/reading-v2-clippings-ledger-report-mocked.json`; current mocked scan produced 64 accepted / 8 reviewable / 27 rejected / 177 unsupported classifications, 3439 generated interactions, 3062 bound answers, and redacted representative picks.
- [x] Hardening 2026-05-14: added optional live Gemini harness mode behind `--mode live-gemini --allow-live-gemini`, with `--live-limit` and `--live-tags` for curated representative probes.
- [x] Hardening 2026-05-14: documented source-ledger, verifier, repair-loop, harness modes, and operational knobs in `documentation/architecture/reading-v2-auto-source-ledger-and-repair.md`.

Provider evidence:

- [x] Active Google Cloud account/project checked with `gcloud auth list` and `gcloud config get-value project`.
- [x] `generativelanguage.googleapis.com` confirmed enabled in active project.
- [x] API-key listing confirmed a Gemini key with localhost browser referrers exists.
- [x] 2026-05-13 gcloud lookup mapped `VITE_GEMINI_API_KEY_1` to Cloud display name `Gemini API Key` and `VITE_GEMINI_API_KEY_3` to `Generative Language API Key`; `VITE_GEMINI_API_KEY_2` did not resolve through the active account/project lookup and is the likely problematic env slot for the observed expired-key error. Raw key strings were not recorded.
- [x] 2026-05-13 Firebase Hosting deploy passed: `cmd /c npm run deploy:hosting` built successfully and released target `kahut1` for project `temp-a1437` at `https://kahut1.web.app`.
- [ ] Real Gemini provider probes from `Clippings/` were not rerun in this implementation turn; prior probe evidence should remain separate from mocked CI tests.

## Current Baseline To Preserve

Current Reading V2 creation behavior:

1. Teacher starts from the existing Teacher Lobby new-test flow.
2. `TestCreationModal` routes `IELTS` -> `Reading V2` through metadata first.
3. After metadata, `ReadingV2StartStep` currently shows:
   - `Paste Text`
   - `Create New Test`
4. `Paste Text` opens the existing in-modal paste setup step with `Copy Prompt`, `Passages and questions`, and `Teacher answer key`.
5. `Paste Text` builds `initialImportCandidate` with `createReadingV2ImportCandidateFromText(...)`, then opens `/teacher/reading-v2/import`.
6. Studio remains the review, repair, validation, preview, and publish surface.

Auto must add a new branch to this system, not create a separate editor or bypass Studio.

## Decision Contract

Reading V2 Auto must use this invariant:

```text
Raw pasted test text = teacher-provided source.
Gemini = draft structure helper only.
Extracted answer key = valid only when traceable to source text.
Studio = review, repair, validation, preview, publish.
```

Current meaning of "extracted answer key":

1. First preference: locally extracted numbered answer-key rows from the raw source.
2. Second preference: Gemini-returned top-level `answerKeyText`, but only as copied rows from visible raw-source answer-key text.
3. Last guarded fallback: Gemini `questions[].answer` may be converted into `answerKeyText` only when the raw source visibly contains an answer-key heading and row-level extraction missed the exact format.

Obsolete wording retired 2026-05-13: "extracted answer key" no longer means only `extractedAnswerKeyText` from the local preflight parser. Code and docs must use `answerKeyText` for the effective trusted key rows that Studio receives.

Auto means:

1. The teacher sees a third start option named `Auto` beside `Paste Text` and `Create New Test`.
2. Clicking `Auto` opens a focused modal step that requires only one raw test text input.
3. The teacher does not copy an external prompt and does not fill a separate answer-key field.
4. The app sends the raw source to the internal Gemini service.
5. Gemini returns a structured Reading V2 draft candidate.
6. The app opens Studio with the generated draft ready for review.

Auto does not mean:

1. Publishing directly from the modal.
2. Trusting AI output as final.
3. Guessing answers when the raw text has no answer key.
4. Replacing the existing Paste Text workflow.
5. Sending teacher source text into student-safe, session-safe, or public projections.

## Evidence Standard

A task may be checked only when real behavior exists and has focused verification.

The following do not count as completion:

- a visible `Auto` button that still opens the existing Paste Text flow
- a Gemini call that returns text but is not normalized into the canonical Reading V2 draft model
- a generated draft that skips Studio review
- AI-generated answers that are not traceable to a source answer-key section
- successful happy-path UI with no tests for Gemini failure, quota/rate limit, malformed JSON, or no-answer-key input

## Relevant Files

Primary files likely to change:

- `src/components/test-creation/TestCreationModal.tsx`
- `src/components/test-creation/TestCreationModal.test.tsx`
- `src/services/reading-v2/readingV2AutoImport.service.ts`
- `src/services/reading-v2/readingV2AutoImport.service.test.ts`
- `src/services/reading-v2/readingV2AutoImportPrompt.ts`
- `src/services/reading-v2/readingV2AutoImportPrompt.test.ts`
- `src/services/reading-v2/readingV2ImportNormalization.service.ts`
- `src/services/reading-v2/readingV2StudioWorkflow.service.ts`
- `src/components/reading-v2/studio/ReadingV2ImportReviewPanel.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
- `src/services/ai/router.service.ts`
- `src/services/ai/gemini.provider.ts`
- `src/services/ai/gemini-key-rotation.service.ts`
- `src/services/key-cooldown.service.ts`

Supporting files likely to inspect:

- `src/types/readingV2Taxonomy.ts`
- `src/services/reading-v2/readingV2StudioParsingDiagnostics.service.ts`
- `src/services/reading-v2/fixtures/readingV2PasteImportFixtures.ts`
- `src/services/reading-v2/readingV2Projection.service.ts`
- `src/config/env.config.ts`

## Safety Gates Before Implementation

- [ ] Read `DESIGN.md` before changing the modal or start-option UI.
- [ ] Read `documentation/rules/codebase-hygiene.md` before adding imports or changing shared import data contracts.
- [ ] Read `documentation/rules/observability.md` before adding the Auto button, modal actions, and Studio handoff events.
- [ ] Read `documentation/rules/react-patterns.md` before adding loading, pending, retry, timeout, or component state.
- [ ] Read `documentation/rules/mobile-portability.md` before using clipboard, browser globals, storage, or direct navigation helpers.
- [ ] Confirm whether the existing client-side Gemini service is acceptable for this teacher-facing feature, or whether the Gemini call must move behind a trusted backend/API boundary before release.

## Phase 1: Entry Flow And UX Contract

- [ ] Extend the Reading V2 start mode union from `create-blank | create-from-import` to include an Auto mode, for example `create-from-auto`.
- [ ] Add `Auto` to `READING_V2_START_OPTIONS` beside `Paste Text` and `Create New Test`.
- [ ] Keep metadata-first behavior unchanged before showing the three start options.
- [ ] Route `Paste Text` to the existing `reading-v2-import` setup step unchanged.
- [ ] Route `Create New Test` to the existing blank Studio create route unchanged.
- [ ] Route `Auto` to a focused Auto modal step inside `TestCreationModal`, for example `reading-v2-auto`.
- [ ] Preserve the modal close and back behavior used by the current Reading V2 start and paste setup flow.
- [ ] Keep the Auto card responsive at desktop, tablet, and phone widths without text overlap or card nesting.

Acceptance:

- [ ] Teacher can go `IELTS` -> `Reading V2` -> metadata -> see exactly three choices: `Paste Text`, `Auto`, `Create New Test`.
- [ ] Existing `Paste Text` and `Create New Test` tests still pass with unchanged user-visible behavior.

## Phase 2: Auto Modal Step

- [ ] Build a `ReadingV2AutoImportStep` UI owned by `TestCreationModal.tsx` or extracted only if it improves local readability.
- [ ] Include one required textarea for raw test text.
- [ ] Include clear actions for `Process with Gemini`, `Clear`, and cancel/back.
- [ ] Show line count and character count without logging source content.
- [ ] Disable submit when the raw text is empty or below a defensible minimum length.
- [ ] Disable duplicate submits while Gemini is running.
- [ ] Preserve the raw text after Gemini failure so the teacher can retry.
- [ ] Show specific error states for:
  - missing Gemini API key
  - all Gemini keys exhausted or cooling down
  - rate limit or high-demand response
  - empty Gemini response
  - malformed JSON
  - no passages detected
  - question count mismatch
  - no answer key found in source text
- [ ] Make no teacher answer-key textarea in Auto.
- [ ] Make no `Copy Prompt` action in Auto.

Acceptance:

- [ ] Auto modal only requires the raw test text input.
- [ ] Teacher source stays in the modal on every recoverable failure.
- [ ] Auto failure never opens Studio with a partial or unvalidated AI payload unless the teacher explicitly chooses a supported review path.

## Phase 3: Gemini Service Boundary

- [ ] Add `readingV2AutoImport.service.ts` as the Reading V2-owned facade over the internal Gemini service.
- [ ] Use Gemini intentionally, not provider fallback by accident. Prefer a `gemini-only` path or a direct `geminiProvider.generateStructuredJson(...)` call wrapped by the Reading V2 service.
- [ ] Reuse existing key loading, key rotation, cooldown, and retry behavior where possible.
- [x] 2026-05-13 hotfix: structured JSON generation now reuses shared cooldown classification for invalid/expired keys and retries the next Gemini key before failing Auto import.
- [ ] Avoid parallel Gemini calls for one teacher request unless rate-limit handling explicitly supports it.
- [ ] Add config-controlled waits between passage chunks so the flow can respect the current Gemini free-tier limits.
- [ ] Include a max input size check and a clear error when the pasted source is too large for the configured mode.
- [ ] Add an abort/cancel path if the user closes the modal during a long request.
- [ ] Return a typed result:

```ts
type ReadingV2AutoImportResult =
  | {
      success: true;
      structuredPayloadText: string;
      answerKeyText?: string;
      diagnostics: ReadingV2AutoImportDiagnostic[];
      provider: 'gemini';
      model: string;
    }
  | {
      success: false;
      error: string;
      diagnostics: ReadingV2AutoImportDiagnostic[];
      provider: 'gemini';
      model?: string;
    };
```

Acceptance:

- [ ] UI code does not know Gemini prompt details.
- [ ] Reading V2 service owns the prompt, response parse, diagnostics, and import-candidate conversion.
- [ ] A mocked Gemini provider can fully test success and failure without real network calls.

## Phase 4: Prompt And Output Contract

- [ ] Create `readingV2AutoImportPrompt.ts`.
- [ ] Prompt Gemini to output the same structured Reading V2 payload shape already accepted by `normalizeReadingV2ImportCandidate(...)`.
- [ ] Require JSON-only output through `generateStructuredJson(...)` options where supported.
- [ ] Include current Reading V2 task taxonomy names and required fields in the prompt.
- [ ] Instruct Gemini to preserve passage text verbatim except for harmless whitespace normalization.
- [ ] Instruct Gemini to preserve all question numbers, option labels, table cells, diagram labels, and section instructions.
- [ ] Instruct Gemini to copy answer-key rows into top-level `answerKeyText` only from visible source answer-key text, including cases where app pre-detection missed the row format.
- [ ] Instruct Gemini to leave answers empty and report `answer_key_missing` when no answer key is present.
- [ ] Instruct Gemini to add diagnostics instead of inventing missing content.
- [ ] Wrap or serialize the returned structured payload into the marker format already parsed by `extractStructuredPayload(...)`, unless the normalizer is extended to accept a typed object directly.

Acceptance:

- [ ] Generated payload can be passed into `createReadingV2ImportCandidateFromText(...)`.
- [ ] No answer appears in `answerKeyText` unless it is traceable to visible source answer-key text.
- [ ] Prompt tests lock the no-hallucination instructions and marker/JSON contract.

## Phase 5: Chunking And Stability Strategy

- [ ] Add a single-pass mode for small one-passage or short full-test inputs.
- [ ] Add a chunked mode for full IELTS reading tests split by `READING PASSAGE 1`, `READING PASSAGE 2`, and `READING PASSAGE 3`.
- [ ] Keep the source answer-key section available to every chunk, or extract it once and merge after chunk generation.
- [ ] Merge chunk outputs into one ordered structured payload.
- [ ] Validate merged question numbering is continuous and non-duplicated.
- [ ] Validate expected full-test count when source clearly indicates a full test, normally 40 questions.
- [ ] Add retry with bounded backoff for retryable Gemini errors.
- [ ] Bench or cool down keys on quota, rate-limit, or permission errors using existing cooldown rules.
- [ ] Fail closed when all keys are exhausted or cooling down.

Acceptance:

- [ ] A three-passage full test does not depend on one giant Gemini response.
- [ ] Rate-limit handling produces a recoverable modal error, not a broken Studio draft.
- [ ] Re-running the same input produces stable passage/question/answer counts in mocked fixture tests.

## Phase 6: Import Candidate And Studio Handoff

- [ ] Decide whether to extend `ReadingV2ImportCandidate.sourceKind` with `auto-gemini`.
- [ ] If adding `auto-gemini`, update every source-kind label, diagnostic, projection, and test that currently assumes only `pasted-text | uploaded-file`.
- [ ] If not adding `auto-gemini`, add clear evidence/provenance so Studio still labels the source as Auto-generated from Gemini.
- [ ] Build `initialImportCandidate` from the structured payload text plus effective trusted `answerKeyText` rows; this may come from local extraction, Gemini top-level `answerKeyText`, or the guarded visible-heading fallback from `questions[].answer`.
- [ ] Preserve original raw source as private import evidence or diagnostics only if it is not included in student-safe or session-safe projections.
- [ ] Navigate to `/teacher/reading-v2/import` with:
  - `entryPoint: 'test-creation-modal'`
  - `startMode: 'create-from-auto'`
  - `initialMetadata`
  - `initialImportCandidate`
- [ ] Ensure `resolveReadingV2StudioWorkflowContext(...)` accepts Auto mode and opens Studio with the generated draft.
- [ ] Ensure `ReadingV2ImportReviewPanel` and Studio diagnostics show Auto provenance and unresolved warnings.

Acceptance:

- [ ] After Gemini success, Studio opens with passages, question groups, interactions, and answer-key diagnostics visible for review.
- [ ] Teacher can edit the generated content in normal Studio editors.
- [ ] Validation still blocks publish on missing anchors, missing answers, malformed option banks, bad numbering, or unresolved scoring issues.

## Phase 7: No-Hallucination Guardrails

- [ ] Compare source passage text against generated passage text and flag large deletions, additions, or paraphrases.
- [ ] Reject outputs that omit a detected passage heading or merge two passages without evidence.
- [ ] Reject outputs with duplicate or skipped question numbers unless the source also shows that numbering.
- [ ] Reject outputs that create answer rows when no source answer-key section exists.
- [ ] Flag answer rows whose source line cannot be identified.
- [ ] Flag generated options, headings, or matching banks that do not appear in source text.
- [ ] Flag tables, flowcharts, diagrams, or note-completion structures when cells/blanks/labels are missing.
- [ ] Send any unresolved guardrail failure to the teacher as modal diagnostics before Studio handoff, or as publish-blocking Studio diagnostics when safe to review.

Acceptance:

- [ ] Auto cannot silently trim passages.
- [ ] Auto cannot silently invent answers.
- [ ] Auto cannot silently invent option banks or labels.

## Phase 8: Observability, Privacy, And Projection Safety

- [ ] Add action tracking for:
  - Auto option opened
  - Auto modal submitted
  - Gemini request started
  - Gemini request succeeded
  - Gemini request failed
  - Gemini request rate-limited
  - Auto payload rejected by guardrails
  - Auto Studio handoff completed
- [ ] Track metadata such as character count, passage count, question count, provider, model, latency, and error code.
- [ ] Do not log raw source text, answer-key text, API keys, or full Gemini output.
- [ ] Confirm `readingV2Projection.service.ts` strips Auto source, answer-key text, import evidence, and diagnostics from student-safe and session-safe projections.
- [ ] Confirm review/analytics projections expose only teacher-safe or admin-safe data.
- [ ] Document whether the current Gemini key strategy is client-side only, and add a release blocker if production needs a server-side proxy.

Acceptance:

- [ ] Telemetry can diagnose provider stability without leaking test content or answer keys.
- [ ] Student runtime cannot see raw source, answer key, Gemini diagnostics, or import evidence.

## Phase 9: Tests

Unit tests:

- [ ] `TestCreationModal.test.tsx` covers the three Reading V2 start choices.
- [ ] `TestCreationModal.test.tsx` covers Auto modal empty input, submit, loading, success, clear, cancel/back, and error states.
- [ ] `readingV2AutoImportPrompt.test.ts` covers prompt invariants and JSON/marker contract.
- [ ] `readingV2AutoImport.service.test.ts` covers success, malformed JSON, empty response, key exhaustion, rate limit, no passage, no answer key, duplicate numbering, and hallucinated answer rejection.
- [ ] `readingV2ImportNormalization.service.test.ts` covers Auto candidate shape or `auto-gemini` source kind if added.
- [ ] `readingV2StudioWorkflow.service.test.ts` covers `create-from-auto` route state hydration.
- [ ] `ReadingV2ImportReviewPanel.test.tsx` covers Auto source/provenance labels.
- [ ] Projection tests verify Auto source and answer-key text are not student-visible.

Integration tests:

- [ ] Mocked Gemini full-test fixture opens Studio with three passages and 40 questions.
- [ ] Mocked Gemini one-passage fixture opens Studio with expected passage and question group structure.
- [ ] Missing-answer-key fixture opens Studio or modal diagnostics with publish-blocking answer-key state.
- [ ] Table, diagram, flowchart, matching, binary-judgement, and completion task fixtures preserve their structured layouts.
- [ ] Existing Paste Text full-test fixture still passes.

Manual or non-CI provider probes:

- [ ] Run real Gemini probes against several local `Clippings/` sources without committing copyrighted source text unless already approved.
- [ ] Require at least three consecutive stable runs on one repeated source before claiming consistency.
- [ ] Require multiple source families: normal full test, table-heavy passage, diagram/flowchart passage, matching-heavy passage, and a known difficult source.
- [ ] Record provider failures separately from model-quality failures.

Recommended command form when implementing tests on Windows:

```bash
cmd /c npx vitest run src/components/test-creation/TestCreationModal.test.tsx src/services/reading-v2/readingV2AutoImport.service.test.ts --reporter=basic
```

## Phase 10: Documentation And Rollout

- [ ] Update this task list with implementation notes after each completed phase.
- [ ] Update Reading V2 test-making docs only if the Auto flow changes the frozen pipeline contract.
- [ ] Add a short teacher-facing release note if Auto becomes available behind a feature flag.
- [ ] Add or confirm feature flag/config gating for Auto if Gemini availability is not production-stable.
- [ ] Keep `Paste Text` documented as the manual/external-AI fallback.
- [ ] Keep `Create New Test` documented as the blank authoring path.

Implementation note 2026-05-13: Auto answer-key binding hotfix is complete for the reported Studio failure where Gemini produced structured questions but Studio saw zero answer-key rows. Root cause: `readingV2AutoImport.service.ts` previously trusted only local `extractedAnswerKeyText`; when preflight row extraction missed a visible key format, the merged payload discarded Gemini answer-key evidence and Studio received empty `answerKeyText`. The service now merges local rows plus Gemini top-level `answerKeyText`, emits `answer-key-returned-by-gemini` diagnostics for that path, and synthesizes rows from `questions[].answer` only when the raw source has a visible answer-key heading. Prompt contracts now tell Gemini to copy raw-source key rows into top-level `answerKeyText`. Files touched: `src/services/reading-v2/readingV2AutoImport.service.ts`, `src/services/reading-v2/readingV2AutoImport.service.test.ts`, `src/services/reading-v2/readingV2AutoImportPrompt.ts`, `src/services/reading-v2/readingV2AutoImportPrompt.test.ts`, `src/services/reading-v2/readingV2ExternalAiPrompt.service.ts`, `src/services/reading-v2/readingV2ExternalAiPrompt.service.test.ts`, and related documentation. Verification: focused Vitest passed for 21 tests across Auto service and prompt contracts; UTF-8 and `git diff --check` passed. Real Gemini provider probes from `Clippings/` were not rerun in this hotfix turn.

## Final Acceptance Criteria

- [ ] Reading V2 metadata-first flow now offers `Paste Text`, `Auto`, and `Create New Test`.
- [ ] `Auto` opens a modal step that requires only pasted raw test text.
- [ ] `Auto` uses the internal Gemini service, not external teacher-managed AI.
- [ ] Gemini output is converted into the canonical Reading V2 import candidate.
- [ ] Studio opens with the generated draft for teacher review.
- [ ] Teacher can repair generated passages, question groups, interactions, and answers in normal Studio editors.
- [ ] Missing or uncertain AI output is visible and publish-blocking when it affects scoring, anchors, numbering, or runtime behavior.
- [ ] Auto never invents answers when the raw source has no answer-key section.
- [ ] Auto never silently trims or paraphrases passage text.
- [ ] Existing `Paste Text` and `Create New Test` workflows remain intact.
- [ ] Student-safe and session-safe projections do not leak raw source, answer key, Gemini output, import evidence, or diagnostics.
- [ ] Mocked tests pass, and real-provider probes are recorded separately as operational evidence.

## Out Of Scope

- Replacing Paste Text.
- Replacing Create New Test.
- Supporting Groq or Mistral as Auto providers in this task list.
- Uploading PDF/DOCX directly through Auto.
- Publishing without Studio review.
- Committing raw copyrighted clipping fixtures unless the repo already permits those fixtures.
