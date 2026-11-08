# Fixed Listening private-audio release profile

This profile prepares the shared read-only release checker for product revision
`529854b97343b51cfbdff98618411763d8b1a9a4`, tree
`bff4cf29033738d1afae2f8dfddf826e94acea1a`, against the actual Hosting source
base `bb4a74349482a874dae0cadc1a935ca93fcab785`. The complete 31-path delta is
bound by `filesSha256` in
[`release-listening-private-pins.mjs`](../../scripts/release-listening-private-pins.mjs).
Historical editor, probe and functional-completion pins are unchanged.

The existing `--observe-listening-editor-release` route selects `private-audio`
only from that exact clean Git revision/tree/base and reviewed artifact,
configuration, environment and rules hashes. It accepts no supplied provider
evidence or alternate service/bucket targets. Test validators do not create a
trusted observation.

Every native observation reads the fixed Cloudflare account and all existing
Worker services, Firebase Functions inventory, restore/write flags, RTDB rules
and Firestore rules. The new profile also performs native GETs for the fixed
bucket `luyentap-listening-audio-private`: its managed domain must have
`enabled: false`, its custom-domain inventory must be empty, and its exact
lifecycle must match the reviewed canonical hash. The checked-in policy is
`cloudflare/r2-lifecycle.listening-private.json`: default multipart abort after
604800 seconds, plus object deletion only under `temp/listening/` after 86400
seconds. The policy has no durable-audio deletion rule. The complete provider
observation and local candidate are re-read before recording evidence.

The ordered phases are:

1. `predeploy`: the prior Upload version
   `4c8ade84-46a5-4b6b-98f3-42539972aab9`, its exact modules and original
   configuration invariant must remain live. The private bucket must already
   satisfy its privacy/lifecycle checks. Both rulesets retain their prior pins.
2. `postupload`: the Upload artifact must match the reviewed candidate bytes,
   and its configuration must match the separate reviewed invariant containing
   exactly the added `LISTENING_AUDIO_BUCKET` private binding. All non-target
   Worker versions/modules/configuration and both prior rulesets remain exact.
3. `postrules`: the new RTDB rules and unchanged Firestore rules must match
   their exact reviewed pins, together with the candidate Upload state and
   private bucket checks. Only this phase can report Hosting ready.

Before switching Upload bindings, verify the separate private object-copy and
ownership receipts. After the candidate Upload Worker has been verified,
remove only the verified shared Listening copies before deploying RTDB rules
or Hosting. The observer itself proves neither object copying nor deletion.

The generic Book/Backblaze classifier and evidence guard remain active. This
exact native profile may clear only the singleton classified path
`scripts/local-book-source-worker.mjs`, after comparing the base and candidate
script and proving that the sole change adds
`LISTENING_AUDIO_BUCKET` bound to `local-listening-audio-private` beside the
unchanged `R2_BUCKET`/`local-book-covers` binding. Every other script byte must
match after line-ending and outer-whitespace normalization. Any other
Backblaze-classified path or script change keeps the generic verification gate.

The checker performs no mutation or object-copy qualification. A provider
observation cannot replace source review, compatibility review, CI, the
separate storage-copy/ownership proof, or explicit deployment authorization.
Hosting rollback does not reverse Worker bindings, rules or copied/deleted
objects; recovery requires coordinating those surfaces.
