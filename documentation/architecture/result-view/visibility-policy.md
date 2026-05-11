# Result View Visibility Policy

This file is the canonical policy for who can see a result, who owns it, and when teacher actions are allowed.

## Two-Step Gate

A teacher can access a result only when both conditions are true:

1. The teacher has the required outer student-assignment relationship.
2. The individual result row can prove authoritative context through source linkage or submission snapshot.

Raw `teacherId`, `assigningTeacherId`, or `selectedTeacherId` values are not authoritative ownership proofs on their own.

For homework detail result modals, RTDB read access to `test_results/{resultId}` is also part of this gate. A `permission_denied` read is usually a canonical visibility/ownership failure, not proof that the modal shell needs a local fallback.

## Canonical Contexts

| Context | Meaning | Teacher-Owned |
| --- | --- | --- |
| `homework` | result tied to a homework assignment | yes |
| `class_session` | result tied to a governed class session | yes |
| `course_material` | result tied to course-owned material | yes |
| `solo_practice` | self-directed student work | no |
| `unresolved` | row saved without enough proof to classify teacher ownership | no |

## Ownership Rules

- Homework, class-session, and course-material rows use authoritative ownership resolution.
- Submission snapshots are the historical truth for later reads.
- If a source row is deleted later, the saved submission snapshot remains the proof of past ownership.
- Solo practice is student-owned. Assigned teachers may have read-only visibility, but that does not convert the row into teacher-owned work.
- Unresolved rows stay visible to the student but are excluded from teacher-owned surfaces and analytics until reconciled.

## Teacher Actions

- Teacher feedback, review actions, and teacher-owned workflow controls are allowed only on teacher-owned rows.
- Solo-practice rows may be visible to an assigned teacher, but teacher-write actions must stay disabled there unless product policy explicitly changes.
- Admin or reconciliation tools may inspect unresolved rows for diagnosis, but they do not redefine ownership.

## Producer Rules

- Result writers must store enough context or snapshot evidence for later ownership resolution.
- Saved-result writers must keep the canonical teacher feedback shape on the saved result row in sync with any legacy compatibility nodes.
- Visibility classifiers must prefer authoritative context and snapshots over convenience fields.
- Generic `context.source.submissionId` must remain a generic attempt id; only explicit Writing identifiers may trigger `writing_submission` ownership lookup.

## Consumer Rules

- Student surfaces may render the result when the student is entitled to it.
- Teacher history surfaces may list only rows that pass the shared visibility classifier.
- Teacher detail shells must use the shared ownership verdict before exposing teacher actions.
- Analytics and teacher-owned reporting must exclude solo-practice and unresolved rows.
- If teacher result detail loses access mid-view, clear sensitive data and show access-lost UI; repair belongs in canonical visibility/reindex code, not shell-local fallback logic.
