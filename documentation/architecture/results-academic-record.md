# Results Academic Record Architecture

This document no longer defines result visibility locally.

Canonical visibility governance now lives in:
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/result-visibility-producer-consumer-contract.md`
- `documentation/architecture/result-view-permission-matrix.md`

## Academic Record Alignment

- Student history remains student-complete, including unresolved legacy rows that the student is still entitled to view.
- Teacher-facing filtering is not allowed inside academic-record-style pages or local UI helpers.
- Historical display labels must prefer `result.visibility.sourceNameSnapshot`.
- Deleted-source display is allowed only when ownership was proven at submission time.

## Required Consumption Rules

- `result.visibility` is the canonical visibility contract.
- Read-time legacy enrichment happens in shared services only.
- Teacher-specific inclusion, solo-practice tagging, unresolved exclusion, and analytics exclusion come from `src/services/resultVisibility.service.ts`.
- Raw `result.teacherId` is not an authority signal.
