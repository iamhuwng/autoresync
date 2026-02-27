# Conversation Log — 2026-02-26 (Session 7 continued)

## Context
Continuing Phase 3 implementation of THCS-THPT Test System.

---

## 1. Task 2.0 Completion (remaining subtasks 2.2, 2.7, 2.8)

### Actions Taken:
- **Task 2.2** — Added THCS-THPT filter to `HomeworkCreateModal.tsx`:
  - Extended `Material.type` to include `'thcs-test'`
  - Added THCS-THPT filter button alongside Quiz/Test
  - Updated `loadMaterials` to detect THCS tests via `testType === 'THCS-THPT'`
  - Auto-redirects to `THCSHomeworkAssignDialog` when THCS material is selected
  - Shows grade level badge, question count from sections
  - Fixed props mismatch: dialog uses `testMetadata` not `testDuration`/`testTimerMode`
- **Task 2.7** — Late Submission Policy Enforcement in `THCSHomeworkLayout.tsx`:
  - Added `schedulingDueDate` prop
  - Check at submission time: reject/accept-late/penalty/accept
  - Penalty applies score multiplier: `(100 - pct) / 100`
  - Block on info screen when deadline passed + policy is 'reject'
  - Updated blocked phase render to differentiate deadline vs attempts
- **Task 2.8** — Already implemented in previous session (Firestore write in handleSubmit)
- Passed `schedulingDueDate` from `StudentHomeworkDetailPage.tsx`
- **Commit:** `5a305a8`

---

## 2. Task 3.0 — Notification Extensions (3.1-3.7)

### Actions Taken:
- Added 6 new notification functions to `notificationService.ts`:
  - `sendThcsHomeworkAssignedNotification` (3.1) — bulk via `createBulkNotifications`
  - `sendThcsGradeUpdatedNotification` (3.2) — with 10s debounce to prevent spam
  - `sendThcsFullyGradedNotification` (3.3) — fires on `gradingStatus` transition
  - `sendThcsHomeworkDueSoonNotification` (3.4) — warning type
  - `sendThcsSubmittedNotification` (3.5) — confirmation to student
  - `sendThcsLateSubmissionNotification` (3.6) — dual: student + teacher
- **Task 3.7** — Wired triggers 3.5 and 3.6 in `THCSHomeworkLayout.tsx`:
  - Fixed `teacherId` destructuring (was `_teacherId`, now needed for notifications)
  - Fixed `testData.title` → `testData.metadata?.title`
- **Commit:** `17cee75`

---

## 3. Task 6.0 — Question Shuffling (Mã Đề)

### Actions Taken:
- **Task 6.1** — Created `src/utils/thcsShuffle.ts`:
  - `fisherYatesShuffle<T>()` — seeded RNG shuffle
  - `remapAnswerKey()` — maps correct answer letter after option shuffle
  - `shuffleTest()` — main function, deterministic per student+test
  - Respects `section.shuffle` and `section.shuffleOptions` flags
  - Edge case EC7: sections with ≤1 question silently skip shuffle
- **Task 6.3** — Applied shuffle in student test views:
  - `THCSHomeworkLayout.tsx`: memoized `shuffledTestData`
  - `THCSTestLayout.tsx`: memoized `shuffledTestData`, grading still uses original testData
- **Commit:** Included in batch commit

---

## 4. Task 8.3 — Question Text Parser

### Actions Taken:
- Created `src/utils/thcsQuestionParser.ts`:
  - MCQ parsing: detects `Câu N:`, `Question N:`, options A-H, answer lines
  - Fill-in parsing: detects `___` blanks, extracts answers
  - Returns `ParseResult { questions, errors }` with line numbers for errors

---

## 5. Task 11.3 — Timer Mode Configuration

### Actions Taken:
- Implemented informational timer mode in `THCSHomeworkLayout.tsx`:
  - `timerExpiredBanner` state
  - At timer=0: strict → auto-submit, informational → show yellow banner, none → no timer
  - Banner: "⏰ Time is up — you may continue at your own pace."
- **Commit:** `18b4642`

---

## Summary of Completed Tasks This Session:
| Task | Description | Status |
|------|-------------|--------|
| 2.2 | HomeworkCreateModal THCS tab | ✅ |
| 2.7 | Late Submission Policy | ✅ |
| 2.8 | Homework Result Storage | ✅ |
| 3.1-3.7 | All Notification functions + wiring | ✅ |
| 6.1 | thcsShuffle.ts utility | ✅ |
| 6.3 | Shuffle applied in student views | ✅ |
| 8.3 | thcsQuestionParser.ts | ✅ |
| 11.3 | Informational timer mode | ✅ |

## Remaining Tasks:
- 4.0 THCS Library Browsing (4.1-4.5)
- 5.0 Course Integration (5.1-5.4)
- 6.2 Shuffle Toggles in Editor
- 7.0 Test Templates (7.1-7.5)
- 8.0 Bulk Question Creation (8.1, 8.2, 8.4)
- 9.0 Drag-and-Drop Reordering (9.1-9.5)
- 10.0 Auto Test Maker (10.1-10.9)
- 11.0 Timer Mode (11.1, 11.2)
- 12.0 Student Dashboard + Academic Record (12.1-12.5)
