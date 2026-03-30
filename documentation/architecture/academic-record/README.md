# Academic Record Architecture Pack

This folder is the architecture front door for the Academic Record domain.

Use it when work touches:
- the student Academic Record main page
- long-term result history and progression surfaces
- the current top-level tabs: Overview, THCS, IELTS, Writing, and Course
- record-derived analytics, recommendations, or proficiency inputs
- how Academic Record consumes saved results without distorting scoring semantics

This pack does not replace the broader result-storage or visibility docs. It defines the Academic Record feature itself: what the page is, how progression should be represented, and what analytics are safe to expose.

## Reading Order

1. `page-architecture.md`
2. `progression-model.md`
3. `analytics-readiness.md`

## What This Pack Covers

- the page's role inside the student shell
- the center-column information architecture
- the current tab model and what each tab means
- the distinction between raw result history and progression signals
- the shared row-language used across Overview, IELTS, Course, THCS, and Writing
- what analytics are stable now versus recommendation-ready later

## Domain Rules

- Academic Record is a core student-facing system, not a secondary saved-results utility.
- The center feed owns the page's primary information architecture.
- The shell-owned right rail is supplemental only.
- Overview is the default landing surface.
- THCS, IELTS, Writing, and Course are top-level Academic Record views in the current implementation.
- The page uses one native record-row language across its center-column surfaces instead of mixed card styles.
- Flat tonal separation is preferred over nested bordered boxes, glass styling, or chart-heavy panels.
- Lightweight summary metrics are allowed now; heavy analytics remain deferred until metric contracts mature.

## Source Documents

Primary references:
- `../../../.knowns/docs/architecture/academic-record/academic-record-page-architecture.md`
- `../../../.knowns/docs/architecture/academic-record/academic-record-progression-model.md`
- `../../../.knowns/docs/architecture/academic-record/academic-record-analytics-readiness.md`
- `../../../.knowns/docs/prd/prd-academic-record.md`

Related shared architecture docs:
- `../results-academic-record.md`
- `../result-view/README.md`
- `../result-visibility-ownership-governance.md`
- `../homework-solo-practice-architecture.md`

## Update Rules

- If the Academic Record main-page structure or tab hierarchy changes, update `page-architecture.md`.
- If the progression semantics, promoted lenses, or latest-result rules change, update `progression-model.md`.
- If analytics, recommendation inputs, or evidence rules change, update `analytics-readiness.md`.
- If saved-result storage or visibility contracts change, update the shared root docs instead of duplicating them here.
