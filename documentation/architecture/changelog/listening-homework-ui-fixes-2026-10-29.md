# Listening Homework UI Fixes

Changelog ID: `CL-20261029-LISTENING-HOMEWORK-UI-FIXES`
Master entry: [Master Changelog](../master_changelog.md)

**Date:** 2026-10-29 (Asia/Bangkok)
**Status:** Released

## Fixed

- **Retakes:** Continue on submitted homework now starts a new attempt when one
  is allowed, instead of reopening the previous result. Exhausted assignments
  and explicit score actions still open the saved result.
- **Question counts:** Private Listening homework details load the count from
  existing student-safe metadata. Missing metadata shows an unavailable state
  instead of staying on Loading. Failed refreshes retain the last loaded count.
- **Recording notice:** The desktop exam header can grow to contain the
  recording-replacement notice and audio controls, keeping the notice visible.

## Preserved behavior

Image/text question presentation, teacher editing and replacement, audio rules,
attempt limits, saved progress, version pins, grading and earlier-result access
retain their existing owners. The deliberate desktop/phone mode selection is
unchanged. This follow-up deployed Hosting only; Workers, rules, stored audio
and PDF/Book work were unchanged.

## Verification and release

- 46 focused homework, audio-player and mobile-header tests passed; implementation
  and release-record CI passed in [PR #191](https://github.com/iamhuwng/autoresync/pull/191)
  and [PR #192](https://github.com/iamhuwng/autoresync/pull/192).
- Live desktop retakes and phone attempts submitted as **2/2**. Saved-result
  access survived a page reload, and earlier results remained accessible.
- Phone identity and touch emulation verified the intended phone layout at
  **375px and 320px**, with the full notice visible and no horizontal overflow.
- Hosting version: `e8078c4f8238311c`; deployed source: `a45aa392`;
  release tag: `deployed-listening-homework-ui-2026-10-29`.
- Post-deployment readback verified all **459** manifest-listed files, matching
  custom-domain content, and unchanged backend state.

## Known limits

Very narrow desktop windows retain the existing standard-layout overflow.
Phone checks used browser emulation; physical phones were not tested.

Detailed evidence, archived checksums and the preceding Hosting recovery
version are in the [release audit](../../release-audits/2026-10-29-listening-homework-ui.md).

## Subsequent release

The later [narrow desktop header fix](listening-narrow-desktop-2026-10-29.md)
resolves the standard-layout horizontal overflow recorded above. The original
release evidence remains historical; the follow-up records its own remaining
floating-arrow qualification and current Hosting version.
