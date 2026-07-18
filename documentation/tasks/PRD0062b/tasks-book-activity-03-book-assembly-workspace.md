> **DORMANT_AFTER_CODE_RESET:** read [DORMANT-STATUS-2026-07-18.md](DORMANT-STATUS-2026-07-18.md). All status and checkbox state below is dated evidence until fresh reactivation approval and proof.
>
> **CANONICAL FULL-WORDING CHECKLIST - ONE CHECKBOX OWNER**
>
> The current canonical PRD and `canonical-task-overrides.json` win for the approved 2026-07-14 Source Delivery corrections. The recovered `9e6e7b2d` hierarchy remains the baseline where no override exists; Amendment 043 controls remaining conflicts. Master, recovered, and implementation-audit docs are evidence/reference only; they do not own execution checkboxes.
>
> Any inherited `documentation/tasks/PRD0062/**` pointer below is evidence-only; use PRD0062b-local authority and task files for execution.
>
# Task List: PRD0062 Component 03 - Book Assembly Workspace

Status: CLOSURE_BLOCKED

Task 1.0 structural Unit support is verified locally; manifest, Page Group, Placement, Unit import/publication, Assembly UI, and runtime work remain open.

Source PRD:
- `documentation/tasks/PRD0062b/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062b/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `src/types/materialCatalog.types.ts` - Existing Book node and material ref contracts to extend for `unit` and Activity placement references.
- `src/services/materialCatalog/materialBooks.service.ts` - Existing Book metadata/node read/write service.
- `src/services/materialCatalog/bookEditor.service.ts` - Existing Book node operation owner and depth-limit enforcement seam.
- `src/services/materialCatalog/bookValidation.service.ts` - Existing Book validation seam to extend for Unit, Activity refs, Page Groups, and staged publication requirements.
- `src/types/bookAssembly.types.ts` - New manifest, Page Group, Placement, reconciliation, Unit status, and publication plan contracts.
- `src/services/book-assembly/manifestCandidate.service.ts` - New manifest staging and validation owner.
- `src/services/book-assembly/pageGroup.service.ts` - New Page Group editing and validation owner.
- `src/services/book-assembly/placement.service.ts` - New Activity Placement binding owner.
- `src/services/book-assembly/unitBundleImport.service.ts` - New Unit Activity JSON import owner.
- `src/services/book-assembly/reconciliation.service.ts` - New stable-key reconciliation and repair owner.
- `src/services/book-assembly/unitPublish.service.ts` - New staged Unit publication owner.
- `src/services/book-assembly/unitPrompt.service.ts` - New Copy Unit JSON Prompt owner.
- `src/components/books/BookEditorWorkspace.tsx` - Existing Book workspace integration surface.
- `src/components/books/BookNodeTree.tsx` - Existing Book tree surface to preserve and extend.
- `src/components/books/BookMaterialPicker.tsx` - Existing picker surface to preserve.
- `src/components/books/BookAssemblyWorkspace.tsx` - New full teacher assembly workspace surface.
- `src/routes/teacherRoutes.tsx` - Teacher route integration.
- `src/config/featureRegistry.ts` - Feature and route observability registration.
- `src/config/routeSecurity.ts` - Route security registration.

### Notes

- The workspace is an assembly hub, not an automatic PDF converter.
- Inputs are immutable source PDF, structured Book manifest/page mapping, and Unit Activity JSON bundles.
- Outputs are validated Book Content Tree, published Activity Materials, Activity Placements, Page Groups, creator-selected page-to-Activity metadata, and student-safe runtime projections. Component 02 owns authenticated full-document delivery; Assembly consumes student-safe Source readiness for preview and publication.
- Teacher shell must keep `TeacherHeader` attached to the shell top edge; page padding belongs inside `main`.
- New UI must use native/shared controls, not Mantine.
- Existing Book metadata editing and existing test-based Book editing must remain available.
- This foundation packet stops before Book/subtree Homework, Affected Homework Review, selective updates, Review Checkpoints, Course/Class delivery, public playable source-assisted Books, and integrity rollout.
- If `bookEditor.service.ts` or another touched Book seam uses `// @ts-nocheck`, add a typed wrapper or remove the suppression before enforcing new PRD0062 invariants there.

## Authority precedence

The current canonical PRD and `canonical-task-overrides.json` control overridden rows; Amendment 043 and packet contracts control remaining conflicts. Master, recovered, and implementation-audit docs remain non-execution evidence.

## Amendment 043 Packet Contract

Packet contract is binding before source changes. Amendment 043 wins any conflict; this section records the minimum contract in this checklist. Detailed local evidence: implementation-audit.md, reconciliation-ledger.md, and the Approved Amendment file.

### storage

Book, Unit, manifest candidate, Page Group, Placement, Activity version, source-version pin, draft, published projection, and revision records need explicit owners and immutable/mutable field boundaries. Indexes use Book/Unit/version/placement/activity dimensions. Candidate writes are temporary; published versions are append-only. Backup/restore keeps prior snapshots and never promotes a partial candidate.

### security/rules

Teacher ownership authorizes assembly writes; students read only published student-safe projections and the authorized pinned student-safe PDF through Book Delivery. Direct browser writes to authoring, candidate, placement, provenance, answer-key, or unpublished projection paths fail closed. Validate Book, Unit, source, Activity, Placement, revision, and approval bindings at every mutation.

### UI/accessibility/announcements

Assembly surfaces preserve TeacherHeader at shell edge, put spacing inside main, use native/shared controls, and expose keyboard-reachable validation, preview, repair, and publish states. Import, save, update, approval, and publish outcomes use shared bottom-right announcements with correct status/alert roles. No one-off banners or silent success.

### migration/compatibility

Legacy section, chapter, test, and placeholder nodes remain readable and publishable. Unit and Assembly state is additive; no backfill or reinterpretation of existing test Books. Rollback leaves legacy data untouched and removes only an uncommitted candidate or draft revision.

### tests

Focused tests cover schema/hidden-ID/page-bound validation, duplicate/cycle detection, many-to-many mapping, source-assisted approval, exact-key reconciliation, stale revision/CAS rejection, atomic publish, projection safety, authorization negatives, and legacy Book regressions. Broad suites do not substitute for these boundary tests.

### browser/runtime proof

Teacher browser proof uses quick-login on http://localhost:5173/ after the last edit and records import, repair, preview, approval, and one-Unit publish behavior. Student/runtime proof is separate and must show only the published projection. Local browser evidence cannot prove deployed storage, rules, Worker, or remote fidelity.

### authority reconciliation

The recovered `9e6e7b2d` hierarchy is retained, with exact approved row replacements recorded in `canonical-task-overrides.json`. The current canonical PRD and override file supersede conflicting historical wording; Amendment 043 and packet contracts control remaining conflicts. Root files own execution checkboxes; recovered files, master orchestration, and implementation audit are evidence only. Every claim maps to a task ID, source owner, focused test, findings/traceability row, and architecture contract.

### evidence classification

Use VERIFIED_LOCAL_FAITHFUL only for the checked IDs listed by the live audit. Keep PARTIAL, IMPLEMENTED_UNVERIFIED, NOT_STARTED, OFF_SPEC, FALSE_CHECKED, and integration/browser/deployed claims open. Record command, cwd, runner/config, exit code, test count, omitted scope, and residual risk in local evidence before changing a checkbox.

### rollback/blockers

Failed import, repair, approval, or publish rolls back the draft snapshot atomically and retains the last durable published version. Block publication on unresolved mappings, missing required source-assisted preview approval, stale revisions, unsafe provenance, authorization failure, unavailable canonical Source Version, missing student-safe classification, or unavailable document-delivery readiness. Rights attestation is not a publication gate. Remote/deployment blockers remain open until separately evidenced.

## Risk-Scaled Change And Closure Rule

Follow the master risk-scaled contract. Record outcome/non-scope, exact owner/interface, compatibility boundary, focused tests, and changed failure proof in this task file; create a separate Packet 3 contract only when conditional persistence, authorization, migration, browser, performance/cost, recovery, rollback, or remote detail cannot remain concise here.

Keep legacy Book, new `unit`, typed boundary, Assembly behavior, and source-delivery integration proof distinct. Before `VERIFIED`, reconcile only touched current-state docs and run focused proof plus governance/diff checks. Create a handoff only under the master conditional-handoff rule.

## Tasks

- [x] 1.0 Add Book `unit` node support while preserving legacy `test`
  - [x] 1.1 Add `unit` to the Book node taxonomy.
  - [x] 1.2 Preserve existing `section`, `chapter`, `test`, and placeholder behavior.
  - [x] 1.3 Preserve `BOOK_NODE_MAX_DEPTH = 5` unless Packet 0 finds a documented current alternative.
  - [x] 1.4 Update Book validation to accept `unit` and reject cycles, missing parents, duplicate keys, and excessive depth.
  - [x] 1.5 Treat `unit` as a structural node in Book readiness/status derivation while preserving existing `test` readiness behavior.
  - [x] 1.6 Ensure assignable structural-node eligibility excludes placeholders and every incomplete Unit state (`missing`, `invalid`, `staged`).
  - [x] 1.7 Add tests proving a valid `unit` is structurally ready for existing Book public review, legacy test-based Books remain ready/publishable, and every incomplete Unit state remains teacher-only.

### 1.0 local closure (2026-07-11)

- Typed Book taxonomy adds `unit` plus `valid`, `missing`, `invalid`, and `staged` structural readiness. Existing Book storage remains `material_catalog/book_nodes/{bookId}/{nodeId}`; no parallel Unit store, manifest, Page Group, Placement, Activity import, source rendition, or student path exists.
- `bookValidation.service.ts` owns Unit state normalization, readiness/status derivation, assignable structural-node eligibility, malformed-state rejection, and duplicate `nodeId` detection. Missing/invalid Units derive `needs-repair`; staged Units derive `draft-in-progress`; only valid Units may make a structurally ready Book. Legacy `section`, `chapter`, and `test` behavior remains unchanged. `materialBooks.service.ts` reuses that typed readiness boundary before public projection approval, so stale stored `ready` metadata cannot publish an incomplete Unit.
- Existing Book-node RTDB validation accepts `unit` with only the documented readiness states, accepts the derived `needs-repair` Book status, rejects that Unit-only field on legacy nodes, and forbids Unit readiness from public Book projection nodes. New Units created by the existing Book controls are `staged`; this adds no Assembly route or new action/event.
- Focused x64 Vitest proves valid/invalid/missing/staged Units, legacy structural readiness/publication, parentage/cycle/depth/duplicate order/key failures, root and child Unit creation, public-approval denial for stale-ready incomplete Units, Material Catalog Book-node rules, and Packet 1 capability fail-closed regressions. Final targeted strict TypeScript check for all touched production files plus `vite-env.d.ts` is clean. The full repository `tsc --noEmit` passed earlier in this slice, but later reruns produced no diagnostics before harness timeouts; that harness behavior is recorded separately and does not substitute for the targeted proof.
- Contained correction: the validation map previously overwrote duplicate `nodeId` values before parent/depth analysis. Task 1.0 now rejects duplicate IDs at the typed structural boundary; no storage migration or unrelated Book-editor refactor was made.
- This is structural readiness only. It does not authorize an Activity placement or launch: Component 03 / Task 3.0 still owns the placement adapter/pinned placement contract; Component 04 / Tasks 1.0-2.0 still own immutable Book Delivery resolution and runtime launch. `interactive-activity` remains operationally fail-closed.
- Local teacher-browser check at `http://localhost:5173/` served a blank shell with no visible DOM or console error, so no quick-login or persistent action was attempted. This UI-state harness block does not replace the focused component/rules proof; full teacher Assembly browser verification remains Component 03 / Task 8.0 scope.

- [ ] 2.0 Implement manifest candidate import and validation
  - [x] 2.1 Define manifest schema for Book structure, stable logical keys, page labels, Activity slots, order, and Page Groups.
  - [x] 2.2 Stage manifest imports as temporary candidates.
  - [x] 2.3 Validate schema and Source Version page bounds before current state changes.
  - [x] 2.4 Generate proposed Book Content Tree and Page Groups from a valid candidate.
  - [x] 2.5 Show exact errors and warnings without mutating current draft or published state.
  - [x] 2.6 Add tests for exact-key match, duplicate keys, cycles, page gaps/overlaps/duplicates, and page-bound errors.

- [x] 3.0 Implement Page Group and Placement editing contracts
  - [x] 3.1 Define Page Groups as many-to-many mappings between pages and ordered Activity Placements, or reference-only pages.
  - [x] 3.2 Define Placement records containing Book context, Activity ID, node ID, Page Group IDs, and order.
  - [x] 3.3 Ensure Activity Materials do not intrinsically belong to one Book Node.
  - [x] 3.4 Implement page-mapping editor operations independent of Activity JSON edits.
  - [x] 3.5 Support one Activity mapped to multiple pages and one page mapped to multiple Activities.
  - [x] 3.6 Support reference-only pages and PDF-focus runtime hints.
  - [x] 3.7 Add tests for many-to-many Page Groups, reference-only pages, and mapping validation.

- [ ] 4.0 Implement Unit Activity JSON staging/import
  - [x] 4.1 Support initial Unit bundle imports for first creation.
  - [x] 4.2 Validate every Activity in the bundle before any permanent write.
  - [x] 4.3 Validate one-family/one-answer-rule shape, Task Profile, context requirement, presentation mode, embedded stimulus, asset refs, and hidden-ID exclusion.
  - [ ] 4.4 Require mapped pages for source-assisted Activities before preview/publish can succeed.
  - [x] 4.5 Create Activity IDs and Placement IDs only after the entire operation is ready.
  - [x] 4.6 Bind manifest `activityKey` to Activity ID and Placement.
  - [x] 4.7 Ensure invalid import cannot partially alter draft or publication.
  - [x] 4.8 Add atomic import tests.

- [ ] 5.0 Implement reconciliation and manual repair workflows
  - [x] 5.1 Build the exact PRD reconciliation layout: `Current Content Tree | Proposed Content Tree | Resolution and Preview`.
  - [ ] 5.2 Show summary counts, unresolved-only filter, category filter, source-page preview, current/proposed Activity preview, explicit resolution actions, revalidation status, and publish blocker list. A wrongly generated or uncertain `presentationMode` must remain a publish blocker until a separately approved single-authority correction mechanism exists; do not hard-code JSON-re-import-only or an independent Placement/UI override.
  - [x] 5.3 Show added, removed, renamed, reordered, moved, page-mapping-changed, and unresolved items.
  - [x] 5.4 Implement exact-key identity matching.
  - [x] 5.5 Treat fuzzy matching as suggestion only, never automatic identity authority.
  - [x] 5.6 Preserve identity for rename/reorder when stable keys match.
  - [x] 5.7 Require explicit resolution for cross-Unit moves.
  - [x] 5.8 Implement source replacement reconciliation without reimporting unchanged Activities.
  - [ ] 5.9 Require teacher preview approval when a source-assisted Activity's pinned Source Version, page labels, one-based `physicalPageNumber` values, rotation, or Page Group mapping changes even if stable Activity keys still match. Transport/resource identity is not part of mapping approval.
  - [x] 5.10 Revalidate after every repair.
  - [ ] 5.11 Block publication while required reconciliation issues or preview approvals remain.
  - [ ] 5.12 Add reconciliation tests for the three-column layout controls, rename, reorder, move, source replacement, source-assisted preview approval, unresolved `presentationMode` blocking, and rare unresolved cases.

- [ ] 6.0 Implement Unit preview and staged publication
  - [ ] 6.1 Generate actual student runtime preview from the student-safe projection and the same authorized full-document viewer contract used by students. Opening a selected `physicalPageNumber` must display that PDF page and the Activities mapped to it without creating a derived page resource.
  - [x] 6.2 Implement foundation Unit statuses: Published, Valid-ready-to-publish, Missing JSON, Invalid, Needs reconciliation, and Draft changed. Defer `Pending homework updates` until Component 06.
  - [x] 6.3 Publish one Unit atomically while later Units remain missing/teacher-only.
  - [ ] 6.4 Produce and deploy a published-only student-safe Unit projection whose pinned Source Version, student-safe source status, canonical page labels, Page Groups, and page-to-Activity mappings are derived from trusted persisted publication state. Exclude private R2 identity and expiring document resources. Component 04 owns runtime consumption and Component 05 owns assignment-derived entitlement issuance; neither is a Component 03 closure prerequisite.
  - [x] 6.5 Add staged publication tests without implementing Homework or update behavior in this packet.

- [x] 7.0 Implement required Copy Unit JSON Prompt and Copy Revision Prompt capabilities; teacher use remains optional
  - [x] 7.1 Expose Copy Unit JSON Prompt after source PDF, manifest, and selected Unit are valid. The capability is required, but teacher use remains optional and it is never an import prerequisite or approval gate.
  - [x] 7.2 Include Book title, selected Section/Chapter/Unit path, selected page list, mapped Activity keys/order, current Activity schema version, optional namespaced Task Profile format, supported interaction families/variants, supported embedded stimulus kinds, existing media asset-reference forms, context requirement rules, and presentation mode rules.
  - [x] 7.3 Include the one-family/one-answer-rule constraint, source-assisted page/label requirements, answer/scoring requirements, Unit bundle envelope, no generic Task Groups/Task Sets/Resource entities rule, no system IDs rule, JSON-only requirement, and a complete valid example.
  - [x] 7.4 Explain structured versus source-assisted selection with examples and forbid unsupported visual approximation merely to choose `structured`.
  - [x] 7.5 Implement Copy Revision Prompt for full-content replacement with current editable content, supported schema/families/variants/stimulus kinds, one-family/one-answer-rule constraint, Task Profile naming rules, context-requirement rules, structured/source-assisted rubric, teacher correction instructions, JSON-only requirement, and instruction not to include IDs or Placement/provenance data.
  - [x] 7.6 Ensure Copy Revision Prompt excludes Activity/system IDs, Source/Manifest IDs, Book placement, ownership, student data, and published homework data.
  - [x] 7.7 Add fallback behavior when clipboard copy fails.
  - [x] 7.8 Add tests proving both prompt-copy capabilities are present when context is available, plus Unit prompt content, revision prompt content, JSON-only/no-ID guards, complete example presence, media refs, answer/scoring requirements, and fallback behavior.

- [ ] 8.0 Build Assembly Workspace UI, accessibility, route, and observability coverage
  - [x] 8.1 Add or expand the existing Book editor route according to route/observability rules.
  - [x] 8.2 Build teacher shell regions: Book/source status, Content Tree, Unit imports and validation, Page mapping, Activity preview/revision, and Publish/impact status.
  - [x] 8.3 Preserve normal Book metadata editing and existing material ref editing.
  - [ ] 8.4 Add accessible controls, keyboard support, clear validation states, and native/shared UI styling.
  - [x] 8.5 Register new route and user actions in feature registry/observability.
  - [x] 8.6 Use shared action announcements for create/save/update/publish/import outcomes.
  - [x] 8.7 Add component tests and browser verification notes for teacher desktop Assembly Workspace.
  - [x] 8.8 Add or verify a fully typed integration wrapper for touched legacy Book editor seams; no new PRD0062 module may use `// @ts-nocheck`.
  - [x] 8.9 Update findings with final route, component, service, and typed-boundary ownership paths.

### Evidence-hardening subtasks (append-only; parent boxes remain open)

- [x] 2.7 Accept Unit Activity JSON through a file picker and drag/drop target in addition to any clipboard convenience flow; route both paths through the same schema/hidden-ID/page-bound validator, with explicit type, size, encoding, and malformed-JSON errors.
- [x] 2.8 Keep teacher use of `Copy Unit JSON Prompt` optional while keeping the capability itself required. Clipboard copy failure must fall back to a labelled read-only textarea and manual-copy guidance; clipboard contents must never be treated as an implicit import source.
- [x] 2.9 Add progressive onboarding for first-time assembly: show required steps and current completion, defer advanced controls until needed, preserve the last completed step on revisit, and expose keyboard/screen-reader labels for step state and next action.
- [ ] 2.10 Show determinate original-upload, validation, page-count, and student-safe readiness progress, with cancel before finalization, idempotent retry after transient failure, and an explicit terminal error. A canceled/failed or stale retry must not promote a partial Source Version or alter the last published binding. No rendition-generation stage exists.
- [ ] 5.13 Store and render explicit provenance citations per Activity/interaction: source-version reference, printed page label, one-based `physicalPageNumber`/range, Page Group, and answer-key evidence citation. Mark low-confidence, unsupported, missing-evidence, and label-mismatch cases for teacher review; block publish until required review decisions are recorded.
- [x] 5.14 Detect concurrent draft revisions during repair/import. Preserve unsaved local edits, show conflict state with keep-current/accept-proposed/manual-resolution choices where safe, and make resume after reload return to the last durable candidate without silently overwriting another teacher's change.
- [x] 8.10 Verify reconciliation at teacher widths `1208px`, `768px`, and `375px`: three-column review becomes a readable stacked flow without horizontal page overflow, source/current/proposed previews retain clear labels, controls remain keyboard reachable, and visible mobile actions meet the 44px target.

### Packet P2 live reconciliation — 2026-07-13

Status: `CLOSURE_BLOCKED`. Fresh Assembly service/UI/type/browser proof is recorded in `evidence/P2-closure-20260713.md`.

Freshly reopened checked rows: `4.0`, `4.4`, and `6.4`. Source-assisted preview/publication still lacks a production-authorized rendition/approval boundary, and student-only-published visibility requires the P3 runtime consumer. Parent `4.0` cannot remain checked while `4.4` is open.

Freshly accepted rows: `2.4`; `3.0`, `3.4`; `5.1`, `5.3`, `5.7`, `5.8`; `7.0`–`7.8`; `8.2`, `8.3`, `8.5`–`8.9`; `2.8`, `2.9`, and `8.10`. Local review blockers for malformed nested input, many-to-many reconciliation, current-mapping provenance, invalid visible-state mutation, stale reload/publication conflicts, and per-Unit slot validation were corrected before acceptance.

Exact Component 03 closure blockers: `2.0`, `2.10`; `4.0`, `4.4`; `5.0`, `5.2`, `5.9`, `5.11`–`5.13`; `6.0`, `6.1`, `6.4`; `8.0`, `8.4`. Required dependency/approval: Component 02 deployed authorized one-page rendition and trusted preview-approval recording; a deployed, tested published-only producer projection for Component 04 `1.3`; completion of focus management and full source/current/proposed preview interaction. P3 owns the student runtime consumer and does not circularly block P2.

### P2 transport interpretation — user correction 2026-07-14

Non-checkbox authority note; baseline task wording above remains verbatim. Component 03 supplies the complete creator-owned Unit/Page Group physical-page union. Preview selects one page inside that union and consumes Component 02's matching sanitized one-page rendition; navigation cannot expand the union. Publication fails closed until all required one-page artifacts and preview approvals are ready. No early, multi-page, or whole-source student resource is permitted.

### P2 continuation evidence — 2026-07-15

- Fresh local proof after the latest Assembly edits passed: Assembly-local 8 files/41 tests, focused Workspace UI 1 file/19 tests, root TypeScript, and route-mocked teacher E2E 1 test. Exact commands and evidence boundaries are recorded in `evidence/P2-closure-20260713.md`.
- In the Codex/ChatGPT in-app browser, the real teacher path reached `Testing Book` -> `Overview` -> `Source PDF`, then returned `book_source_request_failed_500`. No source upload, cloud mutation, or disposable data creation was attempted. This is live browser evidence of the unresolved production source boundary, not a failure of the route-mocked Assembly UI regression.
- The latest local work adds candidate-before-reconciliation staging, complete source/current/proposed review controls, mapping-bound preview approvals, provenance citations, deterministic progress/cancel/retry states, accessible conflict dialogs, and responsive controls. Rows remain open where their wording requires deployed source delivery, durable reload recovery, the unresolved `presentationMode` decision, or production-faithful browser proof.
- C03 `6.4` remains open until P2 proves the published-only producer projection and exact one-page request boundary. Component 04 `1.3` remains the P3 consumer-side validation task; its implementation is not a P2 closure prerequisite.

### P2 current authority reconciliation — 2026-07-15

No checkbox changes implied. C03 status remains `CLOSURE_BLOCKED`; local Assembly proof does not close deployed source or student-delivery rows. Current graph is acyclic: browser -> main `r2-upload-signer` -> one-way `BookSourcePageProviderEntrypoint`. Main locally implements entitlement/publication revalidation, current-entitlement/current-pointer resolution, immutable publication resolution, restore invalidation, `/v1/book-delivery/launch`, `/v1/book-delivery/resources/:grantId`, and ephemeral grant DO; Source owns no Assembly or entitlement authority. Rights metadata and rights-specific revalidation are removed; canonical Source readiness and current Book-management authority remain. Source `9db68e3b-78e1-47af-816c-5d211e7855fc` and main `c44246db-f621-4870-9990-8a39b0a5202b` deploy that shape, but the remote proof stopped before Assembly at `source_begin_operation_identity_unresolved`. Earlier cyclic/grant-entrypoint and caller-supplied page-set descriptions are superseded.

Assembly publication/preview derives the complete Unit placement -> Page Group page union from trusted persisted candidate/publication state. Student delivery remains one requested exact-page rendition. Every local launch/resource rechecks active entitlement pointer/profile, immutable publication, Book status, canonical ready Source Version, complete allowlist, and exact rendition. Restore revokes active entitlements and clears pointers; DO grants are not backup authority. C04 `/runtime/*` routes and production entitlement writer remain open P3/C05. Keep `presentationMode` unresolved until separate product approval; deployment approval cannot resolve C03 `5.2`.

Current local proof: Assembly 8 files/46 PASS; UI 1 file/19 PASS; root focused seam 14 files/169 PASS; Cloudflare 20 files/127 PASS; root `tsc --noEmit` PASS; Cloudflare `tsc -p tsconfig.book-source.json --noEmit` PASS; lifecycle validator PASS; backup/restore 6 files/23 PASS; Firebase emulator 3 files/14 PASS, with Assembly static rules covered inside the Assembly suite. Root parser rejects source-required projections with `source: null`, requires structured projections to carry a source resource, enforces read-only Solo/Homework actions, rejects unordered/duplicate/misbound placements/pages, rejects unsafe/noncanonical metadata and timestamps, rejects mismatched printed labels, rejects malformed/oversized/non-PDF resource bodies, and compares canonical page unions independent of numeric order. Real teacher browser logged out, quick-logged back in, reached `Book` -> `Testing Book` -> `Edit` -> `Overview` -> `Source PDF`, and displayed `book_source_request_failed_500`; student browser logged out, quick-logged back in, reached `Library` -> `Public Library`, and searching `Testing Book` displayed `0 materials found` / `No materials found`. Console still had pre-existing ReportingService permission warnings and student class-index debug warnings. Route-mocked E2E remains UI-only. No remote mutation or upload occurred.

### Packet 2–8 ownership reconciliation — 2026-07-17

C03 owns trusted Unit publication and the published-only producer projection. C04 consumes that projection and owns Solo/preview runtime validation plus Solo entitlement issuance; C05 owns Homework assignment freezing and assignment-derived entitlement issuance; C06 owns selected-update stale-grant/resource invalidation; C07 owns later cross-feature/public delivery. C03 `6.4` therefore proves producer boundaries only and does not require a P3 runtime consumer or P4 assignment issuer. Rights attestation and rights-specific revalidation are not publication gates. Latest deployed proof (`remote-p2-1784222256147-41bea8ce52`) remains `CLOSURE_BLOCKED` at the Source preview HTTP 503 timeout before rendition persistence; no checkbox changes are implied.

### Student-safe full-document decision — 2026-07-17

This section supersedes the earlier one-page transport interpretations above; those paragraphs remain historical evidence only. C03 still owns trusted page-to-Activity mapping, preview approval, atomic Unit publication, and the published-only producer projection. It no longer waits for or publishes rendition identities. Publication requires a pinned canonical Source Version, explicit student-safe source readiness, complete Page Group/Placement mapping, and document-delivery readiness. C04 later consumes the projection and obtains the authorized full-document resource from Book Delivery.
> **Current execution authority — 2026-07-17:** Component 03 publishes canonical Source Version plus Page Group/Placement/page-to-Activity mappings. Preview and student delivery use the complete pinned PDF; the normal viewer selects `#page=physicalPageNumber`. Browser Run, page splitting/rasterization, rendition identities/readiness, and per-page grants are superseded historical evidence and cannot block C03. The unresolved `presentationMode` blocker remains.
