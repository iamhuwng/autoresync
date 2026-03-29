---
title: 'Pattern: Compact Study Recommendation Cards in Result Feedback'
description: Compact, summary-first design pattern for AI study recommendations inside saved-result feedback tabs, including current Academic Record behavior, interaction boundaries, and known limitations.
createdAt: '2026-03-29T04:45:10.352Z'
updatedAt: '2026-03-29T04:45:38.269Z'
tags:
  - pattern
  - results
  - feedback
  - student
  - ui
  - academic-record
---

# Pattern: Compact Study Recommendation Cards in Result Feedback

## Problem

The Academic Record result modal already has multiple feedback surfaces in one view: AI summary, strengths/revision/critical sections, score trend, class position, and the `What to Study Next` box. The original study-recommendation card could become the tallest block in the feedback tab because every recommendation exposed the full guidance sentence plus full resource details at once.

That produced two recurring UX problems:
- The recommendation box visually dominated the feedback tab and pushed other feedback lower in the scan order.
- Students were hit with too much remediation detail before they understood the top priority.

## Findings

### Root cause
The recommendation UI was optimized for completeness, not scanability. Every recommendation rendered as a full card with:
- skill tag
- question list
- full guidance sentence
- full book/resource metadata
- all resources expanded by default

### Product-level constraint
This component lives inside an existing saved-result shell. The surrounding modal, tab system, and feedback layout are shared across multiple result surfaces. Redesigning the recommendation area must not drift the shell or change the layout contract of neighboring widgets.

### Interaction constraint
`What to Study Next` is advisory content, not the primary content of the tab. It must support the feedback flow rather than compete with it.

## Solution

Adopt a summary-first, details-on-demand card pattern.

### Default row structure
Each recommendation should default to a compact summary row that exposes only the minimum decision-making information:
- priority number
- skill tag
- one derived focus label
- up to 3 `Q` chips for question references
- one `Start:` line pointing to the primary section
- a small expand affordance (`Why` or `+N`)

### Expanded state
Secondary detail moves behind an explicit expand action:
- the full `Why:` explanation
- the primary resource detail block
- any additional resources

### Copy compression rules
- Replace long intro paragraphs with a small state badge such as `Top priorities` or `Stretch targets`.
- Prefer short focus labels over repeating the full guidance sentence in the default state.
- Show only the first resource in the summary state; everything else is subordinate.

## Current Implementation State

As of 2026-03-29, the Academic Record feedback tab uses this pattern in the live result-view implementation.

### Runtime behavior
- `StudyRecommendations.tsx` normalizes AI study recommendations and derives a compact `focusLabel` from the guidance text.
- Recommendations render as `<details>` rows, which keeps the default UI collapsed and compact.
- The primary resource is promoted into the summary row through the `Start:` line.
- Extra resources remain available, but only after expansion.
- The feedback shell and surrounding modal structure are intentionally unchanged.

### Display states
- Normal result state uses the `Top priorities` badge.
- Perfect-score/stretch state uses the `Stretch targets` badge.
- Legacy rows without `questionNumbers` still render safely.

### Verification state
Focused tests cover:
- compact summary rendering
- stretch-state rendering
- legacy recommendation safety
- result-tab integration assertions updated for duplicated visible titles in summary + details states

## Interaction Boundaries

### Intentionally unchanged surfaces
This redesign should stay scoped to the recommendation widget and its local styles.

Do not treat this work as permission to redesign:
- `ResultSlidePanel`
- the feedback tab shell
- neighboring AI analysis blocks
- score trend layout
- class position layout
- tab chrome or modal proportions

### Safe implementation boundary
A safe implementation can usually stay within:
- `src/components/results/StudyRecommendations.tsx`
- recommendation-specific selectors in `src/components/results/FeedbackTab.css`
- related component tests

## Known Issues and Tradeoffs

### Heuristic focus labels
The compact `focusLabel` is inferred from guidance text (`Tense`, `Evidence`, `Structure`, etc.). This is intentionally lightweight but not semantically perfect. If recommendation quality becomes more important later, the label should come from structured AI output rather than keyword heuristics.

### Duplicated visible titles
The same resource title can appear in both the summary row and expanded content. This is acceptable for UX, but tests must not assume those strings are unique in the DOM.

### HTML details behavior
Using native `<details>` keeps the interaction simple and low-JS, but styling and disclosure behavior can vary slightly across browsers. Tests and manual smoke checks should verify the collapsed/expanded rhythm in the actual result modal.

### Mobile tradeoff
The compact summary remains dense on mobile. The current CSS collapses the layout to two columns and hides the separate expand column, but this is still a high-density card rather than a full mobile redesign.

## Problems with Other Interactions

### Feedback-tab competition
If adjacent widgets grow taller again, the recommendation area can still contribute to vertical crowding. This pattern reduces pressure; it does not eliminate the need to monitor total feedback-tab density.

### AI payload variability
This UI depends on recommendation payload quality. Weak or verbose guidance text can still hurt the expanded view, even if the collapsed summary is tidy.

### Shared-surface expectations
Because this component is reused in saved-result flows, changes here can affect both student and teacher result views that rely on the same feedback component stack. Any future redesign must verify cross-surface parity instead of assuming Academic Record is isolated.

## Working Standard

Use this pattern when a result-feedback recommendation widget has to show actionable remediation without overwhelming the rest of the feedback experience.

Default rule:
- show priority + focus + first action
- hide explanation and secondary resources until asked
- preserve the surrounding result shell

## Source

Source session: 2026-03-29 Academic Record result modal `What to Study Next` compaction.

Primary source files:
- `src/components/results/StudyRecommendations.tsx`
- `src/components/results/FeedbackTab.css`
- `src/components/results/StudyRecommendations.test.tsx`
- `src/components/results/FeedbackTab.test.tsx`
