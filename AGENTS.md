## 🔴 Integration Safety Rules (22 rules — ZERO BYPASS)

When your action matches a trigger below, **STOP and READ the linked file** before writing code. Do NOT load all files — only the one that matches.

## Sub-Agents (MANDATORY)

These rules are obligatory and must be treated as standard operating procedure:
- You MUST use subagents liberally to keep the main context window clean.
- You MUST offload research, exploration, and parallel analysis to subagents whenever the work can be decomposed safely.
- For complex, ambiguous, or multi-part problems, you MUST throw more compute at the task via subagents instead of keeping all reasoning in the main thread.
- Each subagent MUST own exactly one tack so execution stays focused and outputs remain composable.

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
| Writing ANY `import` — `@mantine/*` is **banned** | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Writing data to a path where existing code reads | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Creating a new page component or route | [`rules/observability.md`](documentation/rules/observability.md) |
| Adding or modifying user-facing actions (buttons, forms, workflows) | [`rules/observability.md`](documentation/rules/observability.md) |
| Renaming, moving, or deleting a feature/page | [`rules/observability.md`](documentation/rules/observability.md) |
| Writing `localStorage`, `sessionStorage`, or `IndexedDB` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing hooks using `window.*`, `document.*`, `navigator.*` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `dangerouslySetInnerHTML` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `useNavigate()` from `react-router-dom` directly | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `window.innerWidth` or `window.matchMedia()` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Changing student shell layout, responsive styles, headers, tabs, cards, drawers, or right-rail composition | [`rules/student-mobile-design.md`](documentation/rules/student-mobile-design.md) |
| Fixing student mobile overflow, touch targets, stacked actions, or drawer behavior | [`rules/student-mobile-design.md`](documentation/rules/student-mobile-design.md) |
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
| **Plan → Approve → Code** | Share plan, WAIT for approval, then implement |
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
knowns task <id> --plain      # ✓
knowns task list --plain      # ✓
knowns task create --plain    # ✗ ERROR
knowns task edit --plain      # ✗ ERROR
```

### Subtasks

```bash
knowns task create "Sub" --parent 48    # ✓ raw ID
knowns task create "Sub" --parent task-48  # ✗ WRONG
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

---

> **Full reference:** Run `knowns guidelines --plain` for complete documentation
<!-- KNOWNS GUIDELINES END -->
