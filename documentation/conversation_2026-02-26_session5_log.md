# Conversation Log — 2026-02-26 Session 5

**Started:** 2026-02-26T17:52 (UTC+7)

---

## 1. Assess Task List for PRD-0028 (Phase 2 THCS-THPT Test System)

**User Request:** Assess `tasks-0028-prd-thcs-thpt-test-system-phase2.md` against `0028-prd-thcs-thpt-test-system-phase2.md` for comprehensiveness and detail for an inexperienced junior developer. Report only, no edits.

### Actions Taken:
1. Read full PRD (1003 lines) and task list (152 lines)
2. Cross-referenced with actual codebase files:
   - `src/types/thcs-test.types.ts` (283 lines) — verified data model
   - `src/services/thcsAutoMarking.service.ts` — verified grading function signatures
   - `src/services/ai/router.service.ts` — verified AI service architecture
   - `src/services/ai/ai.service.ts` — verified IAIService interface
   - `src/services/thcsTestStorage.ts` — verified storage imports and functions
   - `src/App.jsx` (310 lines) — verified route guard patterns
   - `src/components/navigation/TeacherHeader.tsx` — verified mobile menu pattern
   - `src/hooks/thcs/useThcsValidation.ts` — verified validation hook
   - `src/services/notificationService.ts` — verified notification patterns
3. Produced comprehensive assessment report

### Findings:
- **9 Critical Issues** — Would cause bugs, TypeScript errors, or implementation failures
- **11 Moderate Issues** — Could cause confusion or incorrect implementation  
- **8 Minor Issues** — Cosmetic or minor gaps
- **Overall coverage: ~85%** — Good structure but critical gaps exist

### Output:
- Assessment report: `brain/a5ec522c-6435-4b80-86b3-8e440a0074b6/assessment-tasks-0028.md`

### Files Read (not modified):
- `documentation/tasks/0028-prd-thcs-thpt-test-system-phase2.md`
- `documentation/tasks/tasks-0028-prd-thcs-thpt-test-system-phase2.md`
- `src/types/thcs-test.types.ts`
- `src/services/thcsAutoMarking.service.ts`
- `src/services/ai/router.service.ts`
- `src/services/ai/ai.service.ts`
- `src/services/thcsTestStorage.ts`
- `src/App.jsx`
- `src/components/navigation/TeacherHeader.tsx`
- `src/hooks/thcs/useThcsValidation.ts`

---

## 2. Amend Task List Based on Assessment

**User Request:** Apply all fixes from the assessment report to the task list.

### Actions Taken:
1. Re-read both the task list (152 lines) and assessment (403 lines) 
2. Applied all 28 fixes (9 Critical + 11 Moderate + 8 Minor) via full file rewrite
3. Task list grew from 152 lines to ~195 lines due to added detail

### Key Changes Applied:

**Critical fixes (C-1 through C-9):**
- C-1: Route now includes `<ErrorBoundary>` wrapper, exact placement anchor specified (after THCS editor routes line 249)
- C-2: `allowedRoles` now `['teacher', 'super_admin']` in both route and test
- C-3: Task 5.4 now explicitly says to change `studentAnswers` param type
- C-4: Task 4.6 now specifies exact new signature for `saveAnswersToRTDB` and ref type
- C-5: Task 7.9 now says to check for notification type union before adding
- C-6: Task 1.1(a) now makes `intent` optional for Phase 2 types
- C-7: Created explicit `WritingGradingTier` type with 7 values and mapping table in Task 6.5
- C-8: Task 2.3 clarifies: one `THCSQuestion` per cloze section, blanks are sub-items
- C-9: Task 9.2 now explicitly says to add `runTransaction` to import

**Moderate fixes (M-1 through M-11):**
- M-1: Task 4.5(b) now has full interval implementation details (ref, cleanup, memoized question list, preview mode skip)
- M-2: Task 7.4 now specifies Firestore query, onSnapshot listener, hide-when-zero behavior
- M-3: Task 6.5 now says "implement in-house, do NOT install"
- M-4: Task 8.1 now specifies where to read testType + data path
- M-5: Task 2.4(d) now lists ALL Phase 2 fields to clear (11 fields)
- M-6: Task 9.3 now specifies detection method (check `snapshot.exists()` + `publishedAt`)
- M-7: Task 6.6 now has full method signature, interface location, provider implementations, router proxy
- M-8: Task 1.7 added `isCustomLayout` to THCSSection; Task 11.1 uses it
- M-9: Task 5.5 now handles edge cases (writing-only tests, score during partial grading)
- M-10: Task 10.2 now has full conversion helper with mock field values
- M-11: Task 1.4 now lists exact downstream usages needing update

**Minor fixes (m-1 through m-8):**
- m-1: Task 7.5 now says "insert at index 4, BEFORE students item"
- m-2: Task 1.5 now creates unified `ALL_INSTRUCTION_TEMPLATES` constant
- m-4: Added `THCSPassagePanel.tsx` to Relevant Files as VERIFY
- m-5: Added note that UI component testing not required for renderers
- m-6: Task 9.5 clarifies "Show all" is a UI toggle, not lazy-load
- m-7: Task 6.5(f) now includes PRD EC4 starter-text stripping
- m-8: New Task 1.6 changes `SectionResult.intentBreakdown` key type
- Added `aria-label` specs to Tasks 4.2 and 4.3

### Files Modified:
- `documentation/tasks/tasks-0028-prd-thcs-thpt-test-system-phase2.md` — full rewrite with all fixes

---

## 3. Assess Junior's Evaluation of Task List

**User Request:** Assess the junior developer's 7-point evaluation of the current task list.

### Findings:
| # | Claim | Verdict |
|---|---|---|
| 1 | Missing AI grading trigger | ✅ VALID |
| 2 | Missing file for assignment pinning | ✅ VALID |
| 3 | Missing two-way sync | ❌ INVALID (React props/callbacks pattern handles this) |
| 4 | Cloze duplicate word rendering | ⚠️ PARTIALLY VALID |
| 5 | Missing AI button loading state | ✅ VALID |
| 6 | Answer vs QuestionResult confusion | ⚠️ PARTIALLY VALID |
| 7 | Object.keys TS type issue | ✅ VALID |

**Score:** 4 valid, 2 partially valid, 1 invalid out of 7

### Output:
- `brain/a5ec522c-.../junior-evaluation-assessment.md` — Full assessment with reasoning

---

## 4. Apply 6 Junior-Evaluation Amendments to Task List

**User Request:** Apply the fixes identified in the junior evaluation assessment.

### Amendments Applied:
1. **Task 2.1(d)** — Added `isGeneratingSuggestions` loading state for AI suggest button (disable + spinner while loading)
2. **Task 2.2(e)** — Cross-referenced Task 2.1(d) pattern for same loading state
3. **Task 2.3(g)** — Added explicit note: "word × count" is render-only decoration, do NOT mutate `wordBank[]`
4. **Task 4.6** — Added data separation note: raw answers vs grading objects are different RTDB paths
5. **Task 5.4** — Changed MCQ detection from `Object.keys().includes()` to `question.type in INSTRUCTION_TEMPLATES`
6. **NEW Task 5.7** — Added explicit AI writing grading trigger: fire-and-forget async call after submission
7. **Task 9.6** — Added exact file (`sessionManager.js`) and function (`assignTestToStudents()`) references

### Files Modified:
- `documentation/tasks/tasks-0028-prd-thcs-thpt-test-system-phase2.md` — 6 amendments applied

---

## 5. Implementation — PRD-0028 Phase 2

**User Request:** Implement `tasks-0028-prd-thcs-thpt-test-system-phase2.md` using `process-task-list.md` protocol.

**Starting with:** Task 1.0 — Data Model Extension & Type System Updates

### Progress:
- Starting Task 1.1 — THCSQuestion interface changes

---

## 6. Phase 3 Task List Assessment (Report Only)

**User Request:** Assess `tasks-0029-prd-thcs-thpt-test-system-phase3.md` against PRD `0029-prd-thcs-thpt-test-system-phase3.md` and `phase3-implementation-notes.md` for junior-readiness. Report only, MUST NOT edit.

### Actions Taken:
1. Read full task list (491 lines, 12 task groups)
2. Read full PRD (1405 lines, 12 goal areas)
3. Read implementation notes (133 lines, 5 gotchas + 4 patterns)
4. Cross-referenced all PRD requirements with task coverage
5. Checked edge case coverage (PRD §9 — 17 edge cases)
6. Produced comprehensive assessment report

### Findings:
- **Overall Score: 8/10**
- **8 Critical Issues** (must fix before handing to junior)
- **12 Moderate Issues** (should fix for clarity)
- **9 Minor Issues** (nice to have)
- **PRD Edge Case Coverage: 12/17** (70%)

### Key Critical Gaps:
- C1: Task 2.3 missing homework dialog file path
- C2: Task 2.6 missing page/route integration for THCSHomeworkLayout
- C3: Task 1.4+2.6 missing maxAttempts + feedbackTiming in thcsConfig
- C4: Task 2.7 late submission policy enum confusion
- C5: Task 4.4 missing linked reference data model
- C6: Task 5.2 routes to wrong component (THCSTestLayout vs THCSHomeworkLayout)
- C7: Task 6.3 shuffle only in THCSTestLayout, not in homework/course modes
- C8: Task 10.8 contradicts PRD conversion code for passage data

### Output:
- Assessment report: `brain/af62ffd0-.../phase3-tasklist-assessment.md`

### Files Read (not modified):
- `documentation/tasks/tasks-0029-prd-thcs-thpt-test-system-phase3.md`
- `documentation/tasks/0029-prd-thcs-thpt-test-system-phase3.md`
- `documentation/tasks/phase3-implementation-notes.md`

---

## 7. Amend Phase 3 Task List Based on Assessment

**User Request:** Apply all fixes from the assessment report to the task list.

### Actions Taken:
1. Re-read both task list (491 lines) and assessment (370 lines)
2. Verified codebase context: searched for HomeworkAssignDialog (doesn't exist), getThcsTestFromFirebase (exists in thcsTestStorage.ts), chart library (recharts via ProgressLineChart.tsx/SkillRadarChart.tsx), homework routes in App.jsx (line 292: /student/homework/:homeworkId → StudentHomeworkDetailPage)
3. Applied all 29 fixes across 5 batched multi_replace_file_content calls

### Fixes Applied:

**Critical (C1-C8):**
- C1: Specified `THCSHomeworkAssignDialog.tsx` as new component + Rule 8 integration note
- C2: Added Task 2.6a — page integration via StudentHomeworkDetailPage.tsx + Rule 2
- C3: Added maxAttempts, feedbackTiming, instructions to thcsConfig + attempt counting + feedback timing logic
- C4: Clarified all 4 late policy enums with explicit behavior comments
- C5: Full linked reference data model with `users/{uid}/thcs_linked_tests/` + Firestore rules + My Content query update
- C6: Changed course routing from THCSTestLayout → THCSHomeworkLayout + EC10 edge case
- C7: Shuffle now applied in ALL 3 modes (live, homework, course) + EC7 edge case
- C8: Added "IGNORE PRD §4.12.7 conversion code" note to passage data warning

**Moderate (M1-M12):**
- M1: Added maxAttempts, feedbackTiming, instructions, scheduling note to thcsConfig
- M2: Added `from src/services/thcsTestStorage.ts (already exists from Phase 1)` to version pinning
- M3: Specified exact grading entry points + TeacherTestMonitorPage check
- M4: Clarified client-side primary, server-side >50 results
- M5: Added image detection fields, copy method, URL update, failure handling
- M6: Added isPublic justification note in Task 7.3
- M7: Changed DnD extraction from "like" to "MUST create"
- M8: Added @dnd-kit/modifiers to npm install
- M9: Added AI error handling (catch, log, keep regex results, show warning)
- M10: Specified yellow banner for informational timer expiry
- M11: Added Firestore query guidance referencing getHomeworkForStudent()
- M12: Specified recharts + ProgressLineChart.tsx + SkillRadarChart.tsx references

**Minor (N1-N9):**
- N1: Added PowerShell grep equivalent
- N2: Added Firestore rules verification note for homework_submissions
- N3: Added blanket withRestoreGuard note for all 6 notifications
- N4: Added loading/empty states for library cards
- N5: Clarified remapAnswerKey usage inside shuffleTest
- N6: Changed Upload Document to placeholder in Task 7.5
- N8: Converted Task 8.4 to verification checkpoint (not duplicate)
- N9: Specified live session + homework trigger locations for academic record

**Edge Cases Added:**
- EC4: Template point calculation validation
- EC7: Shuffle with 1 question (silently skip)
- EC10: Mixed IELTS+THCS in same course
- EC11: Notification spam batching (debounce 10s)
- EC15: Third answer key format (table-extracted)

### Files Modified:
- `documentation/tasks/tasks-0029-prd-thcs-thpt-test-system-phase3.md` — 29 amendments applied

---

## 8. Assess Junior's Evaluation of Phase 3 Task List

**User Request:** Assess junior's 9-point critique of the amended task list. Report only, no edits.

### Findings:
| # | Claim | Verdict |
|---|---|---|
| 1 | Course mode crashes on missing homeworkId | ✅ VALID |
| 2 | Missing teacherId prop for late notification | ✅ VALID |
| 3 | AI Polish JSON schema undefined | ⚠️ PARTIALLY VALID |
| 4 | Target students resolution for notifications | ⚠️ PARTIALLY VALID |
| 5 | Answer key parser restricts to MCQ only | ❌ INVALID |
| 6 | Checkbox controlled state warning | ✅ VALID |
| 7 | attemptNumber calculation ambiguous | ⚠️ PARTIALLY VALID |
| 8 | Partial grading + after-submission feedback UI | ✅ VALID |
| 9 | Question ID generation in bulk/template | ✅ VALID |

**Score:** 5 valid, 3 partially valid, 1 invalid out of 9

### Output:
- Assessment report: `brain/af62ffd0-.../junior-evaluation-phase3.md`

---

## 9. Apply Junior Evaluation Amendments to Phase 3 Task List

**User Request:** Amend the task list based on evaluating the junior's 9-point critique.

### Amendments Applied (8 of 9 — #5 was invalid):

1. **#1 (Course mode crash):** THCSHomeworkLayout now has `mode: 'homework' | 'course-standalone'` prop. `homeworkId` changed to optional. Full TypeScript interface defined. Conditional write path: homework → `homework_submissions/`, course → `testResults/` + course progress. Task 5.2 updated with `course-standalone` render code.
2. **#2 (teacherId missing):** Added `teacherId: string` to props interface. Task 2.6a updated with explicit JSX showing `teacherId={assignment.createdBy}`. Task 5.2 updated with `teacherId={course.teacherId}`.
3. **#3 (AI schema):** Added full `AIClassificationInput` and `AIClassificationOutput` TypeScript interfaces to Task 10.4. Added JSON parseability check and confidence comparison rule.
4. **#4 (Student ID resolution):** Added note to Task 3.7 trigger for 3.1 specifying roster resolution with `getStudentsInClass()` / `getStudentsInCourse()`.
5. **#6 (Checkbox fallback):** Added `checked={section.shuffle ?? false}` guidance to Task 6.2 with React controlled input warning explanation.
6. **#7 (attemptNumber):** Changed from "which attempt this is" to explicit formula `existingSubmissionsCount + 1` with cross-reference to Task 2.6 step 8.
7. **#8 (Partial grading UI):** Added full partial grading display spec to Task 2.6 step 9: show MCQ scores + pending badges + tentative score with note.
8. **#9 (Question IDs):** Added `crypto.randomUUID()` requirement to Task 8.1 and Task 7.5 with dnd-kit rationale.

### Files Modified:
- `documentation/tasks/tasks-0029-prd-thcs-thpt-test-system-phase3.md` — 8 amendments applied
