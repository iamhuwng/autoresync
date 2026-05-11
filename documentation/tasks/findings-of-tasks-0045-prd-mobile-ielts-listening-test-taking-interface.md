# Findings: Mobile IELTS Listening Test-Taking Interface

Append-only implementation findings for PRD-0045.

## 2026-05-12 - Mobile Section Navigation Audio Contract Supersedes Audio-Lock Tasks

Context:
- Live mobile testing showed active section-tab selection still allowed stale audio behavior in some paths.
- Older PRD-0045 task text expected Standard/live mobile tabs to keep audio locked to the current section.
- Current user-facing requirement is different: active section navigation must switch to the destination audio and start it.

Finding:
- The mode split based on `showPlayPause` is no longer a valid mobile student contract for explicit section navigation.
- Mobile section tabs, cross-section question navigation, and image swipes need one shared destination-section audio switch path.
- `AudioPlayer` must handle source-change replay without letting browser source-load races flip host playback intent to stopped.

Resolution:
- `ListeningTestPage` now uses one section-audio switch helper for mobile part tabs, image swipes, section clicks, and cross-section question navigation.
- `AudioPlayer` reloads source before play sync and restarts active playback when the new source is ready.
- Architecture contract added at `documentation/architecture/mobile-ielts-listening-audio-navigation.md`.

Retired text:
- Standard/live mobile tab taps only change viewed-part state.
- Standard/live mobile rendered content stays audio-locked after tab tap.
- `showPlayPause` decides whether explicit mobile section navigation changes audio.
