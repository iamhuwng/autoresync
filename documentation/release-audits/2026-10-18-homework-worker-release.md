# Isolated Homework Worker release packet

Preparation only. No merge, Worker deployment, production assignment creation,
rules/data mutation or Hosting deployment is recorded here. Listening cleanup,
PDF Book and the retained public feedback/design work remain separate.

## Exact release scope

- Target: Cloudflare account `e41db829dabe9993f03674afdfd56510`, existing
  `r2-backup-worker`.
- Candidate: clean `99bb3f073319c57f62b0889d7c0a98b054e06e95`, tree
  `6cebb25691f322fd811c0ab5dd6ccf113e71dfe5`, reviewed against
  `422b7323f85a5b235d387cd18b25a1b9f63df46a`.
- Prebuilt JS SHA-256:
  `6e4bb95e53191b1a32e361e044765c4d6da7d39764d0e904abcf8ddd82e4f7ed`.
- Deployment JSON SHA-256:
  `b699855244b5004f0f45316b6efb0cf487dc7a86fb68f14a5cf0aa4cec580983`.
- Baseline active version: `f37869c0-c597-41cc-893b-7f7652d80e41`, sole
  module `reading-release-candidate.mjs`, SHA-256
  `c789454458790c5fb0893952043a150b34cefa345c5b02b06c1f04edddad112b`.

Deploy only this prebuilt artifact. The main-based PR #150 Worker rebuild
contains an unrelated Book backup dependency delta and is excluded. The
candidate's complete changed-file list includes retained Functions source;
this packet authorizes no Functions release. Historical production Git
provenance is unknown. Reviewed code equivalence outside `resolveTarget`,
including the unchanged declaration move, is verified independently instead.

The correction resolves teacher-owned roster aliases to Firebase UIDs and
deduplicates IDs with their aligned names. Existing live Reading assignment
ownership, material binding and `teacher_result_keys` behavior are preserved.
The baseline R2 binding, five plain variables, five secret names, compatibility
settings, weekly cron, workers.dev/preview state and absence of routes/custom
domains must remain unchanged. No secret value is printed or read back.

## Mandatory assessment

The generic Hosting observation cannot qualify this Worker. Use the shared
checker's fixed `--observe-homework-worker` route, which accepts only the
candidate, base, tree, bundle and configuration above. It performs fresh fixed
provider GETs; supplied JSON cannot produce trusted evidence. Complete source
paths and their classified services remain in the receipt even though only the
pinned Worker artifact is assessed. Other candidates cannot use this route to
suppress affected services.

```powershell
node <stable-checkout>/scripts/release-check.mjs `
  --cwd <clean-service-candidate> --mode release `
  --base 422b7323f85a5b235d387cd18b25a1b9f63df46a `
  --observe-homework-worker --worker-bundle <reviewed-index.js> `
  --worker-config <reviewed-deploy.json> --json `
  --receipt tmp/release-receipts/homework-worker-<unique-stamp>.json
```

Require a successful exit and fresh `PASS` from the shared checker, independent
review and separate production authorization. Revalidate immediately before
execution. The configured `main` must resolve to the same reviewed bundle.
No stale receipt is sufficient. The ignored operational preflight additionally
pins the actual x64 Node/Wrangler runner and exact no-bundle dry-run output.

Operational files are in the canonical ignored
`tmp/deployment-audit-20261017/`: `homework-service-preflight-plan.md`,
`homework-service-preflight.mjs`, the reviewed deployment JSON and exact bundle.
The plan contains prepared deploy/readback/rollback commands. Its earlier
separate technical PASS does not override an UNVERIFIED shared assessment.

## Verification and limits

The isolated candidate passed 92 backup tests and 8 submit-core tests. PR #150
passed fresh-runner installation, 93 backup tests and its nondeploying build.
Authenticated local Teacher assignment and Student Writing launch, outsider
list/protected-payload denial, aligned recipient replay and JWT/role rejection
are documented in [the qualification record](2026-10-18-remaining-nonbook-work.md).
Those browser checks used disposable Firebase and fixture JWT/provider adapters.

Real Google-issued tokens, production assignment writes, new notification
delivery, submission/grading and provider execution remain unverified. Existing
ordinary assignment metadata is readable by signed-in accounts under unchanged
Firestore rules; the student detail preview also retains private-authoring
permission errors. These are recorded limitations, not erased by release PASS.

After an authorized deployment, independently require one new active version
at 100%, exact candidate module bytes and unchanged bindings/settings/routes/
schedule. The old-baseline assessment intentionally rejects a new active
version; it is not the postdeployment success check. Rollback to the baseline
version is prepared but unrehearsed and cannot undo assignment data writes.

## Recorded shared-gate result

The actual shared-checker command returned exit 0 and **PASS** at
`2026-10-18T07:15:19.405Z`, after 11 fixed provider GETs. The generated receipt
is `tmp/release-receipts/homework-worker-native-20261018-0717.json` under the
selected clean service candidate, with observation fingerprint
`d5a8107d96b6855bf7205a3c136072c711d28defee65950f3610493e78c4f2e0`.
The receipt preserves all ten source paths, original service classifications,
exact artifact/configuration pins and unknown historical live Git provenance.

The final deployment/checker/observer suites pass **77 tests**, with none
skipped. Applicable assessment guardrails, UTF-8 and diff checks pass.
Independent review found no actionable defect in the native observation,
fixed scope, trust boundary or receipt routing. The CLI's `--cwd` receipt path
was corrected and covered by a regression test. These are preparation and
read-only provider proofs; no deployment or production data write occurred.

## Authorized deployment — October 18, 14:21 Asia/Bangkok

The owner explicitly approved PR #150 merge and the isolated Worker release.
PR #150 merged as `3420776075a350fc1d9b943c9feedc667408f97c`; local main was
fast-forwarded to the same GitHub revision with a clean worktree. Its four
main-branch workflows passed. The deployed artifact remains the isolated
`99bb3f07` bundle above, not a rebuild of main.

Fresh native and tool-pinned preflights passed immediately before execution.
Wrangler 4.103.0, through the existing Windows x64 Node 22.17.1 runtime,
deployed the reviewed configuration with `--no-bundle --keep-vars`. New active
version **`6aa7ac0f-7ccb-4c37-a20c-e6788bd6dd25`** receives **100%** of traffic.
Independent provider readback confirms its sole module has exact SHA-256
`6e4bb95e53191b1a32e361e044765c4d6da7d39764d0e904abcf8ddd82e4f7ed`.

Effective bindings and variable fingerprints, five secret names/types, runtime
settings, weekly schedule, workers.dev/previews, account subdomain, custom
domains and routes match preflight. The expected `workers/message` annotation
records the approved release message; this metadata addition is checked
explicitly rather than ignored. Secret values were preserved, not inspected.

Postdeployment verification passed at `2026-10-18T07:23:11.044Z`. Missing-auth
requests to Homework assignments return 401 and Reading submission returns 403;
source tracing confirms both reject before database access. These probes create
no assignment or result. The Hosting manifest still identifies `091a1746` / tree
`af587f18`; no Hosting, Firebase rules/data, other Worker or storage-object
deployment was performed. Authenticated production assignment, notice delivery,
grading and rollback remain unexercised.

An initial local guard stopped before deployment because PowerShell converted
a JSON UTC timestamp to a DateTime and reparsed its zone-less display as local
time. Direct DateTimeOffset conversion preserves the UTC instant; the corrected
guard passed fresh evidence before the single Worker deployment. This was an
operator harness failure, not a product regression.

Canonical ignored evidence: `homework-authorized-deploy-20261018-072124-105.log`,
`homework-authorized-preflight-20261018-072124-105.json`,
`homework-provider-read-2026-10-18T07-22-08-116Z.json`,
`homework-service-preflight-routing.json`, and
`homework-authorized-postverify-2026-10-18T07-23-11-044Z.json`. The native receipt
is under the clean service candidate at
`tmp/release-receipts/homework-authorized-20261018-072124-105.json`.
The old-baseline observer intentionally rejects this new version. Prepare fresh
provider observations for subsequent changes; reuse neither its old PASS nor a
main-based Worker build as automatic release authority.

## Subsequent controlled production QA

The owner later approved one production THCS assignment and one test attempt.
Assignment creation, launch, submission, 100% grading, teacher score projection,
student completion notice and teacher submission notice succeeded. Student
assignment notice and teacher full-result access failed. Fresh diagnosis is
recorded in [the QA follow-up](2026-10-18-homework-production-qa.md); the previous
unexercised statements above retain their deployment-time scope. No additional
deployment follows from this QA, and the two failures block full acceptance.
