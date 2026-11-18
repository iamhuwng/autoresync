# Teacher homework submission notification investigation

Date: 2026-11-19

## Decision in one paragraph

The teacher notification is ambiguous because the browser still uses the legacy `/events` homework path. That path intentionally emits one fixed message, `A student submitted homework for review.` The newer command-worker source already has a personalized template, but the homework committed-event port does not call that route. Fix the existing `/events` content contract in place, using canonical verified result fields for the student display name and homework title. Keep the current notification panel, link, recipient model, idempotency, and bounded loading behavior. Do not migrate endpoints as part of this copy fix.

## Evidence

| Layer | Current behavior | Evidence |
| --- | --- | --- |
| Submission producers | Writing, Listening, and the shared homework submission seam call `notifyCommittedEvent({ eventKind: 'homework-submitted', submissionId })`. | `src/components/writing-practice/WritingPracticeView.tsx:707`, `src/features/assessment/listening/runtime/listeningSubmissionClient.ts:71`, `src/services/homeworkSubmissionService.ts:519` |
| Shared dispatch | Homework events route to `notifyHomeworkEvent`, then `notifyHomeworkCommitted`. | `src/services/notificationProducerClient.ts:443-548` |
| Browser transport | The homework adapter posts a small `{ kind, eventId }` body to `/events`. | `src/services/homeworkNotificationClient.ts:13-78` |
| Active `/events` implementation | The bridge calls `deliverHomeworkNotice`, which resolves the assignment, student, result, owner, target membership, and result context before writing one teacher inbox row. | `cloudflare/notification-firestore-bridge.ts:159-202`, `cloudflare/homework-notification.ts:13-137` |
| Current template | The `/events` template uses title `Homework submitted` and message `A student submitted homework for review.` | `cloudflare/homework-notification.ts:141-146` |
| Newer but not used by this path | The newer command-worker source has `Homework Submitted` and `${studentName} submitted "${sourceTitle}".` The browser's homework `/events` path does not call it. | `cloudflare/src/upload-worker/notifications/homework-submission-worker.ts:243-276` |
| Deployed source | Read-only Cloudflare API inspection found Worker `luyentap-notification-command` at 100% on version `7f4edb63-4727-4d0c-9e46-ade6dd51a602`, deployed 2026-11-04. The downloaded active module contains both the old `/events` message and the newer command-route variants. | Cloudflare Workers API readback during this investigation |
| Teacher UI | Notification text is rendered as stored text. Clicking the row resolves the existing destination and marks it read. No student or assignment lookup happens in the panel. | `src/components/notifications/NotificationPanel.tsx:56-146`, `src/components/notifications/NotificationBell.tsx:86-127` |

The same deployed module contains multiple homework message variants. This is source and route drift, not an isolated wording typo. The user-visible string in the report matches the legacy `/events` branch.

## What the upgrade got right

- The product save completes independently of notification delivery.
- The browser sends only an event identity. It does not choose the recipient, title, message, or link.
- The bridge authenticates the bearer token, restricts origins, limits request size, rate-limits calls, and checks a committed Firestore proof.
- The server verifies the submission status, student actor, assignment owner, target membership, student role, result identity, homework context, material identity, and submission time before delivery.
- The inbox write uses a conditional create and preserves an existing `read` state during replay.
- The teacher bell subscribes to the latest 10 rows plus one look-ahead row. History loads 20 rows per page. The copy change does not require a new client read or listener.

These properties should remain unchanged.

## Why the current copy fails the teacher task

The notification only answers that some submission happened. It does not identify the student, the assignment, or the material. A teacher with multiple active assignments must open the notification and scan the detail page to determine which student needs review. The feed is therefore poor at triage even though the destination is correct.

The wording also hides the distinction between a submitted attempt and a graded result. The notification should state the committed event without score, answer, or grading claims.

## Recommended content contract

Use one server-owned template for every ordinary homework-submitted notice.

- Title: `Homework submitted`
- Message: `{studentName} submitted "{homeworkTitle}".`
- Link: the existing teacher homework detail route for the verified `homeworkId`
- Stored fields: the existing `id`, `type`, `title`, `message`, `createdAt`, `link`, `read`
- Excluded fields: student ID, result ID, score, answer text, essay text, and a new metadata object

Field resolution should use already-authoritative data in the existing verification path.

1. Student name comes from the verified canonical result snapshot.
2. Homework title comes from the verified canonical result title, then its verified source-name snapshot when present.
3. Missing or unusable display text falls back to `A student` and `Homework`.
4. Trim control characters and bound each display value before interpolation. Keep the complete notice below the existing 1 KB limit.

The result snapshot is preferable to a live profile lookup. It keeps the notice truthful to the submitted attempt, avoids another database read, and prevents a later profile rename from changing historical notification content.

## Security assessment

Personalized text is safe only if the server derives it after the existing authority checks. The client must not send a name, title, recipient, or link. The worker must continue to reject a forged actor, recipient, submission, assignment, or result context.

The added tests should prove all of the following.

- A correct student produces one notice for the canonical assigning teacher.
- A different recipient is rejected.
- A forged name or title in the command is rejected or ignored because content is server-owned.
- Missing name or title uses the bounded generic fallback.
- Replaying after the teacher marks the notice read returns the same notice and keeps `read: true`.
- The notice never contains result IDs, answers, scores, or unbounded user text.
- Existing recipient-only read and read-state rules still pass.

This is a privacy boundary as well as an integrity boundary. Do not read a separate user profile or accept a student-supplied teacher relationship just to improve copy.

## Efficiency assessment

The notification panel already has the right loading shape for this change. It receives the enriched text from the inbox row and performs no follow-up lookup. The existing worker already reads the result and assignment authority. Add the display fields to those existing bounded reads or use the existing result projection. Do not add a notification-specific collection, a client-side join, a profile fetch, a second listener, polling, or a queue.

The current `/events` flow still performs several authority reads because it crosses Firestore and RTDB. That cost buys a secure cross-store proof and should not be increased for presentation data. The implementation adds zero client requests. It reads three bounded display fields in the existing parallel result-read batch, with no new sequential round trip, collection, client-side join, profile fetch, listener, polling, or queue.

## Recommended implementation plan

### Phase 1 — Lock the contract

1. Add a small pure formatter in the existing homework notification module.
2. Define the exact title, message, fallback, length, and control-character rules.
3. Keep the current route, notification ID, link, recipient selection, and read replay semantics.

### Phase 2 — Update the active `/events` path

1. Read canonical `studentName` and homework title fields already available from the verified result/source.
2. Build the message only after actor, owner, assignment target, result identity, and submission proof pass.
3. Keep the notification payload minimal and below 1 KB.
4. Add release tests for the public `/events` path, not only the newer command route. Assert exact personalized content, fallback content, forged-content rejection, recipient denial, and read-preserving replay.

### Phase 3 — Release and browser verification

1. Run the focused Cloudflare notification tests with the repository-owned dependency tree. The current checkout has no dependency trees, so this evidence is pending tooling recovery.
2. Build and inspect the exact retained notification release module. Confirm the old generic template is absent from the `/events` branch.
3. Deploy through the existing release-safety gate and read back the active Worker version, module hash, bindings, and 100% traffic state.
4. Verify the real teacher flow through `http://localhost:5173/login` with the dev Teacher quick-login path. Submit one disposable assignment through the student flow at `http://localhost:5174/login` and verify the teacher row, exact message, destination, and `read: true` after reload.

### Phase 4 — Consolidate route drift

After the content fix is live and verified, choose one canonical homework notification formatter and make both reachable Worker branches use it. Remove the obsolete duplicate template and its unsupported tests only when no route or release artifact depends on it. Do not combine this cleanup with the first copy fix if it would enlarge the release or obscure the security proof.

## Acceptance criteria

- A teacher sees `Student One submitted "Class Writing Homework".` for a matching canonical submission.
- The notification opens the same teacher homework detail route as today.
- No extra browser request is made when rendering the notice.
- A missing display field produces a readable bounded fallback.
- Forged content and unauthorized recipients are rejected.
- Replay does not reset the teacher's read state.
- The deployed `/events` path, checked-in release module, tests, and browser behavior all agree on the same template.

## Verification limits for this investigation

The isolated worktree is attached at `C:\Users\Sanctuary\.codex\worktrees\teacher-notification-investigation\hocthem`. The canonical checkout's tooling doctor reports the root and Cloudflare dependency trees missing, and neither mandated local teacher server (`localhost:5173`) nor student server (`localhost:5174`) is running. I therefore did not claim Vitest or browser proof. A dependency-free Node runtime check and retained-bundle syntax check passed. The deployed Worker version and source text were verified read-only through the Cloudflare API, and the checked-in source and release artifacts were inspected directly.
