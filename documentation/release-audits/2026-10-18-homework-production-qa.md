# Controlled production Homework QA — 2026-10-18

Current status: **both blockers corrected and verified live** after the scoped
PR #157 release and replay. See the authorized follow-up below and
[release record](2026-10-18-homework-qa-correction-release.md). The initial QA
and diagnosis below are historical: that phase reproduced two failures with
one approved assignment and one attempt and performed no deployment.

## Approved records and observed behavior

The Teacher quick-login account assigned the existing one-question THCS fixture
“Notification public Homework QA 2026-10-02” from the teacher lobby to the sole
selected “Student — Notification clock-skew QA 2026-09-27.” The instructions
identify this as October 18 stable-release QA; the deadline is October 19 at
12:00 Asia/Bangkok. Both accounts entered through `/login`.

- Assignment: `homework-3cee745d-7140-40d4-a950-03420cc4107d`.
- Material: `thcs-test-1790924020881-gezr5n1`.
- Saved result: `-P4D6M6ZDaErfMPWiDZ4`.
- The student saw the assignment, launched it, selected the correct answer and
  submitted once. The result showed 1/1 correct; Homework showed Submitted,
  1/1 attempts and 100%.
- The teacher detail showed 1 assigned, 1 submitted, 100% completion and average,
  one on-time attempt, and no student needing attention.
- The student's “Test Complete” notice survived a reload. The teacher inbox
  contained “Homework submitted” at October 18, 15:25:18 Asia/Bangkok.
- **Failure:** no new “New THCS homework” notice appeared in the student feed.
- **Failure:** the assigning teacher's “View Result” opened “Access Revoked.”
  The saved score projection does not establish access to the canonical result.

The live assignment path uses `createHomeworkAssignmentViaWorker`; this is a
real Firebase-issued-token check of the released assignment service, rather
than the earlier local fixture-token acceptance. No reminder/reset, additional
attempt, other recipient, record deletion or permission change was performed.

## Assignment-notice diagnosis

The client creates a single immutable assignment proof without `studentId`;
the Firestore rule requires that shared schema. The notification Worker instead
requires the proof's absent `studentId` to equal each selected recipient. Its
tests had fabricated a proof shape that the actual Firestore rule disallows.
The exact actor, assignment, timestamp, role and per-recipient membership checks
remain necessary; recipient authority belongs to those checks.

Read-only Cloudflare observations at `2026-10-18T08:32:58.694Z` confirmed:

| Service | Active version, 100% | Relevant evidence |
| --- | --- | --- |
| `luyentap-notification-command` | `541166ae-93db-4d92-8eda-5fb291325b42` | `notification-command-active.mjs`, SHA-256 `4aafcc20e5ebe7d10f1d83c12ec952067500096e339de9ba8c2009e4a52cf91d`, contains the incorrect proof check |
| `luyentap-notification-firestore-qa` | `5696e963-c5ed-463d-a495-30db3c07bc98` | Public caller binds `NotificationBridgeObject` in the command service |

The reviewed production environment still enables this endpoint and has the
same SHA-256 as the Book-restored Hosting release. This failure is not an
intentionally disabled notification rollout. Correcting TypeScript alone is
insufficient because the qualified entry imports the retained release module.

## Teacher-result diagnosis

Read-only Firestore/RTDB observations at `2026-10-18T08:38:23.775Z` confirmed
the sole QA submission references this saved result and the assigning teacher.
The canonical result has `testType: THCS-THPT`, `testSkill: Mixed`, the exact
Homework/source/submission context, `ownershipResolved: false`, no teacher
visibility owner, and no `result_notification_authority` record.

The live result `.read` expression equals the tracked rule exactly (SHA-256
`a7e547de5ccb3162fb91b1c3865b30e2316e08364c357edbc550c4356311d3fb`).
The private THCS save deliberately leaves ownership unresolved; the existing
trusted Homework authority branch accepts Writing only. Consequently the
teacher can read the Firestore submission projection but not the RTDB result.
Relevant files are unchanged between Hosting source `091a1746` and main
`e04022e4`; this is retained behavior, not a change introduced by the isolated
Homework assignment Worker release.

Do not fix this by trusting a student-supplied teacher owner or granting every
teacher access. A correction needs independently verified assignment/result
authority and negative access tests, followed by the real teacher result flow.

## Evidence and remaining gate

Ignored evidence is under the stable checkout's `tmp/`: `live-homework-qa-*`
screenshots, `live-homework-qa-notification-current-20261018.json`,
`live-homework-qa-data-20261018.json` and the exact observed RTDB rules file.
These records contain dedicated QA identities but no authentication tokens.
The QA records remain in production; rollback would not delete them.

Submission, grading, score projection and both completion/submission notices
pass this controlled case. Assignment-notice delivery and teacher full-result
access remain open until corrected, separately released and rechecked. This
does not close PDF Book acceptance or the separate local-clone prerequisites.

## Prepared correction and local acceptance

The source correction keeps the shared assignment proof and independently
checks each recipient against the assignment. For submitted THCS Homework, the
existing trusted notification verifier now conditionally creates a schema 3
receipt before delivering the teacher notice. It verifies sealed Firestore
source names and creation cutoffs, assignment ownership and membership, and the
exact saved THCS student/material/Homework/attempt/timestamp identity. Conflicting
receipts fail closed; retry can repair a missing receipt even when the notice
already exists. No answer or essay payload is read for authority verification.

Only the canonical result `.read` predicate changes: its additional branch
allows the receipt-bound assigning teacher to read that exact result. Existing
Writing authority, write/validation rules, feedback permissions and private
student indexes remain unchanged. A client-supplied visibility owner cannot
create this grant. The retained release module must carry the same correction;
unrelated module bytes and the public caller stay fixed.

The real local Teacher flow entered `http://localhost:5173/login`, revealed dev
quick login, signed in, opened Homework and clicked View Result. With the same
saved fixture but no receipt it showed Access Revoked. The actual source
verifier then created the receipt and teacher notice through conditional writes
to an isolated RTDB emulator; reopening the real modal showed 100%, 1/1 points,
10.0 scaled score and one correct answer. Firestore source metadata was a sealed
test fixture, not a production provider call. The modal's Firebase subscription
was real and unmocked.

The two exact-rules emulator tests executed with no skips. They prove private
access before verification, correct teacher access afterward, unrelated and
unauthenticated reader denial, receipt create/update/delete denial through
direct, parent and root paths, protected identity/score/answer immutability,
and denial after privileged identity tampering. The six client producer tests
also pass. The final notification Worker suite executed 50 tests across eight
files with no skips, including the actual retained Durable Object module,
assignment delivery, forged identities, THCS receipts and replay. The retained
Homework function matches compiled source with only blank lines ignored;
bytes outside the two reviewed function regions match the prior live artifact.
Clean-runner CI remains a separate proof.

Local acceptance used disposable Auth/RTDB/Firestore ports 19099/19000/19080;
the existing shared services on 9000/8080 were untouched. The app build reused
the identical locked `pdf-lib` installation from the original checkout via an
ignored acceptance configuration. Build concurrency/heap limits resolved local
memory pressure. This configured-machine proof does not replace clean-install
CI or the unresolved normal-clone secret/Auth prerequisites. Blocked Google
Fonts requests and the historical-score query's private-index permission error
were recorded; neither prevented the result modal from rendering.

Receipt issuance currently shares the notification verification path. A failed
delivery/verification request still requires a safe retry; this correction does
not introduce a background queue or broad historical result backfill. Existing
QA records should be replayed through that same verifier after a separately
authorized Worker/rules release, followed by production recipient and teacher
browser checks. No correction is deployed by this local acceptance.

## Authorized release and production replay follow-up

PR #157 merged as `f38826e6`. The owner-approved notification command version
`a184d75b-8823-485a-885d-e23354646f45` is deployed at 100%, and the narrow RTDB
result-read correction matches the reviewed full rule tree. Two independent
provider/rules readback passes completed at `2026-10-18T12:03:28.390Z`.
Hosting, Firestore and other Workers were excluded from this release.

Only the existing assignment and submission events were replayed using actual
Firebase-issued teacher/student tokens. The assignment notice returned
`created`; submission verification returned `replayed`, repairing its exact
schema-3 authority without duplicating the teacher notice. No extra assignment
or attempt was created and no receipt was manually granted. A first sign-in
403 occurred before event delivery; the successful backend retry used the
existing restricted server key without changing any key or restriction.

The live teacher entered through `/login`, opened the same Homework detail and
clicked View Result: the full modal displayed 100%, 1/1 points, scaled 10.0,
27 seconds and one correct answer. The live student then entered `/login`
and used Student quick login: the dashboard feed displayed the new
“New THCS homework” notice and the existing “Test Complete” notice. Both prior
blockers are closed for this approved QA case. Screenshots and data/provider
receipts are indexed in the release record. This does not backfill historical
results or qualify unrelated materials and PDF Book workflows.
