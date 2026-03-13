---
title: 'Pattern: Course-Class Sync & THCS Title Resolution'
createdAt: '2026-03-13T19:04:05.187Z'
updatedAt: '2026-03-13T19:07:59.588Z'
description: >-
  Canonical pattern for course sync between original templates and
  class-instance copies, THCS test title resolution, and component integration
  across page boundaries. Covers events, features, implementations, lessons
  learned, logics, patterns, and moving forward standards from the March 2026
  session.
tags:
  - pattern
  - course
  - sync
  - thcs
  - component-integration
  - lessons-learned
  - standard
---
# Pattern: Course-Class Sync & THCS Title Resolution

> Session: 2026-03-13/14 — Windsurf March Session

---

## Events (Chronological)

| # | Event | Outcome |
|---|-------|---------|
| 1 | User reported materials showing as "Unknown Material" in module view | Triggered investigation into THCS test title storage pattern |
| 2 | Root cause identified: `title` field access mismatch between regular tests and THCS tests | THCS stores title in `metadata.title`, not top-level `title` |
| 3 | Fix applied to `ModuleList.tsx` title resolver | Correct titles now display for BOTH test types |
| 4 | User reported class detail page unchanged despite all fixes | Revealed that `TeacherClassDetailPage.tsx` used its OWN inline module rendering, NOT the `ModuleList` component |
| 5 | Full `ModuleList` component integrated into class detail page's Courses tab | Replaced ~100 lines of inline code with the shared component |
| 6 | Previously designed Course Sync feature (banners, cherry-pick, dismiss) now visible in class detail page | End-to-end feature delivery completed |

---

## Features Implemented

### 1. Course Material Sync System (`courseSyncService.ts`)
- **Detection**: On page load, compares original course template modules/materials with class-instance copies
- **Cherry-pick**: Teacher selects individual materials via checkboxes
- **Dismiss**: Timestamp-based — dismissed items don't reappear; genuinely new items do
- **New module detection**: Separate banner for entirely new modules added to original

### 2. THCS Title Resolution (cross-cutting)
- Resolves `test.metadata.title` for THCS-THPT tests, `test.title` for regular tests
- Applied in: `ModuleList.tsx`, `courseSyncService.ts`, `ModuleSessionModal.tsx`, `AdminMaterialsPage.tsx`

### 3. Class Detail Page — Full ModuleList Integration
- Replaced inline module cards with the shared `ModuleList` component
- Now shows: expandable modules, materials, sync banners, drag-and-drop, practice settings

---

## Implementations (Key Code)

### THCS Title Resolution Pattern
```typescript
// The canonical title resolver — use this everywhere test titles are displayed
const resolvedTitle = test
    ? (test.testType === 'THCS-THPT'
        ? (test.metadata?.title || test.title || 'Untitled THCS Test')
        : (test.title || 'Untitled'))
    : 'Unknown Material';
```

**Files using this pattern:**
| File | Line(s) | Context |
|------|---------|---------|
| `ModuleList.tsx` | 113-117 | Module material display |
| `courseSyncService.ts` | 89-91 | Sync notification titles |
| `ModuleSessionModal.tsx` | 94 | Practice session material list |
| `AdminMaterialsPage.tsx` | 164 | Admin materials management |

### Sync Detection Algorithm
```
For each module-copy in class instance:
  1. Get originalModuleId → fetch original module's materials
  2. Get copy module's materials
  3. Filter original materials where:
     - linkedAt > copy.lastSyncedAt
     - materialId NOT already in copy's materials
  4. If any remain → these are "pending sync items"
```

### Component Integration (Class Detail Page)
```tsx
// Before: 60+ lines of inline module rendering per course
{modulesMap[course.id].map((module) => {
    // inline status badges, buttons, etc.
})}

// After: single component with full capability
<ModuleList courseId={course.id} classId={classId} />
```

---

## Lessons Learned from Trials & Failures

### 🔴 Lesson 1: "Wrong Component" Bug Class
**Failure**: Built sync features into `ModuleList.tsx` (used on course profile page), but the user was looking at `TeacherClassDetailPage.tsx` which had its own SEPARATE inline module rendering. Changes were invisible.

**Root cause**: Two different pages rendered the same data using different code paths. The class detail page duplicated module rendering logic instead of reusing the `ModuleList` component.

**Detection rule**: Before implementing a feature in a component, **grep for all rendering paths** of the same data. Ask: *"Is this component the ONLY way users see this data?"*

```bash
# Self-check command:
rg -l "getModulesByCourse|ModuleList" --include="*.tsx" src/
```

### 🔴 Lesson 2: Data Structure Inconsistency Across Test Types
**Failure**: `Unknown Material` displayed for all THCS tests because THCS tests lack a top-level `title` field.

**Root cause**: Two test types (`TestData` and `THCSTest`) have structurally different shapes:
- Regular: `{ title: "My Test", ... }`
- THCS: `{ metadata: { title: "My Test" }, ... }` (no top-level `title`)

**Prevention rule**: When accessing ANY field from a polymorphic data source (e.g., `tests/` node which stores both types), ALWAYS check the type discriminator first:
```typescript
// ❌ WRONG — assumes all tests have top-level title
const title = test.title || 'Unknown';

// ✅ CORRECT — checks testType discriminator
const title = test.testType === 'THCS-THPT'
    ? (test.metadata?.title || 'Untitled THCS Test')
    : (test.title || 'Untitled');
```

### 🟡 Lesson 3: Feature Placement Must Match User's Navigation Path
**Failure**: Sync banners were correctly implemented but invisible to the user because they navigate via Class Detail → Courses tab, NOT via the standalone Course Profile page.

**Prevention**: Before implementing any UI feature, ask: *"What is the user's navigation path to this data?"* Trace the route, not just the data.

### 🟡 Lesson 4: Deep-Copy Architecture Creates Sync Gaps
The `linkCourseToClass()` deep-copy model creates a point-in-time snapshot. Any additions to the original after copy are invisible to students/teachers viewing the copy.

**Accepted trade-off**: Deep copy enables per-class customization (rename, reorder, remove materials) at the cost of requiring explicit sync for new additions.

---

## Logic & Patterns

### Pattern 1: Timestamp-Based Additive Sync
```
Original Module materials:
  A (linkedAt: Jan 1)   ← before lastSyncedAt → SKIP
  B (linkedAt: Jan 1)   ← before lastSyncedAt → SKIP (even if removed from copy)
  E (linkedAt: Mar 13)  ← AFTER lastSyncedAt  → SHOW as NEW

Copy Module:
  lastSyncedAt: Jan 1 (set when copy was made)
```

**Key insight**: We only show materials added AFTER `lastSyncedAt`. Materials that existed before the copy and were intentionally removed by the teacher won't resurface.

### Pattern 2: Module Lineage Tracking
```typescript
interface Module {
    originalModuleId?: string;  // Set on copy — traces lineage to original
    lastSyncedAt?: number;      // Timestamp of last sync/dismiss
}
```

### Pattern 3: Polymorphic Title Resolution
When a database node stores multiple entity types (discriminated by `testType`), EVERY read site must check the discriminator. A search for `test.title` without checking `testType` is a latent bug.

### Pattern 4: Component Reuse Over Inline Rendering
When two pages display the same domain data (modules + materials), they MUST use the same component. Inline rendering creates:
- Feature drift (one page gets fixes, the other doesn't)
- Maintenance burden (changes needed in N places)
- Integration bugs (sync features only visible on one page)

---

## Moving Forward Standard

### ✅ Standard 1: Title Resolution
**ALL new code** that displays test titles MUST use the THCS-aware resolver. Grep audit:
```bash
rg "test\.title" --include="*.tsx" --include="*.ts" src/ | grep -v "testType"
```
Any hit that doesn't check `testType` first is a potential bug.

### ✅ Standard 2: Component Reuse Registry
Before creating inline rendering for domain data, check this registry:

| Domain Data | Canonical Component | Used By |
|-------------|-------------------|---------|
| Modules + Materials | `ModuleList` | `TeacherCourseProfilePage`, `TeacherClassDetailPage` (Courses tab) |
| Material selector | `MaterialSelectorModal` | Module material addition |
| Practice settings | `PracticeSettingsModal` | Per-module settings |
| Sync banners | `ModuleSyncBanner` / `NewModuleSyncBanner` | Inline in `ModuleList` |

### ✅ Standard 3: Pre-Implementation Navigation Audit
Before implementing a UI feature, answer:
1. What page(s) will the user see this on?
2. What is the user's navigation path to reach it?
3. Does that page use the component I'm modifying, or does it have its own rendering?

### ✅ Standard 4: Polymorphic Data Read Safety
When reading from a shared database node (e.g., `tests/`), ALWAYS:
1. Check the type discriminator (`testType`)
2. Access type-specific fields accordingly
3. Provide fallback for unknown types

### ✅ Standard 5: Sync Service Naming Convention
| Service | Purpose | Scope |
|---------|---------|-------|
| `courseSyncService.ts` | Module/material structure sync | Course ↔ Class copy |
| `enrollmentManager.ts:syncCourseWithOriginal()` | Metadata sync only (name, desc) | Course metadata |
| `materialLinkManager.ts:syncMaterialContentWithOriginal()` | Test content sync (questions/answers) | Individual material |

Never confuse these three — they operate at different granularities.
