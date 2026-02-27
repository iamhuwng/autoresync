# Conversation Log — 2026-02-26

## 1. Crosscheck: THCS Test System Sample PRD → PRD-0027 Phase 1

**Time:** 11:13 AM
**Request:** Crosscheck the sample PRD conversation (documentation/samples/THCS Test System PRD.md) against the generated task PRD (documentation/tasks/0027-prd-thcs-thpt-test-system-phase1.md) to verify faithful coverage of all requirements, decisions, and needs.

### Actions Taken
1. Read full sample PRD conversation (1713 lines, 6 rounds, 55+ decisions)
2. Read full PRD-0027 Phase 1 (1010 lines)
3. Systematically crosschecked every user decision (Q1-Q55) against PRD sections
4. Identified edge cases, conflict solutions, and phasing decisions
5. Created comprehensive crosscheck artifact

### Findings
- **Overall:** ~92% faithful, 6 gaps identified (3 moderate, 3 minor)
- **Fully Covered:** Task taxonomy, data model, editor behaviors, student view, grading, results, storage, versioning
- **Gaps Found:**
  - 🔴 Phase 2/3 pre-decisions not recorded (Q33d, Q34d, Q55d, Q31e/f, Conflict 6, EC8)
  - 🔴 EC11 (delta changelog race condition) not in edge cases table
  - 🔴 "Create Custom Instruction" CTA not in editor spec
  - ⚠️ Sticky passage header for single-column mode not mentioned
  - ⚠️ Section points auto-default behavior not described
  - ⚠️ "No subsections" not explicitly stated in Non-Goals

### Artifact Created
- `crosscheck_prd_vs_sample.md` — Full crosscheck analysis

## 2. Apply Crosscheck Fixes to PRD-0027

**Time:** 11:20 AM
**Request:** Apply all identified gaps from the crosscheck to PRD-0027.

### Changes Applied (v1.1 → v1.2)
1. **Sticky passage header** — Added to §4.3.4 and §9 EC10: passage title + first line pinned at top when scrolling in single-column mode
2. **Section points auto-default** — Fixed §9 EC14: default to "auto" calculated value, not 0
3. **No subsections** — Added item #22 to §5 Non-Goals: explicit statement that subsections are not supported
4. **Changelog race condition** — Added EC15 to §9: RTDB transactions + optimistic lock for concurrent edits
5. **Phase 2/3 Pre-Decisions** — Added §11 with 8 Phase 2 decisions and 12 Phase 3 decisions from the Socratic conversation, all locked and cross-referenced by question number
6. **Two-column mobile behavior** — Clarified "collapses to single-column on < 768px"

### Files Modified
- `documentation/tasks/0027-prd-thcs-thpt-test-system-phase1.md` — Version bumped to 1.2

## 3. Generate Tasklist from PRD-0027

**Time:** 11:35 AM
**Request:** Generate detailed tasklist following `documentation/tasks/generate-tasks.md` workflow.

### Process
1. Read generate-tasks.md workflow
2. Analyzed codebase: testStorage.ts, draftCloudService.ts, autoMarking.service.ts, TestTypeSelectionModal.tsx, StudentTestPage.tsx, testResults.service.ts, routes.ts, draft.types.ts, firestore.rules, useTestData.ts, useTestSession.ts
3. Generated 7 parent tasks → user approved
4. Generated detailed sub-tasks with exact file paths, function signatures, interface fields, and code snippets

### Tasklist Structure (7 parent tasks, 47 sub-tasks)
1. **Data Model & Type Definitions** (6 sub-tasks) — types, constants, union updates
2. **Infrastructure — Services & Storage** (5 sub-tasks) — draft service, test storage, auto-marking, firestore rules, tests
3. **Route Registration & Entry Points** (3 sub-tasks) — routes, App.jsx, TestTypeSelectionModal activation
4. **Visual Editor Page** (13 sub-tasks) — editor shell, metadata, sections, questions, pronunciation, error-id, answer key, validation, auto-save, publish, duplication
5. **Student Test-Taking View** (8 sub-tasks) — THCSTestLayout, section nav, question renderer, passage panel, submit confirmation, auto-save, timer
6. **Auto-Grading & Results** (3 sub-tasks) — grading flow, saveTestResult extension, results page
7. **Teacher Lobby Integration** (5 sub-tasks) — test cards, edit, duplicate, delete actions

### Files Created
- `documentation/tasks/tasks-0027-prd-thcs-thpt-test-system-phase1.md`

## 4. Assess & Fix Tasklist

**Time:** 11:46 AM
**Request:** Assess tasklist for gaps, then apply all fixes.

### Assessment Results
- **11 critical gaps** found (would cause junior to get stuck or produce bugs)
- **7 moderate gaps** found (would cause confusion or PRD non-compliance)

### Fixes Applied (all 18)
1. ✅ Added `routeAccess.test.ts` update task (3.5)
2. ✅ Fixed `explanation` field to PRD object shape (not string)
3. ✅ Added `'review'` to `THCSDraft.status` union
4. ✅ Moved `onConfirm` navigation to PARENT component (task 3.4), not modal
5. ✅ Added `sourceDraftId` to `THCSTest` interface
6. ✅ Clarified `testType` vs `type` with type guard code + Notes section
7. ✅ Removed orphan `useThcsTestData.ts` from Relevant Files
8. ✅ Removed orphan `THCSInstructionEditor.tsx` from Relevant Files
9. ✅ Added `imageUploadService.ts` task (4.14) with full implementation spec
10. ✅ Added Save Draft button behavior to task 4.1 (create-then-update flow)
11. ✅ Added mixed-type handling in Lobby task (7.1) with type guard
12. ✅ Fixed duplicate `draftId` → noted it already exists in RouteParams
13. ✅ Added backup integration check task (2.6)
14. ✅ Added `ChangelogEntry` interface + `_changelog` to `THCSTest`
15. ✅ Added error handling pattern to Notes section
16. ✅ Added styling pattern to Notes section
17. ✅ Added accessibility (keyboard nav, ARIA, shape indicators) to task 5.4
18. ✅ Added responsive warning to task 4.1

### Final Task Count
- **7 parent tasks, 49 sub-tasks** (was 43, added 6 new sub-tasks)

## 5. Post-Junior-Edit Audit

**Time:** 12:08 PM
**Request:** Junior edited PRD + tasklist unsupervised. Recheck for problems.

### Findings
- **PRD:** Unmodified ✅
- **Tasklist:** 10 discrepancies found against PRD

### Discrepancies Fixed (8 actual changes, 2 kept as-is)
1. ✅ **D1** `options` format: object `{A,B,C,D}` → tuple `[string,string,string,string]`
2. ✅ **D2** Added missing `imageCaption?: string` field
3. ✅ **D3** Renamed `underlineParts` → `optionUnderlines` (pronunciation parallel tuple)
4. ✅ **D4** Renamed `errorSentence` → `underlinedParts` (error-identification)
5. ✅ **D5** Added missing `order: number` on THCSSection
6. ✅ **D6** `isCustomInstruction` kept (useful enhancement, not in PRD)
7. ✅ **D7** Renamed `statistics` → `stats`, made optional
8. ✅ **D8** Fixed Phase2QuestionType values to match PRD exactly
9. ✅ **D9** Added `description?`, `tags?` to THCSTestMetadata
10. ✅ **D10** Kept `isComplete`, `sourceDraftId`, `settings` (implementation needs)

### Downstream fixes
- Task 2.2: stats initialization removed (optional, created on first submission)
- Task 4.4: Options stored via tuple index `options[0..3]`
- Task 4.5: Pronunciation stores to `optionUnderlines[i]`
- Task 4.6: Error-ID stores to `underlinedParts`
- Task 5.4: Image alt uses `imageCaption || questionText`
- Task 6.1: Stats path uses `stats` not `statistics`
- THCSSection.passage: Added `id`, `wordCount` fields from PRD

## 6. Junior Evaluation Assessment

**Time:** 12:14 PM
**Request:** Assess junior's 12-point evaluation of the tasklist.

### Assessment Results
- **4 claims → already fixed** (#1-4: Phase2 types, field names, order, metadata)
- **1 claim → partially valid** (#5: stats fixed, isComplete/settings intentional)
- **6 claims → genuinely new valid findings** (#6-8, #10-12)
- **1 claim → partially valid low risk** (#9: hooks already handle offline)

### 6 Fixes Applied
1. ✅ **#6** Rebuilt `THCSGradingResult` to match PRD §4.4.1: added `testId`, `studentId`, `gradedAt`, `gradingStatus`, `intentBreakdown`, `Record<number, QuestionResult>` format, `SectionResult`/`QuestionResult` sub-interfaces
2. ✅ **#7** Added prerequisite task 2.0.pre: export `deepRemoveUndefined()` and `convertTimestamps()` from `draftCloudService.ts`
3. ✅ **#8** CRITICAL: Fixed answer path from `answers/{questionId}` (UUID) → `answers/{questionNumber}` (e.g., "1", "2")
4. ✅ **#10** Added `subjectVariant`, `province`, `tags`, `sectionSummary` to library metadata in publish step 6
5. ✅ **#11** Added explanation `<Textarea>` with expandable `<Collapse>` to task 4.4
6. ✅ **#12** Added "Scroll to Questions" button + `onScrollToQuestions` prop to task 5.5

### Also Updated
- Task 2.3: `markThcsTest()` signature now requires `testId`, `studentId`; lookup by `questionNumber` not UUID
- Task 2.5: Added 3 new unit tests (#7-9) for Record format, intentBreakdown, and questionNumber keys

## 7. Tasklist Completeness Assessment (Re-assessment)

**Time:** 12:25 PM
**Request:** Re-assess tasklist against PRD for completeness and junior-safety. Report only, no edits.

### Assessment Results
- **21 total issues** found: 7 Critical · 8 Major · 6 Minor
- Full report saved to artifact: `tasklist_assessment_0027.md`

### Summary of Findings

**🔴 7 Critical (data model errors that propagate everywhere):**
1. `Phase2QuestionType` literal values still wrong vs PRD §4.1.1
2. `THCSQuestion.options` shape: tasklist says object `{A,B,C,D}`, PRD says tuple `[string,string,string,string]`
3. `optionUnderlines` / `underlinedParts` merged into wrong single field
4. `THCSQuestion.points` is required in tasklist but optional in PRD
5. `THCSSection` still missing `order: number` field
6. `THCSTest` has wrong/extra fields (`isComplete`, `statistics` vs `stats`, `settings`)
7. `THCSDraft` definition wrong: missing `userId`, wrong `draftId` vs `id`, missing timestamps

**🟠 8 Major:**
8. `QUESTION_NAV_COLORS` values don't match PRD §4.3.3 spec
9. Grading service looks up by `questionId` (UUID) but answers stored by `questionNumber`
10. Firestore rules for `thcs_library` allow any auth user to write (PRD: owner + super_admin only)
11. Routes added without explicit `TeacherGuard` — left as junior investigation
12. Default section `totalPoints` not specified (PRD says 0)
13. `globalQuestionOffset` prop undefined — junior has no idea how to compute it
14. `thcs_library` publish payload missing `sectionSummary[]`, `subjectVariant`, `province`, `tags[]`
15. Duplication defined in Task 4.13 (editor) AND Task 7.4 (lobby card) — conflicting implementations

**🟡 6 Minor (missing tasks):**
16. No task for explanation textarea in editor (PRD §4.7 Phase 1 feature)
17. No task for `database.rules.json` update (PRD §7.2 lists it as modified file)
18. No task for `testType` field in `test_results/` records (PRD §4.5.2)
19. No task for section 0-points warning (PRD §9 EC14)
20. No task for global question renumbering on reorder (PRD §9 EC13)
21. Task 3.4 uses raw `navigate('/teacher/...')` string instead of `navigateTo('TEACHER_THCS_CREATE')`

## 8. Full Fix Re-Application + 4 New Fixes

**Time:** 12:37 PM
**Request:** Junior reverted all 24 fixes. Re-apply everything + add 4 new fixes.

### What happened
The junior made 8 edit batches (Steps 298-306) reverting EVERY fix from sessions 4-6. They then wrote a 21-point evaluation "discovering" the same issues. 14 of 21 findings were re-discoveries of reverted fixes.

### Assessment of junior's 21 claims
- **14 claims:** Reverted fixes re-discovered (valid but caused by junior's own reverts)
- **4 genuinely new valid findings:** #8 (nav colors), #10 (Firestore rules), #13 (globalQuestionOffset), #17 (database.rules.json)
- **4 partially valid:** #7 (THCSDraft), #11 (TeacherGuard), #15 (duplication), #18 (testType)
- **3 minor:** #12 (totalPoints default), #19 (0-points warning), #20 (renumbering)
- **1 hallucinated:** #21 (navigateTo doesn't exist in codebase)

### All Fixes Applied (28 total = 24 restored + 4 new)
**Restored (24):** Phase2 types, options tuple, optionUnderlines, underlinedParts, imageCaption, points optional, section order, passage id/wordCount, metadata fields, stats naming, THCSGradingResult full spec, SectionResult/QuestionResult interfaces, deepRemoveUndefined export, explanation textarea, pronunciation store target, error-id store target, library metadata, passage Scroll to Questions, answer path questionNumber, imageCaption alt text, grading service signature, unit tests 7-9, stats initialization removed, stats transaction details

**New (4):**
1. ✅ **QUESTION_NAV_COLORS** exact PRD §4.3.3 values (bold/saturated, not pastel)
2. ✅ **thcs_library Firestore rules** restricted to owner + super_admin (was any auth user)
3. ✅ **globalQuestionOffset formula** explained in task 4.3
4. ✅ **database.rules.json** update task added as 2.4b

**Bonus fixes from minor claims:**
- THCSDraft now defined EXPLICITLY (not "same as THCSTest")
- Section 0-points warning added to validation task 4.11
- questionNumber renumbering note added to question model

## 9. Assess Tasklist Completeness (Phase 3)

**Time:** 10:48 PM
**Request:** Assess `tasks-0029-prd-thcs-thpt-test-system-phase3.md` based on `0029-prd-thcs-thpt-test-system-phase3.md` for completeness and junior-safety (no room for hallucination/guessing). Report only, do not edit.

### Assessment Results
- **3 Critical Issues** found (Will cause crashes or block features).
- **3 Moderate Issues** found (Will cause bugs, bad UX, or partial failure).
- **3 Minor Issues** found (Hallucination/guessing risks).

### 🔴 Critical Issues
1. **Course Mode Reusing Homework Component (Task 5.2 vs Task 2.6):** 
   - *Issue:* Task 5.2 says to use `THCSHomeworkLayout` for standalone course tests. However, Task 2.6 hardcodes `THCSHomeworkLayout` to save to the `homework_submissions/` collection, requiring a `homeworkId`. Course tests do NOT have a `homeworkId` and should save to `testResults/` or course progress instead.
   - *Impact:* The junior will cause a database error or crash when trying to write to `homework_submissions/undefined` for course tests.
2. **Missing `teacherId` Prop for Late Notification (Task 2.6 & 3.6):**
   - *Issue:* Task 3.6 requires `teacherId` to send the late submission notification to the teacher. However, `THCSHomeworkLayout` only receives `testData`, `homeworkId`, and `homeworkConfig` as props (per Task 2.6, step 2). It does not have the `teacherId` (which lives on the full `HomeworkAssignment` document).
   - *Impact:* The junior will either pass `undefined` (crashing the notification function) or invent a way to fetch the assignment, deviating from the plan.
3. **AI Polish JSON Schema Undefined (Task 10.4):**
   - *Issue:* Task 10.4 instructs making an API call for Layer 3 parse polishing but provides no instruction on the expected JSON output schema or format from the AI.
   - *Impact:* The junior will guess the prompt structure and how to parse the AI's response to build the `AmbiguousItem` update, leading to fragile or failing AI integration.

### 🟠 Moderate Issues
4. **Target Students Resolution for Notifications (Task 3.7):**
   - *Issue:* When calling `sendThcsHomeworkAssignedNotification` (Task 3.1), the junior must pass `studentIds: string[]`. If the homework is assigned to a `Course` or `Class`, the `studentIds` array isn't directly available in the form submission—it only contains `targetId` (the class/course ID).
   - *Impact:* The junior needs explicit instruction on whether to resolve the class roster before sending the notification or if the backend function handles it. If they don't resolve it, they might pass `[classId]`, breaking notifications.
5. **Answer Key Parser Regex restricts to MCQ (Task 10.5):**
   - *Issue:* The regex provided in Task 10.5 for extracting answer keys focuses purely on `[ABCD]` (`(?:Đáp án|Answer)\s*[:.]?\s*([ABCD])`). This ignores fill-in-the-blank or writing questions completely (e.g., "Câu 41: beautiful").
   - *Impact:* The junior will blindly implement this regex, and non-MCQ answers in the document's answer key will be silently ignored.
6. **Checkbox Controlled State Warning (Task 6.2):**
   - *Issue:* `section.shuffle` and `section.shuffleOptions` are newly added optional fields. A junior mapping these directly to the `checked` prop of a React checkbox will trigger uncontrolled-to-controlled state warnings when initially `undefined`.
   - *Impact:* Needs a fallback `checked={!!section.shuffle}` specification to prevent bugs and console spam.

### 🟡 Minor Issues / Hallucination Risks
7. **`attemptNumber` calculation (Task 2.8):** It says "attemptNumber: number — which attempt this is". It should explicitly tell the junior exactly how to calculate this (e.g., `count + 1` from the query in Task 2.6 Step 8) to prevent them from creating redundant generic counters.
8. **UI representation of 'partial' grading (Task 2.6):** When `feedbackTiming` is `'after-submission'` but the test has pending writing questions (`gradingStatus: 'partial'`), the task does not tell the junior what to show the student. Do they show the `scaledScore` along with a "Pending Teacher Review" banner? The junior will guess the UI layout.
9. **Question ID Generation in Bulk/Template features (Task 7.5 & 8.1):** The junior should be explicitly reminded to use `generateId()` (or equivalent UUID function) when creating empty question blocks from templates or the "Add N" list. Otherwise, they might accidentally use array indices as IDs, which breaks rendering and drag-and-drop.
