---
title: Student Mobile Responsiveness Architecture
description: Canonical architecture contract for student-shell mobile responsiveness after PRD-0044, covering shared shell primitives, route hosting, drawers, overlays, touch targets, and verification boundaries.
createdAt: '2026-04-12T00:46:37.095Z'
updatedAt: '2026-04-12T00:46:37.095Z'
tags:
  - architecture
  - student
  - mobile
  - responsive
  - shell
---

# Student Mobile Responsiveness Architecture

## Purpose

This document captures the durable architecture contract that came out of PRD-0044 so future student-shell work does not have to reconstruct mobile behavior from task history.

## Core Model

Student mobile is a supplement to the desktop workspace, not a separate product.

Required rules:
- desktop at `>=1025px` remains the reference composition unless a PRD explicitly changes desktop
- mobile may stack, collapse, truncate, drawerize, or convert overlays, but it must preserve the same route semantics, page purpose, and data owner as desktop
- the student right rail remains structurally present on shell pages even when moved into a drawer

## Shared Shell Primitives

`StudentLayout` owns the shared mobile shell behavior for student pages that use the workspace language.

Shared primitives:
- `mobileTitle` for the visible mobile title and browser-title ownership on shell pages
- feed/content inset of `16px 12px 24px`
- mutually exclusive left and right drawers
- hidden-scrollbar treatment for intentional horizontal rows
- visible shell controls sized to `44px x 44px`
- right-rail drawer width contract of `min(320px, 85vw)` with `minWidth: 0` and `maxWidth: 85vw`

`studentLayoutStyles.ts` exports the shared responsive helper set through `mobileStyles`.

Approved helpers:
- `feedPadding`
- `fullWidthButton`
- `singleColumnGrid`
- `stackVertical`
- `touchTarget`
- `hiddenScrollbar`
- `feedSubtitleHidden`

## Route And Hosting Contract

PRD-0044 established that mobile behavior depends on route hosting, not only CSS.

Shell-hosted routes that preserve their public URLs:
- `/student/homework/:homeworkId`
- `/student/results/:sessionCode`

Layout-hosted but not shell-routed:
- `/student-test-results/:sessionCode`

Rule:
- public student URLs and their semantics remain part of the product contract unless a PRD explicitly approves a path change
- if a path changes, keep routes, security, feature registry, and focused route tests synchronized in the same edit set

## Overlay Contract

Student mobile overlays preserve the same desktop workflow while adapting layout.

Required rules:
- long-content or confirmation-heavy overlays should use full-viewport or bottom-sheet mobile presentations
- scrollable overlay bodies scroll internally
- sticky bottom action bars are the default when the body scrolls
- visible modal actions must satisfy the shared `44px` target floor
- `100dvh` with `100vh` fallback is the approved pattern when viewport-height stability matters

## Verification Boundary

Minimum responsive verification widths:
- `1440px` when shared shell composition, route placement, or title alignment changes
- `375px` for baseline phone verification
- `320px` when drawers, headers, overlays, or dense controls are touched

Required checks:
- no unintended horizontal overflow
- visible controls satisfy the `44px` floor
- drawers remain mutually exclusive and readable
- overlays keep explicit dismiss behavior and usable actions
- canonical and supported legacy routes still direct-load and refresh correctly

## Related Docs

- @doc/design/student-view-design-standard
- @doc/architecture/student-experience-architecture
- @doc/architecture/student-shell-right-rail-architecture
- @doc/architecture/student-shell-data-loading-architecture
- @doc/architecture/student-dashboard-architecture
- @doc/architecture/mobile-ielts-reading-test-taking
