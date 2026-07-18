# PRD0062b Packet 2 reconciliation evidence — 2026-07-18

Status: local-only reconciliation. No taskbox changes, deployment, remote probe, remote mutation, remote proof run, cleanup, rollback, or push occurred.

## Authority and classification

- `packet-2-completion-ledger-20260717.md` is historical/evidence-only snapshot. Root C02/C03 remain sole task-checkbox and status owners.
- Ledger `FROZEN` labels classify 2026-07-17 evidence only. Recorded versions and rollback commands are dated claims/readiness evidence, not current state or executed rollback proof.
- 2026-07-17 authenticated complete student-safe PDF authority supersedes older one-page renderer/rendition/per-page-grant proof. Historical evidence remains retained.
- Remote guarded proof and cleanup/readback are not evidenced as completed.

## Local reconciliation implemented

- Authenticated transport: every browser `GET`, `HEAD`, and range request obtains a fresh Firebase ID token and sends bearer authorization; the Worker authenticates before delivery-ledger or R2 access and binds resource authorization to the authenticated `uid`.
- Full-document transport remains one opaque document resource. Authorized responses stream without full buffering; no Browser Run, splitting, rendition, renderer, per-page grant, query-token, cookie, or blob-buffering authority is introduced.
- CORS preflight permits the required `GET`, `HEAD`, `Authorization`, and `Range` surface.
- Proof runner: preflight is required before authentication or mutation; exact Worker versions, complete binding sets, routes, secret names, Firebase rules hash, and denial for an explicitly configured known-existing private-R2 object are re-read after cleanup and must remain equivalent. Document proof is streamed with bounded bytes, deadline, and checksum. Cleanup activates only empty, exact mutable paths before writes, freezes on unresolved Source operations, and requires fingerprint plus delete/readback verification. Immutable Source and publication records remain retained evidence.
- Post-cleanup R2 verifier: a capability-minimal signed S3 adapter exposes exact-object `GET` only. The runner binds its account endpoint to the approved Cloudflare account, binds the bucket to the canonical `BOOK_SOURCE_R2 -> luyentap-book-source-private` preflight expectation, and allowlists only the trusted Source original plus sidecar. The verifier streams and hashes the PDF without full buffering, bounds the integrity sidecar to 4096 bytes, validates exact schema/key/ETag/checksum/byte-size/content-type binding, and emits redacted account/bucket/endpoint/object hashes rather than raw identities. The guarded runner requires an S3 session token and cannot pass final readback unless both objects agree.
- Focused local proof covers Worker authorization/CORS/full/HEAD/range denial, browser token refresh/stream transport, and post-cleanup verifier failures for missing, corrupt, mismatched, oversized, or timed-out reads. Remote execution remains separately approval-gated.
- `presentationMode`: no resolution, fallback, or task-status change. Separate approved single-authority correction remains required.

## Remaining external proof

- Validate that explicitly approved Worker versions, bindings, routes, secret names, and Firebase rules are live.
- Execute exactly one separately approved guarded proof against the isolated disposable namespace.
- Complete cleanup/readback through the hardened runner and retain its artifact.
- Approve and supply temporary, least-privilege R2 S3 read credentials for the exact proof scope, then obtain live post-cleanup original-object and integrity-sidecar byte/hash readback through the local verifier. The local implementation is ready, but no credential was created, no remote object was read, and final immutable-R2 preservation is not yet proven.
- Session-token presence is only a local configuration guard; it does not itself prove credential TTL or least-privilege policy. Exact Cloudflare scope and expiry remain an operator/user approval checkpoint and must be captured from the credential-creation response before use.
- Browser supervision does not replace authenticated object proof. On 2026-07-18 the signed-in Cloudflare account dashboard was identified at the expected account URL, but both DOM and screenshot inspection timed out; no dashboard action, credential creation, object read/download, or configuration change occurred.
