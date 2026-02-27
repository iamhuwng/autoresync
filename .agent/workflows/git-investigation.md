---
description: Efficient Git investigation patterns for PowerShell (avoids token waste from truncated output)
---

# Git Investigation Workflow (PowerShell)

> **Origin:** On 2026-02-23, investigating the `7b068f1` regression took 15+ tool calls because PowerShell terminal truncated `git log` output. These patterns prevent that waste.

## Problem: PowerShell Truncates Long Git Output

PowerShell wraps/truncates lines at the terminal width (~80 chars). `git log --oneline` commit messages get cut off. Piping to `Out-String`, `Select-Object`, `ForEach-Object` don't fix the underlying width issue. **Do NOT trial-and-error formatting approaches** — use the patterns below directly.

---

## Pattern 1: Short Commit Lists (≤10 commits)

Use `--format` with a separator and short messages:

```powershell
# ✅ FIRST CHOICE — clean and readable
git log --format="%h %s" -10
```

If messages are still truncating, use **pipe to file**:

```powershell
# ✅ Write to temp file, then read with encoding
git log --format="%h %s" -20 | Out-File -FilePath ".\temp_git.txt" -Encoding utf8
Get-Content ".\temp_git.txt"
# Clean up after
Remove-Item ".\temp_git.txt"
```

// turbo-all

---

## Pattern 2: Searching for Specific Commits

```powershell
# Search by commit message keyword
git log --all --format="%h %s" --grep="PRD-0025"

# Search across all branches
git log --all --oneline --grep="keyword"
```

---

## Pattern 3: Check if a Commit Exists

```powershell
# Returns "commit" if valid, error if not
git cat-file -t abc1234
```

---

## Pattern 4: Check Commit Ancestry (Is A ancestor of B?)

```powershell
# Exit code 0 = YES (is ancestor), 1 = NO
git merge-base --is-ancestor <commitA> <commitB>
echo "exit: $LASTEXITCODE"

# Batch check multiple commits at once:
foreach ($c in @("abc1234","def5678","ghi9012")) {
    git merge-base --is-ancestor $c 566b4b7 2>&1 | Out-Null
    echo "$c ancestor=$LASTEXITCODE"
}
```

---

## Pattern 5: Commits Between Two Points

```powershell
# All commits from A to B (chronological order)
git log A..B --format="%h %s" --reverse

# What was the commit directly before X?
git log --format="%h %s" X~1 -1
```

---

## Pattern 6: File-Level Diffs Between Commits

```powershell
# Which files changed? (names only — fast)
git diff --name-only A B

# Which files changed, excluding a folder?
git diff --name-only A B -- ":(exclude)documentation"

# Which files were ADDED (didn't exist in A)?
git diff --diff-filter=A --name-only A B

# Which files were DELETED?
git diff --diff-filter=D --name-only A B

# Summary with line counts
git diff --stat A B | Select-Object -Last 3
```

---

## Pattern 7: View a File from a Specific Commit

```powershell
# View file contents at a specific commit (WITHOUT checking it out)
git show abc1234:path/to/file.tsx

# Save it to a temp file for comparison
git show abc1234:path/to/file.tsx > temp_old_version.tsx
```

---

## Pattern 8: Recover Files from Old Commits

```powershell
# Restore a single file from a specific commit
git checkout abc1234 -- path/to/file.tsx

# Restore everything except documentation
git checkout abc1234 -- .
git checkout HEAD -- documentation/
```

---

## Anti-Patterns (DO NOT DO)

| ❌ Don't | ✅ Do Instead |
|----------|--------------|
| Try multiple `Out-String`, `Select-Object`, `ForEach-Object` combos | Pipe to file immediately if first attempt truncates |
| Use `git log` without `--format` and hope for readable output | Always use `--format="%h %s"` for concise output |
| Run `git log -40` and try to read the wall of text | Use `--grep` to filter, or `-5` to limit |
| Check commit relationships by reading the log visually | Use `git merge-base --is-ancestor` (exact, 1 call) |
| Use `type` or `Get-Content` on non-UTF8 files | Use `Get-Content -Encoding utf8` or `cmd /c type` |
| Make 5+ attempts to format git output | If first format fails, write to file → read file (2 calls max) |

---

## Decision Tree

```
Need git info?
├── "Does commit X exist?" → git cat-file -t X
├── "Is X before Y?" → git merge-base --is-ancestor X Y
├── "What commits are between A and B?" → git log A..B --format="%h %s" --reverse
├── "What files changed between A and B?" → git diff --name-only A B
├── "Find commits about topic Z" → git log --all --grep="Z" --format="%h %s"
├── "See file at old commit" → git show X:path/to/file
└── "Recover file from old commit" → git checkout X -- path/to/file
```
