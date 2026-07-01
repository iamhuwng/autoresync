# PRD-0055 Task 5 Backend Authority Foundation Design

Date: 2026-06-27

Status: Approved design direction from user: Approach A, backend-authority foundation first.

## Scope

This design defines the corrective foundation needed before Task 5 UI, browser rollout, or parent acceptance can be trusted. The approved PRD-0057 B2 Option B contract is authority over current checked taskboxes and optimistic findings.

Implementation must not deploy, mutate remote state, stage, commit, push, clean the worktree, start Task 6, or update Task 5 checkboxes without separate explicit approval and proof.

## Problem

Current local Task 5 code is service-layer and browser-adjacent. It does not satisfy the approved authority boundary:

- No trusted `functions/src/listening-authoring/**` backend exists.
- No callable/HTTPS `saveListeningDraft`, `publishListeningDraft`, or `mutateListeningAuthoringLifecycle` handlers exist.
- No `listening_authoring/**` RTDB rules/indexes exist.
- Current workflow accepts browser-supplied `ownerId`.
- Idempotency hashing is raw `${ownerId}:${idempotencyKey}` instead of server HMAC-SHA-256.
- Operation evidence is not the atomic authority for mutations.
- Version allocation can race.
- Builder Save draft does not durably write the approved draft authority.
- Builder Publish still routes through legacy mutable save behavior.
- Current docs and taskboxes claim more than production behavior proves.

## Recommended Approach

Build the trusted backend/data-contract foundation first, then expose a thin browser facade, then wire UI.

This is slower than UI-first work, but it aligns proof with the real control boundary: server-derived owner, server-derived hashes, transactional writes, rules denial, backup/restore ownership, and immutable version evidence.

Rejected alternatives:

- UI-first facade with mocked backend: useful for appearance, but it would keep durable Save/Publish false-positive risk.
- Docs reset only: improves authority truth, but does not unblock Task 5 runtime behavior.

## Architecture

### Backend Owner

Create a bounded listening-authoring Functions package under `functions/src/listening-authoring/**`.

Backend owns:

- Auth-derived `ownerId`.
- Kill switch evaluation.
- Restore/rollback guard checks.
- `LISTENING_AUTHORING_IDEMPOTENCY_SECRET` HMAC-SHA-256 hash creation.
- Request canonicalization and `requestHash`.
- Atomic operation claim and mutation.
- Draft conflict-token transaction.
- Immutable version creation and monotonic `versionNumber`.
- Legacy first-edit freeze transaction.
- Soft delete, restore, archive, and discard lifecycle mutations.

Frontend must never write canonical `listening_authoring/**` paths directly.

### Data Paths

Use PRD-0057 B2 Option B paths:

- `listening_authoring/drafts/{draftId}`
- `listening_authoring/revision_drafts/{draftId}`
- `listening_authoring/versions/{versionId}`
- `listening_authoring/operations/{operationId}`
- approved compatibility metadata under legacy `tests/{testId}` only where PRD-0057 allows first-edit freeze/cutover metadata

`draftId`, `versionId`, and `operationId` stay opaque immutable IDs. Existing `tests/{testId}` rows remain compatibility records and first-edit sources, not the canonical new write target.

### Handler Surface

Add three trusted mutation handlers:

- `saveListeningDraft`
- `publishListeningDraft`
- `mutateListeningAuthoringLifecycle`

Each handler must:

- Require authenticated teacher or approved privileged actor.
- Derive owner from auth, not request body.
- Reject direct owner override.
- Validate request shape before DB mutation.
- Claim or read idempotency operation before side effects.
- Return existing logical result on exact idempotent retry.
- Fail closed on same key with changed request hash.
- Preserve operation evidence for 30 days after completion.
- Avoid logging secret values, signed URLs, raw audio, or raw keys.

### Transactions

Draft update, publish, legacy freeze, and lifecycle changes must use Firebase transactions or an equivalent atomic path that prevents check-then-write races.

Required atomic guarantees:

- Stale `expectedConflictToken` cannot overwrite current draft.
- Concurrent Publish cannot create duplicate version numbers.
- Operation record cannot be written only after side effects.
- Duplicate first-edit legacy transition returns the same freeze/revision result.
- Failed/pending cleanup keeps enough operation evidence to prevent duplicate versions.

### Rules And Indexes

Add `listening_authoring/**` RTDB rules/indexes with emulator proof:

- Owner can read own records.
- Super admin read remains explicit if approved by existing rules pattern.
- Browser/client writes to canonical authoring paths are denied.
- Cross-owner reads/writes are denied.
- Required indexes cover owner, operation type, target ID, idempotency key hash, status, createdAt, and expiresAt queries used by backend/DR.

### Backup And Restore

Extend DR coverage before UI rollout:

- Backup includes drafts, revision drafts, immutable versions, and unexpired operations.
- Restore preserves IDs, owners, conflict tokens, version numbers, document hashes, source links, archive metadata, and freeze compatibility links.
- Restore drill proves owner reads, client write denial, immutable version hashes, draft conflict tokens, operation idempotency evidence, and legacy freeze links.
- Backup history may retain expired operation records under DR retention, but product authority treats completed operation records as expired after the approved 30-day window.

### Client Facade

After backend/rules proof, add a bounded browser facade under the existing Listening authoring package. It calls trusted handlers and maps backend results to UI state.

Facade responsibilities:

- No direct canonical DB writes.
- No ownerId argument from browser.
- No secret handling.
- Convert conflict/idempotency/publish-blocker results into typed UI outcomes.
- Keep `src/services/listeningTestStorage.ts` as a compatibility facade, not a new authority layer.

### Builder And UI Wiring

Only after backend/facade proof:

- Replace builder Save draft state-only path with durable `saveListeningDraft`.
- Replace Publish legacy mutable save path with immutable `publishListeningDraft`.
- Wire real `assetId`, `uploadSessionId`, and checksum from the approved upload-session integration.
- Enforce 10 active audio files and 50 MB per file as rejection, not confirm-and-continue.
- Disable the active Save/Publish action while its request is pending.
- Provide reload/merge conflict recovery instead of local token increments.
- Use shared announcement system for save, publish, archive, restore, discard, and failure outcomes.

`ListeningTestBuilder.tsx` must remain a thin orchestrator. New behavior belongs in bounded hooks/components/services with line-count evidence.

## Test Strategy

Each implementation slice starts with observed RED proof, then minimal GREEN implementation.

Required final proof before any Task 5 closure claim:

- Functions unit tests for handler validation, auth-derived owner, kill switch, HMAC idempotency, request hash mismatch, transaction conflicts, concurrent publish, and retry behavior.
- RTDB emulator tests for owner read, cross-owner denial, direct browser-write denial, and index-backed query paths.
- Authoring workflow/facade tests proving no direct canonical writes from browser.
- Builder integration tests proving Save draft persists across reload and Publish creates immutable version authority.
- Upload-session integration tests proving real canonical asset metadata reaches authoring.
- Backup/restore tests and isolated restore drill.
- Guardrail check for dependency direction and file line budgets.
- UTF-8 check and `git diff --check`.
- Production build and bundle budget.
- Stale-claim scan across taskbox, findings, traceability, implementation log, and architecture docs.

## Authority Sync

Do not check any Task 5 box until source, tests, rules, DR proof, traceability, findings, implementation log, architecture docs, and current tasklist all describe the same live behavior.

Historical claims remain append-only. If current source contradicts old closure text, add corrective current-state notes instead of rewriting history as if it was always true.

## Subagent Policy

Implementation may use `superpowers:subagent-driven-development` only after:

- A written implementation plan exists.
- Each subagent task has disjoint scope and exact output format.
- Model override is set within policy range, such as `gpt-5.4-mini` with `high` reasoning for mechanical exploration or isolated implementation.
- Main thread records that current tooling exposes model/reasoning override but does not expose an independent post-spawn model-inspection tool.
- User explicitly approves proceeding despite the post-spawn inspection limitation, or a compliant inspection surface becomes available.

No parallel implementation agents may edit overlapping files.

## Stop Rules

Stop and report BLOCKED if any of these occur:

- Backend handler needs a path/schema not approved by PRD-0057 B2 or approved PRD-0058 minimum storage foundation.
- Direct browser canonical writes are required to make a flow pass.
- Atomic conflict/version/idempotency proof cannot be produced.
- Rules/emulator proof cannot deny browser writes or cross-owner access.
- DR restore cannot preserve operation/version/draft authority.
- Builder durable Save or immutable Publish requires changing solo/homework runtime, live runtime, `AudioPlayer.tsx`, Reading V2 internals, Google Drive behavior, deployment, or remote state.
- Subagent tooling cannot satisfy approved model-control policy and user has not approved the limitation.
