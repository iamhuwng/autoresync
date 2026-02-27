---
title: PRD THCS Phase 1
createdAt: '2026-02-27T15:28:23.759Z'
updatedAt: '2026-02-27T15:28:25.183Z'
description: Product requirements for THCS/THPT test system Phase 1 - core infrastructure
tags:
  - prd
  - thcs
  - phase1
---
# PRD-0027: THCS-THPT Test System — Phase 1 (Editor + MCQ Flow)

**Version:** 1.4
**Created:** 2026-02-26
**Updated:** 2026-02-26 (v1.4 — 2 minor gaps fixed from junior evaluation round 2: side-by-side batch grading UX in §11, forward-reference for homework path divergence in §4.3.6)
**Author:** AI (via Socratic PRD Process — 6 rounds, 55+ decisions)
**Status:** Draft
**Priority:** High (Core Feature Expansion)
**Scope:** Phase 1 of 3 — Foundation + End-to-End MCQ Flow

---

## 1. Introduction / Overview

The application currently supports IELTS/TOEFL test creation via a text-parsing workflow. Vietnamese middle school (THCS) and high school (THPT) English exams use a fundamentally different structure: section-based organization with weighted points, multiple MCQ intent types (pronunciation, grammar, vocabulary, reading comprehension), and a 10-point grading scale.

This PRD defines **Phase 1** of the THCS-THPT test system: a **form-based visual editor** for teachers to create section-structured tests, a **student test-taking interface** for MCQ questions, and **auto-grading with results**. Phase 1 covers only the MCQ widget (~14 of 17 task types), deferring fill-in, writing, and AI grading to Phase 2.

### Phasing Overview

| Phase | Scope | Depends On |
|-------|-------|------------|
| **Phase 1 (this PRD)** | Data model, editor (MCQ only), student MCQ view, auto-grading, results | None |
| Phase 2 | Fill-in + writing widgets, AI grading, Grading tab, monitor integration, versioning, preview | Phase 1 |
| Phase 3 | Homework, notifications, library, course integration, shuffling, templates, bulk ops | Phase 1 + 2 |

---

## 2. Goals

1. **G1:** Enable teachers to create THCS-THPT tests using a form-based visual editor with section management and MCQ question blocks.
2. **G2:** Enable students to take THCS-THPT MCQ tests in both live sessions and (later) as homework, with section-grouped navigation and color-coded progress.
3. **G3:** Auto-grade MCQ answers immediately upon submission and display results with section-level score breakdowns and 10-point scale conversion.
4. **G4:** Store THCS-THPT tests using a dual-storage architecture (Firestore for drafts/library, RTDB for runtime) that is backward-compatible with existing IELTS infrastructure.
5. **G5:** Activate the currently disabled "THCS-THPT" option in `TestTypeSelectionModal` and route it to the new editor.

---

## 3. User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-1 | Teacher | Select "THCS-THPT" from the test type modal and be taken to a visual editor | I can create Vietnamese-format tests without coding |
| US-2 | Teacher | Add sections with names, point values, and auto-generated instruction text | My test mirrors the official Vietnamese exam structure |
| US-3 | Teacher | Add MCQ questions with A/B/C/D options and select the correct answer inline | I can build the question bank efficiently |
| US-4 | Teacher | Choose an "intent" for each MCQ (pronunciation, grammar, vocabulary, etc.) | Section instructions auto-populate and analytics track skill areas |
| US-5 | Teacher | See a consolidated Answer Key panel showing all questions and their correct answers | I can verify accuracy before publishing |
| US-6 | Teacher | Set test metadata (title, duration, grade level, exam type) | The test is properly categorized |
| US-7 | Teacher | Save my work as a draft and resume editing later | I don't lose progress mid-creation |
| US-8 | Teacher | Publish a completed test to make it available for sessions | Students can take the test |
| US-9 | Teacher | Attach images to individual questions (e.g., signs/notices) | Visual question types are supported |
| US-10 | Teacher | Reorder sections and questions within sections via drag handles | I can organize the test structure |
| US-11 | Student | Take a THCS-THPT test in a live session with section-tabbed navigation | I can navigate the test efficiently |
| US-12 | Student | See color-coded question indicators (answered/unanswered/current) | I know my progress at a glance |
| US-13 | Student | See my results with per-section score breakdown after submission | I understand my performance per skill area |
| US-14 | Teacher | See auto-graded MCQ results immediately after students submit | I get instant feedback on class performance |
| US-15 | Teacher | Duplicate an existing test to create a variant | I can reuse test structures efficiently |

---

## 4. Functional Requirements

### 4.1 Data Model

#### 4.1.1 THCS-THPT Test Structure (TypeScript Interfaces)

> These types MUST be added to a new file: `src/types/thcs-test.types.ts`

```typescript
// ═══════════════════════════════════════════════════════════════
// THCS-THPT Test Data Model
// ═══════════════════════════════════════════════════════════════

/**
 * MCQ Intent Types — determines auto-generated section instruction
 * and analytics categorization. All use the same 4-option MCQ widget.
 */
export type MCQIntent =
  | 'pronunciation'          // A1: Odd-one-out underlined pronunciation
  | 'word-stress'            // A2: Odd-one-out stress pattern
  | 'mcq-grammar'            // B1: Gap-fill grammar
  | 'mcq-vocabulary'         // B2: Vocabulary/phrasal verbs
  | 'mcq-sign-notice'        // B5: Image prompt + MCQ
  | 'dialogue-response'      // B6: Situational/pragmatic response
  | 'reading-cloze-mcq'      // C1: Passage cloze with MCQ per blank
  | 'reading-comprehension'  // C3: Passage + MCQ questions
  | 'reading-announcement'   // C4: Short text + MCQ
  | 'sentence-arrangement'   // D1: Arrange sentences (MCQ answer)
  | 'closest-meaning'        // D2: Sentence closest in meaning
  | 'error-identification'   // D3: Underlined part needing correction
  | 'synonym-mcq'            // D4: Word synonym
  | 'antonym-mcq'            // D5: Word antonym
  | 'word-reference';        // D6: Pronoun/word reference in passage

/** Phase 2 widget types (defined here for data model completeness) */
export type Phase2QuestionType =
  | 'verb-form'              // B3: Supply correct verb form
  | 'word-form'              // B4: Supply correct word form
  | 'reading-cloze-wordbank' // C2: Passage cloze with word bank dropdown
  | 'sentence-rewrite'       // E1: Rewrite with given start
  | 'sentence-rewrite-keyword'; // E2: Rewrite using keyword

/** All question types (Phase 1 + Phase 2) */
export type THCSQuestionType = 'mcq' | Phase2QuestionType;

/**
 * A single MCQ question within a section.
 */
export interface THCSQuestion {
  id: string;                          // UUID generated client-side
  questionNumber: number;              // Sequential across entire test (1, 2, 3...)
  type: THCSQuestionType;              // 'mcq' for Phase 1
  intent: MCQIntent;                   // Determines instruction text + analytics tag
  questionText: string;                // The question/prompt text
  options: [string, string, string, string]; // Exactly 4 options (A, B, C, D)
  correctAnswer: 'A' | 'B' | 'C' | 'D'; // Single correct answer
  points?: number;                     // null = auto-calculated from section
  imageUrl?: string;                   // Optional image for question prompt
  imageCaption?: string;               // Optional image caption/alt text

  // Pronunciation-specific: underline markup in options
  // `options` stores PLAIN TEXT (e.g., "drink"). `optionUnderlines` stores
  // the SAME text WITH {{}} markup (e.g., "dr{{i}}nk").
  // The student view renders `optionUnderlines` by converting {{}} to <u> tags.
  // If `optionUnderlines` is undefined, `options` renders as-is (no underlines).
  // Only used when intent === 'pronunciation'
  optionUnderlines?: [string, string, string, string];

  // Error identification (D3): underlined parts in questionText
  // Format: "She {{go}} to school {{every day}} and {{study}} {{very hard}}."
  // Labels A/B/C/D auto-assigned to underlined parts in order
  underlinedParts?: string; // questionText with {{}} markup

  // Answer explanation (Phase 1: teacher-written; Phase 2: AI suggestions)
  explanation?: {
    text: string;              // Explanation text (why this answer is correct)
    source: 'teacher' | 'ai'; // Who wrote it
    approvedByTeacher: boolean; // Teacher verified AI suggestion
  };
}

/**
 * A section within a test (e.g., "PART A: PRONUNCIATION")
 */
export interface THCSSection {
  id: string;                          // UUID
  name: string;                        // e.g., "PART A: PRONUNCIATION"
  order: number;                       // Display order (0-based)
  totalPoints: number;                 // Total points for this section (e.g., 1.0)
  instructionText: string;             // Auto-generated from intent, teacher-editable
  questions: THCSQuestion[];           // Questions in this section

  // Reading sections: optional passage
  passage?: {
    id: string;
    content: string;                   // Passage text (Markdown supported)
    title?: string;                    // e.g., "Read the following passage..."
    imageUrl?: string;                 // Optional passage-level image
    wordCount: number;
  };

  // Layout preference for student view (reading sections)
  layout: 'single-column' | 'two-column';

  // Point calculation mode
  pointMode: 'auto' | 'manual';       // 'auto' = equally distributed; 'manual' = per-question
}

/**
 * Test metadata
 */
export interface THCSTestMetadata {
  title: string;                       // e.g., "Đề kiểm tra giữa kì 1 - Lớp 9"
  duration: number;                    // Minutes (common: 45, 50, 60, 90)
  gradeLevel: 6 | 7 | 8 | 9 | 10 | 11 | 12;
  examType: string;                    // Predefined options in UI dropdown:
                                       // 'giữa kì', 'cuối kì', 'thi vào 10', 'ôn tập',
                                       // 'unit 1' through 'unit 12'
                                       // String type allows teacher to type custom exam types
                                       // without requiring code changes
  subjectVariant?: string;             // e.g., "Global Success", "Friends Global"
  province?: string;                   // e.g., "Thanh Hóa", "Phú Thọ"
  school?: string;                     // e.g., "THPT Lam Sơn"
  description?: string;
  tags?: string[];
}

/**
 * Complete THCS-THPT test document (published, stored in RTDB)
 */
export interface THCSTest {
  id: string;
  testType: 'THCS-THPT';              // Discriminator
  metadata: THCSTestMetadata;
  sections: THCSSection[];
  questionCount: number;               // Total questions across all sections
  totalPoints: number;                 // Sum of all section points
  createdBy: string;                   // Teacher UID
  ownerId: string;                     // Owner UID (same as createdBy)
  isPublic: boolean;
  createdAt: number;                   // timestamp
  updatedAt: number;
  publishedAt?: number;

  // Delta-based version changelog (see §4.1.3)
  _changelog?: Record<string, ChangelogEntry>;

  // Runtime statistics (updated after sessions)
  stats?: {
    attempts: number;
    averageScore: number;
    averageTime: number;
    completionRate: number;
  };
}

/**
 * THCS-THPT draft document (stored in Firestore)
 */
export interface THCSDraft {
  id: string;
  userId: string;
  testType: 'THCS-THPT';
  metadata: THCSTestMetadata;
  sections: THCSSection[];
  questionCount: number;
  totalPoints: number;
  status: 'editing' | 'review' | 'published';
  createdAt: Date;
  updatedAt: Date;
}
```

#### 4.1.2 Storage Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        STORAGE MAP                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Firestore (complex data, querying, offline persistence)        │
│  ├── thcs_drafts/{draftId}        ← Mutable drafts              │
│  │     Fields: THCSDraft (full editor state)                    │
│  │     Queries: where('userId','==',uid), orderBy('updatedAt')  │
│  │                                                              │
│  └── thcs_library/{testId}        ← Library metadata for browse │
│        Fields: title, gradeLevel, examType, subjectVariant,     │
│                province, questionCount, sectionSummary[],       │
│                totalPoints, duration, createdBy, createdAt,     │
│                isPublic, tags[]                                 │
│        Queries: where('gradeLevel','==',9)                     │
│                 .where('examType','==','giữa kì')              │
│                 .orderBy('createdAt','desc')                    │
│                                                                 │
│  RTDB (real-time, low-latency session loading)                  │
│  └── tests/{testId}               ← Full test data for runtime  │
│        Fields: THCSTest (sections, questions, metadata)          │
│        testType: 'THCS-THPT' (discriminator from IELTS tests)  │
│        _changelog/: { v_timestamp: ChangelogEntry }             │
│                                                                 │
│  PUBLISH FLOW:                                                  │
│  Draft (Firestore) ──publish──▶ Test (RTDB) + Library (Firestore)│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key rule:** The RTDB `tests/` path is SHARED with existing IELTS tests. The `testType` field discriminates: `'IELTS'` vs `'THCS-THPT'`. This means:
- Existing code reading `tests/` must check `testType` before rendering
- The TeacherLobbyPage test cards must display differently based on `testType`
- The `TestData` interface in `testStorage.ts` must be updated to include `'THCS-THPT'` in its type union

#### 4.1.3 Delta-Based Version Changelog

Each time a teacher publishes an edit to an existing test, the system records ONLY the changed fields in a `_changelog` node:

```typescript
export interface ChangelogEntry {
  publishedAt: number;       // Timestamp
  publishedBy: string;       // Teacher UID
  label: string;             // Auto-generated: "Edit #2 — 3 fields changed"
  previousValues: Record<string, any>;
  // Keys use '~' separator for paths: "sections~0~questions~2~correctAnswer": "B"
  // Value is what the field WAS before this edit (the old value)
}
```

**How it works:**
1. Teacher opens published test for editing → system loads from RTDB into a Firestore draft
2. Teacher makes changes in the editor → saves draft
3. Teacher clicks "Publish Update" → system diffs current RTDB version vs new draft
4. Changed fields are recorded in `_changelog/v_{timestamp}` with the OLD values
5. RTDB test data is overwritten with the new version

**How to reconstruct old versions:**
- Current version = read `tests/{testId}` directly
- Previous version = take current, overlay `previousValues` from latest changelog entry
- N versions back = apply changelog entries in reverse chronological order

**Assignment integration:**
- When a test is assigned (homework/session), the assignment stores `{ testId, versionKey: "v_1708900000" }`
- At assignment time, the system pre-computes `_cachedVersion` (the full test data at that version) and stores it in the assignment record to avoid reconstruction on every student load

> ⚠️ **Phase 1 scope:** The changelog system is DEFINED in the data model but NOT actively used in Phase 1 (no version dropdown UI). Phase 1 always overwrites the test on re-publish. Phase 2 adds the changelog recording and version viewing.

#### 4.1.4 RTDB Type Union Update

Update `src/services/testStorage.ts`:

```typescript
// BEFORE:
type: 'IELTS' | 'TOEFL' | 'Custom' | 'College Entrance'

// AFTER:
type: 'IELTS' | 'TOEFL' | 'Custom' | 'College Entrance' | 'THCS-THPT'
```

Update `src/types/draft.types.ts` — `TestType` already includes `'THCS-THPT'` (confirmed in codebase research). No change needed.

#### 4.1.5 Firestore Collections — New

| Collection | Document ID | Purpose |
|-----------|------------|---------|
| `thcs_drafts` | Auto-generated | Teacher's in-progress test drafts |
| `thcs_library` | Same as RTDB test ID | Lightweight metadata for library browsing/filtering |

> ⚠️ **Integration Safety Rule #12:** These new Firestore collections MUST be added to the backup system's discovery. Since the backup uses dynamic Firestore discovery (§4.16.2 in PRD-0026), they will be automatically included. Verify by checking `FIRESTORE_EXCLUDE` list does NOT contain `thcs_drafts` or `thcs_library`.

### 4.2 Visual Editor Page

#### 4.2.1 Route

```
/teacher/thcs-test/create           ← New test
/teacher/thcs-test/edit/:draftId    ← Edit existing draft
```

> ⚠️ **Integration Safety Rule #1:** These routes MUST be added to the route registry.

**Route Registry Updates Required:**

1. **`src/constants/routes.ts`** — Add to `ROUTES` constant:
```typescript
// Teacher Routes - THCS-THPT Test Editor (PRD-0027)
TEACHER_THCS_CREATE: '/teacher/thcs-test/create',
TEACHER_THCS_EDIT: '/teacher/thcs-test/edit/:draftId',
```

2. **`App.jsx`** — Add route definitions (teacher-only, same guard as `TEACHER_TEST_REVIEW`):
```jsx
<Route path="/teacher/thcs-test/create" element={<TeacherGuard><THCSTestEditorPage /></TeacherGuard>} />
<Route path="/teacher/thcs-test/edit/:draftId" element={<TeacherGuard><THCSTestEditorPage /></TeacherGuard>} />
```

3. **`src/__tests__/security/routeAccess.test.ts`** — Add to `ROUTE_CONFIG[]`:
```typescript
{ path: '/teacher/thcs-test/create', allowedRoles: ['teacher', 'super_admin'], description: 'THCS-THPT test editor (new)' },
{ path: '/teacher/thcs-test/edit/:draftId', allowedRoles: ['teacher', 'super_admin'], description: 'THCS-THPT test editor (edit draft)' },
```

4. **`RouteParams`** — No change needed (`draftId` already exists in the interface).

#### 4.2.2 Editor Layout (Form-Based, Phase 1)

```
┌───────────────────────────────────────────────────────────────────┐
│ ← Back to Lobby    THCS-THPT Test Editor    [Save Draft] [Publish]│
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Metadata Panel (collapsible) ──────────────────────────────┐ │
│  │ Title: [________________]  Duration: [45] [50] [60] [90] [__]│ │
│  │ Grade: [6-12 dropdown]  Exam Type: [dropdown]                │ │
│  │ Subject Variant: [optional]  Province: [optional]            │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ Section 1: PART A ─────────────────── [⬆️][⬇️][🗑️] ──────┐ │
│  │ Name: [PART A: PRONUNCIATION]  Points: [1.0]                 │ │
│  │ Instruction: [auto-generated, editable textarea]             │ │
│  │ Layout: ○ Single Column  ○ Two Column                       │ │
│  │                                                              │ │
│  │  ┌─ Q1 ─────────────────────────────── [⬆️][⬇️][🗑️] ───┐  │ │
│  │  │ Intent: [pronunciation ▼]                               │  │ │
│  │  │ Question: [_________________________________]           │  │ │
│  │  │ A: [___________] ✅  B: [___________]                  │  │ │
│  │  │ C: [___________]      D: [___________]                  │  │ │
│  │  │ 🖼️ Add Image                                            │  │ │
│  │  └─────────────────────────────────────────────────────────┘  │ │
│  │                                                              │ │
│  │  ┌─ Q2 ─────────────────────────────── [⬆️][⬇️][🗑️] ───┐  │ │
│  │  │ ...                                                     │  │ │
│  │  └─────────────────────────────────────────────────────────┘  │ │
│  │                                                              │ │
│  │  [+ Add Question]                                            │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  [+ Add Section]                                                  │
│                                                                   │
│  ┌─ Answer Key Panel (collapsible) ────────────────────────────┐ │
│  │ Q1: ● A ○ B ○ C ○ D  |  Q2: ○ A ● B ○ C ○ D  | ...       │ │
│  │ Total: 40/40 answered  ⚠️ 0 missing                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ Validation Summary ───────────────────────────────────────┐  │
│  │ ✅ All sections have questions                              │  │
│  │ ✅ All questions have correct answers                       │  │
│  │ ⚠️ Total points: 9.5/10 (Vietnamese exams typically = 10)  │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

#### 4.2.3 Editor Behaviors — Specification

**Back to Lobby:**
- If editor has unsaved changes (dirty), show confirmation: "You have unsaved changes. Leave without saving?"
- If teacher confirms: navigate to Teacher Lobby (`navigateTo('TEACHER_LOBBY', { sessionCode })` if session active, or `navigateTo('LOBBY')` if not)
- If teacher cancels: stay on editor

**Metadata Panel:**
- Title: free text, required, max 200 chars
- Duration: preset buttons for 45/50/60/90 min + custom number input. Click preset = fills input. Custom typing overrides preset selection.
- Grade Level: dropdown, values 6-12, required
- Exam Type: combobox (dropdown with predefined options + free text input). Predefined: `giữa kì`, `cuối kì`, `thi vào 10`, `ôn tập`, `unit 1` through `unit 12`. Teacher can type a custom value. Required.
- Subject Variant: optional text input (e.g., "Global Success")
- Province: optional text input
- School: optional text input
- isPublic: toggle switch, defaults to `false` (private). When `true`, test will appear in the Phase 3 public library. Label: "Share in Public Library"

**Section Management:**
- **Initial state (new test):** When the editor loads for a brand-new test, the system auto-creates a default section named "PART A" with default settings. The editor NEVER starts with zero sections.
- "Add Section" button appends a new section with auto-name "PART {letter}" (A, B, C, ...)
- Default section points: 0 (teacher must set)
- Default layout: `single-column`
- Sections can be reordered via up/down buttons (Phase 1) or drag handles (Phase 2)
- Deleting a section requires confirmation: "Delete PART A and all 10 questions inside?"
- Cannot delete the last section: "A test must have at least one section."
- Point mode starts as `auto`. Once teacher manually sets ANY question's points in the section, mode switches to `manual` and ALL questions in that section must be manually set. Show info: "⚠️ Manual point mode active. Set points for each question individually."
- **Passage input visibility**: The passage input area (title, content, image) is ONLY visible when ANY question in the section has a reading intent (`reading-cloze-mcq`, `reading-comprehension`, `reading-announcement`). Otherwise hidden. If teacher removes all reading questions, passage data is preserved but hidden — reshown if a reading question is re-added.

**Question Management:**
- "Add Question" button appends a new MCQ question to the current section
- Question number is globally sequential (auto-calculated across all sections)
- Intent dropdown: shows all 15 MCQ intents. On change, section instruction text is re-generated (if instruction hasn't been manually edited)
- Each option (A-D) is a text input. Clicking the radio/checkbox marks it as correct.
- Questions can be reordered within their section via up/down buttons
- Questions CANNOT be dragged between sections
- Image upload: click "🖼️ Add Image" → file picker → upload to existing image storage → display thumbnail. Both upload and URL paste supported, prefer upload.

**Pronunciation-specific (intent = 'pronunciation'):**
- Each option field shows a mini "Underline" toolbar button
- **Standard mode:** Teacher selects characters in the option text → clicks Underline → those characters wrap in `{{}}` markup
- **Quick Underline mode:** A toggle button activates "Quick Underline" mode, where the teacher simply clicks individual characters to instantly toggle their underline state (no text selection needed). This solves copy-paste friction when pasting pronunciation questions from Word documents where underline formatting is lost.
- Preview shows underlined characters below each option
- Validation: if intent is `pronunciation` and no option has underline markup, show warning: "⚠️ Pronunciation questions require underlined portions. Click each option to mark the pronunciation-target letters."

**Error Identification (intent = 'error-identification'):**
- Instead of 4 option fields, show a single "Sentence" textarea with an Underline toolbar
- Teacher underlines 4 parts in the sentence → auto-labeled A, B, C, D in order
- Correct answer field selects which underlined part needs correction
- Validation: exactly 4 underlined parts required

**Section Instruction Templates:**
- When teacher selects an intent for the FIRST question in a section, the section instruction auto-populates from a template (see §4.2.4)
- If teacher edits the instruction text, it's marked as "custom" and won't be overwritten by future intent changes
- Teacher can click "🔄 Reset to Template" to restore the auto-generated version
- Teacher can also click "+ Create Custom Instruction" to type a completely new instruction from scratch (not from any template)

**Answer Key Panel:**
- Collapsible panel at the bottom of the editor
- Shows all questions in a compact grid: `Q1: ●A ○B ○C ○D | Q2: ○A ●B ○C ○D | ...`
- Clicking a radio in the answer key panel updates the corresponding question's correct answer
- Shows summary: "40/40 answered | 0 missing"
- Unanswered questions highlighted in amber
- Can be used for bulk answer entry without scrolling through question blocks

**Auto-Save:**
- Debounced 2-second auto-save to Firestore (`thcs_drafts/`)
- On every change: set a dirty flag → after 2 seconds of no further changes → save
- Show "Saving..." indicator during save, "✅ Saved" after
- If offline: save to localStorage, sync to Firestore when reconnected
- Implementation: follow the same pattern as `draftCloudService.ts` `testDraftService`

**Validation (on Publish):**
- ❌ Block: Any section with 0 questions
- ❌ Block: Any question without a correct answer selected
- ❌ Block: Title is empty
- ❌ Block: Duration is 0 or unset
- ❌ Block: Grade level is unset
- ⚠️ Warn (allow): Total points ≠ 10 → "Vietnamese exams typically total 10 points (current: {X})"
- ⚠️ Warn (allow): Pronunciation intent without underline markup

#### 4.2.4 Section Instruction Templates

```typescript
export const INSTRUCTION_TEMPLATES: Record<MCQIntent, string> = {
  'pronunciation': 'Mark the letter A, B, C, or D on your answer sheet to indicate the word whose underlined part differs from the other three in pronunciation.',
  'word-stress': 'Mark the letter A, B, C, or D on your answer sheet to indicate the word that differs from the other three in the position of primary stress.',
  'mcq-grammar': 'Mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the following questions.',
  'mcq-vocabulary': 'Mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the following questions.',
  'mcq-sign-notice': 'Mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the following questions.',
  'dialogue-response': 'Mark the letter A, B, C, or D on your answer sheet to indicate the most suitable response to complete each of the following exchanges.',
  'reading-cloze-mcq': 'Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the correct word or phrase that best fits each of the numbered blanks.',
  'reading-comprehension': 'Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the questions.',
  'reading-announcement': 'Read the following advertisement/announcement and mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the questions.',
  'sentence-arrangement': 'Mark the letter A, B, C, or D on your answer sheet to indicate the correct arrangement of the given sentences to make a meaningful paragraph.',
  'closest-meaning': 'Mark the letter A, B, C, or D on your answer sheet to indicate the sentence that is closest in meaning to each of the following questions.',
  'error-identification': 'Mark the letter A, B, C, or D on your answer sheet to indicate the underlined part that needs correction in each of the following questions.',
  'synonym-mcq': 'Mark the letter A, B, C, or D on your answer sheet to indicate the word(s) CLOSEST in meaning to the underlined word(s) in each of the following questions.',
  'antonym-mcq': 'Mark the letter A, B, C, or D on your answer sheet to indicate the word(s) OPPOSITE in meaning to the underlined word(s) in each of the following questions.',
  'word-reference': 'Mark the letter A, B, C, or D on your answer sheet to indicate what the underlined word refers to in the passage.',
};
```

#### 4.2.5 Publish Flow

1. Teacher clicks "Publish"
2. Client-side validation runs (§4.2.3). If errors → show validation summary, abort.
3. If warnings → show confirmation dialog with warnings listed. Teacher can proceed or fix.
4. System generates a test ID (if new) or uses existing ID (if editing)
5. Write to RTDB `tests/{testId}` (full `THCSTest` object with `testType: 'THCS-THPT'`)
6. Write to Firestore `thcs_library/{testId}` (lightweight metadata for library browsing)
7. Update draft status to `'published'`
8. Navigate to Teacher Lobby or test card view
9. Show success notification: "✅ Test published successfully"

#### 4.2.6 Test Duplication

- Test cards in the Lobby show a "Duplicate" action button
- On click: create a new Firestore draft with all data copied from the original test
- Title appended with " (Copy)"
- Navigate to editor with the new draft
- The duplicate has no connection to the original — fully independent

### 4.3 Student Test-Taking Page

#### 4.3.1 Route

```
/student/test/:sessionCode  ← Same route as IELTS (reused)
```

The existing `StudentTestPage.tsx` must detect `testType` and render the appropriate layout. Two approaches:

**Recommended approach:** Within `StudentTestPage.tsx`, after loading `testData`, check `testData.testType`:
- If `'IELTS'` (or undefined for legacy): render existing `TwoColumnLayout` + `IELTSQuestionsPanel`
- If `'THCS-THPT'`: render new `THCSTestLayout` component

#### 4.3.2 THCS Student View Layout

```
┌───────────────────────────────────────────────────────────────────┐
│ Test Title            ⏱️ 45:00     📊 12/40     [Submit Test]    │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Section Content Area ──────────────────────────────────────┐ │
│  │                                                              │ │
│  │  PART A: PRONUNCIATION (1.0 point)                          │ │
│  │  Mark the letter A, B, C, or D on your answer sheet to...   │ │
│  │                                                              │ │
│  │  Question 1.                                                 │ │
│  │  ○ A. drink    ○ B. think                                   │ │
│  │  ○ C. bring    ○ D. fine                                    │ │
│  │       ̲                 ̲                                      │ │
│  │                                                              │ │
│  │  Question 2.                                                 │ │
│  │  ○ A. teacher  ○ B. cheap                                   │ │
│  │  ○ C. great    ○ D. beach                                   │ │
│  │                                                              │ │
│  │  [... more questions ...]                                    │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
├─ Section Navigation Footer ───────────────────────────────────────┤
│ [PART A] [PART B] [PART C] [PART D]                              │
│                                                                   │
│ Q: ●1 ●2 ○3 ○4 ○5 | ●6 ●7 ●8 ○9 ○10 | ○11... | ○31...        │
│    (section A)       (section B)         (C)      (D)             │
│                                                                   │
│ ● = answered (blue #3b82f6)  ○ = unanswered (gray #e2e8f0)      │
│ ◉ = current (dark #1e293b + ring)                                │
└───────────────────────────────────────────────────────────────────┘
```

#### 4.3.3 Color-Coded Question Navigation

| State | Color | CSS | Indicator |
|-------|-------|-----|-----------|
| Unanswered | Light gray | `background: #e2e8f0` | Empty circle |
| Answered | Blue | `background: #3b82f6; color: white` | Filled circle |
| Flagged for review | Amber | `background: #f59e0b; color: white` | ⚑ flag icon overlay |
| Current question | Dark | `background: #1e293b; color: white; box-shadow: 0 0 0 3px #3b82f6` | Bold ring |
| Correct (post-submit) | Green | `background: #10b981; color: white` | ✓ check |
| Incorrect (post-submit) | Red | `background: #ef4444; color: white` | ✗ cross |
| Pending review (Phase 2) | Purple | `background: #8b5cf6; color: white` | ⏳ clock |

#### 4.3.4 Student View Behaviors

- **Section tabs**: Clicking a section tab scrolls to that section's content area
- **Question click**: Clicking a question number in the footer scrolls to that question
- **Answer selection**: Clicking an MCQ option selects it. Only one option per question. Clicking again on the same option deselects it.
- **Question flagging**: Each question block shows a small '⚑' flag toggle button in the top-right corner. Clicking it toggles the flagged state (amber in navigation footer). Flagged state is stored client-side only (not synced to RTDB) — it's a personal navigation aid, not graded.
- **Answer persistence**: Answers auto-save to RTDB every change (debounced, same as IELTS `useTestAutoSave`)
- **Two-column reading sections**: If section has `layout: 'two-column'`, render passage on left (sticky) and questions on right. On mobile (< 768px), two-column collapses to single-column with passage in collapsible panel and "📖 Show Passage" floating button.
- **Single-column reading sections**: Passage first, then questions below. On desktop, show "Scroll to Questions" button after passage. When student scrolls past the passage: (1) a **sticky passage header** showing the passage title + first line remains pinned at top, and (2) a floating "📖 Show Passage" button appears that opens a slide-up panel with the full passage without navigating away from the current question position.
- **Images**: Question images render above the options, max-width 400px, click to enlarge.
- **Timer**: Same timer system as IELTS (`useTestTimer`). Teacher-configurable strict/informational mode per assignment (Phase 3). Phase 1: always strict (auto-submit on expiry).

#### 4.3.5 Real-Time Sync

- MCQ answer changes sync to RTDB immediately (same as IELTS)
- Teacher monitor page sees student progress in real-time
- Connection loss: save to localStorage, sync when reconnected (existing `ConnectionMonitor` behavior)

#### 4.3.6 Student Answer Storage Schema

THCS-THPT student answers are stored in the existing game session structure:

```
RTDB: game_sessions/{sessionCode}/students/{studentId}/
  answers: {
    "1": "A",       // questionNumber (string key) → selected answer letter
    "2": "C",
    "3": null,      // unanswered
    "4": "B",
    ...
  }
  progress: {
    answeredCount: 12,    // Number of answered questions
    totalQuestions: 40,   // Total questions in test
    currentSection: 0,    // Index of section student is currently viewing
  }
```

This reuses the existing `answers` path (same as IELTS) with a simpler value format:
- IELTS: `answers[questionNumber] = { answer, timestamp, ... }` (object)
- THCS: `answers[questionNumber] = "A"` (string letter only)

The grading service reads `answers` and maps each `questionNumber` to the correct answer from the test data.

> ⚠️ The `progress` sub-node is new and enables the teacher monitor to show live progress without reading all answers.

> 📌 **Phase 3 forward reference:** When homework is introduced (Phase 3), student answers will be stored at a SEPARATE path: `homework_submissions/{homeworkId}/{studentId}/` — NOT under `game_sessions/`. The grading service built in Phase 1 should accept the answer data as input parameters (not hardcode the `game_sessions/` path internally), so it can be reused for both session and homework grading without refactoring. See §11 Phase 3 Pre-Decisions (EC9).

### 4.4 Auto-Grading

#### 4.4.1 MCQ Grading Service

Create new service: `src/services/thcsAutoMarking.service.ts`

```typescript
export interface THCSGradingResult {
  testId: string;
  studentId: string;
  totalPoints: number;         // Points earned
  maxPoints: number;           // Total possible points
  scaledScore: number;         // Converted to 10-point scale: (totalPoints/maxPoints) * 10
  sectionResults: SectionResult[];
  questionResults: Record<number, QuestionResult>; // questionNumber → result
  gradedAt: number;
  gradingStatus: 'fully-graded'; // Phase 1 = always fully graded (MCQ only)
}

export interface SectionResult {
  sectionId: string;
  sectionName: string;
  pointsEarned: number;
  pointsMax: number;
  correctCount: number;
  totalCount: number;
  percentage: number;          // (correctCount/totalCount) * 100
  intentBreakdown: Record<MCQIntent, { correct: number; total: number }>;
}

export interface QuestionResult {
  questionNumber: number;
  isCorrect: boolean;
  studentAnswer: string;       // 'A', 'B', 'C', or 'D'
  correctAnswer: string;
  pointsEarned: number;
  pointsMax: number;
}
```

**Grading logic:**
1. For each question: exact match `studentAnswer === question.correctAnswer`
2. Points per question:
   - If section `pointMode === 'auto'`: `section.totalPoints / section.questions.length`
   - If section `pointMode === 'manual'`: `question.points`
3. Section score = sum of question points earned
4. Total score = sum of section scores
5. Scaled score = `(totalScore / maxScore) * 10`, rounded to 1 decimal
6. Intent breakdown: aggregate correct/total by intent tag for analytics

#### 4.4.2 Grading Trigger

- When student submits (manual or auto-submit on time expiry):
  1. Read student answers from RTDB (`game_sessions/{sessionCode}/students/{studentId}/answers`)
  2. Read test data from RTDB (`tests/{testId}`)
  3. Run THCS grading function → produces `THCSGradingResult`
  4. Store results via adapter (see §4.4.3)
  5. Update test stats (see §4.4.4)

#### 4.4.3 Result Storage — Adapter to Existing `saveTestResult()`

The existing `saveTestResult()` in `testResults.service.ts` expects a `TestMarkingResult` (from IELTS). The THCS grading service MUST adapt its output to this interface. This ensures:
- All existing index paths (`test_results_by_session/`, `test_results_by_student/`, etc.) work unchanged
- Existing results pages and teacher dashboards can display THCS results
- No duplication of result storage logic

**Adapter mapping:**

```typescript
// Convert THCSGradingResult → TestMarkingResult format
function thcsResultToMarkingResult(thcsResult: THCSGradingResult): TestMarkingResult {
  return {
    totalScore: thcsResult.totalPoints,
    maxScore: thcsResult.maxPoints,
    percentage: Math.round((thcsResult.totalPoints / thcsResult.maxPoints) * 100),
    completedAt: thcsResult.gradedAt,
    questionResults: Object.values(thcsResult.questionResults).map(qr => ({
      questionNumber: qr.questionNumber,
      questionType: 'mcq',
      isCorrect: qr.isCorrect,
      score: qr.pointsEarned,
      maxScore: qr.pointsMax,
      studentAnswer: qr.studentAnswer,
      correctAnswer: qr.correctAnswer,
      feedback: '',
    })),
    summary: {
      correct: Object.values(thcsResult.questionResults).filter(q => q.isCorrect).length,
      incorrect: Object.values(thcsResult.questionResults).filter(q => !q.isCorrect).length,
      partialCredit: 0,
      totalQuestions: Object.keys(thcsResult.questionResults).length,
    },
  };
}
```

**THCS-specific fields** stored alongside the standard result:

The `TestResultRecord` in `testResults.service.ts` must be extended with an optional THCS data block:

```typescript
// Add to TestResultRecord interface:
thcsData?: {
  scaledScore: number;           // 10-point scale (e.g., 8.3)
  sectionResults: SectionResult[]; // Per-section breakdown
  intentBreakdown: Record<string, { correct: number; total: number }>;
};
```

The existing `bandScore` field is NOT used for THCS (it remains `0` or is calculated normally). The `thcsData.scaledScore` is the THCS-specific equivalent. Results pages check `testType` to decide whether to show `bandScore` (IELTS) or `thcsData.scaledScore` (THCS).

#### 4.4.4 Test Stats Update

After each successful grading, the system updates the test's runtime statistics:

```typescript
// In thcsAutoMarking.service.ts, after saving result:
const statsRef = ref(database, `tests/${testId}/stats`);
await runTransaction(statsRef, (current) => {
  if (!current) {
    return { attempts: 1, averageScore: scaledScore, averageTime: timeElapsed, completionRate: 100 };
  }
  const newAttempts = current.attempts + 1;
  return {
    attempts: newAttempts,
    averageScore: ((current.averageScore * current.attempts) + scaledScore) / newAttempts,
    averageTime: ((current.averageTime * current.attempts) + timeElapsed) / newAttempts,
    completionRate: 100, // All graded results are complete
  };
});
```

This uses RTDB `runTransaction()` for atomic increment, preventing race conditions when multiple students submit simultaneously.

### 4.5 Results Page

#### 4.5.1 Results Display

After submission, the student sees:

```
┌───────────────────────────────────────────────────────────────┐
│                  📊 Test Results                              │
│                                                               │
│  ┌─ Score Summary ─────────────────────────────────────────┐ │
│  │         🏆  8.3 / 10.0                                  │ │
│  │         (33 / 40 correct)                               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ Section Breakdown ─────────────────────────────────────┐ │
│  │ PART A: Pronunciation    0.8 / 1.0   (3/4 correct)     │ │
│  │ ████████████████████░░░░  80%                           │ │
│  │                                                          │ │
│  │ PART B: Grammar & Vocab  3.5 / 4.0   (14/16 correct)   │ │
│  │ █████████████████████░░░  87.5%                         │ │
│  │                                                          │ │
│  │ PART C: Reading           2.5 / 3.0   (10/12 correct)  │ │
│  │ ████████████████████░░░░  83.3%                         │ │
│  │                                                          │ │
│  │ PART D: Sentence Transf.  1.5 / 2.0   (6/8 correct)   │ │
│  │ ██████████████████░░░░░░  75%                           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ Skill Analysis ───────────────────────────────────────┐  │
│  │ Weakest: Pronunciation (75%)                            │  │
│  │ Strongest: Grammar (93%)                                │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Question Review ──────────────────────────────────────┐  │
│  │ Q1 ✓  Q2 ✓  Q3 ✗  Q4 ✓  Q5 ✓  ...                   │  │
│  │ (click question number to see details)                  │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

#### 4.5.2 Academic Record Integration

THCS-THPT results are stored SEPARATELY from IELTS results in the academic record:

- IELTS results contribute to IELTS progression tracking
- THCS-THPT results contribute to THCS/THPT progression tracking (separate section in student profile)
- The Academic Record page shows both with distinct tabs/sections

Implementation: add a `testType` field to `test_results/` records. The Academic Record page groups by `testType`.

### 4.6 Teacher Lobby Integration

#### 4.6.1 Test Card for THCS-THPT

The existing TeacherLobbyPage renders test cards via `renderTestCard()`. When `test.testType === 'THCS-THPT'`, the card shows:

```
┌──────────────────────────────────────────────┐
│ Đề kiểm tra giữa kì 1 - Lớp 9              │
│                                              │
│ 🏫 THCS-THPT  📝 40 questions  ⏱️ 60 min    │
│ 📚 Lớp 9  📋 Giữa kì  📍 Thanh Hóa         │
│ 💯 10.0 points  (4 sections)                 │
│                                              │
│ [Edit] [Duplicate] [Delete] [Start Test]     │
└──────────────────────────────────────────────┘
```

**Session creation flow:** THCS-THPT tests use the SAME session system as IELTS (`game_sessions/{sessionCode}`). The test card's "Start Test" button follows the existing `handleStartSession()` flow in TeacherLobbyPage. The `testType` field on the game session discriminates which student view to render. No changes to the session creation logic are needed — only the student-side rendering differs based on `testType`.

#### 4.6.2 TestTypeSelectionModal Update

The existing `TestTypeSelectionModal.tsx` has `THCS-THPT` with `available: false`. Changes required:

1. **Set `available: true`** for the THCS-THPT entry (line 76)
2. **Change `skills` array** from `['Reading', 'Listening', 'Writing', 'Mixed-Test']` to `['Mixed-Test']` — THCS tests are always mixed, no skill selection needed
3. **Auto-confirm for single-skill types:** When a test type has only one skill option, the modal should auto-call `onConfirm(testType, skills[0])` immediately after selection — skipping the skill picker step entirely
4. **Parent handler update:** The component receiving `onConfirm('THCS-THPT', 'Mixed-Test')` (in `TeacherLobbyPage.jsx`) must check `testType` and navigate accordingly:

```typescript
// In the onConfirm handler:
if (testType === 'THCS-THPT') {
  // Skip IELTS creation flow — go directly to THCS editor
  navigateTo('TEACHER_THCS_CREATE');
  return;
}
// ... existing IELTS flow continues
```

### 4.7 Answer Explanation System

Phase 1 includes the data model for answer explanations but NOT the AI suggestion feature (Phase 2):

```typescript
// In THCSQuestion:
explanation?: {
  text: string;              // Teacher-written or AI-suggested explanation
  source: 'teacher' | 'ai';  // Who wrote it
  approvedByTeacher: boolean; // Teacher verified AI suggestion
};
```

- In the editor: each question has an optional "Explanation" expandable textarea
- In results: after submission, correct answer + explanation shown per question
- Phase 2: AI generates explanation suggestions based on the answer key, teacher approves/edits

---

## 5. Non-Goals (Out of Scope for Phase 1)

1. **NOT Phase 1:** Fill-in-text widget (verb form, word form) → Phase 2
2. **NOT Phase 1:** Write-inline widget (sentence rewriting) → Phase 2
3. **NOT Phase 1:** Cloze word bank widget → Phase 2
4. **NOT Phase 1:** AI-assisted grading for writing → Phase 2
5. **NOT Phase 1:** Grading tab in Teacher Lobby → Phase 2
6. **NOT Phase 1:** Writing grading in live session monitor → Phase 2
7. **NOT Phase 1:** Question shuffling / mã đề → Phase 3
8. **NOT Phase 1:** Homework assignment flow → Phase 3
9. **NOT Phase 1:** Notifications → Phase 3
10. **NOT Phase 1:** THCS-THPT library with filtering → Phase 3
11. **NOT Phase 1:** Course integration → Phase 3
12. **NOT Phase 1:** Bulk question creation (Add N / quick-paste) → Phase 3
13. **NOT Phase 1:** Test templates (save/load structure) → Phase 3
14. **NOT Phase 1:** Text-to-test conversion → Phase 2+
15. **NOT Phase 1:** Drag-and-drop reordering (up/down buttons in Phase 1) → Phase 2
16. **NOT Phase 1:** Interactive preview as student → Phase 2
17. **NOT Phase 1:** Version changelog UI (dropdown to view old versions) → Phase 2
18. **NOT Phase 1:** Per-question difficulty tags → deferred
19. **NOT Phase 1:** AI question generation → out of scope
20. **NOT Phase 1:** PDF export → out of scope
21. **NOT Phase 1:** Group/collaborative tests → out of scope
22. **NOT Phase 1:** Subsection nesting within sections → not supported. Each task group is a flat top-level section (e.g., "Part B-I: Verb Form" and "Part B-II: Word Form" are separate sections, NOT subsections of "Part B")

---

## 6. Design Considerations

### 6.1 UI Consistency
- Use existing design system components: `Card`, `CardBody`, `Button` from `src/components/modern`
- Follow existing color palette and glassmorphism patterns
- All UI text in English (consistent with existing IELTS interface)

### 6.2 Responsive Design
- Editor: optimized for desktop (min-width: 1024px). On smaller screens, show warning "Editor is best used on desktop."
- Student view: fully responsive. Two-column layout collapses to single column on mobile with floating passage button.

### 6.3 Accessibility
- All MCQ options keyboard-navigable (Tab/Shift+Tab, Enter to select)
- Question images must have alt text (from `imageCaption`)
- Color-coded navigation uses both color AND shape/icon (not color alone)

---

## 7. Technical Considerations

### 7.1 Dependencies
- **Existing:** Firebase RTDB, Firestore, React, Mantine UI, existing hooks/services
- **New:** None (no new libraries needed for Phase 1)

### 7.2 Key Files to Modify

| File | Change |
|------|--------|
| `src/types/thcs-test.types.ts` | **NEW** — All THCS types |
| `src/services/thcsDraftService.ts` | **NEW** — Firestore CRUD for drafts |
| `src/services/thcsTestStorage.ts` | **NEW** — RTDB publish/read for tests |
| `src/services/thcsAutoMarking.service.ts` | **NEW** — MCQ auto-grading |
| `src/pages/THCSTestEditorPage.tsx` | **NEW** — Visual editor page |
| `src/pages/StudentTestPage.tsx` | **MODIFY** — Add testType check, render THCSTestLayout |
| `src/components/thcs/THCSTestLayout.tsx` | **NEW** — Student test layout |
| `src/components/thcs/THCSSectionNav.tsx` | **NEW** — Section-tabbed footer nav |
| `src/components/thcs/THCSQuestionBlock.tsx` | **NEW** — MCQ question display (student) |
| `src/components/thcs/THCSResultsView.tsx` | **NEW** — Results with section breakdown |
| `src/components/thcs/editor/*` | **NEW** — Editor components (section block, question block, answer key, metadata form) |
| `src/components/TestTypeSelectionModal.tsx` | **MODIFY** — Enable THCS-THPT option |
| `src/services/testStorage.ts` | **MODIFY** — Add 'THCS-THPT' to type union |
| `App.jsx` | **MODIFY** — Add routes for editor pages |
| `database.rules.json` | **MODIFY** — Add rules for thcs-specific paths if needed |
| `firestore.rules` | **MODIFY** — Add rules: `thcs_drafts` (read/write by owner uid only), `thcs_library` (read by all authenticated users, write by owner + super_admin) |
| `src/constants/routes.ts` | **MODIFY** — Add `TEACHER_THCS_CREATE` + `TEACHER_THCS_EDIT` |
| `src/__tests__/security/routeAccess.test.ts` | **MODIFY** — Add new routes to `ROUTE_CONFIG[]` |

### 7.3 Patterns to Follow
- Draft service: follow `draftCloudService.ts` → `testDraftService` pattern
- Test storage: follow `testStorage.ts` → `saveTestToFirebase` pattern
- Auto-marking: follow `autoMarking.service.ts` pattern
- Student page: follow `StudentTestPage.tsx` hook-based architecture
- Auto-save: follow `useTestAutoSave.ts` pattern

### 7.4 Integration Safety Rules Triggered

| Rule # | Trigger | Action Required |
|--------|---------|----------------|
| **Rule 1** | New routes `/teacher/thcs-test/*` | Validate against route registry |
| **Rule 8** | New components for editor/student view | Verify integration in parent pages |
| **Rule 12** | New Firestore collections `thcs_drafts`, `thcs_library` | Verify backup inclusion |

---

## 8. Success Metrics

1. Teacher can create a 40-question, 4-section THCS-THPT test in under 20 minutes
2. Student can complete and submit a THCS-THPT MCQ test with section navigation
3. Auto-grading produces correct scores for all MCQ questions within 2 seconds of submission
4. Results page shows accurate per-section breakdown with 10-point scale conversion
5. Draft auto-save prevents data loss (no user-reported lost work)
6. Test cards in Teacher Lobby correctly display THCS-THPT metadata

---

## 9. Edge Cases and Solutions

| # | Edge Case | Solution |
|---|-----------|----------|
| 1 | Section with 0 questions | Block publishing. Show validation: "Section 'PART A' has no questions." |
| 2 | Point values don't sum to 10 | Soft warning: "⚠️ Total: 8.5/10." Auto-scale uses actual total as denominator. |
| 3 | Teacher deletes last section | Block deletion: "A test must have at least one section." |
| 4 | Section `pointMode` switches to manual | All questions in section must be manually set. Show info banner. |
| 5 | Pronunciation options without underlines | Yellow validation warning. Allow publish but flag. |
| 6 | Error identification with ≠ 4 underlined parts | Block question save. Show: "Exactly 4 underlined parts required." |
| 7 | Student submits with unanswered questions | Show confirmation: "You have 5 unanswered questions. Submit anyway?" |
| 8 | Teacher edits published test (Phase 1) | Overwrite RTDB directly (no versioning in Phase 1). If sessions exist with this test, they use the updated version. |
| 9 | Same test used in session AND homework (Phase 3) | Separate result tracking. Phase 1: sessions only. |
| 10 | Long passage in single-column mode | Sticky passage header (title + first line pinned at top) + floating "📖 Show Passage" button (opens slide-up panel) when scrolled past passage. |
| 11 | Image upload fails | Show error toast. Question saves without image. Teacher can retry upload. |
| 12 | Auto-save conflict (multiple tabs) | Firestore handles via optimistic concurrency. Last write wins. Show warning if detected. |
| 13 | Global question renumbering on section reorder | Recalculate all `questionNumber` values sequentially on any section/question reorder. |
| 14 | section.totalPoints = 0 and pointMode = auto | Default section points to "auto" (display calculated value, e.g., "Auto: ~2.5pts"). Only shows 0 if teacher explicitly sets it. Warn: "⚠️ Section has 0 points — questions will earn 0 regardless of answers." |
| 15 | Delta changelog race condition (Phase 2) | Two teachers edit the same test simultaneously → overlapping changelog entries corrupt version history. Solution: Use RTDB `runTransaction()` for changelog writes. Before publishing, check if `_changelog` has been modified since editing began (optimistic lock). If yes, show: "This test was modified by another teacher. Please refresh and re-apply your changes." |

---

## 10. Open Questions

1. ~~Test versioning approach~~ → Resolved: Delta-based changelog (Phase 2 implementation)
2. ~~Storage architecture~~ → Resolved: Dual-storage (RTDB + Firestore)
3. ~~Phase scope~~ → Resolved: MCQ-only for Phase 1
4. Should the editor show a "Preview" button in Phase 1? → Decided: No. Form-based editor is WYSIWYG-enough. Static preview in Phase 2, interactive in Phase 2B.
5. How should the test appear in the Teacher Monitor page? → Same student progress cards as IELTS, with THCS-THPT section breakdown visible in StudentDetailModal.

---

## 11. Phase 2/3 Pre-Decisions (Locked)

> These decisions were made during the Socratic PRD process (6 rounds, Q1-Q55) and are **locked in** for future phases. Phase 2/3 PRDs MUST reference these — do NOT re-decide them.

### Phase 2 Pre-Decisions

| Decision | Source | Detail |
|----------|--------|--------|
| Grading Tab — Scope & Layout | Q32c | **All completed tests** appear in a "Results" sub-section of the Grading tab, with a **"Needs Review" filter toggle** to surface items requiring teacher grading. This is the overarching structural layout of the tab — not just a pending-items view. |
| Grading Tab — Organization | Q33d + EC8 | Within the tab above, default view is **by test** ("Midterm Exam — 15 students pending"), with toggle to **by-question batch mode** ("Q41 — 28 answers pending"). In batch mode, all student answers for the selected question are displayed **side-by-side** for efficient comparison grading. Aggregate counts, per-test progress bars ("Grading: 67% complete"), auto-sort by approaching deadlines. |
| Monitor Grading — Availability | Q34d | **Progressive unlock**: As each student submits, their writing becomes gradeable individually in the monitor page. NOT gated on all students submitting. |
| AI Writing Grading — Confidence Threshold | Q16d + Conflict 2 | Two-tier: fuzzy match against teacher's model answers, confidence ≥ 80% → auto-grade, < 80% → flag for teacher review. Sentence rewriting (E1, E2) defaults to "always flag" unless teacher explicitly enables auto-grading. |
| Partially Graded State | Conflict 3 | State machine: `submitted → auto-graded → partially-graded → fully-graded`. Student sees "Auto Score: 7/8 MCQ" + "2 writing Qs pending review." Notification sent when teacher finishes grading. |
| Preview as Student | Q36 | Phase 2A: **Static preview** (read-only rendering in drawer). Phase 2B: **Interactive preview** (full student simulation with timer, navigation, clicks — renders `StudentTestPage` with preview mode flag). |
| Real-Time Sync for Writing | Q53c | Writing answers sync every 10 seconds (not on every keystroke) to avoid teacher seeing incomplete sentences. MCQ syncs immediately (same as IELTS). |
| Cloze Word Bank Interaction | Q46a | **Dropdown** for each blank in the passage. Student selects from word bank. Drag-and-drop deferred beyond Phase 2. |
| Cloze Word Bank — Duplicate Words | EC14 | When two blanks share the same correct answer (e.g., "the" appears twice), the word bank must handle this: either show "the (×2)" to indicate count, OR words are NOT removed from the bank when selected (reusable). Teacher specifies a strict match count during creation. Words remaining in the bank after all blanks filled = distractors. |
| Verb/Word Form Grading | Q15c | Teacher provides primary answer(s), AI suggests additional acceptable variants, teacher approves/rejects. Normalize: trim, lowercase, strip trailing punctuation, handle Vietnamese keyboard diacritics, extra spaces, hyphenated alternatives. |

### Phase 3 Pre-Decisions

| Decision | Source | Detail |
|----------|--------|--------|
| Homework Deadline Policy | Q55d | Late submissions **accepted but marked as "Late."** Teacher configures per-homework: accept/reject/penalty. Teacher always has unlimited time to grade. |
| Notification Events | Q31e + Q31f | 6 event types: (1) Teacher assigns homework → student notified, (2) Student submits → teacher notified, (3) Teacher finishes grading → student notified, (4) Deadline approaching → student reminder, (5) Student achieves high score → teacher congrats notification, (6) Student doesn't start assigned homework → teacher alert. Daily digest mode to avoid notification stacking. |
| Library Architecture | Conflict 6 | **One unified `LibraryPage`** with top-level tab/filter for test type (IELTS / THCS-THPT). Shared: search, pagination, sort controls, card component. THCS cards show: grade, points, section breakdown. IELTS cards show: band target, skill, passage count. THCS-specific filters: grade (6-12), exam type (giữa kì, cuối kì, thi vào 10). NOT two separate library pages. |
| Question Shuffling (Mã Đề) | Q17c | Teacher chooses per assignment: fixed order OR auto-shuffle. Shuffle only WITHIN sections, never across sections (prevents passage detachment). Teacher monitor shows canonical question order; shuffleMap stored per-student for de-shuffling. |
| Homework Assignment Flow | Q38c | Both entry points: (1) From test card → "Assign as Homework" → select class → set deadline, (2) From Homework page → "Create Homework" → browse library → select test → set deadline. |
| Student Dashboard Cards | Q39c | Same homework feed as IELTS with type-specific card design. THCS cards show: total points, section breakdown. IELTS cards show: band target, skill. |
| Bulk Question Creation | Q40c | Both: (1) "Add N questions" bulk action (10 empty MCQ slots), (2) Quick-paste mode (formatted list parsed into blocks). |
| Timer Modes | Q29c | Teacher configurable per assignment. Strict mode: countdown + auto-submit on expiry + grace period. Informational mode: timer display only, no auto-submit. |
| Session + Homework Dual Mode | EC9 | Allowed, tracked separately. Live session results → `game_sessions/{code}/results/`. Homework results → `homework_submissions/{homeworkId}/{studentId}/`. If same student takes both, both preserved; Academic Record shows higher score (or both with labels). |
| Templates | Advice 1 | "Save as Template" — saves test structure (sections, intents, point distribution) without actual questions. Future tests start from template. |
| Answer Explanations | Advice 2 | Each question supports optional explanation field. Phase 1: teacher-written. Phase 2: AI suggestions based on answer key. Shown to students after submission in results view. |
| Academic Record Integration | Advice 4 | THCS-THPT results stored SEPARATELY from IELTS. IELTS → IELTS progression. THCS/THPT → THCS/THPT progression (separate section in student profile). Academic Record page groups by `testType`. |
