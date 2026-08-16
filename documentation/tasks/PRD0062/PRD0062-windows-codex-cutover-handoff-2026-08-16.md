# PRD0062 Windows Codex Cutover Handoff — 2026-08-16

Status: **READY FOR GIT CHECKPOINT → FRESH NATIVE WINDOWS CLONE**

Purpose: make the active PRD0062 implementation and completion state fully available to Codex App on Windows without any dependency on the WSL checkout or WSL-local Codex session state.

## 1. Current WSL source checkout

- WSL path: `/home/iamhuwng/worktrees/prd0062-production-normal-20260813-v2`
- Branch: `codex/prd0062-production-normal-20260813-v2`
- Pre-cutover HEAD: `4f31975ed057c84c81f953b8547984c8d7b30869`
- WSL Git `origin`: `/mnt/c/Users/The Lord/Desktop/luyentap/.git`
- No upstream branch is currently configured for the WSL branch.

The native Windows repository at `C:\Users\The Lord\Desktop\luyentap` has GitHub remote:

`https://github.com/iamhuwng/autoresync.git`

That Windows checkout is heavily dirty with unrelated work and MUST NOT be switched to the PRD0062 branch for this migration.

The cutover target is a **fresh native Windows clone in a new directory** after the PRD0062 branch has been checkpointed and published to GitHub.

## 2. Current production/browser state

Near-term browser milestone: **READY FOR USER BROWSER HANDOFF**.

Current deployment/readback reported after final release gate:

- Cloudflare Worker: frozen v121 active at 100%, deployment/version identity `a292d525-fc92-40a1-bc75-223be5370472`.
- Safe v119 baseline was restored/read back before v121 activation.
- Hosting live release: `1786776962987000`.
- Hosting finalized version: `78a42227163a9276`; frozen artifact hashes matched.
- Firestore rules: `fe84ef31-a849-4f2a-a221-0947b24f5775`.
- RTDB activation SHA: `e16df0c49724ca9a5f1c4fe886115f5b3ef3ddc5fe7bedf0a92d433454feca2f`.
- Durable Book Homework state: root revision 7, authority revision 2, Delivery revision 1 active, compatibility shell present.
- No assignment replay occurred during the final browser handoff release.

Browser result:

- Teacher: PASS — Book Homework detail, trusted pilot student row/progress, no legacy stats crash.
- Student: PASS — Homework discovery, Book detail/progress, no legacy `Start Homework`, `Open Book Activities`, usable real Runtime Activity.

Recovery mode is complete for the representative M1 path. Do not reopen generic adapter/recovery architecture unless a demonstrated regression requires it.

## 3. Governing PRD0062 state after handoff

Read these before new implementation work:

1. `documentation/tasks/PRD0062/PRD0062-architecture-and-delivery-amendment-2026-08-15.md`
2. `documentation/tasks/PRD0062/PRD0062-production-normal-recovery-and-completion-plan.md`
3. `documentation/tasks/PRD0062/PRD0062-book-homework-bridge-contract.md`
4. `documentation/tasks/PRD0062/remaining-implementation-reconciliation-2026-08-04.md`
5. `documentation/tasks/PRD0062/traceability-book-activity-v1.md`
6. `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

Next workstream:

> **remaining PRD0062 acceptance delta**

not:

> **Book ↔ Homework adapter completion**

The first Windows Codex task should reconcile the current 112-ticket ledger against current source/evidence/deployed behavior, update #126 from the successful production/browser result, and identify the next real owner before implementation.

## 4. What must migrate through Git

The migration checkpoint must include:

- all intentional tracked modifications in the WSL PRD0062 worktree;
- current PRD0062 source additions under `src/**` and `cloudflare/src/**`;
- current rules/fragments/generator changes;
- current focused/regression/rule-enforced tests;
- PRD0062 architecture/recovery/bridge/traceability/reconciliation docs;
- append-only #126 evidence intended as durable repository evidence;
- current deployment configuration files that are part of the reviewed/reproducible release state; and
- the two production-shaped test fixtures still imported by the final rule-enforced M1 emulator test:
  - `tmp/prd0062-bridge-m1-committed-state-fixture.json`
  - `tmp/prd0062-converged-publication.json`

## 5. WSL-local artifacts that MUST NOT migrate

Do not stage or publish:

- `cloudflare/.wrangler/**`
- `cloudflare/tmp/**`
- root `tmp/**` except the two exact M1 fixtures named above
- local emulator databases/caches
- generated dry-run Worker bundles/maps
- downloaded browser/runtime libraries
- local CLI auth/session state
- `.env*`, `.dev.vars*`, Firebase/Wrangler/gcloud/GitHub credentials or tokens

Also exclude these superseded diagnostic-only files from the migration checkpoint because they depend on WSL-local recovery fixtures and are not the final accepted rule-enforced proof:

- `cloudflare/test/fixtures/book-homework-workerd-key.mjs`
- `cloudflare/test/book-homework-production-command-reproduction.test.ts`
- `cloudflare/test/book-homework-v17-production-composition.workerd.test.ts`
- `cloudflare/test/book-homework-current-production-composition.workerd.test.ts`
- `cloudflare/vitest.book-homework-v17-workerd.config.mjs`
- `cloudflare/vitest.book-homework-current-workerd.config.mjs`
- `cloudflare/wrangler.book-homework-v17-workerd.jsonc`

The final accepted rule-enforced M1 gate is:

- `cloudflare/test/prd0062-m1-rule-enforced-composition.emulator.test.ts`
- `cloudflare/vitest.prd0062-m1-rule-enforced-composition.config.mjs`

That gate generates its service keys at test runtime. It still consumes the two exact committed test fixtures listed in §4, so those two fixtures must be included in Git.

## 6. Git cutover sequence

Because repository guidance prohibits broad `git add .` / `git add -A`, stage deliberately.

In WSL:

1. inspect `git status --short` and `git diff --check`;
2. stage tracked modifications with `git add -u`;
3. explicitly stage intended new source/tests/docs/evidence/config files;
4. explicitly stage only the two required root `tmp` fixtures;
5. verify the superseded diagnostic/private-key fixture paths in §5 are not staged;
6. inspect `git diff --cached --check` and the staged name list;
7. create one PRD0062 migration checkpoint commit;
8. push that branch into the Windows repository Git database (the current WSL `origin`), without checking it out in the dirty Windows working tree;
9. from native Windows Git, push that branch ref to `https://github.com/iamhuwng/autoresync.git` without switching the dirty Windows checkout;
10. verify GitHub branch SHA equals the WSL checkpoint SHA.

Then create a fresh native Windows clone in a new folder and check out `codex/prd0062-production-normal-20260813-v2`.

The fresh Windows clone, not the existing dirty `C:\Users\The Lord\Desktop\luyentap` checkout and not the WSL UNC path, becomes the Codex App source of truth.

## 7. Windows Codex App first instruction

Use this after opening the fresh native Windows clone:

> Continue PRD0062 from this native Windows repository. This clone is the authoritative post-WSL cutover source. Do not use or reference the former WSL checkout.
>
> First verify the checked-out branch is `codex/prd0062-production-normal-20260813-v2`, the working tree is clean, and HEAD matches the migration checkpoint/GitHub branch SHA.
>
> Read `documentation/tasks/PRD0062/PRD0062-windows-codex-cutover-handoff-2026-08-16.md` and the governing documents it names before acting.
>
> Production-normal/browser handoff for #126 is complete and passed teacher/student/Runtime verification. Do not reopen recovery or generic adapter work without a demonstrated regression.
>
> Next objective: reconcile the remaining PRD0062 ticket/acceptance delta against current source, evidence, accepted amendments, and deployed behavior; update #126 accordingly; identify the next actual owner before implementation.

## 8. Credentials on Windows

Do not migrate Linux credential stores or tokens into Git.

Reauthenticate natively on Windows only when needed for future work (GitHub, Wrangler/Cloudflare, Firebase CLI, gcloud/Google, etc.). Credential recreation is operational setup, not PRD0062 product source.

## 9. Cutover completion condition

The WSL checkout can be retired from active use when all of the following are true:

- WSL migration checkpoint SHA is known;
- the same branch SHA exists on GitHub;
- a fresh native Windows clone checks out that exact SHA;
- the Windows clone is clean immediately after checkout;
- required dependencies install natively on Windows from lockfiles;
- the final rule-enforced M1 test fixtures are present in the clone; and
- Codex App can read the governing handoff/PRD0062 documents and run repository tests without referencing WSL paths.

## 18. Append-only #126 acceptance reconciliation — 2026-08-16

This addendum preserves the cutover record above but supersedes its current
readiness interpretation for execution. The latest committed #126 evidence is
more recent and more specific than the earlier handoff summary.

- The current source checkpoint is branch
  `codex/prd0062-production-normal-20260813-v2` at
  `f103cd2e4cc4cc8d16705c6e1f7cb61f08a83eab`. The integrated Book Homework
  task commit changes the Cloudflare test dependency/lock boundary only; this
  reconciliation changes no production source.
- The rule-enforced M1 composition freeze remains valid local/emulator proof:
  3 composition tests passed, followed by the focused 23-test route/saga,
  22-test teacher progress/cache, and 65-test student discovery/detail/
  locator/Runtime suites. It proves the bounded read/launch composition and
  no unintended mutation; it does not by itself close the browser gate.
- The latest browser evidence is
  `evidence/126-production-normal-bridge-m1-student-shell-membership-browser-failure-result-2026-08-15.json`.
  It records committed root revision 7, authority revision 2, active Delivery
  revision 1, active membership `2NE3KY`, and zero assignment commands. The
  teacher Book detail rendered, but the trusted student row did not become
  visible within 30 seconds. Student, Runtime, and ordinary Homework were not
  run after that failure. Its disposition is `NOT READY FOR USER BROWSER
  HANDOFF`.
- The same evidence records Worker activation v121 at 100% and says the v119
  rollback could not be redeployed because the Wrangler OAuth refresh
  credential rotated. Therefore the earlier “v119 restored” statement is
  historical, not current rollback/readback proof.

The current #126 decision is therefore **incomplete and blocked by a concrete
teacher trusted-projection/browser boundary plus deployment rollback/readback
reauthorization**. Retain the ledger status
`BLOCKED_DEPENDENCY_AND_APPROVAL`; do not classify #126 as fully accepted,
closed, or administrative-only. The next diagnosis must reproduce the missing
student-row failure in the rule-enforced default Worker composition. Only if
that reproducer goes red should the owning Book-side projection composition be
changed, preserving authoritative assignment identity, fail-closed identity
checks, and explicit unavailable derived completion.

`#128 / 51B1` remains held: its positive activated workflow still requires
#126 activation/readback and the corrected #127/51A acceptance artifact. A
fresh M1 attempt that failed with `SOURCE_MIRROR_FAILED` because the Windows
environment exhausted disk is an environment/harness attempt only; it does
not replace the exact-commit M1 evidence above or indicate a product
regression.
