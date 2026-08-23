# PRD0062 Windows Codex Cutover Handoff — 2026-08-16

Status: **HISTORICAL CUTOVER RECORD — CURRENT AUTHORITY IN SECTIONS 20-21**

Purpose: make the active PRD0062 implementation and completion state fully available to Codex App on Windows without any dependency on the WSL checkout or WSL-local Codex session state.

Active authority note: Sections 1-19 preserve the cutover chronology, including
deployment/browser claims later contradicted by more specific evidence.
Sections 20-21 are current and supersede those claims without deleting history.

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

Historical first instruction, superseded by the append-only evidence in §18
and the Phase 1 consolidation in §19. It is retained as cutover provenance:

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
#126 activation/readback. The corrected #127/51A acceptance artifact is already
present and is no longer a blocker. A
fresh M1 attempt that failed with `SOURCE_MIRROR_FAILED` because the Windows
environment exhausted disk is an environment/harness attempt only; it does
not replace the exact-commit M1 evidence above or indicate a product
regression.

## 19. Historical Phase 1 Windows convergence completion — 2026-08-20

Status: **COMPLETE — WINDOWS AUTHORITATIVE**

The native checkout at
`C:\Users\The Lord\Desktop\luyentap-prd0062` was advanced from
`cc1091a270d11c8536f2474b31ef46eec594491e` through the GitHub continuation at
`a22f141a1db1fde9efea4f2dd1c0a124f23c2681`. The original eight-file Windows
working state remains recoverable on branch
`codex/prd0062-windows-safety-20260820` at
`b1696d9e24f125bf5ea449850fc75b88ced8b7ed`.

### Eight-file reconciliation classification

| Windows path | Classification | Final disposition |
|---|---|---|
| `cloudflare/package.json` | Already incorporated in `f103cd2e` / `a22f141a` | No duplicate manifest change. |
| `cloudflare/package-lock.json` | Generated dependency noise around the same incorporated dependency | Retained the accepted `a22f141a` lockfile; discarded the accidental root `kahoot` file-link entries after preserving them in the safety commit. |
| `cloudflare/src/upload-worker/book-updates/redo-update.ts` | Unique wanted PRD0062 correction | Preserved the current-projection port's specific conflict code. |
| `cloudflare/test/book-redo-update.test.ts` | Unique wanted PRD0062 proof | Preserved the stale-binding code assertion and retry/idempotency call-count correction. |
| `documentation/tasks/PRD0062/ownership-registry.md` | Unique wanted append-only authority overlay | Preserved; later evidence remains authoritative where more specific. |
| `documentation/tasks/PRD0062/remaining-implementation-reconciliation-2026-08-04.md` | Same authority intent with divergent Windows and later WSL/GitHub chronology | Preserved both append-only histories and explicitly marked the earlier Windows current-live conclusions superseded where they conflict. |
| `documentation/tasks/PRD0062/traceability-book-activity-v1.md` | Unique wanted append-only traceability overlay | Preserved without promoting local proof to deployed or pilot proof. |
| `src/services/book-delivery/bookRedoUpdate.types.ts` | Unique wanted shared port contract | Preserved the optional conflict-code field consumed by the Worker executor. |

### Authoritative environment

```text
Active PRD0062 environment: Windows
Active PRD0062 branch: codex/prd0062-production-normal-20260813-v2
Active PRD0062 checkout: C:\Users\The Lord\Desktop\luyentap-prd0062
GitHub: synchronized to the same HEAD
WSL: historical/reference only
```

Future normal PRD0062 work must use this native Windows lineage. WSL state and
historical worktrees remain preserved for the later donor-ledger phase; this
cutover does not authorize Phase 2 cleanup.

### Current acceptance authority after consolidation

- #126 / 50B remains `BLOCKED_DEPENDENCY_AND_APPROVAL` at the trusted
  teacher-projection and rollback/readback boundary; no assignment replay is
  authorized.
- #127 / 51A is `SOURCE_CONFORMANT_DEFINED_NOT_EXECUTED` through
  `a22f141a1db1fde9efea4f2dd1c0a124f23c2681` and
  `evidence/51A-acceptance-authority-2026-08-17.json`; the definition is
  corrected and semantic validation passes, but this is not final suite
  execution.
- #128 / 51B1 remains `DEFERRED_FINAL_PROOF_HELD_BY_126`. Its #127 definition
  prerequisite is corrected; positive activated acceptance still waits for
  successful #126 activation/readback.

This consolidation is the Windows foundation for completing PRD0062. It does
not claim PRD0062 itself is complete and does not authorize #128, #134, Phase 2,
or cleanup.

## 20. #126 unchanged-lineage local reproduction — 2026-08-23

The exact production-shaped rule-enforced M1 composition was rerun at
`36ce82eb784c02d35e1b499e182e2ebcaca92d9f` through the repository Windows
ARM64 harness. The single Vitest file passed 4/4 tests, including retention of
the committed recipient row when derived completion is unavailable. No
assignment was replayed and no remote state was mutated. The durable record is
`evidence/126-production-normal-local-reproduction-2026-08-23.md`.

This green local result selects no causal source change. The active #126
disposition is `LOCAL_RULE_ENFORCED_PASS_REMOTE_PROOF_BLOCKED`: the remaining
cause must be resolved at the deployed artifact/configuration/claims/rules/
durable-state boundary. Wrangler OAuth reauthorization and an authorized
deployment/readback/browser pass are required before closure. #128 remains
held and the assignment must not be replayed.

## 21. Durable rerun and Git operating contract — 2026-08-23

The exact rule-enforced command was rerun from clean docs-only descendant
`2c77efff`; its test/config blobs are identical to `36ce82eb`. Harness run
`46150346-22d6-40f4-9c3c-726589af7bc0` passed 1/1 files and 4/4 tests with zero
failed/skipped and explicitly retained the committed recipient row when
completion returned 503. Evidence:
`evidence/126-production-normal-rule-enforced-rerun-2026-08-23.json`.

Current Git authority is the canonical Windows database with worktrees at
`C:\Users\The Lord\repos\luyentap` and
`C:\Users\The Lord\repos\luyentap-prd0062`. From Windows or WSL, manage the
PRD worktree only with Git for Windows (`git.exe`). Native WSL Git 2.43 cannot
resolve its Windows absolute pointer and does not support the relative-worktree
extension used by Git 2.55. The supported worktree lock prevents accidental
native-WSL pruning. Full contract:
`evidence/windows-git-operational-contract-2026-08-23.md`.

## 22. #126 bounded production-proof handoff — 2026-08-23

The authorized exact-artifact attempt reached the real teacher, student, and
Runtime browser paths. Teacher trusted-row/progress and student Runtime shell
navigation passed, but the required reference-only/PDF document path returned
HTTP 503 `document_configuration_unavailable`. The exact candidate was not
left active: the deny-only rollback was deployed at 100%, read back, and
verified with a safe 404 probe. Firebase/Firestore rules, Hosting identity, and
the committed assignment/recipient state were preserved.

The remaining blocker is the diagnosed default document-repository environment
composition; no speculative product-source patch or assignment replay was
made. Main remains untouched and clean, the Windows Git/harness authority
remains active, and #128/later tickets remain held. A separate post-#126 task
may evaluate a fresh native-WSL ext4 clone through full burn-in before any
authority change; that evaluation is outside this task.

This §22 handoff supersedes the earlier local-only
`LOCAL_RULE_ENFORCED_PASS_REMOTE_PROOF_BLOCKED` wording in this file. That
wording remains historical pre-deployment context; the current handoff status
is `BLOCKED_ROLLED_BACK` with the rollback and blocker above.
