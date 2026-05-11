# Handoff: Standalone External Review Context for PRD-0048 IELTS Reading V2 System

## 1. Purpose of This Handoff

This document is meant for an external engineer, architect, consultant, or AI assistant who has:

- no prior knowledge of this repository, product, company terminology, or prior discussions
- no direct access to our repository or codebase
- only the artifact bundle named in this handoff

Its purpose is to let that reviewer assess the PRD-0048 packet thoroughly enough to:

- challenge weak assumptions before implementation begins
- propose better architectures, sequencing, or abstractions
- identify missing requirements, contradictions, and junior-risk gaps
- recommend better technology choices if the current direction is not strong enough
- offer alternative product or UX approaches where the current packet is too narrow, too broad, or too vague

This is not a coding request.

This is a systems, product, architecture, and implementation-safety review request.

The reviewer should assume:

- the PRD is serious and intended to guide junior implementation
- the packet may still contain flawed or incomplete assumptions
- the current codebase does not already satisfy the target architecture
- the reviewer is allowed to reject, narrow, or restructure parts of the proposal if they are unsound

Important operating rule:

- do not assume you can inspect the repo
- treat this handoff plus the named artifacts as the available evidence packet
- if something still feels too vague to evaluate strongly, say so explicitly

---

## 2. Artifact Bundle The Reviewer Will Receive

### 2.1 Minimum Required Read Path

The reviewer should read these artifacts in this order:

1. This handoff
   `documentation/tasks/PRD0048/handoff-0048-prd-ielts-reading-v2-system-review-context.md`
2. The main PRD
   `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
3. The contract-freeze companion
   `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
4. The drift/findings file
   `documentation/tasks/findings-of-tasks-0048-prd-reading-v2-studio-and-runtime.md`
5. The full exported conversation transcript
   `Clippings/IELTS Reading/codex-conversation-ielts-reading-v2-system-2026-04-22-019db4a2.md`

### 2.2 Strongly Recommended Companion Docs

These docs now exist and should be treated as part of the real review packet:

6. Reading V2 taxonomy index
   `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
7. Canonical `TaskGroup` object doc
   `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`
8. Family docs
   - `documentation/tasks/PRD0048/reading-v2-family-completion.md`
   - `documentation/tasks/PRD0048/reading-v2-family-choice.md`
   - `documentation/tasks/PRD0048/reading-v2-family-binary-judgement.md`
   - `documentation/tasks/PRD0048/reading-v2-family-matching.md`
   - `documentation/tasks/PRD0048/reading-v2-family-structured-layout.md`
9. Standalone page-schema docs and integration contracts
   - `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
   - `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
   - `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
   - `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-desktop-tablet.md`
   - `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-phone.md`
   - `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
   - `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
   - `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`

### 2.3 Optional Deep-Dive Docs

These are concise per-type docs. The reviewer does not need to read all 16 unless auditing task-type completeness or family mapping rigor.

- `documentation/tasks/PRD0048/reading-v2-type-sentence-completion.md`
- `documentation/tasks/PRD0048/reading-v2-type-summary-completion-text.md`
- `documentation/tasks/PRD0048/reading-v2-type-summary-completion-list.md`
- `documentation/tasks/PRD0048/reading-v2-type-note-completion.md`
- `documentation/tasks/PRD0048/reading-v2-type-table-completion.md`
- `documentation/tasks/PRD0048/reading-v2-type-flowchart-completion.md`
- `documentation/tasks/PRD0048/reading-v2-type-diagram-labeling.md`
- `documentation/tasks/PRD0048/reading-v2-type-true-false-not-given.md`
- `documentation/tasks/PRD0048/reading-v2-type-yes-no-not-given.md`
- `documentation/tasks/PRD0048/reading-v2-type-matching-headings.md`
- `documentation/tasks/PRD0048/reading-v2-type-matching-information.md`
- `documentation/tasks/PRD0048/reading-v2-type-matching-features.md`
- `documentation/tasks/PRD0048/reading-v2-type-matching-sentence-endings.md`
- `documentation/tasks/PRD0048/reading-v2-type-multiple-choice.md`
- `documentation/tasks/PRD0048/reading-v2-type-multiple-select.md`
- `documentation/tasks/PRD0048/reading-v2-type-short-answer.md`

Optional supplemental artifact if the reviewer wants more context on the mobile dense-task debate:

- `Clippings/IELTS Reading/screencapture-chatgpt-c-69e7e75c-4b9c-8323-9ae2-0861726861b9-2026-04-22-15_23_15.md`

### 2.4 Precedence Rule

If the docs appear to disagree, use this order:

1. PRD = product intent and boundary
2. Contract freeze = execution law
3. Taxonomy, `TaskGroup`, family, type, feature-pipeline matrix, test-making-pipeline, page-schema, and integration-contract docs = implementation-detail source of truth within the PRD-0048 packet
4. Findings file = current repo drift and non-target reality
5. Conversation log = rationale and decision trail, not the final contract by itself

---

## 3. What We Need From the External Reviewer

We want a response that covers all of the following:

1. A verdict on whether the PRD-0048 packet is directionally correct.
2. A diagnosis of what is strong, weak, ambiguous, risky, or internally contradictory.
3. A critique of whether the proposed system boundary is the right one.
4. A critique of whether the proposed canonical model is the right abstraction level.
5. A critique of whether the teacher workflow is efficient and implementation-safe.
6. A critique of whether the student delivery model is coherent across desktop, tablet, and phone.
7. A critique of whether the passage-asset and extracted-material model is strong or dangerous.
8. A critique of whether the current packet is explicit enough for a junior developer, or still leaves too much room for improvisation.
9. Recommendations for missing requirements, missing docs, missing surface contracts, or missing constraints.
10. Recommendations for better technologies, better editor architecture, better runtime architecture, or better review workflow if needed.
11. A safer rollout or phasing proposal if the current packet tries to do too much too early.
12. Identification of edge cases, silent-failure risks, coupling risks, and reviewability risks.
13. A judgement on whether the current packet is sufficient for task generation, or whether more contract work is still required first.

We explicitly want the reviewer to offer:

- improvements
- alternative approaches
- replacement abstractions if ours are weak
- better technology choices if ours are not the best fit

We do not want shallow advice such as:

- "improve the UI"
- "just make the parser smarter"
- "store more metadata" without a real contract
- generic "use microservices" or "use AI more" advice without architecture-level reasoning

---

## 4. Short Product Context

This app is a web-based teacher/student assessment platform.

At a high level, it already supports:

- teacher materials management
- draft and published test content
- public library content
- live supervised testing
- solo practice
- homework assignment and submission
- course and class material reuse
- result review

It is not an IELTS-only product. It has other skill and exam families too.

The feature area in question is specifically:

- IELTS Reading

The proposed new system is:

- `IELTS Reading V2`

This proposal exists because the current Reading feature family appears to have grown from narrow rendering assumptions instead of from a canonical authoring model.

---

## 5. The Core Product Problem In Plain Language

The team believes the current Reading approach started from the wrong abstraction.

The current problem is not only "some renderers are messy."

The real problem is believed to be:

- the system flattened too much structure too early
- authoring and delivery do not share one clean source of truth
- grouped Reading tasks are often reconstructed later instead of authored explicitly
- fixes tend to patch specific task shapes rather than improve the underlying model

The team now wants a system where:

- teachers author real Reading structure directly
- AI import produces editable canonical structure rather than fragile flattened content
- student runtime reads that same structure directly
- dense task types like tables, diagrams, matching sets, summaries, and other grouped tasks do not rely on heuristics

In short:

- the team wants a Reading system designed from authoring truth outward, not from renderer workaround inward

---

## 6. The Core Review Question

What is the safest and strongest architecture for a full IELTS Reading system such that:

- teachers can create and manage content coherently
- structured Reading tasks remain structurally correct from authoring to delivery
- the system supports both full tests and reusable extracted materials
- the student runtime is strong on desktop/tablet and still usable on phone
- the design is explicit enough that junior implementers do not invent missing behavior

---

## 7. What PRD-0048 Proposes In Plain Language

PRD-0048 now proposes a full greenfield IELTS Reading system, not just a new editor.

At a high level it proposes:

1. A separate Reading V2 system that leaves legacy Reading content on the old engine.
2. A packaging model that separates:
   - passage assets
   - task-group materials
   - full tests
3. One unified full-page Reading studio for:
   - create blank
   - import
   - resume draft
   - published edit through draft revision
4. Teacher management through the existing Teacher Lobby concept rather than a brand-new top-level lobby.
5. Student desktop/tablet delivery through a two-column Reading model.
6. Student phone delivery through a passage-first model with task-family-specific interaction patterns.
7. Result review content organized primarily by task group inside the existing result/feedback system, not as a separate Reading V2 result page.
8. A documentation stack beyond the PRD itself so juniors do not implement from vague assumptions.

### 7.1 What The Contract Freeze Adds

The contract-freeze companion adds the execution law that the PRD alone did not freeze tightly enough.

At a high level it locks:

- a three-plane separation:
  - canonical authoring/runtime plane
  - library and packaging plane
  - delivery and projection plane
- immutable identity rules for documents, task groups, interactions, anchors, and extracted copies
- anchor semantics and numbering/rebase law
- extraction, provenance, and where-used law
- draft revision and autosave conflict rules
- validation severity and publish-gate rules
- feature pipeline rules for passage assets, extraction, publish/projection, runtime delivery, platform launches, submission/result, rollout, and observability
- ordered test-making pipeline rules for access, metadata, editor, answer-key/scoring, Settings, preview, publish, and platform relationship handoff
- result snapshot, existing review/feedback integration, and regrade rules
- current Reading V1 student UI parity rules
- family-specific phone contracts for dense Reading task families

This matters because the external reviewer is not only reviewing the product idea. They are also reviewing whether the execution-law layer is strong enough to stop junior implementation drift.

---

## 8. Important Locked Decisions Already Made

These decisions are already locked in the current packet and should be stress-tested by the reviewer.

### 8.1 System Boundary

- This is a separate new feature family, not a refactor of current Reading internals.
- The first shippable release must cover the full loop, not just authoring.
- The destination scope is all 16 official IELTS Reading task types, delivered in phases.

### 8.2 Authoring Model

- The system should use a structured schema-first model, not a freeform canvas as the source of truth.
- Teachers author meaning and linkage; the system owns final layout rules.
- One interaction belongs to exactly one task group.
- One passage asset may support multiple task groups.

### 8.3 Studio Workflow

- There should be one Studio contract.
- The Studio contract may be hosted by route-backed pages and the adapted Teacher Lobby edit-modal entry.
- There should not be separate long-lived review pages or published-edit modals with their own editor model.
- The same studio shell should support create, import, draft review, and published edit revision.
- The top-level teacher editing tabs are locked to:
  - `Stimulus`
  - `Questions`
  - `Settings`
- Answer-key editing is absorbed into `Questions`, not a separate top-level tab.
- Test making follows one ordered flow from existing entry surface to metadata, Studio editor, Questions-owned answer keys/scoring, material Settings, validation/preview, publish, and return to existing platform relationships.
- `Settings` must not own homework due dates, assigned students/classes, live session code/state, course placement/order, per-assignment release overrides, or final result release state.

### 8.4 Reuse Model

- Passages should exist as standalone reusable assets.
- But passages are not meant to be the main live delivery unit.
- Extracted `passage + task group` copies become separate publishable materials.
- Extracted copies are not live-linked.
- Extracted copies keep hidden provenance metadata only for audit, history, and search.

### 8.5 Published Editing

- Teachers always edit published content through a new or resumed draft revision.
- The currently published version stays live until republish.
- No emergency direct-live-edit path is currently planned.

### 8.6 Student Delivery Model

- Desktop and tablet must imitate the current Reading V1 two-column Reading experience.
- Phone does not use true split view.
- Phone must imitate the current Reading V1 passage-first surface with reachable question sheet and pre-submit review summary.
- Dense task families are allowed to use task-family-specific mobile interaction patterns.
- The packet rejects one naive universal phone fallback for every dense task type.

### 8.7 Result Review And Feedback

- Existing result/review/feedback surfaces remain the UI owner.
- Reading V2 supplies result records, grouped review adapters, and release-policy-safe content.
- Teacher review content defaults to task-group-first organization inside the existing result shell.
- Flat-number view remains a secondary utility, not the main mental model.
- Separate standalone Reading V2 teacher/student result pages are out of scope.

### 8.8 Canonical Taxonomy

- The packet uses one canonical 16-type slug set.
- The packet explicitly separates official task type from engineering family.
- The packet intentionally overrides older broad repo category buckets where they are too weak for V2.

Examples:

- `summary-completion-list` is in the `choice` family
- `short-answer` is in the `completion` family
- `table-completion`, `flowchart-completion`, and `diagram-labeling` are in the `structured-layout` family

---

## 9. Visual Product Shape Currently Intended

The PRD includes visual page schemas and integration contracts for:

- Reading V2 feature pipeline matrix
- Reading V2 Studio
- Reading V2 test-making pipeline
- student desktop/tablet runtime
- student phone runtime
- student runtime V1 UI parity
- existing Teacher Lobby integration
- existing result/review/feedback integration

The intended high-level structure is:

### Teacher Lobby

- existing Teacher Lobby material cards remain the entry pattern
- clicking a Reading V2 material opens the adapted edit-modal entry
- the adapted edit modal hosts or launches Studio behavior
- no new Teacher Lobby page, Reading-only filter rail, or standalone passage-asset browsing page is in phase-1 scope

### Reading V2 Studio

- full page
- two-column structure
- left side is stimulus/reference
- right side is questions/task logic
- same shell for create, import, review, and revision

### Student Desktop/Tablet

- imitates current Reading V1 desktop/tablet runtime
- passage or shared stimulus on the left
- full grouped question panel on the right
- no new answer-sheet-first desktop interface

### Student Phone

- imitates current Reading V1 phone runtime
- passage-first primary surface
- floating/reachable question entry
- bottom-sheet question surface
- pre-submit review summary and final confirmation
- dense task types may use specialized mobile patterns

### Existing Result/Feedback Integration

- existing result modal/slide-panel/full-page shells remain the UI owner
- Reading V2 adds adapter content inside existing review surfaces
- group-first Reading review content is the default inside that shell
- flat-number jump remains a utility layer
- feedback and release policy remain in existing platform workflows

The reviewer should challenge whether these page structures are product-strong, too rigid, or still under-specified.

---

## 10. Current-State Drift That The Reviewer Should Keep In Mind

The companion findings file says the current repo reality is still far from the PRD target.

Verified current-state drift includes:

1. Reading authoring and management are split across multiple workflows, not one coherent system.
2. The current generic editor is still largely flat-question-first.
3. The current Reading runtime still contains heuristic grouped-task rendering paths.
4. Grouped support exists only as partial task-specific sidecars, not as a unified Reading architecture.
5. Reading preview trust is fragmented.
6. Current mobile Reading work is still attached to the old Reading engine.
7. There is no Reading V2-specific publish/router branch yet.
8. The current parser pipeline is still tied to legacy Reading assumptions.
9. There is still no shipped whole-document Reading V2 canonical model in live code.
10. There is still no shipped Reading V2 real-runtime preview path in live code.
11. There is still no shipped direct Reading V2 storage/router branch in production code.
12. There is still no shipped Reading V2 draft-revision editing path in live code.

The reviewer should not confuse:

- current repo truth

with:

- the system that the PRD-0048 packet wants to build

---

## 11. Areas We Most Want Challenged

These are the areas where we most want rigorous external pushback.

### 11.1 The Canonical Model

Is the separation between:

- canonical runtime truth
- reusable packaging
- derived delivery projections

strong enough and clearly separated enough?

### 11.2 The Unified Studio Decision

Is one full-page studio with multiple modes truly the best approach?

Or would this create:

- too much mode complexity
- permission confusion
- review or publish ambiguity
- an overstuffed editing surface

### 11.3 Passage Assets

Are standalone passage assets truly a strength here?

Or do they risk:

- over-reuse
- dependency blast radius
- orphan assets
- psychometric or pedagogy drift
- content-governance complexity

### 11.4 Extracted Materials

Is "extract `passage + task group` into a new separate material" the right reuse model?

Or does it risk:

- content duplication
- search clutter
- provenance confusion
- maintenance sprawl

### 11.5 Mobile Dense-Task UX

Is the current direction for phone Reading genuinely good?

Especially for:

- table completion
- diagram labeling
- matching families

The reviewer should challenge whether the mobile plan is:

- too ambitious
- too fragmented by task family
- still too vague for implementation
- or actually the right richness level

### 11.6 Revision, Conflict, And Publish Law

Is the current execution law around:

- draft revision
- autosave conflicts
- validation severities
- publish gates

strong enough to stop data corruption and junior improvisation?

### 11.7 Results, Review, And Regrade

Is the current split between:

- scoring truth
- saved result truth
- review and feedback layers
- regrade history

the right one?

### 11.8 Junior-Implementation Safety

Does the current packet still leave too much open for a junior to invent?

If yes, what exact decisions still need to be locked before task generation?

### 11.9 Technology Choices

The conversation currently leans toward a schema-first structured editor approach, with discussion around technologies like:

- ProseMirror / Tiptap
- CKEditor 5
- Lexical

The reviewer should feel free to:

- affirm these
- reject them
- propose better alternatives

If another approach would be materially safer, stronger, or more scalable, we want that called out directly.

---

## 12. Terms The Reviewer Should Understand

These terms are used throughout the packet.

### Passage Asset

A reusable Reading stimulus unit.

Examples:

- a passage text
- a diagram source
- a table frame
- a flowchart base

This is not meant to be the main live delivery unit by itself.

### Task Group

A grouped Reading unit that owns:

- one Reading task pattern
- instructions
- answer rules
- ordered interactions
- stimulus linkage

This is the core grouped authoring/runtime abstraction.

### Interaction

One atomic scored response slot.

Examples:

- one blank
- one selected option
- one match assignment

### Task Family

An engineering grouping of official IELTS task types that share similar interaction or rendering mechanics.

This is not meant to replace official IELTS labels.

It exists to reduce duplicated implementation logic and duplicated docs.

### Extracted Material

A new material created by taking an existing `passage + task group` and publishing it as its own reusable unit.

This is a copy with provenance metadata, not a live linked derivative.

### Canonical Authoring And Runtime Plane

The editable truth of Reading meaning:

- document
- sections
- stimuli
- task groups
- interactions
- anchors

### Library And Packaging Plane

Reusable management units:

- passage assets
- task-group materials
- full tests

### Delivery And Projection Plane

Derived outputs only:

- student-safe payloads
- session payloads
- review indexes
- analytics views

These are never editable source truth.

### Anchor

The explicit link between a shared stimulus and a scored interaction.

Examples:

- paragraph anchor
- inline blank anchor
- table-cell anchor
- flow-step anchor
- diagram hotspot anchor

### Rebase

Changing visible question numbering because of reorder, extraction, or assembly without changing stable semantic identity.

---

## 13. What The Conversation Log Adds Beyond The Packet

The exported conversation log is useful because it captures:

- why certain decisions were made
- which options were considered and rejected
- where the user explicitly pushed for stronger clarity and less room for implementer guessing
- research threads on:
  - assessment architecture
  - editor architecture
  - task-family modeling
  - mobile dense-task UX
  - teacher materials workflow
  - library, homework, course, and live-session integration

The reviewer should use the conversation log especially for:

- rationale
- tradeoffs
- unresolved tension
- places where the packet may still compress too much nuance

The reviewer should not treat every idea in the conversation log as locked.

The packet docs are the intended contract.

The conversation log is the reasoning trail behind them.

---

## 14. What The Reviewer Can Assess Reliably Without Repo Access

Even without code access, the reviewer should be able to assess:

- whether the direction is conceptually sound
- whether the product and system boundary is coherent
- whether the abstractions are strong enough
- whether the visual workflow shape is sensible
- whether the phone-vs-desktop delivery plan is coherent
- whether the reuse and provenance model is sound
- whether the packet is explicit enough for juniors
- whether a better sequencing or tech choice is advisable

---

## 15. What The Reviewer Cannot Fully Verify Without Repo Access

Without direct code access, the reviewer cannot independently verify:

- exact file-level complexity
- hidden implementation coupling
- exact migration burden
- existing test coverage
- whether every repo dependency was discovered

Because of that, we want the reviewer to:

- make strong architecture and product judgments
- label assumptions clearly
- point out where implementation-time verification will still be required

---

## 16. Packet Gaps That Still Exist

The packet is much stronger than before, but it is not yet complete in every dimension.

Important packet hardening that still does not exist as separate artifacts:

- machine-readable canonical schema artifacts
- canonical fixture or gold-sample sets by family and by task type
- dedicated projection-shape docs for:
  - student-safe payloads
  - session-safe payloads
  - review indexes
  - analytics outputs
- a packet-lint or doc-lint mechanism that catches stale references after packet growth

Still unresolved at the PRD or rollout level:

- final user-facing product naming
- whether standalone passage assets should be broadly visible from phase 1
- whether rollout should be internal-first before wider teacher exposure

The reviewer should comment on these too.

---

## 17. Desired Output Format From The External Reviewer

We want the reviewer's response to be structured and decisive.

Ideal format:

1. Short verdict
2. What is strong
3. What is weak or risky
4. What is missing
5. Better approach or better alternatives
6. Technology recommendations
7. Recommended phase plan
8. Edge cases and failure modes
9. Exact things that should be added or changed before implementation starts

If the reviewer thinks the packet should be narrowed, split, or partially rewritten, they should say that directly.

If the reviewer thinks a different architecture is better, they should propose it directly.

---

## 18. Final Review Prompt To Give The External Reviewer

Use this prompt if you want to hand the packet to another AI reviewer verbatim:

> Please review the attached handoff, PRD-0048, the contract-freeze companion, findings file, taxonomy index, `TaskGroup` object doc, family docs, feature pipeline matrix, test-making pipeline, page-schema docs, integration contracts, and conversation transcript as a senior systems architect and product/engineering reviewer.
> You do not have repo access. Treat the handoff and attached docs as the available evidence packet.
> Use this precedence rule if the docs feel different in abstraction level: PRD = product intent, contract freeze = execution law, taxonomy / `TaskGroup` / family / type / feature-pipeline matrix / test-making-pipeline / page-schema / integration-contract docs = implementation-detail truth, findings = current-state drift, conversation log = rationale trail.
> I want a thorough assessment of whether the proposed IELTS Reading V2 system is conceptually strong, sufficiently explicit for junior implementation, and well-sequenced.
> Please challenge weak assumptions, identify contradictions or missing requirements, propose better solutions or architecture if needed, and recommend stronger technologies or approaches if the current direction is not optimal.
> Pay special attention to: the three-plane architecture, canonical model quality, feature-area access points and pipelines, unified test-making pipeline, unified studio design, Teacher Lobby card/edit-modal integration, current Reading V1 student runtime parity, passage assets, extracted materials, delivery/projection boundaries, revision/conflict law, publish gating, existing result/feedback integration, result/regrade semantics, mobile dense-task UX, implementation safety for juniors, and whether the current packet is sufficient for task generation or still needs more contract work first.
