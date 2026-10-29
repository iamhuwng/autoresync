# Listening narrow desktop overflow — 2026-10-29

Scope: make the existing standard desktop Listening header usable in a narrow
window while preserving the desktop and phone workflows. PDF/Book is excluded.
Release and live acceptance remain pending for this candidate.

## Intended behavior and cause

Read the header and player, their live/solo callers, UA-first exam-mode hook,
PRD-0045 host/persistence decisions, mobile audio/navigation contract and header
history before choosing the change. The historic 400px player minimum came
from the old embed layout; its purpose was usable controls, not mandatory
horizontal overflow. The owning hosts must keep all audio, progress,
question navigation and submission authority.

The prior header combined a non-shrinking audio/menu group, a 400px minimum
player and a non-wrapping controls row. Actual before-layout reproduction at
375px measured page width 999px. The fix changes only header presentation:
retain wide defaults, place audio on a full row below identity/Options at
1100px and below, allow controls to wrap, and truncate long names with titles.
No AudioPlayer, exam-mode, phone-host, backend, storage or route source changes.

## Local evidence

The isolated browser fixture renders the real ListeningHeader and AudioPlayer,
with Firebase and sync dependencies stubbed. Every control and notice is
contained at desktop widths 1440/1024/768/375/320px. Long-name, loading,
classroom/headphone and teacher-controlled cases are checked at narrow width.
The teacher-controlled fixture includes master state: Play is withheld, seeking
is disabled and volume remains available. This fixture is layout/policy proof,
not live-session synchronization proof.

CDP DOM identity plus media readback confirms the same playing audio element
and monotonically advancing currentTime across 1440 → 1024 → 375 → 320 → 1440.
No reload or playback reset occurs on resize. Existing player, live-host,
practice-host, mode-selection and mobile-header suites pass 94 tests.
Root ESLint, tooling doctor and diff checks passed. Evidence is retained under
`tmp/listening-narrow-desktop/`; final deployment/acceptance references follow
only after provider and browser checks pass.

The source contract is recorded in
[Listening desktop header layout](../architecture/listening-desktop-header-layout.md).
