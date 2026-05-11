# Reading V2 Task Type Display Implementation Tasklist

Source of truth: `documentation/samples/IELTS-reading-question-type-display-design.md`

Purpose: track implementation until Studio input, canonical projection, preview, runtime, and gates match the 16 IELTS Reading task-type display specs.

## Status Legend

- `[ ]` not started
- `[~]` in progress
- `[x]` done
- `[!]` blocked or failing gate

## Non-Negotiable Gates

- [x] Every task type renders from structured Reading V2 data, not flattened prompt guessing.
- [~] Studio input for every task type is efficient and maps logically to runtime display.
- [x] Preview uses same runtime renderer contract as student delivery.
- [x] Runtime display matches `IELTS-reading-question-type-display-design.md` structural forms.
- [ ] Publish blocks incomplete structural data.
- [x] Clippings E2E fixtures cover all 16 task types.
- [x] DOM gates prove structural forms, not only screenshots.
- [x] Screenshot gates prove desktop preview shape.
- [x] Screenshot gates prove phone preview question-sheet shape.
- [x] No console errors or page errors during task-type E2E.

## Phase 1: Contract And Baseline

- [x] Create this tasklist memory base.
- [~] Convert design doc into per-task acceptance matrix.
- [x] Attach current Clippings E2E report and preview screenshot evidence.
- [~] Mark each task type as pass/fail against display spec.

## Phase 2: Runtime Renderer Registry

- [x] Audit current `ReadingV2RuntimeShell` render path.
- [x] Add explicit renderer contract for each task family.
- [x] Block generic fallback for structural task types.
- [x] Preserve answer state and submit payload.

## Phase 3: Completion Family

- [x] Sentence Completion: inline sentence blanks with word-limit helper.
- [x] Summary Completion Text: one summary paragraph/card with inline inputs.
- [x] Summary Completion List: one summary paragraph/card with inline dropdowns plus visible option bank.
- [x] Note Completion: structured title, bullets, indentation, inline inputs.
- [x] Table Completion: real table with headers, rows, blank cells, responsive overflow.
- [x] Flowchart Completion: boxes, arrows, step order, inline/focused inputs.
- [x] Diagram Labelling: image region, label targets/hotspots, linked inputs.

## Phase 4: Judgement Family

- [x] True / False / Not Given: statement rows with three clear choices.
- [x] Yes / No / Not Given: statement rows with correct opinion vocabulary.

## Phase 5: Matching Family

- [x] Matching Headings: visible heading list plus paragraph/section dropdowns.
- [x] Matching Information: statement rows plus paragraph dropdowns; allow reuse.
- [x] Matching Features: feature bank plus statement rows; allow reuse where configured.
- [x] Matching Sentence Endings: sentence beginnings plus ending bank; no-reuse support.

## Phase 6: Choice And Short Answer

- [x] Multiple Choice: radio option cards, selected state, full option text.
- [x] Multiple Selection: checkbox option cards, dynamic required count, selected counter.
- [x] Short Answer: direct question rows, wide input, word-limit helper.

## Phase 7: Studio And Projection Support

- [~] Ensure Studio structured inputs create all required canonical fields.
- [~] Ensure projection preserves all display-critical structure.
- [ ] Ensure validation messages name missing structure clearly.

## Phase 8: Gate Checks

- [x] Add unit DOM assertions for every renderer.
- [~] Add projection shape assertions for structural task types.
- [x] Add E2E Clippings gate for all 16 task types.
- [x] Add screenshot evidence capture for preview/runtime.
- [x] Add mobile width smoke gate for dense renderers.
- [x] Run targeted Vitest gates.
- [x] Run Playwright Clippings gate.
- [x] Run UTF-8 check on touched text files.

## Current Findings

- [x] E2E Studio authoring flow can create, save, validate, preview, and smoke-publish all 16 task types from Clippings.
- [x] Preview/runtime no longer collapses structural tasks into generic per-question cards for completion and matching families.
- [x] Matching Heading/Information placeholder publish bug was found during E2E and patched in `ReadingV2BuildWorkspace.tsx`.
- [x] Summary editor contentEditable bug was replaced with textarea-based body input plus explicit blank parsing.
- [x] Latest Clippings E2E gate: `output/playwright/reading-v2-all-task-types-live/report.json` reports 16 passed, 0 failed, 0 warnings, 0 console/page errors.
- [x] Improved design mockups generated in `documentation/tasks/PRD0048/design/reading-v2-task-type-ui-mockups.html`.
- [x] Separate UI component spec generated in `documentation/tasks/PRD0048/design/reading-v2-task-type-ui-components.md`.
- [x] Production task-type UI primitives extracted to `src/components/reading-v2/runtime/task-type-components/ReadingV2TaskTypeComponents.tsx`.
- [x] Runtime shell now uses task frames, human-readable task labels, progress pills, question badges, reference banks, and choice rows.
- [x] Latest broad Vitest gate: 9 files, 99 tests passed.
- [x] Latest Studio preview smoke gate: desktop 1366x900, tablet 1024x768, and phone 390x844 passed.
- [x] Latest phone preview gate opens question sheet, checks no horizontal overflow, captures `output/playwright/reading-v2-studio-preview-phone-questions.png`, closes sheet, then closes preview.
- [x] Latest all-task interaction gate: `output/playwright/task-type-gates/all-task-types-foundation-interaction-gate.json` reports 16 passed, 0 failed, `allPassed: true`, 0 relevant console entries.
- [x] Diff comment fixes: passage toolbar actions preserve textarea selection/caret; table Insert blank uses active cell caret instead of always appending.
- [x] Diff comment fixes: runtime question group no longer shows task type label, per-card progress pill, or outer card border.
- [x] Diff comment fixes: IELTS word-limit controls are dropdowns limited to 1, 2, or 3; projected word limits feed runtime instruction text.
- [~] Remaining hardening: projection shape assertions and missing-structure validation messages.
