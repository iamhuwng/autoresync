# Reading V2 Student Mobile Runtime Parity Design

Date: 2026-06-19

## Goal

Bring shared Reading V2 student runtime to Reading V1 mobile usability parity without replacing V2 projection/task model or changing teacher UI, Reading V1, or Listening.

Fix applies at `ReadingV2RuntimeShell`, so practice, homework, course/library launches, live sessions, and future hosts inherit same behavior.

## Verified Baseline

Reading V2 already provides phone passage-first layout, timer, submit-to-review flow, Questions FAB, question bottom sheet, per-section passage scroll preservation, mobile highlighter suppression, answer persistence, safe table/diagram overflow, and timer/force-submit handling.

Parity is incomplete because mobile text-size and instructions tools are absent; question chips do not scroll their target into view; question-sheet scroll is not preserved; review return behavior depends on entry path; mobile overlays lack complete dialog/focus behavior; safe-area and breakpoint rules are inconsistent; some touch targets remain undersized; and a scroll diagnostic remains exposed to assistive technology.

## Chosen Architecture

Keep one V2-native runtime shell. Do not mount V1 scaffold or translate V2 projections into V1 questions.

### Mobile-mode resolution

Phone layout is active when either:

- viewport width is below existing student mobile breakpoint; or
- proven mobile-exam detector identifies a phone, preserving phone layout in landscape.

Phone-only CSS is keyed from `data-layout="phone"`, not a second conflicting media breakpoint. This keeps 721-767px and phone landscape behavior aligned with rendered markup.

### Mobile utilities

Overflow menu exposes exactly:

- Review answers
- Text size
- Instructions

Text size supports 14-22px and changes passage, task instructions, question prompts, options, inputs, and structured question content. Navigation controls, chips, and buttons retain fixed usable sizing. Setting persists using existing V1-compatible student-scoped storage-key convention supplied by production hosts. Preview/smoke hosts may omit persistence.

Instructions open a V2-specific dialog. Content comes from current-section projected task groups and existing `ReadingV2InstructionText`; no V1 practice-context adapter is introduced. Dialog also includes terse mobile-control help where needed.

### Overlay behavior

Question sheet, review summary, text-size control, and instructions use explicit dialog semantics. Opening an overlay records triggering control, moves focus into overlay, supports Escape where submission is not forced, prevents interaction with obscured runtime controls, and restores focus on close.

Review opening records whether question sheet was open. Back to Test restores that state and scroll position. Selecting a review question opens sheet and scrolls/focuses selected question.

### Navigation and scroll

Maintain two independent per-section maps:

- passage scroll position;
- question-sheet scroll position.

Opening/closing overlays does not alter passage position. Switching section saves outgoing surface and restores incoming surface. Explicit question navigation overrides stored question-sheet scroll, scrolls target into established focus slot, and focuses its question anchor.

Remove `preservedScrollLabel` state and DOM output. Scroll maps remain internal.

### Mobile sizing and safe areas

- Visible controls and answer inputs use a 44px minimum touch dimension where practical.
- Text inputs/selects use at least 16px text on phones to avoid iOS zoom.
- FAB bottom offset and passage bottom padding include `safe-area-inset-bottom`.
- Header height/sticky offsets include `safe-area-inset-top`.
- Bottom-sheet content includes safe-bottom padding.
- Tables and diagrams retain deliberate local horizontal scrolling; page itself must not gain unintended horizontal overflow.

## Host Contract

`ReadingV2RuntimeShell` gains optional student-scoped text-size persistence key. Production hosts provide it:

- `StudentPracticePage`: authenticated student UID;
- `TestPageRouter`: live player/student ID.

No host-specific mobile UI is added. Submit, timer, anti-cheat, exit, and post-submit routing ownership remains unchanged.

Pre-existing live completion dependency on later RTDB state and unused `/student/homework/:homeworkId/test` route mismatch are documented risks, not expanded into this mobile parity patch.

## Test Strategy

Use test-driven development in `ReadingV2RuntimeShell.test.tsx` with existing viewport and scroll helpers.

Required automated coverage:

1. Narrow portrait and phone landscape select phone layout.
2. Mobile header exposes timer and review-first Submit.
3. Questions FAB opens a dialog-like question sheet.
4. Question chip scrolls/focuses its target.
5. Passage and question-sheet scroll survive close, review, and section switches.
6. Overflow exposes Review, Text size, and Instructions.
7. Text-size control changes runtime content sizing and persists/restores preference.
8. Instructions dialog renders current projected instructions.
9. Review Back restores prior test surface.
10. Final submit, pending lock, failure retry, timer expiry, and force-submit behavior remain intact.
11. Scroll diagnostic is absent.
12. Mobile task types retain usable wrapping/local overflow.

Host tests verify both production hosts pass student-scoped preference keys. Existing Reading V1 and Listening mobile suites are verification-only and remain unmodified.

## Manual QA

Run student QA at `http://localhost:5174` with built-in Student quick login. Verify 320x568, 390x844, Pixel-like portrait, and small landscape. Exercise passage reading, Questions, question jump, answers, text size, instructions, section switching, review return, final submit, reload persistence, homework, practice, and live mode where locally available.

## Scope Exclusions

- No teacher UI changes.
- No Reading V1 or Listening production changes.
- No runtime redesign.
- No new student routes.
- No scoring, trusted-submit, anti-cheat, or backend contract changes.
- No unrelated live-session or homework-route repair.
