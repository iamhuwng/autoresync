# Task List: PRD0062 Component 01 - Domain And Security Foundation

Status: Draft task list. Execute only through the master orchestration packet order.

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
- Use `npm test -- [path]` or `npm run test -- [path]` according to the repo's Vitest setup after Packet 0 confirms exact commands.

## Tasks

- [ ] 1.0 Extend Material Catalog for generic Activity Materials
  - [ ] 1.1 Add `interactive-activity` to the canonical material kind list.
  - [ ] 1.2 Add or deepen a central capability registry with `playable`, `assignable`, `embeddable`, `gradable`, and `supportsSourceContext` capabilities.
  - [ ] 1.3 Replace any new proposed direct kind checks with capability lookups.
  - [ ] 1.4 Confirm existing `grammar-worksheet` and `vocabulary-set` declarations remain compatible and are not treated as proof of runtime support.
  - [ ] 1.5 Add tests proving capability lookup returns expected capabilities for `interactive-activity` and preserves existing material behavior.

- [ ] 2.0 Define Activity schema, candidate, draft, and published version contracts
  - [ ] 2.1 Define the revisionable Activity JSON contract with `schemaVersion`, `title`, `taskProfile`, `presentationMode`, `contextRequirement`, `instructions`, `interaction`, `answerRule`, `stimulus`, `assetRefs`, `interactions`, and `scoring`.
  - [ ] 2.2 Define immutable origin provenance separately from editable revision JSON.
  - [ ] 2.3 Define candidate records for imported replacement content awaiting validation and Save Draft.
  - [ ] 2.4 Define mutable draft records and immutable published version records.
  - [ ] 2.5 Define supported V1 interaction families: `choice`, `text-entry`, `matching`, `ordering`, and `long-response`.
  - [ ] 2.6 Define Task Profile registry shape with namespaced `taxonomyId`, `typeId`, and `taxonomyVersion`.
  - [ ] 2.7 Define `structured` and `source-assisted` presentation modes only.
  - [ ] 2.8 Define `none`, `optional`, and `required` context requirement modes only.
  - [ ] 2.9 Add tests proving unsupported families, modes, context requirements, and forbidden fields fail closed.

- [ ] 3.0 Implement Activity validation and hidden Interaction ID assignment
  - [ ] 3.1 Validate one Activity has one coherent interaction family and one shared answer rule.
  - [ ] 3.2 Validate embedded stimulus is distinct from interaction family.
  - [ ] 3.3 Validate Task Profiles accept registered namespaced taxonomies and permit ordinary Activities to use `taskProfile: null`.
  - [ ] 3.4 Validate source-assisted mode requires source context and mapped Book pages before publish.
  - [ ] 3.5 Reject generic Task Group, Task Set, and first-class Resource payloads in V1 schema.
  - [ ] 3.6 Reject editable JSON that includes hidden Interaction IDs or placement/provenance fields.
  - [ ] 3.7 Generate hidden Interaction IDs when an Activity is first saved.
  - [ ] 3.8 Preserve hidden Interaction IDs only when a revision is exact-structure safe by position.
  - [ ] 3.9 Generate new IDs and classify redo-required when interactions are added, removed, reordered, or materially changed.
  - [ ] 3.10 Add tests for hidden ID generation, safe preservation, forbidden exported IDs, and redo-required ID replacement.

- [ ] 4.0 Implement candidate, draft, and publish operations
  - [ ] 4.1 Implement `stageActivityCandidate(targetActivityId, replacementContent)`.
  - [ ] 4.2 Implement `validateActivityCandidate(candidate)`.
  - [ ] 4.3 Implement `saveActivityDraft(candidateId)` as full-content replacement, not partial field merge.
  - [ ] 4.4 Implement `publishActivityRevision(activityId, expectedDraftRevision)` with immutable version creation.
  - [ ] 4.5 Ensure invalid candidates leave the current draft and published versions untouched.
  - [ ] 4.6 Ensure published versions cannot be mutated.
  - [ ] 4.7 Add tests for candidate failure, full-content replacement, optimistic concurrency, and immutable publish behavior.

- [ ] 5.0 Implement student-safe Activity projections
  - [ ] 5.1 Define the student-safe projection shape for runtime use.
  - [ ] 5.2 Exclude answer keys until permitted through result/review policy.
  - [ ] 5.3 Exclude teacher notes, authoring data, provenance internals, candidate data, and publish-only metadata.
  - [ ] 5.4 Include only runtime-required interaction identity plumbing in a safe form.
  - [ ] 5.5 Add projection tests proving hidden and authoring fields are absent.
  - [ ] 5.6 Add negative security tests proving students cannot read authoring records directly.

- [ ] 6.0 Implement semantic diff and grading/regrading classification
  - [ ] 6.1 Implement `classifyActivityChange(oldVersion, newVersion)`.
  - [ ] 6.2 Classify title/description/formatting/layout changes as no redo.
  - [ ] 6.3 Classify same prompt/options plus point-value change as recalculation without redo.
  - [ ] 6.4 Classify same prompt/options plus answer-key change as regrade without redo.
  - [ ] 6.5 Classify rubric changes as teacher regrade without redo where applicable.
  - [ ] 6.6 Classify prompt, choices, response shape, required source context, or interaction structure changes as redo-required where specified.
  - [ ] 6.7 Add tests covering the PRD change table and examples.

- [ ] 7.0 Add rules, indexes, backup coverage, and observability for new Activity data
  - [ ] 7.1 Identify every new RTDB node or Firestore collection before writing data.
  - [ ] 7.2 Add rules for owner-only authoring access and student-only projection access.
  - [ ] 7.3 Add malicious cross-owner and cross-student read/write tests.
  - [ ] 7.4 Add indexes where queries require them.
  - [ ] 7.5 Add backup coverage where required by the repo infrastructure rule.
  - [ ] 7.6 Register feature/action observability for candidate save, draft save, publish, validation failure, and projection generation.

- [ ] 8.0 Preserve regression boundaries
  - [ ] 8.1 Prove existing Book create/edit/publish behavior still works.
  - [ ] 8.2 Prove existing Reading V2 and Listening code do not import from or depend on the new Book Activity module.
  - [ ] 8.3 Prove existing material list/picker behavior remains stable for pre-existing material kinds.
  - [ ] 8.4 Update `findings-book-activity-baseline.md` with final owner paths, test names, and unresolved risks.
