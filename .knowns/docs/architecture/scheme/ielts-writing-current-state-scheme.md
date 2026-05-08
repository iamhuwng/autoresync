---
title: IELTS Writing Current State Scheme
description: Current-state contract for IELTS Writing across routing, submission, grading, result access, and forbidden regressions.
createdAt: '2026-03-29T07:59:36.729Z'
updatedAt: '2026-04-05T14:14:52.418Z'
tags:
  - architecture
  - scheme
  - ielts
  - writing
  - current-state
---

# IELTS Writing Current State Scheme

## Purpose
This document records the current intended behavior for IELTS Writing as it exists in the app today, including the stable product invariants, the active workflow boundaries, and the regressions that must not be reintroduced.

## Stable invariants
- IELTS Writing is manually graded by a teacher.
- IELTS Writing does not produce an instant score at submission time.
- IELTS Writing does not show AI grading, AI feedback, or regex-style grading after submit.
- The student lifecycle is submit -> pending review -> graded.
- The teacher grading queue is the operational front door for ungraded Writing work.

## Current live-session student flow
1. `TestPageRouter` resolves `testType: 'IELTS'` plus `skill: 'Writing'` to `WritingTestPage`.
2. The student writes in `WritingTestPage`, with draft/autosave data stored in RTDB under the live session writing path.
3. Submission can happen from three sources:
   - manual student submit
   - timer-expiry auto-submit
   - teacher-ended early auto-submit
4. All three submission sources call the same `autoSubmitFromRTDB()` promotion path.
5. `autoSubmitFromRTDB()` creates the canonical Firestore `writing_submissions/{submissionId}` record with `markingStatus: 'pending-review'`.
6. A slim RTDB result compatibility artifact may also be materialized, but that is not the primary immediate student-facing post-submit contract.
7. After successful submit, the student is redirected to `/submission-complete`.
8. `/submission-complete` tells the student that the test is teacher-graded manually, there is no instant score or AI feedback, and they should wait for review.
9. The student can later access the graded or pending-review Writing result through Writing-aware result surfaces, not through the generic waiting-room modal immediately after submit.

## Current teacher workflow
1. Ungraded Writing submissions enter the teacher grading queue.
2. The grading queue reads Firestore `writing_submissions` filtered by `markingStatus === 'pending-review'`.
3. The teacher grading page owns annotations, criteria scoring, final grading submission, and any reopen loop.
4. Student-visible graded output is downstream from that teacher workflow.

## Canonical data and ownership model
### Draft layer
- Store: RTDB
- Owner surface: `WritingTestPage`
- Purpose: live draft text, active task, elapsed activity, temporary editor state

### Promotion bridge
- Function: `autoSubmitFromRTDB()`
- Responsibility: snapshot the live RTDB draft into the canonical review artifact

### Canonical grading artifact
- Store: Firestore `writing_submissions`
- Status model: `pending-review` -> `graded` (plus reopen/edit loops where applicable)
- Consumer surfaces: teacher grading queue, grading editor, Writing-aware student result views

### Compatibility result artifact
- Store: RTDB `test_results` plus indexes
- Purpose: compatibility/discovery for existing result readers and indexes
- Constraint: this is not the immediate post-submit UX contract for pure IELTS Writing

## Student-visible surfaces and what they may show
### `WritingTestPage`
- Editable essay UI before submit
- Submit confirmation
- No grading feedback

### `SubmissionCompletePage`
- Submission success acknowledgement
- Manual teacher grading expectation
- No instant score
- No AI feedback
- No immediate `View Results` action for pending-review pure Writing submissions

### `StudentWaitingRoomPage` and `TestResultsModal`
- Not the correct immediate post-submit surface for pure IELTS Writing
- Must not be auto-opened by Writing submit/auto-submit via `showResults: true`

### `StudentTestResultsPage` / `WritingResultView`
- Writing-aware result entry
- Pending-review state may show waiting-for-teacher-review messaging
- Graded state may show teacher-authored scoring and feedback
- Must not fabricate AI grading output

## Notifications and student expectation
- On submit, the system may confirm that work was submitted successfully.
- The meaningful next milestone is teacher grading completion, not instant auto-results.
- Current acknowledgement copy tells students to check the dashboard later or contact their teacher if they need an update.

## Forbidden regressions
- Do not route pure IELTS Writing submit to the waiting-room results modal.
- Do not set `showResults: true` as the immediate post-submit route state for pure IELTS Writing.
- Do not present pure IELTS Writing as if it were auto-graded.
- Do not show AI feedback or instant score on the post-submit acknowledgement surface.
- Do not treat the RTDB compatibility result as the canonical source of truth for Writing grading.
- Do not collapse pure IELTS Writing into shared generic saved-result shells as the primary workflow.

## Cross-check checklist before touching IELTS Writing
- Does the student submit path still land on `/submission-complete` for pure Writing?
- Do manual submit, timer expiry, and teacher-ended early submit still share the same destination contract?
- Does the acknowledgement copy still state teacher hand-grading and no instant AI feedback?
- Is the teacher grading queue still the front door for `pending-review` Writing work?
- Are Writing result readers still grounded in Firestore `writing_submissions` rather than only generic RTDB result shells?
- Did a new change accidentally re-open the waiting-room result modal for pure Writing submissions?

## Current runtime risks that still matter
- Compatibility RTDB materialization may fail independently of the canonical Firestore submission; that must not change the student-facing post-submit contract.
- Cross-store lifecycle seams remain sensitive: draft in RTDB, grading artifact in Firestore, later result access through Writing-aware bridges.
- Any new entry point that assumes every submitted test should open a generic result modal can reintroduce this bug.

## Related docs
- @doc/architecture/test-system-architecture
- @doc/architecture/results-academic-record
- @doc/prd/ielts-writing-test-system-prd
- @doc/prd/prd-test-duration-end-flow
- @doc/sop/ielts-writing-grading-permission-runtime-state


## 2026-03-29 crosscheck: grading, result flow, solo practice, homework

### Areas where current code still matches the intended contract
- Manual grading remains the core rule across IELTS Writing. New submissions enter Firestore `writing_submissions` with `markingStatus: 'pending-review'`, and final teacher grading moves them to `graded`.
- The teacher grading queue is still the operational entry point for ungraded work. It reads `writing_submissions` by `markingStatus === 'pending-review'` and lets teachers filter live-session, solo-practice, and homework submissions.
- Teacher draft saves no longer incorrectly remove work from the pending queue. Draft saves preserve `markingStatus: 'pending-review'`, while explicit submission writes `graded`.
- Student-facing Writing review still has the intended three-state model in `WritingResultView`: pending review, partially graded, and fully graded.
- Pure live-session IELTS Writing now respects the manual-grading post-submit contract: submit goes to `/submission-complete`, not to the generic waiting-room result modal.

### Solo practice: current state vs intended behavior
- The intended solo-practice contract is still visible in both PRD-0030 and code: `StudentPracticePage` detects IELTS Writing and routes into `WritingPracticeView`, which uses local draft persistence and creates canonical `writing_submissions` rows.
- Solo practice still supports teacher-directed review through `selectedTeacherId`, optional student note, and pending-review status.
- Solo practice also still supports no-teacher/self-review mode when the student has no enrolled teachers.
- Result materialization for solo practice writes the canonical RTDB result row plus the solo-practice student index, which keeps solo writing discoverable in the broader result system.

### Homework: current state vs intended behavior
- Homework Writing currently reuses `WritingPracticeView` and correctly applies deadline and late-submission checks.
- Homework Writing currently creates a `writing_submissions` record with `context.type = 'homework'`, `homeworkId`, and `markingStatus: 'pending-review'`.
- However, the implementation currently behaves more like adapted solo practice than a dedicated homework submission pipeline.

### Confirmed drift and unresolved mismatches
- **Homework teacher ownership drift:** the PRD says homework should auto-send to the assigning teacher, and the `WritingSubmission` type documents `assigningTeacherId` for homework. Current `WritingPracticeView` writes `selectedTeacherId` instead and does not populate `assigningTeacherId`.
- **Homework submission lifecycle drift:** the generic homework architecture expects homework attempts to transition through `homework_submissions` and to link `resultId` on submit. The current Writing homework path does not call `homeworkSubmissionService.submitHomework()`, so the homework attempt record is at risk of staying `in_progress` even when the writing submission itself exists.
- **Teacher notification drift on submit:** PRD-0030 says essay submission (solo/homework) notifies the teacher. Current `notifyWritingSubmitted()` notifies the student and links them to academic record; no teacher-side writing-submit notification path was found in the current workspace.
- **Student writing-progress drift:** `WritingProgressSection` queries `writing_submissions` but still reads stale field names (`status`, `gradingResult`, `testMeta.title`) instead of the current schema (`markingStatus`, `grading`, `testMeta.testTitle`). This means the writing-only academic-record surface is not a reliable source of truth for current Writing status/band data.
- **Generic saved-result shell drift:** student result panels driven by `ResultSlidePanel` still disable `writingPlaceholder`, so the generic academic-record detail surface is not currently the canonical Writing review surface even when a writing result row exists.
- **Non-live Writing result-entry fragmentation:** live-session Writing has a dedicated session result reader, while solo/homework Writing depends more heavily on academic-record and writing-specific surfaces. These entry points are not yet fully unified.
- **Ownership governance drift:** current pending-review queue filtering still trusts `assigningTeacherId` / `selectedTeacherId` convenience fields. The broader result-governance docs already flag this as a long-term risk because those fields are not meant to be the final authority model.

### Documentation staleness warnings
- Some older solo/homework architecture docs still describe generic `StudentSoloTestPage` / generic result-detail flows. Those descriptions are no longer sufficient for IELTS Writing, which now uses `StudentPracticePage` + `WritingPracticeView` + `writing_submissions` + Writing-specific review surfaces.
- The stable invariant is stronger than any individual older flow document: IELTS Writing is manual-review first, and result access must remain compatible with that teacher-owned lifecycle.

### Current implementation crosscheck to apply before future changes
- Verify whether the change touches live-session Writing, solo Writing, homework Writing, or more than one of them.
- Confirm whether the student-facing surface is an acknowledgement page, a writing-aware result page, a teacher queue/editor, or only a generic saved-result shell.
- Check whether the code path writes the canonical `writing_submissions` row, the required RTDB result/index rows, and any homework submission linkage that the reader surfaces expect.
- Check whether teacher ownership is being inferred from convenience metadata or from the broader visibility/ownership model.
- Treat solo practice and homework as separate Writing contracts even when they reuse `WritingPracticeView`; they currently share UI but do not share exactly the same ownership and status semantics.


## 2026-03-29 crosscheck: teacher grading compatibility result reconstruction

### Confirmed current state
- Firestore `writing_submissions` remains the canonical grading artifact for IELTS Writing.
- RTDB `test_results` remains a compatibility and discoverability projection.
- Teacher final grading is allowed to reconstruct the RTDB result when the canonical compatibility row is missing or unreadable.

### Runtime risks that still matter
- Submission-time and grading-time result materialization still share the same helper, so persistence regressions remain cross-surface.
- Result-reader surfaces can still drift if a future refactor treats RTDB as canonical instead of reconstructible projection state.
- Hosted runtime mismatch remains possible if code deploys and Firebase rule deploys are not kept in sync.

### Crosscheck to apply before future changes
- Does teacher grading still succeed when `test_results/{submissionId}` is absent?
- Does the system still rebuild the compatibility row from Firestore submission state plus session context?
- Are RTDB secondary indexes still written only after the canonical root row exists?
- Do academic record and result-reader surfaces still receive discoverable RTDB projections after grading?

### Related docs
- @doc/architecture/architecture-ielts-writing-grading-submit-compatibility-audit-2026-03-29
- @doc/architecture/results-academic-record
- @doc/sop/ielts-writing-grading-permission-runtime-state

## 2026-03-29 Implementation Status Update

The app now matches the documented manual-grading contract more closely in the async Writing paths:

- `WritingPracticeView` now persists homework Writing submissions with `context.assigningTeacherId` and `context.homeworkSubmissionId`, while solo practice continues to use `context.selectedTeacherId`.
- Homework Writing submit now also finalizes the linked `homework_submissions/{submissionId}` row through `submitHomework(...)` so the async homework lifecycle no longer stalls at `in_progress` after the essay itself was already saved.
- Final IELTS Writing grading now propagates back into `homework_submissions/{submissionId}` through `markHomeworkSubmissionGraded(...)`, storing the graded state plus `bandScore` for homework-facing student surfaces.
- Teacher-facing async Writing submit notification now exists for solo practice and homework, linking directly to `TEACHER_GRADING_DETAIL`.
- `WritingProgressSection` now reads the live schema (`testMeta.testTitle`, `markingStatus`, `grading.overallBand`, `grading.perTask`).
- Homework student surfaces no longer render fake `undefined%` values for manual-review Writing attempts. Pending-review rows now show waiting-state copy, and graded Writing attempts can surface a band score.
- `ResultSlidePanel` now treats Writing results as Writing-specific placeholder content instead of forcing generic score-summary/answer-map shells for rows that have no auto-graded question set.

Remaining note:

- The slide panel still exposes a Writing placeholder shell, not the full dedicated `WritingResultView` experience. That is acceptable for now because it preserves the manual-review contract and avoids blank or misleading auto-graded UI, but it remains a deliberate simplification.


## UI Finalization Pointer

For current finalized expectations of the teacher writing grading editor surface and comment behavior, see @doc/specs/ielts-writing-grading-editor-finalization-2026-03-30.


## 2026-04-02 implementation update: grading editor state and compatibility

### Teacher workflow amendments
- Pending-review submissions now load in review mode first; editing begins only after lock ownership is confirmed.
- The grading page normalizes the first active task from the actual submission tasks, so `task2-only` submissions open correctly.
- Task switching and grading-source reloads are hard state boundaries for editor rehydration and transient UI state.
- Unsaved comment composers are part of the grading draft contract and participate in unsaved-work detection.
- Leave, regrade, and draft-takeover paths now require explicit in-app dialogs instead of browser confirm/prompt flows.

### Compatibility artifact amendments
- RTDB compatibility results now write explicit teacher metadata in addition to legacy aliases:
  - `feedbackUpdatedByTeacherId`
  - `feedbackUpdatedByTeacherName`
- Writing result readers should prefer those explicit fields and use legacy `feedbackUpdatedBy` only as fallback.
- Degraded fallback reconstruction must preserve the real surviving task number so a single Task 2 result reconstructs as `task2-only`.

### Lock and save safety amendments
- grading locks are session-aware (`teacherId + sessionId`), so another tab owned by the same teacher is still a lock conflict
- save completion must always clear the saving state even on failure
- version conflicts must reload the latest grading state rather than silently overwriting it


## 2026-04-02 implementation update: essay editor tool contract

Teacher IELTS Writing grading now depends on an explicit essay-editor tool contract:
- read-only grading views must not mutate markup through toolbar, bubble-menu, shortcut, or queued-command paths
- quick comments depend on an anchored selection snapshot from the page rather than a later live DOM selection
- comment marks are single-identity per text slice and removals target a specific `commentId`
- text-color reset clears marks rather than storing `inherit`

This lowers the remaining editor risk to overlapping-mark composition semantics instead of basic tool routing.

Related doc:
- @doc/architecture/ielts-writing/ielts-writing-essay-editor-tool-contract-and-mark-composition-2026-04-02


## 2026-04-02 implementation update: correction mark composition

Current teacher IELTS Writing grading assumes the essay editor enforces these correction-overlap rules:
- correction is the dominant inline mark
- new correction/comment overlap is blocked at creation time
- new highlight/comment/strikethrough/text-color operations are blocked on corrected text
- correction apply strips presentation marks (`highlight`, `strike`, `textStyle`) before persistence
- legacy correction+comment overlap remains readable, with correction click handling taking precedence

Related doc:
- @doc/architecture/ielts-writing/ielts-writing-essay-editor-tool-contract-and-mark-composition-2026-04-02

## 2026-04-03 implementation update: authoring edit shell and publish contract

Teacher authoring now has an explicit split between create and edit surfaces.

Current rules:
- `TestCreationModal` is create-only for IELTS Writing
- `WritingTestEditModal` is the edit and resume surface for existing writing drafts and published materials
- writing edit uses the shared edit shell (`Modal` + `EditTestFrame`) with `Questions`, `Context & Resources`, and `Settings`
- published writing materials save through one primary `Save Changes` action rather than a separate `Publish Updates` action
- unpublished writing drafts keep `Save Draft` plus `Publish Test`
- writing draft visibility (`isPublic`) must survive draft save, publish, and edit-resume hydration

Detailed reference:
- @doc/architecture/ielts-writing/ielts-writing-authoring-edit-shell-and-publish-contract-2026-04-03

## 2026-04-03 implementation update: active-task AI suggestion runtime

- the teacher-only AI suggestion helper now generates for the active essay/task only, not by warming every task in a submission on first load
- suggestion runs are browser-side and use visible run-state, lease-heartbeat, and interruption recovery instead of assuming a background worker
- the active suggestion run starts with one combined batch and immediately fans out to 4 quadrant calls if the combined batch is unhealthy
- surfaced findings append across `Force Regenerate` and `Generate More`; they are not replaced wholesale on each run
- short-lived raw AI artifacts now live under teacher-private Firestore `writing_grading_ai_cache/{submissionId}/generation_runs/*` and require matching Firestore rules deployment to avoid post-generation permission failures
- the teacher review modal is sentence-ordered and grouped so the review list follows essay progression
- approving a suggestion now materializes the saved comment or correction immediately through the existing grading infrastructure; there is no secondary confirmation step inside the suggestion modal
- the review modal no longer exposes a separate `Focus in Essay` action

## 2026-04-05 implementation update: live and homework copy paste toggle

Live-session delivery amendments:
- `WritingTestPage` now resolves essay copy/paste blocking from `game_sessions/{sessionCode}.antiCheatConfig?.detectCopyPaste` instead of treating Writing as always-on.
- missing live-session anti-cheat config means copy/paste prevention is off for Writing.
- `WritingEditor` no longer owns the paste-prevention hook; the page owns one shared hook instance and passes `attachToTextarea` into the editor.
- saved RTDB writing state now restores `pasteAttemptCount`, and the page re-syncs that count to RTDB before submit so `autoSubmitFromRTDB()` snapshots the current value.

Homework delivery amendments:
- `WritingPracticeView` now resolves essay copy/paste blocking from `homework_assignments/{homeworkId}.antiCheatConfig?.detectCopyPaste`.
- missing homework anti-cheat config means copy/paste prevention is off for homework Writing.
- homework saved local Writing state now persists and restores `pasteAttemptCount` together with the essay draft and timer anchor.

Scope boundary:
- solo Writing practice remains on its prior always-enabled Writing paste-prevention behavior in this implementation pass.
- the Writing domain still uses the specialized external paste/drop/bulk insert guard with internal-copy allowance instead of the generic container-wide anti-cheat stack.

Detailed reference:
- @doc/architecture/ielts-writing/ielts-writing-copy-paste-toggle-and-attempt-persistence-2026-04-05

## 2026-04-05 implementation update: published result interaction parity

Current-state amendments:
- Student and teacher published Writing result readers now share the same read-only published-markup viewer contract for tooltip geometry and correction visibility.
- This standardizes published correction visibility across both result-surface families without importing grading-editor-only correction/comment sidebar behavior into result readers.
- Student result surfaces may still present one ordered published-feedback rail that contains both comments and corrections; this remains distinct from the teacher grading editor's comment-only sidebar.
