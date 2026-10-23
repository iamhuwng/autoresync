# PDF Book QA qualification — October 24, 2026

Status: the bounded correction workflow is verified against isolated real services. Source and CI reconciliation is tracked on draft PR168. This is not broad PRD0062 Full-V1 acceptance or production release.

## Verified behavior

Both source strategies retain saved outline and PDF connection corrections through trusted preview, approval, publication and reopen. Component command b10ba463-835e-4028-9c3f-26385412e2e1 and Full repair command29951fa4-1b02-4622-8ae6-2b43e1604f6e contain both Units, the corrected first-Unit title and configured opening page2. Neither publication was repeated during final qualification.

Shared page-context projections now carry the configured opening page into the runtime. The Full resolver derives it from the assignment's pinned immutable publication, including historical publications, rather than the current authoring plan. Configured pages must belong to the authorized page group. A valid explicit/restored page takes precedence. Actual browser previews render page2 of8 for Component PDFs and page2 of14 for Full PDF; the existing Full assignment also renders page2 of14. Existing narrow-dialog proof covers both strategies at actual390px without horizontal overflow.

The existing Full assignment efa6443f-9f56-48d6-b252-f9954b6de76e was completed, not recreated. Its original creation operation5b0b75e6-4113-49e3-ab49-f7d79eff9ed6 committed through four identical command bodies (202/202/202/200), with one recipient notice. Both Activities then submitted through the real browser with first-command HTTP200 responses. The teacher's trusted projection shows Complete,2 of2 submitted,0 pending review,0 submitted without score, and1.00/1.00 for each Activity. Retained Development result detail shows one graded attempt and the original14-page PDF at page5, with its recorded response.

## Retained Unit correction

Full republication creates fresh local placements while retaining unchanged immutable Activity versions. Their canonical placement IDs belong to the original publication. Requiring those original IDs to equal successor placement IDs denied the retained Unit even though assignment, recipient and publication pins agreed.

The exact reader now accepts a requested local placement and validates it against the exact published reference, immutable original mapping, owner, Book, Unit, Activity, source pages, page groups and canonical origin. It returns the original canonical record unchanged. Homework and runtime launch pass the requested placement. Runtime commands use the same proof when the local placement differs from the original canonical placement. No schema, permissions, canonical records, publications or assignment data were rewritten.

The first retained-submit implementation exceeded the50-call Worker limit. Reusing the already-read canonical record and one request-local publication snapshot removes duplicate immutable reads while schedule and recipient authority retain their live checks. Actual-router qualification under an enforced limit gives two-Unit launch HTTP200 at42 calls and retained submission HTTP200 at50, including terminal result and homework completion projection. The latter has no request-budget margin.

## Checks and preservation

- Opening-page source checks:31 UI/service and28 Worker/caller tests; changed-file lint passes; scoped types12 current/15 baseline/0 added diagnostics.
- Retained-placement source checks:74 focused tests pass; one unrelated native-emulator branch is skipped. Changed-file lint passes; scoped types10 current/10 baseline/0 added. This is not a globally type-clean claim.
- Actual captured assignment resolver is red before the retained fix and green for both Units afterward. Crossed origin, original placement, Unit, Activity, source, page-group, payload and requested-placement proofs are denied.
- QA UI build passes:389 JS assets,13 containing the expected QA project marker,0 containing the unrelated project marker. Backend-only retained repair uses that same checked UI build.
- Final QA Worker2a7a7a0f-2b44-42ad-b632-5550fb99fcb0 passes dry-run and is directly read back at100 percent.
- Post-completion comparison preserves4,105 existing stored homework/delivery/runtime/result leaves, all immutable publication records, and six pinned Firestore documents. The only two existing aggregate rows that change are the Activity group summaries: each gains exactly one new attempt/context and advances its latest pointers to this assignment. All older assignment, attempt and result rows remain unchanged. The earlier blanket whole-root equality check correctly detected these aggregate updates; it is not an old-result preservation failure.

Private request bodies and before/after snapshots stay outside Git. Browser screenshots in the canonical checkout's tmp directory include pdf-existing-assignment-opening2-20261024.png, pdf-existing-assignment-complete-results-20261024.png and pdf-retained-unit-result-page5-20261024.png. Durable non-secret checkpoint notes and source hashes are in the external20261023-assignment-rotation recovery folder.

## Acceptance and release boundary

This supplies scoped evidence relevant to AC-TA-001 (teacher correction/assignment), AC-SR-001 (mapped runtime and persisted submissions) and AC-TR-001 (result review/history). It does not execute those broad acceptance campaigns in full. The machine matrix remains DEFINED_NOT_EXECUTED. Completed publications, assignment creation, historical discovery and unrelated matrices are not reopened for this checkpoint.

QA targets are limited to Firebase luyentap-pdf-qa-20261021, Worker luyentap-book-qualification and the dedicated private QA B2 bucket/prefix. Renewed authority expires2026-10-24T18:50:58.954Z (25 October01:50:58 Bangkok). Production merge/deployment remains excluded. Public-fork mutation qualification is outside this assignment repair.

PR167 cold recovery still needs a persistent isolated Windows ARM64 guest. Donor work remains preserved with finite disposition groups; no cleanup/reset occurred. These are separate original assignments and are not represented as completed by PDF QA.
