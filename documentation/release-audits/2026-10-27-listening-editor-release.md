# Listening editor release qualification

Preparation only. User authorization covers this scoped release once the
technical gates pass. The prior audio release profile and pins stay unchanged.
The separate editor profile binds the final merged source and reviewed artifacts
below. A fresh native assessment remains required; no deployment is claimed here.

## Fixed source and artifacts

- Product: `5090b7ef1e02562c4f0d873d2172a594df4ab29f`, tree
  `8b30b3ce703e89aa30a28d64da487494d798e38b` (merged PR #177).
- Reviewed Hosting base: `03089c913ecd81201759181328f991a78bea21d3`.
- Full 130-path delta canonical SHA-256:
  `c77b8bde149460c44702d820106ff6dc7aeeba13654789fc970e5ebb88010f92`.
- Upload `worker.js` SHA-256:
  `a87f00b21c94642104f47cadf8e9ecf34996da751b767c1e547a7c2272d10f88`.
- Deployment JSON SHA-256:
  `39dd362796e79689f0afe1516cc0203b938b9f76cc964ac937d724e46bdeec5a`.
- Production environment SHA-256:
  `8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57`.

Artifact paths relative to the clean product are
`cloudflare/tmp/listening-live-release-20261027/upload-bundle/worker.js` and
`cloudflare/tmp/listening-live-release-20261027/upload-release.wrangler.json`.
The configuration preserves live bindings/runtime and the hourly cron and
selects the reviewed prebuilt module with `no_bundle: true`. Wrangler dry-run
was reported successful by the preparing operator; native deployment remains a
separate step. Source/artifact hashes were independently remeasured when pinned.

The retained native inventory is
`tmp/listening-live-release-20261027/native-before.json` (10:06 UTC). Its Hosting
manifest-only field is not full Hosting hash qualification; use the checker’s
fresh native full-manifest observation. The preparing operator separately read
all Hosting hashes with fingerprint
`2ff16771ff4839bada8ecff2a73b13fd370e2396118a67ee1f5d32a47f101ad9`.

`scripts/release-listening-editor-evidence.mjs` qualifies one Upload Worker
artifact plus Hosting. It requires exact clean source/tree/base and complete
changed-file scope, bundle/config/source-config hashes, production environment,
unchanged rules and routes, enabled authoring and inactive restoration. The
homework and both notification Workers must retain exact reviewed versions,
module inventories and runtime configuration. Firebase Functions must remain
absent. Native observations are collected twice; caller JSON and pure test
validators cannot establish readiness or replace provider inspection.

Run the newer `release-check.mjs` with the clean product `--cwd`, explicit
`--base`, `--observe-hosting`, `--env-fingerprint`, fresh
`--compatibility-review`, `--observe-listening-editor-release`,
`--listening-phase predeploy`, `--listening-upload-bundle` and
`--listening-upload-config`. Write each receipt to a new filename under the
product's `tmp/release-receipts/`. Do not supply homework artifacts or a caller
baseline. Review every carried hotfix obligation against the observed Hosting
manifest; differing content needs exact sorted-path successor reconciliation.

After predeploy PASS, deploy only the pinned Upload Worker module/configuration,
preserving bindings, secrets, hourly cron, runtime, migrations and routes.
Rerun with phase `postupload`: only exact new module bytes at 100% qualify.
Only postupload PASS sets `hostingReady: true`. No rules, homework Worker,
notification or Firebase Functions deployment is part of this release.

The guarded Hosting route uses `LUYENTAP_RELEASE_OBSERVE_LISTENING_EDITOR=true`,
`LUYENTAP_LISTENING_PHASE=postupload`, upload bundle/config paths in the existing
`LUYENTAP_LISTENING_UPLOAD_BUNDLE` / `LUYENTAP_LISTENING_UPLOAD_CONFIG` variables,
and `LUYENTAP_RELEASE_SOURCE_CWD` selecting the clean product. Leave the old
Listening observer flag and homework artifact variables unset. Supply the usual
receipt-bound base/source/environment/Hosting fingerprints and compatibility
review; the route repeats native qualification before and after its build.

Retain fresh prior Worker bytes/configuration/version and Hosting version for
recovery. Neither rollback reverses saved publications, uploads or assignment
data. Postdeployment proof requires native module/configuration and Hosting
manifest readback plus real teacher editor/save and independent student pinned
homework playback/grading. Local tests do not establish production behavior.

## Retained recovery and unchanged services

The upload recovery target is version `674bf4a5-bcd1-4a91-b505-f05214182df5`,
module SHA-256
`21a423c4bf42320ed5411e493e1ef8c24bf7ccea4d0ee4da40f310f583d6fd3b`.
Record fresh provider traffic/configuration readback before using the retained
version; rollback is prepared and has not been rehearsed.

The profile requires unchanged homework version
`e9cac4c7-430a-4398-ba1f-72034c0fd45e`, notification command
`a184d75b-8823-485a-885d-e23354646f45`, and notification adapter
`5696e963-c5ed-463d-a495-30db3c07bc98`, including exact module and configuration
hashes in the profile. Rules must remain canonical tree
`0310f19cc07a8970ce2b12672e60fe6389acaf255910319a4286058e39fbdbc3`.

Retain the fresh Hosting provider version before deployment. The earlier
recorded recovery selector is `kahut1@d418b04bae169db6`; use it only after
confirming it is the intended retained baseline. Installed Firebase CLI supports
`hosting:clone kahut1@<verified-version> kahut1:live --project temp-a1437`.
Do not substitute the source Git revision for the provider version.

PR #176 records the earlier backend activation. This release preserves that
state; it does not rerun its rules/homework rollout. Existing hotfix obligations
remain checked against the current Hosting manifest and require explicit exact
sorted-path successor review whenever this candidate changes their content.
