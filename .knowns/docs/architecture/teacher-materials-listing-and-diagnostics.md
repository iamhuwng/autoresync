---
title: Teacher Materials Listing And Diagnostics
description: 'Canonical Teacher Lobby materials-listing contract after the May 2026 performance repair: indexed owner/public reads, scoped realtime/cache, gated diagnostics, and obsolete full-tests scan patterns.'
createdAt: '2026-05-11T17:23:18.736Z'
updatedAt: '2026-05-30T11:54:46.765Z'
tags:
  - architecture
  - teacher-lobby
  - materials
  - performance
  - diagnostics
---

# Teacher Materials Listing And Diagnostics

## Purpose

Defines the current Teacher Lobby materials-listing contract after the May 2026 performance repair.

The old normal-teacher loading model could read all `/tests` rows and filter client-side. That path is obsolete because it made the Materials tab slow and hid regressions when new material families were added.

## Code Anchors

- `src/pages/TeacherLobbyPage.jsx`
- `src/hooks/test/useTeacherTests.ts`
- `src/services/firebaseQueryOptimizer.js`
- `src/utils/teacherMaterialsDiagnostics.js`
- `database.rules.json` `/tests` indexes: `ownerId`, `createdBy`, `isPublic`, `createdAt`, `updatedAt`

Repo architecture mirror: `documentation/architecture/teacher-materials-listing-and-diagnostics.md`.

## Current Listing Contract

Normal teacher My Content:

1. Query `/tests` by `ownerId == teacherUid`.
2. Query `/tests` by `createdBy == teacherUid`.
3. Merge and de-duplicate by id.
4. Sort by recent update/create time.
5. Cache under `test:owner:{teacherUid}`.

Public Library:

1. Query `/tests` by `isPublic == true`.
2. Sort by recent update/create time.
3. Cache under `test:public`.

Super admin My Content is the only valid broad all-tests exception.

Drafts stay on `useTeacherDrafts` and should only load when the Drafts tab is active.

## Realtime Contract

Realtime listeners must match the list scope:

- owned: indexed `ownerId` and `createdBy` listeners
- public: indexed `isPublic` listener
- all: super-admin-only broad listener

Initial snapshots are skipped after the initial fetch. Later events invalidate scoped cache and reload with `skipCache=true`.

`loadedScope` prevents stale data from being reported as a rendered grid for the wrong tab.

## Diagnostics Contract

Diagnostics are gated through `teacherMaterialsDiagnostics`.

Enablement:

- dev: enabled automatically
- production: enabled with `?diagTeacherMaterials=1` or `?diagTeacherMaterials=true`
- test: disabled by default

Stable prefix: `[Diag][TeacherMaterials]`.

Event families include optimizer fetch/cache/skipped, hook load/reload, realtime registration/snapshot skip, and `grid_rendered`.

Payloads may include scope, strategy, branch names, counts, duration, and uid tail only. They must not log material payloads, answers, passages, drafts, profiles, or student data.

## Retired Patterns

Do not reintroduce these for normal Teacher Lobby material cards:

- `queryOptimizer.getAllTests()` for normal teacher My Content
- full `/tests` read plus client-side ownership filtering
- full `/tests` read plus client-side public filtering
- Reading V2 canonical document/projection hydration for card lists
- always-on console timing logs outside gated diagnostics

## Evidence

Local browser verification on 2026-05-11 showed:

- My Content: indexed `ownerId` + `createdBy`, 16 rows loaded, 16 visible, around 1.5s.
- Public Library: indexed `isPublic`, 23 rows loaded, 17 visible, around 1.16s.
- No app console errors.
- No app network failures.

Shipped as `f57580c chore(teacher): add materials diagnostics` and deployed to Firebase Hosting `kahut1`.

## Healthy System Rules

- Add list-scope tests for new Teacher Lobby tabs/material families.
- Treat normal-teacher full `/tests` scans as regressions.
- Add RTDB indexes before new query branches.
- Keep cards on summary/index rows; heavy canonical payloads belong behind explicit open/edit/preview actions.
- Preserve gated diagnostics for live browser proof.
- Add pagination or a dedicated material-summary index before indexed reads exceed UI budget.


## PRD-0050 List View Boundary

Compact Materials list-view rendering is owned by @doc/architecture/teacher-materials-list-view-contract.

The list view is a rendering mode over existing listing rows. It must not change normal-teacher indexed owner/public reads, Drafts active-tab loading, Reading V2 summary-only listing behavior, or gated diagnostics.

Retired: treating list mode as permission to hydrate heavier payloads or rewrite the materials loading contract.
