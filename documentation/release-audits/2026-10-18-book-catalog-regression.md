# Existing Book catalog regression

Status: correction candidate; no deployment in this investigation.

The live Teacher lobby at `hocthem.net/lobby` was verified with the built-in
Teacher login: My Content, Public Library, Drafts and Reading Passage are
visible, but Book is missing. The live manifest still identifies source
`83d794d479c570a1149f0bfe204bee5ebe5a2bd0`, tree
`c3e7d68e296867a332343ebd658e0b6fb84cb4fb`, environment fingerprint
`b20a584d8bfaeeb48c309fd8e4b0448ec1c1b1d80353c59fa5bf7529af694b35`.

The production environment preparation mistakenly set `VITE_MATERIAL_BOOKS`
and `VITE_MATERIAL_BOOK_EDITOR` to `disabled` while withholding newer PDF Book
presentation. This disabled the existing catalog and editor as well. The first
affected release was Hosting `caa2ab5da3911495`, source `fb4197fc`, on October
18 at 00:20 Asia/Bangkok; the subsequent Reading repair retained those values.
This was a release configuration mistake, not a removed component or lost data.

Historical evidence is independently tied to provider content. After converting
the retained `readingV2FeatureFlags-CLelYjCp.js` from CRLF to LF, gzip level 9
SHA-256 matches the October 6 Hosting file-list hash exactly:
`ba66858a7f2c91ed5a83d2c980ae7df2f7f2d5b39e6a32620a71ee8d767ea8b8`.
That module enables both generic Book capabilities. The current manifest's
verified module disables both. The feature-gate and content-tab source files
are unchanged from the pre-release donor.

## Correction and prevention

Restore only the two generic Book environment settings to `enabled`. Keep all
six `VITE_BOOK_ACTIVITY_*_PRESENTATION` settings `disabled`. The production
guard now requires those reviewed modes explicitly, and the environment
example records them so a fresh clone does not silently hide existing features.
A future PDF Activity rollout must deliberately review and update that policy.
No application, Worker, rules, database or provider code changes are included.

Restoring the editor also restores its historical dispatch for existing
PDF-mode records. It does not import dirty/new PDF Book work. New PDF creation
remains separately gated; ordinary materials-based Books stay available.

The regression test first failed because missing Book settings reached the
clean-tree guard without being rejected for the incorrect feature modes.
After the correction, all 31 deployment-safety tests pass, including missing
and incorrect modes for both Book flags and all six PDF presentation settings.
Build and browser acceptance remain separate proof before release approval.

## Scoped omission audit

The provider-bound old/current gate comparison found these remaining losses:

| Capability | Previous live | Current live |
| --- | --- | --- |
| Book catalog | enabled | disabled |
| Book editor | enabled | disabled |
| Reading rollout/visibility | public / opt-in | public / opt-in |
| Reading passage library/homework | enabled | enabled |
| Configurable test-type flags | disabled | disabled |

Teacher lobby, create modal, App routes and student shell/navigation match the
tracked October 6 donor. The scoped audit found no further concrete omission
there. Historical PDF Activity hint values are not established by matching
provider artifacts, and the added StudentPractice delivery guard remains an
explicit unreleased Book Activity boundary. This is not a claim that every
application workflow has been requalified or that no other defect exists.

Read-only proof, screenshots and candidate checks live in the canonical
checkout's ignored `tmp/deployment-audit-20261017/` directory, including
`book-tab-regression-proof.json` and `book-tab-missing-live-20261018.png`.
