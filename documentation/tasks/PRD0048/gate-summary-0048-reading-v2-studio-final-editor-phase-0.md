# Gate Summary: Reading V2 Studio Final Editor Phase 0

Date: 2026-05-07
Status: Owner approval required before Phase 1 code rewrite.
Main tasklist: `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-final-editor-foundation.md`

## What Owner Needs To Decide

Approve or reject this architecture direction:

- Use existing TipTap 3.x packages for the passage editor engine.
- Add a separate Reading V2 editor block model under `src/types/readingV2Editor.types.ts`.
- Add adapter logic under `src/services/reading-v2/readingV2EditorDocument.service.ts`.
- Keep canonical `ReadingV2Document` as preview, publish, runtime, scoring, and result truth.
- Make import and manual authoring converge through the same editor blocks before canonical output.

## 1. Passage Editor

Old docs said:

- Final editor must use a real editor engine.
- Teachers edit blocks, not hidden schema or fake marker text.
- Table, image, diagram, and flowchart controls must create durable blocks.

Current repo does now:

- Passage editing uses custom `contentEditable`.
- Bold, italic, and underline insert markdown-ish text markers.
- Table, image, and diagram buttons insert text markers.
- Marker text is rendered as pseudo-blocks, but no durable block IDs are created there.

What changed in this phase:

- No product code changed.
- Audit documented exact current behavior and the gap.
- Tasklist now marks Phase 0.1 complete because the current behavior is mapped.

Simple recommendation:

- Replace the passage editor with TipTap in Phase 2 after Phase 1 block model exists.

Simple reason:

- TipTap can own selection, formatting, paste, undo, redo, keyboard behavior, and accessible toolbar state. The current DOM/text-marker path cannot safely own stable structured blocks.

## 2. Editor Block Model

Old docs said:

- Editor block model is authoring truth.
- Canonical draft is delivery and scoring truth.
- Projection/runtime must be derived only.

Current repo does now:

- Canonical `ReadingV2Document` already supports passages, tables, flowcharts, diagrams, anchors, task groups, interactions, and answer rules.
- No separate Reading V2 editor block model exists yet.
- Manual passage editing still writes text directly into canonical passage paragraphs.

What changed in this phase:

- Proposed model location: `src/types/readingV2Editor.types.ts`.
- Proposed adapter/service location: `src/services/reading-v2/readingV2EditorDocument.service.ts`.
- Tasklist now marks Phase 0.4 complete because the architecture note is written.

Simple recommendation:

- Build the editor block model first, then swap the editor UI onto it.

Simple reason:

- UI replacement before the block model would recreate the same problem in a new editor shell: visible edits but no durable structured authoring truth.

## 3. Import And Answer Keys

Old docs said:

- Import is only a structured draft suggestion.
- Teacher answer key remains the marking authority.
- Import output must become the same editable draft model that manual authoring uses.

Current repo does now:

- Import normalization can build canonical sections, stimuli, anchors, task groups, interactions, and teacher answer-derived scoring rules.
- Structured payloads can create canonical table, flowchart, and diagram contexts.
- Import does not yet create a first-class editor block document.

What changed in this phase:

- Audit recorded import as canonical-first today and proposed adapter boundary for Phase 4.

Simple recommendation:

- Keep current import normalization, but add editor-block hydration and round-trip tests before declaring import-to-editor complete.

Simple reason:

- Import can already produce useful canonical suggestions, but teachers need visible block repair/editing without rewriting marker text or reading diagnostics JSON.

## 4. Preview, Publish, Runtime, And Results

Old docs said:

- Preview, student-safe, session-safe, review, and analytics projections are generated outputs.
- Student surfaces must never read canonical drafts or authoring internals.
- Existing runtime/result shells stay owners.

Current repo does now:

- Projection service derives preview, student-safe, session-safe, review, and analytics payloads.
- Student-safe sanitizer rejects answer keys, scoring rules, diagnostics, import evidence, and other author-only tokens.
- Runtime/result paths consume projections and adapters, not editor internals.

What changed in this phase:

- Audit documented that these boundaries should stay intact during the editor rewrite.

Simple recommendation:

- Keep projections and runtime untouched until the adapter can regenerate canonical truth from editor blocks.

Simple reason:

- Fixing runtime by reading editor data would create leaks and split truth. Adapter errors must be fixed upstream in canonical generation.

## Approval Questions

1. Approve TipTap as the Reading V2 passage editor engine using existing dependencies?
2. Approve the new authoring model files: `src/types/readingV2Editor.types.ts` and `src/services/reading-v2/readingV2EditorDocument.service.ts`?
3. Approve canonical adapter boundary: Studio edits editor blocks, adapter regenerates canonical draft, projections/runtime/results read canonical/projections only?
4. Approve keeping writing-grading TipTap extensions out of Reading V2?

## Stop Rule

Do not start Phase 1 code rewrite until owner approves the architecture above or gives a corrected boundary.
