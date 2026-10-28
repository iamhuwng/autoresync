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

## New-upload preview correction, October 29

The private-storage cutover and result permission correction are deployed on
Hosting source `529854b97343b51cfbdff98618411763d8b1a9a4`, provider version
`31c9eafc2a7ce9be`, Upload Worker `30503e0b-fedd-4e61-a7fc-0b2b3b548493`
and RTDB canonical hash `99b1f7ec32f8e94c0cf176e420aae8d2c1606056acc7404f69198baabbe7b520`.
Native readback verified all 459 Hosting files and the matching custom domain.
All 22 shared Listening objects were removed only after verified private copies
and Worker cutover; all 22 old raw URLs returned 404. Anonymous private-bucket,
unsigned content and unauthenticated issuer requests were denied.

The focused browser pass found one remaining teacher workflow failure: a fresh
private upload succeeded but its preview used the raw temporary R2 URL. The
committed-asset probe already returned an authorized owner preview; the pending
upload probe omitted it. The narrow repair reuses that same signer after the
existing owner/session checks, with a ten-minute expiry and the verified temp
key. The frontend already consumes this response. No editor UI or storage,
publication, grading, version or permission policy changes are required.

The extended existing Worker test checks preview GET and byte range, cross-owner
probe denial, tampering, expiry and absence of shared-bucket reads. The affected
upload/delivery suites pass 64/64. A Worker-only qualification/deployment and the
existing-account browser acceptance remain required before release closure.

## Release closure, October 29, 2026 (Asia/Bangkok)

The focused Listening acceptance passed after the fresh-upload preview repair.
PR #188 merged as `c77cdb7c229bead2ff0d027273586599c34cad45` with all six
applicable CI checks passing; PR #189 merged as
`564f33db266cd3d32a1526cce47eba61e9ce7fff` with all four checks passing. The
64 affected upload/delivery cases and 92 release-tool/adjacent cases pass. Independent
source review found no blocker. No additional Hosting build was needed for the
Worker-only preview correction.

Final deployed combination:

| Surface | Verified version |
| --- | --- |
| Hosting | `31c9eafc2a7ce9be`, source `529854b97343b51cfbdff98618411763d8b1a9a4` |
| Upload Worker | `bdb6df60-a44d-4063-a588-7af5706aebaa`, source `c77cdb7c229bead2ff0d027273586599c34cad45` |
| Upload module SHA-256 | `a4c38392c8d8dd0970d2fc4c3cd8c6204842dd061ce94ec61c9f4bdff09b6a2c` |
| RTDB canonical rules SHA-256 | `99b1f7ec32f8e94c0cf176e420aae8d2c1606056acc7404f69198baabbe7b520` |
| Firestore rules | unchanged `654a30c61436c2f9f6e2716c9d9ca397cc5d662687de2bc914c3494f335901bc` |
| Listening storage | `luyentap-listening-audio-private`, managed public access disabled, no custom domains |

Native predeploy/postupload/postrules checks passed for the private-storage
cutover. The subsequent preview-only predeploy and postupload checks passed with
unchanged private bindings, rules and unrelated Workers. The first preview
postupload observation returned provider HTTP 500 and remained UNVERIFIED; the
fresh retry passed. The failed receipt is retained rather than rewritten.

Live acceptance used the existing Teacher Test and Student Test accounts:

- Cambridge public-library questions loaded. All four recordings played and
  sought successfully: approximately 352.7, 415.3, 385.0 and 472.7 seconds.
  Track transitions used the existing audio player; question navigation remains
  independent of continuous playback.
- Teacher replacement upload produced a six-second authorized preview, played
  before saving, and Save Test returned the shared success announcement.
- Student private homework loaded the updated interactive form and the same
  six-second recording. Independent answers GREEN and QA submitted as 2/2,
  100%, and the result remained visible after browser reload.
- Generated feedback persisted on both the earlier result and the new result;
  native `feedbackGenerationMeta.lastOutcome` is `saved-ai`. Reload showed the
  saved feedback. The earlier BROWN-pinned 2/2 result stayed unchanged.
- The new recording's 192,044 bytes match the teacher-upload SHA-256
  `fe8c0372f7b2a8fc1bac7c997c7c566d641ffb97eb11046b80ef785f13306ff3`.
  Its raw public URL returns 404; the superseded private recording is absent.
  Existing private-bucket/unsigned-content/unauthenticated-issuer denial proofs
  remain valid. Existing assignment-pin and teacher-notification proofs were
  reused because this Worker response change does not invalidate them.

Final QA version is `version-f198cd191755715855a186ffebddb1e9`, recording
`kNIcLKTDWnzQtnc5E1V6Sg`, submission
`listening_attempt_78b5bd81cec6233310853852d39e3b5b3ec9633d31896fbc7f1b81fa0a63a987`,
and result
`listening_result_7f970ca71af02f87e39a0e6b4311039cfcbc52e83079df19c14242263d931c07`.

Evidence remains in `tmp/listening-live-release-20261027/`, including
`live-cambridge-private-storage-acceptance.json`, `live-new-upload-preview.json`,
`live-private-final-playback.json`, `live-final-audio-and-submit-proof.json`,
`live-private-feedback-readback.json` and the matching screenshots. Native
private-cutover receipts are in this checkout's `tmp/release-receipts/`; preview
receipts and exact bundle/configuration are in the qualification checkout's
`tmp/release-receipts/` and `cloudflare/tmp/listening-preview-release/`.

Recovery references are Hosting `43db33dc8cf7b167` before the result correction,
Upload `30503e0b-fedd-4e61-a7fc-0b2b3b548493` before the preview correction,
and the verified copy/removal receipts `private-storage-copy.json` and
`private-public-removal.json`. Prefer fix-forward. Keep the private binding and
objects during recovery: a Worker rollback to public-bucket code or an isolated
old Hosting/rules rollback is unsafe. Rolling back only to the preceding
private Worker preserves saved playback but reintroduces the fresh-preview bug.

The submitted-card retake, private question-count metadata and clipped desktop
recording note were subsequently corrected and verified in the
[October 29 UI follow-up](2026-10-29-listening-homework-ui.md), including the
intended phone workflow. Advanced Reading-style grouped/AST form editing remains
explicitly under construction. PDF/Book source, provider settings and
pre-existing primary-checkout work remain untouched.

The evidence is also preserved outside the managed worktrees at
`C:/Users/The Lord/repos/luyentap/tmp/listening-release-archive-20261029/listening-live-release-evidence.zip`.
All 221 entries were read back and SHA-256 verified; archive SHA-256 is
`e5b565f9c7a22a2976c570ddb7c5c1b40deb598959b28150b53b1b4504881396`.
The adjacent `manifest.json` and `verified.json` record individual hashes and
archive verification. The older October 27 archive is retained.
