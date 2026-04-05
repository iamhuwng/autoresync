# IELTS Writing Lifecycle And Surfaces

## Lifecycle

```text
Teacher creates/publishes writing test
  -> student writes in live session, homework, or solo practice
  -> submission stored in Firestore writing_submissions
  -> student sees acknowledgement / pending-review state
  -> teacher reviews in grading queue/editor
  -> teacher publishes feedback
  -> student and teacher read the published result through Writing-specific result surfaces
```

## Core Lifecycle Rules

- Writing is teacher-graded.
- Pending-review and published are the only public result phases.
- Draft ownership, lock conflicts, and reopen flows are teacher operational states, not public student phases.
- Pure Writing submit does not route students into the generic immediate-review modal.

## Canonical Active Surfaces

### Student
- `SubmissionCompletePage`  
  Acknowledgement-only front door immediately after pure Writing submit.
- `StudentTestResultsPage`  
  Full-page Writing result reader.
- `ResultSlidePanel`  
  Saved-result shell that delegates Writing rows to the Writing-specific student surface.
- `WritingStudentResultSurface` / `WritingResultView`  
  Dedicated student Writing result body.

### Teacher
- `TeacherLobbyPage` / Materials tab  
  Entry point for create, edit, and resume actions.
- `WritingTestEditModal`  
  Canonical edit/resume surface for existing writing drafts and published materials.
- `WritingGradingQueuePage`  
  Operational front door for pending-review work.
- `WritingGradingPage`  
  Canonical grading editor.
- `TeacherTestResultsPage` + `WritingTestResultsSection`  
  Session-result bridge into Writing results.
- `WritingResultDetailModal` / teacher Writing result surface  
  Published and pending-review teacher-facing result reader with re-entry capability.

## Student Result Surface Contract

### Pending-review
- no published scores
- no published comments
- no published markup
- show submission snapshot and waiting guidance only

### Published
- compact, task-aware band strip
- essay / marked response in the main column
- right rail for Writing-specific support modules
- result content comes from `publishedGrading` first, legacy fallback second

### Comment-Rail Interaction

In the wide student slide modal:
- clicking highlighted essay text forces `Comments` open
- the whole comments rail moves as one block
- the selected comment remains in normal list order
- the alignment rule is `selected comment header top == clicked annotation top`

## Teacher Result Surface Contract

### Pending-review
- show submission facts, source metadata, essay preview, and the appropriate action state
- `Grade now` when there is no draft
- `Resume draft` when a teacher-private draft exists

### Published
- compact band strip
- task-aware summaries and criteria feedback
- published markup and ordered feedback items
- audit metadata and re-open path when permissions allow

## Teacher Authoring Contract

- create-only flow lives in `TestCreationModal`
- edit and resume flow lives in `WritingTestEditModal`
- writing edit uses the shared edit shell (`Modal` + `EditTestFrame`) instead of reusing the creation wizard
- the shared shell tabs for writing are `Questions`, `Context & Resources`, and `Settings`
- published writing materials save through one primary `Save Changes` action
- unpublished writing drafts keep `Save Draft` plus `Publish Test`

## Superseded Surface Assumptions

Do not treat the following as current architecture:
- Writing as a generic score-summary/question-review shell
- a public three-state student result model
- immediate post-submit Writing result review
- center-based or focused-card-overlay descriptions for the student comment rail
- editing an existing writing draft through the creation wizard

## 2026-03-30 Amendment - Grading Editor Comment-Rail Alignment

The teacher grading editor now follows the same stable cross-column reading model as the wide student Writing result surface.

Current contract:
- clicking highlighted essay text forces the right-side `Comments` tab open
- the whole comments rail moves as one block
- the selected comment stays in normal essay-order list position
- the right-side visual anchor is the selected comment header row
- the left-side visual anchor is the clicked annotation top line
- the intended steady-state is `selected comment header top == clicked annotation top`

This supersedes any looser wording that implied the matching comment only scrolls nearby in the sidebar.

## 2026-04-05 Amendment - Published Feedback Reader Contract

The read-only Writing result readers now share a single published-markup interaction contract across student and teacher surfaces.

Current published-reader rules:
- `WritingPublishedMarkupViewer` is the shared marked-response renderer for both student and teacher result surfaces.
- Published correction data must be passed through that shared viewer on both student and teacher result surfaces; teacher result readers must not silently drop corrections while student readers still show them.
- Read-only result surfaces keep their own published-feedback rail model:
  - student result surfaces may continue to merge published comments and published corrections into one ordered feedback rail
  - this does not reintroduce the grading-editor comment-rail contract where corrections were removed from the editing sidebar
- Published hover tooltips now follow the same viewport-overlay rule as the grading editor:
  - mount outside local clipping containers
  - position from viewport coordinates
  - choose the nearest intelligible side in this order: right, left, bottom, then top
  - clamp to the viewport and dismiss on scroll/resize if the anchor geometry becomes stale

## 2026-04-02 Amendment - Teacher Grading Operational States

The teacher grading lifecycle now distinguishes the public result phase from the editor's operational state more strictly.

Current operational rules:
- loading a pending-review submission no longer implies immediate edit mode before lock ownership is confirmed
- lock acquisition is the gate that promotes the page from review/read-only assumptions into active editing

## 2026-04-05 Amendment - Published Feedback Rail And Viewer Overlay Contract

Student published-reader rules:
- the wide student result surface now exposes a `Feedback` tab instead of overloading the label `Comments`
- published comments and published corrections remain one read-only rail, but they render as separate ordered sections inside that rail
- clicking highlighted essay text still forces the published-feedback rail open and preserves the cross-column anchor-alignment rule

Teacher published-reader rules:
- teacher result readers must pass both published comments and published corrections into the shared published markup viewer
- corrections-only tasks still count as published markup and must not fall back to plain essay rendering just because there are no comment records

Shared published-viewer rules:
- `WritingPublishedMarkupViewer` is now the common read-only markup reader for both student and teacher result surfaces
- the published viewer follows the same body-portal, viewport-clamped, side-adjacent hover-tooltip contract as the grading essay editor
- read-only result surfaces keep their own published-feedback navigation model and do not inherit grading-editor-only correction/comment routing semantics
- task switching is a hard boundary for transient grading UI state and editor content rehydration
- leaving with unsaved work is a three-way workflow (`save`, `discard`, `cancel`), not a binary confirm prompt
- published submissions may re-enter the editor only through the explicit regrade workflow with a required reason
## 2026-04-02 Amendment - Suggestions Tab As Teacher Helper Surface

The grading editor now includes a teacher-only `Suggestions` tab in the right rail.

Surface rules:
- the right rail order is `Prompt`, `Comments`, `Suggestions`, `Scoring`
- the Suggestions tab is an operational helper surface inside `WritingGradingPage`, not a separate grading artifact
- suggestions are visible only to the assigned teacher in the grading workflow and never appear on student-facing result surfaces
- the helper surface may show `generating`, `ready`, and `failed` operational states without changing the public result phase

Workflow rules:
- `Focus in Essay` is a navigation action within the grading session
- `Inject to Comment` and `Inject to Correction` are shortcuts into the existing authoring tools, not direct feedback publication actions
- normal grading and publishing remain valid even when the Suggestions tab is unavailable or failed
