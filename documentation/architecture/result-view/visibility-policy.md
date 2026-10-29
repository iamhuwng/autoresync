# Result View Visibility Policy

## 2026-10-30 Listening Classic observability

Draft PR #196 adds playback control telemetry and presentation. It does not
change result reads/writes, answer release, grading, private audio authority,
assignment pins or Firebase rules. Existing replacement notices remain in the
player; moving their presentation does not grant result or recording access.
Actual private playback/submission/reloaded-result browser proof is pending.

## 2026-10-29 Homework retake navigation

Retake navigation uses the existing `canSubmit` eligibility and canonical
submission creation. It does not change saved-result ownership, answer release,
grading, or version pins. Listening detail counts read only the existing
authenticated student-safe `questionCount` and `updatedAt` leaves; the teacher
test record is not needed to display them. Result access rules are unchanged.

## 2026-10-28 Listening acceptance permissions

Listening browser writes cannot replace a result or change its grading, answers
or pinned version. Existing authorized metadata and canonical teacher feedback
remain writable; the result's student may save generated feedback and status.
A homework grant exposes only the recording timestamp. Private source questions,
result read authority, release timing and teacher ownership remain unchanged.

## 2026-10-28 Listening completion candidate

Listening grades and completion are trusted Worker writes. RTDB rules deny
browser creation or mutation of canonical Listening totals and score indexes,
including writes through allowed ancestors. Homework teacher discovery uses
the schema-4 trusted result authority; course/session ownership still resolves
from the current canonical owner. Result audio reads the canonical result using
the caller's Firebase ID token, so current Firebase read rules also gate playback;
stale asset viewer arrays cannot grant access. Only after this check does the
Worker authorize the original version/asset and resolve a replacement recording.
Historical answers, keys and scores remain unchanged. A small replacement note
does not grant result access or alter review/feedback release timing. Existing
saved-result shells, Writing and guest-claim policies remain in force. These are
candidate semantics; deployment and live verification remain release gates.

This file is the canonical policy for who can see a result, who owns it, and when teacher actions are allowed.

## PRD0062 #104 Observability Note

The Book runtime action names added to `src/config/featureRegistry.ts` are
observability metadata for launch, denial, and return behavior. They do not
read or write result records, grant result visibility, or change any student,
teacher, or administrator ownership rule in this policy.

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


## 2026-10-18 Reading backend source reconciliation

Reading homework ownership is derived from the saved assignment createdBy field after assignment ID and material binding checks, including public material authored by another teacher. Teacher discovery uses teacher_result_keys/{teacherId}/{resultId}: true. This reconciles source with the active Worker; it grants no new browser permissions.

See [the dated remaining-work record](../../release-audits/2026-10-18-remaining-nonbook-work.md).

## 2026-10-20 Reading V2 multiple-slot review

Rendering a multi-slot Reading V2 result as one prompt with a question-number range does not change student or teacher access. The existing `reviewState` release gate still controls correct-answer visibility, and the existing shared ownership verdict still controls teacher access and actions.
