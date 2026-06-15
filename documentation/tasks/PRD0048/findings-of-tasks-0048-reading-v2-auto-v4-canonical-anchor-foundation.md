# Findings: Reading V2 Auto V4 Canonical Anchor Foundation

## 2026-06-06 Implementation Findings

- Phase 0-2: Added duplicate structured-layout fixtures for table, flowchart, and diagram imports. The local normalizer now uses `registerStructuredLayoutAnchor(...)` as the authority for table/flowchart/diagram anchor cardinality. Duplicate question numbers inside one source position de-dupe; duplicate question numbers across distinct source positions return `duplicate-structured-layout-question` with passage, instruction, layout kind, question number, and source-position metadata.
- Phase 3: Studio import candidate creation now fails closed before repository draft persistence. Invalid Auto candidates render a safe alert state with "Auto import needs review before Studio can open" instead of crashing through React render.
- Phase 4: Duplicate `stimulus.anchorIds` scanning is shared between contract guards and non-throwing draft validation. Editor document validation now catches duplicate anchors across structured cells, text, flowchart, diagram, and task group refs.
- Phase 5: Frontend and trusted worker review excerpt builders now respect `cell.anchorIds`, not only `cell.anchorId`. Runtime table highlighting already checks `cell.anchorIds` when matching the active anchor.
- Phase 6: Publish/materialization tests now prove invalid canonical input creates no PRD0052 writes and valid multi-anchor table full-test publish creates standalone Reading Passage material/projections.
- Phase 7: Reading Passage homework launch and trusted worker review composition now use explicit content-kind anchor remappers. Unrelated nested fields named `anchorId` or `anchorIds` are not recursively rewritten.
- Phase 8: Backfill dry-run now attaches canonical safety classification: `valid`, `auto-repairable`, `manual-review-required`, or `unsafe-to-write`. It reports duplicate stimulus registries, missing anchors, duplicate visible numbers, and stored projection mismatches. Only deterministic repeated registry entries are repaired for extraction; invalid/unsafe sources produce no derived passage writes.
- Phase 9: Added canonical anchor observability events and privacy-safe payloads for Auto import, Studio rejection, publish validation, passage extraction block, and backfill block. Payloads use stable IDs and slugs, not raw source, prompt text, answer-key body, or student data.

## Verification Evidence

- Red tests were observed for Phase 8 backfill safety and Phase 9 observability before implementation.
- Focused passing checks during implementation:
  - `cmd /c npx vitest run src/services/reading-v2/readingV2Backfill.service.test.ts src/services/reading-v2/readingV2BackfillCli.test.ts --reporter=basic` -> 16 tests passed.
  - `cmd /c npx vitest run src/config/readingV2Observability.test.ts --reporter=basic` -> 5 tests passed.
  - `cmd /c npx vitest run src/services/reading-v2/readingV2AutoImport.service.test.ts -t "blocks Auto V4 before Studio handoff" --reporter=basic` -> 1 targeted test passed.
  - `cmd /c npx vitest run src/pages/ReadingV2StudioPage.test.tsx -t "safe Auto import rejection" --reporter=basic` -> 1 targeted test passed.
  - `cmd /c npx vitest run src/services/reading-v2/readingV2PublishPipeline.service.test.ts --reporter=basic` -> 11 tests passed.
- Final focused regression checks:
  - `cmd /c npx vitest run src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/services/reading-v2/readingV2AutoImport.service.test.ts src/services/reading-v2/readingV2AutoImportPrompt.test.ts src/services/reading-v2/readingV2ContractGuards.service.test.ts --reporter=basic` -> 125 tests passed.
  - `cmd /c npx vitest run src/services/reading-v2/readingV2Validation.service.test.ts src/services/reading-v2/readingV2EditorDocument.service.test.ts src/services/reading-v2/readingV2StudioWorkflow.service.test.ts src/pages/ReadingV2StudioPage.test.tsx --reporter=basic` -> 61 tests passed.
  - `cmd /c npx vitest run src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/services/reading-v2/readingV2Backfill.service.test.ts src/services/reading-v2/readingV2BackfillCli.test.ts src/config/readingV2Observability.test.ts --reporter=basic` -> 59 tests passed.
  - `cmd /c npx vitest run src/readingV2SubmitCore.test.ts --root functions --environment jsdom --reporter=basic` -> 6 tests passed.
  - `cmd /c npx vitest run src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/services/reading-v2/readingV2PassageExtraction.service.test.ts --reporter=basic` -> 14 tests passed.
  - Re-ran final touched suites after type fixes: import normalization, auto import, backfill, passage homework launch, Studio page, and publish pipeline -> 140 tests passed.
  - `cmd /c npm run check:utf8 -- <touched PRD0048 files>` -> UTF-8 passed.
  - `git diff --check -- <touched PRD0048 files>` -> passed.
- TypeScript note: filtered `npx tsc -p tsconfig.json --noEmit --pretty false` still reports existing baseline errors in `ReadingV2StudioPage.tsx` and `readingV2AutoImport.service.ts`; new backfill/remap type errors found during this run were fixed.

## Remaining Gap

- Phase 10 browser/live E2E remains open. It requires dev quick-login/browser validation of failing Auto V4 import, valid Studio import, publish, assignment launch, submit, and review.
