# PRD-0052 Supplemental Assessment Verification

Date: 2026-06-02

Target worktree: `C:\Users\The Lord\Desktop\luyentap-prd0052-review`

Branch: `codex/prd0052-material-tabs-inline`

Verified commit: `a4b0cd3ef875de79dbc328ad38ef34ebc58cab6f`

Source assessment reviewed: `C:\Users\The Lord\.codex\attachments\c34c95ec-aed2-433a-ad89-ac28803c6ce0\pasted-text.txt`

## Executive Verdict

The pasted supplemental assessment is directionally right and should be taken seriously, especially its core P0: the Reading Passage extraction and storage engine exists, but the real Reading V2 Studio publish path does not invoke it. The implementation therefore does not fulfill the PRD requirement that Reading V2 full-test publish/import auto-creates standalone Reading Passage entities.

However, the pasted assessment is not fully clean. It correctly downgrades the earlier Drafts-tab finding as a likely false positive, but it also repeats or implies one wrong Book finding: the Book material picker is not public-only. It reads both owner and public material indexes. The real issue is worse and different: those `material_catalog/material_indexes` paths have no child rules in `database.rules.json`, so parent `material_catalog` super-admin-only rules can deny teacher reads/writes.

## What To Take In

### P0 - Reading Passage producer is disconnected from production publish

Verdict: confirmed. Take in as top blocker.

Evidence:

- `src/services/reading-v2/readingV2StudioWorkflow.service.ts:583-612` calls `publishReadingV2Material` without `readingPassageExtraction`.
- `src/services/reading-v2/readingV2PublishPipeline.service.ts:564-602` only builds passage entities when `input.readingPassageExtraction` exists.
- `readingPassageExtraction` appears in production code as an optional gate and in tests/docs, but not in the real Studio publish call.

Impact:

- Reading Passage entities are not produced from ordinary Reading V2 full-test publish.
- Reading Passage tab can render UI, assignment affordances, and empty state, but the main data source is never populated.
- Deploying the current branch does not satisfy PRD bullets 27, 47, FR-RP-13, or tasklist section 6 publish integration.

### P0/P1 - Actual material index path has no RTDB rules

Verdict: new finding from verification. Take in.

Evidence:

- `src/services/reading-v2/readingV2PassageLibrary.service.ts:101-131` reads `material_catalog/material_indexes/by_owner/{teacherId}` or `material_catalog/material_indexes/by_visibility/public`.
- `src/components/books/BookEditorPage.tsx:298-300` reads `material_catalog/material_indexes/by_owner/{user.uid}` and `material_catalog/material_indexes/by_visibility/public`.
- `src/services/materialCatalog/materialCatalogIndexes.service.ts:34-38` writes `material_catalog/material_indexes/{bucket}/{key}/{materialId}`.
- `database.rules.json:277-355` defines `material_catalog/test_types`, `teacher_test_type_preferences`, `books`, `book_nodes`, and `book_indexes`, but no `material_indexes` child.
- `database.rules.json:277-279` makes parent `material_catalog` read/write super-admin-only.

Impact:

- Teachers may be denied on the actual index paths used by Reading Passage library and Book material picker.
- Previous browser/rule probes that checked `reading_v2/listing_indexes` did not prove the real UI data path works.
- This can make both Reading Passage list and Book material picker fail even if the disconnected producer is fixed.

### P1 - Tasklist path contract and implementation path drift

Verdict: confirmed. Take in.

Evidence:

- Tasklist item 2.20 demands `readingV2StoragePaths.listingIndexes(surface, materialId)` for `reading_v2/listing_indexes/{surface}/{materialId}`.
- `src/services/reading-v2/readingV2StoragePaths.service.ts:51-52` implements that helper.
- `readingV2StoragePaths.listingIndexes` is used only in storage-path tests, not in production writers/readers.
- Production passage index writes use `buildMaterialCatalogIndexWrites`, which emits `material_catalog/material_indexes/...`.
- Production passage list reads `material_catalog/material_indexes/...`.

Impact:

- The codebase has two competing index concepts.
- QA/docs can test the wrong path and still miss the real production failure.
- The implementation should choose one listing index family and align storage helpers, rules, readers, writers, tests, and documentation.

### P1 - Backfill is service-only, not operational

Verdict: confirmed. Take in.

Evidence:

- `src/services/reading-v2/readingV2Backfill.service.ts:344` exports `runReadingV2FullTestPassageBackfill`.
- Tests call it.
- `documentation/tasks/PRD0052/prd0052-reading-v2-backfill-dry-run-plan.md` mentions an approval-gated runner.
- No `scripts/`, app route, Cloud Function, npm script, or operational entrypoint was found.

Impact:

- Backfill cannot repair production data without more implementation.
- The report should not treat backfill readiness as complete.

### P1/P2 - Book public governance UI invites forbidden writes

Verdict: confirmed. Take in.

Evidence:

- `src/components/books/BookEditorPage.tsx:563-568` lets a normal teacher select `public-library-published` and `public-library-rejected`.
- `database.rules.json:301-303` lets teachers write owned Books only when visibility is not `public-library-published`.

Impact:

- The UI exposes impossible or governance-forbidden states.
- The Book public-review model needs role-aware actions and explicit review workflow.

### P2 - Book and composition writes are non-atomic

Verdict: confirmed. Take in.

Evidence:

- `src/services/materialCatalog/materialBooks.service.ts:200-213` writes Book metadata, then removes stale indexes, then writes new indexes sequentially.
- `src/services/materialCatalog/materialBooks.service.ts:330-346` removes/writes Book nodes sequentially before writing metadata/indexes.
- `src/services/reading-v2/readingV2TeacherComposition.service.ts:172-173` writes composition then version sequentially.

Impact:

- Partial failures can leave stale indexes, orphan nodes, or composition/version mismatch.
- This is weaker than the Reading V2 publish commit plan, which uses multi-location updates through its Firebase adapter.

### P2 - Create full test from selected passages hides failure from user

Verdict: confirmed as UX problem.

Evidence:

- `src/pages/TeacherLobbyPage.jsx:949-973` catches errors and logs console/diagnostic entries.
- No visible error state, toast, retry message, or disabled/loading state is set for the teacher.

Impact:

- The action can fail silently from the user's point of view.
- Telemetry exists, but user workflow is incomplete.

### P2 - Security/rule leakage concerns need policy decision

Verdict: partially confirmed. Take in for review, but severity depends on intended public-review policy.

Evidence:

- `database.rules.json:301` lets any teacher read Books whose visibility is `public-library-pending-review`, `public-library-published`, or `public-library-rejected`.
- `database.rules.json:722-735` lets any authenticated user read `reading_v2/listing_indexes`, including students, if those paths are used.
- `database.rules.json:737-742` does the same for `relationship_indexes`.

Impact:

- Pending/rejected public-review metadata may leak to all teachers.
- Reading V2 listing/relationship indexes may leak metadata to students if populated.
- These need explicit policy: private teacher-only, teacher-public-only, or admin-review-only.

## What Not To Take In

### Book material picker is public-only

Verdict: false as stated.

Evidence:

- `src/components/books/BookEditorPage.tsx:298-300` reads both owner and public material indexes.
- `src/components/books/BookEditorPage.tsx:307-314` merges owner and public rows before filtering to published material summaries.

Correct replacement finding:

- The picker scope is not public-only.
- The real defect is rules/path mismatch: both owner and public reads target `material_catalog/material_indexes`, which lacks RTDB child rules.

### Drafts tab likely regressed

Verdict: likely false positive.

Evidence:

- `src/hooks/test/useTestFilters.ts:66` returns `[]` for `contentFilter === 'drafts'`.
- `src/pages/TeacherLobbyPage.jsx:223-254` loads Drafts through `useTeacherDrafts` and builds `visibleDrafts`.
- `src/pages/TeacherLobbyPage.jsx:1138-1171` renders the Drafts branch from `visibleDrafts`, not from `filteredTests`.

Correct replacement finding:

- Keep a browser regression test if desired, but do not carry this as a P1 implementation failure.

## Own Deep-Dive Method Added

The pasted assessment used a good method: pinned-SHA audit plus call-chain verification. I added a data-plane contract graph audit:

1. For every PRD entity, list producer, reader, mutator, rules, tests, UI entry point, and docs/QA probe path.
2. Mark a node as dead when a producer exists only in tests.
3. Mark a node as unruled when code reads/writes a path not covered by rules.
4. Mark a node as zombie when docs/rules define a path that production does not use.
5. Mark a node as brittle when multi-path writes are sequential rather than atomic.
6. Mark a node as cosmetic when the UI action exists but has no usable error/success workflow.

This method found information that the pasted assessment missed:

- Actual Reading Passage and Book material picker indexes use `material_catalog/material_indexes`, not `reading_v2/listing_indexes`.
- `material_catalog/material_indexes` has no RTDB child rules.
- `readingV2StoragePaths.listingIndexes` is a tested helper but production-unused.
- Prior QA/rule probes likely checked at least one wrong index path.
- Prior audit text incorrectly said Book picker reads only public material indexes.

## What To Inspect Further

1. RTDB rules emulator or live probe for exact actual paths:
   - `material_catalog/material_indexes/by_owner/{teacherId}`
   - `material_catalog/material_indexes/by_visibility/public`
   - `material_catalog/material_indexes/by_material_kind/reading-passage`
   - `material_catalog/material_indexes/by_test_type/{testTypeId}`
   - `material_catalog/material_indexes/by_source_full_test/{fullTestId}`
2. Decide one canonical listing index family:
   - Option A: move Reading Passage listing to `reading_v2/listing_indexes` and remove/limit Material Catalog usage.
   - Option B: keep shared `material_catalog/material_indexes` and add complete rules/docs/tests for it.
3. Wire `readingPassageExtraction` into real Reading V2 Studio publish/import flow.
4. Add operational backfill runner or mark backfill incomplete.
5. Add teacher-visible failure states for create-full-test-from-selected and Book material picker loading errors.
6. Make Book public review role-aware:
   - normal teacher can request review
   - super admin can publish/reject
   - rejected/pending visibility rules match policy
7. Replace sequential multi-path writes with RTDB multi-location updates for Book metadata/nodes/indexes and teacher-created compositions.
8. Re-run browser workflow checks against the exact branch and exact runtime paths after rules are corrected.

## Revised Bottom Line

Book work is real but rough. It has working services, editor surface, node tree, and cards, but governance, atomicity, role-aware actions, picker permissions, and UX failure states need hardening.

Reading Passage work is not faithfully actualized. The extraction engine and publish storage plan exist, but the real publish/import path does not call them, the operational backfill is not wired, and the actual list/index path may be blocked by RTDB rules. The Reading Passage tab is therefore a shell around mostly unreachable data.
