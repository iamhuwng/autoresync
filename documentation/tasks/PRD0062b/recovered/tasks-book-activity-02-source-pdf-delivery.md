> IMMUTABLE RECOVERED BASELINE / EVIDENCE ONLY
>
> Exact body from Git object 9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd. Evidence only; canonical task owner is parent-directory Component file.

# Task List: PRD0062 Component 02 - Source PDF Delivery

Status: IMPLEMENTING. Private boundary passed focused proof; immutable metadata/trusted-completion skeleton exists locally; production ingress, PDF engine/rendition, and context-bound delivery remain open.

Source PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `src/types/bookSource.types.ts` - New Source Version, page label, source rights, rendition, and delivery grant contracts.
- `src/services/book-source-delivery/sourceVersion.service.ts` - New immutable Source Version metadata owner.
- `src/services/book-source-delivery/sourceUpload.service.ts` - New source upload/version creation owner.
- `src/services/book-source-delivery/pdfExcerptAdapter.ts` - New adapter boundary for the selected backend PDF excerpt engine.
- `src/services/book-source-delivery/sourceRendition.service.ts` - New authorized Unit rendition generation/cache owner.
- `src/services/book-source-delivery/sourceGrant.service.ts` - New safe delivery grant and authorization owner.
- `src/services/book-source-delivery/*.test.ts` - Unit tests for versioning, authorization, page mapping, and idempotency.
- `database.rules.json` - RTDB rules for source metadata/grants, if RTDB is used.
- `firestore.rules` - Firestore rules for source metadata/grants, if Firestore is used.
- `src/__tests__/security/*bookSource*.test.ts` - Emulator tests for source metadata and grant access.
- `r2-backup-worker/*` - Existing Worker area to inspect for R2 conventions, backup testing, and deployment constraints.
- Cloudflare/R2 Worker source owner: dedicated `cloudflare/src/book-source-worker/` with `cloudflare/wrangler.book-source.jsonc`; see `D-P2B-001`. The existing deny-all gateway is boundary/proof infrastructure only; future authenticated ingress needs separate authorization.

### Notes

- The browser receives a safe resource, never private storage authority.
- Students must never receive the full source PDF.
- Every upload creates a new immutable Source Version; never overwrite an existing source file.
- Do not import, call, extend, or depend on `src/services/file-extractor/file.extractor.ts` or `src/parsers/pdfParser.js`.
- OCR and content extraction are non-goals.
- Teacher/admin must confirm rights before upload/publish. Technical access control does not imply copyright permission.
- Complete and record the PDF engine spike before implementing production rendition generation.
- Product copy must not imply that excerpt delivery prevents screenshots, screen recording, browser print/save, or external camera capture.

## Packet Contract And Closure Addendum

Before source changes in this component:

- [x] Create or update `documentation/tasks/PRD0062/contracts-book-activity-packet-2.md` with storage, rules/security, UI, migration/compatibility, test, browser-proof, proof-classification, and authority-reconciliation sections. Packet 2A docs-only evidence; not production implementation proof.
- [x] Map every source-delivery claim to PRD section, source owner, test title, negative proof, architecture/current-state doc, findings row, traceability row, and taskbox ID. See Packet 2 contract authority-reconciliation table.
- [x] Classify proof separately as local source proof, PDF-engine spike proof, Worker/R2 dry-run or deployed proof, emulator/rules proof, browser proof, rollback/retry proof, or not required for Packet 2.
- [x] Record which claims require remote evidence. Local unit tests cannot close claims about Worker version, R2 object state, signed URL behavior in deployed infrastructure, or live Firebase/Cloudflare permissions.
- [ ] Keep phase state explicit. A selected PDF engine and green local tests may move work to `IMPLEMENTED_UNREVIEWED`; they do not make the packet `CLOSED`.

Before completing this component:

- [x] Run stale-claim scans over touched task docs, findings, traceability, and architecture/current-state docs for contradicted source-delivery, Worker, R2, parser, or remote-proof language. Final zero-match scan and anchor review recorded in `C-P2B-004` / `H-P2B-001`.
- [x] Request review only after source, tests, findings, traceability, and docs are updated and inspectable. Independent implementation/spec and security reviews plus rechecks are recorded in `R-P2B-001`.
- [x] Record reviewer method, inspected files/diff, risk model, validation performed, tests not rerun, and residual risks. See `R-P2B-001`.
- [x] Update the packet handoff with current live contract, historical/superseded evidence, verification commands, dirty-path classification, remote-proof status, and unresolved blockers. See `H-P2B-001`.

## Tasks

<a id="t-p2b0-001"></a>
- [x] T-P2B0-001 Prove a distinct non-public source R2 bucket/binding and direct arbitrary disposable-object denial before Packet 2B source metadata/upload skeleton. Record remote evidence through `G-P2B0-001`; never use `kahoot-media`, `r2.dev`, `r2Storage`, `r2UploadClient`, native presigned URLs, source PDFs, or production objects.
  - Packet 2B0.6 closure (historical prerequisite state): the prior `403` route read is preserved as historical evidence only. After the zone-scoped route policy changed, the sole account-zone route list returned HTTP `200` with zero routes targeting `book-source-private-gateway`; authoritative reads also prove `workers.dev` and Preview URL routing disabled, no Worker custom domain, and the sole `BOOK_SOURCE_R2 -> luyentap-book-source-private` binding. The bucket has `r2.dev` disabled and no R2 custom domain. Cleanup authority is the authenticated post-delete get for the exact disposable key returning `The specified key does not exist`; subsequent Wrangler `object_count: 0`/`bucket_size: 0 B` are interval metric readback, not a live key listing. See `D-P2B0-007`, `F-P2B0-012`, and `C-P2B0-022..025`. It did not itself prove source metadata/upload/product behavior; current Packet 2B local evidence is recorded below.

- Packet 2B local evidence: [D-P2B-001](contracts-book-activity-packet-2.md#d-p2b-001), [F-P2B-001](findings-packet-2B-source-version-skeleton.md#f-p2b-001), and `G-P2B-001` prove only local immutable metadata/completion behavior. They do not close Worker, rules, PDF-engine, remote, or browser gates.

- [ ] 1.0 Design immutable Source Version metadata and storage paths
  - [x] 1.1 Define Source Version metadata with `sourceVersionId`, `bookId`, private R2 asset identity, checksum, byte size, page count, original filename, created by/at, status, and derived rendition status. Local type/service proof: `F-P2B-001` / `C-P2B-002..004`.
  - [x] 1.2 Define page-label mapping that persists only one-based Book-facing `physicalPageNumber` and treats labels as safe display/citation metadata. A future PDF-engine index remains adapter-internal and never persists. Local type/service proof: `F-P2B-001` / `C-P2B-005`.
  - [x] 1.3 Define immutable source storage path conventions. Trusted deterministic key is derived from Book/Source Version identity; browser filename never selects it. Local proof: `F-P2B-001` / `C-P2B-002`.
  - [x] 1.4 Define source replacement behavior as new Source Version creation, not mutation. Local proof: `F-P2B-001` / `C-P2B-002`.
  - [ ] 1.5 Define backup/index requirements for source metadata and derived renditions. Deferred: `book_source` RTDB node/rules and distinct private-bucket backup/recovery lifecycle need their own authorized owner changes and fixture proof.
  - [x] 1.6 Add tests proving Source Versions are immutable and source replacement creates a new version. Local proof: `C-P2B-002`.
  - [x] 1.7 Standardize persisted Book-facing coordinates as one-based `physicalPageNumber` across Source page bounds, page-label mappings, deterministic adapters, and future Assembly consumers. Zero-based PDF-engine positions are adapter-internal only; zero, negative, unsafe, out-of-range, legacy, and mixed representations fail closed. Printed Book labels are display/citation metadata, never identity or ordering authority. Local proof: `F-P2B-001` / `C-P2B-005`.
  - [x] 1.8 Replace `JSON.stringify` Source Version equality with the repository canonical structural serialization convention, preceded by complete Source Version shape validation. Reordered independently decoded records compare equal; arrays retain order; nested mutation, missing/extra fields, and malformed structures fail closed. Local proof: `F-P2B-001` / `C-P2B-005`.

- [ ] 2.0 Add source upload/version creation flow
  - [x] 2.1 Locate current R2 upload conventions and Worker boundaries during Packet 0. Reconciled canonical owner: `D-P2B-001`; generic upload/public-media Worker is excluded.
  - [ ] 2.2 Implement upload flow that stores the original privately. Deferred: separately authorized dedicated Worker ingress/handler/deployment must stream bytes to the already derived `BOOK_SOURCE_R2` key; this local skeleton only verifies a trusted store port.
  - [ ] 2.3 Calculate checksum and byte size server-side or in a trusted upload completion path. Deferred: local skeleton accepts only trusted inspection output; concrete dedicated-Worker checksum/byte computation needs the later ingress implementation and Worker proof.
  - [ ] 2.4 Determine page count without content extraction/OCR. Deferred: `TrustedSourcePageCountAdapter` is an explicit blocked Packet 2C boundary until engine selection/spike evidence.
  - [ ] 2.5 Require teacher/admin source-rights confirmation before upload starts and revalidate rights before publish/public delivery. Keep rights attestation (`who confirmed which rights and when`) separate from current management authorization; an authorized admin/collaborator must not fail solely because they are not the original uploader. No trusted publication owner/rules path yet proves integration.
  - [ ] 2.6 Record upload audit/observability without logging PDF content, filenames where unnecessary, object keys, URLs, checksums usable as correlators, or user-provided idempotency keys.
  - [x] 2.7 Add failure tests proving partial upload/version creation does not leave a publishable source. Local proof: missing object and missing page-count adapter leave no canonical Source Version; retry keeps one server-generated identity (`C-P2B-002`).
  - [x] 2.8 Give every upload operation a monotonic trusted revision. Retry and finalization must compare-and-set the exact failed/blocked or uploading revision; stale retry/finalization cannot overwrite a concurrent transition or create a canonical version.
  - [ ] 2.9 Define ingress limits and validation before bytes reach durable storage: authenticated content-length policy, streamed hard byte limit, PDF magic/header check, filename length/display sanitization, timeout/abort behavior, and cleanup ownership for incomplete objects.
  - [ ] 2.10 Require a versioned HMAC/digest contract for idempotency and derived identifiers, including secret rotation behavior and tests that raw keys never persist or appear in logs.
  - [x] 2.11 Implement one canonical normalized PDF display-filename validator and call it from the current browser request parser, trusted Source Version constructors/repository mutations, retry/finalization, and client-safe projection. It normalizes NFC, rejects compatibility-form ambiguity, invisibles, paths, reserved names, and trailing dot/space, then canonicalizes `.PDF` to `.pdf`. Immutable Source Version stores canonical client-safe `displayFilename`; restricted `provenance.originalUploadFilename` is absent from client-safe projection, while one upload operation retains both through retries. Direct constructor/repository paths reject noncanonical persisted shape. Future production ingress and restore must consume exported validator ports only. Local proof: isolated Node-only Vitest command `npx vitest run --config vitest.book-source-local.config.mjs src/services/book-source-delivery/sourceDisplayFilename.service.test.ts src/services/book-source-delivery/sourceUpload.service.test.ts src/services/book-source-delivery/sourceVersion.service.test.ts src/services/book-source-delivery/bookSourceDependencyBoundary.test.ts` passed 4 files / 49 tests. Worker ingress, leases, engine, rendition, grant, browser, rules, remote, and deployment gates remain open. No migration/backfill: no compatible deployed Source rows are evidenced.
  - [ ] 2.12 Give trusted completion claims an attempt identity and expiring lease. Allow safe reclaim only after lease expiry and fresh management authorization; add crash-after-claim, live-lease denial, expiry reclaim, duplicate completion, and failure-recording-failure tests so an interrupted process cannot strand an operation permanently in `uploading`.

- [ ] 3.0 Spike and select backend PDF excerpt engine
  - [ ] 3.1 Identify candidate PDF engines compatible with the repo deployment/runtime boundary.
  - [ ] 3.2 Prove correct page extraction for image-based PDFs.
  - [ ] 3.3 Prove visual quality preservation is acceptable.
  - [ ] 3.4 Prove deterministic one-based `physicalPageNumber`/page-label mapping, including adapter-local conversion from any engine index.
  - [ ] 3.5 Measure representative extraction p50/p95 latency, peak memory, output bytes/page, cache hit/miss behavior, R2 operations/egress, grant-refresh latency, and estimated cost per Unit. Approve release budgets from recorded pilot evidence and enforce them through repeatable benchmark/operational checks.
  - [ ] 3.6 Prove private R2 input/output works locally and in deployed or dry-run environment.
  - [ ] 3.7 Prove idempotent retries do not duplicate output or corrupt cache state.
  - [ ] 3.8 Test password-protected, corrupted, and scanned/image-only PDFs.
  - [ ] 3.9 Test rotated pages, landscape pages, mixed page sizes, large files, wrong page counts, and printed-page-label mismatch.
  - [ ] 3.10 Test accidental answer-key inclusion, slow extraction/retry timeout, and temporary R2 object cleanup.
  - [ ] 3.11 Test signed URL expiry during runtime and browser refresh after expiry; refresh must perform a new authorization check.
  - [ ] 3.12 Record the selected engine, rejection rationale for alternatives, all edge-case results, and deployment constraints in findings.

- [ ] 4.0 Implement authorized Unit rendition generation and cache
  - [ ] 4.1 Define rendition cache key from Book ID, Source Version, allowed page set, and rendition options.
  - [ ] 4.2 Generate read-only PDF excerpts containing only allowlisted pages.
  - [ ] 4.3 Preserve source page labels needed by runtime navigation.
  - [ ] 4.4 Support many-to-many Page Group examples without expanding access beyond allowed pages.
  - [ ] 4.5 Implement idempotent retry for rendition generation.
  - [ ] 4.6 Add tests for page ranges, duplicate/gap handling according to manifest rules, and cache reuse.

- [ ] 5.0 Add secure delivery grants and request validation
  - [ ] 5.1 Bind grants to authenticated student, launch context, Book ID, Source Version, Unit/Book Node, assignment or library entitlement, allowed page set, expiry, and requested range where applicable.
  - [ ] 5.2 Validate every request server-side.
  - [ ] 5.3 Reject modified Book, Unit, Source Version, page range, assignment, student, or entitlement parameters.
  - [ ] 5.4 Reject answer-key pages, teacher-note pages, unrelated pages, unrelated Books, and unpinned Source Versions.
  - [ ] 5.5 Ensure direct private R2 object access is unavailable.
  - [ ] 5.6 Ensure full original PDF access is unavailable to students.
  - [ ] 5.7 Add expiration and replay tests.
  - [ ] 5.8 Require a new authorization check before replacing an expired runtime URL.

- [ ] 6.0 Add source-delivery rules and negative security tests
  - [ ] 6.1 Add rules for Source Version metadata reads/writes.
  - [ ] 6.2 Add rules for student grant reads, if grants are client-visible.
  - [ ] 6.3 Add rules for teacher/admin source management.
  - [ ] 6.4 Add positive test: authorized student receives exact Unit excerpt.
  - [ ] 6.5 Add positive test: correct Source Version and page labels render.
  - [ ] 6.6 Add positive test: range requests work if supported.
  - [ ] 6.7 Add negative tests for unauthenticated, wrong student, wrong assignment, wrong Book/Unit, modified page range, answer-key page, expired grant, direct R2 object, and full PDF access.
  - [ ] 6.8 Add a negative test proving an expired signed URL cannot be refreshed without re-authorizing the current student and delivery context.
  - [ ] 6.9 Keep the dedicated Book Source private-boundary harness in an explicit root/Cloudflare test command used by normal PRD0062 verification. For every method/path denial case, assert zero R2 reads, writes, lists, and deletes; status-only assertions are insufficient proof that a denied request did not touch storage.
  - [ ] 6.10 Add an explicit trusted `book_source` RTDB boundary with client `.read: false` and `.write: false`, including protection against ancestor/root multi-location writes. Add emulator denial tests for student, teacher, admin, and root updates; only trusted backend persistence may mutate upload operations or Source Versions.

- [ ] 7.0 Integrate source delivery with Assembly and Runtime seams
  - [ ] 7.1 Expose Source Version metadata to Assembly Workspace without exposing private source authority.
  - [ ] 7.2 Expose authorized rendition reference to Book Delivery runtime projection.
  - [ ] 7.3 Ensure Book Runtime receives safe source URL/resource and page metadata only.
  - [ ] 7.4 Ensure source-assisted Activity launch fails closed when required source context is missing.
  - [ ] 7.5 Add integration tests for Assembly preview and student runtime source access.
  - [ ] 7.6 Define small typed upload, completion, rendition, cache, and grant ports with production Worker/backend adapters plus deterministic in-memory adapters. Assembly/domain tests must not need R2 credentials, provider-specific request shapes, or private object-key construction.

- [ ] 8.0 Add observability and operational safeguards
  - [ ] 8.1 Register upload, rendition generation, grant creation, grant rejection, and delivery failure events.
  - [ ] 8.2 Ensure logs exclude PDF content, answer content, prompts, and sensitive source metadata.
  - [ ] 8.3 Add retry/failure UX states for upload and rendition generation.
  - [ ] 8.4 Verify teacher/student copy accurately describes excerpt-limited delivery and does not promise screenshot or local-save prevention.
  - [ ] 8.5 Update findings with source-delivery owner paths, engine decision, and unresolved risks.
  - [ ] 8.6 Show upload/rendition byte and stage progress, cancel before canonical completion where safe, resumable/idempotent retry, cleanup-pending state, and whether published state changed. Reload must recover operation state without creating a second Source Version.
