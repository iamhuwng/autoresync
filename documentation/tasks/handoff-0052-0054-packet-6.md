# Handoff

## Working Folder

- Packet: 6 - PRD-0054 Archive Data And Broken Reference Services
- Status: `COMPLETE`
- Date/time: 2026-06-10 13:21:19 +07:00
- Active folder: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Repo root: `C:/Users/The Lord/Desktop/luyentap-writing-import-rebased`
- Branch: `codex/prd0052-material-tabs-inline`
- HEAD: `d4738a42`
- Worktree state: dirty before Packet 6 and still dirty. Packet 6 changes are mixed with Packet 0-5 modified/untracked files; do not revert unrelated prior packet work.
- Dirty status summary:
  - Pre-existing Packet 0-5 residue remains across `AGENTS.md`, `database.rules.json`, task docs, Teacher Lobby, Test Creation Modal, Reading V2 studio/homework/publish/projection/result/type services and tests, and earlier handoffs.
  - Packet 6 added `src/services/reading-v2/readingV2PassageArchive.service.ts`, `src/services/reading-v2/readingV2PassageArchive.service.test.ts`, `src/services/reading-v2/readingV2BrokenReference.service.ts`, `src/services/reading-v2/readingV2BrokenReference.service.test.ts`, and this handoff.
  - Packet 6 edited `src/types/materialCatalog.types.ts`, `src/types/materialCatalog.types.test.ts`, `src/services/reading-v2/readingV2MaterialMetadata.service.ts`, `src/services/reading-v2/readingV2PassageLibrary.service.ts`, `src/services/reading-v2/readingV2PassageLibrary.service.test.ts`, `src/services/reading-v2/readingV2TeacherComposition.service.ts`, `src/services/reading-v2/readingV2TeacherComposition.service.test.ts`, `src/services/reading-v2/readingV2PassageHomework.service.ts`, `src/services/reading-v2/readingV2PassageHomework.service.test.ts`, `src/services/reading-v2/readingV2LaunchIntegration.service.ts`, `src/services/reading-v2/readingV2LaunchIntegration.service.test.ts`, `src/services/reading-v2/readingV2PublishPipeline.service.ts`, `src/services/reading-v2/readingV2PublishPipeline.service.test.ts`, `src/__tests__/security/readingV2FirebaseRules.test.ts`, `src/__tests__/security/materialCatalogFirebaseRules.test.ts`, `database.rules.json`, and both findings files.

## Next Session Focus

- Packet 6 service/rules scope is complete.
- Next recommended packet: Packet 7 - PRD-0054 Archive UI And Master Repair UI.
- Do not continue Packet 8/9 from this handoff unless explicitly asked.
- Packet 7 should expose the data services built in Packet 6 through Teacher Lobby archive UI and master repair UI.

## Current State

- Source docs read:
  - `AGENTS.md`
  - `documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md`
  - `documentation/tasks/handoff-0052-0054-packet-5.md`
  - `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
  - `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
  - `documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md`
  - `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md`
  - triggered rule docs: `documentation/rules/infrastructure.md`, `documentation/rules/codebase-hygiene.md`, `documentation/architecture/reading-v2-audit-trail.md`
- Completed:
  - Reading Passage archive/restore data service.
  - Owner archive index path and archived list reader behavior.
  - Active Reading Passage private/public list filtering excludes archived rows.
  - Archived list returns owner archive rows with `view` and `restore` actions only.
  - Broken-reference detection service with reasons and repair affordances.
  - Soft master remove semantics for full-test compositions: marks `state: removed`, removes active catalog indexes, writes audit, preserves linked passages, snapshots, assignments, and results.
  - Master homework assignment guard blocks removed/archived/broken current masters.
  - Launch guard blocks removed/archived/broken current masters but keeps frozen assignment payloads launchable.
  - Publish guard blocks unresolved broken refs when master composition is supplied.
  - Firebase rules coverage for archive index owner/admin access, unsafe archive row rejection, soft-only current material/composition updates, and immutable version/snapshot protection.
- Not complete by design:
  - No Teacher Lobby archive UI.
  - No teacher master restore UI.
  - No broken master repair UI.
  - No Packet 8/9 work.
- Findings updated:
  - `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
  - `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`

## Decisions And Constraints

- Archive mutates only current material metadata/material state plus active/archive indexes and audit.
- Archive/restore does not mutate old assignments, completed results, immutable published snapshots, or immutable material versions.
- Archive index row is lightweight and excludes body, questions, answers, review data, canonical payloads, and unsafe large content.
- Restore validates current material version and student-safe projection before making a passage active again.
- Broken-ref detection is read-only. Student launch paths must not write broken-ref summary state.
- Current master assignment, launch, and publish paths block unresolved broken refs; frozen assignment payload launch remains allowed.
- Delete/remove for masters is soft remove only in Packet 6.
- Existing Packet 0-5 dirty work remains mixed in the worktree; stage Packet 6 paths explicitly if committing.

## Verification

RED before implementation:

```powershell
cmd /c npx vitest run src/types/materialCatalog.types.test.ts src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts src/services/reading-v2/readingV2BrokenReference.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/materialCatalogFirebaseRules.test.ts --reporter=basic
```

Result: failed as expected before Packet 6 implementation because archive/broken-ref modules and guards did not exist yet, archive list behavior was absent, and rules did not cover archive index/soft-delete semantics.

PASS after implementation:

```powershell
cmd /c npx vitest run src/types/materialCatalog.types.test.ts src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts src/services/reading-v2/readingV2BrokenReference.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/materialCatalogFirebaseRules.test.ts --reporter=basic
```

Result: 10 files passed, 90 tests passed, 13 skipped. Firebase emulator behavior tests were skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set.

Browser proof:

- Not run for Packet 6 because no reachable UI surface was exposed or changed in this packet.
- Packet 7 must run browser proof after wiring Teacher Lobby archive and master repair UI.

Final checks:

- PASS: `cmd /c npm run check:utf8 -- ...` covered 23 Packet 6 text files.
- PASS: `git diff --check` returned clean.

## Remaining Work

- Packet 7: expose archive/restore and broken master repair in teacher UI.
- Packet 7 must use `Remove from library`, not hard delete language.
- Packet 7 must use an in-app confirmation modal, not `window.confirm`.
- Packet 7 must put repair UI inside `ReadingV2MasterEditModal`.
- Packet 8/9 remain out of scope.
- If preparing a commit, stage Packet 6 paths explicitly. Do not use broad `git add -A` in this mixed dirty worktree.

## Copy-Paste Prompt For Next Codex App Conversation

```text
Implement Packet 7 from:
C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\documentation\tasks\tasks-0052-0054-master-implementation-orchestration.md

Worktree:
C:\Users\The Lord\Desktop\luyentap-writing-import-rebased

Objective:
Implement PRD-0054 Packet 7 only: Archive UI And Master Repair UI.

Start by reading:
- AGENTS.md
- documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md
- documentation/tasks/handoff-0052-0054-packet-6.md
- documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md
- documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md
- documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md
- documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md
- triggered rule docs only when required

Scope:
- Implement Teacher Lobby Reading Passage archive UI.
- Use Remove from library label and in-app confirmation modal.
- Add Archive subtab and restore action.
- Implement broken master repair UI inside ReadingV2MasterEditModal.
- Add repair actions: add existing, remove passage, remake manually, restore source when owned and allowed.
- Add numbering review and publish block while unresolved refs remain.

Do not:
- Do not use window.confirm.
- Do not create standalone Book page or unrelated TeacherHeader shell changes.
- Do not use full-test Studio for broken master repair.
- Do not implement Packet 8/9.

Before final response:
- Run Packet 7 targeted tests.
- Run browser proof on http://localhost:5173/ for Teacher Lobby archive and master repair surfaces.
- Run UTF-8 and diff checks.
- Update both findings files.
- Update documentation/tasks/handoff-0052-0054-packet-7.md with mandatory master-tasklist handoff format.
```

## Suggested Skills

- `ripgrep-first`: use for owner/path discovery before edits.
- `student-view-design`: only if Packet 7 unexpectedly touches student-facing shell or runtime UI.
- `browser:control-in-app-browser`: required for Packet 7 local browser proof.
- `react-async-state-patterns`: use if Packet 7 adds async React state, subscriptions, or pagination handlers.
- `mantine-vitest-testing`: use if tests touch legacy Mantine-dependent components while replacing Mantine surfaces.

## Sensitive Data Handling

- No secrets or credentials were added.
- The local Windows workspace path is retained because it is required for continuation. No secrets, credentials, API keys, cookies, or auth tokens were copied into this handoff.
