# PRD-0028: THCS-THPT Test System — Phase 2 (Full Widget Set + Grading System)

**Version:** 1.0
**Created:** 2026-02-26
**Author:** AI (via Socratic PRD Process — 8 rounds, 70+ decisions)
**Status:** Draft
**Priority:** High (Core Feature Expansion)
**Scope:** Phase 2 of 3 — Full Widgets + Grading + Versioning + Preview
**Depends on:** PRD-0027 (Phase 1) — MUST be fully implemented before starting Phase 2

---

## 1. Introduction / Overview

Phase 1 (PRD-0027) established the THCS-THPT test system foundation: data model, form-based visual editor (MCQ only), student test-taking view, MCQ auto-grading, and results display. Phase 2 expands this foundation with:

1. **Three new question widgets**: Fill-in text input (verb/word form), sentence rewriting (write-inline), and cloze word bank (dropdown) — covering the remaining 3 of 17 task types
2. **AI-assisted grading**: Fuzzy matching for fill-in answers + LLM-escalation for sentence rewriting, with a teacher grading queue
3. **Grading tab**: New tab in Teacher Lobby header for reviewing and batch-grading pending items
4. **Monitor integration**: THCS-specific progress display in the live session monitor, with inline writing grading as students submit
5. **Delta-based versioning**: Changelog recording on publish + version dropdown UI + assignment version pinning
6. **Preview as student**: Static preview (Phase 2A) → interactive preview (Phase 2B)

### Phasing Overview

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 (PRD-0027) | Data model, editor (MCQ only), student MCQ view, auto-grading, results | ✅ Implemented |
| **Phase 2 (this PRD)** | Fill-in + writing widgets, AI grading, Grading tab, monitor, versioning, preview | 🔜 Current |
| Phase 3 (PRD-0029) | Homework, notifications, library, course integration, shuffling, templates, bulk ops | Planned |

---

## 2. Goals

1. **G1:** Enable teachers to create fill-in (verb/word form), sentence rewriting, and cloze word bank questions in the visual editor, completing all 17 THCS-THPT task types.
2. **G2:** Auto-grade fill-in questions via string normalization + fuzzy matching + AI-suggested alternative answers, with teacher approval workflow.
3. **G3:** Provide AI-assisted sentence rewriting grading with confidence thresholds and teacher review escalation.
4. **G4:** Add a "Grading" tab in the Teacher Lobby header for batch-grading pending items across all tests.
5. **G5:** Integrate THCS-THPT progress tracking into the live session monitor, with inline writing grading as students submit.
6. **G6:** Implement delta-based version changelog on publish, with version dropdown and assignment version pinning.
7. **G7:** Add preview-as-student capability: static preview in a fullscreen overlay (Phase 2A), upgraded to interactive simulation (Phase 2B).

---

## 3. User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|------------|
| US-16 | Teacher | Add verb-form questions with `___` blank markers and multiple acceptable answers | I can test grammar skills with automatically graded fill-in questions |
| US-17 | Teacher | Add word-form questions where students supply the correct word form | I can test vocabulary transformation skills |
| US-18 | Teacher | Add sentence rewriting questions with given start (E1) or keyword (E2) | I can test sentence transformation skills |
| US-19 | Teacher | Add cloze word bank reading passages with dropdown blanks | I can test reading comprehension with word bank exercises |
| US-20 | Teacher | See AI-suggested alternative acceptable answers for my fill-in questions | I don't miss valid student answers |
| US-21 | Teacher | Review and grade writing answers in a dedicated Grading tab | I can efficiently batch-grade pending items |
| US-22 | Teacher | Grade writing answers during live sessions as students submit | I can provide immediate feedback without waiting |
| US-23 | Teacher | See a version history of my test and view old versions | I can track changes and revert if needed |
| US-24 | Teacher | Preview my test as a student before publishing | I can verify the student experience is correct |
| US-25 | Student | Fill in blanks with my own text answers (verb/word form) | I can demonstrate my grammar and vocabulary knowledge |
| US-26 | Student | Rewrite sentences with a given start or keyword | I can demonstrate my sentence transformation skills |
| US-27 | Student | Select words from a dropdown word bank to fill passage blanks | I can complete cloze reading exercises |
| US-28 | Student | See partially graded results with "pending review" badges | I know which questions are still being graded |
| US-29 | Student | Get notified when my writing grade is updated by the teacher | I see my final score promptly |

---

## 4. Functional Requirements

### 4.1 Fill-in Text Input Widget (B3: Verb Form, B4: Word Form)

#### 4.1.1 Editor Block

Add a new question type block to the editor when `type === 'verb-form'` or `type === 'word-form'`:

```
┌─ Q15 ─────────────────────────────────────── [⬆️][⬇️][🗑️] ───┐
│ Type: [verb-form ▼]                                            │
│                                                                │
│ Sentence: [She ___ (teach) English since she ___ (graduate).]  │
│                                                                │
│ Blanks detected: 2                                             │
│ Blank 1: Correct answer(s): [has taught] [+] (add alternative) │
│ Blank 2: Correct answer(s): [graduated]  [+] (add alternative) │
│                                                                │
│ 🤖 AI Suggestions: (click to add)                              │
│   Blank 1: "has been teaching" (95%), "taught" (72%)           │
│   Blank 2: (none - high confidence single answer)              │
│                                                                │
│ Points: [auto] / [manual: ___]                                 │
└────────────────────────────────────────────────────────────────┘
```

**Behaviors:**

- **Sentence input**: Single text input. Teacher uses `___` (triple underscore) to mark blank positions. System auto-detects blank count.
- **Multiple blanks per question**: Supported. Each blank gets its own "Correct Answer(s)" field. The sentence "She ___ English since she ___" produces 2 blanks.
- **Correct answers**: Multi-value input. Teacher types an answer, presses Enter to add it. Multiple acceptable answers per blank (e.g., ["has taught", "has been teaching"]).
- **AI suggestions**: After teacher provides at least one correct answer per blank, a "🤖 Suggest Alternatives" button triggers the AI service (`aiService` singleton from `src/services/ai/router.service.ts` — routes through Gemini + Groq with automatic fallback and multi-key rotation) to generate additional acceptable variants. Teacher clicks a suggestion to approve it (adds to acceptable list) or dismisses it.
- **Validation (on publish)**:
  - ❌ Block: Sentence has no `___` markers
  - ❌ Block: Any blank has zero correct answers
  - ⚠️ Warn: AI suggestions available but not reviewed

#### 4.1.2 Student View

```
┌─────────────────────────────────────────────────────────────┐
│ Question 15.                                                │
│ Supply the correct form of the verbs in brackets.           │
│                                                             │
│ She [___________] (teach) English since                     │
│ she [___________] (graduate).                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- Each `___` renders as a text input field (min-width: 120px, expands with content)
- Input is inline within the sentence text
- On mobile: inputs stack below the sentence fragment they belong to
- Inputs are clearly styled (bottom border, light background) to distinguish from static text
- Tab key moves between blanks sequentially

#### 4.1.3 Data Model Extension

Add to `thcs-test.types.ts`:

```typescript
/**
 * Fill-in-text question (B3: verb-form, B4: word-form)
 * Extends THCSQuestion with fill-in-specific fields
 */
// New fields on THCSQuestion (added alongside existing MCQ fields):
// When type === 'verb-form' or type === 'word-form':

// The sentence with ___ markers for blanks
// sentenceTemplate: string;  // e.g., "She ___ (teach) English since she ___ (graduate)."

// Correct answers per blank (indexed by blank position, 0-based)
// blankAnswers: Array<{
//   acceptedAnswers: string[];          // ["has taught", "has been teaching"]
//   aiSuggestions?: Array<{
//     answer: string;
//     confidence: number;              // 0-1
//     approved: boolean;               // Teacher approved
//   }>;
// }>;
```

> ⚠️ Implementation note: These fields are ADDED to the existing `THCSQuestion` interface as optional fields. They are only populated when `type === 'verb-form'` or `type === 'word-form'`. MCQ fields (`options`, `correctAnswer`) remain unused for these types.

#### 4.1.4 Student Answer Storage

```
RTDB: game_sessions/{sessionCode}/students/{studentId}/
  answers: {
    "15": ["has taught", "graduated"],  // Array of strings, one per blank
    ...
  }
```

For fill-in questions, the answer value is an **array of strings** (one per blank) instead of a single letter. The grading service detects the question type and handles accordingly.

#### 4.1.5 Auto-Grading Logic

```typescript
// In thcsAutoMarking.service.ts — extend gradeQuestion():

function gradeFillInQuestion(
  studentAnswers: string[],
  blankAnswers: BlankAnswer[],
  pointsPerBlank: number
): { pointsEarned: number; blankResults: BlankResult[] } {
  return blankAnswers.map((blank, index) => {
    const studentAnswer = normalizeAnswer(studentAnswers[index] || '');
    const isCorrect = blank.acceptedAnswers.some(
      accepted => normalizeAnswer(accepted) === studentAnswer
    );
    return { isCorrect, pointsEarned: isCorrect ? pointsPerBlank : 0 };
  });
}

// normalizeAnswer(): trim, lowercase, strip trailing punctuation,
// collapse multiple spaces, handle Vietnamese keyboard diacritics,
// handle hyphenated alternatives ("hasn't" vs "has not")
// Reuse existing normalizeAnswer() from autoMarking.service.ts
```

### 4.2 Sentence Rewriting Widget (E1: Given Start, E2: Keyword)

#### 4.2.1 Editor Block

```
┌─ Q41 ─────────────────────────────────────── [⬆️][⬇️][🗑️] ───┐
│ Type: [sentence-rewrite ▼]                                     │
│                                                                │
│ Original Sentence: [Camping is cheaper than staying in a hotel]│
│ Sentence Starter:  [Camping is not]                            │
│                                                                │
│ Model Answer(s):                                               │
│ [as expensive as staying in a hotel] [+]                       │
│ [as costly as staying in a hotel]    [+]                       │
│                                                                │
│ 🤖 AI Suggestions: "as dear as staying in a hotel" (68%)      │
│                                                                │
│ Points: [1.0]                                                  │
└────────────────────────────────────────────────────────────────┘
```

For E2 (keyword):

```
┌─ Q42 ─────────────────────────────────────── [⬆️][⬇️][🗑️] ───┐
│ Type: [sentence-rewrite-keyword ▼]                             │
│                                                                │
│ Original Sentence: [She prefers coffee to tea.]                │
│ Keyword:           [RATHER]                                    │
│                                                                │
│ Model Answer(s):                                               │
│ [She would rather drink coffee than tea.] [+]                  │
│                                                                │
│ Points: [1.0]                                                  │
└────────────────────────────────────────────────────────────────┘
```

**Behaviors:**
- **E1 (sentence-rewrite)**: "Sentence Starter" field is required. In student view, the starter is displayed as fixed non-editable text, and the student types the continuation in an inline input.
- **E2 (sentence-rewrite-keyword)**: "Keyword" field is required. In student view, the keyword is displayed above a full-width text input as a reminder (e.g., "Using: RATHER"). Student types the complete rewritten sentence.
- **Model answers**: Teacher provides 1+ model answers. AI can suggest additional variants based on the model.
- **AI suggestions**: Generated on demand via `aiService` (same dual-provider router — Gemini + Groq with key rotation and fallback). Lower confidence than fill-in due to semantic variability.

#### 4.2.2 Student View

**E1 (Given Start):**
```
┌─────────────────────────────────────────────────────────────┐
│ Question 41.                                                │
│ Rewrite the sentence so that it has the same meaning.       │
│                                                             │
│ Camping is cheaper than staying in a hotel.                  │
│ → Camping is not [_________________________________]        │
│                    (inline continuation input)               │
└─────────────────────────────────────────────────────────────┘
```

**E2 (Keyword):**
```
┌─────────────────────────────────────────────────────────────┐
│ Question 42.                                                │
│ Rewrite the sentence using the given word.                  │
│                                                             │
│ She prefers coffee to tea.                                  │
│ Using: RATHER                                               │
│ [____________________________________________]              │
│  (full-width text input)                                    │
└─────────────────────────────────────────────────────────────┘
```

#### 4.2.3 Grading — Two-Tier AI Approach

Per locked decision (Q16d + Conflict 2 from Phase 1 PRD §11):

```
Tier 1: String Similarity (Fast, Client-side)
  ├── Normalize student answer + model answer(s)
  ├── Compute: token overlap, Levenshtein distance, word order similarity
  ├── Confidence score = weighted average of metrics
  ├── If confidence ≥ 80% → AUTO-GRADE (correct)
  ├── If confidence < 30% → AUTO-GRADE (incorrect)
  └── If 30% ≤ confidence < 80% → ESCALATE to Tier 2

Tier 2: LLM Semantic Comparison (via aiService router — Gemini first, Groq fallback)
  ├── Send: original sentence, model answer(s), student answer
  ├── Prompt: "Is this rewrite semantically equivalent? Score 0-100"
  ├── If LLM score ≥ 80% → AUTO-GRADE (correct)
  ├── If LLM score < 50% → AUTO-GRADE (incorrect)
  └── All other cases → FLAG for teacher review
```

**Default behavior for sentence rewriting (E1, E2)**: Always flag for teacher review UNLESS teacher explicitly enables auto-grading for that section via a toggle in the editor.

**Implementation**: Create `src/services/thcsWritingGrading.service.ts`:
- Uses the `aiService` singleton from `src/services/ai/router.service.ts` (NOT a specific provider directly). The router handles Gemini-first with Groq fallback, multi-key rotation, exhausted key tracking, and retry logic.
- New method: `gradeWritingAnswer(studentAnswer, modelAnswers, originalSentence): GradingResult`
- The `aiService` router already handles per-key rate limiting and exhausted key cooldown. Add an application-level throttle: max 10 LLM grading calls per minute per teacher session (prevent batch-grading abuse). Use a simple client-side token bucket.
- **Fallback behavior**: If both Gemini AND Groq are exhausted (all keys rate-limited), fall back to string-similarity-only grading. Flag all results as "AI Unavailable — Manual Review Required" with an amber badge in the grading UI.
- **Provider awareness**: The grading service does NOT need to know which provider is used. It calls `aiService.parseChunk()` or a new `aiService.gradeWritingAnswer()` method that the router dispatches to whichever provider is available.

#### 4.2.4 Student Answer Storage

```
RTDB: game_sessions/{sessionCode}/students/{studentId}/
  answers: {
    "41": "as expensive as staying in a hotel",   // E1: continuation only (starter excluded)
    "42": "She would rather drink coffee than tea.", // E2: full rewritten sentence
    ...
  }
```

#### 4.2.5 Real-Time Sync for Writing

Per locked decision (Q53c): Writing answers sync every **10 seconds** (debounced, not on every keystroke) to avoid teacher seeing incomplete sentences in the monitor. MCQ and fill-in sync immediately (same as IELTS).

Implementation: In `THCSTestLayout.tsx`, the auto-save hook must differentiate by question type:
```typescript
// MCQ + fill-in: save on every change (debounced 500ms)
// Writing (sentence-rewrite, sentence-rewrite-keyword): save every 10 seconds
```

### 4.3 Cloze Word Bank Widget (C2: reading-cloze-wordbank)

#### 4.3.1 Editor Block

```
┌─ Section C: Reading Cloze ───────────────────────────────────┐
│ Passage:                                                     │
│ [The Amazon rainforest is the ___(1)___ tropical rainforest  │
│  in the world. It ___(2)___ an area of 5.5 million km².     │
│  Many ___(3)___ of animals live there.]                      │
│                                                              │
│ Word Bank: [largest] [covers] [species] [small] [destroy]    │
│            [+ Add Word]                                      │
│                                                              │
│ Blank Mapping:                                               │
│  Blank 1 → Correct: [largest]                                │
│  Blank 2 → Correct: [covers]                                 │
│  Blank 3 → Correct: [species]                                │
│  Distractors: [small] [destroy]                              │
│                                                              │
│ ⚙️ Word Bank Settings:                                       │
│   ☑ Allow word reuse (word stays in bank after selection)     │
│   Duplicate word count: "the" × 2                            │
└──────────────────────────────────────────────────────────────┘
```

**Behaviors:**
- **Passage input**: Teacher types passage text with `___(N)___` markers for numbered blanks
- **Word bank**: Teacher adds words. Some are correct answers, others are distractors
- **Blank mapping**: For each blank, teacher selects the correct word from the word bank
- **Duplicate words**: Per locked decision (EC14): if two blanks share the same correct answer (e.g., "the" appears twice), the word bank shows "the (×2)" to indicate count. Alternatively, words are NOT removed from the bank when selected (reusable), controlled by teacher toggle.
- **Validation**: ❌ Block if any blank has no correct word assigned. ⚠️ Warn if word bank has no distractors.

#### 4.3.2 Student View

Per locked decision (Q46a): **Dropdown** for each blank.

```
┌─────────────────────────────────────────────────────────────┐
│ Read the passage and fill in each blank with a word from    │
│ the word bank.                                              │
│                                                             │
│ Word Bank: | largest | covers | species | small | destroy | │
│                                                             │
│ The Amazon rainforest is the [▼ largest ▼] tropical         │
│ rainforest in the world. It [▼ Select ▼] an area of 5.5    │
│ million km². Many [▼ Select ▼] of animals live there.      │
└─────────────────────────────────────────────────────────────┘
```

- Each blank renders as a `<select>` dropdown with all word bank items as options
- First option is "Select" (placeholder, no value)
- If word reuse is disabled: selected words are grayed out (disabled) in other dropdowns
- Words remain visible in the word bank header for reference

#### 4.3.3 Auto-Grading

Exact match (case-insensitive) between selected word and the correct word for each blank. Standard MCQ-style grading — no AI needed.

### 4.4 Partially Graded Results State Machine

Per locked decision (Conflict 3 from Phase 1 PRD §11):

```typescript
export type THCSGradingStatus =
  | 'submitted'         // Student submitted, no grading yet
  | 'auto-graded'       // MCQ + fill-in auto-graded, writing not yet processed
  | 'partially-graded'  // Some writing graded by teacher, some pending
  | 'fully-graded';     // All questions graded (MCQ auto + writing manual)
```

**State transitions:**
```
Student submits
  → 'submitted'
    → MCQ + fill-in auto-graded immediately
      → If test has NO writing questions: 'fully-graded' (immediate)
      → If test HAS writing questions: 'auto-graded'
        → Teacher grades first writing Q: 'partially-graded'
          → Teacher grades last writing Q: 'fully-graded'
```

**Results page behavior per state:**
- `auto-graded`: "Score: 7/8 MCQ • 2 writing questions pending review"
- `partially-graded`: "Score: 7.8/10 (1 question pending review)"
- `fully-graded`: "Final Score: 8.3/10"

The denominator is ALWAYS the total possible points. Pending questions show 0 points until graded. Student sees a "Partial" badge that changes to "Final" when fully graded.

### 4.5 Grading Tab in Teacher Lobby

#### 4.5.1 Route & Placement

Per user decision (Q4): The Grading tab is a new item in the **TeacherHeader navigation**, alongside Materials, Classes, Courses, Homework, Students.

```
┌───────────────────────────────────────────────────────────────┐
│ Materials | Classes | Courses | Homework | 📝 Grading | Students │
└───────────────────────────────────────────────────────────────┘
```

**Route:**
```
/teacher/grading
```

> ⚠️ **Integration Safety Rule #1:** This route MUST be added to the route registry (`src/constants/routes.ts`), `App.jsx`, and `routeAccess.test.ts`.

**Files to modify:**
- `src/constants/routes.ts` — Add `TEACHER_GRADING: '/teacher/grading'`
- `src/components/navigation/TeacherNavigation.tsx` — Add "Grading" nav button (with badge count for pending items)
- `src/components/navigation/TeacherHeader.tsx` — Add to `mobileMenuItems` array
- `App.jsx` — Add route with `TeacherGuard`

#### 4.5.2 Grading Tab Layout

Per locked decisions (Q32c, Q33d + EC8):

```
┌───────────────────────────────────────────────────────────────┐
│ 📝 Grading                              [Needs Review ▼ filter] │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ View: [By Test ●] [By Question ○]                            │
│                                                               │
│ ┌─ Đề kiểm tra giữa kì 1 - Lớp 9 ──────────────────────┐  │
│ │ Grading: ████████████████░░░  67% (23/35 answers)      │  │
│ │ 15 students  •  12 pending  •  Deadline: 2 days        │  │
│ │ [Open Grading →]                                        │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                               │
│ ┌─ Ôn tập Unit 5 - Lớp 10 ──────────────────────────────┐  │
│ │ Grading: ██████████████████████  100% (All graded)     │  │
│ │ 28 students  •  0 pending  •  ✅ Complete               │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                               │
│ (lazy-load more on scroll...)                                │
└───────────────────────────────────────────────────────────────┘
```

**By-Question Batch Mode:**
```
┌───────────────────────────────────────────────────────────────┐
│ By Question: Q41 (Sentence Rewrite) — 28 answers pending     │
│                                                               │
│ ┌─ Student 1 ──────────────────────────── Score: [_] / 1.0 ─┐│
│ │ Original: "Camping is cheaper than staying in a hotel."    ││
│ │ Model:    "Camping is not as expensive as staying..."      ││
│ │ Student:  "Camping is not as cheap as staying..."          ││
│ │ AI Score: 45% (flagged)    Feedback: [________________]    ││
│ │ Score: [0] [0.25] [0.5] [0.75] [●1.0]  [✅ Submit Grade]  ││
│ └────────────────────────────────────────────────────────────┘│
│                                                               │
│ ┌─ Student 2 ──────────────────────────── Score: [_] / 1.0 ─┐│
│ │ ...                                                        ││
│ └────────────────────────────────────────────────────────────┘│
│                                                               │
│           (side-by-side comparison for efficient grading)     │
└───────────────────────────────────────────────────────────────┘
```

**Behaviors:**
- **Default view**: By test, sorted by approaching deadlines first, then newest submissions
- **"Needs Review" filter**: Toggle to show only tests with pending grading items
- **Lazy-load on scroll**: Firestore cursor pagination, 20 items per page
- **Badge count**: TeacherNavigation shows unread pending count on the Grading icon (e.g., "📝 12")
- **By-question batch mode**: Within a test, switch to by-question view. All student answers for the selected question displayed side-by-side. Score slider + feedback textarea per student.
- **Aggregate counts**: Per-test progress bars, auto-sort by approaching deadlines
- **Data source**: Results from both live sessions (`game_sessions/` results) AND homework submissions (`homework_submissions/` — Phase 3). In Phase 2, only session results appear. Phase 3 adds homework results.

#### 4.5.3 Grading Submission Flow

When teacher submits a grade for a writing question:

1. Update the question's `pointsEarned` in the result record
2. Update the `gradingStatus` (see §4.4 state machine)
3. If `gradingStatus` transitions to `fully-graded`: recalculate `scaledScore`
4. **Auto-notify the student immediately** (per Q17a): Call `notificationService.createNotification()` with type `'grade_updated'`
5. If grading tab: no additional action needed. If monitor page: same flow.

### 4.6 THCS Test Monitor Integration

#### 4.6.1 Foundation

Per user decision (Q14): The THCS test monitor should be **developed from the existing IELTS Reading Monitor** (`TeacherTestMonitorPage.tsx`) as an extension, not a replacement.

The existing monitor shows:
- Grid of student progress cards
- Session controls (pause, extend, end)
- Pagination for large classes
- Student detail modal with answer review

#### 4.6.2 THCS-Specific Additions

When the session's test has `testType === 'THCS-THPT'`, the monitor adds:

**Student Progress Card — THCS variant:**
```
┌─ Nguyễn Văn A ──────────────────────────────────────────┐
│ ████████████████████████░░░░ 32/40 answered (80%)        │
│                                                          │
│ Part A: 4/4 ✅  Part B: 14/16  Part C: 10/12  Part D: 4/8│
│                                                          │
│ 📝 Writing: 0/2 submitted                                │
│ Status: ● In Progress                   [View Details →] │
└──────────────────────────────────────────────────────────┘
```

After student submits:
```
┌─ Nguyễn Văn A ──────────────────────────────────────────┐
│ ✅ Submitted  •  Auto Score: 7/8 MCQ  •  2 writing pending│
│                                                          │
│ Part A: 0.8/1.0  Part B: 3.5/4.0  Part C: 2.5/3.0      │
│ Part D: 🔸 Pending (2 writing Qs)                        │
│                                                          │
│ [Grade Writing →]                    [View Full Results →]│
└──────────────────────────────────────────────────────────┘
```

**"Grade Writing" inline panel:**

Per locked decision (Q34d): **Progressive unlock** — as each student submits, their writing becomes gradeable individually. NOT gated on all students submitting.

When teacher clicks "Grade Writing" on a submitted student's card:

```
┌─ Grading: Nguyễn Văn A — Q41 ────────────────────────────┐
│ Original: "Camping is cheaper than staying in a hotel."   │
│ Model Answer: "Camping is not as expensive as staying..." │
│                                                           │
│ Student's Answer:                                         │
│ "Camping is not as cheap as staying in a hotel."          │
│                                                           │
│ AI Confidence: 45% (Flagged for review)                   │
│                                                           │
│ Score: [0] [0.25] [0.5] [0.75] [1.0]  slider             │
│ Feedback: [_______________________________________]       │
│                                                           │
│ [Skip] [Submit Grade ✅]                                   │
└───────────────────────────────────────────────────────────┘
```

- Score slider with preset increments (0, 0.25, 0.5, 0.75, 1.0) + optional custom decimal input
- Feedback textarea (optional, shown to student in results)
- "Skip" moves to next writing question or next student
- Each graded question auto-saves and updates the student's score in real-time

#### 4.6.3 THCS Monitor — Student Detail Modal

When teacher clicks "View Details" on a student card, the existing `StudentDetailModal` must handle THCS data:

- Show answers grouped by section (not flat list)
- MCQ answers show correct/incorrect indicators
- Fill-in answers show student answer vs correct answer
- Writing answers show student answer, model answer, grade (if graded), feedback
- Section score breakdown at the bottom

### 4.7 Delta-Based Version Changelog

#### 4.7.1 Changelog Implementation (on Publish)

Per locked decision (Q37 redesign) from Phase 1 PRD §4.1.3:

When teacher re-publishes an edited test:

1. Load current RTDB test data
2. Diff current vs new draft (deep comparison)
3. Record changed fields in `_changelog/v_{timestamp}`:

```typescript
// In thcsTestStorage.ts — extend publishTest():

async function publishTestUpdate(testId: string, newData: THCSTest, teacherUid: string): Promise<void> {
  const currentRef = ref(database, `tests/${testId}`);
  const currentSnap = await get(currentRef);
  const currentData = currentSnap.val();

  // Compute diff: only fields that changed
  const previousValues = computeDelta(currentData, newData);

  if (Object.keys(previousValues).length > 0) {
    const changelogEntry: ChangelogEntry = {
      publishedAt: Date.now(),
      publishedBy: teacherUid,
      label: `Edit #${changelogCount + 1} — ${Object.keys(previousValues).length} fields changed`,
      previousValues,
    };

    // Write changelog entry (append-only)
    const changelogRef = ref(database, `tests/${testId}/_changelog/v_${Date.now()}`);
    await set(changelogRef, changelogEntry);
  }

  // Overwrite current test data
  await set(currentRef, { ...newData, _changelog: currentData._changelog });
}
```

**Delta computation**: Use `~` separator for nested paths:
```typescript
function computeDelta(oldData: any, newData: any, prefix = ''): Record<string, any> {
  const delta: Record<string, any> = {};
  // Deep recursive comparison
  // Key format: "sections~0~questions~2~correctAnswer": "B" (old value)
  // null value means the field didn't exist before (addition)
  return delta;
}
```

#### 4.7.2 Version Dropdown UI

In the editor, when editing an existing published test:

```
┌─ Version History ──────────────────────────────────────────┐
│ Current (latest)                                     ▼     │
│ ├── v3: Edit #3 — 2 fields changed (2026-02-26 14:30)    │
│ ├── v2: Edit #2 — 5 fields changed (2026-02-25 10:15)    │
│ └── v1: Original publish (2026-02-24 09:00)               │
│                                                            │
│ [View Selected Version] [Compare with Current]             │
└────────────────────────────────────────────────────────────┘
```

- Dropdown lists all changelog entries by timestamp + label
- "View Selected Version": reconstructs the old version by applying deltas backward from current
- "Compare with Current": shows side-by-side diff of changed fields
- Read-only viewing — teacher cannot revert to old version from this UI (manual re-edit required for now)

#### 4.7.3 Assignment Version Pinning

When a test is assigned to a session or homework:

```typescript
// Assignment record stores:
{
  testId: "test_abc123",
  versionKey: "v_1708900000",   // Changelog key at assignment time
  _cachedVersion: { ... },      // Pre-computed full test data at this version
}
```

- `_cachedVersion` is computed once at assignment time by applying deltas backward from current to `versionKey`
- Student loads from `_cachedVersion` directly — no reconstruction on every load
- If teacher re-publishes after assignment, students still see the pinned version

### 4.8 Preview as Student

#### 4.8.1 Phase 2A: Static Preview (Fullscreen Overlay)

Per user decision (Q5c): Render actual `THCSTestLayout` component in read-only mode, in a fullscreen overlay.

**Implementation:**

Add a "Preview" button to the editor toolbar:
```
[Save Draft] [Preview 👁️] [Publish]
```

On click:
1. Convert current editor state to `THCSTest` format (same as publish, but without saving)
2. Open a fullscreen overlay (`position: fixed; inset: 0; z-index: 1000`)
3. Render `THCSTestLayout` with props:
   - `testData`: the converted test data
   - `readOnly={true}`: disables answer selection, submit button, timer
   - `previewMode={true}`: shows "PREVIEW MODE" banner, hides session-specific UI
4. "Close Preview / Back to Editor" button at top

```
┌───────────────────────────────────────────────────────────────┐
│ 🔍 PREVIEW MODE — This is how students will see your test     │
│                                          [✕ Close Preview]    │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ (Full THCSTestLayout rendered here in read-only mode)         │
│                                                               │
│ [Section tabs] [Question navigation] [Questions]              │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

#### 4.8.2 Phase 2B: Interactive Preview

After Phase 2A is complete, upgrade to interactive simulation:

- Timer starts and counts down
- Options are clickable (answers are recorded locally, not saved)
- Section navigation works
- "Submit" shows a mock results page with the teacher's answer key
- Rendered by instantiating `THCSTestLayout` with:
  - `previewMode={true}`, `readOnly={false}`
  - Mock session data (no real RTDB connection)
  - Mock student ID

### 4.9 Two-Column Layout Activation

Phase 1 defined `layout: 'single-column' | 'two-column'` on `THCSSection` but only implemented single-column. Phase 2 activates two-column for reading sections.

**Auto-default behavior** (per Q3, option c):
- When a section is created → default layout based on the first question's intent:
  - Reading intents (`reading-cloze-mcq`, `reading-comprehension`, `reading-announcement`, `reading-cloze-wordbank`) → default to `two-column`
  - All other intents → default to `single-column`
- Teacher can override at any time via the Layout radio buttons in the section block
- Changing intents later does NOT auto-change layout (teacher's explicit choice is preserved)

**Two-column rendering** (already defined in Phase 1 PRD §4.3.4):
- Desktop: passage sticky on left, questions scrollable on right
- Mobile (<768px): single-column with floating "📖 Show Passage" button
- Implemented in existing `THCSPassagePanel.tsx` — the component already supports both modes

### 4.10 Mixed Question Type Sections

Phase 2 introduces the possibility of sections with mixed question types (MCQ + fill-in, or MCQ + writing).

**Section instruction handling for mixed types:**
- When a section has mixed question types, the auto-generated instruction is set to a **generic template**: "Complete the following questions."
- Validation warning: "⚠️ This section has mixed question types — the auto-generated instruction may not be accurate. Consider writing a custom instruction."
- Teacher can always write a custom instruction (existing Phase 1 behavior)

### 4.11 Answer Key Panel Extension

Phase 1's `THCSAnswerKeyPanel.tsx` only supports MCQ answer keys (A/B/C/D radio buttons). Phase 2 must extend this panel to handle all question types.

#### 4.11.1 Current State (Phase 1)

The existing Answer Key Panel:
- Collapsible grid at bottom of editor
- Shows all questions with A/B/C/D radio buttons
- `onUpdateAnswer(sectionIndex, questionIndex, answer: 'A'|'B'|'C'|'D')` callback
- Displays answered/missing count

#### 4.11.2 Extended Answer Key Panel (Phase 2)

The Answer Key Panel must detect each question's type and render the appropriate input:

```
┌─ 🔑 Answer Key ──────────────── 35/40 answered | 5 missing ─┐
│                                                    [▼ Toggle] │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ MCQ Questions (existing):                                     │
│ Q1: ○A ●B ○C ○D    Q2: ○A ○B ●C ○D    Q3: ●A ○B ○C ○D     │
│ Q4: ○A ○B ○C ●D    Q5: ○A ●B ○C ○D    ...                   │
│                                                               │
│ Fill-in Questions:                                            │
│ Q15: Blank 1: [has taught, has been teaching] [+]             │
│      Blank 2: [graduated] [+]                                 │
│ Q16: Blank 1: [friendly] [+]                                  │
│      🤖 [Suggest Alternatives]                                │
│                                                               │
│ Writing Questions:                                            │
│ Q41: Model: [as expensive as staying in a hotel] [+]          │
│ Q42: Model: [She would rather drink coffee than tea.] [+]     │
│      🤖 [Suggest Alternatives]                                │
│                                                               │
│ Cloze Word Bank:                                              │
│ Q24: Blank 1 → [largest ▼]   Q25: Blank 2 → [covers ▼]      │
│ Q26: Blank 3 → [species ▼]                                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Type-specific answer key inputs:**

| Question Type | Answer Key Input | Data Storage |
|---------------|-----------------|---------------|
| MCQ (all A-D types) | Radio buttons A/B/C/D (existing) | `correctAnswer: 'A'\|'B'\|'C'\|'D'` |
| Fill-in (verb/word form) | Multi-value text input per blank, [+] to add alternatives | `blankAnswers[].acceptedAnswers: string[]` |
| Sentence rewriting (E1/E2) | Multi-value text input for model answers, [+] to add alternatives | `modelAnswers: string[]` |
| Cloze word bank | Dropdown per blank (options = word bank) | `blankMapping: Record<number, string>` |
| Sentence ordering | Select from pre-defined arrangements (A/B/C/D) | `correctAnswer: 'A'\|'B'\|'C'\|'D'` (same as MCQ) |

**Behaviors:**
- **Grouping**: Questions are grouped by type within the panel for visual clarity (MCQ section, Fill-in section, Writing section, Cloze section)
- **Inline editing**: All answer key inputs are editable directly in the panel (no modal needed)
- **Sync**: Editing an answer in the panel updates the corresponding question block in the editor, and vice versa. Both are bound to the same state.
- **AI suggestions button**: Appears per fill-in/writing group. Clicking triggers `aiService` to suggest alternatives for all questions in that group. Teacher approves/dismisses per suggestion.
- **Validation count**: The "answered/missing" counter checks each type appropriately:
  - MCQ: has `correctAnswer` set
  - Fill-in: every blank has ≥1 accepted answer
  - Writing: has ≥1 model answer
  - Cloze: every blank mapped to a word

#### 4.11.3 Implementation

Modify `src/components/thcs-editor/THCSAnswerKeyPanel.tsx`:

```typescript
// Extend the props interface:
interface THCSAnswerKeyPanelProps {
  sections: THCSSection[];
  onUpdateAnswer: (sectionIndex: number, questionIndex: number, answer: 'A' | 'B' | 'C' | 'D') => void;
  // NEW Phase 2 callbacks:
  onUpdateFillInAnswers?: (sectionIndex: number, questionIndex: number, blankIndex: number, answers: string[]) => void;
  onUpdateModelAnswers?: (sectionIndex: number, questionIndex: number, modelAnswers: string[]) => void;
  onUpdateClozeMapping?: (sectionIndex: number, questionIndex: number, blankIndex: number, word: string) => void;
  onRequestAISuggestions?: (sectionIndex: number, questionIndex: number) => void;
}
```

The panel detects question type via `question.type` and renders the appropriate input.

**Files to create/modify:**
- `src/components/thcs-editor/THCSAnswerKeyPanel.tsx` — **MODIFY** (extend with type-specific inputs)
- `src/components/thcs-editor/THCSFillInAnswerInput.tsx` — **NEW** (multi-value text input sub-component)
- `src/components/thcs-editor/THCSWritingAnswerInput.tsx` — **NEW** (model answer text input sub-component)
- `src/components/thcs-editor/THCSClozeAnswerInput.tsx` — **NEW** (word bank dropdown sub-component)

---

## 5. Non-Goals (Out of Scope for Phase 2)

1. **NOT Phase 2:** Homework assignment flow → Phase 3
2. **NOT Phase 2:** Notification system (beyond auto-notify on grade update) → Phase 3
3. **NOT Phase 2:** Question shuffling / mã đề → Phase 3
4. **NOT Phase 2:** THCS-THPT library with filtering → Phase 3
5. **NOT Phase 2:** Course integration → Phase 3
6. **NOT Phase 2:** Bulk question creation (Add N / quick-paste) → Phase 3
7. **NOT Phase 2:** Test templates → Phase 3
8. **NOT Phase 2:** Document-to-test auto-parser → Phase 3 (§4.12)
9. **NOT Phase 2:** Drag-and-drop reordering (up/down buttons sufficient) → Phase 3
10. **NOT Phase 2:** Version revert (teacher can view old versions but not one-click revert) → future

---

## 6. Design Considerations

### 6.1 UI Consistency
- New widget editor blocks follow the same form-based pattern as MCQ blocks from Phase 1
- Grading tab uses the same `Card`, `Button` components from `src/components/modern`
- Color scheme for grading states matches Phase 1 question navigation colors

### 6.2 Responsive Design
- Fill-in text inputs on mobile: full-width below sentence fragment
- Sentence rewriting inputs: full-width on all screen sizes
- Grading tab: responsive grid, collapses to single-column on mobile
- By-question batch mode: vertical stack on mobile (no side-by-side)

### 6.3 Accessibility
- Fill-in inputs: `aria-label` describes the blank context (e.g., "Blank 1 of 2 in question 15")
- Sentence rewriting: `aria-label` includes the starter/keyword
- Grading score slider: keyboard-navigable (arrow keys for increments)

---

## 7. Technical Considerations

### 7.1 Dependencies
- **Existing:** Firebase RTDB, Firestore, React, Mantine UI, AI Router Service with dual providers (`src/services/ai/router.service.ts` → Gemini + Groq with multi-key rotation)
- **New:** None (no new libraries needed)

### 7.1.1 AI Service Architecture (Reference)

The AI system uses a dual-provider architecture that MUST be leveraged for all AI features in Phase 2:

```
aiService (singleton, AIRouterService)
  ├── Strategy: 'gemini-first' (configurable)
  ├── Fallback: enabled (if primary fails → try secondary)
  ├── Retry: 1 attempt with 500ms delay
  │
  ├── geminiProvider (GeminiProvider)
  │   ├── Multi-key: loads from .env + Firestore (getDecryptedKeys)
  │   ├── Round-robin: rotates through keys on each request
  │   ├── Exhausted key tracking: marks keys with cooldown
  │   └── Rate limit handling: auto-rotates on 429 errors
  │
  └── groqProvider (GroqProvider)
      ├── Multi-key: loads from .env + Firestore (getDecryptedKeys)
      ├── Round-robin: same rotation pattern
      ├── Exhausted key tracking: same cooldown pattern
      └── Model: Llama 3.3 70B Versatile
```

**Usage rule for Phase 2**: All AI calls MUST go through `import { aiService } from '../services/ai/router.service.ts'`. NEVER import `geminiProvider` or `groqProvider` directly. The router handles selection, fallback, and key rotation automatically.

**New AI method needed**: Add `gradeWritingAnswer()` to the `IAIService` interface and implement in both providers:
```typescript
// In ai.service.ts — extend IAIService:
gradeWritingAnswer(
  studentAnswer: string,
  modelAnswers: string[],
  originalSentence: string,
  context?: { sentenceStarter?: string; keyword?: string }
): Promise<Result<{ score: number; confidence: number; feedback: string }>>;

// In router.service.ts — proxy through router:
async gradeWritingAnswer(...): Promise<Result<...>> {
  const providerOrder = this.getProviderOrder();
  for (const providerName of providerOrder) {
    // ... same fallback pattern as parseChunk
  }
}
```

### 7.2 Key Files to Create/Modify

| File | Change |
|------|--------|
| `src/types/thcs-test.types.ts` | **MODIFY** — Add fill-in and writing-specific fields to `THCSQuestion` |
| `src/services/thcsWritingGrading.service.ts` | **NEW** — AI-assisted writing grading (string similarity + dual-provider LLM escalation via aiService router) |
| `src/services/thcsAutoMarking.service.ts` | **MODIFY** — Add fill-in grading logic, cloze grading, partial grading states |
| `src/services/thcsTestStorage.ts` | **MODIFY** — Add changelog recording on publish, version reconstruction |
| `src/pages/THCSTestEditorPage.tsx` | **MODIFY** — Add fill-in, writing, cloze editor blocks; preview button; version dropdown |
| `src/pages/TeacherGradingPage.tsx` | **NEW** — Grading tab page |
| `src/pages/TeacherTestMonitorPage.tsx` | **MODIFY** — Add THCS student cards, inline writing grading panel |
| `src/components/thcs-editor/THCSFillInBlock.tsx` | **NEW** — Fill-in question editor block |
| `src/components/thcs-editor/THCSWritingBlock.tsx` | **NEW** — Sentence rewriting editor block |
| `src/components/thcs-editor/THCSClozeWordBankBlock.tsx` | **NEW** — Cloze word bank editor block |
| `src/components/thcs-editor/THCSVersionDropdown.tsx` | **NEW** — Version changelog dropdown |
| `src/components/thcs-editor/THCSPreviewOverlay.tsx` | **NEW** — Fullscreen preview overlay |
| `src/components/thcs-student/THCSFillInRenderer.tsx` | **NEW** — Student fill-in input rendering |
| `src/components/thcs-student/THCSWritingRenderer.tsx` | **NEW** — Student sentence rewriting rendering |
| `src/components/thcs-student/THCSClozeRenderer.tsx` | **NEW** — Student cloze word bank rendering |
| `src/components/thcs-student/THCSTestLayout.tsx` | **MODIFY** — Add new widget renderers, partial grading display, 10s writing sync |
| `src/components/thcs-grading/GradingTestCard.tsx` | **NEW** — Test card in grading tab |
| `src/components/thcs-grading/BatchGradingPanel.tsx` | **NEW** — By-question batch grading UI |
| `src/components/thcs-grading/InlineWritingGrader.tsx` | **NEW** — Monitor inline grading panel |
| `src/components/navigation/TeacherNavigation.tsx` | **MODIFY** — Add Grading nav button with badge |
| `src/components/navigation/TeacherHeader.tsx` | **MODIFY** — Add Grading to mobile menu items |
| `src/constants/routes.ts` | **MODIFY** — Add `TEACHER_GRADING` |
| `App.jsx` | **MODIFY** — Add grading route |
| `src/__tests__/security/routeAccess.test.ts` | **MODIFY** — Add grading route to config |

### 7.3 Patterns to Follow
- Writing grading service: follow `IAIService` pattern from `src/services/ai/ai.service.ts`
- Grading page: follow `TeacherHomeworkListPage.tsx` for list/filter pattern
- Monitor integration: follow existing `StudentProgressCard` pattern in `TeacherTestMonitorPage.tsx`
- Version dropdown: follow existing `Select` component from Mantine UI

### 7.4 Integration Safety Rules Triggered

| Rule # | Trigger | Action Required |
|--------|---------|----------------|
| **Rule 1** | New route `/teacher/grading` | Validate against route registry |
| **Rule 3** | New navigation handler for Grading tab | Research existing nav patterns first |
| **Rule 6** | Writing sync 10s interval + state deps | Use refs for hot values in intervals |
| **Rule 7** | `gradingStatus` initialized as `'submitted'` | Ensure all branches resolve to a final state |
| **Rule 8** | New grading components | Verify integration in parent pages |

---

## 8. Success Metrics

1. Teacher can create a test with all 17 task types in the visual editor
2. Fill-in questions auto-grade accurately for ≥95% of standard answers
3. AI-assisted writing grading reduces teacher manual grading effort by ≥50%
4. Grading tab shows pending items within 2 seconds of page load
5. Monitor shows THCS progress cards with section breakdown in real-time
6. Version changelog correctly records and reconstructs up to 20 versions
7. Preview overlay renders student view with 100% accuracy to actual student experience

---

## 9. Edge Cases and Solutions

| # | Edge Case | Solution |
|---|-----------|----------|
| 1 | Fill-in answer with extra spaces | `normalizeAnswer()`: collapse multiple spaces to single |
| 2 | Vietnamese keyboard diacritics on English words | `normalizeAnswer()`: strip Vietnamese diacritics from English answers |
| 3 | Student leaves fill-in blank empty | Store `""` (empty string). Grade as incorrect (0 points for that blank) |
| 4 | Sentence rewriting student types the starter text again | For E1: trim the starter from the beginning of student's answer before comparison. For E2: validate keyword is present in answer |
| 5 | AI grading service unavailable (Gemini API down) | Fallback to string similarity only. Flag all low-confidence answers for teacher review. Show warning in grading tab: "AI grading unavailable — all writing answers require manual review" |
| 6 | Teacher grades a question, then student re-grades (concurrent) | N/A for Phase 2 — students cannot re-submit once submitted. Future: RTDB transaction for grade writes |
| 7 | Changelog grows very large (100+ versions) | Display only last 20 versions in dropdown. Older versions accessible via "Show all" expansion. Reconstruction of very old versions may be slow (>500ms) — show loading indicator |
| 8 | Two teachers edit same test simultaneously (changelog race) | Per Phase 1 EC15: RTDB `runTransaction()` for changelog writes. Optimistic lock check before publish. Show conflict warning if test modified since editing began |
| 9 | Fill-in question with 0 blanks (teacher forgets ___) | Validation blocks publish: "Fill-in question 15 has no blank markers (___)" |
| 10 | Cloze word bank with more blanks than words | Validation blocks publish: "Word bank has 3 words but passage has 5 blanks" |
| 11 | Section changes from reading to non-reading after two-column set | Layout stays as teacher's choice — no auto-revert. Teacher can manually change |
| 12 | Grading tab performance with 500+ students | Lazy-load with Firestore cursor pagination. Aggregate counts computed server-side where possible |

---

## 10. Open Questions

1. ~~Fill-in widget blank count~~ → Resolved: Multiple blanks per question (Q11b)
2. ~~Sentence rewriting student UI~~ → Resolved: E1=inline continuation, E2=full-width (Q2c)
3. ~~Preview approach~~ → Resolved: Fullscreen overlay with actual components (Q5c)
4. Should the Grading tab show IELTS tests with writing/speaking that need manual review? → Decided (Q32c from original process): Yes, ALL completed tests appear, filtered by "Needs Review". IELTS writing/speaking results that need review also appear.
5. Should version reconstruction be cached in localStorage? → Recommend yes for frequently viewed versions, but not critical for Phase 2.

---

## 11. Phase 3 Forward References

Phase 2 prepares several hooks for Phase 3 integration:

| Feature | Phase 2 Preparation | Phase 3 Completion |
|---------|--------------------|--------------------|
| Homework grading | Grading tab data source accepts both session and homework results | Phase 3 adds homework results to the Grading tab data feed |
| Notifications | Auto-notify on grade update (single event) | Phase 3 adds all 6 notification event types + daily digest |
| Timer modes | Phase 1 strict timer continues | Phase 3 adds teacher-configurable strict/informational per assignment |
| Library browsing | Grading references test metadata from `thcs_library/` | Phase 3 builds full library browsing UI with filters |
