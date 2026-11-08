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

- Focused candidate verification passed 11 Reading V2 files and 310 tests.
- The merged checkout is clean at source commit `2949f194`.
- Production deployment is **not yet released**. The fresh release-safety
  assessment is `UNVERIFIED` because the merged candidate also contains
  post-production Worker, backup-worker, migration and Firebase-rule changes
  requiring their separate provider evidence and compatibility review. No
  deployment gate was bypassed.
