# Handoff - 0052/0054 Packet 1

## Packet Status

- Packet id: Packet 1 - PRD-0052 Schema And Composition Numbering Foundation
- Status: COMPLETE
- Date/time: 2026-06-09 18:16:00 +07:00
- Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `codex/prd0052-material-tabs-inline`
- Commit before packet: `d4738a4289921fefdb7edea665ac4e3592e1d9a0`
- Final `git status --short` summary:
  - Modified Reading V2 schema, composition, extraction, publish, homework launch, result/submit tests, rules, typed fixtures, and findings docs.
  - New `src/services/reading-v2/readingV2CompositionNumbering.service.ts`
  - New `src/services/reading-v2/readingV2CompositionNumbering.service.test.ts`
  - Existing Packet 0 docs remain untracked because they were already untracked at packet start.

## Source Docs Read

- `AGENTS.md`
- `documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md`
- `documentation/tasks/handoff-0052-0054-packet-0.md`
- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `DESIGN.md`
- `documentation/tasks/process-task-list.md`
- `documentation/rules/infrastructure.md`
- `documentation/rules/codebase-hygiene.md`
- `documentation/rules/student-data-loading.md`
- `documentation/architecture/reading-v2-material-publish-and-passage-library.md`
- `documentation/architecture/student-test-delivery-projections.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`

## Detailed Tasklist Phases Completed

- PRD-0052 Part 2 Phase 1:
  - Added ref-only master schema fields on `ReadingV2PassageRef`.
  - Added ref-only composition guard and tests rejecting embedded master payload fields.
  - Added rules deny-list for embedded master payload fields on `full_test_compositions` and `full_test_composition_versions`.
  - Added publish/extraction evidence that composition writes contain refs, metadata, and numbering only.
- PRD-0052 Part 2 Phase 1A:
  - Added shared numbering owner at `src/services/reading-v2/readingV2CompositionNumbering.service.ts`.
  - Wired shared numbering into composition creation and Reading Passage set runtime projection.
  - Added tests covering master publish, teacher composition assembly, runtime/assignment projection, trusted submission request path, result review frozen numbering, and PRD-0054 repair numbering semantics.

## Files Changed

- `database.rules.json`
- `src/types/readingV2.types.ts`
- `src/types/readingV2.types.test.ts`
- `src/services/reading-v2/readingV2CompositionNumbering.service.ts`
- `src/services/reading-v2/readingV2CompositionNumbering.service.test.ts`
- `src/services/reading-v2/readingV2FullTestComposition.service.ts`
- `src/services/reading-v2/readingV2FullTestComposition.service.test.ts`
- `src/services/reading-v2/readingV2PassageExtraction.service.ts`
- `src/services/reading-v2/readingV2PublishPipeline.service.ts`
- `src/services/reading-v2/readingV2PublishPipeline.service.test.ts`
- `src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts`
- `src/services/reading-v2/readingV2TeacherComposition.service.ts`
- `src/services/reading-v2/readingV2TeacherComposition.service.test.ts`
- `src/services/reading-v2/readingV2PassageHomeworkLaunch.service.ts`
- `src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts`
- `src/services/reading-v2/readingV2Projection.service.ts`
- `src/services/reading-v2/readingV2ResultAdapter.service.test.ts`
- `src/__tests__/readingV2PassageSetSubmitCore.test.ts`
- `src/__tests__/security/readingV2FirebaseRules.test.ts`
- `src/services/reading-v2/readingV2Backfill.service.test.ts`
- `src/services/reading-v2/readingV2BackfillCli.test.ts`
- `src/services/materialCatalog/materialCatalogRepair.service.test.ts`
- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/handoff-0052-0054-packet-1.md`

## Findings Files Updated

- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`

## Commands Run

RED then PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/services/reading-v2/readingV2CompositionNumbering.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts --reporter=basic
```

Initial red result: missing numbering owner, missing guard, missing runtime numbering metadata, missing schema ref fields, and missing RTDB rules deny-list.

Final result: PASS, 5 files, 35 tests passed, 5 skipped.

PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2CompositionNumbering.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts --reporter=basic
```

Result: 9 files, 73 tests passed, 5 skipped.

PASS:

```powershell
cmd /c npx vitest run src/__tests__/readingV2PassageSetSubmitCore.test.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts --reporter=basic
```

Result: 3 files, 30 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/types/readingV2.types.test.ts src/services/reading-v2/readingV2Backfill.service.test.ts src/services/reading-v2/readingV2BackfillCli.test.ts src/services/materialCatalog/materialCatalogRepair.service.test.ts --reporter=basic
```

Result: 4 files, 28 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2CompositionNumbering.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/__tests__/readingV2PassageSetSubmitCore.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/types/readingV2.types.test.ts src/services/reading-v2/readingV2Backfill.service.test.ts src/services/reading-v2/readingV2BackfillCli.test.ts src/services/materialCatalog/materialCatalogRepair.service.test.ts --reporter=basic
```

Result: PASS, 14 files, 103 tests passed, 5 skipped.

PASS:

```powershell
cmd /c npm run check:utf8 -- database.rules.json src/__tests__/readingV2PassageSetSubmitCore.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/services/materialCatalog/materialCatalogRepair.service.test.ts src/services/reading-v2/readingV2Backfill.service.test.ts src/services/reading-v2/readingV2BackfillCli.test.ts src/services/reading-v2/readingV2CompositionNumbering.service.ts src/services/reading-v2/readingV2CompositionNumbering.service.test.ts src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/services/reading-v2/readingV2FullTestComposition.service.ts src/services/reading-v2/readingV2PassageExtraction.service.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.ts src/services/reading-v2/readingV2Projection.service.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.ts src/types/readingV2.types.test.ts src/types/readingV2.types.ts documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/handoff-0052-0054-packet-1.md
```

Result: UTF-8 check passed for 24 text files.

PASS:

```powershell
git diff --check
```

Result: no whitespace errors.

## Browser Proof Artifacts

None. Packet 1 is service/schema/rules foundation only. No UI route, modal, or browser flow was changed.

## Decisions Made

- Shared composition numbering owner is `src/services/reading-v2/readingV2CompositionNumbering.service.ts`.
- Ref-only master deny-list applies to composition paths in source guard and RTDB rules.
- Trusted submit evidence is covered by root test wrapper `src/__tests__/readingV2PassageSetSubmitCore.test.ts`, not direct `functions/src` vitest, because root Vitest includes only `src/**/*`.
- PRD-0054 dependency remains `BLOCKED`; Packet 1 only changes schema/numbering evidence.

## Blockers / Risks / Deferred Residue

- `ReadingV2PublishedSnapshot` still carries `document` for canonical passage snapshots and legacy master snapshot flow. Packet 3 owns full composition-first publish core and any remaining master published-snapshot split.
- `ReadingV2MasterEditModal.tsx` is still absent. Packet 4 owns modal and published-master routing.
- Assignment payload path `reading_v2/projections/assignment_payloads/{homeworkId}:{compositionVersionId}` is still absent. Packet 5 owns assignment freeze storage and refresh-before-start UI.
- PRD-0054 archive/audit/duplicate/broken-reference services remain absent. Packet 2 and later own those.

## Next Packet

Run Packet 2 - PRD-0054 Audit And Duplicate Index Foundation.

## Copy-Paste Prompt For Next Codex App Conversation

```text
Implement Packet 2 from:

C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\documentation\tasks\tasks-0052-0054-master-implementation-orchestration.md

Worktree:

C:\Users\The Lord\Desktop\luyentap-writing-import-rebased

Objective:

Complete Packet 2 only: PRD-0054 Audit And Duplicate Index Foundation.

Start by reading:

- AGENTS.md
- documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md
- documentation/tasks/handoff-0052-0054-packet-1.md
- documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md
- documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md
- documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md
- documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md
- triggered rule docs only when required

Scope:

- Complete PRD-0054 Phase 1A and Phase 1B only.
- Implement Reading V2 audit writer/rules/tests at reading_v2/audit_events/{eventId}.
- Implement owner-scoped duplicate index/rules/tests at reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}.
- Do not implement archive UI, repair UI, or Packet 3 publish integration.
- Keep PRD-0054 master repair UI blocked unless later packets mark PRD-0052 dependency READY.

Before final response:

- Update documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md.
- Create/update documentation/tasks/handoff-0052-0054-packet-2.md.
- Run targeted tests required by Packet 2 and UTF-8/diff checks.
```
