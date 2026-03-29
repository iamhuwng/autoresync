---
title: 'Pattern: Student-Safe Solo Test Projection'
description: How solo-practice IELTS loads sanitized RTDB projections, common failure modes, backfill strategy, and cross-feature risks.
createdAt: '2026-03-28T12:48:44.837Z'
updatedAt: '2026-03-28T12:49:09.497Z'
tags:
  - pattern
  - solo
  - ielts
  - rtdb
  - firebase
  - data-integrity
---

# Pattern: Student-Safe Solo Test Projection

## Problem

Solo Practice for non-writing IELTS tests does not read directly from `tests/{id}`. It reads a sanitized projection from `student_safe_tests/{id}` so students do not receive grading payloads in the initial delivery object.

When the canonical test exists but the student-safe projection is missing, the student can see the material in Library but fail when opening practice.

## Feature Contract

### Read path
- `useSoloTestData()` loads the solo payload through `getStudentSafeTestFromFirebase(testId)`.
- The expected first lookup is `student_safe_tests/{id}`.
- The payload must exclude answer-key fields such as `answer`, `correctAnswer`, and `correctAns`.

### Write path
- `saveTestToFirebase()` must write both `tests/{id}` and `student_safe_tests/{id}`.
- `updateTestInFirebase()` must refresh the student-safe copy after canonical updates.
- Backfills must preserve all renderable content while stripping grading fields.

## Incident Snapshot

### Issue
- Students could not open IELTS Solo Practice from Library even though the card was visible.
- Console failure was `Student-safe test payload not found`.

### Findings
- The live RTDB had canonical tests under `tests/` but `student_safe_tests/` was empty.
- The current codebase already contains a fallback in `getStudentSafeTestFromFirebase()` that can rebuild a safe payload from the canonical test.
- THCS solo practice does not use this projection path.
- IELTS Writing also uses a separate load path and is not dependent on `student_safe_tests/{id}`.

### Root Cause
- This was a denormalized-data integrity gap: the solo IELTS read path depended on `student_safe_tests/{id}`, but legacy/live data did not contain that projection.
- The bug scope was not "all IELTS forever". It affected IELTS Reading/Listening-style solo tests whose student-safe projection was missing.

### Solution Applied
- Added a guarded fallback/backfill path so missing projections are rebuilt from `tests/{id}` without blocking the student flow.
- Backfilled the live `student_safe_tests` node with sanitized payloads.
- Verified that the sanitized payload contains no answer-key fields.

## Current State

As of 2026-03-28:
- Current save flows create both canonical and student-safe copies.
- Current update flows refresh the student-safe copy.
- Live RTDB `student_safe_tests/` was restored by backfill.
- Existing IELTS solo tests should now load even in environments that still expect the projection to exist.

## Cross-Feature Interaction Risks

### Library ↔ Practice
- Library discovery can succeed even when practice delivery fails, because listability comes from canonical/discovery data while practice delivery depends on `student_safe_tests/{id}`.

### Test Editor ↔ Solo Delivery
- Any creation, import, restore, or migration path that writes only `tests/{id}` and skips `student_safe_tests/{id}` can silently reintroduce the bug.

### Update Flows ↔ Student Safety
- If canonical test edits are saved without refreshing the projection, students can see stale or structurally incompatible payloads.

### Backup / Restore ↔ Denormalized Nodes
- Restoring only canonical test nodes without restoring or rebuilding derived student-safe projections leaves the system partially healthy: content exists, but student delivery breaks.

### Feature Scope Confusion
- THCS and IELTS Writing use different loading paths. Treating this as a generic "all test types" problem leads to noisy debugging and incorrect fixes.

## Reusable Pattern

When a student-facing flow depends on a sanitized or derived RTDB projection:
1. Treat the projection as a first-class contract, not a cache you can forget to rebuild.
2. Write the canonical record and all required delivery projections in the same save/update lifecycle.
3. Add a safe fallback that can rebuild missing projections from canonical data.
4. Include a backfill strategy for legacy records and restore operations.
5. Test the full chain: discovery -> open practice -> submit.

## Operational Checklist

- [ ] Save path writes `tests/{id}`.
- [ ] Save path writes `student_safe_tests/{id}`.
- [ ] Update path refreshes `student_safe_tests/{id}`.
- [ ] Restore/migration jobs include derived delivery nodes or trigger a rebuild.
- [ ] Library-open flow is tested against legacy data, not only fresh creates.
- [ ] Sanitized payloads are checked for leaked answer fields.

## Related

- @doc/system/solo-study-homework-system
- @doc/architecture/homework-solo-practice-architecture
- @doc/patterns/pattern-rtdb-multi-path-write-obligation
