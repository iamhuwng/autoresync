# Contract Freeze: PRD-0048 IELTS Reading V2 System

This document is the implementation-level contract companion to:

- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/findings-of-tasks-0048-prd-reading-v2-studio-and-runtime.md`

The PRD defines product direction and scope. This file freezes the execution law that was still too implicit for junior-safe implementation.

If this file and the PRD ever conflict, resolve the conflict this way:

1. Product intent comes from the PRD.
2. Execution law comes from this contract freeze.
3. Current codebase reality comes from the findings file.

No `tasks-0048-*` implementation plan should be generated until this contract freeze is accepted as part of the source-of-truth packet.

---

## 1. Why This Document Exists

PRD-0048 is directionally correct, but it still leaves too much room for local improvisation in areas that can corrupt the whole system:

- canonical object ownership
- reusable material packaging
- derived delivery payloads
- numbering and anchor behavior
- draft revision and conflict behavior
- validation and publish law
- result and regrade semantics
- current Reading V1 student UI parity on desktop/tablet and phone
- mobile contracts for dense Reading tasks

This file exists to remove that ambiguity before implementation begins.

---

## 2. Source-Of-Truth Packet

Reading V2 must be implemented from a document packet, not from the PRD alone.

### 2.1 Packet Roles

| Document | Role |
|---|---|
| `0048-prd-reading-v2-studio-and-runtime.md` | Product boundary, user-facing behavior, system surfaces, locked decisions |
| `contract-freeze-0048-prd-reading-v2-studio-and-runtime.md` | Execution law, object ownership, projection law, validation law, runtime/result law |
| `findings-of-tasks-0048-prd-reading-v2-studio-and-runtime.md` | Current repo drift and what must not be mistaken for target truth |
| `reading-v2-taskgroup-object.md` | Canonical object deep dive |
| `reading-v2-task-taxonomy-index.md` | Official task taxonomy and derived-task rules |
| `reading-v2-family-completion.md`, `reading-v2-family-choice.md`, `reading-v2-family-binary-judgement.md`, `reading-v2-family-matching.md`, `reading-v2-family-structured-layout.md` | Shared mechanics by engineering family |
| `reading-v2-type-*.md` packet | Official IELTS behavior by task type |
| `reading-v2-feature-pipeline-matrix.md` | Access points, owning surfaces/services, pipeline order, outputs, tests, and forbidden patterns for every major PRD-0048 feature area |
| `reading-v2-test-making-pipeline.md` | Ordered teacher test-making pipeline, metadata boundary, answer-key placement, Settings ownership, publish relationship law |
| `reading-v2-page-schema-studio.md` and student runtime page-schema docs | Visual surface rules for PRD-owned Studio and student runtime surfaces |
| `reading-v2-student-runtime-v1-parity-contract.md` | Required current Reading V1 UI imitation rules for desktop/tablet and phone |
| `reading-v2-teacher-lobby-integration.md` | Existing Teacher Lobby material-card/edit-modal integration law |
| `reading-v2-result-feedback-integration.md` | Existing result/review/feedback integration law |

### 2.2 Non-Negotiable Interpretation Rules

1. The canonical authoring/runtime plane is the only editable truth for Reading content behavior.
2. Reusable material packaging is not the same thing as canonical runtime truth.
3. Student-safe payloads, session payloads, review indexes, and analytics views are projections only.
4. No projection may become user-editable source data.
5. No legacy Reading structure may be copied into V2 just because the old code already exists.
6. V1 Reading files may be used as visual or behavioral references only; V2 core modules must not import legacy Reading editor, runtime, parser, scoring, flat-question reconstruction, or V1 grouped-task compatibility helpers.
7. Any necessary compatibility with existing platform shells must live in explicit edge adapters that convert at the boundary and preserve V2 canonical/projection truth internally.

---

## 3. Three-Plane Architecture

The Reading V2 system must keep three planes separate.

### 3.1 Plane Definitions

| Plane | Purpose | Editable? | Example objects |
|---|---|---|---|
| Canonical authoring/runtime plane | Expresses Reading meaning, grouping, numbering basis, scoring basis, anchor linkage | Yes | `ReadingDocument`, `Section`, `StimulusNode`, `TaskGroup`, `Interaction`, `OptionSet` |
| Library and packaging plane | Packages reusable content for management, discovery, extraction, assignment, and assembly | Yes, but not as runtime truth | `PassageAsset`, `TaskGroupMaterial`, `FullTest`, provenance records, where-used graph |
| Delivery and projection plane | Produces student-safe, session-safe, review, and analytics outputs from canonical/published data | No | `student_safe_tests/{testId}`, `session_test_payloads/{sessionCode}`, review index, analytics projections |

### 3.2 Plane Separation Law

1. Canonical nodes may reference packaged materials, but packaged materials do not replace canonical node semantics.
2. Full tests may assemble task-group materials, but final runtime numbering and grouping still derive from canonical assembly order.
3. Delivery projections must be generated from published canonical snapshots.
4. A projection may never be manually edited to fix content truth.
5. If a projection is wrong, the fix must happen in the canonical or packaging plane and the projection must be regenerated.

---

## 4. Canonical Authoring And Runtime Plane

### 4.1 Identity Law

Every canonical object must have an immutable stable ID for its lifetime inside one draft or published snapshot.

Required ID classes:

- `documentId`
- `sectionId`
- `stimulusId`
- `taskGroupId`
- `interactionId`
- `anchorId`
- `optionSetId`
- `importEvidenceId`

Identity rules:

1. IDs do not change during reorder, renumber, or cosmetic edits.
2. If an object is semantically the same object after revision, keep the same ID.
3. If an object is cloned by extraction, duplication, or derivative creation, assign a new ID and record provenance.
4. Published attempts and results must always store stable IDs in addition to visible question numbers.
5. Visible numbers are derived labels, not primary identities.

### 4.2 Core Canonical Objects

#### `ReadingDocument`

Owns:

- document metadata
- ordered sections
- canonical node registries
- layout profile rules
- validation state
- provenance references

Does not own:

- student-safe payloads
- session payloads
- saved results

#### `Section`

Owns:

- section title and order
- ordered references to stimuli and task groups
- section-scoped navigation grouping

Rule:

- A section may contain one or more passages or structured stimuli.
- The default studio template starts with one section.
- Full IELTS templates may create three sections, but the model is not hardcoded to three.

#### `StimulusNode`

Represents shared content that students inspect before or while answering.

Allowed stimulus kinds:

- passage
- table shell
- flowchart shell
- diagram shell
- media
- summary or note shell

A stimulus node may expose anchors. A stimulus node is not a scored answer slot.

#### `TaskGroup`

Represents one grouped Reading unit with shared instructions and ordered interactions.

Owns:

- one official task type
- one engineering task family
- instruction block(s)
- answer-rule block
- ordered interaction references
- stimulus references
- optional option-set references
- local task-layout hints

Does not own:

- other task groups' interactions
- raw passage versioning policy
- result records

#### `Interaction`

Represents one scored answer slot.

Owns:

- stable `interactionId`
- one `taskGroupId`
- response shape
- scoring rule
- review label
- optional anchor target
- derived visible question number

Interaction law:

1. One interaction belongs to exactly one task group.
2. One interaction may target zero or one primary anchor.
3. Interactions are ordered only within the owning task group; whole-test numbering is derived later.

#### `OptionSet`

Represents a reusable visible choice bank inside one task group or one bounded grouped unit.

Rule:

- Option sets may be shared within a task group.
- Option sets must not become cross-group shared scored interactions.

### 4.3 TaskGroup Semantics

`TaskGroup` is the canonical container for grouped Reading behavior.

It must answer all of these questions explicitly:

- what official IELTS task type is this
- what engineering family does it belong to
- what instructions govern the group
- what answer rule governs the group
- which stimulus nodes and anchors are in scope
- which interactions belong to the group
- what local numbering range is implied by interaction order
- what mobile/desktop family contract applies

The following are forbidden:

- task groups that borrow scored interactions from another task group
- task groups that rely on question-text parsing to rediscover anchor placement
- task groups that infer answer rules from renderer heuristics

### 4.4 Anchor Model

Anchors are the canonical bridge between a shared stimulus and a scored interaction.

Anchor rules:

1. Anchors belong to one stimulus node.
2. Anchors have immutable `anchorId` values.
3. Anchors are typed. At minimum, the model must distinguish:
   - paragraph anchor
   - inline blank anchor
   - table-cell anchor
   - flow-step anchor
   - diagram hotspot anchor
   - annotation anchor
4. An interaction may reference one primary anchor and optional secondary context anchors.
5. Deleting an anchor with a linked interaction creates a validation error until the interaction is repaired or removed.
6. Moving an anchor inside a stimulus must preserve the `anchorId` when the semantic blank or target remains the same.
7. If the semantic target changes, create a new anchor and track the replacement in draft history.

### 4.5 Numbering And Rebase Law

Reading V2 must separate identity from visible numbering.

Rules:

1. `interactionId` is the stable truth.
2. Visible IELTS question numbers are derived labels.
3. Reorder, insert, delete, or extraction may rebase visible numbers without changing stable IDs, unless the object is cloned.
4. Draft-only placeholders must remain unnumbered.
5. Unnumbered placeholders are publish-blocking.
6. A standalone task-group material defaults to local numbering that starts at `1`.
7. A full test derives final numbering from assembled task-group order.
8. Saved results must store both:
   - stable `interactionId`
   - visible `displayNumber` at attempt time

### 4.6 Import Uncertainty Law

AI import must preserve uncertainty explicitly.

Imported nodes may carry:

- confidence level
- extraction evidence
- unresolved issue flags
- repair notes

Rules:

1. Confidence alone does not decide publishability.
2. Any unresolved uncertainty on a scoring-bearing node is publish-blocking until confirmed or repaired.
3. Editing or confirming a node may clear the blocking state while preserving the import evidence history.
4. Unsupported structures must remain explicit and publish-blocking until repaired or removed.

---

## 5. Library And Packaging Plane

### 5.1 Packaging Objects

#### `PassageAsset`

Represents one reusable stimulus asset under controlled governance.

Must support:

- immutable versioning
- source and rights metadata
- topic metadata
- paragraph map
- accessibility metadata
- provenance lineage
- where-used visibility

A passage asset is discoverable and reusable, but it is not the normal student delivery unit.

#### `TaskGroupMaterial`

Represents one publishable reusable material built around:

- one primary passage asset version
- one or more canonical task groups
- local numbering basis
- packaged metadata for discovery and assignment

This is the correct unit for later "find all matching headings materials" behavior.

#### `FullTest`

Represents an ordered assembly of task-group materials for student delivery.

Rules:

1. Full tests assemble task-group materials or equivalent packaged grouped units.
2. Final visible numbering for a full test is derived at assembly level.
3. Full tests may contain multiple sections and multiple passage assets.

### 5.2 Packaging Governance States

Passage assets and materials must support explicit governance states.

Minimum states:

- `draft`
- `published`
- `archived`
- `retired`

Optional reuse advisory states:

- `reusable`
- `reuse-with-caution`
- `do-not-reuse`

`retired` means:

- the object remains historically visible
- existing dependent results remain intact
- new assignment/use is blocked

### 5.3 Extraction Law

Extracting `passage + task group` from a source test creates a new packaged material.

Extraction rules:

1. Extraction creates new canonical IDs for the copied material.
2. Extraction records hidden provenance metadata.
3. Extraction does not create a live link.
4. The extracted material may diverge immediately.
5. If the extracted passage text changes materially, create a derivative passage asset or new version under the extracted material, not a hot edit of the source passage asset.

Required provenance fields:

- source test ID
- source packaged material ID if present
- source passage asset ID and version
- source task group IDs
- extracted by
- extracted at
- extraction method

### 5.4 Where-Used Graph

Passage assets must expose where-used information across:

- draft materials
- published task-group materials
- full tests
- archived materials

Where-used must be visible before:

- editing an asset version
- retiring an asset
- replacing an asset in a published revision

---

## 6. Delivery And Projection Plane

### 6.1 Projection Law

Projection objects are generated outputs. They are never the editing source of truth.

The Reading V2 system must produce at least these projection classes:

- preview payload
- student-safe published payload
- session-safe launch payload
- review index projection
- analytics projection

### 6.2 Current Platform Alignment

Reading V2 should reuse shared platform shells and projection plumbing where safe:

- teacher management shell via existing Teacher Lobby material cards and edit-modal entry
- solo and homework launch through the shared student practice flow
- live sessions through the shared student test router
- saved results through the shared permanent result storage
- existing result, review, feedback, release-policy, and regrade shells

Reading V2 must not reuse legacy Reading internals for authoring or rendering.

Implementation boundary rules:

1. `src/services/reading-v2/**` owns V2 canonical, packaging, projection, validation, scoring, repository, and result semantics.
2. `src/components/reading-v2/**` owns V2 Studio and runtime implementation.
3. Those V2 core folders must not import legacy Reading editor/runtime/parser/scoring modules or flat-question reconstruction helpers.
4. Shared platform files may branch to V2 only through explicit engine discriminators and named V2 adapters or runtime entry points.
5. Boundary files must include short code-level notes that state accepted input shapes, ownership, and forbidden legacy dependencies.

### 6.3 Publish Projection Contract

Published canonical row:

- `tests/{testId}`

Required high-level fields:

- `testId`
- `deliveryEngine: 'reading-v2'`
- `schemaVersion`
- `publishedAt`
- `publishedBy`
- canonical Reading V2 snapshot

Student-safe projection:

- `student_safe_tests/{testId}`

Rules:

1. This is the exact student delivery shape for non-live launches.
2. It must strip grading answers, acceptable-answer sets, explanations, review-only provenance, diagnostics, and import evidence that students must never see.
3. It must preserve runtime-critical grouping, anchors, numbering, navigation, and render contracts.

### 6.4 Session Projection Contract

Session-safe projection:

- `session_test_payloads/{sessionCode}`

Required wrapper fields:

- `sessionCode`
- `testId`
- `deliveryEngine`
- `schemaVersion`
- `generatedAt`
- `testData`

Rules:

1. This payload is derived from the student-safe published payload, not from a second canonical model.
2. Staleness checks must validate both `testId` and version identity.
3. Ending a live session must clear the session payload.

### 6.5 Result Contract

Authoritative saved result row:

- `test_results/{resultId}`

Minimum Reading V2 result identity fields:

- `resultId`
- `testId`
- `deliveryEngine`
- `publishedSnapshotVersion`
- `attemptContext`
- `student identity context`
- `submittedAt`

Minimum Reading V2 question-level fields:

- `interactionId`
- `taskGroupId`
- `displayNumber`
- `taskFamily`
- `officialTaskType`
- `studentAnswer`
- `scoredAnswer`
- `score`
- `maxScore`
- `reviewState`
- `anchorRef` when relevant

Result fan-out projections may continue to use the current shared indexes:

- `test_results_by_session`
- `test_results_by_student`
- `test_results_by_teacher`
- `test_results_by_course`
- `test_results_by_class`
- `test_results_solo_practice_by_student`

These are indexes only. They are never authoritative result truth.

### 6.6 Review And Feedback Projection Contract

Review and feedback are separate from scoring.

Rules:

1. The saved result is the authoritative scoring record.
2. Teacher feedback and AI-generated formative feedback are layered onto the saved result, not mixed into canonical test content.
3. Session review release state governs what the student may see after live sessions.
4. Result visibility must be sanitized by release state before student rendering.
5. Reading V2 must integrate with existing result/feedback shells instead of creating separate standalone result-review pages.
6. Reading V2 grouped review content must be supplied through adapters or subcomponents inside the existing review path.

### 6.7 Projection Safety Matrix

| Projection | Students can read? | Teachers can edit? | Must never contain |
|---|---|---|---|
| Preview payload | Teacher only | No, regenerate from draft | persisted live attempt state |
| `student_safe_tests/{testId}` | Yes | No | answer keys, review diagnostics, import evidence |
| `session_test_payloads/{sessionCode}` | Yes, active session only | No | grading answers, author-only metadata |
| Review index | Teacher only | No | canonical editable content |
| Analytics projection | Teacher/admin only | No | student-hidden answer keys that bypass release policy |

### 6.8 Firebase, Authorization, And Operational Reuse Law

Reading V2 operational hardening must extend existing app relationships rather than creating detached subsystems.

Required mapping before implementation:

1. Every Reading V2 storage path must name its owning service and its consuming existing surface.
2. Every canonical, packaging, projection, attempt, result, review, and analytics object must identify whether it is read by Studio, Teacher Lobby, Material Profile, library, homework, course, solo practice, live session, result/review, feedback, regrade, or observability.
3. Every student-readable path must be a student-safe or session-safe projection, never a canonical draft or authoring snapshot containing answer keys, diagnostics, provenance, or import evidence.
4. Every teacher/admin-readable path must still enforce ownership, role, and release-policy boundaries through route guards, service/repository checks, and Firebase Rules.
5. Every write path must state whether it is canonical authoring, packaging metadata, projection regeneration, attempt capture, result generation, feedback/regrade, or analytics output.
6. Every index or fan-out write must update an existing platform relationship index or an explicitly namespaced Reading V2 projection used by an existing platform surface.

Authorization minimums:

1. Teacher Studio access is limited to teachers/admins who own or are permitted to manage the material.
2. Students may read only launch-appropriate student-safe/session-safe payloads and their release-policy-allowed result views.
3. Students must not read teacher drafts, canonical authoring snapshots with answers, import evidence, author diagnostics, hidden provenance, unreleased answer keys, or teacher-only review indexes.
4. Existing result release policy remains the owner of what students can see after submission.
5. UI route guards are not sufficient by themselves; Firebase Rules and service/repository checks must fail closed.

Operational UX minimums:

1. Loading, empty, error, retry, conflict, publish-success, publish-failure, import-failure, and permission-denied states must be specified for the existing shell that owns the workflow.
2. Teacher-facing notifications must use the existing app notification pattern.
3. Student runtime and result errors must render inside existing launch/result shells, not a new Reading V2 error product.
4. Partial projection or publish failure must leave the draft/published snapshot relationship coherent and must not expose half-generated student payloads.

Performance and observability minimums:

1. Performance budgets must be defined against existing route shells, launch plumbing, result shells, shared lists, and projection generation.
2. Observability must register Reading V2 actions through the existing feature registry and observability path.
3. Event properties must include enough identifiers to connect Studio, publish, launch, submit, review, feedback, and regrade without exposing student-hidden answer keys or author-only diagnostics to student-visible analytics views.

Forbidden:

- creating a new Teacher Lobby, Reading V2 management console, result-review product, notification system, analytics stack, or launch route tree to avoid integrating with existing app owners
- relying on React component visibility as the only authorization layer
- making shared platform surfaces read canonical drafts directly
- adding Firebase paths that have no owning service, consuming surface, role boundary, and projection safety rule

---

## 7. Studio Route Map And Revision State Machine

### 7.1 Route Map

Teacher management entry stays in the existing Teacher Lobby shell.

Teacher Lobby law:

- do not build a new Teacher Lobby page for PRD-0048
- do not build a new Reading V2-only lobby filter rail or management console
- Reading V2 material-card click/edit opens the existing edit-modal pattern adapted for Reading V2
- that adapted modal must host or launch the Studio contract and must not become a second editor

Recommended V2 studio routes:

- `/teacher/reading-v2/create`
- `/teacher/reading-v2/import`
- `/teacher/reading-v2/drafts/:draftId`
- `/teacher/reading-v2/materials/:materialId/revise`

All four routes must render the same `ReadingV2StudioPage` shell and differ only by mode and loaded draft context.

If the existing Teacher Lobby edit modal hosts Studio directly, it must use the same Studio shell/components and repository rules as the route-backed page.

### 7.1.1 Test-Making Pipeline Law

Teacher test making must remain one ordered flow:

1. access from existing Teacher Lobby, Material Profile, draft-card, or approved Studio route entry
2. mode resolution for create, import, resume draft, revise published, duplicate, or extract
3. metadata setup or confirmation
4. Studio editing
5. answer-key and scoring-rule editing inside `Questions`
6. material-level settings inside `Settings`
7. validation and teacher-only preview
8. publish snapshot and derived projections
9. successful non-revision publish exits Studio into existing platform relationships through Teacher Lobby/Materials context; later edits require revision plus republish

Implementation law:

- metadata is material/package information, not canonical task semantics
- answer keys and scoring rules are canonical task-group data, not a separate answer-key product
- `Settings` may own only material-level defaults and publish readiness
- homework due dates, student/class assignment targets, live session code/state, course placement/order, and final result release state stay with their existing platform owners
- preview must not create permanent session, assignment, attempt, or result records
- publish must update existing material/profile/library/assignment/launch/result relationship indexes through approved repository/service boundaries

Student launch shells remain the existing platform routes:

- `/student/practice/:materialId`
- `/student/homework/:homeworkId`
- `/student/courses/:courseId`
- `/student/library`
- `/student-test/:sessionCode`

Reading V2 plugs into those shells through engine branching, not through a parallel student route tree.

Shared launch routes that also serve legacy Reading must branch from a student-readable platform material registry row before reading V2-only storage. For solo practice, homework, course, and public-library launches, `tests/{materialId}` may serve as that registry row when it carries explicit V2 markers and a published snapshot pointer written by the publish adapter.

Launch branch law:

1. Legacy or unmarked materials open the existing V1/platform interface and must not probe `reading_v2/*`.
2. Explicit Reading V2 materials open the V2 launch path and may then read approved V2 projections.
3. Once a material is positively classified as V2, missing, denied, or invalid V2 projection data is a V2 launch error; it must not silently fall back to V1.
4. The registry row is a platform launch discriminator, not the Reading V2 source of truth.

### 7.2 Draft And Revision Objects

Drafts and published materials must be treated separately.

Minimum draft states:

- `draft`
- `needs-review`
- `ready-to-publish`
- `superseded`
- `discarded`

Minimum material states:

- `draft-only`
- `published-live`
- `archived`
- `retired`

### 7.3 Revision Law

Rules:

1. Editing a published Reading V2 material always creates or opens a draft revision.
2. The live published material stays active until republish.
3. Publishing a revision creates a new published snapshot and supersedes the prior one.
4. Historical results must remain bound to the published snapshot version used at attempt time.

### 7.4 Autosave And Conflict Law

Phase 1 does not support realtime collaborative editing.

Conflict rules:

1. Every draft save must include a base revision token.
2. If the stored revision changed since the editor loaded, the save is rejected as a conflict.
3. Conflict recovery options are:
   - reload latest
   - duplicate draft
   - compare diff then decide
4. Silent last-write-wins is forbidden.

---

## 8. Validation And Publish Law

### 8.1 Severity Levels

Validation severities:

- `info`
- `warning`
- `error`

Rules:

1. Only `error` blocks publish.
2. `warning` requires teacher visibility, but not automatic publish block.
3. `info` is advisory only.

### 8.2 Automatic Publish Blocks

The following must be `error` severity:

- orphan interaction
- orphan anchor reference
- unresolved draft placeholder
- missing scoring-bearing response shape
- duplicate or contradictory numbering after derivation
- unresolved unsupported import structure
- unresolved import uncertainty on a scoring-bearing node
- missing primary stimulus reference for a task group that requires one
- deleted passage or anchor still referenced by a task group or interaction
- invalid packaged material assembly that leaves a full test with broken numbering or missing grouped structure

### 8.3 Warnings

The following should default to `warning`:

- low-confidence imported content that has already been teacher-confirmed
- recommended mobile fallback for unusually dense tables or diagrams
- reuse-caution advisory on overused passage assets
- accessibility advisories that do not make the content impossible to attempt

### 8.4 Publish Gate Rule

Publish is allowed only when:

1. there are zero validation errors
2. numbering and anchors derive cleanly
3. student-safe and session-safe projections can be generated successfully
4. the canonical snapshot version is stamped and stored

---

## 9. Attempt, Result, And Regrade Semantics

### 9.1 Attempt Contexts

Reading V2 must distinguish at least:

- preview
- solo practice
- homework
- live session

Preview is not a real attempt and must not create permanent result data.

### 9.2 Result Snapshot Law

Every permanent result must bind to:

- published snapshot version
- delivery engine
- attempt context
- release-state policy where applicable

This is required so later republish or content repair does not retroactively rewrite historical attempts.

### 9.3 Regrade Law

Teacher review and regrade are not the same thing.

Rules:

1. Adding comments or feedback does not change scoring.
2. Manual regrade must append a regrade history entry.
3. Regrade must preserve:
   - original auto score
   - new reviewed score
   - who changed it
   - why it changed
   - when it changed
4. Regrade must never mutate the stored student answer or the published snapshot version.

### 9.4 Review Organization

Teacher review content defaults to task-group-first inside the existing result/review shell.

Rules:

1. Grouped instruction and stimulus context remain visible in the default teacher review content.
2. A secondary flat-number jump/index may exist for navigation.
3. Flat-number order is a utility view, not the primary semantic truth.
4. Do not create standalone Reading V2 teacher/student result-review pages.
5. Feedback, release policy, and regrade controls stay with the existing platform result/feedback system.

---

## 10. Family-Specific Mobile Runtime Contracts

Phone runtime uses one shared shell, imitates current Reading V1 phone behavior, and adds dense-task family contracts only where needed.

Desktop/tablet runtime must imitate the current Reading V1 two-column Reading interface while rendering from V2 projections. V2 may rebuild internals, but it must not redesign the student-facing Reading experience without senior-approved packet updates.

### 10.1 Shared Phone Rules

1. Passage or main stimulus remains the primary reading surface.
2. Question navigation remains reachable at all times.
3. Opening answer entry must not lose the student's reading position.
4. Drag-and-drop is not the primary mobile pattern for Reading V2.
5. Task-family-specific fallback is allowed when it preserves meaning better than an inline clone of desktop.
6. The phone shell keeps the current-style compact header, passage tabs, floating Questions action, bottom-sheet question surface, and pre-submit review summary.

### 10.2 Completion Family

Includes:

- sentence completion
- note completion
- summary completion
- short answer

Phone contract:

- keep largely inline or near-inline interaction
- allow focused answer entry overlays for long text or option-assisted answers
- preserve visible numbering and local instruction context

### 10.3 Choice Family

Includes:

- multiple choice
- multiple select
- list-based completion with option picking

Phone contract:

- use tap-select patterns
- keep answer choices grouped under the visible question or focused answer surface
- do not require separate detached answer sheets unless density forces it

### 10.4 Binary Judgement Family

Includes:

- true/false/not given
- yes/no/not given

Phone contract:

- use compact tap-select controls
- keep instructions and response vocabulary visible
- avoid navigation that hides the judgment vocabulary from the current question

### 10.5 Matching Family

Includes:

- matching headings
- matching information
- matching features
- matching sentence endings

Phone contract:

- no drag-and-drop as the primary interaction
- use tap-to-assign and fast reassignment
- keep the active passage region and current target visible enough to avoid context loss

### 10.6 Structured-Layout Family

Includes:

- table completion
- flowchart completion
- diagram labeling

#### Table Completion

Phone contract:

- use a read-only zoomable overview derived from canonical table data
- do not put tiny live inputs inside the zoomable table by default
- pair the overview with a synchronized answer-entry surface below or above it
- tap-to-center and highlight the active blank when the student selects a question number
- constrain pinch-zoom to the table component, not the whole page

#### Flowchart Completion

Phone contract:

- show a simplified structural overview
- answer through focused step-based entry controls
- keep flow order obvious when the student jumps between blanks

#### Diagram Labeling

Phone contract:

- use zoomable image interaction with large target areas
- provide a structured label-picking alternative
- do not require precise tiny dragging on phone

### 10.7 Reviewability Rule

If a mobile interaction differs from desktop, saved results must still preserve enough stable information for teacher review to reconstruct:

- which interaction was answered
- what visible number the student saw
- what anchor or structural target it mapped to

---

## 11. Implementation Gates Before Task Generation

No `tasks-0048-*` implementation plan should be generated until all of the following are true:

1. This contract freeze is linked from the PRD and handoff.
2. The `reading-v2-taskgroup-object.md` doc is written from this contract.
3. The family-doc packet is present and references these mobile/runtime rules.
4. The eventual task list explicitly treats projections as derived-only outputs.
5. The eventual task list includes dedicated work for:
   - feature pipeline matrix enforcement for access points, owners, outputs, and forbidden patterns
   - Firebase storage, Rules, index, retention, and ownership mapping that reuses existing app surfaces and service boundaries
   - studio revision/conflict behavior
   - ordered test-making pipeline, including metadata, answer-key/scoring, Settings ownership, and publish relationship handoff
   - Teacher Lobby material-card/edit-modal integration
   - existing-shell loading, empty, error, retry, success, permission-denied, and partial-failure behavior
   - validation and publish gate matrix
   - projection generation
   - result and regrade law
   - existing result/feedback integration
   - current Reading V1 student UI parity
   - family-specific mobile rendering
   - import-boundary tests proving V2 core folders do not depend on legacy Reading internals
   - code-level boundary notes at V2 type, repository, projection, runtime, launch adapter, and result adapter entry points
   - feature-registry observability event catalog and performance budgets for existing route/list/result/launch surfaces

---

## 12. Companion Docs Required In The Current Packet

This freeze document does not replace the deeper companion docs. It depends on them.

The current source-of-truth packet must include:

1. `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
2. `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`
3. one task-family research doc per engineering family:
   - `documentation/tasks/PRD0048/reading-v2-family-completion.md`
   - `documentation/tasks/PRD0048/reading-v2-family-choice.md`
   - `documentation/tasks/PRD0048/reading-v2-family-binary-judgement.md`
   - `documentation/tasks/PRD0048/reading-v2-family-matching.md`
   - `documentation/tasks/PRD0048/reading-v2-family-structured-layout.md`
4. one task-type research doc per official IELTS Reading type
5. visual page-schema docs and integration contracts:
   - `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
   - `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
   - `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
   - `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-desktop-tablet.md`
   - `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-phone.md`
   - `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
   - `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
   - `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`
6. preservation and foundational sequencing assessment:
   - `documentation/tasks/PRD0048/assessment-0048-preservation-and-foundational-plan.md`
7. rationale and external-review trail:
   - `documentation/tasks/PRD0048/handoff-0048-prd-ielts-reading-v2-system-review-context.md`
   - `documentation/tasks/PRD0048/conversation-transcript-prd-0048-thread-2026-04-22-to-2026-04-24.md`

The transcript is not an implementation contract by itself. It is used to preserve intent and explain why the packet made specific decisions. If the transcript appears to conflict with the PRD, contract freeze, taxonomy, family/type docs, page-schema docs, or integration contracts, stop and resolve the conflict explicitly before coding.
