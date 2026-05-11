# Task List: IELTS Reading V2 Studio And Runtime

> **Source PRD:** `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
> **Generated:** 2026-04-24
> **Phase:** Detailed task list
> **Audience:** Junior developer implementing Reading V2 without inventing missing product behavior

## Required Source Packet

Before implementing any task in this file, read these documents in this order:

1. `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
2. `documentation/tasks/PRD0048/assessment-0048-preservation-and-foundational-plan.md`
3. `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
4. `documentation/tasks/findings-of-tasks-0048-prd-reading-v2-studio-and-runtime.md`
5. `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`
6. `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
7. `documentation/tasks/PRD0048/reading-v2-family-*.md`
8. `documentation/tasks/PRD0048/reading-v2-type-*.md`
9. `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
10. `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
11. `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
12. `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-desktop-tablet.md`
13. `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-phone.md`
14. `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
15. `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
16. `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`
17. `documentation/tasks/PRD0048/handoff-0048-prd-ielts-reading-v2-system-review-context.md`
18. `documentation/tasks/PRD0048/conversation-transcript-prd-0048-thread-2026-04-22-to-2026-04-24.md`

The transcript is a rationale trail and tie-breaker for preserving intent. It must not be used to bypass the PRD, contract freeze, taxonomy, family/type docs, feature pipeline matrix, test-making pipeline contract, page-schema docs, or integration contracts.

## Reinforced Implementation Contract

This task list is an execution plan, not a substitute for the PRD0048 packet.

Precedence:

1. PRD0048 packet docs define product and execution truth.
2. This task list defines implementation order, file ownership, verification gates, and junior-safe sequencing.
3. Existing legacy Reading code is evidence only; it must not override the packet.

Rules:

1. A subtask may tighten safety beyond the PRD0048 packet, but it may not loosen packet requirements.
2. A developer must not implement from a task title alone; each subtask must be traced to the packet docs it depends on.
3. If this task list and a packet doc disagree, stop and ask for senior review before coding.
4. If a required packet doc path is missing or stale, Task 0.0 must repair the packet reference before feature work continues.
5. Product open questions must be represented as explicit rollout guards or configuration decisions, never as hidden assumptions in code.

## Non-Negotiable Execution Rules For Juniors

These rules are part of the task list. Do not treat them as advice.

1. Implement tasks in numeric order unless a senior reviewer updates this task list first.
2. Do not rename, merge, split, skip, or reorder tasks based on personal judgment.
3. Do not invent a new architecture, storage path, route shape, schema name, task-family mapping, or runtime fallback.
4. Do not use legacy Reading editor/runtime code as the Reading V2 foundation.
5. Do not use projections as editable source truth.
6. Do not store visible IELTS question numbers as immutable identity.
7. Do not make a freeform or absolute-position canvas the canonical authoring model.
8. Do not silently accept unsupported schema versions, unknown task slugs, unknown families, missing anchors, unresolved placeholders, or projection safety violations.
9. Do not create files with different names or locations from this task list unless a senior reviewer first updates this task list.
10. Do not use `any`, broad type assertions, catch-all fallback rendering, or heuristic reconstruction to hide unclear Reading V2 data.
11. Do not mutate published snapshots, historical attempts, historical results, or extracted source provenance in place.
12. Do not add user-facing buttons, routes, forms, or workflows without first reading the applicable safety-rule docs named in the relevant task.
13. If a requirement appears ambiguous, conflicting, missing, or too broad, stop and ask for clarification. Do not guess.
14. If existing code appears to encourage a different approach from PRD0048, follow PRD0048 and record the legacy-code conflict instead of copying the old pattern.
15. A subtask is not done until its tests pass, related guards are added, and the changed files pass the targeted UTF-8 check where applicable.
16. Do not expose Reading V2 content to students before explicit feature/rollout guards exist and default closed.
17. Do not let runtime, review, analytics, or launch code read canonical drafts directly; those surfaces consume projections or published snapshots only.
18. Do not add a renderer for a family or task type without a canonical fixture and at least one projection fixture.
19. Do not add compatibility fields that become a second source of truth; compatibility data must be regenerated from canonical data in tests.
20. Do not silently drop import uncertainty, provenance, anchor references, or validation issues during save, publish, projection, scoring, or review.
21. Do not use UI snapshots or visual mocks as proof of correctness unless paired with canonical-model and projection assertions.
22. Do not treat fixture creation as optional cleanup; fixtures are part of the implementation foundation.
23. Do not build a new Teacher Lobby page, Reading V2 lobby dashboard, or Reading-only lobby filter rail for this PRD.
24. Do not build separate standalone Reading V2 teacher/student result-review pages; integrate with existing result/review/feedback surfaces.
25. Do not redesign the student Reading runtime away from current Reading V1 desktop/tablet or phone UI without senior approval and a packet update.
26. Do not split Reading V2 test making into disconnected metadata, editor, answer-key, settings, and publish products; implement the ordered pipeline from `reading-v2-test-making-pipeline.md`.
27. Do not add a separate top-level `Answer Key` tab or a standalone answer-key source of truth; answer keys and scoring rules live inside the `Questions` workflow and canonical task-group model.
28. Do not store homework due dates, assigned classes/students, live session codes/state, course placement/order, or final result release state inside Reading V2 material settings.
29. Do not implement any PRD-0048 feature area without matching its access point, owner, pipeline, outputs, and forbidden patterns from `reading-v2-feature-pipeline-matrix.md`.
30. Do not create new management, launch, result-review, notification, analytics, or admin surfaces to close PRD-0048 gaps unless the PRD packet is updated first; tighten Firebase, auth, UX-state, performance, and observability work through existing platform owners, route guards, repositories, feature registry, Teacher Lobby, launch, result, feedback, and regrade relationships.
31. Treat every file path, route path, component name, service name, config name, and test name in this task list as exact unless the task explicitly says to stop for senior review.
32. If the current codebase makes an exact named artifact impossible, stop and update this task list with senior approval before creating a differently named artifact.
33. Do not replace a named component with an "equivalent" local component, helper, or shortcut.
34. Do not add a Firebase path, rule, index, event, performance budget, or UX state that is not represented in the Reading V2 operational matrix or this task list.
35. When a task says to reuse an existing surface, first identify the existing owner in code, then extend that owner; do not create a parallel owner because the existing path is inconvenient.
36. Do not import legacy Reading editor, runtime, parser, scoring, flat-question reconstruction, or V1 grouped-task helper modules into `src/services/reading-v2/**` or `src/components/reading-v2/**`; V1 files are visual/reference evidence only.
37. Do not let V2 core services depend on legacy Reading data types such as flat question records, merged parser output, or legacy `TestData` as internal domain truth; if shared platform shapes are unavoidable, isolate conversion in an edge adapter outside the V2 canonical core.
38. Do not branch shared platform code by sniffing legacy Reading shapes; V1/V2 branching must use an explicit engine discriminator and delegate immediately to the correct engine boundary.
39. Do not pass canonical drafts, packaged materials, or legacy Reading payloads into `ReadingV2RuntimeShell`; runtime receives branded V2 projections only.
40. Any file that forms a V1/V2 boundary must carry a short code-level note explaining the ownership rule, accepted input shape, and forbidden legacy dependency.

## Phase Dependency Gates

- Task 0.0 must finish before any V2 module, type, repository, route, or UI work starts.
- Task 1.0 must finish before any V2 data model, repository, route, or UI work starts.
- Task 2.0 must finish before storage, studio, projection, runtime, launch, scoring, or review work starts.
- Task 3.0 must finish before publish, launch, submission, or result work starts.
- Task 4.0 may start after Tasks 1.0-3.0, but it must follow the access -> metadata -> editor -> answer-key/scoring -> settings -> validate/preview -> publish-control pipeline, and publish must remain disabled until Task 5.0 publish gates are implemented.
- Task 5.0 must finish before any student runtime can consume V2 content outside teacher-only preview.
- Task 6.0 must finish before platform launch integrations in Task 7.0 expose V2 content to students.
- Task 7.0 must finish before result/feedback integration workflows are treated as production paths.
- Task 8.0 must finish before rollout or public-library exposure is allowed.
- Task 9.0 must finish before Reading V2 is enabled beyond the approved rollout guard.

## Parent Task Done Criteria

- Task 0.0 is done only when packet-path validation, source-packet linting, implementation invariant notes, fixture strategy, projection-shape strategy, and open-decision guards exist.
- Task 1.0 is done only when V2 module boundaries exist, legacy Reading cannot accidentally render V2 payloads, and all source-packet guardrails are documented in code or tests.
- Task 2.0 is done only when canonical types, taxonomy guards, family contracts, version guards, numbering rules, validation severity types, contract guards, canonical fixtures, and tests exist.
- Task 3.0 is done only when V2 storage paths, repositories, draft conflict behavior, published snapshot immutability, passage asset metadata, engine discriminators, Firebase operational matrix, security-rule coverage, index/query decisions, retention/deletion behavior, and role boundaries are tested.
- Task 4.0 is done only when all test-making modes use one Studio shell/contract; the Teacher Lobby edit-modal host can delegate to that same shell where implemented; the required metadata setup exists; answer keys/scoring rules are edited inside `Questions`; `Settings` owns only material-level settings; drafts autosave with conflict handling; import uncertainty is visible; placeholders block publish; preview/publish controls delegate to the V2 pipeline; published edits create draft revisions; and Studio loading, empty, error, retry, permission-denied, conflict, import-failure, validation-failure, publish-success, and publish-failure states are defined and tested.
- Task 5.0 is done only when validation, publish gating, preview projection, student-safe projection, session-safe projection, review projection, analytics projection, projection-shape contracts, material metadata/index updates, passage asset selection, extraction copy behavior, and provenance tests exist.
- Task 6.0 is done only when desktop/tablet and phone runtimes consume V2 projections, imitate the current Reading V1 student UI, all five task families render and save answers from projection fixtures, unsupported versions are rejected, mobile rules are tested, and runtime loading/empty/error/permission/submit states are tested inside the existing launch shell pattern.
- Task 7.0 is done only when solo, homework, course, public library, live session, Teacher Lobby material-card/edit-modal, and material profile paths can launch or manage Reading V2 without entering legacy Reading interpretation, and every launch/listing failure state remains inside the owning existing surface.
- Task 8.0 is done only when submission, scoring, snapshot binding, existing result/feedback shell integration, release-policy sanitization, regrade artifacts, and result/review/feedback failure states are tested.
- Task 9.0 is done only when feature registry, observability event catalog, performance budgets, rollout guard, non-migration guardrails, source-packet linting, vertical-loop integration test, affected regression tests, and final no-new-surface confirmations are complete.

## Foundation Artifact Matrix

These artifacts are required so the implementation stays testable and does not drift into local improvisation.

| Artifact | Created by | Used by | Purpose |
|---|---|---|---|
| Source-packet lint/check | Task 0.0 | All tasks | Proves required packet files exist and stale future/missing-doc language does not reappear |
| Reading V2 module invariant notes | Task 0.0 / Task 1.0 | All V2 modules | Records three-plane architecture, fail-closed behavior, and legacy boundary near code |
| Feature pipeline matrix | Task 0.0 / All parent tasks | Every PRD-0048 feature area | Freezes access points, owning surfaces, pipeline order, outputs, tests, and forbidden patterns for non-test-making flows |
| Test-making pipeline contract | Task 0.0 / Task 4.0 / Task 5.0 | Studio, Teacher Lobby, Material Profile, publish, launch, result integration | Forces one ordered access -> metadata -> editor -> answer-key/scoring -> settings -> validate/preview -> publish flow and prevents ownership drift |
| Canonical contract guards | Task 2.0 | Storage, studio, projections, runtime, scoring | Reject unsupported schema versions, task slugs, families, broken anchors, and invalid object ownership |
| Canonical fixtures | Task 2.0 | Tasks 2.0-8.0 | Provide known-good documents for every family and at least one sample for every official task type |
| Projection fixtures | Task 5.0 | Runtime, launch, result adapter, scoring tests | Prove preview, student-safe, session-safe, review, and analytics shapes are derived-only and sanitized |
| Firebase operational matrix | Task 3.0 | Storage, repositories, security rules, launch, result, observability | Freezes every Reading V2 path, owner, consuming existing surface, role boundary, query/index requirement, retention rule, and projection-safety rule |
| Firebase security-rule tests | Task 3.0 | Storage, launch, result, rollout | Proves teachers/admins/students can read and write only the paths allowed by the operational matrix |
| Studio operational state contract | Task 4.0 | Studio, Teacher Lobby modal adapter, import, publish | Freezes exact loading, empty, error, retry, conflict, permission-denied, save, import, validation, and publish states without a new notification system |
| Student runtime V1 parity fixtures/screenshots | Task 6.0 | Runtime UI verification | Prove V2 runtime imitates current Reading V1 desktop/tablet and phone UI while rendering from V2 projections |
| Result/feedback integration adapter | Task 8.0 | Existing result shells | Lets existing `SharedSavedResultCore`, `ReviewTab`, feedback, release, and regrade surfaces consume Reading V2 results |
| Observability event catalog | Task 9.0 | Feature registry and support/debug workflows | Freezes event names, required privacy-safe properties, success/error states, and existing observability ownership |
| Performance budgets | Task 9.0 | Studio, runtime, projection, launch, shared lists, result shell | Freezes measurable load/render/projection/list/result limits before rollout |
| Gold vertical-loop fixture | Task 9.0 | Final integration guard | Exercises create -> validate -> publish -> launch -> submit -> existing teacher/student result review and feedback shell |
| Product open-decision guards | Task 0.0 / Task 9.0 | Lobby, rollout, permissions | Prevent unresolved naming, passage visibility, and rollout decisions from becoming hidden assumptions |
| V2/V1 import-boundary check | Task 2.0 / Task 9.0 | All V2 implementation slices | Fails if V2 core imports legacy Reading editor/runtime/parser/scoring helpers instead of using explicit engine boundaries or edge adapters |

## PRD-0048 Coverage Map

Use this map to decide which parent task owns each requirement family. Do not implement a requirement in a different parent task unless this task list is updated first.

| Requirement family | Owning parent tasks | Required outcome |
|---|---|---|
| Product boundary, non-migration, default-closed rollout, product open decisions | 0.0, 1.0, 9.0 | V2 is separate, legacy Reading stays intact, public exposure is guarded, and unresolved product choices cannot become hidden assumptions |
| Canonical model, task taxonomy, task groups, answer rules, anchors, numbering, validation severity | 2.0 | Every official task type maps to one family, all canonical objects are typed, visible numbering is derived, and invalid shapes fail closed |
| Firebase storage, repositories, Rules, indexes, query patterns, retention, deletion, transactions, role boundaries | 3.0 | Every path has an owning service, consuming existing surface, security boundary, query/index plan, retention rule, and atomicity decision |
| Teacher authoring, import, metadata, answer-key editing, settings, draft save/resume, revision, validation, preview, publish controls | 4.0, 5.0 | All teacher authoring runs through one Studio contract and ordered test-making pipeline |
| Passage assets, where-used graph, extraction, provenance, packaging, publish projections | 3.0, 5.0 | Reuse works without live-link corruption and published/student payloads are derived and sanitized |
| Student desktop/tablet runtime and phone runtime | 6.0 | Runtime consumes projections only and imitates current Reading V1 UI while preserving task meaning |
| Solo practice, homework, course, public library, live sessions, Teacher Lobby, Material Profile | 7.0 | Existing platform launch and management surfaces branch to V2 without new route trees or management pages |
| Submission, scoring, saved results, review, release policy, feedback, regrade | 8.0 | Existing result/feedback shells consume Reading V2 through adapters and student visibility remains sanitized |
| Loading, empty, error, retry, success, permission, conflict, partial-failure states | 4.0, 5.0, 6.0, 7.0, 8.0 | Every workflow state is handled inside the existing shell that owns the workflow |
| Security/privacy, forbidden field leakage, PII-safe observability | 3.0, 5.0, 8.0, 9.0 | Students never read author-only content, answer keys, diagnostics, import evidence, hidden provenance, or unreleased result data |
| Performance/scalability budgets | 9.0 | Studio, runtime, projection, launch, result, shared list/search, and dense-task rendering budgets exist before rollout |
| Analytics/observability | 4.0, 7.0, 9.0 | Reading V2 events use existing feature-registry/observability plumbing with explicit privacy-safe properties |
| End-to-end production readiness | 9.0 | Source-packet lint, gold vertical-loop test, no-new-surface confirmations, and affected regression tests pass |

## Junior Execution Granularity Standard

Every subtask must leave behind concrete code, tests, or an explicit senior-reviewed note.

Before coding any subtask, the implementer must complete this exact operating protocol:

1. Read the packet docs named by the parent task and the safety-rule docs named by the subtask.
2. Identify the exact file paths from the Relevant Files section that the subtask is allowed to create or edit.
3. Identify the existing platform owner when the task touches Teacher Lobby, Material Profile, launch, homework, course, library, live session, result, feedback, regrade, route guards, feature registry, Firebase Rules, or notifications.
4. If the needed owner, file path, route, storage path, event name, or UI state is not named in this task list, stop and request a task-list update before coding.
5. Add or update the positive and negative tests named by the subtask before marking the subtask complete.
6. Run the parent-task verification command once the parent task is complete, plus targeted tests for the changed files during the parent task.

For every implementation subtask, the implementer must record in the PR or task notes:

1. Packet docs consulted.
2. Files created or changed.
3. Public exports, route constants, storage path constants, feature flags, or component props added.
4. Fixtures used or added.
5. Positive tests added.
6. Negative/fail-closed tests added.
7. Exact verification commands run.

No implementation subtask is complete if it only "wires up" behavior without tests that prove:

- valid Reading V2 data is accepted
- invalid Reading V2 data fails closed
- legacy Reading data still follows the legacy path
- V2 projections are derived and sanitized
- visible IELTS numbering is derived from stable interaction identity

## Required Verification Command Matrix

Run these commands after the named parent task, adjusting only when the referenced test file does not yet exist because the current parent task is creating it.

| Parent task | Required verification command |
|---|---|
| 0.0 | `node scripts/check-prd0048-packet.mjs` |
| 0.0 | `node --test scripts/check-prd0048-packet.test.mjs` |
| 0.0 | `cmd /c npx vitest run src/services/reading-v2/fixtures/readingV2FixtureManifest.test.ts --reporter=basic` |
| 0.0 | `cmd /c npm run check:utf8 -- documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md documentation/tasks/tasks-0048-prd-reading-v2-studio-and-runtime.md documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md scripts/check-prd0048-packet.mjs scripts/check-prd0048-packet.test.mjs src/services/reading-v2/README.md src/services/reading-v2/fixtures/readingV2FixtureManifest.ts src/services/reading-v2/fixtures/readingV2FixtureManifest.test.ts` |
| 1.0 | `cmd /c npx vitest run src/constants/routes.test.ts src/config/featureRegistry.test.ts src/config/readingV2FeatureFlags.test.ts src/pages/TestPageRouter.test.tsx src/services/testStorage.test.ts src/components/TestEditor.test.tsx --reporter=basic` |
| 2.0 | `cmd /c npx vitest run src/types/readingV2.types.test.ts src/types/readingV2Taxonomy.test.ts src/services/reading-v2/readingV2ContractGuards.service.test.ts src/services/reading-v2/fixtures/readingV2GoldSamples.test.ts src/__tests__/readingV2BoundaryImports.test.ts --reporter=basic` |
| 3.0 | `cmd /c npx vitest run src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2Repository.service.test.ts src/services/reading-v2/readingV2OperationalMatrix.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/services/testStorage.test.ts src/services/draftCloudService.test.ts --reporter=basic` |
| 4.0 | `cmd /c npx vitest run src/pages/ReadingV2StudioPage.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx src/components/reading-v2/studio/ReadingV2MetadataPanel.test.tsx src/components/reading-v2/studio/ReadingV2TaskGroupEditor.test.tsx src/components/reading-v2/studio/ReadingV2AnswerRuleEditor.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx src/components/reading-v2/studio/ReadingV2ImportReviewPanel.test.tsx src/components/reading-v2/studio/ReadingV2StudioOperationalStates.test.ts --reporter=basic` |
| 5.0 | `cmd /c npx vitest run src/services/reading-v2/readingV2Validation.service.test.ts src/services/reading-v2/readingV2Projection.service.test.ts src/services/reading-v2/readingV2Repository.service.test.ts src/services/reading-v2/readingV2MaterialMetadata.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts --reporter=basic` |
| 6.0 | `cmd /c npx vitest run src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx src/components/reading-v2/runtime/ReadingV2DesktopRuntime.test.tsx src/components/reading-v2/runtime/ReadingV2PhoneRuntime.test.tsx src/components/reading-v2/runtime/ReadingV2V1Parity.test.tsx src/components/reading-v2/runtime/families --reporter=basic` |
| 7.0 | `cmd /c npx vitest run src/pages/TestPageRouter.test.tsx src/pages/StudentPracticePage.test.tsx src/pages/StudentHomeworkDetailPage.test.tsx src/pages/StudentLibraryPage.test.tsx src/pages/StudentCourseDetailPage.test.tsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic` |
| 8.0 | `cmd /c npx vitest run src/services/reading-v2/readingV2Scoring.service.test.ts src/services/reading-v2/readingV2Result.service.test.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/components/results/ReadingV2ReviewContentAdapter.test.tsx src/components/results/SharedSavedResultCore.test.tsx src/components/results/ReviewTab.test.tsx src/components/results/ResultDetailModal.test.tsx src/components/results/ResultSlidePanel.test.tsx --reporter=basic` |
| 9.0 | `node scripts/check-prd0048-packet.mjs` |
| 9.0 | `cmd /c npx vitest run src/config/readingV2Observability.test.ts src/config/readingV2PerformanceBudgets.test.ts --reporter=basic` |
| 9.0 | `cmd /c npx vitest run src/services/reading-v2 src/components/reading-v2 src/pages/TestPageRouter.test.tsx src/__tests__/readingV2BoundaryImports.test.ts --reporter=basic` |

## Visual Verification Matrix

Any parent task that creates or changes Studio, runtime, Teacher Lobby integration, or result/feedback integration UI must include real-browser verification once the affected route can render.

Required viewports:

| Surface | Desktop | Tablet | Phone |
|---|---:|---:|---:|
| Reading V2 Studio | 1366x900 | 1024x768 | 390x844 |
| Student runtime, V1 parity | 1366x900 | 1024x768 | 390x844 |
| Existing Teacher Lobby card/edit-modal entry with V2 material | 1366x900 | 1024x768 | 390x844 |
| Existing result/feedback shell with V2 result | 1366x900 | 1024x768 | 390x844 |

Visual verification must prove:

- page is nonblank
- required page-schema regions are present
- no text or controls overlap
- student desktop/tablet runtime visibly preserves current Reading V1 two-column layout
- student phone runtime visibly preserves current Reading V1 passage-first, Questions bottom-sheet, and pre-submit review summary flow
- Teacher Lobby uses the existing material-card/edit-modal pattern rather than a new Reading V2 lobby page
- V2 results render inside existing result/feedback shells rather than a standalone result-review page
- phone answer layers preserve passage position and active interaction
- dense structured-layout tasks do not degrade into cramped inline desktop tables on phone
- no student surface exposes answer keys, author diagnostics, or import evidence

## Current-State Assessment Summary

- The existing Reading implementation is spread across teacher creation, draft review, runtime, mobile, storage, and platform launch surfaces.
- Current grouped Reading support is partial and tied to legacy flat-question compatibility paths.
- Reading V2 must branch into a separate engine, schema, repository, studio, runtime, and projection path while reusing only safe platform shells.
- Reading V2 test making must follow the explicit access -> metadata -> editor -> answer-key/scoring -> settings -> validate/preview -> publish subpipeline and then return to existing platform relationships.
- Student runtime must imitate current Reading V1 UI from `src/skills/reading/components/ReadingTestPage.tsx`, `src/components/practice/IELTSPracticeView.tsx`, `src/components/test/TwoColumnLayout.tsx`, `src/components/test/IELTSQuestionsPanel.tsx`, and `src/components/test/mobile/*` without using those legacy components as V2 render authority.
- Teacher Lobby integration must use the existing material-card/edit-modal pattern in `src/pages/TeacherLobbyPage.jsx` and `src/components/modern/TestCard.jsx`, not a new lobby page.
- Result integration must use existing result/feedback shells such as `SharedSavedResultCore`, `ReviewTab`, `FeedbackTab`, `ResultDetailModal`, and `ResultSlidePanel`, not separate Reading V2 result-review pages.
- Relevant live-code surfaces include `src/types`, `src/services/test-creation`, `src/services/testStorage.ts`, `src/services/draftCloudService.ts`, `src/components/test`, `src/components/test/mobile`, `src/components/results`, `src/components/test-creation`, `src/pages/TestPageRouter.tsx`, `src/pages/TestReviewPage.tsx`, `src/pages/TestCreationPage.tsx`, `src/pages/TeacherLobbyPage.jsx`, `src/pages/StudentPracticePage.tsx`, `src/pages/StudentHomeworkDetailPage.tsx`, `src/pages/StudentLibraryPage.tsx`, `src/pages/StudentCourseDetailPage.tsx`, `src/pages/TeacherTestResultsPage.tsx`, `src/pages/StudentTestResultsPage.tsx`, `src/pages/AcademicRecordPage.tsx`, `src/routes/teacherRoutes.tsx`, and `src/routes/studentRoutes.tsx`.

## Relevant Files

- `package.json` - Adds the `check:prd0048-packet` command used by phase-0 packet enforcement.
- `scripts/check-prd0048-packet.mjs` - Source-packet lint script that verifies required PRD0048 docs exist and rejects stale future/missing-doc wording.
- `scripts/check-prd0048-packet.test.mjs` - Tests for the source-packet lint script if script-test infrastructure is available; otherwise cover through an npm script smoke check.
- `src/services/reading-v2/README.md` - Module-level implementation invariants for three-plane separation, fail-closed guards, derived projections, and legacy Reading boundaries.
- `src/__tests__/readingV2BoundaryImports.test.ts` - Static boundary test that forbids `src/services/reading-v2/**` and `src/components/reading-v2/**` from importing legacy Reading editor, runtime, parser, scoring, or flat-question reconstruction modules.
- `src/config/readingV2FeatureFlags.ts` - Default-closed Reading V2 rollout, passage-asset visibility, and product-name configuration constants.
- `src/config/readingV2FeatureFlags.test.ts` - Tests that unresolved product decisions default closed or use safe placeholder labels.
- `src/types/readingV2.types.ts` - New canonical Reading V2 domain contracts for documents, sections, stimuli, anchors, task groups, interactions, packaging, projections, attempts, results, release-policy views, and regrade artifacts.
- `src/types/readingV2.types.test.ts` - Tests for branded ID helpers, three-plane discriminators, and validation severity contracts.
- `src/types/readingV2Taxonomy.ts` - Canonical 16-type slug set, family mapping, aliases, user-facing labels, and taxonomy guards from the PRD0048 taxonomy packet.
- `src/types/readingV2Taxonomy.test.ts` - Unit tests for aliases, family mapping, unsupported slug rejection, legacy label rejection, and frozen PRD0048 family overrides.
- `src/services/reading-v2/readingV2ContractGuards.service.ts` - Runtime guard helpers for schema version, object ownership, task family, anchor, projection, and published snapshot invariants.
- `src/services/reading-v2/readingV2ContractGuards.service.test.ts` - Tests that invalid canonical, projection, and ownership shapes fail closed.
- `src/services/reading-v2/readingV2Numbering.service.ts` - Visible IELTS numbering and reorder/rebase helpers that preserve stable interaction IDs.
- `src/services/reading-v2/readingV2Numbering.service.test.ts` - Tests for derived visible numbering, placeholder skipping, and immutable stable IDs through reorder/rebase.
- `src/services/reading-v2/readingV2RuntimeBoundary.service.ts` - Projection-only runtime boundary entry that rejects canonical drafts, packaged materials, and legacy payloads before runtime work.
- `src/services/reading-v2/readingV2StoragePaths.service.ts` - V2 storage path registry for drafts, assets, materials, snapshots, projections, attempts, results, review indexes, and analytics outputs.
- `src/services/reading-v2/readingV2StoragePaths.service.test.ts` - Tests that V2 storage paths are isolated from legacy Reading paths and reject unknown path classes.
- `src/services/reading-v2/readingV2EngineDiscriminator.service.ts` - Explicit engine-discriminator helpers for shared platform branches into Reading V2 without shape-sniffing.
- `src/services/reading-v2/readingV2EngineDiscriminator.service.test.ts` - Tests for explicit V2 engine detection and shape-sniffing fallback rejection.
- `src/services/reading-v2/readingV2OperationalMatrix.ts` - Executable Firebase operational matrix for every Reading V2 path, owning service, consuming existing surface, allowed roles, read/write mode, query/index requirement, retention/deletion behavior, and projection-safety rule.
- `src/services/reading-v2/readingV2OperationalMatrix.test.ts` - Tests that every V2 path has an owner, consuming surface, role boundary, index/query decision, retention rule, and projection-safety rule.
- `src/__tests__/security/readingV2FirebaseRules.test.ts` - Emulator-backed security tests proving teachers/admins/students can only access Reading V2 data allowed by the operational matrix.
- `database.rules.json` - RTDB security rules for namespaced Reading V2 draft, asset, material, snapshot, projection, attempt, result, review, analytics, provenance, and where-used paths.
- `src/services/reading-v2/fixtures/readingV2FixtureManifest.ts` - Manifest mapping every official task type and engineering family to canonical and projection fixtures.
- `src/services/reading-v2/fixtures/readingV2CanonicalFixtures.ts` - Canonical fixture documents covering all five families and the 16 official task types.
- `src/services/reading-v2/fixtures/readingV2ProjectionFixtures.ts` - Projection fixtures for preview, student-safe, session-safe, review, and analytics payload shapes.
- `src/services/reading-v2/fixtures/readingV2GoldSamples.test.ts` - Tests that canonical fixtures validate, number, project, score, and review without legacy fallback.
- `src/services/reading-v2/readingV2Validation.service.ts` - Validation severity model, publish-gate issue matrix, and family-specific structural checks.
- `src/services/reading-v2/readingV2Validation.service.test.ts` - Unit tests for blocking, warning, info, and publish-gate behavior.
- `src/services/reading-v2/readingV2Projection.service.ts` - Generates preview, student-safe, session-safe, review, and analytics projections from canonical Reading V2 content.
- `src/services/reading-v2/readingV2Projection.service.test.ts` - Tests projection safety, answer-key stripping, author-diagnostic stripping, unsupported schema rejection, and derived-only behavior.
- `src/services/reading-v2/readingV2MaterialMetadata.service.ts` - Owns Reading V2 material/package metadata normalization, synchronization inputs, and safe draft-vs-published metadata rules.
- `src/services/reading-v2/readingV2MaterialMetadata.service.test.ts` - Tests required/default metadata, draft metadata isolation from live snapshots, and metadata output for Lobby/Profile/Library/assignment/result surfaces.
- `src/services/reading-v2/readingV2LaunchIntegration.service.ts` - Shared launch adapter that keeps Phase 7 surfaces on published metadata plus student-safe/session-safe projections and enforces default-closed rollout.
- `src/services/reading-v2/readingV2LaunchIntegration.service.test.ts` - Tests launch read plans, rollout blocking, projection-kind enforcement, canonical-draft rejection, and legacy fallback for Phase 7 launch surfaces.
- `src/services/reading-v2/readingV2TeacherLobbyIntegration.service.ts` - Teacher Lobby card/draft adapter that maps explicit Reading V2 entries to Studio modal modes before legacy `TestEditor`.
- `src/services/reading-v2/readingV2TeacherLobbyIntegration.service.test.ts` - Tests Reading V2 material-card revision mode, draft resume mode, and legacy card non-regression decisions.
- `src/services/materialDiscoveryService.ts` - Existing public-library material discovery service now merges Reading V2 library entries from approved relationship indexes, published metadata, and student-safe projections.
- `src/services/materialDiscoveryService.test.ts` - Tests Reading V2 public-library listing reads and legacy self-study history behavior.
- `src/types/solo.types.ts` - Shared solo/library material types now include the `reading-v2` skill discriminator for listing rows.
- `src/services/reading-v2/readingV2PublishPipeline.service.ts` - Orchestrates validate -> snapshot -> projection generation -> material metadata/index update -> platform relationship refresh for Reading V2 publish.
- `src/services/reading-v2/readingV2PublishPipeline.service.test.ts` - Tests publish ordering, blocking conditions, immutable snapshots, projection sanitation, index writes, and no historical result mutation.
- `src/services/reading-v2/readingV2PassageAssetWorkflow.service.ts` - Implements passage asset search/selection, where-used writes, and independent task-group material extraction workflow helpers.
- `src/services/reading-v2/readingV2PassageAssetWorkflow.service.test.ts` - Tests passage asset search, Studio selection, where-used graph writes, extraction independence, and hidden provenance behavior.
- `src/services/reading-v2/readingV2Repository.service.ts` - V2-specific repository for drafts, materials, passage assets, published snapshots, and provenance metadata.
- `src/services/reading-v2/readingV2Repository.service.test.ts` - Repository tests for draft/material separation, revision tokens, snapshot creation, and extraction copy behavior.
- `src/services/reading-v2/readingV2Import.service.ts` - Manual/AI import normalization into canonical V2 drafts, including uncertainty markers and task-family classification.
- `src/services/reading-v2/readingV2Import.service.test.ts` - Tests for import uncertainty, alias normalization, placeholder handling, and no legacy heuristic fallback.
- `src/services/reading-v2/readingV2Scoring.service.ts` - Scores attempts against the canonical snapshot and answer rules without legacy Reading heuristics.
- `src/services/reading-v2/readingV2Scoring.service.test.ts` - Tests scoring for completion, choice, binary judgement, matching, and structured-layout families.
- `src/services/reading-v2/readingV2Result.service.ts` - Creates attempt results, review payloads, release-policy views, and regrade artifacts from versioned snapshots.
- `src/services/reading-v2/readingV2Result.service.test.ts` - Tests result snapshot binding, review organization, release-policy sanitization, and immutable regrade history.
- `src/services/testStorage.ts` - Existing shared storage service to inspect for Reading V2 publish and launch compatibility; edit only if current storage ownership requires engine branching here.
- `src/services/testStorage.test.ts` - Existing tests to extend for Reading V2 engine branching and non-regression of legacy Reading storage.
- `src/services/draftCloudService.ts` - Existing draft service to inspect for V2-safe draft routing; use the V2 repository as owner unless this service is the current shared draft boundary that must branch.
- `src/services/draftCloudService.test.ts` - Existing tests to extend for V2 draft isolation and revision-token conflicts.
- `src/pages/ReadingV2StudioPage.tsx` - New full-page unified studio shell for create, import, draft resume, and published revision modes.
- `src/pages/ReadingV2StudioPage.test.tsx` - Tests for studio route modes, required panes, draft loading states, validation states, and conflict handling.
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx` - Shared Studio layout component matching the page-schema document and usable by both page and modal hosts.
- `src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx` - Component tests for two-column authoring layout, mode-specific regions, and host-independent state behavior.
- `src/components/reading-v2/studio/ReadingV2StudioModalAdapter.tsx` - Adapter that lets the existing Teacher Lobby edit-modal entry host or launch the same Studio shell without creating a second editor.
- `src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx` - Tests that Teacher Lobby modal entry delegates to Studio modes and does not use legacy `TestEditor`.
- `src/components/reading-v2/studio/ReadingV2MetadataPanel.tsx` - Material metadata setup/review surface for title, kind, duration, difficulty, target level, description, tags, visibility, and provenance summary.
- `src/components/reading-v2/studio/ReadingV2MetadataPanel.test.tsx` - Tests metadata validation, required/default fields, draft isolation, and relationship-facing metadata shape.
- `src/components/reading-v2/studio/ReadingV2TaskGroupEditor.tsx` - Canonical TaskGroup editing surface that owns grouped instructions, interactions, answer rules, anchors, and validation display.
- `src/components/reading-v2/studio/ReadingV2TaskGroupEditor.test.tsx` - Tests that task groups remain grouped semantic units and do not degrade into flat question cards.
- `src/components/reading-v2/studio/ReadingV2AnswerRuleEditor.tsx` - Questions-tab answer-key and scoring editor that writes directly into canonical task-group interactions.
- `src/components/reading-v2/studio/ReadingV2AnswerRuleEditor.test.tsx` - Tests answer-key completeness, family-specific scoring rules, and absence of a second answer-key source of truth.
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx` - Material-level Settings tab panel for visibility, duration guidance, reuse, packaging, accessibility/runtime advisories, and publish readiness.
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx` - Tests settings ownership boundaries and rejects homework/course/live/result-release state in material settings.
- `src/components/reading-v2/studio/ReadingV2ImportReviewPanel.tsx` - Review surface for AI/manual import candidates, uncertainty, and placeholder resolution.
- `src/components/reading-v2/studio/ReadingV2ImportReviewPanel.test.tsx` - Tests import uncertainty display and publish-blocking unresolved placeholders.
- `src/components/reading-v2/studio/ReadingV2StudioOperationalStates.ts` - Studio state contract for loading, empty, error, retry, conflict, permission-denied, save, import, validation, and publish outcomes using existing shell and notification patterns.
- `src/components/reading-v2/studio/ReadingV2StudioOperationalStates.test.ts` - Tests every Studio operational state and forbids new notification/workflow systems.
- `src/components/reading-v2/studio/ReadingV2PassageAssetPanel.tsx` - Passage asset search, version metadata, provenance, and extraction controls.
- `src/components/reading-v2/studio/ReadingV2PassageAssetPanel.test.tsx` - Tests passage asset version display and extraction-copy affordances.
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx` - Shared student runtime shell that renders branded V2 projections only, rejects canonical drafts/materials/legacy payloads, branches desktop/tablet vs phone layout, renders all five task families, captures answer state, and defines runtime operational states.
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx` - Runtime shell tests for projection input, unsupported version rejection, layout branching, phone question sheet/review flow, family renderers, answer-state persistence, operational states, and canonical draft rejection.
- `src/components/reading-v2/runtime/ReadingV2DesktopRuntime.tsx` - Desktop/tablet runtime that imitates current Reading V1 two-column UI while rendering from V2 projections.
- `src/components/reading-v2/runtime/ReadingV2DesktopRuntime.test.tsx` - Tests V1-like two-column layout behavior, grouped navigation, and no answer-sheet-first desktop redesign.
- `src/components/reading-v2/runtime/ReadingV2PhoneRuntime.tsx` - Phone runtime that imitates current Reading V1 passage-first UI with reachable question sheet and family-specific answer surfaces.
- `src/components/reading-v2/runtime/ReadingV2PhoneRuntime.test.tsx` - Tests V1-like passage-first behavior, bottom-sheet question flow, pre-submit review summary, reachable question navigation, and dense-task usability rules.
- `src/components/reading-v2/runtime/ReadingV2V1Parity.test.tsx` - Tests that V2 desktop/tablet and phone runtime preserve the required V1 UI landmarks while consuming V2 projections.
- `documentation/tasks/PRD0048/reading-v2-runtime-v1-parity-verification-notes.md` - Phase 6 V1 parity notes recording the V1 reference files, current V2 runtime alignment, intentional deviations, fixture coverage, and remaining real-browser verification gap.
- `src/components/reading-v2/runtime/families/*.tsx` - Family-specific renderers for completion, choice, binary judgement, matching, and structured-layout interactions.
- `src/components/reading-v2/runtime/families/*.test.tsx` - Family renderer tests for answer capture, reviewability, and no legacy heuristic reconstruction.
- `src/services/reading-v2/readingV2ResultAdapter.service.ts` - Edge adapter that converts Reading V2 saved result data into the shape needed by existing result/review/feedback shells without creating new result truth or importing legacy Reading scoring/rendering code.
- `src/services/reading-v2/readingV2ResultAdapter.service.test.ts` - Tests adapter routing, release-policy sanitization, grouped review payloads, and no leaked diagnostics/import evidence.
- `src/components/results/ReadingV2ReviewContentAdapter.tsx` - Grouped Reading V2 review content adapter rendered inside existing `ReviewTab` or `SharedSavedResultCore` surfaces.
- `src/components/results/ReadingV2ReviewContentAdapter.test.tsx` - Tests task-group-first review content, visible-number jump utility, release-policy behavior, and shell integration.
- `src/components/TestEditor.tsx` - Legacy IELTS editor modal now fails closed when a Reading V2 engine marker is present.
- `src/components/results/SharedSavedResultCore.tsx` - Existing saved-result shell that should host Reading V2 review/feedback through adapters, not be duplicated.
- `src/components/results/SharedSavedResultCore.test.tsx` - Existing tests to extend for Reading V2 result routing.
- `src/components/results/ReviewTab.tsx` - Existing review tab that should delegate Reading V2 content to the adapter where needed.
- `src/components/results/ReviewTab.test.tsx` - Existing tests to extend for Reading V2 grouped review content.
- `src/components/results/FeedbackTab.tsx` - Existing feedback tab that remains the feedback display owner for V2 saved results.
- `src/components/results/ResultDetailModal.tsx` - Existing result modal that must render V2 results through existing shell/adapters.
- `src/components/results/ResultSlidePanel.tsx` - Existing student-facing result slide panel that must render V2 results through existing shell/adapters.
- `src/pages/TeacherLobbyPage.jsx` - Existing teacher materials surface where Reading V2 material-card click/edit opens the adapted edit-modal entry, not a new lobby page.
- `src/components/modern/TestCard.jsx` - Existing material card component to extend for Reading V2 card click/edit behavior when Teacher Lobby card rendering owns that behavior.
- `src/pages/MaterialProfilePage.tsx` - Existing material profile surface to extend for V2-aware metadata, preview, extraction, and assignment actions when Material Profile owns that action.
- `src/pages/TestPageRouter.tsx` - Existing live test router that should branch to the Reading V2 runtime for V2 session payloads.
- `src/pages/TestPageRouter.test.tsx` - Existing router tests to extend for Reading V2 session-safe payload launch behavior.
- `src/pages/StudentPracticePage.tsx` - Existing solo practice route that should launch Reading V2 materials through shared practice plumbing.
- `src/pages/StudentPracticePage.test.tsx` - Existing tests to extend for Reading V2 solo launch and resume behavior.
- `src/pages/StudentHomeworkDetailPage.tsx` - Existing homework detail route that should launch assigned Reading V2 materials.
- `src/pages/StudentHomeworkDetailPage.test.tsx` - Existing tests to extend for Reading V2 homework launches and completion status.
- `src/pages/StudentLibraryPage.tsx` - Existing public-library/materials route that should display and launch Reading V2 materials.
- `src/pages/StudentCourseDetailPage.tsx` - Existing course material route that should display and launch Reading V2 course materials.
- `src/pages/StudentCourseDetailPage.test.tsx` - Existing course detail tests extended for Reading V2 metadata/projection enrichment.
- `src/pages/TeacherTestResultsPage.tsx` - Existing teacher result surface that should open Reading V2 results through existing result/feedback shells.
- `src/pages/StudentTestResultsPage.tsx` - Existing student result surface that should open Reading V2 results through existing result/feedback shells.
- `src/pages/AcademicRecordPage.tsx` - Existing student record surface that should open Reading V2 saved results through existing slide-panel behavior.
- `src/pages/TestReviewPage.tsx` - Existing legacy review/publish page that must not become the V2 architectural base; add only safe redirects or explicit V2 exclusion when a V2 route could otherwise enter this page.
- `src/routes/teacherRoutes.tsx` - Teacher route registration for Reading V2 studio modes.
- `src/routes/teacherRoutes.test.tsx` - Route tests if adjacent route tests are added or available.
- `src/routes/studentRoutes.tsx` - Student launch route integration points for shared Reading V2 platform launches.
- `src/constants/routes.ts` - Route constants for Reading V2 studio entry points; do not add standalone Reading V2 result-review routes for this PRD.
- `src/constants/routes.test.ts` - Existing route constant tests to extend for Reading V2 route definitions.
- `src/config/featureRegistry.ts` - Feature registry entry and observability metadata for Reading V2 surfaces/actions.
- `src/config/featureRegistry.test.ts` - Existing feature-registry tests extended for Reading V2 studio routing and no standalone review routes.
- `output/playwright/reading-v2-studio-desktop.png` - Desktop real-browser Studio verification artifact at 1366x900.
- `output/playwright/reading-v2-studio-tablet.png` - Tablet real-browser Studio verification artifact at 1024x768.
- `output/playwright/reading-v2-studio-phone.png` - Phone real-browser Studio verification artifact at 390x844.
- `output/playwright/reading-v2-runtime-desktop-completion.png` - Desktop real-browser runtime verification artifact at 1366x900 using a completion projection fixture.
- `output/playwright/reading-v2-runtime-tablet-matching.png` - Tablet real-browser runtime verification artifact at 1024x768 using a matching projection fixture.
- `output/playwright/reading-v2-runtime-phone-structured.png` - Phone real-browser runtime verification artifact at 390x844 using a structured-layout projection fixture.
- `src/config/readingV2Observability.ts` - Reading V2 event catalog using existing feature-registry/observability plumbing, with privacy-safe required properties and success/error states.
- `src/config/readingV2Observability.test.ts` - Tests event names, required properties, privacy-safe identifiers, and no detached analytics stack.
- `src/config/readingV2PerformanceBudgets.ts` - Reading V2 performance budgets for Studio load, runtime load, dense-task render, projection generation, launch fetch, result adapter render, shared list/search, and content-size ceilings.
- `src/config/readingV2PerformanceBudgets.test.ts` - Tests that every named surface has a measurable budget and no rollout can ignore missing budgets.
- `src/services/reading-v2/readingV2NonMigrationGuards.service.ts` - Explicit non-migration guard that accepts only engine-marked Reading V2 payloads and refuses historical Reading auto-conversion.
- `src/services/reading-v2/readingV2NonMigrationGuards.service.test.ts` - Tests that historical Reading tests and V2-looking shapes without engine markers are ignored by V2 import/migration paths.
- `src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx` - Gold vertical-loop integration test for draft creation, validation, publish, launch, submit, result persistence, and existing review adapter rendering.
- `src/skills/reading/components/ReadingTestPage.tsx` - Existing Reading V1 live runtime to use as desktop/tablet visual reference only, not V2 engine.
- `src/components/practice/IELTSPracticeView.tsx` - Existing Reading V1 practice runtime to use as desktop/tablet visual reference only, not V2 engine.
- `src/components/test/mobile/MobileReadingExamScaffold.tsx` - Existing mobile Reading scaffold to imitate for V2 phone UI, not to use as the V2 engine.
- `src/components/test/mobile/MobileQuestionSheet.tsx` - Existing phone question-sheet behavior to imitate in V2.
- `src/components/test/mobile/MobileReviewSummary.tsx` - Existing pre-submit mobile review summary behavior to imitate in V2.
- `src/components/test/TwoColumnLayout.tsx` - Existing two-column layout reference that can inform V2 UI composition if it does not drag legacy contracts into V2.
- `src/components/test/IELTSQuestionsPanel.tsx` - Existing Reading question panel to treat as visual/interaction behavior reference only, not V2 canonical rendering authority.

### Notes

- Every implementation task that writes imports must first read `documentation/rules/codebase-hygiene.md` because `@mantine/*` imports are banned.
- Every implementation task that writes navigation, `<Link>`, redirect URLs, or notification links must first read `documentation/rules/navigation.md`.
- Every implementation task that creates a new page, route, user-facing button, form, workflow, rename, move, or delete must first read `documentation/rules/observability.md`.
- Every implementation task that touches student shell layout, mobile runtime, mobile tabs/filters, overlays, touch targets, overflow, drawers, or student data-loading paths must first read `documentation/rules/student-mobile-design.md` and `documentation/rules/student-data-loading.md`.
- Every implementation task that writes browser APIs, storage APIs, `dangerouslySetInnerHTML`, or direct `useNavigate()` usage must first read `documentation/rules/mobile-portability.md`.
- Do not use the legacy Reading editor or runtime as the Reading V2 architectural base.
- Do not implement teacher free-placement or absolute-position canvas as canonical truth.
- After Task 0.0 creates the source-packet lint command, run it before starting each parent task and before final rollout verification.
- Do not build runtime or result/feedback adapter components from ad hoc UI mock data; use canonical, projection, and saved-result fixtures created by Tasks 2.0, 5.0, and 8.0.
- Student runtime UI must be checked against `reading-v2-student-runtime-v1-parity-contract.md`; V1 is the UI reference, not the renderer foundation.
- All feature-area work must be checked against `reading-v2-feature-pipeline-matrix.md`; do not invent access points, owners, outputs, or shortcut pipelines.
- Test-making work must be checked against `reading-v2-test-making-pipeline.md`; do not implement metadata, answer keys, settings, or publish as disconnected products.
- Teacher Lobby work must be checked against `reading-v2-teacher-lobby-integration.md`; do not build a new Teacher Lobby page.
- Result work must be checked against `reading-v2-result-feedback-integration.md`; do not build standalone Reading V2 result-review pages.
- When a test needs a task example, prefer a named fixture tied to an official task-type doc instead of inventing an inline one-off shape.
- Before real-browser verification, clear noisy runtime logs and add targeted diagnostics only where needed; do not rely on stale console output as evidence.
- Use `cmd /c npx vitest run [optional/path/to/test/file] --reporter=basic` for targeted tests when implementation begins.
- Run `cmd /c npm run check:utf8 -- <paths...>` for changed text files.

## Tasks

- [x] 0.0 Establish source-packet, fixture, and enforcement foundation before feature code
  - **Acceptance Criteria:** Required PRD0048 packet paths are machine-checked; stale future/missing-doc wording is rejected; V2 module invariant notes are created; fixture and projection-shape strategy is explicit; Student Runtime V1 parity, Teacher Lobby integration, and result/feedback integration docs are present; unresolved product decisions are represented as default-closed guards or senior-review checkpoints.
  - [x] 0.1 Add a source-packet lint command or script that verifies every required PRD0048 packet file path in this task list exists.
  - [x] 0.2 Make the packet lint fail on stale wording such as missing page-schema docs, missing integration contracts, future TaskGroup docs, future family docs, future task-type docs, standalone V2 result-review pages, standalone top-level answer-key products, disconnected publish/review pages, or new Teacher Lobby page requirements.
  - [x] 0.3 Create initial `src/services/reading-v2/README.md` module notes covering three-plane separation, fail-closed validation, derived-only projections, and the legacy Reading boundary.
  - [x] 0.4 Create `readingV2FixtureManifest.ts` with one explicit entry for each official task type from `reading-v2-task-taxonomy-index.md`.
  - [x] 0.5 In the fixture manifest, map each official type to exactly one engineering family, one canonical fixture id, and one projection fixture id.
  - [x] 0.6 In the fixture manifest, include a coverage assertion that the five engineering families are all represented.
  - [x] 0.7 Define the projection fixture strategy for preview, student-safe, session-safe, review, and analytics payloads before runtime UI work starts.
  - [x] 0.8 Add `src/config/readingV2FeatureFlags.ts` with explicit default-closed constants: `READING_V2_ROLLOUT_MODE`, `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY`, and `READING_V2_PRODUCT_LABEL`.
  - [x] 0.9 Add tests proving `READING_V2_ROLLOUT_MODE` is not public-by-default while rollout remains unresolved.
  - [x] 0.10 Add tests proving passage assets are not broadly visible in Teacher Lobby unless `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY` explicitly enables that phase.
  - [x] 0.11 Add source-packet lint checks that require `reading-v2-feature-pipeline-matrix.md`, `reading-v2-test-making-pipeline.md`, `reading-v2-student-runtime-v1-parity-contract.md`, `reading-v2-teacher-lobby-integration.md`, and `reading-v2-result-feedback-integration.md`.
  - [x] 0.12 Add source-packet lint checks that reject deleted or stale references to `reading-v2-page-schema-teacher-lobby.md`, `reading-v2-page-schema-teacher-result-review.md`, and `reading-v2-page-schema-student-result-review.md`.
  - [x] 0.13 Add or document the npm command developers must run for source-packet linting before starting each parent task.
  - [x] 0.14 Run targeted UTF-8 checks for the new or edited foundation files.
- [x] 1.0 Establish Reading V2 boundaries, contract files, and source-of-truth enforcement
  - **Acceptance Criteria:** `src/services/reading-v2/` and `src/components/reading-v2/` exist; route/feature constants identify Reading V2 distinctly; tests prove V2 payload markers do not fall through to legacy Reading renderer code or standalone V2 review pages; module notes state projections are derived-only.
  - [x] 1.1 Confirm every task implementer reads the required PRD0048 packet before coding.
  - [x] 1.2 Create a `src/services/reading-v2/` module boundary for all Reading V2-only services.
  - [x] 1.3 Create a `src/components/reading-v2/` component boundary for Reading V2-only studio and runtime components.
  - [x] 1.4 Add route and feature naming constants for Reading V2 Studio entry points without reusing legacy Reading route names as internal engine identifiers and without adding standalone V2 result-review route constants.
  - [x] 1.5 Add explicit comments or guard helpers where legacy Reading code must not accept Reading V2 canonical payloads.
  - [x] 1.6 Document in code-level module README or barrel comments that V2 projections are derived-only and canonical documents are the source of truth.
  - [x] 1.7 Add tests that legacy Reading renderers reject or ignore V2-only payload markers instead of heuristically rendering them.
  - [x] 1.8 Add tests proving V2 result metadata routes through existing result/feedback shell adapters rather than new `src/components/reading-v2/review/` surfaces.
- [x] 2.0 Build the canonical Reading V2 domain model, taxonomy guards, and validation foundation
  - **Acceptance Criteria:** Canonical contracts model the three planes; all 16 task slugs and aliases are encoded; unknown slugs/families/schema versions fail closed; numbering helpers derive visible IELTS numbers without changing stable IDs; validation severities match the contract freeze; canonical fixtures exist for every family and official task type; contract guards reject invalid ownership, anchors, families, and projection input shapes; V2 core contracts do not depend on legacy Reading flat-question/editor/runtime/scoring types.
  - [x] 2.1 Define ID types and branded helpers for `documentId`, `sectionId`, `stimulusId`, `taskGroupId`, `interactionId`, `anchorId`, `optionSetId`, and `importEvidenceId`.
  - [x] 2.2 Define `ReadingDocument` and `Section` contracts exactly as canonical-plane objects, with ordered section/stimulus/task-group references.
  - [x] 2.3 Define `StimulusNode` and anchor contracts, including paragraph, inline blank, table-cell, flow-step, diagram hotspot, and annotation anchor kinds.
  - [x] 2.4 Define `TaskGroup` contracts from `reading-v2-taskgroup-object.md`, including official task type, engineering family, instruction blocks, answer-rule block, stimulus references, option-set references, ordered interactions, validation state, and layout hints.
  - [x] 2.5 Define `Interaction`, `OptionSet`, response-shape, scoring-rule, and review-label contracts with one interaction belonging to exactly one task group.
  - [x] 2.6 Define library/packaging contracts for `PassageAsset`, `PassageAssetVersion`, `TaskGroupMaterial`, `FullTest`, provenance records, where-used graph entries, and packaging governance state.
  - [x] 2.7 Define delivery/projection contracts for preview, student-safe, session-safe, review, analytics, attempts, results, release-policy views, and regrade artifacts.
  - [x] 2.8 Encode the three-plane separation with type names or discriminators that prevent canonical drafts, packaged materials, and projections from being passed interchangeably.
  - [x] 2.9 Encode immutable identity rules and helper functions for reorder/rebase behavior without mutating stable IDs.
  - [x] 2.10 Add canonical 16-task taxonomy slugs, aliases, labels, and engineering-family mappings from `reading-v2-task-taxonomy-index.md`.
  - [x] 2.11 Add schema-version guards that reject unsupported future versions instead of guessing or falling back to legacy logic.
  - [x] 2.12 Define family-specific interaction shapes for completion, choice, binary judgement, matching, and structured-layout families.
  - [x] 2.13 Implement validation severity types and publish-gate issue contracts from the contract freeze.
  - [x] 2.14 Implement `readingV2ContractGuards.service.ts` with fail-closed guards for canonical object ownership, anchors, task families, schema versions, and projection input boundaries.
  - [x] 2.15 Create canonical fixtures for all five engineering families and verify every official task type has at least one representative gold sample.
  - [x] 2.16 Add unit tests for taxonomy normalization, family mapping, numbering/rebase helpers, schema-version rejection, and validation severity behavior.
  - [x] 2.17 Add tests proving canonical fixtures validate, derive visible numbering, preserve stable IDs through reorder/rebase, and reject invalid ownership.
  - [x] 2.18 Add tests proving legacy category labels cannot override the frozen PRD0048 taxonomy mapping.
  - [x] 2.19 Add tests proving canonical drafts cannot be consumed by runtime/review APIs that require projections or published snapshots.
  - [x] 2.20 Add `src/__tests__/readingV2BoundaryImports.test.ts` to fail if V2 core folders import legacy Reading editor/runtime/parser/scoring modules, flat-question reconstruction helpers, or V1 grouped-task compatibility helpers.
  - [x] 2.21 Add code-level boundary notes to V2 type, guard, and runtime-entry files that state V1 is reference-only, V2 accepts explicit engine/projection inputs, and legacy conversions must live in edge adapters.
- [x] 3.0 Create V2-specific storage, repositories, versioning, and engine-branch infrastructure
  - **Acceptance Criteria:** V2 repository methods never write legacy Reading paths; autosave requires revision tokens; conflicts reject; published snapshots are immutable; passage assets track versions and dependencies; shared code branches by explicit V2 engine discriminator; Firebase paths, Rules expectations, index needs, retention/deletion behavior, and role boundaries are mapped to existing app owners and service/repository boundaries.
  - [x] 3.1 Create `readingV2StoragePaths.service.ts` with named constants or builder functions for drafts, passage assets, task-group materials, full tests, published snapshots, projections, attempts, results, review indexes, and analytics outputs.
  - [x] 3.2 Add tests proving every V2 storage path includes an explicit Reading V2 namespace or engine discriminator and does not overlap legacy Reading draft or published-test paths.
  - [x] 3.3 Implement draft repository methods for create, load, save, autosave, discard, duplicate, and list operations.
  - [x] 3.4 Implement revision-token conflict checks and forbid silent last-write-wins draft saves.
  - [x] 3.5 Add tests for stale revision token rejection, conflict recovery payloads, and unchanged stable object IDs across saves.
  - [x] 3.6 Implement published material repository methods that snapshot canonical content and never mutate live published snapshots in place.
  - [x] 3.7 Add tests proving published snapshots are immutable and republish creates a new snapshot/version rather than editing the old one.
  - [x] 3.8 Implement passage asset repository methods with version metadata, where-used graph writes, dependency-aware immutability rules, and derivative-asset creation.
  - [x] 3.9 Add tests proving passage asset edits do not silently mutate published dependent materials.
  - [x] 3.10 Add engine discriminator helpers so shared platform code can branch to Reading V2 without inspecting legacy Reading shapes.
  - [x] 3.11 Add tests proving shared storage and launch code branch by explicit V2 discriminator and reject shape-sniffing fallback.
  - [x] 3.12 Add repository tests for draft/material separation, revision conflicts, snapshot immutability, storage path isolation, and engine branching.
  - [x] 3.13 Create `src/services/reading-v2/readingV2OperationalMatrix.ts` with one entry for each Reading V2 path class: drafts, passage assets, task-group materials, full tests, published snapshots, preview payloads, student-safe tests, session-safe payloads, attempts, results, review indexes, analytics outputs, provenance, and where-used graph.
  - [x] 3.14 In `readingV2OperationalMatrix.ts`, require every entry to define owning service, consuming existing surface, allowed roles, read/write mode, query pattern, index requirement, expected read/write frequency class, retention/deletion behavior, projection-safety rule, and forbidden fields.
  - [x] 3.15 Add `src/services/reading-v2/readingV2OperationalMatrix.test.ts` proving every storage path from `readingV2StoragePaths.service.ts` has exactly one operational-matrix entry and no unowned V2 path exists.
  - [x] 3.16 Add `src/__tests__/security/readingV2FirebaseRules.test.ts` with emulator-backed coverage for teacher/admin draft and material access, student projection-only access, student result release-policy access, and forbidden reads of canonical drafts, answer keys, import evidence, author diagnostics, and hidden provenance.
  - [x] 3.17 Add tests proving V2 index/fan-out writes update only approved existing platform relationship indexes or explicitly namespaced Reading V2 projections consumed by existing surfaces.
  - [x] 3.18 Add tests proving query/index decisions cover passage asset search, Teacher Lobby card reads, Material Profile reads, student launch reads, session payload reads, result shell reads, review index reads, and analytics projection reads.
  - [x] 3.19 Add tests proving write operations that need atomicity use an explicit transaction or batch decision and that non-atomic writes fail closed without publishing half-generated payloads.
- [ ] 4.0 Implement the unified Reading V2 test-making Studio pipeline
  - **Acceptance Criteria:** Existing Teacher Lobby create/import/card/draft actions and approved direct Studio routes converge into the same Studio contract; create/import/draft/revise/duplicate/extract modes load the correct draft context; metadata setup is present before publish; answer keys and scoring rules are edited inside `Questions`; `Settings` contains only material-level settings; pasted text and supported uploaded source files import into the same editable draft model; incomplete placeholders and missing answer rules are visible and publish-blocking; conflicts show recovery options; preview is local-only; publish controls delegate to Task 5.0 services; published edits never mutate the live snapshot directly.
  - [x] 4.1 Read `documentation/rules/navigation.md`, `documentation/rules/observability.md`, `documentation/rules/codebase-hygiene.md`, and `documentation/rules/mobile-portability.md` before route/page/action implementation.
  - [x] 4.2 Read `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`, `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`, and `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`; implement the pipeline in this exact order: access -> mode resolution -> metadata -> editor -> answer-key/scoring -> settings -> validate/preview -> publish-control handoff -> return context.
  - [x] 4.3 Add teacher routes for `/teacher/reading-v2/create`, `/teacher/reading-v2/import`, `/teacher/reading-v2/drafts/:draftId`, and `/teacher/reading-v2/materials/:materialId/revise`.
  - [x] 4.4 Implement a mode/context resolver for create blank, create from import, resume draft, revise published, duplicate material, and extract task-group material; it must preserve the caller return context for Teacher Lobby, Material Profile, or direct Studio route.
  - [x] 4.5 Build `ReadingV2StudioPage` so all Studio modes use the same shell and differ only by mode, loaded draft context, and return context.
  - [x] 4.6 Implement `src/components/reading-v2/studio/ReadingV2MetadataPanel.tsx` as the Studio-owned metadata step for title, Reading V2 marker, material kind, duration/time guidance, difficulty, target band/level, description, tags/topics, visibility/library eligibility, ownership, and provenance summary.
  - [x] 4.7 Ensure metadata writes to draft/package metadata only and never mutates the live published snapshot or canonical task semantics until the approved publish or safe metadata path runs.
  - [x] 4.8 Implement the visual structure from `reading-v2-page-schema-studio.md`, including stable two-column authoring/preview mental model, structure outline, main editing surface, contextual properties panel, and metadata/readiness status without adding a new lobby page.
  - [x] 4.9 Implement tab behavior exactly for `Stimulus`, `Questions`, and `Settings`; do not add a fourth answer-key tab or hidden task-logic editor in Settings.
  - [x] 4.10 Implement manual TaskGroup creation without converting grouped tasks into flat question-card authority.
  - [x] 4.11 Implement top-level task-group and linked-stimulus reordering while preserving stable IDs and derived numbering.
  - [x] 4.12 Implement `src/components/reading-v2/studio/ReadingV2AnswerRuleEditor.tsx` as the Questions-tab control for answer keys, acceptable answers, normalization, matching mappings, binary judgement vocabularies, structured-layout blank/step/target keys, and score values; all writes must go into the canonical task-group interaction model.
  - [x] 4.13 Implement grouped instruction editing and group-level answer-rule editing inside the canonical draft model near the task group they govern.
  - [x] 4.14 Implement `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx` as the Settings-tab panel for material-level settings only: metadata shortcut, visibility/library eligibility, default duration, tags/topics, reuse/packaging state, accessibility/runtime advisories, and publish readiness.
  - [x] 4.15 Explicitly exclude homework due dates, assigned students/classes, live session code/state, course placement/order, per-assignment release overrides, and final result release state from Reading V2 material settings; those remain owned by existing platform features.
  - [x] 4.16 Implement anchor repair UI for broken paragraph, inline blank, table-cell, flow-step, diagram hotspot, and annotation anchors.
  - [x] 4.17 Implement AI/manual import review for pasted source text and explicitly supported uploaded source files, ensuring imported content normalizes into the same editable canonical draft model with uncertainty markers and publish-blocking placeholders.
  - [x] 4.18 Implement draft save/resume/autosave UI using repository revision tokens and conflict recovery options.
  - [x] 4.19 Implement published edit flow that opens or creates a draft revision while the currently published material remains live.
  - [x] 4.20 Implement `ReadingV2StudioModalAdapter` for the existing Teacher Lobby edit-modal pattern; it must delegate to Studio modes and must not duplicate editor state or use legacy `TestEditor`.
  - [x] 4.21 Wire Validate, Preview, and Publish buttons so validation runs against the canonical draft, preview uses teacher-only local state, and publish calls the Task 5.0 publish pipeline only after validation succeeds.
  - [x] 4.22 Add observability metadata for create, import, metadata edit, draft resume, revision open, save draft, answer-key edit, settings edit, validate, preview, publish, discard, extract, inspect provenance, inspect import evidence, and modal open actions as those actions are introduced.
  - [x] 4.23 Add Studio component tests for mode routing, modal-host delegation, draft loading, metadata validation, task-group editing, answer-key/scoring completeness, Settings ownership boundaries, import uncertainty, publish-blocking placeholders, revision conflicts, preview local-only behavior, and no freeform-canvas source-of-truth behavior.
  - [x] 4.24 Add real-browser visual verification for Studio at 1366x900, 1024x768, and 390x844 against `reading-v2-page-schema-studio.md` and `reading-v2-test-making-pipeline.md`.
  - [x] 4.25 Create `src/components/reading-v2/studio/ReadingV2StudioOperationalStates.ts` defining Studio loading, empty, error, retry, conflict, permission-denied, save-success, import-failure, validation-failure, publish-success, and publish-failure states using existing app shell and notification patterns rather than a new notification or workflow system.
  - [x] 4.26 Add `src/components/reading-v2/studio/ReadingV2StudioOperationalStates.test.ts` proving every Studio mode handles those states and no state creates a new notification, modal, or workflow system outside existing app patterns.
- [x] 5.0 Implement publish, projection, passage-asset, extraction, provenance, and reuse workflows
  - **Acceptance Criteria:** Publish blocks invalid drafts; publish re-runs validation and answer-key completeness checks; each projection type is generated from canonical V2 content and package metadata; student/session payloads contain no answer keys or author diagnostics; material metadata and indexes update existing Lobby/Profile/Library/Homework/Course/Live/Solo/Result relationship surfaces; extracted materials are independent copies with historical provenance only; projection fixtures exist for every projection class; projection safety tests fail on unsafe fields.
  - [x] 5.1 Read `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md` sections 3.2, 3.3, and 3.4 before implementing passage asset lifecycle, extraction, validation, preview, publish, or projection work.
  - [x] 5.2 Implement validation execution before preview and publish, including blocking, warning, and informational issue display.
  - [x] 5.3 Implement publish gate enforcement so blocking issues and unresolved draft placeholders cannot publish.
  - [x] 5.4 Implement preview projection generation from canonical drafts for teacher-only preview with local-only answer state.
  - [x] 5.5 Implement student-safe projection generation that strips answer keys, import evidence, author diagnostics, and review-only metadata.
  - [x] 5.6 Implement session-safe projection generation for live session launches with no answer keys or author-only fields.
  - [x] 5.7 Implement review projection generation as a derived output that preserves grouped instructions, stimulus context, stable IDs, and visible question numbers.
  - [x] 5.8 Implement analytics projection generation as a derived output that cannot become editable content truth.
  - [x] 5.9 Implement `readingV2MaterialMetadata.service.ts` so published material metadata derives from draft/package metadata and is suitable for Teacher Lobby cards, Material Profile, library listings, assignment pickers, live launch summaries, and result identity display.
  - [x] 5.10 Implement `readingV2PublishPipeline.service.ts` to orchestrate validation, immutable snapshot creation, projection generation, material metadata/index writes, where-used writes, and return-context refresh notifications.
  - [x] 5.11 Add tests proving publish updates existing platform relationship indexes through approved repository/service boundaries and does not make library, homework, course, live session, solo practice, or result surfaces read canonical drafts.
  - [x] 5.12 Add tests proving preview creates no live session, assignment, attempt, homework, course, or result records.
  - [x] 5.13 Implement passage asset search and selection for studio authoring.
  - [x] 5.14 Implement passage asset where-used graph reads and writes.
  - [x] 5.15 Implement passage-plus-task-group extraction as a new independent material copy with hidden provenance metadata.
  - [x] 5.16 Add tests that source edits do not flow into extracted copies and extracted-copy edits do not mutate source passage assets.
  - [x] 5.17 Add projection safety tests covering student payload sanitization and derived-only regeneration.
  - [x] 5.18 Create projection fixtures for preview, student-safe, session-safe, review, and analytics payloads from the canonical fixtures.
  - [x] 5.19 Add regeneration tests proving projection output changes only through canonical or packaging-plane changes, never manual projection edits.
  - [x] 5.20 Add negative tests proving answer keys, author diagnostics, import evidence, and review-only metadata cannot leak into student-safe or session-safe payloads.
  - [x] 5.21 Add tests proving manual edits to projection fixtures are rejected or overwritten by regeneration from canonical fixtures.
  - [x] 5.22 Add partial-failure tests proving failed projection/index generation does not leave publish marked successful, does not expose half-generated student payloads, and preserves the previous live snapshot until a coherent publish completes.
- [ ] 6.0 Implement student Reading V2 runtime renderers for desktop/tablet and phone by task family
  - **Acceptance Criteria:** Runtime accepts projection payloads only; desktop/tablet imitates current Reading V1 two-column stimulus/full-question-panel layout; phone imitates current Reading V1 passage-first, floating/reachable Questions action, bottom-sheet question flow, and pre-submit review summary; phone interactions preserve passage scroll, active interaction, active task group, and answer state; completion, choice, binary judgement, matching, and structured-layout families render, save answers, and preserve reviewable answer identity.
  - [x] 6.1 Read `documentation/rules/student-mobile-design.md`, `documentation/rules/student-data-loading.md`, and `documentation/rules/mobile-portability.md` before changing student runtime or mobile behavior.
  - [x] 6.2 Read `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md` section 3.5 before runtime work and verify every runtime input is a projection, never a canonical draft.
  - [x] 6.3 Build `ReadingV2RuntimeShell` that accepts only Reading V2 projections and rejects canonical drafts/materials as runtime input.
  - [x] 6.4 Read `reading-v2-student-runtime-v1-parity-contract.md` and record the current V1 reference files used for desktop/tablet and phone comparison before writing runtime UI.
  - [x] 6.5 Implement desktop/tablet two-column runtime from `reading-v2-page-schema-student-runtime-desktop-tablet.md` and the V1 parity contract: left passage/stimulus, right full grouped question panel, boxed group instructions, V1-like answer controls, no answer-sheet-first redesign.
  - [x] 6.6 Implement phone passage-first runtime from `reading-v2-page-schema-student-runtime-phone.md` and the V1 parity contract: compact header, passage tabs, floating/reachable Questions action, bottom-sheet question surface, pre-submit review summary, preserved passage scroll, active question/task-group state, and answer state across answer-layer transitions.
  - [x] 6.7 Implement completion-family projection input handling from `reading-v2-family-completion.md`.
  - [x] 6.8 Implement completion-family desktop/tablet rendering, phone focused answer entry, answer capture, clear/revise behavior, and review identity.
  - [x] 6.9 Add completion-family tests for sentence, summary-text, note, and short-answer fixtures.
  - [x] 6.10 Implement choice-family projection input handling from `reading-v2-family-choice.md`.
  - [x] 6.11 Implement choice-family desktop/tablet rendering, phone tap targets/chips, answer capture, clear/revise behavior, and review identity.
  - [x] 6.12 Add choice-family tests for multiple-choice, multiple-select, and summary-completion-list fixtures.
  - [x] 6.13 Implement binary-judgement-family projection input handling from `reading-v2-family-binary-judgement.md`.
  - [x] 6.14 Implement binary-judgement desktop/tablet rendering, phone large locked-vocabulary controls, answer capture, clear/revise behavior, and review identity.
  - [x] 6.15 Add binary-judgement tests for true-false-not-given and yes-no-not-given fixtures.
  - [x] 6.16 Implement matching-family projection input handling from `reading-v2-family-matching.md`.
  - [x] 6.17 Implement matching desktop/tablet rendering, phone tap-to-assign interaction, answer capture, clear/revise behavior, option reuse rules, and review identity.
  - [x] 6.18 Add matching tests for headings, information, features, and sentence-endings fixtures.
  - [x] 6.19 Implement structured-layout projection input handling from `reading-v2-family-structured-layout.md`.
  - [x] 6.20 Implement table-completion desktop/tablet rendering and phone zoomable read-only overview with synchronized focused answer entry.
  - [x] 6.21 Implement flowchart-completion desktop/tablet rendering and phone simplified structural overview with active flow-step answer entry.
  - [x] 6.22 Implement diagram-labeling desktop/tablet rendering and phone zoomable diagram with large target highlight plus structured label picking or focused answer entry.
  - [x] 6.23 Add structured-layout tests for table, flowchart, and diagram fixtures, including phone no-cramped-inline-table behavior.
  - [x] 6.24 Add runtime tests for desktop/tablet V1 layout landmarks, phone V1 layout landmarks, unsupported schema rejection, grouped context visibility, and answer-state persistence hooks.
  - [x] 6.25 Drive each family renderer from projection fixtures rather than ad hoc component-only mock data.
  - [x] 6.26 Add anti-regression tests proving V2 runtime renderers do not call legacy `IELTSQuestionsPanel.tsx` or legacy flat-question reconstruction.
  - [x] 6.27 Add runtime-shell tests proving canonical drafts, packaged materials, and legacy Reading payloads are rejected before renderer selection.
  - [x] 6.28 Add side-by-side V1 parity verification notes or screenshots for desktop/tablet and phone representative fixtures.
  - [x] 6.29 Add real-browser visual verification for student runtime at 1366x900, 1024x768, and 390x844 using representative completion, matching, and structured-layout fixtures.
  - [x] 6.30 Define and test runtime loading, empty projection, missing projection, unsupported schema, permission-denied, network-failure, submit-pending, submit-failure, duplicate-submit, and submit-success states inside `ReadingV2RuntimeShell`; reuse existing student launch shell patterns and do not create a new student error product.
- [ ] 7.0 Integrate Reading V2 launches with solo practice, homework, course, public library, and live sessions
  - **Acceptance Criteria:** Solo, homework, course, public library, and live session launches route V2 content into `ReadingV2RuntimeShell`; relationship surfaces use published V2 material metadata/projections rather than canonical drafts; Teacher Lobby uses existing material-card/edit-modal behavior for V2 create/import/resume/revise/assign/preview entries; no new Teacher Lobby page or Reading-only filter rail is introduced; tests prove legacy Reading launch and card behavior remains unchanged.
  - [x] 7.1 Read `documentation/rules/navigation.md`, `documentation/rules/observability.md`, `documentation/rules/codebase-hygiene.md`, `documentation/rules/student-data-loading.md`, and `documentation/rules/mobile-portability.md` before launch integration.
  - [x] 7.2 Read `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md` section 3.6 before platform launch work and record which published metadata/projection/index each surface reads.
  - [x] 7.3 Add engine branching in shared student launch plumbing so Reading V2 materials open the V2 runtime without separate student route trees.
  - [x] 7.4 Ensure launch branching is gated by `READING_V2_ROLLOUT_MODE` and rejects public exposure while default closed.
  - [x] 7.5 Integrate Reading V2 with solo practice launch/resume flows in `StudentPracticePage` or its services.
  - [x] 7.6 Integrate Reading V2 with homework launches and completion status in `StudentHomeworkDetailPage` or its services.
  - [x] 7.7 Integrate Reading V2 with course material launches in `StudentCourseDetailPage` or shared course material utilities.
  - [x] 7.8 Integrate Reading V2 with public library browsing and launching in `StudentLibraryPage` or material library hooks.
  - [x] 7.9 Integrate Reading V2 with live session launch routing in `TestPageRouter` using session-safe projections.
  - [x] 7.10 Verify every launch or listing surface reads published metadata, student-safe/session-safe projections, or approved indexes, never canonical drafts.
  - [x] 7.11 Read `reading-v2-teacher-lobby-integration.md` before touching `TeacherLobbyPage.jsx`, `TestCard`, draft cards, or edit-modal behavior.
  - [x] 7.12 Adapt the existing Teacher Lobby material-card click/edit path so Reading V2 cards open the adapted edit-modal entry or approved Studio entry; do not build a new Teacher Lobby page, left rail, or Reading-only management console.
  - [x] 7.13 Ensure the adapted edit-modal entry delegates to `ReadingV2StudioModalAdapter` or the approved Studio route mode and never opens legacy `TestEditor` for V2 payloads.
  - [x] 7.14 Keep standalone passage asset exposure hidden in Teacher Lobby unless `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY` explicitly enables that later phase.
  - [x] 7.15 Add observability metadata for every new launch, assign, preview, revise, resume, card open, and modal open action when the action is introduced.
  - [x] 7.16 Add tests for each platform context to prove Reading V2 launches through shared shells but does not enter legacy Reading runtime interpretation.
  - [x] 7.17 Add tests proving Teacher Lobby V2 cards use existing card/edit-modal behavior and legacy Reading, Listening, Writing, and THCS launch/card behavior is unchanged by V2 engine branching.
  - [x] 7.18 Define and test launch/listing empty, loading, permission-denied, missing/deleted material, rollout-disabled, session-expired, homework-not-assigned, course-access-denied, library-unavailable, and projection-fetch-failure states inside the existing owning surfaces named in 7.5-7.9.
- [ ] 8.0 Implement Reading V2 submission, result snapshotting, existing result/feedback integration, release policy, and regrade semantics
  - **Acceptance Criteria:** Attempts bind to snapshot/session projection versions; scoring reads V2 canonical answer rules only; existing result shells can open Reading V2 saved results; Reading V2 review content is task-group-first inside existing review/feedback surfaces; student visibility is release-policy sanitized; regrade creates a new artifact without mutating historical result truth; no standalone Reading V2 result-review pages are created.
  - [x] 8.1 Read `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md` section 3.7 before submission, scoring, result, feedback, release-policy, or regrade work.
  - [x] 8.2 Implement attempt state capture against a specific published snapshot or session projection version.
  - [x] 8.3 Add tests proving attempt records store stable interaction IDs and visible question numbers.
  - [x] 8.4 Implement submission processing that scores from Reading V2 canonical snapshot data, not legacy Reading heuristics.
  - [x] 8.5 Add scoring tests for completion, choice, binary judgement, matching, and structured-layout fixtures.
  - [x] 8.6 Implement result records that bind permanently to the snapshot version used at attempt time.
  - [x] 8.7 Read `reading-v2-result-feedback-integration.md` before touching result pages, result shells, review tabs, feedback tabs, or regrade behavior.
  - [x] 8.8 Implement `readingV2ResultAdapter.service.ts` so Reading V2 saved results can be consumed by the existing result/review/feedback system without creating new result truth.
  - [x] 8.9 Implement `ReadingV2ReviewContentAdapter` inside `src/components/results/` for grouped Reading review content; do not create `src/components/reading-v2/review/ReadingV2TeacherReview.tsx` or `ReadingV2StudentReview.tsx`.
  - [x] 8.10 Wire existing `SharedSavedResultCore`, `ReviewTab`, `ResultDetailModal`, and `ResultSlidePanel` to route Reading V2 records to the adapter where needed.
  - [x] 8.11 Preserve existing `FeedbackTab`, teacher feedback, student feedback, release-policy, and regrade shell behavior for Reading V2 results.
  - [x] 8.12 Implement review payloads that keep grouped instruction and stimulus context visible enough to understand answers while respecting release policy.
  - [x] 8.13 Implement regrade as a new versioned result artifact, not mutation of historical result truth.
  - [x] 8.14 Add tests for scoring, snapshot binding, existing-shell routing, release-policy sanitization, teacher review grouping, student review grouping, feedback compatibility, and regrade history.
  - [x] 8.15 Add negative tests proving student result/feedback surfaces cannot see unreleased answers, answer keys, author diagnostics, provenance, or import evidence.
  - [x] 8.16 Add tests proving no standalone Reading V2 result-review routes/pages/components were introduced.
  - [x] 8.17 Add real-browser visual verification for existing result/feedback shells with Reading V2 results at 1366x900, 1024x768, and 390x844.
  - [x] 8.18 Define and test result/review loading, empty, missing/deleted result, permission-denied, release-policy-blocked, adapter-failure, feedback-save-failure, regrade-conflict, regrade-success, and regrade-failure states inside the existing result/feedback shells.
- [ ] 9.0 Add implementation safety tests, observability, migration guards, and rollout controls
  - **Acceptance Criteria:** Reading V2 actions are registered for observability through the existing feature registry; rollout guard prevents accidental broad exposure; no historical Reading tests auto-migrate; source-packet lint passes; gold vertical-loop integration test passes; affected legacy route/page tests pass; performance budgets and operational error events exist for existing route/list/result/launch surfaces; UTF-8 checks pass for changed text files.
  - [x] 9.1 Read `documentation/rules/observability.md` before adding user-facing actions, pages, workflows, and feature-registry entries.
  - [x] 9.2 Read `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md` section 3.8 before rollout, observability, non-migration, or vertical-loop work.
  - [x] 9.3 Add feature registry entries and observability metadata for Reading V2 studio, publish, extraction, launch, submit, existing result-shell review, feedback, and regrade actions.
  - [x] 9.4 Wire `READING_V2_ROLLOUT_MODE` into route, lobby, launch, and public-library exposure checks.
  - [x] 9.5 Add explicit non-migration guardrails so historical Reading tests are not silently converted into V2 in the first release.
  - [x] 9.6 Add tests proving historical Reading tests are ignored by V2 import/migration paths unless a future explicit migration task exists.
  - [x] 9.7 Add a gold vertical-loop fixture and integration test that exercises create draft, validate, publish, launch, submit, existing teacher result/feedback review, and existing student result/feedback review without entering legacy Reading interpretation.
  - [x] 9.8 Add regression tests proving legacy Reading, Listening, Writing, THCS, homework, course, library, and live-session flows still route correctly.
  - [x] 9.9 Add real-browser smoke verification for Studio, student runtime V1 parity, Teacher Lobby card/edit-modal entry, and existing result/feedback shell integration after route integration is available.
  - [x] 9.10 Add targeted UTF-8 checks for all new/edited text files.
  - [x] 9.11 Run targeted Vitest suites with `cmd /c npx vitest run ... --reporter=basic`, starting with changed Reading V2 services/components before broader affected route/page tests.
  - [x] 9.12 Define the Reading V2 observability event catalog with event names, required properties, success/error states, privacy-safe identifiers, and ownership by existing feature registry/observability plumbing.
  - [x] 9.13 Define performance budgets for Studio load, runtime load, dense-task render, projection generation, launch payload fetch, result-shell adapter render, shared list/search behavior, and expected maximum content sizes.
  - [x] 9.14 Update documentation or release notes only after implementation behavior is verified against the PRD0048 packet.
  - [x] 9.15 Run the source-packet lint command and fail release readiness if required packet paths or stale future/missing-doc wording are found.
  - [x] 9.16 Confirm unresolved product decisions are either closed by senior review or guarded behind explicit rollout/configuration defaults before public exposure.
  - [x] 9.17 Confirm `READING_V2_PRODUCT_LABEL` is the only user-facing name source and no hardcoded alternate labels were introduced.
  - [x] 9.18 Confirm `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY` controls phase-1 standalone passage asset exposure.
  - [x] 9.19 Confirm no standalone Reading V2 result-review pages or routes were added.
  - [x] 9.20 Confirm no new Teacher Lobby page, Reading V2 lobby dashboard, or Reading-only filter rail was added.
  - [x] 9.21 Run the V2/V1 import-boundary test and confirm `src/services/reading-v2/**` and `src/components/reading-v2/**` have no direct dependencies on legacy Reading editor/runtime/parser/scoring modules.
  - [x] 9.22 Confirm every shared platform branch into Reading V2 uses an explicit engine discriminator and delegates through a named V2 adapter or runtime entry point, with no shape-sniffing fallback.
  - [x] 9.23 Confirm code-level boundary notes exist at the V2 type, repository, projection, runtime, launch adapter, and result adapter entry points before rollout.
- [ ] 10.0 Correct student Reading V2 runtime to ready-use IELTS test-taking behavior
  - **Acceptance Criteria:** The live student runtime renders real IELTS task content from V2 projections, not passage-anchor placeholders; desktop/tablet presents a V1-recognizable two-column exam surface with passage, grouped instructions, question ranges, answer status, and V1-like controls; phone presents the V1-recognizable passage-first flow with reachable Questions sheet and touch-safe controls; live-session launch is verified on the active student route with no runtime errors and with semantic checks for the representative PRD0048 material.
  - **Done Criteria:** Real PRD0048 live material at `/student-test/:sessionCode` shows correct task prompts/blanks for TFNG and summary-completion groups, answer count updates and clears correctly, task-group switching preserves answer state, desktop/tablet/phone screenshots and DOM snapshots prove V1-like structure, targeted runtime/projection tests pass, UTF-8 targeted check passes, and browser console evidence includes `runtime_layout_ready` for the corrected projection.
  - **Not Complete If:** The runtime only loads without crashing, the right panel repeats passage paragraphs as question prompts, summary/note/sentence completion fixtures only prove generic text boxes, live submission remains claimed as complete while disabled by configuration, mobile renders a cramped desktop clone, or verification uses toy fixtures instead of the PRD0048 material.
  - [x] 10.1 Read `documentation/rules/student-mobile-design.md`, `documentation/rules/student-data-loading.md`, `documentation/rules/mobile-portability.md`, `documentation/rules/codebase-hygiene.md`, `documentation/rules/react-patterns.md`, and the student runtime page-schema/parity docs before changing runtime code.
  - [x] 10.2 Audit `ReadingV2RuntimeShell`, projection generation, import normalization, fixtures, and live PRD0048 projection data to identify every place student-visible prompt/blanks are missing, inferred from anchors, or represented only by placeholder text.
  - [x] 10.3 Extend the V2 projection/runtime contract so interactions can carry student-visible prompt text or structured blank context derived from canonical/import data while preserving answer-key sanitization and stable interaction identity.
  - [x] 10.4 Correct completion-family rendering so summary, note, sentence, and short-answer tasks render real prompt/blank content and word-limit cues instead of whole passage paragraphs.
  - [x] 10.5 Improve binary-judgement rendering so TFNG/YNNG groups show compact V1-like statement rows, locked vocabulary controls, and answered/unanswered state without flattening the group into unrelated cards.
  - [x] 10.6 Apply V1-like desktop/tablet exam styling to the runtime shell: compact header, question range navigator, scrollable passage column, grouped right panel, restrained native controls, and no raw browser-default presentation.
  - [x] 10.7 Apply phone runtime improvements that preserve passage-first reading, open/close Questions sheet behavior, 44px touch targets, answer-state persistence, and no horizontal overflow at 390px and 320px.
  - [x] 10.8 Add or update realistic tests using PRD0048-style TFNG and summary-completion projection fixtures that fail if prompts fall back to passage paragraphs or if word-limit/task instructions drift.
  - [x] 10.9 Verify live student session on port 5173 with Student quick-login and active Reading V2 session; capture DOM snapshots, console evidence, and screenshots at desktop and phone widths proving the corrected runtime behavior.
  - [x] 10.10 Record any remaining first-release blockers separately, especially trusted submission endpoint/configuration, without marking student runtime behavior complete if the blocker prevents submit/result readiness.
    - **Evidence:** `cmd /c npx vitest run src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/services/reading-v2/readingV2Projection.service.test.ts src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx --reporter=basic` passed with 41 tests. Targeted UTF-8 check passed. Browser verification on `/student-test/VGBHI7` showed real Q1 TFNG statements, Q6-13 summary blanks with `Word limit: 1`, desktop/tablet two-column structure, phone passage-first bottom-sheet structure, answer count update/clear, and `[Diag][ReadingV2Runtime] runtime_layout_ready` for desktop-tablet and phone.
    - **Current Blocker:** Parent task remains unchecked because trusted submit is still disabled when `VITE_READING_V2_SUBMISSION_ENDPOINT` is absent, so the student runtime is corrected for test-taking interaction but not yet first-release complete for submit/result readiness.
- [x] 11.0 Port the full documented V1 student Reading UI contract into the V2-native runtime
  - **Acceptance Criteria:** The V2 runtime implements the V1 student test-taking intent from recent documentation, not only the current V2 code shape: desktop/tablet has compact exam header, resizable two-column passage/questions layout, passage controls, full active-section grouped question panel, footer navigator, floating previous/next controls, V1-like family controls, and honest submit readiness; phone has compact mobile header, sticky passage tabs, passage-first reading, dynamic Questions FAB, near-fullscreen bottom sheet with synced passage tabs and active-section grouped questions, and section-grouped pre-submit review.
  - **Done Criteria:** `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-ui-port-audit.md` records the documented V1 feature inventory, V2 renders from projection data without importing legacy Reading runtime files, focused runtime tests prove the desktop full-section panel and phone sheet/review flow, browser verification on `/student-test/:sessionCode` proves desktop and phone structure with the active PRD0048 material, and targeted UTF-8 checks pass.
  - **Not Complete If:** V2 is merely styled, desktop still renders one isolated task group as the primary panel, phone lacks passage tabs or a real bottom-sheet answer layer, answer controls remain generic placeholders, submit readiness is overstated while endpoint configuration is absent, or the audit relies only on code inspection without recent documentation.
  - [x] 11.1 Read recent V1/student-runtime intent docs before changing V2: PRD0043, mobile Reading architecture, highlighting architecture, PRD0048 V1 parity contract, and desktop/tablet/phone page schemas.
  - [x] 11.2 Record the V1 feature inventory, interaction behavior, visual intention, current V2 gaps, and V2-native port decision in `reading-v2-student-runtime-v1-ui-port-audit.md`.
  - [x] 11.3 Refactor the desktop/tablet V2 runtime shell to render compact exam chrome, passage controls, resizable split, all active-section task groups, footer navigator, and floating previous/next controls.
  - [x] 11.4 Refactor phone runtime to render compact mobile header, passage tabs, passage-first surface, dynamic Questions FAB, synced passage tabs inside the sheet, active-section grouped question content, and section-grouped review.
  - [x] 11.5 Tighten V1-like answer controls for completion, binary judgement, choice, matching, and structured-layout families while keeping projection-only V2 data flow.
  - [x] 11.6 Update tests so V1 contract omissions fail, including desktop full active-section rendering and phone sheet/review behavior for PRD0048-style imported content.
  - [x] 11.7 Verify the live student view on port 5173 at desktop/tablet and phone widths, compare against the documented V1 contract, and record remaining blockers separately from completed runtime behavior.
    - **Evidence:** `cmd /c npx vitest run src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/services/reading-v2/readingV2Projection.service.test.ts src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx --reporter=basic` passed with 41 tests. Filtered TypeScript check reported no `ReadingV2RuntimeShell` or `reading-v2/runtime` errors. Targeted UTF-8 check passed for the task/audit/runtime/test files. Browser verification on `/student-test/VGBHI7` at desktop width showed the compact IELTS exam header, passage controls, resizable split, full Passage 1 grouped panel with Q1-5 and Q6-13 visible together, footer passage/question navigator, previous/next controls, real TFNG statements, real summary blanks, and answer count increasing to 2 of 40 after answering Q1 and Q6. Browser verification at 390x844 showed compact phone header, passage tabs, passage-first reading, dynamic `Questions 2/13` launcher, near-fullscreen bottom sheet with synced tabs and the full active-section grouped questions. Screenshots: `output/playwright/reading-v2-runtime-v1-port-desktop.png` and `output/playwright/reading-v2-runtime-v1-port-phone.png`. Console diagnostics included `[Diag][ReadingV2Runtime] runtime_layout_ready` for both `desktop-tablet` and `phone`; no browser console errors were present.
    - **Remaining Blocker:** Trusted submission remains unavailable because the launch still has no `VITE_READING_V2_SUBMISSION_ENDPOINT`; the UI now reports this honestly by disabling submit controls instead of implying submit/result readiness.
- [x] 12.0 Apply foundational Reading V2 runtime/session correctness fixes from review
  - **Acceptance Criteria:** Choice, multi-select, and matching answers submit in the canonical scoring-compatible label/text form rather than generated option ids; live Reading V2 sessions preserve teacher-controlled waiting, paused, completed, timer, and force-submit lifecycle behavior; timed practice/homework/course Reading V2 launches pass resolved timer settings into the runtime; runtime answers persist outside component-only state and rehydrate safely after refresh/remount without overwriting in-flight student edits.
  - **Done Criteria:** Runtime submit payload tests prove option answers submit as labels; runtime persistence tests prove refresh/remount rehydrates answers; lifecycle tests prove paused sessions lock answers and manual submit; timer tests prove expiry auto-submit only when a submit handler exists; `TestPageRouter` wires live session status/timer/force-submit/persistence into the runtime; `StudentPracticePage` wires resolved practice settings/timer/persistence into the runtime; student browser verification on the active Reading V2 route proves an answer survives reload with no console errors.
  - **Not Complete If:** Option answers are still stored/submitted only as generated option ids, Reading V2 live sessions bypass teacher pause/end/force-submit, homework/course timers are ignored, refresh loses answers, persistence hydration can overwrite freshly typed answers, or submit/timer diagnostics claim auto-submit when submission is not configured.
  - [x] 12.1 Convert single-choice, multi-select, and matching runtime submission values from internal option ids to scoring-compatible labels/text while preserving internal option-id state for UI selection.
  - [x] 12.2 Add runtime tests for scoring-compatible choice/multi-select/matching submission payloads.
  - [x] 12.3 Add runtime persistence props, platform-storage persistence, host-owned answer state callbacks, and race protection so hydration cannot overwrite answers typed before async storage returns.
  - [x] 12.4 Add runtime tests proving persisted answers rehydrate after remount and survive the hydration race.
  - [x] 12.5 Add runtime lifecycle props so waiting/paused/completed live sessions disable answer inputs and manual submit, with a visible status banner.
  - [x] 12.6 Wire live Reading V2 launches in `TestPageRouter` to RTDB session status, pause state, start time, paused duration, duration settings, teacher force-submit token, host answer state, and persistence key.
  - [x] 12.7 Add runtime timer props and expiry handling so configured timers display remaining time and auto-submit only when a submit handler exists.
  - [x] 12.8 Wire Reading V2 practice/homework/course launches in `StudentPracticePage` to the existing resolved settings cascade, timer start, host answer state, and persistence key.
  - [x] 12.9 Add low-volume dev diagnostics for persistence hydration, timer auto-submit, force-submit, and auto-submit result paths; verify browser evidence uses the diagnostics without flooding.
  - [x] 12.10 Verify focused Reading V2 runtime/projection/import and host page tests, targeted UTF-8 checks, filtered touched-file TypeScript scan, and the active student browser route on port 5173.
    - **Evidence:** `cmd /c npx vitest run src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/services/reading-v2/readingV2Projection.service.test.ts src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx src/pages/TestPageRouter.test.tsx src/pages/StudentPracticePage.test.tsx --reporter=basic` passed with 54 tests. `cmd /c npm run check:utf8 -- src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx src/components/reading-v2/runtime/ReadingV2RuntimeShell.css src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx src/pages/TestPageRouter.tsx src/pages/StudentPracticePage.tsx` passed. Filtered touched-file TypeScript scan reported no `ReadingV2RuntimeShell`, `TestPageRouter`, or `StudentPracticePage` errors; full repo typecheck still fails on unrelated pre-existing errors. Browser verification on `/student-test/VGBHI7` with Student quick-login showed the Reading V2 shell, answering Q6 changed the header to `Answered 1 of 40`, reload preserved `bronze` in `Question 6 answer`, console had 0 errors and only existing Mantine-rule warnings, and `[Diag][ReadingV2Runtime] answers_persistence_hydrated` emitted once for the rehydrated session-safe projection. Screenshot: `output/playwright/reading-v2-foundational-fixes-student.png`.
    - **Remaining Blocker:** The active dev launch still has no configured `VITE_READING_V2_SUBMISSION_ENDPOINT`, so submit controls remain honestly disabled and end-to-end trusted submit/result readiness remains a separate blocker.
- [x] 13.0 Complete foundational trusted Reading V2 submit endpoint setup
  - **Acceptance Criteria:** Reading V2 runtime submission has a deployable trusted HTTP endpoint that verifies Firebase Auth, loads canonical snapshot/review projection data server-side, scores without exposing answer keys to the browser, persists the canonical result before secondary indexes, writes Reading V2 attempt/result/review artifacts, updates existing result indexes and live-session completion state, and the browser no longer disables submit solely because `VITE_READING_V2_SUBMISSION_ENDPOINT` is absent.
  - **Done Criteria:** A trusted backend exports or routes `POST /api/reading-v2/submit` (currently the existing Cloudflare Worker, with Firebase Functions retained only as the earlier implementation wrapper/fallback); production uses `VITE_READING_V2_SUBMISSION_ENDPOINT` to target that backend; tests cover request parsing, canonical scoring, answer-key-free review payload, existing result/index writes, live-session completion updates, and client endpoint/auth behavior; backend typecheck/build, production build, and targeted UTF-8 checks pass.
  - **Not Complete If:** Submission can be marked ready while scoring still happens in the browser, canonical answer rules are fetched by the student client, result/index writes are browser-owned, production still depends on undeployed Firebase Cloud Functions, generated option IDs are scored as answers, or the endpoint can accept unauthenticated requests.
  - [x] 13.1 Replace the empty Firebase Functions placeholder with `readingV2Submit`, an authenticated HTTPS endpoint for Reading V2 runtime submissions. Historical note: Firebase Functions could not be deployed on the Spark-blocked project, so the current production path is the Cloudflare Worker route at `/api/reading-v2/submit`.
  - [x] 13.2 Add a trusted submission core that parses browser-safe requests, binds material/snapshot/review projection ids, scores against canonical snapshot interactions, builds grouped review payloads without `scoringRule`, and produces existing result/index writes.
  - [x] 13.3 Persist `test_results/{resultId}` before secondary updates, then fan out `reading_v2/attempts`, `reading_v2/results`, `reading_v2/review_indexes`, `test_results_by_student`, `test_results_by_session`, teacher/course/class indexes when ownership context exists, solo-practice indexes, and live-session completion flags.
  - [x] 13.4 Configure deployment surfaces for a trusted submit route. Historical Firebase Functions wiring exists, but current production alignment uses the existing backup Cloudflare Worker instead of Firebase Cloud Functions.
  - [x] 13.5 Preserve explicit endpoint override support through `VITE_READING_V2_SUBMISSION_ENDPOINT`; production must point this value at the Worker submit route unless a future approved backend replaces it.
  - [x] 13.6 Document the endpoint override in `env.example.txt`.
  - [x] 13.7 Add tests for trusted request parsing/scoring/persistence plan and client default endpoint/auth/failure behavior.
  - [x] 13.8 Record that `temp-a1437` is on Firebase Spark and cannot deploy Cloud Functions until Blaze is enabled; do not treat Firebase Functions as the required production path while the Worker endpoint exists.
  - [x] 13.9 Verify trusted-submit backend checks, focused Vitest suites, production build, and targeted UTF-8 checks.
    - **Evidence:** `cmd /c npm --prefix functions run build` passed. `cmd /c npx vitest run functions/src/readingV2SubmitCore.test.ts src/services/reading-v2/readingV2RuntimeSubmission.service.test.ts --reporter=basic` passed with 6 tests. `cmd /c npm run build` passed; existing PostCSS `@import must precede all other statements` warnings remain unrelated. `cmd /c npm run check:utf8 -- functions/src/index.ts functions/src/readingV2SubmitCore.ts functions/src/readingV2SubmitCore.test.ts src/services/reading-v2/readingV2RuntimeSubmission.service.ts src/services/reading-v2/readingV2RuntimeSubmission.service.test.ts firebase.json env.example.txt vitest.config.ts vite.config.js` passed.
    - **Deployment Finding:** `curl.exe -i -X OPTIONS https://us-central1-temp-a1437.cloudfunctions.net/readingV2Submit ...` returned `404 Page not found`, `cmd /c npx firebase functions:list --project temp-a1437` returned `No functions found`, and `cmd /c npx firebase deploy --only functions:readingV2Submit --project temp-a1437 --dry-run` failed because `temp-a1437` must be upgraded to Blaze before Cloud Build/Artifact Registry APIs can be enabled. Later alignment moved the production path to the existing Cloudflare Worker route, with Firebase Functions treated as historical/fallback implementation only.
    - **Alignment Note 2026-05-11:** `origin/main` now points production Reading V2 trusted submission at `https://r2-backup-worker.iamhuwng.workers.dev/api/reading-v2/submit`. The next release step is Cloudflare Worker deployment/auth verification, then Firebase Hosting deployment using that endpoint.
- [ ] 14.0 Close naked-eye V1/V2 visual parity gaps in the student Reading V2 runtime
  - **Acceptance Criteria:** V2 must be judged from the student's visual point of view against current V1 screenshots, not from feature presence alone. Desktop/tablet must visually align across the page shell, header, timer, passage column, question column, task instruction blocks, answer inputs, footer/navigation, submit flow, and review summary. Phone must visually align across the compact mobile header, passage tabs, passage-first reading surface, Questions FAB, bottom-sheet question layer, review summary, and submit confirmation affordances.
  - **Done Criteria:** The task records a broader naked-eye visual assessment, then applies the highest-impact V2-native CSS/layout fixes in `ReadingV2RuntimeShell.tsx` and `ReadingV2RuntimeShell.css` without importing legacy V1 runtime code. Verification includes the focused runtime test suite, targeted UTF-8 check, and updated browser screenshots or explicit notes for any remaining intentional visual deviations.
  - **Not Complete If:** V2 is called compliant because the same feature exists while typography, spacing, control placement, shell density, header/timer placement, question grouping, answer controls, footer behavior, mobile sheet shape, or review summary still look materially different to a student.
  - [x] 14.1 Perform the broader naked-eye visual assessment against V1 screenshots, including every perceptible shell, typography, spacing, border, color, affordance, and responsive state mismatch.
  - [x] 14.2 Align desktop header/timer/submit placement, page shell height, two-column split, passage controls, passage typography, and divider treatment to the V1 exam surface.
  - [x] 14.3 Align desktop question-panel visuals, grouped instruction blocks, TFNG/YNNG controls, free-text inputs, clear affordances, footer part/question navigation, and floating previous/next controls to the V1 mental model.
  - [x] 14.4 Align phone header, passage tabs, passage-first surface, Questions FAB, bottom-sheet question surface, and mobile review summary to the current V1 phone runtime.
  - [x] 14.5 Verify focused runtime behavior and UTF-8 guardrails, then record screenshots/evidence and any remaining visual deviations separately.
    - **Evidence:** `cmd /c npx vitest run src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx --reporter=basic` passed with 36 tests. `cmd /c npm run check:utf8 -- documentation/tasks/tasks-0048-prd-reading-v2-studio-and-runtime.md src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx src/components/reading-v2/runtime/ReadingV2RuntimeShell.css src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx` passed. Browser verification on `/student-test/VGBHI7` at 1366x900 and 390x844 had no console or page errors and captured final screenshots: `output/playwright/reading-v2-visual-parity-after-desktop.png`, `output/playwright/reading-v2-visual-parity-after-desktop-review.png`, `output/playwright/reading-v2-visual-parity-after-mobile-closed.png`, `output/playwright/reading-v2-visual-parity-after-mobile-sheet.png`, and `output/playwright/reading-v2-visual-parity-after-mobile-review.png`.
    - **Remaining Visual Review Items:** Desktop still exposes per-question `Clear` links because V2 supports explicit answer clearing; desktop submit still uses the V2 review panel rather than a native browser confirmation; mobile sheet keeps synced passage tabs inside the sheet per the PRD0048 phone contract even if a stricter V1 snapshot comparison may choose to hide them.
