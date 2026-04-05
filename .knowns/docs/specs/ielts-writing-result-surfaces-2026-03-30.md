---
title: IELTS Writing Result Surfaces 2026-03-30
description: Source of truth for the redesigned IELTS Writing result surfaces in student and teacher views, including shell mappings, phase model, data contract, approved Stitch references, and superseded guidance.
createdAt: '2026-03-29T23:38:36.812Z'
updatedAt: '2026-04-05T14:16:13.768Z'
tags:
  - spec
  - ielts
  - writing
  - results
  - stitch
  - visibility
---

# IELTS Writing Result Surfaces 2026-03-30

## 1. Status

This document is the source of truth for IELTS Writing result-surface behavior after the Stitch-backed redesign implemented on 2026-03-30.

## 2. Approved Stitch References

Teacher view:
- Pending Review: project `16045306118408829321`, screen `05c0abd5f36f453e9034b03d35ffd66c`
- Published: project `16045306118408829321`, screen `1608486d50c1443b936de8c3d8f82921`

Student view:
- Published baseline: project `6940178863508396499`, screen `1c9d1e92ca12494a8209f308076c7b6b`
- Student amendment accepted after mockup review:
  - `Task Summary` is a separate right-column module and expanded by default.
  - `Criteria Feedback` is in the right column below Task Summary and collapsed by default.
  - The band-score area is compact, not a hero, and must scale to active task count.

## 3. Public Phase Model

Only two public phases exist in both teacher and student result readers:
- `pending-review`
- `published`

Teacher-private draft ownership and lock conflicts are operational states inside `pending-review`. They are not separate public phases.

## 4. Canonical Data Contract

Primary source:
- Firestore `writing_submissions/{submissionId}`
- `publishedGrading` is the canonical published artifact.

Compatibility / fallback rules:
- Firestore `grading` and `annotations` are legacy fallback only.
- RTDB `test_results` remains the discovery and release-governance shell record, not the canonical Writing detail source.
- If the canonical Firestore submission cannot be loaded at runtime, result shells may synthesize a read-only fallback submission from the RTDB Writing snapshot so the surface fails soft instead of crashing.

## 5. Shell Mapping

Student:
- `StudentTestResultsPage` renders the Writing-specific student surface.
- `ResultSlidePanel` delegates Writing rows to the same Writing-specific student surface instead of `SharedSavedResultCore`.
- `SubmissionCompletePage` remains acknowledgement-only and is not a Writing result page.

Teacher:
- `WritingTestResultsSection` remains the teacher list/table host.
- `WritingResultDetailModal` is the dedicated teacher Writing result detail body.
- Generic teacher result hosts (`ResultDetailModal`, `LegacyResultDetailView`) delegate Writing rows to the teacher Writing surface instead of generic saved-result content.

## 6. Student Surface Rules

Published:
- Compact band strip responsive to active task count.
- Main column shows prompt and marked response.
- Right rail shows expanded `Task Summary` and collapsed `Criteria Feedback`.
- Published markup is read-only.

Pending review:
- No band score, no teacher comments, no criteria feedback, no published markup.
- Show submission snapshot and `What Happens Next` guidance only.
- The page stays intentionally blank with respect to grading output until feedback is published.

## 7. Teacher Surface Rules

Pending review:
- Show submission facts, ownership/source metadata, essay preview, and the correct action state (`Grade now`, `Resume draft`, or read-only message).

Published:
- Compact band strip.
- Dynamic per-task modules based on actual active tasks.
- Published task summary, criteria feedback, markup, and audit metadata.
- `Reopen` is available only when visibility rules permit teacher actions.

## 8. Visibility And Governance

The result surface must preserve unified result-view governance:
- Teacher access is derived from normalized ownership and assignment access, not raw `teacherId`, `assigningTeacherId`, or `selectedTeacherId`.
- Solo practice remains student-owned and teacher-read-only where visible.
- Unresolved rows remain excluded from teacher-owned result history.
- Student release gating follows the saved-result / live-session release contract before showing published Writing feedback.

## 9. Superseded Guidance

Treat the following as historical or superseded for Writing result-surface decisions:
- Any old 3-state Writing result-view guidance.
- Any guidance that routes Writing result content through generic `SharedSavedResultCore` sections.
- Historical references to `StudentResultOverview`, `StudentDetailedMarkup`, or old placeholder-style Writing result readers as the target UX.
- Historical workspace-sync logs and conversation exports. They remain evidence, not source of truth.
- Earlier focused-card, center-based, or approximate list-scroll descriptions for student comment-rail alignment.

Relevant historical references still worth reading for background:
- `architecture/scheme/ielts-writing-current-state-scheme`
- `specs/ielts-writing-grading-editor-finalization-2026-03-30`
- `architecture/results-academic-record`
- `extractions/session-extraction-ielts-writing-manual-grading-result-flow-solo-practice-and-homework-2026-03-29`

## 10. Implementation Notes

The implementation introduced a shared Writing result adapter and dedicated student/teacher surfaces. The key operational guardrail is that result shells should lazy-load canonical Writing detail and fall back to the RTDB snapshot when Firestore detail cannot be loaded, especially in test or degraded runtime environments.

## 11. 2026-03-30 Implementation Amendment

The implemented surfaces follow the approved Stitch screens for structure, information hierarchy, and module layout, but not as literal visual replicas. The app must preserve the established teacher shell language and the student-view design standard while using the Stitch work as intent for:
- the compact, task-count-responsive band strip
- the two-phase public model (`pending-review`, `published`)
- the student right-rail ordering (`Task Summary` expanded above collapsed `Criteria Feedback`)
- the dedicated teacher and student Writing readers instead of generic saved-result sections

Implemented hosts:
- `StudentTestResultsPage`
- `ResultSlidePanel` for Writing rows
- `WritingTestResultsSection`
- `WritingResultDetailModal`
- `ResultDetailModal` and `LegacyResultDetailView` delegation for Writing rows

Runtime resilience rule:
- Student Writing shells may render a read-only RTDB-derived fallback submission for `pending-review` rows without waiting for Firestore detail, because unpublished states do not need canonical published grading data.
- Teacher Writing shells still prefer canonical Firestore submission detail because draft ownership, audit, and actionability come from the canonical submission contract.

## 12. 2026-03-30 Amendment — Exact Parallel Comment Repositioning In Student Slide Modal

Student published Writing results in the wide slide-panel layout support a grading-tool-style cross-column reading interaction.

Current contract:
- Clicking a highlighted annotation in the essay forces the right rail to `Comments`.
- The matching published comment becomes focused, but it stays in normal list order.
- The entire comments rail shifts as one block; the UI does not overlay or detach the selected comment above sibling comments.
- The visual alignment target is `selected comment header top == clicked annotation top`.

Implementation contract:
- The interaction is defined for the published markup path rendered by `WritingPublishedMarkupViewer`.
- The viewer emits the clicked annotation `rect.top` as the right-rail anchor input.
- `WritingStudentResultSurface` measures the selected comment header within the natural comments stack and computes whole-rail translation from that stable offset.
- The alignment math must not depend on measuring against the currently animating transform state.
- Non-split/mobile layouts may continue to fall back to simpler highlight-and-scroll behavior.

Behavioral guardrails:
- The selected comment remains the same logical list item; list order is not rewritten.
- The `Comments` tab remains read-only; no grading actions are exposed.
- Legacy annotation fallback paths are not yet required to support this exact repositioning contract.

Verification note:
- Live verification on `?result=-OosUDrZdaDhAb6vxk34` showed `deltaHeaderTop = 0px` across multiple clicked annotations in the published markup path.
- This supersedes the earlier looser wording that described focused-card or center-based alignment.

## 2026-04-05 Amendment - Published Markup Viewer Standardization

Published-reader rules:
- `WritingPublishedMarkupViewer` is the shared marked-response renderer for both student and teacher Writing result surfaces.
- Published correction data must be passed through that shared viewer on both student and teacher result surfaces; teacher result readers must not silently drop corrections while student readers still show them.
- Published result surfaces may keep a merged ordered feedback rail for comments plus corrections because this is a read-only reader contract, not the grading-editor sidebar contract.

Published-overlay rules:
- Read-only published hover tooltips now follow the same viewport-overlay geometry contract as the grading editor instead of container-local absolute positioning.
- Tooltip placement derives from the hovered mark rectangle and prefers right, left, bottom, then top while clamping to the viewport.
- Published tooltip overlays dismiss on scroll or resize when anchor geometry becomes stale.

## 2026-04-05 Amendment — Shared Published Feedback Panel And Viewer Tooltip Contract

Published reader rules:
- `WritingPublishedMarkupViewer` remains the single read-only marked-response renderer for both student and teacher Writing result surfaces.
- Published hover tooltips now follow the same body-portal, viewport-clamped, side-adjacent placement contract as the grading essay editor instead of container-local absolute positioning.
- Student result readers may expose a neutral `Feedback` tab instead of overloading the label `Comments`.
- Published feedback remains a read-only result-surface model, but comments and corrections must render as separate ordered sections inside that shared feedback surface.
- Teacher result readers must expose the same grouped published feedback surface and must pass published corrections through both the viewer and the feedback panel.
