# Task List: PRD0062 Component 01 - Domain And Security Foundation

Status: Packet 1 CLOSED.

Source PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `src/types/materialCatalog.types.ts` - Existing Material Catalog kinds, Book node types, Book refs, and public projection contracts to extend with `interactive-activity` and `unit` support where needed.
- `src/services/materialCatalog/materialBooks.service.ts` - Existing Book metadata/node read/write service that must remain the Book storage integration seam.
- `src/services/materialCatalog/bookValidation.service.ts` - Existing validation seam to extend for Activity refs, `unit`, and student-safe projection requirements.
- `src/types/bookActivity.types.ts` - New Activity schema, candidate, draft, published version, Interaction ID, projection, grading, and diff types.
- `src/services/book-activity/activitySchema.service.ts` - New schema normalization and validation owner.
- `src/services/book-activity/activityCandidate.service.ts` - New candidate staging and draft-save owner.
- `src/services/book-activity/activityPublish.service.ts` - New immutable publish owner.
- `src/services/book-activity/activityProjection.service.ts` - New student-safe projection owner.
- `src/services/book-activity/activityDiff.service.ts` - New semantic change classification owner.
- `src/services/book-activity/activityScoring.service.ts` - New objective scoring/regrading plan owner for supported interaction families.
- `src/services/materialCatalog/materialCapabilityRegistry.service.ts` - New central capability registry to avoid spreading kind checks through callers.
- `database.rules.json` - RTDB rules for new data paths, if RTDB is used.
- `firestore.rules` - Firestore rules for new data paths, if Firestore is used.
- `src/__tests__/security/*bookActivity*.test.ts` - Emulator/rules tests for new Activity paths.
- `src/services/book-activity/*.test.ts` - Unit tests for schema validation, hidden IDs, projection, scoring, and diff behavior.

### Notes

- Follow `AGENTS.md` and triggered rule docs before writing code.
- Add no dependency from Reading V2 or Listening back into the new Book Activity module.
- The generic Activity schema MUST NOT add generic Task Group, Task Set, or first-class Resource layers.
- Activity revision JSON MUST NOT accept `activityId`, `materialId`, `versionId`, `placementId`, `bookId`, `nodeId`, source provenance, owner identity, or publish timestamps.
- Student-safe projections must exclude hidden answers, authoring data, source provenance, hidden Interaction IDs where not needed by the client, and teacher-only fields.
- New Book Activity logic must be fully typed. Do not place new invariants inside a legacy `// @ts-nocheck` seam without a typed wrapper or cleanup.
- Use `npm test -- [path]` or `npm run test -- [path]` according to the repo's Vitest setup after Packet 0 confirms exact commands.

## Packet Contract And Closure Addendum

Before source changes in this component:

- [x] Create or update `documentation/tasks/PRD0062/contracts-book-activity-packet-1.md` with storage, rules/security, UI, migration/compatibility, test, browser-proof, proof-classification, and authority-reconciliation sections.
- [x] Map every implemented requirement to PRD section, source owner, test title, negative proof where applicable, architecture/current-state doc, findings row, traceability row, and taskbox ID.
- [x] Classify proof separately as local source proof, type/build proof, emulator/rules proof, browser proof, remote/deployed proof, or not required for Packet 1.
- [x] Keep phase state explicit. Tests passing may move work to `IMPLEMENTED_UNREVIEWED`; they do not make the packet `CLOSED`.

Before completing this component:

- [x] Run stale-claim scans over touched task docs, findings, traceability, and architecture/current-state docs for contradicted proof language.
- [x] Request review only after source, tests, findings, traceability, and docs are updated and inspectable.
- [x] Record reviewer method, inspected files/diff, risk model, validation performed, tests not rerun, and residual risks.
- [x] Update the packet handoff with current live contract, historical/superseded evidence, verification commands, dirty-path classification, and unresolved blockers.

## Tasks

- [x] 1.0 Extend Material Catalog for generic Activity Materials
  - [x] 1.1 Add `interactive-activity` to the canonical material kind list.
  - [x] 1.2 Add or deepen a central capability registry with `playable`, `assignable`, `embeddableInBook`, `gradable`, `supportsSourceContext`, and `supportsPlacementScopedProgress`, plus launch, assignment, result, and projection adapter IDs where applicable.
  - [x] 1.3 Replace any new proposed direct kind checks with capability lookups across picker filtering, publish validation, assignment eligibility, student launch routing, result ownership, and security/student-safe projection decisions.
  - [x] 1.4 Confirm existing `grammar-worksheet` and `vocabulary-set` declarations remain compatible and are not treated as proof of runtime support.
  - [x] 1.5 Add tests proving every required capability/adapter lookup returns expected behavior for `interactive-activity`, fails closed when missing, and preserves existing material behavior.

- [x] 2.0 Define Activity schema, candidate, draft, and published version contracts
  - [x] 2.1 Define the revisionable Activity JSON contract with `schemaVersion`, `title`, `taskProfile`, `presentationMode`, `contextRequirement`, `instructions`, `interaction`, `answerRule`, `stimulus`, `assetRefs`, `interactions`, and `scoring`.
  - [x] 2.2 Define immutable origin provenance separately from editable revision JSON.
  - [x] 2.3 Define candidate records for imported replacement content awaiting validation and Save Draft.
  - [x] 2.4 Define mutable draft records and immutable published version records.
  - [x] 2.5 Define supported V1 interaction families: `choice`, `text-entry`, `matching`, `ordering`, and `long-response`.
  - [x] 2.6 Define Task Profile registry shape with namespaced `taxonomyId`, `typeId`, and `taxonomyVersion`.
  - [x] 2.7 Define `structured` and `source-assisted` presentation modes only.
  - [x] 2.8 Define `none`, `optional`, and `required` context requirement modes only.
  - [x] 2.9 Define minimum source-assisted response metadata: question label, `accessiblePrompt`, response shape, and relationship to visible source exercise/part labels.
  - [x] 2.10 Add tests proving unsupported families, modes, context requirements, missing source-assisted accessibility metadata, and forbidden fields fail closed.

- [x] 3.0 Implement Activity validation and hidden Interaction ID assignment
  - [x] 3.1 Validate one Activity has one coherent interaction family and one shared answer rule.
  - [x] 3.2 Validate embedded stimulus is distinct from interaction family.
  - [x] 3.3 Validate Task Profiles accept registered namespaced taxonomies and permit ordinary Activities to use `taskProfile: null`.
  - [x] 3.4 Validate source-assisted mode requires source context and complete accessible prompt/label/response-shape metadata before publish; concrete Book page mapping is deferred to Packet 3 placement repair.
  - [x] 3.5 Reject generic Task Group, Task Set, and first-class Resource payloads in V1 schema.
  - [x] 3.6 Reject editable JSON that includes hidden Interaction IDs or placement/provenance fields.
  - [x] 3.7 Generate hidden Interaction IDs when an Activity is first saved.
  - [x] 3.8 Preserve hidden Interaction IDs only when a revision is exact-structure safe by position.
  - [x] 3.9 Generate new IDs and classify redo-required when interactions are added, removed, reordered, or materially changed.
  - [x] 3.10 Add tests for hidden ID generation, safe preservation, forbidden exported IDs, and redo-required ID replacement.

- [x] 4.0 Implement candidate, draft, and publish operations
  - [x] 4.1 Implement `stageActivityCandidate(targetActivityId, replacementContent)`.
  - [x] 4.2 Implement `validateActivityCandidate(candidate)`.
  - [x] 4.3 Implement `saveActivityDraft(candidateId)` as full-content replacement, not partial field merge.
  - [x] 4.4 Implement `publishActivityRevision(activityId, expectedDraftRevision)` with immutable version creation.
  - [x] 4.5 Ensure invalid candidates leave the current draft and published versions untouched.
  - [x] 4.6 Ensure published versions cannot be mutated.
  - [x] 4.7 Add tests for candidate failure, full-content replacement, optimistic concurrency, and immutable publish behavior.

- [x] 5.0 Implement student-safe Activity projections
  - [x] 5.1 Define the student-safe projection shape for runtime use.
  - [x] 5.2 Exclude answer keys until permitted through result/review policy.
  - [x] 5.3 Exclude teacher notes, authoring data, provenance internals, candidate data, and publish-only metadata.
  - [x] 5.4 Include only runtime-required interaction identity plumbing in a safe form.
  - [x] 5.5 Add projection tests proving hidden and authoring fields are absent.
  - [x] 5.6 Add negative security tests proving students cannot read authoring records directly.

- [x] 6.0 Implement semantic diff and grading/regrading classification
  - [x] 6.1 Implement `classifyActivityChange(oldVersion, newVersion)`.
  - [x] 6.2 Classify title/description/formatting/layout changes as no redo.
  - [x] 6.3 Classify same prompt/options plus point-value change as recalculation without redo.
  - [x] 6.4 Classify same prompt/options plus answer-key change as regrade without redo.
  - [x] 6.5 Classify rubric changes as teacher regrade without redo where applicable.
  - [x] 6.6 Classify prompt, choices, response shape, required source context, or interaction structure changes as redo-required where specified.
  - [x] 6.7 Add tests covering the PRD change table and examples.

- [x] 7.0 Add rules, indexes, backup coverage, and observability for new Activity data
  - [x] 7.1 Identify every new RTDB node or Firestore collection before writing data.
  - [x] 7.2 Add rules for owner-only authoring access and student-safe projection access.
  - [x] 7.3 Add malicious cross-owner and cross-student read/write tests.
  - [x] 7.4 Add indexes where queries require them.
  - [x] 7.5 Add backup coverage where required by the repo infrastructure rule.
  - [x] 7.6 Observability registry is N/A for Packet 1 because no UI routes, user-facing actions, or analytics-emitting workflows were added; service validation/publish/projection events remain pure domain operations until Packet 3+ UI/runtime integration.

- [x] 8.0 Enforce typed integration boundaries
  - [x] 8.1 Inventory touched Book/Material Catalog seams that currently use `// @ts-nocheck`.
  - [x] 8.2 Add a fully typed wrapper or remove the suppression before enforcing new Activity, Placement, manifest, source, or homework invariants through that seam.
  - [x] 8.3 Prohibit `// @ts-nocheck` in new Book Activity modules.
  - [x] 8.4 Run focused typechecking and tests proving typed boundaries reject invalid contract shapes.

- [x] 9.0 Preserve regression boundaries
  - [x] 9.1 Prove existing Book create/edit/publish behavior still works.
  - [x] 9.2 Prove existing Reading V2 and Listening code do not import from or depend on the new Book Activity module.
  - [x] 9.3 Prove existing material list/picker behavior remains stable for pre-existing material kinds.
  - [x] 9.4 Update `findings-book-activity-baseline.md` with final owner paths, test names, and unresolved risks.
