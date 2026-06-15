# Teacher Materials Listing And Diagnostics

## Purpose

This document defines the current Teacher Lobby materials-listing contract after the May 2026 performance repair.

It exists because the old Teacher Lobby loading model was too broad: normal teachers could trigger full `/tests` reads and then filter client-side. That was slow, noisy, and easy to regress when new material types such as Reading V2 were added.

## Current Ownership

Runtime surfaces:

- `src/pages/TeacherLobbyPage.jsx`
- `src/hooks/test/useTeacherTests.ts`
- `src/services/firebaseQueryOptimizer.js`
- `src/utils/teacherMaterialsDiagnostics.js`

Database/index anchors:

- RTDB `/tests/{testId}`
- RTDB `material_catalog/material_indexes/*` for PRD-0052 Reading Passage and Book material-summary rows
- `database.rules.json` `.indexOn` for `/tests`: `ownerId`, `createdBy`, `isPublic`, `createdAt`, `updatedAt`

The Teacher Lobby list is a material index/read surface. It must not hydrate canonical Reading V2 drafts, passage assets, student-safe payloads, session-safe payloads, or result projections just to render cards.

UI chrome, modal authoring entry, card title clamp, search icon, and responsive teacher navigation are governed by `documentation/architecture/teacher-lobby-authoring-and-navigation.md`.

Compact Materials list-view layout, fixed row grid, action slots, and typography are governed by `documentation/architecture/teacher-materials-list-view-contract.md`.

Leading material icon and accent semantics are governed by `documentation/architecture/teacher-material-visual-taxonomy.md`.

Keep this document focused on data loading, cache scope, realtime scope, and diagnostics.

## Listing Contract

### My Content

For normal teachers, My Content must load only owned material rows:

1. Query `/tests` by `ownerId == teacherUid`.
2. Query `/tests` by `createdBy == teacherUid`.
3. Merge and de-duplicate by material id.
4. Sort by recent update/create time.
5. Cache under `test:owner:{teacherUid}`.

Reason for dual ownership query:

- newer rows should use `ownerId`
- older rows may only have `createdBy`
- the lobby cannot safely drop either field until a complete migration/backfill proves it

### Super Admin My Content

Super admin My Content may still use the broad all-tests path because the role explicitly owns global inspection.

This is the exception, not the normal teacher path.

### Public Library

Public Library must load by the public index:

1. Query `/tests` by `isPublic == true`.
2. Sort by recent update/create time.
3. Cache under `test:public`.

It must not read all tests and then filter public rows client-side.

### Drafts

Drafts remain separate from the published-material list. `useTeacherDrafts` owns draft loading and should only run when the Drafts tab is active.

### Reading Passage And Book Material Summaries

PRD-0052 Reading Passage rows and Book material-picker candidates must load from `material_catalog/material_indexes`, not from canonical Reading V2 documents.

Canonical Reading Passage list buckets:

- `material_catalog/material_indexes/by_owner/{teacherId}`
- `material_catalog/material_indexes/by_visibility/{visibility}`
- `material_catalog/material_indexes/by_material_kind/reading-passage`
- `material_catalog/material_indexes/by_test_type/{testTypeId}`
- `material_catalog/material_indexes/by_source_full_test/{fullTestMaterialId}`

These rows are safe summaries only. They must not include passage bodies, questions, answer keys, scoring rules, import evidence, hidden provenance, draft payloads, or student answers.

Reading Passage material filters include an Archive subtab for owned archived Reading Passage rows. Active Reading Passage lists and add-existing pickers must exclude archived rows. Archive rows are still safe summary rows; they may expose title, source, owner, visibility, test types, version ids, archived state, broken-ref summary counts, and restore eligibility, but never canonical bodies, answer keys, projections, or review payloads.

Broken-ref badges in listing surfaces must come from safe summary fields already present on material index or Book summary rows, such as `hasBrokenRefs`, `brokenRefCount`, and reason-code summaries. Listing code must not hydrate full canonical Reading V2 payloads to compute badges at render time. If a safe summary is unavailable, the detailed modal may compute and display the broken-ref state after explicit open/edit action.

### Removal And Stale Index Cleanup

Teacher Lobby delete for Reading V2 master rows must not call the legacy generic delete path. It must use the Reading V2 master removal lifecycle and show the PRD-0054 modal choices.

Material index cleanup is allowed to be idempotent. Rules and services must tolerate stale or missing active Material Catalog rows when canonical `reading_v2/material_metadata/{materialId}/ownerId` proves the authenticated teacher owns the Reading V2 material. This protects archive/remove retries and partial-cleanup recovery without hydrating unsafe canonical payloads for list rendering.

## Realtime Contract

Realtime listeners must match the active listing scope:

- owned scope: indexed `ownerId` and `createdBy` listeners
- public scope: indexed `isPublic` listener
- all scope: super-admin-only broad listener

Initial RTDB listener snapshots are skipped because the initial indexed fetch already loaded the same data. Later realtime events invalidate the matching scoped cache and reload with `skipCache=true`.

The page exposes `loadedScope` from `useTeacherTests` and only emits rendered-grid diagnostics when `loadedScope` matches the active tab. This prevents stale owned data from being logged as a completed public render during tab switches.

## Diagnostics Contract

Diagnostics are intentionally scoped to Teacher Lobby materials loading.

Enablement:

- dev mode: enabled automatically
- production mode: enabled only with `?diagTeacherMaterials=1` or `?diagTeacherMaterials=true`
- test mode: disabled by default

Stable prefix:

```text
[Diag][TeacherMaterials]
```

Required event families:

- `optimizer_fetch_requested`
- `optimizer_fetch_succeeded`
- `optimizer_cache_hit`
- `optimizer_fetch_skipped`
- `hook_load_requested`
- `hook_load_succeeded`
- `hook_load_failed`
- `realtime_listener_registered`
- `realtime_initial_snapshot_skipped`
- `realtime_reload_succeeded`
- `realtime_reload_failed`
- `grid_rendered`

Diagnostic payload rules:

- include scope, strategy, branch names, counts, and duration
- include only a short uid tail, never full uid or user profile data
- do not log material payloads, answers, passages, draft bodies, or student data

## Retired Patterns

These patterns are obsolete for normal Teacher Lobby material loading:

- `queryOptimizer.getAllTests()` for normal teacher My Content
- reading the full `/tests` table and filtering by ownership client-side
- reading the full `/tests` table and filtering public rows client-side
- hydrating Reading V2 canonical documents or projections just to render material cards
- computing archive, restore, or broken-ref list badges by hydrating canonical payloads in the lobby list
- using `reading_v2/listing_indexes` as production QA proof for Reading Passage list rows
- using legacy `/tests` delete alone for Reading V2 master full-test removal
- requiring an existing Material Catalog index row as the only proof for owner cleanup when canonical Reading V2 metadata proves ownership
- logging grid readiness before the loaded data scope matches the active tab
- adding always-on console timing logs outside the gated diagnostics helper
- treating the compact list view as a data-contract rewrite or as permission to hydrate heavier payloads

Old PRD-0033 references to `useTeacherTests` using `queryOptimizer.getAllTests()` are historical extraction requirements, not current architecture.

Old PRD-0052 references to `reading_v2/listing_indexes` are historical or compatibility-only unless a future migration deliberately moves production readers back to that family and updates rules/tests/browser proof.

## Live Evidence

Local browser verification on 2026-05-11 against the diagnostic build showed:

- My Content: indexed `ownerId` + `createdBy`, 16 rows loaded, 16 visible, `optimizer_fetch_succeeded` around 1.5s.
- Public Library: indexed `isPublic`, 23 rows loaded, 17 visible, `optimizer_fetch_succeeded` around 1.16s.
- No app console errors.
- No app network failures.

This was committed as `f57580c chore(teacher): add materials diagnostics` and deployed to Firebase Hosting `kahut1`.

## Healthy System Plan

Keep this path healthy with these rules:

1. Add list-scope tests whenever a new Teacher Lobby tab, material family, or card source is added.
2. Treat any normal-teacher full `/tests` scan as a regression unless a documented migration window explicitly allows it.
3. Add RTDB indexes before adding a new query branch.
4. Keep lobby cards on summary/index rows. Move heavy canonical payloads behind explicit open/edit/preview actions.
5. Preserve gated diagnostics so live browser checks can prove query scope, row counts, and render readiness without leaking payloads.
6. Add pagination or a dedicated material-summary index before public/owned row counts become large enough that indexed reads still exceed the UI budget.

## Related Docs

- `documentation/architecture/teacher-lobby-authoring-and-navigation.md`
- `documentation/architecture/teacher-materials-list-view-contract.md`
- `documentation/architecture/reading-v2-material-publish-and-passage-library.md`
- `documentation/architecture/reading-v2-material-removal-lifecycle.md`
- `documentation/tasks/0033-prd-teacher-lobby-refactor.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
