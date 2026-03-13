# Knowledge Extract: Homework ↔ Test Synchronization Investigation

> **Session:** 2026-03-13 | **Scope:** Why edited tests don't update in homework assignments
> **Files touched:** 4 modified, 0 created | **TypeScript errors introduced:** 0

---

## 1. Events Timeline

| Time | Event | Outcome |
|------|-------|---------|
| Session start | User reports: "When I edit a test in Teacher Lobby, the homework test stays the same" | Initiated full code trace |
| Research Phase | Traced 7 files across the full data pipeline: Editor → Firebase → Student Load | Discovered architecture is actually correct |
| Root Cause ID | Identified the real issues are **perceptual** (stale title) + **operational** (no save feedback) | Shifted strategy from "fix data flow" to "fix UX gaps" |
| Implementation | 4 tasks executed in dependency order | All compile clean, zero new TS errors |

---

## 2. Features Implemented

### 2.1 Save Confirmation Toast (IELTS + THCS Editors)
- **What:** Replaced silent modal close + `alert()` fallback with `toast.success()`/`toast.error()` from existing `ToastNotification` system
- **Why:** Teachers had no unambiguous confirmation that saves succeeded. Modal just closed — indistinguishable from cancel.
- **Files:** `TestEditor.tsx`, `THCSTestEditorModal.tsx`
- **Pattern:** Fire toast BEFORE `handleClose()` so it appears even after modal unmounts (ToastContainer lives in App.jsx)

### 2.2 Test Metadata Propagation to Homework
- **What:** New `propagateTestMetadataToHomework(materialId, { materialTitle })` function in `homeworkManager.ts`
- **Mechanism:** Queries Firestore `homework_assignments` where `materialId == testId`, batch-updates `materialTitle` using `writeBatch()`
- **Integration:** Called fire-and-forget from both editors after successful save, only when title actually changed
- **Files:** `homeworkManager.ts` (new function), `TestEditor.tsx` (wired), `THCSTestEditorModal.tsx` (wired)

### 2.3 "Updated X Ago" Badge on Student Homework Detail
- **What:** Teal badge showing `🔄 Updated 2h ago` with full timestamp on hover
- **Source:** Reads `material.updatedAt` from RTDB (already fetched by existing `getTestFromFirebase()` call)
- **File:** `StudentHomeworkDetailPage.tsx`

---

## 3. Implementation Details & Patterns

### 3.1 Data Flow Architecture (Discovered — NOT Changed)

```
TEACHER EDITS                          STUDENT READS
─────────────                          ─────────────
TestEditor.tsx                         StudentPracticePage.tsx (router)
  → update(ref(database), {              ├─ IELTS → IELTSPracticeView
      /tests/{id}/questions/...              → useSoloTestData({ materialId })
      /tests/{id}/title                        → getTestFromFirebase(materialId)
      /tests/{id}/updatedAt                      → RTDB: tests/{materialId} ← SAME NODE
    })                                   └─ THCS → THCSPracticeView
                                             → getThcsTestFromFirebase(materialId)
THCSTestEditorModal.tsx                        → RTDB: tests/{materialId} ← SAME NODE
  → updateThcsTestInFirebase(id, {...})
    → update(testRef, updatedData)
      → RTDB: tests/{id} ← SAME NODE
```

**Key finding:** No data is snapshotted at homework creation time. The homework only stores `materialId` (a foreign key). The student practice page always fetches live from RTDB using that ID.

### 3.2 Fire-and-Forget Pattern for Side Effects

```typescript
// ✅ Pattern: Non-blocking side effect after primary operation
if (result.success) {
    toast.success('Test saved successfully ✅');

    // Fire-and-forget: propagate title change to homework assignments
    if (titleChanged) {
        propagateTestMetadataToHomework(testId, { materialTitle: newTitle });
        // No await — don't block the editor close
    }

    handleClose();
}
```

**Why fire-and-forget:** The primary operation (test save) is already committed to RTDB. The secondary operation (homework title sync) is a UX enhancement. If it fails:
- Student still gets the latest test content (correct data path)
- Only the homework card title is stale (cosmetic, non-blocking)
- Failure is logged to console for debugging

### 3.3 Firestore Batch Write Pattern

```typescript
const batch = writeBatch(db);
let updateCount = 0;

snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (updates.materialTitle && data.materialTitle !== updates.materialTitle) {
        batch.update(docSnap.ref, { materialTitle: updates.materialTitle });
        updateCount++;
    }
});

if (updateCount > 0) {
    await batch.commit();  // Atomic — all or nothing
}
```

**Why batch:** Multiple homework assignments may reference the same test. Individual `updateDoc()` calls would be N round-trips. `writeBatch()` is 1 atomic operation.

### 3.4 Toast System Reuse Pattern

The project has a mature, production-ready `ToastNotification` system:
- **Global store:** `useSyncExternalStore` with a module-level queue (no React context needed)
- **Import:** `import { toast } from '../components/modern/ToastNotification';`
- **API:** `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`, `toast.warning(msg)`
- **Mount point:** `<ToastContainer />` in `App.jsx` — already global
- **Use this instead of:** `alert()`, `window.confirm()` for success/error feedback, `@mantine/notifications`

---

## 4. Lessons Learned — Trials & Failures

### 4.1 "The Bug That Wasn't a Bug"

> **Lesson:** When a user reports "X doesn't update," trace the ENTIRE data pipeline before assuming there's a data flow bug. The architecture may be correct — the problem may be perceptual.

**What happened:** The user reported edited tests don't update in homework. After tracing 7 files across 2 editor types and 2 student practice views, the data flow was **architecturally correct** — RTDB `tests/{materialId}` is always fetched live. The actual problems were:
1. **Stale `materialTitle`** on homework cards (cosmetic, but created "nothing changed" perception)
2. **No save confirmation** in editors (teachers couldn't tell if saves succeeded)

**Anti-pattern:** Jumping to "the data must be cached somewhere" without reading the code first.

### 4.2 Perception-vs-Reality Gap in UI

> **Lesson:** A correct backend with a misleading frontend IS a bug — just a UX bug, not a data bug.

The `homework.materialTitle` field was snapshotted at assignment creation time and never updated. Students and teachers saw the old title on homework cards, creating the impression that "nothing changed" even when the underlying test data was fully up-to-date.

**Fix pattern:** Propagate denormalized display data when the source of truth changes. If you store a title copy for display purposes, you own the synchronization responsibility.

### 4.3 Silent Success = Ambiguous Outcome

> **Lesson:** Modal closes silently on save? That's indistinguishable from cancel. Users NEED explicit save confirmation.

Both `TestEditor.tsx` and `THCSTestEditorModal.tsx` simply called `handleClose()` after a successful save. There was no visual difference between:
- Save succeeded → modal closes
- User clicked cancel → modal closes
- Save failed silently → modal closes (in edge cases)

**Fix pattern:** Always show `toast.success()` before `handleClose()`, and `toast.error()` in catch blocks. The toast persists after the modal unmounts because `ToastContainer` lives in `App.jsx`.

### 4.4 The `loadedRef` Guard — Defensive but Obscure

> **Lesson:** Optimization guards (like ref-based dedup) can prevent expected behavior. Document them clearly.

`useSoloTestData.ts` (line 31) has:
```typescript
if (!materialId || loadedRef.current === materialId) return;
loadedRef.current = materialId;
```

This prevents re-fetching the same test data on re-renders. It's correct for performance, but it means:
- If the student navigates away and back WITHOUT unmounting, they get stale data
- React StrictMode double-renders won't re-fetch

**Future risk:** If navigation becomes SPA-like (no full unmount), this guard will hide stale data.

---

## 5. Logic & Decision Rationale

### 5.1 Why Not a Cloud Function?

A Cloud Function trigger on `tests/{testId}/write` could automatically propagate changes. Reasons against:
- **Overhead:** Adds cold start latency for every test save (even non-title changes)
- **Complexity:** New deployment surface, monitoring, and error handling
- **Scope:** Only title needs propagation currently — not worth a serverless function for one field
- **Cost:** Firestore reads inside a CF count toward billing

The client-side fire-and-forget approach is simpler, cheaper, and sufficient for the current use case.

### 5.2 Why Batch Update, Not Individual Updates?

A single test could be referenced by 10+ homework assignments (different classes, different due dates). `writeBatch()` provides:
- **Atomicity:** All updates succeed or none do
- **Efficiency:** Single network round-trip
- **Consistency:** No partial update state

### 5.3 Why `materialTitle` and Not `homework.title`?

Homework assignments have two title fields:
- `homework.title` — teacher-defined custom title for the assignment (e.g., "Week 5 Homework")
- `homework.materialTitle` — copied from the test name at creation time (e.g., "Midterm Practice Test")

The display logic is: `{homework.title || homework.materialTitle}`. We only update `materialTitle` because:
- If the teacher set a custom `homework.title`, that takes precedence — the test rename shouldn't override it
- If no custom title was set, `materialTitle` shows — and now it stays current

---

## 6. Moving Forward Standard

### 6.1 Editor Save Protocol (New Standard)

All editor save flows MUST follow this pattern:

```typescript
try {
    await saveToDatabase(data);
    toast.success('Saved successfully ✅');

    // Fire-and-forget side effects (non-blocking)
    if (titleChanged) {
        propagateTestMetadataToHomework(id, { materialTitle: newTitle });
    }

    handleClose();
} catch (error) {
    console.error('Save error:', error);
    toast.error('Failed to save. Please try again.');
    // Do NOT close the modal — let the user retry
} finally {
    setIsSaving(false);
}
```

**Key rules:**
1. ✅ Always show success toast BEFORE closing
2. ✅ Always show error toast in catch — NEVER use `alert()`
3. ✅ Never close modal on error — let user retry
4. ✅ Side effects are fire-and-forget (no `await`)
5. ✅ Always reset `isSaving` in `finally`

### 6.2 Denormalized Field Sync Protocol

When storing a copy of data from another source (e.g., `materialTitle` copied from `tests/{id}/title`):

1. **Document the denormalization** — comment in the type definition explaining the source of truth
2. **Propagate on change** — when the source changes, update all copies (use `writeBatch()` for efficiency)
3. **Fire-and-forget** — propagation failures should log but never block the primary operation
4. **Query pattern:** `where('sourceFieldId', '==', sourceId)` to find all documents needing updates

### 6.3 Investigation Protocol — "Data Doesn't Update"

When a user reports data appears stale:

1. **Trace the WRITE path** — find the exact function that saves data and confirm it succeeds
2. **Trace the READ path** — find the exact function that loads data and confirm it reads the same node
3. **Check for snapshots/copies** — identify any denormalized fields that might show stale values
4. **Check for caching guards** — look for `useRef`, `useMemo`, localStorage caching that might prevent re-fetch
5. **Check for save confirmation** — verify the user can tell the difference between success and failure
6. **Don't assume the backend is wrong** — perception bugs are just as real as data bugs

### 6.4 Toast vs Alert Migration

| Old Pattern | New Pattern | When |
|-------------|-------------|------|
| `alert('Failed...')` | `toast.error('Failed...')` | All error feedback |
| Silent modal close | `toast.success('Saved ✅')` + close | All save success |
| `window.confirm(...)` | Keep for now (destructive actions) | Discarding changes |
| `@mantine/notifications` | `toast` from `modern/ToastNotification` | All new notifications |

### 6.5 Composite Index Requirement

The `propagateTestMetadataToHomework()` function queries:
```
homework_assignments WHERE materialId == {testId}
```

**Firestore index:** This query uses a single-field equality filter, so Firestore's automatic single-field indexes handle it. No composite index needed. If future propagation adds ordering or additional filters, a composite index will be required.
