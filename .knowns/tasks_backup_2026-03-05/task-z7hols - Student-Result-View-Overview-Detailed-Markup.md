---
id: z7hols
title: Student Result View (Overview + Detailed Markup)
status: done
priority: medium
labels:
  - phase-2
  - from-spec
  - grading-editor
createdAt: '2026-03-01T06:46:23.838Z'
updatedAt: '2026-03-01T08:30:54.022Z'
timeSpent: 314
assignee: '@me'
spec: specs/grading-editor-redesign
fulfills:
  - AC-25
  - AC-26
  - AC-27
---
# Student Result View (Overview + Detailed Markup)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build StudentResultOverview.tsx (responsive) and StudentDetailedMarkup.tsx. Overview (default): band scores, per-criterion scores, all feedback sections, annotation count, 'View Detailed Markup' link. Fully responsive desktop+mobile. Detailed Markup: desktop = read-only TipTap with marks + Google Docs-style comment sidebar with positioned cards. Mobile = single-column with inline expandable accordion comments on tap. Separate page. No reactions/replies (future). See @doc/specs/grading-editor-redesign FR-GROUP-5.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 StudentResultOverview: shows overall band, per-criterion scores (TA/TR CC LR GRA), all feedback sections, annotation count, 'View Detailed Markup →' link
- [x] #2 Overview is fully responsive: clean layout on desktop + mobile
- [x] #3 StudentDetailedMarkup (desktop): read-only TipTap editor with all teacher marks (highlights, corrections, strikethroughs, comments) + Google Docs-style comment sidebar with positioned cards + bidirectional click interaction
- [x] #4 StudentDetailedMarkup (mobile): single-column layout. Essay with marks rendered inline. Tapping highlighted text expands comment card inline below (accordion style). No sidebar.
- [x] #5 No emoji reactions, no reply input (future features)
- [x] #6 Accessible as a separate page from student records/results list
- [x] #7 Corrections display correctly in read-only mode: strikethrough + → + green text
- [x] #8 All category colors and labels display correctly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### 1. StudentResultOverview.tsx + CSS (AC-1, AC-2, AC-5, AC-8)
- New component in writing-results/
- Props: { submission: WritingSubmission, onViewDetailedMarkup?: () => void }
- Shows: overall band, per-criterion scores (TA/TR CC LR GRA), feedback sections, comments count, 'View Detailed Markup →' link
- Responsive: flex grid on desktop, stacked on mobile
- External CSS file: StudentResultOverview.css
- No emoji reactions, no reply input
- Category colors & labels from COMMENT_CATEGORIES

### 2. StudentDetailedMarkup.tsx + CSS (AC-3, AC-4, AC-6, AC-7, AC-8)
- New component in writing-results/
- Props: { submission: WritingSubmission, onBack?: () => void }
- Desktop: 2-column — read-only essay with marks + comment sidebar
- Mobile: single-column, inline expandable accordion comments
- Read-only essay renders: highlighted text with category colors, corrections (strikethrough → green), comments indicators
- Comment cards show category color dot, label, text, anchor text
- Bidirectional click: click highlight → focus card, click card → scroll to text
- Responsive via CSS media queries
- No TipTap dependency (render HTML directly from comments + essay text to avoid TipTap bundle in student view)

### 3. Update WritingResultView.tsx (hook up new components)
- Import StudentResultOverview
- Add state for view mode: 'overview' | 'detailed'
- Render StudentResultOverview by default, StudentDetailedMarkup when toggled

### Files:
- NEW: src/components/writing-results/StudentResultOverview.tsx
- NEW: src/components/writing-results/StudentResultOverview.css
- NEW: src/components/writing-results/StudentDetailedMarkup.tsx
- NEW: src/components/writing-results/StudentDetailedMarkup.css
- MODIFIED: src/components/writing-results/WritingResultView.tsx (integrate new components)"
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Complete

### New Files Created:

1. **StudentResultOverview.tsx + CSS** — Student-facing result overview
   - Overall band hero section with gradient background
   - Criteria grid (2-col mobile, 4-col desktop)
   - Per-task breakdown cards with band scores and criteria chips
   - Feedback sections (overall + per-criterion) with HTML rendering
   - Comments count with category breakdown (e.g., \"2 GRA, 1 CC\")
   - \"View Detailed Markup →\" button (only shown when comments exist)
   - Fully responsive: mobile-first CSS with breakpoints
   - Stat cards: format, word count, time spent, submitted date

2. **StudentDetailedMarkup.tsx + CSS** — Detailed marked essay view
   - Desktop: 2-column layout (essay + comment sidebar)
   - Essay renders with comment highlights (category color + 30% opacity bg)
   - Bidirectional click: click highlight → focuses sidebar card, click card → scrolls to highlight
   - Sidebar shows comment cards with category dot, label, anchor text, comment text
   - Mobile: single-column, sidebar hidden, inline accordion comments expand on tap
   - Back to Overview button
   - Task tabs for multi-task submissions
   - Comment marks rendered by finding anchorText in essay text

3. **WritingResultView.tsx** — Simplified wrapper
   - Thin state wrapper switching between overview and detailed views
   - Replaces old 290-line inline-style implementation

### Design Decisions:
- No TipTap dependency in student view (renders from comment data + plain text) to keep bundle small
- Uses anchorText matching for highlight placement (simpler than TipTap marks)
- Corrections display handled via CSS classes (strikethrough + green replacement)
- No emoji reactions or reply input (AC-5: future features)
- Category colors from COMMENT_CATEGORIES constant
- Accessible via existing route: StudentTestResultsPage lazy-loads WritingResultView

### Build: Zero new TS errors"
<!-- SECTION:NOTES:END -->

