# Handoff - 0052/0054 Packet 3

## Packet Status

- Packet id: Packet 3 - PRD-0052 Composition-First Publish Core
- Status: COMPLETE
- Date/time: 2026-06-10 08:03:31 +07:00
- Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `codex/prd0052-material-tabs-inline`
- HEAD: `d4738a4289921fefdb7edea665ac4e3592e1d9a0`
- Final `git status --short --branch` summary:
  - Packet 3 modified: `src/services/reading-v2/readingV2PublishPipeline.service.ts`, `src/services/reading-v2/readingV2PublishPipeline.service.test.ts`, `src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts`, `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`, `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`, and `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`.
  - Packet 3 added: this handoff file.
  - Packet 1 and Packet 2 modified/untracked files remain present in the same worktree and were not reverted.

## Source Docs Read

- `AGENTS.md`
- `documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md`
- `documentation/tasks/handoff-0052-0054-packet-2.md`
- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/process-task-list.md`
- `documentation/rules/infrastructure.md`
- `documentation/rules/codebase-hygiene.md`
- `documentation/architecture/reading-v2-material-publish-and-passage-library.md`
- `documentation/architecture/student-test-delivery-projections.md`

## Detailed Tasklist Phases Completed

- PRD-0052 Part 2 Phase 2A:
  - Full-test publish now creates standalone generated Reading Passage materials, versions, published snapshots, student-safe projections, review projections, material metadata, Material Catalog index rows, duplicate-index rows, and ref-only master composition/version writes.
  - Extracted full-test publishes no longer stage the master embedded `published_snapshots/{masterMaterialId}/{snapshotVersionId}` or master student/review projections.
  - Master composition writes are ref-only and guarded by `assertReadingV2RefOnlyFullTestComposition()`.
  - Same-source generated passage identities remain deterministic and idempotent.
- PRD-0052 Part 2 Phase 2B:
  - Auto-split publish consumes PRD-0054 duplicate guard/index service.
  - Duplicate warnings include active and teacher-owned archived matches, are warning-only, and expose `use-existing`, `restore-and-use`, and `create-new-anyway` actions.
  - Missing or stale duplicate index status blocks publish instead of broad canonical scan fallback.

## Files Changed

- `src/services/reading-v2/readingV2PublishPipeline.service.ts`
- `src/services/reading-v2/readingV2PublishPipeline.service.test.ts`
- `src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts`
- `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/handoff-0052-0054-packet-3.md`

## Findings Files Updated

- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`

## Commands Run

RED then PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2PassageDuplicateGuard.service.test.ts --reporter=basic
```

Initial red result: duplicate-warning fixture text did not match extracted candidate shingle source, so no warning was produced.

Final result: PASS, 3 files, 27 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2CompositionNumbering.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts --reporter=basic
```

Result: 6 files passed, 38 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2PassageDuplicateGuard.service.test.ts --reporter=basic
```

Result: 2 files passed, 21 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/__tests__/security/readingV2FirebaseRules.test.ts --reporter=basic
```

Result: 1 file passed, 12 tests passed, 7 skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set.

PASS:

```powershell
cmd /c npm run check:utf8 -- src/services/reading-v2/readingV2PublishPipeline.service.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/handoff-0052-0054-packet-3.md
```

Result: UTF-8 check passed for 7 text files.

PASS:

```powershell
git diff --check
```

Result: no whitespace errors.

## Browser Proof Artifacts

None. Packet 3 changed service/storage behavior and docs only. No UI route, modal, or browser flow was changed.

## Decisions Made

- Composition-first extracted full-test publish no longer writes a master canonical snapshot/projection with embedded full-test `document`.
- Generated Reading Passage snapshots/projections remain the standalone runtime/review content owners.
- Duplicate index integration stays warning-only unless `duplicateIndexStatus` is explicitly `missing` or `stale`; those states block because fallback broad scans are forbidden.
- Duplicate index rows are generated from extracted candidate body/question safe text and stored as hashes only.

## Blockers / Risks / Deferred Residue

- PRD-0054 master repair remains `BLOCKED` until PRD-0052 later phases add `ReadingV2MasterEditModal` and Phase 8 marks dependency `READY`.
- Packet 4 still owns published master modal UI and draft creation from existing passages.
- Packet 5 still owns assignment freeze/refresh, runtime, result, and `Update references?`.
- Packet 6+ still own archive/restore/broken-ref lifecycle and repair UI.
- Firebase emulator behavior tests remained skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set.

## Next Packet

Run Packet 4 - PRD-0052 Published Master Modal And Draft Creation.

## Copy-Paste Prompt For Next Codex App Conversation

```text
Implement Packet 4 from:

C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\documentation\tasks\tasks-0052-0054-master-implementation-orchestration.md

Worktree:

C:\Users\The Lord\Desktop\luyentap-writing-import-rebased

Objective:

Complete Packet 4 only: PRD-0052 Published Master Modal And Draft Creation.

Start by reading:

- AGENTS.md
- documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md
- documentation/tasks/handoff-0052-0054-packet-3.md
- documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md
- documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md
- documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md
- documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md
- triggered rule docs only when required

Scope:

- Complete PRD-0052 Part 2 Phase 3 and Phase 4 only.
- Implement `ReadingV2MasterEditModal`.
- Implement published and draft modal modes.
- Route Teacher Lobby published master `Edit Test` into the modal.
- Keep draft/unpublished full-test creation out of published full-test Studio.
- Implement create full test from existing published, unarchived Reading Passages.
- Add modal, picker, Teacher Lobby, and Test Creation Modal tests.
- Do not implement assignment freeze UI, update references modal, archive UI, repair UI, or later packets.

Before final response:

- Update documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md.
- Update documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md if PRD-0054 dependency status changes.
- Create/update documentation/tasks/handoff-0052-0054-packet-4.md.
- Run targeted tests required by Packet 4 and UTF-8/diff checks.
```

## Sensitive Data Handling

- No secrets or credentials were copied into this handoff.
