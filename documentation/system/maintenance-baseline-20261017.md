# Maintenance baseline — 2026-10-17

Status: **Qualified replacement deployed from `83d794d4`, tag `stable-2026-10-18-reading`; Hosting version `61721e91a13201ae`.**
See [the current release record](../release-audits/2026-10-18-stable-reading-hosting-release.md).
Read the deployed release manifest for the current production source identity;
the observations below retain their stated verification dates and scope.

The attempted source `fb4197fc6152f45569afa2750df8b9fd681c956b` and Hosting
version `caa2ab5da3911495` were withdrawn. Live Hosting was restored to version
`10039da56ea1c0ae` at `2026-10-17T17:28:58.392Z`. The prepared production env
omitted `VITE_READING_V2_ROLLOUT_MODE`, whose actual normalizer defaults to `off`.
This historical rollback was superseded by the qualified replacement below.
See [the incident record](../release-audits/2026-10-18-stable-hosting-release.md).

The owner approved proceeding on October 17. Independent deployed-backend
comparison is recorded in [the backend qualification](../release-audits/2026-10-17-backend-qualification.md).
It supports a Hosting-only baseline release. A current provider GET confirmed
the exposed Groq credential is accepted; the owner explicitly declined
revocation and accepted that exposure risk. No credential rotation is planned.

The owner chose the current live app as the maintenance baseline. Newer PDF Book
development stays in the original `luyentap-prd0062` checkout. The historical
October 6 frontend already contained Book code; this branch freezes that code
instead of claiming Book was absent from the deployed artifact.

## What this branch preserves and corrects

- Reconstruction `7a44284e` combines the retained October 6 tracked snapshot and
  required recovered source files. Its per-file donor manifest is in
  [the reconstruction record](live-baseline-reconstruction-20261017.md).
- `323cdc9d` restores the reviewed server-side AI gateway clients and role/key
  protections. Fresh readback still shows gateway version
  `09d2b77a-03ec-40ff-b0c9-933a9b007325` active at 100%. This source correction
  intentionally differs from the current October 6 Hosting app, which regressed
  to direct provider clients and an embedded credential-shaped literal.
- Existing `50a5d55e` release-safety tooling is reused: clean-source builds,
  source/content manifests, hotfix retention, provider readback, and separate
  production/local environment handling. Required local runtime scripts and the
  previously missing Windows Java-emulator launcher are included.
- Normal local Firebase bootstrap now enforces the launcher's disposable
  identity and emulator/Worker endpoints, connects Firestore to its emulator,
  and suppresses Analytics. This narrow correction reuses the canonical local
  guards while retaining acceptance mode; newer persistence/recovery work is
  still separate.
- Normal local development explicitly clears the inherited AI gateway URL.
  Local AI extraction/key administration is unavailable until an isolated AI
  gateway runtime is provided. The Book Worker does not supply that runtime;
  restoring a live URL is not a local setup remedy.
- Production preparation rejects browser Groq/Gemini credential settings and
  missing/unreviewed ordinary-notification or AI gateway endpoints. Local env
  validation no longer requires a browser Gemini key.
- Release assessment checks the Book rollout gate when Book Worker source or
  configuration changes. An AI/ordinary Worker change still requires its own
  provider/compatibility evidence and is not blocked by an unrelated dormant
  Book configuration. A regression check preserves the real Book expiry gate.
- Checked-in primary database rules reflect the observed live rules.
  Subsequent direct Firestore readback confirmed both candidate and live already
  deny browser access to `settings/api_keys`; no rules release is needed.
  Unreleased Book rule changes from the historical dirty source were removed
  from this maintenance candidate; they remain in the original feature checkout.
- [Listening cleanup](listening-cleanup-reconciliation-20261017.md) is preserved
  as a separate reconciliation item. Its seven main-only commits are not merged
  without evidence that the behavior belongs to the current live baseline.

## Ordinary notification readiness

Book notifications, teacher grading, and teacher sessions retain their existing
separate scope. The ordinary upgrade was already released; this work prepares
its preserved source and configuration for a controlled subsequent release.

Fresh provider readback on October 17 confirms:

| Surface | Observed state |
| --- | --- |
| Hosting | `10039da56ea1c0ae`, October 6, 458 files |
| Notification command/DO host | `541166ae-93db-4d92-8eda-5fb291325b42`, 100% allocation |
| Notification public entry | `5696e963-c5ed-463d-a495-30db3c07bc98`, 100%; bound to the command host's `NotificationBridgeObject` |
| Cron schedules | Empty, verified by the Cloudflare schedules API |
| Firestore rules release | `8fcf3e1c-1a56-4138-8e4c-24cc594c5316` |
| RTDB notification rules | Equal to the observed live rules; no notification rule migration introduced |
| Public `/events`, `/homework-result-authority`, `/course-enrollment-approval` | Production-origin preflight 204, unauthenticated POST 401 |

The preserved notification Worker dry run passed. The initial Worker test
attempt failed before tests because a validation copy resolved root Vitest 3
instead of Cloudflare Vitest 4; reusing the byte-identical Cloudflare package's
dependency tree corrected the harness. No dependency was installed.

The four ordinary endpoint settings in `env.example.txt` identify the already
deployed public entry. Its `-qa` name is historical; its production role was
verified rather than inferred from that name. The build guard prevents an
omitted endpoint from silently disabling a published workflow.

## Validation completed

- Final normal minified Vite build and bundle budget passed: **262 KB** root entry.
  A separate unminified structural build also passed. Both used fake isolated
  configuration, not production credentials. Generated application text had no
  Groq/Google credential-shaped literals.
- AI frontend/service checks: **147/147**, 15 files; AI Worker mocks: **11/11**.
- Ordinary notification frontend/service checks: **113/113**, 13 files.
- Notification Workerd integration: **44/44**, seven files; Wrangler dry run
  passed using the existing Windows x64 route.
- Isolated Firebase rule checks: **2/2** AI authority checks against the final
  rules; **3/3** notification/Writing checks proving recipient isolation,
  read/replay preservation, atomic reminders and immutable receipts.
- Existing release/acceptance/deployment checks passed **47/47** before the new
  guards; the affected deployment checks were rerun after changes and passed
  **28/28**. Counts overlap and are not a unique total.
- The final combined release-assessment/deployment-guard run passed **50/50**,
  including isolation from an unchanged expired Book rollout and preservation
  of its blocking behavior for an actual Book Worker change.
- After the local Firebase correction, the combined boundary/release/deployment
  checks passed **53/53**. They exercise the actual launcher/module bodies with
  SDK transport spies, including rejected live/missing hosts, all three local
  transports, acceptance in dev/build modes, and production behavior.
- Installed Chromium verified teacher login from `http://localhost:5173/login`,
  notification opening to the class page, and persisted read state after reload.
  Student login from `http://localhost:5174/login` verified the dashboard feed,
  destination and the same read persistence. Both used disposable source-shaped
  notices. Admin login then rendered authenticated AI-key metadata from a local
  gateway stub. This proves the consumers, not deployed delivery/admin commands.
- [The final acceptance record](../release-audits/2026-10-17-candidate-acceptance.json)
  binds those checks to **2,509 byte-compared source/config/public/script files**
  and the generated entry hash. All **392 final JavaScript assets** were scanned
  without finding Groq/Google credential-shaped literals. Remote browser
  requests were blocked; no remote backend connection was allowed. Font-block
  errors and request cancellation during navigation/close were retained in the
  ignored diagnostic logs.
- Fixed test-only drift: the Writing view's inventory guard now recognizes its
  committed-event port; the legacy producer test mocks Firebase; the AI rule
  fixture removes its own previously promoted test user before reruns.
- The 11 new/changed runtime package-script entry points exist. The Windows
  launcher parses. Focused ESLint and diff/UTF-8 checks are recorded with the
  final commit. Six inherited donor whitespace findings remain documented in
  the reconstruction record; donor bytes were preserved.

## Historical qualification gates before the October 18 bootstrap

1. **Deployed compatibility:** local browser consumer checks passed; real
   notification provider delivery and deployed AI administration/provider calls
   were not exercised. Current provider versions and isolated Worker tests do
   not establish full compatibility. The desktop browser tool initially failed
   initialization twice; installed Chromium supplied the successful fallback.
   It used fresh contexts and intercepted the candidate artifact at the required
   role origins, with local emulators and loopback permission. Original role
   servers were not replaced. This is not a normal-launcher or production run.
2. **Reviewed production environment:** the machine-local `.env.production`
   was created from Firebase Hosting's public initialization configuration and
   reviewed production endpoints, without copying the shared development env.
   Its SHA-256 is `b872b1a42c7c208cfe09ff77a41ba06987624ce216c9f1ef67f61e5ef32e65b3`.
   It explicitly disables Book material/editor and presentation gates. The new
   student deep-link guard rejects a disabled Book launch before resolution;
   all 33 affected practice-page tests passed. The normal production build
   passed from clean source `03564402`, with a 257 KB entry and a generated
   production source manifest. The combined bootstrap/guard tests passed 57/57;
   focused ESLint passed. Compatible installed ancestor tools were reused, with
   no dependency installation or dependency junction.
3. **Historical live source identity:** the October 6 release served HTML at
   `/.well-known/luyentap-release.json`. Its historical source-copy concurrency
   gap remains; provider metadata cannot reconstruct an exact deployed tree.
   The approved manifest-bearing bootstrap establishes the binding for the new
   release. It does not retroactively prove the October 6 source identity.
4. **Public credential exposure:** accepted by the owner after a read-only
   models request returned 200. It remains active. The new frontend retains
   server-only AI keys; rebuilding does not revoke historical exposure.
5. **Remote promotion/release:** source publication, baseline promotion and
   controlled stable deployment are now authorized after qualification. No
   Worker or rules release is needed. Existing AI/notification Workers and rules
   match the baseline and should remain in place. PDF Book requires its own
   subsequent source integration, configuration and lifecycle/provider checks.

The direct-student homework UID fix and newer local persistence/recovery work
remain separately inventoried in the research report. They are not quietly
mixed into this reconstruction.

Future work should start from this candidate only for review/qualification.
After acceptance and approved promotion, use the promoted stable revision as
the sole base, keep PDF Book on its feature branch, and record each release's
source manifest. The branch label alone is not stable-state proof.

## Starting future changes

After promotion, clone the reviewed `main` or recorded release tag, verify a
clean status, then create one `codex/<feature>` branch per change. Keep PDF Book
on its existing feature branch until its own acceptance and release. Commit
only intended paths and merge reviewed, checked changes back into the stable
line. Record Hosting, Worker, and rules releases separately against that source
revision; an application deployment does not deploy its backend automatically.

## Main synchronization and retained work

Promote the reviewed reconstruction without importing the unrelated main-only
Listening implementation. An explicit `ours` strategy merge retains remote
main ancestry while preserving the reviewed candidate tree; a normal
non-force push can then advance GitHub main. Preserve the former local main at
`codex/retained-local-main-feedback-20261017` before synchronizing its checkout.
Its 28 unpublished feedback/dashboard commits stay local and independently
reviewable; do not publish them incidentally through merge history.

The deferred Listening chain includes session-deadline and restore/lease
fencing on existing upload paths, not only optional cleanup. The inherited
candidate can issue a ten-minute grant near session expiry that remains usable
after that deadline. Keep this hardening obligation in the separate Listening
reconciliation; a Hosting-only release does not alter the deployed Worker.

## Promotion corrections — 2026-10-18

PR #147 initially exposed three inherited CI failures. The activity checker now
uses presentation mode in its registration selector, matching the runtime, and
recognizes the existing generic single/multi-select variants. All 21 checker
tests and all 32 independent schema fixtures pass. No Book gate was enabled.

Touched course components and teacher class/review pages now use shared/native
controls instead of Mantine; outcome announcements use the shared toast API.
The full promotion Mantine boundary passes across 875 changed source files.
The shared assessment suites pass 39 tests in five files, and guard parser
tests pass 34/34. The owner explicitly approved scoped line-budget exceptions
for the current three authoring files on October 18; current counts and split
alternatives are recorded in the assessment findings ledger. Prior exceptions
remain historical rather than being presented as current approval.

These checks do not establish deployment. Main synchronization, a fresh clean
production build, the first manifest-bearing Hosting release, and live browser
verification remain pending until their actual results are recorded.

Superseding October 18 result: PR #147 and all five main-branch workflows passed.
The clean production build passed with a 257 KB root entry. The authorized
Hosting-only bootstrap completed and all 453 manifest-listed content hashes
matched independent live readback. Teacher and student browser checks passed
within the scope and limitations in the release record. The exact deployed
source is tagged; no Worker, rules, database, or B2 release occurred.

## Qualified replacement — October 18, 06:15 Asia/Bangkok

PR #148 restored all four existing Reading modes, included the six approved
Reading import fixes, and corrected the cacheable missing-script reload loop.
Hosting `61721e91a13201ae` serves source `83d794d4`; the stable source tag is
`stable-2026-10-18-reading`. All 453 listed deployed hashes match, and teacher
creation/Reading import entry/passage listing plus student Library/Reading
runtime/navigation passed in the live browser. Main and the clean local main
were synchronized. [The current release record](../release-audits/2026-10-18-stable-reading-hosting-release.md)
supersedes the historical withdrawal status above. It preserves the dated
qualification limits and remaining non-Book/PDF work. No Worker, rules,
database or B2 deployment occurred; this was Hosting only.

## Remaining-work follow-up — October 18

The owner requested continuation of homework recipient hardening and Listening
reconciliation, while explicitly keeping the student feedback pages and Student
Study OS design pack separate. The basic UID mapping is already in reconstructed
main but remains absent from the active backup Worker. Its follow-up tests pass;
an unrelated Book dependency difference currently prevents treating the new
backup bundle as a homework-only release. See the dated
[remaining-work record](../release-audits/2026-10-18-remaining-nonbook-work.md)
for the exact source, provider observation, checks and unverified boundaries.

## Book catalog regression — October 18

The qualified Reading replacement still accidentally disabled the existing
Book tab and editor through two generic production flags. The correction is
being prepared separately; do not treat the prior browser scope as whole-app
qualification. The [incident record](../release-audits/2026-10-18-book-catalog-regression.md)
contains provider-matched historical evidence, the exact configuration cause,
and the distinction between existing Books and the unreleased PDF Activity
rollout. Production validation now requires the generic catalog/editor enabled
while that separate rollout remains disabled. No corrective deployment is
claimed by this note.

## Book catalog correction — October 18, 09:50 Asia/Bangkok

The owner-approved Hosting correction is deployed as `ffd0c61f899cb275`, source
`091a1746`, tag `stable-2026-10-18-books`. The two existing Book flags are enabled;
all six PDF Activity presentation gates remain disabled. All 453 deployed file
hashes match. Fresh live Teacher checks confirm Book and materials creation
entry, two test-modal openings without reload, Reading V2 Details, and 11
Reading Passages. Both tested Book catalogs were empty, so persistence/editor
reopen proof remains local emulator acceptance rather than a live Book write.
See [the current release record](../release-audits/2026-10-18-book-hosting-release.md).
This release includes no Worker, rules, database or storage mutation. Homework
recipient hardening (draft PR #150), Listening cleanup (draft PR #151), retained
feedback/design work, and PDF Book remain separate; their unfinished acceptance
or safety work is not closed by this correction. Use clean stable main for
future changes and preserve the dirty PDF feature checkout separately.

## Homework Worker release — October 18, 14:21 Asia/Bangkok

PR #150 merged as `34207760`; clean local main and GitHub main were synchronized.
Its approved isolated Homework Worker artifact from `99bb3f07` is live as
`6aa7ac0f-7ccb-4c37-a20c-e6788bd6dd25` at 100%. Exact bundle and configuration
readback pass; [the release packet](../release-audits/2026-10-18-homework-worker-release.md)
records scope, recovery and the remaining authenticated production QA limits.
Hosting stays at the Book-restored `091a1746` release. For future work, clone
main and create a separate feature branch; a whole main-based backup Worker
rebuild still includes the deferred Book dependency delta and needs its own
qualification. The deployed Worker candidate is retained independently.

The owner acknowledged deferring Listening cleanup after reviewing its crash
recovery/retention tradeoff. Keep PR #151 a draft with sweep disabled. Retained
student feedback/design pages and PDF Book remain separate; this release does
not close their implementation or acceptance work.
