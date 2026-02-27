---
title: Legacy Exercise Types Reference
createdAt: '2026-02-27T15:25:32.752Z'
updatedAt: '2026-02-27T15:25:34.166Z'
description: Reference documentation for legacy exercise type formats and structures
tags:
  - legacy
  - exercise
  - types
  - reference
---
# Legacy Exercise Types — Display Reference

> **Purpose:** Describe how each exercise type in the legacy homework app renders visually. Use as a spec for rebuilding in kahoot.
>
> **Source files:** `js/renderers/mcqRenderer.js`, `readingRenderer.js`, `writingRenderer.js`

---

## 1. MCQ Standard

**Used for:** Vocabulary, grammar, reading comprehension MCQs, phonetics, sentence arrangement, signs & notices.

**Data:**
```js
{ qNum: 1, type: 'mcq-standard', prompt: "1. She ____ to school.", options: ["goes", "go", "going", "went"] }
// options is an Array of strings. Letters (A, B, C, D) are auto-generated from index.
```

**Layout:**
- Prompt rendered as rich HTML (can contain `<u>`, `<br>`, `<b>`, `<img>`, etc.)
- Options in a **2×2 grid** on desktop (`grid-cols-2`), **1 column** on mobile
- Each option is a `<label>` wrapping a **hidden radio** (`sr-only`)
- Label shows: `A. goes` — letter + text
- **Selected state:** Blue border + light blue background (`border-blue-500 bg-blue-50`)
- **Unselected:** Neutral border, white background

```
┌──────────────────────────────────────┐
│ 1. She ____ to school.               │
│                                      │
│ ┌─────────────┐  ┌─────────────┐    │
│ │ A. goes      │  │ B. go        │    │
│ └─────────────┘  └─────────────┘    │
│ ┌─────────────┐  ┌─────────────┐    │
│ │ C. going     │  │ D. went      │    │
│ └─────────────┘  └─────────────┘    │
└──────────────────────────────────────┘
```

**Note:** When used inside `renderReadingComprehension`, options switch to **1 column** (`grid-cols-1`) instead of 2.

---

## 2. MCQ Underline (Error Identification)

**Used for:** "Find the error" or "which underlined word needs correcting" exercises.

**Data:**
```js
{
  qNum: 1, type: 'mcq-underline',
  prompt: "She's interested in <u>photographs</u> because she wants <u>to take</u> beautiful photos.",
  options: { A: "photographs", B: "to take", C: "beautiful photos", D: "life" }
  // options is an OBJECT {letter: text}, NOT an array
}
```

**Layout:**
- Prompt contains `<u>underlined</u>` words in the sentence
- Options rendered as **horizontal inline pills** (`flex flex-wrap gap-2`) — NOT a grid
- Each pill shows: `A. photographs`
- Same hidden-radio + label pattern
- Same selected state (blue border + bg)

```
┌──────────────────────────────────────────────┐
│ She's interested in photographs because...   │
│                                              │
│ [A. photographs] [B. to take] [C. beautiful] │
│ [D. life]                                    │
└──────────────────────────────────────────────┘
```

**Key difference from MCQ Standard:** Horizontal pill layout, and `options` is an object not an array.

---

## 3. MCQ Buttons (Binary Choice)

**Used for:** "too or either" grammar exercises.

**Data:**
```js
{ qNum: 51, type: 'mcq-buttons', prompt: "1. We go to the library, and they do, ____." }
// No options field — hardcoded to "too" and "either"
```

**Layout:**
- Prompt as text
- **Two equal-width buttons** side by side (`flex gap-2`, each `flex-1`)
- Values are hardcoded: `too` | `either`
- Same hidden-radio + label pattern
- Same selected state

```
┌──────────────────────────────────────┐
│ 1. We go to the library, and they    │
│ do, ____.                            │
│                                      │
│    ┌──────────┐  ┌──────────┐       │
│    │   too     │  │  either  │       │
│    └──────────┘  └──────────┘       │
└──────────────────────────────────────┘
```

> **Rebuild note:** Consider making this a generic "N-choice button" component where the options array is configurable, not hardcoded.

---

## 4. Reading Comprehension (Two-Column Layout)

**Used for:** Passage-based MCQ, cloze tests with reading text, passage-based writing questions.

**Data:**
```js
{
  renderer: 'renderReadingComprehension',
  readingText: `<div class="bg-white p-6 rounded-xl">...long HTML passage...</div>`,
  questions: [
    { qNum: 29, type: 'mcq-standard', prompt: "29. Which is NOT mentioned?", options: [...] },
    { qNum: 41, type: 'writing', prompt: "1. How many students?" }
  ]
}
```

**Layout:**
- **Desktop:** Two-column grid (`md:grid-cols-2 md:gap-8`)
  - **Left:** Question cards stacked vertically
  - **Right:** Reading passage panel — **sticky** (`md:sticky md:top-4`), stays visible while scrolling questions
- **Mobile:** Single column — questions first, passage below
- Passage panel: `bg-slate-50 border rounded-lg p-4`
- Questions inside can be either `mcq-standard` (radio labels, 1-column) or `writing` (textarea)

```
Desktop:
┌─────────────────────┬────────────────────┐
│ Questions (Left)     │ Passage (Right)    │
│                      │                    │
│ ┌──────────────────┐ │ ┌────────────────┐│
│ │ Q29: Which...    │ │ │ Volunteering   ││
│ │  ○ A   ○ B       │ │ │ is a way to    ││
│ │  ○ C   ○ D       │ │ │ make a diff... ││
│ └──────────────────┘ │ │                ││
│ ┌──────────────────┐ │ │ (sticky, stays ││
│ │ Q30: What...     │ │ │  visible while ││
│ │  [textarea]      │ │ │  scrolling)    ││
│ └──────────────────┘ │ └────────────────┘│
└─────────────────────┴────────────────────┘

Mobile:
┌──────────────────────┐
│ Q29: Which...        │
│  ○ A   ○ B  ○ C  ○ D │
├──────────────────────┤
│ Q30: What...         │
│  [textarea]          │
├──────────────────────┤
│ Volunteering is a    │
│ way to make a...     │
└──────────────────────┘
```

**The passage `readingText` is raw HTML** — can contain headers, lists, images, styled paragraphs, anything. The teacher authors HTML directly in quiz-data.js.

---

## 5. Summary Completion — Blank in Text

**Used for:** Fill-in-the-blank where blanks are embedded inline within a paragraph of text.

**Data:**
```js
{
  renderer: 'renderSummaryCompletion',
  readingText: "Kevin works {{BLANK_21}} Hollywood. He records {{BLANK_22}} for films.",
  questions: [
    { qNum: 21, type: 'blank-in-text' },
    { qNum: 22, type: 'blank-in-text' }
  ]
}
```

**Layout:**
- The entire section is a **single styled text block** (`bg-slate-50 border rounded-lg leading-loose p-4`)
- `{{BLANK_N}}` placeholders in the text replaced with inline `<input type="text">`
- Input is **inline** within the prose — NOT a separate question card
- Input width: fixed `w-28` (~112px)
- **No question prompt** — the surrounding text IS the context

```
┌──────────────────────────────────────────────┐
│ Kevin works [________] Hollywood. He records │
│ [________] for films. He worked on his first │
│ film in 1980. He's now 51 and he [________]  │
│ helped to make more than 100 films.          │
└──────────────────────────────────────────────┘
```

---

## 6. Summary Completion — Dropdown in Text

**Used for:** Same as blank-in-text but with a **word bank** — students pick from a dropdown instead of typing.

**Data:**
```js
{
  renderer: 'renderSummaryCompletion',
  readingText: "One of the first novels {{BLANK_31}} written in England...",
  wordBank: ["However", "made", "most", "was", "much", "leaving", "wrote", "lived", "in", "the"],
  questions: [
    { qNum: 31, type: 'dropdown-in-text' },
    { qNum: 32, type: 'dropdown-in-text' }
  ]
}
```

**Layout:**
- Same single text block as blank-in-text
- `{{BLANK_N}}` replaced with inline `<select>` dropdown
- First option: `---` (empty value placeholder)
- Remaining options: all words from `wordBank`
- **Uniqueness constraint:** When a word is selected in one dropdown, it is **hidden** from all other dropdowns (not disabled — hidden). Each word can only be used once across all dropdowns.

```
┌──────────────────────────────────────────────┐
│ One of the first novels [▼ was    ] written  │
│ in England in 1719. He was born [▼ in     ]  │
│ the family of a rich man. After [▼ leaving]  │
│ school...                                    │
└──────────────────────────────────────────────┘
```

**Dropdown uniqueness logic:**
```
User selects "was" in dropdown 1
→ "was" disappears from dropdown 2, 3, 4... options
→ If user deselects "was" from dropdown 1, it reappears in all others
```

---

## 7. Writing (Standard Textarea)

**Used for:** Sentence rewriting, open-ended comprehension answers, cue-based sentence construction.

**Data:**
```js
{ qNum: 36, type: 'writing', prompt: "36. He started to work here 5 years ago.<br>=> He has" }
```

**Layout:**
- Prompt rendered as rich HTML (`<div class="font-medium">`)
- Below prompt: `<textarea rows="4">` — full width, 4 lines tall
- Standard border, rounded corners

```
┌──────────────────────────────────────┐
│ 36. He started to work here 5 years  │
│ ago.  => He has                      │
│ ┌──────────────────────────────────┐ │
│ │                                  │ │
│ │           [4-row textarea]       │ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

---

## 8. Writing Letter (Long Textarea)

**Used for:** Letter writing, essay-type questions.

**Data:**
```js
{
  qNum: 40, type: 'writing-letter',
  prompt: "Write a letter to your friend about...",
  outro: "<p class='text-sm text-slate-500'>Word limit: 100-150 words</p>"  // optional
}
```

**Layout:**
- Same as standard writing but `rows="12"` — 3× taller
- Optional `outro` HTML string **appended after** the textarea (used for word count hints, closing instructions)

```
┌──────────────────────────────────────┐
│ Write a letter to your friend...     │
│ ┌──────────────────────────────────┐ │
│ │                                  │ │
│ │                                  │ │
│ │         [12-row textarea]        │ │
│ │                                  │ │
│ │                                  │ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
│ Word limit: 100-150 words            │
└──────────────────────────────────────┘
```

---

## 9. Writing Inline (Auto-Expanding Input in Sentence)

**Used for:** Sentence completion where the student fills in the **ending** of a rewritten sentence.

**Data:**
```js
{
  qNum: 66, type: 'writing-inline',
  prompt: "1. This room is larger. <br>-> Rewrite: The room is not {{BLANK_66}}"
}
```

**Layout:**
- `{{BLANK_N}}` in the prompt is replaced with an inline `<input type="text">`
- The input has class `auto-expand-input` — it **grows wider as the student types**
- Styled as a bottom-border underline (no box border), blending into the sentence
- **No additional input below** the prompt — the inline input IS the answer field
- Auto-expand logic: on every `input` event, `el.style.width = el.scrollWidth + 'px'`

**CSS:**
```css
.auto-expand-input {
    min-width: 100px;
    border: none;
    border-bottom: 2px solid #cbd5e1;  /* underline only */
    background-color: #f1f5f9;
    padding: 4px;
}
```

```
┌──────────────────────────────────────────────┐
│ 1. This room is larger than the one at the   │
│ end of the corridor.                         │
│ -> The room at the end is not ______________ │
│                                  ↑ grows as  │
│                                    you type  │
└──────────────────────────────────────────────┘
```

---

## 10. Fill-in-Text (Single Correction Input)

**Used for:** "Find and correct the mistake" exercises — student types the corrected word.

**Data:**
```js
{ qNum: 11, type: 'fill-in-text', prompt: "1. A lot of people are good artists and they are successfully in life." }
```

**Layout:**
- Prompt as text (the sentence with the error)
- Below: `<input type="text">` — **full width**, single line
- Student types the corrected word/phrase (e.g. "successful")

```
┌──────────────────────────────────────┐
│ 1. A lot of people are good artists │
│ and they are successfully in life.   │
│ ┌──────────────────────────────────┐ │
│ │  [full-width single-line input]  │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

---

## 11. Listening Dictation (Standalone Page)

**Used for:** IELTS listening practice — dictation + comprehension questions.

> **Note:** This is a **standalone HTML page**, not using the shared renderer system. It has its own data structure and submission logic.

**Data (inline JS):**
```js
{
  id: 1,
  original: "1 Address where the robbery took place: ____ Road",
  q1: "What did the student want to do?",
  q2: "Who is the student talking to?",
  q3: "What does the officer ask the student to state?"
}
```

**Layout:**
- Each exercise is a **fieldset** with two visual levels:
  - **Main answer:** Inline blank within a sentence — `"... ____ Road"` → `<label>` text + `<input>` + remaining text, all in one horizontal row
  - **3 sub-questions:** Stacked vertically with a **left border indent** (`pl-4 border-l-2 border-slate-200`) — visually nested under the main answer
- Each sub-question: label (the question text) + full-width text input
- Audio is NOT embedded — instruction tells student where to find audio files externally

```
┌──────────────────────────────────────────────┐
│ 1 Address where the robbery took place:      │
│    [________] Road                           │
│                                              │
│   │ What did the student want to do?         │
│   │ [________________________________]       │
│   │                                          │
│   │ Who is the student talking to?           │
│   │ [________________________________]       │
│   │                                          │
│   │ What does the officer ask?               │
│   │ [________________________________]       │
│                                              │
│ 2 Address where the woman is from:           │
│    [________] Road                           │
│   │ ...                                      │
└──────────────────────────────────────────────┘
```

---

## Quick Reference Table

| # | Type | Input Widget | Layout Pattern | Options Source |
|---|------|-------------|----------------|---------------|
| 1 | `mcq-standard` | Hidden radio + label cards | 2-col grid (1-col in reading) | `options[]` array |
| 2 | `mcq-underline` | Hidden radio + pill badges | Horizontal `flex-wrap` | `options{}` object |
| 3 | `mcq-buttons` | Hidden radio + equal buttons | Horizontal `flex`, 2 buttons | Hardcoded `too`/`either` |
| 4 | Reading Comprehension | MCQ radios or textareas | **2-col: questions + sticky passage** | `readingText` HTML |
| 5 | `blank-in-text` | Inline `<input text>` in prose | Single text block | Placeholder `{{BLANK_N}}` |
| 6 | `dropdown-in-text` | Inline `<select>` in prose | Single text block | `wordBank[]` array |
| 7 | `writing` | `<textarea rows="4">` | Prompt + textarea card | — |
| 8 | `writing-letter` | `<textarea rows="12">` | Prompt + tall textarea + outro | — |
| 9 | `writing-inline` | Auto-expanding `<input>` in prompt | Prompt with inline underline input | Placeholder `{{BLANK_N}}` |
| 10 | `fill-in-text` | Full-width `<input text>` | Prompt + full-width input card | — |
| 11 | Listening dictation | Main blank + 3 sub-question inputs | Fieldset with nested indent | Inline data |

### Common Card Styling (for types 1, 2, 3, 7, 8, 9, 10)
- Each question wrapped in: `bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md`
- Questions stacked in: `grid grid-cols-1 gap-4`

### Selected State (for all MCQ types)
- Unselected: `border-2 border-transparent` (or `border-slate-200`)
- Selected: `bg-blue-50 border-blue-500`
