---
title: THCS Preview Diagnostic Logs
createdAt: '2026-03-03T03:05:28.176Z'
updatedAt: '2026-03-03T03:13:23.332Z'
description: >-
  Specification for adding diagnostic logs to the THCS preview feature (before
  publish) with a copy-to-clipboard button
tags:
  - spec
  - draft
  - thcs
  - preview
  - diagnostics
---
## Overview

Add a **Diagnostic Logs** panel to the THCS preview/review flow (Step 4 — THCSReviewStep) that displays a structured diagnostic dump of the test data as it will be published. This helps teachers (and developers) verify the internal data integrity before publishing, catch conversion issues, and debug AI-parsed imports.

The logs panel sits inside the **THCSReviewStep** (Step 4 of the THCS wizard) alongside existing validation, not inside the THCSPreviewOverlay (the fullscreen student preview). It includes a **Copy** button that copies the full diagnostic log to the clipboard.

## Requirements

### Functional Requirements
- FR-1: A new collapsible "Diagnostic Logs" card appears in THCSReviewStep (Step 4), below the Validation card in the left column
- FR-2: The diagnostic log displays a structured summary of the test data including:
  - Test metadata (title, grade, duration, examType, timerMode)
  - Section-by-section breakdown (name, question count, total points, point mode, layout, question types distribution)
  - Per-question detail (questionNumber, type, has correctAnswer, has options, has blankAnswers/modelAnswers/blankMapping as applicable)
  - Data integrity warnings (e.g. missing answers, mismatched point totals, empty options, questions with no type)
- FR-3: A "📋 Copy Log" button copies the entire diagnostic text to the clipboard
- FR-4: The panel is collapsed by default (accordion-style) to avoid overwhelming the Review step
- FR-5: Timestamp of when the log was generated is included
- FR-6: Show a brief success toast/feedback when log is copied

### Non-Functional Requirements
- NFR-1: No Mantine components — vanilla CSS + HTML only for the new panel (existing Mantine usage in THCSReviewStep may remain)
- NFR-2: Log generation must be synchronous with no RTDB/Firestore reads — it only inspects the in-memory `sections` and `metadata` props
- NFR-3: The copy text format must be plain text (not JSON) for easy pasting into chat/reports
- NFR-4: Must match the existing glass-card design language used in THCSReviewStep

## Acceptance Criteria

- [x] AC-1: A "Diagnostic Logs" accordion card appears in THCSReviewStep left column, collapsed by default
- [x] AC-2: Expanding the card shows structured diagnostic output covering metadata + all sections + all questions
- [x] AC-3: Data integrity warnings are highlighted (missing answers, zero points, empty question text, etc.)
- [x] AC-4: A "📋 Copy Log" button is visible and copies the full diagnostic text to clipboard
- [x] AC-5: Clicking "Copy Log" shows brief visual feedback (button text changes to "✅ Copied!" for 2 seconds)
- [x] AC-6: No new Mantine imports are added
- [x] AC-7: The diagnostic log does not trigger any side effects (no network calls, no state mutations)
- [x] AC-8: Log includes generation timestamp

## Scenarios

### Scenario 1: Teacher reviews a well-formed test
**Given** a test with 4 sections, all questions answered, all points configured
**When** the teacher expands the Diagnostic Logs panel
**Then** the log shows all green checks, full metadata, section/question breakdown, and no warnings

### Scenario 2: Teacher reviews an AI-imported test with issues
**Given** a test imported via AI text paste with some questions missing answers
**When** the teacher expands Diagnostic Logs
**Then** the log clearly highlights which questions are missing data (e.g. "Q3: type=mcq-grammar, correctAnswer=MISSING")

### Scenario 3: Teacher copies log for debugging
**Given** the Diagnostic Logs panel is expanded
**When** the teacher clicks "📋 Copy Log"
**Then** the full diagnostic text is on the clipboard, and the button briefly shows "✅ Copied!"

### Scenario 4: Panel stays collapsed during normal workflow
**Given** a teacher on Step 4 who doesn't need diagnostics
**When** they view the Review step
**Then** the Diagnostic Logs card is collapsed and does not clutter the UI

## Technical Notes

### Files to modify
- `src/components/thcs-editor/THCSReviewStep.tsx` — Add the diagnostic panel below the Warnings card in the left column (after ~line 220)

### Data available (props already on THCSReviewStep)
- `metadata: THCSTestMetadata` — title, duration, gradeLevel, examType, timerMode, etc.
- `sections: THCSSection[]` — full section array with questions
- `errors: string[]` and `warnings: string[]` — from validation hook

### Existing patterns to reuse

**Card styling** — Reuse the existing `cardStyle` object already defined in THCSReviewStep (line 92-99):
```typescript
const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(12px)',
    borderRadius: '1rem',
    border: '1px solid rgba(139,92,246,0.1)',
    padding: '1.25rem',
    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
};
```

**Accordion** — Use simple `useState<boolean>` toggle with conditional render (NOT Mantine `<Collapse>` which is not imported in THCSReviewStep). Follow the rotating ▶ chevron pattern from `THCSSetupStep.tsx` lines 229-251 but without the Mantine dependency.

**Clipboard copy** — Follow the React state pattern from `THCSSetupStep.tsx` lines 468-501:
```typescript
const [logCopied, setLogCopied] = useState(false);
// onClick:
await navigator.clipboard.writeText(logText);
setLogCopied(true);
setTimeout(() => setLogCopied(false), 2000);
```
Include the `document.execCommand('copy')` fallback for insecure contexts.

**Per-question diagnostic line** — Adopt the existing format from `THCSQuestionsStep.tsx` debug tools (line 251):
```
Q${q.questionNumber}: type=${q.type} intent=${q.intent || 'none'} answer=${q.correctAnswer || '⚠️ MISSING'}
```
Extended for phase-2 question types (verb-form, word-form, sentence-rewrite, reading-cloze-wordbank).

### Layout insertion point
Left column structure in THCSReviewStep:
1. Test Summary Card (L108-162)
2. Validation Card (L165-201)  
3. Warnings Card (conditional, L204-220)
4. **→ NEW: Diagnostic Logs Card** (insert here, after L220, before closing `</div>` of left column at L221)

### Log format (plain text)
```
═══ THCS Test Diagnostic Log ═══
Generated: 2026-03-03 10:00:00

── Metadata ──
Title: [value]
Grade: [value]
Duration: [value] min
Exam Type: [value]
Timer Mode: [value]

── Sections Overview ──
Total Sections: [N]
Total Questions: [N]
Total Points: [N]

── Section 1: PART A — PRONUNCIATION ──
  Questions: 8 | Points: 2.0 | Mode: auto | Layout: single-column
  Types: mcq-pronunciation(8)
  Q1: mcq-pronunciation | answer=A ✓
  Q2: mcq-pronunciation | answer=B ✓
  ...

── Section 2: PART B — GRAMMAR ──
  ...

── Warnings ──
  ⚠ Q15: correctAnswer is MISSING
  ⚠ Section 3: totalPoints = 0
```

### Question type answer resolution logic
Different question types store their answers in different fields:
- **MCQ types** (pronunciation, grammar, vocabulary, etc.): `q.correctAnswer` (A/B/C/D)
- **verb-form / word-form**: `q.blankAnswers` array
- **sentence-rewrite / sentence-rewrite-keyword**: `q.modelAnswers` array
- **reading-cloze-wordbank**: `q.blankMapping` record

The diagnostic log must check the correct field per question type.

### Design
- Use existing `cardStyle` from THCSReviewStep
- Accordion toggle with chevron icon (▶ collapsed, ▾ expanded) — pure CSS/state, no Mantine
- Monospace font for the log output (font-family: 'Consolas', 'Monaco', monospace)
- Copy button positioned top-right of the expanded panel header
- Copy feedback: button text changes from "📋 Copy Log" → "✅ Copied!" for 2s (React state)
## Open Questions

- [x] Should the log include the raw JSON dump alongside the human-readable format? → **No.** Keep it readable. Devs can use browser DevTools or the existing debug buttons in THCSQuestionsStep for raw JSON.
- [x] Should we add a "Download as .txt" option? → **Defer.** The copy button is sufficient for now. Can be added later if needed.
- [x] Should Mantine `<Collapse>` be used for the accordion? → **No.** It's not imported in THCSReviewStep. Use pure CSS/state toggle to comply with NFR-1 (no new Mantine imports).
- [ ] Should the existing ad-hoc debug tools in THCSQuestionsStep (L227-282) and THCSParseReviewPanel (L218-266) be consolidated or removed? → **Out of scope for this spec.** Can be addressed in a follow-up cleanup task.
