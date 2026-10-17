# Listening temporary cleanup: preserved pending reconciliation

Status: **NOT MERGED INTO THE LIVE RECONSTRUCTION**. The seven origin/main-only commits establish a separate historical implementation; ancestry does not establish that its behavior belongs to the currently deployed app. No deployment proof tying this cleanup implementation to the October 6 live release was established during this review.

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
