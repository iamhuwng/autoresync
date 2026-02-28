# Tasks: PRD-0030 — IELTS Writing Test System

> Generated from [PRD-0030](./0030-prd-ielts-writing-test-system.md)
> Date: 2026-02-28
> Revision: v2 — Refined with 24 GAP annotations from codebase verification

---

## Relevant Files

### New Files (to create)

- `src/types/ielts-writing.types.ts` — All Writing-specific TypeScript interfaces and types
- `src/utils/ieltsWritingBandCalculator.ts` — IELTS band score calculation utilities
- `src/utils/ieltsWritingBandCalculator.test.ts` — Unit tests for band calculator
- `src/utils/annotationRenderer.ts` — **[GAP-16]** Shared annotation rendering utility used by both AnnotatedEssayRenderer and AnnotatedEssayReadOnly
- `src/services/writingTestService.ts` — Writing test CRUD (RTDB publish + Firestore drafts)
- `src/services/writingTestService.test.ts` — Unit tests
- `src/services/writingSubmissionService.ts` — Writing submission CRUD + `autoSubmitFromRTDB()` standalone function
- `src/services/writingSubmissionService.test.ts` — Unit tests
- `src/services/writingAnnotationService.ts` — **[GAP-24]** Annotation category CRUD (per-teacher custom categories in Firestore)
- `src/pages/WritingTestBuilder.tsx` — Teacher writing test creation/editing page
- `src/pages/WritingTestBuilder.css` — Styles for WritingTestBuilder
- `src/components/writing-builder/WritingMetadataPanel.tsx` — Metadata form panel
- `src/components/writing-builder/WritingTaskPanel.tsx` — Task panel (prompt, image, word minimum, model answer)
- `src/components/writing-builder/WritingValidationSummary.tsx` — Validation summary
- `src/components/writing-student/WritingTestPage.tsx` — Student live session writing test page
- `src/components/writing-student/WritingTestPage.css`
- `src/components/writing-student/WritingEditor.tsx` — Plain textarea editor with word counter, paste prevention
- `src/components/writing-student/WritingPromptPanel.tsx` — Left panel: task prompt display
- `src/components/writing-student/WritingSubmitModal.tsx` — Submit confirmation modal
- `src/hooks/useWritingAutoSave.ts` — RTDB auto-save hook (debounced)
- `src/hooks/useExternalPastePrevention.ts` — External paste/drop prevention hook
- `src/hooks/useActiveTimeTracking.ts` — Keystroke gap-based active time tracking
- `src/components/writing-monitor/WritingMonitorCard.tsx` — Student card for teacher monitor
- `src/components/writing-monitor/WritingPeekModal.tsx` — Essay peek modal
- `src/pages/WritingGradingQueuePage.tsx` — Grading queue list page
- `src/pages/WritingGradingQueuePage.css`
- `src/pages/WritingGradingPage.tsx` — Side-by-side grading interface
- `src/pages/WritingGradingPage.css`
- `src/components/writing-grading/AnnotationToolbar.tsx`
- `src/components/writing-grading/AnnotatedEssayRenderer.tsx`
- `src/components/writing-grading/CriteriaScoringPanel.tsx`
- `src/components/writing-grading/FeedbackPanel.tsx`
- `src/components/writing-grading/CategoryManager.tsx`
- `src/components/writing-grading/VoidTaskButton.tsx`
- `src/components/writing-grading/GradingAuditTrail.tsx`
- `src/components/writing-results/WritingResultView.tsx`
- `src/components/writing-results/WritingResultView.css`
- `src/components/writing-results/WritingResultDetailModal.tsx`
- `src/components/writing-results/AnnotatedEssayReadOnly.tsx`
- `src/components/writing-results/CriteriaScoreChart.tsx`
- `src/components/writing-results/WritingTestResultsSection.tsx` — Teacher results section for writing tests (sortable table + stats)
- `src/components/writing-practice/WritingPracticeView.tsx`
- `src/components/writing-practice/SubmitToTeacherModal.tsx`
- `src/components/academic-record/WritingProgressSection.tsx`
- `src/components/dashboard/PendingReviewsWidget.tsx`

> **[GAP-23]** CSS files MUST be created alongside their component/page files. Each CSS file defines styles for the classes used in that component. Use CSS custom properties from the existing design system — check `src/index.css` or `src/App.css` for existing tokens. Do NOT use Mantine theme tokens. Do NOT inline all styles; extract repeated layout patterns to the CSS file.

### Existing Files (to modify)

- `src/types/results.types.ts` — ⚠️ PLURAL `results`. Extend `EnhancedTestResultRecord` with `writingData`. Reconcile with existing fields.
- `src/constants/routes.ts` — Add 4 new writing routes
- `src/config/routeSecurity.ts` — Add route security for new routes
- `src/App.jsx` — Add lazy imports + route definitions for writing pages
- `src/pages/TestPageRouter.tsx` — Add `case 'Writing'` to render `WritingTestPage`
- `src/pages/TestBuilderRouter.tsx` — Enable Writing skill
- `src/pages/StudentPracticePage.tsx` — Add Writing branch
- `src/pages/TeacherTestMonitorPage.tsx` — Add writing-specific monitor card
- `src/pages/TeacherTestResultsPage.tsx` — Add writing-specific results columns
- `src/pages/AcademicRecordPage.tsx` — Add Writing progress tab
- `src/pages/StudentDashboardPage.jsx` — Add PendingReviewsWidget
- `src/pages/StudentLibraryPage.tsx` — Show writing tests with ✍️ icon
- `src/components/homework/HomeworkCreateModal.tsx` — Support writing test config
- `src/services/notificationService.ts` — Add writing notification functions wrapped in `withRestoreGuard()`
- `src/types/notification.types.ts` — Add writing notification types
- `src/components/TeacherNavigation.tsx` — **[GAP-18]** Add "Writing Grading" nav link (this is the confirmed file from codebase)
- `firestore.rules` — Add rules for `writing_submissions`, `writing_drafts`, and `users/{uid}/settings` paths

### Notes

- Unit tests placed alongside their source file.
- Use `npx jest [optional/path/to/test/file]` to run tests.
- ⚠️ **Integration Safety Rule #1:** All new routes MUST be added to `src/constants/routes.ts` and `src/config/routeSecurity.ts`.
- ⚠️ **Integration Safety Rule #8:** New components must be actually imported and rendered in their parent pages, not just created.
- ⚠️ **Integration Safety Rule #11:** All write operations to RTDB/Firestore in services MUST use `withRestoreGuard()` wrapper. Import from `src/services/restoreGuard.ts`.
- ⚠️ **Integration Safety Rule #12:** New Firestore collections (`writing_submissions`, `writing_drafts`) — verify `FIRESTORE_EXCLUDE` in `r2-backup-worker/src/backup/data-backup.ts` does NOT contain them.
- ⚠️ **NO MANTINE:** Do NOT use any Mantine components, including `Center`, `Loader`, `Spinner`, etc. Use native HTML/CSS or `src/components/modern/`.
- **Rich text editor:** Use **TipTap**. Install: `npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-bold @tiptap/extension-italic @tiptap/extension-bullet-list @tiptap/extension-ordered-list @tiptap/extension-placeholder`.
- **Route guard pattern:** Use `<PrivateRoute allowedRoles={['teacher']}>` from `src/components/PrivateRoute.jsx`. There is NO `TeacherGuard` component.
- **Lazy import pattern:** `const PageName = lazy(() => import('./pages/PageName.tsx'));` at top of `App.jsx`.
- 🔴 **IMAGE UPLOAD — NEVER use Firebase Storage / `imageUploadService.ts`** (deleted). ALL uploads go to Cloudflare R2 via `src/services/r2Storage.ts`. See `documentation/SOP/file-upload-patterns-r2-storage.md`.
- **R2 upload pattern for writing test images (Temp → Permanent):**
  ```typescript
  import r2StorageService from '../services/r2Storage';
  // On file selected:
  const result = await r2StorageService.uploadImage(file, 'images'); // → temp/images/
  setTask(prev => ({ ...prev, promptImageUrl: result.url, _imageKey: result.key }));
  // On publish: move to permanent before saving
  if (task._imageKey && r2StorageService.isTempFile(task._imageKey)) {
    const moved = await r2StorageService.moveToPermanent(task._imageKey);
    task.promptImageUrl = moved.newUrl;
  }
  ```
- **[GAP-06] Debounce pattern:** Always use `useRef` to hold timer IDs, never `useState`. Cleanup is mandatory:
  ```typescript
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveWritingDraft(...), 2000);
    return () => clearTimeout(timerRef.current);
  }, [draftState]); // See Integration Safety Rule #6
  ```

---

## Tasks

- [x] 1.0 Data Model & Type Foundation
  - [x] 1.1 Create `src/types/ielts-writing.types.ts` with all interfaces from PRD §4.1.1 and §4.1.2: `WritingTask1Type`, `WritingTask2Type`, `WritingTask`, `WritingTestFormat`, `WritingTestMetadata`, `IELTSWritingTest`, `WritingTestDraft`, `WritingSubmission`, `WritingSubmissionTask`, `WritingGradingResult`, `WritingTaskGradingResult`, `WritingAnnotation`, `AnnotationCategory`, `WritingGradingAudit`. Import `MaterialSoloConfig` from `solo.types.ts`. Copy the exact interface definitions from PRD §4.1.1 and §4.1.2 — do NOT modify field names or types.
  - [x] 1.2 Create `src/utils/ieltsWritingBandCalculator.ts` implementing the exact calculation rules from PRD §4.1.3: `roundDownToHalf()`, `roundOverallBand()`, `calculateTaskBand()`, `calculateOverallBand()`. Include JSDoc. Export all 4 functions.
  - [x] 1.3 Create `src/utils/ieltsWritingBandCalculator.test.ts` covering: (a) `roundDownToHalf`: 6.25→6.0, 6.5→6.5, 6.75→6.5, 7.0→7.0, 0→0, (b) `roundOverallBand`: 6.25→6.5, 6.24→6.0, 6.75→7.0, 6.0→6.0, (c) `calculateTaskBand`: {TA:7, CC:6, LR:7, GRA:5} → avg 6.25 → 6.0, (d) `calculateOverallBand`: Task1=6.0 ×1/3 + Task2=7.0 ×2/3 = 6.67 → 6.5, (e) single-task format, (f) voided task exclusion, (g) all tasks voided → 0, (h) partial grading.
  - [x] 1.4 Update `src/types/results.types.ts` (⚠️ PLURAL `results`). `EnhancedTestResultRecord` ALREADY has `writingSubmission`, `rubricScores`, `markingStatus`. **Reconciliation:** (a) Add NEW optional field: `writingData?: { submissionId: string; overallBand: number | null; markingStatus: 'pending-review' | 'graded'; tasks: Array<{ taskNumber: number; wordCount: number; activeTimeSeconds: number }> }`. (b) Keep existing `writingSubmission` and `rubricScores` unchanged. (c) Extend `markingStatus` to include `'graded'`. (d) Never remove existing fields.
  - [x] 1.5 Update `src/constants/routes.ts` — add: `TEACHER_WRITING_CREATE: '/teacher/writing-test/create'`, `TEACHER_WRITING_EDIT: '/teacher/writing-test/edit/:draftId'`, `TEACHER_GRADING_QUEUE: '/teacher/grading/writing'`, `TEACHER_GRADING_DETAIL: '/teacher/grading/writing/:submissionId'`. Add `submissionId?: string` to `RouteParams` interface.
  - [x] 1.6 Update `src/config/routeSecurity.ts` — add security config for the 4 new routes following existing teacher route patterns in the file.
  - [x] 1.7 Create `src/services/writingTestService.ts`. Follow the **`testDraftService`** pattern in `src/services/draftCloudService.ts` (lines 351-588). Methods: `saveWritingDraft(userId, draft)` → Firestore `writing_drafts/{draftId}` using `setDoc`. **[GAP-03] draftId generation:** if `draft.id` is not yet set, generate it using `doc(collection(db, 'writing_drafts')).id` (Firestore auto-ID) before calling `setDoc`. `getWritingDraft(draftId)` → `getDoc`, `updateWritingDraft(draftId, updates)` → `updateDoc` with `Timestamp.now()`, `deleteWritingDraft(draftId)` → `deleteDoc`, `getUserWritingDrafts(userId)` → `where('userId', '==', userId)` + `orderBy('updatedAt', 'desc')`. `publishWritingTest(draft)` → **[GAP-08] generate test ID** using `push(ref(database, 'tests')).key` (Firebase push ID) — this guarantees a chronologically-sortable unique ID. Set `id` field on the test object to this key. Write to RTDB `tests/{id}` with `skill: 'Writing'` using `set(ref(database, 'tests/' + id), ...)`. Use `deepRemoveUndefined()` from draftCloudService before writing. Return `{ success: boolean; error?: string }`.
  - [x] 1.8 Create `src/services/writingSubmissionService.ts`. **[GAP-14] Extract submit logic:** add a standalone `autoSubmitFromRTDB(sessionCode: string, studentUid: string, studentName: string, testData: IELTSWritingTest): Promise<void>` function — reads latest essay text from RTDB `game_sessions/{sessionCode}/students/{studentUid}/writing/` and runs the full submit flow from §3.8. This function is called by BOTH WritingTestPage (for normal submit) AND TeacherTestMonitorPage (for end-session auto-submit). Other methods: `createSubmission(data: WritingSubmission)` → Firestore `writing_submissions/{submissionId}` using `setDoc`, `getSubmission(submissionId)` → `getDoc`, `updateGrading(submissionId, gradingResult, annotations)` → `updateDoc`. `getPendingSubmissions(teacherId)`: **[GAP-04] Explicit filter pattern:** query Firestore `writing_submissions` with ONLY `where('markingStatus', '==', 'pending-review')`. Then filter client-side in JavaScript: `results.filter(s => s.grading?.teacherId === teacherId || s.context?.assigningTeacherId === teacherId || s.context?.selectedTeacherId === teacherId)`. Do NOT add additional Firestore `.where()` clauses for teacher fields — that would require a composite index and throw a runtime error. `getSubmissionsForStudent(studentId)` → `where('studentId', '==', studentId)`. Use `deepRemoveUndefined()` before Firestore writes. Use `withRestoreGuard()` for all write operations. Return `{ success: boolean; error?: string }`.
  - [x] 1.9 Update `firestore.rules` — add rules for: (a) `writing_submissions`: read if `request.auth != null && (resource.data.studentId == request.auth.uid || resource.data.grading.teacherId == request.auth.uid || ...)`, write if authenticated. (b) `writing_drafts`: read/write if `request.auth != null && resource.data.userId == request.auth.uid`. **[GAP-02] Also add:** (c) `users/{userId}/settings/{document=**}`: read/write if `request.auth != null && request.auth.uid == userId`. This covers the annotation category storage path. Model all three after existing collection rules in the file.
  - [x] 1.10 **[GAP-24]** Create `src/services/writingAnnotationService.ts`. Methods: `getCategories(teacherId: string): Promise<AnnotationCategory[]>` → reads from Firestore `users/{teacherId}/settings/writingAnnotationCategories` using `getDoc(doc(db, 'users', teacherId, 'settings', 'writingAnnotationCategories'))`, returns `snap.data()?.categories ?? []`, or `[]` if document does not exist. `saveCategories(teacherId: string, categories: AnnotationCategory[]): Promise<void>` → writes `{ categories }` to the same path using `setDoc(..., { categories }, { merge: true })`. Wrap `saveCategories` in `withRestoreGuard()`. This service is used by `CategoryManager.tsx` (task 5.6) and `WritingGradingPage.tsx` (task 5.9).

- [x] 2.0 Writing Test Builder (Teacher)
  - [x] 2.1 Create `WritingMetadataPanel.tsx` — Props: `value` and `onChange` for each field. Fields: title (`<input type="text">`, required), description (textarea, optional), duration (number input, minutes, default 60), format (3 `<input type="radio">` buttons: Task 1 Only / Task 2 Only / Full Test → values `'task1-only' | 'task2-only' | 'full-test'`), difficulty (`<select>`: beginner/intermediate/advanced), target band (number input, step 0.5), tags (comma-separated text input). NO Mantine.
  - [x] 2.2 Create `WritingTaskPanel.tsx` — Props: `taskNumber: 1 | 2`, `task: WritingTask & { _imageKey?: string }`, `onChange: (task: WritingTask & { _imageKey?: string }) => void`. Contains: task type dropdown, prompt textarea (max 2000 chars, live counter "X/2000"), image section (Task 1 ONLY): (a) `<input type="file" accept="image/jpeg,image/png,image/webp">` — validate ≤5MB, upload via `r2StorageService.uploadImage(file, 'images')` (temp/images/), on success call `onChange({ ...task, promptImageUrl: result.url, _imageKey: result.key })`. (b) "Or paste URL" text input → `onChange({ ...task, promptImageUrl: url, _imageKey: undefined })`. (c) Preview `<img>` when `task.promptImageUrl` exists. (d) Delete clears both `promptImageUrl` and `_imageKey`. 🔴 Import `r2StorageService` from `'../../services/r2Storage'`. Word minimum (defaults: 150/250), recommended time (defaults: 20/40), model answer (expandable textarea), model answer visibility checkbox.
  - [x] 2.3 Create `WritingValidationSummary.tsx` — Props: `validationState: { errors: string[]; warnings: string[] }`. Blocking errors (❌): empty title, zero duration, empty prompt, missing Task 1 image. Warnings (⚠️): model answer absent. Each item shows ✅ when satisfied.
  - [x] 2.4 Create `WritingTestBuilder.tsx` — assembles panels. **[GAP-07] URL param:** `const { draftId } = useParams<{ draftId: string }>()` — the param name `draftId` matches the route `:draftId` defined in Task 2.6. Layout: header (back button, title, Save Draft + Publish buttons, save status indicator). Task panels shown/hidden by format (hidden panels keep state — do NOT unmount them, use `display: none` via CSS). Validation summary. **[GAP-06] Auto-save:** use `useRef` for the debounce timer — NOT `useState`. Pattern: `clearTimeout(timerRef.current); timerRef.current = setTimeout(() => writingTestService.saveWritingDraft(...), 2000)`. The `useEffect` MUST return `() => clearTimeout(timerRef.current)` as cleanup. On edit mode mount: call `writingTestService.getWritingDraft(draftId)` and populate state.
  - [x] 2.5 Implement publish flow in WritingTestBuilder: (a) Validate — blocking errors: show list, block publish. Warnings only: show "Model answer not provided. Continue?" confirmation. (b) **Before calling publishWritingTest:** for each task with `_imageKey` where `r2StorageService.isTempFile(_imageKey)` is true: call `await r2StorageService.moveToPermanent(_imageKey)`, update `task.promptImageUrl = moved.newUrl`. Strip `_imageKey` from the draft (UI-only field). (c) Call `writingTestService.publishWritingTest(draft)`. (d) On success: dialog with 3 buttons: "Start Session" (`/sessions`), "Assign as Homework" (`/teacher/homework`), "Go to Test List" (`/sessions`).
  - [x] 2.6 Update `src/App.jsx` — add lazy import: `const WritingTestBuilder = lazy(() => import('./pages/WritingTestBuilder.tsx'));`. Add routes after line ~254: `<Route path="/teacher/writing-test/create" element={<PrivateRoute allowedRoles={['teacher']}><ErrorBoundary><WritingTestBuilder /></ErrorBoundary></PrivateRoute>} />` and `<Route path="/teacher/writing-test/edit/:draftId" element={<PrivateRoute allowedRoles={['teacher']}><ErrorBoundary><WritingTestBuilder /></ErrorBoundary></PrivateRoute>} />`.
  - [x] 2.7 Update `TestBuilderRouter.tsx` — in `skillAvailability`, set Writing to `available: true`, `component: WritingTestBuilder`, `status: 'production'`. Add lazy import at top.

- [x] 3.0 Student Writing Test Page (Live Session)
  - [x] 3.1 Create `WritingPromptPanel.tsx` — left panel (40% via `width: 40%; flex-shrink: 0`). Shows task header, recommended time, image (`<img>` if exists), prompt text, word minimum. Mobile: collapsible "📖 Show Prompt" floating button.
  - [x] 3.2 Create `WritingEditor.tsx` — Props: `value: string, onChange: (text: string) => void, disabled: boolean`. Plain `<textarea>` (`spellCheck={false}`, no format buttons, min-height 400px, Inter 16px, line-height 1.8). Live word counter: `text.trim().split(/\s+/).filter(w => w.length > 0).length`. **[GAP-09] Paste prevention hook:** must be called inside a `useEffect`: `useEffect(() => { if (textareaRef.current) return attachToTextarea(textareaRef.current); }, [])`. The return value of `attachToTextarea` IS the cleanup function — return it directly so React calls it on unmount. Do NOT call `attachToTextarea` in the render body or outside `useEffect`.
  - [x] 3.3 Create `useExternalPastePrevention.ts` — returns `{ pasteAttemptCount: number, attachToTextarea: (textarea: HTMLTextAreaElement) => () => void }`. Copy/cut events set `lastInternalCopy`. On paste: check clipboard text against `lastInternalCopy` (within 60s) — if match: insert internally; if mismatch: block + toast + increment counter. On drop: `preventDefault()` + toast. Return value of `attachToTextarea` is a cleanup function that removes all event listeners — used by `useEffect` in `WritingEditor` (see task 3.2).
  - [x] 3.4 Create `useActiveTimeTracking.ts` — Props: `taskCount: 1 | 2`. **[GAP-10] Important:** `taskCount` is derived from `testData.metadata.format` by the parent: `'full-test' ? 2 : 1`. This value is CONSTANT for the session lifetime — it does NOT change after mount. Use `useRef` for all tracking state. On `onKeystroke(taskN)`: start interval if not running, update `lastKeystrokeAt`. Interval checks 5-minute gap and pauses if exceeded. On `switchTask(taskN)`: save previous task's time. Return `{ getActiveTime, onKeystroke, switchTask }`. Clean up all intervals on unmount.
  - [x] 3.5 Create `useWritingAutoSave.ts` — debounced 3-second RTDB sync. RTDB paths: `game_sessions/{sessionCode}/students/{studentUid}/writing/task1`, `task2`, `activeTask`, `tabSwitches`. On tab switch: flush pending save immediately (cancel debounce, save now). `loadSavedState()` reads all fields and restores state on reconnect. Return `{ saveTask, saveActiveTab, loadSavedState, addTabSwitch }`.
  - [x] 3.6 Create `WritingSubmitModal.tsx` — native HTML/CSS. Props: `isOpen, onClose, onConfirm, tasks: Array<{ taskNumber: number; wordCount: number }>`. Shows word counts per task, Cancel and Submit buttons.
  - [x] 3.7 Create `WritingTestPage.tsx`. **[GAP-11] Props interface:** define at top of file:
    ```typescript
    interface WritingTestPageProps {
      testData: IELTSWritingTest;  // import from src/types/ielts-writing.types.ts
      sessionCode: string;
    }
    // Note: sessionCreatedBy is read from testData.createdBy
    // Note: studentId/studentName come from useAuth() hook
    ```
    **[GAP-12] Auth data:** `const { user } = useAuth()`. Use `user.uid` as `studentId`, `user.displayName || user.email` as `studentName`. Layout: TestHeader + TestTimer + tab bar (only tabs for test format) + split panel (WritingPromptPanel 40% + WritingEditor 60%). **[GAP-10]** Derive `taskCount` from `testData.metadata.format === 'full-test' ? 2 : 1` and pass to `useActiveTimeTracking`. Wire hooks: `useWritingAutoSave`, `useExternalPastePrevention`, `useActiveTimeTracking`. State: `activeTask: 1 | 2`, `essays: { 1: string, 2: string }`, `submitted: boolean`. Timer expiry → auto-submit. `beforeunload` warning if content exists. **Reconnect:** on mount call `autoSave.loadSavedState()` — restore essays + active tab; if timer expired during disconnect: auto-submit immediately. **Teacher reopen:** subscribe RTDB `game_sessions/{code}/students/{uid}/writing/reopened` — on `true`: toast + set `submitted = false`. **Multiple sessions:** each session = separate submission, no dedup.
  - [x] 3.8 Implement submit flow — extracted into `writingSubmissionService.autoSubmitFromRTDB()` (defined in Task 1.8). In `WritingTestPage`, on submit: (a) flush auto-save, (b) call `autoSubmitFromRTDB(sessionCode, user.uid, studentName, testData)`. This function: generates `resultId` via `push(ref(database)).key`, creates Firestore `writing_submissions/{resultId}` (embeds task prompt snapshots, sets `markingStatus: 'pending-review'`, `context.type: 'live-session'`), creates RTDB result at `test_results_by_student/{studentId}/{resultId}` with all required fields including `writingData`. (c) Show submitted overlay. (d) Auto-submit on timer expiry: same flow, skip modal.
  - [x] 3.9 Update `TestPageRouter.tsx` — add lazy import `const WritingTestPage = lazy(() => import('../components/writing-student/WritingTestPage'));`. In `case 'Writing'`: fetch full test from RTDB `tests/{testId}` (same pattern as THCS ~line 86). Render with Suspense — **[GAP-13] NO Mantine:** fallback must NOT use Mantine's `<Center>` or `<Loader>`. ⚠️ Do NOT use `LoadingState` from `src/components/common/LoadingState.tsx` either — it wraps Mantine `Loader`, `Center`, `ThemeIcon` internally. Instead use a pure CSS inline spinner: `<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid rgba(59,130,246,0.15)', borderTopColor: '#3b82f6', animation: 'spin 1s linear infinite' }} /><style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style></div>`. This pattern is already used across the codebase (see `TeacherLobbyPage.jsx:1052`, `THCSTestEditorPage.tsx:495`, `ConnectionMonitor.tsx:182`).

- [x] 4.0 Teacher Test Monitor (Writing-Specific)
  - [x] 4.1 Create `WritingMonitorCard.tsx` — Props: `sessionCode, studentUid, studentName, testFormat`. Shows per-task word counts, status badges, "👁️ Peek" button. Subscribe to RTDB `game_sessions/{sessionCode}/students/{studentUid}/writing/` via `onValue()`. "Active" = `lastSavedAt` within last 5 minutes. Native HTML/CSS only.
  - [x] 4.2 Create `WritingPeekModal.tsx` — read-only essay from RTDB, real-time via `onValue()`. Tabs per test format. Native HTML/CSS modal.
  - [x] 4.3 Update `TeacherTestMonitorPage.tsx` — when `test.skill === 'Writing'`: render `WritingMonitorCard` per student instead of default card. Add "Reopen" button (writes RTDB flag + sends notification). **[GAP-14] End session auto-submit:** when teacher ends session, read the student list from RTDB `game_sessions/{sessionCode}/students/`, filter those without `writing.submitted === true`, and for each call `writingSubmissionService.autoSubmitFromRTDB(sessionCode, studentUid, studentName, testData)`. Do NOT implement the submission logic inline — use the service function defined in Task 1.8.

- [x] 5.0 Grading System
  - [x] 5.0.1 **Prerequisite — install TipTap:** `npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-bold @tiptap/extension-italic @tiptap/extension-bullet-list @tiptap/extension-ordered-list @tiptap/extension-placeholder`. Required before task 5.5.
  - [x] 5.1 Create `WritingGradingQueuePage.tsx` — query Firestore `writing_submissions` with `where('markingStatus', '==', 'pending-review')`, client-side filter for teacher. Submission cards show: student name ("[Deleted Student]" if deleted), format chip, word count, title, context badge, time, paste attempts (⚠️ if >0), "Grade →" button. Filter dropdown (All/Live/Homework/Solo), sort dropdown. Deleted student: "📦 Archive" + "🗑️ Discard" with confirmation. Pagination: 20 per load, "Load More".
  - [x] 5.2 Create `CriteriaScoringPanel.tsx` — Props: `taskNumber, scores, onChange, isVoided`. Criteria in order: TA (Task 1) / TR (Task 2), CC, LR, GRA. 10 buttons (0-9) per criterion. Click toggles — deselect sets to null. Live task band via `calculateTaskBand()`. Voided = grayed out. Colors: TA/TR blue, CC green, LR orange, GRA red.
  - [x] 5.3 Create `AnnotationToolbar.tsx` — Props: `selectedText: { text: string; startOffset: number; endOffset: number } | null, annotations, onAddAnnotation, categories`. Buttons: Highlight, Comment (popup textarea), Strikethrough, Correction (popup textarea), Text Color. Category chips (4 IELTS defaults + customs). "[+ Add]" inline form. **Text selection:** parent `WritingGradingPage` tracks selection and passes it as `selectedText` prop. When user clicks a toolbar button: create `WritingAnnotation` with `id: crypto.randomUUID()`, offsets from `selectedText`, type, color from active category, `createdAt: Date.now()`.
  - [x] 5.4 Create `src/utils/annotationRenderer.ts` — **[GAP-16] REQUIRED shared utility.** Export function `renderAnnotatedText(essayText: string, annotations: WritingAnnotation[], options: { readOnly: boolean; onAnnotationClick?: (a: WritingAnnotation) => void; onAnnotationDelete?: (id: string) => void }): React.ReactNode[]`. Algorithm: (a) Sort annotations by `startOffset`. (b) Walk text building segments at each annotation boundary. (c) Per segment: apply overlapping annotation styles as combined `<span>`: highlight → `background-color: {color}33`, strikethrough → `text-decoration: line-through`, correction → strikethrough + `<sup>` with green replacement, textColor → `color: {color}`, comment → `border-bottom: 2px dotted; cursor: pointer`. (d) Comment click → tooltip; correction click → show replacement. (e) `readOnly: false` → show "×" delete button on hover. (f) Overlapping annotations: apply all styles to same `<span>`. Then create `AnnotatedEssayRenderer.tsx` which imports and calls `renderAnnotatedText()` — no annotation logic in the component itself, only wrappers.
  - [x] 5.5 Create `FeedbackPanel.tsx` — TipTap editors per criterion + overall. `onChange` emits HTML via `editor.getHTML()`.
  - [x] 5.6 Create `CategoryManager.tsx` — on mount with empty categories: auto-populate 4 IELTS defaults, save via `writingAnnotationService.saveCategories(teacherId, defaults)` (from Task 1.10). Render chips. Default categories: lock icon, no delete. Custom: "×" delete. "[+ Add]" inline form → `writingAnnotationService.saveCategories()` on save.
  - [x] 5.7 Create `VoidTaskButton.tsx` — void flow: expand textarea (min 10 chars), confirm. Unvoid: show undo.
  - [x] 5.8 Create `GradingAuditTrail.tsx` — collapsible section, newest entry first, table of previous scores per entry.
  - [x] 5.9 Create `WritingGradingPage.tsx` — `submissionId` from `useParams()`. Load submission via `writingSubmissionService.getSubmission()`. **[GAP-17] Load annotation categories:** `const snap = await getDoc(doc(db, 'users', teacherUid, 'settings', 'writingAnnotationCategories')); const categories: AnnotationCategory[] = snap.exists() ? snap.data().categories ?? [] : [];`. Layout: header (back to queue, student name, task tabs, Save Draft + Submit buttons), left panel 55% (prompt collapsed by default, `AnnotatedEssayRenderer`, `AnnotationToolbar`, metadata line, model answer toggle), right panel 45% (`CriteriaScoringPanel`, `FeedbackPanel`, `VoidTaskButton`, `GradingAuditTrail`). Sticky bottom bar: overall band, prev/next submission buttons. **[GAP-15] Selection tracking:** add in `useEffect`:
    ```typescript
    const handleSelectionChange = () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setSelectedText(null); return;
      }
      if (!essayContainerRef.current?.contains(selection.anchorNode)) {
        setSelectedText(null); return;
      }
      // Compute character offsets within the full essay string
      const range = selection.getRangeAt(0);
      const preRange = range.cloneRange();
      preRange.selectNodeContents(essayContainerRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = preRange.toString().length;
      const endOffset = startOffset + range.toString().length;
      setSelectedText({ text: selection.toString(), startOffset, endOffset });
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
    ```
    Pass `selectedText` state as prop to `AnnotationToolbar`. Auto-save every 30 seconds (scores, annotations, feedback) without changing `markingStatus`. `beforeunload` if unsaved. Re-grading: "Edit Grades" button if already graded, confirmation modal with required reason textarea, save to `auditTrail[]`.
  - [x] 5.10 Implement "Submit Grading" in WritingGradingPage: (a) Validate: at least one task with all 4 criteria non-null. (b) Calculate bands. (c) Update Firestore: `markingStatus: 'graded'`, grading object. (d) Update RTDB result: `writingData.overallBand`, `markingStatus: 'graded'`, `bandScore`. (e) Send notification via `writingSubmissionService` / notificationService (wrapped in `withRestoreGuard()`). (f) Navigate to next ungraded. Partial grading: overall = scored task's band. Full completion: 1/3 + 2/3 weighting, save partial to `auditTrail[]`.
  - [x] 5.11 Update `src/App.jsx` — lazy imports + routes already present. — add lazy imports for `WritingGradingQueuePage` and `WritingGradingPage`. Add routes after line ~254 with `<PrivateRoute allowedRoles={['teacher', 'super_admin']}>`.
  - [x] 5.12 Update `src/components/TeacherNavigation.tsx` — added ✍️ Writing nav button next to Grading. — add new nav item: icon ✍️, label "Writing Grading", path `/teacher/grading/writing`. Follow the exact structure of existing nav items in that file. Add a badge showing count of pending submissions (query Firestore on mount via `writingSubmissionService.getPendingSubmissions(teacherUid).length`). Place adjacent to any existing grading link (THCS grading at `/teacher/grading`).

- [x] 6.0 Results & Review
  - [x] 6.1 Create `WritingResultView.tsx` — Props: `submission: WritingSubmission`. 3 states: (A) `pending-review`: banner + summary + read-only essay via `AnnotatedEssayReadOnly` (empty annotations). (B) Partially graded: scored task shows criteria, unscored shows pending. (C) Fully graded: band in large text, criteria + feedback, annotated essay, model answer if `showModelAnswerToStudent === true`. Render feedback HTML via `dangerouslySetInnerHTML`. **[GAP-19]** Integration: In `src/pages/StudentTestResultsPage.tsx` (the main student results page), locate where results are rendered for a completed test. When `resultData.testSkill === 'writing'`, fetch submission from Firestore via `writingSubmissionService.getSubmission(resultData.writingData.submissionId)`, then render `<WritingResultView submission={submission} />`. Add this as sub-task 6.1.1 and implement it after creating the component.
  - [ ] 6.1.1 Integrate `WritingResultView` into `StudentTestResultsPage.tsx` — when `resultData.testSkill === 'writing'`, fetch submission from Firestore via `writingSubmissionService.getSubmission(resultData.writingData.submissionId)`, then render `<WritingResultView submission={submission} />`.
  - [x] 6.2 Create `AnnotatedEssayReadOnly.tsx` — read-only variant. **[GAP-16]** MUST import and call `renderAnnotatedText()` from `src/utils/annotationRenderer.ts` with `readOnly: true`. Do NOT copy the rendering algorithm — reuse the shared utility. Comment click shows tooltip at click position.
  - [x] 6.3 Create `CriteriaScoreChart.tsx` — CSS-only horizontal bar chart (no external chart lib). Per criterion: `width: {(score/9)*100}%`, height 24px, border-radius 4px. Full test: two bars per criterion (Task 1 + Task 2). "Voided" label when applicable.
  - [x] 6.4 Create `WritingResultDetailModal.tsx` — teacher modal: `CriteriaScoreChart`, overall band, per-task table, `AnnotatedEssayReadOnly`, feedback, `GradingAuditTrail`. "Edit Grades" → `useNavigate()` to `/teacher/grading/writing/{submissionId}`.
  - [x] 6.5 Update `TeacherTestResultsPage.tsx` — when `skill === 'Writing'`: writing-specific columns (Student, Overall Band, T1 Band, T2 Band, Status, Submitted At). Row click → `WritingResultDetailModal` (fetch submission from Firestore by `writingData.submissionId`). Created `WritingTestResultsSection` + `getSubmissionsBySession()` service function.
  - [x] 6.6 WebMCP Tools — added: `get_writing_test_results`, `open_writing_result_detail`, `get_writing_result_state`.

- [ ] 7.0 Solo Practice & Homework Integration
  - [ ] 7.1 Create `WritingPracticeView.tsx` — same layout as WritingTestPage. Differences: timer optional (from `testData.soloConfig?.defaults?.timerMinutes`), word minimum enforcement on submit (warning only in solo), auto-save to localStorage key `writing_practice_{materialId}_{studentUid}`, resume via `SoloResumeModal` (import from `src/components/test/SoloResumeModal.tsx`), submit button opens `SubmitToTeacherModal`. External paste prevention + active time tracking: same hooks as live session. Unlimited submissions — never check for existing ones. **[GAP-20] Fetch enrolled teachers:** before rendering `SubmitToTeacherModal`, load the student's enrolled classes by explicitly importing `getStudentClasses` from `src/services/classManager.ts` and calling `getStudentClasses(user.uid)`. Map the results to extract the `teacherId` and `teacherName` from each class document. Create an `Array<{ id: string; name: string }>` and pass as `studentTeachers` prop to `SubmitToTeacherModal`.
  - [ ] 7.2 Create `SubmitToTeacherModal.tsx` — `<select>` of enrolled teachers (auto-selected if only 1, still shown disabled). Optional note textarea. Word count summary. Submit → parent saves to Firestore as `context.type: 'solo-practice'`, creates RTDB index, sends notification to teacher, clears localStorage, shows toast. No-teacher case: save without `selectedTeacherId`, show "saved for self-review" message.
  - [ ] 7.3 Update `StudentPracticePage.tsx` — in `initialize()` (~line 77-115), after fetching test data: if `testData.skill === 'Writing'`, set state `testType = 'writing'`. In render: add `if (testType === 'writing') return <WritingPracticeView ... />` BEFORE the existing IELTS/THCS branches.
  - [ ] 7.4 Update `HomeworkCreateModal.tsx` — in material list rendering: add ✍️ icon for writing tests. When selected material `skill === 'writing'`: show writing-specific homework config fields (word minimum toggle + input, timer toggle + minutes, late submission policy radio, max attempts). Save these to the homework document.
  - [ ] 7.5 Implement homework writing view — `WritingPracticeView` checks `isHomework` flag from location state. **[GAP-21] Ensure the flag is set:** In `src/pages/StudentHomeworkListPage.tsx` where the student clicks a homework item (find `handleStartHomework`), ensure the `navigate()` call includes `state: { isHomework: true, homeworkId: homework.id, submissionId: latestSubmission.id }`. Note: The actual `WritingPracticeView` component will use `useHomeworkSubmission` hook with this `homeworkId` to fetch the due date, assigning teacher, etc., so you do NOT need to pass those in the navigate state. Ensure the routing behavior matches existing test behavior.
  - [ ] 7.6 Update `StudentLibraryPage.tsx` — verify writing tests load from RTDB `tests/` (they should, as they're stored under `tests/{id}` with `skill: 'Writing'`). Add ✍️ icon in test cards for writing tests. "Practice" button → `/student/practice/{testId}` (same as other tests).

- [ ] 8.0 Notifications & Academic Record
  - [ ] 8.1 Add to `src/services/notificationService.ts` — new functions, ALL wrapped in `withRestoreGuard()` following the pattern of `createNotification` (lines 17-52): `sendWritingSubmittedNotification`, `sendWritingGradedNotification`, `sendWritingPartiallyGradedNotification`, `sendWritingReopenedNotification`, `sendWritingReGradedNotification`. Update `notification.types.ts` if a type union exists.
  - [ ] 8.2 Create `WritingProgressSection.tsx` — fetches writing results from RTDB `test_results_by_student/{studentId}` filtered by `testSkill === 'writing'`. CSS line chart (dots connected by lines) for graded results only. Per-criteria average table. Stats row. Recent submissions list with amber "Pending" badge (excluded from chart/stats).
  - [ ] 8.3 Update `AcademicRecordPage.tsx` — add new tab `{ value: 'writing', label: 'IELTS Writing' }` (around line 64-71). Add case in `renderContent()` (around line 139-202): `case 'writing': return <WritingProgressSection studentId={user.uid} />`. Import `WritingProgressSection` at top.
  - [ ] 8.4 Create `PendingReviewsWidget.tsx` — RTDB `onValue()` subscriber for writing results. Shows max 5 items, "View All" link. Empty state "No pending reviews".
  - [ ] 8.5 Add `PendingReviewsWidget` to `StudentDashboardPage.jsx`. **[GAP-22]** Open `src/pages/StudentDashboardPage.jsx`. Locate the `renderRightPanel()` function. Place `<PendingReviewsWidget studentId={user.uid} />` at the bottom of the column as an explicit sibling component. Wrap it in a `div` carrying the existing widget style: `<div style={S.widget}>...</div>` using `S` imported from `studentLayoutStyles`. Do NOT use non-existent CSS classes like "white-box" or "card".
