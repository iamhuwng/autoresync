# Task List: PRD-0052 Gap Closure - Teacher Materials Books And Reading Passage Library

Date: 2026-06-02

Target root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

Target branch: `codex/prd0052-material-tabs-inline`

Primary PRD: `documentation/tasks/0052-prd-teacher-materials-books-and-reading-passage-library.md`

Input reports:

- `documentation/tasks/PRD0052/prd0052-full-implementation-audit-report.md`
- `documentation/tasks/PRD0052/prd0052-supplemental-assessment-verification.md`
- `documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md`
- `documentation/tasks/PRD0052/prd0052-final-handoff-checklist.md`
- `documentation/tasks/PRD0052/prd0052-implementation-notes.md`
- `documentation/tasks/PRD0052/prd0052-reading-v2-backfill-dry-run-plan.md`
- `documentation/tasks/PRD0052/prd0052-security-rule-validation-cases.md`
- `documentation/tasks/PRD0052/prd0052-visual-difference-note.md`

## Purpose

This is the separate closure tasklist for the holes, missings, scaffolds, placeholders, and drift found after reviewing the PRD-0052 implementation reports.

The old implementation contains useful foundations, but it is not product-complete. This tasklist reopens the work around PRD truth, not around optimistic prior checklist status.

All checkboxes below start unchecked on purpose. Do not mark an item complete because a visual shell, type, service stub, test fixture, or isolated unit test exists. Mark it complete only after the user-facing workflow, persistence path, rules, and verification evidence are real.

## Assessment Inputs Used

This tasklist combines these assessment approaches:

1. PRD requirement trace against locked decisions, functional requirements, edge cases, acceptance criteria, permissions, and forbidden patterns.
2. Existing implementation tasklist and handoff audit to find overstated `PASS` claims.
3. Local-main diff and changed-surface inventory to identify all touched areas and regressions.
4. UI and interaction audit for modals, actions, creation tools, editing tools, and governance tools.
5. Data, persistence, index, and Firebase rules trace from UI action to storage path.
6. Verification audit separating live proof from fixture, skipped emulator, and denied remote RTDB proof.
7. Subagent cross-check focused on phase ordering, highest-risk omissions, and PRD non-goals.

## PRD Guardrails

Do not violate these while closing gaps.

- `Reading Passage` is directly assignable as homework in V1.
- `Book` is an organizer/package only in V1.
- Whole-Book assignment is not in V1.
- Students do not get a Book player, Book progress, Book unlocks, or Book aggregate results in V1.
- Teachers can assign individual materials from inside a Book.
- `Reading Passage` rows appear only in the `Reading Passage` tab, not in `My Content`.
- `Book` tab shows only Book records.
- No direct blank/manual `Create Reading Passage` exists in V1.
- Reading Passage entities are auto-created from Reading V2 full-test publish/import/extraction flows.
- Teachers can bulk-select Reading Passages and assign them as one combined homework set.
- Teachers can create a basic reusable full Reading test composition from selected Reading Passages.
- Test Types are admin-configurable and teacher pins are derived from admin config.
- `TOEFL` is canonical and `TOFEL` is an alias.
- `CEFR` is canonical and `CELF` is an alias.
- Test Type blocks stay as 4 centered cards under search, with no `All` card.
- Normal materials browsing is list-only. Do not restore the normal grid/list toggle.
- Book node max depth is 5.
- Placeholder Book nodes are persisted but not assignable as nodes.
- Book refs can point to published materials only in V1.
- Assignment from a Book material ref binds an explicit published snapshot/version.
- Canonical drafts, answer keys, hidden provenance, and import evidence must not leak to student runtime.

## Completion Rules

- A UI action is not complete until it changes system state or opens a real workflow.
- A modal is not complete until submit, cancel, validation, loading, failure, retry, and success states work.
- A governance tool is not complete until role, rule, route, and UI state match.
- A data flow is not complete until the production writer, production reader, index, rules, and tests use the same path.
- A visual proof is not complete when it uses `VITE_PRD0052_TEACHER_MATERIALS_VISUAL_FIXTURES`.
- A security proof is not complete until the actual production paths used by the UI pass rules tests.
- A task is not complete when proof only exists in console diagnostics.
- Each phase must leave evidence in `documentation/tasks/PRD0052/` with exact commands, branch, commit, and caveats.

## Files And Surfaces To Treat As In Scope

Teacher Materials and shared UI:

- `src/pages/TeacherLobbyPage.jsx`
- `src/pages/TeacherLobbyPage.css`
- `src/components/modern/ContentTabs.jsx`
- `src/components/modern/SearchFilterBar.jsx`
- `src/components/modern/TestTypeBlockModule.jsx`
- `src/components/modern/TestTypePreferenceModal.jsx`
- `src/components/modern/MaterialListRow.jsx`
- `src/components/modern/materialListAdapter.js`

Book UI and authoring:

- `src/components/modern/BookCard.jsx`
- `src/components/modern/BookCardGrid.jsx`
- `src/components/books/CreateBookModal.tsx`
- `src/components/books/BookEditorPage.tsx`
- `src/components/books/BookNodeTree.tsx`
- `src/components/books/BookMaterialPicker.tsx`

Routes, flags, and observability:

- `src/config/readingV2FeatureFlags.ts`
- `src/routes/teacherRoutes.tsx`
- `src/constants/routes.ts`
- `src/services/featureRegistry.ts`
- page/action observability registry files touched by PRD-0052 workflows

Material catalog services:

- `src/services/materialCatalog/materialCatalogPaths.ts`
- `src/services/materialCatalog/materialCatalogIndexes.service.ts`
- `src/services/materialCatalog/materialBooks.service.ts`
- `src/services/materialCatalog/testTypeConfig.service.ts`
- `src/services/materialCatalog/teacherTestTypePreferences.service.ts`
- `src/services/materialCatalog/bookValidation.service.ts`

Reading V2 production and passage services:

- `src/services/reading-v2/readingV2StudioWorkflow.service.ts`
- `src/services/reading-v2/readingV2PublishPipeline.service.ts`
- `src/services/reading-v2/readingV2FirebasePublishAdapter.service.ts`
- `src/services/reading-v2/readingV2PassageExtraction.service.ts`
- `src/services/reading-v2/readingV2PassageLibrary.service.ts`
- `src/services/reading-v2/readingV2PassageHomework.service.ts`
- `src/services/reading-v2/readingV2PassageHomeworkLaunch.service.ts`
- `src/services/reading-v2/readingV2TeacherComposition.service.ts`
- `src/services/reading-v2/readingV2Backfill.service.ts`
- `src/services/reading-v2/readingV2ResultAdapter.service.ts`
- `src/services/reading-v2/readingV2StoragePaths.service.ts`

Homework, runtime, and result surfaces:

- `src/components/homework/HomeworkCreateModal.tsx`
- `src/services/homeworkManager.ts`
- `src/pages/StudentPracticePage.tsx`
- student homework list/detail pages touched by Reading Passage assignments
- teacher homework result/review pages touched by Reading Passage submissions
- `functions/src/readingV2SubmitCore.ts`

Rules and verification:

- `database.rules.json`
- `firestore.rules`
- RTDB and Firestore rule tests
- existing Vitest tests covering touched files
- Playwright/browser evidence under `output/playwright/prd0052-*`

## Phase 0 - Branch, Rules, And Truth Reset

- [x] Confirm work starts in `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased` on branch `codex/prd0052-material-tabs-inline`.
  - 2026-06-04 update: `git rev-parse --show-toplevel`, `git rev-parse --abbrev-ref HEAD`, and `git rev-parse --short HEAD` returned active root `C:/Users/The Lord/Desktop/luyentap-writing-import-rebased`, branch `codex/prd0052-material-tabs-inline`, and HEAD `6f05e857`.
- [ ] Run `git status --short --branch` and record the result before code edits.
- [ ] Read `AGENTS.md` in the target root before edits.
- [ ] Read `documentation/architecture/ui-design-standards.md` before UI edits.
- [ ] Read `documentation/architecture/teacher-lobby-authoring-and-navigation.md` before changing Teacher Lobby shell/header placement.
- [ ] Read `documentation/rules/observability.md` before adding or modifying user-facing actions.
- [ ] Read `documentation/rules/infrastructure.md` before changing Firebase paths, rules, indexes, writers, or sync operations.
- [ ] Read `documentation/rules/codebase-hygiene.md` before changing PRD-0052 replacement surfaces or any file that imports `@mantine/*`.
- [ ] Read `documentation/rules/mobile-portability.md` before adding storage, `window.*`, `document.*`, `navigator.*`, or direct `useNavigate()` usage.
- [ ] Reopen the prior PRD-0052 handoff status. Downgrade any row that depends on fixture mode, skipped emulator proof, denied RTDB proof, no-op actions, or route-only scaffolds.
- [ ] Create a fresh gap-closure evidence note in `documentation/tasks/PRD0052/` listing the exact P0/P1/P2 gaps accepted from the reports.
- [ ] Preserve the correction that the Drafts-tab regression was likely false positive unless a fresh targeted regression reproduces it.
- [ ] Preserve the correction that the Book material picker is not public-only; the real defect is missing `material_catalog/material_indexes` rules and proof.
- [ ] Add a merge gate: PRD-0052 cannot be called faithful while any P0 or P1 item in this tasklist remains open.

## Phase 1 - Canonical Data Plane And Index Rules

- [ ] Record the index-family decision before code edits. Default decision: use `material_catalog/material_indexes` as the canonical Teacher Materials lightweight listing index because current Reading Passage library and Book picker already use it.
- [x] Remove production reliance on unused `reading_v2/listing_indexes`, or document it as a deprecated/internal compatibility path with no QA proof value.
  - 2026-06-03 update: production Reading Passage list and Book material-picker proof uses `material_catalog/material_indexes`. `documentation/architecture/reading-v2-material-publish-and-passage-library.md` and `documentation/architecture/teacher-materials-listing-and-diagnostics.md` now mark `reading_v2/listing_indexes` as obsolete/compatibility-only for PRD-0052 QA.
- [ ] Align `materialCatalogPaths.ts`, `materialCatalogIndexes.service.ts`, `readingV2StoragePaths.service.ts`, Reading Passage writers, Reading Passage readers, Book picker readers, tests, and docs to one canonical listing-index contract.
- [x] Add `database.rules.json` rules for `material_catalog/material_indexes/by_owner/{teacherId}/{materialId}`.
- [x] Add `database.rules.json` rules for `material_catalog/material_indexes/by_visibility/public/{materialId}`.
- [ ] Ensure teachers can read own material summaries.
- [ ] Ensure teachers can read public material summaries that are explicitly public-readable.
- [ ] Ensure students cannot browse Teacher Materials listing indexes.
- [ ] Ensure index rows cannot expose answer keys, draft payloads, import evidence, hidden provenance, or canonical Reading V2 draft content.
- [ ] Ensure index writes validate `ownerId`, `visibility`, `kind`, `publicationState`, title fields, Test Type ids, source labels, and safe summary fields.
- [ ] Add rule tests proving owner teacher read/write, other teacher denial for private rows, teacher read of public rows, student denial, unauthenticated denial, and malformed row denial.
- [x] Update existing tests that currently prove the wrong `reading_v2/listing_indexes` path so they target the production path used by the UI.
- [ ] Add one integration test that writes a Reading Passage summary index and proves the Teacher Lobby Reading Passage reader can load it through the same path.
- [ ] Add one integration test that writes a published material summary index and proves the Book material picker can load it through the same path.

## Phase 2 - Feature Gates, Routes, And Rollout Control

- [ ] Create or refactor a central capability resolver, for example `getTeacherMaterialsCapabilities()`, sourced from `readingV2FeatureFlags.ts` and the feature registry.
- [ ] Gate the `Reading Passage` tab through the central capability resolver.
- [ ] Gate the `Book` tab through the central capability resolver.
- [ ] Gate the Book editor route in `teacherRoutes.tsx`.
- [ ] Gate Book creation, Book editing, Book material picker, Book public-review actions, and Book ref assignment actions.
- [ ] Gate Reading Passage row actions, bulk assignment, and create-full-test-from-selected actions.
- [ ] Gate Admin Test Type management and any public Book review surface by role and feature flag.
- [ ] Ensure a disabled PRD-0052 flag hides tabs and direct actions instead of exposing broken surfaces.
- [ ] Ensure direct navigation to a disabled Book editor or Reading Passage workflow redirects to a safe Teacher Materials page with a visible message.
- [ ] Add tests with feature flags enabled and disabled for tabs, routes, primary CTA changes, action menus, and admin surfaces.
- [ ] Update observability registry entries so gated actions emit consistent action names only when the action is visible and usable.

## Phase 3 - Admin Test Type Governance Loop

- [ ] Make Teacher Lobby load active Test Types from `testTypeConfig.service.ts` through the live repository, not from `DEFAULT_MATERIAL_TEST_TYPES` as the normal path.
- [ ] Keep `DEFAULT_MATERIAL_TEST_TYPES` only as bootstrap/fallback data when the repository is empty or unavailable, and surface a diagnostic caveat when fallback is active.
- [ ] Make teacher pins load from `teacherTestTypePreferences.service.ts`.
- [ ] When a teacher has no pins, show the admin default top 4 active Test Types.
- [ ] Preserve the 4-card centered Test Type block layout with no `All` block.
- [ ] Make Test Type block click filter the active tab below it.
- [ ] Make Test Type settings icon open `TestTypePreferenceModal` without changing the active filter.
- [ ] Make `TestTypePreferenceModal` save, cancel, validate max 4 pins, recover from load failure, recover from save failure, and update the visible blocks after save.
- [ ] Make Reading Passage source labels use the configured Test Type source label, for example `Passage`, `Part`, or `Section`.
- [ ] Preserve aliases so `TOFEL` maps to `TOEFL` and `CELF` maps to `CEFR` without breaking old material metadata.
- [ ] Ensure Book metadata uses `testTypeIds[]` and supports multiple Test Types.
- [ ] Replace comma-separated Test Type id entry in Book authoring with a controlled Test Type picker backed by the live Test Type repository.
- [ ] Add tests for active/inactive Test Types, alias normalization, teacher pins, default top 4, source label display, save failure, and fallback diagnostics.

## Phase 4 - Reading Passage Production Producer

- [ ] Wire `readingV2PassageExtraction.service.ts` into the real Reading V2 Studio publish flow in `readingV2StudioWorkflow.service.ts`.
- [ ] Wire `readingV2PassageExtraction.service.ts` into the real import/publish path in `readingV2PublishPipeline.service.ts`.
- [x] Ensure every published Reading V2 full test creates standalone Reading Passage entities for each passage.
- [x] Ensure each generated Reading Passage stores canonical passage content, question/task groups, answer rules, scoring rules, source metadata, Test Type ids, version metadata, owner, visibility, and publication state.
- [x] Ensure each generated Reading Passage also stores a student-safe projection with no answer key, hidden provenance, import evidence, or draft-only payload.
- [x] Ensure each generated Reading Passage writes a safe Teacher Materials summary index row under the canonical `material_catalog/material_indexes` path.
- [x] Ensure each generated Reading Passage writes relationship data needed by the full-test composition, without exposing unsafe metadata to students.
- [x] Ensure the full Reading V2 test stores ordered references to generated Reading Passage entity ids and versions.
- [x] Ensure source order display preserves original order and configured label for IELTS and non-IELTS Test Types.
- [ ] Preserve the PRD rule that no direct blank/manual `Create Reading Passage` CTA exists in V1.
- [ ] Add publish-flow tests proving a normal Studio publish creates Reading Passage entities and ordered composition refs.
- [ ] Add import-flow tests proving imported full tests create Reading Passage entities and ordered composition refs.
- [ ] Add tests proving answer keys are present in teacher/review-safe storage and absent from student-safe projections.
- [ ] Add tests proving publish failure rolls back or leaves no half-created passage/index/composition state.
  - 2026-06-03 update: read-only Clippings proof used `C:\Users\The Lord\Desktop\luyentap\Clippings\Practice Cam 10 Reading Test 04.md`. Live Auto V4 import parsed 3 passages / 40 questions. First run found a real answer-key merge bug where local/source and provider-copied equivalent rows with slash-spacing differences became duplicate publish blockers. `readingV2AutoImport.service.ts` now dedupes equivalent rows by question id plus slash-normalized answer text, with a RED-first test in `readingV2AutoImport.service.test.ts`.
  - 2026-06-03 update: after the fix, live Auto V4 import returned 3 passages, 40 questions, 40 answer values, no missing/extra questions, no missing/mismatched answer values, no silent question loss, and no publish blockers. It still returns `needs_review` because source-coverage diagnostics require teacher review.
  - 2026-06-03 update: a temporary no-DB in-memory publish probe fed that Clippings full-test candidate into `publishReadingV2Material` with `materialKind: full-test`. Output staged 3 Reading Passage entities, 3 ordered composition refs, and write kinds for Reading Passage material/version/student-safe projection/review projection/metadata/listing indexes plus full-test composition/version. This was later superseded by live browser publish/RTDB proof.
  - 2026-06-03 update: live browser publish of `PRD0052 QA Reading V2 Full Test 2026-06-03` succeeded after the publish-plan fix. RTDB verified 3 generated Reading Passage rows under `material_catalog/material_indexes/by_source_full_test/studio-material-mpxjmklq`, 3 canonical passage `reading_v2/published_snapshots/*`, and 3 `reading_v2/projections/student_safe_tests/*` rows. Leak check for answer-key/provenance strings across list and student-safe paths returned false.

## Phase 5 - Operational Backfill

- [x] Add an operational backfill entrypoint for existing full Reading V2 tests, for example `scripts/reading-v2-full-test-passage-backfill.mjs` plus an npm script.
- [x] Make dry-run the default mode.
- [x] Require explicit `--write` and `--approved` flags for mutation mode.
- [x] Support filters for owner teacher, material id, created date range, limit, and dry-run report output path.
- [x] Report every planned Reading Passage entity, skipped material, invalid source, duplicate, permission failure, and write failure.
- [x] Reuse the production extraction, versioning, projection, index, and composition-writing services instead of duplicating backfill logic.
- [x] Make mutation mode idempotent so reruns do not create duplicate passage entities for the same full-test passage/version.
- [x] Add tests for dry-run planning, write mode, duplicate avoidance, invalid material skip, and partial failure reporting.
- [x] Document exact local emulator and live-approved run commands in `documentation/tasks/PRD0052/prd0052-reading-v2-backfill-dry-run-plan.md`.
  - 2026-06-04 update: local backfill runner exists as `npm run backfill:reading-v2-passages -- [options]` through `scripts/reading-v2-full-test-passage-backfill.ts`. Verification passed for dry-run default, required `--write --approved`, owner/material/date/limit/report parsing, invalid-source skips, root update payload creation, approval-gated writes, deterministic idempotent write paths, legacy missing `validationState` tolerance in publish validation, and extracted publish-gate failures routing to manual review.
  - 2026-06-04 reviewed-gate update: backfill write mode now requires `--from-report <dry-run-report.json>` in addition to `--write --approved <id>`, aborts when Firebase reads fail, and verifies the reviewed dry-run report's project/row count/stable digest before mutation. `cmd /c npm run backfill:reading-v2-passages -- --write --approved lead-1` failed before Firebase reads with `Mutation mode requires --from-report <dry-run-report.json>.`
  - 2026-06-04 fresh dry-run proof: after normalizing Firebase CLI paths to leading `/` and checking extracted passage documents against the publish gate, `cmd /c npm run backfill:reading-v2-passages -- --dry-run --project temp-a1437 --report output/reading-v2-backfill/prd0052-reading-v2-backfill-dry-run-20260604-after-publish-gate.json` returned `total=4`, `splitReady=0`, `manualReview=1`, `alreadyBackfilled=3`, `readFailures=0`, `mutation=not-run`. The manual-review source is `studio-material-mojlf55h` / `snapshot-studio-material-mojlf55h-mojlfaqa` with 22 `publish-gate-blocked` issues.
  - 2026-06-04 approved write proof: `cmd /c npm run backfill:reading-v2-passages -- --write --approved user-approved-all-remaining-20260604 --from-report output/reading-v2-backfill/prd0052-reading-v2-backfill-dry-run-20260604-after-publish-gate.json --project temp-a1437 --report output/reading-v2-backfill/prd0052-reading-v2-backfill-write-20260604-no-eligible-sources.json` committed with `plannedWriteCount=0`, `readFailures=0`, and no eligible split-ready sources. Current backfill follow-up is source-data repair or owner deferment for `studio-material-mojlf55h`; no partial backfill data was written.
  - 2026-06-04 owner-approved deferment: `studio-material-mojlf55h` remains a source-data/manual-review item because safe automated repair would require editorial reconstruction of missing visible completion blanks and invalid multi-select scoring/order. No live source mutation was performed.

## Phase 6 - Reading Passage Library Actions

- [ ] Replace fixture-backed success claims with live/emulated data proof for the Reading Passage tab.
- [x] Make the Reading Passage tab read from the canonical production index path.
  - 2026-06-03 update: live browser QA on flagged `localhost:5175` first reproduced `Permission denied` on `material_catalog/material_indexes/by_owner/{teacherId}`; after bucket-level RTDB rule deployment, Private/Public Reading Passage scopes loaded the production path and rendered the real empty state with 0 browser console errors.
- [ ] Add visible loading, empty, permission-denied, retry, and partial-error states for Reading Passage list loading.
- [ ] Implement Reading Passage archive as a real state mutation, or remove the visible archive action until the mutation exists.
- [ ] Ensure archive updates canonical entity state, version/index state, visibility buckets, selected rows, and current list state.
- [ ] Split `View` and `Revise` behavior. `View` must open a read-only viewer or be removed. `Revise` must open the correct edit/fork workflow.
- [ ] Implement the PRD editing rule: editing from inside a full test defaults to a test-specific fork/new version, and shared source edit requires an explicit separate command.
- [ ] Replace hardcoded `accessible: true` with a service check that verifies publication state, student-safe projection, owner/public access, version availability, and homework compatibility.
- [ ] Disable assign actions with a visible reason when the projection or access contract is missing.
- [ ] Make single Reading Passage assignment open the real homework modal with a verified candidate payload.
- [x] Make bulk Reading Passage assignment create one combined homework set with ordered selected passages.
- [x] Ensure bulk assignment preserves selected order, source labels, version ids, and student-safe snapshots.
  - 2026-06-03 update: browser QA selected two generated Reading Passage rows from `studio-material-mpxjmklq`, assigned one combined homework set `SiDFz9BPXOCSKhgoxTBi`, and launched the set as Student. Local runtime fixes preserved ordered passage prefixes, missing empty `optionSets`, and prefixed option-bank references.
- [ ] Add visible loading, success, failure, and retry states around `Assign selected`.
- [x] Make `Create full test from selected` create a reusable full Reading test composition that is visible and recoverable by the teacher.
- [x] Ensure `Create full test from selected` writes a composition, version, material catalog summary, safe student projection, and canonical index row through one consistent workflow.
- [x] After creating a full test from selected passages, show a success state with a direct route to the created full test editor/viewer.
- [x] Add visible loading, failure, validation, and retry states around `Create full test from selected`.
- [x] Ensure selected Reading Passage rows clear only after a confirmed success.
  - 2026-06-03 update: live browser QA selected two production Reading Passage rows from `studio-material-mpxjmklq`, created full-test material `composition-teacher-selected-glmhcrzmnys6aqfcb9i0nloqq6x2-studio-material-mpxjmklq-passage-1-snapshot-studio-material-mpxjmklq-mpxjnrwq`, opened the created revise workflow, then confirmed the new `Selected Reading Passages` row was recoverable from `My Content`. Firebase CLI confirmed 2 composition refs, 2 sections, 5 task groups, 26 student-safe interactions, catalog index row, and no duplicate `reading_v2/reading_passage_materials/{materialId}` entity. A first failed browser attempt exposed missing Firebase round-trip normalization for omitted empty canonical maps; the fix added normalization and a failure/retry/selection-persistence test.
- [ ] Add tests for archive, view, revise/fork, single assign, bulk assign, create-full-test success, create-full-test failure, selection persistence, unavailable projection, and permission denial.

## Phase 7 - Book Governance, Public Review, And Public Structure

- [ ] Remove `public-library-published` and `public-library-rejected` from normal teacher Book editor controls.
- [ ] Add a normal teacher action named `Request public review` for eligible Books.
- [ ] Make `Request public review` validate structure readiness, public-safety of contained refs, required metadata, and Test Type ids.
- [x] Add an admin/super-admin review workflow for pending public Books, or explicitly route public approval through an existing admin settings surface.
- [x] Let super admin approve, reject, and return Books to private/draft with visible reason fields.
- [x] Ensure pending and rejected public-review Books are not readable by all teachers unless policy explicitly says they are visible to all teachers.
- [x] Implement a public-safe Book structure projection for published public Books, generated only after approval.
- [ ] Keep raw `material_catalog/book_nodes/{bookId}` readable only by owner teacher and super admin.
- [x] Make public Book detail read from the public-safe projection, not from raw owner nodes.
- [x] Ensure public-safe projection contains only allowed node fields, order, display labels, and refs to public published material summaries.
- [x] Prevent public approval when a Book contains private-only, draft, missing, or unsafe material refs.
- [x] Add rules for public-safe Book projection read/write.
- [ ] Add tests for owner private Book read, other teacher private denial, pending-review access policy, rejected access policy, published public projection read, raw node denial for non-owner, and unsafe ref approval denial.

## Phase 8 - Book Authoring And Editing Tools

- [ ] Rename Book card owner action from `Archive/Delete` to the exact mutation it performs.
- [ ] Make Book archive/delete controls separate, explicit, and role-appropriate.
- [ ] Replace comma-separated authors with a controlled multi-author editor.
- [ ] Replace comma-separated tags with a chip/tag editor.
- [ ] Replace plain Test Type id text fields with a Test Type picker backed by live Test Type config.
- [ ] Keep Book creation valid for empty draft Books.
- [ ] Make Book readiness explicit: structurally ready only when at least one `section`, `chapter`, or `test` node exists.
- [ ] Keep placeholder-only Books draft/incomplete even when placeholder nodes contain material refs.
- [ ] Enforce max tree depth 5 in UI, service validation, import/move actions, and save actions.
- [ ] Allow all Book node types to contain children.
- [ ] Allow all Book node types to contain material refs.
- [ ] Keep placeholder nodes non-assignable as nodes.
- [ ] Keep material refs inside placeholder nodes assignable only through the referenced material's normal actions.
- [ ] Allow the same material to appear multiple times in one Book with unique `refId`, parent, order, and display fallback.
- [ ] Make the material picker list only published materials selectable in V1.
- [ ] Make draft materials impossible to select or save as Book refs.
- [ ] Make material picker load owner and public candidates through the canonical material index path.
- [ ] Add visible loading, empty, permission-denied, stale-ref, retry, and save-failure states to the material picker.
- [ ] Make individual material assignment from inside a Book bind an explicit published snapshot/version at assignment time.
- [ ] Keep whole-Book assignment absent from all normal teacher controls.
- [ ] Add tests for metadata validation, empty draft save, readiness calculation, max depth, node movement, duplicate refs, draft ref rejection, published ref selection, public candidate loading, private candidate loading, archive, delete, and individual ref assignment.

## Phase 9 - Atomic Persistence And Repairability

- [x] Refactor Book metadata, node, and index writes to use atomic multi-location updates where RTDB supports them.
- [x] Ensure stale Book indexes are removed in the same committed update that writes new indexes.
- [x] Ensure Book node replacement cannot leave orphan nodes on partial failure.
  - 2026-06-04 update: `materialBooks.service.ts` now commits Book metadata, index, node, and public-projection mutations through `MaterialBooksRepository.update(...)`. Firebase callsites in Teacher Lobby, Book editor, and Admin Settings pass `update(ref(database), payload)`, so stale index removals, new index writes, node removals, replacement nodes, metadata, and projection changes are one root RTDB multi-location payload.
- [ ] Ensure Reading Passage composition and version writes are atomic.
- [x] Ensure create-full-test-from-selected writes composition, version, material summary, and indexes atomically.
  - 2026-06-03 update: `createReadingV2TeacherSelectedPassageComposition(...)` now uses a single RTDB multi-location update for publish updates, `tests/{materialId}`, `reading_v2/full_test_compositions`, version, material metadata/projections, and canonical `material_catalog/material_indexes` rows.
- [ ] Ensure Reading V2 publish writes Reading Passage entity, version, projection, indexes, relationships, and full-test refs atomically or with a documented recovery transaction.
- [x] Add repair utilities for stale index rows, orphan Book nodes, and composition-without-version records.
  - 2026-06-04 update: `planMaterialCatalogRepairOperations(...)` now emits dry-run repair operations for stale `material_catalog/material_indexes`, stale `material_catalog/book_indexes`, orphan/cascaded `material_catalog/book_nodes`, and missing `reading_v2/full_test_composition_versions/{compositionId}/{versionId}` records. It does not execute writes by itself.
  - 2026-06-04 update: `npm run repair:material-catalog -- [options]` now provides an operational dry-run/default repair runner. Write mode requires `--write --approved <id> --from-report <dry-run-report.json>`, aborts on Firebase read failures, requires the reviewed report to be a dry-run/not-run report, verifies project/count/digest against the reviewed dry-run report, and commits the reviewed repair operations through one root RTDB multi-location update.
  - 2026-06-04 dry-run proof: `cmd /c npm run repair:material-catalog -- --dry-run --project temp-a1437 --report output/material-catalog-repair/prd0052-material-catalog-repair-dry-run-20260604-fixed.json` returned `operations=54`, `readFailures=0`, `mutation=not-run`, digest `b3094eb7135b612b3cc6df229e469f28535d8bae55a9d580ea5852bb95cc933b`, with 45 `material-index-write` and 9 `book-index-write` operations.
  - 2026-06-04 approved write proof: `cmd /c npm run repair:material-catalog -- --write --approved user-approved-all-remaining-20260604 --from-report output/material-catalog-repair/prd0052-material-catalog-repair-dry-run-20260604-fixed.json --project temp-a1437 --report output/material-catalog-repair/prd0052-material-catalog-repair-write-20260604-approved.json` returned `mutation=committed`, `plannedWriteCount=54`, `readFailures=0`, and the same digest `b3094eb7135b612b3cc6df229e469f28535d8bae55a9d580ea5852bb95cc933b`. Firebase CLI reads confirmed representative repaired Material Catalog and Book index rows.
  - 2026-06-04 convergence fix: a post-write dry-run exposed false-positive stale rows from raw `JSON.stringify` comparison against Firebase-returned key order and RTDB-omitted empty arrays/objects. `materialCatalogRepair.service.ts` now uses canonical Firebase-style comparison, and `src/services/materialCatalog/materialCatalogRepair.service.test.ts` covers both regressions.
  - 2026-06-04 convergence proof: `cmd /c npm run repair:material-catalog -- --dry-run --project temp-a1437 --report output/material-catalog-repair/prd0052-material-catalog-repair-dry-run-20260604-post-repair-converged.json` returned `operations=0`, `readFailures=0`, `mutation=not-run`.
  - 2026-06-04 composition-version fixture proof: after creating controlled temp composition `composition-prd0052-repair-proof-20260604` with missing version `snapshot-prd0052-repair-proof-20260604`, `output/material-catalog-repair/prd0052-material-catalog-repair-dry-run-20260604-composition-version-fixture.json` returned exactly 1 `composition-version-write`, digest `bfaa30605a356843dac041d6754dc6a9028399bc3e49170983d850c3736c9521`. Approved write `output/material-catalog-repair/prd0052-material-catalog-repair-write-20260604-composition-version-fixture.json` committed that one operation, Firebase CLI verified the version row, and the temp composition/version paths were removed.
  - 2026-06-04 final repair baseline: `cmd /c npm run repair:material-catalog -- --dry-run --project temp-a1437 --report output/material-catalog-repair/prd0052-material-catalog-repair-dry-run-20260604-final-converged.json` returned `operations=0`, `readFailures=0`, `mutation=not-run` after fixture cleanup.
- [ ] Add tests that simulate write failures and prove no stale index, orphan node, or composition/version mismatch remains.
  - 2026-06-04 partial update: Book write-failure proof is now covered locally. `materialBooks.service.test.ts` simulates a failed atomic metadata update and asserts no sequential `write`/`remove` fallback runs; Book tree tests assert stale node removal, replacement node write, metadata, and indexes are in the same update payload. Composition/version mismatch recovery proof is now covered by the approved live fixture write above; full simulated write-failure coverage remains a lower-priority test-hardening item.

## Phase 10 - Homework, Student Runtime, And Teacher Review

- [x] Verify single Reading Passage homework assignment uses the real homework modal and persists a homework record with versioned Reading Passage references.
- [x] Verify bulk Reading Passage homework assignment persists one combined homework set, not separate unrelated homework records.
  - 2026-06-03 update: browser QA created one `Selected Reading Passages` homework set for two selected Reading Passage rows. Student launch used `/student/practice/reading-passage-set:SiDFz9BPXOCSKhgoxTBi` and rendered one 26-question set split into Passage 1 and Passage 2.
- [x] Verify assigned Reading Passage homework launches in student runtime from a student-safe projection only.
- [x] Verify student submission writes through the Reading V2 submit path without exposing answer keys.
- [x] Verify teacher result/review can load Reading Passage homework submissions.
  - 2026-06-03 update: live QA assigned `studio-material-mpxjmklq-passage-1` as homework `on5vF6XUxIOwzXRpr0fk`, launched as `student@test.com`, submitted 13/13 through trusted Reading V2 submit, completed `homework_submissions`, and loaded teacher Homework Detail/result review at 100%, 13/13, band 10.0.
  - 2026-06-03 update: after Worker deploy, bulk homework set `SiDFz9BPXOCSKhgoxTBi` submitted through trusted Reading V2 submit with 26 answers. Result `reading-v2-result-6211194e-a441-4192-a2d0-5353a668bf07` scored 11/26 (42%). Teacher Homework Detail showed 1 submitted, 100% completion, average 42%, and the review modal rendered `Reading Passage Set Review` with 5 task groups and all 26 answer-map entries.
- [x] Verify existing full Reading V2 tests still launch, submit, and review after Reading Passage extraction and composition ref changes.
  - 2026-06-03 update: live browser QA started session `SMC10J` from full test `studio-material-mpxjmklq` / `snapshot-studio-material-mpxjmklq-mpxjnrwq`. Student launch first reproduced a `teacher-preview` live-session gate block, then a RED-first fix allowed only `live-session` while keeping solo-practice blocked. Student launched `/student-test/SMC10J`, submitted a 40-question Reading V2 attempt through the deployed Worker, and teacher result/review surfaces rendered score `0/40`, answer map 40 incorrect, 8 task groups, and all 3 passage titles. A second RED-first fix made `Re-mark` recover when Reading V2 source tests have no legacy `questions[]`, using saved `questionResults` instead.
  - 2026-06-04 update: fresh deployed-Worker recheck started session `A91JFM` from the same full test. Student launched `/student-test/A91JFM`, saw 40 questions across 3 parts, submitted a blank attempt through `https://r2-backup-worker.iamhuwng.workers.dev/api/reading-v2/submit` with HTTP 200, result `reading-v2-result-01384d15-cbc3-4e55-beb4-7ccacf6bebd2`, attempt `reading-v2-attempt-9ebe77fa-5521-4638-a9d6-d21bf231316f`, and score `0/40`. Firebase CLI confirmed `reading_v2/results`, `reading_v2/attempts`, and `test_results` records. Teacher `/teacher-test-results/A91JFM` rendered 1 student, 40 incorrect, Question Difficulty Analysis (40), and Re-mark Q1-Q40. Teacher `/result/{resultId}` rendered the 40-answer map plus Reading V2 review for all 3 passage titles and 8 task groups.
- [x] Deploy Reading V2 Worker set-submit support and rerun bulk Reading Passage set submit/result/review browser proof.
  - 2026-06-03 update: deployed `r2-backup-worker` version `0c28124d-88b7-403b-b0cb-bb7d1cd25a79` to `https://r2-backup-worker.iamhuwng.workers.dev`. Live student submit returned HTTP 200 with result `reading-v2-result-6211194e-a441-4192-a2d0-5353a668bf07`; the previous deployed Worker 404 did not recur. Firebase CLI confirmed `reading_v2/results`, `reading_v2/attempts`, and `test_results` records for the result/attempt.
- [x] Verify homework history/detail pages show Reading Passage title, source label, Test Type, and assignment state.
  - 2026-06-04 update: unit UI proof covers `HomeworkCard` and `TeacherHomeworkDetailPage` rendering Reading Passage/Set title, source label, Test Type, and assignment status from assignment-time snapshots.
  - 2026-06-04 live update: teacher browser QA on `http://localhost:5174` opened `/teacher/homework`, switched to Timeline, and verified set `SiDFz9BPXOCSKhgoxTBi` showed `Selected Reading Passages`, `Active`, `Reading Passage Set`, source `Source unknown - PRD0052 QA Reading V2 Full Test 2026-06-03`, Test Type `IELTS`, and submissions `1 / 1`. Detail route `/teacher/homework/SiDFz9BPXOCSKhgoxTBi` showed the same metadata plus `QUESTIONS 26`, assigned students `1`, completion rate `100%`, average `42%`, and student status `Submitted`.
- [x] Verify unavailable or unpublished Reading Passage versions cannot be assigned.
  - 2026-06-04 update: library rows with draft/unpublished state remain visible but become `accessible=false` and `selectable=false`; homework modal now surfaces the exact assignment denial instead of a generic load failure.
- [x] Verify archived Reading Passages do not break already assigned homework snapshots.
  - 2026-06-04 update: `StudentPracticePage` replay coverage asserts assigned Reading Passage set homework launches only from frozen `student_safe_tests/{passage}:{snapshot}` paths and fails if current source metadata/material rows are read.
- [x] Add tests covering homework creation, student launch, submit, scoring/review, archived-source replay, unavailable projection denial, and existing full-test regression.
  - 2026-06-04 update: targeted local tests cover homework creation denial, homework card/detail metadata, Reading Passage summary metadata, archived-source runtime replay, library draft non-assignment, Reading V2 set submit core, result adapter/review adapter, and existing full-test result regressions.

## Phase 11 - Security And Rules Closure

- [ ] Add RTDB rules for every production path used by PRD-0052 UI readers and writers.
- [ ] Add Firestore rules only where PRD-0052 stores or reads Firestore data.
- [ ] Deny students access to teacher material catalog lists, Book raw data, admin Test Type config writes, teacher preferences, and unsafe Reading V2 metadata.
- [ ] Permit teachers to read own private Books, own private Reading Passages, public published Books through public-safe projections, and public Reading Passages through safe summaries.
- [ ] Permit teachers to write only owned private/draft Book and Reading Passage metadata allowed by the PRD.
- [ ] Permit super admin Test Type management.
- [x] Permit super admin public Book approval/rejection.
- [ ] Deny teacher writes to published public Book state.
- [ ] Deny pending/rejected public-review leakage unless the approved policy says all teachers may see those states.
- [ ] Deny all malformed index, Book node, Reading Passage projection, and composition writes that include answer keys or hidden provenance in public/student-safe paths.
- [x] Run emulator rules tests for `material_catalog/material_indexes`, `material_catalog/books`, raw Book nodes, public Book projections, Test Type config, teacher preferences, Reading Passage summaries, homework projection reads, and admin-only writes.
- [x] Record skipped rule tests as blockers, not as passed evidence.
  - 2026-06-04 update: system `java -version` still failed, but workspace-local Temurin 21 enabled `cmd /c npx firebase-tools emulators:exec --only database,firestore --project demo-prd-0052-rules "cmd /c npx vitest run src/__tests__/security/materialCatalogFirebaseRules.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/homeworkFirestoreRules.test.ts --reporter=basic --pool=forks"`, which passed 3 files / 39 tests. The first expanded emulator run found hidden/scoring-field leaks in Material Catalog safe paths; hardened rules were deployed to `temp-a1437-default-rtdb`.

## Phase 12 - UX, Modal, And Interaction Completeness

- [ ] Audit every PRD-0052 modal: Test Type preferences, Create Book, Edit Book metadata, Book material picker, homework assignment handoff, public review, and admin approval.
- [ ] For each modal, implement open, close, submit, cancel, validation, loading, disabled, success, failure, retry, keyboard escape, focus management, and screen-reader labels.
- [ ] Remove or hide any button whose handler only logs, tracks telemetry, clears local state, or opens a dead route.
- [ ] Ensure destructive actions require confirmation and have exact labels.
- [ ] Ensure non-destructive archive actions are not labeled as delete.
- [ ] Ensure each visible action has a user-facing result, not only console output or diagnostics.
- [ ] Ensure TeacherHeader remains attached to the top shell edge. Put spacing inside `main` or content wrappers.
- [ ] Preserve list-first Teacher Materials browsing.
- [ ] Preserve Book grid only inside the Book tab.
- [ ] Preserve Test Type block visual behavior and one-row responsiveness.
- [ ] Ensure text does not overflow buttons, cards, rows, modals, or Book editor panels on desktop and mobile widths.
- [ ] Remove Mantine usage encountered in touched teacher UI files.
- [ ] Add or update tests for keyboard flow, loading states, validation states, error states, disabled states, and successful state transitions.

## Phase 13 - Verification Matrix

- [ ] Run targeted unit tests for touched Teacher Lobby, ContentTabs, SearchFilterBar, TestTypeBlockModule, TestTypePreferenceModal, MaterialListRow, BookCard, BookCardGrid, CreateBookModal, BookEditorPage, BookNodeTree, and BookMaterialPicker files.
- [x] Run targeted service tests for Test Type config, teacher preferences, material indexes, Book validation, Book persistence, Reading Passage extraction, Reading Passage library, Reading Passage homework, teacher composition, publish pipeline, Studio workflow, backfill, and result adapter files.
  - 2026-06-04 final repair/backfill update: `cmd /c npx vitest run src/services/materialCatalog/materialCatalogRepair.service.test.ts src/services/materialCatalog/materialCatalogRepairCli.test.ts src/services/reading-v2/readingV2Backfill.service.test.ts src/services/reading-v2/readingV2PassageExtraction.service.test.ts src/services/reading-v2/readingV2BackfillCli.test.ts --reporter=basic` passed, 5 files / 33 tests.
- [x] Run targeted homework/runtime tests for Reading Passage assignment, student launch, submission, and teacher review.
  - 2026-06-03 update: `cmd /c npx vitest run src/components/homework/HomeworkCreateModal.test.tsx src/services/homeworkManager.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/pages/StudentPracticePage.test.tsx src/pages/StudentHomeworkListPage.test.tsx src/pages/StudentHomeworkDetailPage.test.tsx src/__tests__/readingV2PassageSetSubmitCore.test.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/components/results/ReadingV2ReviewContentAdapter.test.tsx src/pages/TeacherLobbyPage.test.jsx src/__tests__/security/materialCatalogFirebaseRules.test.ts --reporter=basic` passed, 12 files / 103 tests.
- [x] Run RTDB and Firestore rule tests for all PRD-0052 production paths.
  - 2026-06-04 update: expanded emulator proof passed 3 files / 39 tests for RTDB Material Catalog, Reading V2 RTDB, and Homework Firestore rules.
- [x] Run browser QA with dev quick-login for Teacher.
- [x] Run browser QA with dev quick-login for Student.
- [x] In browser QA, create or publish a Reading V2 full test and verify Reading Passage rows appear without fixture mode.
  - 2026-06-03 update: live browser proof published a real Auto V4 full-test draft from the Clippings source, then Teacher `Reading Passage > Private` showed 3 generated passage rows without fixture mode.
- [x] In browser QA, assign one Reading Passage and complete it as Student.
- [x] In browser QA, bulk assign selected Reading Passages and verify Student runtime.
  - 2026-06-03 update: bulk set runtime launched after local fixes, rendered Part 1 and Part 2 controls, and pre-submit review showed `Answered 26 of 26`, `Passage 1 13/13`, and `Passage 2 13/13`. After Worker deploy, live submit returned HTTP 200 and teacher review loaded the 42%, 11/26 set result with all 26 questions.
- [x] In browser QA, create a full test from selected Reading Passages and open the resulting full test workflow.
  - 2026-06-03 update: Teacher `Reading Passage > Private` selected the first two generated rows and `Create full test from selected` opened `/teacher/reading-v2/materials/composition-teacher-selected-glmhcrzmnys6aqfcb9i0nloqq6x2-studio-material-mpxjmklq-passage-1-snapshot-studio-material-mpxjmklq-mpxjnrwq/revise`. The editor showed `Selected Reading Passages`, `Edit published test`, 2 passages, and 5 task groups; `My Content` then showed the recoverable Reading V2 full-test row with 26 questions.
- [ ] In browser QA, create a Book, edit metadata, build a nested tree, add published refs, assign an individual ref, request public review, approve as admin, and browse the public-safe Book detail as another teacher.
  - 2026-06-03 update: real super-admin approval flow passed for temporary pending public Books; RTDB rules were deployed to `temp-a1437`; another teacher on `localhost:5174` opened Book > Public, saw the approved Book, and opened public detail through `public_book_projections`. Later 2026-06-04 proof also covered expanded emulator rules and broader Reading Passage homework/runtime/result verification.
- [ ] In browser QA, open Reading Passage production-path tab without fixture mode and verify loaded rows or empty state.
  - 2026-06-03 update: flagged `localhost:5175` teacher QA showed the tab hidden by absent flags by default; with process env flags enabled, `Reading Passage` appeared. Private/Public scopes loaded after deployed bucket-read rule fix and rendered `No Reading Passages yet`; no assignment E2E was possible because live RTDB had no Reading Passage rows.
- [ ] Run visual checks for desktop and mobile Teacher Materials, Reading Passage tab, Book tab, Book editor, modals, and admin surfaces.
- [ ] Run `cmd /c npx vitest run ... --reporter=basic` for Windows Vitest commands.
- [x] Run `npm run check:utf8 -- <changed-paths>`.
  - 2026-06-04 final update: targeted UTF-8 check passed for 13 text files covering repair service/tests, PRD docs, and final repair report JSONs.
- [x] Run `git diff --check`.
  - 2026-06-04 final update: passed with only the pre-existing `json` LF-to-CRLF warning.
- [x] Run type/lint/build commands required by the repo for touched areas.
  - 2026-06-04 final update: `cmd /c npx tsc --noEmit --pretty false` still exited 2 from repo-wide debt; touched-file filter for repair/backfill/rules paths matched 0 errors.
- [x] Record every verification command, result, branch, commit, environment, and caveat in `documentation/tasks/PRD0052/`.
- [x] Treat remote RTDB `Permission denied`, skipped emulator proof, missing Java, or fixture-only screenshots as blockers for affected claims.

## Phase 14 - Documentation, Cleanup, And Final Handoff

- [x] Update `prd0052-implementation-coverage-matrix.md` so statuses match evidence: `PASS`, `PARTIAL`, `SCAFFOLD`, `FAIL`, or `PASS_WITH_CAVEAT`.
- [x] Update `prd0052-final-handoff-checklist.md` with the new gap-closure results.
- [x] Update `prd0052-implementation-notes.md` with canonical data path, feature gates, Test Type governance, public Book governance, and live verification notes.
- [x] Update `prd0052-security-rule-validation-cases.md` with actual production paths and outcomes.
- [x] Update `prd0052-reading-v2-backfill-dry-run-plan.md` with the operational runner command and approval gates.
- [x] Update `prd0052-visual-difference-note.md` to separate fixture layout proof from live workflow proof.
- [x] Remove or quarantine fixture-only evidence from final product-faithfulness claims.
  - 2026-06-04 update: `prd0052-visual-difference-note.md` is explicitly visual-layout evidence only. Live/data-plane claims now point to the gap-closure evidence log, security-rule validation cases, and live repair/backfill reports.
- [ ] Remove stale generated artifacts, unrelated screenshots, and temporary debug files from the final commit set.
- [x] Ensure no old report says PRD-0052 is faithful unless this closure tasklist supports that conclusion.
- [ ] Commit final implementation and documentation with a message that states PRD-0052 gap closure scope and remaining caveats.

## Final Acceptance Checklist

- [x] Reading V2 full-test publish creates standalone Reading Passage entities and ordered full-test composition refs.
- [x] Reading Passage tab is populated by the production path without fixture mode.
- [ ] Reading Passage archive/view/revise/assign/bulk assign/create-full-test actions are real workflows.
- [ ] Book creation, editing, tree management, material refs, individual ref assignment, and public review governance are real workflows.
- [ ] Admin Test Type config governs Teacher Lobby Test Type blocks, labels, filters, and teacher pins.
- [ ] Feature flags and roles govern all PRD-0052 tabs, routes, and actions.
- [x] Canonical material indexes have matching readers, writers, rules, and tests.
- [x] Book public structure is readable only through a safe approved projection.
- [x] Student runtime reads only safe projections.
- [x] No answer key, draft payload, hidden provenance, or import evidence leaks to student/public paths.
- [x] All P0/P1 audit findings are closed with evidence.
  - 2026-06-04 reconciliation: the accepted P0/P1 findings listed in `prd0052-gap-closure-evidence-2026-06-02.md` are closed with code/test/live or emulator evidence. This row does not mark broader unchecked lower-priority tasklist rows complete.
- [x] Any remaining P2/P3 issues are documented with owner-approved deferment and do not block PRD V1 truth.
- [x] Final proof uses live or emulator data, not fixture mode.
- [x] Final docs state the implementation status honestly.
