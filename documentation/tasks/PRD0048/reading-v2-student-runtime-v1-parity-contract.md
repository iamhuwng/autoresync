# Reading V2 Student Runtime V1 UI Parity Contract

This document is part of the PRD-0048 source-of-truth packet.

Authoritative companion docs:

- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-desktop-tablet.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-phone.md`
- `documentation/tasks/PRD0048/conversation-transcript-prd-0048-thread-2026-04-22-to-2026-04-24.md`

This contract exists because the conversation explicitly called for the Reading V2 student runtime to imitate the current Reading V1 student UI. V1 is the visual and interaction reference; it is not the data-model or renderer foundation.

---

## 1. Rule

Reading V2 student runtime must look and behave like the current Reading V1 student runtime wherever the V1 UI is already successful.

Reading V2 may diverge only when:

- the V1 UI depends on legacy flat-question heuristics
- a dense task cannot be made usable on phone without a family-specific adaptation
- a senior reviewer approves the deviation and the task list or PRD packet is updated first

Implementers must not invent a new student Reading UI style because the V2 data model is new.

---

## 2. Current V1 Reference Surfaces

Desktop/tablet reference files:

- `src/skills/reading/components/ReadingTestPage.tsx`
- `src/components/practice/IELTSPracticeView.tsx`
- `src/components/test/TwoColumnLayout.tsx`
- `src/components/test/IELTSQuestionsPanel.tsx`
- `src/components/test/AuthenticAnswerInput.tsx`
- `src/components/test/table-completion/TableCompletionGroupRenderer.tsx`
- `src/skills/reading/components/PassageRenderer.tsx`

Phone reference files:

- `src/components/test/mobile/MobileReadingExamScaffold.tsx`
- `src/components/test/mobile/MobileQuestionSheet.tsx`
- `src/components/test/mobile/MobileReviewSummary.tsx`
- `src/core/platform/hooks/useMobileExamMode.ts`
- `documentation/architecture/mobile-ielts-reading-test-taking-architecture.md`

Use these files to observe layout, interaction shape, density, and navigation behavior. Do not reuse their legacy Reading schema or heuristic grouped-task reconstruction as V2 architecture.

---

## 3. Desktop And Tablet Parity

Reading V2 desktop/tablet runtime must imitate these V1 behaviors:

1. Use the classic two-column Reading layout:
   - left column = passage/stimulus reading surface
   - right column = full question/task panel
2. Keep passage content visible while answering.
3. Do not create a separate desktop "answer sheet" as the primary answer surface.
4. Render the full question panel for the active passage/section, not one isolated question card at a time.
5. Group consecutive task interactions under one boxed instruction header per task group.
6. Show visible IELTS question ranges and answered/unanswered state in the same mental model as V1.
7. Preserve section/passage switching, timer, submit, and navigation placement close to V1 unless platform shell constraints require a small adjustment.
8. Preserve V1 answer-control patterns:
   - single-choice: stacked bordered option cards with radio behavior
   - multi-select: stacked checkbox cards with selected-count feedback
   - true/false/not-given and yes/no/not-given: locked vocabulary choices with the group-level legend
   - completion and short answer: inline blanks when the prompt contains blanks; otherwise direct text entry with word-limit cues
   - summary-completion-list: one flowing summary body with inline selects plus one shared option bank
   - matching: specialized matching UI, not a generic select for every interaction
   - table completion: structured table renderer as the primary path, not text-inferred table reconstruction
   - diagram labeling: diagram/image context stays adjacent to label controls

V2 may rebuild the implementation behind these controls, but the student-facing shape should remain recognizable as current Reading.

---

## 4. Phone Parity

Reading V2 phone runtime must imitate these V1 behaviors:

1. Phone mode is a phone-class runtime variant, not a separate content model.
2. The phone surface is passage-first.
3. The shell uses:
   - compact mobile header
   - short passage tabs
   - scrollable passage content
   - floating `Questions` action
   - bottom-sheet question surface
   - full-screen pre-submit review summary
4. The bottom-sheet question surface must preserve the same grouped task schema as desktop.
5. Opening and closing the question sheet must preserve passage scroll position.
6. Mobile review summary is a submit/readiness aid, not a full result review product.
7. Mobile matching must not require desktop drag-and-drop.
8. Mobile complex tables may use numbered markers in a structural overview plus separate answer cards or focused answer entry.
9. Mobile highlighter behavior should follow V1 suppression unless a later approved mobile highlighting task changes that behavior.
10. Mobile submit must flow through the review summary/final confirmation pattern, not duplicate submit buttons in multiple places.
11. Mobile flagging must not be reintroduced unless a future approved task changes the current mobile Reading contract.

Phone adaptations should make dense tasks usable while still looking like the current Reading phone experience.

---

## 5. Forbidden Student UI Drift

Do not:

- redesign the student Reading runtime as a new dashboard, lesson page, or card deck
- make desktop Reading a one-question-at-a-time wizard
- make phone Reading a detached global answer sheet with the passage hidden by default
- replace the V1 bottom-sheet question pattern with unrelated mobile navigation
- remove grouped task instruction blocks from the student surface
- flatten grouped tasks into unrelated cards
- use V1 heuristic renderers as the V2 engine
- add new visible controls that are not present in V1 unless the task family needs them and the deviation is documented

---

## 6. Verification Standard

Every student runtime implementation slice must include:

1. Component tests proving V2 renders from projection fixtures, not V1 flat-question data.
2. Browser screenshots at:
   - desktop: 1366x900
   - tablet: 1024x768
   - phone: 390x844
3. A side-by-side visual comparison against the current V1 Reading runtime for the closest available fixture or seeded test.
4. Evidence that the V2 runtime preserves:
   - desktop two-column shape
   - phone passage-first shape
   - phone bottom-sheet question flow
   - grouped instruction blocks
   - answer-state persistence
   - visible IELTS numbering
5. A written note for every intentional visual or interaction deviation from V1.

If a deviation is not documented and approved, it is a bug.

---

## 7. Related Docs

- `documentation/tasks/PRD0048/reading-v2-family-completion.md`
- `documentation/tasks/PRD0048/reading-v2-family-choice.md`
- `documentation/tasks/PRD0048/reading-v2-family-binary-judgement.md`
- `documentation/tasks/PRD0048/reading-v2-family-matching.md`
- `documentation/tasks/PRD0048/reading-v2-family-structured-layout.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`
