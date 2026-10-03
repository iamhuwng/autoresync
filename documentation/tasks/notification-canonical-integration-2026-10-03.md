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

## Authorized local runtime continuation — 2026-10-03

This continuation supersedes the configuration/login blockers above. Vite selects the shared `C:/Users/The Lord/.luyentap/env` directory when present; the canonical env file alone was ineffective. The four local Homework notification, Writing notification, Homework result authority and Course approval settings now use the qualified public QA Worker origin. The Course setting includes `/course-enrollment-approval`. These ignored local settings were updated without credential, restriction or deployment changes. Final qualified app chunks establish the public caller; the secret-bearing command host is not the browser event endpoint. Public `/events` rejected an unauthenticated probe with 401. A fresh public deployment readback reported version `5696e963-c5ed-463d-a495-30db3c07bc98` at 100%; no new deployment occurred.

Real teacher/student verification used `http://localhost:5173` and `http://localhost:5174` with dev login:

- Public THCS Homework reset and submission each reached `/events` with 200. Student reset notice opened the exact assignment; read count persisted after reload. Teacher submission notice opened that assignment; the submitted row showed 100%, and notice read styling persisted after reload. Reset removed the named Firestore attempt but private canonical-result cleanup was denied; this is partial cleanup, not proof of result deletion.
- A disposable Course request was approved through public `/course-enrollment-approval` with 200. Student pending count cleared, active enrollment survived reload, and the approval notice opened Courses.
- Solo Writing saved and reopened its exact pending-review essay. A class without a Course exposed a comparison between RTDB's omitted null `courseId` and the resolver's null value; normalizing the optional canonical value fixes the sharing gate. A new real submission produced both the student notice and a fresh teacher notice at 12:41:23 local time. The teacher notice opened Student History, which included the new Writing result. No grading action was performed.
- Fresh Writing Homework exposed a separate legacy materialization denial. Student-authored Homework now reuses insert-only source/root/student-index recovery, retains one pending result identity across uncertainty/reload, preserves existing grades and visibility, and rejects conflicting completed attempts. It creates no teacher/class/course/solo discovery fanout. A separate disposable assignment completed through the corrected browser flow; teacher detail showed one submitted student and 100% completion, a new teacher Homework notice appeared at 12:50:44, and the exact student result reopened with the eight-word essay after reload. The earlier failed attempt remains unchanged because its old client never stored the generated identity in recovery metadata.

The Homework Writing student self-notice gap was subsequently corrected through the existing `result-completed` committed-event port after source/result/finalization proof. Its retired command caller was removed. Fresh live RTDB readback confirms the notification write rule matches canonical source and includes this student-owned completion branch. A second distinct attempt saved result `-P3-N43_RYJ4gU-hSfIL`; the new Test Complete notice opened its exact five-word Homework essay. After reload the notice remained read; keyed readback confirms matching result metadata and `read:true`. The second attempt also logged a pre-existing Homework aggregate-stats permission failure, while its durable submission status and notification were verified. That adjacent aggregate issue is not silently reported as fixed.

Affected source/ownership/UI checks: 53 passed across three suites (21 service, 19 ownership and 13 UI), plus 17 shared committed-event checks. Final UI/committed-event run passed 30 checks. The app build and bundle-budget check passed; subsequent detached Homework-notice replay, student completion port and recovery-load fail-closed changes passed affected checks. Recovery-load errors cannot enable a replacement attempt. Scoped independent source review found no actionable findings before those final refinements. Existing unrelated Book/grading/session working changes are outside this continuation.

Remaining notification runtime gap: fresh manual Homework reminder creation failed with Firestore permission denial before event delivery. A temporary exact-batch emulator diagnostic could not start: both installed native and x64 Java runtimes failed in Netty/PipeImpl Unix-domain loopback setup before any assertions. This is a verification-environment failure, not proof of the failing Rules predicate; empty overrides and client clock skew remain unproven hypotheses. No Rules change or deployment is selected from that generic error. No overall local runtime closure is claimed while the reminder gap remains. Screenshot and isolated emulator diagnostic receipts are local artifacts under `C:/tmp/notification-runtime-20261003`.

### Shared-path mutation inventory and runtime lease

Task source mutations are limited to `src/services/writingSubmissionService.ts` (student source verification/materialization, optional Course comparison), its existing test, `src/components/writing-practice/WritingPracticeView.tsx` (pending load, submit/finalization and committed notices), and its existing test. Document mutations are this runtime continuation plus the dated continuation paragraph in the plan, technical reference and family table. No Book adapter, Rules, checked-in configuration, grading/session implementation or deployment artifact was changed.

Ignored canonical and shared `.env.local` changes are limited to `VITE_HOMEWORK_NOTIFICATION_URL`, `VITE_WRITING_NOTIFICATION_URL`, `VITE_HOMEWORK_RESULT_AUTHORITY_URL` (all `https://luyentap-notification-firestore-qa.iamhuwng.workers.dev`) and `VITE_COURSE_ENROLLMENT_APPROVAL_URL` (same origin plus `/course-enrollment-approval`). The shared env directory is effective. Current Vite processes are teacher PID27920 on localhost5173 and student PID7732 on localhost5174, each launched from this checkout with its separate existing `.vite-5173`/`.vite-5174` cache. Concurrent report/index.css changes caused browser reloads during QA; fresh dev login restored both roles without credential changes. The finite role-browser checkpoint is finished and its runtime lease released; servers remain available, with no monitoring implied.
