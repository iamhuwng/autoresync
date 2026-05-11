# Reading V2 Page Schema: Student Runtime Phone

This document is part of the PRD-0048 source-of-truth packet.

Authoritative companion docs:

- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`

This file defines the phone-specific Reading V2 student runtime.

The student-facing phone UI must imitate the current Reading V1 phone runtime. Reading V2 may improve dense-task internals, but it must keep the current passage-first mobile Reading experience recognizable.

---

## 1. Purpose

Phone Reading V2 must preserve reading quality without pretending a phone can behave like a desktop split view.

Its job is to keep:

- passage reading primary
- navigation always reachable
- dense tasks usable
- answer state stable
- review meaning preserved

The target visual reference is the current V1 phone Reading runtime:

- `src/components/test/mobile/MobileReadingExamScaffold.tsx`
- `src/components/test/mobile/MobileQuestionSheet.tsx`
- `src/components/test/mobile/MobileReviewSummary.tsx`
- `src/components/test/IELTSQuestionsPanel.tsx` in embedded mode
- `src/core/platform/hooks/useMobileExamMode.ts`
- `documentation/architecture/mobile-ielts-reading-test-taking-architecture.md`

These files are visual and interaction references only. Do not use their legacy Reading schema or heuristic grouped-task reconstruction as the V2 engine.

---

## 2. Route And Surface Ownership

The same launch routes that power desktop or tablet Reading may render in this phone schema when the device profile requires it.

Typical route families:

- `/student-test/:sessionCode`
- `/student/practice/:materialId`
- `/student/solo-test/:materialId`
- homework-based Reading launches

This is a responsive runtime variant, not a separate content model.

---

## 3. Audience And Permission Boundary

Primary audience:

- student

Phone runtime may show:

- passage content
- grouped instructions
- answer controls
- timer and submit state if required by context

Phone runtime must not show:

- author-only diagnostics
- provenance
- import evidence
- teacher-only grading controls

---

## 4. Visual Schema

```text
+----------------------------------------------------------------------------------+
| Phone Reading Runtime                                                            |
| Header | Timer | Submit                                                          |
+----------------------------------------------------------------------------------+
| Passage-first primary surface                                                    |
| -------------------------------------------------------------------------------  |
| Scrollable passage or diagram overview                                           |
| Current paragraph or structure highlight                                         |
| Preserved reading scroll position                                                |
+----------------------------------------------------------------------------------+
| Existing-style passage tabs / floating Questions action / reachable question nav |
| [Q14] [Q15] [Q16] [Q17] [Q18] ...                                                |
+----------------------------------------------------------------------------------+
| Bottom-sheet answer layer                                                        |
| -------------------------------------------------------------------------------  |
| Grouped instruction block                                                        |
| Active question range                                                            |
| Family-specific answer controls                                                  |
| Previous / Next / Clear                                                          |
+----------------------------------------------------------------------------------+
| Full-screen pre-submit review summary and final confirmation                     |
+----------------------------------------------------------------------------------+
```

---

## 5. Layout Contract

Phone layout is passage-first and must preserve the current V1 mobile Reading pattern.

Required rules:

1. Passage remains the primary reading surface.
2. Question navigation remains reachable without leaving the Reading flow.
3. The system must preserve reading scroll position when the student answers.
4. The student must be able to return to the same reading context after using the answer layer.
5. The phone answer layer must adapt by task family instead of forcing one universal UI for every dense task.
6. The primary answer layer must follow the current bottom-sheet question surface pattern.
7. The submit path must follow the current pre-submit review summary and final confirmation pattern.
8. Any visual or interaction deviation from current V1 Reading phone behavior must be documented and senior-approved.

---

## 6. Family-Specific Phone Rules

### 6.1 Completion

Use focused answer entry with:

- grouped instruction summary
- one active prompt or blank at a time when needed
- quick next and previous movement
- V1-like inline blank or direct text-entry behavior depending on the task shape

### 6.2 Choice

Use visible tap targets and selection chips that remain close to the current V1 card/chip interaction style.

The student should not need to open a separate global answer sheet for ordinary single-choice or multi-select tasks.

### 6.3 Binary Judgement

Use large locked-vocabulary controls:

- True / False / Not Given
- Yes / No / Not Given

### 6.4 Matching

Use tap-to-assign interaction.

Phone matching must not depend on drag-and-drop as the primary mechanic.

### 6.5 Structured Layout

#### Table Completion

Phone table completion uses:

- a zoomable read-only structural overview
- synchronized focused answer entry below or in a sheet
- tap-to-center and highlight for the selected blank
- numbered blank markers plus separate answer cards where the current V1 mobile table behavior uses that pattern

The student must not type directly into a cramped zoomed table as the default interaction.

#### Flowchart Completion

Phone flowchart completion uses:

- a simplified structural overview
- focused answer entry for the active flow step
- preserved flow-step highlight

#### Diagram Labeling

Phone diagram labeling uses:

- zoomable diagram view
- large hotspot or target highlight
- structured label-picking or focused answer entry

Phone diagram labeling must not rely on tiny drag targets.

---

## 7. Data And State Contract

Phone runtime must preserve:

- active section
- active task group
- active interaction
- passage scroll position
- selected anchor or blank
- answer state
- pre-submit review status

If the phone interaction differs from desktop, saved result data must still preserve enough stable information for teacher review to reconstruct what the student answered.

---

## 8. Required Actions And Transitions

Phone runtime must support:

- open and close the answer layer without losing reading position
- move between visible question numbers
- switch the active blank or anchor
- answer, clear, and revise
- submit through a controlled confirmation flow

---

## 9. Forbidden Patterns

Phone runtime must not:

- clone the desktop split view in a cramped way
- force drag-and-drop as the primary touch interaction
- use a generic detached answer sheet for every dense task
- lose the passage reading position whenever the answer layer changes
- flatten grouped structured-layout tasks into generic text completion
- replace the current floating Questions action and bottom-sheet flow with an unrelated mobile navigation model
- add a separate mobile result-review product; mobile review summary remains a pre-submit aid

---

## 10. Related Docs

- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-desktop-tablet.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`
- `documentation/tasks/PRD0048/reading-v2-family-completion.md`
- `documentation/tasks/PRD0048/reading-v2-family-choice.md`
- `documentation/tasks/PRD0048/reading-v2-family-binary-judgement.md`
- `documentation/tasks/PRD0048/reading-v2-family-matching.md`
- `documentation/tasks/PRD0048/reading-v2-family-structured-layout.md`
