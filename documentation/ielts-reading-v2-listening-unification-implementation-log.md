# IELTS Reading V2 / Listening unification implementation log

## Patch 1: Neutral assessment status state primitive

### Changed files

- `src/features/assessment/shared/components/AssessmentStatusState.tsx`
- `src/features/assessment/shared/components/AssessmentStatusState.css`
- `src/features/assessment/shared/components/AssessmentStatusState.test.tsx`
- `src/pages/ReadingV2StudioPage.tsx`
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md`

### Why this was the safest first patch

This patch only extracts generic loading, error, and empty-state display into a neutral shared assessment component. The first adoption is limited to the Reading V2 Studio route-level revision hydration and invalid-context states, which are authoring-only gates before the Studio shell renders.

The adoption preserves the existing text, loading/error branching, and route behavior. It does not change draft state, autosave, parsing, publishing, reference updates, student runtime, audio playback, or live-session synchronization.

### How this avoids overloading Reading V2

The shared component lives under `src/features/assessment/shared/components`, not under Reading V2 or Listening. Reading V2 now depends on the neutral shared assessment layer for a visual primitive:

```text
Reading V2 -> neutral shared assessment layer
```

The shared component does not import Reading V2 services, Reading V2 components, Listening builders, audio utilities, or live-session code. It has no module-specific conditions and no knowledge of passages, audio, sections, teacher monitor state, or live sessions.

### Intentionally not touched

- `AudioProgressPanel`
- `useMonitorControls`
- `useMasterAudioState`
- `useAudioSync`
- `AudioPlayer`
- `ListeningTestPage`
- `ListeningPracticeView`
- `ReadingV2RuntimeShell`
- Reading V2 parser/import normalization
- Listening audio upload/storage lifecycle
- teacher audio control
- pause/resume synchronization
- skip-to-section behavior
- audio progress state
- headphone/audio readiness flow
- live Listening session authority
- student synchronization with teacher monitor
- Reading V2 passage rendering

### Tests/checks run

- `rg -n "components/reading-v2|services/reading-v2|skills/listening|AudioProgressPanel|useMonitorControls|useMasterAudioState|useAudioSync|AudioPlayer|ListeningTestPage|ListeningPracticeView|ReadingV2RuntimeShell|module ===|audio|passage|section|monitor|live" src\features\assessment\shared\components`
  - Result: exit 1 with no matches after removing the generic HTML `section` option from the shared component.
- `cmd /c npx vitest run src/features/assessment/shared/components/AssessmentStatusState.test.tsx`
  - Result: passed, 1 file, 3 tests.
- `cmd /c npm run build`
  - Result: passed. Vite built 9338 modules and `scripts/check-bundle-budget.mjs` reported `[bundle-budget] OK - root entry 229KB; public preloads are within budget.`
- `cmd /c npm run lint -- src/features/assessment/shared/components/AssessmentStatusState.tsx src/features/assessment/shared/components/AssessmentStatusState.test.tsx src/pages/ReadingV2StudioPage.tsx`
  - Result: failed because the repo script expands to `eslint . ...` and linted the full repository. It reported 1813 existing problems across backups, archives, e2e files, functions output, scripts, and many TypeScript files. This run did not isolate touched files.

### Next recommended patch

Adopt `AssessmentStatusState` in exactly one Listening authoring loading/error/empty branch after comparing copy and action behavior, or extract a neutral validation summary component if the Listening authoring branch proves too workflow-specific.

Do not make the next patch touch Listening runtime synchronization, audio behavior, live Listening, or Reading V2 parser/passage logic.

## Patch 2: Listening authoring empty-state adoption

### Changed files

- `src/features/assessment/shared/components/AssessmentStatusState.tsx`
- `src/features/assessment/shared/components/AssessmentStatusState.css`
- `src/features/assessment/shared/components/AssessmentStatusState.test.tsx`
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md`

### Why this was the safest next patch

This patch adopts the neutral state primitive in exactly one Listening authoring branch: the Step 4 empty question list shown before any questions have been added.

The branch is display-only. It does not read or write audio state, upload assets, persist tests, parse questions, publish materials, control live sessions, or synchronize teacher and student state.

### Shared component changes

- Added configurable heading levels so nested authoring states do not introduce an extra page-level `h1`.
- Added optional centered alignment for compact nested empty states.
- Kept defaults unchanged for the Reading V2 Studio adoption.

### Behavior preserved

- The empty state still appears only when `questions.length === 0`.
- The teacher still sees `No questions added yet` and `Click "Add Question" to start.`
- The existing Add Question action, question list, parsing, save, publish, and navigation behavior remain unchanged.

### Architecture boundary

Listening imports the neutral shared component:

```text
Listening -> neutral shared assessment layer
```

The neutral component still imports no Reading V2, Listening, audio, passage, teacher-monitor, or live-session code.

### Intentionally not touched

- Listening audio upload, Google Drive import, preview, validation, or storage lifecycle
- Listening question parsing logic
- Listening save/publish behavior
- `AudioProgressPanel`
- `useMonitorControls`
- `useMasterAudioState`
- `useAudioSync`
- `AudioPlayer`
- `ListeningTestPage`
- `ListeningPracticeView`
- `ReadingV2RuntimeShell`
- Reading V2 parser, passage, projection, or runtime logic

### Deferred existing residue

`src/skills/listening/builders/ListeningTestBuilder.tsx` already imports Mantine `AppShell`. Replacing the full builder shell would exceed this one-branch visual adoption and risks broad layout changes. No new Mantine import or usage was added. The existing `AppShell` replacement remains a separate authoring-shell patch.

### Tests/checks run

- `cmd /c npx vitest run src/features/assessment/shared/components/AssessmentStatusState.test.tsx`
  - Result: passed, 1 file, 5 tests.
- Neutral shared-layer boundary grep
  - Result: no prohibited Reading V2, Listening, audio, monitor, or live-session matches.
- Import/adoption grep
  - Result: both `ReadingV2StudioPage` and `ListeningTestBuilder` import `AssessmentStatusState` from the neutral shared layer.
- `cmd /c npm run build`
  - Result: passed. Vite built 9338 modules and bundle budget reported `[bundle-budget] OK - root entry 229KB; public preloads are within budget.`

### Next recommended patch

Extract a neutral assessment validation summary and adopt it in one authoring-only surface, or replace one additional Listening authoring loading/error state after adding focused builder coverage.

Do not expand into runtime, audio synchronization, live Listening, or Reading V2 parser/passage behavior.

## Patch 3: Neutral assessment validation summary

### Changed files

- `src/features/assessment/shared/components/AssessmentValidationSummary.tsx`
- `src/features/assessment/shared/components/AssessmentValidationSummary.css`
- `src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx`
- `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md`

### Why this was the safest next patch

This patch extracts only the display contract for a validation summary: title, ready/blocked status, summary message, optional additional messages, and issue count.

The first adoption is the Reading V2 Settings publish-readiness block. That block already receives calculated validation state through props and only renders it. No validation rules, issue mapping, parser behavior, passage behavior, publish gating, or callbacks moved into the shared layer.

An interactive Reading V2 review-issues dialog was considered and rejected for this patch because it owns focus, Escape handling, issue activation, navigation, and severity mapping. The simpler Settings summary has lower behavioral risk.

### Behavior preserved

- `publishBlocked` still selects the same blocked or ready copy.
- Answer-key authority still produces the same optional message.
- The issue count still renders as `Issues: N`.
- Metadata editing and all Settings ownership boundaries remain unchanged.
- Existing Reading V2 validation services and publish decisions remain Reading-specific.

### Architecture boundary

Reading V2 imports a neutral presentation component:

```text
Reading V2 -> neutral shared assessment layer
```

`AssessmentValidationSummary` imports only React types and its local stylesheet. It has no knowledge of Reading V2, Listening, passages, audio, parsers, publishing services, teacher monitor state, or live sessions.

### Intentionally not touched

- Reading V2 validation calculation or issue mapping
- Reading V2 parser/import normalization
- Reading V2 passage rendering
- Reading V2 publish handlers or gating
- Listening authoring validation, parser, save, audio, or storage behavior
- `AudioProgressPanel`
- `useMonitorControls`
- `useMasterAudioState`
- `useAudioSync`
- `AudioPlayer`
- `ListeningTestPage`
- `ListeningPracticeView`
- `ReadingV2RuntimeShell`

### Tests/checks run

- `cmd /c npx vitest run src/features/assessment/shared/components/AssessmentValidationSummary.test.tsx src/features/assessment/shared/components/AssessmentStatusState.test.tsx src/components/reading-v2/studio/ReadingV2SettingsPanel.test.tsx`
  - Result before independent review fixes: passed, 3 files, 10 tests.
- Neutral shared-layer boundary grep
  - Result: no prohibited Reading V2, Listening, audio, monitor, or live-session matches.
- `git diff --check`
  - Result: passed.
- `cmd /c npm run build`
  - Result: passed. Vite built 9340 modules and bundle budget reported `[bundle-budget] OK - root entry 229KB; public preloads are within budget.`
- Independent diff review
  - Result: corrected assertive default alert semantics to polite status semantics, while preserving explicit `role="alert"` support for urgent consumers.
  - Result: changed generic message wrappers from paragraphs to divs so callers can safely provide block content.
- Post-review targeted test rerun
  - Result: passed, 3 files, 11 tests.
- Post-review production build rerun
  - Result: passed. Vite built 9340 modules and bundle budget remained within limits.
- UTF-8 check
  - Result: passed for all 5 Patch 3 text files.

### Next recommended patch

Adopt `AssessmentValidationSummary` in one Listening authoring error or validation display only after adding focused `ListeningTestBuilder` coverage for that branch.

Keep the next patch away from audio validation, parsing behavior, save persistence, runtime synchronization, and live Listening.

## Patch 4: Listening authoring empty-state coverage

### Changed files

- `src/skills/listening/builders/ListeningTestBuilder.test.tsx`
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md`

### Why this was the safest next patch

This patch adds focused characterization coverage for the already-adopted Step 4 empty-question shared state. It changes no production component or behavior.

The covered flow starts in the default text mode, selects Audio, completes a mocked R2 upload, selects AI Parse, chooses Skip Add Manually, and reaches Questions.

### Characterized behavior

- The Questions step shows `Questions (0/10)`.
- The Add Question action remains available.
- `No questions added yet` renders as a level-3 heading.
- The instruction remains separate from the heading.

### Side-effect boundaries

- Parser, save, and Google validation paths are not called.
- The mocked R2 upload is called exactly once.
- No real external call is made.

### Mutation proof

Temporarily changing `titleLevel={3}` to `titleLevel={2}` caused the expected heading assertion failure. The production file was then restored byte-exact and the focused test returned green.

### Listening validation-summary evaluation

Optional `AssessmentValidationSummary` adoption was evaluated and skipped. The only unprotected candidate was the image-configured success display, but adoption would require heading and status semantics and would alter the existing output.

Excluded auth, audio-section, parser, and save errors were left untouched.

### Intentionally not touched

- Protected runtime, audio, live-session, parser, save, and storage areas
- Production components or production behavior
- Reading V2 runtime, parser, passage, projection, or publishing behavior

### Tests/checks run

- Targeted Vitest run for the builder and two shared component files
  - Result: passed, 3 files, 10 tests.
- `cmd /c npm run build`
  - Result: passed. Vite built 9340 modules and bundle budget reported `[bundle-budget] OK - root entry 229KB; public preloads are within budget.`
- Neutral shared-layer boundary grep
  - Result: no prohibited Reading V2, Listening, audio, monitor, or live matches.
- `git diff --check`
  - Result: passed before this implementation-log append.
- Independent spec review
  - Result: approved after baseline correction.
- Independent quality review
  - Result: approved with only minor non-blocking suggestions.

### Next recommended patch

Reassess one display-only Listening validation summary only if the shared component contract preserves existing semantics. Otherwise, adopt another neutral authoring primitive.

Keep protected runtime, audio, live-session, parser, save, and storage concerns out.
