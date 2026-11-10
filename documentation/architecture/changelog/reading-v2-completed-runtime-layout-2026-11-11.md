# Reading V2 completed runtime layout release

Changelog ID: `CL-20261111-READING-V2-COMPLETED-RUNTIME-LAYOUT`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Finished scope

This release combines the completed passage/question splitter repair with the
inline, single-line answer blanks and table containment work. It also removes
the fragmented outline left by question navigation around a table answer:
navigation and typing both use a thicker blue underline as the focus indicator.

The splitter retains a 50/50 default, 30%-70% pane limits, pointer dragging and
keyboard control. Table answers stay within their cells, grow with their value,
and clip long input on one line. Narrow screens pan the table inside its own
scroll region.

## Source and integration

- Final candidate: `64e2bd69f5a0c42b38822783d54cb1677178d68e`.
- Final candidate tree: `3a315f88480159fab14ee694fb69b3be8d9d539a`.
- Exact production base: `ede1451cf3e47d437c19b64476ac4264fa778019`.
- The base already contains the table release `b550a600` and the completed
  splitter repair; the final candidate adds six CSS lines and existing-test
  corrections only.
- The original completed changes are in canonical `main` at `d78b91d5` and
  `ac3dd1f0`; the final focus correction is integrated as `f26ccf97`.
- GitHub branch `codex/reading-v2-finished-release` retains the exact candidate.
- The broader canonical `main` delta and unfinished work are excluded from the
  Hosting artifact. Worker endpoints, Firebase rules/configuration, application
  services and dependency manifests are unchanged in this release.

## Verification

- Focused runtime and CSS suites: candidate 77/77, canonical main 78/78, zero
  skipped tests. An obsolete textarea assertion was corrected to verify the
  approved single-line input and retained answer value.
- Production build, bundle budget, UTF-8 and diff whitespace checks passed.
- Real authenticated Urban farming student runtime, entered through `/login`
  at `http://localhost:5174`, loaded the final built candidate.
- Question navigator -> Q4 -> long input: the question anchor and input both
  have no outline; the focused underline is 3px; the value stays inside its
  table cell and was cleared after verification.
- Actual candidate runtime measurements at 320x740, 375x812, 610x764,
  1024x768 and 1440x900 show all four table inputs contained and no page
  horizontal overflow. These checks use the real runtime and material.
- Actual pointer drag changed the splitter from 50% to 30%; ArrowRight changed
  it from 30% to 40%.
- Independent compatibility review is bound to the final source, exact live
  base and Hosting observation fingerprint
  `9dc419239da337e8de5b7434a68523f9ce8b7b00589ef5b7acaf20a7e48a1e57`.
  The reviewer recomputed mismatch sets for all 17 observed historical
  hotfixes, reconciled 16 differing sets, and confirmed one exact match.
- Guarded final assessment returned `PASS` in
  `table-field-hotfix-local/tmp/release-receipts/64e-final-assessment-2.json`.

## Release evidence

The intermediate combined release `ede1451c` was published as Firebase Hosting
version `5a0707c486288a92` at `2026-11-11 01:04:05` Asia/Bangkok. Its native
provider readback and full asset hashes passed. Subsequent live phone testing
found the navigation outline and produced the final correction above.

The final candidate was published as Firebase Hosting version
`28efb1bb7cbc15ac` at `2026-11-11 01:44:05` Asia/Bangkok. Native readback
matched the exact candidate revision/tree and verified all 458 manifest-listed
file hashes. The first immediate readback saw one asset drift; a fresh complete
observation passed after publication settled. Release operation
`a2234aae-ea26-4a6a-8e2d-a7806338dac4` is `live`, `published`, and verification
`passed`; generated evidence is in `tmp/release-receipts/64e-settlement.json`
and `tmp/release-receipts/64e-publication-summary.json`.

The deployed Urban farming runtime was verified in the in-app browser. At
375x812, selecting Q4 in the phone navigator and entering a long answer showed
no input or outer navigation outline, a 3px underline, and cell containment.
The 320px phone document also stayed within the viewport. Tablet 1024x768 and
fullscreen 1440x900 checks retained all four inputs inside their cells. The
temporary answer was cleared, no submission was made, and viewport overrides
were restored.

The source correction was synchronized separately to GitHub `main` as
`f26ccf970e81870874c2eb424e65639fdbf012fb`; the exact deployed source remains
independently recoverable from `codex/reading-v2-finished-release` at `64e2bd69`.
The master changelog update is a subsequent documentation-only commit.
