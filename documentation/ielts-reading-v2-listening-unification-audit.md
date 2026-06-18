# IELTS Listening and Reading V2 Unification Audit

This audit verifies the current `main` branch against the strategy document. The strategy is authoritative for product direction:

```text
Reading V2 -> neutral shared assessment layer
Listening  -> neutral shared assessment layer
```

Reading V2 is the design reference. It is not the owner of Listening behavior. Listening runtime, audio, live-session authority, and teacher monitor synchronization must stay Listening-specific until a tested neutral shared assessment boundary exists.

## Verification scope

Verified against current repo files, routes, and component imports. The previous audit mixed repo observations with proposed architecture. This version separates current truth from recommendations.

Planning docs verified before repo inspection:

- `documentation/ielts-reading-v2-listening-unification-strategy.md`
- `documentation/ielts-reading-v2-listening-unification-research.md`
- `documentation/ielts-reading-v2-listening-unification-audit.md`

## Current route and entry map

| Area | Current route or entry | Verified files |
| --- | --- | --- |
| Reading V2 authoring | `/teacher/reading-v2/create`, `/teacher/reading-v2/import`, `/teacher/reading-v2/drafts/:draftId`, `/teacher/reading-v2/materials/:materialId/revise` | `src/constants/routes.ts`, `src/routes/teacherRoutes.tsx`, `src/pages/ReadingV2StudioPage.tsx` |
| Legacy/general test builder | `/create-test?skill=...` | `src/constants/routes.ts`, `src/routes/teacherRoutes.tsx`, `src/pages/TestBuilderRouter.tsx` |
| Reading V2 solo/homework runtime | `/student/practice/:materialId`, `/student/solo-test/:materialId`, homework nested test route | `src/routes/studentRoutes.tsx`, `src/pages/StudentPracticePage.tsx`, `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx` |
| Live student test runtime | `/student-test/:sessionCode` | `src/routes/studentRoutes.tsx`, `src/pages/TestPageRouter.tsx` |
| Listening solo/homework runtime | `/student/practice/:materialId`, `/student/solo-test/:materialId`, homework nested test route | `src/pages/StudentPracticePage.tsx`, `src/components/practice/ListeningPracticeView.tsx` |
| Listening live runtime | `/student-test/:sessionCode` | `src/pages/TestPageRouter.tsx`, `src/skills/listening/components/ListeningTestPage.tsx` |
| Teacher live monitor | `/teacher-test/:sessionCode` | `src/routes/teacherRoutes.tsx`, `src/pages/TeacherTestMonitorPage.tsx` |

## Reading V2 authoring

Verified correct:

- Reading V2 authoring routes exist in `src/constants/routes.ts` and are mounted to `ReadingV2StudioPage` in `src/routes/teacherRoutes.tsx`.
- `src/pages/ReadingV2StudioPage.tsx` owns route-mode resolution for blank create, import create, draft resume, and published-material revision.
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx` is the main authoring UI shell for metadata, passages, task groups, validation, preview, draft save, publish, conflict handling, and duplicate warnings.
- `src/services/reading-v2/readingV2StudioWorkflow.service.ts` owns draft/material workflow decisions.
- `src/services/reading-v2/readingV2ImportNormalization.service.ts` is a large import normalization/parser boundary and should not be used as a shared Listening parser.
- Reference update and published-master repair/edit surfaces live under `src/components/reading-v2/master/` and `src/services/reading-v2/readingV2ReferenceUpdate*.service.ts`.

Corrected from previous audit:

- `/create-test?skill=Reading` is not the Reading V2 Studio route. `TestBuilderRouter` still maps Reading to legacy/general `TestCreationPage`; Reading V2 authoring uses dedicated `/teacher/reading-v2/*` routes.
- Reading V2 authoring is not a neutral shared authoring layer today. It is Reading-specific and should remain so until neutral shared primitives are extracted.

## Reading V2 student runtime

Verified correct:

- `StudentPracticePage` mounts `ReadingV2RuntimeShell` when it has a Reading V2 projection.
- `ReadingV2RuntimeShell` states its boundary directly: it renders derived V2 projections only and rejects canonical drafts, packaged materials, and legacy flat-question payloads before rendering.
- Reading V2 runtime includes passage rendering, question sheet/review behavior, mobile and desktop/tablet layouts, submit handling, and runtime telemetry inside `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`.
- Reading V2 projection safety lives in `src/services/reading-v2/readingV2Projection.service.ts`, `readingV2LaunchIntegration.service.ts`, and `readingV2RuntimeBoundary.service.ts`.

Corrected from previous audit:

- Shared `/student/practice/:materialId` does not mean shared runtime. `StudentPracticePage` branches Reading V2 and Listening to different runtime components.
- `ReadingV2RuntimeShell` is not a safe first extraction target. It is large and mixed responsibility: projection validation, answer state, timer display, submit/review, passage rendering, mobile, and desktop/tablet UI.

## Listening authoring

Verified correct:

- `TestBuilderRouter` maps `skill=Listening` to `src/skills/listening/builders/ListeningTestBuilder.tsx`.
- `ListeningTestBuilder` is a large Listening-specific authoring surface. It handles mode selection, audio, question setup, review, metadata, and save/publish workflow.
- `src/services/listeningTestStorage.ts` owns Listening persistence shape, audio controls config, audio section formatting, question section mapping, and save behavior.
- Listening save validates audio sections and fails when audio is missing for a section.
- Listening save moves temp R2 audio URLs to permanent storage before persisting and keeps `audioUrl` / `streamUrl` aligned when needed.

Corrected from previous audit:

- Listening authoring is not currently built on Reading V2 Studio.
- Listening authoring should not import Reading V2 studio internals. Safe alignment should be visual/workflow only, or through neutral shared assessment components.

Missing from previous audit:

- Audio asset lifecycle is a protected authoring/storage concern. Any authoring alignment must preserve temp-to-permanent R2 movement, Google Drive/direct URL handling, audio preview, and persisted `audioSections`.

## Listening solo/homework runtime

Verified correct:

- `StudentPracticePage` explicitly routes `IELTS + Listening` to `ListeningPracticeView`.
- `ListeningPracticeView` is a dedicated solo/homework host. It owns solo hooks, timer integration, autosave, resume, mobile-state hydration, submission, and Listening layout.
- `MobileListeningExamScaffold` is used by `ListeningPracticeView` as a phone-oriented visual scaffold.
- `ListeningPracticeView` renders Listening-specific components: `AudioPlayer`, `ListeningHeader`, `ListeningQuestionDisplay`, `ListeningQuestionNav`, `ListeningNavArrows`, `ListeningImageModeDisplay`, `MobileListeningImageCanvas`, and `MobileListeningAnswerSheet`.
- `src/components/test/mobile/mobileListeningState.ts` serializes/hydrates Listening mobile state with `kind: 'listening'`.
- Solo/homework Listening mobile state includes playback fields: `currentAudioIndex`, `audioPositionSeconds`, `volume`, `playbackSpeed`, and completed audio indices.

Corrected from previous audit:

- Listening solo/homework state is not generic shared mobile state. It is Listening-specific and versioned.
- Listening solo/homework playback state must not be generalized into live-session state.
- `IELTSPracticeView` still contains legacy Listening branches/imports, but current dedicated solo/homework Listening route goes through `ListeningPracticeView`.

## Listening live-session runtime

Verified correct:

- Live Listening student runtime routes through `/student-test/:sessionCode` and `TestPageRouter`.
- `TestPageRouter` has a dedicated Listening branch that renders `src/skills/listening/components/ListeningTestPage.tsx`.
- `ListeningTestPage` consumes session data from `useTestSession`, including `audioCommand`, `masterAudioState`, `audioMode`, and `headphoneRequest`.
- Live Listening uses `AudioPlayer` and `ListeningHeader` with `playerMode="session"` and passes teacher/live audio state through props.
- Live mobile state serialization intentionally excludes playback; playback is teacher/session controlled.

Corrected from previous audit:

- Live Listening is not the same runtime as solo/homework Listening. They share some Listening components, but live authority and state are different.
- `masterAudioState` has not fully replaced legacy `audioCommand`. Current code still uses both: `audioCommand` for command routing such as pause/resume/skip/seek, and `masterAudioState` for sync/drift correction.

## Teacher monitor to student Listening synchronization

Verified correct:

- Teacher monitor route is `/teacher-test/:sessionCode`.
- `TeacherTestMonitorPage` mounts `AudioProgressPanel` only when `testData.skill === 'Listening'`, `audioSections.length > 0`, and the session is in progress.
- `TeacherTestMonitorPage` also mounts `HeadphoneRequestPanel` for offline Listening headphone requests.
- `useMonitorControls` writes live session control fields under `game_sessions/{sessionCode}`.
- Pause/resume writes session-level fields such as `isPaused`, `pausedAt`, `resumedAt`, and paused duration.
- Unified audio authority is stored at `game_sessions/{code}/masterAudioState`.
- Student runtime reads `masterAudioState` through `useTestSession` and `AudioPlayer`.
- Headphone readiness is stored per player at `game_sessions/{code}/players/{studentId}/headphoneRequest`.

Corrected from previous audit:

- Page-level `TeacherTestMonitorPage` wrappers currently call `pauseAllAudio()` and `resumeAllAudio()` without passing current section/position/speed, so those hook defaults fall back to section `1`, position `0`, speed `1.0`. The `AudioProgressPanel` path carries richer local audio context. This is unsafe to touch without live testing.
- `AudioProgressPanel` is teacher-side master audio broadcaster and local audio UI owner; it is not just a passive progress display.

Still uncertain:

- Current code is in a dual-path audio migration. `audioCommand` and `masterAudioState` both matter. Intended long-term authority split is not fully obvious from code alone.
- `TeacherTestControlBar` and `AudioProgressPanel` both expose teacher audio actions. Precedence and synchronization between them require browser/live-session proof.

## Audio progress state

Verified correct:

- Teacher-side progress state lives in `AudioProgressPanel` local state and is broadcast through `useMasterAudioState` when unified audio is enabled.
- `MasterAudioState` includes section, position, speed, `isPlaying`, timestamp, and last action metadata.
- Student-side drift correction lives in `useAudioSync` and `AudioPlayer`.
- Solo/homework Listening persists playback only through Listening mobile state, not through the live session authority path.

Unsafe before testing:

- Any change to `AudioProgressPanel`, `useMasterAudioState`, `useAudioSync`, `AudioPlayer`, or `useMonitorControls` must be treated as live-session behavior work and needs real teacher/student browser proof.

## Pause/resume behavior

Verified correct:

- Session-level pause/resume is written through `useMonitorControls`.
- Listening audio pause/resume also interacts with `pauseAllAudio`, `resumeAllAudio`, `audioCommand`, and `masterAudioState`.
- `AudioPlayer` follows `masterAudioState.isPlaying` in online teacher-controlled mode rather than local play state.

Unsafe before testing:

- Do not refactor pause/resume as part of first unification patch.
- Do not convert teacher-controlled pause/resume into student-local state.

## Skip-to-section behavior

Verified correct:

- Teacher skip-to-section exists in `TeacherTestControlBar`, `AudioProgressPanel`, and `useMonitorControls`.
- `skipToSection` writes both legacy command data and `masterAudioState`.
- Student Listening live page consumes skip/seek command state.

Unsafe before testing:

- Do not abstract Listening sections as Reading passages.
- Do not route skip-to-section through a generic section navigator until live sync tests exist.

## Headphone/audio readiness flow

Verified correct:

- `HeadphoneRequestPanel` exists for teacher management.
- `useHeadphonePermission` reads and writes `game_sessions/{code}/players/{studentId}/headphoneRequest`.
- `AudioPlayer` uses `audioMode`, `headphoneRequest`, and approval state to control offline mode behavior.

Unsafe before testing:

- Do not remove, rename, or generalize headphone readiness into Reading V2 or a neutral shell without a dedicated test plan.

## Shared UI/component candidates

Safe candidates:

- Neutral visual wrappers for assessment section cards, empty/loading/error states, validation summaries, save status, and review summaries.
- Visual-only card/header/layout primitives that accept children and do not know about Reading passages or Listening audio.
- Existing shared solo overlays can inspire neutral API shape: `SoloSettingsModal`, `SoloResumeModal`, `TimeUpOverlay`.
- Existing mobile primitives can inspire neutral components, but should not be merged wholesale: `MobileReviewSummary`, `MobileQuestionSheet`, `MobileReadingExamScaffold`, `MobileListeningExamScaffold`.
- Listening authoring visual alignment with Reading V2 style is safer than runtime unification, as long as audio upload/import/storage behavior is unchanged.

Rules for first extraction:

- Put shared code under a neutral shared assessment layer, not under `reading-v2`.
- Use props/children to inject skill-specific content.
- Avoid imports from `src/components/reading-v2/**` into Listening.
- Avoid imports from `src/skills/listening/**` into Reading V2.

## Large or mixed-responsibility files

These are real risk areas:

- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`: large Reading V2 runtime boundary with projection validation, passage rendering, answer state, submit/review, and mobile/desktop layout.
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`: large Reading V2 authoring shell.
- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx`: very large studio workspace.
- `src/services/reading-v2/readingV2ImportNormalization.service.ts`: very large Reading V2 parser/import normalization service.
- `src/skills/listening/builders/ListeningTestBuilder.tsx`: large Listening authoring surface.
- `src/components/practice/ListeningPracticeView.tsx`: large solo/homework Listening host.
- `src/skills/listening/components/ListeningTestPage.tsx`: large live Listening runtime.
- `src/skills/listening/components/AudioPlayer.tsx`: large audio control/sync component.
- `src/pages/StudentPracticePage.tsx`: multi-skill route/orchestration page.
- `src/pages/TestPageRouter.tsx`: live-session route/orchestration page.
- `src/pages/TeacherTestMonitorPage.tsx`: live teacher monitor.
- `src/hooks/monitor/useMonitorControls.ts`: live session authority writes.

## Places previous audit was wrong, outdated, or too risky

Corrected:

- It treated proposed shared runtime/shell ideas as if they were current repo truth.
- It implied shared route entry points mean shared runtime flow. Current code branches by skill and runtime type.
- It recommended broad runtime extraction too early. Strategy now forbids making Listening depend on Reading V2 internals.
- It under-described live Listening authority and the `audioCommand` plus `masterAudioState` dual path.
- It did not mark audio storage lifecycle as protected.
- It did not separate solo/homework Listening playback persistence from live Listening teacher authority.

Still risky:

- Any generic runtime abstraction that touches Listening live session logic.
- Any shared section navigator that controls Listening skip-to-section.
- Any shared mobile state abstraction that moves Listening playback state across solo/live boundaries.
- Any change to Reading V2 passage rendering or parser logic as part of Listening alignment.

## Codex verification result

### Verified correct

- Reading V2 authoring routes and Studio files exist and are Reading-specific.
- Reading V2 runtime uses `ReadingV2RuntimeShell` and derived projections only.
- Listening authoring routes through `TestBuilderRouter` to `ListeningTestBuilder`.
- Listening solo/homework routes through `StudentPracticePage` to `ListeningPracticeView`.
- Listening live sessions route through `TestPageRouter` to `ListeningTestPage`.
- Teacher monitor conditionally renders Listening audio controls only for in-progress Listening sessions with audio sections.
- Audio progress, pause/resume, skip/seek, and headphone readiness have live-session-specific state paths.

### Corrected

- Removed the implied direction of Listening toward Reading V2 internals.
- Corrected `/create-test?skill=Reading` vs dedicated Reading V2 Studio route distinction.
- Corrected shared-route assumption: `/student/practice/:materialId` still branches to separate runtimes.
- Corrected audio authority model: current repo still uses both legacy `audioCommand` and `masterAudioState`.
- Corrected pause/resume risk: monitor page wrapper calls can fall back to default section/position/speed.
- Corrected mobile state: Listening mobile state is `kind: 'listening'`, and live playback is intentionally not autosaved the same way as solo/homework.

### Missing from previous audit

- Live student route `/student-test/:sessionCode` and `ListeningTestPage` as distinct live Listening runtime.
- Listening audio temp-to-permanent storage lifecycle in `listeningTestStorage.ts`.
- Per-player headphone readiness path.
- Explicit unsafe status for `AudioProgressPanel`, `useMonitorControls`, `AudioPlayer`, and `ListeningTestPage`.
- Large-file risk list.
- Current absence of a neutral shared assessment layer.

### Still uncertain

- Intended final precedence between `audioCommand` and `masterAudioState`.
- Whether `TeacherTestControlBar` and `AudioProgressPanel` audio controls can diverge in real sessions.
- Whether current pause/resume defaults cause live sync drift without browser proof.
- Exact best neutral shared component location and API names; this should be decided in the first implementation prompt.

### Safe first patch candidates

- Extract a neutral shared visual primitive such as `AssessmentSectionCard`, `AssessmentValidationSummary`, `AssessmentLoadingState`, `AssessmentErrorState`, or `AssessmentEmptyState`.
- Align Listening authoring card/header/spacing styles with Reading V2 visual language without changing audio upload/import/storage or parser behavior.
- Extract a shared validation summary pattern for authoring surfaces, provided it accepts generic messages and does not import Reading V2 services into Listening.
- Extract a shared low-risk header/card layout component under a neutral path, used by one surface first before broad adoption.

### Unsafe first patch candidates

- Replacing `ListeningPracticeView` or `ListeningTestPage` with `ReadingV2RuntimeShell`.
- Editing `AudioProgressPanel`, `useMonitorControls`, `useMasterAudioState`, `useAudioSync`, `AudioPlayer`, or `ListeningTestPage`.
- Changing pause/resume synchronization, skip-to-section, audio progress state, headphone readiness, or live session authority.
- Moving Listening audio playback state into generic Reading-style mobile state.
- Changing Reading V2 passage rendering or Reading V2 parser/import normalization.
- Adding Listening-specific code to `src/components/reading-v2/**` or `src/services/reading-v2/**`.

### Recommended first patch

Start with a small neutral shared visual primitive extraction.

Best first target: create a neutral shared assessment loading/error/empty state component or validation summary component, then adopt it in one low-risk authoring surface first. Do not touch live Listening synchronization, audio state, or Reading V2 runtime internals in the first patch.
