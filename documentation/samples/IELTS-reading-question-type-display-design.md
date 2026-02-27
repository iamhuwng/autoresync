# IELTS Reading Question Type Display Design

> **Purpose**: Research and design specifications for displaying each of the 16 IELTS Reading question types in a digital test interface.

---

## Overview

This document provides design specifications and UI mockups for all 16 IELTS Reading question types identified from official Cambridge test materials. Each section includes:
- **Question Type Anatomy**: How the question is structured
- **UI Component Design**: Visual design specifications
- **Mockup**: ASCII/Markdown representation of the UI
- **Implementation Notes**: Key technical considerations

---

## Design Principles (Applied to All Types)

Based on best practices for digital test interfaces:

| Principle | Application |
|-----------|-------------|
| **Clarity** | One task focus per view, minimal distractions |
| **Consistency** | Unified styling across all question types |
| **Feedback** | Immediate visual feedback on selections |
| **Accessibility** | High contrast, keyboard navigation, resizable text |
| **Progress Visibility** | Clear indication of answered/unanswered questions |

---

## Category 1: Completion Questions

### 1. Sentence Completion

**Focus**: Filling gaps with exact words from the passage (typically 1-2 words)

**Instruction Format**:
```
Complete the sentences below.
Choose ONE WORD ONLY from the passage for each answer.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 1-3                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Complete the sentences below.                          │
│     Choose ONE WORD ONLY from the passage for each answer. │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  1. The colony of ants constructs its nest using a         │
│     mixture of soil and  [_______________]  found in       │
│     the nearby forest.                                      │
│                                                             │
│  2. In winter, the species enters a state of dormancy      │
│     known as  [_______________] .                           │
│                                                             │
│  3. The primary threat to the habitat is the expansion     │
│     of local  [_______________] .                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- Input field appears inline with sentence text (not below)
- Field width should accommodate expected word count
- Clear visual distinction for input areas (border, background)
- Word limit reminder subtly visible near each input

---

### 2. Summary Completion (From Text)

**Focus**: Complete a summary paragraph using exact words from the passage

**Instruction Format**:
```
Complete the summary below.
Choose NO MORE THAN TWO WORDS from the passage for each answer.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 4-8                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Complete the summary below.                            │
│     Choose NO MORE THAN TWO WORDS from the passage         │
│     for each answer.                                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  **The History of Silk**                            │   │
│  │                                                      │   │
│  │  According to legend, silk was discovered when a   │   │
│  │  cocoon fell into an Emperor's tea. Initially,     │   │
│  │  the material was reserved strictly for            │   │
│  │  4. [_______________] . However, as production     │   │
│  │  increased, it became a form of currency and       │   │
│  │  was even used to pay 5. [_______________] . The   │   │
│  │  secret of sericulture was closely guarded, and    │   │
│  │  anyone found smuggling silkworms faced the        │   │
│  │  6. [_______________] .                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- Summary in a distinct container/card with title
- Inline inputs numbered clearly
- Paragraph maintains natural reading flow

---

### 3. Summary Completion (From a List)

**Focus**: Complete summary using provided options (A-H)

**Instruction Format**:
```
Complete the summary using the list of phrases, A–H, below.
Write the correct letter, A–H, in boxes 9–13 on your answer sheet.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 9-13                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Complete the summary using the list of phrases, A–H.   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  **Urban Heat Islands**                             │   │
│  │                                                      │   │
│  │  Cities often experience higher temperatures than   │   │
│  │  rural areas due to human activity. This causes     │   │
│  │  9. [▼ Select]  during the night. One proposed     │   │
│  │  solution is 'green roofs', which help to           │   │
│  │  10. [▼ Select]  the building's temperature.       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ List of Phrases ────────────────────────────────────┐  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐   │  │
│  │  │ A  reduce insulation│  │ E  thermal retention│   │  │
│  │  ├─────────────────────┤  ├─────────────────────┤   │  │
│  │  │ B  regulate         │  │ F  excessive cooling│   │  │
│  │  ├─────────────────────┤  ├─────────────────────┤   │  │
│  │  │ C  absorb moisture  │  │ G  increase         │   │  │
│  │  ├─────────────────────┤  │    visibility       │   │  │
│  │  │ D  solar reflection │  ├─────────────────────┤   │  │
│  │  └─────────────────────┘  │ H  urban planning   │   │  │
│  │                            └─────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Dropdown select** or **clickable letter chips** for answer selection
- Option list displayed prominently, always visible
- Two-column layout for options to save vertical space
- Clear letter labels (A, B, C...) with visual distinction
- Consider: Hover on option highlights all locations where it's used
- **Smart Dropdown Behavior**: If the question does NOT allow reusing letters, selected options are automatically removed from the dropdown menu to prevent duplicate selection errors

**Implementation Notes** (Updated 2026-02-10):
- ✅ **Flowing paragraph rendering**: Summary text rendered as ONE continuous paragraph with inline `<select>` dropdowns at each blank position (not separate question rows)
- ✅ **Group-level rendering** in `IELTSQuestionsPanel.tsx`: The `summary-completion-list` type is handled at the question-group level (similar to `matching-features`), NOT the default per-question renderer
- ✅ **ONE shared reference panel**: The "List of Phrases" panel renders ONCE below the paragraph, NOT per-question
- ✅ **Smart dropdown dedup**: Used answers are tracked across the group via `usedLetters[]`; already-used options are disabled with "(used)" label in dropdowns
- ✅ **Visual feedback on used options**: Used phrases in the reference panel get `text-decoration: line-through` + grayed color (`#94a3b8`)
- ✅ **Label stripping** (`stripOptionLabel`): Prevents double-labeling when AI generates options with existing letter prefixes (e.g., "A proof" → stripped to "proof", then displayed as "A. proof"). Handles formats: `A. text`, `A text`, `A) text`, `(A) text`
- ✅ **Two AI data formats supported**:
  - **Format A**: First question's text contains ALL `___` blanks → used as the full paragraph
  - **Format B**: Each question has its own text fragment with one blank → fragments concatenated into a single paragraph
- ✅ **Summary container card**: Bordered card (`1px solid #d1d5db`, `borderRadius: 4px`) wrapping the flowing paragraph
- ✅ **Inline question numbers**: Bold question number appears before each dropdown (e.g., `**29.** [▼ Select]`)
- ✅ **Post-submission coloring**: Question numbers turn green (correct) or red (incorrect) after submission
- ⚠️ **Not implemented**: Hover highlight across option usages (design doc suggestion)

**Key Files**:
- `IELTSQuestionsPanel.tsx` — Group-level handler for `summary-completion-list` (flowing paragraph + shared reference panel)
- `AuthenticAnswerInput.tsx` — `SummaryCompletionListInput` component (used for fallback/per-question rendering with `showReferencePanel` prop)

---

### 4. Note Completion

**Focus**: Fill gaps in bulleted/structured notes

**Instruction Format**:
```
Complete the notes below.
Choose ONE WORD AND/OR A NUMBER from the passage for each answer.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 14-17                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Complete the notes below.                              │
│     Choose ONE WORD AND/OR A NUMBER for each answer.       │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  **The Voyager Mission**                            │   │
│  │                                                      │   │
│  │  • Launch Date: 1977                                │   │
│  │                                                      │   │
│  │  • Primary Objective: To explore the                │   │
│  │    14. [_______________]  of the outer solar system│   │
│  │                                                      │   │
│  │  • Key Discovery: Found active volcanoes on Io,    │   │
│  │    a moon of 15. [_______________]                  │   │
│  │                                                      │   │
│  │  • Current Status:                                  │   │
│  │      ◦ Voyager 1 has entered                       │   │
│  │        16. [_______________]  space                 │   │
│  │      ◦ Communication takes approx. 20 hours         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- Preserve bullet point hierarchy visually
- Indentation levels clearly visible
- Input fields inline with note structure
- Consider monospace or structured font for note-like feel

---

### 5. Table Completion

**Focus**: Extracting specific data into a grid format

**Instruction Format**:
```
Complete the table below.
Choose NO MORE THAN TWO WORDS from the passage for each answer.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 18-20                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Complete the table below.                              │
│     Choose NO MORE THAN TWO WORDS for each answer.         │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────┬─────────────────┬─────────────────────┐│
│  │ Plant Species   │ Native Region   │ Medicinal Use       ││
│  ├─────────────────┼─────────────────┼─────────────────────┤│
│  │ Aloe Vera       │ North Africa    │ Soothes burns and   ││
│  │                 │                 │ skin irritations    ││
│  ├─────────────────┼─────────────────┼─────────────────────┤│
│  │ Gingko Biloba   │ 18. [________]  │ Improves cognitive  ││
│  │                 │                 │ function            ││
│  ├─────────────────┼─────────────────┼─────────────────────┤│
│  │ Echinacea       │ North America   │ Used to boost the   ││
│  │                 │                 │ 19. [__________]    ││
│  ├─────────────────┼─────────────────┼─────────────────────┤│
│  │ Turmeric        │ Southeast Asia  │ Acts as a powerful  ││
│  │                 │                 │ 20. [__________]    ││
│  └─────────────────┴─────────────────┴─────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- Clean table structure with clear borders
- Header row visually distinct (bold, background color)
- Input fields fit within cell bounds
- Zebra striping for readability (optional)
- Responsive: consider horizontal scroll on mobile

---

### 6. Flow-Chart Completion

**Focus**: Following a sequence of events or process

**Instruction Format**:
```
Complete the flow-chart below.
Choose NO MORE THAN TWO WORDS from the passage for each answer.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 21-23                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Complete the flow-chart below.                         │
│     Choose NO MORE THAN TWO WORDS for each answer.         │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  **Paper Recycling Process**                               │
│                                                             │
│         ┌────────────────────────────────┐                 │
│         │  Collection of waste paper     │                 │
│         └───────────────┬────────────────┘                 │
│                         │                                   │
│                         ▼                                   │
│         ┌────────────────────────────────┐                 │
│         │  Sorting and grading by quality│                 │
│         └───────────────┬────────────────┘                 │
│                         │                                   │
│                         ▼                                   │
│         ┌────────────────────────────────┐                 │
│         │  Pulping: Paper is mixed with  │                 │
│         │  21. [_______________] and     │                 │
│         │  water                          │                 │
│         └───────────────┬────────────────┘                 │
│                         │                                   │
│                         ▼                                   │
│         ┌────────────────────────────────┐                 │
│         │  Screening: Removal of         │                 │
│         │  contaminants such as          │                 │
│         │  22. [_______________]         │                 │
│         └───────────────┬────────────────┘                 │
│                         │                                   │
│                         ▼                                   │
│         ┌────────────────────────────────┐                 │
│         │  De-inking and Bleaching       │                 │
│         └───────────────┬────────────────┘                 │
│                         │                                   │
│                         ▼                                   │
│         ┌────────────────────────────────┐                 │
│         │  Rolling into new sheets of    │                 │
│         │  23. [_______________]         │                 │
│         └────────────────────────────────┘                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Visual flow chart** with boxes and arrows
- Could use SVG, CSS shapes, or image with overlays
- Input fields positioned within flow boxes
- Clear directional arrows (↓ or →)
- Consider: Step numbers visible for non-linear flows

---

### 7. Diagram Label Completion

**Focus**: Labeling parts of a visual diagram

**Instruction Format**:
```
Label the diagram below.
Choose ONE WORD ONLY from the passage for each answer.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 24-26                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Label the diagram below.                               │
│     Choose ONE WORD ONLY for each answer.                  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  **The Geothermal Power Plant**                            │
│                                                             │
│         ┌─────────────────────────────────────────┐        │
│         │                                         │        │
│         │     [DIAGRAM IMAGE WITH LABELS]         │        │
│         │                                         │        │
│         │      ←── 26. [___________]  zone       │        │
│         │            (spinning machine)           │        │
│         │                   │                     │        │
│         │                   │ ─── 25. [_______]   │        │
│         │                   │      well           │        │
│         │                   │                     │        │
│         │    ════════════════════════════         │        │
│         │    ▓▓▓ 24. [___________] zone ▓▓▓      │        │
│         │    (deep underground rock)              │        │
│         │                                         │        │
│         └─────────────────────────────────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Image with overlay inputs** positioned at arrow endpoints
- Labels connected by leader lines to image parts
- Input fields appear near or on the diagram
- Consider: Interactive zoom/pan for complex diagrams
- Mobile: May need scrollable or zoomable view
- **Implementation**: Use absolute positioned inputs over image, or SVG with embedded form fields

---

## Category 2: True/False/Not Given Type

### 8. True / False / Not Given

**Focus**: Verifying factual information

**Instruction Format**:
```
Do the following statements agree with the information given in Reading Passage 1?

In boxes 27–30 on your answer sheet, write
  TRUE if the statement agrees with the information
  FALSE if the statement contradicts the information
  NOT GIVEN if there is no information on this
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 27-30                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Do the following statements agree with the information │
│     given in Reading Passage 1?                            │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ◉ TRUE      – statement agrees with the information  │  │
│  │ ◉ FALSE     – statement contradicts the information  │  │
│  │ ◉ NOT GIVEN – there is no information on this        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  27. The total population of the island declined in the    │
│      1990s.                                                 │
│                                                             │
│      ┌───────────┬───────────┬───────────────┐             │
│      │ ○ TRUE    │ ○ FALSE   │ ○ NOT GIVEN   │             │
│      └───────────┴───────────┴───────────────┘             │
│                                                             │
│  28. Tourism is now the primary source of income for the   │
│      residents.                                             │
│                                                             │
│      ┌───────────┬───────────┬───────────────┐             │
│      │ ○ TRUE    │ ● FALSE   │ ○ NOT GIVEN   │             │
│      └───────────┴───────────┴───────────────┘             │
│                        ↑ (selected)                         │
│                                                             │
│  29. The government has refused to fund the new airport    │
│      project.                                               │
│                                                             │
│      ┌───────────┬───────────┬───────────────┐             │
│      │ ○ TRUE    │ ○ FALSE   │ ○ NOT GIVEN   │             │
│      └───────────┴───────────┴───────────────┘             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Radio button group** for each question
- Three options always visible: TRUE, FALSE, NOT GIVEN
- Color coding on selection (green for TRUE, red for FALSE, gray for NOT GIVEN)
- Legend/key always visible at top
- Statement text clearly readable, numbered
- Consider: Horizontal layout (shown) vs vertical stack

---

### 9. Yes / No / Not Given

**Focus**: Verifying the writer's opinions or claims (subjective)

**Instruction Format**:
```
Do the following statements agree with the claims of the writer in Reading Passage 2?

In boxes 31–34 on your answer sheet, write
  YES if the statement agrees with the claims of the writer
  NO if the statement contradicts the claims of the writer
  NOT GIVEN if it is impossible to say what the writer thinks about this
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 31-34                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Do the following statements agree with the CLAIMS of   │
│     the writer in Reading Passage 2?                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ◉ YES       – agrees with claims of the writer       │  │
│  │ ◉ NO        – contradicts claims of the writer       │  │
│  │ ◉ NOT GIVEN – impossible to say what writer thinks   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  31. The author believes that learning a second language   │
│      in adulthood is impossible.                           │
│                                                             │
│      ┌───────────┬───────────┬───────────────┐             │
│      │ ○ YES     │ ○ NO      │ ○ NOT GIVEN   │             │
│      └───────────┴───────────┴───────────────┘             │
│                                                             │
│  32. Financial incentives are the most effective way to    │
│      motivate employees.                                    │
│                                                             │
│      ┌───────────┬───────────┬───────────────┐             │
│      │ ● YES     │ ○ NO      │ ○ NOT GIVEN   │             │
│      └───────────┴───────────┴───────────────┘             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Identical structure to T/F/NG** but different labels
- Emphasize "CLAIMS of the writer" in instructions
- Component can be shared with T/F/NG (parameterized)
- Same color coding and accessibility considerations

---

## Category 3: Matching Questions

### 10. Matching Headings

**Focus**: Identifying the main idea of specific paragraphs

**Instruction Format**:
```
Reading Passage 2 has five sections, A–E.
Choose the correct heading for each section from the list of headings below.
Write the correct number, i–viii, in boxes 1–5 on your answer sheet.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 1-5                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Choose the correct heading for each section from the   │
│     list of headings below.                                │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─ List of Headings ───────────────────────────────────┐  │
│  │                                                       │  │
│  │  i.   The financial cost of space travel             │  │
│  │  ii.  The psychological effects of isolation         │  │
│  │  iii. A historical overview of rocket technology     │  │
│  │  iv.  Predicting the future of colonization          │  │
│  │  v.   The role of private companies                  │  │
│  │  vi.  Environmental concerns of launches             │  │
│  │  vii. Training astronauts for long missions          │  │
│  │  viii.International cooperation in space             │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Match each section to a heading:                          │
│                                                             │
│  ┌───────────┬────────────────────────────────────────┐    │
│  │ 1.        │   Section A   [▼ Select heading (i-viii)]│   │
│  ├───────────┼────────────────────────────────────────┤    │
│  │ 2.        │   Section B   [▼ iii                    ]│   │
│  ├───────────┼────────────────────────────────────────┤    │
│  │ 3.        │   Section C   [▼ Select heading        ]│    │
│  ├───────────┼────────────────────────────────────────┤    │
│  │ 4.        │   Section D   [▼ Select heading        ]│    │
│  ├───────────┼────────────────────────────────────────┤    │
│  │ 5.        │   Section E   [▼ ii                     ]│   │
│  └───────────┴────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Dropdown select** for each section
- Headings list always visible (sticky or in sidebar)
- **Smart Dropdown Behavior**: Since each heading can only be used once, selected headings are automatically removed from dropdown options to prevent duplicate selection
- Used headings grayed out in the reference list to show what's been selected
- Alternative: Drag-and-drop headings to sections
- Roman numerals (i, ii, iii) for heading options
- More headings than sections (some unused)

---

### 11. Matching Information

**Focus**: Finding specific details within paragraphs

**Instruction Format**:
```
Which paragraph contains the following information?
Write the correct letter, A–F, in boxes 6–9 on your answer sheet.
NB You may use any letter more than once.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 6-9                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Which paragraph contains the following information?    │
│     Write the correct letter, A–F.                         │
│                                                             │
│  ⚠️  NB You may use any letter more than once.            │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Paragraphs: [ A ][ B ][ C ][ D ][ E ][ F ]                │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  6. a mention of the specific tools used to excavate       │
│     the site                                                │
│                                                             │
│     Paragraph: [▼ Select A-F ]                              │
│                                                             │
│  7. reference to a disagreement between two leading        │
│     archaeologists                                          │
│                                                             │
│     Paragraph: [▼   C   ]                                   │
│                                                             │
│  8. an explanation of how the age of the artifacts was     │
│     determined                                              │
│                                                             │
│     Paragraph: [▼ Select A-F ]                              │
│                                                             │
│  9. examples of similar pottery found in different regions │
│                                                             │
│     Paragraph: [▼   C   ]  ← (same as Q7, allowed)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Dropdown** or **letter chip selector** for each question
- Clear "NB" note about reusing letters (highlighted)
- Paragraph reference visible at top
- Consider: Link paragraphs to passage sections

---

### 12. Matching Features

**Focus**: Categorizing statements by names, dates, or places

**Instruction Format**:
```
Look at the following statements (Questions 10–13) and the list of scientists below.
Match each statement with the correct scientist, A, B or C.
Write the correct letter, A, B or C, in boxes 10–13 on your answer sheet.
NB You may use any letter more than once.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 10-13                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Match each statement with the correct scientist.       │
│                                                             │
│  ⚠️  NB You may use any letter more than once.            │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─ List of Scientists ──────────────────────────────────┐ │
│  │                                                        │ │
│  │  A.  Dr. Alan Grant                                   │ │
│  │  B.  Prof. Ellie Sattler                              │ │
│  │  C.  Dr. Ian Malcolm                                  │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  10. Suggests that marsupials migrated from South America. │
│                                                             │
│      ┌─────┐ ┌─────┐ ┌─────┐                               │
│      │  A  │ │  B  │ │ ● C │   ← (C selected)              │
│      └─────┘ └─────┘ └─────┘                               │
│                                                             │
│  11. Argues that climate change was the main extinction    │
│      driver.                                                │
│                                                             │
│      ┌─────┐ ┌─────┐ ┌─────┐                               │
│      │  A  │ │  B  │ │  C  │                               │
│      └─────┘ └─────┘ └─────┘                               │
│                                                             │
│  12. Discovered the first fossil evidence in 1920.         │
│                                                             │
│      ┌─────┐ ┌─────┐ ┌─────┐                               │
│      │ ● A │ │  B  │ │  C  │   ← (A selected)              │
│      └─────┘ └─────┘ └─────┘                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Clickable letter chips/buttons** for quick selection
- Features list always visible at top
- Chip-based selection is faster than dropdown
- Clear visual feedback on selection
- Short option lists (3-5 items) work well with chips

---

### 13. Matching Sentence Endings

**Focus**: Connecting sentence beginnings to correct endings

**Instruction Format**:
```
Complete each sentence with the correct ending, A–F, below.
Write the correct letter, A–F, in boxes 14–16 on your answer sheet.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 14-16                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Complete each sentence with the correct ending, A–F.   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─ List of Endings ─────────────────────────────────────┐ │
│  │                                                        │ │
│  │  A. soil salinity increased to dangerous levels.      │ │
│  │  B. biodiversity in the area is protected.            │ │
│  │  C. local predators are eliminated.                   │ │
│  │  D. disruption of the local ecosystem.                │ │
│  │  E. tourism revenue is maximized.                     │ │
│  │  F. water quality improved significantly.             │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  14. The introduction of non-native species often leads to │
│      _______________                                        │
│                                                             │
│      [▼ Select ending A-F ] → D. disruption of the...      │
│                                                             │
│  15. Farmers in the region were forced to abandon their    │
│      land because _______________                           │
│                                                             │
│      [▼   A. soil salinity increased... ]                  │
│                                                             │
│  16. The government's new policy aims to ensure that       │
│      _______________                                        │
│                                                             │
│      [▼ Select ending A-F ]                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Dropdown with preview** of full ending
- Endings list always visible for reference
- Sentence beginning ends with blank line indicator
- Grammatical fit is key (shown in preview)
- **Smart Dropdown Behavior**: Since each ending can only be used once, selected endings are automatically removed from dropdown options to prevent duplicate selection
- Consider: Drag endings to sentence beginnings

---

## Category 4: Multiple Choice Questions

### 14. Multiple Choice (Standard - Single Answer)

**Focus**: Selecting one correct answer from four options

**Instruction Format**:
```
Choose the correct letter, A, B, C or D.
Write the correct letter in boxes 17–18 on your answer sheet.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 17-18                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Choose the correct letter, A, B, C or D.               │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  17. What does the writer suggest about the 'Mozart        │
│      Effect'?                                               │
│                                                             │
│      ┌─────────────────────────────────────────────────┐   │
│      │ ○ A  It has been scientifically proven to       │   │
│      │      increase IQ permanently.                   │   │
│      ├─────────────────────────────────────────────────┤   │
│      │ ● B  It is largely a myth exaggerated by the    │   │
│      │      media.    ← (selected)                     │   │
│      ├─────────────────────────────────────────────────┤   │
│      │ ○ C  It only works on children under the age    │   │
│      │      of five.                                   │   │
│      ├─────────────────────────────────────────────────┤   │
│      │ ○ D  It is more effective than learning an      │   │
│      │      instrument.                                │   │
│      └─────────────────────────────────────────────────┘   │
│                                                             │
│  18. According to the passage, early humans primarily      │
│      survived by:                                           │
│                                                             │
│      ┌─────────────────────────────────────────────────┐   │
│      │ ○ A  farming crops                              │   │
│      ├─────────────────────────────────────────────────┤   │
│      │ ○ B  trading with neighbors                     │   │
│      ├─────────────────────────────────────────────────┤   │
│      │ ○ C  hunting and gathering                      │   │
│      ├─────────────────────────────────────────────────┤   │
│      │ ○ D  fishing exclusively                        │   │
│      └─────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Radio button list** with full option text
- Clear visual distinction for selected option
- Letter labels (A, B, C, D) prominent
- Options in bordered cards for separation
- Vertical layout for long options

---

### 15. List Selection (Multiple Choice - Multiple Answers)

**Focus**: Selecting multiple correct answers from a longer list

**Instruction Format**:
```
Choose TWO letters, A–E.
Write the correct letters in boxes 19–20 on your answer sheet.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 19-20                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Choose TWO letters, A–E.                               │
│                                                             │
│  ⚠️  You must select exactly TWO options.                  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Which TWO of the following are mentioned as benefits of   │
│  the new diet?                                              │
│                                                             │
│      ┌─────────────────────────────────────────────────┐   │
│      │ ☐ A  Improved sleep quality                     │   │
│      ├─────────────────────────────────────────────────┤   │
│      │ ☑ B  Significant weight loss     ← (selected)   │   │
│      ├─────────────────────────────────────────────────┤   │
│      │ ☑ C  Reduced risk of diabetes    ← (selected)   │   │
│      ├─────────────────────────────────────────────────┤   │
│      │ ☐ D  Increased muscle mass                      │   │
│      ├─────────────────────────────────────────────────┤   │
│      │ ☐ E  Lower cholesterol levels                   │   │
│      └─────────────────────────────────────────────────┘   │
│                                                             │
│      Selected: 2/2 ✓                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Checkbox list** (not radio buttons)
- Clear instruction on required selection count
- Counter showing "Selected: X/Y"
- Visual feedback when correct count reached
- Consider: Disable further selection after limit reached, or warn

---

## Category 5: Short Answer Questions

### 16. Short Answer Questions

**Focus**: Answering direct questions with limited words

**Instruction Format**:
```
Answer the questions below.
Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage for each answer.
Write your answers in boxes 21–23 on your answer sheet.
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  Questions 21-23                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Answer the questions below.                            │
│     Choose NO MORE THAN THREE WORDS AND/OR A NUMBER        │
│     from the passage for each answer.                      │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  21. What instrument is used to measure the depth of       │
│      the ocean floor?                                       │
│                                                             │
│      Answer: [________________________]                     │
│               (max 3 words and/or a number)                │
│                                                             │
│  22. In which year did the expedition finally reach        │
│      the South Pole?                                        │
│                                                             │
│      Answer: [________________________]                     │
│               (max 3 words and/or a number)                │
│                                                             │
│  23. What is the primary diet of the giant panda?          │
│                                                             │
│      Answer: [________________________]                     │
│               (max 3 words and/or a number)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Design Notes**:
- **Text input field** below each question
- Word limit reminder below input
- Could show live word count: "2/3 words"
- Question ends with "?" (direct question format)
- Wider input than sentence completion (expects fuller answers)

---

## Implementation Priority Matrix

| Priority | Question Type | Complexity | Notes |
|----------|--------------|------------|-------|
| **P0 - Critical** | T/F/NG, Y/N/NG | Low | Shared component, most common |
| **P0 - Critical** | Multiple Choice (Single) | Low | Standard radio buttons |
| **P0 - Critical** | Sentence Completion | Medium | Inline text inputs |
| **P1 - High** | Matching Headings | Medium | Dropdown with list reference |
| **P1 - High** | Matching Information | Medium | Dropdown, reusable letters |
| **P1 - High** | Matching Features | Medium | Chip-based selection |
| **P1 - High** | Summary Completion (Text) | Medium | Paragraph with inline inputs |
| **P2 - Medium** | Summary Completion (List) | Medium | Dropdown with visible options |
| **P2 - Medium** | Matching Sentence Endings | Medium | Dropdown with preview |
| **P2 - Medium** | Note Completion | Medium | Structured bullet inputs |
| **P2 - Medium** | Table Completion | Medium | Table with inputs |
| **P2 - Medium** | List Selection (Multi-MC) | Low | Checkbox list |
| **P2 - Medium** | Short Answer | Low | Text input with counter |
| **P3 - Lower** | Flow-Chart Completion | High | Visual flow + inputs |
| **P3 - Lower** | Diagram Label | High | Image overlay inputs |

---

## Shared Component Patterns

### 1. InstructionBanner
Reusable instruction component shown at top of each question group.

```jsx
<InstructionBanner
  icon="📋"
  title="Complete the sentences below."
  subtitle="Choose ONE WORD ONLY from the passage for each answer."
  note="NB You may use any letter more than once." // optional warning
/>
```

### 2. OptionSelector
Reusable for matching/selection questions.

```jsx
<OptionSelector
  type="dropdown" | "chips" | "radio" | "checkbox"
  options={[{ label: "A", value: "a", description: "..." }]}
  selected={selected}
  onChange={handleChange}
  allowMultiple={false}
  maxSelections={1}
/>
```

### 3. InlineInput
Reusable text input for completion questions.

```jsx
<InlineInput
  questionNumber={1}
  wordLimit={2}
  value={answer}
  onChange={handleChange}
  inline={true} // appears within sentence
/>
```

### 4. TFNGSelector
Specialized component for True/False/Not Given type questions.

```jsx
<TFNGSelector
  questionNumber={27}
  statement="The total population declined in the 1990s."
  options={["TRUE", "FALSE", "NOT GIVEN"]} // or ["YES", "NO", "NOT GIVEN"]
  selected={selected}
  onChange={handleChange}
/>
```

---

## Accessibility Checklist

| Requirement | Implementation |
|-------------|----------------|
| Keyboard navigation | All inputs focusable, Tab order logical |
| Screen reader | ARIA labels on inputs, question-answer association |
| Color contrast | 4.5:1 minimum for text, 3:1 for UI components |
| Text resizing | Layouts responsive to 200% zoom |
| Focus indicators | Visible focus rings on all interactive elements |
| Error states | Clear error messages, not color-alone |

---

## Next Steps

1. **Review & Feedback**: Get user approval on these design specifications
2. **Component Library**: Build shared components (InstructionBanner, OptionSelector, InlineInput)
3. **Type-by-Type Implementation**: Implement starting with P0 priority types
4. **Testing**: Validate with real Cambridge test content
5. **Accessibility Audit**: Run automated and manual a11y tests

---

> **Document Status**: Research & Design Complete - Pending Review
> 
> **Created**: 2026-02-05
> **Based On**: Cambridge 10 Reading Tests, `IELTS-question-task-type-samples` file
