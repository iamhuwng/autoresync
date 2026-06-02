# PRD-0052 Supplemental Assessment Verification

Date: 2026-06-02

Target worktree: `C:\Users\The Lord\Desktop\luyentap-prd0052-review`

Branch: `codex/prd0052-material-tabs-inline`

Verified commit: `a4b0cd3ef875de79dbc328ad38ef34ebc58cab6f`

Source assessment reviewed: `C:\Users\The Lord\.codex\attachments\c34c95ec-aed2-433a-ad89-ac28803c6ce0\pasted-text.txt`

## Executive Verdict

The pasted supplemental assessment is directionally right and should be taken seriously, especially its core P0: the Reading Passage extraction and storage engine exists, but the real Reading V2 Studio publish path does not invoke it. The implementation therefore does not fulfill the PRD requirement that Reading V2 full-test publish/import auto-creates standalone Reading Passage entities.

My first verification imported too little from the assessment. The assessment also has important UI/action/governance findings that should be taken in: tabs and routes are exposed without feature gates, the admin Test Type config loop is not truly consumed by Teacher Lobby, Reading Passage row actions are mostly scaffolds, visual proof uses fixtures because live RTDB reads were denied, and public Book structure is not readable to non-owner teachers.

The pasted assessment is still not fully clean. It correctly downgrades the earlier Drafts-tab finding as a likely false positive, but it repeats or implies one wrong Book finding: the Book material picker is not public-only. It reads both owner and public material indexes. The real issue is worse and different: those `material_catalog/material_indexes` paths have no child rules in `database.rules.json`, so parent `material_catalog` super-admin-only rules can deny teacher reads/writes.

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

### P1 - Feature gates do not govern the shipped surface

Verdict: confirmed. Take in.

Evidence:

- `src/components/modern/ContentTabs.jsx:5-10` hardcodes `Reading Passage` and `Book` into the tab list.
- The tabs do not reference PRD-0052 feature flags from `src/config/readingV2FeatureFlags.ts`.
- The prior full audit also records always-mounted Book editor route exposure.

Impact:

- Disabled or not-ready PRD-0052 features can still appear.
- This turns incomplete workflows into visible product, rather than controlled rollout.

### P1 - Admin Test Type governance loop is open

Verdict: confirmed with nuance. Take in.

Evidence:

- `src/pages/TeacherLobbyPage.jsx:297-300` resolves teacher pins using `DEFAULT_MATERIAL_TEST_TYPES`, not a live Test Type repository.
- `src/pages/TeacherLobbyPage.jsx:375`, `:460`, `:614`, `:1212`, `:1466`, and `:1479` pass `DEFAULT_MATERIAL_TEST_TYPES` into Reading Passage listing, Book listing, row summaries, block rendering, Book modal, and preference modal.
- `src/services/materialCatalog/testTypeConfig.service.ts:186-190` falls back to `DEFAULT_MATERIAL_TEST_TYPES` when no repository is supplied.
- `TestTypeAdminPanel` can write admin config, but Teacher Lobby does not consume that live admin config as the source of truth.

Impact:

- Admin Test Type management is real as a service/admin panel, but not truly governing the teacher Materials surface.
- PRD-0052 Test Type block/filter behavior is only partially actualized.

### P1 - Reading Passage row actions are scaffolds

Verdict: confirmed. Take in.

Evidence:

- `src/pages/TeacherLobbyPage.jsx:811-814` archives a Reading Passage by tracking `archiveReadingPassage`; it performs no write.
- `src/pages/TeacherLobbyPage.jsx:778-796` routes both Open and Revise to `TEACHER_READING_V2_REVISE`, so there is no distinct view/open behavior.
- `src/pages/TeacherLobbyPage.jsx:976-985` maps homework candidates with `accessible: true` regardless of real availability.
- `src/services/reading-v2/readingV2PassageHomework.service.ts:34-38` can reject inaccessible or projectionless candidates, but the lobby adapter hardcodes one side of that check.

Impact:

- The row action menu looks production-like but several commands are not real workflows.
- Teachers can be led into revise/open/assign paths without accurate availability state.

### P1/P2 - Fixture-backed proof masks live failures

Verdict: confirmed. Take in.

Evidence:

- `src/pages/TeacherLobbyPage.jsx:348-367` returns fixture Reading Passage rows when `VITE_PRD0052_TEACHER_MATERIALS_VISUAL_FIXTURES` is true.
- `src/pages/teacherMaterialsVisualFixtures.js:76` enables that fixture mode by env flag.
- `documentation/tasks/PRD0052/prd0052-visual-difference-note.md:58-71` says Reading Passage and Book bodies were visually verified with fixtures because live RTDB returned `Permission denied`.
- `documentation/tasks/PRD0052/prd0052-implementation-notes.md:115` records 16 security tests passed but 5 emulator tests skipped.
- `documentation/tasks/PRD0052/prd0052-implementation-notes.md:124-126` records remote permission denials and local emulator failure because Java was not installed or not on PATH.

Impact:

- Visual success is not live data success.
- Handoff `PASS` language should be downgraded where fixture/emulator/deployment gaps were still open.

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

### P2 - Public Book structure is unreadable to non-owner teachers

Verdict: confirmed. Take in.

Evidence:

- PRD FR-BOOK-26 requires public-library Book list/detail to use lightweight Book metadata and structure refs.
- `database.rules.json:312-315` lets only the owner teacher or super admin read `material_catalog/book_nodes/{bookId}`.

Impact:

- Public Book cards can exist, but public Book detail/structure browsing is blocked for non-owner teachers.
- This makes the public Book organizer promise incomplete unless V1 explicitly limits public view to card metadata only.

### P2 - Create full test from selected passages hides failure from user

Verdict: confirmed as UX problem.

Evidence:

- `src/pages/TeacherLobbyPage.jsx:949-973` catches errors and logs console/diagnostic entries.
- No visible error state, toast, retry message, or disabled/loading state is set for the teacher.

Impact:

- The action can fail silently from the user's point of view.
- Telemetry exists, but user workflow is incomplete.

### P2/P3 - Book UX low-quality and mislabeled controls

Verdict: confirmed. Take in.

Evidence:

- `src/components/modern/BookCard.jsx:84-86` labels an owner action `Archive/Delete`, but the handler archives only.
- `src/components/books/CreateBookModal.tsx:152-153` and `:227-228` use comma-separated inputs for authors/tags.
- `src/components/books/BookEditorPage.tsx:530`, `:554`, and `:558` use plain text inputs for authors/tags/Test Type ids.

Impact:

- These are not P0 blockers, but they support the user's complaint that authoring/governance tools feel placeholder-grade.

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

### P3 - Firebase emulator env parsing can fail at module load

Verdict: confirmed as repo fragility, not PRD-0052 core blocker.

Evidence:

- `src/services/firebaseCore.js:47-63` throws during module initialization when `VITE_FIREBASE_DATABASE_EMULATOR_HOST` is present but not `host:port`.

Impact:

- A malformed dev/test env can blank the app before PRD-0052 surfaces render.
- Keep as hardening item, not central PRD faithfulness issue.

### Watch - Existing feature compatibility is mostly safe, but not fully proven

Verdict: take in as verification scope, not as confirmed regression.

Evidence:

- Shared components touched by PRD-0052 include `ContentTabs`, `SearchFilterBar`, `MaterialListRow/View`, `materialListAdapter`, `LegacyResultDetailView`, and `ReadingV2ReviewContentAdapter`.
- `homeworkManager.ts` widens material type support, but `reading-passage-set` uses synthetic `materialId` shape `reading-passage-set:{homeworkId}`.
- Firestore homework validation short-circuits for non-Reading-Passage material types, so existing quiz/test/THCS payloads look backward compatible.
- Trusted submit code adds Reading Passage branches, but existing single-test Reading V2 submission still flows through edited shared code.

Impact:

- Existing features are not obviously broken, but the branch changes shared code.
- Verification plan should include existing Teacher Materials rows, existing homework creation, and existing single-test Reading V2 submit/scoring.
- Treat "existing features safe" as `PASS_WITH_CAVEAT`, not unchecked `PASS`.

## What Not To Take In

### Book material picker is public-only

Verdict: false as stated.

Evidence:

- `src/components/books/BookEditorPage.tsx:298-300` reads both owner and public material indexes.
- `src/components/books/BookEditorPage.tsx:307-314` merges owner and public rows before filtering to published material summaries.

Correct replacement finding:

- The picker scope is not public-only.
- The real defect is rules/path mismatch: both owner and public reads target `material_catalog/material_indexes`, which lacks RTDB child rules.

### Reading Passage list reads `reading_v2/listing_indexes`

Verdict: false for current production reader.

Evidence:

- `src/services/reading-v2/readingV2PassageLibrary.service.ts:101-131` reads `material_catalog/material_indexes/...`.
- `src/services/materialCatalog/materialCatalogIndexes.service.ts:34-38` writes `material_catalog/material_indexes/...`.
- `readingV2StoragePaths.listingIndexes` exists, but production usage was not found outside tests.

Correct replacement finding:

- The audit's "empty production data plane" remains true.
- Its stated reader path is stale or wrong for this branch; the real reader/writer/rules drift is `material_catalog/material_indexes`.

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
7. Add an action truth-table audit: every visible button/action must map to a mutator, route, success state, error state, permission check, and test.
8. Add a governance-loop audit: every admin config writer must have at least one production consumer in the governed surface.
9. Add a fixture/live parity audit: fixture-backed visual proof must be paired with live or emulator proof for the same paths.

This method found information that the pasted assessment missed:

- Actual Reading Passage and Book material picker indexes use `material_catalog/material_indexes`, not `reading_v2/listing_indexes`.
- `material_catalog/material_indexes` has no RTDB child rules.
- `readingV2StoragePaths.listingIndexes` is a tested helper but production-unused.
- Prior QA/rule probes likely checked at least one wrong index path.
- Prior audit text incorrectly said Book picker reads only public material indexes.

This second pass found information my first verification underweighted:

- Reading Passage archive/open/availability actions are scaffolded.
- Feature flags do not govern the visible PRD-0052 tabs.
- Admin Test Type config does not truly drive Teacher Lobby.
- Public Book detail/tree access is blocked by `book_nodes` rules.
- Fixture proof and skipped emulator tests must be treated as open gates.
- Existing feature compatibility should be tracked as watch items, especially shared row/result components and trusted Reading V2 submission.

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
4. Gate tabs, routes, and actions from the PRD-0052 feature flags.
5. Wire live admin Test Type config into Teacher Lobby and Book/Reading Passage summaries.
6. Replace Reading Passage scaffold actions with real workflows:
   - archive writes state or hides action until implemented
   - Open is view/read-only or removed
   - Assign checks student-safe projection availability
   - create-full-test shows result/error and navigates or exposes created entity
7. Add operational backfill runner or mark backfill incomplete.
8. Add teacher-visible failure states for create-full-test-from-selected and Book material picker loading errors.
9. Make Book public review role-aware:
   - normal teacher can request review
   - super admin can publish/reject
   - rejected/pending visibility rules match policy
10. Decide public Book detail rule: metadata-only public cards, or readable public `book_nodes` with no private ref leakage.
11. Replace sequential multi-path writes with RTDB multi-location updates for Book metadata/nodes/indexes and teacher-created compositions.
12. Add regression checks for existing Teacher Materials rows, existing homework creation, and existing single-test Reading V2 submit/scoring.
13. Re-run browser workflow checks against the exact branch and exact runtime paths after rules are corrected.

## Revised Bottom Line

Book work is real but rough. It has working services, editor surface, node tree, and cards, but governance, atomicity, role-aware actions, picker permissions, and UX failure states need hardening.

Reading Passage work is not faithfully actualized. The extraction engine and publish storage plan exist, but the real publish/import path does not call them, the operational backfill is not wired, the actual list/index path may be blocked by RTDB rules, and several visible row actions are scaffolds. The Reading Passage tab is therefore a shell around mostly unreachable data, with placeholder-grade interactions on top.

The implementation should be treated as foundation plus scaffold, not a faithful V1. Minimum faithful path is now larger than my first pass stated: wire producer, fix index/rules path, deploy/emulate rules, gate unfinished surfaces, connect admin Test Type governance, replace RP scaffold actions, harden Book public governance/detail access, make multi-path writes atomic, and verify without fixtures.
