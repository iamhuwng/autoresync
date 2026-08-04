# Local Main Workspace Safety Plan

Status: approved plan, implementation pending  
Created: 2026-05-16  
Canonical project: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

## Purpose

Prevent Codex, shell commands, deploy commands, or future automation from confusing:

- protected local main: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- noisy sibling worktree: `C:\Users\The Lord\Desktop\luyentap`

This document belongs in the protected project because this checkout is the intended local-main workspace and owns the live deploy command. Codex-State may implement additional app-side workspace guards, but the canonical release invariant lives here.

## Current Live Evidence

Verified on 2026-05-16:

```powershell
git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" status --short --branch
git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" rev-list --left-right --count HEAD...origin/main
```

Result:

```text
## main...origin/main [ahead 7]
7 0
```

Meaning:

- `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased` is the intended local-main worktree.
- It is on branch `main`.
- It tracks `origin/main`.
- It is clean.
- It is currently 7 commits ahead of `origin/main`, so it does not yet satisfy the desired stable invariant `HEAD == origin/main`.

Verified noisy sibling:

```powershell
git -C "C:\Users\The Lord\Desktop\luyentap" status --short --branch
```

Result begins:

```text
## codex/listening-v2
M  .claudian/claudian-settings.json
M  .claudian/sessions/conv-1776834294520-4uy611xga.meta.json
M  .claudian/sessions/conv-1776936067772-47k4aaqmy.meta.json
```

Meaning:

- `C:\Users\The Lord\Desktop\luyentap` is not local main.
- It is on `codex/listening-v2`.
- It is dirty and must not be used for stable deploys or main-sync decisions.

Observed failure class:

- The shell working directory can drift to `C:\Users\The Lord\Desktop\luyentap`.
- Plain `git status`, plain `rg`, and relative paths can therefore report the wrong repo.
- Instruction-only guardrails are not enough; safety must be enforced in commands, npm scripts, and app-side workspace checks.

## Target Invariant

Stable deploy is allowed only when all checks pass:

```text
root == C:\Users\The Lord\Desktop\luyentap-writing-import-rebased
branch == main
upstream == origin/main
remote origin == https://github.com/iamhuwng/autoresync.git
HEAD...origin/main == 0 0
git status --short == empty
Firebase project == temp-a1437
Firebase hosting target == kahut1
Firebase public dir == dist
```

Any mismatch must block deploy and show an explicit reason.

## Threat Model

Main risks:

- Wrong-folder deploy from `C:\Users\The Lord\Desktop\luyentap`.
- Wrong-branch merge or push from a feature branch.
- Local `main` ahead of `origin/main` getting treated as already synced.
- Shell cwd drift causing correct-looking commands to inspect the wrong worktree.
- Codex App or Codex-State workspace setting pointing at `C:\`, `luyentap`, or another stale path.
- Raw `npm run deploy:hosting` bypassing safety checks.
- Future agents relying on folder names instead of verified Git identity.

## Required Guard Layers

### P0: Release Preflight In This Repo

Raw deploy must be guarded in this repository. Replace package deploy with a preflight wrapper:

```json
{
  "scripts": {
    "predeploy:hosting": "node scripts/release-preflight.mjs --hosting",
    "deploy:hosting": "npm run predeploy:hosting && npm run build && node node_modules/firebase-tools/lib/bin/firebase.js deploy --only hosting:kahut1"
  }
}
```

`scripts/release-preflight.mjs` must fail nonzero unless the full target invariant passes.

Current state must fail with:

```text
Blocked: local main is ahead of origin/main by 7 commits.
Push or reconcile origin/main first, then re-run preflight.
```

### P0: Exact-Path Local Main Verifier

Add a repo-side verifier:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\scripts\verify-local-main.ps1"
```

It should:

- ignore shell cwd
- use `git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased"`
- print resolved root, branch, upstream, remote, ahead/behind, dirty count, Firebase target
- exit nonzero on any deploy-blocking mismatch

### P0: Codex-State Protected Workspace Registry

Codex-State can provide app-side protection, but it is secondary to this repo's deploy preflight.

Recommended registry:

```json
{
  "stableLocalMainPath": "C:\\Users\\The Lord\\Desktop\\luyentap-writing-import-rebased",
  "blockedFeaturePaths": [
    "C:\\Users\\The Lord\\Desktop\\luyentap"
  ],
  "requiredBranch": "main",
  "requiredUpstream": "origin/main",
  "requiredRemote": "https://github.com/iamhuwng/autoresync.git",
  "firebaseProject": "temp-a1437",
  "firebaseHostingTarget": "kahut1",
  "firebasePublicDir": "dist"
}
```

Codex-State must resolve Git root from the configured workspace path and compare resolved paths, not raw strings only.

### P0: Codex-State UI Blocking

Codex-State main screen should always show:

- workspace root
- branch
- upstream
- ahead/behind vs `origin/main`
- clean/dirty state
- deploy eligibility

Suggested status labels:

```text
Protected local main: ready
Protected local main: blocked, ahead of origin/main by 7
Blocked feature worktree: C:\Users\The Lord\Desktop\luyentap
Unknown workspace: verify before action
```

### P1: GitHub Main Protection

Remote `main` should be protected:

- no force push
- require pull request before merge
- require status checks
- require branch up to date before merge
- restrict direct pushes if practical

Direct push to `main` should require explicit owner approval and a recorded diff/test/deploy summary.

### P1: CI-Based Live Deploy

Preferred long-term model:

- merge to `origin/main`
- CI builds and deploys Firebase Hosting `kahut1`
- local deploy becomes emergency-only

This removes local cwd drift from the normal deploy path.

### P2: Agent Instruction Reinforcement

Keep instructions short, but add a hard local-main block to the relevant AGENTS scope:

```text
For luyentap release, sync, or deploy work, use only:
C:\Users\The Lord\Desktop\luyentap-writing-import-rebased

Before any git/deploy conclusion, run exact-path verification with git -C.
Never infer state from thread cwd or folder name.
C:\Users\The Lord\Desktop\luyentap is a feature/noisy worktree unless explicitly designated otherwise.
```

This supports the mechanical checks. It must not be the only guard.

## Implementation Checklist

1. Add `scripts\verify-local-main.ps1`.
2. Add `scripts\release-preflight.mjs`.
3. Change `deploy:hosting` to call the preflight first.
4. Add tests for release preflight:
   - correct local-main path passes when synced and clean
   - local-main ahead of origin blocks
   - `C:\Users\The Lord\Desktop\luyentap` blocks
   - wrong branch blocks
   - dirty worktree blocks
   - wrong Firebase target blocks
5. Add Codex-State protected-workspace registry and UI diagnostics.
6. Add GitHub `main` protection.
7. Move normal deploy path to CI when ready.
8. Document emergency override in release notes whenever used.

## Acceptance Checks

Wrong path blocked:

```powershell
git -C "C:\Users\The Lord\Desktop\luyentap" branch --show-current
```

Expected:

```text
codex/listening-v2
```

Deploy preflight must fail if run from or pointed at this path.

Ahead local main blocked:

```powershell
git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" rev-list --left-right --count HEAD...origin/main
```

Current expected:

```text
7 0
```

Deploy preflight must fail until this becomes:

```text
0 0
```

Clean synced local main allowed:

```powershell
git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" status --short
git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" rev-list --left-right --count HEAD...origin/main
```

Expected:

```text

0 0
```

Only then may Firebase Hosting deploy proceed.

## Emergency Override Policy

Emergency local deploy may happen only when the owner explicitly approves it and the log records:

- exact root
- branch
- upstream
- HEAD SHA
- `HEAD...origin/main` count
- dirty status
- Firebase project and target
- reason normal protection was bypassed
- live-site verification result after deploy

No silent override.

## Decision

Build mechanical guardrails first. Do not rely on agent memory, folder naming, or shell cwd. The safe path is exact-path verification plus hard deploy blocking.
