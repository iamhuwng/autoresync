# PRD 0056A: Listening Upload Session Bridge

Status: Approved child planning contract - Task 1.11 parent acceptance is complete; implementation remains blocked pending Task 1.12 approval/HARD STOP, an approved implementation packet, and deployed/current PRD-0056 S0 proof
Created: 2026-06-20
Task number: 0056A
Parent PRD: `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
Decision reference: `PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20`

## 1. Purpose And Scope

PRD-0056A is the approved bridge between PRD-0056 Security Gate S0 and PRD-0058 asset lifecycle implementation.

It owns:

1. Backend-issued opaque `uploadSessionId` values.
2. Backend-issued opaque immutable `assetId` values.
3. Owner-scoped upload-session bootstrap records.
4. Canonical Listening temp keys under `temp/listening/{ownerId}/{uploadSessionId}/{assetId}-{sanitizedFileName}`.
5. The controlled transition from the S0 compatibility prefix `temp/listening-audio/{uid}/...` to `temp/listening/...`.

It does not implement durable asset commit, reference tracking, cleanup, reconciliation, private delivery, draft/version content, solo/homework runtime, live runtime, Reading V2 runtime, or Google Drive work.

## 2. Approved Boundary

Approved Option B keeps PRD-0056 S0 severable:

1. S0 continues to harden the current upload/move contract and may keep `temp/listening-audio/{uid}/...` for existing callers.
2. PRD-0056A introduces the backend-issued session and asset identity contract.
3. Only PRD-0056A-enabled callers may create new Listening temp objects under `temp/listening/...`.
4. PRD-0058 consumes the issued session and asset identities and later owns durable registry, commit, reference, cleanup, reconciliation, and delivery behavior.
5. No existing temp object is renamed or migrated in place. Old temp objects expire under the approved temp lifecycle fallback.

## 3. Functional Requirements

1. Every create-session request requires a valid Firebase ID token.
2. Verified token `sub` is the owner identity. Browser-provided owner IDs are ignored.
3. `uploadSessionId` and `assetId` each contain at least 128 bits of cryptographically secure randomness.
4. The browser may submit file name, declared MIME type, size, and an idempotency request ID. It may not submit a raw object key, target prefix, owner ID, upload-session ID, or asset ID as authority.
5. Session creation is idempotent by owner plus `creationRequestId`.
6. Asset issuance is idempotent by owner, session, and `assetRequestId`.
7. Session creation does not create retention intent or a durable draft.
8. Asset issuance does not create retention intent or a durable asset reference.
9. The bridge must reject cross-owner session reads, asset issuance, upload grants, and key use.
10. The bridge must preserve PRD-0056 auth, CORS, rate-limit, expiry, replay, method, size, MIME, and raw-key denial requirements.
11. The bridge must not weaken or bypass PRD-0056 grant verification.
12. The bridge must not write `media_assets/**`; PRD-0058 owns that registry.
13. The bridge must not write `listening_authoring/**`; PRD-0057 owns authoring content.
14. The bridge must not touch `tests/{testId}` or generic `drafts/{draftId}`.
15. The bridge must not report success until the session bootstrap record exists and the issued key matches the approved owner/session/asset tuple.

## 4. API Contract

Session/identity authority is a Firebase HTTPS backend because it can use Firebase Admin SDK for trusted RTDB writes. R2 byte upload remains the checked-in Wrangler-managed `r2-upload-signer` package selected by PRD-0056.

### Create Session

```text
POST /createListeningUploadSession
Authorization: Bearer <Firebase ID token>
Idempotency-Key: <creationRequestId>
```

Request body:

```text
draftId?       optional existing canonical Listening draft ID
testId?        optional stable logical Listening test ID
revisionId?    optional revision-draft ID
```

Response:

```text
uploadSessionId
ownerId
status
createdAt
expiresAt
maxEligibilityExpiresAt
```

### Issue Asset

```text
POST /issueListeningUploadAsset
Authorization: Bearer <Firebase ID token>
Idempotency-Key: <assetRequestId>
```

Request body:

```text
fileName
declaredMimeType
sizeBytes
uploadSessionId
```

Response:

```text
assetId
uploadSessionId
tempKey
assetGrant
assetGrantExpiresAt
```

`tempKey` is informational output. The browser sends `assetGrant` to `r2-upload-signer`; the Worker verifies the signed owner/session/asset/key tuple before accepting bytes. Later requests remain authorized by verified identity plus a valid server-issued grant, never by possession of the key.

## 5. Data Path And Full Bootstrap Schema

PRD-0056A owns create-time writes at:

```text
media_asset_upload_sessions/{ownerId}/{uploadSessionId}
```

PRD-0058 owns later lifecycle updates to the same record after its implementation gate passes.

Full bridge bootstrap record:

```text
schemaVersion: 1
ownerId
uploadSessionId
purpose: "listening-authoring"
status: "active"
creationRequestIdHash
draftId?
testId?
revisionId?
createdAt
createdBy
expiresAt
maxEligibilityExpiresAt
lastGrantIssuedAt?
assetIds/
  {assetId}: true
assetRequests/
  {assetRequestIdHash}/
    assetId
    fileName
    sanitizedFileName
    declaredMimeType
    sizeBytes
    tempKey
    issuedAt
    grantExpiresAt
lastHeartbeatAt?
abandonmentReason?
cleanupQueuedAt?
bridgeVersion: "0056A-v1"
```

Rules:

1. Timestamps are trusted server timestamps in Unix milliseconds.
2. `creationRequestIdHash` and `assetRequestIdHash` are server-side HMAC-SHA-256 values. Raw idempotency keys are never persisted or logged.
3. `tempKey` must equal `temp/listening/{ownerId}/{uploadSessionId}/{assetId}-{sanitizedFileName}`.
4. `createdBy` must equal `ownerId`.
5. Optional draft/test/revision IDs are correlation only. They do not create a retained reference.
6. PRD-0056A may create only `status: "active"`. PRD-0058 owns later `committing`, `completed`, `abandoned`, `expired`, and `cleanup-queued` transitions.

Required indexes:

```text
media_asset_upload_sessions/{ownerId}: creationRequestIdHash, status, expiresAt, maxEligibilityExpiresAt
```

## 6. RTDB Rules Ownership

A dedicated PRD-0056A rules packet owns the first `database.rules.json` rules for `media_asset_upload_sessions/**`.

Required rule behavior:

1. Authenticated teachers may read only their own owner branch.
2. Browser clients cannot choose another owner branch.
3. Bootstrap create requires `ownerId`, `uploadSessionId`, `purpose`, `status`, `createdAt`, `expiresAt`, `maxEligibilityExpiresAt`, and `bridgeVersion`.
4. Path owner and record owner must equal authenticated UID.
5. Browser writes are denied. Firebase Admin SDK writes the bootstrap record after the HTTPS handler verifies the Firebase ID token and request contract.
6. Super-admin access follows existing explicit super-admin policy and receives emulator coverage.
7. Delete is denied to browser clients.
8. Rule tests use the emulator-backed pattern from `src/__tests__/security/prd0040-security.emulator.test.ts`.

## 7. Module Home And Dependency Direction

Coherent domain home:

```text
functions/src/listening-upload-session/**
```

Required seams:

1. `sessionIds.ts` - cryptographically secure session/asset ID issuance.
2. `sessionSchema.ts` - request, response, and bootstrap record validation.
3. `sessionRepository.ts` - Firebase Admin SDK owner-scoped RTDB bootstrap transaction.
4. `sessionHandlers.ts` - authenticated create-session and issue-asset HTTPS handlers.
5. `tempKey.ts` - canonical Listening temp-key derivation.
6. `assetGrant.ts` - short-lived signed owner/session/asset/key grant creation.

`LISTENING_UPLOAD_SESSION_GRANT_SECRET` is provisioned as a Firebase Functions secret and a Wrangler secret with the same value. The value is never checked in, printed, or copied into findings. Deployment proof uses one function-issued grant against the deployed Worker; it does not reveal the secret.

Cloudflare adapter seam:

```text
cloudflare/src/upload-worker/listening-upload-session-grant.ts
```

The adapter verifies `LISTENING_UPLOAD_SESSION_GRANT_SECRET`, expiry, verified Firebase UID, and the exact owner/session/asset/key tuple. It contains no RTDB repository or lifecycle logic.

Dependency direction:

```text
src/services/r2Storage.ts
  -> Firebase HTTPS bridge
  -> functions/src/listening-upload-session/**
  -> Firebase Admin SDK owner-scoped RTDB bootstrap
  -> signed assetGrant
  -> cloudflare/worker.js
  -> cloudflare/src/upload-worker/listening-upload-session-grant.ts
  -> env.R2_BUCKET
```

No bridge module may import application UI, Listening authoring/runtime, neutral shared assessment, Reading V2, or `r2-backup-worker` code.

## 8. Exact Owned And Protected Files

Owned implementation files:

1. `functions/src/listening-upload-session/**`.
2. `functions/src/index.ts` - thin exports for `createListeningUploadSession` and `issueListeningUploadAsset` only.
3. `functions/src/listening-upload-session/listeningUploadSessionBridge.test.ts`.
4. `cloudflare/worker.js` - thin asset-grant verifier wiring only.
5. `cloudflare/src/upload-worker/listening-upload-session-grant.ts`.
6. `cloudflare/test/listening-upload-session-bridge.test.ts`.
7. `cloudflare/wrangler.toml` - bind `LISTENING_UPLOAD_SESSION_GRANT_SECRET` by secret reference only.
8. `src/services/r2Storage.ts` - browser compatibility facade wiring only.
9. `src/services/r2Storage.test.ts`.
10. `database.rules.json` - only `media_asset_upload_sessions/**` owner-read/client-write-denial rules.
11. `src/__tests__/security/prd0056a-upload-session-rules.emulator.test.ts`.
12. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.

Allowed changes:

1. Add the two authenticated bridge HTTPS exports and bounded function modules.
2. Add owner-read/client-write-denial rules for the exact session bootstrap path.
3. Add Worker verification for the function-issued asset grant.
4. Add facade calls and response adaptation in `r2Storage.ts`.
5. Add tests, non-secret binding names, and rollout/rollback evidence required by this PRD.

Prohibited changes:

1. Durable asset commit, registry, cleanup, reconciliation, or delivery implementation.
2. Listening authoring draft/version content writes.
3. Solo, homework, live, teacher-monitor, `AudioPlayer`, or Reading V2 behavior.
4. Raw-key authority, browser-issued IDs, browser session-record writes, or unauthenticated compatibility.
5. Google Drive behavior.

Protected files and routes:

1. `src/services/listeningTestStorage.ts`.
2. `src/skills/listening/builders/ListeningTestBuilder.tsx`.
3. `src/components/practice/ListeningPracticeView.tsx`.
4. `src/skills/listening/components/ListeningTestPage.tsx`.
5. `src/skills/listening/components/AudioPlayer.tsx`.
6. `src/pages/TeacherTestMonitorPage.tsx`.
7. `src/hooks/audio/**`.
8. `src/hooks/monitor/**`.
9. `listening_authoring/**`.
10. `media_assets/**`.
11. `tests/{testId}` and `drafts/{draftId}`.
12. `reading_v2/**`.
13. `r2-backup-worker/**`, including `POST /api/reading-v2/submit` and `POST /api/homework/assignments`.
14. Google Drive services, data, and behavior.
15. Existing `functions/src/index.ts` exports and `functions/src/readingV2SubmitCore.ts`; only the two bridge exports may be added to the index.

If implementation requires a protected file or route, stop and obtain a controlling PRD amendment before editing.

## 9. Size And Evidence Contract

1. `cloudflare/worker.js` remains within the PRD-0056 200-line target and 250-line ceiling.
2. Each new human-maintained production module targets 400 lines or fewer and may not exceed 500 lines without architecture/security approval.
3. Packet 1J baselines are `functions/src/index.ts` 268 lines, `cloudflare/worker.js` 117 lines, `src/services/r2Storage.ts` 446 lines, and `src/services/r2Storage.test.ts` 85 lines.
4. `functions/src/index.ts` remains an export/router surface. Target: at most 300 lines after bridge exports. Ceiling: 350 lines.
5. `src/services/r2Storage.ts` remains a facade and gains no session-authority algorithm.
6. Before and after every implementation packet, findings record line counts, responsibility deltas, created/preserved seams, and justification for each facade increase.
7. Missing line evidence or inline bridge authority added to a facade blocks completion.

## 10. Required Tests And Browser Proof

Automated tests:

1. Same create request returns the same `uploadSessionId`.
2. Same asset request returns the same `assetId` and temp key.
3. Different owner cannot read or use a session.
4. Browser-provided owner, session ID, asset ID, prefix, or raw key is rejected as authority.
5. Expired, tampered, replayed, or cross-owner grant is denied.
6. Canonical temp key exactly matches the approved tuple.
7. S0 compatibility caller may continue using `temp/listening-audio/{uid}/...` during the bridge rollout.
8. Bridge caller uses only `temp/listening/...`.
9. Session bootstrap creates no `media_assets/**`, `listening_authoring/**`, `tests/**`, or `drafts/**` write.
10. Logs contain no token, raw UID, raw idempotency key, signed grant, signed URL, secret, raw key, or audio bytes.
11. Existing PRD-0056 upload/move security tests remain green.
12. Boundary diff proves no `r2-backup-worker/**` or Reading V2 route change.
13. `functions/src/readingV2SubmitCore.test.ts` remains green after the thin `functions/src/index.ts` export change.

Human-assisted browser proof:

1. Use teacher quick login at `http://localhost:5173`.
2. Create one bridge upload session and issue two asset grants.
3. Network evidence shows authenticated session and asset endpoints.
4. RTDB evidence shows one owner-scoped bootstrap record with two backend-issued asset IDs.
5. R2 evidence shows only canonical `temp/listening/...` keys for the bridge path.
6. A second teacher/browser context receives denial for the first teacher's session.
7. No source, token, signed URL, secret, or raw key is copied into findings.

## 11. Observability And Stop Actions

Structured bridge events:

```text
schemaVersion
createdAt
operation
outcome
reasonCode
actorUidHash
uploadSessionIdHash
assetIdHash?
bridgeVersion
```

Required metrics:

1. Session-create success/failure.
2. Asset-issue success/failure.
3. Cross-owner denials.
4. Replay/expiry denials.
5. Compatibility-prefix versus bridge-prefix use.
6. RTDB bootstrap failure.
7. Grant issuance failure.

Stop rollout immediately for any cross-owner access, browser-authoritative key acceptance, wrong owner/session/asset tuple, auth bypass, secret/log leak, existing upload regression, or write outside the approved bootstrap path.

## 12. Rollout And Rollback

Rollout:

1. PRD-0056 S0 must be deployed and proven first.
2. Provision matching `LISTENING_UPLOAD_SESSION_GRANT_SECRET` values in Firebase Functions and `r2-upload-signer`; record names only.
3. Capture `PRE_0056A_VERSION_ID`.
4. Deploy authenticated bridge HTTPS handlers with rollout disabled for normal clients.
5. Deploy Worker asset-grant verification.
6. Enable internal teacher/browser fixtures.
7. Prove new `temp/listening/...` keys and owner-scoped session records.
8. Enable selected teachers.
9. Keep `temp/listening-audio/{uid}/...` available only for non-bridge compatibility callers during rollout.
10. Disable the old prefix for new Listening uploads only after all active Listening upload callers use the bridge.
11. Existing old-prefix temp objects are not migrated; they expire through temp lifecycle cleanup.

Rollback:

```powershell
wrangler rollback <PRE_0056A_VERSION_ID> --name r2-upload-signer --message "Rollback PRD-0056A Listening upload session bridge" --yes
```

Rollback must:

1. Disable bridge client routing.
2. Restore the S0 compatibility prefix for active callers.
3. Preserve existing temp objects and session rows for expiry/reconciliation.
4. Never delete, move, or rewrite R2 objects as part of Worker version rollback.
5. Leave PRD-0058 durable registry/cleanup disabled.
6. Function endpoints may remain deployed but cannot advance an upload because the rolled-back Worker rejects bridge asset grants; session bootstrap rows remain non-durable and expire.

## 13. Acceptance And Stop Conditions

This planning bridge is complete when:

1. Owner, API, data path, full bootstrap schema, rules owner, module home, owned/protected files, tests, browser proof, observability, rollout, rollback, and stop conditions are explicit.
2. PRD-0056 S0 remains severable.
3. PRD-0058 consumes the bridge contract without taking over session issuance.
4. No implementation, Worker, rules, source, config, deployment, or traceability work has started.

Task 1.11 parent acceptance is complete. Implementation remains blocked until Task 1.12 approval/HARD STOP, an approved implementation packet, and fresh deployed/current S0 evidence exist.

## 14. Source References

1. `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
2. `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`.
3. `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`.
4. `documentation/architecture/upload-storage-authority.md`.
5. `documentation/architecture/reading-v2-runtime-integrations.md`.
6. `documentation/rules/infrastructure.md`.
7. `documentation/rules/codebase-hygiene.md`.
8. `src/__tests__/security/prd0040-security.emulator.test.ts`.

## 15. Task 1.10 Canonical Dependency Synchronization - 2026-06-20

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
| `DAG-21` PRD-0056A | `DAG-20` deployed/current S0 proof | Backend-issued owner-scoped session/asset identity, bootstrap, grant, and canonical temp-prefix transition | `DAG-40` minimum PRD-0058 foundation |

PRD-0056A is the mandatory bridge. No direct PRD-0056 -> PRD-0058 implementation edge remains. Rollback restores S0 compatibility routing/prefix while preserving temp objects and session rows. No implementation completion or Task 1.12 approval is claimed.
