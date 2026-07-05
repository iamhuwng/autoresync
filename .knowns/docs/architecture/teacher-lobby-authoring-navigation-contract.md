---
title: Teacher Lobby Authoring Navigation Contract
description: Current Teacher Lobby authoring, material-card, search, compact header, and responsive teacher-header contract.
createdAt: '2026-05-11T17:29:15.396Z'
updatedAt: '2026-06-15T00:00:00.000Z'
tags:
  - architecture
  - teacher-lobby
  - test-creation
  - navigation
  - thcs
---

# Teacher Lobby Authoring Navigation Contract

## Purpose

Defines current Teacher Lobby authoring, card, search, compact header, and responsive navigation contract after May 2026 lobby polish.

## Current Anchors

- `src/pages/TeacherLobbyPage.jsx`
- `src/components/navigation/TeacherHeader.tsx`
- `src/components/navigation/TeacherNavigation.tsx`
- `src/components/modern/SearchFilterBar.jsx`
- `src/components/modern/TestCard.jsx`
- `src/components/modern/icons.jsx`
- `src/components/test-creation/TestCreationModal.tsx`
- `src/components/thcs-editor/THCSSetupStep.tsx`

## Contract

- Teacher Lobby `Create New Test` opens `TestCreationModal`; it must not route to a separate creation page before test-family/skill selection.
- THCS-THPT creation stays inside the shared creation modal shell; do not add a second THCS-only lobby modal.
- Reading V2 uses the same modal entry and forwards metadata/start mode into Studio.
- Reading V1 and Quiz are retired and must not appear as active teacher creation/runtime choices. See @doc/architecture/retired-features-current-state.
- Successful non-revision Reading V2 publish returns the teacher to the Lobby/Materials context; do not leave the same Studio shell open as if live published content were still being edited there.
- `SearchFilterBar` search input uses the shared SVG `SearchIcon`; do not use emoji-only input icons.
- Material-card titles clamp to two visible lines and expose the full title through native title/tooltip text.
- `TeacherHeader` owns the shared teacher header design and must render as a top-level page/shell child attached to the top edge.
- Page padding, max-width, and lobby content spacing belong inside `main` or a content wrapper, never around `TeacherHeader`.
- Compacting `TeacherHeader` is a density change only: preserve the existing white/glass chrome, dark slate title, navigation order, active/inactive variants, and profile/notification placement.
- Reduce header space through tighter padding, smaller gaps, smaller title/back/profile sizing, and `min-width: 0` flex constraints before changing layout identity.
- Header navigation tabs may use small buttons with sharper 3px-5px corners; keep them more square-like than pill-shaped but not fully square.
- Do not move page-level library tabs, search controls, or material filters into `TeacherHeader`; those belong to page content/header regions.
- `TeacherHeader` renders full inline tabs only at `>=1280px`; `769px-1279px` uses the compact teacher-navigation hamburger dropdown; `<=768px` uses the mobile drawer.
- THCS setup quick-start cards use SVG icon art and stay compact with breathing room below the card row.
- `Advanced Settings` uses a rotating SVG chevron, not a text triangle glyph.

## Retired Patterns

- page-first test creation from Teacher Lobby before family selection
- THCS creation through a separate lobby-only modal
- leaving successful non-revision Reading V2 publish inside the same Studio shell
- emoji search icon as the input icon
- text-glyph `Advanced Settings` triangle
- material-card titles expanding beyond two lines
- full teacher tab row on narrow desktop widths where it collides with user/profile controls
- wrapping `TeacherHeader` in per-page padding/margins that detach it from the top page edge
- replacing the shared teacher header visual language when only compact density was requested
- moving page-level library tabs or filter controls into `TeacherHeader`

## Repo Docs

- `documentation/architecture/teacher-lobby-authoring-and-navigation.md`
- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- `documentation/architecture/teacher-test-creation-parsing-and-review.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
- `documentation/system/navigation-ux-guide.md`

## PRD-0050 List View Boundary

Compact Materials list mode is owned by @doc/architecture/teacher-materials-list-view-contract.

Grid cards remain summary cards with two-line title clamp. List mode must not be implemented as widened cards; it uses fixed columns, a four-slot icon action rail, and restrained typography.

Retired: list action rails sized by button text or by whether `Assign HW` is present.

## Material Visual Taxonomy Boundary

Leading material icons and accents use @doc/architecture/teacher-material-visual-taxonomy.

Grid cards and list rows may share the taxonomy, but action icons stay in action controls and never replace the leading material marker.
