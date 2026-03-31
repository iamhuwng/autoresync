# Course Class Management

Canonical result visibility governance for course and class contexts lives in:
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/result-visibility-producer-consumer-contract.md`

## Class-Linked Course Material

- When a result belongs to class-linked course material and no stronger context exists, ownership resolves from `classes/{classId}`.
- The authoritative owner field is `createdBy`.
- Unsafe placeholders such as `unknown` do not prove ownership.

## Standalone Course Material

- When a result belongs to standalone course material and no stronger context exists, ownership resolves from `courses/{courseId}`.
- The authoritative owner field is `ownerId`.

## Assignment Boundary

- `student_teacher_assignments` remains the outer access gate only.
- `assignmentId` remains secondary metadata under the canonical snapshot.
- Assignment metadata must never become a top-level visibility tier in Phase 1.

## Student Enrollment Read Contract

Student shell course and class surfaces follow the shared shell ownership rules in `documentation/architecture/student-shell-data-loading.md`.

Required rules:
- the shell provider owns the canonical student class membership summary for shell routes
- enrollment-oriented page helpers must accept shell-owned class membership summaries when available instead of rereading the same membership set
- top-level `classes` scans remain legacy fallback only when the canonical `student_classes/{studentId}` projection is unavailable
- page mount and tab switch must not perform hidden membership backfill or duplicate class scans

Current repo anchor:
- enrollment enrichment accepts `getEnrollmentsByStudent(studentId, { studentClasses })`
