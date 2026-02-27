---
title: IELTS Writing Test System PRD
createdAt: '2026-02-27T18:25:58.493Z'
updatedAt: '2026-02-27T18:33:28.198Z'
description: >-
  Complete PRD (0030) for the IELTS Writing test system covering test creation,
  student essay writing, teacher grading with inline annotations, solo practice,
  homework integration, notifications, academic record, and THCS writing
  integration. Includes TypeScript data models, IELTS band score calculation
  rules, storage architecture, and detailed UI mockups.
tags:
  - prd
  - ielts
  - writing
  - grading
  - test-system
---
# IELTS Writing Test System PRD (0030)

> **Source:** documentation/tasks/0030-prd-ielts-writing-test-system.md
> **Version:** 1.0 | **Status:** Draft | **Priority:** High
> **Created:** 2026-02-28 | **Author:** AI (5 Socratic rounds, 80+ decisions)

---

## 1. Overview

The app currently supports IELTS Reading/Listening (auto-graded) and THCS tests (MCQ + sentence-rewrite). IELTS Writing is fundamentally different: students produce free-form essays graded by teachers using subjective IELTS criteria rubrics.

### Key Differences from Reading/Listening

| Aspect | Reading/Listening | Writing |
|---|---|---|
| Student answer | Structured (MCQ, fill-in) | Free-form essay (~150-400 words) |
| Marking | Auto-graded (deterministic) | Manual teacher grading (subjective) |
| Score type | Correct count → band lookup | 4 criteria × per task → weighted average |
| Progress tracking | Questions answered / total | Word count / target |
| Results display | Correct/incorrect per Q | Essay + inline annotations + criteria chart |

## 2. Goals

1. **G1:** Teacher creates IELTS Writing tests (Task 1 only, Task 2 only, or Full Test)
2. **G2:** Students write essays in live sessions, solo practice, homework with plain-text editor, paste prevention, per-task time tracking
3. **G3:** Rich grading interface: inline annotations (highlight, comment, strikethrough, correction, text color), custom categories, per-criteria band scoring with IELTS rounding rules
4. **G4:** Full lifecycle: submit → pending review → graded → student sees results
5. **G5:** Solo practice and homework with "Submit to Teacher" flow
6. **G6:** Academic record with criteria-level trend analysis

## 3. Data Model

### 3.1 Core Types (src/types/ielts-writing.types.ts)

- **WritingTask**: taskNumber (1|2), taskType, promptText, promptImageUrl (Task 1 only), wordMinimum (150/250), recommendedTimeMinutes (20/40), modelAnswer (optional), showModelAnswerToStudent (toggle)
- **WritingTestFormat**: 'task1-only' | 'task2-only' | 'full-test'
- **WritingTestMetadata**: title, duration (minutes, shared timer), format, difficulty, targetBand
- **IELTSWritingTest**: Published test in RTDB (tests/{testId}) with skill: 'Writing' discriminator
- **WritingTestDraft**: Firestore draft during creation

### 3.2 Submission (Firestore: writing_submissions/{submissionId})

Self-contained document (~20KB, within 1MB limit). Embeds task prompts so submissions are independent of the test document.

- **WritingSubmission**: id (= resultId), studentId, context (live-session|solo-practice|homework), testMeta (embedded), tasks[], submittedAt, totalElapsedTimeSeconds, pasteAttemptCount, markingStatus (pending-review|graded), grading?, annotations[], auditTrail[]
- **WritingSubmissionTask**: taskNumber, taskType, promptText (embedded snapshot), essayText, wordCount, activeTimeSeconds
- **WritingGradingResult**: teacherId, gradedAt, overallBand, perTask[] (criteriaScores + taskBand), feedback (overall + perCriteria, all rich HTML)
- **WritingAnnotation**: id, taskNumber, type (highlight|comment|strikethrough|correction|textColor), startOffset/endOffset, color, categoryId, commentText?, correctionText?
- **WritingGradingAudit**: version, gradedAt, reason (required for re-grade), previousScores
- **AnnotationCategory**: Per-teacher custom categories (Firestore: users/{teacherId}/settings/writingAnnotationCategories)

### 3.3 IELTS Band Score Calculation Rules

> IELTS-official rules, MUST be implemented exactly.

1. Each criterion scored as WHOLE NUMBER (0-9, no decimals)
2. Per-task band = average of 4 criteria, rounded DOWN to nearest 0.5 (6.25→6.0, 6.75→6.5)
3. Overall Writing band (Full Test) = (Task1Band × 1/3) + (Task2Band × 2/3), rounded: from 0.25 up → next 0.5 (6.25→6.5, 6.24→6.0)
4. Task 1 only or Task 2 only: overall = that task's band (no weighting)
5. Voided task: excluded from calculation entirely
6. Task 1 uses "Task Achievement" (TA), Task 2 uses "Task Response" (TR) — both share CC, LR, GRA

### 3.4 Storage Architecture

- **RTDB** (real-time): tests/{testId}, game_sessions/{code}/students/{uid}/writing/, test_results_by_student/{studentId}/{resultId}
- **Firestore** (permanent): writing_submissions/{submissionId}, writing_drafts/{draftId}, users/{teacherId}/settings/
- **Flow**: Draft (Firestore) → Publish (RTDB) → Student writes (RTDB real-time) → Submit (Firestore submission + RTDB result index) → Teacher grades (Firestore update) → Scores sync (RTDB result index)

## 4. Test Builder (Teacher)

- **Routes**: /teacher/writing-test/create, /teacher/writing-test/edit/:draftId
- **Format selection**: Task 1 Only / Task 2 Only / Full Test (radio buttons). Switching preserves entered data.
- **Task 1**: Type dropdown (bar-chart, line-graph, pie-chart, table, process-diagram, map, mixed) — metadata tag only. Image upload (jpg/png/webp, max 5MB) + paste URL. Prompt textarea (max 2000 chars). Word minimum default: 150. Recommended time: 20 min.
- **Task 2**: Type dropdown (opinion, discussion, problem-solution, etc.) — metadata tag only. Text-only (no image). Prompt textarea. Word minimum default: 250. Recommended time: 40 min.
- **Model answer**: Optional expandable textarea. Toggle: show to student after grading (default: off).
- **Auto-save**: Debounced 2s to Firestore writing_drafts/. Same pattern as draftCloudService.ts.
- **Validation on Publish**: Block if title empty, duration 0, prompt empty, or Task 1 missing image. Warn if no model answer.
- **Publish flow**: Validation → generate test ID → write RTDB tests/{testId} with skill:'Writing' → update draft status → success dialog.

## 5. Student Writing Test Page (Live Session)

- **Route**: /student/test/:sessionCode (same route, TestPageRouter detects skill:'Writing')
- **Layout**: Two-column — Left panel (40%): Task prompt + image (Task 1) + instructions. Right panel (60%): Plain textarea essay editor + word counter. Mobile (<768px): single column, collapsible prompt.
- **Plain textarea**: No formatting buttons. spellcheck="false". Paragraph support (Enter). Undo/redo via Ctrl+Z/Y (browser native).
- **Word counter**: Live count below editor. In live session: displayed but NOT enforced (no submit blocking).
- **Timer**: Single shared timer for entire test. Student distributes time freely. Timer expiry → auto-submit.
- **Tab navigation**: Task 1 / Task 2 tabs. Switching preserves essay text. Active tab highlighted blue.
- **Per-task time tracking** (passive): Track which tab is active + keystroke gap detection (5-min gap = pause active time). Student does NOT see per-task time.
- **Auto-save** (RTDB): Debounced 3s, only active task. Path: game_sessions/{code}/students/{uid}/writing/task{N}. On tab switch: immediately save previous task.
- **Disconnect/Reconnect**: Last auto-saved version preserved. Resume from saved state. Timer expired during disconnect → auto-submit.
- **Multiple sessions same test**: Each session creates separate submission, both appear independently.
- **Submit flow**: Confirmation modal (shows word counts) → save both tasks to RTDB → copy to Firestore → create result record → show submitted overlay.
- **Teacher reopen**: Unlocks essay + toast notification. Reopen only works within session time.

### 5.1 External Paste Prevention

1. **Copy/Cut interception**: Set module-level flag lastInternalCopy on internal copy/cut
2. **Paste interception**: Check if clipboard matches lastInternalCopy within 60s. Match = allow. No match = block + toast + increment pasteAttemptCount
3. **Drop interception**: event.preventDefault() on all drop events
4. **Input monitoring (fallback)**: If single input event inserts >10 chars AND no internal copy flag → block. Threshold of 10 allows for IME composition (Vietnamese input)
5. **Logging**: pasteAttemptCount stored in submission, visible to teacher

## 6. Teacher Test Monitor

- Student cards: Word count per task, active task, elapsed time, status (Writing/Idle/Submitted/Disconnected)
- **Peek button**: Opens modal with read-only essay view (real-time RTDB sync). Student NOT notified.
- **Session controls**: Reuse SessionControlPanel. End Session → auto-submit all. Reopen per student (within timer).

## 7. Grading System

### 7.1 Grading Queue

- Shows all writing_submissions where markingStatus === 'pending-review'
- **Assignment**: Live session → test owner. Homework → assigning teacher. Solo → student-selected teacher.
- **Filtering**: All / Live / Homework / Solo. Sort: Newest first.
- **Workload indicator**: Pending count + total words. One teacher per submission.

### 7.2 Grading Interface

- **Layout**: Tabbed per task, side-by-side (essay left 55%, grading right 45%)
- **Criteria scoring**: 10 buttons per criterion (0-9), whole numbers only. Task band auto-calculates live.
- **Annotation toolbar** (5 tools): Highlight, Comment, Strikethrough, Correction, Text Color
- **Category quick buttons**: 4 IELTS presets (TA blue, CC green, LR orange, GRA red) + custom categories. Per-teacher Firestore settings.
- **Feedback**: Rich text editors (TipTap/Quill, NO Mantine) for overall + per-criteria
- **Void Task**: Per task, requires reason, excluded from calc + stats
- **Re-grading**: Audit trail, required reason, student sees latest only
- **Partial grading**: Grade one task first, submit, complete later. overallBand recalculated on completion.
- **Save/Submit**: Auto-save 30s. beforeunload warning. Submit → Firestore + RTDB + notification.

## 8. Results and Review

- **Pending review**: Submission details + read-only essay
- **Partially graded**: Graded task band + "Pending" for ungraded task + no overall band yet
- **Fully graded**: Overall band, per-task bands, criteria breakdown, annotated essay, teacher feedback, model answer
- **Teacher results page**: Student list with bands, status. Sort/filter. Click → detail modal.

## 9. Solo Practice

- StudentPracticePage detects skill:'Writing' → WritingPracticeView
- Same layout as live session. Timer optional. Word min teacher-configurable. Auto-save to localStorage.
- **Submit to Teacher**: "Submit for Review" → teacher dropdown + optional note → Firestore + RTDB + notification
- **No enrollment**: Self-review only. Essay saved for later teacher assignment.
- **Unlimited submissions**: Same test submittable multiple times, each separate grading entry.
- **Course modules**: Writing tests in course modules are both solo-practiceable by students AND homework-assignable by teachers.

## 10. Homework Integration

- HomeworkCreateModal supports skill:'Writing'. Configurable: due date, late policy, word min, max attempts, timer.
- Auto-sends to assigning teacher. Late warning if past due. Re-attempt pre-loads previous essay.

## 11. Notifications

| Trigger | Recipient |
|---|---|
| Essay submitted (solo/homework) | Teacher |
| Grading completed | Student |
| Homework due 24h / overdue | Student |
| Essay reopened | Student |
| Session ends | Student |
| Score changed (re-grade) | Student |
| Ungraded digest (periodic) | Teacher |

## 12. Academic Record and Dashboard

- New Writing section alongside Reading/Listening
- Band trend chart, per-criteria averages, test count (excl voided), best band
- Pending results shown but excluded from calculations
- Student dashboard: "Pending Reviews" section

## 13. THCS Writing Integration

- THCS sentence-rewrite auto-grades first, then queued for teacher review/override
- Queue distinguishes IELTS Writing vs THCS via source type

## 14. Edge Cases

- **Deleted student**: "[Deleted Student]" in queue, Archive/Discard buttons
- **Empty essay**: Allowed, teacher grades 0
- **Word minimums**: 150/250 defaults, teacher overridable, enforced only in solo/homework

## 15. Non-Goals

AI grading, speaking test, batch grading, mobile grading, version control, templates, plagiarism detection, print/export

## 16. Technical Notes

- Firestore ~20KB/submission (within 1MB). RTDB sync debounced 3s. Backup auto-discovered. Draft cleanup 90-day TTL. Rich text: TipTap/Quill only (NO Mantine).

---

> **⚠️ IMPLEMENTATION SOURCE OF TRUTH:** This Knowns doc is a condensed decision summary (210 lines). The full implementation specification with TypeScript interfaces, ASCII/image mockups, band score calculator code, step-by-step flows, and route registry updates is at:
>
> **`documentation/tasks/0030-prd-ielts-writing-test-system.md`** (1300+ lines)
>
> Always read the full PRD when implementing. This doc is for quick reference and discoverability only.
