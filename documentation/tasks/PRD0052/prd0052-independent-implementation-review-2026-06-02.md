# PRD-0052 Independent Implementation Review — 2026-06-02

> **Review method:** Four parallel agents reviewed: (1) Reading Passage services & homework, (2) Book services & validation, (3) UI components & feature flags, (4) security rules, Cloud Functions & backfill. Main thread read the ~1400-line TeacherLobbyPage in full and spot-checked critical paths. All findings verified against actual code.

---

## Verdict

**PRD-0052 is a well-built foundation with genuine service-level depth, but has 3 blocking data-integrity/security gaps and ~12 fixable medium-severity issues.** It is substantially more real than the prior audit concluded. Several P1 findings in the prior audit are not correct.

---

## Corrections to Prior Audit (`prd0052-full-implementation-audit-report.md`)

The prior audit made several claims that code inspection disproves. These should be cleared to avoid wasted fix effort:

| Prior Claim | Actual State |
|---|---|
| "Feature flags are dead gates" — tabs ungated, routes always mounted | **Incorrect.** `ContentTabs.jsx` imports `getTeacherMaterialsCapabilities()` and gates tabs with `canUseReadingPassageLibrary`/`canUseMaterialBooks`. `TeacherLobbyPage.jsx:430-446` resets contentFilter away from disabled tabs. `teacherRoutes.tsx:108-141` gates the Book editor route with `exposeMaterialBookEditorRoutes`. |
| "Teacher Lobby uses `DEFAULT_MATERIAL_TEST_TYPES`, not live admin-configured Test Types" | **Partially incorrect.** `TeacherLobbyPage.jsx:327-388` loads `listTeacherSelectableTestTypes(materialTestTypeConfigRepository)` from RTDB and only falls back to defaults when the fetch returns empty or fails. This is correct behavior. |
| "Reading Passage archive is fake/telemetry-only" | **Incorrect.** `TeacherLobbyPage.jsx:960-1006` calls `archiveReadingV2PassageMaterial()` with a real `readingV2PassageArchiveRepository` backing Firebase writes, removes the row from local state, and handles errors. |
| "Assignment availability is hardcoded `accessible: true`" | **Incorrect.** `TeacherLobbyPage.jsx:1168-1182` computes `accessible` as `passage?.accessible === true && Boolean(passage?.publishedSnapshotVersionId) && passage?.hasStudentSafeProjection === true && passage?.archived !== true`. All three guards are present. |
| "Book editor visibility dropdown offers `public-library-published` to teachers" | **Incorrect.** `BookEditorPage.tsx:655-659` offers only `'private'` and `'public-library-pending-review'`. The test at `BookEditorPage.test.tsx:152-178` confirms neither `public-library-published` nor `public-library-rejected` appear. |
| "Drafts tab regression" | **Likely false positive.** Drafts are loaded through `useTeacherDrafts({ enabled: contentFilter === 'drafts' })` and rendered as `visibleDrafts`, not through `useTestFilters`. |
| "View/Open routes to revise" | **Correct but by design.** Both `handleOpenReadingPassage` and `handleReviseReadingPassage` route to `TEACHER_READING_V2_REVISE`. There is no separate read-only view route yet. This is a real gap but not the security concern the prior audit implied — the revise route checks permissions. |

---

## Critical Issues (Blockers)

### C1: 3 of 5 `material_catalog/material_indexes` buckets are super-admin-only read

**File:** `database.rules.json` lines 321-344

The service `buildMaterialCatalogIndexWrites` writes to all five index buckets. But the RTDB `.read` rules for:
- `by_material_kind` (line 321) — super_admin only
- `by_test_type` (line 330) — super_admin only
- `by_source_full_test` (line 338) — super_admin only

…block any teacher from querying those indexes. Only `by_owner` and `by_visibility` are readable by teachers. This means:
- Teachers cannot browse materials by test type through the catalog index
- Test Type block filtering cannot query by-test-type indexes
- The Reading Passage/Book listing services that reference these indexes will get permission-denied at runtime

**Fix:** Add teacher-read rules for `by_material_kind`, `by_test_type`, and `by_source_full_test`, scoped appropriately (owner or public visibility).

### C2: Book index writes are non-atomic — partial failure = orphaned state

**File:** `materialBooks.service.ts:231-245` (`writeBookWithIndexes`)

Three sequential `await` calls with no multi-location update:
1. Write book metadata
2. Remove stale index entries (sequential loop)
3. Write new index entries (sequential loop)

If the process crashes after step 1 but before step 3 completes, the book exists but is invisible in listing queries. `updateBookTree` at line 338-379 is worse: it writes individual nodes in a loop, then calls `writeBookWithIndexes` — a failure mid-way leaves orphaned nodes.

**Fix:** Use RTDB `update()` with multi-path references for atomic metadata+index writes.

### C3: `MaterialBooksIndexRow` returned as `MaterialBookMetadata` — `publicReview` always undefined

**File:** `materialBooks.service.ts:211-219`

`listBooksByIndex` reads index rows (type `MaterialBooksIndexRow`), passes them through `isBook` guard (checks only `bookId` + `ownerId` as strings — which index rows have), and returns them as `MaterialBookMetadata[]`. But index rows are missing: `publicReview`, `description`, `primaryTestTypeId`, `createdAt`, `createdBy`, `updatedBy`, `edition`, `isbn`.

`listPublicBookReviewQueue:682-723` accesses `book.publicReview` — this is always `undefined` in production because it's not in the index row. The test passes because it mocks `read` to return full metadata objects directly, bypassing the index path.

**Fix:** Either extend `MaterialBooksIndexRow` with the missing fields, or have `listBooksByIndex` hydrate full metadata from the book path after index lookup.

---

## High-Severity Issues

### H1: `updateBookTree` missing moderation transition validation

**File:** `materialBooks.service.ts:359`

`createBookDraft` and `updateBookMetadata` both call `validateMaterialBookModerationTransition`. `updateBookTree` does not. While `updateBookTree` currently only changes `status` (not `visibility`), this is an inconsistency that will cause bugs when visibility changes are added to tree saves.

**Fix:** Add `validateMaterialBookModerationTransition` call in `updateBookTree`.

### H2: Teachers can bypass review lifecycle via direct service calls

**File:** `bookValidation.service.ts:261-276`

`validateMaterialBookModerationTransition` only blocks `visibility: 'public-library-published'` for non-super-admin. Teachers can set `public-library-pending-review`, `public-library-rejected`, or any visibility value other than `published` without any state-machine validation. The UI correctly limits options, but the service layer has no defense.

**Fix:** Add state-machine validation: only allow private→pending-review→{published|rejected}, preventing jumps.

### H3: Create full test from selected — creates composition only, no user-visible result

**File:** `TeacherLobbyPage.jsx:1130-1166`, `readingV2TeacherComposition.service.ts:152-175`

The composition writes to `reading_v2/full_test_compositions` and `reading_v2/full_test_composition_versions` but does NOT:
- Create a material catalog index row
- Navigate to an editor/show the created test
- Surface any success UI beyond clearing selection

The teacher clicks "Create full test from selected" and sees… nothing. The compositions exist on disk but are invisible.

**Fix:** Decide the product endpoint: either create a draft and open the Reading V2 editor, or create a catalog row and show it in My Content.

### H4: `accessible`/`hasStudentSafeProjection` default to permissive when `undefined`

**File:** `readingV2PassageHomework.service.ts:34-41`

The checks use `=== false` — meaning `undefined` (field omitted) passes as "accessible" and "has projection." A caller constructing a candidate without these fields gets the least-safe default.

**Fix:** Use `!== true` or add explicit `typeof` checks so `undefined` is treated as not-accessible.

### H5: Deterministic composition IDs cause silent overwrites on re-extraction

**Files:** `readingV2TeacherComposition.service.ts:129-131`, `readingV2PassageExtraction.service.ts:455-458`

Composition IDs are derived from `teacherId + firstPassageId + snapshotSeed` or `testMaterialId + sourceSnapshotVersionId`. Re-running the same operation silently overwrites the previous composition. If compositions are meant to be immutable artifacts, this is a data integrity bug.

**Fix:** Either make overwrite explicit (confirm dialog) or add timestamp/nonce to IDs.

---

## Medium-Severity Issues

### M1: Book editor uses raw CSV text for testTypeIds

**File:** `BookEditorPage.tsx:642-652`

Teachers must type raw IDs like "ielts, toeic" in a text field. Meanwhile `CreateBookModal.tsx:185-200` has a proper multi-select checkbox grid. The editor should use the same pattern.

### M2: BookNodeTree child-add buttons exclude placeholder node types

**File:** `BookNodeTree.tsx:46`

`CHILD_NODE_TYPES` = `['section', 'chapter', 'test']`. PRD FR-NODE-18 says "All node types can contain child nodes in V1, including placeholder nodes." Teachers cannot add children under `intro-placeholder`, `toc-placeholder`, or `note-placeholder` through the UI.

### M3: `summariesByTestTypeId` never passed to TestTypeBlockModule

**File:** `TeacherLobbyPage.jsx:1413-1419`

The `TestTypeBlockModule` accepts `summariesByTestTypeId` for rendering material counts/skill metadata (per FR-FILTER-19's "compact metadata and chips below"), but TeacherLobbyPage never passes it. Blocks show only the logo image.

### M4: Redundant "Request public review" button with missing tracking

**File:** `BookEditorPage.tsx:655-662`

The visibility `<select>` already includes `public-library-pending-review`. A separate button does the same thing but the dropdown path doesn't fire the `teacher_materials_book_public_review_requested` tracking event. Remove the button or remove the dropdown option and keep only the button path.

### M5: `canUseMaterialBookEditor` not consumed in TeacherLobbyPage

**File:** `TeacherLobbyPage.jsx`

When the editor flag is off, clicking "Open Book" navigates to the editor route, which immediately redirects back with a notice. The user sees a flash and a message. The "Open Book" button should be proactively disabled or annotated.

### M6: BookMaterialPicker has no loading state

**File:** `BookMaterialPicker.tsx`

Shows "No published materials available" when the list is empty, but no skeleton/spinner while Firebase is fetching. The parent's `loading` flag covers the entire page, not the picker specifically.

### M7: `prefixAnchorContent` in launch service is dangerously broad

**File:** `readingV2PassageHomeworkLaunch.service.ts:107-132`

Recursively walks ALL keys of ALL objects, rewriting any key named `anchorId` or `anchorIds`. If stimulus content happens to have a property with that name, it would be incorrectly rewritten.

### M8: Cloud Function is explicitly deprecated

**File:** `functions/src/index.ts:13-14`

```
// Deprecated wrapper only. Reading V2 production submit uses the Cloudflare
// Worker route; Cloud Functions are off-limit for new Reading V2 work.
```

If production uses Cloudflare Workers, the Cloud Function implementation may diverge.

### M9: Backfill script scalability — loads entire namespace into memory

**File:** `scripts/reading-v2-full-test-passage-backfill.ts:505-523`

Reads all three top-level paths (`material_metadata`, `published_snapshots`, `full_test_compositions`) into memory. No pagination, chunking, or streaming. For production-scale data, this will OOM.

### M10: Backfill has no resume capability

If the backfill fails mid-run, restarting processes everything from scratch. Partial writes from a failed run require manual cleanup.

### M11: Non-IELTS source order labels in extraction regex

**File:** `readingV2PassageExtraction.service.ts:180-186`

The regex `\b${escapeRegex(labelSnapshot)}\s+...` uses `\b` word boundary for source order detection. Complex or multi-word labels could produce unexpected matches. Confidence: low probability, high impact if triggered.

### M12: `durationMinutes` with `|| undefined` drops zero

**File:** `readingV2TeacherComposition.service.ts:146`

`total || undefined` — when all passages have no duration (total=0), the field is silently dropped instead of storing `0`.

---

## Low-Severity Issues

### L1: BookCard `Archive/Delete` label

`BookCard.jsx:84-86` shows "Archive/Delete" but only archives. Rename to "Archive."

### L2: Fixture schema drift

`teacherMaterialsVisualFixtures.js:164` uses `status: 'draft'` and `teacherMaterialsVisualFixtures.js:199` uses `visibility: 'public-library-visible'` — neither matches canonical PRD values.

### L3: `primaryTestTypeId` not exposed in any UI

The field auto-derives from `testTypeIds[0]` in the service, but neither the create modal nor editor exposes it.

### L4: `readCanonicalMaterial` — dead interface field

`ReadingV2PassageLibraryReader` defines `readCanonicalMaterial` which no implementation calls. Tests assert it's NOT called.

---

## What's Solid

The foundation is genuinely strong:

- **Book node tree:** All 6 PRD node types, 5-level depth enforcement, cycle detection, orphan detection, self-parenting prevention, subtree depth overflow — all verified correct at service + validation + UI layers.
- **Book readiness:** `deriveMaterialBookStatus` correctly keeps placeholder-only books as `draft-in-progress` even with refs. Requires `section`/`chapter`/`test` for `ready`.
- **Draft-only material ref blocking:** Double-guarded at `filterPublishedMaterialSummaries` (UI/picker) and `validateMaterialBookNodes` ref check (save validation).
- **Multi-Test-Type membership:** Fully implemented at data model, index, filtering, and listing levels.
- **Public-library governance:** Super-admin-only publish enforced at `validateMaterialBookModerationTransition` + `requireSuperAdmin`.
- **Reading Passage homework:** Snapshot-based assignment, frozen version binding, student-safe projection launches, bulk set assignment with ordered refs — all implemented.
- **Feature flags:** Proper env-var → mode → capability pipeline, consumed by tabs, routes, TeacherLobbyPage. Six independent flags.
- **Security boundaries:** Students cannot read Book data, canonical passages, answer keys, or review projections. Student-safe projection write validates 25+ forbidden tokens.
- **Forbidden patterns:** All PRD forbidden patterns verified absent — no whole-book assignment, no "Start Test" on books, no grid/list toggle, no hardcoded "Passage" label.

---

## Recommended Repair Order

### Block merge until (Phase 0):
1. Fix C1: Add teacher-read rules for `material_indexes/by_material_kind`, `by_test_type`, `by_source_full_test`
2. Fix C2: Replace sequential writes with multi-location `update()` in `writeBookWithIndexes`
3. Fix C3: Fix `MaterialBooksIndexRow` vs `MaterialBookMetadata` type mismatch

### Before release (Phase 1):
4. Fix H1: Add `validateMaterialBookModerationTransition` to `updateBookTree`
5. Fix H2: Add state-machine validation to `validateMaterialBookModerationTransition`
6. Fix H3: Decide product endpoint for "Create full test from selected" and implement
7. Fix H4: Change `accessible`/`hasStudentSafeProjection` checks from `=== false` to `!== true`
8. Fix M2: Add placeholder node types to `CHILD_NODE_TYPES` in BookNodeTree

### Polish (Phase 2):
9. Fix M1: Replace CSV text input with multi-select in BookEditorPage
10. Fix M3: Pass `summariesByTestTypeId` to TestTypeBlockModule
11. Fix M4: Consolidate "Request public review" UI
12. Fix M5: Wire `canUseMaterialBookEditor` into TeacherLobbyPage button states
13. Fix M6: Add loading state to BookMaterialPicker
14. Fix L1+L2+L3: Label, fixture, and primaryTestTypeId cleanups

### Later (Phase 3):
15. Fix M7: Scan `prefixAnchorContent` behavior more precisely
16. Fix M9+M10: Backfill script scalability and resume
17. Fix M8: Document or remove deprecated Cloud Function
18. Fix H5: Deterministic composition IDs — add overwrite protection
19. Fix M11+M12: Minor service-level edge cases
