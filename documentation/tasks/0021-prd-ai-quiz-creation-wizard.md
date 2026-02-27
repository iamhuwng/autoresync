# PRD-0021: AI Quiz Creation Wizard

> **Version**: 1.0  
> **Created**: 2026-02-06  
> **Status**: Draft  
> **Author**: AI Assistant + User Collaboration

---

## 1. Introduction/Overview

### 1.1 Problem Statement

The original AI-powered quiz creation features (rule-based and hybrid AI parsing) were deleted during PRD-0020 (Automated IELTS Reading Test Creation). The `BulkQuestionCreator` component now uses a stub `textParser.js` that only performs basic regex parsing, severely limiting teachers' ability to quickly create quizzes from existing content.

Teachers currently must:
- Manually enter each question one-by-one
- Use the limited regex parser that fails to detect question types, options, or answers
- Spend 30-60 minutes creating a 20-question quiz instead of 2-3 minutes

### 1.2 Solution

Build a **complete AI-powered Quiz Creation Wizard** that allows teachers to:
1. Paste text from worksheets, exam papers, or textbooks
2. Have AI automatically extract questions, options, answers, and passages
3. Review with confidence indicators and edit inline
4. Verify/complete answer keys
5. Publish to Firestore with proper schema

### 1.3 Goals

| Goal | Metric | Target |
|------|--------|--------|
| **Parsing Accuracy** | Questions correctly identified | ≥ 80% |
| **Time Savings** | Time to create 20-question quiz | < 3 minutes |
| **User Adoption** | Teachers using AI parsing vs manual | > 60% |
| **Error Reduction** | Questions needing manual correction | < 20% |

---

## 2. User Stories

### 2.1 Primary Users

- **Teachers**: Create quizzes for live Kahoot-style games
- **Teachers**: Create quizzes for homework assignments
- **Administrators**: Create "official" quizzes for the platform

### 2.2 User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US-01 | Teacher | Paste text from a worksheet and have AI extract questions | I can create quizzes in minutes instead of hours |
| US-02 | Teacher | See confidence scores for each parsed question | I know which questions need my attention |
| US-03 | Teacher | Edit parsed questions inline | I can fix errors without starting over |
| US-04 | Teacher | Verify and complete missing answer keys | All questions have correct answers before publishing |
| US-05 | Teacher | Resume an interrupted parsing session | I don't lose progress if I need to step away |
| US-06 | Teacher | Access my saved drafts | I can continue working on quizzes later |
| US-07 | Teacher | Create quizzes in Vietnamese or English | I can serve my students' language needs |
| US-08 | Admin | Create official quizzes with proper tagging | Quizzes are organized and discoverable |

---

## 3. Functional Requirements

### 3.1 Wizard Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     QUIZ CREATION WIZARD                         │
│                                                                  │
│  Step 1: INPUT          Step 2: PARSING       Step 3: REVIEW    │
│  ┌─────────────┐        ┌─────────────┐       ┌─────────────┐   │
│  │ Text Paste  │───────▶│ AI Extract  │──────▶│ Questions   │   │
│  │ (Phase 2:   │        │ Progress    │       │ Confidence  │   │
│  │  File Upload)│        │ Checkpoint  │       │ Passages    │   │
│  └─────────────┘        └─────────────┘       └──────┬──────┘   │
│                                                       │          │
│                                                       ▼          │
│  Step 5: SAVE           Step 4: ANSWERS       ┌─────────────┐   │
│  ┌─────────────┐        ┌─────────────┐       │ Answer Key  │   │
│  │ Metadata    │◀───────│ Verify Keys │◀──────│ Verification│   │
│  │ Publish     │        │ AI Guess?   │       │ (Expandable)│   │
│  └─────────────┘        └─────────────┘       └─────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Step 1: Content Input

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| FR-1.1 | System shall provide a text area for pasting content | P0 |
| FR-1.2 | System shall show character count and estimated question count preview | P1 |
| FR-1.3 | System shall detect content type (worksheet, exam, textbook) | P1 |
| FR-1.4 | System shall allow teacher to override detected content type | P1 |
| FR-1.5 | System shall support optional "parsing hints" for advanced users | P2 |
| FR-1.6 | System shall warn if content is too long (>10,000 chars) and suggest splitting | P1 |
| FR-1.7 | (Phase 2) System shall support file upload (.docx, .pdf, .txt) | P2 |

### 3.3 Step 2: AI Parsing

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| FR-2.1 | System shall use Gemini for primary AI extraction | P0 |
| FR-2.2 | System shall fallback to Groq if Gemini fails | P0 |
| FR-2.3 | System shall use Groq-optimized prompts for fallback | P1 |
| FR-2.4 | System shall display real-time parsing progress (stages) | P0 |
| FR-2.5 | System shall save checkpoints to server after each stage | P0 |
| FR-2.6 | System shall support resume from checkpoint if interrupted | P0 |
| FR-2.7 | System shall use dynamic timeout based on content length | P1 |
| FR-2.8 | System shall extract passages and link to relevant questions | P0 |
| FR-2.9 | System shall extract answer keys when present in content | P0 |
| FR-2.10 | System shall support bilingual content (English/Vietnamese) | P1 |

**Dynamic Timeout Formula:**
```typescript
const calculateTimeout = (contentLength: number): number => {
  const baseTimeout = 30000; // 30 seconds
  const perThousandChars = 10000; // +10 seconds per 1000 chars
  return Math.min(
    baseTimeout + Math.ceil(contentLength / 1000) * perThousandChars,
    180000 // Max 3 minutes
  );
};
```

### 3.4 Step 3: Review & Edit

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| FR-3.1 | System shall display parsed questions in a list view | P0 |
| FR-3.2 | System shall show per-question confidence indicator (color-coded) | P0 |
| FR-3.3 | System shall show overall parsing confidence summary | P1 |
| FR-3.4 | System shall auto-detect Quick/Full mode based on confidence | P0 |
| FR-3.5 | Quick mode: Simple list with inline editing | P0 |
| FR-3.6 | Full mode: Uncertain items sidebar + detailed editing | P0 |
| FR-3.7 | System shall allow inline editing of question text, options, type | P0 |
| FR-3.8 | System shall highlight duplicate questions for teacher decision | P1 |
| FR-3.9 | System shall show passages in a separate panel | P1 |
| FR-3.10 | System shall support drag-and-drop reordering of questions | P2 |

**Confidence Thresholds:**
```typescript
const CONFIDENCE = {
  HIGH: 0.85,      // Green - Auto-accept
  MEDIUM: 0.65,    // Yellow - Suggest review
  LOW: 0.50,       // Orange - Requires review
  CRITICAL: 0.30,  // Red - Likely wrong, blocks publishing
};

const MODE_SELECTION = {
  QUICK_MODE_THRESHOLD: 0.80,  // All questions >= 0.80 → Quick mode
  FULL_MODE_TRIGGER: 0.65,     // Any question < 0.65 → Full mode
};
```

### 3.5 Step 4: Answer Key Verification

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| FR-4.1 | System shall show extracted answers inline with questions (combined view) | P0 |
| FR-4.2 | System shall provide expandable "Advanced: Verify Answers" section | P1 |
| FR-4.3 | System shall warn when answers are missing for any question | P0 |
| FR-4.4 | System shall require answer for all questions before publishing | P0 |
| FR-4.5 | System shall offer "AI Guess Answer" option for missing answers | P1 |
| FR-4.6 | AI guessed answers shall be marked with warning indicator | P1 |

### 3.6 Step 5: Metadata & Publish

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| FR-5.1 | System shall require quiz title | P0 |
| FR-5.2 | System shall allow optional description | P1 |
| FR-5.3 | System shall allow tag assignment for filtering/search | P1 |
| FR-5.4 | System shall allow visibility setting (private/class/public) | P1 |
| FR-5.5 | System shall save to Firestore with proper schema | P0 |
| FR-5.6 | System shall block publishing if any question has critical confidence | P0 |
| FR-5.7 | System shall allow confidence override with logging | P2 |

### 3.7 Draft Management

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| FR-6.1 | System shall auto-save drafts to Realtime DB after each step | P0 |
| FR-6.2 | Drafts shall be stored in `quiz_drafts/{userId}/{draftId}` | P0 |
| FR-6.3 | System shall show draft resume modal when wizard opens with existing drafts | P0 |
| FR-6.4 | Drafts older than 7 days shall trigger cleanup prompt | P1 |
| FR-6.5 | Draft data shall be converted to Firestore schema on publish | P0 |
| FR-6.6 | System shall delete draft from Realtime DB after successful publish | P0 |

### 3.8 Navigation & UX

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| FR-7.1 | System shall provide stepper navigation with clickable steps | P0 |
| FR-7.2 | System shall preserve changes when navigating between steps | P0 |
| FR-7.3 | System shall warn when navigating would lose step-specific changes | P1 |
| FR-7.4 | System shall allow cancel with confirmation dialog | P0 |
| FR-7.5 | On parse failure, system shall offer retry and manual entry options | P0 |

### 3.9 Question Types

The wizard shall support these 7 question types:

| Type | Detection | Student View Support |
|------|-----------|---------------------|
| `multiple-choice` | A, B, C, D options | ✅ MultipleChoiceInput |
| `multiple-select` | "Select all that apply" | ✅ MultipleSelectInput |
| `matching` | Match items to options | ✅ MatchingInput |
| `completion` | Fill in blanks (______) | ✅ CompletionInput |
| `true-false-not-given` | T/F/NG statements | ✅ Auto-generates options |
| `yes-no-not-given` | Y/N/NG statements | ✅ Auto-generates options |
| `diagram-labeling` | Labels for diagrams | ✅ DiagramLabelingInput |

**Type Mapping from IELTS Types:**
```typescript
const mapToQuizType = (detectedType: string): QuizQuestionType => {
  const mappings: Record<string, QuizQuestionType> = {
    // Direct mappings
    'multiple-choice': 'multiple-choice',
    'multiple-select': 'multiple-select',
    'true-false-not-given': 'true-false-not-given',
    'yes-no-not-given': 'yes-no-not-given',
    'diagram-labeling': 'diagram-labeling',
    
    // Matching variants → matching
    'matching': 'matching',
    'matching-headings': 'matching',
    'matching-information': 'matching',
    'matching-features': 'matching',
    'matching-sentence-endings': 'matching',
    
    // Completion variants → completion
    'completion': 'completion',
    'sentence-completion': 'completion',
    'summary-completion-text': 'completion',
    'summary-completion-list': 'completion',
    'note-completion': 'completion',
    'table-completion': 'completion',
    'flowchart-completion': 'completion',
    'short-answer': 'completion',
  };
  
  return mappings[detectedType] || 'multiple-choice';
};
```

---

## 4. Non-Goals (Out of Scope)

| Non-Goal | Rationale | Future Phase |
|----------|-----------|--------------|
| File upload (.docx, .pdf) | Phase 2 scope | Phase 2 |
| Image extraction from documents | Requires OCR/vision | Phase 3 |
| Image upload for diagrams | Complex flow | Phase 3 |
| Audio question creation | Requires audio handling | Phase 4 |
| Edit existing quizzes via wizard | Keep QuizEditor separate | Consider later |
| Student quiz creation | Teachers only for now | Future |
| Rate limiting | No limits initially | If abuse occurs |
| Floating action button | Removed per user preference | N/A |

---

## 5. Technical Considerations

### 5.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SERVICE LAYER                                    │
│                                                                          │
│   SHARED (from PRD-0020)              QUIZ-SPECIFIC (new)               │
│   ┌────────────────────────┐          ┌────────────────────────┐        │
│   │ aiService (router)      │          │ quiz-extractor.service │        │
│   │ document-converter      │          │ quiz-validator.service │        │
│   │ type-classifier         │          │ quiz-draft.service     │        │
│   │ Gemini/Groq providers   │          │ quiz-prompts.constants │        │
│   └────────────────────────┘          └────────────────────────┘        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         STORAGE LAYER                                    │
│                                                                          │
│   REALTIME DB                          FIRESTORE                         │
│   ┌────────────────────────┐          ┌────────────────────────┐        │
│   │ quiz_drafts/{userId}/   │          │ quizzes/{quizId}       │        │
│   │   {draftId}             │          │   (published quizzes)  │        │
│   │                         │──────────│                        │        │
│   │ game_sessions/{id}      │  Convert │ Questions embedded or  │        │
│   │   (live game data)      │  on pub  │ subcollection based on │        │
│   │                         │          │ quiz size (<50 or ≥50) │        │
│   └────────────────────────┘          └────────────────────────┘        │
│                                                                          │
│   Note: Old quizzes in Realtime DB (quizzes/) remain there              │
│         No migration - coexistence strategy                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 New Files to Create

```
src/
├── pages/
│   └── QuizCreationPage.tsx                    # Main wizard page
│
├── components/quiz-creation/
│   ├── QuizInputStep.tsx                       # Step 1: Text input
│   ├── QuizParsingProgress.tsx                 # Step 2: Progress display
│   ├── QuizReviewPanel.tsx                     # Step 3: Review & edit
│   ├── QuizAnswerVerification.tsx              # Step 4: Answer key verify
│   ├── QuizMetadataStep.tsx                    # Step 5: Metadata & save
│   ├── QuizConfidenceIndicator.tsx             # Shared confidence display
│   ├── QuizDraftResumeModal.tsx                # Resume draft prompt
│   └── QuizUncertainSidebar.tsx                # Uncertain items sidebar
│
├── services/quiz-creation/
│   ├── quiz-extractor.service.ts               # Quiz-specific AI extraction
│   ├── quiz-validator.service.ts               # Quiz-specific validation
│   ├── quiz-draft.service.ts                   # Draft management (Realtime DB)
│   ├── quiz-publisher.service.ts               # Publish to Firestore
│   └── index.ts                                # Barrel export
│
├── hooks/quiz/
│   ├── useQuizCreation.ts                      # Main wizard state management
│   ├── useQuizParser.ts                        # Parsing logic + progress
│   ├── useQuizDraft.ts                         # Auto-save + resume
│   └── useQuizPublish.ts                       # Publish flow
│
├── constants/
│   └── quiz-prompts.constants.ts               # AI prompt templates
│
└── types/
    └── quiz.types.ts                           # Quiz-specific types
```

### 5.3 Files to Modify

| File | Change |
|------|--------|
| `src/constants/routes.ts` | Add `QUIZ_CREATE` route |
| `src/pages/TeacherLobbyPage.jsx` | Replace BulkQuestionCreator with wizard navigation |
| `src/App.tsx` or router | Add route for QuizCreationPage |
| `src/components/BulkQuestionCreator.jsx` | DELETE (replaced by wizard) |

### 5.4 Files to Keep (No Changes)

- `QuizEditor.jsx` - For editing existing quizzes
- `SingleQuestionCreator.jsx` - Manual single question creation
- `StudentQuizPage.jsx` - Student view (already supports all types)
- `StudentAnswerInput.jsx` - Student input components
- `scoring.js` - Answer validation

### 5.5 Firestore Schema

```typescript
// Firestore: quizzes/{quizId}
interface FirestoreQuiz {
  id: string;
  title: string;
  description?: string;
  
  // Ownership
  createdBy: string;
  ownerId: string;
  visibility: 'private' | 'class' | 'public';
  
  // Metadata
  questionCount: number;
  estimatedDuration: number;
  tags: string[];
  
  // AI Parsing metadata
  aiParsed: boolean;
  parsingConfidence?: number;
  
  // Questions (embedded for small quizzes, subcollection for large)
  questions?: QuizQuestion[]; // If questionCount < 50
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// For large quizzes: quizzes/{quizId}/questions/{questionId}
interface QuizQuestion {
  id: string;
  number: number;
  question: string;
  type: QuizQuestionType;
  options?: string[];
  answer: string | string[];
  points: number;
  timer: number;
  passageId?: string;
  confidence?: number;
  aiExtracted: boolean;
}

// quizzes/{quizId}/passages/{passageId}
interface QuizPassage {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  questionRange: { start: number; end: number };
}
```

### 5.6 Realtime DB Draft Schema

```typescript
// quiz_drafts/{userId}/{draftId}
interface QuizDraft {
  id: string;
  userId: string;
  
  // Current state
  currentStep: 1 | 2 | 3 | 4 | 5;
  
  // Step 1 data
  inputContent?: string;
  detectedType?: string;
  teacherHints?: string;
  
  // Step 2 data (checkpoint)
  parsingCheckpoint?: {
    stage: 'passages' | 'questions' | 'answers' | 'complete';
    passages?: ExtractedPassage[];
    questions?: ExtractedQuestion[];
    answerKey?: Record<number, string>;
  };
  
  // Step 3 data
  reviewedQuestions?: QuizQuestion[];
  passages?: QuizPassage[];
  
  // Step 4 data
  verifiedAnswers?: Record<number, string>;
  aiGuessedAnswers?: number[]; // Question numbers with AI-guessed answers
  
  // Step 5 data
  metadata?: {
    title: string;
    description?: string;
    tags: string[];
    visibility: 'private' | 'class' | 'public';
  };
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
}
```

### 5.7 Progressive Loading for Game Sessions

```typescript
// When starting a game with a Firestore quiz
async function loadQuizForGame(quizId: string): Promise<void> {
  const gameSessionRef = ref(database, `game_sessions/${sessionId}`);
  
  // Stage 1: Load metadata + first 5 questions (immediate)
  const quizDoc = await getDoc(doc(firestore, 'quizzes', quizId));
  const quiz = quizDoc.data() as FirestoreQuiz;
  
  // Immediately cache first questions for fast start
  const firstQuestions = quiz.questions?.slice(0, 5) || [];
  await update(gameSessionRef, {
    quizId,
    totalQuestions: quiz.questionCount,
    cachedQuestions: firstQuestions,
    loadingComplete: quiz.questionCount <= 5,
  });
  
  // Stage 2: Background load remaining (if large quiz)
  if (quiz.questionCount > 5) {
    if (quiz.questions) {
      // Embedded - already have all
      await update(gameSessionRef, {
        cachedQuestions: quiz.questions,
        loadingComplete: true,
      });
    } else {
      // Subcollection - stream in batches
      const questionsRef = collection(firestore, `quizzes/${quizId}/questions`);
      const snapshot = await getDocs(query(questionsRef, orderBy('number')));
      const allQuestions = snapshot.docs.map(d => d.data() as QuizQuestion);
      await update(gameSessionRef, {
        cachedQuestions: allQuestions,
        loadingComplete: true,
      });
    }
  }
}
```

---

## 6. Design Considerations

### 6.1 Wizard UI Layout

```
┌────────────────────────────────────────────────────────────────┐
│  ← Back                    Quiz Creation Wizard          [X]   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   ○ Input  ──── ● Review  ──── ○ Answers  ──── ○ Publish      │
│                     ▲                                          │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │   MAIN CONTENT AREA                                     │   │
│  │                                                         │   │
│  │   (Step-specific content renders here)                  │   │
│  │                                                         │   │
│  │                                                         │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  [Previous]                              [Next/Finish]  │   │
│  └────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Review Panel (Full Mode)

```
┌─────────────────────────────────────┬─────────────────────────┐
│           QUESTIONS LIST            │    UNCERTAIN ITEMS      │
│                                     │                         │
│  Q1. What is...?     [●] 0.92      │   ⚠️ 3 items need       │
│      A) Option A                    │      attention          │
│      B) Option B ✓                  │                         │
│      C) Option C                    │   Q5 - Low confidence   │
│      D) Option D                    │   Q8 - Missing answer   │
│                                     │   Q12 - Duplicate?      │
│  Q2. Which of...?    [●] 0.88      │                         │
│      ...                            │   [Fix All]             │
│                                     │                         │
│  Q3. True/False      [●] 0.45 ⚠️   │                         │
│      ❌ Needs review                │                         │
│                                     │                         │
└─────────────────────────────────────┴─────────────────────────┘
```

### 6.3 Mobile Responsiveness

- Stepper becomes vertical on mobile
- Uncertain sidebar becomes bottom sheet
- Questions list scrolls vertically
- Touch-friendly edit controls

---

## 7. Entry Points

| Entry Point | Route | Context |
|-------------|-------|---------|
| Teacher Lobby - "Create New Quiz" | `/quiz/create` | Fresh wizard |
| Homework Creation | `/quiz/create?assignmentId=X` | Links to assignment |
| Admin Materials | `/quiz/create?adminMode=true` | Official quiz creation |
| Draft Resume Modal | `/quiz/create?draftId=X` | Resume from draft |

---

## 8. Success Metrics

| Metric | Measurement | Target | Tracking |
|--------|-------------|--------|----------|
| Parsing Accuracy | (Correct questions / Total questions) × 100 | ≥ 80% | Log parsing results |
| Override Rate | Confidence overrides / Total low-confidence items | < 10% | Log overrides |
| Completion Rate | Published quizzes / Started wizards | > 70% | Funnel analytics |
| Draft Abandonment | Drafts not published after 7 days | < 30% | Draft cleanup stats |
| Time to Publish | Average time from start to publish | < 5 min | Session duration |

---

## 9. Testing Requirements

### 9.1 Unit Tests

- `quiz-extractor.service.test.ts`
- `quiz-validator.service.test.ts`
- `quiz-draft.service.test.ts`
- `useQuizCreation.test.tsx`
- `useQuizParser.test.tsx`

### 9.2 Integration Tests

- Full wizard flow (paste → parse → review → save)
- Draft save and resume
- Firestore publish
- Error handling and retry

### 9.3 E2E Tests (Playwright/Chrome)

- Happy path: Create quiz from sample text
- Resume from draft
- Handle parsing failure
- Publish with verification

### 9.4 Test Dataset

Create 10-20 sample inputs covering:
- Simple MCQ worksheets (English)
- Mixed question type exams (English)
- Vietnamese content
- Content without answer keys
- Very long content (>50 questions)
- Edge cases (duplicates, ambiguous answers)

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | What is the exact capacity of Firebase Spark tier for question limits? | To research |
| 2 | Should we track parsing costs (Gemini tokens) for future billing? | Deferred |
| 3 | How should we handle LaTeX/math notation in questions? | Phase 2 consideration |
| 4 | Should we add question difficulty auto-detection? | Nice-to-have |

---

## 11. Phasing

### Phase 1 (This PRD) - MVP
- Text paste input
- AI parsing with quiz-specific prompts
- Full review panel with confidence
- Answer key verification
- Firestore storage
- All 7 question types + type mapping
- Passage extraction
- Server-side drafts
- All entry points (no FAB)
- Checkpoint/resume
- Progressive loading for game sessions
- Hard switch from old BulkQuestionCreator
- Bilingual support (single prompt)
- E2E tests with Chrome

### Phase 2 - File Upload
- .docx upload
- .pdf upload (text extraction)
- .txt upload
- Drag & drop support

### Phase 3 - Images
- Image extraction from documents
- Image upload for diagram questions
- Image hosting (Firebase Storage)
- Diagram labeling question creation flow

### Phase 4 - Audio (Future)
- Audio detection in content
- Audio upload
- Audio URL linking
- Listening question types

---

## 12. Appendix

### A. AI Prompt Template (Bilingual)

```
CONTEXT / BỐI CẢNH:
You are parsing educational quiz content. The input may be from worksheets, exam papers, or textbooks.
Bạn đang phân tích nội dung quiz giáo dục. Đầu vào có thể từ bài tập, đề thi, hoặc sách giáo khoa.

INPUT TYPE DETECTED: ${detectedType}
${teacherHints ? `Teacher hint / Gợi ý: ${teacherHints}` : ''}

TASK / NHIỆM VỤ:
Extract questions, options, and answers. Output JSON.
Trích xuất câu hỏi, đáp án, và lựa chọn. Xuất ra JSON.

QUESTION TYPES TO DETECT / LOẠI CÂU HỎI:
- multiple-choice: Questions with A, B, C, D options / Trắc nghiệm với A, B, C, D
- multiple-select: "Select all that apply" / Chọn nhiều đáp án
- matching: Match items to options / Nối cặp
- completion: Fill in the blank (_____) / Điền vào chỗ trống
- true-false-not-given: T/F/NG statements / Đúng/Sai/Không có
- yes-no-not-given: Y/N/NG statements / Có/Không/Không đề cập
- diagram-labeling: Labels for diagrams / Gán nhãn sơ đồ

DO NOT EXTRACT / KHÔNG TRÍCH XUẤT:
- Page numbers, headers, footers / Số trang, đầu trang, chân trang
- Instructions about time or scoring / Hướng dẫn về thời gian hoặc điểm
- Watermarks or copyright notices / Watermark hoặc bản quyền

OUTPUT FORMAT: JSON
{
  "passages": [...],
  "questions": [...],
  "answerKey": {...},
  "metadata": {
    "detectedType": "...",
    "questionCount": N,
    "averageConfidence": 0.XX,
    "warnings": [...]
  }
}
```

### B. Confidence Override Logging

```typescript
interface ConfidenceOverride {
  quizId: string;
  questionNumber: number;
  originalConfidence: number;
  teacherId: string;
  timestamp: Timestamp;
  action: 'published_despite_low_confidence';
}

// Store in: analytics/confidence_overrides/{overrideId}
```

### C. Migration Notes

- **No migration** from old Realtime DB quizzes
- Old quizzes continue to work with existing flow
- New quizzes go to Firestore
- Game sessions always cache quiz data in Realtime DB for real-time sync
- `QuizEditor` continues to edit old quizzes in Realtime DB

---

## 13. Sign-off

| Role | Name | Date | Approval |
|------|------|------|----------|
| Product | [User] | 2026-02-06 | ✅ |
| Engineering | [AI Assistant] | 2026-02-06 | ✅ |
| QA | TBD | - | Pending |

---

*End of PRD-0021*
