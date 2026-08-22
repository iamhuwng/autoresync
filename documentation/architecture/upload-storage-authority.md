# Upload And Storage Authority

Status: Active
Last Updated: 2026-07-07
Owner: Frontend Platform

## Decision

All active user-facing file uploads use Cloudflare R2.

Google Drive is obsolete across all product features. It is not an approved upload, import, streaming, playback, validation, or compatibility path.

Retired-feature authority: `documentation/architecture/retired-features-current-state.md`.

Required product truth:

```text
new uploads -> Cloudflare R2
Google Drive -> obsolete implementation residue
```

## Browser Endpoint Policy

Decision date: 2026-07-07

Firebase Hosting serves the static React application. It is not the upload backend and it does not proxy Listening/R2 upload traffic.

Current production frontend:

```text
Firebase project: temp-a1437
Hosting target: kahut1
Hosting URL: https://kahut1.web.app
```

Current upload/listening Worker:

```text
Cloudflare Worker: r2-upload-signer
Worker URL: https://r2-upload-signer.iamhuwng.workers.dev
```

All browser app builds, including local Vite runs and Firebase Hosting builds, must use the deployed Worker URL for R2 upload, Listening authoring, upload-session, live-delivery, solo-delivery, and result-review delivery calls unless an explicit non-local replacement Worker URL is intentionally supplied for a controlled test.

The browser app must not fall back to `http://localhost:8787`. That local Worker URL is obsolete for app/runtime configuration. It may remain only in Worker-local contract tests, e2e fixtures, or manual Worker development notes that are clearly scoped to local Worker testing. Real users opening Firebase Hosting resolve `localhost` to their own computer, so a hosted bundle containing `localhost:8787` would break uploads for them.

The 2026-07-07 teacher-lobby upload incident confirmed the failure mode: the Audio step surfaced `Failed to upload audio file. Please try again.` because the app targeted `http://localhost:8787`, nothing was listening there, and local Wrangler/workerd could not run on this Windows ARM64 machine (`Unsupported platform: win32 arm64 LE`). Remote Worker CORS accepted `http://localhost:5173`, so the approved repair was to use the deployed Worker endpoint everywhere in browser app configuration.

Current app endpoint source owners:

- `src/services/r2WorkerEndpoint.ts` owns `DEFAULT_R2_UPLOAD_WORKER_URL`.
- `src/services/r2UploadClient.ts` resolves `VITE_R2_UPLOAD_WORKER_URL`, then falls back to the deployed Worker.
- `src/features/assessment/listening/authoring/listeningAuthoringWorkflow.ts` resolves `VITE_LISTENING_AUTHORING_WORKER_URL`, then `VITE_R2_UPLOAD_WORKER_URL`, then the deployed Worker.
- Listening upload-session, live-delivery, solo-delivery, and result-review clients must follow the same deployed-default policy.

Required browser env values for local dev and Firebase Hosting builds:

```env
VITE_R2_UPLOAD_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
VITE_LISTENING_AUTHORING_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
VITE_LISTENING_UPLOAD_SESSION_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
VITE_LISTENING_LIVE_DELIVERY_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
VITE_LISTENING_SOLO_DELIVERY_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
VITE_LISTENING_RESULT_REVIEW_DELIVERY_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
```

See `documentation/architecture/firebase-hosting-worker-endpoint-policy.md` for the shorter operational rule.

## Current Upload Authority

`src/services/r2Storage.ts` is the shared upload service for active audio, image, avatar, book-cover, course-announcement, and editor upload flows.

Listening authoring uploads audio through `r2StorageService.uploadAudioReplacement(...)`. Listening save/publish preserves the R2 temp-to-permanent lifecycle through `src/services/listeningTestStorage.ts`.

No active UI import of `src/services/googleDrive.js` was found during the 2026-06-19 source audit.

### Deployed Upload Worker Truth

PRD-0055 Task 2.11 deployed the hardened S0 upload Worker to production, Task 2.12 proved the current post-migration rollback/version-pin path, and Task 2.15 completed parent acceptance.

Current read-only production truth verified on 2026-06-25:

- Worker: `r2-upload-signer`.
- Active version: `11af545a-479b-4063-a899-d475dd57d2b5` at `100%`.
- Active deployment message: `PRD-0055 Task 2.12 restore hardened production version`.
- Hardened version message: `PRD-0055 Task 2.11 Phase C production Worker deploy`.
- Recovery version proven compatible during Task 2.12: `959065cd-8399-4000-b479-d8303a2f18ad`.
- Pre-S0 version `20dd8429-5be1-4105-baed-f6dc5af68098` is historical evidence only and is not a valid current Worker rollback target after Durable Object migration `v1-upload-grant-replay-ledger`.
- Required active bindings are present by name and shape: `UPLOAD_GRANT_SECRET`, `UPLOAD_GRANT_REPLAY_LEDGER`, `R2_BUCKET=kahoot-media`, `UPLOAD_RATE_LIMITER` at 30 requests / 60 seconds, `FIREBASE_PROJECT_ID=temp-a1437`, and `PUBLIC_URL`.
- The deployed S0 contract requires Firebase-authenticated upload/move authorization, verified owner identity, exact CORS origins, canonical prefix/path authority, opaque HMAC grants, replay protection, rate limiting, and the 50 MB per-request/per-file ceiling.

Task 2.15 parent acceptance re-ran local proof, read-only deployed Worker version/binding checks, deployed negative probes, one unique authorized upload/move/content proof, cleanup, and 404/API absence checks. It did not change lifecycle behavior, Worker code, Worker traffic, secrets, Firebase Hosting, Firebase auth, existing R2 objects, or Task 3 state.

### PRD-0056A Deployed Worker Bridge

PRD-0056A now has a deployed Spark-safe Worker-only bridge for Worker-local Listening upload-session and asset identity, owner-scoped `media_asset_upload_sessions/{ownerId}/{uploadSessionId}` bootstrap records written through Firebase RTDB REST, Worker-issued bridge upload grants, Worker-side `assetGrant` verification for canonical `temp/listening/{ownerId}/{uploadSessionId}/{assetId}-{sanitizedFileName}` keys, and compatibility retention for non-bridge S0 callers under `temp/listening-audio/{uid}/...`.

Current local proof includes functions compile, facade tests, executable RTDB emulator rules proof, focused Worker bridge tests, existing S0 Worker/security suites, immutable insecure-baseline RED proof, app build, and local Wrangler dry-run. The emulator RED cycle found and fixed an RTDB ancestor-rule inheritance issue that allowed root super-admin browser writes to mutate the bridge subtree, so `database.rules.json` now includes the minimal root `.write` narrowing required to keep `media_asset_upload_sessions/**` browser write-denied. Follow-up local hardening rejects browser-supplied lifecycle/session-record fields and zero-byte media contracts, preserves the Worker bridge `missing_size` 411 path when `Content-Length` is absent, keeps exact approved Worker bridge origins at `https://kahut1.web.app`, `http://localhost:5173`, and `http://localhost:5174`, and preserves an existing owner/idempotency-HMAC session if a concurrent create wins between query and write. Independent review on 2026-06-27 found three real blockers in the then-current candidate: dead `VITE_LISTENING_UPLOAD_SESSION_FUNCTIONS_URL` fallback in `src/services/r2Storage.ts`, dead focused Worker bridge coverage because `cloudflare/vitest.config.mjs` excluded `cloudflare/test/**/*.test.ts`, and stale authority wording around the root `.write` narrowing. Those blockers are corrected, focused reruns are green, and two corrective independent re-reviews on 2026-06-27 passed: spec/doc/rules boundary PASS and runtime/test-discovery PASS.

Current deployed/current truth recorded on 2026-06-27:

- Worker `r2-upload-signer` is active at version `3687d2e0-4718-4c0b-9c84-7f81749c31fb`, deployment `b0bb984c-e666-4535-9af0-85c354d75993`, at 100%.
- Version detail confirms `FIREBASE_DB_URL`, `FIREBASE_PROJECT_ID=temp-a1437`, `R2_BUCKET=kahoot-media`, Durable Object migration `v1-upload-grant-replay-ledger`, rate namespace `205512`, and secret bindings by name for `GOOGLE_SA_KEY`, `LISTENING_UPLOAD_SESSION_GRANT_SECRET`, and `UPLOAD_GRANT_SECRET`.
- Firebase RTDB rules are deployed for `media_asset_upload_sessions/**` owner-read/browser-write-denial plus the minimal root `.write` narrowing required to prevent ancestor-rule bypass.
- Deployed proof passed create-session, issue-asset, cross-owner issue denial, cross-owner upload denial, owner upload, owner RTDB read, browser RTDB mutation denial, public R2 content read with SHA-256 `8cb78897dbf5328c6a78c31684ac7c097aa4f7afd6707be70d659fce7cb29015`, and proof-object cleanup to 404.
- Recovery rehearsal passed by activating S0 recovery version `959065cd-8399-4000-b479-d8303a2f18ad` at 100% and restoring split bridge version `3687d2e0-4718-4c0b-9c84-7f81749c31fb` at 100%; post-restore create-session smoke returned 200.

### Spark-Tier Backend Routing

Firebase project `temp-a1437` intentionally remains Spark-tier. When a Listening storage or authoring capability needs trusted backend authority that Spark-tier Firebase cannot provide, the approved production alternative is Cloudflare Worker + Firebase RTDB REST + Cloudflare Worker secrets.

| Need | Approved route while Spark-tier is intentional |
| --- | --- |
| Firebase Auth identity | Browser obtains Firebase ID token; Worker verifies it before any trusted mutation. |
| RTDB browser access | Browser reads/writes only where RTDB rules explicitly permit owner-scoped access. |
| Trusted canonical mutation | Cloudflare Worker writes through Firebase RTDB REST using Worker-held service credentials. |
| Backend secrets | Cloudflare Worker secrets/bindings, not Firebase Secret Manager. |
| Object storage | Cloudflare R2. |
| Scheduled/reconciliation work | Cloudflare Worker scheduled/cron-style owner or approved local planner until separately deployed. |

Firebase Functions, Cloud Functions, Firebase Secret Manager, and Blaze-only scheduled backend paths are not production targets for PRD-0057 authoring, PRD-0058 lifecycle/reconciliation, or related Listening trusted mutations unless the product owner explicitly reverses the Spark-tier constraint. Existing `functions/src/listening-authoring/**` work, if retained, is reusable local/shared core and test evidence only, not production deploy authority. As of the 2026-06-29 selected-teacher proof, PRD-0057 authoring mutations have deployed/current Worker proof on `r2-upload-signer` version `34970bd6-feb7-4520-87f1-fa6341dc0ba0`; single selected-teacher Worker HTTP proof passed with artifact `output/prd0055-task5-selected-teacher-worker-proof/selected-teacher-worker-proof.json`; the authoring write flag was verified `false` afterward. Natural browser UI write proof, cleanup/deletion, private delivery, and reconciliation execution remain separate gates.

> Historical local-status snapshot before the 2026-06-29 authority-unblock gate:

- At that historical snapshot, Task 4.2 through Task 4.19 and parent Task 4.0 were complete locally after corrective unblock fixes. The then-current source included the bounded registry, commit, reference, lifecycle-intent, metrics, and rollback foundations described below. Task 5.1 through Task 5.15 were complete locally; Task 5.16 and later were still pending at that point. This paragraph is historical and is superseded by current status item 5 below.

Historical authority correction, 2026-06-29, later superseded by the Batch D closure packet: the A-C gate was blocked at that time because real Database Emulator startup rejected the legacy frozen-row rule at `database.rules.json:649:28` with `! only operates on booleans.` Frontend proof timed out once at `ListeningTestBuilder.test.tsx:187` during concurrent proof, then passed 14/14 standalone; timing sensitivity remains a proof-risk note for broader concurrent runs.

### Remaining Lifecycle Gaps

Current code does not yet satisfy the retention contract below:

- current authoring UI has not yet been rewired to expose the new replacement-safe helper; Task 5 must consume it before user-facing replacement is enabled;
- legacy temp-to-permanent movement can leave a saved record using an expiring temp URL when canonical bridge metadata/committer is absent;
- Listening test deletion removes the RTDB record but does not remove its R2 audio;
- abandoned/cancelled upload cleanup now has local intent helpers, but no deployed trusted cleanup executor or authoring event wiring exists yet;
- no deployed Listening-specific trusted delete endpoint, durable cleanup runner, or replacement/cleanup-specific authoring UI controls currently exist; Task 6 Batch A adds local deletion-governance planning/tests for a separate audited administrative operation, Task 6 Batch C adds local dry-run historical inventory plus local backup-governance tests, Task 6 Batch D adds local authorized-delivery/result-review client and Worker route proof, Task 6 Batch E adds local rollout/metrics/rollback proof without cleanup execution or remote mutation, Task 6 Batch F records independent verification plus parent acceptance after owner acceptance and read-only Firebase shallow proof for the no-op selected-teacher media reconciliation sample, and PRD-0055 Task 8/9 closure work now has deployed Worker/Hosting proof for live private delivery issuer routes without final selected/percentage/full rollout acceptance;
- the 2026-08-23 recovery integration restores a local upload-session cleanup executor and scheduled-event hook, but canonical Wrangler configuration keeps the sweep explicitly disabled. The dormant implementation is not deployed/current cleanup proof. Activation requires direct sweep checkpoint/lease/retry/limit/final-record tests, reconciled cutoff and rollout authority, emulator-backed rules proof, restore/deletion proof, and separate deployment/remote-mutation approval;
- the one-day `temp/` lifecycle rule is represented in checked-in R2 configuration and local verification, but it has not been deployed in this no-deploy packet;
- durable cleanup execution, rollback-grace execution, and replacement/cleanup-specific authoring UI consumption remain unimplemented. Task 5 Batch C now consumes the trusted authoring workflow for Save draft and Publish UI locally, without selected-teacher rollout or deployment. Task 4.15 local code added metrics sink wiring, threshold metadata, and product-owner accepted-risk approval for known untracked permanent audio as legacy-only risk. Task 4.16 local code added rollback controls, but no rollout switch was deployed. The corrective Task 4 foundation patch added fail-closed temp URL persistence, committed retry reverify, and reconciliation queueing without deploying cleanup execution. Task 6 Batch A local code adds deletion-governance tests/planning for pending-delete-to-deleted, immediate reference recheck, 90-day metadata-only tombstones, and separate audited admin deletion; it still does not delete objects or run cleanup. Task 6.3 local code adds bounded repository-backed dry-run hourly-temp and daily-pending-delete reconciliation with injected report/checkpoint persistence, selected-teacher proof gating, object/R2/Firebase/wall-clock/cost budgets, capacity-stop aborts, no continuation after abort, same-tick pending-delete reference recheck, and fail-closed owner/reference/rollback/backup guards. Task 6.4 local code adds dry-run/report-only historical orphan inventory with retained-reference exclusion and accepted-risk records but no production inventory or deletion. Task 6.5 local `r2-backup-worker/` code adds audio-object backup governance, restore authority checks, GDPR/permanent-delete filtering, backup-copy live-reference exclusion, and a local drill while preserving Task 4 registry backup/restore acceptance. Task 6 Batch D local code adds trusted-server authorized delivery issuance, result-review resolver proof, default saved-result client/Worker route authority, saved-result core consumption, and browser range proof for result review only. Task 6 Batch E local code adds a rollout evaluator for accepted selected-teacher/result-review proof, Task 6 lifecycle metrics, and rollback result-review public fallback. Task 6 Batch F records independent verification, owner acceptance, read-only Firebase shallow proof, Task 6.13 parent acceptance, and parent Task 6.0 closure. PRD-0055 Task 8/9 closure work now adds deployed private delivery route/readback proof for live sessions (`/listening-delivery/live`, `/solo`, `/content`) and internal fixture API proof, but it still does not delete objects, mutate cleanup state, deploy a scheduled runner, complete selected/percentage/full rollout, prove final deployed/private browser role behavior, or rehearse controlled recovery/version pinning.

Treat these as implementation gaps for a later storage workstream, not as approved behavior.

Before adding any cleanup or standalone delete capability:

1. preserve the deployed S0 upload/move security contract;
2. require authenticated teacher/service identity for lifecycle operations;
3. validate owner, upload session, asset ID, retained references, allowed prefix, and operation;
4. reject arbitrary client-provided destination/delete keys;
5. scope CORS to approved application origins;
6. add negative tests proving cross-owner upload, move, overwrite, cleanup, and delete are denied;
7. prove cleanup cannot delete referenced audio and can recover safely after rollback/version-pin events.

## Listening Audio Retention Contract

Approved policy:

- keep audio referenced by a successfully saved draft;
- keep audio referenced by a published test, retained revision, or retained result contract;
- delete abandoned, replaced, failed, cancelled, and never-saved uploads;
- delete durable audio only after every retained reference is gone.

Upload alone does not create a retention right. An asset becomes durable only after the owning draft or published record saves successfully.

### Object States

```text
temp -> committing -> committed -> pending-delete -> deleted
```

- `temp`: upload completed, but no durable draft/test reference exists.
- `committing`: server is promoting the object during a save operation.
- `committed`: at least one saved draft, published test, retained revision, or retained result references the asset.
- `pending-delete`: no retained reference remains; object waits through a rollback grace period.
- `deleted`: object and registry tombstone cleanup completed.

### Key Strategy

New audio objects must use opaque immutable asset IDs.

```text
temp/listening/{ownerId}/{uploadSessionId}/{assetId}-{sanitizedFileName}
assessment-assets/listening/{ownerId}/{assetId}/{sanitizedFileName}
```

Rules:

- do not use teacher-provided titles as object identity;
- do not overwrite a committed object before a draft/test save succeeds;
- replacement uploads receive a new `assetId`;
- publish may reuse the same committed asset instead of copying bytes again;
- URLs are derived output, not object identity.

### Save And Commit Sequence

Draft save and publish use an idempotent asset-commit operation:

1. Validate authenticated owner, upload session, asset type, size, MIME type, and temp key.
2. Copy the temp object to its immutable durable key.
3. Verify durable object presence and expected metadata.
4. Write the saved draft/test record and asset reference.
5. Mark the asset `committed`.
6. Delete the temp source after durable state succeeds.

R2 and Firebase cannot provide one cross-system transaction. The asset registry and cleanup reconciler must repair partial states:

- durable object copied but DB save failed -> delete after unreferenced grace period;
- DB record written but finalization response lost -> retry commit idempotently;
- temp deletion failed -> prefix lifecycle rule deletes it later;
- repeated save request -> return the existing committed asset.

### Replacement Safety

Replacing audio must never mutate the currently saved asset before the new save succeeds.

Required sequence:

1. Upload replacement to a new temp key.
2. Keep current draft/test reference unchanged.
3. Commit replacement asset.
4. Save the new asset reference.
5. Remove the old reference only after save success.
6. Mark old asset `pending-delete` only when no other retained reference exists.

Cancelling or failing replacement leaves the saved audio unchanged. Replacement completion returns terminal state so a later replacement can start only after success, failure, or cancellation has resolved.

### Reference Registry

Implementation must maintain trusted asset metadata, either in a dedicated secured node or an equivalent indexed manifest:

```text
media_assets/{assetId}
  ownerId
  key
  kind
  state
  checksum
  size
  mimeType
  createdAt
  committedAt
  lastReferencedAt
  references/
    drafts/{draftId}
    tests/{testId}
    revisions/{revisionId}
    results/{resultId}
```

> Superseded by approved B2 Option B on 2026-06-20: the generic `tests/{testId}` and `revisions/{revisionId}` retained-reference examples above are historical. The binding reference contract is below.

```text
media_assets/{assetId}/references/drafts/{draftId}
media_assets/{assetId}/references/versions/{versionId}
media_assets/{assetId}/references/tests/{testId}
media_assets/{assetId}/references/results/{resultId}
media_assets/{assetId}/references/assignments/{assignmentId}
media_assets/{assetId}/references/sessions/{sessionId}
```

Rules:

1. `references/drafts/{draftId}` covers both `listening_authoring/drafts/{draftId}` and `listening_authoring/revision_drafts/{draftId}`; the reference record identifies the source record type/path.
2. `references/versions/{versionId}` is the canonical retained published-version reference.
3. `references/tests/{testId}` is legacy frozen version-1 compatibility only and is not created for new post-cutover versions.
4. Results, assignments, and sessions retain explicit immutable version authorization; knowing a test or asset ID alone grants no access.

If a new RTDB node or Firestore collection is used, implementation must add ownership rules, backup coverage, restore behavior, and emulator-backed rule tests under `documentation/rules/infrastructure.md`.

### Cleanup Policy

Cleanup uses two independent controls:

1. R2 prefix lifecycle:
   - apply expiration only to `temp/`;
   - default target: one day after upload;
   - never apply temp expiration rules to committed asset prefixes.
2. Metadata-driven durable cleanup:
   - process bounded, checkpointed batches;
   - delete only assets in `pending-delete` with zero retained references;
   - default rollback grace period: seven days;
   - re-check references immediately before deletion;
   - make deletion idempotent;
   - record reason, asset ID, owner ID, key, and timestamps.

Cloudflare documents prefix-scoped R2 object lifecycle rules and day-based expiration at:

- `https://developers.cloudflare.com/r2/buckets/object-lifecycles/`

Lifecycle expiration is a safety net for temp objects. It is not sufficient for durable reference cleanup.

### Required Cleanup Triggers

- upload abandoned without save -> temp lifecycle expiry;
- upload cancelled -> best-effort immediate temp delete, then lifecycle fallback;
- upload failed partway -> incomplete upload cleanup/lifecycle;
- replacement cancelled or save failed -> new temp object expires; old committed asset stays;
- draft deleted -> remove draft reference, then schedule deletion if reference count is zero;
- published test deleted or superseded -> remove only that reference; preserve asset while another retained record references it;
- save/publish rollback -> reconcile registry and object state before user-visible success;
- duplicate retry -> do not create duplicate durable objects.

### Security And Observability

- browser code must not receive unrestricted delete authority;
- trusted backend validates owner and canonical asset ID before move/delete;
- delete operations accept asset IDs, not arbitrary client-provided R2 keys;
- upload and move operations also require authentication, ownership validation, and prefix allowlists;
- lifecycle cleanup must preserve the deployed S0 upload/move authorization boundary and add separate trusted delete/cleanup authority;
- cleanup logs must not contain signed URLs, secrets, or raw file contents;
- metrics must include temp object age, commit failures, orphan candidates, deletion failures, reclaimed bytes, and assets blocked by live references.
- Task 4.15 local metrics sink is `media_asset_metrics/{metricEventId}`. Current local schema fields are `schemaVersion`, `metricEventId`, `createdAt`, `ownerScope`, `assetId`, `operation`, `outcome`, `reasonCode`, `stateBefore`, `stateAfter`, `sizeBytes`, `durationMs`, `attemptCount`, `runId`, `budgetName`, `budgetValue`, `thresholdName`, `thresholdValue`, and `stopAction`. Current RTDB rules also cover `media_asset_events/{eventId}` and `media_asset_sweeps/{sweepId}` with browser writes denied and no secret/raw-content fields allowed.
- Threshold detection is human dashboard review in the no-deploy Task 4 packet. Responsible role is `Frontend Platform / IELTS Assessment storage owner`; cadence is daily during internal and selected-teacher rollout and before each cohort expansion; evidence location is `media_asset_metrics/{metricEventId}` plus Task 4.15/5.21 findings.
- Default acceptable new untracked-draft-audio count is zero. The 2026-06-27 product-owner accepted-risk statement accepts only the known untracked permanent Listening audio baseline as legacy risk: tracked registry audio `1 object / 10 bytes`, known untracked permanent audio `2 objects / 50 bytes`, and new untracked draft audio `0 objects / 0 bytes`.

## Obsolete Source Residue

The following source references remain implementation residue, not supported product behavior:

- `src/services/googleDrive.js`
- `src/services/googleDrive.d.ts`
- `src/services/googleDriveAudio.ts`
- Google Drive branches in `ListeningTestBuilder.tsx` and `AudioPlayer.tsx`
- `DeprecatedAudioBadge` Google Drive handling
- Google Drive environment fields and comments
- stale `google-drive-audio`, `google-sign-in`, and Google Sign-In feature labels

Do not preserve, extend, test as a supported feature, or use these paths for new work. A separate cleanup task must inventory data dependencies and remove obsolete implementation safely.

## Approved Upload Session Transition Ownership

Decision reference: `PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20`.

`PRD-0056A Listening Upload Session Bridge` owns backend-issued `uploadSessionId`, backend-issued `assetId`, upload-session bootstrap, and transition to:

```text
temp/listening/{ownerId}/{uploadSessionId}/{assetId}-{sanitizedFileName}
```

Transition rules:

1. PRD-0056 S0 may keep `temp/listening-audio/{uid}/...` only as a temporary compatibility prefix for non-bridge callers.
2. Bridge-enabled callers use only `temp/listening/...`.
3. Existing old-prefix temp objects are not renamed or migrated; they expire through temp lifecycle cleanup.
4. PRD-0058 consumes bridge-issued identities and owns durable registry, commit, reference, cleanup, reconciliation, backup/restore, and delivery behavior.
5. The bridge must not modify `r2-backup-worker/**`; Reading V2 trusted submit and homework assignment routes remain protected.

Current deployed packet status, 2026-06-27:

1. PRD-0056A source, deployed Worker, deployed RTDB rules, Worker secrets by name, local/emulator proof, deployed/current proof, proof-object cleanup, and recovery rehearsal are all current for the Worker-only bridge.
2. The deployed proof found and corrected two live-only runtime gaps: unbound Worker `fetch` in the Firebase REST repository and missing empty-map fields from RTDB. Regression tests now cover both.
3. The Worker bridge source was split into `listening-upload-session-contract.ts` so `listening-upload-session*.ts`, `worker.js`, and `src/services/r2Storage.ts` remain within the PRD-0056A file-size contract.
4. Historical snapshot before the 2026-06-29 authority-unblock gate: Task 4.2 foundation gate/baseline preservation, Task 4.3 scope confirmation, the local Task 4.4/4.5 registry-foundation packet, the local Task 4.6/4.7/4.8 lifecycle/commit packet, the local Task 4.9/4.10/4.11/4.12/4.13/4.14 safety packet, the local Task 4.15 metrics/accepted-risk packet, the local Task 4.16 rollback-controls packet, Task 4.17 focused proof, Task 4.18 independent verification, Task 4.19 parent acceptance, parent Task 4.0, Task 5 Batch A, Task 5 Batch B, and Task 5 Batch C were recorded complete locally after corrective unblock proof with no deployment, cleanup execution, production alerting, private delivery, Task 5.16+ work, staging, commit, push, or remote-state mutation.
5. Superseding current status, 2026-06-29: Task 5.9 is reclosed after executable PRD-0057 RTDB emulator proof passed 5/5 with the process-local Temurin JDK. Task 5.16 through Task 5.19 are complete locally after the Batch E precondition correction added trusted discard/restore and published archive UI wiring, keyboard/lifecycle-pending proof, one repository-backed create-to-archive integration sequence, and parser regression repair. Task 5.20 through Task 5.23 and parent Task 5.0 are complete locally after focused authoring/service/rules reruns, browser/a11y teacher desktop/tablet proof, mutation-kill probes, internal-fixture rollout metrics, and independent clean re-review. Later 2026-06-29 proof deployed the Spark-safe PRD-0057 Worker backend, deployed current RTDB rules, configured Worker authoring secret by name, and passed a single selected-teacher Worker HTTP proof on version `34970bd6-feb7-4520-87f1-fa6341dc0ba0`; write flag was disabled afterward. No cleanup execution, production alerting, private delivery cutover, natural browser UI write proof, wider cohort rollout, solo/homework runtime, live runtime, `AudioPlayer.tsx`, Google Drive behavior, staging, commit, or push occurred.

## Documentation Rule

Current docs must describe uploads as R2-only.

Historical documents may retain original Google Drive text only when they carry an explicit notice that:

- the text is historical;
- Google Drive is fully obsolete;
- the text is not current product or architecture authority;
- implementation cleanup is deferred to a separate task.

## Related Authority

- `documentation/tasks/0018-prd-unified-audio-architecture.md`
- `documentation/tasks/tasks-0018-prd-unified-audio-architecture.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/0056a-prd-listening-upload-session-bridge.md`
