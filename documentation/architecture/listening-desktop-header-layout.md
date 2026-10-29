# Listening desktop header layout

`ListeningHeader` owns presentation of identity, timer, audio and Options for
the standard desktop/tablet Listening view. `ListeningPracticeView` owns
solo/homework state; `ListeningTestPage` owns live session state. The retained
IELTS practice caller consumes the same header. Layout must not take over
their audio, question, progress, submission or authority decisions.

The header adapts to available width without selecting a different exam mode.
`useMobileExamMode` remains the UA-first owner of desktop versus phone mode.
The phone scaffold and its separate audio row do not use this header's CSS.

- Above 1100px, keep identity beside the player/menu arrangement. The audio
  group can shrink and is capped at 680px; controls respond to player width.
- At 1100px and below, identity and Options share the first row; audio uses
  the full second row. Controls wrap rather than disappear or overflow.
- Keep the timer, allowed controls, notices and loading/classroom states
  readable. Long names may truncate visually and expose the full name by title.
- Keep the same AudioPlayer component, media element and DOM order mounted
  during resizing. Do not toggle `mobileLayout`, change control permissions,
  reload the source or reset playback to solve spacing.
- `AudioPlayer.css` owns the Classic controls on desktop and phone. The
  player uses container queries, without selecting a different exam mode.

## Classic source refinement — 2026-10-30

The approved Classic implementation replaces the two minimal-player render
branches with one media node/control tree. Above 560px available player width,
the bordered bar is 64px tall. At 560px and below it has two 44px rows, 88px
total: controls first, then a full-width native seek range. The 32px visible
Play circle sits inside a 44px target, with 10px visible clearance above it and
before the 4px seek track. The seek thumb is 20px on narrow players.

Speed remains visible when allowed. The speaker opens a native disclosure with
volume and device-volume guidance; conditional Replay/Next use a separate
disclosure. Escape restores focus and outside pointer presses close panels.
Teacher control, classroom muting, source refresh, replacement notices and
host-owned question/attempt state retain their existing ownership. Notices and
sync status remain outside the fixed-height bar and may add readable height.

This is a source implementation awaiting browser qualification, not a claim
that the design is live. See the [current audit](../release-audits/2026-10-30-listening-classic-player.md).

Verification includes 1440/1024/768/375/320px desktop widths, phone identity and
touch emulation at 375/320px, and audio-node/position continuity across resize.
Teacher-controlled and classroom modes keep their existing restrictions.

Related: [mobile audio/navigation authority](mobile-ielts-listening-audio-navigation.md)
and [the narrow desktop release audit](../release-audits/2026-10-29-listening-narrow-desktop.md).
