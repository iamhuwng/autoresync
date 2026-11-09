# Listening legacy facade removal

Changelog ID: `CL-20261109-LISTENING-FACADE-REMOVAL`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Problem

Listening had an obsolete `listeningTestStorage` CRUD facade and deprecated
generic parser/editor compatibility props even though the current builder and
authoring workflow were already authoritative.

## Change

- Removed `src/services/listeningTestStorage.ts` and its tests.
- Moved active Listening types and audio-control presets to
  `src/types/listening.types.ts`.
- Replaced the generic bulk-question parser with the Listening-scoped parser.
- Removed unused `AudioPlayer` compatibility props and preserved the current
  `audioControls` contract.
- Fixed the four pre-existing Listening diagnostics in authoring/runtime code.
- Fixed editor dirty-state detection for resource, duration, and visibility
  changes so cancel cannot silently discard those edits.

## Retained compatibility boundaries

Historical public R2 audio reads, first-edit freezing of old Listening rows,
`audioCommand` compatibility, stale temporary URL detection, and old persisted
state normalization remain intentionally read-only or fail-safe. Removing them
requires a separate retained-record inventory and migration proof.

## Verification

- No active source references to `listeningTestStorage` or the removed audio
  props remain.
- Touched-file ESLint and `git diff --check` passed.
- Full TypeScript checking reaches only the unrelated `TS2742` worktree
  dependency error in `src/test/test-utils.tsx`.
- Browser QA and completed Vitest runs remain unavailable in this managed
  worktree.
