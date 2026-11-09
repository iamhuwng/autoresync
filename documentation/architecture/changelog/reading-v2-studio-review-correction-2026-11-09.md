# Reading V2 Studio review correction release

Changelog ID: `CL-20261109-READING-V2-STUDIO-REVIEW-CORRECTION`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Problem

The Studio could report an answer-bank mismatch for a question range even when
an authored question already had a valid current option set. Review then left
the teacher without a clear way to approve the current content, and grouped
comparison details could obscure which question needed attention.

## Change

- Compare answer-bank entries per question, preserving the question's own
  option labels and text as the current authoring authority.
- Let Review open the affected question and offer the direct correction path:
  edit the answer bank or approve the current authored bank when it is valid.
- Re-evaluate the current document after the action so resolved findings leave
  the Review count and publication readiness immediately.
- Keep Publish blocked when the latest save reports an error, so publication
  cannot use an unacknowledged or stale draft.
- Keep the Studio shell focused on authoring by leaving the shared teacher
  navigation out of the Reading V2 Studio surface.

These changes preserve source-backed diagnostics while making a teacher's
intentional correction authoritative after the current document is checked.
No Firebase rules, Cloudflare Workers, backup Worker, or Backblaze code changed
in this release.

## Verification

- Focused Reading V2 candidate suite: 115 tests passed.
- Production build: 9,521 modules transformed and bundle budget passed.
- Live manifest readback: revision
  `66d111a8753db036ccb71f763fbcbcc21dcaf301`, tree
  `ebea06139c225ae47ab742a052da3c17b285fadb`, production environment, 458
  listed files.
- Direct public readback returned HTTP 200 for
  `/assets/AcademicRecordPage-CK9meOa3.js`, and its SHA-256 matched the
  candidate manifest entry.
- Firebase Hosting provider version:
  `projects/temp-a1437/sites/kahut1/versions/870569e611022933` released at
  `2026-11-09T11:35:07.559Z`.
- Release journal entry `e4e54580-f929-4cb5-af18-6fc40a22c5e7` is recorded as
  `live`, with publication `published` and verification `passed`.

The focused checks and public artifact readback prove the correction is in the
published bundle. They do not replace a future authenticated teacher browser
walkthrough of every supported import shape.