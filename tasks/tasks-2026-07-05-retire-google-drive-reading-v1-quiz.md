# Task List: Google Drive, Reading V1, and Quiz Retirement

Status: Reviewed execution task list. No implementation, deletion, purge, commit, push, PR, deployment, or remote mutation is authorized by this task list alone.

Created: 2026-07-05

Source plan: `docs/superpowers/plans/2026-07-05-retire-google-drive-reading-v1-quiz.md`

Canonical task-list path:
`tasks/tasks-2026-07-05-retire-google-drive-reading-v1-quiz.md`

Generated from:
- Direct codebase scan on branch `codex/remove-drive-reading-v1-quiz`
- Existing tasklist style in PRD-0054 and PRD-0055
- Retirement plan decisions for Google Drive, Reading V1, Quiz, result preservation, purge boundaries, and remote gates

## Execution Contract

- [ ] Treat the source plan as the product and architecture authority.
- [ ] Treat this tasklist as the implementation execution checklist.
- [ ] Complete phases in order unless this tasklist explicitly permits parallel work.
- [ ] Do not implement the whole plan in one Codex run.
- [ ] Start with Phase 0 only unless the product owner explicitly authorizes the next phase.
- [ ] Stop at every HARD STOP and report evidence, tests, changed paths, unresolved risks, and next recommended phase.
- [ ] Do not mutate Firebase data until the remote purge gate explicitly authorizes it.
- [ ] Do not run any purge command with `--apply` until the product owner has reviewed the inspection manifest and explicitly approved destructive purge.
- [ ] Do not delete R2 objects directly from retirement tooling.
- [ ] Do not delete completed academic results or result indexes.
- [ ] Do not delete, rewrite, or migrate users' Google Drive files.
- [ ] Do not create a retired-material tombstone database.
- [ ] Do not implement Reading V1-to-V2 migration or Quiz export/migration.
- [ ] Do not deploy Firebase rules before purge readback passes.
- [ ] Do not stage, commit, push, create PR, merge, deploy, or remote-purge without separate explicit approval.
- [ ] Use exact-path staging only after review if staging is later authorized.
- [ ] At each HARD STOP, reconcile this task list, the append-only findings file, relevant-file inventory, changed paths, and test evidence before claiming phase completion.
- [ ] Mark a subtask complete only after its evidence exists. Mark a parent phase complete only after every child task passes and any separately approved checkpoint commit is complete.
- [ ] At each HARD STOP, propose an exact-path checkpoint commit. Do not accumulate many approved phases in one uncommitted working tree.
- [ ] Preserve unrelated user file `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`; do not edit, stage, commit, or claim it.
- [ ] Keep raw conversations, exported transcripts, archived evidence, generated artifacts, and historical proof unchanged.
- [ ] Before each parent phase is marked complete, append evidence to the findings file with exact commands, test results, changed paths, blockers, and deferred residue.

## Must-Read Before Coding

- [x] Read `AGENTS.md`.
- [x] Read `CONTEXT.md`.
- [x] Read `docs/superpowers/plans/2026-07-05-retire-google-drive-reading-v1-quiz.md`.
- [x] Read `docs/adr/0001-retired-material-purge-boundary.md`.
- [x] Read `documentation/architecture/upload-storage-authority.md`.
- [x] Read `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md`.
- [x] Read `documentation/tasks/process-task-list.md`.
- [x] Read `documentation/rules/infrastructure.md` before Firebase, Worker, rule, storage, manifest, purge, or deployment work.
- [x] Read `documentation/rules/codebase-hygiene.md` before deleting files, changing producer/consumer storage paths, or touching files importing `@mantine/*`.
- [x] Read `documentation/rules/observability.md` before adding or changing retirement notice actions, launch-block actions, or return controls.
- [x] Read `documentation/rules/navigation.md` before route, redirect, link, or return-target work.
- [x] Read `documentation/rules/react-patterns.md` before component, async effect, loading, or error-state work.
- [x] Read root `DESIGN.md` and `documentation/architecture/ui-design-standards.md` before Phase 3, Phase 7, or any UI/UX change.
- [x] Read `documentation/rules/mobile-portability.md` before browser API, local storage, route-state, or runtime-shell work.
- [x] Read `documentation/rules/student-data-loading.md` before student homework, runtime, result, or Answer Review data changes.
- [x] Read `documentation/rules/student-mobile-design.md` if any student runtime, result, route, drawer, overlay, list, or mobile error state changes.
- [x] Read `documentation/architecture/homework-solo-practice-architecture.md`.
- [x] Read `documentation/architecture/student-test-delivery-projections.md`.
- [x] Read `documentation/architecture/reading-v2-runtime-integrations.md`.
- [x] Read `documentation/architecture/ielts-reading-v2-listening-unification.md`.
- [x] Read `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` for retained Reading V2 and Listening boundaries.

## Relevant Files

- `docs/superpowers/plans/2026-07-05-retire-google-drive-reading-v1-quiz.md` - Master retirement implementation plan.
- `tasks/tasks-2026-07-05-retire-google-drive-reading-v1-quiz.md` - Canonical implementation execution checklist.
- `docs/adr/0001-retired-material-purge-boundary.md` - Purge boundary authority.
- `documentation/architecture/upload-storage-authority.md` - R2 storage authority and no-direct-R2-delete boundary.
- `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md` - PRD-0055 closure lessons relevant to staged execution and proof.
- `tasks/findings-of-tasks-2026-07-05-retire-google-drive-reading-v1-quiz.md` - Append-only findings/evidence file to create in Phase 0.
- `scripts/end-active-sessions.mjs` - Existing active-session closure script.
- `scripts/__tests__/end-active-sessions.test.mjs` - Existing active-session closure tests.
- `package.json` - Add only missing retirement commands after the matching scripts exist.
- `package-lock.json` - Lockfile for dev-only lint parser package baseline.
- `eslint.config.js` - Repo-wide ESLint parser, ignore, and rule-baseline config.
- `vitest.config.ts` - Test-discovery config; Phase 1 includes scripts tests in focused Vitest runs.
- `src/config/readingV2FeatureFlags.ts` - Canonical Reading V2 engine marker owner. Reuse `READING_V2_ENGINE_FIELDS` and `isReadingV2Payload`.
- `src/services/retirement/retiredMaterialClassifier.ts` - New classifier owner.
- `src/services/retirement/retiredMaterialClassifier.test.ts` - New classifier tests.
- `scripts/lib/retiredMaterialInventory.ts` - New shared read-only inventory/manifest module.
- `scripts/inspect-retired-materials.ts` - New read-only inspection command.
- `scripts/purge-retired-materials.ts` - New destructive purge command, gated by reviewed manifest and `--apply`.
- `scripts/__tests__/retired-material-inventory.test.ts` - Inventory/manifest tests.
- `scripts/__tests__/purge-retired-materials.test.ts` - Purge safety tests.
- `src/services/googleDrive.js` - Retired Drive service candidate.
- `src/services/googleDrive.d.ts` - Retired Drive type declaration candidate.
- `src/services/googleDriveAudio.ts` - Retired Drive audio service candidate.
- `src/config/env.config.ts` - Drive client ID removal target.
- `src/config/env.config.test.ts` - Environment schema regression tests.
- `env.example.txt` - Drive environment example removal target.
- `src/skills/listening/components/AudioPlayer.tsx` - Listening playback owner; remove Drive branch and preserve R2/authorized delivery.
- `src/skills/listening/components/AudioPlayer.test.tsx` - Playback regression tests.
- `src/skills/listening/components/ListeningHeader.tsx` - Listening header stale Drive-comment cleanup target.
- `src/skills/listening/builders/ListeningTestBuilder.tsx` - Listening authoring consumer to inspect for Drive assumptions.
- `src/skills/listening/builders/ListeningTestBuilder.test.tsx` - Listening authoring tests.
- `src/services/listeningTestStorage.ts` - Listening persistence owner to inspect for Drive-backed material eligibility.
- `src/skills/reading/components/ReadingTestPage.tsx` - Legacy Reading V1 runtime removal target.
- `src/skills/reading/components/index.ts` - Legacy Reading V1 export target if no supported consumer remains.
- `src/skills/reading/**` - Legacy Reading V1 area; delete only after dependency scan proves no supported consumer.
- `src/pages/TestPageRouter.tsx` - Live runtime router; remove Reading V1 fallback and Quiz assumptions; fail closed for invalid or permission-denied test-mode reads.
- `src/pages/TestPageRouter.test.tsx` - Live runtime routing and invalid/permission-state tests.
- `src/pages/StudentPracticePage.tsx` - Solo/homework/course runtime router; remove Reading V1 fallback and material-id inference.
- `src/pages/StudentPracticePage.test.tsx` - Practice routing tests.
- `src/components/practice/IELTSPracticeView` - Legacy Reading V1 practice owner to inspect before deletion.
- `src/components/practice/ListeningPracticeView.tsx` - Protected Listening practice runtime.
- `src/components/practice/ListeningPracticeView.test.tsx` - Protected Listening practice tests.
- `src/components/writing-practice/WritingPracticeView` - Protected Writing practice runtime.
- `src/components/writing-practice/WritingPracticeView.test.tsx` - Protected Writing practice tests.
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx` - Protected Reading V2 runtime tests.
- `src/components/thcs-student/**` - Protected THCS runtime/review components.
- `src/components/test-creation/TestCreationModal.tsx` - Teacher creation option owner.
- `src/components/test-creation/TestCreationModal.test.tsx` - Teacher creation option tests.
- `src/pages/TeacherLobbyPage.jsx` - Teacher material actions and assignment entry owner.
- `src/pages/AdminMaterialsPage.tsx` - Admin material action owner.
- `src/components/course/MaterialSelectorModal.tsx` - Course/module material selector owner.
- `src/components/course/MaterialSelectorModal.test.tsx` - Course/module material selector tests.
- `src/components/homework/HomeworkCreateModal.tsx` - Homework assignment material selector owner.
- `src/components/homework/HomeworkCreateModal.test.tsx` - Homework assignment material selector tests.
- `src/services/sessionManager.js` - Live session creation and Quiz/Test mode owner.
- `src/services/sessionHelpers.js` - Live session compatibility owner.
- `src/hooks/monitor/useMonitorSession.ts` - Teacher live-session monitor state owner; permission-denied listener errors must stop loading and show unavailable state.
- `src/hooks/monitor/useMonitorSession.test.ts` - Teacher live-session monitor invalid/permission-state regression tests.
- `src/services/classManager.ts` - Class assignment API owner; Phase 6 rejects new Quiz assignment requests.
- `src/services/notificationService.ts` - Session notification payload owner.
- `src/services/resultsService.ts` - Shared result service; retained Quiz result DTO compatibility owner.
- `src/services/firebaseQueryOptimizer.js` - Material query/cache owner.
- `src/services/firebaseQueryOptimizer.test.js` - Material query/cache regression tests.
- `src/services/dataCache.js` - Cache type owner.
- `src/services/homeworkManager.ts` - Homework creation material-type default owner.
- `src/services/homeworkManager.test.ts` - Homework service regression tests.
- `src/services/navigation.service.ts` - Legacy session-status route owner.
- `src/services/navigation.service.test.ts` - Navigation service regression tests.
- `src/components/session/CreateSessionModal.tsx` - Visible live-session creation modal owner.
- `src/components/session/CreateSessionModal.test.tsx` - Visible live-session creation modal tests.
- `src/components/SessionBanner.jsx` - Teacher live-session banner owner.
- `src/components/SessionBanner.css` - Teacher live-session banner styles.
- `src/pages/GuestJoinPage.jsx` - Public guest join flow owner.
- `src/pages/StudentWaitingRoomPage.jsx` - Student waiting/rejoin flow owner.
- `src/pages/StudentWaitingRoomPage.test.jsx` - Student waiting/rejoin regression tests.
- `src/pages/StudentClassDetailPage.jsx` - Class assignment launch owner; retired Quiz assignments route to notice without player-session writes.
- `src/components/layout/StudentSidebar.tsx` - Student navigation typing owner touched only to preserve RouteName type safety after adding the generic material-unavailable route constant.
- `src/pages/AdminDashboardPage.tsx` - Admin material dashboard summary owner.
- `src/pages/AdminMigrationPage.tsx` - Ownership migration UI owner.
- `src/pages/AdminSessionsPage.tsx` - Admin active-session table owner.
- `src/pages/SessionManagementPage.tsx` - Session management table owner.
- `src/routes/studentRoutes.tsx` - Student route owner, including dedicated Quiz URL and generic material-unavailable URL.
- `src/routes/studentRoutes.test.tsx` - Student dedicated Quiz retirement and generic material-unavailable route tests.
- `src/routes/teacherRoutes.tsx` - Teacher route owner, including dedicated Quiz URL and generic material-unavailable URL.
- `src/routes/teacherRoutes.test.tsx` - Teacher dedicated Quiz retirement and generic material-unavailable route tests.
- `src/constants/routes.ts` - Route constants owner.
- `src/constants/routes.test.ts` - Route constant tests if present or to add if required.
- `src/config/featureRegistry.ts` - Observability route/action registry owner, including generic material-unavailable route/action mapping.
- `src/config/featureRegistry.test.ts` - Registry tests, including generic material-unavailable routing.
- `src/pages/RetiredMaterialNoticePage.tsx` - Native retirement notice page for dedicated retired URLs and generic missing-material URLs.
- `src/pages/RetiredMaterialNoticePage.test.tsx` - Retirement notice copy, route-helper, tracking, and generic unavailable-state tests.
- `src/pages/StudentQuizPageNew.jsx` - Quiz gameplay removal or retirement target.
- `src/pages/StudentQuizPage.jsx` - Legacy Quiz gameplay removal target.
- `src/pages/TeacherQuizPage.jsx` - Teacher Quiz removal target.
- `src/components/QuizEditor.jsx` - Quiz editor removal target.
- `src/deprecated/quiz/**` - Deprecated Quiz removal target.
- `scripts/inspect-firebase-quizzes.js` - Quiz-only inspection script to retire after new inventory tool replaces necessary inspection.
- `scripts/debug-quiz.js` - Quiz debug script removal target.
- `public/debug-quiz-helper.js` - Quiz debug helper removal target.
- `src/services/resultFeedbackPayload.service.ts` - Feedback payload source-loading owner; must support `sourceMaterialRemoved`.
- `src/services/resultFeedbackPayload.service.test.ts` - Feedback payload removed-source and Reading V2 regression tests.
- `src/services/resultSourceMaterialRemoval.ts` - Pure retained-result removed-source marker and purge-facing preservation contract.
- `src/services/resultSourceMaterialRemoval.test.ts` - Removed-source marker and preservation contract tests.
- `src/services/testResults.service.ts` - Saved result contract owner.
- `src/types/results.types.ts` - Saved result type owner.
- `src/services/academicRecordService.ts` - Academic Record query/summary owner.
- `src/pages/StudentTestResultsPage.tsx` - Student result surface.
- `src/pages/StudentTestResultsPage.test.tsx` - Student result removed-source regression tests.
- `src/pages/TeacherTestResultsPage.tsx` - Teacher result surface.
- `src/pages/TeacherTestResultsPage.test.tsx` - Teacher result removed-source source-load regression tests.
- `src/pages/AcademicRecordPage.test.tsx` - Academic Record retained-result summary regression tests.
- `src/components/results/ReviewTab.tsx` - Saved-result review surface.
- `src/components/results/ReviewTab.test.tsx` - Saved-answer removed-source review tests.
- `src/components/results/SharedSavedResultCore.tsx` - Saved-result core surface.
- `src/components/results/SharedSavedResultCore.test.tsx` - Saved-result core removed-source/audio and Reading V2 review tests.
- `src/components/results/ResultDetailModal.tsx` - Result detail surface if present.
- `src/components/results/ResultDetailModal.test.tsx` - Teacher modal retained removed-source result tests.
- `src/components/results/ReadingV2ReviewContentAdapter.tsx` - Protected Reading V2 review adapter.
- `database.rules.json` - RTDB rule cleanup target after local purge tooling and tests.
- `src/__tests__/security/retired-material-rules.emulator.test.ts` - Phase 9 local RTDB structural and emulator-backed security regression tests.
- `src/routes/teacherRoutes.tsx` - Teacher retired Quiz notice route authorization.
- `src/routes/teacherRoutes.test.tsx` - Teacher retired Quiz route authorization assertions.
- `src/routes/studentRoutes.test.tsx` - Student retired Quiz route authorization assertions.
- `src/types/class.types.ts` - Active class/test assignment type surface with Quiz removed from new active assignments.
- `firestore.rules` - Firestore rule cleanup target only if inspection proves a relevant Quiz/homework/result rule path.
- `src/__tests__/security/**` - Emulator/security tests.

## Known Current Anchors

Inspect these before editing and record exact line notes in the findings file.

- [ ] Google Drive runtime/config remains present:
  - `src/services/googleDrive.js`
  - `src/services/googleDriveAudio.ts`
  - `src/services/googleDrive.d.ts`
  - `src/config/env.config.ts`
  - `env.example.txt`
  - `src/skills/listening/components/AudioPlayer.tsx`
- [ ] Reading V1 entry/runtime remains present:
  - `src/components/test-creation/TestCreationModal.tsx`
  - `src/pages/TestPageRouter.tsx`
  - `src/pages/StudentPracticePage.tsx`
  - `src/skills/reading/components/ReadingTestPage.tsx`
  - `src/skills/reading/components/index.ts`
  - `src/__tests__/integration/ReadingTestPage.test.tsx`
- [ ] Reading V2 protection anchors exist:
  - `src/config/readingV2FeatureFlags.ts`
  - `src/services/reading-v2/readingV2LaunchIntegration.service.ts`
  - `src/components/reading-v2/runtime/ReadingV2RuntimeShell`
  - `src/services/reading-v2/readingV2RuntimeSubmission.service`
  - `src/components/results/ReadingV2ReviewContentAdapter.tsx`
- [ ] Quiz runtime/session remains present:
  - `src/services/sessionManager.js`
  - `src/services/sessionHelpers.js`
  - `src/routes/studentRoutes.tsx`
  - `src/constants/routes.ts`
  - `src/pages/StudentQuizPageNew.jsx`
  - `src/pages/StudentQuizPage.jsx`
  - `src/pages/TeacherQuizPage.jsx`
  - `src/components/QuizEditor.jsx`
  - `src/deprecated/quiz/**`
- [ ] Homework assignment still has legacy test/quiz lookup paths to inspect:
  - `r2-backup-worker/src/homework/assignments.ts`
  - `r2-backup-worker/src/homework/assignments.test.ts`
- [ ] Retained result and feedback surfaces still need source-removal support:
  - `src/services/resultFeedbackPayload.service.ts`
  - `src/services/testResults.service.ts`
  - `src/types/results.types.ts`
  - `src/pages/StudentTestResultsPage.tsx`
  - `src/pages/TeacherTestResultsPage.tsx`
  - `src/components/results/ReviewTab.tsx`
  - `src/components/results/SharedSavedResultCore.tsx`
  - `src/services/academicRecordService.ts`
- [ ] Firebase and delivery roots to inventory:
  - `/quizzes`
  - `/tests`
  - `/drafts`
  - `/student_safe_tests`
  - `/homework_assignments`
  - `/homework_student_safe_tests`
  - `/homework_student_safe_test_access`
  - `/course_materials`
  - `/material_catalog/material_indexes/**`
  - `/materials`
  - `/session_test_payloads`
  - `/notifications`
  - `/game_sessions`
  - `/test_results`
  - result indexes
  - `/reading_v2/**` protected
  - R2 asset registry/object state protected

## Phase 0 - Baseline, Findings File, And Scope Lock

- [x] 0.1 Create `tasks/findings-of-tasks-2026-07-05-retire-google-drive-reading-v1-quiz.md`.
- [x] 0.2 Record `git status --short`, current branch, upstream, untracked files, and unrelated user changes.
- [x] 0.3 Confirm the branch is `codex/remove-drive-reading-v1-quiz` or record the actual branch before proceeding.
- [x] 0.4 Confirm the source plan path and current blob/commit reference in findings.
- [x] 0.5 Record that `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md` is unrelated and must not be edited, staged, committed, or claimed.
- [x] 0.6 Search current code with:
  - `rg -n "VITE_GOOGLE_DRIVE_CLIENT_ID|googleDriveAudioService|googleDriveService|drive\.google\.com|docs\.google\.com/file|drive\.usercontent\.google\.com" src env.example.txt`
  - `rg -n "ReadingTestPage|IELTSPracticeView|loadNonThcsSkill\\('Reading'\\)|inferIeltsSkillFromMaterialId|skill: 'reading'|reading-v2" src`
  - `rg -n "StudentQuizPage|TeacherQuizPage|QuizEditor|SessionMode\.QUIZ|activeQuizzes|assignedQuizId|quizId|/student-quiz" src scripts public package.json`
  - `rg -n "sourceMaterialRemoved|questionResults|getTestFromFirebase|resultFeedbackPayload|test_results|AcademicRecord|ReviewTab|SharedSavedResultCore" src scripts`
  - `rg -n "quizzes|student_safe_tests|homework_assignments|homework_student_safe_tests|homework_student_safe_test_access|material_catalog|session_test_payloads|course_materials" src r2-backup-worker scripts database.rules.json firestore.rules`
- [x] 0.7 Record exact code owners, test anchors, and protected owners in findings.
- [x] 0.8 Record which files are too large or risky and require structural maps before editing.
- [x] 0.9 Run and record cheap final-gate baselines: `npm run check:utf8:all`, `npm run enforce:check`, and `git diff --check`.
- [x] 0.10 Record every pre-existing failure separately. Do not fix unrelated baseline failures without scope approval; obtain either cleanup approval or an explicit baseline-delta acceptance before Phase 11 closure.
- [x] 0.11 Parent acceptance: findings file exists, working tree is recorded, unrelated-file boundary is recorded, current anchors and baseline failures are mapped, and no runtime behavior or data has changed.
- [x] 0.12 HARD STOP: report Phase 0 findings and wait for explicit approval before Phase 1.

## Phase 1 - Read-Only Retirement Inventory And Schema Map

- [x] 1.1 Add `scripts/lib/retiredMaterialInventory.ts` as a read-only inventory/schema-map module.
- [x] 1.2 Add `scripts/inspect-retired-materials.ts`; do not introduce a temporary alternate filename.
- [x] 1.3 Add `scripts/__tests__/retired-material-inventory.test.ts`.
- [x] 1.4 Add the package command only after the script exists:
  - `"materials:inspect-retired": "vite-node --mode test scripts/inspect-retired-materials.ts"`
- [x] 1.5 Define a `ReadOnlyDatabase` capability interface exposing only required read/list operations; inventory code receives only this interface.
- [x] 1.6 The inspection entry point must not import a write-capable Firebase adapter, expose mutation methods, or accept `--apply`. Token scans may supplement but cannot replace this capability boundary.
- [x] 1.7 Inventory exact code ownership for Google Drive upload, validation, playback, fallback, OAuth, environment, and configuration consumers.
- [x] 1.8 Inventory exact code ownership for Reading V1 creation, routing, practice, live runtime, review, and result consumers.
- [x] 1.9 Inventory exact code ownership for Quiz creation, routing, gameplay, session assignment, feedback, result, and compatibility consumers.
- [x] 1.10 Inventory protected Reading V2, THCS, R2 Listening, and Writing owners that must remain untouched.
- [x] 1.11 Inventory teacher entry points: creation, editing, assignment, live-session launch, admin material management, teacher material list, and course material selection.
- [x] 1.12 Inventory student entry points: library, homework, course, practice, waiting room, live-session, and result routes.
- [x] 1.13 Inventory dedicated Quiz routes, including `/student-quiz/:gameSessionId`.
- [x] 1.14 Inventory shared test routes whose missing or incomplete metadata currently triggers fallback behavior.
- [x] 1.15 Inventory exact Firebase roots and fields for materials, drafts, student-safe projections, catalog/index rows, homework, course/module references, launch payloads, notifications, active sessions, completed results, and result indexes.
- [x] 1.16 Count supported records missing `testType`, `skill`, engine markers, or other routing metadata.
- [x] 1.17 Count unknown/malformed candidate records and explicit Reading V2 marker shapes.
- [x] 1.18 Identify every result surface that reads source material after loading a saved result.
- [x] 1.19 Inventory Drive URL-bearing fields in materials, projections, launch payloads, and retained results without copying full payloads or credentials.
- [x] 1.20 Parent acceptance: read-only inventory produces paths, field names, raw marker counts, unknown shapes, and source-loading result surfaces without mutations or full payload dumps. Final candidate and protected-collision counts wait for the Phase 2 classifier.
- [x] 1.21 HARD STOP: report inventory findings and wait for explicit approval before Phase 2.

## Phase 2 - Retirement Classifier And Reviewed Manifest Boundary

- [x] 2.1 Add `src/services/retirement/retiredMaterialClassifier.ts`.
- [x] 2.2 Add `src/services/retirement/retiredMaterialClassifier.test.ts`.
- [x] 2.3 Export `classifyRetirementCandidate(value, context)`.
- [x] 2.4 Export `isReadingV2Material(value)`.
- [x] 2.5 `isReadingV2Material(value)` must delegate to `READING_V2_ENGINE_FIELDS` and `isReadingV2Payload` from `src/config/readingV2FeatureFlags.ts`.
- [x] 2.6 Do not duplicate the Reading V2 field loop or create a second Reading V2 discriminator.
- [x] 2.7 Export `isReadingV1Material(value, context)`.
- [x] 2.8 Before implementing `isReadingV1Material`, convert Phase 1 evidence into an exact positive legacy schema signature and obtain product-owner approval. Root/context plus explicit legacy fields are required; absence of a Reading V2 marker is never positive evidence.
- [x] 2.9 `isReadingV1Material(value, context)` must never classify THCS reading sections or Reading V2 metadata as Reading V1.
- [x] 2.10 Export `isQuizMaterial(value)`.
- [x] 2.11 `isQuizMaterial(value)` must classify canonical `/quizzes/{quizId}` records and explicit Quiz references only.
- [x] 2.12 Export `hasGoogleDriveAudio(value)`.
- [x] 2.13 `hasGoogleDriveAudio(value)` must inspect known Listening audio locations, including top-level audio fields and `audioSections[*].audioUrl`, `streamUrl`, and `originalUrl`.
- [x] 2.14 Match Drive URL variants: `drive.google.com`, `docs.google.com/file`, and `drive.usercontent.google.com`.
- [x] 2.15 Do not treat Google Fonts, Gemini, Firestore REST, or unrelated `googleapis.com` URLs as Drive audio.
- [x] 2.16 Classifier output must include explicit states: `retire-reading-v1`, `retire-quiz`, `retire-drive-backed-listening`, `protect-reading-v2`, `protect-thcs`, `protect-r2-listening`, and `unknown-blocked`.
- [x] 2.17 Update inventory/manifest tooling to import the classifier from the same module.
- [x] 2.18 Manifest output must include project ID, generation timestamp, source revision, classifier/schema version, candidate counts by reason, exact candidate IDs, marker evidence, every planned deletion path, every retained-result scrub path, Drive URL field paths, unknown/blocked records, active-session count, protected Reading V2 collision count, and planned R2 delete count fixed at zero.
- [x] 2.19 Tests prove Reading V2 with `deliveryEngine: reading-v2` is protected.
- [x] 2.20 Tests prove `skill: Reading` alone and `contentKind: ielts_reading` alone are not sufficient deletion markers.
- [x] 2.21 Tests prove only the approved positive Reading V1 legacy signature is retired; near-matches and records identified only by missing V2 markers are `unknown-blocked`.
- [x] 2.22 Tests prove THCS reading-comprehension is protected.
- [x] 2.23 Tests prove R2 Listening is protected.
- [x] 2.24 Tests prove each Drive URL variant is retired.
- [x] 2.25 Tests prove ordinary HTTPS audio is not retired.
- [x] 2.26 Tests prove unknown/malformed records are blocked, not deleted.
- [x] 2.27 Run `npx vitest run src/services/retirement/retiredMaterialClassifier.test.ts`, `npx vitest run scripts/__tests__/retired-material-inventory.test.ts`, and `npx tsc --noEmit`.
- [x] 2.28 Run `npm run materials:inspect-retired -- --project temp-a1437 --out "$env:TEMP\retired-materials-preliminary-manifest.json"` after classifier tests pass.
- [x] 2.29 Review this preliminary manifest for exact candidate evidence, unknowns, and protected collisions. Never reuse it for destructive apply after later implementation changes.
- [x] 2.30 Parent acceptance: approved Reading V1 signature, classifier, and manifest boundary are test-covered, use canonical Reading V2 detection, and still perform no mutation.
- [x] 2.31 HARD STOP: report classifier and preliminary manifest proof before Phase 3.

## Phase 3 - Remove User Entry Points And Add Retirement Notices

- [x] 3.1 Remove Reading V1 from teacher creation skill options in `src/components/test-creation/TestCreationModal.tsx`.
- [x] 3.2 Keep Reading V2 creation/import/revision routes intact.
- [x] 3.3 Keep R2 Listening, Writing, and THCS creation intact.
- [x] 3.4 Remove Quiz mode from visible session creation, including localhost/dev-only controls.
- [x] 3.5 Change omitted `createSession` mode from `SessionMode.QUIZ` to `SessionMode.TEST` before removing Quiz enum/branches.
- [x] 3.6 Remove Quiz and Reading V1 editor/open/start/assign actions from Teacher Lobby and Admin material surfaces.
- [x] 3.7 Prevent Drive-backed Listening materials from appearing as usable launch/assignment materials.
- [x] 3.8 Update feature registry routes/actions in the same change.
- [x] 3.9 Add native, non-Mantine retirement notice content for dedicated Quiz URLs.
- [x] 3.10 Dedicated Quiz notice routes must not import `StudentQuizPageNew`, mount Quiz gameplay, or read `/quizzes`.
- [x] 3.11 Shared material/session routes must render generic `Material no longer available` when a deleted/missing retired record is absent.
- [x] 3.12 Use registered route helpers for return controls; do not compose return route strings manually.
- [x] 3.13 Return targets: teacher to Teacher Lobby, student to Student Dashboard, guest to login/join surface.
- [x] 3.14 Track retirement notice views and return actions in `src/config/featureRegistry.ts`.
- [x] 3.15 Tests prove Reading V1 option absent.
- [x] 3.16 Tests prove Reading V2 option still present.
- [x] 3.17 Tests prove Quiz mode absent in development and production configuration.
- [x] 3.18 Tests prove dedicated teacher/student Quiz URLs render retirement notice without reading `/quizzes`.
- [x] 3.19 Tests prove missing shared material renders generic unavailable state.
- [x] 3.20 Tests prove return controls use registered routes.
- [x] 3.21 Run focused page/component tests and `npx tsc --noEmit`.
- [x] 3.22 Parent acceptance: no user entry point can create or launch newly retired material; protected supported features still appear.
- [x] 3.23 HARD STOP: report entry-point removal proof before Phase 4.

## Phase 4 - Runtime Routing Closure For Reading V1 And Unknown IELTS Material

- [x] 4.1 Remove legacy `ReadingTestPage` import from `src/pages/TestPageRouter.tsx`.
- [x] 4.2 Remove live routing case that sends `Reading` to `ReadingTestPage`.
- [x] 4.3 Delete the `loadNonThcsSkill('Reading')` fallback used when `tests/{testId}/testType` is absent.
- [x] 4.4 Route explicit Reading V2 only from canonical Reading V2 marker and projection decisions.
- [x] 4.5 Route supported Listening and Writing only from explicit session or material metadata.
- [x] 4.6 Unknown or incomplete IELTS material must fail closed into the generic unavailable state.
- [x] 4.7 In `src/pages/StudentPracticePage.tsx`, remove Reading inference from material ID fallback.
- [x] 4.8 In `src/pages/StudentPracticePage.tsx`, remove default unknown IELTS path into `IELTSPracticeView`.
- [x] 4.9 Keep explicit branches for Reading V2, R2 Listening, Writing, and THCS.
- [x] 4.10 Dependency scan found remaining consumers for `src/skills/reading/**`; no deletion performed in Phase 4.
- [x] 4.11 Dependency scan found remaining mobile scaffold/state consumers; no deletion performed in Phase 4.
- [x] 4.12 Remove Reading V1-only integration tests or convert them into retired-route/unavailable-state tests.
- [x] 4.13 Tests prove Reading V2 live/practice/homework/course routing remains green.
- [x] 4.14 Tests prove R2 Listening uses dedicated Listening runtime.
- [x] 4.15 Tests prove Writing uses Writing runtime.
- [x] 4.16 Tests prove THCS reading sections still render and score.
- [x] 4.17 Tests prove unknown IELTS material does not fall into Reading V1 runtime.
- [x] 4.18 Tests prove missing `testType` does not fall into Reading V1 runtime.
- [x] 4.19 Run focused routing/runtime tests and `npx tsc --noEmit`.
- [x] 4.20 Parent acceptance: legacy Reading cannot be reached by explicit route, missing metadata, material-id inference, default switch case, or shared material route.
- [x] 4.21 HARD STOP: report routing closure proof before Phase 5.

## Phase 5 - Remove Google Drive Runtime And Configuration

- [x] 5.1 Confirm Phase 3 has blocked Drive-backed Listening from user launch/assignment surfaces.
- [x] 5.2 Remove `googleDriveAudioService` import and all Drive branches from `src/skills/listening/components/AudioPlayer.tsx`.
- [x] 5.3 Remove iframe/embed fallback.
- [x] 5.4 Remove Drive share-link validation and Drive playback conversion.
- [x] 5.5 Ensure new and existing active Listening paths accept R2/authorized delivery only.
- [x] 5.6 Ensure retained results never attempt a Drive network request.
- [x] 5.7 Delete `src/services/googleDrive.js` after import scan is clean.
- [x] 5.8 Delete `src/services/googleDrive.d.ts` after import scan is clean.
- [x] 5.9 Delete `src/services/googleDriveAudio.ts` after import scan is clean.
- [x] 5.10 Delete Drive-only badge/component/tests only when no longer imported.
- [x] 5.11 Remove `VITE_GOOGLE_DRIVE_CLIENT_ID` from `src/config/env.config.ts`.
- [x] 5.12 Remove `VITE_GOOGLE_DRIVE_CLIENT_ID` from `env.example.txt`.
- [x] 5.13 Remove current comments, type declarations, mocks, or runtime fallbacks that describe Drive as supported.
- [x] 5.14 Preserve classifier, inventory, purge tooling, and historical docs where Drive strings are required as retired-feature evidence.
- [x] 5.15 Run `rg -n "VITE_GOOGLE_DRIVE_CLIENT_ID|googleDriveAudioService|googleDriveService|drive\.google\.com|docs\.google\.com/file|drive\.usercontent\.google\.com" src env.example.txt`.
- [x] 5.16 Expected production matches: zero. Retirement classifier tests and purge tooling are reviewed separately.
- [x] 5.17 Run focused Listening authoring/runtime/result tests and `npx tsc --noEmit`.
- [x] 5.18 Parent acceptance: no production Drive runtime/config remains and R2 Listening still works.
- [x] 5.19 HARD STOP: report Drive removal proof before Phase 6.

## Phase 6 - Remove Quiz Implementation, Session Contracts, And Compatibility Writes

- [x] 6.1 Confirm Phase 3 dedicated Quiz routes already render retirement notices.
- [x] 6.2 Confirm Phase 3 changed omitted `createSession` mode from `SessionMode.QUIZ` to `SessionMode.TEST`; do not re-implement or overwrite that completed change.
- [x] 6.3 Reject explicit Quiz mode before deleting `SessionMode.QUIZ`.
- [x] 6.4 Remove Quiz mode enum/member only after tests prove omitted mode creates Test sessions and explicit Quiz is rejected.
- [x] 6.5 Remove new-session `activeQuizzes` writes.
- [x] 6.6 Remove new-session `quizId` compatibility writes.
- [x] 6.7 Remove Quiz assignment and `assignedQuizId` from active session contracts.
- [x] 6.8 Remove Quiz compatibility writes from notification/launch payloads.
- [x] 6.9 In `src/services/sessionHelpers.js`, stop migrating active new runtime state into `activeQuizzes`.
- [x] 6.10 Preserve historical result fields required to read retained completed Quiz results.
- [x] 6.11 Do not broadly delete `quizId` from result DTOs until retained-result tests prove it is unnecessary.
- [x] 6.12 Remove Quiz editors and admin material actions.
- [x] 6.13 Remove teacher and student gameplay pages.
- [x] 6.14 Remove Quiz feedback/result pages that have no retained-result responsibility.
- [x] 6.15 Remove Quiz cache/query functions.
- [x] 6.16 Remove Quiz assignment APIs.
- [x] 6.17 Remove Quiz inspection/debug scripts only after new inventory/purge inspection covers required inspection.
- [x] 6.18 Remove deprecated Quiz components.
- [x] 6.19 Remove Quiz-only package scripts.
- [x] 6.20 Remove Quiz routes from `liveSessions` feature ownership.
- [x] 6.21 Tests prove omitted mode creates a Test session.
- [x] 6.22 Tests prove explicit Quiz mode is rejected.
- [x] 6.23 Tests prove new sessions do not write `activeQuizzes`, `assignedQuizId`, or new Quiz payloads.
- [x] 6.24 Tests prove waiting/join flows never load Quiz data.
- [x] 6.25 Tests prove dedicated Quiz routes render retirement notice.
- [x] 6.26 Tests prove supported test-mode live sessions remain green.
- [x] 6.27 Tests prove retained Quiz result snapshots remain readable through shared result services.
- [x] 6.28 Run focused session/route/result tests and `npx tsc --noEmit`.
- [x] 6.29 Parent acceptance: no executable Quiz creation, gameplay, live session, or assignment flow remains; retained Quiz results remain readable.
- [x] 6.30 HARD STOP: report Quiz/session removal proof before Phase 7.

## Phase 7 - Preserve Academic Results, Answer Review, And Feedback Payloads

- [x] 7.1 Add `sourceMaterialRemoved?: boolean` to saved result contracts.
- [x] 7.2 Treat absent `sourceMaterialRemoved` as historical compatibility, not proof that source material exists.
- [x] 7.3 Update purge-facing result scrub contract to set `sourceMaterialRemoved: true` on affected retained results.
- [x] 7.4 Preserve title, skill/type snapshots, score, percentage/band, submission time, question results, student answers, correct answers, feedback, stable attempt grouping IDs, and required result indexes.
- [x] 7.5 Remove embedded Drive audio URLs and other retired source payloads from retained results only through the later manifest-reviewed purge.
- [x] 7.6 In `src/services/resultFeedbackPayload.service.ts`, bypass `getTestFromFirebase`, `getThcsTestFromFirebase`, and all source material loading when `sourceMaterialRemoved` is true.
- [x] 7.7 Build removed-source feedback payloads directly from saved result fields and `questionResults`.
- [x] 7.8 When original question, passage, or audio context is absent, show `Original material removed`.
- [x] 7.9 Do not promise Source Review after purge.
- [x] 7.10 Update Academic Record surfaces to show retained summaries for Reading V1, Quiz, and affected Listening results.
- [x] 7.11 Update Answer Review to render saved answers and scores with material absent.
- [x] 7.12 Ensure no material lookup is required for basic Answer Review.
- [x] 7.13 Update `ResultDetailModal`, `StudentTestResultsPage`, teacher result pages, `ReviewTab`, `SharedSavedResultCore`, and feedback payload generation as required by inspection.
- [x] 7.14 Preserve Reading V2 review projection behavior unchanged.
- [x] 7.15 Tests prove Academic Record retains Reading V1/Quiz/affected Listening result summaries.
- [x] 7.16 Tests prove Answer Review displays saved answers, correct answers, scores, and feedback with material absent.
- [x] 7.17 Tests prove `resultFeedbackPayload.service.ts` does not call source loaders when `sourceMaterialRemoved` is true.
- [x] 7.18 Tests prove feedback payload generation remains valid from saved `questionResults`.
- [x] 7.19 Tests prove Drive audio URL is neither rendered nor requested.
- [x] 7.20 Tests prove Reading V2 result review remains unchanged.
- [x] 7.21 Run focused result/feedback tests and `npx tsc --noEmit`.
- [x] 7.22 Parent acceptance: completed academic results and Answer Review are stable before any purge command can mutate retired source fields.
- [x] 7.23 HARD STOP: report result-preservation proof before Phase 8.

## Phase 8 - Separate Inspection And Purge Tooling

- [x] 8.1 Confirm Phase 2 read-only inspection exists and Phase 7 result preservation tests pass.
- [x] 8.2 Add `scripts/purge-retired-materials.ts`.
- [x] 8.3 Add `scripts/__tests__/purge-retired-materials.test.ts`.
- [x] 8.4 Add the package command only after the script exists: `"materials:purge-retired": "vite-node --mode test scripts/purge-retired-materials.ts"`.
- [x] 8.5 Purge command must require both `--manifest` and `--apply`.
- [x] 8.6 There must be no implicit apply mode.
- [x] 8.7 Purge must reject missing, malformed, wrong-project, and stale manifests.
- [x] 8.8 Purge must recompute current inventory and compare it with the reviewed manifest.
- [x] 8.9 Purge must abort when recomputed candidates differ from the reviewed manifest.
- [x] 8.10 Purge must re-read all candidates immediately before mutation.
- [x] 8.11 Purge must abort on active sessions.
- [x] 8.12 Purge must abort on any Reading V2 marker.
- [x] 8.13 Purge must abort on unknown/malformed candidate shape.
- [x] 8.14 Purge must abort when a parent course/class/module would be deleted.
- [x] 8.15 Purge must abort if a completed result is planned for deletion.
- [x] 8.16 Purge must abort if any R2 delete operation is planned.
- [x] 8.17 Purge must use bounded, idempotent Firebase updates.
- [x] 8.18 Purge may delete retired `/quizzes` records only when manifest-reviewed.
- [x] 8.19 Purge may delete retired Reading V1 `/tests` records only when manifest-reviewed.
- [x] 8.20 Purge may delete Drive-backed Listening materials only when manifest-reviewed.
- [x] 8.21 Purge may delete associated drafts, student-safe copies, homework references, catalog/index rows, session payloads, notifications, and launch records only when manifest-reviewed.
- [x] 8.22 Purge may scrub retained result source fields and set `sourceMaterialRemoved: true`.
- [x] 8.23 Purge must never delete `/reading_v2/**`.
- [x] 8.24 Purge must never delete completed result records or result indexes.
- [x] 8.25 Purge must never delete R2 asset registry/object state.
- [x] 8.26 Purge must never delete classes, courses, or modules themselves.
- [x] 8.27 Purge must never delete session records after session closure.
- [x] 8.28 Apply readback must prove zero Quiz materials, zero Reading V1 materials, zero Drive-backed Listening materials, zero stale active assignment/catalog/delivery references, zero active sessions, retained result counts unchanged, zero Drive URLs in retained result source fields, Reading V2 counts unchanged, and R2 delete count zero.
- [x] 8.29 Tests prove inspection code contains no mutation operation and rejects `--apply`.
- [x] 8.30 Tests prove inspection and purge import the same classifier/inventory module.
- [x] 8.31 Tests prove purge rejects missing, malformed, wrong-project, and stale manifests.
- [x] 8.32 Tests prove purge aborts when recomputed candidates differ from the reviewed manifest.
- [x] 8.33 Tests prove protected Reading V2 collisions, completed result deletions, and R2 deletions are hard failures.
- [x] 8.34 Run `npx vitest run scripts/__tests__/retired-material-inventory.test.ts scripts/__tests__/purge-retired-materials.test.ts` and `npx tsc --noEmit`.
- [x] 8.35 Parent acceptance: purge tooling is implemented and tested, but no `--apply` has been run.
- [x] 8.36 HARD STOP: report purge-tooling proof and wait for explicit approval before any destructive command.

## Phase 9 - Local Rules And Active Type Reconciliation

- [x] 9.1 Start only after local purge tooling and tests are complete.
- [x] 9.2 Remove `/quizzes` client read/write rule locally.
- [x] 9.3 Remove Quiz-only validation fields from new active session writes.
- [x] 9.4 Preserve compatibility reads only where retained results require them.
- [x] 9.5 Update route security for retirement notice routes.
- [x] 9.6 Update active TypeScript types without making retained historical result records unreadable.
- [x] 9.7 Add emulator-backed tests proving `/quizzes` client read/write denied.
- [x] 9.8 Add emulator-backed tests proving supported `/tests` ownership remains correct.
- [x] 9.9 Add emulator-backed tests proving Reading V2 paths remain correct.
- [x] 9.10 Add emulator-backed tests proving retained result access remains correct.
- [x] 9.11 Add emulator-backed tests proving test-mode session creation remains authorized.
- [x] 9.12 Do not deploy rules in this phase.
- [x] 9.13 Run security/rules tests and `npx tsc --noEmit`.
- [x] 9.14 Parent acceptance: local rules/types are reconciled and tested without deployment.
- [x] 9.15 HARD STOP: report local rules proof before Phase 10.

Phase 9 note: local structural/security tests and route/session tests pass. RTDB emulator-backed execution was initially blocked because Java was not installed on PATH; after explicit approval, Temurin 21 JRE was installed and the Phase 9 RTDB emulator proof passed. See findings for exact commands and evidence.

## Phase 10 - Documentation, Knowns, And Stale-Truth Cleanup

- [x] 10.1 Create or update canonical retired-features architecture/current-state document linking the ADR and source plan.
- [x] 10.2 Update product definition and technology stack documentation.
- [x] 10.3 Update upload/storage authority documentation.
- [x] 10.4 Update teacher creation/navigation architecture.
- [x] 10.5 Update homework/solo practice architecture.
- [x] 10.6 Update student delivery projection architecture.
- [x] 10.7 Update session and result governance documentation.
- [x] 10.8 Update feature registry documentation.
- [x] 10.9 Update documentation indexes.
- [x] 10.10 Mark Reading V1 PRD/task material obsolete.
- [x] 10.11 Mark mobile Reading V1 PRD/task material obsolete where it owns retired runtime.
- [x] 10.12 Mark Quiz PRD/task material obsolete.
- [x] 10.13 Mark Quiz editor/system architecture and SOPs obsolete.
- [x] 10.14 Mark Google Drive-specific portions of broader audio documents obsolete.
- [x] 10.15 Add obsolescence banners/status and replacement pointers.
- [x] 10.16 Preserve completed task/history text.
- [x] 10.17 Mark unfinished work cancelled because feature retired; never mark it completed.
- [x] 10.18 Do not rewrite conversation logs, exports, archived proof, or generated evidence.
- [x] 10.19 Directly edit relevant `.knowns/docs` and `.knowns/tasks`.
- [x] 10.20 Do not use removed Knowns MCP/CLI.
- [x] 10.21 Do not edit generated `.knowns/.search` files.
- [x] 10.22 Update `CLAUDE.md` and `GEMINI.md` to remove stale requirements to use unavailable Knowns tooling if those files contain such instructions.
- [x] 10.23 Run stale-truth scans for `Google Drive supported`, `Quiz Mode supported`, `Reading V1 supported`, `legacy playback continues`, `no source/tests changed`, and `docs-only`.
- [x] 10.24 Parent acceptance: active documentation reflects the retired-feature product state, while historical evidence remains historical.
- [x] 10.25 HARD STOP: report documentation proof before Phase 11.

Phase 10 note: docs/knowns cleanup only. Canonical retired-feature authority now exists in repo docs and Knowns; active architecture/index/docs point to retired Google Drive, Reading V1, and Quiz state; historical PRD/task/SOP docs are marked obsolete without rewriting history; stale Knowns MCP/CLI guidance in `CLAUDE.md` and `GEMINI.md` was replaced with direct-edit guidance. See findings for scans and exact command evidence.

## Phase 11 - Full Local Verification, Review, And Closure

- [x] 11.1 Run focused tests throughout each prior phase. Do not defer all proof to the end.
- [x] 11.2 Run final local gate:
  - `npm run sessions:end-active -- --project temp-a1437`
  - `node --test scripts/__tests__/end-active-sessions.test.mjs`
  - `npx vitest run src/services/retirement/retiredMaterialClassifier.test.ts`
  - `npx vitest run scripts/__tests__/retired-material-inventory.test.ts scripts/__tests__/purge-retired-materials.test.ts`
  - `npx vitest run`
  - `npm run test:security`
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run check:utf8:all`
  - `npm run enforce:check`
  - `git diff --check`
- [x] 11.3 Browser verification on teacher app `http://localhost:5173`.
- [x] 11.4 Browser verification on student app `http://localhost:5174`.
- [x] 11.5 Verify Reading V2 create/import/revise.
- [x] 11.6 Verify Reading V2 live runtime.
- [x] 11.7 Verify Reading V2 solo/homework/course runtime.
- [x] 11.8 Verify R2 Listening authoring/runtime.
- [x] 11.9 Verify Writing authoring/runtime.
- [x] 11.10 Verify THCS authoring/runtime.
- [x] 11.11 Verify test-mode live sessions.
- [x] 11.12 Verify Quiz retirement URLs.
- [x] 11.13 Verify generic deleted-material/unavailable state.
- [x] 11.14 Verify Academic Record.
- [x] 11.15 Verify Answer Review with removed source.
- [x] 11.16 Final source scans prove no production Google Drive runtime/config, no Reading V1 creation/runtime, no executable Quiz flow, no Mantine introduced in touched UI, no Reading V2 path selected for purge, no R2 delete capability added, and no unrelated user file included.
- [x] 11.17 Perform code review after implementation and proof are complete.
- [x] 11.18 Verify staged paths before any commit if commit is separately authorized.
- [ ] 11.19 Suggested commit split if later authorized:
  - Existing commit `ca95aacb` already owns active-session closure tooling; do not recreate it.
  - `refactor(retirement): block retired entry points`
  - `refactor(retirement): remove legacy runtimes`
  - `feat(results): preserve removed-source review`
  - `chore(retirement): add purge tooling`
  - `docs(retirement): mark features obsolete`
- [x] 11.20 Commit, push, PR, deploy, and remote purge remain separate approvals.
- [x] 11.21 If any full gate still fails only because of a Phase 0 baseline failure, prove no new failure was introduced and obtain explicit baseline-delta acceptance; otherwise Phase 11 remains blocked.
- [x] 11.22 Parent acceptance: full local evidence is recorded, no destructive remote purge has run, and the product owner has enough evidence to decide remote gates.

Phase 11 cleanup note: product owner approved separate full-suite/security baseline cleanup after earlier TypeScript, UTF-8, ESLint, browser, and protected-workflow blocker fixes. Full local gates now pass, including `npx vitest run`, `npm run test:security`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run check:utf8:all`, `npm run enforce:check`, and `git diff --check`. No destructive remote purge/deploy/stage/commit/push was run. See findings for exact commands, source scans, and path scope.

## Phase 12 - Remote Purge And Deployment Gates

These steps do not occur automatically during implementation.

### Gate A - Main Integration And Prevent New Retired Data

- [ ] 12.1 After explicit approval, inspect feature-branch `HEAD`, upstream, dirty status, included/excluded paths, commits, diff, and test summary.
- [ ] 12.2 Sync local `main` according to repository merge safety, prefer PR, and merge only after explicit approval. Direct push to `main` requires separate explicit approval plus diff, commit, and test summary.
- [ ] 12.3 Deploy the exact merged feature-removal commit and verify deployed revision/readback.
- [ ] 12.4 Verify creation and session selectors expose only supported materials and no retired content can be newly created, assigned, or launched.

### Gate B - Close Sessions And Inspect Purge

- [ ] 12.5 Run only after explicit approval:
  - `npm run sessions:end-active -- --project temp-a1437 --apply`
  - `npm run materials:inspect-retired -- --project temp-a1437 --out "$env:TEMP\retired-materials-manifest.json"`
- [ ] 12.6 Review the inspection manifest.
- [ ] 12.7 Confirm zero active sessions.
- [ ] 12.8 Confirm zero protected Reading V2 collisions.
- [ ] 12.9 Confirm zero planned result deletions.
- [ ] 12.10 Confirm zero planned R2 deletions.
- [ ] 12.11 Confirm candidate paths, scrub paths, and blocked records are understood.

### Gate C - Destructive Approval

- [ ] 12.12 Only after explicit product-owner approval, run:
  - `npm run materials:purge-retired -- --project temp-a1437 --manifest "$env:TEMP\retired-materials-manifest.json" --apply`
- [ ] 12.13 Run full readback.
- [ ] 12.14 Retain only the manifest/proof required for audit.
- [ ] 12.15 Do not retain deleted material payloads.

### Gate D - Rules Deployment

- [ ] 12.16 Deploy cleaned Firebase rules only after purge readback passes.
- [ ] 12.17 Verify `/quizzes` denial against deployed state.
- [ ] 12.18 Verify supported feature access against deployed state.

### Gate E - Local Main Refresh And Worktree Cleanup

- [ ] 12.19 Fetch and fast-forward local `main` after remote merge; prove local `main == origin/main`.
- [ ] 12.20 Prove all feature commits are reachable from `origin/main` and the feature worktree is clean.
- [ ] 12.21 Remove the feature worktree only after reachability, cleanliness, and explicit user approval.

## Codex Run Pattern

Use one run per phase unless the product owner explicitly scopes a smaller subphase.

- [ ] Run 1: Phase 0 only. Stop after findings.
- [x] Run 2: Phase 1 only. Stop after read-only inventory.
- [x] Run 3: Phase 2 only. Stop after classifier and manifest-boundary tests.
- [x] Run 4: Phase 3 only. Stop after entry-point and retirement-notice tests.
- [x] Run 5: Phase 4 only. Stop after runtime routing tests.
- [x] Run 6: Phase 5 only. Stop after Drive static scan and Listening tests.
- [x] Run 7: Phase 6 only. Stop after Quiz/session tests.
- [x] Run 8: Phase 7 only. Stop after result-preservation tests.
- [x] Run 9: Phase 8 only. Stop after purge-tooling tests. Do not run `--apply`.
- [x] Run 10: Phase 9 only. Stop after local rule tests. Do not deploy rules.
- [x] Run 11: Phase 10 only. Stop after doc/stale-truth scans.
- [x] Run 12: Phase 11 only. Stop after full local verification and review.
- [ ] Run 13: Phase 12 gates only after explicit product-owner approval.

## Initial Codex Prompt

Use this for the first run:

```text
Read:
- docs/superpowers/plans/2026-07-05-retire-google-drive-reading-v1-quiz.md
- tasks/tasks-2026-07-05-retire-google-drive-reading-v1-quiz.md
- AGENTS.md
- documentation/tasks/process-task-list.md
- the Must-Read files listed for Phase 0

Implement Phase 0 only.

Do not proceed to Phase 1.
Do not delete files.
Do not change runtime behavior.
Do not mutate Firebase data.
Do not stage, commit, push, create a PR, deploy, or run destructive commands.
Do not edit, stage, commit, or claim documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md.

Create tasks/findings-of-tasks-2026-07-05-retire-google-drive-reading-v1-quiz.md and record:
- git status and branch/upstream
- unrelated user changes
- exact source plan path and revision
- current Google Drive, Reading V1, Quiz, result, routing, Firebase-root, and protected-feature anchors
- searches run
- blockers and risks
- recommended next phase

Stop after Phase 0 and summarize evidence.
```
