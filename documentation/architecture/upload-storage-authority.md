# Upload And Storage Authority

Status: Active
Last Updated: 2026-06-25
Owner: Frontend Platform

## Decision

All active user-facing file uploads use Cloudflare R2.

Google Drive is obsolete across all product features. It is not an approved upload, import, streaming, playback, validation, or compatibility path.

Required product truth:

```text
new uploads -> Cloudflare R2
Google Drive -> obsolete implementation residue
```

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

### Remaining Lifecycle Gaps

Current code does not yet satisfy the retention contract below:

- `uploadAudioReplacement(...)` can overwrite a committed object key before the surrounding test save succeeds;
- failed temp-to-permanent movement can leave a saved record using an expiring temp URL;
- Listening test deletion removes the RTDB record but does not remove its R2 audio;
- abandoned/cancelled uploads depend on temp lifecycle expiry rather than immediate best-effort deletion;
- no Listening-specific trusted delete endpoint or durable asset reference registry currently exists;
- the one-day `temp/` lifecycle rule is documented but not represented in checked-in R2 configuration.
- registry-backed `pending-delete`, retained-reference rechecks, durable cleanup batching, rollback grace rules, backup/restore coverage, and orphan metrics remain unimplemented.

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

Cancelling or failing replacement leaves the saved audio unchanged.

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
