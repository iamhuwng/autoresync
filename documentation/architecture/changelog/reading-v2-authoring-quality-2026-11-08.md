# Reading V2 authoring quality and durable review

Changelog ID: `CL-20261108-READING-V2-AUTHORING-QUALITY`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Problem

Reading V2 Auto V4 imports could leave teachers with technical review findings
that did not point to a corrective action. Historical validation messages could
also outlive the edit that resolved them, while draft continuation and
published-version recovery were not consistently durable.

## Change

- Added current-state authoring-quality evaluation for canonical content and
  source-backed passage, question, answer-slot and answer-bank requirements.
- Mapped findings to teacher-facing correction, association and review actions;
  removed the shared TeacherHeader from the Studio shell.
- Persisted authoring context through draft save/reload and publication recovery,
  with explicit save/conflict handling and selected-revision publication.
- Kept publication and runtime recovery tied to the exact published revision,
  including full-test composition and generated-passage paths.
- Added Firebase rule, draft repository, publication guard/recovery and focused
  Reading V2 regression coverage.

## Verification and release status

- Focused Reading V2 regressions passed 7 files and 161 tests across the
  merged/scoped candidate; the final assertion-only delta was rerun in Auto
  Import (49/49), and the release/changelog checks passed 55 tests. Production
  build passed 9,521 transformed modules and the bundle budget.
- The scoped Hosting candidate is `e865c34b2aa3394a5469cfcccabe68cffb103cc0`,
  based on observed production revision `71d6caa0481fdf5ca2b128a09488bf8c71d73865`.
- Guarded Hosting publication completed on 9 November 2026. Firebase Hosting
  version `3d2c5af913053fb2` was released for `kahut1`; the release journal is
  `76242556-6c4c-47ff-98da-b361d058deab` and provider verification passed.
- The deployed manifest and all 459 asset hashes read back successfully. A
  headless public login smoke check rendered `Welcome` and `Sign in with Google`
  with no page errors. Authenticated Studio workflow verification remains a
  separate browser check.
- RTDB rules were separately deployed and the live `rules.reading_v2` subtree
  matched the authoring source. `main` now carries only that subtree
  reconciliation; unrelated homework/result rules were preserved.
- A fresh local RTDB emulator rerun was blocked by the machine's existing Java
  loopback-selector failure; prior focused emulator proof and live rules
  readback remain available. Authenticated Studio browser workflow remains
  unverified in this release smoke check.
