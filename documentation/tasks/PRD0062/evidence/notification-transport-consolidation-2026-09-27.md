# Ordinary notification transport verification — 2026-09-27

Scope: ordinary app-owned saves and eight remaining specialized wake calls.
All 18 ordinary wakes in 12 caller paths now use the existing shared producer.
Endpoint contracts and source owners remain unchanged. Two obsolete transports
are deleted; the session module retains event/queue construction only.

## Source checks

- Six affected test files passed 38 tests with canonical dependencies and environment.
- Browser expiry inspection exposed duplicate submissions: the existing timer
  invoked submission inside a React state updater, which StrictMode may call
  twice. The updater is now pure; a synchronous guard permits one submission
  until save fails. The existing expiry test was strengthened with StrictMode
  and rerun: five practice tests passed, one save and one post-save announcement.
- The touched practice component uses native elements and the existing media
  query hook. Expiry and save failures use the shared announcement system.

## Live browser evidence

Candidate source was served by canonical Vite with candidate source/public
mappings and canonical optimized dependencies. Served main resolved candidate
App; optimized Zustand exported `create`. The initial isolated dependency
failure was a harness issue and recovered without installing dependencies or
creating a junction. Optimizer force was disabled after recovery.

- Teacher: `http://localhost:5173/teacher/homework/packet9-live-20260610151227-hw-launch`.
  The existing disposable fixture had one in-progress student and no reminder
  cooldown. One reminder action saved event
  `f87c9f29-935d-4de4-b798-c55dee700daf`. One POST to
  `/deadline-notifications/actions` carried only that event ID and returned
  HTTP 200 (OPTIONS preflight returned 204). The saved count became one and
  “Reminder queued for Student Test” rendered in the shared success announcement.
- Student: `http://localhost:5174/student`. The new Homework Reminder appeared;
  clicking its card opened the matching homework detail. Returning to the
  dashboard showed unread count 10, down from 11 after delivery.
- Practice: `http://localhost:5174/student/practice/thcs-test-1790443743056-kbttb9h`.
  Candidate native layout was inspected at desktop, 375×812 and 320×812.
  Document scroll width equalled client width at both mobile sizes (365/365
  and 310/310 with scrollbar). Title truncation, timer/submit controls,
  horizontally scrolling sections and question cards remained visible.
  Temporary viewport overrides were reset.

The first practice inspection resumed an already expired development homework
and automatically saved twice before the timer correction. This side effect
is recorded; no attempt to rewrite or delete those results was made. The
corrected expiry behavior is covered by the StrictMode test. Subsequent browser
inspection used a fresh solo practice view without submitting it.

Screenshots are local QA artifacts under
`output/notification-recovery-profile/transport-{reminder-teacher,reminder-student,reminder-destination,practice-desktop,practice-375,practice-320}.png`;
they are not staged release assets.

## Remaining gates

Session and THCS delivery families remain disabled and have no new live delivery
proof. Feedback/review permissions require the planner's supported-context
occurrence-proof table and adversarial rule checks. Announcement and grade
sequences remain held. No deployment, activation, migration, historical preview,
seed, backfill, or repeated admin blank-page probe occurred in this milestone.
