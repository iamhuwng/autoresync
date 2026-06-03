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

The full-test composition layer lives at:

- `reading_v2/full_test_compositions/{compositionId}`
- `reading_v2/full_test_composition_versions/{compositionId}/{versionId}`

Publish commits live at:

- `reading_v2/publish_commits/{materialId}:{snapshotVersionId}`

## Material Catalog Index Contract

`material_catalog/material_indexes` is the canonical lightweight Teacher Materials index family for Reading Passage and Book material selection.

Required buckets:

- `by_owner/{teacherId}/{materialId}`
- `by_visibility/{visibility}/{materialId}`
- `by_material_kind/{materialKind}/{materialId}`
- `by_test_type/{testTypeId}/{materialId}`
- `by_source_full_test/{fullTestMaterialId}/{materialId}`

Index rows are summary rows only. They must not contain passage bodies, questions, answer keys, scoring rules, import evidence, hidden provenance, draft payloads, or student answers.

`reading_v2/listing_indexes` is obsolete for production Teacher Materials proof. It may remain as a compatibility/internal helper, but it is not the source for PRD-0052 Reading Passage list QA or Book material picker QA.

## Student Runtime Contract

Student Reading V2 runtime consumes projections, not canonical teacher data.

For single Reading Passage homework, the assigned snapshot points to:

- `reading_v2/projections/student_safe_tests/{passageMaterialId}:{snapshotVersionId}`

For Reading Passage set homework, assignment-time snapshots are composed into one student-safe runtime payload with ordered passage sections and remapped display numbers.

The trusted Reading V2 submit endpoint scores from server-side canonical/review data. The browser submits a projection-bound answer payload and must not receive answer keys from student-safe paths.

After a successful trusted submit in homework mode, the student practice page must also complete the linked Firestore `homework_submissions/{submissionId}` row through the existing homework lifecycle service. The RTDB Reading V2 result and Firestore homework attempt are both required for teacher Homework Detail, student Homework list, and result review to stay consistent.

## Edit And Revision Boundary

Editing a generated Reading Passage from inside a full test must not silently mutate every place that passage is reused.

Default behavior:

- edit from a full-test context creates a test-specific fork/new version
- shared-source edit requires an explicit command and teacher confirmation
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
- generated Reading Passage rows appear from `material_catalog/material_indexes`
- student-safe projections contain no answer keys, scoring rules, import evidence, hidden provenance, draft payloads, or student answers
- single Reading Passage assignment launches from assignment-pinned student-safe projection
- trusted submit writes a Reading V2 result and completes the linked `homework_submissions` row
- teacher homework result review loads the Reading V2 review projection
- full Reading V2 tests still launch, submit, and review after passage extraction

## Related Docs

- `documentation/architecture/reading-v2-auto-v4-provider-review-contract.md`
- `documentation/architecture/student-test-delivery-projections.md`
- `documentation/architecture/homework-solo-practice-architecture.md`
- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- `documentation/tasks/PRD0052/tasks-0052-prd-teacher-materials-books-and-reading-passage-library-gap-closure.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
