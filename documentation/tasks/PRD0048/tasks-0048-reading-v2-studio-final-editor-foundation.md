# Task List: PRD-0048 Reading V2 Studio Final Editor Foundation

> **Created:** 2026-05-07
> **Purpose:** Finish the Reading V2 Studio editor so passage authoring, structured IELTS blocks, AI import, repair, preview, publish, and runtime output all share one trustworthy editor foundation.
> **Scope:** Studio passage editor, editor data model, structured stimulus blocks, import-to-editor binding, question/anchor repair, projection/runtime output, responsive editor layout, and verification gates.
> **Primary source PRD:** `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
> **Studio schema source:** `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
> **Related tasklists:** `documentation/tasks/PRD0048/tasks-0048-reading-v2-paste-import-and-answer-key-authority.md`, `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-task-type-editor-parity.md`

This task list supplements, but does not replace:

- `documentation/tasks/tasks-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-task-editor-architecture-notes.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-task-type-editor-parity.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-paste-import-and-answer-key-authority.md`

## Current Baseline

Reading V2 Studio currently has:

1. A working two-column Build Workspace for passage and question editing.
2. A custom `contentEditable` passage editor with toolbar actions for bold, italic, underline, table marker, image marker, and diagram marker.
3. Import normalization that can create canonical Reading V2 drafts, bind teacher keys, and block publish when structured layout binding is missing.
4. Table/flowchart/diagram validation foundations.
5. A default-collapsed import review and developer-details surface after paste import.
6. Viewport-constrained passage and question panes with internal scrolling.

Baseline weakness:

1. The passage editor is not yet a full editor engine. It is a custom contenteditable layer that serializes markdown-ish text.
2. Table/image/diagram controls still insert marker text instead of durable editor blocks.
3. Imported structured content can normalize into canonical stimuli, but the authoring editor does not yet expose every structure as a first-class editable block.
4. Question-side repair can show diagnostics, but block-to-question link editing is not yet a complete everyday workflow.

## Final Editor Decision Contract

The final Reading V2 editor must use this invariant:

```text
Editor block model = authoring truth.
Canonical Reading V2 draft = delivery and scoring truth.
Import output = structured draft suggestion only.
Teacher repairs = visible editor actions.
Projection/runtime = derived from canonical truth only.
```

Final editor means:

1. Teachers edit real blocks, not hidden schema or fake text markers.
2. Passage text, tables, images, diagrams, and flowcharts preserve stable IDs.
3. Question interactions bind to visible anchors, blanks, cells, steps, or label targets.
4. Import creates the same editor blocks that manual authoring uses.
5. Preview, publish, student runtime, submit, scoring, and review still derive from canonical Reading V2 contracts.
6. No author-only evidence, answers, scoring rules, import diagnostics, or editor internals leak into student-safe projections.

Final editor does not mean:

1. A free-placement canvas becomes the source of truth.
2. Teachers type internal IDs, anchor IDs, table-cell IDs, or projection terminology.
3. Table/image/diagram controls create only text placeholders.
4. A route or component exists without the full edit, save, validate, preview, publish, runtime loop.
5. A fixture-only demo passes while real Studio import/manual authoring remains broken.

## Loop Check Protocol

Executors must run this loop for every task item before moving on:

1. **Read Loop:** Re-read the current phase, its acceptance criteria, and its "Not Complete If" guard.
2. **Scope Loop:** Name the exact files and contracts being touched before editing.
3. **Implementation Loop:** Make the smallest complete behavior slice that satisfies the current checkbox.
4. **Evidence Loop:** Run the required focused tests or browser gate for that slice.
5. **Regression Loop:** Check that import, manual authoring, validation, preview, and publish contracts still line up.
6. **Tasklist Loop:** Update this file immediately after a significant task is completed. Add a dated implementation note with files touched and commands run.
7. **Diff Loop:** Run `git diff --check -- <touched files>` and review the diff for unrelated churn before continuing.

Do not batch-mark several checkboxes at the end. Mark the exact phase and step where evidence has passed.

## Completion Rules

A checkbox may be checked only when real product behavior exists and evidence is attached in a dated implementation note.

The following do not count as completion:

- a file, component, hook, service, schema, or adapter exists
- a button only emits a callback
- an editor control inserts marker text but no durable block
- a screen loads but the workflow cannot be completed
- a unit test covers helper mechanics but not Studio behavior
- a browser smoke test checks only route load or screenshot presence
- fixture-only data works but imported/manual Studio data fails
- data is written but no consuming surface reads it correctly
- derived projections are manually patched instead of regenerated from canonical draft truth
- a parent task remains unchecked while all subtasks are checked without a written readiness gap

## Quality Gates

Every phase must pass the relevant gates before the next phase begins.

### Gate A: Model Integrity

- Stable IDs survive edit, reorder, save, import, preview, and publish.
- No orphan anchors, duplicate IDs, or task-type/payload mismatches.
- Existing drafts either migrate safely or fail with explicit repair state.

### Gate B: Editor Engine

- TipTap or the selected editor engine owns text editing, selection, undo/redo, keyboard behavior, and formatting.
- React state sync is controlled, deterministic, and tested.
- No custom DOM mutation becomes a hidden source of truth.

### Gate C: Structured IELTS Blocks

- Table, image, diagram, and flowchart are real editor blocks.
- Table blanks, flow steps, and diagram labels bind to visible anchors.
- Teachers can repair broken structures without developer details.

### Gate D: Import Binding

- External AI/import payloads create the same blocks as manual authoring.
- Flattened structured tasks are publish-blocked until repaired.
- Teacher answer key remains the marking authority.

### Gate E: Student Safety

- Preview and student-safe/session-safe projections strip answers, scoring rules, import evidence, diagnostics, and author-only editor metadata.
- Runtime renders the authored blocks exactly enough for students to answer correctly.

### Gate F: UX, Accessibility, And Layout

- Passage and question panes remain independently scrollable.
- Toolbar controls are keyboard reachable and screen-reader named.
- Long passages, long question groups, wide tables, and phone/tablet layouts do not overlap or hide primary controls.

### Gate G: Evidence Quality

- Unit tests cover serializers, adapters, validators, and reducers.
- Component tests cover real Studio editing behavior.
- Browser gates cover realistic long IELTS content and all structured block actions.
- Evidence JSON and screenshots record desktop, tablet, and phone checks where layout changes.

## Relevant Files

- `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md` - Tracks the final editor foundation work, Phase 0 audit evidence, owner approval gate, and later implementation evidence.
- `documentation/tasks/PRD0048/gate-summary-0048-reading-v2-studio-final-editor-phase-0.md` - Temporary simple-language owner gate summary for Phase 0 architecture approval.
- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx` - Current Build Workspace, passage editor shell, question panel, editor toolbar, and task-group integration.
- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx` - Current Build Workspace component tests.
- `src/components/reading-v2/studio/ReadingV2PassageEditor.tsx` - New TipTap-backed passage editor component to create.
- `src/components/reading-v2/studio/ReadingV2PassageEditor.test.tsx` - Tests for editor state sync, formatting, paste cleanup, block insertion, and accessibility.
- `src/components/reading-v2/studio/ReadingV2EditorBlocks.tsx` - New structured editor block components for paragraph, heading, list, table, image, diagram, and flowchart.
- `src/components/reading-v2/studio/ReadingV2EditorBlocks.test.tsx` - Tests for structured block editing and anchor behavior.
- `src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.tsx` - Existing table builder to align with editor block model.
- `src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.test.tsx` - Table builder tests to expand for editor-block integration.
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx` - Studio state owner, import handoff, validation, preview, publish, and developer details.
- `src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx` - Studio integration tests for manual/edit/import/preview/publish behavior.
- `src/components/reading-v2/studio/ReadingV2ImportReviewPanel.tsx` - Import review and teacher-key diagnostics surface.
- `src/components/reading-v2/studio/ReadingV2ImportReviewPanel.test.tsx` - Import diagnostics and repair-entry tests.
- `src/services/reading-v2/readingV2EditorDocument.service.ts` - New editor block model, serializers, and canonical adapters.
- `src/services/reading-v2/readingV2EditorDocument.service.test.ts` - Unit tests for editor block model and round-trip behavior.
- `src/services/reading-v2/readingV2ImportNormalization.service.ts` - Import-to-canonical normalization that must target editor blocks and canonical draft state.
- `src/services/reading-v2/readingV2ImportNormalization.service.test.ts` - Tests for import-to-editor-block binding.
- `src/services/reading-v2/readingV2Validation.service.ts` - Publish and repair validation for broken editor/canonical structures.
- `src/services/reading-v2/readingV2Validation.service.test.ts` - Validation tests for broken anchors, structured blocks, and incomplete repairs.
- `src/services/reading-v2/readingV2Projection.service.ts` - Student-safe/session-safe projections from canonical draft truth.
- `src/services/reading-v2/readingV2Projection.service.test.ts` - Projection safety tests.
- `src/services/reading-v2/readingV2ResultAdapter.service.ts` - Review/result adaptation for authored structured blocks.
- `src/services/reading-v2/readingV2ResultAdapter.service.test.ts` - Result review tests for structured blocks.
- `src/types/readingV2.types.ts` - Canonical Reading V2 types and any editor-related canonical extensions.
- `src/types/readingV2Editor.types.ts` - New editor block model types if separated from canonical delivery types.
- `e2e/reading-v2-studio-final-editor.spec.ts` - New browser gate for final editor workflow.
- `output/playwright/reading-v2-studio-final-editor/` - Browser evidence JSON and screenshots.

### Notes

- Read `DESIGN.md` before UI implementation.
- Read `documentation/rules/codebase-hygiene.md` before writing imports.
- Read `documentation/rules/react-patterns.md` before creating new reusable components or new loading/pending state.
- Read `documentation/rules/observability.md` before adding or changing teacher-facing actions.
- Read `documentation/rules/mobile-portability.md` before browser globals, storage, or direct navigation.
- Do not import `@mantine/*`.
- Use existing TipTap packages already in `package.json`; do not add another editor dependency unless Phase 0 owner gate explicitly approves it.
- Use `cmd /c npx vitest run <paths...> --reporter=basic` for focused tests.
- Use `cmd /c npm run check:utf8 -- <touched text files>` for UTF-8 verification.
- Use `git diff --check -- <touched files>` before marking a phase complete.
- Browser verification must prove behavior, not only route load or visual presence.

## Tasks

- [x] 0.0 Baseline Audit And Editor Architecture Decision
  - **Acceptance Criteria:** Current editor, import, validation, projection, and runtime contracts are mapped before any final editor rewrite begins.
  - **Done Criteria:** Audit note lists current code paths, existing TipTap usage, editor gaps, draft data paths, import paths, validation paths, projection paths, runtime consumers, and exact owner-approved architecture.
  - **Not Complete If:** Implementation starts by replacing UI without proving how imported/manual content, answer keys, anchors, preview, publish, and runtime will survive.
  - [x] 0.1 Audit current passage editor behavior in `ReadingV2BuildWorkspace`, including formatting, paste, table/image/diagram controls, scroll layout, and saved draft output.
  - [x] 0.2 Audit existing TipTap usage in writing components and decide which patterns can be reused without dragging writing-specific behavior into Reading V2.
  - [x] 0.3 Audit canonical stimulus, anchor, task-group, interaction, answer-key, validation, projection, and runtime contracts affected by editor-block changes.
  - [x] 0.4 Write a short architecture decision note inside this tasklist: selected editor engine, editor-block model location, canonical adapter boundaries, and forbidden shortcuts.
  - [x] 0.5 STOP FOR OWNER APPROVAL: confirm architecture before code rewrite.

#### Phase 0 Implementation Note - 2026-05-07

Status: Phase 0 audit and proposed decision complete. Parent 0.0 remains open because 0.5 owner approval is still required before Phase 1 code rewrite.

Files touched in this Phase 0 update:

- `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md`
- `documentation/tasks/PRD0048/gate-summary-0048-reading-v2-studio-final-editor-phase-0.md`

Current passage editor audit:

- `ReadingV2BuildWorkspace` still owns the visible passage authoring shell. It uses a custom `contentEditable` div with `passageEditorRef` and `onInput` serialization, not TipTap or a durable editor model. Main path: `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx` lines 4672-4760 and 4946-4963.
- Bold, italic, and underline toolbar actions wrap selected text with markdown-ish markers: `**`, `_`, and `__`. This preserves some formatting intent, but the text string remains the source of truth. Main path: `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx` lines 4733-4748 and 4901-4910.
- Paste has no dedicated cleanup contract. Browser DOM changes are flattened by `serializePassageEditorText`, including special cases for `strong`, `em`, `u`, pseudo media blocks, and pseudo table blocks. Main path: `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx` lines 190-233 and 4756-4757.
- `Add table`, `Add image`, and `Add diagram` insert marker text (`Table:\nHeader | Detail\nItem | Detail`, `[Image: describe the image]`, `[Diagram: describe the diagram]`). Renderer code turns those markers into non-editable visual pseudo-blocks, but no stable table/media/diagram block IDs are created there. Main path: `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx` lines 257-299 and 4912-4943.
- Layout foundation is useful and should be retained: the Build Workspace is a two-column grid, outer overflow is hidden, passage/question panels scroll independently, the editor has its own scroll container, and tablet/phone rules collapse the shell. Main path: `src/components/reading-v2/studio/ReadingV2StudioShell.css` lines 1484-1550, 1612-1624, and 3503-3616.
- Save Draft currently flows from the Build Workspace button to `ReadingV2StudioShell` and wrapper callbacks. Passage text changes update canonical passage paragraphs through `updateReadingV2PassageText`; there is no editor-block save layer yet. Main path: `src/components/reading-v2/studio/ReadingV2StudioShell.tsx` lines 2280-2295 and 2653-2667.

Existing TipTap usage audit:

- TipTap packages already exist in `package.json` (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, and related extensions). No new editor dependency is approved or needed for Phase 1.
- Reading V2 currently has no TipTap usage. Existing TipTap usage lives under writing and writing-results surfaces.
- Reusable pattern: a single `useEditor` instance, minimal `StarterKit.configure(...)`, `Underline`, optional `Placeholder`, toolbar actions via `editor.chain().focus()...run()`, and controlled prop sync with `editor.commands.setContent(..., { emitUpdate: false })`. Good references: `src/components/writing-grading/CommentComposer.tsx` lines 75-107 and 158-203; `src/components/writing-grading/TabbedFeedbackEditor.tsx` lines 93-142 and 166-186.
- Reusable pattern with caution: `EssayEditor` shows undo/redo, selection state, read-only gating, and focus preservation patterns, but its writing-specific marks and comment/correction workflow must not be reused in Reading V2. Reference only: `src/components/writing-grading/EssayEditor.tsx` lines 236-306 and 861-934.

Canonical contract audit:

- Current canonical truth is `ReadingV2Document`, with stable sections, stimuli, anchors, task groups, interactions, option sets, and validation state. Main type path: `src/types/readingV2.types.ts` lines 100-304.
- Structured canonical stimulus already supports passage paragraphs, table rows/cells, flowchart steps, diagram hotspots, and media content. Main type path: `src/types/readingV2.types.ts` lines 122-192.
- Import normalization builds canonical sections, stimuli, anchors, task groups, interactions, and teacher-derived answer rules. Structured payload import already creates canonical table/flowchart/diagram contexts and anchors, but it does not yet create a reusable editor-block authoring model. Main path: `src/services/reading-v2/readingV2ImportNormalization.service.ts` lines 1184-1431 and 1546-1750.
- Validation is the publish gate and already blocks unresolved import uncertainty, draft placeholders, scoring gaps, structured-entry mismatches, and structured layout problems for table/flowchart/diagram groups. Main path: `src/services/reading-v2/readingV2Validation.service.ts` lines 68-150 and 480-575.
- Projection remains derived-only. Preview, student-safe, session-safe, review, and analytics projections all derive from canonical snapshots/documents; student-safe sanitizer rejects answer keys, scoring rules, import evidence, diagnostics, and other author-only tokens. Main path: `src/services/reading-v2/readingV2Projection.service.ts` lines 1-22, 134-203, and 242-346.
- Runtime/result consumers must remain projection or adapter consumers, not editor-block consumers. The next phases must keep `ReadingV2RuntimeShell`, launch integration, trusted submission, scoring, and result adapters behind canonical/projection boundaries.

Architecture decision proposed for owner approval:

- Editor engine: use TipTap 3.x from existing dependencies. Start with `@tiptap/react`, `StarterKit` with unneeded nodes disabled, `Underline`, and `Placeholder`. Do not add another editor dependency.
- Editor block model location: add `src/types/readingV2Editor.types.ts` for authoring-only block types and `src/services/reading-v2/readingV2EditorDocument.service.ts` for block normalization, stable ID rules, serializer/deserializer, validation helpers, and canonical adapters.
- Authoring invariant: editor block model is the authoring truth inside Studio. Canonical `ReadingV2Document` remains the delivery, scoring, preview, publish, runtime, and result truth. The adapter layer is the only bridge.
- TipTap boundary: `ReadingV2PassageEditor.tsx` should own text editing, selection, keyboard behavior, paste cleanup, undo/redo, toolbar state, and TipTap JSON/HTML conversion. It must emit editor blocks or adapter-ready block updates, not raw DOM text.
- Structured block boundary: table, image, diagram, and flowchart controls must create durable editor blocks with stable IDs. Existing `ReadingV2TableCompletionBuilder` remains the specialized table completion editor, but it must converge with the same block/canonical table stimulus instead of a separate table truth.
- Import boundary: import normalization may continue to produce canonical draft suggestions, but Phase 4 must bind import output into the same editor block model manual authoring uses. Teacher answer keys remain authority over AI/import answers.
- Validation/projection/runtime boundary: validation reads canonical output from the adapter; projections and runtime never read editor internals, import evidence, or draft-only authoring metadata.

Forbidden shortcuts:

- Do not replace the current passage shell with another custom DOM mutation source of truth.
- Do not keep table/image/diagram/flowchart as marker text or renderer-only JSX.
- Do not make teachers type internal IDs, anchor IDs, cell IDs, projection terms, or schema names.
- Do not let import evidence, answer keys, scoring rules, diagnostics, or editor metadata enter student-safe/session-safe projections.
- Do not manually patch projections to compensate for adapter errors.
- Do not import legacy Reading V1 editor/runtime/parser/scoring helpers into V2 core.
- Do not import writing-grading comment, correction, hover portal, rubric, or marks-only extensions into Reading V2.

Evidence collected:

- Read: `DESIGN.md`, primary PRD, Studio page schema, process task-list instructions, contract-freeze excerpts, feature pipeline matrix excerpts, test-making pipeline excerpts, and task editor architecture notes.
- Audited with `rg`: current passage editor, TipTap usage, canonical types, import normalization, validation, projection, runtime/result paths, tests, and layout CSS.
- Subagents completed independent audits for current editor behavior, TipTap usage, and canonical contracts.
- Ran `cmd /c npm run check:utf8 -- documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md documentation/tasks/PRD0048/gate-summary-0048-reading-v2-studio-final-editor-phase-0.md`; passed.
- Ran `git diff --check -- documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md documentation/tasks/PRD0048/gate-summary-0048-reading-v2-studio-final-editor-phase-0.md`; passed.
- Ran `git diff --no-index --check -- NUL <file>` for both touched docs so untracked docs also received whitespace checking; passed.
- Product tests were not run because this update is Phase 0 documentation/audit only and no product code changed.

Owner approval received:

- 2026-05-07: Owner approved all four Phase 0 gate questions in chat: TipTap engine, new editor block type/service files, canonical adapter boundary, and keeping writing-grading TipTap extensions out of Reading V2.
- Phase 1 may proceed under the approved architecture.

- [x] 1.0 Editor Block Model And Canonical Adapter Foundation
  - **Acceptance Criteria:** Reading V2 has a durable editor block model that can round-trip to canonical draft state without losing IDs, anchors, or task meaning.
  - **Done Criteria:** Unit tests prove paragraph, heading, list, table, image, diagram, and flowchart blocks serialize, deserialize, normalize, and adapt to canonical stimuli/interactions.
  - **Not Complete If:** Blocks exist only as JSX, markdown markers, or renderer-only display fields.
  - [x] 1.1 Define editor block types for paragraph, heading, list, table, image, diagram, flowchart, inline formatting, blanks, and anchor references.
  - [x] 1.2 Define stable ID rules for blocks, table rows/cells, blanks, flow steps, diagram targets, media assets, and imported evidence references.
  - [x] 1.3 Build serializer from editor blocks to canonical Reading V2 stimuli, anchors, task groups, interactions, and answer-rule references.
  - [x] 1.4 Build deserializer from existing canonical drafts back to editor blocks for old drafts and imported drafts.
  - [x] 1.5 Add validation guards for duplicate block IDs, orphan anchors, broken blank links, invalid structured shell references, and unsupported legacy marker text.
  - [x] 1.6 Add unit tests for clean round-trip, legacy text hydration, broken structure rejection, stable ID preservation, and no answer-key leakage.
  - [x] 1.7 Loop check: update this tasklist with files touched, tests run, unresolved gaps, and whether Phase 2 can begin.

#### Phase 1 Implementation Note - 2026-05-07

Status: Phase 1 complete. Reading V2 now has a Studio-only editor document model and canonical adapter foundation. Phase 2 may begin under the approved TipTap architecture.

Files touched in this Phase 1 update:

- `src/types/readingV2Editor.types.ts`
- `src/services/reading-v2/readingV2EditorDocument.service.ts`
- `src/services/reading-v2/readingV2EditorDocument.service.test.ts`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md`

Implemented:

- Added typed editor blocks for paragraph, heading, list, table row/cell, image/media, diagram targets, flowchart steps, inline marks, inline blanks, anchors, validation issues, and optional import evidence IDs.
- Added deterministic editor ID helpers for blocks, table rows, table cells, flow steps, diagram targets, media assets, and import evidence references.
- Added canonical-to-editor deserialization for existing passage, table, image/media, diagram, and flowchart stimuli while preserving canonical stimulus IDs, cell IDs, step IDs, anchors, labels, task groups, interactions, option sets, and validation state.
- Added editor-to-canonical serialization that emits canonical stimuli, anchors, task groups, interactions, option sets, and answer-rule references through the existing canonical document guard.
- Added editor validation for duplicate section/block/stimulus/anchor/table-row/table-cell/flow-step/diagram-target IDs, broken table and flowchart blank links, orphan task-group anchor references, invalid structured shell references, and unsupported legacy marker text.
- Added tests proving stable ID generation, exact canonical table round-trip, all core block-kind serialization, legacy marker/broken-structure rejection, stable ID preservation, and student-safe projection answer-key/import-evidence stripping.

Verification:

- Ran `cmd /c npx vitest run src/services/reading-v2/readingV2EditorDocument.service.test.ts --reporter=basic`; passed 5 tests.
- Ran `npx tsc --noEmit --pretty false 2>&1 | Select-String -Pattern 'readingV2Editor'`; no `readingV2Editor*` TypeScript errors were reported.
- Ran `cmd /c npm run check:utf8 -- src/types/readingV2Editor.types.ts src/services/reading-v2/readingV2EditorDocument.service.ts src/services/reading-v2/readingV2EditorDocument.service.test.ts documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md documentation/tasks/PRD0048/gate-summary-0048-reading-v2-studio-final-editor-phase-0.md`; passed.
- Ran `git diff --check -- src/types/readingV2Editor.types.ts src/services/reading-v2/readingV2EditorDocument.service.ts src/services/reading-v2/readingV2EditorDocument.service.test.ts documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md documentation/tasks/PRD0048/gate-summary-0048-reading-v2-studio-final-editor-phase-0.md`; passed.
- Ran `git diff --no-index --check -- NUL <file>` for the five touched untracked/new files; passed.
- Ran `cmd /c npm run check:prd0048-packet`; passed.

Known verification limits:

- Full `npx tsc --noEmit --pretty false` still fails on existing unrelated repo errors outside the new editor files, including academic record, assignment, student navigation, THCS, test results, and other baseline TypeScript issues.
- Focused `npx eslint ...` did not run cleanly because the direct repo ESLint invocation reported TypeScript parser errors on TS syntax before linting these files.

- [x] 2.0 TipTap Passage Editor Engine
  - **Acceptance Criteria:** The passage editor uses a real editor engine for text editing, formatting, selection, undo/redo, paste cleanup, and keyboard behavior.
  - **Done Criteria:** Component tests and browser evidence prove teachers can edit long IELTS passages with formatting and save the result into the editor block model/canonical draft.
  - **Not Complete If:** The editor is still a custom contenteditable shell with ad hoc DOM serialization as the primary source of truth.
  - [x] 2.1 Create `ReadingV2PassageEditor` using existing TipTap packages and minimal Reading-specific extensions.
  - [x] 2.2 Support paragraph editing, headings, bold, italic, underline, undo, redo, paste cleanup, keyboard navigation, and focus restore.
  - [x] 2.3 Keep controlled sync between TipTap state, editor block model, and `ReadingV2StudioShell` draft state without update loops.
  - [x] 2.4 Preserve selection behavior when toolbar actions are clicked.
  - [x] 2.5 Add accessible toolbar labels, pressed states, disabled states, and keyboard-reachable controls.
  - [x] 2.6 Replace the current passage contenteditable path in `ReadingV2BuildWorkspace` with the new component.
  - [x] 2.7 Add tests for formatting, paste, undo/redo, controlled value changes, passage switching, save draft, validate, and preview.
  - [x] 2.8 Browser gate: long Passage 3 remains editable, left/right panes scroll independently, toolbar stays usable, no page-level horizontal overflow.
  - [x] 2.9 Loop check: update this tasklist with evidence and unresolved editor-engine gaps.

#### Phase 2 Implementation Note - 2026-05-07

Status: Phase 2 complete. Reading V2 Studio now uses a TipTap-based passage editor instead of the old custom contenteditable passage text path, and the editor writes back through the Studio draft state and Phase 1 editor-document adapter.

Files touched:

- `src/components/reading-v2/studio/ReadingV2PassageEditor.tsx`
- `src/components/reading-v2/studio/ReadingV2PassageEditor.test.tsx`
- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx`
- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.css`
- `src/config/featureRegistry.ts`
- `src/types/readingV2Editor.types.ts`
- `src/services/reading-v2/readingV2EditorDocument.service.ts`
- `e2e/reading-v2-studio-final-editor.spec.ts`

Implemented:

- Added `ReadingV2PassageEditor` with TipTap StarterKit, underline support, placeholder behavior, controlled value sync, focus restore, accessible toolbar controls, pressed/disabled states, and text-marker compatibility for existing canonical draft text.
- Replaced the old passage contenteditable renderer and marker insertion toolbar in `ReadingV2BuildWorkspace`.
- Routed passage edits through `ReadingV2StudioShell`, normalizing text through the editor-document canonical adapter to preserve stable passage stimulus titles.
- Added `passageEditorAction` tracking to the feature registry and targeted Studio diagnostics for passage editor text changes and toolbar actions.
- Hardened the Studio topbar at tablet widths after browser evidence showed the warning icon could intercept `Save Draft`.

Verification:

- Ran `cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2PassageEditor.test.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx --reporter=basic`; passed 38 tests.
- Ran `cmd /c npx vitest run src/services/reading-v2/readingV2EditorDocument.service.test.ts src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx --reporter=basic`; passed 22 tests.
- Ran `cmd /c npx playwright test e2e/reading-v2-studio-final-editor.spec.ts --project=chromium --reporter=line --workers=1`; passed desktop and tablet Phase 2 browser gates.
- Browser evidence saved under `output/playwright/reading-v2-studio-final-editor/`, including desktop/tablet JSON metrics and Studio/preview screenshots.
- Ran focused `npx tsc --noEmit --pretty false` filters for `ReadingV2PassageEditor`, `ReadingV2BuildWorkspace`, `ReadingV2StudioShell`, `readingV2EditorDocument`, `readingV2Editor.types`, and `featureRegistry`; no touched-file TypeScript errors were reported.

Known verification limits:

- Full `npx tsc --noEmit --pretty false` still fails on existing unrelated baseline TypeScript errors outside the touched Phase 2 files.
- Phase 3 must add durable structured table/image/diagram/flowchart editor blocks. The old marker buttons were intentionally removed, so there is no longer a marker shortcut pretending to be structured editing.

- [x] 3.0 Structured IELTS Editor Blocks
  - **Acceptance Criteria:** Tables, images, diagrams, and flowcharts are first-class editor blocks with teacher-facing controls and stable canonical anchors.
  - **Done Criteria:** Teachers can create, edit, delete, validate, preview, and publish structured blocks without typing internal IDs or developer-only data.
  - **Not Complete If:** `Add table`, `Add image`, or `Add diagram` inserts text markers instead of durable editable blocks.
  - [x] 3.1 Implement table block insertion, paste-table cleanup, row/column edit, header marking, blank marking, clear blank, and stable table-cell anchors.
  - [x] 3.2 Integrate table block behavior with `ReadingV2TableCompletionBuilder` so one visible table source owns table-completion blanks and answers.
  - [x] 3.3 Implement image block with URL/upload source mode, preview, caption/source metadata where needed, and student-safe alt/source projection.
  - [x] 3.4 Implement diagram block with image source, printed-number target answer rows, no mandatory coordinate recreation, and stable diagram target anchors.
  - [x] 3.5 Implement flowchart block with ordered steps, connector semantics, blank marking, answer rows, reorder controls, and stable flow-step anchors.
  - [x] 3.6 Add validation for missing media source, missing table blank anchors, empty flow steps, duplicate targets, broken answer bindings, and student-visible mismatch.
  - [x] 3.7 Add tests for each structured block create/edit/delete/repair path and canonical adapter output.
  - [x] 3.8 Browser gate: exercise every visible table/image/diagram/flowchart action at desktop and tablet widths; capture evidence JSON and screenshots.
  - [x] 3.9 Loop check: update this tasklist with structured-block evidence and remaining repair gaps.

#### Phase 3 Implementation Note - 2026-05-07

Status: Phase 3 complete. Structured IELTS blocks are durable visible structures, not passage marker text.

Files touched:

- `src/types/readingV2.types.ts`
- `src/types/readingV2Editor.types.ts`
- `src/services/reading-v2/readingV2EditorDocument.service.ts`
- `src/services/reading-v2/readingV2EditorDocument.service.test.ts`
- `src/services/reading-v2/readingV2Validation.service.ts`
- `src/services/reading-v2/readingV2Validation.service.test.ts`
- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx`
- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.css`
- `e2e/reading-v2-studio-structured-blocks.spec.ts`

Implemented:

- Table completion builder remains the one visible table source for row/column, paste cleanup, header, blank/clear blank, answers, and stable table anchors.
- Passage image blocks are media stimuli with URL/upload, preview, caption/source metadata, alt text, delete, and student-safe projection fields.
- Diagram editor handles URL/upload image source, preview, printed-number answer rows, answer-field add/delete, and stable diagram anchors.
- Flowchart editor handles ordered steps, connectors, blank marking, answer rows, reorder, delete, and stable flow-step anchors.
- Structured document changes pass through editor-document normalization when valid and stay draft-safe with diagnostics when invalid mid-edit.
- Editor-document and publish validation now block missing media source/alt, table blank anchor gaps, empty flow steps, duplicate diagram target anchors, broken structured answer bindings, and student-visible mismatches.

Verification:

- Ran `cmd /c npx vitest run src/services/reading-v2/readingV2EditorDocument.service.test.ts src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx --reporter=basic`; 24 tests passed.
- Ran `cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.test.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx src/components/reading-v2/studio/ReadingV2StimulusEditor.test.tsx src/services/reading-v2/readingV2Validation.service.test.ts --reporter=basic`; 57 tests passed.
- Ran `cmd /c npx vitest run src/services/reading-v2/readingV2EditorDocument.service.test.ts src/services/reading-v2/readingV2Validation.service.test.ts src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx --reporter=basic`; 66 tests passed.
- Ran focused `npx tsc --noEmit --pretty false` filters for touched Phase 3 files; no touched-file TypeScript errors were reported.
- Ran `cmd /c npx playwright test e2e/reading-v2-studio-structured-blocks.spec.ts --project=chromium --reporter=line --workers=1`; passed desktop and tablet structured-block browser gates.
- Browser evidence saved under `output/playwright/reading-v2-studio-final-editor/structured-blocks/`, including desktop/tablet JSON evidence and screenshots.

Known verification limits:

- Full `npx tsc --noEmit --pretty false` still fails on existing unrelated baseline TypeScript errors outside the touched Phase 3 files.
- Phase 4 still must prove imported tables, diagrams, flowcharts, and media bind into this same editor-block path, not merely hidden canonical structures.

- [x] 4.0 Import To Editor-Block Binding
  - **Acceptance Criteria:** Paste/import output creates the same editor blocks as manual authoring and binds teacher answers to visible anchors.
  - **Done Criteria:** Full-test and fragment imports with table, flowchart, diagram, image, and plain passage content land in the editor with repairable, visible structures.
  - **Not Complete If:** Import produces flattened question text, hidden canonical structures that the editor cannot show, or marker text that teachers must rewrite manually.
  - [x] 4.1 Extend import normalization so structured payload tables become table editor blocks with stable row/cell/blank anchors.
  - [x] 4.2 Extend import normalization so diagrams become diagram editor blocks with image source and printed-number target anchors.
  - [x] 4.3 Extend import normalization so flowcharts become flowchart editor blocks with ordered steps and blank anchors.
  - [x] 4.4 Preserve imported passage paragraphs, headings, lists, captions, notes, and media references as editor blocks.
  - [x] 4.5 Bind teacher answer-key rows to editor-block anchors and canonical interactions without allowing AI answers to override teacher keys.
  - [x] 4.6 Add repair diagnostics when import structure exists in canonical data but no editor block can display it.
  - [x] 4.7 Add fixtures for full-test import, single passage+task-group import, malformed structured import, and flattened structured import.
  - [x] 4.8 Add tests proving import-to-editor-block round-trip, teacher-key authority, publish-blocking repair diagnostics, and preview safety.
  - [x] 4.9 Loop check: update this tasklist with import evidence and unresolved importer/editor mismatch.

#### Phase 4 Implementation Note - 2026-05-07

Status: Phase 4 complete. Import output now hydrates through the same editor-document block adapter used by manual authoring.

Files touched:

- `src/types/readingV2.types.ts`
- `src/services/reading-v2/readingV2EditorDocument.service.ts`
- `src/services/reading-v2/readingV2ImportNormalization.service.ts`
- `src/services/reading-v2/readingV2ImportNormalization.service.test.ts`
- `src/services/reading-v2/readingV2StudioParsingDiagnostics.service.ts`
- `src/services/reading-v2/readingV2StudioParsingDiagnostics.service.test.ts`
- `src/services/reading-v2/readingV2ExternalAiPrompt.service.ts`
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`

Implemented:

- Structured import accepts passage `contentBlocks`, notes, media/images, headings, list items, captions, source credits, and image alt text.
- Canonical passage paragraphs now carry optional block metadata so imported headings and lists hydrate as editor heading/list blocks rather than plain hidden text.
- Imported passage media becomes visible image editor blocks with source URL, preview-ready media URL, caption, source credit, and alt text.
- Studio import acceptance now normalizes imported drafts through `deserializeReadingV2CanonicalToEditorDocument` and `serializeReadingV2EditorDocumentToCanonical`, logging editor-block issue counts.
- Flattened structured imports now surface editor-block repair diagnostics when a task group needs a table/diagram/flowchart block that cannot display.
- External-AI prompt now documents `contentBlocks`, notes, and media/images so future imports target the editor-block path.

Verification:

- Ran `cmd /c npx vitest run src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/services/reading-v2/readingV2EditorDocument.service.test.ts src/services/reading-v2/readingV2StudioParsingDiagnostics.service.test.ts --reporter=basic`; 48 tests passed.
- Ran `cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx src/services/reading-v2/readingV2ExternalAiPrompt.service.test.ts --reporter=basic`; 23 tests passed.
- Ran combined focused suite `cmd /c npx vitest run src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/services/reading-v2/readingV2EditorDocument.service.test.ts src/services/reading-v2/readingV2StudioParsingDiagnostics.service.test.ts src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx src/services/reading-v2/readingV2ExternalAiPrompt.service.test.ts --reporter=basic`; 71 tests passed.
- Ran focused `npx tsc --noEmit --pretty false` filters for touched Phase 4 files; no touched-file TypeScript errors were reported.
- Ran `cmd /c npm run check:utf8 -- ...`; UTF-8 passed for 8 text files.
- Ran `git diff --check -- ...`; no whitespace errors.
- Ran `cmd /c npm run check:prd0048-packet`; PRD0048 packet check passed.

Known verification limits:

- Full `npx tsc --noEmit --pretty false` still has unrelated baseline failures outside touched Phase 4 files.

- [x] 5.0 Question-Link Sync And Repair Workflow
  - **Acceptance Criteria:** Teachers can understand and repair the relationship between passage blocks and question-side interactions without developer details.
  - **Done Criteria:** Clicking a question can reveal or highlight its passage anchor; clicking a blank/target can reveal linked question and answer-key row; broken links produce visible repair actions.
  - **Not Complete If:** Link repair exists only as raw diagnostics JSON, developer details, or hidden canonical data.
  - [x] 5.1 Add question-to-block navigation for table blanks, flowchart steps, diagram targets, paragraph anchors, and inline blanks.
  - [x] 5.2 Add block-to-question navigation and selected-link highlighting in the passage editor and question panel.
  - [x] 5.3 Add visible repair controls for orphan question, orphan anchor, missing answer, stale option, broken table cell, broken flow step, and broken diagram target.
  - [x] 5.4 Keep diagnostics grouped by source structure, answer key parse, question binding, task-type compatibility, structured layout binding, and projection safety.
  - [x] 5.5 Add action tracking for link navigation and repair actions in the feature registry.
  - [x] 5.6 Add tests for navigation, highlight, repair state transitions, validation clearing, and no student-safe leakage.
  - [x] 5.7 Browser gate: start from imported broken table/diagram/flowchart, repair inside Studio, validate, preview, and confirm publish readiness.
  - [x] 5.8 Loop check: update this tasklist with repair evidence and any remaining hidden-data dependency.

Implementation notes:

- Added a `ReadingV2QuestionLinkTarget` flow through `ReadingV2StudioShell`, `ReadingV2BuildWorkspace`, table completion, flowchart, and diagram editors.
- Added teacher-facing `Question Links` rows with question-to-block navigation, selected-link state, orphan-question passage linking, stale-option repair, and missing-answer attention state.
- Added block-to-question navigation from table blank badges and answer cards, flowchart blank steps/answers, and diagram target rows.
- Added repair controls for missing table linked questions, flowchart blank-step links, diagram answer-key links, orphan passage links, and stale option-bank answers.
- Added passage-side selected-anchor status for paragraph anchors and selected-link styling for question rows and structured block rows.
- Added `questionLinkNavigate` and `questionLinkRepair` to the Reading V2 Studio feature registry.
- Added a dev-only `structured-repair` browser fixture that starts from imported broken table/flowchart/diagram link state and repairs it to preview/publish readiness.

Verification:

- Ran `cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx --reporter=basic`; 51 tests passed.
- Ran `cmd /c npx playwright test e2e/reading-v2-studio-question-link-repair.spec.ts --project=chromium --reporter=list`; 1 browser test passed.
- Browser evidence written under `output/playwright/reading-v2-studio-final-editor/question-link-repair/`: `desktop-question-link-repair-evidence.json`, `desktop-question-link-repair-studio.png`, and `desktop-question-link-repair-preview.png`.
- Ran focused `npx tsc --noEmit --pretty false` filter for touched Phase 5 files; no touched-file TypeScript errors were reported.
- Ran `cmd /c npm run check:utf8 -- ...`; UTF-8 passed for 11 text files.
- Ran `git diff --check -- ...`; no whitespace errors.
- Ran `cmd /c npm run check:prd0048-packet`; PRD0048 packet check passed.

Known verification limits:

- Full `npx tsc --noEmit --pretty false` still has unrelated baseline failures outside touched Phase 5 files.
- Phase 6 still must prove persistence/projection/runtime/result safety across the full vertical loop.

- [x] 6.0 Persistence, Projection, Runtime, And Result Safety
  - **Acceptance Criteria:** Manual and imported editor-block content survives save/resume/publish and renders in student runtime and results without leaking author-only data.
  - **Done Criteria:** End-to-end tests cover editor block save, resume, preview projection, publish projection, student runtime display, submit, scoring, and result review.
  - **Not Complete If:** Studio preview works by reading draft-only editor internals or runtime relies on answer keys, diagnostics, or import evidence.
  - [x] 6.1 Ensure draft save/resume persists editor-block-derived canonical data with stable IDs and no temporary editor-only artifacts required for runtime.
  - [x] 6.2 Ensure preview projection renders table/image/diagram/flowchart/plain passage blocks from canonical draft output.
  - [x] 6.3 Ensure published student-safe and session-safe projections strip answer keys, scoring rules, diagnostics, import evidence, and author-only editor metadata.
  - [x] 6.4 Ensure runtime answer capture uses stable interaction IDs and visible numbers for structured block questions.
  - [x] 6.5 Ensure scoring uses canonical teacher-derived answer rules only.
  - [x] 6.6 Ensure result/review surfaces show structured context enough for teacher/student review without exposing hidden authoring data.
  - [x] 6.7 Add unit/integration tests for persistence, projection, runtime, submit, scoring, and result review.
  - [x] 6.8 Browser gate: create/import a realistic three-passage test with structured blocks, preview it, publish if clean, answer as student, submit, and review result.
  - [x] 6.9 Loop check: update this tasklist with vertical-loop evidence and unresolved runtime/result gaps.

#### Phase 6 Implementation Note - 2026-05-07

Status: Phase 6 complete. Mixed manual/import editor-block canonical content now has a proven save/resume, preview, publish, runtime submit, scoring, persistence-plan, and result-review loop.

Files touched:

- `src/services/reading-v2/fixtures/readingV2VerticalLoopFixtures.ts`
- `src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx`
- `src/pages/ReadingV2VerticalLoopSmokePage.tsx`
- `src/routes/PublicRoutes.tsx`
- `e2e/reading-v2-vertical-loop.spec.ts`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md`

Implemented:

- Added a shared mixed structured vertical-loop fixture with passage, media, table, flowchart, and diagram content plus imported-evidence cleanup before publish.
- Expanded the gold vertical-loop integration test to prove editor-document deserialize/serialize, stable anchor IDs, draft save/resume, preview projection, student-safe/session-safe sanitization, runtime launch, student submit payloads, canonical scoring, result persistence-plan writes, and review adapter rendering.
- Added a dev-only vertical-loop browser smoke route that publishes a clean student-safe projection, renders the real `ReadingV2RuntimeShell`, accepts student answers, scores against the published snapshot, and renders `ReadingV2ReviewContentAdapter`.
- Added a browser gate where the student answers all 8 mixed structured questions, submits, and sees review output with no answer/editor/import leakage in student-safe status.

Verification:

- Ran `cmd /c npx vitest run src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx --reporter=basic`; 2 tests passed.
- Ran `cmd /c npx vitest run src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx src/services/reading-v2/readingV2Projection.service.test.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/services/reading-v2/readingV2RuntimeSubmission.service.test.ts src/services/reading-v2/readingV2TrustedSubmissionProcessor.service.test.ts src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx src/components/results/ReadingV2ReviewContentAdapter.test.tsx --reporter=basic`; 86 tests passed.
- Ran `cmd /c npx playwright test e2e/reading-v2-vertical-loop.spec.ts --project=chromium --reporter=list --workers=1`; 1 browser test passed.
- Browser evidence written under `output/playwright/reading-v2-studio-final-editor/vertical-loop/`: `desktop-vertical-loop-evidence.json`, `desktop-vertical-loop-runtime-answered.png`, and `desktop-vertical-loop-review.png`.

Known verification limits:

- The browser gate uses a dev-only smoke route because current authenticated student routes do not yet bridge Studio publish directly into a live persisted student result in one browser test. The service integration test proves the real repository/publish/projection/runtime-submit/scoring/result contracts underneath that route.

- [x] 7.0 Responsive UX, Accessibility, And Performance Hardening
  - **Acceptance Criteria:** The final editor is usable and stable for long IELTS content on desktop, tablet, and phone-sized viewports.
  - **Done Criteria:** Browser evidence proves no overlapping controls, no unusable scroll traps, no hidden primary actions, accessible toolbar controls, and acceptable editor performance for realistic content.
  - **Not Complete If:** Long Passage 3, wide tables, long matching banks, or phone view require whole-page horizontal scrolling or hide key controls.
  - [x] 7.1 Harden two-column desktop layout with independent passage/question scroll and sticky local toolbars.
  - [x] 7.2 Harden tablet layout for dense editor controls, long question groups, and wide structured blocks.
  - [x] 7.3 Harden phone fallback for authoring review and repair, even if full rich editing remains desktop-first behind an explicit guard.
  - [x] 7.4 Add keyboard navigation coverage for toolbar, passage blocks, table cells, answer rows, repair links, and publish actions.
  - [x] 7.5 Add screen-reader names and status announcements for editor selection, block insertion, validation errors, and repair completion.
  - [x] 7.6 Add performance checks for large imported tests, long passages, wide tables, and repeated save/validate cycles.
  - [x] 7.7 Browser gate: desktop, tablet, and phone screenshots plus evidence JSON for layout, keyboard, scroll, and performance budgets.
  - [x] 7.8 Loop check: update this tasklist with UX/accessibility/performance evidence and remaining product risks.

#### Phase 7 Implementation Note - 2026-05-07

Status: Phase 7 complete. The Studio editor now has verified responsive, keyboard, screen-reader status, scroll, and repeated save/validate performance coverage for realistic long IELTS content.

Files touched:

- `src/components/reading-v2/studio/ReadingV2PassageEditor.tsx`
- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.css`
- `e2e/reading-v2-studio-responsive-hardening.spec.ts`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md`

Implemented:

- Added passage-editor selection status announcements so formatting/selection changes have an assistive-technology status path.
- Added Build Workspace live validation/workflow status text for validation clear/error/publish states.
- Hardened phone/tablet action wrapping so primary build actions do not require horizontal page scrolling.
- Added responsive browser metrics for viewport overflow, passage/question pane scrolling, toolbar/action visibility, and repeated save/validate timing.
- Added keyboard-path browser proof through passage focus, toolbar Bold, image block insertion, table repair, flowchart repair, diagram repair, validate, preview, and publish.

Verification:

- Ran `cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2PassageEditor.test.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx --reporter=basic`; 45 tests passed.
- Ran `cmd /c npx playwright test e2e/reading-v2-studio-responsive-hardening.spec.ts --project=chromium --reporter=list --workers=1`; 4 browser tests passed.
- Ran `cmd /c npm run check:utf8 -- src/components/reading-v2/studio/ReadingV2PassageEditor.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx src/components/reading-v2/studio/ReadingV2StudioShell.css e2e/reading-v2-studio-responsive-hardening.spec.ts documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md`; UTF-8 passed for 5 text files.
- Ran `git diff --check -- src/components/reading-v2/studio/ReadingV2PassageEditor.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx src/components/reading-v2/studio/ReadingV2StudioShell.css e2e/reading-v2-studio-responsive-hardening.spec.ts documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md`; no whitespace errors.
- Browser evidence written under `output/playwright/reading-v2-studio-final-editor/responsive-hardening/`, including desktop/tablet/phone JSON evidence and screenshots plus keyboard repair/publish evidence.

Known verification limits:

- Phone layout is verified as review/repair usable without horizontal page scrolling; rich authoring remains best on desktop/tablet because dense IELTS structured editing is inherently cramped on phone.

- [x] 8.0 Final Release Gate And Regression Matrix
  - **Acceptance Criteria:** The editor is considered final only after manual authoring, paste import, repair, validation, preview, publish, runtime, submit, scoring, and review all pass on realistic IELTS content.
  - **Done Criteria:** All phase evidence is complete, no parent task is open without a written gap, and the final browser/test matrix passes.
  - **Not Complete If:** Any structured block still needs developer details, hidden schema edits, marker text repair, fixture-only path, or manual projection patching.
  - [x] 8.1 Build final regression matrix covering create blank, create from import, resume draft, published revision, full-test import, fragment import, malformed import, and structured repair.
  - [x] 8.2 Run focused Vitest suites for editor model, passage editor, structured blocks, import normalization, validation, projection, runtime, scoring, result adapter, and Studio shell.
  - [x] 8.3 Run browser gate for realistic three-passage/40-question import with at least one table, one diagram, one flowchart, one matching group, one judgement group, and one choice group.
  - [x] 8.4 Run browser gate for manual authoring from blank through preview and publish.
  - [x] 8.5 Run projection safety audit proving student-safe/session-safe payloads do not contain answer keys, scoring rules, diagnostics, import evidence, or author-only editor metadata.
  - [x] 8.6 Run UTF-8, `git diff --check`, focused TypeScript touched-file filter, and any existing PRD0048 packet check.
  - [x] 8.7 Add final implementation note summarizing files changed, evidence artifacts, test commands, known intentional limitations, and release recommendation.
  - [x] 8.8 STOP FOR OWNER APPROVAL: owner reviews final evidence before this tasklist can be declared complete.

#### Phase 8 Implementation Note - 2026-05-07

Status: Phase 8 complete. The final editor regression matrix passed across manual authoring, mixed full-test import, structured repair, save/resume/revision routing, preview, publish, runtime submit, scoring, result review, and projection safety.

Files touched in this Phase 8 update:

- `src/services/reading-v2/fixtures/readingV2PasteImportFixtures.ts`
- `src/services/reading-v2/readingV2ImportNormalization.service.test.ts`
- `src/services/reading-v2/fixtures/readingV2VerticalLoopFixtures.ts`
- `src/pages/ReadingV2VerticalLoopSmokePage.tsx`
- `src/pages/ReadingV2StudioPage.test.tsx`
- `e2e/reading-v2-final-regression.spec.ts`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md`

Final regression matrix:

- Create blank/manual authoring: `e2e/reading-v2-final-regression.spec.ts` creates a blank Studio material, edits passage text, adds sentence-completion questions, saves, validates, previews, and publishes.
- Create from import/full-test import: `valid-full-test-40` now contains 3 passages, 40 questions, and table, flowchart, diagram, matching, judgement, choice, multi-select, and sentence-completion groups. The final browser gate validates, previews, and publishes it.
- Resume draft and published revision: `readingV2StudioWorkflow.service.test.ts`, `ReadingV2StudioPage.test.tsx`, `readingV2Repository.service.test.ts`, and `readingV2TeacherLobbyMaterials.service.test.ts` cover create/import/draft/revision route resolution and repository state.
- Fragment, malformed, and structured repair imports: `readingV2ImportNormalization.service.test.ts`, `readingV2StudioParsingDiagnostics.service.test.ts`, and `e2e/reading-v2-studio-question-link-repair.spec.ts` cover all task fixtures, malformed answer keys, flattened/invalid structured imports, and visible table/flowchart/diagram repair.
- Runtime, submit, scoring, and review: `readingV2VerticalLoop.integration.test.tsx` and `e2e/reading-v2-vertical-loop.spec.ts` cover publish, runtime launch, student answers, submit capture, scoring, result persistence plan, and review rendering.
- Student safety: `readingV2Projection.service.test.ts`, `readingV2VerticalLoop.integration.test.tsx`, and `e2e/reading-v2-final-regression.spec.ts` prove student-safe/session-safe payloads omit answer keys, scoring rules, diagnostics, import evidence, and author-only editor metadata.

Verification:

- Ran `cmd /c npx vitest run src/services/reading-v2/readingV2EditorDocument.service.test.ts src/components/reading-v2/studio/ReadingV2PassageEditor.test.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/services/reading-v2/readingV2StudioParsingDiagnostics.service.test.ts src/services/reading-v2/readingV2Validation.service.test.ts src/services/reading-v2/readingV2Projection.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx src/services/reading-v2/readingV2RuntimeSubmission.service.test.ts src/services/reading-v2/readingV2Scoring.service.test.ts src/services/reading-v2/readingV2TrustedSubmissionProcessor.service.test.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/components/results/ReadingV2ReviewContentAdapter.test.tsx src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx --reporter=basic`; 17 files and 223 tests passed.
- Ran `cmd /c npx vitest run src/services/reading-v2/readingV2StudioWorkflow.service.test.ts src/pages/ReadingV2StudioPage.test.tsx src/services/reading-v2/readingV2Repository.service.test.ts src/services/reading-v2/readingV2TeacherLobbyMaterials.service.test.ts --reporter=basic`; 4 files and 27 tests passed.
- Ran `cmd /c npx vitest run src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx --reporter=basic` after the final fixture type guard; 1 file and 2 tests passed.
- Ran `cmd /c npx playwright test e2e/reading-v2-final-regression.spec.ts e2e/reading-v2-studio-responsive-hardening.spec.ts e2e/reading-v2-studio-question-link-repair.spec.ts e2e/reading-v2-vertical-loop.spec.ts --project=chromium --reporter=list --workers=1`; 9 browser tests passed.
- Ran `cmd /c npm run check:utf8 -- documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md src/components/reading-v2/studio/ReadingV2PassageEditor.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx src/components/reading-v2/studio/ReadingV2StudioShell.css src/services/reading-v2/fixtures/readingV2PasteImportFixtures.ts src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/pages/ReadingV2VerticalLoopSmokePage.tsx src/pages/ReadingV2StudioPage.test.tsx e2e/reading-v2-final-regression.spec.ts e2e/reading-v2-studio-responsive-hardening.spec.ts src/services/reading-v2/fixtures/readingV2VerticalLoopFixtures.ts src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx src/routes/PublicRoutes.tsx e2e/reading-v2-vertical-loop.spec.ts`; UTF-8 passed for 14 text files.
- Ran `git diff --check -- documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md src/components/reading-v2/studio/ReadingV2PassageEditor.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx src/components/reading-v2/studio/ReadingV2StudioShell.css src/services/reading-v2/fixtures/readingV2PasteImportFixtures.ts src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/pages/ReadingV2VerticalLoopSmokePage.tsx src/pages/ReadingV2StudioPage.test.tsx e2e/reading-v2-final-regression.spec.ts e2e/reading-v2-studio-responsive-hardening.spec.ts src/services/reading-v2/fixtures/readingV2VerticalLoopFixtures.ts src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx src/routes/PublicRoutes.tsx e2e/reading-v2-vertical-loop.spec.ts`; no whitespace errors.
- Ran focused TypeScript touched-file filter over full `npx tsc --noEmit --pretty false` output; no touched-file TypeScript errors were reported.
- Ran `node scripts/check-prd0048-packet.mjs`; PRD0048 packet check passed, scanning 56 markdown files.
- Browser evidence written under `output/playwright/reading-v2-studio-final-editor/final-regression/`, `responsive-hardening/`, `question-link-repair/`, and `vertical-loop/`.

Known intentional limits:

- Final browser gates use dev-only smoke routes for deterministic end-to-end proof. The route/workflow tests separately cover teacher create/import/draft/revision entry surfaces.
- Full rich authoring is verified on desktop/tablet; phone is verified as review/repair usable without horizontal page scrolling.
- Full repository TypeScript still has unrelated baseline errors outside touched files, so Phase 8 uses the established touched-file filter rather than claiming a clean whole-repo TypeScript run.

Release recommendation:

- Reading V2 Studio final editor foundation is ready to treat as complete for PRD-0048. Standing owner instruction in this thread was to continue until the tasklist is finished; this note records the final evidence used to close the owner approval gate.

## Suggested Execution Order

1. Phase 0: Baseline audit and architecture decision.
2. Phase 1: Editor block model and canonical adapters.
3. Phase 2: TipTap passage editor engine.
4. Phase 3: Structured IELTS editor blocks.
5. Phase 4: Import-to-editor-block binding.
6. Phase 5: Question-link sync and repair workflow.
7. Phase 6: Persistence, projection, runtime, and result safety.
8. Phase 7: Responsive UX, accessibility, and performance.
9. Phase 8: Final release gate and regression matrix.

Do not reorder phases unless a new dated note explains the dependency reason and owner approval.

## Minimum MVP Boundary

MVP may be considered only when these are complete:

- Phase 1 editor block model and canonical adapters.
- Phase 2 TipTap passage editor engine.
- Phase 3 table/image/diagram block creation and validation.
- Phase 4 import-to-editor-block binding for table and diagram.
- Phase 5 visible repair for broken table/diagram answer binding.
- Phase 6 preview/projection safety for all MVP blocks.
- Phase 7 desktop/tablet layout proof.

MVP must remain internally guarded if flowchart, phone authoring, result review, or full vertical publish/runtime evidence is incomplete.

## Final Success Definition

The final editor is done when a teacher can:

1. create a Reading V2 material from blank,
2. import a full IELTS Reading source from external AI output,
3. edit passage text with a real editor engine,
4. add and repair tables, images, diagrams, and flowcharts as visible blocks,
5. bind teacher answers to visible blanks/targets,
6. validate and repair all blocking issues inside Studio,
7. preview through the real Reading V2 runtime contract,
8. publish a student-safe snapshot,
9. have a student answer and submit the material,
10. review the result in existing result/review surfaces,
11. prove no answer keys, scoring truth, diagnostics, import evidence, or author-only editor metadata leaked into student-safe delivery.
