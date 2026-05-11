# Reading V2 Page Schema: Student Runtime Desktop And Tablet

This document is part of the PRD-0048 source-of-truth packet.

Authoritative companion docs:

- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`

This file defines the desktop and tablet Reading V2 student test-taking surface.

The student-facing UI must imitate the current Reading V1 desktop/tablet runtime. Reading V2 changes the data model and renderer foundation, not the familiar student Reading layout.

---

## 1. Purpose

This surface is the primary student runtime for:

- live sessions
- solo practice
- homework test-taking
- course or library Reading launches when they open the full runtime

Its job is to make the student read on one side and answer on the other without reconstructing grouped tasks from flat question text.

The target visual reference is the current V1 two-column Reading runtime:

- `src/skills/reading/components/ReadingTestPage.tsx`
- `src/components/practice/IELTSPracticeView.tsx`
- `src/components/test/TwoColumnLayout.tsx`
- `src/components/test/IELTSQuestionsPanel.tsx`
- `src/components/test/AuthenticAnswerInput.tsx`
- `src/components/test/table-completion/TableCompletionGroupRenderer.tsx`
- `src/skills/reading/components/PassageRenderer.tsx`

These files are visual and interaction references only. Do not use their legacy flat-question schema or heuristic grouped-task reconstruction as the V2 engine.

---

## 2. Route And Surface Ownership

Current platform route families that inform this surface:

- `/student-test/:sessionCode`
- `/student/practice/:materialId`
- `/student/solo-test/:materialId`
- homework launch routes that reuse the same practice shell

Reading V2 rule:

- all of these contexts may launch different attempt plumbing
- but the visual Reading runtime contract stays the same

---

## 3. Audience And Permission Boundary

Primary audience:

- student

This surface may show:

- passage content
- grouped instructions
- answer-entry controls
- timer and submit controls if the launch context requires them
- navigation and review state

This surface must not show:

- author-only validation diagnostics
- provenance details
- import evidence
- teacher-only grading controls

---

## 4. Visual Schema

```text
+----------------------------------------------------------------------------------+
| Student Reading Runtime                                                          |
| Header | Timer | Section switch | Question navigator | Submit                    |
+--------------------------------------+-------------------------------------------+
| Left column: reading surface         | Right column: task interaction surface    |
| -----------------------------------  | ----------------------------------------  |
| Passage content and diagrams         | Full question panel for active passage    |
| Paragraph or structure highlighting  | Boxed grouped instruction headers         |
| Anchor context                       | Visible IELTS question ranges             |
| Section or passage switching         | Family-specific V1-like answer controls   |
| Reading scroll position              | Answer status and review flags             |
+--------------------------------------+-------------------------------------------+
| Existing-style utility: Previous | Next | Review state | submit confirmation    |
+----------------------------------------------------------------------------------+
```

---

## 5. Layout Contract

Desktop and tablet use the classic V1 two-column Reading pattern:

- left = shared reading context
- right = full question and answer panel for the active passage/section

Required rules:

1. The passage or primary stimulus remains visible while answering.
2. Grouped instructions remain attached to the task group, not detached into global help text.
3. The question navigator must show current, answered, unanswered, and flagged state.
4. Switching between task groups must preserve student answer state.
5. Dense task types may replace the right-column control pattern, but not the overall two-column mental model.
6. The surface must not become a one-question-at-a-time wizard.
7. The surface must not introduce a separate desktop answer-sheet page as the primary answer experience.
8. Every intentional visual or interaction deviation from current V1 Reading must be documented and senior-approved.

---

## 6. Family-Specific Runtime Rules

### 6.1 Completion

The right column shows:

- grouped instructions
- answer-rule reminder
- ordered blanks or prompts in the V1 inline-blank style when blanks exist
- direct text entry controls with word-limit cues when inline blanks are not present

### 6.2 Choice

The right column shows:

- prompt or shell context
- visible option bank
- selection state
- single-select stacked option cards with radio behavior
- multi-select stacked option cards with checkbox behavior and selected-count feedback

### 6.3 Binary Judgement

The right column shows:

- locked vocabulary controls
- one judgement choice per interaction
- the V1-style group-level legend for True / False / Not Given or Yes / No / Not Given where applicable

### 6.4 Matching

The right column shows:

- source list
- target list
- assignment state
- specialized matching interaction close to V1 behavior
- reassignment controls without collapsing the family into generic selects

### 6.5 Structured Layout

The left column remains the structural context:

- table shell
- flowchart shell
- diagram image and hotspots

The right column provides the active answer-entry surface for the selected anchor or blank.

Structured layout must preserve V1-recognizable behavior:

- table completion uses structured table rendering as the primary display
- diagram labeling keeps the diagram/image adjacent to label controls
- flowchart completion keeps the flow structure visible while answering

---

## 7. Data And State Contract

This surface owns runtime state such as:

- attempt or preview answer state
- active section
- active task group
- active interaction
- reading scroll position
- flag or review markers
- timer state when relevant

This surface does not own:

- canonical editing
- package discovery
- result regrade controls

Result and analytics systems must still receive:

- stable IDs
- visible question numbers
- anchor or structural target references where applicable

---

## 8. Required Actions And Transitions

The runtime must support:

- move to previous or next question
- jump by visible number
- jump by grouped block
- answer, clear, and revise an answer
- flag or mark for review
- navigate across sections when the material has multiple sections
- submit through a controlled confirmation flow

Practice and homework launches may vary in surrounding chrome, but the answer-entry contract must remain consistent.

---

## 9. Forbidden Patterns

This surface must not:

- degrade grouped Reading into a flat card stack
- hide passage context every time the student answers
- make the answer sheet the primary desktop experience for all task types
- depend on text heuristics to rediscover grouping or anchors
- expose author-only diagnostics
- redesign the Reading runtime into a new non-V1 dashboard or lesson view

---

## 10. Related Docs

- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-phone.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`
- `documentation/tasks/PRD0048/reading-v2-family-completion.md`
- `documentation/tasks/PRD0048/reading-v2-family-choice.md`
- `documentation/tasks/PRD0048/reading-v2-family-binary-judgement.md`
- `documentation/tasks/PRD0048/reading-v2-family-matching.md`
- `documentation/tasks/PRD0048/reading-v2-family-structured-layout.md`
