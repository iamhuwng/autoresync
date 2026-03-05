---
title: Grading Editor Redesign
createdAt: '2026-03-01T05:40:45.441Z'
updatedAt: '2026-03-01T06:46:38.170Z'
description: >-
  Specification for redesigning the IELTS Writing grading editor with TipTap
  rich essay editor, Google Docs-style comments, and 3-tab right panel
tags:
  - spec
  - approved
---
## Overview

Complete redesign of the IELTS Writing grading editor (`WritingGradingModal`). Replaces the current offset-based annotation system and 5 separate TipTap feedback editors with a modern 2-column layout featuring a TipTap rich essay editor (left) and a 3-tab panel (right) with Google Docs-style comments.

**Motivation:**
- Current comments render as browser `title` tooltips — invisible and unusable
- Category chips serve no visible purpose to teacher or student
- 5 separate TipTap editors for feedback are cramped (80px each) and inefficient
- Annotation toolbar is disconnected from the essay text
- No undo/redo for annotations
- ~750 lines of custom annotation rendering code that TipTap handles natively

**Clean break:** No backward compatibility with old offset-based annotations. Development period — no production data to migrate.

---

## Requirements

### Functional Requirements

#### FR-GROUP-1: Left Column — TipTap Essay Editor (55% width)

**Editor Core:**
- FR-1: Student essay text loads into a TipTap (ProseMirror) editor instance. The essay is loaded as-is, regardless of formatting (no paragraphs, weird whitespace, very short/empty text). Empty submissions show "No essay submitted" placeholder.
- FR-2: Editor is **marks-only mode** — teacher CANNOT freely type/delete/modify the student's essay text. They can ONLY apply marks (highlight, comment, strikethrough, correction, text color). The essay content itself is locked.
- FR-3: Undo/redo for all mark operations via TipTap History extension (Ctrl+Z / Ctrl+Y).

**Fixed Toolbar (top of editor):**
- FR-4: Fixed toolbar above the editor with buttons: Highlight (with color dropdown), Comment (💬), Strikethrough (~S~), Correction (✏️), Text Color (🎨 with color dropdown), Undo (↩), Redo (↪).
- FR-5: Highlight button has a **dropdown** with 6 preset color dots: 🟡 Yellow, 🟢 Green, 🔵 Blue, 🟣 Purple, 🟠 Orange, 🔴 Red. Default is yellow. Clicking the button applies the last-used color; clicking the dropdown arrow shows color options.

**BubbleMenu (floating, near text selection):**
- FR-6: TipTap's built-in BubbleMenu appears near the text selection with compact annotation buttons: Highlight, Comment, Strikethrough, Correction, Text Color. Uses TipTap's default auto-positioning (appears above selection; flips below if no space above).
- FR-7: BubbleMenu contains ONLY annotation-specific buttons (not Bold/Italic/Underline — those are for the feedback editor only).

**Mark Types:**

| Mark | Visual Rendering | Data Stored |
|------|-----------------|-------------|
| Highlight | Colored semi-transparent background (using selected color from 6 presets) | `{ color: string }` |
| Comment | Category-colored semi-transparent background + dotted bottom border (2px) + small SVG 💬 icon in left margin gutter | `{ commentId: string, color: string }` |
| Strikethrough | Line-through text decoration, gray text color (#94a3b8) | `{}` |
| Correction | Line-through text decoration + " → " + green correction text (#10b981) rendered inline at same size | `{ correctionText: string }` |
| Text Color | Changes text color to selected color | `{ color: string }` |

- FR-8: **Highlight + Comment overlap rule:** If a chunk of text is already highlighted and then part of that chunk gets a comment mark, ONLY the commented portion changes to the comment visual style (comment background + dotted border). The rest of the highlighted chunk retains its original highlight color. TipTap handles overlapping marks — comment mark takes visual priority over highlight where they overlap.

**Correction Mark Flow:**
- FR-9: Teacher selects text → clicks ✏️ Correction → a **small inline popup** appears near the selection: input field labeled "Correct to:" with an Apply button and cancel (✕). Teacher types the correction, presses Enter or clicks Apply. The original text gets strikethrough + " → " + green correction text inline at the same font size. Example: ~~becaus~~ → because.
- FR-10: The popup is positioned near the selected text (below or above based on space). Clicking outside or pressing Escape dismisses without applying.

**Comment Mark Flow (custom comment):**
- FR-11: Teacher selects text → clicks 💬 Comment in BubbleMenu or toolbar → the right panel auto-switches to Comments tab → a new focused comment card appears at the correct Y-position with an empty text input and cursor ready. Teacher types → presses Enter or clicks outside to save. Comment is uncategorized by default (gray); teacher can optionally click to assign a category (Grammar/Vocabulary/Coherence/TA or TR).

**Original / Marked Toggle:**
- FR-12: Toggle buttons above the editor: [📝 Marked] (default, active) | [📄 Original]
- FR-13: "Marked" shows the TipTap editor with all teacher marks, editable (marks-only mode).
- FR-14: "Original" shows a **read-only `<div>`** rendering the student's original unmodified submission text. No highlights, no marks, no annotations. Plain text with comfortable typography.
- FR-15: When "Original" is active, the right panel's **Comments tab becomes disabled** (grayed out, not clickable). Prompt and Scoring tabs remain enabled. If the teacher was on the Comments tab, auto-switch to Scoring tab when toggling to Original.

**Comment Gutter (left margin):**
- FR-16: Small colored dots (SVG circles) in the left margin gutter for lines that have comment marks. Color matches the comment's category color.
- FR-17: Gutter dots are **always visible** regardless of which right-panel tab is active.
- FR-18: Clicking a gutter dot → auto-switches to Comments tab + focuses the corresponding comment card.

**Quick Comments FAB:**
- FR-19: Floating circular button (💬 SVG icon) in the bottom-right corner of the essay panel. Shows text "Quick" or just the icon.
- FR-20: Clicking FAB opens a **speech-bubble dialog** (comic book bubble with tail pointing to FAB).
- FR-21: Dialog requires text to be selected first. If no text is selected when FAB is clicked, show a tooltip: "Select text first, then use Quick Comments."
- FR-22: If text IS selected → dialog opens with categorized preset chips.

**Quick Comments Dialog:**
- FR-23: Dialog shows presets organized by category with colored headers:
  - 🔴 **GRA** (Grammar — or task-specific label): Subject-verb agreement, Wrong tense, Article error (a/an/the), Run-on sentence, Fragment
  - 🟠 **LR** (Lexical Resource): Word choice, Repetitive vocabulary, Informal register, Spelling error
  - 🟢 **CC** (Coherence & Cohesion): Needs transition word, Weak paragraph structure, Unclear reference
  - 🔵 **TA** (Task Achievement for Task 1) or **TR** (Task Response for Task 2): Off-topic, Doesn't address the prompt, Missing key info
- FR-24: Category labels and abbreviations **change dynamically** based on which task is being graded (Task 1 = TA, Task 2 = TR).
- FR-25: Clicking a preset chip → auto-creates a comment mark on the selected text + creates a comment card with the preset's text and category. Dialog closes. Selection clears.
- FR-26: "➕ Create new preset..." at the bottom. Clicking shows an **inline input** inside the dialog: text field + category dropdown + Add button. New presets are saved.
- FR-27: Quick Comment presets stored in **localStorage** under key `kahoot_quick_comment_presets`. Default presets are hardcoded and cannot be deleted (marked `isDefault: true`). Custom presets can be deleted.
- FR-28: When Quick Comments dialog is dismissed without selecting a preset (click outside or Escape), the text selection in the editor is **preserved**.

**Preset Data Shape:**
```typescript
interface QuickCommentPreset {
  id: string;                  // crypto.randomUUID()
  text: string;                // "Subject-verb agreement"
  categoryId: string;          // "gra" | "lr" | "cc" | "ta" | "tr"
  categoryLabel: string;       // "GRA" — dynamic based on task
  color: string;               // "#ef4444" — category color
  isDefault: boolean;          // true = built-in, false = user-created
}
```

**Metadata Bar:**
- FR-29: Below the editor: "📝 {wordCount} words · ⏱️ {writingTime} min" in subtle gray text.

**Keyboard Shortcuts (Essay Editor):**
- FR-30: Ctrl+Z = Undo, Ctrl+Y / Ctrl+Shift+Z = Redo
- FR-31: Ctrl+Shift+H = Highlight selected text (last-used color)
- FR-32: Ctrl+Shift+M = Add comment to selection (opens comment flow)
- FR-33: Escape = Close Quick Comments dialog / unfocus comment card / dismiss correction popup

---

#### FR-GROUP-2: Right Column — 3-Tab Panel (45% width)

**Tab Bar:**
- FR-34: Three tabs: [📋 Prompt] | [💬 Comments ({count})] | [📊 Scoring]
- FR-35: Comments tab shows **total comment count** (including resolved) as badge: "Comments (5)"
- FR-36: Active tab has blue bottom border + bold text. Inactive tabs have gray text.
- FR-37: Comments tab grayed out and unclickable when "📄 Original" toggle is active on the essay.

**Tab 1: 📋 Task Prompt**
- FR-38: Displays the IELTS task prompt text (from test data).
- FR-39: Shows prompt image if applicable (e.g., Task 1 graph/chart).
- FR-40: Collapsible "▶ Model Answer" section at bottom (if model answer exists in test data).

**Tab 2: 💬 Comments — Google Docs Style**

**Comment Card States:**

*Collapsed (default for unfocused cards):*
```
┌────────────────────────────────────────┐
│ 🔴 GRA                   just now   ✕ │  ← category dot, label, time, delete
│ Subject-verb agreement — 'the da...   │  ← text truncated to 1-2 lines
└────────────────────────────────────────┘
```
- White background, subtle shadow (`0 1px 3px rgba(0,0,0,0.1)`)
- Border-radius: 8px
- Thin left border in category color (3px)
- Shows: category dot + label, relative timestamp, first 1-2 lines of text (truncated with ellipsis)
- Small ✕ delete button on hover

*Focused (when clicked):*
```
┌────────────────────────────────────────┐
│ 🔴 GRA                   just now   ⋮ │  ← 3-dot menu (Edit, Delete, Recover)
│                                        │
│ Subject-verb agreement — 'the data     │  ← full text (not truncated)
│ show' not 'the datas shows'.           │
│                                        │
│                         ✓ Resolve      │  ← resolve button
└────────────────────────────────────────┘
```
- Blue-tinted background (`#eff6ff`) or stronger blue left border
- Full comment text visible
- ⋮ three-dot menu: Edit (inline editable), Delete (soft delete), and on deleted cards: Recover
- ✓ Resolve button (text button)
- No emoji reactions (skipped for now, future feature)
- No reply input (skipped for now, future feature)

**Vertical Positioning Algorithm:**
- FR-41: Each comment card is positioned at the same Y-coordinate as its highlighted text anchor in the essay editor. Calculated via `getBoundingClientRect()` on the TipTap mark node, relative to the comment panel container.
- FR-42: **Stacking rule:** If a card's anchor Y would cause it to overlap with the previous card, push it downward: `top = Math.max(anchorY, previousCardBottom + 8px)`. Cards are ordered by their text position (top to bottom in essay).
- FR-43: When there are 20+ comments and stacking degrades (cards bunch up at the bottom), the algorithm gracefully falls back to a **simple list with even spacing**. Show a subtle note: "Comments are listed in essay order."
- FR-44: Card positions **update on scroll** via `requestAnimationFrame` — must complete within 16ms per frame.

**Bidirectional Click Interaction:**
- FR-45: **Click highlighted text** in essay → auto-switch to Comments tab (if not already active) → corresponding card expands to focused state → all other cards collapse → comment panel auto-scrolls to the focused card if needed.
- FR-46: **Click a comment card** → essay auto-scrolls to the highlighted text → highlight becomes **darker/stronger** (opacity increases from 0.2 to 0.5).
- FR-47: **Click away** (unfocus) → active card collapses, highlight returns to normal opacity.

**Bidirectional Hover Interaction:**
- FR-48: **Hover highlighted text** → corresponding sidebar card gets elevated shadow + subtle blue background flash.
- FR-49: **Hover comment card** → corresponding text highlight opacity increases slightly (0.2 → 0.35).
- FR-50: **Mouse leaves** → both return to default state.

**SVG Connecting Line:**
- FR-51: When a comment is focused AND the Comments tab is active, a dotted line renders from the right edge of the highlighted text to the left edge of the focused comment card.
- FR-52: Rendered as an SVG `<line>` element in an overlay `<svg>` with `pointer-events: none`. Stroke: `#94a3b8`, strokeWidth: 1, strokeDasharray: "4 3".
- FR-53: Only ONE line visible at a time (for the focused comment only). Line hidden when no comment is focused or when another tab is active.

**Comment Actions:**
- FR-54: **Resolve:** Clicking "✓ Resolve" fades out the comment card (300ms opacity transition), removes the comment mark from the essay text (highlight disappears), and moves the comment to "resolved" status.
- FR-55: **Filter pills** at top of comment panel: [All] [Open] [Resolved]. Default is "Open". Resolved comments shown with grayed-out style.
- FR-56: **Re-open:** Resolved comments have a "↩ Re-open" button that brings them back to active state and re-applies the mark to the essay text.
- FR-57: **Edit:** From ⋮ menu → "Edit". Comment text becomes an inline editable input in the card. Save on Enter or blur. Cancel on Escape.
- FR-58: **Delete:** From ⋮ menu → "Delete". Soft delete — card is marked as deleted, comment mark removed from essay. Deleted cards accessible via a "Deleted" state in the filter. Can be recovered via "Recover" in ⋮ menu.
- FR-59: **Category assignment:** Unfocused cards show category dot + label. Focused cards allow clicking the category label to change it via a small dropdown (GRA, LR, CC, TA/TR, or uncategorized).

**Tab 3: 📊 Scoring & Feedback**

- FR-60: **Criteria scoring panel** — 4 rows of 0-9 buttons (TA/TR, CC, LR, GRA) — component unchanged from current (`CriteriaScoringPanel.tsx`). Label for first criterion dynamically changes: "Task Achievement" for Task 1, "Task Response" for Task 2.
- FR-61: Band score auto-calculation and display — logic unchanged (`ieltsWritingBandCalculator.ts`).
- FR-62: **Single TipTap feedback editor** with tab pills: [Overall] [TA/TR] [CC] [LR] [GRA]. Active tab has filled blue background with white text. Inactive tabs have gray outline.
- FR-63: Feedback editor toolbar: [B] [I] [U] [• List] [1. List] [↩ Undo] [↪ Redo].
- FR-64: Editor area minimum height: 180px. Placeholder text: "Write your {criterionName} feedback for Task {taskNumber}..."
- FR-65: Content preserved when switching feedback tabs. Stored in state: `{ overall: string, ta: string, cc: string, lr: string, gra: string }` as TipTap HTML.
- FR-66: **Void Task button** — unchanged from current (`VoidTaskButton.tsx`).
- FR-67: **Audit Trail section** (collapsible) — unchanged from current (`GradingAuditTrail.tsx`).

---

#### FR-GROUP-3: Layout, Header & Footer

- FR-68: **Header bar:** Dark navy/slate gradient. Left: "✍️ {studentName}" with subtitle "{testTitle} · Task {n}". Right: "💾 Save Draft" (ghost button), "✅ Submit Grading" (solid blue), "✕" close button.
- FR-69: **Task tab switcher** below header: [Task 1] [Task 2] with active tab having blue underline.
- FR-70: **Task switching behavior:** Single TipTap editor instance. Switching tasks saves current task's editor content + comments + scores to an in-memory state object (keyed by task number), then loads the other task's data via `editor.commands.setContent()`. Both tasks' data held in memory (NOT separate TipTap instances).
- FR-71: **Footer bar:** Left: "Overall Band: {score}" in large text. Right: [Close] button.
- FR-72: **2-column layout:** CSS Grid — `grid-template-columns: 55% 45%` with a 1px divider between columns.
- FR-73: **Desktop only** — this editor does not need mobile responsiveness. Minimum supported width: 1024px.

---

#### FR-GROUP-4: Save, Submit & Auto-save

- FR-74: **Auto-save to localStorage** every 30 seconds. Key: `kahoot_grading_draft_{submissionId}`. Stores: TipTap editor JSON, comments array, scores object, feedback object.
- FR-75: **Save Draft** button: Persists current state to Firestore. Submission status stays "pending". Toast notification: "Draft saved."
- FR-76: **Submit Grading** button: Persists to Firestore AND marks submission as "graded". This releases the graded result to the student's view. Toast: "Grading submitted."
- FR-77: **Re-editing submitted grading:** Teachers can re-open a "graded" submission, edit marks/comments/scores/feedback, and re-submit. On re-submit, the student receives a **notification**: "Your writing result has been updated by {teacherName}."
- FR-78: **Unsaved changes warning:** If teacher has unsaved changes and clicks Close (✕), show confirmation: "You have unsaved changes. Save draft before closing?" with [Save & Close] [Discard] [Cancel].
- FR-79: **Data format:** Grading data stored as TipTap JSON document (via `editor.getJSON()`) — NOT as separate `essayText` + `annotations[]`. Comments stored as a separate array alongside the TipTap JSON.

**Comment Data Shape:**
```typescript
interface GradingComment {
  id: string;                    // crypto.randomUUID()
  text: string;                  // "Subject-verb agreement"
  categoryId: string;            // "gra" | "lr" | "cc" | "ta" | "tr" | "uncategorized"
  categoryLabel: string;         // "GRA"
  color: string;                 // "#ef4444"
  status: 'active' | 'resolved' | 'deleted';
  anchorText: string;            // The original selected text: "the datas shows"
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

#### FR-GROUP-5: Student Result View

- FR-80: **Two-view structure:**
  - **Overview** (default): Shows band scores, per-criterion scores, overall feedback, per-criterion feedback, comment count. Accessible on both desktop and mobile.
  - **Detailed Markup**: Shows the marked-up essay (TipTap in read-only mode) + comment cards. Opened by clicking "View Detailed Markup →" from Overview.

- FR-81: **Overview layout:**
```
┌──────────────────────────────────────┐
│  IELTS Writing Result                │
│  Overall Band: 6.0                   │
│                                      │
│  TA: 7  │  CC: 6  │  LR: 7  │ GRA: 5│
│                                      │
│  📝 Overall Feedback:                │
│  "Good attempt. Focus on grammar..." │
│                                      │
│  📝 Task Achievement Feedback:       │
│  "Addressed all key features..."     │
│  (etc. for each criterion)           │
│                                      │
│  💬 3 annotations on your essay      │
│                                      │
│  [View Detailed Markup →]            │
└──────────────────────────────────────┘
```

- FR-82: **Detailed Markup (desktop):** TipTap in read-only mode showing all teacher marks (highlights, corrections, strikethroughs, comment marks). Comment sidebar on the right with positioned cards (same Google Docs-style interaction: click highlight → focus card, click card → scroll to text).

- FR-83: **Detailed Markup (mobile):** Single-column layout. Essay text with marks rendered inline. Comments shown as **inline expandable cards** — tapping a highlighted word expands a comment card directly below the text inline (accordion style). No sidebar. No vertical positioning.

- FR-84: Student result view is a **separate page** (not a modal), navigated to from the student's records/results list.

- FR-85: Student **does NOT** have reactions or reply capability (future feature, skipped for now).

---

### Non-Functional Requirements

- NFR-1: Single TipTap instance for essay editor — must improve performance over current 5-instance setup.
- NFR-2: Comment card vertical positioning must update within 16ms (one animation frame) when scrolling.
- NFR-3: Editor must handle essays up to 500 words with 30+ marks without noticeable lag.
- NFR-4: Quick Comment presets persisted to localStorage. Default presets hardcoded and non-deletable.
- NFR-5: **No Mantine components** — vanilla CSS + inline styles only.
- NFR-6: All interactive elements must have unique descriptive IDs for browser testing.
- NFR-7: Grading editor is **desktop-only** (min 1024px). Student result view is **responsive** (desktop + mobile).

---

## Acceptance Criteria

- [x] AC-1: Student essay renders in a TipTap editor where teacher can apply marks but CANNOT type/delete/modify the essay text itself
- [x] AC-2: Fixed toolbar above editor provides: Highlight (6-color dropdown), Comment, Strikethrough, Correction, Text Color, Undo, Redo
- [x] AC-3: TipTap BubbleMenu appears near text selection with annotation buttons (Highlight, Comment, Strikethrough, Correction, Text Color)
- [x] AC-4: Highlight mark applies semi-transparent colored background; 6 preset colors available via dropdown
- [x] AC-5: Comment mark applies category-colored background + dotted bottom border + SVG gutter icon; links to a comment card in the sidebar
- [x] AC-6: Correction mark applies strikethrough + " → " + green correction text inline at same font size, entered via inline popup
- [x] AC-7: When highlighted text partially gets a comment, only the commented portion changes to comment style; rest retains highlight color
- [x] AC-8: "Original / Marked" toggle switches between TipTap editor and read-only original text; Comments tab disabled when viewing Original
- [x] AC-9: Quick Comments FAB opens speech-bubble dialog with categorized presets; clicking preset auto-creates comment on selected text
- [x] AC-10: Quick Comments categories dynamically use TA (Task 1) or TR (Task 2) labels
- [x] AC-11: Right panel has 3 functional tabs: Prompt, Comments (with total count badge), Scoring
- [x] AC-12: Comment cards vertically positioned to align with highlighted text anchor, with push-down stacking for overlaps
- [x] AC-13: Bidirectional click: click highlight → auto-switch to Comments tab + focus card; click card → scroll essay to highlight + strengthen highlight
- [x] AC-14: Bidirectional hover: hover highlight → card gets elevated shadow; hover card → highlight opacity increases
- [x] AC-15: SVG connecting line from focused highlight to focused card (dotted, visible only on Comments tab when focused)
- [x] AC-16: Resolve fades out card + removes mark; filter pills [All/Open/Resolved]; re-open restores card + mark
- [x] AC-17: Soft delete via ⋮ menu: card goes to "Deleted" status, recoverable
- [x] AC-18: Task switching saves/loads editor + comments + scores per-task via in-memory state swap
- [x] AC-19: Auto-save to localStorage every 30s; Save Draft to Firestore; Submit releases to student view
- [x] AC-20: Re-submitting an already-graded submission sends student a notification: "Your writing result has been updated"
- [x] AC-21: Unsaved changes warning on close
- [x] AC-22: Single tabbed feedback editor (Overall/TA or TR/CC/LR/GRA) replaces 5 separate editors; content preserved on tab switch
- [x] AC-23: Scoring panel (0-9 per criterion) and band calculation work correctly, with dynamic TA/TR label
- [x] AC-24: Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y redo, Ctrl+Shift+H highlight, Ctrl+Shift+M comment, Escape dismiss
- [x] AC-25: Student result view: Overview (scores + feedback) with "View Detailed Markup" opening full marked essay
- [x] AC-26: Student Detailed Markup on desktop: read-only TipTap + Google Docs-style comment sidebar
- [x] AC-27: Student Detailed Markup on mobile: inline expandable comment cards (accordion style), no sidebar
- [x] AC-28: Old files deleted: AnnotationToolbar.tsx, annotationRenderer.ts, AnnotatedEssayRenderer.tsx
- [x] AC-29: Undo/redo works for all mark operations in essay editor

---

## Scenarios

### Scenario 1: Teacher highlights a grammar error with a specific color
**Given** the teacher has opened the grading editor and the essay is loaded in TipTap
**When** the teacher selects "the datas shows", clicks the highlight dropdown arrow, selects 🔴 Red
**Then** the selected text gets a red semi-transparent background; Ctrl+Z undoes it

### Scenario 2: Teacher adds comment via Quick Comments preset
**Given** the teacher has selected text "becaus" in the essay
**When** the teacher clicks 💬 FAB → clicks "Spelling error" preset under LR
**Then** a comment mark appears on "becaus" (orange background + dotted border + gutter dot), a comment card appears in Comments tab with text "Spelling error" and category "LR", Comments badge increments

### Scenario 3: Teacher adds a correction
**Given** the teacher selects "In the other hand"
**When** the teacher clicks ✏️ Correction → an inline popup appears → teacher types "On the other hand" → presses Enter
**Then** the text renders as: ~~In the other hand~~ → On the other hand (strikethrough + arrow + green text)

### Scenario 4: Bidirectional click interaction from Scoring tab
**Given** the teacher is on the Scoring tab and there are 3 comments
**When** the teacher clicks a highlighted text segment in the essay
**Then** the right panel auto-switches to Comments tab, the corresponding card expands to focused state, an SVG connecting line appears, other cards collapse

### Scenario 5: Highlight + Comment overlap
**Given** text "significant increase in the population" is highlighted yellow
**When** the teacher selects "increase in" (subset) and adds a comment
**Then** "significant" stays yellow highlight, "increase in" changes to comment style (category bg + dotted border), "the population" stays yellow highlight

### Scenario 6: Teacher views original and switches back
**Given** the teacher has made several marks on the essay
**When** the teacher clicks "📄 Original"
**Then** the editor shows plain student text with no marks, Comments tab is grayed out/disabled, Scoring tab is still available
**When** the teacher clicks "📝 Marked"
**Then** the TipTap editor returns with all marks intact, Comments tab is re-enabled

### Scenario 7: Resolve and re-open a comment
**Given** a focused comment card is visible
**When** the teacher clicks "✓ Resolve"
**Then** the card fades out, the comment mark is removed from essay, card moves to "Resolved" filter
**When** the teacher clicks filter "Resolved" → clicks "↩ Re-open" on the resolved card
**Then** the card is restored, the mark is re-applied to the essay text

### Scenario 8: Task switching (Task 1 → Task 2)
**Given** the teacher has added 5 comments and scored TA:7, CC:6 on Task 1
**When** the teacher clicks the "Task 2" tab
**Then** Task 1's editor content, comments, and scores are saved to memory. Task 2's essay loads into the editor (or empty if not started). Task 2's comments and scores load. Scoring labels change from "TA" to "TR".

### Scenario 9: Auto-save and recovery
**Given** the teacher has been working for 5 minutes without clicking Save
**When** the browser crashes
**Then** on reopening the grading editor for the same submission, a prompt appears: "We found an auto-saved draft from X minutes ago. Resume?" with [Resume] [Discard]

### Scenario 10: Student views grading result on mobile
**Given** a submission has been graded and submitted
**When** the student opens the result on a mobile device
**Then** the Overview shows: band score, per-criterion scores, feedback text, "3 annotations" link
**When** the student taps "View Detailed Markup"
**Then** the essay renders with marks visible. Tapping a highlighted word expands a comment card inline below the text (accordion style)

### Scenario 11: Quick Comments FAB with no selection
**Given** no text is selected in the essay
**When** the teacher clicks the 💬 FAB
**Then** a tooltip appears: "Select text first, then use Quick Comments" — dialog does NOT open

### Scenario 12: Teacher re-edits submitted grading
**Given** the teacher has previously submitted grading for this essay
**When** the teacher re-opens the submission and makes changes, then clicks "Submit Grading"
**Then** the updated grading is saved, the student receives a notification: "Your writing result has been updated by {teacherName}"

---

## Technical Notes

- **TipTap extensions needed:** StarterKit (with History), Underline, Highlight (multicolor), TextStyle + Color, BubbleMenu, Placeholder, custom `commentMark`, custom `correctionMark`
- **Comment positioning:** Use `getBoundingClientRect()` on TipTap mark DOM nodes. Update positions on scroll via `requestAnimationFrame`. Degrade to list layout at 20+ comments.
- **Data format:** Grading stores TipTap JSON (`editor.getJSON()`) + comments array (separate). NOT offset-based annotations.
- **SVG overlay:** Single `<svg>` with `pointer-events: none` over both columns. One `<line>` at a time for focused comment.
- **Auto-save key:** `kahoot_grading_draft_{submissionId}` in localStorage.
- **Quick Comment presets key:** `kahoot_quick_comment_presets` in localStorage.
- **Marks-only mode:** TipTap's `editable: true` but with custom inputRules and keymap that prevent text insertion/deletion. Only marks can be applied/removed. Alternatively, use a custom ProseMirror plugin that filters transactions to reject content changes.

---

## File Changes

### Delete
| File | Why |
|------|-----|
| `AnnotationToolbar.tsx` (~506 lines) | Replaced by BubbleMenu + Quick Comments |
| `annotationRenderer.ts` (~181 lines) | TipTap handles mark rendering |
| `AnnotatedEssayRenderer.tsx` (~61 lines) | Replaced by TipTap EditorContent |
| Old `FeedbackPanel.tsx` (~170 lines) | Replaced by single tabbed editor |
| `writingAnnotationService.ts` (category CRUD) | Categories replaced by Quick Comments presets |

### Create
| File | Purpose |
|------|---------|
| `EssayEditor.tsx` | TipTap editor with custom marks, BubbleMenu, fixed toolbar, gutter |
| `CommentSidebar.tsx` | Comment panel with positioned cards, filter, connecting lines |
| `CommentCard.tsx` | Individual card: collapsed/focused states, edit, resolve, delete |
| `QuickCommentsDialog.tsx` | Speech bubble preset dialog with categories |
| `ConnectionLines.tsx` | SVG overlay for highlight → card connecting line |
| `CorrectionPopup.tsx` | Inline popup for entering correction text |
| New `FeedbackPanel.tsx` | Single tabbed TipTap editor for criterion feedback |
| `commentMark.ts` | Custom TipTap mark extension |
| `correctionMark.ts` | Custom TipTap mark extension |
| `StudentResultOverview.tsx` | Student result overview page (responsive) |
| `StudentDetailedMarkup.tsx` | Student marked essay view (desktop sidebar + mobile accordion) |

### Modify
| File | Change |
|------|--------|
| `WritingGradingModal.tsx` | New 2-column + 3-tab layout, state management |
| `WritingGradingModal.css` | Complete restyle |
| `ielts-writing.types.ts` | New GradingComment type, QuickCommentPreset, remove old WritingAnnotation |
| `writingSubmissionService.ts` | Store TipTap JSON + comments array |

### Unchanged
| File | Status |
|------|--------|
| `CriteriaScoringPanel.tsx` | ✅ Same (except dynamic TA/TR label) |
| `VoidTaskButton.tsx` | ✅ Same |
| `GradingAuditTrail.tsx` | ✅ Same |
| `ieltsWritingBandCalculator.ts` | ✅ Same |

---

## Open Questions

- [ ] Should resolved comments be visible to students in the result view, or only active comments?
- [ ] Should Quick Comments presets eventually sync across devices via Firestore (future enhancement)?
