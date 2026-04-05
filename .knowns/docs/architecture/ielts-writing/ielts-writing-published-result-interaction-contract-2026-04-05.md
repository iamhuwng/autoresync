---
title: IELTS Writing Published Result Interaction Contract 2026-04-05
description: Architecture note for the 2026-04-05 result-surface standardization pass covering published viewer overlay geometry, student feedback-rail structure, and teacher correction visibility across read-only IELTS Writing result surfaces.
createdAt: '2026-04-05T14:14:25.033Z'
updatedAt: '2026-04-05T18:43:30.018Z'
tags:
  - architecture
  - ielts
  - writing
  - results
  - annotations
  - viewer
---

# IELTS Writing Published Result Interaction Contract 2026-04-05

## Purpose

Record the read-only interaction contract for published IELTS Writing markup after the result-surface standardization pass.

## Shared published viewer contract

- `WritingPublishedMarkupViewer` is the common read-only markup reader for both student and teacher result surfaces.
- Tooltip geometry is shared with the grading essay editor at the placement-contract level:
  - mount through a body portal
  - anchor from viewport coordinates
  - clamp to viewport bounds
  - choose the nearest intelligible side in this order: right, left, bottom, top
- Scroll and resize dismiss tooltip state instead of leaving stale detached overlays onscreen.

## Student surface contract

- The published right rail is a `Feedback` rail, not a comments-only rail.
- Published comments and published corrections remain in one read-only rail but render as separate ordered sections.
- Clicking highlighted essay text still opens the published-feedback rail and preserves cross-column anchor alignment.

## Teacher surface contract

- Teacher result readers do not reuse grading-editor interaction state.
- Teacher result readers must pass both published comments and published corrections into the shared published markup viewer.
- Corrections-only tasks still count as published markup and must not fall back to plain essay rendering just because there are no comment records.

## Non-goals

- Do not import grading-editor-only authoring semantics into read-only result surfaces.
- Result surfaces do not gain correction editing, comment drafting, or correction-owned sidebar routing from this pass.

## Related docs

- @doc/architecture/ielts-writing/ielts-writing-grading-editor-state-and-compatibility-2026-04-02
- @doc/architecture/ielts-writing/ielts-writing-essay-editor-tool-contract-and-mark-composition-2026-04-02
- @doc/specs/ielts-writing-result-surfaces-2026-03-30

## 2026-04-06 follow-up: local feedback-rail reveal contract

- Read-only result readers now share the same local-rail reveal rule as the grading page for annotation selection.
- Selecting a published annotation may move the feedback rail, but it must not rely on page-level `scrollIntoView()` behavior to chase the matching card.
- When explicit anchor geometry is available, the rail still aligns the selected feedback header against the essay-side anchor.
- When anchor geometry is unavailable, fallback reveal now scrolls the feedback rail viewport itself instead of moving the whole page.
- This preserves the cross-column mental model on student and teacher result surfaces while avoiding viewport jumps that make the selected essay text hard to follow.
