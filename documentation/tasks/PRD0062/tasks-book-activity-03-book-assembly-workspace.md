# Task List: PRD0062 Component 03 - Book Assembly Workspace

Status: Draft task list. Execute only through the master orchestration packet order.

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

## Packet Contract And Closure Addendum

Before source changes in this component:

- [ ] Create or update `documentation/tasks/PRD0062/contracts-book-activity-packet-3.md` with storage, rules/security, UI, migration/compatibility, test, browser-proof, proof-classification, and authority-reconciliation sections.
- [ ] Map every Assembly Workspace claim to PRD section, source owner, test title, negative proof where applicable, architecture/current-state doc, findings row, traceability row, and taskbox ID.
- [ ] Classify proof separately as local source proof, typed-boundary proof, Book regression proof, browser proof, source-delivery integration proof, or not required for Packet 3.
- [ ] Keep legacy Book behavior, new `unit` behavior, and teacher Assembly behavior as separate proof rows. Do not use one successful Unit import as proof that existing Book editor behavior remains safe.
- [ ] Keep phase state explicit. A working import/preview path may move work to `IMPLEMENTED_UNREVIEWED`; it does not make the packet `CLOSED`.

Before completing this component:

- [ ] Run stale-claim scans over touched task docs, findings, traceability, and architecture/current-state docs for contradicted Assembly, Book editor, source-mapping, or `unit` readiness claims.
- [ ] Request review only after source, tests, findings, traceability, and docs are updated and inspectable.
- [ ] Record reviewer method, inspected files/diff, risk model, validation performed, tests not rerun, and residual risks.
- [ ] Update the packet handoff with current live contract, historical/superseded evidence, verification commands, dirty-path classification, typed-boundary status, and unresolved blockers.

## Tasks

- [ ] 1.0 Add Book `unit` node support while preserving legacy `test`
  - [ ] 1.1 Add `unit` to the Book node taxonomy.
  - [ ] 1.2 Preserve existing `section`, `chapter`, `test`, and placeholder behavior.
  - [ ] 1.3 Preserve `BOOK_NODE_MAX_DEPTH = 5` unless Packet 0 finds a documented current alternative.
  - [ ] 1.4 Update Book validation to accept `unit` and reject cycles, missing parents, duplicate keys, and excessive depth.
  - [ ] 1.5 Treat `unit` as a structural node in Book readiness/status derivation while preserving existing `test` readiness behavior.
  - [ ] 1.6 Ensure assignable structural-node eligibility excludes placeholders and invalid/missing Units.
  - [ ] 1.7 Add tests proving `unit` can become ready/publishable, legacy test-based Books remain ready/publishable, and staged missing Units remain teacher-only.

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
  - [ ] 5.9 Require teacher preview approval when a source-assisted Activity's page labels, physical indexes, crop/range, rotation, or Page Group changes even if stable Activity keys still match.
  - [ ] 5.10 Revalidate after every repair.
  - [ ] 5.11 Block publication while required reconciliation issues or preview approvals remain.
  - [ ] 5.12 Add reconciliation tests for the three-column layout controls, rename, reorder, move, source replacement, source-assisted preview approval, and rare unresolved cases.

- [ ] 6.0 Implement Unit preview and staged publication
  - [ ] 6.1 Generate actual student runtime preview from student-safe projection and authorized source rendition.
  - [ ] 6.2 Implement foundation Unit statuses: Published, Valid-ready-to-publish, Missing JSON, Invalid, Needs reconciliation, and Draft changed. Defer `Pending homework updates` until Component 06.
  - [ ] 6.3 Publish one Unit atomically while later Units remain missing/teacher-only.
  - [ ] 6.4 Ensure students see only published Units.
  - [ ] 6.5 Add staged publication tests without implementing Homework or update behavior in this packet.

- [ ] 7.0 Implement Copy Unit JSON Prompt and revision prompt flows
  - [ ] 7.1 Generate Copy Unit JSON Prompt after source PDF, manifest, and selected Unit are valid.
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
