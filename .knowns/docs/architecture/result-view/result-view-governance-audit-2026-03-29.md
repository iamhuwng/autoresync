---
title: Result View Governance Audit 2026-03-29
description: 'Dated architecture audit for PRD-0040 and PRD-0041 result-view follow-up: current state, findings, fixes, cross-feature interaction risks, and evidence anchors.'
createdAt: '2026-03-29T04:49:22.208Z'
updatedAt: '2026-03-29T04:51:54.063Z'
tags:
  - architecture
  - result-view
  - governance
  - audit
  - results
---

# Result View Governance Audit 2026-03-29

## Scope

This audit captures the PRD-0040 and PRD-0041 follow-up state as of 2026-03-29.
It documents the current runtime, the issues that were found on 2026-03-28, the fixes that landed on 2026-03-29, and the cross-feature interactions that still need care.

### Evidence sources
- `documentation/architecture/result-view/README.md`
- `documentation/architecture/result-view/surface-map.md`
- `documentation/architecture/result-view/visibility-policy.md`
- `documentation/architecture/changelog/result-view-verification-matrix.md`
- `src/services/feedbackService.ts`
- `src/pages/TeacherTestResultsPage.tsx`
- `src/components/results/ResultDetailModal.tsx`
- `src/components/results/LegacyResultDetailView.tsx`
- `src/pages/StudentTestResultsPage.tsx`
- targeted Vitest verification run on 2026-03-29: 61 passing tests across feedback service, teacher shells, and the legacy student result page

## Timeline

- 2026-03-28: result-view audit found shell drift, feedback shape mismatch, incorrect teacher audit identity, student-route drift, and missing architecture-map clarity.
- 2026-03-29: canonical teacher feedback writes were synchronized with the saved-result row while legacy compatibility nodes were preserved.
- 2026-03-29: teacher feedback writes started carrying authenticated teacher identity instead of a placeholder label.
- 2026-03-29: teacher modal and full-page teacher shells were aligned with the shared feedback runtime.
- 2026-03-29: the legacy student result page started preferring stored formative feedback before its generic percentage fallback.
- 2026-03-29: a new repo-side result-view architecture pack was added under `documentation/architecture/result-view/`.

## Current State As Of 2026-03-29

### Canonical saved-result shells
- `ResultSlidePanel`: canonical student saved-result shell.
- `ResultDetailModal`: canonical teacher homework shell.
- `LegacyResultDetailView`: canonical teacher and admin full-page saved-result shell.
- `SharedSavedResultCore`: shared saved-result body used by the canonical shells.

### Legacy and adjacent surfaces
- `StudentTestResultsPage` is still a legacy immediate post-submit runtime.
- Writing and speaking submission flows can materialize into the same saved-result model, but they are still separate workflow domains.

### Governance rules now reflected in code and docs
- Teacher access is a two-step gate: outer assignment relationship plus row-level authoritative ownership proof.
- Solo practice stays student-owned even when a teacher may have read-only visibility.
- Unresolved rows stay out of teacher-owned history and analytics.
- Canonical teacher feedback for saved-result rendering lives on the saved result row, with legacy compatibility nodes still synchronized during the transition.

## Findings, Resolutions, and Status

| Finding | Why it mattered | Resolution | Status on 2026-03-29 |
| --- | --- | --- | --- |
| Teacher feedback write and read shapes drifted apart | Teachers could save feedback that student and teacher result shells would still render as missing | `feedbackService` now syncs root-level saved-result feedback fields and keeps legacy nodes readable | fixed |
| Teacher audit identity used a hard-coded placeholder | Feedback and review writes lost the true teacher identity | `TeacherTestResultsPage` now passes authenticated teacher id and best available display label | fixed |
| Teacher shells were not aligned on feedback behavior | The modal and full-page teacher surfaces diverged on teacher feedback visibility and auto-trigger behavior | `ResultDetailModal` now exposes teacher feedback sections and `LegacyResultDetailView` now uses the shared feedback auto-trigger path | fixed |
| Legacy student result page ignored persisted formative feedback | Students could see a generic message even when stronger saved feedback already existed | `StudentTestResultsPage` now prefers stored AI summary, then deterministic feedback, before fallback | partially fixed |
| Architecture docs were not acting as a clean map | Future work had no single concise reference for surfaces, policy, and runtime status | new repo-side doc pack created under `documentation/architecture/result-view/` | fixed |

## Cross-Feature Interaction Problems Still Open

### Release-state gating vs shell parity
- The saved-result student shell and the legacy immediate post-submit page still behave as different runtimes.
- This means release-state behavior can still feel inconsistent when a student first finishes a test and later reopens the saved result.

### Missing-feedback auto-trigger vs test-type parity
- Shared saved-result shells now use the same hook for upgrades and THCS-first missing feedback generation.
- Missing feedback is still not auto-generated uniformly for every non-THCS result type, so parity is still incomplete.

### Ownership classifier vs producer convenience fields
- The policy is now clear, but producer code still needs ongoing review so convenience fields such as raw teacher ids do not quietly become authority signals again.
- This matters because teacher history, detail routing, and analytics all consume the same ownership verdict.

### Solo-practice visibility vs teacher-owned actions
- Solo practice is intentionally visible and read-only in some teacher contexts while remaining student-owned.
- Any future teacher-write affordance must keep that boundary explicit or it will blur analytics and ownership again.

## Reusable Patterns and References

- Shared shell governance pattern: @doc/patterns/pattern-shared-result-body-shell-owned-governance
- Canonical persistence and discoverability invariant: @doc/patterns/pattern-canonical-result-persistence-invariants
- Fire-and-forget generation with real-time load pattern: @doc/patterns/pattern-rtdb-real-time-auto-load-with-fire-and-forget-generation
- Broader result lifecycle context: @doc/architecture/results-academic-record

## Recommended Next Work

1. Collapse `StudentTestResultsPage` onto the canonical saved-result shell stack instead of layering more parity fixes onto the legacy runtime.
2. Decide whether missing-feedback auto-trigger should remain THCS-first or become uniform across every saved-result type.
3. Continue auditing producer-side visibility inputs so teacher-owned history and analytics cannot regress through convenience-field drift.
4. Remove legacy feedback compatibility nodes only after every reader is proven to consume the canonical saved-result shape directly.


## Open Interaction Risks With Evidence Anchors

### 2026-03-29: Feedback edit authority is still partially backward-compatibility based
- `src/services/feedbackService.ts` still returns `true` from `canTeacherEditFeedback()` when a result has no `courseId`.
- That keeps older rows editable, but it also means the PRD-0041 authority model is not yet fully centralized for teacher feedback writes.
- Evidence anchor: `src/services/feedbackService.ts:566-580` in the current workspace.

### 2026-03-29: Writing pending-review filtering still trusts convenience metadata
- `src/services/writingSubmissionService.ts` still filters pending-review submissions by `assigningTeacherId` or `selectedTeacherId`.
- PRD-0041 explicitly treats those fields as non-authoritative for teacher ownership, so this remains a cross-feature regression risk between writing workflows and result visibility governance.
- Evidence anchor: `src/services/writingSubmissionService.ts:665-669` in the current workspace.

### 2026-03-28 to 2026-03-29: Persistence-contract failures still propagate into result-view symptoms
- `architecture/results-academic-record` was amended on 2026-03-28 to document that result visibility depends on canonical row plus discovery indexes plus `latestResultId`, not the canonical row alone.
- That means future result-view bugs can still originate in persistence/index backfill, even when the viewer shells are behaving correctly.
- Supporting doc: @doc/architecture/results-academic-record.

### 2026-02-27 finding still relevant on 2026-03-29: teacher navigation remains a separate UX problem
- `sop/enhanced-saved-results-ux` still documents the teacher workflow as fragmented, with missing primary navigation into results dashboards.
- The governance/runtime fixes reduce shell drift, but they do not by themselves solve teacher discoverability and entry-point clarity.
- Supporting doc: @doc/sop/enhanced-saved-results-ux.
