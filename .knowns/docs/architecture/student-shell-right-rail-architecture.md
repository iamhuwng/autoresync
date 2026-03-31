---
title: Student Shell Right Rail Architecture
description: Architecture contract for the shared student shell layout, global right rail, shared data hook, and page-level extension pattern.
createdAt: '2026-03-30T03:14:40.723Z'
updatedAt: '2026-03-31T22:26:47.378Z'
tags:
  - architecture
  - student
  - layout
  - right-rail
---

# Student Shell Right Rail Architecture

## Purpose

This document defines the structural and ownership contract for the right side of the shared student shell.

It exists to keep shell pages aligned on one persistent right-rail model while still allowing approved page-specific rail compositions such as the dashboard.

## Shared Shell Contract

The student shell always preserves three structural regions:
- left navigation rail
- center editorial canvas
- right contextual rail

The right rail is not optional on shell pages. It must remain part of the shared workspace even when a page uses a quieter or more page-shaped rail presentation.

## Ownership

The shell owns the right-rail platform:
- structure and placement belong to `StudentLayout`
- shell-global data remains owned by the student shell data provider
- fallback generic rail rendering belongs to `StudentRightRail`

Pages may own the visible composition inside that region when there is an approved page-specific contract.

## Shell-Owned Data

The shell remains the canonical owner for:
- enrolled class summaries
- active live-session summaries
- homework urgency and upcoming summary groups

Page-specific rails may restate those summaries, but they must not create duplicate loaders for them.

## Dashboard Override Pattern

Dashboard is the canonical right-rail override.

Current implementation anchors:
- `src/pages/StudentDashboardPage.jsx`
- `src/components/dashboard/StudentDashboardRightRail.jsx`

Rules:
- the dashboard rail should read as one grouped editorial aside rather than a stack of reusable widgets
- `Feed Snapshot` is the primary summary surface
- `Up Next` stays within that visual family
- `Public Sessions` is a quieter supporting list
- dashboard-specific presentation may derive from shell-owned summaries plus page-owned feed data, but the shell remains the owner for shell-global right-rail data

## Framing Responsibility

Use one framing owner per surface.

Required rules:
- if a page-specific rail component already frames itself, the shell provides placement and spacing only
- do not wrap self-framed rail content in another bordered shell
- avoid repeated headings and repeated card shells that make the right rail read as stacked widgets

## Mobile and Tablet

On smaller breakpoints the right rail remains part of the shell contract, but it moves into the shared drawer pattern.

Rules:
- preserve mutual exclusion between the left and right drawers
- do not create page-local mobile rail drawers
- keep the same editorial tone rather than reverting to louder widget styling

## Verification Standard

When right-rail work changes:
- verify shell pages still share one structural right-rail region
- verify page-specific overrides do not create duplicate shell-data ownership
- verify the dashboard rail remains grouped and editorial rather than widget-stacked

## Related Docs

- @doc/architecture/student-dashboard-architecture
- @doc/architecture/student-experience-architecture
- @doc/architecture/student-shell-data-loading-architecture
- @doc/design/student-view-design-standard
