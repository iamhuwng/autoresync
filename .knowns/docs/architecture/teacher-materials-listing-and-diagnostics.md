---
title: Teacher Materials Listing And Diagnostics
description: 'Current Teacher Lobby published-test listing contract: universal MaterialSummary v1 owner/public reads, scoped realtime, visible errors, and retired /tests discovery.'
createdAt: '2026-05-11T17:23:18.736Z'
updatedAt: '2026-07-08T00:00:00.000Z'
tags:
  - architecture
  - teacher-lobby
  - materials
  - performance
  - diagnostics
---

# Teacher Materials Listing And Diagnostics

Repo source: `documentation/architecture/teacher-materials-listing-and-diagnostics.md`.

## Current Contract

Teacher Materials discovery is backed by
`material_catalog/material_summary_indexes/v1`. `/tests` is runtime and legacy
compatibility storage only, not the listing authority.

My Content reads:

```text
material_catalog/material_summary_indexes/v1/by_owner/{teacherId}
```

Public Library reads:

```text
material_catalog/material_summary_indexes/v1/by_visibility/public
```

My Content includes owned active published-test summaries, private and public.
Public Library includes active public published-test summaries, including the
current teacher's own public rows. Published-test material kinds are
`full-test`, `listening-part`, `writing-prompt`, and `thcs-thpt-test`.
Public rows owned by other teachers, including THCS `Use as-is` /
`thcs_linked_tests` references, are not My Content; a future Saved/Linked view
should own those refs if needed.
Students and unauthenticated users cannot browse Teacher Materials summary
indexes.

Dedicated Reading Passage and Book active private/public views also begin from
`material_summary_indexes/v1`, but Reading Passage and Book rows do not render
in My Content/Public Library because they have dedicated tabs. Legacy
material/book indexes may remain for archive, review, or compatibility flows,
but not active Teacher Materials discovery.

## Runtime Anchors

- `src/pages/TeacherLobbyPage.jsx`
- `src/hooks/test/useTeacherTests.ts`
- `src/hooks/test/useTestFilters.ts`
- `src/services/materialCatalog/materialSummaryPort.service.ts`
- `src/services/materialCatalog/materialSummaryCardAdapter.service.ts`
- `src/utils/teacherMaterialsDiagnostics.js`

## Summary Row Rules

Universal rows are safe summaries only. They must not contain canonical
payloads, questions, answer keys, scoring rules, student answers, import
evidence, hidden provenance, draft bodies, or review payloads.

Every row bucket is closed with `$other.validate=false`.

Reading V2 full-test summaries carry safe assignment-readiness facts from the
published student-safe projection: `questionCount`,
`sourceSnapshotVersionId`, `hasStudentSafeProjection`, `deliveryProjectionReady`,
`studentSafeProjectionReady`, and `passageRefCount`. My Content uses these
summary fields for positive question counts and `Assign HW` without list-time
canonical/projection hydration.

## Realtime And Errors

Realtime listeners must watch the same active scope:

- owned: `material_summary_indexes/v1/by_owner/{teacherId}`
- public: `material_summary_indexes/v1/by_visibility/public`

Initial load, refresh, realtime reload, and realtime listener failures must
surface the error, clear stale rows, clear `loadedScope`, and avoid rendering a
believable empty list.

## Retired Patterns

Do not reintroduce these for Teacher Materials cards:

- `queryOptimizer.getAllTests()` for normal My Content
- full `/tests` scan plus client-side ownership filtering
- full `/tests` scan plus client-side public filtering
- `/tests` as universal material discovery
- treating My Content/Public Library as all-material tabs after Reading Passage
  and Book gained dedicated tabs
- `reading_v2/listing_indexes` as production Teacher Materials proof
- canonical payload hydration for card lists
- legacy `/tests` delete alone for Reading V2 master removal
- Firestore `thcs_library` fallback rows in My Content

Old PRD-0033/0052 references to these paths are historical unless a future
migration rewires readers, writers, rules, tests, docs, and browser proof.

THCS historical repair:

- `thcs_library` rows with only metadata and `sectionSummary` are historical
  records, not active runnable tests.
- Complete published `thcs_drafts` rows can be repaired through
  `repair:thcs-runtime-bridges`, which writes `/tests` and MaterialSummary v1.
- Metadata-only rows stay unbackfillable until a complete source body is found.
- Removed MaterialSummary `by_id` tombstones block THCS repair resurrection from
  stale draft/library sidecars; repair may only clean stale active fan-outs.

Writing drift repair:

- Firestore `writing_drafts` owns authoring state, not Teacher Materials
  listing.
- Published Writing drafts with `publishedTestId` must have `/tests/{testId}`
  plus MaterialSummary v1 fan-out.
- Use `repair:writing-runtime-bridges` for complete published Writing draft
  drift. Do not restore Firestore draft scans or broad `/tests` scans in My
  Content.
- Removed MaterialSummary `by_id` tombstones block Writing repair resurrection
  from stale published draft sidecars.

## Evidence

2026-07-07 local proof:

- Hook tests cover owner/public reads, malformed rows, missing owner,
  scope-switch failures, refresh failures, and realtime listener failures.
- Emulator tests cover owner/public permissions, student/unauth denial, closed
  rows, unsafe-field rejection, public Book moderation, and Test Type
  membership validation.
- Browser proof on `http://localhost:5173/lobby` after rules and approved repair
  showed My Content, Public Library, Reading Passage, and Book tabs rendering
  from expected scopes without permission errors or fake empty states.
- 2026-07-08 product correction: My Content and Public Library are
  published-test views. Reading Passage and Book rows remain discoverable via
  their own tabs.
- 2026-07-08 product correction: My Content means current-account owned
  materials only. THCS linked/use-as-is refs are excluded.
- Chrome proof after the owned-only correction for `hungnguyenzim@gmail.com`
  showed 24 My Content materials, 13 THCS rows, zero linked/use-as-is THCS rows,
  no `Retake`, no `Linked` badge, and no console warnings/errors.
- Reading V2 `/tests` bridge repair has a reviewed-report write gate and remains
  separate from Teacher Materials listing authority.
- 2026-07-07 approved material-summary repair artifacts live under
  `output/material-summary-reconciliation/`; prewrite planned 204 operations and
  postwrite verification reported zero remaining operations.
- 2026-07-07 approved Reading V2 bridge repair artifacts live under
  `output/reading-v2-test-bridge-repair/`; prewrite planned 12 operations and
  postwrite verification reported zero remaining operations.
- 2026-07-08 approved THCS runtime bridge repair reports were generated locally
  under `output/thcs-runtime-bridge-repair/`; prewrite planned 18 operations
  (3 runtime writes and 15 summary writes), write committed, final-hardening
  corrective write committed 6 operations, and final postwrite dry-run reported
  zero remaining THCS bridge operations.
- A later `tmp/tests-export.json` comparison restored 17 additional complete
  THCS `/tests` rows plus MaterialSummary fan-out, excluding intentionally
  deleted `Retake`; post-write dry-run selected 0 remaining rows.
- 2026-07-08 Writing runtime bridge repair reports were generated locally under
  `output/writing-runtime-bridge-repair/`; prewrite planned 11 runtime writes
  and 55 summary writes, write committed with
  `user-requested-proceed-2026-07-08`, and final postwrite dry-run reported
  zero remaining Writing bridge operations.
- Browser proof after Writing repair showed Teacher Test My Content with
  7 rows: 5 Reading V2 rows plus `Codex import live check writing` and
  `Inter - Task 1 - Lesson 2`; Reading Passage/Book rows stayed excluded and
  console had zero errors/warnings.
- Reading V2 assignment-readiness repair deployed RTDB summary rules to
  `temp-a1437`, repaired 54 live Reading V2 full-test summary paths, and
  postwrite dry-run showed zero remaining `reading-v2-full-test` drift.
- Chrome proof after that repair showed 13 My Content rows, 5 Reading V2 rows,
  all Reading V2 rows with positive question counts and `Assign HW`, no
  Reading Passage/Book kind rows, and no fresh console warnings/errors after
  creating the `writing_drafts(userId, updatedAt)` Firestore index.
- Raw live repair reports/payloads can contain auth data, test bodies, or user
  content. Keep local unless deliberately redacted.
- The class-page regression in the same session was legacy/fixture class-row
  normalization. It does not weaken the fail-loud material-summary rule.

See `documentation/architecture/universal-material-summary-integration.md` for
the producer registry, lifecycle, repair, reconciliation, and rollout contract.
