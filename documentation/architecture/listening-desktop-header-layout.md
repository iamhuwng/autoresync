# Listening desktop header layout

`ListeningHeader` owns presentation of identity, timer, audio and Options for
the standard desktop/tablet Listening view. `ListeningPracticeView` owns
solo/homework state; `ListeningTestPage` owns live session state. The retained
IELTS practice caller consumes the same header. Layout must not take over
their audio, question, progress, submission or authority decisions.

The header adapts to available width without selecting a different exam mode.
`useMobileExamMode` remains the UA-first owner of desktop versus phone mode.
The phone scaffold and its separate audio row do not use this header's CSS.

- Above 1100px, keep the existing identity/player/menu arrangement. Controls
  may wrap if optional controls exceed the available player width.
- At 1100px and below, identity and Options share the first row; audio uses
  the full second row. Controls wrap rather than disappear or overflow.
- Keep the timer, allowed controls, notices and loading/classroom states
  readable. Long names may truncate visually and expose the full name by title.
- Keep the same AudioPlayer component, media element and DOM order mounted
  during resizing. Do not toggle `mobileLayout`, change control permissions,
  reload the source or reset playback to solve spacing.
- Header-scoped `:has(> audio)` selects the existing desktop controls row.
  If that player's markup changes, recheck this selector with the actual player.

Verification includes 1440/1024/768/375/320px desktop widths, phone identity and
touch emulation at 375/320px, and audio-node/position continuity across resize.
Teacher-controlled and classroom modes keep their existing restrictions.

Related: [mobile audio/navigation authority](mobile-ielts-listening-audio-navigation.md)
and [the narrow desktop release audit](../release-audits/2026-10-29-listening-narrow-desktop.md).
