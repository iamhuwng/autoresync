# Task List: Mobile IELTS Listening Test-Taking Interface

> **Source PRD:** `0045-prd-mobile-ielts-listening-test-taking-interface.md`
> **Generated:** 2026-04-14
> **Hardened For Execution:** 2026-04-14

## Locked Implementation Decisions

These decisions are part of the task list. The implementer must follow them exactly and must not substitute a different architecture, state contract, or flow.

### 1. Entry Points And Host Ownership

- Live/supervised Listening keeps `src/skills/listening/components/ListeningTestPage.tsx` as the only live host. Add one mobile render branch behind `useMobileExamMode()`. Do not create a second live Listening host.
- Solo practice and homework Listening must use a new dedicated host at `src/components/practice/ListeningPracticeView.tsx`.
- `src/components/practice/IELTSPracticeView.tsx` remains the Reading-oriented IELTS practice host. Do not add broad Listening branching to it.
- `src/components/test/mobile/MobileListeningExamScaffold.tsx` must be a pure presentation layer. It must not import storage, Firebase, router hooks, submission hooks, autosave hooks, or service modules.

### 2. StudentPracticePage Routing Contract

Change only the final view-selection branch in `src/pages/StudentPracticePage.tsx`. Keep the existing loading, error, resume-save, and settings-resolution logic intact.

Route exactly as follows:

- `IELTS + Writing` -> existing `WritingPracticeView`
- `IELTS + Listening` -> new `ListeningPracticeView`
- `IELTS + any non-Writing, non-Listening skill` -> existing `IELTSPracticeView`
- `THCS` -> existing `THCSPracticeView`
- The default fallback must remain the existing `IELTSPracticeView` fallback, not `ListeningPracticeView`.

### 3. Saved Mobile State Contract

Replace the single Reading-shaped `SavedMobileState` interface with a discriminated union in `src/types/practice.types.ts`.

The union must be:

- `ReadingSavedMobileState`
- `ListeningSavedMobileState`

The Reading payload must keep its existing fields unchanged, but must gain `kind: 'reading'`.

The Listening payload must be defined exactly as a JSON-safe shape with these fields:

- `kind: 'listening'`
- `version: 1`
- `viewedPartNumber: number`
- `currentQuestionNumber?: number`
- `textSize?: number`
- `answerSheetScrollByPart: Record<string, number>`
- `imageZoomByPart: Record<string, { scale: number; offsetX: number; offsetY: number }>`
- `playback?: { currentAudioIndex: number; audioPositionSeconds: number; volume: number; playbackSpeed: number; audioIndicesCompleted: number[] }`

Field rules:

- `viewedPartNumber` is 1-based, not 0-based.
- `currentQuestionNumber` is the last active question number within the viewed part. On restore, clamp to a valid question in the restored part; if invalid, fall back to the first question of the part.
- Record keys for part-based maps must be the string form of the user-facing part number: `'1'`, `'2'`, `'3'`, `'4'`.
- `imageZoomByPart` defaults to `scale: 1`, `offsetX: 0`, `offsetY: 0` for any missing or invalid part entry.
- `playback` is used only for solo/homework restore. Live mode must not write `playback` into `mobileState`.

### 4. Live Versus Practice Persistence Contract

- In live mode, keep the current RTDB player-root fields authoritative exactly where they already live: `currentAudioIndex`, `audioIndicesCompleted`, `currentSection`, `currentQuestionNumber`, `volume`, and `playbackSpeed`.
- In live mode, `players/{playerId}/mobileState` stores only Listening shell state. It must not become a second source of truth for audio progression.
- In solo/homework mode, continue to use the existing platform storage path through `useSoloAutoSave` and `useSoloResume`. Do not introduce raw `localStorage` or `sessionStorage`.
- In solo/homework mode, persist the same Listening shell payload in `mobileState`, and include `playback` there because no authoritative RTDB player node exists.

### 5. Durable Versus Transient Restore Rules

Persist only these Listening mobile fields:

- `viewedPartNumber`
- `currentQuestionNumber`
- `textSize`
- `answerSheetScrollByPart`
- `imageZoomByPart`
- `playback` in solo/homework only

Do not persist any of these transient states:

- `questionSheetOpen`
- `submitSheetOpen`
- `overflowMenuOpen`
- `textSizeControlOpen`
- `instructionsOpen`
- `showWaitPopup`
- `isPaused`
- `isSubmitting`
- `testSubmitted`
- audio error banners
- connection toasts
- retry banners
- sync indicators
- any other temporary overlay or interruption surface

Restore rules:

- Clamp `viewedPartNumber` to the real part count and fall back to `1` when invalid.
- Drop any invalid map entries rather than trying to coerce them silently.
- Force all transient UI state closed after restore.
- The image answer sheet must restore closed.
- Discard the entire Listening mobile payload when any of these change incompatibly: `materialId`, student/session scope, part count, question ranges per part, payload `kind`, or payload `version`.

### 6. Content-Tracking Rules

These rules are locked and must not be unified into one model:

- Direct-question Standard/live: rendered grouped content is derived from `currentAudioSection` only.
- Direct-question Standard/live tab taps update viewed-part UI state and `currentQuestionNumber`, but do not change `currentAudioIndex` and do not change the rendered question group.
- Direct-question Practice/Relaxed: tab taps update both `currentQuestionNumber` and `currentAudioIndex`, so rendered content changes with the selected part.
- Image mode: viewed content and the answer sheet are derived from the viewing part driven by `currentQuestionNumber`, not the current audio section.

### 7. Mobile Overlay Precedence

Use this exact precedence, highest to lowest:

1. submitted state / submitting state / time-up auto-submit flow
2. pause state
3. wait state
4. submit confirmation sheet
5. image-mode question sheet
6. overflow menu, text-size control, instructions modal
7. normal content interaction

State transition rules:

- When pause opens: close submit sheet, overflow menu, text-size control, and instructions immediately. Keep main content visible underneath. If the image question sheet was open, keep it visible but fully non-interactive.
- When wait opens: close submit sheet, overflow menu, text-size control, and instructions immediately. Keep main content visible underneath. If the image question sheet was open, keep it visible but fully non-interactive.
- When time-up starts: close image question sheet, submit sheet, overflow menu, text-size control, and instructions before starting the normal auto-submit flow.
- Do not add a mismatch warning banner.

### 8. Shared-Component Discipline

- Default to new Listening-specific components first.
- Modify shared mobile primitives only when a concrete missing capability blocks the Listening shell.
- If a shared mobile primitive is modified, add or update Reading regression tests in the same step.
- Do not modify desktop Listening presentation files for visual changes. Touch them only if a non-visual helper extraction is absolutely required, and keep desktop rendering unchanged.

## Relevant Files

### Files To Create

- `src/components/test/mobile/mobileListeningState.ts` - Single source of truth for Listening mobile-state serialization, hydration, clamping, compatibility checks, and transient-state clearing.
- `src/components/test/mobile/mobileListeningState.test.ts` - Unit tests for Listening mobile-state clamping, compatibility rejection, and durable/transient separation.
- `src/components/test/mobile/MobileListeningExamScaffold.tsx` - Pure presentational mobile Listening scaffold that renders the locked row order and hosts injected content/overlays only.
- `src/components/test/mobile/MobileListeningExamScaffold.test.tsx` - Tests for row order, pure-prop rendering, overlay slots, and disabled-state rendering.
- `src/components/test/mobile/MobileListeningHeader.tsx` - Mobile row-1 header with timer, submit trigger, and overflow trigger only.
- `src/components/test/mobile/MobileListeningHeader.test.tsx` - Tests for exact controls, disabled states, and callback wiring.
- `src/components/test/mobile/MobileListeningPartTabs.tsx` - Label-only `Part 1-4` tabs with exact active/no-op behavior.
- `src/components/test/mobile/MobileListeningPartTabs.test.tsx` - Tests for labels, equal-width rendering contract, active-tab no-op behavior, and tab callback payloads.
- `src/components/test/mobile/MobileListeningSubmitSheet.tsx` - Mobile confirmation bottom sheet for Listening submit.
- `src/components/test/mobile/MobileListeningSubmitSheet.test.tsx` - Tests for counts, exact warning copy, and confirm/cancel behavior.
- `src/components/test/mobile/MobileListeningImageCanvas.tsx` - Mobile image presenter with bounded pinch zoom, bounded pan, reset control, and no fullscreen behavior.
- `src/components/test/mobile/MobileListeningImageCanvas.test.tsx` - Tests for zoom rules, per-part reset/preserve rules, and reset-button placement contract.
- `src/components/practice/ListeningPracticeView.tsx` - Dedicated solo/homework Listening host.
- `src/components/practice/ListeningPracticeView.test.tsx` - Integration-oriented tests for practice/homework Listening host routing, restore, and submission behavior.

### Primary Files To Modify

These files are expected to change for the implementation.

- `src/skills/listening/components/ListeningTestPage.tsx` - Add the mobile live branch, keep the desktop branch intact, and own live Listening mobile state.
- `src/pages/StudentPracticePage.tsx` - Route `IELTS + Listening` to `ListeningPracticeView` and keep all other routing branches intact.
- `src/pages/StudentPracticePage.test.tsx` - Lock the new Listening route branch and verify Reading/Writing/THCS branches are unchanged.
- `src/types/practice.types.ts` - Introduce the discriminated `SavedMobileState` union and the exact Listening mobile payload shape.
- `src/types/practice.types.test.ts` - Type-level and runtime-shape tests for Reading and Listening mobile payloads.
- `src/hooks/test/useTestSession.ts` - Surface live `mobileState` without changing the existing authoritative player-root audio fields.
- `src/hooks/test/useTestSession.test.ts` - Tests for reading `mobileState.kind='listening'` without regressing existing behavior.
- `src/hooks/useTestAutoSave.ts` - Persist live Listening shell state to the existing player `mobileState` path only.
- `src/hooks/useTestAutoSave.test.ts` - Tests for live Listening shell autosave and for preserving the current player-root payload fields.
- `src/hooks/solo/useSoloAutoSave.ts` - Persist solo/homework Listening mobile shell state through platform storage.
- `src/hooks/solo/useSoloAutoSave.test.ts` - Tests for practice/homework Listening autosave payloads.
- `src/hooks/solo/useSoloResume.ts` - Restore, clamp, and discard Listening solo/homework state safely.
- `src/hooks/solo/useSoloResume.test.ts` - Tests for expiry, incompatibility discard, and transient-state clearing.
- `src/__tests__/integration/ListeningTestPage.test.tsx` - Main integration coverage for live Listening mobile behavior and desktop regression safety.

### Conditional Files To Modify Only If The Named Gap Exists

Touch these files only if the exact capability is missing. Do not modify them by default.

- `src/hooks/test/useTestSubmission.ts` - Modify only if the current submission hook cannot be triggered from a mobile confirmation sheet without changing desktop submission behavior.
- `src/hooks/test/useTestSubmission.test.ts` - Add tests only if `useTestSubmission.ts` changes.
- `src/hooks/test/useFullscreenMode.ts` - Modify only if Listening homework does not already inherit the same mobile fullscreen-ignore behavior Reading uses.
- `src/hooks/test/useFullscreenMode.test.ts` - Add tests only if `useFullscreenMode.ts` changes.
- `src/components/test/mobile/MobileQuestionSheet.tsx` - Modify only if the current sheet primitive cannot keep the part-tab row visible and tappable above the sheet.
- `src/components/test/mobile/MobileQuestionSheet.test.tsx` - Add Reading regression coverage only if the shared sheet primitive changes.
- `src/components/test/mobile/MobileQuestionsFab.tsx` - Modify only if the current shared FAB cannot satisfy the image-mode `Questions` button contract.
- `src/components/test/mobile/MobileQuestionsFab.test.tsx` - Add Reading regression coverage only if the shared FAB changes.
- `src/components/test/mobile/MobileOverflowMenu.tsx` - Modify only if the current overflow shell cannot render the exact Listening item list.
- `src/components/test/mobile/MobileOverflowMenu.test.tsx` - Add Reading regression coverage only if the shared overflow shell changes.
- `src/components/test/mobile/MobileTextSizeControl.tsx` - Modify only if the current shared control cannot support Listening mobile text-size behavior.
- `src/components/test/mobile/MobileTextSizeControl.test.tsx` - Add Reading regression coverage only if the shared text-size control changes.
- `src/components/test/mobile/MobileInstructionsModal.tsx` - Modify only if the current shared modal cannot render Listening help content.
- `src/components/test/mobile/MobileInstructionsModal.test.tsx` - Add Reading regression coverage only if the shared instructions modal changes.
- `src/components/test/mobile/mobileInstructionsContent.ts` - Modify only if Listening-specific instruction copy needs a new content source.
- `src/components/test/mobile/mobileInstructionsContent.test.ts` - Add tests only if the instructions content source changes.
- `src/config/featureRegistry.ts` - No change is expected. Touch only if a genuinely new action string is required and missing; do not rename or remove existing action strings.

### Reference Files (Read For Pattern Or Desktop Preservation, Do Not Modify By Default)

- `src/components/test/mobile/MobileReadingExamScaffold.tsx` - Structural reference for host-owned state and a pure presentation scaffold.
- `src/components/test/mobile/mobileReadingState.ts` - Structural reference for hydrate/serialize helper style only.
- `src/components/practice/IELTSPracticeView.tsx` - Reading-only practice-host reference; do not add broad Listening branching here.
- `src/core/platform/hooks/useMobileExamMode.ts` - Single source of truth for mobile-exam activation.
- `src/skills/listening/components/ListeningImageModeDisplay.tsx` - Desktop image-mode reference for content-tracking semantics only.
- `src/skills/listening/components/ListeningHeader.tsx` - Desktop header reference; no visual changes allowed.
- `src/skills/listening/components/WaitTimePopup.tsx` - Desktop wait-state reference; desktop must remain non-blocking.
- `documentation/tasks/process-task-list.md` - Commit and completion discipline for implementation.

### Documentation Maintenance Files

- `documentation/tasks/tasks-0045-prd-mobile-ielts-listening-test-taking-interface.md` - Execution checklist for PRD-0045. Update via CLI or MCP only; do not hand-edit markdown in an editor.
- `documentation/tasks/findings-of-tasks-0045-prd-mobile-ielts-listening-test-taking-interface.md` - Append-only findings log for implementation discoveries. Update via CLI or MCP only; do not hand-edit markdown in an editor.

### Rules Files (Read Before Coding)

- `documentation/rules/react-patterns.md` - Required before creating new components or adding new state/effect patterns.
- `documentation/rules/codebase-hygiene.md` - Required before imports and before extending existing data-write paths.
- `documentation/rules/mobile-portability.md` - Required because this work touches storage, browser-sensitive code, and mobile-specific interaction.
- `documentation/rules/observability.md` - Required before changing user-facing workflows or tracked actions.
- `documentation/rules/navigation.md` - Required before changing practice routing or any navigation behavior.

### Notes

- No new `@mantine/*` imports are allowed.
- Do not add raw `localStorage` or `sessionStorage` usage.
- The desktop Listening interface must remain visually and behaviorally unchanged when mobile exam mode is inactive.
- Required manual QA widths are `375px` and `320px`.
- Update markdown task and findings files through CLI or MCP only so repo documentation rules are not violated.
- Use `cmd /c npx vitest run [optional/path/to/test/file] --reporter=basic` for focused test execution in this Windows workspace.
- Use `cmd /c npm run build` after each parent task is completed.

## Tasks

- [x] 1.0 Lock the architecture, router branches, and exact mobile-state data contract before building UI.
  - [x] 1.1 Read `documentation/rules/react-patterns.md`, `documentation/rules/codebase-hygiene.md`, `documentation/rules/mobile-portability.md`, and `documentation/rules/observability.md` before touching Listening mobile files. Read `documentation/rules/navigation.md` before changing `StudentPracticePage.tsx`.
  - [x] 1.2 In `src/pages/StudentPracticePage.tsx`, preserve the existing loading, error, resume-save, and settings-resolution logic exactly as-is and change only the final view-selection branch.
  - [x] 1.3 Add the exact route branch `testType === 'IELTS' && testSkill === 'Listening'` -> `ListeningPracticeView`, while keeping `IELTS + Writing` on `WritingPracticeView`, `THCS` on `THCSPracticeView`, and all other IELTS cases on `IELTSPracticeView`.
  - [x] 1.4 In `src/types/practice.types.ts`, replace the single `SavedMobileState` shape with a discriminated union and keep the existing Reading payload fields unchanged under `kind: 'reading'`.
  - [x] 1.5 Add `ListeningSavedMobileState` with this exact field set: `kind`, `version`, `viewedPartNumber`, `currentQuestionNumber`, `textSize`, `answerSheetScrollByPart`, `imageZoomByPart`, and optional `playback` for solo/homework only.
  - [x] 1.6 Create `src/components/test/mobile/mobileListeningState.ts` with `hydrateListeningMobileState`, `serializeListeningMobileState`, `clearListeningTransientState`, and `isCompatibleListeningMobileState` helpers. These helpers must clamp invalid `viewedPartNumber` to `1`, clamp invalid `currentQuestionNumber` to the first question of the restored part, drop invalid map entries, reset all transient UI state to closed, and discard incompatible payloads entirely.
  - [x] 1.7 Create or update tests so the following are locked before UI work starts: Reading payload compatibility remains intact, invalid Listening payloads are discarded, invalid `viewedPartNumber` clamps to `1`, invalid `currentQuestionNumber` clamps to the first valid question in the restored part, and `StudentPracticePage` routes only `IELTS + Listening` to `ListeningPracticeView`.
  - [x] 1.8 Create `documentation/tasks/findings-of-tasks-0045-prd-mobile-ielts-listening-test-taking-interface.md` through CLI or MCP only and append implementation findings after each completed subtask during later implementation work.
  - [x] 1.9 Run the focused routing/type/mobile-state tests touched in this phase and then run `cmd /c npm run build` before marking `1.0` complete.

- [x] 2.0 Build the pure mobile Listening scaffold and shell controls with no business logic inside the scaffold.
  - [x] 2.1 Create `src/components/test/mobile/MobileListeningExamScaffold.tsx` as a prop-only presentation component. It must not import Firebase, storage, router hooks, autosave hooks, submission hooks, or services.
  - [x] 2.2 Make the scaffold render this exact row order and nothing else: row 1 header, row 2 audio row, row 3 part tabs, row 4 main content area. The audio row must receive the current playing part number from the host and display it as part of its normal UI so the student always knows which part is currently playing.
  - [x] 2.3 Create `src/components/test/mobile/MobileListeningHeader.tsx` with exactly three functional areas: timer display, submit trigger, and overflow trigger. Do not embed audio controls in this header.
  - [x] 2.4 Create `src/components/test/mobile/MobileListeningPartTabs.tsx` with exactly four equal-width label-only tabs: `Part 1`, `Part 2`, `Part 3`, and `Part 4`. Do not show counts, badges, or secondary labels in the tabs. Tapping the active tab must do nothing.
  - [x] 2.5 Create `src/components/test/mobile/MobileListeningSubmitSheet.tsx` as a bottom sheet (not a centered modal or full-screen overlay) with the exact content contract: total answered count, total unanswered count, per-part counts, warning line area, cancel/back action, and final confirm action.
  - [x] 2.6 Keep Listening-specific layout logic in Listening-specific components first. Modify a shared mobile primitive only when the current shared component is missing one exact capability required by the PRD, and add Reading regression tests in the same change.
  - [x] 2.7 Keep the audio row always visible in normal mobile operation and keep the part-tab row always visible in normal mobile operation. Do not collapse either row into the header.
  - [x] 2.8 Add unit tests that verify row order, header controls, tab labels, active-tab no-op behavior, and the submit-sheet render contract.
  - [x] 2.9 Run the touched mobile component tests and then run `cmd /c npm run build` before marking `2.0` complete.

- [x] 3.0 Implement live mobile direct-question behavior in `ListeningTestPage` with exact preservation of current desktop semantics.
  - [x] 3.1 Add one `useMobileExamMode()` render gate in `src/skills/listening/components/ListeningTestPage.tsx` so the existing desktop render path remains active and unchanged when mobile exam mode is false.
  - [x] 3.2 Keep all live Listening state ownership in `ListeningTestPage.tsx`. Pass state, derived labels, and callbacks into `MobileListeningExamScaffold`. Do not move Listening business logic into the scaffold.
  - [x] 3.3 In Standard/live direct-question mode where `showPlayPause=false`, implement tab taps exactly like current desktop semantics: set the viewed-part UI state and set `currentQuestionNumber` to the first question of the tapped part, but do not change `currentAudioIndex` and do not change the rendered grouped content, which must remain derived from `currentAudioSection`.
  - [x] 3.4 In Practice/Relaxed direct-question mode where `showPlayPause=true`, implement tab taps so they update both `currentQuestionNumber` and `currentAudioIndex`, causing rendered grouped content to change to the newly selected part.
  - [x] 3.5 Render grouped Listening question content directly on the main canvas in direct-question mode. Do not render a `Questions` FAB and do not render an answer sheet in direct-question mode.
  - [x] 3.6 Keep in-part navigation scroll-only. When the displayed grouped content changes to another part, reset the direct-question scroll container to the top immediately instead of restoring the previous in-session scroll position for that part.
  - [x] 3.7 Hide the legacy sticky `ListeningQuestionNav` and floating `ListeningNavArrows` only inside the mobile branch. The desktop branch must keep the existing components.
  - [x] 3.8 Make the current viewed part understandable without a warning banner by relying on subtle structural cues only: the audio row must always display the currently playing part number as part of its normal UI (e.g. the section rubric or audio file label). The content area's section rubric block must always display the currently viewed part number as part of its normal heading. Do not add conditional labels, prefixes, or banners that appear only when the playing and viewed parts differ.
  - [x] 3.9 Add or update tests that prove all of these scenarios: Standard/live tab tap changes viewed-part cue only, Standard/live rendered question group stays audio-locked, Practice/Relaxed tab tap changes audio section and rendered group, direct-question mode has no `Questions` button, and desktop Listening still renders the legacy bottom navigator and arrows outside mobile mode.
  - [x] 3.10 Run the focused Listening host/integration tests for direct-question behavior and then run `cmd /c npm run build` before marking `3.0` complete.

- [x] 4.0 Implement live mobile image-mode behavior with the exact question-sheet and zoom rules from the PRD.
  - [x] 4.1 Create `src/components/test/mobile/MobileListeningImageCanvas.tsx` as the mobile image presenter. Do not convert the desktop `ListeningImageModeDisplay` into a shared visual component.
  - [x] 4.2 Preserve the current desktop image-mode tracking model exactly: the viewed part and answer sheet content are derived from `currentQuestionNumber`, not from `currentAudioSection`.
  - [x] 4.3 Render the image area as the primary mobile content in image mode and render the floating bottom-right `Questions` FAB only in image mode.
  - [x] 4.4 Open the answer-entry sheet below the part-tab row (row 3). The header (row 1), audio row (row 2), and part-tab row (row 3) must all remain visible and interactive above the sheet. Do not place the sheet beneath the audio row (row 2) in a way that would cover the part tabs.
  - [x] 4.5 Scope the answer-entry sheet to the currently viewed part only. When the student changes part tabs while the sheet is open, update the sheet content in place to the newly viewed part.
  - [x] 4.6 Preserve per-part answer-sheet scroll when the sheet is reopened for the same part. Do not auto-open the answer sheet during restore.
  - [x] 4.7 If audio auto-advances while the image answer sheet is open, keep the sheet locked to the student's current viewed part. Do not automatically move the sheet to the new audio part unless the current viewed part becomes invalid after clamping.
  - [x] 4.8 Implement these zoom rules exactly: pinch zoom applies only to the image area, double-tap zoom is disabled, pan is clamped to the image frame, no fullscreen image viewer is allowed, switching parts resets zoom to default, and opening or closing the sheet for the same part preserves the current zoom state. During an active pinch/pan gesture inside the image area, the image handler must capture the gesture exclusively so normal page scroll does not fight the zoom. After gesture release, normal vertical page scroll must resume immediately. Do not disable page scroll globally.
  - [x] 4.9 Render the reset-zoom button only when `scale > 1`. Place it inside the image area at the top-right, and ensure by test that it never overlaps or obscures the floating `Questions` FAB at both `375px` and `320px` widths.
  - [x] 4.10 Make the current viewed part understandable in image mode by relying on subtle structural cues only: the answer-sheet header must always display the currently viewed part number as part of its normal heading. The audio row must always display the currently playing part number as part of its normal UI. Do not add conditional labels, prefixes, or banners that appear only when the playing and viewed parts differ.
  - [x] 4.11 Add unit and integration tests that prove these scenarios: image mode shows the `Questions` FAB only in image mode, the sheet opens below the part-tab row with the header, audio row, and part tabs remaining visible above it, tabs remain usable while the sheet is open, tab switch updates the sheet in place, audio auto-advance does not steal the viewed part, same-part sheet reopen preserves scroll, part switch resets zoom, and reset-button placement is safe at both required widths.
  - [x] 4.12 Run the focused image-mode tests and then run `cmd /c npm run build` before marking `4.0` complete.

- [x] 5.0 Implement the practice/homework Listening host and lock submit, overflow, and blocking-state behavior across mobile Listening.
  - [x] 5.1 Create `src/components/practice/ListeningPracticeView.tsx` as the dedicated unsupervised Listening host. It must own solo/homework hooks and must not route Listening back through `IELTSPracticeView`.
  - [x] 5.2 Reuse the same mobile scaffold contract in `ListeningPracticeView`, but preserve solo/homework-specific behavior such as local resume, local autosave, and homework rules.
  - [x] 5.3 Keep desktop Listening submit behavior unchanged. On mobile, the header submit trigger must open `MobileListeningSubmitSheet`; it must not submit directly.
  - [x] 5.4 Render the exact warning line only when unanswered questions remain: `You still have X unanswered questions. Are you sure you want to submit?` When unanswered count is zero, do not render a warning line placeholder with different copy.
  - [x] 5.5 Disable the mobile submit trigger whenever any of these are true: paused, wait state active, submitting, or already submitted.
  - [x] 5.6 Render the Listening mobile overflow menu with exactly these items in this order: `Instructions`, `Text size`, `Leave test`. Do not add Reading-only items such as review summary or review answers.
  - [x] 5.7 Apply the locked overlay precedence table from this task list. On pause and wait, close submit sheet, overflow menu, text-size control, and instructions immediately. On time-up, close image question sheet, submit sheet, overflow menu, text-size control, and instructions before auto-submit.
  - [x] 5.8 Keep the desktop `WaitTimePopup` non-blocking and unchanged. The blocking wait behavior is mobile-only.
  - [x] 5.9 Do not modify `src/config/featureRegistry.ts` unless a truly new action string is missing. If that happens, add the missing action only; do not rename or remove existing action names.
  - [x] 5.10 Add tests that prove these scenarios in both live and practice/homework mobile Listening: submit opens the confirmation sheet instead of submitting directly, warning copy appears only when unanswered questions remain, overflow contains only the allowed Listening items, pause disables all mobile interaction, wait disables all mobile interaction, time-up closes transient surfaces before auto-submit, and no mismatch banner is rendered.
  - [x] 5.11 Run the focused submit/overlay/practice-host tests and then run `cmd /c npm run build` before marking `5.0` complete.

- [x] 6.0 Implement exact persistence and silent-restore behavior for live, solo, and homework Listening without introducing new storage paths.
  - [x] 6.1 In live mode, continue writing `currentAudioIndex`, `audioIndicesCompleted`, `currentSection`, `currentQuestionNumber`, `volume`, and `playbackSpeed` exactly where current code already writes them. Add Listening shell persistence only to the existing `players/{playerId}/mobileState` path.
  - [x] 6.2 In live mode, write `mobileState.kind='listening'` with only `viewedPartNumber`, `currentQuestionNumber`, `textSize`, `answerSheetScrollByPart`, and `imageZoomByPart`. Do not write `playback` in live mode.
  - [x] 6.3 In solo/homework mode, keep using `useSoloAutoSave` and `useSoloResume` with platform storage. Persist `mobileState.kind='listening'` plus `playback` there because no RTDB player authority exists.
  - [x] 6.4 Restore live state in this exact order: session snapshot, authoritative player-root audio fields, Listening mobile shell payload, clamp invalid shell targets, clear all transient UI state. If any value conflicts, teacher/session-authoritative fields win.
  - [x] 6.5 Restore solo/homework state in this exact order: saved progress payload, expiry check, payload compatibility check, Listening shell hydration, optional `playback` hydration, clear all transient UI state, keep the image answer sheet closed.
  - [x] 6.6 On restore, discard the entire Listening mobile payload when `kind` is not `'listening'`, `version` is not `1`, `materialId` no longer matches, part count or question layout no longer matches, or homework/session scope no longer matches the saved context.
  - [x] 6.7 Clear persisted Listening mobile state on successful submit, on homework expiration, and on live session termination. Do not leave stale Listening mobile payloads behind for later entries.
  - [x] 6.8 Verify that no new raw `localStorage` or `sessionStorage` usage was introduced. All new persistence must route through the existing RTDB player path or the existing platform storage abstraction.
  - [x] 6.9 Add tests that prove these restore and cleanup scenarios: incompatible payload discard, invalid part clamp, invalid currentQuestionNumber clamp to the first valid question in the restored part, invalid zoom-map entry drop, restore does not reopen the image sheet, live authority overrides conflicting local shell state, solo/homework playback restores only in practice/homework, submit clears saved state, homework expiration clears saved state, and session termination clears saved state.
  - [x] 6.10 Run the focused persistence/resume tests and then run `cmd /c npm run build` before marking `6.0` complete.

- [x] 7.0 Complete regression coverage, manual QA, and release-closeout discipline with explicit scenario verification.
  - [x] 7.1 Extend `src/__tests__/integration/ListeningTestPage.test.tsx` so live mobile Listening proves all of these direct-question scenarios: Standard/live tab tap changes only viewed-part state, Standard/live rendered content stays audio-locked, Practice/Relaxed tab tap changes audio section and rendered content, direct-question mode has no `Questions` FAB, the mobile branch hides the legacy bottom nav and floating arrows, and in Standard/live mode tapping a future part tab (e.g. Part 4 while audio is on Part 1) successfully changes the viewed-part state without being blocked or locked.
  - [x] 7.2 Extend `src/__tests__/integration/ListeningTestPage.test.tsx` so live mobile Listening also proves all of these image-mode scenarios: `Questions` FAB appears only in image mode, the sheet opens below the part-tab row with the header, audio row, and part tabs remaining visible above it, part tabs remain usable while the sheet is open, part switching updates the sheet in place, audio auto-advance does not steal the viewed part, same-part reopen preserves sheet scroll, part switch resets zoom, and reset-button placement stays clear of the FAB.
  - [x] 7.3 Extend `src/components/practice/ListeningPracticeView.test.tsx` and related hook tests so solo/homework Listening proves all of these scenarios: `StudentPracticePage` routes `IELTS + Listening` correctly, silent restore hydrates compatible state only, restore never auto-opens the image question sheet, homework uses the same shell but preserves homework expiration rules, and mobile homework ignores fullscreen enforcement the same way Reading mobile does.
  - [x] 7.4 Add or update focused tests for submit and overlays so they prove these exact scenarios: submit uses the confirmation sheet instead of direct submit, warning copy appears only when unanswered questions remain, pause blocks all mobile interaction, wait blocks all mobile interaction while desktop wait remains unchanged, time-up closes transient overlays before auto-submit, and no mismatch-warning banner exists.
  - [x] 7.5 Run the focused Vitest suites for every touched Listening mobile file using `cmd /c npx vitest run ... --reporter=basic`.
  - [x] 7.6 Run `cmd /c npm run build` and confirm the full app still compiles after the Listening mobile branch is integrated.
  - [x] 7.7 Perform manual QA at `375px` for live Listening direct-question mode, live Listening image mode, pause, wait, submit, restore, and homework expiration.
  - [x] 7.8 Perform manual QA at `320px` for the same scenarios, with extra attention to tab readability, submit-sheet fit, overflow menu fit, image zoom usability, and reset-button/FAB non-overlap.
  - [x] 7.9 Perform manual desktop verification at a wide viewport and confirm the existing Listening computer interface remains visually and behaviorally unchanged when mobile exam mode is inactive.
  - [x] 7.10 Update the task list and append findings through CLI or MCP only, then mark parent tasks complete only after the required tests pass and commits follow `documentation/tasks/process-task-list.md`.
