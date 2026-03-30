# IELTS Writing Architecture Pack

This folder is the architecture front door for the IELTS Writing domain.

Use it when work touches:
- Writing test creation or delivery
- teacher grading and re-grade flows
- student Writing result surfaces
- Writing-specific persistence, compatibility, or visibility rules

This pack does not replace the detailed PRD/spec/audit documents. It gives the shortest reading path and points to the detailed source-of-truth docs.

## Reading Order

1. `lifecycle-and-surfaces.md`
2. `contracts-and-governance.md`

## What This Pack Covers

- the active Writing lifecycle from submit to published result
- the current teacher and student surfaces
- the canonical storage contract
- how Writing relates to the generic result-view shell and visibility systems
- which older assumptions are now superseded

## Domain Rules

- IELTS Writing is a manual-grading domain, not an auto-graded result flow.
- Firestore `writing_submissions/{submissionId}` is canonical for grading state.
- RTDB `test_results` remains a discovery, release, and compatibility layer.
- Pure Writing post-submit flow is acknowledgement-first, not immediate result review.
- Writing result readers are dedicated Writing surfaces, not generic score/review/feedback shells.

## Source Documents

Primary references:
- `../../tasks/0030-prd-ielts-writing-test-system.md`
- `../../tasks/0042-writing-result-redesign.md`
- `../../../.knowns/docs/specs/ielts-writing-grading-editor-finalization-2026-03-30.md`
- `../../../.knowns/docs/specs/ielts-writing-result-surfaces-2026-03-30.md`
- `../../../.knowns/docs/architecture/scheme/ielts-writing-current-state-scheme.md`
- `../../../.knowns/docs/architecture/architecture-ielts-writing-grading-submit-compatibility-audit-2026-03-29.md`

Related shared architecture docs:
- `../result-view/README.md`
- `../results-academic-record.md`
- `../result-visibility-ownership-governance.md`
- `../result-view-permission-matrix.md`

## Update Rules

- If a Writing lifecycle state or host surface changes, update `lifecycle-and-surfaces.md`.
- If storage, release gating, ownership, or compatibility rules change, update `contracts-and-governance.md`.
- If the source-of-truth spec moves, update the links in this README.
