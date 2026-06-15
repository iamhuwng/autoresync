# Reading V2 Material Publish And Passage Library

## Purpose

This document defines the current Reading V2 material publish contract for PRD-0052.

Reading V2 authoring can begin from normal test making, paste/import text, or Auto V4. All three paths converge in Studio and publish through the same data plane. Publish must create a master full-test material plus standalone Reading Passage materials when the source is a full Reading test.

## Source Paths Into Studio

Supported teacher inputs:

- normal Reading V2 test making in Studio
- paste-text/import flows that hydrate a Studio draft
- Auto V4, which creates an editable Studio draft from real source text

Auto V4 is only an import assistant. It may create a valid draft and still require teacher review. It does not bypass Studio validation, publish validation, or the material publish contract.

## Studio Passage Cardinality And Controls

Studio passage-collection controls are mode-scoped.

`Add Passage` and companion passage removal controls are available only when Studio is building a new multi-passage test candidate:

- manual new-test authoring from scratch (`create-blank`)
- paste/import output opened in Studio (`create-from-import`)
- Auto V4 output opened in Studio (`create-from-auto`)

`reading-passage` materials are single-passage entities. When Studio opens an individual Reading Passage for revision, manual remake, or version editing, it must hide `Add Passage` and passage-collection removal controls. The teacher may edit the existing passage text, questions, answer rules, metadata, validation, preview, and publish path, but must not add a second passage to that entity.

Obsolete interpretation retired 2026-06-15: "same Studio shell supports all modes" does not mean passage-collection controls are enabled in all modes. Resume, published revision, duplicate, extraction, and single-passage repair modes inherit the same draft model, but they do not automatically inherit the `Add Passage` affordance.

## Studio Passage Visibility

Individual `reading-passage` Studio revisions expose `Private / Public` in the main question panel next to `Add Question Group`.

Control mapping:

- `Private` maps to `private`
- `Public` maps to `library-eligible`

Publish must carry the selected visibility into the canonical material metadata, Reading Passage row, and Material Catalog visibility indexes.

Obsolete interpretation retired 2026-06-16: visibility is not a hidden Developer Details-only control for single Reading Passage revision flows.

## Publish Model

For a full Reading V2 test, publish writes two related material layers:

1. The master full-test material.
2. One generated Reading Passage material per source passage.

The master full-test material stores ordered references to the generated passage material ids and snapshot/version ids. It should behave as the reusable full test container, not as the only source of all runtime passage content.

Each generated Reading Passage material must have:

- canonical teacher/review data under `reading_v2/reading_passage_materials/{materialId}` and `reading_v2/reading_passage_material_versions/{materialId}/{versionId}`
- canonical runtime snapshot under `reading_v2/published_snapshots/{materialId}/{snapshotVersionId}`
- student-safe projection under `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`
- review projection under `reading_v2/projections/review/{materialId}:{snapshotVersionId}`
- metadata under `reading_v2/material_metadata/{materialId}`
- safe Material Catalog summary rows under `material_catalog/material_indexes/*`

Each composition-first full Reading V2 test must also have:

- master student-safe projection under `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`
- master session-safe projection under `reading_v2/projections/session_test_payloads/{sessionCode}:{snapshotVersionId}`
- master review projection under `reading_v2/projections/review/{materialId}:{snapshotVersionId}`

The full-test composition layer lives at:

- `reading_v2/full_test_compositions/{compositionId}`
- `reading_v2/full_test_composition_versions/{compositionId}/{versionId}`

Publish commits live at:

- `reading_v2/publish_commits/{materialId}:{snapshotVersionId}`

## Post-Publish Studio Exit

Successful non-revision publish must not leave the teacher inside the same Studio shell.

Required behavior:

- `create-blank`, `create-from-import`, `create-from-auto`, draft resume, duplicate, and extraction publish success exit Studio and return the teacher to the existing Teacher Lobby/Materials shell.
- The return path must show the published material through normal material-card/list ownership, not through a stale draft shell that still looks editable.
- Any further content change after publish must happen through an explicit new or resumed draft revision followed by republish.

Reason:

- full-test publish has already committed a master full-test entity plus separate generated Reading Passage entities
- keeping the same Studio frame open suggests the teacher is still editing the live published rows, which is false
- this creates avoidable confusion around what saves where and whether per-passage edits hit current projections

Exception:

- published-revision flows may stay in Studio only for bounded follow-up actions that still operate on a draft revision
- staying in Studio in that case does not authorize direct mutation of the live published snapshot or live projections

Obsolete interpretation retired 2026-06-15: "publish may remain in the same Studio context for normal creation/import flows." That wording is no longer valid for non-revision publish success.

## Post-Publish Reference Discovery

Single-passage published-revision flows may attempt to discover update targets after the publish commit succeeds.

That discovery step is best-effort only:

- a denied discovery read must not convert a committed publish into a publish failure
- the committed material and material indexes remain authoritative
- the update-references modal may be skipped when discovery cannot read target data

This keeps publish success aligned with the committed RTDB write instead of the follow-up discovery phase.

## Material Catalog Index Contract

`material_catalog/material_indexes` is the canonical lightweight Teacher Materials index family for Reading Passage and Book material selection.

Required buckets:

- `by_owner/{teacherId}/{materialId}`
- `by_visibility/{visibility}/{materialId}`
- `by_material_kind/{materialKind}/{materialId}`
- `by_test_type/{testTypeId}/{materialId}`
- `by_source_full_test/{fullTestMaterialId}/{materialId}`

Index rows are summary rows only. They must not contain passage bodies, questions, answer keys, scoring rules, import evidence, hidden provenance, draft payloads, or student answers.

Archive/remove cleanup must be idempotent for stale or missing active index rows. RTDB rules may use canonical Reading V2 metadata ownership as fallback proof for owner cleanup:

- `reading_v2/material_metadata/{materialId}/ownerId === auth.uid`

This fallback is required when active index rows are already missing or malformed but canonical metadata still proves the actor owns the Reading V2 material. It does not allow arbitrary material catalog deletion and does not bypass super-admin role checks.

`reading_v2/listing_indexes` is obsolete for production Teacher Materials proof. It may remain as a compatibility/internal helper, but it is not the source for PRD-0052 Reading Passage list QA or Book material picker QA.

## Archive, Restore, And Broken References

Reading Passage archive is reversible soft removal from active teacher selection surfaces. Archive sets the current material state to archived and removes active Material Catalog rows. It must not delete canonical teacher data, immutable snapshots, published versions, student-safe projections, review projections, publish commits, assignment payloads, or completed result records.

Restore validates owner permission and reconstructs active summary/index rows from canonical metadata only when the current version and projections are valid. Restore must not rebuild active rows from stale UI state.

Archive listing reads must be allowed at the owner/type parent as well as each child row. The Teacher Lobby Archive subtab reads `material_catalog/material_archive_indexes/by_owner/{ownerId}/reading-passage` as a scoped list; rules must not only allow `.../reading-passage/{materialId}` child reads.

Broken-reference checks are summary/guard checks, not student runtime mutation. Current master and Book references can report:

- `archived`: source exists but is currently archived.
- `missing`: source material is missing or not readable.
- `inaccessible`: source owner/visibility blocks the current teacher.
- `missing-version`: referenced published version/snapshot is missing.
- `missing-projection`: referenced student-safe or review projection is missing.

Broken masters are repaired inside `ReadingV2MasterEditModal`. Broken Books are repaired inside `BookEditorModal` and `BookEditorWorkspace`. Repair may replace a ref, remove a ref, or start restore for an owned archived source. Repair must not rewrite assignment-pinned projections or completed results.

## Master Removal Lifecycle

Reading V2 master full-test removal uses soft removal semantics. It is not a hard delete of canonical Reading V2 data.

Teacher Lobby delete for a Reading V2 master must open a modal with three outcomes:

- `Remove master only`
- `Remove master and linked passages`
- `Cancel`

Master-only removal sets the master composition and master metadata state to `removed`, removes active Material Catalog rows for the master, removes legacy `/tests/{masterMaterialId}`, and writes `reading_master_removed` audit. It does not archive linked Reading Passage materials.

The linked-passage option archives each owned linked Reading Passage through the Reading Passage archive service before removing the master. It is blocked when any linked passage is not owned by the actor. Existing assignments, frozen assignment payloads, immutable snapshots, projections, and completed results are not mutated by either option.

Obsolete interpretation retired 2026-06-15: "Do not delete passage materials when deleting/removing a master" meant no hard delete and no implicit cascade. It no longer forbids the explicit `Remove master and linked passages` modal choice from archiving actor-owned linked passages.

## Student Runtime Contract

Student Reading V2 runtime consumes projections, not canonical teacher data.

Student launch surfaces must not depend on owner-only `reading_v2/material_metadata/{materialId}` reads.
Student-visible summary and launch preparation must use student-readable bridges plus projections:

- non-live full-test launch summary/detail: `tests/{materialId}` plus `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`
- live-session full-test launch: `reading_v2/projections/session_test_payloads/{sessionCode}:{snapshotVersionId}`

For single Reading Passage homework, the assigned snapshot points to:

- `reading_v2/projections/student_safe_tests/{passageMaterialId}:{snapshotVersionId}`

For Reading Passage set homework, assignment-time snapshots are composed into one student-safe runtime payload with ordered passage sections and remapped display numbers.

The trusted Reading V2 submit endpoint scores from server-side canonical/review data. The browser submits a projection-bound answer payload and must not receive answer keys from student-safe paths.

For live-session and homework Reading V2 runs with anti-cheat enabled, the browser may also submit an optional `integrityReport`. Trusted submit persists this telemetry for review/monitoring, but scoring still comes only from canonical Reading V2 data.

After a successful trusted submit in homework mode, the student practice page must also complete the linked Firestore `homework_submissions/{submissionId}` row through the existing homework lifecycle service. The RTDB Reading V2 result and Firestore homework attempt are both required for teacher Homework Detail, student Homework list, and result review to stay consistent.

Assignment, runtime, submission, and result review are frozen-payload consumers. Reading Passage set homework reads the pinned `assignmentPayloadPath` first and fails closed when it is missing. It must not fall through to current `student_safe_tests` rows after archive, restore, repair, or source version changes. Result review loads frozen/review projection data tied to the submitted version, not current source state.

Rollout gating still applies:

- homework launch may be enabled independently from solo/public launch through capability flags
- direct solo/public full-test launch stays blocked when rollout mode remains teacher-preview
- this gate is intentional and does not mean projections are missing

Audit events are append-only state-change records. Audit builders may omit optional fields, but must normalize away `undefined` optional values before validation/write so RTDB writes never fail on absent optional flags. Unknown action, actor-role, entity-type, and unsafe content fields still fail closed.

## Edit And Revision Boundary

Editing a generated Reading Passage from inside a full test must not silently mutate every place that passage is reused.

Default behavior:

- edit from a full-test context creates a test-specific fork/new version
- shared-source edit requires an explicit command and teacher confirmation
- individual Reading Passage Studio keeps exactly one passage in the edited entity; creating more passages requires a new full-test/import/Auto Studio flow
- assignment always binds an explicit published snapshot/version
- archived or superseded source rows must not break already assigned homework snapshots

The existing edit-test modal and material edit surfaces must treat Reading V2 materials as versioned published artifacts. They must preserve links to class, course, homework, live session, solo practice, and result review consumers instead of rewriting legacy `/tests` assumptions into Reading V2 paths.

## Reading V1 Boundary

Do not merge this contract into the legacy Reading V1 pipeline.

Reading V1 still uses legacy `/tests/{testId}` and `/student_safe_tests/{testId}` projection contracts. Reading V2 uses `reading_v2/*` namespaced material, snapshot, projection, publish, and result paths plus Material Catalog summary indexes.

Shared outer features can launch, assign, or review both systems, but the publish and runtime storage planes are different.

## Verification Anchors

Required proof for changes touching this contract:

- publish plan includes canonical per-passage `published_snapshots`
- full-test publish plan includes master student-safe, session-safe, and review projections
- generated Reading Passage rows appear from `material_catalog/material_indexes`
- student-safe projections contain no answer keys, scoring rules, import evidence, hidden provenance, draft payloads, or student answers
- student homework detail loads Reading V2 summary from `tests/{materialId}` plus student-safe projection, not owner-only metadata
- individual Reading Passage Studio hides `Add Passage` while manual blank, paste/import, and Auto V4 creation modes keep it available
- archive/restore changes active summary rows without deleting snapshots, versions, assignment payloads, or result projections
- broken-ref guards detect `archived`, `missing`, `inaccessible`, `missing-version`, and `missing-projection` without hydrating unsafe payloads
- single Reading Passage assignment launches from assignment-pinned student-safe projection
- Reading Passage set assignment launches from the pinned frozen assignment payload before reading current projections
- full Reading V2 homework detail can show `Resume Attempt` and launch runtime without `Reading V2 launch requires a published projection.`
- trusted submit writes a Reading V2 result, preserves supplied `integrityReport`, and completes the linked `homework_submissions` row
- teacher homework result review loads the Reading V2 review projection
- full Reading V2 tests still launch, submit, and review after passage extraction

## Related Docs

- `documentation/architecture/reading-v2-auto-v4-provider-review-contract.md`
- `documentation/architecture/student-test-delivery-projections.md`
- `documentation/architecture/homework-solo-practice-architecture.md`
- `documentation/architecture/reading-v2-runtime-integrations.md`
- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- `documentation/architecture/reading-v2-material-removal-lifecycle.md`
- `documentation/tasks/PRD0052/tasks-0052-prd-teacher-materials-books-and-reading-passage-library-gap-closure.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
