# Tasks: PRD-0027 — THCS-THPT Test System Phase 1 (Editor + MCQ Flow) [v1.5]

> Generated from [0027-prd-thcs-thpt-test-system-phase1.md](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/tasks/0027-prd-thcs-thpt-test-system-phase1.md) (PRD v1.4)
> **v1.5 Changes (2026-02-26):** Fixed 11 critical, 8 moderate, 5 minor issues from codebase cross-reference audit. Key: fixed student routing file (TestPageRouter), thcsData interface, convertTimestamps, Add Section, recalculateQuestionNumbers, flow ordering.
> **Target Audience:** Junior developer with no experience — every detail is explicit. Do NOT improvise, guess, or deviate.

---

## Relevant Files

### New Files to Create
- `src/types/thcs-test.types.ts` - All THCS-THPT type definitions (THCSQuestion, THCSSection, THCSTest, THCSDraft, MCQIntent, instruction templates, grading result interfaces)
- `src/services/thcsDraftService.ts` - Firestore CRUD for THCS-THPT drafts (`thcs_drafts/` collection). Follow `testDraftService` in `draftCloudService.ts` as the pattern.
- `src/services/thcsTestStorage.ts` - RTDB save/load for published THCS-THPT tests. Follow `testStorage.ts` as the pattern.
- `src/services/thcsAutoMarking.service.ts` - Auto-grading for THCS-THPT MCQ tests. Follow `autoMarking.service.ts` as the pattern.
- `src/pages/THCSTestEditorPage.tsx` - The visual editor page (teacher creates/edits THCS-THPT tests)
- `src/hooks/thcs/useThcsDraft.ts` - Hook for loading/saving THCS drafts with auto-save
- `src/hooks/thcs/useThcsAutoSave.ts` - Debounced 2-second auto-save hook for THCS editor
- `src/hooks/thcs/useThcsValidation.ts` - Validation hook for publish checks
- `src/components/thcs-editor/THCSMetadataPanel.tsx` - Editor metadata form (title, duration, grade, exam type, etc.)
- `src/components/thcs-editor/THCSSectionBlock.tsx` - Section management component (section header, passage, questions list)
- `src/components/thcs-editor/THCSQuestionBlock.tsx` - MCQ question block (intent dropdown, options A-D, correct answer, image upload)
- `src/components/thcs-editor/THCSAnswerKeyPanel.tsx` - Collapsible answer key grid at bottom of editor
- `src/components/thcs-editor/THCSValidationSummary.tsx` - Validation error/warning display
- `src/services/imageUploadService.ts` - Firebase Storage upload for question/passage images (new — no existing service for this)
- `src/components/thcs-editor/THCSPronunciationOptions.tsx` - Pronunciation-specific option fields with underline toolbar
- `src/components/thcs-editor/THCSErrorIdentification.tsx` - Error identification variant (sentence + underline + auto-label A-D)
- `src/components/thcs-student/THCSTestLayout.tsx` - Student test-taking layout for THCS-THPT (section tabs, question navigation)
- `src/components/thcs-student/THCSQuestionRenderer.tsx` - Renders a single MCQ question for student (options, selection, flagging)
- `src/components/thcs-student/THCSSectionNav.tsx` - Section tab navigation footer with color-coded question pills
- `src/components/thcs-student/THCSPassagePanel.tsx` - Passage display (two-column sticky, single-column with floating button, slide-up panel)
- `src/components/thcs-student/THCSSubmitConfirmation.tsx` - Submit confirmation modal with unanswered count
- `src/pages/THCSTestResultsPage.tsx` - Student results page with section breakdown, 10-scale, skill analysis

### Existing Files to Modify
- `src/constants/routes.ts` - Add THCS editor routes (`TEACHER_THCS_CREATE`, `TEACHER_THCS_EDIT`)
- `src/App.jsx` - Add route definitions for THCS editor and wire up lazy loading
- `src/services/testStorage.ts` - Add `'THCS-THPT'` to `TestMetadata.type` and `TestData.type` unions
- `src/services/testResults.service.ts` - Add optional `thcsData` block to `TestResultRecord`
- `src/components/TestTypeSelectionModal.tsx` - Set THCS-THPT `available: true`, update `handleSkillSelect` to route to THCS editor
- `firestore.rules` - Add rules for `thcs_drafts/{draftId}` and `thcs_library/{testId}` collections
- `src/pages/TestPageRouter.tsx` - Add `testType` check BEFORE the skill-based switch: if `testData.testType === 'THCS-THPT'`, render `THCSTestLayout` instead of skill-based routing. **DO NOT modify `StudentTestPage.tsx`** — students reach that via TestPageRouter, not directly.

### Test Files
- `src/services/thcsDraftService.test.ts` - Unit tests for draft CRUD
- `src/services/thcsTestStorage.test.ts` - Unit tests for RTDB storage
- `src/services/thcsAutoMarking.service.test.ts` - Unit tests for MCQ grading
- `src/hooks/thcs/useThcsAutoSave.test.ts` - Unit tests for auto-save debounce
- `src/components/thcs-editor/THCSQuestionBlock.test.tsx` - Component tests for question block
- `src/components/thcs-student/THCSQuestionRenderer.test.tsx` - Component tests for student MCQ rendering

### Notes
- Unit tests should be placed alongside the code files they test (e.g., `thcsDraftService.ts` and `thcsDraftService.test.ts` in the same directory).
- Use `npx vitest run [optional/path/to/test/file]` to run tests.
- All Firebase writes MUST use `null` instead of `undefined` — Firestore and RTDB both reject `undefined`.
- Follow existing code patterns EXACTLY. When in doubt, look at the IELTS equivalent and replicate the pattern.
- **Error handling pattern:** Wrap ALL service calls in try/catch. On failure: show `notifications.show({ title: 'Error', message: error.message, color: 'red' })` using Mantine notifications. Log to console with `console.error('❌ [ComponentName]:', error)`. NEVER silently swallow errors.
- **Styling pattern:** Import `Card, CardBody, Button` from `src/components/modern`. Use Mantine components for all form elements (`TextInput, Select, Textarea, NumberInput, Switch, Collapse, Modal, SegmentedControl, Autocomplete`). Follow the glassmorphism card patterns visible in existing pages. Do NOT create raw `<div>` + inline styles for cards — always use the design system.
- **`testType` discriminator:** THCS-THPT tests in RTDB at `tests/{testId}` have a `testType: 'THCS-THPT'` field. Existing IELTS tests do NOT have this field (they use `type: 'IELTS'`). When loading from `getAllTestsFromFirebase()`, check `(test as any).testType === 'THCS-THPT'` to distinguish. NEVER assume all tests match the `TestData` interface.

---

## Tasks

- [x] 1.0 Data Model & Type Definitions
  - [x] 1.1 Create `src/types/thcs-test.types.ts` with the following EXACT type definitions. Copy them from PRD §4.1.1. Do NOT invent fields or rename anything:
    - `MCQIntent` — Union type of exactly these 15 string literals: `'pronunciation'`, `'word-stress'`, `'mcq-grammar'`, `'mcq-vocabulary'`, `'mcq-sign-notice'`, `'dialogue-response'`, `'reading-cloze-mcq'`, `'reading-comprehension'`, `'reading-announcement'`, `'sentence-arrangement'`, `'closest-meaning'`, `'error-identification'`, `'synonym-mcq'`, `'antonym-mcq'`, `'word-reference'`
    - `Phase2QuestionType` — Union type: `'verb-form'`, `'word-form'`, `'reading-cloze-wordbank'`, `'sentence-rewrite'`, `'sentence-rewrite-keyword'` (PRD §4.1.1 exact values — do NOT prefix with 'fill-' or 'write-')
    - `THCSQuestionType` — Union: `MCQIntent | Phase2QuestionType`
    - `THCSQuestion` — Interface with fields:
      - `id: string` (generated via `crypto.randomUUID()`)
      - `questionNumber: number` (globally sequential across all sections — recalculate on any reorder per PRD §9 EC13)
      - `type: THCSQuestionType` (Phase 1: always `'mcq'`)
      - `intent: MCQIntent`
      - `questionText: string`
      - `options: [string, string, string, string]` — TUPLE of exactly 4 strings. Index 0=A, 1=B, 2=C, 3=D. Do NOT use object `{A,B,C,D}`. PRD §4.1.1.
      - `correctAnswer: 'A' | 'B' | 'C' | 'D'`
      - `points?: number` (undefined = auto-calculated from section. Only set when section `pointMode === 'manual'`)
      - `imageUrl?: string`
      - `imageCaption?: string` (alt text for image — accessibility per PRD §6.3)
      - `optionUnderlines?: [string, string, string, string]` — pronunciation intent ONLY. Parallel tuple to `options`. Each is options[i] WITH `{{}}` markup around underlined part (e.g., `options[0]='drink'`, `optionUnderlines[0]='dr{{i}}nk'`). Student view converts `{{x}}` to `<u>x</u>`.
      - `underlinedParts?: string` — error-identification intent ONLY. The full `questionText` WITH `{{}}` markup around 4 underlined parts. Labels auto-assigned A/B/C/D in order (e.g., `"She {{go}} to school {{every day}} and {{study}} {{very hard}}."`).
      - `explanation?: { text: string; source: 'teacher' | 'ai'; approvedByTeacher: boolean }` (Phase 1: only `source: 'teacher'`. Store as object from day 1 to avoid migration.)
    - `THCSSection` — Interface with fields:
      - `id: string`
      - `name: string` (e.g., `'PART A: PRONUNCIATION'`)
      - `order: number` (0-based display order — used for sorting sections)
      - `totalPoints: number` (initial default: `0` — display auto-calculated value when 0 per PRD §9 EC14)
      - `pointMode: 'auto' | 'manual'` (`'auto'` = equally distributed; `'manual'` = per-question)
      - `instructionText: string` (auto-generated from intent, teacher-editable)
      - `isCustomInstruction: boolean` (true if teacher edited the auto-generated text)
      - `layout: 'single-column' | 'two-column'`
      - `passage?: { id: string; content: string; title?: string; imageUrl?: string; wordCount: number }` (only for reading sections — note `id` and `wordCount` from PRD)
      - `questions: THCSQuestion[]`
    - `THCSTestMetadata` — Interface:
      - `title: string`
      - `duration: number` (minutes — common: 45, 50, 60, 90)
      - `gradeLevel: 6 | 7 | 8 | 9 | 10 | 11 | 12` (typed union, not generic number)
      - `examType: string` (predefined options in UI but string type allows custom)
      - `subjectVariant?: string` (e.g., "Global Success", "Friends Global")
      - `province?: string` (e.g., "Thanh Hóa")
      - `school?: string` (e.g., "THPT Lam Sơn")
      - `description?: string`
      - `tags?: string[]`
    - `THCSTest` — Interface (published test in RTDB):
      - `id: string`
      - `testType: 'THCS-THPT'` (literal — this is the discriminator)
      - `metadata: THCSTestMetadata`
      - `sections: THCSSection[]`
      - `questionCount: number`
      - `totalPoints: number`
      - `createdBy: string`
      - `ownerId: string`
      - `isPublic: boolean`
      - `isComplete: boolean`
      - `createdAt: number`
      - `updatedAt: number`
      - `publishedAt?: number`
      - `sourceDraftId?: string` (the Firestore draft ID this test was published from — needed for "Edit" action in Teacher Lobby)
      - `stats?: { attempts: number; averageScore: number; averageTime: number; completionRate: number }` (optional — initialized on first submission, field name is `stats` NOT `statistics` per PRD §4.1.1)
      - `settings?: { showTimer: boolean; showResults: 'immediate' | 'after-submission'; allowReview: boolean }` (optional — Phase 1 hardcodes behavior, settings UI in Phase 2)
      - `_changelog?: Record<string, ChangelogEntry>` (Phase 1: DEFINED but not actively used. Phase 2 will record edits here.)
    - `ChangelogEntry` — Interface (Phase 1: define only, do NOT implement changelog recording):
      - `publishedAt: number`
      - `publishedBy: string`
      - `label: string` (auto-generated: "Edit #2 — 3 fields changed")
      - `previousValues: Record<string, any>` (keys use `~` separator for paths, e.g. `"sections~0~questions~2~correctAnswer": "B"`)
    - `THCSDraft` — Interface (draft in Firestore). Define EXPLICITLY with these fields (do NOT just say "same as THCSTest"):
      - `id: string` (Firestore auto-generated doc ID)
      - `userId: string` (the teacher who created this draft — needed for `getUserThcsDrafts()` query)
      - `testType: 'THCS-THPT'`
      - `metadata: THCSTestMetadata`
      - `sections: THCSSection[]`
      - `questionCount: number`
      - `totalPoints: number`
      - `status: 'editing' | 'review' | 'published'` (`'review'` for Phase 2 preview)
      - `createdAt: Date` (Firestore Timestamp, converted to Date on read)
      - `updatedAt: Date` (Firestore Timestamp, converted to Date on read)
    - `THCSGradingResult` — Interface (must match PRD §4.4.1 EXACTLY):
      - `testId: string`
      - `studentId: string`
      - `totalPoints: number` (points earned)
      - `maxPoints: number` (total possible)
      - `scaledScore: number` (formula: `(totalPoints / maxPoints) * 10`, rounded to 1 decimal)
      - `sectionResults: SectionResult[]`
      - `questionResults: Record<number, QuestionResult>` — keyed by `questionNumber` (NOT an Array, NOT keyed by UUID)
      - `gradedAt: number` (timestamp)
      - `gradingStatus: 'fully-graded'` (Phase 1: always fully graded since MCQ-only)
    - `SectionResult` — Interface:
      - `sectionId: string`
      - `sectionName: string`
      - `pointsEarned: number`
      - `pointsMax: number`
      - `correctCount: number`
      - `totalCount: number`
      - `percentage: number` (formula: `(correctCount / totalCount) * 100`)
      - `intentBreakdown: Record<MCQIntent, { correct: number; total: number }>` — aggregated correct/total by intent tag for skill analytics
    - `QuestionResult` — Interface:
      - `questionNumber: number`
      - `isCorrect: boolean`
      - `studentAnswer: string` ('A', 'B', 'C', or 'D')
      - `correctAnswer: string`
      - `pointsEarned: number`
      - `pointsMax: number`
  - [x] 1.2 Export the `INSTRUCTION_TEMPLATES` constant — a `Record<MCQIntent, string>` mapping each intent to its instruction text. Copy the EXACT strings from PRD §4.2.4. Do NOT modify the instruction text.
  - [x] 1.3 Export `DURATION_PRESETS = [45, 50, 60, 90] as const` and `GRADE_LEVELS = [6, 7, 8, 9, 10, 11, 12] as const` and `EXAM_TYPE_OPTIONS = ['giữa kì', 'cuối kì', 'thi vào 10', 'ôn tập', 'unit 1', 'unit 2', 'unit 3', 'unit 4', 'unit 5', 'unit 6', 'unit 7', 'unit 8', 'unit 9', 'unit 10', 'unit 11', 'unit 12'] as const`
  - [x] 1.4 Export `QUESTION_NAV_COLORS` constant matching PRD §4.3.3 EXACTLY — use the bold/saturated colors from the spec, NOT pastel variants:
    - `unanswered: { bg: '#e2e8f0', text: '#64748b' }` (PRD: light gray)
    - `answered: { bg: '#3b82f6', text: '#ffffff' }` (PRD: blue with white text)
    - `current: { bg: '#1e293b', text: '#ffffff', ring: '#3b82f6' }` (PRD: dark with blue ring — CSS `box-shadow: 0 0 0 3px #3b82f6`)
    - `flagged: { bg: '#f59e0b', text: '#ffffff' }` (PRD: amber)
    - `correct: { bg: '#10b981', text: '#ffffff' }` (PRD: green — post-submit only)
    - `incorrect: { bg: '#ef4444', text: '#ffffff' }` (PRD: red — post-submit only)
    - `pending: { bg: '#8b5cf6', text: '#ffffff' }` (PRD: purple — Phase 2 only, define now)
  - [x] 1.5 In `src/services/testStorage.ts`, add `'THCS-THPT'` to the `TestMetadata.type` union on line 22: change `'IELTS' | 'TOEFL' | 'Custom' | 'College Entrance'` to `'IELTS' | 'TOEFL' | 'Custom' | 'College Entrance' | 'THCS-THPT'`. Also add to `TestData.type` on line 68.
  - [x] 1.6 In `src/services/testResults.service.ts`, add an optional `thcsData` block to the `TestResultRecord` interface (after line 109, before closing `}`). **MUST match PRD §4.4.3 EXACTLY** — use `SectionResult[]` (full type from `thcs-test.types.ts`), NOT a simplified array:
    ```typescript
    /** PRD-0027: THCS-THPT specific grading data */
    thcsData?: {
      scaledScore: number; // 10-point scale (e.g., 8.3)
      sectionResults: SectionResult[]; // Full SectionResult[] from thcs-test.types.ts — includes intentBreakdown per section
      intentBreakdown: Record<string, { correct: number; total: number }>; // Merged intent breakdown across ALL sections
    };
    ```
    Import `SectionResult` at the top: `import type { SectionResult } from '../types/thcs-test.types';`

- [x] 2.0 Infrastructure — Services & Storage Layer
  - [x] 2.0.pre **PREREQUISITE:** Before creating `thcsDraftService.ts`, export helper function(s) from `draftCloudService.ts`:
    - Open `src/services/draftCloudService.ts`
    - Find `function deepRemoveUndefined(obj: any)` (around line 49) — change to `export function deepRemoveUndefined(obj: any)`
    - **`convertTimestamps` — this function does NOT exist in the codebase.** You must CREATE it. Add the following exported function in `draftCloudService.ts` (after `deepRemoveUndefined`):
      ```typescript
      /**
       * Recursively converts Firestore Timestamp objects to JavaScript Date objects.
       * Firestore returns Timestamp objects (with toDate() method) that need conversion.
       */
      export function convertTimestamps(data: any): any {
        if (!data) return data;
        if (data.toDate && typeof data.toDate === 'function') return data.toDate();
        if (Array.isArray(data)) return data.map(convertTimestamps);
        if (typeof data === 'object') {
          const result: any = {};
          for (const [key, value] of Object.entries(data)) {
            result[key] = convertTimestamps(value);
          }
          return result;
        }
        return data;
      }
      ```
    - Adding `export` to `deepRemoveUndefined` does NOT break existing code. Verify: run `npx vitest run src/services/draftCloudService.test.ts` if test exists.
  - [x] 2.1 Create `src/services/thcsDraftService.ts`. This service handles Firestore CRUD for THCS-THPT drafts. Follow the EXACT same patterns as `testDraftService` in `src/services/draftCloudService.ts` (lines 351-588).
    - **Required imports at the top of the file:**
      ```typescript
      import { collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
      import { db } from './firebase'; // Firestore instance
      import { deepRemoveUndefined, convertTimestamps } from './draftCloudService';
      import { ServiceResponse } from './draftCloudService'; // Type for return values
      import type { THCSDraft, THCSTestMetadata, THCSSection } from '../types/thcs-test.types';
      ```
    - Implement these functions:
    - `createThcsDraft(userId: string, metadata: THCSTestMetadata): Promise<ServiceResponse<{ draftId: string }>>` — Creates doc in `thcs_drafts/{auto-id}` with `status: 'editing'`, empty `sections: []`, `userId`, `testType: 'THCS-THPT'`, `questionCount: 0`, `totalPoints: 0`, `createdAt: Timestamp.now()`, `updatedAt: Timestamp.now()`. Use `deepRemoveUndefined()` before writing to Firestore.
    - `loadThcsDraft(draftId: string): Promise<ServiceResponse<THCSDraft>>` — Reads from `thcs_drafts/{draftId}`. Convert Timestamps to Date using `convertTimestamps()` (you created this in task 2.0.pre).
    - `updateThcsDraft(draftId: string, updates: Partial<THCSDraft>): Promise<ServiceResponse>` — Uses `updateDoc` on `thcs_drafts/{draftId}`. Always set `updatedAt: Timestamp.now()`.
    - `deleteThcsDraft(draftId: string): Promise<ServiceResponse>` — Uses `deleteDoc` on `thcs_drafts/{draftId}`.
    - `getUserThcsDrafts(userId: string): Promise<ServiceResponse<THCSDraft[]>>` — Queries `thcs_drafts` where `userId == userId`, ordered by `updatedAt desc`.
    - CRITICAL: Use `deepRemoveUndefined()` on ALL data before writing. Firestore rejects `undefined`.
  - [x] 2.2 Create `src/services/thcsTestStorage.ts`. This service handles RTDB CRUD for published THCS-THPT tests. Follow `testStorage.ts` patterns:
    - `generateThcsTestId(): string` — Returns `thcs-test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    - `saveThcsTestToFirebase(test: THCSTest): Promise<{ success: boolean; testId?: string; error?: string }>` — Writes full `THCSTest` to `tests/{testId}` in RTDB. The `testType: 'THCS-THPT'` field MUST be set. Use `ref(database, 'tests/' + testId)` and `set(testRef, testData)`. Do NOT initialize `stats` — it’s optional and only created on first student submission via `runTransaction()` (see task 6.1 step 6).
    - `getThcsTestFromFirebase(testId: string): Promise<{ success: boolean; data?: THCSTest; error?: string }>` — Reads from `tests/{testId}`, verifies `testType === 'THCS-THPT'`.
    - `updateThcsTestInFirebase(testId: string, updates: Partial<THCSTest>): Promise<{ success: boolean; error?: string }>` — Partial update with `updatedAt: Date.now()`.
    - `deleteThcsTestFromFirebase(testId: string): Promise<{ success: boolean; error?: string }>` — Sets `tests/{testId}` to `null`.
    - NOTE: THCS-THPT tests are stored in the SAME `tests/` node as IELTS tests. They are distinguished by the `testType` field. Do NOT create a separate `thcs_tests/` node.
  - [x] 2.3 Create `src/services/thcsAutoMarking.service.ts`:
    - `markThcsTest(testId: string, studentId: string, sections: THCSSection[], studentAnswers: Record<string, string>): THCSGradingResult` — Parameters include `testId` and `studentId` (PRD §4.4.1). `studentAnswers` key = `questionNumber` as string (e.g., `"1"`, `"2"`), value = `'A'|'B'|'C'|'D'`. Do NOT look up by UUID — see PRD §4.3.6. For each question: compare `studentAnswers[String(question.questionNumber)]` to `question.correctAnswer`. Auto-mode: `section.totalPoints / section.questions.length`. Manual-mode: `question.points`. Build `SectionResult` with `intentBreakdown` (aggregate correct/total by `question.intent`). Build `questionResults` as `Record<number, QuestionResult>`. Compute `scaledScore = (totalPoints / maxPoints) * 10`, rounded to 1 decimal. Set `gradedAt: Date.now()`, `gradingStatus: 'fully-graded'`.
    - **📌 Phase 3 forward reference (PRD §4.3.6 v1.4):** This function accepts `sections` and `studentAnswers` as INPUT PARAMETERS — it does NOT hardcode any RTDB paths internally. In Phase 3, homework answers will be stored at `homework_submissions/{homeworkId}/{studentId}/` (NOT under `game_sessions/`). Because the grading function is path-agnostic, it can be reused for both session and homework grading without refactoring. Do NOT add any RTDB reads inside this function.
    - `thcsResultToTestMarkingResult(gradingResult: THCSGradingResult, testMetadata: { title: string; duration: number }): TestMarkingResult` — Adapts to existing `TestMarkingResult` format (imported from `autoMarking.service.ts`). **Complete mapping — ALL fields required:**
      - `totalScore = gradingResult.totalPoints`
      - `maxScore = gradingResult.maxPoints`
      - `percentage = Math.round((gradingResult.totalPoints / gradingResult.maxPoints) * 100)` (guard: if maxPoints === 0, set to 0)
      - `completedAt = gradingResult.gradedAt`
      - `questionResults = Object.values(gradingResult.questionResults).map(qr => ({ questionNumber: qr.questionNumber, questionType: 'mcq', isCorrect: qr.isCorrect, score: qr.pointsEarned, maxScore: qr.pointsMax, studentAnswer: qr.studentAnswer, correctAnswer: qr.correctAnswer, feedback: '' }))`
      - `summary = { correct: Object.values(gradingResult.questionResults).filter(q => q.isCorrect).length, incorrect: Object.values(gradingResult.questionResults).filter(q => !q.isCorrect).length, partialCredit: 0, totalQuestions: Object.keys(gradingResult.questionResults).length }`
    - Also return a separate `thcsData` object (NOT inside TestMarkingResult — this is passed separately to `saveTestResult`):
      ```typescript
      const thcsData = {
        scaledScore: gradingResult.scaledScore,
        sectionResults: gradingResult.sectionResults,
        intentBreakdown: mergeIntentBreakdowns(gradingResult.sectionResults)
      };
      ```
      Where `mergeIntentBreakdowns` aggregates all `sectionResult.intentBreakdown` records into one merged record.
  - [x] 2.4 Update `firestore.rules` to add rules for the two new collections. Add AFTER the existing `match /results/{resultId}` block (line 37):
    ```
    match /thcs_drafts/{draftId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null;
    }
    
    match /thcs_library/{testId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && (request.auth.uid == resource.data.createdBy || request.auth.token.role == 'super_admin');
      allow create: if request.auth != null;
    }
    ```
    NOTE: `thcs_library` write is restricted to owner (`createdBy`) or `super_admin` role per PRD §7.2. Do NOT allow any authenticated user to write.
  - [x] 2.4b Update `database.rules.json` (RTDB rules) per PRD §7.2:
    - If the file has explicit path rules for `tests/`, ensure THCS-THPT test paths are included
    - If it uses broad `tests` access, no change needed — just verify THCS tests work under the same rules
    - Add a code comment documenting that THCS-THPT tests use the same `tests/` node
  - [x] 2.5 Write unit tests for `thcsAutoMarking.service.ts` in `src/services/thcsAutoMarking.service.test.ts`:
    - Test 1: All correct answers → 100%, scaledScore = 10.0, `gradingStatus = 'fully-graded'`
    - Test 2: All wrong answers → 0%, scaledScore = 0.0
    - Test 3: Mixed answers with 2 sections → correct section breakdowns, verify `pointsEarned` and `pointsMax`
    - Test 4: `thcsResultToTestMarkingResult` adapter → verify all `TestMarkingResult` fields populated, `thcsData.scaledScore` matches, `thcsData.intentBreakdown` aggregated
    - Test 5: Empty test (0 questions) → handle gracefully, no division by zero
    - Test 6: Student answer key has extra keys not matching any question → ignored, no crash
    - Test 7: Verify `questionResults` is `Record<number, QuestionResult>` (keyed by questionNumber, NOT array/UUID)
    - Test 8: Verify `sectionResults[i].intentBreakdown` aggregates correct/total by intent
    - Test 9: Verify `studentAnswers` keys are questionNumber strings (e.g., `{ "1": "A" }`), NOT UUIDs
  - [x] 2.6 Verify backup system includes new Firestore collections (Integration Safety Rule #12):
    - Search the codebase for any backup exclusion lists (grep for `FIRESTORE_EXCLUDE`, `excludeCollections`, or similar)
    - Ensure `thcs_drafts` and `thcs_library` are NOT in any exclusion list
    - If the backup system uses dynamic Firestore discovery (PRD-0026 §4.16.2), no change needed — just verify
    - Document verification result in a code comment at the top of `thcsDraftService.ts`: `// Backup: thcs_drafts auto-discovered by dynamic backup (PRD-0026). Verified [date].`

- [x] 3.0 Route Registration & Entry Point Integration
  - [x] 3.1 In `src/constants/routes.ts`:
    - Add to the `ROUTES` object (after line 63, in the Teacher Routes section):
      ```typescript
      // Teacher Routes - THCS-THPT Test Editor (PRD-0027)
      TEACHER_THCS_CREATE: '/teacher/thcs-test/create',
      TEACHER_THCS_EDIT: '/teacher/thcs-test/edit/:draftId',
      ```
    - NOTE: `draftId` already exists in `RouteParams` interface (used by IELTS). Do NOT add a duplicate. No changes to `RouteParams` needed.
  - [x] 3.2 In `src/App.jsx`:
    - Add lazy import at the top with the other lazy imports: `const THCSTestEditorPage = lazy(() => import('./pages/THCSTestEditorPage'));`
    - Add route inside the teacher routes section (find where other `/teacher/` routes are defined). **IMPORTANT: Use the EXACT same guard wrapper as existing teacher routes.** Search `App.jsx` for patterns like `<PrivateRoute allowedRoles={['teacher']}>`. The codebase uses `<PrivateRoute allowedRoles={['teacher']}>` (NOT `<TeacherGuard>`). Use this pattern:
      ```jsx
      <Route path="/teacher/thcs-test/create" element={<PrivateRoute allowedRoles={['teacher']}><THCSTestEditorPage /></PrivateRoute>} />
      <Route path="/teacher/thcs-test/edit/:draftId" element={<PrivateRoute allowedRoles={['teacher']}><THCSTestEditorPage /></PrivateRoute>} />
      ```
    - Do NOT omit the `PrivateRoute` guard — without it, any user can access the editor.
  - [x] 3.3 In `src/components/TestTypeSelectionModal.tsx` — make THCS-THPT selectable:
    - Line 76: Change `available: false` to `available: true` for the THCS-THPT entry
    - Line 75: Change skills array from `['Reading', 'Listening', 'Writing', 'Mixed-Test']` to `['Mixed-Test']` (THCS-THPT is always a mixed test — no skill selection step)
    - Auto-skip skill step: In `handleTypeSelect` (line 116-119), add logic: if the selected type has exactly 1 skill AND is available, auto-skip the skill step and directly call `handleSkillSelect(type.skills[0])`. This way, clicking THCS-THPT immediately fires `onConfirm('THCS-THPT', 'Mixed-Test')` without showing the skill picker:
      ```typescript
      const handleTypeSelect = (type: TestType) => {
        const typeConfig = TEST_TYPES.find(t => t.id === type);
        if (typeConfig && typeConfig.skills.length === 1) {
          // Single skill — auto-confirm, skip skill picker
          handleSkillSelect(typeConfig.skills[0]);
          return;
        }
        setSelectedType(type);
        setStep('skill');
      };
      ```
    - Do NOT add `useNavigate()` to this modal. The modal only calls `onConfirm(testType, skill)`. The PARENT component handles navigation.
  - [x] 3.4 In the PARENT component that renders `TestTypeSelectionModal` (likely `TeacherLobbyPage.jsx` or similar — search for `<TestTypeSelectionModal` usage):
    - Find the `onConfirm` handler that receives `(testType, skill)` from the modal
    - Add a check at the TOP of that handler:
      ```typescript
      if (testType === 'THCS-THPT') {
        navigate('/teacher/thcs-test/create');
        return;
      }
      // ... existing IELTS flow continues below
      ```
    - This keeps the routing logic in the parent (where navigation belongs), NOT inside the reusable modal component.
  - [x] 3.5 In `src/__tests__/security/routeAccess.test.ts`:
    - Find the `ROUTE_CONFIG` array (or equivalent test config listing all routes)
    - Add these entries:
      ```typescript
      { path: '/teacher/thcs-test/create', allowedRoles: ['teacher', 'super_admin'], description: 'THCS-THPT test editor (new)' },
      { path: '/teacher/thcs-test/edit/:draftId', allowedRoles: ['teacher', 'super_admin'], description: 'THCS-THPT test editor (edit draft)' },
      ```
    - Run the test: `npx vitest run src/__tests__/security/routeAccess.test.ts` — must pass

- [x] 4.0 THCS-THPT Visual Editor Page (Teacher)
  - [x] 4.1 Create the page shell `src/pages/THCSTestEditorPage.tsx`:
    - Import `useParams` to check for `:draftId` param (edit mode vs create mode)
    - If `draftId` exists in URL params → load existing draft via `useThcsDraft(draftId)` hook
    - If no `draftId` → create new draft state with 1 default empty section named "PART A". The editor MUST auto-create this default section — it NEVER starts with zero sections (PRD §4.2.3, EC7). Default section: `{ id: crypto.randomUUID(), name: 'PART A', order: 0, totalPoints: 0, pointMode: 'auto', instructionText: '', isCustomInstruction: false, layout: 'single-column', questions: [] }`
    - Page state: `metadata: THCSTestMetadata`, `sections: THCSSection[]`, `isPublic: boolean` (top-level, NOT inside metadata), `isDirty: boolean`, `isSaving: boolean`, `lastSavedAt: Date | null`, `draftId: string | null`
    - **`isPublic` is a top-level editor state** (not inside metadata). The metadata panel emits `onIsPublicChange(value)` separately from `onMetadataChange`. When building the `THCSTest` object in publish (task 4.12), set `isPublic` at the top level.
    - Layout from PRD §4.2.2: Full-width form. Top: back button + title "THCS-THPT Test Editor" + save status indicator. Below: metadata panel + section blocks + **"+ Add Section" button** + answer key panel + validation summary. Bottom: "Save Draft" and "Publish" buttons.
    - **"+ Add Section" button:** Below the last section block, render `<Button onClick={handleAddSection}>+ Add Section</Button>`. `handleAddSection` creates a new `THCSSection` with auto-name `'PART ' + String.fromCharCode(65 + sections.length)` (A→B→C→...), `order: sections.length`, `totalPoints: 0`, `pointMode: 'auto'`, `instructionText: ''`, `isCustomInstruction: false`, `layout: 'single-column'`, empty `questions: []`, and appends it to sections state. Then call `recalculateQuestionNumbers()`.
    - **`recalculateQuestionNumbers()` utility (MANDATORY — PRD §9 EC13):**
      ```typescript
      function recalculateQuestionNumbers(sections: THCSSection[]): THCSSection[] {
        let globalNumber = 1;
        return sections.map(section => ({
          ...section,
          questions: section.questions.map(q => ({
            ...q,
            questionNumber: globalNumber++
          }))
        }));
      }
      ```
      **Call this function EVERY time:** a question is added/deleted/moved, a section is added/deleted/reordered. Store the result back into state. Without this, question numbers will be wrong after any reorder, and grading will completely break.
    - Use `useThcsAutoSave` hook for debounced saving
    - On page unload (`beforeunload`): if `isDirty`, warn "You have unsaved changes"
    - **"Save Draft" button behavior:** Calls `saveNow()` from `useThcsAutoSave`. If `draftId` is null (brand new test, never saved): first call `createThcsDraft(userId, metadata)` → get `newDraftId` → update component state `setDraftId(newDraftId)` → update URL to `/teacher/thcs-test/edit/{newDraftId}` using `navigate('/teacher/thcs-test/edit/' + newDraftId, { replace: true })` (replace, not push, to avoid history pollution) → then save sections/questions via `updateThcsDraft(newDraftId, data)`. All subsequent saves use the existing `draftId`.
    - **Responsive warning (PRD §6.2):** At the top of the page, detect screen width using `useMediaQuery('(max-width: 1023px)')` from Mantine hooks. If matches: show a Mantine `<Alert icon={⚠️} color="yellow">` with text: "This editor works best on desktop. Please use a larger screen for the best experience." The editor should still be usable below the alert, just warned.
  - [x] 4.2 Create `src/components/thcs-editor/THCSMetadataPanel.tsx`:
    - Render as a card/panel at the top of the editor
    - Fields from PRD §4.2.3 "Metadata Panel":
      - Title: `<TextInput label="Test Title" maxLength={200} required />`
      - Duration: Row of preset buttons (45, 50, 60, 90) + `<NumberInput label="Custom (min)" />`. Clicking a preset fills the number input. Typing in custom overrides preset.
      - Grade Level: `<Select label="Grade Level" data={GRADE_LEVELS.map(g => ({ value: g.toString(), label: 'Grade ' + g }))} required />`
      - Exam Type: `<Autocomplete label="Exam Type" data={EXAM_TYPE_OPTIONS} required />` (Mantine Autocomplete allows both predefined options AND free text typing)
      - Subject Variant: `<TextInput label="Subject Variant" placeholder="e.g., Global Success" />`
      - Province: `<TextInput label="Province" />`
      - School: `<TextInput label="School" />`
      - isPublic: `<Switch label="Share in Public Library" />`
      - Description: `<Textarea label="Description" placeholder="Optional description" autosize />`
      - Tags: `<TagsInput label="Tags" placeholder="Press Enter to add" />` (Mantine TagsInput component — import from `@mantine/core`)
    - **Import guidance:** `import { TextInput, Select, Autocomplete, NumberInput, Switch, Textarea, TagsInput } from '@mantine/core';` — use `Autocomplete` (NOT `Select`) for Exam Type, as it allows free-text typing while showing predefined options.
    - All field changes call `onMetadataChange(field, value)` → parent updates state → triggers auto-save. `isPublic` uses separate `onIsPublicChange(value)` callback.
  - [x] 4.3 Create `src/components/thcs-editor/THCSSectionBlock.tsx`:
    - Props: `section: THCSSection`, `sectionIndex: number`, `totalSections: number`, `onUpdate: (section) => void`, `onDelete: () => void`, `onMoveUp: () => void`, `onMoveDown: () => void`, `globalQuestionOffset: number`
    - **How parent computes `globalQuestionOffset`:** `sections.slice(0, sectionIndex).reduce((sum, s) => sum + s.questions.length, 0)`. This gives the total question count BEFORE this section, so the first question in this section is `globalQuestionOffset + 1`.
    - Renders:
      - Section header bar: Section name (editable TextInput), layout toggle (single/two-column via SegmentedControl), total points (NumberInput), point mode badge ("Auto"/"Manual"), up/down buttons, delete button (with confirmation modal: "Delete {sectionName} and all {N} questions inside?")
      - Up button disabled if `sectionIndex === 0`. Down disabled if `sectionIndex === totalSections - 1`. Delete disabled if `totalSections === 1` (show tooltip: "A test must have at least one section").
      - Instruction text area: `<Textarea>` with the auto-populated instruction. Show "🔄 Reset to Template" button if `isCustomInstruction === true` (clicking it regenerates instruction from the first question's intent template and sets `isCustomInstruction: false`). Show "+ Create Custom Instruction" button — clicking it **clears the instruction textarea to empty**, sets `isCustomInstruction: true`, and **focuses the textarea** so the teacher can start typing immediately from scratch.
      - Passage input (ONLY visible when any question in `section.questions` has intent in: `['reading-cloze-mcq', 'reading-comprehension', 'reading-announcement']`): Title + Textarea for passage content + image upload
      - List of `<THCSQuestionBlock>` for each question
      - "+ Add Question" button at bottom
  - [x] 4.4 Create `src/components/thcs-editor/THCSQuestionBlock.tsx`:
    - Props: `question: THCSQuestion`, `questionIndex: number`, `sectionQuestions: THCSQuestion[]`, `globalNumber: number`, `onUpdate: (question) => void`, `onDelete: () => void`, `onMoveUp: () => void`, `onMoveDown: () => void`
    - Renders:
      - Header: "Q{globalNumber}" label + Intent dropdown (`<Select data={MCQ_INTENTS}>`) + up/down/delete buttons
      - Question text: `<Textarea label="Question" />`
      - Options A-D: 4 `<TextInput>` fields, each labeled A/B/C/D. Store values in `question.options[0]` through `question.options[3]` (tuple index 0=A, 1=B, 2=C, 3=D). Each has a radio button to mark as correct. Clicking radio sets `correctAnswer` to that letter.
      - If intent is `pronunciation`: render `<THCSPronunciationOptions>` instead of plain TextInputs
      - If intent is `error-identification`: render `<THCSErrorIdentification>` instead of the normal question+options layout
      - Image section: "🖼️ Add Image" button → `<input type="file" accept="image/*" hidden ref={fileInputRef} />` triggered by button click → on select, call `uploadQuestionImage(file, draftId)` from `imageUploadService.ts` (see task 4.14) → set `question.imageUrl` to returned URL. Show `<img src={imageUrl} style={{ maxWidth: 200 }} />` thumbnail if `imageUrl` exists. "×" button calls `onUpdate({ ...question, imageUrl: undefined })` to remove.
      - **Explanation field (PRD §4.7):** Below the options, render an expandable section labeled "Explanation (optional)". Use Mantine `<Collapse>` with toggle link "+ Add Explanation" / "− Hide Explanation". Inside: `<Textarea label="Why is this answer correct?" value={question.explanation?.text || ''} onChange={(e) => onUpdate({ ...question, explanation: { text: e.target.value, source: 'teacher', approvedByTeacher: true } })} />`. If `question.explanation?.text` is non-empty, expand by default.
      - Points override: if section's `pointMode === 'manual'`, show `<NumberInput label="Points" step={0.25} />`
  - [x] 4.14 **⚙️ CREATE THIS BEFORE implementing task 4.4** (THCSQuestionBlock needs the image upload function). Create `src/services/imageUploadService.ts` — Firebase Storage upload service (NO existing upload service exists in the codebase):
    - Import: `import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';`
    - Import: `import { app } from './firebase';` (the Firebase app instance)
    - Function: `uploadQuestionImage(file: File, contextId: string): Promise<string>`
      - Validate: file.size < 5MB, file.type starts with `image/`. If invalid, throw descriptive error.
      - Path: `thcs-images/{contextId}/{Date.now()}-{file.name}`
      - Steps: `const storage = getStorage(app)` → `const fileRef = storageRef(storage, path)` → `await uploadBytes(fileRef, file)` → `const url = await getDownloadURL(fileRef)` → return `url`
    - Function: `deleteQuestionImage(imageUrl: string): Promise<void>`
      - Extract path from URL using `ref(storage, url)` → `await deleteObject(ref)`. Wrap in try/catch — log warning but don't throw (image might already be deleted).
    - CRITICAL: Firebase Storage must be enabled in the Firebase console for the project. If not already enabled, the junior needs to know this. Add a comment: `// Requires Firebase Storage to be enabled in Firebase Console > Build > Storage`
  - [x] 4.5 Create `src/components/thcs-editor/THCSPronunciationOptions.tsx`:
    - Each option (A-D) renders as: `<TextInput>` + mini "U" (Underline) toolbar button
    - **Standard mode:** When teacher selects text inside the input and clicks "U", wrap selected characters in `{{` and `}}` (e.g., `th{{ou}}ght`). Store the marked-up string in `question.optionUnderlines[i]` (parallel tuple to `question.options[i]`). The plain text (without `{{}}`) is stored in `question.options[i]`.
    - **Quick Underline mode (PRD §4.2.3, EC13):** A toggle button labeled "Quick Underline" activates character-level click-to-toggle mode. When active, clicking any individual character in the option text instantly toggles its underline state (wraps/unwraps in `{{}}`), without needing to select text first. This solves the copy-paste friction when teachers paste pronunciation questions from Word documents where underline formatting is lost. Implement as a boolean state `isQuickUnderlineMode` with a `<Switch>` or `<Button>` toggle at the top of the pronunciation options area.
    - Show a preview below each option rendering the underline: replace `{{x}}` with `<u>x</u>` in a styled `<span>`.
  - [x] 4.6 Create `src/components/thcs-editor/THCSErrorIdentification.tsx`:
    - Renders: `<Textarea label="Sentence" />` + toolbar with Underline button
    - Teacher selects 4 parts in the sentence text and underlines each. Auto-label: first underlined = A, second = B, third = C, fourth = D. Store the full sentence WITH `{{}}` markup in `question.underlinedParts` (e.g., `"She {{go}} to school {{every day}} and {{study}} {{very hard}}."`).
    - Below textarea: show preview with underlined parts and their labels.
    - Correct answer: `<Select data={['A', 'B', 'C', 'D']} label="Which part needs correction?" />`
    - Validation: if underlined parts ≠ 4, show error "Exactly 4 underlined parts required."
  - [x] 4.7 Create `src/components/thcs-editor/THCSAnswerKeyPanel.tsx`:
    - Collapsible panel (use Mantine `<Collapse>`) at the bottom of the editor
    - Toggle button: "Answer Key" with chevron
    - Content: Compact grid of all questions. Each question shows: `Q{number}: ●A ○B ○C ○D` — radio buttons.
    - Clicking a radio here updates the corresponding question's `correctAnswer`
    - Summary line: "{answered}/{total} answered | {missing} missing"
    - Unanswered questions' numbers highlighted in amber
  - [x] 4.8 Create `src/components/thcs-editor/THCSValidationSummary.tsx`:
    - Shows a validation summary card below the answer key panel
    - Lists all checks from PRD §4.2.3 "Validation":
      - ✅ or ❌ per check: sections have questions, questions have answers, title filled, duration set, grade set
      - ⚠️ for warnings: total points ≠ 10, pronunciation without underlines
  - [x] 4.9 Create `src/hooks/thcs/useThcsDraft.ts`:
    - Input: optional `draftId: string`
    - If `draftId` provided: load draft from Firestore via `thcsDraftService.loadThcsDraft(draftId)`
    - Returns: `{ draft, loading, error, updateDraft, createDraft }`
  - [x] 4.10 Create `src/hooks/thcs/useThcsAutoSave.ts`:
    - Input: `{ draftId: string | null; data: Partial<THCSDraft>; isDirty: boolean }`
    - Uses `useRef` for a debounce timer. On every `data` change when `isDirty === true`: clear previous timer, set new 2-second timer. When timer fires: call `thcsDraftService.updateThcsDraft(draftId, data)`.
    - Returns: `{ isSaving: boolean; lastSavedAt: Date | null; error: string | null; saveNow: () => Promise<void> }`
    - Follow the SAME pattern as `UseDraftAutoSaveReturn` in `src/types/draft.types.ts` (lines 316-332)
    - **Offline fallback (PRD §4.2.3):** Wrap `updateThcsDraft()` in try/catch. If it fails with a network error: save the full draft state to `localStorage.setItem('thcs_draft_offline_' + draftId, JSON.stringify(data))`. On next successful save, clear the localStorage entry. On hook mount, check for offline entries via `localStorage.getItem('thcs_draft_offline_' + draftId)` and if Firestore is reachable, sync them.
  - [x] 4.11 Create `src/hooks/thcs/useThcsValidation.ts`:
    - Input: `{ metadata: THCSTestMetadata; sections: THCSSection[] }`
    - Returns: `{ errors: string[]; warnings: string[]; isValid: boolean }`
    - Errors (block publish): empty title, duration = 0, grade unset, any section with 0 questions, any question without correctAnswer
    - Warnings (allow publish): totalPoints ≠ 10, pronunciation without underlines, section has 0 totalPoints (PRD §9 EC14: "⚠️ Section has 0 points — questions will earn 0 regardless of answers.")
  - [x] 4.12 **⚠️ COMPLETE BEFORE task 6.1** — Implement the Publish flow in `THCSTestEditorPage.tsx`:
    1. Call `useThcsValidation`. If `!isValid`, show `THCSValidationSummary` with errors, abort.
    2. If warnings exist, show confirmation dialog listing warnings: "Proceed anyway?"
    3. Generate test ID via `generateThcsTestId()`
    4. Build `THCSTest` object from editor state. **Explicitly include ALL of these fields:**
       - `id: testId`
       - `testType: 'THCS-THPT'`
       - `metadata` (from editor state)
       - `sections` (from editor state — run `recalculateQuestionNumbers()` first)
       - `questionCount: sections.reduce((sum, s) => sum + s.questions.length, 0)`
       - `totalPoints: sections.reduce((sum, s) => sum + s.totalPoints, 0)`
       - `createdBy: userId` (from auth context)
       - `ownerId: userId`
       - `isPublic` (from top-level editor state)
       - `isComplete: true` (since validation passed, all answers are set)
       - `createdAt: Date.now()`
       - `updatedAt: Date.now()`
       - `publishedAt: Date.now()`
       - **`sourceDraftId: draftId`** (the Firestore draft ID from the current editor session — this is CRITICAL for task 7.3 Edit action)
       - **`settings: { showTimer: true, showResults: 'immediate', allowReview: true }`** (Phase 1 hardcoded defaults per PRD §4.1.1)
       - Do NOT set `stats` — it's optional and only created on first submission (task 6.1 step 6)
       - Do NOT set `_changelog` — Phase 2
    5. Call `saveThcsTestToFirebase(test)`
    6. Write metadata to Firestore `thcs_library/{testId}` using `setDoc(doc(db, 'thcs_library', testId), libraryData)`. Import: `import { doc, setDoc } from 'firebase/firestore'` and `import { db } from '../services/firebase'`. Include ALL fields from PRD §4.1.2:
       ```typescript
       const libraryData = {
         testId, title: metadata.title, gradeLevel: metadata.gradeLevel,
         examType: metadata.examType, subjectVariant: metadata.subjectVariant || null,
         province: metadata.province || null, duration: metadata.duration,
         questionCount, totalPoints, createdBy: userId, createdAt: Date.now(),
         isPublic, tags: metadata.tags || [],
         sectionSummary: sections.map(s => ({
           id: s.id, name: s.name,
           questionCount: s.questions.length, totalPoints: s.totalPoints
         }))
       };
       await setDoc(doc(db, 'thcs_library', testId), libraryData);
       ```
       Do NOT omit `subjectVariant`, `province`, `tags`, or `sectionSummary`. Use `null` for missing optional fields (NOT `undefined`).
    7. Update draft status to `'published'` via `thcsDraftService.updateThcsDraft(draftId, { status: 'published' })`
    8. Navigate to `/lobby`
    9. Show toast: "✅ Test published successfully"
  - [x] 4.13 Implement test duplication in the editor:
    - "Duplicate" button in the editor header
    - Creates a new draft with all data copied except: new `draftId`, title = "Copy of {original}", `createdAt = now`, `status = 'editing'`
    - Navigate to `/teacher/thcs-test/edit/{newDraftId}`

- [x] 5.0 Student Test-Taking View (MCQ)
  - [x] 5.1 **⚠️ CRITICAL — Modify `src/pages/TestPageRouter.tsx` (NOT `StudentTestPage.tsx`):**
    Students reach tests via the route `/student-test/:sessionCode` which renders `TestPageRouter` (defined in `App.jsx` line 269). This router reads `testData` from RTDB and currently switches on `testData.skill` to decide which page to render. THCS-THPT tests do NOT have a `skill` field — they have `testType: 'THCS-THPT'`.
    - Open `src/pages/TestPageRouter.tsx`
    - Import `THCSTestLayout` at the top: `import THCSTestLayout from '../components/thcs-student/THCSTestLayout';`
    - In the `detectSkill` function (around line 34-84), AFTER reading `testData` (line 76) and BEFORE the skill detection (line 79), add a `testType` check:
      ```typescript
      const testData = testSnapshot.val();
      
      // PRD-0027: THCS-THPT tests use testType discriminator, not skill
      if (testData?.testType === 'THCS-THPT') {
        console.log('📍 Test Page Router: Detected THCS-THPT test');
        setSkill('THCS-THPT'); // Use testType as the routing key
        setLoading(false);
        return;
      }
      
      const testSkill = testData?.skill || 'Reading';
      ```
    - In the `switch (skill)` block (around line 126-143), add a new case BEFORE the default:
      ```typescript
      case 'THCS-THPT':
        return <THCSTestLayout testData={testData} sessionCode={sessionCode!} />;
      ```
      **Note:** `testData` is NOT available in the render section (it's read inside `detectSkill`). You need to add a new state variable `const [testData, setTestData] = useState<any>(null);` at the top of the component, and set `setTestData(testData)` inside `detectSkill` when THCS-THPT is detected. Pass it to `THCSTestLayout`.
    - **DO NOT modify `StudentTestPage.tsx`** — that file handles IELTS tests only and is reached via the skill router's fallback. Changing it would not affect THCS-THPT routing.
    - This ensures the existing IELTS/Listening/Reading/Writing flows are COMPLETELY untouched.
  - [x] 5.2 Create `src/components/thcs-student/THCSTestLayout.tsx`:
    - Props: `testData: THCSTest`, `sessionCode: string`
    - State: `currentSectionIndex: number`, `currentQuestionIndex: number`, `answers: Record<string, string>`, `flaggedQuestions: Set<string>`, `isSubmitted: boolean`
    - Uses existing hooks: `useTestSession` (for session state), `useTestTimer` (for countdown), `useTestAutoSave` (for answer persistence)
    - Layout: Header (title + timer) → Main content (section content area) → Footer (section tabs + question navigation pills)
    - **Section content area:** At the top of each section, show section name and instruction text:
      ```tsx
      <Text fw={700} size="lg">{section.name} ({section.totalPoints} {section.totalPoints === 1 ? 'point' : 'points'})</Text>
      <Text c="dimmed" fs="italic" mb="md">{section.instructionText}</Text>
      ```
      Then render each question using `<THCSQuestionRenderer>` below.
    - CRITICAL: Answers are stored in RTDB at `game_sessions/{sessionCode}/students/{studentId}/answers/{questionId}` — the SAME path as IELTS. Value is a simple string (`'A'`, `'B'`, `'C'`, or `'D'`).
    - Add progress tracking: `game_sessions/{sessionCode}/students/{studentId}/progress` = `{ answered: number, total: number, currentSection: number }`
  - [x] 5.3 Create `src/components/thcs-student/THCSSectionNav.tsx`:
    - Props: `sections: THCSSection[]`, `currentSectionIndex: number`, `answers: Record<string, string>`, `flaggedQuestions: Set<string>`, `isReviewMode: boolean`, `questionResults?: Record<string, boolean>`, `onSectionChange: (index) => void`, `onQuestionClick: (questionId) => void`
    - Renders: Fixed footer bar with:
      - Section tabs (horizontal scrollable if many): "PART A", "PART B", etc. Active tab highlighted.
      - Below tabs: row of question number pills for the active section. Each pill colored using `QUESTION_NAV_COLORS` based on state:
        - Not answered + not current → `unanswered`
        - Answered + not current → `answered`
        - Current question → `current`
        - Flagged → `flagged` (overrides unanswered/answered)
        - After submission (review mode): correct → `correct`, incorrect → `incorrect`
      - Each pill is clickable → scrolls to that question
  - [x] 5.4 Create `src/components/thcs-student/THCSQuestionRenderer.tsx`:
    - Props: `question: THCSQuestion`, `selectedAnswer: string | null`, `onAnswer: (answer: string) => void`, `isFlagged: boolean`, `onToggleFlag: () => void`, `isReviewMode: boolean`, `isCorrect?: boolean`
    - Renders:
      - Question header: "Q{number}" + flag button (⚑ toggle)
      - Question text
      - Image (if `question.imageUrl`): `<img alt={question.imageCaption || question.questionText}>` with max-width 400px, click to enlarge (open in a Mantine `<Modal>` with full-size image)
      - 4 option cards (A, B, C, D): each is a clickable card with `role="radio"`, `aria-checked={selectedAnswer === letter}`, `tabIndex={0}`, and `onKeyDown` handler (Enter or Space = select). Selected answer has highlighted violet border + light violet background. Clicking again on the same option deselects it (sets answer to `null`).
      - In review mode: show ✅ icon on correct answer card (green border), show ❌ icon on wrong answer if student chose it (red border). Disable clicking (`pointer-events: none`).
      - If `question.explanation` exists and `isReviewMode === true`: show explanation text below options in a styled info box. Access via `question.explanation.text`.
      - **Accessibility (PRD §6.3):** All option cards are keyboard-navigable via Tab/Shift+Tab. Enter or Space selects. Navigation pills in the footer use both color AND a shape indicator (e.g., ● for answered, ○ for unanswered, ⚑ for flagged, ✓ for correct, ✕ for incorrect) — not color alone.
  - [x] 5.5 Create `src/components/thcs-student/THCSPassagePanel.tsx`:
    - Props: `passage: { title: string; content: string; imageUrl?: string }`, `layout: 'single-column' | 'two-column'`, `isVisible: boolean`, `onScrollToQuestions?: () => void`
    - Two-column mode: passage is sticky on the LEFT side (50% width, `position: sticky; top: 0; max-height: 100vh; overflow-y: auto`). Questions render on the RIGHT side (50% width).
    - Two-column on mobile (< 768px media query): collapses to single-column with a floating "📖 Show Passage" button that opens a slide-up panel (absolute positioned, 80% height, from bottom)
    - Single-column mode: passage renders FIRST, then questions below.
      - **"Scroll to Questions" button (PRD §4.3.4):** Render a centered button below the passage: `<Button variant="light" onClick={onScrollToQuestions}>⬇ Scroll to Questions</Button>`. Parent passes `onScrollToQuestions` which scrolls to `document.getElementById('thcs-questions-start')?.scrollIntoView({ behavior: 'smooth' })`. Place `<div id="thcs-questions-start" />` at top of questions list.
      - After scrolling past passage: show sticky passage header (title + first line, pinned at top, height 48px, background white with bottom border) + floating "📖 Show Passage" button fixed at bottom-right, on click opens slide-up panel.
    - The slide-up panel shows the full passage without navigating away from the current scroll position.
  - [x] 5.6 Create `src/components/thcs-student/THCSSubmitConfirmation.tsx`:
    - Props: `unansweredCount: number`, `totalCount: number`, `onConfirm: () => void`, `onCancel: () => void`
    - If `unansweredCount > 0`: "You have {unansweredCount} unanswered questions. Submit anyway?"
    - If all answered: "Are you sure you want to submit? You cannot change your answers after submission."
    - Two buttons: "Cancel" (secondary) and "Submit" (primary, red/purple)
  - [x] 5.7 Implement answer auto-save in `THCSTestLayout.tsx`:
    - **CRITICAL — Answer key format (PRD §4.3.6):** The RTDB key MUST be the `questionNumber` (e.g., `"1"`, `"2"`, `"3"`), NOT the `questionId` (UUID). Path: `game_sessions/{sessionCode}/students/{studentId}/answers/{questionNumber}` = `'A'|'B'|'C'|'D'`
    - Example: question with `questionNumber: 3` and student selects 'B' → write `answers/3` = `"B"`
    - The grading service reads `answers` and maps each `questionNumber` key to the correct answer. Using UUID here will **completely break grading**.
    - Use the existing `useTestAutoSave` hook pattern but adapted for simpler THCS answer format (IELTS stores objects, THCS stores just a letter string)
    - Also update progress: `game_sessions/{sessionCode}/students/{studentId}/progress` = `{ answeredCount: number, totalQuestions: number, currentSection: number }`
    - **📌 Phase 3 forward reference (PRD §4.3.6 v1.4):** In Phase 3, homework answers will use a SEPARATE path: `homework_submissions/{homeworkId}/{studentId}/`. The Phase 1 session path (`game_sessions/`) is correct for now. The grading service (task 2.3) is already path-agnostic — it accepts answers as input, not reading from RTDB directly. No structural changes needed here for Phase 3 compatibility.
  - [x] 5.8 Implement timer expiry in `THCSTestLayout.tsx`:
    - Use existing `useTestTimer` hook
    - Phase 1: always strict mode — when timer hits 0, auto-submit all current answers
    - Show confirmation briefly: "⏰ Time's up! Your answers have been submitted."

- [x] 6.0 Auto-Grading & Results
  - [x] 6.2 **⚠️ COMPLETE BEFORE task 6.1** — Update `saveTestResult` in `testResults.service.ts` to pass through `thcsData`:
    - In the function signature (line 116-144), add a new optional parameter **AFTER `context?: ResultContext`** (line 143, before the closing `)`): `thcsData?: TestResultRecord['thcsData']`
    - The full updated signature becomes:
      ```typescript
      export async function saveTestResult(
        sessionCode: string,
        testId: string,
        studentId: string,
        studentName: string,
        markingResult: TestMarkingResult,
        testMetadata: { title: string; type: string; skill: string; duration: number },
        timeElapsed: number,
        teacherId?: string,
        isGuest?: boolean,
        submissionContent?: { writing?: { text: string; wordCount: number }; speaking?: { audioUrl: string; duration: number } },
        academicContext?: { courseId?: string; courseName?: string; classId?: string; className?: string; moduleId?: string; moduleName?: string },
        context?: ResultContext,
        thcsData?: TestResultRecord['thcsData'] // PRD-0027: THCS grading data
      ): Promise<string> {
      ```
    - **Inside the function** (after line 231 where `context` is conditionally added), add: `if (thcsData) (resultRecord as any).thcsData = thcsData;`
    - Import `SectionResult` type is NOT needed here — it's already part of the `TestResultRecord['thcsData']` type.
  - [x] 6.1 Implement the grading flow in the student submission handler (inside `THCSTestLayout.tsx`):
    1. Student clicks Submit → show `THCSSubmitConfirmation`
    2. On confirm: collect all answers from RTDB or local state
    3. Call `markThcsTest(testId, studentId, sections, studentAnswers)` from `thcsAutoMarking.service.ts`
    4. Call `thcsResultToTestMarkingResult(gradingResult, testMetadata)` to get `markingResult` AND `thcsData`
    5. Call `saveTestResult(sessionCode, testId, studentId, studentName, markingResult, { title: testData.metadata.title, type: 'THCS-THPT', skill: 'Mixed', duration: testData.metadata.duration }, timeElapsed, teacherId, false, undefined, undefined, undefined, thcsData)` — reusing the EXISTING `saveTestResult` from `testResults.service.ts`. The `thcsData` is passed as the LAST parameter (added in task 6.2).
    6. Update test stats: use RTDB path `tests/${testId}/stats` with `runTransaction()`. If `current` is null (first submission), initialize `{ attempts: 1, averageScore: scaledScore, averageTime: timeElapsed, completionRate: 100 }`. Otherwise, increment `attempts` and recalculate running averages: `newAvg = ((oldAvg * oldCount) + newValue) / newCount`. Field is `stats` NOT `statistics` (PRD §4.1.1).
    7. Set `isSubmitted = true` → enter review mode
  - [x] 6.3 Create `src/pages/THCSTestResultsPage.tsx` or handle results within `THCSTestLayout`:
    - After submission (`isReviewMode === true`), the student sees:
      - **Score Header**: "8.3/10.0" (scaled score, large font), raw score "33/40 points", percentage "82.5%"
      - **Section Breakdown Table**: One row per section with section name, score, max, percentage, bar chart
      - **Skill Analysis** (PRD §4.5.1): "Weakest area: Grammar (60%)", "Strongest: Reading (90%)" — derived from section results. Map section intents to skill categories: grammar intents → Grammar, reading intents → Reading, vocabulary intents → Vocabulary, etc.
      - **Question Review**: List of all questions. Each shows: question text, student's answer (highlighted green/red), correct answer, explanation if available. Use `THCSQuestionRenderer` in review mode.
    - Use `QUESTION_NAV_COLORS` for the navigation pills in review mode (`correct`/`incorrect`)

- [x] 7.0 Teacher Lobby Integration & Test Cards
  - [x] 7.1 Handle mixed test types in Teacher Lobby: The existing `getAllTestsFromFirebase()` returns ALL tests from `tests/` node as `TestData[]`. After PRD-0027, this will return BOTH IELTS tests (which have `type`, `passages`, `questions` flat) AND THCS-THPT tests (which have `testType`, `sections`, `metadata` nested). Steps:
    - Find the component that calls `getAllTestsFromFirebase()` and renders test cards (search for `getAllTests` or `TestData[]` in `src/pages/` and `src/components/`)
    - In the rendering loop, add a type check:
      ```typescript
      const isThcsTest = (test: any): test is THCSTest => test.testType === 'THCS-THPT';
      
      // In the JSX map:
      {tests.map(test => isThcsTest(test)
        ? <THCSTestCard key={test.id} test={test} />
        : <ExistingIELTSTestCard key={test.id} test={test} />
      )}
      ```
    - Create a `THCSTestCard` component (can be inline or separate file `src/components/thcs-editor/THCSTestCard.tsx`) that renders:
      - Badge: `<Badge color="violet" size="sm">THCS-THPT</Badge>` (do NOT use 🇻🇳 flag emoji — it renders inconsistently across platforms, sometimes showing as "VN" text)
      - Title: `test.metadata.title`
      - Metadata line: `Grade ${test.metadata.gradeLevel} | ${test.metadata.examType} | ${test.totalPoints} pts | ${test.questionCount} Qs | ${test.metadata.duration} min`
      - Sections: `${test.sections.length} sections`
      - Action buttons: [Edit] [Duplicate] [Delete] [Start Test]
    - CRITICAL: Do NOT try to cast THCS tests to `TestData` — the interfaces are incompatible. Use `as any` or a type guard.
  - [x] 7.2 Ensure the "Create Test" / "New Test" button in the Teacher Lobby opens `TestTypeSelectionModal`. This should already work from task 3.4. Verify by tracing the flow: click "Create Test" → modal opens → click THCS-THPT → auto-confirms → parent handler navigates to `/teacher/thcs-test/create`.
  - [x] 7.3 Add "Edit" action to THCS-THPT test cards:
    - When teacher clicks "Edit" on a THCS-THPT test card: check `test.sourceDraftId`
    - If `sourceDraftId` exists: navigate to `/teacher/thcs-test/edit/${test.sourceDraftId}`
    - If `sourceDraftId` does NOT exist (draft was deleted or test was created before this feature): create a new draft from the published test data by calling `createThcsDraft(userId, test.metadata)` then `updateThcsDraft(newDraftId, { sections: test.sections, ... })`, then navigate to `/teacher/thcs-test/edit/${newDraftId}`
    - IMPORTANT: Task 4.12 (Publish flow) MUST store `sourceDraftId` on the RTDB test. This field is already defined in `THCSTest` interface (task 1.1).
  - [x] 7.4 Add "Duplicate" action to THCS-THPT test cards:
    - Creates a new draft from the published test, same logic as task 4.13
    - Navigate to the new draft in the editor
  - [x] 7.5 Add "Delete" action for THCS-THPT test cards:
    - Show confirmation modal: "Delete this test? This action cannot be undone."
    - On confirm: call `deleteThcsTestFromFirebase(testId)` AND delete from Firestore `thcs_library/{testId}` using `deleteDoc(doc(db, 'thcs_library', testId))`
    - Also delete the associated draft if `test.sourceDraftId` exists: `deleteThcsDraft(test.sourceDraftId)`
    - Remove the test from the local state/UI list

- [x] 8.0 End-to-End Verification (Smoke Test)
  - [x] 8.1 After ALL tasks above are complete, verify the full flow works end-to-end:
    1. **Create flow:** Go to Teacher Lobby → Click "Create Test" → Select THCS-THPT → Verify editor opens at `/teacher/thcs-test/create` → Verify default PART A section exists
    2. **Edit flow:** Fill title, duration, grade → Add questions to PART A → Add PART B section → Verify question numbers are sequential across sections → Reorder sections → Verify question numbers recalculate correctly
    3. **Auto-save:** Wait 3 seconds after editing → Verify URL changed to `/teacher/thcs-test/edit/{draftId}` → Refresh page → Verify draft loads correctly
    4. **Publish flow:** Click Publish → Verify validation catches errors (test with no questions) → Fix errors → Publish successfully → Verify redirected to `/lobby`
    5. **Lobby integration:** Verify THCS test card appears in lobby with correct badge and metadata → Verify Edit, Duplicate, Delete actions work
    6. **Student flow:** Start a session from the THCS test card → Join as student → Verify `TestPageRouter` renders `THCSTestLayout` (NOT IELTS layout) → Answer questions → Navigate between sections
    7. **Submission flow:** Submit test → Verify results display (scaled score, section breakdown, question review) → Verify correct/incorrect pill colors
    8. **Non-regression:** Start an IELTS Reading session → Verify it still routes to `ReadingTestPage` (NOT THCS layout) → Complete and verify grading still works
  - [x] 8.2 Verify Academic Record compatibility:
    - Search for `academicRecordService.ts` or the Academic Record page and verify that THCS-THPT test results display correctly
    - The existing `testType` field on `TestResultRecord` (line 74 in `testResults.service.ts`) is already a string, so no interface change is needed
    - Verify the page doesn't filter by specific testType values (e.g., `testType === 'IELTS'`) — if it does, add `'THCS-THPT'` to the filter
