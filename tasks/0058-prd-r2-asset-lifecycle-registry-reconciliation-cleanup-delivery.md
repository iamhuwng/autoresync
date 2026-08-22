# PRD 0058: R2 Asset Lifecycle, Registry, Reconciliation, Cleanup, And Delivery

Status: Draft child PRD - B1 Option B bridge ownership, Task 1 planning, PRD-0055 Task 4 minimum storage foundation, Task 5 local authoring consumption, Task 6.1/6.2 local deletion-governance design/tests, Task 6.3 local reconciliation dry-run/report/checkpoint foundation, Task 6.4 local historical orphan inventory dry-run/report foundation, Task 6.5 local audio-object backup-governance design/tests, Task 6.6-6.8 local authorized delivery/result-review client and Worker route proof, Task 6.9-6.11 local rollout/metrics/rollback proof, Task 6.12 independent verification record, Task 6.13 parent acceptance, and parent Task 6.0 are accepted; cleanup execution, solo/live private cutover, production alerting, deployment proof, and remote-state mutation remain separately gated
Created: 2026-06-20
Task number: 0058
Parent PRD: `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
Parent task: Task 1.7 storage child-PRD portion only

## 1. Introduction / Overview

Current Listening audio upload uses browser-facing R2 temp upload plus a temp-to-permanent move call. Current saved records can still preserve a temp URL if that move fails. There is no durable asset registry, no heartbeat/lease model, no reference tracking, no private delivery, and no storage metrics/alerting sink dedicated to the lifecycle.

This child PRD defines the storage foundation that later Listening authoring, solo/homework runtime, live-session runtime, and result-review delivery work must depend on. It covers R2 asset lifecycle, trusted registry records, upload sessions, heartbeat eligibility, commit/replacement/reference rules, reconciliation, cleanup, backup/restore coverage, audit logging, metrics, and public-to-authorized delivery transition requirements.

Original Packet 1E scope was planning only. PRD-0055 Task 4 later implemented the minimum local storage foundation from this PRD without deployment, solo/homework runtime cutover, live-session cutover, Reading V2 runtime work, Google Drive cleanup, cleanup execution, private delivery, staging, commit, push, or remote-state mutation.

Recovery integration note, 2026-08-23: the Listening upload-session cleanup executor, scheduled-event hook, repository checkpoint/lease support, restore suppression, and local supporting tests are recovered as dormant implementation. Canonical `cloudflare/wrangler.jsonc` keeps `LISTENING_UPLOAD_SESSION_SWEEP_ENABLED` explicitly `false`; the hourly trigger therefore performs no repository, R2, or Firebase work by default. Re-enabling remains a separate rollout gate and requires direct orchestration tests for sweep checkpoint resume/reset, concurrent sweep-lease rejection, failed-candidate retry, owner/session limits, and final sweep-record/metric persistence, plus reconciled cutoff/rollout authority, emulator-backed rules proof, restore/deletion proof, and explicit deployment/remote-mutation approval. No live cleanup, deployment, or remote mutation is claimed by the recovery integration.

## 2. Goals

1. Make upload completion non-durable until explicit Save draft or Publish succeeds.
2. Define a trusted asset registry keyed by backend-issued immutable `assetId`.
3. Define temp upload sessions, same-tab heartbeat, multi-tab lease aggregation, and abandonment cleanup.
4. Define idempotent commit and replacement rules that never preserve expiring temp URLs as saved content.
5. Preserve existing public R2 playback while new registry records are introduced.
6. Define the future authorized-delivery contract without cutting over solo/live runtime in this PRD.
7. Define reference tracking so retained drafts, versions, results, assignments, and sessions keep required audio.
8. Define reconciliation, cleanup, tombstone, historical orphan sweep, and backup/restore governance.
9. Define security, authorization, audit, metrics, alert, rollout, and stop conditions.
10. Keep new behavior in bounded Listening modules behind existing compatibility facades.

## 3. User Stories

1. As a teacher uploading Listening audio, I want unsaved audio cleaned up if I cancel or abandon the edit so storage does not grow silently.
2. As a teacher saving a draft, I want saved audio to survive reloads and later publish attempts.
3. As a teacher replacing audio, I want the old saved audio to keep playing if the replacement fails or I cancel.
4. As a student, I want assigned Listening audio and result-review audio to keep working even when teachers edit later versions.
5. As a live-session teacher, I want future signed-delivery refresh failures to warn me before interruption risk, without pausing the session by themselves.
6. As a security reviewer, I want cross-owner upload, reference, overwrite, move, delete, and delivery issuance denied even when raw IDs or URLs are known.
7. As a disaster-recovery owner, I want registry metadata, references, tombstones, backups, restores, and scheduled backup cron proof before cleanup can delete objects.
8. As a junior developer, I want exact owned/protected files, data paths, stop conditions, tests, and rollout gates so implementation does not drift into runtime or Google Drive scope.

## 4. Functional Requirements

FR-001. Upload completion must not create retention intent.

FR-002. Temp uploads must be short-lived edit-turn assets.

FR-003. Only explicit successful Save draft or Publish may create a retained audio reference.

FR-004. Unsaved edit-turn audio must never become durable.

FR-005. Temp assets must enter R2 under an owner-scoped temp key:

```text
temp/listening/{ownerId}/{uploadSessionId}/{assetId}-{sanitizedFileName}
```

FR-006. Durable assets must use an immutable asset key:

```text
assessment-assets/listening/{ownerId}/{assetId}/{sanitizedFileName}
```

FR-007. Object state must be exactly:

```text
temp -> committing -> committed -> pending-delete -> deleted
```

FR-008. The backend must issue immutable `assetId` values. Browser-generated file names, public URLs, raw object keys, and checksum values are never asset identity.

FR-009. Signed upload authorization must last no more than 10 minutes and must be scoped to one owner, one upload session, one asset, size limit, and allowed media contract.

FR-010. Upload grants must enforce 50 MB maximum per file.

FR-011. Storage must enforce 10 active audio files per test. The count includes every retained audio asset referenced by the current draft or revision, including section audio.

FR-012. Allowed audio formats are MP3, M4A, AAC, WAV, and OGG.

FR-013. Teacher guidance must recommend MP3 or M4A. Storage enforces data rules; UI copy remains authoring-owned.

FR-014. UI copy, when implemented by authoring work, must say `Up to 10 audio files, 50 MB each.` and must not advertise a 500 MB aggregate maximum.

FR-015. Strict validation before commit must check extension, declared MIME, magic bytes, decodability, file size, duration metadata, and checksum.

FR-016. Checksum is recorded for integrity and future analysis only. First-version deduplication is prohibited.

FR-017. Commit must be idempotent for retry/lost-response cases and must return the same durable asset for the same owner-scoped upload session and asset.

FR-018. Commit must verify durable object presence and expected metadata before any reference operation reports success.

FR-019. Commit must delete the temp source only after durable copy and registry/reference state succeed.

FR-020. Commit must fail closed if registry integrity, rule coverage, backup coverage, restore coverage, or durable object verification is unresolved.

FR-021. Save draft or Publish success must never be reported while persisted content points to `temp/` or any expiring temp URL.

FR-022. Replacement must use a new `assetId`.

FR-023. The old saved reference remains authoritative until replacement commit and the surrounding save operation both succeed.

FR-024. Failed replacement preserves old playback.

FR-025. Second replacement is blocked while the first replacement commit is unresolved.

FR-026. Cross-test reuse is not implied by matching file name, URL, key, checksum, or byte content.

FR-027. Cross-test reuse is allowed only through an explicit trusted registry-reference operation. If no workflow needs reuse in the implementation packet, reuse must be documented as an approved deferral.

FR-028. Public-delivery era records must persist canonical `assetId` plus derived public `audioUrl` and `streamUrl` for unchanged solo, live, result, and legacy readers.

FR-029. Authorized delivery must be requested by canonical `assetId`, not raw key or URL.

FR-030. Public R2 may remain during transition. Private R2 may activate only after proof gates pass.

FR-031. Authorized delivery URL lifetime target is 60 minutes.

FR-032. Refresh must begin when fewer than 10 minutes remain.

FR-033. The old URL must remain valid until replacement URL is ready.

FR-034. Delivery must support `Range`, `206 Partial Content`, `Accept-Ranges`, stable `Content-Length`, seeking, long playback, and iOS Safari proof.

FR-035. Refresh failure must warn teacher monitor before interruption risk.

FR-036. Refresh failure alone must not pause a live session.

FR-037. Delivery read authorization must allow only the owner or a student/result viewer with active retained authorization to the immutable test version.

FR-038. Known `assetId`, object key, public URL, or prior signed URL must never grant access by itself.

FR-039. Cross-user and cross-owner delivery issuance must be denied.

FR-040. Explicit remove, cancel, confirmed navigation away, logout, authentication loss, failed save/publish, replacement cancellation, and detected abandonment must queue immediate best-effort temp cleanup.

FR-041. Scheduled cleanup is fallback for crashes, disconnects, failed best-effort deletion, and hidden abandonment.

FR-042. Surviving uncommitted temp assets must be deleted no later than 24 hours after upload.

FR-043. Same authenticated editor tab heartbeat must run every 60 seconds only while the tab is open, connected, and authenticated.

FR-044. Heartbeat becomes stale after 3 minutes.

FR-045. Heartbeat cannot extend edit-turn eligibility beyond 8 hours from upload time.

FR-046. Heartbeat never creates a durable draft.

FR-047. Multi-tab lease aggregation is required. Closing one same-owner/same-draft tab must not delete audio still eligible through another valid lease or committed reference.

FR-048. Zero-reference durable assets must enter `pending-delete`.

FR-049. Default durable-delete grace is seven days.

FR-050. Cleanup must immediately recheck references before permanent object delete.

FR-051. Metadata tombstones must be retained exactly 90 days after durable delete.

FR-052. Tombstones must exclude signed URLs, secrets, keys usable as credentials, and audio content.

FR-053. Temp reconciliation must run at least hourly.

FR-054. Durable `pending-delete` reconciliation must run at least daily.

FR-055. Reconciliation must be bounded, checkpointed, idempotent, and authorized by trusted backend/service credentials unavailable to browser code.

FR-056. Reconciliation must define operation-count, cost, and wall-clock budgets.

FR-057. Reconciliation must abort and report when a budget is exceeded.

FR-058. Historical orphan sweep must run dry-run first.

FR-059. Historical orphan sweep must include past Listening-test deletions, pre-registry permanent audio, interim/failed rollout assets, and assets missing owner/reference evidence.

FR-060. Historical orphan deletion requires explicit approval after dry-run evidence. This PRD does not approve deletion by itself.

FR-061. Registry rules, indexes, backup, restore, and emulator tests must ship with the first registry implementation.

FR-062. `r2-backup-worker/` remains the disaster-recovery worker owner for registry backup/restore integration.

FR-063. Backup copies must not count as live product references.

FR-064. Existing scheduled backup cron must still succeed after registry coverage is added.

FR-065. An end-to-end restore drill must prove registry/reference/tombstone restore behavior before cleanup can delete durable objects.

FR-066. Metrics must cover commit failures, URL refresh failures, cleanup failures, authorization denials, reclaimed bytes, pending-delete counts, temp object age, orphan candidates, and references blocking deletion.

FR-067. Rollout must stop for data loss, wrong audio, cross-owner access, legacy incompatibility, unresolved restore coverage, cleanup failure above threshold, or mid-test interruption.

FR-068. Security logs must include actor, asset ID, operation, outcome, and reason.

FR-069. Logs must never include tokens, signed URLs, secrets, raw keys, raw audio, or raw content.

FR-070. Google Drive is out of scope. This PRD introduces no Google Drive migration, cleanup, deletion, playback change, or error state.

FR-071. Solo/live/private-delivery runtime cutover is out of scope. Live `AudioPlayer` internals remain Task 8.

FR-072. Result-review private-delivery integration is owned by PRD-0058 implementation Task 6. It must use the single `listeningAssetDelivery.service.ts` issuance/read-authorization contract and may adapt only the existing result-review surfaces named in section 27. PRD-0059 consumes this contract and must not create a second result-review resolver or issuance path.

## 5. Non-Goals / Out of Scope

1. Runtime/application/source implementation in this planning packet.
2. Cloudflare Worker code changes.
3. Firebase rule changes.
4. R2 lifecycle configuration changes.
5. `r2-backup-worker/` source changes.
6. Listening source changes.
7. Reading V2 source changes.
8. Test-source changes.
9. Deployment.
10. Solo/homework runtime child PRD.
11. Live-session runtime child PRD.
12. Reading V2 runtime child PRD.
13. Traceability matrix creation.
14. Google Drive cleanup, migration, deletion, playback removal, or new Google Drive behavior.
15. Private delivery cutover for production solo/live traffic. Result-review cutover is owned by this PRD/Task 6.
16. Live `AudioPlayer` internal refresh/source handoff implementation.
17. First-version deduplication.
18. Dashboard-only lifecycle configuration as final production authority.

## 6. Verified Current Storage Baseline

Current browser R2 service:

1. `src/services/r2Storage.ts` hardcodes the upload Worker URL and public R2 bucket URL.
2. `uploadFile(...)` always uploads to `temp/{folder}/{timestamp}-{file.name}`.
3. The browser requests a signed/upload URL by sending `POST ?filename=...`.
4. Public output is built from the public R2 URL and returned as `url`, `streamUrl`, and `directUrl`.
5. `moveToPermanent(...)` derives a non-temp destination key and posts `/move` with browser-supplied `sourceKey` and `destKey`.
6. On 404/405 or caught move errors, `moveToPermanent(...)` returns the temp URL/key and does not throw.
7. `uploadAudioReplacement(...)` can upload directly to an existing key, so current replacement can overwrite before surrounding save succeeds.
8. There is no registry, no heartbeat, no reference tracking, and no private delivery in `r2Storage.ts`.

Current checked-in upload Worker:

1. `cloudflare/worker.js` imports `AwsClient` from `aws4fetch`.
2. It uses S3-style R2 credentials and bucket identifiers.
3. It allows wildcard CORS.
4. `/move` accepts raw `sourceKey` and `destKey`, copies, then deletes source.
5. It signs upload URLs from browser-provided `filename`.
6. It returns a public `r2.dev` URL.

Current Listening persistence:

1. `src/services/listeningTestStorage.ts` imports `r2StorageService`.
2. `saveListeningTestToFirebase(...)` hard-blocks missing audio.
3. The save path promotes temp `audioUrl` / `streamUrl` by calling `moveToPermanent(...)`.
4. Move failures are caught and the save can continue with the unchanged temp URL.
5. The saved record writes directly to `tests/{testId}` and sets `isPublished: true`.
6. Updates merge into the same record with `set(...)`.
7. Delete removes the RTDB record but has no R2 reference cleanup.
8. There is no durable Listening draft reference model, no immutable asset reference model, and no upload-session model.

Current backup/restore/security anchors:

1. `r2-backup-worker/` owns current backup, restore, media-delta, retention, scheduled cron, and admin-auth Worker behavior.
2. Current media backup scans `audio/`, `images/`, and `avatars/`.
3. Current backup retention prunes history entries whose backup ZIP files expired; failed entries remain for less than 30 days.
4. Current GDPR restore filtering excludes `deleted_users` entries with `status === 'completed'`.
5. No registry-node backup or restore coverage exists today because no registry node exists.
6. `src/__tests__/security/prd0040-security.emulator.test.ts` is the real emulator-backed security-rule pattern.
7. `src/__tests__/security/firebaseRules.test.ts` is a contract-style test and is not sufficient emulator proof.
8. No dedicated storage lifecycle metrics/alerting sink exists. The only sink-like route found is diagnostic upload/fetch/purge in `r2-backup-worker/src/index.ts`; it is not a lifecycle metrics sink.
9. Packet 1I correction - 2026-06-20: `r2-backup-worker/src/index.ts` also routes `POST /api/reading-v2/submit` to `r2-backup-worker/src/reading-v2/submit.ts` and `POST /api/homework/assignments` to `r2-backup-worker/src/homework/assignments.ts`. `documentation/architecture/reading-v2-runtime-integrations.md` identifies the Reading V2 trusted submit route as the production-aligned backend. Any packet touching `r2-backup-worker/` has cross-feature blast radius beyond media backup.

## 7. Relationship To PRD-0056 S0 And PRD-0057 Authoring

PRD-0056 S0 dependency:

1. PRD-0056 selected native Cloudflare `env.R2_BUCKET` as the canonical upload-worker mechanism.
2. PRD-0056 selected checked-in Wrangler-managed source under `cloudflare/` as the deployment mechanism.
3. PRD-0056 rejected checked-in `aws4fetch`/S3 credential source as the future canonical mechanism.
4. PRD-0056 implementation is not complete. Storage lifecycle work must not assume S0 is deployed.
5. This PRD depends on S0 for trusted upload/move authority but does not implement S0.
6. If implementation starts and S0 deployed proof is missing or stale, storage implementation must stop before relying on secured upload/move behavior.

PRD-0057 authoring dependency:

1. PRD-0057 defines lenient Save draft, strict Publish, immutable versions, and revision drafts.
2. PRD-0057 blocks audio-bearing Save draft until the minimum storage foundation exists.
3. PRD-0057 does not choose storage paths, registry schema, heartbeat paths, cleanup paths, or delivery paths.
4. This PRD provides the storage foundation PRD-0057 must depend on.
5. This PRD does not implement authoring UI or draft/publish source changes.

## 8. Target Storage Architecture

Target flow:

```text
teacher upload request
  -> trusted backend validates owner/session/media contract
  -> backend creates assetId and upload session
  -> R2 temp object created
  -> heartbeat/lease keeps edit-turn eligibility only
  -> explicit Save draft or Publish calls commit
  -> backend validates bytes and registry state
  -> durable immutable object created and verified
  -> registry reference written
  -> public compatibility URL derived while public era remains active
  -> temp source deleted after durable success
```

Authority split:

1. Browser owns file selection and user intent only.
2. Backend owns asset IDs, object keys, upload grants, commit, references, cleanup, delivery issuance, and audit.
3. Firebase registry owns product reference truth.
4. R2 owns bytes only.
5. `r2-backup-worker/` owns backup/restore and scheduled reconciliation integration unless a later approved worker split supersedes it.
6. Packet 1I correction - 2026-06-20: because the same Worker entrypoint also serves Reading V2 trusted submit and homework assignment routes, storage packets touching `r2-backup-worker/src/index.ts`, shared Worker config, auth, routing, build, tests, or deployment must treat those routes as protected regression surfaces and cross-reference `documentation/architecture/reading-v2-runtime-integrations.md`.

Proposed, pending product-owner plus architecture/security approval - upload-session backend ownership gap:

1. Current PRD-0056 S0 keeps allowlisted temp prefixes such as `temp/listening-audio/{uid}/...` and explicitly forbids creating future registry target paths. Current PRD-0058 requires backend-issued `assetId` and target temp keys under `temp/listening/{ownerId}/{uploadSessionId}/{assetId}-{sanitizedFileName}`.
2. Option A - widen PRD-0058: PRD-0058 owns the upload-session backend surface that issues `assetId`, `uploadSessionId`, target temp keys, and commit-ready metadata after PRD-0056 S0. This would supersede PRD-0058 section 5 items 2 and 5 only for the upload-session backend surface, not for unrelated Worker code changes.
3. Option B - add a named bridging packet before PRD-0058 implementation: `PRD-0056A Listening Upload Session Bridge`, owning backend-issued `assetId`, upload-session creation, and the `temp/listening-audio/` to `temp/listening/` transition, while PRD-0058 consumes the result.
4. Required transition decision: either keep `temp/listening-audio/` as an S0-only compatibility prefix and introduce `temp/listening/` only after the bridge/storage backend is deployed, or migrate S0 to emit `temp/listening/` once the backend-issued upload session exists.
5. Recommendation: Option B, the named bridge, because it keeps PRD-0056 S0 strictly severable and gives the temp-prefix transition an explicit owner. Product owner plus architecture/security may instead approve Option A if PRD-0058 must own the same Worker/backend package. No option is selected until approval records owner, protected routes, tests, rollback, and the temp-prefix transition.

## 9. Asset Registry Model

The first registry implementation should use secured Firebase RTDB paths because current Listening persistence and rule tests are RTDB-centered.

Primary registry path:

```text
media_assets/{assetId}
```

Required registry fields:

```text
schemaVersion
assetId
ownerId
kind
state
uploadSessionId
currentKey
tempKey
fileName
sanitizedFileName
extension
declaredMimeType
detectedMimeType
sizeBytes
durationMs
checksum
checksumAlgorithm
createdAt
updatedAt
committingAt
committedAt
pendingDeleteAt
deletedAt
deleteAfter
tombstoneExpiresAt
lastReferencedAt
commitAttemptId
commitIdempotencyKeyHash
publicUrlCompatibility
deliveryMode
validation
references
leases
cleanup
```

Reference subpaths:

```text
media_assets/{assetId}/references/drafts/{draftId}
media_assets/{assetId}/references/tests/{testId}
media_assets/{assetId}/references/versions/{versionId}
media_assets/{assetId}/references/results/{resultId}
media_assets/{assetId}/references/assignments/{assignmentId}
media_assets/{assetId}/references/sessions/{sessionId}
```

`references/tests/{testId}` is legacy-version-1 compatibility only. New canonical authoring writes retain audio through `references/drafts/{draftId}` and `references/versions/{versionId}`; a new post-cutover version must not create a first-class `tests/{testId}` asset reference.

Lease subpaths:

```text
media_assets/{assetId}/leases/{leaseId}
```

The registry must reject client-authored raw keys as authority. `currentKey` and `tempKey` are backend-derived metadata only.

## 10. Object State Machine

States:

1. `temp`: bytes uploaded, no durable saved reference.
2. `committing`: backend is validating and copying temp bytes to immutable durable key.
3. `committed`: one or more retained references exist.
4. `pending-delete`: zero retained references remain and grace timer is running.
5. `deleted`: object removed or verified absent; metadata-only tombstone remains for exactly 90 days.

Allowed transitions:

```text
temp -> committing
committing -> committed
committing -> temp
committed -> pending-delete
pending-delete -> committed
pending-delete -> deleted
deleted -> deleted
```

Disallowed transitions:

1. `temp -> committed` without durable object verification.
2. `temp -> deleted` without best-effort cleanup/audit record.
3. `committed -> deleted` without `pending-delete`, seven-day grace, and immediate reference recheck.
4. `deleted -> committed`.

## 11. Upload Session And Temp Asset Model

Upload sessions are owner-scoped and edit-turn scoped.

Proposed session path:

```text
media_asset_upload_sessions/{ownerId}/{uploadSessionId}
```

Required session fields:

```text
schemaVersion
ownerId
uploadSessionId
draftId
testId
revisionId
createdAt
expiresAt
maxEligibilityExpiresAt
status
assetIds
leaseIds
lastHeartbeatAt
abandonmentReason
cleanupQueuedAt
```

Packet 1J supersession: the field list above is historical pre-bridge planning. The binding full session record extends the immutable PRD-0056A bootstrap contract:

```text
schemaVersion: 1
ownerId
uploadSessionId
purpose: "listening-authoring"
status
creationRequestIdHash
draftId?
testId?
revisionId?
createdAt
createdBy
expiresAt
maxEligibilityExpiresAt
lastGrantIssuedAt?
assetIds
assetRequests
bridgeVersion: "0056A-v1"
leaseIds
lastHeartbeatAt?
abandonmentReason?
cleanupQueuedAt?
completedAt?
```

Rules:

1. PRD-0056A creates the immutable identity/bootstrap fields and `status: "active"`.
2. PRD-0058 may add/update only lifecycle fields: `status`, `leaseIds`, `lastHeartbeatAt`, `abandonmentReason`, `cleanupQueuedAt`, and `completedAt`.
3. `draftId`, `testId`, and `revisionId` remain optional correlation fields; absence does not create or remove retention intent.
4. PRD-0058 must preserve `creationRequestIdHash`, `assetRequests`, `createdBy`, and `bridgeVersion`.
5. PRD-0058 cannot replace an issued `assetId`, change owner/session identity, or derive a different temp key.

Session status values:

```text
active
committing
completed
abandoned
expired
cleanup-queued
```

The upload session must not create a durable draft. It only records upload/edit-turn eligibility and cleanup state.

## 12. Heartbeat And Edit-Turn Eligibility

Heartbeat rules:

1. Same authenticated editor tab only.
2. Every 60 seconds.
3. Stale after 3 minutes.
4. Max eligibility is 8 hours from upload time.
5. Never creates a durable draft.
6. Stops on confirmed navigation, tab close where detectable, logout, auth loss, or disconnection.
7. Multi-tab lease aggregation is required.

Lease fields:

```text
leaseId
ownerId
assetId
uploadSessionId
draftId
tabIdHash
createdAt
lastHeartbeatAt
staleAt
maxExpiresAt
status
```

Cleanup may treat a temp asset as abandoned only when every lease is stale/closed and no committed reference exists.

## 13. Commit And Idempotency Model

Commit input must include:

1. Authenticated owner identity.
2. `assetId`.
3. `uploadSessionId`.
4. Commit operation kind: Save draft or Publish.
5. Idempotency key for the user action.
6. Expected current state.
7. Intended reference target.

Commit sequence:

1. Validate owner, upload session, lease eligibility, file count, file size, type, and temp key metadata.
2. Validate bytes: extension, declared MIME, magic bytes, decodability, file size, duration metadata, checksum.
3. Move registry state to `committing`.
4. Copy temp object to immutable durable key.
5. Verify durable object and metadata.
6. Write or verify registry reference.
7. Preserve/derive compatibility `audioUrl` / `streamUrl` while public delivery remains active.
8. Mark state `committed`.
9. Delete temp source only after durable success.
10. Return committed asset metadata.

Failure behavior:

1. If durable copy fails, keep asset `temp` or `committing` with retry metadata and fail closed.
2. If reference write fails, preserve previous saved reference and queue copied unreferenced object for reconciliation.
3. If response is lost after commit success, idempotent retry returns the committed asset.
4. If registry integrity or restore coverage is unresolved, fail closed before reference success.

## 14. Replacement Model

Replacement sequence:

1. Upload replacement to a new temp asset and new `assetId`.
2. Keep old saved reference active.
3. Block second replacement while the first replacement commit is unresolved.
4. Commit and validate the new asset.
5. Save the surrounding draft/version change.
6. Add new reference only when the save succeeds.
7. Remove old reference only after new reference save succeeds.
8. Move old asset to `pending-delete` only if retained references become zero.

Replacement cancellation:

1. Old reference remains authoritative.
2. New temp asset becomes cleanup candidate.
3. Immediate best-effort cleanup runs.
4. Scheduled fallback still deletes no later than 24 hours after upload.

## 15. Reference Tracking Model

References are deletion authority. Timestamps are not deletion authority.

Reference record fields:

```text
referenceId
referenceType
ownerId
assetId
targetId
versionId
createdAt
createdBy
sourceOperation
retentionReason
active
```

Reference types:

1. `draft`
2. `test`
3. `version`
4. `result`
5. `assignment`
6. `session`

Rules:

1. Adding a reference requires trusted backend authorization.
2. Removing a reference requires trusted backend authorization.
3. Deleting one reference cannot delete a multiply referenced asset.
4. Zero live references moves an asset to `pending-delete`.
5. Cleanup must re-read all reference indexes immediately before delete.

## 16. Draft, Version, Result, Assignment, And Session Reference Rules

Draft references:

1. Explicit successful Save draft creates retained draft references.
2. Unsaved edit-turn audio creates no retained reference.
3. Draft soft delete removes active draft reference only after recovery/retention governance allows.

Published version references:

1. Publish adds a retained immutable version reference.
2. Publish reuses committed draft asset by adding a published/version reference; it must not copy bytes again.
3. Published versions are immutable.

Result references:

1. Results reference immutable test versions.
2. The retained version keeps required audio.
3. Results do not own duplicate audio bytes.

Assignment/session references:

1. Assignments and live/homework sessions must remain pinned to immutable versions.
2. Archived tests retain audio while any retained version, revision, attempt, result, assignment, or session needs it.

## 17. Public-Delivery Compatibility Window

During public-delivery era:

1. New writes persist canonical `assetId`.
2. New writes also persist derived public `audioUrl` and `streamUrl` for unchanged solo/live/result readers.
3. Legacy raw public R2 URL records remain readable through adapters.
4. On-read migration is prohibited.
5. Public delivery remains until private-delivery proof gates pass.
6. Storage rollback must preserve old and new readers until compatibility proof completes.

## 18. Authorized Delivery Model

Authorized delivery target:

1. Browser requests delivery by `assetId`.
2. Trusted backend resolves asset, references, and caller authorization.
3. Backend issues a short-lived URL only after authorization succeeds.
4. Initial lifetime is 60 minutes.
5. Refresh starts with fewer than 10 minutes remaining.
6. Old URL remains active until replacement is ready.
7. Private R2 activation waits for public/private compatibility, range, long playback, refresh, iOS Safari, mobile, and no-mid-test-interruption proof gates.

Authorized delivery must be implemented in review-sized PRD-0058/Task-6 integration packets after registry, authorization, range, backup/restore, and rollback gates pass. Result-review is the first owned consumer. Solo and live remain later PRD-0059/PRD-0060 consumers and must not duplicate issuance or resolver ownership.

## 19. Delivery Read Authorization

Allowed callers:

1. Asset owner.
2. Student/result viewer with active retained authorization to the immutable test version.
3. Service/admin account only through audited administrative paths.

Denied cases:

1. Caller knows `assetId` but lacks reference authorization.
2. Caller knows raw key.
3. Caller knows public URL.
4. Caller has prior signed URL after authorization changes.
5. Caller owns a different test.
6. Caller is another teacher without shared retained authorization.
7. Caller is unauthenticated.

Cross-user issuance denial must be tested locally and in deployed proof before private cutover.

## 20. Byte-Range, Refresh, And Browser Playback Contract

Delivery must prove:

1. `Range` request accepted.
2. `206 Partial Content` returned for byte ranges.
3. `Accept-Ranges` present.
4. Stable `Content-Length` present.
5. Browser seeking works.
6. iOS Safari playback works.
7. Long live-session playback survives initial URL lifetime and refresh.
8. Refresh under 10 minutes works without source interruption.
9. Refresh failure warns teacher monitor before interruption risk.
10. Refresh failure alone does not pause live session.

Task 8 owns `AudioPlayer` internal refresh/source-handoff changes.

## 21. Cleanup And Reconciliation

Temp reconciliation:

1. Runs hourly.
2. Finds stale temp assets, stale leases, expired upload sessions, abandoned uploads, failed-save leftovers, and replacement-cancelled temp assets.
3. Deletes temp objects no later than 24 hours after upload.
4. Writes audit and metrics events for deletion outcome.

Durable reconciliation:

1. Runs daily.
2. Finds `pending-delete` assets past seven-day grace.
3. Rechecks references immediately before delete.
4. Deletes only zero-reference durable objects.
5. Writes 90-day metadata tombstone.
6. Aborts and reports on budget exceed.

Budget requirements:

1. Operation count per run.
2. R2 list/read/write/delete count.
3. Firebase read/write count.
4. Wall-clock limit.
5. Cost estimate threshold.
6. Checkpoint cursor.

## 22. Historical Orphan Inventory And Sweep

Historical orphan sweep must:

1. Run dry-run first.
2. Inventory pre-registry permanent Listening audio.
3. Include assets left by past Listening-test deletions.
4. Include assets from interim or failed rollout attempts.
5. Include assets missing owner/reference evidence.
6. Exclude all assets with retained references.
7. Exclude backup copies as live product references while still preserving backup governance.
8. Produce owner/reference evidence and uncertainty classification.
9. Require explicit approval before deletion.
10. Preserve rollback evidence and tombstone policy.

Unknown ownership blocks deletion until resolved or explicitly approved by a separate governance decision.

Current local Task 6.4 proof adds a dry-run/report/checkpoint-only historical inventory foundation. It classifies past Listening-test deletion leftovers, pre-registry permanent audio, interim/failed rollout objects, missing owner evidence, and ambiguous owner evidence; excludes retained references; records accepted-risk-required entries for unresolved classes; enforces object/list/copy/delete/cost/wall-clock budgets; and keeps copy/delete counts at zero. It does not use production/R2 inventory access and does not approve or execute deletion.

## 23. Backup, Restore, Tombstone, And Deletion Governance

Current owner:

1. `r2-backup-worker/` owns scheduled backup, media delta, backup history retention, restore, GDPR filter, and admin-auth Worker routes.
2. Current media backup scans `audio/`, `images/`, and `avatars/`.
3. Historical baseline before Task 4: registry-node backup coverage was missing because no registry existed. Current local Task 4 proof covers registry-path backup/restore, and Task 6.5 preserves that acceptance.

Required future governance:

1. Registry rules, indexes, backup, restore, and emulator tests ship with the first registry implementation.
2. DR worker owner is named as `r2-backup-worker/` unless an approved architecture update moves it.
3. End-to-end restore drill must restore registry state, references, tombstones, and deleted/retained distinction.
4. Existing scheduled backup cron must still succeed after registry coverage.
5. Backup copies do not count as live product references.
6. Tombstones retain metadata only for exactly 90 days.
7. Tombstones must exclude signed URLs, secrets, raw keys, and audio content.
8. Durable delete cannot activate until restore coverage is proven.

Current local Task 6.5 proof records `r2-backup-worker/` as the DR worker owner for this local design/test packet, preserves Task 4 registry backup/restore acceptance, proves backup copies are not live product references, filters GDPR-completed/tombstoned/permanently-deleted objects from restore/live retention, blocks teacher-role restore authority, marks permanent-delete resurrection as requiring an approved restore path, proves scheduled backup cron still succeeds, and performs a local backup/restore/deletion-filter drill. It does not run remote backup restore or object deletion.

## 24. Metrics, Alerts, Owners, And Rollout Stop Actions

Before the Task 4.15 local packet, no existing dedicated lifecycle metrics/alerting sink was found. The target implementation must add one secured sink before rollout.

Target secured sink:

```text
media_asset_metrics/{metricEventId}
```

Target metric event fields:

```text
schemaVersion
metricEventId
createdAt
ownerScope
assetId
operation
outcome
reasonCode
stateBefore
stateAfter
sizeBytes
durationMs
attemptCount
runId
budgetName
budgetValue
thresholdName
thresholdValue
stopAction
```

Owner model:

1. Storage owner: Frontend Platform / IELTS Assessment.
2. DR worker owner: `r2-backup-worker/`.
3. Security reviewer: required before S0-dependent rollout.
4. Human-watch cadence: daily during internal and selected-teacher rollout; before each cohort expansion.
5. Automated watch target: metric sink query or equivalent scheduled report. If this exact sink is rejected during rules/review, implementation stops until a concrete secured sink is approved.

Stop actions:

1. Commit failure above threshold: stop new storage writes.
2. Any wrong-audio event: stop rollout immediately.
3. Any cross-owner access or issuance: stop rollout immediately.
4. Cleanup deletion failure above threshold: stop cleanup, preserve objects, investigate.
5. Restore coverage failure: stop cleanup and private delivery.
6. URL refresh failure above threshold: keep public delivery, block private cutover.
7. References blocking deletion spike: stop durable cleanup and inspect indexes.
8. Budget exceed: abort run, preserve checkpoint, report.

Task 4.15 local status, 2026-06-27:

1. Local source now defines the secured metrics sink as `media_asset_metrics/{metricEventId}` and the schema fields above in `src/features/assessment/listening/storage/listeningAssetMetrics.ts`.
2. Local tests prove orphan-growth and commit-failure metric event creation, human-dashboard-review metadata, threshold owner/stop actions, deterministic baseline counts/bytes, and zero acceptable new untracked-draft-audio.
3. `database.rules.json` now includes checked-in `media_asset_metrics/**` indexes and browser write denial; emulator-backed tests prove ordinary teachers and guests cannot read/write metrics, super-admin can read, and browser create/update/delete is denied.
4. Threshold detection is human dashboard review in this no-deploy packet, not production alerting. Owner is `Frontend Platform / IELTS Assessment storage owner`; cadence is daily during internal/selected-teacher rollout and before each cohort expansion; evidence location is `media_asset_metrics/{metricEventId}` plus Task 4.15/5.21 findings; escalation runbook is encoded in the local metrics module.
5. Task 4.15 accepted-risk approval is recorded from the 2026-06-27 product-owner user message. The accepted baseline is tracked registry audio `1 object / 10 bytes`, known untracked permanent audio `2 objects / 50 bytes`, and new untracked draft audio `0 objects / 0 bytes`.
6. The approval treats known untracked permanent Listening audio as legacy risk only and does not permit any new untracked draft audio. The default acceptable new untracked-draft-audio count remains zero.

Task 4.16 local status, 2026-06-27:

1. Local source now defines rollback controls in `src/features/assessment/listening/storage/listeningAssetRollback.ts`.
2. New registry writes are disabled before registry/R2 mutation when rollback controls set `registryWritesEnabled: false`.
3. Cleanup/deletion stops with `cleanup-stopped` for immediate cleanup and replacement cleanup when rollback controls set `cleanupDeletionEnabled: false`.
4. Referenced assets are retained by preserving existing references and skipping `pending-delete` entry when rollback controls forbid existing-audio mutation.
5. Legacy publish read fields are preserved and existing audio mutation remains prohibited.

Task 6.9-6.11 local status, 2026-06-29:

1. Local source now defines a Task 6 rollout evaluator in `src/features/assessment/listening/storage/listeningTask6LocalRollout.ts`. It accepts only accepted prior selected-teacher Worker proof, local result-review proof, dry-run reconciliation reports with zero write/delete operations, complete metrics, and clean hard boundaries.
2. Local source extends `src/features/assessment/listening/storage/listeningAssetMetrics.ts` for temp age, reconciliation, delete failure, issuance failure, refresh failure, reclaimed bytes, auth denial, assets blocked by references, and result-playback failure while preserving Task 4 orphan-growth metrics.
3. Local source extends rollback/public-reader behavior so active rollback controls return asset-ID result-review records to public R2 without invoking the authorized-delivery issuer or mutating records.
4. No cleanup execution, object deletion, production data read in this packet, new selected-teacher/result-review remote traffic, R2/Firebase/Cloudflare remote mutation, deploy, solo/live private cutover, `AudioPlayer.tsx`, Reading V2 runtime internals, Google Drive behavior, or Task 7 work occurred.

## 25. Security And Audit Logging

Audit event target:

```text
media_asset_events/{eventId}
```

Required audit fields:

```text
schemaVersion
eventId
createdAt
actorUserId
actorRole
assetId
operation
outcome
reasonCode
correlationId
sourceFeatureId
sourceRoute
stateBefore
stateAfter
referenceType
referenceId
```

Audit/log rules:

1. Record actor, asset ID, operation, outcome, and reason.
2. Never record tokens.
3. Never record signed URLs.
4. Never record secrets.
5. Never record raw keys.
6. Never record raw audio or raw content.
7. Administrative deletion uses a separate audited operation.
8. Cross-owner denials are logged without revealing target key or audio content.

## 26. File Architecture And Bounded Module Homes

New storage/audio/media behavior must be born in bounded modules, preferably:

```text
src/features/assessment/listening/audio/
src/features/assessment/listening/storage/
src/features/assessment/listening/adapters/
src/features/assessment/listening/types/
```

Proposed future modules:

1. `src/features/assessment/listening/types/listeningAsset.types.ts`
   - Owns asset state, registry, session, lease, reference, metric, audit, and delivery types.
   - Imports no services.
2. `src/features/assessment/listening/audio/listeningAudioValidation.service.ts`
   - Owns extension, MIME, magic bytes, decodability, size, duration, and checksum validation.
   - Imports only platform-neutral helpers and types.
3. `src/features/assessment/listening/storage/listeningAssetRegistry.service.ts`
   - Owns Firebase registry read/write contracts behind a narrow interface.
   - Imports Firebase adapter only.
4. `src/features/assessment/listening/storage/listeningAssetCommit.service.ts`
   - Owns idempotent commit orchestration and state transitions.
   - Imports registry, validation, and R2 adapter interfaces.
5. `src/features/assessment/listening/storage/listeningAssetReference.service.ts`
   - Owns reference add/remove/recheck and zero-reference decisions.
   - Imports registry types only.
6. `src/features/assessment/listening/storage/listeningAssetCleanup.service.ts`
   - Owns cleanup planning, reconciliation budgets, and tombstone decisions.
   - Imports registry/reference/R2 adapter interfaces.
7. `src/features/assessment/listening/storage/listeningAssetUploadSessionLifecycle.service.ts`
   - Owns PRD-0058 lifecycle fields on PRD-0056A upload-session records, including session status, lifecycle-only eligibility, cleanup queue markers, and completion timestamps.
   - Must not own PRD-0056A create-time upload-session identity, asset identity, canonical temp-key issuance, or Worker bridge grants.
8. `src/features/assessment/listening/storage/listeningAssetHeartbeat.service.ts`
   - Owns same-tab heartbeat and lease freshness decisions for upload-session lifecycle eligibility.
   - Must not create saved drafts, durable references, durable commits, or cleanup deletion side effects.
9. `src/features/assessment/listening/storage/listeningAssetMetrics.service.ts`
   - Owns secured metric-event creation for orphan, cleanup, reconciliation, delivery, and stop-action counters.
   - Imports metric types and the trusted metrics sink adapter only.
10. `src/features/assessment/listening/storage/listeningAssetDelivery.service.ts`
   - Owns authorized-delivery issuance contract and read-authorization checks.
   - Imports registry/reference types and auth adapter.
11. `src/features/assessment/listening/adapters/r2StorageCompatibilityAdapter.ts`
   - Bridges existing `src/services/r2Storage.ts` facade to new contracts.
   - Must not expose raw-key authority.
12. `src/features/assessment/listening/adapters/listeningPersistenceAssetAdapter.ts`
   - Bridges `src/services/listeningTestStorage.ts` facade and PRD-0057 authoring persistence.
   - Must not own draft/publish business behavior.

File-size rule:

1. New human-maintained production files target under 400 lines.
2. Exceeding 400 lines requires written responsibility analysis, split alternatives, and reviewer approval.
3. Large-file maps are required before future implementation touches named large files.

## 27. Exact Owned And Protected Files

Owned or likely-owned future planning targets:

1. Future `src/features/assessment/listening/audio/**`
2. Future `src/features/assessment/listening/storage/**`
3. Future `src/features/assessment/listening/adapters/**`
4. Future `src/features/assessment/listening/types/**`
5. `src/services/r2Storage.ts` as facade only
6. `src/services/listeningTestStorage.ts` as consumer/facade only
7. `database.rules.json`
8. `firebase.json`
9. `r2-backup-worker/**`
10. `cloudflare/**` only where S0-approved mechanism requires compatibility, never to re-open PRD-0056 decisions
11. `src/components/results/ReviewTab.tsx` and `src/components/results/ReviewTab.test.tsx` - result-review source resolution and compatibility proof only
12. `src/components/results/ResultSlidePanel.tsx` and `src/components/results/ResultSlidePanel.test.tsx` - result-detail integration and regression proof only

Protected/out of scope:

1. `src/skills/listening/components/AudioPlayer.tsx`
2. `src/skills/listening/components/ListeningTestPage.tsx`
3. `src/components/practice/ListeningPracticeView.tsx`
4. `src/pages/TeacherTestMonitorPage.tsx`
5. `src/components/test/AudioProgressPanel.tsx`
6. `src/components/test/TeacherTestControlBar.tsx`
7. `src/components/test/HeadphoneRequestPanel.tsx`
8. `src/hooks/audio/useMasterAudioState.ts`
9. `src/hooks/audio/useAudioSync.ts`
10. `src/hooks/monitor/useMonitorControls.ts`
11. Reading V2 internals
12. Google Drive cleanup/deletion

## 28. Data Paths, Schema Ownership, And Indexes

Target top-level RTDB paths:

```text
media_assets/{assetId}
media_asset_upload_sessions/{ownerId}/{uploadSessionId}
media_asset_events/{eventId}
media_asset_metrics/{metricEventId}
media_asset_sweeps/{sweepId}
```

Required indexes:

```text
media_assets: ownerId, state, uploadSessionId, createdAt, committedAt, pendingDeleteAt, deleteAfter, tombstoneExpiresAt, lastReferencedAt
media_asset_upload_sessions/{ownerId}: status, expiresAt, maxEligibilityExpiresAt, lastHeartbeatAt
media_asset_events: createdAt, actorUserId, assetId, operation, outcome, reasonCode
media_asset_metrics: createdAt, operation, outcome, reasonCode, runId, stopAction
media_asset_sweeps: status, createdAt, approvedAt
```

Schema ownership:

1. Storage child PRD owns `media_assets/**`, `media_asset_upload_sessions/**`, `media_asset_events/**`, `media_asset_metrics/**`, and `media_asset_sweeps/**`.
2. PRD-0057 authoring owns draft/publish/version content paths, not asset registry internals.
3. Existing `tests/{testId}` remains current-state evidence, not target storage authority.
4. `reading_v2/**` remains Reading V2-owned and out of scope.
5. Google Drive paths remain out of scope.

Packet 1J supersession: section 38 narrows item 1. PRD-0056A owns create-time bootstrap fields and writes at `media_asset_upload_sessions/{ownerId}/{uploadSessionId}`; PRD-0058 owns later lifecycle fields/transitions at that path plus every other path listed above.

Rules requirements:

1. Teachers may read only their owned asset metadata.
2. Teachers may create/update only through approved trusted service paths, not arbitrary client writes.
3. Students cannot enumerate assets.
4. Delivery issuance authorization uses retained immutable version authorization, not registry read access.
5. Super admin read/write is allowed only where existing admin policy requires and must be tested.
6. Update/delete denial must be proven for clients where backend-only writes are required.

Path-specific ACL contract:

1. `media_assets/{assetId}` - owner or super-admin read; trusted service create/update/delete only.
2. `media_asset_upload_sessions/{ownerId}/{uploadSessionId}` - matching owner or super-admin read; PRD-0056A/PRD-0058 trusted service writes only; browser writes/deletes denied.
3. `media_asset_events/{eventId}` - trusted service create only; owner read only when `ownerId` matches, super-admin read always; update/delete denied.
4. `media_asset_metrics/{metricEventId}` - trusted service create only; super-admin read only; update/delete denied.
5. `media_asset_sweeps/{sweepId}` - trusted reconciliation service create/update; super-admin read only; browser create/update/delete denied.
6. Emulator tests must prove every create/read/update/delete rule separately, including cross-owner and ordinary-teacher denial for metrics/sweeps.

## 29. Testing Strategy

Required tests and proof:

1. Registry rule emulator negative tests.
2. Cross-owner upload denial.
3. Cross-owner reference denial.
4. Cross-owner overwrite denial.
5. Cross-owner move denial.
6. Cross-owner delete denial.
7. Cross-user delivery issuance denial.
8. Temp-not-durable tests.
9. Commit idempotency tests.
10. Replacement failure preservation tests.
11. Multi-tab heartbeat lease aggregation tests.
12. 24-hour temp fallback tests.
13. Zero-reference pending-delete grace tests.
14. Stale-reference recheck tests.
15. Range / `206` / `Accept-Ranges` / `Content-Length` proof.
16. iOS Safari/private-delivery proof as later human-assisted gate.
17. Backup restore drill.
18. Historical sweep dry-run and exclusion checks.
19. Metrics/alert/runbook verification.
20. Old public reader compatibility for new `assetId` records.
21. No Google Drive behavior change check.
22. No solo/homework runtime cutover check.
23. No live-session runtime cutover check.
24. No Reading V2 runtime source change check.
25. No raw secret/token/signed URL value in logs/findings checks.
26. `r2-backup-worker` scheduled cron still succeeds after registry backup integration.
27. Existing public R2 reader compatibility until private delivery cutover is approved.
28. Result-review uses the single PRD-0058 delivery resolver for new `assetId` records and the PRD-0057 legacy adapter for raw public R2 records.
29. No second result-review resolver or issuance path exists in PRD-0059 or PRD-0060.
30. Any packet touching `r2-backup-worker/` runs regression tests for the Reading V2 trusted submit route (`r2-backup-worker/src/reading-v2/submit.ts`) and the homework assignment route (`POST /api/homework/assignments`) in addition to media backup/registry tests.

Security rule tests must use the emulator-backed pattern from `src/__tests__/security/prd0040-security.emulator.test.ts`, not only contract-style assertions from `src/__tests__/security/firebaseRules.test.ts`.

## 30. Deployment / Configuration Requirements

Future implementation must provide:

1. Checked-in RTDB rule changes.
2. Checked-in Firebase emulator/test configuration if needed.
3. Checked-in R2 lifecycle configuration or script for temp prefix expiration, with verification command.
4. Checked-in Worker/source changes only through PRD-0056-approved mechanism.
5. `r2-backup-worker/` config and tests for registry backup/restore coverage.
6. Rollback plan that disables new writes, preserves both old and new readers, stops cleanup, and retains referenced assets.
7. No dashboard-only production configuration as final authority.
8. No deployment during planning.

Implementation must stop if S0 deployed proof is missing, registry rule coverage is missing, backup/restore coverage is missing, or private delivery proof gates are incomplete.

## 31. Rollout Plan

Future rollout sequence:

1. Reconcile this PRD against PRD-0055 and its tasklist only.
2. Confirm PRD-0056 S0 approval and implementation status; do not assume deployed proof.
3. Confirm PRD-0057 authoring dependency status.
4. Add registry schema, rules, emulator tests, backup/restore coverage, and metrics sink.
5. Add temp upload session and heartbeat model.
6. Add commit/replacement/reference services behind facades.
7. Preserve public URLs for compatibility.
8. Run internal fixtures.
9. Run historical orphan sweep dry-run only.
10. Enable selected teacher storage writes only after registry/backup/restore proof.
11. Keep private delivery disabled until range/refresh/iOS/live proof passes.
12. Stop on any wrong audio, data loss, cross-owner access, legacy incompatibility, restore failure, cleanup error threshold, or mid-test interruption risk.

No solo/homework, live-session, or Reading V2 runtime child PRD may start from this packet.

## 32. Acceptance Criteria

1. `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md` exists.
2. Current R2 service behavior is verified.
3. Current Listening persistence behavior is verified.
4. PRD-0056 S0 dependency is recorded without assuming implementation is complete.
5. PRD-0057 authoring dependency is recorded without selecting authoring implementation.
6. Asset registry model is defined.
7. Object state machine is defined.
8. Upload session and heartbeat model are defined.
9. Commit, replacement, and reference rules are defined.
10. Public-delivery compatibility window is defined.
11. Authorized delivery contract and read authorization are defined.
12. Cleanup/reconciliation/historical sweep are defined.
13. Backup/restore/tombstone governance is defined.
14. Metrics, alerts, owners, thresholds, and stop actions are defined.
15. Security/audit logging constraints are defined without forbidden values.
16. File architecture, owned files, and protected files are listed.
17. Data paths, schema ownership, and indexes are listed.
18. Testing strategy includes all required storage/security/delivery/backup checks.
19. No Google Drive behavior is changed.
20. No runtime/application/source implementation starts.
21. Findings are appended with Packet 1E evidence.
22. PRD-0055 tasklist is updated only to register PRD-0058/status.
23. Task 1.7 remains incomplete because three other child PRDs remain.

## 33. Regression Checklist

- [x] Temp upload does not create retained reference. Local Task 4.6/4.8 proof keeps lifecycle continuation separate from durable references and creates references only through commit.
- [x] Explicit Save draft creates retained reference only after durable commit succeeds. Local Task 4.8 proof verifies durable object before reference write and save payload persistence through the optional commit adapter.
- [x] Publish creates retained immutable version reference only after durable commit succeeds. Local Task 4.8 proof uses the same commit adapter path for published payloads while preserving public-reader fields.
- [x] Saved records never point to `temp/`. Local Task 4.8 proof writes canonical `assetId` plus durable derived public `audioUrl` / `streamUrl`.
- [x] Move/commit failure preserves old reference and fails closed. Local Task 4.8 proof keeps temp deletion after durable/reference success and denies invalid commit before copy/delete.
- [x] Replacement uses new `assetId`. Local Task 4.9 proof added `listeningAssetReplacement.ts` and verifies replacement starts only with a different `assetId`.
- [x] Replacement failure preserves old playback. Local Task 4.9 proof keeps the old authoritative playback reference on failed save or cancellation, queues only the new temp replacement for cleanup, and returns terminal `nextState` so later replacement can start only after resolution.
- [x] Second replacement is blocked while first commit is unresolved. Local Task 4.9 proof rejects a second replacement while `pendingReplacement.status` is unresolved and allows a later replacement after success/failure/cancel terminal state.
- [x] Cross-test reuse requires explicit trusted registry-reference operation. Local Task 4.14 proof records product-owner-approved deferral for implementing reuse now, rejects filename/URL/key/checksum/byte-content implicit reuse, and permits only a future trusted registry-reference operation.
- [x] Public `audioUrl` / `streamUrl` compatibility remains for unchanged readers. Local Task 4.8 proof preserves both fields without solo/live/result-review runtime changes.
- [x] Delivery issuance by known asset ID alone is denied. Local Task 6.6 proof rejects asset-ID-only requests when retained result/version authorization is absent.
- [x] Cross-user delivery issuance is denied. Local Task 6.6 proof rejects another student and another teacher despite valid asset/result IDs.
- [x] Range, `206`, `Accept-Ranges`, and stable `Content-Length` proof exists before private cutover. Local Task 6.6/6.8 proof validates range headers before signing and passes browser result-review range probes.
- [x] iOS Safari proof exists before private cutover. Local Task 6.8 Playwright proof passes the iOS-Safari-equivalent WebKit/iPhone result-review range probe; live/solo cutover remains separately gated.
- [ ] Refresh failure warns teacher monitor before interruption risk and does not pause live session by itself.
- [x] Heartbeat runs every 60 seconds. Local Task 4.11 proof returns `nextHeartbeatDueAt = now + 60000` without persisting it as retention authority.
- [x] Heartbeat stale after 3 minutes. Local Task 4.11 proof returns `heartbeatStaleAt = now + 180000` without persisting it as retention authority.
- [x] Heartbeat cannot exceed 8 hours. Local Task 4.11 proof keeps equality active and expires/queues cleanup after the 8-hour ceiling.
- [x] Multi-tab lease aggregation prevents premature cleanup. Local Task 4.12 proof persists PRD-approved session `leaseIds` plus separate lease records, keeps cleanup unqueued when another same-owner/same-draft lease remains fresh, rejects different-draft retention, and queues cleanup when only stale leases remain.
- [x] Temp fallback deletes no later than 24 hours. Local Task 4.11 proof marks temp/committing fallback due at the 24-hour threshold and excludes committed assets.
- [x] Zero-reference durable asset enters `pending-delete`. Local Task 4.13 proof moves the asset to `pending-delete` only after the final retained reference is removed.
- [x] Seven-day grace is observed. Local Task 4.13 proof sets `deleteAfter = pendingDeleteAt + 7 days` and repeated no-op pending-delete reference removal preserves the original timestamps.
- [x] Immediate pre-delete reference recheck is executed. Local Task 6.2 proof requires a same-asset same-tick reference recheck before an administrative deletion plan can be produced.
- [x] Tombstone retained exactly 90 days. Local Task 6.2 proof sets `tombstoneExpiresAt = deletedAt + 90 days`.
- [x] Tombstone excludes forbidden values. Local Task 6.2 proof rejects tombstone leakage of signed URLs, secrets, keys, raw audio, and audio content.
- [x] Hourly temp reconciliation is bounded/checkpointed. Local Task 6.3 proof adds repository-backed dry-run report/checkpoint boundaries, selected-teacher proof gating, object/R2/Firebase/wall-clock/cost budgets, capacity-stop reporting, no candidate continuation after abort, and report-only temp candidates with `executionAuthorized: false`; cleanup execution and scheduled deployment remain separately gated.
- [x] Daily durable reconciliation is bounded/checkpointed. Local Task 6.3 proof adds repository-backed dry-run report/checkpoint boundaries, selected-teacher proof gating, object/R2/Firebase/wall-clock/cost budgets, no candidate or recheck continuation after capacity stop, same-tick pre-delete reference recheck, and fail-closed retained-reference/owner/rollback/backup guards; durable delete execution remains separately gated.
- [x] Historical orphan sweep dry-run excludes retained references. Local Task 6.4 proof excludes retained live product references from candidates and mutation-kill proof fails when retained references are counted as orphans.
- [x] Backup/restore coverage includes registry paths. Task 4 registry backup/restore acceptance remains current, and local Task 6.5 proof explicitly preserves it rather than deferring it.
- [x] Scheduled backup cron still succeeds. Local Task 6.5 proof reran the `r2-backup-worker` scheduled auto-backup cron test along with backup/restore and protected Reading V2/homework route regressions.
- [x] Metrics sink receives required event shape. Local Task 4.15 proof creates `media_asset_metrics/{metricEventId}` events for orphan-growth and commit-failure and records product-owner accepted-risk text for known untracked permanent audio.
- [x] Alert/runbook stop actions are verified. Local Task 4.15 proof records human-dashboard-review owner/cadence/evidence/runbook and Task 5.21/9.9 stop actions. Production alerting remains unclaimed because the approved mode is human dashboard review.
- [x] Logs contain actor/asset/operation/outcome/reason only. Local Task 6.2 admin-deletion audit event is limited to actor, asset, owner, operation, outcome, reason, and timestamp metadata.
- [x] No raw secret/token/signed URL/raw key/raw audio/raw content is logged. Local Task 6.2 tombstone/audit tests exclude those values.
- [x] No Google Drive behavior changes. Local Task 6.2 touched only Listening storage-governance source/tests and docs; Google Drive remains obsolete unsupported residue.
- [x] No solo/homework runtime files changed. Local Task 6.6-6.8 touched only bounded Listening delivery/result-review adapter/client/Worker proof, saved-result core consumption, Playwright proof config/spec, task docs, and output artifacts.
- [x] No live-session runtime files changed. Local Task 6.6-6.8 did not touch live runtime paths or `AudioPlayer.tsx`.
- [x] No Reading V2 internals changed. Local Task 6.6-6.8 did not touch Reading V2 runtime internals.

## 34. Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| S0 assumed deployed before proof | Browser-authoritative raw key risk persists | Stop until PRD-0056 deployed evidence is current |
| Saved draft persists temp URL | Audio expires after save | Fail closed until durable object and registry reference verify |
| Replacement overwrites old key | Cancelled edit mutates saved/published audio | New asset ID and reference swap after save success |
| Cleanup deletes referenced audio | Data loss or wrong audio | Reference indexes, seven-day grace, immediate recheck, restore drill |
| Registry not backed up/restored | Cleanup cannot be safely recovered | Registry backup/restore/emulator tests ship first |
| Metrics sink missing | Rollout cannot be watched | Stop rollout until concrete secured sink and runbook exist |
| Private delivery breaks range/seek | Student playback failure | Public delivery remains until range/iOS/long-session proof passes |
| Refresh failure pauses live session | Mid-test interruption | Warn/retry, do not pause solely on refresh failure |
| Historical orphan sweep deletes retained asset | Data loss | Dry-run, retained-reference exclusion, explicit approval |
| Google Drive behavior changes incidentally | Unsupported migration/regression | Protected scope and no Google Drive edits/tests/migration |
| File responsibilities grow in facades | Future maintenance risk | Bounded modules, 400-line target, large-file maps before touch |

## 35. Open Questions

No parent-level storage product question is open for Packet 1E. The following implementation stop conditions remain:

1. Product-owner plus architecture/security reviewer must approve this child PRD before implementation.
2. PRD-0056 S0 implementation evidence must be checked before storage implementation relies on secured upload/move authority.
3. If the proposed `media_asset_metrics/{metricEventId}` or `media_asset_events/{eventId}` paths are rejected during rule/security review, implementation must stop until a concrete secured sink/schema is approved.
4. If `r2-backup-worker/` cannot cover registry backup/restore within platform budgets, implementation must stop and create an approved DR-owner adjustment.
5. If exact draft/version paths from PRD-0057 remain unresolved, storage can implement registry/session foundation but must not ship audio-bearing Save draft.
6. If private delivery requires `AudioPlayer` internal edits, that work remains Task 8 and must not be implemented here.

## 36. Definition Of Done

This child PRD is done when:

1. It exists at `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`.
2. It includes sections 1 through 36.
3. Current storage baseline is verified with source evidence.
4. PRD-0056 and PRD-0057 dependencies are recorded.
5. It captures lifecycle, registry, heartbeat, commit, replacement, reference, delivery, cleanup, reconciliation, backup/restore, metrics, security, file architecture, data path, testing, rollout, and stop-action requirements.
6. Findings are appended with Packet 1E evidence.
7. PRD-0055 tasklist registers PRD-0058/status only.
8. Validation scans and `git diff --check` pass or record exact non-owned warnings.
9. Task 1.7 remains incomplete because three other child PRDs still remain.
10. No implementation has started.

## 37. Packet 1I File And Consumer Ownership Addendum

Before/after evidence requirements:

1. Packet 1I baselines are `src/services/r2Storage.ts` 446 lines, `src/services/listeningTestStorage.ts` 634 lines, `src/components/results/ReviewTab.tsx` 235 lines, `src/components/results/ResultSlidePanel.tsx` 893 lines, and `r2-backup-worker/src/index.ts` 560 lines.
2. Every implementation packet records `lines before -> after`, responsibility before/after, and created/preserved decomposition seams for every touched file above and every named large file.
3. `r2Storage.ts` and `listeningTestStorage.ts` remain facades; `ResultSlidePanel.tsx` remains a result shell; `r2-backup-worker/src/index.ts` remains a router/orchestrator. None may gain asset-registry, reconciliation, delivery-authorization, or result-resolution algorithms inline.
4. New behavior stays in the bounded modules from section 26. Result-review surfaces may only request/consume the resolver contract and render playback/error state.
5. Missing line-count/responsibility evidence or a new inline domain responsibility in any named facade/monolith is an implementation stop condition.

Consumer ownership is exclusive:

1. PRD-0058/Task 6 owns server issuance, retained-reference authorization, range support, the single Listening delivery resolver, and result-review integration.
2. PRD-0059 owns solo/homework host/adapter consumption only; it creates no result-review or issuance implementation.
3. PRD-0060 owns live `AudioPlayer` refresh/source handoff and live cutover only; it consumes PRD-0058 issuance and creates no second delivery authorization service.

## 38. Packet 1J Approved B1 Option B Bridge Amendment - 2026-06-20

Decision reference: `PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20`.

> Superseded by approved B1 Option B on 2026-06-20: section 8's proposed upload-session backend ownership block and section 28 item 1's broad ownership of all `media_asset_upload_sessions/**` writes. They remain historical evidence. The binding decision is the named `PRD-0056A Listening Upload Session Bridge` with split create-time/lifecycle ownership.

Binding ownership:

1. `tasks/0056a-prd-listening-upload-session-bridge.md` owns backend-issued `uploadSessionId`, backend-issued `assetId`, upload-session bootstrap, and canonical `temp/listening/...` key issuance.
2. PRD-0056 S0 remains the severable security gate and keeps `temp/listening-audio/{uid}/...` as a compatibility prefix for non-bridge callers during transition.
3. PRD-0056A-enabled callers use `temp/listening/{ownerId}/{uploadSessionId}/{assetId}-{sanitizedFileName}`.
4. PRD-0058 consumes the bridge session/asset identities and owns `media_assets/**`, later session lifecycle state, commit, references, cleanup, reconciliation, backup/restore, and delivery.
5. No existing old-prefix object is renamed or migrated. Old temp objects expire under temp lifecycle fallback.
6. `media_asset_upload_sessions/{ownerId}/{uploadSessionId}` has split ownership: PRD-0056A owns the exact create-time bootstrap schema; PRD-0058 owns later lifecycle fields/transitions. Neither may silently change the other's required fields.

Protected route and file rule:

1. PRD-0056A uses the PRD-0056 canonical `r2-upload-signer` package and must not modify `r2-backup-worker/**`.
2. `POST /api/reading-v2/submit` and `POST /api/homework/assignments` remain protected regression surfaces.
3. If any implementation packet proposes touching `r2-backup-worker/src/index.ts`, shared Worker auth/routing/config/build/deploy, stop and amend the controlling PRD before work.

Required bridge evidence before PRD-0058 implementation:

1. Session and asset IDs are backend-issued and owner-scoped.
2. Cross-owner, raw-key, replay, expiry, and unsupported-prefix requests are denied.
3. One bridge-enabled teacher upload produces only `temp/listening/...`.
4. Existing S0 compatibility upload remains functional during transition.
5. Rollback to the captured pre-bridge `r2-upload-signer` version restores the compatibility path without deleting or moving objects.
6. No bridge write reaches `media_assets/**`, `listening_authoring/**`, `tests/**`, or generic `drafts/**`.

PRD-0058 rollout must stop if PRD-0056A deployed proof is absent or stale. B1 and Task 1 planning are accepted, PRD-0055 Task 4 minimum local storage foundation is accepted through Task 4.19 parent acceptance after corrective proof for builder metadata carry, fail-closed temp URL persistence, no partial mixed-section commit, committed durable-object reverify, reference-failure reconciliation queueing, full registry-path rules/backup/restore coverage, and facade split boundaries, Task 5 local authoring consumption is accepted, Task 6.1/6.2 local deletion-governance design/tests are accepted without cleanup execution, Task 6.3 local reconciliation dry-run/report/checkpoint foundation is accepted locally with no delete/write authority, Task 6.4 local historical inventory dry-run/report foundation is accepted locally with no production inventory or deletion, Task 6.5 local audio-object backup-governance design/tests are accepted locally with no remote restore or deletion, Task 6.6-6.8 local authorized delivery/result-review client and Worker route proof is accepted locally without solo/live private cutover, Task 6.9-6.11 local rollout/metrics/rollback proof is accepted locally without cleanup execution or remote mutation, Task 6.12 independent verification is recorded, and Task 6.13/parent Task 6.0 acceptance is accepted after owner acceptance plus read-only Firebase shallow proof that the selected-teacher sample had no `/media_assets` rows to reconcile. Cleanup execution, production alerting, deployed lifecycle proof, remote-state mutation, and solo/live runtime cutover remain blocked by child-specific review, later task-specific proof gates, and explicit implementation authorization.

## 39. Task 1.10 Canonical Dependency Synchronization - 2026-06-20

Canonical edge set, identical across the PRD-0055 dependency registry and every child PRD:

```text
DAG-00->{DAG-03,DAG-20,DAG-80}
DAG-03->{DAG-50,DAG-90,DAG-99}
DAG-20->DAG-21->DAG-40
DAG-40->{DAG-50,DAG-60}
DAG-50->{DAG-51,DAG-70,DAG-81}
DAG-51->DAG-60
DAG-60->{DAG-71,DAG-81}
DAG-70->DAG-71
DAG-80->DAG-81
{DAG-71,DAG-81,DAG-90}->DAG-99
```

| Local node | Upstream | Output | Downstream |
| --- | --- | --- | --- |
| `DAG-40` PRD-0058 / Task 4 minimum foundation | `DAG-21` deployed/current PRD-0056A proof | Commit, references, immediate discard cleanup, fallback cleanup, backup/restore coverage, orphan metrics | `DAG-50`, `DAG-60` |
| `DAG-60` PRD-0058 / Task 6 advanced storage/delivery | `DAG-40` and `DAG-51` selected-teacher traffic | Reconciliation conclusions, advanced cleanup/deletion, issuance/range/refresh proof, result-review private delivery | `DAG-71`, `DAG-81` |

Result-review private delivery belongs to `DAG-60`/Task 6. Solo and live remain later consumers. Rollback disables cleanup/deletion, preserves old/new readers and references, and returns result review to public delivery. Historical Packet 1I/1J status wording above remains historical. Task 1.12 approval is recorded, but no implementation completion or child-specific authorization is claimed.
