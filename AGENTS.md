## ðŸ”´ Integration Safety Rules (22 rules â€” ZERO BYPASS)

When your action matches a trigger below, **STOP and READ the linked file** before writing code. Do NOT load all files â€” only the one that matches.

## Sub-Agents (MANDATORY)

These rules are obligatory and must be treated as standard operating procedure:
- You MUST use subagents liberally to keep the main context window clean.
- You MUST offload research, exploration, and parallel analysis to subagents whenever the work can be decomposed safely.
- For complex, ambiguous, or multi-part problems, you MUST throw more compute at the task via subagents instead of keeping all reasoning in the main thread.
- Each subagent MUST own exactly one tack so execution stays focused and outputs remain composable.
- When spawning subagents, default to the lowest-cost available model in this environment. As of 2026-04-12, that default is gpt-5.1-codex-mini. Only use a stronger subagent model when the task clearly needs deeper reasoning or a larger context budget.

## Text Encoding Guardrail (MANDATORY)

These rules are obligatory for file creation, conversion, and editing:
- All newly created or edited text files must be UTF-8.
- If a text file is legacy ANSI/Windows-1252, convert it to UTF-8 before further routine editing whenever practical.
- Prefer repo guardrails over ad hoc byte-safe editing: `.editorconfig`, `.gitattributes`, and `npm run check:utf8`.
- Use `npm run check:utf8:staged` for staged changes, `npm run check:utf8:all` for a broader repo scan, and `npm run check:utf8 -- <paths...>` for targeted verification.

## Dev Login Shortcuts (MANDATORY)

When testing authenticated teacher or student flows in this repo:
- Prefer the built-in dev quick-login buttons on the login page before asking for credentials.
- First click the subtle settings icon in the bottom-right corner of the login page to reveal the hidden dev quick-login buttons.
- Use the `Teacher` quick-login button for the teacher dev account (`teacher@test.com`).
- Use the `Student` quick-login button for the student dev account (`student@test.com`).
- Treat these buttons as the default path for browser verification unless the task explicitly requires manual credential entry or a different account.
- If the quick-login buttons fail, check app/runtime configuration first (for example Firebase API key referrer restrictions) before assuming the accounts are broken.

## Google Cloud CLI First (MANDATORY)

When the task involves Google Cloud, Gemini, Vertex AI, Google AI Studio, Google developer APIs, API keys, service enablement, project/account mismatch, IAM, or MCP authentication:
- Prefer `gcloud` as the first diagnostic surface before web research, console clicking, or speculative fixes.
- Start by checking active auth and project context with `gcloud auth list` and `gcloud config get-value project`.
- For API-key problems, inspect restrictions and targets with `gcloud services api-keys list`, `describe`, and `get-key-string` before assuming the key value itself is bad.
- For service availability problems, inspect enablement with `gcloud services list --enabled` before changing code or rotating secrets.
- Load `.agent/skills/google-cloud-cli-first/SKILL.md` and keep the mirrored `.agents/skills/google-cloud-cli-first/SKILL.md` in sync when this rule evolves.

## Feature Merge And Main Refresh Safety (MANDATORY)

When the user says a feature branch/worktree is done and should be merged to `main` or `origin/main`, enforce this workflow.
- Identify the source worktree, source branch, exact source `HEAD`, upstream/tracking branch, and dirty status.
- If the source worktree is dirty, do not merge it directly; first commit, stash, patch, or exclude dirty work with owner approval.
- Fetch `origin main`, then update local `main` with `git merge --ff-only origin/main`; if local `main` has commits not on `origin/main`, stop and report.
- Never start merge work from stale local `main`.
- Merge through a PR by default. Direct push to `main` is allowed only after the user explicitly approves direct push.
- Before PR/direct push, show included commits, changed-file summary, excluded dirty/unrelated work, and focused verification results.
- After `origin/main` changes, fetch `origin main` again and fast-forward local `main` so `main == origin/main`.
- Only after remote and local main match, consider feature cleanup.
- Delete/remove a feature worktree only after verifying its branch commits are reachable from `origin/main`, it has no uncommitted work, and the owner approves deletion.

| When you are... | READ this file |
|----------------|----------------|
| Writing `navigate()`, `<Link>`, redirect URLs, or notification links | [`rules/navigation.md`](documentation/rules/navigation.md) |
| Writing `useEffect` with `setInterval`/`setTimeout` + state deps | [`rules/react-patterns.md`](documentation/rules/react-patterns.md) |
| Creating state initialized as `'pending'` or `'loading'` | [`rules/react-patterns.md`](documentation/rules/react-patterns.md) |
| Creating a new component for use in another page | [`rules/react-patterns.md`](documentation/rules/react-patterns.md) |
| Before `git pull`, `git fetch + merge`, or sync operations | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Adding new RTDB node or Firestore collection | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Writing a service that writes to DB on data events | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Building or modifying Cloudflare Workers (R2, backup, etc.) | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| PRD says "replace ALL", "every", or "replaces existing" | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Writing ANY `import` â€” `@mantine/*` is **banned** | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Writing data to a path where existing code reads | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Creating a new page component or route | [`rules/observability.md`](documentation/rules/observability.md) |
| Adding or modifying user-facing actions (buttons, forms, workflows) | [`rules/observability.md`](documentation/rules/observability.md) |
| Renaming, moving, or deleting a feature/page | [`rules/observability.md`](documentation/rules/observability.md) |
| Writing `localStorage`, `sessionStorage`, or `IndexedDB` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing hooks using `window.*`, `document.*`, `navigator.*` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `dangerouslySetInnerHTML` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `useNavigate()` from `react-router-dom` directly | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `window.innerWidth` or `window.matchMedia()` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Changing student shell layout, routed shell composition, responsive headers, cards/lists, or right-rail structure | [`rules/student-mobile-design.md`](documentation/rules/student-mobile-design.md) |
| Changing student mobile tabs/filters, overlays, touch targets, overflow, or drawer behavior | [`rules/student-mobile-design.md`](documentation/rules/student-mobile-design.md) |
| Changing student shell pages, Academic Record, Library, Homework, Courses, Class Detail, or any student tab/list data-loading path | [`rules/student-data-loading.md`](documentation/rules/student-data-loading.md) |

---

<!-- KNOWNS GUIDELINES START -->
# Knowns Guidelines

> These rules are NON-NEGOTIABLE. Violating them causes data corruption.

## Session Init (Required)

```json
mcp__knowns__detect_projects({})
mcp__knowns__set_project({ "projectRoot": "/path/to/project" })
```

**Skip this = tools fail or work on wrong project.**

---

## Critical Rules

| Rule | Description |
|------|-------------|
| **Never edit .md** | Use MCP tools (preferred) or CLI. NEVER edit task/doc files directly |
| **Docs first** | Read project docs BEFORE planning or coding |
| **Plan â†’ Approve â†’ Code** | Share plan, WAIT for approval, then implement |
| **AC after work** | Only check acceptance criteria AFTER completing work |
| **Time tracking** | `start_time` when taking task, `stop_time` when done |
| **Validate** | Run `validate` before marking task done |
| **appendNotes** | Use `appendNotes` for progress. `notes` REPLACES all (destroys history) |

---

## CLI Pitfalls

### The `-a` flag trap

| Command | `-a` means | NOT this |
|---------|------------|----------|
| `task create/edit` | `--assignee` | ~~acceptance criteria~~ |
| `doc edit` | `--append` | ~~assignee~~ |

```bash
# WRONG - sets assignee to garbage!
knowns task edit 35 -a "Criterion text"

# CORRECT
knowns task edit 35 --ac "Criterion text"
```

### --plain flag

**Only for view/list/search commands:**
```bash
knowns task <id> --plain      # âœ“
knowns task list --plain      # âœ“
knowns task create --plain    # âœ— ERROR
knowns task edit --plain      # âœ— ERROR
```

### Subtasks

```bash
knowns task create "Sub" --parent 48    # âœ“ raw ID
knowns task create "Sub" --parent task-48  # âœ— WRONG
```

---

## References

Tasks and docs can reference each other:

| Type | Format |
|------|--------|
| Task | `@task-<id>` |
| Doc | `@doc/<path>` |
| Template | `@template/<name>` |

**Always follow refs recursively** before planning.

### Skills

- Observability/page-action work: load `.agent/skills/observability-tracking/SKILL.md` so feature registry and tracking stay synchronized.
- Google Cloud, Gemini, Vertex AI, API key, service enablement, or MCP auth troubleshooting: load `.agent/skills/google-cloud-cli-first/SKILL.md` and keep the mirrored `.agents/skills/google-cloud-cli-first/SKILL.md` synchronized.

---

> **Full reference:** Run `knowns guidelines --plain` for complete documentation
<!-- KNOWNS GUIDELINES END -->
