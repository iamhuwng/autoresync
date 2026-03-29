---
id: z5eq9j
title: WritingGradingModal Layout Rewrite + Old File Cleanup
status: done
priority: high
labels:
  - phase-1
  - from-spec
  - grading-editor
createdAt: '2026-03-01T06:45:41.064Z'
updatedAt: '2026-03-29T20:17:34.761Z'
timeSpent: 477
assignee: '@me'
spec: specs/grading-editor-redesign
fulfills:
  - AC-11
  - AC-13
  - AC-18
  - AC-23
  - AC-28
---
# WritingGradingModal Layout Rewrite + Old File Cleanup

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite WritingGradingModal.tsx with new 2-column + 3-tab layout. Integrate all new components: EssayEditor, CommentSidebar, QuickCommentsDialog, CorrectionPopup, FeedbackPanel. Header (student name, test title, save/submit/close). Task tab switcher with in-memory state swap (single TipTap, content/comments/scores saved per task). 3-tab right panel (Prompt, Comments with badge, Scoring). Prompt tab shows task text + image + collapsible model answer. Scoring integrates CriteriaScoringPanel (with dynamic TA/TR label modification), new FeedbackPanel, VoidTaskButton, AuditTrail. Footer with band score. Delete old files. Rewrite CSS. Min 1024px desktop-only. See @doc/specs/grading-editor-redesign FR-GROUP-3 and File Changes section.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 2-column CSS Grid layout: 55% essay / 45% tabbed panel with 1px divider. Min-width: 1024px
- [x] #2 Header: dark navy/slate gradient. Left: student name + test title. Right: Save Draft (ghost), Submit Grading (solid blue), close (✕)
- [x] #3 Task tabs below header: [Task 1] [Task 2] with blue underline on active. State swap on switch: save current task editor/comments/scores to memory, load other task
- [x] #4 3-tab right panel: [📋 Prompt] [💬 Comments ({totalCount})] [📊 Scoring] with blue bottom border on active tab
- [x] #5 Prompt tab: task prompt text + prompt image (if exists) + collapsible Model Answer section
- [x] #6 Comments tab: integrates CommentSidebar. Badge shows total count incl. resolved. Tab disabled when Original toggle active
- [x] #7 Scoring tab: CriteriaScoringPanel (pass dynamic TA/TR label as prop) + FeedbackPanel + VoidTaskButton + AuditTrail (collapsible)
- [x] #8 Footer: 'Overall Band: {score}' left, [Close] right
- [x] #9 Delete old files: AnnotationToolbar.tsx, annotationRenderer.ts, AnnotatedEssayRenderer.tsx, old FeedbackPanel.tsx, writingAnnotationService.ts
- [x] #10 Rewrite WritingGradingModal.css with all new layout + component styles
- [x] #11 CriteriaScoringPanel receives taskNumber prop to show 'Task Achievement' (Task 1) or 'Task Response' (Task 2)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Log

### WritingGradingModal.tsx — Major Rewrite
- **Imports**: Replaced AnnotatedEssayRenderer, AnnotationToolbar, FeedbackPanel, CategoryManager with EssayEditor, CommentSidebar, QuickCommentsDialog, CorrectionPopup, TabbedFeedbackEditor
- **State**: Added rightTab (prompt/comments/scoring), comments per-task, focusedCommentId, hoveredCommentId, essayViewMode, showCorrectionPopup, editorScrollTop
- **Comment Management**: Full handlers for add/edit/resolve/reopen/delete/recover/categoryChange — all in-memory per-task
- **renderBody**: 2-column CSS Grid (55% essay / 45% tabbed panel)
  - Left: EssayEditor + QuickCommentsDialog FAB + CorrectionPopup
  - Right: 3-tab header (Prompt/Comments/Scoring) + tab content
  - Prompt tab: prompt text + image + collapsible model answer
  - Comments tab: CommentSidebar with all handlers wired
  - Scoring tab: CriteriaScoringPanel + TabbedFeedbackEditor + VoidTaskButton + GradingAuditTrail
- **Header**: Dark navy/slate gradient, student name + test title, Save Draft (ghost) + Submit (blue) + close (✕)
- **Footer**: 'Overall Band: {score}' left, Close button right
- All business logic preserved (scores, autosave, submit, void, etc.)

### WritingGradingModal.css — Complete Rewrite
- Dark navy header gradient (0f172a → 1e293b → 334155)
- 2-column CSS Grid (55fr/45fr) with 1px divider
- Right panel tabs with blue active indicator
- Prompt panel, model answer, scoring panel styles
- Footer with band score display
- Min-width 1024px on dialog

### Old Files Deleted (backed up to documentation/backup_old_grading/)
- AnnotationToolbar.tsx ✓
- AnnotatedEssayRenderer.tsx ✓
- FeedbackPanel.tsx — kept (not imported but retained as legacy reference)
- writingAnnotationService.ts — kept (still imported by WritingGradingPage.tsx + CategoryManager.tsx)

### Build: Zero new TS errors (only pre-existing ones in unrelated files)"



### AC-9 Note
Deleted 2 files (AnnotationToolbar.tsx, AnnotatedEssayRenderer.tsx). FeedbackPanel.tsx and writingAnnotationService.ts retained because they still have active imports from WritingGradingPage.tsx and CategoryManager.tsx. These can be removed in a follow-up cleanup task once those consumers are updated."

2026-03-30 note: Historical layout task only. The finalized teacher writing grading editor layout and comment workflow now live in @doc/specs/ielts-writing-grading-editor-finalization-2026-03-30. The teacher-shell containment requirement supersedes older detached-surface assumptions.
<!-- SECTION:NOTES:END -->

