# Task List: PRD-0048 Reading V2 Import Preview Annotation Closure

> **Created:** 2026-05-07
> **Purpose:** Close the 12 browser diff comments on `/teacher/reading-v2/import` with foundational Reading V2 fixes, not surface-only patching.
> **Scope:** Studio import/build topbar, teacher preview shell, runtime passage rendering, task instruction ownership, TFNG/short-answer/table-completion runtime UX, footer layout, tests, and live browser verification.
> **Primary source PRD:** `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
> **Pipeline source:** `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`

This task list supplements, but does not replace:

- `documentation/tasks/tasks-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`
- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-runtime-preview-notes.md`
- `documentation/tasks/PRD0048/reading-v2-validation-notes.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-paste-import-and-answer-key-authority.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-task-type-editor-parity.md`

## Current Problem

The current import preview flow can render, but the live browser state shows broken product quality:

1. Studio topbar title, status, and actions overlap.
2. A `More` button exists mainly to hide an exit action.
3. Teacher preview displays implementation-explanation copy that should not be visible.
4. Runtime preview repeats or exposes unnecessary status headers.
5. Passage paragraphs receive generated alphabet labels that may not exist in source text.
6. Task instructions can duplicate because the external-AI prompt asks for separated source instruction text, then Studio/runtime also render task-type instruction text.
7. Runtime task-type UI is below the editor/V1 design bar for TFNG, short-answer, and table-completion.
8. Footer navigator leaves dead space below the bar.

## Decision Contract

Build toward these invariants:

1. Studio topbar must use a stable responsive layout, not overlapping title/status/action fragments.
2. Header actions must be explicit. Do not keep a `More` button if it only hides `Exit`.
3. Preview chrome must be quiet: no `Runtime Preview` heading and no explanatory local-only paragraph.
4. Runtime passage body must never synthesize paragraph labels into visible text unless source or task metadata explicitly owns those labels.
5. `TaskGroup` owns instruction blocks and answer rules. External AI must not own final student-visible instruction wording.
6. Prompt output must remove source instruction prose from student-visible content, tag each question group with the correct task type, and extract instruction semantics into structured fields.
7. Standard instruction text must come from Reading V2 task-type documentation/templates, then render through one shared instruction component in Studio preview and runtime.
8. Source-specific or unusual instruction text must be preserved as review evidence, not silently displayed or discarded.
9. Student-facing task controls must be task-native, compact, keyboard reachable, and tested live.
10. Preview and publish stay safe: no answer keys, scoring rules, import evidence, author diagnostics, or local-only explanation text leak into student-safe runtime payloads.

## Diff Comment Map

| Comment | Area | Required closure |
|---|---|---|
| 1 | Studio topbar actions | Remove or replace `More` if its only job is hiding `Exit`; expose exit/back behavior intentionally. |
| 2 | Studio topbar layout | Fix title, import status, and action layout so text never stacks or overlaps at 1208x876, tablet, or phone widths. |
| 3 | Preview overlay heading | Remove visible `Runtime Preview` text while preserving an accessible dialog name. |
| 4 | Preview explanatory copy | Remove visible "Preview uses local-only..." paragraph; keep safety as code/test contract, not UI clutter. |
| 5 | Runtime right header | Remove visible `Questions 1-40 / 0 of 40 answered` header where redundant; keep progress available without duplicate clutter. |
| 6 | Passage paragraph labels | Stop automatic A/B/C labels when source text did not provide them; audit import, projection, and runtime blast radius. |
| 7 | Task instructions | Prompt external AI to remove source instruction prose from display content, return task-type tags plus instruction semantics, then have Studio/runtime render canonical task-type instruction text with correct formatting. |
| 8 | TFNG design | Redesign TFNG runtime control using V1 as UX reference, not code source; compact statement + clear segmented choices. |
| 9 | Short answer input placement | Put answer field inline at the end of the question after appropriate spacing. |
| 10 | Short answer clear action | Replace separate `Clear` area with small `x` button inside the text field top-right. |
| 11 | Table answer field | Keep question badge and input inside the table answer field, one line only, without stack overflow. |
| 12 | Footer spacing | Remove dead space under footer navigator in preview/runtime shell. |

## Evidence Standard

A checkbox may be checked only when real Reading V2 behavior exists and focused verification passes.

The following do not count:

- CSS that hides overlap in one screenshot but fails at another viewport
- deleting text without preserving accessible names or safety tests
- removing paragraph labels only in one fixture while import/projection still synthesize them
- keeping source instruction text and runtime instruction text as two visible blocks
- letting external AI provide final student-visible instruction wording instead of structured task semantics
- dropping source instruction prose without extracting word limits, vocabulary variants, selection counts, or custom-instruction evidence
- runtime controls that render but cannot be answered, cleared, keyboard-focused, or submitted
- tests that cover isolated helpers but not Studio preview or runtime behavior
- browser screenshots that do not revisit all 12 comments

## Safety And Design Gates

Before code changes, read the matching guard file when the trigger applies:

- `DESIGN.md` before UI or UX implementation.
- `documentation/rules/observability.md` before changing Studio/preview user-facing actions.
- `documentation/rules/codebase-hygiene.md` before writing imports or producer/consumer data contracts.
- `documentation/rules/react-patterns.md` before creating reusable components or pending/loading state.
- `documentation/rules/mobile-portability.md` before browser globals, storage, direct navigation, or responsive JS.
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md` before changing instruction, answer-rule, group, interaction, or stimulus ownership.
- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md` before changing task-type classification or normalization.
- `documentation/samples/IELTS-question-task-type-samples.md` before writing exact standard IELTS Reading instruction text.
- `documentation/samples/IELTS-reading-question-type-display-design.md` before implementing instruction formatting/display behavior.
- `Clippings/Practice Cam 10-20 Reading Test *.md` as corpus verification for wording variants and edge cases.
- `documentation/tasks/PRD0048/reading-v2-type-*.md` and family docs before changing task behavior, answer rules, or renderer ownership.

Do not import `@mantine/*`. Do not copy V1 code into V2; use V1 only as design/UX evidence.

## Instruction Text Source Hierarchy

Use this order. Do not invent instruction text in code.

1. `documentation/samples/IELTS-question-task-type-samples.md` is the primary one-place source for exact standard IELTS Reading instruction text across the 16 task types.
2. `documentation/samples/IELTS-reading-question-type-display-design.md` is the secondary source for formatting, display grouping, and UI anatomy of those instruction blocks.
3. `Clippings/Practice Cam 10-20 Reading Test *.md` is the verification corpus for real Cambridge wording variants, word-limit variants, and rare cases.
4. `documentation/tasks/PRD0048/reading-v2-type-*.md` and `reading-v2-family-*.md` describe task contracts and renderer behavior; they are not the primary source for exact instruction wording.
5. Existing hardcoded strings in `.ts` / `.tsx` are implementation leftovers and must not be treated as authoritative source text.

## External AI Instruction Contract

External AI has no knowledge of this app's Studio/runtime instruction renderer. Treat it as a classifier and semantic extractor only.

Prompt must require:

1. Remove IELTS source instruction prose from passage text, question text, table cells, and any other student-visible content fields.
2. Tag each question group with the correct Reading V2 task type, for example `true-false-not-given`, `yes-no-not-given`, `short-answer`, `table-completion`, or `matching-headings`.
3. Extract instruction semantics into structured fields: `taskType`, `questionRange`, `wordLimit`, `vocabulary`, `selectionLimit`, `answerSource`, `optionSet`, `sourceInstructionEvidence`, and `customInstructionEvidence`.
4. Set student-visible instruction text to null/omitted in external-AI output. Studio/runtime must render visible instruction text from internal task-type registry only.
5. Preserve unusual or non-standard instruction wording in evidence fields and mark it for teacher review; do not render it as a second instruction block.
6. Preserve source Markdown formatting marks in student-visible passage, question, option-bank, table-cell, and flowchart-step content fields; do not convert Markdown to HTML.
7. Do not preserve Markdown formatting marks in standard source instruction prose, because canonical task instructions are rendered internally.

Parser/studio must enforce:

1. Ignore or strip any external-AI field that attempts to provide final student-visible instruction wording.
2. Map structured instruction semantics to canonical Reading V2 task-type instruction templates derived from `documentation/samples/IELTS-question-task-type-samples.md` and cross-checked against the `Clippings/Practice Cam 10-20 Reading Test *.md` corpus.
3. Publish-block or teacher-review any custom instruction evidence that cannot be mapped safely to a known standard variant.
4. Keep imported instruction evidence out of student-safe runtime payloads.

## Loop Check Protocol

Every implementation phase must end with this loop before marking the phase complete:

1. Run the focused unit/component tests for touched files.
2. Run targeted UTF-8 check for changed text files.
3. Start or reuse the local dev server.
4. Use dev quick-login through the login page if authentication is needed.
5. Open `/teacher/reading-v2/import` with the same Stepwells import/preview state used by the comments.
6. Re-check all 12 comments in one browser pass at `1208x876`.
7. Re-check layout at tablet and phone widths for topbar, preview, runtime task controls, and footer.
8. Save screenshot evidence and a JSON checklist under `output/playwright/reading-v2-import-preview-annotation-closure/`.
9. If any comment fails, add or update a finding in `documentation/tasks/findings-of-tasks-0048-prd-reading-v2-studio-and-runtime.md`, fix, and rerun this loop.

No phase is green until the loop has zero unresolved failures for that phase's scope.

## Required Verification Commands

Use Windows command form for Vitest in this repo:

```bash
cmd /c npx vitest run src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx src/components/reading-v2/studio/ReadingV2PreviewOverlay.test.tsx --reporter=basic
```

Add or narrow test files as ownership becomes clear. Do not claim broad build health from a route render only.

Also run:

```bash
npm run check:utf8 -- documentation/tasks/PRD0048/tasks-0048-reading-v2-import-preview-annotation-closure.md
```

For final code changes, run targeted UTF-8 on every changed text file and the focused live-browser gate.

## Relevant Implementation Files

Expected files to inspect or modify:

- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.css`
- `src/components/reading-v2/studio/ReadingV2PreviewOverlay.tsx`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.css`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx`
- `src/components/reading-v2/runtime/task-type-components/ReadingV2TaskTypeComponents.tsx`
- `src/components/reading-v2/studio/ReadingV2PreviewOverlay.test.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx`
- `src/components/reading-v2/shared/ReadingV2InstructionText.tsx`
- `src/services/reading-v2/readingV2ImportNormalization.service.ts`
- `src/services/reading-v2/readingV2ImportNormalization.service.test.ts`
- `src/services/reading-v2/readingV2ExternalAiPrompt.service.ts`
- `src/services/reading-v2/readingV2ExternalAiPrompt.service.test.ts`
- `src/services/reading-v2/readingV2InstructionTemplates.service.ts`
- `src/services/reading-v2/readingV2InstructionTemplates.service.test.ts`
- `src/services/reading-v2/readingV2PublishPipeline.service.test.ts`
- `src/services/reading-v2/readingV2Projection.service.ts`
- `src/services/reading-v2/readingV2Validation.service.ts`
- `src/services/reading-v2/fixtures/readingV2PasteImportFixtures.ts`
- `src/services/reading-v2/fixtures/readingV2CanonicalFixtures.ts`
- `src/pages/ReadingV2StudioSmokePage.tsx`
- `src/pages/ReadingV2VerticalLoopSmokePage.tsx`
- `src/types/readingV2.types.ts`
- `e2e/reading-v2-import-preview-annotation-closure.spec.ts`
- `e2e/reading-v2-vertical-loop.spec.ts`
- `output/playwright/reading-v2-import-preview-annotation-closure/baseline.json`
- `output/playwright/reading-v2-import-preview-annotation-closure/final-evidence.json`

Residual risks after this pass:

- External AI may still send unexpected instruction fields, but parser/normalization now ignores student-visible instruction wording and preserves unusual wording as teacher-review evidence.
- The live browser gate uses smoke fixtures for the comment states and a student-safe full-test runtime smoke; production Firebase/auth behavior remains covered by separate rollout gates, not by this local preview closure loop.

## Tasks

- [x] 0.0 Establish baseline and ownership map
  - **Acceptance Criteria:** Current live failure state is captured, every comment maps to an owning component/service, and fix order is agreed by dependency.
  - **Not Complete If:** Any comment is treated as pure CSS before import/projection/runtime ownership is traced.
  - [x] 0.1 Capture fresh desktop screenshot and DOM/state notes for `/teacher/reading-v2/import` at `1208x876`, including topbar, preview open, TFNG, short-answer, table-completion, and footer positions.
  - [x] 0.2 Trace owner files for topbar actions, preview overlay chrome, runtime passage paragraphs, instruction rendering, TFNG controls, short-answer controls, table-completion controls, and footer layout.
  - [x] 0.3 Identify whether the Stepwells paragraph letters come from source text, import normalization, canonical stimulus data, projection, or runtime rendering.
  - [x] 0.4 Identify whether duplicate TFNG instruction text comes from imported source `instructionBlocks`, runtime templates, or both.
  - [x] 0.5 Create `output/playwright/reading-v2-import-preview-annotation-closure/baseline.json` with one entry per comment: selector, observed problem, owner, and initial screenshot path.
  - [x] 0.6 STOP FOR OWNER APPROVAL if the baseline proves any requested removal would break live student runtime, accessibility, or matching-task paragraph-reference behavior.

- [x] 1.0 Fix Studio import topbar layout and action model
  - **Comments Covered:** 1, 2
  - **Acceptance Criteria:** Topbar no longer overlaps; actions remain discoverable; no `More` button exists solely to hide exit.
  - **Not Complete If:** Text stacks on top of itself, import status covers title/actions, or exit is hidden behind an unjustified overflow menu.
  - [x] 1.1 Read `DESIGN.md`, `documentation/rules/observability.md`, and `documentation/rules/mobile-portability.md` before editing.
  - [x] 1.2 Redesign `reading-v2-build__topbar` as a stable responsive grid/flex layout with title zone, status zone, and action zone.
  - [x] 1.3 Replace the `More` menu with explicit topbar/secondary placement for exit/back if no other hidden actions justify overflow.
  - [x] 1.4 Preserve or update feature tracking for changed user-facing action names.
  - [x] 1.5 Add focused tests for visible actions and responsive topbar behavior where test harness supports it.
  - [x] 1.6 Live check desktop/tablet/phone: no overlap, no clipped action text, no action lost.

- [x] 2.0 Clean teacher preview chrome without weakening safety
  - **Comments Covered:** 3, 4, 5, 12
  - **Acceptance Criteria:** Preview opens as a quiet teacher-only runtime preview with no visible `Runtime Preview`, no local-only explanatory paragraph, no redundant right-summary header, and no bottom dead space.
  - **Not Complete If:** Text is hidden only visually while still taking layout space, accessible name is missing, or footer gap remains at scrolled table state.
  - [x] 2.1 Read `reading-v2-runtime-preview-notes.md` and confirm preview must remain local-only and projection-only.
  - [x] 2.2 Remove visible `Runtime Preview` heading from `ReadingV2PreviewOverlay`; retain a useful `aria-label` or visually hidden accessible title if needed.
  - [x] 2.3 Remove visible local-only preview explanation paragraph; enforce local-only behavior in tests instead.
  - [x] 2.4 Remove or redesign the visible right-column `Questions 1-40 / 0 of 40 answered` header so progress is not duplicated or noisy.
  - [x] 2.5 Fix footer/container height so `reading-v2-runtime__footer` sits flush without unused space beneath it.
  - [x] 2.6 Add tests proving preview does not create assignments, sessions, attempts, or results, and does not expose answer keys or author diagnostics.
  - [x] 2.7 Live check preview open, mid-scroll, and table-completion scroll positions at desktop/tablet/phone.

- [x] 3.0 Repair passage paragraph-label ownership
  - **Comments Covered:** 6
  - **Acceptance Criteria:** Runtime passage text shows exactly the source-owned paragraph labels, not generated labels inserted into prose; matching task references still work.
  - **Not Complete If:** Stepwells still renders `A A millennium...`, or removing labels breaks matching-headings/matching-information references.
  - [x] 3.1 Read `reading-v2-taskgroup-object.md` stimulus/anchor rules before editing.
  - [x] 3.2 Trace every label source: import candidate, canonical stimulus paragraph model, projection payload, runtime passage renderer, and matching task reference display.
  - [x] 3.3 Split concepts if needed: `sourceParagraphLabel`, `matchingReferenceLabel`, and passage body text must not be conflated.
  - [x] 3.4 Normalize import so generated paragraph references stay metadata/anchors, not prepended prose.
  - [x] 3.5 Update projection/runtime so explicit source labels render only when source text owns them or a task-specific reference display needs them outside the prose body.
  - [x] 3.6 Add regression fixtures for Stepwells without source labels and a matching-headings passage with explicit labels.
  - [x] 3.7 Live check: Stepwells first paragraph starts with `A millennium...`; matching references remain visible in task controls.

- [x] 4.0 Centralize task instruction ownership and remove duplicates
  - **Comments Covered:** 7
  - **Acceptance Criteria:** External AI removes source instruction prose from display content and returns task-type tags plus instruction semantics; Studio/runtime render one canonical, correctly formatted instruction block per group from internal Reading V2 task-type templates.
  - **Not Complete If:** TFNG displays both source instruction prose and generated definition prose, runtime instruction formatting differs from the editor, or prompt output can inject final student-visible instruction wording.
  - [x] 4.1 Read `reading-v2-task-taxonomy-index.md`, `reading-v2-taskgroup-object.md`, `reading-v2-family-binary-judgement.md`, and relevant `reading-v2-type-*.md`.
  - [x] 4.2 Inventory existing standard instruction text in Reading V2 type docs, family docs, and Cambridge clipping references; extend the Reading V2 type docs first if standard text is incomplete.
  - [x] 4.3 Create or reuse one instruction-template source for task types; do not let prompts own final display wording.
  - [x] 4.4 Update import normalization so source instruction paragraphs classify task type, answer rule, word limit, vocabulary, and evidence, then de-duplicate against canonical display text.
  - [x] 4.5 Render instructions through one shared component used by Studio preview/runtime so line breaks, vocabulary definitions, and emphasis match editor intent.
  - [x] 4.6 Validate source-specific custom instructions: if not equivalent to standard text, preserve as teacher-reviewable custom text with publish-blocking uncertainty until accepted.
  - [x] 4.7 Add tests for TFNG standard instruction, short-answer word limit instruction, table-completion instruction, duplicate stripping, and custom-instruction uncertainty.
  - [x] 4.8 Live check TFNG: one instruction block only, formatted like editor, no duplicate `TRUE if...` block.
  - [x] 4.9 Update the external-AI prompt to instruct removal of source instruction prose from student-visible content and require task-type tags plus structured instruction semantics instead.
  - [x] 4.10 Define/verify prompt output fields for `taskType`, `questionRange`, `wordLimit`, `vocabulary`, `selectionLimit`, `answerSource`, `sourceInstructionEvidence`, and `customInstructionEvidence`.
  - [x] 4.11 Update import normalization to reject/ignore any external-AI student-visible instruction wording and build display instructions only from internal task-type templates.
  - [x] 4.12 Update Studio editor display so canonical task-type instructions come from `documentation/samples/IELTS-question-task-type-samples.md`, with formatting/display rules from `documentation/samples/IELTS-reading-question-type-display-design.md`.
  - [x] 4.13 Add prompt/parser tests proving standard source instructions are removed from AI-visible content, semantics are preserved, canonical instruction renders once, and custom instruction evidence triggers teacher review.

- [x] 5.0 Redesign TFNG runtime interaction using V1 as UX reference
  - **Comments Covered:** 8
  - **Acceptance Criteria:** TFNG runtime is compact, clear, task-native, and materially better than the current large generic control layout.
  - **Not Complete If:** Runtime still uses oversized generic option cards, separate awkward `Clear`, or unclear selected state.
  - [x] 5.1 Audit V1 TFNG UX for spacing, statement grouping, selection clarity, and keyboard behavior; record design takeaways without copying V1 code.
    - V1 reference audited: `src/components/test/AuthenticAnswerInput.tsx` and `src/components/test/IELTSQuestionsPanel.tsx`.
    - Takeaways used in V2: keep statement and controls in one compact question unit, use one horizontal segmented radio group with native radio semantics, make selected state visually stronger than unselected state, keep labels nowrap, and separate the TRUE/FALSE/NOT GIVEN definition block from the answer controls.
    - Deliberately not copied: V1 inline style implementation, color palette, and old Mantine-based teacher-only question views.
  - [x] 5.2 Build/update V2 binary-judgement runtime component with statement row, numbered badge, compact segmented TRUE/FALSE/NOT GIVEN options, clear selected state, and accessible radio semantics.
  - [x] 5.3 Ensure YNNG uses the same component with YES/NO/NOT GIVEN vocabulary and never leaks TFNG labels.
  - [x] 5.4 Add tests for select, change, clear, keyboard navigation, progress count, and submit payload.
  - [x] 5.5 Live check TFNG and YNNG in preview and student runtime shell at desktop/tablet/phone.

- [x] 6.0 Repair short-answer runtime input and clear affordance
  - **Comments Covered:** 9, 10
  - **Acceptance Criteria:** Short-answer input appears inline at the end of the question after appropriate spacing, with a small `x` clear button inside the field top-right.
  - **Not Complete If:** Word limit occupies the input value area, clear renders as a separate line/area, or input wraps away from the prompt unnecessarily.
  - [x] 6.1 Read `reading-v2-type-short-answer.md` and completion family answer-rule docs before editing.
  - [x] 6.2 Render question prompt and answer input in one row/flow where width allows, falling back cleanly on phone.
  - [x] 6.3 Move word-limit display to helper/meta text that does not masquerade as the input value.
  - [x] 6.4 Place clear as an icon/button inside the input wrapper with accessible label `Clear answer`.
  - [x] 6.5 Add tests for typing, clearing, word-limit display, submit payload, keyboard focus, and empty-state layout.
  - [x] 6.6 Live check Q6-Q8: answer field at prompt end, clear `x` inside field, no layout jump after typing/clearing.

- [x] 7.0 Repair table-completion answer field layout
  - **Comments Covered:** 11
  - **Acceptance Criteria:** Table-completion blank fields keep question badge and input together inside the cell/field on one line where width allows.
  - **Not Complete If:** Question badges stack above inputs, float outside cell boundaries, or force awkward row height in normal desktop preview.
  - [x] 7.1 Read `reading-v2-type-table-completion.md` and current table merge/split validation notes before editing.
  - [x] 7.2 Make `reading-v2-runtime__cell-answer-stack` a stable inline answer field wrapper with badge, input, and internal clear affordance if applicable.
  - [x] 7.3 Ensure merged cells with multiple `anchorIds` still display all question numbers without overflow or anchor drift.
  - [x] 7.4 Add tests for single blank, merged blank with multiple anchors, typing, clearing, projection safety, and table horizontal scroll.
  - [x] 7.5 Live check Q9-Q13 at desktop/tablet/phone: badge/input inside field, one line when space exists, no table overflow beyond intended horizontal scroll.

- [x] 8.0 End-to-end vertical loop and health gate
  - **Acceptance Criteria:** The import-to-preview loop proves all 12 comments fixed in live browser evidence and focused tests pass.
  - **Not Complete If:** Any comment remains unresolved, browser evidence is missing, or docs/checklists claim stronger verification than was performed.
  - [x] 8.1 Run all focused Vitest suites for touched Studio, runtime, import normalization, projection, validation, and fixtures.
  - [x] 8.2 Run targeted UTF-8 checks on changed docs/source files.
  - [x] 8.3 Run the live browser loop from import setup through Studio review, Validate, Preview, scroll to TFNG, short-answer, table-completion, and footer states.
  - [x] 8.4 Save `output/playwright/reading-v2-import-preview-annotation-closure/final-evidence.json` with all 12 comments marked pass/fail, screenshot paths, viewport, route, and commit/worktree hash.
  - [x] 8.5 Run one student-runtime launch smoke for the same projection path, not only teacher preview, to catch shared runtime regressions.
  - [x] 8.6 Update Relevant Implementation Files and findings notes with actual changed files and residual risks.
  - [x] 8.7 STOP FOR OWNER APPROVAL before marking the whole tasklist complete if any requested UI removal required a product decision or changed student runtime behavior.

- [x] 9.0 Build Markdown-formatting foundation for imported visible content
  - **Acceptance Criteria:** External-AI prompts require source Markdown marks to survive in student-visible content; import normalization preserves those marks only for visible content fields; runtime renders safe inline formatting without HTML injection; standard instructions remain app-owned and de-marked.
  - **Not Complete If:** External AI can strip formatting without violating the prompt, parser strips `**bold**` / `*italic*` from visible content, runtime shows raw Markdown marks to students, or app-owned instructions keep copied Markdown styling from source instructions.
  - [x] 9.1 Identify all external-AI prompt entrypoints used by Reading V2 import.
  - [x] 9.2 Update both external-AI prompt contracts so Markdown marks are preserved for visible content and not preserved for standard instructions.
  - [x] 9.3 Split import normalization into visible-content preservation and metadata/instruction cleanup paths.
  - [x] 9.4 Add safe inline Markdown renderer for runtime passage, prompt, table, flowchart, and option-bank text without `dangerouslySetInnerHTML`.
  - [x] 9.5 Add unit/component tests proving preserved Markdown renders as formatting and HTML-like text remains inert.
  - [x] 9.6 Run focused Vitest, UTF-8, and live import-preview gate before checking this phase complete.

## Progress Log

- 2026-05-07: Implemented the current comment-closure pass across Studio topbar, preview overlay, runtime passage labels, instruction de-duplication, TFNG, short-answer, table-completion, and footer layout.
- 2026-05-07: Focused Vitest passed: `cmd /c npx vitest run src/services/reading-v2/readingV2InstructionTemplates.service.test.ts src/services/reading-v2/readingV2ExternalAiPrompt.service.test.ts src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.test.tsx src/components/reading-v2/studio/ReadingV2PreviewOverlay.test.tsx --reporter=basic` with 113 tests passing.
- 2026-05-07: UTF-8 gate passed for 19 changed text files.
- 2026-05-07: Live Playwright gate passed: `cmd /c npx playwright test e2e/reading-v2-import-preview-annotation-closure.spec.ts --project=chromium`; all 12 comment results passed, with 0 page errors and 0 request failures. Evidence: `output/playwright/reading-v2-import-preview-annotation-closure/final-evidence.json`.
- 2026-05-07: Completion status: all tasklist boxes are checked; no requested UI removal required a product decision or changed student runtime behavior beyond the shared Reading V2 runtime fixes verified by the student-safe full-test smoke.
- 2026-05-07: Updated instruction-text plan: external AI must remove source instruction prose from display content, return task-type tags plus instruction semantics, and leave canonical student-visible instruction rendering to Studio/runtime internal task-type templates.
- 2026-05-07: Corrected instruction-text source hierarchy: exact standard wording comes from `documentation/samples/IELTS-question-task-type-samples.md`, display formatting from `documentation/samples/IELTS-reading-question-type-display-design.md`, and raw `Clippings/Practice Cam 10-20 Reading Test *.md` files verify variants. PRD task-type docs are behavior contracts, not wording authority.
- 2026-05-07: Added Markdown-formatting foundation phase after user assessment: external AI must preserve source Markdown marks for student-visible content, while Studio/runtime keep standard task instructions app-owned.
- 2026-05-07: Completed Markdown-formatting foundation. Both external-AI prompt paths now require Markdown mark preservation for visible content; normalization preserves marks in passage/question/option/table/flowchart text while cleaning metadata/instructions; runtime uses a safe React inline formatter with no HTML injection. Verification: focused Vitest passed `97` tests, UTF-8 passed for `15` files, `git diff --check` passed, and Playwright live gate passed with `foundationResults.markdownFormatting`.
