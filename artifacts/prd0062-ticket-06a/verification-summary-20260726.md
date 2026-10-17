# PRD0062 Ticket 06A verification — 2026-07-26

## Selection

- Sole primary: GitHub issue #47 / PRD0062 06A.
- Roadmap phase: Foundation.
- Direct prerequisites CLOSED: #27, #29, #44, #46.
- Complete transitive prerequisite chain CLOSED: #25, #26, #27, #29, #44, #45, #46.
- Selection graph: `artifacts/prd0062-graph-20260726-post-ticket20a.json`.
- Auditable selection snapshot: `artifacts/prd0062-selection-20260726-post-ticket20a.json`.

## Implemented proof

- Metadata-only begin and complete client/control routes; PDF bodies and unknown fields are rejected.
- Firebase authentication precedes control handling.
- Current Book-management authority is checked for begin and completion.
- Begin requires an explicit positive 50A upload-gate decision; missing, malformed, false, or void outcomes deny.
- Exact Ticket 05 inspection envelope is accepted only as untrusted bound input.
- Capacity reservation uses the Ticket 04 CAS repository before exact provider authority is returned.
- Idempotent begin rechecks the reservation through CAS before reissuing authority.
- Authority is HTTPS, future-expiring, exact-object, and binds PDF type, SHA-256 payload, metadata checksum, and byte size.
- Completion remains available when begin returns to deny.
- Completion independently verifies exact provider file/version, Book, Source Version, provider, location, bucket, object key, checksum, byte size, and PDF type.
- The atomically terminal `BookSourceUploadOperation` is the canonical immutable usable Source Version row: `sourceVersionId`, verified storage identity, and `verified_completed` state commit together.
- Wrong identity/metadata, stale CAS, expired lease, replay mismatch, concurrent change, and response-path crash fail closed.
- Browser reads/writes, cross-owner writes, direct writes, and ancestor-shaped writes remain denied by the Ticket 04 fragment/emulator proof.

## Verification

- Focused root Vitest service/client/repository/transaction/rule-fragment suites: PASS.
- Focused Cloudflare control host/activation suites: PASS.
- Firebase RTDB emulator deny suite: PASS.
- TypeScript `--noEmit`: PASS.
- Focused ESLint: PASS.
- Production Vite build and bundle budget: PASS; 9,334 modules transformed.
- Wrangler 4.112.0 dry-run: PASS under x64 Node and explicit `media` profile.
- Account guardrail: `media` profile showed sentinel bucket `kahoot-media`.
- Dry-run bundle: 59.62 KiB; gzip 13.70 KiB.
- Preview control state: `disabled`.

## Safety and ownership

- No Worker deployment, B2 mutation, rule deployment, IAM change, secret change, or live upload authority.
- 50A remains all-six-deny/default-deny.
- 03B remains disabled.
- #48 owns browser byte transfer.
- #59 / 09D owns live top-level route and service-identity composition.
- #07 owns abandoned/uncertain-operation reconciliation and release.
- #118 retains assembled/generated `database.rules.json`, emulator, deployment readback, hash, and rollback ownership.
- Historical R2 `production-worker.ts` was not restored.
