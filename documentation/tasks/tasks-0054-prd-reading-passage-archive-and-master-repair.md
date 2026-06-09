# Task List: PRD-0054 Reading Passage Archive And Master Repair

Status: Draft tasklist only. No implementation in this turn.
Created: 2026-06-09
Source PRD: `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md`
Required predecessor for master repair UI: `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`

## Execution Contract

- [ ] Treat this tasklist as the implementation source of truth for PRD-0054.
- [ ] Do not implement PRD-0054 broken-master repair UI until PRD-0052 Part 2 has a working `ReadingV2MasterEditModal`. Do not substitute a generic master-edit equivalent; `ReadingV2MasterEditModal` may reuse existing `EditTestFrame` internals only after Phase 0 findings prove those internals support ref-only composition without embedded-payload editing.
- [ ] Archive/restore service work may start before PRD-0052 Part 2 is complete only if it does not assume a master repair UI shape.
- [ ] Duplicate-index foundation work may start before PRD-0052 Part 2 final acceptance because PRD-0052 auto-split duplicate warning depends on it. This does not allow PRD-0054 broken-master repair UI to start early.
- [ ] Keep changes inside listed files unless a task explicitly names a new file.
- [ ] Use the approved audit path `reading_v2/audit_events/{eventId}` and approved duplicate formula from the PRD. Do not re-ask for these decisions.
- [ ] Use the approved duplicate index path `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`. If any required audit, archive, restore, duplicate-index, or modal-owner storage path is still missing after inspection, stop and record it in `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`; do not invent behavior silently.
- [ ] Do not add any super-admin archive/restore UI or super-admin audit-management UI in V1. A future PRD is required for any super-admin UI.
- [ ] Before each parent task is marked complete, update the findings file with evidence, exact tests run, and any deferred residue.

## Must-Read Before Coding

- [ ] Read `AGENTS.md`.
- [ ] Read `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md`.
- [ ] Read `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`.
- [ ] Read `documentation/architecture/reading-v2-audit-trail.md` before audit service, audit event, or audit rule work.
- [ ] Read `documentation/tasks/process-task-list.md`.
- [ ] Read `DESIGN.md`.
- [ ] Read `documentation/architecture/ui-design-standards.md`.
- [ ] Read `documentation/architecture/teacher-lobby-authoring-and-navigation.md`.
- [ ] Read `documentation/architecture/reading-v2-material-publish-and-passage-library.md`.
- [ ] Read `documentation/architecture/teacher-materials-listing-and-diagnostics.md`.
- [ ] Read `documentation/architecture/teacher-materials-list-view-contract.md`.
- [ ] Read `documentation/architecture/book-editor-authoring-modal-architecture.md`.
- [ ] Read `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`.
- [ ] Read `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`.
- [ ] Read `documentation/architecture/homework-solo-practice-architecture.md`.
- [ ] Read `documentation/architecture/student-test-delivery-projections.md`.
- [ ] Read `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`.
- [ ] Read `documentation/rules/navigation.md` before route, link, redirect, or new-tab work.
- [ ] Read `documentation/rules/infrastructure.md` before RTDB, Firestore, rules, index, or publish-write work.
- [ ] Read `documentation/rules/codebase-hygiene.md` before touching any file that imports `@mantine/*` or any producer/consumer storage path.
- [ ] Read `documentation/rules/observability.md` before adding or changing visible buttons, forms, or workflows.
- [ ] Read `documentation/rules/mobile-portability.md` before storage, browser API, `useNavigate`, or `window.*` work.
- [ ] Read `documentation/rules/react-patterns.md` before new component state, loading state, or async effect work.
- [ ] Read `documentation/rules/student-data-loading.md` before student homework/runtime/result data changes.
- [ ] Read `documentation/rules/student-mobile-design.md` if any student layout, mobile header, tab, filter, overlay, drawer, list, card, or right-rail UI changes.

## Known Current Anchors

Inspect these before editing. Add exact line notes to the findings file after inspection.

- [ ] Reading Passage library/archive:
  - `src/types/materialCatalog.types.ts`
  - `src/types/materialCatalog.types.test.ts`
  - `src/types/readingV2.types.ts`
  - `src/services/reading-v2/readingV2PassageLibrary.service.ts`
  - `src/services/reading-v2/readingV2PassageLibrary.service.test.ts`
  - `src/services/reading-v2/readingV2PassageRevision.service.ts`
  - `src/services/reading-v2/readingV2PassageRevision.service.test.ts`
  - `src/services/reading-v2/readingV2TeacherComposition.service.ts`
  - `src/services/reading-v2/readingV2TeacherComposition.service.test.ts`
- [ ] New archive/repair services to add unless exact owners exist after inspection:
  - `src/services/reading-v2/readingV2PassageArchive.service.ts`
  - `src/services/reading-v2/readingV2PassageArchive.service.test.ts`
  - `src/services/reading-v2/readingV2BrokenReference.service.ts`
  - `src/services/reading-v2/readingV2BrokenReference.service.test.ts`
  - `src/services/reading-v2/readingV2PassageDuplicateGuard.service.ts`
  - `src/services/reading-v2/readingV2PassageDuplicateGuard.service.test.ts`
- [ ] PRD-0052 dependency services/components:
  - `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`
  - `src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx`
  - `src/components/reading-v2/master/ReadingV2MasterPassagePicker.tsx`
  - `src/services/reading-v2/readingV2ReferenceUpdate.service.ts`
  - `src/services/reading-v2/readingV2ReferenceUpdate.service.test.ts`
- [ ] Teacher materials UI:
  - `src/pages/TeacherLobbyPage.jsx`
  - `src/pages/TeacherLobbyPage.test.jsx`
  - `src/components/modern/SearchFilterBar.jsx`
  - `src/components/modern/SearchFilterBar.test.jsx`
  - `src/components/modern/MaterialListRow.jsx`
  - `src/components/modern/MaterialListRow.test.jsx`
  - `src/components/modern/materialListAdapter.js`
  - `src/components/modern/materialListAdapter.test.js`
  - `src/components/modern/BookCard.jsx`
  - `src/components/modern/BookCardGrid.jsx`
  - `src/components/modern/BookCardGrid.test.jsx`
- [ ] Book editor and Book services:
  - `src/components/books/BookEditorModal.tsx`
  - `src/components/books/BookEditorModal.test.tsx`
  - `src/components/books/BookEditorWorkspace.tsx`
  - `src/components/books/BookEditorWorkspace.test.tsx`
  - `src/components/books/BookNodeTree.tsx`
  - `src/components/books/BookNodeTree.test.tsx`
  - `src/components/books/BookMaterialPicker.tsx`
  - `src/components/books/BookMaterialPicker.test.tsx`
  - `src/services/materialCatalog/materialBooks.service.ts`
  - `src/services/materialCatalog/materialBooks.service.test.ts`
  - `src/services/materialCatalog/bookEditor.service.ts`
  - `src/services/materialCatalog/bookEditor.service.test.ts`
  - `src/services/materialCatalog/bookValidation.service.ts`
  - `src/services/materialCatalog/bookValidation.service.test.ts`
- [ ] Assignment, runtime, result guards:
  - `src/services/reading-v2/readingV2PassageHomework.service.ts`
  - `src/services/reading-v2/readingV2PassageHomework.service.test.ts`
  - `src/services/reading-v2/readingV2PassageHomeworkLaunch.service.ts`
  - `src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts`
  - `src/services/reading-v2/readingV2LaunchIntegration.service.ts`
  - `src/services/reading-v2/readingV2LaunchIntegration.service.test.ts`
  - `src/pages/StudentPracticePage.tsx`
  - `src/pages/StudentPracticePage.test.tsx`
  - `src/services/reading-v2/readingV2ResultAdapter.service.ts`
  - `src/services/reading-v2/readingV2ResultAdapter.service.test.ts`
  - `src/components/results/ReadingV2ReviewContentAdapter.tsx`
  - `src/components/results/ReadingV2ReviewContentAdapter.test.tsx`
- [ ] Routes, security, observability:
  - `src/constants/routes.ts`
  - `src/constants/routes.test.ts`
  - `src/routes/teacherRoutes.tsx`
  - `src/routes/teacherRoutes.test.tsx`
  - `src/config/featureRegistry.ts`
  - `src/config/featureRegistry.test.ts`
  - `src/services/reading-v2/readingV2AuditTrail.service.ts`
  - `src/services/reading-v2/readingV2AuditTrail.service.test.ts`
  - `database.rules.json`
  - `src/__tests__/security/readingV2FirebaseRules.test.ts`
  - `src/__tests__/security/materialCatalogFirebaseRules.test.ts`
  - `firestore.rules`
  - `src/__tests__/security/homeworkFirestoreRules.test.ts`

## Phase 0 - Baseline, Dependency Gate, And Findings File

- [ ] Create `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`.
- [ ] Record current `git status --short` before editing.
- [ ] Record whether PRD-0052 Part 2 tasklist is complete or still pending.
- [ ] If `ReadingV2MasterEditModal.tsx` does not exist, mark PRD-0054 master repair UI tasks blocked in findings and do not implement Phase 5. Record whether any existing `EditTestFrame` internals can be safely reused inside the modal without embedded-payload editing.
- [ ] Search with `rg "archiveReadingV2PassageMaterial|archived|restore|broken|unavailable|delete|remove from library|where-used|duplicate|similarity" src documentation database.rules.json firestore.rules`.
- [ ] Search with `rg "material_catalog|reading_passage_materials|full_test_compositions|Book|book_nodes|published_snapshots|material_indexes" src database.rules.json`.
- [ ] Inspect current archive behavior in `readingV2PassageLibrary.service.ts` and `TeacherLobbyPage.jsx`.
- [ ] Record expected PRD-0052 dependency behavior: published master repair happens in master Edit Test Modal; healthy passage edits use `Update references?`; broken-ref remake auto-updates only its originating broken ref.
- [ ] Inspect current Book unavailable-reference behavior in `BookEditorWorkspace.tsx`, `BookNodeTree.tsx`, `BookMaterialPicker.tsx`, and `bookValidation.service.ts`.
- [ ] Inspect current security rules for archive/delete/restore writes before changing services.
- [ ] Parent acceptance: findings file records dependency status, current archive behavior, current broken-ref behavior, and blocked PRD-0052-dependent work.

## Phase 1A - Audit And Security Scaffold

- [ ] Implement the minimal approved Reading V2 audit writer before any state-changing archive, restore, repair, remove, or duplicate-decision service can be accepted.
  - Add `src/services/reading-v2/readingV2AuditTrail.service.ts`.
  - Add `src/services/reading-v2/readingV2AuditTrail.service.test.ts`.
  - Write events to `reading_v2/audit_events/{eventId}`.
  - Do not extend legacy `src/services/auditService.ts` or legacy `audit_logs` for PRD-0054 events.
  - Validate required event fields before writing.
  - Reject or fail closed for unsafe fields: passage body, canonical payload, answer keys, student answers, scoring rules, AI review evidence, hidden provenance, or import evidence.
- [ ] Add audit path rules before archive/restore service parent acceptance:
  - `database.rules.json` allows `reading_v2/audit_events/{eventId}` create only for valid authenticated state-changing event payloads.
  - `database.rules.json` denies `reading_v2/audit_events/{eventId}` update and delete.
  - `database.rules.json` makes `reading_v2/audit_events/{eventId}` read super-admin only.
  - `database.rules.json` rejects audit event payloads containing body, answers, canonical payload, scoring rules, AI evidence, hidden provenance, or import evidence.
- [ ] Add security tests before archive/restore service parent acceptance:
  - `src/__tests__/security/readingV2FirebaseRules.test.ts` accepts valid Reading V2 audit event create.
  - `src/__tests__/security/readingV2FirebaseRules.test.ts` rejects audit event update/delete.
  - `src/__tests__/security/readingV2FirebaseRules.test.ts` rejects non-super-admin audit read.
  - `src/__tests__/security/readingV2FirebaseRules.test.ts` rejects audit event with unsafe content/answer/canonical fields.
- [ ] Parent acceptance: audit service and audit rules are test-covered before any later phase can claim state-changing archive/restore/repair behavior complete.

## Phase 1B - Duplicate Index Foundation

- [ ] Use the approved deterministic duplicate formula from PRD FR-DUP-4A:
  - normalize body and question text with Unicode NFKC, lowercase, punctuation removal, whitespace collapse, and stable token splitting.
  - body similarity uses SHA-256 hashes of contiguous five-word body shingles.
  - question similarity uses SHA-256 hashes of contiguous three-word shingles from visible prompts, instructions, choices, labels, table visible text, and diagram visible text.
  - compute each side with Sorensen-Dice: `2 * intersectionSize / (leftSetSize + rightSetSize)`.
  - compute `combinedSimilarityPercent = round((bodySimilarity * 0.5 + questionSimilarity * 0.5) * 100)`.
  - warn when `combinedSimilarityPercent >= 80`.
- [ ] Add and secure the owner-scoped current-material duplicate index path `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`.
  - Each row represents the current passage material, not every historical version.
  - Store `currentVersionId` inside the row.
  - Store active/archive state, owner id, title, source, test type, visibility, question count, updated timestamp, and hashed body/question shingle sets.
  - Do not store body text, canonical payload, answer keys, scoring rules, hidden provenance, AI evidence, or import evidence.
  - Include active passages the teacher can access and the teacher's own archived passages.
  - Exclude non-owned archived passages, even if they were public before archive.
- [ ] Add duplicate-index rules and tests before PRD-0052 final acceptance:
  - `database.rules.json` rejects duplicate index rows with body text, answers, canonical payload, scoring rules, AI evidence, hidden provenance, or import evidence.
  - `src/__tests__/security/readingV2FirebaseRules.test.ts` accepts valid owner/current-material duplicate index rows.
  - `src/__tests__/security/readingV2FirebaseRules.test.ts` rejects unsafe duplicate index payload fields.
- [ ] If no existing duplicate service exists, add `src/services/reading-v2/readingV2PassageDuplicateGuard.service.ts`.
  - Inputs: candidate passage title, source, body text, question text, teacher id, visibility scope, and optional current material id.
  - Data source: lightweight duplicate index rows at `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}` with metadata and hashed shingle sets only; do not scan or download full canonical content from the entire database during UI typing.
  - Exclude the current passage when editing.
  - Return matches with material id, title, source, owner, visibility, body similarity, question similarity, combined similarity, and action suggestions.
  - Warn at 80 percent or higher combined similarity.
  - Do not block publish unless PRD/product owner explicitly changes warning-only behavior.
- [ ] Add tests:
  - `readingV2PassageDuplicateGuard.service.test.ts` normalizes case, punctuation, and whitespace deterministically.
  - `readingV2PassageDuplicateGuard.service.test.ts` uses five-word body shingles and three-word question shingles.
  - `readingV2PassageDuplicateGuard.service.test.ts` computes Sorensen-Dice body, question, and combined scores exactly.
  - `readingV2PassageDuplicateGuard.service.test.ts` warns at or above approved 80 percent threshold.
  - `readingV2PassageDuplicateGuard.service.test.ts` does not warn below threshold.
  - `readingV2PassageDuplicateGuard.service.test.ts` excludes current material id.
  - `readingV2PassageDuplicateGuard.service.test.ts` queries active accessible rows and the teacher's own archived rows.
  - `readingV2PassageDuplicateGuard.service.test.ts` excludes non-owned archived rows.
  - `readingV2PassageDuplicateGuard.service.test.ts` does not return answer keys or canonical payload.
- [ ] Parent acceptance: PRD-0052 Part 2 can consume the duplicate guard/index for auto-split publish without waiting for PRD-0054 repair UI phases.

## Phase 2 - Reading Passage Archive And Restore Data Lifecycle

- [ ] Add or extend `src/services/reading-v2/readingV2PassageArchive.service.ts`.
  - Implement `archiveReadingV2PassageMaterial`.
  - Implement `restoreReadingV2PassageMaterial`.
  - Implement `listArchivedReadingV2PassagesForOwner`.
  - Implement `getReadingV2PassageUsageSummary`.
  - Do not delete canonical snapshots or published versions during archive.
  - Archive sets material state to archived and removes active library/listing index rows.
  - Restore sets material state back to published and recreates active library/listing index rows only if the current version/projection is valid.
  - Both archive and restore verify owner permission.
  - Both archive and restore return exact changed paths for test assertions.
- [ ] If adding an archive index path, use a single lightweight owner-scoped archive list path unless architecture review approves more:
  - Candidate path: `material_catalog/material_archive_indexes/by_owner/{ownerId}/reading-passage/{materialId}`.
  - Store row metadata only: `materialId`, `title`, `source`, `testType`, `ownerId`, `visibility`, `archivedAt`, `archivedBy`, `currentVersionId`, `questionCount`, and `hasBrokenRefs` when known.
  - Do not store passage body, question body, answers, or review payload in archive index.
- [ ] Update `src/services/reading-v2/readingV2PassageLibrary.service.ts`.
  - Update `ReadingPassageListScope` usage after extending `src/types/materialCatalog.types.ts`.
  - Active listing excludes archived passages.
  - Archive subtab listing uses the archive service/index.
  - Existing `listTeacherReadingPassages` default remains active-only.
  - Add an explicit `scope: "active" | "archived"` input if needed; do not overload private/public scope.
- [ ] Update `src/types/materialCatalog.types.ts` and `src/types/materialCatalog.types.test.ts`.
  - Extend `ReadingPassageListScope` or add a separate archive scope type so active `private | public` visibility remains distinct from archive status.
  - Preserve existing `MaterialRefAvailability` values including `archived`, `missing`, and `inaccessible`.
- [ ] Add tests:
  - `readingV2PassageArchive.service.test.ts` archives and removes active index rows.
  - `readingV2PassageArchive.service.test.ts` preserves canonical snapshots and published versions.
  - `readingV2PassageArchive.service.test.ts` restores a valid archived passage and recreates active rows.
  - `readingV2PassageArchive.service.test.ts` rejects restore when current version/projection is missing.
  - `readingV2PassageArchive.service.test.ts` rejects non-owner archive/restore.
  - `readingV2PassageLibrary.service.test.ts` excludes archived passages from active lists.
  - `readingV2PassageLibrary.service.test.ts` returns archived passages only for Archive subtab scope.
- [ ] Do not expose Teacher Lobby archive/restore UI in this phase. Phase 4 owns visible archive UI after broken-ref invalidation ownership is implemented and tested.
- [ ] Parent acceptance: archive/restore data services, archive index/list readers, audit writes, and path-specific rule tests pass without relying on a visible UI placeholder.

## Phase 3 - Master Delete, Broken Reference Detection, And Guards

- [ ] Do not start this phase until PRD-0052 ref-only master storage contract is implemented or the findings file records the exact pending dependency.
- [ ] Add `src/services/reading-v2/readingV2BrokenReference.service.ts`.
  - Detect master refs whose passage material is archived.
  - Detect master refs whose passage material is deleted or missing.
  - Detect master refs whose referenced snapshot/version/projection is missing.
  - Detect master refs whose teacher no longer has access to a public/non-owned source if access rules require that.
  - Return per-ref reason codes: `archived`, `deleted`, `missing-version`, `missing-projection`, `inaccessible`, and `unknown`.
  - Return repair affordances for each reason: `restore`, `choose-existing`, `remove-ref`, `clone-remake`, or `blocked`.
- [ ] Update master metadata/list indexes.
  - If master rows already have status fields, add `hasBrokenRefs`, `brokenRefCount`, and `brokenRefReasons`.
  - If no safe index owner exists, compute broken status in the master modal only and record that listing badge is deferred.
  - Do not write broken status from student launch paths or read-time student pages.
- [ ] Add delete/remove behavior for Reading V2 master compositions.
  - Use soft archive/remove-from-library semantics unless an existing tested hard-delete owner exists.
  - Removed masters disappear from active master lists in V1.
  - Do not add a normal teacher master Archive tab or master restore UI in V1 unless a later PRD explicitly approves it.
  - Do not delete passage materials when deleting/removing a master.
  - Deleting/removing a master does not mutate assignments or completed results.
  - Deleting/removing a master blocks future launches from active lists.
- [ ] Add tests:
  - `readingV2BrokenReference.service.test.ts` detects archived passage refs.
  - `readingV2BrokenReference.service.test.ts` detects deleted/missing passage refs.
  - `readingV2BrokenReference.service.test.ts` detects missing version/projection refs.
  - `readingV2BrokenReference.service.test.ts` returns exact repair affordances.
  - `readingV2TeacherComposition.service.test.ts` removes/archives a master without deleting referenced passages.
  - `readingV2LaunchIntegration.service.test.ts` blocks launch of a current active master with broken refs.
  - `readingV2PassageHomework.service.test.ts` blocks assigning a broken master.
  - `readingV2ResultAdapter.service.test.ts` continues to review old frozen results for deleted/archived live refs.
- [ ] Update security rules:
  - `database.rules.json` permits owner/admin archive/restore/delete state writes only through allowed metadata/index fields.
  - `database.rules.json` rejects deletion or mutation of immutable published snapshots by teacher archive/restore flows.
  - `src/__tests__/security/readingV2FirebaseRules.test.ts` covers valid archive/restore and invalid snapshot deletion.
- [ ] Parent acceptance: broken current masters cannot be assigned or launched, while frozen assigned/completed work remains reviewable.
- [ ] Define broken-ref invalidation ownership.
  - Archive, restore, visibility-change, repair, and reference-update services own safe recompute/write of `hasBrokenRefs`, `brokenRefCount`, and `brokenRefReasons`.
  - Listing/card reads and student launch paths must not write broken-ref summary state.
  - If summary indexes cannot be safely maintained, document modal-only detection as deferred listing badge work and do not claim card badge completion.

## Phase 4 - Archive UI Enablement

- [ ] Start this phase only after Phase 2 archive/restore data services and Phase 3 broken-ref invalidation ownership pass parent acceptance.
- [ ] Update Teacher Lobby UI:
  - Edit `src/pages/TeacherLobbyPage.jsx`.
  - Edit `src/pages/TeacherLobbyPage.test.jsx`.
  - Edit `src/components/modern/SearchFilterBar.jsx` and `src/components/modern/SearchFilterBar.test.jsx` if the Reading Passage scope control is owned there.
  - Replace any Reading Passage archive action label with `Remove from library`.
  - Do not use `window.confirm`; use an in-app confirmation modal matching existing teacher UI.
  - Confirmation modal shows usage summary: affected masters, Books, assigned homework count, and result/review safety note.
  - Add Archive subtab under the Reading Passage material filter.
  - Archive subtab rows show `Restore` and disabled/non-destructive metadata actions only.
  - Active tab excludes archived rows.
  - Restore success moves the row back to active listing.
- [ ] Update `src/components/modern/materialListAdapter.js` and `src/components/modern/MaterialListRow.jsx` only if row metadata/actions are owned there.
  - Add archive status badge.
  - Add broken-ref status badge only after Phase 3 service exists.
  - Keep list rows lightweight; do not hydrate canonical payload.
- [ ] Update `src/components/modern/materialListAdapter.test.js` and `src/components/modern/MaterialListRow.test.jsx`.
  - Assert active row action label is `Remove from library`, not `Archive`.
  - Assert Archive subtab row action label is `Restore`.
  - Assert archived row display is read-only except restore and approved metadata actions.
- [ ] Parent acceptance: teacher can remove a Reading Passage from active library, see it in Archive subtab, restore it, and affected master/Book broken-ref summaries are updated by service owners, not listing/card reads.

## Phase 5 - Master Repair UI In Edit Test Modal

- [ ] Start this phase only after PRD-0052 Part 2 Phase 8 marks the dependency ready in its findings file, and the master Edit Test Modal tests pass.
- [ ] Edit `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`.
  - Show broken-ref banner at top of modal.
  - Show each broken passage slot with reason, affected title/version, and allowed actions.
  - Allow `Add existing passage`.
  - Allow `Remove passage`.
  - Allow `Remake manually` by opening single-passage Studio in a new tab or approved modal flow.
  - Allow `Restore source passage` only when the teacher owns the archived source and restore service allows it.
  - Disable publish until all broken refs are fixed or explicitly removed.
  - Preserve unaffected refs and order.
  - Replacement with a different Test Type is allowed only after explicit mixed-Test-Type confirmation; same-Test-Type matches sort first.
- [ ] Add `src/components/reading-v2/master/ReadingV2MasterRepairPanel.tsx` and `.test.tsx` if the repair UI is too large for the modal body.
  - Panel receives broken-ref summary and action callbacks from modal.
  - Panel does not fetch canonical payload itself.
  - Panel has loading, empty, repair-success, repair-failure, and blocked states.
- [ ] Implement numbering review.
  - After add/remove/remake, show passage order and question count summary before publish.
  - Require teacher confirmation when total question count changes.
  - Do not renumber frozen assignment/result snapshots.
- [ ] Add tests:
  - `ReadingV2MasterEditModal.test.tsx` opens with archived ref warning.
  - `ReadingV2MasterEditModal.test.tsx` blocks publish while broken refs remain.
  - `ReadingV2MasterEditModal.test.tsx` repairs by choosing existing passage.
  - `ReadingV2MasterEditModal.test.tsx` allows different-Test-Type repair only after explicit confirmation.
  - `ReadingV2MasterEditModal.test.tsx` removes a broken passage and shows numbering review.
  - `ReadingV2MasterEditModal.test.tsx` opens remake flow for single-passage Studio and preserves modal state.
  - `ReadingV2MasterEditModal.test.tsx` proves broken-ref remake publish does not show the normal `Update references?` modal.
  - `ReadingV2MasterRepairPanel.test.tsx` maps reason codes to exact actions.
- [ ] Update observability:
  - Add `reading_v2_master_broken_refs_viewed`.
  - Add `reading_v2_master_ref_repair_started`.
  - Add `reading_v2_master_ref_repaired_existing`.
  - Add `reading_v2_master_ref_removed`.
  - Add `reading_v2_master_ref_remake_started`.
  - Add `reading_v2_master_repair_publish_submitted`.
- [ ] Parent acceptance: a teacher can open a broken master, repair or remove all broken refs, confirm numbering changes, and publish a repaired master without using full-test Studio.

## Phase 6 - Book Broken Reference UX And Repair

- [ ] Update Book service validation:
  - Edit `src/services/materialCatalog/bookValidation.service.ts`.
  - Edit `src/services/materialCatalog/bookValidation.service.test.ts`.
  - Detect archived, deleted/missing, missing-version, missing-projection, and inaccessible Reading Passage refs.
  - Keep existing draft/private/public validation behavior.
  - Return reason codes aligned with `readingV2BrokenReference.service.ts`.
- [ ] Update Book material services:
  - Edit `src/services/materialCatalog/bookEditor.service.ts`.
  - Edit `src/services/materialCatalog/bookEditor.service.test.ts`.
  - Edit `src/services/materialCatalog/materialBooks.service.ts`.
  - Edit `src/services/materialCatalog/materialBooks.service.test.ts`.
  - Preserve Book structure when refs become broken.
  - Add lightweight broken-ref summary to Book rows/indexes when safe.
  - Do not hydrate full passage payload for Book list cards.
- [ ] Update Book list cards:
  - Edit `src/components/modern/BookCard.jsx`.
  - Edit `src/components/modern/BookCardGrid.jsx`.
  - Edit `src/components/modern/BookCardGrid.test.jsx`.
  - Show a clear broken-reference badge or warning state for Books with broken refs.
  - `Review` or `Fix` opens the existing Book editor modal, not a new Book page.
- [ ] Update Book editor:
  - Edit `src/components/books/BookEditorWorkspace.tsx`.
  - Edit `src/components/books/BookEditorWorkspace.test.tsx`.
  - Edit `src/components/books/BookNodeTree.tsx`.
  - Edit `src/components/books/BookNodeTree.test.tsx`.
  - Edit `src/components/books/BookMaterialPicker.tsx`.
  - Edit `src/components/books/BookMaterialPicker.test.tsx`.
  - Show broken nodes in the tree with exact reason.
  - Provide actions: choose replacement, remove node, restore source when owned and allowed.
  - Keep existing 3-tab modal contract: Overview, Content, Settings.
  - Do not wrap `TeacherHeader` or create a standalone Book page.
- [ ] Add tests:
  - Book card shows broken ref badge without loading canonical payload.
  - Book editor lists all broken refs in Content tab.
  - Book editor replaces broken Reading Passage ref with a published active passage.
  - Book editor removes a broken node and preserves valid sibling order.
  - Book editor restore action appears only for owned archived sources.
  - Book publish/assignment guards block Books with unresolved broken refs if those flows exist.
- [ ] Parent acceptance: Books with broken Reading Passage refs are visible, fixable in the existing modal, and blocked from unsafe future use until repaired.

## Phase 7 - Duplicate Warning Surfaces

- [ ] Start this phase only after Phase 1B duplicate index foundation passes and PRD-0052 Part 2 Phase 2B integration status is recorded.
- [ ] Do not reimplement the duplicate formula, duplicate index, or duplicate guard service here; consume `readingV2PassageDuplicateGuard.service.ts`.
- [ ] Do not implement duplicate detection from broad canonical content scans or answer keys.
- [ ] Integrate warning surfaces:
  - Single-passage Studio publish flow.
  - Test Creation Modal existing/created passage flow only where candidate content is available.
  - Master modal add-existing flow only for duplicate selected refs, not text similarity.
  - PRD-0052 auto-split publish flow, gated on duplicate index availability.
- [ ] Add UI tests in the owning components after inspection:
  - duplicate warning visible, non-blocking, and tracked.
  - `Use existing` path uses the selected existing passage.
  - `Create new anyway` path continues publish/create with warning metadata.
  - `Restore and use` appears only for the teacher's own archived duplicate when restore service allows it.
  - UI never exposes answer keys, canonical payload, hidden provenance, AI evidence, or full canonical payload hydration.
- [ ] Parent acceptance: duplicate warning surfaces consume the Phase 1B index/service, stay non-blocking at 80 percent or higher, and use no unsafe broad content hydration.

## Phase 8 - Assignment, Publish, Runtime, And Result Safety

- [ ] Update assignment guards:
  - `src/services/reading-v2/readingV2PassageHomework.service.ts`
  - `src/services/reading-v2/readingV2PassageHomework.service.test.ts`
  - Archived or broken current materials cannot be assigned.
  - Restored and repaired materials can be assigned only after active projection/index state is valid.
- [ ] Update launch guards:
  - `src/services/reading-v2/readingV2LaunchIntegration.service.ts`
  - `src/services/reading-v2/readingV2LaunchIntegration.service.test.ts`
  - Current launch blocks archived/broken live materials.
  - Assignment-pinned launch from frozen projection still works after source archive/delete if the frozen projection exists.
- [ ] Update result/review:
  - `src/services/reading-v2/readingV2ResultAdapter.service.ts`
  - `src/services/reading-v2/readingV2ResultAdapter.service.test.ts`
  - `src/components/results/ReadingV2ReviewContentAdapter.tsx`
  - `src/components/results/ReadingV2ReviewContentAdapter.test.tsx`
  - Completed results use frozen snapshot/projection data.
  - Result/review does not expose raw canonical deleted/archived content beyond frozen result projection.
- [ ] Update publish guards:
  - `src/services/reading-v2/readingV2PublishPipeline.service.ts`
  - `src/services/reading-v2/readingV2PublishPipeline.service.test.ts`
  - Publishing a master with unresolved broken refs fails before writes.
  - Publishing a Book with unresolved broken refs fails before writes if Books publish as material artifacts.
- [ ] Parent acceptance: future unsafe use is blocked, old frozen learning evidence remains available, and no result changes when source materials are archived/restored/repaired.

## Phase 9 - Audit, Observability, Security Rules Final Sweep

- [ ] Verify and extend the approved Reading V2 audit path from Phase 1A and `documentation/architecture/reading-v2-audit-trail.md`; do not introduce a second audit writer.
  - Confirm events write to `reading_v2/audit_events/{eventId}`.
  - Confirm no PRD-0054 event extends legacy `src/services/auditService.ts` or legacy `audit_logs`.
  - Confirm required event fields are validated before writing.
  - Confirm unsafe fields fail closed: passage body, canonical payload, answer keys, student answers, scoring rules, AI review evidence, hidden provenance, or import evidence.
- [ ] Required audit events:
  - archive Reading Passage
  - restore Reading Passage
  - delete/remove master
  - restore source from repair flow
  - repair broken master ref
  - repair broken Book ref
  - duplicate warning accepted by using existing/restored passage
  - duplicate warning bypassed by creating new passage anyway
- [ ] Required observability-only events, not append-only audit events unless super-admin audit policy later expands:
  - broken master ref viewed
  - broken Book ref viewed
  - duplicate warning shown
- [ ] Update `src/config/featureRegistry.ts` and `src/config/featureRegistry.test.ts`.
  - Add visible action ids for archive, restore, repair, delete/remove, duplicate warning, and Book repair actions.
- [ ] Update or verify `database.rules.json`; phase-specific rule tests from Phase 1A, Phase 1B, Phase 2, and Phase 3 cannot be deferred to this sweep:
  - Archive/restore writes limited to owner/admin metadata and index paths.
  - Archive/restore cannot mutate immutable snapshots or old versions.
  - Archive index rows cannot include body, answers, or review payload.
  - Broken-ref summary fields cannot include student answers or answer keys.
  - `reading_v2/audit_events/{eventId}` create is allowed only for valid authenticated state-changing event payloads.
  - `reading_v2/audit_events/{eventId}` update and delete are denied.
  - `reading_v2/audit_events/{eventId}` read is super-admin only.
  - Audit event payload cannot include body, answers, canonical payload, scoring rules, AI evidence, hidden provenance, or import evidence.
- [ ] Update `src/__tests__/security/readingV2FirebaseRules.test.ts`.
  - Valid owner archive/restore accepted.
  - Non-owner archive/restore rejected.
  - Snapshot deletion through archive rejected.
  - Archive index payload with content/answers rejected.
  - Broken-ref summary with answer payload rejected.
  - Valid Reading V2 audit event create accepted.
  - Audit event update/delete rejected.
  - Non-super-admin audit read rejected.
  - Audit event with unsafe content/answer/canonical fields rejected.
- [ ] Update `src/__tests__/security/materialCatalogFirebaseRules.test.ts` for Book broken-ref rows and archive metadata if material catalog rules are touched.
- [ ] Update `firestore.rules` and `src/__tests__/security/homeworkFirestoreRules.test.ts` only if homework assignment schema changes.
- [ ] Parent acceptance: every new write path has a rule test, and every visible action has registry coverage.

## Phase 10 - Documentation And PRD-0052 Feedback

- [ ] Update `documentation/architecture/reading-v2-material-publish-and-passage-library.md`.
  - Add archive/restore lifecycle.
  - Add broken-ref reason code contract.
  - Add frozen assignment/result safety note.
- [ ] Update `documentation/architecture/teacher-materials-listing-and-diagnostics.md`.
  - Add Archive subtab list behavior.
  - Add active-list exclusion rule.
  - Add broken-ref badge source rule.
- [ ] Update `documentation/architecture/teacher-materials-list-view-contract.md`.
  - Add row action label `Remove from library`.
  - Add restore action placement.
  - Add broken-ref row state.
- [ ] Update `documentation/architecture/book-editor-authoring-modal-architecture.md`.
  - Add broken-ref Book editor behavior.
  - Preserve modal-first, 3-tab contract.
- [ ] If PRD-0052 Part 2 implementation exposed a different modal/service path than this tasklist expected, update this tasklist and findings before coding the dependent phase.
- [ ] Parent acceptance: architecture docs match implemented archive, restore, repair, and guard behavior.

## Targeted Test Commands

Run from `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`. For vitest, vite, and esbuild commands in this Windows checkout, use the unrestricted command form required by `AGENTS.md`.

- [ ] Audit and duplicate-index foundations:
  - `cmd /c npx vitest run src/services/reading-v2/readingV2AuditTrail.service.test.ts src/services/reading-v2/readingV2PassageDuplicateGuard.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts --reporter=basic`
- [ ] Archive/restore data and library:
  - `cmd /c npx vitest run src/types/materialCatalog.types.test.ts src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts --reporter=basic`
- [ ] Archive UI enablement:
  - `cmd /c npx vitest run src/pages/TeacherLobbyPage.test.jsx src/components/modern/SearchFilterBar.test.jsx src/components/modern/materialListAdapter.test.js src/components/modern/MaterialListRow.test.jsx --reporter=basic`
- [ ] Broken references and master repair:
  - `cmd /c npx vitest run src/services/reading-v2/readingV2BrokenReference.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/reading-v2/master/ReadingV2MasterRepairPanel.test.tsx --reporter=basic`
- [ ] Book repair:
  - `cmd /c npx vitest run src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/bookEditor.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/modern/BookCard.test.jsx src/components/modern/BookCardGrid.test.jsx src/components/books/BookEditorModal.test.tsx src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx --reporter=basic`
- [ ] Duplicate warning surfaces:
  - `cmd /c npx vitest run src/services/reading-v2/readingV2PassageDuplicateGuard.service.test.ts --reporter=basic`
  - After inspecting the owning UI components, append the exact tests for single-passage publish, Test Creation Modal, master add-existing, and PRD-0052 auto-split warning surfaces. Do not claim Phase 7 with service tests alone.
- [ ] Assignment/runtime/result/publish:
  - `cmd /c npx vitest run src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/pages/StudentPracticePage.test.tsx src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/components/results/ReadingV2ReviewContentAdapter.test.tsx src/services/reading-v2/readingV2PublishPipeline.service.test.ts --reporter=basic`
- [ ] Routes, registry, rules:
  - `cmd /c npx vitest run src/constants/routes.test.ts src/routes/teacherRoutes.test.tsx src/config/featureRegistry.test.ts src/services/reading-v2/readingV2AuditTrail.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/materialCatalogFirebaseRules.test.ts src/__tests__/security/homeworkFirestoreRules.test.ts --reporter=basic`
- [ ] UTF-8 targeted check:
  - `cmd /c npm run check:utf8 -- src/services/reading-v2 src/services/materialCatalog src/components/reading-v2/master src/components/books src/components/modern src/pages/TeacherLobbyPage.jsx src/pages/StudentPracticePage.tsx src/config src/constants src/routes database.rules.json firestore.rules documentation/architecture documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- [ ] Diff whitespace:
  - `git diff --check`

## AI E2E Browser Protocol

- [ ] Use the in-app Browser or Playwright first when it can reach the local dev server and complete dev quick-login.
- [ ] The `@chrome` plugin may be used when necessary: in-app browser authentication fails, popup/new-tab behavior must be proven in real Chrome, cross-tab refresh/on-focus behavior is under test, or existing Chrome session/state is required. Record the reason in the findings file before using Chrome.
- [ ] Do not ask for manual credentials during normal proof. Use the hidden dev quick-login buttons. If quick-login fails, capture the runtime/config error and stop before entering credentials.
- [ ] For every proof step, record browser surface used, viewport size, URL, material/homework ids, expected result, actual result, and screenshot/trace path in the findings file.
- [ ] Use a fresh browser context, separate Chrome profile, or explicit logout before Student proof so Teacher state cannot leak into Student verification.
- [ ] Treat console errors, failed network requests in touched flows, broken feature-registry events, or missing audit/observability events as blockers unless proven unrelated with evidence.

## Browser Proof Steps

- [ ] Start the dev server bound to `localhost:5173`. Do not use a neighboring port.
- [ ] Open `http://localhost:5173`.
- [ ] Click the subtle settings icon in the bottom-right corner.
- [ ] Use the `Teacher` quick-login button.
- [ ] Teacher proof 1: `/lobby` -> Reading Passage filter -> active tab. Remove a Reading Passage from library. Confirm it disappears from active list and appears in Archive subtab.
- [ ] Teacher proof 2: Archive subtab -> restore the passage. Confirm it returns to active list and can be selected by add-existing picker.
- [ ] Teacher proof 3: remove a passage used by a master. Open affected master Edit Test Modal. Confirm broken-ref warning, exact reason, repair actions, and blocked publish until repair.
- [ ] Teacher proof 4: repair broken master by choosing an existing passage, confirm numbering review, publish repaired master, reopen and confirm warning gone.
- [ ] Teacher proof 5: remove a passage used by a Book. Open Book editor modal. Confirm broken node warning, replacement/removal actions, and 3-tab modal contract.
- [ ] Teacher proof 6: trigger duplicate warning in single-passage publish or creation flow with approved duplicate fixture. Confirm warning is visible, non-blocking, and tracked.
- [ ] Teacher proof 7: try assigning archived/broken material. Confirm assignment is blocked with clear error.
- [ ] Student proof: use `Student` quick-login, open existing homework assigned before archive, complete or review it, and confirm frozen assigned/result content still works.
- [ ] Responsive proof for touched teacher modal/list UI: 1366 px, 848 px, 375 px, and 320 px widths. Confirm no horizontal overflow, no overlapping text, and primary actions remain visible.
- [ ] Student mobile proof only if student UI changed: 375 px and 320 px widths, 44 px touch targets, no shell/header regression.
- [ ] Save screenshots or Playwright output paths in the findings file.

## Rollback And Guard Notes

- [ ] Archive is reversible; do not use hard delete for Reading Passage snapshots or versions.
- [ ] Restore must reconstruct active indexes from canonical metadata, not from stale UI row state.
- [ ] Do not mutate assignment-pinned projections or completed result snapshots during archive, restore, repair, or duplicate checks.
- [ ] Do not let active lists, add-existing pickers, homework assignment pickers, or launch flows use archived materials.
- [ ] Do not compute broken-ref summaries in student launch paths by writing back to catalog state.
- [ ] If repair flow needs PRD-0052 modal APIs that do not exist, stop and complete PRD-0052 first.
- [ ] If duplicate guard requires broad canonical content scans, stop and redesign indexing before implementation.
- [ ] If `reading_v2/audit_events/{eventId}` cannot be secured as append-only with super-admin read and unsafe-field rejection, stop before implementing state-changing audit-required flows.
- [ ] Keep PRD-0054 commits separate from unrelated dirty work already present in the worktree.

## Ambiguity Flags

- [ ] PRD-0054 audit path is approved as `reading_v2/audit_events/{eventId}`. Implementation must follow `documentation/architecture/reading-v2-audit-trail.md`.
- [ ] PRD-0054 duplicate threshold and formula are approved. Implementation must use the hashed-shingle Sorensen-Dice formula from PRD FR-DUP-4A.
- [ ] PRD-0054 duplicate index path is approved as `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`. Use current material rows with `currentVersionId`; do not create version-row indexing in V1.
- [ ] PRD-0054 names delete/remove master behavior but does not define hard-delete retention. This tasklist uses soft archive/remove semantics unless existing architecture explicitly approves hard delete.
- [ ] PRD-0054 does not request a normal teacher restore surface for removed masters. Do not add one in V1 without a separate approval.
- [ ] V1 has no super-admin archive/restore UI and no super-admin audit-management UI. Future UI requires a separate PRD.
- [ ] Active listing broken-ref badges require a safe index owner. If no owner exists, modal-only detection is acceptable only when documented as deferred listing badge work.
- [ ] Book repair depends on the current Book editor modal contract. Do not replace the modal-first Book editor with a route page.

## Final Acceptance Criteria

- [ ] Reading Passage active lists exclude archived passages.
- [ ] Archive subtab lists archived passages with restore action.
- [ ] Restore returns a valid passage to active lists and pickers.
- [ ] Archive/restore never deletes immutable snapshots or published versions.
- [ ] Current masters and Books with archived/deleted/missing refs show broken-ref state.
- [ ] Broken current masters cannot be assigned, launched, or published until repaired.
- [ ] Broken Books cannot be used in unsafe future flows until repaired.
- [ ] Master repair happens in Edit Test Modal from PRD-0052, not full-test Studio.
- [ ] Book repair happens in existing Book editor modal and keeps the 3-tab contract.
- [ ] Existing assignments and completed results remain frozen and reviewable after archive, restore, delete/remove, and repair.
- [ ] Duplicate warning uses approved deterministic formula, warns at 80 percent or higher, and does not expose answer/canonical payload.
- [ ] Security rules cover every new write/read path.
- [ ] Observability covers every new visible action.
- [ ] Architecture docs match implemented behavior.
- [ ] Targeted tests, browser proof, UTF-8 check, and `git diff --check` pass.
- [ ] Browser proof records browser surface, viewport, URL, ids, expected result, actual result, and screenshot/trace path for each archive, restore, repair, duplicate-warning, assignment-block, and frozen-result step.
