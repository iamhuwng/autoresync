# PRD 0060: Listening Live-Session Authority, Runtime, And Load-Test Plan

Status: Draft child PRD - Task 1 planning is complete; implementation remains blocked pending dedicated authority contract tests/test harness, applicable authoring/delivery dependencies, child-specific product-owner plus architecture/security approval, explicit authorization, and remaining proof gates
Created: 2026-06-20
Task number: 0060
Parent PRD: `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
Parent task: Task 1.7 Listening live-session authority/runtime and load-test-plan child-PRD portion only

## Source References

This child PRD is governed by:

- `AGENTS.md`
- `documentation/tasks/create-prd.md`
- `documentation/tasks/process-task-list.md`
- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`
- `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`
- `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`
- `tasks/0059-prd-listening-solo-homework-runtime-alignment.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/tasks/0018-prd-unified-audio-architecture.md`
- `documentation/tasks/tasks-0018-prd-unified-audio-architecture.md`
- `documentation/architecture/mobile-ielts-listening-audio-navigation.md`
- `documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md`
- `documentation/architecture/ui-design-standards.md`
- `documentation/rules/infrastructure.md`
- `documentation/rules/react-patterns.md`
- `documentation/rules/mobile-portability.md`
- `documentation/rules/student-mobile-design.md`
- `documentation/rules/observability.md`
- `documentation/rules/announcements.md`

## Clarification Handling

The user prompt, PRD-0055 approvals, PRD-0018 history, current architecture documents, prior child PRDs, tasklist, findings, current source, and current tests are treated as clarification answers. No unanswered question blocks creation of this planning document. Remaining implementation decisions are recorded under Open Questions and become stop conditions for their affected future phase.

This packet creates planning documentation only. It does not authorize or implement code, tests, Firebase rules, Workers, deployment, schema changes, traceability work, Task 1.8+, or runtime visual alignment.

## 1. Introduction / Overview

Listening live sessions currently have two audio-control paths:

1. `masterAudioState`, intended as continuous teacher authority.
2. `audioCommand`, still emitted and consumed as compatibility traffic.

Teacher control is also split across `TeacherTestMonitorPage`, `AudioProgressPanel`, `TeacherTestControlBar`, `HeadphoneRequestPanel`, `useMonitorControls`, and `useMasterAudioState`. Current page-level monitor wrappers can invoke pause, resume, seek, skip, or speed commands without passing the richer current audio context. Default arguments can therefore write section `1`, position `0`, and speed `1.0` over a later live state.

This child PRD defines one canonical authority contract, exact proposed state schemas, atomic teacher command behavior, student synchronization and recovery, headphone readiness, teacher-monitor integration, private-delivery handoff, submit/session-end race behavior, load-test methodology, observability, rollout, rollback, browser proof, and strict file decomposition.

The central decision is:

> `masterAudioState` is canonical continuous authority. `audioCommand` is compatibility traffic only and can never override a newer valid canonical revision.

## 2. Goals

1. Define one validated, monotonic, teacher-owned live audio authority.
2. Make every teacher audio action commit through one atomic authority transaction.
3. Prevent monitor defaults from resetting a hydrated session to section `1`, position `0`, or speed `1.0`.
4. Define deterministic highest-valid-revision conflict handling.
5. Define late join, reload, disconnect, buffering, long pause, section lag, and drift recovery.
6. Preserve explicit headphone pending, approved, denied, and revoked states with teacher visibility.
7. Integrate private authorized delivery without persisting signed URLs or interrupting active playback.
8. Define session-end versus student-submit race behavior.
9. Define reproducible load methodology for 100 students per session and 20 concurrent sessions.
10. Require metrics, pass/fail thresholds, stop conditions, staged rollout, rollback, and human-assisted proof.
11. Keep all new behavior in small Listening-owned files rather than growing existing runtime monoliths.
12. Keep solo/homework, Reading V2, authoring, storage implementation, Workers, Google Drive, and universal runtime abstractions out of scope.

## 3. User Stories

1. As a teacher, I want pause, resume, seek, skip, speed, and section actions to move every student from one canonical state.
2. As a teacher reloading the monitor, I want controls to hydrate from current authority before they can emit a command.
3. As a late-joining student, I want to enter at the teacher's current section and expected position.
4. As a student reloading during a live test, I want answers restored while audio rejoins teacher authority instead of local playback state.
5. As a student buffering during a teacher pause, I want playback to remain paused after buffering clears.
6. As a student reconnecting after a partition, I want recovery from the highest valid teacher revision.
7. As a student in offline classroom mode, I want headphone permission state to be explicit and respected.
8. As a teacher, I want pending, approved, denied, and revoked headphone states visible and actionable.
9. As a teacher using private audio delivery, I want signed URL refresh to avoid mid-test interruption.
10. As a product owner, I want proof that 20 concurrent sessions with 100 students each remain within authority, latency, drift, media, and infrastructure thresholds.
11. As a junior developer, I want exact module homes, file budgets, facade limits, tests, stop conditions, and rollback rules so live runtime does not become another one-file system.

## 4. Functional Requirements

### Canonical Authority

FR-001. `masterAudioState` must be canonical continuous authority for live Listening audio.

FR-002. The canonical path remains `game_sessions/{sessionCode}/masterAudioState`.

FR-003. Every valid canonical state must carry `schemaVersion: 2`, a non-negative integer `revision`, and trusted server timestamps.

Packet 1I correction - 2026-06-20: FR-003 and the section 8 schema are the target live-session contract pending browser/live proof plus architecture/security sign-off. Current `src/types/audio.types.ts:22-43` has no `schemaVersion`, `revision`, `actionId`, `lastActionRevision`, `updateKind`, or writer metadata. The parent PRD's binding minimum is monotonic revision plus trusted server timestamp; this child PRD must not treat the full v2 schema or compare-and-set rule as already proven on protected live files before implementation evidence exists.

FR-004. Canonical `revision` must increase by exactly one for each accepted authority write, including command writes and playing heartbeats.

FR-005. Timestamp alone must never select authority. Highest valid revision wins.

FR-006. Equal-revision states with different payloads are invalid conflicts and must stop the affected client from applying either payload until canonical state is re-read.

FR-007. Lower revisions must be ignored even when their timestamps are newer.

FR-008. Only the canonical session teacher may write authority. Teacher identity resolves from the session's canonical owner field, preferring `createdByUserId`, then the approved compatibility owner field.

FR-009. `writerClientId` is diagnostic metadata only. It never grants authority.

FR-010. Students, shared UI modules, solo/homework modules, Reading V2 modules, and media-delivery adapters must never write canonical authority.

FR-011. Initial state is revision `0`, first valid section, position `0`, paused, speed `1.0`, with trusted server timestamps.

FR-012. Playing heartbeat remains event-driven plus a two-second baseline heartbeat. It must not become a continuous 500 ms database write loop.

### Compatibility Traffic

FR-013. `audioCommand` remains at `game_sessions/{sessionCode}/audioCommand` during migration.

FR-014. `audioCommand` is an event projection of an accepted canonical command transaction, not an independent authority.

FR-015. New clients must not directly mutate live playback from compatibility traffic.

FR-016. A compatibility command with a lower `canonicalRevision` than the accepted canonical state must be ignored.

FR-017. A compatibility command with a higher `canonicalRevision` must trigger canonical re-read; the command itself must not be applied as state.

FR-018. A legacy command without `canonicalRevision` may be consumed only by explicitly inventoried legacy clients during migration. Once a client has accepted schema-version-2 canonical state, legacy commands cannot alter that client.

FR-019. `audioCommand` removal is prohibited until the retirement criteria in section 9 are satisfied.

### Atomic Teacher Commands

FR-020. Pause, resume, skip, seek, speed, and direct section changes must use one Listening-owned authority writer.

FR-021. The writer must hydrate and validate the current canonical state before enabling teacher audio actions.

FR-022. A teacher command must atomically write the next `masterAudioState` and matching `audioCommand` through one multi-location RTDB update.

FR-023. Future RTDB rules must enforce compare-and-set behavior: `new revision == current revision + 1`, canonical teacher ownership, schema validity, and `audioCommand.canonicalRevision == masterAudioState.lastActionRevision`.

FR-024. A compare-and-set rejection must re-read canonical state and retry at most twice with the original action intent. It must not retry with default section, position, or speed.

FR-025. Repeated `actionId` must be idempotent and return the already-accepted revision.

FR-026. Pause preserves current section, position, and speed and sets `isPlaying: false`.

FR-027. Resume preserves current section, position, and speed, advances revision, and sets `isPlaying: true`.

FR-028. Seek writes exact validated section and position while preserving current play state and speed.

FR-029. Speed change writes exact validated speed and current authoritative section/position/play state.

FR-030. Skip-to-section writes the selected section, position `0`, and the caller's explicitly chosen play state.

FR-031. Direct section change uses the same transaction contract as skip. No monitor component may write section state separately.

FR-032. `TeacherTestControlBar` and `AudioProgressPanel` must call the same authority controller. Duplicate writers are prohibited.

### Student Synchronization

FR-033. Student clients must validate schema and revision before applying state.

FR-034. Expected position while playing is canonical `position + elapsed trusted time * speed`.

FR-035. Expected position while paused is canonical `position`.

FR-036. Initial test baselines are:

- drift at or below 500 ms: no correction;
- drift above 500 ms and below 2 seconds: soft correction;
- drift at or above 2 seconds: hard seek.

FR-037. The 500 ms and 2-second values are test baselines only. Final product thresholds require measured browser and live-session approval.

FR-038. Soft correction may temporarily alter local playback rate by at most 5% for at most five seconds. It must never mutate canonical `speed`.

FR-039. Hard seek must target the expected canonical position and then restore canonical speed.

FR-040. Section mismatch always requires section/source alignment before time correction.

FR-041. A student's local play, pause, seek, source-load completion, buffering completion, or mobile UI event must not override a newer teacher revision.

FR-042. Mobile section and question navigation must preserve the current contract from `mobile-ielts-listening-audio-navigation.md`: explicit navigation changes destination audio, while teacher authority remains dominant in live mode.

### Join, Reload, Disconnect, Buffering, And Lag

FR-043. Late join must hydrate canonical section, position, speed, play state, and revision before enabling live playback.

FR-044. Student reload may restore answers and question/view state from the live player record, but it must not restore solo/local audio authority.

FR-045. Teacher reload must keep audio controls disabled until canonical state and current media section are hydrated.

FR-046. Teacher reload must not emit initialization, pause, resume, speed, seek, or section commands.

FR-047. The current default-call hazard is a release blocker: no live command may rely on function defaults for section `1`, position `0`, speed `1.0`, or play state.

FR-048. Stale commands from before join or before the accepted revision must be ignored.

FR-049. If teacher pause arrives while a student is buffering, the pause revision remains authoritative after `canplay`, `loadeddata`, or `playing`.

FR-050. Resume after a long pause must align section and source, seek to expected position, wait for playable readiness, apply speed, then play.

FR-051. Section lag must be resolved by loading the canonical section source before applying position.

FR-052. Teacher disconnect uses an initial 10-second test grace baseline. After grace, clients freeze/pause local audio and show sync loss.

FR-053. Student network partition freezes the last valid revision. The client must not invent elapsed authority indefinitely.

FR-054. Recovery from teacher or student disconnect must re-read canonical authority, apply the highest valid revision, align source, then correct drift.

FR-055. Recovery must not auto-resume from stale local state.

### Headphone Model

FR-056. Headphone readiness remains per player at `game_sessions/{sessionCode}/players/{studentId}/headphoneRequest`.

FR-057. Target status values are exactly `pending`, `approved`, `denied`, and `revoked`. Absence of the node means no request.

FR-058. Student may create a new pending request. Student may not approve, deny, or revoke.

FR-059. Canonical session teacher may transition pending to approved or denied and approved to revoked.

FR-060. A new request after denied or revoked must increment request revision and preserve prior decision timestamps for audit evidence.

FR-061. Offline student audio remains muted and local volume controls remain unavailable unless status is approved.

FR-062. Revoked must be distinct from denied in target state and teacher display, even if a compatibility adapter temporarily maps both to non-approved behavior for old clients.

FR-063. Teacher monitor must show student, status, request age, last decision, connection state, and whether approved audio is currently synchronized.

FR-064. Headphone state changes must not mutate `masterAudioState`.

### Teacher Monitor

FR-065. `TeacherTestMonitorPage` remains the teacher live-monitor shell.

FR-066. `AudioProgressPanel` remains teacher local-audio presentation and progress UI, but delegates authority writes.

FR-067. `TeacherTestControlBar` remains an action bar, not authority storage.

FR-068. `HeadphoneRequestPanel` remains the teacher headphone UI, but delegates validated transitions.

FR-069. `useMonitorControls` remains a compatibility facade for non-audio monitor operations. Live audio write logic must move to bounded live-session modules.

FR-070. Monitor controls must render current canonical section, position, speed, play state, revision, connection state, and source-refresh warning from one controller snapshot.

FR-071. An authority hydration/error state must disable destructive audio actions and expose a recoverable status.

FR-072. Teacher test pause and audio pause remain distinct product actions. Each must state whether timer, audio, or both are affected.

### Submit And Session-End Races

FR-073. Current live submit is not idempotent because `saveTestResult(...)` allocates a fresh pushed result ID. Future live implementation must replace that call path with the deterministic live result identity defined in section 16 without changing the canonical result record shape.

FR-074. A live attempt identity is exactly `{sessionCode}:{playerId}:{attemptRevision}`. Initial `attemptRevision` is `1`; an approved teacher reset increments it before the student may re-enter.

FR-075. The deterministic result ID is exactly `live-{sessionCode}-{playerId}-{attemptRevision}`. Each segment must already satisfy `[A-Za-z0-9_-]+`; invalid identity blocks launch or reset rather than being silently rewritten.

FR-076. Session submission barrier remains inside the existing session root at `game_sessions/{sessionCode}/submissionBarrier`.

FR-077. Student submission state remains per player at `game_sessions/{sessionCode}/players/{playerId}/liveSubmission`.

FR-078. A student submit must use one atomic root multi-location update for canonical result, required indexes, player completion fields, and `liveSubmission`.

FR-079. Future RTDB rules must accept that update only while `submissionBarrier.status == 'open'`, while attempt identity matches the player/session, and while the deterministic result either does not exist or is byte-equivalent for the same accepted attempt.

FR-080. Teacher end must atomically move the barrier from `open` to `closing` before session cleanup. After `closing`, no new student submit is accepted.

FR-081. A submit whose atomic write commits before the barrier changes to `closing` is accepted and may finish its post-result side effects.

FR-082. A submit ordered after `closing` must reject without creating a result or changing player completion fields.

FR-083. Lost-response retry with the same attempt identity must return the deterministic existing result. It must not create another result.

FR-084. Teacher end must not clear player/session evidence before every accepted submit and required disconnected-player recovery operation reaches a durable terminal state.

FR-085. Teacher end may change the barrier from `closing` to `closed` only after accepted submissions and required recovery operations are settled or explicitly recorded as failed with repair state.

FR-086. Student reload after an accepted submit must resolve to the deterministic result/review state, not reopen live playback.

FR-087. Every race test must assert one logical result, preserved accepted answers, final barrier/session status, and recoverable client navigation.

### Private Delivery

FR-088. Live private delivery depends on PRD-0058 authorized delivery, retained-reference authorization, byte-range support, and browser proof.

FR-089. Canonical authority stores no signed URL, raw R2 key, authorization token, or delivery secret.

FR-090. Live source resolution uses immutable `assetId` or approved legacy public reference through the Listening-owned resolver.

FR-091. Authorized URL target lifetime is 60 minutes and refresh begins with fewer than 10 minutes remaining, matching PRD-0058.

FR-092. Current URL remains active until replacement URL is authorized, range-capable, loaded, and ready.

FR-093. Source handoff must preserve canonical section, expected position, play state, speed, and accepted revision.

FR-094. Refresh failure alone must not pause canonical authority.

FR-095. Refresh failure uses bounded backoff, preserves current or buffered playback where possible, and warns the teacher before interruption risk.

FR-096. Delivery must support `Range`, `206 Partial Content`, `Accept-Ranges`, stable `Content-Length`, seek, long playback, and iOS Safari.

FR-097. Live private cutover is blocked if source handoff requires signed URL persistence or causes an extra ended/error event, wrong section, wrong position, or visible mid-test restart.

### Architecture, Accessibility, And Operations

FR-098. All new production behavior must live under the bounded Listening live-session package defined in section 22.

FR-099. Existing files over 800 lines are facades/orchestrators only. New domain behavior must not be appended inline.

FR-100. Shared assessment modules must not import live Listening modules or own authority state.

FR-101. Reading V2 and solo/homework modules must not import live Listening internals.

FR-102. User-facing live action outcomes modified by implementation must use the shared announcement system, not `alert()` or silent success.

FR-103. New or modified user actions must register observability according to `documentation/rules/observability.md`.

FR-104. Loading and non-urgent synchronization states use `role="status"`; authority, media, or action failures requiring attention use `role="alert"`.

FR-105. Teacher controls and student headphone controls must be keyboard reachable, named, non-color-only, and meet applicable touch-target requirements.

FR-106. No implementation phase may start without product-owner plus architecture/security approval, exact owned/protected files, focused tests, rollback, metrics, and proof plan.

## 5. Non-Goals / Out Of Scope

1. Solo/homework state merge or implementation.
2. Reading V2 runtime work.
3. Reading V2 visual alignment.
4. Listening authoring or storage implementation.
5. Firebase rule implementation in this packet.
6. Worker implementation or deployment in this packet.
7. R2 registry, cleanup, backup, or reconciliation implementation.
8. Google Drive work.
9. Universal assessment runtime abstraction.
10. Shared runtime state machine.
11. `audioCommand` removal without complete compatibility inventory and proof.
12. Visual alignment before authority contract tests exist.
13. Parser, published payload, scoring, question schema, or result schema changes.
14. Teacher mobile redesign. Teacher proof targets desktop and relevant tablet widths.
15. Replacing or deleting `ListeningTestPage_clean.tsx`.
16. Treating `ListeningTestPage_clean.tsx` as canonical without an actual import.
17. Traceability matrix creation.
18. Task 1.8 or later PRD-0055 work.

## 6. Verified Current Baseline

### Canonical Runtime And Route

1. `TestPageRouter.tsx` imports and renders `ListeningTestPage.tsx`.
2. `ListeningTestPage_clean.tsx` has no canonical import in current source inspection.
3. `ListeningTestPage.tsx` consumes `audioCommand`, `masterAudioState`, `audioMode`, and `headphoneRequest`.
4. `ListeningTestPage.tsx` is 2,168 lines.

### Current Authority

1. Current `MasterAudioState` has `section`, `position`, `isPlaying`, `speed`, `timestamp`, `lastAction`, and `lastActionTimestamp`.
2. Current state has no monotonic revision, action ID, strict schema version, or writer metadata.
3. `useMasterAudioState` writes server timestamp for `timestamp`, but `lastActionTimestamp` is browser `Date.now()`.
4. Current heartbeat updates position and timestamp every two seconds while playing.
5. `useTestSession` still reads legacy `audioCommand`.
6. `useMonitorControls` writes `audioCommand` and `masterAudioState` together but uses browser timestamps and no compare-and-set revision.
7. `ListeningTestPage` still directly processes legacy commands.

### Current Monitor Hazard

1. `pauseAllAudio` defaults to section `1`, position `0`, speed `1.0`.
2. `resumeAllAudio` defaults to section `1`, position `0`, speed `1.0`.
3. `setPlaybackSpeed` defaults current section to `1` and current position to `0`.
4. `seekToPosition` defaults speed to `1.0` and play state to false.
5. `TeacherTestMonitorPage` calls these page-level functions without passing rich current section/position/speed state.
6. `AudioProgressPanel` separately holds richer audio-element state and separately uses `useMasterAudioState`.
7. The two monitor surfaces can therefore diverge.

### Current Student Sync And Recovery

1. `useAudioSync` currently hard-seeks when drift exceeds one second.
2. It checks drift every 500 ms.
3. It marks teacher disconnected after 10 seconds without an update while playing.
4. `ListeningTestPage` ignores legacy commands older than student join time.
5. `ListeningTestPage` restores live player section/question/volume/speed data, but current authority and local restore responsibilities are interleaved in the large page.
6. `useTestSession` writes player connection state with `onDisconnect`.

### Current Headphone Model

1. Current status type is `pending | approved | denied`.
2. Current revoke writes `denied`; revoked is not distinct.
3. Teacher reads all player requests; student reads only their own.
4. Offline audio is permitted only when status is approved.

### Current Tests And Gaps

1. `ListeningTestPage.test.tsx` proves route/UI wiring but mocks authority and player internals.
2. `AudioPlayer.test.tsx` mocks `useAudioSync` and does not prove live authority.
3. `useMonitorControls.test.ts` does not currently prove audio command transactions.
4. `TeacherTestMonitorPage.test.tsx` mocks monitor controls and subpanels.
5. No focused current test anchor proves monotonic revisions, authority conflict, teacher reload hydration, stale compatibility rejection, headphone revoke, private source handoff, or 2,000-client load.
6. Current `saveTestResult(...)` allocates a new pushed `test_results` ID for every call.
7. Current live submit writes the permanent result first, then separately updates the session player as submitted.
8. Current live submit therefore lacks deterministic retry identity and an atomic session-end acceptance barrier.

### Large-File Baseline

| File | Current lines | Current role |
| --- | ---: | --- |
| `ListeningTestPage.tsx` | 2,168 | live student host plus mixed runtime orchestration |
| `AudioPlayer.tsx` | 1,885 | shared Listening media element, controls, sync, source loading |
| `TeacherTestMonitorPage.tsx` | 1,431 | teacher monitor shell plus live wiring |
| `useMonitorControls.ts` | 1,180 | monitor actions plus live audio writers |
| `AudioProgressPanel.tsx` | 850 | teacher audio UI plus authority broadcasting |
| `TeacherTestControlBar.tsx` | 395 | teacher action bar |
| `HeadphoneRequestPanel.tsx` | 327 | headphone request UI |

## 7. Target Authority Architecture

```text
TeacherTestMonitorPage
  -> useTeacherLiveAudioController
      -> LiveAudioAuthorityWriter
          -> atomic canonical state + compatibility command update
      -> LiveAudioSourceCoordinator
      -> LiveHeadphonePermissionService

ListeningTestPage
  -> useStudentLiveAudioAuthority
      -> canonical validator/revision gate
      -> section/source coordinator
      -> drift controller
      -> AudioPlayer facade

masterAudioState
  = continuous canonical authority

audioCommand
  = compatibility projection only
```

Only `LiveAudioAuthorityWriter` writes live audio authority. Monitor components pass action intent and render controller state. Student components consume validated snapshots. Private source resolution remains a separate media concern keyed by immutable asset identity.

## 8. Canonical `masterAudioState` Schema

Proposed exact schema:

```ts
type LiveAudioAction =
  | 'initialize'
  | 'play'
  | 'pause'
  | 'resume'
  | 'seek'
  | 'section'
  | 'speed';

type MasterAudioStateV2 = {
  schemaVersion: 2;
  revision: number;
  section: number;
  position: number;
  isPlaying: boolean;
  speed: number;
  timestamp: number;
  updateKind: 'command' | 'heartbeat';
  lastAction: LiveAudioAction;
  lastActionRevision: number;
  lastActionTimestamp: number;
  actionId: string;
  writerUid: string;
  writerClientId: string;
};
```

Field rules:

1. `revision` is an integer at least `0`.
2. `section` is a positive integer present in the immutable session test version.
3. `position` is finite and at least `0`; when trusted duration exists, it must not exceed duration.
4. `speed` is finite and in the approved session speed allowlist. Initial compatibility allowlist is `0.75`, `1`, `1.25`, `1.5`, and `2`.
5. `timestamp` is trusted server time describing the baseline moment for `position`.
6. `lastActionRevision <= revision`.
7. Command writes set `lastActionRevision == revision`, new `actionId`, and `updateKind: 'command'`.
8. Heartbeats increment `revision`, update `position` and `timestamp`, preserve action fields, and set `updateKind: 'heartbeat'`.
9. `lastActionTimestamp` is trusted server time, not browser `Date.now()`.
10. `writerUid` must equal authenticated canonical teacher UID.
11. `writerClientId` is an opaque per-monitor-tab UUID used only for conflict diagnostics.
12. Signed URLs, object keys, tokens, answers, student IDs, and result data are prohibited.

Validation must reject missing required fields, unknown schema versions, non-finite numbers, invalid sections, invalid speed, impossible action/state pairs, wrong writer, revision regression, and equal-revision payload conflict.

## 9. Compatibility `audioCommand` Schema And Retirement

Proposed exact schema:

```ts
type AudioCommandV2 = {
  schemaVersion: 2;
  commandId: string;
  canonicalRevision: number;
  type:
    | 'pause'
    | 'resume'
    | 'skipToSection'
    | 'seekToPosition'
    | 'setSpeed';
  sectionNumber: number;
  position: number;
  speed: number;
  isPlaying: boolean;
  timestamp: number;
  writerUid: string;
};
```

Rules:

1. Command is emitted only with a command-kind canonical update.
2. `commandId == masterAudioState.actionId`.
3. `canonicalRevision == masterAudioState.lastActionRevision`.
4. Complete state fields are included so old adapters do not invent defaults.
5. New clients use command only for compatibility telemetry, never state mutation.
6. Legacy command without schema/revision cannot override accepted v2 state.

Retirement requires all of:

1. Repository inventory of every reader and writer.
2. Deployed-client/version inventory or approved bounded compatibility assumption.
3. Zero direct command writers outside the authority writer.
4. Zero new-client command state mutations.
5. Focused tests for stale, duplicated, reordered, missing, and conflicting commands.
6. Successful internal, selected-cohort, and percentage rollout.
7. At least two full release windows with no required legacy fallback.
8. Teacher and multiple-student browser proof across reload, late join, partition, and authority disagreement.
9. Product-owner plus architecture/security approval.
10. Independently reversible removal packet. Removal is not part of initial implementation.

## 10. Teacher Command Transactions

Each command uses this sequence:

1. Controller requires `hydrationState === 'ready'`.
2. Read current validated canonical snapshot.
3. Build explicit action intent with no default section/position/speed.
4. Generate stable `actionId`.
5. Build revision `current + 1`.
6. Perform one atomic multi-location update for `masterAudioState` and `audioCommand`.
7. Future rules compare current and new revision and validate writer/schema/cross-path equality.
8. On compare-and-set rejection, re-read and retry at most twice.
9. On success, update controller from returned/listened canonical state.
10. On terminal failure, preserve current state, disable repeated action, show shared failure announcement, and record sanitized metrics.

Action rules:

| Action | Section | Position | Playing | Speed |
| --- | --- | --- | --- | --- |
| Pause | current | current | false | current |
| Resume | current | current | true | current |
| Seek | explicit | explicit | current | current |
| Speed | current | current | current | explicit |
| Skip | explicit | 0 | explicit | current |
| Direct section | explicit | explicit approved start, normally 0 | explicit | current |

## 11. Student Sync And Conflict Resolution

Student accepted state is the highest validated revision observed.

Conflict algorithm:

1. Validate schema and fields.
2. Reject writer/section/speed/action inconsistencies.
3. If candidate revision is lower, ignore.
4. If equal and byte-equivalent in authority fields, treat as duplicate.
5. If equal and different, enter authority-conflict state, pause local audio, and re-read.
6. If higher, accept and cancel pending corrections from prior revisions.
7. Align section/source.
8. Apply play state and speed.
9. Calculate expected position from trusted timestamp.
10. Apply no correction, soft correction, or hard seek using measured baselines.

Compatibility command never advances accepted revision. Only canonical state can do so.

## 12. Join, Reload, Disconnect, Buffering, Long Pause, And Section Lag

### Late Join

1. Load session and immutable test/audio-section identity.
2. Subscribe to canonical authority.
3. Accept highest valid revision.
4. Resolve source for canonical section.
5. Compute expected position.
6. Apply headphone gate.
7. Start muted/paused until browser playback permission and source readiness are satisfied.
8. Join canonical play state without processing stale pre-join commands.

### Student Reload

1. Restore answers and live question/view state.
2. Discard persisted solo playback authority.
3. Hydrate canonical authority.
4. Resolve source and synchronize.
5. If result already exists, go to result/review instead of reopening.

### Teacher Reload

1. Load session ownership.
2. Hydrate canonical authority and current source.
3. Disable audio actions until ready.
4. Initialize local teacher audio element from canonical state without writing.
5. Enable commands only after section, position, speed, play state, and revision are displayed.

### Disconnect And Partition

1. Freeze last valid revision.
2. Use 10 seconds as initial teacher-disconnect test grace.
3. After grace, pause locally and show sync loss.
4. Do not advance authority from local elapsed time.
5. On reconnect, re-read canonical state and recover from highest valid revision.

### Buffering And Long Pause

1. Buffer completion re-checks accepted revision before playing.
2. Teacher pause always wins over delayed media events.
3. Long-pause resume waits for section/source readiness and performs authoritative seek.
4. Source or section lag never permits old-section audio to play under a newer section revision.

## 13. Headphone Permission Model

Proposed target schema:

```ts
type HeadphoneRequestV2 = {
  schemaVersion: 2;
  revision: number;
  requested: true;
  status: 'pending' | 'approved' | 'denied' | 'revoked';
  requestedAt: number;
  requestedByUid: string;
  decidedAt?: number;
  decidedByUid?: string;
  approvedAt?: number;
  deniedAt?: number;
  revokedAt?: number;
};
```

Rules:

1. Student writes only a new pending request for their own player.
2. Teacher writes approved, denied, or revoked.
3. Revision increments exactly one for each transition.
4. All timestamps are trusted server timestamps.
5. Approved permits offline-device audio and exposes volume.
6. Pending, denied, revoked, or absent keeps device audio muted.
7. Teacher sees all states, not pending only.
8. Re-request creates a new revision and new `requestedAt`.
9. Current compatibility readers may treat revoked as non-approved, but target UI must display revoked distinctly.

Packet 1I implementation precondition - 2026-06-20: current `src/types/audio.types.ts:75` defines `HeadphoneRequestStatus` as `pending | approved | denied`. Phase 3 must either add `revoked` to that union with consumer updates or migrate cleanly to `HeadphoneRequestV2` before implementing FR-057/FR-062 behavior. No separate product approval is required because FR-057 already authorizes the target status set.

## 14. Teacher Monitor Model

`TeacherTestMonitorPage` composes one `useTeacherLiveAudioController`.

Controller output:

```ts
type TeacherLiveAudioControllerState = {
  hydrationState: 'idle' | 'loading' | 'ready' | 'error';
  authority: MasterAudioStateV2 | null;
  sourceState: 'idle' | 'loading' | 'ready' | 'refreshing' | 'error';
  connectionState: 'connected' | 'grace' | 'disconnected';
  commandPending: boolean;
  refreshWarning: string | null;
};
```

Responsibilities:

1. `TeacherTestControlBar` emits action intent only.
2. `AudioProgressPanel` reports local audio position/readiness and emits action intent only.
3. `HeadphoneRequestPanel` emits permission intent only.
4. Controller owns hydration, explicit current values, command deduplication, transaction invocation, and warnings.
5. `useMonitorControls` delegates live audio actions to controller or removes those live writer responsibilities.
6. No component has default live authority values.
7. Monitor page reload never writes until explicit teacher action.

## 15. Private Delivery, Refresh, And Source Handoff

Proposed ephemeral source contract:

```ts
type ResolvedLiveAudioSource = {
  assetId: string;
  section: number;
  url: string;
  expiresAt: number;
  sourceGeneration: number;
  rangeVerified: boolean;
};
```

This object is memory-only. It is never written to session, player, result, or local storage.

Handoff sequence:

1. Refresh begins before 10 minutes remain.
2. Keep current source active.
3. Resolve replacement by immutable asset identity.
4. Verify authorization and range behavior.
5. Load replacement media source without changing canonical authority.
6. Seek replacement to expected canonical position.
7. Apply canonical speed and play state.
8. Swap only after ready.
9. Preserve old source until swap succeeds.
10. Record sanitized success/failure metrics.

No-mid-test-interruption means:

1. no unintended `ended` or terminal `error`;
2. no wrong-section audio;
3. no reset to position `0`;
4. no canonical pause caused only by refresh;
5. no source-handoff discontinuity above the approved measured threshold;
6. no signed URL or raw key in logs, metrics, screenshots, or persisted data.

## 16. Submit And Session-End Race Contract

Proposed exact session barrier schema:

```ts
type LiveSubmissionBarrier = {
  schemaVersion: 1;
  revision: number;
  status: 'open' | 'closing' | 'closed';
  openedAt: number;
  closingAt?: number;
  closedAt?: number;
  closedByUid?: string;
};
```

Proposed exact per-player live submission schema:

```ts
type LiveSubmissionState = {
  schemaVersion: 1;
  attemptRevision: number;
  attemptId: string;
  resultId: string;
  status: 'open' | 'accepted' | 'persisted' | 'rejected-closed' | 'repair-required';
  acceptedAt?: number;
  persistedAt?: number;
  rejectedAt?: number;
  submittedBy?: 'student' | 'system-timeout' | 'teacher-force' | 'system-disconnect';
  payloadHash?: string;
  repairReason?: string;
};
```

Identity and path rules:

1. Barrier path is `game_sessions/{sessionCode}/submissionBarrier`.
2. Per-player path is `game_sessions/{sessionCode}/players/{playerId}/liveSubmission`.
3. `attemptId` is exactly `{sessionCode}:{playerId}:{attemptRevision}`.
4. `resultId` is exactly `live-{sessionCode}-{playerId}-{attemptRevision}`.
5. Session code and player ID must match `[A-Za-z0-9_-]+`.
6. `attemptRevision` starts at `1`.
7. Approved reset increments `attemptRevision` before clearing completion state.
8. Timestamps are trusted server timestamps.
9. `payloadHash` is an integrity/idempotency comparison value, not scoring authority.

Atomic accepted-submit update must include:

```text
test_results/{resultId}
test_results_by_session/{sessionCode}/{resultId}
test_results_by_student/{studentId}/{resultId}
applicable teacher/course/class indexes
game_sessions/{sessionCode}/players/{playerId}/answers
game_sessions/{sessionCode}/players/{playerId}/latestResultId
game_sessions/{sessionCode}/players/{playerId}/submittedAt
game_sessions/{sessionCode}/players/{playerId}/isSubmitted
game_sessions/{sessionCode}/players/{playerId}/hasCompletedTest
game_sessions/{sessionCode}/players/{playerId}/completedAt
game_sessions/{sessionCode}/players/{playerId}/liveSubmission
```

Future rules must validate the whole root multi-location update against the current barrier. Result/index/player state must not partially commit.

Race matrix:

| Event order | Required outcome |
| --- | --- |
| Submit accepted, then teacher ends | Accepted submit finishes once; session closes; client reaches result/review |
| Teacher end barrier accepted, then submit starts | Submit rejects; no new result; client resolves existing result or recoverable closed-session state |
| Submit result write succeeds, response lost, teacher ends | Retry/reload resolves same result |
| Disconnected student has accepted answer state, teacher ends | Existing disconnected-player recovery contract persists one incomplete/appropriate result |
| Student double-submit while teacher ends | One logical result maximum |

Implementation must extend the existing submit/result owner with deterministic identity and the barrier contract. It must not create a second result model or duplicate result service. If one atomic accepted-submit update cannot be proven against emulator-backed rules, implementation stops before live runtime rollout.

## 17. Load-Test Methodology

### Target

- 100 students per live session.
- 20 concurrent sessions.
- 2,000 simulated student clients.
- 20 teacher authority writers.

### Test Tiers

#### Tier A: Deterministic Contract Tests

Use fake clocks and deterministic event ordering for:

- revision increment;
- equal/lower/higher conflict;
- stale compatibility command;
- command retry;
- late join;
- reload;
- buffering pause;
- long-pause resume;
- section lag;
- source handoff;
- headphone transitions;
- submit/session-end race.

#### Tier B: Protocol Load

Run Firebase SDK virtual clients against approved emulator or isolated non-production project:

1. 20 isolated session codes.
2. 100 student listeners per session.
3. Fifteen sessions use one teacher writer.
4. Two-second playing heartbeats.
5. Scheduled pause/resume/seek/speed/section actions.
6. Staggered joins and reloads.
7. Injected disconnects and partitions.
8. Five sessions add a second authenticated teacher monitor tab that issues deliberate colliding actions every 30 seconds.
9. Student clients never write authority.
10. Capture event receipt, revision, latency, compare-and-set rejection, retry, writer contention, bandwidth, error, and reconnect metrics.

Core duration:

- 10-minute ramp;
- 30-minute steady state;
- 10-minute recovery/drain.

#### Tier C: Browser And Media Fidelity

Use real browser contexts for a smaller representative cohort:

- teacher desktop;
- multiple student desktop contexts;
- multiple student mobile viewports;
- online and offline audio modes;
- real media elements;
- buffering and source refresh;
- multiple concurrent sessions where host capacity permits.

Tier C validates browser/media behavior that protocol simulation cannot prove.

#### Tier D: Long-Session And Deployed Human Gate

1. Accelerated-expiry non-production test proves refresh logic repeatedly.
2. At least one 75-minute deployed/live session proves real signed-URL refresh.
3. Current Chrome, Edge, desktop Safari, and iOS Safari are covered.
4. Human participants verify audible continuity and teacher/student recovery.

### Network Profiles

Test at minimum:

1. normal broadband;
2. 150 ms latency with 30 ms jitter;
3. 400 ms latency with 100 ms jitter;
4. 1% packet loss;
5. 10-second offline teacher partition;
6. 15-second student partition;
7. throttled media buffering;
8. refresh response delay approaching old URL expiry.

### Load Isolation

1. Never run destructive load against production.
2. Use unique prefixed session codes and fixture users.
3. Record project, environment, test-run ID, start/end time, and cleanup result.
4. Do not log tokens, signed URLs, raw keys, answers, or raw audio.
5. Delete only test-owned fixture data through approved cleanup.

## 18. Metrics, Pass/Fail Thresholds, And Stop Conditions

### Required Metrics

1. `authority_write_latency_ms`
2. `authority_event_delivery_latency_ms`
3. `authority_revision_conflict_total`
4. `authority_retry_total`
5. `authority_writer_contention_total`
6. `stale_command_ignored_total`
7. `student_drift_ms`
8. `soft_correction_total`
9. `hard_seek_total`
10. `reconnect_hydration_ms`
11. `source_refresh_latency_ms`
12. `source_handoff_gap_ms`
13. `source_refresh_failure_total`
14. `audio_waiting_duration_ms`
15. `headphone_transition_latency_ms`
16. `submit_session_end_race_total`
17. `duplicate_result_total`
18. `load_client_connected`
19. `firebase_permission_denied_total`
20. `firebase_transaction_rejected_total`
21. configured Firebase and delivery-service quota utilization.

### Pass Thresholds

Packet 1I correction - 2026-06-20: the thresholds below, including p95/p99 latency, drift, handoff-gap, connected-client, and quota thresholds, are proposed planning thresholds. They require product-owner plus architecture/security approval after dry-run evidence confirms the isolated load project, delivery endpoint, client fidelity, and measurement method. They must not be treated as final production acceptance values until approval is recorded.

1. All 20 sessions run the steady-state phase.
2. At least 99.5% of 2,000 virtual students remain connected outside intentional fault windows.
3. Canonical write latency: p95 at most 750 ms, p99 at most 1,500 ms.
4. Event delivery latency: p95 at most 1,000 ms, p99 at most 2,000 ms.
5. Revision regression, equal-revision divergence, cross-session write, and stale-command override: zero.
6. Compare-and-set command failure after bounded retry: zero.
7. Every deliberate two-tab collision produces exactly one accepted next revision; the losing writer rehydrates or retries without applying defaults.
8. Healthy-client drift within three seconds after command: p95 at most 500 ms.
9. Healthy-client drift within five seconds after command: 100% below 2 seconds.
10. Post-partition recovery: 100% below 2 seconds drift within 10 seconds after canonical rehydration.
11. Reconnect hydration: p95 at most five seconds.
12. Headphone transition visibility: p95 at most two seconds.
13. Duplicate or lost accepted result in submit/session-end tests: zero.
14. Source refresh causes zero unintended terminal media errors or ended events.
15. Source handoff gap: p95 at most 250 ms in automated browser measurement, plus human confirmation of no audible interruption.
16. No signed URL, token, raw key, or raw audio appears in captured logs or reports.
17. No tested service exceeds 80% of its configured non-production quota during steady state.

### Immediate Stop Conditions

Stop test or rollout on any:

1. wrong section or wrong audio;
2. lower revision applied;
3. equal-revision conflicting payload;
4. stale compatibility command changes state;
5. unauthorized or cross-session writer;
6. accepted answer/result loss;
7. duplicate result;
8. signed URL or secret leakage;
9. source refresh interrupts active playback;
10. headphone approval bypass;
11. healthy-client hard drift at or above two seconds after recovery window;
12. infrastructure error rate above 1% for five consecutive minutes;
13. quota utilization above 80%;
14. browser proof cannot reproduce required natural routes;
15. rollback control fails.

## 19. Accessibility Requirements

1. Hydration, reconnecting, syncing, buffering, and refreshing expose status text.
2. Authority failure, source failure, and command failure use alert semantics.
3. Teacher icon controls have accessible names.
4. Pause, resume, skip, seek, speed, and headphone state are not conveyed by color alone.
5. Teacher controls are keyboard reachable.
6. Student headphone request is keyboard and touch reachable.
7. Student mobile controls meet 44 px by 44 px.
8. Focus remains stable during source refresh and sync correction.
9. Announcements do not steal focus unless immediate corrective action is required.
10. Screen-reader text identifies section, position, play state, sync state, and headphone state without exposing implementation details.

## 20. Owned And Protected Files

### Future Implementation-Owned Files

New bounded modules under:

```text
src/features/assessment/listening/live-session/
```

Conditionally owned existing facades:

- `src/skills/listening/components/ListeningTestPage.tsx`
- `src/skills/listening/components/AudioPlayer.tsx`
- `src/hooks/audio/useAudioSync.ts`
- `src/hooks/audio/useMasterAudioState.ts`
- `src/hooks/audio/useHeadphonePermission.ts`
- `src/hooks/monitor/useMonitorControls.ts`
- `src/pages/TeacherTestMonitorPage.tsx`
- `src/components/test/AudioProgressPanel.tsx`
- `src/components/test/TeacherTestControlBar.tsx`
- `src/components/test/HeadphoneRequestPanel.tsx`
- `src/hooks/test/useTestSession.ts`
- `src/types/audio.types.ts`

Focused tests:

- `src/__tests__/integration/ListeningTestPage.test.tsx`
- `src/skills/listening/components/AudioPlayer.test.tsx`
- `src/hooks/monitor/useMonitorControls.test.ts`
- `src/pages/TeacherTestMonitorPage.test.tsx`
- new focused live-session tests under the bounded package.

### Protected Files And Scope

Do not change without separately approved dependency need:

- `src/components/practice/ListeningPracticeView.tsx`
- solo/homework hooks and mobile persistence
- Reading V2 source and tests
- Listening authoring builder and persistence behavior
- `src/services/r2Storage.ts`
- `src/services/listeningTestStorage.ts`
- `cloudflare/**`
- `r2-backup-worker/**`
- `database.rules.json` in this planning packet
- `firebase.json` in this planning packet
- parser/import code
- published Listening payload shape
- result schema
- Google Drive code
- shared assessment runtime abstractions
- `src/skills/listening/components/ListeningTestPage_clean.tsx`

## 21. File Architecture Principles

1. Listening live runtime must be a system of focused files, not one replacement monolith.
2. New files target 400 lines or fewer.
3. New production files above 400 lines require split analysis and reviewer approval.
4. New production files above 500 lines are prohibited.
5. New focused test files target 500 lines or fewer; large declarative fixtures must move to fixture modules.
6. Existing files above 800 lines may gain only imports, props, delegation, and compatibility wiring.
7. No new domain algorithm may be written inline in an existing file above 800 lines.
8. Every touched large file requires a full large-file map before implementation.
9. Every touched large file records before/after lines and responsibility delta.
10. Authority, sync, delivery, headphone, and submit-race modules remain separate.
11. Dependency direction is `Listening live-session -> shared presentation`, never the reverse.
12. No Reading V2 import is allowed.
13. No solo/homework import is allowed except a neutral shared `AudioPlayer` contract explicitly proven by both suites.

## 22. Proposed Module Map And Line Budgets

```text
src/features/assessment/listening/live-session/
  authority/
    masterAudioState.types.ts                 <= 250
    masterAudioState.validation.ts            <= 300
    liveAudioAuthorityWriter.ts               <= 350
    audioCommandCompatibility.ts              <= 250
    authorityConflictResolver.ts              <= 250
  student/
    useStudentLiveAudioAuthority.ts            <= 350
    liveAudioDriftController.ts                <= 300
    liveAudioRecovery.ts                       <= 300
  teacher/
    useTeacherLiveAudioController.ts           <= 400
    teacherAudioActionMapper.ts                <= 250
  headphones/
    headphonePermission.types.ts               <= 200
    headphonePermission.service.ts             <= 300
  delivery/
    liveAudioSourceResolver.ts                 <= 300
    liveAudioSourceHandoff.ts                  <= 350
  submission/
    liveSessionEndSubmitRace.ts                <= 300
  observability/
    liveAudioMetrics.ts                        <= 250
```

Test/load package:

```text
tests/load/listening-live/
  config.ts                                    <= 250
  virtualTeacher.ts                            <= 350
  virtualStudent.ts                            <= 350
  scenarios.ts                                 <= 400
  metrics.ts                                   <= 300
  report.ts                                    <= 300
  fixtures/                                    declarative, split by scenario
```

Required extraction targets when behavior is implemented:

| Existing file | Current | First implementation target | Required seam |
| --- | ---: | ---: | --- |
| `ListeningTestPage.tsx` | 2,168 | at most 1,950 | legacy command handling, live hydration, recovery |
| `AudioPlayer.tsx` | 1,885 | at most 1,650 | sync controller and source handoff |
| `TeacherTestMonitorPage.tsx` | 1,431 | at most 1,325 | teacher live controller wiring |
| `useMonitorControls.ts` | 1,180 | at most 950 | all live audio writer methods |
| `AudioProgressPanel.tsx` | 850 | at most 725 | authority hook/broadcast logic |

Targets are implementation acceptance budgets, not authorization to rewrite whole files. Extraction must be surgical, characterized, and independently reviewed.

## 23. Testing Strategy

### Characterization

1. Current route selects canonical `ListeningTestPage`.
2. Current monitor surfaces and props are mapped.
3. Current legacy commands and canonical state writes are characterized.
4. Current solo `AudioPlayer` behavior remains green before shared-player changes.
5. Current mobile section/audio navigation remains green.

### Authority Unit Tests

1. schema validation;
2. revision increment;
3. lower/equal/higher conflict;
4. invalid writer;
5. invalid section/position/speed;
6. action/state consistency;
7. heartbeat action preservation;
8. atomic command projection;
9. compare-and-set retry;
10. idempotent `actionId`.

### Student Runtime Tests

1. late join;
2. student reload;
3. stale command;
4. buffering during pause;
5. long-pause resume;
6. section lag;
7. 500 ms soft baseline;
8. 2-second hard baseline;
9. teacher disconnect;
10. student partition and recovery;
11. mobile section navigation under authority.

### Monitor Tests

1. teacher reload hydrates before action;
2. no default section/position/speed call;
3. both control surfaces call same controller;
4. pause/resume/seek/skip/speed/direct section transactions;
5. command failure announcement;
6. hydration/error disables actions;
7. canonical state renders consistently.

### Headphone Tests

1. pending;
2. approved;
3. denied;
4. revoked;
5. re-request revision;
6. teacher visibility;
7. unauthorized transition rejection;
8. approved offline sync;
9. revoked immediate mute.

### Delivery Tests

1. signed URL not persisted;
2. refresh before threshold;
3. old URL retained until ready;
4. range verification;
5. source handoff preserves revision/section/position/speed/play state;
6. refresh retry;
7. refresh warning;
8. no mid-test interruption;
9. legacy public source compatibility;
10. iOS Safari human gate.

### Submit/Session-End Tests

1. accepted submit then end;
2. end then submit;
3. lost response;
4. double submit;
5. disconnected student;
6. reload after accepted result;
7. one logical result assertion.

### Mutation Proof

Future implementation must temporarily break and restore:

1. revision comparison;
2. stale command rejection;
3. monitor hydration gate;
4. buffering pause guard;
5. source handoff continuity;
6. submit idempotency;
7. headphone revoke.

## 24. Browser Proof Plan

### Required Environments

- Teacher: `http://localhost:5173`
- Student: `http://localhost:5174`
- Separate authenticated browser contexts.
- Natural teacher and student launch routes.
- Built-in dev quick-login buttons unless a scenario requires another fixture.

### Required Roles And Viewports

1. Teacher desktop at 1440 px.
2. Teacher relevant tablet width.
3. Student desktop at 1440 px.
4. Student mobile at 375 px.
5. Student mobile at 320 px.
6. Multiple simultaneous student contexts.

### Required Scenarios

1. normal join;
2. multiple students;
3. late join;
4. student reload;
5. teacher reload;
6. pause/resume;
7. seek;
8. skip;
9. speed;
10. direct section change;
11. buffering during pause;
12. long pause;
13. section lag;
14. headphone pending;
15. headphone approved;
16. headphone denied;
17. headphone revoked;
18. teacher disconnect;
19. student disconnect;
20. network partition;
21. canonical/compatibility disagreement;
22. stale command;
23. signed URL refresh;
24. source handoff;
25. range request and seek;
26. session-end/submit accepted race;
27. session-end/submit rejected race.

### Commands And Artifacts

Every Playwright command must use:

```powershell
npx playwright test tests/e2e/listening-live-session.spec.ts --reporter=json > report.json
```

Packet 1I shared test-harness correction - 2026-06-20:

1. Current `playwright.config.js:5` uses `testDir: './e2e'`, so the command above is unrunnable as written unless the config moves to `./tests/e2e`.
2. Required alignment option A: change the future command to `npx playwright test e2e/listening-live-session.spec.ts --reporter=json > report.json`.
3. Required alignment option B: change future test infrastructure to `testDir: './tests/e2e'` and keep the command above.
4. Current `playwright.config.js:21-24` starts only `http://localhost:5173`; this PRD requires teacher `http://localhost:5173` and student `http://localhost:5174` in separate contexts.
5. The shared test-harness owner must either add a second `5174` webServer or record the exact out-of-band `5174` launch command. Recommendation: assign this once to a test-infra packet (or the S0/storage harness task if that packet owns shared Playwright setup), not separately to every PRD.
6. Approval required: architecture/test-infra ownership and path alignment choice. Preserve `--reporter=json > report.json`.

Record:

1. exact URL and natural route;
2. role/account fixture;
3. browser and viewport;
4. session/test IDs;
5. expected and actual authority revisions;
6. network requests/responses;
7. durable RTDB state;
8. screenshots, trace, video where approved;
9. `report.json` artifact path;
10. result/review recovery evidence.

iOS Safari and deployed/live proof are human-assisted gates. Agent automation alone cannot close them.

## 25. Observability

Required action names:

- `listeningLive.pauseAudio`
- `listeningLive.resumeAudio`
- `listeningLive.seekAudio`
- `listeningLive.skipSection`
- `listeningLive.changeSpeed`
- `listeningLive.changeSection`
- `listeningLive.headphoneApprove`
- `listeningLive.headphoneDeny`
- `listeningLive.headphoneRevoke`
- `listeningLive.endSession`

Required diagnostic events:

- `listening_live_authority_write`
- `listening_live_authority_conflict`
- `listening_live_stale_command_ignored`
- `listening_live_sync_correction`
- `listening_live_disconnect`
- `listening_live_recovery`
- `listening_live_source_refresh`
- `listening_live_source_handoff`
- `listening_live_headphone_transition`
- `listening_live_submit_end_race`

Packet 1I correction - 2026-06-20: `src/hooks/monitor/useMonitorControls.ts` currently uses `alert()` / `window.confirm()` at 14 sites. PRD-0060 owns the live-audio subset for migration to shared announcements and in-app confirmation UI: pause audio (`:886`), resume audio (`:929`), skip confirm (`:949`), skip failure (`:986`), and speed failure (`:1035`). The non-audio monitor sites (`:288`, `:325`, `:497`, `:797`, `:826`, `:840`, `:843`, `:1061`, `:1131`) need a scope decision: PRD-0060 owns the file-wide migration, or those sites are deferred to a named teacher-monitor packet. Until that decision is approved, future implementation must not leave the touched audio subset using `alert()` or `window.confirm()`.

Allowed dimensions:

- environment;
- run ID;
- session hash;
- revision;
- action type;
- update kind;
- writer-client hash;
- section number;
- drift bucket;
- correction type;
- browser family;
- viewport class;
- network profile;
- outcome/reason code;
- latency/duration.

Prohibited:

- tokens;
- signed URLs;
- raw object keys;
- raw session codes in centralized logs;
- student names/emails;
- answers;
- raw audio.

## 26. Rollout Plan

### Phase 0: Approval And Maps

1. Product-owner and architecture/security approval.
2. Reconcile Task 8 scaffold to this PRD.
3. Complete large-file maps.
4. Complete compatibility inventory.
5. Establish baseline metrics and tests.

### Phase 1: Authority Contract Behind Cohort Pin

1. Add schema/validator/writer/controller.
2. Continue compatibility command emission.
3. Pin authority version per session before session start.
4. Do not change active session authority version mid-test.
5. Internal fixtures only.

### Phase 2: Student Sync And Monitor Convergence

1. New clients consume canonical revision.
2. Monitor surfaces use one controller.
3. Load Tier A and B.
4. Internal teacher sessions.

### Phase 3: Headphone And Recovery

1. Add distinct revoked target state.
2. Prove reload/disconnect/partition/buffering.
3. Selected teacher/class cohort.

### Phase 4: Private Delivery Shadow

1. Resolve and refresh private source in shadow/non-authoritative mode.
2. Keep production live playback public.
3. Prove range, refresh, handoff, and warnings.

### Phase 5: Private Delivery Selected Cutover

1. Human-assisted browser gate.
2. Selected live sessions.
3. Percentage rollout.
4. Full rollout only after thresholds remain green.

### Phase 6: Compatibility Retirement Review

1. Inventory and telemetry review.
2. Separate approval.
3. Separate reversible removal packet.

## 27. Rollback Plan

1. Cohort flags are read before session start and remain pinned for that session.
2. Never switch an active session from canonical v2 back to legacy command authority.
3. On active-session authority incident, freeze/pause canonical state and recover from highest valid revision.
4. Disable soft correction independently while preserving canonical hard alignment.
5. Disable private delivery for new sessions and return to approved public resolver.
6. Keep current/old URL until safe handoff; never invalidate active source first.
7. Preserve compatibility command emission throughout initial rollback window.
8. Roll back monitor presentation separately from authority writer.
9. Do not delete canonical state, player evidence, results, or accepted submissions.
10. New sessions may return to previous tested behavior only through an approved cohort/version pin.
11. Record exact rollback trigger, affected sessions, revisions, evidence, and recovery.

## 28. Acceptance Criteria

1. `masterAudioState` is explicitly canonical.
2. Exact schema, validation, revision, timestamps, and writer ownership are defined.
3. `audioCommand` is compatibility-only and has retirement criteria.
4. All teacher audio actions use one atomic transaction contract.
5. Highest-valid-revision handling is deterministic.
6. Monitor default-value hazard is explicitly blocked.
7. Late join, reload, disconnect, partition, buffering, long pause, lag, and drift are defined.
8. 500 ms soft and 2-second hard values are baselines only.
9. Headphone pending, approved, denied, revoked, and teacher visibility are defined.
10. Teacher monitor ownership across named components/hooks is defined.
11. Submit/session-end races produce one logical result.
12. Private delivery, refresh, range, and no-interruption handoff are defined.
13. Load methodology covers 100 students/session and 20 concurrent sessions.
14. Metrics, thresholds, stop conditions, rollout, rollback, and browser proof are explicit.
15. New behavior is split into bounded Listening-owned modules.
16. Existing large runtime files have concrete extraction targets and line budgets.
17. Solo/homework, Reading V2, authoring/storage implementation, Google Drive, and universal runtime abstraction remain excluded.
18. No code, tests, rules, Worker, deploy, schema, traceability, or Task 1.8+ work is performed by Packet 1G.

## 29. Regression Checklist

- [ ] Canonical route still imports `ListeningTestPage.tsx`.
- [ ] `ListeningTestPage_clean.tsx` is not substituted or deleted.
- [ ] Solo/homework state remains separate.
- [ ] Reading V2 runtime remains unchanged.
- [ ] Authoring and storage behavior remain unchanged.
- [ ] `masterAudioState` revision increases monotonically.
- [ ] Trusted server timestamps are used.
- [ ] Lower revision is ignored.
- [ ] Equal conflicting revision fails closed.
- [ ] Stale compatibility command cannot override.
- [ ] Pause preserves section/position/speed.
- [ ] Resume preserves section/position/speed.
- [ ] Seek preserves play state and speed.
- [ ] Speed preserves section/position/play state.
- [ ] Skip/direct section uses explicit state.
- [ ] Teacher reload emits no command.
- [ ] Student reload restores answers but not local audio authority.
- [ ] Late join starts from canonical state.
- [ ] Buffer completion cannot bypass pause.
- [ ] Long-pause resume aligns source before play.
- [ ] Section lag cannot play old section.
- [ ] Disconnect freezes authority.
- [ ] Recovery uses highest valid revision.
- [ ] 500 ms soft correction is measured.
- [ ] 2-second hard seek is measured.
- [ ] Headphone pending blocks audio.
- [ ] Headphone approved permits offline audio.
- [ ] Headphone denied blocks audio.
- [ ] Headphone revoked blocks audio and is visible.
- [ ] Monitor surfaces use one controller.
- [ ] No default section `1` / position `0` / speed `1.0` writer call remains.
- [ ] Signed URLs are not persisted.
- [ ] Range requests pass.
- [ ] URL refresh keeps old source until ready.
- [ ] Source handoff causes no mid-test interruption.
- [ ] Accepted submit completes once during session end.
- [ ] Late submit rejects without duplicate result.
- [ ] 2,000-client protocol load passes.
- [ ] Browser/media cohort passes.
- [ ] iOS Safari human gate passes before cutover.
- [ ] Protected scope scan passes.
- [ ] Large-file budgets and maps pass.
- [ ] No new production file exceeds 500 lines.
- [ ] No live domain algorithm is added inline to an existing file over 800 lines.

## 30. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Monitor defaults overwrite live state | Students jump to wrong section/position | Hydration gate, explicit controller snapshot, no defaults |
| Two teacher tabs race | Conflicting authority | revision compare-and-set, action idempotency, writer diagnostics |
| Compatibility command arrives late | Stale state applied | canonical revision gate; command cannot mutate new clients |
| Root transaction conflicts with player writes | Load instability | atomic multi-location update plus rule-enforced compare-and-set, not session-root transaction loop |
| Browser timestamp skew | Wrong expected position | trusted server timestamps only |
| Soft correction changes teacher speed | Semantic drift | local temporary rate only; canonical speed unchanged |
| Buffer completion resumes paused audio | Exam integrity issue | accepted-revision recheck before play |
| Teacher reload emits defaults | Session reset | controls disabled until hydrated; no initialization write |
| Signed URL expires mid-test | Playback interruption | early refresh, old-source retention, ready-before-swap |
| Shared `AudioPlayer` change breaks solo | Solo regression | extracted delivery/sync seams and both suites |
| Headphone revoke looks like deny | Teacher ambiguity | distinct target state and compatibility adapter |
| Session end loses accepted submit | Result loss | stable identity, durable barrier, race tests |
| Load harness is too synthetic | Browser failures escape | protocol tier plus real browser/media and human gates |
| One new giant runtime file appears | Long-term maintenance failure | per-file budgets, package map, CI size guard, independent review |
| Reading V2 patterns copied into Listening | New monolith | Listening-owned bounded modules and protected import scan |

## 31. Open Questions

These questions do not block this planning packet. They block their affected future implementation or rollout phase:

1. Final soft/hard correction thresholds after measured browser and live proof. Initial baselines remain 500 ms and 2 seconds.
2. Final teacher-disconnect grace after measured false-positive and recovery results. Initial test baseline is 10 seconds.
3. Whether production needs more than 100 students/session or 20 concurrent sessions.
4. Which isolated Firebase project and delivery endpoint own full protocol load and deployed human proof.
5. Whether compatibility consumers require a temporary `revoked -> denied` projection beyond initial rollout.
6. Exact release-window count and telemetry evidence required before `audioCommand` removal; minimum proposed criterion is two full release windows.
7. Named human owners for desktop Safari, iOS Safari, and deployed 75-minute proof.

If any answer changes schema, authority ownership, data path, allowed load, or protected scope, update this child PRD and obtain approval before implementation.

## 32. Definition Of Done

### Packet 1G Planning Done

Packet 1G is done when:

1. This file exists at `tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md`.
2. Task number `0060` was verified available before creation.
3. Required source, tests, parent/child PRDs, architecture documents, and rules were read.
4. Canonical authority, schemas, transactions, sync, recovery, headphones, monitor, private delivery, races, load, metrics, proof, rollout, rollback, accessibility, files, risks, and open questions are defined.
5. PRD-0055 findings contain Packet 1G evidence.
6. PRD-0055 tasklist registers PRD-0060 through status/registration text only.
7. Task 1.7 remains unchecked.
8. Reading V2 runtime visual alignment is recorded as the only remaining child PRD.
9. Next permitted packet is the Reading V2 runtime visual-alignment child PRD only.
10. UTF-8, placeholder, protected-scope, trailing-whitespace, and `git diff --check` checks pass or exact unrelated warnings are recorded.
11. No code, test, Firebase rule, Worker, deployment, schema, traceability, or Task 1.8+ implementation occurs.

### Future Implementation Done

Future implementation is done only when:

1. Product-owner and architecture/security approval is recorded.
2. Task 8 scaffold is reconciled to this PRD.
3. Large-file maps and exact touch regions exist.
4. Authority contract tests pass with RED/GREEN and mutation proof.
5. Monitor default hazard is removed.
6. Solo and live `AudioPlayer` suites pass.
7. Load tiers pass stated thresholds.
8. Required browser/network/RTDB/result evidence exists.
9. iOS Safari and deployed/live human gates pass.
10. Internal, selected, and percentage rollout remain green.
11. Rollback is proven.
12. Independent fresh-context review is clean.

## 33. Task 1.10 Canonical Dependency Synchronization - 2026-06-20

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
| `DAG-80` PRD-0060 / Task 8 authority tests and harness | `DAG-00` Task 1 planning approval complete; child-specific authorization still required | Dedicated authority contract tests, executable harness, load methodology, RED baseline | `DAG-81` |
| `DAG-81` PRD-0060 / Task 8 live runtime/cutover | `DAG-50`, `DAG-60`, `DAG-80` | Canonical live authority, shared `AudioPlayer` internal refresh/source-handoff, live private cutover | `DAG-99`; may unblock stopped `DAG-71` proof |

Task 8 exclusively owns shared `AudioPlayer` internal refresh/source-handoff and live cutover. `masterAudioState` stays canonical and `audioCommand` compatibility-only. Rollback preserves compatibility traffic/public delivery and separates authority, delivery, and cohort switches. Task 1.12 approval is recorded, but no implementation completion or child-specific authorization is claimed.
