# E2E Findings - PRD-0052/0054 User Experience

Date: 2026-06-11
Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
Firebase project: `temp-a1437`
Artifact directory: `artifacts/e2e-prd-0052-0054/`

## 0. Addendum - 2026-06-13 Student Launch Closure

Follow-up repair after this report closed another real student-facing gap for composition-first full Reading V2 homework.

Fixed:

- `StudentHomeworkDetailPage` no longer reads owner-only `reading_v2/material_metadata/{materialId}` for student launch preparation.
- Composition-first full-test publish now persists master student-safe, session-safe, and review projections in addition to child passage projections.
- Student homework launch for published full test `IELTS Reading-v2 Test - June 2026 (1)` now loads details, shows `40 questions`, exposes `Resume Attempt`, and opens runtime with no `Permission denied` and no `Reading V2 launch requires a published projection.`

Proof summary:

- Browser flow on `localhost:5174` succeeded for homework detail and runtime launch.
- RTDB proof showed master student-safe, session-safe, and review projections for `studio-material-mq9ja0zj` with `sections=3` and `totalQuestionCount=40`.
- Targeted suites passed across `StudentHomeworkDetailPage`, `StudentPracticePage`, `readingV2LaunchIntegration`, publish pipeline, Worker submit, and Functions submit core.

Obsolete after 2026-06-13:

- using this E2E report as evidence that composition-first full-test student homework still fails for missing published projection
- treating student-facing namespaced metadata read as acceptable launch-prep behavior

## 1. Executive Assessment

Overall status after Packet 10 follow-up: PASS for PRD-0052 Part 2 and PRD-0054 scoped acceptance.

Original E2E baseline status: FAIL.

Release confidence: medium. Packet 10 and its follow-up removed unsafe archive/restore write order, made lifecycle retry proof live-safe, repaired the live PRD0052 QA master compatibility metadata, blocked unsafe assignment refresh for broken current masters, repaired frozen Reading V2 result-review UI, and clarified archive usage wording.

Top blockers:

- Fixed: Published `PRD0052 QA Reading V2 Full Test 2026-06-03` now resolves three version-linked passage refs in the Edit Reading V2 master modal after compatibility metadata migration.
- Fixed: Archive/restore retry proof now runs on disposable live fixture `e2e-prd0052-0054-20260611-1811`; archive twice and restore twice complete through atomic RTDB updates with no immutable snapshot mutation.
- Fixed: Broken current master assignment refresh now blocks before projection writes or homework updates on disposable live fixture `e2e-prd0052-0054-broken-assignment-20260611-1820`.
- Fixed: Student frozen result panel for `packet9-live-20260610151227-result` now renders Reading V2 grouped review content and no longer shows the legacy empty-question message.
- Fixed in UI/tests: Archive confirmation wording now says active assignment blockers and keeps frozen work as preserved history, instead of ambiguous `assigned homework`.
- Out of scope release hygiene: Student runtime console previously showed Rule 15/Mantine warnings in unrelated loaded files and repeated class-membership index warnings.

Packet 10 evidence:

- RED tests failed as expected for archive atomic update, published master fail-closed state, Reading V2 result empty-state suppression, and archive wording.
- GREEN tests passed: 5 files, 75 tests.
- Chrome proof:
  - `packet10-chrome-published-master-fail-closed.png`
  - `packet10-followup-live-master-resolved-5173.png`
  - `packet10-chrome-student-review-fixed-redacted.png`
  - `packet10-chrome-student-review-fixed-375-redacted.png`
  - `packet10-browser-diagnostics.md`
- Live proof:
  - `npx vite-node --mode development tmp/prd0052-0054-live-archive-restore-proof.ts`
  - `npx vite-node --mode development tmp/prd0052-0054-live-broken-assignment-proof.ts`

## 2. Test Matrix

| Surface | Status | Evidence |
|---|---:|---|
| Teacher login and Teacher Lobby Reading V2 navigation | PASS_WITH_RISKS | `01-teacher-initial-1366.png`, `03-teacher-lobby-loaded-1366.png`, `04-reading-passage-active-1366.png`, Chrome snapshot |
| PRD-0052 full-test split into standalone passages and ref-only master | PASS | Standalone passage rows visible; live PRD0052 QA master now opens with three version-linked refs after compatibility migration: `packet10-followup-live-master-resolved-5173.png` |
| Published full-test master Edit Test Modal | PASS | Packet 10 blocks unsafe publish when refs are absent; follow-up proves live master ready state with 3 resolved refs and enabled single-passage actions |
| Draft master creation from existing Reading Passages | PASS_WITH_TESTS | Covered by Test Creation Modal, picker, and master modal regression tests; no extra live draft was created in follow-up |
| Single-passage edit from master slot and Update References modal | PASS_WITH_TESTS | Live master exposes `Open single-passage Studio` actions; update-reference behavior covered by focused modal/service tests |
| Homework assignment freeze and refresh-before-start | PASS_WITH_RISKS | Existing disposable frozen homework opens: `11-student-frozen-homework-1366.png`; archive usage summary misses it |
| Student runtime from frozen Reading Passage set | PASS_WITH_RISKS | `12-student-frozen-runtime-1366.png`, `13-student-frozen-runtime-375.png`, `14-student-frozen-runtime-320.png` |
| Student submission and result/review from frozen payload | PASS_WITH_RISKS | Packet 10 browser proof renders grouped review; screenshots redacted: `packet10-chrome-student-review-fixed-redacted.png`, `packet10-chrome-student-review-fixed-375-redacted.png` |
| Reading Passage archive and restore | PASS | Disposable live fixture archive twice/restore twice proof passed with 4 distinct audit rows and no immutable snapshot mutation |
| Archive effects on lists, pickers, assignment eligibility, frozen work | PASS | Archive/restore lifecycle tests and live retry proof cover index state; broken current master assignment refresh blocks before writes |
| Duplicate warning surfaces | PASS_WITH_LIMITS | Smoke page shows active/archived duplicates and actions: `18-duplicate-warning-decisions-1366.png`; decision buttons had no visible post-click feedback |
| Broken master reference detection, repair, numbering review, publish block | PASS_WITH_TESTS | Master repair UI/service tests cover broken refs, numbering review, publish block, and repair actions; live broken assignment proof covers fail-closed current master guard |
| Broken Book reference detection and repair | PASS_WITH_LIMITS | Smoke coverage: `responsive-book-1366.png`, `responsive-book-848.png`, `responsive-book-375.png`, `responsive-book-320.png` |
| Assignment block for archived/broken materials | PASS | Broken current master refresh live proof blocks before projection writes/homework update; Book smoke still covers broken selected material |
| Audit events for state-changing actions | PASS | Archive/restore retry proof created 4 distinct append-only audit events through atomic RTDB updates |
| Observability-only events stay observability-only | PASS_WITH_LIMITS | Chrome network captured `feature_used` for remove request; no audit event created by view/cancel path |
| Security/rules behavior for new paths | PASS | Targeted rules tests pass and live retry proof no longer exposes append-only audit idempotency drift |

## 3. Detailed Workflow Evidence

### Teacher Auth And Lobby

- Role: teacher
- URL: `http://localhost:5173/lobby`
- Path: login page -> bottom-right dev quick-login settings -> `Teacher` -> lobby.
- Expected: Teacher lobby opens on exact port 5173.
- Actual: PASS. Lobby opened and showed `Materials`, `Reading Passage`, `Book`, and Reading V2 rows.
- Console/network: Playwright run had only Google Analytics aborted requests; Chrome run had no console errors for passive lobby navigation.
- Evidence: `03-teacher-lobby-loaded-1366.png`, `04-reading-passage-active-1366.png`.

### Archive/Restore Lifecycle

- Role: teacher
- URL: `http://localhost:5173/lobby`
- IDs: teacher `glMHCrzMnyS6AqFcb9I0nlOqQ6X2`; passage `packet9-live-20260610151227-passage`; snapshot `packet9-live-20260610151227-snapshot-v1`.
- Expected: Archive subtab lists archived passage; restore succeeds or fails without partial state; audit event writes once per state-changing action.
- Actual: FAIL.
  - Archive subtab initially showed `Packet 9 Live Safety Passage 20260610151227` and restore dialog opened.
  - Clicking `Restore as Private` displayed `Reading Passages unavailable` and `Failed to restore Reading Passage.`
  - Console error: `set at /reading_v2/audit_events/glMHCrzMnyS6AqFcb9I0nlOqQ6X2:packet9-live-20260610151227-passage:private:restore:reading_passage_restored:packet9-live-20260610151227-passage failed: permission_denied`.
  - Firebase shallow read after the failure showed archive index path as `null`.
  - Fresh Chrome and Playwright sessions then showed the passage in the active Private list with updated date `Jun 11, 2026`.
- Evidence:
  - `05-reading-passage-archive-1366.png`
  - `06-restore-confirmation-1366.png`
  - `08-restore-permission-denied-1366.png`
  - `19-partial-restore-actually-active-1366.png`
  - `22-chrome-reading-passage-active-after-partial-restore.png`
  - `firebase-archive-index-shallow.json`
  - `firebase-known-restore-audit.json`

Packet 10 reassessment:

- Code fix: archive/restore now build one RTDB multi-location update containing material state, active/archive indexes, and append-only audit event.
- Audit event ids now include the action timestamp suffix, so repeated UI attempts do not reuse the same audit key.
- Regression proof: `readingV2PassageArchive.service.test.ts` verifies one `update()` call and no sequential `write()`/`remove()` calls.
- Follow-up live retry proof: disposable fixture `e2e-prd0052-0054-20260611-1811` was archived twice and restored twice.
- Proof result: archive changed path counts were 15 then 11; restore changed path counts were 17 then 16; 4 distinct audit rows were created; immutable snapshot paths touched were 0.
- Retry behavior: second archive removed 0 active index paths because state was already archived; second restore skipped archive-index removal when it was already absent and still restored active indexes idempotently.

### Archive Confirmation Usage Summary

- Role: teacher
- URL: `http://localhost:5173/lobby`
- Expected: Disposable passage used by known frozen homework/result should not imply no usage unless "assigned homework" intentionally means active, unfrozen future assignments only.
- Actual: The archive dialog showed `0 affected masters`, `0 affected Books`, `0 assigned homework`, followed by generic frozen-work reassurance.
- Evidence: `20-archive-confirmation-1366.png`, `23-chrome-archive-dialog-usage-zero.png`.

Packet 10 reassessment:

- Current regression status: PASS_WITH_RISKS. Dialog now labels the count as active assignment blockers and separately says existing assigned work and saved results remain available from frozen snapshots.
- Live browser proof was not reachable in this run because the authenticated teacher session did not expose the Reading Passage content tab under current feature capability state.

### Published Master Edit Modal

- Role: teacher
- URL: `http://localhost:5173/lobby`
- Material: `PRD0052 QA Reading V2 Full Test 2026-06-03`
- Expected: Published 40-question master opens Edit Test Modal with passage refs, version status, repair affordances if any refs are broken, and publish blocked when unresolved.
- Actual: FAIL. Modal showed `Published master`, title and visibility, but body showed `No passage references yet.` `Publish Master` remained enabled. This prevented single-passage edit from master slot, Update References modal, broken-ref repair, numbering review, and publish-block proof on real data.
- Evidence: `09-published-master-edit-modal-1366.png`, `24-chrome-published-master-no-refs.png`.

Packet 10 reassessment:

- Current actual: PASS. Teacher Lobby now attempts to hydrate `reading_v2/full_test_compositions/{compositionId}` before replacing modal state with resolved refs.
- If live composition refs are still absent, the modal displays `Published master references are not loaded` and disables `Publish Master`.
- Follow-up repair: live metadata/test compatibility fields for `PRD0052 QA Reading V2 Full Test 2026-06-03` were migrated to the existing full-test composition id.
- Browser proof: the live master modal now resolves 3 version-linked refs with 13/13/14 question counts and `Open single-passage Studio` actions.
- Evidence: `packet10-chrome-published-master-fail-closed.png`, then `packet10-followup-live-master-resolved-5173.png`.

### Duplicate Warning

- Role: teacher smoke fixture
- URL: `http://localhost:5173/__smoke/reading-v2-studio?fixture=task-true-false-not-given&duplicateWarning=both`
- Expected: Warning shows active duplicate, owned archived duplicate, `Use existing`, `Restore and use`, and `Create new anyway`.
- Actual: PASS_WITH_LIMITS. Warning appeared after `Publish`. It showed active match at 94%, archived match at 91%, and all expected decision buttons. Clicking decision buttons did not visibly dismiss or add feedback in the smoke harness.
- Evidence: `17-duplicate-warning-both-1366.png`, `18-duplicate-warning-decisions-1366.png`.

### Book Broken Reference Repair

- Role: teacher smoke fixture
- URL: `http://localhost:5173/__smoke/book-editor`
- Expected: Existing Book editor modal/workspace keeps Overview/Content/Settings contract and shows broken-ref repair states without horizontal overflow.
- Actual: PASS_WITH_LIMITS. Smoke page rendered all broken-ref reasons and repair-oriented states across 1366, 848, 375, and 320 widths with no document-level horizontal overflow.
- Evidence: `responsive-book-1366.png`, `responsive-book-848.png`, `responsive-book-375.png`, `responsive-book-320.png`.

### Student Frozen Homework And Runtime

- Role: student
- URLs:
  - `http://localhost:5174/student/homework/packet9-live-20260610151227-hw-launch`
  - `http://localhost:5174/student/practice/reading-passage-set:packet9-live-20260610151227-hw-launch`
- IDs: student `x3hDfjYVN7cJtSbwq0ChIjl1Bk62`; homework launch `packet9-live-20260610151227-hw-launch`; result `packet9-live-20260610151227-result`.
- Expected: Frozen homework opens even after source archive/restore history; runtime uses frozen Reading Passage set.
- Actual: PASS_WITH_RISKS. Homework detail opened and runtime showed the frozen passage text/question. 375 and 320 width checks had no document-level horizontal overflow.
- Console warnings:
  - Repeated `[Courses DEBUG] getStudentClasses: membership index was incomplete...`.
  - Rule 15 warnings for `src/hooks/solo/useSoloTimer.ts`, `src/components/test/SoloSettingsModal.tsx`, and `src/components/practice/THCSPracticeView.tsx`.
- Evidence: `11-student-frozen-homework-1366.png`, `12-student-frozen-runtime-1366.png`, `13-student-frozen-runtime-375.png`, `14-student-frozen-runtime-320.png`.

### Student Frozen Result Review

- Role: student
- URL: `http://localhost:5174/student/academic-record?result=packet9-live-20260610151227-result`
- Expected: Result/review uses frozen result projection and shows reviewable question-level detail without exposing hidden payloads.
- Actual: FAIL. Result panel opened and showed score `100%`, `1/1`, `9.0`, but review body displayed `No question results available for this test.`
- Evidence: `15-student-academic-record-1366.png`, `16-student-frozen-result-review-1366.png`.

Packet 10 reassessment:

- Current actual: PASS_WITH_RISKS. `SharedSavedResultCore` no longer renders the legacy empty-question state for Reading V2 results; `ReadingV2ReviewContentAdapter` owns the review body.
- Browser proof on `http://localhost:5174/student/academic-record?result=packet9-live-20260610151227-result` showed Reading Passage Set Review, task group title, score row, and no legacy empty text.
- Screenshots were redacted before capture to avoid exposing student answers or answer keys.
- Evidence: `packet10-chrome-student-review-fixed-redacted.png`, `packet10-chrome-student-review-fixed-375-redacted.png`.

## 4. Diagnostic Logs And Data Paths

Browser tools used:

- Playwright headless via Node REPL for repeatable screenshots, console logs, request-failure capture, and viewport checks.
- Chrome DevTools plugin for independent real Chrome snapshot, network, console, and screenshot evidence.
- Browser plugin was requested, but no Browser automation tool was exposed by tool search in this session; Chrome DevTools was used where plugin-backed browser proof was available.

Ports:

- Teacher: `http://localhost:5173`
- Student: `http://localhost:5174`

Firebase/RTDB paths inspected:

- `reading_v2/audit_events` shallow: `firebase-audit-events-shallow.json`
- `reading_v2/audit_events/glMHCrzMnyS6AqFcb9I0nlOqQ6X2:packet9-live-20260610151227-passage:private:restore:reading_passage_restored:packet9-live-20260610151227-passage`: `firebase-known-restore-audit.json`
- `material_catalog/material_archive_indexes/by_owner/glMHCrzMnyS6AqFcb9I0nlOqQ6X2/reading-passage` shallow: `firebase-archive-index-shallow.json`

Security tests:

- Command saved in `targeted-security-tests.log`.
- Result: 4 files passed, 37 tests passed, 17 skipped.
- Note: passing rules tests did not catch the live deterministic audit id retry failure because that is an idempotency/write-order behavior, not a basic allow/deny case.

## 5. Failure Analysis And Root-Cause Hypotheses

### F1 - Restore Fails Visibly But Mutates State

Severity: blocker

Repro:

1. Open `http://localhost:5173/lobby` as teacher.
2. Click `Reading Passage`.
3. Click `Archive`.
4. Click `Restore` on `Packet 9 Live Safety Passage 20260610151227`.
5. Click `Restore as Private`.

User-visible failure:

- UI shows `Reading Passages unavailable` and `Failed to restore Reading Passage.`
- Later, active list shows the passage restored anyway.

Evidence:

- Screenshot: `08-restore-permission-denied-1366.png`
- Active after failure: `19-partial-restore-actually-active-1366.png`, `22-chrome-reading-passage-active-after-partial-restore.png`
- Console: permission denied writing deterministic restore audit id.
- RTDB shallow archive index: `null`.
- Existing audit row: `firebase-known-restore-audit.json`.

Owner:

- `src/services/reading-v2/readingV2PassageArchive.service.ts`
- `src/services/reading-v2/readingV2AuditTrail.service.ts`
- `database.rules.json`

Suspected root cause:

- `writeAudit()` uses deterministic `auditEventId(correlationId, action, materialId)`.
- Retrying the same restore action reuses an existing audit key.
- Rules correctly require append-only `!data.exists()`.
- Restore service writes material/index state and removes archive index before audit write.
- Audit failure therefore leaves partial mutation and false failure UX.

Foundational fix:

- Make archive/restore idempotent and atomic at service boundary.
- Either write audit first with a unique event id per attempt, or perform a single RTDB multi-location update where all state/index/audit writes succeed or fail together.
- If deterministic event ids are retained, treat existing same event as idempotent success only after verifying target state and payload hash.
- Add live-style integration test: retry restore after existing audit event must not partial-mutate and must show correct UI result.

Hotfix or PRD:

- Needs PRD/tasklist or focused foundation fix, not a small UI hotfix.

Packet 10 implementation:

- Implemented focused foundation fix in `src/services/reading-v2/readingV2PassageArchive.service.ts`.
- Archive/restore write plan is now atomic at RTDB `update()` boundary.
- Existing audit rows no longer cause partial state mutation because a rejected append-only audit path rejects the whole multi-location update.
- Follow-up hardened the command boundary with owner-readable preflight state, retry-safe active/archive index writes, duplicate-index state updates when the row exists, and live archive/restore retry proof on a disposable fixture.

### F2 - Published Master Modal Loses Passage References

Severity: high

Repro:

1. Open `http://localhost:5173/lobby` as teacher.
2. On `My Content`, locate `PRD0052 QA Reading V2 Full Test 2026-06-03`.
3. Click `Edit`.

User-visible failure:

- Modal for a 40-question Reading V2 master says `No passage references yet.`
- `Publish Master` remains enabled.

Evidence:

- `09-published-master-edit-modal-1366.png`
- `24-chrome-published-master-no-refs.png`

Owner:

- `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`
- `src/services/reading-v2/readingV2TeacherComposition.service.ts`
- `src/pages/TeacherLobbyPage.jsx`

Suspected root cause:

- Listing row and modal load from different models. Listing identifies material as Reading V2 full test with 40 questions, but modal cannot resolve its composition refs or is opening a legacy/non-composition master without a compatibility guard.

Foundational fix:

- Add an explicit composition-load state model: loaded with refs, legacy/non-composition incompatible, missing composition, and broken refs.
- Disable `Publish Master` when loaded ref count is zero for a published master with nonzero questions unless user is intentionally creating a new draft.
- Surface a migration/repair path instead of empty editable master.

Hotfix or PRD:

- Needs PRD/tasklist because it affects master storage compatibility and publish safety.

Packet 10 implementation:

- Implemented resolver and fail-closed modal state in `src/pages/TeacherLobbyPage.jsx` and `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`.
- Regression test proves canonical composition hydration works when `reading_v2/full_test_compositions/{compositionId}` has refs.
- Follow-up migrated the live PRD0052 QA master compatibility metadata and browser-proofed the ready state with three resolved refs.

### F3 - Frozen Result Review Has No Question Results

Severity: high

Repro:

1. Login as student on `http://localhost:5174`.
2. Open `http://localhost:5174/student/academic-record`.
3. Click `Packet 9 Frozen Homework 20260610151227`.

User-visible failure:

- Result panel shows score summary but says `No question results available for this test.`

Evidence:

- `16-student-frozen-result-review-1366.png`

Owner:

- `src/components/results/ReadingV2ReviewContentAdapter.tsx`
- `src/services/reading-v2/readingV2ResultAdapter.service.ts`
- `src/components/results/SharedSavedResultCore.tsx`

Suspected root cause:

- Frozen result summary and question-level review projection are not aligned for homework result `packet9-live-20260610151227-result`, or result panel is falling back to shared core without Reading V2 question map hydration.

Foundational fix:

- Add result-projection contract test against fixture shape used by `AcademicRecordPage`.
- Require saved Reading V2 homework result to provide question rows/review rows when score is `1/1`.
- Add UI state for "summary exists but question detail missing" with diagnostic id, not generic empty state.

Hotfix or PRD:

- Needs tasklist/foundation fix. Not safe as UI-only copy change.

Packet 10 implementation:

- Implemented UI boundary fix in `src/components/results/SharedSavedResultCore.tsx`.
- Reading V2 review payload now suppresses the legacy generic empty state and lets the adapter render grouped frozen review content.

### F4 - Archive Dialog Usage Summary Misses Frozen Homework

Severity: medium

Repro:

1. Ensure `packet9-live-20260610151227-passage` is active.
2. Click `Remove from library`.

User-visible failure:

- Dialog says `0 assigned homework`, despite fixture having `packet9-live-20260610151227-hw-launch` and result evidence.

Evidence:

- `20-archive-confirmation-1366.png`
- `23-chrome-archive-dialog-usage-zero.png`

Owner:

- `src/pages/TeacherLobbyPage.jsx`
- `src/services/reading-v2/readingV2PassageArchive.service.ts`

Suspected root cause:

- Usage summary only counts live current references, not assignment-pinned/frozen homework references. The wording reads like all assignments.

Foundational fix:

- Split usage labels: active editable references, active homework assignment blockers, and frozen historical homework/results.
- If frozen assignments intentionally do not block archive, show `Frozen assignments/results preserved` with a count or omit `assigned homework` count unless scoped.

Hotfix or PRD:

- Safe UX hotfix after product wording decision; data count fix may need service work.

Packet 10 implementation:

- Implemented wording fix in `src/pages/TeacherLobbyPage.jsx`.
- UI now distinguishes active assignment blockers from preserved frozen assignments/results.

## 6. Recommended Foundational Fixes

1. Rework archive/restore as atomic/idempotent lifecycle commands.
   - One write plan, one commit boundary, audit included.
   - Unique audit event ids per attempt or verified idempotent reuse.
   - UI should not reload to an error state after partial success.
   - Packet 10 status: implemented at service boundary and live retry-proofed on disposable fixture.

2. Add live retry tests for audit-required state changes.
   - Archive twice and restore twice are live-proofed. Repair and duplicate decisions are covered by focused tests/smoke proof and should be repeated live only with disposable fixtures.
   - Assert no partial index/state drift when audit create is denied.

3. Harden master modal load states.
   - Empty refs for nonempty published master must be a blocking incompatible/missing-composition state.
   - Publish disabled until ref model is valid.
   - Packet 10 status: implemented and live PRD0052 QA fixture migrated/proofed.

4. Align result summary and question-review projections.
   - Academic Record result panel must verify question-level data for Reading V2 before showing normal score UI.
   - Missing review rows should carry result id and projection path diagnostics.
   - Packet 10 status: implemented UI boundary fix and browser-proofed on preserved result.

5. Clarify archive usage summary semantics.
   - Separate "active references that will break future use" from "frozen assignments/results preserved."
   - Packet 10 status: implemented wording fix; active blocker count still depends on listing row index.

6. Treat Rule 15 console warnings in student runtime as release hygiene.
   - Not caused by PRD-0052/0054, but they appear in the tested student flow and should not be normal in QA.

## 7. Residual Risks

- No non-disposable live broken master was destructively edited. Broken master repair remains proven by focused service/UI tests and live fail-closed assignment proof on a disposable broken fixture.
- No new student submission was made in the Packet 10 follow-up; existing disposable result review proof from Packet 10 remains the browser evidence for frozen result rendering.
- Duplicate decision buttons were visible in smoke proof, but the smoke harness did not provide visible post-click feedback beyond action logging.
- Prior student runtime console warnings for unrelated Mantine/Rule 15 files and class-membership indexes remain release hygiene outside PRD-0052/0054 completion.

## 8. Appendix

### Commands Run

```powershell
npm run dev -- --host localhost --port 5173
npm run dev -- --host localhost --port 5174
npx firebase database:get /reading_v2/audit_events --project temp-a1437 --shallow
npx firebase database:get /material_catalog/material_archive_indexes/by_owner/glMHCrzMnyS6AqFcb9I0nlOqQ6X2/reading-passage --project temp-a1437 --shallow
npx firebase database:get /reading_v2/audit_events/glMHCrzMnyS6AqFcb9I0nlOqQ6X2:packet9-live-20260610151227-passage:private:restore:reading_passage_restored:packet9-live-20260610151227-passage --project temp-a1437 --json
npx vitest run src/services/reading-v2/readingV2AuditTrail.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/materialCatalogFirebaseRules.test.ts src/__tests__/security/homeworkFirestoreRules.test.ts --reporter=basic
npx vitest run src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/results/SharedSavedResultCore.test.tsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic
npx vite-node --mode development tmp/prd0052-0054-live-archive-restore-proof.ts
npx vite-node --mode development tmp/prd0052-0054-live-broken-assignment-proof.ts
npx vitest run src/services/reading-v2/readingV2MaterialMetadata.service.test.ts src/services/reading-v2/readingV2PassageExtraction.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2TeacherLobbyMaterials.service.test.ts src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts src/services/reading-v2/readingV2AssignmentRefreshRepository.service.test.ts src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/reading-v2/master/ReadingV2MasterRepairPanel.test.tsx src/components/reading-v2/master/ReadingV2MasterPassagePicker.test.tsx src/components/reading-v2/master/ReadingV2UpdateReferencesModal.test.tsx src/services/reading-v2/readingV2BrokenReference.service.test.ts src/services/reading-v2/readingV2ReferenceUpdate.service.test.ts src/services/reading-v2/readingV2ReferenceUpdateRepository.service.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/pages/TeacherLobbyPage.test.jsx src/pages/StudentPracticePage.test.tsx src/components/results/SharedSavedResultCore.test.tsx --reporter=basic
```

### Browser Artifacts

All screenshots and logs are under `artifacts/e2e-prd-0052-0054/`.

Key screenshots:

- `08-restore-permission-denied-1366.png`
- `19-partial-restore-actually-active-1366.png`
- `22-chrome-reading-passage-active-after-partial-restore.png`
- `23-chrome-archive-dialog-usage-zero.png`
- `24-chrome-published-master-no-refs.png`
- `packet10-chrome-published-master-fail-closed.png`
- `packet10-followup-live-master-resolved-5173.png`
- `packet10-chrome-student-review-fixed-redacted.png`
- `packet10-chrome-student-review-fixed-375-redacted.png`
- `packet10-browser-diagnostics.md`
- `12-student-frozen-runtime-1366.png`
- `13-student-frozen-runtime-375.png`
- `14-student-frozen-runtime-320.png`
- `16-student-frozen-result-review-1366.png`
- `18-duplicate-warning-decisions-1366.png`

### Sensitive Data Handling

Screenshots avoid exposing answer keys beyond visible UI labels already rendered in smoke/runtime pages. No broad canonical payloads, student answer payloads, scoring rules, AI evidence, hidden provenance, import evidence, or secrets were copied into this report.
