# Findings for PRD-0048: IELTS Reading V2 System

> **Purpose:** Record the verified gap between the live IELTS Reading codebase and the broader target Reading V2 system described in PRD-0048 so reviewers do not mistake planned future state for current shipped truth.

---

## 1. Why This File Exists

PRD-0048 is intentionally a greenfield system direction. The live repo already has Reading creation, editing, delivery, and result code, but that code does not equal the target Reading V2 system.

This findings file records the concrete drift so planning, review, and future implementation stay honest about current repo reality.

---

## 2. Verified Drift Summary

### F1. Reading authoring and management are split across multiple workflows, not one coherent system

**Current reality**

- Reading creation and review are split across surfaces such as `CreateTestPage.tsx`, `TestCreationPage.tsx`, and `TestReviewPage.tsx`.
- Post-publish editing still runs through the generic `TestEditor.tsx`.

**Why this matters**

Reading V2 is supposed to provide one unified system across teacher management, authoring, revision, and delivery. The current stack is not already organized that way.

### F2. The generic editor is still largely flat-question-first

**Current reality**

- `src/components/TestEditor.tsx` and `src/components/QuestionEditorPanel.jsx` still center around individual edited questions.
- Some grouped task types have special handling, but the overall editor mental model is still question-card-first.

**Why this matters**

Reading V2 requires a canonical document model with first-class task groups and shared stimuli. The current editor cannot be treated as the V2 foundation without major architectural change.

### F3. The current runtime still contains heuristic Reading rendering paths

**Current reality**

- `src/components/test/IELTSQuestionsPanel.tsx` still contains direct task-type rendering logic.
- For legacy `table-completion` content, the component still attempts to infer headers, rows, and cells from pipe-delimited or colon-shaped question text when canonical grouped data is absent.

**Why this matters**

Reading V2 is explicitly trying to eliminate runtime guessing from flat strings. The live runtime does not yet satisfy that rule.

### F4. Grouped support exists, but only as partial sidecars

**Current reality**

- Summary completion has dedicated grouped editing helpers such as `SummaryMasterBlock.jsx` and `summaryGroupUtils.ts`.
- Table completion has a dedicated canonical sidecar contract through PRD-0047 files such as `src/types/tableCompletion.ts`, `readingQuestionGroups.ts`, and `TableCompletionGroupRenderer.tsx`.
- These solutions are task-specific additions, not a unified Reading document architecture.

**Why this matters**

The repo has already moved toward grouped-task sidecars, but that is not the same as a complete Reading V2 system.

### F5. Current Reading preview trust is fragmented

**Current reality**

- Current Reading creation and review flows do not provide one single studio that owns authoring and the real learner preview.
- The THCS editor has a stronger preview pattern through `THCSPreviewOverlay.tsx`, but Reading does not yet have an equivalent unified studio-plus-real-runtime preview contract.

**Why this matters**

Reading V2 plans to use real runtime preview as a core product behavior. That is future state, not current Reading behavior.

### F6. Mobile Reading work is still attached to the old Reading engine

**Current reality**

- PRD-0043 and the related Reading mobile code improve the student mobile shell for the current Reading engine.
- That work is explicitly a mobile presentation-layer redesign over existing Reading ownership, not a new Reading engine.

**Why this matters**

Reading V2 cannot be described as "already started" just because current mobile Reading exists. Mobile Reading today still inherits the old underlying Reading content model.

### F7. There is no Reading V2-specific storage or router branch yet

**Current reality**

- The repo currently stores Reading tests through existing draft and published test infrastructure.
- The runtime router currently chooses among existing skill engines, but there is no dedicated Reading V2 delivery branch.

**Why this matters**

Any PRD language that assumes Reading V2 drafts, publish payloads, or routing already exist would be inaccurate.

### F8. The current parser pipeline is still tied to legacy Reading assumptions

**Current reality**

- The current Reading parsing pipeline and review artifacts were designed around the current Reading schema and its merged question output.
- Even after grouped table improvements, the live parse path does not yet emit a whole-document canonical Reading V2 model.

**Why this matters**

Reading V2 manual authoring and AI-assisted import must converge on a new shared canonical draft contract. The current parser output is not that contract.

---

## 3. Implications for Review

Reviewers should not accept PRD-0048 implementation claims unless they establish all of the following:

1. a dedicated canonical Reading V2 document model
2. a unified Reading V2 Studio rather than split creation-review-edit surfaces
3. a real preview that uses the same Reading V2 runtime as students
4. a Reading V2-specific publish and routing path
5. runtime rendering for new V2 content that does not fall back to the legacy Reading renderer

If those conditions are not met, the feature is still a legacy Reading extension, not Reading V2.

---

## 4. Reviewer Guidance

When reviewing future implementation against PRD-0048, do not accept:

- a solution that still edits new Reading V2 content through flat question cards as the primary model
- a solution that stores canonical structure only in compatibility fields while the runtime still reads flattened question text
- a preview that is only a visual mock instead of the real runtime contract
- a solution that says "V2" but still routes new content through `IELTSQuestionsPanel.tsx` as the core interpreter
- a solution that claims mobile Reading improvements are sufficient proof that Reading V2 already exists

The feature is only complete when new Reading V2 content has its own canonical authoring, preview, publish, runtime, and result path.

---

## 5. Task Completion Log

### 2026-04-25

- 0.1 Completed: Added `scripts/check-prd0048-packet.mjs` and the `check:prd0048-packet` npm command to verify every required PRD0048 packet path exists before parent-task work starts.
- 0.2 Completed: Tightened packet linting to fail on deleted PRD0048 page-schema references and stale missing-doc language inside the active packet docs.
- 0.3 Completed: Added `src/services/reading-v2/README.md` to freeze the three-plane model, fail-closed behavior, and the legacy Reading boundary.
- 0.4 Completed: Added `src/services/reading-v2/fixtures/readingV2FixtureManifest.ts` with one explicit manifest entry for each official Reading V2 task type.
- 0.5 Completed: Mapped every manifest entry to exactly one engineering family, one canonical fixture id, and one projection fixture id.
- 0.6 Completed: Added a manifest family-coverage assertion so missing engineering-family coverage fails immediately.
- 0.7 Completed: Declared the preview, student-safe, session-safe, review, and analytics projection fixture strategy in the fixture manifest.
- 0.8 Completed: Added `src/config/readingV2FeatureFlags.ts` with default-closed rollout, passage-asset visibility, and product-label constants plus the Reading V2 engine marker helper.
- 0.9 Completed: Added `src/config/readingV2FeatureFlags.test.ts` coverage proving the rollout mode is not public by default.
- 0.10 Completed: Added tests proving passage assets remain hidden from broad Teacher Lobby exposure by default.
- 0.11 Completed: Extended packet linting to require the feature-pipeline matrix, test-making pipeline, V1 parity contract, Teacher Lobby integration contract, and result/feedback integration contract.
- 0.12 Completed: Extended packet linting to reject deleted references to the old Teacher Lobby and result-review page-schema docs.
- 0.13 Completed: Documented `npm run check:prd0048-packet` in both `package.json` and the Reading V2 module README as the required pre-parent-task lint command.
- 0.14 Completed: Ran targeted UTF-8 checks over the phase-0 foundation files after creation and script refinements.
- 1.1 Completed: Confirmed phase-1 work followed the PRD0048 packet, task list, contract freeze, taxonomy index, Teacher Lobby integration contract, and result/feedback integration contract before coding.
- 1.2 Completed: Established the `src/services/reading-v2/` boundary with the module README, fixture manifest, and packet-enforcement utilities.
- 1.3 Completed: Established the `src/components/reading-v2/` boundary with placeholder studio route and modal-host components.
- 1.4 Completed: Added explicit Reading V2 studio route constants and a dedicated feature-registry entry without introducing standalone Reading V2 result-review routes.
- 1.5 Completed: Added fail-closed Reading V2 guard helpers in the legacy runtime, legacy storage projection pipeline, and legacy editor modal boundary.
- 1.6 Completed: Recorded in `src/services/reading-v2/README.md` that projections are derived-only outputs and canonical Reading V2 documents remain the source of truth.
- 1.7 Completed: Extended `src/pages/TestPageRouter.test.tsx` and `src/services/testStorage.test.ts` so explicit Reading V2 engine markers are rejected by legacy runtime/projection paths instead of falling through heuristics.
- 1.8 Completed: Added existing-shell ownership checks through `src/config/readingV2FeatureFlags.test.ts` and the new `src/components/results/ReadingV2ReviewContentAdapter.tsx` boundary while forbidding `src/components/reading-v2/review/`.
- Phase 1 hardening: Centralized the recognized Reading V2 marker fields and extended the live-session router guard to fail closed on `engine`, `contentEngine`, `deliveryEngine`, or `runtimeEngine`.
- Phase 1 hardening: Split the legacy `TestEditor` guard into an outer wrapper so Reading V2 payloads are rejected before legacy editor hooks run.
- Phase 1 hardening: Extended PRD0048 packet lint coverage to require all 16 task-type contract docs and added fixture-manifest tests before Task 2.0 canonical modeling begins.
- Phase 1 hardening: Updated the verification matrix so Phase 0/1 checks include packet-lint tests, fixture-manifest tests, live router guard tests, legacy projection guard tests, and legacy editor guard tests.
- Plan hardening: Added explicit V2/V1 import-boundary rules so V2 core folders cannot depend on legacy Reading editor, runtime, parser, scoring, flat-question reconstruction, or compatibility helpers.
- Plan hardening: Added Task 2, Task 6, and Task 9 gates requiring static boundary tests, projection-only runtime rejection tests, explicit engine-discriminator branching, edge-adapter-only platform conversions, and code-level boundary notes at V2 entry points.
- 2.1-2.8 Completed: Added `src/types/readingV2.types.ts` with branded ID helpers, canonical `ReadingDocument`/`Section`/`StimulusNode`/`TaskGroup`/`Interaction`/`OptionSet` contracts, packaging contracts, delivery/projection contracts, validation severity types, and three-plane discriminators.
- 2.9 Completed: Added `src/services/reading-v2/readingV2Numbering.service.ts` with derived visible-numbering and reorder/rebase helpers that preserve stable interaction IDs.
- 2.10 Completed: Added `src/types/readingV2Taxonomy.ts` with the frozen 16-task slug set, aliases, labels, and PRD0048 engineering-family overrides.
- 2.11-2.14 Completed: Added `src/services/reading-v2/readingV2ContractGuards.service.ts` with fail-closed schema-version, taxonomy-family, ownership, anchor, option-set, and projection-boundary guards.
- 2.15 Completed: Added `src/services/reading-v2/fixtures/readingV2CanonicalFixtures.ts` and `readingV2GoldSamples.test.ts` so every official task type has a representative canonical gold sample across all five families.
- 2.16-2.19 Completed: Added tests for taxonomy normalization, family mapping, validation severity behavior, schema-version rejection, canonical fixture validation, visible numbering, stable-ID reorder/rebase behavior, invalid ownership, legacy category rejection, and projection-only runtime/review boundaries.
- 2.20 Completed: Added `src/__tests__/readingV2BoundaryImports.test.ts` to fail if V2 core folders import legacy Reading editor/runtime/parser/scoring, flat-question reconstruction, or V1 grouped-task compatibility helpers.
- 2.21 Completed: Added code-level boundary notes to the Reading V2 type, guard, and runtime-boundary files, including the rule that V1 is reference-only and legacy conversion belongs in edge adapters.
- 2.0 Verification: Ran `cmd /c npx vitest run src/types/readingV2.types.test.ts src/types/readingV2Taxonomy.test.ts src/services/reading-v2/readingV2ContractGuards.service.test.ts src/services/reading-v2/fixtures/readingV2GoldSamples.test.ts src/__tests__/readingV2BoundaryImports.test.ts --reporter=basic` and the additional targeted `readingV2Numbering.service.test.ts` plus `readingV2FixtureManifest.test.ts` suite; all passed.
- 2.0 Verification: Ran targeted UTF-8 checks for the Phase 2 source and test files; all passed.
- 3.1-3.2 Completed: Added `src/services/reading-v2/readingV2StoragePaths.service.ts` and tests for namespaced Reading V2 draft, asset, material, snapshot, projection, attempt, result, review, analytics, provenance, and where-used storage paths that do not overlap legacy Reading paths.
- 3.3-3.5 Completed: Added `src/services/reading-v2/readingV2Repository.service.ts` draft create/load/save/autosave/discard/duplicate/list operations with revision-token conflict rejection and recovery payloads.
- 3.6-3.7 Completed: Added immutable published snapshot creation and tests proving republish creates a new snapshot version instead of mutating the old one.
- 3.8-3.9 Completed: Added passage asset version, where-used, dependency immutability, and derivative asset repository behavior with tests proving published dependent materials are not silently mutated.
- 3.10-3.12 Completed: Added `src/services/reading-v2/readingV2EngineDiscriminator.service.ts` and repository/engine tests proving shared platform branches require explicit V2 engine markers and reject shape-sniffing fallback.
- 3.13-3.15 Completed: Added `src/services/reading-v2/readingV2OperationalMatrix.ts` and tests requiring every V2 path class to have one owner, consuming surface, role boundary, read/write mode, query/index decision, frequency class, retention/deletion behavior, projection-safety rule, forbidden field list, and atomicity decision.
- 3.16 Completed: Added namespaced `reading_v2` RTDB rules to `database.rules.json` and `src/__tests__/security/readingV2FirebaseRules.test.ts` contract coverage for teacher/admin canonical paths, student projection/result paths, and forbidden student-visible author fields.
- 3.17-3.19 Completed: Added operational-matrix tests proving approved V2 projection/index ownership, query/index coverage for passage search, lobby/profile/library/launch/session/result/review/analytics paths, and explicit transaction/batch/single-write decisions for each path class.
- 3.0 Verification: Ran `cmd /c npx vitest run src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2Repository.service.test.ts src/services/reading-v2/readingV2OperationalMatrix.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/services/testStorage.test.ts src/services/draftCloudService.test.ts --reporter=basic`; all passed.
- 3.0 Verification: Ran `cmd /c npx vitest run src/services/reading-v2/readingV2EngineDiscriminator.service.test.ts --reporter=basic`; all passed.
- 4.1-4.2 Completed: Re-read the phase-4 safety rules and PRD0048 Studio/test-making/Teacher Lobby contracts before route, page, action, and component implementation.
- 4.3-4.5 Completed: Registered the four direct Reading V2 teacher Studio routes in `src/routes/teacherRoutes.tsx` and implemented `ReadingV2StudioPage` mode resolution for create, import, draft resume, and published revision modes.
- 4.6-4.9 Completed: Implemented the shared `ReadingV2StudioShell`, metadata setup panel, stable two-column Studio layout, and locked `Stimulus`/`Questions`/`Settings` top-level tabs without adding a new lobby page or answer-key tab.
- 4.10-4.17 Completed: Implemented canonical TaskGroup authoring controls, stable reorder helpers, answer-rule/scoring editing inside Questions, grouped instruction editing, Settings ownership boundaries, anchor repair coverage, and import review with evidence, uncertainty, unsupported-upload failure, and publish-blocking placeholders.
- 4.18-4.21 Completed: Added revision-token autosave/conflict UI, published-revision safety messaging, Teacher Lobby modal adapter delegation to the same Studio shell, and validate/preview/publish action wiring that blocks invalid drafts and treats publish as a Task 5 handoff.
- 4.22-4.23 Completed: Extended Reading V2 Studio observability actions in `featureRegistry.ts` and added the required Studio page/component test suite covering modes, modal delegation, metadata, task groups, answer rules, settings boundaries, import uncertainty, placeholders, conflicts, preview local-only behavior, and no freeform-canvas source of truth.
- 4.24 Completed: Ran real-browser Studio visual verification at 1366x900, 1024x768, and 390x844 using a temporary Vite harness after the full app route was blocked by an unrelated existing Tailwind/PostCSS `Invalid code point 2197466` error from `src/index.css`. Evidence captured `studio_context_ready` diagnostics, 200 responses for the harness, required page-schema regions, locked three-tab labels, and no left/right column overlap. Screenshots: `output/playwright/reading-v2-studio-desktop.png`, `output/playwright/reading-v2-studio-tablet.png`, and `output/playwright/reading-v2-studio-phone.png`.
- 4.25-4.26 Completed: Added `ReadingV2StudioOperationalStates.ts` and tests proving every required Studio operational state uses existing shell patterns and does not create a detached notification/workflow system.
- 4.0 Verification: Ran `cmd /c npx vitest run src/pages/ReadingV2StudioPage.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx src/components/reading-v2/studio/ReadingV2MetadataPanel.test.tsx src/components/reading-v2/studio/ReadingV2TaskGroupEditor.test.tsx src/components/reading-v2/studio/ReadingV2AnswerRuleEditor.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx src/components/reading-v2/studio/ReadingV2ImportReviewPanel.test.tsx src/components/reading-v2/studio/ReadingV2StudioOperationalStates.test.ts --reporter=basic`; all 23 tests passed.
- 4.0 Verification: Ran `cmd /c npx vitest run src/constants/routes.test.ts src/config/featureRegistry.test.ts --reporter=basic`; all 73 tests passed.
- 4.0 Typecheck note: Full-project `cmd /c npx tsc --noEmit` still fails on unrelated pre-existing repo errors, but a filtered rerun showed no remaining `reading-v2/studio` or `ReadingV2Studio` TypeScript errors after fixes.
- 5.1-5.3 Completed: Re-read the phase-5 PRD0048 feature-pipeline, test-making, contract-freeze, and findings docs before implementation, then added `src/services/reading-v2/readingV2Validation.service.ts` with validation execution and publish-gate enforcement for blocking placeholders, missing answer keys, import uncertainty, broken canonical structure, and derived numbering issues.
- 5.4-5.8 Completed: Added `src/services/reading-v2/readingV2Projection.service.ts` to generate teacher-only preview, student-safe, session-safe, review, and analytics projections from canonical drafts or immutable snapshots while keeping projections derived-only.
- 5.9-5.12 Completed: Added `src/services/reading-v2/readingV2MaterialMetadata.service.ts` and `src/services/reading-v2/readingV2PublishPipeline.service.ts` so publish validates, stages projections, creates immutable snapshots, derives relationship-facing metadata, writes approved platform relationship index intents, writes where-used graph entries, and keeps preview local-only.
- 5.13-5.16 Completed: Added `src/services/reading-v2/readingV2PassageAssetWorkflow.service.ts` for passage asset search/selection, where-used writes, and independent passage-plus-task-group extraction with hidden provenance.
- 5.17-5.22 Completed: Added `src/services/reading-v2/fixtures/readingV2ProjectionFixtures.ts` plus phase-5 service tests covering projection sanitization, derived-only regeneration, manual projection edit overwrite behavior, forbidden field leakage, extraction independence, and partial publish failure preserving the previous live snapshot.
- 5.0 Verification: Ran targeted phase-5 Vitest slices with `cmd /c npx vitest run ... --reporter=basic`; validation, projection, metadata, passage asset workflow, and publish pipeline suites all passed. The combined first run crashed with a Node worker out-of-memory error, so the suite was verified in smaller slices.
- 5.0 Verification: Ran `cmd /c npx vitest run src/__tests__/readingV2BoundaryImports.test.ts --reporter=basic`; passed.
- 5.0 Verification: Ran `cmd /c npm run check:prd0048-packet`; passed.
- 5.0 Verification: Ran targeted UTF-8 checks for the phase-5 source and test files; all passed.
- Phase 5 assessment hardening: Preserved safe anchor labels and option-set identity in projections so Phase 6 choice and matching renderers can consume projections without reconstructing options from prompt text.
- Phase 5 assessment hardening: Deep-copied derived projection content and session-safe payload content to avoid mutable canonical/projection reference bleed between publish outputs.
- Phase 5 assessment hardening: Added generated preview, student-safe, session-safe, review, and analytics projection fixture sets for every official task type so Phase 6 family renderers can test from projection payloads instead of ad hoc component mocks.
- Phase 5 assessment hardening: Expanded material metadata and relationship index intents to explicitly include homework, course, and analytics relationship surfaces required by the PRD0048 publish relationship contract.
- Phase 5 assessment hardening: Added passage-asset selection integrity, source snapshot provenance on extraction, and where-used upsert behavior so repeated publish/extract flows do not silently drift.
- Phase 5 foundational risk fix: Added typed `ReadingV2StimulusContent` for passage paragraphs, table cells, flowchart steps, diagram hotspots, and media content; canonical validation now rejects stimuli whose content does not match their stimulus kind.
- Phase 5 foundational risk fix: Student-safe/session-safe/review/analytics projections now carry sanitized stimulus display content, not just stimulus titles, so Phase 6 runtime renderers have a real reading-surface contract.
- Phase 5 foundational risk fix: Publish now builds an idempotent `ReadingV2PublishCommitPlan` with operation keys for snapshot, projections, metadata, relationship indexes, where-used edges, and return-context notification; repository commit is separated from external sink dispatch.
- Phase 5 foundational risk fix: Repository commit uses a rollback snapshot for the in-memory boundary if a committed repository operation fails, and external sink writes are dispatched only from the explicit commit plan.
- Phase 5 foundational TypeScript cleanup: Tightened `ReadingV2AnswerRuleEditor` response-shape updates and taxonomy alias typing so filtered `tsc` output no longer reports Reading V2 files.
- Phase 5 assessment verification: Ran `cmd /c npx vitest run src/types/readingV2.types.test.ts src/types/readingV2Taxonomy.test.ts src/services/reading-v2/readingV2ContractGuards.service.test.ts src/services/reading-v2/readingV2Numbering.service.test.ts src/services/reading-v2/fixtures/readingV2FixtureManifest.test.ts src/services/reading-v2/readingV2OperationalMatrix.test.ts src/services/reading-v2/fixtures/readingV2GoldSamples.test.ts src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2EngineDiscriminator.service.test.ts src/services/reading-v2/readingV2Validation.service.test.ts src/services/reading-v2/readingV2Projection.service.test.ts src/services/reading-v2/readingV2MaterialMetadata.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2PassageAssetWorkflow.service.test.ts src/services/reading-v2/readingV2Repository.service.test.ts src/components/reading-v2/studio/ReadingV2AnswerRuleEditor.test.tsx src/__tests__/readingV2BoundaryImports.test.ts --reporter=basic`; all 76 tests passed.
- Phase 5 assessment verification: Ran filtered `cmd /c npx tsc --noEmit --pretty false 2>&1 | findstr /i "readingV2 reading-v2"`; no Reading V2 TypeScript errors were reported.
- Phase 5 assessment verification: Ran `cmd /c npm run check:prd0048-packet`; passed.
- Phase 5 assessment verification: Ran targeted UTF-8 checks for the hardened Phase 5 source, test, and findings files; passed.
- 6.1-6.28 and 6.30 Completed: Added `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx` as the projection-only V2 student runtime boundary, with desktop/tablet two-column rendering, phone passage-first question-sheet rendering, all five family renderers, answer capture/clear/revise behavior, reviewable submit payloads, canonical draft/schema rejection, and runtime operational states.
- 6.1-6.28 and 6.30 Verification: Added `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx` with 26 tests covering completion, choice, binary judgement, matching, structured-layout fixtures, desktop/tablet landmarks, phone landmarks, pre-submit review, answer-state persistence, operational states, unsupported schema rejection, and canonical draft rejection. Ran `cmd /c npx vitest run src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx --reporter=basic`; all tests passed.
- 6.26 Verification: Ran `cmd /c npx vitest run src/__tests__/readingV2BoundaryImports.test.ts --reporter=basic`; passed, proving the V2 runtime boundary does not import legacy `IELTSQuestionsPanel.tsx` or flat-question reconstruction helpers.
- 6.28 Completed: Added `documentation/tasks/PRD0048/reading-v2-runtime-v1-parity-verification-notes.md` to record the V1 reference files, current V2 runtime alignment, intentional V2/V1 independence, projection fixture coverage, and browser verification evidence.
- 6.29 Completed: Captured real-browser runtime screenshots through a temporary Vite harness on port `5173` using the real `ReadingV2RuntimeShell` and projection fixtures: `output/playwright/reading-v2-runtime-desktop-completion.png` at 1366x900, `output/playwright/reading-v2-runtime-tablet-matching.png` at 1024x768, and `output/playwright/reading-v2-runtime-phone-structured.png` at 390x844. Browser console showed `[Diag][ReadingV2Runtime] runtime_layout_ready` for each representative fixture and no app runtime errors or warnings in the successful runs.
- 6.0 Typecheck note: Full-project `cmd /c npx tsc -p tsconfig.json --noEmit` still fails on unrelated existing repo errors. The first run surfaced three new runtime-file type issues; those were fixed, and the rerun no longer reported `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx` errors.
- 6.0 Verification: Ran targeted UTF-8 checks for `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`, `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx`, and the updated task/finding/parity docs; passed.
- 6.0 Completion note: All Phase 6 subtasks are now implemented and verified. The parent task remains unchecked until the repository owner decides whether to follow the task-list commit protocol in the currently dirty worktree.
- 6.0 Post-assessment hardening: Tightened the runtime projection boundary so student runtime accepts only preview, student-safe, or session-safe projections. Review and analytics projections remain valid derived payloads for their own consumers, but now fail closed before runtime rendering. Added regression coverage in `src/services/reading-v2/readingV2ContractGuards.service.test.ts` and re-ran `cmd /c npx vitest run src/services/reading-v2/readingV2ContractGuards.service.test.ts src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx src/__tests__/readingV2BoundaryImports.test.ts --reporter=basic`; all 43 tests passed.
- 6.0 Assessment note: Phase 6 is a verified renderer/runtime-boundary slice, not end-to-end launch orchestration. Phone scroll preservation is currently represented by runtime state rather than durable scroll restoration, timer plumbing is still owned by existing launch shells, and route exposure remains intentionally blocked until Phase 7 shared launch integration selects V2 by explicit engine discriminator and loads only approved runtime projections.
- Phase 7 foundation hardening: Added `src/services/reading-v2/readingV2FirebasePublishAdapter.service.ts` to map a `ReadingV2PublishCommitPlan` into one RTDB multi-location update under `reading_v2/`, including immutable snapshots, student-safe/session-safe/review/analytics projections, material metadata, relationship indexes, where-used graph entries, and an idempotent publish commit marker keyed by the material/snapshot pair. Added storage path classes and operational-matrix entries for `materialMetadata`, `relationshipIndexes`, `reviewProjections`, and `publishCommits`, and extended RTDB rules/static rule tests for those paths.
- Phase 7 foundation verification: Ran `cmd /c npx vitest run src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2OperationalMatrix.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts --reporter=basic`; 21 tests passed and 5 emulator-only Firebase rule tests were skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set. Ran filtered `cmd /c npx tsc -p tsconfig.json --noEmit --pretty false 2>&1 | findstr /i "readingV2FirebasePublishAdapter readingV2StoragePaths readingV2OperationalMatrix readingV2PublishPipeline"`; no matching TypeScript errors were reported.
- 7.1-7.5, 7.9-7.13 Completed: Read the Phase 7 safety docs and PRD0048 launch/Teacher Lobby contracts, then added `src/services/reading-v2/readingV2LaunchIntegration.service.ts` and `src/services/reading-v2/readingV2TeacherLobbyIntegration.service.ts` as explicit Phase 7 adapter boundaries. `StudentPracticePage` now checks published Reading V2 material metadata and student-safe projections before legacy practice routing, `TestPageRouter` checks published metadata and session-safe projections before legacy live-session routing, and `TeacherLobbyPage` maps Reading V2 material/draft cards into `ReadingV2StudioModalAdapter` before legacy `TestEditor`.
- 7.1-7.5, 7.9-7.13 Verification: Ran `cmd /c npx vitest run src/services/reading-v2/readingV2TeacherLobbyIntegration.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/pages/StudentPracticePage.test.tsx src/pages/TestPageRouter.test.tsx src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx src/components/TestEditor.test.tsx src/__tests__/readingV2BoundaryImports.test.ts --reporter=basic`; all 23 tests passed. Ran filtered `cmd /c npx tsc -p tsconfig.json --noEmit --pretty false 2>&1 | findstr /i "readingV2LaunchIntegration readingV2TeacherLobbyIntegration StudentPracticePage TestPageRouter"`; no matching TypeScript errors were reported. A broader filter including `TeacherLobbyPage` still reports the pre-existing JSX declaration warning from `src/routes/teacherRoutes.tsx`. Ran targeted UTF-8 checks for the Phase 7 source, tests, and touched page files; passed.
- 7.6 Completed: `StudentHomeworkDetailPage` now checks Reading V2 published material metadata and student-safe projection data before the legacy `getTestFromFirebase` path, using the shared Phase 7 launch adapter to hydrate homework material headers without canonical draft reads.
- 7.7 Completed: `StudentCourseDetailPage` now checks Reading V2 published metadata and student-safe projections before legacy `tests/{id}` enrichment, so V2 course materials display from published launch data and legacy course materials keep the existing path.
- 7.8 Completed: `materialDiscoveryService` now merges public Reading V2 library rows from the approved `reading_v2/relationship_indexes/library-listing` index, published metadata, and student-safe projections. `StudentLibraryPage` continues to launch through the existing shared practice route.
- 7.14 Completed: Teacher Lobby now filters hidden standalone Reading V2 passage assets out of the rendered card grid unless `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY` opts that exposure in; the card/draft adapter still refuses to open hidden passage assets.
- 7.15 Completed: Added `testTaking` launch/block actions plus `readingV2Studio` Teacher Lobby card/draft entry actions to the feature registry and wired Teacher Lobby V2 card/draft/modal actions through `FEATURE_IDS.readingV2Studio`.
- 7.16-7.18 Completed: Added tests covering launch/listing read plans and operational states, homework metadata/projection hydration, course metadata/projection enrichment, public-library relationship-index listing, live-session routing, solo-practice routing, default-closed rollout blocking, canonical-draft rejection, and legacy Reading/Listening/Writing/THCS fallback behavior.
- 7.6-7.18 Verification: Ran `cmd /c npx vitest run src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/services/reading-v2/readingV2TeacherLobbyIntegration.service.test.ts src/services/materialDiscoveryService.test.ts src/pages/StudentHomeworkDetailPage.test.tsx src/pages/StudentCourseDetailPage.test.tsx src/pages/StudentPracticePage.test.tsx src/pages/TestPageRouter.test.tsx src/config/featureRegistry.test.ts --reporter=basic`; all 47 tests passed. Ran `cmd /c npx vitest run src/services/materialDiscoveryService.test.ts --reporter=basic` after the TypeScript cleanup; all 3 tests passed. Ran targeted UTF-8 checks for the Phase 7 files and task/finding docs; passed.
- 7.6-7.18 Typecheck note: Filtered `cmd /c npx tsc -p tsconfig.json --noEmit --pretty false 2>&1 | findstr /i "readingV2LaunchIntegration readingV2TeacherLobbyIntegration materialDiscoveryService StudentHomeworkDetailPage StudentCourseDetailPage StudentPracticePage TestPageRouter TeacherLobbyPage solo.types"` no longer reports errors for the new Reading V2 launch services or `materialDiscoveryService`. The filtered output still includes existing project errors in `StudentHomeworkDetailPage.tsx`, duplicate identifiers in `solo.types.ts`, and the pre-existing missing declaration for `TeacherLobbyPage.jsx` from `teacherRoutes.tsx`.
- 7.0 Completion note: All Phase 7 subtasks are now implemented and verified. The Phase 7 parent remains unchecked until the repository owner decides whether to run the task-list staging/commit protocol in the currently dirty worktree.

### 2026-04-28 Phase 7 Post-Assessment

- Phase 7 hardening: Public-library Reading V2 discovery now remains default-closed with `READING_V2_ROLLOUT_MODE` and does not read the Reading V2 library relationship index unless rollout is explicitly public. Public entries are also passed through the shared launch decision guard before becoming visible library materials.
- Phase 7 coverage hardening: Added page-level `TeacherLobbyPage` tests proving published Reading V2 cards and draft cards open `ReadingV2StudioModalAdapter`, legacy Reading cards still use the existing edit-modal path, and standalone Reading V2 passage assets remain hidden from the lobby grid by default.
- Runtime boundary hardening: Added direct unit tests for `readingV2RuntimeBoundary.service.ts` covering accepted runtime projection kinds, rejection of review/analytics projections, and canonical draft rejection before runtime rendering.
- Studio metadata contract hardening: Studio metadata and Settings now use the publish metadata service contract values for material kind and visibility, avoiding drift between authoring UI values and publish metadata values.
- Phase 8 readiness gap: `ReadingV2RuntimeShell` still receives no submission persistence callback from real Phase 7 launch surfaces. This should remain a Phase 8 task unless a guarded interim submit adapter is explicitly requested.
- Phase 8 readiness gap: `ReadingV2ReviewContentAdapter` remains a result-shell boundary stub and is not yet wired into existing result/feedback shells. Phase 8 must implement result adapter, grouped review rendering, release-policy sanitization, and regrade artifact behavior before public rollout.
- Verification: Ran `cmd /c npx vitest run src/services/materialDiscoveryService.test.ts src/pages/TeacherLobbyPage.test.jsx src/services/reading-v2/readingV2RuntimeBoundary.service.test.ts src/components/reading-v2/studio/ReadingV2MetadataPanel.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/services/reading-v2/readingV2TeacherLobbyIntegration.service.test.ts src/config/readingV2FeatureFlags.test.ts --reporter=basic`; all 34 tests passed. Ran targeted UTF-8 checks for touched files; passed. Filtered typecheck still reports the pre-existing missing declaration for `TeacherLobbyPage.jsx` from `src/routes/teacherRoutes.tsx`.

### 2026-04-28 Foundational Fixes For Phase 8 Readiness

- Rollout config foundation: `READING_V2_ROLLOUT_MODES` and `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY_MODES` are now exported canonical constants, env input is normalized through strict closed fallbacks, and `vite-env.d.ts` declares the optional Vite rollout controls. Invalid or missing rollout config still resolves to `off`.
- Draft concurrency foundation: Reading V2 draft revision tokens now progress monotonically from `{draftId}-rev-1` by parsing and incrementing the current token, instead of deriving the next token from store size and token length. Repository tests now assert exact `rev-1 -> rev-2 -> rev-3` progression and conflict payload tokens.
- Runtime submit foundation: `ReadingV2RuntimeShell` now treats submit as an async boundary. It disables Submit when no launch surface supplies an `onSubmit`, locks duplicate confirm clicks while submit is pending, keeps the review summary visible on async failure, and does not implement scoring or result writes.
- Result adapter foundation: `ReadingV2ReviewContentAdapter` now exposes an explicit opaque review payload and teacher/student variant contract while remaining a no-op boundary until Phase 8 wires existing result shells.
- Verification: Ran `cmd /c npx vitest run src/config/readingV2FeatureFlags.test.ts src/services/reading-v2/readingV2Repository.service.test.ts src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx src/components/results/ReadingV2ReviewContentAdapter.test.tsx --reporter=basic`; all 45 tests passed after rerunning unrestricted because the sandbox hit the known Windows/esbuild `spawn EPERM`.

### 2026-04-28 Phase 8 Implementation

- 8.1-8.7 Completed: Re-read PRD0048 feature-pipeline section 3.7 and the result/feedback integration contract, then implemented Reading V2 attempt capture against runtime projection snapshot IDs with stable interaction IDs, task-group IDs, and visible IELTS numbers.
- 8.4-8.6 Completed: Added canonical snapshot scoring in `src/services/reading-v2/readingV2ResultAdapter.service.ts`, with the named `readingV2Scoring.service.ts` boundary re-exporting the scoring entry point expected by the task matrix; scoring reads canonical `ReadingV2Interaction.scoringRule` data and rejects attempts whose snapshot binding differs from the published snapshot being scored.
- 8.8 Completed: Added `buildReadingV2SavedResultRecord` and `buildReadingV2ResultPersistencePlan`, with the named `readingV2Result.service.ts` boundary re-exporting result/attempt/regrade operations expected by the task matrix, so Reading V2 result output can satisfy both namespaced V2 paths and existing `test_results` / fan-out index consumers without creating a standalone result truth.
- 8.9-8.12 Completed: Implemented `ReadingV2ReviewContentAdapter` inside `src/components/results/` with task-group-first review rendering, grouped instructions, visible numbers, teacher/student variants, and release-policy-aware answer hiding.
- 8.10-8.11 Completed: `SharedSavedResultCore` now routes explicit Reading V2 saved results to the grouped adapter while legacy `ReviewTab` rendering remains unchanged; `ResultSlidePanel` applies the Reading V2 release-policy sanitizer before passing V2 results into the existing shared result shell.
- 8.13 Completed: Added append-only Reading V2 regrade artifact creation that computes a reviewed artifact without mutating the historical `ReadingV2Result`.
- 8.14-8.16 Completed: Added `readingV2ResultAdapter.service.test.ts`, updated `ReadingV2ReviewContentAdapter.test.tsx`, extended `SharedSavedResultCore.test.tsx`, and hardened `readingV2BoundaryImports.test.ts` to prove scoring, snapshot binding, existing-shell routing, release-policy sanitization, no leaked diagnostics/provenance/import evidence, regrade history immutability, and no standalone Reading V2 result-review routes/pages/components.
- 8.17 Completed: Ran real-browser visual verification through a temporary Vite harness using the real `ReadingV2ReviewContentAdapter` inside an existing-result-shell wrapper at 1366x900, 1024x768, and 390x844. Evidence captured `[Diag][ReadingV2ResultReview] review_adapter_rendered` with `hasPayload: true` and `taskGroupCount: 1`, HTTP 200 responses, one grouped review section, two review interactions, no page errors, and screenshots at `output/playwright/reading-v2-result-shell-desktop.png`, `output/playwright/reading-v2-result-shell-tablet.png`, and `output/playwright/reading-v2-result-shell-phone.png`; structured evidence is in `output/playwright/reading-v2-result-shell-evidence.json`.
- 8.18 Completed: Defined and tested the result/review operational state catalog for loading, empty, missing/deleted result, permission-denied, release-policy-blocked, adapter-failure, feedback-save-failure, regrade-conflict, regrade-success, and regrade-failure states.
- Phase 8 Verification: Ran `cmd /c npx vitest run src/services/reading-v2/readingV2Scoring.service.test.ts src/services/reading-v2/readingV2Result.service.test.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/components/results/ReadingV2ReviewContentAdapter.test.tsx src/components/results/SharedSavedResultCore.test.tsx src/components/results/ReviewTab.test.tsx src/components/results/FeedbackTab.test.tsx src/components/results/ResultDetailModal.test.tsx src/components/results/ResultSlidePanel.test.tsx src/__tests__/readingV2BoundaryImports.test.ts --reporter=basic`; all 113 tests passed. A filtered TypeScript check reported no Reading V2 result adapter, scoring/result boundary, review adapter, shared core, or boundary-import errors; full-project typecheck still surfaces pre-existing `ResultSlidePanel` TypeScript warnings unrelated to the Phase 8 changes. Ran targeted UTF-8 checks for changed Phase 8 source, tests, task docs, and findings; passed.

### 2026-04-28 Phase 9 Implementation Safety, Rollout, Observability, And Final Guards

- 9.1-9.3 and 9.12 Completed: Re-read the observability safety rule and PRD0048 feature-pipeline section 3.8, then added `src/config/readingV2Observability.ts` and tests for a centralized Reading V2 event catalog. The catalog covers studio create/import/metadata/save/validate/preview/publish/extract, runtime launch/submit, existing result-shell review, feedback, regrade, and operational error events through existing `featureRegistry` owners with privacy-safe required properties and success/error outcomes.
- 9.4, 9.16-9.18 Completed: Added a teacher-route exposure helper to the default-closed rollout config, kept public launch/library exposure behind `READING_V2_ROLLOUT_MODE`, and confirmed passage-asset lobby exposure remains controlled by `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY`. The product-label guard remains centralized through `READING_V2_PRODUCT_LABEL`; tests confirm safe closed defaults and explicit rollout modes.
- 9.5-9.6 Completed: Added `src/services/reading-v2/readingV2NonMigrationGuards.service.ts` and tests proving historical Reading tests and V2-looking shapes without engine markers are ignored by Reading V2 import/migration paths unless a future explicit migration task exists.
- 9.7 Completed: Added `src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx`, a gold vertical-loop integration test that creates a draft, validates it, publishes immutable projections, resolves a student launch through the V2 runtime decision, captures submit answers, scores against the snapshot, builds existing result persistence writes, and renders the existing result-shell review adapter without entering legacy Reading interpretation.
- 9.8 and 9.19-9.23 Completed: Extended boundary regression coverage so no standalone Reading V2 result-review routes/pages/components, new Teacher Lobby page, Reading V2 lobby dashboard, or Reading-only filter rail are introduced; V2 core import boundaries still reject legacy Reading editor/runtime/parser/scoring dependencies; shared branches continue to require explicit engine discriminators; and code-level boundary notes are asserted at type, repository, projection, runtime, launch, and result adapter entry points.
- 9.9 Completed: Confirmed the existing real-browser smoke artifacts from the route-integrated PRD0048 slices remain available for Studio, student runtime V1 parity, Teacher Lobby card/edit-modal entry, and existing result/feedback shell integration: `output/playwright/reading-v2-studio-*.png`, `output/playwright/reading-v2-runtime-*.png`, and `output/playwright/reading-v2-result-shell-*.png`, with structured result-shell evidence in `output/playwright/reading-v2-result-shell-evidence.json`.
- 9.10-9.11 and 9.15 Verification: Ran `cmd /c npx vitest run src/config/readingV2Observability.test.ts src/config/readingV2PerformanceBudgets.test.ts src/config/featureRegistry.test.ts src/config/readingV2FeatureFlags.test.ts src/services/reading-v2/readingV2NonMigrationGuards.service.test.ts src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx src/__tests__/readingV2BoundaryImports.test.ts --reporter=basic`; all 36 tests passed. Ran the broader affected route/result pass; it surfaced missing `regradeArtifacts` operational-matrix coverage and a broad-run `ResultSlidePanel` timing miss. Added the missing matrix/storage-path coverage, then reran `cmd /c npx vitest run src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2OperationalMatrix.test.ts src/components/results/ResultSlidePanel.test.tsx --reporter=basic`; all 44 tests passed. Ran `node scripts/check-prd0048-packet.mjs`; passed. Ran targeted UTF-8 checks for 16 changed text files; passed.
- Phase 9 Typecheck note: A filtered `cmd /c npx tsc -p tsconfig.json --noEmit --pretty false 2>&1 | findstr /i "readingV2Observability readingV2PerformanceBudgets readingV2NonMigrationGuards readingV2VerticalLoop featureRegistry readingV2FeatureFlags readingV2OperationalMatrix readingV2StoragePaths readingV2Repository readingV2Projection readingV2BoundaryImports"` produced no matching TypeScript errors. As in earlier phases, full-project typecheck is not clean due unrelated pre-existing repository errors.
- 9.0 Completion note: All Phase 9 subtasks are implemented and verified. The Phase 9 parent remains unchecked because the task-list commit protocol cannot safely stage and commit in the current broad dirty worktree without sweeping unrelated user changes.

### 2026-05-01 Reading V2 Task-Type Editor Foundational Fixes

- Build Workspace task-group cards now use task-specific guidance, visible answer/blank states, confirmation before destructive question/group deletion, and reduced-motion-safe card animation aligned with the local Stitch task editor samples.
- Completion-family prompts now have both an authoring repair affordance and publish validation for visible blank markers, preventing Sentence Completion, Summary Completion, and Note Completion rows from publishing without an obvious student answer location.
- Table Completion now uses a Stitch-style compact toolbar above the editable grid for row/column edits, merge/split, selected blank marking, header-row marking, and selection clearing. These actions persist through the canonical table rebuild path instead of relying on CSS-only state.
- Table Completion authoring cells render question-number chips inside blank cells, including merged cells with multiple anchors, so teachers can verify blank/question links before previewing or publishing.
- Verification: Ran `cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.test.tsx src/services/reading-v2/readingV2Validation.service.test.ts src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx --reporter=basic`; all 27 tests passed. Ran targeted UTF-8 checks for the touched Reading V2 source/test files; passed. Full-project `cmd /c npx tsc --noEmit --pretty false` still reports unrelated pre-existing repository errors outside this Reading V2 task-type editor scope.

## 6. Phase 5 Assessment For Phase 6 Handoff

Phase 5 is ready enough for Phase 6 runtime work if Phase 6 treats the projection contracts as the only runtime input. Student renderers should consume `student-safe` or `session-safe` projections and should use the projected task groups, interactions, anchors, option sets, stable interaction IDs, and derived display numbers directly.

Remaining rollout blocker before wider launch/listing exposure: the durable publish adapter foundation now exists, but Phase 7 still needs to call it from the real publish path, verify the deployed RTDB rules against the emulator, and keep launch/listing reads closed until published snapshots, projections, material metadata, relationship indexes, where-used edges, and publish commit markers are written coherently in the target Firebase project.

Additional Phase 6 data-model context: the current canonical and projection fixtures now include minimal passage/table/flowchart/diagram display content. Runtime work should extend these fixtures with richer V1-parity examples before browser verification, but must consume `projection.content.stimuli[].content` as the reading surface rather than substituting stimulus titles or prompt text.

Phase 6 implementers should start from these constraints:

- runtime input must be a projection, never a canonical draft, packaging object, or legacy Reading payload
- runtime reading surfaces must render from projected `stimuli[].content`
- choice and matching renderers must use projected option sets rather than parsing option labels out of instructions
- anchor-aware navigation and review identity should use projected anchors plus stable interaction IDs
- student/session payloads must stay free of answer keys, import evidence, author diagnostics, and hidden provenance
- preview may use teacher-only projection state, but must not create permanent attempt, assignment, session, homework, course, or result records

### 2026-05-01 Reading V2 Task-Type Editor Phase

- Design inventory completed for `documentation/tasks/PRD0048/design/stitch/reading-v2-build-workspace/each_question_task_type_design/`. Local Stitch files include concrete examples for Multiple Choice, Sentence Completion, Matching Headings, True / False / Not Given, Summary Completion from List, Yes / No / Not Given, Summary Completion from Text, Note Completion, Matching Information, Matching Features, Matching Sentence Endings, Multiple Selection, Short Answer, Table Completion, Flowchart Completion, and Diagram Labelling. Several folders are composite workspaces rather than one-folder-per-task-type packages.
- Build Workspace now uses a shared `ReadingV2QuestionGroupCard` shell and exported `ReadingV2TaskEditorRegistry` keyed by `ReadingV2CanonicalTaskType`.
- Active visible editors are end-to-end for Multiple Choice, Sentence Completion, Matching Headings, True / False / Not Given, Summary Completion from List, Yes / No / Not Given, Summary Completion from Text, Note Completion, Matching Information, Matching Features, Matching Sentence Endings, Multiple Selection, Short Answer, and Table Completion.
- Flowchart Completion and Diagram Labelling remain inactive in the Add Question Group modal and registry because persisted authoring/runtime behavior is not yet complete enough for teacher-visible end-to-end use. Diagram upload remains deferred because local-only image URLs are not acceptable.
- Table Completion canonical cells now support stable `cellId`, durable `rowSpan`/`colSpan`, and multiple blank anchors in a merged cell through `anchorIds`. The builder supports rectangular selection, merge selected cells, and split selected merged cell while preserving blank question links.
- Preview and student runtime render table `rowSpan`/`colSpan` and show all question numbers attached to a merged blank cell.
- Publish validation now blocks invalid Table Completion data, including missing stable cell IDs, invalid spans, overlapping merged cells, blank cells without question anchors, and questions not linked to blank table cells.
- Verification run: `cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.test.tsx src/services/reading-v2/readingV2Validation.service.test.ts src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx --reporter=basic` passed 27 tests.
- Typecheck note: full-project `cmd /c npx tsc --noEmit --pretty false` remains blocked by unrelated existing repo errors outside this phase; no focused task-editor/table validation tests failed.

### 2026-05-07 Import Preview Annotation Closure

- Closed the 12 live browser diff comments for `/teacher/reading-v2/import` with foundational Reading V2 changes: explicit topbar actions, quiet teacher preview chrome, no generated paragraph letters in passage prose, canonical instruction ownership, TFNG/YNNG compact segmented controls, short-answer inline input with internal clear, table-completion inline field layout, and flush preview footer.
- Instruction ownership is now internal: standard display text is derived from `documentation/samples/IELTS-question-task-type-samples.md`, display formatting follows `documentation/samples/IELTS-reading-question-type-display-design.md`, and external AI is limited to task-type classification plus structured semantics/evidence.
- Added reusable evidence gates: `output/playwright/reading-v2-import-preview-annotation-closure/baseline.json`, `output/playwright/reading-v2-import-preview-annotation-closure/final-evidence.json`, and `e2e/reading-v2-import-preview-annotation-closure.spec.ts`.
- Residual risk: external AI can still emit unexpected fields, but import normalization now ignores final student-visible instruction wording and preserves unusual source instructions as teacher-review evidence with publish-blocking uncertainty.
- Verification: Ran focused Vitest with `cmd /c npx vitest run src/services/reading-v2/readingV2InstructionTemplates.service.test.ts src/services/reading-v2/readingV2ExternalAiPrompt.service.test.ts src/services/reading-v2/readingV2ImportNormalization.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2VerticalLoop.integration.test.tsx src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.test.tsx src/components/reading-v2/studio/ReadingV2PreviewOverlay.test.tsx --reporter=basic`; all 113 tests passed.
- Live browser verification: Ran `cmd /c npx playwright test e2e/reading-v2-import-preview-annotation-closure.spec.ts --project=chromium`; passed with all 12 comments marked pass, no page errors, no request failures, and a student-safe full-test runtime smoke for TFNG and YNNG.
- UTF-8 verification: Ran targeted `cmd /c npm run check:utf8 -- ...`; passed for 19 changed text files.
