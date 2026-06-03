---
title: Reading V2 Material Publish And Passage Library
description: Reading V2 PRD-0052 publish contract for full-test master materials, generated Reading Passage materials, Material Catalog indexes, safe projections, homework completion, and Reading V1 boundary.
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-03T00:00:00.000Z'
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

The full-test composition layer lives at:

- `reading_v2/full_test_compositions/{compositionId}`
- `reading_v2/full_test_composition_versions/{compositionId}/{versionId}`

## Material Catalog Decision

`material_catalog/material_indexes` is the production Teacher Materials summary index for Reading Passage rows and Book material-picker candidates.

`reading_v2/listing_indexes` is obsolete/compatibility-only for PRD-0052 QA unless a future migration updates readers, writers, rules, tests, and browser proof.

Index rows must not contain passage bodies, questions, answer keys, scoring rules, import evidence, hidden provenance, draft payloads, or student answers.

## Runtime And Homework

Student Reading V2 runtime consumes namespaced projections, not canonical teacher data.

For Reading Passage homework, assignment binds an explicit `materialId` plus `snapshotVersionId`. Trusted submit scores server-side, then the student practice page completes the linked Firestore `homework_submissions/{submissionId}` row through `submitHomework(...)`.

Both the Reading V2 result and Firestore homework submission completion are required for Student Homework, Teacher Homework Detail, and result review to agree.

## Boundaries

Reading V1 stays on legacy `/tests` plus root `/student_safe_tests`.

Reading V2 uses `reading_v2/*` material, snapshot, projection, publish, and result paths plus Material Catalog summary indexes.

Auto V4 is an import assistant only. It does not bypass Studio validation or the shared publish contract.

## Verification Anchors

- publish plan includes canonical per-passage `published_snapshots`
- generated Reading Passage rows appear from `material_catalog/material_indexes`
- student-safe/list paths contain no answer keys or provenance
- single Reading Passage homework launches from assignment-pinned projection
- trusted submit writes a Reading V2 result and completes linked `homework_submissions`
- teacher result review loads Reading V2 review projection
