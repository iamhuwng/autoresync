---
title: THCS Diagnostic Logs Consolidation
createdAt: '2026-03-04T17:55:20.108Z'
updatedAt: '2026-03-04T17:58:15.929Z'
description: >-
  Consolidate 7 scattered diagnostic copy buttons into a single comprehensive
  diagnostics panel in the THCS test editor
tags:
  - spec
  - approved
---
## Overview

The THCS test creation flow currently has **7 diagnostic copy buttons** scattered across 3 components (`THCSParseReviewPanel`, `THCSQuestionsStep`, `THCSPreviewOverlay`). These buttons produce overlapping, redundant outputs and are placed in suboptimal locations. This spec consolidates them into a single comprehensive diagnostics panel in the editor, enriches the parser debug data with missing pipeline metadata, and removes dead diagnostic UI from the transient parse review modal.

**Goal:** One button, one comprehensive log, one location — plus an independent diagnostics panel in the preview overlay.

## Requirements

### Functional Requirements

- FR-1: **Enrich `__PARSE_DEBUG`** — Add `provider` (which AI model was used: `'groq'` | `'gemini'` | `'regex-fallback'`), `parseDurationMs` (wall-clock time from parse start to finish), and `reclassifications` (array of `{ questionNumber, from, to, reason }` entries from type reclassification) to the `window.__PARSE_DEBUG` object set in `thcsDocumentParser.service.ts`.

- FR-2: **Create shared `generateDiagnosticLog()` utility** — A pure function in a new file `src/services/test-creation/thcs-diagnostic-log.ts` that accepts `{ parseDebug: __PARSE_DEBUG data, sections: THCSSection[], metadata: THCSTestMetadata }` and returns a single structured plain-text diagnostic log. The log format must include:
  1. Header with generation timestamp
  2. Parse pipeline info (provider, input/cleaned length, confidence, duration)
  3. Metadata (title, grade, duration, exam type, timer mode, school/province if set)
  4. Sections overview (count, total questions, total points)
  5. Per-section detail (name, type + confidence, Q count, points, layout, passage info)
  6. Per-question detail (number, type, intent, answer status with value preview, option count)
  7. Data integrity warnings (missing answers, zero-point sections, empty sections)
  8. Footer

- FR-3: **Editor diagnostics panel** — Replace the 3 debug buttons in `THCSQuestionsStep.tsx` (lines 227-282) with a collapsible "🔍 Diagnostics" accordion panel in the **section sidebar** (below the section navigator, above the "Add Section" button). The panel contains:
  - A collapsed-by-default accordion header showing "🔍 Diagnostics"
  - When expanded: a "📋 Copy Full Log" button + a `<pre>` block showing the diagnostic log
  - The "Copy Full Log" button copies the output of `generateDiagnosticLog()` and shows brief "✅ Copied!" feedback (2s timeout)

- FR-4: **Remove parse review debug buttons** — Remove the entire debug tools `<div>` (lines 218-266) from `THCSParseReviewPanel.tsx`. This panel is inside a transient modal that disappears when the user clicks "Edit in Full Editor →". Diagnostic data is still preserved in `window.__PARSE_DEBUG` and accessible from the editor.

- FR-5: **Preserve preview diagnostics** — Do NOT modify `THCSPreviewOverlay.tsx`. Its diagnostics accordion serves a different purpose (preview-time validation) and already has a good UX pattern.

### Non-Functional Requirements

- NFR-1: No new npm dependencies
- NFR-2: No Mantine imports in new files (use vanilla HTML/CSS for the diagnostics panel in `THCSQuestionsStep`)
- NFR-3: `generateDiagnosticLog()` must be a pure function with no side effects — no DOM access, no clipboard operations
- NFR-4: The diagnostic log text must be ≤ 200 lines for a typical 50-question test
- NFR-5: Existing `THCSPreviewOverlay` diagnostics must continue working unchanged

## Acceptance Criteria

- [x] AC-1: `window.__PARSE_DEBUG` includes `provider` field (`'groq'` | `'gemini'` | `'regex-fallback'`) after any parse operation.
- [x] AC-2: `window.__PARSE_DEBUG` includes `parseDurationMs` field (number) measuring wall-clock parse duration.
- [x] AC-3: `window.__PARSE_DEBUG` includes `reclassifications` array (may be empty) with entries `{ questionNumber, from, to, reason }`.
- [x] AC-4: `thcs-diagnostic-log.ts` exports `generateDiagnosticLog()` that returns a structured plain-text string covering pipeline info, metadata, sections, questions, and warnings.
- [x] AC-5: `THCSQuestionsStep` shows a collapsible "🔍 Diagnostics" accordion in the section sidebar, collapsed by default.
- [x] AC-6: Expanding the accordion shows a "📋 Copy Full Log" button and a `<pre>` block with the diagnostic log text.
- [x] AC-7: Clicking "Copy Full Log" copies the diagnostic text to clipboard and shows "✅ Copied!" for 2 seconds.
- [x] AC-8: The 3 debug buttons in `THCSParseReviewPanel.tsx` (lines 218-266) are removed.
- [x] AC-9: The 3 debug buttons in `THCSQuestionsStep.tsx` (lines 227-282) are removed and replaced by the new diagnostics panel.
- [x] AC-10: `THCSPreviewOverlay.tsx` diagnostics accordion is unchanged and still functional.
- [x] AC-11: No new Mantine imports are added in any file.

## Scenarios

### Scenario 1: Teacher pastes text and checks diagnostics in editor

**Given** a teacher has pasted test text and the AI parser has completed (parse review modal dismissed)
**When** the teacher is in Step 2 (Questions editor) and expands the "🔍 Diagnostics" accordion in the sidebar
**Then** they see a structured diagnostic log showing: AI provider used, parse confidence, section breakdown, per-question answer status, and any data warnings
**And** they can click "📋 Copy Full Log" to copy everything to clipboard in one action

### Scenario 2: Teacher reports a parsing bug

**Given** a teacher notices incorrect question types or missing answers in the editor
**When** they expand Diagnostics and click "📋 Copy Full Log"
**Then** the copied text contains all information needed to diagnose the issue: which AI provider was used, what types were detected, what reclassifications occurred, and which questions are missing answers

### Scenario 3: Parse review panel has no debug clutter

**Given** a teacher has just parsed text and sees the parse review modal
**When** they review sections, confidence badges, and answer key grid
**Then** there are no debug tool buttons visible — the UI is clean and focused on review actions (type override badges, paste keys, Back/Proceed buttons)

### Scenario 4: Preview diagnostics unchanged

**Given** a teacher opens the student preview overlay
**When** they expand the "🔍 Diagnostics" accordion in the preview sidebar
**Then** the existing diagnostic log and copy button work exactly as before — no regressions

### Scenario 5: No parse debug data available

**Given** a teacher is in the editor with a test loaded from template (no AI parse was performed)
**When** they expand the "🔍 Diagnostics" accordion
**Then** the pipeline section shows "No parse data available" and the rest of the log still shows section/question details from the current editor state

## Technical Notes

### Files to modify

| File | Change |
|------|--------|
| `thcsDocumentParser.service.ts` | Add `provider`, `parseDurationMs`, `reclassifications` to `__PARSE_DEBUG` |
| `thcs-type-classifier.ts` | Export reclassification events (currently silent) |
| New: `thcs-diagnostic-log.ts` | Shared `generateDiagnosticLog()` utility |
| `THCSParseReviewPanel.tsx` | Remove debug tools div (lines 218-266) |
| `THCSQuestionsStep.tsx` | Remove debug tools div (lines 227-282), add diagnostics accordion to sidebar |

### Data flow

```
parseThcsText()
  ├─ records provider, startTime, reclassifications
  └─ sets window.__PARSE_DEBUG = { ...existing, provider, parseDurationMs, reclassifications }

THCSQuestionsStep
  ├─ reads window.__PARSE_DEBUG (parse-time data)
  ├─ reads sections prop (current editor state)
  └─ calls generateDiagnosticLog({ parseDebug, sections, metadata }) → plain text
```

### Diagnostics accordion placement (THCSQuestionsStep sidebar)

```
┌─ Section Navigator ──────────┐
│  [1] PHONETICS    5Q · 5pts  │
│  [2] GRAMMAR      15Q · 15pts│
│  ...                         │
│  [+ Add Section]             │
│                              │
│  ─── separator ───           │
│  ▶ 🔍 Diagnostics  [📋 Copy]│
│  ┌─ (expanded) ────────────┐ │
│  │ <pre> log text </pre>   │ │
│  └─────────────────────────┘ │
└──────────────────────────────┘
```

### `__PARSE_DEBUG` enrichment

```typescript
// In parseThcsText(), add timing:
const parseStart = Date.now();
// ... existing pipeline ...
const parseDurationMs = Date.now() - parseStart;

// Track provider:
let usedProvider: 'groq' | 'gemini' | 'regex-fallback' = 'regex-fallback';

// Track reclassifications (from thcs-type-classifier):
// reclassifyByContent() should return events, not just mutate
```

## Open Questions

- [ ] Should `THCSPreviewOverlay` also use the shared `generateDiagnosticLog()` utility? (Would reduce duplication but couples it to the shared function's format)
- [ ] Should the diagnostic log include a "Raw JSON" section at the bottom for advanced debugging, or keep it strictly human-readable?
