# Task List: Reading V2 Auto V4 Canonical Anchor Foundation

Created: 2026-06-06

Scope: Reading V2 Auto V4 import, Studio draft handoff, canonical anchor validation, PRD0052 publish/materialization, Reading Passage homework launch, and backfill safety.

Canonical contract: `documentation/architecture/reading-v2-auto-v4-provider-review-contract.md`

Interpretation rule: this tasklist protects canonical integrity. It must not be read as permission to block Studio for every bad parse. "Blocking" means malformed canonical hydration, Ready, Accept into Draft, publish, extraction, launch, or backfill is blocked. Studio should still open an `editable-needs-review` draft when a canonical-safe degraded candidate can be built.

## Problem

Auto V4 can parse a Reading test successfully, then crash Reading V2 Studio during draft creation:

```text
Error: Stimulus cambridge-ielts-10-test-1-reading-table-1-3 references duplicate anchors.
```

The immediate failure is not Gemini parsing. It is local canonical document construction. `assertValidReadingV2CanonicalDocument()` correctly rejects a stimulus whose `stimulus.anchorIds` array contains repeated anchor ids. The current Auto V4 structured-layout normalizer can create that invalid canonical shape before the teacher reaches Studio.

## Current Evidence

- Console shows `parsePassagesOnly` succeeds, `parseQuestionsAndAnswers` succeeds after one blocked key, guardrail result succeeds, then `ReadingV2StudioPage` crashes.
- Stack path:
  - `ReadingV2StudioPage.tsx`
  - `resolveReadingV2StudioWorkflowContext()`
  - `createDraftContext()`
  - `readingV2Repository.createDraft()`
  - `assertValidReadingV2CanonicalDocument()`
- Contract guard throws at `readingV2ContractGuards.service.ts` when `new Set(stimulus.anchorIds).size !== stimulus.anchorIds.length`.
- Import normalizer risk points:
  - `createStructuredTableContext()` pushes generated `anchorId` into `anchorIds` for every cell question number.
  - `createStructuredFlowchartContext()` pushes generated `anchorId` into `anchorIds` for every step question number.
  - `createStructuredDiagramContext()` pushes generated `anchorId` into `anchorIds` for every target question number.
- These paths de-dupe question numbers inside one cell/step/target, but do not reject or repair the same question number appearing in multiple cells/steps/targets.
- PRD0052 adds downstream remap/materialization surfaces where anchor integrity must remain true after full-test-to-passage composition, standalone Reading Passage extraction, Reading Passage set launch, and backfill.

## Root Cause To Prove

The foundational bug is an anchor identity/cardinality bug:

- one visible question number should map to one canonical interaction;
- one canonical interaction should have one primary structured-layout anchor;
- one structured blank/hotspot should not duplicate another blank/hotspot for the same visible question unless the system intentionally models a multi-location answer, which Reading V2 currently does not;
- `stimulus.anchorIds` is a unique registry, not an event log.

The fix must decide and enforce this model before any publisher, projection, homework launcher, or backfill writes derived material.

## Non-Goals

- Do not weaken `assertValidReadingV2CanonicalDocument()`.
- Do not bypass Studio after Auto V4 import.
- Do not make Auto V4 publish material directly.
- Do not silently split one visible question into multiple canonical answers.
- Do not change Book editor behavior except where it references or launches Reading V2 material.

## Related Architecture And Task Sources

- `documentation/architecture/reading-v2-auto-v4-provider-review-contract.md`
- `documentation/architecture/reading-v2-material-publish-and-passage-library.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v4-source-authoritative-group-repair.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v4-field-fidelity-foundation.md`
- `documentation/tasks/PRD0052/tasks-0052-prd-teacher-materials-books-and-reading-passage-library-gap-closure.md`
- `documentation/tasks/PRD0052/prd0052-independent-implementation-review-2026-06-02.md`

## Phase 0 - Repro And Evidence Lock

- [x] Add a small synthetic failing fixture for duplicate structured table question numbers.
  - Use a table-completion group where two different cells both declare question `9`.
  - Expected result before the fix: canonical guard throws duplicate anchors.
  - Expected result after the fix: importer returns a structured repair issue or rejects the candidate before Studio navigation.
- [x] Add equivalent synthetic fixtures for duplicate flowchart step question numbers and duplicate diagram target question numbers.
- [x] Add a fixture that preserves valid multi-anchor-in-one-cell behavior.
  - Example: one table cell intentionally contains two blanks, `questionNumbers: [2, 3]`.
  - This must still pass canonical guard.
- [x] Add a targeted regression for the observed source pattern.
  - Source label: `cambridge-ielts-10-test-1-reading-table-1-3`.
  - Expected diagnostic must identify passage, instruction range, layout kind, and duplicate question number.
- [x] Confirm tests fail for the right reason before implementation.

Recommended commands:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2ImportNormalization.service.test.ts --reporter=basic
cmd /c npx vitest run src/services/reading-v2/readingV2AutoImport.service.test.ts --reporter=basic
```

## Phase 1 - Define The Structured Anchor Invariant

- [x] Add a documented helper near the Reading V2 import normalizer or a small shared anchor utility:
  - `registerStructuredLayoutAnchor(...)`
  - input: layout kind, passage number, instruction index, question number, source location.
  - output: anchor id, plus duplicate detection result.
- [x] Enforce these rules:
  - duplicate question number inside the same cell/step/target is de-duped;
  - duplicate question number across different cells/steps/targets in the same structured stimulus is invalid unless an explicit future feature flag says otherwise;
  - fallback assignment must never reuse a question number already assigned explicitly;
  - `stimulus.anchorIds` must be built from a unique ordered registry.
- [x] Prefer a canonical-safe review draft over silent repair when the same question appears in two layout positions.
  - Reason: silent de-dupe may hide a parser hallucination or source-layout ambiguity.
  - Teacher-facing behavior should ask for review/repair in Studio when a safe degraded draft exists.
  - Fail closed before Studio only when no canonical-safe degraded draft can be built.
- [x] Keep valid multi-blank single-cell behavior.
  - One cell with two distinct question numbers should produce two distinct anchors.
  - One question number repeated twice in the same cell should collapse to one anchor and one blank unless source evidence proves two independent blanks.

## Phase 2 - Harden Auto V4 Normalization

- [x] Update `createStructuredTableContext()` so anchor registration cannot push duplicate ids into `anchorIds`.
- [x] Update `createStructuredFlowchartContext()` with the same invariant.
- [x] Update `createStructuredDiagramContext()` with the same invariant.
- [x] Return structured import issues when duplicates are detected:
  - code: `duplicate-structured-layout-question`
  - layout kind: `table`, `flowchart`, or `diagram`
  - passage number
  - instruction index
  - question number
  - source positions: row/column, step id/index, or target id/index
- [x] Ensure the Auto V4 final result treats these issues as blocking before malformed Studio handoff.
  - Publish, Ready, and unsafe canonical hydration remain blocked.
  - Studio handoff should continue when the importer can produce a canonical-safe degraded group with visible review diagnostics.
- [x] Add parser/provider prompt guidance only after local validation exists.
  - Prompt should ask the model not to assign the same question number to multiple layout cells.
  - Local validation remains the authority.

## Phase 3 - Stop Studio From Crashing On Bad Import Candidates

- [x] Wrap initial Auto V4 candidate draft creation in an explicit guard path.
  - `resolveReadingV2StudioWorkflowContext()` or `createDraftContext()` should not let canonical guard exceptions crash React render.
  - Convert canonical failures into a typed workflow error.
- [x] Show a Studio-safe import failure state only for candidates that cannot be degraded safely.
  - Teacher sees: "Auto import needs review before Studio can open."
  - Include duplicate anchor source metadata when available.
  - Do not show raw prompt text or large source payloads.
- [x] Keep repository guard strict.
  - `readingV2Repository.createDraft()` should continue rejecting invalid canonical documents.
  - The caller must catch and route the failure before React render.
- [x] Add a regression test for `ReadingV2StudioPage` or workflow service:
  - invalid import candidate does not throw during `useMemo`;
  - error boundary is not the primary UX;
  - no draft is persisted.

## Phase 4 - Unify Canonical And Editor Validation

- [x] Add duplicate stimulus-anchor detection to non-throwing validation output.
  - Current contract guard throws; validation should also report a blocking issue for publish/preview surfaces.
- [x] Reuse one helper for duplicate anchor scanning across:
  - contract guard,
  - draft validation,
  - editor document validation,
  - publish validation.
- [x] Verify editor validation still catches duplicate anchors inside table cells, flowchart steps, diagram hotspots, text blocks, and task group refs.
- [x] Add tests in:
  - `readingV2ContractGuards.service.test.ts`
  - `readingV2Validation.service.test.ts`
  - `readingV2EditorDocument.service.test.ts`

## Phase 5 - Multi-Anchor Review And Runtime Correctness

- [x] Audit review excerpt builders for table cells with `cell.anchorIds`.
  - `src/services/reading-v2/readingV2ResultAdapter.service.ts`
  - `functions/src/readingV2SubmitCore.ts`
- [x] Ensure `stimulusExcerpt()` includes all anchors from `cell.anchorIds`, not only `cell.anchorId`.
- [x] Add tests where one table cell contains two valid anchors and the review projection includes both excerpts.
- [x] Verify runtime highlighting already handles `cell.anchorIds`; add regression only if current tests do not cover it.
- [x] Confirm trusted submission worker and frontend adapter stay behaviorally aligned.

## Phase 6 - PRD0052 Publish And Materialization Gates

- [x] Before full-test publish writes anything, assert the canonical document and validation output are clean.
- [x] Before Reading Passage extraction writes standalone passage materials, assert:
  - source full-test canonical is valid;
  - extracted passage canonical is valid;
  - extracted passage projection has no duplicate anchors;
  - passage interactions reference only anchors present in the passage.
- [x] Before writing Material Catalog rows or relationship indexes, verify the material snapshot exists and passed validation.
- [x] Ensure failed validation produces no partial PRD0052 writes.
  - No `material_metadata`.
  - No `published_snapshots`.
  - No `full_test_compositions`.
  - No `material_indexes`.
  - No passage relationship index rows.
- [x] Add unit tests around write-plan generation so invalid canonical input produces an empty write plan plus a blocking issue.
- [x] Add an integration-style test for a full-test publish that generates standalone Reading Passage materials from a valid multi-anchor table.

## Phase 7 - PRD0052 Anchor Remap Audit

- [x] Replace broad recursive anchor remapping in `readingV2PassageHomeworkLaunch.service.ts`.
  - Current `prefixAnchorContent()` rewrites any nested key named `anchorId` or `anchorIds`.
  - This can corrupt unrelated content fields if future stimulus data contains those names for non-canonical purposes.
- [x] Use explicit content-kind remappers like `readingV2TeacherComposition.service.ts`:
  - `passage-content`
  - `table-content`
  - `flowchart-content`
  - `diagram-content`
  - media/plain fallback without recursive anchor rewriting
- [x] Add tests proving:
  - table cell `anchorId` and `anchorIds` are prefixed;
  - flowchart step `anchorId` is prefixed;
  - diagram hotspot `anchorId` is prefixed;
  - unrelated nested fields named `anchorId` or `anchorIds` are not rewritten;
  - no duplicate prefixed anchor ids are generated.
- [x] Audit composition prefixing in `readingV2TeacherComposition.service.ts` for the same invariant.
- [x] Audit `functions/src/readingV2SubmitCore.ts` prefix behavior separately because Worker code can diverge from frontend services.

## Phase 8 - Backfill And Existing Data Safety

- [x] Add or update a dry-run scanner for existing Reading V2 materials.
  - Scan `reading_v2/material_metadata`.
  - Scan `reading_v2/published_snapshots`.
  - Scan `reading_v2/full_test_compositions`.
  - Report duplicate `stimulus.anchorIds`, missing anchors, duplicate visible numbers, and projection anchor mismatches.
- [x] Backfill must classify records:
  - `valid`
  - `auto-repairable`
  - `manual-review-required`
  - `unsafe-to-write`
- [x] Only auto-repair deterministic duplicates.
  - Same anchor id repeated in one registry with one real anchor object can be de-duped if all references remain valid.
  - Same visible question mapped to two different structured positions is manual review.
- [x] Add resume capability to PRD0052 backfill if it writes production data.
  - Store processed material ids or use chunked id ranges.
  - Avoid loading entire namespaces when production data can grow.
- [x] Backfill must never write derived Reading Passage material from an invalid full-test source.

## Phase 9 - Diagnostics And Observability

- [x] Add diagnostic events:
  - `canonical_anchor_guard_failed`
  - `duplicate_structured_layout_question`
  - `structured_layout_anchor_cardinality_mismatch`
  - `studio_import_candidate_rejected`
  - `publish_canonical_validation_blocked`
  - `passage_extraction_canonical_validation_blocked`
  - `backfill_canonical_validation_blocked`
- [x] Include stable identifiers:
  - import attempt id,
  - source title slug,
  - passage number,
  - instruction index,
  - layout kind,
  - question number,
  - stimulus id.
- [x] Exclude raw source body, prompt text, answer key body, and student data from telemetry.
- [x] Surface a concise teacher-facing message in Auto V4 modal and Studio failure state.
- [x] Keep developer diagnostics detailed enough to identify the layout source without opening raw Gemini output.

## Phase 10 - Browser And End-To-End Verification

- [ ] Use dev quick-login Teacher path for browser verification.
- [ ] Re-run the failing import flow with the same source material.
- [ ] Verify the UI no longer crashes into `ErrorBoundary`.
- [ ] Verify duplicate structured-layout question source shows a repair message and blocks publish.
- [ ] Verify duplicate structured-layout question source opens Studio as `editable-needs-review` when a canonical-safe degraded group can be built.
- [ ] Verify a valid Cambridge/IELTS source with table completion opens Studio and preserves table blanks.
- [ ] Publish a valid full Reading V2 test.
- [ ] Confirm PRD0052 outputs:
  - full-test material metadata,
  - standalone Reading Passage material metadata,
  - full-test composition,
  - student-safe projection,
  - review projection,
  - material indexes.
- [ ] Assign a Reading Passage set and launch as Student.
- [ ] Submit and review result with a valid multi-anchor table cell.

## Verification Commands

Run targeted tests first:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2ImportNormalization.service.test.ts --reporter=basic
cmd /c npx vitest run src/services/reading-v2/readingV2AutoImport.service.test.ts --reporter=basic
cmd /c npx vitest run src/services/reading-v2/readingV2ContractGuards.service.test.ts --reporter=basic
cmd /c npx vitest run src/services/reading-v2/readingV2Validation.service.test.ts --reporter=basic
cmd /c npx vitest run src/services/reading-v2/readingV2EditorDocument.service.test.ts --reporter=basic
cmd /c npx vitest run src/services/reading-v2/readingV2ResultAdapter.service.test.ts --reporter=basic
cmd /c npx vitest run functions/src/readingV2SubmitCore.test.ts --reporter=basic
```

Run PRD0052 publish/materialization tests after anchor fixes:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2TeacherComposition.service.test.ts --reporter=basic
cmd /c npx vitest run src/services/reading-v2/readingV2PassageExtraction.service.test.ts --reporter=basic
cmd /c npx vitest run src/services/reading-v2/readingV2PublishPipeline.service.test.ts --reporter=basic
cmd /c npx vitest run src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts --reporter=basic
```

Run repository hygiene:

```powershell
cmd /c npm run check:utf8 -- documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v4-canonical-anchor-foundation.md
git diff --check -- documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v4-canonical-anchor-foundation.md
```

## Acceptance Criteria

- [x] Auto V4 cannot navigate a malformed canonical candidate into Studio.
- [ ] Auto V4 can navigate a canonical-safe degraded candidate into Studio as `editable-needs-review`.
- [x] Studio does not crash on invalid import candidates.
- [x] Duplicate structured-layout question numbers produce a source-located diagnostic that blocks publish/unsafe hydration.
- [x] Valid multi-anchor single-cell table completion still works.
- [x] `assertValidReadingV2CanonicalDocument()` remains strict.
- [x] Non-throwing validation reports duplicate anchors before publish.
- [x] Review/result excerpts handle `cell.anchorIds`.
- [x] PRD0052 publish and passage extraction cannot write partial material for invalid canonical input.
- [x] Reading Passage homework launch uses explicit anchor remapping, not broad recursive key rewriting.
- [x] Backfill dry-run can identify unsafe records before writes.
- [ ] Browser verification covers failing Auto V4 import, valid Studio import, publish, assignment launch, submit, and review.

## Stop Conditions

- Stop and reassess if a proposed fix requires weakening the canonical guard.
- Stop and reassess if a duplicate question appears to be valid source behavior for a task type not represented by current Reading V2 models.
- Stop and reassess if PRD0052 write-plan tests show partial writes can still happen after validation failure.
- Stop and reassess before changing Book editor data contracts; Book should reference Reading V2 materials, not rewrite their canonical anchors.
