---
name: handoff-writer
description: Use when the user asks to write, create, save, or prepare a handoff document, continuation note, fresh-agent brief, or next-session handoff. The skill creates a concise handoff file in the OS temporary directory, captures current folder/branch/worktree state, references existing artifacts instead of duplicating them, redacts sensitive data, and suggests skills for the next agent.
---

# Handoff Writer

Use this skill when the user asks for a handoff document or prompt for a fresh agent.

## Output Target

- Save the handoff as a Markdown file in the user's OS temp directory, not the workspace.
- Use a timestamped name such as `handoff-YYYYMMDD-HHMMSS.md`.
- Windows temp path: `$env:TEMP`.
- macOS/Linux temp path: `${TMPDIR:-/tmp}`.
- Write UTF-8.
- Do not mutate repo/workspace files unless the user explicitly asks.

## Required Context

Before writing, capture current state from the active working folder:

```powershell
(Get-Location).Path
git rev-parse --show-toplevel
git branch --show-current
git rev-parse --short HEAD
git status --short --branch
git worktree list --porcelain
```

If not in a Git repo, say so in the handoff and still include current folder.

## Handoff Contents

Include these sections:

1. `# Handoff`
2. `Working Folder`
   - active folder
   - repo root
   - branch
   - HEAD
   - worktree status, including dirty/untracked files summary
   - worktree identity/path from `git worktree list`
3. `Next Session Focus`
   - If the user passed arguments, treat them as the next-session focus and tailor this section.
4. `Current State`
   - Concise state from the conversation.
   - Reference existing PRDs, plans, ADRs, issues, commits, diffs, screenshots, logs, or evidence files by path/URL.
   - Do not duplicate content already captured in those artifacts.
5. `Decisions And Constraints`
   - Include active constraints, scope rules, branch/worktree cautions, and user preferences needed to continue safely.
6. `Remaining Work`
   - Concrete next actions in execution order.
   - Include verification commands only when they are known and relevant.
7. `Suggested Skills`
   - List skills the next agent should invoke, with one-line reasons.
   - Prefer project-local skills when relevant.
   - Include only skills that match the next-session focus.
8. `Sensitive Data Handling`
   - State that secrets/PII were redacted.
   - Use placeholders such as `[REDACTED_API_KEY]`, `[REDACTED_PASSWORD]`, `[REDACTED_EMAIL]`.

## Redaction Rules

Redact:

- API keys, tokens, passwords, private keys, cookies, session IDs, auth headers.
- Personal identifiers not needed for continuation.
- Full secret values in command output, config, logs, URLs, screenshots, or copied text.

Keep non-sensitive technical identifiers exact: file paths, branch names, commit hashes, task IDs, route names, function names, error codes, and test names.

## Style

- Concise, continuation-oriented, and grep-friendly.
- Prefer bullets over prose.
- Say what is verified, what is inferred, and what remains unverified.
- Do not claim work is complete unless verified.
