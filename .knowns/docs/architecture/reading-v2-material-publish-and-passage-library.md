---
title: Reading V2 Material Publish And Passage Library
description: Reading V2 PRD-0052 publish contract for full-test master materials, generated Reading Passage materials, Material Catalog indexes, safe projections, homework completion, and Reading V1 boundary.
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-15T00:00:00.000Z'
tags:
  - architecture
  - reading-v2
  - prd-0052
  - teacher-materials
  - reading-passage
  - homework
---

# Reading V2 Material Publish And Passage Library

## Purpose

Reading V2 authoring can start from normal Studio test making, paste/import, or Auto V4. All paths converge in Studio and publish through the same data plane.

Full-test publish creates:

- one master full-test material
- one generated Reading Passage material per source passage
- ordered refs from the master full test to generated passage material ids and snapshot/version ids

Repo architecture mirror: `documentation/architecture/reading-v2-material-publish-and-passage-library.md`.

## Publish Contract

Each generated Reading Passage must have:

- `reading_v2/reading_passage_materials/{materialId}`
- `reading_v2/reading_passage_material_versions/{materialId}/{versionId}`
- `reading_v2/published_snapshots/{materialId}/{snapshotVersionId}`
- `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`
- `reading_v2/projections/review/{materialId}:{snapshotVersionId}`
- `reading_v2/material_metadata/{materialId}`
- safe summary rows under `material_catalog/material_indexes/*`

Each composition-first full Reading V2 test must also have:

- master student-safe projection under `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`
- master session-safe projection under `reading_v2/projections/session_test_payloads/{sessionCode}:{snapshotVersionId}`
- master review projection under `reading_v2/projections/review/{materialId}:{snapshotVersionId}`

The full-test composition layer lives at:

- `reading_v2/full_test_compositions/{compositionId}`
- `reading_v2/full_test_composition_versions/{compositionId}/{versionId}`

## Post-Publish Studio Exit

Successful non-revision publish must exit Studio and return the teacher to the existing Teacher Lobby/Materials shell.

Reason:

- publish already committed master full-test data plus generated Reading Passage entities
- keeping same Studio shell open suggests live published rows are still being edited directly

Later edits require explicit revision plus republish.

Exception: bounded published-revision follow-up may stay in Studio, but it still operates on a draft revision, not on live published projections.

Obsolete as of 2026-06-15: leaving create/import-style publish success inside the same Studio shell.

## Material Catalog Decision

`material_catalog/material_indexes` is the production Teacher Materials summary index for Reading Passage rows and Book material-picker candidates.

`reading_v2/listing_indexes` is obsolete/compatibility-only for PRD-0052 QA unless a future migration updates readers, writers, rules, tests, and browser proof.

Index rows must not contain passage bodies, questions, answer keys, scoring rules, import evidence, hidden provenance, draft payloads, or student answers.

Archive/remove cleanup may use canonical `reading_v2/material_metadata/{materialId}/ownerId === auth.uid` as fallback owner proof when active Material Catalog index rows are stale or missing.

## Master Removal Lifecycle

Reading V2 master full-test removal is soft removal. Teacher Lobby delete opens a modal with `Remove master only`, `Remove master and linked passages`, and `Cancel`.

Master-only removal sets master composition/metadata state to `removed`, removes active Material Catalog rows, removes legacy `/tests/{masterMaterialId}`, writes `reading_master_removed` audit, and does not archive linked passages.

Linked-passage removal archives only actor-owned linked Reading Passages through the Reading Passage archive service, then removes the master. It blocks when any linked passage is not owned by the actor.

Obsolete as of 2026-06-15: treating master removal as always leaving every linked generated passage active. New contract is master-only by default with explicit optional archive of owned linked passages.

## Runtime And Homework

Student Reading V2 runtime consumes namespaced projections, not canonical teacher data.

Student launch surfaces must not depend on owner-only `reading_v2/material_metadata/{materialId}` reads. Student-visible summary and launch preparation must use student-readable bridges plus projections:

- non-live full-test launch summary/detail: `tests/{materialId}` plus `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`
- live-session full-test launch: `reading_v2/projections/session_test_payloads/{sessionCode}:{snapshotVersionId}`

For Reading Passage homework, assignment binds an explicit `materialId` plus `snapshotVersionId`. Trusted submit scores server-side, then the student practice page completes the linked Firestore `homework_submissions/{submissionId}` row through `submitHomework(...)`.

Both the Reading V2 result and Firestore homework submission completion are required for Student Homework, Teacher Homework Detail, and result review to agree.

Rollout gating still applies:

- homework launch may be enabled independently from solo/public launch through capability flags
- direct solo/public full-test launch stays blocked when rollout mode remains teacher-preview
- this gate is intentional and does not mean projections are missing

## Boundaries

Reading V1 stays on legacy `/tests` plus root `/student_safe_tests`.

Reading V2 uses `reading_v2/*` material, snapshot, projection, publish, and result paths plus Material Catalog summary indexes.

Auto V4 is an import assistant only. It does not bypass Studio validation or the shared publish contract.

## Studio Passage Cardinality

`Add Passage` and passage removal controls are available only for new multi-passage test creation surfaces:

- manual blank Studio creation (`create-blank`)
- paste/import output in Studio (`create-from-import`)
- Auto V4 output in Studio (`create-from-auto`)

Standalone `reading-passage` materials contain exactly one passage. Single-passage Studio for revision, manual remake, or passage-version editing must hide passage add/remove collection controls and edit only that entity's existing passage.

Obsolete as of 2026-06-15: treating one shared Studio shell as permission to show `Add Passage` in every Studio mode. Resume, revision, duplicate, extraction, and single-passage repair modes share draft infrastructure but do not automatically inherit passage-collection controls.

## Verification Anchors

- publish plan includes canonical per-passage `published_snapshots`
- full-test publish plan includes master student-safe, session-safe, and review projections
- generated Reading Passage rows appear from `material_catalog/material_indexes`
- student-safe/list paths contain no answer keys or provenance
- student homework detail loads Reading V2 summary from `tests/{materialId}` plus student-safe projection, not owner-only metadata
- single Reading Passage Studio hides `Add Passage`
- single Reading Passage homework launches from assignment-pinned projection
- full Reading V2 homework detail can show `Resume Attempt` and launch runtime without `Reading V2 launch requires a published projection.`
- trusted submit writes a Reading V2 result and completes linked `homework_submissions`
- teacher result review loads Reading V2 review projection
