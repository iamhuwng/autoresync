> **DORMANT_AFTER_CODE_RESET:** read [DORMANT-STATUS-2026-07-18.md](DORMANT-STATUS-2026-07-18.md). All status and checkbox state below is dated evidence until fresh reactivation approval and proof.
>
> **CANONICAL FULL-WORDING CHECKLIST — ONE CHECKBOX OWNER**
>
> Root execution checklist. The current canonical PRD and the 2026-07-17 authenticated full-document streaming decision win for Source Delivery. Earlier one-page rendition requirements are superseded. Amendment 043 controls remaining conflicts. Master, recovered, and implementation-audit files are evidence/reference only, not execution checkbox owners.
> Mandatory Packet 2 contract remains required; this note is authority only, not an execution checkbox.
>
> Any inherited `documentation/tasks/PRD0062/**` pointer below is evidence-only; use PRD0062b-local authority and task files for execution.
>
# Task List: PRD0062 Component 02 - Source PDF Delivery

Status: CLOSURE_BLOCKED

Source PRD:
- `documentation/tasks/PRD0062b/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062b/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `src/types/bookSource.types.ts` - Source Version, page label, student-safe readiness, and document-delivery contracts.
- `src/services/book-source-delivery/sourceVersion.service.ts` - New immutable Source Version metadata owner.
- `src/services/book-source-delivery/sourceUpload.service.ts` - New source upload/version creation owner.
- `src/services/book-source-delivery/sourceDocumentDelivery.service.ts` - Authenticated, bounded full-PDF stream authorization and delivery owner.
- `src/services/book-source-delivery/sourceGrant.service.ts` - Expiring document-delivery authorization owner, if an opaque grant remains part of the transport.
- `src/services/book-source-delivery/*.test.ts` - Unit tests for versioning, authorization, page mapping, and idempotency.
- `database.rules.json` - RTDB rules for source metadata/grants, if RTDB is used.
- `firestore.rules` - Firestore rules for source metadata/grants, if Firestore is used.
- `src/__tests__/security/*bookSource*.test.ts` - Emulator tests for source metadata and grant access.
- `r2-backup-worker/*` - Existing Worker area to inspect for R2 conventions, backup testing, and deployment constraints.
- Cloudflare/R2 Worker source owner: dedicated `cloudflare/src/book-source-worker/` with `cloudflare/wrangler.book-source.jsonc`; see `D-P2B-001`. The existing deny-all gateway is boundary/proof infrastructure only; future authenticated ingress needs separate authorization.

### Notes

- The browser receives one opaque authorized student-safe PDF resource, never private storage authority.
- Assigned students may receive the complete pinned student-safe PDF.
- Page Groups and `physicalPageNumber` remain Activity mapping/navigation metadata. They do not require derived page files or per-page transport.
- P2 must stay within Cloudflare Workers/R2 no-cost allowances and Firebase Spark. Workers Paid, Cloudflare Containers, Firebase Blaze, Cloud Run, and other billed PDF runtimes are out of scope.
- Every upload creates a new immutable Source Version; never overwrite an existing source file.
- Do not import, call, extend, or depend on `src/services/file-extractor/file.extractor.ts` or `src/parsers/pdfParser.js`.
- OCR and content extraction are non-goals.
- Current authenticated Book-management authority governs source upload and management. Upload remains private and unpublished; the system stores no rights attestation and performs no rights-specific publication/delivery revalidation.
- Browser Run, page rasterization, PDF splitting, and derived page-rendition generation are not part of the production delivery path.
- Product copy must not imply that excerpt delivery prevents screenshots, screen recording, browser print/save, or external camera capture.

## Packet Contract And Closure Addendum

Before source changes in this component:

- [x] Create or update `documentation/tasks/PRD0062b/authority-and-provenance.md` with storage, rules/security, UI, migration/compatibility, test, browser-proof, proof-classification, and authority-reconciliation sections. Packet 2A docs-only evidence; not production implementation proof.
- [x] Map every source-delivery claim to PRD section, source owner, test title, negative proof, architecture/current-state doc, findings row, traceability row, and taskbox ID. See Packet 2 contract authority-reconciliation table.
- [x] Classify proof separately as local source proof, PDF-engine spike proof, Worker/R2 dry-run or deployed proof, emulator/rules proof, browser proof, rollback/retry proof, or not required for Packet 2.
- [x] Record which claims require remote evidence. Local unit tests cannot close claims about Worker version, R2 object state, signed URL behavior in deployed infrastructure, or live Firebase/Cloudflare permissions.
- [x] Keep phase state explicit. A selected PDF engine and green local tests may move work to `IMPLEMENTED_UNREVIEWED`; they do not make the packet `CLOSED`.

Before completing this component:

- [x] Run stale-claim scans over touched task docs, findings, traceability, and architecture/current-state docs for contradicted source-delivery, Worker, R2, parser, or remote-proof language. Final zero-match scan and anchor review recorded in `C-P2B-004` / `H-P2B-001`.
- [x] Request review only after source, tests, findings, traceability, and docs are updated and inspectable. Independent implementation/spec and security reviews plus rechecks are recorded in `R-P2B-001`.
- [x] Record reviewer method, inspected files/diff, risk model, validation performed, tests not rerun, and residual risks. See `R-P2B-001`.
- [x] Update the packet handoff with current live contract, historical/superseded evidence, verification commands, dirty-path classification, remote-proof status, and unresolved blockers. See `H-P2B-001`.

## Amendment 043 Packet Contract

Non-checkbox authority block. Root task rows remain sole execution boxes. Authority: local `documentation/tasks/PRD0062b/authority-and-provenance.md`, `documentation/tasks/PRD0062b/implementation-audit.md`, `documentation/tasks/PRD0062b/reconciliation-ledger.md`, and approved amendment `documentation/tasks/PRD0062b/prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md`.

### Storage

Component 02 keeps the private object, immutable version, document authorization, backup, and cleanup boundaries. Derived rendition storage is removed from the active contract; no remote storage proof is inferred.

### Security/rules

Inherited management authority, grant binding, private-object, RTDB/Worker boundary, and negative-test obligations remain. Emulator/private-boundary gaps stay open per local implementation audit.

### UI/accessibility/announcements

Upload/document-delivery progress, failure/cancel states, truthful full-document copy, accessibility, and shared announcements remain required when UI is exposed.

### Migration/compatibility

Inherited immutable replacement and compatibility boundaries remain. Do not revive superseded one-page rendition, Browser Run, public-media, or Cloud Run/Build paths; no migration claim.

### Tests

Local focused source evidence only per `implementation-audit.md`; skipped emulator, full Cloudflare, document-stream, browser, and remote rows remain required where unchecked.

### Browser/runtime proof

Inherited URL-expiry, reauthorization, runtime safe-resource, and browser proof gates remain open. Local adapters do not prove deployed Worker/R2 behavior.

### Authority reconciliation

The current canonical PRD and `canonical-task-overrides.json` win for overridden Source Delivery rows. Amendment 043 controls remaining conflicts. Local `authority-and-provenance.md` and `reconciliation-ledger.md` govern packet reconciliation; recovered/master/audit text is not execution authority.

### Evidence classification

`implementation-audit.md` classifications remain authoritative for local salvage: VERIFIED_LOCAL_FAITHFUL, PARTIAL, and IMPLEMENTED_UNVERIFIED. Local proof never implies remote faithfulness.

### Rollback/blockers

No-delta rollback/cleanup contract is inherited. Remaining binding/engine/emulator/browser gaps and unsafe remote mutation remain blockers; `T-P2B0-001` is resolved by `G-P2B0-001`. Stop on missing approval or failed denial proof for later operations.

## Tasks

<a id="t-p2b0-001"></a>
- [x] T-P2B0-001 Prove a distinct non-public source R2 bucket/binding and direct arbitrary disposable-object denial before Packet 2B source metadata/upload skeleton. Record remote evidence through `G-P2B0-001`; never use `kahoot-media`, `r2.dev`, `r2Storage`, `r2UploadClient`, native presigned URLs, source PDFs, or production objects.
  - Fresh remote evidence: [G-P2B0-001](evidence/G-P2B0-001-20260713.md). Exact private bucket/binding, disabled R2 public surfaces, deployed binding readback, known-object unsigned `HEAD`/`GET` denial, exact-key cleanup, and zero-object final bucket metrics passed. Zone-route API returned `403`, so fresh zero-zone-route absence is not claimed; broader Component 02 remains open.
  - Packet 2B0.6 closure (historical prerequisite state): the prior `403` route read is preserved as historical evidence only. After the zone-scoped route policy changed, the sole account-zone route list returned HTTP `200` with zero routes targeting `book-source-private-gateway`; authoritative reads also prove `workers.dev` and Preview URL routing disabled, no Worker custom domain, and the sole `BOOK_SOURCE_R2 -> luyentap-book-source-private` binding. The bucket has `r2.dev` disabled and no R2 custom domain. Cleanup authority is the authenticated post-delete get for the exact disposable key returning `The specified key does not exist`; subsequent Wrangler `object_count: 0`/`bucket_size: 0 B` are interval metric readback, not a live key listing. See `D-P2B0-007`, `F-P2B0-012`, and `C-P2B0-022..025`. It did not itself prove source metadata/upload/product behavior; current Packet 2B local evidence is recorded below.

- Packet 2B local evidence: [D-P2B-001](../PRD0062/contracts-book-activity-packet-2.md#d-p2b-001), [F-P2B-001](../PRD0062/findings-packet-2B-source-version-skeleton.md#f-p2b-001), and `G-P2B-001` prove only local immutable metadata/completion behavior. They do not close Worker, rules, PDF-engine, remote, or browser gates.

- [ ] 1.0 Design immutable Source Version metadata and storage paths
  - [ ] 1.1 Define Source Version metadata with `sourceVersionId`, `bookId`, private R2 asset identity, checksum, byte size, page count, original filename, created by/at, status, and explicit student-safe delivery readiness. Remove derived-rendition readiness from the active production contract.
  - [x] 1.2 Define page-label mapping that persists only one-based Book-facing `physicalPageNumber` and treats labels as safe display/citation metadata. A future PDF-engine index remains adapter-internal and never persists. Local type/service proof: `F-P2B-001` / `C-P2B-005`.
  - [x] 1.3 Define immutable source storage path conventions. Trusted deterministic key is derived from Book/Source Version identity; browser filename never selects it. Local proof: `F-P2B-001` / `C-P2B-002`.
  - [x] 1.4 Define source replacement behavior as new Source Version creation, not mutation. Local proof: `F-P2B-001` / `C-P2B-002`.
  - [ ] 1.5 Define backup/index requirements for Source metadata, the immutable student-safe PDF, document-delivery state, and incomplete-upload cleanup. No derived page-rendition inventory is required.
  - [x] 1.6 Add tests proving Source Versions are immutable and source replacement creates a new version. Local proof: `C-P2B-002`.
  - [x] 1.7 Standardize persisted Book-facing coordinates as one-based `physicalPageNumber` across Source page bounds, page-label mappings, deterministic adapters, and future Assembly consumers. Zero-based PDF-engine positions are adapter-internal only; zero, negative, unsafe, out-of-range, legacy, and mixed representations fail closed. Printed Book labels are display/citation metadata, never identity or ordering authority. Local proof: `F-P2B-001` / `C-P2B-005`.
  - [x] 1.8 Replace `JSON.stringify` Source Version equality with the repository canonical structural serialization convention, preceded by complete Source Version shape validation. Reordered independently decoded records compare equal; arrays retain order; nested mutation, missing/extra fields, and malformed structures fail closed. Local proof: `F-P2B-001` / `C-P2B-005`.

- [ ] 2.0 Add source upload/version creation flow
  - [x] 2.1 Locate current R2 upload conventions and Worker boundaries during Packet 0. Reconciled canonical owner: `D-P2B-001`; generic upload/public-media Worker is excluded.
  - [x] 2.2 Implement upload flow that stores the original privately. Deployed Source Worker version `65b34084-f687-4e2c-a27d-08f14b8e2abb` accepted one generated disposable PDF through real ingress into the canonical private `BOOK_SOURCE_R2` key; exact cleanup readback later returned cache-busted `404` and an empty strongly consistent prefix listing.
  - [x] 2.3 Calculate checksum and byte size server-side or in a trusted upload completion path. The same deployed canary proved stored bytes matched the generated fixture SHA-256 and the trusted integrity sidecar matched canonical key, checksum, and byte size before exact deletion.
  - [x] 2.4 Determine page count without content extraction/OCR. Count mode now uses direct legacy PDF.js range reads from private R2, skips Browser Rendering/quota, and returned `pageCount: 4` in `11,222ms` for the deployed generated-PDF canary.
  - [ ] 2.5 Establish the Packet 2 Source authority foundation through current authenticated Book-management authority: authorize private upload, immutable replacement as a new Source Version, and explicit non-destructive detachment from current Book/Unit use. Detachment or cleanup must not delete pinned or historical Source evidence. Upload remains private and unpublished until Component 03's trusted publication gate succeeds. Prove assignment and delivery fail closed without a valid downstream entitlement, but do not create assignments or issue entitlements in Component 02; Components 04, 05, and 07 own those later consumers. Persist no rights-attestation metadata and perform no rights-specific publication or delivery revalidation.
  - [x] 2.6 Record upload audit/observability without logging PDF content, filenames where unnecessary, object keys, URLs, checksums usable as correlators, or user-provided idempotency keys.
  - [x] 2.7 Add failure tests proving partial upload/version creation does not leave a publishable source. Local proof: missing object and missing page-count adapter leave no canonical Source Version; retry keeps one server-generated identity (`C-P2B-002`).
  - [x] 2.8 Give every upload operation a monotonic trusted revision. Retry and finalization must compare-and-set the exact failed/blocked or uploading revision; stale retry/finalization cannot overwrite a concurrent transition or create a canonical version.
  - [x] 2.9 Define ingress limits and validation before bytes reach durable storage: authenticated content-length policy, streamed hard byte limit, PDF magic/header check, filename length/display sanitization, timeout/abort behavior, and cleanup ownership for incomplete objects.
  - [x] 2.10 Require a versioned HMAC/digest contract for idempotency and derived identifiers, including secret rotation behavior and tests that raw keys never persist or appear in logs.
  - [x] 2.11 Implement one canonical normalized PDF display-filename validator and call it from the current browser request parser, trusted Source Version constructors/repository mutations, retry/finalization, and client-safe projection. It normalizes NFC, rejects compatibility-form ambiguity, invisibles, paths, reserved names, and trailing dot/space, then canonicalizes `.PDF` to `.pdf`. Immutable Source Version stores canonical client-safe `displayFilename`; restricted `provenance.originalUploadFilename` is absent from client-safe projection, while one upload operation retains both through retries. Direct constructor/repository paths reject noncanonical persisted shape. Future production ingress and restore must consume exported validator ports only. Local proof: isolated Node-only Vitest command `npx vitest run --config vitest.book-source-local.config.mjs src/services/book-source-delivery/sourceDisplayFilename.service.test.ts src/services/book-source-delivery/sourceUpload.service.test.ts src/services/book-source-delivery/sourceVersion.service.test.ts src/services/book-source-delivery/bookSourceDependencyBoundary.test.ts` passed 4 files / 49 tests. Authenticated stream/range delivery, current authorization, student-safe readiness, browser, rules, remote, and deployment gates remain open. No migration/backfill: no compatible deployed Source rows are evidenced.
  - [x] 2.12 Give trusted completion claims an attempt identity and expiring lease. Allow safe reclaim only after lease expiry and fresh management authorization; add crash-after-claim, live-lease denial, expiry reclaim, duplicate completion, and failure-recording-failure tests so an interrupted process cannot strand an operation permanently in `uploading`.

- [ ] 3.0 Design and prove the no-render, no-cost production PDF-streaming composition
  - [x] 3.1 Record Browser Run, page splitting, rasterization, one-page PDF generation, and rendition-cache production paths as superseded.
  - [ ] 3.2 Select the authenticated Cloudflare Worker/private-R2 streaming composition for the complete immutable student-safe PDF.
  - [ ] 3.3 Prove the streamed bytes preserve the original PDF and visual fidelity without rendering or transformation.
  - [x] 3.4 Preserve deterministic one-based `physicalPageNumber` and printed-page-label mapping independently of transport.
  - [ ] 3.5 Measure stream-start p50/p95 latency, bounded Worker memory/CPU/request duration, payload and optional range behavior, R2 operations/egress, authorization-refresh latency, concurrency, and free-tier quota consumption for representative 20–500-page PDFs and 2–5 simultaneous deliveries.
  - [ ] 3.6 Prove private R2 input and authenticated streamed output locally and in the approved deployed Cloudflare composition without exposing object authority.
  - [ ] 3.7 Prove idempotent upload, publication, authorization refresh, and delivery retry do not duplicate Source Versions or mutate immutable bytes.
  - [ ] 3.8 Test password-protected, corrupted, scanned/image-only, rotated, landscape, and mixed-size PDFs in the selected viewer/delivery path.
  - [ ] 3.9 Test large files, wrong page counts, printed-page-label mismatch, valid/invalid ranges, resume, and client disconnect.
  - [ ] 3.10 Require an explicit student-safe source decision before publication and reject PDFs containing known teacher-only/answer-key content from student delivery.
  - [ ] 3.11 Test document-resource expiry and browser refresh; refresh must perform a new current authorization check.
  - [ ] 3.12 Record the selected streaming composition, rejection of Browser Run/derived renditions/paid options, edge results, workload assumptions, and deployment constraints.

- [ ] 4.0 Implement student-safe source readiness and authenticated full-document streaming
  - [ ] 4.1 Define student-safe delivery readiness from Book ID, immutable Source Version, publication state, and explicit source classification; no rendition identity exists.
  - [ ] 4.2 Stream the complete pinned student-safe PDF without buffering the whole file in Worker or application memory.
  - [x] 4.3 Preserve page count and source page labels needed by runtime navigation and mapping.
  - [ ] 4.4 Preserve many-to-many Page Group mapping while transport remains one authorized document resource; selecting a page changes the viewer position and mapped Activity set, not the PDF object.
  - [ ] 4.5 Implement idempotent authorization refresh and stream retry.
  - [ ] 4.6 Add tests for student-safe readiness, immutable-byte delivery, Page Group mapping independent of transport, optional range/resume handling, and no derived page objects.

- [ ] 5.0 Add secure document-delivery authorization and request validation
  - [ ] 5.1 Bind document delivery to an authenticated student and an entitlement issued by the owning downstream Book Delivery surface, plus launch context, Book ID, pinned Source Version, published state, student-safe status, and expiry. Component 02 must not mint assignment, Solo, Homework, Course/Class, or public entitlements.
  - [ ] 5.2 Validate every stream and refresh request server-side.
  - [ ] 5.3 Reject modified Book, Source Version, assignment/context, student, entitlement, expiry, and malformed/abusive range parameters.
  - [ ] 5.4 Reject teacher-only/unsafe PDFs, answer-key sources, unrelated Books, unpinned Source Versions, and unpublished sources.
  - [ ] 5.5 Ensure direct private R2 object access is unavailable.
  - [ ] 5.6 Ensure students receive only the governed document stream and never private object keys, bucket authority, storage credentials, or alternate teacher-only source assets.
  - [ ] 5.7 Add expiration, replay, wrong-context, and revoked-entitlement tests.
  - [ ] 5.8 Require a new authorization check for the current student, current delivery binding, pinned Source Version, publication, and student-safe status before replacing an expired resource.

- [ ] 6.0 Add source-delivery rules and positive/negative security tests
  - [x] 6.1 Add rules for Source Version metadata reads/writes.
  - [ ] 6.2 Add rules for student document-delivery records, if any are client-visible.
  - [x] 6.3 Add rules for teacher/admin source management.
  - [ ] 6.4 Add positive test: an authorized student receives the complete pinned student-safe PDF through the governed stream.
  - [ ] 6.5 Add positive test: selecting canonical `physicalPageNumber` opens the correct PDF page and displays the Activities mapped to that page.
  - [ ] 6.6 If HTTP byte ranges are supported, prove each range/resume request reuses current document authorization and cannot expose private R2 authority or another source.
  - [ ] 6.7 Add negative tests for unauthenticated, wrong student, wrong assignment/context, wrong Book, unpinned Source Version, unsafe/teacher-only source, expired/replayed resource, malformed range, and direct R2 access.
  - [ ] 6.8 Add a negative test proving an expired resource cannot be refreshed without re-authorizing the current student and delivery context.
  - [x] 6.9 Keep the dedicated Book Source private-boundary harness in an explicit root/Cloudflare test command used by normal PRD0062 verification. For every method/path denial case, assert zero unauthorized R2 reads, writes, lists, and deletes; status-only assertions are insufficient.
  - [x] 6.10 Keep the explicit trusted `book_source` RTDB boundary with client `.read: false` and `.write: false`, including protection against ancestor/root multi-location writes; only trusted backend persistence may mutate upload operations or Source Versions.

- [ ] 7.0 Integrate source-document delivery with Assembly and Runtime seams
  - [x] 7.1 Expose Source Version metadata to Assembly Workspace without exposing private source authority.
  - [ ] 7.2 Expose the creator-selected page-to-Activity mapping plus one opaque authorized full-document resource to the Book Delivery runtime projection.
  - [ ] 7.3 Ensure Book Runtime receives only a host-created safe document resource plus safe page metadata; no private key, storage authority, provider claim, or teacher-only source.
  - [x] 7.4 Ensure source-assisted Activity launch fails closed when required source context is missing.
  - [ ] 7.5 Add integration tests for Assembly preview and student two-column runtime source access.
  - [ ] 7.6 Define small typed upload, completion, document-authorization, and stream ports with no-cost Cloudflare production adapters plus deterministic in-memory adapters. Assembly/domain tests must not need R2 credentials, provider-specific request shapes, private object-key construction, or PDF rendering.

- [ ] 8.0 Add observability and operational safeguards
  - [ ] 8.1 Register upload, student-safe classification, document authorization, authorization rejection, stream start/completion, range/reconnect, and delivery failure events.
  - [x] 8.2 Ensure logs exclude PDF content, answer content, prompts, private object identity, and sensitive source metadata.
  - [ ] 8.3 Add retry/failure UX states for upload, authorization, and document streaming.
  - [ ] 8.4 Verify teacher/student copy states that assigned students can view the complete student-safe PDF and does not promise screenshot, print, save, or redistribution prevention.
  - [ ] 8.5 Update findings with source-delivery owner paths, streaming decision, superseded renderer path, and unresolved risks.
  - [ ] 8.6 Show original-upload byte/stage progress, cancel before canonical completion where safe, resumable/idempotent retry, cleanup-pending state, and whether published state changed. Runtime shows document loading/refresh failure without creating a second Source Version or derived page artifact.

### Packet P2 live reconciliation — 2026-07-13

Status: `CLOSURE_BLOCKED`. Fresh local source, Worker-harness, emulator, backup, type, and regression proof is recorded in `evidence/P2-closure-20260713.md`. It does not substitute for deployed Worker/private-R2/browser proof.

Freshly reopened checked rows: `4.0`, `4.2`, `4.5`, `5.0`–`5.8`, and `7.5`. The implementation is locally useful, but the production rendition/grant/resource route, configured PDF processor, deployed expiry/refresh flow, exact private-object/full-PDF denial, and authenticated student browser proof are absent. Keeping these rows checked would cross the approved trust boundary.

Freshly accepted local rows: `2.1`, `2.9`, `6.1`, `6.3`, `6.9`, `6.10`, and `8.5`. Their evidence boundary is owner discovery, local Worker ingress validation, Firebase emulator denial, explicit zero-storage-operation harness assertions, and findings documentation respectively.

Exact Component 02 closure blockers: packet-contract mapping/stale-claim/review-close rows still open; `1.0`, `1.5`; `2.0`, `2.5`; `3.0`, `3.5`–`3.7`, `3.9`–`3.12`; `4.0`, `4.2`, `4.4`, `4.5`; `5.0`–`5.8`; `6.0`, `6.2`, `6.4`–`6.8`; `7.0`, `7.5`, `7.6`; `8.0`, `8.3`, `8.6`. The rights-free Source/Main shape is deployed, but the consolidated proof stopped at `source_begin_operation_identity_unresolved`; one bounded read-only correlated log query is required before any correction or retry. Remaining one-page rendition/grant/preview/browser/quota evidence stays open without starting P3.

### P2 transport interpretation — user correction 2026-07-14

Historical non-checkbox authority note — superseded 2026-07-17: this paragraph recorded the former one-page transport decision. It is preserved only to explain older implementation and proof evidence. Current authority is the student-safe full-document decision at the end of this file and in the canonical PRD.

### P2 continuation reconciliation — 2026-07-15

- Superseded `2.5` interpretation: upload rights attestation and rights-specific publication/delivery revalidation were removed by product decision. Current authenticated Book-management authority governs upload and management; private upload alone does not publish anything.
- Reopened `4.4` (superseded detail): an earlier note described caller-supplied page-set authority. Current trusted Assembly Worker derives the complete creator-selected Unit/Page Group set; row remains open only for deployed/public-delivery proof.
- Reconciled `7.3` after its earlier reopen (superseded detail): an earlier note described a multi-page/grant-bearing Book Delivery projection. Current producer projection is one requested page with opaque host resource, so the row is accepted as checked local-only; deployed proof remains open under its production grant/resource rows. P3 correction remains out of this packet.
- Internal Browser Run/PDF.js renderer routing was renamed away from the superseded `book-source-processor` production namespace. This removes a prohibited production dependency marker without promoting the current candidate composition to accepted no-cost production proof.
- Removed unconditional grant authorization from the P2 producer. Earlier cyclic/grant-entrypoint wording is superseded; current main -> one-way Source provider graph now implements local `/v1/book-delivery/launch` and `/v1/book-delivery/resources/:grantId`, current-entitlement/current-pointer resolution, immutable publication resolution, restore invalidation, and fail-closed grant handling. Those mechanics are locally tested but remain undeployed and remote-unproven. Grant rows remain open because no production authority binding or remote route proof is deployed.
- Superseded rights implementation: `assertSourceVersionRightsForPublish`, rights metadata, client `rightsStatus`, upload `rightsConfirmed`, the Book editor checkbox/header, and rights-specific negative proof are removed. Canonical source readiness validation and current Book-management authorization remain separate and fail closed.
- Replaced the legacy multi-page Book Delivery projection with the published Unit's complete `authorizedPhysicalPageNumbers`, one `requestedPage`, one `pageCount: 1` rendition, and one opaque host resource path. Grant IDs, private R2 identity, provider fields, original/full-source authority, and multi-page resources are excluded. Local `7.2`/`7.3` are accepted; `4.4`, grant/resource routes, refresh, and deployed producer proof remain open.
- Fresh Browser/PDF.js visual proof passed: four-page hostile source -> selected physical page 2 -> one-page output; `19,892` output bytes; sampled-pixel MAE `0.1280517578125` text and `1.4471435546875` image; encrypted/corrupt inputs rejected; unsafe JavaScript, attachment, annotation/URI, and metadata markers absent; no full GET; source SHA-256 unchanged; `5050.4ms`; visual artifacts inspected acceptable. This closes local `3.3` only. Performance/quota/zero-billed/deployed private-R2 rows remain open.

### P2 current authority reconciliation — 2026-07-15

Current graph is acyclic: browser -> main `r2-upload-signer` -> one-way `BookSourcePageProviderEntrypoint`. Main locally implements `/v1/book-delivery/launch` and `/v1/book-delivery/resources/:grantId`, entitlement/publication revalidation, RTDB current-entitlement/current-pointer resolution, restore invalidation, immutable publication resolution, and the ephemeral grant DO. Source owns no Assembly or entitlement authority. The rights-free shape is deployed as Source `9db68e3b-78e1-47af-816c-5d211e7855fc` and main `c44246db-f621-4870-9990-8a39b0a5202b`; the latest proof passed begin identity, private ingress, direct count, and immutable completion, then stopped at `assembly_save_candidate_unresolved`. Earlier caller-supplied page-set and cyclic/grant-entrypoint descriptions are superseded. C04 `/runtime/*` routes and the production entitlement writer remain P3/C05-open.

Every local launch/resource request rechecks active record/current entitlement pointer/profile, immutable publication, Book status, canonical ready Source Version, complete page allowlist, and exact page rendition. Restore revokes active entitlements and clears pointers; DO grants are not backup authority. Future P3/C05 issuer must select `current_published_units`, derive entitlement from immutable publication, and atomically activate/supersede the current pointer.

Current proof: Cloudflare 20 files/127 PASS; root `tsc --noEmit` PASS; Cloudflare `tsc -p tsconfig.book-source.json --noEmit` PASS; lifecycle validator PASS; root focused seam 14 files/169 PASS; Source-local 13 files/92; Assembly 8 files/46; UI 1 file/19; backup/restore 6 files/23; Firebase emulator 3 files/14, with Assembly static rules covered inside the Assembly suite. Root parser rejects source-required projections with `source: null`, requires structured projections to carry a source resource, enforces read-only Solo/Homework actions, rejects unordered/duplicate/misbound placements/pages, rejects unsafe/noncanonical metadata and timestamps, rejects mismatched printed labels, rejects malformed/oversized/non-PDF resource bodies, and compares canonical page unions independent of numeric order. `result.json` reports one page, `19,892` output bytes, MAE `0.1280517578125` text and `1.4471435546875` image, encrypted/corrupt rejection, no full GET, unchanged source hash, and acceptable inspected visual artifacts. Firebase Hosting endpoint chain is fixed (`VITE_BOOK_DELIVERY_WORKER_URL` -> `VITE_R2_UPLOAD_WORKER_URL` -> governed Worker); one-page resource stays same-origin. R2 rendition put uses fixed-length `Uint8Array`.

Prior real-browser evidence remains separate and unchanged. Fresh browser verification of the removed rights checkbox could not be executed in this task because the required in-app browser control runtime was unavailable; no standalone Playwright substitution is accepted. C02 `2.4` is remotely proven by the four-page count canary. C02 `2.5` remains open because the proof stopped before replace/delete/publish/assign/deliver management gates. Preserve `presentationMode` as a separate product-decision blocker.

### Packet 2–8 ownership reconciliation — 2026-07-17

C02 `2.5` is scoped as the Source authority foundation: private upload, immutable replacement, non-destructive detachment/cleanup semantics, trusted publication prerequisites, authenticated full-document delivery boundaries, and denial without a downstream entitlement. Assignment and entitlement creation belong to C04/C05/C07; C02 does not issue them. Rights attestation, rights metadata, and rights-specific publication/delivery revalidation are removed from the product contract. The earlier deployed proof (`remote-p2-1784222256147-41bea8ce52`) remains historical renderer-path evidence only; its HTTP 503 and cleanup record do not prove the revised document stream. No taskbox closes from that evidence.

Implementation update — 2026-07-17: authenticated replacement wiring is now present locally across the Book Editor, split Worker control body, trusted Source begin/completion path, and immutable provenance. The legacy single-request transport rejects replacement requests instead of silently creating an unrelated Source Version. Focused UI/client proof passes. C02 `2.5` remains open because trusted current Book/Unit detachment and deployed replacement/management proof are not yet complete.

Lifecycle rebuild update — 2026-07-17: the protected `book_source/lifecycle_records` and `lifecycle_audit_events` projection now shares the Source `/book_source` CAS transaction. Trusted `detach`/`retire` routes transition lifecycle state without mutating Source Version rows; Assembly preview/publish and Delivery reject present retired lifecycle records. Local domain, RTDB, Worker, Assembly, Delivery, rules-candidate, browser-denial, restore, and TypeScript proofs pass. Remote deployment/proof remains open.

### Student-safe full-document decision — 2026-07-17

This decision supersedes the one-page renderer, rendition-cache, and per-page transport assumptions in earlier reconciliation and proof notes above. Those notes remain historical evidence only; they no longer define the product contract.

C02 now owns private immutable upload, Source Version integrity, page-count and printed-label metadata, student-safe readiness, authenticated byte-range/full-stream delivery of the complete pinned student-safe PDF, denial of unpublished/stale/retired/unauthorized sources, and workload proof for 20–500 page documents, 100–200 uploads per day, and bursts of 2–5 simultaneous uploads or deliveries. C02 does not own Browser Run, PDF rasterization, one-page splitting, rendition objects, or per-page grants. Page Groups and `physicalPageNumber` remain mapping and navigation metadata used by Assembly and Runtime.
