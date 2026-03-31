---
title: Academic Record Page Architecture
description: Source of truth for the student Academic Record page structure, view hierarchy, shell ownership, and interaction contracts.
createdAt: '2026-03-30T14:53:47.266Z'
updatedAt: '2026-03-31T08:59:42.172Z'
tags:
  - architecture
  - academic-record
  - student
  - ui
  - results
---

# Academic Record Page Architecture

## Purpose

The Academic Record page is the student-facing system of record for long-term learning history.

It is where students should understand:
- what they have completed
- how they are progressing
- where each result belongs in course, skill, and assessment context
- what they should review next

Academic Record sits between raw result persistence and future recommendation systems. It therefore needs a stable information architecture instead of a temporary page layout built around one subdomain.

## Route And Host

Route:
- `/student/academic-record`

Host rules:
- rendered inside the shared student shell
- uses the center feed as the primary content surface
- may use the right rail only for supplemental content through shell extension points

The right rail must not become the page's primary navigation or main content container.

## Shell Ownership Boundary

Academic Record participates in the persistent student shell provider defined in @doc/architecture/student-shell-data-loading-architecture.

Required ownership split:
- the shared student shell owns shell-global summaries such as enrolled classes, live-session summaries, and shared homework summary groups
- `AcademicRecordPage` owns the page-primary academic-record dataset for overview, THCS, IELTS, Writing, and Course surfaces
- entering or leaving Academic Record must not recreate shell-owned loaders already owned by the shell provider

This keeps shell navigation responsive while preserving Academic Record as the canonical host for record history.

## Current Page Hierarchy

### Default Main Surface

The default landing state is the Overview surface, not THCS-specific content.

The overview currently prioritizes:
- a small set of stable summary statistics
- progressive feedback
- recent meaningful results

Approved overview blocks in the current implementation:
- total tests
- average score
- best score
- progressive feedback summary
- recent results timeline

Course, skill, and type are no longer rendered as overview browse modules in the current page implementation.

### Current Top-Level Views

Academic Record currently exposes these top-level center-column views:
- Overview
- THCS
- IELTS
- Writing
- Course

Rules:
- THCS remains a focused progression workspace
- Writing remains a first-class center-column surface
- IELTS is currently promoted as a top-level skill-organized browsing surface
- Course is currently promoted as a top-level course-organized browsing surface
- the historical By Type browse lens is removed from the current page IA

### Result Detail Surface

Opening a result preserves the Academic Record page as the host context.

Current detail contract:
- result selection is represented by `?result=<resultId>`
- route state may normalize into that query param
- closing the detail surface clears the query param

This keeps result access deep-linkable without replacing the page itself.

## Information Architecture Rules

### Primary Views Belong In The Center Feed

Primary views are major learning surfaces. They belong in the center feed and are reachable through the page's own top-level controls.

### Shared Record Language

All main Academic Record views should use one native record presentation language.

Current UI rules:
- use flat full-width rows for result items
- use quiet tonal section headers instead of glassy cards
- use tonal panels for lightweight summary statistics
- avoid nested bordered boxes inside bordered boxes
- avoid chart-heavy wrappers unless a metric contract requires them

Academic Record should not rely on the generic glass `ResultCard` pattern for its center-column result surfaces.

### Track-Specific Simplification

Specialized tabs may keep their own progression semantics, but they should still express them with the shared record language.

Current expectations:
- THCS uses simple stats, lightweight skill summary, and flat history rows
- IELTS uses grouped skill sections with flat rows
- Writing uses lightweight summary panels and flat writing rows
- Course uses grouped course sections with flat rows

### Avoid Dashboard Sprawl

The page should avoid chart-heavy dashboard behavior until metric contracts are stable enough to support it.

Deferred for now:
- dense analytics dashboards
- decorative charts that do not change user action
- blended cross-domain visuals that flatten IELTS and THCS semantics into a single misleading signal

## Current Data And Component Contract

Current page data sources:
- `getFilteredResults(...)`
- `getLatestResultPerTest(...)`
- `getProgressiveFeedback(...)`
- `refreshProgressiveFeedback(...)`

Current major surface components:
- `AcademicRecordResultRow`
- `ResultTimeline`
- `ResultsByCourse`
- `ResultsBySkill`
- `THCSProgressTab`
- `WritingProgressSection`
- `ResultSlidePanel`

`ResultCard` remains available elsewhere in the codebase, but it is not the intended center-column rendering primitive for Academic Record.

## View Semantics

### Overview

Overview should answer:
- How much work have I done?
- What is my recent level of performance?
- What should I open first?

### THCS

THCS should answer:
- How am I progressing in the THCS-specific pathway?
- What does my history look like in a THCS learning context?

### IELTS

IELTS should answer:
- How do my latest results look when grouped by reading, listening, writing, and speaking?
- Which skill area should I open next?

### Writing

Writing should answer:
- What writing work has been reviewed?
- Which submissions are still pending review?
- Which writing result should I reopen first?

### Course

Course should answer:
- How does my latest result history organize by course?
- Which course context should I inspect next?

## Extension Rules

When future capabilities are added, keep these rules:
- preserve overview readability first
- do not move primary page IA into the right rail
- add recommendation modules only when they can explain their evidence
- prefer progressive disclosure over a single overloaded dashboard
- only restore additional browse surfaces when they simplify the page instead of fragmenting it

## Data Ownership And Loading Contract

Academic Record is the host owner for center-column record data.

Required rules:
- `AcademicRecordPage` owns the base dataset for overview, THCS, IELTS, Writing, and Course surfaces
- top-level views and tab panels are selectors or presentational surfaces over host-owned data; they do not independently query list data on mount
- summary/read-model payloads are the default list input; full result detail loads only after an explicit detail interaction
- after the first successful load, revisits keep prior content visible and refresh in the background instead of returning to a full blocking spinner
- page mount, tab switch, and list load must not perform repair, backfill, or other persistent writes
- shell entry into Academic Record must reuse the persistent shell provider instead of recreating shell-global summary loaders

Any future Academic Record browse lens or widget must state:
- whether it consumes summaries or full detail
- which host owns the underlying data
- which governance rule and pattern doc justify the loading shape

Required companion docs:
- @doc/architecture/results-academic-record
- @doc/architecture/student-shell-right-rail-architecture
- @doc/architecture/student-shell-data-loading-architecture
- @doc/patterns/pattern-summary-first-detail-on-demand
- @doc/patterns/pattern-bulk-enrichment-from-shared-student-history

## Current Loading Implementation

As of 2026-03-31, Academic Record follows the host-owned loading contract in the current implementation.

Current implementation anchors:
- `AcademicRecordPage` owns the canonical results list for overview, IELTS, Writing, and Course surfaces
- THCS progression is loaded once by the host via `getThcsProgress(...)` and passed into `THCSProgressTab` as data props
- `WritingProgressSection` is now a presentational surface over host-owned writing results rather than a Firestore-owning tab component
- progressive feedback uses a stale-first read on mount and only auto-refreshes when the stored record is already due
- shell-level classes, live-session summaries, and homework summary groups remain owned by the persistent student shell provider across route switches

This keeps tab switches in the center column as view changes rather than new ownership boundaries and prevents shell remount work from leaking into Academic Record.

## First-Entry Warmup Contract

Academic Record remains page-owned for its center-column record dataset even when the student shell prefetches the route.

Rules:
- shell prefetch only removes first-entry cold-start cost
- the page host still owns result history, THCS progress, and progressive-feedback cache policy
- warmup must not pull Academic Record ownership into the shell provider

## Startup Segmentation Boundary

Academic Record participates in student-first startup optimization only at the page-entry boundary.

Rules:
- shell warmup may preload the Academic Record route and page-owned cache
- result panels and deeper writing-result internals load on demand when a result is opened
- base Academic Record entry must stay free of `chart-vendor`, PDF, and export-only runtime cost during default student login

Related startup contract:
- @doc/architecture/student-startup-bundle-segmentation
