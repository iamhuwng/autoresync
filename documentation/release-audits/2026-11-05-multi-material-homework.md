# Multi-material homework Hosting release — 2026-11-05

Status: **Published and verified through native Hosting readback.**
Feature history: [CL-20261105-MULTI-MATERIAL-HOMEWORK](../architecture/changelog/multi-material-homework-2026-11-05.md).

## Source and publication

- Target: Firebase `temp-a1437`, Hosting site `kahut1`, https://kahut1.web.app.
- Verified prior source: `f294ec80abc1cb94d33a29aa3d11a5df0c0a7d48`.
- Deployed source: `71d6caa0481fdf5ca2b128a09488bf8c71d73865`; tree `49e564d69df033855b1a125d08bd098f382e01aa`.
- Scope: the client feature, serialized THCS notices, and release-branch CI coverage. No Worker, Firebase rules, database or migration deployment occurred.
- Live provider version: `e5858cfe6121f3d1`, released 2026-11-05 14:42:23 UTC.
- Guarded deployment finished with exit code 0 at 14:44:23 UTC. Shared changelog intent `91ceb304-4b06-4de3-8d23-c95d02fe22ae` records `published`, verification `passed`.

## Evidence

- The unchanged native hotfix checker returned `PASS` for the clean source, actual live base, production environment fingerprint, independent compatibility review and nine inherited-hotfix reconciliations.
- Local assessment: `tmp/release-receipts/mixed-homework-71d6caa0-predeploy.json`; review: `tmp/release-receipts/mixed-homework-71d6caa0-compatibility.json`.
- [Exact-source Release Safety CI](https://github.com/iamhuwng/autoresync/actions/runs/42044546609): all three jobs passed, including access-rule checks, notification tests and a clean-clone app build.
- Full component/service run for initial client candidate `c61f47f9`: 112 passed and one PDF Book setup failure. That same failure reproduced on untouched live base `f294ec80` (one test run, 62 skipped); it predates this hotfix. The final notice fix was then checked by focused tests. Logs: `tmp/mixed-homework-candidate-tests.log`, `tmp/mixed-homework-baseline-book.log`.
- Final focused batch/retry/notice set: six passed. Release/deployment safety: 78 passed. Touched-source lint, UTF-8 and whitespace checks passed.
- The guarded build passed bundle budget and local-value scans. Its post-publication observer verified the full served manifest and file hashes.
- Independent readback confirmed the new revision/tree, finalized provider version and matching hashes for the index, HomeworkCreateModal and TeacherLobbyPage bundles. The bundles contain the embedded THCS form, next-material action and incomplete-notice warning. Summary: `tmp/mixed-homework-postdeploy.json`.

## Backend observations

Read-only observations established compatibility; these services were not deployed:

- Homework Worker: `3b966806-0b31-405f-bc33-b7f1ac6a6557`, 100% traffic, module SHA-256 `fd4d41dac99ac574e8004cf670496747c0f906f4ac0fbcb5e5e9f25e1c3d13cf`.
- Notification command: `7f4edb63-4727-4d0c-9e46-ade6dd51a602`; adapter: `5696e963-c5ed-463d-a495-30db3c07bc98`. The live command supports committed THCS events and exact idempotent notice replay.
- Two RTDB rule reads matched canonical SHA-256 `99b1f7ec32f8e94c0cf176e420aae8d2c1606056acc7404f69198baabbe7b520`. Firestore ruleset: `projects/temp-a1437/rulesets/fbd67e85-0ea9-4e86-a351-df53fb6ca796`; canonical source SHA-256 `b02c642769937926ee4b879357a7d16fb2ca4665b382f935117dca93ec0fae82`.

The older Homework Worker inventory entry records a different qualified artifact. This release did not establish the exact Git/build provenance of the newly observed Worker, so it does not relabel that older qualification as current-source proof. The actual provider observation above governs this compatibility review.

## Failed attempt, recovery and limits

The first attempt finalized version `aeceb59102b38259`, but activation failed with HTTP 400 because the generated message exceeded Firebase's 255-character limit. Independent readback confirmed prior version `5a72ee8a355cd518` remained live. The supported source-bound changelog mechanism supplied a 113-character message, and the same guarded route revalidated and published the retry. First intent `d4c3d82b-715d-4da0-8a97-543c11de23db` remains unconfirmed; the successful retry has its own record.

The prior Hosting version is the recovery reference; rollback was not rehearsed. Hosting recovery does not reverse assignment or notification writes.

The in-app browser host was unavailable, so authenticated browser behavior and real-recipient inbox delivery remain unverified. THCS notices retain existing best-effort limits and now warn on incomplete delivery. The earlier main-branch StudioShell line-budget policy failure is outside this live-based hotfix; no new exception or full-main qualification is claimed.
