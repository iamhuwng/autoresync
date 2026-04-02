# IELTS Writing Contracts And Governance

## Canonical Data Contract

Primary source:
- Firestore `writing_submissions/{submissionId}`
- `publishedGrading` is the canonical published artifact

Compatibility / fallback:
- RTDB `test_results` is still required for discovery, release gating, and compatibility
- Firestore `grading` and `annotations` are legacy fallback only
- degraded readers may synthesize a read-only fallback from the RTDB Writing snapshot when canonical detail is unavailable

## Result-Shell Relationship

Writing does not replace the shared result-shell governance layer.

Instead:
- the shared shells still own routing, container chrome, and release/access gates
- Writing-specific readers own the actual Writing content model
- Writing must not be forced back into `SharedSavedResultCore` assumptions

## Visibility And Ownership Rules

- normalized `result.visibility` remains the authority for ownership and teacher inclusion
- raw `teacherId`, `assigningTeacherId`, and `selectedTeacherId` are never authority signals
- solo practice is student-owned and teacher-read-only where visible
- unresolved rows remain excluded from teacher-owned views and analytics
- deleted-source display is allowed only when ownership was proven at submission time

## Storage And Compatibility Rules

- Writing metadata in RTDB supports discovery and compatibility but does not replace the authoritative linked source
- persistence fixes must preserve both canonical Firestore state and RTDB discoverability/indexing
- a graded Firestore submission with a broken RTDB compatibility projection is still an incident state, not an acceptable steady state

## Release-State And Access Rules

- pure Writing submit is acknowledgement-only until feedback is published
- student published access follows the same release-state contract as other saved-result shells
- teacher detail access still depends on the outer assignment gate plus normalized ownership resolution

## Interaction Rules Worth Preserving

- the grading tool is the authoring surface; student results are read-only reflections of published feedback
- student comment-rail behavior should stay aligned with the grading-tool reading model without exposing editing controls
- teacher result readers may support reopen / re-entry into grading when permissions allow

## Detailed References

Use these for implementation detail, not this summary doc:
- grading editor finalization:  
  `../../../.knowns/docs/specs/ielts-writing-grading-editor-finalization-2026-03-30.md`
- result surfaces spec:  
  `../../../.knowns/docs/specs/ielts-writing-result-surfaces-2026-03-30.md`
- current-state scheme:  
  `../../../.knowns/docs/architecture/scheme/ielts-writing-current-state-scheme.md`
- compatibility audit:  
  `../../../.knowns/docs/architecture/architecture-ielts-writing-grading-submit-compatibility-audit-2026-03-29.md`
- shared visibility governance:  
  `../result-visibility-ownership-governance.md`
- shared result-view policy pack:  
  `../result-view/README.md`

## 2026-03-30 Amendment - Shared Comment-Rail Interaction Contract

The wide student Writing result surface and the teacher grading editor now intentionally share the same cross-column comment-navigation model.

Shared interaction rules:
- clicking highlighted essay text forces the `Comments` tab open
- the whole comments rail moves as one block
- the selected comment remains in normal list order
- the right-side visual anchor is the selected comment header row
- the left-side visual anchor is the clicked annotation top line
- the alignment target is `selected comment header top == clicked annotation top`

This preserves interaction continuity between the authoring tool and the published reader.

## 2026-04-01 Amendment - Homework Delivery Timer Contract

IELTS Writing homework delivery now depends on explicit route-state handoff from the homework shells into `StudentPracticePage` and `WritingPracticeView`.

Required homework delivery fields:
- `homeworkId`
- `submissionId`
- `teacherId`
- `dueDate`
- `lateSubmissionAllowed`
- `timerMinutes`
- `maxAttempts`
- `startedAt`

Homework timing and resume rules:
- Writing homework must prefer the homework-assigned timer override over solo/default Writing timing
- `undefined` timer means "fallback to test duration", while explicit `null` means "no timer"
- the homework attempt `startedAt` value is the canonical countdown anchor across close-tab and resume flows
- single-attempt homework must auto-resume saved local progress and must not show a restart choice
- if a resume decision modal is shown for multi-attempt homework, the timer must pause while that decision is pending
- timer expiry in homework mode must auto-submit the homework attempt instead of leaving a local-only draft

## 2026-04-02 Amendment - Grading Editor Selection And Correction Rendering Contract

The teacher grading editor now treats the current text selection as a first-class interaction state for fixed-toolbar actions.

Selection-preservation rules:
- fixed-toolbar annotation actions that operate on the active essay selection must execute from `mousedown` and prevent the browser's default blur behavior
- the grading editor must not depend on `click` for selection-scoped toolbar actions because the selection may collapse before the command runs
- if selection geometry cannot be resolved for the floating bubble menu, the menu should hide instead of throwing or breaking the editor session

Correction-rendering rules:
- correction markup must render the original text and the replacement text as separate inline DOM nodes
- the original text remains struck through and visually muted
- the replacement text must never inherit the original strikethrough styling
- the visible replacement text should remain non-editable annotation output, not part of the student's editable essay content
- queued correction replay must trim selection-boundary whitespace before applying the correction mark so spaces remain outside the struck-through original span
- when a teacher selection accidentally includes a trailing space, the replacement text must still read as a normal phrase boundary with the following word instead of gluing the replacement to downstream content
- queued correction replay must normalize the replacement text against the next essay character so adjacent words end up separated by exactly one space, even if the teacher omitted the space or typed extra trailing spaces in the popup

Correction-editing rules:
- in grading edit mode, clicking an existing correction mark should reopen the correction popup anchored to that mark
- the popup should preload the stored replacement text for in-place editing
- the popup must support deleting the correction mark entirely without forcing the teacher to recreate the selection

Queued correction-application rule:
- when replaying a queued correction against a stored selection range, the editor should apply the mark directly without forcing an extra focus-and-scroll cycle first

## 2026-04-02 Amendment - Grading Overlay Containment And Correction Removal Contract

Correction-removal rules:
- deleting a correction from the grading popup must remove only the `correctionMark` metadata from the selected range
- deleting a correction must never delete or replace the student's original essay text
- reopening a correction for edit/delete must resolve against the stored marked range, not a fresh manual reselection

Correction-visual rules:
- correction replacement text is teacher-authored annotation output and should render in red to distinguish it from the student's original text
- the original span remains muted and struck through while the visible replacement remains unstruck

Overlay-containment rules:
- the correction popup, comment hover tooltip, and selection bubble menu must not be rendered inside clipping containers such as the editor card, essay wrapper, or scrollable editor viewport
- those overlays should anchor from viewport coordinates and clamp to visible screen bounds so they remain usable near the top, bottom, or side edges of the grading surface
- editor scroll and window resize must trigger overlay repositioning or dismissal so stale coordinates do not leave popups floating in the wrong place

## 2026-04-02 Amendment - Grading Draft, Lock, And Compatibility Ownership Contract

Task-state rules:
- the grading editor must normalize the initial active task from the loaded submission shape instead of assuming Task 1 exists
- `task2-only` submissions are valid first-class grading targets and must open directly into Task 2
- task switches and grading-source reloads are hard state boundaries; task-scoped queued commands and transient overlays must be cleared before the next task becomes active

Draft-state rules:
- pending new-comment composers are unsaved grading state and must be persisted per task inside the grading draft payload
- unsaved-work detection must include pending comment drafts, not just the main dirty flag
- save completion must always release the saving state even when the save fails
- version-conflict failures must reload the latest grading state instead of silently overwriting another version

Leave / regrade / takeover rules:
- destructive grading decisions must use explicit in-app dialogs rather than `window.confirm` or `window.prompt`
- leave flow must preserve a real cancel path that leaves the page, lock, and draft state unchanged
- regrading requires an explicit reason
- discarding another teacher's private draft requires an explicit takeover reason

Lock-ownership rules:
- grading locks are session-aware
- identical `teacherId` values across different `sessionId` values are conflicts, not shared ownership
- lock renewal failure must demote the page back to review/read-only assumptions until editing is reacquired

Compatibility metadata rules:
- published Writing projections to `test_results` must write explicit teacher metadata in addition to legacy aliases:
  - `feedbackUpdatedByTeacherId`
  - `feedbackUpdatedByTeacherName`
- Writing result readers should prefer those explicit fields and only fall back to legacy label fields when the explicit fields are absent
- degraded fallback reconstruction must preserve the real surviving task number so a single Task 2 snapshot reconstructs as `task2-only`
