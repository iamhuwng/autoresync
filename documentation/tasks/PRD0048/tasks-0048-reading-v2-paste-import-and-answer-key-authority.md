# Task List: PRD-0048 Reading V2 Paste Import And Teacher Answer-Key Authority

> **Created:** 2026-05-06
> **Revised:** 2026-05-06 after Reading V2 creation pipeline fix
> **Purpose:** Add a safe Reading V2 paste-import automation flow with two teacher inputs: passages plus questions, and a separate authoritative answer key.
> **Scope:** Extend the existing Teacher Lobby -> TestCreationModal -> Reading V2 Studio pipeline with paste import, answer-key parsing, canonical answer binding, validation, projection safety, runtime submit, scoring, and verification gates.
> **Primary source PRD:** `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
> **Pipeline source:** `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`

This task list supplements, but does not replace:

- `documentation/tasks/tasks-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-task-type-editor-parity.md`

## Current Baseline After Pipeline Fix

This task list now starts from the fixed Reading V2 creation gateway, not from a missing-entry assumption.

Current behavior to preserve:

1. Teacher Lobby opens `TestCreationModal` as the existing new-test entry.
2. In `TestCreationModal`, selecting `IELTS` -> `Reading V2` now stays in the modal and moves to the metadata step first.
3. After metadata, the modal shows a Reading V2 start step with:
   - `Paste Text` -> a focused in-modal paste setup step
   - `Create New Test` -> `/teacher/reading-v2/create`
4. The Reading V2 paste setup step has a `Copy Prompt` button, a `Passages and questions` textarea, and a `Teacher answer key` textarea.
5. `Parse & Review in Studio` analyzes the pasted source into a Reading V2 import candidate, preserves the teacher answer key separately, then opens `/teacher/reading-v2/import`.
6. The modal passes `initialMetadata` and `initialImportCandidate` in route state to `ReadingV2StudioPage`.
7. `ReadingV2StudioPage` forwards that metadata and candidate into `resolveReadingV2StudioWorkflowContext`, so Studio opens with the teacher-entered metadata and parsed draft content ready for review.
8. `/teacher/reading-v2/import` still resolves to Studio `create-from-import` mode.
9. Studio remains the review, repair, validation, preview, and publish surface after parsing.

Verified baseline:

- `TestCreationModal.test.tsx` covers metadata-before-V2-start, the paste setup step, and parsed import route state.
- `ReadingV2StudioPage.test.tsx` covers import route mode plus modal route-state metadata and import-candidate hydration.
- `readingV2StudioWorkflow.service.test.ts` covers draft seeding from modal metadata and modal-prepared import candidates.

## Revised Integration Strategy

Build with the current system, not beside it:

1. Keep `TestCreationModal` as the metadata and start-choice gateway.
2. Put the paste setup UX in a focused modal step before Studio, like the THCS paste flow.
3. Keep `ReadingV2StudioPage` as the owner of Reading V2 review, repair, validation, preview, and publish after parsing.
4. Treat route-state `initialMetadata` as draft seed only; after Studio draft creation, Studio metadata remains the source of truth.
5. Treat route-state `initialImportCandidate` as the handoff from modal parse setup into Studio review.
6. Keep teacher answer-key text as structured import candidate data, then bind it into canonical interactions during/after import normalization.
7. Keep normal Studio editors as the repair surface after import acceptance.

## Decision Contract

Reading V2 paste import must use this invariant:

```text
Passages + questions input = visible test content source.
Teacher answer key input = marking truth.
AI/import parser = draft structure helper only.
V2 validation = compatibility gate.
```

Teacher answer key authority means:

1. V2 must never replace teacher answers with AI or heuristic answers.
2. Marking must use canonical scoring rules derived from the teacher answer key.
3. Publish must stay blocked when the teacher key cannot bind cleanly to extracted questions, task types, option banks, blanks, or response shapes.
4. Student-safe and session-safe projections must never expose teacher answer keys, scoring rules, import evidence, or author diagnostics.
5. Binary judgement keys and typed student answers must accept valid casing, spacing, punctuation, and abbreviation variants such as `TRUE`, `true`, `T`, `FALSE`, `false`, `F`, `NOT GIVEN`, `not given`, and `NG`; they must not accept misspellings such as `FLASE`.

Teacher answer key authority does not mean:

1. Publish succeeds when the key is malformed.
2. Publish succeeds when the key conflicts with task type.
3. Publish succeeds when structured blanks, table cells, flow steps, or diagram targets are missing.
4. Student runtime or scorer guesses around bad authoring data.

## Evidence Standard

A task may be checked only when real Reading V2 behavior exists and has focused verification.

The following do not count as completion:

- a second textarea that is not persisted into import candidate data
- answer-key text that is parsed but not bound to canonical interactions
- AI answers or structured payload answers overriding the teacher key
- publish passing with unresolved key-binding diagnostics
- runtime display that works only for fixtures but not Studio-created imports
- tests that verify helper parsing without validating publish, projection, submit, and scoring effects

## UI Placement And Teacher Workflow Contract

### Where The Feature Shows

The paste automation feature belongs inside Reading V2 Studio import mode, not in a separate product.

Allowed visible locations:

1. Teacher starts from Teacher Lobby and opens `TestCreationModal`.
2. Teacher chooses `IELTS` -> `Reading V2`, fills Reading V2 metadata, then chooses a start mode.
3. `Paste Text` opens a focused Reading V2 paste setup step in the same modal; `Create New Test` opens `/teacher/reading-v2/create`.
4. The paste setup step provides `Copy Prompt`, `Passages and questions`, `Teacher answer key`, and `Parse & Review in Studio`.
5. After parse, `/teacher/reading-v2/import` opens `ReadingV2StudioPage` in `create-from-import` mode with metadata and import candidate seeded from route state.
6. Studio opens as the review and repair editor, not as the first paste-input surface.
7. Repair happens in the existing passage editor, task-group editors, answer-key rows, validation summary, and preview/publish workflow.

Forbidden visible locations:

1. No new standalone Reading V2 import page outside Studio.
2. No second metadata modal between the Reading V2 start choice and paste setup.
3. No Studio-first paste setup that forces teachers to work inside the full editor before parsing.
4. No duplicate import setup surfaces competing in `ReadingV2StudioShell` and `ReadingV2TeacherStudioPanels`.
5. No separate top-level `Answer Key` tab.
6. No separate answer-key product that writes a second source of truth.
7. No publish path that bypasses Studio validation and preview.

### Teacher Workflow

The teacher workflow must be:

1. Teacher opens the new-test modal from Teacher Lobby.
2. Teacher chooses `IELTS` -> `Reading V2`.
3. Teacher fills Reading V2 metadata in the modal.
4. Teacher chooses `Paste Text`.
5. The modal opens the Reading V2 paste setup step.
6. Teacher copies the external-AI prompt when needed.
7. Teacher pastes passages plus questions into the primary text field.
8. Teacher pastes the teacher-owned answer key into the secondary text field.
9. Teacher clicks `Parse & Review in Studio`.
10. Studio opens in import mode with the teacher-entered metadata and parsed candidate seeded into the draft context.
11. Parsed content appears in the normal Studio Build Workspace.
12. Any unresolved key, structure, task-type, option-bank, or blank-binding issue appears as a Studio diagnostic with a jump target.
13. Teacher repairs in the relevant existing editor.
14. Validate and Preview use normal Studio controls.
15. Publish remains blocked until the teacher answer key is fully bound and compatible with the draft structure.

### Modal Paste Setup Layout

Desktop and tablet:

- Use a work-focused modal step after the Reading V2 start choice, not the full Studio editor.
- Header: mode label, title, source status, and concise import status badge.
- Main body: two input regions.
  - Left / primary: `Passages and questions`, large textarea, dominant width.
  - Right / secondary: `Teacher answer key`, narrower textarea, sticky enough to compare while scrolling if practical.
- Above fields: source name/file name and optional source type controls.
- Prompt strip: `Copy Prompt` for external AI processing.
- Footer/action bar: Back, Cancel, and `Parse & Review in Studio`.
- Studio diagnostics appear after route handoff, not as the first paste-input experience.
- Do not put cards inside cards; use Studio panel sections and compact diagnostics rows.

Phone:

- Stack fields vertically.
- Show `Passages and questions` first.
- Show `Teacher answer key` second.
- Keep Analyze Import and diagnostics reachable without horizontal scrolling.
- Use compact accordions or sections for diagnostics; do not hide publish blockers behind developer-only UI.

### Components To Add Or Reshape

Implementation may keep existing names if cleaner, but the UI responsibilities must be explicit:

- `TestCreationModal`
  - Owns the Reading V2 metadata step, start-choice step, and paste setup step.
  - `Paste Text` must stay in-modal until `Parse & Review in Studio`.
- `ReadingV2ImportSetupStep`
  - Shows `Copy Prompt`, `Passages and questions`, `Teacher answer key`, and parse handoff status.
  - Emits source text and answer-key text separately.
- `ReadingV2ImportCandidate`
  - Carries source text, teacher answer-key text, import evidence, uncertainty, and publish blockers across the modal-to-Studio boundary.

Prefer keeping `ReadingV2ImportReviewPanel` as a Studio review/status surface after parsing. Before adding or changing Studio import UI, audit the current duplicate mounting points in `ReadingV2StudioShell` and `ReadingV2TeacherStudioPanels` and choose one visible owner per active Studio view.

- `ReadingV2ImportReviewPanel`
  - Shows import review/status after modal parse handoff.
  - Does not become the primary paste setup UX for Teacher Lobby `Paste Text`.
- `ReadingV2ImportSourceTextField`
  - Large passages plus questions paste area.
  - Emits source text only.
- `ReadingV2TeacherAnswerKeyField`
  - Teacher answer-key paste area.
  - Emits answer-key text only.
- `ReadingV2ImportActionBar`
  - Analyze, clear, accept into draft, and disabled states.
- `ReadingV2ImportStructureSummary`
  - Shows detected passages, question ranges, task groups, and task-type guesses.
- `ReadingV2AnswerKeyBindingSummary`
  - Shows parsed answer count, bound count, missing rows, extra rows, duplicates, and conflicts.
- `ReadingV2ImportDiagnosticsList`
  - Groups source, key, binding, task-type, option-bank, structured-layout, projection, and publish issues.
- `ReadingV2ImportStatusBadge`
  - Shows empty, ready to analyze, analyzing, analyzed with blockers, analyzed clean, accepted into draft.

Existing components that must stay in the flow:

- `ReadingV2StudioPage`
- `ReadingV2StudioShell`
- `ReadingV2BuildWorkspace`
- `ReadingV2TeacherStudioPanels`
- task-type editor components in `ReadingV2BuildWorkspace`
- `ReadingV2TableCompletionBuilder`
- validation summary and preview/publish controls

### Required UI States

- Empty source
- Source present, key empty
- Source and key present
- Analyzing
- Unsupported source structure
- Partial multi-passage parse
- Key parse failed
- Key parse succeeded with missing or extra rows
- Key bound with task-type conflicts
- Key bound with structured-layout conflicts
- Accepted into draft with unresolved diagnostics
- Accepted into draft and key authoritative
- Preview blocked
- Publish blocked
- Publish ready

### UI Evidence Standard

Browser evidence for this feature must prove:

1. The import route shows the two-field setup surface.
2. The teacher can paste source and key independently.
3. Analyze Import updates structure and key diagnostics.
4. Accept Into Draft writes visible content into normal Studio editors.
5. Diagnostics jump to the correct passage, question group, answer row, option bank, table cell, flow step, or diagram answer row.
6. Validation and Preview stay in the normal Studio workflow.
7. Student-safe preview does not expose raw key text, scoring rules, import evidence, or author diagnostics.
8. Desktop/tablet layout has no overlap and keeps both inputs usable.
9. Phone layout stacks cleanly and keeps blockers visible.

## Safety And Design Gates

- Read `DESIGN.md` before UI implementation work.
- Read `documentation/rules/observability.md` before adding or modifying teacher-facing import actions.
- Read `documentation/rules/codebase-hygiene.md` before writing imports or producer/consumer data contracts.
- Read `documentation/rules/react-patterns.md` before creating new reusable components or state initialized as `pending` or `loading`.
- Read `documentation/rules/mobile-portability.md` before writing browser-global, storage, or direct navigation code.
- Do not add a separate top-level Answer Key product or tab.
- Do not import legacy Reading V1 parser, renderer, scoring, or flat-question reconstruction helpers into V2.
- Do not import `@mantine/*`.

## Relevant Implementation Files

- `src/components/reading-v2/studio/ReadingV2ImportReviewPanel.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioModalAdapter.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioOperationalStates.ts`
- `src/components/reading-v2/studio/ReadingV2TeacherStudioPanels.tsx`
- `src/components/reading-v2/studio/ReadingV2MetadataPanel.tsx`
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`
- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx`
- `src/config/featureRegistry.ts`
- `src/services/reading-v2/readingV2ImportNormalization.service.ts`
- `src/services/reading-v2/readingV2Validation.service.ts`
- `src/services/reading-v2/readingV2Projection.service.ts`
- `src/services/reading-v2/readingV2ResultAdapter.service.ts`
- `src/services/reading-v2/readingV2TrustedSubmissionProcessor.service.ts`
- `src/types/readingV2.types.ts`
- `src/types/readingV2Taxonomy.ts`
- `functions/src/readingV2SubmitCore.ts`

Reference analogs for teacher import UX only, not for Reading V2 data ownership:

- `src/components/thcs-editor/THCSSetupStep.tsx`
- `src/components/thcs-editor/THCSDocumentUpload.tsx`
- `src/components/thcs-editor/THCSParseReviewPanel.tsx`
- `src/components/thcs-editor/THCSBulkPasteModal.tsx`

## Phase 0: Source And Current-State Audit

- [x] 0.1 Confirm the fixed creation gateway: Teacher Lobby -> `TestCreationModal` -> `IELTS` -> `Reading V2` -> metadata -> `Paste Text` / `Create New Test`.
- [x] 0.2 Confirm `Paste Text` now opens the focused Reading V2 paste setup step before Studio.
- [x] 0.3 Confirm the current `/teacher/reading-v2/import` route still resolves to `create-from-import`.
- [x] 0.4 Confirm Reading V2 Studio remains the owner of review, repair, validation, preview, and publish.
- [x] 0.5 Confirm import candidate shape carries source text plus separate teacher answer-key text.
- [x] 0.6 Confirm current plain-text import behavior for one passage, multiple passages, and structured payload markers.
- [x] 0.7 Confirm current scoring path uses canonical `scoringRule.acceptableAnswers` from published snapshots.
- [x] 0.8 Confirm current projection sanitization strips answer keys and scoring rules.
- [x] 0.9 Confirm feature registry action coverage for import-related Studio actions.

Implementation note 2026-05-06: Read-only audit confirmed the modal-to-Studio route, import behavior, scoring source, projection sanitization, and feature-registry action coverage. Current edge case found and patched: plain-text multi-passage input still uses the single-passage fallback, so it now fails closed with publish-blocking diagnostics instead of silently truncating after Passage 1. Files touched in this pass: `src/services/reading-v2/readingV2ImportNormalization.service.ts`, `src/services/reading-v2/readingV2ImportNormalization.service.test.ts`, `src/services/reading-v2/readingV2Projection.service.ts`, `src/services/reading-v2/readingV2ResultAdapter.service.ts`, `src/services/reading-v2/readingV2ResultAdapter.service.test.ts`, `src/services/reading-v2/readingV2TrustedSubmissionProcessor.service.test.ts`, `src/components/reading-v2/studio/ReadingV2ImportReviewPanel.tsx`, and this task list. Verification so far: focused Vitest suites for import normalization, projection, modal handoff, Studio hydration, result adapter, trusted submission, plus targeted UTF-8 checks.

**Acceptance Criteria:** The `Current Baseline After Pipeline Fix` section stays current, and a short implementation note exists in the PR or task comment showing current behavior, edge cases, and the exact files touched.

**Not Complete If:** Work starts by adding UI without confirming current import, validation, projection, and scoring behavior.

## Phase 1: Modal Paste Setup And Studio Handoff

- [x] 1.1 Preserve the fixed `TestCreationModal` metadata/start-choice gateway; do not build another metadata modal or import route.
- [x] 1.2 Make `Paste Text` open a focused modal paste setup step before Studio.
- [x] 1.3 Add a `Copy Prompt` action for the external AI processing step.
- [x] 1.4 Add two paste fields in the modal setup step:
  - `Passages and questions`
  - `Teacher answer key`
- [x] 1.5 Use responsive modal layout where passages/questions and teacher key sit side by side when space allows and stack when narrow.
- [x] 1.6 Add file-name/source controls for supported upload paths if file import is reintroduced to this modal step.
- [x] 1.7 Add a modal footer action: `Parse & Review in Studio`.
- [x] 1.8 Add Clear/reset affordance if teachers need to restart the paste setup without closing the modal.
- [x] 1.9 Rename action copy so teachers understand the next stop is Studio review, not direct publish.
- [x] 1.10 Disable parse when passages plus questions are empty.
- [x] 1.11 Keep teacher answer key optional for draft creation but publish-blocking until bound and valid.
- [x] 1.12 Add teacher-facing diagnostics for key missing, key malformed, key partially bound, and key fully bound.
- [x] 1.13 After parse, hand off metadata and import candidate to Studio, where normal editors become the repair surface.
- [x] 1.14 Reuse or extend `ReadingV2StudioOperationalStates` for import idle, analyzing, import failure, validation failure, ready, and conflict feedback.
- [x] 1.15 Keep metadata visible before publish through `ReadingV2MetadataPanel` and publish readiness visible through `ReadingV2SettingsPanel`.
- [x] 1.16 Track new import prompt/parse actions through `FEATURE_IDS.testCreation` and `featureRegistry.ts`.
- [x] 1.17 Add focused component/page tests for both textareas, parse payload, empty-state disabling, route-state handoff, and Studio hydration.
- [x] 1.18 Add browser evidence for modal placement, desktop/tablet layout, phone layout, parse handoff, Studio review, and diagnostics visibility.

Implementation note 2026-05-06: Step 1.3 copy behavior is hardened. `Copy Prompt` now uses the platform clipboard adapter, falls back from `navigator.clipboard.writeText` to a selected textarea copy path, tracks success or failure, and reveals the external AI prompt as read-only text if browser copy is blocked. Files touched for this fix: `src/core/platform/hooks/useClipboard.ts`, `src/core/platform/hooks/useClipboard.test.ts`, `src/core/platform/index.ts`, `src/components/test-creation/TestCreationModal.tsx`, `src/components/test-creation/TestCreationModal.test.tsx`, and this task list. Verification: focused Vitest suite passed for the clipboard hook, modal copy success, modal blocked-copy fallback, and broader Reading V2 import/scoring/projection regressions. Browser probe also confirmed Teacher quick-login -> Lobby -> Reading V2 paste setup -> `Copy Prompt` changes to `Copied` and clipboard text includes `CODEX_IELTS_READING_MATERIALS_START`; at that checkpoint, step 1.18 still needed full desktop/tablet/phone and Studio diagnostics evidence.

Implementation note 2026-05-06: Step 1.3 prompt content upgraded from a minimal example to a foundational external-AI conversion protocol. The prompt now lives in `src/services/reading-v2/readingV2ExternalAiPrompt.service.ts`, shares the structured-marker constants with the importer, lists every canonical Reading V2 task-type slug, requires one material per passage for full tests, explains section-instruction/question binding, covers `labeledOptions`, `sectionReferences`, `wordLimit`, table/flowchart/diagram preservation, answer-key audit expectations, separator rules, and fail-closed diagnostics. Files touched for this upgrade: `src/services/reading-v2/readingV2ExternalAiPrompt.service.ts`, `src/services/reading-v2/readingV2ExternalAiPrompt.service.test.ts`, `src/services/reading-v2/readingV2ImportNormalization.service.ts`, `src/services/reading-v2/readingV2ImportNormalization.service.test.ts`, `src/components/test-creation/TestCreationModal.tsx`, `src/components/test-creation/TestCreationModal.test.tsx`, and this task list. Verification: focused prompt-contract, structured-import, and modal copy tests passed. Browser probe also confirmed Teacher quick-login -> Lobby -> Reading V2 paste setup -> `Copy Prompt` copies the upgraded protocol with `answerKeyAudit`, canonical task slugs, and fail-closed Passage 2/3 language. This does not complete Phase 3/5/6/7/9 parser and diagnostics gates by itself; it strengthens the external-AI handoff that feeds them.

Implementation note 2026-05-07: Step 1.3 prompt content is now hardened for truly external AI services with no app/system context. The first lines no longer rely on `Reading V2 import` insider wording; the prompt now states that all app knowledge is inside the prompt, defines every imported field, adds a task-type recognition table with IELTS instruction patterns, separates `labeledOptions` from `sectionReferences`, warns against mixing table/flowchart/diagram examples into one instruction, adds standalone structured-layout mini examples, and ends with a preflight checklist for visible question numbers, instruction IDs, answer-key binding, structured blank targets, full-test passage coverage, and no invented answers. Files touched: `src/services/reading-v2/readingV2ExternalAiPrompt.service.ts`, `src/services/reading-v2/readingV2ExternalAiPrompt.service.test.ts`, and this task list. Verification: prompt-contract/import-normalization Vitest passed, modal Copy Prompt Vitest passed, and filtered TypeScript output showed no prompt/modal touched-file errors.

Implementation note 2026-05-06: Steps 1.12 and 1.14 are complete. Studio import review now shows teacher-facing key authority states for missing, malformed, partially bound, and fully authoritative answer keys, and operational states now include import idle, analyzing, ready, failure, validation failure, and conflict coverage without creating a second notification system. Verification: focused Studio diagnostics, import review panel, settings panel, shell, and operational-state tests passed.

Implementation note 2026-05-06: Steps 1.6, 1.8, and 1.15 are complete. File upload was not reintroduced into the paste setup, so the modal remains explicitly pasted-text only and carries `sourceKind: pasted-text` into Studio. The paste setup now has a Clear action that resets passages, teacher key, copy fallback, and errors without closing the modal, and the Studio page now keeps `ReadingV2MetadataPanel` plus `ReadingV2SettingsPanel` visible before publish. Verification: focused modal and Studio shell tests cover clear/reset, action tracking, metadata visibility, and publish readiness visibility.

Implementation note 2026-05-06: Step 1.18 is complete. Browser smoke coverage now exercises import-mode Studio from paste fixtures on desktop, tablet, and phone, captures diagnostics visibility, teacher preview handoff, publish success, malformed-key repair jump, and publish-blocked behavior, and saves evidence JSON/screenshots under `output/playwright/reading-v2-paste-import-gate/`. Verification: `cmd /c npx playwright test e2e/reading-v2-studio-smoke.spec.ts --project=chromium --reporter=line` passed with seven browser cases and no page errors or unfiltered request failures.

**Acceptance Criteria:** Teacher Lobby paste import shows a clear auto test-making workflow: metadata, paste setup modal, copy prompt, paste source, paste teacher key, parse into Studio, repair in normal Studio editors, validate, preview, and publish only when clean.

**Not Complete If:** Teacher answer-key text is appended to source text, parsed from the same field, stored only in component state, hidden in developer details, or shown in a detached page/modal that bypasses Studio.

## Phase 2: Teacher Answer-Key Data Contract

- [x] 2.1 Add a typed teacher answer-key payload to the Reading V2 import candidate.
- [x] 2.2 Store raw answer-key text for diagnostics and repair history.
- [x] 2.3 Parse answer-key entries into question-numbered rows with:
  - question number
  - raw answer text
  - parsed answer values
  - source line
  - diagnostics
  - binding status
- [x] 2.4 Treat `|` as the only default separator for accepted alternatives.
- [x] 2.5 Preserve `/` as literal answer text unless a later explicit structured syntax says otherwise.
- [x] 2.6 Detect duplicate question numbers.
- [x] 2.7 Detect missing answer text.
- [x] 2.8 Detect unsupported heading or passage grouping formats with clear diagnostics.
- [x] 2.9 Add parser tests for plain lines, `Q1`, `1.`, `1)`, colon, equals, pipe alternatives, slash literals, duplicate rows, and blank answers.

**Acceptance Criteria:** Answer-key parsing is deterministic and produces diagnostics instead of silently dropping questionable lines.

**Not Complete If:** Slash-separated text is blindly split into separate answers, or malformed answer lines disappear without an import issue.

## Phase 3: Multi-Passage Paste Import Foundation

- [x] 3.1 Replace single `firstPassageBlock()` fallback behavior for paste import with explicit multi-passage handling or fail-closed diagnostics.
- [x] 3.2 Support pasted full tests with Reading Passage 1, 2, and 3 when the structure is detectable.
- [x] 3.3 Preserve passage titles, paragraph boundaries, question groups, and question ranges per passage.
- [x] 3.4 Detect partial parse when Passage 2 or 3 is present but not normalized.
- [x] 3.5 Create publish-blocking diagnostics for unsupported passage structure.
- [x] 3.6 Add tests for one-passage, three-passage, missing passage heading, and mixed passage heading formats.

**Acceptance Criteria:** A full IELTS Reading paste cannot silently become a one-passage draft.

**Not Complete If:** A source containing three passages imports only Passage 1 without a blocking diagnostic.

Implementation note 2026-05-06: Phase 3 is complete for detectable plain-text passage headings. The importer now splits `READING PASSAGE 1/2/3` blocks, including mixed markdown and plain headings, into separate Reading V2 sections while preserving each passage title, paragraph anchors, question groups, ranges, visible numbers, and teacher-key binding. Missing passage headings still import as a single editable passage rather than fabricating a full-test structure. Verification: import-normalization tests now cover one-passage, three-passage, missing-heading, and mixed-heading paths.

## Phase 4: Key Binding Into Canonical Interactions

- [x] 4.1 Bind parsed teacher key rows to canonical interactions by visible question number after draft structure exists.
- [x] 4.2 Apply teacher key values to `interaction.scoringRule.acceptableAnswers`.
- [x] 4.3 Preserve the raw teacher key row next to binding diagnostics, not in student projections.
- [x] 4.4 Mark interactions with no bound teacher key as publish-blocking.
- [x] 4.5 Mark teacher key rows with no matching interaction as publish-blocking.
- [x] 4.6 Detect duplicate visible question numbers before binding.
- [x] 4.7 Keep AI, structured payload, or heuristic answers from overriding teacher key values.
- [x] 4.8 Add tests proving teacher key wins over structured payload `answer` fields.

**Acceptance Criteria:** Canonical scoring rules used for marking come from the teacher answer key when a teacher key is supplied.

**Not Complete If:** Imported AI answers can overwrite, merge into, or silently replace teacher answers.

## Phase 5: Task-Type Compatibility Validation

- [x] 5.1 Add or extend validation diagnostics for TFNG vs YNNG mismatch.
- [x] 5.2 Add diagnostics when a choice answer is not in its option bank.
- [x] 5.3 Trim answer labels when validating option-bank membership to avoid false publish blocks.
- [x] 5.4 Add diagnostics when single-choice key has multiple selected answers.
- [x] 5.5 Add diagnostics when multi-select key count does not match `selectionLimit`.
- [x] 5.6 Ensure multi-select imported keys set or validate `orderMatters: false`.
- [x] 5.7 Add diagnostics when completion answers exceed the task word limit.
- [x] 5.8 Add diagnostics when completion prompts lack visible blank markers.
- [x] 5.9 Add tests for every canonical response-shape conflict.

Implementation note 2026-05-06: Phase 5 compatibility gates are complete in the validation/scoring foundation. `validateReadingV2Draft` now blocks wrong TFNG/YNNG vocabulary, missing option-bank answers, stale labels after relabeling, single-choice rows with multiple answers, multi-select count mismatches, multi-select keys without `orderMatters: false`, over-word-limit completion answers, completion prompts without visible blanks, duplicate imported visible numbers, and structured-entry shell mismatches. Import normalization now writes `orderMatters: false` for multi-select teacher keys. Files touched: `src/services/reading-v2/readingV2Validation.service.ts`, `src/services/reading-v2/readingV2Validation.service.test.ts`, `src/services/reading-v2/readingV2ImportNormalization.service.ts`, `src/services/reading-v2/readingV2ImportNormalization.service.test.ts`, `src/services/reading-v2/readingV2ResultAdapter.service.ts`, `src/services/reading-v2/readingV2ResultAdapter.service.test.ts`, and this task list. Verification: focused Vitest passed for validation, import normalization, and result adapter suites.

**Acceptance Criteria:** Teacher key is absolute only after it is compatible with task type and response shape.

**Not Complete If:** A bad task-type guess can publish because the answer key is present.

## Phase 6: Option Bank And Matching Drift Guards

- [x] 6.1 Resolve imported matching and choice answers against option labels and option IDs.
- [x] 6.2 Store enough binding metadata to detect stale option-bank mappings after option relabeling.
- [x] 6.3 Clear or invalidate bindings when a selected option is deleted.
- [x] 6.4 Detect duplicate matching answers when reuse is disallowed.
- [x] 6.5 Detect teacher key rows that reference missing roman labels or letter labels.
- [x] 6.6 Add tests for matching answers stored as labels, option IDs, roman headings, and relabeled options.
- [x] 6.7 Add tests for matching-headings no-reuse and matching-information reuse behavior.

Implementation note 2026-05-06: Phase 6 option-bank drift guards are complete at canonical validation and scoring boundaries. Option answers now validate against trimmed labels and stable option IDs, missing roman/letter labels block publish, stale labels after option relabeling invalidate the key, stable option IDs remain valid across relabeling, deleted/missing options are blocked by option-bank membership validation, duplicate matching answers are blocked when reuse is disallowed, and matching-information reuse remains allowed. Scoring resolves option IDs back to current labels so imported keys and runtime submissions can use either labels or option IDs without hidden drift. Verification: validation and result-adapter regression tests cover labels, IDs, roman headings, relabeled options, no-reuse, and reuse.

**Acceptance Criteria:** Matching and option-key scoring remains stable or becomes explicitly blocked when option labels drift.

**Not Complete If:** A relabeled option can make the editor look empty while scoring still uses stale hidden data.

## Phase 7: Structured Layout Binding Guards

- [x] 7.1 Table completion: require every answer-key row to bind to a visible table blank.
- [x] 7.2 Table completion: block blank cells without stable cell IDs, anchors, and inline blank markers.
- [x] 7.3 Flowchart completion: require every answer-key row to bind to a flow-step anchor.
- [x] 7.4 Flowchart completion: block empty steps, duplicate step IDs, and question rows not linked to blank steps.
- [x] 7.5 Diagram labeling: require image source plus one valid label target per scored answer.
- [x] 7.6 Diagram labeling: support source diagrams with printed number indicators without forcing teacher coordinate recreation as the primary workflow.
- [x] 7.7 Block structured-entry shell mismatch before publish.
- [x] 7.8 Add tests for table blank binding, flow-step binding, diagram image/target binding, and structured shell mismatch.

Implementation note 2026-05-06: Steps 7.1 and 7.2 are complete for table-completion import. Structured external-AI payloads can now carry `sectionInstructions[].table.rows`; normalization turns them into a real `table-shell` / `table-content` stimulus, creates stable cell IDs, adds table-cell anchors for `questionNumber` / `questionNumbers`, links imported interactions to those visible blank anchors, and keeps flattened table-only question text publish-blocked with `Table Completion needs a table before publishing.` The prompt now explicitly tells external AI not to flatten tables and shows multi-blank table cells with `questionNumbers`. Files touched: `src/services/reading-v2/readingV2ImportNormalization.service.ts`, `src/services/reading-v2/readingV2ImportNormalization.service.test.ts`, `src/services/reading-v2/readingV2ExternalAiPrompt.service.ts`, `src/services/reading-v2/readingV2ExternalAiPrompt.service.test.ts`, and this task list. Verification: focused Vitest passed for prompt contract, import normalization, validation table guards, and table builder. UTF-8 and `git diff --check` also passed for touched files. At that checkpoint, step 7.6 still needed source-diagram printed-number import UX.

Implementation note 2026-05-06: Steps 7.3, 7.4, 7.5, 7.7, and 7.8 are complete at publish validation. Flowchart completion now requires valid flow-step anchors and blocks empty/duplicate/unlinked steps; diagram labeling requires image source plus valid hotspot anchors; structured-entry response shape must match the visible table/flowchart/diagram shell before publish. Regression tests cover table blank binding, flow-step binding, diagram image/target binding, and shell mismatch. At that checkpoint, step 7.6 still needed source-diagram printed-number import UX because it is separate from publish validation.

Implementation note 2026-05-06: Step 7.6 is complete for structured paste import. External-AI payloads can now carry `sectionInstructions[].diagram` with `imageUrl`, `imageAlt`, and printed label targets bound by `questionNumber` or `questionNumbers`; coordinates are optional when numbers are already printed on the source diagram. Normalization turns that payload into a real `diagram-shell` / `diagram-content` stimulus, creates stable `diagram-hotspot` anchors, assigns deterministic fallback coordinates, and links imported interactions to those visible target anchors so teachers do not need to recreate coordinates as the primary repair path. Verification: focused Vitest passed for import normalization, prompt contract, and diagram validation.

**Acceptance Criteria:** Structured tasks cannot publish unless the teacher key binds to the visible blank or label target that students see.

**Not Complete If:** Runtime discovers the mismatch first and shows an unavailable state after publish.

## Phase 8: Trusted Submission And Scoring Hardening

- [x] 8.1 Reject array-shaped student answers for scalar response shapes.
- [x] 8.2 Require arrays for multi-select scoring or normalize only through the multi-select path.
- [x] 8.3 Cross-check submitted `interactionId`, `taskGroupId`, and visible/display number against the projection before persistence.
- [x] 8.4 Keep scoring bound to the published snapshot version used at attempt time.
- [x] 8.5 Add result-adapter tests for wrong-shaped scalar answers.
- [x] 8.6 Add trusted-submission tests for tampered `taskGroupId`, tampered display number, stale interaction ID, and wrong response shape.
- [x] 8.7 Add submit-core tests for matching and multi-select labels vs option IDs.

Implementation note 2026-05-06: Step 8.7 is complete. Submit/scoring core tests now prove matching and multi-select answers score correctly when canonical keys or submitted answers use option labels or option IDs. Scored review answers resolve stable option IDs to current labels.

**Acceptance Criteria:** Runtime submit and server-side scoring cannot make a bad or tampered answer payload look consistent.

**Not Complete If:** A single-choice interaction can score from `['A']`, or an answer with a wrong display number is persisted as-is.

## Phase 9: Studio Repair Workflow

- [x] 9.1 Show import diagnostics grouped by:
  - source structure
  - answer key parse
  - question binding
  - task-type compatibility
  - structured layout binding
  - projection safety
- [x] 9.2 Add jump links from diagnostics to the relevant passage, question group, interaction, option bank, table cell, flow step, or diagram answer row.
- [x] 9.3 Add a "teacher key is authoritative" status when every scoring interaction is bound and valid.
- [x] 9.4 Add a "publish blocked by key binding" status when any key issue remains.
- [x] 9.5 Keep repair inside existing Studio task editors and task-group answer-key controls.
- [x] 9.6 Add tests for diagnostics display and repair state transitions.

**Acceptance Criteria:** Teacher can repair failed automation without leaving Studio or editing hidden developer data.

**Not Complete If:** Diagnostics exist only in developer details, console logs, or raw JSON.

Implementation note 2026-05-06: Phase 9 Studio repair diagnostics are complete. `buildReadingV2TeacherImportDiagnostics` now derives grouped teacher-facing diagnostics for source structure, answer-key parse, question binding, task-type compatibility, option banks, structured layout, projection safety, and publish readiness. The visible Studio import review panel shows raw teacher key rows next to key diagnostics, key authority status, publish-blocked-by-key status, and Review jump actions that route to existing passage/question/publish repair surfaces. `featureRegistry.ts` now tracks the `jumpImportDiagnostic` action. Verification: focused Vitest passed for the diagnostics service, import review panel, Studio shell jump transition, settings readiness copy, and operational-state coverage.

## Phase 10: Projection Safety And Runtime Output Proof

- [x] 10.1 Generate preview projection from imported draft after teacher-key binding.
- [x] 10.2 Verify preview uses the same runtime contract as student-safe delivery.
- [x] 10.3 Verify student-safe/session-safe projections strip answer keys, scoring rules, raw teacher key text, import evidence, and diagnostics.
- [x] 10.4 Verify runtime display for imported tasks across completion, choice, binary judgement, matching, and structured-layout families.
- [x] 10.5 Verify pre-submit review and answer state use stable interaction IDs and visible numbers.
- [x] 10.6 Add projection safety tests for imported teacher-key materials.

**Acceptance Criteria:** Imported materials display through real Reading V2 runtime without leaking scoring truth.

**Not Complete If:** Preview works by reading canonical draft answers or author diagnostics.

Implementation note 2026-05-06: Phase 10 projection/runtime proof is complete. Studio workflow tests now create a modal-prepared import candidate with a separate teacher answer key, open it as an editable draft, generate a local-only teacher preview projection, and assert the preview uses stable interaction IDs/display numbers while stripping teacher-key/scoring fields. Runtime shell tests now render a normalized imported structured payload spanning completion, binary judgement, choice, matching, and structured-layout families, fill answers through the real renderer, show the pre-submit review, and submit stable `interactionId` plus visible-number payloads. Existing projection tests continue to prove student-safe/session-safe projections strip answer keys, scoring rules, import evidence, diagnostics, and author-only metadata.

## Phase 11: All-16 Paste Automation Gate

- [x] 11.1 Create paste-import fixtures covering all 16 canonical task types.
- [x] 11.2 Include at least one full-test fixture with 3 passages and 40 answers.
- [x] 11.3 Include malformed-key fixtures for missing, extra, duplicate, malformed, and conflicting answers.
- [x] 11.4 Include table, flowchart, and diagram fixtures with valid and invalid blank bindings.
- [x] 11.5 Include matching fixtures with labels, roman numerals, option IDs, no-reuse, and reuse.
- [x] 11.6 Add browser gate coverage for import, diagnostics, repair, preview, publish block, and publish success.
- [x] 11.7 Save browser evidence JSON and screenshots for desktop/tablet and phone runtime output where relevant.
- [x] 11.8 Run focused Vitest, TypeScript, UTF-8 checks, and the Reading V2 task-type interaction gate.

**Acceptance Criteria:** The feature is not considered solved until paste import plus teacher key is proven from Studio input to runtime display and scoring output.

**Not Complete If:** Tests cover only helper parsers or only hand-authored canonical fixtures.

Implementation note 2026-05-06: Phase 11 is complete. `src/services/reading-v2/fixtures/readingV2PasteImportFixtures.ts` now holds fixture-backed paste imports for all 16 canonical task types, a 3-passage/40-answer full-test import, malformed-key cases for missing/extra/duplicate/malformed/conflicting rows, valid table/flowchart/diagram structured layouts, invalid structured-layout binding fixtures, and matching coverage for roman labels, labels, option IDs, reuse, and no-reuse behavior. Browser gates exercise valid import diagnostics/preview/publish across desktop/tablet/phone and malformed-key diagnostics/repair/publish-block on desktop, with artifacts saved in `output/playwright/reading-v2-paste-import-gate/`. Verification: focused Vitest passed 150 tests across import normalization, prompt contract, diagnostics, Studio shell/review/settings, workflow, runtime, projection, and validation; Playwright passed seven smoke cases; the Reading V2 task-type interaction gate passed; UTF-8 and `git diff --check` passed for touched files. Repo-wide `cmd /c npx tsc --noEmit --pretty false` still fails on existing unrelated baseline TypeScript errors, but filtered TypeScript output showed no errors in touched Reading V2 paste-import files.

Implementation note 2026-05-07: Post-completion browser-comment repair is complete for the imported Studio surface. Metadata/publish readiness no longer renders on the default page after parsing and is kept behind Developer details. Import review details now stay collapsed by default, with `Accept into Draft`, review toggle, copy diagnostics, and Developer details sharing the same utility action row. The passage editor now keeps formatting actions bound to current selection when possible and serializes contenteditable edits back to source text. The build workspace is constrained to viewport-height passage/question panes with internal scrolling so long imported passages do not push the whole editor off-screen. Verification: focused Vitest passed for Studio shell, import review panel, settings panel, parsing diagnostics, and BuildWorkspace; filtered TypeScript showed no touched-file errors; UTF-8 and `git diff --check` passed for touched files.

## Suggested Phase Order

1. Phase 0: Baseline audit and current import-surface ownership.
2. Phase 1: Reshape existing Studio import UI and candidate plumbing.
3. Phase 2: Teacher key parser.
4. Phase 3: Multi-passage paste support or fail-closed gate.
5. Phase 4: Canonical binding.
6. Phase 5: Task-type validation.
7. Phase 6: Option and matching drift guards.
8. Phase 7: Structured layout binding.
9. Phase 8: Submit and scoring hardening.
10. Phase 9: Studio repair workflow.
11. Phase 10: Projection and runtime proof.
12. Phase 11: All-16 paste automation gate.

## Minimum MVP Boundary

MVP may ship behind an internal flag only when these are complete:

- Fixed Teacher Lobby -> `TestCreationModal` -> Reading V2 metadata/start-choice gateway remains intact.
- Phase 1 two-field import UI
- Phase 2 deterministic key parser
- Phase 4 canonical key binding
- Phase 5 validation for binary, choice, multi-select, matching, and completion conflicts
- Phase 8 wrong-shaped answer and trusted-submission guards
- Phase 10 projection safety tests

MVP must not claim full paste automation until Phase 11 passes.

## Final Success Definition

The feature is done when a teacher can paste:

1. all passages and questions, and
2. a separate teacher-owned answer key,

then V2 can:

1. build a canonical draft,
2. bind teacher answers as the sole scoring truth,
3. show all unresolved structure or key conflicts,
4. let the teacher repair conflicts inside Studio,
5. preview with student-safe projection,
6. block publish until clean,
7. publish an immutable snapshot,
8. render in the Reading V2 runtime,
9. submit through the trusted path, and
10. score from the teacher-derived canonical answer rules only.
