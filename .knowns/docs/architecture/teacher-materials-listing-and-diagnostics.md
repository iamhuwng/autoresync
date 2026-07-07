---
title: Teacher Materials Listing And Diagnostics
description: 'Current Teacher Lobby materials listing contract: universal MaterialSummary v1 owner/public reads, scoped realtime, visible errors, and retired /tests discovery.'
createdAt: '2026-05-11T17:23:18.736Z'
updatedAt: '2026-07-07T00:00:00.000Z'
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

My Content includes all owned active supported summaries, private and public.
Public Library includes all public active summaries, including the current
teacher's own public rows. Students and unauthenticated users cannot browse
Teacher Materials summary indexes.

Dedicated Reading Passage and Book active private/public views also begin from
`material_summary_indexes/v1`. Legacy material/book indexes may remain for
archive, review, or compatibility flows, but not active Teacher Materials
discovery.

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
- `reading_v2/listing_indexes` as production Teacher Materials proof
- canonical payload hydration for card lists
- legacy `/tests` delete alone for Reading V2 master removal

Old PRD-0033/0052 references to these paths are historical unless a future
migration rewires readers, writers, rules, tests, docs, and browser proof.

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
- Reading V2 `/tests` bridge repair has a reviewed-report write gate and remains
  separate from Teacher Materials listing authority.

See `documentation/architecture/universal-material-summary-integration.md` for
the producer registry, lifecycle, repair, reconciliation, and rollout contract.
