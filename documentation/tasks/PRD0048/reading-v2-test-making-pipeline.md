# Reading V2 Test-Making Pipeline Contract

This document is part of the PRD-0048 source-of-truth packet.

Authoritative companion docs:

- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`

This file freezes the teacher test-making subpipeline for Reading V2 so implementation does not drift into disconnected setup, editor, answer-key, settings, and publish flows.

---

## 1. Pipeline Summary

Reading V2 test making follows one ordered pipeline:

1. Access from an existing teacher surface.
2. Choose create, import, resume draft, or revise published material.
3. Fill or confirm material metadata.
4. Edit Reading content in Studio.
5. Define answer keys and scoring rules inside the Questions workflow.
6. Configure material settings.
7. Validate and preview through the V2 runtime.
8. Publish a snapshot and derived projections.
9. Return the material to existing platform relationships: successful non-revision publish exits Studio back to the Teacher Lobby/Materials workflow, and all later edits re-enter through revision plus republish.

The pipeline must feel like one test-making flow to the teacher. It must not become separate products that silently write incompatible data.

---

## 2. Entry Points

Allowed entry points:

- existing Teacher Lobby create/import controls
- existing Teacher Lobby material-card click/edit action
- existing Teacher Lobby draft-card resume action
- Material Profile actions where the platform already has them
- approved direct Studio route for create/import/draft/revision modes

Forbidden entry points:

- a new Reading V2 Teacher Lobby page
- a second Reading V2 editor reached only from a special modal
- a standalone answer-key product
- a standalone publish/review page outside Studio
- a standalone result-review page as part of test making

---

## 3. Pipeline Modes

The same Studio contract supports these modes:

| Mode | Entry | Initial state |
|---|---|---|
| Create blank | Teacher Lobby create or Studio create route | empty draft with required metadata fields blank or defaulted |
| Create from import | Teacher Lobby import or Studio import route | import candidate plus metadata setup |
| Create from Auto | Teacher Lobby create flow -> Reading V2 -> Auto | Source-ledger-verified Gemini extraction candidate plus effective trusted `answerKeyText` rows when visible source key evidence exists |
| Resume draft | draft card or Studio draft route | existing draft, revision token required |
| Revise published | material card edit/revise or Studio revise route | new or existing draft revision linked to live published material |
| Duplicate material | existing material duplicate action | independent draft copy with new IDs and source provenance |
| Extract task-group material | Studio extraction action | independent material copy with hidden provenance |

All modes must converge into the same canonical draft model before publish.

Mode-scoped passage controls:

- `Add Passage` and passage removal are enabled only for `Create blank`, `Create from import`, and `Create from Auto`.
- Individual `reading-passage` Studio, resume draft, published revision, duplicate material, and extracted task-group material modes must not expose passage-collection controls unless a later architecture update explicitly changes the material cardinality.
- Obsolete interpretation retired 2026-06-15: convergence into one canonical draft model does not authorize `Add Passage` in every Studio mode.

---

## 4. Required Teacher Flow

### 4.1 Access

The teacher starts from an existing teacher surface.

Access rules:

- Teacher Lobby cards remain the normal entry for existing materials.
- Draft cards remain the normal entry for draft resume.
- Material Profile may offer revise, duplicate, assign, or preview when that feature already owns the action.
- Direct Studio routes are allowed for deep links and route-backed mode support, not as a replacement for existing Lobby behavior.

### 4.2 Metadata Setup

Before serious editing or before publish, the teacher must be able to fill material metadata.

Minimum metadata fields:

- title
- skill or product marker: Reading V2
- material kind: full test, task-group material, or derivative/extracted material
- duration or time guidance
- difficulty
- target band or level if the current platform supports it
- description
- tags or topics if the current platform supports them
- visibility or library eligibility state
- ownership and source/provenance summary where relevant

Metadata rules:

1. Metadata is material/package information, not canonical task semantics.
2. Metadata must remain synchronized with Teacher Lobby cards, Material Profile, library listings, homework/course material pickers, and result records where those surfaces show it.
3. Changing metadata on a draft must not mutate the currently published snapshot.
4. Published metadata updates must follow the same revision/publish law as content updates unless the platform already has a safe metadata-only update path. If such a path is used, it must not change canonical task content or historical result truth.

### 4.3 Editor

The editor is the Reading V2 Studio.

Studio owns:

- stimulus/passages
- task groups
- interactions
- anchors
- instructions
- answer rules
- validation issues
- import uncertainty
- preview
- publish

The Studio top-level tabs stay:

- `Stimulus`
- `Questions`
- `Settings`

Do not add a separate top-level `Answer Key` tab.

Passage cardinality rules:

1. A full-test creation flow may contain multiple passages.
2. Paste/import and Auto V4 outcomes may use `Add Passage` while the teacher repairs a new test candidate in Studio.
3. A standalone Reading Passage material contains exactly one passage. Its Studio revision/remake flow edits that passage only and hides collection-level add/remove controls.

### 4.4 Answer Key And Scoring

Answer keys and scoring rules are part of the `Questions` workflow.

Required behavior:

- Each scoring-bearing interaction must expose its answer-key/scoring editor in the selected task group context.
- Group-level answer rules must remain visible near the interactions they govern.
- Completion alternatives, case/spacing normalization, choice correctness, binary judgement vocabulary, matching mappings, table blanks, flow steps, and diagram targets must all write into canonical scoring rules.
- Answer-key completeness is publish-blocking when any scoring-bearing interaction lacks a valid rule.
- Answer-key editing must not happen in a separate modal that writes a second source of truth.

Small helper modals may be used only for bounded bulk operations such as paste/import answer keys if they write back into the same canonical task-group model.

Auto/import answer-key source rules:

- `answerKeyText` is the canonical import handoff field for copied teacher/effective answer-key rows.
- `questions[].answer` from structured AI output is not a standalone source of truth. It may be used only as a guarded bridge into `answerKeyText` when the raw source visibly contains an answer-key heading and row extraction missed the exact format.
- Obsolete wording retired 2026-05-13: docs and code should not say Auto Studio handoff depends only on locally "extracted" answer-key rows. The effective trusted rows can come from local extraction, Gemini-copied top-level `answerKeyText`, or the visible-heading fallback.
- Obsolete wording retired 2026-05-14: answer-key binding alone is not sufficient evidence that Auto import fidelity is solved. Auto must also preserve source topology, task groups, option/reference banks, and structured-layout anchors before Studio treats the draft as reviewable.

Auto/import source-fidelity rules:

- Local source topology is authoritative before Gemini structure: strict passage headings, question ranges, visible question numbers, source answer-key rows, and source reference banks.
- Gemini output is an extraction witness, not canonical Studio truth. Local normalization owns stable section, task-group, interaction, answer binding, and visible numbering IDs.
- Auto candidates may reach Studio only after source-ledger verification passes or after the draft is safely reviewable with publish-blocking diagnostics.
- Unresolved source, numbering, task-type, answer, option/reference bank, or structured-layout issues remain publish-blocking until repaired in Studio.

### 4.5 Settings

The `Settings` tab owns material-level settings only.

Allowed material settings:

- material title and metadata review/edit shortcut
- visibility or library eligibility
- default duration or timing guidance
- default review/release recommendation where platform policy supports it
- tags/topics
- reuse and packaging state
- accessibility or runtime advisories

Settings not owned by the material:

- homework due dates
- assigned students/classes
- live session code
- live session start/end state
- course placement/order
- per-assignment release overrides
- actual result release state after a live session

Those are owned by homework, live session, course, library, or result/feedback systems. Reading V2 may provide defaults or metadata, but it must not duplicate those systems.

### 4.6 Validate And Preview

Validation and preview happen before publish.

Rules:

1. Validation runs against the canonical draft.
2. Preview uses a teacher-only preview projection.
3. Preview uses the same student runtime contract that published V2 content uses.
4. Preview state is local-only and must not create live session, assignment, attempt, or result records.
5. Publish remains blocked while validation has errors.

### 4.7 Publish

Publish must:

1. Re-run validation.
2. Confirm no blocking placeholders, missing answer keys, broken anchors, invalid numbering, unresolved import issues, or unsafe projection fields remain.
3. Create a versioned published snapshot.
4. Generate student-safe, session-safe, review, and analytics projections from the published snapshot.
5. Update material/package metadata and indexes used by existing platform surfaces.
6. For create/import/Auto/resume/duplicate/extract success, exit Studio and return control to the existing Teacher Lobby/Materials context.
7. Only bounded published-revision follow-up may intentionally remain in Studio, and that path still edits a draft revision rather than the live published snapshot.

PRD-0052 material publish amendment:

- normal Studio creation, paste/import, and Auto V4 all converge before publish and share this same publish step
- publishing a full Reading V2 test creates a master full-test material plus generated Reading Passage materials
- the master full test stores ordered refs to generated passage material ids and snapshot/version ids
- each generated Reading Passage writes a canonical published snapshot, student-safe/review projections, metadata, and `material_catalog/material_indexes` summary rows
- `reading_v2/listing_indexes` is not the PRD-0052 production listing proof path

Publish must not:

- mutate an older published snapshot in place
- update historical attempts or results
- expose author diagnostics, answer keys, import evidence, or provenance to student delivery payloads

Obsolete interpretation retired 2026-06-15: "publish returns to the existing Teacher Lobby, Material Profile, or Studio route context" for all flows. Non-revision publish success must leave Studio; keeping the same Studio shell open is reserved only for bounded published-revision follow-up.

---

## 5. Relationship With Existing Features

| Feature | Relationship to Reading V2 test making |
|---|---|
| Teacher Lobby | Entry, material-card display, edit-modal entry, draft resume, assign/duplicate actions where existing platform supports them |
| Test creation modal/pattern | Reference for metadata setup and teacher-friendly entry flow, not the V2 content model |
| Reading V2 Studio | Canonical authoring, answer rules, settings, validation, preview, publish |
| Draft storage | Saves incomplete work with revision-token conflict protection |
| Published material storage | Stores immutable published snapshots and package metadata |
| Material Profile | Shows metadata, preview/assign/revise actions where existing platform owns them |
| Public library | Reads published material metadata and student-safe launch eligibility; does not read canonical drafts |
| Homework | Assigns published V2 materials through existing homework flows; owns due dates, student targets, and homework release overrides |
| Course materials | Places published V2 materials through existing course flows; owns course placement and order |
| Live sessions | Launches session-safe projections through existing session routing; owns session code, live state, anti-cheat config, integrity refresh requests, and teacher force-submit |
| Solo practice | Launches published V2 materials through existing practice plumbing; no anti-cheat unless a future platform owner supplies explicit config |
| Result/feedback system | Owns result shell, review tabs, feedback display, release policy, and regrade shell; V2 supplies scoring and grouped review adapters, and AI feedback payload sections come from saved `readingV2.reviewPayload` |
| Observability/feature registry | Tracks create, import, save, validate, preview, publish, revise, assign, launch, submit, integrity, review, feedback, audit, and regrade actions |

---

## 6. Required Publish Outputs

A successful publish must leave these outputs coherent:

- canonical published snapshot
- material/package metadata used by Lobby/Profile/Library
- student-safe projection
- session-safe projection generator input
- review projection or result adapter input
- analytics projection
- where-used graph updates for passage assets
- provenance records for imported, duplicated, or extracted materials

All outputs must be regenerated from canonical/package truth. None may become editable source truth.

---

## 7. Required Tests

Pipeline tests must prove:

- Teacher Lobby create/import opens the Reading V2 test-making flow.
- Teacher Lobby material-card click/edit opens the adapted edit-modal or approved Studio entry.
- `Add Passage` is visible for manual blank creation, paste/import outcome, and Auto V4 outcome only.
- Individual Reading Passage Studio and non-creation modes hide passage-collection controls.
- Metadata is required or defaulted before publish.
- Metadata changes update draft state and material indexes without mutating live published snapshots.
- Answer keys/scoring rules live in the Questions workflow and write into canonical task-group interactions.
- Settings are material-level only and do not duplicate homework, course, live session, or result-release ownership.
- Preview creates no live attempts, assignments, session state, or results.
- Publish creates immutable snapshots and derived projections.
- Published materials appear in existing assignment, library, homework, course, live session, solo practice, and result/feedback relationships only through approved shared platform paths.
- Legacy Reading, Listening, Writing, and THCS test-making flows are unchanged.

---

## 8. Forbidden Patterns

Do not:

- add a separate top-level `Answer Key` tab
- let answer-key modal state become a second source of truth
- store assignment/session settings inside the canonical Reading document
- publish directly from an import candidate before it becomes a canonical draft
- make preview write permanent attempt/result data
- let Teacher Lobby mutate canonical draft content directly
- let public library, homework, course, live session, or result surfaces read canonical drafts
- make metadata edits silently mutate historical results
- add Auto V4-only or paste-import-only publish shortcuts that bypass Reading Passage extraction, Material Catalog indexing, or student-safe projection checks
- expose `Add Passage` in individual Reading Passage Studio, resume, revision, duplicate, or extraction modes without a new architecture decision

---

## 9. Related Docs

- `documentation/architecture/reading-v2-material-publish-and-passage-library.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`
- `documentation/architecture/reading-v2-runtime-integrations.md`
