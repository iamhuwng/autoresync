# PRD 0059: Listening Solo/Homework Runtime Alignment

Status: Draft child PRD - Task 1.11 parent acceptance is complete; implementation blocked pending Task 1.12 approval/HARD STOP, Task 5 authoring stability, and product-owner plus architecture review
Created: 2026-06-20
Task number: 0059
Parent PRD: `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
Parent task: Task 1.7 solo/homework child-PRD portion only

## Source References

- `AGENTS.md`
- `DESIGN.md`
- `documentation/tasks/create-prd.md`
- `documentation/tasks/process-task-list.md`
- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`
- `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`
- `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/architecture/mobile-ielts-listening-audio-navigation.md`
- `documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md`
- `documentation/architecture/ui-design-standards.md`
- `documentation/rules/mobile-portability.md`
- `documentation/rules/student-mobile-design.md`
- `documentation/rules/student-data-loading.md`
- `documentation/rules/observability.md`
- `documentation/rules/announcements.md`

## Clarification Handling

The repository PRD rule asks for clarification before a PRD is created. Packet 1F already fixes the product goal, required sections, dependencies, protected boundaries, test anchors, browser proof, rollout sequence, and prohibited work. Current source and tests provide the remaining baseline evidence. No additional product choice is required for this planning packet.

## 1. Introduction / Overview

Current Listening solo and homework delivery is owned by `ListeningPracticeView` and its solo hooks. It has separate local answer, timer, autosave, resume, mobile, playback, submit, and result behavior. It is not the live Listening runtime and must not become a second writer or reader of live teacher authority.

This child PRD defines the target boundary for aligning the solo/homework Listening runtime presentation and hardening its local runtime behavior. It covers:

- `ListeningPracticeView`;
- solo hooks and state;
- answers and viewed/current section state;
- timer, autosave, and resume;
- mobile serialization and hydration;
- local playback state and the `AudioPlayer` host boundary;
- submit, review, and result compatibility;
- duplicate-submit idempotency;
- time-up while autosave is active;
- stale resume rejection;
- mobile and desktop layout;
- accessibility;
- future solo private-delivery cutover through PRD-0058.

The controlling runtime decision is:

```text
Solo/homework Listening remains a local, resume-driven runtime.
Live Listening remains a separate teacher-authoritative runtime.
```

This PRD is planning only. It does not authorize source edits, runtime edits, test edits, deployment, traceability-matrix creation, live Listening work, teacher-monitor work, Reading V2 runtime work, or a shared runtime abstraction.

## 2. Goals

1. Preserve `ListeningPracticeView` as the solo/homework runtime host.
2. Preserve local ownership of answers, viewed part, current audio, playback, timer, autosave, resume, submit, and review state.
3. Align shell, status, question, submit, and review presentation through neutral assessment primitives only where contracts are already proven.
4. Define one idempotent submit per solo/homework attempt.
5. Define deterministic ordering when time-up occurs during an accepted autosave.
6. Reject stale, incompatible, completed, or wrong-attempt resume state.
7. Preserve mobile state serialization, compatibility checks, hydration, and transient-overlay clearing.
8. Preserve desktop and mobile behavior without viewport-switch state loss.
9. Preserve result and review compatibility for legacy public R2 audio and future PRD-0058 asset references.
10. Define a host/adapter-only private-delivery cutover that does not edit `AudioPlayer` internals.
11. Keep live authority, teacher monitor, `audioCommand`, `masterAudioState`, `useAudioSync`, `ListeningTestPage`, and Reading V2 runtime protected.
12. Define exact files, bounded module homes, tests, browser proof, rollout gates, rollback, and stop conditions for later implementation.

## 3. User Stories

1. As a student taking solo Listening practice, I want my answers, timer, viewed part, and audio progress to survive a safe reload so I can continue without losing work.
2. As a student completing Listening homework, I want the correct homework attempt to resume automatically without reopening another attempt's state.
3. As a student, I want switching parts or crossing section boundaries to show and play the same destination section.
4. As a student, I want mobile and desktop layouts to preserve the same answers and playback state when the viewport changes.
5. As a student, I want one submit result even if I double-click, retry after a lost response, reload, or reach time-up while a save is active.
6. As a student, I want a recoverable message when autosave or submit fails, without duplicate result records.
7. As a student reviewing a completed attempt, I want the saved result and its audio references to remain compatible with legacy and new storage records.
8. As an accessibility user, I want timer, error, save, submit, playback, and review states to be keyboard and screen-reader usable.
9. As a reviewer, I want proof that solo/homework work did not edit or consume live teacher authority.
10. As a junior developer, I want exact ownership and stop rules so local solo state is not merged into live Listening or Reading V2 runtime.

## 4. Functional Requirements

### Runtime Host And Boundary

FR-001. `src/components/practice/ListeningPracticeView.tsx` must remain the solo/homework Listening runtime host.

FR-002. The runtime host must continue composing solo hooks for test data, timer, autosave, resume, and submission.

FR-003. `MobileListeningExamScaffold` must remain presentation-focused and host-controlled.

FR-004. `TestPageRouter` must not become a solo/homework state owner.

FR-005. `ListeningTestPage` must remain the live Listening student runtime and must not be modified by this child PRD.

FR-006. No shared runtime abstraction may be introduced between solo/homework Listening, live Listening, or Reading V2.

FR-007. Neutral shared assessment components may render local presentation state only. They must not own answers, playback, persistence, timer, submit, resume, or result writes.

### Answer, Question, And Section State

FR-008. `ListeningPracticeView` must remain the owner of current answers and current question number unless a bounded Listening-solo hook is approved under section 15.

FR-009. Viewed part state and current audio state must remain distinct because a view can be represented separately while navigation rules intentionally synchronize them.

FR-010. Explicit part navigation must move viewed context, current question context, destination audio index, audio error state, and playback intent under the active mobile Listening navigation contract.

FR-011. Question navigation that crosses a section boundary must select the destination section audio.

FR-012. Audio completion must mark the section completed, advance to the next section when one exists, move viewed/question context, and start the next section under existing rules.

FR-013. The last completed section must remain paused for review and submit.

FR-014. A presentation change must not reset answers, viewed part, current question, current audio index, playback position, volume, speed, or completed-section state.

### Timer

FR-015. Timer state must remain solo/homework-owned through `useSoloTimer` or an approved Listening-solo replacement hook.

FR-016. Resume must initialize elapsed time from compatible saved progress.

FR-017. Timer expiry must lock answer-changing actions before final submission begins.

FR-018. Timer expiry and manual submit must enter the same submission coordinator.

FR-019. Timer must stop or become inert after the attempt enters `submitting`, `submitted`, or terminal failure recovery state.

FR-020. The future implementation must not pass a constant submission state to the timer after submission coordination is introduced.

FR-021. Five-minute warning, grace-period, and time-up presentation must use repository-approved status/announcement behavior if the timer hook is touched.

### Autosave And Resume

FR-022. Autosave must continue using the platform storage abstraction.

FR-023. Autosave must persist answers, current question, elapsed time, scope context, attempt identity, and compatible mobile state.

FR-024. Autosave must expose an awaitable flush operation for submit/time-up coordination.

FR-025. Autosave must expose whether a save is accepted and in flight.

FR-026. A periodic autosave remains allowed, but submit must not depend on waiting for the next interval.

FR-027. Background, unload, and unmount save attempts remain best effort. They do not replace the awaited submit-time flush.

FR-028. Resume records must be scoped to self-study, course material, or the exact homework/submission attempt.

FR-029. Resume must reject wrong material, wrong mode, wrong course/module, wrong homework/submission, wrong mobile-state kind, incompatible question layout, expired progress, or already-completed attempt state.

FR-030. Stale resume state must be removed or marked unusable so it does not reopen repeatedly.

FR-031. Homework may auto-resume only the matching in-progress homework submission.

FR-032. Solo/self-study may show a resume choice when compatible progress exists.

FR-033. Resume must restore persisted state only. Transient submit, menu, instruction, pause, waiting, and overlay state must remain closed.

FR-034. Successful submit must clear the matching solo progress and student resume pointer after the durable result is confirmed.

FR-035. If result persistence succeeds but progress cleanup fails, the next resume lookup must detect the completed operation and reject the stale progress.

### Mobile State

FR-036. `mobileListeningState.ts` remains the single Listening mobile serialization/hydration helper.

FR-037. Mobile serialization must preserve compatibility metadata, viewed part, current question, text size, answer-sheet scroll, image zoom, and solo/homework playback state.

FR-038. Mobile playback state must continue containing current audio index, position, volume, speed, and completed audio indices.

FR-039. Playback hydration must remain optional so live/session consumers cannot inherit solo playback authority.

FR-040. Invalid playback fields must be dropped rather than trusted.

FR-041. Viewed part and current question must be clamped to the current test structure during hydration.

FR-042. Viewport switching between desktop and mobile must not create a second state owner or reset host state.

### Playback And Audio Boundary

FR-043. `ListeningPracticeView` must continue passing local playback props and callbacks into `AudioPlayer`.

FR-044. `AudioPlayer` may be wrapped or configured by the solo host, but this child PRD must not modify its internal source loading, refresh, synchronization, drift correction, play/pause, seek, or playback implementation.

FR-045. `useAudioSync` must not be modified, normalized, wrapped, or reused for solo/homework state.

FR-046. `audioCommand` and `masterAudioState` must not be read, written, normalized, mirrored, or migrated by solo/homework work.

FR-047. Solo/homework state must not include teacher authority revisions, trusted live timestamps, headphone approval, or monitor commands.

FR-048. Current public R2 playback must remain active until PRD-0058 private-delivery prerequisites and section 18 proof pass.

FR-049. Solo private delivery must integrate at a Listening-solo host/adapter boundary by resolving a playable URL before it is passed to `AudioPlayer`.

FR-050. If URL refresh, source handoff, or expiry recovery requires any `AudioPlayer` internal edit, solo private-delivery cutover is blocked until the approved Task 8 shared-player proof is complete.

FR-051. A blocked private-delivery cutover must not block presentation alignment, submit idempotency, timer, autosave, resume, mobile, accessibility, or public-playback verification.

### Submit, Review, And Result Compatibility

FR-052. Every active solo/homework attempt must have one stable attempt identity before the answering/timer state becomes active.

FR-053. Homework attempt identity must bind the exact `submissionId`, `homeworkId`, student, and material.

FR-054. Self-study and course-material attempt identity must be generated once and persisted in scoped solo progress.

FR-055. One attempt identity may produce no more than one final Listening result.

FR-056. The submit operation must use a stable idempotency identity derived from the attempt identity, not `Date.now()` or a new pushed result ID on each retry.

FR-057. Result persistence must target the existing canonical `test_results/{resultId}` family and existing result indexes. This child PRD introduces no new top-level result collection.

FR-058. A retry with the same submit identity and same payload must return the existing logical result.

FR-059. A retry with the same submit identity and materially different answers or attempt scope must fail into a recoverable conflict state.

FR-060. Pending submit must synchronously block duplicate manual, time-up, anti-cheat, and reload-triggered submit entry.

FR-061. UI disabled state is required but is not sufficient idempotency proof.

FR-062. When time-up occurs during an accepted autosave, the coordinator must await that in-flight save where possible, perform one final flush, freeze the answer snapshot, and execute one idempotent submit.

FR-063. If the final local save fails, submit may continue from the frozen in-memory answer snapshot, but the failure must be recorded and surfaced without creating a second result.

FR-064. If result persistence succeeds and the client loses the response, reload/retry must resolve the existing result by stable identity.

FR-065. Homework result persistence and homework-submission update must be recoverable as one logical operation. A retry must repair missing secondary state without creating another result.

FR-066. Result navigation must continue to use the canonical saved `resultId`.

FR-067. Immediate result display and later Academic Record/result-detail review must show the same result identity and score.

FR-068. Legacy result records with public R2 URLs must remain readable.

FR-069. New PRD-0058 asset-ID result records must use the approved Listening delivery resolver.

FR-070. Result-review private delivery remains PRD-0058/Task 6-owned. This child PRD must consume that contract and must not create a second result-review delivery path.

### Presentation, Accessibility, Observability, And Announcements

FR-071. Visual alignment must be incremental and limited to shell, status, question, submit, and review presentation.

FR-072. Shared primitives must be neutral and already proven in authoring or separately approved with two real consumers.

FR-073. No Reading V2 runtime component, hook, service, projection, timer, submit adapter, or CSS authority may be imported.

FR-074. New or renamed student actions must be registered and tracked under the existing feature registry.

FR-075. Resume, discard, submit, retry, save failure, and result recovery outcomes must use the shared announcement system where an announcement is appropriate.

FR-076. Future touched submit paths must not use `alert(...)` or `window.confirm(...)`.

FR-077. Loading, saving, saved, warning, failure, submitting, submitted, and recovery states must expose text/structure in addition to color.

FR-078. Visible mobile controls must meet the 44px by 44px interaction floor.

FR-079. No new direct browser storage, direct `window.innerWidth`, direct `window.matchMedia`, or direct router-hook coupling may be introduced.

## 5. Non-Goals / Out of Scope

This child PRD does not include:

1. Any code or source implementation in Packet 1F.
2. Live Listening behavior.
3. Live-session authority or synchronization.
4. Teacher monitor behavior.
5. `audioCommand` changes.
6. `masterAudioState` changes.
7. `useAudioSync` changes.
8. `ListeningTestPage` changes.
9. `TeacherTestMonitorPage` changes.
10. `AudioProgressPanel`, `TeacherTestControlBar`, or `HeadphoneRequestPanel` changes.
11. `AudioPlayer` internal changes.
12. Reading V2 runtime changes.
13. Reading V2 runtime visual alignment.
14. A shared Reading/Listening runtime abstraction.
15. A merged solo/live Listening state model.
16. Authoring Save draft/Publish/version implementation.
17. R2 registry, cleanup, reconciliation, or Worker implementation.
18. Result-review private-delivery implementation already owned by PRD-0058/Task 6.
19. Google Drive cleanup, migration, playback removal, or new behavior.
20. Teacher-facing mobile work.
21. Traceability-matrix creation.
22. Task 1.8, Task 2, or any implementation task.
23. Marking Task 1.7 complete.

## 6. Verified Current Solo/Homework Runtime Baseline

### Host And Hooks

1. `ListeningPracticeView.tsx:9-13` documents the current composition: `useSoloTestData`, `useSoloTimer`, `useSoloAutoSave`, `useSoloResume`, and `useSoloSubmission`.
2. `ListeningPracticeView.tsx:278-304` loads scoped saved progress and auto-resumes matching homework attempts while keeping the solo resume choice.
3. `ListeningPracticeView.tsx:310-321` owns answers/current question and hydrates them after resume.
4. `ListeningPracticeView.tsx:327-338` owns viewed part, current audio index, play state, error, position, volume, speed, and completed audio indices.

### Section And Playback Behavior

1. `ListeningPracticeView.tsx:399-448` toggles local playback, checkpoints position, marks completed audio, advances audio/viewed part/current question, and starts the next section.
2. `ListeningPracticeView.tsx:1210-1240` passes mobile host state and local `AudioPlayer` props/callbacks.
3. `ListeningPracticeView.tsx:1566-1585` passes the same local state into the desktop Listening header with `playerMode="solo"`.
4. `mobile-ielts-listening-audio-navigation.md` requires active section/question navigation to move destination audio and keeps solo/homework playback owned by `ListeningPracticeView`.

### Timer, Autosave, And Resume

1. `ListeningPracticeView.tsx:485-506` sends time-up into `submitTestRef`, creates the timer, and restores elapsed time.
2. Current host input passes `testSubmitted: false` into `useSoloTimer`; future submit coordination must make terminal timer state explicit.
3. `ListeningPracticeView.tsx:642-650` sends answers, current question, elapsed time, and mobile state to autosave.
4. `useSoloAutoSave.ts:19-20` saves every 30 seconds and uses seven-day progress expiry.
5. `useSoloAutoSave.ts:35-52` keeps current values in refs and prevents overlapping local saves with `isSavingRef`.
6. `useSoloAutoSave.ts:104-134` persists scoped progress through the platform storage abstraction.
7. `useSoloAutoSave.ts:140-167` runs periodic save plus best-effort background/unload/unmount flush, but it does not expose an awaitable submit-time flush to the host.
8. `useSoloResume.ts:33-90` reads scoped progress and reports it to the host.
9. `useSoloResume.ts:100-111` discards the matching progress record.

### Mobile State

1. `ListeningPracticeView.tsx:998-1039` builds a compatibility context and serializes viewed/question/display/playback state.
2. `ListeningPracticeView.tsx:1041-1086` hydrates only compatible mobile state, restores local playback, and closes transient overlays.
3. `ListeningPracticeView.tsx:1094-1100` bridges dirty serialized state to autosave.
4. `mobileListeningState.ts:105-117` defines the hydrated Listening mobile playback shape.
5. `mobileListeningState.ts:176-245` clamps viewed/question state, drops invalid entries, and includes playback only when requested.
6. `mobileListeningState.ts:267-287` serializes versioned Listening state plus compatibility metadata.
7. `mobileListeningState.ts:292-320` explicitly clears transient UI state.
8. `MobileListeningExamScaffold.tsx:34-115` declares part, timer, answer, submit, session, audio-row, and overlay state as host-owned.
9. `MobileListeningExamScaffold.tsx:145-293` renders the four-row shell and prop-controlled overlays without persistence or runtime authority.

### Submit And Review

1. `ListeningPracticeView.tsx:580-629` delegates marking/result persistence to `useSoloSubmission` and funnels manual/automatic submit through one ref.
2. `useSoloSubmission.ts:123-126` tracks local `isSubmitting`, `testSubmitted`, results, and lock state.
3. `useSoloSubmission.ts:247` blocks a later call when React state already reports submitting/submitted.
4. `useSoloSubmission.ts:336-360` calls `saveTestResult`.
5. `testResults.service.ts:726-732` currently pushes a new result ID for each call.
6. Therefore current UI guard is useful but is not durable double-submit or lost-response idempotency.
7. `useSoloSubmission.ts:381-436` updates homework submission after the result write; a partial failure can leave the result saved while homework state update fails.
8. `useSoloSubmission.ts:451-463` navigates homework to Homework and solo/course to Academic Record with the result ID.
9. `ListeningPracticeView.test.tsx:366-415` proves submit sheet then confirm flow.
10. `ListeningPracticeView.test.tsx:470-515` proves time-up closes transient overlays.
11. `ListeningPracticeView.test.tsx:806-824` proves result display after submission.
12. No inspected test proves two rapid submits, lost-response retry, time-up/manual collision, or durable result idempotency.

### AudioPlayer And Router Boundaries

1. `AudioPlayer.tsx:150-174` distinguishes solo, online, and offline modes and invokes `useAudioSync` only for online master state.
2. `AudioPlayer.tsx:221-233` makes live online playback teacher-controlled while solo uses local `isPlaying`.
3. `AudioPlayer.tsx:761-854` owns play/pause synchronization and source reload/restart.
4. `AudioPlayer.tsx:862-904` owns seek application and seek restrictions.
5. `AudioPlayer.test.tsx` covers solo play tap, mobile layout, speed synchronization, source-change restart, and section completion.
6. `TestPageRouter.tsx:658-701` routes live `Listening` to `ListeningTestPage`; it is not the solo/homework host.
7. `TestPageRouter.test.tsx` contains no Listening solo/homework state coverage.

### Existing Test Coverage And Gaps

Existing tests prove:

- submit confirmation flow;
- time-up overlay precedence;
- homework auto-resume;
- solo resume choice;
- mobile autosave after audio advance;
- compatible mobile hydration;
- wrong-kind/wrong-scope rejection;
- transient overlay clearing;
- mobile scaffold prop forwarding;
- mobile serialization and playback include/omit behavior;
- local `AudioPlayer` control and source-change behavior.

Missing target proof:

- one durable result under rapid double submit;
- one durable result after lost response and reload;
- time-up while autosave is in flight;
- manual submit racing time-up;
- result write success plus homework update failure/retry;
- completed-attempt stale resume rejection;
- viewport switching without answer/playback reset;
- keyboard/mobile answer visibility;
- private-delivery host cutover without `AudioPlayer` internals;
- legacy/new result-review audio compatibility in the solo flow.

## 7. Target Solo/Homework Runtime Boundary

Target ownership:

```text
ListeningPracticeView
  -> owns solo/homework orchestration and local UI state
  -> composes solo hooks and Listening-specific bounded helpers
  -> adapts local state into presentation props
  -> resolves a playable audio source through a solo delivery adapter
  -> passes local playback props to AudioPlayer

MobileListeningExamScaffold
  -> renders host-provided mobile presentation only

AudioPlayer
  -> remains shared Listening playback implementation
  -> receives resolved URL and local solo props
  -> receives live master state only from live runtime
```

Required boundary rules:

1. Solo/homework state is local and resume-driven.
2. Live state is teacher-authoritative and remains separate.
3. A component may be visually shared without sharing state authority.
4. Shared presentation accepts neutral values and callbacks only.
5. No neutral component may import solo hooks, live hooks, result services, storage services, or audio authority.
6. `ListeningPracticeView` may delegate bounded responsibilities but remains the host.
7. State migration must be behavior-preserving and incremental.
8. Runtime presentation may align with neutral assessment language but must not copy Reading V2 runtime internals.

## 8. Dependencies On PRD-0057 And PRD-0058

### PRD-0057 Authoring Dependency

1. Solo/homework runtime implementation starts only after Task 5 authoring stability acceptance.
2. Assigned/homework tests must consume an immutable published Listening version after PRD-0057 implementation.
3. Existing in-progress homework attempts must remain pinned to their assigned version.
4. Solo/homework runtime must not read mutable authoring drafts.
5. Legacy mutable records remain supported through the approved Listening read adapter.
6. This child PRD does not implement Save draft, Publish, revision drafts, immutable versions, or authoring conflict handling.

### PRD-0058 Storage And Delivery Dependency

1. Existing public R2 delivery remains the baseline until PRD-0058 prerequisites are implemented and proven.
2. New asset-ID records must resolve through the PRD-0058 Listening delivery service.
3. Solo private delivery depends on:
   - canonical `assetId`;
   - retained reference authorization;
   - legacy/public read compatibility;
   - 60-minute authorized URL issuance;
   - refresh beginning below 10 minutes;
   - byte-range and seek proof;
   - Chrome, Edge, Safari, and iOS Safari proof;
   - rollback to public delivery.
4. Result-review delivery remains PRD-0058/Task 6-owned.
5. Solo host cutover may consume the approved resolver after Task 6 proof.
6. Live traffic remains public until Task 8 approval and proof.
7. If solo cutover needs `AudioPlayer` source refresh or handoff internals, the cutover stops and waits for Task 8 shared-player proof.

## 9. Runtime State Ownership

| State | Current/Target Owner | Persistence | Must Not Move To |
| --- | --- | --- | --- |
| Test payload | `useSoloTestData` / student-safe delivery adapter | source read only | shared presentation, live session |
| Answers | `ListeningPracticeView` or bounded solo answer hook | solo progress until result submit | scaffold, `AudioPlayer`, live state |
| Current question | `ListeningPracticeView` | solo progress | scaffold, router |
| Viewed part | `ListeningPracticeView` | mobile state | `AudioPlayer`, live master state |
| Current audio index | `ListeningPracticeView` | solo mobile playback state | `masterAudioState` |
| Playing intent | `ListeningPracticeView` | local runtime; not restored as live authority | `audioCommand` |
| Audio position | `ListeningPracticeView` via `AudioPlayer` callback | solo mobile playback state | teacher monitor |
| Volume | `ListeningPracticeView` | solo mobile playback state | live authority |
| Playback speed | `ListeningPracticeView` | solo mobile playback state | live authority |
| Completed audio indices | `ListeningPracticeView` | solo mobile playback state | shared presentation |
| Timer | `useSoloTimer` plus submit coordinator phase | elapsed time in solo progress | live timer, Reading V2 timer |
| Autosave | `useSoloAutoSave` | platform storage | scaffold |
| Resume lookup | `useSoloResume` / `soloProgress.service` | scoped platform storage | router, live session |
| Attempt identity | bounded solo attempt state | scoped solo progress and result row | live session |
| Submit phase | bounded solo submit coordinator | result operation identity | scaffold, `AudioPlayer` |
| Result | existing result service and indexes | `test_results/{resultId}` family | local mobile state |
| Private playback URL | PRD-0058 resolver through solo adapter | short-lived runtime value only | saved result, mobile state |

State rules:

1. Host state remains one source of truth across desktop/mobile render branches.
2. Presentation branches receive state; they do not duplicate it.
3. Persisted mobile state contains no short-lived signed URL.
4. Persisted progress contains stable attempt identity but no live authority data.
5. Result rows contain stable submit identity needed for idempotent recovery.
6. No state table row may be mapped to Reading V2 runtime.

## 10. Playback And AudioPlayer Boundary

Allowed:

1. Configure existing `AudioPlayer` props from `ListeningPracticeView`.
2. Wrap `AudioPlayer` in neutral/local presentation.
3. Resolve public, legacy, or authorized URL before rendering `AudioPlayer`.
4. Preserve local callbacks for play/pause, time update, section completion, error, volume, speed, and seek position.
5. Run `AudioPlayer` tests as a protected regression suite.

Forbidden:

1. Edit `AudioPlayer.tsx` internals.
2. Edit or normalize `useAudioSync`.
3. Add solo behavior to `masterAudioState`.
4. Add solo commands to `audioCommand`.
5. Import monitor hooks into solo runtime.
6. Add teacher timestamp/revision logic to solo state.
7. Persist authorized URLs in result or resume state.
8. Make `MobileListeningExamScaffold` an audio authority.
9. Create a second playback implementation for private delivery.

Private-delivery host contract:

```text
published/version audio reference
  -> Listening solo delivery adapter
  -> PRD-0058 resolver
  -> playable URL + expiry metadata
  -> ListeningPracticeView
  -> AudioPlayer props
```

The adapter may refresh a host-level URL only when the current `AudioPlayer` contract can accept the new resolved URL without internal modification. Otherwise the cutover remains blocked.

## 11. Timer, Autosave, Resume

### Timer State Machine

```text
not-started -> active -> grace/locking -> submitting -> submitted
                         \-> recoverable-submit-error
```

Rules:

1. Attempt identity and compatible progress load before `active`.
2. `active` permits answers and periodic autosave.
3. Grace/time-up locks answer mutation.
4. One frozen answer snapshot is used for final submit.
5. `submitting` prevents timer callbacks from starting another submit.
6. Recoverable submit error keeps the same attempt and submit identity.
7. Submitted state clears progress only after durable result confirmation.

### Autosave Contract

Required return contract for later implementation:

```ts
interface SoloAutoSaveController {
  status: 'idle' | 'saving' | 'saved' | 'error';
  lastSaved: number | null;
  error: string | null;
  flushNow: () => Promise<{
    outcome: 'saved' | 'skipped' | 'failed';
    savedAt: number | null;
    error: string | null;
  }>;
  waitForAcceptedSave: () => Promise<void>;
}
```

The exact implementation may preserve existing hook exports through a compatible extension, but submit/time-up must receive an awaitable controller.

### Resume Compatibility

Resume compatibility must verify:

1. `materialId`;
2. student ID;
3. scope mode;
4. course/module identity when applicable;
5. homework/submission identity when applicable;
6. attempt identity;
7. progress expiry;
8. current published/version identity when available;
9. question layout signature for mobile state;
10. attempt/result completion status.

Stale-state outcomes:

1. Wrong scope or layout: discard incompatible state and start from safe defaults.
2. Completed attempt/result: clear progress and open canonical result/review when appropriate.
3. Expired progress: clear and start fresh.
4. Missing immutable version: show recoverable unavailable state; do not silently load a different version.
5. Temporary read failure: keep retry/discard choices; do not overwrite saved progress with empty state.

## 12. Submit, Review, And Idempotency

### Stable Attempt And Submit Identity

1. Create one opaque, Firebase-key-safe `attemptId` before the test becomes active.
2. Persist `attemptId` in `SoloSessionProgress`.
3. For homework, bind `attemptId` to the exact existing `submissionId`.
4. Use one stable `submissionOperationId` per attempt. For this runtime, one final submit means the operation may be derived from the attempt identity.
5. Use a deterministic result ID derived from the stable operation identity.
6. Persist operation identity in the result record.
7. Never derive final idempotency from click time or response time.

### Submit Coordinator

Required phases:

```text
idle
  -> flushing-progress
  -> freezing-answers
  -> writing-result
  -> repairing-secondary-state
  -> submitted
  -> recoverable-error
```

Rules:

1. Entry lock must be synchronous, not dependent only on a later React render.
2. Manual submit, time-up, anti-cheat auto-submit, and retry call the same coordinator.
3. The first accepted call owns the operation.
4. Later calls join or return the existing operation promise/result.
5. Result write is canonical.
6. Existing result with same identity and same attempt hash returns success.
7. Existing result with mismatched identity/payload returns conflict.
8. Homework secondary update may retry after canonical result success.
9. Result feedback/notification side effects must be idempotent or guarded so a retry does not duplicate user-visible events.
10. Progress cleanup occurs after canonical result success.

### Result And Review Compatibility

1. Preserve existing result fields used by Academic Record, result detail, score display, feedback, and teacher visibility.
2. Preserve canonical `resultId` navigation.
3. Preserve immutable test/version identity after PRD-0057 implementation.
4. Preserve legacy public audio URL reads.
5. Consume PRD-0058 result-review resolver for new asset-ID records.
6. Do not store authorized URL values in result rows.
7. Immediate results and later review must agree on score, answers, question mapping, and audio reference.
8. A private-delivery failure in review must not mutate result data.

## 13. Mobile/Desktop Layout

### Shared State, Separate Presentation

1. Desktop and mobile render branches consume the same host state.
2. Viewport change must not remount a second attempt owner.
3. Viewport change must not reset answers, current question, viewed part, audio index, position, volume, speed, or completed sections.
4. Mobile state remains supplementary persistence for mobile-only presentation details.
5. Desktop state must not overwrite compatible mobile playback state with defaults during a viewport transition.

### Mobile

1. Preserve four-row scaffold: header, audio row, part tabs, main content.
2. Keep audio row and part tabs visible under existing contract.
3. Keep submit sheet, answer sheet, instructions, text size, and overflow surfaces mutually understandable.
4. Blocking states close transient overlays.
5. Answer controls remain visible above the mobile keyboard.
6. No unintended horizontal page overflow at 375px or 320px.
7. Visible controls meet 44px by 44px.
8. Tabs may scroll only as an intentional reachable row.
9. Image mode preserves image/question/audio section synchronization.

### Desktop And Tablet

1. Preserve existing Listening delivery IA and result flow.
2. Keep question content and answer controls readable without nested card stacks.
3. Preserve section/question navigation and local playback state.
4. Verify relevant tablet widths without introducing teacher-mobile scope.
5. Presentation alignment must not wrap runtime state in `StudentLayout` unless a separate route/shell architecture change is approved.

## 14. Accessibility Requirements

1. Loading state uses status semantics.
2. Recoverable load/save errors use alert semantics when immediate attention is required.
3. Autosave state has text accessible to screen readers.
4. Timer warning is announced without repeatedly interrupting the user.
5. Time-up and submit failure use alert semantics.
6. Submit success/result transition has a clear heading and focus target.
7. Submit, retry, resume, discard, play, pause, volume, speed, section, answer-sheet, and close controls have accessible names.
8. Icon-only controls expose stable accessible names.
9. State is not conveyed by color alone.
10. Keyboard users can move through questions, parts, answers, playback controls, submit, and review.
11. Focus remains visible.
12. Opening a modal/sheet moves focus appropriately; closing returns focus to the invoking control.
13. Blocking overlays prevent interaction with hidden content.
14. Heading order remains logical across loading, runtime, submit, and result views.
15. Answer inputs remain associated with visible question labels/instructions.
16. Mobile touch targets meet the 44px floor.
17. Zoom/text-size behavior must not hide answer controls or force unintended horizontal scrolling.
18. Reduced-motion preferences apply to any new transition.
19. Shared announcements use `role="status"` for success/info/warning and `role="alert"` for failures.
20. Accessibility changes must not move runtime authority into shared presentation.

## 15. File Architecture And Bounded Module Homes

Existing host/facades remain:

- `src/components/practice/ListeningPracticeView.tsx` - orchestration host.
- `src/hooks/solo/useSoloTestData.ts` - student-safe test data.
- `src/hooks/solo/useSoloTimer.ts` - timer.
- `src/hooks/solo/useSoloAutoSave.ts` - scoped platform-storage persistence.
- `src/hooks/solo/useSoloResume.ts` - progress lookup/discard.
- `src/hooks/solo/useSoloSubmission.ts` - current submit facade.
- `src/services/testResults.service.ts` - canonical result persistence/index owner.
- `src/components/test/mobile/mobileListeningState.ts` - mobile serialization/hydration.

New behavior, if required, must use a coherent Listening-only bounded home:

```text
src/features/assessment/listening/runtime/solo/
```

Proposed bounded modules:

1. `listeningSoloAttempt.types.ts`
   - owns attempt identity, submit phase, save outcome, and recovery types;
   - imports no React, Firebase, audio, or live hooks.
2. `listeningSoloAttemptIdentity.ts`
   - creates and validates stable attempt/submit identity;
   - binds homework attempts to existing submission identity.
3. `listeningSoloSubmitCoordinator.ts`
   - coordinates awaited autosave, answer freeze, canonical result write, secondary repair, and cleanup;
   - imports narrow persistence interfaces only.
4. `listeningSoloResultPersistenceAdapter.ts`
   - adapts stable result identity to the existing result service;
   - does not create a second result store.
5. `listeningSoloResumePolicy.ts`
   - evaluates scope, expiry, version/layout compatibility, and completed-attempt state;
   - does not read live-session state.
6. `listeningSoloDeliveryAdapter.ts`
   - consumes PRD-0058 resolver and returns a playable URL/expiry contract to the host;
   - stores no authorized URL.
7. Focused tests beside each module.

File rules:

1. New human-maintained production files target 400 lines or fewer.
2. `ListeningPracticeView.tsx` is a named large file and requires a full-read map before later implementation edits.
3. Before/after line counts and responsibility deltas are required for every touched large file.
4. Existing hooks remain facades where practical.
5. Do not create a generic `assessmentRuntime`, `sharedRuntime`, or Reading/Listening runtime package.
6. No module under the solo bounded home may import live hooks, monitor hooks, Reading V2 runtime, or teacher pages.

## 16. Owned And Protected Files

### Owned Or Conditionally Owned Future Implementation Files

1. `src/components/practice/ListeningPracticeView.tsx` - orchestration and presentation wiring only.
2. `src/components/practice/ListeningPracticeView.test.tsx` - host/runtime regressions.
3. `src/hooks/solo/useSoloTimer.ts` and focused tests - timer phase integration.
4. `src/hooks/solo/useSoloAutoSave.ts` and focused tests - awaitable flush and in-flight save contract.
5. `src/hooks/solo/useSoloResume.ts` and focused tests - stale/completed compatibility policy.
6. `src/hooks/solo/useSoloSubmission.ts` and focused tests - facade delegation and existing compatibility.
7. `src/services/soloProgress.service.ts` and tests - stable attempt identity and scoped progress.
8. `src/types/practice.types.ts` - solo progress/attempt fields only.
9. `src/components/test/mobile/mobileListeningState.ts` and tests - only if versioned state contract needs a compatible extension.
10. `src/components/test/mobile/MobileListeningExamScaffold.tsx` and tests - presentation-only alignment.
11. Future `src/features/assessment/listening/runtime/solo/**`.
12. `src/services/testResults.service.ts` and tests only for an approved backward-compatible stable-result-id/idempotency entrypoint.
13. `src/components/results/ReviewTab.test.tsx` or result-review tests only for compatibility proof; result-review delivery implementation remains PRD-0058-owned.
14. `src/config/featureRegistry.ts` and test only if actions are added or renamed.
15. Packet findings/task docs required by the approved implementation task.

### Protected Files And Paths

1. `src/skills/listening/components/AudioPlayer.tsx`
2. `src/skills/listening/components/ListeningTestPage.tsx`
3. `src/pages/TeacherTestMonitorPage.tsx`
4. `src/components/test/AudioProgressPanel.tsx`
5. `src/components/test/TeacherTestControlBar.tsx`
6. `src/components/test/HeadphoneRequestPanel.tsx`
7. `src/hooks/audio/useMasterAudioState.ts`
8. `src/hooks/audio/useAudioSync.ts`
9. `src/hooks/monitor/useMonitorControls.ts`
10. `src/pages/TestPageRouter.tsx`
11. `audioCommand` data paths and schemas
12. `masterAudioState` data paths and schemas
13. Reading V2 runtime components, hooks, services, projections, adapters, CSS, and tests
14. `cloudflare/**`
15. `r2-backup-worker/**`
16. `database.rules.json`, `firestore.rules`, and `firebase.json` unless a separately approved implementation need proves a rule change is required
17. PRD-0057 authoring implementation files except read-only compatibility verification
18. PRD-0058 registry/reconciliation/cleanup internals except the approved resolver interface
19. Teacher-monitor browser flows
20. Google Drive services/tests

Protected files may be read and their tests may be run. They must not be modified by this child PRD implementation.

## 17. Testing Strategy

### Characterization Baseline

Before implementation:

1. Run current `ListeningPracticeView` tests.
2. Run solo hook tests.
3. Run mobile scaffold/state tests.
4. Run `AudioPlayer` tests as protected behavior proof.
5. Run result service and result-review compatibility tests relevant to Listening.
6. Record current pass/fail and existing gaps.

### Attempt And Resume Tests

1. Attempt identity exists before active timer/answering.
2. Self-study reload reuses the same attempt identity.
3. Course-material reload reuses the same scoped attempt identity.
4. Homework reload binds the exact homework/submission.
5. Wrong homework/submission state is rejected.
6. Wrong material/version/layout state is rejected.
7. Expired progress is cleared.
8. Completed result state clears stale progress.
9. Temporary resume read failure preserves retry/discard behavior.
10. Transient overlays remain closed after resume.

### Timer And Autosave Tests

1. Timer initializes from saved elapsed time.
2. Timer becomes inert after submit begins.
3. Autosave persists attempt identity and current state.
4. `flushNow` awaits an accepted save.
5. Repeated flush joins the same in-flight save.
6. Time-up during save waits for accepted save then submits once.
7. Save failure uses frozen in-memory answers and submits once.
8. Manual submit and time-up collision submit once.
9. Anti-cheat auto-submit and time-up collision submit once.

### Submit Idempotency Tests

1. Rapid double click creates one result.
2. Manual retry while pending returns the same operation.
3. Lost result response then retry returns the existing result.
4. Reload after result write resolves existing result.
5. Same identity plus changed payload fails conflict.
6. Canonical result exists but homework update missing: retry repairs homework state without a new result.
7. Result notification/feedback side effects are not duplicated.
8. Progress cleanup failure does not reopen a completed attempt.
9. Existing non-Listening result writes remain backward compatible if the shared result service is touched.

### Playback And Mobile Tests

1. Part navigation changes viewed/question/audio state together.
2. Cross-section question navigation changes destination audio.
3. Audio completion advances state and autosave payload.
4. Last section remains paused.
5. Mobile hydration restores valid local playback.
6. Invalid mobile playback is dropped.
7. Desktop-to-mobile and mobile-to-desktop viewport changes preserve state.
8. Image mode keeps image/question/audio synchronized.
9. `AudioPlayer.tsx` has no diff.
10. `AudioPlayer` protected tests remain green.

### Presentation And Accessibility Tests

1. Loading/error/save/submit/recovery roles are correct.
2. Submit and retry controls expose disabled/busy state.
3. Resume/discard controls have accessible names.
4. Focus moves to blocking error or result heading.
5. Mobile controls meet 44px.
6. Answer inputs remain reachable with mobile keyboard.
7. No unintended horizontal overflow at 375px and 320px.
8. Color is not the only state signal.
9. No `alert(...)` or `window.confirm(...)` remains in touched outcome paths.
10. Feature actions remain registered/tracked.

### Delivery And Result Compatibility Tests

1. Legacy public URL solo playback still works.
2. New asset-ID resolver returns authorized playable URL.
3. Authorized URL is not persisted in progress/result.
4. Range/seek behavior passes before private cutover.
5. Long playback across refresh window passes without internal player edits.
6. If host-level refresh cannot pass, cutover is reported blocked.
7. Immediate result and later result review use the same result.
8. Legacy and new result audio review remain compatible through PRD-0058 resolver.

### Boundary Scans

Required scans must prove:

1. no modified live runtime file;
2. no modified teacher-monitor file;
3. no modified `AudioPlayer.tsx`;
4. no modified Reading V2 runtime file;
5. no solo import of `useAudioSync`, `useMasterAudioState`, or monitor hooks;
6. no solo read/write of `audioCommand` or `masterAudioState`;
7. no new shared runtime package;
8. no direct browser storage or direct viewport API added.

## 18. Browser Proof Plan

Browser proof is future implementation evidence, not part of Packet 1F.

### Environment

1. Student server URL: `http://localhost:5174`.
2. Never use `127.0.0.1`.
3. Use Student quick-login from the login page:
   - open bottom-right settings control;
   - select `Student`;
   - verify `student@test.com`.
4. Start from natural student routes:
   - Library/self-study launch for solo;
   - Homework list/detail launch for homework.
5. Do not use teacher monitor.
6. Keep teacher and student auth contexts separate if teacher setup is required.

### Viewports And Browsers

1. Desktop Chrome at 1440px.
2. Tablet/collapsed layout at 1024px and 768px where relevant.
3. Phone at 375px.
4. Dense phone at 320px.
5. Current Edge desktop.
6. Desktop Safari where available.
7. iOS Safari for mobile/private audio proof.

### Scenarios

1. Launch solo from Library and answer questions.
2. Switch parts and verify viewed question/audio source alignment.
3. Reload and resume answers/timer/playback.
4. Switch desktop/mobile viewport without state reset.
5. Complete one audio section and verify next section/autosave.
6. Open/close submit and other overlays; trigger time-up precedence.
7. Double-click submit and prove one network result write.
8. Simulate lost submit response; retry/reload and recover one result.
9. Trigger time-up during delayed autosave; prove one result.
10. Launch homework from Homework; auto-resume exact attempt.
11. Present wrong/stale resume fixture and prove safe rejection.
12. Verify result screen then Academic Record/result detail use same result ID.
13. Verify legacy public result audio.
14. Verify new asset-ID result audio through PRD-0058 resolver.
15. Verify public/private solo playback, long playback, seek, expiry/refresh, and fallback.
16. Verify answer controls above mobile keyboard.
17. Verify keyboard navigation and screen-reader semantics.
18. Verify no unintended horizontal overflow.

### Required Evidence

1. Exact route and role.
2. Viewport/browser.
3. Fixture material/homework/submission/result IDs.
4. Expected and actual state.
5. Network result write count and response.
6. Durable `test_results/{resultId}` and index evidence.
7. Homework submission recovery evidence when applicable.
8. Screenshots/traces.
9. Playwright JSON report:

```powershell
npx playwright test <approved-spec> --reporter=json > report.json
```

10. Public/private delivery response headers including range proof.
11. Proof that live paths and teacher monitor were not opened or changed.

## 19. Rollout Plan

Future implementation must use separate reversible phases.

### Phase 0: Approval And Baseline

1. Obtain product-owner plus architecture reviewer approval.
2. Confirm PRD-0057 authoring stability acceptance.
3. Confirm PRD-0058 dependency status.
4. Create full large-file map for `ListeningPracticeView.tsx`.
5. Record baseline tests and current public playback.

### Phase 1: Submit/Resume Safety

1. Add stable attempt identity.
2. Add awaitable autosave flush.
3. Add idempotent submit coordinator.
4. Add stale/completed resume rejection.
5. Preserve current visual presentation.
6. Roll out to internal fixtures first.

### Phase 2: Presentation Alignment

1. Adopt only proven neutral wrappers.
2. Change one display region per patch.
3. Preserve all state ownership.
4. Run focused desktop/mobile/accessibility proof after each patch.

### Phase 3: Solo Private Delivery

1. Start only after PRD-0058 issuance/range/result proof.
2. Integrate at solo host/adapter boundary.
3. Keep live traffic public.
4. If `AudioPlayer` internals are required, stop this phase and wait for Task 8 proof.
5. Run internal and selected-student solo/homework cohorts.

### Phase 4: Percentage Rollout

1. Expand solo/homework cohort only after submit, resume, playback, and result metrics remain healthy.
2. Keep independent rollback controls for submit coordinator, presentation, and private delivery.
3. Stop immediately for duplicate result, lost answers, wrong audio, stale resume, mobile regression, result-review regression, or unauthorized delivery.

Rollback:

1. Return submit orchestration to prior code only if no new attempt is left without a readable result.
2. Keep stable result rows; never delete results as rollback.
3. Disable private delivery and return solo to public resolver without mutating result/asset data.
4. Revert presentation wrappers independently.
5. Preserve progress/result compatibility readers during rollback.

## 20. Acceptance Criteria

1. `ListeningPracticeView` remains solo/homework host.
2. Solo hooks remain runtime owners behind bounded Listening-specific modules where needed.
3. Answer, viewed part, current audio, playback, timer, autosave, resume, and submit ownership is explicit.
4. Mobile scaffold remains presentation-only.
5. Mobile state preserves compatibility, local playback, clamping, and transient reset.
6. Desktop/mobile viewport change does not reset runtime state.
7. Manual/time-up/anti-cheat/retry submit paths converge on one coordinator.
8. Rapid double submit creates one result.
9. Lost-response retry returns one result.
10. Time-up during autosave produces one result from one frozen answer snapshot.
11. Homework partial failure repairs secondary state without duplicate result.
12. Stale/completed/wrong-attempt resume state is rejected and does not loop.
13. Immediate result and later result review use the same result identity.
14. Legacy public result audio remains compatible.
15. New asset-ID result/solo audio consumes PRD-0058 resolver.
16. Private solo cutover occurs only at host/adapter boundary.
17. If `AudioPlayer` internals are needed, private cutover remains blocked until Task 8 proof.
18. `AudioPlayer.tsx`, live Listening, teacher monitor, live authority hooks/paths, and Reading V2 runtime remain untouched.
19. No shared runtime abstraction or merged solo/live state model is introduced.
20. Accessibility requirements pass.
21. Browser proof uses `localhost:5174` and natural student routes.
22. Rollback is independently proven for behavior, presentation, and delivery phases.

## 21. Regression Checklist

- [ ] `ListeningPracticeView` remains solo/homework host.
- [ ] `ListeningTestPage` unchanged.
- [ ] `TeacherTestMonitorPage` unchanged.
- [ ] `AudioPlayer.tsx` unchanged.
- [ ] `useAudioSync` unchanged.
- [ ] `useMasterAudioState` unchanged.
- [ ] `useMonitorControls` unchanged.
- [ ] `audioCommand` unchanged.
- [ ] `masterAudioState` unchanged.
- [ ] Reading V2 runtime unchanged.
- [ ] No shared runtime abstraction added.
- [ ] No solo/live state model merge.
- [ ] Answers persist and resume.
- [ ] Current question persists and resumes.
- [ ] Viewed part persists and resumes.
- [ ] Current audio index persists and resumes.
- [ ] Audio position persists and resumes.
- [ ] Volume persists and resumes.
- [ ] Playback speed persists and resumes.
- [ ] Completed audio indices persist and resume.
- [ ] Invalid mobile playback is dropped.
- [ ] Wrong scope/layout resume is rejected.
- [ ] Completed attempt resume is rejected.
- [ ] Homework auto-resume uses exact submission.
- [ ] Solo resume choice remains available.
- [ ] Part navigation changes destination audio.
- [ ] Cross-section question navigation changes destination audio.
- [ ] Audio completion advances section/question/audio.
- [ ] Last section remains paused.
- [ ] Viewport switching preserves answers/playback.
- [ ] Mobile keyboard does not cover answer controls.
- [ ] No horizontal overflow at 375px or 320px.
- [ ] Mobile controls meet 44px by 44px.
- [ ] Timer resumes from elapsed time.
- [ ] Timer stops/inerts after submit starts.
- [ ] Awaitable autosave flush exists.
- [ ] Time-up during autosave submits once.
- [ ] Manual/time-up collision submits once.
- [ ] Rapid double click submits once.
- [ ] Lost response retry returns existing result.
- [ ] Homework secondary update retry creates no second result.
- [ ] Result side effects are not duplicated.
- [ ] Progress cleanup occurs after durable result.
- [ ] Stale cleanup failure does not reopen completed attempt.
- [ ] Immediate result and later review agree.
- [ ] Legacy public result audio works.
- [ ] New asset-ID result audio uses PRD-0058 resolver.
- [ ] Authorized URL is not persisted.
- [ ] Solo private delivery stays at host/adapter boundary.
- [ ] Private cutover blocks if player internals are required.
- [ ] Live traffic remains public until Task 8.
- [ ] Loading/error/save/submit/recovery semantics pass.
- [ ] Keyboard and screen-reader paths pass.
- [ ] Shared announcement rules pass.
- [ ] Observability registration remains synchronized.
- [ ] No direct browser storage/viewpoint/router bypass added.

## 22. Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| React state guard loses rapid-submit race | Duplicate result rows | Synchronous coordinator lock plus stable result identity |
| Result write succeeds but response is lost | Retry creates another result | Deterministic result ID and same-operation lookup |
| Homework update fails after result write | Homework appears incomplete despite result | Repairable secondary phase keyed to canonical result |
| Time-up races autosave/manual submit | Lost latest answer or duplicate submit | Await accepted save, final flush, freeze once, submit once |
| Timer continues after result | Extra callbacks or repeated submit | Explicit submit phase drives timer inert state |
| Resume loads wrong homework attempt | Cross-attempt answers/audio | Exact scope/submission/attempt validation |
| Completed progress reopens | Student sees stale attempt | Stable result identity check and stale progress cleanup |
| Mobile/desktop branches duplicate state | Viewport switch loses progress | One host owner; presentation branches consume props |
| Private URL persisted | Expired or leaked playback reference | Persist asset/public compatibility reference only |
| Solo private cutover edits player internals | Live playback regression | Block cutover until Task 8 shared-player proof |
| Shared wrapper owns runtime behavior | Cross-module coupling | Neutral props only; local callbacks remain host-owned |
| Reading V2 runtime imported for visual alignment | Runtime contracts collapse | Protected import/diff scans |
| Touched Mantine alert/notification remains | Rule/design inconsistency | Replace touched outcome path with shared announcement system |
| Result-service change breaks other skills | Cross-skill submission regression | Backward-compatible entrypoint and broad result-service tests |
| No real mobile/browser proof | Keyboard/audio/range issues escape | Required 375/320/iOS Safari and network evidence |

## 23. Open Questions

No parent-level or Packet 1F product question remains open.

Implementation stop conditions:

1. PRD-0057 authoring stability acceptance is missing.
2. Product owner or architecture reviewer has not approved this child PRD.
3. Stable attempt/result identity cannot be added without changing unrelated result contracts.
4. Exact immutable Listening version identity is unavailable after PRD-0057 implementation.
5. PRD-0058 resolver/read-authorization/range proof is missing for private cutover.
6. Solo private delivery requires `AudioPlayer` internal edits before Task 8 proof.
7. A proposed change needs live authority, teacher monitor, Reading V2 runtime, Worker, registry, cleanup, or new Firebase path work.
8. A proposed neutral primitive would own playback, persistence, submit, resume, or result behavior.
9. Browser proof cannot use the required natural student route and `localhost:5174`.

When a stop condition is met, preserve current public solo playback and record the blocked subphase. Do not cross the protected boundary.

## 24. Definition Of Done

Packet 1F child-PRD creation is done when:

1. This file exists at `tasks/0059-prd-listening-solo-homework-runtime-alignment.md`.
2. Task number `0059` was verified available before creation.
3. Sections 1 through 24 exist.
4. Current solo/homework runtime baseline is source- and test-grounded.
5. PRD-0057 and PRD-0058 dependencies are explicit.
6. Runtime state ownership is explicit.
7. Playback and `AudioPlayer` protected boundaries are explicit.
8. Timer, autosave, resume, submit, review, idempotency, stale state, layout, accessibility, tests, browser proof, rollout, rollback, and risks are defined.
9. Findings contain Packet 1F evidence.
10. PRD-0055 tasklist registers PRD-0056, PRD-0057, PRD-0058, and PRD-0059 through status/registration text only.
11. Task 1.7 remains unchecked.
12. Banned-term, scope, whitespace, UTF-8, and `git diff --check` validation passes or records exact unrelated warnings.
13. No source/runtime/test/live/monitor/Reading V2/traceability file is changed.
14. Listening live-session authority/runtime and Reading V2 runtime visual alignment remain the two uncreated child PRDs.

Future implementation of this child PRD is done only when:

1. Required approvals and dependencies are recorded.
2. Large-file maps and before/after responsibility evidence exist.
3. Focused tests and mutation proof cover submit/idempotency/time-up/resume behavior.
4. Browser/network/durable-result proof passes.
5. Private delivery either passes at the host/adapter boundary or remains explicitly blocked pending Task 8.
6. Protected files and paths have no diff.
7. Rollback controls are proven.
8. Findings and required task evidence match deployed behavior.

## 25. Packet 1I Data-Path And Line-Evidence Addendum

Exact existing solo-progress storage keys:

```text
solo_progress_v2__self_study__{encodedStudentId}__{encodedMaterialId}
solo_progress_v2__course_material__{encodedStudentId}__{encodedMaterialId}__{encodedCourseId|no-course}__{encodedModuleId|no-module}
solo_progress_v2__homework__{encodedStudentId}__{encodedMaterialId}__{encodedHomeworkId|no-homework}__{encodedSubmissionId|no-submission}
solo_progress_{materialId}_{studentId}
```

Rules:

1. The first three keys are current platform-storage keys from `buildSoloProgressStorageKey(...)`; every segment after `solo_progress_v2` uses `encodeURIComponent`.
2. The fourth key is legacy self-study fallback only. No new course/homework write may use it.
3. These keys remain behind `src/core/platform/storage`; this child PRD must not add direct `localStorage`, `sessionStorage`, IndexedDB, or Firebase access.
4. Canonical durable result paths remain `test_results/{resultId}` plus existing result indexes. Homework secondary state remains on the existing homework submission contract; this PRD creates no new top-level DB path.

Target compatible `SoloSessionProgress` extension must preserve current fields `materialId`, `studentId`, `scopeContext`, `answers`, `currentQuestion`, `timeElapsed`, `startedAt`, `lastSavedAt`, and optional `mobileState`. It may add only the exact solo-owned fields required by sections 9-12: stable `attemptId`, stable `submissionOperationId`, immutable Listening version identity, submit phase, and accepted-result identity. It must not persist signed URLs, live authority, teacher timestamps/revisions, headphone state, or monitor commands.

Packet 1I baselines are `ListeningPracticeView.tsx` 1,694 lines and `soloProgress.service.ts` 155 lines. Future implementation must record fresh before/after counts, responsibility deltas, and created/preserved seams for every touched large file. `ListeningPracticeView.tsx` may gain only imports, delegation, props, and compatibility wiring; solo algorithms belong in `src/features/assessment/listening/runtime/solo/**`.

## 26. Task 1.10 Canonical Dependency Synchronization - 2026-06-20

Canonical edge set, identical across the PRD-0055 dependency registry and every child PRD:

```text
DAG-00->{DAG-03,DAG-20,DAG-80}
DAG-03->{DAG-50,DAG-90,DAG-99}
DAG-20->DAG-21->DAG-40
DAG-40->{DAG-50,DAG-60}
DAG-50->{DAG-51,DAG-70,DAG-81}
DAG-51->DAG-60
DAG-60->{DAG-71,DAG-81}
DAG-70->DAG-71
DAG-80->DAG-81
{DAG-71,DAG-81,DAG-90}->DAG-99
```

| Local node | Upstream | Output | Downstream |
| --- | --- | --- | --- |
| `DAG-70` PRD-0059 / Task 7 solo alignment | `DAG-50` authoring stability | Solo presentation/state/submit/resume stability on public delivery; no `AudioPlayer` internal edits | `DAG-71` |
| `DAG-71` PRD-0059 / Task 7 solo private cutover | `DAG-60` issuance/range/result proof and `DAG-70` | Host/adapter-level solo private rollout with `AudioPlayer` internals untouched | `DAG-99` |

If solo private cutover requires shared `AudioPlayer` refresh/source-handoff internals, Task 7 stops and waits for Task 8 `DAG-81` shared-player proof; ownership never moves into PRD-0059. Rollback returns solo host delivery to public without deleting attempt/result data. No implementation completion or Task 1.12 approval is claimed.
