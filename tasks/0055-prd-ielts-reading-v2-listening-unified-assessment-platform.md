# PRD 0055: IELTS Reading V2 And Listening Unified Assessment Platform

Status: Approved parent PRD - implementation remains gated by approved child PRDs
Created: 2026-06-19
Task number: 0055
Primary rule source: `documentation/tasks/create-prd.md`

## Source References

- `documentation/tasks/create-prd.md`
- `documentation/ielts-reading-v2-listening-unification-strategy.md`
- `documentation/ielts-reading-v2-listening-unification-research.md`
- `documentation/ielts-reading-v2-listening-unification-audit.md`
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/architecture/reading-v2-runtime-integrations.md`
- `documentation/architecture/mobile-ielts-listening-audio-navigation.md`
- `documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md`
- `documentation/architecture/ui-design-standards.md`
- `documentation/architecture/upload-storage-authority.md`
- `DESIGN.md`

## Clarification Handling

The repo PRD rule asks the assistant to ask clarifying questions before creating a PRD. For this PRD, the strategy, research, audit, implementation log, canonical architecture document, current code inspection, and product-owner clarification rounds answer the product, architecture, storage, security, lifecycle, rollout, and testing questions.

OQ-1 through OQ-4 were approved by the product owner on 2026-06-19 under decision reference `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`. No parent-level product question remains open. Authoring, storage, worker-security, solo/homework, live-session, and Reading V2 runtime implementation still require the applicable approved child PRD and unresolved child-PRD decisions must not be selected silently.

## 1. Introduction / Overview

IELTS Reading V2 and IELTS Listening must feel like one coherent IELTS assessment system for teachers and students. The product must share visual language, authoring patterns, validation display, status states, review/publish affordances, and later selected runtime presentation patterns.

This PRD does not authorize forcing Listening into Reading V2 internals. Reading V2 is the design reference, not the owner of Listening behavior. Listening remains audio-first and live-session sensitive. Reading remains text-first and projection-bound.

The controlling product principle is:

```text
Unify the product experience, not the test construct.
```

The required dependency direction is:

```text
Reading V2 -> neutral shared assessment layer
Listening  -> neutral shared assessment layer
```

The forbidden dependency direction is:

```text
Listening -> Reading V2 internals
Reading V2 files full of Listening-specific conditions
neutral shared assessment layer -> Reading V2 or Listening internals
```

The first safe foundation has already started. Current shared primitives exist under `src/features/assessment/shared/components/`:

- `AssessmentStatusState`
- `AssessmentValidationSummary`
- `AssessmentAuthoringSection`

Current adoption is intentionally limited:

- `src/pages/ReadingV2StudioPage.tsx` uses `AssessmentStatusState` for route-level Reading V2 Studio loading, error, and invalid-context states.
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx` uses `AssessmentAuthoringSection` for the display-only `Accessibility And Runtime Advisories` block.
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx` uses `AssessmentValidationSummary` for `Publish Readiness`.
- `src/skills/listening/builders/ListeningTestBuilder.tsx` uses `AssessmentAuthoringSection` for the Step 4 Questions / Answer Key wrapper.
- `src/skills/listening/builders/ListeningTestBuilder.tsx` uses `AssessmentStatusState` for the Step 4 empty question list.
- `AssessmentValidationSummary` has no Listening adoption yet.

The current work is a parent planning document. It must guide future implementation prompts and prevent unsafe runtime, parser, storage, and live authority refactors. It is not permission to execute all work as one implementation plan. Storage, authoring, solo runtime, and live runtime require separate child PRDs or bounded implementation packets with the gates defined here.

## 2. Goals

1. Create one parent product and architecture specification for IELTS Reading V2 and IELTS Listening unification work.
2. Define a neutral shared assessment layer that can provide presentation primitives without knowing Reading passages, Listening audio, parser output, storage, or live-session state.
3. Preserve Reading V2 authoring, import, projection, runtime, trusted-submit, and review boundaries.
4. Preserve Listening authoring audio upload/import/storage, parser/manual entry, published payload compatibility, solo/homework runtime, and live-session teacher authority.
5. Make safe implementation sequence explicit so future patches start with low-risk authoring/status presentation work.
6. Define protected files and unsafe moves so junior developers do not import Reading V2 internals into Listening or move Listening live authority into shared code.
7. Define test gates for authoring, runtime, and live-session work before those phases start.
8. Record current architecture drift and approved decisions in one durable PRD.
9. Split high-risk storage, solo runtime, and live runtime work into separately reviewed child PRDs.
10. Ensure implementation packets name owned files, protected files, required tests, rollback steps, and evidence so a junior developer never invents missing behavior.

## 3. User Stories

1. As a teacher creating Reading V2 tests, I want stable Reading V2 Studio behavior so that unification work does not break import, validation, draft save, publish, revision, preview, or projection readiness.
2. As a teacher creating Listening tests, I want the builder to feel visually related to Reading V2 Studio so that I do not have to relearn the product for another IELTS module.
3. As a teacher creating Listening tests, I want R2 audio upload, audio preview, parser skip/manual entry, validation, save, and publish behavior to remain reliable.
4. As a student taking Reading V2, I want passage rendering, questions, answers, submit, review, and mobile/desktop layout to keep working while shared UI primitives are introduced.
5. As a student taking solo/homework Listening, I want audio playback, resume, autosave, timer, answer state, mobile state, submit, and review to remain stable.
6. As a student in live Listening, I want my audio and section state to follow teacher authority during pause, resume, seek, skip, reload, and session end.
7. As a teacher monitoring live Listening, I want `TeacherTestMonitorPage`, `AudioProgressPanel`, `TeacherTestControlBar`, `HeadphoneRequestPanel`, and monitor hooks to keep exact authority over live audio and headphone readiness.
8. As a junior developer, I want exact shared-layer rules, protected paths, safe examples, unsafe examples, and phase gates so that I can implement small patches without guessing architecture.
9. As a reviewer, I want a regression checklist that proves no Reading V2 parser/runtime or Listening audio/live-session behavior moved by accident.

## 4. Functional Requirements

### Shared Assessment UI Layer

FR-001. The system must define shared neutral presentation primitives for assessment status states, validation summaries, authoring sections, authoring cards, authoring headers, action rows, metadata panels, review/publish display, loading/error/empty states, question card wrappers, safe answer input primitives, and mobile layout primitives where the contract is neutral.

FR-002. Shared primitives must live under a neutral shared assessment path, currently `src/features/assessment/shared/`, unless a later architecture update approves a different neutral location.

FR-003. Shared primitives may accept `children`, `title`, `description`, `status`, `action`, `headingLevel`, `ariaLabel`, and neutral layout props.

FR-004. Shared primitives must not accept audio state, passage data, parser output, teacher session state, live-session commands, published payload shapes, storage references, or module-specific behavior flags such as `isReading`, `isListening`, `hasAudio`, or `isLiveSession`.

FR-005. Shared primitives must not import from `src/components/reading-v2/**`, `src/services/reading-v2/**`, `src/skills/listening/**`, Listening audio hooks, monitor hooks, or module-specific storage/parsing services.

FR-006. Feature modules must adapt their own state into neutral props before passing data to shared primitives.

FR-007. Shared primitives must expose accessible roles and heading levels appropriate for nested authoring and runtime surfaces.

FR-008. Shared validation display must render already-calculated validation state only. It must not calculate Reading V2 issue severity, Listening audio-section completeness, parser errors, publish gating, focus navigation, or issue activation.

FR-008A. A small neutral visual primitive may be extracted early only when Reading V2 and Listening both use it in the same pull request or in explicitly named adjacent pull requests. The second adoption must already be scoped and assigned. Otherwise, keep the primitive local.

FR-008B. Shared components must not own default product copy. Reading V2 and Listening must supply visible copy through neutral props or children.

### Reading V2 Authoring

FR-009. Reading V2 Studio routes must remain:

- `/teacher/reading-v2/create`
- `/teacher/reading-v2/import`
- `/teacher/reading-v2/drafts/:draftId`
- `/teacher/reading-v2/materials/:materialId/revise`

FR-010. `src/pages/ReadingV2StudioPage.tsx` must remain the route-mode host for blank create, import create, draft resume, and published-material revision.

FR-011. `src/components/reading-v2/studio/ReadingV2StudioShell.tsx` and related Reading V2 Studio components must keep Reading-specific ownership of metadata, passages, task groups, answer keys, import review, validation, draft save, publish, revision, preview, duplicate warnings, conflict handling, and publish readiness.

FR-012. Reading V2 authoring may adopt shared authoring layout primitives for display-only or low-risk sections when tests confirm heading, spacing, and ownership semantics.

FR-013. Reading V2 authoring must not move parser/import normalization into shared assessment code.

FR-014. `src/services/reading-v2/readingV2ImportNormalization.service.ts` must remain Reading-specific and must not become a Listening parser.

FR-015. Reading V2 interactive review-issues behavior must remain Reading V2-owned. Shared validation primitives may render summaries, but must not own issue normalization, severity mapping, activation, navigation, focus behavior, or publish gating.

### Listening Authoring

FR-016. `src/pages/TestBuilderRouter.tsx` must continue routing `skill=Listening` to `src/skills/listening/builders/ListeningTestBuilder.tsx` until a dedicated migration PRD/test plan changes that route.

FR-017. Listening builder flow must preserve metadata/setup, audio upload/import, audio preview, audio sections, question setup, text/manual entry mode, parser skip/manual mode, review/publish, validation, save, and publish behavior.

FR-018. Listening visual alignment may use shared neutral authoring primitives for shell-local presentation only.

FR-019. `src/services/listeningTestStorage.ts` remains the owner of Listening persistence shape, audio controls config, audio section formatting, question section mapping, and save behavior. Its current URL-based temp-to-permanent move mechanism is preserved unchanged during visual-alignment phases, then replaced by the registry-backed asset commit only under the approved storage child PRD.

FR-020. Listening authoring must keep R2 upload behavior, `audioUrl` / `streamUrl` alignment, audio preview, and persisted `audioSections` compatible with existing tests.

> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: FR-020A. Proposed under Open Question OQ-1: no new feature may add or extend Google Drive upload, import, streaming, playback, or validation. Existing Google Drive code and existing Google Drive-backed tests remain unchanged by this PRD. Removal of Google Drive upload and deletion/disposition of Google Drive-backed tests belong to a separate, explicitly out-of-scope cleanup/deletion task.

FR-020A. Approved binding decision OQ-1: no new feature may add or extend Google Drive upload, import, streaming, playback, or validation. Existing Google Drive code and Google Drive-backed tests remain unchanged by this PRD. There is no Google Drive migration, current playback removal, or new Google Drive-specific error state. Removal of Google Drive upload code and deletion/disposition of Google Drive-backed tests belong to a separate cleanup/deletion task.

FR-020B. Listening audio uploads must enter R2 temporary storage first. Upload completion alone must not make an asset permanently retained.

FR-020C. A successful saved-draft or publish operation must commit referenced audio to an immutable durable R2 asset key.

FR-020D. Saved drafts, published tests, retained revisions, and retained result contracts must retain their referenced audio.

FR-020E. Abandoned, failed, cancelled, replaced, and never-saved uploads must be deleted through immediate best-effort cleanup plus lifecycle fallback.

FR-020F. Audio replacement must use a new asset ID and must not overwrite currently saved audio before the draft/test save succeeds.

FR-020G. Durable audio may be deleted only after all retained references are removed and a configurable rollback grace period has elapsed.

FR-020H. Asset move, reference update, cleanup, and retry operations must be idempotent.

FR-020I. R2 lifecycle implementation must first verify and harden upload-signer authorization. Upload, move, overwrite, and delete operations must authenticate the actor, validate ownership and allowed prefixes, and reject arbitrary client-provided object keys.

FR-020J. Listening authoring must allow no more than 10 active audio files per test and no more than 50 MB per audio file. Allowed formats are MP3, M4A, AAC, WAV, and OGG. Teacher-facing guidance must recommend MP3 or M4A.

FR-020K. Upload-limit copy must say `Up to 10 audio files, 50 MB each.` It must not encourage or advertise a 500 MB total upload.

FR-020L. Temp uploads are edit-turn assets. Only an explicit successful Save draft or Publish operation may promote them to durable assets. Upload completion, local preview, autosave-like UI state, or heartbeat activity must not create a durable draft or retention right.

FR-020M. Explicit remove, replacement, builder cancel, confirmed navigation away, logout, lost authentication, failed save/publish, and other detected abandonment must queue immediate best-effort temp deletion. Scheduled cleanup is the fallback for crashes, disconnects, and failed deletion attempts.

FR-020N. An authenticated same-tab heartbeat may keep an edit-turn temp asset eligible only while the same editor tab is open, connected, and authenticated. Heartbeat interval is 60 seconds, heartbeat is stale after 3 minutes, and eligibility may not extend beyond 8 hours from upload time. After 8 hours the teacher must Save draft or re-upload.

FR-020O. A heartbeat must use an owner-scoped upload-session/tab identity. It must stop on confirmed navigation away, tab close where detectable, logout, authentication loss, or disconnection. It must never create or imply a saved draft.

FR-020P. Uncommitted temp assets that survive immediate cleanup must be deleted by scheduled fallback no later than 24 hours after upload. Active heartbeat does not extend physical retention beyond this bound and never applies to committed assets.

> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: FR-020Q. Proposed under Open Question OQ-4: private R2 delivery is storage-child-PRD scope. Its target contract uses private R2 objects and short-lived authorized URLs with an initial 60-minute lifetime, refresh beginning when fewer than 10 minutes remain, and the current URL remaining usable until a replacement URL is ready. Existing public R2 delivery may remain temporarily for compatibility until FR-020R and FR-020S byte-range, refresh, mobile, and live-session gates pass.

FR-020Q. Approved binding decision OQ-4: existing public R2 delivery remains temporarily. Private signed delivery is storage-child-PRD scope and may activate only after FR-020R and FR-020S byte-range, refresh, iOS Safari, mobile, and long live-session proof gates pass. Target private delivery uses short-lived authorized URLs with an initial 60-minute lifetime, refresh beginning when fewer than 10 minutes remain, and the current URL remaining usable until a replacement URL is ready.

FR-020R. Authorized delivery must support byte-range requests and long live-session playback without mid-test interruption. It must preserve `Range`, `206 Partial Content`, `Accept-Ranges`, stable `Content-Length`, and seeking behavior across supported browsers.

FR-020S. If URL refresh fails during a live test, playback must continue from the current or buffered source where possible, retry with bounded backoff, and alert the teacher monitor before interruption risk. Refresh failure alone must not pause the session.

FR-020T. The active-file count includes every retained audio asset referenced by the current draft or revision, including section audio. A removed replacement temp asset stops counting after its reference is removed and cleanup is queued.

FR-020U. The 10-audio-file limit is unrelated to the existing `Questions (0/10)` builder heading, which describes question capacity in that section. Audio-limit UI must say `audio files` explicitly and must not reuse or visually merge with the question counter.

FR-021. Listening authoring must not import Reading V2 Studio internals.

FR-022. Listening authoring must not move audio validation, parser selection, save/publish persistence, or published payload shaping into shared presentation primitives.

FR-023. Existing Mantine `AppShell` usage in `ListeningTestBuilder.tsx` is known drift, not approved shared architecture. Future touched areas must follow the no-new-Mantine direction from `documentation/architecture/ui-design-standards.md`.

FR-023A. Initial Listening draft creation must use an explicit Save draft action. Autosave may begin only after a durable draft ID exists.

FR-023B. Later draft edits may autosave and may also use explicit Save. Both paths must expose saving, saved, failed, and stale-conflict state.

FR-023C. Published Listening test versions are immutable. Editing a published version creates a revision draft. Publishing that revision creates a new immutable version; already assigned/in-progress sessions retain their original version.

FR-023D. Concurrent saves must use optimistic version checks. A stale editor save must be rejected with a reload/reconcile action; last-write-wins is prohibited.

FR-023E. Save and Publish must use operation idempotency keys and disable duplicate pending actions. Repeated requests must return the existing operation result rather than create duplicate versions or assets.

FR-023F. During pre-authoring-child-PRD visual-alignment phases, preserve current single-save behavior: missing section audio blocks the existing save/publish operation. After the approved authoring child PRD introduces separate Save draft and Publish actions, empty question lists and missing section audio may exist in a saved draft with warnings, but Publish remains blocked. See Edge Case 12 and the Listening authoring regression checklist.

FR-023G. Parser failure must preserve teacher input and error details and offer explicit manual mode. It must not silently switch modes or corrupt question state.

FR-023H. Draft deletion must be soft-delete with a seven-day recovery window before permanent reference cleanup.

FR-023I. Published tests must archive by default. Physical deletion is prohibited while retained attempts, results, revisions, or assigned sessions reference that version.

FR-023J. Builder navigation away with unsaved audio must warn that unsaved uploads will be discarded. Confirmed exit must queue immediate best-effort cleanup.

FR-023K. Legacy R2 Listening records must be supported by a read adapter. Migration here refers only to legacy R2 Listening records moving to the registry-backed model. It requires inventory, backup, dry run, an explicit migration PRD, and post-migration proof. On-read migration is prohibited. There is no Google Drive migration under this PRD.

> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: FR-023L. Proposed under Open Question OQ-1: Google Drive media handling is out of scope for this PRD. This PRD introduces no new Google Drive-specific error or migration UX and changes no existing Google Drive playback behavior. The separate Google Drive cleanup/deletion task owns removal of Google Drive upload code and disposition of Google Drive-backed tests. That task must honor test/result archive and deletion governance, but the R2 audio-retention model does not apply to audio that was never stored in R2.

FR-023L. Approved binding decision OQ-1: Google Drive media handling is out of scope for this PRD. This PRD introduces no new Google Drive behavior, migration, playback removal, or Google Drive-specific error state. The separate Google Drive cleanup/deletion task owns removal of Google Drive upload code and disposition of Google Drive-backed tests. That task must honor test/result archive and deletion governance, but the R2 audio-retention model does not apply to audio that was never stored in R2.

> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: FR-023M. Proposed under Open Question OQ-2: a legacy mutable published Listening test is treated as immutable version 1 when first edited under the new authoring model. The edit creates a revision draft under FR-023C; it must not mutate the legacy published record. Existing assignments, sessions, attempts, and results remain pinned to the legacy version.

FR-023M. Approved binding decision OQ-2: first edit freezes a legacy mutable published R2 Listening test as immutable version 1 and creates a revision draft under FR-023C. It must not mutate the legacy published record. Existing assignments, sessions, attempts, and results remain pinned to version 1.

> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: FR-023N. Proposed under Open Question OQ-2: legacy R2 test/result records that store a raw R2 URL rather than canonical `assetId` resolve audio through the legacy read adapter, which maps the stored URL directly. They are not required to gain registry identity during read. This mapping must be defined and tested before any Listening write path changes.

FR-023N. Approved binding decision OQ-2: legacy R2 test/result records that store a raw R2 URL rather than canonical `assetId` resolve audio through the legacy read adapter, which maps the stored URL directly without requiring registry identity during read. This mapping must be defined and tested before any Listening write path changes.

FR-023O. Save draft is a net-new Listening authoring control, not existing behavior being restyled. The authoring child PRD must define first-save empty state, saved-draft identity, saving/saved/error/conflict states, Publish transition, and recovery behavior.

FR-023P. The authoring/storage child PRDs must provide teacher-facing copy for the 8-hour edit-turn expiry, re-upload requirement, navigation-away discard warning, and confirmation that an unsaved upload was discarded. Shared components must not own this copy.

### Reading V2 Student Runtime

FR-024. Reading V2 runtime must remain projection-bound through `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`.

FR-025. Reading V2 runtime must continue rejecting canonical drafts, packaged materials, and legacy flat-question payloads before rendering.

FR-026. Reading V2 runtime must preserve passage rendering, question rendering, answer state, submit/review behavior, mobile/desktop layout, runtime telemetry, anti-cheat host integration, trusted submit, and return navigation.

FR-027. Runtime visual alignment is not part of early authoring unification. It must wait until shared authoring primitives are stable and dedicated runtime tests exist.

### Listening Solo/Homework Runtime

FR-028. `src/components/practice/ListeningPracticeView.tsx` must remain the solo/homework Listening host.

FR-029. Solo/homework Listening must preserve solo hooks, timer integration, autosave, resume, mobile-state hydration, submission, Listening layout, audio player, playback state, section navigation, answer state, and review behavior.

FR-030. Solo/homework Listening playback state must not be merged into live-session teacher authority.

FR-031. `src/components/test/mobile/mobileListeningState.ts` must remain Listening-specific while it stores solo/homework playback fields such as `currentAudioIndex`, `audioPositionSeconds`, `volume`, `playbackSpeed`, and completed audio indices.

### Listening Live-Session Runtime

FR-032. `src/skills/listening/components/ListeningTestPage.tsx` must remain the live Listening student runtime until a dedicated live-session PRD/test plan exists.

FR-033. Live Listening must preserve `audioCommand`, `masterAudioState`, `useAudioSync`, pause/resume, skip/seek, audio progress, headphone readiness, and teacher-controlled state.

FR-034. Live Listening may receive visual alignment only after live-session contract tests exist and prove teacher/student sync behavior.

FR-035. Live mobile state must continue excluding local playback persistence where playback is teacher/session controlled.

FR-035A. The target live authority model is `masterAudioState` as canonical continuous authority. `audioCommand` is compatibility-only command traffic until a dedicated live-session PRD proves retirement.

FR-035B. A teacher command transaction must update canonical `masterAudioState`; compatibility `audioCommand` emission must mirror that action rather than create an independent competing authority.

FR-035C. Canonical authority must use a monotonic revision plus trusted server timestamp. Highest valid revision wins. Timestamp alone must not decide authority.

FR-035D. Initial live-child-PRD tests must use 500 ms as soft correction and 2 seconds as hard-seek baselines. These are test baselines, not final product rules. Final thresholds require browser and live-session proof.

FR-035E. Default performance target is 100 students per live session and 20 concurrent sessions unless the product owner approves a larger class model.

### Teacher Monitor

FR-036. `src/pages/TeacherTestMonitorPage.tsx` must remain the teacher live-monitor workflow.

FR-037. `src/components/test/AudioProgressPanel.tsx` must remain the teacher-side master audio broadcaster and local audio UI owner.

FR-038. `src/components/test/TeacherTestControlBar.tsx` must remain a monitor action bar and must not become a shared assessment shell.

FR-039. `src/components/test/HeadphoneRequestPanel.tsx` must remain the teacher permission UI for offline headphone requests.

FR-040. `src/hooks/monitor/useMonitorControls.ts`, `src/hooks/audio/useMasterAudioState.ts`, and `src/hooks/audio/useAudioSync.ts` must remain protected Listening/live-session authority hooks.

FR-041. Teacher monitor work must not be treated as a normal visual shell refactor. It controls live Listening authority.

### General Governance

FR-042. Future PRDs or implementation prompts must cite this PRD when touching IELTS Reading V2 and Listening unification work.

FR-043. Every implementation patch must list protected files touched, if any. If any protected live Listening file is touched, the patch must include a dedicated live-session test plan.

FR-044. Every implementation patch must prove the shared layer has no prohibited module imports.

FR-045. Every implementation patch must run targeted tests for touched shared primitives and adopting surfaces.

FR-046. Every implementation patch must update the implementation log or a successor living doc when architecture truth changes.

FR-047. PRD-0055 is the parent authority. Separate child PRDs are required for R2 asset lifecycle/security, Listening authoring behavior changes, solo/homework runtime alignment, and live-session authority/runtime work.

FR-048. Requirement authority order is: stronger architecture/safety rule, canonical architecture document, PRD-0055, approved child PRD, approved implementation plan, then code comments. Any discovered contradiction must stop the affected phase and update the controlling document before code proceeds.

FR-049. Every child implementation packet must list owned files, protected files, exact allowed behavior changes, prohibited behavior changes, tests, browser evidence, rollback steps, observability requirements, and stop conditions.

FR-050. Unanswered child-PRD decisions block that affected phase. A developer must not select a recommendation, equivalent solution, or inferred behavior without approval.

FR-051. Storage and live-session phases require product-owner approval plus technical architecture/security review before implementation starts.

## 5. Non-Goals / Out Of Scope

This PRD does not include:

1. Replacing Listening runtime with Reading V2 runtime.
2. Replacing `ListeningPracticeView` or `ListeningTestPage` with `ReadingV2RuntimeShell`.
3. Merging live Listening and solo/homework Listening state.
4. Changing teacher audio authority.
5. Changing `audioCommand` / `masterAudioState` behavior.
6. Changing headphone request/check flow.
7. Implementing audio upload/storage lifecycle changes directly from this parent PRD; that work requires the dedicated storage child PRD.
8. Removing obsolete Google Drive implementation residue; that requires a separate cleanup and data audit.
9. Changing parser schemas.
10. Changing published Listening payload shape.
11. Changing Reading V2 import normalization.
12. Changing Reading V2 projection, trusted-submit, anti-cheat, or AI feedback boundaries.
13. Changing scoring behavior.
14. Creating a universal runtime before tests exist.
15. Moving module-specific behavior into shared assessment primitives.
16. Cleaning unrelated Mantine residue outside the specific touched authoring area.
17. Changing teacher monitor behavior as part of early authoring unification.
18. Patching live Listening without a dedicated live-session PRD/test plan.
19. Broad folder restructuring before enough stable shared primitives exist.
20. Treating this parent PRD as one broad implementation ticket.
21. On-read migration of legacy R2 Listening data. Google Drive migration does not exist in this PRD.
22. Content-addressed audio deduplication in the first storage lifecycle implementation.

## 6. Design Considerations

The design direction is calm, dense, academic, and operational. Shared IELTS assessment UI must be scan-friendly and source-led. It must not become a marketing-style shell or decorative rewrite.

Design rules:

1. Reading V2 is the visual reference for authoring precision, validation display, review readiness, and assessment status language.
2. Listening may align visually with Reading V2, but audio-specific fields and live authority must remain visibly and structurally protected.
3. Shared assessment components must use neutral wording and slots rather than module-specific copy.
4. Cards must stay restrained. Avoid nested cards as a default layout primitive.
5. Action controls must stay near the work they affect.
6. Status and validation state must use text plus structure, not color alone.
7. Heading levels must be explicit because shared primitives are used inside nested authoring surfaces.
8. Mobile controls must meet the `44px x 44px` touch target floor where visible.
9. Teacher header and shared teacher shell boundaries remain governed by `TeacherHeader` and teacher architecture docs. This PRD does not authorize moving page controls into `TeacherHeader`.
10. Known Listening builder Mantine/AppShell drift must not be promoted into a shared design pattern.
11. Audio count and question count are separate domains. Always label the audio constraint as `audio files`; do not present it as another unlabeled `(N/10)` counter.

Safe design examples:

- Use `AssessmentAuthoringSection` for a display-only Reading V2 advisory block.
- Use `AssessmentStatusState` for an authoring empty state with no parser/audio/persistence behavior.
- Use `AssessmentValidationSummary` when the feature already calculated ready/blocked state and issue count.

Unsafe design examples:

- Add `audioSections` or `masterAudioState` props to a shared card.
- Add `passages` or `projection` props to a shared status component.
- Add `if (skill === 'Listening')` branches inside shared components.
- Move teacher monitor controls into a generic shared assessment toolbar.
- Copy Reading V2 Build Workspace layout wholesale into Listening live runtime.

## 7. Technical Considerations

The shared layer must stay dependency-neutral and presentation-first.

Allowed current path:

```text
src/features/assessment/shared/components/
```

Current implemented shared components:

- `AssessmentAuthoringSection.tsx`
- `AssessmentStatusState.tsx`
- `AssessmentValidationSummary.tsx`

The target architecture may expand this area only through small, tested contracts:

```text
src/features/assessment/
  shared/
    components/
    hooks/
    types/
    validation/
    navigation/
    state/
  reading-v2/
    authoring/
    runtime/
    adapters/
    types/
  listening/
    authoring/
    runtime/
    live-session/
    audio/
    adapters/
    types/
```

This tree is a target model, not a command to restructure the repo immediately. Follow current repo conventions and add neutral primitives incrementally.

Technical rules:

1. Shared components must be React/native CSS or approved repo primitives. Do not add new Mantine imports.
2. Shared component tests must verify semantics, heading level, roles, status/action rendering, and module-neutral API.
3. Adopting modules must keep data transformation local.
4. Use adapter props, not module-specific branching, when a module consumes shared presentation.
5. Runtime abstraction must not start until runtime tests exist.
6. Live-session abstraction must not start until live-session contract tests exist.
7. Every shared component must pass a boundary grep for prohibited imports and behavior words.
8. Extract a neutral visual primitive only when both Reading V2 and Listening consume it in the same pull request or in explicitly named adjacent pull requests.
9. The second consumer, owned files, tests, and reviewer must be identified before the extraction lands.
10. Shared loading/error components may render retry controls, but retry behavior and side effects remain module-owned.
11. Shared answer input primitives remain prohibited until two modules prove identical semantic, validation, accessibility, and persistence contracts.

Suggested boundary grep pattern for shared components:

```powershell
rg -n "components/reading-v2|services/reading-v2|skills/listening|AudioProgressPanel|useMonitorControls|useMasterAudioState|useAudioSync|AudioPlayer|ListeningTestPage|ListeningPracticeView|masterAudioState|audioCommand|headphoneRequest|passage|parser|storage|published" src/features/assessment/shared
```

Expected result for a neutral presentation patch: no prohibited matches, except harmless text inside tests only when the test asserts that prohibited data is not part of the API.

## 8. Current Architecture Summary

### Current Shared Foundation

Current neutral shared assessment primitives:

- `src/features/assessment/shared/components/AssessmentAuthoringSection.tsx`
- `src/features/assessment/shared/components/AssessmentStatusState.tsx`
- `src/features/assessment/shared/components/AssessmentValidationSummary.tsx`

Current adoption:

- `src/pages/ReadingV2StudioPage.tsx`: `AssessmentStatusState` for revision hydration loading, revision hydration error, and invalid studio context.
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`: `AssessmentAuthoringSection` for `Accessibility And Runtime Advisories`.
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`: `AssessmentValidationSummary` for `Publish Readiness`.
- `src/skills/listening/builders/ListeningTestBuilder.tsx`: `AssessmentAuthoringSection` for Step 4 Questions / Answer Key wrapper and title/action row.
- `src/skills/listening/builders/ListeningTestBuilder.tsx`: `AssessmentStatusState` for Step 4 empty question list.

Current non-adoption:

- `AssessmentValidationSummary` is not adopted by Listening.
- No shared primitive owns Listening runtime, live-session, audio, headphone, monitor, or mobile-navigation behavior.
- No shared primitive owns Reading V2 parser/import, projection, runtime-host, trusted-submit, or passage rendering behavior.

### Reading V2 Authoring

Current routes and files:

- `src/constants/routes.ts`
- `src/routes/teacherRoutes.tsx`
- `src/pages/ReadingV2StudioPage.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
- `src/services/reading-v2/readingV2StudioWorkflow.service.ts`
- `src/services/reading-v2/readingV2ImportNormalization.service.ts`

Current behavior:

- Dedicated Reading V2 Studio routes exist for create, import, draft resume, and published revision.
- `ReadingV2StudioPage` resolves the route mode.
- `ReadingV2StudioShell` owns the main Studio UI and Reading-specific workflow.
- Reading V2 import normalization is large and Reading-specific.

### Reading V2 Runtime

Current files:

- `src/pages/StudentPracticePage.tsx`
- `src/pages/TestPageRouter.tsx`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`
- `src/services/reading-v2/readingV2Projection.service.ts`
- `src/services/reading-v2/readingV2LaunchIntegration.service.ts`
- `src/services/reading-v2/readingV2RuntimeBoundary.service.ts`
- `src/services/reading-v2/readingV2RuntimeSubmission.service.ts`

Current behavior:

- `StudentPracticePage` mounts `ReadingV2RuntimeShell` for non-live Reading V2 projections.
- `TestPageRouter` mounts `ReadingV2RuntimeShell` for live Reading V2 sessions.
- The runtime shell renders derived V2 projections only.
- Non-live student launch uses `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`.
- Live-session launch uses `reading_v2/projections/session_test_payloads/{sessionCode}:{snapshotVersionId}`.

### Listening Authoring

Current files:

- `src/pages/TestBuilderRouter.tsx`
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
- `src/services/listeningTestStorage.ts`
- `src/services/parser/listening.router.ts`

Current behavior:

- `TestBuilderRouter` maps `skill=Listening` to `ListeningTestBuilder`.
- `ListeningTestBuilder` owns metadata/setup, audio upload/import, question setup, parser/manual flow, review, and save/publish.
- `listeningTestStorage.ts` owns audio-section validation, current URL-based temp-to-permanent R2 movement, `audioUrl` / `streamUrl` formatting, question section mapping, audio controls config, and save behavior.
- Current Listening save is also publish: `saveListeningTestToFirebase()` hardcodes `isPublished: true`, creates a new record, and has no draft lifecycle.
- Current save hard-blocks missing section audio before persistence.
- Save draft, separate Publish, immutable published versions, revision drafts, optimistic concurrency, and first-edit legacy freezing are net-new authoring behavior. They are not behavior preserved by early visual alignment.
- The storage child PRD replaces the current URL-based movement internals with registry-backed asset commit while keeping `listeningTestStorage.ts` as the Listening persistence owner.
- Missing audio sections block save.

### Listening Solo/Homework Runtime

Current files:

- `src/pages/StudentPracticePage.tsx`
- `src/components/practice/ListeningPracticeView.tsx`
- `src/components/test/mobile/MobileListeningExamScaffold.tsx`
- `src/components/test/mobile/mobileListeningState.ts`
- `src/skills/listening/components/AudioPlayer.tsx`

Current behavior:

- `StudentPracticePage` routes IELTS Listening solo/homework to `ListeningPracticeView`.
- `ListeningPracticeView` owns solo hooks, timer, autosave, resume, mobile-state hydration, submission, and Listening layout.
- Solo/homework Listening mobile state is Listening-specific and includes playback fields.

### Listening Live Session

Current files:

- `src/pages/TestPageRouter.tsx`
- `src/skills/listening/components/ListeningTestPage.tsx`
- `src/skills/listening/components/AudioPlayer.tsx`
- `src/hooks/audio/useAudioSync.ts`

Current behavior:

- `/student-test/:sessionCode` routes through `TestPageRouter`.
- Listening live branch renders `ListeningTestPage`.
- `ListeningTestPage` consumes `audioCommand`, `masterAudioState`, `audioMode`, and `headphoneRequest`.
- `AudioPlayer` follows `masterAudioState.isPlaying` in online teacher-controlled mode.
- Live mobile state intentionally excludes local playback persistence.

### Teacher Monitor

Current files:

- `src/pages/TeacherTestMonitorPage.tsx`
- `src/components/test/AudioProgressPanel.tsx`
- `src/components/test/TeacherTestControlBar.tsx`
- `src/components/test/HeadphoneRequestPanel.tsx`
- `src/hooks/monitor/useMonitorControls.ts`
- `src/hooks/audio/useMasterAudioState.ts`

Current behavior:

- Teacher monitor route is `/teacher-test/:sessionCode`.
- `TeacherTestMonitorPage` mounts `AudioProgressPanel` only for in-progress Listening tests with audio sections.
- `HeadphoneRequestPanel` manages offline Listening headphone requests.
- `useMonitorControls` writes live session control fields under `game_sessions/{sessionCode}`.
- Current live audio authority is dual-path: `audioCommand` plus `masterAudioState`.
- `game_sessions/{code}/masterAudioState` stores unified audio authority.
- `game_sessions/{code}/players/{studentId}/headphoneRequest` stores per-student headphone readiness.

## 9. Target Architecture

Target model:

```text
src/features/assessment/
  shared/
    components/
      AssessmentStatusState
      AssessmentValidationSummary
      AssessmentAuthoringSection
      future neutral authoring cards
      future neutral action rows
      future neutral metadata panels
      future neutral loading/error/empty states
      future neutral question wrappers
    hooks/
    types/
    validation/
    navigation/
    state/

  reading-v2/
    authoring/
    runtime/
    adapters/
    types/

  listening/
    authoring/
    runtime/
    live-session/
    audio/
    adapters/
    types/
```

Do not force this exact folder structure if the repo already uses a different convention. The principle matters more than the folder names:

```text
shared has no module-specific dependency
Reading V2 depends on shared
Listening depends on shared
Reading V2 and Listening do not depend on each other
```

Target shared layer responsibilities:

- presentation primitives
- generic status semantics
- generic validation summary display
- generic authoring section/card layout
- generic action-row layout
- generic review/publish display containers
- generic loading/error/empty states
- generic mobile layout primitives where no audio or passage authority leaks in

Target module responsibilities:

- Reading V2 owns passages, projections, import normalization, task groups, validation calculations, publish readiness, runtime host integration, trusted submit, and review issue activation.
- Listening authoring owns audio upload/import/preview, audio sections, parser/manual mode, audio storage, and published payload compatibility.
- Listening solo/homework runtime owns local playback/resume/autosave/mobile state.
- Listening live-session owns teacher authority, live audio sync, `audioCommand`, `masterAudioState`, headphone readiness, and teacher monitor integration.

## 10. Dependency Rules

1. `src/features/assessment/shared/**` must not import Reading V2 or Listening modules.
2. Reading V2 may import shared assessment primitives.
3. Listening may import shared assessment primitives.
4. Reading V2 must not import Listening internals.
5. Listening must not import Reading V2 internals.
6. Shared components must receive module-specific content through `children` or neutral slots.
7. Shared components must not contain module conditionals.
8. Shared hooks must not read route state, Firebase session state, Reading V2 projections, Listening audio state, or monitor state unless a later PRD defines a tested neutral adapter.
9. Data writes stay feature-owned.
10. Parser behavior stays feature-owned.
11. Runtime authority stays feature-owned.
12. Live-session authority stays Listening-owned.

Safe dependency example:

```text
ListeningTestBuilder
  -> maps current local question count into title text
  -> passes title/action/children into AssessmentAuthoringSection
  -> keeps add/edit/delete/parser/save/audio handlers local
```

Unsafe dependency example:

```text
AssessmentAuthoringSection
  -> receives audioSections
  -> checks missing audio
  -> calls saveListeningTestToFirebase
```

## 11. Shared Assessment Layer Specification

### Current Components

`AssessmentStatusState`:

- Purpose: generic loading, error, and empty presentation.
- Allowed props: variant, title, title level, message, primary/secondary action, element, alignment, role, aria label, busy state, class name.
- Current adoptions: Reading V2 Studio route states and Listening Step 4 empty question state.

`AssessmentValidationSummary`:

- Purpose: generic ready/blocked validation summary display.
- Allowed props: title, status, summary, messages, issue count, issue label, heading level, aria label, role, class name.
- Current adoption: Reading V2 Settings `Publish Readiness`.
- Current non-adoption: Listening.

`AssessmentAuthoringSection`:

- Purpose: semantic authoring section wrapper with title, description, status slot, action slot, heading level, aria label, children, and class name.
- Current adoptions: Listening Step 4 Questions / Answer Key wrapper and Reading V2 Settings advisory block.

### Future Shared Components

Future neutral components may include:

1. `AssessmentAuthoringCard`
2. `AssessmentAuthoringHeader`
3. `AssessmentActionRow`
4. `AssessmentMetadataPanel`
5. `AssessmentReviewPublishPanel`
6. `AssessmentQuestionCard`
7. `AssessmentAnswerInputFrame`
8. `AssessmentMobileStack`
9. `AssessmentInlineNotice`
10. `AssessmentEmptyState`
11. `AssessmentErrorState`
12. `AssessmentLoadingState`

Each future component must pass these checks:

- No module-specific imports.
- No module-specific props.
- No data writes.
- No parser logic.
- No storage logic.
- No runtime authority.
- No live-session authority.
- Tests cover role, heading level, action rendering, children rendering, and disabled/empty states where applicable.

### Allowed Shared Props

Shared components may accept:

- `children`
- `title`
- `description`
- `status`
- `action`
- `secondaryAction`
- `headingLevel`
- `ariaLabel`
- `className`
- neutral layout props such as `density`, `align`, or `variant` only when they remain module-agnostic

### Forbidden Shared Props

Shared components must not accept:

- `audioSections`
- `audioCommand`
- `masterAudioState`
- `headphoneRequest`
- `currentAudioIndex`
- `passages`
- `taskGroups`
- `projection`
- `parserResult`
- `draftId` for behavior
- `materialId` for data loading
- `sessionCode` for live state
- `teacherSessionState`
- `publishPayload`
- `storagePath`
- `isReading`
- `isListening`
- `isLiveSession`
- `skill`
- `module`

Exception: a future neutral display component may accept a `moduleLabel` string for visible copy only if it does not branch behavior.

## 12. Reading V2 Boundaries

Reading V2 owns:

- Studio route modes.
- Metadata editing.
- Passage creation/editing.
- Task group creation/editing.
- Answer keys.
- Import normalization.
- Validation calculation.
- Draft save.
- Publish.
- Revision.
- Preview.
- Publish readiness.
- Runtime projections.
- Passage rendering.
- Runtime question rendering.
- Trusted submit.
- Anti-cheat integration.
- AI feedback payload integration.
- Admin monitoring audit event path.

Protected Reading V2 files and services:

- `src/pages/ReadingV2StudioPage.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx`
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`
- `src/services/reading-v2/readingV2StudioWorkflow.service.ts`
- `src/services/reading-v2/readingV2ImportNormalization.service.ts`
- `src/services/reading-v2/readingV2Projection.service.ts`
- `src/services/reading-v2/readingV2LaunchIntegration.service.ts`
- `src/services/reading-v2/readingV2RuntimeBoundary.service.ts`
- `src/services/reading-v2/readingV2RuntimeSubmission.service.ts`
- `src/services/reading-v2/readingV2AuditTrail.service.ts`

Safe Reading V2 changes:

- Replace display-only local wrapper with neutral shared section component after focused tests.
- Render already-calculated publish readiness through neutral validation summary.
- Use generic status-state component for route loading/error/empty branches.

Unsafe Reading V2 changes:

- Add Listening audio fields into Reading V2 Studio files.
- Reuse Reading V2 import normalization for Listening.
- Let Reading V2 runtime shell own Listening audio/session behavior.
- Move trusted-submit or anti-cheat host behavior into shared presentation code.
- Change Reading V2 projection launch paths as part of visual alignment.

## 13. Listening Authoring Boundaries

Listening authoring owns:

- Builder flow.
- Metadata/setup.
- Audio upload.
- Current R2 temp upload and URL-based temp-to-permanent movement during visual-alignment phases.
- Future registry-backed asset commit under the storage child PRD.
- R2 audio upload and URL assignment.
- Audio preview.
- Audio sections.
- Question setup.
- Text/manual entry mode.
- Parser skip/manual mode.
- Review/publish display.
- Validation.
- Save/publish.
- Published Listening payload compatibility.

Protected Listening authoring files:

- `src/pages/TestBuilderRouter.tsx`
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
- `src/services/listeningTestStorage.ts`
- `src/services/parser/listening.router.ts`
- `src/services/r2Storage.ts`, exported as `r2StorageService`
- existing Google Drive service/branch residue, which must not be extended or changed by this PRD and is owned by a separate cleanup/deletion task

Safe Listening authoring changes:

- Wrap one display-only step section in `AssessmentAuthoringSection`.
- Use `AssessmentStatusState` for empty/loading/error display when existing behavior is unchanged.
- Adopt `AssessmentValidationSummary` only if existing semantics and heading/status roles are preserved and covered by tests.
- Replace touched Mantine wrapper only when scope is explicitly an authoring-shell cleanup and tests cover the selected area.

Unsafe Listening authoring changes:

- Change audio upload or storage lifecycle during visual alignment.
- Extend or change existing Google Drive branches during visual alignment.
- Change parser schema or parser fallback behavior during visual alignment.
- Change published payload shape during visual alignment.
- Import Reading V2 Studio components or services.
- Move `saveListeningTestToFirebase` decisions into shared UI.
- Treat missing audio as a generic shared validation rule.

## 14. Listening Solo/Homework Runtime Boundaries

Listening solo/homework runtime owns:

- `ListeningPracticeView`.
- Solo hooks.
- Timer.
- Autosave.
- Resume.
- Saved progress.
- Mobile state.
- Playback state.
- Audio player.
- Current audio index.
- Viewed part/section.
- Answer state.
- Submit/review.

Protected files:

- `src/components/practice/ListeningPracticeView.tsx`
- `src/components/practice/ListeningPracticeView.test.tsx`
- `src/components/test/mobile/MobileListeningExamScaffold.tsx`
- `src/components/test/mobile/mobileListeningState.ts`
- `src/skills/listening/components/AudioPlayer.tsx`
- `src/skills/listening/components/ListeningHeader.tsx`
- `src/skills/listening/components/ListeningQuestionDisplay.tsx`
- `src/skills/listening/components/ListeningQuestionNav.tsx`
- `src/skills/listening/components/ListeningNavArrows.tsx`
- `src/skills/listening/components/ListeningImageModeDisplay.tsx`
- `src/components/test/mobile/MobileListeningImageCanvas.tsx`
- `src/components/test/mobile/MobileListeningAnswerSheet.tsx`

Rules:

1. Solo/homework playback state must remain local/resume-driven.
2. Solo/homework state must not write to `audioCommand` or `masterAudioState`.
3. Shared visual components may wrap question cards only after tests prove playback, resume, autosave, and submit remain unchanged.
4. Mobile section navigation rules from `documentation/architecture/mobile-ielts-listening-audio-navigation.md` must remain authoritative.
5. Audio source reload behavior remains `AudioPlayer`-owned.

## 15. Listening Live-Session Boundaries

Listening live-session runtime owns:

- `ListeningTestPage`.
- Live audio command processing.
- `audioCommand`.
- `masterAudioState`.
- `useAudioSync`.
- Pause/resume.
- Skip/seek.
- Audio progress.
- Headphone readiness.
- Teacher-controlled state.
- Live mobile shell state.
- Student synchronization with teacher monitor.

Protected files:

- `src/skills/listening/components/ListeningTestPage.tsx`
- `src/skills/listening/components/AudioPlayer.tsx`
- `src/hooks/audio/useAudioSync.ts`
- `src/hooks/audio/useMasterAudioState.ts`
- `src/pages/TestPageRouter.tsx`
- `src/__tests__/integration/ListeningTestPage.test.tsx`
- `src/skills/listening/components/AudioPlayer.test.tsx`

Rules:

1. Live Listening must not be refactored as part of early authoring unification.
2. Live Listening visual alignment must wait for a dedicated live-session PRD/test plan.
3. Live Listening must continue consuming both `audioCommand` and `masterAudioState` while the repo is in dual-path audio migration.
4. Student reload, late join, drift correction, buffering, and teacher skip/pause/resume need explicit live proof before behavior changes.
5. Shared assessment shells must not own `currentAudioIndex`, `currentQuestionNumber`, `isPlaying`, `teacherSeekPosition`, `audioCommand`, `masterAudioState`, or `headphoneRequest`.
6. `masterAudioState` is the target canonical continuous authority. `audioCommand` remains compatibility traffic until the live-session child PRD proves a safe retirement.
7. Teacher command handling must update canonical state with a monotonic revision and trusted server timestamp before or atomically with compatibility event publication.
8. Student clients must never restore solo/local playback authority after a live reload.

## 16. Teacher Monitor And Live Audio Authority Model

Teacher monitor is part of Listening authority. It is not a normal visual shell.

Current teacher monitor model:

- `TeacherTestMonitorPage` is the monitor route shell.
- `AudioProgressPanel` is the teacher-side master audio broadcaster and local audio UI owner.
- `TeacherTestControlBar` calls monitor actions.
- `HeadphoneRequestPanel` manages pending headphone requests.
- `useMonitorControls` writes session control updates.
- `useMasterAudioState` broadcasts/listens to `game_sessions/{sessionCode}/masterAudioState`.
- `useAudioSync` applies student drift correction from master audio state.

Current live authority data paths:

```text
game_sessions/{sessionCode}/audioCommand
game_sessions/{sessionCode}/masterAudioState
game_sessions/{sessionCode}/players/{studentId}/headphoneRequest
game_sessions/{sessionCode}/studentAccommodations/{studentId}
```

Current dual-path implementation:

- `audioCommand` still routes teacher commands such as pause, resume, skip, speed, and seek.
- `masterAudioState` stores section, position, speed, playing state, timestamp, and action metadata for sync/drift correction.
- `AudioPlayer` follows `masterAudioState.isPlaying` in online teacher-controlled mode.

Approved target authority:

- `masterAudioState` is canonical continuous authority.
- A canonical state update carries a monotonic revision and trusted server timestamp.
- Highest valid revision wins when states disagree.
- `audioCommand` mirrors compatibility event traffic and must not independently override a newer canonical state.
- Retirement of `audioCommand` requires a dedicated live-session PRD, compatibility inventory, migration plan, and browser/live proof.
- `TeacherTestControlBar` and `AudioProgressPanel` must use the same authority transaction. Divergence is a defect, not an accepted alternative.

Known risk:

- `TeacherTestMonitorPage` page-level wrapper calls to `pauseAllAudio()` and `resumeAllAudio()` can use default section `1`, position `0`, speed `1.0` when richer audio context is not passed. `AudioProgressPanel` carries richer local audio context. This is unsafe to touch without live-session browser proof.

Protected behavior:

- Teacher pause/resume.
- Teacher skip-to-section.
- Teacher seek.
- Teacher speed change.
- Audio progress heartbeat.
- Student drift correction.
- Headphone request approval/denial/pending state.
- Late join command filtering.
- Student reload sync.
- Teacher session end while student submits.

## 17. Edge Cases

1. Student joins live Listening late: load canonical section, position, speed, and play state; account for elapsed trusted server time; ignore stale commands from before join; then drift-correct.
2. Teacher pauses while student audio is buffering: student must not continue local playback after the pause is authoritative.
3. Teacher resumes after long pause: student must perform an authoritative seek, wait for ready state, then play from teacher-authoritative section/position/speed rather than stale local time.
4. Teacher skips section while some students are behind: a new canonical revision invalidates old playback, and all students seek to the teacher-selected section.
5. `audioCommand` and `masterAudioState` disagree: highest valid canonical `masterAudioState` revision wins; stale compatibility commands must be ignored.
6. Student reloads during live Listening: student must rehydrate from live session authority, not solo/homework local playback state.
7. Student reloads during solo/homework Listening: student may resume from solo/homework saved progress and local playback state.
8. Student switches mobile/desktop viewport: state must not corrupt answer, section, or audio position; mobile rules must remain consistent.
9. Audio URL missing or expired: resolve a new authorized URL from canonical asset identity. Show a recoverable error if resolution fails; never change published payload shape or fall back to an obsolete provider.
10. R2 temp audio fails to commit to durable storage: save/publish must fail closed, preserve the previously saved asset reference, and queue unreferenced partial objects for cleanup. Do not persist expiring temp URLs as saved content.
> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 11. Proposed under OQ-1: obsolete Google Drive data or URLs are out of scope. This PRD changes nothing about existing Google Drive upload or playback behavior. The separate Google Drive cleanup/deletion task handles removal and disposition of Google Drive-backed tests; those tests are not migrated by this PRD.

11. Approved binding decision OQ-1: obsolete Google Drive data and URLs are out of scope. This PRD adds no Google Drive behavior or migration, removes no current playback, and adds no Google Drive-specific error state. The separate Google Drive cleanup/deletion task handles upload-code removal and disposition of Google Drive-backed tests.
12. Listening section has missing audio: during pre-authoring-child-PRD visual-alignment phases, preserve current behavior and block the existing single save/publish operation. After the authoring child PRD splits Save draft from Publish, allow draft save with warnings and block Publish. FR-023F is the binding post-split rule.
13. Listening parser fails or is skipped: manual mode must remain available and parser failure must not corrupt question state.
14. Empty question list in Listening builder: current `AssessmentStatusState` empty branch must remain display-only and keep Add Question available.
15. Reading V2 projection missing or invalid: runtime must reject before rendering and keep host error behavior.
16. Reading V2 import normalization fails: Studio must fail closed or show existing import review error; do not route through Listening parser logic.
17. Publish attempted with validation errors: feature-owned publish gating must block publish; shared summary may display already-calculated status only.
18. Autosave fails: runtime/authoring owner must show recoverable state and preserve unsaved edits where current contracts require it. Failed autosave-like UI state must not retain temp audio as a saved draft.
19. Time-up occurs during save: finish the in-flight answer save where possible, then execute one idempotent submit. Shared UI must not decide.
20. Resume state is stale: solo/homework owner must decide resume vs fresh state; shared UI may render the decision only.
21. Old Listening tests remain compatible: published payload shape and storage reads must not change during visual alignment.
22. Old Reading V2 materials remain compatible: projection and launch contracts must not change during shared presentation work.
23. Student submit is clicked twice: runtime owner must use an idempotency key plus pending-action disablement so only one submit is accepted.
24. Teacher ends session while student is submitting: an already accepted idempotent submit may complete; later submissions must reject with a recoverable result/review state.
25. Headphone readiness is pending or denied: `HeadphoneRequestPanel`, `AudioPlayer`, and headphone hooks must preserve current gate behavior.
26. Mobile keyboard covers answer input: future mobile visual alignment must preserve accessible answer entry and avoid hidden controls.
27. Screen reader user encounters loading/error/validation states: shared components must use correct roles, headings, labels, and status/alert semantics.
28. Shared component receives module-specific data by mistake: review must reject the patch or move logic back into the adapter/module.
29. A future test type tries to use shared components incorrectly: it must use neutral contracts and keep module-specific behavior in its own adapter.
30. A Codex patch tries to import Reading V2 internals into Listening: block the patch and move shared behavior to neutral assessment layer only if it is truly neutral.
31. Teacher closes or abandons builder after upload: queue immediate best-effort deletion; scheduled cleanup removes any surviving temp object.
32. Browser crashes before abandonment cleanup: heartbeat becomes stale after 3 minutes; asset remains non-durable and scheduled cleanup deletes it no later than 24 hours after upload.
33. Editor stays open for more than 8 hours: heartbeat must stop extending eligibility. Teacher must explicitly Save draft or re-upload; implementation must not promote automatically.
34. Authentication expires while editor is open: stop heartbeat and upload authority, preserve already saved draft state, and queue uncommitted assets for cleanup.
35. Audio replacement is cancelled: old committed asset remains authoritative; new temp asset is deleted or expires.
36. Authorized delivery URL approaches expiry during live playback: refresh before 10 minutes remain, retain current URL until replacement is ready, and avoid media interruption.
37. Authorized delivery refresh fails: keep current/buffered playback where possible, retry with bounded backoff, and warn teacher monitor before interruption risk.
38. Range request is unsupported or malformed: fail validation before publish or live use; do not silently ship non-seekable delivery.
39. More than 10 active audio files are selected: reject the additional file before upload and preserve existing valid files.
40. Audio file exceeds 50 MB or uses unsupported format: reject before upload with file-specific guidance.
41. Teacher loses network partition during live Listening: use a bounded grace period, then pause locally and show sync loss; resume only from canonical teacher authority.
42. Teacher disconnects: freeze canonical audio state and show reconnect state; students must not auto-resume.
> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 43. Proposed under OQ-2: teacher edits a legacy mutable published Listening test for the first time: freeze the legacy record as immutable version 1, create a revision draft, and keep existing assignments/results pinned to version 1.

43. Approved binding decision OQ-2: when a teacher first edits a legacy mutable published R2 Listening test, freeze the legacy record as immutable version 1, create a revision draft, and keep existing assignments, results, and sessions pinned to version 1.

> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 44. Proposed under OQ-2: legacy R2 result/test audio uses a raw URL rather than `assetId`: resolve the stored R2 URL through the legacy read adapter. Do not require registry identity during read and do not apply this rule to Google Drive media.

44. Approved binding decision OQ-2: legacy R2 result/test audio that uses a raw URL rather than `assetId` resolves through the legacy read adapter without requiring registry identity during read. This rule does not apply to Google Drive media.
45. iOS Safari requests private audio: delivery must return valid byte-range responses, including `206 Partial Content`, `Accept-Ranges`, and stable `Content-Length`; publish/live rollout must stop if seeking or playback fails.
46. Same teacher opens the same draft in multiple tabs: each tab owns a separate authenticated lease. Closing one tab must not queue deletion while another valid same-owner/same-draft lease or committed reference remains. The storage child PRD must define lease aggregation and race tests before heartbeat implementation.
47. Teacher starts another replacement while a prior replacement is committing: block the second replacement until the first operation resolves. Each replacement uses a distinct asset and idempotency key; transient file-count checks must not delete the saved asset.
48. Teacher monitor reloads during live Listening: reload must restore controls from canonical `masterAudioState`, must not reset section/position/speed to defaults, and must not emit a new command until authority state is hydrated.
49. Audio enters `pending-delete` because `lastReferencedAt` is stale while a retained result/assignment still references it: live reference indexes, not timestamps, are deletion authority. Cleanup must remove the pending-delete state and preserve the object.

## 18. Conflict Rules

1. If visual consistency conflicts with live Listening authority, live authority wins.
2. If visual consistency conflicts with Reading V2 projection/runtime safety, Reading V2 runtime safety wins.
3. If shared abstraction requires many `if reading` / `if listening` branches, the abstraction is wrong.
4. If Listening authoring alignment risks audio storage behavior, preserve storage behavior.
5. If Reading V2 cleanup risks parser/import behavior, preserve parser/import behavior.
6. If a shared component needs module-specific knowledge, move that logic back to the adapter/module.
7. If live Listening behavior cannot be proven with tests and browser evidence, do not refactor it.
8. If solo Listening and live Listening disagree, do not merge their state models.
9. If a future test type wants to use shared components, it must use neutral contracts and keep module-specific behavior in its own adapter.
10. If current source contradicts older strategy/research text, current code plus `documentation/architecture/ielts-reading-v2-listening-unification.md` win.
11. If this PRD conflicts with a stronger safety architecture doc, the stronger architecture doc wins and this PRD must be updated.
12. If a patch changes a protected path by accident, revert only that patch's changes or apply a minimal forward fix. Do not revert unrelated user work.

## 19. Data And Storage Constraints

### Reading V2

1. Reading V2 runtime remains projection-bound.
2. Non-live student launch uses `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`.
3. Live-session launch uses `reading_v2/projections/session_test_payloads/{sessionCode}:{snapshotVersionId}`.
4. Reading V2 audit state-changing events remain at `reading_v2/audit_events/{eventId}`.
5. Trusted submit must not trust browser scoring, answer keys, scoring rules, or canonical content.
6. Shared presentation work must not change canonical drafts, packaged materials, projections, runtime payloads, audit payloads, or submit payloads.

### Listening

1. `src/services/listeningTestStorage.ts` remains the owner of Listening persistence shape.
2. Save must keep audio-section validation.
3. New uploads must use opaque R2 temp keys under `temp/listening/`.
4. Successful saved drafts and published tests must reference immutable durable asset keys.
5. Replacement uploads must not overwrite currently saved objects before save success.
6. Asset identity must use `assetId`/object key, not a mutable public URL.
7. A trusted asset registry or equivalent indexed manifest must track owner, state, metadata, and draft/test/revision/result references.
8. R2 lifecycle expiration must apply to the temp prefix only. Uncommitted temp objects must be deleted no later than 24 hours after upload.
9. Unreferenced durable assets must enter `pending-delete`, wait through a default seven-day rollback grace period, and be rechecked immediately before deletion.
10. Save/publish success must not be reported while the persisted record points to an expiring temp object.
11. Cleanup must be bounded, checkpointed, idempotent, observable, and authorized by a trusted backend.
12. Worker CORS must be restricted to approved application origins.
> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 13. Proposed under OQ-1: no new code may add or extend Google Drive behavior. Existing Google Drive code and Google Drive-backed tests remain unchanged by this PRD and are owned by the separate cleanup/deletion task.

13. Approved binding decision OQ-1: no new code may add or extend Google Drive behavior. There is no Google Drive migration, current playback removal, or new Google Drive-specific error state. Existing Google Drive code and Google Drive-backed tests remain unchanged by this PRD and are owned by the separate cleanup/deletion task.
14. Existing R2-backed Listening tests must remain readable unless a separately approved R2 migration changes the data contract.
15. Published payload shape must not change during presentation unification.
16. Audio storage errors must remain feature-owned and recoverable.
17. Only an explicit successful Save draft or Publish creates a retained audio reference. Unsaved edit-turn audio is never durable.
18. The UI must enforce 50 MB maximum per file, 10 active audio files maximum per test, and allowed formats MP3, M4A, AAC, WAV, and OGG.
19. The theoretical aggregate maximum is 500 MB because limits are per file and per count. UI copy must state `Up to 10 audio files, 50 MB each.` and must not encourage a 500 MB upload.
20. MP3 and M4A are recommended teacher formats.
21. The 10-file count includes all active audio referenced by the current draft/revision, including section audio.
22. Audio duration has no separate product limit in this parent PRD. File count and byte-size limits govern upload acceptance.
23. A trusted backend must issue opaque asset IDs and owner-scoped upload sessions. Browser-generated raw keys are not authority.
24. The first asset registry implementation should use a dedicated secured Firebase node consistent with current app persistence, with ownership rules, indexes, backup coverage, restore behavior, and emulator-backed rule tests.
25. Record checksum metadata for integrity and future analysis, but do not merge or deduplicate assets in the first lifecycle implementation.
26. Publish reuses the committed draft asset by adding a published reference; it must not duplicate the bytes.
27. Unchanged revision audio may reuse the same asset reference. Replaced audio always receives a new asset ID.
28. Cross-test reuse is allowed only through an explicit trusted registry-reference operation. Matching URL or filename must never imply shared ownership.
29. Result records reference an immutable test version; that retained version keeps required audio. Results do not own independent duplicate audio copies.
30. Archived tests retain audio while any retained test version, revision, attempt, or result requires it.
31. Published tests with retained attempts/results must be archived rather than physically deleted. Permanent deletion remains blocked until retained references are removed.
32. Legacy R2 Listening records remain readable through an explicit adapter. New writes use the approved registry model. No automatic on-read migration is allowed.
> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 33. Proposed under OQ-2: legacy mutable published R2 records freeze as immutable version 1 on first edit; editing creates a revision draft and existing assignments/results remain pinned to the legacy version.

33. Approved binding decision OQ-2: legacy mutable published R2 records freeze as immutable version 1 on first edit; editing creates a revision draft and existing assignments, results, and sessions remain pinned to version 1.

> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 34. Proposed under OQ-2: legacy R2 test/result raw URLs resolve directly through the legacy read adapter and do not require registry identity during read.

34. Approved binding decision OQ-2: legacy R2 test/result raw URLs resolve directly through the legacy read adapter and do not require registry identity during read.

> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 35. Proposed under OQ-1: Google Drive media behavior is unchanged and out of scope. There is no Google Drive migration or new Google Drive-specific error state in this PRD.

35. Approved binding decision OQ-1: Google Drive media behavior is unchanged and out of scope. There is no new Google Drive behavior, migration, current playback removal, or Google Drive-specific error state in this PRD.

### R2 Audio Asset Lifecycle

Required states:

```text
temp -> committing -> committed -> pending-delete -> deleted
```

Required save behavior:

1. Upload to temp.
2. Validate owner/session/asset metadata.
3. Copy to immutable durable key.
4. Verify durable object.
5. Persist draft/test reference and asset registry state.
6. Mark committed.
7. Delete temp source.

Required edit-turn and heartbeat behavior:

1. Create an authenticated, owner-scoped upload session with a same-tab identity.
2. Send heartbeat every 60 seconds only while that editor tab is open, connected, and authenticated.
3. Treat heartbeat as stale after 3 minutes.
4. Stop eligibility on confirmed navigation away, logout, authentication loss, disconnect, or detectable tab close.
5. Cap edit-turn eligibility at 8 hours from upload time.
6. Require explicit Save draft or Publish before promotion.
7. After the 8-hour bound, require Save draft or re-upload; never promote from heartbeat.
8. Queue immediate best-effort deletion when abandonment is detected.
9. Use scheduled cleanup as fallback and delete surviving temp assets no later than 24 hours after upload.

Required replacement behavior:

1. Upload replacement under a new asset ID.
2. Keep old saved reference active.
3. Commit and save new reference.
4. Remove old reference only after save success.
5. Delete old object only when no retained references remain.

Cross-system partial failures must be reconciled. Retrying the same commit must return the same durable asset rather than creating duplicates.

Target authorized delivery under the storage child PRD:

1. R2 audio objects become private only after compatibility, range, refresh, mobile, and live-session gates pass. Existing public R2 delivery may remain during transition.
2. Browser requests delivery by canonical asset ID, not raw object key.
3. Initial authorized URL lifetime is 60 minutes.
4. Refresh starts when fewer than 10 minutes remain.
5. Existing URL stays active until replacement URL is ready.
6. Delivery supports byte ranges, `206 Partial Content`, `Accept-Ranges`, stable `Content-Length`, browser seeking, and long live-session playback.
7. Refresh failure retries with bounded backoff and warns teacher monitor before interruption risk.
8. Refresh failure alone does not pause a live session.

Required cleanup execution:

1. Use an authenticated scheduled backend/Worker, never browser-owned cleanup.
2. Process bounded, checkpointed batches.
3. Reconcile temp assets at least hourly and durable `pending-delete` assets at least daily.
4. Re-check owner, state, and references immediately before delete.
5. Keep deletion idempotent.
6. Retain a metadata-only deletion tombstone for 90 days; never retain signed URL, secret, or audio content in the tombstone.
7. Treat backup copies under separate backup retention. Backup presence does not count as a live product reference.
8. Before automated durable cleanup is enabled, run a one-time inventoried orphan sweep for R2 audio left behind by historical Listening-test deletions. Dry-run output, ownership evidence, retained-reference checks, and rollback evidence are required before deletion.
9. The storage child PRD must document whether `r2-backup-worker/` retains deleted audio, its retention duration, restore authority, and permanent-deletion/compliance behavior. Backup retention must not silently defeat product deletion policy.

Required storage security:

1. Teacher upload and asset-management requests use a Firebase ID token verified by the trusted backend.
2. Scheduled cleanup uses a service binding or service secret unavailable to browser code.
3. Browser code submits asset intent and canonical asset ID only; it never receives unrestricted move/delete authority or supplies an authoritative raw R2 key.
4. Cross-owner upload, reference, overwrite, move, and delete are denied even when the caller knows a valid asset ID or key.
5. Administrative deletion uses a separate audited administrative operation, not the teacher endpoint.
6. CORS allows only exact approved production origins and approved localhost development origins.
7. Rate limits apply per authenticated user, upload session, IP, and aggregate uploaded bytes.
8. Signed upload authorization lasts 10 minutes and is scoped to one owner, upload session, asset, size limit, and allowed media contract.
9. Validate extension, declared MIME, magic bytes, decodability, file size, and duration metadata before commit. No independent duration limit is imposed.
10. Strict audio validation is required. General malware scanning is deferred unless a separate risk review requires it.
11. Security logs record actor, asset ID, operation, outcome, and reason. They must never record tokens, signed URLs, secrets, or raw audio.
12. Cleanup/deletion ships only after deployed-worker parity is verified and negative authorization tests pass.
13. Authentication, ownership, prefix validation, raw-key rejection, and CORS hardening are an urgent severable security fix. They must not wait for registry, heartbeat, cleanup, or private-delivery implementation.
14. Authorized-delivery issuance must verify the caller against trusted retained references. Allowed callers are the asset owner or a student/result viewer with active authorization to the referenced immutable test version.
15. Knowing a valid `assetId`, object key, public URL, or prior signed URL never grants delivery access. Cross-user and cross-owner issuance must be denied and covered by negative tests.

### Live Listening

1. `audioCommand` and `masterAudioState` remain in `game_sessions/{sessionCode}` until a dedicated migration plan changes them.
2. `headphoneRequest` remains per player at `game_sessions/{code}/players/{studentId}/headphoneRequest`.
3. Shared UI must not write live-session control paths.
4. Shared UI must not read or infer live authority from session storage paths.
5. Target canonical state uses monotonic revision plus trusted server timestamp.
6. Default load target is 100 students per live session and 20 concurrent sessions.
7. Initial correction-test baselines are 500 ms soft correction and 2 seconds hard seek; final thresholds require measured browser/live proof.

## 20. Accessibility Requirements

1. Shared status components must use `role="status"` for non-urgent loading/success/info and `role="alert"` for errors or urgent failures.
2. Shared validation summaries must support clear heading levels and accessible names.
3. Interactive actions rendered by shared components must be keyboard reachable.
4. Icon-only future controls must have accessible names.
5. Validation display must include text that explains the issue and next action.
6. Color must not be the only signal for ready, blocked, loading, error, selected, or disabled states.
7. Error summaries must be screen-reader friendly and must not hide field-level errors.
8. Loading states must expose busy/status semantics when they block content.
9. Mobile answer inputs must remain reachable when the on-screen keyboard is open.
10. Teacher monitor controls must remain accessible, but live authority behavior must stay in monitor code, not shared primitives.

## 21. Mobile/Desktop Requirements

Teacher-facing default validation scope:

- Desktop and relevant tablet widths are required by default.
- Teacher mobile is out of scope unless explicitly requested.

Student-facing runtime requirements:

- Reading V2 runtime must preserve current mobile/desktop layout behavior.
- Listening solo/homework runtime must preserve `MobileListeningExamScaffold`, mobile state hydration, answer sheet, image canvas, audio navigation, and no unintended horizontal overflow.
- Listening live runtime must preserve mobile section/audio navigation rules from `documentation/architecture/mobile-ielts-listening-audio-navigation.md`.
- Runtime visual alignment must wait until dedicated runtime tests exist.

Shared mobile primitives:

- May handle spacing, stacking, touch-target sizing, and neutral layout.
- Must not own `currentAudioIndex`, playback intent, section transitions, live authority, or Reading passage projection behavior.

## 22. Testing Strategy

### Unit/Component Tests

Required for shared primitives:

- shared component semantics
- heading levels
- aria roles
- action rendering
- visual-state rendering
- validation summary status display
- neutral props only
- children passthrough
- no module-specific import boundary

Current test anchors:

- `src/features/assessment/shared/components/AssessmentAuthoringSection.test.tsx`
- `src/features/assessment/shared/components/AssessmentStatusState.test.tsx`
- `src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx`

### Authoring Integration Tests

Required for early phases:

- Reading V2 authoring low-risk display sections
- Listening setup flow
- Listening questions step
- Listening review/publish display
- parser skip/manual mode
- validation errors
- publish readiness display
- temp upload retained only after successful draft save/publish
- failed save preserves old asset and cleans new unreferenced upload
- replacement swaps references only after save success
- explicit Save draft creates the durable draft/audio reference
- unsaved upload never creates a retained reference
- concurrent stale save is rejected by optimistic version check
- duplicate save/publish uses one idempotent operation
- published edit creates an immutable revision draft
- first edit of a legacy mutable published test freezes immutable version 1 and creates a revision draft
- existing assignments/results remain pinned to legacy version 1 after first edit
- legacy R2 raw-URL test/result audio resolves through the read adapter without registry identity
- empty questions and missing audio allow draft save but block publish
- parser failure preserves input/error and allows explicit manual mode
- file count, 50 MB limit, format validation, and exact upload guidance

Current test anchors:

- `src/pages/ReadingV2StudioPage.test.tsx`
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx`
- `src/skills/listening/builders/ListeningTestBuilder.test.tsx`

### Runtime Tests

Allowed only later, after authoring is stable:

- Reading V2 runtime submit/review
- Reading V2 projection rejection
- Listening solo/homework audio playback
- Listening solo/homework resume
- Listening solo/homework autosave
- mobile layouts

Current anchors:

- `src/pages/StudentPracticePage.test.tsx`
- `src/pages/TestPageRouter.test.tsx`
- `src/components/practice/ListeningPracticeView.test.tsx`
- `src/skills/listening/components/AudioPlayer.test.tsx`

### Live-Session Tests

Allowed only later and separately:

- teacher pause/resume
- teacher skip section
- teacher seek/speed change
- student sync
- audio progress
- headphone readiness
- late join
- reload/drift correction
- `audioCommand` / `masterAudioState` conflict
- teacher end session while student submits
- teacher command writes canonical revision and compatibility event coherently
- stale compatibility event cannot override newer canonical state
- teacher disconnect freezes playback
- teacher monitor reload restores canonical section/position/speed without emitting default-state commands
- network partition pauses after bounded grace and recovers from canonical state
- URL refresh and byte-range playback do not interrupt a long session
- soft-correction baseline at 500 ms and hard-seek baseline at 2 seconds
- load target of 100 students per session and 20 concurrent sessions

Current anchors:

- `src/__tests__/integration/ListeningTestPage.test.tsx`
- `src/skills/listening/components/AudioPlayer.test.tsx`
- any focused monitor tests that exist or must be added by the live-session PRD

### Manual Browser Proof

Live Listening behavior cannot be closed on unit tests alone. Dedicated live-session work must prove:

- teacher browser and student browser in separate contexts
- teacher desktop, student desktop, and student mobile
- normal join and late join
- pause/resume, skip, seek, speed change, and buffering during pause
- teacher reload and student reload
- authority disagreement and stale-command rejection
- headphone pending, approved, and denied
- session end during accepted and rejected submit attempts
- teacher monitor network writes
- student runtime response
- durable DB state
- recovery after reload
- correct final submit/review transition

### Storage Lifecycle Tests

Required before changing R2 audio lifecycle:

- temp key generation is owner/session scoped;
- temp upload is not durable before save;
- saved draft commits and retains audio;
- publish retains the committed asset without duplicate copying;
- cancelled upload deletes immediately or expires by lifecycle;
- heartbeat runs every 60 seconds for the same authenticated tab only;
- heartbeat becomes stale after 3 minutes and cannot exceed 8 hours from upload;
- logout, auth loss, confirmed navigation, and disconnect stop heartbeat eligibility;
- crash/disconnect fallback removes temp audio no later than 24 hours after upload;
- failed save leaves prior audio intact;
- replacement uses a new asset ID;
- deleting one reference does not delete a multiply referenced asset;
- zero-reference asset enters grace period, then deletes;
- cleanup retry is idempotent;
- hourly temp and daily durable reconciliation are bounded and checkpointed;
- private authorized URL starts at 60 minutes and refreshes before 10 minutes remain;
- refresh keeps current URL until replacement is ready;
- range requests return valid `206`, `Accept-Ranges`, stable `Content-Length`, and seek behavior;
- private/signed delivery passes iOS Safari playback, seek, pause/resume, and long-session refresh proof;
- refresh failure retries without automatically pausing live playback;
- separate same-owner/same-draft tab leases prevent one tab from deleting audio still used by another active tab;
- a second replacement is blocked while the first replacement commit is in progress;
- stale `lastReferencedAt` cannot move an asset to deletion while authoritative result/assignment references remain;
- unauthorized move/delete is denied;
- cross-owner upload, overwrite, and raw-key move/delete are denied;
- the authorization/prefix/CORS negative tests are written and fail against the insecure baseline before worker hardening, then pass after the fix;
- deployed-worker authorization behavior matches checked-in source;
- one-time historical orphan sweep runs in dry-run mode and excludes every retained reference before deletion is enabled;
- new asset registry rules and backup coverage pass if a new data node is added.

### Phase Entry And Evidence Gates

Every phase must pass before implementation proceeds:

1. Prior phase required tests pass.
2. Owned and protected files are listed.
3. Boundary grep and architecture review pass.
4. Rollback steps are executable and do not remove user work.
5. Required observability exists before behavior rollout.
6. Browser/network/database evidence is captured where the phase changes persistence or live authority.
7. Any missing child-PRD decision blocks the phase.

## 23. Rollout Plan

1. Keep shared primitives presentation-only and low-risk.
2. Adopt each shared primitive in one surface first.
3. Prefer authoring surfaces before runtime surfaces.
4. Prefer display-only Reading V2 blocks and Listening authoring branches before interactive controls.
5. Keep runtime and live-session work behind dedicated PRDs/test plans.
6. Update implementation log after each patch.
7. Run targeted tests and `git diff --check` for every patch.
8. Run full build only when a patch changes source code, CSS, or shared component behavior.
9. Roll back by reverting the adopting surface to its local wrapper while leaving the neutral primitive if another surface already depends on it.
10. Do not remove old wrappers or styles until all adoptions are stable and covered.
11. Implement R2 lifecycle changes as a separate storage workstream before relying on saved-draft audio retention.
> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 12. Proposed under OQ-3: ship upload-worker authentication, ownership, prefix validation, raw-key rejection, and CORS hardening as an urgent severable security fix. Do not wait for registry, heartbeat, cleanup, or private delivery.

12. Approved binding decision OQ-3: plan upload-worker authentication, ownership, prefix/raw-key validation, CORS, and rate-limit hardening as urgent severable Security Gate S0. Do not bundle it with registry, heartbeat, cleanup, or private delivery. Implementation remains blocked pending the S0 child PRD, including canonical-worker selection.
13. Configure prefix lifecycle cleanup for `temp/` and verify it does not cover durable asset prefixes.
14. Add metadata-driven durable cleanup only after asset references, ownership rules, backup coverage, and rollback behavior are tested.
15. Use separate child PRDs for storage/security, authoring behavior changes, solo/homework runtime, and live-session authority/runtime.
16. Roll out behavior-changing storage/runtime phases through internal fixtures, selected teachers, percentage rollout, then full rollout.
17. Use feature flags only for behavior-changing storage/runtime phases. Pure neutral presentation adoption does not require a feature flag.
18. Preserve old and new readers during storage migration until compatibility proof passes.
19. Stop rollout immediately for data loss, wrong audio, cross-owner access, live authority drift, legacy incompatibility, or mid-test playback interruption.
20. Do not start a phase from a dirty or ambiguous ownership state. Reconcile canonical docs and identify unrelated work first.
21. Run a dry-run historical orphan inventory before enabling deletion of previously orphaned Listening audio.
> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 22. Proposed under OQ-4: keep current public R2 delivery until private delivery passes byte-range, refresh, iOS Safari, mobile, and long live-session proof.

22. Approved binding decision OQ-4: keep existing public R2 delivery temporarily. Private signed delivery may activate only after byte-range, refresh, iOS Safari, mobile, and long live-session proof gates pass.

Rollback guidance:

- If a shared primitive breaks one adopter, restore that adopter's previous local markup and keep the shared primitive for other adopters.
- If a shared primitive API attracts module-specific props, stop and split the API or move logic back to the module.
- If Listening authoring audio/storage behavior changes, revert the authoring adoption before touching storage code.
- If runtime or live-session behavior changes unintentionally, revert the runtime/live-session edits and restore prior authority paths.
- If storage rollout fails, disable new writes, preserve both readers, stop cleanup, and retain all referenced assets until reconciliation proves safe.
- If authorized delivery refresh risks interruption, keep existing delivery path active and stop rollout before changing live playback.

## 24. Recommended Patch Sequence

Status labels:

- Complete: implementation log records this phase as done for at least the required first adoption.
- Partial: foundation exists but required cross-surface adoption or coverage remains incomplete.
- Pending: not started or not authorized yet.

Security Gate S0. Upload-worker authorization hardening. Status: Approved for child-PRD planning only; implementation not authorized.
   - Scope: deployed/check-in parity, Firebase identity verification, owner/prefix validation, raw-key rejection, exact CORS allowlist, and rate-limit boundary.
   - Must remain severable from registry, heartbeat, cleanup, and private-delivery implementation.
   - Test order: add cross-owner/raw-key/CORS negative tests against the insecure baseline, prove they fail, apply hardening, then prove they pass against local and deployed worker behavior.
   - This gate may proceed before storage child-PRD implementation only as a narrow security fix with no asset-lifecycle or published-payload change.
   - Canonical worker implementation remains unresolved. The S0 child PRD must choose between checked-in `aws4fetch`/S3 credentials and documented deployed native `env.R2_BUCKET`, then define the matching deploy, rollback, and test harness before implementation.

1. Shared status/validation primitives. Status: Partial.
   - Complete: `AssessmentStatusState` exists and is adopted in Reading V2 Studio and one Listening authoring empty branch.
   - Complete: `AssessmentValidationSummary` exists and is adopted in Reading V2 Settings.
   - Pending: Listening validation-summary adoption only if semantics match.
   - Required tests: shared component tests plus adopting surface tests.

2. Shared authoring layout primitives. Status: Partial.
   - Complete: `AssessmentAuthoringSection` exists.
   - Complete: one Listening authoring adoption and one Reading V2 display-section adoption exist.
   - Pending: broader authoring card/header/action-row primitives.
   - Gate: extract each new primitive only when both modules consume it in the same pull request or explicitly named adjacent pull requests.
   - Required tests: shared component tests plus adopting surface tests.

3. Adopt shared authoring primitives in one Listening step. Status: Complete.
   - Current adoption: `ListeningTestBuilder` Step 4 Questions / Answer Key wrapper.
   - Required tests: `ListeningTestBuilder.test.tsx`.

4. Adopt shared authoring primitives in one Reading V2 display section. Status: Complete.
   - Current adoption: `ReadingV2SettingsPanel` `Accessibility And Runtime Advisories`.
   - Required tests: `ReadingV2SettingsPanel.test.tsx`.

5. Listening metadata/setup visual alignment. Status: Pending.
   - Must not change audio upload/import/storage.
   - Required tests: focused Listening builder metadata/setup coverage.

6. Listening questions step visual alignment. Status: Partial.
   - Step 4 wrapper exists.
   - Remaining question editor visual alignment is pending.
   - Required tests: empty list, add question, manual mode, parser-skip flow.

7. Listening review/publish visual alignment. Status: Pending.
   - Required tests: save/publish validation, missing audio, save error, review display.

8. Reading V2 authoring display cleanup where safe. Status: Pending beyond current advisory/status adoptions.
   - Required tests: targeted Reading V2 Studio/Settings panel tests.

9. Shared validation summary adoption across authoring surfaces. Status: Partial.
   - Reading V2 adopted.
   - Listening not adopted.
   - Required tests: shared semantics and surface-specific validation behavior.

10. Shared authoring shell only after enough primitives are stable. Status: Pending.
    - Requires architecture review before any shell extraction.

11. Solo/homework Listening visual alignment only after authoring is stable. Status: Pending.
    - Required tests: `ListeningPracticeView`, `AudioPlayer`, mobile state, resume/autosave.

12. Runtime visual alignment only after dedicated tests. Status: Pending.
    - Required tests: Reading V2 and Listening solo/homework runtime bundles.

13. Live Listening visual alignment only after live-session contract tests. Status: Pending.
    - Required tests: teacher/student live-session browser proof plus integration tests.

14. Deep runtime abstraction only if justified by tests and architecture review. Status: Pending.
    - Requires a new PRD or architecture update.

15. Historical Listening R2 orphan reconciliation. Status: Pending.
    - Runs only after registry/reference authority and worker security gates exist.
    - Requires inventory, dry run, ownership proof, retained-reference exclusion, backup-policy review, bounded deletion, and rollback evidence.

Required child-PRD order around this sequence:

1. R2 asset lifecycle/security child PRD before any storage lifecycle implementation.
2. Listening authoring behavior child PRD before draft/revision/concurrency behavior changes.
3. Solo/homework runtime child PRD after authoring stabilization.
4. Live-session authority/runtime child PRD before any protected live behavior or visual change.
5. Deep cross-runtime abstraction PRD only after module-specific runtime proofs exist.

The live-session child PRD must define the load-test harness and methodology for 100 students per session and 20 concurrent sessions, including client simulation fidelity, network conditions, Firebase/worker limits, measured sync drift, playback failures, and pass/fail thresholds.

## 25. Success Metrics

1. Shared primitives are used by both Reading V2 and Listening authoring without module-specific props.
2. Reading V2 Studio create/import/draft/revision/publish flows remain stable.
3. Listening builder audio upload/import/preview/save/publish behavior remains stable.
4. No Listening files import Reading V2 internals.
5. No Reading V2 files import Listening internals.
6. No shared assessment file imports Reading V2 or Listening internals.
7. Listening live-session protected files remain untouched until a dedicated test plan exists.
8. Teacher authoring flows look more consistent through shared status/section/validation primitives.
9. Existing Listening tests remain compatible.
10. Existing Reading V2 materials remain compatible.
11. Targeted component and authoring tests pass for each phase.
12. Future implementation prompts can use this PRD to identify safe vs unsafe changes without re-reading all historical docs.
13. No unreferenced temp audio survives beyond the configured lifecycle window.
14. Saved drafts and published tests never reference an expiring temp object.
15. Replacing audio never changes saved playback until the replacement save succeeds.
16. Durable audio is deleted only when retained reference count is zero.
17. No unsaved edit-turn upload survives longer than 24 hours.
18. Heartbeat never creates a draft or extends edit-turn eligibility beyond 8 hours.
19. Upload UI enforces 10 files, 50 MB per file, and approved formats while recommending MP3 or M4A.
20. Authorized audio delivery supports byte-range seeking and completes long live-session tests without mid-test interruption.
21. Live-session proof meets the default target of 100 students per session and 20 concurrent sessions.
22. No stale `audioCommand` overrides a newer canonical `masterAudioState` revision.

## 26. Acceptance Criteria

### PRD Acceptance

1. PRD is saved in `/tasks/` with next available number `0055`.
2. PRD links to required source documents.
3. PRD records approved OQ-1 through OQ-4 decisions as binding and keeps implementation blocked until applicable child PRDs and child-level decisions are approved.
4. PRD states the main architecture decision: product experience unifies through neutral shared assessment presentation; Reading V2 and Listening remain separate module owners.
5. PRD names current shared primitives and exact current adoptions.
6. PRD names protected Reading V2, Listening authoring, Listening solo/homework, Listening live-session, and teacher monitor boundaries.
7. PRD includes required sections 1 through 30.
8. PRD includes required edge cases.
9. PRD includes required conflict rules.
10. PRD includes recommended patch sequence with completed/partial/pending status.
11. PRD preserves OQ-1 through OQ-4 recommendations as obsolete historical text and records their approved binding decisions.
12. PRD defines required child PRDs and prevents direct broad implementation from the parent.

### Future Implementation Acceptance

1. Shared primitive patches keep shared code module-neutral.
2. Adopted surfaces keep original behavior.
3. No runtime or live-session work occurs before dedicated tests.
4. No audio storage, parser, projection, trusted-submit, or published payload behavior changes without explicit scope.
5. Tests and boundary greps pass for each patch.
6. Implementation log or successor doc is updated when implementation changes architecture truth.
7. Storage lifecycle implementation proves saved-draft retention, publish retention, replacement safety, and orphan cleanup.
8. Under approved OQ-4, storage lifecycle implementation must prove immediate abandonment cleanup, 24-hour fallback, same-tab heartbeat bounds, private authorized delivery, and byte-range behavior before private delivery activates.
9. Under approved OQ-2, Listening authoring behavior changes must prove explicit draft save, immutable revision, legacy-version transition, optimistic conflict rejection, and idempotent save/publish.
10. Live-session behavior changes prove canonical revisions, compatibility-command rejection, load targets, and uninterrupted authorized playback.

## 27. Regression Checklist

Use this checklist for every implementation patch derived from this PRD.

Shared layer:

- [ ] Shared component has no Reading V2 imports.
- [ ] Shared component has no Listening imports.
- [ ] Shared component has no audio/passages/parser/storage/session props.
- [ ] Shared component tests cover roles, headings, actions, and children.
- [ ] Boundary grep passes.

Reading V2 authoring:

- [ ] Create route still opens.
- [ ] Import route still opens.
- [ ] Draft resume still opens.
- [ ] Revision route still opens.
- [ ] Metadata remains editable.
- [ ] Passages remain editable.
- [ ] Task groups remain editable.
- [ ] Validation remains Reading V2-owned.
- [ ] Draft save still works.
- [ ] Publish gating still works.
- [ ] Preview still works.

Reading V2 runtime:

- [ ] Projection validation still rejects invalid payloads.
- [ ] Passage rendering still works.
- [ ] Question rendering still works.
- [ ] Answer state still works.
- [ ] Submit/review still works.
- [ ] Anti-cheat/trusted-submit integration remains host-owned.
- [ ] Mobile/desktop layout remains stable.

Listening authoring:

- [ ] Metadata/setup still works.
- [ ] Audio upload still works.
- [ ] No patch derived from this PRD adds, extends, removes, or changes Google Drive behavior; existing Google Drive code/tests remain untouched for the separate cleanup/deletion task.
- [ ] Audio preview still works.
- [ ] UI says `Up to 10 audio files, 50 MB each.`
- [ ] Audio limit is labeled `audio files` and is not confused with the existing `Questions (0/10)` heading.
- [ ] UI recommends MP3 or M4A.
- [ ] Eleventh active audio file is rejected before upload.
- [ ] File above 50 MB is rejected before upload.
- [ ] Unsupported format is rejected before upload.
- [ ] Audio sections save correctly.
- [ ] Parser path still works.
- [ ] Parser skip/manual path still works.
- [ ] Empty question state still shows Add Question.
- [ ] Before the authoring split, missing audio still blocks the existing single save/publish operation.
- [ ] After the authoring split, missing audio may save in a draft with warnings but blocks Publish, per FR-023F and Edge Case 12.
- [ ] Save/publish still uses `listeningTestStorage.ts`.
- [ ] Existing Listening tests remain compatible.
- [ ] First edit of a legacy published R2 test freezes version 1 and creates a revision draft.
- [ ] Existing assignments/results remain pinned to legacy version 1.
- [ ] Legacy R2 raw-URL test/result audio resolves through the read adapter.
- [ ] Saved draft/test references never point at `temp/`.
- [ ] Cancelled/failed/never-saved uploads are cleanup candidates.
- [ ] Explicit Save draft or Publish is the only promotion event.
- [ ] Heartbeat runs only for the same authenticated, open, connected tab.
- [ ] Heartbeat is stale after 3 minutes and stops at 8 hours.
- [ ] Surviving uncommitted temp assets are deleted no later than 24 hours after upload.
- [ ] Closing one of multiple valid editor tabs does not delete audio leased by another valid same-draft tab.
- [ ] Replacement does not overwrite saved audio before save success.
- [ ] A second replacement cannot start while the prior replacement commit is unresolved.
- [ ] Old durable audio remains while any retained reference exists.
- [ ] Zero-reference durable audio observes grace period before delete.

Listening solo/homework:

- [ ] Audio loads.
- [ ] Playback works.
- [ ] Resume works.
- [ ] Autosave works.
- [ ] Timer works.
- [ ] Mobile state hydrates.
- [ ] Section navigation follows current contract.
- [ ] Submit/review works.

Listening live session:

- [ ] Teacher can pause.
- [ ] Student reflects pause.
- [ ] Teacher can resume.
- [ ] Student reflects resume.
- [ ] Teacher can skip section.
- [ ] Student follows skip.
- [ ] Teacher can seek/speed change where supported.
- [ ] Audio progress remains accurate.
- [ ] Headphone readiness remains correct.
- [ ] Student reload resyncs.
- [ ] Late join handles current authority.
- [ ] `audioCommand` and `masterAudioState` behavior is unchanged unless explicitly tested.
- [ ] Newer canonical revision wins over stale compatibility traffic.
- [ ] 500 ms soft and 2-second hard correction baselines are measured, not treated as final constants.
- [ ] Authorized URL refresh and range requests do not interrupt playback.
- [ ] iOS Safari signed/private delivery supports byte ranges, seeking, and long-session refresh.
- [ ] Teacher monitor reload restores canonical state without emitting default section/position/speed.
- [ ] 100 students/session and 20 concurrent sessions meet the approved performance target.

Teacher monitor:

- [ ] `AudioProgressPanel` appears only for in-progress Listening with audio sections.
- [ ] `HeadphoneRequestPanel` behavior remains intact.
- [ ] `TeacherTestControlBar` calls correct monitor callbacks.
- [ ] `useMonitorControls` write paths remain expected.

## 28. Risk Register

| Risk | Impact | Probability | Mitigation |
| --- | --- | --- | --- |
| Shared component starts accepting module-specific props | Shared layer becomes a hidden runtime owner | Medium | Boundary grep, API review, move logic back to adapter |
| Listening imports Reading V2 internals | Listening becomes coupled to Reading behavior | Medium | Import audit and review gate |
| Reading V2 files gain Listening-specific branches | Reading V2 becomes owner of Listening behavior | Medium | Reject branchy abstraction, create neutral primitive instead |
| Audio upload/storage changes during visual alignment | Existing Listening tests break | High | Keep storage files out of early patches |
| Unauthenticated raw-key worker operations | Cross-owner overwrite/move/delete of R2 objects | Critical | Ship urgent severable S0 hardening; write failing cross-owner/raw-key/CORS tests first; verify local and deployed worker behavior; do not wait for registry work |
| Saved draft references temp object | Audio expires after save | High | Commit and verify durable asset before reporting save success |
| In-place replacement overwrites saved audio before save | Cancelled edit mutates published/draft content | High | Immutable asset IDs and reference swap after successful save |
| Durable asset cleanup ignores references | Saved/published audio is deleted | High | Trusted registry, zero-reference check, grace period, idempotent deletion |
| Cleanup never removes orphan durable objects | Storage cost grows indefinitely | Medium | Bounded reconciler, metrics, alerts, lifecycle fallback |
| Historical test deletions already left R2 audio orphaned | Existing storage remains leaked after new cleanup ships | High | One-time inventoried dry-run sweep after registry/security gates; prove zero retained references before deletion |
| Backup retention silently preserves permanently deleted audio | Product deletion policy is not honored | High | Storage child PRD must define `r2-backup-worker/` retention, restore, and permanent-deletion/compliance behavior |
| Heartbeat is treated as a save | Unsaved audio becomes durable | High | Separate upload-session eligibility from draft/test references; explicit Save draft/Publish only |
| Heartbeat survives logout/tab abandonment | Temp assets remain incorrectly eligible | High | Same-tab identity, auth checks, 60-second heartbeat, 3-minute stale window, 8-hour maximum |
| Authorized URL expires mid-test | Listening playback stops | High | 60-minute URL, refresh before 10 minutes remain, keep prior URL until replacement is ready, range/live proof |
| Private delivery is enabled before browser proof | Safari/mobile/live playback regresses | High | Keep public R2 compatibility path until range, refresh, iOS Safari, mobile, and long-session gates pass |
| Upload limits are unclear | Teachers attempt excessive or unsupported uploads | Medium | Enforce 10 files and 50 MB each; exact concise UX copy; recommend MP3/M4A |
| `audioCommand` / `masterAudioState` behavior changes without live proof | Live Listening desync | High | Protect live files until dedicated PRD/test plan |
| Stale compatibility command overrides canonical state | Students seek/play incorrectly | High | Monotonic canonical revision plus trusted server timestamp; reject stale events |
| Parent PRD is implemented as one broad patch | Unreviewable cross-system regression | High | Mandatory child PRDs and phase-specific ownership/test/rollback packets |
| Legacy published record is edited in place | Existing assignments/results change unexpectedly | High | Freeze legacy record as immutable version 1; create revision draft; pin existing references |
| Solo/homework and live playback state are merged | Wrong authority model | High | Keep `ListeningPracticeView` and `ListeningTestPage` separate |
| Reading V2 import normalization is generalized | Import bugs and parser regressions | High | Keep Reading parser/import services Reading-specific |
| Shared validation summary owns issue activation | Reading V2 review navigation breaks | Medium | Keep interactive review issues Reading V2-owned |
| Known Mantine drift spreads | Design standard regresses | Medium | No new Mantine imports, replace only touched scoped areas |
| Runtime abstraction starts too early | Wide regressions across modules | High | Runtime phases require tests and architecture review |
| Teacher monitor treated as visual-only | Teacher authority breaks | High | Monitor protected boundary and live proof gate |
| Existing docs conflict | Future agents choose wrong authority | Medium | This PRD cites canonical architecture source hierarchy |

## 29. Decision History And Approved Decisions

No parent-level product question remains open. OQ-1 through OQ-4 were approved on 2026-06-19 under decision reference `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`.

Child-PRD implementation questions remain blocked until explicitly resolved in their applicable child PRDs. Parent approval does not authorize implementation, create child PRDs, select the canonical upload-worker mechanism, or satisfy technical architecture/security review.

### Obsolete Recommendation History

> Obsolete recommendation history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 1. **OQ-1 - Google Drive scope.** Recommended resolution: this PRD adds no Google Drive behavior, removes no current Google Drive playback, introduces no new Google Drive-specific error or migration UX, and performs no Google Drive migration. A separate cleanup/deletion task removes Google Drive upload code and decides deletion/disposition of Google Drive-backed tests while respecting test/result deletion governance.

> Obsolete recommendation history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 2. **OQ-2 - Legacy published transition.** Recommended resolution: first edit freezes the legacy mutable published R2 record as immutable version 1, creates a revision draft, pins existing assignments/results to version 1, and resolves legacy raw R2 URLs through the read adapter without requiring registry identity.

> Obsolete recommendation history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 3. **OQ-3 - Worker security severability.** Recommended resolution: ship upload-worker authentication, ownership, prefix, raw-key, CORS, and rate-limit hardening as urgent Security Gate S0, independently of registry/heartbeat/private-delivery work, after failing negative tests establish the insecure baseline.

> Obsolete recommendation history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 4. **OQ-4 - Public versus private R2 transition.** Recommended resolution: keep current public R2 delivery temporarily; enable private signed delivery only after byte-range, refresh, iOS Safari, mobile, and long live-session gates pass.

### Approved Decisions

1. **OQ-1 - Google Drive scope.** No new Google Drive behavior, no Google Drive migration, no current playback removal, and no new Google Drive-specific error state. Upload-code removal and deletion/disposition of Google Drive-backed tests belong to a separate cleanup/deletion task.
2. **OQ-2 - Legacy published transition.** First edit freezes a legacy mutable published R2 test as immutable version 1, creates a revision draft, keeps existing assignments, results, and sessions pinned to version 1, and resolves legacy raw R2 URLs through the read adapter without requiring registry identity.
3. **OQ-3 - Worker security severability.** Upload-worker authentication, ownership, prefix/raw-key, CORS, and rate-limit hardening is an urgent severable Security Gate S0. It must not be bundled with registry, heartbeat, cleanup, or private-delivery implementation. Canonical worker mechanism remains a required S0 child-PRD decision.
4. **OQ-4 - Public versus private R2 transition.** Existing public R2 delivery remains temporarily. Private signed delivery may activate only after byte-range, refresh, iOS Safari, mobile, and long live-session proof gates pass.

The decision register below is binding. A child PRD may add implementation detail but must not silently reverse an approved decision.

### Governance Decisions

1. PRD-0055 is the parent PRD. Storage, Listening authoring behavior, solo/homework runtime, and live-session authority/runtime receive separate child PRDs.
2. An unanswered child-PRD decision blocks that phase. A developer must not choose a default silently.
3. Authority order is stronger architecture/safety rule, canonical architecture document, PRD-0055, approved child PRD, approved implementation plan, then code comments.
4. A changed approved requirement must update the controlling PRD and decision record before implementation.
5. Risky phase entry requires product-owner approval plus technical architecture/security review.
6. Junior developers may edit only named owned files under named contracts and tests. Any deviation requires approval.
7. Every phase must list owned files and protected files.
8. Storage and live-session work require separate security/architecture review.

### Product And Authoring Lifecycle Decisions

9. A saved draft exists only after the durable draft record is written and confirmed.
10. Initial draft creation uses explicit Save draft. Autosave starts only after a durable draft ID exists.
11. Later draft edits support autosave plus explicit Save, with visible saving, saved, failed, and stale-conflict state.
12. Published test versions are immutable. Editing creates a revision draft.
13. Publishing a revision creates a new immutable version. Existing assigned or in-progress sessions retain their original version.
14. Concurrent editing uses optimistic version checks. Stale saves are rejected; last-write-wins is prohibited.
15. Draft deletion is soft-delete with seven-day recovery before permanent reference cleanup.
16. Published tests archive by default. Permanent deletion is blocked while attempts, results, revisions, or assigned sessions reference the version.
17. Save and Publish use idempotency keys plus disabled pending actions.
18. If time-up occurs during an answer save, finish the accepted in-flight save where possible, then perform one idempotent submit.
19. Publish requires authorized audio accessibility verification, including metadata and byte-range capability, not URL presence alone.
20. An empty Listening question list may be saved as draft but blocks Publish.
21. Missing Listening section audio may be saved as draft with a clear error but blocks Publish.
22. Parser failure preserves input and error details and offers explicit manual mode. Silent fallback is prohibited.

### R2 Asset Lifecycle Decisions

23. First asset-registry implementation uses a dedicated secured Firebase node consistent with current persistence, with rules, indexes, backup, restore, and emulator tests.
24. Trusted backend issues opaque asset IDs.
25. Trusted backend creates authenticated owner-scoped upload sessions before signed upload.
26. Durable object identity is immutable asset ID; title and filename are metadata only.
27. Publish reuses the committed draft asset by adding a reference rather than copying bytes.
28. Revisions reuse unchanged assets; replacements receive new assets.
29. Cross-test reuse requires an explicit trusted registry-reference operation.
30. Record checksums but defer content deduplication.
31. Temp uploads are short-lived edit-turn assets. Save draft or Publish alone promotes them. Detected abandonment queues immediate best-effort deletion; scheduled cleanup removes survivors no later than 24 hours after upload.
32. Zero-reference durable assets wait seven days in `pending-delete`, then references are rechecked before deletion.
33. Only explicitly saved draft audio is retained. Unsaved edit-turn audio is not retained.
34. No automatic inactive-draft expiry is introduced by this PRD.
35. Results reference immutable test versions; the retained version preserves required audio.
36. Archived tests retain audio while any retained version, revision, attempt, result, or session requires it.
37. Replacement failure leaves the old committed asset authoritative and makes the new temp asset a cleanup candidate.
38. Commit partial failure fails the user operation, preserves the old reference, and lets reconciliation remove an unreferenced copied object.
39. Cleanup runs in an authenticated scheduled backend/Worker using bounded batches and checkpoints.
40. Temp reconciliation runs at least hourly; durable `pending-delete` cleanup runs at least daily.
41. R2 lifecycle/configuration is checked in through deployment configuration or script and has a verification command; dashboard-only configuration is insufficient.
42. Backup retention is separate from live product retention. Backup presence does not block live-object deletion after product references reach zero.
43. Permanent deletion retains metadata-only tombstone audit for 90 days.
44. Limits are 50 MB per audio file and 10 active audio files per test. Allowed formats are MP3, M4A, AAC, WAV, and OGG. MP3 or M4A is recommended. UX copy is `Up to 10 audio files, 50 MB each.` It must not advertise the logical 500 MB aggregate maximum.
45. Validate extension, MIME, magic bytes, decodability, size, and duration metadata. There is no separate duration limit.
> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 46. Proposed under OQ-4: private delivery uses short-lived authorized URLs and must support byte ranges, long live-session playback, refresh before expiry, and no mid-test interruption. Public R2 remains temporarily until proof gates pass.

46. Approved binding decision OQ-4: existing public R2 delivery remains temporarily. Private signed delivery uses short-lived authorized URLs and may activate only after byte-range, long live-session playback, refresh-before-expiry, iOS Safari, mobile, and no-mid-test-interruption proof gates pass.
47. Audio URLs are immutable/versioned outputs. Never overwrite a cached object key; CDN purge is not the replacement mechanism.

### Temp Heartbeat And Authorized Delivery Decisions

48. Teacher upload operations authenticate with a Firebase ID token verified by trusted backend.
49. Scheduled cleanup uses service credentials unavailable to browser code.
50. Browser requests upload/reference/delete intent by canonical asset ID; it never supplies an authoritative raw key.
51. Cross-owner upload, reference, overwrite, move, and delete are denied even if a valid key is known.
52. Administrative deletion uses a separate audited operation.
53. CORS allows exact approved production and localhost development origins only.
54. Rate limits apply by authenticated user, upload session, IP, and aggregate bytes.
55. Signed upload authorization lasts 10 minutes and is scoped to one owner/session/asset/media contract.
56. Strict audio validation is required. General malware scanning is deferred unless a later risk review requires it.
57. Security logs include actor, asset ID, operation, outcome, and reason; never tokens, signed URLs, secrets, or raw content.
58. Same-tab heartbeat runs every 60 seconds only while the authenticated editor tab is open and connected.
59. Heartbeat is stale after 3 minutes and cannot extend edit-turn eligibility beyond 8 hours from upload time.
60. Heartbeat never creates a durable draft. Closing the tab where detectable, confirmed navigation, logout, lost authentication, or disconnection ends eligibility and starts cleanup.
61. After 8 hours, teacher must explicitly Save draft or re-upload. Scheduled fallback still removes any surviving uncommitted object no later than 24 hours after upload.
62. Initial authorized delivery URL lifetime is 60 minutes.
63. Refresh starts with fewer than 10 minutes remaining and keeps the current URL active until the replacement is ready.
64. Refresh failure keeps current/buffered playback where possible, retries with bounded backoff, warns teacher monitor before interruption risk, and does not pause solely because refresh failed.
65. Delivery must prove `Range`, `206 Partial Content`, `Accept-Ranges`, stable `Content-Length`, and seek behavior across supported browsers.

### Shared Assessment Layer Decisions

66. Module adapters own user-facing copy; shared components do not own product-specific default copy.
67. Modules calculate validation issues, severity, navigation, and gating; shared validation only renders neutral state.
68. Shared styling uses neutral assessment tokens and must not import Reading V2 CSS as authority.
69. Extract a small neutral visual primitive early only when Reading V2 and Listening immediately use it in the same pull request or explicitly named adjacent pull requests.
70. Shared authoring shell extraction waits until status, validation, section, card, header, and action-row contracts are stable.
71. Shared answer inputs remain module-owned until two modules prove identical semantic, validation, accessibility, and persistence contracts.
72. Shared loading/error primitives render neutral state. Retry behavior and side effects remain module-owned.
73. Listening Mantine `AppShell` removal is a dedicated patch after core authoring primitives stabilize.

### Runtime And Live Authority Decisions

74. Reading V2 runtime changes are blocked until a dedicated runtime child PRD.
75. Solo/homework Listening alignment requires its own child PRD after authoring stabilization.
76. Live Listening remains protected until authority contract and live test harness exist.
77. Teacher commands update canonical `masterAudioState`; `audioCommand` mirrors compatibility traffic.
78. Canonical authority uses monotonic revision plus trusted server timestamp. Highest valid revision wins.
79. Late join loads canonical section/position/speed/play state, accounts for elapsed trusted time, then drift-corrects.
80. Student buffering completion cannot override an authoritative teacher pause.
81. Resume after a long pause performs authoritative seek and ready confirmation before play.
82. Teacher section skip creates a new canonical revision that invalidates old playback.
83. Live reload restores answers and rejoins canonical teacher audio state; it never restores local playback authority.
84. Teacher disconnect freezes canonical audio and shows reconnect state. Students do not auto-resume.
85. Network partition uses bounded grace, then pauses locally and shows sync loss; recovery resumes from canonical authority.
86. Initial live-child-PRD test baselines are 500 ms soft correction and 2 seconds hard seek. Final product thresholds require browser/live proof.
87. Pending or denied headphone readiness remains visible to teacher and cannot be silently bypassed.
88. If teacher ends session during an accepted idempotent submit, that submit may finish; later submits reject into a recoverable result/review state.
89. Default performance target is 100 students per live session and 20 concurrent sessions unless product owner approves a larger class model.

### Compatibility, Testing, And Rollout Decisions

90. Legacy R2 Listening records remain readable through an adapter. New writes use the registry model.
> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 91. Proposed under OQ-2: first edit freezes a legacy mutable published R2 test as immutable version 1 and creates a revision draft; existing assignments/results remain pinned.

91. Approved binding decision OQ-2: first edit freezes a legacy mutable published R2 test as immutable version 1 and creates a revision draft; existing assignments, results, and sessions remain pinned to version 1.
92. R2 migration requires inventory, backup, dry run, explicit migration PRD, and recovery proof. On-read migration is prohibited.
> Obsolete proposal history - approved 2026-06-19 under `PRD-0055-PACKET-1B-OQ-APPROVAL-2026-06-19`: 93. Proposed under OQ-1: Google Drive upload removal and deletion/disposition of Google Drive-backed tests belong to a separate task. This PRD introduces no Google Drive migration and no new Google Drive-specific error state.

93. Approved binding decision OQ-1: Google Drive upload-code removal and deletion/disposition of Google Drive-backed tests belong to a separate cleanup/deletion task. This PRD introduces no new Google Drive behavior or migration, removes no current playback, and adds no Google Drive-specific error state.
94. Feature flags are required only for behavior-changing storage/runtime phases; neutral presentation adoption does not require one.
95. Storage rollback preserves old and new readers until compatibility proof completes.
96. Phase entry requires prior tests, ownership/protected-file review, boundary checks, rollback steps, observability, and required browser/network/database evidence.
97. Authoring proof covers create, Save draft, reload, replacement, cancel, Publish, reopen, conflict, duplicate action, legacy read, and first-edit legacy transition.
98. Storage proof covers object state, registry state, failed-save orphan, zero-reference grace, immediate abandonment cleanup, heartbeat limits, authorized delivery, historical orphan inventory, and denied cross-owner operations.
99. Live proof covers teacher plus multiple students, desktop/mobile, normal/late join, teacher/student reload, lag, pause/resume, seek, skip, speed, buffering, headphone states, disconnect, authority conflict, and submit/session-end races.
100. Supported-browser proof covers current Chrome, Edge, and Safari, including iOS Safari signed-media range behavior, plus relevant tablet layouts. Teacher mobile remains out of scope unless separately approved.
101. No behavior rollout starts without metrics for commit failure, URL refresh failure, sync drift, cleanup failure, authorization denial, reclaimed bytes, and references blocking deletion.
102. Rollout order is internal fixtures, selected teachers, percentage rollout, then full rollout.
103. Data loss, wrong audio, cross-owner access, live authority drift, legacy incompatibility, or mid-test interruption stops rollout immediately.
104. Final junior handoff must include child PRD, ordered checklist, exact owned/protected files, prohibited changes, exact tests, rollback procedure, and evidence template.

## 30. Definition Of Done

This PRD is done when:

1. It exists at `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`.
2. It consolidates the strategy, research, audit, implementation log, canonical architecture, and current code inspection.
3. It states the product rule: unify product experience, not test construct.
4. It states the dependency rule: Reading V2 and Listening both depend on a neutral shared assessment layer, not on each other.
5. It names current shared primitives and exact current adoptions.
6. It names protected boundaries and unsafe moves.
7. It includes safe vs unsafe examples.
8. It includes edge cases, conflict rules, data constraints, accessibility, mobile/desktop expectations, testing strategy, rollout, patch sequence, success metrics, acceptance criteria, regression checklist, risk register, open questions, and implementation definition of done.
9. It does not modify runtime code or source files.
10. `git diff --check` passes.
11. UTF-8/doc check runs if available for the new PRD.
12. Product owner resolved OQ-1 through OQ-4 on 2026-06-19, approved binding text is recorded, and status is `Approved parent PRD - implementation remains gated by approved child PRDs`.

Future implementation work derived from this PRD is done only when:

1. The patch stays inside the approved phase.
2. The patch avoids protected boundaries unless the phase explicitly allows them.
3. Shared components remain neutral.
4. Module behavior remains module-owned.
5. Required targeted tests pass.
6. Required live proof exists for any live-session behavior change.
7. Rollback path is clear.
8. Documentation reflects any architecture truth change.
9. Any R2 lifecycle implementation retains saved draft/published references and removes only verified unreferenced assets.
