# PRD 0056A: Listening Upload Session Bridge

Status: Spark-safe Worker-only bridge deployed/current proof PASS; Task 4.2 foundation unblocked, but Task 4.2 implementation remains unstarted pending its own scope packet
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

Session/identity authority is the checked-in Wrangler-managed Cloudflare Worker `r2-upload-signer`. The Worker verifies Firebase ID tokens directly, writes owner-scoped bootstrap records through Firebase RTDB REST using a service-account OAuth bearer, and issues short-lived signed `assetGrant` values. R2 byte upload remains on the same Worker selected by PRD-0056.

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

A dedicated PRD-0056A rules packet owns the first `database.rules.json` rules for `media_asset_upload_sessions/**`, plus the minimal root `.write` narrowing required to keep browser writes from mutating that subtree when RTDB ancestor-write inheritance would otherwise bypass child `.write: false`.

Required rule behavior:

1. Authenticated teachers may read only their own owner branch.
2. Browser clients cannot choose another owner branch.
3. Bootstrap create requires `ownerId`, `uploadSessionId`, `purpose`, `status`, `createdAt`, `expiresAt`, `maxEligibilityExpiresAt`, and `bridgeVersion`.
4. Path owner and record owner must equal authenticated UID.
5. Browser writes are denied. The trusted Worker writes the bootstrap record through Firebase RTDB REST after it verifies the Firebase ID token and request contract.
6. Super-admin access follows existing explicit super-admin policy and receives emulator coverage.
7. Because RTDB ancestor `.write` rules cannot be revoked by child `.write: false`, the rules packet may minimally narrow the existing root super-admin `.write` behavior only enough to require `media_asset_upload_sessions` to remain unchanged during browser writes.
8. Delete is denied to browser clients.
9. Rule tests use the emulator-backed pattern from `src/__tests__/security/prd0040-security.emulator.test.ts`.

## 7. Module Home And Dependency Direction

Coherent domain home:

```text
cloudflare/src/upload-worker/listening-upload-session*.ts
```

Required seams:

1. `listening-upload-session.ts` - request validation, opaque session/asset ID issuance, canonical temp-key derivation, grant creation, and injected create-session / issue-asset handlers.
2. `listening-upload-session-repository.ts` - Worker-local Firebase RTDB REST repository with service-account OAuth bearer acquisition and owner/session compare-and-set retries.
3. `listening-upload-session-types.ts` - bootstrap record and repository interfaces.
4. `listening-upload-session-grant.ts` - signed `assetGrant` verification, replay consume, and canonical R2 write.
5. `worker.js` - thin route wiring only.
6. `src/services/r2Storage.ts` - browser compatibility facade wiring only.

`LISTENING_UPLOAD_SESSION_GRANT_SECRET` is provisioned as an `r2-upload-signer` secret only. `GOOGLE_SA_KEY` is the Worker secret for Firebase RTDB REST writes, and `FIREBASE_DB_URL` is the checked-in non-secret Worker var. Secrets are never checked in, printed, or copied into findings. Deployment proof uses one Worker-issued grant against the deployed Worker and does not reveal the secrets.

Dependency direction:

```text
src/services/r2Storage.ts
  -> Cloudflare Worker create-session / issue-asset routes
  -> signed assetGrant
  -> cloudflare/worker.js
  -> cloudflare/src/upload-worker/listening-upload-session.ts
  -> cloudflare/src/upload-worker/listening-upload-session-repository.ts
  -> cloudflare/src/upload-worker/listening-upload-session-grant.ts
  -> Firebase RTDB REST owner-scoped bootstrap
  -> env.R2_BUCKET
```

No bridge module may import application UI, Listening authoring/runtime, neutral shared assessment, Reading V2, or `r2-backup-worker` code. Reuse from `r2-backup-worker` is by local copy/adaptation only.

## 8. Exact Owned And Protected Files

Owned implementation files:

1. `cloudflare/src/upload-worker/listening-upload-session.ts`.
2. `cloudflare/src/upload-worker/listening-upload-session-repository.ts`.
3. `cloudflare/src/upload-worker/listening-upload-session-types.ts`.
4. `cloudflare/src/upload-worker/listening-upload-session-grant.ts`.
5. `cloudflare/worker.js` - thin route wiring only.
6. `cloudflare/test/listening-upload-session-bridge.test.ts`.
7. `cloudflare/wrangler.jsonc` - checked-in non-secret Worker vars only; secrets remain external.
8. `cloudflare/src/upload-worker/cors-policy.js` - exact header allowlist only.
9. `src/services/r2Storage.ts` - browser compatibility facade wiring only.
10. `src/services/r2Storage.test.ts`.
11. `database.rules.json` - exact `media_asset_upload_sessions/**` owner-read/client-write-denial rules plus the minimal root `.write` narrowing required to preserve that subtree denial against ancestor inheritance.
12. `src/__tests__/security/prd0056a-upload-session-rules.emulator.test.ts`.
13. `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.

Allowed changes:

1. Add the two authenticated Worker routes and bounded Worker-local bridge modules.
2. Add owner-read/client-write-denial rules for the exact session bootstrap path, including the minimal root `.write` narrowing required to prevent ancestor-rule bypass of that subtree.
3. Add Worker verification for the Worker-issued asset grant.
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
15. Existing `functions/src/index.ts` exports and `functions/src/readingV2SubmitCore.ts`; no new bridge modules or exports may be added there.

If implementation requires a protected file or route, stop and obtain a controlling PRD amendment before editing.

## 9. Size And Evidence Contract

1. `cloudflare/worker.js` remains within the PRD-0056 200-line target and 250-line ceiling.
2. Each new human-maintained production module targets 400 lines or fewer and may not exceed 500 lines without architecture/security approval.
3. Packet 1J baselines are `cloudflare/worker.js` 117 lines, `src/services/r2Storage.ts` 446 lines, and `src/services/r2Storage.test.ts` 85 lines.
4. `cloudflare/worker.js` remains a thin router surface. Target: at most 200 lines after route wiring. Ceiling: 250 lines.
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
13. Existing Worker harness/security suites and `functions/src/readingV2SubmitCore` compile/test surfaces remain green after leaving Cloud Functions bridge-free.

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
2. Provision `LISTENING_UPLOAD_SESSION_GRANT_SECRET` and `GOOGLE_SA_KEY` as `r2-upload-signer` Worker secrets, and set `FIREBASE_DB_URL` in `cloudflare/wrangler.jsonc`; record secret names only.
3. Capture `PRE_0056A_VERSION_ID`.
4. Deploy Worker create-session / issue-asset routes plus asset-grant verification with rollout disabled for normal clients.
5. Enable internal teacher/browser fixtures.
6. Prove new `temp/listening/...` keys and owner-scoped session records.
7. Enable selected teachers.
8. Keep `temp/listening-audio/{uid}/...` available only for non-bridge compatibility callers during rollout.
9. Disable the old prefix for new Listening uploads only after all active Listening upload callers use the bridge.
10. Existing old-prefix temp objects are not migrated; they expire through temp lifecycle cleanup.

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
6. No separate Function bridge exists in this Spark-safe design; one Worker rollback restores S0-only behavior while leaving bootstrap rows non-durable so they can expire.

## 13. Acceptance And Stop Conditions

This planning bridge is complete when:

1. Owner, API, data path, full bootstrap schema, rules owner, module home, owned/protected files, tests, browser proof, observability, rollout, rollback, and stop conditions are explicit.
2. PRD-0056 S0 remains severable.
3. PRD-0058 consumes the bridge contract without taking over session issuance.
4. No implementation, Worker, rules, source, config, deployment, or traceability work has started.

Task 1 planning is complete. Implementation remains blocked until an approved implementation packet and fresh deployed/current S0 evidence exist.

Current local packet status, 2026-06-26:

1. A local-only implementation candidate exists for Worker-local session/asset authority, owner-scoped bootstrap, Worker-issued bridge grants, Worker bridge verification, facade seam, and `media_asset_upload_sessions/**` rules with the minimal root `.write` narrowing required to preserve subtree browser write denial.
2. Executable RTDB emulator proof now runs locally with a temporary process-local JDK and passes for `media_asset_upload_sessions/**` owner/super-admin read plus browser write-denial coverage. The emulator RED cycle found and fixed an ancestor-rule inheritance gap where root super-admin browser writes could mutate the bridge subtree despite child `.write: false`.
3. Follow-up local hardening rejects browser-supplied lifecycle/session-record fields and zero-byte media contracts, preserves the Worker bridge `missing_size` 411 path when `Content-Length` is absent, preserves the existing owner/idempotency-HMAC session if a concurrent create wins between query and write, and keeps exact approved Worker bridge origins at `https://kahut1.web.app`, `http://localhost:5173`, and `http://localhost:5174`.
4. A compliant independent review on 2026-06-27 found three real blockers in the then-current candidate: dead `VITE_LISTENING_UPLOAD_SESSION_FUNCTIONS_URL` fallback in `src/services/r2Storage.ts`, dead focused Worker bridge coverage because `cloudflare/vitest.config.mjs` excluded `cloudflare/test/**/*.test.ts`, and PRD/doc authority drift around the root `.write` narrowing required for subtree browser write denial.
5. The main thread corrected those blockers and reran focused proof: `src/services/r2Storage.test.ts` now passes 15/15 with explicit Worker-only endpoint resolution coverage, and `cloudflare/test/listening-upload-session-bridge.test.ts` now runs through the active Cloudflare Vitest config and passes 9/9 under bundled Windows x64 Node.
6. Broader local rerun after the correction passed: `src/services/r2Storage.test.ts` plus `src/__tests__/security/prd0056a-upload-session-rules.emulator.test.ts` -> 16 passed / 1 skipped, executable RTDB emulator -> 2/2, Cloudflare Worker suite -> 8 files / 138 tests, hardened negatives -> 22/22, insecure baseline -> 18 expected RED plus four already-safe passes, Wrangler dry-run -> pass, and `npm run build` -> pass.
7. Local prerequisite closure is accepted for local-only readiness. Two compliant independent re-reviews on 2026-06-27 passed after the correction: spec/doc/rules boundary PASS and runtime/test-discovery PASS.
8. The earlier Function-oriented deployed/current preflight is historical only and is superseded by this Spark-safe Worker-only bridge design.
9. Read-only Cloudflare pre-version capture still confirms deployment `0c0bca87-6bca-4a42-934d-509299b7e3c9`, active version `11af545a-479b-4063-a899-d475dd57d2b5`, and rollback-compatible recovery version `959065cd-8399-4000-b479-d8303a2f18ad`; no Worker deployment, secret provisioning, R2 mutation, traffic change, or recovery rehearsal occurred.
10. No deployed/current PRD-0056A proof, remote browser proof, secret provisioning, Worker deployment, rollback execution, remote write, cleanup, or Task 4.2 readiness is claimed.
11. Historical planning text above remains historical; this status note is the current source-truth addendum.

Current deployed/current proof status, 2026-06-27:

1. `r2-upload-signer` is deployed at 100% to Worker version `3687d2e0-4718-4c0b-9c84-7f81749c31fb`, deployment `b0bb984c-e666-4535-9af0-85c354d75993`, message `PRD-0056A recovery rehearsal: restore split bridge`.
2. Version detail confirms `FIREBASE_DB_URL=https://temp-a1437-default-rtdb.firebaseio.com`, `FIREBASE_PROJECT_ID=temp-a1437`, `R2_BUCKET=kahoot-media`, Durable Object migration `v1-upload-grant-replay-ledger`, rate-limit namespace `205512`, and secret bindings by name for `GOOGLE_SA_KEY`, `LISTENING_UPLOAD_SESSION_GRANT_SECRET`, and `UPLOAD_GRANT_SECRET`.
3. Firebase RTDB rules for `temp-a1437-default-rtdb` are deployed with `media_asset_upload_sessions/**` owner-read/browser-write-denial rules plus the minimal root `.write` narrowing required to prevent ancestor-rule bypass.
4. Full deployed/current bridge proof passed against `https://r2-upload-signer.iamhuwng.workers.dev`: no-auth create returned 401; evil-origin preflight exposed no allowed origin; authenticated teacher create returned backend-issued `uploadSessionId`; issue-asset returned backend-issued `assetId`, canonical `temp/listening/{ownerId}/{uploadSessionId}/{assetId}-proof-audio.mp3`, and signed `assetGrant`; cross-owner issue returned 404; cross-owner upload returned 403; owner upload returned 200; owner RTDB session read returned 200; browser RTDB mutation returned permission denied; public R2 read matched SHA-256 `8cb78897dbf5328c6a78c31684ac7c097aa4f7afd6707be70d659fce7cb29015`; proof object cleanup returned 404.
5. Non-destructive recovery rehearsal passed after the final split deploy: activated S0 recovery version `959065cd-8399-4000-b479-d8303a2f18ad` at 100%, then restored PRD-0056A split bridge version `3687d2e0-4718-4c0b-9c84-7f81749c31fb` at 100%; post-restore create-session smoke returned 200.
6. Runtime corrections made during deployed proof: the Worker REST repository now wraps default `globalThis.fetch` so Cloudflare does not call unbound fetch as a repository method; issue-asset treats missing RTDB empty maps as empty because Firebase RTDB does not persist `{}`; the bridge contract helpers are split into `listening-upload-session-contract.ts` so all PRD-0056A production modules remain under the file-size ceiling.
7. Verification after final split deploy passed: Cloudflare Vitest 8 files / 141 tests; focused root proof 16 passed / 1 skipped; executable RTDB emulator 2/2; hardened negatives 22/22; insecure baseline fixture `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c` with 18 expected RED and four already-safe passes; Wrangler dry-run PASS; `npm run build` PASS; functions TypeScript no-emit PASS; UTF-8 check PASS; `git diff --check`, `git diff --cached --check`, and `rtk git diff --check` PASS with only the known `cloudflare/wrangler.jsonc` line-ending warning and RTK no-hook notice.
8. Task 4.2 foundation is unblocked by deployed/current PRD-0056A proof. Task 4.2 implementation remains unstarted in this packet; PRD-0058 lifecycle, registry, commit, cleanup, reconciliation, backup/restore, metrics, and delivery work are still out of scope until the Task 4.2 packet begins.

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

PRD-0056A is the mandatory bridge. No direct PRD-0056 -> PRD-0058 implementation edge remains. Rollback restores S0 compatibility routing/prefix while preserving temp objects and session rows. Task 1.12 approval is recorded, but no implementation completion or child-specific authorization is claimed.
