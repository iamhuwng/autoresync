---
title: Student Dashboard Architecture
description: Source of truth for the student dashboard host, feed, right rail, data ownership, and approved Stitch parity rules.
createdAt: '2026-03-31T22:18:34.333Z'
updatedAt: '2026-03-31T22:27:08.414Z'
tags:
  - architecture
  - student
  - dashboard
  - ui
  - stitch
---

# Student Dashboard Architecture

## Purpose

This document defines the implementation contract for the student dashboard after the Stitch-guided overhaul.

It exists to keep the dashboard aligned to the approved editorial feed anatomy instead of drifting back toward a generic widget board or social-feed clone.

## Stitch Boundary

The approved visual anchor is:
- `.stitch/designs/student-overhaul-from-academic-record-20260331/dashboard.html`

That anchor governs:
- center-column sequence
- feed row anatomy
- dashboard-specific right-rail grouping
- the lighter editorial shell tone

It does not govern:
- placeholder information architecture
- placeholder labels or routes from Stitch
- fake utility behaviors or decorative-only controls

## Ownership Model

The dashboard is split across three layers:
- `src/pages/StudentDashboardPage.jsx`: route host, data ownership, action wiring, and derived dashboard view models
- `src/components/dashboard/StudentDashboardFeedView.jsx`: center-column presentation for masthead, metric strip, tabs, and feed rows
- `src/components/dashboard/StudentDashboardRightRail.jsx`: page-owned dashboard rail presentation layered inside the shared student shell

The shared shell still owns shell-global data and structure:
- `src/components/layout/StudentLayout.tsx`
- `src/components/layout/StudentSidebar.tsx`
- `src/components/layout/StudentRightRail.tsx`

## Required Center-Column Sequence

Dashboard center content must render in this order:
1. light workspace masthead with search and utility controls
2. frameless metric strip
3. slim editorial tab row
4. timeline activity feed

Required rules:
- the masthead should read as a workspace header, not a toolbar
- the metric strip uses typographic columns rather than boxed KPI cards
- tabs stay slim and editorial
- the feed reads vertically with quiet separators and strong hierarchy

## Feed Row Variant Taxonomy

Dashboard activity must be composed from explicit row variants, not one generic event-card renderer.

Current families:
- result or test rows
- homework rows
- class update rows

Shared rules:
- keep the left node or icon rail consistent
- prefer concise metadata-derived copy over raw notification dumps
- keep actions inline and restrained
- use whitespace and hierarchy before adding containers

Variant-specific rules:
- result or test rows should stay sparse and score-led
- homework rows may use one quiet inset excerpt surface and one compressed metadata line
- class update rows should be mostly text plus one restrained inline action

## Right-Rail Grouping Contract

Dashboard does not use the generic shell widget stack as its visible rail anatomy.

Instead, it uses one grouped editorial aside:
- `Feed Snapshot` is the primary summary surface
- `Up Next` belongs to that same visual family rather than living as a separate boxed widget
- `Public Sessions` is a quieter supporting list

Rules:
- avoid repeated card shells for every section
- avoid loud section boxing that turns the rail into stacked widgets
- visual restatement of shell-owned summaries is allowed
- re-owning shell-global rail data is not allowed

## Data Boundary

Dashboard owns page-primary data such as:
- notifications and feed pagination
- unread and search state
- public-session discovery rows
- result-detail selection state

Dashboard consumes shell-owned summaries for:
- enrolled class projections
- active live-session summaries
- homework summary groups used in the metric strip and right rail

The dashboard must derive presentation from those shared summaries instead of creating duplicate loaders.

## Sidebar Parity Boundary

The dashboard feel depends on the shared sidebar as well as the center column.

Rules:
- sidebar labels remain compact and editorial
- active state uses restrained emphasis, not loud product-navigation pills
- shell utility actions such as `Join Class` remain present but visually demoted
- preserve real application routes instead of copying Stitch placeholder navigation literally

## Verification Standard

Dashboard parity work is not complete unless all of the following hold:
- the center column follows the required sequence
- feed rows read as editorial timeline variants rather than generic cards
- the right rail reads as one grouped aside rather than a widget stack
- the dashboard does not introduce duplicate shell-data loaders
- search and utility controls remain light and connected to real behavior

## Related Docs

- @doc/design/student-view-design-standard
- @doc/architecture/student-experience-architecture
- @doc/architecture/student-shell-data-loading-architecture
- @doc/architecture/student-shell-right-rail-architecture
