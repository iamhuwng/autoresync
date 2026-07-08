# Tasks: PRD-0049 - Reconcile Live, Local Main, And Origin Main Source Of Truth

> Goal: make the repo safe and boring again by restoring one clear deployable source of truth, with recovery anchors before any branch cleanup or push.
> Current rule until this task is complete: use local `main` for new live-parity work. Do not base new work on `origin/main` or `backup/wip-preserve-local-changes-20260412`.
> Non-negotiable safety rule: do not run `git reset`, `git clean`, branch deletion, force push, or destructive worktree cleanup until Phase 1 safety artifacts are created and verified.

---

## Current Known State

- `origin/main` is at `ff3e29a` and is missing the modern Writing grading stack.
- Local `main` is at `aa9c30a`, is `82` commits ahead of `origin/main`, and has the modern Writing grading stack.
- `backup/wip-preserve-local-changes-20260412` is at `7112041`, is `104` commits ahead of `origin/main`, and has large WIP/snapshot content.
- `backup/wip-preserve-local-changes-20260412` is not a clean ancestor of local `main`: it has `23` commits local `main` lacks, and local `main` has `1` commit backup lacks.
- Diff from local `main` to backup branch is large: `1250 files changed, 404900 insertions, 5018 deletions`.
- The main `C:\Users\The Lord\Desktop\luyentap` worktree has substantial uncommitted WIP, including Reading V2, Obsidian, output, and package changes.
- Firebase Hosting site `kahut1` live channel was last released on `2026-05-05 02:05:04` and its deployed JS contains modern grading markers including `Start Grading`, `Review AI Suggestions`, and `writing_grading_ai_cache`.

---

## Acceptance Criteria

- [x] Recovery tags exist for `origin/main`, local `main`, backup branch, and current feature branch before any reconcile change.
- [x] A standalone Git bundle exists and can be listed or cloned for recovery.
- [x] Dirty tracked changes from the main worktree are exported to patch files.
- [x] Untracked WIP from the main worktree is archived outside the repo.
- [x] A branch/source-of-truth matrix is documented with SHAs, ahead/behind counts, dirty status, and live hosting evidence.
- [x] A clean reconciliation branch exists from local `main`.
- [x] The four commits present in `origin/main` but absent from local `main` are reviewed and integrated or explicitly rejected with reason.
- [x] Reconciled branch passes agreed verification for app build, Writing grading, Reading hotfixes, and UTF-8.
- [x] `origin/main` is updated only after safety artifacts, verification, and governance checks pass.
- [x] A reusable branch doctor command exists and warns before new work starts from stale or dirty bases.
- [x] Final docs state the new policy: `origin/main` is deployable source of truth, local `main` mirrors it, backup branches are archive only, and feature work starts from `origin/main` after sync.

---

## Relevant Files

### New Files To Create

- `documentation/tasks/findings-of-tasks-0049-reconcile-live-main-source-of-truth.md` - Append-only evidence trail for branch state, safety artifacts, decisions, verification, and rollback notes.
- `scripts/branch-doctor.mjs` - Future helper to report branch/base/live-source drift before new work starts.
- `scripts/__tests__/branch-doctor.test.mjs` - Minimal node:test coverage for branch doctor parsing, warnings, hosting target extraction, and recommendations.
- `documentation/rules/repo-branch-source-of-truth.md` - Future durable policy doc for branch roles, deploy source, worktree creation, and recovery process.

### Existing Files To Inspect Or Modify

- `.firebaserc` - Confirm default project and hosting target.
- `firebase.json` - Confirm hosting target and deploy output path.
- `package.json` - Add a `branch:doctor` script if the helper is implemented.
- `src/components/practice/IELTSPracticeView.tsx` - Listening homework rendering hotfix integration and conflict cleanup.
- `src/pages/StudentPracticePage.test.tsx` - Focused test harness mocks for the listening homework route.
- `src/components/TestEditor.tsx` / `src/components/TestEditor.test.tsx` - Accepted storage quota hotfix.
- `src/utils/readingQuestionContract.ts` / `src/utils/readingQuestionContract.test.ts` - Accepted A-J summary label hotfix.
- `documentation/tasks/process-task-list.md` - Use the tasklist update and findings protocol.
- `documentation/rules/infrastructure.md` - Read before fetch, merge, push, or deploy-related sync work.
- `documentation/rules/codebase-hygiene.md` - Read before broad branch reconciliation or source-of-truth cleanup.

---

## Tasks

### 0. Preflight And Rules

- [x] 0.1 Read `documentation/tasks/process-task-list.md`.
- [x] 0.2 Read `documentation/rules/infrastructure.md` before any fetch, merge, push, or sync command.
- [x] 0.3 Read `documentation/rules/codebase-hygiene.md` before broad branch cleanup or policy changes.
- [x] 0.4 Confirm the active worktree and branch before every command that mutates Git state.
- [x] 0.5 Create or update the findings file after each completed phase.

### 1. No-Loss Recovery Anchors

- [x] 1.1 Create safety tags for current `origin/main`, local `main`, `backup/wip-preserve-local-changes-20260412`, and `codex/writing-homework-import`.
- [x] 1.2 Create a full Git bundle backup with `git bundle create <outside-repo-path> --all`.
- [x] 1.3 Verify the bundle with `git bundle verify <bundle-path>`.
- [x] 1.4 Export dirty tracked changes from `C:\Users\The Lord\Desktop\luyentap` to a patch file.
- [x] 1.5 Export staged changes from `C:\Users\The Lord\Desktop\luyentap` to a separate patch file.
- [x] 1.6 Archive untracked WIP from `C:\Users\The Lord\Desktop\luyentap` outside the repo.
- [x] 1.7 Record exact paths, file sizes, SHAs, and verification output in the findings file.
- [x] 1.8 Stop for owner approval before any cleanup, reset, branch movement, force push, or deletion.

### 2. Branch And Live State Inventory

- [x] 2.1 Record SHAs for `origin/main`, local `main`, `backup/wip-preserve-local-changes-20260412`, `origin/backup/wip-preserve-local-changes-20260412`, `codex/wip-main-sync-20260418`, and current feature branches.
- [x] 2.2 Record ahead/behind counts for every candidate branch against `origin/main` and local `main`.
- [x] 2.3 Record dirty status for each local worktree.
- [x] 2.4 Record live Firebase Hosting sites, channels, last release times, and target mapping from `.firebaserc` and `firebase.json`.
- [x] 2.5 Fingerprint live deployed JS for key markers: `Start Grading`, `Review AI Suggestions`, `writing_grading_ai_cache`, and other live-critical features.
- [x] 2.6 Compare local `main` and backup branch to identify what backup contains beyond local `main`.
- [x] 2.7 Compare `origin/main` and local `main` to identify what remote main lacks.
- [x] 2.8 Document a branch matrix in the findings file.

### 3. Decide Canonical Base

- [x] 3.1 Confirm whether local `main` is the intended live-parity source.
- [x] 3.2 Confirm whether any backup-only work must be preserved in a separate WIP branch, not merged into canonical main.
- [x] 3.3 Confirm whether the four `origin/main` commits missing from local `main` are valid hotfixes to integrate.
- [x] 3.4 Write the chosen source-of-truth policy into the findings file before code or branch movement.
- [x] 3.5 Stop for owner approval before creating the reconcile branch.

### 4. Reconciliation Branch

- [x] 4.1 Create `codex/reconcile-live-main` from local `main`.
- [x] 4.2 Cherry-pick or merge the missing valid `origin/main` commits into the reconcile branch.
- [x] 4.3 Resolve conflicts without pulling in backup WIP or unrelated Obsidian/Reading V2 dirty work.
- [x] 4.4 Run `git status --short --branch` and record intended files only.
- [x] 4.5 Document every included and excluded commit in findings.
- [x] 4.6 Verify whether `ff3e29a` already exists equivalently in local `main`; integrate carefully or explicitly reject with evidence.

### 5. Verification

- [x] 5.1 Run branch/source verification commands and save output in findings.
- [x] 5.2 Run focused Writing grading tests.
- [x] 5.3 Run focused tests for the accepted hotfix commits brought from `origin/main`, with rejected commit rationale documented.
- [x] 5.4 Run `npm run check:utf8 -- <changed text files>`.
- [x] 5.5 Run `git diff --check`.
- [x] 5.6 Start local dev server and browser-check live-critical grading surface if requested or if tests do not cover it.
- [x] 5.7 Record all pass/fail/deferred verification with exact commands.

### 6. Update Remote Main Safely

- [x] 6.1 Stop for owner approval before pushing any branch that changes remote state.
- [x] 6.2 Push `codex/reconcile-live-main`.
- [x] 6.3 Open or prepare PR from `codex/reconcile-live-main` to `main`.
- [x] 6.4 Merge only after safety artifacts and verification are confirmed.
- [x] 6.5 Confirm `origin/main` now contains modern grading and accepted hotfixes.
- [x] 6.6 Confirm local `main` can fast-forward or is reset only after owner-approved backup checks.
- [x] 6.7 Record final SHAs and recovery points in findings.

### 7. Branch Doctor Guardrail

- [x] 7.1 Add `scripts/branch-doctor.mjs`.
- [x] 7.2 Add `npm run branch:doctor`.
- [x] 7.3 Report local `main`, `origin/main`, current branch, ahead/behind counts, dirty status, worktree path, and hosting target.
- [x] 7.4 Warn when local `main` and `origin/main` diverge.
- [x] 7.5 Warn when current branch starts from stale `origin/main`.
- [x] 7.6 Warn when current branch is `backup/*`, `wip/*`, or dirty.
- [x] 7.7 Print a recommended safe worktree command.
- [x] 7.8 Add minimal tests or snapshot fixture for the script if practical.

### 8. Durable Policy Docs

- [x] 8.1 Create `documentation/rules/repo-branch-source-of-truth.md`.
- [x] 8.2 Define branch roles: `origin/main`, local `main`, `codex/*`, `backup/*`, `wip/*`.
- [x] 8.3 Define allowed new-worktree base after reconcile: `origin/main` after `branch:doctor` passes.
- [x] 8.4 Define temporary exception before reconcile: local `main` is the safer base than `origin/main`.
- [x] 8.5 Define recovery procedure: safety tags, bundle, tracked patch, staged patch, untracked archive.
- [x] 8.6 Define deploy proof procedure: hosting channel, release time, and JS marker fingerprint.

### 9. Final Review And Closeout

- [x] 9.1 Re-open this tasklist and verify every completed checkbox has evidence in findings.
- [x] 9.2 Verify no task required destructive cleanup before safety artifacts existed.
- [x] 9.3 Verify no backup WIP was silently merged into canonical main.
- [x] 9.4 Verify `origin/main`, local `main`, and live deploy policy are clear.
- [x] 9.5 Commit docs and scripts with a conventional commit message.
- [x] 9.6 Record residual risks and next owner actions.
