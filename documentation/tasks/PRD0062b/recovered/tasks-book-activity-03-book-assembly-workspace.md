> IMMUTABLE RECOVERED BASELINE / EVIDENCE ONLY
>
> Exact body from Git object 9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd. Evidence only; canonical task owner is parent-directory Component file.

# Task List: PRD0062 Component 03 - Book Assembly Workspace

Status: IMPLEMENTING

Task 1.0 structural Unit support is verified locally; manifest, Page Group, Placement, Unit import/publication, Assembly UI, and runtime work remain open.

Source PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

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
- Outputs are validated Book Content Tree, published Activity Materials, Activity Placements, Page Groups, authorized Unit source renditions, and student-safe runtime projections.
- Teacher shell must keep `TeacherHeader` attached to the shell top edge; page padding belongs inside `main`.
- New UI must use native/shared controls, not Mantine.
- Existing Book metadata editing and existing test-based Book editing must remain available.
- This foundation packet stops before Book/subtree Homework, Affected Homework Review, selective updates, Review Checkpoints, Course/Class delivery, public playable source-assisted Books, and integrity rollout.
- If `bookEditor.service.ts` or another touched Book seam uses `// @ts-nocheck`, add a typed wrapper or remove the suppression before enforcing new PRD0062 invariants there.

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
  - [ ] 2.1 Define manifest schema for Book structure, stable logical keys, page labels, Activity slots, order, and Page Groups.
  - [ ] 2.2 Stage manifest imports as temporary candidates.
  - [ ] 2.3 Validate schema and Source Version page bounds before current state changes.
  - [ ] 2.4 Generate proposed Book Content Tree and Page Groups from a valid candidate.
  - [ ] 2.5 Show exact errors and warnings without mutating current draft or published state.
  - [ ] 2.6 Add tests for exact-key match, duplicate keys, cycles, page gaps/overlaps/duplicates, and page-bound errors.

- [ ] 3.0 Implement Page Group and Placement editing contracts
  - [ ] 3.1 Define Page Groups as many-to-many mappings between pages and ordered Activity Placements, or reference-only pages.
  - [ ] 3.2 Define Placement records containing Book context, Activity ID, node ID, Page Group IDs, and order.
  - [ ] 3.3 Ensure Activity Materials do not intrinsically belong to one Book Node.
  - [ ] 3.4 Implement page-mapping editor operations independent of Activity JSON edits.
  - [ ] 3.5 Support one Activity mapped to multiple pages and one page mapped to multiple Activities.
  - [ ] 3.6 Support reference-only pages and PDF-focus runtime hints.
  - [ ] 3.7 Add tests for many-to-many Page Groups, reference-only pages, and mapping validation.

- [ ] 4.0 Implement Unit Activity JSON staging/import
  - [ ] 4.1 Support initial Unit bundle imports for first creation.
  - [ ] 4.2 Validate every Activity in the bundle before any permanent write.
  - [ ] 4.3 Validate one-family/one-answer-rule shape, Task Profile, context requirement, presentation mode, embedded stimulus, asset refs, and hidden-ID exclusion.
  - [ ] 4.4 Require mapped pages for source-assisted Activities before preview/publish can succeed.
  - [ ] 4.5 Create Activity IDs and Placement IDs only after the entire operation is ready.
  - [ ] 4.6 Bind manifest `activityKey` to Activity ID and Placement.
  - [ ] 4.7 Ensure invalid import cannot partially alter draft or publication.
  - [ ] 4.8 Add atomic import tests.

- [ ] 5.0 Implement reconciliation and manual repair workflows
  - [ ] 5.1 Build the exact PRD reconciliation layout: `Current Content Tree | Proposed Content Tree | Resolution and Preview`.
  - [ ] 5.2 Show summary counts, unresolved-only filter, category filter, source-page preview, current/proposed Activity preview, explicit resolution actions, revalidation status, and publish blocker list.
  - [ ] 5.3 Show added, removed, renamed, reordered, moved, page-mapping-changed, and unresolved items.
  - [ ] 5.4 Implement exact-key identity matching.
  - [ ] 5.5 Treat fuzzy matching as suggestion only, never automatic identity authority.
  - [ ] 5.6 Preserve identity for rename/reorder when stable keys match.
  - [ ] 5.7 Require explicit resolution for cross-Unit moves.
  - [ ] 5.8 Implement source replacement reconciliation without reimporting unchanged Activities.
  - [ ] 5.9 Require teacher preview approval when a source-assisted Activity's page labels, one-based `physicalPageNumber` values, crop/range, rotation, or Page Group changes even if stable Activity keys still match.
  - [ ] 5.10 Revalidate after every repair.
  - [ ] 5.11 Block publication while required reconciliation issues or preview approvals remain.
  - [ ] 5.12 Add reconciliation tests for the three-column layout controls, rename, reorder, move, source replacement, source-assisted preview approval, and rare unresolved cases.

- [ ] 6.0 Implement Unit preview and staged publication
  - [ ] 6.1 Generate actual student runtime preview from student-safe projection and authorized source rendition.
  - [ ] 6.2 Implement foundation Unit statuses: Published, Valid-ready-to-publish, Missing JSON, Invalid, Needs reconciliation, and Draft changed. Defer `Pending homework updates` until Component 06.
  - [ ] 6.3 Publish one Unit atomically while later Units remain missing/teacher-only.
  - [ ] 6.4 Ensure students see only published Units.
  - [ ] 6.5 Add staged publication tests without implementing Homework or update behavior in this packet.

- [ ] 7.0 Implement optional Copy Unit JSON Prompt and revision prompt flows
  - [ ] 7.1 Offer Copy Unit JSON Prompt after source PDF, manifest, and selected Unit are valid without making it an import prerequisite or approval gate.
  - [ ] 7.2 Include Book title, selected Section/Chapter/Unit path, selected page list, mapped Activity keys/order, current Activity schema version, optional namespaced Task Profile format, supported interaction families/variants, supported embedded stimulus kinds, existing media asset-reference forms, context requirement rules, and presentation mode rules.
  - [ ] 7.3 Include the one-family/one-answer-rule constraint, source-assisted page/label requirements, answer/scoring requirements, Unit bundle envelope, no generic Task Groups/Task Sets/Resource entities rule, no system IDs rule, JSON-only requirement, and a complete valid example.
  - [ ] 7.4 Explain structured versus source-assisted selection with examples and forbid unsupported visual approximation merely to choose `structured`.
  - [ ] 7.5 Implement Copy Revision Prompt for full-content replacement with current editable content, supported schema/families/variants/stimulus kinds, one-family/one-answer-rule constraint, Task Profile naming rules, context-requirement rules, structured/source-assisted rubric, teacher correction instructions, JSON-only requirement, and instruction not to include IDs or Placement/provenance data.
  - [ ] 7.6 Ensure Copy Revision Prompt excludes Activity/system IDs, Source/Manifest IDs, Book placement, ownership, student data, and published homework data.
  - [ ] 7.7 Add fallback behavior when clipboard copy fails.
  - [ ] 7.8 Add tests for Unit prompt content, revision prompt content, JSON-only/no-ID guards, complete example presence, media refs, answer/scoring requirements, and fallback behavior.

- [ ] 8.0 Build Assembly Workspace UI, accessibility, route, and observability coverage
  - [ ] 8.1 Add or expand the existing Book editor route according to route/observability rules.
  - [ ] 8.2 Build teacher shell regions: Book/source status, Content Tree, Unit imports and validation, Page mapping, Activity preview/revision, and Publish/impact status.
  - [ ] 8.3 Preserve normal Book metadata editing and existing material ref editing.
  - [ ] 8.4 Add accessible controls, keyboard support, clear validation states, and native/shared UI styling.
  - [ ] 8.5 Register new route and user actions in feature registry/observability.
  - [ ] 8.6 Use shared action announcements for create/save/update/publish/import outcomes.
  - [ ] 8.7 Add component tests and browser verification notes for teacher desktop Assembly Workspace.
  - [ ] 8.8 Add or verify a fully typed integration wrapper for touched legacy Book editor seams; no new PRD0062 module may use `// @ts-nocheck`.
  - [ ] 8.9 Update findings with final route, component, service, and typed-boundary ownership paths.

### Evidence-hardening subtasks (append-only; parent boxes remain open)

- [ ] 2.7 Accept Unit Activity JSON through a file picker and drag/drop target in addition to any clipboard convenience flow; route both paths through the same schema/hidden-ID/page-bound validator, with explicit type, size, encoding, and malformed-JSON errors.
- [ ] 2.8 Keep `Copy Unit JSON Prompt` optional. Clipboard copy failure must fall back to a labelled read-only textarea and manual-copy guidance; clipboard contents must never be treated as an implicit import source.
- [ ] 2.9 Add progressive onboarding for first-time assembly: show required steps and current completion, defer advanced controls until needed, preserve the last completed step on revisit, and expose keyboard/screen-reader labels for step state and next action.
- [ ] 2.10 Show determinate source upload and rendition progress (bytes/pages/state), with cancel before finalization, idempotent retry after transient failure, and an explicit terminal error. A canceled/failed or stale retry must not promote a partial Source Version or rendition.
- [ ] 5.13 Store and render explicit provenance citations per Activity/interaction: source-version reference, printed page label, one-based `physicalPageNumber`/range, Page Group, and answer-key evidence citation. Mark low-confidence, unsupported, missing-evidence, and label-mismatch cases for teacher review; block publish until required review decisions are recorded.
- [ ] 5.14 Detect concurrent draft revisions during repair/import. Preserve unsaved local edits, show conflict state with keep-current/accept-proposed/manual-resolution choices where safe, and make resume after reload return to the last durable candidate without silently overwriting another teacher's change.
- [ ] 8.10 Verify reconciliation at teacher widths `1208px`, `768px`, and `375px`: three-column review becomes a readable stacked flow without horizontal page overflow, source/current/proposed previews retain clear labels, controls remain keyboard reachable, and visible mobile actions meet the 44px target.
