# Persistent notification event matrix

Source review: 2026-09-24, isolated `codex/notification-recovery` worktree; committed-event routing updated 2026-09-25 on `codex/notification-combined-release`. These 35 rows cover the ordinary variants in the recovery plan. All delivered items use the existing RTDB `notifications/{recipientId}/{notificationId}` inbox and read flag. This is source status, not deployment proof. Book update notifications use the same inbox but are outside these 35 variants.

| # | Event | Saved authority and recipient | Delivery state |
|---:|---|---|---|
| 1 | Assignment request approved, teacher | RTDB assignment decision and intent; request teacher | Ordinary action, shared committed-event dispatch; immediate attempt, one later retry, admin issue |
| 2 | Assignment request approved, student | Same decision and intent; request student | Same bounded path |
| 3 | Class join pending, student | RTDB membership transition and Worker-owned intent; joining student | Specialized class action, bounded retry |
| 4 | Class join pending, teacher | Same transition; class owner | Same bounded path |
| 5 | Direct class add | Same transition; added student | Same bounded path |
| 6 | Class request approved | Same transition; approved student | Same bounded path |
| 7 | Class request rejected | Same transition; rejected student | Same bounded path |
| 8 | Course join or unenroll request approved | RTDB request decision and intent; saved student | Ordinary decision, shared committed-event dispatch, bounded retry |
| 9 | Course join or unenroll request denied | Same decision and intent; saved student | Same bounded path |
| 10 | Class-course expiration warning | `class_course_links`; class owner | Dormant `sendExpirationWarning` has no caller. No active recovered event |
| 11 | Course archived | `courses` and enrollments | Current archive invariant excludes active enrollments, so no recipient event occurs |
| 12 | Course type approved | RTDB type decision and intent; requesting teacher | Ordinary decision, shared committed-event dispatch, bounded retry |
| 13 | Course type rejected | Same decision and intent; requesting teacher | Same bounded path |
| 14 | Course announcement | Worker commits announcement and intent; server resolves enrolled roster | Bounded 10-recipient passes and one later retry per failure |
| 15 | Ordinary homework due soon | Firestore assignment and reminder status | Dormant `processStudentReminders` has no caller. No active recovered event |
| 16 | THCS homework due soon | Same source | Same dormant path |
| 17 | Teacher manual homework reminder | Firestore assignment override and immutable reminder intent; assigned student | Ordinary action, specialized Worker delivery wake and bounded retry |
| 18 | Homework submitted | Firestore submission transaction holds intent; RTDB result proves student and teacher | Shared committed-event port; Worker validates saved intent, bounded retry |
| 19 | Homework reset | Firestore reset transaction and immutable event; prior submission student | Shared committed-event port to reset resolver, bounded retry |
| 20 | Per-question feedback saved | Worker commits feedback and signed intent under canonical result; result student | Specialized feedback action, bounded retry |
| 21 | Overall feedback saved | Same source; result student | Same bounded path |
| 22 | Ordinary test completed | RTDB result creation and separate completion intent; result student | Shared committed-event port to completion resolver; excludes THCS duplicate, bounded retry |
| 23 | Result marked reviewed | Worker commits review transition and intent; result student | Specialized review action, bounded retry |
| 24 | Individual THCS question manually graded | Worker atomically commits authorized session grade and separate intent; saved answer student | Specialized manual grade action, bounded retry |
| 25 | Writing grade published | Firestore grade and immutable intent; submission student | Shared committed-event port to writing resolver, bounded retry |
| 26 | Solo writing practice submitted, student | Firestore materialization intent and RTDB result; submitting student | Shared committed-event port to writing resolver, bounded retry |
| 27 | Class-session writing auto-submitted | Firestore submission intent plus RTDB session/result; session student | Shared committed-event port to writing resolver, bounded retry |
| 28 | Solo writing practice submitted, teacher | Same submission/result; saved assigned teacher | Same shared bounded path |
| 29 | THCS homework assigned | Firestore assignment intent; Worker checks teacher and resolves saved target | Ordinary action, specialized Worker delivery wake; at most 10 recipients per pass, then one later retry |
| 30 | THCS fully graded from practice view | RTDB fully graded result intent; result student | Ordinary result write, specialized Worker delivery wake, bounded retry |
| 31 | THCS fully graded from student layout | Same canonical result/intent and deterministic inbox ID as row 30 | Same path; converges on one item |
| 32 | THCS writing auto grade updated | Student client attempts a write under teacher-only `game_sessions` rule | Source write is denied, so no committed event is provable. Removed its unsupported generic notice call; trusted grading remains future source work |
| 33 | Session opened | RTDB session transition and saved roster intent; Worker checks the roster against the class before first delivery | Ordinary session action, specialized Worker delivery wake; at most 10 recipients per pass, bounded retry |
| 34 | Test started | Same session/roster validation for start transition | Same bounded path |
| 35 | Test ended | Same session/roster validation for end transition | Same bounded path |

## Remaining release evidence

The ordinary port accepts only event identity and routes to trusted resolvers.
Most specialized endpoints above wake delivery after an ordinary app action
already committed its canonical record and durable event. They are routing
duplication to consolidate behind the shared producer, not product-action
migrations. Actual Worker-owned product actions include class membership,
announcements, feedback, result review, and manual THCS grading. Keep each
exception only with its own authority or atomicity proof. All delivered
notices still use the shared inbox and read-preserving repository.

- Linux CI run 35984381971 passed RTDB rules (33/33), Firestore rules (26/26), Workerd (60/60), and the Wrangler dry-run bundle. The Windows RTDB emulator still cannot bind its loopback transport here.
- The local Worker tests and bundle prove source behavior only. Refresh Cloudflare authentication, Worker identity and secret bindings, and live RTDB rule reconciliation before release. The `class-homework` setting now gates action routes as well as scheduled retries.
- Historical backfill is not executed. The [35-row reconciliation](notification-recovery-historical-backfill.md) records each variant's evidence gate. The Hosting file history narrows possible exposure, but does not prove each missed recipient or a continuous outage interval. The read-only preview script currently covers class and homework only.
- The selective class/homework Hosting source is built and tested on `codex/notification-class-homework-hosting` at `c3e83309`; no live delivery browser flow or combined Hosting deployment has been verified.
