# Mobile IELTS Listening Audio Navigation Contract

Status: Active
Last Updated: 2026-05-12
Owner: Frontend Platform / IELTS Listening

## Purpose

Define the current mobile IELTS Listening contract for section tabs, image swipes, section completion, and audio source changes.

This document supersedes older PRD-0045 text that said Standard/live mobile section navigation should only change viewed questions while keeping audio locked to the current section.

## Scope

Applies to:
- live/supervised IELTS Listening in `src/skills/listening/components/ListeningTestPage.tsx`
- solo and homework IELTS Listening in `src/components/practice/ListeningPracticeView.tsx`
- shared playback behavior in `src/skills/listening/components/AudioPlayer.tsx`
- mobile image presentation in `src/components/test/mobile/MobileListeningImageCanvas.tsx`
- projected image metadata from `questionImages`

Desktop Listening behavior is outside this mobile contract unless a shared playback fix is required.

## Cross-Skill Unification Boundary

`documentation/architecture/ielts-reading-v2-listening-unification.md` permits shared presentation primitives but does not supersede this audio/navigation contract. Generic assessment shells, navigators, or status components must not become sources of `currentAudioIndex`, playback intent, section transitions, or live-session authority.

## Current Contract

### Explicit Section Navigation

When a student actively chooses another mobile section/part tab, the UI must:
- move the viewed part/question context to the destination section
- move `currentAudioIndex` to the destination section audio
- clear the old audio error state
- start the destination audio when the test is not submitted and the destination section has an audio URL

This rule is no longer conditional on `showPlayPause`.
The retired Standard/live model said tab taps should keep audio locked to the current section. That model is obsolete for the mobile student interface.

### Question Navigation Across Sections

When mobile or fallback question navigation crosses into another audio section, the destination section audio must become authoritative and start playing under the same rules as explicit section tabs.

This prevents a narrow viewport or mobile-like browser path from showing one section while stale audio from another section continues.

### Image Carousel Navigation

Mobile image mode uses `questionImages` as an ordered render list. A section may contain multiple images with different `questionRange` values.

The image canvas still displays one active image at a time. The image position pill, such as `2/5`, describes the active image index in the flattened available image list, not simultaneous display.

Swiping between images may cross section boundaries. When the active image moves into another section, the viewed part, active question, and destination audio section must move together.

Projection code must not collapse `questionImages` to one image per section.

### Section Completion

When a section audio ends on mobile Listening:
- do not replay the completed section
- advance to the next audio section when one exists
- move the viewed question/part to the next section
- start the next section audio

### Audio Source Reload

`AudioPlayer` owns the media-element source reload race.

When the host changes `audioUrl` or section number while playback intent remains active:
- reload the media element before the play-sync effect runs
- restart playback after the new source is ready if the element is still paused
- do not flip host `isPlaying` to false for transient source-load races such as browser `AbortError`

## Ownership Boundaries

`ListeningTestPage` owns live/supervised audio authority:
- `currentAudioIndex`
- `isPlaying`
- `currentQuestionNumber`
- live mobile shell state

`ListeningPracticeView` owns solo/homework playback and saved progress.

`MobileListeningExamScaffold` and `MobileListeningImageCanvas` stay presentation-focused. They must not become sources of audio authority.

## Obsolete Guidance

Retired guidance:
- "Standard/live mobile part tabs only change viewed state."
- "Standard/live mobile grouped content stays audio-locked after a part tab tap."
- "`showPlayPause` decides whether active section navigation changes audio."

Current rule:
- active student section navigation changes the destination audio and starts it when possible.
- automatic teacher/session progression still remains authoritative for live session state.

## Verification

Current verification coverage:
- `src/__tests__/integration/ListeningTestPage.test.tsx`
  - mobile part tab changes destination audio and playback state
  - image swipe across sections changes image, section, and audio
  - section completion advances image mode to the next section and starts audio
- `src/skills/listening/components/AudioPlayer.test.tsx`
  - active playback restarts after source change
- `src/components/practice/ListeningPracticeView.test.tsx`
  - solo/homework mobile shell behavior remains compatible

Manual live-test evidence from 2026-05-11:
- true mobile emulation used iPhone UA, touch, and `390x844`
- Section 1 -> 2, Section 2 -> 3, and Section 3 -> 4 tab changes switched `currentSrc` and left audio playing
- post-fix source changes produced no new playback console errors in the captured switch

## Related Docs

- `documentation/tasks/tasks-0045-prd-mobile-ielts-listening-test-taking-interface.md`
- `documentation/rules/mobile-ielts-listening-runtime-diagnostics.md`
- `documentation/architecture/student-test-delivery-projections.md`
- `documentation/architecture/homework-solo-practice-architecture.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
