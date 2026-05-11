# PRD: IELTS Reading V2 System

> **PRD Number:** 0048
> **Status:** Draft
> **Created:** 2026-04-22
> **Author:** Codex via discovery session
> **Audience:** Junior developer implementing a new IELTS Reading system without inventing missing product behavior
> **Companion contract freeze file:** `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
> **Companion findings file:** `documentation/tasks/findings-of-tasks-0048-prd-reading-v2-studio-and-runtime.md`

---

## 1. Introduction / Overview

### 1.1 Problem Statement

The current IELTS Reading feature family is fractured.

Teacher creation, draft review, post-publish editing, student delivery, and grouped-task rendering do not operate from one clean canonical system. Too much Reading behavior is still shaped by flat-question assumptions, task-specific sidecars, and runtime reconstruction.

This makes the feature hard to extend, hard to trust, and dangerous for juniors to modify because too many behaviors are implied instead of explicitly modeled.

### 1.2 Goal

Build a separate greenfield IELTS Reading V2 system that covers the full Reading lifecycle:

- teacher materials management
- passage and task-group authoring
- draft save and resume
- AI-assisted import
- published test editing through draft revision
- storage and publish pipeline
- live test delivery
- solo practice
- homework
- course and library reuse
- submission, saved results, and existing review/feedback integration

The new system must let a junior implement against explicit source-of-truth documentation instead of guessing from old Reading behavior.

### 1.3 Current Codebase Reality

The live repo does not already implement the target architecture described in this PRD.

Reviewer-facing repo drift is recorded separately in:

`documentation/tasks/findings-of-tasks-0048-prd-reading-v2-studio-and-runtime.md`

That file exists so this PRD can stay target-state-first and implementation-safe.

### 1.4 Locked Product Decisions

The following decisions were confirmed during clarification and research:

1. Reading V2 is a separate new feature family, not a retrofit of the current Reading internals.
2. This PRD covers the whole IELTS Reading system, not only the editor.
3. Reading V2 must support both manual authoring and AI-assisted import.
4. The first shippable release must cover the full Reading loop for new V2 content.
5. The destination scope is all 16 IELTS Reading task types, delivered in phases.
6. Layout authority belongs to the system, not teacher free-placement.
7. Teacher authoring and student desktop/tablet delivery both use a two-column mental model.
8. Teacher published editing must always create or open a new draft revision; the currently published version stays live until republish.
9. Extracting a passage-plus-task-group creates a separate copy, not a live link.
10. Extracted copies must keep hidden provenance metadata for audit, search, and history only.
11. Passages should exist as first-class reusable assets, but only as versioned stimulus assets under operational control.
12. Teacher Lobby remains the existing material-card and edit-modal entry surface, not a new Reading V2 management page.
13. Student runtime UI must closely imitate the current Reading V1 desktop/tablet and phone interfaces; V1 is a visual and interaction reference, not the V2 data-model foundation.
14. Existing result/review/feedback surfaces remain the result UI owner. Reading V2 supplies scoring, snapshot binding, and grouped Reading review adapters instead of new standalone result-review pages.
15. Reading V2 test making must follow one explicit subpipeline from access, metadata, editor, answer keys, settings, validation, preview, and publish into existing platform relationships.
16. Every major Reading V2 feature area must have explicit access points, owning surfaces/services, pipeline order, outputs, tests, and forbidden patterns as frozen in `reading-v2-feature-pipeline-matrix.md`.

### 1.5 Non-Negotiable Build Command

**Ignore the current Reading system when building Reading V2 internals.**

Interpretation:

- do not use the current Reading authoring flow as the V2 foundation
- do not use the current Reading runtime as the V2 interpreter
- do not preserve legacy Reading data contracts inside V2 just to stay similar to old code
- only reuse cross-cutting platform infrastructure when it does not drag V2 back into legacy Reading assumptions

---

## 2. Goals

| # | Goal | Success Metric |
|---|------|---------------|
| G1 | Create one coherent IELTS Reading product family | New V2 Reading content can move from teacher creation to existing result/feedback review without entering the legacy Reading pipeline |
| G2 | Establish one canonical Reading source of truth | Authoring, preview, publish, runtime, scoring, and review all derive from the same canonical model |
| G3 | Make grouped Reading tasks explicit | Tables, diagrams, summaries, matching sets, and other grouped tasks render from explicit structure instead of heuristics |
| G4 | Make teacher editing trustworthy | Create, import, review, and published-edit all converge in one studio shell with explicit modes |
| G5 | Make test creation operationally complete | Teachers can move through access, metadata, editor, answer keys, settings, validation, preview, and publish without leaving the V2 contract |
| G6 | Support reuse without corruption | Passages, task-group materials, and full tests have clear roles, ownership, and provenance rules |
| G7 | Preserve strong platform integration | Reading V2 works cleanly with existing teacher material cards, edit-modal entry, public library, drafts, solo practice, homework, course, live session, and result/feedback contexts |
| G8 | Reduce junior guesswork to near zero | Page structure, data roles, workflow states, and task-type behavior are all explicitly documented |

---

## 3. User Stories

- As a teacher, I want one Reading V2 studio where I can create, import, review, and revise Reading content without bouncing between disconnected tools.
- As a teacher, I want passages to be reusable assets so I can build multiple Reading materials around the same source text without duplicating it blindly.
- As a teacher, I want extracted `passage + task group` copies to become new materials so I can publish and manage them independently.
- As a teacher, I want published editing to happen through draft revision so the live material stays stable until I intentionally republish.
- As a teacher, I want Reading V2 materials to behave like other lobby material cards, so clicking them opens the adapted edit modal instead of a separate new lobby experience.
- As a teacher, I want a clear test-making pipeline from metadata setup through editor, answer key, settings, preview, and publish so I do not have to guess which surface owns each step.
- As a student, I want grouped Reading tasks to appear as coherent tasks, not as fragmented question cards.
- As a student on desktop or tablet, I want the familiar Reading V1 two-column experience with passage beside questions.
- As a student on phone, I want the familiar Reading V1 phone experience with passage-first reading, a reachable question sheet, and dense tasks that remain usable.
- As a teacher or student reviewing results, I want Reading V2 results to appear inside the existing review/feedback system rather than a separate Reading V2 result product.
- As a reviewer or maintainer, I want explicit visual and behavioral documentation so I do not have to invent page structure or task behavior on my own.

---

## 4. Functional Requirements

### 4.1 Product Boundary and Rollout

1. The system must introduce IELTS Reading V2 as a separate feature family.
2. The system must keep the existing Reading feature running for legacy content while Reading V2 is built and validated.
3. The system must clearly mark Reading V2 content with a distinct engine or equivalent content marker.
4. The initial Reading V2 release must not require migration of old Reading content.
5. The first shippable release must cover:
   1. teacher authoring
   2. draft save and resume
   3. AI-assisted import
   4. real preview
   5. publish
   6. live student delivery
   7. solo practice
   8. homework
   9. result generation
   10. integration with existing teacher/student review and feedback surfaces
6. The destination product scope must support all 16 official IELTS Reading task types.

### 4.2 Canonical Content Layers

7. The system must define a versioned canonical Reading V2 model.
8. The canonical model must be the source of truth for authoring, preview, publish, runtime delivery, scoring, and review.
9. The canonical model must explicitly distinguish three reusable layers:
   1. passage assets
   2. task-group materials
   3. full tests
10. A passage asset must represent reusable stimulus only.
11. A passage asset must support metadata such as:
   1. title
   2. source
   3. licensing or rights
   4. topic
   5. word count
   6. paragraph map
   7. accessibility structure
   8. provenance
12. A passage asset must be versioned.
13. A passage asset must not be treated as a first-class live delivery unit for normal student launch.
14. A task-group material must represent one bounded reusable operational unit that combines:
   1. one passage asset version
   2. one or more task groups
   3. grouped instructions
   4. answer rules
   5. scoring data
   6. local display guidance
15. A full test must represent an ordered assembly of Reading materials for delivery.
16. Full tests should consume task-group materials rather than raw passages in normal authoring and publish flows.
17. The canonical model must contain explicit task-group entities.
18. The canonical model must contain explicit interaction entities.
19. The canonical model must support grouped tasks without flattening them into unrelated free-text questions.
20. The canonical model must support mobile and desktop presentation differences without changing task meaning.
21. Any flat navigation or analytics index derived from the canonical model must remain derived data only.

### 4.3 Passage Assets, Extraction, and Provenance

22. Passages must be discoverable as standalone reusable stimulus assets inside teacher authoring and search tools.
23. Standalone passages must not become orphaned unmanaged content; the system must show where they are used.
24. Editing or replacing a passage asset version must not silently mutate already-published dependent materials.
25. Extracting `passage + task group` from an existing test must create a separate new material.
26. Extracted copies must not stay live-linked to the original source material.
27. Extracted copies must keep hidden provenance metadata for audit, search, and history.
28. Provenance metadata must not cause source updates to flow into the extracted copy.
29. If a teacher adapts the text of an extracted passage materially, the system must create a new passage version or derivative passage asset rather than hot-editing the original shared passage asset.

### 4.4 Teacher Entry and Management Surfaces

30. Teacher Lobby must remain the existing teacher entry shell for Reading materials.
31. Reading V2 must not introduce a new Teacher Lobby page layout, new Reading-only filter rail, or new Reading-only lobby management console in this PRD.
32. Existing Teacher Lobby material cards must be able to represent Reading V2 full tests and published/extracted Reading V2 materials through the current card/list pattern.
33. Clicking or editing a Reading V2 material card must open the existing edit-modal pattern adapted for Reading V2, or an explicitly approved Studio entry launched from that same card action.
34. Teacher Lobby integration must preserve existing edit, duplicate, publish-state awareness, and assignment-ready actions where those actions already exist in the shared platform.
35. Standalone passage assets must not become broadly visible Teacher Lobby cards unless `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY` explicitly enables that later phase.
36. The adapted Teacher Lobby edit modal must delegate actual authoring to the Reading V2 Studio shell/components and must not become a second independent editor.

### 4.5 Unified Reading V2 Studio

37. Reading V2 must provide one Studio contract as the only authoring foundation for new V2 content.
38. The Studio contract may be hosted by route-backed pages and by the existing Teacher Lobby edit-modal entry, but both hosts must use the same source-of-truth behavior.
39. Reading V2 test making must follow the ordered subpipeline defined in `reading-v2-test-making-pipeline.md`.
40. The studio must support these explicit modes in the same shell:
   1. create blank
   2. create from import
   3. resume draft
   4. published edit through draft revision
41. Reading V2 must not use separate long-lived V2 review pages or a published-edit modal with its own editor model.
42. Small modals may be used for bounded actions such as publish confirmation, discard confirmation, lightweight import picking, or the existing Teacher Lobby edit-modal host when it delegates to the Studio contract.
43. The studio must preserve a stable two-column visual structure.
44. The studio must expose exactly three top-level working tabs:
   1. Stimulus
   2. Questions
   3. Settings
45. Metadata setup must be available before publish and must remain synchronized with material cards, material profile, library listings, assignment pickers, and result records where those surfaces display metadata.
46. Answer-key editing must be absorbed into the Questions experience rather than being a separate top-level tab.
47. Material-level settings must live in Settings; homework due dates, live session state, course placement, assignment targets, and final result release state remain owned by their existing platform features.
48. The left side of the studio must remain the stimulus/reference side.
49. The right side of the studio must remain the questions/task logic side.
50. The studio must support manual authoring from scratch.
51. The studio must support AI-assisted full-test import.
52. The studio must support AI-assisted fragment import for a single `passage + task group`.
   - Import must support pasted source text.
   - Import must support explicitly supported uploaded source files.
   - Imported content must converge into the same editable canonical draft model used by manual authoring.
   - Import evidence, uncertainty, and repair needs must remain visible until resolved or accepted.
53. The studio must allow incomplete drafts.
54. The studio must block publish until the canonical document is valid.
55. The studio must provide validation, preview, diff, and publish controls without requiring route changes into separate products.
   - The studio must expose a structure outline.
   - The studio must expose the main editing surface for the selected stimulus or task group.
   - The studio must expose contextual properties for the selected object.
   - The studio must support reordering top-level task groups and linked stimuli without changing stable object identity.
   - The studio must allow direct editing of grouped instructions and answer rules inside the canonical draft.
56. Published editing must always open or create a draft revision while the currently published version remains live until republish.

### 4.6 Authoring Model and Task Ownership

54. Reading V2 authoring must use a schema-aware structured editing model for most Reading content.
55. The system must own layout decisions; teachers author meaning, grouping, answer rules, and linkage.
56. The editor may use specialized embedded tools for dense layout tasks, but those tools must still write into the canonical model.
57. A freeform canvas must not be the primary source of truth.
58. One interaction must belong to exactly one task group.
59. One passage asset may support multiple task groups.
60. The system must preserve IELTS numbering and grouped question ranges automatically.
61. Draft-only placeholders may exist during authoring, but they must remain unnumbered and publish-blocking.

### 4.7 Student Runtime

62. Reading V2 preview must run the same runtime contract used by students after publish.
63. Preview mode must use local-only state and must not write live session, assignment, or attempt records.
64. Desktop and tablet runtime must closely imitate the current Reading V1 two-column student interface while rendering from V2 projections.
65. Desktop and tablet runtime must keep stimulus on the left and the full grouped question/task interaction panel on the right.
66. Desktop and tablet runtime must not become a one-question-at-a-time wizard or a new answer-sheet-first interface.
67. Phone runtime must closely imitate the current Reading V1 phone interface while rendering from V2 projections.
68. Phone runtime must not force a true split view.
69. Phone runtime must use a passage-first primary reading surface.
70. Phone runtime must keep question navigation always reachable through the current-style question sheet flow.
71. Phone runtime may use supporting answer-entry surfaces, but those supporting surfaces must not become the whole Reading workspace for every task.
72. Dense task families must have task-family-specific mobile interaction models rather than one naive universal fallback.
73. Mobile table-completion must not rely on a cramped inline desktop table as the default phone interaction.
74. Mobile diagram-labeling must support zoomable image interaction with large target areas and a structured label-picking alternative.
75. Mobile matching tasks must not rely on drag-and-drop as the primary interaction.
76. Mobile adaptation must preserve task meaning and reviewability even when the phone interaction differs from desktop.
   - Phone runtime must preserve passage scroll position.
   - Phone runtime must preserve the active question or interaction.
   - Phone runtime must preserve the active task group.
   - Phone runtime must preserve answer state when opening, closing, or switching answer-entry layers.
77. Any student-runtime visual or interaction deviation from current Reading V1 must be documented and senior-approved before implementation merges.

### 4.8 Platform Integration

78. Reading V2 drafts must persist separately from legacy Reading drafts.
79. Reading V2 published payloads may reuse shared platform storage infrastructure, but must remain clearly separated from legacy Reading payload structure.
80. The publish pipeline must generate student-safe payloads from the canonical Reading V2 document.
81. Student-safe payloads must strip author-only diagnostics and review-only AI evidence.
82. Live sessions must receive Reading V2 session-safe payloads through the shared session launch infrastructure.
83. Solo practice, homework, course material launches, and public-library launches must all support Reading V2 through shared platform launch plumbing.
84. Reading V2 must integrate with shared result infrastructure where safe, while keeping Reading V2 interpretation and scoring owned by the new engine.

### 4.9 Results and Review

85. Reading V2 must support submission and result generation in the first release.
86. Reading V2 scoring must read the canonical model rather than legacy Reading heuristics.
87. Reading V2 saved results must integrate with the existing result, review, feedback, release-policy, and regrade system.
88. Reading V2 must not create separate standalone teacher or student result-review pages in this PRD.
89. Existing review shells must be able to render Reading V2 grouped review content through adapters or subcomponents.
90. Teacher review content must default to task-group-first organization inside the existing result shell.
91. Teacher review content may still provide a secondary flat-number jump or index.
92. Student and teacher review content must preserve visible IELTS question numbering.
93. Result review content must keep grouped instruction and stimulus context visible enough to make grouped tasks understandable.
94. Existing feedback surfaces must remain the owner for teacher feedback and student feedback display.

### 4.10 Documentation as Source of Truth

95. The Reading V2 implementation must not rely on the PRD alone.
96. The Reading V2 documentation set must include a contract-freeze companion doc that defines execution law more concretely than the PRD.
97. The Reading V2 documentation set must include a canonical object doc for `TaskGroup`.
98. The Reading V2 documentation set must include one research doc for each engineering task family.
99. The Reading V2 documentation set must include one research doc for each official IELTS Reading task type.
100. The Reading V2 documentation set must include visual page-schema docs for the Studio and student runtime surfaces.
101. The Reading V2 documentation set must include integration contracts for Teacher Lobby and result/feedback behavior where existing platform surfaces remain the owner.
102. The later task list for this PRD must explicitly reference those docs as required implementation inputs.

### 4.11 Existing-Platform Operational Correction

103. Any added Firebase, authorization, security, UX-state, performance, or observability requirements must strengthen the existing app relationship graph rather than inventing parallel product surfaces.
104. Reading V2 may introduce V2-specific canonical types, repository methods, storage path builders, projection services, and adapters where the new engine needs them, but surrounding user workflows must remain owned by the existing platform features named in this PRD.
105. Teacher management must continue to route through existing Teacher Lobby, Material Profile, create/import, draft-card, duplicate, assign, preview, and edit-modal relationships where those relationships already exist.
106. Student launch must continue to route through existing solo practice, homework, course, public-library, and live-session launch shells, with Reading V2 selected by explicit engine branching and projection loading rather than a parallel student product tree. For shared launch routes that also serve legacy Reading, the first branch must come from a student-readable platform material registry row such as `tests/{materialId}`. That registry row may provide the launch discriminator and published snapshot pointer; legacy V1 materials must not probe `reading_v2/*`; positively identified Reading V2 materials must not fall back to V1 after a V2 projection failure.
107. Results, review, release policy, feedback, and regrade must continue to use existing result/feedback shells with Reading V2 adapters, not new standalone Reading V2 result pages.
108. Firebase storage and security work must define how Reading V2 drafts, snapshots, passage assets, projections, attempts, results, review indexes, and analytics outputs map to existing repository/service boundaries and platform relationship indexes.
109. Authorization must be enforced through existing auth, route-guard, service, and Firebase Rules boundaries, not only through React component visibility.
110. Loading, empty, error, retry, success, confirmation, and notification behavior must reuse existing shell and notification patterns unless a future PRD explicitly approves a new shared pattern.
111. Observability must register Reading V2 actions through the existing feature registry and observability path; it must not create a detached analytics system.
112. Performance and scalability requirements must be expressed against existing route shells, launch plumbing, projection generation, result shells, and shared list surfaces so Reading V2 remains renderable as part of the whole app.
113. Any proposed new route, page, collection family, notification channel, dashboard, or admin surface that is not already allowed by this PRD must stop for senior review and a packet update before implementation.

Current PRD-0048 packet entry points for implementation are:
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
- `documentation/tasks/PRD0048/assessment-0048-preservation-and-foundational-plan.md`

The external review and assessment packet also exists at:
- `documentation/tasks/PRD0048/handoff-0048-prd-ielts-reading-v2-system-review-context.md`
- `documentation/tasks/PRD0048/conversation-transcript-prd-0048-thread-2026-04-22-to-2026-04-24.md`

The document groups above are part of the required implementation packet and are not optional reading when the later task list references them.
The transcript is a rationale trail and tie-breaker for preserving intent; it must not be used to bypass the PRD, contract freeze, taxonomy, family/type docs, test-making pipeline contract, page-schema docs, or integration contracts.

---

## 5. Non-Goals (Out of Scope)

- Migrating historical Reading tests into Reading V2 for the initial release
- Reusing the current Reading editor or runtime as the V2 architectural base
- Making teacher free-placement or manual absolute positioning the primary authoring model
- Treating raw passage assets as the main live student delivery unit
- Building a new Teacher Lobby page, Reading V2 lobby dashboard, or Reading V2 lobby filter rail in the initial PRD scope
- Building separate standalone Reading V2 teacher/student result review pages instead of integrating with the existing result/feedback system
- Rewriting Listening, Writing, or THCS onto this engine in this PRD
- Generalizing Reading V2 into a cross-skill assessment engine before Reading V2 itself is stable
- Shipping QTI import/export in the initial release

---

## 6. Design Considerations

### 6.1 System Surface Map

Reading V2 should be understood as a system of connected surfaces and integrations:

- existing Teacher Lobby material-card/edit-modal integration
- Reading V2 feature pipeline matrix
- Reading V2 Studio
- Reading V2 test-making pipeline
- student desktop/tablet runtime
- student phone runtime
- existing result/review/feedback integration

Teacher preview and publish/revision flow are Studio-owned workflows, not separate long-lived surfaces in this PRD. A separate page-schema doc is not required for either unless a future product decision creates a separate route-backed surface.

Standalone page-schema companion docs exist only where PRD-0048 owns the page shape. Integration contracts exist where an existing platform surface remains the owner:

- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-desktop-tablet.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-phone.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`

The ASCII schemas below are high-level summaries inside the PRD.

The standalone page-schema and integration-contract docs are the authoritative visual and behavioral references for implementation.

### 6.2 Integration Schema: Existing Teacher Lobby

```text
+----------------------------------------------------------------------------------+
| Teacher Lobby                                                                    |
| Existing material card grid/list, existing draft cards, existing create controls |
+----------------------------------------------------------------------------------+
| Reading V2 material card                                                         |
| - uses current card template                                                      |
| - carries explicit V2 engine/material marker                                      |
| - click/edit opens adapted edit modal                                             |
| - adapted edit modal hosts or launches Studio mode                                |
+----------------------------------------------------------------------------------+
| Not in PRD-0048 scope: new lobby page, new Reading-only filter rail, standalone  |
| passage-asset card browsing, or a second editor inside TeacherLobbyPage.jsx       |
+----------------------------------------------------------------------------------+
```

### 6.3 Visual Schema: Reading V2 Studio

```text
+----------------------------------------------------------------------------------+
| Reading V2 Studio                                                                 |
| Title | Status | Save Draft | Validate | Preview | Publish | Diff | Exit         |
+----------------------------------------------------------------------------------+
| Mode: Create / Import / Draft Review / Published Edit Revision                    |
| Tabs: [Stimulus] [Questions] [Settings]                                           |
+--------------------------------------+-------------------------------------------+
| Left: Stimulus / reference column    | Right: Questions / task logic column      |
| -----------------------------------  | ----------------------------------------  |
| Section outline                      | Task-group list                            |
| Passage asset list                   | Selected task-group editor                 |
| Selected passage editor              | Interaction list                           |
| Paragraph anchors                    | Answer rule editor                         |
| Linked asset info                    | Validation panel                           |
| Passage preview                      | Question preview / review / diff           |
+--------------------------------------+-------------------------------------------+
| Bottom utility rail: warnings | provenance | extraction | import evidence         |
+----------------------------------------------------------------------------------+
```

### 6.4 Subpipeline: Reading V2 Test Making

```text
+----------------------------------------------------------------------------------+
| Existing entry surface                                                           |
| Teacher Lobby create/import | material card edit | draft card resume | profile   |
+----------------------------------------------------------------------------------+
| Metadata setup                                                                    |
| title | duration | difficulty | target band | description | tags | visibility    |
+----------------------------------------------------------------------------------+
| Studio editor                                                                     |
| Stimulus tab -> passages/anchors/assets                                           |
| Questions tab -> task groups/interactions/answer keys/scoring rules               |
| Settings tab -> material settings, visibility defaults, runtime advisories         |
+----------------------------------------------------------------------------------+
| Validate -> Preview -> Publish                                                    |
| validation errors block publish | preview is local-only | publish snapshots V2    |
+----------------------------------------------------------------------------------+
| Existing platform relationships                                                   |
| Lobby card | Material Profile | Library | Homework | Course | Live | Solo | Result|
+----------------------------------------------------------------------------------+
```

### 6.5 Visual Schema: Student Desktop And Tablet Runtime

```text
+----------------------------------------------------------------------------------+
| Student Reading Runtime, V1 desktop/tablet imitation                              |
| Header | Timer | Navigation | Submit                                              |
+--------------------------------------+-------------------------------------------+
| Left: Passage / diagram / table      | Right: full grouped question panel         |
| -----------------------------------  | ----------------------------------------  |
| Passage tabs / section switch        | Question navigator                         |
| Main reading content                 | Grouped instructions                       |
| Highlight / anchor context           | Visible question range                     |
|                                      | Inputs / choices / grouped interaction     |
|                                      | Review / next navigation                   |
+--------------------------------------+-------------------------------------------+
```

### 6.6 Visual Schema: Student Phone Runtime

```text
+--------------------------------------------------------------+
| Student Reading Runtime (Phone), V1 phone imitation          |
| Header | Timer | Submit                                      |
+--------------------------------------------------------------+
| Passage tabs + floating Questions action / reachable Q nav   |
+--------------------------------------------------------------+
| Primary pane: Passage / main stimulus                        |
| - full-width reading surface                                 |
| - preserves reading position                                 |
| - supports task-anchor jumps                                 |
+--------------------------------------------------------------+
| Bottom-sheet question surface                                |
| - quick open from Questions action or question nav           |
| - task-family-specific interaction                           |
| - closes back to passage without losing place                |
+--------------------------------------------------------------+
| Full-screen pre-submit review summary + final confirmation   |
+--------------------------------------------------------------+
```

### 6.7 Integration Schema: Existing Result, Review, And Feedback System

```text
+----------------------------------------------------------------------------------+
| Existing result entry surfaces                                                   |
| TeacherTestResultsPage / StudentTestResultsPage / AcademicRecord / dashboard     |
+----------------------------------------------------------------------------------+
| Existing shell                                                                   |
| ResultDetailModal / ResultSlidePanel / SharedSavedResultCore                     |
+----------------------------------------------------------------------------------+
| Existing tabs and workflows                                                      |
| OverviewTab | ReviewTab | FeedbackTab | release policy | feedback | regrade       |
+----------------------------------------------------------------------------------+
| Reading V2 adapter inside existing review area                                   |
| - task-group-first grouped Reading review content                                |
| - secondary visible-number jump utility if useful                                |
| - student answer, correct answer, explanation visibility by release policy        |
| - no author diagnostics, provenance, or import evidence in student surfaces       |
+----------------------------------------------------------------------------------+
```

---

## 7. Technical Considerations

- This PRD describes a planned future state and must not be misread as current repo truth.
- Shared platform shells, routing, storage projection patterns, session plumbing, homework plumbing, Teacher Lobby card/edit-modal patterns, and result/feedback shells may be reused when they do not force legacy Reading contracts into V2.
- Operational corrections for Firebase, auth, UX states, performance, and observability must reuse existing app ownership boundaries and integration surfaces; do not introduce disconnected management, launch, result, notification, or analytics products for Reading V2.
- Test-making metadata must be treated as material/package metadata and synchronized through existing platform indexes; it must not replace canonical task semantics.
- Broader cross-skill reuse may be explored later, but Reading V2 must be built and stabilized first.
- Reading V2 should prefer a schema-first structured editing stack for the main authoring model.
- Specialized sub-editors may be embedded for dense structured tasks such as tables, diagrams, and flow structures.
- The student runtime should imitate current Reading V1 desktop/tablet and phone UI while rendering from V2 projections.
- The phone runtime should use the current-style passage-first shell with task-family-specific interaction contracts rather than one naive fallback for every dense task.
- Passage assets should be immutable by version once published dependencies exist.
- Published editing should always work through draft revision, never direct live mutation.

---

## 8. Success Metrics

- A teacher can create, import, review, publish, and revise a Reading V2 material through Studio or the existing Teacher Lobby edit-modal entry without using any legacy Reading-specific authoring surface.
- A teacher can complete the Reading V2 test-making pipeline from access through metadata, editor, answer key, settings, validation, preview, and publish without creating disconnected artifacts.
- A teacher can publish both full tests and extracted task-group materials as first-class materials.
- Existing Teacher Lobby material-card behavior remains recognizable and does not become a new Reading V2 lobby product.
- Preview and live runtime render the same grouped-task behavior for the same V2 material.
- Student desktop/tablet and phone runtime visibly imitate the current Reading V1 student UI while removing legacy heuristic rendering internally.
- Reading V2 result review and feedback appear through the existing result/feedback system, with V2 grouped review adapters where needed.
- Reading V2 scoring no longer depends on legacy Reading heuristics.
- The later task list can reference explicit companion docs instead of forcing implementors to guess page structure or task behavior.

---

## 9. Open Questions

1. What final user-facing name should the product use: `Reading V2`, `Reading Studio`, or another label?
2. Should standalone passage assets ever become visible in Teacher Lobby as a full browsing surface later, or remain limited to Studio search/import tools?
3. Should the first rollout be internal/admin-only before all-teacher release?
