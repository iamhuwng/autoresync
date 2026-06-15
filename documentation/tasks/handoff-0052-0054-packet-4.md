# Handoff - Packet 4

## Working Folder

- Active folder: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Repo root: `C:/Users/The Lord/Desktop/luyentap-writing-import-rebased`
- Branch: `codex/prd0052-material-tabs-inline`
- HEAD: `d4738a42`
- Worktree identity: `C:/Users/The Lord/Desktop/luyentap-writing-import-rebased`, branch `refs/heads/codex/prd0052-material-tabs-inline`
- Worktree state: dirty before Packet 4 and still dirty. Packet 4 changes are mixed with Packet 0-3 modified/untracked files; do not revert unrelated prior packet work.
- Dirty status summary at handoff:
  - Pre-existing Packet 0-3 residue includes `database.rules.json`, PRD task docs, Reading V2 publish/projection/homework/result/type services and tests, audit service files, duplicate guard files, and earlier packet handoffs.
  - Packet 4 edited `src/components/test-creation/TestCreationModal.tsx`, `src/components/test-creation/TestCreationModal.test.tsx`, `src/config/featureRegistry.ts`, `src/config/featureRegistry.test.ts`, `src/pages/TeacherLobbyPage.jsx`, `src/pages/TeacherLobbyPage.test.jsx`, `src/services/reading-v2/readingV2TeacherComposition.service.ts`, `src/services/reading-v2/readingV2TeacherComposition.service.test.ts`, and the two findings docs.
  - Packet 4 added `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`, `src/components/reading-v2/master/ReadingV2MasterEditModal.css`, `src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx`, `src/components/reading-v2/master/ReadingV2MasterPassagePicker.tsx`, `src/components/reading-v2/master/ReadingV2MasterPassagePicker.test.tsx`, and this handoff.

## Next Session Focus

- Continue after Packet 4 only if the next approved scope is Packet 5 or later.
- Do not implement assignment freeze UI, update references modal, archive UI, repair UI, restore UI, or Book repair UI unless the next packet explicitly asks for it.

## Current State

- Packet 4 completed PRD-0052 Part 2 Phase 3 and Phase 4.
- `ReadingV2MasterEditModal` exists at `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`.
- `ReadingV2MasterPassagePicker` exists at `src/components/reading-v2/master/ReadingV2MasterPassagePicker.tsx`.
- Teacher Lobby published Reading V2 master `Edit` now opens the master modal in published mode instead of `TEACHER_READING_V2_REVISE`.
- Teacher Lobby selected Reading Passage full-test creation now creates a ref-only unpublished draft master and opens the modal in draft mode.
- Test Creation Modal Reading V2 start choices now include `Use existing Reading Passages`; this closes the wizard and hands metadata to Teacher Lobby without published full-test Studio navigation.
- `createReadingV2TeacherSelectedPassageDraft()` writes only draft composition/version paths and rejects draft, archived, inaccessible, or missing published snapshot passage rows.
- Feature registry includes Packet 4 master-modal and existing-passage workflow actions.
- `src/components/reading-v2/master/` is currently an untracked directory containing both Packet 4 implementation files and Packet 4 tests.
- Findings updated:
  - `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
  - `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`

## Decisions And Constraints

- Packet 4 keeps draft/unpublished full-test creation out of published full-test Studio.
- Published full-test master edit uses modal ownership, not full-test Studio ownership.
- The modal exposes callbacks for save/publish/refresh/open-passage but does not implement later assignment-freeze, update-reference, archive, or repair behavior.
- Public/non-owned single passages are not opened directly for edit; modal shows a clone path placeholder.
- Picker uses projection/list rows only; it does not hydrate canonical passage payloads.
- `TestCreationModal.tsx` no longer imports `@mantine/core`; Packet 4 replaced the local `Modal` and `Text` usage in this touched file with lightweight local components.
- Browser proof was not run for Packet 4. Verification is targeted Vitest plus UTF-8 and whitespace checks.
- Repo-wide TypeScript/build was not run. Do not infer repo-wide type cleanliness from this packet handoff.

## Verification

PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/reading-v2/master/ReadingV2MasterPassagePicker.test.tsx src/pages/TeacherLobbyPage.test.jsx src/components/test-creation/TestCreationModal.test.tsx src/config/featureRegistry.test.ts --reporter=basic
```

Result: 6 files passed, 95 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2CompositionNumbering.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts --reporter=basic
```

Result: 6 files passed, 40 tests passed.

PASS:

```powershell
cmd /c npm run check:utf8 -- src/components/reading-v2/master/ReadingV2MasterEditModal.tsx src/components/reading-v2/master/ReadingV2MasterEditModal.css src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/reading-v2/master/ReadingV2MasterPassagePicker.tsx src/components/reading-v2/master/ReadingV2MasterPassagePicker.test.tsx src/services/reading-v2/readingV2TeacherComposition.service.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.test.jsx src/components/test-creation/TestCreationModal.tsx src/components/test-creation/TestCreationModal.test.tsx src/config/featureRegistry.ts src/config/featureRegistry.test.ts documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/handoff-0052-0054-packet-4.md
```

Result: UTF-8 check passed for 16 text files.

PASS:

```powershell
git diff --check
```

Result: no whitespace errors.

## Remaining Work

- For later packets only: implement assignment freeze/update reference modal, archive/restore UI, repair UI, and readiness marker work.
- If continuing into PRD-0054, keep status as blocked until the later PRD-0052 dependency gate is marked ready.
- If preparing a commit, stage Packet 4 paths explicitly. Do not use broad `git add -A` in this mixed dirty worktree.

## Copy-Paste Prompt For Next Codex App Conversation

```text
Implement Packet 5 from:

C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\documentation\tasks\tasks-0052-0054-master-implementation-orchestration.md

Worktree:

C:\Users\The Lord\Desktop\luyentap-writing-import-rebased

Objective:

Complete Packet 5 only: PRD-0052 Update References, Assignment Freeze, Runtime, Result, Handoff.

Start by reading:

- AGENTS.md
- documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md
- documentation/tasks/handoff-0052-0054-packet-4.md
- documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md
- documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md
- documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md
- documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md
- triggered rule docs only when required

Scope:

- Complete PRD-0052 Part 2 Phase 5, Phase 6, Phase 7, and Phase 8 only.
- Implement single-passage version update and `Update References` modal.
- Implement assignment freeze and refresh-before-start behavior.
- Ensure runtime, submission, and result review use frozen projections.
- Add rules, observability, and feature-registry coverage.
- Mark PRD-0054 master-repair dependency `READY` or `BLOCKED` with exact evidence.

Do not:

- Do not silently update owned masters, Books, assignments, or results after single-passage publish.
- Do not infer student-started status from UI state.
- Do not write a placeholder PRD-0054 readiness note.
- Do not implement archive UI, restore UI, repair UI, or later packets unless Packet 5 explicitly requires a dependency status note.

Before final response:

- Update documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md.
- Update documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md with the PRD-0054 dependency status.
- Create/update documentation/tasks/handoff-0052-0054-packet-5.md using the mandatory handoff format from the master tasklist, including the next copy-paste prompt.
- Run targeted tests required by Packet 5, possible browser proof steps, and UTF-8/diff checks.
```

## Suggested Skills

- `superpowers:test-driven-development`: next packet likely needs UI/service tests first.
- `superpowers:verification-before-completion`: required before claiming packet completion.
- `handoff-writer`: use again if creating the next packet handoff.

## Sensitive Data Handling

- No secrets or credentials were added.
- The local Windows workspace path is retained because it is required for continuation. No secrets, credentials, API keys, cookies, or auth tokens were copied into this handoff.
