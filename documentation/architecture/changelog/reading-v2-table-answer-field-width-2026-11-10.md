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
- The production source was recovered and retained locally at
  `refs/heads/recovered/production-23ae29a7`.
- An isolated candidate was prepared from the exact deployed revision
  `23ae29a79f816b27a551071345d700988b043bc7` as `04d9fb5c19629fc88451f6d8e033f3195e471027`.
- The isolated candidate passed 75 runtime/CSS tests and 87 import/grouped-answer
  tests; its final tree is `178ba8f9505d3073a04f0d6759ee35de5eaf155d`.

## Release status

The live Hosting manifest was independently matched to production revision
`23ae29a79f816b27a551071345d700988b043bc7`, tree
`d4dfd19cf7fa94098ab7d5ddb2b0ed9a73e7f216`, and observation fingerprint
`46f7dd467389485548637c49133b71ba6eec4b024a7b464c08be360f91e0c5b2`.
An independent compatibility review verified candidate
`04d9fb5c19629fc88451f6d8e033f3195e471027` against base
`23ae29a79f816b27a551071345d700988b043bc7` and the observed production
fingerprint. It confirmed unchanged Worker endpoints, Firebase permissions and
configuration, runtime contracts, and dependency manifests. The guarded
assessment returned `PASS`, including all historical hotfix reconciliations.

The isolated candidate was deployed through the guarded Hosting route. The live
manifest now reports revision `04d9fb5c19629fc88451f6d8e033f3195e471027`, tree
`178ba8f9505d3073a04f0d6759ee35de5eaf155d`, and production environment
fingerprint `8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57`.
The post-deploy full file/hash observation passed; Firebase provider version
`ba91b4cfa8c09eaa` was released at `2026-11-10T05:47:55.283Z`.

The in-app browser authenticated the student session and opened the current
Homework assignment `Selected Reading Passages` through the supported
student flow. Its `Resume Attempt` route loaded the live Reading V2 runtime,
displayed table questions 4–7, and accepted the unsent value `wholesalers` in
question 5 on the phone layout. The direct deep link initially returned
`Error Loading Test`, but the same assignment loaded correctly from Homework
details. The candidate CSS was also verified in a focused desktop/phone
browser preview before deployment.

The recovered commit was absent from `origin`, which exposed the source-retention
gap. The minimal fail-closed follow-up is to require an independently durable
release ref for the exact source revision before deployment, verify that ref in
the release preflight, and record its name in the Hosting manifest and receipt.
This remains a release-control follow-up; it does not require redesigning the
application or automatically pushing to a remote.
