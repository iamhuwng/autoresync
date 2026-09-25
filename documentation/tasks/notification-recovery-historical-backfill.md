# Historical notification backfill reconciliation

**Status:** read-only planning; no historical write or live preview has run (2026-09-24).

This ledger accounts for all 35 ordinary notice variants in the [event matrix](notification-recovery-event-matrix.md). “Candidate” means a saved record might prove the event; it is not permission to write a notice. For each recipient, a writer must prove the event time fell in the verified outage interval, the recipient belonged to the event at that time, the saved action actually committed, and the deterministic inbox ID is absent. Preserve an existing inbox row and its `read` flag. Rows 30 and 31 represent one canonical event, not two notices.

## Outage interval gate

The inspected Hosting release `bc08f3f7e2936066` at 2026-09-24 05:07:20Z contains a producer bundle with no Worker origin. Release `d9ee9cee411c5af5` at 04:31:18Z is an earlier inspected point. Neither establishes when the failure began, when every producer stopped, or whether an older release worked. Before preview or execution, read current Hosting release history and deployed assets, identify the last verified working bundle and first broken bundle for each producer group, and record a half-open interval `[start, end)` with the evidence for both bounds. If a bound cannot be proven, leave that group's historical backfill blocked rather than guessing. Source event timestamps must be evaluated in UTC.

Read-only Hosting REST inspection on 2026-09-25 returned the newest 100 releases, from 2026-09-24 09:06:05Z back to 2026-04-25 13:43:26Z, with another page available. The newest version remains `aea32fa07517146f`. Version `31a9052843c443c5` appears in both July and August releases; release dates alone therefore cannot identify a working producer. The file-list API returns paths and hashes, not historical file contents. No working-to-broken bundle transition has been proved, so no outage interval or backfill eligibility is approved.

## Row-by-row eligibility

| # | Historical source to inspect | Decision until source and interval are proven |
|---:|---|---|
| 1 | Approved assignment request, reviewer/time, saved teacher | Candidate for teacher only after decision and recipient validation. |
| 2 | Same request, saved student/assignment link | Candidate for student only after link and decision validation. |
| 3 | Pending class membership and new Worker intent | New intent can be previewed; older membership may have changed, so no inferred historical pending event. |
| 4 | Same intent and saved class owner | Same limit; teacher recipient must be the owner at occurrence. |
| 5 | Direct class add intent, or historical roster joinedAt | New intent can be previewed; old roster alone lacks reliable actor/occurrence proof. |
| 6 | Approval intent and pending-to-active transition | New intent can be previewed; current active roster alone cannot prove an approval notice. |
| 7 | Rejection intent | Old rejection deletes membership rows; without an intent or audit record, omit. |
| 8 | Course request approved with processedAt and student | Candidate after decision, original student, and time validation. |
| 9 | Course request denied with processedAt and student | Same gate, with denied decision. |
| 10 | Class-course expiration sender | Dormant sender has no caller; no historical event to restore. |
| 11 | Course archive and enrolled roster at archive time | Current archive invariant has no active enrollees; no recipient event under this behavior. |
| 12 | Approved course-type request and requesting teacher | Candidate after decision/time/owner validation. |
| 13 | Rejected course-type request and requesting teacher | Same gate, with rejected decision. |
| 14 | Committed announcement, target snapshot, text, createdAt | Candidate only if the original recipient roster is saved; a current roster is insufficient. |
| 15 | Ordinary due-soon reminder | Dormant scheduler has no caller; no historical event to restore. |
| 16 | THCS due-soon reminder | Same dormant scheduler; no historical event to restore. |
| 17 | Manual reminder occurrence, assignment, target student | Candidate only if a durable occurrence and target exist; assignment alone is insufficient. |
| 18 | Submitted homework and canonical result/visibility owner | Candidate in the existing read-only class/homework preview; preserve original submittedAt. |
| 19 | Homework reset event and prior submitted student | Candidate only when immutable reset event and previous recipient are retained; deletion alone is insufficient. |
| 20 | Result question feedback history with author/time | Candidate if the exact saved question feedback occurrence and student are retained. |
| 21 | Result overall feedback history with author/time | Candidate under the same occurrence and student proof. |
| 22 | Ordinary completed result with student and completion time | Candidate after excluding THCS duplicate and proving committed result creation. |
| 23 | Reviewed result with reviewedAt/reviewer and student | Candidate after confirming the saved pending-to-reviewed transition. |
| 24 | Manual THCS question-grade occurrence | Current answer alone cannot reconstruct prior grade versions; require saved action intent/audit or omit. |
| 25 | Published writing grade, audit version/time, submission student | Candidate if published audit version identifies the exact occurrence. |
| 26 | Solo writing submission, materialization time/student | Candidate after matching Firestore submission to canonical result. |
| 27 | Class-session writing submission, session/result/student | Candidate after matching saved session generation and result. |
| 28 | Solo writing submission with assigned teacher at submission | Candidate only if the historical selected teacher is saved; current assignment is insufficient. |
| 29 | THCS homework assignment, createdAt and saved target | Candidate if the original student/class target can be resolved as of creation. |
| 30 | THCS fully graded result and canonical completion marker | Candidate for one canonical notice per result after proving all grading complete. |
| 31 | Same result as row 30, reached from another UI path | Deduplicate with row 30; never create a second historical notice. |
| 32 | Student-side THCS writing auto-grade write | Source write is denied by teacher-only session rules; no committed event, so omit. |
| 33 | Saved session-opened event, generation, and roster | Candidate only when the original event and exact recipient roster were saved. |
| 34 | Saved test-started event, generation, and roster | Same gate; current session state alone cannot prove the start notice. |
| 35 | Saved test-ended event, generation, and roster | Same gate; current ended state alone cannot prove the original roster. |

Book homework assignment and Book update notices are additional Worker-owned events outside the 35 rows. Include them in the release's historical review only if committed saga/update records prove recipient, event time, and deterministic identity; never derive recipients from current enrollment alone.

## Execution gate

The existing `scripts/preview-notification-backfill.mjs` reads a local export and covers class intents plus homework submissions only. Its output is partial and must carry that label. For each other candidate row, add a source-specific read-only validator using the live event identity before writing anything. Redact bodies and user IDs from summary output; report scanned, eligible, already present, conflicted, and unprovable counts per row. Require a fresh backup of source and inbox, a reviewed preview, a bounded writer with readback and replay checks, and an approved outage interval. No row may be marked restored from a green unit test or the current source matrix alone.
