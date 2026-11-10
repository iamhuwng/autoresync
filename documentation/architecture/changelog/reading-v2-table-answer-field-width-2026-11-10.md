# Reading V2 table answer-field width

Changelog ID: `CL-20261110-READING-V2-TABLE-ANSWER-FIELD-WIDTH`

## Problem

Structured table-completion answer fields were difficult to tap and visually
separated from the sentence or table-cell text. Focus also exposed an unwanted
rectangular control border.

## Change

- Rendered shared free-text answers as borderless inline underlines, with a
  thicker underline as the focus indicator.
- Rendered structured table answers as single-line text inputs in the inline
  cell flow, without an outer wrapper box; long values stay clipped to one
  line and the surrounding cell text remains contained.
- Kept the table layout left-aligned and usable across desktop, tablet, and
  mobile widths.
- Updated the runtime CSS/markup and the mobile CSS contract test only.

## Verification

- Candidate: `b550a600ff950e4ea707861065534d12bb015b8b`.
- Exact observed production base: `12567749befa536c5fb81891c8e528e4e7b97092`.
- Candidate diff is limited to the runtime CSS, runtime markup, and its mobile
  CSS contract test.
- Production build and tooling doctor passed. The copied candidate checkout's
  focused Vitest command remains unavailable because its junctioned dependency
  and config path fails before test discovery; this is recorded as a harness
  limitation rather than a product test pass.
- `git diff --check` passed for the release documentation.

## Release status

The live Hosting manifest was independently matched to the observed production
base and then to candidate revision `b550a600ff950e4ea707861065534d12bb015b8b`.
The candidate tree is `8ac2c7a319c31803b45c84e138c2a7824db288ce`; the observed
production fingerprint is
`f5d883ad2e5fcdf1a138f01f6c5f9c73d55293b99f20d57ca46919b5eb2a0a07`.
An independent compatibility review verified the candidate against base
`12567749befa536c5fb81891c8e528e4e7b97092` and that fingerprint. It confirmed
unchanged Worker endpoints, Firebase permissions/configuration, application
answer callbacks, runtime dependencies, and package manifests. The guarded
assessment returned `PASS`, including historical hotfix reconciliation.

The isolated candidate was deployed through the guarded Hosting route. The live
manifest now reports revision `b550a600ff950e4ea707861065534d12bb015b8b`, tree
`8ac2c7a319c31803b45c84e138c2a7824db288ce`, and production environment
fingerprint `8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57`.
The post-deploy full file/hash observation passed; Firebase provider version is
`206edf3769d3d900`.

The in-app browser opened the real live Urban farming Reading V2 student
runtime. Desktop/tablet evidence shows the Q4–Q7 table contained in its scroll
region. Focusing Q4 shows only the underline; a temporary long value remained
single-line and contained within the cell, then was cleared. The live runtime
also showed Q1–Q3 borderless underlines and the running student timer.

The recovered source-retention gap is recorded separately from this UI release.
The exact deployed candidate is now durably preserved on GitHub at
`codex/reading-v2-table-field-release` (`b550a600ff950e4ea707861065534d12bb015b8b`).
The minimal fail-closed follow-up is to require an independently durable release
ref for the exact source revision before deployment, verify that ref in release
preflight, and record its name in the Hosting manifest and receipt.
