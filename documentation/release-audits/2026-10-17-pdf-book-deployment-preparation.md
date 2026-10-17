# Deployment preparation and stable-source audit — 2026-10-17

**Subsequent implementation:** a separate local candidate now exists on
`codex/live-baseline-reconstruction-20261017`. It includes the historical source
reconstruction, restored reviewed AI gateway, existing release-safety/local
isolation tooling, live-derived backend rules, and ordinary notification
readiness checks. The current status and remaining browser/environment/source
binding gates are recorded in that branch's
`documentation/system/maintenance-baseline-20261017.md`. The inventory below
records the original checkout and dated research; it is not a claim that the
candidate has been promoted or deployed.

**Final local qualification:** the candidate passed normal minification/bundle
budget, focused AI/notification/Worker/rules checks, and teacher/student browser
notification consumption with read persistence. Admin AI metadata rendered
through an authenticated local gateway stub. The final local-isolation/release
guard run passed 53/53. See `2026-10-17-candidate-acceptance.json` for content
fingerprints and limits; these checks do not establish deployed backend
compatibility, exact historical source identity, or production readiness.

## Decision and current result

The owner selected **current live application first; ongoing PDF Book work stays separate**. Do not merge the dirty Book checkout into `main` or treat the branch name as deployment evidence.

`main` is intended to be stable, but is not synchronized with production:

| Surface | Observed revision/state |
| --- | --- |
| GitHub default branch | `main`, public repository `iamhuwng/autoresync` |
| Remote `main`, verified with `git ls-remote` | `3d72f11cda77b5f5aa5791c86b154744c1926fec`, 2026-08-23 |
| Local `main` | `42574e740e7c036cbff248f87abdcea2fec467ff`, 28 commits ahead of remote; principally student feedback/dashboard additions |
| PDF Book checkout HEAD | `422b7323f85a5b235d387cd18b25a1b9f63df46a`, `codex/prd0062-continuation-after-cleanup` |
| Remote Book branch | `e6b78d91`, 54 commits behind local HEAD |
| Current versus remote `main` | 379 current-only and 7 main-only commits |
| Current versus local `main` | 379 current-only and 35 main-only commits |
| Working checkout at initial audit | 591 modified + 11 deleted tracked paths; 942 collapsed untracked status entries, representing 25,559 untracked files |
| Live Hosting | `temp-a1437` / `kahut1`, version `10039da56ea1c0ae`, released **2026-10-06 14:08:57.107 Asia/Bangkok**, 458 files |

`npm run branch:doctor -- --strict` flags main drift and the dirty checkout. `npm run tooling:doctor` found no missing required tools, with eight cleanup warnings. No pull, reset, stash application, remote push, production deployment, or data mutation was performed for this audit.

## Evidence method and limits

Research window: September 17–October 17, 2026, Asia/Bangkok. The local conversation index identified 83 main Codex conversations associated with the LuyenTap checkout and updated in that interval. Four independent research agents examined the relevant feature, notification/AI, recent runtime/deployment, and Git-baseline histories. This is an inventory plus targeted deep review, not a claim that every message in every chat was reread. Archived conversations and superseding release turns were included where relevant. Unrelated IELTS grading and tool-account conversations were excluded from the application feature inventory.

Current remote observations:

- GitHub repository/default branch and remote branch SHA read directly.
- Firebase Hosting releases and all 458 version-file records read directly through the authenticated Hosting API. The initial quota-project 403 was resolved for this read by adding the request header `x-goog-user-project: temp-a1437`; no account configuration or service was changed.
- Entry `/assets/index-CCrorz1s.js`: 263,583 decoded bytes, SHA-256 `46ee160517e411191840347278dfb9eaf9ca8d675eb5859df21a5c99b7c263f1`, matching the retained October 12 capture.
- All **393 application JavaScript assets** were fetched from the current site and matched the Hosting version hashes after gzip level 9, the upload hashing format. Static markers are artifact evidence, not authenticated browser behavior or a source-to-build proof.
- `/.well-known/luyentap-release.json` currently returns HTML, not a release manifest. The deployed artifact has no verified Git/tree binding.
- Worker versions and rulesets below are dated historical deployment evidence unless explicitly marked otherwise. This audit did not refresh all provider configurations or authenticate student/teacher browser flows.

The accompanying `2026-10-17-hosting-marker-observation.json` retains only asset names, hashes, and booleans. Credential values and downloaded bundle contents are not retained there.

## Non-Book changes still requiring integration, release, or reconciliation

| Work | Actual status | Required next action |
| --- | --- | --- |
| Direct-student homework UID normalization | `r2-backup-worker/src/homework/assignments.ts` has a small uncommitted fix mapping class-member keys to Auth UIDs and a regression test. October 6 chat contains frontend Hosting releases but **no Worker release evidence for this fix**. | Keep as a separate pending backend change. Verify current Worker source/version before releasing; do not assume Hosting shipped it. |
| Local Firebase isolation and persistence | October 8–12 local-only work: local dev/Worker orchestration, emulator checks/recovery, one-way live-to-local import, detached launchers, and production-env guards. Several required scripts are still untracked while `package.json` references them. | Integrate a complete scripts/callers/tests/documentation set; do not commit emulator snapshots or machine secrets. Establish a documented fresh-clone initialization path. |
| Release-safety tooling | Clean local branch `codex/release-safety` at `50a5d55ef8acfb53109187cfa135aba8867f5e12`; 51 commits after `422b7323`, not published. Includes source/file manifests, provider observations, hotfix-retention checks and clean-source production guards. Canonical checkout lacks it. | Reuse this existing tooling in the maintenance baseline; do not replace the app wholesale with that branch. It lacks independently deployed application fixes. |
| Secure AI gateway preservation | September 28 gateway migration and retry were deployed from `codex/ai-secure-hosting`, latest `781dedcc`. The October 6 stash and current canonical source still use browser provider keys. Current live assets contain direct provider hosts, browser key-env names, an embedded Groq-credential-shaped literal, and **no `/ai/keys`, `/ai/gemini`, or `/ai/groq` route markers**. | Treat as a current deployment regression requiring reconciliation before stable promotion. Restore the reviewed gateway client/rules/config contracts in the candidate, verify against the currently deployed gateway, and handle exposed credentials through a separately authorized operation. Credential validity was not tested. |
| Seven `origin/main`-only Listening cleanup commits | Current Book/release-safety ancestry omits `db6845c5`, `6658ddf8`, `bdd35ec3`, `653f7c92`, `ba2c7835`, `69754098`, and merge `3d72f11c`. Includes raw-key tombstone protection and dormant cleanup defaults. | Review and retain the applicable net changes. Missing ancestry alone does not prove every behavior is absent or that it was deployed. |
| Local-main feedback/dashboard additions | Local `main` has 28 unpushed commits, mostly static student feedback and design artifacts. These are neither a deployable application reconciliation nor automatically disposable. | Inventory separately; retain owner-approved useful static content without merging it blindly into the live-app reconstruction. |
| Current shared editor/homework/class/library changes | Dirty non-Book paths include THCS modal/autosave, Reading stimulus uploads, material discovery, class lifecycle, and homework hooks, mixed with Book integration. Some are already live. | Compare each net change with the October 6 source snapshot. Do not label every dirty path undeployed or copy all current shared files into the maintenance baseline. |
| IELTS grading skill changes | Significant agent-skill work is present in the same repo, separate from product Hosting. | Preserve separately from application deployment scope. No new skill benchmark or qualification was run here. |

**Security observation:** the public October 6 bundle includes a literal `VITE_GROQ_API_KEY` value with a 56-character Groq credential shape. No value was printed or saved in the audit. Whether the credential is still active is unknown. A source-only cleanup cannot remove an already exposed credential from historical assets or revoke it.

## Already shipped work — avoid counting it twice

| Area | Evidence and qualification |
| --- | --- |
| Reading V2 submit/result navigation | `c7d2e446` + course-style repair `422b7323`; October 6 current Hosting `10039da56ea1c0ae`. |
| Homework default Latest sort | `30e0c010`; October 6 Hosting `7183dacbe48a083f`, superseded by the current release. Loading-race/modal fixes were copied from dirty frontend source; they remain uncommitted. |
| Teacher Lobby pagination/footer | September 30 actual Hosting/rules/index releases; live pagination proof. `423bf7a7`, `cf464ce3`. |
| THCS import wizard, modal layering/performance/edit hydration, text/image fallback | September releases with execution evidence. October 6 stash contains `supportsVisualText`, clipboard support, and `imageCaption` validation, despite their absence from an earlier September 30 release copy. |
| Reading V2 scoring/band calculation | Scoring Worker version `9f3e98a7-bcff-4e16-9f22-47dd5504dbc5` historically deployed September 30. Current live `readingV2ResultAdapter.service-B8WtC2VH.js` imports the scoring-config helper and computes `bandScore` from it. The frontend correction is present now. |
| Reading child-passage summaries | `a61dd29c`; September 30 actual Hosting release and nine-passage readback repair. |
| IELTS chart/Reading/Listening image uploads | September 29–30 Hosting plus CORS Worker release. Current dirty `r2Storage.ts` matches the retained September 30 deployed-source copy; dirty does not mean pending. |
| Student private THCS homework access | September 26 Firebase rules and backup Worker `1cc77fd3-ea46-41c4-b283-38c90e540a80`; student opened 155 questions. |
| Shared ordinary notifications | October 2 Hosting `8d6d04a7b3774764`, notification host `541166ae-93db-4d92-8eda-5fb291325b42`, public wrapper `5696e963-c5ed-463d-a495-30db3c07bc98`; four recovery notices and Cron retirement. Subsequent source integration `407fc610` is in October 6 ancestry. |
| Writing recovery/committed notices | `35117da1` is an ancestor of October 6 HEAD; view/service blobs equal the retained October 6 stash and current source. Earlier October 3 'not deployed' statements were superseded by the October 6 shared-source Hosting release. This is strong inclusion evidence, not a newly exercised live Writing journey. |
| Homework reset permission repair | October 1 chat records successful live resets after rules coordination; user attempts were left unchanged. Notification rules/version history provides dated backend context. |
| Malformed homework assignment record | September 28 live QA-record cleanup restored the homework list. This was a data repair, not a pending code release. |
| Reading review labels, student library reads/enrollment | September 22–23 successful Hosting/rules executions and live/static verification. |

## Stable baseline reconstruction

No inspected existing branch can honestly be called the exact current stable source:

- `origin/main` is stale and local `main` has unrelated unpushed content.
- `485aeeab5eb06b250d08f6cf1c5086dc2af021a6` and `422b7323` have the same tracked tree, `1c3ea0666ffb6374fe057a3db81c3f197b11a76a`, but the successful October 6 release also included dirty/untracked source.
- `hocthem-stable-source-live-candidate-485aee.zip` lacks the later local Firebase/deploy scripts and the guide that the October 12 chat claimed was included. It is a historical source candidate, not a complete safe development baseline.
- `codex/release-safety` is reusable tooling, not a production-preserving app merge.

The strongest historical source reconstruction uses:

1. Tracked tree `b73eb1fa65c205fc4cdb35f22fd97414c5b86c49`, based on `422b7323`, captured October 6 at 11:06:10 local.
2. Its untracked tree `c2c178866d50e02fc623a49aa3e06fe9f333732d`.
3. Missing eligible source files from earlier stash untracked tree `bd4fc024f7be133c46e9bd9c251474a1e72bedd9` (`766c2d4a^3`), matching the recorded 'restore only if absent' operation.

The final deployed directory `C:/Users/The Lord/repos/luyentap-prd0062-live-candidate` was removed after deployment; only a dependency junction remains. Source may have changed concurrently between 11:06 and the final approximately 14:01 copy. Therefore reconstruction is a **candidate**, not byte-identical provenance. Already deployed historical Book source is frozen in that candidate; newer October 8–17 Book work remains in the original checkout.

Promotion sequence: reconstruct and commit the candidate; reconcile gateway and applicable Listening/live hotfixes; integrate existing release-safety tooling and complete local isolation; validate clean-source build and representative teacher/student flows; then publish an owner-approved stable branch/tag or main update. Production bootstrap, provider/rules changes, and credential operations remain separate from source preparation. Do not bypass missing production provenance by editing an assessment receipt.

## Checks run in this audit

- Direct GitHub/main and Firebase Hosting metadata/asset readbacks above.
- Current canonical hook/client regression check: **2 files / 16 tests passed**, `useHomeworkSubmission.test.ts` and `homeworkAssignmentClient.test.ts`. This does not test the reconstructed candidate or prove Worker deployment.
- Existing isolated release-check tests: **21/21 passed**. Fixtures prove assessment behavior, not production compatibility.
- Repository tooling doctor: **0 missing required tools**, 8 warnings.
- Strict branch doctor: flags known source drift/dirty state; this is not an application test failure.

No production build, provider mutation, authenticated browser acceptance, full test suite, credential validity probe, or stable-main promotion is claimed by this report.

## Conversation sources

Relevant exact titles and thread IDs (titles are those returned by the app):

- **Locate live hocthem.net source** — `01a1320d-48e6-78d3-8bb6-a33be9301877`.
- **Investigate Reading V2 submit issue** — `01a10ef5-ffa6-7ca1-b405-d12d68324701`.
- **Fix missing Reading V2 homework** — `01a10f03-ec98-73e3-8f40-c77afda23e10`.
- **Fix homework reset permission error** — `01a0f819-967b-7080-9b33-e08c14f8fe9b`.
- **LuyenTap — Safe Deployment, Localhost Isolation, and Indepe…** — `01a12497-a99b-7d80-aaa7-e60bf1fded2e`.
- **Have we install local database so that our changes won't af…** — `01a11ad7-ee35-78a2-ba23-4de1bbb6ecb4`.
- **Stabilize PRD0062/63 environment** — `01a12c13-61be-7732-99c9-d554fef44ddc`.
- **Complete AI-key security migration** — `01a0e714-0a25-78d1-a275-746f2bd656d0` (supersedes **Complete secure AI key gateway release**, `01a0d3fb-da05-7f63-a031-71e682ce9438`).
- **Fix class join notification** — `01a0ce28-2c56-7c52-b758-340e83143402`.
- **Implement notification upgrade — rotation…** — `01a0f750-d006-7fd1-896a-419270736ff3`, archived predecessor `01a0e23c-2d4e-7a42-a63c-fb2b294cb8d1`.
- **Bound Teacher Lobby listings** — `01a0ee10-9b8f-75c3-ad14-ae2b549d9693`.
- **Fix Reading V2 auto grading** — `01a0efde-3261-7d73-8407-ad236ea2d47c`.
- **Simplify THCS import flow** — `01a0efe7-b8d6-71a2-9c2a-b24cfc6c5dc7`.
- **Fix student homework permission** — `01a0dec4-f605-76e3-9085-6821bbe22196`.
- **Fix Reading V2 passage publishing** — `01a0eddd-e03e-7ee3-bbca-381322191c7f`.
- **Add text fallback and image paste** — `01a0e72d-ab04-7c22-a088-a72ca21c3c97`.
- **Fix homework assignments fetch error** — `01a0e715-ef12-7ef3-8e4a-d100c7a1a7aa`.
- **Fix IELTS chart image uploads** — `01a0e9ee-fd9a-7e62-9c7b-e93a7b616515`.
- **Fix Reading V2 displayNumber crash** — `01a0c9d2-e93d-7bd3-8818-9c2706403be5`.
- **Fix Reading V2 publish error** — `01a0c9f2-99a6-7ee1-9478-bd5589d5539e`.
- **Fix student library permission error** — `01a0cda1-9a29-7762-abb8-f60411aae6f3`.
- **Review Comment 1 and 2 inputs** — `01a0cdfb-8ad1-7991-9195-b2dc0267e735`.
- **Fix studio lag and delete modal** — `01a0cf3e-8059-7fc0-b2b5-782e25f61477`.
- **Fix THCS AI key parsing** — `01a0ce26-9c3e-7f23-a55e-30d8be9a07a2`.
- **Fix THCS test publishing in Edge** — `01a0dbfc-49e4-7592-bc48-384264335713`.
- **Investigate Reading V2 disablement** — `01a0e904-1cf8-7fc2-b5e0-25548ffeeb93`.
