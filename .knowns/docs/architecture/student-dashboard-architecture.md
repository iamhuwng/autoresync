---
title: Student Dashboard Architecture
description: Source of truth for the student dashboard host, feed, right rail, data ownership, and approved Stitch parity rules.
createdAt: '2026-03-31T22:18:34.333Z'
updatedAt: '2026-03-31T22:30:20.715Z'
tags:
  - architecture
  - student
  - dashboard
  - ui
  - stitch
---

# Student Dashboard Architecture

## Purpose

This document is the dashboard-specific source of truth for the student dashboard host, feed, right rail, state ownership, and approved Stitch parity boundaries.

It exists because the broader student experience and shell docs are intentionally higher level. Dashboard now has enough page-specific structure that it needs its own contract.

## Approved Anchors

Dashboard follows two approved references:
- `.stitch/designs/student-overhaul-from-academic-record-20260331/dashboard.html`
- `.stitch/designs/student-overhaul-20260331/academic-record.html`

Rules:
- use the dashboard Stitch export for dashboard-specific anatomy
- use Academic Record as the tonal and spacing anchor for the wider student family
- preserve the real route structure, product information architecture, and live behaviors from the app
- do not literal-copy placeholder labels, routes, or fake content from Stitch

## Component Ownership

Dashboard is split into one host page and two presentational surfaces.

Host:
- `src/pages/StudentDashboardPage.jsx`

Presentational surfaces:
- `src/components/dashboard/StudentDashboardFeedView.jsx`
- `src/components/dashboard/StudentDashboardRightRail.jsx`

Sidebar parity is also part of dashboard feel:
- `src/components/layout/StudentSidebar.tsx`

Ownership rules:
- `StudentDashboardPage.jsx` owns data loading, derived dashboard view models, and interaction state
- `StudentDashboardFeedView.jsx` renders the center canvas only
- `StudentDashboardRightRail.jsx` renders the dashboard-specific narrative rail only
- presentational components must not reacquire shell-owned or page-owned data on their own

## Center-Canvas Contract

The required order for the center canvas is:
1. masthead with light utilities
2. frameless metric strip
3. slim editorial tab row
4. timeline feed

Interpretation rules:
- search, unread filter, and academic-history action stay visually light
- the metric strip sits above the tabs
- the feed reads as a vertical timeline rather than a card grid
- spacing and typography do most of the structural work

Disallowed regressions:
- toolbar-heavy header rows
- boxed KPI cards above the feed
- tabs above the summary strip
- nested CTA cards inside feed rows

## Feed Row Variants

Dashboard feed rows intentionally use explicit event-row contracts.

### Result / Test Rows
- sparse and score-led
- quiet eyebrow and timeline date
- strong title
- restrained summary copy
- one clear result action

### Homework Rows
- one quiet inset excerpt or meta surface
- no chip stacks as the default metadata treatment
- support copy remains concise and derived from real assignment metadata

### Class Update Rows
- mostly textual update
- one restrained action
- no dashboard-card framing

Generic event-card rendering is not an acceptable fallback when parity work touches dashboard feed presentation.

## Right-Rail Contract

Dashboard right rail is not a stack of generic shell widgets.

It is a grouped editorial aside with one primary summary surface and quieter supporting modules.

Required composition:
- `Feed Snapshot` as the primary section
- `Weekly Focus` and `Up Next` composed as one narrative family
- `Public Sessions` as a secondary sparse list

Rules:
- preserve shell-owned data sources while changing the presentation
- keep the rail quieter than the center canvas
- avoid repeated card shells that make the aside read like three separate widgets

## Sidebar Constraints

Dashboard visual parity includes the sidebar tone, but not a rewrite of the product IA.

Rules:
- preserve the real student navigation structure and destinations
- use smaller uppercase editorial labels
- use a thin, quiet active treatment instead of a heavy pill
- keep `Join Class` as a utility action, not a dominant hero CTA

## State And Data Ownership

Dashboard-owned state:
- current feed filter tab
- search query
- unread-only filter state
- public-session expansion state
- join-class modal state
- selected result panel state

Dashboard-owned datasets:
- paginated notifications
- notification subscriptions
- public session discovery rows

Shell-owned summaries consumed by dashboard:
- enrolled class membership summaries
- live-session summaries
- homework summary groups used for metrics and urgency queues

Derived view models must be assembled in `StudentDashboardPage.jsx` before being passed to feed and rail surfaces.

## Verification Boundary

Dashboard parity is considered correct only when both are true:
- the dashboard feels faithful to the approved Stitch anatomy
- the implementation stays connected to real product routes, data, and actions

Verification checklist:
- feed order matches the center-canvas contract
- metric strip remains above tabs
- feed rows use explicit row variants
- right rail reads as one narrative aside
- no duplicate shell data ownership is introduced
- no placeholder Stitch IA replaces real app structure

## Related Docs

- @doc/design/student-view-design-standard
- @doc/architecture/student-experience-architecture
- @doc/architecture/student-shell-right-rail-architecture
- @doc/architecture/student-shell-data-loading-architecture
