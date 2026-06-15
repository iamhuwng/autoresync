# Handoff - 0052/0054 Packet 0

## Packet Status

- Packet id: Packet 0 - Baseline And Dependency Map
- Status: COMPLETE
- Date/time: 2026-06-09 17:50:38 +07:00
- Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `codex/prd0052-material-tabs-inline`
- Commit: `d4738a4289921fefdb7edea665ac4e3592e1d9a0`
- Initial `git status --short`: clean output
- Final `git status --short`:
  - `?? documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
  - `?? documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
  - `?? documentation/tasks/handoff-0052-0054-packet-0.md`

## Source Docs Read

- `AGENTS.md`
- `documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md`
- `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/architecture/reading-v2-material-publish-and-passage-library.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`
- `documentation/architecture/reading-v2-audit-trail.md`

All source PRD/tasklist/architecture docs listed above are tracked.

## Detailed Tasklist Phases Completed

- PRD-0052 Part 2 Phase 0:
  - Created findings file.
  - Recorded PRD/tasklist tracked status.
  - Recorded baseline git state.
  - Ran required `rg` searches.
  - Confirmed current tests/source cover Part 1 seams but not Part 2 ref-only master acceptance.
  - Confirmed existing-passage full-test flow publishes immediately and routes to Studio.
  - Confirmed current publish still embeds `document` in `ReadingV2PublishedSnapshot`.
  - Recorded current owners and missing owners.
- PRD-0054 Phase 0:
  - Created findings file.
  - Recorded PRD-0052 Part 2 tasklist still pending.
  - Marked PRD-0054 master repair UI blocked because `ReadingV2MasterEditModal.tsx` is absent.
  - Ran required `rg` searches.
  - Inspected current archive behavior, Book unavailable-reference behavior, rules, audit/duplicate gaps, and owner map.
  - Recorded blocked PRD-0052-dependent work.

## Files Changed

- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/handoff-0052-0054-packet-0.md`

No application/source code changed.

## Findings Files Updated

- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`

Both were absent before Packet 0 and created during this packet.

## Commands Run

PASS:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
```

PASS:

```powershell
git ls-files -- documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/handoff-0052-0054-packet-0.md
```

PASS:

```powershell
rg "full_test_compositions|composition|reading-passage-set|reading_passage_materials|published_snapshots|student_safe_tests|session_test_payloads|review" src functions database.rules.json firestore.rules
```

PASS:

```powershell
rg "@mantine|useNavigate|window.open|location.href|navigate\(" src/components/test-creation src/pages/TeacherLobbyPage.jsx src/components/reading-v2
```

PASS:

```powershell
rg "archiveReadingV2PassageMaterial|archived|restore|broken|unavailable|delete|remove from library|where-used|duplicate|similarity" src documentation database.rules.json firestore.rules
```

PASS:

```powershell
rg "material_catalog|reading_passage_materials|full_test_compositions|Book|book_nodes|published_snapshots|material_indexes" src database.rules.json
```

PASS:

```powershell
rg -n "restoreReadingV2|listArchivedReadingV2|archiveReadingV2|readingV2Audit|audit_events|duplicate_indexes|PassageDuplicate|BrokenReference|MasterEditModal|UpdateReferences|CompositionNumbering|assignment_payloads|RepairPanel" src functions database.rules.json firestore.rules documentation/tasks
```

PASS:

```powershell
rg -n "export interface EditTestFrameProps|children|document|sections|taskGroups|answerKey|payload|tabs|onSave|activeTab" src/components/test/editor/EditTestFrame.tsx src/components/TestEditor.tsx src/components/test/editor/layouts/BaseEditorLayout.tsx
```

PASS:

```powershell
rg -n "createReadingV2TeacherSelectedPassageComposition|publishReadingV2Material|navigateTo\(|TEACHER_READING_V2_REVISE|document:|ReadingV2PublishedSnapshot|assignment_payloads|ReadingV2MasterEditModal" src/services/reading-v2/readingV2TeacherComposition.service.ts src/services/reading-v2/readingV2PublishPipeline.service.ts src/types/readingV2.types.ts src/pages/TeacherLobbyPage.jsx src/services/reading-v2/readingV2StoragePaths.service.ts
```

PASS:

```powershell
cmd /c npm run check:utf8 -- documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/handoff-0052-0054-packet-0.md
```

Output: UTF-8 check passed for 3 text files.

PASS:

```powershell
git diff --check -- documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/handoff-0052-0054-packet-0.md
```

Output: no whitespace errors for tracked diff scope. Files are new and untracked, so final verification also kept changes doc-only and UTF-8 clean.

FAIL then PASS:

```powershell
Get-Content -Raw ... | Format-Table
```

First attempt had a PowerShell pipe syntax error and changed nothing. Fixed command passed and recorded source-doc line/char/hash summary.

## Browser Proof Artifacts

None. Packet 0 is read-only/source-map documentation work. No browser proof required or produced.

## Decisions Made

- Packet 0 can be marked COMPLETE because baseline findings and owner map are recorded.
- No implementation phase is ready.
- PRD-0052 Part 2 is still pending; PRD-0054 master repair remains blocked until PRD-0052 delivers `ReadingV2MasterEditModal` and dependency readiness.
- Current selected-passage full-test flow publishes immediately and opens Studio; Packet 1/3/4 must replace this with ref-only/draft-modal behavior.
- Existing `EditTestFrame` is only a possible chrome reuse candidate; safe reuse is not proven because legacy `TestEditor` blocks Reading V2 payloads and no ref-only master modal exists.

## Blockers / Risks / Deferred Residue

- Missing `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`.
- Missing shared composition numbering owner.
- Missing `reading_v2/projections/assignment_payloads/{homeworkId}:{compositionVersionId}` helper/rules/tests.
- Missing `readingV2ReferenceUpdate.service.ts`.
- Missing PRD-0054 audit service/rules/tests at `reading_v2/audit_events/{eventId}`.
- Missing PRD-0054 duplicate guard/index service/rules/tests at `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`.
- Missing PRD-0054 broken-reference service.
- Current publish still stores embedded `document` in master snapshots.
- Current archive has no restore/audit/archive-index owner.
- Book repair is fallback-visible, not repair-complete.
- `TestCreationModal.tsx` has Mantine and direct navigation residue that must be handled when touched.

## Next Packet

Run Packet 1 - PRD-0052 Schema And Composition Numbering Foundation.

## Copy-Paste Prompt For Next Codex App Conversation

```text
Implement Packet 1 from:

C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\documentation\tasks\tasks-0052-0054-master-implementation-orchestration.md

Worktree:

C:\Users\The Lord\Desktop\luyentap-writing-import-rebased

Objective:

Complete Packet 1 only: PRD-0052 Schema And Composition Numbering Foundation.

Start by reading:

- AGENTS.md
- documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md
- documentation/tasks/handoff-0052-0054-packet-0.md
- documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md
- documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md
- documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md
- documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md
- triggered rule docs only when required

Scope:

- Complete PRD-0052 Part 2 Phase 1 and Phase 1A only.
- Add failing/passing tests and implementation for the ref-only published master schema contract and one shared composition numbering owner.
- Do not start Packet 2 or later.
- Do not implement PRD-0054 repair UI.
- Keep PRD-0054 dependency status blocked unless this packet explicitly changes only the schema/numbering evidence.

Before final response:

- Update documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md.
- Create/update documentation/tasks/handoff-0052-0054-packet-1.md.
- Run targeted tests required by Packet 1 and UTF-8/diff checks.
```
