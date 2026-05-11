# Reading V2 Module Invariants

This directory is the Reading V2 service boundary.

Before implementing a PRD-0048 task here, read the packet in the task-list order, starting with:

1. `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
2. `documentation/tasks/PRD0048/assessment-0048-preservation-and-foundational-plan.md`
3. `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
4. `documentation/tasks/findings-of-tasks-0048-prd-reading-v2-studio-and-runtime.md`

Run `npm run check:prd0048-packet` before starting each PRD-0048 parent task.

## Three-Plane Separation

- Canonical plane: authoring truth for documents, stimuli, task groups, interactions, numbering, validation, drafts, and published snapshots.
- Packaging plane: reusable material packaging, passage assets, task-group materials, full tests, provenance, and where-used metadata.
- Delivery plane: derived-only preview, student-safe, session-safe, review, and analytics projections.

## Non-Negotiable Rules

- Canonical Reading V2 documents are the source of truth.
- Projections are generated outputs only and must never become editable content truth.
- Shared platform surfaces may consume published snapshots or projections, never canonical drafts directly.
- Legacy Reading editor, runtime, and scoring code are evidence only; they are not the Reading V2 foundation.
- Unsupported schema versions, unknown task slugs, broken anchors, unresolved placeholders, and invalid ownership must fail closed.

## Phase-1 Boundary Notes

- `src/services/reading-v2/` owns Reading V2-only services and guards.
- `src/components/reading-v2/` owns Reading V2-only studio and runtime components.
- Result review remains owned by `src/components/results/` through adapters; do not create `src/components/reading-v2/review/`.
