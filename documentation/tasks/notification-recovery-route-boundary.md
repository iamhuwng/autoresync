# Notification route boundary audit

Source inspected on 2026-09-26. No additional families were activated. The agreed common trusted notification writer is separate from product mutation ownership. The recorded narrow product-action exception is class membership, whose rejection deletes prior proof. Existing inbox rule denial does not authorize moving other product actions. The [rotation handoff](notification-recovery-rotation-handoff-2026-09-26.md) is the current execution checkpoint; this audit remains the action-owner decision input.

## Planner decisions and current work (2026-09-27)

- Ordinary wake consolidation is implemented in the current working diff: all 18 wakes in 12 caller paths use `notificationProducerClient.ts`. The two obsolete transports are removed; the session module retains event/queue construction only. Source saves, endpoint bodies/keys, acknowledgements, backend resolvers, and attempt budgets retain their existing contract.
- Feedback and review app ownership is approved for coordinated implementation with canonical two-step visibility, immutable occurrence/text binding, replay/concurrent-transition protection, and preserved unrelated fields. Both feedback retry kinds must use committed history, including after newer edits/deletes. Permission implementation is held for the source-proof issue below; current Worker mutations remain in source.
- Manual grade app ownership is approved as direction, with implementation held for the minimal canonical-save proposal below. Announcement app save/content ownership is decided, but its exact protected capture/save sequence remains under review. Book/class exceptions remain as recorded.
- Affected contract/lifecycle/component checks passed 38 tests across six files using canonical dependencies and environment. The practice expiry case was rerun under React StrictMode after browser QA exposed repeated expiry submission; it proves one save and one post-save announcement. The timer updater is now pure and a synchronous submission guard prevents duplicate saves.
- The initial isolated dependency-resolution failure was recovered using canonical Vite optimization/dedupe with candidate source mappings, without installation or junctions. Teacher `localhost:5173` committed reminder `f87c9f29-935d-4de4-b798-c55dee700daf` for disposable `packet9-live-20260610151227-hw-launch`; one POST to `/deadline-notifications/actions` returned 200. The saved count became one and the shared success announcement rendered. Student `localhost:5174` received the new inbox card, opened the matching homework detail, and its unread count fell from 11 to 10. Later-family delivery remains unverified and disabled. No deployment/activation/backfill or admin blank-page probe occurred.

### Held minimal proposals

**Scoped planner prerequisite (2026-09-27):** first reuse protected occurrence evidence; where rules cannot verify it, a minimal create-only trusted record per result is authorized in principle. Before implementation, submit a context table identifying exact authoritative result/student/source/occurrence paths and their writers, captured facts, and app atomic-save predicates. The Writing homework projection/access proves assignment eligibility only, not a committed result occurrence. Unsigned existing/deleted-source snapshots remain unproven. Close root/parent/leaf and browser super-admin bypasses, and obtain focused positive/adversarial emulator proof before granting app permissions. This authority batch stays separate from ordinary transport.

**Feedback/review authority:** `test_results/$resultId` currently permits authenticated creation and broad rewrites; `$resultField` permits authenticated changes to student/teacher/context/visibility (`database.rules.json:222,224`). Visibility repair writes an unsigned app snapshot (`testResults.service.ts:662`). Teachers may write their own `student_teacher_links` row (`database.rules.json:189`). Consequently neither an arbitrary saved visibility snapshot nor that outer link alone proves teacher-owned work. Freezing a snapshot after the first feedback would not prevent pre-save forgery. A narrow source-specific proof or protected capture is required before granting app feedback/review permissions; exact scope is escalated to the planner. This is a concrete authority gap, not permission to redesign result ownership.

**Announcement:** reuse the existing signed creation record and roster filtering in a protected capture keyed by the action ID. Trusted capture CAS selects one immutable actor/course/classes/content/time/recipient winner; matching replay returns it and conflicting command reuse fails. App create-only saves the full announcement and embedded initial intent matching that capture, then wakes delivery by saved identity. Existing source schema/recipient array and progressed-intent replay remain intact. Capture/read-time timing stays separate from the roster query, matching current semantics; there is no roster transaction or delayed recapture. Orphan capture creates no notice because delivery scans saved announcements. No roster-history subsystem. Exact node/rule sequence still needs planner review.

**Manual grade:** reuse the canonical result writer, index builder and THCS aggregation formulas. Persist the exact submitted `resultId`/test/student/session link in the existing session grading projection; refuse missing/ambiguous linkage. One coordinated grade update must save canonical question/THCS totals/status, projection, indexes, re-mark history and immutable intent. Existing inline/batch/AI writers need a rule-enforced expected revision; AI must also refuse a teacher-graded target. Academic progress must upsert once per result ID. Current session ancestor permission is the enforcement boundary. This proposed sequence needs review; it does not authorize a grading-model redesign.

## Current ownership recommendation (2026-09-27)

Historical read-only source recommendation at `787501e9`, submitted in `8cc68690`. The decisions above supersede its pending-review status. The source evidence below remains the review input, not current implementation or live proof.

| Unapproved migration | Recommended product owner | Decisive evidence and remaining condition |
|---|---|---|
| Question/overall feedback | App atomic feedback/history/initial-intent save; Worker delivery | `feedback-notification-action-store.ts:112-136` expresses one multipath save. Saved result supplies student/question identity (`feedback-notification-action.ts:130-140`). Replace introduced action-token permissions with narrowly authorized, source-bound rules; preserve canonical question mirrors and unrelated result fields. |
| Result marked reviewed | App atomic review/initial-intent save; Worker delivery | `result-review-action-store.ts:103-109` patches review fields and intent. Enforce one pending-to-reviewed transition, canonical ownership, saved student/reviewer/time, and replay protection. Follow the [visibility policy](../architecture/result-view/visibility-policy.md), not raw teacher IDs alone. |
| Manual THCS question grade | App coordinated grade/initial-intent save; Worker delivery | `grade-notification-action-store.ts:69-79` admin-PATCHes a whole question snapshot plus intent without question revision CAS. Teacher-selected points need no trusted scoring computation. Resolve score/status/history linkage and AI/manual concurrency before changing ownership. |
| Course announcement | App ownership remains the target; snapshot contract OPEN | Worker reads enrollments (`course-announcement-action.ts:407`), then CAS-creates only the announcement (`course-announcement-action-store.ts:110`). No roster-revision CAS or deleted recipient proof. Current rules do not demonstrate app-only complete recipient capture. Decide the trusted immutable snapshot contract first; a narrow snapshot capture/seal may be necessary without relocating the product write. |

Worker-only intent permissions introduced by the implementation are not necessity proof. Keep inbox creation, delivery-state mutation, retry claims, suppression, and reporting trusted. Preserve established Book ownership and the approved narrow class exception.

### Conditions for a coordinated owner change

- Feedback: bind create-only history/event, actor/student/time/text, and stored question identity at commit. Current replay compares identity/kind/question, not text (`feedback-notification-action.ts:119-126`). Question retry requires the current feedback event while overall retry uses history (`feedback-notification-retry.ts:32-41`); resolve this asymmetry deliberately. Existing browser delete helpers conflict with parent permissions (`feedbackService.ts:449,469`); preserve occurrence history when resolving deletes.
- Review: preserve saved student/reviewer/time/owner verification (`result-review-retry.ts:23`), concurrent transition protection, and unrelated score/feedback/history fields.
- Manual grade: [PRD grading flow](0028-prd-thcs-thpt-test-system-phase2.md#453-grading-submission-flow) also requires grading status and scaled-score recalculation. Current Worker commit performs neither and does not update canonical result aggregates/history. Coordinate batch/AI writers (`BatchGradingPanel.tsx:79`, `thcsWritingGrading.service.ts:301`) with teacher precedence/revision protection. Ancestor `game_sessions/$sessionCode` grants owner writes (`database.rules.json:1362`); child write denials alone cannot protect grade evidence or immutable answer/max-score/test identity.
- Announcement: accepting arbitrary browser recipients loses completeness/authenticity; recomputing recipients during delayed delivery loses the original snapshot. Bind immutable text/time and the complete filtered active-enrollment set, preserve that set after roster changes, and enforce exact replay identity. Current HMAC and source permissions do not justify the entire Worker mutation.

### Ordinary caller and event reconciliation

The [inventory](PRD0062/evidence/notification-producer-inventory.md) contains **17 unique app producer paths**: **10 shared wake calls in six paths**, plus **eight ordinary specialized wake calls in six paths**. `homeworkManager.ts` is an additional intent producer, not a wake caller. `testResults.service.ts` is counted once despite its shared completion and unapproved review callers.

| Remaining ordinary wake | Atomic source/intent evidence | Wake callsites | Matrix rows |
|---|---|---|---|
| Manual reminder | Firestore batch, `homeworkManager.ts:507-531` | `TeacherHomeworkDetailPage.tsx:865,906` | 17 |
| Session opened/start/end | RTDB root updates, `sessionManager.js:250`, `useMonitorControls.ts:378,838` | `sessionManager.js:270`, `useMonitorControls.ts:380,892` | 33-35 |
| THCS assigned/fully graded | Assignment intent, `homeworkManager.ts:195`; result intent/save, `testResults.service.ts:865,921` | `THCSHomeworkAssignDialog.tsx:288`, `THCSPracticeView.tsx:672`, `THCSTestLayout.tsx:616` | 29-31 |

Consolidate these identity-only wake mappings in existing `notificationProducerClient.ts`, retaining specialized server resolvers. Use saved reminder/session event IDs and THCS authority record IDs. Preserve route bodies, keys, response checks, nonblocking caller behavior, and attempt budgets. Session event/queue construction stays with its source writer. No new endpoint or product-owner migration is needed for this transport consolidation.

The scan included JS/JSX/TS/TSX: active legacy-adapter imports are inbox reader/read-flag consumers only. `deadlineReminderService.ts` and `enrollmentManager.ts:sendExpirationWarning` are absent; historical matrix rows 10/15/16 are removed, unimplemented variants, not current dormant producers. THCS rows 30/31 converge on one canonical occurrence/notice. Book already uses the shared emitter/repository (`book-emitter.ts:348`); separate live proof remains required, without another client HTTP hop.

Deployment/migration, later-family activation, and historical backfill remain held. Visible admin verification remains an OPEN browser gate. This review supplies source evidence only.

Verification: existing `notificationProducerInventory.test.ts` passed 3/3 on 2026-09-27 using canonical dependencies against this worktree. No runtime, permission, or browser check was rerun for this documentation-only audit; those gates remain separate.

## Earlier ordinary-action audit (2026-09-26)

| Family | Product action owner in current source | Notification delivery owner |
|---|---|---|
| Homework submit/reset/manual reminder | Browser Firestore transaction or batch in `homeworkSubmissionService.ts` / `homeworkManager.ts`, including saved notification intent | Notification Worker; submit/reset use `dispatchCommittedNotification`, reminder uses `wakeManualHomeworkReminder` |
| Assignment approval | Browser RTDB multi-path update in `assignmentManager.ts` | Notification Worker through shared committed-event client |
| Course request/type decision | Browser RTDB update in `courseRequestManager.ts` / `courseManager.ts` | Notification Worker through shared committed-event client |
| Test completion and writing submit/grade | Browser source services commit result/submission and intent | Notification Worker through shared committed-event client |
| Session lifecycle and THCS practice/homework | Existing browser source mutation; session commits event/intent in the same RTDB update | Specialized Worker dispatch resolves the saved event |
| Book assignment/update | Existing Book Worker saga/authority surfaces | Book emitter and the same `FirebaseRestNotificationCommandRepository` inbox |

`src/services/notificationProducerClient.ts` sends saved homework, assignment/course-decision, test, and writing identities to Cloudflare. Manual reminders, session transitions, and THCS events still use specialized wake clients; their consolidation into the common producer remains open. These delivery calls preserve ordinary product mutations while replacing the previous browser inbox-delivery route, as discussed and recorded in the [plan](notification-system-recovery-plan.md#routing-decision-from-the-actual-discussion). `notificationService.ts:createNotification` still contains the old direct RTDB write; current rules deny new inbox content and allow only the recipient's false-to-true read flag.

## Worker-owned product-action exceptions introduced in notification source

| Action | Current Worker mutation | Specific reason encoded by current implementation |
|---|---|---|
| Class join/add/approve/reject | `class-action.ts` + `class-action-store.ts`: roster/projection, event, intent | Approved narrow exception: rejection deletes roster proof; atomic event/intent captures it before deletion |
| Course announcement | `course-announcement-action.ts`: announcement plus recipient snapshot/intent | Saves the broadcast source and bounded delivery authority together |
| Feedback save | `feedback-notification-action.ts`: feedback plus intent | Saves the feedback transition and its retry authority together |
| Result reviewed | `result-review-action.ts`: review flag plus intent | Saves review transition and its retry authority together |
| Manual THCS question grade | `grade-notification-action-store.ts`: question result plus intent | Saves manual grade and its retry authority in one RTDB patch |

The four non-class rows are current product-action migrations, not notification wake calls. Their implementation couples mutation with intent creation, but this does not establish an independent requirement or recorded approval to relocate those actions. The manual reminder, assignment approval, course decisions, and session lifecycle already demonstrate browser-owned atomic source/intent writes. Book's existing Worker authority is a separate established product boundary.

## Existing path that can be retained

The ordinary producer interface and browser-owned product action can stay, with a shared API wake call to the trusted notification writer. The common inbox (`notifications/<recipient>/<id>`), browser subscription, destination resolver, and read flag already stay. Durable intent, one retry, terminal admin issue, and family suppression belong to the common delivery path.

The old direct inbox adapter cannot safely be reopened unchanged: it chooses a random push ID and accepts caller-authored recipient/content; it has no durable one-retry or family-suppression state. A narrowly authorized direct initial write would require event-specific source-bound rules, deterministic IDs, immutable recipient/content, and the same trusted retry/reporting gate. No such rule surface currently exists, and the approved shared trusted-writer plan does not require introducing it. Current family gate state is browser-denied; a browser failure cannot reset suppression or claim another attempt. No rules or product routes were changed by this audit.

First-batch live config remains `class-homework`; its entry point rejects later action routes with `notification_action_batch_inactive`. Normal retry-delivery CPU and broader rollout remain open gates.
