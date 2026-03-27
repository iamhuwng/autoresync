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
