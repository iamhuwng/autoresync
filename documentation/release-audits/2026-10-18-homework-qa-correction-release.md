# Homework QA correction release packet — 2026-10-18

Status: **deployed and verified after explicit owner approval**. PR #157 merged
as `f38826e65cf0280fc40cc195751181de5ea9d550`; the pinned product source below
was released, then the existing QA events were replayed successfully. Both live
browser checks pass. Preparation evidence below remains historical; the
authorized execution record follows it. See also
[the production QA report](2026-10-18-homework-production-qa.md).

## Exact scope

Deploy only the retained `luyentap-notification-command` module correction and
the narrow RTDB canonical-result read rule. This restores the THCS assignment
notice and gives the verified assigning teacher read access to the submitted
result. Receipt issuance is conditional, identity-bound and retryable.

No Hosting, Firestore rules/data, backup Worker, Book Worker, Listening cleanup,
PDF Book or provider-storage release belongs to this packet. The public
`luyentap-notification-firestore-qa` caller and its external Durable Object
binding remain unchanged. Teacher feedback/delete permissions do not expand.

| Reviewed input | Value |
| --- | --- |
| Product source | `3b682ffa371fc549486d72c4d3125f3c8651a124` |
| Source tree | `4f0b28d08d19d1c331bca037e437e80a95d5091f` |
| Reviewed base | `e04022e4564a530e44cd951551bf49dead63118a` |
| Active module SHA-256 | `9734197c765b06de9d746e68fea9a4912780447e05ddb12057e1ac3c6e2f9ed7` |
| Unchanged entry module SHA-256 | `72a358e0f7313fd37e89f7bf1d85cd1337c199192dc6c297881bf1b71258d270` |
| Outside-two-functions SHA-256 | `d08ff8f2acda3d4d7b7c8ec4fd5d3ae43ee0ad308df526a8aaa30f8892d909e2` |
| Reviewed rules file SHA-256 | `29ca193601d36d8e99e714bd11c53fb31aea764338e87f4dd639c39b06b55e1f` |
| Deployment configuration SHA-256 | `bd4391b72d20c696b55f625888d0fadea100e1703cc14921cb7b0989f7aaaafa` |

## Reproduce and assess

The evidence runner is committed after the product candidate to avoid a
self-referential Git revision pin. Run the newer checker from the maintenance
checkout with `--cwd` pointing to a separate clean checkout of the product
revision above. Do not relax its source pins to the runner's revision.

The reviewed configuration is preserved as
`notification-homework-qa-release.wrangler.json` beside this packet. Copy those
exact bytes to the candidate's ignored `tmp/notification-qa-release.wrangler.json`.
Its paths are deliberately relative to `tmp/`; do not run it from this document
directory. No secrets are stored in the configuration, only existing names.
Use canonical installed tooling; the isolated candidate needs no dependencies.

From the newer checker checkout:

```powershell
node scripts/release-check.mjs --mode release --cwd <clean-product-checkout> --base e04022e4564a530e44cd951551bf49dead63118a --observe-notification-worker --worker-bundle cloudflare/notification-release/notification-command-active.mjs --worker-config tmp/notification-qa-release.wrangler.json --json --receipt tmp/release-receipts/<fresh-name>.json
```

The native observer performs fresh fixed Cloudflare and RTDB GETs twice, checks
the exact modules/configuration and full prior rule tree, rereads the local
candidate, and only then brands a frozen observation. Supplied JSON and pure
test validation cannot mint that trust. Generic Worker releases retain their
`UNVERIFIED` gate. A new source/configuration/provider state needs a new review;
an old receipt is not reusable release authority.

Historical prepared baseline: command version
`541166ae-93db-4d92-8eda-5fb291325b42` at 100%, public version
`5696e963-c5ed-463d-a495-30db3c07bc98` at 100%. The full baseline rule tree
matches base source canonically. Effective variables, two secret names,
Durable Object namespace, limiter, runtime, observability, schedules and routes
are pinned. Historical deployed Git provenance remains unknown; exact module
bytes provide the comparison boundary.

The native shared checker returned **PASS** at `2026-10-18T11:53:48.212Z`
after two complete provider/rules readbacks. Its observation fingerprint is
`df87fd9b57e483a017b207096a5bb5738a568929594b1debdfec0faaf2350cd3`.
The isolated candidate's receipt is
`tmp/release-receipts/notification-homework-qa-20261018-prepared-fresh.json`,
SHA-256 `16e205a257d004d807897bf24bc12384ca474e64487ddb091dc46cc42c5af624`.
It explicitly records `NOT_AUTHORIZED` / `NOT_EXECUTED`, unknown historical
deployed Git provenance, and all original source classifications. A changed
test under `src/` also classifies as Hosting; no frontend runtime source changed
and the fixed execution scope excludes Hosting.

An initial expired Cloudflare OAuth session produced an `UNVERIFIED` receipt;
the existing Wrangler login session was refreshed normally, then a new receipt
was generated. The failed receipt remains retained and was not overwritten or
reclassified. Repeat fresh verification before any authorized release.

## Verification and release sequence

Local checks pass: 50 notification Worker tests, two exact-rules emulator tests,
six client producer tests, 71 checker tests and 41 adjacent startup/deployment
tests. The actual local Teacher result modal fails before trusted verification
and displays the saved 100% result afterward. A warning-free Wrangler dry-run
emits exactly the two reviewed modules; its active module matches the candidate
hash above. Fresh-runner CI is separately required on the final PR revision.

After fresh native PASS, independent review and explicit owner approval:

1. Merge the reviewed PR and synchronize maintenance main without changing the
   pinned clean product checkout.
2. Repeat native preflight immediately before execution. Retain the exact prior
   RTDB rules and command modules for recovery.
3. Deploy the reviewed notification configuration with the existing Wrangler
   route, no bundling/minification and existing variables/secrets preserved.
   Verify exact emitted modules, 100% traffic and unchanged settings independently.
4. Deploy only the reviewed `database.rules.json` to project `temp-a1437` using
   the existing Firebase CLI. Read back the complete rule tree; it must equal
   the candidate, with no other rule or data changes.
5. Replay only the existing approved QA assignment/submission events through
   their actual authenticated verifier. Do not manually grant a receipt or
   create another assignment/attempt. Verify the student's assignment notice
   and the assigning teacher's full result in the production browser.
6. Record actual service versions, append deployed-state proof and publish
   service release tags. Update the service map only after that readback.

Deploying the Worker first may create trusted receipts before the new read rule
is active; these remain unreadable to the teacher until the rule deployment.
No application frontend rebuild is required. Verification/replay failure must
not be reported as full workflow acceptance.

## Recovery and limits

Restore command version `541166ae-93db-4d92-8eda-5fb291325b42` and the exact prior
RTDB rules if the authorized release fails. Verify both afterward. Recovery is
prepared but unrehearsed; it does not remove already delivered notices or
trusted receipts. Rolling back the read rule revokes the new THCS read grant.

Existing historical THCS results are not broadly backfilled. Receipt creation
shares the notification verification request, so failed requests need a safe
retry. This packet does not close normal fresh-clone startup prerequisites or
PDF Book acceptance.

## Authorized execution and current release

The owner explicitly approved merging PR #157, synchronizing main, releasing
only this notification Worker and RTDB result-read correction, and replaying
the two existing QA events. All nine PR checks passed; main's workflows also
passed at merge revision `f38826e6`. Local and GitHub main matched before
execution. Product source remained the clean isolated `3b682ffa` checkout.

Fresh native preflight passed at `2026-10-18T12:00:14Z`, immediately before
the notification deployment. Prior modules and full RTDB rules were retained
under ignored `tmp/notification-qa-recovery-20261018/`. Wrangler deployed with
the reviewed config, `--no-bundle --keep-vars`, and message
`THCS Homework QA correction: assignment notice and verified result read`.
Firebase then deployed only `database` rules to `temp-a1437`; syntax validation
and release succeeded. No Hosting, Firestore, other Worker or storage release
was performed.

| Deployed surface | Verified value |
| --- | --- |
| Notification command, 100% traffic | `a184d75b-8823-485a-885d-e23354646f45` |
| Command deployment | `15b3df6a-fe1c-4819-8024-04bbe9c54c77` |
| Unchanged public caller, 100% traffic | `5696e963-c5ed-463d-a495-30db3c07bc98` |
| Live full rules file SHA-256 | `29ca193601d36d8e99e714bd11c53fb31aea764338e87f4dd639c39b06b55e1f` |
| Canonical full rules tree SHA-256 | `1fdd6321aad54e7a7bca84b51836601d5dacf8491587dca6274247bbc194a4cb` |
| Result-read expression SHA-256 | `9dace28328fb666ad37f3966d68fa440dfd3952eff5f3f3b0ef885ba9db01c9c` |
| Notification source tag | `deployed-notification-worker-2026-10-18` at `3b682ffa` |
| RTDB rules source tag | `deployed-rtdb-rules-2026-10-18` at `3b682ffa` |

Two complete post-release Cloudflare/RTDB readbacks passed at
`2026-10-18T12:03:28.390Z`. Exact active/entry module hashes match the reviewed
table above, and the complete live rules match the candidate. Provider settings,
variables, secret names, bindings, Durable Object namespace, runtime, limiter,
observability, schedules, routes/domains/subdomains and public caller are
unchanged. The read-only verifier's six drift self-checks also pass. Observation
fingerprint: `ac76466dcc10f381a2b4ef7e5a23fdc1fcb473078c87d65b8e306804ba0bcd69`.

The authenticated replay issued only `thcs-homework-assigned` and
`homework-submitted` for the approved existing assignment and attempt. Responses
were HTTP 200 `created` and HTTP 200 `replayed`, respectively. The existing
teacher notice stayed idempotent; trusted verification created the schema-3
authority receipt. No assignment, attempt or direct permission grant was added.
An initial password sign-in failed with HTTP 403 before either event was sent.
The corrected backend replay used the existing Identity Toolkit-only server
key after inspecting its restrictions with gcloud; no credentials or access
restrictions were created, rotated or changed.

Fresh data/rules readback at `2026-10-18T12:06:08.226Z` confirmed the exact QA
result identity, schema-3 authority and candidate rules. Live `/login` quick-login
checks then confirmed the teacher's full result modal (100%, 1/1, scaled 10.0,
27 seconds, one correct answer) and the student's new THCS assignment notice
alongside the completion notice. Notice age reflects the original event time.

Ignored local evidence includes:

- `tmp/notification-authorized-preflight-20261018.log` and the candidate receipt
  `tmp/release-receipts/notification-homework-qa-20261018-authorized.json`.
- `tmp/notification-authorized-deploy-20261018.log` and
  `tmp/notification-authorized-rtdb-deploy-20261018.log`.
- `tmp/notification-authorized-postverify-2026-10-18T12-03-28-387Z.json`.
- `tmp/notification-authorized-qa-replay-server-20261018.log` and
  `tmp/notification-authorized-qa-data-20261018.json`.
- `tmp/notification-live-teacher-result-20261018.png` and
  `tmp/notification-live-student-notice-20261018.png`.

The fixed pre-deployment observer intentionally pins the old provider baseline;
it is historical release proof, not a reusable assessment for a future release
or a health check after this deployment. Future changes need new reviewed pins
and fresh evidence. Recovery remains prepared but unrehearsed; no broad
historical result backfill or PDF Book acceptance is implied.
