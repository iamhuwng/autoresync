# Persistent notification event matrix

Source review: 2026-09-24, isolated `codex/notification-recovery` worktree. These 35 rows cover the ordinary variants in the recovery plan. All delivered items use the existing RTDB `notifications/{recipientId}/{notificationId}` inbox and read flag. This is source status, not deployment proof. Book update notifications use the same inbox but are outside these 35 variants.

| # | Event | Saved authority and recipient | Delivery state |
|---:|---|---|---|
| 1 | Assignment request approved, teacher | RTDB assignment decision and intent; request teacher | Specialized Worker; immediate attempt, one later retry, admin issue |
| 2 | Assignment request approved, student | Same decision and intent; request student | Same bounded path |
| 3 | Class join pending, student | RTDB membership transition and Worker-owned intent; joining student | Specialized class action, bounded retry |
| 4 | Class join pending, teacher | Same transition; class owner | Same bounded path |
| 5 | Direct class add | Same transition; added student | Same bounded path |
| 6 | Class request approved | Same transition; approved student | Same bounded path |
| 7 | Class request rejected | Same transition; rejected student | Same bounded path |
| 8 | Course join or unenroll request approved | RTDB request decision and intent; saved student | Specialized course request action, bounded retry |
| 9 | Course join or unenroll request denied | Same decision and intent; saved student | Same bounded path |
| 10 | Class-course expiration warning | `class_course_links`; class owner | Dormant `sendExpirationWarning` has no caller. No active recovered event |
| 11 | Course archived | `courses` and enrollments | Current archive invariant excludes active enrollments, so no recipient event occurs |
| 12 | Course type approved | RTDB type decision and intent; requesting teacher | Specialized decision path, bounded retry |
| 13 | Course type rejected | Same decision and intent; requesting teacher | Same bounded path |
| 14 | Course announcement | Worker commits announcement and intent; server resolves enrolled roster | Bounded 10-recipient passes and one later retry per failure |
| 15 | Ordinary homework due soon | Firestore assignment and reminder status | Dormant `processStudentReminders` has no caller. No active recovered event |
| 16 | THCS homework due soon | Same source | Same dormant path |
| 17 | Teacher manual homework reminder | Firestore assignment override and immutable reminder intent; assigned student | Specialized Worker wake and bounded retry |
| 18 | Homework submitted | Firestore submission transaction holds intent; RTDB result proves student and teacher | Specialized Worker validation, bounded retry |
| 19 | Homework reset | Firestore reset transaction and immutable event; prior submission student | Specialized reset Worker, bounded retry |
| 20 | Per-question feedback saved | Worker commits feedback and signed intent under canonical result; result student | Specialized feedback action, bounded retry |
| 21 | Overall feedback saved | Same source; result student | Same bounded path |
| 22 | Ordinary test completed | RTDB result creation and separate completion intent; result student | Specialized Worker excludes THCS duplicate, bounded retry |
| 23 | Result marked reviewed | Worker commits review transition and intent; result student | Specialized review action, bounded retry |
| 24 | Individual THCS question manually graded | Worker atomically commits authorized session grade and separate intent; saved answer student | Specialized manual grade action, bounded retry |
| 25 | Writing grade published | Firestore grade and immutable intent; submission student | Specialized writing Worker, bounded retry |
| 26 | Solo writing practice submitted, student | Firestore materialization intent and RTDB result; submitting student | Specialized writing Worker, bounded retry |
| 27 | Class-session writing auto-submitted | Firestore submission intent plus RTDB session/result; session student | Specialized writing Worker, bounded retry |
| 28 | Solo writing practice submitted, teacher | Same submission/result; saved assigned teacher | Same bounded path |
| 29 | THCS homework assigned | Firestore assignment intent; Worker checks teacher and resolves saved target | Specialized Worker processes at most 10 recipients per invocation, persists cursor, then one later retry |
| 30 | THCS fully graded from practice view | RTDB fully graded result intent; result student | Specialized Worker, bounded retry |
| 31 | THCS fully graded from student layout | Same canonical result/intent and deterministic inbox ID as row 30 | Same path; converges on one item |
| 32 | THCS writing auto grade updated | Student client attempts a write under teacher-only `game_sessions` rule | Source write is denied, so no committed event is provable. Removed its unsupported generic notice call; trusted grading remains future source work |
| 33 | Session opened | RTDB session transition and saved roster intent; Worker checks the roster against the class before first delivery | Specialized Worker, at most 10 recipients per pass, bounded retry |
| 34 | Test started | Same session/roster validation for start transition | Same bounded path |
| 35 | Test ended | Same session/roster validation for end transition | Same bounded path |

## Remaining release evidence

- RTDB and Firestore rule tests need a Linux emulator run; the Windows RTDB emulator cannot bind its loopback transport here. The GitHub Actions workflow contains these checks, but it has not run on a pushed branch.
- The local Worker tests and bundle prove source behavior only. Cloudflare authentication, Firestore role for the Worker service account, required Worker API key secret, and live RTDB rule reconciliation remain release gates.
- Historical backfill is not executed. The Hosting file history narrows possible exposure, but does not prove each missed recipient or a continuous outage interval. The preview script currently covers class and homework only.
- Live browser flows and combined Hosting source have not been verified or deployed from this branch.
