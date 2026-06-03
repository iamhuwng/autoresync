# Task List: PRD-0053 IELTS Materials Assign Homework Action

Created: 2026-06-02
Status: Planned
Branch: `codex/ielts-materials-homework-tasklist`
Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

## Goal

Add a first-class `Assign HW` action to eligible IELTS materials in the Teacher Lobby Materials tab, using the existing homework creation flow and preserving the current THCS homework behavior.

## Current Problem

- Teacher Lobby grid mode renders `THCS-THPT` rows through `ThcsTestCard`, which has `Assign HW`.
- IELTS rows render through `TestCard`, which currently has only edit/view, delete, and start actions.
- Teacher Lobby list mode adds `assign-homework` only when `item.testType === 'THCS-THPT'`.
- `HomeworkCreateModal` can list IELTS materials, but its submit call currently does not pass `selectedMaterial.type` or `selectedMaterial.skill` to `createHomework()`, so homework writes can fall back to default metadata.

## Relevant Files

- `documentation/architecture/ui-design-standards.md` - Teacher UI and no-Mantine gate.
- `documentation/architecture/teacher-lobby-authoring-and-navigation.md` - Teacher Lobby shell, card, and toolbar contract.
- `documentation/architecture/teacher-materials-list-view-contract.md` - List-row fixed action slot contract.
- `documentation/architecture/homework-solo-practice-architecture.md` - Homework launch and IELTS homework runtime contract.
- `documentation/architecture/ielts-writing/contracts-and-governance.md` - IELTS Writing homework delivery contract.
- `documentation/rules/codebase-hygiene.md` - No Mantine additions and producer-consumer data rule.
- `documentation/rules/observability.md` - Feature action tracking rule.
- `documentation/rules/navigation.md` - Navigation helper rule.
- `documentation/rules/react-patterns.md` - Component and state-safety rule.
- `.agent/skills/observability-tracking/SKILL.md` - Repo-local tracking workflow.
- `src/pages/TeacherLobbyPage.jsx` - Materials grid/list owner and modal host.
- `src/components/modern/TestCard.jsx` - IELTS/generic grid card.
- `src/components/modern/ThcsTestCard.jsx` - Existing THCS grid card.
- `src/components/modern/materialListAdapter.js` - List-row action view-model owner.
- `src/components/homework/HomeworkCreateModal.tsx` - Shared homework creation modal.
- `src/services/homeworkManager.ts` - Homework writer.
- `src/types/homework.types.ts` - `materialType` and `materialSkill` contracts.
- `src/config/featureRegistry.ts` - Action registry.
- `src/pages/StudentHomeworkListPage.tsx` - Student homework launch from list.
- `src/pages/StudentHomeworkDetailPage.tsx` - Student homework launch from detail.
- `src/pages/StudentPracticePage.tsx` - IELTS/THCS/Reading V2 homework runtime router.
- `src/components/modern/materialListAdapter.test.js` - List action tests.
- `src/components/modern/TestCard.test.jsx` - Grid card action tests.
- `src/components/homework/HomeworkCreateModal.test.tsx` - Homework modal tests.
- `src/pages/TeacherLobbyPage.test.jsx` - Page wiring and tracking tests.

## Non-Goals

- Do not replace `THCSHomeworkAssignDialog`.
- Do not create an IELTS-only assignment dialog.
- Do not add a new route for Materials assignment.
- Do not change student runtime behavior except where tests reveal a bug in existing IELTS homework launch.
- Do not add new `@mantine/*` imports.
- Do not hydrate Reading V2 canonical payloads just to render cards or rows.

## Acceptance Criteria

- [ ] Owned eligible IELTS Reading, Listening, and Writing materials show `Assign HW` in Teacher Lobby grid mode.
- [ ] Owned eligible IELTS Reading, Listening, and Writing materials show `Assign HW` in Teacher Lobby list mode slot 4.
- [ ] Incomplete IELTS materials do not show `Assign HW`.
- [ ] IELTS Speaking materials do not show `Assign HW` unless a runtime path is proven.
- [ ] Reading V2 materials show `Assign HW` only if homework launch/projection support is proven by tests.
- [ ] THCS materials still use the existing THCS homework dialog.
- [ ] IELTS `Assign HW` opens `HomeworkCreateModal` with the clicked material preselected.
- [ ] Created IELTS homework stores correct `materialType` and `materialSkill`.
- [ ] Feature tracking records the Materials-tab assignment action.
- [ ] List action rail geometry remains fixed and stable.
- [ ] No extra folders/worktrees are created.

## Tasks

### 0. Baseline And Rule Gate

- [ ] 0.1 Confirm active root is `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`.
- [ ] 0.2 Confirm active branch is `codex/ielts-materials-homework-tasklist`.
- [ ] 0.3 Run `git status --short --branch` and record any pre-existing dirty files before code edits.
- [ ] 0.4 Read `documentation/architecture/ui-design-standards.md`.
- [ ] 0.5 Read `documentation/architecture/teacher-lobby-authoring-and-navigation.md`.
- [ ] 0.6 Read `documentation/architecture/teacher-materials-list-view-contract.md`.
- [ ] 0.7 Read `documentation/architecture/homework-solo-practice-architecture.md`.
- [ ] 0.8 Read `documentation/rules/codebase-hygiene.md`.
- [ ] 0.9 Read `documentation/rules/observability.md`.
- [ ] 0.10 Read `.agent/skills/observability-tracking/SKILL.md`.
- [ ] 0.11 Run `rg -n "Assign HW|assign-homework|openHwDialog|HomeworkCreateModal|materialType|materialSkill" src` to verify current anchors.

### 1. Define IELTS Assignment Eligibility

- [ ] 1.1 Create `src/components/modern/materialHomeworkEligibility.js`.
- [ ] 1.2 Export `getHomeworkAssignEligibility(item)`.
- [ ] 1.3 Return `{ assignable: false, reason: 'missing-id' }` when no material id exists.
- [ ] 1.4 Return `{ assignable: false, reason: 'incomplete' }` when `item.isComplete === false`.
- [ ] 1.5 Treat `testType === 'THCS-THPT'` as handled by existing THCS flow, not this IELTS helper.
- [ ] 1.6 Normalize IELTS skill from `item.skill` or `item.metadata.skill`.
- [ ] 1.7 Return assignable for IELTS `reading`, `listening`, and `writing`.
- [ ] 1.8 Return not assignable for IELTS `speaking` until a homework runtime exists.
- [ ] 1.9 Decide Reading V2 eligibility only after Task 8 runtime tests; default to not assignable until proven.
- [ ] 1.10 Add `src/components/modern/materialHomeworkEligibility.test.js`.
- [ ] 1.11 Test eligible IELTS Reading, Listening, and Writing.
- [ ] 1.12 Test ineligible THCS, incomplete IELTS, IELTS Speaking, missing id, and unknown type.

### 2. Preserve Material Type And Skill In HomeworkCreateModal

- [ ] 2.1 Update `mapMaterialRecord()` in `HomeworkCreateModal.tsx` so non-THCS titles fall back to `material.metadata?.title`.
- [ ] 2.2 Ensure `mapMaterialRecord()` normalizes non-THCS `type` to `quiz` or `test`.
- [ ] 2.3 Ensure `mapMaterialRecord()` normalizes skill to lowercase `reading`, `listening`, `writing`, or `speaking`.
- [ ] 2.4 Update `handleSubmit()` to pass `materialType: selectedMaterial.type` to `createHomework()`.
- [ ] 2.5 Update `handleSubmit()` to pass `materialSkill: selectedMaterial.skill` to `createHomework()`.
- [ ] 2.6 Keep THCS behavior unchanged: `selectedMaterial.type === 'thcs-test'` still opens `THCSHomeworkAssignDialog`.
- [ ] 2.7 Add a `HomeworkCreateModal.test.tsx` case for an IELTS Listening material and assert `createHomework()` receives `materialType: 'test'` and `materialSkill: 'listening'`.
- [ ] 2.8 Add a `HomeworkCreateModal.test.tsx` case for an IELTS Writing material and assert `materialSkill: 'writing'`.
- [ ] 2.9 Run `cmd /c npx vitest run src/components/homework/HomeworkCreateModal.test.tsx --reporter=basic`.

### 3. Support Preselected Material In HomeworkCreateModal

- [ ] 3.1 Add prop `autoAdvanceWhenPreselected?: boolean` to `HomeworkCreateModalProps`.
- [ ] 3.2 When `preselectedMaterialId` is present and loaded, set `selectedMaterial` to the matching material.
- [ ] 3.3 When `autoAdvanceWhenPreselected === true` and selected material is not THCS, set `currentStep` to `target`.
- [ ] 3.4 Do not auto-advance if the preselected material cannot be found; show the material step with current empty state.
- [ ] 3.5 Reset `currentStep` to `material` in `resetFormState()`.
- [ ] 3.6 Add a test that opens with `preselectedMaterialId` and `autoAdvanceWhenPreselected`, then asserts the target step appears.

### 4. Add IELTS Assignment To List Rows

- [ ] 4.1 Import `getHomeworkAssignEligibility()` in `materialListAdapter.js`.
- [ ] 4.2 For owned non-THCS rows, add `Assign HW` when eligibility is assignable.
- [ ] 4.3 Place `Assign HW` in slot 4.
- [ ] 4.4 Preserve existing THCS slot-4 action and handler.
- [ ] 4.5 Keep incomplete rows without `Assign HW`.
- [ ] 4.6 Add a test showing owned IELTS Reading actions are `Edit`, `Delete`, `Start Test`, `Assign HW`.
- [ ] 4.7 Add a test showing incomplete IELTS has no `Assign HW`.
- [ ] 4.8 Add a test showing THCS still has existing `Assign HW`.
- [ ] 4.9 Run `cmd /c npx vitest run src/components/modern/materialHomeworkEligibility.test.js src/components/modern/materialListAdapter.test.js --reporter=basic`.

### 5. Add IELTS Assignment To Grid Cards

- [ ] 5.1 Update `TestCard.jsx` to accept `onAssignHw`.
- [ ] 5.2 Use `getHomeworkAssignEligibility(test)` in `TestCard.jsx`.
- [ ] 5.3 Render `Assign HW` only when eligibility is assignable.
- [ ] 5.4 Keep Start Test full-width when no assign action exists.
- [ ] 5.5 When assign action exists, keep Start Test and Assign HW stable in one footer row.
- [ ] 5.6 Use existing repo icon components; do not add emoji icon text.
- [ ] 5.7 Add `TestCard.test.jsx` cases for eligible IELTS Reading and Writing.
- [ ] 5.8 Add `TestCard.test.jsx` cases for incomplete IELTS and IELTS Speaking.
- [ ] 5.9 Run `cmd /c npx vitest run src/components/modern/TestCard.test.jsx --reporter=basic`.

### 6. Wire TeacherLobbyPage

- [ ] 6.1 Lazy-load `HomeworkCreateModal` from `../components/homework/HomeworkCreateModal`.
- [ ] 6.2 Add state `homeworkMaterialToAssign`.
- [ ] 6.3 Add `handleAssignHomeworkFromMaterials(test)`.
- [ ] 6.4 If `test.testType === 'THCS-THPT'`, call `modals.openHwDialog(test)` and return.
- [ ] 6.5 Otherwise set `homeworkMaterialToAssign` to the clicked test.
- [ ] 6.6 Track `assignHomeworkFromMaterials` with material id, test type, skill, delivery engine, and source.
- [ ] 6.7 Pass `handleAssignHomeworkFromMaterials` to `TestCard`, `ThcsTestCard`, and `buildTestMaterialListRow()` as `onAssignHw`.
- [ ] 6.8 Render `HomeworkCreateModal` when `homeworkMaterialToAssign` is set.
- [ ] 6.9 Pass `preselectedMaterialId={homeworkMaterialToAssign.materialId || homeworkMaterialToAssign.id}`.
- [ ] 6.10 Pass `preselectedMaterialFilter="test"`.
- [ ] 6.11 Pass `autoAdvanceWhenPreselected={true}`.
- [ ] 6.12 Clear `homeworkMaterialToAssign` on modal close and success.
- [ ] 6.13 Do not wrap or move `TeacherHeader`.

### 7. Observability

- [ ] 7.1 Add `assignHomeworkFromMaterials` to the `testCreation` actions in `src/config/featureRegistry.ts`.
- [ ] 7.2 Confirm `TeacherLobbyPage.jsx` already uses `useFeatureTracking(FEATURE_IDS.testCreation)`.
- [ ] 7.3 Confirm every new assignment click path calls `trackAction()`.
- [ ] 7.4 Run `rg -n "assignHomeworkFromMaterials|trackAction" src/pages/TeacherLobbyPage.jsx src/config/featureRegistry.ts`.

### 8. Runtime Regression

- [ ] 8.1 Verify student homework launch still passes `homeworkId`, `submissionId`, `teacherId`, `dueDate`, `lateSubmissionAllowed`, `timerMinutes`, `maxAttempts`, and `startedAt`.
- [ ] 8.2 Add or update tests only if existing coverage does not prove those fields for IELTS homework.
- [ ] 8.3 Verify IELTS Writing homework still builds `writingHomeworkContext` in `StudentPracticePage.tsx`.
- [ ] 8.4 Verify IELTS Reading and Listening homework still render through existing practice views.
- [ ] 8.5 Prove Reading V2 homework runtime before enabling Reading V2 Materials `Assign HW`; otherwise leave it ineligible.
- [ ] 8.6 Run `cmd /c npx vitest run src/pages/StudentHomeworkListPage.test.tsx src/pages/StudentHomeworkDetailPage.test.tsx src/pages/StudentPracticePage.test.tsx --reporter=basic` if runtime files are touched.

### 9. Page Tests

- [ ] 9.1 Update `TeacherLobbyPage.test.jsx` mocks so `TestCard` can render an `Assign HW` button.
- [ ] 9.2 Add grid-mode IELTS test: clicking `Assign HW` opens generic homework modal with the clicked id.
- [ ] 9.3 Add list-mode IELTS test: switch to list, click `Assign HW`, opens generic homework modal.
- [ ] 9.4 Add THCS regression: clicking `Assign HW` calls `openHwDialog`, not generic modal.
- [ ] 9.5 Assert `assignHomeworkFromMaterials` tracking payload includes source and material id.
- [ ] 9.6 Run `cmd /c npx vitest run src/pages/TeacherLobbyPage.test.jsx --reporter=basic`.

### 10. Browser Verification

- [ ] 10.1 Start local app from `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`.
- [ ] 10.2 Use login page dev quick-login settings icon, then `Teacher`.
- [ ] 10.3 Open Teacher View -> Materials.
- [ ] 10.4 Verify eligible IELTS grid cards show `Assign HW`.
- [ ] 10.5 Click IELTS `Assign HW` and verify homework modal opens with material preselected on target step.
- [ ] 10.6 Verify THCS `Assign HW` still opens THCS dialog.
- [ ] 10.7 Switch to list mode and verify IELTS action appears in slot 4.
- [ ] 10.8 Verify no horizontal overflow at `1280`, `1366`, `1440`, `1536`, `1586`, `1600`, and `1920`.

### 11. Final Checks

- [ ] 11.1 Run targeted tests:
  - `cmd /c npx vitest run src/components/modern/materialHomeworkEligibility.test.js src/components/modern/materialListAdapter.test.js src/components/modern/TestCard.test.jsx src/components/homework/HomeworkCreateModal.test.tsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic`
- [ ] 11.2 Run targeted UTF-8 check:
  - `cmd /c npm run check:utf8 -- documentation/tasks/tasks-0053-prd-ielts-materials-assign-homework.md src/pages/TeacherLobbyPage.jsx src/components/modern/TestCard.jsx src/components/modern/materialListAdapter.js src/components/modern/materialHomeworkEligibility.js src/components/homework/HomeworkCreateModal.tsx src/config/featureRegistry.ts`
- [ ] 11.3 Run diff check:
  - `git diff --check -- documentation/tasks/tasks-0053-prd-ielts-materials-assign-homework.md src/pages/TeacherLobbyPage.jsx src/components/modern/TestCard.jsx src/components/modern/materialListAdapter.js src/components/modern/materialHomeworkEligibility.js src/components/homework/HomeworkCreateModal.tsx src/config/featureRegistry.ts`
- [ ] 11.4 Confirm no new folders/worktrees were created.
- [ ] 11.5 Confirm `git status --short --branch` shows only intended branch changes plus any pre-existing dirty files recorded in Task 0.3.
