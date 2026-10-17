---
title: Universal Material Summary Integration
description: Shared Teacher Materials discovery contract using MaterialSummary v1 owner/public indexes, producer registry, lifecycle synchronization, repair gates, and permission boundaries.
createdAt: '2026-07-07T00:00:00.000Z'
updatedAt: '2026-07-08T00:00:00.000Z'
tags:
  - architecture
  - teacher-materials
  - material-summary
  - firebase
  - visibility
---

# Universal Material Summary Integration

Repo source: `documentation/architecture/universal-material-summary-integration.md`.

Teacher Materials active discovery uses
`material_catalog/material_summary_indexes/v1`.

2026-07-08 correction: My Content/Public Library are published-test views, not
all-material views. They present only `full-test`, `listening-part`,
`writing-prompt`, and `thcs-thpt-test` summaries. Reading Passage and Book rows
remain summary-backed but render through their own tabs.

My Content reads:

```text
material_catalog/material_summary_indexes/v1/by_owner/{teacherId}
```

Public Library reads:

```text
material_catalog/material_summary_indexes/v1/by_visibility/public
```

`/tests`, `material_catalog/material_indexes`, `material_catalog/book_indexes`,
and Reading V2 relationship indexes are runtime, compatibility, archive, repair,
or feature-specific helper surfaces. They are not the universal active listing
authority.

Every supported producer needs:

- stable registry entry
- `summary-v1` contract version before claiming integration
- lifecycle summary writes for publish/update/archive/remove/restore
- rules coverage for owner/public/diagnostic buckets
- reconciliation and repair proof
- tests proving unsafe fields, malformed rows, wrong bucket writes, and missing
  producer registration fail closed

Reading V2 full-test summaries must carry safe assignment-readiness facts from
the published student-safe projection: `questionCount`,
`sourceSnapshotVersionId`, `hasStudentSafeProjection`, `deliveryProjectionReady`,
`studentSafeProjectionReady`, and `passageRefCount`. Teacher Materials uses
these summary facts for row question counts and `Assign HW`; it must not
hydrate Reading V2 canonical/projection payloads just to render cards.

Visibility and tab contract:

- My Content is an owner query and includes private plus public active
  published-test rows owned by the teacher.
- THCS `Use as-is` / `thcs_linked_tests` refs are not owned materials and do
  not merge into My Content; use a future Saved/Linked view if needed.
- Public Library is a visibility query and includes active public
  published-test summaries, including public rows owned by the current teacher.
- Reading Passage and Book rows do not render in My Content/Public Library
  after those families gained dedicated tabs.
- Students and unauthenticated users cannot browse Teacher Materials summary
  indexes.
- Super admin can read/write diagnostic and repair buckets.
- Public Book summary writes are admin-only across all universal summary
  buckets.

Repair contract:

- dry-run first
- reviewed report and digest
- explicit approval for live writes
- bounded multi-location update
- post-write readback and zero-op verification

THCS runtime bridge rule:

- Firestore `thcs_library` is not Teacher Materials authority
- metadata-only `thcs_library` rows with `sectionSummary` but no full
  `sections/questions` are historical records, not active runnable tests
- `repair:thcs-runtime-bridges` may backfill only complete published
  `thcs_drafts` rows into `/tests` plus MaterialSummary v1
- removed MaterialSummary `by_id` tombstones block stale THCS draft/library
  sidecar resurrection; repair may only clean stale active fan-outs
- write mode needs `--write --approved <id> --from-report <dry-run-report>`

Writing runtime bridge rule:

- Firestore `writing_drafts` is authoring state, not My Content listing
  authority
- complete published Writing drafts with `publishedTestId` must have
  `/tests/{testId}` plus MaterialSummary v1 fan-out
- `repair:writing-runtime-bridges` may backfill only complete published
  Writing drafts into `/tests` plus MaterialSummary v1
- removed MaterialSummary `by_id` tombstones block stale Writing draft
  sidecar resurrection
- write mode needs `--write --approved <id> --from-report <dry-run-report>`

2026-07-07 evidence:

- approved summary repair prewrite planned 204 operations and postwrite reported
  zero remaining operations
- approved Reading V2 `/tests` bridge repair prewrite planned 12 operations and
  postwrite reported zero remaining operations
- browser proof on `http://localhost:5173/lobby` must verify My Content/Public
  Library as published-test views and Reading Passage/Book as dedicated
  summary-backed views, without permission errors or fake empty states

2026-07-08 evidence:

- approved THCS runtime bridge repair wrote 3 `/tests` rows and 15
  MaterialSummary rows, final-hardening corrective write committed 1 runtime
  row plus 5 MaterialSummary rows, then final postwrite reported zero remaining
  THCS bridge operations
- later `tmp/tests-export.json` comparison restored 17 additional complete THCS
  `/tests` rows plus MaterialSummary fan-out, excluding intentionally deleted
  `Retake`; post-write dry-run selected 0 remaining rows
- Writing runtime bridge repair wrote 11 `/tests` rows and 55 MaterialSummary
  rows with `user-requested-proceed-2026-07-08`, then final postwrite reported
  zero remaining Writing bridge operations
- browser proof after Writing repair showed Teacher Test My Content with
  7 published-test rows: 5 Reading V2 rows plus 2 Writing rows; no Reading
  Passage or Book rows rendered there
- Chrome proof after owned-only correction for `hungnguyenzim@gmail.com` showed
  24 My Content materials, 13 owned THCS rows, no linked/use-as-is THCS rows, no
  `Retake`, no `Linked` badge, and no console warnings/errors
- Reading V2 assignment-readiness repair deployed RTDB summary rules to
  `temp-a1437`, repaired 54 live Reading V2 full-test summary paths, and
  postwrite dry-run showed zero remaining `reading-v2-full-test` drift
- Chrome proof after that repair showed 13 My Content rows, 5 Reading V2 rows,
  all Reading V2 rows with positive question counts and `Assign HW`, no
  Reading Passage/Book kind rows, and no fresh console warnings/errors after
  creating the `writing_drafts(userId, updatedAt)` Firestore index
- raw live repair reports/payloads can contain auth data, test bodies, or user
  content; keep local unless deliberately redacted
