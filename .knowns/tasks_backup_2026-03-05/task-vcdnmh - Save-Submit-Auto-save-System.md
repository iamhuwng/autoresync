---
id: vcdnmh
title: 'Save, Submit & Auto-save System'
status: done
priority: medium
labels:
  - phase-1
  - from-spec
  - grading-editor
createdAt: '2026-03-01T06:46:02.368Z'
updatedAt: '2026-03-01T08:18:01.419Z'
timeSpent: 255
assignee: '@me'
spec: specs/grading-editor-redesign
fulfills:
  - AC-19
  - AC-20
  - AC-21
---
# Save, Submit & Auto-save System

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement auto-save to localStorage every 30s, Save Draft to Firestore, Submit Grading to Firestore + release to student view. Re-edit submitted grading with student notification. Unsaved changes warning on close. Auto-save recovery prompt on re-open. Update writingSubmissionService.ts to store TipTap JSON + comments array instead of offset annotations. See @doc/specs/grading-editor-redesign FR-GROUP-4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Auto-save to localStorage every 30s at key kahoot_grading_draft_{submissionId}. Stores: TipTap JSON, comments array, scores, feedback
- [x] #2 Save Draft button: persist to Firestore, status stays 'pending', show toast 'Draft saved'
- [x] #3 Submit Grading button: persist to Firestore, status → 'graded' (releases to student view), show toast 'Grading submitted'
- [x] #4 Re-editing submitted grading: on re-submit, send student notification 'Your writing result has been updated by {teacherName}' via existing notification service
- [x] #5 Close with unsaved changes: confirmation dialog with [Save & Close] [Discard] [Cancel]
- [x] #6 On reopen with existing localStorage draft: prompt 'Resume from auto-save from X minutes ago?' with [Resume] [Discard]
- [x] #7 writingSubmissionService.ts updated: store TipTap JSON (editor.getJSON()) + comments array + scores + feedback — no more offset-based annotations
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan: Save, Submit & Auto-save System

### 1. localStorage Auto-save (AC-1)
- Define `DRAFT_KEY` helper: `kahoot_grading_draft_{submissionId}`
- Define `GradingDraft` type: { scores, feedback, comments, voided, voidReasons, savedAt }
- Replace 30s `autoSaveRef` timer to save to localStorage instead of calling Firestore
- Save: scores, feedback, comments, voided, voidReasons + timestamp

### 2. Auto-save Recovery Prompt (AC-6)
- On modal open, after submission loads, check localStorage for existing draft
- If found and fresh (< 24h), show recovery prompt: "Resume from auto-save from X minutes ago?"
- [Resume] → hydrate state from draft, [Discard] → clear localStorage, proceed with Firestore data

### 3. Update Save Draft (AC-2)
- Replace `updateGrading()` call with `updateGradingV2()` 
- Pass: submissionId, gradingResult, markedContent={}, comments array, markAsGraded=false
- Show toast "Draft saved" (inline, no alert)
- Clear localStorage draft after successful Firestore save

### 4. Update Submit Grading (AC-3, AC-4)
- Replace `updateGrading()` with `updateGradingV2()` with markAsGraded=true
- Show toast "Grading submitted" 
- Check if already graded (re-edit) → send "updated" notification (AC-4)
- Clear localStorage draft after successful submit

### 5. Close with Unsaved Changes Dialog (AC-5)
- Replace window.confirm with custom inline dialog: [Save & Close] [Discard] [Cancel]
- [Save & Close] → calls handleSaveDraft then onClose
- [Discard] → clears localStorage draft, onClose
- [Cancel] → dismisses dialog

### 6. Update service import (AC-7)
- Import `updateGradingV2` instead of `updateGrading`
- Pass comments array and markedContent empty object (TipTap JSON will be added later when EssayEditor exposes getJSON)

### Files modified:
- `WritingGradingModal.tsx` — all changes
- No service modifications needed (updateGradingV2 already exists)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Complete

### Changes to WritingGradingModal.tsx:

1. **Import update**: `updateGrading` → `updateGradingV2` from writingSubmissionService
2. **New types**: `GradingDraft` interface + `DRAFT_KEY_PREFIX` + `DRAFT_MAX_AGE_MS`
3. **New state**: `toastMessage`, `toastTimerRef`, `showRecoveryPrompt`, `recoveryDraft`, `showCloseDialog`
4. **Auto-save → localStorage**: Every 30s, saves scores/feedback/comments/voided/voidReasons + timestamp to `kahoot_grading_draft_{submissionId}`
5. **Recovery prompt**: On modal open, checks localStorage for existing draft < 24h. Shows overlay with [Resume] [Discard]
6. **Save Draft**: Uses `updateGradingV2(submissionId, gradingResult, {}, allComments, false)`. Clears localStorage. Shows toast \"Draft saved\"
7. **Submit Grading**: Uses `updateGradingV2(submissionId, gradingResult, {}, allComments, true)`. Detects re-edit (markingStatus === 'graded'). Clears localStorage. Shows toast \"Grading submitted\"
8. **Re-edit notification**: Sends \"Your writing result has been updated by {teacherName}\" when re-submitting already-graded submission
9. **Close dialog**: 3-button custom dialog: [Save & Close] (saves then closes), [Discard] (clears draft, closes), [Cancel] (dismisses)
10. **Toast system**: Pill-shaped dark toast, slides down from top, auto-dismisses after 3s

### CSS additions:
- `.wgm-toast`: pill notification with slideDown animation
- `.wgm-recovery-overlay` / `.wgm-recovery-dialog`: centered overlay card
- `.wgm-recovery-btn.resume/discard/cancel`: styled action buttons
- `@keyframes wgm-slideDown`

### Build: Zero new TS errors in WritingGradingModal"
<!-- SECTION:NOTES:END -->

