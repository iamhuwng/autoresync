> [!IMPORTANT]
> Historical planning or design document.
> The current finalized source of truth for the teacher writing grading editor is:
> - .knowns/docs/specs/ielts-writing-grading-editor-finalization-2026-03-30.md
> - documentation/mockups/ielts-writing-grading-editor-finalized-2026-03-30.html
>
> If this file conflicts with the finalization doc or finalized mockup, follow the finalization doc.
# PRD-0030: IELTS Writing Test System

**Version:** 1.0
**Created:** 2026-02-28
**Author:** AI (via Socratic PRD Process — 5 rounds, 80+ decisions)
**Status:** Draft
**Priority:** High (Core Feature Expansion)

---

## 1. Introduction / Overview

The application currently supports IELTS Reading and Listening tests (auto-graded, structured answers) and THCS-THPT tests (MCQ + sentence-rewrite). IELTS Writing is fundamentally different: students produce free-form essays graded by teachers using subjective criteria rubrics (Task Response, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy).

This PRD defines the complete IELTS Writing test system: test creation, live session delivery, teacher grading with rich annotations, solo practice, homework integration, results display, notifications, and academic record tracking.

### Key Differences from Reading/Listening

| Aspect | Reading/Listening | Writing |
|---|---|---|
| Student answer | Structured (MCQ, fill-in) | Free-form essay (~150-400 words) |
| Marking | Auto-graded (deterministic) | Manual teacher grading (subjective, criteria-based) |
| Score type | Correct count → band lookup | 4 criteria × per task → weighted average |
| Progress tracking | Questions answered / total | Word count / target |
| Results display | Correct/incorrect per Q | Essay + inline annotations + criteria chart |

---

## 2. Goals

1. **G1:** Enable teachers to create IELTS Writing tests with flexible task composition (Task 1 only, Task 2 only, or Full Test).
2. **G2:** Enable students to write essays in live sessions, solo practice, and homework with a plain-text editor, external paste prevention, and per-task time tracking.
3. **G3:** Provide teachers with a rich grading interface featuring inline essay annotations (highlight, comment, strikethrough, correction, text color), customizable annotation categories, and per-criteria band scoring following official IELTS rounding rules.
4. **G4:** Support the full writing lifecycle: submit → pending review → graded → student sees results with band breakdown and teacher feedback.
5. **G5:** Integrate writing into solo practice and homework with "Submit to Teacher" flow, enabling asynchronous grading outside live sessions.
6. **G6:** Track IELTS Writing progress in the academic record with criteria-level trend analysis.

---

## 3. User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-1 | Teacher | Create an IELTS Writing test with Task 1 (image + prompt) and/or Task 2 (essay prompt) | Students can practice authentic IELTS Writing tasks |
| US-2 | Teacher | Choose between Task 1 only, Task 2 only, or Full Test format | I can target specific skills or simulate full exams |
| US-3 | Student | Write essays in a plain-text editor with live word count and a shared timer | I practice under realistic IELTS conditions |
| US-4 | Student | Switch between Task 1 and Task 2 tabs and manage my own time | I develop time management skills |
| US-5 | Teacher | Monitor students' word counts and peek at essays live during a session | I can track progress and intervene if needed |
| US-6 | Teacher | Grade essays side-by-side with the student's text, using inline annotations | I can provide detailed, contextual feedback |
| US-7 | Teacher | Score each IELTS criterion (TA/TR, CC, LR, GRA) with system-calculated band | Scoring follows official IELTS methodology |
| US-8 | Teacher | Create custom annotation categories (colors + labels) beyond the 4 criteria | I can mark spelling, formatting, or other patterns |
| US-9 | Student | Submit solo practice essays to a teacher for grading | I get expert feedback outside class time |
| US-10 | Student | See my graded essay with inline annotations, criteria scores, and teacher feedback | I understand exactly where to improve |
| US-11 | Teacher | Assign writing tests as homework with configurable due dates and late policies | Students practice writing asynchronously |
| US-12 | Student | Re-attempt homework with my previous essay pre-loaded for improvement | I can iteratively improve my writing |
| US-13 | Teacher | Re-grade with audit trail showing previous scores and reasons | Grading history is transparent and accountable |
| US-14 | Teacher | Void a task if the prompt was wrong, excluding it from the band calculation | Errors don't unfairly penalize students |
| US-15 | Student | See my writing progress in academic record with criteria trend charts | I track my improvement over time |

---

## 4. Functional Requirements

### 4.1 Data Model

#### 4.1.1 Writing Test Structure (TypeScript Interfaces)

> These types MUST be added to a new file: `src/types/ielts-writing.types.ts`

```typescript
// ═══════════════════════════════════════════════════════════════
// IELTS Writing Test Data Model
// ═══════════════════════════════════════════════════════════════

/**
 * Task 1 visual types (metadata tag only — no UI change)
 */
export type WritingTask1Type =
  | 'bar-chart'
  | 'line-graph'
  | 'pie-chart'
  | 'table'
  | 'process-diagram'
  | 'map'
  | 'mixed';

/**
 * Task 2 essay types (metadata tag only — no UI change)
 */
export type WritingTask2Type =
  | 'opinion'
  | 'discussion'
  | 'problem-solution'
  | 'advantages-disadvantages'
  | 'two-part-question';

/**
 * A single writing task (Task 1 or Task 2)
 */
export interface WritingTask {
  taskNumber: 1 | 2;
  taskType: WritingTask1Type | WritingTask2Type;
  promptText: string;              // The essay prompt/instruction
  promptImageUrl?: string;         // Task 1 only: graph/chart/diagram image
  promptImageCaption?: string;     // Optional alt text for the image
  wordMinimum: number;             // Default: 150 (Task 1), 250 (Task 2)
  recommendedTimeMinutes: number;  // Default: 20 (Task 1), 40 (Task 2)
  modelAnswer?: string;            // Optional: teacher's sample answer
  showModelAnswerToStudent: boolean; // Toggle: show after grading
  rubricNotes?: {                  // Optional: per-criteria notes for self-reference
    TA?: string;  // Task Achievement (Task 1) / Task Response (Task 2)
    CC?: string;  // Coherence & Cohesion
    LR?: string;  // Lexical Resource
    GRA?: string; // Grammatical Range & Accuracy
  };
}

/**
 * Writing test format
 */
export type WritingTestFormat = 'task1-only' | 'task2-only' | 'full-test';

/**
 * Writing test metadata
 */
export interface WritingTestMetadata {
  title: string;
  description?: string;
  duration: number;               // Minutes (total, shared timer)
  format: WritingTestFormat;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  targetBand?: number;            // e.g., 6.5
  tags?: string[];
}

/**
 * Complete IELTS Writing test (published, stored in RTDB)
 */
export interface IELTSWritingTest {
  id: string;
  testType: 'IELTS';
  skill: 'Writing';               // Discriminator within IELTS tests
  metadata: WritingTestMetadata;
  tasks: WritingTask[];            // 1 or 2 tasks based on format
  createdBy: string;               // Teacher UID
  ownerId: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  stats?: {
    attempts: number;
    averageBand: number;
    completionRate: number;
  };

  // Solo/homework configuration (PRD-0025 MaterialSoloConfig)
  soloConfig?: MaterialSoloConfig;
}

/**
 * Writing test draft (Firestore)
 */
export interface WritingTestDraft {
  id: string;
  userId: string;
  testType: 'IELTS';
  skill: 'Writing';
  metadata: WritingTestMetadata;
  tasks: WritingTask[];
  status: 'editing' | 'review' | 'published';
  createdAt: Date;
  updatedAt: Date;
}
```

#### 4.1.2 Writing Submission (Firestore — Self-Contained)

> Submissions embed task prompts so they are independent of the test document. Deleting a test does NOT affect existing submissions.

```typescript
/**
 * Student writing submission (Firestore: writing_submissions/{submissionId})
 * 
 * This is the primary document for a student's writing attempt.
 * Contains: essays, grading, annotations, feedback, and audit trail.
 * Single document per submission (~20KB worst case, well within 1MB limit).
 */
export interface WritingSubmission {
  id: string;                      // = resultId for cross-reference
  studentId: string;
  studentName: string;

  // Context: how this submission originated
  context: {
    type: 'live-session' | 'solo-practice' | 'homework';
    sessionCode?: string;          // Live session only
    homeworkId?: string;           // Homework only
    assigningTeacherId?: string;   // Homework: auto-assigned teacher
    selectedTeacherId?: string;    // Solo: student-chosen teacher
    studentNote?: string;          // Solo: optional message to teacher
    courseId?: string;
    courseName?: string;
    moduleId?: string;
    moduleName?: string;
  };

  // Test metadata (embedded — self-contained)
  testMeta: {
    testId: string;
    testTitle: string;
    format: WritingTestFormat;
    duration: number;
  };

  // Student's essays (embedded task prompts + essays)
  tasks: WritingSubmissionTask[];

  // Timing
  submittedAt: number;
  totalElapsedTimeSeconds: number;
  pasteAttemptCount: number;       // External paste attempts logged

  // Grading status
  markingStatus: 'pending-review' | 'graded';

  // Grading result (populated when teacher grades)
  grading?: WritingGradingResult;

  // Annotations on the essay (populated during grading)
  annotations: WritingAnnotation[];

  // Grading audit trail
  auditTrail: WritingGradingAudit[];
}

export interface WritingSubmissionTask {
  taskNumber: 1 | 2;
  taskType: WritingTask1Type | WritingTask2Type;
  promptText: string;              // Embedded from test (immutable snapshot)
  promptImageUrl?: string;         // Embedded from test
  wordMinimum: number;
  essayText: string;               // Student's essay
  wordCount: number;
  activeTimeSeconds: number;       // Active writing time (keystroke-gap tracked)
}

/**
 * Grading result
 */
export interface WritingGradingResult {
  teacherId: string;
  teacherName: string;
  gradedAt: number;
  overallBand: number;             // Weighted average, rounded per IELTS rules

  perTask: WritingTaskGradingResult[];

  feedback: {
    overall: string;               // Rich HTML
    perCriteria: {
      TA?: string;                 // Rich HTML — Task 1
      TR?: string;                 // Rich HTML — Task 2
      CC: string;                  // Rich HTML
      LR: string;                  // Rich HTML
      GRA: string;                 // Rich HTML
    };
  };
}

export interface WritingTaskGradingResult {
  taskNumber: 1 | 2;
  isVoided: boolean;
  voidReason?: string;
  criteriaScores: {
    TA?: number;                   // Task Achievement (Task 1 only) — whole number 0-9
    TR?: number;                   // Task Response (Task 2 only) — whole number 0-9
    CC: number;                    // Coherence & Cohesion — whole number 0-9
    LR: number;                    // Lexical Resource — whole number 0-9
    GRA: number;                   // Grammatical Range & Accuracy — whole number 0-9
  };
  taskBand: number;                // Average of 4 criteria, rounded DOWN to nearest 0.5
}

/**
 * Annotation on student essay
 */
export interface WritingAnnotation {
  id: string;
  taskNumber: 1 | 2;
  type: 'highlight' | 'comment' | 'strikethrough' | 'correction' | 'textColor';
  startOffset: number;             // Character offset in essay text
  endOffset: number;
  color: string;                   // Hex color (e.g., '#3b82f6')
  categoryId: string;              // e.g., 'TA', 'CC', 'SPL', 'FMT'
  categoryLabel: string;           // e.g., 'Task Achievement', 'Spelling'
  commentText?: string;            // For 'comment' type
  correctionText?: string;         // For 'correction' type — suggested replacement
  createdAt: number;
}

/**
 * Custom annotation category (per-teacher, Firestore)
 * Stored at: users/{teacherId}/settings/writingAnnotationCategories
 */
export interface AnnotationCategory {
  id: string;                      // e.g., 'SPL', 'FMT'
  label: string;                   // e.g., 'Spelling'
  color: string;                   // Hex color
  isDefault: boolean;              // true for 4 IELTS criteria presets
}

/**
 * Grading audit entry
 */
export interface WritingGradingAudit {
  version: number;
  gradedAt: number;
  teacherId: string;
  reason: string;                  // Required when re-grading
  previousScores: {
    overallBand: number;
    perTask: Array<{
      taskNumber: number;
      criteriaScores: Record<string, number>;
      taskBand: number;
      isVoided: boolean;
    }>;
  };
}
```

#### 4.1.3 IELTS Band Score Calculation Rules

> ⚠️ These rules are IELTS-official and MUST be implemented exactly.

```typescript
/**
 * IELTS Writing Band Score Calculator
 * 
 * Rules:
 * 1. Each criterion scored as WHOLE NUMBER (0-9, no decimals)
 * 2. Per-task band = average of 4 criteria, rounded DOWN to nearest 0.5
 *    - 6.25 → 6.0, 6.5 → 6.5, 6.75 → 6.5, 7.0 → 7.0
 * 3. Overall Writing band (Full Test):
 *    - = (Task1Band × 1/3) + (Task2Band × 2/3)
 *    - Rounded: from 0.25 up → next 0.5. Below 0.25 → round down.
 *    - 6.25 → 6.5, 6.24 → 6.0, 6.75 → 7.0, 6.0 → 6.0
 * 4. Task 1 only or Task 2 only: overall = that task's band (no weighting)
 * 5. Voided task: excluded from calculation entirely
 *    - Full Test with Task 1 voided: overall = Task 2 band only
 * 
 * Task 1 uses "Task Achievement" (TA) criterion
 * Task 2 uses "Task Response" (TR) criterion
 * Both share: CC, LR, GRA
 */

// Round DOWN to nearest 0.5
function roundDownToHalf(value: number): number {
  return Math.floor(value * 2) / 2;
}

// Round with IELTS overall rule (>=0.25 above rounds UP)
function roundOverallBand(value: number): number {
  const lower = Math.floor(value * 2) / 2;
  const remainder = value - lower;
  return remainder >= 0.25 ? lower + 0.5 : lower;
}

function calculateTaskBand(scores: {
  TA?: number; TR?: number; CC: number; LR: number; GRA: number;
}): number {
  const taskResponse = scores.TA ?? scores.TR ?? 0;
  const avg = (taskResponse + scores.CC + scores.LR + scores.GRA) / 4;
  return roundDownToHalf(avg);
}

function calculateOverallBand(
  tasks: WritingTaskGradingResult[],
  format: WritingTestFormat
): number {
  const validTasks = tasks.filter(t => !t.isVoided);
  if (validTasks.length === 0) return 0;
  if (validTasks.length === 1) return validTasks[0].taskBand;

  // Full test: weighted average
  const task1 = validTasks.find(t => t.taskNumber === 1);
  const task2 = validTasks.find(t => t.taskNumber === 2);
  if (task1 && task2) {
    const weighted = (task1.taskBand * 1/3) + (task2.taskBand * 2/3);
    return roundOverallBand(weighted);
  }
  return validTasks[0].taskBand;
}
```

#### 4.1.4 Storage Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     STORAGE MAP — IELTS Writing                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  RTDB (real-time, session-time)                                  │
│  ├── tests/{testId}                ← Published writing test      │
│  │     skill: 'Writing'                                          │
│  │     tasks: WritingTask[]                                      │
│  │                                                               │
│  ├── game_sessions/{code}/students/{uid}/writing/                │
│  │     task1: { text, wordCount, lastSavedAt }                   │
│  │     task2: { text, wordCount, lastSavedAt }                   │
│  │     activeTask: 1 | 2                                         │
│  │     tabSwitches: [{ from, to, timestamp }]                    │
│  │                                                               │
│  └── test_results_by_student/{studentId}/{resultId}              │
│        EnhancedTestResultRecord + writingData: {                 │
│          submissionId: string (→ Firestore)                      │
│          overallBand: number | null                               │
│          markingStatus: 'pending-review' | 'graded'              │
│          tasks: [{ taskNumber, wordCount, activeTime }]          │
│        }                                                         │
│                                                                  │
│  Firestore (permanent storage, heavy content)                    │
│  ├── writing_submissions/{submissionId}                          │
│  │     WritingSubmission (essays + grading + annotations + audit)│
│  │     ~20KB per submission, well within 1MB limit               │
│  │                                                               │
│  ├── writing_drafts/{draftId}     ← Teacher's test drafts        │
│  │     WritingTestDraft                                          │
│  │     Auto-cleaned after 90 days of inactivity                  │
│  │                                                               │
│  └── users/{teacherId}/settings/writingAnnotationCategories      │
│        AnnotationCategory[] (per-teacher custom categories)      │
│                                                                  │
│  FLOW:                                                           │
│  1. Teacher creates draft (Firestore)                            │
│  2. Publish → RTDB tests/{id}                                   │
│  3. Student writes → RTDB session (real-time)                   │
│  4. Submit → Firestore writing_submissions + RTDB result index  │
│  5. Teacher grades → update Firestore submission                │
│  6. Scores → update RTDB result index (for academic record)     │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.1.5 RTDB Type Union Update

Update `src/services/testStorage.ts` — TestData skill union:

```typescript
// BEFORE:
skill: 'Reading' | 'Listening'

// AFTER:
skill: 'Reading' | 'Listening' | 'Writing'
```

The existing `TestData` interface in `testStorage.ts` stores all IELTS tests. Writing tests use the same `tests/{testId}` path with `skill: 'Writing'` as discriminator.

#### 4.1.6 New Firestore Collections

| Collection | Document ID | Purpose |
|-----------|------------|---------|
| `writing_submissions` | Auto-generated (= resultId) | Student essays + grading + annotations |
| `writing_drafts` | Auto-generated | Teacher test creation drafts |

> ⚠️ **Integration Safety Rule #12:** These collections are auto-discovered by the backup system's dynamic Firestore discovery. Verify `FIRESTORE_EXCLUDE` in `r2-backup-worker/src/backup/data-backup.ts` does NOT contain them.

---

### 4.2 Test Builder (Teacher)

#### 4.2.1 Route

```
/teacher/writing-test/create           ← New test
/teacher/writing-test/edit/:draftId    ← Edit existing draft
```

> ⚠️ **Integration Safety Rule #1:** Add to route registry.

**Route Registry Updates:**

1. **`src/constants/routes.ts`** — Add:
```typescript
TEACHER_WRITING_CREATE: '/teacher/writing-test/create',
TEACHER_WRITING_EDIT: '/teacher/writing-test/edit/:draftId',
```

2. **`App.jsx`** — Add route definitions (teacher-only):
```jsx
<Route path="/teacher/writing-test/create" element={<TeacherGuard><WritingTestBuilder /></TeacherGuard>} />
<Route path="/teacher/writing-test/edit/:draftId" element={<TeacherGuard><WritingTestBuilder /></TeacherGuard>} />
```

3. **`TestBuilderRouter.tsx`** — Add case for `skill: 'Writing'`:
```typescript
case 'Writing':
  return <WritingTestBuilder draftId={draftId} />;
```

#### 4.2.2 Builder Layout

```
┌───────────────────────────────────────────────────────────────────┐
│ ← Back to Lobby    IELTS Writing Test Builder   [Save Draft] [Publish]│
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Metadata Panel ──────────────────────────────────────────┐   │
│  │ Title: [________________]  Duration: [60] min             │   │
│  │ Format: ○ Task 1 Only  ○ Task 2 Only  ● Full Test         │   │
│  │ Difficulty: [dropdown]  Target Band: [6.5]                │   │
│  │ Tags: [___________]                                       │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Task 1 ──────────────────────────────────────────────────┐   │
│  │ Type: [Bar Chart ▼] (metadata tag)                        │   │
│  │                                                            │   │
│  │ 🖼️ Upload Image    📋 Paste URL                           │   │
│  │ ┌──────────────────────────────────────┐                  │   │
│  │ │         [Image Preview]              │                  │   │
│  │ └──────────────────────────────────────┘                  │   │
│  │ Caption: [optional alt text]                              │   │
│  │                                                            │   │
│  │ Prompt Text:                                              │   │
│  │ ┌──────────────────────────────────────┐                  │   │
│  │ │ Summarise the information by         │                  │   │
│  │ │ selecting and reporting the main     │                  │   │
│  │ │ features, and make comparisons       │                  │   │
│  │ │ where relevant.                      │                  │   │
│  │ └──────────────────────────────────────┘                  │   │
│  │                                                            │   │
│  │ Word Minimum: [150]  Recommended Time: [20] min           │   │
│  │                                                            │   │
│  │ 📝 Model Answer (optional):                               │   │
│  │ ┌──────────────────────────────────────┐                  │   │
│  │ │ [expandable textarea]               │                  │   │
│  │ └──────────────────────────────────────┘                  │   │
│  │ ☐ Show model answer to student after grading              │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Task 2 ──────────────────────────────────────────────────┐   │
│  │ Type: [Opinion ▼] (metadata tag)                          │   │
│  │                                                            │   │
│  │ Prompt Text:                                              │   │
│  │ ┌──────────────────────────────────────┐                  │   │
│  │ │ Some people believe that university  │                  │   │
│  │ │ students should be required to       │                  │   │
│  │ │ attend classes. Others believe that  │                  │   │
│  │ │ going to classes should be optional. │                  │   │
│  │ │                                      │                  │   │
│  │ │ Discuss both views and give your     │                  │   │
│  │ │ own opinion.                         │                  │   │
│  │ └──────────────────────────────────────┘                  │   │
│  │                                                            │   │
│  │ Word Minimum: [250]  Recommended Time: [40] min           │   │
│  │ (No image upload — Task 2 is text-only)                   │   │
│  │                                                            │   │
│  │ 📝 Model Answer (optional): [...]                         │   │
│  │ ☐ Show model answer to student after grading              │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Validation Summary ──────────────────────────────────────┐   │
│  │ ✅ Title set                                               │   │
│  │ ✅ Duration set (60 min)                                   │   │
│  │ ✅ Task 1: prompt text + image uploaded                    │   │
│  │ ✅ Task 2: prompt text filled                              │   │
│  └───────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

![IELTS Writing Test Builder Mockup](file:///C:/Users/Sanctuary/.gemini/antigravity/brain/0171a53f-8dab-4c9b-a05f-90820b771419/writing_test_builder_1772216009017.png)

#### 4.2.3 Builder Behaviors

**Format Selection:**
- Selecting "Task 1 Only" hides Task 2 panel
- Selecting "Task 2 Only" hides Task 1 panel
- Selecting "Full Test" shows both panels
- Switching format preserves entered data (hidden tasks keep their content)

**Image Upload (Task 1):**
- Click "Upload Image" → file picker (accept: jpg, png, webp, max 5MB)
- Click "Paste URL" → text input for external image URL
- Image uploaded to existing Firebase Storage path
- Preview shown with max-width 400px
- Delete button to remove uploaded image

**Prompt Text:**
- Plain textarea, required, max 2000 characters
- Character count shown below

**Model Answer:**
- Optional expandable textarea
- Toggle: "Show model answer to student after grading" (default: off)

**Word Minimum:**
- Number input, defaults: 150 (Task 1), 250 (Task 2)
- Applied ONLY in solo practice and homework modes (teacher-configurable enforcement)
- In live sessions: no enforcement (displayed but not blocking)

**Auto-Save:**
- Debounced 2-second auto-save to Firestore (`writing_drafts/`)
- "Saving..." / "✅ Saved" indicator
- Same pattern as `draftCloudService.ts`

**Validation (on Publish):**
- ❌ Block: Title is empty
- ❌ Block: Duration is 0 or unset
- ❌ Block: Any visible task has empty prompt text
- ❌ Block: Task 1 has no image uploaded (if Task 1 is visible)
- ⚠️ Warn: Model answer not provided (optional, allow continue)

**Publish Flow:**
1. Validation → show errors/warnings
2. Generate test ID (new) or use existing
3. Write to RTDB `tests/{testId}` with `skill: 'Writing'`
4. Update draft status to `'published'`
5. Success dialog: "Start Session" / "Assign as Homework" / "Go to Test List"

---

### 4.3 Student Writing Test Page (Live Session)

#### 4.3.1 Route

```
/student/test/:sessionCode  ← Same route as IELTS R/L (reused)
```

Existing `TestPageRouter.tsx` must detect `skill: 'Writing'` and render `WritingTestPage`:

```typescript
case 'Writing':
  return <WritingTestPage {...props} />;
```

#### 4.3.2 Student Writing Layout

```
┌───────────────────────────────────────────────────────────────────┐
│ IELTS Writing Test         ⏱️ 45:00          [Submit Test]       │
│ [Task 1] [Task 2]                                                │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  LEFT PANEL (40%)                │  RIGHT PANEL (60%)             │
│  ┌─ Task Prompt ──────────────┐ │  ┌─ Essay Editor ───────────┐ │
│  │                             │ │  │                           │ │
│  │  WRITING TASK 1             │ │  │  [plain textarea]         │ │
│  │                             │ │  │                           │ │
│  │  You should spend about     │ │  │  The bar chart            │ │
│  │  20 minutes on this task.   │ │  │  illustrates the          │ │
│  │                             │ │  │  percentage of            │ │
│  │  ┌────────────────────┐    │ │  │  households that...        │ │
│  │  │  [Chart Image]     │    │ │  │                           │ │
│  │  │                    │    │ │  │                           │ │
│  │  │                    │    │ │  │                           │ │
│  │  └────────────────────┘    │ │  │                           │ │
│  │                             │ │  │                           │ │
│  │  Summarise the information  │ │  │                           │ │
│  │  by selecting and reporting │ │  │                           │ │
│  │  the main features, and    │ │  │                           │ │
│  │  make comparisons where    │ │  │                           │ │
│  │  relevant.                 │ │  │                           │ │
│  │                             │ │  │                           │ │
│  │  Write at least 150 words. │ │  │                           │ │
│  │                             │ │  ├───────────────────────────┤ │
│  └─────────────────────────────┘ │  │ Words: 127               │ │
│                                  │  └───────────────────────────┘ │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

Mobile (< 768px): single column, prompt in collapsible panel at top,
essay editor fills screen. "📖 Show Prompt" floating button when
prompt is collapsed.
```

![Student Writing Test UI Mockup](file:///C:/Users/Sanctuary/.gemini/antigravity/brain/0171a53f-8dab-4c9b-a05f-90820b771419/student_test_page_1772216025779.png)

#### 4.3.3 Student View Behaviors

**Tab Navigation:**
- Tabs at top: "Task 1" | "Task 2" (only visible tabs match test format)
- Switching tab preserves essay text in previous tab
- Active tab highlighted (blue #3b82f6 underline)

**Plain Textarea:**
- No formatting buttons (bold, italic, etc.)
- Browser spellcheck: DISABLED (`spellcheck="false"` attribute)
- Paragraph support (Enter = new paragraph)
- Undo/Redo via keyboard shortcuts (Ctrl+Z / Ctrl+Y) — browser native

**Word Counter:**
- Live word count displayed below editor: "Words: 127"
- Word counting rule: split by whitespace, filter empty strings
- In live session: word count displayed but NOT enforced (no submit blocking)
- Color: normal text color (no red/green indicators in live session)

**Timer:**
- Single shared timer for entire test (reuse existing `TestTimer` / `TestHeader`)
- Recommended time per task shown in prompt area (e.g., "You should spend about 20 minutes on this task")
- Student distributes time freely between tasks
- Timer expiry → auto-submit both tasks

**Per-Task Time Tracking (Passive):**
- Track which task tab is active + timestamps of tab switches
- Track active writing time per task using keystroke gap detection:
  - Start counting when student types a character
  - If no keystroke for 5 minutes → pause active time counting
  - Resume when next keystroke detected
  - Value chosen to minimize system stress while still being meaningful
- Student does NOT see per-task time — only teacher sees in results

**Auto-Save (RTDB — real-time sync):**
- Save ONLY the active task's essay text on change (debounced 3 seconds)
- Path: `game_sessions/{code}/students/{uid}/writing/task{N}`
- Fields saved: `{ text, wordCount, lastSavedAt }`
- Also save: `activeTask` (which tab), `tabSwitches` array
- On tab switch: immediately save previous task before switching

**Disconnect / Reconnect:**
- On disconnect: last auto-saved version is preserved in RTDB
- On reconnect: student resumes from the last saved state (essay text + word count + active tab)
- Same behavior as existing IELTS Reading/Listening reconnect pattern
- If timer expired during disconnect: auto-submit whatever was last saved

**Multiple Sessions Same Test:**
- If the same writing test is used in two separate live sessions, each session creates a completely separate submission
- Both submissions appear independently in the grading queue
- Both are tracked separately in the academic record

**Submit Flow:**
1. Student clicks "Submit Test"
2. Confirmation modal: "Submit your writing test? This cannot be undone."
   - Shows: Task 1: X words, Task 2: Y words
   - No word count warnings in live session
3. On confirm:
   - Save both tasks to RTDB
   - Copy essays + metadata to Firestore `writing_submissions/`
   - Create `EnhancedTestResultRecord` in RTDB with `markingStatus: 'pending-review'`
   - Show "Answer submitted" overlay, disable editing
4. Auto-submit on timer expiry (same flow, no confirmation)

**Navigation Guard:**
- `beforeunload` event: warn if essay has unsaved content
- Same as existing IELTS behavior

**Teacher Reopen:**
- If teacher reopens from monitor: student's essay unlocks
- Toast notification: "Your essay has been reopened for further editing"
- Student can edit and re-submit (if time remains)
- If timer has expired: essay cannot be reopened (reopen only works within session time)

#### 4.3.4 External Paste Prevention

> Best-effort prevention using clipboard API + input monitoring. Accepts fundamental limitation that manual retyping cannot be detected.

**Implementation:**

1. **Copy/Cut interception:** When student copies or cuts text within the editor, set a module-level flag `lastInternalCopy = { text, timestamp }`.

2. **Paste interception:** On `paste` event:
   - Read clipboard text
   - Check if it matches `lastInternalCopy.text` AND timestamp is within 60 seconds
   - If match: allow paste (internal)
   - If no match: block paste, show toast: "External pasting is disabled for this test"
   - Increment `pasteAttemptCount` counter

3. **Drop interception:** On `drop` event:
   - `event.preventDefault()` — block all drag-and-drop into the editor
   - Show same toast message

4. **Input monitoring (fallback):** On `input` event:
   - Track character count delta
   - If single input event inserts >10 characters AND no internal copy flag: block by reverting to previous value
   - Threshold of 10 chars allows for normal IME composition bursts (Vietnamese input)

5. **Logging:** `pasteAttemptCount` stored in submission, visible to teacher in grading view.

---

### 4.4 Teacher Test Monitor

#### 4.4.1 Writing-Specific Monitor Card

Within `TeacherTestMonitorPage.tsx`, when test is `skill: 'Writing'`:

```
┌─ Student Card ────────────────────────────┐
│  👤 Nguyễn Văn A                          │
│                                           │
│  Task 1: 142 words  ✍️ Active             │
│  Task 2: 0 words    ⏸ Not started         │
│                                           │
│  ⏱️ 32:14 elapsed                         │
│  Status: ● Writing                         │
│                                           │
│  [👁️ Peek]                                │
└───────────────────────────────────────────┘
```

**Status indicators:**
- ● Writing (green) — keystroke detected in last 5 minutes
- ○ Idle (amber) — no keystroke for 5+ minutes
- ✅ Submitted (blue) — essay submitted
- 🔌 Disconnected (red) — connection lost

**Peek button:**
- Opens modal showing student's essay text (read-only)
- Shows Task 1 and Task 2 in tabs
- Real-time updates from RTDB
- Student is NOT notified that teacher is peeking (invisible)

**Session Controls:**
- Reuse existing `SessionControlPanel` (Pause/Resume/Extend/End)
- "End Session" → auto-submit all students' essays immediately
- "Reopen" button per student card → unlocks submitted student's essay + sends notification
- Reopen only available while timer has not expired

---

### 4.5 Grading System

#### 4.5.1 Grading Queue

Accessed via teacher grading page. Shows all `writing_submissions` where `markingStatus === 'pending-review'` and teacher is the assigned grader.

**Assignment rules:**
- Live session → test owner (createdBy) is the grader
- Homework → assigning teacher is the grader
- Solo practice → student-selected teacher is the grader

```
┌─────────────────────────────────────────────────────────────────┐
│  📝 Writing Grading Queue          12 pending | 3,421 total words │
├─────────────────────────────────────────────────────────────────┤
│  Filter: [All ▼] [Live ▼] [Homework ▼] [Solo ▼]               │
│  Sort: [Newest first ▼]                                         │
│                                                                  │
│  ┌─ Submission ──────────────────────────────────────────────┐  │
│  │ 👤 Nguyễn Văn A  •  Full Test  •  426 words              │  │
│  │ 📎 IELTS Writing Practice #3                              │  │
│  │ 🏷️ Live Session  •  Submitted 2h ago                      │  │
│  │ Paste attempts: 0                                          │  │
│  │                                        [Grade →]           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Submission ──────────────────────────────────────────────┐  │
│  │ 👤 Trần Thị B  •  Task 2 Only  •  287 words              │  │
│  │ 📎 Opinion Essay Homework                                 │  │
│  │ 🏷️ Homework  •  Submitted 1d ago  •  ⏰ Due in 2d         │  │
│  │ Paste attempts: 2 ⚠️                                      │  │
│  │                                        [Grade →]           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.5.2 Grading Interface

One task at a time (tabbed). Side-by-side layout: essay left, grading panel right.

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Queue   Grading: Nguyễn Văn A   [Task 1] [Task 2]   │
│                                            [Save Draft] [Submit]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LEFT (55%) — Student Essay         │ RIGHT (45%) — Grading     │
│  ┌─ Task Prompt (collapsible) ────┐ │ ┌─ Criteria Scores ─────┐│
│  │ Summarise the information...   │ │ │                        ││
│  │ [Chart Image thumbnail]        │ │ │ Task Achievement (TA)  ││
│  └────────────────────────────────┘ │ │ [0][1][2][3]...[8][9]  ││
│                                      │ │ Selected: ● 7          ││
│  ┌─ Student Essay ────────────────┐ │ │                        ││
│  │                                │ │ │ Coherence & Cohesion   ││
│  │ The bar chart illustrates the  │ │ │ [0][1][2]...[8][9]     ││
│  │ percentage of households that  │ │ │ Selected: ● 6          ││
│  │ owned different types of       │ │ │                        ││
│  │ technology in a European       │ │ │ Lexical Resource       ││
│  │ country between 2000 and 2015. │ │ │ [0][1][2]...[8][9]     ││
│  │                                │ │ │ Selected: ● 7          ││
│  │ Overall, it is clear that...   │ │ │                        ││
│  │                                │ │ │ Grammatical Range      ││
│  │ [highlighted text in blue]     │ │ │ [0][1][2]...[8][9]     ││
│  │ [strikethrough text in red]    │ │ │ Selected: ● 5          ││
│  │                                │ │ │                        ││
│  │ 142 words • Active: 18m 32s   │ │ │ Task Band: 6.0         ││
│  │ Paste attempts: 0             │ │ │ (auto-calculated)      ││
│  └────────────────────────────────┘ │ └────────────────────────┘│
│                                      │                          │
│  ┌─ Annotation Toolbar ──────────┐ │ ┌─ Feedback ─────────────┐│
│  │ [Highlight ▼] [Comment]       │ │ │ Task Achievement:      ││
│  │ [Strikethrough] [Correction]  │ │ │ [rich text editor]     ││
│  │ [Text Color ▼]                │ │ │                        ││
│  │                               │ │ │ Coherence & Cohesion:  ││
│  │ Categories: TA CC LR GRA     │ │ │ [rich text editor]     ││
│  │ [SPL] [FMT] [+ Add]          │ │ │                        ││
│  └───────────────────────────────┘ │ │ Overall Feedback:      ││
│                                      │ │ [rich text editor]     ││
│  ┌─ Model Answer (toggle) ──────┐ │ │                        ││
│  │ ☐ Show model answer           │ │ │ [Void Task] button     ││
│  └───────────────────────────────┘ │ └────────────────────────┘│
│                                                                  │
│  Overall Band: 6.5 (auto-calculated from both tasks)            │
│                                                                  │
│                              [← Prev Submission] [Next →]       │
└─────────────────────────────────────────────────────────────────┘
```

![Teacher Grading Interface Mockup](file:///C:/Users/Sanctuary/.gemini/antigravity/brain/0171a53f-8dab-4c9b-a05f-90820b771419/grading_interface_1772216038899.png)

#### 4.5.3 Grading Behaviors

**Criteria Scoring:**
- 10 buttons per criterion (0-9), whole numbers only
- Click to select, click again to deselect
- Task band auto-calculates live as teacher enters scores
- Overall band auto-calculates when both tasks have scores

**Annotation Toolbar:**
1. **Highlight:** Select essay text → click Highlight → pick category/color → text highlighted
2. **Comment:** Select text → click Comment → type comment in popup → saved as margin note
3. **Strikethrough:** Select text → click Strikethrough → text shown with strikethrough
4. **Correction:** Select text → click Correction → type replacement → shows above/below original
5. **Text Color:** Select text → click Color → pick color → text color changes

**Category Quick Buttons:**
- 4 IELTS presets: TA (blue #3b82f6), CC (green #10b981), LR (orange #f59e0b), GRA (red #ef4444)
- Custom categories shown alongside (e.g., SPL brown, FMT crimson)
- [+ Add] button → inline mini-form: label, abbreviation, color picker
- Categories saved to teacher's Firestore settings

**Void Task:**
- "Void Task" button per task
- Requires reason text: "Why is this task being voided?"
- Voided task: grayed out in UI, excluded from band calculation
- Academic record shows: "Band 6.5 (Task 2 only, Task 1 voided)"
- Voided tasks do NOT count toward "Number of Writing tests completed" stat

**Re-Grading:**
- If already graded, "Edit Grades" button appears
- Confirmation: "Previous band was X, you are about to change grades. Reason required."
- Reason text field (required)
- Previous scores + reason saved to `auditTrail[]`
- Student sees only latest grades

**Save & Submit:**
- "Save Draft" — saves grading progress to Firestore without publishing to student
- Auto-save grading every 30 seconds while grading interface is open
- `beforeunload` warning if unsaved changes
- "Submit Grading" — finalizes grades:
  1. Update `markingStatus` to `'graded'` in Firestore
  2. Update RTDB result index with band scores
  3. Send notification to student: "Your writing test has been graded"
  4. Navigate to next ungraded submission

**Partial Grading (Full Test):**
- Teacher may grade Task 1 and submit without scoring Task 2 (or vice versa)
- "Submit Grading" is available once **at least one task** has all 4 criteria scored
- On partial submit:
  1. `markingStatus` set to `'graded'` (the submission IS graded — partially)
  2. `grading.perTask[]` contains only the graded task(s); ungraded tasks have no entry
  3. `grading.overallBand` is set to the graded task's band (no weighting applied to partial results)
  4. Student notification: "Your writing test has been partially graded — Task [N] results available"
- When teacher later grades the remaining task:
  1. Opens the same submission, sees Task 1 already scored, grades Task 2
  2. On re-submit: `overallBand` recalculated with full weighting (1/3 + 2/3)
  3. Previous partial scores saved to `auditTrail[]` with reason: "Completed grading for remaining task(s)"
  4. Student notification: "Your writing test [Title] has been fully graded — Band [X]"

---

### 4.6 Results & Review

#### 4.6.1 Student Results View

When `markingStatus === 'graded'` but only one task is scored (partial grading):
```
┌───────────────────────────────────────────────────────────────┐
│  📝 Writing Test Results — Partially Graded                   │
│                                                               │
│  ┌─ Band Score ──────────────────────────────────────────┐   │
│  │  Task 1: 6.0                                          │   │
│  │  TA: 6  CC: 6  LR: 7  GRA: 5                         │   │
│  │                                                        │   │
│  │  Task 2: ⏳ Pending Teacher Review                     │   │
│  │                                                        │   │
│  │  Overall Band: — (awaiting Task 2 grading)            │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  [Task 1 essay with annotations]  |  [Task 2 essay read-only]│
│  [Task 1 teacher feedback]        |  [No feedback yet]       │
└───────────────────────────────────────────────────────────────┘
```


When `markingStatus === 'pending-review'`:
```
┌───────────────────────────────────────────────────────────────┐
│  📝 Writing Test Results                                      │
│  IELTS Writing Practice #3                                    │
│                                                               │
│  Status: ⏳ Pending Teacher Review                            │
│  Submitted: Feb 28, 2026 at 2:30 PM                          │
│                                                               │
│  ┌─ Submission Summary ──────────────────────────────────┐   │
│  │ Task 1: 142 words  •  Active time: 18m 32s           │   │
│  │ Task 2: 284 words  •  Active time: 36m 15s           │   │
│  │ Total elapsed: 58m 47s                                │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Your Essay (read-only) ──────────────────────────────┐   │
│  │ [Task 1] [Task 2]                                     │   │
│  │                                                        │   │
│  │ The bar chart illustrates the percentage of            │   │
│  │ households that owned different types of...            │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

When `markingStatus === 'graded'`:
```
┌───────────────────────────────────────────────────────────────┐
│  📝 Writing Test Results — Graded                             │
│                                                               │
│  ┌─ Band Score ──────────────────────────────────────────┐   │
│  │         🏆  Overall Band: 6.5                          │   │
│  │                                                        │   │
│  │  Task 1: 6.0          Task 2: 7.0                     │   │
│  │  TA: 6  CC: 6  LR: 7  GRA: 5 │ TR: 7  CC: 7  LR: 7  GRA: 7│
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Your Essay (with annotations) ───────────────────────┐   │
│  │ [Teacher highlights, comments, corrections visible]    │   │
│  │ Click highlighted text to see teacher's comment        │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Teacher Feedback ────────────────────────────────────┐   │
│  │ Overall: [rich text feedback]                          │   │
│  │ Task Achievement: [rich text feedback]                 │   │
│  │ Coherence & Cohesion: [rich text feedback]             │   │
│  │ Lexical Resource: [rich text feedback]                 │   │
│  │ Grammar: [rich text feedback]                          │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Model Answer (if enabled) ───────────────────────────┐   │
│  │ [Teacher's model answer displayed here]                │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

![Student Results View Mockup](file:///C:/Users/Sanctuary/.gemini/antigravity/brain/0171a53f-8dab-4c9b-a05f-90820b771419/student_results_view_1772216053301.png)

#### 4.6.2 Teacher Results Page

Within `TeacherTestResultsPage.tsx`, when test is `skill: 'Writing'`:

- Student list: name, overall band, Task 1 band, Task 2 band, grading status
- Sort by: name, band score, submission time, grading status
- Filter: graded / ungraded
- Click student → open WritingResultDetailModal with essay + annotations + scores

---

### 4.7 Solo Practice

#### 4.7.1 Practice Entry

`StudentPracticePage.tsx` detects writing test → routes to `WritingPracticeView`:

```typescript
// In StudentPracticePage.tsx type detection:
if (testData.skill === 'Writing') {
  return <WritingPracticeView materialId={materialId} practiceContext={context} />;
}
```

#### 4.7.2 Writing Practice View

Same layout as live session (§4.3.2) with these differences:

- Timer: optional (teacher-configured via `MaterialSoloConfig.defaults.timerMinutes`)
- Word minimum enforcement: teacher-configurable. If enabled:
  - Task 1 word count < minimum → warning on submit: "Task 1 has X/150 words. Continue?"
  - Teacher sets per test: enable/disable + custom minimum value
- Auto-save: to localStorage (not RTDB, since no live session)
- Resume: `SoloResumeModal` if previous session exists
- External paste prevention: same as live session (§4.3.4)
- Active time tracking: same as live session (§4.3.3)

#### 4.7.3 Submit to Teacher Flow

After student finishes writing in solo practice:

1. "Submit for Review" button replaces normal "Submit"
2. Modal appears:
   ```
   ┌─ Submit for Teacher Review ─────────────────┐
   │                                              │
   │  Select teacher:                             │
   │  [▼ Teacher dropdown — enrolled teachers]    │
   │                                              │
   │  Add a note (optional):                      │
   │  [________________________________]          │
   │                                              │
   │  Task 1: 156 words  Task 2: 267 words       │
   │                                              │
   │  [Cancel]                    [Submit →]       │
   └──────────────────────────────────────────────┘
   ```
3. Teacher dropdown: list of teachers from student's enrolled classes
4. If only 1 teacher: auto-selected (dropdown still visible)
5. On submit:
   - Save to Firestore `writing_submissions/` with `context.type: 'solo-practice'`
   - Create RTDB result index with `markingStatus: 'pending-review'`
   - Send notification to selected teacher
   - Show confirmation: "Essay submitted to [Teacher Name] for review"

**Unlimited Submissions:**
- A student may submit the **same solo writing test multiple times** to the same or different teachers
- Each submission is a **separate grading entry** with its own `submissionId`
- All submissions appear independently in the teacher's grading queue
- All graded submissions are tracked separately in the student's academic record
- There is no limit on the number of solo submissions per test

**No class enrollment:**
- If student has no teachers → show self-review only:
  - Word count + time summary
  - Essay saved in Firestore with `context.type: 'solo-practice'`, no teacher assigned
  - Can be assigned to a teacher later when student joins a class

#### 4.7.4 Practice from Library & Module

- Writing tests appear in `StudentLibraryPage` with writing icon
- "Practice" button starts writing practice session
- Writing tests in course modules: both solo practice and homework-assignable (§4.8)

---

### 4.8 Homework Integration

#### 4.8.1 Homework Assignment

- `HomeworkCreateModal.tsx`: support selecting writing tests (`skill: 'Writing'`)
- Writing homework displays writing icon in homework list
- Teacher configures:
  - Due date (DateTimeCalendar)
  - Late submission policy: "Block" or "Allow late with flag" (radio buttons)
  - Word minimum enforcement: on/off + custom values
  - Max attempts (optional)
  - Timer: optional

#### 4.8.2 Student Homework View

- Same as solo practice view (§4.7.2)
- Timer enforced if teacher set one
- Word minimum enforced if teacher enabled it
- Submit → auto-sends to assigning teacher (no teacher selection modal)
- Late submission: if past due and policy is "Allow late" → warning: "This homework is past due. Your submission will be marked as late."
- Re-attempt: previous essay pre-loaded for improvement

#### 4.8.3 Homework Result

- Before grading: "Submitted — Pending Teacher Review" with word count + time
- After grading: full band breakdown + teacher feedback + annotations
- Re-attempt button (if allowed and attempts remaining)

---

### 4.9 Notifications

| Trigger | Recipient | Type | Message | Link |
|---------|-----------|------|---------|------|
| Solo/homework essay submitted | Teacher | info | "New writing submission from [Student] — [Test Title]" | → Grading queue |
| Grading completed | Student | success | "Your writing test [Title] has been graded — Band [X]" | → Result page |
| Homework due in 24h | Student | warning | "Writing homework [Title] is due in 24 hours" | → Homework detail |
| Homework overdue | Student | warning | "Writing homework [Title] is overdue" | → Homework detail |
| Essay reopened by teacher | Student | info | "Your essay has been reopened for further editing" | → Test page |
| Live session ends | Student | info | "Writing test session has ended" | → Results page |
| Score changed (re-grade) | Student | info | "Your writing test [Title] scores have been updated" | → Result page |
| Ungraded submissions digest (periodic) | Teacher | info | "You have [N] ungraded writing submissions" | → Grading queue |

> The periodic digest frequency is TBD (daily or weekly). Implementation may use a Cloud Function scheduled trigger.

---

### 4.10 Academic Record

#### 4.10.1 Writing Progress Section

New section in `AcademicRecordPage.tsx` alongside IELTS Reading/Listening:

- Overall writing band trend chart (line chart over time)
- Per-criteria average scores (TA/TR, CC, LR, GRA)
- Number of tests completed (exclude voided-only results)
- Best band score
- Recent results list (title, date, band, status)

#### 4.10.2 Result Cards

Writing result cards show:
- Band score (prominent)
- Criteria breakdown: TA/TR: X, CC: X, LR: X, GRA: X
- Marking status badge: "Pending Review" (amber) / "Graded" (green)
- If voided: "Band 6.5 (Task 2 only, Task 1 voided)"

#### 4.10.3 Pending Results

Results with `markingStatus: 'pending-review'` appear in academic record but are NOT included in:
- Average band calculations
- Progress trend charts
- Completion counts

They appear in the results list with "Pending Review" badge.

#### 4.10.4 Student Dashboard Integration

On the student dashboard (home page), add a **"Pending Reviews"** section showing:
- Test title
- Submitted date
- Status: "Pending Review" (amber) or "Graded" (green)
- When graded: shows band score inline
- Click → navigates to result detail page

This is separate from the academic record — it provides quick visibility on the dashboard without navigating to the full academic record page.

---

### 4.11 THCS Writing Integration

#### 4.11.0 Deleted Student Handling

If a student's account is deleted while they have submissions in the grading queue:
- Submissions remain in the queue, marked as **"[Deleted Student]"**
- Teacher can choose to:
  - **Archive:** Grade the essay for record-keeping purposes
  - **Discard:** Remove the submission from the queue entirely
- Graded results for deleted students are preserved in Firestore but excluded from class statistics

**Grading Queue UI for deleted students:**
```
┌─ Submission ──────────────────────────────────────────────┐
│ 👤 [Deleted Student]  •  Full Test  •  312 words          │
│ 📎 IELTS Writing Practice #3                              │
│ 🏷️ Solo Practice  •  Submitted 3d ago                     │
│ ⚠️ Student account has been deleted                       │
│                                                            │
│  [📦 Archive]  [🗑️ Discard]                [Grade →]      │
└───────────────────────────────────────────────────────────┘
```
- **Archive** removes the submission from the active queue and moves it to an archived state in Firestore (still queryable but hidden from the default queue view)
- **Discard** permanently deletes the submission from Firestore after confirmation: "This will permanently delete this essay. Continue?"
- **Grade →** opens the normal grading interface (teacher can still grade for record-keeping)

Per decision Q49=A / Q67=A: THCS tests with writing questions (sentence-rewrite) ALSO flow to the grading queue.

**Flow:**
1. THCS auto-grading runs first (handles all MCQ + fill-in questions)
2. Writing questions (sentence-rewrite) auto-graded by `thcsWritingGrading.service.ts`
3. Result created with `markingStatus: 'pending-review'` if writing questions exist
4. Result appears in teacher's grading queue for review/override
5. Teacher can adjust auto-graded writing scores or accept them

This means the grading queue shows TWO types of items:
- IELTS Writing submissions (full essays, criteria-based grading)
- THCS results with writing questions (sentence-rewrite, simpler review)

Queue filtering distinguishes them via source type.

---

## 5. Non-Goals (Out of Scope)

1. **AI-assisted grading** — No AI band suggestions, auto-feedback, or AI scoring. Teacher manual grading only.
2. **Speaking test** — Not covered in this PRD.
3. **Batch grading shortcuts** — No quick-band buttons or batch operations.
4. **Mobile grading** — Grading interface is desktop-only.
5. **Version control/changelog** for writing tests — Not in scope.
6. **Template system** for writing tests — Not in scope.
7. **Plagiarism detection** beyond paste prevention — Not in scope.
8. **Print/export** of essays or results — Not in scope.

---

## 6. Design Considerations

- Follow existing IELTS Reading/Listening UI style (TwoColumnLayout, blue/dark theme)
- Full mobile support for student test-taking (§4.3.2 mobile layout)
- No mobile support for teacher grading (desktop only)
- ASCII mockups provided in §4.2.2, §4.3.2, §4.5.2 — image mockups to be generated separately
- Annotation colors must have sufficient contrast on both light and dark backgrounds
- Rich text editor for teacher feedback: use a lightweight library (TipTap, Quill, or similar — NO Mantine RichTextEditor)

---

## 7. Technical Considerations

1. **Firestore document size:** Writing submissions are ~20KB worst case, well within 1MB limit. Single document per submission is sufficient.
2. **RTDB real-time sync:** Essay text synced every 3 seconds (debounced). At 400 words (~2KB), this is minimal RTDB bandwidth.
3. **Backup coverage:** New Firestore collections auto-discovered by backup system. No changes needed to `r2-backup-worker`.
4. **External paste prevention:** Clipboard API + input monitoring combo (§4.3.4). Best-effort, ~95% prevention.
5. **Active time tracking:** 5-minute keystroke gap threshold. Data stored per-task in submission.
6. **Draft auto-cleanup:** 90-day inactivity TTL on `writing_drafts/` collection. Implement via scheduled Cloud Function or manual cleanup job.
7. **Rich text editor:** Must NOT use Mantine components. Use TipTap or Quill directly.

---

## 8. Success Metrics

1. Teachers can create and publish a writing test in under 5 minutes
2. Students can write and submit essays without technical issues (submit success rate > 99%)
3. Teacher grading turnaround < 48 hours average (tracked via submission → grading timestamps)
4. Students access graded results with annotations and feedback without confusion
5. Writing band scores in academic record trend upward over 3+ attempts (learning indicator)

---

## 9. Open Questions

1. **Rich text editor library choice:** TipTap vs Quill vs ProseMirror for teacher feedback/annotation? Need to evaluate bundle size and compatibility.
2. **Annotation rendering in read-only mode:** How to efficiently render character-offset annotations on the student's read-only essay view? Consider a custom renderer component.
3. **THCS writing in grading queue UX:** Should THCS sentence-rewrite reviews use the same grading interface or a simplified one?
4. **Cloud Function for draft cleanup:** Should this be a Firebase scheduled function or a manual admin action?
