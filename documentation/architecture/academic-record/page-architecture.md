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

Academic Record participates in the persistent student shell provider defined in `documentation/architecture/student-shell-data-loading.md`.

Required ownership split:
- the shared student shell owns shell-global summaries such as enrolled classes, live-session summaries, and shared homework summary groups
- `AcademicRecordPage` owns the page-primary academic-record dataset for overview, THCS, IELTS, and Course surfaces, including integrated writing results inside IELTS
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

Overview blocks use a single clear heading per section. Helper subtitles are intentionally omitted.

Course, skill, and type are no longer rendered as overview browse modules in the current page implementation.

### Current Top-Level Views

Academic Record currently exposes these top-level center-column views:
- Overview
- THCS
- IELTS
- Course

Rules:
- THCS remains a focused progression workspace
- IELTS is the skill-organized browsing surface and now contains the writing progression and pending-review workflow inside its writing group
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
- use calm white summary cards with subtle top accents for lightweight statistics
- use white bordered full-width rows for grouped browsing and result items
- rely on spacing, badges, and short action labels for hierarchy instead of helper text
- visual distinction comes from role and density, not from separate design systems
- do not place helper text under section headings
- avoid nested bordered boxes inside bordered boxes
- self-framed widgets must not be wrapped in another bordered section shell or duplicate heading; the parent should provide spacing only
- avoid chart-heavy wrappers unless a metric contract requires them

Academic Record should not rely on the generic glass `ResultCard` pattern for its center-column result surfaces.

### Track-Specific Simplification

Specialized tabs may keep their own progression semantics, but they should still express them with the shared record language.

Current expectations:
- Overview, THCS, and IELTS follow the same summary-first visual system established by Course
- THCS uses the same calm summary-card treatment, lightweight skill cards, and flat history rows
- IELTS uses the same summary-card treatment in two tiers, then grouped skill rows, with writing-specific review states inside the writing group
- Course remains the reference browse pattern for grouped row surfaces in Academic Record

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
- What is my current IELTS summary at a glance?
- Which writing submissions are still pending review?
- Which skill area should I open next?

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