---
id: p5cs6u
title: Add Diagnostic Logs Panel to THCSReviewStep
status: done
priority: medium
labels:
  - from-spec
  - thcs
  - diagnostics
createdAt: '2026-03-03T03:17:14.066Z'
updatedAt: '2026-03-03T03:28:36.222Z'
timeSpent: 157
assignee: '@me'
spec: specs/thcs-preview-diagnostic-logs
fulfills:
  - AC-1
  - AC-2
  - AC-3
  - AC-4
  - AC-5
  - AC-6
  - AC-7
  - AC-8
---
# Add Diagnostic Logs Panel to THCSReviewStep

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a collapsible "Diagnostic Logs" card to the THCSReviewStep left column (after the Warnings card). The card generates a structured plain-text diagnostic dump of test metadata, section breakdown, and per-question data integrity. Includes a "📋 Copy Log" button with visual feedback. Uses pure CSS accordion (no Mantine Collapse), existing cardStyle, and monospace log output. Single-file change: src/components/thcs-editor/THCSReviewStep.tsx
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Create `generateDiagnosticLog(metadata, sections)` helper that produces the full plain-text log string
- [x] #2 Handle all question types: MCQ → correctAnswer, verb-form/word-form → blankAnswers, sentence-rewrite → modelAnswers, cloze-wordbank → blankMapping
- [x] #3 Add collapsed-by-default accordion card with rotating ▶/▾ chevron toggle (pure state, no Mantine)
- [x] #4 Render log in monospace <pre> block inside the card
- [x] #5 Add "📋 Copy Log" button with clipboard write + fallback + "✅ Copied!" feedback (2s timeout)
- [x] #6 Insert card after Warnings section in left column (~line 220)
- [x] #7 Include generation timestamp in log output
- [x] #8 No new Mantine imports, no network calls, no state mutations
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add state: `diagnosticsOpen` (boolean, default false), `logCopied` (boolean, default false)
2. Create `generateDiagnosticLog(metadata, sections, errors, warnings)` helper function:
   - Header with timestamp
   - Metadata block (title, grade, duration, examType, timerMode)
   - Sections overview (totals)
   - Per-section breakdown with question type distribution
   - Per-question detail with answer resolution (MCQ/fill-in/rewrite/cloze)
   - Data integrity warnings
3. Add the accordion card JSX after the Warnings card (~line 220):
   - Use existing `cardStyle`
   - Accordion header with ▶/▾ chevron + "Diagnostic Logs" label + Copy button
   - Conditional render of log content (not Mantine Collapse)
   - Monospace `<pre>` block for the log
4. Implement copy handler with `navigator.clipboard.writeText` + `document.execCommand` fallback
5. Verify: no new Mantine imports, no side effects, build passes
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation complete in single edit to THCSReviewStep.tsx:
- Added `generateDiagnosticLog()` helper (~95 lines) that handles all 5 question type families
- Added collapsible accordion card with ▶ chevron rotation animation
- Monospace <pre> block with dark theme (#1e293b bg)
- Copy button with navigator.clipboard + execCommand fallback
- No new imports added, no Mantine dependencies
- TypeScript compiles cleanly (0 errors)



CORRECTION: User clarified the feature belongs in THCSPreviewOverlay (the preview modal opened from Step 2), NOT THCSReviewStep (the review/publish step). Reverted all changes from THCSReviewStep and re-implemented in THCSPreviewOverlay.tsx instead. The diagnostic panel now lives in the preview sidebar, below the Submit button, as a collapsible section with ▶ accordion, monospace log output, and Copy button.
<!-- SECTION:NOTES:END -->

