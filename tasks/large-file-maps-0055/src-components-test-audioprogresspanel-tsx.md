# Large File Map: src/components/test/AudioProgressPanel.tsx

Task packet: PRD-0055 Task 8.14 local-only teacher monitor audio/progress and browser gesture-policy correction.

## Full-Read Evidence

- Current file: `src/components/test/AudioProgressPanel.tsx`.
- Current line count: 1062 lines by `(Get-Content -LiteralPath 'src\components\test\AudioProgressPanel.tsx').Count`.
- Baseline line count at `HEAD`: 850 lines by `$head = git show HEAD:src/components/test/AudioProgressPanel.tsx; $head.Count`.
- Full-read commands:
  - `rtk powershell.exe -NoProfile -Command "$i=0; Get-Content -LiteralPath 'src\components\test\AudioProgressPanel.tsx' | ForEach-Object { $i++; '{0:D4}: {1}' -f $i, $_ }"` covered start and end through line 1062.
  - The tool truncated the middle display, so `rtk powershell.exe -NoProfile -Command "$i=0; Get-Content -LiteralPath 'src\components\test\AudioProgressPanel.tsx' | ForEach-Object { $i++; if ($i -ge 480 -and $i -le 650) { '{0:D4}: {1}' -f $i, $_ } }"` covered the omitted 480-650 range.
  - `rtk rg -n "^(export const|const |  const |  useEffect|  const \[|  const [a-zA-Z].*= useMemo|  const [a-zA-Z].*= useCallback|  return \(|interface |type )" src/components/test/AudioProgressPanel.tsx` produced the symbol/effect inventory.
- Completion timestamp: 2026-06-30 local session, after Browser plugin proof and before final build rerun.

## Exports And Top-Level Symbols

- `AudioSection` lines 28-33: local section shape.
- `SectionLoadState` lines 36-40: preload state shape.
- `AudioProgressPanelProps` lines 42-59: panel props. Authority callbacks now accept optional `LiveAudioAuthoritySnapshot`.
- `TeacherMonitorStartReason` line 61: local start reason union.
- `getPlaybackErrorInfo` lines 63-73: structural media-play rejection classifier; treats `NotAllowedError` as browser gesture policy.
- `AudioProgressPanel` lines 75-1060: default/primary component.
- `default AudioProgressPanel` line 1062.

## State, Refs, Memos

- Refs:
  - `audioRef` line 92: hidden teacher monitor audio element.
  - `preloadAudioRefs` line 98: per-section metadata preload elements.
  - `recentRestartFromStartAtRef` line 99: stale-time correction window after ended-clip restart.
  - `teacherStartInFlightRef` line 100: duplicate local play guard.
- State:
  - `teacherVolume` line 93.
  - `isAudioLoading` line 94.
  - `isTeacherAudioPaused` line 95.
  - `audioError` line 96.
  - `sectionLoadStates` line 97.
  - `sectionElapsed` line 116.
  - `sectionStartTime` line 117.
  - `isDragging` line 120.
  - `dragValue` line 121.
  - `isEditingTime` line 124.
  - `tempTimeInput` line 125.
- Memos:
  - `sectionsWithDurations` lines 103-108.
  - `totalDuration` lines 111-113.
  - Derived display values lines 616-629.

## Effects

- Lines 152-208: preload all section metadata when unified audio is enabled; cleans listeners and sources on unmount.
- Lines 215-234: load current section audio into hidden teacher media element.
- Lines 237-241: sync teacher volume to media element.
- Lines 244-248: sync playback speed to media element.
- Lines 366-387: pause local media when canonical state stops; when canonical state says playing and audio is ready, log readiness rather than attempting autoplay outside a user gesture.
- Lines 389-415: listen for `TEACHER_MONITOR_AUDIO_RESUME_EVENT`, then attempt local media start during the toolbar click gesture path; remove listener on cleanup.
- Lines 471-475: reset local section timer and drag state on section change.
- Lines 478-490: legacy non-unified elapsed timer interval only.
- Lines 493-497: sync drag value to elapsed position outside active drag.

## Side Effects

- Media:
  - `new Audio()` preloads metadata lines 166-195.
  - `audio.src` and `audio.load()` lines 227-232.
  - `audio.volume` line 239.
  - `audio.playbackRate` line 246.
  - `audio.currentTime` mutations lines 276, 303, 433, 520, 599.
  - `audio.play()` line 329.
  - `audio.pause()` line 372 and line 446.
- Browser event:
  - `window.addEventListener`/`removeEventListener` lines 413-414 for teacher monitor resume gesture.
- Authority callback intent:
  - `onResumeAudio` line 431.
  - `onPauseAudio` line 448.
  - `onSkipToSection` lines 453-458.
  - `onSeekToPosition` lines 525-528 and 605-608.
- Timers:
  - `setInterval`/`clearInterval` lines 484-489 for non-unified legacy progress.
- Logging/diagnostics:
  - Preload/load diagnostics lines 184, 192, 232, 254, 261.
  - Restart/stale correction diagnostics lines 272, 308.
  - Gesture policy diagnostic line 349.
  - Toolbar local playback unexpected failure line 409.
  - Panel local playback unexpected failure line 441.

## Branches And Behavior Map

- Unified vs legacy:
  - `enableUnifiedAudio` gates preload, hidden audio, media timer, event listener, and play/pause behavior.
  - Legacy mode still uses timer-derived progress and direct callbacks.
- Local playback start:
  - `startTeacherAudio` lines 315-364 restarts ended audio when needed, dedupes concurrent starts, clears old audio error on success, and classifies browser `NotAllowedError`.
  - Gesture-policy block sets alert text and logs info; non-policy failures log warning and rethrow.
- Toolbar bridge:
  - `TeacherTestControlBar` dispatches `teacher-monitor-audio-resume-request` before async canonical resume write.
  - This component listens for the event and tries local media start during that same browser action path.
  - Authority hydration no longer calls `play()` by itself; it only logs readiness, preventing autoplay-only failures.
- Progress:
  - `handleAudioTimeUpdate` lines 264-285 drives visual progress from actual media time.
  - Recent ended-clip restart correction pins stale time updates back to `0` for 1500 ms if browser reports an old time over 2.5 seconds.
- Seek/manual time:
  - Slider drag updates `dragValue` and local media currentTime.
  - Manual time parsing accepts `MM:SS` or seconds, clamps to zero or above, then emits authority snapshot.
- JSX:
  - Hidden audio lines 635-645.
  - Header/loading/error/status controls lines 648-828.
  - Progress bar and segments lines 830-1003.
  - Legend buttons lines 1005-1056.

## Callers And Consumers

- Primary caller: `src/pages/TeacherTestMonitorPage.tsx`, import line 23 and render around line 829.
- Tests: `src/components/test/AudioProgressPanel.test.tsx`.
- Toolbar bridge peer: `src/components/test/TeacherTestControlBar.tsx`.
- Shared gesture contract: `src/components/test/teacherMonitorAudioEvents.ts`.

## Declared Touch Region

- Allowed changed regions for this packet:
  - imports and type additions lines 19-26 and 61-73.
  - playback state/refs and snapshot helper lines 92-146.
  - media effect/callback region lines 152-415.
  - play/pause/section/ended/seek/manual time region lines 421-620.
  - JSX controls and progress visual state lines 631-1060.
- Protected neighboring regions:
  - Public component name and route integration.
  - Existing non-unified fallback behavior.
  - Section layout semantics and `onSkipToSection`/`onSeekToPosition` contract direction.
  - No direct Firebase/RTDB writes in this file.
  - No Reading V2 imports or neutral shared-layer authority imports.

## Characterization And Proof

- Focused tests:
  - `rtk npx vitest run src/components/test/AudioProgressPanel.test.tsx src/components/test/TeacherTestControlBar.test.tsx --reporter=basic` passed 2 files / 10 tests after gesture correction.
  - `rtk npx vitest run src/components/test/AudioProgressPanel.test.tsx src/components/test/TeacherTestControlBar.test.tsx src/pages/TestPageRouter.test.tsx src/skills/listening/components/AudioPlayer.test.tsx src/hooks/audio/useAudioSync.test.tsx --reporter=dot` passed 5 files / 33 tests.
- Browser proof:
  - Browser plugin inspected `http://localhost:5173/teacher-test/T8KXWH`; decoded media state was ready/unmuted at `0:00 / 0:20`.
  - Browser automation click hit Chrome gesture policy; panel now shows the explicit alert and logs diagnostic info instead of `console.error`.
- Playwright proof:
  - `output/prd0055-task8-local-unblock/playwright-task8-expanded-report.json` reports 1 expected / 0 unexpected tests after the correction.

## Responsibility Delta

- Current line delta versus `HEAD`: 850 -> 1062 (+212 by current count; tracked diff reports +334/-122 for this file).
- Responsibility preserved: teacher-side local audio/progress UI and action-intent emission.
- Responsibility removed earlier in Task 8: direct authority write/hook ownership no longer belongs here.
- Responsibility added in this correction: small browser gesture-policy bridge consumer and clearer local playback diagnostics.
- Risk: file is above healthy size and now carries media state, progress rendering, accessibility controls, and gesture-policy diagnostics in one component.

## Future Decomposition Seams

- Extract `useTeacherMonitorAudioElement` for hidden media element, play/pause/restart, gesture policy, and media diagnostics.
- Extract `useAudioSectionPreload` for metadata preloading and section load states.
- Extract `TeacherAudioTransportControls` for volume/time/play/speed display.
- Extract `TeacherAudioSectionProgress` for segmented progress bar and seek slider.
- Extract `TeacherAudioSectionLegend` for section jump buttons.
- Keep authority writes outside these presentation pieces; components should emit action intent plus snapshot only.
