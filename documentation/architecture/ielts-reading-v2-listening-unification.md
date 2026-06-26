# IELTS Reading V2 And Listening Unification Architecture

Status: Active
Last Updated: 2026-06-19
Owner: Frontend Platform / IELTS Assessment

## Purpose And Scope

This document is canonical architecture authority for how IELTS Reading V2 and Listening may unify shared assessment UI primitives without collapsing Reading V2 into Listening or Listening into Reading V2.

Scope:

- neutral shared assessment presentation primitives
- dependency direction and adapter rules
- protected Listening runtime and teacher-authority boundaries
- current migration status and known drift

Out of scope:

- replacing Listening runtime with Reading V2 runtime
- changing Reading V2 parser, passage, or runtime-host contracts
- changing Listening audio authority, teacher monitor, or headphone flows

## Source Hierarchy

Use sources in this order:

1. This file for unification boundary, dependency direction, and current allowed sharing.
2. `documentation/architecture/reading-v2-runtime-integrations.md` for Reading V2 host/runtime/platform authority.
3. `documentation/architecture/mobile-ielts-listening-audio-navigation.md` for Listening mobile navigation and audio-switch rules.
4. `documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md` for Listening diagnostics boundaries and hot-path logging context.
5. `documentation/architecture/upload-storage-authority.md` for current R2-only upload and obsolete Google Drive status.
6. Historical artifacts listed later in this file for strategy, research, audit, and implementation evidence.

If older unification docs conflict with this file, this file wins.

## Dependency Direction

Required direction:

```text
Reading V2 -> neutral shared assessment layer
Listening  -> neutral shared assessment layer
```

Forbidden direction:

```text
neutral shared assessment layer -> Reading V2
neutral shared assessment layer -> Listening
Listening -> Reading V2 internals
Reading V2 -> Listening internals
```

Shared layer code must stay presentation-only and assessment-neutral.

## Upload And Storage Authority

All active uploads use Cloudflare R2.

Google Drive is fully obsolete across all product features. Remaining Google Drive services, branches, environment fields, comments, tests, or URL handling are implementation residue, not supported upload, import, streaming, playback, validation, or compatibility behavior.

Do not preserve or extend that residue during Reading V2 / Listening unification. Removal requires a separate cleanup and data audit.

## Current Neutral Shared Assessment Layer

Current neutral primitives live under:

- `src/features/assessment/shared/components/AssessmentAuthoringSection.tsx`
- `src/features/assessment/shared/components/AssessmentStatusState.tsx`
- `src/features/assessment/shared/components/AssessmentValidationSummary.tsx`

### `AssessmentAuthoringSection`

Purpose: shared semantic authoring-section layout with neutral title, description, status, action, and content slots.

Exact current adoptions:

- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`
  - accessibility/runtime advisories guidance block
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
  - Step 4 Questions/Answer Key wrapper and title/action row

Current non-adoptions:

- no additional Reading V2 authoring adoption beyond the display-only `ReadingV2SettingsPanel` guidance block
- no Listening runtime adoption

### `AssessmentStatusState`

Purpose: shared loading, error, and empty presentation state.

Exact current adoptions:

- `src/pages/ReadingV2StudioPage.tsx`
  - revision hydration loading state
  - revision hydration error state
  - invalid studio context state
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
  - Step 4 empty question list branch

### `AssessmentValidationSummary`

Purpose: shared ready/blocked validation summary presentation.

Exact current adoptions:

- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`
  - publish-readiness summary

Current non-adoptions:

- no `ListeningTestBuilder` adoption
- no Listening solo/homework runtime adoption
- no Listening live-session adoption

## Presentation-Only Rules

Neutral shared assessment primitives may own:

- headings
- copy slots
- status semantics such as `role="status"` or `role="alert"`
- generic action buttons
- neutral layout and spacing
- generic blocked/ready/loading/error/empty visuals

Neutral shared assessment primitives must not own:

- Reading V2 passage logic
- Reading V2 import, publish, trusted-submit, or runtime-host logic
- Listening audio state
- Listening `audioCommand`
- Listening `masterAudioState`
- Listening teacher monitor writes
- Listening headphone readiness
- Listening mobile section/audio synchronization
- route selection
- persistence, parsing, or session orchestration

## Protected Listening Contracts

These remain Listening authority and must not be generalized into neutral shared assessment primitives without a separate tested adapter boundary:

- `src/components/test/AudioProgressPanel.tsx`
- `src/skills/listening/components/ListeningTestPage.tsx`
- `src/components/practice/ListeningPracticeView.tsx`
- `src/skills/listening/components/AudioPlayer.tsx`
- `src/pages/TeacherTestMonitorPage.tsx`
- `src/hooks/audio/useMasterAudioState.ts`
- `src/hooks/audio/useAudioSync.ts`
- `src/hooks/monitor/useMonitorControls.ts`
- `documentation/architecture/mobile-ielts-listening-audio-navigation.md`
- `documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md`

Protected behavior includes:

- teacher-controlled audio authority
- live session synchronization
- `audioCommand` and `masterAudioState` live authority paths
- headphone request/check flow
- skip-to-section and audio progress synchronization
- solo/homework playback persistence split from live teacher-controlled playback
- mobile section navigation changing destination audio under current Listening contract

Preserve exact protected file names above when describing or patching these areas.

## Adapter Model

Allowed model:

- feature owns data, workflow, and runtime authority
- feature adapts local state into neutral presentation props
- neutral primitive renders generic state only

Pattern:

```text
feature-specific state -> feature adapter props -> neutral shared primitive
```

Neutral primitives must not reach back into feature services, hooks, monitor state, or runtime state.

## Safe Sharing

Safe now:

- loading, error, empty, ready, blocked visual primitives
- neutral validation summaries
- shell-local status copy and generic actions
- shared assessment card/header/section presentation when no protected Listening behavior leaks through
- neutral authoring header presentation when modules supply title, copy, status, action children, handlers, and accessible labels

Unsafe now:

- broad shared runtime abstraction
- shared audio model
- shared live-session authority model
- shared mobile playback state across solo and live Listening
- replacing `ListeningPracticeView` or `ListeningTestPage` with `ReadingV2RuntimeShell`
- moving protected Listening controls into Reading V2 surfaces or neutral layer
- changing `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx` to own Listening audio or session behavior

## Current Migration Status

Current status is partial, presentation-only migration:

- neutral shared assessment layer exists
- `AssessmentAuthoringSection` is adopted by one Listening authoring branch and one Reading V2 authoring display section
- `AssessmentStatusState` is adopted by Reading V2 Studio and one Listening authoring branch
- `AssessmentValidationSummary` is adopted by Reading V2 only
- PRD-0055 Task 3.5/3.6 selected `authoring header` as the next neutral primitive candidate for later Task 3.7+ implementation, with Reading V2 and Listening adopters required in the same PR or explicitly adjacent PRs
- no Listening runtime, live-session, audio, headphone, monitor, or mobile-navigation contract moved into neutral shared layer
- no Reading V2 runtime-host contract moved into Listening

## Known State And Drift

- Task 3.14 removed legacy Mantine `AppShell` residue from `src/skills/listening/builders/ListeningTestBuilder.tsx`. The builder now uses a native authoring shell while preserving Listening-specific parser, audio, save, persistence, and runtime ownership.
- `AssessmentValidationSummary` has no Listening adoption today; this is current migration state, not permission to force an incompatible adoption.
- `AssessmentAuthoringSection` now has a Reading V2 adoption in the display-only `ReadingV2SettingsPanel` advisories block; further adoption still requires matching heading, spacing, and ownership semantics rather than symmetry for its own sake.
- `authoring card`, action-row, metadata-display, review/publish wrapper, question-card, and mobile-layout primitives remain deferred until two modules prove an identical neutral display contract; question-card and mobile-layout deferrals stay tied to their named runtime child PRD gates when they touch runtime behavior.
- Listening dual live audio authority paths (`audioCommand` plus `masterAudioState`) remain protected current behavior, not neutral-layer drift.
- Listening solo/homework and live runtimes intentionally remain separate authorities even when they share visual components.
- Google Drive upload/playback/validation references remain in source and historical docs as obsolete residue. Current product upload authority is R2-only.

## Resolved PRD-0055 Decisions

- `masterAudioState` is canonical continuous live-audio authority; `audioCommand` is compatibility-only traffic until a dedicated migration removes it.
- Newest valid `masterAudioState` wins when the two live paths disagree.
- `TeacherTestControlBar` and `AudioProgressPanel` divergence is a defect, not an allowed authority split.
- Neutral shared code stays under `src/features/assessment/shared/`; subfolders are added only for real neutral implementations.
- Listening validation-summary adoption remains focused and semantics-preserving.
- Listening Mantine shell cleanup is a dedicated authoring patch.
- Shared answer inputs require proven semantic equivalence across at least two modules.
- Live Listening visual changes require the full teacher/student proof matrix defined by PRD-0055.
- R2 audio retention uses saved-reference ownership: saved drafts and published tests retain audio; abandoned, replaced, failed, cancelled, and never-saved uploads are removed under `documentation/architecture/upload-storage-authority.md`.

## Obsolete Interpretations

Treat these as obsolete:

- "Listening should converge toward Reading V2 internals."
- "Reading V2 runtime can replace Listening runtime if audio is added later."
- "Neutral shared layer may own audio, monitor, or headphone behavior."
- "Listening live and solo playback state are one generic mobile/runtime model."
- "Listening already adopted `AssessmentValidationSummary`."
- "AssessmentAuthoringSection has no Reading V2 adoption today."
- "Legacy Mantine `AppShell` in `ListeningTestBuilder` means Mantine is approved shared architecture."
- "Google Drive remains a supported upload, import, playback, validation, streaming, or compatibility feature."

## Historical Artifact Authority Map

Use historical docs for bounded purpose only:

- `documentation/ielts-reading-v2-listening-unification-strategy.md`
  - historical strategy rationale and protected-domain evidence; its phase sequencing is no longer an active work queue
- `documentation/ielts-reading-v2-listening-unification-research.md`
  - research snapshot and earlier reasoning context
- `documentation/ielts-reading-v2-listening-unification-audit.md`
  - corrected repo-state map, risk list, and protected-path evidence
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md`
  - actual adoption evidence for shared primitives

When one of these historical artifacts conflicts with current repo truth or this file, prefer this file plus current canonical architecture docs.

## Verification Anchors

Current verification anchors:

- `src/features/assessment/shared/components/AssessmentAuthoringSection.tsx`
- `src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx`
- `src/features/assessment/shared/components/AssessmentStatusState.tsx`
- `src/features/assessment/shared/components/AssessmentStatusState.test.tsx`
- `src/features/assessment/shared/components/AssessmentValidationSummary.tsx`
- `src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx`
- `src/pages/ReadingV2StudioPage.tsx`
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
- `src/__tests__/integration/ListeningTestPage.test.tsx`
- `src/skills/listening/components/AudioPlayer.test.tsx`
- `src/components/practice/ListeningPracticeView.test.tsx`

## Related Canonical Docs

- `documentation/architecture/reading-v2-runtime-integrations.md`
- `documentation/architecture/mobile-ielts-listening-audio-navigation.md`
- `documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md`
- `documentation/architecture/reading-v2-studio-review-issues-contract.md`
- `documentation/architecture/teacher-test-creation-parsing-and-review.md`
- `documentation/architecture/ui-design-standards.md`
