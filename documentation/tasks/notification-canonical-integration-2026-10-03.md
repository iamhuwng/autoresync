# Notification canonical source integration — 2026-10-03

This local source integration brings the qualified ordinary notification workflows into the canonical checkout. The accompanying commit contains only this task's changes. The previously recorded release is historical evidence; this integration performs no push or deployment and does not claim authenticated local runtime parity.

## Scope and preservation

Integrated bounded inbox/history, ordinary Class/Course/Assignment notices, feedback/review, Homework submission/reset/reminder authority, student result recovery and solo Writing submission/recovery. Selected-teacher solo Writing uses the existing class authority resolver and creates missing teacher/history and class/course indexes; revoked or incompatible sharing remains held. Recovery never replaces an existing grade.

Teacher grading and teacher session producer migrations remain excluded. Existing trusted producer exports and Writing grading/session service functions are preserved. Released Rules protections required by ordinary result authority are included; unrelated Book changes remain outside the commit. Dirty shared files were reconstructed from HEAD plus the notification delta, with the existing working changes preserved separately.

## Verification

- Final canonical app build and bundle-budget check passed.
- Student/result focused run: 224 passed, two pre-existing Book happy-path fixture failures excluded. Their fixtures and Book source remain unchanged.
- Solo Writing and ownership checks: 49 passed.
- Inbox/history: 57 passed; ordinary workflows: 164 passed; adapter/feedback/reporting: 51 passed.
- Producer/inventory/security checks: 53 passed, including immutable solo Writing receipts and the private THCS Homework result against canonical Rules. The private test uses a Node-only test configuration; the initial DOM setup error was a harness failure.
- HEAD plus reconstructed task-source tests: Class Manager 36 and Teacher Homework Detail 12 passed. Code dependency review found no missing modules or named exports. All 123 selected RTDB clauses match the integration receipt; 99 unrelated canonical-only clauses preserve HEAD.

- Worker checks: 44 passed across seven suites; the final public-entry relocation passed its three affected tests. Wrangler dry-run passed with exactly two additional frozen release modules. Both modules match the qualified release bytes; configuration changes make paths portable. The local test runtime needs a June 24 compatibility override; the release configuration retains September 19.

Counts describe separate scoped runs and overlap; they are not a unique total. The 131-file task-only index passed UTF-8, private-key/JWT scanning and dependency review. Whitespace checks pass for edited source; the byte-identical frozen Worker module retains two pre-existing trailing-space lines so its qualified hash remains intact.

## Runtime limits

Authenticated local browser verification remains blocked. The prior login attempt stayed in Redirecting with a Firebase invalid-authentication warning. The shared key matched the configured Google Cloud browser key, project/database matched, and the key permits the localhost role ports; no key or restriction was changed. A fresh browser page attachment subsequently timed out.

The local `.env.local` lacks `VITE_HOMEWORK_NOTIFICATION_URL`, `VITE_WRITING_NOTIFICATION_URL` and `VITE_COURSE_ENROLLMENT_APPROVAL_URL`. Those paths remain configuration-gated locally. The build and historical deployed browser evidence do not prove these local flows. Configure the authorized endpoints and verify the real teacher/student workflows before claiming local runtime completion.

The [upgrade plan](notification-system-upgrade-plan.md), [technical reference](notification-firestore-architecture-decision-2026-09-27.md) and [family table](notification-upgrade-active-producers-2026-09-27.md) retain the earlier release's scope, finite historical disposition and limitations.
