# #126 current production browser proof — 2026-08-24

Status: `CURRENT_CANDIDATE_VERIFIED_REMOTE_BROWSER_PASS`.

This is an append-only current proof record. The earlier `BLOCKED_ROLLED_BACK`
records remain historical and are not rewritten. The production candidate was
verified after the native PDF.js path and the Worker OAuth/RTDB read correction
were deployed.

## Candidate identity

- Branch: `codex/prd0062-continuation-after-cleanup`.
- Source tree at proof time: `bec7f897c7a17c9b04eade111a0044de7305034d` plus the dirty-tree source corrections recorded in the JSON companion.
- Worker: `r2-upload-signer`, version `db9a6657-bcdc-439c-aeae-b0b5793f142c` / version number `146`, deployment `4028c190-34eb-494a-bd3f-cf32def32471`, 100% traffic.
- Worker message: `prd0062-126-oauth-rtdb-read-fix-20260824`.
- Hosting: Firebase project `temp-a1437`, site `kahut1`, live release read back at `2026-08-24 11:33:16`, entry `/assets/index-DOANuFLz.js`.
- Bounded scope: teacher `glMHCrzMnyS6AqFcb9I0nlOqQ6X2`, book `book-vocab-u1-d43935c735245dc8`, assignment `assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4`, student `x3hDfjYVN7cJtSbwq0ChIjl1Bk62`, maximum 30 students. Read gates only were enabled; mutation gates remained denied.

The safe rollback target was independently read back after the candidate run:
Worker version `511a9ca5-3245-4765-b032-46690e8cc20f` / number `142`, message
`prd0062-126-safe-deny-excerpt-authority-20260824`, with delivery, document,
Homework, runtime, source, assembly, and mutation gates disabled. The older
tracked v18 rollback JSON remains historical evidence; the direct version-142
target is the selected rollback identity for this current candidate.

## Source and direct Worker proof

The current source retains the accepted architecture: the browser passes the
authorized Worker URL and Firebase bearer through `httpHeaders` to native
PDF.js. The explicit `PDFDataRangeTransport` remains only for transports that
do not expose a native source.

The deployed document route was called with a fresh authenticated student ID
token and `Origin: https://kahut1.web.app`:

- `HEAD`: `200`, `Content-Type: application/pdf`, `Content-Length: 977013`, `Accept-Ranges: bytes`.
- `GET` with `Range: bytes=0-65535`: `206`, 65,536 bytes, `Content-Range: bytes 0-65535/977013`, `Content-Type: application/pdf`, `Accept-Ranges: bytes`.
- First returned-chunk SHA-256: `5694782d729bda145cf6097bf5391e741444dad8e32124f9e97e9cae1f180e95`.

The source-level correction behind the initial 503 is also recorded: the
document composition now forwards `FIREBASE_WEB_API_KEY`, and injected Google
OAuth RTDB reads use the bearer Authorization transport rather than the
Firebase ID-token `auth=` query mode. The focused Worker regression passed 3
files and 42 tests after that correction.

## Real in-app browser proof

The Codex in-app Browser ran the production consumer, not a local emulator or
mock route.

Teacher proof:

- Fresh `Teacher` quick-login reached `https://kahut1.web.app/lobby`.
- `Homework` reached `/teacher/homework` and showed `Vocabulary U1`.
- `View details` reached the assignment detail and rendered the assigned
  student row with the trusted `Book progress unavailable` state. No mutation
  control was exposed.

Student proof:

- Fresh `Student` quick-login opened the assignment detail and `Open Book
  Activities`.
- Runtime URL:
  `https://kahut1.web.app/student/practice/assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4?bookSurface=homework&homeworkId=assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4`.
- Runtime state showed one activity and `Reference-only`.
- PDF metadata showed `source-version-70f2ccf7d1a42d67` and `977,013 bytes`.
- The visible PDF rendered `Page 1 of 4 at Fit width`; clicking `Next page`
  changed the visible state to `Page 2 of 4 at Fit width`.
- The fresh student proof tab recorded zero console errors and zero warnings.

The visible PDF screenshot was captured in the Codex in-app Browser during the
run. No credentials, bearer tokens, or private object URLs were persisted.

Known unrelated browser noise is retained honestly: the teacher sign-out and
teacher navigation produced existing `ReportingService` RTDB
`permission_denied` warnings for a root telemetry update. They did not occur
in the fresh student proof tab and did not affect the document route.

## Safety and historical boundary

No assignment replay, projector write, Firebase durable mutation, R2 mutation,
Listening change, or main-worktree change occurred. The prior failed/rolled-back
proof files remain the historical record of the earlier browser-runtime and
configuration failures. This record establishes the missing current-candidate
production browser proof; it does not silently close #127–#136, which retain
their separate acceptance, review, measurement, pilot, and release gates.
