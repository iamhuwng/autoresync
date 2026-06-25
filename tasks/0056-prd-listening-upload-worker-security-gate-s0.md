# PRD 0056: Listening Upload Worker Security Gate S0

Status: S0 accepted - Task 2.15 parent acceptance is complete; later upload-session, registry, lifecycle, cleanup, private-delivery, and Task 3 work remain separately gated
Created: 2026-06-20
Task number: 0056
Parent PRD: `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
Execution source: `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`

## 1. Introduction / Overview

The current upload Worker used by Listening audio upload is a live security gate. Browser code can request upload and move operations without authenticated identity, wildcard CORS is active, and raw browser-provided object keys are accepted by the deployed Worker and the checked-in Worker variants.

This child PRD defines the urgent Security Gate S0 only. S0 hardens the upload Worker boundary before registry, heartbeat, cleanup, private delivery, draft/publish, or runtime work begins.

S0 must preserve the current authorized browser upload and temp-to-permanent move workflow through a secured replacement contract. It must not add storage lifecycle behavior, asset registry behavior, cleanup behavior, private playback delivery, or Listening draft/version behavior.

## 2. Goals

1. Select one canonical upload-worker mechanism for S0 implementation.
2. Replace unauthenticated upload and move operations with Firebase-authenticated requests.
3. Make the Worker derive owner, prefix, object path, upload target, and move target from trusted server-side rules.
4. Reject browser-authoritative raw R2 keys.
5. Restrict CORS to exact approved origins.
6. Enforce method controls, 50 MB per-file/request ceiling, signed authorization expiry, replay protection, and rate limiting at the Worker boundary.
7. Add RED/GREEN negative tests proving the insecure baseline fails and the hardened Worker passes.
8. Define exact deployment, rollback, and version-pin procedure for the selected mechanism.
9. Keep S0 severable from registry, heartbeat, cleanup, private delivery, and all application runtime behavior.

## 3. User Stories

1. As a teacher uploading Listening audio, I want upload and save behavior to keep working after security hardening.
2. As a teacher, I want another teacher to be unable to overwrite, move, or reuse my uploaded R2 object.
3. As a product owner, I want the urgent security gate fixed without bundling draft lifecycle, registry, cleanup, or private delivery.
4. As a security reviewer, I want negative tests for missing auth, invalid auth, cross-owner access, raw keys, forbidden prefixes, CORS, unsupported methods, oversize uploads, replay, and expiry.
5. As a junior developer, I want exact owned files, protected files, API contracts, deployment commands, rollback steps, and stop conditions so I do not improvise security behavior.

## 4. Functional Requirements

FR-001. S0 must use the canonical mechanism selected in section 7: native Cloudflare R2 binding `env.R2_BUCKET` deployed from a checked-in Wrangler-managed upload-worker package.

FR-002. S0 must not use the checked-in `aws4fetch`/S3 credential implementation as the future canonical mechanism.

FR-003. Every non-`OPTIONS` upload-worker request must require `Authorization: Bearer <Firebase ID token>`.

FR-004. The Worker must verify Firebase ID tokens using the Firebase JWKS pattern already present in `r2-backup-worker/src/auth/firebase-auth.ts`.

FR-005. Verified token `sub` is the owner identity for S0. Browser-provided `ownerId`, `uid`, email, role, raw key, source key, or destination key is never authority.

FR-006. S0 must preserve existing authorized upload behavior by updating the browser R2 adapter, not by keeping insecure Worker authority.

FR-007. S0 may keep the existing response field names consumed by the browser service: `key`, `uploadUrl`, public URL output, `url`, `streamUrl`, `directUrl`, `fileName`, and `isTemp`.

FR-008. The `key` returned to browser code is informational output only. It must not be accepted later as proof of authority.

FR-009. The Worker must issue upload grants with a maximum 10-minute lifetime.

FR-010. Upload grants must bind actor UID, operation kind, canonical source key, maximum size, content type, expiry, and one operation nonce.

FR-011. Upload grant verification must fail closed when the grant is missing, expired, tampered with, replayed, or used by a different UID.

FR-012. The Worker must generate canonical object keys under allowlisted prefixes. Browser code must not submit full object paths as authority.

FR-013. The Worker must reject path traversal, encoded traversal, absolute URLs, duplicate separators, control characters, unsupported folder names, and keys outside allowlisted prefixes.

FR-014. The Worker must reject direct durable overwrite unless the operation is an explicitly approved owner-scoped singleton replacement, such as a same-user avatar.

FR-015. Listening audio S0 uploads must remain temp-first. S0 must not make upload completion durable.

FR-016. Move from temp to permanent must use a Worker-issued move grant or a server-derived canonical source/destination pair. `sourceKey` and `destKey` from browser JSON may be accepted only as non-authoritative assertions and must not drive the operation.

FR-017. The move response must preserve the current browser contract shape: success state, new URL, and new key output.

Packet 1I correction - 2026-06-20: `newUrl` and `newKey` are the browser adapter's `MoveResult` output contract, derived from the server destination key before `src/services/r2Storage.ts:182-191` returns to callers. The Worker HTTP response may use a reviewed internal shape, but the adapter must preserve this output contract and must not trust browser-provided raw keys.

FR-018. Cross-owner upload, overwrite, move, and forbidden-prefix operations must return `403` or `400` without reading or writing R2 objects.

FR-019. Unsupported methods must return `405`.

FR-020. CORS preflight must return success only for exact approved origins and approved methods/headers.

FR-021. CORS must reject wildcard origin behavior.

FR-022. Approved origins for S0 are exactly:

- `https://kahut1.web.app`
- `http://localhost:5173`
- `http://localhost:5174`

Packet 1I provenance - 2026-06-20: `https://kahut1.web.app` is treated as the current production Firebase Hosting origin based on existing deployment documentation at `documentation/SOP/0023-november-11-2025-comprehensive-session.md:132`, `:629`, and `:807`. If product-owner approval adds, removes, or replaces production origins, FR-022 must be amended before implementation.

Any additional production origin blocks implementation until this child PRD is updated and approved.

FR-023. The Worker must enforce a 50 MB maximum per upload request/file.

FR-024. The Worker must not enforce the 10-audio-files-per-test product rule. That rule requires test-level state and belongs to later application/storage work.

FR-025. The Worker must use a Wrangler rate-limit binding named `UPLOAD_RATE_LIMITER` with an account-scoped positive-integer namespace ID, simple limit `30`, period `60`, and rate keys that include verified UID plus client IP class. Packet 2M assigns canary namespace ID `205511`; production config must be reconciled to a Cloudflare-valid integer before any production deploy.

FR-026. If rate-limit binding setup cannot be proven locally and after deploy, S0 implementation stops before rollout.

FR-027. No secret, token, signed upload grant, signed URL, raw audio body, or raw object content may enter logs.

FR-028. Logs may include request ID, operation kind, UID hash, prefix class, outcome, failure reason code, status code, and byte count.

FR-029. S0 must keep existing public R2 delivery unchanged. Private signed playback delivery is excluded.

FR-030. S0 must not create asset registry nodes, heartbeat records, cleanup records, draft records, published versions, or Firebase rules.

FR-031. S0 must not deploy from Cloudflare Dashboard / Quick Editor after the checked-in Wrangler package exists. Dashboard/Quick Editor remains historical deployment evidence and emergency rollback reference only.

FR-032. The checked-in package must define local, test, deploy, deployed-status, version-list, version-pin, and rollback commands for `r2-upload-signer`.

## 5. Non-Goals / Out of Scope

S0 does not include:

1. Asset registry.
2. Durable asset references.
3. Listening Save draft or Publish split.
4. Listening immutable versions or revision drafts.
5. Heartbeat.
6. Temp cleanup beyond existing upload/move behavior.
7. Scheduled reconciliation.
8. Durable cleanup.
9. Historical orphan inventory.
10. Private R2 delivery.
11. Signed playback URLs.
12. Result-review delivery changes.
13. Solo/homework runtime changes.
14. Live-session runtime changes.
15. Audio parser changes.
16. Published Listening payload changes.
17. Google Drive cleanup, migration, playback removal, or new Google Drive behavior.
18. Firebase rule changes.
19. R2 lifecycle configuration changes.
20. Cloudflare deployment during this planning packet.

## 6. Verified Current Architecture

Current checked-in upload-worker source:

- `cloudflare/worker.js` imports `AwsClient` from `aws4fetch`.
- It uses S3-style credentials and bucket identifiers: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BUCKET_NAME`, `ACCOUNT_ID`, and `BUCKET_ID`.
- It allows wildcard CORS.
- It advertises `PUT, POST, GET, OPTIONS, DELETE` in `Access-Control-Allow-Methods` even though the body later rejects non-`POST` requests; S0 tests must prove `GET` and `DELETE` are denied and not merely advertised.
- It accepts raw browser-provided `sourceKey` and `destKey` for `/move`.
- It signs S3 PUT URLs from the browser-provided `filename`.
- `cloudflare/package-lock.json` exists and declares `aws4fetch`.
- `cloudflare/package.json`, `cloudflare/wrangler.toml`, and `cloudflare/wrangler.jsonc` do not exist.

Current documented and deployed upload-worker truth:

- Worker name: `r2-upload-signer`.
- Workers.dev route/domain: `https://r2-upload-signer.iamhuwng.workers.dev`.
- Cloudflare custom domains for this Worker: none found.
- Worker subdomain is enabled; previews are disabled.
- Current deployed source version: version number 6, version ID `20dd8429-5be1-4105-baed-f6dc5af68098`.
- Current deployment source: Quick Editor / dashboard upload.
- Current deployed source was fetched through Cloudflare API `content/v2` and its normalized SHA-256 is `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`.
- The deployed source exactly matches the JavaScript block in `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md`.
- The deployed source uses native `env.R2_BUCKET`.
- The deployed source does not use `aws4fetch`.
- The deployed source has wildcard CORS.
- The deployed source has `/move`, `POST`, and `PUT` behavior.
- The deployed source has no Firebase authentication.
- Deployed binding names: `R2_BUCKET`, `PUBLIC_URL`.
- Deployed Worker secret names reported by Wrangler: none.

Current browser upload/move contract:

- `src/services/r2Storage.ts` hardcodes the Worker URL.
- It sends `POST ?filename=...` to obtain `{ key, uploadUrl }`.
- It uploads bytes to `uploadUrl` with `PUT`.
- It derives public URLs from the returned key.
- It sends `POST /move` with `{ sourceKey, destKey }`.
- It tolerates `/move` failure and can keep temp URLs.

Current deployment and rollback evidence:

- Wrangler 4.97.0 can read Worker deployments, versions, settings, and bindings.
- Deployment history contains six versions.
- Current deployment sends 100 percent traffic to version 6.
- `wrangler rollback [version-id] --name r2-upload-signer` is available.
- `wrangler versions deploy <version-id>@100% --name r2-upload-signer` is available for version pinning.

## 7. Canonical Worker Decision

Canonical S0 runtime mechanism: native Cloudflare R2 binding through `env.R2_BUCKET`.

Canonical S0 source and deployment mechanism: checked-in Wrangler-managed upload-worker package under `cloudflare/`, deployed to the existing Worker name `r2-upload-signer`.

Rejected canonical mechanism: checked-in `aws4fetch`/S3 credential source in `cloudflare/worker.js`.

Decision evidence:

1. Least-privilege security favors native `env.R2_BUCKET` because the Worker does not need S3 access key secrets for object operations.
2. Deployed truth already uses native `env.R2_BUCKET`; choosing `aws4fetch` would move production away from current behavior.
3. `aws4fetch` source has no checked-in `package.json`, no checked-in Wrangler config, no checked-in deploy command, and no checked-in rollback command.
4. Native `env.R2_BUCKET` supports mechanism-matched local testing through Worker/R2 test bindings.
5. Native `env.R2_BUCKET` preserves the existing browser upload/move shape while allowing auth, prefix, raw-key, CORS, size, expiry, replay, and rate checks to happen in the Worker.
6. Checked-in Wrangler deployment is required for reproducibility. Current dashboard/Quick Editor deployment is accepted only as historical evidence and pre-S0 rollback target.

Implementation consequence:

- Task 2 must update `cloudflare/worker.js` to native `env.R2_BUCKET` hardening.
- Task 2 must create `cloudflare/package.json` and `cloudflare/wrangler.toml`.
- Task 2 must update `cloudflare/package-lock.json` consistently.
- Task 2 must not restore the S3 credential mechanism.

## 8. Worker API Compatibility Contract

S0 browser adapter contract must keep existing service outputs compatible while changing trusted inputs.

Current public TypeScript outputs remain:

```ts
interface UploadResult {
  url: string;
  streamUrl: string;
  directUrl: string;
  fileName: string;
  key: string;
  isTemp: boolean;
}

interface MoveResult {
  success: boolean;
  newUrl: string;
  newKey: string;
}
```

Secured Worker endpoints:

1. `OPTIONS /upload/authorize`
   - Allowed only for approved origins.
2. `POST /upload/authorize`
   - Required headers: `Authorization`, `Content-Type: application/json`, allowed `Origin`.
   - Request body fields:
     - `operationKind`: one of `listening_audio_temp`, `test_audio_temp`, `test_image_temp`, `avatar_permanent`, `announcement_attachment_permanent`, `book_cover_permanent`.
     - `fileName`: basename only.
     - `contentType`.
     - `sizeBytes`.
     - `isTemp`.
     - `resourceHint`: optional non-authoritative display/resource hint for caller diagnostics.
   - Response fields:
     - `key`: server-derived key, informational only.
     - `uploadUrl`: Worker URL containing an opaque upload grant, not a raw key.
     - `publicUrl`: derived public URL for compatibility.
     - `moveGrant`: present only for temp upload operations.
     - `expiresAt`.
3. `PUT /upload`
   - Required query: opaque upload grant.
   - Required headers: `Authorization`, `Content-Type`, `Content-Length`, allowed `Origin`.
   - The Worker validates grant, UID, size, method, content type, and replay state before `R2_BUCKET.put`.
4. `POST /move`
   - Required headers: `Authorization`, `Content-Type: application/json`, allowed `Origin`.
   - Request body fields:
     - `moveGrant`.
     - optional `sourceKey` and `destKey` assertions for backward diagnostics only.
   - The Worker derives source and destination from the move grant. It must not trust `sourceKey` or `destKey`.
   - Response fields must support the existing `MoveResult` adapter.

The legacy root `POST ?filename=...` endpoint must not remain an active unauthenticated authority. If kept temporarily for compatibility during one deploy, it must require Firebase auth, treat `filename` as a display basename only, and derive keys with the same S0 rules.

## 9. Authentication And Identity Verification

S0 authentication rules:

1. All non-preflight requests require a Firebase ID token.
2. Token verification must use Firebase JWKS, issuer `https://securetoken.google.com/<FIREBASE_PROJECT_ID>`, and audience `<FIREBASE_PROJECT_ID>`.
3. `FIREBASE_PROJECT_ID` is a required plain environment variable name.
4. Worker must reject:
   - missing `Authorization`;
   - malformed `Bearer` header;
   - empty token;
   - invalid signature;
   - wrong issuer;
   - wrong audience;
   - expired token;
   - token without `sub`.
5. Owner identity is the verified `sub`.
6. Browser-supplied owner fields are ignored.
7. S0 logs must hash UID before logging.
8. S0 must not log the token, token claims object, email, signed grant, object body, signed URL, or raw audio.

The existing `r2-backup-worker/src/auth/firebase-auth.ts` pattern is the source pattern for JWT verification only. S0 must not copy backup-worker secrets, admin-only checks, backup routes, or service-account behavior.

Packet 1I correction - 2026-06-20: the existing backup-worker verifier logs raw UID values in `r2-backup-worker/src/auth/firebase-auth.ts:55,102,113,117`. S0 may reuse only the JWT verification pattern. It must not copy those `console.log` / `console.warn` lines, and any UID recorded by S0 logs must be hashed before logging.

## 10. Owner, Prefix, Path, And Raw-Key Authority Rules

Allowed S0 prefix families:

```text
temp/listening-audio/{uid}/{nonce}-{sanitizedFileName}
temp/audio/{uid}/{nonce}-{sanitizedFileName}
temp/images/{uid}/{nonce}-{sanitizedFileName}
listening-audio/{uid}/{nonce}-{sanitizedFileName}
audio/{uid}/{nonce}-{sanitizedFileName}
images/{uid}/{nonce}-{sanitizedFileName}
avatars/{uid}/avatar
announcements/{uid}/{nonce}-{sanitizedFileName}
book-covers/{uid}/{nonce}-{sanitizedFileName}
```

Rules:

1. UID path segment must equal verified token `sub`.
2. `nonce` must be Worker-generated.
3. `sanitizedFileName` must be basename only, lower-risk printable characters only, and no path separators.
4. `operationKind` selects prefix family.
5. Temp move derives durable key by removing the leading `temp/` from the server-derived source key.
6. Browser-provided raw R2 keys are never authority.
7. Knowing a key, URL, upload grant, or stale move grant must not authorize a new operation.
8. Cross-owner keys fail closed.
9. Forbidden prefixes fail closed:
   - `assessment-assets/`
   - `reading_v2/`
   - `backups/`
   - `private/`
   - `media_assets/`
   - any prefix not listed above.
10. S0 must not create the future registry target path `assessment-assets/listening/{ownerId}/{assetId}/...`; that belongs to later storage lifecycle work.

### Task 2.6/2.7/2.9 Ownership And Checkpoint Sequence - 2026-06-21

This reconciliation changes implementation/checkpoint order only. It does not weaken FR-005, FR-008 through FR-016, this section, the negative-test contract, or final S0 acceptance.

Exact requirement ownership:

1. Task 2.6 owns authentication and owner identity:
   - require Firebase authentication on every non-`OPTIONS` route;
   - use verified token `sub` as the only owner identity;
   - reject browser `ownerId`, `uid`, email, and role as authority;
   - reject cross-owner upload/move attempts before any R2 read, write, copy, or delete.
2. Task 2.7 owns prefix and canonical-path authority:
   - enforce the allowlisted prefix families in this section;
   - derive canonical owner/path structure server-side;
   - reject traversal, encoded traversal, absolute paths/URLs, duplicate separators, control characters, unsupported folders, and forbidden prefixes;
   - constrain temp-to-durable movement to the canonical same-family destination;
   - enforce cross-prefix and overwrite bounds.
3. Task 2.9 owns capability and request authority:
   - issue and verify opaque upload/move grants;
   - bind grants to UID, operation, canonical source/destination, content type, size, expiry, and nonce;
   - treat browser `key`, `sourceKey`, and `destKey` only as optional non-authoritative assertions;
   - enforce expiry, tamper rejection, replay protection, rate controls, and the 50 MB ceiling.

Non-circular checkpoint order:

1. Existing Task 2.6 evidence is provisional authentication/owner-scope evidence only; Task 2.6 remains unchecked.
2. Task 2.7 implementation is explicitly permitted while Task 2.6 remains provisionally incomplete.
3. After Task 2.7 passes its own focused proof, Task 2.8 may implement exact-origin CORS while Task 2.6 remains unchecked.
4. After Task 2.8 passes its own focused proof, Task 2.9 may implement grants, assertion-only raw-key handling, expiry, replay, binding, rate, and size controls while Task 2.6 remains unchecked.
5. Full raw-key non-authority becomes satisfied only after Task 2.7 canonical path derivation and Task 2.9 opaque-grant enforcement are both implemented and integrated with Task 2.6 authentication/owner scope.
6. Task 2.6 may be checked only after integrated proof confirms every non-`OPTIONS` route authenticates, verified `sub` is owner, browser identity fields are not authority, cross-owner requests fail before R2 access, and browser raw keys cannot select or authorize an R2 operation.
7. Task 2.7, Task 2.8, and Task 2.9 remain independently unchecked until their own implementation/evidence packets pass. Task 2.10 remains blocked until Tasks 2.6 through 2.9 are all checked.

## 11. CORS, Rate, Method, Replay, Expiry, And 50 MB Controls

CORS:

1. Allowed origins are exactly the three origins in FR-022.
2. `Access-Control-Allow-Origin` must echo the allowed origin, not `*`.
3. Allowed methods: `OPTIONS`, `POST`, `PUT`.
4. Allowed headers: `Authorization`, `Content-Type`, `Content-Length`.
5. Preflight for unknown origin or unknown method returns `403` or `405`.

Rate:

1. Checked-in Wrangler config must bind `UPLOAD_RATE_LIMITER`.
2. Rate namespace ID must be an account-scoped positive integer. Packet 2M canary uses `205511`; production selection remains a later deploy gate.
3. Simple limit must be 30 operations per 60 seconds.
4. Rate keys must include UID and client IP class.
5. Rate-limit denial returns `429` with no secret or key in body.

Method:

1. `/upload/authorize` accepts `OPTIONS` and `POST` only.
2. `/upload` accepts `OPTIONS` and `PUT` only.
3. `/move` accepts `OPTIONS` and `POST` only.
4. Everything else returns `404` or `405`.

Replay and expiry:

1. Upload grants expire after 10 minutes.
2. Move grants expire after 10 minutes.
3. Grants are HMAC-signed with secret binding name `UPLOAD_GRANT_SECRET`.
4. `R2_BUCKET.put` must use conditional create/no-overwrite behavior where available.
5. Reusing an upload grant after a successful upload returns a replay/duplicate failure.
6. Reusing a move grant after successful move is idempotent only when the server-derived destination already exists and the source is absent; it must not copy or delete a different object.

Approved replay ledger decision - 2026-06-21:

Approval record: User response: "approve".

1. S0 uses a SQLite-backed Cloudflare Durable Object class named `UploadGrantReplayLedger`.
2. The upload Worker binds it as `UPLOAD_GRANT_REPLAY_LEDGER`.
3. The Worker derives one Durable Object instance per full grant replay key via `getByName()`.
4. Upload and move handling must atomically consume the replay key before any `R2_BUCKET` read, write, copy, or delete.
5. Consumed state must persist in Durable Object storage for at least 15 minutes after consume.
6. Cleanup uses Durable Object alarms; because the current `compatibility_date` predates `deleteAll()` alarm auto-removal, `alarm()` must explicitly call `deleteAlarm()` before deleting all storage.
7. Binding, RPC, storage, malformed input, expired input, or cleanup failures fail closed. They must not expose replay key, UID, nonce, grant, or secret values in logs, errors, response bodies, or findings.
8. Test doubles may be preserved only when clearly isolated from production namespace handling.

Size:

1. `Content-Length` is required for upload.
2. `Content-Length > 52,428,800` bytes returns `413`.
3. Missing size returns `411`.
4. MIME and extension checks are basic S0 checks only; strict audio validation remains later storage work.

## 12. Exact Owned And Protected Files

Owned files for S0 implementation:

- `cloudflare/worker.js` - canonical upload-worker source; must become native `env.R2_BUCKET`.
- `cloudflare/package.json` - upload-worker scripts and dev dependencies.
- `cloudflare/package-lock.json` - upload-worker dependency lock.
- `cloudflare/wrangler.toml` - canonical Worker config for `r2-upload-signer`.
- `cloudflare/vitest.config.ts` - Worker test harness configuration.
- `cloudflare/test/upload-worker-security.test.ts` - local RED/GREEN security tests.
- `cloudflare/test/fixtures/insecure-current-worker.js` - baseline insecure deployed/SOP source fixture for RED tests.
- `cloudflare/src/upload-worker/**` - bounded authentication, grant, path-authority, CORS, rate-limit, R2-operation, and security-event modules composed by `cloudflare/worker.js`.
- `src/services/r2Storage.ts` - browser adapter to call secured upload/move contract.
- `src/services/r2Storage.test.ts` - adapter contract tests.
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - append-only evidence after implementation subtasks.

Line-count budgets for S0 owned files:

1. `cloudflare/worker.js` remains a thin router/entrypoint. Target: at most 200 lines after implementation. Ceiling: 250 lines. Exceeding target requires moving logic into `cloudflare/src/upload-worker/**`; exceeding ceiling blocks implementation until architecture/security review approves a split.
2. `cloudflare/test/upload-worker-security.test.ts` target is at most 400 lines. Ceiling: 500 lines. Large fixtures must move to fixture modules instead of growing the test file.
3. Before/after line counts for both files must be recorded in findings for every S0 packet.

Protected files and paths:

- `src/services/listeningTestStorage.ts`
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
- `src/components/practice/ListeningPracticeView.tsx`
- `src/skills/listening/components/ListeningTestPage.tsx`
- `src/skills/listening/components/AudioPlayer.tsx`
- `src/pages/TeacherTestMonitorPage.tsx`
- `src/hooks/audio/useMasterAudioState.ts`
- `src/hooks/audio/useAudioSync.ts`
- `src/hooks/monitor/useMonitorControls.ts`
- `database.rules.json`
- `firestore.rules`
- `firebase.json`
- `r2-backup-worker/**`
- `documentation/SOP/R2_WORKER_UPDATE_GUIDE.md`
- `documentation/architecture/upload-storage-authority.md`

Protected paths may be read for verification. They must not be modified by S0 except documentation updates explicitly authorized after successful S0 implementation.

## 13. Test Harness And RED/GREEN Negative Tests

Required local harness:

- Vitest.
- Cloudflare Worker test environment compatible with native R2 bindings.
- Mechanism-matched R2 test binding named `R2_BUCKET`.
- Rate-limit binding test double named `UPLOAD_RATE_LIMITER`.
- HMAC secret test binding named `UPLOAD_GRANT_SECRET`.
- Firebase-token verifier must be injectable/mocked in unit tests.

Required RED baseline:

Run the negative suite against `cloudflare/test/fixtures/insecure-current-worker.js`, created from the deployed/SOP source. The suite must fail for the expected insecure reasons before hardening.

Required negative tests:

1. Missing auth denied.
2. Invalid auth denied.
3. Expired Firebase token denied.
4. Wrong Firebase audience denied.
5. Cross-owner upload denied.
6. Cross-owner move denied.
7. Raw `sourceKey`/`destKey` cannot move arbitrary object.
8. Forbidden prefix upload denied.
9. Forbidden prefix move denied.
10. Path traversal denied.
11. Encoded traversal denied.
12. Wildcard/unapproved CORS origin denied.
13. Approved CORS origin accepted without wildcard.
14. Unsupported method denied.
15. `GET` request denied even though current checked-in CORS advertises `GET`.
16. `DELETE` request denied even though current checked-in CORS advertises `DELETE`.
17. Upload over 50 MB denied.
18. Missing `Content-Length` denied.
19. Replayed upload grant denied.
20. Expired upload grant denied.
21. Replayed move grant cannot move a different object.
22. Logs do not include token, signed grant, signed URL, secret, raw key, raw UID, or audio body.

Required compatibility tests:

1. Authorized Listening temp upload returns current `UploadResult` fields through `r2Storage.ts`.
2. Authorized move returns current `MoveResult` fields.
3. Existing public URL output remains public for now.
4. `r2Storage.ts` does not send raw keys as authority.
5. Avatar same-user permanent upload still works through secured replacement.
6. Test image temp upload still works through secured replacement.
7. Non-Listening callers are not broken by the adapter contract.

## 14. Deployment Configuration And Required Bindings

`cloudflare/wrangler.toml` must define:

```toml
name = "r2-upload-signer"
main = "worker.js"
compatibility_date = "2026-01-20"

[[r2_buckets]]
binding = "R2_BUCKET"
# The bucket_name value is required in the implementation config, but this PRD records binding names only.

[[durable_objects.bindings]]
name = "UPLOAD_GRANT_REPLAY_LEDGER"
class_name = "UploadGrantReplayLedger"

[[migrations]]
tag = "v1-upload-grant-replay-ledger"
new_sqlite_classes = [ "UploadGrantReplayLedger" ]

[vars]
# FIREBASE_PROJECT_ID and PUBLIC_URL values are required in implementation config, but this PRD records variable names only.

[[ratelimits]]
name = "UPLOAD_RATE_LIMITER"
namespace_id = "<positive-integer-namespace-id>"
simple = { limit = 30, period = 60 }
```

Rate-limit namespace creation and verification:

1. Implementation must include a pre-deploy subtask to confirm a Cloudflare-valid positive-integer rate-limit namespace before deploy. Packet 2M canary uses `205511`.
2. Do not invent a `wrangler ratelimits` command when the installed Wrangler version does not expose one.
3. Required evidence is deploy output plus remote version-view/API or dashboard evidence showing the binding name, namespace ID, limit, and period match checked-in Wrangler config.

Required binding names:

- `R2_BUCKET`
- `PUBLIC_URL`
- `FIREBASE_PROJECT_ID`
- `UPLOAD_RATE_LIMITER`
- `UPLOAD_GRANT_REPLAY_LEDGER`

Required secret names:

- `UPLOAD_GRANT_SECRET`

No secret values may be written in PRD, findings, logs, tests, or commit messages.

## 15. Deployment Procedure

Deployment is human-assisted and blocked until Task 2 implementation approval.

Pre-deploy read-only commands:

```powershell
wrangler deployments status --name r2-upload-signer --json
wrangler versions list --name r2-upload-signer --json
wrangler versions view <PRE_S0_VERSION_ID> --name r2-upload-signer --json
wrangler secret list --name r2-upload-signer --format pretty
```

Implementation must record `PRE_S0_VERSION_ID` from current production before deploy.

Local validation commands:

```powershell
npm --prefix cloudflare ci
npm --prefix cloudflare test
npm --prefix cloudflare run check
```

Deploy command:

```powershell
npm --prefix cloudflare run deploy
```

Post-deploy read-only verification:

```powershell
wrangler deployments status --name r2-upload-signer --json
wrangler versions list --name r2-upload-signer --json
wrangler versions view <POST_S0_VERSION_ID> --name r2-upload-signer --json
```

The deploy is not complete until deployed negative probes prove missing auth, raw-key move, unapproved CORS, unsupported method, over-limit upload, replay, and expired grant fail closed.

## 16. Rollback And Version-Pin Procedure

Rollback must use the exact recovery version captured for the current Worker resource shape. The original pre-S0 Worker version is valid only while its Cloudflare resource and Durable Object migration shape remains deployable. After a Durable Object migration is applied, Task 2.12 must prove the selected recovery version can be activated without crossing an invalid migration boundary.

Rollback command:

```powershell
wrangler rollback <PRE_S0_VERSION_ID> --name r2-upload-signer --message "Rollback PRD-0056 S0 upload-worker hardening" --yes
```

Version-pin command:

```powershell
wrangler versions deploy <PRE_S0_VERSION_ID>@100% --name r2-upload-signer --message "Pin PRD-0056 rollback to pre-S0 version" --yes
```

Rollback verification:

```powershell
wrangler deployments status --name r2-upload-signer --json
wrangler versions view <PRE_S0_VERSION_ID> --name r2-upload-signer --json
```

Rollback must not delete, move, or rewrite any R2 object. It changes only active Worker version traffic. Firebase Hosting rollback targets remain separate from Worker rollback targets and do not solve a Worker Durable Object migration incompatibility.

## 17. Logging And Observability

Required Worker log fields:

- `requestId`
- `operationKind`
- `originAllowed`
- `uidHash`
- `rateLimitOutcome`
- `method`
- `status`
- `reasonCode`
- `sizeBytes`
- `prefixClass`

Forbidden log fields:

- Firebase token.
- Raw token payload.
- Signed upload grant.
- Signed URL.
- Raw object key.
- Raw audio bytes.
- Secret values.
- Full public URL.

Required counters:

- auth denied;
- CORS denied;
- raw-key denied;
- forbidden prefix denied;
- over-limit denied;
- replay denied;
- expired grant denied;
- rate-limit denied;
- authorized upload success;
- authorized move success;
- R2 put failure;
- R2 move copy failure;
- R2 source-delete failure.

## 18. Edge Cases And Failure Handling

1. Missing auth: return `401`.
2. Invalid token: return `401`.
3. Valid token with different UID than grant: return `403`.
4. Browser submits raw `sourceKey`/`destKey` without move grant: return `400`.
5. Browser tampers with upload grant: return `403`.
6. Upload grant expires during teacher delay: return `403` and require a new authorization.
7. PUT upload succeeds but client loses response: retry with same grant returns deterministic duplicate/replay response and must not overwrite a different object.
8. Move succeeds but client loses response: retry with same move grant may return idempotent already-moved success only for the same derived destination.
9. R2 copy succeeds but temp source delete fails: return success with warning code only if durable object exists; log source-delete failure without raw key.
10. R2 copy fails: return failure and leave source unchanged.
11. Oversize upload: return `413` before writing to R2.
12. Missing content length: return `411`.
13. Unapproved origin: preflight and actual request fail closed.
14. Current public playback: unchanged.
15. Existing legacy public R2 URLs: unchanged.
16. Browser route or token unavailable: upload adapter must surface recoverable failure; no silent success.

## 19. Rollout Plan

1. Create checked-in native-R2 Wrangler package and tests.
2. Add negative tests against insecure baseline and record RED evidence.
3. Harden Worker and browser adapter locally.
4. Run local GREEN suite.
5. Run `git diff --check` and UTF-8/doc checks.
6. Obtain product-owner plus architecture/security approval for deploy.
7. Capture pre-S0 deployment/version state.
8. Deploy with Wrangler.
9. Run deployed negative probes.
10. Run one authorized browser upload/move proof without logging token, signed grant, signed URL, or raw key.
11. If any denial or authorized proof fails, rollback to `PRE_S0_VERSION_ID`.
12. Update upload-storage authority and implementation log only after deployed proof passes.

Proposed, pending product-owner plus architecture/security approval - Worker/browser deploy order:

1. Current `src/services/r2Storage.ts:51-53` and `:155-159` send no `Authorization` header, while the S0 Worker requires one. A Worker-only production switch would make active browser clients fail auth.
2. Current checked-in CORS allows only `Content-Type` at `cloudflare/worker.js:8`; a browser-adapter-only switch that sends `Authorization` to the old Worker can fail preflight.
3. Option A: deploy a shadow/canary S0 Worker endpoint, point only an internal/canary browser build at it, prove secured upload/move, then switch the production browser build and Worker route together.
4. Option B: keep the production Worker route but use a strictly time-boxed compatibility window where old root `POST ?filename=...` shape remains available only after Firebase auth and the same owner/prefix checks; unauthenticated legacy authority remains forbidden.
5. Recommendation: Option A, because it avoids extending unauthenticated legacy behavior and gives rollback by returning canary traffic to the current endpoint.
6. No option is selected until product-owner plus architecture/security approval records the deploy order, canary scope, compatibility window, and rollback trigger in findings.

Stop rollout immediately for:

- cross-owner access;
- raw-key move success;
- wildcard CORS;
- unauthenticated upload success;
- authorized Listening upload failure;
- wrong audio URL returned;
- any log leak of token, signed grant, signed URL, secret, raw key, or audio body.

## 20. Acceptance Criteria

1. Canonical Worker mechanism is native `env.R2_BUCKET`.
2. Checked-in `aws4fetch`/S3 Worker mechanism is no longer active source authority.
3. Missing/invalid auth is denied locally and deployed.
4. Cross-owner upload/move is denied locally and deployed.
5. Raw browser keys cannot authorize move, overwrite, or delete.
6. CORS no longer uses wildcard.
7. Only approved origins can call the Worker.
8. Unsupported methods fail closed.
9. Uploads over 50 MB fail closed.
10. Replay and expired grants fail closed.
11. Rate limiting is configured and tested.
12. Authorized Listening upload and move still work.
13. Existing public R2 delivery remains active.
14. No registry, heartbeat, cleanup, private delivery, draft/publish, runtime, Firebase rule, or Google Drive behavior ships.
15. Deploy uses checked-in Wrangler config.
16. Rollback/version-pin procedure is proven.
17. Logs contain security outcomes but no forbidden values.

## 21. Regression Checklist

- [ ] `cloudflare/worker.js` uses `env.R2_BUCKET`, not `aws4fetch`.
- [ ] `cloudflare/wrangler.toml` names `r2-upload-signer`.
- [ ] `R2_BUCKET`, `PUBLIC_URL`, `FIREBASE_PROJECT_ID`, `UPLOAD_RATE_LIMITER`, and `UPLOAD_GRANT_SECRET` names are present where required.
- [ ] Missing auth denied.
- [ ] Invalid auth denied.
- [ ] Cross-owner upload denied.
- [ ] Cross-owner move denied.
- [ ] Raw `sourceKey`/`destKey` denied as authority.
- [ ] Forbidden prefix denied.
- [ ] CORS wildcard absent.
- [ ] Allowed origins pass.
- [ ] Unapproved origin denied.
- [ ] Unsupported `GET` denied.
- [ ] Unsupported `DELETE` denied.
- [ ] Over-50 MB upload denied.
- [ ] Expired grant denied.
- [ ] Replayed grant denied.
- [ ] `UPLOAD_GRANT_REPLAY_LEDGER` binding and SQLite Durable Object migration are present in checked-in Wrangler config.
- [ ] Replay consumes through `UploadGrantReplayLedger` before any R2 access.
- [ ] Replay consumed state survives Durable Object instance restart and cleans up by alarm after the approved retention window.
- [ ] Authorized Listening upload works.
- [ ] Authorized move works.
- [ ] Public delivery still returns current style URLs.
- [ ] `src/services/listeningTestStorage.ts` untouched.
- [ ] Listening builder behavior unchanged except secured upload adapter path.
- [ ] No Firebase rules changed.
- [ ] No R2 lifecycle changed.
- [ ] No private playback delivery added.
- [ ] Rollback command tested against captured version.
- [ ] No forbidden value appears in logs.
- [ ] Logs contain no raw UID.

## 22. Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Worker still trusts browser raw keys | Cross-owner overwrite/move | Negative raw-key tests, grant-derived paths only |
| Auth verifies token but not owner path | Cross-owner access | UID-derived prefixes only |
| Dashboard source remains canonical | Drift repeats | Checked-in Wrangler package becomes source authority |
| CORS remains wildcard | Untrusted origin can call Worker | Exact allowlist tests |
| Rate limiting omitted | Abuse remains possible | Required `UPLOAD_RATE_LIMITER` binding and tests |
| S0 expands into registry/cleanup | Scope explosion | Non-goals and protected-file stop conditions |
| Browser adapter breaks other R2 callers | Authoring/image/avatar regressions | Compatibility tests for current R2 service callers |
| Logs leak grants or URLs | Credential exposure | Log-shape tests and deployed log review |
| Rollback unproven | Production outage lasts longer | Capture pre-S0 version and drill rollback |

## 23. Open Questions

No parent-level or S0 design question remains open after Packet 1C evidence.

Stop conditions that require approval before implementation continues:

1. Cloudflare deployed source or bindings differ from the Packet 1C evidence.
2. Required production origin differs from FR-022.
3. Native R2 binding cannot be tested locally.
4. Rate-limit binding cannot be configured or tested.
5. Existing authorized Listening upload/move cannot be preserved through the secured adapter.
6. Any implementation need requires registry, heartbeat, cleanup, private delivery, Firebase rule changes, R2 lifecycle changes, or runtime changes.

## 24. Definition Of Done

S0 implementation is done only when:

1. Product-owner plus architecture/security reviewer approval is recorded.
2. The child PRD is reconciled against Task 2 scaffold before code changes.
3. RED insecure-baseline evidence exists for every required negative test.
4. Hardened local GREEN evidence exists.
5. Browser adapter tests pass.
6. Deployed metadata shows native `R2_BUCKET` and checked-in Wrangler deployment.
7. Deployed negative probes pass.
8. One authorized upload/move proof passes without leaking forbidden values.
9. Rollback/version-pin procedure is proven against captured pre-S0 version.
10. Findings are appended with exact commands, outputs, and residual risks.
11. Upload-storage authority and implementation log are updated only after deployed proof.
12. Task 1.7 remains incomplete until the other five required child PRDs are created.
13. No runtime, registry, heartbeat, cleanup, private delivery, draft/publish, Firebase rule, R2 lifecycle, Google Drive, Reading V2, solo/homework, or live-session implementation is included in S0.

## 25. Packet 1I File-Architecture Completeness Addendum

Bounded module home and dependency direction:

1. The coherent S0 production home is `cloudflare/src/upload-worker/**`; `cloudflare/worker.js` remains the Wrangler entrypoint and thin request router.
2. Browser dependency direction is `src/services/r2Storage.ts -> secured HTTP contract -> cloudflare/worker.js -> cloudflare/src/upload-worker/** -> env.R2_BUCKET`.
3. Worker modules may import only sibling Worker modules, Worker-compatible platform helpers, and explicit contract types. They must not import application UI, Listening authoring/runtime, neutral shared assessment, or Reading V2 code.
4. `src/services/r2Storage.ts` remains the browser-facing compatibility facade. It may add token/grant request wiring and response adaptation only; it must not gain Firebase-token verification, owner/prefix authority, rate limiting, R2 mutation policy, registry, or lifecycle responsibility.

Required seams:

- Firebase identity verification;
- upload/move grant validation and replay protection;
- owner/prefix/path derivation;
- CORS and method policy;
- rate and byte-limit enforcement;
- native R2 put/copy/delete operations;
- sanitized security event/counter emission.

Size and evidence contract:

1. Packet 1I baseline is `cloudflare/worker.js` 117 lines, `src/services/r2Storage.ts` 446 lines, and `src/services/r2Storage.test.ts` 85 lines.
2. Every new human-maintained production module targets 400 lines or fewer. A module above 400 lines requires split analysis plus architecture/security approval; a new S0 production module above 500 lines is prohibited.
3. Before implementation and after every S0 packet, findings must record `lines before -> after`, responsibility before/after, created/preserved seams, and justification for every net increase in `cloudflare/worker.js` or `src/services/r2Storage.ts`.
4. `cloudflare/worker.js` and `src/services/r2Storage.ts` gain no new domain responsibility. New security algorithms belong in the bounded Worker modules; existing facades receive only imports, delegation, and compatibility wiring.
5. Missing line-count evidence, an inline security algorithm added to `r2Storage.ts`, a Reading V2 dependency, or an unreviewed size-budget exception is an implementation stop condition.

## 26. Task 1.10 Canonical Dependency Synchronization - 2026-06-20

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
| `DAG-20` PRD-0056 / Task 2 S0 | `DAG-00` Task 1 planning approval complete; child-specific authorization still required | Canonical secured upload/move Worker, deploy/rollback/harness, and deployed/current proof | `DAG-21` PRD-0056A only |

PRD-0056 may run only in a separately approved implementation packet and may then parallelize with separately approved Task 3 neutral presentation or PRD-0060 authority-contract test preparation. PRD-0056 does not directly unblock PRD-0058: `DAG-21` PRD-0056A must consume deployed/current S0 proof before `DAG-40`. Task 1.12 approval is recorded, but no implementation completion or child-specific authorization is claimed.

## 27. Packet 2L Option A Local Adapter And Canary Readiness - 2026-06-22

Approvals are recorded separately from the same contextual response:

1. Product-owner approval: User response: `"approve all"`.
2. Architecture/security approval: User response: `"approve all"`.

Approved Option A remains bounded to local readiness:

1. Canary Worker name: `r2-upload-signer-s0-canary`.
2. `VITE_R2_UPLOAD_WORKER_URL` selects the internal/canary endpoint; absence keeps `https://r2-upload-signer.iamhuwng.workers.dev` as the production default.
3. Production browser and production `r2-upload-signer` remain unchanged.
4. Planned rollback is to restore the canary build endpoint to the current production Worker.
5. Stop rollout for auth failure, browser raw-key authority, wrong upload URL, upload/move failure, or caller regression.

Local adapter contract:

1. `src/services/r2Storage.ts` is a thin compatibility facade. It preserves `UploadResult`, `MoveResult`, progress callbacks, public URLs, and current method signatures while mapping current caller families to approved operation kinds.
2. `src/services/r2UploadClient.ts` owns Firebase ID-token retrieval, authenticated `POST /upload/authorize`, authenticated grant `PUT`, authenticated `POST /move`, same-endpoint upload URL validation, and in-memory canonical key to `moveGrant`/`expiresAt` association.
3. Authorize sends only operation intent plus basename, content type, and size. Move sends only `moveGrant`; no raw source/destination key is sent as authority.
4. Existing image, audio, and book-cover replacement requests select approved operation intent and accept server-derived replacement keys. Only `avatar_permanent` preserves server-authorized singleton overwrite.
5. Missing user/token, Worker `401`, missing move grant, and expired move grant surface recoverable errors. No unauthenticated or raw-key fallback exists.
6. Tokens, grants, and keys are not written to `localStorage`, `sessionStorage`, IndexedDB, or console logs.

Canary config and proof boundary:

1. `cloudflare/wrangler.canary.jsonc` differs in Worker name and keeps the production config binding shape for dry-run validation.
2. Production and canary Wrangler commands were `deploy --dry-run` only. No deploy, provisioning, secret mutation, traffic change, rollback, push, production browser build, or R2 mutation occurred.
3. Task 2.11 remains unchecked. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.10 remain checked; Tasks 2.11 through 2.15 remain unchecked.

## 28. Packet 2M Task 2.11 Phase A Canary Provisioning - 2026-06-22

Approval scope: User response: `"Approve PRD-0055 Task 2.11 Phase A canary provisioning only: Cloudflare remote mutation is allowed only for r2-upload-signer-s0-canary prerequisites/deploy and required secret/binding/rate-limit verification. No production Worker deploy, no production traffic change, no rollback, no R2 object mutation, no browser upload/move probe, no push."`

This section supersedes only Packet 2L's dry-run-only remote-state snapshot; Packet 2L local adapter and canary-readiness evidence remains current.

Phase A canary provisioning result:

1. Canary Worker `r2-upload-signer-s0-canary` is deployed at `https://r2-upload-signer-s0-canary.iamhuwng.workers.dev`.
2. Current canary version is `627f7503-8324-45d1-8e23-cdd02828111c`, deployment ID `0e2561d1-e868-49d6-9609-2c03f3b83993`, source `wrangler`, 100% of canary traffic only.
3. The production Worker `r2-upload-signer` remains on deployment ID `92e01212-afd4-4aae-9d72-a548f063008b`, version `20dd8429-5be1-4105-baed-f6dc5af68098`, source `quick_editor`, 100%.
4. Canary secret verification lists `UPLOAD_GRANT_SECRET` as `secret_text`; no secret value is recorded.
5. Canary version-view binding proof lists `R2_BUCKET=kahoot-media`, `UPLOAD_GRANT_REPLAY_LEDGER` Durable Object namespace `bea9a2921503419cae45222576464679`, `UPLOAD_RATE_LIMITER` namespace `205511` with limit 30 / period 60, `PUBLIC_URL`, and `FIREBASE_PROJECT_ID=temp-a1437`.
6. `cloudflare/wrangler.canary.jsonc` uses integer rate-limit namespace `205511` because Cloudflare rejected the prior semantic namespace `prd0056-upload-worker-s0` with API validation code `10021`; current Cloudflare docs require `namespace_id` to be a positive integer string.
7. Production `cloudflare/wrangler.jsonc` is unchanged and still requires a later production deploy-readiness reconciliation before any production deploy.

Scope boundary:

1. No production Worker deploy, production traffic change, rollback, R2 object mutation, browser upload/move probe, version pin, push, production browser build, Firebase rule/config change, `r2-backup-worker/**` change, or task checkbox change occurred.
2. Task 2.11 remains unchecked. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.10 remain checked; Tasks 2.11 through 2.15 remain unchecked.

## 29. Packet 2O Task 2.11 Phase C Readiness Audit - 2026-06-23

Read-only readiness verdict: BLOCKED. This section records Phase C audit evidence only. It does not approve or perform production config prep, secret mutation, deploy, traffic change, rollback, version pin, R2 mutation, Firebase Hosting mutation, push, or Task 2.11 completion.

Re-verified production facts:

1. Production `r2-upload-signer` remains on deployment `92e01212-afd4-4aae-9d72-a548f063008b`, version `20dd8429-5be1-4105-baed-f6dc5af68098`, source `quick_editor`, at 100%.
2. Historical pre-migration `PRE_S0_VERSION_ID=20dd8429-5be1-4105-baed-f6dc5af68098`; Packet 2R later proves this Worker version invalid as a current rollback target after migration `v1-upload-grant-replay-ledger`.
3. Production remote bindings remain only `PUBLIC_URL` and `R2_BUCKET=kahoot-media`; production remote secrets list is empty.
4. Production version detail has no `UPLOAD_GRANT_SECRET`, `UPLOAD_GRANT_REPLAY_LEDGER`, `UPLOAD_RATE_LIMITER`, `FIREBASE_PROJECT_ID`, or `script_runtime.migration_tag`.
5. Production `cloudflare/wrangler.jsonc` still has `UPLOAD_RATE_LIMITER.namespace_id` set to `prd0056-upload-worker-s0`; this remains a blocker because the canary deploy proved the rate-limit namespace must be an integer string.

Re-verified canary facts:

1. Canary `r2-upload-signer-s0-canary` remains on deployment `0e2561d1-e868-49d6-9609-2c03f3b83993`, version `627f7503-8324-45d1-8e23-cdd02828111c`, source `wrangler`, at 100%.
2. Canary binding proof still lists `FIREBASE_PROJECT_ID=temp-a1437`, `PUBLIC_URL`, `R2_BUCKET=kahoot-media`, `UPLOAD_GRANT_REPLAY_LEDGER` namespace `bea9a2921503419cae45222576464679`, `UPLOAD_GRANT_SECRET` as `secret_text`, and `UPLOAD_RATE_LIMITER` namespace `205511` limit 30 / period 60.
3. Canary version detail still has migration tag `v1-upload-grant-replay-ledger`.

Re-verified Firebase Hosting facts:

1. Live `kahut1` Hosting channel remains at version `2ca9c185ac62dd7b`, release `1780366034643000`, status `FINALIZED`, deployed `2026-06-02T02:07:14.643Z`.
2. `PRE_S0_HOSTING_VERSION_ID=2ca9c185ac62dd7b`; this remains the verified Firebase Hosting rollback target.
3. Live `https://kahut1.web.app/` referenced `/assets/index-ClAUP6nO.js`; that entry plus 75 referenced JS chunks had zero occurrences of `/upload/authorize`, `moveGrant`, `VITE_R2_UPLOAD_WORKER_URL`, `r2-upload-signer-s0-canary`, and `r2-upload-signer.iamhuwng.workers.dev`. Live Hosting is not serving the Task 2.11 authenticated grant client.

Exact blockers before Phase C production rollout:

1. Fix production `cloudflare/wrangler.jsonc` rate-limit namespace under a separate config-prep approval.
2. Provision production `UPLOAD_GRANT_SECRET` under separate secret-mutation approval.
3. Deploy production Worker and Firebase Hosting together under the approved Option A order, then prove deployed negative cases and one authorized production upload/move path.
4. Preserve rollback to Worker version `20dd8429-5be1-4105-baed-f6dc5af68098` and Firebase Hosting version `2ca9c185ac62dd7b`.
5. Complete rollback/version-pin proof, final S0 acceptance, and independent review before checking Task 2.11.

Approved later text must be exact. Production config prep approval:

```text
Approve PRD-0055 Task 2.11 Phase C production config prep only: edit cloudflare/wrangler.jsonc to replace UPLOAD_RATE_LIMITER.namespace_id with the approved production integer namespace, run local/dry-run verification, and record evidence. No production deploy, no traffic change, no secret mutation, no R2 mutation, no Firebase Hosting mutation, no rollback, no version pin, no push, and no Task 2.11 checkbox change.
```

Production rollout approval:

```text
Approve PRD-0055 Task 2.11 Phase C production rollout only: allow production r2-upload-signer secret provisioning, Wrangler deploy, Firebase Hosting deploy, deployed negative probes, and one authorized production upload/move proof under the recorded Option A order. No unrelated code/config edits, no existing R2 object mutation, no rollback unless a stop condition triggers, no version pin except the recorded rollback plan, no push, and no Task 2.11 checkbox change until all required proof passes.
```

Rollback/version-pin approval:

```text
Approve PRD-0055 Task 2.11 rollback/version-pin only: if a recorded stop condition triggers, roll back r2-upload-signer to PRE_S0_VERSION_ID 20dd8429-5be1-4105-baed-f6dc5af68098, restore Firebase Hosting live to version 2ca9c185ac62dd7b, verify both versions and no R2 object loss, and record evidence. No new deploy beyond the rollback/version-pin actions, no secret mutation, no unrelated R2 mutation, no push, and no Task 2.11 checkbox change.
```

Later mutation commands, redacted and not run:

```powershell
# After config-prep approval only: edit cloudflare/wrangler.jsonc so
# UPLOAD_RATE_LIMITER.namespace_id = "<PRODUCTION_INTEGER_NAMESPACE_ID>"

wrangler deployments status --name r2-upload-signer --json
wrangler versions list --name r2-upload-signer --json
wrangler versions view 20dd8429-5be1-4105-baed-f6dc5af68098 --name r2-upload-signer --json
node node_modules/firebase-tools/lib/bin/firebase.js hosting:sites:list --project temp-a1437 --json

"<UPLOAD_GRANT_SECRET_REDACTED>" | wrangler secret put UPLOAD_GRANT_SECRET --name r2-upload-signer --config cloudflare/wrangler.jsonc
wrangler deploy --config cloudflare/wrangler.jsonc --message "PRD-0055 Task 2.11 Phase C production rollout"
npm run build
node node_modules/firebase-tools/lib/bin/firebase.js deploy --only hosting:kahut1 --project temp-a1437
wrangler rollback 20dd8429-5be1-4105-baed-f6dc5af68098 --name r2-upload-signer --message "Rollback PRD-0056 S0 upload-worker hardening" --yes
wrangler versions deploy 20dd8429-5be1-4105-baed-f6dc5af68098@100% --name r2-upload-signer --message "Pin PRD-0056 rollback to pre-S0 version" --yes
node node_modules/firebase-tools/lib/bin/firebase.js hosting:clone kahut1@2ca9c185ac62dd7b kahut1:live --project temp-a1437
```

Task state: unchanged. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.10 remain checked; Tasks 2.11 through 2.15 remain unchecked.

## 30. Packet 2P Task 2.11 Phase C Production Config Prep - 2026-06-23

Approval scope: User response: `"Approve PRD-0055 Task 2.11 Phase C production config prep only: set cloudflare/wrangler.jsonc UPLOAD_RATE_LIMITER.namespace_id to dedicated production integer 205512, run local and dry-run verification, and record evidence. No production deploy, traffic change, secret mutation, R2 mutation, Firebase Hosting mutation, rollback, version pin, push, or Task 2.11 checkbox change."`

Config-prep verdict: PASS.

1. Production `cloudflare/wrangler.jsonc` changed only `UPLOAD_RATE_LIMITER.namespace_id` from semantic string `prd0056-upload-worker-s0` to dedicated production integer string `205512`.
2. Worker name remains `r2-upload-signer`; rate policy remains 30 requests per 60 seconds.
3. Bundled Windows x64 Node `v24.14.0` and Wrangler `4.103.0` performed all Worker/config proof.
4. Static config assertion parsed `wrangler.jsonc` and returned worker `r2-upload-signer`, binding `UPLOAD_RATE_LIMITER`, namespace `205512`, limit `30`, period `60`.
5. Full local Worker suite passed seven files, 129/129 tests.
6. Hardened negative runner passed 22/22.
7. Immutable insecure baseline retained fixture SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c` and matched 18 expected RED failures plus four already-safe passes.
8. Production `wrangler deploy --dry-run` exited at `--dry-run` and listed `UPLOAD_GRANT_REPLAY_LEDGER`, `R2_BUCKET=kahoot-media`, `UPLOAD_RATE_LIMITER` at 30 requests/60s, `PUBLIC_URL`, and `FIREBASE_PROJECT_ID=temp-a1437`.

Scope boundary:

1. No production deploy, traffic change, secret mutation, R2 mutation, Firebase Hosting mutation, rollback, version pin, push, or remote-state mutation occurred.
2. Production `UPLOAD_GRANT_SECRET` provisioning, coordinated Worker/Hosting rollout, deployed negative and authorized upload/move proof, rollback/version-pin proof, final S0 acceptance, and independent review remain separately gated.
3. Task state is unchanged. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.10 remain checked; Tasks 2.11 through 2.15 remain unchecked.

## 31. Packet 2Q Task 2.11 Phase C Bridge Rollout Closure - 2026-06-23

Findings-first verdict: PASS for Task 2.11 Phase C bridge rollout closure.

Hard-gate start state: `git rev-parse HEAD` returned `15cd3bb6c3f0e9430106a518cfff8b2e74aaddb4`; `git status --short --branch` was clean on `codex/prd-0055-task-2a-s0-worker-truth` before docs edits. Closure packet performed no deploy, push, rollback, version pin, secret mutation, R2 object mutation, traffic change, or browser/R2 proof rerun.

Prior Firebase OAuth token exposure was contained. `firebase logout iamhuwng@gmail.com` returned `Logged out from iamhuwng@gmail.com`; `firebase login:list` returned `No authorized accounts, run "firebase login"`; `firebase projects:list` failed with `Failed to authenticate, have you run firebase login?`. No token value is recorded.

Read-only closure evidence:

1. Production Worker `r2-upload-signer` active deployment is `ac27c148-3c36-4bd2-a4f9-69608d27768e`.
2. Active production Worker version is `11af545a-479b-4063-a899-d475dd57d2b5` at 100%.
3. Version view for `11af545a-479b-4063-a899-d475dd57d2b5` lists `R2_BUCKET=kahoot-media`, `FIREBASE_PROJECT_ID=temp-a1437`, `UPLOAD_GRANT_SECRET` as `secret_text`, `UPLOAD_GRANT_REPLAY_LEDGER` Durable Object namespace `6653df5f663d4648992dc26bd099b489`, `UPLOAD_RATE_LIMITER` namespace `205512` with limit 30 / period 60, and migration tag `v1-upload-grant-replay-ledger`.
4. Production Hosting live version from rollout evidence is `05cb152a2932b261`.
5. Read-only live asset fetch from `https://kahut1.web.app/assets/r2Storage-CKACZQeH.js` returned HTTP 200, contained `https://r2-upload-signer.iamhuwng.workers.dev`, and did not contain `https://r2-upload-signer-s0-canary.iamhuwng.workers.dev`.
6. Rollback targets were recorded as Worker `20dd8429-5be1-4105-baed-f6dc5af68098`, Hosting pre-S0 `2ca9c185ac62dd7b`, and safe canary Hosting `485aefde01ee7133`. Packet 2R later supersedes the Worker target as invalid after the S0 Durable Object migration; the Hosting rollback targets remain separately recorded but do not solve Worker DO migration rollback.

Prior rollout proof accepted for closure:

1. Live Hosting was first bridged to proven canary Worker and captured `SAFE_CANARY_HOSTING_VERSION_ID=485aefde01ee7133`.
2. Canary authorized browser upload/move/content proof passed and cleanup verified source/destination 404.
3. Production `UPLOAD_GRANT_SECRET` was set by name only; secret value was not printed or recorded.
4. Non-versioned production Worker deploy applied migration `v1-upload-grant-replay-ledger` with rate namespace `205512`.
5. Live Hosting was redeployed to the production Worker endpoint.
6. Deployed negative probes passed: evil-origin preflight 403, no-auth authorize 401, invalid-grant upload 403.
7. Authorized production browser upload/move/content proof passed from live Hosting to `https://r2-upload-signer.iamhuwng.workers.dev`; proof ID `prd0055-phase-c-prod-1782210318093-68018af50b77cc42`; authorize/upload/move/public-content all 200; content SHA-256 `9e82ef3494053b8d0c7b01f952b30cbe6273141d6812a29bd973a0a76101a009` matched.
8. Cleanup deleted only the unique production proof object and verified source/destination 404.
9. Rollback was not triggered.

Task state: Task 2.11 is checked by this closure packet. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.11 are checked; Tasks 2.12 through 2.15 remain unchecked.

## 32. Packet 2R Task 2.12 Corrective Rollback Blocker - 2026-06-23

Findings-first verdict: BLOCKED for Task 2.12 rollback/version-pin drill.

Scope boundary: corrective docs-only packet. No deploy, push, rollback, version-pin, secret mutation, R2 object mutation, Firebase Hosting mutation, traffic change, source/config edit, or Task 2.12 checkbox change occurred in this corrective packet.

Rollback drill evidence from the approved Task 2.12 attempt:

1. Pre-check production Worker active deployment was `ac27c148-3c36-4bd2-a4f9-69608d27768e`.
2. Pre-check production Worker active version was `11af545a-479b-4063-a899-d475dd57d2b5` at `100%`.
3. Attempted rollback target was the recorded pre-S0 Worker version `20dd8429-5be1-4105-baed-f6dc5af68098`.
4. Cloudflare rejected the rollback with API code `10210`: the target cannot be deployed because its Durable Object migration resource state is empty while the current deployment uses migration `v1-upload-grant-replay-ledger`.
5. Exact Cloudflare error meaning: Worker version `20dd8429-5be1-4105-baed-f6dc5af68098` crosses an invalid Durable Object migration boundary after S0; it is no longer a valid current Worker rollback/version-pin target.
6. Post-failure production Worker active deployment remained `ac27c148-3c36-4bd2-a4f9-69608d27768e`.
7. Post-failure production Worker active version remained `11af545a-479b-4063-a899-d475dd57d2b5` at `100%`.

Rollback target correction:

1. Worker version `20dd8429-5be1-4105-baed-f6dc5af68098` remains historical pre-S0 evidence only and must not be presented as a valid current Worker rollback target after migration `v1-upload-grant-replay-ledger`.
2. Firebase Hosting rollback targets remain separately recorded: pre-S0 Hosting `2ca9c185ac62dd7b` and safe canary Hosting `485aefde01ee7133`.
3. Hosting rollback does not solve Worker rollback when Cloudflare rejects the Worker target for Durable Object migration incompatibility.

Required next architecture decision before Task 2.12 can pass:

1. Define a rollback-compatible S0 Worker recovery strategy that stays within the current Durable Object migration shape.
2. Candidate strategy to evaluate next, not implement in this packet: create a rollback-compatible recovery Worker version from current S0 code/config with the same Durable Object migration shape; prove it can be deployed/activated and restored without crossing the DO migration boundary; then use that version as the post-migration rollback target.

Task state: unchanged. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.11 remain checked; Task 2.12 remains unchecked; Tasks 2.13 through 2.15 remain unchecked.

## 33. Packet 2S Task 2.12 Post-Migration Recovery Strategy Design - 2026-06-25

Findings-first verdict: DESIGN RECORDED; Task 2.12 remains unchecked.

Read-only production truth for the design packet:

1. Production Worker `r2-upload-signer` remains active on deployment `ac27c148-3c36-4bd2-a4f9-69608d27768e`, version `11af545a-479b-4063-a899-d475dd57d2b5`, `100%` traffic.
2. Active S0 version detail has source `wrangler`, script ETag `1917ab1452372e37dec12a27e91043244237971c9aaf2b0366d13ae86dca972e`, migration tag `v1-upload-grant-replay-ledger`, handler `UploadGrantReplayLedger`, `R2_BUCKET=kahoot-media`, `FIREBASE_PROJECT_ID=temp-a1437`, `UPLOAD_GRANT_SECRET` as secret binding, `UPLOAD_GRANT_REPLAY_LEDGER` namespace `6653df5f663d4648992dc26bd099b489`, and `UPLOAD_RATE_LIMITER` namespace `205512` at 30 requests / 60 seconds.
3. Pre-S0 Worker version `20dd8429-5be1-4105-baed-f6dc5af68098` remains invalid as a current Worker rollback target after Durable Object migration `v1-upload-grant-replay-ledger`.
4. Firebase Hosting rollback targets remain separate from Worker recovery and do not solve Worker Durable Object migration rollback.

Design decision:

1. Task 2.12 must use a post-migration S0 recovery Worker version as the current rollback target.
2. The recovery Worker version must keep the same Worker name, Durable Object migration tag, Durable Object namespace binding, R2 bucket binding, rate-limit namespace/policy, Firebase project variable, public URL variable, secret binding name, and S0 security contract as active production S0.
3. The recovery version may be a no-op recovery build from the same approved S0 source/config or a narrowly documented operational recovery patch. It must not change storage authority, data shape, bindings, Durable Object migration, or browser contract.
4. The drill must activate the recovery S0 version to 100%, verify it, restore `11af545a-479b-4063-a899-d475dd57d2b5` to 100%, verify it, and record no-object-loss proof before Task 2.12 can be checked.

Later approval text is recorded in the findings ledger for recovery-version creation, recovery drill, and optional deployed behavior proof. No deploy, push, rollback, version-pin, secret mutation, R2 mutation, Firebase Hosting mutation, traffic change, source/config edit, or Task 2.12 checkbox change occurred in this packet.

## 34. Packet 2T Task 2.12 Recovery-Version Creation - 2026-06-25

Findings-first verdict: PASS for recovery-version creation only; Task 2.12 remains unchecked.

Recovery version:

1. Wrangler `versions upload` created non-active Worker version `959065cd-8399-4000-b479-d8303a2f18ad`.
2. Version view proves it has the same rollback-compatible S0 resource shape as active production S0: source `wrangler`, script ETag `1917ab1452372e37dec12a27e91043244237971c9aaf2b0366d13ae86dca972e`, migration tag `v1-upload-grant-replay-ledger`, handlers `fetch`, `UploadGrantReplayLedger`, and `createUploadWorker`, `R2_BUCKET=kahoot-media`, `FIREBASE_PROJECT_ID=temp-a1437`, `UPLOAD_GRANT_SECRET` as secret binding, `UPLOAD_GRANT_REPLAY_LEDGER` namespace `6653df5f663d4648992dc26bd099b489`, and `UPLOAD_RATE_LIMITER` namespace `205512` at 30 requests / 60 seconds.
3. Post-creation active production deployment remained `ac27c148-3c36-4bd2-a4f9-69608d27768e`, version `11af545a-479b-4063-a899-d475dd57d2b5`, `100%` traffic.
4. Version `959065cd-8399-4000-b479-d8303a2f18ad` is the approved candidate for the later Task 2.12 post-migration recovery drill. It is not yet activated.

Remaining gate: Task 2.12 cannot be checked until a later approved drill activates `959065cd-8399-4000-b479-d8303a2f18ad` to `100%`, verifies it, restores `11af545a-479b-4063-a899-d475dd57d2b5` to `100%`, verifies it, and records no-object-loss proof.

Scope boundary: no deploy, push, rollback, version-pin activation, secret mutation, R2 object mutation, Firebase Hosting mutation, source/config edit, or Task 2.12 checkbox change occurred in this packet.

## 35. Packet 2U Task 2.12 Post-Migration Recovery Drill - 2026-06-25

Findings-first verdict: PASS for Task 2.12 rollback/version-pin drill.

Drill evidence:

1. Hard gates passed before mutation: HEAD was `a463a02ec6fd82e0e6af32999598c919d5929d39`; `git status --short` was clean.
2. Active version before drill was deployment `ac27c148-3c36-4bd2-a4f9-69608d27768e`, Worker version `11af545a-479b-4063-a899-d475dd57d2b5`, `100%` traffic.
3. Recovery Worker version `959065cd-8399-4000-b479-d8303a2f18ad` and hardened Worker version `11af545a-479b-4063-a899-d475dd57d2b5` both had source `wrangler`, script ETag `1917ab1452372e37dec12a27e91043244237971c9aaf2b0366d13ae86dca972e`, migration tag `v1-upload-grant-replay-ledger`, handlers `fetch`, `UploadGrantReplayLedger`, and `createUploadWorker`, plus bindings `FIREBASE_PROJECT_ID=temp-a1437`, `PUBLIC_URL`, `R2_BUCKET=kahoot-media`, `UPLOAD_GRANT_REPLAY_LEDGER` namespace `6653df5f663d4648992dc26bd099b489`, `UPLOAD_GRANT_SECRET` as secret binding, and `UPLOAD_RATE_LIMITER` namespace `205512` at 30 requests / 60 seconds.
4. `wrangler versions deploy 959065cd-8399-4000-b479-d8303a2f18ad@100% --name r2-upload-signer --message "PRD-0055 Task 2.12 activate rollback-compatible recovery version" --yes` exited zero and reported `No non-versioned settings to sync. Skipping...`.
5. Recovery verification returned active deployment `5678c2c5-eaf0-4851-a01a-8e8481f9a72a`, version `959065cd-8399-4000-b479-d8303a2f18ad`, `100%` traffic, with the required bindings and migration.
6. `wrangler versions deploy 11af545a-479b-4063-a899-d475dd57d2b5@100% --name r2-upload-signer --message "PRD-0055 Task 2.12 restore hardened production version" --yes` exited zero and reported `No non-versioned settings to sync. Skipping...`.
7. Final restore verification returned active deployment `0c0bca87-6bca-4a42-934d-509299b7e3c9`, version `11af545a-479b-4063-a899-d475dd57d2b5`, `100%` traffic, with the required bindings and migration.
8. No-object-loss proof is constrained to the approved drill surface: only Worker deployment status, version view, and version traffic deployment commands were run. No Worker code deploy, Firebase Hosting deploy, secret mutation, R2 object command, upload/move/delete browser proof, Firebase auth mutation, source/config edit, push, or pre-S0 Worker version activation occurred. The drill did not invoke any Worker upload/move route and both traffic changes reported no non-versioned settings sync.

Task state: Task 2.12 is checked by this packet. Parent Task 2.0 remains unchecked; Tasks 2.6 through 2.12 are checked; Tasks 2.13 through 2.15 remain unchecked.

## 36. Packet 2X Task 2.15 Parent Acceptance - 2026-06-25

Findings-first verdict: PASS for Task 2.15 parent acceptance and parent Task 2.0 S0 acceptance.

Acceptance evidence:

1. Hard gates passed before proof and docs edits: HEAD was `1c988cdb12b3e733875b82ad74ae34b51b66d97d`; `git status --short` was clean.
2. Local Worker proof passed with bundled Windows x64 Node: `npm test` under `cloudflare/` returned 7 files and 129 tests passed.
3. Hardened negative proof passed: `npm run test:security:green` under `cloudflare/` returned 22/22.
4. Insecure baseline remained exact: `npm run test:security:red` returned fixture SHA-256 `93e046d0986811a2c91c3ceb7b48bca7215f75064153cff370750d5e2776a05c`, 18 expected RED failures, and four already-safe passes.
5. Browser adapter proof passed with ambient Node: `npx vitest run src/services/r2UploadClient.test.ts src/services/r2Storage.test.ts` returned 2 files and 33 tests passed.
6. Read-only production Worker status remained deployment `0c0bca87-6bca-4a42-934d-509299b7e3c9`, version `11af545a-479b-4063-a899-d475dd57d2b5`, `100%` traffic.
7. Read-only version view for hardened version `11af545a-479b-4063-a899-d475dd57d2b5` and recovery version `959065cd-8399-4000-b479-d8303a2f18ad` confirmed the same source ETag `1917ab1452372e37dec12a27e91043244237971c9aaf2b0366d13ae86dca972e`, migration tag `v1-upload-grant-replay-ledger`, handlers `fetch`, `UploadGrantReplayLedger`, and `createUploadWorker`, `R2_BUCKET=kahoot-media`, `FIREBASE_PROJECT_ID=temp-a1437`, `UPLOAD_GRANT_SECRET` as secret binding, `UPLOAD_GRANT_REPLAY_LEDGER`, `UPLOAD_RATE_LIMITER` namespace `205512` at 30 requests / 60 seconds, and `PUBLIC_URL`.
8. Deployed negative and authorized proof ID `prd0055-task215-prod-1782401801998-f1c47dc9eed2` passed: no-auth authorize `401`, evil-origin preflight `403`, allowed localhost preflight `204`, valid-token cross-owner upload `403`, raw-key-only move `400`, authorize/upload/move/public content `200`, and content SHA-256 `f7ea8ae7cb25e72717555eef78234d00f1e98a3c1c868d4036d9009614288b71` matched the public content.
9. Cleanup touched only Task 2.15 proof objects: destination cleanup returned `200` success; the temp source had already been deleted by the successful move, so its cleanup returned Cloudflare API `success:false` and rechecked as not found. Source and destination public URLs returned `404`; source and destination Cloudflare API rechecks returned `404` with code `10007`; exact-prefix proof-object scan returned zero remaining `prd0055-task215-prod-*` objects under the teacher temp/durable prefixes.
10. Lifecycle behavior did not change. Remaining registry-backed asset tracking, trusted delete/cleanup authority, checked-in temp lifecycle config, backup/restore coverage, cleanup reconciliation, and metrics remain future PRD-0058 / Task 4 work.
11. Task 2.14 independent review remains clean. No new findings were introduced by Task 2.15 proof.

Scope boundary: no Worker code deploy, Worker traffic mutation, secret mutation, Firebase Hosting deploy, Firebase auth mutation, existing R2 object mutation, source/config edit, push, or Task 3 work occurred. The only R2 writes/deletes were uniquely named Task 2.15 proof objects and cleanup of those proof objects.

Task state: Task 2.15 is checked by this packet. Parent Task 2.0 is checked because Tasks 2.6 through 2.15 are checked and evidence is complete. Task 3 remains unchecked and unstarted.
