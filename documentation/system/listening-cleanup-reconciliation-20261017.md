# Listening temporary cleanup: historical reconciliation and closure

Current decision, 2026-10-27: **RETIRE PR #151; do not port its immediate-delete,
writer-reservation or scheduled-sweep implementation.** The historical review
below is preserved. Its missing endpoints are not release gates for the current
durable-audio architecture. See [the closure decision](#2026-10-27-closure-decision).

Historical status: **NOT MERGED INTO THE LIVE RECONSTRUCTION**. The seven origin/main-only commits establish a separate historical implementation; ancestry does not establish that its behavior belongs to the currently deployed app. No deployment proof tying this cleanup implementation to the October 6 live release was established during this review.

The reconstructed candidate at `7a44284efae29be0762f0bdc55692db90ff26475` preserves the October 6 source donors. Read-only inspection found that this candidate lacks the cleanup-specific cancel-session HTTP route/client, uploader AbortSignal propagation and builder cleanup lifecycle, leased bounded sweep module/checkpoints, and cleanup tombstone lifecycle from the main-only chain. That is a source comparison, not a production defect or evidence that these changes should be deployed.

The separately retained commits are `db6845c5`, `6658ddf8`, `bdd35ec3`, `653f7c92`, `ba2c7835`, `69754098`, and merge `3d72f11c`. The historical design keeps the sweep disabled by default and removes raw object keys from cleanup tombstones. Any future reconciliation must preserve those controls, compare later Listening/storage changes, and review Worker routes/bindings, RTDB rules and ancestor boundaries, backup/restore handling, client lifecycle, and tests together. Do not replace shared Worker, rules, or storage files wholesale with their historical versions.

No source, configuration, security rules, Functions output, backup/restore implementation, dependency tree, backend data, or remote service was changed for this review. No functional tests, Worker dry-run, emulator tests, or browser flows were executed because this slice records pending work only. Fresh live evidence is required before selecting implementation or deployment work.

## Exact historical net scope

Generated from `git diff --name-only db6845c5^ 69754098`; the merge adds no separate implementation beyond this 48-path net change. These paths are an inventory, not an apply/staging allowlist.

- `cloudflare/src/upload-worker/listening-authoring/repository.ts`
- `cloudflare/src/upload-worker/listening-upload-session-contract.ts`
- `cloudflare/src/upload-worker/listening-upload-session-grant.ts`
- `cloudflare/src/upload-worker/listening-upload-session-repository.ts`
- `cloudflare/src/upload-worker/listening-upload-session-sweep.ts`
- `cloudflare/src/upload-worker/listening-upload-session-types.ts`
- `cloudflare/src/upload-worker/listening-upload-session.ts`
- `cloudflare/test/listening-authoring-worker.test.ts`
- `cloudflare/test/listening-upload-session-bridge.test.ts`
- `cloudflare/worker.js`
- `cloudflare/wrangler.jsonc`
- `database.rules.json`
- `documentation/architecture/upload-storage-authority.md`
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md`
- `functions/lib/listening-authoring/repository.firebase.js`
- `functions/lib/listening-authoring/repository.firebase.js.map`
- `functions/lib/listening-authoring/repository.firebaseLegacyFirstEdit.js`
- `functions/lib/listening-authoring/repository.firebaseLegacyFirstEdit.js.map`
- `functions/lib/listening-authoring/repository.firebaseLifecycle.js`
- `functions/lib/listening-authoring/repository.firebaseLifecycle.js.map`
- `functions/lib/listening-authoring/repository.firebasePublish.js`
- `functions/lib/listening-authoring/repository.firebasePublish.js.map`
- `functions/lib/listening-authoring/repository.firebaseVersions.js`
- `functions/lib/listening-authoring/repository.firebaseVersions.js.map`
- `functions/lib/listening-authoring/repository.shared.js`
- `functions/lib/listening-authoring/repository.shared.js.map`
- `functions/src/listening-authoring/repository.firebase.ts`
- `functions/src/listening-authoring/repository.firebaseLegacyFirstEdit.ts`
- `functions/src/listening-authoring/repository.firebaseLifecycle.ts`
- `functions/src/listening-authoring/repository.firebasePublish.ts`
- `functions/src/listening-authoring/repository.firebaseVersions.ts`
- `functions/src/listening-authoring/repository.shared.ts`
- `r2-backup-worker/src/backup/auto-backup.test.ts`
- `r2-backup-worker/src/backup/auto-backup.ts`
- `r2-backup-worker/src/restore/restore-execute.test.ts`
- `r2-backup-worker/src/restore/restore-execute.ts`
- `src/__tests__/security/prd0056a-upload-session-rules.emulator.test.ts`
- `src/__tests__/security/prd0058-media-asset-rules.emulator.test.ts`
- `src/features/assessment/listening/storage/listeningUploadSessionApi.ts`
- `src/services/r2Storage.test.ts`
- `src/services/r2Storage.ts`
- `src/services/r2UploadClient.test.ts`
- `src/services/r2UploadClient.ts`
- `src/skills/listening/builders/ListeningTestBuilder.test.tsx`
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
- `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`

## 2026-10-27 closure decision

The released repair separates temporary uploads from saved audio. Uploads use
`temp/listening/`; save/publish copies and verifies bytes under
`assessment-assets/listening/`, persists the canonical reference, then marks the
asset committed before deleting the temporary source. Existing homework keeps
its immutable published version and audio authorization.

Native Wrangler 4.103.0 readback of `kahoot-media` on 2026-10-27 found the
already-enabled `expire-temp-prefix-after-one-day` rule: prefix `temp/`, object
age 86,400 seconds. The default seven-day incomplete-multipart abort rule also
remains enabled. No bucket policy was added, narrowed or replaced; shared
PDF/Book behavior is unchanged. Upload-session eligibility is eight hours and
upload grants last ten minutes.

Fresh native readback at 14:16:53 UTC confirmed Hosting source `5090b7ef`,
Upload Worker version `b2ae0aa6-53e2-4f6e-adf1-265fdcf7a3f1` and Homework Worker
version `e9cac4c7-430a-4398-ba1f-72034c0fd45e`. All four restored Cambridge
recordings returned the expected durable-object sizes, audio MIME type and
readable bytes. The complete lifecycle-result JSON SHA-256 was
`c2bc77b791c881a3ef9107a8bae194415781340d37eee76878a41fead7b91fc4`.

An abandoned or late-finishing PUT can create only a temporary object. It ages
out under the existing provider rule without a writer reservation, tombstone,
application sweep or restore lock. Expiry is asynchronous; one day is the
eligibility threshold, not a guaranteed deletion deadline. A cancelled request
does not prove server-side write revocation or immediate byte removal. This
deliberately retires PR #151's immediate-deletion semantics rather than claiming
its cancel endpoint or scheduled sweep was implemented.

PR #151's ambiguous-writer recovery blocker belongs to that unreleased design.
It is avoided by not introducing the writer reservations. The current repair
does not enable durable-asset garbage collection or close the broader PRD-0058
reconciliation work; retained published/homework audio must not be deleted.

The [live acceptance record](../release-audits/2026-10-27-listening-live-acceptance.md)
contains the completed Cambridge playback, private text-mode saved result and
assignment-stability browser proof. This closure reuses those passed flows;
there is no new application, Worker, rules or Hosting release to invalidate
them. The recovery evidence location is recorded there. Provider readback is
retained in `tmp/listening-live-release-20261027/cleanup-closure-observation.json`;
it is metadata/stream-presence proof, not another full checksum or browser run.
