# Reading V2 Auto V4 Hosting release — 2026-11-04

## Source and scope

- Reviewed main integration: `4ddd2a1b2870df94aa25d338a82d1e97946f8d39`.
- Independently observed live base: `7d9a6a8e47581a4e462ae9839d53b23977f44163`.
- Deployed candidate: `f294ec80abc1cb94d33a29aa3d11a5df0c0a7d48` on
  `codex/reading-v2-publish-release-20261104`.
- Candidate tree: `d8a4f3453f13a648bda29958c561a3663fd6f3ca`.

The release candidate applies the reviewed Reading correction to the verified
live source. It preserves prior passage, table-runtime and Writing hotfixes and
avoids deploying unrelated main/backend work. Firebase rules, Worker code,
deployment configuration and dependencies are unchanged from the live base.

## Evidence

- Main integration: 262 authoring/runtime tests passed.
- Exact release candidate: 261 focused tests passed; isolated production build,
  bundle-budget and local-value scans passed.
- Native hotfix assessment: `PASS`, receipt
  `tmp/release-receipts/reading-v2-publish-qualified.json`.
- Compatibility review:
  `tmp/release-receipts/reading-v2-publish-compatibility.json`.
- Production environment SHA-256:
  `8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57`.
- Browser verification was explicitly waived. The unchanged Worker's handling
  of empty review labels remains outside this publication-focused qualification.

## Publication

- Site: [kahut1.web.app](https://kahut1.web.app), Firebase project `temp-a1437`.
- Prior Hosting version: `7aa139d3a0dc6ee9`.
- Published version: `5a72ee8a355cd518` at `2026-11-04T11:25:49.157Z`.
- Guarded release record: `a34d4e40-59fa-45c3-baaa-e1728e34b9d9`.
- The guarded deployment exited successfully, verified all manifest-listed
  deployed asset hashes, and recorded publication with verification passed.
- Separate manifest/provider readback at `2026-11-04T11:29:05.240Z` confirmed
  the exact candidate, tree, environment fingerprint and provider version.
- Manifest SHA-256: `215c8e85aeda965fd7908268dff0c4594aac097286a17390688e79eadc475752`.
- Generated native readback: `tmp/reading-v2-publish-release/publication.json`.

The first activation attempt was rejected by Firebase because its generated
release message exceeded 255 characters. A supported, source-bound 135-character
pending changelog entry fixed the retry; no deployment safeguards were bypassed.
The failed attempt's logs remain under `tmp/reading-v2-publish-release/attempt-1*`.

Source-fidelity blockers require a corrected import. This release performs no
data migration, rule change or Worker rollout. Hosting recovery can restore the
retained prior version; it would not reverse any later database writes.
