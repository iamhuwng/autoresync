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

## 2026-04-05 Amendment - Published Result Feedback Contract

Published-result reader rules:
- student and teacher Writing result surfaces must consume the same read-only published-markup viewer instead of drifting into separate tooltip or correction-rendering behavior
- published correction data is part of the canonical published feedback artifact and must remain visible on both student and teacher result readers
- student result readers may expose a neutral `Feedback` rail instead of overloading the label `Comments`
- published feedback panels should keep comments and corrections as separate ordered sections inside the same read-only surface instead of flattening them into one undifferentiated lane
- teacher result readers must expose that grouped published feedback surface as well; they must not silently omit corrections or reduce published feedback to summaries-only sidebars

Published overlay rules:
- read-only published hover tooltips must follow the same viewport-overlay geometry contract as the grading editor instead of container-local absolute positioning
- published tooltip placement should derive from the hovered mark rectangle and prefer right, left, bottom, then top placement while clamping to the viewport
- published tooltip overlays should dismiss on scroll or resize when the current anchor geometry is no longer trustworthy

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

## 2026-04-05 Amendment - Grading Overlay Attachment And Same-Range Annotation Ownership

Overlay attachment rules:
- escaping clipping containers is necessary but not sufficient; the essay comment hover tooltip must also derive its placement from the hovered mark rectangle so the overlay reads as attached to the annotation instead of merely remaining onscreen
- the tooltip should choose the nearest intelligible side in this order: right, left, bottom, then top, while still clamping to the viewport
- tooltip rendering should carry explicit placement state so the UI can render a directional attachment cue

Same-range ownership rules:
- a correction action may optionally piggyback-create a normal comment anchored to the same selected source text, but that does not make corrections part of the `Comments` rail contract
- same-range `commentMark` plus `correctionMark` is an intentional supported state; correction click/edit routing remains correction-owned, while comment discovery and editing remain comment-rail-owned
- when both marks overlap, correction owns the outer visual wrapper so the saved comment stays attributable to the original selected text and does not visually extend across the rendered replacement text

## 2026-04-05 Amendment - Published Result Viewer Interaction Contract

Read-only viewer rules:
- `WritingPublishedMarkupViewer` is the shared published-markup reader for student and teacher result surfaces, so tooltip geometry and overlay-mounting rules must live at that shared viewer boundary rather than being reimplemented per shell
- published-result hover tooltips must follow the same body-portal, viewport-clamped, side-adjacent placement contract as the grading essay editor
- read-only viewer scroll/resize changes must dismiss stale tooltip geometry instead of leaving detached overlays on screen

Published feedback rules:
- student result surfaces may keep one published `Feedback` rail, but comments and corrections should render as separate sections inside that rail instead of being flattened under a comments-only label
- teacher result readers must pass both published comments and published corrections into the shared viewer; corrections-only tasks still count as published markup
- read-only result readers do not inherit grading-editor-only correction editing, comment drafting, or correction-owned sidebar routing semantics

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
## 2026-04-02 Amendment - Teacher-Private AI Suggestion Cache Governance

Teacher-private helper-state rules:
- Firestore `writing_grading_ai_cache/{submissionId}` is a teacher-private helper collection for AI-generated grammar and vocabulary/expression suggestions
- suggestion cache documents are operational aids only; they are not canonical grading artifacts and they do not replace `gradingDraft` or `publishedGrading`
- the collection exists separately from `writing_submissions` because the submission document still supports broader queue and review access patterns

Access rules:
- assigned teachers may `get`, `create`, and `update` their suggestion cache document
- `list` is denied to reduce broad discovery of teacher-private helper state
- students and unrelated teachers must not read or write suggestion cache documents

Publishing boundary:
- AI suggestions do not change release state, result visibility, or result ownership
- suggestions only become grading content if a teacher explicitly approves them into the existing comment or correction authoring tools
- approved suggestion comments are materialized as saved comments immediately through the existing grading infrastructure
- approved suggestion corrections are materialized as correction marks immediately through the existing grading infrastructure
- suggestion approval must still respect active composer / correction conflicts and must never auto-publish grading output

## 2026-04-03 Amendment - Suggestion Run Artifact And Runtime Governance

Active-run rules:
- writing suggestions now generate for the active essay/task only, not by warming every task in the submission
- active browser-side runs must publish run-state metadata for the active task, including run status, accepted-count progress, and a short-lived generation lease
- stale generation leases must be recoverable as `interrupted` so the grading page can safely retry instead of remaining stuck in `generating`

Artifact rules:
- Firestore `writing_grading_ai_cache/{submissionId}/generation_runs/{runId__attemptId}` is a teacher-private diagnostic artifact subcollection for short-lived raw AI request and response data
- artifact documents are diagnostic-only operational state; they are not grading artifacts and they do not affect release, ownership, or publication semantics
- artifact documents may store raw prompt text, raw response text, repaired JSON, provider metadata, token metadata, acceptance/drop summaries, and expiry timestamps
- artifact retention is intentionally short-lived and should be governed by TTL cleanup, not indefinite history accumulation

Access rules:
- the same assigned-teacher-only boundary that protects `writing_grading_ai_cache/{submissionId}` also protects the `generation_runs` subcollection
- a Firestore rules deployment is required whenever the helper-state contract adds a new subcollection path; otherwise the UI may succeed in AI generation but fail while persisting diagnostic artifacts

## 2026-04-03 Amendment - Writing Authoring Visibility And Publish Governance

Authoring-state rules:
- writing edit and resume flow is owned by `WritingTestEditModal`, not `TestCreationModal`
- the writing editor uses the shared edit shell and shared settings tab

Visibility rules:
- `isPublic` is part of the writing draft contract and must survive draft save, publish, and edit-resume hydration
- the writing `Public Test` toggle is operationally meaningful and must never be display-only

Publish-action rules:
- published writing materials must use a single primary save/update action instead of a redundant secondary `Publish Updates` button
- unpublished writing drafts still keep separate `Save Draft` and `Publish Test` actions

Detailed reference:
- `authoring-edit-shell-and-publish-contract.md`

## 2026-04-05 Amendment - Live And Homework Copy Paste Toggle Governance

Control-source rules:
- IELTS Writing delivery must reuse the existing `AntiCheatConfig.detectCopyPaste` flag instead of adding a Writing-only metadata toggle.
- live Writing resolves that flag from `game_sessions/{sessionCode}.antiCheatConfig.detectCopyPaste`.
- homework Writing resolves that flag from `homework_assignments/{homeworkId}.antiCheatConfig.detectCopyPaste`.
- missing config means copy/paste prevention is off for live Writing and homework Writing.

Delivery-state rules:
- `WritingEditor` must stay a thin textarea wrapper; it may attach paste-prevention listeners but must not own the hook instance or the attempt count.
- the live/homework delivery host owns one shared `useExternalPastePrevention(...)` instance and passes `attachToTextarea` into `WritingEditor`.
- the Writing domain still uses the specialized external paste/drop/bulk insert guard with internal-copy allowance; this amendment does not switch Writing onto the full generic anti-cheat container stack.

Persistence rules:
- live-session Writing must persist `pasteAttemptCount` under `game_sessions/{sessionCode}/students/{studentUid}/writing/pasteAttemptCount` so the promotion bridge reads the current value.
- `autoSubmitFromRTDB()` remains the canonical bridge from RTDB draft state into Firestore submission state and must keep materializing that RTDB paste-attempt count into `writing_submissions/{submissionId}`.
- homework Writing saved local progress must persist and restore `pasteAttemptCount` alongside essays and timer anchor state so refresh/resume does not silently reset integrity evidence.

Scope boundary:
- this amendment governs live Writing and homework Writing only.
- solo Writing practice remains on its prior always-enabled Writing paste-prevention behavior in this implementation pass.

Detailed reference:
- `copy-paste-toggle-and-attempt-persistence.md`
