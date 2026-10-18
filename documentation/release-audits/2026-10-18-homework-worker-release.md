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
