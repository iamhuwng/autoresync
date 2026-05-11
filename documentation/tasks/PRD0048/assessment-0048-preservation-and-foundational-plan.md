# Assessment: PRD-0048 Preservation And Foundational Implementation Plan

> **Date:** 2026-04-24
> **Scope:** `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`, the `documentation/tasks/PRD0048/` companion packet, and the exported conversation transcript.
> **Conclusion:** The intended Reading V2 behavior and final conversation conclusion are preserved well enough for foundational implementation planning, provided the implementation task list treats this packet as mandatory input rather than using the PRD alone.

---

## 1. Source Packet Assessed

Required source-of-truth inputs:

- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/findings-of-tasks-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`
- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-family-*.md`
- `documentation/tasks/PRD0048/reading-v2-type-*.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-desktop-tablet.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-phone.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`
- `documentation/tasks/PRD0048/handoff-0048-prd-ielts-reading-v2-system-review-context.md`
- `documentation/tasks/PRD0048/conversation-transcript-prd-0048-thread-2026-04-22-to-2026-04-24.md`

Precedence for implementation:

1. PRD = product intent and scope.
2. Contract freeze = execution law and hard implementation boundaries.
3. Taxonomy, `TaskGroup`, family, type, feature-pipeline matrix, test-making-pipeline, page-schema, and integration-contract docs = implementation-detail truth.
4. Findings = current-state drift and legacy-system warnings.
5. Handoff = external-review summary.
6. Transcript = rationale trail and tie-breaker for why decisions exist, not a source for introducing unfiltered new requirements.

---

## 2. Final Conversation Conclusion Preserved

The final documented conclusion of the thread is preserved as follows:

- PRD-0048 is no longer just a renderer fix or narrow editor fix; it is a separate greenfield IELTS Reading V2 product family.
- The implementation must not use the legacy Reading editor/runtime as the architectural base.
- The product direction is “authoring truth outward”: canonical authoring data drives preview, publish, runtime, scoring, and review.
- A freeform canvas is not the source of truth; the intended “canvas” is a structured composition and preview surface under system-owned layout.
- The packet, not the PRD alone, is the implementation source of truth.
- The earlier 80-85% faithfulness concern was resolved by adding the three-plane architecture, contract freeze, taxonomy, `TaskGroup`, family/type docs, visual page-schema docs, and integration contracts.
- The later 92-95% and 97% assessments are preserved by requiring companion docs, explicit precedence, family/type research, the feature pipeline matrix, the test-making pipeline contract, page schemas, runtime V1 parity, and integration contracts.
- The remaining open work is task generation and implementation sequencing, not another conceptual rewrite of the product vision.

---

## 3. Behavior Preservation Matrix

| Intended behavior from transcript | Preserved where | Assessment |
|---|---|---|
| Stop patching fixed render assumptions | PRD sections 1.1, 1.5; findings F2-F4 | Preserved |
| Build a whole Reading system, not only a creator | PRD sections 1.2, 4.1, 4.8, 4.9 | Preserved |
| Ignore current Reading internals for V2 | PRD section 1.5; findings file | Preserved |
| Use unified studio for create/import/review/revise | PRD sections 4.4-4.6; studio page schema | Preserved |
| Use one ordered teacher test-making subpipeline from existing entry through metadata, Studio, Questions-owned answer keys, Settings, preview, publish, and platform relationships | PRD section 4.5; test-making pipeline contract | Preserved |
| Make every major PRD feature explicit about access point, owner, pipeline, output, tests, and forbidden drift | PRD locked decision 16; feature pipeline matrix | Preserved |
| Use system-owned layout, not teacher free-placement | PRD sections 1.4, 4.6; contract freeze | Preserved |
| Support manual authoring and AI import | PRD sections 1.2, 4.5; contract freeze import uncertainty law | Preserved |
| Treat task groups as semantic units | `reading-v2-taskgroup-object.md`; taxonomy and family docs | Preserved |
| Support all 16 IELTS Reading task types over phases | PRD section 1.4; taxonomy/type docs | Preserved |
| Use engineering task families for implementation reuse | taxonomy and family docs | Preserved |
| Keep passages as versioned reusable assets | PRD section 4.3; contract freeze library plane | Preserved |
| Extract passage + task group as copy, not live link | PRD section 4.3; `TaskGroup` extraction behavior | Preserved |
| Keep hidden provenance for audit/search/history only | PRD section 4.3; contract freeze extraction law | Preserved |
| Published editing creates draft revision | PRD section 4.5; contract freeze revision law | Preserved |
| Preserve live published version until republish | PRD section 4.5; contract freeze revision law | Preserved |
| Desktop/tablet runtime imitates current Reading V1 two-column UI | PRD section 4.7; desktop/tablet page schema; V1 parity contract | Preserved |
| Phone runtime imitates current Reading V1 passage-first UI | PRD section 4.7; phone page schema; V1 parity contract; family mobile contracts | Preserved |
| Integrate homework, solo practice, course, library, live sessions | PRD section 4.8; contract freeze delivery/projection plane | Preserved |
| Existing result/feedback system remains review shell owner | PRD section 4.9; result-feedback integration contract | Preserved |
| Teacher review content defaults to task-group-first inside existing result shell | PRD section 4.9; result-feedback integration contract | Preserved |
| Keep flat-number navigation as secondary utility | PRD section 4.9; result-feedback integration contract | Preserved |
| Make docs explicit enough for juniors | PRD section 4.10; contract freeze; companion docs | Preserved, but depends on task list using the packet |

---

## 4. Foundational Implementation Sequence

This sequence is the faithful foundation for later `tasks-0048-*` generation. It intentionally starts with contracts and engine boundaries before UI polish.

### Phase 0: Task-Generation Gate

- Generate `documentation/tasks/tasks-0048-prd-reading-v2-studio-and-runtime.md` only after referencing this full packet.
- The task list must include explicit required-reading links to the PRD, findings, contract freeze, taxonomy, `TaskGroup`, family, type, feature-pipeline matrix, test-making-pipeline, page-schema, integration-contract, handoff, transcript, and this assessment.
- The task list must not collapse V2 back into old Reading editor/runtime tasks.
- The first implementation slice must be a vertical V2 foundation, not one isolated renderer patch.

### Phase 1: Canonical Domain Foundation

- Define the Reading V2 canonical document, stimulus, task group, interaction, anchor, numbering, validation issue, draft, material, projection, attempt, result, and review contracts.
- Implement schema-version rejection for unsupported future versions.
- Keep visible IELTS question numbers derived/rebased, not immutable identity.
- Keep projection objects derived-only and never editable source truth.

### Phase 2: Storage And Repository Boundary

- Add V2-specific storage paths, repositories, and engine branching.
- Keep V2 data separate from legacy Reading contracts except for safe shared platform shells.
- Add draft/material versioning rules before publishing or result work.
- Add provenance fields for passage assets and extracted materials.

### Phase 3: Studio Shell And Draft Workflow

- Build one `ReadingV2StudioPage` shell for create, import, draft resume, and revise modes.
- Preserve the ordered test-making pipeline: access, metadata, editor, answer-key/scoring, Settings, validation/preview, publish, and return-context relationship handoff.
- Implement autosave with revision tokens and conflict rejection.
- Allow incomplete draft placeholders while keeping them publish-blocking and unnumbered.
- Add manual authoring and AI-assisted import into the same canonical draft model.

### Phase 4: Validation, Publish, And Projection

- Implement the validation severity model and publish gate before public launch paths.
- Generate preview, student-safe, session-safe, review, and analytics projections from canonical content.
- Strip answer keys and author-only diagnostics from student-visible payloads.
- Publish revisions by snapshotting, not mutating live material in place.

### Phase 5: Extraction And Reuse

- Implement passage asset search and version controls.
- Implement passage-plus-task-group extraction as independent copy creation.
- Preserve provenance as historical metadata only.
- Ensure source edits do not flow into extracted copies.

### Phase 6: Student Runtime

- Implement desktop/tablet runtime from V2 projections while imitating the current Reading V1 two-column UI.
- Implement phone runtime from V2 projections while imitating the current Reading V1 passage-first UI, bottom-sheet question flow, and pre-submit review summary.
- Add family-specific interaction renderers for completion, choice, binary judgement, matching, and structured-layout families.
- Reject unsupported task family/type payloads instead of guessing with legacy heuristics.

### Phase 7: Platform Launch Integration

- Branch shared launch plumbing to support Reading V2 materials in solo practice, homework, courses, public library, and live sessions.
- Keep student launch routes shared where safe; branch by engine/content family internally.
- Preserve shared result infrastructure only where it does not take ownership of V2 interpretation.

### Phase 8: Results, Review, And Regrade

- Generate results from canonical snapshot versions used at attempt time.
- Bind historical attempts to the published snapshot they used.
- Integrate Reading V2 result records with the existing result/review/feedback system.
- Implement task-group-first Reading V2 review content as an adapter inside existing result shells.
- Preserve student release-policy sanitization through existing result visibility flows.
- Implement regrade as a new versioned result artifact, not mutation of historical truth.

---

## 5. Junior-Safety Requirements For The Task List

The eventual implementation task list must include dedicated work items for:

- V2 contract files and schema-version guards.
- Feature pipeline matrix enforcement for access points, owning surfaces/services, pipeline order, outputs, and forbidden patterns.
- Engine branching that prevents accidental legacy Reading rendering.
- Draft/revision/conflict behavior.
- Ordered test-making pipeline behavior, including metadata, Questions-owned answer-key/scoring, Settings ownership, and publish relationship handoff.
- Validation severity and publish-gate matrix.
- Projection generation and projection safety tests.
- Extraction copy and provenance behavior.
- Current Reading V1 runtime parity on desktop/tablet and phone.
- Family-specific mobile renderer contracts.
- Result snapshot and regrade semantics.
- Existing result/feedback integration.
- Cross-platform launch support for solo, homework, course, library, and live sessions.
- UTF-8 checks and targeted tests for every touched implementation area.

The task list must not ask a junior to infer these behaviors from the transcript.

---

## 6. Remaining Product Decisions

The packet is ready for foundational task generation, but the PRD still intentionally leaves these product choices open:

1. Final user-facing name: `Reading V2`, `Reading Studio`, or another label.
2. Whether standalone passage assets ever become broadly visible in Teacher Lobby, or stay limited to Studio search/import tools.
3. Whether first rollout is internal/admin-only before all-teacher release.

These decisions should be resolved before broad rollout tasks, but they do not block foundational architecture implementation.
