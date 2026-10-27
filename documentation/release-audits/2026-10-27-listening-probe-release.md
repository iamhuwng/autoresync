# Listening owner-preview probe Worker correction

Preparation only. Live acceptance after the editor Hosting release exposed a
probe HTTP 500. The correction supplies the required `fetchImpl` dependency to
the RTDB client. The earlier editor release profile is historical and unchanged.

This profile qualifies only the Upload Worker. The exact merged correction,
prebuilt artifact/configuration and retained native baseline are pinned below.
Fresh native qualification remains required before deployment.
The native observer selects between two fixed profiles using actual Git HEAD;
caller options or JSON cannot inject pins. Both profiles retain exact artifact,
rules, environment, flags, module inventory, runtime/binding/schedule/routes,
unchanged services and repeated native-read checks.

Use `--observe-listening-editor-release` with the correction's clean `--cwd`,
explicit reviewed Hosting base, `--observe-hosting`, environment fingerprint,
compatibility review and upload bundle/config paths. Phase `predeploy` must
verify the exact current upload version/bytes; after the authorized upload
deployment, `postupload` must verify new exact module bytes at 100% and all
other services/rules unchanged. Receipts identify `profile: probe-hotfix` and
`scope: upload-worker-only`; `hostingReady` remains false at both phases.
The guarded Hosting route explicitly rejects this scope.

Retain the current upload version/module/configuration for rollback and verify
recovery after use. Do not redeploy Hosting, rules, the homework Worker or
notification services for this one-line backend correction. Native qualification
and real owner editor/preview/save acceptance remain required; unit tests alone
do not prove deployed behavior or production credentials.

## Fixed candidate and recovery

- Candidate: `25861289735ff13b954b4ecb5bd64c1336a38151` (merged PR #179).
- Tree: `f1141a079bb7f42cb73dedb944e9cca92917d93a`.
- Live Hosting source/base: `5090b7ef1e02562c4f0d873d2172a594df4ab29f`.
- Full eight-path delta SHA-256:
  `53700a5e2119594dc802a7c1fd83471c87073783192a2f185df19a905de49a60`.
- Upload module SHA-256:
  `a64f8889eec9256f4716b80d9ef6d5f870bc5d5881a2ceb8e1040be7375e5329`.
- Deployment configuration SHA-256:
  `39dd362796e79689f0afe1516cc0203b938b9f76cc964ac937d724e46bdeec5a`.

Paths relative to the clean product are
`cloudflare/tmp/listening-probe-hotfix-20261027/upload-bundle/worker.js` and
`cloudflare/tmp/listening-probe-hotfix-20261027/upload-release.wrangler.json`.
Their bytes and clean source/tree/full delta were independently remeasured
when populating this profile. Source/configuration/production environment,
unchanged service modules and rules retain their exact existing pins.

Retain upload recovery version `e375af21-3936-4c3f-8967-95a82b2b7d55`
and its previous module SHA-256
`a87f00b21c94642104f47cadf8e9ecf34996da751b767c1e547a7c2272d10f88`.
The full recovery version is authoritative in `release-listening-probe-pins.mjs`;
do not execute a rollback using an abbreviated identifier. Recovery does not
reverse R2/database writes or establish that missing original bytes exist.

The compatibility review must bind this candidate, observed Hosting source and
fresh manifest fingerprint. Carried hotfix obligations are retained; changed
historical tooling paths need their exact sorted-path successor rationale.
No Hosting release is part of this correction, even after postupload PASS.

## Worker activation — 27 October 2026

Native postupload assessment returned PASS at 11:27:42 UTC for source
`25861289735ff13b954b4ecb5bd64c1336a38151`, profile `probe-hotfix`, scope
`upload-worker-only`, `hostingReady: false`. Active Upload Worker version is
`b2ae0aa6-53e2-4f6e-adf1-265fdcf7a3f1`, exact module SHA-256
`a64f8889eec9256f4716b80d9ef6d5f870bc5d5881a2ceb8e1040be7375e5329`.
Other qualified Workers, rules, bindings and schedules remained unchanged.
Receipt: `tmp/release-receipts/listening-probe-postupload-20261027.json` in
the product checkout. Hosting remained source `5090b7ef`; no Hosting deployment
was performed for this correction. Live feature acceptance is recorded in
`2026-10-27-listening-live-acceptance.md`.
