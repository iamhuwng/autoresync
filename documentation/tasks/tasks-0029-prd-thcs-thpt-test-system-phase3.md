# Tasks: PRD-0029 — THCS-THPT Test System Phase 3

> **Source:** `documentation/tasks/0029-prd-thcs-thpt-test-system-phase3.md`
> **Depends on:** PRD-0027 (Phase 1) ✅ + PRD-0028 (Phase 2) — MUST be fully implemented before starting Phase 3
> **Target audience:** Junior developer with codebase awareness

---

## Relevant Files

### Type System & Data Model
- `src/types/thcs-test.types.ts` — Add `shuffle`, `shuffleOptions` to `THCSSection`; add `timerMode` to `THCSTestMetadata`; add `THCSTestTemplate` interface
- `src/types/homework.types.ts` — Add `'thcs-test'` to `materialType` union (lines 185, 375, 415, 432); add `thcsConfig` and `thcsData` fields
- `src/types/solo.types.ts` — Add `'thcs-test'` to `materialType` union (line 209)
- `src/types/academicRecord.types.ts` — Add `thcsProgress` section to `AcademicRecord`

### Services (Modify)
- `src/services/homeworkManager.ts` — Handle `materialType === 'thcs-test'` in create/duplicate (line 32, 98, 295)
- `src/services/notificationService.ts` — Add 6 new THCS notification functions
- `src/services/deadlineReminderService.ts` — Extend to check `materialType === 'thcs-test'`
- `src/services/courseManager.ts` — Handle THCS test materials in module linking
- `src/services/thcsTestStorage.ts` — Add template save/load, clone from library
- `src/services/thcsDraftService.ts` — Add `cloneFromPublicTest()` function
- `src/services/academicRecordService.ts` — Add THCS progress update logic

### Services (New)
- `src/utils/thcsQuestionParser.ts` — Parse pasted question text (MCQ + fill-in formats)
- `src/utils/thcsShuffle.ts` — Deterministic question/option shuffle with seeded PRNG
- `src/services/test-creation/thcsDocumentParser.service.ts` — Hybrid regex + AI document parser for THCS tests

### Components (Modify)
- `src/components/thcs-editor/THCSSectionBlock.tsx` — Add shuffle toggles, drag handle, bulk add buttons. **Note:** `passageTitle`/`passageContent` uses `as any` cast (Gotcha #1)
- `src/components/thcs-editor/THCSQuestionBlock.tsx` — Replace up/down buttons with drag handle
- `src/components/thcs-student/THCSTestLayout.tsx` — Add shuffle on load, timer mode handling. **Do NOT add homework mode here** — see Gotcha #4
- `src/components/thcs-student/THCSPreviewOverlay.tsx` — **Reference only** — its local-state architecture is the pattern for homework mode

### Components (New)
- `src/components/thcs-editor/THCSTemplatePicker.tsx` — Template selection modal (My Templates + Public Templates)
- `src/components/thcs-editor/THCSBulkPasteModal.tsx` — Paste questions modal with preview
- `src/components/thcs-editor/THCSDocumentUpload.tsx` — File upload zone in test creation flow
- `src/components/thcs-editor/THCSParseReviewPanel.tsx` — Auto-parse results review UI with confidence indicators
- `src/components/thcs-editor/THCSSaveTemplateModal.tsx` — Save-as-template modal (extracted from editor page to manage size)
- `src/components/thcs-editor/THCSDndSectionsContainer.tsx` — DnD wrapper for sections (extracted from editor page)
- `src/components/thcs-editor/THCSHomeworkAssignDialog.tsx` — Homework assignment dialog for THCS tests (new in Phase 3)
- `src/components/thcs-student/THCSHomeworkLayout.tsx` — Homework standalone test-taking component (based on THCSPreviewOverlay pattern, NOT THCSTestLayout)

### Pages (Modify)
- `src/pages/THCSTestEditorPage.tsx` — Add bulk ops, drag-and-drop, template picker, shuffle toggles, timer mode, document upload entry point
- `src/pages/TeacherLobbyPage.jsx` — Add type filter for library, clone/use-as-is buttons, homework assign button on test cards
- `src/pages/TeacherHomeworkListPage.tsx` — Add THCS-THPT tab in material selection modal
- `src/pages/StudentDashboardPage.jsx` — Add THCS homework cards to unified feed
- `src/pages/StudentCourseDetailPage.tsx` — Handle THCS test materials in course view, route to correct test-taking flow
- `src/pages/TeacherCourseProfilePage.tsx` — Show THCS tests when adding materials to course modules
- `src/pages/AcademicRecordPage.tsx` — Add THCS/THPT tab with score progression, skill breakdown

### Other
- `src/pages/StudentHomeworkListPage.tsx` — Update `materialType` display to handle `'thcs-test'`
- `src/pages/StudentHomeworkDetailPage.tsx` — Update `materialType` display to handle `'thcs-test'`
- `src/components/session/ModuleSessionModal.tsx` — Update materialType handling
- `src/services/materialDiscoveryService.ts` — Update materialType logic for THCS tests
- `src/services/thcsAutoMarking.service.ts` — **Reuse only** — path-agnostic grading function, callable from homework mode (Gotcha #3)
- `src/hooks/useThcsValidation.ts` — **Extend** with homework-specific validations (do NOT create separate hook)
- `src/services/sessionManager.js` — **Reference only** — version pinning pattern to follow
- `firestore.rules` — Add rules for `thcs_templates/` collection

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `MyComponent.tsx` and `MyComponent.test.tsx` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration.
- ⚠️ **Integration Safety Rules** for this PRD: #4 (DnD re-measurement), #5 (no setPointerCapture), #8 (component integration), #9 (materialType union grep), #11 (restore guard), #12 (backup coverage). **READ** `documentation/integration-safety-rules.md` before implementing any task that triggers these rules.
- ⚠️ **`@dnd-kit` is NOT installed.** Must run `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers` before Task 9.0. (`@dnd-kit/modifiers` is needed for `restrictToParentElement` in Task 9.3.)
- ⚠️ **`seedrandom` is NOT installed.** Must run `npm install seedrandom` + `npm install -D @types/seedrandom` before Task 6.0.

### 🔴 Critical Architecture Context (from Phase 1+2 Experience)

> **Source:** `documentation/tasks/phase3-implementation-notes.md` — READ THIS FILE before starting any task.

1. **Passage Data Format Mismatch (Gotcha #1):** The editor saves passage data as `section.passageTitle` / `section.passageContent` (flat strings, cast with `as any`), but the TYPE SYSTEM defines `section.passage.title` / `section.passage.content` (nested object). Any task touching passages (auto test maker, clone, template) **MUST handle BOTH formats**. See `THCSSectionBlock.tsx` lines 278-286.
2. **THCSTestLayout.tsx is Tightly Coupled to RTDB (Gotcha #4):** `saveAnswersToRTDB` and `handleSubmit` hardcode `game_sessions/${sessionCode}/students/${user.uid}/...` paths (lines 152-169). Homework mode **CANNOT reuse THCSTestLayout as-is**. The recommended approach: use the `THCSPreviewOverlay.tsx` local-state pattern (Gotcha #5) as the basis for homework mode — it already uses the same question renderers with local state only, no RTDB. Copy its architecture, swap submit handler to write to `homework_submissions/`.
3. **`markThcsTest()` is Path-Agnostic (Gotcha #3):** The grading function in `thcsAutoMarking.service.ts` accepts sections/answers as INPUT parameters — it does NOT hardcode RTDB paths. It can be reused directly for homework grading. BUT the caller must handle reading answers FROM the correct path and writing results TO the correct path.
4. **Two Separate Result Types (Type System Note):** `THCSGradingResult` (THCS-native with `scaledScore`, `totalPoints`, `sectionResults`) and `TestMarkingResult` (legacy format with `totalScore`, `percentage`). An adapter `thcsResultToTestMarkingResult()` exists. **Phase 3 homework MUST store `THCSGradingResult` natively**, not the adapted format.
5. **Writing Grading is 3-Tier:** Tier 1 exact match (≥80% → auto-correct, <30% → auto-incorrect), Tier 2 AI grading (30-80% → Gemini/Groq), Tier 3 AI fails → `'pending'` for teacher. Homework with writing questions will have `gradingStatus: 'partial'` until teacher reviews.
6. **`THCSTestEditorPage.tsx` is ~630 lines** — already very large. Consider extracting new UI (template picker, bulk paste, drag context) into separate components rather than adding more logic inline.
7. **Version Pinning Pattern:** Use the same pattern as `sessionManager.js`: `assignment.versionKey = test._changelog ? latestKey : null; assignment._cachedVersion = fullTestSnapshot;`
8. **Validation Hook Reuse:** `useThcsValidation.ts` returns `{ errors, warnings, isValid }`. Phase 3 should EXTEND this for homework-specific validations (deadline set, students selected, etc.), NOT create a separate hook.

---

## Tasks

- [x] 1.0 Type System & Data Model Extensions
  - [x] 1.1 Add `shuffle?: boolean` and `shuffleOptions?: boolean` fields to the `THCSSection` interface in `src/types/thcs-test.types.ts`. Add them after the existing `passage` field. Both default to `false`. `shuffleOptions` is only meaningful when `shuffle === true`. **⚠️ Passage Data Mismatch (Gotcha #1):** The `passage` field is defined as `{ id, content, title?, imageUrl?, wordCount }` in the type, but the editor actually writes to `section.passageTitle` / `section.passageContent` (flat keys, `as any` cast). Do NOT change this in this task — just be aware of the mismatch. Tasks that READ passage data must handle both formats.
  - [x] 1.2 Add `timerMode?: 'strict' | 'informational' | 'none'` field to the `THCSTestMetadata` interface in `src/types/thcs-test.types.ts`. Add after the `tags` field. Default is `'strict'`. This is the test-level default; per-assignment override is in task 2.0.
  - [x] 1.3 **⚠️ Rule 9 (Grep Audit):** Add `'thcs-test'` to the `materialType` union type in ALL locations. Run in PowerShell: `Get-ChildItem -Recurse src/ -Include *.ts,*.tsx | Select-String "materialType"` (or on Linux/Mac: `grep -rn "materialType.*'quiz'.*'test'" src/`) to find every occurrence. Known locations:
    - `src/types/homework.types.ts` lines 185, 375, 415, 432 — update `'quiz' | 'test'` → `'quiz' | 'test' | 'thcs-test'`
    - `src/types/solo.types.ts` line 209 — same update
    - `src/services/homeworkManager.ts` line 32 in `CreateHomeworkInput` — same update
    - Verify no other files contain `materialType` with the old union. Check `src/services/materialDiscoveryService.ts` line 59 which maps `test.type === 'Custom'` — add THCS-THPT mapping logic.
  - [x] 1.4 Add `thcsConfig` to the `HomeworkAssignment` interface in `src/types/homework.types.ts`. Add as optional field after existing fields:
    ```typescript
    thcsConfig?: {
      timerModeOverride?: 'strict' | 'informational' | 'none';
      lateSubmissionPolicy?: 'accept' | 'accept-late' | 'reject' | 'penalty';
      // 'accept' = accept with NO late marking (no badge, no penalty)
      // 'accept-late' = accept but mark as "Late" in submission record (badge shown to teacher)
      // 'reject' = block submission entirely after deadline
      // 'penalty' = accept but deduct penaltyPercent from final score
      penaltyPercent?: number; // Only meaningful if policy === 'penalty'
      maxAttempts?: number; // 1-5, default 1. Number of times student can submit.
      feedbackTiming?: 'after-submission' | 'after-deadline' | 'manual';
      // 'after-submission' = student sees results immediately after submit
      // 'after-deadline' = results hidden until deadline passes
      // 'manual' = teacher manually releases results
      instructions?: string; // Optional teacher notes shown to student before starting
      versionKey?: string; // Pinned version key from _changelog
      pinToVersion?: boolean;
    };
    // NOTE: `scheduling` (availableFrom, dueDate) is stored in the existing HomeworkAssignment
    // fields, NOT in thcsConfig. Check HomeworkAssignment for `scheduling.availableFrom`
    // and `scheduling.dueDate` fields — reuse them. Do NOT duplicate date fields in thcsConfig.
    ```
  - [x] 1.5 Add `thcsData` to the homework submission type in `src/types/homework.types.ts`. Find the `HomeworkSubmission` interface (or equivalent) and add:
    ```typescript
    thcsData?: {
      scaledScore: number;        // 0-10
      rawScore: number;
      totalPoints: number;
      sectionResults: THCSSectionResult[];
      gradingStatus: THCSGradingStatus;
      questionResults: THCSQuestionResult[];
    };
    ```
    Import `THCSSectionResult`, `THCSGradingStatus`, `THCSQuestionResult` from `thcs-test.types.ts`. If those types don't exist yet, check Phase 2 types — they should already be defined.
    **⚠️ Type System Note:** This field stores `THCSGradingResult` natively (THCS-native format with `scaledScore`, `totalPoints`, `sectionResults`). Do NOT store the legacy `TestMarkingResult` format (`totalScore`, `percentage`). The adapter `thcsResultToTestMarkingResult()` exists if you need the legacy format for display, but storage MUST be native.
  - [x] 1.6 Add `thcsProgress` to the `AcademicRecord` interface in `src/types/academicRecord.types.ts`:
    ```typescript
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
      skillBreakdown?: {
        pronunciation: { average: number; count: number };
        grammar: { average: number; count: number };
        vocabulary: { average: number; count: number };
        reading: { average: number; count: number };
        writing: { average: number; count: number };
      };
      lastUpdated: number;
    };
    ```
  - [x] 1.7 Add `THCSTestTemplate` interface in `src/types/thcs-test.types.ts` at the bottom of the file:
    ```typescript
    export interface THCSTestTemplate {
      id: string;
      name: string;
      description: string;
      ownerId: string;
      isPublic: boolean;
      createdAt: number;
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
        questionCount: number;
        pointsPerQuestion: number;
        sectionPoints: number;
        shuffle: boolean;
        shuffleOptions: boolean;
      }>;
    }
    ```
  - [x] 1.8 Install required npm packages. Run in project root:
    - `npm install seedrandom @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers`
    - `npm install -D @types/seedrandom`
    - Verify all packages appear in `package.json` after install. `@dnd-kit/modifiers` is required for Task 9.3 (`restrictToParentElement`).

- [x] 2.0 Homework Assignment Flow (§4.1)
  - [x] 2.1 **Entry Point A — Teacher Lobby test card:** In `src/pages/TeacherLobbyPage.jsx`, locate the THCS-THPT test card rendering (look for `testType === 'THCS-THPT'` or the THCS card component). Add a new `[📋 Assign Homework]` button alongside existing `[Edit]`, `[Delete]`, `[Start Test]` buttons. This button should open the homework assignment dialog (Task 2.3). Pass the test ID, title, and current version key as props.
  - [x] 2.2 **Entry Point B — Homework List Page material selection:** In `src/pages/TeacherHomeworkListPage.tsx`, find the material selection flow triggered by `[+ Create Homework]`. There should be a material selection modal/step. Add a new tab or filter option labeled `"THCS-THPT Tests"` that queries tests where `testType === 'THCS-THPT'` from the teacher's own tests. When a THCS test is selected, proceed to the assignment dialog (Task 2.3) with `materialType: 'thcs-test'`.
  - [x] 2.3 **Create Homework Assignment Dialog:** Create `src/components/thcs-editor/THCSHomeworkAssignDialog.tsx` — a new dialog component for THCS homework assignment. There is NO existing generic homework dialog to extend; the existing homework creation is inline in `TeacherHomeworkListPage.tsx`. This dialog should include:
    - **Test name** (read-only, pre-filled)
    - **Target selection:** Class / Course / Individual Students (reuse existing `HomeworkTarget` pattern)
    - **Timer Mode override:** Show default from test metadata, allow override to `strict` / `informational` / `none`
    - **Schedule:** Available From (date picker) + Due Date (date picker) — these map to `HomeworkAssignment.scheduling.availableFrom` and `HomeworkAssignment.scheduling.dueDate` (existing fields, NOT in `thcsConfig`)
    - **Late Submission Policy:** Radio options matching Task 1.4 enum: `'accept'` (Accept — no penalty, no badge) / `'accept-late'` (Accept — marked "Late") / `'reject'` (Reject after deadline) / `'penalty'` (Custom penalty — shows percentage input)
    - **Max Attempts:** Dropdown (1-5), stored as `thcsConfig.maxAttempts`, default 1
    - **Feedback timing:** Dropdown (`after-submission` / `after-deadline` / `manual`), stored as `thcsConfig.feedbackTiming`
    - **Instructions:** Optional textarea, stored as `thcsConfig.instructions`
    - **Version pinning:** Checkbox "Pin to this version" (default checked). Show current version label.
    - **⚠️ Rule 8:** After creating this component, integrate it in BOTH entry points: `TeacherLobbyPage.jsx` (Task 2.1) and `TeacherHomeworkListPage.tsx` (Task 2.2). The dialog is triggered by those pages — it does NOT stand alone.
    - Look at how the existing homework creation flow works in `TeacherHomeworkListPage.tsx` and follow the same patterns for form state, validation, and submission.
  - [x] 2.4 **Extend `homeworkManager.ts` for THCS homework creation:** In `src/services/homeworkManager.ts`, modify `createHomework()` function:
    - Accept `materialType: 'thcs-test'` in `CreateHomeworkInput` (already updated in Task 1.3)
    - When `materialType === 'thcs-test'`, store the `thcsConfig` from the dialog (timer override, late policy, version pin, penalty percent, maxAttempts, feedbackTiming, instructions)
    - **Version Pinning:** Follow the EXACT pattern from `sessionManager.js` (Gotcha #2, Pattern #1): `assignment.versionKey = test._changelog ? Object.keys(test._changelog).sort().pop() : null; assignment._cachedVersion = deepClone(fullTestSnapshot);`. If `pinToVersion === true`, fetch the current test data from RTDB via `getThcsTestFromFirebase()` from `src/services/thcsTestStorage.ts` (this function already exists from Phase 1). If `pinToVersion === false`, store only the `versionKey` (no cached version — students always get latest).
    - The `thcsConfig` object should be stored in the `HomeworkAssignment` Firestore document
    - **Validation:** Extend `useThcsValidation.ts` hook with homework-specific checks: deadline is set, at least one target selected, `dueDate > availableFrom`, maxAttempts >= 1, etc. Do NOT create a separate validation hook.
  - [x] 2.5 **Extend `duplicateHomework()` in `homeworkManager.ts`:** Ensure the `duplicateHomework()` function (line ~273) copies `thcsConfig` along with other fields when duplicating a THCS homework assignment.
  - [x] 2.6 **Student Homework Experience — Standalone Mode:** **⚠️ CRITICAL (Gotcha #4):** `THCSTestLayout.tsx` (509 lines) hardcodes RTDB paths (`game_sessions/${sessionCode}/students/${user.uid}/...`) for `saveAnswersToRTDB` and `handleSubmit` (lines 152-169). Do NOT simply add `mode: 'homework'` with a branch — this creates a fragile, oversized component.
    **Recommended approach (from Gotcha #5):** Use the `THCSPreviewOverlay.tsx` local-state architecture as the basis:
    1. Create `src/components/thcs-student/THCSHomeworkLayout.tsx` — a new component that reuses the SAME question renderers (`THCSQuestionRenderer`, section iteration, navigation) but with **local state for answers** (not RTDB)
    2. Accept props — this component supports BOTH homework and course standalone modes:
       ```typescript
       interface THCSHomeworkLayoutProps {
         testData: THCSTest;
         mode: 'homework' | 'course-standalone';
         homeworkId?: string;       // Required when mode === 'homework', undefined for course
         homeworkConfig?: HomeworkAssignment['thcsConfig']; // Only for homework mode
         teacherId: string;         // Needed for late submission notification (Task 3.6)
         courseId?: string;         // Required when mode === 'course-standalone'
         materialId?: string;       // Required when mode === 'course-standalone' (for progress tracking)
       }
       ```
    3. Timer mode: when `mode === 'homework'`: `homeworkConfig?.timerModeOverride ?? testData.metadata.timerMode ?? 'strict'`. When `mode === 'course-standalone'`: `testData.metadata.timerMode ?? 'strict'` (no override).
    4. On submit — **conditional write path based on `mode`:**
       - Call `markThcsTest(sections, studentAnswers)` (path-agnostic, Gotcha #3) for auto-grading in BOTH modes
       - When `mode === 'homework'`: write results to `homework_submissions/` Firestore collection using `homeworkId`
       - When `mode === 'course-standalone'`: write results to `testResults/` (or the existing test results path) and update course progress via `courseManager.ts`'s `updateMaterialProgress(courseId, materialId, { completedAt, score: scaledScore })` (Task 5.3)
    5. After auto-grading: MCQ + fill-in are graded immediately. Writing questions go through 3-tier grading (Gotcha, Writing Grading note): exact match → AI → pending for teacher. If any writing is pending, set `gradingStatus: 'partial'`.
    6. **Teacher review for homework writing:** The Grading tab (Phase 2) must also show homework writing items pending review. Ensure the grading query includes `homework_submissions/` with `gradingStatus !== 'fully-graded'`.
    7. Load test data from `_cachedVersion` (if `mode === 'homework'` AND `pinToVersion === true`) or current test via `getThcsTestFromFirebase()` from `src/services/thcsTestStorage.ts`. For `course-standalone` mode, always load current test.
    8. **Max Attempts Enforcement (homework mode only):** When `mode === 'homework'`: query `homework_submissions/` for this student + homework ID. Count existing submissions. If `count >= thcsConfig.maxAttempts` (default 1), show "You have used all attempts (X/Y)" and disable the `[Start Test]` button. Otherwise show "Attempt X of Y". Skip this check when `mode === 'course-standalone'` (unlimited attempts for course tests).
    9. **Feedback Timing:** After submission:
       - When `mode === 'homework'`: check `thcsConfig.feedbackTiming`. If `'after-submission'`: show graded results. If `'after-deadline'`: show "Results will be available after the deadline." If `'manual'`: show "Results will be released by your teacher."
       - **Partial grading display:** If `feedbackTiming === 'after-submission'` AND `gradingStatus === 'partial'`: show graded MCQ/fill-in results with their scores. For pending writing questions, show `'Pending teacher review'` badge per question. Show tentative `scaledScore` with note: `'Score: X.X/10 (partial — Y writing questions pending review)'`. Do NOT hide results entirely.
       - When `mode === 'course-standalone'`: always show results immediately (no feedback timing override).
    10. **Shuffle:** Apply `shuffleTest(testData, currentUser.uid)` from `src/utils/thcsShuffle.ts` before rendering (see Task 6.3 note).
  - [x] 2.6a **⚠️ Rule 2 (Page-Entry Prerequisites):** THCSHomeworkLayout is a COMPONENT, not a page. It must be rendered by a parent page. The existing route is `src/pages/StudentHomeworkDetailPage.tsx` at route `/student/homework/:homeworkId` (see `src/App.jsx` line 292). In `StudentHomeworkDetailPage.tsx`:
    - Detect `materialType === 'thcs-test'` on the homework assignment record
    - When THCS: fetch the test data (from `_cachedVersion` or via `getThcsTestFromFirebase()`), then render:
      ```tsx
      <THCSHomeworkLayout
        testData={testData}
        mode="homework"
        homeworkId={homeworkId}
        homeworkConfig={assignment.thcsConfig}
        teacherId={assignment.createdBy}  // or assignment.teacherId — check HomeworkAssignment field name
      />
      ```
    - When NOT THCS: keep existing behavior (IELTS/quiz homework flow)
    - **Guard:** If student navigates directly to `/student/homework/:homeworkId` without valid homework data, show loading spinner while fetching, then error message "Homework not found" if the assignment doesn't exist or student isn't in the target list.
  - [x] 2.7 **Late Submission Policy Enforcement:** In the homework submission flow (Task 2.6), before allowing submission:
    - Check current time against `homework.scheduling.dueDate`
    - If past deadline AND policy is `'reject'`: show "Deadline passed. Submissions are closed." and disable submit button
    - If past deadline AND policy is `'accept-late'`: allow submit, set `isLate: true` on submission record, show "Late" badge in UI
    - If past deadline AND policy is `'penalty'`: allow submit, set `isLate: true`, apply `penaltyPercent` reduction to final `scaledScore` (e.g., if score is 8.0 and penalty is 10%, final = 7.2). Store `latePenaltyApplied: penaltyPercent` on the submission.
    - If past deadline AND policy is `'accept'`: allow submit, do NOT set `isLate`, do NOT apply any marking or penalty. This is the "no consequences" option.
    - **⚠️ Note:** These 4 behaviors match the enum in Task 1.4's `thcsConfig.lateSubmissionPolicy`. All 4 are distinct — do not confuse `'accept'` (invisible) with `'accept-late'` (visible Late badge).
  - [x] 2.8 **Homework Result Storage:** When a THCS homework is submitted, write the result to `homework_submissions/` Firestore collection. The submission document must include:
    - All existing `HomeworkSubmission` fields (homeworkId, studentId, submittedAt, etc.)
    - The `thcsData` extension from Task 1.5 — **store `THCSGradingResult` natively** (scaledScore, rawScore, totalPoints, sectionResults, gradingStatus, questionResults). Do NOT convert to `TestMarkingResult` for storage. The adapter `thcsResultToTestMarkingResult()` should only be used for display/compatibility, not for Firestore writes.
    - `isLate: boolean` and `latePenaltyApplied?: number` if penalty policy
    - `attemptNumber: number` — set to `existingSubmissionsCount + 1` where `existingSubmissionsCount` is from the query in Task 2.6 step 8. Do NOT use a separate counter or generate this independently — derive it from the actual submission count.
    - `studentAnswers: Record<string, any>` — raw student answers keyed by original question ID (for potential re-grading or teacher review)
    - **⚠️ Verify** existing `homework_submissions/` Firestore rules allow writing the `thcsData` field. If rules restrict to known fields, update `firestore.rules`.

- [x] 3.0 Notification Extensions (§4.2)
  - **⚠️ Rule 11 (Restore Guard):** ALL notification functions in Tasks 3.1–3.6 MUST be wrapped with `withRestoreGuard` per Integration Safety Rule #11. Not just Task 3.1.
  - [x] 3.1 **`sendThcsHomeworkAssignedNotification`:** In `src/services/notificationService.ts`, add a new exported function following the exact pattern of `sendHomeworkAssignedNotification` (line ~455). Parameters: `studentIds: string[], homeworkId: string, testTitle: string, dueDate: number, teacherName?: string`. Notification type: `'thcs_homework_assigned'`, icon: `'📝'`, link: `/student/homework/${homeworkId}`. Wrap with `withRestoreGuard` (Rule 11). Send to all students in the array.
  - [x] 3.2 **`sendThcsGradeUpdatedNotification`:** Add function following the `sendGradeUpdatedNotification` pattern (line ~402). Parameters: `studentId: string, testTitle: string, questionNumber: number, score: number, resultId: string`. Type: `'thcs_grade_updated'`, message: `Your answer for Q${questionNumber} in "${testTitle}" has been graded.`, link: `/student/results/${resultId}`, icon: `'📝'`. Wrap with `withRestoreGuard`.
  - [x] 3.3 **`sendThcsFullyGradedNotification`:** Add function. Parameters: `studentId: string, testTitle: string, totalScore: number, resultId: string`. Type: `'thcs_fully_graded'`, message: `All answers in "${testTitle}" have been graded. Your score: ${totalScore}/10.`, link: `/student/results/${resultId}`, icon: `'✅'`. This fires when `gradingStatus` transitions to `'fully-graded'`.
  - [x] 3.4 **`sendThcsHomeworkDueSoonNotification`:** Add function following `sendHomeworkDueSoonNotification` pattern (line ~505). Parameters: `studentId: string, homeworkId: string, testTitle: string, hoursRemaining: number`. Type: `'thcs_homework_due_soon'`, message: `"${testTitle}" is due in ${hoursRemaining} hours.`, icon: `'⏰'`.
  - [x] 3.5 **`sendThcsSubmittedNotification`:** Add function. Parameters: `studentId: string, testTitle: string, homeworkId: string`. Type: `'thcs_submitted'`, message: `You've submitted "${testTitle}". Results will be available after grading.`, icon: `'📤'`. This is a confirmation sent to the submitting student.
  - [x] 3.6 **`sendThcsLateSubmissionNotification`:** Add function. Parameters: `studentId: string, teacherId: string, testTitle: string, studentName: string, homeworkId: string`. Type: `'thcs_late_submission'`. Send **TWO** notifications: one to the student (`Your submission for "${testTitle}" was received late.`), one to the teacher (`${studentName} submitted "${testTitle}" late.`).
  - [x] 3.7 **Wire Trigger Points:** Integrate the notification calls at their trigger points:
    - Trigger for 3.1: In the homework creation flow (Task 2.4) — call after successfully creating the homework assignment. **Student ID resolution:** If the teacher assigned to a Class or Course (not individual students), resolve the roster to individual `studentIds` BEFORE calling the notification. Use the existing `getStudentsInClass()` / `getStudentsInCourse()` functions (check `homeworkManager.ts` or `classManager.ts` for the resolution pattern). The notification function expects `studentIds: string[]`, NOT class/course IDs.
    - Trigger for 3.2: In `src/pages/TeacherGradingPage.tsx` — locate the inline grading panel where teacher grades a single writing question (look for the score slider + feedback textarea from Phase 2). Call `sendThcsGradeUpdatedNotification` after teacher submits a grade for one question. **Also check** `src/pages/TeacherTestMonitorPage.tsx` if it also has an inline grading panel — if so, add the same trigger there.
    - Trigger for 3.3: In the same grading flow — after teacher grades a writing question, check if ALL writing questions are now graded (no more `'pending'` items). If so, transition `gradingStatus` to `'fully-graded'` and call `sendThcsFullyGradedNotification`.
    - Trigger for 3.4: In `src/services/deadlineReminderService.ts` — extend the existing deadline check to also query `materialType === 'thcs-test'` homework. The service currently checks for due-soon homework; add THCS to its filter.
    - Trigger for 3.5: In `THCSHomeworkLayout.tsx` (Task 2.6) — call after successful submission
    - Trigger for 3.6: In `THCSHomeworkLayout.tsx` (Task 2.6/2.7) — call when `isLate === true` after submission
    - **⚠️ Edge case (PRD §9 EC11 — Notification spam):** When a teacher grades 40 writing questions quickly, 3.2 fires 40 times. To prevent notification spam: in `sendThcsGradeUpdatedNotification`, implement client-side batching — debounce notifications by student+homework for 10 seconds. If multiple grades arrive within the window, send a single notification: `"X answers in '{testTitle}' have been graded."` instead of X individual notifications.

- [x] 4.0 THCS Library Browsing (§4.3)
  - [x] 4.1 **Type Filter UI in Teacher Lobby:** In `src/pages/TeacherLobbyPage.jsx`, when in "Public Library" content filter mode, add a **type filter dropdown** above the test cards. Options: `All Types`, `IELTS`, `THCS-THPT`. This filter controls which tests are shown from the public library. When `THCS-THPT` is selected, query the `thcs_library/` Firestore collection (already populated on Phase 1 publish). Also add sub-filters for `Grade Level` (6-12, All) and `Exam Type` (All, Giữa Kì, Cuối Kì, etc.) that appear only when THCS-THPT is selected.
  - [x] 4.2 **Library Search:** Add a search input field below the filters: `[🔍 Search by title or keyword...]`. **Strategy:** Primary search is client-side filter on `title` within already-loaded results. If results exceed 50, also support Firestore `array-contains` on the `tags` field as a server-side filter. Sort results by `publishedAt` (newest first). Implement Firestore cursor pagination with `startAfter` for loading more results.
  - [x] 4.3 **Public THCS Test Card Design:** When rendering a test from `thcs_library/`, display a card with:
    - Title, author name (`ownerName`)
    - Badge: `THCS-THPT | Grade {gradeLevel} | {examType} | {duration} min | {questionCount} Qs`
    - Two action buttons: `[📋 Use as-is]` and `[📄 Clone & Customize]`
    - Card styling consistent with existing test cards but with a distinguishing THCS badge/color
    - **Loading/Empty states:** Show skeleton cards during Firestore query loading. Show `"No tests found matching your filters."` when results are empty.
  > 2026-07-08 supersession: linked/use-as-is THCS references are not My
  > Content. The old merge requirement in 4.4.4 is retired. My Content is
  > current-account owned MaterialSummary `by_owner/{uid}` rows only; linked
  > references need a separate Saved/Linked surface if the product needs them.

  - [x] 4.4 **"Use as-is" Flow:** When teacher clicks "Use as-is":
    1. Show confirmation modal: "This test will be used as-is. You cannot modify it. The original teacher retains ownership."
    2. Two sub-options in the modal: "Start Live Session" → creates session with this test ID (reuse existing session creation flow). "Assign as Homework" → opens the homework assignment dialog (Task 2.3) with this test ID.
    3. Save a **linked reference** in the teacher's `thcs_linked_tests/` Firestore sub-collection (path: `users/{teacherUid}/thcs_linked_tests/{docId}`). Full document structure:
       ```typescript
       {
         id: string;              // Auto-generated document ID
         testId: string;          // The published test ID in RTDB
         linkedFrom: string;      // Original test owner's UID
         originalTestId: string;  // Same as testId (for clarity)
         isLinkedReference: true; // Always true for linked tests
         linkedAt: number;        // Timestamp
         testTitle: string;       // Cached title for display without fetching
         testMetadata: {          // Cached metadata for card display
           gradeLevel: number;
           examType: string;
           duration: number;
           questionCount: number;
         };
       }
       ```
    4. **"My Content" query update:** In `TeacherLobbyPage.jsx`, when showing "My Content", also query `users/{teacherUid}/thcs_linked_tests/` and merge results into the test list. Linked tests should show a small "Linked" badge (🔗) to distinguish from owned tests. Linked tests do NOT show `[Edit]` or `[Delete]` buttons — only `[Start Test]` and `[📋 Assign Homework]`.
    5. Handle edge case: if original teacher deletes the test, linked references should show "Test unavailable" message. When rendering a linked test card, check if the test still exists via `getThcsTestFromFirebase(testId)` — if null, show grey card with "Test unavailable — the original teacher has removed this test." and a `[Remove from My Content]` button.
    6. **Firestore Rules:** Add rules for `users/{userId}/thcs_linked_tests/{docId}`: allow read/write if `request.auth.uid == userId`.
  - [x] 4.5 **"Clone & Customize" Flow:** When teacher clicks "Clone & Customize":
    1. Fetch the full published test data from RTDB via `getThcsTestFromFirebase(testId)`
    2. Create a new draft in `thcs_drafts/` Firestore via `createThcsDraft()` — populate with all sections, questions, answers from the original
    3. Set `ownerId` to current teacher, add `clonedFrom: originalTestId` in the draft metadata (for provenance)
    4. Navigate to `THCSTestEditorPage.tsx` with the new `draftId`
    5. Add the `cloneFromPublicTest()` function to `src/services/thcsDraftService.ts`:
       ```typescript
       export async function cloneFromPublicTest(
         originalTestId: string,
         userId: string
       ): Promise<ServiceResponse<{ draftId: string }>>
       ```
    6. **Edge case (PRD §9 EC9):** If original test has images in Firebase Storage, copy image files to new Storage path under the cloner's UID. Do NOT share URL references (they'd break if original deletes images).
       - **Image detection:** Scan `question.imageUrl` and `section.passageTitle`/`section.passageContent` for Firebase Storage URLs (pattern: `https://firebasestorage.googleapis.com/...` or `gs://...`)
       - **Copy method:** For each image URL: download the file via `getDownloadURL()` + `fetch()`, then re-upload to `thcs-tests/{clonerUid}/{newTestId}/{filename}` using `uploadBytes()`
       - **URL update:** Replace all old image URLs in the cloned draft with the new Storage URLs
       - If image copy fails (e.g., original already deleted), log warning and continue without the image. Show warning in editor: "Some images could not be copied from the original test."

- [x] 5.0 Course Integration (§4.4)
  - [x] 5.1 **Material Linking UI — Teacher side:** In `src/pages/TeacherCourseProfilePage.tsx`, find the "Add Material" flow for adding tests to course modules. Currently it shows IELTS tests. Add a toggle/tab to also show THCS tests. THCS tests are identifiable by `testType === 'THCS-THPT'` in the RTDB `tests/` node. When a THCS test is selected, create a `CourseMaterial` link with the test's ID, following the existing `courseManager.ts` pattern.
  - [x] 5.2 **Student Course View — THCS Material Routing:** In `src/pages/StudentCourseDetailPage.tsx`, when displaying course materials in a module, detect THCS tests (check `testType` on the material's linked test). Display them with a THCS badge (violet). When student clicks a THCS test material, render `THCSHomeworkLayout` (from Task 2.6) in `course-standalone` mode — **do NOT use `THCSTestLayout`** which is tightly coupled to RTDB live sessions (Gotcha #4). Render as:
    ```tsx
    <THCSHomeworkLayout
      testData={testData}
      mode="course-standalone"
      teacherId={course.teacherId}  // Get from course data
      courseId={courseId}
      materialId={material.id}
    />
    ```
    Do NOT pass `homeworkId` or `homeworkConfig` — they are not relevant for course standalone mode. Progress tracking is handled by the component internally (Task 2.6 step 4).
    **⚠️ Edge case (PRD §9 EC10):** Course may contain BOTH IELTS and THCS tests. Display both with appropriate type badges (IELTS blue, THCS violet). The material list should handle mixed types naturally — routing is determined per-material by checking `testType`.
  - [x] 5.3 **Progress Tracking:** The existing `StudentCourseProgress.completedMaterials[materialId]` stores `{ completedAt, score }`. For THCS tests, set `score` to the `scaledScore` (0-10 scale). Progress update should happen after THCS test submission + grading completion (when `gradingStatus === 'fully-graded'`). Use the same `courseManager.ts` progress update function.
  - [x] 5.4 **Module Session Modal Update:** In `src/components/session/ModuleSessionModal.tsx` (line 40), the `materialType` is typed as `string`. When the material is a THCS test, ensure the modal correctly routes to the THCS test flow instead of the IELTS test flow. Check the material's `testType` field to determine routing.

- [x] 6.0 Question Shuffling — Mã Đề (§4.5)
  - [x] 6.1 **Create `src/utils/thcsShuffle.ts`:** Create a new utility file with:
    - Import `seedrandom` (installed in Task 1.8)
    - `fisherYatesShuffle<T>(array: T[], rng: () => number): T[]` — standard Fisher-Yates using the seeded RNG
    - `shuffleTest(test: THCSTest, studentUid: string): THCSTest` — the main function per PRD §4.5.2:
      - Create seeded RNG with `seedrandom(studentUid + test.id)` — deterministic per student
      - For each section where `section.shuffle === true`: shuffle questions with Fisher-Yates
      - If `section.shuffleOptions === true`: also shuffle MCQ options (A/B/C/D) within each question, then remap `correctAnswer` to new position
      - For reading comprehension sections with passages: shuffle question order but preserve passage order
      - For fill-in / cloze questions: shuffle question order only, NOT blank order within a question
    - `remapAnswerKey(originalAnswer: string, originalOptions: string[], shuffledOptions: string[]): string` — maps the correct answer letter to the new position after option shuffle. **Usage:** This is called INSIDE `shuffleTest()` when `shuffleOptions === true` — after shuffling an MCQ's options array, call `remapAnswerKey()` to update the question's `correctAnswer` field to match the new letter position (e.g., if answer was 'A' and option A moved to position C, update to 'C').
    - Store answers by original question ID (not shuffled index) so grading uses the original answer key
    - **Edge case (PRD §9 EC7):** If a section has only 1 question, shuffle has no effect (only 1 possible order). Do NOT error — silently skip shuffle for that section.
  - [x] 6.2 **Shuffle Toggles in Editor — `THCSSectionBlock.tsx`:** In `src/components/thcs-editor/THCSSectionBlock.tsx`, add a collapsible settings area at the bottom of each section block (or next to existing section controls):
    - Radio group: `○ Fixed order (all students see same order)` / `● Shuffle within this section`
    - Sub-checkbox (only enabled when shuffle is selected): `☑ Shuffle options within MCQ questions (A↔B↔C↔D)` — this checkbox is only relevant for MCQ question types
    - These controls update `section.shuffle` and `section.shuffleOptions` in the draft state
    - Default: both `false` (Fixed order)
    - **⚠️ React controlled input:** Use `checked={section.shuffle ?? false}` and `checked={section.shuffleOptions ?? false}` — existing sections in Firestore will NOT have these fields (they'll be `undefined`). Without the `?? false` fallback, React will log a "changing an uncontrolled input to be controlled" warning.
  - [x] 6.3 **Apply Shuffle on Student Test Load:** Shuffle must be applied in ALL student-facing test modes:
    - **Live session:** In `src/components/thcs-student/THCSTestLayout.tsx`, after fetching test data, call `shuffleTest(test, currentUser.uid)` before rendering.
    - **Homework:** In `src/components/thcs-student/THCSHomeworkLayout.tsx` (Task 2.6 step 10), apply `shuffleTest(testData, currentUser.uid)` before rendering.
    - **Course standalone:** In the course test-taking flow (Task 5.2), apply `shuffleTest` before passing test data to the component.
    - **Shared note:** Import `shuffleTest` from `src/utils/thcsShuffle.ts` in each location. The shuffled test is used for display only; student answers are stored with original question IDs. This ensures the same student always sees the same order (deterministic), but different students see different orders.

- [x] 7.0 Test Templates (§4.6)
  - [x] 7.1 **Firestore Rules for `thcs_templates/`:** Add security rules to `firestore.rules` (find the file in the project root or `firebase/` directory):
    ```javascript
    match /thcs_templates/{templateId} {
      allow read: if request.auth != null && (
        resource.data.isPublic == true || resource.data.ownerId == request.auth.uid
      );
      allow create: if request.auth != null && request.resource.data.ownerId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.ownerId == request.auth.uid;
    }
    ```
    ⚠️ **Rule 12 (Backup Coverage):** Verify in `backup-worker/` (or `r2-backup-worker/`) that the dynamic collection discovery picks up `thcs_templates/`. If it uses a static list, add `thcs_templates` to it.
  - [x] 7.2 **Template CRUD Service:** Add template functions to `src/services/thcsTestStorage.ts` (or create a separate `thcsTemplateService.ts`):
    - `saveTestAsTemplate(test: THCSTest, name: string, description: string, isPublic: boolean): Promise<{ templateId: string }>` — Extracts structure (section names, point distribution, question types, counts) from the test. Stores in `thcs_templates/` Firestore collection. Does NOT store question content.
    - `getMyTemplates(userId: string): Promise<THCSTestTemplate[]>` — Query templates where `ownerId === userId`
    - `getPublicTemplates(): Promise<THCSTestTemplate[]>` — Query templates where `isPublic === true`
    - `deleteTemplate(templateId: string): Promise<void>`
    - `getTemplateById(templateId: string): Promise<THCSTestTemplate | null>`
  - [x] 7.3 **"Save as Template" in Editor:** In `src/pages/THCSTestEditorPage.tsx` (~630 lines — **large file, consider impact**), add a menu item under the `[⋮ More]` dropdown (or equivalent action menu): `"Save as Template"`. When clicked:
    1. Open a small modal with: Template Name input, Template Description textarea, `isPublic` checkbox. **Note:** The `isPublic` checkbox is intentionally added here (not in PRD mockup) because the data model (Task 1.7) includes `isPublic: boolean` and the template picker (Task 7.4) queries public templates — so teachers need a way to set this field. **Extract the modal into a separate component** `src/components/thcs-editor/THCSSaveTemplateModal.tsx` to avoid bloating the already-large editor page.
    2. On submit: call `saveTestAsTemplate()` from Task 7.2
    3. Show success toast notification
  - [x] 7.4 **Create `THCSTemplatePicker.tsx`:** Create `src/components/thcs-editor/THCSTemplatePicker.tsx`:
    - **⚠️ Rule 8:** This component must be integrated into `THCSTestEditorPage.tsx` or the test creation flow — creating it alone is not enough.
    - Modal with two sections: "My Templates" (list from `getMyTemplates`) and "Public Templates" (list from `getPublicTemplates`)
    - Each template card shows: name, description, section count, question count, duration
    - Radio selection — pick one template
    - Buttons: `[Cancel]` `[Create Test →]`
  - [x] 7.5 **"Create from Template" Flow:** In the test creation flow (wherever "Create New Test" is triggered — check `THCSTestEditorPage.tsx` or `TeacherLobbyPage.jsx`):
    - Add creation method selection: `○ Blank (empty test)` / `○ Template` / `○ Upload Document (auto-parse)` (Upload Document is a placeholder here — full implementation in Task 10.0)
    - When "Template" is selected → show `THCSTemplatePicker` (Task 7.4)
    - On template selection: call `createThcsDraft()` with metadata pre-populated from template. For each section in the template: create section with `questionCount` empty question placeholders of `defaultQuestionType`. **⚠️ Question ID generation:** Each placeholder question MUST have a unique `id` via `crypto.randomUUID()` (same rule as Task 8.1). Do NOT use array index. Set point distribution from template. Navigate to editor with new draftId.
    - **Edge case (PRD §9 EC4):** When creating placeholders from template, auto-calculate points per question: `pointsPerQuestion = sectionPoints / questionCount`. Validate minimum `pointsPerQuestion ≥ 0.05`. If below minimum, show warning: "Section '{name}' has too many questions for its point allocation."

- [x] 8.0 Bulk Question Creation (§4.7)
  - [x] 8.1 **"Add N Questions" Button:** In `src/components/thcs-editor/THCSSectionBlock.tsx`, next to the existing `[+ Add Question]` button, add a dropdown button `[+ Add 5 ▼]` with options: Add 5, Add 10, Add 20, Custom (opens number input). When an option is selected:
    - Create N empty question blocks of the section's `defaultQuestionType` (or the most recent question type in the section)
    - **⚠️ Question ID generation:** Each new question MUST have a unique `id` generated via `crypto.randomUUID()` (or the project's existing ID generator — check how `THCSTestEditorPage.tsx` creates new questions in the `handleAddQuestion` function). Do NOT use array index or sequential question number as the question `id`. The `id` is used by dnd-kit for drag tracking (Task 9.0) and must be globally unique.
    - All questions start with empty text, no options (for MCQ: 4 empty option strings), no answers
    - Sequential numbering continues from the last question number in the section (this is the DISPLAY number, not the `id`)
    - Update the draft state with the new questions
  - [x] 8.2 **Create `THCSBulkPasteModal.tsx`:** Create `src/components/thcs-editor/THCSBulkPasteModal.tsx`:
    - **⚠️ Rule 8:** Must be integrated into `THCSSectionBlock.tsx` — triggered by a `[📋 Paste Questions]` button
    - Format selector dropdown: `MCQ (1 per line)` / `Fill-in`
    - Large textarea for pasting question text
    - Live preview below textarea: "X questions detected"
    - Buttons: `[Cancel]` `[Import X Questions →]`
    - Uses the parser from Task 8.3 to detect and preview questions
  - [x] 8.3 **Create `src/utils/thcsQuestionParser.ts`:** Create the question text parser:
    ```typescript
    interface ParsedQuestion {
      text: string;
      type: THCSQuestionType;
      options?: string[];
      correctAnswer?: string;
      blankCount?: number;
      blankAnswers?: string[][];
    }
    
    export function parseQuestionText(text: string, format: 'mcq' | 'fill-in'): ParsedQuestion[];
    ```
    - **MCQ parsing:** Detect numbered lines (`1.`, `2.`, `Question 1:`, `Câu 1:`) followed by A/B/C/D option lines. Extract answer from `Answer:` / `Đáp án:` lines.
    - **Fill-in parsing:** Detect `___` markers in question text. Extract answer from `Answer:` lines.
    - Show error for unparseable lines with line numbers
    - Return array of parsed questions that can be added to the section
  - [x] 8.4 **⚠️ Integration check (NOT a duplicate):** Task 8.2 already specifies that `THCSBulkPasteModal` must be integrated into `THCSSectionBlock.tsx` via a `[📋 Paste Questions]` button. This task is a verification checkpoint: after completing Tasks 8.2 and 8.3, verify that the `[📋 Paste Questions]` button exists in `THCSSectionBlock.tsx`, opens the modal, and on import: adds parsed questions to the section, updates draft state, and triggers auto-save. If Task 8.2 was done correctly, no additional code is needed here.

- [x] 9.0 Drag-and-Drop Reordering (§4.8)
  - [x] 9.1 **⚠️ READ `documentation/integration-safety-rules.md` Rules 4 and 5 BEFORE starting this task.**
  - [x] 9.2 **Section-Level DnD in Editor:** **MUST create `src/components/thcs-editor/THCSDndSectionsContainer.tsx`** — extract ALL DnD context and section-level drag logic into this wrapper component. Do NOT add DnD imports or `DndContext` directly in `THCSTestEditorPage.tsx` (~630 lines — already at complexity limit). The wrapper component should:
    - Import `DndContext`, `closestCenter`, `SortableContext`, `verticalListSortingStrategy` from `@dnd-kit/core` and `@dnd-kit/sortable`
    - Each `THCSSectionBlock` gets a drag handle (⋮⋮ grip icon) on the left side
    - Configure `SortableContext` with section IDs
    - On `onDragEnd`: reorder sections array, update all section `order` values sequentially, trigger auto-save (debounced 2s, existing flow)
    - ⚠️ **Rule 4:** After drag completes, call `requestAnimationFrame()` then re-measure layout to prevent layout shift
    - ⚠️ **Rule 5:** Do NOT use `setPointerCapture()` on any draggable element
  - [x] 9.3 **Question-Level DnD within Sections:** In `src/components/thcs-editor/THCSSectionBlock.tsx`, wrap the questions list with a nested `SortableContext`:
    - Each `THCSQuestionBlock` gets a drag handle (⋮⋮ grip icon) on the left side
    - Cross-section drag is NOT supported — use `restrictToParentElement` modifier from `@dnd-kit/modifiers` to constrain drag within the parent section
    - On `onDragEnd`: reorder questions array within the section, re-number all questions sequentially
    - ⚠️ **Rule 4:** Same re-measurement requirement
  - [x] 9.4 **Remove Up/Down Buttons:** In `src/components/thcs-editor/THCSQuestionBlock.tsx`, find and remove the existing up/down arrow buttons (Phase 1 feature). Replace with the drag handle. Keep keyboard shortcut `Alt+↑/↓` as accessibility fallback for reordering.
  - [x] 9.5 **Re-numbering After Reorder:** After any drag-end event (section or question level), re-calculate all `questionNumber` values across the entire test sequentially (Q1, Q2, Q3...). This ensures question numbers are always correct regardless of section/question reordering.

- [x] 10.0 Auto Test Maker — Document Parser (§4.12)
  - [x] 10.1 **Create `src/services/test-creation/thcsDocumentParser.service.ts`:** Create the main parser service file with types and the `parseThcsDocument()` async function. Follow the structure defined in PRD §4.12.4:
    - `ParseProgress`, `ParsedTest`, `ParseWarning`, `AmbiguousItem` interfaces
    - `PATTERNS` object with regex patterns from PRD §4.12.3 (question, optionLine, sectionHeader, passageMarker, answerKeyHeader, answerKeyLine, fillBlank, pointAllocation, duration, gradeLevel)
    - `INSTRUCTION_TYPE_MAP` array with regex → THCSQuestionType mappings from PRD §4.12.3 Layer 2
    - Export `parseThcsDocument(file: File, onProgress?: (progress: ParseProgress) => void): Promise<Result<ParsedTest>>`
  - [x] 10.2 **Layer 1: Regex Structural Parser:** Implement the helper functions called by `parseThcsDocument`:
    - `detectSections(lines: string[]): ParsedSection[]` — Scan lines for section headers using `PATTERNS.sectionHeader`. Extract section name, instruction text, and line ranges.
    - `parseQuestions(lines: string[], sections: ParsedSection[]): ParsedQuestion[]` — Within each section's line range, detect questions using `PATTERNS.question`, extract options using `PATTERNS.optionLine`, detect fill-in blanks using `PATTERNS.fillBlank`.
    - `extractMetadata(lines: string[]): ParsedMetadata` — Extract title, grade level (`PATTERNS.gradeLevel`), duration (`PATTERNS.duration`), exam type from the first few lines.
    - Follow parsing patterns from `src/services/test-creation/offline-parser.service.ts` as a reference but keep THCS parser simpler.
    - **Edge case (PRD §9 EC13):** If no section headers found, create a single "General" section. Show warning.
  - [x] 10.3 **Layer 2: Instruction-to-Type Classifier:** Implement `classifyQuestionTypes(sections, lines)`:
    - For each section, extract the instruction text (lines between section header and first question)
    - Match against `INSTRUCTION_TYPE_MAP` — use the first match with highest confidence
    - If no match found, default to `'mcq-grammar'` with confidence 60%
    - Store classification result with confidence score per section
  - [x] 10.4 **Layer 3: AI Polish (Optional):** Implement `resolveAmbiguousWithAI(ambiguousItems, lines)`:
    - Collect all items with confidence < 75%
    - If no ambiguous items, skip (no API call)
    - If ambiguous items exist: make ONE API call via `aiService` (Gemini first, Groq fallback — use existing `router.service.ts`)
    - **Prompt structure:** Send a JSON payload with the ambiguous items. Expected input/output:
      ```typescript
      // Input to AI (include in prompt as JSON):
      interface AIClassificationInput {
        items: Array<{
          id: string;             // Unique ID to map response back
          instructionText: string; // The instruction text to classify
          currentType: string;     // Regex-assigned type
          confidence: number;      // Regex confidence (0-100)
        }>;
      }
      // Expected AI response (parse as JSON):
      interface AIClassificationOutput {
        classifications: Array<{
          id: string;             // Must match input id
          type: THCSQuestionType;  // AI-determined type
          confidence: number;      // AI confidence (0-100)
        }>;
      }
      ```
    - Prompt: focused THCS classification — send only the ambiguous instruction texts, not the full document. Include a list of valid `THCSQuestionType` values in the prompt so the AI returns valid enum values.
    - Parse the AI JSON response. If response is not valid JSON, treat as AI failure (see error handling below).
    - Update the ambiguous items' types based on AI response — only if AI confidence > regex confidence
    - **Error handling:** If AI call fails (timeout, rate limit, quota exceeded, network error): catch the error, log a warning via `console.warn()`, and keep all ambiguous items at their regex-assigned confidence/type. Do NOT block or fail the parse. Do NOT retry (the teacher can review manually). Add a warning to `ParsedTest.warnings[]`: `{ type: 'skipped-content', message: 'AI verification unavailable — please review flagged items manually.' }`
  - [x] 10.5 **Answer Key Extraction:** Implement `extractAnswerKey(lines)` per PRD §4.12.5:
    - Detect answer key section start with `PATTERNS.answerKeyHeader`
    - Parse THREE formats:
      1. "Câu N: Đáp án: X" (verbose Vietnamese)
      2. Compact "1.D 2.A 3.C" (inline)
      3. Table-extracted "1-D, 2-A, 3-C" (PRD §9 EC15 — common in formatted documents)
    - Return `Record<number, string>` mapping question number → answer letter
    - **If no answer key section found:** Return empty object. The review UI (Task 10.7) will show "Missing Answer Key" options.
    - **If some answers parsed but others missing:** Return partial object. The review UI will highlight missing keys.
  - [x] 10.6 **Create `src/components/thcs-editor/THCSDocumentUpload.tsx`:** File upload component for the test creation flow:
    - Drag-and-drop zone or click-to-upload
    - Accepted file types: `.docx`, `.pdf`, `.txt` (file extension validation)
    - Max file size: 10MB (validate before upload)
    - Uses `extractTextFromFile()` from `src/services/file-extractor/file.extractor.ts` for text extraction
    - Shows upload progress and then transitions to parsing progress using `ParseProgress` callbacks
    - **⚠️ Rule 8:** Must be integrated into the test creation flow in `THCSTestEditorPage.tsx` or the "Create New Test" dialog
  - [x] 10.7 **Create `src/components/thcs-editor/THCSParseReviewPanel.tsx`:** Review UI shown after parsing completes (PRD §4.12.6):
    - Display overall confidence percentage
    - Section-by-section breakdown: section name, question count, confidence badge (✅ High / ⚠️ Review)
    - For low-confidence items (< 80%): show type alternatives with radio buttons for teacher selection
    - Answer key grid: compact display of all extracted answers, highlight missing keys with ⚠️
    - Missing key options: `[Paste Missing Keys]` → opens text input for manual answer entry. `[AI Generate Missing]` → calls `aiService.generateAnswersFromContent()` (reuse from IELTS flow).
    - `[← Back]` button to re-upload. `[Edit in Full Editor →]` button to proceed.
    - **Edge case (PRD §9 EC14):** Show warning for detected but not imported images: "X images detected but not imported."
    - **Edge case (PRD §9 EC17):** If "Mã đề" markers detected, warn: "Multiple test variants detected. Only the first variant was parsed."
  - [x] 10.8 **Data Flow: ParsedTest → THCSDraft → Editor:** Implement the `convertParsedToThcsDraft()` function per PRD §4.12.7:
    - Take `ParsedTest` result and convert to `Partial<THCSTest>` structure
    - Map each parsed section to a `THCSSection` with generated IDs
    - Set layout: `'two-column'` for reading sections, `'single-column'` for others
    - **⚠️ Passage Data Mismatch (Gotcha #1):** When creating draft sections with passages (reading comprehension, cloze), store passage data using the FLAT format that the editor actually uses: `section.passageTitle` and `section.passageContent` (with `as any` cast). Do NOT use the typed `section.passage.title` / `section.passage.content` format — the editor won't read it correctly. This is a known limitation from Phase 1/2. **⚠️ IGNORE** the conversion function in PRD §4.12.7 which shows `passage: section.passage || undefined` — that code uses the WRONG (nested) format. Use the flat format specified here instead.
    - Map parsed questions to `THCSQuestion` with answer keys from the extracted answer key
    - Save as new draft in `thcs_drafts/` Firestore via `createThcsDraft()`
    - Navigate to `THCSTestEditorPage.tsx` with the new draftId
    - **Edge case (PRD §9 EC16):** Hash document content. If matching hash found in recent parses, show: "This document was already parsed. [Use Previous Result] [Parse Again]"
  - [x] 10.9 **Integration into Test Creation Flow:** In the test creation dialog (wherever "Create New Test" is handled):
    - Add the third creation method: `○ Upload Document (auto-parse)` alongside Blank and Template
    - When selected, show `THCSDocumentUpload` component
    - After upload + parse, show `THCSParseReviewPanel`
    - After review, proceed to editor with parsed draft

- [x] 11.0 Timer Mode Configuration (§4.9)
  - [x] 11.1 **Timer Mode Selector in Editor Metadata Panel:** In `src/pages/THCSTestEditorPage.tsx`, find the metadata panel (where title, duration, grade level are configured). Add a new field group:
    ```
    Timer Mode: ○ Strict (auto-submit at 0:00) ● Informational (timer shown, no auto-submit) ○ None (no timer)
    ```
    This updates `metadata.timerMode` in the draft state. Default: `'strict'`.
  - [x] 11.2 **Per-Assignment Override in Homework Dialog:** In the homework assignment dialog (Task 2.3), show the timer mode override:
    - Display the current test default: "Default from test: Strict (45 min)"
    - Override radio group: `○ Strict ○ Informational ○ No timer` (selecting any overrides the test default)
    - Store the override in `thcsConfig.timerModeOverride`
  - [x] 11.3 **Timer Mode Handling in `THCSTestLayout.tsx`:** In `src/components/thcs-student/THCSTestLayout.tsx`, implement timer behavior based on resolved timer mode. **Also apply to `THCSHomeworkLayout.tsx` (Task 2.6):**
    - Resolution order: `homeworkConfig?.timerModeOverride ?? testMetadata.timerMode ?? 'strict'`
    - `'strict'`: Timer counts down, auto-submit when timer reaches 0:00 (existing behavior — verify it works)
    - `'informational'`: Timer counts down and is displayed, but when it reaches 0:00 do NOT auto-submit. Show a non-blocking yellow banner at the top: `"Time is up — you may continue at your own pace."` Timer stops at 0:00 (does NOT go negative). Banner is not dismissible but does not block interaction. Student can still navigate and submit manually.
    - `'none'`: No timer displayed at all. No auto-submit.
    - **Edge case (PRD §9 EC8):** Homework with `timerMode: 'none'` — student may never submit. Deadline enforcement handles this: after deadline, unsubmitted homework gets status `'missed'`.

- [x] 12.0 Student Dashboard Integration & Academic Record Separation (§4.10 + §4.11)
  - [x] 12.1 **THCS Items in Student Dashboard Feed:** In `src/pages/StudentDashboardPage.jsx`, the feed currently queries upcoming homework, live sessions, and recent results. Add THCS-THPT items:
    - Query `homework_assignments/` where `materialType === 'thcs-test'` and the student is in the target. **Follow the same query pattern** used by `getHomeworkForStudent()` in `src/services/homeworkManager.ts` — it should now include THCS homework after Task 1.3 materialType update. Check that function's Firestore query for the exact field names used for student filtering (e.g., `targetStudents` array-contains, or `classId`, or `courseId`).
    - Query THCS test results from `testResults/` or homework submissions where `thcsData` exists
    - Merge THCS items into the existing unified feed, sorted by relevance (due date for homework, submission date for results)
  - [x] 12.2 **THCS-THPT Card Design:** Create a THCS-specific card component for the dashboard feed (or extend the existing homework card):
    - **Styling:** Violet left border (#7C3AED or similar) to distinguish from IELTS cards
    - **For homework (not started):** Show title, `THCS-THPT` badge, grade level, question count, duration, due date (e.g., "Due: 3 days"), `[Start Test →]` button
    - **For homework (in progress):** Show title, `THCS-THPT` badge, status "In progress", `[Continue →]` button
    - **For completed/graded:** Show title, `THCS-THPT` badge, score on 10-point scale (e.g., "8.3/10"), grading status badge (e.g., "Partial (2 pending)" for writing not yet graded), `[View Results →]` button
  - [x] 12.3 **Extend `AcademicRecord` Service:** In `src/services/academicRecordService.ts`, add a function to update THCS progress:
    ```typescript
    export async function updateThcsProgress(
      studentId: string,
      testResult: {
        testId: string;
        testTitle: string;
        scaledScore: number;
        gradeLevel: number;
        examType: string;
        sectionResults: THCSSectionResult[];
      }
    ): Promise<void>
    ```
    This function:
    1. Increments `thcsProgress.testsCompleted`
    2. Adds entry to `scoreHistory` array
    3. Recalculates `averageScore` (running average of all scores)
    4. Updates `skillBreakdown` by mapping section question types to skill areas (pronunciation, grammar, vocabulary, reading, writing)
    5. Sets `lastUpdated` to current timestamp
    6. Uses `runTransaction` to prevent race conditions (same pattern as test stats update in Phase 1)
  - [x] 12.4 **Trigger Academic Record Update:** After THCS test grading reaches `'fully-graded'` status:
    - In the grading completion flow (same location as Task 3.3's trigger — `src/pages/TeacherGradingPage.tsx` inline grading panel), call `updateThcsProgress()` with the test result data
    - This should happen AFTER the fully-graded notification is sent
    - **Live session results:** Also trigger from the auto-grading completion in `THCSTestLayout.tsx` (when all questions are MCQ/fill-in with no writing, `gradingStatus` goes directly to `'fully-graded'`)
    - **Homework submissions:** Trigger from `THCSHomeworkLayout.tsx` (Task 2.6) after auto-grading completes with `'fully-graded'` status
  - [x] 12.5 **THCS/THPT Tab in Academic Record Page:** In `src/pages/AcademicRecordPage.tsx`, add a new tab alongside the existing IELTS tab:
    - Tab label: "THCS/THPT"
    - Content:
      - **Score trend graph:** Line chart of `scaledScore` over time (0-10 scale). Use `recharts` library (already installed — see `src/components/results/ProgressLineChart.tsx` which imports from `recharts`). Follow the same chart pattern as `ProgressLineChart` for styling consistency.
      - **Skill breakdown:** Radar chart (or bar chart) showing average scores across pronunciation, grammar, vocabulary, reading, writing areas. Reference `src/components/results/SkillRadarChart.tsx` for the existing radar chart pattern.
      - **Test history table:** Columns: Date, Test Title, Grade Level, Exam Type, Score (/10). Sorted by date descending.
    - Data source: Read `thcsProgress` from the student's `AcademicRecord`
    - If `thcsProgress` is undefined/empty, show "No THCS/THPT tests completed yet." placeholder
