# PRD-0052 Full Implementation Audit Report

Date: 2026-06-02

Root audited: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

Branch audited: `codex/prd0052-material-tabs-inline`

Compared against local `main`: `fc98e4ff836c3a2ef9c1c3bd4363810feb22483a`

Audited `HEAD`: `d0981111d6c05c5dd03863a10a59d6efe7bc5012`

## Verdict

2026-06-03 status note: this audit is historical gap-finding evidence. Later gap-closure work selected `material_catalog/material_indexes` as the production Teacher Materials summary index family, marked `reading_v2/listing_indexes` compatibility-only for PRD-0052 QA, added architecture docs, and live-verified one Reading V2 full-test publish into generated Reading Passage rows plus single-passage homework/runtime/result review. Keep unresolved items here only when they are not superseded by the gap-closure evidence log.

PRD-0052 is not faithfully actualised.

The implementation is a large scaffold with partial real data plumbing. It contains useful foundations: types, routes, services, UI shells, tests, rules, Reading Passage homework payloads, Book metadata, Book tree services, and visual evidence. But the product PRD aimed for a usable Teacher Materials workflow. Current state still has dead feature gates, fixture-backed proof, no-op actions, incomplete governance, misleading controls, route exposure drift, weak availability checks, and at least one local-main regression.

Short version:

- Architecture exists.
- Some services persist real data.
- Many user-facing workflows are shallow, incomplete, misleading, or not proven against live data.
- Handoff says many rows are `PASS`, but several are better classified as `PARTIAL`, `SCAFFOLD`, or `PASS_WITH_CAVEAT`.

## Audit Approaches Used

This audit used more than four independent approaches.

1. PRD and tasklist requirements trace:
   - Original PRD: `documentation/tasks/0052-prd-teacher-materials-books-and-reading-passage-library.md`
   - Implementation tasklist: `documentation/tasks/tasks-0052-prd-teacher-materials-books-and-reading-passage-library.md`
   - Goal: extract exact target behavior and forbidden patterns.

2. Local `main` comparison:
   - Commands used: `git diff --stat main`, `git diff --name-status main`, `git status --short`
   - Goal: identify every changed surface and drift from the current baseline.

3. UI and interaction audit:
   - Inspected Teacher Lobby, tabs, rows, modals, Book cards, Book editor, Test Type panels, and homework modal wiring.
   - Goal: find buttons/modals/tools that are visual only, no-op, misleading, or not connected to a usable workflow.

4. Data, persistence, and rules trace:
   - Inspected material catalog services, Reading V2 services, Firebase RTDB rules, Firestore rules, homework manager, Cloud Functions, and launch/review services.
   - Goal: classify which flows actually write/read real data and which only create fragments.

5. Verification and handoff audit:
   - Inspected `documentation/tasks/PRD0052/*`, recorded test commands, skipped tests, remote RTDB caveats, fixture proof, lint failures, and screenshots.
   - Goal: separate verified behavior from local-only or fixture-only evidence.

6. Subagent cross-check:
   - Requirements matrix agent completed.
   - Local-main diff agent completed.
   - Two additional agents failed due a transport `previous_response_not_found` error, so main thread completed their UX/data tracks directly.

## Repo State Versus Local Main

`git status --short` showed:

- 64 modified tracked files.
- 92 untracked files.
- 156 total changed/untracked paths.

`git diff --stat main` showed:

- 91 tracked files changed.
- 15,653 insertions.
- 405 deletions.

Important caveat: the tracked diff stat excludes many untracked implementation files, test files, screenshots, docs, assets, and generated artifacts.

## Changed Surface Inventory

### Documentation And Planning Artifacts

Added or changed:

- `documentation/tasks/0052-prd-teacher-materials-books-and-reading-passage-library.md`
- `documentation/tasks/tasks-0052-prd-teacher-materials-books-and-reading-passage-library.md`
- `documentation/tasks/PRD0052/prd0052-final-handoff-checklist.md`
- `documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md`
- `documentation/tasks/PRD0052/prd0052-implementation-notes.md`
- `documentation/tasks/PRD0052/prd0052-reading-v2-backfill-dry-run-plan.md`
- `documentation/tasks/PRD0052/prd0052-security-rule-validation-cases.md`
- `documentation/tasks/PRD0052/prd0052-visual-difference-note.md`
- `documentation/tasks/0052-visual-similarity-extraction-and-rebuild-plan.md`
- `documentation/tasks/tasks-0051-root-design-md.md`
- `DESIGN.md`

Assessment:

- Documentation is extensive.
- Tasklist checkboxes are over-optimistic.
- Handoff claims `PASS` for workflows that are only scaffolded or caveated.
- Fixture-backed visual proof is documented, but not enough to call product behavior working.

### Visual And Evidence Artifacts

Added or changed:

- `.superpowers/brainstorm/prd0052-20260601-023550/content/*.html`
- `.superpowers/brainstorm/prd0052-20260601-023550/state/*`
- `.superpowers/brainstorm/1716-1780260840/*`
- `output/playwright/prd0052-implementation/*.png`
- `output/playwright/prd0052-visual-similarity/*.png`
- `output/playwright/prd0052-visual-similarity/style-extract.json`
- `output/playwright/prd0052-visual-similarity/v5-check-summary.md`
- many older or unrelated `output/playwright/student-*` and `teacher-lobby-*` screenshots
- `prd0052-login-debug.png`
- `tmp/prd0052-visual-extract.mjs`

Assessment:

- Useful for audit history.
- Too much PR noise if all committed.
- Some evidence uses fixture mode, so it proves layout, not live product function.

### Teacher Lobby And Materials UI

Changed or added:

- `src/pages/TeacherLobbyPage.jsx`
- `src/pages/TeacherLobbyPage.css`
- `src/pages/TeacherLobbyPage.test.jsx`
- `src/components/modern/ContentTabs.jsx`
- `src/components/modern/ContentTabs.css`
- `src/components/modern/ContentTabs.test.jsx`
- `src/components/modern/SearchFilterBar.jsx`
- `src/components/modern/SearchFilterBar.test.jsx`
- `src/components/modern/TestTypeBlockModule.jsx`
- `src/components/modern/TestTypeBlockModule.css`
- `src/components/modern/TestTypeBlockModule.test.jsx`
- `src/components/modern/TestTypePreferenceModal.jsx`
- `src/components/modern/TestTypePreferenceModal.css`
- `src/components/modern/TestTypePreferenceModal.test.jsx`
- `src/components/modern/MaterialListRow.jsx`
- `src/components/modern/MaterialListRow.css`
- `src/components/modern/MaterialListRow.test.jsx`
- `src/components/modern/MaterialListView.css`
- `src/components/modern/materialListAdapter.js`
- `src/components/modern/materialListAdapter.test.js`
- `src/components/modern/icons.jsx`

What was done:

- Added `Reading Passage` and `Book` tabs.
- Changed normal materials browsing toward compact list rows.
- Added Test Type blocks under search/create tools.
- Added preference modal hook and settings icon behavior.
- Added Reading Passage Private/Public scope.
- Added Book Private/Public scope.
- Added Reading Passage selected toolbar with `Assign selected` and `Create full test from selected`.
- Added Book create/edit metadata modal entry.
- Added Reading Passage homework modal handoff.
- Added visual fixture mode.

Not faithful / incomplete:

- Tabs are always visible in `ContentTabs.jsx:5-10`; PRD-0052 feature flags do not gate them.
- Teacher Lobby passes `DEFAULT_MATERIAL_TEST_TYPES` into preferences and Test Type blocks instead of loading admin-configured RTDB Test Types, so admin governance does not truly drive teacher lobby behavior (`TeacherLobbyPage.jsx:297-300`, `TeacherLobbyPage.jsx:1025-1030`).
- Reading Passage archive is telemetry-only (`TeacherLobbyPage.jsx:811-814`).
- Reading Passage `View` and `Open` both route to `TEACHER_READING_V2_REVISE` (`TeacherLobbyPage.jsx:778-785`, `materialListAdapter.js:459-462`).
- Assignment candidate hardcodes `accessible: true` (`TeacherLobbyPage.jsx:976-986`).
- `Create full test from selected` writes a composition and clears selection, but does not create a usable material catalog row, route to an editor, or surface the created full test to the teacher (`TeacherLobbyPage.jsx:938-974`, `readingV2TeacherComposition.service.ts:152-175`).
- Fixture mode can hide remote/rules failures (`TeacherLobbyPage.jsx:348-366`, `teacherMaterialsVisualFixtures.js:74-77`).

### Book UI And Editor

Added:

- `src/components/modern/BookCard.jsx`
- `src/components/modern/BookCard.css`
- `src/components/modern/BookCardGrid.jsx`
- `src/components/modern/BookCardGrid.css`
- `src/components/modern/BookCardGrid.test.jsx`
- `src/components/books/CreateBookModal.tsx`
- `src/components/books/CreateBookModal.css`
- `src/components/books/CreateBookModal.test.tsx`
- `src/components/books/BookEditorPage.tsx`
- `src/components/books/BookEditorPage.css`
- `src/components/books/BookEditorPage.test.tsx`
- `src/components/books/BookNodeTree.tsx`
- `src/components/books/BookNodeTree.css`
- `src/components/books/BookNodeTree.test.tsx`
- `src/components/books/BookMaterialPicker.tsx`
- `src/components/books/BookMaterialPicker.css`
- `src/components/books/BookMaterialPicker.test.tsx`

What was done:

- Book card grid exists.
- Book create/edit metadata modal exists.
- Book editor route exists at `/teacher/materials/books/:bookId`.
- Book editor loads metadata and nodes.
- Book editor can save metadata and structure through service calls.
- Book node tree supports placeholder nodes, sections, chapters, tests, movement controls, deletion confirmation, and material refs.
- Book material picker lists published material summaries.
- Individual Reading Passage refs can hand off to homework modal.
- Whole-Book assignment is intentionally unavailable.

Not faithful / incomplete:

- Book card action label says `Archive/Delete` while implementation archives. Misleading destructive wording (`BookCard.jsx:84-86`).
- Book editor visibility dropdown offers `public-library-published` and `public-library-rejected` directly to ordinary teacher UI (`BookEditorPage.tsx:563-568`), while validation says only `super_admin` can set published (`bookValidation.service.ts:261-276`). This is governance drift: UI invites an impossible or forbidden action.
- Book editor uses comma-separated plain text for Test Type ids, tags, authors. Usable, but low-quality for a PRD that needs teacher-facing authoring tools (`BookEditorPage.tsx:557-560`).
- Correction from supplemental verification: Book editor material candidate loading reads both `material_catalog/material_indexes/by_owner/{user.uid}` and `material_catalog/material_indexes/by_visibility/public` (`BookEditorPage.tsx:298-300`). The real defect is that `material_catalog/material_indexes` has no child rules under `database.rules.json`, so parent `material_catalog` super-admin-only rules can deny teacher reads.
- Placeholder nodes exist, but rich placeholder editing is correctly out of scope. Current placeholder UX is still very bare.
- Route is always mounted, with no `MATERIAL_BOOK_EDITOR` gate (`teacherRoutes.tsx:120-123`).

### Admin And Test Type Governance

Added or changed:

- `src/components/admin/TestTypeAdminPanel.tsx`
- `src/components/admin/TestTypeAdminPanel.test.tsx`
- `src/pages/AdminSettingsPage.tsx`
- `src/pages/AdminSettingsPage.test.tsx`
- `src/services/materialCatalog/testTypeConfig.service.ts`
- `src/services/materialCatalog/testTypeConfig.service.test.ts`
- `src/services/materialCatalog/teacherTestTypePreferences.service.ts`
- `src/services/materialCatalog/teacherTestTypePreferences.service.test.ts`

What was done:

- Test Type config service supports RTDB-backed read/write.
- Super-admin write check exists in service.
- Admin panel can create/edit/deactivate records.
- Teacher preference modal can save pinned Test Types.
- Tests cover aliases, display ordering, fewer-than-four behavior, and permission failure.

Not faithful / incomplete:

- Teacher Lobby still uses `DEFAULT_MATERIAL_TEST_TYPES`, not admin-configured RTDB records. This weakens the whole governance system.
- PRD expected admin-configured Test Types to drive teacher blocks, source-order labels, allowed material kinds, and filtering. Current implementation partially stores governance data but does not fully consume it.
- Feature flag for `adminConfigurableTestTypes` exists but does not gate the admin UI or teacher consumption path.

### Material Catalog Types And Services

Added:

- `src/types/materialCatalog.types.ts`
- `src/types/materialCatalog.types.test.ts`
- `src/services/materialCatalog/materialCatalogPaths.ts`
- `src/services/materialCatalog/materialCatalogPaths.test.ts`
- `src/services/materialCatalog/materialCatalogIndexes.service.ts`
- `src/services/materialCatalog/materialCatalogIndexes.service.test.ts`
- `src/services/materialCatalog/materialBooks.service.ts`
- `src/services/materialCatalog/materialBooks.service.test.ts`
- `src/services/materialCatalog/bookValidation.service.ts`
- `src/services/materialCatalog/bookValidation.service.test.ts`
- `src/services/materialCatalog/bookEditor.service.ts`
- `src/services/materialCatalog/bookEditor.service.test.ts`

What was done:

- PRD enums exist for Book visibility and status.
- Book metadata and node shapes exist.
- Book creation/update/tree save services exist.
- Book indexes by owner, visibility, and Test Type exist.
- Validation covers placeholder-only status, max depth, private refs in public Books, duplicate refs, draft refs, and super-admin-only publish.

Not faithful / incomplete:

- Fixture Book data violates the real type/rules vocabulary:
  - `status: 'draft'` in `teacherMaterialsVisualFixtures.js:164`
  - `visibility: 'public-library-visible'` in `teacherMaterialsVisualFixtures.js:199`
  - Real allowed values are `draft-empty`, `draft-in-progress`, `ready`, `archived` and `private`, `public-library-pending-review`, `public-library-published`, `public-library-rejected`.
- Public Book list service reads only `public-library-published` (`materialBooks.service.ts:189-193`), while tasklist says public tab should represent pending/published/rejected visible states for teacher context. This may be intentional for public browsing, but it conflicts with the stated Book scope contract unless clarified.
- `createBookDraft` and `updateBookMetadata` write sequential paths rather than atomic multi-location updates (`materialBooks.service.ts:200-214`). Index drift is possible if partial writes fail.

### Reading V2 / Reading Passage Services

Added or changed:

- `src/services/reading-v2/readingV2PassageExtraction.service.ts`
- `src/services/reading-v2/readingV2PassageExtraction.service.test.ts`
- `src/services/reading-v2/readingV2PassageLibrary.service.ts`
- `src/services/reading-v2/readingV2PassageLibrary.service.test.ts`
- `src/services/reading-v2/readingV2FullTestComposition.service.ts`
- `src/services/reading-v2/readingV2FullTestComposition.service.test.ts`
- `src/services/reading-v2/readingV2TeacherComposition.service.ts`
- `src/services/reading-v2/readingV2TeacherComposition.service.test.ts`
- `src/services/reading-v2/readingV2PassageHomework.service.ts`
- `src/services/reading-v2/readingV2PassageHomework.service.test.ts`
- `src/services/reading-v2/readingV2PassageHomeworkLaunch.service.ts`
- `src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts`
- `src/services/reading-v2/readingV2PassageRevision.service.ts`
- `src/services/reading-v2/readingV2PassageRevision.service.test.ts`
- `src/services/reading-v2/readingV2Backfill.service.ts`
- `src/services/reading-v2/readingV2Backfill.service.test.ts`
- `src/services/reading-v2/readingV2MaterialMetadata.service.ts`
- `src/services/reading-v2/readingV2MaterialMetadata.service.test.ts`
- `src/services/reading-v2/readingV2FirebasePublishAdapter.service.ts`
- `src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts`
- `src/services/reading-v2/readingV2PublishPipeline.service.ts`
- `src/services/reading-v2/readingV2PublishPipeline.service.test.ts`
- `src/services/reading-v2/readingV2StoragePaths.service.ts`
- `src/services/reading-v2/readingV2StoragePaths.service.test.ts`

What was done:

- Reading Passage extraction from full Reading V2 documents exists.
- Passage library reads index rows, metadata, and student-safe projection existence.
- Publish pipeline writes passage records, projections, indexes, and composition records.
- Homework snapshot creation rejects missing snapshot, archived, inaccessible, and missing projection candidates.
- Launch service loads student-safe projections for single and set homework.
- Revision service exists for draft revision paths.
- Backfill dry-run/write plan exists.

Not faithful / incomplete:

- Library row action includes `archive`, but no archive service or mutation is implemented.
- `ReadingV2PassageLibraryRow` does not emit `accessible`, but adapter/source supports it and Teacher Lobby hardcodes assignment `accessible: true`. Guard exists in homework service, but caller bypasses real availability.
- `Create full test from selected` creates only `reading_v2/full_test_compositions` and versions. It does not create a teacher-visible full-test material entry, listing index, route, draft, editor handoff, success state, or assignment surface.
- View/open flow is not separate from revise flow.
- Live browser could not read new RTDB paths, so Reading Passage library behavior is not proven end-to-end.

### Homework, Student Runtime, And Results

Changed or added:

- `src/components/homework/HomeworkCreateModal.tsx`
- `src/components/homework/HomeworkCreateModal.test.tsx`
- `src/services/homeworkManager.ts`
- `src/services/homeworkManager.test.ts`
- `src/types/homework.types.ts`
- `src/pages/StudentPracticePage.tsx`
- `src/pages/StudentPracticePage.test.tsx`
- `src/pages/StudentHomeworkDetailPage.tsx`
- `src/pages/StudentHomeworkDetailPage.test.tsx`
- `src/pages/StudentHomeworkListPage.tsx`
- `src/pages/StudentHomeworkListPage.test.tsx`
- `src/components/results/LegacyResultDetailView.tsx`
- `src/components/results/LegacyResultDetailView.test.tsx`
- `src/components/results/ReadingV2ReviewContentAdapter.tsx`
- `src/components/results/ReadingV2ReviewContentAdapter.test.tsx`
- `src/__tests__/readingV2PassageSetSubmitCore.test.ts`

What was done:

- Homework modal accepts `reading-passage` and `reading-passage-set`.
- Homework manager stores single passage snapshot and combined passage set data.
- Student launch support exists for Reading Passage homework.
- Student result/review adapters now include Reading V2 passage metadata.
- Cloud Function trusted submit path was expanded for Reading V2 composition style submissions.

Not faithful / incomplete:

- Because Teacher Lobby hardcodes `accessible: true`, modal/service guards only protect what the caller honestly supplies.
- `reading-passage-set:{homeworkId}` changes material identity semantics (`homeworkManager.ts:149-151`). Needs broader compatibility audit for code expecting `materialId` to be a real material id.
- Live path through student assignment was not proven in browser in current evidence set.

### Routes, Feature Flags, And Security Config

Changed:

- `src/config/readingV2FeatureFlags.ts`
- `src/config/readingV2FeatureFlags.test.ts`
- `src/config/featureRegistry.ts`
- `src/config/featureRegistry.test.ts`
- `src/config/routeSecurity.ts`
- `src/constants/routes.ts`
- `src/constants/routes.test.ts`
- `src/routes/teacherRoutes.tsx`

What was done:

- PRD-0052 feature flag constants and helper functions exist.
- Routes for Reading V2 revise and Book editor exist.
- Feature registry tracks actions such as archiveBook/archiveReadingPassage.

Not faithful / incomplete:

- Feature flags default disabled in tests but are not consumed by Teacher Lobby tabs/actions/routes.
- `ContentTabs.jsx` always renders `Reading Passage` and `Book`.
- `/teacher/materials/books/:bookId` is always mounted.
- Reading Passage open/revise route can be unmounted if Reading V2 studio route exposure is off, while Teacher Lobby still navigates to it.
- Feature registry tracks `archiveReadingPassage`, but the action is not real.

### Database Rules, Firestore Rules, And Functions

Changed:

- `database.rules.json`
- `firestore.rules`
- `functions/src/index.ts`
- `functions/src/readingV2SubmitCore.ts`
- `functions/src/readingV2SubmitCore.test.ts`
- generated `functions/lib/*`

What was done:

- RTDB rules now include material catalog Test Types, teacher preferences, Books, Book nodes, indexes, and Reading V2 material/composition paths.
- Firestore rules validate homework fields for Reading Passage snapshot/set assignment.
- Cloud Functions trusted submit path can load published snapshots/compositions and write result records.

Not faithful / incomplete:

- Remote RTDB used by browser still denied the new PRD-0052 paths.
- Security test command recorded 16 passing tests but 5 emulator tests skipped.
- Local emulator proof failed because Java was missing.
- Rule files and tests are not the same as deployed/live proof.

### Assets

Added:

- `public/assets/material-test-types/cefr.svg`
- `public/assets/material-test-types/ielts.svg`
- `public/assets/material-test-types/thcs.svg`
- `public/assets/material-test-types/thpt.svg`
- `public/assets/material-test-types/toefl.svg`
- `public/assets/material-test-types/toeic.svg`

Assessment:

- Supports Test Type block visual requirement.
- Need verify asset references use admin-configurable `logoUrl` once teacher lobby consumes RTDB Test Types.

## Requirement-by-Requirement Status

### Teacher Materials Tabs

PRD target:

- Tabs: My Content, Public Library, Drafts, Reading Passage, Book.
- List-first normal browsing.
- Book tab is the only card-grid exception.
- Reading Passage rows must not appear as normal test cards.
- Tab switching preserves search and active Test Type.

Current:

- Tabs exist.
- Book tab grid exists.
- Reading Passage tab list exists.
- Normal grid card branch removed in favor of list rows.

Status: Partial.

Problems:

- Tabs ungated by feature flags.
- Drafts regression claim is now corrected as likely false positive; keep only targeted browser proof as a guard.
- Reading Passage/Book isolation exists in filter logic, but live data proof is weak due remote RTDB denial.

### Test Type Blocks And Preferences

PRD target:

- Four blocks, admin-configurable Test Types, teacher pinning, alias handling, settings icon, no fake placeholder blocks.

Current:

- Test Type block component exists.
- Preference modal exists.
- Admin panel exists.
- Services/tests exist.

Status: Partial.

Problems:

- Teacher Lobby uses `DEFAULT_MATERIAL_TEST_TYPES`, not live admin-configured Test Types.
- Governance writes can happen, but teacher visible blocks may not reflect admin changes.
- Feature flag for admin configurable Test Types exists but is not wired into runtime UI.

### Reading Passage Library

PRD target:

- Dedicated tab, list rows, source order, source full-test metadata, visibility, no manual create, assign, select, create full test, revise/fork, archive.

Current:

- Dedicated tab exists.
- Row model exists.
- Assignment modal handoff exists.
- Multi-select toolbar exists.
- Composition writer exists.

Status: Partial/scaffold.

Problems:

- Archive is telemetry-only.
- View and open route to revise.
- Create full test creates only composition records and does not surface a usable full-test material workflow.
- Availability hardcoded for assignment.
- Remote data proof missing.

### Reading Passage Homework And Student Runtime

PRD target:

- Single and set homework assigns frozen snapshot versions.
- Student runtime uses student-safe projection only.
- Results show correct metadata and attempt binding.

Current:

- Types, homework manager, launch service, student page, and result adapters were expanded.
- Tests exist.

Status: Better than UI, but still not fully proven.

Problems:

- Browser proof through real teacher assignment/student launch is not documented as live-passing.
- Assignment integrity depends on caller-supplied flags; Teacher Lobby hardcodes accessibility.

### Book Tab

PRD target:

- Book is organizer/package only.
- Book tab uses cover/default cards.
- Create New Book opens a real metadata modal.
- Book cards show allowed actions only.
- No whole-Book assignment.

Current:

- Book card grid exists.
- Create/Edit metadata modal exists and writes through Book service.
- Archive Book writes `status: archived`.
- No whole-Book assignment.

Status: Partial.

Problems:

- `Archive/Delete` label is misleading.
- Public scope likely only reads published Books, not pending/rejected visible states.
- Feature flag not wired.
- Live RTDB proof missing.

### Book Editor

PRD target:

- Metadata editor, nested tree editor, placeholders, sections/chapters/tests, refs to published materials, reorder, delete confirmation, assign individual material refs only.

Current:

- Editor route and UI exist.
- Metadata save and structure save call real services.
- Node tree supports many operations.
- Individual Reading Passage ref assignment handoff exists.

Status: Partial.

Problems:

- Public governance dropdown exposes forbidden `public-library-published` to teachers.
- Material picker appears limited to public material index, not teacher-owned private material summaries.
- UI is functional but rough and form-heavy, not yet a complete teacher-grade organizing tool.
- Route not feature-gated.

### Admin Governance

PRD target:

- Super-admin can configure Test Types.
- Teachers consume those settings.
- Normal teachers cannot publish Books directly.

Current:

- Admin Test Type panel/service exists.
- Book validation blocks normal teacher published transition.

Status: Data side partial, UX side incomplete.

Problems:

- Teacher Lobby does not consume admin-configured Test Types.
- Book editor UI offers a forbidden transition.
- Full Book moderation UI is out of V1, but blocked/pending states need clearer teacher-facing behavior.

### Storage And Rules

PRD target:

- RTDB for material catalog/books/Reading V2 listing records.
- Firestore only for homework docs.
- Students cannot read Book organizers or canonical answer-bearing passage content.

Current:

- Rules and paths exist.
- Security tests exist.

Status: Partial/provisional.

Problems:

- Remote RTDB denied new paths during browser proof.
- Emulator tests skipped when env missing.
- Local emulator failed because Java unavailable.

## High-Severity Findings

### P0 - Feature Is Not Faithfully Actualised

The implementation should not be described as complete. It is partial foundation plus scaffold. User-facing Teacher Materials workflows do not yet meet the PRD's usable-product bar.

Evidence:

- Many handoff rows are `PASS`, but key workflows are not live-proven or are no-op.
- Fixture mode substituted for live RTDB body verification.
- Archive action exists visually but does not mutate.
- Feature flags exist but do not gate the feature.

### P1 - PRD-0052 Feature Flags Are Dead Gates

Evidence:

- Defined: `readingV2FeatureFlags.ts:81-97`, `readingV2FeatureFlags.ts:142-167`.
- Always visible tabs: `ContentTabs.jsx:5-10`.
- Always mounted Book route: `teacherRoutes.tsx:120-123`.

Impact:

- Disabled defaults do not preserve production behavior.
- Rollout cannot be controlled.
- Routes/actions can expose incomplete tools.

Required fix:

- Add one `getTeacherMaterialsCapabilities()` or equivalent.
- Gate tabs, route creation, Book editor, Reading Passage tab, Reading Passage homework, Test Type blocks, admin Test Type panel, and actions.
- Add off/on tests.

### P1 - Reading Passage Archive Is Fake

Evidence:

- `readingV2PassageLibrary.service.ts:236-249` declares archive action.
- `materialListAdapter.js:469-470` maps archive click.
- `TeacherLobbyPage.jsx:811-814` only tracks action.

Impact:

- Teacher clicks Archive and nothing changes.
- Handoff claims row action exists, but product behavior does not.

Required fix:

- Implement `archiveReadingPassage` service.
- Confirm owner guard.
- Update metadata state and listing indexes.
- Remove/mark archived row after mutation.
- Add confirmation and tests.

### P1 - Test Type Governance Does Not Drive Teacher Lobby

Evidence:

- Admin/service writes exist.
- Teacher Lobby uses `DEFAULT_MATERIAL_TEST_TYPES` for preferences and blocks (`TeacherLobbyPage.jsx:297-300`, `TeacherLobbyPage.jsx:1025-1030`).

Impact:

- Admin Test Type changes may not affect teacher-facing blocks.
- PRD admin-configurable Test Type requirement is not fulfilled end-to-end.

Required fix:

- Load active teacher-selectable Test Types from RTDB service.
- Use loaded configs everywhere: block rendering, aliases, filtering, preferences, Reading Passage rows, Book rows.
- Add loading/error/fallback behavior.

### P1 - Remote RTDB Proof Failed

Evidence:

- `prd0052-implementation-notes.md:124` says browser probes got `Permission denied`.
- `prd0052-visual-difference-note.md:58-71` says Book and Reading Passage bodies were verified with dev-only fixtures.
- `prd0052-implementation-notes.md:126` says emulator failed because Java missing.

Impact:

- Live data workflow is unproven.
- Layout screenshots are not enough.

Required fix:

- Deploy or emulate PRD-0052 RTDB rules/data.
- Run Teacher Lobby as teacher with real data.
- Run Book create/edit/archive, Reading Passage assign/archive, and student launch.
- Remove fixture evidence as completion proof.

### P1 - Book Editor Offers Forbidden Public Publish

Evidence:

- UI option: `BookEditorPage.tsx:563-568`.
- Service block: `bookValidation.service.ts:261-276`.

Impact:

- Teacher sees governance controls that fail or violate PRD role separation.
- Public library moderation appears more complete than it is.

Required fix:

- For normal teachers, show only Private and Public review requested.
- Show rejected/published as status/chip/read-only unless super-admin.
- Add tests for role-specific options.

### Corrected - Drafts Tab Regression Is Likely False Positive

Evidence:

- `useTestFilters.ts:66-68` returns `[]` for `contentFilter === 'drafts'`.
- `TeacherLobbyPage.jsx` does not render Drafts from `useTestFilters`; it loads drafts through `useTeacherDrafts({ enabled: contentFilter === 'drafts' })` and renders `visibleDrafts`.

Impact:

- Do not carry this as a P1 unless browser proof shows actual Drafts rows missing.
- Current evidence points to the earlier audit finding being wrong.

Required fix:

- Keep a targeted Drafts regression check in the verification plan.
- Remove "restore Drafts behavior" from release-blocker language unless that check fails.

### P1 - Create Full Test From Selected Is Not A Full Workflow

Evidence:

- Button calls `handleCreateFullTestFromSelectedReadingPassages` (`TeacherLobbyPage.jsx:938-974`).
- Service writes composition and version only (`readingV2TeacherComposition.service.ts:152-175`).

Impact:

- Teacher gets no visible new full test, no navigation, no success state, no material catalog index row.
- Workflow is a backend fragment, not usable product behavior.

Required fix:

- Decide expected product endpoint:
  - create draft full Reading V2 test and open editor, or
  - create reusable material catalog row and show it in My Content, or
  - open assign modal for the selected set only.
- Then implement success path, indexing, routing, and tests.

## Medium-Severity Findings

### P2 - View/Open Routes Are Confused With Revise

Evidence:

- Non-owner actions include `view` (`readingV2PassageLibrary.service.ts:246-249`).
- Adapter maps `view` to `onOpenReadingPassage` (`materialListAdapter.js:459-462`).
- Open navigates to revise route (`TeacherLobbyPage.jsx:778-785`).

Impact:

- Public library viewing can land in an edit/revise surface.
- If Reading V2 studio routes are disabled, navigation can fail.

Required fix:

- Add read-only preview route or explicit read-only mode.
- Keep revise owner-only.

### P2 - Reading Passage Assignment Availability Is Hardcoded

Evidence:

- `TeacherLobbyPage.jsx:984-986` sets `hasStudentSafeProjection` from row but `accessible: true`.

Impact:

- Inaccessible materials can pass UI candidate construction.
- Service can only reject what caller marks inaccessible.

Required fix:

- Emit `accessible` from library service.
- Disable Assign action on rows without projection/access.
- Recheck projection existence at submit time.

### P2 - Fixture Schema Drift

Evidence:

- `teacherMaterialsVisualFixtures.js:164` uses `status: 'draft'`.
- `teacherMaterialsVisualFixtures.js:199` uses `visibility: 'public-library-visible'`.

Impact:

- Visual fixtures do not match real rules/types.
- Tests/screenshots can pass invalid states.

Required fix:

- Use canonical PRD status/visibility values.
- Add fixture validation against exported constants.

### P2 - Index Writes Are Non-Atomic

Evidence:

- `materialBooks.service.ts:200-214` writes metadata, cleanup paths, and index paths sequentially.

Impact:

- Partial failure can leave stale/missing indexes.

Required fix:

- Use RTDB multi-location update for metadata/index changes, or add retry/repair strategy.

### P2 - Book Material Picker Uses Unruled Material Indexes

Evidence:

- `BookEditorPage.tsx:298-300` loads candidates from `material_catalog/material_indexes/by_owner/{user.uid}` and `material_catalog/material_indexes/by_visibility/public`.
- `database.rules.json` defines `material_catalog/books`, `book_nodes`, and `book_indexes`, but not `material_indexes`.
- The parent `material_catalog` rule is super-admin-only.

Impact:

- Teachers may be denied when loading candidate materials for a Book, even though the code asks for both owner and public indexes.
- The original "public-only" scope claim is false; this is a rules/path contract problem.

Required fix:

- 2026-06-03 selected direction: add complete RTDB rules and writers for `material_catalog/material_indexes`. Do not move these readers/writers to `reading_v2/listing_indexes`; that path is obsolete/compatibility-only for PRD-0052 QA unless a future migration rewires readers, writers, rules, tests, and browser proof.
- Preserve no-private-leak behavior for public Books through validation and rule checks.

### P2 - Verification Gaps Are Real, Not Administrative

Evidence:

- Security command: 16 passed, 5 skipped.
- Full lint failed with 1719 errors.
- Targeted TS/TSX lint failed parse errors.
- Remote RTDB denied new paths.
- Emulator missing Java.

Impact:

- Cannot call implementation production-ready.

Required fix:

- Separate existing global lint debt from PRD touched-file lint.
- Add emulator-capable or deployed-rules proof.
- Mark skipped tests as open gates, not complete.

## Lower-Severity Findings

### P3 - `Archive/Delete` Label Is Wrong

Evidence:

- `BookCard.jsx:84-86`.

Required fix:

- Rename to `Archive`.
- If hard delete exists later, separate it with confirmation and permissions.

### P3 - Heavy Evidence Artifacts Should Be Curated

Evidence:

- Many screenshots, HTML mocks, state files, temp script, debug PNGs.

Required fix:

- Keep only needed documentation evidence.
- Exclude temp/server pid/debug artifacts.

### P3 - Generated Function Build Files Need Commit Policy

Evidence:

- `functions/lib/*.js`, `.map`, and generated test JS are modified/added.

Required fix:

- Confirm repo policy: commit built function outputs if current repo expects them; otherwise exclude.

## Handoff Document Reclassification

Rows in `prd0052-final-handoff-checklist.md` should be downgraded:

- `21.3 Reading Passage directly assignable`: Partial. UI handoff exists; availability is hardcoded; live proof absent.
- `21.5 Books can be created empty/resumed`: Partial. Modal/service exist; live RTDB proof absent.
- `21.8 Test Type config admin/super-admin only`: Partial. Admin service exists; teacher lobby does not consume live config.
- `21.12 tab-local Book/Reading Passage scopes`: Partial. UI exists; live data denied; fixture proof.
- `21.16 commands/screenshots recorded`: Caveated only. Not completion proof.
- `21.21 Reading Passage row actions`: Fail/Partial. Archive is no-op.
- `21.22 Reading Passage bulk set + composition`: Scaffold. Composition writes, but no usable full-test workflow.
- `21.24 Book route opens editor`: Partial. Route exists; no feature gate.
- `21.30 Book cards allowed actions only`: Partial. Label says `Archive/Delete`.
- `21.32 loading/empty/error states`: Partial. Some exist, but live permission-denied recovery is not workflow-complete.
- `21.40 nine security scenarios`: Partial. 5 emulator tests skipped.
- `21.42 remaining gaps documented`: Incomplete. Current gaps are larger than remote RTDB caveat.

## Current Implementation Classification

### Real Foundations

- Material catalog types.
- Book validation service.
- Book metadata and node persistence.
- Reading Passage extraction/publish/path helpers.
- Reading Passage homework snapshot model.
- Student-safe projection launch adapters.
- RTDB/Firestore rule drafts.
- Admin Test Type panel/service.
- Unit and integration tests for many pure/service layers.

### Scaffolds

- Reading Passage tab UX.
- Book tab UX.
- Book editor UX.
- Create full test from selected.
- Public library Book governance.
- Feature flag rollout.
- Live verification story.

### Placeholders Or No-Ops

- Reading Passage archive action.
- Feature flags as runtime controls.
- Fixture mode as body proof.
- Book `Archive/Delete` label.
- Book editor forbidden public-publish option for non-super-admin users.

### Drift From Main

- Drafts filtering needs a targeted check, but current evidence says the earlier breakage claim is likely false positive.
- Old grid/card branch removed for normal material browsing.
- Homework `materialId` semantics changed for Reading Passage set.
- Firestore homework rule shape stricter; legacy docs may need compatibility check.
- New Book route mounted outside PRD-0052 gate.

## Recommended Repair Order

### Phase 1 - Stop False Completion

1. Update handoff/checklist statuses from `PASS` to `PARTIAL`, `SCAFFOLD`, `FAIL`, or `PASS_WITH_CAVEAT`.
2. Add this report as the current truth source.
3. Block merge until P1 fixes are done.

### Phase 2 - Wire Gates And Governance

1. Implement central PRD-0052 capability gate.
2. Gate tabs, actions, routes, admin panel, and Book editor.
3. Load admin-configured Test Types in Teacher Lobby.
4. Remove forbidden Book visibility options from teacher UI.

### Phase 3 - Make Visible Actions Real

1. Implement Reading Passage archive mutation.
2. Add row refresh and success/error UX.
3. Fix `Create full test from selected` into a real end-to-end workflow.
4. Split view/read-only from revise/edit.
5. Fix assignment availability.

### Phase 4 - Repair Regressions And UX Drift

1. Verify Drafts behavior with a targeted browser/test check; fix only if that check fails.
2. Rename `Archive/Delete` to `Archive`.
3. Replace comma-string editor inputs with proper Test Type/tag/author controls.
4. Load owner/private material candidates in Book editor where allowed.

### Phase 5 - Prove Live Behavior

1. Deploy or emulate RTDB rules.
2. Remove fixture flag.
3. Browser-test:
   - create Book
   - edit Book metadata
   - add nodes
   - attach material ref
   - assign individual Reading Passage ref
   - archive Book
   - assign Reading Passage
   - archive Reading Passage
   - create selected full test and open/use it
   - student launches single Reading Passage homework
   - student launches Reading Passage set homework
   - teacher reviews result metadata
4. Re-run security tests with emulator env enabled.
5. Run touched-file lint/tsc with a working TS parser config.

## Final Assessment

Current implementation should be treated as:

`PRD-0052 foundation and partial prototype, not faithful implementation.`

Merge risk is high until the user-facing tools stop being placeholders and fixture-only evidence is replaced by live workflow proof.
