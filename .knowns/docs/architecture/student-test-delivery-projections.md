---
title: Student Test Delivery Projections
description: Legacy and Reading V2 student-safe projection contract for student runtime delivery, including Reading V2 namespaced snapshots/projections, homework completion linkage, and host-owned return routing.
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-15T00:00:00.000Z'
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

Composition-first full-test publish must also create master projections at those same namespaced student-safe, session-safe, and review paths. Missing master projections are launch blockers, not optional convenience rows.

Student-facing summary surfaces must not rely on owner-only `reading_v2/material_metadata/{materialId}` reads. For non-live Reading V2 full-test homework/detail flows, the student-readable bridge is `tests/{materialId}` and the render-safe body comes from `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`.

Non-live Reading V2 hosts must also preserve launch-surface route context beside the projection payload. Projection data alone is not enough to reconstruct the correct student return destination.

## Homework Rule

Trusted Reading V2 submit writes the Reading V2 result. In homework mode, the linked Firestore `homework_submissions/{submissionId}` row must also be completed through `submitHomework(...)`.

Student-safe/list paths must not contain answer keys, scoring rules, import evidence, hidden provenance, draft payloads, or student answers.

Current student-facing consumers:

- `src/pages/StudentHomeworkDetailPage.tsx` hydrates Reading V2 homework summary from `getTestFromFirebase(materialId)` plus the student-safe projection instead of owner-only namespaced metadata.
- `src/pages/StudentPracticePage.tsx` launches non-live Reading V2 from student-safe projections and preserves route context for exit behavior.
- `src/pages/TestPageRouter.tsx` launches live Reading V2 from session-safe projections.

Related doc: @doc/architecture/reading-v2-material-publish-and-passage-library.

## Return-Path Rule

Projection contract and route contract are separate:

- projections decide what a student may render
- host route state decides where a student returns when they leave a non-live Reading V2 runtime

Obsolete as of 2026-06-15:
- deriving non-live Reading V2 return destinations from projection payload contents alone
- treating projection freshness as a substitute for launch-context preservation
- treating child passage projections as enough for published full-test launch
- reading `reading_v2/material_metadata/{materialId}` directly from student homework detail

Related doc:
- @doc/architecture/reading-v2-runtime-integrations
