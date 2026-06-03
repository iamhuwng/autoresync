---
title: Student Test Delivery Projections
description: Legacy and Reading V2 student-safe projection contract for student runtime delivery, including Reading V2 namespaced snapshots/projections and homework completion linkage.
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-03T00:00:00.000Z'
tags:
  - architecture
  - student-runtime
  - projections
  - reading-v2
  - homework
---

# Student Test Delivery Projections

## Purpose

Canonical teacher/admin data can contain answer keys, scoring rules, import evidence, repair history, and editor metadata. Student runtime must load answer-free projections.

Repo architecture mirror: `documentation/architecture/student-test-delivery-projections.md`.

## Legacy Reading/Listening

Legacy IELTS Reading/Listening uses:

- canonical: `tests/{testId}`
- student safe: `student_safe_tests/{testId}`
- live session: `session_test_payloads/{sessionCode}`

Normal save/update paths must keep canonical and student-safe data in the same write unit. Repair/backfill is incident-only, not the normal operating model.

## Reading V2

Reading V2 uses namespaced paths:

- canonical published snapshot: `reading_v2/published_snapshots/{materialId}/{snapshotVersionId}`
- student-safe projection: `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`
- live-session projection: `reading_v2/projections/session_test_payloads/{sessionCode}:{snapshotVersionId}`
- review projection: `reading_v2/projections/review/{materialId}:{snapshotVersionId}`

Generated Reading Passage materials from full-test publish are not launchable with metadata/index rows alone. They also need canonical published snapshots and student-safe projections.

## Homework Rule

Trusted Reading V2 submit writes the Reading V2 result. In homework mode, the linked Firestore `homework_submissions/{submissionId}` row must also be completed through `submitHomework(...)`.

Student-safe/list paths must not contain answer keys, scoring rules, import evidence, hidden provenance, draft payloads, or student answers.

Related doc: @doc/architecture/reading-v2-material-publish-and-passage-library.
