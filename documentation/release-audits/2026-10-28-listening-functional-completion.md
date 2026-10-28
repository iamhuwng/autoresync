# Listening functional completion — release in preparation

The candidate extends the released durable-audio design through native form
editing and trusted submission. It preserves image-mode replacement and the
existing teacher/student layout. PDF and Book work is excluded.

## Implementation and checks

Native shared form context now renders once, binds each numbered answer to its
question, and stays synchronized with question edits. Unsupported Reading-style
group structures remain explicitly blocked rather than silently converted.
Submission grades an authorized immutable version in the Upload Worker and
persists canonical results before publishing completion. Homework, public
practice, course material and live sessions use their existing authorization
and result readers. Live teacher submission uses saved participant answers.
Browser rules reserve Listening totals and completion for trusted writes while
preserving autosave, joining, time extensions and teacher reset. Trusted homework
start selects the latest text and keeps its attempt pin. Local solo/course resume
keeps a student-safe text snapshot; grading still uses canonical server keys.
Course playback and grading share enrollment/placement checks. Result playback
checks the viewer through Firebase rules instead of stale stored viewer arrays.

The owner's heavy-file policy is implemented separately from text history:
verified replacement mappings commit before exact superseded object deletion.
Old logical IDs and signed content links resolve the replacement. A small live
recording-status note covers open attempts and earlier results, including records
without audio-review metadata. On October 28 the owner explicitly chose
conservative lightweight text retention for this release; server-wide practice
tracking and automatic text-version pruning are deferred.

Focused evidence includes 125 Worker cases across submission, delivery,
replacement and publication; 64 resume/shared delivery cases; 72 launch,
result and player cases; and 11 Firebase emulator security cases. The last
notice-only correction passed its 36 affected result/player cases. Native
form/editor checks, the acceptance build, Worker dry-run and repository
guardrails passed during preparation; final artifact checks remain required.
Four existing Book test failures (two homework emulator cases and two progress
projection client cases) were reproduced against the unchanged base and remain
outside this scope. No Book implementation was changed.

## Cambridge replacement-audio recovery

On October 28 Bangkok time, live reads confirmed the owner's four replacement
recordings were committed in immutable version 2, while the public runtime,
student-safe document and nine material summaries still referenced version 1.
The four-section publication path unnecessarily finalized the assets twice,
using 55 RTDB requests. Removing the duplicate work reduces that fixture to 31
requests. The observed partial finalization is consistent with a Worker request
limit; the account plan and historical Worker error were not independently
available, so that provider attribution remains an inference.
The complete four-section replacement fixture, including cleanup, stays below
45 external requests. Cloudflare documents separate Free limits of 50 external
and 1,000 internal service subrequests in its
[February 2026 clarification](https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/).

The existing publication was recovered with conditional per-record writes to
the two runtime projections and nine matching summary rows. Every write checked
the unchanged source draft/version and target ETag. Only audio, version and
update timestamps changed; question keys and existing homework pins were kept.
The receipt confirms all 11 readbacks. Recovery artifacts are retained under
`tmp/listening-live-release-20261027/cambridge-audio-recovery-*`; these include
the full pre-write snapshot, reviewed plan and applied receipt. Snapshot SHA-256:
`432a0793b34688498e62fae533e98a75ed182332798e50d76913cd7e2678400e`.

## Outstanding release gates

The implementation is not yet a deployed completion claim. Final clean-source
build, CI, exact artifact qualification, native provider checks, ordered
deployment and live workflow acceptance remain required. Deploy Upload first,
reconcile student-safe runtime projections, deploy RTDB and Firestore rules,
then Hosting through the functional profile's postrules gate. Confirm no active
Listening run before the rules cutover. Keep existing immutable versions and
audio; a Hosting-only rollback cannot restore old client submission after the
new rules are active.
