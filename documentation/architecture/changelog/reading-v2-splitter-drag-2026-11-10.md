# Reading V2 splitter drag repair

Changelog ID: `CL-20261110-READING-V2-SPLITTER-DRAG`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Problem

The desktop Reading V2 passage/question divider used a moving native range
input. Pointer drags could lose the moving target and jump between the 30% and
70% limits instead of tracking the pointer smoothly.

## Change

- Replaced the moving range input with the existing `react-resizable-panels`
  `PanelGroup` and `PanelResizeHandle` primitives.
- Preserved the 50/50 default split and the 30%–70% limits for both panes.
- Added separator semantics, keyboard reachability, and enlarged pointer hit
  margins while keeping the visible divider at 10px.
- Added a focused splitter accessibility regression test.

## Verification

- Reading V2 runtime suite: 72 tests passed.
- Focused splitter regression rerun: 1 passed.
- Production build and bundle budget: passed.
- Local browser verification at `http://localhost:5174`: real pointer drag
  moved the divider from 50% to 70% and back to 31%; question controls stayed
  present and document width remained within the viewport.
- Source commit: `d78b91d5`.

## Release status

Merged into local `main` at `d78b91d5`. Production deployment is blocked by
release safety because the live Hosting manifest reports deployed revision
`23ae29a79f816b27a551071345d700988b043bc7`, but that exact commit is not
available locally or from `origin`, so the guarded assessment cannot establish
the required source baseline. No production mutation was performed.
