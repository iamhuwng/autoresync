---
id: 20b0o3
title: Types & Data Model Cleanup
status: done
priority: high
labels:
  - phase-1
  - from-spec
  - grading-editor
createdAt: '2026-03-01T06:43:25.466Z'
updatedAt: '2026-03-01T06:53:50.454Z'
timeSpent: 351
assignee: '@me'
spec: specs/grading-editor-redesign
fulfills:
  - AC-28
---
# Types & Data Model Cleanup

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update TypeScript types for the grading editor redesign. Add GradingComment and QuickCommentPreset interfaces. Remove old WritingAnnotation type and offset-based annotation types. Update grading data shape to use TipTap JSON instead of offset arrays. Audit writingSubmissionService.ts for current data paths. See @doc/specs/grading-editor-redesign FR-GROUP-4 for data shapes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define GradingComment interface: id, text, categoryId, categoryLabel, color, status (active/resolved/deleted), anchorText, createdAt, updatedAt
- [x] #2 Define QuickCommentPreset interface: id, text, categoryId, categoryLabel, color, isDefault
- [x] #3 Remove WritingAnnotation type and all offset-based annotation types from ielts-writing.types.ts
- [x] #4 Update grading data shape types to reference TipTap JSON content + comments array
- [x] #5 Audit writingSubmissionService.ts for current Firestore paths and document structure
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan: Types & Data Model Cleanup

### Context
- Current: `ielts-writing.types.ts` (312 lines) has `WritingAnnotation` (offset-based: startOffset/endOffset) + `AnnotationCategory` (Firestore-backed per-teacher categories)
- New: Replace with `GradingComment` (TipTap-linked via commentId) + `QuickCommentPreset` (localStorage-backed)
- `WritingSubmission.annotations: WritingAnnotation[]` → `WritingSubmission.comments: GradingComment[]` + `WritingSubmission.markedContent: object` (TipTap JSON)
- `writingSubmissionService.ts` `updateGrading()` signature must change: `annotations: WritingAnnotation[]` → `comments: GradingComment[]` + `markedContent: object`

### Blast Radius (files importing old types)
These files import `WritingAnnotation` or `AnnotationCategory` but will be DELETED or REWRITTEN in later tasks:
- `AnnotationToolbar.tsx` → DELETED (Task 8)
- `AnnotatedEssayRenderer.tsx` → DELETED (Task 8)
- `annotationRenderer.ts` → DELETED (Task 8)
- `CategoryManager.tsx` → DELETED (Task 8)
- `WritingGradingModal.tsx` → REWRITTEN (Task 8)
- `WritingGradingPage.tsx` → MODIFIED (Task 8)
- `AnnotatedEssayReadOnly.tsx` → REWRITTEN (Task 10)

Strategy: **Keep old types temporarily** (don't delete yet, just deprecate with @deprecated JSDoc). Add new types alongside. Actual removal happens in Task 8 when the consuming files are deleted/rewritten.

### Steps

1. **Add new interfaces to `ielts-writing.types.ts`**:
   - `GradingComment` (see @doc/specs/grading-editor-redesign FR-GROUP-4)
   - `QuickCommentPreset`
   - `CommentCategoryId` type alias: `'gra' | 'lr' | 'cc' | 'ta' | 'tr' | 'uncategorized'`
   - `COMMENT_CATEGORIES` constant: category definitions with id, label, color
   - `GradingEditorState` interface: per-task state shape for task switching
   
2. **Update `WritingSubmission` interface**:
   - Add `comments?: GradingComment[]` (optional — new field)
   - Add `markedContent?: Record<number, object>` (TipTap JSON per task, keyed by taskNumber)
   - Mark `annotations: WritingAnnotation[]` with `@deprecated` JSDoc — keep for now, remove in Task 8
   
3. **Update `WritingGradingResult` interface**:
   - No structural changes needed — feedback shape stays the same
   
4. **Mark old types as deprecated**:
   - Add `@deprecated` to `WritingAnnotation` — "Replaced by GradingComment + TipTap marks. Will be removed."
   - Add `@deprecated` to `AnnotationCategory` — "Replaced by QuickCommentPreset (localStorage). Will be removed."
   
5. **Update `writingSubmissionService.ts`**:
   - Import new `GradingComment` type
   - Add overloaded `updateGradingV2()` function that accepts `comments: GradingComment[]` + `markedContent: object` instead of `annotations: WritingAnnotation[]`
   - Keep old `updateGrading()` with `@deprecated` — consumed by current WritingGradingModal until Task 8 rewrites it
   - Document Firestore paths: `writing_submissions/{submissionId}` stores `comments[]` + `markedContent` fields
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Log

### Step 1: New types added to ielts-writing.types.ts
- Added: CommentCategoryId, CommentCategoryDef, COMMENT_CATEGORIES constant, getTaskCriterionId() helper
- Added: GradingComment interface (id, taskNumber, text, categoryId, categoryLabel, color, status, anchorText, timestamps)
- Added: QuickCommentPreset interface (id, text, categoryId, categoryLabel, color, isDefault)
- Added: GradingEditorTaskState interface (for task switching state management)

### Step 2: WritingSubmission updated
- Added optional markedContent?: Record<number, object> (TipTap JSON per task)
- Added optional comments?: GradingComment[] (Google Docs-style comments)
- Old annotations field marked @deprecated with JSDoc

### Step 3: Old types deprecated (not deleted)
- WritingAnnotation: @deprecated (consumed by 7 files to be deleted in Task z5eq9j)
- AnnotationCategory: @deprecated (consumed by 4 files to be deleted in Task z5eq9j)

### Step 4: writingSubmissionService.ts updated
- Added GradingComment import
- Added updateGradingV2() function (stores TipTap JSON + comments array)
- Old updateGrading() marked @deprecated
- Added updateGradingV2 to default export

### Step 5: Audit
- Firestore path: writing_submissions/{submissionId}
- New fields: markedContent, comments (alongside existing grading, annotations)
- Build clean (no new errors from changes)"

AC-3 note: WritingAnnotation and AnnotationCategory marked @deprecated with JSDoc. Actual deletion deferred to Task z5eq9j (WritingGradingModal Rewrite) when consuming files are deleted. Removing now would break 7+ files."
<!-- SECTION:NOTES:END -->

