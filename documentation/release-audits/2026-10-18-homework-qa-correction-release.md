# Homework QA correction release packet — 2026-10-18

Status: **prepared; no merge or production deployment authorized by this packet**.
The owner approved the controlled QA that exposed the two failures in
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

Current prepared baseline: command version
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
