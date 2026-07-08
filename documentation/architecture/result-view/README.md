# Result View Architecture Pack

This folder is the current architecture map for PRD-0040 and PRD-0041 result-view work.

Use this pack for new development and regressions in saved-result flows. The older split docs in `documentation/architecture/` remain historical references, but this folder is the concise entry point.

## Scope

This pack covers:

- the saved-result shells and their ownership boundaries
- the visibility and ownership rules that govern teacher access
- current saved-result shell and visibility contracts

This pack does not re-specify session orchestration, grading internals, or unrelated monitor workflows.

For the Writing domain specifically, use the dedicated packet at `../ielts-writing/README.md`.

For retired Google Drive, Reading V1, and Quiz source behavior, use `../retired-features-current-state.md`. Saved-result shells may show retained answer-review data, but must not re-enable retired source review/runtime paths.

## Reading Order

1. `surface-map.md`
2. `visibility-policy.md`
Historical traceability lives in `../changelog/result-view-verification-matrix.md`.

## Core Model

- `SharedSavedResultCore` is the shared saved-result body.
- Shells own routing, container chrome, access checks, and release-state gates.
- Teacher access is based on authoritative ownership resolution, not raw convenience fields.
- Solo practice is student-owned. Teacher visibility there is read-only and must not be counted as teacher-owned work.
- Unresolved rows stay out of teacher-owned history and analytics.

## Update Rules

- If a new result surface is added, update `surface-map.md`.
- If ownership or teacher visibility rules change, update `visibility-policy.md`.
- If runtime behavior changes, update `surface-map.md` or `visibility-policy.md`; append traceability notes to `../changelog/result-view-verification-matrix.md` only when a verification/history record is needed.
