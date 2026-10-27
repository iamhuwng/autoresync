# Listening durable audio release preparation

Prepared 27 October 2026. This packet records preparation, not deployment or
postdeployment acceptance. No production mutation has been performed by this
qualification work. Fresh native shared-checker evidence is required before
each authorized rollout step; a historical receipt does not establish current
provider state. The full predeploy assessment is being collected separately.

## Source and scope

- Clean product revision: `797f6284206f0fbc8eb45305f01997cc8831dec5`.
- Product tree: `5279211c19196a1e34ec1b4338aeb4913772aa79`.
- Observed Hosting source/review base: `03089c913ecd81201759181328f991a78bea21d3`.
- Complete 100-file source-delta canonical SHA-256:
  `913828f60cf4eb1289f112b59ee18ad2cd6718d0b748a1f86318d72abcf94049`.
- Production environment SHA-256:
  `8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57`.

The product candidate fixes trusted audio commitment, preview and playback,
private homework grants/retention, existing editor persistence, and legacy
Listening assignment validation. The new qualification/deployment tooling is
kept in a separate checkout so the product source remains clean. Run the newer
tooling against the explicit product `--cwd`; do not change its source pins to
accept another candidate.

The native observer in `scripts/release-listening-evidence.mjs` is the exact
pin authority. It preserves the historical fixed observers. It reads provider
state and local inputs twice, rejects drift, and brands only its own successful
native observations. Supplied JSON and pure validator results cannot establish
release readiness. Secret names are checked; secret values are not exposed.
Historical deployed Worker Git provenance remains unknown. Qualification binds
reviewed artifact bytes and directly observed provider configuration instead.

## Retained artifacts and recovery baseline

Paths below are relative to the product's ignored
`tmp/listening-acceptance-20261027/` directory. Retain these exact bytes.

| Artifact | SHA-256 |
|---|---|
| `upload-release-bundle/worker.js` | `21a423c4bf42320ed5411e493e1ef8c24bf7ccea4d0ee4da40f310f583d6fd3b` |
| `upload-release.wrangler.json` | `27bb66e621d2404f472f52fab9da9407ec61248f72c90c66a6884796d106172e` |
| `homework-release-bundle/index.js` | `64e0e529f924805ec7983986206b51775ed5710837a370bfb45ae1f78206aec1` |
| `homework-release.wrangler.json` | `d9ca0a1f2e3ad1cae5306abb6c369e375354197f581370bfb28ce3cc54c2ff95` |

Both deployment configurations select the prebuilt module with `no_bundle`.
The upload configuration preserves the live hourly cron, DO, rate limiter, AI,
R2 binding and variables; its source configuration omits that live cron. The
backup configuration preserves its weekly cron and backup bindings/settings.
Do not deploy the ordinary source configurations in place of these artifacts.

| Service | Prior active version | Retained module SHA-256 |
|---|---|---|
| `r2-upload-signer` | `c6bc690e-4636-4ea6-8098-35f5370cce9d` | `5b652dbafb15e3c4b17d83ac23c0eb4e577e29f62ffbfbdc5e98d62a553e20d3` |
| `r2-backup-worker` | `bb4fc431-e84d-4b50-8c11-9f9c0ddecd4f` | `341d0bb25ffd992da94a9b67d086a8a1edce99a49ef4260b7c595d891e2fc4f8` |

Native retained inventories/modules are under `provider-retained/` and
`notification-retained/`. Prior RTDB rules are `provider-rules.json`,
structurally identical to `87adebb81e8c7896103803c2807b8ab76d95897a`.
Their canonical SHA-256 is
`1fdd6321aad54e7a7bca84b51836601d5dacf8491587dca6274247bbc194a4cb`;
the candidate's is
`0310f19cc07a8970ce2b12672e60fe6389acaf255910319a4286058e39fbdbc3`.
Only `homework_test_access/$testId/$studentId/$homeworkId/.validate` differs.

The observer requires unchanged notification command version
`a184d75b-8823-485a-885d-e23354646f45` and public adapter version
`5696e963-c5ed-463d-a495-30db3c07bc98`, exact module/configuration pins, and
an empty native Firebase Functions inventory. Production Reading V2 submit
must select `https://r2-backup-worker.iamhuwng.workers.dev/api/reading-v2/submit`.
No notification or Functions deployment belongs to this rollout.

Before mutation, also retain the fresh Hosting provider version/channel used
for native clone recovery. The observed Hosting Git revision is not itself a
Firebase version ID. Retain the matching manifest and provider metadata.

The fresh `kahut1` live-channel readback retained in
`hosting-kahut1-before.json` records finalized version
`projects/temp-a1437/sites/kahut1/versions/d418b04bae169db6`.
The selected product checkout's tooling doctor reports zero missing required
dependencies; the dependency-free tooling checkout is not a build checkout.

## Ordered qualification and activation

Use the existing authenticated provider tools and repository-owned dependencies.
The selected product checkout must remain clean. A fresh compatibility review
must bind its exact source, base and independently observed Hosting fingerprint.
The initial flags must show authoring writes enabled and restore inactive.
Do not write flags merely to manufacture a passing assessment.

```powershell
$tooling = 'C:\Users\The Lord\.codex\worktrees\listening-release-qualification\luyentap'
$product = 'C:\Users\The Lord\.codex\worktrees\listening-durable-audio\luyentap'
$artifacts = Join-Path $product 'tmp/listening-acceptance-20261027'
$review = Join-Path $artifacts 'release-compatibility.json'
$phase = 'predeploy'
node "$tooling/scripts/release-check.mjs" --cwd $product --mode release `
  --base 03089c913ecd81201759181328f991a78bea21d3 --observe-hosting `
  --env-fingerprint 8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57 `
  --compatibility-review $review --observe-listening-release --listening-phase $phase `
  --listening-upload-bundle "$artifacts/upload-release-bundle/worker.js" `
  --listening-upload-config "$artifacts/upload-release.wrangler.json" `
  --listening-homework-bundle "$artifacts/homework-release-bundle/index.js" `
  --listening-homework-config "$artifacts/homework-release.wrangler.json" `
  --json --receipt "tmp/release-receipts/listening-$phase.json"
```

Use a new receipt filename for each rerun; existing receipts cannot be overwritten.
`PASS` at `predeploy` qualifies the reviewed ordered backend plan. It does not
permit Hosting activation. Execute only within the user's conditional deployment
authorization, stopping if fresh checks no longer pass:

1. After fresh `predeploy` PASS, deploy only candidate RTDB rules. Rerun the
   command with phase `rules`; it requires new rules and both prior Workers.
2. After `rules` PASS, deploy only the pinned upload artifact/configuration.
   Rerun with phase `upload`; it requires exact new upload bytes, prior homework
   bytes, unchanged runtime/bindings/routes and candidate rules.
3. After `upload` PASS, deploy only the pinned homework artifact/configuration.
   Rerun with phase `homework`; both candidate modules must be active at 100%.
4. Only a fresh `homework` PASS with `hostingReady: true` may reach guarded
   Hosting deployment. The route repeats assessment before and after build.

Old Hosting already calls the homework endpoint: deploying that Worker activates
new assignment writes immediately. Hosting-last does not pause those writes.
The homework handler has no restore/rollout gate; coordinate assignment traffic
and exclude concurrent restoration. The authoring-write flag controls authoring,
not homework assignment creation.

For the guarded Hosting route, set the following from the fresh final receipt
and reviewed paths, leaving caller-baseline variables unset:

```powershell
$receipt = Get-Content "$product/tmp/release-receipts/listening-homework.json" -Raw | ConvertFrom-Json
$env:LUYENTAP_RELEASE_SOURCE_CWD = $product
$env:LUYENTAP_RELEASE_OBSERVE_LISTENING = 'true'
$env:LUYENTAP_LISTENING_PHASE = 'homework'
$env:LUYENTAP_LISTENING_UPLOAD_BUNDLE = "$artifacts/upload-release-bundle/worker.js"
$env:LUYENTAP_LISTENING_UPLOAD_CONFIG = "$artifacts/upload-release.wrangler.json"
$env:LUYENTAP_LISTENING_HOMEWORK_BUNDLE = "$artifacts/homework-release-bundle/index.js"
$env:LUYENTAP_LISTENING_HOMEWORK_CONFIG = "$artifacts/homework-release.wrangler.json"
$env:LUYENTAP_RELEASE_MODE = 'release'
$env:LUYENTAP_RELEASE_BASE = $receipt.source.baseRevision
$env:LUYENTAP_RELEASE_FINGERPRINT = $receipt.source.fingerprint
$env:LUYENTAP_RELEASE_ENV_FINGERPRINT = $receipt.productionEnvFingerprint
$env:LUYENTAP_RELEASE_OBSERVED_FINGERPRINT = $receipt.observed.fingerprint
$env:LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_FILE = $review
node "$tooling/scripts/deploy-live.mjs"
```

This uses the newer guarded script with the clean selected source; it does not
copy a dirty artifact into production. The build requires the existing supported
dependency/runtime route. Fresh remote proof must follow deployment: manifest
and hashes, exact Worker modules/configuration, rules, teacher save/publish and
independent student public/private homework playback and authorization denial.

## Proof and limits

The fixed observer/shared checker and historical observer regressions passed
134 tests in the final two focused batches, zero failures/skips. Focused new negative tests cover foreign source,
artifact/config/rules drift, active/ambiguous restore, wrong endpoint/environment,
unexpected Functions, notification changes, split traffic and forged observations.
Actual retained inputs also match the pure validator; this is not trusted native
release evidence. Independent review and final native receipts remain separate.
Local product/browser proof is recorded in `2026-10-27-listening-audio-history.md`;
it does not prove production credentials or current deployed behavior.

Rollback is prepared, not rehearsed. Restore recorded prior Worker versions and
verify their exact modules/configuration; recover Hosting using the retained
provider version/channel. Hosting or Worker rollback does not undo committed
assets, deleted temporary objects, Firestore assignments or RTDB grants/retention.
Ambiguous assignment creation deliberately retains references. Rules reversal
must account for object-shaped grants already written. Do not infer that a
code deployment restores missing historical audio: that requires correctly
mapped original files and separate authorized recovery.
