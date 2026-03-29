# Result View Architecture Pack

This folder is the current map for PRD-0040 and PRD-0041 result-view work.

Use this pack for new development and regressions in saved-result flows. The older split docs in `documentation/architecture/` remain historical references, but this folder is the concise entry point.

## Scope

This pack covers:

- the saved-result shells and their ownership boundaries
- the visibility and ownership rules that govern teacher access
- the current implementation status of the shared result-view runtime

This pack does not re-specify session orchestration, grading internals, or unrelated monitor workflows.

## Reading Order

1. `surface-map.md`
2. `visibility-policy.md`
3. `verification-matrix.md`

## Core Model

- `SharedSavedResultCore` is the shared saved-result body.
- Shells own routing, container chrome, access checks, and release-state gates.
- Teacher access is based on authoritative ownership resolution, not raw convenience fields.
- Solo practice is student-owned. Teacher visibility there is read-only and must not be counted as teacher-owned work.
- Unresolved rows stay out of teacher-owned history and analytics.

## Update Rules

- If a new result surface is added, update `surface-map.md`.
- If ownership or teacher visibility rules change, update `visibility-policy.md`.
- If runtime behavior changes, update `verification-matrix.md`.
