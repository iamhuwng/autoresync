# Findings - PRD-0052 Part 2 Reading V2 Composition-First Master Tests

## Packet 0 Baseline

- Packet: 0 - Baseline And Dependency Map
- Status: COMPLETE for baseline only
- Date/time: 2026-06-09 17:50:38 +07:00
- Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `codex/prd0052-material-tabs-inline`
- Commit: `d4738a4289921fefdb7edea665ac4e3592e1d9a0`
- Initial `git status --short`: clean output

## Source Docs Read

- `AGENTS.md` - tracked
- `documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md` - tracked
- `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md` - tracked
- `documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md` - tracked
- `documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md` - tracked
- `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md` - tracked
- `documentation/architecture/reading-v2-material-publish-and-passage-library.md` - tracked
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md` - tracked
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md` - tracked
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md` - tracked
- `documentation/architecture/reading-v2-audit-trail.md` - tracked

No UI/code edits were made, so `documentation/architecture/ui-design-standards.md` and UI rule docs were not triggered for Packet 0.

## Required Phase 0 Commands

PASS:

```powershell
git status --short
```

Output: clean.

PASS:

```powershell
git ls-files -- documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/handoff-0052-0054-packet-0.md
```

Output: three source tasklist files tracked; findings/handoff files absent before Packet 0 edit.

PASS:

```powershell
rg "full_test_compositions|composition|reading-passage-set|reading_passage_materials|published_snapshots|student_safe_tests|session_test_payloads|review" src functions database.rules.json firestore.rules
```

Baseline signal: hits in `database.rules.json`, `functions/src/readingV2SubmitCore.ts`, `src/services/reading-v2/*`, `src/pages/TeacherLobbyPage.jsx`, `src/pages/StudentPracticePage.tsx`, and result/review code.

PASS:

```powershell
rg "@mantine|useNavigate|window.open|location.href|navigate\(" src/components/test-creation src/pages/TeacherLobbyPage.jsx src/components/reading-v2
```

Baseline signal: `src/components/test-creation/TestCreationModal.tsx` imports `@mantine/core`, imports `useNavigate`, and calls `navigate(...)` for Reading V2 create/import routes. Other Mantine imports remain in test-creation children. No `window.open` hit in this scoped search.

PASS:

```powershell
rg -n "createReadingV2TeacherSelectedPassageComposition|publishReadingV2Material|navigateTo\(|TEACHER_READING_V2_REVISE|document:|ReadingV2PublishedSnapshot|assignment_payloads|ReadingV2MasterEditModal" src/services/reading-v2/readingV2TeacherComposition.service.ts src/services/reading-v2/readingV2PublishPipeline.service.ts src/types/readingV2.types.ts src/pages/TeacherLobbyPage.jsx src/services/reading-v2/readingV2StoragePaths.service.ts
```

Baseline signal: current publish types and pipeline still carry `document`; current Lobby Reading V2 edit routes go to `TEACHER_READING_V2_REVISE`; no `assignment_payloads` or master modal owner exists.

## Current Owner Map

| Concern | Current owner | Evidence | Status |
|---|---|---|---|
| Publish pipeline | `src/services/reading-v2/readingV2PublishPipeline.service.ts` | `publishReadingV2Material`, `buildReadingV2PublishCommitPlan`; `ReadingV2PublishedSnapshot` staged with `document: input.document` | Existing, not ref-only master |
| Firebase publish commit | `src/services/reading-v2/readingV2FirebasePublishAdapter.service.ts` | `buildReadingV2FirebasePublishUpdates`, `commitReadingV2PublishPlanToFirebase` | Existing |
| Storage paths | `src/services/reading-v2/readingV2StoragePaths.service.ts` | owns `full_test_compositions`, `full_test_composition_versions`, `published_snapshots`, `student_safe_tests`, `session_test_payloads`, `review` | Existing; no `assignment_payloads` helper |
| Composition assembly | `src/services/reading-v2/readingV2FullTestComposition.service.ts` | `createReadingV2FullTestCompositionFromRefs`, `resolveReadingV2FullTestComposition`, `planReadingV2PassageEditFromCompositionRef` | Existing |
| Teacher selected passage composition | `src/services/reading-v2/readingV2TeacherComposition.service.ts` | `createReadingV2TeacherSelectedPassageComposition` reads passage snapshots, builds merged full `document`, then calls `publishReadingV2Material` | Existing but publishes immediately |
| Published snapshot type | `src/types/readingV2.types.ts` | `ReadingV2PublishedSnapshot` requires `document` | Existing, conflicts with ref-only master target |
| Master edit modal | none | `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx` missing | Missing |
| Master passage picker | none | `src/components/reading-v2/master/ReadingV2MasterPassagePicker.tsx` missing | Missing |
| Update references modal/service | none | `ReadingV2UpdateReferencesModal.tsx` and `readingV2ReferenceUpdate.service.ts` missing | Missing |
| Teacher Lobby edit routing | `src/pages/TeacherLobbyPage.jsx` | `handleEditTest` sends Reading V2 payloads to `TEACHER_READING_V2_REVISE`; selected-passage full-test creation navigates to same Studio route | Existing, not published-master modal split |
| Test Creation Modal entry | `src/components/test-creation/TestCreationModal.tsx` | Mantine and direct `useNavigate`; Reading V2 blank/import/Auto routes open Studio | Existing; cleanup needed when touched |
| Assignment freeze | `src/services/reading-v2/readingV2PassageHomework.service.ts` | `requireAssignableReadingPassage`, snapshot and passage-set homework helpers | Existing for single/set passage homework |
| Runtime launch | `src/services/reading-v2/readingV2PassageHomeworkLaunch.service.ts`, `src/pages/StudentPracticePage.tsx` | `composeReadingPassageSetProjection`; StudentPractice resolves homework passage projections | Existing; no master assignment projection owner |
| Submission validation | `functions/src/readingV2SubmitCore.ts` | Reading passage set trusted submission requires assigned snapshot binding and display number binding | Existing for passage set |
| Result/review | `src/services/reading-v2/readingV2ResultAdapter.service.ts`, `src/components/results/ReadingV2ReviewContentAdapter.tsx` | grouped review payload and frozen review rendering exist | Existing |
| Routes | `src/constants/routes.ts`, `src/routes/teacherRoutes.tsx` | `/teacher/reading-v2/create`, `/import`, `/drafts/:draftId`, `/materials/:materialId/revise` | Existing; no master modal route needed yet |
| Security rules | `database.rules.json`, `firestore.rules`, `src/__tests__/security/readingV2FirebaseRules.test.ts`, `src/__tests__/security/homeworkFirestoreRules.test.ts` | composition/projection paths exist; no explicit embedded-master-payload deny list for new ref-only contract | Partial |
| Observability | `src/config/featureRegistry.ts` | Reading V2 Studio and teacher-materials actions exist; no master modal actions | Partial |
| Audit dependency | none in source | `documentation/architecture/reading-v2-audit-trail.md` names `readingV2AuditTrail.service.ts`; file missing | Missing |

## Current Behavior Notes

- Existing-passage full-test behavior in `TeacherLobbyPage.jsx` and `readingV2TeacherComposition.service.ts`: selecting Reading Passages creates a composition, immediately publishes a merged full-test document, then navigates to `TEACHER_READING_V2_REVISE`. It does not create an unpublished draft master modal flow.
- Current full-test publish behavior in `readingV2PublishPipeline.service.ts`: `ReadingV2PublishedSnapshot` carries `document`. That embedded document includes canonical content surfaces such as sections/stimuli/task groups/interactions/option sets/answer data through the `ReadingV2Document` shape. This is not the PRD-0052 Part 2 ref-only published-master target.
- Expected reconciliation remains true: Part 1 added Reading Passage entities and composition refs, but new published master writes and Lobby edit routing are not yet reconciled to ref-only master storage and modal-first published master editing.
- Existing tests cover Part 1 seams around publish, library, passage-set homework, runtime, submission, and review. They do not prove PRD-0052 Part 2 final behavior: ref-only published master, no embedded master payload, shared composition numbering owner, master modal edit, draft master creation, assignment-pinned master projection, or update-references safety.

## Missing Owners

- `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`
- `src/components/reading-v2/master/ReadingV2MasterEditModal.css`
- `src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx`
- `src/components/reading-v2/master/ReadingV2MasterPassagePicker.tsx`
- `src/components/reading-v2/master/ReadingV2MasterPassagePicker.test.tsx`
- `src/components/reading-v2/master/ReadingV2UpdateReferencesModal.tsx`
- `src/components/reading-v2/master/ReadingV2UpdateReferencesModal.test.tsx`
- `src/services/reading-v2/readingV2ReferenceUpdate.service.ts`
- `src/services/reading-v2/readingV2CompositionNumbering.service.ts`
- `src/services/reading-v2/readingV2PassageDuplicateGuard.service.ts`
- `src/services/reading-v2/readingV2AuditTrail.service.ts`
- `reading_v2/projections/assignment_payloads/{homeworkId}:{compositionVersionId}` path helper, rules, and tests
- Explicit security-rule owner for ref-only master writes and prohibited embedded master payload rejection
- Observability actions for `reading_v2_master_edit_opened`, metadata save, passage reorder/add/remove, clone requested, and publish submitted

## Blockers And Deferred Risks

- PRD-0054 duplicate-index foundation is absent, so PRD-0052 Phase 2B and final Part 2 acceptance are blocked until Packet 2 or equivalent completes.
- Published master edit modal is absent, so downstream PRD-0054 master repair remains blocked.
- Existing selected-passage composition publishes immediately and opens Studio; this contradicts draft-master modal target.
- Master publish still writes embedded canonical `document`; Phase 1/2 must add failing tests before implementation.
- Numbering is local/duplicated in composition, homework launch, and submit paths; no shared composition numbering owner exists.
- `TestCreationModal.tsx` has Mantine and direct navigation residue. Touching this surface triggers codebase-hygiene and mobile-portability/navigation rule docs.
- Security rules currently do not prove prohibited embedded master payload rejection.

## Packet 0 Decision

Packet 0 baseline is complete. No implementation phase is ready. Next packet is Packet 1: PRD-0052 Schema And Composition Numbering Foundation.

## Packet 1 Findings - Schema And Composition Numbering Foundation

- Packet: 1 - PRD-0052 Schema And Composition Numbering Foundation
- Status: COMPLETE for PRD-0052 Part 2 Phase 1 and Phase 1A scope only
- Date/time: 2026-06-09 18:13:19 +07:00
- Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `codex/prd0052-material-tabs-inline`
- Commit before packet: `d4738a4289921fefdb7edea665ac4e3592e1d9a0`

### Source Docs Read

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

### Implementation Evidence

- Ref-only schema owner: `src/types/readingV2.types.ts`.
  - `ReadingV2PassageRef` now includes explicit PRD fields: `materialId`, `title`, `source`, `testType`, `questionCount`, `ownerId`, `visibility`, and `currentVersionId`.
  - `ReadingV2FullTestComposition` now stores `numbering`.
- Ref-only guard owner: `src/services/reading-v2/readingV2FullTestComposition.service.ts`.
  - New `assertReadingV2RefOnlyFullTestComposition()` rejects prohibited embedded master payload keys: `document`, `sections`, `stimuli`, `taskGroups`, `interactions`, `optionSets`, `answerKey`, and `correctAnswers`.
  - `createReadingV2FullTestCompositionFromRefs()` now builds numbering through the shared composition numbering owner and asserts the ref-only contract before returning.
- Publish/storage consumers:
  - `src/services/reading-v2/readingV2PassageExtraction.service.ts` now emits enriched passage refs and composition numbering for generated full-test compositions.
  - `src/services/reading-v2/readingV2PublishPipeline.service.ts` asserts extracted master compositions are ref-only before staging composition storage writes.
  - `database.rules.json` now rejects prohibited embedded master payload fields on `reading_v2/full_test_compositions/{compositionId}` and `reading_v2/full_test_composition_versions/{compositionId}/{versionId}`.
- Shared numbering owner path: `src/services/reading-v2/readingV2CompositionNumbering.service.ts`.
  - Owner API: `composeReadingV2CompositionNumbering()`.
  - Output: `interactionDisplayNumbers`, `passageRanges`, and `totalQuestionCount`.
  - Repair mode support: `preserveBeforeOrder` plus `previousInteractionDisplayNumbers` preserves numbers before a changed slot and recomputes changed/later slots for PRD-0054 repair review.
- Numbering consumers covered by tests:
  - Master composition creation: `readingV2FullTestComposition.service.test.ts`
  - Master publish/extraction: `readingV2PublishPipeline.service.test.ts`
  - Teacher-selected composition assembly: `readingV2TeacherComposition.service.test.ts`
  - Assignment/runtime projection: `readingV2PassageHomeworkLaunch.service.test.ts`
  - Trusted submission validation request path: `src/__tests__/readingV2PassageSetSubmitCore.test.ts`
  - Result review frozen numbering: `readingV2ResultAdapter.service.test.ts`
  - PRD-0054 repair numbering semantics: `readingV2CompositionNumbering.service.test.ts`

### Deferred / Still Blocked

- Packet 1 does not implement full publish split beyond schema/storage assertions. Packet 3 still owns full composition-first publish core.
- Packet 1 does not implement `ReadingV2MasterEditModal`; Packet 4 still owns modal UI and published-master route behavior.
- Packet 1 does not implement assignment freeze storage at `reading_v2/projections/assignment_payloads/{homeworkId}:{compositionVersionId}`; Packet 5 still owns assignment refresh/freeze.
- PRD-0054 master repair remains `BLOCKED` because `ReadingV2MasterEditModal` and PRD-0052 Phase 8 readiness are still absent. Packet 1 only supplies schema/numbering evidence.

### Tests Run

RED then PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/services/reading-v2/readingV2CompositionNumbering.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts --reporter=basic
```

Initial red result: 5 files failed for missing numbering service, missing ref-only guard, missing `compositionNumbering`, missing enriched ref fields, and missing rules deny-list.

Passing result after implementation: 5 files passed, 35 tests passed, 5 skipped.

PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2CompositionNumbering.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts --reporter=basic
```

Result: 9 files passed, 73 tests passed, 5 skipped.

PASS:

```powershell
cmd /c npx vitest run src/__tests__/readingV2PassageSetSubmitCore.test.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts --reporter=basic
```

Result: 3 files passed, 30 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/types/readingV2.types.test.ts src/services/reading-v2/readingV2Backfill.service.test.ts src/services/reading-v2/readingV2BackfillCli.test.ts src/services/materialCatalog/materialCatalogRepair.service.test.ts --reporter=basic
```

Result: 4 files passed, 28 tests passed.

## Packet 3 Findings - Composition-First Publish Core

- Packet: 3 - PRD-0052 Composition-First Publish Core
- Status: COMPLETE for PRD-0052 Part 2 Phase 2A and Phase 2B scope only
- Date/time: 2026-06-10 08:03:31 +07:00
- Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `codex/prd0052-material-tabs-inline`
- Commit before packet: `d4738a4289921fefdb7edea665ac4e3592e1d9a0`

### Source Docs Read

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

### Phase 2A Implementation Evidence

- Publish core owner: `src/services/reading-v2/readingV2PublishPipeline.service.ts`.
- Full-test composition publishes now split generated Reading Passage storage writes from master composition writes.
- Generated passage outputs include:
  - `reading_v2/reading_passage_materials/{passageMaterialId}`
  - `reading_v2/reading_passage_material_versions/{passageMaterialId}/{snapshotVersionId}`
  - `reading_v2/published_snapshots/{passageMaterialId}/{snapshotVersionId}`
  - `reading_v2/projections/student_safe_tests/{passageMaterialId}:{snapshotVersionId}`

## Post-Packet Addendum - 2026-06-13 Student Launch Projection Closure

- Status: COMPLETE for live student-launch follow-up
- Scope: composition-first full-test homework/runtime launch proof and contract repair

Implementation evidence:

- `src/services/reading-v2/readingV2PublishPipeline.service.ts` now persists master student-safe, session-safe, and review projections for composition-first full-test publish, not only child passage projections.
- `src/pages/StudentHomeworkDetailPage.tsx` now hydrates Reading V2 homework summary from student-readable `tests/{materialId}` plus `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}` instead of owner-only `reading_v2/material_metadata/{materialId}`.
- `functions/src/readingV2SubmitCore.ts` and `r2-backup-worker/src/reading-v2/submit.ts` both support composition-first trusted submit/scoring from child passage snapshots/review projections without requiring embedded master payload.

Live proof:

- Homework `8RB8mFCRIAmJz0u7kZR1` for published material `studio-material-mq9ja0zj` opened on `http://localhost:5174/student/homework/8RB8mFCRIAmJz0u7kZR1`.
- Detail rendered title `IELTS Reading-v2 Test - June 2026 (1)`, `40 questions`, and `Resume Attempt`.
- Resume opened `http://localhost:5174/student/practice/studio-material-mq9ja0zj` and rendered Reading V2 runtime with three parts.
- No `Permission denied`.
- No `Reading V2 launch requires a published projection.`

RTDB proof:

- `reading_v2/projections/student_safe_tests/studio-material-mq9ja0zj:snapshot-studio-material-mq9ja0zj-mq9jave7`
- `reading_v2/projections/session_test_payloads/publish-template:snapshot-studio-material-mq9ja0zj-mq9jave7`
- `reading_v2/projections/review/studio-material-mq9ja0zj:snapshot-studio-material-mq9ja0zj-mq9jave7`
- all three existed with `sections=3` and `totalQuestionCount=40`

Obsolete interpretation retired:

- child passage projections alone are enough for published full-test student launch
- student homework detail may read owner-only namespaced metadata as part of launch setup
  - `reading_v2/projections/review/{passageMaterialId}:{snapshotVersionId}`
  - `reading_v2/material_metadata/{passageMaterialId}`
  - `material_catalog/material_indexes/*` rows
- Master output for extracted full-test publishes no longer stages the master embedded `published_snapshots/{masterMaterialId}/{snapshotVersionId}` or master student/review projections. The master publish plan stages ref-only `full_test_compositions` and `full_test_composition_versions` plus master metadata/index compatibility rows.
- Ref-only guard remains enforced through `assertReadingV2RefOnlyFullTestComposition()` before composition storage writes.
- Same-source idempotency is preserved through deterministic generated ids from `source testMaterialId + sourceSnapshotVersionId + order`, covered by the new idempotency test.
- Extracted passages still pass standalone publish-gate validation before storage writes through `extractReadingV2PassageMaterials()` and per-passage `assertReadingV2PublishGate()` path.
- Firebase adapter maps the resulting commit plan into one root multi-location update and now proves generated duplicate-index rows are included while master embedded snapshot/projection paths are absent.

### Phase 2B Implementation Evidence

- PRD-0054 duplicate guard/index from Packet 2 is consumed by `src/services/reading-v2/readingV2PublishPipeline.service.ts`.
- Auto-split duplicate checks use `findReadingV2PassageDuplicateMatches()` and safe candidate text built from the extracted passage candidate, not broad canonical payload scans or answer-key comparison.
- Generated passage duplicate index rows are written through `buildReadingV2DuplicateIndexRow()` at `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`.
- Duplicate warnings are warning-only and return `blockPublish: false`.
- Active rows and the teacher's own archived rows are covered in tests. The warning actions include `use-existing`, `restore-and-use`, and `create-new-anyway`.
- `duplicateIndexStatus: 'missing' | 'stale'` blocks auto-split publish with a typed error and no canonical-scan fallback.

### Files Changed In Packet 3

- `src/services/reading-v2/readingV2PublishPipeline.service.ts`
- `src/services/reading-v2/readingV2PublishPipeline.service.test.ts`
- `src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts`
- `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/handoff-0052-0054-packet-3.md`

### Deferred / Still Blocked

- Packet 3 did not implement published master modal UI, Test Creation Modal existing-passage flow, assignment freeze/refresh UI, archive UI, repair UI, or Book repair UI.
- PRD-0054 master repair remains `BLOCKED` until later PRD-0052 phases create `ReadingV2MasterEditModal` and Phase 8 marks the dependency `READY`.
- Browser proof was not applicable to Packet 3 because only service/storage tests and docs changed.

### Tests Run

RED then PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2PassageDuplicateGuard.service.test.ts --reporter=basic
```

Initial RED result: duplicate-warning fixture text did not match the extracted candidate shingle source, so no warning was produced. Fixed the test fixture to use the same safe body/question text shape as publish integration.

Final PASS result: 3 files passed, 27 tests passed.

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

## Packet 4 Findings - Published Master Modal And Draft Creation

- Packet: 4 - PRD-0052 Published Master Modal And Draft Creation
- Date/time: 2026-06-10 08:42:47 +07:00
- Scope completed: PRD-0052 Part 2 Phase 3 and Phase 4 only.

### Implementation Evidence

- Added `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx` and `src/components/reading-v2/master/ReadingV2MasterEditModal.css`.
- Added modal modes for published masters and unpublished drafts. The modal edits master title, visibility, passage ref order, owned-passage Studio handoff, refresh-version callback, save-draft callback, and publish callback.
- Added `src/components/reading-v2/master/ReadingV2MasterPassagePicker.tsx`.
- Picker lists only published, unarchived, selectable Reading Passage projection rows and does not hydrate canonical passage payloads.
- Added `createReadingV2TeacherSelectedPassageDraft()` in `src/services/reading-v2/readingV2TeacherComposition.service.ts`.
- Draft creation writes only ref-based full-test composition draft paths, rejects draft/archived/inaccessible/missing-snapshot rows, and does not publish snapshots, legacy `tests`, or student-safe projections.
- Updated Teacher Lobby published Reading V2 full-test composition `Edit` action to open `ReadingV2MasterEditModal` in published mode instead of full-test Studio.
- Updated Teacher Lobby selected Reading Passage full-test creation to create an unpublished draft master and open the modal in draft mode.
- Updated Test Creation Modal Reading V2 start choices with `Use existing Reading Passages`, which closes the wizard and hands metadata back to Teacher Lobby without navigating to published full-test Studio.
- Registered master-modal and existing-passage workflow action names in `src/config/featureRegistry.ts`.

### Files Changed In Packet 4

- `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`
- `src/components/reading-v2/master/ReadingV2MasterEditModal.css`
- `src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx`
- `src/components/reading-v2/master/ReadingV2MasterPassagePicker.tsx`
- `src/components/reading-v2/master/ReadingV2MasterPassagePicker.test.tsx`
- `src/services/reading-v2/readingV2TeacherComposition.service.ts`
- `src/services/reading-v2/readingV2TeacherComposition.service.test.ts`
- `src/pages/TeacherLobbyPage.jsx`
- `src/pages/TeacherLobbyPage.test.jsx`
- `src/components/test-creation/TestCreationModal.tsx`
- `src/components/test-creation/TestCreationModal.test.tsx`
- `src/config/featureRegistry.ts`
- `src/config/featureRegistry.test.ts`
- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/handoff-0052-0054-packet-4.md`

### Deferred / Still Blocked

- Assignment freeze UI, update references modal, archive UI, restore UI, repair UI, and Book repair UI were not implemented.
- Modal save/publish callbacks are wired as UI/event seams only. Durable update-reference, assignment-freeze, archive/restore, and repair behaviors remain for later packets.
- `TestCreationModal.tsx` no longer imports `@mantine/core`; Packet 4 replaced the touched file's `Modal` and `Text` usage with lightweight local components after audit.

### Tests Run

RED then PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/reading-v2/master/ReadingV2MasterPassagePicker.test.tsx src/pages/TeacherLobbyPage.test.jsx src/components/test-creation/TestCreationModal.test.tsx src/config/featureRegistry.test.ts --reporter=basic
```

Initial RED result:

- `FEATURE_IDS` missing from `featureRegistry.test.ts` import.
- `createReadingV2TeacherSelectedPassageDraft()` missing.
- `ReadingV2MasterEditModal` and `ReadingV2MasterPassagePicker` missing.
- Teacher Lobby still opened published Reading V2 master rows in Studio.
- Test Creation Modal did not expose `Use existing Reading Passages`.

Final PASS result:

- 6 test files passed.
- 95 tests passed.

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

## Packet 5 Findings - Update References, Assignment Freeze, Runtime, Result, Handoff

- Packet: 5 - PRD-0052 Update References, Assignment Freeze, Runtime, Result, Handoff
- Status: `COMPLETE`
- Date/time: 2026-06-10 10:46:00 +07:00
- Scope attempted: PRD-0052 Part 2 Phase 5, Phase 6, Phase 7, and Phase 8 only.

### Implementation Evidence

- Added pure update-reference owner: `src/services/reading-v2/readingV2ReferenceUpdate.service.ts`.
- Added update-reference UI owner: `src/components/reading-v2/master/ReadingV2UpdateReferencesModal.tsx`.
- Added durable update-reference repository owner: `src/services/reading-v2/readingV2ReferenceUpdateRepository.service.ts`.
- Added Firebase repository factory: `src/services/reading-v2/readingV2ReferenceUpdateFirebaseRepository.service.ts`.
- Update-reference service finds owned master refs and owned Book material refs that still point at the previous single-passage snapshot version.
- Update-reference service excludes non-owned refs, already-current refs, frozen assignments, and result snapshots from mutation.
- Update-reference apply path updates only explicitly selected master/book targets and reports skipped target ids plus immutable frozen assignment/result counts.
- Book target ids include the material ref id (`book:{bookId}:{nodeId}:{refId}`), so selecting one Book ref does not imply updating every ref in the node.
- `src/pages/ReadingV2StudioPage.tsx` and `src/components/reading-v2/studio/ReadingV2StudioModalAdapter.tsx` now discover update targets after a revised single-passage publish and open `ReadingV2UpdateReferencesModal` only when owned references need explicit teacher action.
- The modal starts with all update targets unchecked and supports explicit skip without writing references.
- Added assignment payload storage path: `reading_v2/projections/assignment_payloads/{homeworkId}:{compositionVersionId}` through `readingV2StoragePaths.assignmentPayloads()`.
- Added assignment-freeze helpers in `src/services/reading-v2/readingV2PassageHomework.service.ts`:
  - `createReadingV2MasterHomeworkSet()`
  - `createReadingV2AssignmentPayload()`
  - `assertReadingV2AssignmentCanRefresh()`
  - `refreshReadingV2MasterAssignment()`
- Refresh-before-start now uses submission records only. Any real `startedAt` value or active/completed submission status blocks refresh.
- Refresh write order is payload first, then homework pointer patch. Optional cleanup hook can remove the payload if the homework pointer write fails.
- Added durable assignment refresh adapter: `src/services/reading-v2/readingV2AssignmentRefreshRepository.service.ts`.
- `src/pages/TeacherHomeworkDetailPage.tsx` now exposes a composition-backed Reading V2 refresh-before-start control and calls `refreshReadingV2MasterAssignmentFromLatest()`.
- Teacher Homework Detail refresh uses raw `homework_submissions` records from `useHomeworkDetail`, not UI summary rows.
- Runtime read path in `src/pages/StudentPracticePage.tsx` now prefers `homework.readingPassageSet.assignmentPayloadPath` for Reading Passage sets before falling back to legacy recomposition from individual student-safe passage projections.
- RTDB rules added `reading_v2/projections/assignment_payloads/{assignmentPayloadId}` as a sanitized student-readable frozen runtime projection path.
- Operational matrix added `assignmentPayloads`.
- Feature registry added Packet 5 action ids for update references, assignment refresh, frozen runtime, and frozen result review.

### Blocked / Not Complete

- None for Packet 5 blocker scope.
- Archive UI, restore UI, repair UI, Book repair UI, and later PRD-0054 packets were intentionally not implemented.
- Result review already uses saved review payload/frozen submission data from earlier packets; Packet 5 only added registry coverage and did not add a new result-review runtime path.

### Browser Proof

- Started Vite on `http://localhost:5173/`.
- In-app browser loaded `http://localhost:5173/` and resolved to `http://localhost:5173/lobby`.
- Browser DOM proof showed title `Materials | MySTUdent Workspace`, Teacher Lobby tabs, and the Materials list.
- Direct route probe opened `http://localhost:5173/teacher/homework` with no captured console errors, but live fixture data did not render a specific homework detail record.
- Console warnings on the lobby were limited to pre-existing Mantine rule warnings for unrelated files:
  - `src/components/ClassSelectionModal.jsx`
  - `src/components/UseAsIsModal.jsx`

### Tests Run

PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2ReferenceUpdate.service.test.ts src/services/reading-v2/readingV2ReferenceUpdateRepository.service.test.ts src/components/reading-v2/master/ReadingV2UpdateReferencesModal.test.tsx src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2AssignmentRefreshRepository.service.test.ts src/pages/TeacherHomeworkDetailPage.test.tsx --reporter=basic
```

Result: 8 files passed, 27 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2ReferenceUpdate.service.test.ts src/services/reading-v2/readingV2ReferenceUpdateRepository.service.test.ts src/components/reading-v2/master/ReadingV2UpdateReferencesModal.test.tsx src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2AssignmentRefreshRepository.service.test.ts src/pages/TeacherHomeworkDetailPage.test.tsx src/config/featureRegistry.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/components/results/ReadingV2ReviewContentAdapter.test.tsx src/readingV2SubmitCore.test.ts src/pages/StudentPracticePage.test.tsx --reporter=basic
```

Result: 13 files passed, 69 tests passed, 7 Firebase emulator behavior tests skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set.

BLOCKED / not useful:

```powershell
cmd /c npx tsc --noEmit
```

Result: failed on pre-existing repo-wide TypeScript errors, including academic record, assignment Mantine prop usage, student navigation route typing, THCS validator nullability, result services, listening builder, and duplicate identifiers in `src/types/solo.types.ts`. A focused filter after local type fixes showed no Packet 5 matches for `ReadingV2StudioModalAdapter`, `ReadingV2StudioPage`, `TeacherHomeworkDetailPage`, `readingV2ReferenceUpdate`, `readingV2AssignmentRefresh`, or `readingV2StudioWorkflow`.

BLOCKED / not useful:

```powershell
cmd /c npx eslint src/services/reading-v2/readingV2ReferenceUpdate.service.ts src/components/reading-v2/master/ReadingV2UpdateReferencesModal.tsx src/services/reading-v2/readingV2PassageHomework.service.ts src/pages/StudentPracticePage.tsx src/config/featureRegistry.ts src/services/reading-v2/readingV2OperationalMatrix.ts
```

Result: repo ESLint config parsed TypeScript as plain JavaScript and failed on `interface`/typed import syntax for every targeted TypeScript file.

PASS:

```powershell
cmd /c npm run check:utf8 -- src/services/reading-v2/readingV2ReferenceUpdate.service.ts src/services/reading-v2/readingV2ReferenceUpdate.service.test.ts src/components/reading-v2/master/ReadingV2UpdateReferencesModal.tsx src/components/reading-v2/master/ReadingV2UpdateReferencesModal.test.tsx src/components/reading-v2/master/ReadingV2MasterEditModal.css src/services/reading-v2/readingV2PassageHomework.service.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2StoragePaths.service.ts src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2OperationalMatrix.ts src/pages/StudentPracticePage.tsx src/types/homework.types.ts src/config/featureRegistry.ts src/config/featureRegistry.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts database.rules.json documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/handoff-0052-0054-packet-5.md
```

Result: UTF-8 check passed for 19 text files.

PASS:

```powershell
git diff --check
```

Result: no whitespace errors.

## Packet 6 Dependency Note - PRD-0054 Archive Data And Broken Reference Services

- Packet: 6 - PRD-0054 Archive Data And Broken Reference Services
- Status: `COMPLETE` for PRD-0054 Phase 2 and Phase 3 service/guard scope.
- Date/time: 2026-06-10 13:18:09 +07:00
- PRD-0052 dependency impact: no PRD-0052 UI or master modal repair UI was implemented in Packet 6.

### Cross-PRD Evidence

- PRD-0052 ref-only master storage from earlier packets was consumed by `src/services/reading-v2/readingV2BrokenReference.service.ts`.
- `src/services/reading-v2/readingV2PassageHomework.service.ts` now blocks assignment of removed/archived or broken current master compositions before freezing new homework payloads.
- `src/services/reading-v2/readingV2LaunchIntegration.service.ts` now blocks current live master launches when metadata says removed/archived or unresolved broken refs remain.
- Frozen assignment payload launch remains protected by the `assignmentManifest` bypass in the launch guard; student launch paths do not write broken-ref summary state.
- `src/services/reading-v2/readingV2PublishPipeline.service.ts` now blocks optional current master publish attempts when unresolved broken refs remain before creating writes.
- `src/services/reading-v2/readingV2TeacherComposition.service.ts` now owns soft master remove through `removeReadingV2MasterComposition()` and leaves linked Reading Passage materials unchanged.

### Deferred To Later Packets

- `ReadingV2MasterEditModal` repair actions remain deferred to Packet 7.
- Teacher Lobby archive/restore UI remains deferred to Packet 7.
- Book repair UI and duplicate warning UI remain deferred to Packet 8.
- No old assignments or completed results were mutated in Packet 6.

### Verification

PASS:

```powershell
cmd /c npx vitest run src/types/materialCatalog.types.test.ts src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts src/services/reading-v2/readingV2BrokenReference.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/materialCatalogFirebaseRules.test.ts --reporter=basic
```

Result: 10 files passed, 90 tests passed, 13 Firebase emulator behavior tests skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set.

## Packet 7 Dependency Note - PRD-0054 Archive UI And Master Repair UI

- Packet: 7 - PRD-0054 Archive UI And Master Repair UI
- Status: `COMPLETE` for PRD-0054 Phase 4 and Phase 5 UI/test implementation.
- Date/time: 2026-06-10 13:54:07 +07:00
- PRD-0052 dependency impact: `ReadingV2MasterEditModal` now owns broken master repair UI; healthy full-test/passage edit flows still use the existing PRD-0052 modal paths.

### Cross-PRD Evidence

- `ReadingV2MasterEditModal` now blocks publish while unresolved broken refs remain.
- Repair actions are modal-local and do not route broken master repair through full-test Studio.
- `Remake manually` opens single-passage Studio with the originating broken ref context.
- Numbering review is shown before publish when repair changes total question count.
- Normal `Update references?` modal remains separate from broken-ref remake repair.
- Teacher Lobby Reading Passage archive/restore UI now consumes Packet 6 archive services.

### Verification

PASS:

```powershell
cmd /c npx vitest run src/components/modern/SearchFilterBar.test.jsx src/components/modern/materialListAdapter.test.js src/pages/TeacherLobbyPage.test.jsx src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/reading-v2/master/ReadingV2MasterRepairPanel.test.tsx src/config/featureRegistry.test.ts --reporter=basic
```

Result: 6 files passed, 71 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2BrokenReference.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts --reporter=basic
```

Result: 3 files passed, 14 tests passed.

### Browser Evidence

- `http://localhost:5173/lobby` was opened with Teacher dev session.
- Active Reading Passage tab rendered `Private`, `Public`, `Archive`, and active `Remove from library` actions.
- Archive confirmation opened in-app with usage counts and safety copy; it was cancelled to avoid mutating live dev data.
- Archive subtab read was blocked by live rules/data with `Permission denied`.
- Visible live Reading V2 master rows opened `Edit Reading V2 master`; current live rows had no passage refs/broken refs, so browser could not prove broken-ref repair without seeding live data.

### Deferred To Later Packets

- Packet 8 Book repair UI and duplicate-warning UI remain out of scope.
- Packet 9 cross-surface final verification remains out of scope.

## Packet 8 Dependency Note - PRD-0054 Book Repair And Duplicate Warning Surfaces

- Packet: 8 - PRD-0054 Book Repair And Duplicate Warning Surfaces
- Status: `COMPLETE` for Packet 8 implementation/test/browser-proof scope.
- Date/time: 2026-06-10 15:08:52 +07:00
- PRD-0052 dependency impact: duplicate warnings now surface through the existing Reading V2 Studio shell and Teacher Lobby modal adapter publish path. The PRD-0052 modal route contract remains intact; no Book editor route page was introduced.

### Cross-PRD Evidence

- `ReadingV2StudioModalAdapter` now preserves `duplicateWarnings` from the publish workflow result and passes them into `ReadingV2StudioShell`.
- `ReadingV2StudioShell` renders a non-blocking duplicate warning panel after publish, emits warning/action events, and exposes only safe duplicate metadata: material id, title, state, similarity percent, and allowed actions.
- Duplicate warning actions are UI-owned: `Use existing`, `Restore and use`, and `Create new anyway`.
- The duplicate formula and duplicate index remain owned by the Phase 1B guard service; Packet 8 does not reimplement similarity or scan canonical payloads.
- Book repair remains in the existing Book editor modal, preserving Overview, Content, and Settings tabs.

### Browser Evidence

- Browser surface: in-app Browser was attempted first, but its DOM snapshot returned an empty body after reload while local app telemetry logs flooded the bridge. Chrome DevTools MCP was used for reliable localhost DOM proof.
- URL: `http://localhost:5173/lobby`.
- Book modal proof: opened Book tab, selected `Testing Book`, clicked `Edit`, and verified dialog `Testing Book` stayed on `/lobby` with Content tab selected and region `Book broken refs` showing `All Book refs are usable.`
- Duplicate warning proof: opened `http://localhost:5173/__smoke/reading-v2-studio?fixture=task-true-false-not-given&duplicateWarning=both`, clicked `Publish`, and verified `Published successfully` plus status region `Duplicate Reading Passage warning` with `non-blocking`, active and archived matches, `Use existing`, `Restore and use`, and `Create new anyway`.
- Screenshots:
  - `artifacts/packet-8-book-repair-modal.png`
  - `artifacts/packet-8-book-repair-modal-mobile.png`
  - `artifacts/packet-8-duplicate-warning.png`
  - `artifacts/packet-8-duplicate-warning-mobile.png`

### Verification

PASS:

```powershell
cmd /c npx vitest run src/pages/ReadingV2StudioSmokePage.test.tsx src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/bookEditor.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/modern/BookCardGrid.test.jsx src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx src/components/reading-v2/studio/ReadingV2DuplicateWarningPanel.test.tsx src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx --reporter=basic
```

Result: 10 files passed, 66 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/components/books/BookEditorModal.test.tsx --reporter=basic
```

Result: 1 file passed, 8 tests passed.

PASS:

```powershell
cmd /c npm run check:utf8 -- documentation/tasks/handoff-0052-0054-packet-8.md
```

Result: UTF-8 check passed for 1 text file after final handoff update. Earlier full Packet 8 UTF-8 check passed for 33 text files.

PASS:

```powershell
git diff --check
```

Result: no whitespace errors.

### Remaining PRD-0052 Notes

- Packet 9 still owns final cross-surface assignment/runtime/result/security proof.
- No PRD-0052 full-test Studio replacement was made for Book repair or duplicate warnings.

### Follow-up Mock Data Added For Book Browser Testing

- Added dev/test-only Book editor smoke route: `http://localhost:5173/__smoke/book-editor`.
- Main fixtures:
  - `fixture=healthy`
  - `fixture=broken-refs`
  - `fixture=non-owned-archived-ref`
  - `fixture=all-broken-ref-reasons`
- Browser proof now covers owned archived restore visibility, non-owned restore hiding, all broken-ref reason labels, and unsafe mock payload non-exposure without mutating live Firebase data.
- Screenshots:
  - `artifacts/book-editor-smoke-all-broken-ref-reasons.png`
  - `artifacts/book-editor-smoke-non-owned-archived.png`
- Verification: `cmd /c npx vitest run src/pages/BookEditorSmokePage.test.tsx src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookEditorModal.test.tsx src/config/featureRegistry.test.ts --reporter=basic` passed with 4 files and 38 tests.
- Final Packet 8 verification: `cmd /c npx vitest run src/pages/BookEditorSmokePage.test.tsx src/pages/ReadingV2StudioSmokePage.test.tsx src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/bookEditor.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/modern/BookCardGrid.test.jsx src/components/books/BookEditorModal.test.tsx src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx src/components/reading-v2/studio/ReadingV2DuplicateWarningPanel.test.tsx src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx src/config/featureRegistry.test.ts --reporter=basic` passed with 13 files and 91 tests.

## Packet 9 Final Integration Sweep - PRD-0052

- Packet: 9 - PRD-0054 Safety Sweep, Docs, And Final Integration
- Date/time: 2026-06-10 18:36-22:27 +07:00
- Status: `COMPLETE`

### Safety Evidence

- Assignment/runtime now prefers the pinned Reading Passage set `assignmentPayloadPath` and fails closed when the frozen assignment payload is missing.
- `readingV2LaunchIntegration.service.test.ts` proves broken current source projections do not break a frozen assignment manifest.
- `StudentPracticePage.test.tsx` proves Reading Passage set homework reads `reading_v2/assignment_payloads/...` before current `student_safe_tests` paths.
- `StudentPracticePage.test.tsx` proves a missing frozen assignment payload renders the error state instead of launching from current source projections.
- Result/review tests prove frozen review projections remain the result source after archive/restore/repair changes.

### Targeted Tests

- PASS: publish/composition command, 6 files and 42 tests.
- PASS: auto-split duplicate-index command, 2 files and 22 tests.
- PASS: master modal and creation command, 5 files and 82 tests.
- PASS: assignment/runtime/result command, 8 files and 68 tests.
- PASS: equivalent submit-core command `cmd /c npx vitest run src/__tests__/readingV2PassageSetSubmitCore.test.ts --reporter=basic`, 1 file and 2 tests. The tasklist path `functions/src/readingV2SubmitCore.test.ts` is not present in this checkout.
- PASS: routes, registry, rules command, 5 files and 95 tests, 11 emulator-gated skipped.

### Browser Evidence

Browser surface: Chrome DevTools MCP on exact `http://localhost:5173/`. Teacher dev session was already active at `/lobby`, so no manual credentials were entered.

- Surface: Teacher Lobby Reading Passage active list.
  - URL: `http://localhost:5173/lobby`.
  - Viewports: 1366 x 900, 848 x 900, 375 x 812, 320 x 812.
  - IDs: teacher `glMHCrzMnyS6AqFcb9I0nlOqQ6X2`; visible Reading Passage rows include `IELTS Cambridge 20 - Test 1: Reading - Source unknown`, `PRD0052 QA Reading V2 Full Test 2026-06-03 - Source unknown`.
  - Expected: active Reading Passage list excludes archived rows and exposes reversible `Remove from library` action.
  - Actual: PASS at desktop/tablet; active list showed 6 Reading Passage rows, `Private/Public/Archive` scope buttons, and `Remove from library` actions. Mobile 375/320 had no horizontal overflow; action text is icon/hidden responsive UI.
  - Screenshots: `artifacts/packet-9-browser-proof/01-lobby-reading-passage-active-1366.png`, `10-lobby-reading-passage-active-848.png`, `11-lobby-reading-passage-active-375-mobile.png`, `12-lobby-reading-passage-active-320-mobile.png`.
- Surface: PRD-0052 duplicate warning after publish.
  - URL: `http://localhost:5173/__smoke/reading-v2-studio?fixture=task-true-false-not-given&duplicateWarning=both`.
  - Viewports: 1366 x 900, 375 x 812, 320 x 812.
  - IDs: draft `smoke-reading-v2-valid-true-false-not-given`; new passage `smoke-new-passage-1`; matches `smoke-duplicate-active`, `smoke-duplicate-archived`.
  - Expected: publish completes, duplicate warning is non-blocking, active match offers `Use existing`, archived match offers `Restore and use`, both offer `Create new anyway`.
  - Actual: PASS. After `Publish`, status showed `Published successfully`; warning showed `Existing active passage` at 94 percent, `Archived matching passage` at 91 percent, `Use existing`, `Restore and use`, and `Create new anyway`.
  - Screenshots: `artifacts/packet-9-browser-proof/07-studio-duplicate-warning-1366.png`, `08-studio-duplicate-warning-375-mobile.png`, `09-studio-duplicate-warning-320-mobile.png`.
- Surface: live assignment/runtime/result frozen proof after source archive/restore.
  - Browser surface: Chrome DevTools MCP. In-app browser API attach timed out during final proof setup, so Chrome DevTools was used and recorded here.
  - URL: `http://localhost:5174/student/homework`; runtime URL `http://localhost:5174/student/practice/reading-passage-set:packet9-live-20260610151227-hw-launch`.
  - Viewport: 1440 x 759, DPR 2.
  - IDs: teacher `glMHCrzMnyS6AqFcb9I0nlOqQ6X2`; student `x3hDfjYVN7cJtSbwq0ChIjl1Bk62`; passage `packet9-live-20260610151227-passage`; homework launch `packet9-live-20260610151227-hw-launch`; homework result `packet9-live-20260610151227-hw-result`; result `packet9-live-20260610151227-result`.
  - Expected: archived/restored source does not break assigned homework or submitted result; Student can launch frozen assignment payload and open frozen result review.
  - Actual: PASS. Student quick-login opened homework list, `Packet 9 Frozen Homework 20260610151227` showed a frozen Reading Passage set card, runtime loaded `Reading V2 Runtime Shell` with title `Packet 9 Frozen Homework 20260610151227` and question text `The Packet 9 payload is`, and result panel loaded `100%`, `1/1`, `9.0` band score.
  - Screenshots: `artifacts/packet-9-browser-proof/20-student-homework-frozen-cards-5174.png`, `21-student-frozen-runtime-5174.png`, `22-student-frozen-result-panel-5174.png`.

Console/network notes: no app errors on touched proof surfaces. Console had existing accessibility form-field issues and existing Rule 15 Mantine warnings for unrelated loaded files `EditTestFrame.tsx` and `WritingTestEditModal.tsx`.

### Final PRD-0052 Acceptance Status

- Targeted tests: PASS.
- Duplicate warning dependency: PASS.
- Runtime/result frozen safety: PASS by tests.
- Browser proof: PASS for the Packet 9 acceptance surfaces after explicit approval to create disposable live dev data.
- Final acceptance checkbox may be claimed for assignment refresh, student runtime, and frozen-result review.

### Live Fixes Found During Final Proof

- Live archive failed before final fix because audit payload included optional `adminOverride: undefined`; `buildReadingV2AuditEvent` now strips undefined optional fields before validation and write.
- Live Archive subtab failed before final fix because `database.rules.json` allowed archived-row reads but not owner reads on the parent `material_archive_indexes/by_owner/$ownerId/reading-passage` node. Parent read coverage is now implemented and tested.
- Rules were deployed to `temp-a1437` with `firebase deploy --only "database,firestore:rules" --project temp-a1437` and later `firebase deploy --only "database" --project temp-a1437`.

## Packet 10 Follow-up Closure - PRD-0052

- Packet: 10 follow-up - PRD-0052/0054 E2E Foundation Repair
- Date/time: 2026-06-11 18:24:13 +07:00
- Status: `COMPLETE`

### Live Master Compatibility Repair

- Root cause: live `PRD0052 QA Reading V2 Full Test 2026-06-03` had a valid full-test composition available, but material/test compatibility metadata did not expose the composition id that Teacher Lobby uses to hydrate the published master modal.
- Repair: backfilled the live material metadata and legacy test metadata composition id fields to the existing full-test composition id. The id value is intentionally omitted from this findings file.
- Result: `Edit` from `http://localhost:5173/lobby` opens `Edit Reading V2 master` with 3 version-linked refs, question counts 13/13/14, and `Open single-passage Studio` actions.
- Evidence: `artifacts/e2e-prd-0052-0054/packet10-followup-live-master-resolved-5173.png`.

### Assignment Guard Proof

- Disposable fixture: `e2e-prd0052-0054-broken-assignment-20260611-1820`.
- Command: `npx vite-node --mode development tmp/prd0052-0054-live-broken-assignment-proof.ts`.
- Result: broken current master assignment refresh blocked before projection writes or homework update.
- Counts: write attempt count 0; homework update attempt count 0.

### Focused Verification

PASS:

```powershell
npx vitest run src/services/reading-v2/readingV2AssignmentRefreshRepository.service.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts --reporter=basic
```

Result: 3 files passed, 22 tests passed.

PASS:

```powershell
npx vitest run src/services/reading-v2/readingV2MaterialMetadata.service.test.ts src/services/reading-v2/readingV2PassageExtraction.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2TeacherLobbyMaterials.service.test.ts src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts src/services/reading-v2/readingV2AssignmentRefreshRepository.service.test.ts src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/reading-v2/master/ReadingV2MasterRepairPanel.test.tsx src/components/reading-v2/master/ReadingV2MasterPassagePicker.test.tsx src/components/reading-v2/master/ReadingV2UpdateReferencesModal.test.tsx src/services/reading-v2/readingV2BrokenReference.service.test.ts src/services/reading-v2/readingV2ReferenceUpdate.service.test.ts src/services/reading-v2/readingV2ReferenceUpdateRepository.service.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/pages/TeacherLobbyPage.test.jsx src/pages/StudentPracticePage.test.tsx src/components/results/SharedSavedResultCore.test.tsx --reporter=basic
```

Result: 20 files passed, 162 tests passed.

### Final PRD-0052 Acceptance Status

- Published master modal ready-state live proof: PASS.
- Assignment broken-current-master guard: PASS.
- Frozen runtime/result behavior: PASS by prior browser proof and current focused tests.
- Final acceptance remains satisfied. No PRD-0052 Part 2 blocker remains.
