# Repo Branch Source Of Truth

This policy exists because `origin/main`, local `main`, and backup branches drifted during live-parity work. It defines the boring path after PRD-0049 finishes.

## Branch Roles

- `origin/main` is the deployable source of truth after reconciliation is merged. New work should treat it as canonical only after `npm run branch:doctor` reports no source drift.
- Local `main` mirrors `origin/main`. It is not a private feature branch and should not carry unpushed product work.
- `codex/*` branches are task-scoped implementation branches. They start from the canonical base, keep a narrow diff, and merge through review or an owner-approved equivalent.
- `backup/*` branches are archive and recovery branches. They preserve work but are not a base for normal development.
- `wip/*` branches are temporary work preservation branches. They may be salvaged task by task, but they are not canonical.

## New Worktree Base

After PRD-0049 reconciliation, the allowed base for new feature work is `origin/main` after this check passes:

```bash
npm run branch:doctor
```

If the doctor reports that local `main` and `origin/main` differ, stop and resolve source drift before starting new feature work.

The expected safe shape is:

```bash
git fetch origin main
git worktree add -b codex/<task-slug> ..\luyentap-<task-slug> origin/main
```

## Temporary Exception Before Reconcile

Before PRD-0049 is fully merged, local `main` at `aa9c30aec4c463e7e43444c41247fa627f803d91` is safer than `origin/main` for live-parity work because it contains the modern Writing grading stack that live Hosting already exposes.

This exception ends after the reconciled branch is merged and `origin/main` contains both modern grading and the accepted hotfixes.

## Recovery Procedure

Before destructive branch cleanup, force push, reset, clean, or branch deletion:

1. Create safety tags for `origin/main`, local `main`, backup branch, and active feature branch.
2. Create a full Git bundle outside the repo with `git bundle create <outside-repo-path> --all`.
3. Verify the bundle with `git bundle verify <bundle-path>`.
4. Export dirty tracked changes from the affected worktree to a patch file.
5. Export staged changes separately.
6. Archive untracked WIP outside the repo.
7. Record paths, byte sizes, hashes, commands, and ref SHAs in the task findings file.

No destructive cleanup should happen until those artifacts exist and the owner approves the cleanup.

## Deploy Proof Procedure

For live-source reconciliation or deploy-critical work, record:

- Firebase project and hosting target from `.firebaserc`.
- Hosting public output and rewrites from `firebase.json`.
- Live Hosting site, channel, URL, and latest release time.
- Live JS marker fingerprints for the user-facing feature being protected.
- Exact command output or saved artifact path for the scan.

For Writing grading live parity, the critical markers are `Start Grading`, `Review AI Suggestions`, `writing_grading_ai_cache`, and `AI Suggestions`.
