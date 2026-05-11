# Reading V2 Result And Feedback Integration Contract

This document is part of the PRD-0048 source-of-truth packet.

Authoritative companion docs:

- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`

This file replaces the earlier separate teacher/student result-review page schemas. PRD-0048 does not require standalone Reading V2 result review pages.

---

## 1. Purpose

Reading V2 must integrate with the existing result, review, feedback, release-policy, and regrade system.

The existing review/feedback system is already a platform product. Reading V2 should provide the data adapters and grouped Reading review content needed by that system, not create a separate result-review product.

---

## 2. Current Code Anchors

Use these current files as shell and workflow references:

- `src/components/results/SharedSavedResultCore.tsx`
- `src/components/results/ReviewTab.tsx`
- `src/components/results/FeedbackTab.tsx`
- `src/components/results/ResultDetailModal.tsx`
- `src/components/results/ResultSlidePanel.tsx`
- `src/components/results/DeferredResultSlidePanel.tsx`
- `src/components/results/TeacherFeedbackManager.tsx`
- `src/components/results/StudentFeedbackViewer.tsx`
- `src/pages/TeacherTestResultsPage.tsx`
- `src/pages/StudentTestResultsPage.tsx`
- `src/pages/AcademicRecordPage.tsx`
- `src/services/resultsService.ts`
- `src/services/testResults.service.ts`
- `src/services/resultVisibility.service.ts`
- `src/services/resultFeedbackPayload.service.ts`
- `src/services/feedbackService.ts`

Do not use these files as Reading V2 scoring or canonical-content foundations. Use them as existing result/feedback integration surfaces.

---

## 3. Ownership Boundary

Reading V2 owns:

- attempt capture against a published snapshot or session-safe projection version
- Reading V2 scoring from canonical answer rules
- result records that bind to the exact snapshot/version used at attempt time
- result identity metadata derived from the published material metadata produced by the test-making publish pipeline
- grouped Reading review payload derivation
- release-policy sanitization for Reading V2 answer keys, explanations, diagnostics, and import evidence
- adapter logic that lets existing result shells render grouped Reading content safely

The existing result/feedback system owns:

- result list pages
- modal or slide-panel presentation
- shared review and feedback tabs
- teacher feedback workflows
- student feedback display
- release-state enforcement surfaces
- existing re-mark/regrade entry shells where already supported
- academic-record and dashboard entry points

---

## 4. Integration Shape

Reading V2 implementation should add adapter-level pieces such as:

- a Reading V2 result payload normalizer
- a grouped Reading review content adapter for the existing `ReviewTab` / `SharedSavedResultCore` pathway
- optional V2-specific subcomponents inside the existing result shell if grouped Reading context cannot be represented by the current generic question list
- tests proving existing shells route V2 records into the adapter

The adapter may render grouped Reading context, visible IELTS question numbers, passage/stimulus snippets, task-group instructions, answer state, and release-policy-aware correct-answer/explanation visibility.

The adapter must not create new result truth. It renders from saved result snapshots and derived review payloads only.

---

## 5. Teacher Behavior

When a teacher opens a Reading V2 result from an existing teacher result surface:

1. The existing result shell opens as it does for other tests.
2. The result is identified as Reading V2 by explicit engine/result metadata.
3. The existing review tab or equivalent shell delegates Reading V2 answer review to the V2 grouped-content adapter.
4. The default Reading V2 review organization is task-group-first inside that existing shell.
5. A flat visible-number jump/index may exist only as a secondary utility.
6. Teacher feedback and regrade/re-mark controls use the existing platform workflow.

---

## 6. Student Behavior

When a student opens a Reading V2 result from academic record, dashboard, homework, or another existing result entry:

1. The existing student result modal, slide panel, or detail shell opens.
2. Release policy decides whether score, correctness, correct answers, and explanations are visible.
3. Reading V2 grouped review content appears inside the existing review/feedback shell.
4. Teacher-only notes, regrade controls, author diagnostics, import evidence, and unreleased answer keys remain hidden.

---

## 7. Required Tests

Result integration tests must prove:

- Reading V2 attempts bind permanently to the published snapshot or session projection version used at attempt time.
- Reading V2 scoring reads V2 canonical answer rules, not legacy Reading heuristics.
- Reading V2 result identity metadata comes from published material metadata/indexes, not canonical draft reads.
- Existing result shells can open a Reading V2 saved result.
- `SharedSavedResultCore`, `ReviewTab`, `ResultDetailModal`, and `ResultSlidePanel` route Reading V2 records to the V2 review adapter where needed.
- Teacher review content is task-group-first inside the existing shell.
- Student review content is release-policy sanitized inside the existing shell.
- Feedback generation/display keeps using existing feedback services and tabs.
- Regrade or re-mark behavior appends a new result/regrade artifact and does not mutate historical result truth.
- Student surfaces cannot see unreleased answers, answer keys, author diagnostics, provenance, or import evidence.

---

## 8. Forbidden Patterns

Do not:

- create `/teacher/reading-v2/results/*` as a standalone result-review product
- create `/student/reading-v2/results/*` as a standalone result-review product
- duplicate `SharedSavedResultCore`, `ReviewTab`, or `FeedbackTab` under `src/components/reading-v2/review/`
- create separate Reading V2 feedback storage when existing feedback services can represent the needed data
- bypass existing result release-policy gates
- edit canonical Reading V2 content from a result/feedback surface
- expose author-only Studio diagnostics, import evidence, or provenance in student result views

---

## 9. Related Docs

- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-desktop-tablet.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-phone.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
