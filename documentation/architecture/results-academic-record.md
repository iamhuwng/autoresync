# Results Academic Record Architecture

This document no longer defines result visibility locally.

Canonical visibility governance now lives in:
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/result-visibility-producer-consumer-contract.md`
- `documentation/architecture/result-view-permission-matrix.md`

Writing-specific architecture now has its own packet:
- `documentation/architecture/ielts-writing/README.md`

Academic Record feature architecture now has its own packet:
- `documentation/architecture/academic-record/README.md`

## Academic Record Alignment

- Student history remains student-complete, including unresolved legacy rows that the student is still entitled to view.
- Teacher-facing filtering is not allowed inside academic-record-style pages or local UI helpers.
- Historical display labels must prefer `result.visibility.sourceNameSnapshot`.
- Deleted-source display is allowed only when ownership was proven at submission time.
- Retired Google Drive, Reading V1, and Quiz source records may be unavailable after purge. Completed academic results remain retained when access is authorized, but Source Review may be unavailable and Answer Review must rely on saved result snapshots. See `documentation/architecture/retired-features-current-state.md`.

## Required Consumption Rules

- `result.visibility` is the canonical visibility contract.
- Read-time legacy enrichment happens in shared services only.
- Teacher-specific inclusion, solo-practice tagging, unresolved exclusion, and analytics exclusion come from `src/services/resultVisibility.service.ts`.
- Raw `result.teacherId` is not an authority signal.


## 2026-03-30 Amendment - IELTS Writing Comment Rail Alignment

For the IELTS Writing student result slide modal in wide two-column mode:

- clicking highlighted essay text must force-open the right-side `Comments` tab
- the comments rail must move as one block, not by overlaying or detaching the selected comment
- the selected comment remains in normal list order
- the right-side visual anchor is the selected comment header row
- the left-side visual anchor is the clicked annotation top line
- the intended steady-state is `selected comment header top == clicked annotation top`

This supersedes earlier approximate-scroll and center-based descriptions.

Verification reference:
- direct student result route `?result=-OosUDrZdaDhAb6vxk34`
- measured live result across multiple annotations: `deltaHeaderTop = 0px`

## 2026-03-30 Amendment - Grading Tool Mirrors The Same Header-Top Rule

The teacher IELTS Writing grading editor now mirrors the same header-top alignment contract used by the wide student Writing result slide modal.

For the grading tool:
- clicking highlighted essay text must force-open `Comments`
- the whole comments rail moves as one block
- the selected comment remains in normal list order
- the alignment target is `selected comment header top == clicked annotation top`
