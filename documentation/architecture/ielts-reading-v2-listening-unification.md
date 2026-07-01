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
- `src/features/assessment/shared/components/AssessmentAuthoringHeader.tsx`
- `src/features/assessment/shared/components/AssessmentStatusState.tsx`
- `src/features/assessment/shared/components/AssessmentValidationSummary.tsx`

### `AssessmentAuthoringHeader`

Purpose: shared display-only authoring header layout with neutral title, optional eyebrow or description, status, action, children, heading-level, accessible labelling, and responsive stacking props.

Exact current adoptions:

- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`
  - Settings panel header
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
  - mode-select display header

Current non-adoptions:

- no Listening runtime adoption
- no Reading V2 runtime adoption
- no storage, parser, publish, preview, or live-session adoption

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
- `AssessmentAuthoringHeader` is adopted by one Listening authoring display header and one Reading V2 authoring display header
- `AssessmentStatusState` is adopted by Reading V2 Studio and one Listening authoring branch
- `AssessmentValidationSummary` is adopted by Reading V2 only
- PRD-0055 Task 3.5/3.6 selected `authoring header`; Tasks 3.7 through 3.10 implemented and adopted it in one Reading V2 display-only authoring header and one Listening display-only authoring header
- PRD-0055 Task 8.11 adds a Listening-owned local/dry-run load-test harness under `src/features/assessment/listening/live-session/tests/load/listening-live/`; it does not move live authority into shared code or claim browser/deployed load proof
- PRD-0055 Task 8.12 adds an optional Listening-owned `AudioPlayer` authorized-delivery source-handoff contract; it is not wired to switch production live traffic and does not persist signed URLs in authority
- PRD-0055 Task 8.13 adds teacher-monitor/live accessibility verification and Listening-owned UI fixes; it does not move authority into shared presentation code
- PRD-0055 Task 8.14 is checked for the localhost-only packet. Its local proof includes browser-reachable local WAV fixtures for internal session `T8P9J2`, user-confirmed audible Browser tone with progress advanced and no wrong audio/no interruption/no visible drift, a measured-media-duration progress-control fix, a fractional-step teacher monitor seek fix after deployed progress diagnostics, a teacher-monitor toolbar-to-panel resume gesture correction for browser playback policy diagnostics, and strengthened localhost matrix proof for teacher desktop, student desktop/mobile, reload, pause/resume, skip/seek/speed, buffered pause pinning, stale command rejection, equal-revision authority-conflict rejection, headphone visibility, teacher End/result indexing, and post-End duplicate-submit rejection. Historical live/private Worker, Hosting, deployed fixture, selected-class, and rollout artifacts are retained evidence only and are future-deferred non-gates for the current localhost-only packet.
- PRD-0055 Task 8.15 through Task 8.18 are checked for the localhost-only packet. Task 8.15 is a no-live-rollout deferral/non-action under the owner's "no rollout to live server anytime soon" decision; Task 8.16 local artifact capture is complete for this packet; Task 8.17 has Pauli independent PASS; Task 8.18 local-only parent acceptance is reconciled for the target packet. Selected-live-traffic survival, selected-user rollout, percentage rollout, full rollout, human production acceptance, and production rollback/recovery remain future-deferred non-gates.
- PRD-0055 Task 9.1/9.2/9.3/9.4 have partial local compatibility readiness only: `output/prd0055-task9-local-readiness/task9-compatibility-readiness-report.json` ties Reading V2, legacy/new Listening R2 compatibility, and no-Google-Drive-path-change evidence to the 26-suite / 144-test cross-system pass plus local gate scan; parent Task 8.0, deployed/private/live compatibility proof, rollout evidence, and parent Task 9 acceptance remain open
- PRD-0055 Task 9.5/9.11 have partial local boundary/static readiness only: current local artifacts under `output/prd0055-task9-local-readiness/` show zero shared-authority hits, zero Reading/Listening cross-import violations, zero added protected source patterns, and guardrail OK over 12 shared files; final cross-system regressions, deployed/private/live proof, rollout evidence, and parent Task 9 acceptance remain open
- PRD-0055 Task 9.6/9.7 have partial authorization/observability readiness only: current artifacts under `output/prd0055-task9-local-readiness/` show Worker authorization/negative tests passing, static RTDB rule assertions passing, process-local Temurin 21 emulator-backed RTDB negative proof passing, the added `/listening-delivery/result-review` unauthenticated negative passing 15/15, and direct private/restricted `game_sessions/{sessionCode}` owner/player/class-member/admin plus cross-owner/unauth emulator proof passing 19/19; deployed RTDB readback under `output/prd0055-task9-live-readback/` proves the `game_sessions` hardening is released to `temp-a1437-default-rtdb`, matches local, has no blanket root auth, and denies unauthenticated deployed REST reads; feature-registry/live-control observability regressions pass, while final all-action browser/rollout acceptance remains open
- PRD-0055 Task 9.12 has partial local row-level readiness reconciliation only: Section 27 storage rows `REG-45` through `REG-55` now cite current local PRD-0058 evidence, and selected live rows now cite EV-0060B localhost evidence where available; final per-row execution, deployed/private/live proof, rollout evidence, and parent Task 9 acceptance remain open
- PRD-0055 Task 8.15/8.16 and Task 9.8/9.9/9.10/9.12/9.15 are no longer rollout/deployed-truth blocked for the current localhost-only packet. Historical retained artifacts include deployed/current readback for Cloudflare deployment `7d32be9d-1470-4c82-bb6a-8782a80de1c9` serving Worker version `993acdc9-dd93-4ee8-8764-15847146ac3a` at 100% after an active-version pin rehearsal, equivalent candidate `f217034a-4a21-48be-85d1-5b629ebd70b8`, 1% percentage rehearsal deployment `b8b6435d-bba6-4951-a2a0-6a5d8e140da3`, restore deployment `fd709c5b-c470-4c52-a3c2-1a7c1d4c18c1`, delivery secret coverage, Hosting bundle readback for `/listening-delivery/live`, approved dev/internal fixture writes, human audible/no-wrong-audio/no-interruption proof, internal deployed live fixture `T8D116` API proof, selected-class internal fixture/API+browser proof for `T843A5`, and post-rollout smoke proofs `T8TDAS`, `T8HVWE`, and `T8QYZU`; these are retained evidence only and must not become current gates
- PRD-0055 Task 8.17 has fresh independent localhost-only PASS evidence in `output/prd0055-task9-local-readiness/prd0055-pauli-task817-local-independent-pass-summary.json`; Task 8.14 through Task 8.18 are checked target boxes, and final local closure remains blocked only by Task 9.0 through Task 9.15 one-by-one reconciliation
- PRD-0055 prior independent blocker audits remain historical evidence only where they reference live/deploy/rollout blockers. Helmholtz and Mencius are not current gate authorities after EV-FINAL-X; they remain useful for no-invalid-checkbox/no-overclaim and stale-doc evidence
- PRD-0055 canonical current closure audit is recorded at `output/prd0055-task9-live-readback/prd0055-canonical-closure-audit-report.json`: it imports current local-only status, treats older local-readiness and live-readback reports as historical inputs where superseded, verifies Task 8.14 through Task 8.18 are checked and Task 9.0 through Task 9.15 remain unchecked, and records `CANONICAL_CLOSURE_AUDIT_BLOCKED_NOT_PASS`
- PRD-0055 requirements matrix old deployed/rollout blocker rows are superseded for the current localhost packet by EV-FINAL-X. Section 27 localhost row execution has 85 rows, 77 current-local rows, 8 approved future deferrals, and 0 local blockers; the 8 future deferrals are non-gates for this packet
- PRD-0055 remaining closure scope is localhost-only: live-domain/deployed proof, selected-user rollout, percentage rollout, full rollout, human production acceptance, production-current documentation truth, and production rollback/recovery proof are deferred to named future PRD-0062 Listening Deployed Truth And Production Rollout Closure or a separately approved future deploy/rollout PRD
- PRD-0055 Task 9.14 has partial local deferred-residue readiness only: current local artifacts under `output/prd0055-task9-local-readiness/` classify approved deferrals and `DEP-BUCKET-C`, and confirm current large-file maps include line counts, responsibility boundaries, and future seams; final dirty-tree residue review, deployed truth, rollout evidence, and parent Task 9 acceptance remain open
- no Listening runtime, live-session, audio, headphone, monitor, or mobile-navigation contract moved into neutral shared layer
- no Reading V2 runtime-host contract moved into Listening

## Known State And Drift

- Task 3.14 removed legacy Mantine `AppShell` residue from `src/skills/listening/builders/ListeningTestBuilder.tsx`. The builder now uses a native authoring shell, neutral touched authoring chrome, and native `aria-pressed` mode-select buttons while preserving Listening-specific parser, audio, save, persistence, and runtime ownership.
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
