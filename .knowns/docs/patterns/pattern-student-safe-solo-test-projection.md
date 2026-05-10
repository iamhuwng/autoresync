---
title: 'Pattern: Student-Safe Test Delivery Projection'
description: How IELTS student render payloads are projected from canonical tests, including atomic safe writes, live-session freshness fallback, image-mode ranges, and repair-only backfill.
createdAt: '2026-03-28T12:48:44.837Z'
updatedAt: '2026-05-10T04:14:48.631Z'
tags:
  - pattern
  - student-delivery
  - ielts
  - rtdb
  - firebase
  - data-integrity
---

# Pattern: Student-Safe Test Delivery Projection

## Problem

Legacy IELTS Reading/Listening delivery cannot read directly from `tests/{id}` for student render payloads because canonical tests can carry answer keys and teacher/editor-only fields.

Student pages need a fresh sanitized projection that preserves render metadata such as `displayMode`, `audioSections`, `questionImages`, and per-image `questionRange` while stripping answer fields.

## Feature Contract

### Canonical path
- `tests/{id}` is teacher/admin source of truth.
- Grading reads answer-bearing questions from canonical data when needed.
- Student render loaders should not use canonical test rows as normal payload source.

### Student-safe path
- `student_safe_tests/{id}` is the global answer-free render payload.
- Payload must exclude answer-key fields such as `answer`, `correctAnswer`, and `correctAns`.
- Payload must preserve render fields, especially image-mode `questionImages` with separate `questionRange` entries.

### Live-session path
- `session_test_payloads/{sessionCode}` is a session snapshot created when a teacher starts a live session.
- Live delivery may use the global `student_safe_tests/{id}` payload when the session snapshot is missing, points at a different test, or is older than the global safe payload.

## Write Path Rule

Normal save/update/edit paths must write canonical and student-safe data in one lifecycle.

Current required producers:
- `saveTestToFirebase()` writes `tests/{id}` and `student_safe_tests/{id}` together.
- `updateTestInFirebase()` merges canonical updates and regenerates `student_safe_tests/{id}` in the same root update.
- Teacher Lobby / material-card edit modal save regenerates `student_safe_tests/{id}` from the same edited data it writes to `tests/{id}`.

Backfill and `refreshStudentSafeTestData(testId)` are repair-only tools for old/missing projection incidents. They are not the expected workflow after teacher edits.

## Image-Mode Rule

`questionImages` is student-visible render metadata.

For each image:
- `sectionNumber` scopes it to the listening part/section.
- `questionRange.start` and `questionRange.end` decide which question group displays it.
- a single section can have multiple images with different ranges.

If the editor shows multiple images but the student runtime shows only one, inspect `student_safe_tests/{id}.questionImages` first. If the projection is stale, fix the producer path. Do not treat manual Firebase CLI repair as the foundation.

## Incident Lesson

Earlier incident shape:
- Library/discovery could show IELTS material while practice open failed or showed stale media.
- Canonical `tests/{id}` was updated, but `student_safe_tests/{id}` was missing or stale.
- Direct Firebase repair made one case look fixed, but did not prove the save path was healthy.

Current root-cause rule:
- If a teacher edit save does not update the student-safe payload immediately for new loads/reloads, it is a producer bug.
- If a live-session snapshot is older than the global student-safe payload, loader freshness logic must return the newer global projection.

## Cross-Feature Risks

### Library / Practice
Library discovery can succeed even when practice delivery fails because listability and render delivery use different data nodes.

### Test Editor / Student Runtime
Any editor, import, restore, or migration path that writes only `tests/{id}` can silently reintroduce stale student runtime behavior.

### Backup / Restore
Restoring only canonical tests without restoring or rebuilding safe projections leaves content visible but student delivery unhealthy.

### Scope Confusion
THCS and IELTS Writing have different load paths. This pattern applies to legacy IELTS Reading/Listening-style projected delivery, not every test type.

## Reusable Checklist

- [ ] Save path writes `tests/{id}`.
- [ ] Save path writes `student_safe_tests/{id}` in the same lifecycle.
- [ ] Update/edit path refreshes `student_safe_tests/{id}` from the merged canonical data.
- [ ] Image-mode projection preserves all `questionImages` entries and ranges.
- [ ] Live-session loader falls back to current global safe payload when session cache is stale.
- [ ] Sanitized payloads contain no answer fields.
- [ ] Backfill is reserved for incident repair or legacy migration.

## Repo Docs

- `documentation/architecture/student-test-delivery-projections.md`
- `documentation/tasks/0036-anti-cheat-runtime-contracts.md`
- `documentation/architecture/homework-solo-practice-architecture.md`

## Related

- @doc/system/solo-study-homework-system
- @doc/architecture/homework-solo-practice-architecture
- @doc/patterns/pattern-rtdb-multi-path-write-obligation
