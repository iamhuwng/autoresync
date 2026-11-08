# Reading V2 Auto V4 publication

Changelog ID: `CL-20261104-READING-V2-AUTO-V4-PUBLISH`
Master entry: [Master Changelog](../master_changelog.md)

## Problem

Reading V2 Auto V4 drafts could retain stale import-acceptance and draft-validation
messages that blocked publication. The initial correction bypassed every Auto V4
source blocker, allowing an incomplete generated test to reach persistence.
Full-test passage extraction also indexed an interaction array by string IDs,
silently undercounting questions with multiple answer slots.

## Change

- Clear generic acceptance markers while preserving custom-instruction warnings.
- Persist genuine source-review blockers in canonical draft validation so saving
  and reopening cannot bypass them; recompute editable draft validation.
- Keep Auto V4 Studio edits instead of offering destructive import reacceptance.
- Correct passage interaction lookup and multi-answer counts; tolerate absent
  optional review labels in the affected client paths.

## Verification and publication

- Main integration passed 262 focused authoring/runtime tests.
- The exact live-based Hosting candidate passed 261 focused tests, isolated
  production build, bundle budget, local-value scans, and guarded assessment.
- Production source: `f294ec80abc1cb94d33a29aa3d11a5df0c0a7d48`.
- Hosting version: `5a72ee8a355cd518`, released 2026-11-04 18:25:49 Asia/Bangkok.
- Guarded post-publication asset checks and separate manifest/provider readback
  passed. [Release evidence](../../release-audits/2026-11-04-reading-v2-auto-v4-publish.md).

Browser verification was waived by the user. Source-fidelity findings currently
require a corrected import; normal draft edits do not clear them. Worker/rule
deployment and broad student-submission qualification were outside this release.
