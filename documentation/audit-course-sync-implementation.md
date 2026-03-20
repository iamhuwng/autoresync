# Internal Audit: Course Sync (Auto-Resync) Implementation

> **Date:** 2026-03-19  
> **Scope:** Assess the implementation that allows class-linked course copies to detect and import new materials/modules added to the original course template.  
> **Files Audited:** 10 source files, 1 test file, 1 migration, 2 type files  
> **Knowledge Sources Cross-Referenced:** 8 (see appendix)

---

## Knowledge Sources Consulted

| # | Source | Type | Key Contribution |
|---|--------|------|-------------------|
| 1 | [course_sync_detailed_spec.md](file:///C:/Users/The%20Lord/.gemini/antigravity/brain/12483d91-68f7-4172-b31a-a9320fc8a702/course_sync_detailed_spec.md) | Antigravity Brain (original session) | Original design spec with finalized decisions, edge cases, algorithms |
| 2 | [course_sync_implementation_summary.md](file:///C:/Users/The%20Lord/.gemini/antigravity/brain/12483d91-68f7-4172-b31a-a9320fc8a702/course_sync_implementation_summary.md) | Antigravity Brain | Implementation log from build session |
| 3 | [course_materials_bug_analysis.md](file:///C:/Users/The%20Lord/.gemini/antigravity/brain/12483d91-68f7-4172-b31a-a9320fc8a702/course_materials_bug_analysis.md) | Antigravity Brain | Root cause analysis of the original "materials not showing" bug that triggered this feature |
| 4 | [timestamp_based_additive_sync.md](file:///C:/Users/The%20Lord/.gemini/antigravity/knowledge/course_sync_and_polymorphic_data/artifacts/sync/timestamp_based_additive_sync.md) | Antigravity Knowledge | Extracted pattern document for the sync algorithm |
| 5 | [course-class-management.md](file:///c:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/architecture/course-class-management.md) | Knowns Architecture Doc | Course/class architecture, services map, sync system overview |
| 6 | [pattern-course-class-sync-thcs-title-resolution.md](file:///c:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/patterns/pattern-course-class-sync-thcs-title-resolution.md) | Knowns Pattern Doc | Lessons learned, 5 moving-forward standards, event timeline |
| 7 | [homework-test-sync-architecture.md](file:///c:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/patterns/homework-test-sync-architecture.md) | Knowns Pattern Doc | Related sync pattern (homework ↔ test), fire-and-forget standard |
| 8 | [PRD-0014](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0014-prd-student-teacher-assignment-and-course-system.md) | PRD | Original product requirements (§4.18.6: "Sync with original" option) |

---

## Executive Summary

The sync feature is **architecturally sound** and solves the right problem. It correctly detects new materials added to original course templates after a copy was made, presents them to the teacher via inline banners with cherry-pick controls, and applies selections idempotently. However, there are **7 critical/high issues** and **5 medium issues** that collectively create real risk of the feature silently failing in production or confusing teachers.

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 3 | Data bugs that will cause sync to miss materials or fail |
| 🟠 High | 4 | UX/reliability issues that degrade the feature significantly |
| 🟡 Medium | 5 | Maintainability, performance, and test coverage gaps |
| 🔵 Low | 3 | Code quality and minor improvements |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       DETECTION PIPELINE                        │
│                                                                 │
│  ModuleList.tsx                                                  │
│    └─ calls detectSyncUpdates(copyCourseId) (non-blocking)      │
│         └─ courseSyncService.ts                                  │
│              ├─ Verifies course.isClassInstance === true          │
│              ├─ Finds ClassCourseLink via class_course_links     │
│              ├─ Fetches original + copy modules                  │
│              ├─ Compares materials using originalModuleId map    │
│              ├─ Filters by lastSyncedAt timestamp                │
│              └─ Returns CourseSyncStatus                        │
│                   ├─ moduleUpdates[] → ModuleSyncBanner          │
│                   └─ newModules[]    → NewModuleSyncBanner       │
├─────────────────────────────────────────────────────────────────┤
│                         APPLY PIPELINE                          │
│                                                                 │
│  ModuleSyncBanner.tsx                                            │
│    └─ applySyncMaterials(copyCourseId, copyModuleId, ids[])     │
│         └─ Links materials + updates lastSyncedAt               │
│                                                                 │
│  NewModuleSyncBanner.tsx                                         │
│    └─ applySyncNewModule(copyCourseId, originalModuleId)        │
│         └─ Creates module copy + links all materials            │
├─────────────────────────────────────────────────────────────────┤
│                       DISMISS PIPELINE                          │
│                                                                 │
│  dismissModuleSync(copyModuleId)                                │
│    └─ Updates lastSyncedAt to Date.now()                        │
│                                                                 │
│  dismissNewModulesSync(copyCourseId)                            │
│    └─ Updates courses/{id}/lastModuleSyncAt                     │
└─────────────────────────────────────────────────────────────────┘
```

### Data Model Lineage

```
Original Course ──────────────── Class Course Copy
  originalCourseId                courseId (in ClassCourseLink)
                                  isClassInstance: true

Original Module ──────────────── Copy Module
  id                              originalModuleId → points to original
                                  lastSyncedAt     → timestamp gate

Original CourseMaterial ────────  Copy CourseMaterial
  linkedAt: Date.now()            (created by sync apply)
```

---

## 🔴 Critical Issues

### C1: `dismissNewModulesSync` writes `lastModuleSyncAt` but `detectSyncUpdates` NEVER reads it

**File:** [courseSyncService.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/services/courseSyncService.ts#L185-L211)

The `dismissNewModulesSync()` function (line 366-374) writes `lastModuleSyncAt` to `courses/{copyCourseId}`. However, the detection logic in `detectSyncUpdates()` (line 185-211) determines "new modules" purely by checking whether `originalModuleId` exists in the copy's module set — **it never reads `lastModuleSyncAt`**.

**Impact:** Dismissing new-module notifications does **nothing**. They will reappear on every page load until the teacher actually imports the module. The "Dismiss" button is non-functional.

```typescript
// Detection logic (line 186-190) — no timestamp check:
const copiedOriginalIds = new Set(
    copyModules.map(m => m.originalModuleId).filter(Boolean) as string[]
);
// Simply checks: is the original module's ID in the set?
// Never checks lastModuleSyncAt on the course
```

**Fix:** `detectSyncUpdates` must read `course.lastModuleSyncAt` and filter out original modules whose `createdAt` (or the `linkedAt` of their earliest material) is ≤ `lastModuleSyncAt`.

---

### C2: `copyMaterialToModule` does NOT set `linkedAt` on the junction record

**File:** [materialLinkManager.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/services/materialLinkManager.ts#L75-L86)

`linkMaterialToModule()` (line 26) correctly sets `linkedAt: Date.now()`. But `copyMaterialToModule()` (line 75-86) creates the junction **without** a `linkedAt` field:

```typescript
// copyMaterialToModule — junction record (line 75-86):
const link: CourseMaterial = {
    id, courseId, moduleId,
    materialId: copyId,
    order: Date.now(),
    isCopy: true,
    originalMaterialId: materialId,
    // ⚠️ NO linkedAt field!
};
```

**Impact:** If a teacher uses "Copy" (instead of "Link") to add material to an original course module, the `linkedAt` field will be `undefined`. In `detectSyncUpdates`, the filter `materialLinkedAt > lastSynced` (line 166-167) evaluates `0 > 0` which is `false`, so **copied materials are INVISIBLE to sync detection**. They will never appear in the sync banner.

**Fix:** Add `linkedAt: Date.now()` to the junction record in `copyMaterialToModule`.

---

### C3: `getClassCourseLinkByCopyCourseId` performs a FULL TABLE SCAN of `class_course_links`

**File:** [courseSyncService.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/services/courseSyncService.ts#L63-L76)

```typescript
async function getClassCourseLinkByCopyCourseId(copyCourseId: string) {
    const linksRef = ref(database, 'class_course_links');
    const snapshot = await get(linksRef);  // ⚠️ Downloads ALL links
    const links = snapshot.val();
    const match = Object.values(links).find(link => link.courseId === copyCourseId);
    return match || null;
}
```

This reads the **entire** `class_course_links` node, then filters client-side. As the system scales with more classes/courses, this becomes O(n) with full download.

**Impact:** Performance degradation at scale. With 100+ class-course links, every course page load downloads the entire table. Also a billing concern for Firebase RTDB reads.

**Fix:** Use an indexed query: `query(ref(database, 'class_course_links'), orderByChild('courseId'), equalTo(copyCourseId))`. This requires an index rule on `courseId` in the RTDB rules.

---

## 🟠 High Issues

### H1: Mantine imports violate the NO-MANTINE rule

**Files:** 
- [ModuleSyncBanner.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/course/ModuleSyncBanner.tsx#L10-L12) — imports from `@mantine/core` and `@mantine/notifications`
- [NewModuleSyncBanner.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/course/NewModuleSyncBanner.tsx#L10-L12) — same

Per the project's integration safety rules (Rule 15), **`@mantine/*` imports are banned**. Both sync banner components directly import `Alert, Button, Checkbox, Group, Stack, Text, Loader, Badge` from `@mantine/core` and `notifications` from `@mantine/notifications`.

**Impact:** These components will break if/when the Mantine dependency is removed. They should use the project's custom component library or vanilla CSS.

> [!NOTE]
> The parent components (`ModuleList.tsx`, `ModuleItem.tsx`) also use Mantine extensively, so this is a systemic issue rather than sync-specific. However, since these are newly added files, they should have been written with the project standard.

---

### H2: Sync detection is fire-and-forget with no retry or error surfacing

**File:** [ModuleList.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/course/ModuleList.tsx#L129-L134)

```typescript
detectSyncUpdates(courseId).then(status => {
    setSyncStatus(status);
}).catch(err => {
    console.error('Sync detection failed:', err);
});
```

If detection fails (network error, RTDB permission error), `syncStatus` stays `null`, and the teacher sees no indication that sync was attempted and failed. They might assume there are no updates when in fact the check never completed.

**Impact:** Silent failure hides available updates. No retry mechanism, no user-facing error state.

**Fix:** Add a `syncError` state. Show a subtle warning like "Could not check for updates" with a retry button. Alternatively, add automatic retry with exponential backoff.

---

### H3: `applySyncNewModule` reads `originalModule.id` from the snapshot, but `id` may not be stored in the node

**File:** [courseSyncService.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/services/courseSyncService.ts#L305-L317)

```typescript
const moduleRef = ref(database, `course_modules/${originalModuleId}`);
const moduleSnap = await get(moduleRef);
const originalModule = moduleSnap.val() as Module;

const result = await createModule(copyCourseId, {
    name: originalModule.name,
    accessType: originalModule.accessType,
    originalModuleId: originalModule.id,   // ⚠️ May be undefined
    lastSyncedAt: Date.now(),
});
```

When data is stored in RTDB at `course_modules/{id}`, the `id` field inside the stored object may or may not be present depending on how `createModule` saves it. Looking at `createModule` (courseManager.ts line 578-587), it does spread `moduleData` and sets `id: moduleId`, so the `id` field IS stored. **This is NOT a bug currently**, but it's fragile — if the `createModule` implementation ever changes to exclude `id` from the stored data (common RTDB pattern), this will silently break.

**Recommendation:** Use the path key (`originalModuleId` parameter) instead of `originalModule.id` for robustness:

```typescript
originalModuleId: originalModuleId,  // Use the parameter, not the snapshot field
```

---

### H4: No concurrency protection on sync apply

**Files:** [ModuleSyncBanner.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/course/ModuleSyncBanner.tsx#L49-L78), [NewModuleSyncBanner.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/course/NewModuleSyncBanner.tsx#L41-L80)

While the `isApplying` flag prevents double-click, two teachers (or the same teacher in two tabs) could trigger sync simultaneously. Both would:
1. Pass the `existingMaterialIds` check (neither has synced yet)
2. Both call `linkMaterialToModule` for the same materials
3. Create duplicate junction records

**Impact:** Duplicate materials in the copy module. Materials appear twice in the module list.

**Fix:** Use a transaction or check-and-set pattern. Alternatively, since `linkMaterialToModule` generates a unique ID per link, add a uniqueness check (materialId + moduleId) before inserting, or deduplicate on read.

---

## 🟡 Medium Issues

### M1: Test coverage is minimal for sync features

**File:** [ModuleList.test.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/course/ModuleList.test.tsx#L39-L41)

The sync service is mocked to return `null`:
```typescript
vi.mock('../../services/courseSyncService', () => ({
    detectSyncUpdates: vi.fn().mockResolvedValue(null),
}));
```

There are **zero test cases** for:
- Sync banner rendering when updates are available
- Cherry-pick selection/deselection
- Apply sync flow
- Dismiss flow
- New module banner rendering
- Error states during sync

There is also **no unit test file** for `courseSyncService.ts` itself.

---

### M2: `detectSyncUpdates` makes O(n) serial DB calls per module

**File:** [courseSyncService.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/services/courseSyncService.ts#L149-L183)

For each original module, it calls `getMaterialsByModule` for both the original and the copy module. With 10 modules, that's 20 sequential DB reads, plus additional reads for new modules.

**Impact:** Slow detection on courses with many modules. Each DB read is a network round-trip.

**Suggestion:** Batch-fetch all materials for both courses using `getMaterialsByCourse` (single query per course) and group client-side, rather than per-module queries.

---

### M3: `dismissNewModulesSync` writes to a non-typed field

**File:** [courseSyncService.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/services/courseSyncService.ts#L366-L374)

The function writes `lastModuleSyncAt` directly to `courses/{copyCourseId}`, but this field is **not defined in the `Course` interface** (see [course.types.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/types/course.types.ts)):

```typescript
export interface Course {
    id: string;
    name: string;
    // ...
    // ⚠️ No lastModuleSyncAt field defined
}
```

**Impact:** TypeScript won't catch misuse of this field. Other code reading Course objects won't know this field exists.

**Fix:** Add `lastModuleSyncAt?: number;` to the `Course` interface.

---

### M4: `linkedAt` field is optional in `CourseMaterial` type but required by sync logic

**File:** [course.types.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/types/course.types.ts#L94)

```typescript
export interface CourseMaterial {
    // ...
    linkedAt?: number; // Optional!
}
```

The sync detection logic (courseSyncService.ts line 166) treats missing `linkedAt` as `0`:
```typescript
const materialLinkedAt = m.linkedAt || 0;
```

This means materials with no `linkedAt` (legacy data, or from `copyMaterialToModule` per C2) are always treated as "created at epoch start", and thus always older than any `lastSyncedAt`. They become **invisible to sync**.

**Fix:** Make `linkedAt` required in the type (`linkedAt: number;`) and backfill existing data.

---

### M5: The `SyncIndicator.tsx` component is unrelated to course sync

**File:** [SyncIndicator.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/test/SyncIndicator.tsx)

This component is for **audio synchronization** during live sessions (PRD-0018), not for course material sync. Its presence in a `sync*` name search is a naming ambiguity.

**Impact:** Naming confusion during maintenance. Consider renaming to `AudioSyncIndicator.tsx` or documenting the distinction.

---

## 🔵 Low Issues

### L1: Magic string `'Untitled'` repeated across sync service

`resolveTestTitles` returns `'Untitled'` for missing titles, and the title resolution in `ModuleList.tsx` uses `'Untitled'`, `'Untitled THCS Test'`, and `'Unknown Material'`. These should be constants.

### L2: `NewModuleSyncBanner` applies modules sequentially

`handleApply` (NewModuleSyncBanner.tsx line 52) loops through `selectedModules` with `for...of` and awaits each one. This could be parallelized with `Promise.allSettled` for faster bulk imports.

### L3: No audit trail for sync operations

The project has an `auditService` (imported in courseManager.ts). Sync apply/dismiss operations don't log any audit events. There's no record of when sync was performed, by whom, or what was synced.

---

## Summary of Fixes Required

| # | Severity | Issue | Effort |
|---|----------|-------|--------|
| C1 | 🔴 Critical | `dismissNewModulesSync` is non-functional — detection ignores `lastModuleSyncAt` | Medium |
| C2 | 🔴 Critical | `copyMaterialToModule` missing `linkedAt` — copied materials invisible to sync | Low |
| C3 | 🔴 Critical | Full table scan of `class_course_links` on every detection | Low |
| H1 | 🟠 High | Mantine imports violate NO-MANTINE rule | High |
| H2 | 🟠 High | No error surfacing or retry for sync detection failure | Low |
| H3 | 🟠 High | Fragile `originalModule.id` reference | Low |
| H4 | 🟠 High | No concurrency protection — duplicate materials possible | Medium |
| M1 | 🟡 Medium | Zero test coverage for sync features | High |
| M2 | 🟡 Medium | O(n) serial DB calls per module during detection | Medium |
| M3 | 🟡 Medium | `lastModuleSyncAt` not in Course type | Low |
| M4 | 🟡 Medium | `linkedAt` optional in type but required by logic | Low |
| M5 | 🟡 Medium | Naming ambiguity with `SyncIndicator.tsx` | Low |
| L1 | 🔵 Low | Magic strings | Low |
| L2 | 🔵 Low | Sequential module apply | Low |
| L3 | 🔵 Low | No audit trail for sync ops | Low |

---

## PRD Compliance Check

**PRD-0014 §4.18.6** specifies: *"'Sync with original' option to update class's course copy."*

| PRD Requirement | Implemented? | Notes |
|----------------|-------------|-------|
| Sync option exists for class course copies | ✅ Yes | Inline banners per-module + top-of-list banner |
| Copies are independent when linked | ✅ Yes | Deep copy at link time, `isClassInstance: true` |
| Teacher can customize copy | ✅ Yes | Rename, reorder, remove materials freely |
| Sync is additive only | ✅ Yes | Never removes, never modifies existing copy content |
| Teacher controls what to sync | ✅ Yes | Cherry-pick checkboxes per material |
| Sync is manual (not automatic) | ✅ Yes | Detected on page load, teacher must click "Apply" |

**Verdict:** The feature satisfies the PRD requirement. The issues found are implementation-quality bugs, not design gaps.

---

## Spec-vs-Implementation Gap Analysis

Comparing the [original detailed spec](file:///C:/Users/The%20Lord/.gemini/antigravity/brain/12483d91-68f7-4172-b31a-a9320fc8a702/course_sync_detailed_spec.md) against the actual code:

| Spec Section | Spec Says | Code Does | Gap? |
|-------------|-----------|-----------|------|
| Edge Case 1: Module Matching | Use `originalModuleId` field | ✅ Correctly implemented | None |
| Edge Case 2: Duplicate Prevention | Check `materialId` before adding | ✅ `applySyncMaterials` checks `existingMaterialIds` | None |
| Edge Case 3: Deleted Original | Null check, graceful degradation | ✅ Returns `null` if original gone | None |
| Edge Case 5: Additive-Only | Use `lastSyncedAt` timestamp, only show materials with `linkedAt > lastSyncedAt` | ✅ Correctly implemented for existing modules | None |
| New Module Detection | Original modules NOT in copy's `originalModuleId` set **AND created AFTER course was linked** | ⚠️ Only checks the set membership, **ignores the "created after" condition** | **Gap → C1** |
| Dismiss for existing modules | Update `lastSyncedAt = Date.now()` | ✅ Correctly implemented | None |
| Dismiss for new modules | (Not explicitly specified in spec) | ❌ Writes `lastModuleSyncAt` but never reads it | **Gap → C1** |
| `linkedAt` on `CourseMaterial` | Spec note: "Already exists — set in `linkMaterialToModule()`" | ⚠️ Only in `linkMaterialToModule`, NOT in `copyMaterialToModule` | **Gap → C2** |
| Service naming | `courseSyncService.ts` separate from `enrollmentManager` and `materialLinkManager` | ✅ Correctly separated | None |
| Consolidate `getMaterialsByCourse` | Spec recommends deprecating `courseManager.ts` version | ❌ Not done — both still exist | **Gap (low priority)** |

> [!IMPORTANT]
> The spec's new-module detection algorithm (step 3 in §Detection Algorithm) explicitly says **"AND created AFTER the course was linked."** The implementation omits this second condition, which is the root cause of C1 — dismissed new modules reappear.

---

## Conformance with Established Standards

The [Knowns pattern doc](file:///c:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/patterns/pattern-course-class-sync-thcs-title-resolution.md) established 5 moving-forward standards after the initial sync implementation. Checking conformance:

| Standard | Status | Notes |
|----------|--------|-------|
| **Standard 1: Title Resolution** — ALL code displaying test titles must use the THCS-aware resolver | ✅ Conformant | `courseSyncService.ts` uses the resolver at line 89-91 |
| **Standard 2: Component Reuse Registry** — `ModuleList` is the canonical component for modules/materials | ✅ Conformant | Both `TeacherCourseProfilePage` and `TeacherClassDetailPage` use `ModuleList` |
| **Standard 3: Pre-Implementation Navigation Audit** — Verify the user's actual navigation path | ✅ Verified | Sync banners visible from BOTH course profile AND class detail pages |
| **Standard 4: Polymorphic Data Read Safety** — Check `testType` discriminator before field access | ✅ Conformant | Title resolver checks `testType === 'THCS-THPT'` |
| **Standard 5: Sync Service Naming Convention** — Never confuse the 3 sync services | ✅ Conformant | `courseSyncService`, `enrollmentManager.syncCourseWithOriginal`, `materialLinkManager.syncMaterialContentWithOriginal` all clearly separated |

---

## Historical Context

From the [original bug analysis](file:///C:/Users/The%20Lord/.gemini/antigravity/brain/12483d91-68f7-4172-b31a-a9320fc8a702/course_materials_bug_analysis.md) (session 2026-03-13):

- **Bug 1** ("Materials Not Showing in Teacher View") was diagnosed as likely a UX issue (modules collapsed by default), NOT a code bug
- **Bug 2** ("Student View Not Getting Updates After Course Linked") was confirmed as a **deliberate architectural gap** — the deep-copy model doesn't support live sync
- The sync feature was designed as **Option A: Material Sync Function** from the four proposed solutions
- The [Knowns pattern doc](file:///c:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/patterns/pattern-course-class-sync-thcs-title-resolution.md) records that the **"wrong component" bug** (Lesson 1) caused significant delay — sync was built into `ModuleList` but the user was viewing `TeacherClassDetailPage` which had its own inline rendering. This was fixed by integrating the shared `ModuleList` component into the class detail page.

---

## What Works Well

Despite the issues above, several aspects of the implementation are well-designed:

1. **Lineage tracking via `originalModuleId`** — Clean, reliable way to map copy → original
2. **Timestamp-based gating (`lastSyncedAt`)** — Elegant mechanism to track what's been seen
3. **Cherry-pick UX** — Teachers can select individual materials instead of all-or-nothing
4. **Separation of concerns** — Service layer (`courseSyncService.ts`) is cleanly separated from UI (`ModuleSyncBanner`, `NewModuleSyncBanner`)
5. **Idempotent apply** — `applySyncMaterials` checks existing materials before adding
6. **Non-blocking detection** — Sync check runs after module load, doesn't block page render
7. **Two-tier detection** — Properly distinguishes "new materials in existing module" from "entirely new module"
8. **Module copy at enrollment** — `linkCourseToClass` correctly sets `originalModuleId` and `lastSyncedAt` on initial copy (enrollmentManager.ts line 86-91)
9. **All 5 established standards** from the Knowns pattern doc are properly followed
10. **Component reuse** — The "wrong component" lesson was properly learned; `ModuleList` is now the canonical rendering path for both course profile and class detail pages
