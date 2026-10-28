# Listening functional release and acceptance follow-up

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

## Initial release gates (historical preparation)

The implementation is not yet a deployed completion claim. Final clean-source
build, CI, exact artifact qualification, native provider checks, ordered
deployment and live workflow acceptance remain required. Deploy Upload first,
reconcile student-safe runtime projections, deploy RTDB and Firestore rules,
then Hosting through the functional profile's postrules gate. Confirm no active
Listening run before the rules cutover. Keep existing immutable versions and
audio; a Hosting-only rollback cannot restore old client submission after the
new rules are active.

## Initial release deployed on October 28

PR #183 merged as `bb4a74349482a874dae0cadc1a935ca93fcab785` with eight CI
checks passing. PR #184 supplied the qualification tooling. Native predeploy,
postupload and postrules receipts passed. Upload Worker version
`4c8ade84-46a5-4b6b-98f3-42539972aab9` deployed before safe runtime projection
reconciliation, RTDB/Firestore rules and guarded Hosting. Hosting version
`43db33dc8cf7b167` serves that source; all 459 manifest files were hash-verified
and `hocthem.net` matches `kahut1.web.app`.

Private homework start exposed missing Firestore IAM access. The dedicated
`r2-upload-signer-prd0056a@temp-a1437.iam.gserviceaccount.com` account received
`roles/datastore.user` conditioned on the default database's resource name.
Native policy readback confirmed all prior bindings unchanged. Start passed
after propagation; no key, binding or Worker bytes changed.

Live acceptance passed Cambridge question loading and playback/seeking through
all four restored recordings. Private native form editing, publication,
assignment and trusted submission passed. Homework
`homework-5c0f66e6-d13c-49fc-9068-4d0aac01b356` kept its started version
`version-e514e1698bd95afa4340ae40f6b7984e` after publication of
`version-01406cf087f97452888f5345a854aac8`: BROWN remained the correct saved
answer despite the later key GREEN. Result
`listening_result_eef677fe81063d354380deb654351f523b6fbeddd831960b3c83a90cb3846f9b`
shows 2/2 and 100% in Academic Record. Resumed playback uses the new four-second
recording. The teacher received the submission notification; its link opened
the correct Homework Detail with 100% completion.

Five earlier superseded recordings were mapped to checksum-verified replacements
before their ten durable/temporary keys were confirmed absent. The later private
QA publication also replaced its twenty-second recording. Six text versions and
the earlier 2/2 result were preserved. Two synthetic QA versions never had a
committed asset record and were left untouched. Recovery snapshots, native
receipts and screenshots remain under `tmp/listening-live-release-20261027/`;
the earlier evidence ZIP remains in the canonical checkout's
`tmp/listening-release-archive-20261027/`.

## Result-permission follow-up in preparation

Acceptance exposed blocked private recording-status reads and generated-feedback
saves. A focused emulator probe showed that whole-object `.val()` equality
rejects unchanged grading objects when unrelated metadata changes. The correction
protects Listening results at their parent and field write boundaries, retaining
the existing legacy validation and canonical teacher-feedback protocol. Browser
score, answer, version and whole-result replacement attacks remain denied.
Students may save their own generated feedback/status; existing homework grants
expose only the recording timestamp, while private questions remain denied.

All 13 Listening security cases pass, including student/teacher/admin attacks.
The 36 player/result cases pass. Adjacent THCS rules pass; two old generic live
session fixtures fail identically against the unchanged main rules because they
create Listening sessions without the protected pin. They are not failures
introduced by this correction. No PDF/Book implementation changes.

CI's exact-rules THCS fixture was repinned to the reviewed parent write rule;
all eight notification/THCS emulator cases then executed and passed locally.

The shortened recording note uses the existing player controls. This follow-up
still requires final CI, native qualification, rules/Hosting deployment and
live feedback/status acceptance; it is not a completion claim.

## Private storage follow-up in preparation

PR #185 merged as `29a264a08647ba512d3434afdfa93dd6f75d6eb7` after all eight
CI checks passed. Its result permission and recording-note corrections are not
deployed yet. A native anonymous range request then exposed a separate storage
bypass: the private QA recording's shared raw R2 URL returned 206 without
authentication. Signed Worker delivery cannot protect a separate public URL.

The repair isolates Listening in `luyentap-listening-audio-private`, with public
domain access disabled and no custom domain. A single Worker composition change
selects its required binding for Listening routes and asset-grant upload;
ordinary shared image uploads and Book routing retain their original binding.
The regression reproduced four failures before the repair. All 162 Listening
Worker cases pass after fixing the focused runner's missing R2 test binding.
The lifecycle preserves default multipart cleanup and expires only Listening
temporary uploads after one day. The added lifecycle assertion and shared upload
regressions are separate final checks.

The native source inventory contains 22 durable objects / 18,852,600 bytes and
no Listening temporary objects. Copy and checksum verification precede Worker
cutover; public copies must remain until the private path is verified. Recheck
the inventory at cutover to prevent a concurrent upload/publication race.
Deployment order is private bucket readiness, qualified Upload Worker, removal
of verified public Listening copies, RTDB rules, then guarded Hosting. Firestore
rules are already current and must remain unchanged. The fixed release profile
must bind the new private bucket configuration and old/new Worker bindings.

Final native qualification, CI and live feedback/playback/privacy acceptance
remain release gates. A Worker-only rollback after public-copy removal is unsafe;
keep the private binding and verified objects available for recovery. Native
copy/readback receipts remain under `tmp/listening-live-release-20261027/`.
