# Teacher Materials Listing And Diagnostics

## Purpose

This document defines the current Teacher Lobby materials-listing contract.

The Teacher Materials published-test list is backed by the shared universal
MaterialSummary catalog. `/tests` is runtime and legacy compatibility storage
only. It is not the Teacher Materials listing authority.

The detailed summary schema, producer registry, lifecycle, repair, and rollout
contract is defined in
`documentation/architecture/universal-material-summary-integration.md`.

## Runtime Ownership

Runtime surfaces:

- `src/pages/TeacherLobbyPage.jsx`
- `src/hooks/test/useTeacherTests.ts`
- `src/hooks/test/useTestFilters.ts`
- `src/services/materialCatalog/materialSummaryPort.service.ts`
- `src/services/materialCatalog/materialSummaryCardAdapter.service.ts`
- `src/utils/teacherMaterialsDiagnostics.js`

Database/index anchors:

- `material_catalog/material_summary_indexes/v1/by_owner/{teacherId}`
- `material_catalog/material_summary_indexes/v1/by_visibility/public`
- `material_catalog/material_summary_indexes/v1/by_id/{materialId}`
- `material_catalog/material_summary_indexes/v1/by_material_kind/{materialKind}/{materialId}`
- `material_catalog/material_summary_indexes/v1/by_test_type/{testTypeId}/{materialId}`

The Teacher Lobby list is a summary read surface. It must not hydrate canonical
Reading V2 drafts, passage assets, Book nodes, student-safe payloads,
session-safe payloads, result projections, answer keys, scoring rules, or import
evidence just to render cards.

UI chrome, modal authoring entry, card title clamp, search icon, and responsive
teacher navigation are governed by
`documentation/architecture/teacher-lobby-authoring-and-navigation.md`.

Compact Materials list-view layout, fixed row grid, action slots, and
typography are governed by
`documentation/architecture/teacher-materials-list-view-contract.md`.

Bulk selection and tab-specific selected-material actions are governed by
`documentation/architecture/teacher-materials-bulk-selection-actions.md`.

## Listing Contract

### My Content

My Content reads active summaries from:

```text
material_catalog/material_summary_indexes/v1/by_owner/{teacherId}
```

This scope includes private and public rows owned by that teacher, but the My
Content tab presents published tests only. The published-test material kinds are:

- `full-test`
- `listening-part`
- `writing-prompt`
- `thcs-thpt-test`

Public rows owned by other teachers, including THCS `Use as-is` or
`thcs_linked_tests` references saved under the current user, must not be merged
into My Content. A future Saved/Linked view should own those references if the
product needs them.

Reading Passage and Book rows must not render in My Content. They belong to
their dedicated tabs. The hook must not read all `/tests`, read another
teacher's owner bucket, or convert permission/contract failures into an empty
list.

### Public Library

Public Library reads active public summaries from:

```text
material_catalog/material_summary_indexes/v1/by_visibility/public
```

This scope includes active public rows, including rows owned by the current
teacher, but the Public Library test view presents published tests only by the
same material-kind allowlist as My Content. It must not read private visibility
buckets and must not read all canonical stores to filter public rows
client-side.

### Drafts, Reading Passage, And Book Tabs

Drafts remain separate from the published-material list. `useTeacherDrafts`
owns draft loading and should only run when the Drafts tab is active.

Dedicated Reading Passage and Book views keep their specialized UI and
archive/editor behavior. Their discoverability must remain connected to
registered summary kinds, but they are not part of the My Content/Public Library
published-test views. Active private/public listing rows start from
`material_summary_indexes/v1`; legacy material/book indexes are not active
Teacher Materials discovery authority.

Archive rows are a separate lifecycle surface. Active My Content and Public
Library buckets must contain active summaries only.

## Permission Contract

- Teacher owner reads `by_owner/{auth.uid}` only.
- Teacher Public Library reads `by_visibility/public` only.
- Teacher `by_id` reads are limited to active owned rows or active public rows.
- `by_owner/{auth.uid}` includes both private and public summaries owned by that
  teacher. Private-only feature subscopes must filter after the owner summary
  read, not by replacing My Content with a private visibility query.
- Students and unauthenticated users cannot browse Teacher Materials summary
  indexes.
- Super admin may read/write diagnostic and repair buckets.
- Public Book summary create, update, delete, and demotion are admin-only across
  all universal summary buckets.

Every universal summary row is closed with `$other.validate=false`. Unknown
fields and canonical payload fields such as `content`, `document`, `questions`,
`answerKey`, `studentAnswers`, `hiddenProvenance`, and `importEvidence` are
rejected by rules and by the shared port.

Reading V2 full-test summaries also carry list-safe assignment-readiness facts:
`questionCount`, `sourceSnapshotVersionId`, `hasStudentSafeProjection`,
`deliveryProjectionReady`, `studentSafeProjectionReady`, and
`passageRefCount`. My Content uses those facts to show nonzero question counts
and enable `Assign HW`; it must not hydrate Reading V2 canonical/projection
payloads just to decide card actions.

## Realtime Contract

Realtime listeners must match the active summary scope:

- owned scope: `material_summary_indexes/v1/by_owner/{teacherId}`
- public scope: `material_summary_indexes/v1/by_visibility/public`

Initial RTDB listener snapshots are skipped because the initial indexed fetch
already loaded the same data. Later realtime events reload the same scoped
summary query.

Any initial load, refresh, realtime reload, or realtime listener error must:

1. expose the error,
2. clear stale rows,
3. clear `loadedScope`, and
4. avoid rendering a believable empty list.

The page exposes `loadedScope` from `useTeacherTests` and only emits rendered
grid/list diagnostics when `loadedScope` matches the active tab. This prevents
stale owned data from being logged as a completed public render during tab
switches.

## Diagnostics Contract

Diagnostics are intentionally scoped to Teacher Lobby materials loading.

Enablement:

- dev mode: enabled automatically
- production mode: enabled only with `?diagTeacherMaterials=1` or
  `?diagTeacherMaterials=true`
- test mode: disabled by default

Stable prefix:

```text
[Diag][TeacherMaterials]
```

Diagnostic payload rules:

- include scope, counts, kind/producer counts, and duration
- include only short uid tails when user identity is useful
- do not log material payloads, answers, passages, draft bodies, or student data

## Retired Patterns

These patterns are obsolete for Teacher Lobby material cards:

- `queryOptimizer.getAllTests()` for normal Teacher Materials My Content
- reading full `/tests` and filtering by ownership client-side
- reading full `/tests` and filtering public rows client-side
- treating My Content/Public Library as all-material tabs after Reading Passage
  and Book gained dedicated tabs
- treating `/tests` as the universal material discovery source
- hydrating Reading V2 canonical documents or projections just to render cards
- computing archive, restore, or broken-ref list badges by hydrating canonical
  payloads in the lobby list
- using `reading_v2/listing_indexes` as production QA proof for Teacher
  Materials rows
- using legacy `/tests` delete alone for Reading V2 master full-test removal
- treating selected-material bulk actions as a generic force-delete surface
- logging grid readiness before the loaded data scope matches the active tab
- adding always-on console timing logs outside the gated diagnostics helper

Old PRD-0033 and PRD-0052 references to `/tests` or
`reading_v2/listing_indexes` are historical unless a future migration explicitly
rewires readers, writers, rules, tests, docs, and browser proof.

### THCS Historical Rows

Firestore `thcs_library` is obsolete as a Teacher Materials listing source.
Some historical THCS rows contain only metadata and `sectionSummary`; they do
not contain runnable `sections/questions` and must not be shown as active My
Content tests.

When a published `thcs_drafts` row has full sections but `/tests/{testId}` is
missing, use the gated `repair:thcs-runtime-bridges` flow. That repair writes
the RTDB runtime row and MaterialSummary v1 rows together. Metadata-only
`thcs_library` rows remain historical records until a complete source body is
found. A MaterialSummary `by_id/{testId}` row with `lifecycleState: "removed"`
is a tombstone: repair must not resurrect it from stale published draft or
library sidecars, and may only clean stale active fan-outs for that test.

### Writing Published Draft Drift

Firestore `writing_drafts` is the Writing authoring source. A row with
`status: "published"` and `publishedTestId` is not sufficient for My Content
unless the Writing producer has also written the runtime `/tests/{testId}` row
and MaterialSummary v1 fan-out. If those rows drift, repair the producer bridge
with `repair:writing-runtime-bridges`; do not broaden My Content back to
Firestore draft scans or full `/tests` scans. Removed MaterialSummary `by_id`
tombstones also block Writing repair resurrection from stale published drafts.

## Current Evidence

Local proof on 2026-07-07:

- `useTeacherTests` reads `material_summary_indexes/v1/by_owner/{teacherId}` for
  My Content.
- `useTeacherTests` reads `material_summary_indexes/v1/by_visibility/public`
  for Public Library.
- Hook tests prove malformed rows, missing owner, scope-switch failures, refresh
  failures, and realtime listener failures are surfaced and clear stale rows.
- Emulator tests prove teacher owner/public reads, student/unauth denial, closed
  row validation, unsafe-field rejection, public Book moderation, and
  `by_test_type` membership validation.
- Browser proof on `http://localhost:5173/lobby` after rules and approved repair
  showed My Content, Public Library, Reading Passage, and Book tabs rendering
  from the expected scopes without permission errors or fake empty states.
- 2026-07-08 product correction: My Content and Public Library are
  published-test views. Reading Passage and Book rows remain discoverable via
  their own tabs, not through My Content/Public Library.
- 2026-07-08 product correction: My Content means materials created/owned by
  the current account only. THCS `Use as-is` / linked public tests are excluded
  from My Content and require a future Saved/Linked surface if needed.
- Google Chrome proof after the owned-only correction for
  `hungnguyenzim@gmail.com` showed 24 My Content materials, 13 THCS rows,
  zero linked/use-as-is THCS rows, no `Retake`, no `Linked` badge, and no
  console warnings/errors.
- Reading V2 `/tests` compatibility bridge repair is separate from Teacher
  Materials listing. It has a reviewed-report write gate and must not be used
  as listing authority.
- The 2026-07-07 approved material-summary repair artifacts live under
  `output/material-summary-reconciliation/`; prewrite planned 204 operations and
  postwrite verification reported zero remaining operations.
- The 2026-07-07 approved Reading V2 bridge repair artifacts live under
  `output/reading-v2-test-bridge-repair/`; prewrite planned 12 operations and
  postwrite verification reported zero remaining operations.
- The 2026-07-08 approved THCS runtime bridge repair reports were generated
  locally under `output/thcs-runtime-bridge-repair/`; prewrite planned 18 operations
  (3 runtime writes and 15 MaterialSummary writes), the approved write
  committed, a final-hardening corrective write committed 6 operations
  (1 runtime write and 5 MaterialSummary writes), and final postwrite dry-run
  reported zero remaining THCS bridge operations. The same report intentionally
  left 17 Firestore `thcs_library` metadata-only rows unbackfillable.
- The 2026-07-08 Writing runtime bridge repair reports were generated locally
  under `output/writing-runtime-bridge-repair/`; prewrite planned 11 runtime writes
  and 55 MaterialSummary writes, write committed with
  `user-requested-proceed-2026-07-08`, and final postwrite dry-run reported
  zero remaining Writing bridge operations.
- Browser proof after the Writing repair showed Teacher Test My Content with
  7 rows: 5 Reading V2 full-test rows plus `Codex import live check writing`
  and `Inter - Task 1 - Lesson 2`; Reading Passage/Book rows stayed excluded
  and console reported zero errors/warnings.
- 2026-07-08 Reading V2 assignment-readiness repair added summary-v1 fields for
  student-safe projection readiness, deployed RTDB summary rules to
  `temp-a1437`, and repaired 54 live Reading V2 full-test summary paths from
  canonical/projection data. Postwrite dry-run reported zero remaining
  `reading-v2-full-test` summary drift; 170 remaining stale operations were
  Reading Passage and THCS summary rows outside this Assign HW bug.
- Chrome proof after that repair showed 13 My Content rows, 5 Reading V2 rows,
  every Reading V2 row with a positive question count and `Assign HW`, no
  Reading Passage/Book kind rows, and no fresh console warnings/errors after
  the missing `writing_drafts(userId, updatedAt)` Firestore index was created.
- Raw live repair reports and payloads can contain teacher-auth data, test
  bodies, or user content. Keep them local unless a redacted artifact is created
  deliberately for review.
- The class-page regression discovered during browser QA was caused by legacy
  class rows missing normalized status/date fields. That fix belongs to
  `documentation/architecture/course-class-management.md`; it is not a reason to
  weaken material-summary error handling.

## Healthy System Rules

1. Add list-scope tests for every new Teacher Lobby tab, material family, or
   card source.
2. Treat normal-teacher full `/tests` scans as regressions.
3. Add producer registry entries and summary lifecycle tests before a producer
   claims Teacher Materials integration.
4. Keep lobby cards on summary rows. Move heavy canonical payloads behind
   explicit open/edit/preview actions.
5. Preserve gated diagnostics so live browser checks can prove query scope, row
   counts, and render readiness without leaking payloads.
6. Run reconciliation dry-runs before and after live rules/backfill work.
7. Keep `/tests` bridge repair evidence separate from summary-catalog listing
   evidence. Bridge write mode requires `--write --approved --from-report` and
   post-write zero-op verification.

## Related Docs

- `documentation/architecture/universal-material-summary-integration.md`
- `documentation/architecture/teacher-lobby-authoring-and-navigation.md`
- `documentation/architecture/teacher-materials-list-view-contract.md`
- `documentation/architecture/teacher-materials-bulk-selection-actions.md`
- `documentation/architecture/changelog/thcs-runtime-bridge-repair.md`
- `documentation/architecture/reading-v2-material-publish-and-passage-library.md`
- `documentation/architecture/reading-v2-material-removal-lifecycle.md`
- `documentation/tasks/0033-prd-teacher-lobby-refactor.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
