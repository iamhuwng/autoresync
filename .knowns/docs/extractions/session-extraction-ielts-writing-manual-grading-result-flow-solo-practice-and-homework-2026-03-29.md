---
title: 'Session Extraction: IELTS Writing Manual Grading, Result Flow, Solo Practice, and Homework (2026-03-29)'
description: Extraction of the March 29, 2026 IELTS Writing audit covering stable manual-grading contracts, current implementation drift across live-session, solo-practice, and homework, and the reusable cross-feature patterns that should govern future fixes.
createdAt: '2026-03-29T08:17:41.818Z'
updatedAt: '2026-03-29T08:41:42.936Z'
tags:
  - extraction
  - ielts
  - writing
  - grading
  - results
  - solo-practice
  - homework
  - bugfix
---

# Session Extraction: IELTS Writing Manual Grading, Result Flow, Solo Practice, and Homework (2026-03-29)

## Overview
This extraction captures the reusable knowledge from the March 29, 2026 audit of IELTS Writing across live-session test taking, teacher grading, student result access, solo practice, and homework.

The main outcome of the audit is that the product intent is stable, but the implementation has drifted unevenly across entry points. Live-session Writing now mostly follows the intended manual-grading contract, while solo practice and especially homework still contain ownership, status-linkage, and result-surface mismatches.

This document is not the raw PRD and not a single incident closeout. It is the cross-feature knowledge record for future work that touches IELTS Writing.

## Stable Contract That Must Survive Refactors
- IELTS Writing is manually graded by a teacher.
- IELTS Writing does not show instant AI grading, regex grading, or instant score on submission.
- The canonical student lifecycle is `submit -> pending-review -> graded`.
- `writing_submissions` in Firestore is the canonical grading artifact.
- Teacher grading workflow is the operational owner of pending-review Writing work.
- Student post-submit acknowledgement and later result review are separate phases and must not be collapsed into one generic result modal.

## Feature Scope
The audited feature surface spans:
- live-session Writing delivery and submission
- Firestore `writing_submissions` lifecycle
- RTDB compatibility result materialization and indexes
- teacher grading queue and grading editor
- student Writing-aware result views
- solo-practice Writing entry and teacher-review submission
- homework Writing entry and later result access
- academic-record and saved-result bridges that try to consume Writing data

## Issue 1: Live-Session Post-Submit Contract Drift
### Symptom
Pure IELTS Writing submit and auto-submit were being routed into the generic waiting-room result modal and treated like a test whose result was merely "still processing".

### Findings
- The product contract requires manual teacher review, not immediate AI/result rendering.
- `WritingTestPage` had diverged from the broader Writing contract and was passing `showResults: true` into the waiting-room flow.
- The generic waiting-room modal depended on RTDB-compatible result materialization, which is not the primary immediate Writing post-submit contract.

### Root Cause
A Writing-specific workflow was collapsed into the generic submitted-test result path.

### Solution Applied
- Restore the Writing-specific acknowledgement path: submit goes to `/submission-complete`.
- Keep the acknowledgement page explicit about teacher grading and absence of instant AI feedback.
- Treat later Writing result access as a separate Writing-aware review surface.

### Pattern Extracted
Preserve workflow boundaries while repairing storage or routing bugs. A compatibility result artifact is not automatically the correct immediate UX contract.

## Issue 2: Homework Writing Ownership Drift
### Symptom
Homework Writing is intended to auto-route work to the assigning teacher, but the current submit path behaves more like solo practice with optional teacher choice.

### Findings
- PRD intent says homework routes to the assigning teacher.
- `WritingSubmission` type still reserves `assigningTeacherId` for homework and `selectedTeacherId` for solo practice.
- Current `WritingPracticeView` writes `selectedTeacherId` even when `context.type = 'homework'`.

### Root Cause
The homework Writing flow reused the solo-practice Writing UI without a strict mode adapter for ownership semantics.

### Solution Direction
- Homework Writing must derive and write `assigningTeacherId` from homework ownership, not reuse the solo teacher-selection path.
- Shared UI reuse is acceptable only if context-specific invariants are enforced explicitly.

### Pattern Extracted
Shared student-writing UI must be wrapped by explicit mode contracts. Reusing the same component for solo and homework is safe only when ownership, status, navigation, and notifications are mode-aware.

## Issue 3: Homework Submission Lifecycle Drift
### Symptom
Writing homework can create a canonical Writing submission while leaving the homework attempt record out of sync with the rest of the homework system.

### Findings
- Generic homework pages depend on `homework_submissions` status and `resultId` linkage.
- The Writing homework path creates a `writing_submissions` record and a compatible RTDB result row.
- The current Writing homework path does not call the generic homework submit helper that transitions the attempt to `submitted` and links the `resultId`.

### Root Cause
Two related producer systems exist for the same user action:
- the Writing grading pipeline
- the homework attempt pipeline

The Writing path currently satisfies the first but not the second.

### Solution Direction
- On Writing homework submit, update both contracts in the same workflow:
  - canonical `writing_submissions`
  - `homework_submissions` status/result linkage
- Treat the homework attempt row as a first-class producer-consumer contract, not optional metadata.

### Pattern Extracted
When a feature bridges two persistence domains, success must mean all downstream reader contracts are satisfied, not only the canonical domain for one subsystem.

## Issue 4: Student Result Surface Fragmentation
### Symptom
Student Writing result access is inconsistent across live session, solo practice, homework, academic record, and generic saved-result shells.

### Findings
- Live-session Writing has a Writing-aware session result path.
- The generic `ResultSlidePanel` still suppresses Writing placeholder sections.
- Writing-only progress UI exists, but it is separate from the generic result-detail shell.
- Non-live Writing depends on a patchwork of academic-record, writing-progress, and result-detail entry points.

### Root Cause
Writing uses a different review contract than auto-graded test types, but the shared saved-result system still assumes a more uniform result shell than Writing can safely support.

### Solution Direction
- Keep Writing review grounded in Writing-aware readers.
- Only bridge into generic result shells where the Writing-specific contract is explicitly supported.
- Do not assume a shared saved-result shell is automatically the primary source of truth for Writing.

### Pattern Extracted
Heterogeneous result types need canonical adapters before they can share shells. A shell that works for auto-graded tests is not automatically valid for teacher-graded Writing.

## Issue 5: Stale Writing-Progress Consumer
### Symptom
The student Writing progress surface reads older field names and therefore cannot be trusted as a fully accurate reflection of current Writing status and grading state.

### Findings
- The current Writing submission schema uses `markingStatus`, `grading`, and `testMeta.testTitle`.
- `WritingProgressSection` still reads `status`, `gradingResult`, and `testMeta.title`.
- This creates silent UI drift even when the canonical Firestore rows are correct.

### Root Cause
A secondary consumer surface was not migrated when the Writing submission schema evolved.

### Solution Direction
- Align all Writing readers to the current canonical submission schema.
- Treat auxiliary student progress widgets as schema consumers that require explicit maintenance.

### Pattern Extracted
Schema migration is not complete until every reader surface consuming that schema is updated. Secondary progress widgets are often where drift survives longest.

## Issue 6: Submit Notification Direction Drift
### Symptom
The PRD expects teacher-facing submission awareness for solo/homework Writing, but the current submit notification points back to the student.

### Findings
- Current `notifyWritingSubmitted()` notifies the student that the essay was submitted.
- No teacher-facing Writing-submit notification path was found for solo/homework submit.
- This weakens the teacher queue/discovery workflow for asynchronous Writing review.

### Root Cause
The submit event was treated as a student confirmation event only, rather than as both:
- student acknowledgement
- teacher work-item arrival

### Solution Direction
- Preserve student acknowledgement.
- Add or restore teacher-facing submission notification/discovery for async Writing work.

### Pattern Extracted
For manually graded async work, submission is a dual-audience event. Students need confirmation, but teachers also need a reliable work-item signal.

## Why These Problems Interact
These bugs are easy to misdiagnose because they appear in different surfaces while sharing the same underlying seams:
- workflow boundary drift between acknowledgement, pending review, and graded review
- ownership drift between convenience teacher ids and true context ownership
- schema drift between canonical Writing submissions and secondary readers
- multi-store lifecycle drift between Firestore, RTDB, and homework submission state
- shell drift between Writing-specific result surfaces and generic saved-result viewers

A fix in only one layer can reduce symptoms without actually restoring the whole feature contract.

## Current State of the Feature After Audit
### Live session
- Student submit path now follows the manual-grading acknowledgement contract.
- Canonical submission is created in Firestore with `pending-review`.
- Teacher grading flow is structurally aligned.

### Teacher grading
- Queue and editor operate on `writing_submissions`.
- Draft-save vs final-grade behavior is now correctly split.
- Ownership filtering still relies on convenience metadata and remains a governance watchpoint.

### Solo practice
- Entry and submit model are broadly aligned with the intended Writing review flow.
- Teacher-selected review and self-review modes both still exist.
- Solo result materialization writes the expected result/index rows.

### Homework
- Writing homework reuses the Writing UI successfully for essay entry and deadline checks.
- Ownership, homework attempt status linkage, and notification semantics are still partially misaligned.
- This is the highest-risk area for future regressions.

### Student results / academic record
- Writing-aware result rendering exists.
- Generic saved-result shells and writing-progress widgets are not yet fully aligned with the current Writing schema and contract.

## Solution Pattern Summary
### Pattern 1: Preserve manual-grading workflow boundaries
Separate:
- submit acknowledgement
- pending-review waiting state
- graded result review

Do not force them into a single generic result experience.

### Pattern 2: Treat homework linkage as a first-class contract
If a Writing homework submit succeeds, both the Writing grading artifact and the homework attempt lifecycle must agree that the attempt was submitted.

### Pattern 3: Shared UI requires explicit mode adapters
If solo and homework share one Writing UI, the shared component must still enforce different rules for teacher ownership, status mutation, and navigation.

### Pattern 4: Canonical schema changes require reader audits
Every schema evolution in `writing_submissions` must be followed by an audit of all reader surfaces, especially progress widgets and academic-record bridges.

### Pattern 5: Writing-specific result types need canonical adapters before generic shell reuse
Do not let generic result shells define the Writing contract by accident. Writing must opt in through explicit adapters.

### Pattern 6: Manual-review submissions are dual-audience events
Async submit flows should create:
- a student acknowledgement
- a teacher-visible work signal

## Cross-Feature Interaction Problems to Watch
- Homework pages may appear to show incomplete or stuck progress if Writing submit bypasses `homework_submissions` state transitions.
- Teacher queue visibility can become brittle if ownership continues to rely only on convenience teacher ids.
- Academic-record Writing surfaces can silently misstate status if they read stale field names.
- Generic result shell changes can accidentally reintroduce invalid Writing UX assumptions.
- RTDB compatibility result failures can create misleading result-view symptoms even when the canonical Firestore submission is healthy.

## Recommended Repair Order
1. Fix homework ownership and homework submission-status linkage.
2. Restore teacher-facing submission awareness for async Writing work.
3. Align stale Writing reader surfaces to the current schema.
4. Re-crosscheck generic saved-result integrations before enabling any broader Writing shell reuse.

## Related Docs
- @doc/architecture/scheme/ielts-writing-current-state-scheme
- @doc/architecture/test-system-architecture
- @doc/architecture/results-academic-record
- @doc/architecture/homework-solo-practice-architecture
- @doc/architecture/result-view/result-view-governance-audit-2026-03-29
- @doc/sop/ielts-writing-grading-permission-runtime-state
- @doc/prd/ielts-writing-test-system-prd

## Final State Summary
The audit confirms that IELTS Writing should be treated as a manual-grading system with mode-specific wrappers, not as a single uniform test-result flow. The safest long-term approach is to preserve the Writing-specific lifecycle while repairing the adapters that connect it to homework, academic record, teacher queue visibility, and result-shell infrastructure.

## Implemented on 2026-03-29

The following repairs are now in code:

- Homework Writing submit preserves assigned-teacher ownership and the linked homework attempt ID.
- Homework Writing submit updates `homework_submissions` so student homework status no longer remains stale after essay submission.
- Final Writing grading upgrades linked homework attempts to `graded` and stores `bandScore`.
- Teacher-facing async Writing submit notification now exists for homework and solo practice.
- Writing progress and saved-result entry surfaces were updated to the live Writing schema and manual-review UX.

Still intentionally deferred:

- Replacing the generic Writing placeholder inside `ResultSlidePanel` with the full dedicated `WritingResultView`.
