# Listening Narrow Desktop Header

Changelog ID: `CL-20261029-LISTENING-NARROW-DESKTOP`
Master entry: [Master Changelog](../master_changelog.md)

**Released:** 2026-10-29 (Asia/Bangkok)
**Evidence reconciled:** 2026-10-30
**Status:** Released

## Fixed

The standard desktop Listening header no longer forces horizontal page
overflow in narrow windows. Identity and Options share the first row, and
audio uses a full second row at 1100px and below. Player controls wrap and the
recording-replacement notice remains visible. Long names expose their full
text by title.

## Preserved behavior

Wide desktop control geometry is unchanged. Resizing keeps the same playing
audio element and does not switch exam mode, reset playback or change control
permissions. The existing phone scaffold, image/text presentation, form,
navigation, progress, attempt pins, grading and saved results retain their
owners. Only Hosting was deployed; backend, audio storage and PDF/Book work
were unchanged.

## Verification and release

- 94 existing player/host/mode/mobile tests, independent review and all five
  [PR #194](https://github.com/iamhuwng/autoresync/pull/194) CI checks passed.
- Live desktop widths 1440/1024/768/375/320px have no horizontal overflow;
  permitted header controls, Options, Replay and the notice fit.
- Active audio advances without remounting through all five widths.
- Phone identity/touch emulation at 375/320px verifies its existing layout,
  form and private audio. Desktop and phone attempts save 2/2; saved-result
  access survives a full reload and earlier results remain accessible.
- Hosting `ce578e2ffde92f63` serves source `89a139c`. All 459 listed files and
  custom-domain content passed readback. Current manifest/provider reads on
  2026-10-30 still match that release.

## Remaining visual qualification

At 375×900px desktop, an existing floating question arrow can overlap one
instruction letter. Inputs and question navigation remain usable; scrolling
at 375×812px exposes the full prompt. This overlap remains separate from the
resolved header overflow. Physical phones and live classroom synchronization
were not retested.

Exact versions, evidence checksums, cache observations and recovery to
`e8078c4f8238311c` are in the
[release audit](../../release-audits/2026-10-29-listening-narrow-desktop.md).
The current layout contract is in
[Listening desktop header layout](../listening-desktop-header-layout.md).

## Unreleased Classic refinement — 2026-10-30

The approved Classic control design is implemented on an isolated source
branch. It consolidates the minimal player into one responsive control tree,
with 64px wide/88px narrow bars, native seek controls, visible speed and compact
volume/optional-action panels. This refinement has not been deployed: mandatory
real-browser verification is blocked by the browser tool's URL-policy check.
The [current audit](../../release-audits/2026-10-30-listening-classic-player.md)
records source checks, unresolved qualification and the untouched live baseline.
