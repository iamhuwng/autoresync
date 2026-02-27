# Deep Review: IELTS Question Type Display — Design Doc vs Implementation

> **Date**: 2026-02-10
> **Scope**: All question types EXCEPT summary-completion (fixed), matching types (excluded), T/F/NG, Y/N/NG, sentence-completion
> **Files Reviewed**: `AuthenticAnswerInput.tsx`, `IELTSQuestionsPanel.tsx`, `IELTS-reading-question-type-display-design.md`

---

## Review Summary

| # | Question Type | Verdict | Issues Found |
|---|---|---|---|
| 4 | Note Completion | ⚠️ **Partial** | 3 issues |
| 5 | Table Completion | ❌ **Major Gap** | 4 issues |
| 6 | Flow-Chart Completion | ❌ **Major Gap** | 4 issues |
| 7 | Diagram Label Completion | ❌ **Major Gap** | 3 issues |
| 14 | Multiple Choice (Single) | ✅ **Good** | 1 minor issue |
| 15 | Multiple Select (Multi-MC) | ⚠️ **Partial** | 2 issues |
| 16 | Short Answer | ✅ **Good** | 1 minor issue |

---

## Detailed Review

---

### 4. Note Completion (`note-completion`)

**Design Doc Spec**:
- Preserve bullet point hierarchy visually
- Indentation levels clearly visible
- Input fields inline with note structure
- Monospace or structured font for note-like feel
- Structured notes with bullet points (`•`, `◦`) and sub-bullets

**Current Implementation**:
- Routes to `InlineContextCompletionInput` (if `___` present) or `InlineCompletionInput` (fallback)
- Renders as a plain text paragraph with an inline text input at the blank position
- No group-level handler — each question rendered individually

**Issues Found**:

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | **No structured note layout** | ⚠️ Medium | Design doc specifies bullet hierarchy (`•`, `◦`) with indentation. Current implementation renders as flat paragraph text — no visual note structure whatsoever. |
| 2 | **No monospace/structured font** | ⚠️ Low | Design doc suggests monospace or structured font for note-like feel. Uses standard Arial instead. |
| 3 | **No group-level rendering** | ⚠️ Medium | Notes should be rendered as ONE structured note block (like summary-completion-list uses ONE paragraph). Currently each question is a separate row. If the AI generates notes with a shared title/structure, this is lost. |

**Recommendation**: 
- If the AI generates note-style text with bullet markers, a group-level handler should reconstruct the note structure.
- Lower priority than table/flowchart since the inline rendering is functionally correct (students CAN answer).

---

### 5. Table Completion (`table-completion`)

**Design Doc Spec**:
- Clean table structure with clear borders
- Header row visually distinct (bold, background color)
- Input fields fit within cell bounds
- Zebra striping for readability (optional)
- Responsive horizontal scroll on mobile

**Current Implementation**:
- Routes to `InlineContextCompletionInput` (if `___` present) or `InlineCompletionInput` (fallback)
- Renders as a **plain text paragraph** with an inline text input — NO table at all
- No group-level handler

**Issues Found**:

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | **No table structure rendered** | ❌ Critical | Design doc shows a proper `<table>` with headers, rows, and cells. Implementation renders flat paragraph text with an inline input. The table structure from the question text is completely lost. |
| 2 | **No header row distinction** | ❌ Critical | No bold/colored header row because there's no table at all. |
| 3 | **No group-level rendering** | ⚠️ Medium | Table completion questions sharing the same table should be rendered as ONE table with inputs in specific cells. Currently each question is a separate flat row. |
| 4 | **No responsive handling** | ⚠️ Low | No horizontal scroll since there's no table to overflow. |

**Recommendation**:
- This requires a **dedicated group-level handler** that parses the table structure from the question text and renders an actual HTML `<table>`
- The AI would need to encode table structure in the question data (headers, rows, which cells have blanks)
- **High priority**: Table rendering as flat text is a significant deviation from IELTS format and may confuse students

---

### 6. Flow-Chart Completion (`flowchart-completion`)

**Design Doc Spec**:
- Visual flow chart with boxes and arrows
- Could use SVG, CSS shapes, or image with overlays
- Input fields positioned within flow boxes
- Clear directional arrows (↓ or →)
- Step numbers visible for non-linear flows

**Current Implementation**:
- Routes to `InlineContextCompletionInput` (if `___` present) or `InlineCompletionInput` (fallback)
- Renders as a **plain text paragraph** with an inline text input — NO flow chart visualization
- No group-level handler

**Issues Found**:

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | **No flow chart visualization** | ❌ Critical | Design doc shows boxes connected by arrows in a vertical flow. Implementation shows flat text with an input box. The flow/process structure is completely lost. |
| 2 | **No directional arrows** | ❌ Critical | No `↓` or `→` arrows between steps — just plain text. |
| 3 | **No box/card structure** | ⚠️ Medium | Each step should be in a bordered box/card. Currently renders as inline paragraph text. |
| 4 | **No group-level rendering** | ⚠️ Medium | Flowchart steps should be rendered as ONE connected flow with inputs in specific boxes. |

**Recommendation**:
- Requires a **dedicated group-level handler** to render the flow chart structure
- CSS-based approach using `border`, `border-radius`, and arrow elements (`::after` pseudo-elements) would work well
- The AI would need to mark step boundaries in the data
- **High complexity** (P3 in design doc priority matrix — acknowledged as hard)
- **Alternative**: If the test has an image of the flowchart, overlay positioned inputs on it (the `imageUrl` field exists on questions)

---

### 7. Diagram Label Completion (`diagram-labeling`)

**Design Doc Spec**:
- Image with overlay inputs positioned at arrow endpoints
- Labels connected by leader lines to image parts
- Input fields appear near or on the diagram
- Interactive zoom/pan for complex diagrams
- Use absolute positioned inputs over image, or SVG with embedded form fields

**Current Implementation**:
- Routes to `InlineContextCompletionInput` (if `___` present) or `InlineCompletionInput` (fallback)
- Renders as a **plain text paragraph** with inline text input — NO diagram
- `imageUrl` rendering exists in the default renderer but the input is NOT overlaid on the image

**Issues Found**:

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | **No image overlay inputs** | ❌ Critical | Design doc specifies inputs overlaid on diagram image at specific positions. Current implementation renders image and input as separate sequential elements — no spatial relationship. |
| 2 | **No leader lines/arrows** | ❌ Critical | No visual connection between label input and the diagram part it labels. |
| 3 | **No zoom/pan support** | ⚠️ Low | Complex diagrams may need zooming on mobile. Not implemented. |

**Recommendation**:
- This is the most complex type (P3 in design doc priority) 
- Requires coordinate data from the AI (x, y positions for each label) to position inputs over the image
- **Pragmatic approach**: Keep image + sequential inputs as current (functional even if not design-perfect), but add numbered arrows on the image pointing to labeled areas
- **Long-term**: SVG overlay with positioned input fields

---

### 14. Multiple Choice — Single Answer (`multiple-choice`)

**Design Doc Spec**:
- Radio button list with full option text
- Clear visual distinction for selected option
- Letter labels (A, B, C, D) prominent
- Options in bordered cards for separation
- Vertical layout for long options

**Current Implementation** (`MultipleChoiceInput`):
- ✅ Radio buttons with full option text
- ✅ Selected option has blue border + light blue background + bold text
- ✅ Letter labels with `hasExistingLabel` detection (prevents double-labeling)
- ✅ Options in bordered card structure (connected borders, rounded top/bottom)
- ✅ Vertical layout
- ✅ Smooth transitions (0.15s ease)

**Issues Found**:

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | **No post-submission correct/incorrect feedback** | ⚠️ Low | After submission, selected options don't show green (correct) or red (incorrect) coloring. The question NUMBER gets color from the parent, but the option card itself doesn't change color to indicate correctness. Design doc doesn't explicitly require this, but it's an expected UX pattern. |

**Verdict**: ✅ **Well implemented** — matches design doc closely. Minor enhancement opportunity.

---

### 15. List Selection — Multiple Answers (`multiple-select`)

**Design Doc Spec**:
- Checkbox list (not radio buttons)
- Clear instruction on required selection count
- Counter showing "Selected: X/Y"
- Visual feedback when correct count reached
- Disable further selection after limit, or warn

**Current Implementation** (`MultipleSelectInput`):
- ✅ Checkbox inputs (not radio buttons)
- ✅ Bordered card structure identical to multiple-choice
- ✅ Selection counter with "Selected: X/Y ✓"
- ✅ Color-coded counter (green when exact, red when over, gray otherwise)
- ✅ `hasExistingLabel` detection

**Issues Found**:

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | **Hardcoded `requiredCount = 2`** | ⚠️ Medium | Design doc says "Choose TWO letters" but the required count should be parsed from the question instruction dynamically (could be 2, 3, or even 4). Currently always shows "Selected: X/2" regardless of actual requirement. |
| 2 | **No selection limit enforcement** | ⚠️ Low | Design doc suggests "disable further selection after limit reached, or warn". Currently allows unlimited selections (only warns via the counter color). Consider disabling unchecked checkboxes when count is reached. |

**Verdict**: ⚠️ **Mostly good** — the hardcoded `requiredCount = 2` is the main issue.

---

### 16. Short Answer (`short-answer`)

**Design Doc Spec**:
- Text input field below each question
- Word limit reminder below input
- Could show live word count: "2/3 words"
- Wider input than sentence completion
- Question ends with "?" (direct question format)

**Current Implementation** (`ShortAnswerInput`):
- ✅ Full-width text input (max-width 400px, wider than completion inputs)
- ✅ Live word count: "X/3 words"
- ✅ Red warning when exceeding limit
- ✅ Focus border color change
- ✅ Standard padding/sizing

**Issues Found**:

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | **Hardcoded `maxWords = 3`** | ⚠️ Low | Design doc says "NO MORE THAN THREE WORDS AND/OR A NUMBER" but the limit should come from the question instruction. In most IELTS tests this IS 3, so the hardcoding happens to be correct for the majority case. |

**Verdict**: ✅ **Well implemented** — closely matches design doc.

---

## Cross-Cutting Issues

| # | Issue | Severity | Affected Types | Detail |
|---|---|---|---|---|
| 1 | **Hardcoded word limits** | ⚠️ Medium | `InlineCompletionInput` (maxWords=2), `ShortAnswerInput` (maxWords=3), `MultipleSelectInput` (requiredCount=2) | These should ideally be parsed from the question instruction text (e.g., "Choose ONE WORD ONLY" → 1, "NO MORE THAN TWO WORDS" → 2, "Choose THREE letters" → 3). |
| 2 | **No post-submission answer feedback at input level** | ⚠️ Medium | All completion types | After submission, the question number gets green/red, but the input field itself doesn't show the correct answer or indicate correct/incorrect visually. |
| 3 | **Completion types share one renderer** | ℹ️ Info | note, table, flowchart, diagram | All four funnel into `InlineContextCompletionInput` or `InlineCompletionInput`. They are structurally very different question types that happen to share the same flat rendering. |

---

## Priority Recommendations

### Must Fix (High Impact, Reasonable Effort)
1. **`MultipleSelectInput` hardcoded count** — Parse `requiredCount` from question instruction or add it to the Question interface. This is a functional correctness issue.

### Should Fix (Medium Impact, Medium Effort)
2. **Table Completion group renderer** — Add a group-level handler that renders actual HTML `<table>` structure if the AI data supports it.
3. **Note Completion group renderer** — Add a group-level handler that preserves bullet hierarchy if the AI data contains bullet markers.

### Nice to Have (High Effort, Lower Priority)
4. **Flow-Chart Completion visual renderer** — CSS-based flow chart with boxes and arrows. Complex but high visual impact.
5. **Diagram Label overlay** — Requires coordinate data from AI. Very complex.

### Quick Wins
6. **Dynamic word limits** — Parse `maxWords` from instruction text with a regex like `/NO MORE THAN (\w+) WORD/i`
7. **Post-submission input feedback** — Show green/red border on the input field itself after submission

---

## Conclusion

**Multiple Choice** and **Short Answer** are well-implemented and closely match the design doc. **Multiple Select** is mostly good but has a hardcoded count issue. 

The **completion category** (Note, Table, Flow-Chart, Diagram) is where the biggest gaps exist — all four types funnel into the same generic inline text input, losing their unique structural characteristics (bullet hierarchy, table grid, flow boxes, image overlays). Of these, **Table Completion** is the highest priority to fix because tables are common in real IELTS tests and the current flat rendering loses critical visual context.
