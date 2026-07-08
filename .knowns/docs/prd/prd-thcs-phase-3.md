---
title: PRD THCS Phase 3
createdAt: '2026-02-27T15:28:29.505Z'
updatedAt: '2026-02-27T15:28:30.985Z'
description: >-
  Product requirements for THCS/THPT test system Phase 3 - solo practice and
  homework
tags:
  - prd
  - thcs
  - phase3
---
# PRD-0029: THCS-THPT Test System — Phase 3 (Integrations + Polish)

**Version:** 1.0
**Created:** 2026-02-26
**Author:** AI (via Socratic PRD Process — 8 rounds, 70+ decisions)
**Status:** Draft
**Priority:** Medium (Feature Completion & Integration)
**Scope:** Phase 3 of 3 — Homework, Notifications, Library, Course, Shuffle, Templates, Polish
**Depends on:** PRD-0027 (Phase 1) ✅ + PRD-0028 (Phase 2) — MUST be fully implemented before starting Phase 3

---

## 1. Introduction / Overview

Phase 1 (PRD-0027) built the data model, MCQ editor, student view, and auto-grading foundation. Phase 2 (PRD-0028) expanded to full widget coverage, AI-assisted grading, a Grading tab, monitor integration, versioning, and preview. Phase 3 completes the system with:

1. **Homework assignment flow**: Assign THCS tests as homework via the existing `homeworkManager.ts`
2. **Notification extensions**: 6 new THCS-specific notification event types using the existing `notificationService.ts`
3. **THCS Library browsing**: Filter/search public THCS tests with clone & use-as-is options
4. **Course integration**: Link THCS tests to courses via the existing `courseManager.ts`, with progress tracking
5. **Question shuffling (mã đề)**: Teacher-configurable auto-shuffle within sections
6. **Test templates**: Save/load test structures without questions
7. **Bulk question creation**: "Add N questions" and quick-paste modes
8. **Drag-and-drop reordering**: Replace up/down buttons with dnd-kit drag reordering
9. **Auto test maker**: Upload .docx/.pdf of real test papers → auto-parse into structured editor with hybrid regex + AI
9. **Timer mode configuration**: Strict vs informational timer, default in metadata + per-assignment override
10. **Student dashboard integration**: THCS tests in unified feed with type-specific cards
11. **Academic record separation**: THCS/THPT scores contribute to their own progression, separate from IELTS

### Phasing Overview

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 (PRD-0027) | Data model, editor (MCQ only), student MCQ view, auto-grading, results | ✅ Implemented |
| Phase 2 (PRD-0028) | Fill-in + writing widgets, AI grading, Grading tab, monitor, versioning, preview | Phase 2 |
| **Phase 3 (this PRD)** | Homework, notifications, library, course, shuffling, templates, bulk ops, polish | 🔜 Current |

---

## 2. Goals

1. **G1:** Enable teachers to assign THCS-THPT tests as homework with deadline, class selection, and late submission policy.
2. **G2:** Extend the notification system with 6 THCS-specific event types for grading, submissions, and homework.
3. **G3:** Build a THCS library browsing UI with filtering, search, "Clone & Customize" and "Use as-is" options.
4. **G4:** Integrate THCS tests into the course system (link tests to course modules, progress tracking).
5. **G5:** Implement question shuffling (mã đề) with teacher-configurable per-section randomization.
6. **G6:** Add "Save as Template" and "Start from Template" to accelerate test creation.
7. **G7:** Add bulk question creation: "Add N" button and paste-from-clipboard.
8. **G8:** Replace up/down buttons with drag-and-drop reordering (dnd-kit).
9. **G9:** Configure timer modes (strict/informational) with defaults + per-assignment override.
10. **G10:** Display THCS tests in the student dashboard feed, with type-specific cards.
11. **G11:** Separate THCS/THPT academic records from IELTS progression tracking.
12. **G12:** Enable auto test creation from uploaded .docx/.pdf files, parsing questions, sections, and answer keys with ≥90% accuracy for standard THCS/THPT format tests.

---

## 3. User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|------------|
| US-30 | Teacher | Assign a THCS test as homework with a deadline | My students can practice asynchronously |
| US-31 | Teacher | Configure late submission policy per assignment | I control whether late submissions are accepted or penalized |
| US-32 | Student | Get notified when I have new THCS homework | I don't miss assignments |
| US-33 | Student | Get notified when my writing grade is finalized | I can review my full score |
| US-34 | Teacher | Browse public THCS tests by grade level, exam type, and keyword | I can find and reuse quality tests |
| US-35 | Teacher | Clone a public test and customize it for my class | I can modify questions without affecting the original |
| US-36 | Teacher | Use a public test directly without cloning | I can quickly assign a ready-made test |
| US-37 | Teacher | Link THCS tests to my course modules | My students see a structured learning path |
| US-38 | Student | See THCS test progress in my course dashboard | I know which tests I've completed in the course |
| US-39 | Teacher | Enable question shuffling per section | Each student gets a different question order (mã đề) |
| US-40 | Teacher | Save a test structure as a template | I can reuse the same exam format without re-creating sections |
| US-41 | Teacher | Create a new test from an existing template | I save time on exam creation |
| US-42 | Teacher | Add 5 questions at once with the same type | I can rapidly build a section |
| US-43 | Teacher | Paste multiple questions from clipboard | I can import questions from external sources |
| US-44 | Teacher | Drag questions and sections to reorder them | I can intuitively rearrange my test |
| US-45 | Teacher | Set timer to "informational" for some homework assignments | Students see the timer but aren't auto-submitted |
| US-46 | Student | See THCS homework and test results in my dashboard | I have one place for all my work |
| US-47 | Student | See my THCS score progression separate from IELTS | My THCS improvement is tracked independently |
| US-48 | Teacher | Upload a .docx or .pdf of an existing test paper and have it auto-parsed | I don't have to manually re-type every question from a paper test |
| US-49 | Teacher | Review and correct the auto-parsed test before publishing | I can verify accuracy and fix any parsing errors |
| US-50 | Teacher | See the answer key auto-extracted from the document | I don't have to manually re-enter all answer keys |

---

## 4. Functional Requirements

### 4.1 Homework Assignment Flow

#### 4.1.1 Entry Points

Per locked decision (Q36c): Both entry points:

**Entry Point A — From Teacher Lobby (test card):**
```
┌─ Test Card ────────────────────────┐
│ [Edit] [Delete] [Start Test]       │
│ [📋 Assign Homework]               │  ← New button
└────────────────────────────────────┘
```

**Entry Point B — From Homework List Page:**
```
TeacherHomeworkListPage → [+ Create Homework]
  → Material Selection Modal
    → (existing IELTS tests list)
    → (new) THCS-THPT Tests tab  ← Filter tests by testType === 'THCS-THPT'
```

#### 4.1.2 Homework Assignment Dialog

Per locked decision (Q6b): Extend the existing homework system, NOT a separate collection.

The existing `CreateHomeworkInput` in `homeworkManager.ts` has:
```typescript
materialType?: 'quiz' | 'test';
```

**Extend to:**
```typescript
materialType?: 'quiz' | 'test' | 'thcs-test';
```

The assignment dialog reuses the existing homework creation flow:

```
┌─ Assign THCS-THPT Homework ──────────────────────────────────┐
│                                                               │
│ Test: [Đề kiểm tra giữa kì 1 - Lớp 9]                      │
│                                                               │
│ Target:                                                       │
│ ○ Class: [Lớp 9A ▼]                                         │
│ ○ Course: [THCS English ▼]                                   │
│ ○ Individual Students: [Select...]                           │
│                                                               │
│ Timer Mode:                                                   │
│ Default from test: ● Strict (45 min)                         │
│ Override: ○ Strict ○ Informational ○ No timer                │
│                                                               │
│ Schedule:                                                     │
│ Available From: [2026-02-27]                                 │
│ Due Date:       [2026-03-03]                                 │
│                                                               │
│ Late Submission Policy:                                       │
│ ○ Accept (no penalty)                                        │
│ ● Accept (marked as "Late")                                  │
│ ○ Reject after deadline                                      │
│ ○ Custom penalty: Deduct [__]% from total score              │
│                                                               │
│ Max Attempts: [1 ▼]                                          │
│ Feedback: [After submission ▼]                                │
│ Instructions: [Optional teacher notes...]                     │
│                                                               │
│ Version: v3 (latest) — uses current published version        │
│  ☑ Pin to this version (students get v3 even if test edited) │
│                                                               │
│ [Cancel] [Assign Homework ✅]                                 │
└───────────────────────────────────────────────────────────────┘
```

**Timer Mode (per Q8c):**
- Default comes from test metadata (set in editor)
- Per-assignment override available in the dialog
- Options: `strict` (auto-submit at 0:00), `informational` (timer shown but no auto-submit), `none` (no timer)

**Late Submission Policy (per Q55d):**
- Teacher configures per assignment
- Options: accept (no mark), accept with "Late" label, reject, or custom percentage penalty

**Version Pinning (per Q15c):**
- Assignment record stores `versionKey` (Phase 2 feature)
- Checkbox: "Pin to this version" — default checked
- If checked: `_cachedVersion` snapshot stored with assignment
- If unchecked: students always get latest version (test can change after assignment)

#### 4.1.3 Student Homework Experience

When student opens THCS homework from their dashboard:

1. Student sees homework card with title, deadline, attempt count, timer info
2. Click "Start" → load test data from `_cachedVersion` (if pinned) or current test
3. Same test-taking experience as live session (THCSTestLayout), but:
   - No session code (standalone mode)
   - Timer mode per assignment config
   - Submission stores result in `homework_submissions/` collection
4. After submission: auto-grade MCQ + fill-in, writing flagged for teacher review
5. Teacher grading flow same as Phase 2 (Grading tab shows homework results)

#### 4.1.4 Homework Result Storage

Extend existing `homework_submissions/` Firestore collection:

```typescript
// In homework_submissions/{submissionId}:
{
  // Existing fields from HomeworkSubmission type
  homeworkId: string;
  studentId: string;
  submittedAt: number;
  // ... existing fields ...

  // THCS-specific extension:
  thcsData?: {
    scaledScore: number;        // 0-10
    rawScore: number;           // Raw points earned
    totalPoints: number;        // Total possible points
    sectionResults: THCSSectionResult[];
    gradingStatus: THCSGradingStatus;
    questionResults: THCSQuestionResult[];
  };
}
```

#### 4.1.5 Deadline Behavior for Partially-Graded Tests

Per locked decision (Q55d): Teacher configures late submission policy per assignment.

```
Deadline passes:
  ├── Late submission policy: "Accept"
  │   └── Students can still submit. Marked as "Late" in submission record.
  ├── Late submission policy: "Reject"
  │   └── Student sees "Deadline passed. Submissions are closed." No submit button.
  ├── Late submission policy: "Penalty"
  │   └── Student can submit. Score reduced by configured percentage.
  └── Teacher grading: ALWAYS available regardless of deadline
      └── Teacher has unlimited time to grade pending writing items
```

### 4.2 Notification Extensions

#### 4.2.1 New THCS Notification Types

Per user decision (Q9a): Extend the existing `notificationService.ts` with 6 new event types.

The existing service already handles:
- `sendFeedbackNotification` (writing/speaking feedback)
- `sendReviewedNotification` (writing/speaking reviewed)
- `sendHomeworkAssignedNotification`
- `sendHomeworkDueSoonNotification`
- `sendHomeworkSubmittedNotification`

**New notification functions to add:**

| # | Function | Trigger | Recipient |
|---|----------|---------|-----------|
| 1 | `sendThcsHomeworkAssignedNotification` | Teacher assigns THCS homework | All target students |
| 2 | `sendThcsGradeUpdatedNotification` | Teacher grades a writing question | The student |
| 3 | `sendThcsFullyGradedNotification` | Last writing question graded → `fully-graded` | The student |
| 4 | `sendThcsHomeworkDueSoonNotification` | 24h before deadline (auto, via deadline reminder service) | Students who haven't submitted |
| 5 | `sendThcsSubmittedNotification` | Student submits THCS homework | The student (confirmation) |
| 6 | `sendThcsLateSubmissionNotification` | Student submits after deadline (if accepted) | The student + the teacher |

> **Implementation note:** These follow the exact same pattern as existing homework notification functions. They create a notification record in RTDB under `notifications/{userId}/{notificationId}`.

**Notification message templates:**

```typescript
// Example for sendThcsGradeUpdatedNotification:
{
  type: 'thcs_grade_updated',
  title: 'Grade Updated',
  message: `Your answer for Q${questionNumber} in "${testTitle}" has been graded.`,
  link: `/student/results/${resultId}`,
  icon: '📝',
  createdAt: Date.now(),
  readAt: null,
}
```

#### 4.2.2 Integration Points

- **Trigger 1-2**: From `TeacherGradingPage.tsx` and `TeacherTestMonitorPage.tsx` grading inline panel (Phase 2 components)
- **Trigger 3**: From grading submission flow when `gradingStatus` transitions to `fully-graded`
- **Trigger 4**: From existing `deadlineReminderService.ts` — extend to check `materialType === 'thcs-test'`
- **Trigger 5-6**: From `THCSTestLayout.tsx` submission flow (homework mode)

### 4.3 THCS Library Browsing

#### 4.3.1 Library UI — New Sub-Filter in Teacher Lobby

Currently, the Teacher Lobby's "test" view has two content filters: "My Content" and "Public Library". For THCS tests in the public library, add **type filters**:

```
┌─ Teacher Lobby — Tests ─────── [My Content ▼] ──────────────┐
│                                                               │
│ Filter: [All Types ▼]  [Grade: All ▼]  [Exam: All ▼]        │
│         ├ IELTS                                               │
│         ├ THCS-THPT                                          │
│         └ All                                                │
│                                                               │
│ Search: [🔍 Search by title or keyword...]                   │
│                                                               │
│ Results:                                                      │
│ (test cards filtered by type selection)                       │
└───────────────────────────────────────────────────────────────┘
```

When a THCS test from the public library is shown, its card has two action buttons:

```
┌─ Đề kiểm tra cuối kì 2 - Lớp 10 ──── by Teacher Nguyễn ───┐
│ THCS-THPT | Grade 10 | Cuối Kì | 45 min | 40 Qs           │
│                                                              │
│ [📋 Use as-is]  [📄 Clone & Customize]                      │
└──────────────────────────────────────────────────────────────┘
```

> 2026-07-08 supersession: linked/use-as-is THCS references are not My
> Content. The old linked-reference My Content rule below is retired. My
> Content is current-account owned MaterialSummary `by_owner/{uid}` rows only;
> linked references need a separate Saved/Linked surface if the product needs
> them.

#### 4.3.2 "Use as-is" Flow

1. Teacher clicks "Use as-is"
2. Show confirmation: "This test will be used as-is. You cannot modify it. The original teacher retains ownership."
3. Two sub-options:
   - "Start Live Session" → creates session with this test ID
   - "Assign as Homework" → opens homework assignment dialog with this test ID
4. The test appears in the teacher's "My Content" as a **linked reference** (not a copy)
5. If the original teacher deletes the test → linked references show "Test unavailable"

#### 4.3.3 "Clone & Customize" Flow

1. Teacher clicks "Clone & Customize"
2. System copies the published test into a new `thcs_drafts/` document:
   - New document ID
   - `ownerId` = current teacher
   - `clonedFrom` = original test ID (metadata for provenance)
   - All sections, questions, answers copied
3. Editor opens with the cloned draft
4. Teacher modifies as needed → publish creates a new independent `tests/` entry
5. No link to original — changes to original don't affect the clone

#### 4.3.4 Library Data Source

The existing `thcs_library/` Firestore collection (created in Phase 1 on publish) stores:

```typescript
// thcs_library/{testId}:
{
  title: string;
  gradeLevel: number;
  examType: string;
  duration: number;
  questionCount: number;
  sectionCount: number;
  ownerId: string;
  ownerName: string;
  publishedAt: number;
  isPublic: boolean;  // Only public tests appear in library
  tags: string[];     // Searchable keywords
}
```

**Queries:**
- Filter by `gradeLevel` (Firestore `where`)
- Filter by `examType` (Firestore `where`)
- Search by `title` (client-side search within loaded results, or Firestore `where` on `tags` array-contains)
- Sort by `publishedAt` (newest first)
- Pagination: Firestore cursor (`startAfter`)

### 4.4 Course Integration

#### 4.4.1 Linking THCS Tests to Courses

Per user decision (Q10d): Same as existing course system — add THCS-THPT tests to whatever course/class system currently exists.

The existing `courseManager.ts` has a **module system** with **material linking**:
```typescript
// CourseMaterial links a materialId (test/quiz) to a courseId/moduleId
interface CourseMaterial {
  id: string;
  courseId: string;
  moduleId: string;
  materialId: string;   // Can now be a THCS test ID
  order: number;
  isCopy: boolean;
  originalMaterialId?: string;
  syncedAt?: number;
}
```

The `CourseType` already includes `'THCS' | 'THPT'`:
```typescript
export type CourseType = 'IELTS' | 'THCS' | 'THPT' | 'TOEIC' | 'Communicative' | 'Other' | string;
```

**Changes needed:**
1. **Material linking UI** (`TeacherCourseProfilePage.tsx`): When adding materials to a course module, show both IELTS tests AND THCS tests. THCS tests are identifiable by their `testType === 'THCS-THPT'` flag.
2. **Student course view** (`StudentCourseDetailPage.tsx`): When displaying course materials, detect THCS tests and route to the correct test-taking flow.
3. **Progress tracking**: `StudentCourseProgress.completedMaterials[materialId]` already stores `{ completedAt, score }`. For THCS tests, the `score` is the `scaledScore` (0-10 scale).

#### 4.4.2 Student Course Material Navigation

When student views a course module containing a THCS test:

```
┌─ Module 3: Grammar & Reading Practice ────────────────────┐
│                                                            │
│ 1. ✅ Reading Passage Practice (IELTS) — Score: 7/9       │
│ 2. 🔸 Đề ôn tập Unit 5 (THCS) — Not started              │  ← THCS badge
│ 3. 🔒 Final Test (locked until #2 completed)               │
│                                                            │
│ Click a material to start.                                 │
└────────────────────────────────────────────────────────────┘
```

Clicking a THCS test material → routes to `/student/test/{sessionCode}` with test loaded from the course context (no live session needed — uses module access rules).

### 4.5 Question Shuffling (Mã Đề)

#### 4.5.1 Teacher Configuration

Per locked decisions (Q24c, Q25c): Teacher-configurable, auto-shuffle within sections only.

In the section block (editor):
```
┌─ Section A: Pronunciation ──────── Points: 1.0 ──────────┐
│ ...existing section controls...                           │
│                                                           │
│ ⚙️ Question Order:                                        │
│ ○ Fixed order (all students see same order)               │
│ ● Shuffle within this section                             │
│   ☑ Shuffle options within MCQ questions (A↔B↔C↔D)       │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

**Options per section:**
1. **Fixed order**: Questions appear in the order defined by the teacher (default)
2. **Shuffle within section**: Questions are randomized per student. Option order within MCQ questions can also be shuffled (sub-checkbox)

**Constraints:**
- Shuffling only happens **within a section**, never across sections
- Reading comprehension sections with passages: questions are shuffled but the passage order is preserved
- For fill-in and cloze questions: shuffling only applies to the question order, not the blank order within a question

#### 4.5.2 Shuffle Implementation

```typescript
// On student test load (THCSTestLayout.tsx):

function shuffleTest(test: THCSTest, studentUid: string): THCSTest {
  const rng = seedRandom(studentUid + test.testId); // Deterministic per student

  return {
    ...test,
    sections: test.sections.map(section => {
      if (!section.shuffle) return section;

      let shuffledQuestions = [...section.questions];
      shuffledQuestions = fisherYatesShuffle(shuffledQuestions, rng);

      if (section.shuffleOptions) {
        shuffledQuestions = shuffledQuestions.map(q => {
          if (q.type.startsWith('mcq') && q.options) {
            return { ...q, options: fisherYatesShuffle([...q.options], rng) };
          }
          return q;
        });
      }

      return { ...section, questions: shuffledQuestions };
    }),
  };
}
```

- **Deterministic shuffle**: Uses seeded PRNG with `studentUid + testId` as seed. Same student always gets the same order. Different students get different orders.
- **Answer key mapping**: When shuffled, the `correctAnswer` index is remapped. For shuffled options (MCQ), the answer letter maps to the new position.
- **Storage note**: Student answers are stored by original question ID, not shuffled index. Grading uses the original question's answer key.

#### 4.5.3 Data Model Extension

Add to `THCSSection`:
```typescript
// Extend THCSSection interface:
shuffle?: boolean;           // Default false
shuffleOptions?: boolean;    // Default false, only applicable if shuffle=true
```

### 4.6 Test Templates

#### 4.6.1 Save as Template

Per locked decision (Advice 1 from original process):

When teacher has a completed test, they can save its structure as a template:

```
Editor → [⋮ More] → "Save as Template"
  → Template Name: [Đề kiểm tra giữa kì - Mẫu chuẩn]
  → Template Description: [Standard mid-term format: 4 parts, 40 Qs]
  → [Save Template ✅]
```

**What a template stores:**
```typescript
// Firestore: thcs_templates/{templateId}
interface THCSTestTemplate {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  isPublic: boolean;
  createdAt: number;

  // Structure only — NO question content
  metadata: {
    gradeLevel: number;
    examType: string;
    difficulty: string;
    duration: number;
  };
  sections: Array<{
    name: string;
    instruction: string;
    layout: 'single-column' | 'two-column';
    defaultQuestionType: THCSQuestionType;
    questionCount: number;  // How many question placeholders
    pointsPerQuestion: number;
    sectionPoints: number;
    shuffle: boolean;
    shuffleOptions: boolean;
  }>;
}
```

**Key:** Templates store **structure** (section names, point distribution, question types, counts) but NOT actual question content. Questions are not included.

#### 4.6.2 Create from Template

When teacher clicks "Create New Test":

```
┌─ New THCS-THPT Test ────────────────────────────────────────┐
│                                                              │
│ Start From:                                                  │
│ ○ Blank (empty test)                                        │
│ ● Template:                                                  │
│   ┌─ My Templates ──────────────────────────────────────┐   │
│   │ ● Đề kiểm tra giữa kì - Mẫu chuẩn                │   │
│   │   4 parts, 40 Qs, 45 min                            │   │
│   │ ○ Đề kiểm tra cuối kì - Nâng cao                   │   │
│   │   5 parts, 50 Qs, 60 min                            │   │
│   └─────────────────────────────────────────────────────┘   │
│   ┌─ Public Templates ─────────────────────────────────┐   │
│   │ ○ THCS Lớp 9 Standard (by Teacher Nguyen)          │   │
│   │ ○ THPT Lớp 12 Advanced (by Teacher Tran)           │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│ [Cancel] [Create Test →]                                    │
└──────────────────────────────────────────────────────────────┘
```

On selection:
1. Create new draft in `thcs_drafts/`
2. Pre-populate all metadata and section structure from template
3. Each section gets N empty question placeholders (matching template's `questionCount`)
4. Teacher fills in the actual questions
5. Normal publish flow from there

#### 4.6.3 Firestore Rules for Templates

```javascript
match /thcs_templates/{templateId} {
  allow read: if request.auth != null && (
    resource.data.isPublic == true || resource.data.ownerId == request.auth.uid
  );
  allow create: if request.auth != null && request.resource.data.ownerId == request.auth.uid;
  allow update, delete: if request.auth != null && resource.data.ownerId == request.auth.uid;
}
```

### 4.7 Bulk Question Creation

#### 4.7.1 "Add N Questions" Button

In each section block, next to the existing "+ Add Question" button:

```
[+ Add Question] [+ Add 5 ▼]
                   ├── Add 5
                   ├── Add 10
                   ├── Add 20
                   └── Custom: [__]
```

Creates N empty question blocks of the section's `defaultQuestionType` intent. All questions start with empty text, no options, no answers. Sequential numbering continues from last question.

#### 4.7.2 Quick-Paste Mode

```
[+ Add Question] [+ Add 5 ▼] [📋 Paste Questions]
```

"Paste Questions" opens a modal:

```
┌─ Paste Questions ─────────────────────────────────────────┐
│                                                            │
│ Format: [MCQ (1 per line) ▼]                              │
│                                                            │
│ Paste your questions below:                               │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ 1. She ___ (go) to school every day.                 │  │
│ │ A. goes    B. go    C. going    D. gone              │  │
│ │ Answer: A                                            │  │
│ │                                                      │  │
│ │ 2. They ___ (play) football yesterday.               │  │
│ │ A. played  B. play  C. playing  D. plays             │  │
│ │ Answer: A                                            │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│ Preview: 2 questions detected                             │
│                                                            │
│ [Cancel] [Import 2 Questions →]                           │
└────────────────────────────────────────────────────────────┘
```

**Parsing logic:**
- Detect question patterns: numbered lines followed by A/B/C/D options
- Extract answer key from "Answer:" lines
- For fill-in: detect `___` markers and "Answer:" lines
- Show preview count before importing
- Imported questions are added to the current section as pre-filled blocks

**Implementation:** Create `src/utils/thcsQuestionParser.ts`:
```typescript
interface ParsedQuestion {
  text: string;
  type: THCSQuestionType;
  options?: string[];
  correctAnswer?: string;
  blankCount?: number;
  blankAnswers?: string[][];
}

function parseQuestionText(text: string, format: 'mcq' | 'fill-in'): ParsedQuestion[];
```

### 4.8 Drag-and-Drop Reordering

#### 4.8.1 Implementation

Replace the existing up/down arrow buttons (Phase 1) with dnd-kit drag handles:

**Section-level reordering:**
- Each section block gets a drag handle (⋮⋮) on the left
- Sections can be dragged to reorder
- All questions within a section move with it

**Question-level reordering:**
- Each question block gets a drag handle (⋮⋮) on the left
- Questions can be dragged within their section
- Cross-section question moves: NOT supported (drag constrained to parent section)

**Library:** dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`, already used in the project)

> ⚠️ **Integration Safety Rule #4** (Force Re-measurement After Paint): After drag completes, call `requestAnimationFrame()` then `sensor.measure()` to re-measure the new layout. This prevents layout shift bugs.

> ⚠️ **Integration Safety Rule #5** (No setPointerCapture on Draggables): Do NOT use `setPointerCapture()` on any element that is a dnd-kit draggable. This breaks drag gestures.

#### 4.8.2 Data Sync After Reorder

After drag ends:
1. Update the local state array order
2. Trigger auto-save (debounced 2s, existing flow)
3. Re-number questions sequentially based on new order

### 4.9 Timer Mode Configuration

#### 4.9.1 Default in Test Metadata

Add to the metadata panel in the editor:

```
Timer Mode: ○ Strict (auto-submit at 0:00)
            ● Informational (timer shown, no auto-submit)
            ○ None (no timer)
```

This sets the **default** timer behavior. Stored in `THCSTestMetadata`:
```typescript
timerMode?: 'strict' | 'informational' | 'none';  // Default: 'strict'
```

#### 4.9.2 Per-Assignment Override

Per user decision (Q8c): Default in metadata, overridable per assignment.

In the homework assignment dialog (§4.1.2), the timer mode shows:
```
Timer Mode:
Default from test: ● Strict (45 min)
Override: ○ Strict ○ Informational ○ No timer
```

If teacher selects an override, the `HomeworkAssignment` record stores:
```typescript
// In homework_assignments/{id}:
thcsConfig?: {
  timerModeOverride?: 'strict' | 'informational' | 'none';
};
```

The student test layout checks: `homeworkConfig.timerModeOverride ?? testMetadata.timerMode ?? 'strict'`

### 4.10 Student Dashboard Integration

#### 4.10.1 Unified Feed with Type-Specific Cards

Per locked decision (Q38c): Unified feed with type-specific card design.

In `StudentDashboardPage.jsx`, the feed currently shows:
- Upcoming homework (from `getHomeworkForStudent()`)
- Live sessions (from RTDB `game_sessions/`)
- Recent results (from `testResults/`)

**Add THCS-THPT items to the feed:**

```
┌─ Student Dashboard ──────────────────────────────────────────┐
│                                                               │
│ ┌─ 📝 Đề kiểm tra giữa kì 1 ─── THCS-THPT ── Due: 3 days ┐│
│ │ Grade 9 | 40 questions | 45 min                           ││
│ │ Status: Not started                                        ││
│ │ [Start Test →]                                             ││
│ └────────────────────────────────────────────────────────────┘│
│                                                               │
│ ┌─ 📖 IELTS Reading Practice ──── IELTS ──── Scored ────────┐│
│ │ Reading | 40 questions | Score: 7/9                        ││
│ │ [Review →]                                                 ││
│ └────────────────────────────────────────────────────────────┘│
│                                                               │
│ ┌─ 📝 Ôn tập Unit 5 ─── THCS-THPT ──── Score: 8.3/10 ─────┐│
│ │ Grade 10 | 35 questions | Grading: Partial (2 pending)    ││
│ │ [View Results →]                                           ││
│ └────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────┘
```

**THCS-THPT card design:**
- Violet left border or badge (consistent with lobby card styling)
- Shows: grade level, question count, duration
- For homework: deadline, status (not started / in progress / submitted)
- For completed: score on 10-point scale, grading status badge

### 4.11 Academic Record Separation

#### 4.11.1 THCS/THPT Progression Tracking

Per user decision (Q10 — separate record): IELTS results contribute to IELTS progression, THCS/THPT results contribute to their own progression.

The existing `AcademicRecord` system (PRD-0015) tracks:
```typescript
// academicRecord.types.ts
interface AcademicRecord {
  studentId: string;
  // IELTS-specific progression...
  skillScores: { reading: number, listening: number, writing: number, speaking: number };
}
```

**Extend with THCS/THPT section:**
```typescript
interface AcademicRecord {
  // ... existing IELTS fields ...

  thcsProgress?: {
    testsCompleted: number;
    averageScore: number;         // 0-10 scale
    scoreHistory: Array<{
      testId: string;
      testTitle: string;
      score: number;              // 0-10
      date: number;
      gradeLevel: number;
      examType: string;
    }>;
    // Skill area breakdown (computed from section types)
    skillBreakdown?: {
      pronunciation: { average: number; count: number };
      grammar: { average: number; count: number };
      vocabulary: { average: number; count: number };
      reading: { average: number; count: number };
      writing: { average: number; count: number };
    };
    lastUpdated: number;
  };
}
```

**Display:** In the student's Academic Record page (`AcademicRecordPage.tsx`):
- New tab: "THCS/THPT" alongside "IELTS"
- Shows: score trend graph, skill breakdown radar chart, test history table
- Score trend: Line graph of scaledScore over time (0-10 scale)

#### 4.11.2 Automatic Record Update

After THCS test grading is `fully-graded`:
1. Update `thcsProgress.testsCompleted++`
2. Add entry to `scoreHistory`
3. Recalculate `averageScore` (running average)
4. Update `skillBreakdown` based on section question types (map section intent to skill area)
5. Update `lastUpdated`

Implementation: Extend the existing results service hook that fires after grading completion.

### 4.12 Auto Test Making (Document-to-Test Parser)

#### 4.12.1 Overview

Teachers should be able to upload an existing test document (.docx, .pdf, .txt) and have it automatically parsed into a fully structured test in the editor. This leverages the existing IELTS file extraction pipeline (`file.extractor.ts`, `ai-extractor.service.ts`) but with a **THCS-specific parser** that is significantly more reliable due to predictable THCS formatting.

**Why THCS parsing is easier than IELTS:**

| Factor | IELTS (existing) | THCS (new) |
|--------|-------------------|------------|
| Question numbering | Scattered across passage blocks | Sequential: Q1, Q2, Q3... |
| Type signals | Ambiguous (TFNG vs YNNG look identical) | Explicit instruction keywords |
| Options format | Mixed: words, phrases, paragraphs | Almost always A/B/C/D |
| Answer key | Varied formats, often missing | Standardized "Đáp án" section |
| Section boundaries | Hard to detect | Clear headers: "Part A", "Section I" |
| Parse approach | Heavy AI (2+ API calls) | Hybrid: regex first, AI assist only |
| Expected accuracy | ~70-80% | ~90-95% |

#### 4.12.2 Entry Point

Add a new option to the test creation flow:

```
┌─ New THCS-THPT Test ────────────────────────────────────────┐
│                                                              │
│ Start From:                                                  │
│ ○ Blank (empty test)                                        │
│ ○ Template (existing — §4.6)                                │
│ ● Upload Document (auto-parse):                             │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │  📄 Drag & drop or click to upload                   │  │
│   │  Supported: .docx, .pdf, .txt                        │  │
│   │  Max size: 10MB                                      │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
│ [Cancel] [Upload & Parse →]                                 │
└──────────────────────────────────────────────────────────────┘
```

Uses the existing `extractTextFromFile()` from `src/services/file-extractor/file.extractor.ts` for file → text conversion.

#### 4.12.3 Three-Layer Parsing Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: REGEX STRUCTURAL PARSER (instant, no API)         │
│                                                             │
│ Input: raw text from file extractor                         │
│ Output: sections[], questions[], answerKey{}                │
│ Confidence: 85-95% for standard format                      │
│                                                             │
│ Detects via regex:                                          │
│ • Questions:  /^(?:Question|Câu)\s+(\d+)\s*[:.]?/i         │
│ • Options:    /^\s*[ABCD][.)\s]\s*(.+)/                    │
│ • Sections:   /^(?:Part|Section|Phần)\s+[A-Z0-9IViv]+/i    │
│ • Fill blanks: /_{2,}\s*\([^)]+\)/                          │
│ • Rewrite:    /(?:rewrite|viết lại|complete.*sentence)/i    │
│ • Passages:   /(?:read the following|đọc (?:đoạn|bài))/i   │
│ • Answer key: /(?:đáp án|answer key|keys?)/i                │
│ • Points:     /(\d+(?:\.\d+)?)\s*(?:điểm|points?|marks?)/i │
│ • Ordering:   /(?:arrange|sắp xếp|correct arrangement)/i   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ LAYER 2: INSTRUCTION-TO-TYPE CLASSIFIER (local, no API)    │
│                                                             │
│ Maps instruction text to THCSQuestionType:                   │
│                                                             │
│ "word whose underlined part differs...pronunciation"         │
│   → mcq-pronunciation                                       │
│ "word that differs...position of stress"                     │
│   → mcq-stress                                               │
│ "correct answer to each of the following"                    │
│   → mcq-grammar (default for generic MCQ)                    │
│ "read the following...announcement"                          │
│   → reading-announcement + reading-cloze-mcq                 │
│ "correct arrangement of the sentences"                       │
│   → sentence-ordering                                        │
│ "correct option that best fits each...numbered blanks"       │
│   → reading-cloze-mcq                                        │
│ "read the following passage...correct answer"                │
│   → reading-comprehension                                    │
│ "supply the correct form of the verb"                        │
│   → verb-form                                                │
│ "correct form of the word"                                   │
│   → word-form                                                │
│ "rewrite...so that it has the same meaning"                  │
│   → sentence-rewrite                                         │
│ "rewrite...using the given word"                             │
│   → sentence-rewrite-keyword                                 │
│ "fill in...word bank / word from the box"                    │
│   → reading-cloze-wordbank                                   │
│                                                             │
│ Confidence: per-match, based on keyword match quality        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ LAYER 3: AI POLISH (1 API call, only if needed)            │
│                                                             │
│ Triggered only for items with confidence < 75%:              │
│ • Ambiguous question types (grammar vs vocabulary?)          │
│ • Unclear section boundaries                                 │
│ • Non-standard instruction formats                           │
│                                                             │
│ Uses: aiService router (Gemini first, Groq fallback)         │
│ Prompt: focused THCS classification (NOT full extraction)    │
│ Cost: ~$0.00-0.01 per parse (vs $0.02-0.05 for IELTS)       │
└─────────────────────────────────────────────────────────────┘
```

#### 4.12.4 Implementation: `thcsDocumentParser.service.ts`

```typescript
// NEW FILE: src/services/test-creation/thcsDocumentParser.service.ts

import { extractTextFromFile } from '../file-extractor/file.extractor';
import { aiService } from '../ai/router.service';
import type { THCSTest, THCSSection, THCSQuestion } from '../../types/thcs-test.types';

// ─── Types ───────────────────────────────────────────────────

interface ParseProgress {
  stage: 'extracting' | 'detecting-sections' | 'parsing-questions' | 
         'classifying-types' | 'extracting-answers' | 'ai-polish' | 'complete';
  percent: number;
  message: string;
  sectionsFound?: number;
  questionsFound?: number;
  answersFound?: number;
}

interface ParsedTest {
  metadata: {
    title?: string;
    gradeLevel?: number;
    duration?: number;
    examType?: string;
  };
  sections: ParsedSection[];
  answerKey: Record<number, string | string[]>;
  confidence: number;            // 0-100 overall
  warnings: ParseWarning[];
  ambiguousItems: AmbiguousItem[];  // Items that need AI or teacher review
}

interface ParseWarning {
  type: 'missing-answer' | 'ambiguous-type' | 'malformed-question' | 
        'section-boundary' | 'skipped-content';
  questionNumber?: number;
  message: string;
}

interface AmbiguousItem {
  questionNumber: number;
  possibleTypes: Array<{ type: string; confidence: number }>;
  resolved: boolean;
}

// ─── Regex Patterns ──────────────────────────────────────────

const PATTERNS = {
  question: /^(?:Question|Câu)\s+(\d+)\s*[:.]?\s*(.*)/i,
  optionLine: /^\s*([ABCD])[.)\s]\s*(.+)/,
  sectionHeader: /^(?:Part|Section|Phần|Mục)\s+([A-Z0-9IViv]+)\s*[:.]?\s*(.*)/i,
  passageMarker: /(?:read the following|đọc (?:đoạn|bài|thông báo))/i,
  answerKeyHeader: /(?:đáp án|answer key|keys?\s*[:.])/i,
  answerKeyLine: /(?:Câu|Question|Q)\s*(\d+)\s*[:.]?\s*([ABCD])/i,
  fillBlank: /_{2,}/g,
  pointAllocation: /(\d+(?:\.\d+)?)\s*(?:điểm|points?|marks?)/i,
  duration: /(\d+)\s*(?:phút|minutes?|mins?)/i,
  gradeLevel: /(?:lớp|grade|class)\s*(\d+)/i,
} as const;

// ─── Instruction → Type Mapping ──────────────────────────────

const INSTRUCTION_TYPE_MAP: Array<{ pattern: RegExp; type: string; confidence: number }> = [
  { pattern: /underlined.*(?:differ|pronunciation|phát âm)/i, type: 'mcq-pronunciation', confidence: 95 },
  { pattern: /(?:stress|trọng âm)/i, type: 'mcq-stress', confidence: 95 },
  { pattern: /(?:announcement|thông báo)/i, type: 'reading-announcement', confidence: 90 },
  { pattern: /(?:arrangement.*sentence|sắp xếp)/i, type: 'sentence-ordering', confidence: 95 },
  { pattern: /supply.*correct form.*verb/i, type: 'verb-form', confidence: 95 },
  { pattern: /correct form.*word/i, type: 'word-form', confidence: 95 },
  { pattern: /rewrite.*(?:same meaning|given word|using)/i, type: 'sentence-rewrite', confidence: 90 },
  { pattern: /(?:word bank|word.*box|từ.*cho sẵn)/i, type: 'reading-cloze-wordbank', confidence: 90 },
  { pattern: /(?:best fits.*numbered blanks|fills.*blank)/i, type: 'reading-cloze-mcq', confidence: 85 },
  { pattern: /read.*passage.*(?:correct answer|indicate)/i, type: 'reading-comprehension', confidence: 85 },
  { pattern: /correct answer.*(?:following|each)/i, type: 'mcq-grammar', confidence: 70 },
];

// ─── Main Parser ─────────────────────────────────────────────

export async function parseThcsDocument(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): Promise<Result<ParsedTest>> {
  // Step 1: Extract text
  onProgress?.({ stage: 'extracting', percent: 10, message: 'Reading document...' });
  const textResult = await extractTextFromFile(file);
  if (!textResult.success) return textResult;

  const lines = textResult.data.split('
');

  // Step 2: Regex structural parse (instant)
  onProgress?.({ stage: 'detecting-sections', percent: 30, message: 'Detecting sections...' });
  const sections = detectSections(lines);

  onProgress?.({ stage: 'parsing-questions', percent: 50, message: `Found ${sections.length} sections...` });
  const questions = parseQuestions(lines, sections);

  // Step 3: Classify types from instruction text
  onProgress?.({ stage: 'classifying-types', percent: 65, message: 'Classifying question types...' });
  classifyQuestionTypes(sections, lines);

  // Step 4: Extract answer key
  onProgress?.({ stage: 'extracting-answers', percent: 75, message: 'Extracting answer key...' });
  const answerKey = extractAnswerKey(lines);

  // Step 5: AI polish for ambiguous items (optional)
  const ambiguous = collectAmbiguousItems(sections, questions);
  if (ambiguous.length > 0) {
    onProgress?.({ stage: 'ai-polish', percent: 85, message: `AI verifying ${ambiguous.length} items...` });
    await resolveAmbiguousWithAI(ambiguous, lines);
  }

  // Step 6: Build result
  onProgress?.({ stage: 'complete', percent: 100, message: 'Parsing complete!' });
  return { success: true, data: buildParsedTest(sections, questions, answerKey, ambiguous) };
}
```

> **Implementation note:** The actual regex parsing functions (`detectSections`, `parseQuestions`, `classifyQuestionTypes`, `extractAnswerKey`) are implementation details. The patterns above are the core matching rules. Full implementations should follow the parsing patterns established in `offline-parser.service.ts`.

#### 4.12.5 Answer Key Auto-Extraction

THCS tests commonly have answer keys in a dedicated section:

```
ĐÁP ÁN THAM KHẢO SỐ 1
MÔN: TIẾNG ANH

Câu 1-4: Phát âm và Trọng âm
Câu 1: Đáp án: D. fine.
Câu 2: Đáp án: D. mistake.
Câu 3: Đáp án: D. succeed.
Câu 4: Đáp án: D. increasing.

Câu 5-9: Ngữ pháp và Từ vựng
Câu 5: Đáp án: B. have witnessed.
...
```

**Parsing strategy:**

```typescript
function extractAnswerKey(lines: string[]): Record<number, string> {
  const answerKey: Record<number, string> = {};
  let inAnswerSection = false;

  for (const line of lines) {
    // Detect answer key section start
    if (PATTERNS.answerKeyHeader.test(line)) {
      inAnswerSection = true;
      continue;
    }

    if (inAnswerSection) {
      // Pattern 1: "Câu 1: Đáp án: D. fine."
      const match1 = line.match(/(?:Câu|Q)\s*(\d+).*(?:Đáp án|Answer)\s*[:.]?\s*([ABCD])/i);
      if (match1) {
        answerKey[parseInt(match1[1])] = match1[2];
        continue;
      }
      // Pattern 2: "1. D    2. A    3. C" (compact format)
      const compactMatches = line.matchAll(/(\d+)\s*[.)]\s*([ABCD])\b/g);
      for (const m of compactMatches) {
        answerKey[parseInt(m[1])] = m[2];
      }
    }
  }

  return answerKey;
}
```

**If no answer key section found:** Show the existing "Missing Answer Key" dialog (same as IELTS flow) with options:
1. Paste answer key text → parse with regex
2. AI-generate answers from question content → uses `aiService.generateAnswersFromContent()`
3. Skip → teacher fills in manually in editor

#### 4.12.6 Review & Correction UI

After parsing completes, show a review step before loading into the editor:

```
┌─ Auto-Parse Results ────────────────────────── 92% confident ─┐
│                                                                │
│ ✅ 7 sections detected                                        │
│ ✅ 40 questions parsed                                        │
│ ✅ 38/40 answer keys extracted                                │
│ ⚠️ 2 questions need review (amber below)                      │
│                                                                │
│ ┌─ Section A: Pronunciation ─────── 4 Qs ── ✅ High conf ─┐  │
│ │ Q1: mcq-pronunciation ✅  Q2: mcq-pronunciation ✅       │  │
│ │ Q3: mcq-stress ✅         Q4: mcq-stress ✅              │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ ┌─ Section B: Grammar ───────────── 5 Qs ── ✅ High conf ─┐  │
│ │ Q5-Q9: mcq-grammar ✅                                    │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ ┌─ Section E: Cloze Fill ────────── 6 Qs ── ⚠️ Review ───┐  │
│ │ Q18: mcq-grammar ✅                                      │  │
│ │ Q19: ⚠️ mcq-grammar (68%) or mcq-vocabulary (52%)       │  │
│ │      [Use: grammar ○] [Use: vocabulary ○] [Other ▼]      │  │
│ │ Q20-Q23: reading-cloze-mcq ✅                            │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ ┌─ Answer Key ─────────────────── 38/40 matched ──────────┐  │
│ │ Q1:D Q2:D Q3:D Q4:D Q5:B Q6:A Q7:B Q8:C Q9:B Q10:C    │  │
│ │ Q11:A Q12:D Q13:A Q14:C Q15:A Q16:C Q17:B Q18:C ...    │  │
│ │ ⚠️ Q39: missing   ⚠️ Q40: missing                       │  │
│ │ [Paste Missing Keys] [AI Generate Missing]               │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ [← Back] [Edit in Full Editor →]                              │
└────────────────────────────────────────────────────────────────┘
```

**Behaviors:**
- **Green ✅**: High confidence (≥80%) — auto-accepted
- **Amber ⚠️**: Low confidence — teacher must choose
- **Answer keys**: displayed in compact grid, missing keys highlighted
- **"Edit in Full Editor"**: loads all parsed data into `THCSTestEditorPage.tsx` as a new draft

#### 4.12.7 Data Flow: Document → Editor

```
File upload
  → extractTextFromFile() (existing)
    → parseThcsDocument() (new)
      → ParsedTest result
        → Convert to THCSTest draft structure
          → Save to thcs_drafts/ (Firestore)
            → Navigate to THCSTestEditorPage.tsx with draftId
              → Teacher reviews in normal editor
```

The `ParsedTest` → `THCSTest` conversion:
```typescript
function convertParsedToThcsDraft(parsed: ParsedTest): Partial<THCSTest> {
  return {
    metadata: {
      title: parsed.metadata.title || 'Imported Test',
      gradeLevel: parsed.metadata.gradeLevel || 9,
      duration: parsed.metadata.duration || 45,
      examType: parsed.metadata.examType || 'Giữa Kì',
      difficulty: 'medium',
      totalPoints: 10,
    },
    sections: parsed.sections.map(section => ({
      id: generateId(),
      name: section.name,
      instruction: section.instruction,
      layout: isReadingSection(section.type) ? 'two-column' : 'single-column',
      passage: section.passage || undefined,
      sectionPoints: section.points || 0,
      questions: section.questions.map(q => ({
        id: generateId(),
        questionNumber: q.number,
        text: q.text,
        type: q.type,
        options: q.options,
        correctAnswer: parsed.answerKey[q.number] || undefined,
        points: q.points || 0.25,
        // Fill-in specific:
        sentenceTemplate: q.sentenceTemplate,
        blankAnswers: q.blankAnswers,
        // Writing specific:
        originalSentence: q.originalSentence,
        sentenceStarter: q.sentenceStarter,
        keyword: q.keyword,
        modelAnswers: q.modelAnswers,
      })),
    })),
  };
}
```

#### 4.12.8 Reuse from Existing IELTS Pipeline

| Component | Source | Reuse |
|-----------|--------|-------|
| File → text extraction | `file.extractor.ts` | 100% reuse (docx, pdf, txt, md) |
| Missing answer key dialog | Existing TestCreationPage flow | Reuse dialog + adapt for THCS format |
| AI answer generation | `aiService.generateAnswersFromContent()` | Reuse (already in router.service.ts) |
| Review panel concept | `ParseReviewPanel.tsx` | Adapt pattern for THCS-specific review |
| Checkpoint/resume | `ExtractionCheckpoint` | Not needed (THCS parse is fast, <5s) |
| Offline parsing | `offline-parser.service.ts` | Pattern reference only (THCS parser is simpler) |

---

## 5. Non-Goals (Out of Scope for Phase 3)

1. **NOT Phase 3:** Version revert (one-click revert to old version) → Future enhancement
2. **NOT Phase 3:** Advanced analytics dashboard (student performance heatmaps) → Future
3. **NOT Phase 3:** AI test generation from topics ("generate a test about Unit 5 grammar") → Future (different from document parsing which extracts from existing tests)
4. **NOT Phase 3:** Multi-language UI toggle (English/Vietnamese) → Per Q51a, all English
5. **NOT Phase 3:** Writing AI auto-grade (fully autonomous, no teacher review) → AI always flags for teacher
6. **NOT Phase 3:** Cross-test analytics (compare student performance across tests) → Future
7. **NOT Phase 3:** GPA integration / report card generation → Future

---

## 6. Design Considerations

### 6.1 Homework Dialog
- Reuses existing homework creation dialog layout from `TeacherHomeworkListPage.tsx`
- THCS-specific fields (timer override, late policy, version pin) added below the standard fields
- Stepwise disclosure: THCS-specific options appear only when `materialType === 'thcs-test'`

### 6.2 Library Browsing
- Filter chips at top of test list (consistent with existing content filter pattern)
- Clone/Use buttons are secondary actions on public test cards
- "Cloned from" provenance badge on cloned tests (subtle, non-obtrusive)

### 6.3 Drag-and-Drop
- Drag handle clearly visible (6-dot grip icon)
- Drag preview shows compressed card (shadow, slightly transparent)
- Drop indicator: blue line between items
- Accessibility: keyboard reorder with Alt+↑/↓ as fallback

### 6.4 Student Dashboard Cards
- THCS cards use violet color scheme (matching lobby)
- Badge placement consistent with IELTS cards
- Score display: "8.3/10" (not percentage, to match Vietnamese grading convention)

---

## 7. Technical Considerations

### 7.1 Dependencies
- **Existing:** Firebase RTDB, Firestore, React, Mantine UI, dnd-kit, `homeworkManager.ts`, `notificationService.ts`, `courseManager.ts`, AI Router Service (`aiService` — Gemini + Groq with multi-key rotation)
- **New:** `seedrandom` npm package for deterministic shuffle (or built-in crypto PRNG with seed)

### 7.2 Key Files to Create/Modify

| File | Change |
|------|--------|
| `src/types/thcs-test.types.ts` | **MODIFY** — Add `shuffle`, `shuffleOptions` to `THCSSection`, `timerMode` to metadata |
| `src/types/homework.types.ts` | **MODIFY** — Add `'thcs-test'` to `materialType`, add `thcsConfig` |
| `src/types/academicRecord.types.ts` | **MODIFY** — Add `thcsProgress` section |
| `src/services/homeworkManager.ts` | **MODIFY** — Handle `materialType === 'thcs-test'` in create/duplicate |
| `src/services/notificationService.ts` | **MODIFY** — Add 6 new THCS notification functions |
| `src/services/deadlineReminderService.ts` | **MODIFY** — Add THCS homework deadline checks |
| `src/services/courseManager.ts` | **MODIFY** — Handle THCS test materials in module linking |
| `src/services/thcsTestStorage.ts` | **MODIFY** — Add template save/load, clone from library |
| `src/services/thcsDraftService.ts` | **MODIFY** — Add cloneFromPublicTest function |
| `src/utils/thcsQuestionParser.ts` | **NEW** — Parse pasted question text |
| `src/utils/thcsShuffle.ts` | **NEW** — Deterministic question/option shuffle |
| `src/services/test-creation/thcsDocumentParser.service.ts` | **NEW** — Hybrid regex + AI document parser for THCS tests |
| `src/components/thcs-editor/THCSParseReviewPanel.tsx` | **NEW** — Auto-parse results review UI |
| `src/components/thcs-editor/THCSDocumentUpload.tsx` | **NEW** — File upload zone in test creation flow |
| `src/pages/THCSTestEditorPage.tsx` | **MODIFY** — Add bulk ops, drag-and-drop, template picker, shuffle toggles, timer mode, document upload entry point |
| `src/pages/TeacherLobbyPage.jsx` | **MODIFY** — Add type filter for library, clone/use-as-is buttons, homework assign button |
| `src/pages/StudentDashboardPage.jsx` | **MODIFY** — Add THCS homework cards to feed |
| `src/pages/StudentCourseDetailPage.tsx` | **MODIFY** — Handle THCS test materials in course view |
| `src/pages/AcademicRecordPage.tsx` | **MODIFY** — Add THCS/THPT tab with progression data |
| `src/components/thcs-editor/THCSSectionBlock.tsx` | **MODIFY** — Add shuffle toggles, drag handle, bulk add |
| `src/components/thcs-editor/THCSQuestionBlock.tsx` | **MODIFY** — Replace up/down buttons with drag handle |
| `src/components/thcs-editor/THCSTemplatePicker.tsx` | **NEW** — Template selection modal |
| `src/components/thcs-editor/THCSBulkPasteModal.tsx` | **NEW** — Paste questions modal |
| `src/components/thcs-student/THCSTestLayout.tsx` | **MODIFY** — Add shuffle application on load, timer mode handling |
| `src/components/homework/HomeworkAssignDialog.tsx`* | **MODIFY** — Add THCS-specific fields |
| `src/__tests__/security/routeAccess.test.ts` | **MODIFY** — Verify no new routes (all features on existing pages) |

*Note: Identify the actual homework assignment dialog component name by searching the codebase before implementation.

### 7.3 Firestore Collections

| Collection | Purpose | Phase |
|------------|---------|-------|
| `thcs_drafts/` | Teacher drafts (Phase 1) | ✅ |
| `thcs_library/` | Published test metadata (Phase 1) | ✅ |
| `thcs_templates/` | Test structure templates (Phase 3) | **NEW** |
| `homework_assignments/` | Homework (existing, extend for THCS) | **MODIFY** |
| `homework_submissions/` | Homework results (existing, extend) | **MODIFY** |

### 7.4 Firestore Rules Required

```javascript
// New collection:
match /thcs_templates/{templateId} {
  allow read: if request.auth != null && (
    resource.data.isPublic == true || resource.data.ownerId == request.auth.uid
  );
  allow create: if request.auth != null && request.resource.data.ownerId == request.auth.uid;
  allow update, delete: if request.auth != null && resource.data.ownerId == request.auth.uid;
}
```

> ⚠️ **Integration Safety Rule #12** (Backup Coverage Check): The new `thcs_templates/` Firestore collection MUST be added to the backup system's collection discovery. Verify in `backup-worker/` that the dynamic discovery picks up new Firestore collections automatically.

### 7.5 Integration Safety Rules Triggered

| Rule # | Trigger | Action Required |
|--------|---------|----------------|
| **Rule 4** | Drag-and-drop reordering with dnd-kit | Force re-measurement after paint |
| **Rule 5** | Custom pointer handlers on draggable question/section blocks | No `setPointerCapture` on draggables |
| **Rule 8** | New template picker, bulk paste modal, THCS dashboard cards | Verify components are integrated in parent pages |
| **Rule 9** | Homework system extension: "replaces materialType union" | Grep audit across codebase for materialType checks |
| **Rule 11** | Notification writes as side-effect of grading events | Ensure restore guard wraps notification functions |
| **Rule 12** | New `thcs_templates/` Firestore collection | Backup coverage check |

### 7.6 Patterns to Follow
- Homework assignment: Follow `CreateHomeworkInput` pattern in `homeworkManager.ts`
- Notifications: Follow `sendHomeworkAssignedNotification` pattern in `notificationService.ts`
- Library filtering: Follow existing `contentFilter` pattern in `TeacherLobbyPage.jsx`
- Course materials: Follow `CourseMaterial` linking pattern in `courseManager.ts`
- Template storage: Follow `thcs_drafts/` Firestore pattern from `thcsDraftService.ts`
- Drag-and-drop: Follow existing dnd-kit usage patterns in the project (check `package.json` for installed version)

---

## 8. Success Metrics

1. Teacher can assign THCS test as homework with all configuration options within 30 seconds
2. Students receive all 6 notification types within 5 seconds of trigger events
3. Library search returns results within 1 second for up to 500 public tests
4. Question shuffling produces statistically different orderings for ≥99% of student pairs
5. Template-based test creation saves ≥60% of editor setup time vs blank test
6. Drag-and-drop reordering completes without layout jank or dropped items
7. Student dashboard loads THCS items in unified feed within 2 seconds
8. Academic record THCS tab shows accurate score progression after each graded test
9. Auto test maker correctly parses ≥90% of questions from standard-format THCS/THPT test documents
10. Auto test maker extracts answer keys with ≥95% accuracy when "Đáp án" section is present
11. Auto test maker completes parsing within 5 seconds for documents under 5,000 words (excluding AI polish step)

---

## 9. Edge Cases and Solutions

| # | Edge Case | Solution |
|---|-----------|----------|
| 1 | Teacher assigns homework for test with writing, then edits the test | If version pinned: students still see original version. Teacher's grading tab shows the version-pinned model answers. If NOT pinned: latest version used — warn teacher |
| 2 | Student submits homework after deadline with "Late" policy | Mark submission with `isLate: true`. Show "Late" badge on teacher's grading view. Apply penalty if configured |
| 3 | Library test is deleted by original teacher while another teacher has it linked | Linked references show "Test unavailable" message. Homework assignments using this test show error: "The referenced test has been removed" |
| 4 | Template has 40 question placeholders, but section has 4.0 points for 40 questions | Auto-calculate: each placeholder gets 0.1 points. Validate minimum point value per question ≥ 0.05 |
| 5 | Bulk paste with malformed text | Show parser errors inline: "Line 5: Could not detect question format." Import only successfully parsed questions. Teacher reviews and fixes in editor |
| 6 | Drag-and-drop question across sections | Constrain drag to parent section container. dnd-kit `restrictToParentElement` modifier applied |
| 7 | Shuffle with only 1 question in section | Shuffle has no effect (only 1 possible order). No error — silently skip shuffle |
| 8 | Homework with `timerMode: 'none'` — student never submits | Show reminder notifications. Deadline enforces final state. After deadline, unsubmitted homework gets status "missed" |
| 9 | Clone & Customize — original has images | Images are stored in Firebase Storage with URL references. Clone copies the URLs (shared references). If original deletes images from Storage, cloned test's images break. **Solution**: On clone, copy image files to new Storage path under cloner's UID |
| 10 | Student has both IELTS and THCS tests in same course | Course materials list shows both with appropriate type badges. Progress tracking is per-material (existing pattern), not per-type |
| 11 | Notification spam (teacher grades 40 writing answers quickly) | Per Q17a: each graded answer triggers immediate notification. Mitigate with client-side notification batching on student's end: if 5+ notifications arrive in 10 seconds, group them as "Multiple grades updated" |
| 12 | Academic record recalculation race condition | Use RTDB `runTransaction` for `thcsProgress` updates. Same pattern as test stats update in Phase 1 |
| 13 | Uploaded document has no clear section headers | Parser falls back to treating each instruction block as a section boundary. If no instruction blocks found, create a single "General" section with all questions. Show warning: "Could not detect sections — please organize manually" |
| 14 | Document contains images (e.g., diagram questions) | File extractor extracts text only — images are lost. Show warning: "X images detected but not imported. Please add manually." List image positions in the document |
| 15 | Answer key uses non-standard format (e.g., table, grid) | Regex patterns cover the 3 most common formats ("Câu N: Đáp án: X", compact "1.D 2.A", and table-extracted "1-D, 2-A"). If none match, treat as missing and prompt teacher |
| 16 | Same document uploaded twice | Hash document content. If matching hash found in recent parses, show: "This document was already parsed. [Use Previous Result] [Parse Again]" |
| 17 | Document contains multiple test variants ("Mã đề 001", "Mã đề 002") | Detect "Mã đề" markers. Parse only the FIRST variant. Show warning: "Multiple test variants detected. Only the first variant was parsed." |

---

## 10. Open Questions

1. ~~Homework system extension~~ → Resolved: Extend existing (Q6b)
2. ~~Library clone behavior~~ → Resolved: Both options (Q7c)
3. ~~Timer mode placement~~ → Resolved: Default in metadata + per-assignment override (Q8c)
4. Should templates support importing from external files (JSON, DOCX)? → Recommend Phase 4/future
5. Should the student dashboard show THCS test deadlines in a calendar view? → Recommend future enhancement
6. Maximum word count limit for sentence rewriting answers? → Recommend 200 characters max, with warning at 150

---

## 11. Pre-Decisions Summary (All Locked)

All decisions referenced in this PRD were locked during the 8-round Socratic PRD process:

| Decision | Source | Selection |
|----------|--------|-----------|
| Fill-in blank count | Q11 | (b) Multiple blanks per question |
| E2 keyword display | Q12 | (a) Displayed above input as reminder |
| Grading tab location | Q4 | In header with other tabs |
| Grading pagination | Q13 | (c) Lazy-load on scroll |
| Monitor grading UX | Q14 | (a) Score slider + feedback textarea |
| Version changelog scope | Q15 | (c) Full: changelog + dropdown + version pinning |
| AI grading approach | Q16 | (c) String similarity + LLM escalation (Gemini) |
| Grade notification timing | Q17 | (a) Auto-notify immediately |
| Two-column auto-default | Q3 | (c) Auto-default with override |
| Preview approach | Q5 | (c) Fullscreen overlay with actual components |
| Homework system | Q6 | (b) Extend existing system |
| Library options | Q7 | (c) Both "Use as-is" and "Clone & Customize" |
| Timer mode config | Q8 | (c) Default in metadata + per-assignment override |
| Notifications | Q9 | (a) Extend existing notificationService |
| Course integration | Q10 | (d) Same as existing course system |
| Homework deadline | Q55 | (d) Teacher-configurable late policy |
| Question shuffling | Q24/25 | (c) Teacher-configurable, within sections only |
| Results page | Q54 | (d) Full breakdown with analytics |
| Feed design | Q38 | (c) Unified feed with type-specific cards |
| Academic record | Q10 input | Separate from IELTS |
