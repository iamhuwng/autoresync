# Windows/WSL Git operational contract — 2026-08-23

Status: `WINDOWS_GIT_AUTHORITATIVE_WSL_GIT_READ_ONLY_FOR_COMMON_DB`

## Authority

`C:\Users\The Lord\repos\luyentap\.git` owns both active worktrees:

- `C:\Users\The Lord\repos\luyentap` — `main`
- `C:\Users\The Lord\repos\luyentap-prd0062` — the continuing PRD0062 branch

The linked PRD worktree uses a Windows absolute `gitdir:` pointer. Git for
Windows 2.55 opens and manages both worktrees correctly. Native WSL Git 2.43
does not understand the Windows drive path in the linked-worktree pointer and
must not manage, repair, prune, or garbage-collect this common database.

From either Windows or WSL, operational Git commands for PRD0062 must use
Git for Windows, for example:

```text
git.exe -C "C:/Users/The Lord/repos/luyentap-prd0062" status --short --branch
```

Native WSL Git may inspect the common database read-only with an explicit
`--git-dir` when needed. It must not run `worktree prune`, `worktree repair`,
`gc`, or other mutating administration against this database.

## Why relative repair is not selected

Git for Windows 2.55 supports relative worktree pointers via
`extensions.relativeWorktrees`. Native WSL Git 2.43 does not recognize that
repository extension. A disposable compatibility probe failed closed under
WSL Git 2.43. Enabling the extension would therefore replace one working
authority with an unreadable common database for the older client.

No Git internals were hand-edited. The supported Windows absolute-pointer
topology is retained.

## Prune guard

The PRD worktree is locked through the supported command:

```text
git.exe -C "C:/Users/The Lord/repos/luyentap" worktree lock --reason "Windows-authoritative worktree; manage with Git for Windows only; do not run native WSL git worktree prune/gc/repair." "C:/Users/The Lord/repos/luyentap-prd0062"
```

The resulting administrative lock makes native WSL
`git worktree prune --dry-run --verbose` produce no removal candidate, while
Git for Windows continues to open both clean worktrees.
