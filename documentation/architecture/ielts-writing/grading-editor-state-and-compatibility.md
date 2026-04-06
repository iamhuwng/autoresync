# IELTS Writing Grading Editor State And Compatibility

## Purpose

This document records the current runtime contract for the teacher IELTS Writing grading editor after the 2026-04-02 stabilization pass.

It focuses on the parts that were previously brittle:
- task normalization and task switching
- editor rehydration boundaries
- pending comment drafts and unsaved-work detection
- leave, regrade, and draft-takeover dialogs
- lock ownership and lock-loss behavior
- compatibility metadata written to `test_results`

## Core Runtime Rules

### Task Normalization

- `WritingGradingPage` must derive its initial active task from the actual submission tasks, not from a hard-coded Task 1 assumption.
- `task2-only` submissions must open directly into Task 2.
- any source reload, reset, or version-conflict reload must preserve the active task only if that task still exists in the current submission.

### Task-Bound Editor Rehydration

- changing task or reloading grading state is a hard editor boundary
- the essay editor and feedback editor must both reload from incoming props when that boundary is crossed
- task-bound transient UI state must be cleared on that boundary:
  - focused / hovered comments
  - anchor positions
  - queued quick-comment commands
  - queued correction commands
  - queued comment-mark mutations
  - correction popup state
- task switching must not leak Task 1 essay markup or feedback into Task 2, or vice versa

### Essay Editor Contract

- `EssayEditor` is task-scoped even when React reuses the page component
- incoming `initialContent` / `originalEssayText` changes must rehydrate the TipTap instance
- queued commands must include `taskNumber` and be ignored when they target another task
- selection-driven quick comments must carry an explicit `from` / `to` / `selectedText` snapshot from the page, not depend on whatever selection is live later
- correction-mark clicks must reopen correction editing without requiring a native reselection
- correction deletion removes only the mark metadata, never the student's original text
- `readOnly` disables tool mutations from toolbar, bubble menu, shortcuts, and queued command replay
- toolbar presence is controlled by editor interactivity: the persistent essay toolbar is available only in editable `marked` mode, not by whether a specific command currently has history or selection state
- the four persistent essay controls (`undo`, `redo`, `comment`, `correction`) must survive task switches and source rehydration unchanged
- one text slice may hold at most one comment mark, and comment removal must target the exact `commentId`
- text-color `Default` clears the color mark instead of persisting a literal `inherit` value
- toolbar controls must remain keyboard-activatable while still preventing editor blur on pointer interaction
- core toolbar icons must use self-contained SVG or React icon components with accessible labels instead of font-ligature icon families
- correction is the dominant composition mark:
  - new corrections are blocked on ranges that already contain comment/correction marks
  - new highlight/comment/strikethrough/text-color mutations are blocked on ranges that already contain a correction mark
  - correction application strips highlight, strike, and text-color marks before persisting the correction mark
  - legacy correction+comment overlap remains readable, but correction click handling wins over comment click routing

### Feedback Editor Contract

- `TabbedFeedbackEditor` must rebuild its internal per-tab cache from incoming `feedback`
- real task changes reset the active tab to `taskSummary`
- same-task source reloads must keep the current tab but replace the tab content from props
- same-value controlled updates must not re-run `setContent(...)` and clobber active formatting commands
- list formatting must survive the parent `onChange -> rerender -> feedback prop` loop without collapsing back to paragraphs
- toolbar buttons must preserve editor selection on `mousedown` so list toggles operate on the intended block instead of blurring first

## Draft And Unsaved-Work Rules

### Pending Comment Drafts

- open comment composers are unsaved grading state
- pending comment drafts are stored per task inside the grading draft payload
- unsaved-work detection must include both:
  - normal dirty grading state
  - pending comment draft state that differs from the last saved draft signature

### Save Safety

- autosave and manual save must both use the same draft builder
- save completion must always clear `saving` in a `finally` path
- save failures must preserve editability and dirty state
- version conflicts must reload the latest grading source instead of silently overwriting it

### Leave / Regrade / Takeover

- the grading page must use explicit in-app dialogs for destructive workflow decisions
- leaving with unsaved work supports exactly three outcomes:
  - `Save Draft and Leave`
  - `Discard and Leave`
  - `Cancel`
- regrading a published submission requires a regrade reason
- discarding another teacher's private draft requires a takeover reason

## Lock And Ownership Rules

- grading locks are session-aware, not just teacher-aware
- `teacherId + sessionId` is the real ownership identity
- the same teacher in another tab or browser session is a lock conflict, not implicit ownership
- heartbeat / renewal failure must return the page to review mode and block further editing assumptions

## Compatibility Result Metadata

### Canonical

- Firestore `writing_submissions/{submissionId}` remains the canonical grading source
- `publishedGrading` is the canonical published artifact
- `gradingDraft` remains the canonical unpublished teacher draft

### Compatibility Projection

- RTDB `test_results` still carries Writing result discovery and compatibility metadata
- published compatibility writes must include explicit teacher metadata:
  - `feedbackUpdatedByTeacherId`
  - `feedbackUpdatedByTeacherName`
- legacy label-style fields remain readable for backward compatibility but are no longer the only source of truth

### Fallback Result Reconstruction

- degraded fallback reconstruction must preserve the real surviving task number
- a single surviving Task 2 result must reconstruct as `task2-only`, not `task1-only`

## Reader Expectations

- student and teacher result readers should prefer explicit teacher ID/name metadata when available
- legacy compatibility labels are fallback-only
- notification-triggering feedback saves should remain explicit and not fire on every incremental write burst

## Related Documents

- `README.md`
- `lifecycle-and-surfaces.md`
- `contracts-and-governance.md`
- `essay-editor-tool-contract-and-mark-composition.md`
- `../../../.knowns/docs/specs/ielts-writing-grading-editor-finalization-2026-03-30.md`
- `../../../.knowns/docs/architecture/scheme/ielts-writing-current-state-scheme.md`
## 2026-04-02 Amendment - AI Suggestions Cache And Injection Contract

Suggestion-state rules:
- `WritingGradingPage` treats AI suggestions as teacher-private helper state, not canonical grading state
- opening a submission may trigger suggestion generation in parallel with normal editor loading, but the grading editor must remain usable while suggestions are loading
- suggestion generation warms all available tasks for the submission in one pass so Task 1 and Task 2 switching do not retrigger generation waits
- existing `ready` and `failed` cache states are reused on later opens; regeneration happens only through explicit `Reload Suggestions`

Cache-shape rules:
- teacher-only suggestion cache lives in Firestore `writing_grading_ai_cache/{submissionId}`
- cache status is one of `generating`, `ready`, or `failed`
- the persisted payload is per task and split into `grammar` and `vocabularyExpression`, each with `comments` and `corrections`
- normalized suggestion items must preserve `sentenceIndex`, `anchorText`, exact `from` / `to` offsets, `kind`, `focus`, `categoryId`, and the teacher-facing comment or replacement payload

Injection rules:
- comment suggestion injection must reuse the existing pending comment draft flow instead of creating a second authoring path
- correction suggestion injection must reuse the existing correction popup instead of applying marks directly
- suggestions never write directly into `publishedGrading`
- if a pending comment draft already exists, comment injection must be blocked and the existing draft-warning path must be used

Failure rules:
- AI failure records a persisted `failed` cache state so the teacher sees a stable retry affordance instead of silent background loops
- suggestion failure must not block normal grading, saving, or publishing flows

## 2026-04-04 Follow-up - Review Correction Linking And Comment-Rail Identity

### Parent-Owned View Mode Remains Authoritative
- `editorViewMode` is page state owned by `WritingGradingPage`.
- Editor remounts, task changes, and source rehydration must not silently push the page back to `marked` after the teacher selects `original`.

### Review-Mode Correction Linking
- Corrections shown in review mode must behave as first-class comment-tab items.
- Clicking a correction mark in the essay must force-open `Comments`, focus the matching sidebar item, and preserve visible linkage even when the correction originated from older saved markup.
- Sidebar correction items therefore depend on correction identity derived from the rendered editor surface, not only on newly persisted ids.

### Comment-Anchor Measurement Boundary
- Page-side anchor measurement must target essay marks only.
- Gutter dots are navigational affordances and must not share the same selector identity as essay comment marks, otherwise anchor-position reads can target the dot itself and corrupt the left-rail alignment state.

### Shared Comment Highlight Compatibility
- New and legacy comments now converge on one shared yellow highlight treatment at render time.
- Persisted legacy `comment.color` data may still exist for compatibility, but runtime rendering and gutter-dot affordances should normalize to the shared yellow comment highlight.

## 2026-04-04 Follow-up - Current Annotation Workflow Surfaces

### Supported Teacher Tool Model
- The grading page now uses a hybrid annotation model instead of the older full toolbar.
- Persistent essay controls live in the sticky editor bar: `undo`, `redo`, `comment`, and `correction`.
- The persistent four-button toolbar is owned by editable `marked` mode. Task rehydration, task switching, and command availability may disable individual actions but must not remove the toolbar surface.
- Core persistent controls must render with self-contained SVG or React icons plus accessible labels; they must not rely on font-ligature icon families that can degrade into visible text.
- Range-local controls live in the bubble menu: `comment`, `correction`, and optional `strikethrough`.
- Manual `highlight` and manual `text color` creation are no longer part of the active teacher authoring workflow.

### Comment And Correction Parity In The Sidebar
- The `Comments` tab is the shared review surface for both comment annotations and correction annotations.
- Focus, hover, edit, and delete flows must work when initiated from either the essay surface or the sidebar item.
- Review-mode interaction must preserve this parity for both current and legacy saved markup.

## 2026-04-05 Follow-up - Correction/Comment Interaction Split

- `Comments` tab is now comment-only. Correction cards and correction edit/delete actions no longer live in the comment rail.
- Page/editor focus is split:
  - comment focus remains rail-linked state
  - correction focus is separate editor-local/page-local state used only for correction interaction
- The correction popup can piggyback-create a normal comment on the same selected source range without auto-switching the right rail to `Comments`.
- This pass keeps the persisted schema unchanged:
  - comments remain first-class records in `WritingTaskMarkupState.comments`
  - corrections remain markup-derived from `markedContent`
- Legacy overlapping correction/comment markup remains supported, but the overlap is no longer modeled as shared sidebar identity.

## 2026-04-05 Second Follow-up - Piggyback Comment Ownership And Overlay Escape

- Piggyback comments created from the correction popup remain first-class entries in `WritingTaskMarkupState.comments` with the original selected source range as their persisted anchor.
- Same-range correction + comment is still supported, but the render contract is now explicit: correction owns the outer visual wrapper, while the comment mark remains scoped to the original source text slice.
- Teacher essay overlays are no longer mounted inside the essay subtree. Hover comment tooltips and selection bubble menus now escape through a body portal, matching the correction popup's viewport-overlay architecture.

## 2026-04-05 Third Follow-up - Comment Tooltip Adjacency

- Teacher essay hover tooltips now use anchor-aware side placement instead of a fixed left-aligned above/below heuristic.
- This is a runtime interaction contract change only; persisted comment anchors remain unchanged.
- The goal of the new heuristic is attribution clarity: the tooltip should read as attached to the hovered annotation, not merely remain visible inside the viewport.

## 2026-04-06 Follow-up - Pending Draft Anchor Geometry And Rail Ordering

- `WritingPendingCommentDraft` now carries optional `anchorViewportTop` geometry so an unsaved comment draft has a positioning source of truth.
- The `Comments` rail no longer treats a pending draft as a footer-only block with `scrollIntoView()` as its primary positioning behavior.
- Pending drafts participate in the same ordered rail model as saved comments and are inserted by canonical essay range order.
- Saved-comment focus alignment remains the dominant behavior when a saved comment is actively selected; otherwise the pending draft drives rail alignment.
- Older persisted drafts without `anchorViewportTop` remain compatible and fall back to ordinary in-rail rendering without precise cross-column alignment until a new anchor is captured.

## 2026-04-06 Second Follow-up - Pending Draft Preview And Local Rail Reveal

- The remaining page-jump issue was not caused by draft ordering; it was caused by page-affecting focus/reveal paths after the draft opened.
- New contract:
  - pending-comment activation may move the right rail
  - pending-comment activation must not move the page viewport to chase the rail
- `CommentComposer` therefore focuses with `scrollIntoView: false`.
- The comment rail and published feedback rail now share one local reveal helper:
  - anchor-aware alignment uses viewport geometry when available
  - fallback reveal scrolls the rail viewport itself
  - `scrollIntoView()` is no longer the fallback path for annotation selection in these rails
- `WritingPendingCommentDraft` is now also mirrored into the essay editor as transient decoration state.
- That transient state is intentionally non-persistent:
  - no orphan `commentMark` is written before save
  - unsaved draft highlighting disappears when the draft is cleared
- The visual contract for an open pending draft is:
  - selected source text gets a subtle dotted underline with a soft glow
  - the draft preview never expands onto rendered correction replacement text
  - saved comments still upgrade to the normal shared yellow comment mark only after save
## 2026-04-06 Third Follow-up - Pending Composer Lane-Fit Contract

- The earlier local-rail rule was necessary but not sufficient because the pending comment composer can be taller than the visible portion of the comments rail.
- New state/compatibility contract:
  - pending comment drafts still preserve `anchorViewportTop` when available
  - but rail alignment must be computed against the visible lane only, not the full off-screen height of the rail viewport card
  - the pending rail row may receive a runtime max-height derived from that visible lane
  - overflow must remain inside the composer editor/card shell rather than pushing the actionable save/cancel controls below the screen
- This is a runtime layout contract only:
  - no persisted draft shape changed in this pass
  - older drafts remain compatible
  - published result rails reuse the same visible-lane geometry helper for selection reveal, but they do not need the grading-only pending-composer max-height rule because they do not host pending drafts

## 2026-04-06 Fourth Follow-up - Shared Scoring Surface Contract

- The teacher grading `Scoring` tab is one shared right-rail surface for both Task 1 and Task 2.
- `CriteriaScoringPanel` owns one shared structural and styling contract; task-specific variation is semantic only:
  - Task 1 uses `Task Achievement`
  - Task 2 uses `Task Response`
- Task-specific layout branches and task-specific scoring-panel theming are intentionally disallowed.
- The scoring panel must not remain a legacy inline-style island once the rest of the right rail has been redesigned.
- The scoring panel now owns its stylesheet contract directly instead of depending on partial page-level CSS fragments.

## 2026-04-06 Fifth Follow-up - Feedback Toolbar And Scoring Card Geometry

- The edit-mode `Scoring` tab keeps the shared decimal scoring contract (`0.5` steps, shared Task 1/Task 2 structure), but the scoring cards now reserve header space explicitly.
- Long labels such as `Coherence & Cohesion` and `Grammatical Range & Accuracy` must not push only some cards taller or distort the two-column grid when a score value is present.
- `CriteriaScoringPanel` therefore treats the criterion header as a two-column layout with a reserved value lane and a stable minimum header height.
- `TabbedFeedbackEditor` once again includes the live rich-text toolbar in edit mode:
  - bold
  - italic
  - underline
  - bullet list
  - numbered list
  - undo
  - redo
- Toolbar interactions are part of the grading workflow contract, not incidental UI:
  - buttons must preserve editor selection on pointer interaction
  - actions remain task-scoped to the active feedback tab
  - page-level grading telemetry records these actions through the existing grading feature tracking path
- The five-tab feedback workflow remains unchanged (`Task Summary`, `TA/TR`, `CC`, `LR`, `GRA`); this pass restores the live formatting controls while keeping the edit-mode tab/content contract aligned to the Stitch workspace.


## 2026-04-06 Sixth Follow-up - Shared Readiness And Publish Contract

- The current live edit-mode `Scoring`, `Suggestions`, and feedback-toolbar behavior is the active contract.
- Older Stitch conversations remain useful history, but when they conflict with the current documented live state they must not override the current contract implicitly.
- `WritingGradingPage` now computes task readiness and submission publish readiness through one shared evaluator instead of separate ad hoc checks.
- The visible `Readiness` block remains task-focused, but its rows now represent the real task-level gate inputs:
  - `Scores Set`
  - `Summary Required`
  - `Comment Draft Clear`
- The block also exposes a submission-level `Ready to Submit` summary so the right rail reflects the same cross-task truth as `Submit Grading`.
- Pending comment drafts are blocking state, not a cosmetic editor detail:
  - they block `Submit Grading`
  - they block suggestion approval while editing
  - saved comment count does not contribute to publish readiness
- The canonical service publish path now enforces the same readiness rules as the page-level gate, including pending-comment-draft blocking and meaningful-summary detection.

## 2026-04-06 Seventh Follow-up - Focused Comment Rail Stability

- Once a comment is actively focused in the `Comments` rail, its cross-column alignment anchor becomes a captured interaction snapshot rather than a live subscription to continuously refreshed essay mark geometry.
- Scrolling the page or essay after that focus event must not move the already-positioned comment card unless the teacher explicitly focuses another comment or opens a new pending comment draft.
- Sidebar-origin comment focus therefore captures the current anchor viewport top immediately instead of clearing back to live fallback behavior.
- `CommentSidebar` must not fall back to refreshed `anchorPositions` for an already-focused comment, because those positions are viewport-relative and change during ordinary scroll.
- This is a runtime stability rule only:
  - persisted comment data is unchanged
  - comment ordering is unchanged
  - pending-draft alignment behavior is unchanged
  - only focused-comment drift after scroll is removed
