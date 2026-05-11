# Task List: PRD-0048 Reading V2 Studio Task-Type Editor Parity

> **Created:** 2026-05-03
> **Purpose:** Implement near-identical Reading V2 Studio task-type editor parity with the Stitch HTML and screen mockups.
> **Scope:** Studio Build Workspace task-type authoring UI, task-type data adapters, validation, scoring support, fixtures, and visual verification.
> **Primary source PRD:** `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
> **Visual source:** `documentation/tasks/PRD0048/design/stitch/reading-v2-build-workspace/each_question_task_type_design`

This task list supplements, but does not replace:

- `documentation/tasks/tasks-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-gap-closure.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-task-editor-architecture-notes.md`
- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-type-*.md`

## Why This Exists

Reading V2 Studio currently has working canonical draft, preview, validation, publish, and table-completion authoring foundations. The Stitch task-type package defines a higher bar for the Build Workspace: each IELTS question type needs a task-native editor that visually and behaviorally matches the relevant HTML mockup, instead of falling back to shared generic prompt rows.

This task list breaks the work into one implementation unit per canonical task type so completion cannot be claimed by broad family-level scaffolding.

## Evidence Standard

A checkbox in this file may be checked only when the real Studio behavior exists and is tested.

The following do **not** count as completion:

- a generic editor fallback with a task-type label
- a button that only emits an action without mutating canonical draft state
- fixture-only UI that does not work in `ReadingV2StudioPage`
- visual styling that approximates the mockup but omits the task-specific workflow
- backend types with no Studio editor integration
- tests that cover helper functions but not teacher-facing authoring behavior

Every task-type parent task is done only when:

1. The editor is visually near-identical to the referenced Stitch `code.html` and `screen.png`.
2. The editor writes to canonical Reading V2 draft state with stable IDs.
3. Preview and publish projections remain student-safe and do not leak answer keys.
4. Validation catches incomplete task-type data before preview or publish.
5. Focused tests and visual QA evidence exist for the task type.
6. Relevant UTF-8 checks pass for changed text files.

## Mandatory Browser Green-Light Protocol

No task type may be marked well-designed, complete, or green-lit until the live browser gate proves every displayed feature works as an authoring workflow. A task-type test that only checks rendering, only fills one happy-path answer, or only compares a screenshot is insufficient.

For each task type, the browser gate must:

1. Open the real `ReadingV2BuildWorkspace` surface, not an isolated story or fixture-only component.
2. Add or select the target task type through the Studio flow.
3. Compare the visible editor against the relevant Stitch `code.html` and `screen.png`.
4. Enumerate every visible label, button, input, textarea, chip, badge, segmented control, disabled control, validation message, answer-key row, preview area, and empty state shown for that task type.
5. Exercise every visible action in the browser, including add, delete, duplicate where present, edit, selection, blank insertion, answer selection, validation repair, and preview transitions.
6. Verify that every action mutates canonical Reading V2 draft state, survives save/validate/preview where relevant, and does not depend on hidden schema or developer-only controls.
7. Verify disabled controls communicate why they are disabled and become enabled after the required authoring action.
8. Verify focus states, keyboard reachability, pointer/touch targets, text fit, scroll behavior, and no overlap at desktop and tablet widths; run phone checks for controls that collapse or wrap.
9. Verify validation covers both missing required data and repaired data for that task type.
10. Verify student-safe preview/projection output contains the authored student-visible content and no answer keys, scoring rules, import evidence, or author metadata.
11. Capture browser evidence with screenshots and a JSON checklist showing pass/fail for every displayed control and state.
12. Treat any awkward, hidden, or confusing interaction discovered during the browser run as a failing gap that must be fixed before green light.

### Per-Task-Type Display And Interaction Matrix

Each row below is mandatory implementation and live-browser test scope. The "Browser gate must exercise" column is not optional; it defines the minimum interaction coverage before the task type can pass.

| Task type | Stitch source | Display requirements from mockup | Browser gate must exercise |
|---|---|---|---|
| `multiple-choice` | `ielts_choice_short_answer_editors`, `ielts_matching_choice_editors_sidebar_removed` | Question range, task title, edit/settings/delete group actions, instruction field, one question card per item, clear white editable question prompt field, A/B/C/D radio option rows, selected radio state, add option and delete question on the same action row, border-only missing-answer state without bulky inline error copy. | Edit instruction and prompt; confirm prompt field boundary is visible; select each option as correct; add option; delete option; confirm add option/delete question share one row; add question; delete question; trigger missing-answer border state with no visible error block; repair validation; save/validate/preview; confirm preview shows radio choices and no answer leakage. |
| `multiple-select` | `ielts_choice_short_answer_editors`, `ielts_matching_choice_editors_sidebar_removed` | Question range, choose-two/choose-three instruction, clear editable prompt, selected-answer count control on the same row as the prompt, checkbox option rows using the same compact MCQ layout, selected checkbox state, add option, delete question, border-only validation when selected count differs from required count. | Change required selection count from the prompt row; select and clear checkboxes; verify over/under-selection border state with no bulky inline error; add/delete options; confirm add option/delete question share one row; add/delete question; validate and repair; preview; confirm unordered scoring data and student-safe projection. |
| `short-answer` | `ielts_choice_short_answer_editors`, `ielts_judgement_structured_editors_sidebar_removed` | Task title, instruction field with one group-level word-limit control on the same row, compact prompt rows with clear textarea boundary, primary answer key field, add accepted answer button on the same row as the primary answer field, accepted alternatives fields, add question, border-only missing-answer state. | Edit prompt; confirm prompt field boundary is visible; change the shared group word limit; confirm no per-question word-limit controls exist; enter primary answer; add/remove accepted alternatives; confirm add accepted answer is in the primary-answer row; trigger missing-answer border state with no visible bulky error; repair answer; add/delete question; save/validate/preview; confirm scoring accepts alternatives and preview does not leak answer key. |
| `sentence-completion` | `ielts_sentence_summary_completion_editors`, `ielts_completion_task_editors_sidebar_removed` | Instruction field with group word-limit control on the same row, sentence rows with one whole-sentence text field, explicit inline `_____` blank marker inside that field, answer-key field beside each row, add question row, delete row, missing blank/answer styling, clean IELTS card spacing. | Edit one whole sentence field; insert the blank at the caret as `_____`; clear the blank; edit answer key; add/delete row; verify no before/after split fields and no per-question word limits; verify numbering stability; validate missing blank/answer; repair; preview; confirm canonical anchors and interactions map one-to-one to visible sentence blanks. |
| `summary-completion-text` | `ielts_sentence_summary_completion_editors`, `ielts_completion_task_editors_sidebar_removed` | Summary task card, instruction field, word limit, paragraph/summary editor area, inline blank tokens, formatting/insert blank toolbar where shown, answer-key mapping panel, missing-answer tooltip/state. | Edit summary body; insert multiple blanks; delete a blank and verify answer mapping repairs; edit answer keys; trigger missing-answer state; repair; validate; preview; confirm blank order and student-safe projection. |
| `summary-completion-list` | `ielts_list_summary_note_completion_editors` | Summary/list editor, visible choice bank or word list, inline numbered blanks, answer mapping rows, add/remove choice, selected answer state, missing mapping warning. | Add/remove choices; edit choice labels/text; insert blank; map blank to choice; delete a selected choice and verify invalid mapping is surfaced; repair; validate; preview; confirm no free-text answer fallback unless the task type explicitly allows it. |
| `note-completion` | `ielts_completion_task_editors_sidebar_removed`, `ielts_list_summary_note_completion_editors` | Note heading, optional subheading, normal note text editor rows, compact formatting toolbar, bullet/numbered-line insertion, inline `_____` blank marker inside each note text field, answer-key field beside each generated blank, group word limit, add note blank, delete note row, missing-answer state. | Edit heading/subheading; edit a whole note text field; apply bold/italic/underline and bullet/numbered helpers; insert `_____` at the caret inside the note text; clear/delete blank; add/delete note row; edit answer; trigger and repair missing-answer validation; validate; preview; confirm blank order persists without separate before/after note fields. |
| `table-completion` | `ielts_table_completion_editor`, `ielts_judgement_structured_editors_sidebar_removed` | Table title, compact Stitch-style toolbar, add row, add column, delete row, delete column, merge cells, split cell, header row, mark as blank, clear blank, selected-cell highlight, blank question chips inside cells, editable table grid, paste-table affordance, answer key, missing-answer warning, word limit, student preview. | Select a single cell and create a blank; clear that blank; select multiple cells without hidden modifier-only dependency; merge a visible rectangular selection; verify merged cell `rowSpan`/`colSpan`; split merged cell; preserve blank anchors through merge/split; add/delete rows and columns; block deletion when merged cells cross the edge; mark header row; paste a table with blank markers; edit answers; validate missing answers; preview. |
| `flowchart-completion` | `ielts_flowchart_diagram_editors`, `ielts_flow_chart_info_editors_sidebar_removed` | Flowchart title, ordered step cards, connector/arrow styling, editable step text, mark as blank, inline blank token, add step, delete step, reorder controls, answer key, missing-answer state. | Edit title and steps; add/delete/reorder steps; mark a step segment as blank; clear blank; edit answer key; trigger validation for empty step and missing answer; repair; preview; confirm connector order, blank order, projection, and scoring. |
| `diagram-labeling` | `ielts_flowchart_diagram_editors`, `ielts_judgement_structured_editors_sidebar_removed` | Diagram title, explicit image-source choice between URL and upload, displayed image/placeholder preview, no teacher-facing alt field, no draggable/coordinate marker editor when the source diagram already contains indicators, answer-key rows only, add/delete answer field, missing-asset and missing-answer states. | Switch URL/upload modes; enter image URL; expose upload file picker; verify alt, target-label, drag, and coordinate controls are absent; edit answer fields; add/delete answer field; trigger missing asset/answer validation; repair; preview; confirm diagram image renders and student-safe projection contains no answer keys or author-only metadata. |
| `true-false-not-given` | `ielts_judgement_task_editors` | Instruction text, TRUE/FALSE/NOT GIVEN definition block where shown, statement cards, visible statement input boundary, numbered badge, segmented TRUE/FALSE/NOT GIVEN buttons, selected pill state, add statement, delete statement, row validation. | Edit instruction; edit statement text; select TRUE, FALSE, and NOT GIVEN; verify only one selected; add/delete statement; trigger missing statement and missing answer validation; repair; preview; confirm vocabulary stays TFNG in canonical data and runtime. |
| `yes-no-not-given` | `ielts_judgement_structured_editors_sidebar_removed`, `ielts_judgement_task_editors` | Instruction text, YES/NO/NOT GIVEN definition block where shown, statement cards, numbered badge, segmented YES/NO/NOT GIVEN buttons, selected state, add/delete statement, row validation. | Edit statement; select YES, NO, and NOT GIVEN; verify no TRUE/FALSE labels appear in UI or saved scoring; add/delete statement; validate missing answer/text; repair; preview; confirm YNNG vocabulary in student runtime. |
| `matching-headings` | `ielts_matching_headings_information_editors`, `ielts_matching_choice_editors_sidebar_removed` | Compact roman-numeral heading table with concise label column, long heading text field, paragraph/section source field, and remove action; empty source means unused distractor; no separate answer-selector cards by default; reuse toggle can convert source fields to multi-line fields when needed. | Add/edit/delete heading; confirm the bank is a compact table and heading text fields are the dominant column; type paragraph/section source beside a heading to create the scored question; leave other heading sources empty and confirm they stay distractors; toggle reuse and verify multi-line source input; clear a source and confirm the scored interaction is removed; preview; confirm roman labels and source-owned mappings persist. |
| `matching-information` | `ielts_matching_headings_information_editors`, `ielts_flow_chart_info_editors_sidebar_removed` | Compact paragraph/section table with concise label column, long paragraph note field, information-statement source field, and remove action; empty source means unused paragraph; reuse is task-native and commonly allowed through multi-line source fields. | Add/edit/delete paragraph option; confirm table layout and long paragraph fields; type one or more information statements beside a paragraph option; leave unused paragraphs empty; toggle reuse/no-reuse and verify duplicate constraints; clear a source and confirm associated interactions are removed; validate and repair; preview; confirm labels and reuse constraints survive save/preview. |
| `matching-features` | `ielts_matching_features_endings_editors`, `ielts_matching_choice_editors_sidebar_removed` | Two-section design: top compact feature table with A/B/C labels and long feature text fields; bottom feature-statement rows where each scored statement has a clear prompt field and a correct-feature select. Features with no selected statement remain valid distractors; reuse/no-reuse is explicit. | Add/edit/delete feature; confirm feature bank is separate from statement rows; add/edit/delete statement rows; map statement to a feature; leave unused features valid; toggle reuse/no-reuse and verify duplicate constraints; delete a selected feature and confirm affected statement answers clear; validate and repair; preview; confirm A/B/C labels, statement rows, and distractors persist. |
| `matching-sentence-endings` | `ielts_matching_features_endings_editors` | Two-section design: top compact ending table with A/B/C labels and long ending text fields; bottom sentence-beginning rows where each scored beginning has a clear prompt field and correct-ending select. Ending options can outnumber beginnings or vice versa; unused endings remain valid distractors; no-reuse is default. | Add/edit/delete ending; confirm ending bank is separate from beginning rows; add/edit/delete sentence beginning rows; map beginning to an ending; leave unused endings valid; verify no duplicate ending use unless reuse is allowed; delete a selected ending and confirm affected beginning answers clear; validate and repair; preview; confirm student sees beginnings and endings in the Stitch-style layout. |

### Cross-Task Browser Evidence Checklist

Every task-type browser evidence JSON must include:

- `taskType`
- `stitchSources`
- `visibleControlsChecked`
- `actionsExercised`
- `validationStatesChecked`
- `disabledStatesChecked`
- `persistenceChecks`
- `previewChecks`
- `projectionSafetyChecks`
- `visualComparisonScreenshot`
- `knownIntentionalDeviations`
- `unresolvedGaps`

The task type passes only when `unresolvedGaps` is empty. If browser testing finds a confusing interaction, an untested visible control, or a visual mismatch against the Stitch source, add or update the relevant task item before continuing implementation.

## Safety And Design Gates

- Read `DESIGN.md` before UI implementation work.
- Read `documentation/rules/codebase-hygiene.md` before writing imports.
- Read `documentation/rules/react-patterns.md` before creating new reusable components or state initialized as `pending` or `loading`.
- Read `documentation/rules/observability.md` before adding or modifying teacher-facing actions.
- Read `documentation/rules/mobile-portability.md` before writing browser-global, storage, or direct navigation code.
- Do not import `@mantine/*`.
- Use the Stitch HTML and `screen.png` files as the visual acceptance source, not screenshots of the current implementation.

## Relevant Implementation Files

- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx`
- `src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
- `src/types/readingV2Taxonomy.ts`
- `src/types/readingV2.types.ts`
- `src/services/reading-v2/readingV2Validation.service.ts`
- `src/services/reading-v2/readingV2Projection.service.ts`
- `src/services/reading-v2/readingV2ResultAdapter.service.ts`
- `src/services/reading-v2/readingV2ImportNormalization.service.ts`

## Gap Summary

| Area | Current state | Required closure |
|---|---|---|
| Editor registry | Most task types use generic standard editor | One dedicated Studio editor per canonical task type |
| Visual parity | Table is closest; other task types are approximate | Near-identical layout, spacing, controls, and states from Stitch |
| Completion blanks | Prompt text marker flow | Structured inline blank tokens with answer-key rows |
| Matching tasks | Generic option list and selectors | Task-native option banks, source rows, reuse rules, and labels |
| Judgement tasks | Dropdown answer controls | Segmented TRUE/FALSE/NOT GIVEN and YES/NO/NOT GIVEN controls |
| Flowchart/diagram | Disabled or unsupported in primary editor | Real authoring, validation, preview, and publish paths |
| Backend support | Broad canonical primitives exist | Task-type adapters, stable IDs, validation, scoring, and fixtures |

## Tasks

- [ ] 0.0 Establish Stitch parity foundation
  - **Acceptance Criteria:** Shared editor primitives, data contracts, fixtures, and screenshot workflow exist before individual task-type work starts.
  - **Not Complete If:** Any task type still needs to invent its own card shell, answer-key row, option-bank row, blank token, validation style, or screenshot harness.
  - [ ] 0.1 Create shared Stitch-parity editor primitives for task cards, task headers, compact icon buttons, option-bank rows, answer-key rows, inline validation, empty states, segmented controls, and blank tokens.
  - [ ] 0.2 Refactor `ReadingV2BuildWorkspace` so the task editor registry has an explicit component boundary for all 16 canonical task types.
  - [ ] 0.3 Define versioned task-type authoring payloads with stable IDs for options, blanks, rows, statements, table cells, flow steps, and diagram hotspots.
  - [ ] 0.4 Add migration/adapters so existing drafts can hydrate the new authoring payloads without breaking preview or publish.
  - [ ] 0.5 Add one deterministic Studio fixture for each Stitch mockup folder under `each_question_task_type_design`.
  - [ ] 0.6 Add screenshot QA workflow for desktop visual comparison against every Stitch `screen.png`.
  - [ ] 0.7 Add authoring payload contract guards for duplicate IDs, orphan references, task-type/payload mismatches, and answer-key leakage.

- [ ] 1.0 Implement `multiple-choice` editor parity
  - **Stitch Sources:** `ielts_choice_short_answer_editors`, `ielts_matching_choice_editors_sidebar_removed`
  - **Acceptance Criteria:** Teachers author single-answer multiple choice through radio-style option rows that visually match the mockups and persist canonical single-choice data.
  - **Not Complete If:** Correct answers are chosen through a plain dropdown, option rows do not show IELTS-style labels, or the editor falls back to generic prompt rows.
  - [ ] 1.1 Build a dedicated `multiple-choice` Studio editor with task title, instruction field, question cards, A/B/C/D option rows, add option, remove option, add question, and delete question controls.
  - [ ] 1.2 Persist option IDs, option labels, option values, question row IDs, and correct option IDs in the task-type authoring payload.
  - [ ] 1.3 Convert the authoring payload to canonical `single-choice` response shapes, option set refs, interactions, and scoring rules.
  - [ ] 1.4 Validate that every question has at least two options, exactly one correct option, non-empty prompt text, and no broken option references.
  - [ ] 1.5 Add tests for add/remove/reorder option behavior, correct-answer selection, draft save round-trip, preview projection safety, publish validation, and scoring.
  - [ ] 1.6 Capture visual QA evidence against both referenced Stitch mockups.
  - [x] 1.7 Latest annotation gate must verify the question prompt field has a visible input boundary, missing-correct-answer feedback is represented by border/hidden accessible text instead of a visible error block, and Add option plus Delete question share one compact row.

- [ ] 2.0 Implement `multiple-select` editor parity
  - **Stitch Sources:** `ielts_choice_short_answer_editors`, `ielts_matching_choice_editors_sidebar_removed`
  - **Acceptance Criteria:** Teachers author choose-two/choose-three style multiple-answer questions with checkbox-style selected states and an explicit required answer count.
  - **Not Complete If:** The editor models multiple selection as several unrelated single-choice rows or hides answer-count logic in backend-only data.
  - [ ] 2.1 Build a dedicated `multiple-select` editor with checkbox option rows, selection-count control, selected-count feedback, add/remove option, and add/remove question controls.
  - [ ] 2.2 Persist selection limit, option IDs, selected correct option IDs, and visible IELTS option labels.
  - [ ] 2.3 Convert the authoring payload to canonical `multi-select` response shapes with unordered scoring unless explicitly configured otherwise.
  - [ ] 2.4 Validate that the required selection count is positive, does not exceed option count, and matches the number of correct options.
  - [ ] 2.5 Add tests for count validation, unordered answer scoring, option deletion repair, preview safety, and publish blocking on incomplete answer keys.
  - [ ] 2.6 Capture visual QA evidence against both referenced Stitch mockups.
  - [x] 2.7 Latest annotation gate must verify the selection-count control sits on the same row as the prompt field, the editor inherits the compact multiple-choice row actions, and under/over-selection feedback is border-only with accessible hidden text.

- [ ] 3.0 Implement `short-answer` editor parity
  - **Stitch Sources:** `ielts_choice_short_answer_editors`, `ielts_judgement_structured_editors_sidebar_removed`
  - **Acceptance Criteria:** Teachers author compact short-answer rows with accepted answer fields and visible word-limit controls that match the Stitch layout.
  - **Not Complete If:** Accepted answers are entered only as pipe-delimited raw text or word limit is hidden in a developer-only panel.
  - [ ] 3.1 Build a dedicated `short-answer` editor with prompt rows, answer chips or fields, add accepted answer, remove accepted answer, word-limit control, and row-level validation.
  - [ ] 3.2 Persist question row IDs, prompt text, acceptable answers, word limit, case sensitivity, and punctuation sensitivity.
  - [ ] 3.3 Convert the authoring payload to canonical `free-text` response shapes and scoring rules.
  - [ ] 3.4 Validate non-empty prompts, at least one accepted answer per row, valid word limits, and no empty answer aliases.
  - [ ] 3.5 Add tests for accepted-answer editing, word-limit persistence, exact-match scoring, draft round-trip, preview safety, and publish validation.
  - [ ] 3.6 Capture visual QA evidence against the referenced Stitch mockups.
  - [x] 3.7 Latest annotation gate must verify one shared group word-limit control on the instruction row, no per-question max-word controls, clear prompt text fields, Add accepted answer on the same row as the primary answer field, and border-only missing-answer feedback.

- [ ] 4.0 Implement `sentence-completion` editor parity
  - **Stitch Sources:** `ielts_sentence_summary_completion_editors`, `ielts_completion_task_editors_sidebar_removed`
  - **Clippings Philosophy Gate:** Sentence completion is a sequence of sentence stems with one explicit blank each, not a paragraph editor and not a raw marker textarea. Validate against examples such as `Practice Cam 10 Reading Test 02.md` and `Practice Cam 12 Reading Test 04.md` where each scored row is a sentence-sized prompt with a word-limit instruction.
  - **Acceptance Criteria:** Teachers author sentence rows through one whole-sentence text field, insert an explicit `_____` blank into that sentence, use a visible per-row answer-key field, and edit one group-level word-limit control mapped to the canonical free-text response.
  - **Not Complete If:** Teachers must type raw `___` markers as the primary blank authoring workflow, blank location is implied only by row order, or answer keys are detached from visible sentence blanks.
  - [ ] 4.1 Build a dedicated `sentence-completion` editor with whole-sentence rows, caret-based inline `_____` blank insertion, blank removal, answer-key panel, group word-limit control on the instruction row, and add sentence controls.
  - [ ] 4.2 Persist sentence row IDs, text segments, blank IDs, visible question numbers, answer keys, and blank ordering.
  - [ ] 4.3 Convert structured blanks to canonical inline-blank anchors, interactions, free-text response shapes, and scoring rules.
  - [ ] 4.4 Validate that every visible blank has exactly one interaction, at least one accepted answer, and a stable anchor.
  - [ ] 4.5 Add tests for blank insertion/removal, numbering stability, answer-key mapping, draft save, preview, publish validation, and scoring.
  - [ ] 4.6 Capture visual QA evidence against both referenced Stitch mockups.
  - [ ] 4.7 Browser gate must verify: edit whole sentence text, insert `_____` into that text field, clear blank, delete the blank row, edit accepted answers, edit the group word limit from the instruction row, reject per-question word-limit fields, trigger missing blank/answer validation, repair, preview, and confirm one interaction per visible sentence blank.
  - [ ] 4.8 Clippings parity gate must verify sentence-style prompts remain compact rows and never become a continuous summary, note, or table editor.

- [x] 5.0 Implement `summary-completion-text` editor parity
  - **Stitch Sources:** `ielts_sentence_summary_completion_editors`, `ielts_completion_task_editors_sidebar_removed`
  - **Clippings Philosophy Gate:** Free-text summary completion is one flowing summary shell with multiple inline blanks and free-text answers from the passage. It must not be modeled as independent before/after prompt cards. Validate against summary-with-words examples in `Practice Cam 10 Reading Test 02.md`, `Practice Cam 10 Reading Test 03.md`, and `Practice Cam 16 Reading Test 01.md`.
  - **Acceptance Criteria:** Teachers author one continuous summary body with inline numbered blank chips and per-blank free-text answer-key rows without using generic question rows.
  - **Not Complete If:** The summary is edited as separate before/after rows, the body is stored only as one prompt textarea with marker text and no structured blank identity, or deleting a blank leaves orphan answer rows.
  - [x] 5.1 Build a dedicated `summary-completion-text` editor with summary body sections, inline blank tokens, blank toolbar actions, answer-key rows, and word-limit control.
  - [x] 5.2 Persist summary block IDs, text segments, blank IDs, blank order, answer keys, and optional section labels.
  - [x] 5.3 Convert summary blanks to canonical inline-blank anchors, interactions, and scoring rules.
  - [x] 5.4 Validate non-empty summary content, no orphan blanks, no answer rows without blanks, and complete answer keys.
  - [x] 5.5 Add tests for body editing, blank insertion, blank deletion repair, preview projection, publish validation, and scoring.
  - [x] 5.6 Capture visual QA evidence against both referenced Stitch mockups.
  - [x] 5.7 Browser gate must verify: continuous body visible, no separate before/after row fields, inline blank chips render in order, accepted-answer rows are generated from those chips, word limit applies to all free-text blanks, missing answer validation appears, repair passes, and preview/runtime keeps the summary flow.
  - [x] 5.8 Clippings parity gate must include a multi-blank summary example where each blank sits inside the same paragraph or bullet body.
    - Evidence: `ReadingV2BuildWorkspace.test.tsx`, `scripts/reading-v2-task-type-interaction-gate.mjs`, and `output/playwright/task-type-gates/summary-completion-text-foundation-gate.png` passed on 2026-05-04.

- [x] 6.0 Implement `summary-completion-list` editor parity
  - **Stitch Source:** `ielts_list_summary_note_completion_editors`
  - **Acceptance Criteria:** Teachers author summary completion from a list with one flowing summary body, inline numbered blank chips, a visible choice bank, and blank-to-choice answer mapping that matches the Stitch mockup and Clippings examples.
  - **Not Complete If:** The word bank is hidden inside a generic option-set editor, the task behaves like free-text summary completion, every blank is edited as a separate before/after row, or unused distractor choices are treated as validation errors.
  - [x] 6.1 Build a dedicated `summary-completion-list` editor with summary body, inline blank tokens, list/word-bank panel, add/remove choice controls, and answer mapping rows.
  - [x] 6.2 Persist choice IDs, choice labels, choice values, blank IDs, blank order, and blank-to-choice answer refs.
  - [x] 6.3 Convert the payload to canonical option sets, inline-blank anchors, interactions, and single-choice or matching-compatible scoring rules as appropriate.
  - [x] 6.4 Validate that the choice bank is non-empty, all blank answers reference existing choices, and no deleted choice remains selected.
  - [x] 6.5 Add tests for choice-bank editing, blank-to-choice mapping, no answer leakage, publish validation, and scoring.
  - [x] 6.6 Capture visual QA evidence against the referenced Stitch mockup.
  - [x] 6.7 Browser gate must verify: one shared option bank with more options than blanks, one continuous summary body, insert/remove inline blank chips, answer-key rows generated from blank chips, unused choices allowed, deleted selected choices clear affected answers, and student preview/runtime projection renders inline blanks against the shared option bank.
  - [x] 6.8 Clippings parity gate must include at least one `A-J` or larger choice-bank example where several choices are distractors and must remain valid when unused.

- [ ] 7.0 Implement `note-completion` editor parity
  - **Stitch Sources:** `ielts_completion_task_editors_sidebar_removed`, `ielts_list_summary_note_completion_editors`
  - **Clippings Philosophy Gate:** Note completion is a note outline with headings, bullets, indentation, and blanks inside visible note text. Validate against note examples such as `Practice Cam 10 Reading Test 04.md`, `Practice Cam 13 Reading Test 02.md`, and `Practice Cam 19 Reading Test 01.md`. The authoring surface should feel like a normal note editor, not a bespoke tree editor.
  - **Acceptance Criteria:** Teachers author heading/subheading plus whole note text rows, use formatting controls, insert inline `_____` blanks directly into note text, and fill generated answer-key rows without before/after split fields.
  - **Not Complete If:** Notes are represented as unrelated generic prompt rows, a drag/tree editor with low authoring clarity, before/after blank fields, or blank order that can drift away from the visible note text.
  - [x] 7.1 Build a dedicated `note-completion` editor with note heading/subheading, whole-note text rows, compact formatting controls, caret-based inline blank insertion, answer-key panel, and add note blank controls.
  - [x] 7.2 Persist note section IDs, note line IDs, formatting-marker text, blank IDs, blank order, answer keys, and word-limit settings.
  - [x] 7.3 Convert note blanks to canonical anchors, interactions, and scoring rules.
  - [x] 7.4 Validate non-empty note lines, complete blank answer keys, valid ordering, and no orphan interactions.
  - [x] 7.5 Add tests for note line editing, blank mapping, blank insertion/removal, preview, publish validation, and scoring.
  - [x] 7.6 Capture visual QA evidence against both referenced Stitch mockups.
  - [x] 7.7 Browser gate must verify: edit heading/subheading, edit whole note text, use formatting controls, insert `_____` at the caret, clear/delete blank, add/delete note row, edit answer key, reject before/after split fields, validate missing answer, repair, preview, and confirm note blank order follows visible text.
  - [ ] 7.8 Clippings parity gate must verify note lines stay visually grouped under their heading while the authoring UI remains a normal editable note surface.
    - Evidence: `ReadingV2BuildWorkspace.test.tsx`, `scripts/reading-v2-task-type-interaction-gate.mjs`, and `output/playwright/task-type-gates/note-completion-foundation-gate.png` passed on 2026-05-04.

- [ ] 8.0 Implement `table-completion` visual and data parity
  - **Stitch Sources:** `ielts_table_completion_editor`, `ielts_judgement_structured_editors_sidebar_removed`
  - **Acceptance Criteria:** The existing table builder matches the Stitch table editor more closely while preserving paste, edit, merge, split, blank marking, answers, preview, and publish behavior.
  - **Not Complete If:** Table data saves but the toolbar/grid/answer panel still look materially different from the Stitch HTML.
  - [ ] 8.1 Refine the table title, toolbar, grid, selected-cell state, blank-cell chips, header-row state, merged-cell state, and answer panel to match the Stitch layout.
  - [ ] 8.2 Ensure stable table cell IDs, blank cell anchors, merged-cell metadata, and answer mappings survive row/column edits and paste-table operations.
  - [ ] 8.3 Validate that every blank cell has an answer, every answer maps to an existing blank cell, merged cells remain structurally valid, and header/body roles are preserved.
  - [ ] 8.4 Extend scoring tests for table cell answers, merged cells with blanks, row/column deletion repair, and preview projection safety.
  - [ ] 8.5 Add browser visual QA at desktop width against the table mockup.
  - [ ] 8.6 Confirm table completion remains the first proven implementation pattern for subsequent structured-layout editors.
  - [x] 8.7 Add an explicit multi-cell selection mode or range-selection affordance so merge does not depend on undiscoverable modifier-click behavior.
  - [x] 8.8 Add visible selection status copy that states selected cell count, whether merge/split is available, and what the teacher must do next when an action is disabled.
  - [x] 8.9 Make blank creation explicit: the primary action must say that it creates a numbered blank/question anchor, and blank cells must immediately show the numbered chip plus a matching answer-key row.
  - [x] 8.10 Make blank clearing explicit and safe: clearing a selected blank must remove or detach the scored blank only through a visible teacher action and must update answer-key rows and validation.
  - [x] 8.11 Browser gate must test single-cell blank creation, blank clearing, rectangular multi-cell selection, merge, split, blank-anchor preservation through merge/split, edge deletion guards, paste-table blank import, answer entry, validation repair, and student preview.
  - [x] 8.12 Resolve merge/split text preservation before green light: either preserve source-cell text through split or show an explicit merge warning that selected cell text will be combined into the first split cell.
    - Evidence: `scripts/reading-v2-task-type-interaction-gate.mjs` and `output/playwright/task-type-gates/all-task-types-foundation-interaction-gate.json` passed all 16 task types on 2026-05-04.

- [ ] 9.0 Implement `flowchart-completion` editor parity
  - **Stitch Sources:** `ielts_flowchart_diagram_editors`, `ielts_flow_chart_info_editors_sidebar_removed`
  - **Clippings Philosophy Gate:** Flowchart completion represents an ordered process with visible step sequence and connector direction. No reliable normal Clippings fixture was found in the reviewed folder, so this gate is mockup-driven until a clipping fixture is added.
  - **Acceptance Criteria:** Flowchart completion is active in Studio with ordered step authoring, connector styling, inline blanks, answer keys, validation, preview, publish, and scoring.
  - **Not Complete If:** The type remains disabled, uses placeholder UI, cannot reorder steps, hides connector order in backend-only data, or cannot publish a student-safe projection.
  - [ ] 9.1 Build a dedicated `flowchart-completion` editor with ordered step cards, connector styling, add step, delete step, reorder step, inline blank tokens, and answer-key rows.
  - [ ] 9.2 Persist flow step IDs, step text segments, blank IDs, blank order, connector metadata, and answer keys.
  - [ ] 9.3 Convert flow steps to canonical flowchart stimuli, flow-step anchors, interactions, and scoring rules.
  - [ ] 9.4 Validate non-empty steps, stable ordering, complete answers, no orphan flow-step anchors, and no broken interactions.
  - [ ] 9.5 Enable the task type in the Build Workspace registry only after authoring, preview, publish, runtime rendering, and scoring pass.
  - [ ] 9.6 Add tests for step CRUD, reorder identity preservation, blank mapping, preview, publish validation, runtime projection, and scoring.
  - [ ] 9.7 Capture visual QA evidence against both referenced Stitch mockups.
  - [ ] 9.8 Browser gate must verify: edit title, edit step text, add step, delete step, reorder step, keep connector order visible, create/clear inline blank, edit answer key, validate missing answer, repair, and preview/runtime projection.
  - [ ] 9.9 Clippings gate must remain blocked until at least one real flowchart completion fixture is added or explicitly waived with mockup-only evidence.

- [ ] 10.0 Implement `diagram-labeling` editor parity
  - **Stitch Sources:** `ielts_flowchart_diagram_editors`, `ielts_judgement_structured_editors_sidebar_removed`
  - **Clippings Philosophy Gate:** Diagram labelling source images normally already include printed number indicators beside the diagram parts. The maker must not force teachers to recreate those marker positions; it should collect the diagram image and the answer key for each visible number.
  - **Acceptance Criteria:** Diagram labeling is active in Studio with URL-or-upload diagram source selection, preview-only diagram display, answer-key rows, validation, preview, publish, runtime rendering, and scoring.
  - **Not Complete If:** The editor exposes alt text, coordinate fields, draggable markers, target-label text fields, local-only object URLs, fixture-only images, or hotspot state that cannot persist and publish.
  - [ ] 10.1 Build a dedicated `diagram-labeling` editor with URL/upload image source choice, diagram preview, add/delete answer field, and answer rows only.
  - [ ] 10.2 Persist diagram asset metadata including asset ID or source URL/data URL, storage path when available, dimensions/checksum or source metadata when available, hidden stable anchor IDs, and answer keys.
  - [ ] 10.3 Convert answer fields to canonical diagram stimuli, hidden diagram-hotspot anchors, interactions, and scoring rules without exposing marker placement controls.
  - [ ] 10.4 Validate that the asset exists, every visible answer field has an interaction and answer key, and deleted assets/answer fields block publish.
  - [ ] 10.5 Enable the task type in the Build Workspace registry only after asset persistence, preview, publish, runtime rendering, and scoring pass.
  - [ ] 10.6 Add tests for source-mode selection, asset metadata round-trip, answer-field CRUD, missing asset validation, missing answer validation, preview safety, runtime projection, and scoring.
  - [ ] 10.7 Capture visual QA evidence against both referenced Stitch mockups.
  - [ ] 10.8 Browser gate must verify: URL mode, upload-file mode, no alt field, no marker drag controls, no coordinate controls, no target-label fields, answer-key edit, answer-field add/delete, missing image warning, missing answer warning, repair, preview/runtime image rendering, and student-safe projection.

- [ ] 11.0 Implement `true-false-not-given` editor parity
  - **Stitch Source:** `ielts_judgement_task_editors`
  - **Acceptance Criteria:** Teachers author TFNG statement cards with segmented TRUE / FALSE / NOT GIVEN answer controls matching the Stitch mockup.
  - **Not Complete If:** Answers are selected through a native select or labels can drift outside the TFNG vocabulary.
  - [ ] 11.1 Build a dedicated `true-false-not-given` editor with instruction block, statement cards, segmented answer control, add statement, delete statement, and row validation.
  - [ ] 11.2 Persist statement IDs, statement text, answer label, visible order, and judgement mode.
  - [ ] 11.3 Convert statements to canonical binary-judgement interactions and scoring rules using only TRUE, FALSE, and NOT GIVEN.
  - [ ] 11.4 Validate non-empty statements, exactly one valid answer per statement, and no mixed YNNG labels.
  - [ ] 11.5 Add tests for segmented control behavior, label validation, draft round-trip, preview safety, publish validation, and scoring.
  - [ ] 11.6 Capture visual QA evidence against the referenced Stitch mockup.

- [ ] 12.0 Implement `yes-no-not-given` editor parity
  - **Stitch Sources:** `ielts_judgement_structured_editors_sidebar_removed`, `ielts_judgement_task_editors`
  - **Acceptance Criteria:** Teachers author YNNG statement cards with segmented YES / NO / NOT GIVEN controls and the structured instruction block shown in Stitch.
  - **Not Complete If:** The editor reuses TFNG labels internally or exposes the wrong IELTS vocabulary in preview/runtime.
  - [ ] 12.1 Build a dedicated `yes-no-not-given` editor with structured instruction card, statement rows, segmented answer controls, add statement, delete statement, and row validation.
  - [ ] 12.2 Persist statement IDs, statement text, answer label, visible order, and judgement mode.
  - [ ] 12.3 Convert statements to canonical binary-judgement interactions and scoring rules using only YES, NO, and NOT GIVEN.
  - [ ] 12.4 Validate non-empty statements, exactly one valid answer per statement, and no mixed TFNG labels.
  - [ ] 12.5 Add tests for segmented control behavior, label validation, draft round-trip, preview safety, publish validation, and scoring.
  - [ ] 12.6 Capture visual QA evidence against both referenced Stitch mockups.

- [x] 13.0 Implement `matching-headings` editor parity
  - **Stitch Sources:** `ielts_matching_headings_information_editors`, `ielts_matching_choice_editors_sidebar_removed`
  - **Acceptance Criteria:** Teachers author matching headings with one roman-numeral heading bank where each heading option has an adjacent paragraph/section source field; empty source fields remain unused distractors, populated source fields create scored interactions, and no-reuse validation matches Stitch layouts and Clippings examples.
  - **Not Complete If:** The editor is only a generic option list plus dropdown rows, every heading is expected to be matched, answer ownership appears in detached question cards, or example rows count as scored questions.
  - [x] 13.1 Build a dedicated `matching-headings` editor with heading bank, roman numeral labels, adjacent paragraph/section source fields, add heading, delete heading, source clearing, and reuse controls.
  - [x] 13.2 Persist heading option IDs, heading labels, heading text, section row IDs, paragraph labels, row prompts, answer refs, and allow-reuse rules.
  - [x] 13.3 Convert the payload to canonical matching response shapes, option sets, interactions, and scoring rules.
  - [x] 13.4 Validate non-empty heading bank, non-empty section rows, all answers referencing existing headings, and duplicate-heading/reuse constraints.
  - [x] 13.5 Add tests for heading-bank CRUD, section row CRUD, answer mapping, no-reuse validation, preview safety, publish validation, and scoring.
  - [x] 13.6 Capture visual QA evidence against both referenced Stitch mockups.
  - [x] 13.7 Browser gate must verify: heading bank count can exceed scored source count, empty source fields are allowed and visually treated as distractors, populated source fields create the answer mapping, clearing a source removes the scored interaction, removing a mapped heading removes only affected interactions, no-reuse blocks duplicate source use unless explicitly allowed, and roman numeral labels persist after add/remove.
  - [x] 13.8 Clippings parity gate must include a Matching Headings example with omitted/example paragraphs and more heading options than scored paragraph rows.
  - [x] 13.9 Latest annotation gate must verify the roman-numeral bank is a compact table, row labels are concise, heading text fields are longer than label/source/action chrome, and repeated visible helper labels do not consume row width.

- [x] 14.0 Implement `matching-information` editor parity
  - **Stitch Sources:** `ielts_matching_headings_information_editors`, `ielts_flow_chart_info_editors_sidebar_removed`
  - **Clippings Philosophy Gate:** Matching information maps each statement to a paragraph/section bank, and the paragraph bank can contain more options than scored statements. Validate against examples such as `Practice Cam 20 Reading Test 04.md`, `Practice Cam 20 Reading Test 01.md`, and `Practice Cam 19 Reading Test 03.md`.
  - **Acceptance Criteria:** Teachers author matching information with a paragraph/section bank where each option can own one or more adjacent information-statement source fields; empty source fields remain unused paragraphs and reuse behavior is explicit.
  - **Not Complete If:** Statement-to-paragraph answers are hidden inside detached generic matching dropdown cards, unused paragraphs are treated as errors, or repeated paragraph answers cannot be represented when instructions allow reuse.
  - [x] 14.1 Build a dedicated `matching-information` editor with paragraph/section bank, adjacent information-statement source fields, source clearing, add/remove paragraph, and reuse controls where applicable.
  - [x] 14.2 Persist paragraph option IDs, paragraph labels, statement row IDs, statement text, answer refs, and allow-reuse settings.
  - [x] 14.3 Convert the payload to canonical matching response shapes, option sets, interactions, and scoring rules.
  - [x] 14.4 Validate non-empty paragraph bank, non-empty statements, valid answer refs, and reuse behavior.
  - [x] 14.5 Add tests for paragraph bank editing, statement row editing, answer mapping, reuse validation, preview safety, publish validation, and scoring.
  - [x] 14.6 Capture visual QA evidence against both referenced Stitch mockups.
  - [x] 14.7 Browser gate must verify: default A-H paragraph bank, add/remove paragraph option, empty source fields remain unused paragraphs, filled source fields create mapped statements, multi-line source fields support reuse, clearing a source removes mapped interactions, no-reuse blocks duplicates when enabled, repair validation, preview, and canonical matching payload.
  - [x] 14.8 Clippings parity gate must include a paragraph-bank example where not every paragraph is matched and repeated paragraph answers are valid when instructions allow reuse.
  - [x] 14.9 Latest annotation gate must verify the paragraph bank is a compact table with concise labels, long paragraph text fields, and source fields that do not squeeze the option text column.
    - Evidence: Clippings examples reviewed, `ReadingV2BuildWorkspace.test.tsx`, runtime fixture updates, and `output/playwright/task-type-gates/matching-information-foundation-gate.png` passed on 2026-05-04.

- [x] 15.0 Implement `matching-features` editor parity
  - **Stitch Sources:** `ielts_matching_features_endings_editors`, `ielts_matching_choice_editors_sidebar_removed`
  - **Clippings Philosophy Gate:** Matching features maps statements to named people/categories/features in a shared bank; reuse is commonly allowed and not every feature must necessarily be used. Validate against examples such as `Practice Cam 20 Reading Test 01.md`, `Practice Cam 19 Reading Test 04.md`, and `Practice Cam 20 Reading Test 04.md`.
  - **Acceptance Criteria:** Teachers author matching features through two clear sections: a compact A/B/C feature bank with long feature text fields, then separate scored statement rows that each choose a correct feature. Unused features are valid distractors and reuse/no-reuse behavior is explicit.
  - **Not Complete If:** Feature labels are generic option labels with no task-native feature bank layout, feature statements are squeezed into each feature row, every feature is treated as scored, or reuse/no-reuse behavior is implicit and untestable.
  - [x] 15.1 Build a dedicated `matching-features` editor with feature bank, separate feature-statement rows, correct-feature selectors, add/remove feature controls, add/remove statement controls, and reuse toggle.
  - [x] 15.2 Persist feature option IDs, feature labels, feature names/descriptions, statement row IDs, statement text, answer refs, and allow-reuse settings.
  - [x] 15.3 Convert the payload to canonical matching response shapes, option sets, interactions, and scoring rules.
  - [x] 15.4 Validate non-empty feature bank, complete statements, valid answer refs, and no-reuse constraints when configured.
  - [x] 15.5 Add tests for feature bank CRUD, statement CRUD, answer mapping, reuse validation, preview safety, publish validation, and scoring.
  - [x] 15.6 Capture visual QA evidence against both referenced Stitch mockups.
  - [x] 15.7 Browser gate must verify: default A-E feature bank, add/remove feature, separate statement rows, add/remove statement rows, correct-feature selection, unused features remain valid distractors, no-reuse blocks duplicate answers when toggled, deleting selected feature clears affected answers, repair validation, preview, and canonical matching payload.
  - [x] 15.8 Clippings parity gate must include a features/person-bank example with repeated answers and unused bank choices treated as valid.
  - [x] 15.9 Latest annotation gate must verify the top feature bank table gives feature text fields enough room and the bottom statement section is the only place teachers author scored statements.
    - Evidence: Clippings examples reviewed, `ReadingV2BuildWorkspace.test.tsx`, runtime fixture updates, and `output/playwright/task-type-gates/matching-features-foundation-gate.png` passed on 2026-05-04.

- [x] 16.0 Implement `matching-sentence-endings` editor parity
  - **Stitch Source:** `ielts_matching_features_endings_editors`
  - **Clippings Philosophy Gate:** Matching sentence endings has scored sentence beginnings plus a larger ending bank; endings are usually no-reuse and unused endings are normal distractors. Validate against examples such as `Practice Cam 20 Reading Test 03.md`, `Practice Cam 19 Reading Test 03.md`, and `Practice Cam 20 Reading Test 01.md`.
  - **Acceptance Criteria:** Teachers author sentence endings through two clear sections: a compact ending bank with long ending text fields, then separate scored sentence-beginning rows that each choose a correct ending. Unused endings are valid distractors, no-reuse is default, and reuse is explicit when enabled.
  - **Not Complete If:** Sentence endings are modeled as unrelated matching statements without separate beginning and ending structures, every ending must be matched, duplicate endings are allowed by accident, or beginning rows are squeezed into the ending bank.
  - [x] 16.1 Build a dedicated `matching-sentence-endings` editor with endings bank, separate sentence-beginning rows, correct-ending selectors, add/remove ending controls, add/remove beginning controls, and no-reuse messaging.
  - [x] 16.2 Persist beginning row IDs, beginning text, ending option IDs, ending labels, ending text, answer refs, and no-reuse default behavior.
  - [x] 16.3 Convert the payload to canonical matching response shapes, option sets, interactions, and scoring rules.
  - [x] 16.4 Validate non-empty beginnings, non-empty endings, valid answer refs, and no duplicate ending use unless explicitly allowed.
  - [x] 16.5 Add tests for beginning CRUD, endings bank CRUD, answer mapping, no-reuse validation, preview safety, publish validation, and scoring.
  - [x] 16.6 Capture visual QA evidence against the referenced Stitch mockup.
  - [x] 16.7 Browser gate must verify: default A-G endings bank, add/remove ending, separate beginning rows, add/remove sentence beginning rows, correct-ending selection, unused endings remain valid distractors, no-reuse default blocks duplicate answers, deleting selected ending clears affected answers, repair validation, preview, and canonical matching payload.
  - [x] 16.8 Clippings parity gate must include a sentence-ending example where the ending bank is larger than the scored beginning count and distractor endings remain valid unused options.
  - [x] 16.9 Latest annotation gate must verify the top ending bank table gives ending text fields enough room and the bottom sentence-beginning section is the only place teachers author scored beginnings.
    - Evidence: Clippings examples reviewed, `ReadingV2BuildWorkspace.test.tsx`, runtime fixture updates, and `output/playwright/task-type-gates/matching-sentence-endings-foundation-gate.png` passed on 2026-05-04.

- [ ] 17.0 Complete workspace-level visual parity and interaction polish
  - **Acceptance Criteria:** The Build Workspace shell, Add Group modal, group actions, empty states, validation states, and per-task editor cards align with the Stitch package as a whole.
  - **Not Complete If:** Individual editors match in isolation but the full Studio workspace still shows unwanted side chrome, developer wording, disabled duplicate actions, overlapping controls, or generic card nesting.
  - [ ] 17.1 Tune top bar, passage tabs, passage pane, question pane, card spacing, sticky actions, scroll behavior, and sidebar-removed layouts against the Stitch workspace samples.
  - [ ] 17.2 Implement or remove visible disabled duplicate-group chrome so teacher-facing actions are complete and intentional.
  - [ ] 17.3 Polish Add Group modal category presentation and empty states to match the Stitch updated modal and validation-state samples.
  - [ ] 17.4 Add accessible labels, focus states, keyboard reachability, and minimum touch target checks for all custom controls.
  - [ ] 17.5 Confirm no task-type editor is visible as complete if its backend adapter, validation, preview, publish, and scoring path are incomplete.

- [ ] 18.0 Complete final verification for all task-type editors
  - **Acceptance Criteria:** All 16 task types are exercised through create, edit, save, validate, preview, publish, runtime projection, scoring, and visual QA.
  - **Not Complete If:** Verification only covers fixture rendering or only covers the table-completion happy path.
  - [ ] 18.1 Add golden backend fixtures covering all 16 canonical task slugs and all 12 Stitch mockup directories.
  - [ ] 18.2 Add migration, adapter, validation, projection, answer-leakage, and scoring tests for every task type.
  - [ ] 18.3 Add Studio component tests for every task-type editor and at least one vertical create-to-preview path per engineering family.
  - [ ] 18.4 Run targeted tests with `cmd /c npx vitest run ... --reporter=basic`.
  - [ ] 18.5 Run targeted UTF-8 checks for changed text files.
  - [ ] 18.6 Run filtered TypeScript checks for touched Reading V2 Studio, service, type, and route files.
  - [ ] 18.7 Capture before/after screenshots for every Stitch `screen.png` and document intentional deviations.
  - [ ] 18.8 Confirm student-safe and session-safe projections contain no scoring rules, answer keys, import evidence, or hidden author metadata.
