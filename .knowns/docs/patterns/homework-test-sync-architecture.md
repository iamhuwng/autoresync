---
title: Homework ↔ Test Sync Architecture
createdAt: '2026-03-13T06:48:52.514Z'
updatedAt: '2026-03-13T06:48:52.514Z'
description: >-
  How test edits propagate to homework assignments — data flow, denormalized
  fields, fire-and-forget sync, and editor save protocol
tags:
  - homework
  - test-editor
  - sync
  - denormalization
  - toast
  - fire-and-forget
---
# Homework ↔ Test Sync Architecture

## Data Flow (No Snapshot — Live Reference)

Homework stores `materialId` (FK to RTDB `tests/{id}`). Student practice pages always fetch live:

```
Teacher Edit → RTDB tests/{id}  ← Student Read (live fetch)
Homework only stores: materialId, materialTitle (denormalized copy)
```

Both editors write to `tests/{id}`. Both student views read from `tests/{materialId}`. No cache, no snapshot at assignment time.

## Denormalized Field: `materialTitle`

`homework.materialTitle` is a display-only copy set at creation. When teacher renames a test:
- `propagateTestMetadataToHomework(materialId, { materialTitle })` queries all homework with that materialId
- Uses `writeBatch()` for atomic batch update
- Fire-and-forget — never blocks editor save

## Editor Save Protocol (Standard)

```typescript
try {
    await save(data);
    toast.success('Saved ✅');
    if (titleChanged) propagateTestMetadataToHomework(id, { materialTitle }); // no await
    handleClose();
} catch (error) {
    toast.error('Failed to save');
    // Do NOT close modal — let user retry
} finally {
    setIsSaving(false);
}
```

Rules: Always toast before close. Never alert(). Never close on error. Side effects are fire-and-forget.

## Key Files

- `homeworkManager.ts` → `propagateTestMetadataToHomework()`
- `TestEditor.tsx` → IELTS save + propagation
- `THCSTestEditorModal.tsx` → THCS save + propagation
- `StudentHomeworkDetailPage.tsx` → "Updated X ago" badge
- `useSoloTestData.ts` → `loadedRef` guard (dedup, not cache)

## Gotchas

- `loadedRef` in `useSoloTestData` prevents re-fetch if component doesn't unmount between navigations
- `homework.title` takes precedence over `materialTitle` in display — rename only affects materialTitle
- `material.updatedAt` badge shows test freshness on student homework detail page
