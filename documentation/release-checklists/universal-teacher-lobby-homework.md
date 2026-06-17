# Universal Teacher Lobby Homework Release Checklist

## Scope

Feature branch: `codex/universal-teacher-lobby-homework`

Worker route: `POST /api/homework/assignments`

Supported content kinds:

- `thcs_test`
- `reading_passage`
- `ielts_reading`
- `ielts_listening`
- `ielts_writing`

Out of scope for this release:

- Whole-book assignment
- Draft assignment
- Global migration away from direct Firestore homework writes
- Homework dashboard redesign
- New assignment datastore

## Production Deployment Assumptions

The frontend calls the Cloudflare Worker directly through:

```text
VITE_BACKUP_WORKER_URL=<Cloudflare Worker base URL>
POST /api/homework/assignments
```

No same-origin proxy for `/api/homework/assignments` is currently configured in this repo. Production frontend deployments must set `VITE_BACKUP_WORKER_URL`; the client intentionally fails fast in production when it is missing.

Worker CORS must allow the production frontend to call the route. Current Worker responses allow:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

The Worker deployment must include the Firebase and Google service-account bindings needed by the homework route:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_DB_URL`
- `GOOGLE_SA_KEY`

## Browser Smoke Test

Use teacher dev login and open:

```text
http://localhost:5173/lobby
```

### Teacher Lobby Assignment Access

Verify each supported published item has assignment access through the shared Teacher Lobby assignment pathway:

- THCS Test
- Reading Passage
- IELTS Reading
- IELTS Listening
- IELTS Writing

Expected result: each supported published item exposes assignment access in the existing row action style.

### Blocked Content

Verify these do not silently fail:

- Book
- Draft
- Unpublished item
- Incomplete item
- Deleted or archived item, if available

Expected result: each blocked item is hidden or disabled according to existing UI style, and resolver metadata carries a stable reason code.

### THCS Public Regression

Flow:

```text
Public THCS item -> Use as-is -> Assign as Homework
```

Expected result: the assignment flow opens, submits through the Worker, and carries normalized `_assignmentContentRef`.

### Standard Modal Regression

Verify assignment through `HomeworkCreateModal` for:

- IELTS Reading
- IELTS Listening
- IELTS Writing
- Reading Passage

Expected result: the modal opens with preselected content and submits through `createTeacherLobbyHomeworkAssignment`.

### Worker Rejection Visibility

Force or simulate one failed assignment, such as missing projection or unauthorized target.

Expected result: teacher sees the Worker error text or mapped reason, not only a generic failure.

## Student Launch Compatibility

After creating Worker-backed homework assignments, verify student launch still works for:

- THCS Test
- Reading Passage
- Reading V2 full test
- IELTS Reading
- IELTS Listening
- IELTS Writing

Expected result: student homework consumers can open and take each assignment using the compatibility fields preserved on `homework_assignments`.

For Reading V2 full-test homework, also verify the generated `readingV2AssignmentPayloadPath` exists and points to a frozen student-safe assignment payload.

## Deployment Checklist

- `VITE_BACKUP_WORKER_URL` is set in the production frontend environment.
- Worker route `/api/homework/assignments` is deployed.
- Worker has required Firebase and Google service-account env bindings.
- Worker CORS accepts the production frontend origin.
- Teacher can assign THCS, Reading Passage, IELTS Reading, IELTS Listening, and IELTS Writing from Teacher Lobby.
- Student can launch each assigned homework type.
- Firestore assignment document contains normalized `contentRef`.
- Existing compatibility fields are still present.
- Books and drafts remain nonassignable.
- Direct Firestore homework writes are not globally removed in this release.

## Future Backlog

- Audit remaining direct Firestore homework producers.
- Migrate all assignment producers to the Worker endpoint.
- Add deeper schema validation for legacy `student_safe_tests/{testId}` payloads.
- Add historical assignment backfill for `contentRef`, if needed.
- Add whole-book assignment only after a separate design document.
