---
title: Results Academic Record
description: Result lifecycle, IELTS bands vs THCS scores, result context system, access points, UX gaps.
createdAt: '2026-02-27T17:02:41.986Z'
updatedAt: '2026-03-30T14:53:58.041Z'
tags:
  - architecture
  - results
  - academic-record
  - scoring
---

# Results & Academic Record Architecture

## Overview

The results system spans the full pipeline from test submission to long-term academic tracking. It supports multiple viewing contexts (session, student, class, aggregate) and two scoring systems (IELTS bands, THCS scaled scores).

## Result Lifecycle

```
Student submits test → resultsService.saveTestResult()
  → Auto-grade (MC, fill-in) or Manual grade (writing)
  → Save to /test_results/{resultId}
  → Create indexes: by_session, by_student
  → Context tagged: live/homework/practice/course
  → Available in: StudentTestResultsPage, TeacherTestResultsPage, AcademicRecord
```

## Scoring Systems

### IELTS Band Scoring
- Reading/Listening: Raw score → Band score (1.0-9.0)
- Per-question-type breakdown
- Overall band calculation

### THCS Scaled Scoring
- Raw score → Scaled score (out of 10)
- Vietnamese labels
- Per-section breakdown

## Result Access Points

### Student Views
| Page | Route | Description |
|------|-------|-------------|
| `StudentTestResultsPage.tsx` | `/student-test-results/:code` | Immediate post-test results |
| `StudentResultsPage.jsx` | `/student-results/:id` | Legacy quiz results |
| `TestReviewPage.tsx` | `/result/:id/review` | Detailed answer review |
| `AcademicRecordPage` | `/student/academic-record` | Full academic history |
| Dashboard "My History" tab | `/student` | Quick access to results |

### Teacher Views
| Page | Route | Description |
|------|-------|-------------|
| `TeacherTestResultsPage.tsx` | `/teacher-test-results/:code` | Session results |
| `TeacherResultsDashboard.jsx` | `/teacher/results` | ⚠️ Aggregate dashboard (NO navbar button!) |
| `TeacherStudentHistoryPage.tsx` | `/teacher/student/:id/history` | Individual student history |

### Known UX Issue (from analysis)
⚠️ **Teacher Results Dashboard** at `/teacher/results` exists but has **no navigation button** in the teacher lobby. Teachers must know the URL. This is a critical discoverability gap.
See @doc/sop/enhanced-saved-results-ux

## Components

| Component | Purpose |
|-----------|---------|
| `ResultDetailModal` | Full result breakdown (shared student/teacher) |
| `ResultCard` | Result list item card |
| `ResultContextBadge` | Context badge (Live/Homework/Practice) |
| `HomeworkResultsSummary` | Homework-specific completion summary |
| `StudentPracticeHistory` | Solo practice history view |
| `THCSProgressTab` | THCS-specific progress tracking |

## Result Context System (from PRD-0016)

All results include a `context` field for filtering:
```typescript
{
  type: 'class_session' | 'homework' | 'self_study' | 'course_material',
  source: { type, id, name },
  assignment?: { homeworkId, dueDate, isLate, attemptNumber },
  configApplied: { timerMinutes, feedbackTiming, source }
}
```

Badge colors: 🏫 Live=Blue, 📋 Homework=Orange, 📖 Practice=Green, 📚 Course=Purple

## RTDB Paths

```
/test_results/{resultId}/        — Individual result records
/test_results_by_session/{sessionId}/{resultId}  — Session → results index
/test_results_by_student/{studentId}/{resultId}  — Student → results index
/guest_results/{resultId}/       — Guest user results (separate bucket)
```

## Related Docs
- @doc/architecture/academic-record/academic-record-page-architecture — Academic Record page structure, shell ownership, and interaction contract
- @doc/architecture/academic-record/academic-record-progression-model — How Academic Record should represent progression instead of raw storage alone
- @doc/architecture/academic-record/academic-record-analytics-readiness — Analytics and recommendation-readiness contract for future proficiency and material suggestions
- @doc/prd/prd-academic-record — Academic record PRD
- @doc/prd/prd-saved-result-system — Enhanced result system PRD
- @doc/architecture/test-system-architecture — Test system parent architecture
- @doc/architecture/homework-solo-practice-architecture — Result context system
- @doc/sop/enhanced-saved-results-ux — Results UX investigation and historical issues
- @doc/sop/test-end-flow-debug-retrospective — Guest result bug
## 2026-03-28 Amendment — Result Persistence Invariants

A result is only product-visible when the canonical result row and its discovery indexes are persisted together. The older architecture summary understated this and made the system look simpler than it really is.

### Updated lifecycle rule

```text
Student submits or teacher auto-submits
  → grading payload is produced
  → save canonical result row
  → atomically write discovery indexes and player latestResultId
  → resolve teacher ownership for class-session results
  → result becomes visible across waiting-room modal, academic record, and teacher history
```

### Critical discovery paths
- `/test_results/{resultId}` — canonical row
- `/test_results_by_student/{studentId}/{resultId}` — required by academic record and student history readers
- `/test_results_by_session/{sessionCode}/{resultId}` — required by session-oriented result recovery
- `/test_results_by_teacher/{teacherId}/{resultId}` — required by teacher student-history surfaces
- `game_sessions/{sessionCode}/players/{studentId}/latestResultId` — important fallback for waiting-room result retrieval

### Architectural finding
A canonical row can exist while the feature behaves as if the result was never saved. In practice this is not a UI-only problem; it is a persistence-contract failure.

### Current feature state
- Student waiting-room result retrieval remains index-driven and fallback-based.
- Student academic record still depends on the student result index.
- Teacher student history still depends on teacher-owned visibility and teacher index rows.
- The save path now enforces atomic canonical-plus-index persistence for new writes.
- Historical rows created before the invariant fix may still require repair/backfill.

See @doc/patterns/pattern-canonical-result-persistence-invariants and @doc/sop/test-end-flow-debug-retrospective.


## 2026-03-29 Amendment — Compact Study Recommendations in Feedback Tabs

The `What to Study Next` block inside saved-result feedback surfaces now follows a compact, summary-first pattern instead of rendering full remediation detail by default.

### Current feature state
- The Academic Record feedback tab shows recommendation rows as compact summaries.
- Each row prioritizes `priority + focus + first action` over complete explanation.
- Full `Why` text and secondary resources are moved behind expansion.
- The surrounding result shell, tab structure, and neighboring feedback widgets remain unchanged.

### Architectural significance
This is a presentation-layer containment rule for shared saved-result surfaces: recommendation-card redesigns must stay local to the recommendation widget rather than reflowing the modal shell.

### Known interaction risks
- Shared result surfaces can still feel crowded if adjacent widgets continue to grow vertically.
- Recommendation-card changes can affect both student and teacher result views because the feedback component stack is shared.
- Tests must account for duplicated visible resource titles across summary and expanded states.

See @doc/patterns/pattern-compact-study-recommendation-cards-in-result-feedback.


## 2026-03-29 Amendment — IELTS Writing Pending-Review Access Contract

### Current feature state
- Pure IELTS Writing submissions now land on `/submission-complete` as a submission acknowledgement surface.
- That page no longer offers an immediate `View Results` action for pending-review Writing submissions.
- The acknowledgement copy explicitly tells students that IELTS Writing is hand-graded by the teacher, with no instant score or AI feedback after submit.

### Access rule
- Immediate post-submit access for pure IELTS Writing is acknowledgement-only.
- Result review for Writing happens later through Writing-aware result surfaces such as `StudentTestResultsPage` backed by Firestore `writing_submissions`.
- The generic waiting-room result modal is not the correct immediate post-submit surface for pure IELTS Writing.

### Why this matters
The slim RTDB writing result compatibility artifact may exist for indexing and legacy readers, but it is not the product contract for immediate student review after submit. The canonical grading lifecycle remains teacher review first, student result access second.

### Related docs
- @doc/architecture/test-system-architecture
- @doc/architecture/scheme/ielts-writing-current-state-scheme
- @doc/patterns/pattern-canonical-result-persistence-invariants


## 2026-03-29 Amendment — IELTS Writing Compatibility Result Reconstruction

### Current feature state
- Writing result discoverability still depends on RTDB `test_results` and secondary indexes even though grading state is canonical in Firestore `writing_submissions`.
- The compatibility result is not the product contract for immediate student review, but it is still a required discovery surface for existing readers.

### Architectural significance
- A missing RTDB writing result can create a \"graded but invisible\" state where teacher grading is complete but academic record, teacher history, or session result indexes do not surface the artifact.
- The architecture now explicitly requires result reconstruction from Firestore when the compatibility row is missing or unreadable.

### Known interaction risks
- Submission-time materialization and teacher final grading share the same writing-result persistence layer.
- A projection bug can therefore affect both pending-review discoverability and post-grading discoverability.
- Ownership normalization across live session, homework, and solo practice still controls whether the reconstructed result lands in the right indexes.

### Related docs
- @doc/architecture/architecture-ielts-writing-grading-submit-compatibility-audit-2026-03-29
- @doc/architecture/test-system-architecture
- @doc/patterns/pattern-rtdb-multi-path-write-obligation

## 2026-03-29 Writing Surface Alignment

Current Writing-specific result-surface behavior:

- `WritingProgressSection` now reads from the live Writing schema (`markingStatus`, `grading`, `testMeta.testTitle`) instead of the earlier stale field names.
- Saved-result slide panels now recognize Writing result rows and render the Writing placeholder content when `writingSubmission` is present, instead of falling through to generic score-summary/question-review shells that imply an auto-graded question model.
- This keeps homework and solo-practice Writing entries compatible with the generic saved-result entry points while still respecting the manual-grading contract.


## 2026-03-30 Amendment — IELTS Writing Result Surface Implementation

Current source of truth:
- `specs/ielts-writing-result-surfaces-2026-03-30`

Current feature state:
- IELTS Writing no longer treats the generic result readers as its target UX.
- Student and teacher result hosts now delegate Writing rows to dedicated Writing result surfaces.
- The approved Stitch mockups remain structural guidance only; the shipped UI is expected to fit the app's real teacher shell and student-view language rather than reproducing the mockups literally.
- The student pending-review state may render from the RTDB saved-result snapshot alone, while published detail and teacher-actionable detail continue to prefer canonical Firestore submission data.

Architectural significance:
- This keeps unified result-shell governance in place while removing Writing-specific detail from `SharedSavedResultCore` assumptions.
- It also aligns the result surface with the grading tool's canonical `publishedGrading` artifact instead of legacy score-summary placeholders.

Superseded guidance:
- Any result-surface guidance that assumes Writing should appear as a generic score/review/feedback result reader should be treated as historical.


## 2026-03-30 Amendment — Exact Parallel Comment Repositioning For IELTS Writing Student Results

Current feature state:
- The IELTS Writing student slide modal now supports an exact essay-to-comment reading interaction in wide split layout.
- Clicking a highlighted annotation in the essay forces the right rail to `Comments` and moves the matching comment card to the parallel vertical band in the right column.
- This is stronger than the earlier approximate implementation that only scrolled the comments list toward the selected item.

Architectural significance:
- The interaction brings the student result surface closer to the grading-tool reading model without exposing grading controls.
- The selected comment remains part of the normal ordered published-comments list; the UI repositions the focused card visually instead of reordering comments.
- The contract depends on the published markup renderer providing the clicked annotation's viewport anchor and the student result surface translating the selected card inside the comments rail.

Current scope:
- Implemented for the published markup path in the Writing result slide modal and shared student Writing surface.
- Not yet required for legacy annotation fallback renderers.

Live verification:
- Verified using the student dev account on direct result route `?result=-OosUDrZdaDhAb6vxk34`.
- The corrected implementation produced near-parallel alignment between clicked text and focused comment card (`deltaCenter ~= -4px`).
- The normal Academic Record page for that dev account did not expose the Writing widget during live check, so the direct result route was used as the reliable verification path.

## 2026-03-30 Correction — Writing Comment Rail Uses Header-Top Alignment

For the IELTS Writing student result slide panel, the comment rail alignment rule is now explicit:

- The comments rail shifts as a whole block.
- The selected comment header row is the visual anchor on the right.
- The clicked essay annotation top line is the visual anchor on the left.
- The intended steady-state is `selected comment header top` parallel to `clicked annotation top`.

This replaced the previous center-based alignment attempt, which was visually wrong for tall comments and unstable when measured during transform animation.


## 2026-03-30 Amendment — Grading Tool Shares The Same Header-Top Alignment Contract

The teacher IELTS Writing grading editor now mirrors the same cross-column reading contract used by the wide student Writing result surface.

For the grading editor:
- clicking highlighted essay text must force-open the right-side `Comments` tab
- the comments rail must move as one block
- the selected comment remains in normal list order
- the right-side visual anchor is the selected comment header row
- the left-side visual anchor is the clicked annotation top line
- the intended steady-state is `selected comment header top == clicked annotation top`

This keeps the published result reader aligned with the authoring tool instead of teaching users two different comment-navigation models.
