# Feedback/review occurrence authority proposal

Prepared 2026-09-27 from live source at transport checkpoint `fe120358`.
Proposal only: no source permissions, capture endpoint, product owner or
delivery family is changed. App ownership remains the target; no current
cohort is proven under the existing rules.

## Supported-context decision table

| Context | Exact source/occurrence joins | Writers and existing safeguards | Minimum capture and prerequisite |
|---|---|---|---|
| **First proposed cohort: individually assigned IELTS Writing homework** | RTDB `homework_student_safe_tests/{homeworkId}` supplies verified `teacherId`, `contentRef.contentId` and student target; `homework_student_safe_test_access/{homeworkId}/{studentId}` supplies access. Firestore `homework_submissions/{submissionId}.notificationIntent` supplies `resultId`, `homeworkId`, `studentId`, `teacherId`, `submittedAt`, deterministic event ID. `writing_submissions/{resultId}` must have the same student, homework/submission IDs, test/content ID; bind its own submitted time independently. Canonical `test_results/{resultId}` must match these exact joins. | Assignment Worker creates admin-protected projection/access (`r2-backup-worker/src/homework/assignments.ts:702,1094`; `database.rules.json:1494`). App creates Writing artifact, materializes same-ID result, then commits homework submission (`WritingPracticeView.tsx:588–635`, `homeworkSubmissionService.ts:462–506`). Submission update checks the outbox envelope (`firestore.rules:645–665`), but creation accepts a prefilled forged envelope (`:619`), and ordinary updates permit identity replacement. Writing update freezes student/context/assigning teacher but leaves homework/submission/test/time binding mutable (`:954–959`). | Capture verified result/student/teacher, homework/test IDs, submission path/ID, event ID/time, Writing artifact ID, immutable result submission identity and capture time. Before capture relies on this cohort, student submission creation must start without intent/delivery in an ordinary initial state; identity/source fields must stay immutable through the rule-checked submitted transition. Freeze the relevant Writing source-binding fields or use an already protected exact envelope. Verify all joins and saved target/access. Exclude administrative imports and class targets from this first cohort. |
| Writing live session | Firestore `writing_submissions/{resultId}` and `writing_notification_intents/writing-{resultId}-submitted-student`; RTDB exact session/test occurrence and participant result linkage. | App creates artifact/intent and separately materializes result/session markers (`writingSubmissionService.ts:1862–1932`). Intent trusts supplied assigning teacher; session ancestor grants and participant writes leave linkage mutable (`database.rules.json:1362` and descendants). | **Held:** no protected exact test occurrence/participant/result binding. Session code and current/last test are insufficient. |
| Other class-session results | `game_sessions/{sessionCode}/activeTests/{assignmentId}` supplies test, assigned students/time; participant submission marker would need exact result linkage. | `sessionManager.js:803–865` writes assignment/student selection. Result save is separate; THCS traced path does not persist exact result linkage. | **Held:** mutable assignment/participant fields and absent canonical result link. Do not infer occurrence from session ownership. |
| Course material | `course_book_authority/enrollments/{courseId}/{studentId}` plus releases proves enrollment/release; `courses/{courseId}.ownerId` and exact placement identify source. | Protected enrollment/release rules (`database.rules.json:3098–3132`); ordinary course progress remains broadly writable (`:1582–1588`). | **Held:** enrollment/release does not establish completed material/result occurrence; result linkage and source ownership are not sufficiently preserved. Existing Book authority stays separate. |
| Deleted source | Previously protected capture/occurrence made while source and participant evidence were verifiable. | Existing result visibility is browser-writable (`database.rules.json:222,224`). | Only independently protected prior evidence qualifies. Unsigned old visibility, raw teacher IDs and deleted-source flags remain unproven/readable. |
| Solo/unresolved | Student identity only. | Shared visibility classifier denies teacher actions. | No feedback/review teacher authority. |

The Writing artifact and homework transaction are committed sequentially, so
their timestamps need not be equal. Bind each saved time to its own occurrence;
compare student/source/content/result identities across records, not clock
equality between distinct commits.

## Proposed capture boundary

First reuse an existing protected immutable occurrence. If none suffices, one
create-only record per result is permitted in principle by the scoped planner
decision. Proposed path: `result_notification_authority/{resultId}`. Its final
path and fields require planner acceptance before implementation.

The trusted capture reader derives facts from the first cohort's exact joins;
it rejects ambiguous/mismatched results, unresolved/solo contexts, client
visibility-only claims and unsupported sources. It records only `schemaVersion`,
`resultId`, `studentId`, `ownerTeacherId`, context/source/test IDs, exact
occurrence path/ID/time, homework submission/event IDs, Writing artifact ID,
result submission identity/time and `capturedAt`. Existing ETag/CAS helpers
create against absence; same verified facts replay, different facts conflict.
Capture makes no feedback/review product change and is reused by later actions.

Protect the new subtree from all browser writes, including the root
`super_admin` grant, and preserve required backup coverage. Parent and field
result grants must protect every matching identity/source/occurrence field;
a child denial cannot override an ancestor write. Existing editable results
must pass independent occurrence verification, rather than becoming trusted
merely through freezing. Preserve readable unproven rows.

## App atomic-save rule predicates

Both saves require authenticated teacher role, the existing outer
`student_teacher_links/{teacherId}/{studentId}` relationship, a matching
protected capture, and the shared classifier's non-solo owned verdict. The
teacher-writable outer link is not ownership or participant proof.

- **Review:** narrow root update from old `pending-review` and absent event to
  marking status, actor/time, stable event pointer and matching initial intent.
  Preserve all unrelated fields; reciprocal source/event/actor/student binding
  is required. Competing transitions lose; replay reads the saved event without
  overwriting source or progressed delivery.
- **Feedback:** existing target feedback/question mirror, metadata, append-only
  event-keyed history and matching initial intent are one update. Exact actor,
  student, question, text, time and event must agree. Expected current revision
  rejects stale saves; different-content event reuse fails. Both question and
  overall retry read immutable history. Delete only current feedback/mirror,
  retaining proven history and intents.

All browser roles, including super-admin, must fail root/parent/leaf/combined
forgery, history replacement/deletion and progressed-delivery replacement.
Require focused legitimate-save plus adversarial ancestor-shaped emulator
proof before permission approval. Worker feedback/review routes become saved
intent delivery only in the same coordinated batch; source mutation/custom
token commit paths are removed with their callers/rules.

Announcement, grading, executor deployment, activation and backfill remain
held. This proposal does not authorize a general auth or grading redesign.
