# Task List: PRD0062 Component 02 - Source PDF Delivery

Status: Draft task list. Execute only through the master orchestration packet order.

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
- Cloudflare/R2 Worker source path TBD in Packet 0 - Actual source-delivery Worker location must be confirmed before implementation.

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

- [ ] Run stale-claim scans over touched task docs, findings, traceability, and architecture/current-state docs for contradicted source-delivery, Worker, R2, parser, or remote-proof language.
- [ ] Request review only after source, tests, findings, traceability, and docs are updated and inspectable.
- [ ] Record reviewer method, inspected files/diff, risk model, validation performed, tests not rerun, and residual risks.
- [ ] Update the packet handoff with current live contract, historical/superseded evidence, verification commands, dirty-path classification, remote-proof status, and unresolved blockers.

## Tasks

<a id="t-p2b0-001"></a>
- [ ] T-P2B0-001 Prove a distinct non-public source R2 bucket/binding and direct arbitrary disposable-object denial before Packet 2B source metadata/upload skeleton. Record remote evidence through `G-P2B0-001`; never use `kahoot-media`, `r2.dev`, `r2Storage`, `r2UploadClient`, native presigned URLs, source PDFs, or production objects.

- [ ] 1.0 Design immutable Source Version metadata and storage paths
  - [ ] 1.1 Define Source Version metadata with `sourceVersionId`, `bookId`, private R2 asset identity, checksum, byte size, page count, original filename, created by/at, status, and derived rendition status.
  - [ ] 1.2 Define page label/index mapping that keeps physical PDF index internal and exposes Book page labels safely.
  - [ ] 1.3 Define immutable source storage path conventions.
  - [ ] 1.4 Define source replacement behavior as new Source Version creation, not mutation.
  - [ ] 1.5 Define backup/index requirements for source metadata and derived renditions.
  - [ ] 1.6 Add tests proving Source Versions are immutable and source replacement creates a new version.

- [ ] 2.0 Add source upload/version creation flow
  - [ ] 2.1 Locate current R2 upload conventions and Worker boundaries during Packet 0.
  - [ ] 2.2 Implement upload flow that stores the original privately.
  - [ ] 2.3 Calculate checksum and byte size server-side or in a trusted upload completion path.
  - [ ] 2.4 Determine page count without content extraction/OCR.
  - [ ] 2.5 Require teacher/admin source-rights confirmation before upload starts and preserve a publish/public-state gate that revalidates the confirmed rights status before publish; final UX may choose placement/copy, but it must not weaken this into only one of upload or publish.
  - [ ] 2.6 Record upload audit/observability without logging PDF content.
  - [ ] 2.7 Add failure tests proving partial upload/version creation does not leave a publishable source.

- [ ] 3.0 Spike and select backend PDF excerpt engine
  - [ ] 3.1 Identify candidate PDF engines compatible with the repo deployment/runtime boundary.
  - [ ] 3.2 Prove correct page extraction for image-based PDFs.
  - [ ] 3.3 Prove visual quality preservation is acceptable.
  - [ ] 3.4 Prove deterministic page label/index mapping.
  - [ ] 3.5 Estimate latency and cost for Unit-sized excerpts.
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

- [ ] 7.0 Integrate source delivery with Assembly and Runtime seams
  - [ ] 7.1 Expose Source Version metadata to Assembly Workspace without exposing private source authority.
  - [ ] 7.2 Expose authorized rendition reference to Book Delivery runtime projection.
  - [ ] 7.3 Ensure Book Runtime receives safe source URL/resource and page metadata only.
  - [ ] 7.4 Ensure source-assisted Activity launch fails closed when required source context is missing.
  - [ ] 7.5 Add integration tests for Assembly preview and student runtime source access.

- [ ] 8.0 Add observability and operational safeguards
  - [ ] 8.1 Register upload, rendition generation, grant creation, grant rejection, and delivery failure events.
  - [ ] 8.2 Ensure logs exclude PDF content, answer content, prompts, and sensitive source metadata.
  - [ ] 8.3 Add retry/failure UX states for upload and rendition generation.
  - [ ] 8.4 Verify teacher/student copy accurately describes excerpt-limited delivery and does not promise screenshot or local-save prevention.
  - [ ] 8.5 Update findings with source-delivery owner paths, engine decision, and unresolved risks.
