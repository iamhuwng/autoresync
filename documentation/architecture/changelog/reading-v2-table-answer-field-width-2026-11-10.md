# Reading V2 table answer-field width

Changelog ID: `CL-20261110-READING-V2-TABLE-ANSWER-FIELD-WIDTH`

## Problem

Structured table-completion answer fields collapsed around the question badge on
desktop and phone. The resulting target was too small to tap reliably or type
into.

## Change

- Reserved a 14-character input width for every structured table answer field.
- Kept the answer field and question badge together without shrink-to-content
  collapse.
- Raised the table's scrollable minimum width so narrow screens can pan to a
  usable field instead of clipping or compressing it.
- Added a CSS contract test for the shared phone and desktop table renderer.

## Verification

- Reading V2 runtime and CSS suites: 77 tests passed.
- Reading V2 import and grouped-answer suites: 90 tests passed.
- `git diff --check`: passed.
- Committed locally as `fee1ea31`.

## Release status

The live Hosting manifest was read back from `https://kahut1.web.app` and
reported production revision `23ae29a79f816b27a551071345d700988b043bc7`.
The guarded release assessment against `origin/main` returned `BLOCKED` because
the reviewed base does not match that deployed revision and the exact deployed
Git object is unavailable in the local repository. No Hosting deployment was
executed. A fresh compatibility review and an isolated hotfix from the observed
production source are required before deployment.
