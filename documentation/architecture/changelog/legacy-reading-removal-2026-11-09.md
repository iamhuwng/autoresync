# Legacy Reading V1 removal

Changelog ID: `CL-20261109-LEGACY-READING-REMOVAL`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Problem

Reading V2 had replaced the retired flat IELTS Reading implementation, but its
authoring, runtime, parser, editor, scripts, tests, routes, and documentation
still occupied the codebase and could create a second path by accident.

## Change

- Removed the legacy Reading runtime, scoring, passage detection, mobile state,
  editor panels, parser/review pipeline, draft hooks, producer scripts, routes,
  and obsolete documentation.
- Removed Reading-shaped CRUD and test code from shared storage while keeping
  Reading V2 projections, trusted submit, audit paths, results, and current
  authoring/runtime boundaries.
- Added fail-closed routing and editor guards so retired Reading payloads cannot
  enter Listening or the old flat editor.

## Scope

The worktree report records 63,645 deleted and 370 added tracked lines across
the Reading retirement and adjacent approved cleanup. No remote data or deployed
service was changed.

## Verification

- `git diff --check` passed.
- Touched-file ESLint passed.
- Full TypeScript checking reaches only the pre-existing worktree dependency
  junction error in `src/test/test-utils.tsx` (`TS2742`).
- Browser QA and completed Vitest runs remain unavailable in this managed
  worktree; no runtime acceptance is claimed here.
